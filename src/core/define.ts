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

/** El setter de `key` en la cadena de prototipos de `proto`, sin llegar a `stop`. */
export function setterOf(proto: object | null, key: string, stop: object = Object.prototype): ((v: unknown) => void) | undefined {
  for (let p = proto; p && p !== stop; p = Object.getPrototypeOf(p)) {
    const set = Object.getOwnPropertyDescriptor(p, key)?.set;
    if (set) return set;
  }
  return undefined;
}

/**
 * Lo que el autor asignó antes de que el elemento se definiera (`el.rows = …` con el módulo aún
 * sin cargar, un framework que hidrata primero) quedó como propiedad propia y tapa el setter: se
 * vuelve a asignar para que pase por él. Mira los setters de la clase, así no depende de una lista
 * de props que alguien tiene que acordarse de actualizar.
 */
export function upgrade(el: HTMLElement): void {
  const self = el as unknown as Record<string, unknown>;
  for (const k of Object.getOwnPropertyNames(el)) {
    if (!Object.getOwnPropertyDescriptor(el, k)?.configurable || !setterOf(Object.getPrototypeOf(el), k)) continue;
    const v = self[k];
    delete self[k];
    self[k] = v;
  }
}

/**
 * Props que solo reflejan un atributo de texto (`logoutUrl` ↔ `logout-url`): con setter, para que
 * BDUI y los frameworks las asignen como las demás, sin escribir cada par get/set. Se llama desde
 * un bloque `static {}` de la clase, con un `declare` por prop para los tipos.
 */
export function attrProps(ctor: { prototype: object }, names: readonly string[]): void {
  for (const k of names) {
    const a = k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    Object.defineProperty(ctor.prototype, k, {
      configurable: true,
      get(this: Element) {
        return this.getAttribute(a);
      },
      set(this: Element, v: unknown) {
        if (v == null) this.removeAttribute(a);
        else this.setAttribute(a, String(v));
      },
    });
  }
}

/** Un atributo booleano que también entiende `"false"` (lo que escribe un framework con `={false}`). */
export function boolAttr(el: Element, name: string): boolean {
  const v = el.getAttribute(name);
  return v !== null && v !== "false";
}
