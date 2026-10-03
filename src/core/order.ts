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

/** Se ve y se puede enfocar: tiene caja y no está dentro de algo `hidden` o `inert`. */
export const shown = (el: Element): boolean => el.getClientRects().length > 0 && !el.closest("[hidden], [inert]");

/** Compara dos nodos de `root` por el orden en que se ven: el del documento, salvo que un
 *  contenedor flex o grid reordene a sus hijos con `order`. */
function comparer(root: Element): (a: Element, b: Element) => number {
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
      if (d) return d;
    }
    return pa[i].compareDocumentPosition(pb[i]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  };
}

/** Los enfocables con Tab dentro de `root`, en el orden en que se ven. De un grupo de radios
 *  queda uno, como hace el navegador: el que tiene el foco, el marcado o el primero. */
export function tabOrder(root: Element): HTMLElement[] {
  const active = document.activeElement;
  // Por formulario (o ninguno) y nombre.
  const groups = new Map<HTMLFormElement | null, Map<string, HTMLInputElement[]>>();
  const all: HTMLInputElement[][] = [];
  const els = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
    if (!shown(el)) return false;
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
  return els.sort(comparer(root));
}

/** A dónde va el foco con Tab (o Mayús+Tab, `back`) desde `from`, en el orden en que se ve `root`.
 *  `to` es `null` si sale de `root` (desde su último o su primer enfocable, o si no hay ninguno);
 *  desde fuera de `root` (o desde `root` mismo), entra por el primero o por el último. */
export function stepTab(root: Element, from: Element | null, back: boolean): { els: HTMLElement[]; to: HTMLElement | null } {
  const els = tabOrder(root);
  const n = els.length;
  if (!from || from === root || !root.contains(from)) return { els, to: (back ? els[n - 1] : els[0]) ?? null };
  let i = els.indexOf(from as HTMLElement);
  if (i >= 0) i += back ? -1 : 1;
  else {
    // Un nodo que no está en la lista (`tabindex="-1"`): se ubica entre los que sí.
    const cmp = comparer(root);
    const after = els.findIndex((el) => cmp(from, el) < 0);
    i = after < 0 ? (back ? n - 1 : n) : back ? after - 1 : after;
  }
  return { els, to: els[i] ?? null };
}
