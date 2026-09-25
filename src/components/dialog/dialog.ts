/**
 * `<nx-dialog>`: un diálogo que nace del botón que lo abrió y vuelve a él al cerrarse, que se
 * apila como paneles laterales para profundizar sin perder contexto, y que en móvil es una hoja
 * que se arrastra para cerrar. Si hay cambios sin guardar, avisa en el propio diálogo en vez de
 * perderlos.
 *
 * El elemento mismo es la capa superior (Popover API, `popover="manual"`): el contenido del autor
 * nunca se mueve, así que la hidratación de Solid no se rompe. Se comporta como modal:
 * `role="dialog"` + `aria-modal`, foco atrapado y devuelto, Escape, fondo que bloquea y scroll de la
 * página bloqueado. El componente solo agrega su cabecera y el aviso de cambios al final, y los
 * ubica con `order`.
 *
 * Abrir: `<button popovertarget="id">` (sin JS), `dlg.show()` (devuelve una promesa con el valor de
 * cierre) o el atributo `open`. Cerrar: el botón ×, Escape, clic fuera, `[data-nx-close]`,
 * `<form method="dialog">` o `dlg.close(valor)`.
 */
import { Base, boolAttr } from "../../core/define";
import { h } from "../../core/dom";
import { glyph } from "../../core/icons";
import type { CloseReason, DialogLabels, DialogMode, DialogSize } from "./types";

export const DIALOG_LABELS: DialogLabels = {
  close: "Cerrar",
  unsaved: "Tienes cambios sin guardar",
  discard: "Descartar",
  keep: "Seguir editando",
  stack: "Niveles abiertos",
};

const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const PROPS = ["heading", "description", "mode", "size", "persistent", "url", "labels", "open"] as const;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
/** Cerrar arrastrando: esta distancia (px), o un gesto rápido. */
const DRAG_CLOSE = 120;

let uid = 0;
/** Distingue esta carga de la página: el historial conserva estados de cargas anteriores. */
const SESSION = Math.random().toString(36).slice(2, 8);
/** Los diálogos abiertos, en el orden en que se abrieron (el último está arriba). */
const stack: NxDialog[] = [];
let lastInvoker: Element | null = null;
let wired = false;
/** Los saltos de historial que hizo la librería: sus `popstate` no son la persona pulsando «atrás». */
let ownBacks = 0;
let backQueue = 0;
/** Quita las entradas de los diálogos cerrados. Varios cierres seguidos (las migas cierran varios
 *  niveles) van en un solo `history.go(-n)`: los `back()` seguidos el navegador los fusiona. */
function queueBack(): void {
  if (backQueue++) return;
  setTimeout(() => {
    const n = backQueue;
    backQueue = 0;
    ownBacks++;
    history.go(-n);
  });
}

/** Listeners de documento, una sola vez: Escape y Tab van al diálogo de arriba. */
function wire(): void {
  if (wired || typeof document === "undefined") return;
  wired = true;
  // El botón que abrió el diálogo (para nacer de él y devolverle el foco).
  document.addEventListener("click", (e) => (lastInvoker = (e.target as Element).closest?.("[popovertarget], [data-nx-origin]") ?? lastInvoker), true);
  document.addEventListener("pointerdown", (e) => (lastInvoker = (e.target as Element).closest?.("button, a, [role='button'], [data-nx-origin]") ?? null), true);
  document.addEventListener("keydown", (e) => stack[stack.length - 1]?.handleKey(e));
  document.addEventListener("focusin", (e) => {
    const top = stack[stack.length - 1];
    const t = e.target as Element;
    // El foco no se escapa del diálogo de arriba (los avisos y la paleta de comandos sí pueden recibirlo).
    if (top && !top.contains(t) && !t.closest?.("nx-toaster, nx-command")) top.focusFirst();
  });
  addEventListener("popstate", () => {
    if (ownBacks > 0) return void ownBacks--;
    const top = stack[stack.length - 1];
    if (top?.pushedState && history.state?.nxDialog !== top.pushedState) top.close(undefined, "history");
  });
}

/** Profundidad de cada diálogo abierto y migas del panel de arriba. */
function paintStack(): void {
  stack.forEach((d, i) => {
    d.dataset.depth = String(stack.length - 1 - i);
    d.toggleAttribute("data-stacked", i > 0);
    d.paintCrumbs(i === stack.length - 1 ? stack.slice(0, i).filter((x) => x.mode === "panel") : []);
  });
}

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const visible = (el: Element | null | undefined): el is HTMLElement => !!el?.isConnected && (el as HTMLElement).getClientRects?.().length > 0;

