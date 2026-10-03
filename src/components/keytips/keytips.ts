/**
 * `<nx-keytips>`: atajos de teclado sin configurar nada, como los KeyTips de Office. Se toca **Alt**
 * (se presiona y se suelta sola) y cada acción visible de la pantalla muestra una letra; se pulsa la
 * letra y se ejecuta. Esc, Tab, un clic o volver a tocar Alt los ocultan. Mantener Alt ~400 ms
 * también los muestra, y Alt+letra (sin soltar) ejecuta.
 *
 * Se pone una vez en la página. Cerrado no hace nada más que escuchar `keydown`/`keyup` en el
 * documento; abierto, recalcula en el siguiente cuadro si hay scroll, cambios de tamaño o de DOM.
 *
 * La letra sale del nombre accesible y se recuerda por elemento (ver `logic.ts`); `data-keytip="G"`
 * la fija y `data-keytip="off"` excluye un elemento o un contenedor entero. Con un diálogo modal o
 * un popover abierto, solo cuenta lo de adentro. La capa de las etiquetas es decorativa
 * (`aria-hidden`) y va en la capa superior (`popover="manual"`), sobre los diálogos.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, setAttr } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { assignKeytips, keytipChar } from "./logic";
import type { KeytipAssignment, KeytipDetail, KeytipsLabels } from "./types";

export const KEYTIPS_LABELS: KeytipsLabels = {
  open: "Atajos visibles. Pulsa una letra o Esc para salir.",
};

const CANDIDATES = "button,a[href],summary,input,select,textarea,[contenteditable],[role],[tabindex],[data-keytip]";
/** Roles que se pulsan; los de `TYPING` reciben el foco. */
const ROLES = /^(button|tab|menuitem(checkbox|radio)?|link|checkbox|radio|switch|option)$/;
const TYPING = /^(textbox|combobox|searchbox)$/;
/** Los `<input>` que se pulsan; los demás reciben el foco (y su texto queda seleccionado). */
const PRESS = /^(checkbox|radio|button|submit|reset|image|file|color)$/;
/** Lo que deja el resto de la página debajo: un modal o un popover que se cierra al hacer clic fuera. */
const DIALOGS = 'dialog:modal,nx-dialog[open][data-depth="0"]';
const POPOVERS = "[aria-modal=true]:popover-open,[popover=auto]:popover-open,[popover='']:popover-open";
/** Un toque: Alt se suelta antes de esto. */
const TAP_MS = 800;
/** Mantener Alt esto también muestra los atajos. */
const HOLD_MS = 400;

/** Qué se hace con un elemento: 0 nada (no es un control), 1 clic, 2 foco. */
function kind(el: HTMLElement): 0 | 1 | 2 {
  const t = el.localName;
  const role = el.getAttribute("role") ?? "";
  if (el.isContentEditable || t === "select" || t === "textarea" || TYPING.test(role)) return 2;
  if (t === "input") {
    const type = (el as HTMLInputElement).type;
    return type === "hidden" ? 0 : PRESS.test(type) ? 1 : 2;
  }
  return t === "button" || t === "summary" || (t === "a" && el.hasAttribute("href")) || ROLES.test(role) ? 1 : 0;
}

const clamp = (v: number, min: number, max: number) => Math.round(Math.min(Math.max(v, min), max));

/** El control que actúa: el elemento, o si es un envoltorio con `data-keytip` (un <nx-button>), su primer control. */
const control = (el: HTMLElement): HTMLElement => (kind(el) ? el : (query(el, CANDIDATES).find(kind) ?? el));

const query = (root: ParentNode, sel: string): HTMLElement[] => {
  try {
    return [...root.querySelectorAll<HTMLElement>(sel)];
  } catch {
    return []; // `:modal` o `:popover-open` sin soporte
  }
};

/** El modal o popover de arriba: el más interno, y un popover antes que un diálogo (de los
 *  <nx-dialog> apilados, el de arriba tiene `data-depth="0"`). */
function topLayer(): HTMLElement | undefined {
  const all = [...query(document, DIALOGS), ...query(document, POPOVERS)];
  return all.filter((a) => !all.some((b) => b !== a && a.contains(b))).pop();
}

