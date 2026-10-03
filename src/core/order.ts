/**
 * El orden de Tab según se ve. Los componentes agregan lo suyo al final (la cabecera de
 * `<nx-dialog>`, la lista de `<nx-tabs>`) para no mover los nodos del autor ni romper la
 * hidratación de Solid, y lo suben con `order`; el navegador, en cambio, recorre con Tab el orden
 * del documento. `reading-flow` lo corrige donde existe (Chrome 137+); esto hace lo mismo en el resto.
 */

/** Lo que recibe el foco con Tab (sin `tabindex="-1"`). */
export const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[tabindex]",
  '[contenteditable]:not([contenteditable="false"])',
]
  .map((s) => `${s}:not([tabindex^="-"])`)
  .join(",");

/** Se ve y se puede enfocar: tiene caja, no está dentro de algo `hidden` o `inert` y no lo oculta
 *  `visibility` (con caja, pero el navegador no lo enfoca). */
export const shown = (el: Element): boolean =>
  el.getClientRects().length > 0 && !el.closest("[hidden], [inert]") && (el.checkVisibility?.({ visibilityProperty: true }) ?? true);

/** El navegador recorre con Tab el orden en que se ve (`reading-flow`, Chrome 137+): en general, o
 *  dentro de `el`. El CSS lo apaga donde un hijo tiene `tabindex` negativo: con `reading-flow` cada
 *  hijo es un ámbito de foco, y el navegador se salta todo lo de adentro de uno con `tabindex="-1"`. */
export const readingFlow = (el?: Element): boolean =>
  typeof CSS !== "undefined" && !!CSS.supports?.("reading-flow", "flex-visual") && (!el || getComputedStyle(el).getPropertyValue("reading-flow") !== "normal");

/** Compara dos nodos de `root` por el orden en que se ven: el del documento, salvo que un
 *  contenedor flex o grid reordene a sus hijos con `order` (esos contenedores se anotan en `moved`). */
function comparer(root: Element, moved?: Set<Element>): (a: Element, b: Element) => number {
  const order = new Map<Element, number>();
  const flex = new Map<Element, boolean>();
  const ord = (el: Element) => {
    let o = order.get(el);
    if (o === undefined) order.set(el, (o = Number(getComputedStyle(el).order) || 0));
    return o;
  };
  const isFlex = (el: Element) => {
    let f = flex.get(el);
    if (f === undefined) flex.set(el, (f = /flex|grid/.test(getComputedStyle(el).display)));
    return f;
  };
  const chain = (el: Element) => {
    const out: Element[] = [];
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) out.unshift(n);
    return out;
  };
  return (a, b) => {
    if (a === b) return 0;
    const pa = chain(a);
    const pb = chain(b);
    let i = 0;
    while (i < pa.length && pa[i] === pb[i]) i++;
    // Uno contiene al otro: primero el de afuera.
    if (i === pa.length) return -1;
    if (i === pb.length) return 1;
    const parent = pa[i].parentElement;
    if (parent && isFlex(parent)) {
      const d = ord(pa[i]) - ord(pb[i]);
      if (d) return moved?.add(parent), d;
    }
    return pa[i].compareDocumentPosition(pb[i]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };
}

/** Los enfocables con Tab dentro de `root`, en el orden en que se ven. De un grupo de radios
 *  queda uno, como hace el navegador: el que tiene el foco, el marcado o el primero. En `moved`
 *  quedan los contenedores cuyo `order` cambió el orden del documento. */
export function tabOrder(root: Element, moved?: Set<Element>): HTMLElement[] {
  const active = document.activeElement;
  // Por formulario (o ninguno) y nombre.
  const groups = new Map<HTMLFormElement | null, Map<string, HTMLInputElement[]>>();
  const all: HTMLInputElement[][] = [];
  const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    // `:disabled` también alcanza lo de adentro de un `<fieldset disabled>` y un `<button disabled tabindex="0">`.
    if (!shown(el) || el.matches(":disabled")) return false;
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      let byName = groups.get(el.form);
      if (!byName) groups.set(el.form, (byName = new Map()));
      const g = byName.get(el.name);
      if (g) return void g.push(el), false;
      byName.set(el.name, [el]);
      all.push(byName.get(el.name)!);
    }
    return true;
  });
  // El primero de cada grupo ocupa su lugar; se cambia por el radio que corresponde.
  for (const g of all) {
    const pick = g.find((r) => r === active) ?? g.find((r) => r.checked) ?? g[0];
    if (pick !== g[0]) els[els.indexOf(g[0])] = pick;
  }
  return els.sort(comparer(root, moved));
}

