/**
 * El contenido del panel de `<nx-account>`: la vista principal, las sub-vistas (empresa/sede,
 * idioma y formatos, «Ver como…»), el teclado y la posición. Es un módulo aparte que se trae con
 * `import()` cuando la página queda libre, o antes si la persona apunta a la tarjeta: así la
 * entrada solo lleva la tarjeta, la sesión y las acciones.
 *
 * Aquí no hay estado de la cuenta: la vista principal se pinta con lo que le pasa el elemento
 * (`PanelState`) y cada botón lleva su `data-k` (el elemento atiende los clics). Las sub-vistas sí
 * guardan lo suyo (lo que se escribe, la búsqueda de personas) y avisan con `pick`.
 */
import { h, safeEndpoint, safeHref, safeImageSrc } from "../../core/dom";
import { glyph, icon } from "../../core/icons";
import { canonicalLocale } from "../../core/locale";
import { accountInitials, cleanPerson, tenantLine, tenantSections } from "./logic";
import type { AccountItem, AccountLabels, AccountLocale, AccountPalette, AccountPerson, AccountStatus, AccountTenant, AccountTheme, AccountUser } from "./types";

const UPDOWN = '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>';
const BUILDING = '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16m0-12h3a1 1 0 0 1 1 1v11M2 21h20M8 7h4m-4 4h4m-4 4h4"/>';
const SUN = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
const MOON = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9"/>';
const MONITOR = '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8m-4-4v4"/>';
const GLOBE = '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>';
const KEYS = '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>';
const EYE = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>';
const LOCK = '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
const EXIT = '<path d="m16 17 5-5-5-5m5 5H9m0 9H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const DEBOUNCE_MS = 250;
/** Los mismos puntos de corte que `account.css` y el drawer de `<nx-sidemenu>`. */
const MOBILE = "(max-width: 767.98px)";
const COLLAPSED = '[collapsed]:not([collapsed="false"],[popover])';

/** Lo que la vista principal necesita saber (todo lo decide el elemento). */
export interface PanelState {
  uid: string;
  labels: AccountLabels;
  /** El avatar grande, ya armado (el mismo que el de la tarjeta). */
  avatar: Node;
  user: AccountUser | null;
  tenant: AccountTenant | undefined;
  hasTenants: boolean;
  status: AccountStatus;
  until: string;
  theme: AccountTheme;
  palette: string;
  palettes: readonly AccountPalette[];
  items: readonly AccountItem[];
  locale: string;
  viewAs: AccountPerson | null;
  viewAsSource: boolean;
  lock: boolean;
  /** La franja de la sesión (si está por vencer), arriba de todo. */
  strip: Node | null;
  /** Cerrando sesión con cambios en cola: el texto ya armado. */
  leaving: { text: string; stuck: boolean } | null;
}

const row = (k: string, g: string, label: string, hint?: string | null, more = false, cls = "") =>
  h(
    "button",
    { type: "button", class: `nx-account__item${cls}`, "data-k": k },
    glyph(g),
    h("span", { class: "nx-account__label" }, label),
    hint ? h("span", { class: "nx-account__hint" }, hint) : null,
    more ? glyph("chevron", "nx-account__more") : null,
  );

/** Un grupo de opciones excluyentes (estado, hasta, tema): botones con `aria-pressed`. */
function seg(uid: string, name: string, label: string, opts: [string, string, string?][], current: string): HTMLElement {
  const id = `${uid}-${name}`;
  return h(
    "div",
    { class: "nx-account__field" },
    h("span", { class: "nx-account__caption", id }, label),
    h(
      "div",
      { class: `nx-account__seg nx-account__seg--${name}`, role: "group", "aria-labelledby": id },
      ...opts.map(([value, text, g]) =>
        h(
          "button",
          { type: "button", "data-k": `${name}:${value}`, "aria-pressed": String(value === current) },
          g ? glyph(g) : name === "status" ? h("span", { class: "nx-account__dot", "data-s": value }) : null,
          h("span", null, text),
        ),
      ),
    ),
  );
}

/** La vista principal, en el orden acordado: quién, empresa, estado, tema, color, enlaces, idioma,
 *  atajos, ver como, bloquear y cerrar sesión. */