/** El nombre accesible, en corto: aria-label, aria-labelledby, su `<label>`, el texto, `title`, `placeholder`. */
function nameOf(el: HTMLElement): string {
  const by = el.getAttribute("aria-labelledby");
  const labels = (el as HTMLInputElement).labels;
  const input = el as HTMLInputElement;
  const s =
    el.getAttribute("aria-label") ||
    (by ? by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ") : "") ||
    // (El texto de un <label> que envuelve un <textarea> o un <select> incluye el de adentro: se quita.)
    (labels?.length ? [...labels].map((l) => l.textContent!.replace(el.textContent!, "")).join(" ") : "") ||
    (el.localName === "input" ? (/^(button|submit|reset)$/.test(input.type) ? input.value : "") : el.textContent) ||
    el.title ||
    input.placeholder ||
    "";
  return s.replace(/\s+/g, " ").trim().slice(0, 80);
}

export class NxKeytips extends Base {
  static observedAttributes = ["labels", "disabled"];

  #labels: KeytipsLabels = KEYTIPS_LABELS;
  #open = false;
  #tips: KeytipAssignment[] = [];
  /** Dónde está cada una (lo midió `#collect`). */
  #rects: DOMRect[] = [];
  /** Lo pulsado de un código de dos letras. */
  #typed = "";
  /** La letra de cada elemento en la apertura anterior. */
  #memo = new WeakMap<Element, string>();
  /** Cuándo se presionó la tecla (0: no hay un toque en curso). */
  #tap = 0;
  #hold = 0;
  /** Se abrió manteniendo la tecla: soltarla no cierra. */
  #held = false;
  #raf = 0;
  #mo?: MutationObserver;
  /** Los listeners de mientras está abierto: se quitan todos juntos al cerrar. */
  #ac?: AbortController;
  #layer?: HTMLDivElement;
  #status?: HTMLDivElement;

  // ---------------------------------------------------------------- propiedades

  /** Selector de la región con atajos (por defecto, toda la página). */
  get scope(): string | null {
    return this.getAttribute("scope");
  }
  set scope(v: string | null) {
    this.#attr("scope", v);
  }
  /** La tecla que los muestra: `Alt` (por defecto), `Control`, `Shift` o `Meta`; `none`: solo con `show()`. */
  get key(): string {
    return this.getAttribute("key") || "Alt";
  }
  set key(v: string) {
    this.#attr("key", v);
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    if (v) this.setAttribute("disabled", "");
    else this.removeAttribute("disabled");
  }
  get labels(): KeytipsLabels {
    return this.#labels;
  }
  set labels(v: Partial<KeytipsLabels> | null | undefined) {
    this.#labels = mergeLabels(KEYTIPS_LABELS, v);
  }
  get open(): boolean {
    return this.#open;
  }
  /** Lo que tiene letra ahora (abierto) o lo que la tendría (cerrado): `{key, name, element}`. */
  get assignments(): KeytipAssignment[] {
    return this.#open ? [...this.#tips] : this.#collect();
  }

  /** Muestra los atajos. No abre si no hay ninguna acción visible. */
  show(): void {
    if (this.disabled || !this.isConnected) return;
    this.#tap = 0;
    this.#typed = "";
    // Sin ninguna acción visible no abre (y si ya estaba abierto, cierra: si no, se tragaría las teclas).
    if (!this.#paint()) return this.hide();
    if (this.#open) return;
    this.#open = true;
    const layer = this.#layer!;
    layer.hidden = false;
    // Encima de lo que ya esté en la capa superior (un diálogo abierto). Sin la Popover API, la capa
    // es `position: fixed` con un z-index alto.
    this.#popover(false);
    this.#popover(true);
    const o = { capture: true, passive: true, signal: (this.#ac = new AbortController()).signal };
    const close = () => this.hide();
    document.addEventListener("scroll", this.#later, o);
    document.addEventListener("pointerdown", close, o);
    addEventListener("resize", this.#later, o);
    addEventListener("blur", close, o);
    this.#mo = new MutationObserver((recs) => recs.some((r) => !this.contains(r.target)) && this.#later());
    this.#mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "disabled", "inert", "open", "aria-disabled", "data-keytip"] });
    this.#status!.textContent = this.#labels.open;
    this.#emit(true);
  }

  hide(): void {
    clearTimeout(this.#hold);
    this.#held = false;
    if (!this.#open) return;
    this.#open = false;
    this.#typed = "";
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#mo?.disconnect();
    this.#ac?.abort();
    const layer = this.#layer!;
    this.#popover(false);
    layer.hidden = true;
    layer.replaceChildren();
    this.#tips = [];
    this.#status!.textContent = "";
    this.#emit(false);
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#layer) {
      this.#layer = h("div", { class: "nx-keytips__layer", popover: "manual", "aria-hidden": "true", hidden: true });
      this.#status = h("div", { class: "nx-keytips__status", role: "status" });
      this.append(this.#layer, this.#status);
    }
    document.addEventListener("keydown", this.#down, true);
    document.addEventListener("keyup", this.#up, true);
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.#down, true);
    document.removeEventListener("keyup", this.#up, true);
    this.hide();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "disabled") {
      if (this.disabled) this.hide();
      return;
    }
    try {
      this.labels = value === null ? null : JSON.parse(value);
    } catch {
      console.warn('[nx-keytips] el atributo "labels" no es JSON válido');
    }
  }

  // ---------------------------------------------------------------- teclado

  #down = (e: KeyboardEvent): void => {
    if (this.disabled) return;
    if (e.key === this.key) {
      if (e.repeat) return;
      clearTimeout(this.#hold);
      // Con otro modificador presionado (Ctrl+Alt, Alt+Mayús, AltGr en Windows) no es un toque. La
      // tecla misma ya cuenta como uno.
      this.#tap = +e.altKey + +e.ctrlKey + +e.shiftKey + +e.metaKey > 1 ? 0 : Date.now();
      if (this.#tap && !this.#open) {
        // Mantenerla también los muestra (salvo que la ventana ya no tenga el foco: Alt+Tab).
        this.#hold = window.setTimeout(() => {
          if (document.hasFocus?.() === false) return;
          this.show();
          this.#held = this.#open;
        }, HOLD_MS);
      }
      return;
    }
    // Cualquier otra tecla en medio: ya no es un toque (Alt+Tab, Alt+Mayús, AltGr+Q para «@»).
    this.#tap = 0;
    clearTimeout(this.#hold);
    if (!this.#open || e.isComposing) return;
    // Tab y los atajos con Ctrl/⌘ (Ctrl+K, Ctrl+C) cierran y siguen su camino.
    const mod = (e.ctrlKey && this.key !== "Control") || (e.metaKey && this.key !== "Meta");
    if (e.key === "Tab" || mod) return this.hide();
    // Lo demás es de los atajos: no se escribe en el campo con foco ni cierra el diálogo de abajo.
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") return this.hide();
    if (e.key === "Backspace") return this.#dim(this.#typed.slice(0, -1));
    const c = keytipChar(e);
    const typed = this.#typed + c;
    if (!c || !this.#tips.some((t) => t.key.startsWith(typed))) return;
    const hit = this.#tips.find((t) => t.key === typed);
    if (hit) this.#run(hit);
    else this.#dim(typed);
  };

  #up = (e: KeyboardEvent): void => {
    if (this.disabled || e.key !== this.key) return;
    clearTimeout(this.#hold);
    const t = this.#tap;
    this.#tap = 0;
    // Firefox y Windows abren la barra de menú al soltar Alt: el toque es nuestro.
    if (this.#held) {
      this.#held = false;
      e.preventDefault();
      return;
    }
    if (!t || Date.now() - t > TAP_MS) return;
    e.preventDefault();
    if (this.#open) this.hide();
    else this.show();
  };

  #later = (): void => {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      if (this.#open && !this.#paint()) this.hide();
    });
  };

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    setAttr(this, name, v);
  }

  #popover(show: boolean): void {
    try {
      if (show) this.#layer!.showPopover?.();
      else this.#layer!.hidePopover?.();
    } catch {
      /* ya estaba así (los navegadores de antes lanzan) */
    }
  }

  #emit(open: boolean): void {
    this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open }, bubbles: true, composed: true }));
  }

  /** Ejecuta la acción: avisa (`nx-keytips-activate`, cancelable), cierra y hace clic o enfoca. */
  #run(t: KeytipAssignment): void {
    const el = t.element;
    const detail: KeytipDetail = { key: t.key, target: el, name: t.name };
    const ok = this.dispatchEvent(new CustomEvent("nx-keytips-activate", { detail, bubbles: true, composed: true, cancelable: true }));
    this.hide();
    // Algo que se ocultó por clase o estilo con los atajos abiertos (el observador no mira `class`
    // ni `style`) ya no se pulsa.
    const gone = !el.isConnected || (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true } as CheckVisibilityOptions));
    if (!ok || gone) return;
    const target = control(el);
    const k = kind(target);
    if (k === 2 || (!k && !target.hasAttribute("data-keytip"))) {
      target.focus();
      (target as HTMLInputElement).select?.();
    } else target.click();
  }

  /** Lo visible con letra, en el orden del documento. */
  #collect(): KeytipAssignment[] {
    const vw = innerWidth;
    const vh = innerHeight;
    let scoped: HTMLElement | null = null;
    try {
      scoped = this.scope ? document.querySelector<HTMLElement>(this.scope) : null;
    } catch {
      /* un selector inválido: toda la página */
    }
    scoped ??= document.body;
    const layer = topLayer();
    const root = layer && !layer.contains(scoped) ? layer : scoped;
    const found: { el: HTMLElement; name: string; r: DOMRect; forced: string | undefined }[] = [];
    for (const el of query(root, CANDIDATES)) {
      if (el.closest("[inert],[hidden],[data-keytip=off],[aria-disabled=true],fieldset[disabled]") || el.matches(":disabled")) continue;
      // Un envoltorio con `data-keytip` se queda con la letra de lo de adentro.
      const owner = el.parentElement?.closest("[data-keytip]");
      if (owner && root.contains(owner)) continue;
      // Con solo `tabindex` (o un `role` que no se pulsa), cuenta si se puede tabular hasta él y tiene
      // nombre. Lo que no es tabulable se descarta antes de leer su texto (un `role="main"` es toda la página).
      const plain = !kind(el) && !el.hasAttribute("data-keytip");
      if (plain && el.tabIndex < 0) continue;
      const name = nameOf(control(el));
      if (plain && !name) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom <= 0 || r.right <= 0 || r.top >= vh || r.left >= vw) continue;
      if (el.checkVisibility && !el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true } as CheckVisibilityOptions)) continue;
      // Tapado por otra cosa (sin layout, como en happy-dom, no hay cómo saberlo).
      const hit = document.elementFromPoint?.(clamp((r.left + r.right) / 2, 0, vw - 1), clamp((r.top + r.bottom) / 2, 0, vh - 1));
      if (hit && !el.contains(hit) && !(el as HTMLInputElement).labels?.[0]?.contains(hit)) continue;
      found.push({ el, name, r, forced: el.dataset.keytip });
    }
    const keys = assignKeytips(found.map((f) => ({ name: f.name, forced: f.forced, prev: this.#memo.get(f.el) })));
    const tips: KeytipAssignment[] = [];
    this.#rects = [];
    found.forEach((f, i) => {
      const key = keys[i];
      if (!key) return;
      this.#memo.set(f.el, key);
      tips.push({ key, name: f.name, element: f.el });
      this.#rects.push(f.r);
    });
    return tips;
  }

  /** Recalcula y pinta las etiquetas. Devuelve si hay alguna. */
  #paint(): boolean {
    this.#tips = this.#collect();
    const vw = innerWidth;
    const vh = innerHeight;
    const layer = this.#layer!;
    const kids = layer.children as HTMLCollectionOf<HTMLElement>;
    // Las etiquetas que ya están se actualizan en su lugar (al desplazarse se recalcula en cada cuadro).
    this.#tips.forEach((t, i) => {
      const r = this.#rects[i];
      const tip = kids[i] ?? layer.appendChild(h("span", { class: "nx-keytips__tip" }));
      tip.textContent = t.key;
      // En la esquina superior izquierda, un poco afuera para no tapar el texto; dentro de la pantalla.
      tip.style.left = `${clamp(r.left - 6, 2, vw - 12 - 10 * t.key.length)}px`;
      tip.style.top = `${clamp(r.top - 8, 2, vh - 20)}px`;
    });
    while (kids.length > this.#tips.length) kids[kids.length - 1].remove();
    // Si lo pulsado ya no lleva a nada (la pantalla cambió), se empieza de nuevo.
    this.#dim(this.#tips.some((t) => t.key.startsWith(this.#typed)) ? this.#typed : "");
    return this.#tips.length > 0;
  }

  /** Con la primera letra de un código de dos, lo que no empieza por ella se atenúa. */
  #dim(typed: string): void {
    this.#typed = typed;
    this.#tips.forEach((t, i) => this.#layer!.children[i].classList.toggle("nx-keytips__tip--off", !t.key.startsWith(typed)));
  }
}