/** A dónde va el foco con Tab (o Mayús+Tab, `back`) desde `from`, en el orden en que se ve `root`.
 *  `to` es `null` si sale de `root` (desde su último o su primer enfocable, o si no hay ninguno);
 *  desde fuera de `root` (o desde `root` mismo), entra por el primero o por el último.
 *
 *  `native`: el navegador ya va a `to` por su cuenta (es el de al lado en el documento, o lo ordena
 *  `reading-flow` en cada contenedor que reordena), así que no hace falta evitar su Tab. Dejarlo hace
 *  que recorra también lo que hay dentro de un control (los segmentos de una fecha, un shadow DOM) y
 *  salte lo que no se enfoca. */
export function stepTab(root: Element, from: Element | null, back: boolean): { els: HTMLElement[]; to: HTMLElement | null; native: boolean } {
  const moved = new Set<Element>();
  const els = tabOrder(root, moved);
  const n = els.length;
  if (!from || from === root || !root.contains(from)) return { els, to: (back ? els[n - 1] : els[0]) ?? null, native: false };
  let i = els.indexOf(from as HTMLElement);
  if (i >= 0) i += back ? -1 : 1;
  else {
    // Un nodo que no está en la lista (`tabindex="-1"`, un host con shadow DOM): se ubica entre los que sí.
    const cmp = comparer(root, moved);
    const after = els.findIndex((el) => cmp(from, el) < 0);
    i = after < 0 ? (back ? n - 1 : n) : back ? after - 1 : after;
  }
  const to = els[i] ?? null;
  // Un `tabindex` positivo cambia el orden del navegador: ahí no se le deja nada.
  const flows = readingFlow() && [...moved].every((el) => readingFlow(el));
  const native = !!to && !els.some((el) => el.tabIndex > 0) && (flows || to === beside(els, from, back));
  return { els, to, native };
}

/** El de `els` que sigue a `from` (o el de antes, `back`) en el orden del documento: adonde iría el
 *  navegador. Lo de adentro de `from` va después; lo que lo contiene, antes. */
function beside(els: HTMLElement[], from: Element, back: boolean): HTMLElement | undefined {
  const bit = back ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
  let best: HTMLElement | undefined;
  for (const el of els) {
    if (el === from || !(from.compareDocumentPosition(el) & bit)) continue;
    // El más cercano a `from`: el primero que sigue, o el último que precede.
    if (!best || !(best.compareDocumentPosition(el) & bit)) best = el;
  }
  return best;
}

/** Un control con paradas propias: Tab recorre los segmentos de una fecha o una hora sin que cambie
 *  `document.activeElement`, así que desde afuera no se sabe si el próximo Tab sale de él. */
export const hasStops = (el: Element | null): el is HTMLInputElement => el instanceof HTMLInputElement && /^(date|time|datetime-local|month|week)$/.test(el.type);

/**
 * Tab desde un control con paradas propias (`hasStops`) cuando el navegador no iría solo adonde
 * toca: se le deja mover (al segmento siguiente, si lo hay) y, si el foco sale del control, `go` lo
 * lleva a su lugar en el acto. Durante esa pulsación `root` recibe el foco (Mayús+Tab desde lo primero
 * del documento no se sale de él) y Tab sigue el orden del documento: sin `reading-flow`, que al pasar
 * del último lo sacaría de `root`.
 */
export function tabThrough(root: HTMLElement, from: Element, go: () => void): void {
  const tabindex = root.getAttribute("tabindex");
  const flow = root.style.getPropertyValue("reading-flow");
  root.tabIndex = 0;
  if (readingFlow(root)) root.style.setProperty("reading-flow", "normal");
  let done = false;
  const finish = (moved: boolean) => {
    if (done) return;
    done = true;
    document.removeEventListener("focusin", leave, true);
    clearTimeout(timer);
    if (tabindex === null) root.removeAttribute("tabindex");
    else root.setAttribute("tabindex", tabindex);
    if (flow) root.style.setProperty("reading-flow", flow);
    else root.style.removeProperty("reading-flow");
    if (moved) go();
  };
  // Salió del control (pasar de segmento no mueve el foco del documento): a su lugar, antes de pintar.
  const leave = (e: Event) => e.target !== from && finish(true);
  document.addEventListener("focusin", leave, true);
  // Si el foco se fue sin `focusin` (a la barra del navegador), también.
  const timer = setTimeout(() => finish(document.activeElement !== from));
}

/** Enfoca `els[i]` y, si no acepta el foco (algo que el navegador no enfoca aunque lo parezca), el
 *  siguiente en la misma dirección; con `wrap`, da la vuelta. Devuelve el que quedó con el foco. */
export function focusFrom(els: HTMLElement[], i: number, back: boolean, wrap: boolean): HTMLElement | null {
  const n = els.length;
  for (let k = 0; k < n; k++, i += back ? -1 : 1) {
    if (wrap) i = (i + n) % n;
    else if (i < 0 || i >= n) break;
    els[i].focus();
    if (document.activeElement === els[i]) return els[i];
  }
  return null;
}
