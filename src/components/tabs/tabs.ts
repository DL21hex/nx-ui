/**
 * `<nx-tabs>`: pestañas para separar temas de una ficha (Resumen, Datos, Documentos, Historial).
 *
 * Los paneles son los hijos con `data-tab="Etiqueta"` (y opcionales `data-value`, `data-count`,
 * `data-errors`, `data-disabled`): no se mueven, la hidratación de Solid sigue intacta. El
 * componente agrega al final la lista de pestañas, que el CSS pone arriba (`order`), y marca los
 * paneles (`role="tabpanel"`, `hidden` en los que no se ven). Con `tabs` (BDUI) la lista sale de
 * ahí y los paneles se buscan por `data-value`; si un panel no está, la app pinta el contenido al
 * oír `nx-tabs-change`.
 *
 * Teclado de la APG: flechas, Inicio y Fin mueven y activan; Tab entra al panel. `nx-tabs-change` es
 * cancelable (cambios sin guardar). Con `sticky`, la lista se queda arriba al desplazarse; dentro
 * de un `<nx-dialog>`, justo debajo de su cabecera.
 *
 * Como la lista va después de los paneles en el DOM, Tab la recorre primero: con `reading-flow`
 * (tabs.css) donde existe, y si no, lo corrige el componente (dentro de un `<nx-dialog>`, lo hace él).
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import { FOCUSABLE, shown, stepTab, tabOrder } from "../../core/order";
import type { TabChangeDetail, TabItem, TabsLabels } from "./types";

export const TABS_LABELS: TabsLabels = { errors: "{n} por corregir" };

const WATCH = ["data-tab", "data-value", "data-count", "data-errors", "data-disabled"];

let uid = 0;
/** En el turno de un Tab: 1 hacia adelante, -1 hacia atrás (para saber cómo entró el foco). */
let tabbing = 0;
let wired = false;
function wire(): void {
  if (wired) return;
  wired = true;
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab") return;
      tabbing = e.shiftKey ? -1 : 1;
      setTimeout(() => (tabbing = 0));
    },
    true,
  );
}
/** El navegador ordena Tab según `order` (tabs.css): no hace falta corregirlo. */
const readingFlow = () => typeof CSS !== "undefined" && !!CSS.supports?.("reading-flow", "flex-visual");

const num = (v: unknown) => {
  const n = Number(v);
  return v !== null && v !== undefined && v !== "" && Number.isFinite(n) ? n : undefined;
};

export class NxTabs extends Base {
  static observedAttributes = ["value", "tabs", "sticky", "label", "labels"];

  #uid = `nx-tabs${++uid}`;
  #tabs: TabItem[] | null = null;
  #labels: TabsLabels = TABS_LABELS;
  #list?: HTMLDivElement;
  /** Los hijos que entran o salen, y los `data-*` de cada hijo (no lo de adentro de los paneles). */
  #mo?: MutationObserver;
  #queued = false;
  #current: string | null = null;

  // ---------------------------------------------------------------- propiedades

  /** La pestaña activa. Si falta o no existe, la primera habilitada. */
  get value(): string | null {
    return this.#current ?? this.getAttribute("value");
  }
  set value(v: string | null | undefined) {
    if (v == null) this.removeAttribute("value");
    else this.setAttribute("value", String(v));
  }

  /** Las pestañas (BDUI). El atributo acepta el mismo arreglo como JSON. */
  get tabs(): TabItem[] | null {
    return this.#tabs;
  }
  set tabs(v: TabItem[] | null | undefined) {
    this.#tabs = Array.isArray(v) ? v.filter((t) => t && typeof t === "object" && t.value != null && typeof t.label === "string").map((t) => ({ ...t, value: String(t.value) })) : null;
    this.#queue();
  }

  /** La lista se queda arriba al desplazarse. */
  get sticky(): boolean {
    return boolAttr(this, "sticky");
  }
  set sticky(v: boolean | null | undefined) {
    if (v) this.setAttribute("sticky", "");
    else this.removeAttribute("sticky");
  }

  /** Nombre de la lista para el lector de pantalla («Secciones del empleado»). */
  get label(): string | null {
    return this.getAttribute("label");
  }
  set label(v: string | null | undefined) {
    if (v == null) this.removeAttribute("label");
    else this.setAttribute("label", v);
  }