export function mainView(s: PanelState): Node[] {
  const L = s.labels;
  const t = s.tenant;
  const line = t && tenantLine(t);
  const mod = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl";
  const nodes: (Node | null | false)[] = [
    s.strip,
    h(
      "div",
      { class: "nx-account__head" },
      s.avatar,
      h("div", { class: "nx-account__who" }, h("p", { class: "nx-account__big" }, s.user?.name ?? L.account), s.user?.email ? h("p", { class: "nx-account__mail" }, s.user.email) : null),
    ),
    s.hasTenants &&
      h(
        "button",
        { type: "button", class: "nx-account__tenant", "data-k": "tenant", "aria-label": `${L.tenant}: ${t ? [t.name, line].filter(Boolean).join(", ") : ""}` },
        glyph(BUILDING),
        h("span", { class: "nx-account__text" }, h("span", { class: "nx-account__name" }, t?.name ?? L.tenant), line ? h("span", { class: "nx-account__org" }, line) : null),
        glyph(UPDOWN, "nx-account__chev"),
      ),
    seg(s.uid, "status", L.status, [["online", L.online], ["away", L.away], ["dnd", L.dnd]], s.status),
    s.status !== "online" && seg(s.uid, "until", L.until, [["hour", L.hour], ["today", L.today], ["", L.forever]], s.until),
    seg(s.uid, "theme", L.theme, [["light", L.light, SUN], ["system", L.system, MONITOR], ["dark", L.dark, MOON]], s.theme),
    h(
      "div",
      { class: "nx-account__field" },
      h("span", { class: "nx-account__caption", id: `${s.uid}-color` }, L.color),
      h(
        "div",
        { class: "nx-account__swatches", role: "group", "aria-labelledby": `${s.uid}-color` },
        // Sin `color`, la muestra lleva su propio `data-nx-palette`: los tokens la pintan con esa paleta.
        ...s.palettes.map((p) =>
          h("button", {
            type: "button",
            class: "nx-account__sw",
            "data-k": `palette:${p.id}`,
            "data-palette": p.id,
            "data-nx-palette": p.color ? null : p.id,
            style: p.color ? `--_sw:${p.color}` : null,
            "aria-label": p.label,
            title: p.label,
            "aria-pressed": String(p.id === s.palette),
          }),
        ),
      ),
    ),
    h("hr"),
    ...s.items.map((it) => {
      const href = safeHref(it.href);
      const body = [it.icon ? icon(it.icon, it.label) : glyph(""), h("span", { class: "nx-account__label" }, it.label), it.hint ? h("span", { class: "nx-account__hint" }, it.hint) : null];
      const a = { class: "nx-account__item", "data-k": `item:${it.id}` };
      return href ? h("a", { ...a, href }, ...body) : h("button", { ...a, type: "button" }, ...body);
    }),
    row("locale", GLOBE, L.language, s.locale, true),
    row("shortcuts", KEYS, L.shortcuts, "Alt"),
    s.viewAs ? row("viewas", EYE, L.stopViewAs.replace("{name}", s.viewAs.name)) : s.viewAsSource && row("viewas", EYE, L.viewAs, null, true),
    s.lock && row("lock", LOCK, L.lock, `${mod} L`),
    h("hr"),
    s.leaving &&
      h(
        "div",
        { class: "nx-account__leaving", "data-stuck": s.leaving.stuck ? "" : null },
        h("p", null, s.leaving.text),
        h("button", { type: "button", class: "nx-account__anyway", "data-k": "anyway" }, L.logoutAnyway),
      ),
    row("logout", EXIT, L.logout, null, false, " nx-account__item--danger"),
  ];
  return nodes.filter((n): n is Node => !!n);
}

/** Arriba de la tarjeta (o a la derecha del riel compacto), dentro de la ventana; hacia abajo si
 *  arriba no cabe. En móvil el CSS lo vuelve una hoja desde abajo y aquí no se toca. */
export function placePanel(pop: HTMLElement, card: HTMLElement, host: HTMLElement): void {
  const s = pop.style;
  s.left = s.top = s.bottom = s.maxBlockSize = "";
  if (matchMedia(MOBILE).matches) return;
  const r = card.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const rail = host.closest("nx-sidemenu");
  const side = !!rail?.matches(COLLAPSED);
  const up = side || r.top > vh - r.bottom;
  const edge = side ? r.bottom : r.top - 6;
  s.left = `${Math.max(8, Math.min(side ? rail!.getBoundingClientRect().right + 8 : r.left, vw - (pop.offsetWidth || 320) - 8))}px`;
  if (up) s.bottom = `${Math.max(8, vh - edge)}px`;
  else s.top = `${r.bottom + 6}px`;
  s.maxBlockSize = `${Math.max(200, up ? edge - 8 : vh - r.bottom - 14)}px`;
}

