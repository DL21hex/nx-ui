/**
 * Las vistas guardadas y el selector de columnas de `<nx-grid>`. Se cargan aparte: al tocar
 * «Vistas» o «Columnas», o en reposo si la tabla tiene `views-storage` (para poner en el botón el
 * nombre de la vista aplicada).
 *
 * Una vista es el estado de la tabla con un nombre (filtros, orden, agrupación, columnas ocultas y
 * anchos). Se aplica con un clic; si después se cambia algo, el botón dice «modificada» y el menú
 * ofrece guardar los cambios o guardarla como nueva.
 */
import { h } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { foldText } from "../../core/text";
import type { GridColumn, GridFilter, GridLabels, GridSavedView, GridView, GridViewLabels } from "./types";

export const VIEW_LABELS: GridViewLabels = {
  viewModified: "modificada",
  viewEmpty: "Todavía no tienes vistas. Filtra, ordena o esconde columnas y guárdalo con un nombre.",
  viewSaveNew: "Guardar como vista nueva…",
  viewSaveChanges: "Guardar los cambios en «{name}»",
  viewEdit: "Renombrar «{name}»…",
  viewDelete: "Borrar «{name}»…",
  viewDeleteYes: "Borrar",
  viewReset: "Volver a la tabla original",
  viewName: "Nombre de la vista",
  viewDefault: "Abrir la tabla con esta vista",
  viewSave: "Guardar",
  viewCancel: "Cancelar",
  viewDuplicate: "Ya tienes una vista con ese nombre.",
  viewConfirm: "¿Borrar la vista «{name}»? No se puede deshacer.",
  viewUntitled: "Vista {n}",
  columnsTitle: "Columnas visibles",
  columnsReset: "Mostrar todas, con su ancho original",
  columnsHint: "Arrastra el borde de una cabecera para cambiar su ancho; doble clic lo devuelve.",
};

/** Lo que el menú necesita de la tabla. */
export interface ViewsHost {
  readonly el: HTMLElement;
  readonly labels: GridLabels;
  /** Los textos tal como llegaron a `labels` (de ahí salen los de este módulo). */
  readonly labelsIn: unknown;
  /** Todas las columnas, también las ocultas. */
  readonly cols: GridColumn[];
  readonly hidden: ReadonlySet<string>;
  readonly view: GridView;
  readonly views: GridSavedView[];
  readonly active: string | null;
  /** Aplica una vista guardada, o la tabla original (null). */
  apply(id: string | null): void;
  /** Guarda la lista y marca cuál queda aplicada. */
  save(list: GridSavedView[], active: string | null): void;
  setHidden(key: string, hidden: boolean): void;
  resetColumns(): void;
  chipText(f: GridFilter): string;
  readonly viewsBtn: HTMLButtonElement;
  readonly colsBtn: HTMLButtonElement;
}

type Mode = "list" | "save" | "edit" | "delete";

let uid = 0;
const fmt = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

/** Dos estados iguales. Los tramos relativos («este mes») se comparan por su nombre, no por las
 *  fechas de hoy. */
export function sameView(a: GridView, b: GridView): boolean {
  const key = (v: GridView) =>
    JSON.stringify([
      v.filters.map((f) => (f.op === "range" && f.rel ? { key: f.key, rel: f.rel } : f)),
      v.sort ?? null,
      v.groupBy || "",
      [...v.hidden].sort(),
      Object.entries(v.widths).sort(([x], [y]) => (x < y ? -1 : 1)),
    ]);
  return key(a) === key(b);
}

/** La tabla sin nada: ni filtros, ni orden, ni grupos, ni columnas ocultas o con otro ancho. */
const isOriginal = (v: GridView) => !v.filters.length && !v.sort && !v.groupBy && !v.hidden.length && !Object.keys(v.widths).length;

export class ViewsUI {
  #host: ViewsHost;
  #pop: HTMLDivElement;
  #cpop: HTMLDivElement;
  #mode: Mode = "list";
  #open = new Set<HTMLDivElement>();
  /** El menú que estaba abierto al apretar su botón: el navegador lo cierra (clic afuera) antes del
   *  `click`, y sin esto el clic lo volvería a abrir. */
  #downOpen: HTMLDivElement | null = null;
  /** Lo que muestra la lista pintada (para repintarla solo si cambió). */
  #sig = "";
  #place = () => {
    for (const pop of this.#open) this.#position(pop);
  };

