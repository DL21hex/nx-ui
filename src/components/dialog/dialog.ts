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
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { FOCUSABLE, focusFrom, stepTab, tabOrder } from "../../core/order";
import type { BadgeTone } from "../badge/types";
import type { DialogHead } from "./dialog-head";
import type { CloseReason, DialogAction, DialogLabels, DialogMode, DialogSize } from "./types";

export const DIALOG_LABELS: DialogLabels = {
  close: "Cerrar",
  prev: "Registro anterior",
  next: "Registro siguiente",
  more: "Más acciones",
  unsaved: "Tienes cambios sin guardar",
  discard: "Descartar",
  keep: "Seguir editando",
  stack: "Niveles abiertos",
};

const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
/** Las capas que viven fuera del diálogo y pueden tener el foco encima de él: los avisos, la paleta
 *  de comandos y un popover abierto que cuelga de <body> y no es otro diálogo (la tarjeta de
 *  <nx-explain> o de <nx-trend>, un recorrido). De estos últimos, solo los que se abrieron después
 *  del diálogo (ver `layer()`). */
const LAYER = "nx-toaster, nx-command, body > :popover-open:not(nx-dialog)";
/** Cuánto vale «lo último que se pulsó» como origen de un `show()` sin foco (ms). */
const INVOKER_TTL = 10_000;
/** Cerrar arrastrando: esta distancia (px), o un gesto rápido. */
const DRAG_CLOSE = 120;

let uid = 0;
/** Distingue esta carga de la página: el historial conserva estados de cargas anteriores. */
const SESSION = Math.random().toString(36).slice(2, 8);
/** Los diálogos abiertos, en el orden en que se abrieron (el último está arriba). */
const stack: NxDialog[] = [];
let lastInvoker: Element | null = null;
let invokedAt = 0;
let wired = false;
/** Los saltos de historial que hizo la librería: sus `popstate` no son la persona pulsando «atrás». */
let ownBacks = 0;
/** Las entradas por quitar en el próximo salto, de la de más arriba a la de más abajo. */
let backQueue: string[] = [];

/** Quita la entrada `state` de un diálogo cerrado. Varios cierres seguidos (las migas cierran varios
 *  niveles) van en un solo `history.go(-n)`: los `back()` seguidos el navegador los fusiona.
 *
 *  Solo se retrocede si la entrada de arriba del historial sigue siendo la del diálogo (antes de
 *  encolar y justo antes de saltar). Si la app navegó mientras tanto (un enlace dentro del diálogo,
 *  un router que lo desmonta al cambiar de ruta), retroceder desharía esa navegación: la entrada
 *  del diálogo se queda, y «atrás» sobre ella no hace nada. */
function queueBack(state: string): void {
  const top = backQueue[0] ?? state;
  if (history.state?.nxDialog !== top) return;
  if (backQueue.push(state) > 1) return;
  setTimeout(() => {
    const n = backQueue.length;
    const first = backQueue[0];
    backQueue = [];
    if (history.state?.nxDialog !== first) return;
    ownBacks++;
    history.go(-n);
  });
}

/** La URL de la entrada de historial de un diálogo: del mismo origen (`pushState` no acepta otro, y
 *  lanzaría a medio abrir) y de un esquema navegable. */
function historyUrl(url: string): string | undefined {
  const href = url ? safeHref(url) : location.href;
  if (!href) return undefined;
  try {
    const u = new URL(href, location.href);
    if (u.origin === location.origin) return u.href;
  } catch {
    /* inválida */
  }
  console.warn(`[nx-dialog] url fuera del origen de la página, se ignora: ${url}`);
  return undefined;
}