/**
 * ↑/↓ (Inicio/Fin) entre las filas del panel, donde un grupo (estado, tema, color) cuenta como una
 * sola parada, la opción elegida; ←/→ dentro del grupo. En el buscador, Inicio/Fin son del texto.
 */
export function panelKeys(e: KeyboardEvent, pop: HTMLElement): void {
  const t = e.target as HTMLElement;
  const group = t.closest('[role="group"]');
  if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && group) {
    const btns = [...group.querySelectorAll<HTMLElement>("button")];
    const step = (e.key === "ArrowRight") !== (getComputedStyle(pop).direction === "rtl") ? 1 : -1;
    e.preventDefault();
    btns[(btns.indexOf(t) + step + btns.length) % btns.length]?.focus();
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key) || (t instanceof HTMLInputElement && (e.key === "Home" || e.key === "End"))) return;
  const stops = [...pop.querySelectorAll<HTMLElement>("button:not([disabled]), a[href], input")].filter((b) => {
    const g = b.closest('[role="group"]');
    return !g || b === (g.querySelector('[aria-pressed="true"]') ?? g.querySelector("button"));
  });
  const here = group ? stops.findIndex((s) => s.closest('[role="group"]') === group) : stops.indexOf(t);
  const n = stops.length;
  e.preventDefault();
  stops[e.key === "Home" ? 0 : e.key === "End" ? n - 1 : e.key === "ArrowDown" ? (here + 1) % n : (here - 1 + n) % n]?.focus();
}

// ---------------------------------------------------------------- sub-vistas

export interface AccountViewOptions {
  kind: "tenant" | "locale" | "viewas";
  uid: string;
  labels: AccountLabels;
  tenants: readonly AccountTenant[];
  recent: readonly string[];
  current: string | null;
  locales: readonly AccountLocale[];
  /** El locale de la página (el que va marcado). */
  locale: string;
  /** `view-as-source`: `GET {source}?q=` → `[{id, name, role?, avatar?}]`. */
  source: string | null;
  /** Elegir: el id de la empresa, el locale o la persona. */
  pick(value: string, person?: AccountPerson): void;
}

export interface AccountView {
  root: HTMLElement;
  focus(): void;
  /** Corta lo que esté en curso (la búsqueda de personas). */
  stop(): void;
}

/** «1.234.567,50 · 26 sept 2026» / «1,234,567.50 · Sep 26, 2026»: cómo se verán los números y las
 *  fechas con ese locale (la forma corta de tabla, sin «de», como `nxFormat().date`). */
export function localeSample(loc: string, date = new Date()): string {
  try {
    const n = new Intl.NumberFormat(loc, { minimumFractionDigits: 2 }).format(1234567.5);
    const d = new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", year: "numeric" }).format(date);
    return `${n} · ${d.replace(/ de /g, " ")}`.replace(/[  ]/g, " ");
  } catch {
    return "";
  }
}

/**
 * Una sub-vista: encabezado enfocable con «Volver» (el panel atiende Esc y ese botón), buscador
 * (salvo idioma) y una lista de botones. 1–9 elige la fila de ese número mientras el buscador esté
 * vacío o el foco en la lista; el número se ve discreto al final de la fila, sin anunciarlo.
 */
