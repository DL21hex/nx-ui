/**
 * El panel de `<nx-jobs>` (se carga con `import()` al apuntar a la píldora o al abrirla): la lista
 * de trabajos con su barra, etapa y tiempo restante, «Recientes» plegado, las acciones y la
 * confirmación en línea, el teclado y la posición junto a la píldora (hoja desde abajo en el celular,
 * por CSS). Quien lo usa le pasa lo que necesita en `JobsPanelCtx`; no importa el elemento.
 */
import { h, safeHref } from "../../core/dom";
import { glyph } from "../../core/icons";
import { resolveLocale } from "../../core/locale";
import { isJobActive, jobFraction, jobLeft, jobsDuration, type JobPace } from "./logic";
import type { Job, JobsLabels } from "./types";

export interface JobsPanelCtx {
  host: HTMLElement;
  pill: HTMLButtonElement;
  pop: HTMLElement;
  labels(): JobsLabels;
  pace: Map<string, JobPace>;
  canceling: Set<string>;
  /** El trabajo cuya cancelación espera confirmación. */
  confirm: string | null;
  /** La fila pintada de cada trabajo, con la clave de lo que no cambia en cada evento. */
  rows: Map<string, [string, HTMLLIElement]>;
  name(j: Job): string;
  pct(f: number): string;
  /** Repinta ya (sin esperar al cuadro). */
  flush(): void;
  cancel(id: string): Promise<void>;
  retry(id: string): unknown;
  dismiss(id: string): unknown;
  hide(): void;
}

export interface JobsPanel {
  paint(active: Job[], recent: Job[]): void;
  place(): void;
  /** Sigue a la píldora al desplazar o cambiar el tamaño; devuelve cómo dejar de hacerlo. */
  follow(): () => void;
}

const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const ICON: Record<string, string> = {
  done: CHECK,
  failed: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  canceled: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
};

const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const text = (el: Element, t: string): void => {
  if (el.textContent !== t) el.textContent = t;
};