/** Listeners de documento, una sola vez: Escape y Tab van al diálogo de arriba. */
function wire(): void {
  if (wired || typeof document === "undefined") return;
  wired = true;
  // El botón que abrió el diálogo (para nacer de él y devolverle el foco).
  const invoker = (el: Element | null | undefined) => {
    lastInvoker = el ?? null;
    invokedAt = performance.now();
  };
  document.addEventListener("click", (e) => invoker((e.target as Element).closest?.("[popovertarget], [data-nx-origin]") ?? lastInvoker), true);
  document.addEventListener("pointerdown", (e) => invoker((e.target as Element).closest?.("button, a, [role='button'], [data-nx-origin]")), true);
  document.addEventListener("keydown", (e) => stack[stack.length - 1]?.handleKey(e));
  document.addEventListener("focusin", (e) => {
    const t = e.target as Element;
    // El foco se fue a otro lado (con el teclado, o lo movió la app): el botón pulsado ya no es el origen.
    if (lastInvoker && !lastInvoker.contains(t)) lastInvoker = null;
    const top = stack[stack.length - 1];
    // El foco no se escapa del diálogo de arriba (las capas de `LAYER` sí pueden recibirlo).
    if (top && !top.contains(t) && !top.layer(t)) top.focusFirst();
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

/** Lo último que se pulsó, si fue hace poco: un `show()` por temporizador no nace de un botón de hace minutos. */
const recentInvoker = () => (performance.now() - invokedAt < INVOKER_TTL ? lastInvoker : null);
const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const visible = (el: Element | null | undefined): el is HTMLElement => !!el?.isConnected && (el as HTMLElement).getClientRects?.().length > 0;
/** El popover está en la capa superior (sin la API, o si el selector no existe, se supone que no). */
const popoverOpen = (el: Element): boolean => {
  try {
    return el.matches(":popover-open");
  } catch {
    return false;
  }
};

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
  static observedAttributes = ["heading", "description", "labels", "open", "mode", "badge", "badge-tone", "avatar", "nav", "actions"];

  #uid = `nx-dialog${++uid}`;
  #labels: DialogLabels = DIALOG_LABELS;
  #built = false;
  #open = false;
  #opening = false;
  /** Cada apertura y cada cierre la suben: lo diferido de una sesión anterior (el cambio de View
   *  Transitions de un cierre seguido de una apertura, o al revés) ve que ya no es suyo y no hace nada. */
  #gen = 0;
  /** El componente está poniendo o quitando `open`: no es la app pidiendo abrir o cerrar. */
  #reflecting = false;
  /** El `aria-labelledby` es el del título (no uno del autor). */
  #ownLabel = false;
  #origin: Element | null = null;
  #resolve?: (v: string | undefined) => void;
  #promise?: Promise<string | undefined>;
  #dirty = false;
  #pending: { value: string | undefined; reason: CloseReason } | null = null;
  #downOutside = false;
  #drag: { y: number; t: number; id: number } | null = null;
  /** Los popovers de la página que ya estaban abiertos al abrirse: quedan debajo, el foco no va a ellos. */
  #under = new Set<Element>();
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
  #actions: DialogAction[] = [];
  /** La cabecera de ficha (avatar, estado, pasar de registro, «Más»): un chunk aparte. */
  #extras?: Promise<DialogHead>;

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
  /** El estado del registro, en una píldora al lado del título («Activa»). */
  get badge(): string | null {
    return this.getAttribute("badge");
  }
  set badge(v: string | null | undefined) {
    this.#attr("badge", v);
  }
  /** Tono de la píldora: `neutral`, `success`, `info`, `warning` o `danger`. */
  get badgeTone(): BadgeTone | null {
    return this.getAttribute("badge-tone") as BadgeTone | null;
  }
  set badgeTone(v: BadgeTone | null | undefined) {
    this.#attr("badge-tone", v);
  }
  /** Quién o qué es: una imagen (URL https o del mismo origen) o un nombre, del que salen las iniciales. */
  get avatar(): string | null {
    return this.getAttribute("avatar");
  }
  set avatar(v: string | null | undefined) {
    this.#attr("avatar", v);
  }
  /** Pasar al registro anterior o siguiente sin cerrar (abierto desde una tabla): `"prev next"`,
   *  `"next"`, `"prev"` o `""` (los dos botones, deshabilitados). Avisa con `nx-dialog-nav`. */
  get nav(): string | null {
    return this.getAttribute("nav");
  }
  set nav(v: string | null | undefined) {
    this.#attr("nav", v);
  }
  /** El menú «Más» de la cabecera. El atributo acepta el mismo arreglo como JSON. */
  get actions(): DialogAction[] {
    return this.#actions;
  }
  set actions(v: DialogAction[] | null | undefined) {
    this.#actions = Array.isArray(v) ? v.filter((a) => a && typeof a === "object" && a.id != null && typeof a.label === "string").map((a) => ({ ...a, id: String(a.id) })) : [];
    this.#paint();
  }
  get labels(): DialogLabels {
    return this.#labels;
  }
  set labels(v: Partial<DialogLabels> | null | undefined) {
    this.#labels = mergeLabels(DIALOG_LABELS, v);
    this.#paint();
  }

  // ---------------------------------------------------------------- API

  /** Abre el diálogo. `origin`: de dónde nace (por defecto, el botón que se acaba de pulsar).
   *  La promesa se resuelve al cerrarse, con el valor de cierre. */
  show(origin?: Element | null): Promise<string | undefined> {
    if (this.#open && this.#promise) return this.#promise;
    // Fuera del documento no hay capa superior: quedaría en la pila, atrapando Tab en toda la página.
    if (!this.isConnected) return Promise.resolve(undefined);
    wire();
    if (!this.#built) this.#build();
    this.#open = true;
    this.#dirty = false;
    this.returnValue = undefined;
    // De dónde nace: lo que se pasa, o el control con foco (quien lo abrió con teclado o clic), o
    // lo último que se pulsó (Safari no enfoca los botones al hacer clic).
    const active = document.activeElement;
    this.#origin = origin ?? (active && active !== document.body && !this.contains(active) ? active : recentInvoker());
    // La de esta apertura: si falla en el acto (`showPopover` lanza), `#finish` ya la resolvió y la quitó.
    const promise = (this.#promise = new Promise((r) => (this.#resolve = r)));
    this.#under = new Set([...document.body.children].filter((c) => !c.matches("nx-dialog, nx-toaster, nx-command") && popoverOpen(c)));
    stack.push(this);
    const gen = ++this.#gen;
    const update = () => {
      // Se cerró (o se volvió a abrir) antes de que llegara este cuadro.
      if (gen !== this.#gen) return;
      this.#opening = true;
      try {
        // Ya a la vista: un cierre que se deshizo antes de ocultarlo (`close(); show()`).
        if (!popoverOpen(this)) this.showPopover?.();
      } catch (err) {
        // Se quitó del documento entre `show()` y este cuadro: no queda abierto a medias.
        console.warn("[nx-dialog] no se pudo abrir", err);
        this.#opening = false;
        if (this.#open) this.#finish(undefined, "api", true);
        return;
      } finally {
        this.#opening = false;
      }
      this.#reflect(true);
      paintStack();
      this.focusFirst();
      // Ya en la capa superior: quien escucha (los avisos de `nxToast`, que vuelven a subir) lo
      // hace sobre el diálogo ya visible. Con View Transitions esto llega un cuadro después.
      if (this.#open) this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open: true }, bubbles: true, composed: true }));
    };
    if (this.url !== null && typeof history !== "undefined" && typeof location !== "undefined") {
      const url = historyUrl(this.url);
      const state = `${SESSION}:${this.#uid}`;
      try {
        if (url) {
          history.pushState({ ...history.state, nxDialog: state }, "", url);
          this.pushedState = state;
        }
      } catch (err) {
        console.warn("[nx-dialog] no se pudo agregar la entrada de historial", err);
      }
    }
    // Los paneles se deslizan desde el borde; el modal nace del botón.
    if (this.mode === "modal") morph(this.#origin, this, update);
    else update();
    return promise;
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
    upgrade(this);
    wire();
    if (!this.#built) this.#build();
    this.#paint();
    if (this.hasAttribute("open") && !this.#open) queueMicrotask(() => void (this.isConnected && !this.#open && this.show()));
  }

  disconnectedCallback(): void {
    if (this.#open) this.#finish(undefined, "api", true);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "labels" || name === "actions") {
      // Quitar el atributo vuelve a lo de fábrica (sin acciones, los textos por defecto).
      if (value === null) return void (name === "labels" ? (this.labels = null) : (this.actions = null));
      try {
        const parsed = JSON.parse(value);
        if (name === "labels") this.labels = parsed;
        else this.actions = parsed;
      } catch {
        console.warn(`[nx-dialog] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "open") {
      if (this.#reflecting) return;
      if (value !== null && !this.#open && this.isConnected && this.#built) void this.show();
      else if (value === null && this.#open) this.close(undefined, "api");
      return;
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- usado por el módulo

  /** Escape y Tab mientras es el diálogo de arriba. */
  handleKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || (e.key !== "Escape" && e.key !== "Tab")) return;
    // El foco está en una capa de encima (la tarjeta de <nx-explain>): Escape y Tab son de ella.
    const a = document.activeElement;
    if (a && !this.contains(a) && this.layer(a)) return;
    if (e.key === "Escape") {
      // Un popover del autor abierto adentro (un menú propio): Escape lo cierra a él, no al diálogo.
      if (this.#popoverInside()) return;
      e.preventDefault();
      if (this.#guard && !this.#guard.hidden) return this.#showGuard(false);
      if (this.persistent) return this.#nudge();
      this.close(undefined, "escape");
    } else {
      // Tab recorre el diálogo en el orden en que se ve (la cabecera, que el componente agrega al
      // final, va primero; el pie, al final) y da la vuelta en los extremos. Adonde el navegador ya
      // va solo, lo hace él (así recorre los segmentos de una fecha o un shadow DOM).
      const back = e.shiftKey;
      const { els, to, native } = stepTab(this, a, back);
      if (native) return;
      e.preventDefault();
      // Si el de destino no acepta el foco, el siguiente: el foco nunca se queda atascado.
      if (!focusFrom(els, to ? els.indexOf(to) : back ? els.length - 1 : 0, back, true)) this.focus();
    }
  }

  /** `el` está en una capa de encima del diálogo (`LAYER`), no en un popover que ya estaba debajo. */
  layer(el: Element): boolean {
    const l = el.closest?.(LAYER);
    return !!l && !this.#under.has(l);
  }

  /** El primer campo (o `[autofocus]`); si no hay, el diálogo mismo. */
  focusFirst(): void {
    // `[autofocus]` puede ser un envoltorio (un <nx-button>): se enfoca lo enfocable de adentro.
    const auto = this.querySelector<HTMLElement>("[autofocus]");
    const inner = auto && (auto.matches(FOCUSABLE) ? auto : auto.querySelector<HTMLElement>(FOCUSABLE));
    // El primero en el orden en que se ve (no el pie, aunque el autor lo haya puesto antes en el DOM).
    const body = tabOrder(this).filter((el) => !this.#head?.contains(el));
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

  /** Un popover del autor abierto dentro del diálogo, que Escape cierra (no uno `manual`). */
  #popoverInside(): boolean {
    try {
      return !!this.querySelector(":popover-open:not(nx-dialog, [popover='manual'])");
    } catch {
      return false;
    }
  }

  /** Pone o quita `open` sin que `attributeChangedCallback` lo tome por un pedido de la app. */
  #reflect(on: boolean): void {
    this.#reflecting = true;
    try {
      this.toggleAttribute("open", on);
    } finally {
      this.#reflecting = false;
    }
  }

  #build(): void {
    this.#built = true;
    if (!this.hasAttribute("popover")) this.setAttribute("popover", "manual");
    this.setAttribute("role", this.getAttribute("role") ?? "dialog");
    this.setAttribute("aria-modal", "true");
    // El nombre sale del título; si el autor puso su `aria-labelledby`, ese manda (y sin título, su `aria-label`).
    this.#ownLabel = !this.hasAttribute("aria-labelledby");
    if (!this.hasAttribute("tabindex")) this.tabIndex = -1;

    this.#crumbs = h("nav", { class: "nx-dialog__crumbs", hidden: true });
    this.#title = h("h2", { class: "nx-dialog__title", id: `${this.#uid}-h` });
    this.#desc = h("p", { class: "nx-dialog__desc", id: `${this.#uid}-d` });
    this.#closeBtn = h("button", { type: "button", class: "nx-dialog__x nx-dialog__tool" }, glyph(X));
    // `__id`, `__trow` y `__tools` reciben lo de la cabecera de ficha cuando se carga.
    this.#head = h(
      "div",
      { class: "nx-dialog__head" },
      h("span", { class: "nx-dialog__handle", "aria-hidden": "true" }),
      this.#crumbs,
      h("div", { class: "nx-dialog__id" }, h("div", { class: "nx-dialog__titles" }, h("div", { class: "nx-dialog__trow" }, this.#title), this.#desc)),
      h("div", { class: "nx-dialog__tools" }, this.#closeBtn),
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
    // La cabecera es pegajosa: las pestañas (`<nx-tabs sticky>`) se pegan justo debajo.
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => this.style.setProperty("--nx-sticky-top", `${this.#head!.offsetHeight}px`)).observe(this.#head);
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
    // No cuentan los controles de consulta de los componentes de adentro (`data-nx-ephemeral`: el
    // buscador de un <nx-select>, las facetas o las casillas de una <nx-grid>): buscar o
    // filtrar no es cambiar datos. Sí cuentan sus cambios de valor (`nx-change`, `nx-grid-change`).
    const touch = (e: Event) => {
      const t = e.target as Element;
      if (this.#head!.contains(t) || this.#guard!.contains(t) || t.closest?.("[data-nx-ephemeral]")) return;
      if (e.type === "nx-grid-change" && e.defaultPrevented) return;
      this.#dirty = true;
    };
    for (const type of ["input", "change", "nx-change", "nx-grid-change"]) this.addEventListener(type, touch);
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
    // El `toggle` llega en otra tarea: si mientras tanto se volvió a mostrar, ese cierre ya no aplica.
    this.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState === "closed" && this.#open && !popoverOpen(this)) this.#finish(undefined, "api", true);
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
    this.#under.clear();
    const gen = ++this.#gen;
    this.returnValue = value;
    this.#showGuard(false);
    const i = stack.indexOf(this);
    if (i >= 0) stack.splice(i, 1);
    delete this.dataset.depth;
    this.removeAttribute("data-stacked");
    const origin = this.#origin;
    const hide = () => {
      // Se volvió a abrir antes de que llegara este cuadro: el diálogo sigue a la vista.
      if (gen !== this.#gen) return;
      if (!silent) {
        try {
          this.hidePopover?.();
        } catch {
          /* ya estaba oculto */
        }
      }
      this.#reflect(false);
      paintStack();
    };
    if (this.mode === "modal" && !silent) morph(this, origin, hide);
    else hide();
    // «Atrás» ya quitó la entrada; si se cerró de otra forma, se quita aquí (si sigue arriba: ver
    // `queueBack`, que también resuelve varios niveles cerrados seguidos).
    if (this.pushedState && reason !== "history") queueBack(this.pushedState);
    this.pushedState = null;
    // El foco vuelve a quien abrió: en la página, o dentro del diálogo que queda arriba (el botón
    // «Ver proveedor» del panel del pedido). Si no está, al primer campo del diálogo de arriba.
    const top = stack[stack.length - 1];
    if (origin instanceof HTMLElement && origin.isConnected && (!top || top.contains(origin))) {
      // El origen puede ser un envoltorio (<nx-button>): el foco va a lo enfocable de adentro.
      const target = origin.matches(FOCUSABLE) ? origin : origin.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? origin).focus({ preventScroll: true });
    } else top?.focusFirst();
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
    // Sin título, un `aria-labelledby` a un h2 vacío no nombra nada: queda el `aria-label` del autor.
    if (this.#ownLabel) {
      if (this.heading) this.setAttribute("aria-labelledby", this.#title!.id);
      else this.removeAttribute("aria-labelledby");
    }
    this.#desc!.textContent = this.description;
    this.#desc!.hidden = !this.description;
    if (this.description) this.setAttribute("aria-describedby", this.#desc!.id);
    else this.removeAttribute("aria-describedby");
    this.#closeBtn!.setAttribute("aria-label", L.close);

    // Cabecera de ficha: se trae solo si el diálogo la usa (los modales no la pagan).
    if (this.#extras || this.avatar || this.badge || this.nav !== null || this.#actions.length) {
      // Si el chunk no llega (la red), se avisa y el próximo pintado lo vuelve a pedir.
      const extras = (this.#extras ??= import("./dialog-head").then((m) => new m.DialogHead(this, this.#head!, this.#uid)));
      extras.then(
        (x) => x.paint(this.#labels),
        (err) => {
          if (this.#extras !== extras) return;
          this.#extras = undefined;
          console.warn("[nx-dialog] no se pudo cargar la cabecera de ficha", err);
        },
      );
    }
    this.#crumbs!.setAttribute("aria-label", L.stack);
    const [msg, keep, discard] = this.#guard!.children;
    msg.textContent = L.unsaved;
    keep.textContent = L.keep;
    discard.textContent = L.discard;
  }
}
