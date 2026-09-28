/**
 * `<nx-thread>`: los campos anclables de la página y sus globitos. Se carga con `import()` solo si
 * la página tiene campos con `data-thread` (o el hilo trae `anchors`).
 *
 * El globito es un botón propio que se inserta junto a la etiqueta del campo (después de un
 * `<label for>` que no lo envuelve) o, si la etiqueta lo envuelve o no la hay, después del campo:
 * nunca dentro de un `<label>` (su nombre accesible se sumaría al del campo) y sin mover nada del
 * autor, como los avisos de `<nx-guard>`.
 */
import { h } from "../../core/dom";
import { glyph } from "../../core/icons";
import type { ThreadLabels } from "./types";

export interface ThreadField {
  key: string;
  label: string;
  el: HTMLElement;
}

const MSG = '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>';
const fill = (s: string, o: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in o ? String(o[k]) : m));

/** Cómo se llama un campo: `data-thread-label`, `aria-label`, el texto de su `<label>` (sin los controles), o la clave. */
function labelOf(el: HTMLElement, key: string): string {
  let t = el.dataset.threadLabel || el.getAttribute("aria-label");
  const lab = (el as HTMLInputElement).labels?.[0] ?? el.closest("label");
  if (!t && lab) {
    const copy = lab.cloneNode(true) as HTMLElement;
    for (const n of copy.querySelectorAll("input, select, textarea, button")) n.remove();
    t = copy.textContent;
  }
  return t?.replace(/\s+/g, " ").replace(/[\s*:]+$/, "").trim() || key;
}

/** Los campos anclables de `scope`: `[data-thread]` y los de `anchors` (un `name` simple o un selector). */
export function threadFields(scope: ParentNode, anchors: readonly string[], self: Element): ThreadField[] {
  const out: ThreadField[] = [];
  const add = (el: HTMLElement | null, key: string | undefined) => {
    if (el && key && !self.contains(el) && !out.some((f) => f.key === key || f.el === el)) out.push({ key, label: labelOf(el, key), el });
  };
  for (const el of scope.querySelectorAll<HTMLElement>("[data-thread]")) add(el, el.dataset.thread?.trim());
  for (const s of anchors) {
    let el: HTMLElement | null = null;
    try {
      el = scope.querySelector<HTMLElement>(/^[\w.-]+$/.test(s) ? `[name="${s}"]` : s);
    } catch {
      /* selector inválido */
    }
    add(el, el?.dataset.thread?.trim() || el?.getAttribute("name") || s);
  }
  return out;
}

/**
 * Pone (o actualiza en su lugar) el globito de cada campo, con los comentarios abiertos sobre él,
 * y quita los de campos que ya no están. `pins` es la memoria del hilo (clave → botón).
 */
export function threadPins(pins: Map<string, HTMLButtonElement>, fields: readonly ThreadField[], counts: ReadonlyMap<string, number>, filter: string | null, L: ThreadLabels, onClick: (key: string) => void): void {
  const keep = new Set<string>();
  for (const f of fields) {
    keep.add(f.key);
    let pin = pins.get(f.key);
    if (!pin) {
      pin = h("button", { type: "button", class: "nx-thread__pin", "data-key": f.key }, glyph(MSG), h("span"));
      pin.addEventListener("click", () => onClick(f.key));
      pins.set(f.key, pin);
    }
    const lab = (f.el as HTMLInputElement).labels?.[0];
    const at = lab && !lab.contains(f.el) ? lab : (f.el.closest("label") ?? f.el);
    if (pin.previousElementSibling !== at) at.after(pin);
    const n = counts.get(f.key) ?? 0;
    pin.dataset.n = String(n);
    pin.lastElementChild!.textContent = n ? String(n) : "";
    pin.setAttribute("aria-label", fill(n === 0 ? L.pinNone : n === 1 ? L.pinOne : L.pinMany, { n, field: f.label }));
    pin.setAttribute("aria-pressed", String(filter === f.key));
  }
  for (const [k, p] of pins) if (!keep.has(k)) p.remove(), pins.delete(k);
}