  get labels(): TabsLabels {
    return this.#labels;
  }
  set labels(v: Partial<TabsLabels> | null | undefined) {
    this.#labels = mergeLabels(TABS_LABELS, v);
    this.#queue();
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    wire();
    if (!this.#list) this.#build();
    // Con el script en el <head>, los hijos todavía no existen: se repinta cuando llegan.
    this.#watch();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.#paint(), { once: true });
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#mo?.disconnect();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "tabs" || name === "labels") {
      if (value === null) return void (name === "tabs" ? (this.tabs = null) : (this.labels = null));
      try {
        const parsed = JSON.parse(value);
        if (name === "tabs") this.tabs = parsed;
        else this.labels = parsed;
      } catch {
        console.warn(`[nx-tabs] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "value") this.#current = null;
    this.#queue();
  }

  // ---------------------------------------------------------------- interno

  #build(): void {
    this.#list = h("div", { class: "nx-tabs__list", role: "tablist" });
    this.#list.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-v]");
      if (b && !b.disabled) this.#select(b.dataset.v!, false);
    });
    this.#list.addEventListener("keydown", (e) => this.#key(e));
    this.addEventListener("keydown", (e) => this.#tab(e));
    this.addEventListener("focusin", (e) => this.#enter(e));
    if (typeof MutationObserver !== "undefined")
      this.#mo = new MutationObserver((records) => {
        // Agregar la lista misma no cambia nada.
        if (records.some((r) => r.type === "attributes" || ![...r.addedNodes, ...r.removedNodes].every((n) => n === this.#list))) this.#queue();
      });
  }

  /** Observa los hijos directos: cuáles hay y sus `data-*`. Sin `subtree`, lo que pasa dentro de un
   *  panel (una grilla que se desplaza) no llega aquí. Se rehace en cada pintado (cambian los hijos). */
  #watch(): void {
    const mo = this.#mo;
    if (!mo || !this.isConnected) return;
    mo.disconnect();
    mo.observe(this, { childList: true });
    for (const el of this.children) if (el !== this.#list) mo.observe(el, { attributes: true, attributeFilter: WATCH });
  }

  #queue(): void {
    if (this.#queued || !this.isConnected) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#paint();
    });
  }

  /** Los paneles: hijos directos con `data-tab` (o, con `tabs`, con `data-value`). */
  #panels(): HTMLElement[] {
    return [...this.children].filter((el): el is HTMLElement => el !== this.#list && (el.hasAttribute("data-tab") || (!!this.#tabs && el.hasAttribute("data-value"))));
  }

  #items(panels: HTMLElement[]): TabItem[] {
    if (this.#tabs) return this.#tabs;
    return panels.map((p) => ({
      value: p.dataset.value ?? p.dataset.tab ?? "",
      label: p.dataset.tab ?? "",
      count: num(p.dataset.count),
      errors: num(p.dataset.errors),
      disabled: p.hasAttribute("data-disabled") && p.dataset.disabled !== "false",
    }));
  }

  #panelFor(panels: HTMLElement[], value: string): HTMLElement | undefined {
    return panels.find((p) => (p.dataset.value ?? p.dataset.tab) === value);
  }

  #paint(): void {
    if (!this.#list || !this.isConnected) return;
    const panels = this.#panels();
    const items = this.#items(panels);
    const enabled = items.filter((t) => !t.disabled);
    const want = this.#current ?? this.getAttribute("value");
    const active = items.find((t) => t.value === want && !t.disabled)?.value ?? enabled[0]?.value ?? null;
    this.#current = active;
    const L = this.#labels;

    const label = this.label;
    if (label) this.#list.setAttribute("aria-label", label);
    else this.#list.removeAttribute("aria-label");
    const focused = this.#list.contains(document.activeElement);
    const fmt = nxFormat(resolveLocale(this));
    // Los botones que ya están se actualizan en su lugar; solo se crean o quitan los que sobran.
    const buttons = [...this.#list.children] as HTMLButtonElement[];
    for (const b of buttons.splice(items.length)) b.remove();
    items.forEach((t, i) => {
      const on = t.value === active;
      const id = `${this.#uid}-t${i}`;
      const panel = this.#panelFor(panels, t.value);
      let b = buttons[i];
      if (!b) {
        b = h("button", { type: "button", role: "tab", class: "nx-tabs__tab", id }, h("span"));
        this.#list!.append(b);
      }
      b.dataset.v = t.value;
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
      if (panel) b.setAttribute("aria-controls", this.#panelId(panel, i));
      else b.removeAttribute("aria-controls");
      b.disabled = !!t.disabled;
      const text = b.firstElementChild!;
      if (text.textContent !== t.label) text.textContent = t.label;
      // El contador (o los errores, que ganan): se rehace solo si cambió lo que dice.
      const err = !!t.errors && t.errors > 0;
      const n = err ? t.errors : t.count;
      const txt = n === undefined ? "" : fmt.number(n);
      const key = txt && `${err ? L.errors : "#"}\n${txt}`;
      if ((b.dataset.pill ?? "") !== key) {
        if (b.lastElementChild !== text) b.lastElementChild!.remove();
        if (err) b.append(h("span", { class: "nx-tabs__count is-error" }, h("span", { "aria-hidden": "true" }, txt), h("span", { class: "nx-sr-only" }, L.errors.replace("{n}", txt))));
        else if (txt) b.append(h("span", { class: "nx-tabs__count" }, txt));
        b.dataset.pill = key;
      }
      if (panel) {
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", id);
        if (!panel.hasAttribute("tabindex")) panel.tabIndex = 0;
        panel.hidden = !on;
      }
    });
    // Paneles que ya no tienen pestaña (cambió `tabs`): ocultos.
    for (const p of panels) if (!items.some((t) => this.#panelFor([p], t.value))) p.hidden = true;
    if (this.#list.parentNode !== this) this.append(this.#list);
    if (focused) this.#list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    this.#watch();
  }

  /** Tab sigue el orden en que se ve (la lista primero) cuando el navegador no lo hace solo: sin
   *  `reading-flow`, con la lista después de los paneles y fuera de un `<nx-dialog>` (que ordena
   *  Tab en todo su contenido). */
  #reorder(): boolean {
    return !!this.#list?.previousElementSibling && !readingFlow() && !this.closest("nx-dialog");
  }

  /** Tab dentro de las pestañas: al siguiente en el orden en que se ve, o afuera por el lado que toca. */
  #tab(e: KeyboardEvent): void {
    if (e.key !== "Tab" || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || !this.#reorder()) return;
    const back = e.shiftKey;
    let to = stepTab(this, document.activeElement, back).to;
    // Sale de las pestañas: si están dentro de otras, esas eligen (el evento les llega después).
    if (!to && !this.parentElement?.closest("nx-tabs")) to = this.#outside(back) ?? null;
    if (!to) return;
    e.preventDefault();
    to.focus();
  }

  /** El foco entra con Tab desde afuera: por la lista (hacia adelante) o por el final del panel (hacia atrás). */
  #enter(e: FocusEvent): void {
    const from = e.relatedTarget as Node | null;
    if (!tabbing || (from && this.contains(from)) || !this.#reorder()) return;
    const els = tabOrder(this);
    const want = tabbing > 0 ? els[0] : els[els.length - 1];
    if (want && want !== e.target) want.focus();
  }

  /** El primer enfocable después de las pestañas (o el último antes), en el orden del documento. */
  #outside(back: boolean): HTMLElement | undefined {
    const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !this.contains(el) && shown(el));
    const after = (el: Element) => !!(this.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    return back ? all.filter((el) => !after(el)).pop() : all.find(after);
  }

  #panelId(panel: HTMLElement, i: number): string {
    if (!panel.id) panel.id = `${this.#uid}-p${i}`;
    return panel.id;
  }

  #select(value: string, focus: boolean): void {
    const previous = this.#current;
    if (value === previous) return;
    const detail: TabChangeDetail = { value, previous };
    if (!this.dispatchEvent(new CustomEvent("nx-tabs-change", { detail, bubbles: true, composed: true, cancelable: true }))) return;
    this.#current = value;
    this.#paint();
    const tab = this.#list!.querySelector<HTMLElement>('[aria-selected="true"]');
    if (focus) tab?.focus();
    tab?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    // Con la lista pegada arriba, el panel nuevo empieza a la vista (no a media altura del anterior).
    const panel = this.#panelFor(this.#panels(), value);
    if (this.sticky && panel && panel.getBoundingClientRect().top < this.#list!.getBoundingClientRect().bottom) panel.scrollIntoView?.({ block: "start" });
  }

  #key(e: KeyboardEvent): void {
    const tabs = [...this.#list!.querySelectorAll<HTMLButtonElement>("[data-v]")].filter((b) => !b.disabled);
    const i = tabs.findIndex((b) => b === document.activeElement);
    if (i < 0) return;
    const rtl = getComputedStyle(this).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 }[e.key];
    const to = step !== undefined ? (i + step + tabs.length) % tabs.length : e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    this.#select(tabs[to].dataset.v!, true);
    tabs[to].focus();
  }
}