/**
 * Un cambio de estado con View Transitions: el elemento `from` se convierte en `to` (el botón en el
 * diálogo, o al revés). Sin la API, o con movimiento reducido, el cambio es directo (y el CSS hace
 * su animación de entrada o salida).
 */
function morph(from: Element | null, to: Element | null, update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> } };
  if (!doc.startViewTransition || reduced() || !visible(from) || !to) return update();
  const name = "nx-dialog-morph";
  (from as HTMLElement).style.viewTransitionName = name;
  (to as HTMLElement).dataset.morph = "";
  const t = doc.startViewTransition(() => {
    (from as HTMLElement).style.viewTransitionName = "";
    (to as HTMLElement).style.viewTransitionName = name;
    update();
  });
  // Si el navegador no puede animar (pestaña oculta, otra transición), la transición se aborta: el
  // cambio igual se aplica, y sus promesas rechazadas no deben quedar sin atender.
  const quiet = () => {};
  t.ready.catch(quiet);
  t.updateCallbackDone.catch(quiet);
  t.finished.catch(quiet).finally(() => {
    (to as HTMLElement).style.viewTransitionName = "";
    delete (to as HTMLElement).dataset.morph;
  });
}

export class NxDialog extends Base {
  static observedAttributes = ["heading", "description", "labels", "open", "mode"];

  #uid = `nx-dialog${++uid}`;
  #labels: DialogLabels = DIALOG_LABELS;
  #built = false;
  #open = false;
  #opening = false;
  #origin: Element | null = null;
  #resolve?: (v: string | undefined) => void;
  #promise?: Promise<string | undefined>;
  #dirty = false;
  #pending: { value: string | undefined; reason: CloseReason } | null = null;
  #downOutside = false;
  #drag: { y: number; t: number; id: number } | null = null;
  /** La entrada de historial que agregó al abrirse (`url`), para que «atrás» lo cierre. */
  pushedState: string | null = null;
  returnValue: string | undefined;
  // Nodos propios.
  #head?: HTMLDivElement;
  #crumbs?: HTMLElement;
  #title?: HTMLHeadingElement;
  #desc?: HTMLParagraphElement;
  #closeBtn?: HTMLButtonElement;
  #guard?: HTMLDivElement;