export function jobsPanel(c: JobsPanelCtx): JobsPanel {
  const { host, pill, pop } = c;
  const uid = pop.id;
  const h2 = h("h2", { id: `${uid}-h`, tabindex: "-1" });
  const list = h("ol", { class: "nx-jobs__list" });
  const empty = h("p", { class: "nx-jobs__empty" });
  const sum = h("summary");
  const recList = h("ol", { class: "nx-jobs__list" });
  const rec = h("details", { class: "nx-jobs__rec" }, sum, recList);
  pop.setAttribute("aria-labelledby", h2.id);
  pop.replaceChildren(h("header", { class: "nx-jobs__head" }, h2), list, empty, rec);

  const loc = () => resolveLocale(host);
  const num = (n: number) => {
    try {
      return n.toLocaleString(loc());
    } catch {
      return String(n);
    }
  };
  const byKey = (k: string) => [...pop.querySelectorAll<HTMLElement>("[data-k]")].find((el) => el.dataset.k === k);
  const time = (iso: string) => {
    const d = new Date(iso);
    const o: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
    if (d.toDateString() !== new Date().toDateString()) Object.assign(o, { day: "numeric", month: "short" });
    try {
      return d.toLocaleString(loc(), o).replace(/[  ]/g, " ");
    } catch {
      return "";
    }
  };
  const ask = (id: string | null) => {
    const was = c.confirm;
    c.confirm = id;
    c.flush();
    // Confirmar: el foco va a «No» (lo seguro); desistir: vuelve a «Cancelar».
    byKey(id ? `no|${id}` : `cancel|${was}`)?.focus();
  };

  pop.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    // Escape primero deshace la confirmación; después cierra.
    e.preventDefault();
    e.stopPropagation();
    if (c.confirm) ask(null);
    else c.hide(), pill.focus();
  });
  pop.addEventListener("click", (e) => {
    const { act, id } = (e.target as Element).closest<HTMLElement>("[data-act]")?.dataset ?? {};
    if (!id) return;
    if (act === "cancel") ask(id);
    else if (act === "no") ask(null);
    else if (act === "yes") void c.cancel(id).then(() => byKey(`cancel|${id}`)?.focus());
    else if (act === "retry") void c.retry(id);
    else if (act === "dismiss") {
      c.dismiss(id);
      c.flush();
      h2.focus();
    }
  });

  /** Una fila nueva: lo que solo cambia con el estado (título, acciones, resultado). */
  const make = (j: Job): HTMLLIElement => {
    const L = c.labels();
    const { id, status: st } = j;
    const r = j.result ?? {};
    const name = c.name(j);
    const active = isJobActive(j);
    const btn = (act: string, label: string, cls = "") => h("button", { type: "button", class: `nx-jobs__btn ${cls}`.trim(), "data-act": act, "data-id": id, "data-k": `${act}|${id}`, "aria-label": `${label} · ${name}` }, label);
    const link = (href: string | undefined, label: string, k: string, download?: string) => {
      const u = safeHref(href);
      return u ? h("a", { class: "nx-jobs__btn", href: u, download: download ?? (k === "dl" ? "" : null), "data-k": `${k}|${id}`, "aria-label": `${label} · ${name}` }, label) : null;
    };
    const when = active ? j.startedAt : j.finishedAt;
    const meta = [when ? fill(active ? L.started : L.finished, { time: time(when) }) : "", j.by ? fill(L.by, { name: j.by }) : ""].filter(Boolean).join(" · ");
    const errors = r.errors ? fill(r.errors === 1 ? L.errorsOne : L.errorsMany, { n: num(r.errors) }) : "";
    const acts = active
      ? c.confirm === id
        ? [h("p", { class: "nx-jobs__ask" }, fill(L.confirmCancel, { title: name })), btn("yes", L.confirmYes, "is-danger"), btn("no", L.confirmNo)]
        : c.canceling.has(id)
          ? []
          : [btn("cancel", L.cancel)]
      : [
          link(r.download?.url, L.download, "dl", r.download?.name),
          link(r.errorsHref, L.viewErrors, "errors"),
          st === "failed" || r.errors ? btn("retry", r.errors ? L.retryErrors : L.retry, st === "failed" ? "is-primary" : "") : null,
          link(r.href, L.open, "open"),
          btn("dismiss", L.dismiss, "is-quiet"),
        ];
    return h(
      "li",
      { class: "nx-jobs__job", "data-status": st },
      active ? null : glyph(ICON[st]),
      h("p", { class: "nx-jobs__title" }, h("strong", null, name), active ? h("span", { class: "nx-jobs__pct" }) : null),
      active ? h("div", { class: "nx-jobs__bar", role: "progressbar", "aria-label": name, "aria-valuemin": "0", "aria-valuemax": "100" }, h("span")) : null,
      h("p", { class: "nx-jobs__stage" }, active ? "" : [L[st as "done"], errors].filter(Boolean).join(" · ")),
      !active && r.message ? h("p", { class: "nx-jobs__msg" }, r.message) : null,
      meta ? h("p", { class: "nx-jobs__meta" }, meta) : null,
      h("div", { class: "nx-jobs__acts" }, ...acts),
    );
  };

  /** Lo que cambia con cada evento: la barra, el porcentaje, la etapa y lo que falta. */
  const progress = (li: HTMLLIElement, j: Job) => {
    const L = c.labels();
    const f = jobFraction(j);
    const bar = li.querySelector<HTMLElement>(".nx-jobs__bar")!;
    const count = j.done === undefined ? "" : j.total ? fill(L.of, { done: num(j.done), total: num(j.total) }) : num(j.done);
    const left = j.total ? jobLeft(c.pace.get(j.id)) : null;
    const dur = (long: boolean) => {
      if (left === null) return "";
      const t = jobsDuration(left, loc(), long);
      return t ? fill(long ? L.leftLong : L.left, { t }) : L.soon;
    };
    const stage = c.canceling.has(j.id) ? L.canceling : j.status === "queued" ? L.queued : (j.stage ?? L.running);
    text(li.querySelector(".nx-jobs__stage")!, [stage, count, dur(false)].filter(Boolean).join(" · "));
    text(li.querySelector(".nx-jobs__pct")!, f === null ? "" : c.pct(f));
    bar.hidden = j.status === "queued";
    bar.toggleAttribute("data-ind", f === null);
    bar.style.setProperty("--p", `${(f ?? 0) * 100}%`);
    if (f === null) bar.removeAttribute("aria-valuenow");
    else bar.setAttribute("aria-valuenow", String(Math.round(f * 100)));
    bar.setAttribute("aria-valuetext", [count || stage, dur(true)].filter(Boolean).join(", "));
  };

  const row = (j: Job): HTMLLIElement => {
    const key = JSON.stringify([j.status, j.title, j.by, j.startedAt, j.finishedAt, j.result, c.confirm === j.id, c.canceling.has(j.id), loc()]);
    const had = c.rows.get(j.id);
    const li = had?.[0] === key ? had[1] : make(j);
    c.rows.set(j.id, [key, li]);
    if (isJobActive(j)) progress(li, j);
    return li;
  };

  const place = () => {
    const r = pill.getBoundingClientRect();
    const de = document.documentElement;
    const vw = de.clientWidth;
    const w = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const below = de.clientHeight - r.bottom - 8;
    // Hacia donde hay más pantalla: alineado a la derecha de la píldora si está en la mitad derecha.
    const left = r.left + r.width / 2 > vw / 2 ? r.right - w : r.left;
    const top = ph > below && r.top > below ? Math.max(8, r.top - 8 - ph) : r.bottom + 8;
    Object.assign(pop.style, { left: `${Math.max(8, Math.min(left, vw - w - 8))}px`, top: `${top}px` });
  };

  return {
    paint(active, recent) {
      const L = c.labels();
      text(h2, L.heading);
      text(empty, L.empty);
      empty.hidden = active.length > 0;
      rec.hidden = !recent.length;
      text(sum, `${L.recent} (${num(recent.length)})`);
      const k = (document.activeElement as HTMLElement | null)?.closest?.("[data-k]")?.getAttribute("data-k");
      const seen = new Set<string>();
      for (const [ol, jobs] of [
        [list, active],
        [recList, recent],
      ] as const) {
        const lis = jobs.map((j) => (seen.add(j.id), row(j)));
        if (lis.length !== ol.children.length || lis.some((li, i) => ol.children[i] !== li)) ol.replaceChildren(...lis);
      }
      for (const id of c.rows.keys()) if (!seen.has(id)) c.rows.delete(id);
      // Si la fila con el foco se rehízo, el foco vuelve a lo mismo; si ya no está, al título.
      if (k && !pop.contains(document.activeElement)) (byKey(k) ?? h2).focus({ preventScroll: true });
    },
    place,
    follow() {
      let raf = 0;
      const onMove = (e: Event) => {
        if (!(e.target instanceof Node && pop.contains(e.target)) && !raf) raf = requestAnimationFrame(() => ((raf = 0), place()));
      };
      addEventListener("scroll", onMove, { capture: true, passive: true });
      addEventListener("resize", onMove, { passive: true });
      return () => {
        cancelAnimationFrame(raf);
        removeEventListener("scroll", onMove, { capture: true });
        removeEventListener("resize", onMove);
      };
    },
  };
}
