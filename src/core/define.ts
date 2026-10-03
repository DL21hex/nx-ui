/**
 * Base y registro de los elementos, a prueba de SSR.
 *
 * En el servidor (SolidStart, Node) no existen `HTMLElement` ni `customElements`: importar la
 * librería allí no puede lanzar, porque el mismo módulo lo importa el bundle de SSR. La clase se
 * declara contra un `class {}` vacío y el registro simplemente no ocurre.
 */
import { unwatchLang, watchLang } from "./locale";

export const Base: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

/** Registra `tag` una sola vez: el bundle IIFE y el ESM pueden convivir en la misma página. */
export function define(tag: string, ctor: CustomElementConstructor): void {
  if (typeof customElements !== "undefined" && !customElements.get(tag)) {
    followLang(ctor);
    customElements.define(tag, ctor);
  }
}

type Hooks = HTMLElement & {
  connectedCallback?(): void;
  disconnectedCallback?(): void;
  attributeChangedCallback?(name: string, old: string | null, value: string | null): void;
};

/**
 * Un componente que observa `locale` también sigue el `lang` que hereda: si cambia `<html lang>`
 * (el selector de idioma de nx-account) y el elemento no tiene `locale` propio, recibe
 * `attributeChangedCallback("locale", viejo, nuevo)` con los locales resueltos, y repinta y
 * reparsea igual que si hubiera cambiado su atributo. Así ninguno tiene que acordarse.
 */
function followLang(ctor: CustomElementConstructor): void {
  if (!(ctor as unknown as { observedAttributes?: string[] }).observedAttributes?.includes("locale")) return;
  const proto = ctor.prototype as Hooks;
  const { connectedCallback: on, disconnectedCallback: off } = proto;
  proto.connectedCallback = function (this: Hooks) {
    on?.call(this);
    watchLang(this, (old, now) => this.attributeChangedCallback?.("locale", old, now));
  };
  proto.disconnectedCallback = function (this: Hooks) {
    unwatchLang(this);
    off?.call(this);
  };
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
