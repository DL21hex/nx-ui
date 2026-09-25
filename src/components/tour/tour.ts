/**
 * `nxTour()`: un recorrido guiado sobre la página de verdad. Cada paso señala un elemento (lo
 * ilumina y oscurece lo demás) con un título y un texto; se avanza con Enter o →, se vuelve con ←
 * y Escape termina. Lo usa `<nx-agent>` (herramienta `nx_tour`: «muéstrame cómo…») y cualquier
 * app para su bienvenida:
 *
 *   await nxTour([
 *     { target: "#nuevo", title: "Crea un pedido", text: "Empieza aquí." },
 *     { target: "[data-tour=filtros]", title: "Filtra", text: "Escribe en tus palabras." },
 *   ]);
 *
 * Solo muestra: no hace clic ni cambia nada. Un paso cuyo elemento no existe se muestra centrado.
 */
import { h } from "../../core/dom";
import { glyph } from "../../core/icons";
import type { TourLabels, TourResult, TourStep } from "./types";

export const TOUR_LABELS: TourLabels = {
  next: "Siguiente",
  back: "Anterior",
  done: "Listo",
  close: "Terminar el recorrido",
  step: "{i} de {n}",
};

const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const PAD = 6;

/** Los pasos válidos (con título), sin lo que no es suyo. */
export function cleanSteps(v: unknown): TourStep[] {
  if (!Array.isArray(v)) return [];
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
  return v
    .map((s) => (s && typeof s === "object" ? (s as Record<string, unknown>) : null))
    .filter((s): s is Record<string, unknown> => !!s && !!str(s.title))
    .map((s) => ({ target: str(s.target), title: String(s.title), text: str(s.text) }));
}

/** El elemento de un paso, si existe y se ve. Un selector inválido no rompe nada. */
export function findTarget(target: string | undefined, root: ParentNode = document): HTMLElement | null {
  if (!target) return null;
  try {
    const el = root.querySelector<HTMLElement>(target);
    return el && el.getClientRects().length ? el : null;
  } catch {
    return null;
  }
}

let active: (() => void) | null = null;

/** Muestra el recorrido. La promesa dice si se llegó al final y cuál fue el último paso visto. */
export function nxTour(steps: TourStep[], labels: Partial<TourLabels> = {}): Promise<TourResult> {
  const list = cleanSteps(steps);
  if (typeof document === "undefined" || !list.length) return Promise.resolve({ completed: false, step: -1 });
  active?.();
  const L = { ...TOUR_LABELS, ...labels };
  const back = document.activeElement as HTMLElement | null;
  const reduced = matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const spot = h("div", { class: "nx-tour__spot", "aria-hidden": "true" });
  const title = h("h2", { class: "nx-tour__title", id: "nx-tour-t" });
  const text = h("p", { class: "nx-tour__text" });
  const count = h("span", { class: "nx-tour__count" });
  const prev = h("button", { type: "button", class: "nx-tour__btn", "data-t": "back" }, L.back);
  const next = h("button", { type: "button", class: "nx-tour__btn nx-tour__btn--primary", "data-t": "next" });
  const card = h(
    "div",
    { class: "nx-tour__card", role: "dialog", "aria-modal": "true", "aria-labelledby": "nx-tour-t", tabindex: "-1" },
    h("button", { type: "button", class: "nx-tour__x", "data-t": "close", "aria-label": L.close }, glyph(X)),
    title,
    text,
    h("div", { class: "nx-tour__foot" }, count, prev, next),
  );
  const root = h("div", { class: "nx-tour", popover: "manual" }, spot, card);
  document.body.append(root);
  root.showPopover?.();

  let i = 0;
  let seen = 0;
  let target: HTMLElement | null = null;
  let raf = 0;

  /** La luz sobre el elemento y la tarjeta a su lado (o centrada, si no hay elemento). */
  const place = () => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    if (!target) {
      spot.hidden = true;
      Object.assign(card.style, { left: `${Math.max(8, (vw - cw) / 2)}px`, top: `${Math.max(8, (vh - ch) / 2)}px` });
      return;
    }
    const r = target.getBoundingClientRect();
    spot.hidden = false;
    Object.assign(spot.style, { left: `${r.left - PAD}px`, top: `${r.top - PAD}px`, width: `${r.width + PAD * 2}px`, height: `${r.height + PAD * 2}px` });
    // Debajo del elemento; arriba si no cabe; al lado si tampoco.
    let top = r.bottom + PAD + 10;
    if (top + ch > vh - 8) top = r.top - PAD - 10 - ch;
    if (top < 8) top = Math.min(Math.max(8, r.top), vh - ch - 8);
    const left = Math.min(Math.max(8, r.left + r.width / 2 - cw / 2), vw - cw - 8);
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
  };
  const onMove = () => {
    if (!raf) raf = requestAnimationFrame(() => ((raf = 0), place()));
  };

  const show = (n: number) => {
    i = Math.max(0, Math.min(list.length - 1, n));
    seen = Math.max(seen, i);
    const s = list[i];
    target = findTarget(s.target);
    title.textContent = s.title;
    text.textContent = s.text ?? "";
    text.hidden = !s.text;
    count.textContent = L.step.replace("{i}", String(i + 1)).replace("{n}", String(list.length));
    prev.hidden = i === 0;
    next.textContent = i === list.length - 1 ? L.done : L.next;
    card.classList.remove("is-in");
    void card.offsetWidth;
    card.classList.add("is-in");
    target?.scrollIntoView({ block: "center", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    place();
    // Tras el desplazamiento suave, otra vez en su lugar.
    setTimeout(place, reduced ? 0 : 350);
    card.focus({ preventScroll: true });
  };

  return new Promise<TourResult>((resolve) => {
    const end = (completed: boolean) => {
      removeEventListener("scroll", onMove, true);
      removeEventListener("resize", onMove);
      document.removeEventListener("keydown", onKey, true);
      cancelAnimationFrame(raf);
      root.hidePopover?.();
      root.remove();
      active = null;
      if (back?.isConnected) back.focus({ preventScroll: true });
      resolve({ completed, step: seen });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end(false);
      else if (e.key === "ArrowRight" || (e.key === "Enter" && !(e.target as Element).closest?.("button"))) {
        if (i === list.length - 1) end(true);
        else show(i + 1);
      } else if (e.key === "ArrowLeft") show(i - 1);
      else if (e.key === "Tab") {
        // El foco se queda en la tarjeta.
        const f = [...card.querySelectorAll<HTMLElement>("button:not([hidden])")];
        const at = f.indexOf(document.activeElement as HTMLElement);
        f[(at + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    card.addEventListener("click", (e) => {
      const t = (e.target as Element).closest<HTMLElement>("[data-t]")?.dataset.t;
      if (t === "close") end(false);
      else if (t === "back") show(i - 1);
      else if (t === "next") i === list.length - 1 ? end(true) : show(i + 1);
    });
    addEventListener("scroll", onMove, { capture: true, passive: true });
    addEventListener("resize", onMove, { passive: true });
    document.addEventListener("keydown", onKey, true);
    active = () => end(false);
    show(0);
  });
}
