/**
 * `<nx-sidemenu>`: menú lateral con secciones, panel flotante con buscador para los hijos de un
 * padre, modo compacto de solo íconos y drawer en móvil.
 *
 * Reglas de diseño:
 * - **Light DOM.** Los estilos vienen de `nx32-elements.css` y se pueden sobrescribir con CSS normal.
 * - **Solo AÑADE al final.** Los hijos del autor (`slot="header"`, `slot="footer"`) no se mueven;
 *   se colocan con `grid-template-areas`. Así la hidratación de Solid encuentra el DOM como lo
 *   dejó el servidor.
 * - **El navegador hace el trabajo pesado.** Cada flotante y el drawer son `popover="auto"`:
 *   capa superior, clic fuera, Escape, devolución del foco y "uno abierto a la vez" son nativos.
 * - **Las hojas son `<a href>` reales.** El router de Solid las intercepta solo; en HTML plano
 *   navegan. `nx-sidemenu-select` (cancelable) es la puerta para quien quiera decidir otra cosa.
 * - **Lo abierto no se repinta.** Con un flotante o el drill-down abiertos, un cambio de `items`,
 *   `active` o `labels` espera a que se cierren: repintar los sacaría del DOM (el popover se cierra
 *   sin aviso) y se perderían la consulta y el foco. Las claves internas también esperan (lo abierto
 *   resuelve sus clics contra lo que muestra); un cambio de `collapsed` solo pone al día los
 *   nombres accesibles del riel.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph, icon } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { badgeEl, renderChildPanel } from "./flyout";
import { formatBadge, groupBySection, resolveActive, type ActiveMatch } from "./logic";
import type { MenuItem, SidemenuLabels } from "./types";

export const DEFAULT_LABELS: SidemenuLabels = {
  nav: "Menú principal",
  filter: "Filtrar",
  empty: "Sin resultados",
  back: "Volver",
  collapse: "Contraer menú",
  expand: "Expandir menú",
};

/** Los mismos puntos de corte que `sidemenu.css`. */
const MOBILE = "(max-width: 767.98px)";
const TABLET = "(min-width: 768px) and (max-width: 1023.98px)";
const FINE_POINTER = "(pointer: fine)";

let uid = 0;

export class NxSidemenu extends Base {
  static observedAttributes = ["items", "labels", "active", "collapsed", "collapsible", "auto-collapse"];

  #items: MenuItem[] = [];
  #labels: SidemenuLabels = DEFAULT_LABELS;
  #byKey = new Map<string, MenuItem>();
  #keyOf = new Map<MenuItem, string>();
  #uid = `nx-sm${++uid}`;
  #body?: HTMLDivElement;
  #tools?: HTMLDivElement;
  #mq?: MediaQueryList;
  #tablet?: MediaQueryList;
  /** Si el estado compacto actual lo puso `auto-collapse` (y no el usuario). */
  #autoCollapsed = false;
  #mobile = false;
  #drill: MenuItem | null = null;
  #match: ActiveMatch = { item: null, trail: [] };
  /** El flotante abierto y si el drawer lo está, según `beforetoggle`/`toggle` (un popover que sale
   *  del DOM se cierra sin avisar: se reinician al desconectar). */
  #fly: HTMLElement | null = null;
  #isOpen = false;
  /** Hubo cambios mientras algo estaba abierto: se pintan al cerrarlo. */
  #stale = false;
  /** `items` cambió y las claves (`#byKey`/`#keyOf`) todavía son las de lo pintado: se rehacen al
   *  repintar, para que un flotante o drill-down abiertos resuelvan sus clics contra lo que muestran. */
  #reindex = false;
  /** En qué lado del límite de tablet se aplicó `auto-collapse` por última vez. */
  #inTablet?: boolean;
  #tip?: HTMLElement;
  #touch = false;
  #queued = false;
  #abort?: AbortController;
  #tracking?: { fly: HTMLElement; stop: () => void };

  // ---------------------------------------------------------------- propiedades

