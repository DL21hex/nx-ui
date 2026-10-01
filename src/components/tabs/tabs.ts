/**
 * `<nx-tabs>`: pestañas para separar temas de una ficha (Resumen, Datos, Documentos, Historial).
 *
 * Los paneles son los hijos con `data-tab="Etiqueta"` (y opcionales `data-value`, `data-count`,
 * `data-errors`, `data-disabled`): no se mueven, la hidratación de Solid sigue intacta. El
 * componente agrega al final la lista de pestañas, que el CSS pone arriba (`order`), y marca los
 * paneles (`role="tabpanel"`, `hidden` en los que no se ven). Con `tabs` (BDUI) la lista sale de
 * ahí y los paneles se buscan por `data-value`; si un panel no está, la app pinta el contenido al
 * oír `nx-tab-change`.
 *
 * Teclado de la APG: flechas, Inicio y Fin mueven y activan; Tab entra al panel. `nx-tab-change` es
 * cancelable (cambios sin guardar). Con `sticky`, la lista se queda arriba al desplazarse; dentro
 * de un `<nx-dialog>`, justo debajo de su cabecera.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import type { TabChangeDetail, TabItem, TabsLabels } from "./types";

export const TABS_LABELS: TabsLabels = { errors: "{n} por corregir" };

const WATCH = ["data-tab", "data-value", "data-count", "data-errors", "data-disabled"];

let uid = 0;

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
    if (!this.#list) this.#build();
    // Con el script en el <head>, los hijos todavía no existen: se repinta cuando llegan.
    this.#mo?.observe(this, { childList: true, subtree: true, attributes: true, attributeFilter: WATCH });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.#paint(), { once: true });
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#mo?.disconnect();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "tabs" || name === "labels") {
      if (value === null) return void (name === "tabs" && (this.tabs = null));
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
    if (typeof MutationObserver !== "undefined")
      this.#mo = new MutationObserver((records) => {
        // Solo lo que cambia la lista: hijos del elemento (no los de la lista ni los de un panel)
        // y los `data-*` de los paneles.
        if (records.some((r) => (r.type === "childList" ? r.target === this : r.target.parentNode === this))) this.#queue();
      });
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
    this.#list.replaceChildren(
      ...items.map((t, i) => {
        const on = t.value === active;
        const id = `${this.#uid}-t${i}`;
        const panel = this.#panelFor(panels, t.value);
        const pill =
          t.errors && t.errors > 0
            ? h("span", { class: "nx-tabs__count is-error" }, h("span", { "aria-hidden": "true" }, String(t.errors)), h("span", { class: "nx-sr-only" }, L.errors.replace("{n}", String(t.errors))))
            : t.count !== undefined
              ? h("span", { class: "nx-tabs__count" }, String(t.count))
              : null;
        const b = h("button", { type: "button", role: "tab", class: "nx-tabs__tab", id, "data-v": t.value, "aria-selected": String(on), tabindex: on ? "0" : "-1", "aria-controls": panel ? this.#panelId(panel, i) : null, disabled: !!t.disabled }, h("span", null, t.label), pill);
        if (panel) {
          panel.setAttribute("role", "tabpanel");
          panel.setAttribute("aria-labelledby", id);
          if (!panel.hasAttribute("tabindex")) panel.tabIndex = 0;
          panel.hidden = !on;
        }
        return b;
      }),
    );
    // Paneles que ya no tienen pestaña (cambió `tabs`): ocultos.
    for (const p of panels) if (!items.some((t) => this.#panelFor([p], t.value))) p.hidden = true;
    if (this.#list.parentNode !== this) this.append(this.#list);
    if (focused) this.#list.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }

  #panelId(panel: HTMLElement, i: number): string {
    if (!panel.id) panel.id = `${this.#uid}-p${i}`;
    return panel.id;
  }

  #select(value: string, focus: boolean): void {
    const previous = this.#current;
    if (value === previous) return;
    const detail: TabChangeDetail = { value, previous };
    if (!this.dispatchEvent(new CustomEvent("nx-tab-change", { detail, bubbles: true, composed: true, cancelable: true }))) return;
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
