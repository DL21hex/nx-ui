/**
 * `<nx-select>`: un select con buscador que busca en VARIAS columnas a la vez (nombre, cédula,
 * cargo…). Cerrado es un campo compacto con lo elegido; se abre con un clic o al empezar a
 * escribir sobre él, y al elegir se cierra. Con `multiple`, lo elegido queda como chips.
 *
 * Los datos son JSON: `fields` declara las columnas y `options` los registros; para catálogos
 * grandes, `source="/url"` busca en el servidor mientras se escribe (`?q=`). Participa en un
 * <form> nativo con `name` y `required`.
 */
import { Base, boolAttr } from "../../core/define";
import { h } from "../../core/dom";
import { glyph } from "../../core/icons";
import { listKeyStep } from "../../core/keys";
import { fieldText, formatDigits, initialsOf, matchOption, matchRanges, searchOptions, searchScope, type Match } from "./logic";
import type { SelectField, SelectLabels, SelectOption } from "./types";

export const SELECT_LABELS: SelectLabels = {
  placeholder: "Selecciona…",
  search: "Buscar",
  empty: "Sin resultados",
  loading: "Buscando…",
  error: "No se pudo buscar",
  clear: "Limpiar",
  onlyField: "Buscando solo por {field}",
  matchedIn: "coincide en {fields}",
};

const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const DEBOUNCE_MS = 250;
const PROPS = ["options", "fields", "value", "selection", "multiple", "placeholder", "source", "name", "required", "disabled", "clearable", "avatar", "labels", "limit"] as const;

let uid = 0;

export class NxSelect extends Base {
  static formAssociated = true;
  static observedAttributes = ["options", "fields", "value", "multiple", "placeholder", "source", "name", "required", "disabled", "clearable", "avatar", "labels", "limit", "label"];

  #options: SelectOption[] = [];
  #fields: SelectField[] = [{ key: "label", label: "" }];
  #labels: SelectLabels = SELECT_LABELS;
  #selected: SelectOption[] = [];
  #pendingValue: string[] | null = null;
  #uid = `nx-sel${++uid}`;
  #internals: ElementInternals | null = null;
  #built = false;
  // Estado del panel abierto.
  #isOpen = false;
  #query = "";
  #matches: Match[] = [];
  #highlighted = -1;
  #remote: SelectOption[] = [];
  #loading = false;
  #failed = false;
  #timer = 0;
  #abort?: AbortController;
  #lastPointer: { x: number; y: number } | null = null;
  #track?: () => void;
  // Nodos.
  #field?: HTMLDivElement;
  #pop?: HTMLDivElement;
  #input?: HTMLInputElement;
  #hint?: HTMLParagraphElement;
  #list?: HTMLDivElement;

  constructor() {
    super();
    // Sin DOM (SSR) no hay `attachInternals`; en navegadores viejos, tampoco: el select funciona
    // igual, solo no participa en el <form>.
    try {
      this.#internals = (this as HTMLElement).attachInternals?.() ?? null;
    } catch {
      this.#internals = null;
    }
  }

  // ---------------------------------------------------------------- propiedades