export function accountView(o: AccountViewOptions): AccountView {
  const L = o.labels;
  const hid = `${o.uid}-h`;
  const title = o.kind === "tenant" ? L.tenant : o.kind === "locale" ? L.language : L.viewAs.replace(/…$/, "");
  // Sin `role="group"`: el panel trata cada grupo como una sola parada de ↑/↓, y aquí cada fila es una.
  const list = h("div", { class: "nx-account__list" });
  const input = o.kind === "locale" ? null : h("input", { type: "search", "aria-label": L.search, placeholder: L.search, autocomplete: "off", spellcheck: "false", "data-nx-ephemeral": "" });
  const root = h(
    "div",
    { class: "nx-account__subview" },
    h(
      "div",
      { class: "nx-account__sub" },
      h("button", { type: "button", class: "nx-account__back", "data-k": "back", "aria-label": L.back, title: L.back }, glyph("back")),
      h("h2", { id: hid, tabindex: "-1" }, title),
    ),
    input && h("div", { class: "nx-account__search" }, glyph("search"), input),
    list,
  );
  let people: AccountPerson[] = [];
  let state: "" | "loading" | "error" = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ac: AbortController | undefined;

  const option = (value: string, main: string, sub: string | undefined, current: boolean, n: number, lead?: Node) =>
    h(
      "button",
      { type: "button", class: "nx-account__opt", "data-v": value, "aria-current": current ? "true" : null },
      lead ?? null,
      h("span", { class: "nx-account__text" }, h("span", { class: "nx-account__name" }, main), sub ? h("span", { class: "nx-account__org" }, sub) : null),
      current ? glyph(CHECK, "nx-account__check") : n < 10 ? h("span", { class: "nx-account__n", "aria-hidden": "true" }, String(n)) : null,
    );

  const paint = () => {
    const rows: Node[] = [];
    let n = 0;
    if (o.kind === "tenant") {
      for (const s of tenantSections(o.tenants, { query: input!.value, recent: o.recent, recentLabel: L.recent, current: o.current })) {
        if (s.group) rows.push(h("p", { class: "nx-account__group" }, s.group));
        for (const t of s.items) {
          // Dentro del grupo de su empresa, la sede es lo que distingue una fila de otra.
          const same = s.group === t.name && t.detail;
          rows.push(option(t.id, same ? t.detail! : t.name, same ? t.role : tenantLine(t), t.id === o.current, ++n));
        }
      }
    } else if (o.kind === "locale") {
      for (const l of o.locales) rows.push(option(l.value, l.label, localeSample(l.value), canonicalLocale(l.value) === o.locale, ++n));
    } else {
      people.forEach((p, i) => {
        const src = safeImageSrc(p.avatar);
        const av = h("span", { class: "nx-account__av", "aria-hidden": "true" }, src ? h("img", { src, alt: "", referrerpolicy: "no-referrer" }) : accountInitials(p));
        rows.push(option(String(i), p.name, p.role, false, ++n, av));
      });
      if (!rows.length && state) rows.push(h("p", { class: "nx-account__empty" }, state === "loading" ? L.loading : L.error));
    }
    if (!rows.length) rows.push(h("p", { class: "nx-account__empty" }, L.empty));
    list.toggleAttribute("aria-busy", state === "loading");
    list.replaceChildren(...rows);
  };

  /** Personas del servidor, en su orden (él sabe quién es más relevante). */
  const load = async () => {
    const ctrl = (ac = new AbortController());
    try {
      const safe = safeEndpoint(o.source);
      if (!safe) throw new Error("source");
      const url = new URL(safe, location.href);
      url.searchParams.set("q", input!.value.trim());
      const res = await fetch(url, { signal: ctrl.signal, credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as unknown;
      people = (Array.isArray(data) ? data : []).map(cleanPerson).filter((p): p is AccountPerson => !!p).slice(0, 50);
      state = "";
    } catch {
      if (ctrl.signal.aborted) return;
      people = [];
      state = "error";
    }
    paint();
  };
  const search = (now: boolean) => {
    clearTimeout(timer);
    ac?.abort();
    state = "loading";
    paint();
    timer = setTimeout(load, now ? 0 : DEBOUNCE_MS);
  };

  input?.addEventListener("input", () => (o.kind === "viewas" ? search(false) : paint()));
  list.addEventListener("click", (e) => {
    const v = (e.target as Element).closest<HTMLElement>("[data-v]")?.dataset.v;
    if (v === undefined) return;
    const p = people[Number(v)];
    if (o.kind === "viewas") o.pick(p.id, p);
    else o.pick(v);
  });
  root.addEventListener("keydown", (e) => {
    if (!/^[1-9]$/.test(e.key) || e.ctrlKey || e.metaKey || e.altKey || (input && e.target === input && input.value)) return;
    const b = list.querySelectorAll<HTMLElement>("[data-v]")[Number(e.key) - 1];
    if (!b) return;
    e.preventDefault();
    b.click();
  });

  if (o.kind === "viewas") search(true);
  else paint();
  return {
    root,
    focus: () => (input ?? list.querySelector<HTMLElement>("[aria-current]") ?? root.querySelector("h2"))!.focus({ preventScroll: true }),
    stop: () => {
      clearTimeout(timer);
      ac?.abort();
    },
  };
}