  /** Los ítems del menú. El atributo `items` acepta el mismo arreglo como JSON. */
  get items(): MenuItem[] {
    return this.#items;
  }
  set items(value: MenuItem[] | null | undefined) {
    this.#items = Array.isArray(value) ? value : [];
    this.#reindex = true;
    this.#schedule();
  }

  get labels(): SidemenuLabels {
    return this.#labels;
  }
  set labels(value: Partial<SidemenuLabels> | null | undefined) {
    this.#labels = mergeLabels(DEFAULT_LABELS, value);
    this.#schedule();
  }

  /** El href (o id) de la pantalla actual. */
  get active(): string | null {
    return this.getAttribute("active");
  }
  set active(value: string | null | undefined) {
    if (value) this.setAttribute("active", value);
    else this.removeAttribute("active");
  }

  get collapsed(): boolean {
    return boolAttr(this, "collapsed");
  }
  set collapsed(value: boolean) {
    this.#setBool("collapsed", value);
  }

  get collapsible(): boolean {
    return boolAttr(this, "collapsible");
  }
  set collapsible(value: boolean) {
    this.#setBool("collapsible", value);
  }

  /** En tablet (768–1023 px) arranca compacto; al volver a escritorio se expande si lo había
   *  contraído él. El usuario puede expandirlo a mano en cualquier momento. */
  get autoCollapse(): boolean {
    return boolAttr(this, "auto-collapse");
  }
  set autoCollapse(value: boolean) {
    this.#setBool("auto-collapse", value);
  }

  /** Si el drawer móvil está abierto. En escritorio siempre es `false`. */
  get open(): boolean {
    return this.#isOpen && this.hasAttribute("popover");
  }
  set open(value: boolean) {
    if (value) this.show();
    else this.hide();
  }

  show(): void {
    if (this.hasAttribute("popover") && !this.open) this.showPopover();
  }
  hide(): void {
    if (this.open) this.hidePopover();
  }
  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    // Una propiedad asignada antes de que el elemento se definiera (un framework que monta
    // antes de cargar la librería) quedó como propiedad propia y tapa el setter: se reaplica.
    upgrade(this);
    if (!this.#body) {
      this.#body = h("div", { class: "nx-sidemenu__body" });
      this.#tools = h("div", { class: "nx-sidemenu__tools", hidden: true });
    }

    this.#abort?.abort();
    const signal = (this.#abort = new AbortController()).signal;
    // Con el <script> en el <head>, el parser conecta el elemento ANTES de leer sus hijos: los
    // slots llegan después de nuestros contenedores. Al terminar el documento se reordena.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.#render(true), { once: true, signal });
    }
    this.addEventListener("click", this.#onClick, { signal });
    for (const type of ["pointerdown", "keydown", "pointerover", "pointerleave", "focusin", "focusout"]) this.addEventListener(type, this.#onTip, { signal });
    // `toggle`/`beforetoggle` no burbujean: en captura el host oye también los de sus flotantes.
    this.addEventListener("beforetoggle", this.#onBeforeToggle, { signal, capture: true });
    this.addEventListener("toggle", this.#onToggle, { signal, capture: true });
    this.addEventListener("focusout", this.#onFocusOut, { signal });
    document.addEventListener("keydown", this.#onEscape, { signal });
    this.#mq = matchMedia(MOBILE);
    this.#mq.addEventListener("change", () => this.#applyMode(), { signal });
    this.#tablet = matchMedia(TABLET);
    this.#tablet.addEventListener("change", () => this.#applyAutoCollapse(), { signal });
    this.#applyMode();
    this.#applyAutoCollapse();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#tracking?.stop();
    // Un popover que sale del DOM se cierra sin `toggle`. Si era el drawer se avisa igual: un `open`
    // controlado por la app no se queda en `true`.
    this.#fly = null;
    if (this.#isOpen) {
      this.#isOpen = false;
      this.#emit("nx-open-change", { open: false });
    }
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "items" || name === "labels") {
      // Quitar el atributo vuelve al valor por defecto (sin ítems, los textos de fábrica).
      if (value === null) {
        if (name === "items") this.items = [];
        else this.labels = null;
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        console.warn(`[nx-sidemenu] el atributo "${name}" no es JSON válido`);
        return;
      }
      if (name === "items") this.items = parsed as MenuItem[];
      else this.labels = parsed as Partial<SidemenuLabels>;
      return;
    }
    // Un framework puede poner el atributo después de conectar el elemento: se aplica ya.
    if (name === "auto-collapse" && this.isConnected) this.#applyAutoCollapse();
    this.#schedule();
  }

  // ---------------------------------------------------------------- estado interno

  #setBool(name: string, value: boolean): void {
    if (value) this.setAttribute(name, "");
    else this.removeAttribute(name);
  }

  /** Claves internas por posición (`"2.5"`): los ids del backend pueden repetirse. */
  #index(): void {
    this.#byKey.clear();
    this.#keyOf.clear();
    const walk = (list: MenuItem[], prefix: string) =>
      list.forEach((it, i) => {
        if (!it || typeof it !== "object") return;
        const key = prefix ? `${prefix}.${i}` : `${i}`;
        this.#byKey.set(key, it);
        this.#keyOf.set(it, key);
        if (Array.isArray(it.children)) walk(it.children, key);
      });
    walk(this.#items, "");
  }

  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected && this.#body) this.#render();
    });
  }