  get options(): SelectOption[] {
    return this.#options;
  }
  set options(v: SelectOption[] | null | undefined) {
    this.#options = Array.isArray(v) ? v.filter((o) => o && typeof o === "object" && o.value !== undefined).map((o) => ({ ...o, value: String(o.value) })) : [];
    this.#resolvePending();
    this.#paint();
  }
  get fields(): SelectField[] {
    return this.#fields;
  }
  set fields(v: SelectField[] | null | undefined) {
    const list = Array.isArray(v) ? v.filter((f) => f && typeof f.key === "string") : [];
    this.#fields = list.length ? list : [{ key: "label", label: "" }];
    this.#paint();
  }
  /** `string` en simple (`""` sin selección); `string[]` con `multiple`. */
  get value(): string | string[] {
    const vals = this.#selected.map((o) => o.value);
    return this.multiple ? vals : (vals[0] ?? "");
  }
  set value(v: string | string[] | null | undefined) {
    const vals = (Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : [v]).map(String);
    this.#pendingValue = vals;
    this.#resolvePending();
    this.#paint();
  }
  /** Los registros elegidos. Para `source`, el backend los manda para pintar la selección inicial. */
  get selection(): SelectOption[] {
    return [...this.#selected];
  }
  set selection(v: SelectOption[] | null | undefined) {
    // `undefined` no toca nada (un framework que no la pasa); `null` o `[]` limpian.
    if (v === undefined) return;
    this.#selected = Array.isArray(v) ? v.filter((o) => o && o.value !== undefined).map((o) => ({ ...o, value: String(o.value) })) : [];
    if (!this.multiple) this.#selected = this.#selected.slice(0, 1);
    this.#pendingValue = null;
    this.#sync();
    this.#paint();
  }
  get multiple(): boolean {
    return boolAttr(this, "multiple");
  }
  set multiple(v: boolean) {
    this.#bool("multiple", v);
  }
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? this.#labels.placeholder;
  }
  set placeholder(v: string) {
    this.#attr("placeholder", v);
  }
  /** URL de búsqueda en el servidor: se pide `source?q=…` y se espera un arreglo (o `{options}`). */
  get source(): string | null {
    return this.getAttribute("source");
  }
  set source(v: string | null) {
    this.#attr("source", v);
  }
  get name(): string {
    return this.getAttribute("name") ?? "";
  }
  set name(v: string) {
    this.#attr("name", v);
  }
  get required(): boolean {
    return boolAttr(this, "required");
  }
  set required(v: boolean) {
    this.#bool("required", v);
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    this.#bool("disabled", v);
  }
  get clearable(): boolean {
    return boolAttr(this, "clearable");
  }
  set clearable(v: boolean) {
    this.#bool("clearable", v);
  }
  /** Iniciales de la columna principal delante de cada registro (útil para personas). */
  get avatar(): boolean {
    return boolAttr(this, "avatar");
  }
  set avatar(v: boolean) {
    this.#bool("avatar", v);
  }
  get limit(): number {
    const n = Number(this.getAttribute("limit"));
    return Number.isFinite(n) && n > 0 ? n : 50;
  }
  set limit(v: number) {
    this.#attr("limit", String(v));
  }
  get labels(): SelectLabels {
    return this.#labels;
  }
  set labels(v: Partial<SelectLabels> | null | undefined) {
    this.#labels = { ...SELECT_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }
  get open(): boolean {
    return this.#isOpen;
  }

  show(): void {
    if (!this.disabled && this.#pop && !this.open) this.#pop.showPopover();
  }
  hide(): void {
    if (this.open) this.#pop!.hidePopover();
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
    if (!this.#built) this.#build();
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#track?.();
    this.#abort?.abort();
    clearTimeout(this.#timer);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (value !== null && (name === "options" || name === "fields" || name === "labels" || (name === "value" && this.multiple))) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-select] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "value") this.value = value;
    else {
      if (name === "required") this.#sync();
      this.#paint();
    }
  }

  /** Un <form reset> vuelve a la selección vacía. */
  formResetCallback(): void {
    this.selection = [];
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }
  #bool(name: string, v: boolean): void {
    if (v) this.setAttribute(name, "");
    else this.removeAttribute(name);
  }

  /** Un `value` que llegó antes que sus `options` se resuelve cuando llegan. */
  #resolvePending(): void {
    const want = this.#pendingValue;
    if (!want) return;
    const known = [...this.#options, ...this.#selected, ...this.#remote];
    const found = want.map((v) => known.find((o) => o.value === v)).filter((o): o is SelectOption => !!o);
    if (found.length === want.length || this.#options.length) {
      this.#selected = this.multiple ? found : found.slice(0, 1);
      this.#pendingValue = found.length === want.length ? null : want;
      this.#sync();
    }
  }

  /** El valor para el <form> y la validez de `required`. */
  #sync(): void {
    const i = this.#internals;
    if (!i) return;
    try {
      if (this.multiple) {
        const fd = new FormData();
        for (const o of this.#selected) fd.append(this.name, o.value);
        i.setFormValue(this.#selected.length ? fd : null);
      } else i.setFormValue(this.#selected[0]?.value ?? null);
      if (this.required && !this.#selected.length) i.setValidity({ valueMissing: true }, this.#labels.placeholder, this.#field);
      else i.setValidity({});
    } catch {
      /* happy-dom y navegadores sin form-associated: se ignora */
    }
  }

  #emit(): void {
    this.#sync();
    this.dispatchEvent(new CustomEvent("nx-change", { detail: { value: this.value, options: this.selection }, bubbles: true, composed: true }));
  }

  #build(): void {
    this.#built = true;
    const popId = `${this.#uid}-pop`;
    const listId = `${this.#uid}-list`;
    this.#field = h("div", { class: "nx-select__field", role: "combobox", tabindex: "0", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-controls": popId });
    this.#input = h("input", {
      type: "text",
      class: "nx-select__input",
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": listId,
      "aria-autocomplete": "list",
      autocomplete: "off",
      spellcheck: "false",
      autofocus: true,
    });
    this.#hint = h("p", { class: "nx-select__hint", hidden: true });
    this.#list = h("div", { id: listId, class: "nx-select__list", role: "listbox" });
    this.#pop = h(
      "div",
      { id: popId, class: "nx-select__pop", popover: "auto" },
      h("div", { class: "nx-select__search" }, glyph("search", "nx-select__search-icon"), this.#input, h("span", { class: "nx-spinner nx-select__spin", hidden: true })),
      this.#hint,
      this.#list,
    );
    this.append(this.#field, this.#pop);

    const f = this.#field;
    // Con el panel abierto, presionar sobre el campo ya lo cierra (clic fuera del popover): ese
    // mismo clic no debe volver a abrirlo.
    let wasOpen = false;
    f.addEventListener("pointerdown", () => (wasOpen = this.open));
    f.addEventListener("click", (e) => {
      const x = (e.target as Element).closest<HTMLElement>("[data-remove], [data-clear]");
      if (x) {
        e.stopPropagation();
        if (x.dataset.clear !== undefined) this.#setSelection([]);
        else this.#setSelection(this.#selected.filter((o) => o.value !== x.dataset.remove));
        return;
      }
      if (this.open) this.hide();
      else if (!wasOpen) this.show();
      wasOpen = false;
    });
    f.addEventListener("keydown", (e) => {
      if (this.disabled) return;
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.show();
      } else if ((e.key === "Backspace" || e.key === "Delete") && this.clearable && this.#selected.length) {
        this.#setSelection([]);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Escribir sobre el campo cerrado abre el buscador con esa letra.
        e.preventDefault();
        this.#query = e.key;
        this.show();
      }
    });

    this.#pop.addEventListener("beforetoggle", (e) => {
      // `beforetoggle` es síncrono (también al cerrar por clic fuera): de aquí sale `open`.
      this.#isOpen = (e as ToggleEvent).newState === "open";
      if (!this.#isOpen) return;
      this.#input!.value = this.#query;
      this.#highlighted = -1;
      this.#refresh(true);
      this.#place();
      requestAnimationFrame(() => {
        this.#place();
        const at = this.#input!.value.length;
        this.#input!.setSelectionRange(at, at);
      });
      this.#startTracking();
    });
    this.#pop.addEventListener("toggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      this.#field!.setAttribute("aria-expanded", String(open));
      if (!open && !this.open) {
        this.#track?.();
        this.#abort?.abort();
        clearTimeout(this.#timer);
        this.#query = "";
      }
    });

    this.#input.addEventListener("input", () => {
      this.#query = this.#input!.value;
      this.#highlighted = -1;
      this.#refresh(false);
    });
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !this.#input!.value && this.multiple && this.#selected.length) {
        this.#setSelection(this.#selected.slice(0, -1));
        return;
      }
      const step = listKeyStep(e.key, this.#highlighted, this.#matches.length);
      if (step === null) return;
      if (step === "close") {
        // Escape y Tab cierran (Escape explícito: no todos los webviews lo hacen solos).
        if (e.key === "Escape") e.preventDefault();
        this.hide();
        if (e.key === "Escape") this.#field!.focus();
        return;
      }
      e.preventDefault();
      if (step === "select") this.#pick(this.#matches[this.#highlighted]?.option);
      else this.#highlight(step, true);
    });

    // Clic en una opción sin robarle el foco al buscador.
    this.#list.addEventListener("mousedown", (e) => e.preventDefault());
    this.#list.addEventListener("click", (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[role="option"]');
      if (el) this.#pick(this.#matches[Number(el.dataset.i)]?.option);
    });
    this.#list.addEventListener("mousemove", (e) => {
      const moved = this.#lastPointer !== null && (this.#lastPointer.x !== e.clientX || this.#lastPointer.y !== e.clientY);
      this.#lastPointer = { x: e.clientX, y: e.clientY };
      const el = (e.target as Element).closest<HTMLElement>('[role="option"]');
      if (moved && el) this.#highlight(Number(el.dataset.i), false);
    });
  }

  #setSelection(next: SelectOption[]): void {
    this.#selected = next;
    this.#pendingValue = null;
    this.#paint();
    if (this.open) this.#renderList();
    this.#emit();
  }

  #pick(option: SelectOption | undefined): void {
    if (!option || option.disabled) return;
    if (!this.multiple) {
      this.#setSelection([option]);
      this.hide();
      this.#field!.focus();
      return;
    }
    const has = this.#selected.some((o) => o.value === option.value);
    this.#setSelection(has ? this.#selected.filter((o) => o.value !== option.value) : [...this.#selected, option]);
  }

  /** Recalcula los resultados: filtro local o búsqueda en el servidor (con espera entre teclas). */
  #refresh(opening: boolean): void {
    const src = this.source;
    if (!src) {
      this.#matches = searchOptions(this.#options, this.#fields, this.#query).slice(0, this.limit);
      this.#renderList();
      return;
    }
    clearTimeout(this.#timer);
    this.#loading = true;
    this.#renderList();
    this.#timer = window.setTimeout(() => void this.#fetch(src), opening ? 0 : DEBOUNCE_MS);
  }

  async #fetch(src: string): Promise<void> {
    this.#abort?.abort();
    const ctrl = (this.#abort = new AbortController());
    const q = this.#query;
    try {
      const url = new URL(src, location.href);
      url.searchParams.set("q", q.trim());
      const res = await fetch(url, { signal: ctrl.signal, credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as unknown;
      const list = Array.isArray(data) ? data : (data as { options?: unknown })?.options;
      this.#remote = (Array.isArray(list) ? list : []).filter((o) => o && o.value !== undefined).map((o) => ({ ...o, value: String(o.value) }));
      this.#failed = false;
    } catch (err) {
      if (ctrl.signal.aborted) return;
      this.#remote = [];
      this.#failed = true;
      void err;
    }
    this.#loading = false;
    // El servidor ya filtró y ordenó: se respeta su orden, y aquí solo se calcula qué resaltar.
    this.#matches = this.#remote.slice(0, this.limit).map((o) => matchOption(o, this.#fields, q) ?? { option: o, fields: [], score: 0 });
    this.#resolvePending();
    this.#renderList();
  }

  #highlight(i: number, scroll: boolean): void {
    const opts = this.#list!.querySelectorAll<HTMLElement>('[role="option"]');
    opts[this.#highlighted]?.setAttribute("data-hl", "false");
    this.#highlighted = i;
    const el = opts[i];
    if (el) {
      el.setAttribute("data-hl", "true");
      this.#input!.setAttribute("aria-activedescendant", el.id);
      if (scroll) el.scrollIntoView({ block: "nearest" });
    } else this.#input!.removeAttribute("aria-activedescendant");
  }

  /** Un texto con los tramos coincidentes en <mark> (siempre como nodos de texto). */
  #marked(text: string, kind: SelectField["kind"]): DocumentFragment {
    let ranges = this.#query.trim() ? matchRanges(text, this.#query, kind) : [];
    let shown = text;
    if (kind === "digits") ({ text: shown, ranges } = formatDigits(text, ranges));
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const [a, b] of ranges) {
      if (a > at) frag.append(shown.slice(at, a));
      frag.append(h("mark", null, shown.slice(a, b)));
      at = b;
    }
    if (at < shown.length) frag.append(shown.slice(at));
    return frag;
  }

  /** Nombre y línea secundaria de un registro (compartido por la lista y el campo cerrado). */
  #describe(o: SelectOption, marked: boolean): { primary: Node; secondary: Node | null } {
    const [main, ...rest] = this.#fields;
    const primary = marked ? this.#marked(fieldText(o, main.key), main.kind) : document.createTextNode(fieldText(o, main.key));
    const parts = rest.filter((f) => fieldText(o, f.key));
    if (!parts.length) return { primary, secondary: null };
    const sec = document.createDocumentFragment();
    parts.forEach((f, i) => {
      if (i) sec.append(" · ");
      const v = fieldText(o, f.key);
      sec.append(marked ? this.#marked(v, f.kind) : f.kind === "digits" ? formatDigits(v).text : v);
    });
    return { primary, secondary: sec };
  }

  #renderList(): void {
    const list = this.#list!;
    const scope = searchScope(this.#fields, this.#query);
    const only = scope.digitsOnly ? scope.fields.map((f) => f.label).join(", ") : "";
    this.#hint!.hidden = !only;
    this.#hint!.textContent = only ? this.#labels.onlyField.replace("{field}", only) : "";
    this.#pop!.querySelector<HTMLElement>(".nx-select__spin")!.hidden = !this.#loading;
    this.#input!.placeholder = this.#fields.map((f) => f.label).filter(Boolean).join(", ") || this.#labels.search;
    this.#input!.setAttribute("aria-label", this.#labels.search);
    list.setAttribute("aria-multiselectable", String(this.multiple));
    list.classList.toggle("nx-select__list--stale", this.#loading);

    const chosen = new Set(this.#selected.map((o) => o.value));
    const primaryKey = this.#fields[0].key;
    list.replaceChildren(
      ...this.#matches.map((m, i) => {
        const o = m.option;
        const { primary, secondary } = this.#describe(o, true);
        const why = this.#query.trim() ? m.fields.filter((k) => k !== primaryKey) : [];
        const whyText = why.map((k) => this.#fields.find((f) => f.key === k)?.label ?? k).join(" + ");
        return h(
          "div",
          {
            id: `${this.#uid}-o${i}`,
            class: "nx-select__opt",
            role: "option",
            "data-i": i,
            "data-hl": String(i === this.#highlighted),
            "aria-selected": String(chosen.has(o.value)),
            "aria-disabled": o.disabled ? "true" : null,
          },
          this.avatar ? h("span", { class: "nx-select__avatar", "aria-hidden": "true" }, initialsOf(fieldText(o, primaryKey))) : null,
          h("span", { class: "nx-select__text" }, h("span", { class: "nx-select__primary" }, primary), secondary ? h("span", { class: "nx-select__secondary" }, secondary) : null),
          whyText ? h("span", { class: "nx-select__why", title: this.#labels.matchedIn.replace("{fields}", whyText) }, whyText) : null,
          this.multiple || chosen.has(o.value) ? glyph(CHECK, "nx-select__check") : null,
        );
      }),
    );
    if (!this.#matches.length) {
      const msg = this.#loading ? this.#labels.loading : this.#failed ? this.#labels.error : this.#labels.empty;
      list.append(h("p", { class: "nx-select__empty" }, msg));
    }
    if (this.#highlighted < 0 && this.#matches.length && this.#query.trim()) this.#highlight(0, false);
  }

  /** El campo cerrado: lo elegido (o el placeholder), limpiar y el chevron. */
  #paint(): void {
    if (!this.#built) return;
    const f = this.#field!;
    f.setAttribute("aria-disabled", String(this.disabled));
    f.tabIndex = this.disabled ? -1 : 0;
    const label = this.getAttribute("label");
    if (label) f.setAttribute("aria-label", label);
    const sel = this.#selected;
    const nodes: (Node | null)[] = [];
    if (!sel.length) nodes.push(h("span", { class: "nx-select__placeholder" }, this.placeholder));
    else if (this.multiple) {
      nodes.push(
        h(
          "span",
          { class: "nx-select__chips" },
          ...sel.map((o) => {
            const text = fieldText(o, this.#fields[0].key) || o.value;
            return h("span", { class: "nx-select__chip" }, text, h("span", { class: "nx-select__chip-x", "data-remove": o.value, "aria-hidden": "true" }, glyph(X)));
          }),
        ),
      );
    } else {
      const o = sel[0];
      const { primary, secondary } = this.#describe(o, false);
      if (this.avatar) nodes.push(h("span", { class: "nx-select__avatar", "aria-hidden": "true" }, initialsOf(fieldText(o, this.#fields[0].key))));
      nodes.push(h("span", { class: "nx-select__text" }, h("span", { class: "nx-select__primary" }, primary), secondary ? h("span", { class: "nx-select__secondary" }, secondary) : null));
    }
    if (this.clearable && sel.length && !this.disabled) {
      nodes.push(h("span", { class: "nx-select__clear", "data-clear": "", title: this.#labels.clear, "aria-hidden": "true" }, glyph(X)));
    }
    nodes.push(glyph(CHEVRON, "nx-select__chev"));
    f.replaceChildren(...nodes.filter((n): n is Node => !!n));
  }

  /** Debajo del campo, con su ancho (mínimo 280 px); arriba si abajo no cabe. */
  #place(): void {
    const pop = this.#pop!;
    const r = this.#field!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = Math.min(Math.max(r.width, 280), vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    const ph = pop.offsetHeight;
    const below = vh - r.bottom - 6;
    const top = ph > below && r.top > below ? Math.max(8, r.top - 6 - ph) : r.bottom + 6;
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px`, inlineSize: `${width}px` });
  }

  #startTracking(): void {
    this.#track?.();
    let raf = 0;
    const onMove = (e: Event) => {
      if (e.target instanceof Node && this.#pop!.contains(e.target)) return;
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), this.#place()));
    };
    addEventListener("scroll", onMove, { capture: true, passive: true });
    addEventListener("resize", onMove, { passive: true });
    this.#track = () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onMove, { capture: true });
      removeEventListener("resize", onMove);
      this.#track = undefined;
    };
  }
}
