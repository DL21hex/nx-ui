/**
 * Base y registro de los elementos, a prueba de SSR.
 *
 * En el servidor (SolidStart, Node) no existen `HTMLElement` ni `customElements`: importar la
 * librería allí no puede lanzar, porque el mismo módulo lo importa el bundle de SSR. La clase se
 * declara contra un `class {}` vacío y el registro simplemente no ocurre.
 */
export const Base: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** Registra `tag` una sola vez: el bundle IIFE y el ESM pueden convivir en la misma página. */
export function define(tag: string, ctor: CustomElementConstructor): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    customElements.define(tag, ctor);
  }
}

/** Un atributo booleano que también entiende `"false"` (lo que escribe un framework con `={false}`). */
export function boolAttr(el: Element, name: string): boolean {
  const v = el.getAttribute(name);
  return v !== null && v !== "false";
}