  // ---------------------------------------------------------------- propiedades

  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string) {
    this.#attr("heading", v);
  }
  get description(): string {
    return this.getAttribute("description") ?? "";
  }
  set description(v: string) {
    this.#attr("description", v);
  }
  get mode(): DialogMode {
    return this.getAttribute("mode") === "panel" ? "panel" : "modal";
  }
  set mode(v: DialogMode) {
    this.#attr("mode", v);
  }
  get size(): DialogSize {
    const v = this.getAttribute("size");
    return v === "sm" || v === "lg" || v === "full" ? v : "md";
  }
  set size(v: DialogSize) {
    this.#attr("size", v);
  }
  /** Escape y el clic fuera no lo cierran (solo sus botones). */
  get persistent(): boolean {
    return boolAttr(this, "persistent");
  }
  set persistent(v: boolean) {
    this.toggleAttribute("persistent", !!v);
  }
  /** Al abrirse agrega una entrada al historial con esta URL (o la actual si es `""`): «atrás»
   *  cierra el diálogo, y la URL se puede compartir si la app la sabe abrir. */
  get url(): string | null {
    return this.getAttribute("url");
  }
  set url(v: string | null) {
    this.#attr("url", v);
  }
  get open(): boolean {
    return this.#open;
  }
  set open(v: boolean) {
    if (v) void this.show();
    else this.close(undefined, "api");
  }
  /** Hay cambios sin guardar (se marca solo al escribir en un campo; `false` al guardar). */
  get dirty(): boolean {
    return this.#dirty;
  }
  set dirty(v: boolean) {
    this.#dirty = !!v;
    if (!v) this.#showGuard(false);
  }
  get labels(): DialogLabels {
    return this.#labels;
  }
  set labels(v: Partial<DialogLabels> | null | undefined) {
    this.#labels = { ...DIALOG_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }

  // ---------------------------------------------------------------- API

  /** Abre el diálogo. `origin`: de dónde nace (por defecto, el botón que se acaba de pulsar).
   *  La promesa se resuelve al cerrarse, con el valor de cierre. */
  show(origin?: Element | null): Promise<string | undefined> {
    if (this.#open && this.#promise) return this.#promise;
    wire();
    if (!this.#built) this.#build();
    this.#open = true;
    this.#dirty = false;
    this.returnValue = undefined;
    // De dónde nace: lo que se pasa, o el control con foco (quien lo abrió con teclado o clic), o
    // lo último que se pulsó (Safari no enfoca los botones al hacer clic).
    const active = document.activeElement;
    this.#origin = origin ?? (active && active !== document.body && !this.contains(active) ? active : lastInvoker);
    this.#promise = new Promise((r) => (this.#resolve = r));
    stack.push(this);
    const update = () => {
      this.#opening = true;
      try {
        this.showPopover?.();
      } finally {
        this.#opening = false;
      }
      this.toggleAttribute("open", true);
      paintStack();
      this.focusFirst();
    };
    // Los paneles se deslizan desde el borde; el modal nace del botón.
    if (this.mode === "modal") morph(this.#origin, this, update);
    else update();
    if (this.url !== null && typeof history !== "undefined") {
      this.pushedState = `${SESSION}:${this.#uid}`;
      history.pushState({ ...history.state, nxDialog: this.pushedState }, "", this.url || location.href);
    }
    this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open: true }, bubbles: true, composed: true }));
    return this.#promise;
  }

  /**
   * Cierra con `value`. Devuelve `false` si no se cerró: la app canceló `nx-dialog-close`, o hay
   * cambios sin guardar y la persona debe confirmar (lo que cierra la persona pasa por ese aviso;
   * lo que cierra la app con `close()` no).
   */
  close(value?: string, reason: CloseReason = "api"): boolean {
    if (!this.#open) return true;
    // Primero los que están encima (y cada uno puede negarse).
    for (let top = stack[stack.length - 1]; top && top !== this; top = stack[stack.length - 1]) {
      if (!top.close(undefined, "stack")) return false;
    }
    const guarded = reason !== "api" && reason !== "form";
    if (guarded && this.#dirty) {
      this.#pending = { value, reason };
      this.#showGuard(true);
      if (reason === "history" && this.pushedState) history.pushState({ ...history.state, nxDialog: this.pushedState }, "", location.href);
      return false;
    }
    const ok = this.dispatchEvent(new CustomEvent("nx-dialog-close", { detail: { reason, value }, bubbles: true, composed: true, cancelable: true }));
    if (!ok) {
      if (reason === "history" && this.pushedState) history.pushState({ ...history.state, nxDialog: this.pushedState }, "", location.href);
      return false;
    }
    this.#finish(value, reason);
    return true;
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    for (const p of PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const self = this as unknown as Record<string, unknown>;
        const v = self[p];
        delete self[p];
        self[p] = v;
      }
    }
    wire();
    if (!this.#built) this.#build();
    this.#paint();
    if (this.hasAttribute("open") && !this.#open) queueMicrotask(() => void this.show());
  }

  disconnectedCallback(): void {
    if (this.#open) this.#finish(undefined, "api", true);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "labels" && value !== null) {
      try {
        this.labels = JSON.parse(value);
      } catch {
        console.warn('[nx-dialog] el atributo "labels" no es JSON válido');
      }
      return;
    }
    if (name === "open") {
      if (value !== null && !this.#open && this.isConnected && this.#built) void this.show();
      else if (value === null && this.#open) this.close(undefined, "api");
      return;
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- usado por el módulo

  /** Escape y Tab mientras es el diálogo de arriba. */
  handleKey(e: KeyboardEvent): void {
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      if (this.#guard && !this.#guard.hidden) return this.#showGuard(false);
      if (this.persistent) return this.#nudge();
      this.close(undefined, "escape");
    } else if (e.key === "Tab") {
      const els = this.#focusables();
      if (!els.length) {
        e.preventDefault();
        this.focus();
        return;
      }
      const first = els[0];
      const last = els[els.length - 1];
      const a = document.activeElement;
      if (e.shiftKey && (a === first || !this.contains(a))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (a === last || !this.contains(a))) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  /** El primer campo (o `[autofocus]`); si no hay, el diálogo mismo. */
  focusFirst(): void {
    // `[autofocus]` puede ser un envoltorio (un <nx-button>): se enfoca lo enfocable de adentro.
    const auto = this.querySelector<HTMLElement>("[autofocus]");
    const inner = auto && (auto.matches(FOCUSABLE) ? auto : auto.querySelector<HTMLElement>(FOCUSABLE));
    const body = this.#focusables().filter((el) => !this.#head?.contains(el));
    (inner ?? body[0] ?? this).focus({ preventScroll: true });
  }

  paintCrumbs(below: NxDialog[]): void {
    if (!this.#crumbs) return;
    this.#crumbs.hidden = !below.length || this.mode !== "panel";
    this.#crumbs.replaceChildren(...below.map((d) => h("button", { type: "button", class: "nx-dialog__crumb", "data-crumb": d.#uid }, d.heading || "…")));
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined) this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #focusables(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest("[hidden]") && !el.closest("[inert]"));
  }

  #build(): void {
    this.#built = true;
    if (!this.hasAttribute("popover")) this.setAttribute("popover", "manual");
    this.setAttribute("role", this.getAttribute("role") ?? "dialog");
    this.setAttribute("aria-modal", "true");
    this.setAttribute("aria-labelledby", `${this.#uid}-h`);
    if (!this.hasAttribute("tabindex")) this.tabIndex = -1;

    this.#crumbs = h("nav", { class: "nx-dialog__crumbs", hidden: true });
    this.#title = h("h2", { class: "nx-dialog__title", id: `${this.#uid}-h` });
    this.#desc = h("p", { class: "nx-dialog__desc", id: `${this.#uid}-d` });
    this.#closeBtn = h("button", { type: "button", class: "nx-dialog__x" }, glyph(X));
    this.#head = h(
      "div",
      { class: "nx-dialog__head" },
      h("span", { class: "nx-dialog__handle", "aria-hidden": "true" }),
      this.#crumbs,
      h("div", { class: "nx-dialog__titles" }, this.#title, this.#desc),
      this.#closeBtn,
    );
    this.#guard = h(
      "div",
      { class: "nx-dialog__guard", role: "alert", hidden: true },
      h("span"),
      h("button", { type: "button", class: "nx-dialog__keep", "data-guard": "keep" }),
      h("button", { type: "button", class: "nx-dialog__discard", "data-guard": "discard" }),
    );
    this.append(this.#head, this.#guard);
    // Si la app reemplaza el contenido (`replaceChildren`, `innerHTML`), la cabecera vuelve.
    if (typeof MutationObserver !== "undefined")
      new MutationObserver(() => {
        if (this.#head!.parentNode !== this) this.append(this.#head!);
        if (this.#guard!.parentNode !== this) this.append(this.#guard!);
      }).observe(this, { childList: true });

    this.#closeBtn.addEventListener("click", () => this.close(undefined, "button"));
    this.#crumbs.addEventListener("click", (e) => {
      const id = (e.target as Element).closest<HTMLElement>("[data-crumb]")?.dataset.crumb;
      const target = stack.find((d) => d.#uid === id);
      // Volver a un nivel: se cierran los de encima (cada uno puede pedir confirmación).
      while (target && stack[stack.length - 1] !== target) if (!stack[stack.length - 1].close(undefined, "stack")) break;
    });
    this.#guard.addEventListener("click", (e) => {
      const act = (e.target as Element).closest<HTMLElement>("[data-guard]")?.dataset.guard;
      if (act === "keep") return this.#showGuard(false), this.focusFirst();
      if (act === "discard") {
        const p = this.#pending ?? { value: undefined, reason: "button" as CloseReason };
        this.#dirty = false;
        this.#showGuard(false);
        this.close(p.value, p.reason === "history" ? "button" : p.reason);
      }
    });

    // Cambios sin guardar: lo que se escribe en los campos del autor.
    const touch = (e: Event) => {
      if (!this.#head!.contains(e.target as Node) && !this.#guard!.contains(e.target as Node)) this.#dirty = true;
    };
    this.addEventListener("input", touch);
    this.addEventListener("change", touch);
    this.addEventListener("reset", () => (this.dirty = false));
    // `<form method="dialog">`: cierra con el valor del botón que lo envió.
    this.addEventListener("submit", (e) => {
      const form = e.target as HTMLFormElement;
      if (form.getAttribute("method")?.toLowerCase() !== "dialog") return;
      e.preventDefault();
      this.#dirty = false;
      this.close((e as SubmitEvent).submitter?.getAttribute("value") ?? "", "form");
    });
    this.addEventListener("click", (e) => {
      const t = e.target as Element;
      const c = t.closest<HTMLElement>("[data-nx-close]");
      if (c && this.contains(c)) return void this.close(c.getAttribute("data-nx-close") || c.getAttribute("value") || undefined, "button");
      // Clic en el fondo: el objetivo es el propio diálogo, fuera de su caja.
      if (t === this && this.#downOutside && this.#outside(e)) {
        if (this.persistent) this.#nudge();
        else this.close(undefined, "backdrop");
      }
    });
    this.addEventListener("pointerdown", (e) => {
      this.#downOutside = e.target === this && this.#outside(e);
      const handle = (e.target as Element).closest(".nx-dialog__handle, .nx-dialog__head");
      if (handle && !(e.target as Element).closest("button") && this.#sheet()) {
        this.#drag = { y: e.clientY, t: performance.now(), id: e.pointerId };
        this.setPointerCapture?.(e.pointerId);
        this.dataset.dragging = "";
      }
    });
    this.addEventListener("pointermove", (e) => {
      if (this.#drag?.id === e.pointerId) this.style.translate = `0 ${Math.max(0, e.clientY - this.#drag.y)}px`;
    });
    const endDrag = (e: PointerEvent) => {
      const d = this.#drag;
      if (!d || d.id !== e.pointerId) return;
      this.#drag = null;
      delete this.dataset.dragging;
      const dy = Math.max(0, e.clientY - d.y);
      const fast = dy / Math.max(1, performance.now() - d.t) > 0.6;
      this.style.translate = "";
      if (dy > DRAG_CLOSE || (fast && dy > 30)) this.close(undefined, "drag");
    };
    this.addEventListener("pointerup", endDrag);
    this.addEventListener("pointercancel", endDrag);

    // `<button popovertarget>`: el navegador lo abriría solo; se intercepta para abrir por `show()`.
    this.addEventListener("beforetoggle", (e) => {
      const ev = e as ToggleEvent;
      if (ev.newState === "open" && !this.#opening && !this.#open) {
        e.preventDefault();
        void this.show(lastInvoker);
      }
    });
    // Si alguien lo cierra por fuera (`hidePopover()`), se termina igual.
    this.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState === "closed" && this.#open) this.#finish(undefined, "api", true);
    });
  }

  #outside(e: MouseEvent): boolean {
    const r = this.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  }

  #sheet(): boolean {
    return typeof matchMedia !== "undefined" && matchMedia("(max-width: 767px)").matches;
  }

  /** Un pequeño rebote: «no me puedo cerrar así». */
  #nudge(): void {
    this.classList.remove("is-nudge");
    void this.offsetWidth;
    this.classList.add("is-nudge");
  }

  #showGuard(on: boolean): void {
    if (!this.#guard) return;
    this.#guard.hidden = !on;
    if (on) {
      this.#nudge();
      this.#guard.querySelector<HTMLElement>("[data-guard='keep']")!.focus();
    } else this.#pending = null;
  }

  #finish(value: string | undefined, reason: CloseReason, silent = false): void {
    this.#open = false;
    this.returnValue = value;
    this.#showGuard(false);
    const i = stack.indexOf(this);
    if (i >= 0) stack.splice(i, 1);
    delete this.dataset.depth;
    this.removeAttribute("data-stacked");
    const origin = this.#origin;
    const hide = () => {
      if (!silent) this.hidePopover?.();
      this.removeAttribute("open");
      paintStack();
    };
    if (this.mode === "modal" && !silent) morph(this, origin, hide);
    else hide();
    // «Atrás» ya quitó la entrada; si se cerró de otra forma, se quita aquí. Sin mirar
    // `history.state`: al cerrar varios niveles seguidos, los `back()` anteriores aún no llegaron.
    if (this.pushedState && reason !== "history") queueBack();
    this.pushedState = null;
    // El foco vuelve a quien abrió (o al diálogo que queda arriba).
    const top = stack[stack.length - 1];
    if (top) top.focusFirst();
    else if (origin instanceof HTMLElement && origin.isConnected) {
      // El origen puede ser un envoltorio (<nx-button>): el foco va a lo enfocable de adentro.
      const target = origin.matches(FOCUSABLE) ? origin : origin.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? origin).focus({ preventScroll: true });
    }
    this.#resolve?.(value);
    this.#resolve = undefined;
    this.#promise = undefined;
    this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open: false, value, reason }, bubbles: true, composed: true }));
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    this.#title!.textContent = this.heading;
    this.#title!.hidden = !this.heading;
    this.#desc!.textContent = this.description;
    this.#desc!.hidden = !this.description;
    if (this.description) this.setAttribute("aria-describedby", this.#desc!.id);
    else this.removeAttribute("aria-describedby");
    this.#closeBtn!.setAttribute("aria-label", L.close);
    this.#crumbs!.setAttribute("aria-label", L.stack);
    const [msg, keep, discard] = this.#guard!.children;
    msg.textContent = L.unsaved;
    keep.textContent = L.keep;
    discard.textContent = L.discard;
  }
}