  constructor(host: ViewsHost) {
    this.#host = host;
    this.#pop = h("div", { class: "nx-grid__menu nx-grid__vpop", popover: "auto", role: "dialog", "data-nx-ephemeral": "" });
    this.#cpop = h("div", { class: "nx-grid__menu nx-grid__vpop", popover: "auto", role: "dialog", "data-nx-ephemeral": "" });
    for (const [pop, btn] of [
      [this.#pop, host.viewsBtn],
      [this.#cpop, host.colsBtn],
    ] as const) {
      btn.setAttribute("aria-expanded", "false");
      pop.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          this.#hide(pop, btn);
        } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          const items = [...pop.querySelectorAll<HTMLElement>(".nx-grid__menu-item")];
          const i = items.indexOf(document.activeElement as HTMLElement);
          if (i < 0) return;
          e.preventDefault();
          items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
        }
      });
      btn.addEventListener("pointerdown", () => (this.#downOpen = this.#open.has(pop) ? pop : null));
      // Después del `click` de la tabla (que llama a toggle…), registrado antes que este.
      btn.addEventListener("click", () => (this.#downOpen = null));
      // Un clic afuera lo cierra el navegador: el estado se entera antes.
      pop.addEventListener("beforetoggle", (e) => {
        if ((e as ToggleEvent).newState !== "closed") return;
        this.#forget(pop);
        btn.setAttribute("aria-expanded", "false");
      });
    }
    host.el.append(this.#pop, this.#cpop);
    this.refresh();
  }

  get #L(): GridLabels & GridViewLabels {
    return { ...this.#host.labels, ...mergeLabels(VIEW_LABELS, this.#host.labelsIn) };
  }

  /** Abre o cierra el menú de vistas; `save`: directo al formulario de guardar. */
  toggleViews(save = false): void {
    if ((this.#open.has(this.#pop) || this.#downOpen === this.#pop) && !save) return this.#hide(this.#pop, this.#host.viewsBtn);
    this.#mode = save ? "save" : "list";
    this.#paintViews();
    this.#show(this.#pop, this.#host.viewsBtn);
  }

  toggleColumns(): void {
    if (this.#open.has(this.#cpop) || this.#downOpen === this.#cpop) return this.#hide(this.#cpop, this.#host.colsBtn);
    this.#paintColumns();
    this.#show(this.#cpop, this.#host.colsBtn);
  }

  close(): void {
    for (const pop of [...this.#open]) this.#hide(pop, pop === this.#pop ? this.#host.viewsBtn : this.#host.colsBtn, false);
  }

  /** La tabla cambió: el nombre del botón (y si la vista quedó modificada), las casillas abiertas y
   *  la lista de vistas abierta, si otra pestaña guardó mientras tanto. */
  refresh(): void {
    const L = this.#L;
    const cur = this.#current();
    const mod = !!cur && !sameView(cur, this.#host.view);
    const btn = this.#host.viewsBtn;
    btn.lastElementChild!.replaceChildren(cur ? cur.name : L.views, mod ? h("small", null, ` · ${L.viewModified}`) : "");
    btn.setAttribute("aria-label", cur ? `${L.views}: ${cur.name}${mod ? ` (${L.viewModified})` : ""}` : L.views);
    if (this.#open.has(this.#cpop)) this.#syncColumns();
    if (this.#open.has(this.#pop) && this.#mode === "list" && this.#signature() !== this.#sig) {
      // El foco sigue en el mismo lugar de la lista.
      const items = () => [...this.#pop.querySelectorAll<HTMLElement>(".nx-grid__menu-item")];
      const at = items().indexOf(document.activeElement as HTMLElement);
      this.#paintViews();
      this.#position(this.#pop);
      if (at >= 0) (items()[at] ?? items().at(-1))?.focus();
    }
  }

  #signature(): string {
    const cur = this.#current();
    return JSON.stringify([this.#host.views.map((v) => [v.id, v.name, !!v.default]), this.#host.active, !!cur && !sameView(cur, this.#host.view), isOriginal(this.#host.view)]);
  }

  /** La lista guardada de ahora, no la de cuando se pintó el menú: otra pestaña, u otra tabla con la
   *  misma clave en esta página, pudo guardar mientras tanto. Lo que se guarda es un cambio puntual
   *  (agregar, reemplazar o quitar una) sobre esta lista. La tabla la limpia al guardarla. */
  #fresh(): GridSavedView[] {
    const key = this.#host.el.getAttribute("views-storage");
    try {
      const raw = key && (JSON.parse(localStorage.getItem(key) || "null") as { views?: unknown } | null)?.views;
      if (Array.isArray(raw)) return raw.filter((v): v is GridSavedView => !!v && typeof v === "object" && typeof v.id === "string" && typeof v.name === "string");
    } catch {
      /* guardado roto o sin acceso: la lista de la tabla */
    }
    return this.#host.views;
  }

  #current(): GridSavedView | undefined {
    return this.#host.views.find((v) => v.id === this.#host.active);
  }

  #show(pop: HTMLDivElement, btn: HTMLButtonElement): void {
    if (!this.#open.has(pop)) pop.showPopover?.();
    // Mientras haya uno abierto, sigue a su botón al desplazar la página o cambiar el tamaño.
    if (!this.#open.size) {
      addEventListener("resize", this.#place);
      addEventListener("scroll", this.#place, true);
    }
    this.#open.add(pop);
    btn.setAttribute("aria-expanded", "true");
    this.#position(pop);
    this.#focus(pop);
  }

  /** Bajo su botón; si no cabe abajo y arriba hay más lugar, encima. Nunca se sale de la pantalla:
   *  el alto queda acotado al lugar que hay (`--_maxh`) y lo demás se desplaza adentro. */
  #position(pop: HTMLDivElement): void {
    const r = (pop === this.#pop ? this.#host.viewsBtn : this.#host.colsBtn).getBoundingClientRect();
    const w = pop.offsetWidth || 280;
    const hgt = pop.offsetHeight;
    const below = innerHeight - r.bottom - 14;
    const above = r.top - 14;
    const up = hgt > below && above > below;
    const room = Math.max(160, up ? above : below);
    pop.style.setProperty("--_left", `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`);
    pop.style.setProperty("--_top", `${Math.max(8, up ? r.top - 6 - Math.min(hgt, room) : r.bottom + 6)}px`);
    pop.style.setProperty("--_maxh", `${room}px`);
  }

  #forget(pop: HTMLDivElement): boolean {
    const was = this.#open.delete(pop);
    if (!this.#open.size) {
      removeEventListener("resize", this.#place);
      removeEventListener("scroll", this.#place, true);
    }
    return was;
  }

  #hide(pop: HTMLDivElement, btn: HTMLButtonElement, focus = true): void {
    const was = this.#forget(pop);
    btn.setAttribute("aria-expanded", "false");
    if (was) pop.hidePopover?.();
    if (focus) btn.focus();
  }

  /** El foco entra donde se sigue: el nombre en un formulario, la vista aplicada en la lista. */
  #focus(pop: HTMLElement): void {
    const el = pop.querySelector<HTMLElement>("input[type=text], [aria-current=true], button, input");
    el?.focus();
    if (el instanceof HTMLInputElement && el.type === "text") el.select();
  }

  #item(text: string | Node, fn: () => void, attrs: Record<string, string | null> = {}): HTMLButtonElement {
    const b = h("button", { type: "button", class: "nx-grid__menu-item", ...attrs }, text);
    b.addEventListener("click", fn);
    return b;
  }

  #to(mode: Mode): void {
    this.#mode = mode;
    this.#paintViews();
    this.#position(this.#pop);
    this.#focus(this.#pop);
  }

  // ---------------------------------------------------------------- vistas

  #paintViews(): void {
    const L = this.#L;
    const host = this.#host;
    const views = host.views;
    const cur = this.#current();
    const mod = !!cur && !sameView(cur, host.view);
    const done = () => this.#hide(this.#pop, host.viewsBtn);
    let body: (Node | null)[];
    if (this.#mode === "delete" && cur) {
      const yes = h("button", { type: "button", class: "nx-grid__btn is-danger" }, L.viewDeleteYes);
      yes.addEventListener("click", () => {
        host.save(
          this.#fresh().filter((v) => v.id !== cur.id),
          null,
        );
        done();
      });
      body = [h("p", { class: "nx-grid__v-text" }, fmt(L.viewConfirm, { name: cur.name })), h("div", { class: "nx-grid__v-actions" }, this.#cancel(), yes)];
    } else if (this.#mode === "save" || (this.#mode === "edit" && cur)) {
      body = [this.#form(this.#mode === "edit" ? cur : undefined)];
    } else {
      body = [
        views.length
          ? h(
              "div",
              { class: "nx-grid__v-list", role: "group", "aria-label": L.views },
              ...views.map((v) =>
                this.#item(
                  h("span", null, v.name, v.default ? h("span", { class: "nx-grid__v-def", title: L.viewDefault }, " ★") : null),
                  () => {
                    host.apply(v.id);
                    done();
                  },
                  { "aria-current": v.id === host.active ? "true" : null, "data-view": v.id },
                ),
              ),
            )
          : h("p", { class: "nx-grid__v-text" }, L.viewEmpty),
        h("hr"),
        cur && mod
          ? this.#item(fmt(L.viewSaveChanges, { name: cur.name }), () => {
              const list = this.#fresh();
              const now = list.find((v) => v.id === cur.id);
              // Si otra pestaña la borró mientras tanto, vuelve a quedar guardada.
              host.save(now ? list.map((v) => (v === now ? { ...v, ...host.view } : v)) : [...list, { ...cur, ...host.view }], cur.id);
              done();
            })
          : null,
        this.#item(L.viewSaveNew, () => this.#to("save")),
        cur ? this.#item(fmt(L.viewEdit, { name: cur.name }), () => this.#to("edit")) : null,
        cur ? this.#item(fmt(L.viewDelete, { name: cur.name }), () => this.#to("delete")) : null,
        cur || !isOriginal(host.view) ? h("hr") : null,
        cur || !isOriginal(host.view)
          ? this.#item(L.viewReset, () => {
              host.apply(null);
              done();
            })
          : null,
      ];
    }
    this.#pop.setAttribute("aria-label", L.views);
    this.#pop.replaceChildren(...body.filter((x): x is Node => !!x));
    this.#sig = this.#signature();
  }

  #cancel(): HTMLButtonElement {
    const b = h("button", { type: "button", class: "nx-grid__btn" }, this.#L.viewCancel);
    b.addEventListener("click", () => this.#to("list"));
    return b;
  }

  /** Guardar una vista nueva (con el estado de ahora) o renombrar la aplicada. */
  #form(cur: GridSavedView | undefined): HTMLFormElement {
    const L = this.#L;
    const host = this.#host;
    const id = `nx-grid-view${++uid}`;
    const name = h("input", { type: "text", id, class: "nx-grid__field", required: true, maxlength: 80, autocomplete: "off" });
    name.value = cur ? cur.name : this.#suggest();
    const def = h("input", { type: "checkbox" });
    def.checked = !!cur?.default;
    const err = h("p", { class: "nx-grid__v-error", role: "alert", hidden: true });
    const form = h(
      "form",
      { class: "nx-grid__v-form" },
      h("label", { for: id }, L.viewName),
      name,
      err,
      h("label", { class: "nx-grid__opt" }, def, h("span", null, L.viewDefault)),
      h("div", { class: "nx-grid__v-actions" }, this.#cancel(), h("button", { type: "submit", class: "nx-grid__btn is-primary" }, L.viewSave)),
    );
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return name.focus();
      const views = this.#fresh();
      if (views.some((v) => v.id !== cur?.id && foldText(v.name) === foldText(n))) {
        err.textContent = L.viewDuplicate;
        err.hidden = false;
        name.setAttribute("aria-invalid", "true");
        return name.focus();
      }
      // Solo una abre la tabla.
      const rest = def.checked ? views.map((v) => ({ ...v, default: false })) : views;
      if (cur) {
        const now = rest.some((v) => v.id === cur.id);
        host.save(now ? rest.map((v) => (v.id === cur.id ? { ...v, name: n, default: def.checked } : v)) : [...rest, { ...cur, name: n, default: def.checked }], host.active);
      } else {
        const v: GridSavedView = { id: `v${Date.now().toString(36)}${(++uid).toString(36)}`, name: n, ...host.view, default: def.checked };
        host.save([...rest, v], v.id);
      }
      this.#hide(this.#pop, host.viewsBtn);
    });
    return form;
  }

  /** El nombre que se propone: lo que dicen los chips, o «Vista 3». */
  #suggest(): string {
    const text = this.#host.view.filters.map((f) => this.#host.chipText(f)).join(" · ");
    return (text.length > 60 ? `${text.slice(0, 59)}…` : text) || fmt(this.#L.viewUntitled, { n: this.#host.views.length + 1 });
  }

  // ---------------------------------------------------------------- columnas

  #paintColumns(): void {
    const L = this.#L;
    const host = this.#host;
    const list = h(
      "div",
      { class: "nx-grid__f-opts", role: "group", "aria-label": L.columnsTitle },
      ...host.cols.map((c) => h("label", { class: "nx-grid__opt" }, h("input", { type: "checkbox", "data-col": c.key }), h("span", { class: "nx-grid__opt-label" }, c.label))),
    );
    list.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.col !== undefined) host.setHidden(t.dataset.col, !t.checked);
    });
    const reset = h("button", { type: "button", class: "nx-grid__clear" }, L.columnsReset);
    reset.addEventListener("click", () => host.resetColumns());
    this.#cpop.setAttribute("aria-label", L.columnsTitle);
    this.#cpop.replaceChildren(h("strong", { class: "nx-grid__v-title" }, L.columnsTitle), list, h("p", { class: "nx-grid__f-hint" }, L.columnsHint), reset);
    this.#syncColumns();
  }

  /** Las casillas al día; la última columna visible no se puede esconder. */
  #syncColumns(): void {
    const boxes = [...this.#cpop.querySelectorAll<HTMLInputElement>("input[data-col]")];
    const shown = boxes.filter((b) => !this.#host.hidden.has(b.dataset.col!)).length;
    for (const b of boxes) {
      b.checked = !this.#host.hidden.has(b.dataset.col!);
      b.disabled = b.checked && shown === 1;
    }
  }
}