  /** Escritorio ⇄ drawer. El drawer es el propio host con `popover`; quitarlo lo cierra. */
  #applyMode(): void {
    this.#mobile = this.#mq?.matches ?? false;
    this.#drill = null;
    if (this.#mobile) this.setAttribute("popover", "auto");
    else if (this.hasAttribute("popover")) {
      this.hide();
      this.removeAttribute("popover");
      this.#isOpen = false;
    }
    this.#render(true);
  }

  /** Contrae o expande pasando por `nx-sidemenu-toggle` (cancelable): una app que controla el
   *  estado lo cancela y lo aplica ella, también cuando el cambio lo pide `auto-collapse`. */
  #setCollapsed(next: boolean, auto: boolean): void {
    if (next === this.collapsed) return;
    if (this.#emit("nx-sidemenu-toggle", { collapsed: next, auto }, true)) this.collapsed = next;
  }

  #applyAutoCollapse(): void {
    if (!this.#tablet) return;
    if (!this.autoCollapse) {
      this.#inTablet = undefined;
      return;
    }
    // Solo al cruzar el límite. Reconectar el nodo (un layout que lo mueve) o reasignar
    // `auto-collapse` no recalcula: olvidaría que lo contrajo él, o volvería a contraer lo que el
    // usuario expandió.
    const tablet = this.#tablet.matches;
    if (tablet === this.#inTablet) return;
    this.#inTablet = tablet;
    if (tablet) {
      if (!this.collapsed) {
        this.#autoCollapsed = true;
        this.#setCollapsed(true, true);
      }
    } else if (this.#autoCollapsed) {
      this.#autoCollapsed = false;
      this.#setCollapsed(false, true);
    }
  }

  #emit<T>(type: string, detail: T, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  // ---------------------------------------------------------------- render

  /** Pinta el riel (o el drill-down). Sin `force`, con un flotante o el drill-down abiertos solo
   *  anota el cambio: se pinta al cerrarlos. */
  #render(force = false): void {
    if (!force && (this.#fly || this.#drill)) {
      this.#stale = true;
      // El riel compacto cambia ya (lo dice el CSS): sus filas necesitan su nombre accesible.
      this.#relabel();
      return;
    }
    this.#stale = false;
    if (this.#reindex) {
      this.#reindex = false;
      this.#index();
    }
    // Un flotante abierto sale del DOM con el riel viejo (y se cierra sin `toggle`).
    this.#fly = null;
    this.#hideTip();
    const body = this.#body!;
    const tools = this.#tools!;
    // Nuestros contenedores van siempre al final (orden de tabulación: cabecera → menú → pie).
    // Solo se mueven los nodos propios; los del autor quedan donde los dejó el servidor.
    if (this.lastElementChild !== tools || tools.previousElementSibling !== body) this.append(body, tools);
    this.#tracking?.stop();
    const focused = document.activeElement as HTMLElement | null;
    const focusKey = focused && body.contains(focused) ? focused.dataset.nxKey : undefined;

    this.#match = resolveActive(this.#items, this.active);
    const compact = this.collapsed && !this.#mobile;
    body.replaceChildren(this.#drill ? this.#renderDrill(this.#drill) : this.#renderRail(compact));

    tools.hidden = !this.collapsible || this.#mobile;
    tools.replaceChildren();
    if (!tools.hidden) {
      const label = compact ? this.#labels.expand : this.#labels.collapse;
      tools.append(
        h(
          "button",
          { type: "button", class: "nx-sidemenu__item nx-sidemenu__collapse", "data-nx-collapse": "", "aria-expanded": String(!compact), "aria-label": label },
          glyph("panel"),
          h("span", { class: "nx-sidemenu__label" }, label),
        ),
      );
    }
    if (focusKey) (body.querySelector(`[data-nx-key="${focusKey}"]`) as HTMLElement | null)?.focus();
  }

  /** Con algo abierto, el riel no se repinta: solo se ponen al día los `aria-label` de sus filas y
   *  el botón de contraer (cambió `collapsed`). Las claves siguen siendo las de lo pintado. */
  #relabel(): void {
    const compact = this.collapsed && !this.#mobile;
    for (const row of this.#body?.querySelectorAll<HTMLElement>(".nx-sidemenu__nav .nx-sidemenu__item[data-nx-key]") ?? []) {
      const it = this.#byKey.get(row.dataset.nxKey!);
      if (!it) continue;
      const label = String(it.label ?? "");
      const badge = formatBadge(it.badge);
      if (compact) row.setAttribute("aria-label", badge ? `${label} (${badge})` : label);
      else row.removeAttribute("aria-label");
    }
    const btn = this.#tools?.querySelector<HTMLElement>("[data-nx-collapse]");
    if (btn) {
      const label = compact ? this.#labels.expand : this.#labels.collapse;
      btn.setAttribute("aria-expanded", String(!compact));
      btn.setAttribute("aria-label", label);
      btn.querySelector(".nx-sidemenu__label")!.textContent = label;
    }
  }

  #renderRail(compact: boolean): HTMLElement {
    const nav = h("nav", { class: "nx-sidemenu__nav", "aria-label": this.#labels.nav });
    groupBySection(this.#items.filter((it) => it && typeof it === "object")).forEach((g, gi) => {
      const hid = g.label ? `${this.#uid}-s${gi}` : null;
      if (g.label) nav.append(h("div", { id: hid, class: "nx-sidemenu__section" }, h("span", null, g.label)));
      nav.append(
        h("ul", { class: "nx-sidemenu__list", role: "list", "aria-labelledby": hid }, ...g.items.map((it) => h("li", null, ...this.#renderItem(it, compact)))),
      );
    });
    return nav;
  }

  #renderItem(it: MenuItem, compact: boolean): Node[] {
    const key = this.#keyOf.get(it)!;
    const label = String(it.label ?? "");
    const badge = formatBadge(it.badge);
    // En compacto el texto no se ve: el nombre accesible lo lleva todo, badge incluido (y la
    // etiqueta flotante lo muestra con el ratón o el teclado).
    const name = compact ? (badge ? `${label} (${badge})` : label) : null;
    const attrs = { class: "nx-sidemenu__item", "data-nx-key": key, "aria-label": name };
    const content = () => [icon(it.icon, label), h("span", { class: "nx-sidemenu__label" }, label), badgeEl(badge)];

    if (Array.isArray(it.children) && it.children.length > 0) {
      const inTrail = this.#match.trail.includes(it) || null;
      if (this.#mobile) {
        return [h("button", { ...attrs, type: "button", "data-nx-drill": "", "data-active": inTrail }, ...content(), glyph("chevron", "nx-sidemenu__chev"))];
      }
      const flyId = `${this.#uid}-f${key.replaceAll(".", "_")}`;
      return [
        h(
          "button",
          { ...attrs, type: "button", popovertarget: flyId, "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": flyId, "data-active": inTrail },
          ...content(),
          glyph("chevron", "nx-sidemenu__chev"),
        ),
        h("div", { id: flyId, class: "nx-flyout", popover: "auto", role: "dialog", "aria-label": label, "data-nx-flyout": key }),
      ];
    }

    const href = safeHref(it.href);
    const current = this.#match.item === it ? "page" : null;
    return [href ? h("a", { ...attrs, href, "aria-current": current }, ...content()) : h("button", { ...attrs, type: "button", "aria-current": current }, ...content())];
  }

  #renderDrill(item: MenuItem): HTMLElement {
    const panel = renderChildPanel({
      item,
      active: this.#match.item,
      labels: this.#labels,
      idPrefix: `${this.#uid}-d`,
      keyOf: (c) => this.#keyOf.get(c),
      autofocus: false,
    });
    return h(
      "div",
      { class: "nx-sidemenu__drill" },
      h("button", { type: "button", class: "nx-sidemenu__back", "data-nx-back": "" }, glyph("back"), h("span", null, this.#labels.back)),
      panel.el,
    );
  }

  // ---------------------------------------------------------------- panel flotante

  #onBeforeToggle = (e: Event): void => {
    const fly = e.target as HTMLElement;
    const open = (e as ToggleEvent).newState === "open";
    if (fly === this) {
      this.#isOpen = open;
      if (open) this.#confirm(fly);
      return;
    }
    const key = fly.dataset?.nxFlyout;
    if (!key) return;
    if (!open) {
      if (this.#fly === fly) this.#fly = null;
      return;
    }
    const item = this.#byKey.get(key);
    const trigger = this.querySelector<HTMLElement>(`[popovertarget="${fly.id}"]`);
    if (!item || !trigger) return;
    this.#fly = fly;
    this.#confirm(fly);
    this.#hideTip();
    const panel = renderChildPanel({
      item,
      active: this.#match.item,
      labels: this.#labels,
      idPrefix: fly.id,
      keyOf: (c) => this.#keyOf.get(c),
      // Con `autofocus` el navegador enfoca el buscador al mostrar el popover.
      autofocus: matchMedia(FINE_POINTER).matches,
      // Tab no se atrapa: cierra (el foco vuelve al disparador) y sigue su camino.
      onClose: (k) => k === "Tab" && fly.hidePopover(),
    });
    fly.replaceChildren(panel.el);
    this.#place(fly, trigger, false);
    this.#track(fly, trigger);
    // El primer frame ya mide el panel: se ajusta a la ventana antes de pintarse.
    requestAnimationFrame(() => {
      this.#place(fly, trigger, true);
      panel.revealActive();
    });
  };

  /** `beforetoggle` «open» es cancelable: si alguien lo canceló, no llega `toggle`. Se comprueba en
   *  la tarea siguiente (no en una microtarea: tras un clic en `popovertarget`, esa corre al salir de
   *  este oyente, antes de que el navegador abra el popover) y, si no se abrió, se deshace lo
   *  anotado (y se pinta lo pendiente). */
  #confirm(pop: HTMLElement): void {
    setTimeout(() => {
      if (pop.matches(":popover-open")) return;
      if (pop === this) {
        if (this.#isOpen) this.#isOpen = false;
        return;
      }
      if (this.#fly !== pop) return;
      this.#fly = null;
      if (this.#tracking?.fly === pop) this.#tracking.stop();
      pop.replaceChildren();
      if (this.#stale) this.#render();
    });
  }

  #onToggle = (e: Event): void => {
    const t = e.target as HTMLElement;
    const open = (e as ToggleEvent).newState === "open";
    if (t === this) {
      this.#isOpen = open;
      if (!open && (this.#drill || this.#stale)) {
        this.#drill = null;
        this.#render();
      }
      // Abierto por una hamburguesa (`popovertarget`), el foco se quedaría fuera del drawer.
      if (open && !this.contains(document.activeElement)) {
        const body = this.#body!;
        // Por prioridad, no por orden en el documento: la pantalla actual, su padre, o el primero.
        (body.querySelector<HTMLElement>('[aria-current="page"]') ?? body.querySelector<HTMLElement>("[data-active]") ?? body.querySelector<HTMLElement>("a, button"))?.focus();
      }
      this.#emit("nx-open-change", { open });
      return;
    }
    if (!t.dataset?.nxFlyout) return;
    this.querySelector(`[popovertarget="${t.id}"]`)?.setAttribute("aria-expanded", String(open));
    // `toggle` llega asíncrono: si ya se volvió a abrir, no se vacía.
    if (!open && this.#fly !== t) {
      if (this.#tracking?.fly === t) this.#tracking.stop();
      t.replaceChildren();
      // Lo que cambió mientras estaba abierto (el foco, si volvió al disparador, se recupera).
      if (this.#stale) this.#render();
    }
  };

  /** A la derecha del riel (a la izquierda en RTL), alineado con su disparador y dentro de la ventana. */
  #place(fly: HTMLElement, trigger: HTMLElement, clamp: boolean): void {
    const margin = 8;
    const gap = 6;
    const r = trigger.getBoundingClientRect();
    const rail = this.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const rtl = getComputedStyle(this).direction === "rtl";
    let top = r.top - 6;
    if (clamp) top = Math.min(top, vh - fly.offsetHeight - margin);
    fly.style.top = `${Math.max(margin, top)}px`;
    if (rtl) {
      fly.style.left = "auto";
      fly.style.right = `${Math.max(margin, vw - rail.left + gap)}px`;
    } else {
      const left = rail.right + gap;
      fly.style.right = "auto";
      fly.style.left = `${Math.max(margin, clamp ? Math.min(left, vw - fly.offsetWidth - margin) : left)}px`;
    }
  }

  /** Mientras el flotante está abierto lo sigue con el scroll y el resize, una vez por frame. */
  #track(fly: HTMLElement, trigger: HTMLElement): void {
    this.#tracking?.stop();
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = trigger.getBoundingClientRect();
      if (r.bottom < 0 || r.top > document.documentElement.clientHeight) fly.hidePopover();
      else this.#place(fly, trigger, true);
    };
    const onMove = (e: Event) => {
      if (e.target instanceof Node && fly.contains(e.target)) return;
      if (!raf) raf = requestAnimationFrame(update);
    };
    addEventListener("scroll", onMove, { capture: true, passive: true });
    addEventListener("resize", onMove, { passive: true });
    this.#tracking = {
      fly,
      stop: () => {
        cancelAnimationFrame(raf);
        removeEventListener("scroll", onMove, { capture: true });
        removeEventListener("resize", onMove);
        this.#tracking = undefined;
      },
    };
  }

  // ---------------------------------------------------------------- interacción

  #onClick = (e: MouseEvent): void => {
    const t = e.target as Element | null;
    if (!t?.closest) return;

    if (t.closest("[data-nx-collapse]")) {
      this.#autoCollapsed = false;
      this.#setCollapsed(!this.collapsed, false);
      return;
    }

    if (t.closest("[data-nx-back]")) {
      const from = this.#drill;
      // La clave antes de repintar: si `items` cambió mientras tanto, el índice nuevo ya no conoce `from`.
      const key = from && this.#keyOf.get(from);
      this.#drill = null;
      this.#render();
      if (key) this.#body!.querySelector<HTMLElement>(`[data-nx-key="${key}"]`)?.focus();
      return;
    }

    const el = t.closest<HTMLElement>("[data-nx-key]");
    const item = el && this.contains(el) ? this.#byKey.get(el.dataset.nxKey!) : undefined;
    if (!el || !item) return;

    if (el.hasAttribute("data-nx-drill")) {
      this.#drill = item;
      this.#render(true);
      // Con puntero fino, el buscador (o la lista, si hay pocos hijos); en táctil, «Volver».
      const target = matchMedia(FINE_POINTER).matches ? ".nx-panel__input, .nx-panel__list" : "[data-nx-back]";
      this.#body!.querySelector<HTMLElement>(target)?.focus();
      return;
    }
    // Un padre de escritorio: el navegador abre su flotante por `popovertarget`.
    if (el.hasAttribute("popovertarget")) return;

    // Una hoja (del riel, de un flotante o del drill-down). Un clic con modificador (abrir en
    // otra pestaña) es del navegador: no se anuncia ni se cierra nada.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!this.#emit("nx-sidemenu-select", { item, href: safeHref(item.href) }, true)) e.preventDefault();
    const fly = el.closest<HTMLElement>("[data-nx-flyout]");
    if (fly && fly === this.#fly) fly.hidePopover();
    this.hide();
  };

  /**
   * Escape cierra el flotante abierto o el drawer. El navegador ya lo hace con `popover="auto"`,
   * pero no todos los webviews embebidos, y con el foco fuera del panel (un toque en la
   * hamburguesa) no hay a quién pedírselo. Se cancela la tecla para no cerrar dos cosas a la vez.
   */
  #onEscape = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    // Dentro de otro popover abierto (un selector de terceros en el slot), Escape es suyo: cerrar
    // el drawer se lo llevaría también a él.
    const pop = (e.target as Element | null)?.closest?.(":popover-open");
    if (pop && pop !== this && pop !== this.#fly) return;
    const fly = this.#fly;
    if (fly) fly.hidePopover();
    else if (this.open) this.hide();
    else return;
    e.preventDefault();
  };

  /** El drawer no es modal: si el foco sale de él (Tab), se cierra, como el flotante. */
  #onFocusOut = (e: FocusEvent): void => {
    const to = e.relatedTarget as Node | null;
    if (this.open && to && !this.contains(to)) this.hide();
  };

  // ---------------------------------------------------------------- etiqueta en compacto

  /** En compacto el nombre no se ve, y un `title` no sale con el foco del teclado: una etiqueta
   *  flotante lo muestra junto al ítem al pasar el ratón o al llegar con Tab. Es solo visual: el
   *  nombre accesible ya está en `aria-label`. */
  #onTip = (e: Event): void => {
    // Un toque también enfoca: ahí la etiqueta se quedaría pegada junto al riel. Una tecla lo olvida.
    if (e.type === "pointerdown" || e.type === "keydown") {
      this.#touch = e.type === "pointerdown" && (e as PointerEvent).pointerType !== "mouse";
      return;
    }
    const touch = e.type === "pointerover" ? (e as PointerEvent).pointerType !== "mouse" : this.#touch;
    const enter = e.type === "pointerover" || e.type === "focusin";
    const row = enter && !touch && this.collapsed && !this.#mobile ? (e.target as Element).closest?.<HTMLElement>(".nx-sidemenu__item[aria-label]") : null;
    if (row && row.getAttribute("aria-expanded") !== "true") this.#showTip(row);
    else this.#hideTip();
  };

  #showTip(row: HTMLElement): void {
    const tip = (this.#tip ??= h("div", { class: "nx-sidemenu__tip", popover: "manual", "aria-hidden": "true" }));
    // Vive en el cuerpo, que se repinta: si un repintado se lo llevó, vuelve.
    if (!tip.isConnected) this.#body!.append(tip);
    tip.textContent = row.getAttribute("aria-label");
    if (!tip.matches(":popover-open")) tip.showPopover?.();
    const r = row.getBoundingClientRect();
    const rail = this.getBoundingClientRect();
    tip.style.top = `${r.top + r.height / 2}px`;
    if (getComputedStyle(this).direction === "rtl") {
      tip.style.left = "auto";
      tip.style.right = `${document.documentElement.clientWidth - rail.left + 6}px`;
    } else {
      tip.style.right = "auto";
      tip.style.left = `${rail.right + 6}px`;
    }
  }

  #hideTip(): void {
    if (this.#tip?.matches(":popover-open")) this.#tip.hidePopover();
  }
}
