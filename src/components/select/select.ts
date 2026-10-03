/**
 * `<nx-select>`: un select con buscador que busca en VARIAS columnas a la vez (nombre, cédula,
 * cargo…). Cerrado es un campo compacto con lo elegido; se abre con un clic o al empezar a
 * escribir sobre él, y al elegir se cierra. Con `multiple`, lo elegido queda como chips.
 *
 * Los datos son JSON: `fields` declara las columnas y `options` los registros; para catálogos
 * grandes, `source="/url"` busca en el servidor mientras se escribe (`?q=`). Es un control de
 * formulario completo (ElementInternals): `name`, `required` con su aviso, `reset` al valor
 * inicial, `<fieldset disabled>`, `<label for>` y la API de validez.
 */
import { Base, boolAttr, upgrade, attrProps } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { glyph } from "../../core/icons";
import { listKeyStep } from "../../core/keys";
import { mergeLabels } from "../../core/labels";
import { fieldText, formatDigits, initialsOf, matchOption, matchRanges, searchOptions, searchScope, uniqueOptions, type Match } from "./logic";
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
  required: "Elige una opción de la lista.",
};

const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const DEBOUNCE_MS = 250;

let uid = 0;

/** Un valor de afuera como lista de textos: `"2"`, `["1","2"]`, `null` o `""` (nada). */
const valuesOf = (v: unknown): string[] => (Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : [v]).map(String);

export class NxSelect extends Base {
  static formAssociated = true;
  static {
    attrProps(this, ["label"]);
  }
  declare label: string | null;
  static observedAttributes = ["options", "fields", "value", "multiple", "placeholder", "source", "name", "required", "disabled", "clearable", "avatar", "labels", "limit", "label"];

  #options: SelectOption[] = [];
  #fields: SelectField[] = [{ key: "label", label: "" }];
  #labels: SelectLabels = SELECT_LABELS;
  /** Lo elegido. Sin `multiple` cuenta solo el primero (`#chosen`): un `value` de varios que llega
   *  antes que `multiple` (el orden de un payload, o de las props de un framework) no se pierde. */
  #selected: SelectOption[] = [];
  #pendingValue: string[] | null = null;
  /** El valor al que vuelve un <form reset>: el del atributo `value`, o lo que llegó de afuera
   *  antes de que la persona tocara el campo. `records`: los registros, si llegaron con `selection`. */
  #initial: { values: string[]; records: SelectOption[] } = { values: [], records: [] };
  /** La persona ya cambió la selección: lo que llegue de afuera deja de ser el valor inicial. */
  #touched = false;
  /** El valor salió del atributo `value`: si cambia `multiple`, se vuelve a leer (JSON o texto). */
  #fromAttr = false;
  /** Deshabilitado por un `<fieldset disabled>`. */
  #formDisabled = false;
  /** Ya hubo un intento de envío inválido: desde ahí el campo se marca `aria-invalid`. */
  #tried = false;
  /** El mensaje de `setCustomValidity()`. */
  #custom = "";
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
    this.#options = this.#clean(v, "options");
    this.#resolvePending();
    this.#paint();
    // Con el panel abierto, la lista se rehace con los datos nuevos (no con los de cuando se abrió).
    if (this.open && !this.source) this.#rematch();
  }
  get fields(): SelectField[] {
    return this.#fields;
  }
  set fields(v: SelectField[] | null | undefined) {
    const list = Array.isArray(v) ? v.filter((f) => f && typeof f.key === "string") : [];
    this.#fields = list.length ? list : [{ key: "label", label: "" }];
    this.#paint();
    if (this.open) this.#rematch();
  }
  /** `string` en simple (`""` sin selección); `string[]` con `multiple`. */
  get value(): string | string[] {
    const vals = this.#chosen().map((o) => o.value);
    return this.multiple ? vals : (vals[0] ?? "");
  }
  set value(v: string | string[] | null | undefined) {
    this.#fromAttr = false;
    this.#want(valuesOf(v));
  }
  /** Los registros elegidos. Para `source`, el backend los manda para pintar la selección inicial. */
  get selection(): SelectOption[] {
    return [...this.#chosen()];
  }
  set selection(v: SelectOption[] | null | undefined) {
    // `undefined` no toca nada (un framework que no la pasa); `null` o `[]` limpian.
    if (v === undefined) return;
    this.#selected = this.#clean(v, "selection");
    this.#pendingValue = null;
    this.#fromAttr = false;
    if (!this.#touched) this.#initial = { values: this.#selected.map((o) => o.value), records: [...this.#selected] };
    this.#sync();
    this.#paint();
    if (this.open) this.#renderList();
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
  /** El atributo. Un `<fieldset disabled>` también lo apaga, sin tocarlo (como un control nativo). */
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
    this.#labels = mergeLabels(SELECT_LABELS, v);
    this.#name();
    this.#sync();
    this.#paint();
  }
  get open(): boolean {
    return this.#isOpen;
  }

  // La validez, como en un control nativo.
  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get validity(): ValidityState | undefined {
    return this.#internals?.validity;
  }
  get validationMessage(): string {
    return this.#internals?.validationMessage ?? "";
  }
  get willValidate(): boolean {
    return this.#internals?.willValidate ?? false;
  }
  checkValidity(): boolean {
    return this.#internals?.checkValidity() ?? (this.#isOff() || !this.#problem());
  }
  reportValidity(): boolean {
    return this.#internals?.reportValidity() ?? (this.#isOff() || !this.#problem());
  }
  /** Un error propio («Ese empleado ya está asignado»); `""` lo quita. */
  setCustomValidity(message: string): void {
    this.#custom = String(message ?? "");
    this.#sync();
  }

  /** Enfoca el campo (un `<label>` o `el.focus()` llegan aquí). */
  focus(options?: FocusOptions): void {
    this.#field?.focus(options);
  }
  show(): void {
    // Fuera del documento `showPopover` lanza: no hay nada que abrir.
    if (this.#isOff() || !this.#pop || this.open || !this.isConnected) return;
    this.#pop.showPopover();
    // El foco va al buscador a mano y no con `autofocus`: un <nx-dialog> que busca su primer
    // `[autofocus]` encontraría este (oculto) y el foco se quedaría fuera del diálogo.
    this.#input!.focus({ preventScroll: true });
  }
  hide(): void {
    if (this.open) this.#pop!.hidePopover();
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#built) this.#build();
    this.#paint();
    // Con el campo ya creado: es el ancla de la validez (sin ancla, un `required` vacío bloquea el
    // envío sin decir nada).
    this.#sync();
    this.#name();
    // Un <label for> que viene después en el documento ya existe en el siguiente turno, o al
    // terminar de leer la página.
    queueMicrotask(() => this.#name());
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.#name(), { once: true });
  }

  disconnectedCallback(): void {
    this.#track?.();
    this.#abort?.abort();
    clearTimeout(this.#timer);
    // Quitar un popover del documento lo oculta SIN `beforetoggle` ni `toggle`: si estaba abierto,
    // `open` quedaría en `true` y, al volver (un portal, una lista que se reordena), ningún clic lo
    // abriría otra vez.
    this.#isOpen = false;
    this.#loading = false;
    this.#query = "";
    this.#field?.setAttribute("aria-expanded", "false");
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === "value") {
      this.#valueAttr(value);
      return;
    }
    if (value !== null && (name === "options" || name === "fields" || name === "labels")) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-select] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "multiple" && (old === null) !== (value === null)) {
      // Sin `multiple` queda uno solo; con él, un `value="[…]"` que se leyó como texto se relee.
      if (value === null) this.#selected = this.#selected.slice(0, 1);
      if (this.#fromAttr) this.#valueAttr(this.getAttribute("value"));
    }
    if (name === "disabled" && value !== null) this.hide();
    if (name === "label") this.#name();
    // El valor del <form> depende de `name` (con `multiple` va en un FormData) y de `multiple`; la
    // validez, de `required`.
    if (name === "name" || name === "multiple" || name === "required") this.#sync();
    this.#paint();
    if (this.open && (name === "multiple" || name === "avatar" || name === "limit")) this.#rematch();
  }

  /** Un <form reset> vuelve al valor inicial (como la opción `selected` de un <select>), sin
   *  avisar `nx-select-change`. */
  formResetCallback(): void {
    this.#touched = false;
    this.#tried = false;
    this.#selected = [];
    this.#pendingValue = [...this.#initial.values];
    this.#resolvePending();
    this.#sync();
    this.#paint();
    if (this.open) this.#renderList();
  }
  formDisabledCallback(disabled: boolean): void {
    this.#formDisabled = disabled;
    if (disabled) this.hide();
    this.#paint();
  }
  /** Al volver a la página (o al autocompletar), el navegador devuelve lo que guardó `#sync`. */
  formStateRestoreCallback(state: unknown): void {
    let v = state;
    if (typeof state === "string") {
      try {
        v = JSON.parse(state);
      } catch {
        /* un valor suelto */
      }
    }
    this.#want(valuesOf(v), false);
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
  /** Apagado por el atributo o por un `<fieldset disabled>`. */
  #isOff(): boolean {
    return this.disabled || this.#formDisabled;
  }
  /** Lo elegido que cuenta: sin `multiple`, solo el primero. */
  #chosen(): SelectOption[] {
    return this.multiple ? this.#selected : this.#selected.slice(0, 1);
  }
  #clean(list: unknown, what: string): SelectOption[] {
    const { options, duplicated } = uniqueOptions(list);
    if (duplicated) console.warn(`[nx-select] "${what}" trae registros con el mismo value: se usa el primero de cada uno`);
    return options;
  }

  /** Un valor que llega de afuera (prop, atributo, el navegador al restaurar el formulario).
   *  `initial`: mientras la persona no haya tocado el campo, también es el valor del reset. */
  #want(vals: string[], initial = true): void {
    this.#pendingValue = vals;
    this.#resolvePending();
    if (initial && !this.#touched) this.#initial = { values: vals, records: [] };
    this.#paint();
    if (this.open) this.#renderList();
  }

  /** El atributo `value`: texto, o JSON (`["1","2"]`) con `multiple`. Siempre es el valor inicial. */
  #valueAttr(raw: string | null): void {
    let v: unknown = raw;
    if (raw !== null && this.multiple) {
      try {
        v = JSON.parse(raw);
      } catch {
        /* un solo valor, escrito tal cual */
      }
    }
    const vals = valuesOf(v);
    this.#want(vals, false);
    this.#initial = { values: vals, records: [] };
    this.#fromAttr = true;
  }

  /** Un `value` que llegó antes que sus `options` se resuelve cuando llegan. */
  #resolvePending(): void {
    const want = this.#pendingValue;
    if (!want) return;
    const known = [...this.#options, ...this.#selected, ...this.#remote, ...this.#initial.records];
    const found = want.map((v) => known.find((o) => o.value === v)).filter((o): o is SelectOption => !!o);
    if (found.length === want.length || this.#options.length) {
      // Todo lo pedido, aunque todavía no haya `multiple` (ver `#selected`).
      this.#selected = found;
      this.#pendingValue = found.length === want.length ? null : want;
      this.#sync();
    }
  }

  /** Lo que impide enviar: el error propio o `required` sin elegir. */
  #problem(): string {
    return this.#custom || (this.required && !this.#chosen().length ? this.#labels.required : "");
  }

  /** El valor para el <form>, la validez y su marca en el campo. */
  #sync(): void {
    if (this.#field) {
      if (this.#tried && this.#problem()) this.#field.setAttribute("aria-invalid", "true");
      else this.#field.removeAttribute("aria-invalid");
    }
    const i = this.#internals;
    if (!i) return;
    try {
      const vals = this.#chosen().map((o) => o.value);
      // El estado (lo que devuelve `formStateRestoreCallback`) son siempre los valores en JSON.
      const state = JSON.stringify(vals);
      if (this.multiple) {
        // Un FormData se envía con los nombres que trae: sin `name`, nada (como un control nativo).
        const fd = new FormData();
        for (const v of vals) fd.append(this.name, v);
        i.setFormValue(vals.length && this.name ? fd : null, state);
      } else i.setFormValue(vals[0] ?? null, state);
      const missing = this.required && !vals.length;
      if (missing || this.#custom) i.setValidity({ valueMissing: missing, customError: !!this.#custom }, this.#problem(), this.#field);
      else i.setValidity({});
    } catch {
      /* happy-dom y navegadores sin form-associated: se ignora */
    }
  }

  #emit(): void {
    this.#sync();
    this.dispatchEvent(new CustomEvent("nx-select-change", { detail: { value: this.value, options: this.selection }, bubbles: true, composed: true }));
    // Y el `change` de cualquier control: el código genérico (marcar «sin guardar», un framework)
    // no tiene que conocer el evento propio.
    this.dispatchEvent(new Event("change", { bubbles: true }));
  }

  /**
   * El nombre del combobox: `label`, el `aria-label` o `aria-labelledby` del elemento, o los
   * `<label>` asociados. El elemento es genérico, así que su nombre no le llega solo al campo. El
   * buscador y el panel lo repiten («Buscar · Empleado»).
   */
  #name(): void {
    const f = this.#field;
    if (!f) return;
    const own = this.getAttribute("label") || this.getAttribute("aria-label") || "";
    let ids = own ? [] : (this.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
    if (!own && !ids.length) {
      try {
        ids = Array.from(this.#internals?.labels ?? [], (l, i) => ((l as HTMLElement).id ||= `${this.#uid}-label${i}`));
      } catch {
        /* sin `internals.labels` */
      }
    }
    if (own) f.setAttribute("aria-label", own);
    else f.removeAttribute("aria-label");
    if (ids.length) f.setAttribute("aria-labelledby", ids.join(" "));
    else f.removeAttribute("aria-labelledby");
    const root = this.getRootNode() as Document;
    const text = own || ids.map((id) => this.#textOf(root.getElementById?.(id))).filter(Boolean).join(" ");
    const L = this.#labels;
    this.#input!.setAttribute("aria-label", text ? `${L.search} · ${text}` : L.search);
    this.#pop!.setAttribute("aria-label", text || L.search);
    this.#list!.setAttribute("aria-label", text || L.search);
  }
  /** El texto de una etiqueta, sin lo del propio select si lo envuelve. */
  #textOf(el: Element | null | undefined): string {
    if (!el) return "";
    const parts = el.contains(this) ? [...el.childNodes].filter((n) => !n.contains(this)) : [el];
    return parts
      .map((n) => n.textContent ?? "")
      .join("")
      .trim();
  }

  #build(): void {
    this.#built = true;
    const popId = `${this.#uid}-pop`;
    const listId = `${this.#uid}-list`;
    // El panel tiene un buscador y una lista: es un diálogo, no un listbox directo.
    this.#field = h("div", { class: "nx-select__field", role: "combobox", tabindex: "0", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": popId });
    this.#input = h("input", {
      type: "text",
      class: "nx-select__input",
      // Buscar no es cambiar el valor: un <nx-dialog> no lo cuenta como «cambios sin guardar».
      "data-nx-ephemeral": "",
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": listId,
      "aria-autocomplete": "list",
      autocomplete: "off",
      spellcheck: "false",
    });
    this.#hint = h("p", { class: "nx-select__hint", hidden: true });
    this.#list = h("div", { id: listId, class: "nx-select__list", role: "listbox" });
    this.#pop = h(
      "div",
      { id: popId, class: "nx-select__pop", popover: "auto", role: "dialog" },
      h("div", { class: "nx-select__search" }, glyph("search", "nx-select__search-icon"), this.#input, h("span", { class: "nx-spinner nx-select__spin", hidden: true })),
      this.#hint,
      this.#list,
    );
    this.append(this.#field, this.#pop);

    // Un <label for> (o uno que envuelve el elemento) le manda el clic a él: el foco va al campo.
    this.addEventListener("click", (e) => {
      if (e.target === this && !this.#isOff()) this.#field!.focus();
    });
    // Un envío que falló por este campo: desde ahí se marca inválido hasta que se corrija.
    this.addEventListener("invalid", () => {
      this.#tried = true;
      this.#sync();
    });

    const f = this.#field;
    // Una etiqueta que llegó tarde (la pinta un framework después) o un `aria-labelledby` que
    // cambió se toman al enfocar.
    f.addEventListener("focus", () => this.#name());
    // Con el panel abierto, presionar sobre el campo ya lo cierra (clic fuera del popover): ese
    // mismo clic no debe volver a abrirlo.
    let wasOpen = false;
    f.addEventListener("pointerdown", () => (wasOpen = this.open));
    f.addEventListener("click", (e) => {
      if (this.#isOff()) return;
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
      if (this.#isOff()) return;
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.show();
      } else if ((e.key === "Backspace" || e.key === "Delete") && this.clearable && this.#chosen().length) {
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

    // Lo que se escribe en el buscador es una consulta, no el valor: su `input` y su `change` no
    // salen del select (el `change` del select es el de elegir).
    for (const t of ["input", "change"]) this.#input.addEventListener(t, (e) => e.stopPropagation());
    this.#input.addEventListener("input", () => {
      this.#query = this.#input!.value;
      this.#highlighted = -1;
      this.#refresh(false);
    });
    this.#input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      // Enter nunca envía el <form> de afuera (el buscador es un <input> dentro de él), haya o no
      // algo resaltado.
      if (e.key === "Enter") e.preventDefault();
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

  /** Lo que elige la persona. */
  #setSelection(next: SelectOption[]): void {
    if (this.#isOff()) return;
    this.#selected = next;
    this.#pendingValue = null;
    this.#touched = true;
    this.#fromAttr = false;
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
      this.#rematch();
      return;
    }
    clearTimeout(this.#timer);
    this.#loading = true;
    this.#renderList();
    this.#timer = window.setTimeout(() => void this.#fetch(src), opening ? 0 : DEBOUNCE_MS);
  }

  /** La lista con lo que ya hay (las `options`, o lo último que mandó el servidor), sin pedir nada. */
  #rematch(): void {
    this.#matches = this.source ? this.#remoteMatches(this.#query) : searchOptions(this.#options, this.#fields, this.#query, this.limit);
    this.#renderList();
  }
  /** El servidor ya filtró y ordenó: se respeta su orden, y aquí solo se calcula qué resaltar. */
  #remoteMatches(q: string): Match[] {
    return this.#remote.slice(0, this.limit).map((o) => matchOption(o, this.#fields, q) ?? { option: o, fields: [], score: 0 });
  }

  async #fetch(src: string): Promise<void> {
    this.#abort?.abort();
    const ctrl = (this.#abort = new AbortController());
    const q = this.#query;
    try {
      // Solo del mismo origen (o de uno permitido): lo que se escribe no sale hacia un tercero.
      const safe = safeEndpoint(src);
      if (!safe) throw new Error("source");
      const url = new URL(safe, location.href);
      url.searchParams.set("q", q.trim());
      const res = await fetch(url, { signal: ctrl.signal, credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as unknown;
      const list = Array.isArray(data) ? data : (data as { options?: unknown })?.options;
      this.#remote = this.#clean(list, "source");
      this.#failed = false;
    } catch (err) {
      if (ctrl.signal.aborted) return;
      this.#remote = [];
      this.#failed = true;
      void err;
    }
    this.#loading = false;
    this.#matches = this.#remoteMatches(q);
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
    list.setAttribute("aria-multiselectable", String(this.multiple));
    list.classList.toggle("nx-select__list--stale", this.#loading);
    // Una lista más corta (datos nuevos) no deja resaltada una opción que ya no existe.
    if (this.#highlighted >= this.#matches.length) this.#highlighted = -1;

    const chosen = new Set(this.#chosen().map((o) => o.value));
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
    // Sin resaltado (se borró la consulta), el lector no anuncia como activa una opción que no lo está.
    else if (this.#highlighted < 0) this.#input!.removeAttribute("aria-activedescendant");
  }

  /** El campo cerrado: lo elegido (o el placeholder), limpiar y el chevron. */
  #paint(): void {
    if (!this.#built) return;
    const f = this.#field!;
    const off = this.#isOff();
    f.setAttribute("aria-disabled", String(off));
    f.tabIndex = off ? -1 : 0;
    if (this.required) f.setAttribute("aria-required", "true");
    else f.removeAttribute("aria-required");
    const sel = this.#chosen();
    const nodes: (Node | null)[] = [];
    if (!sel.length) nodes.push(h("span", { class: "nx-select__placeholder" }, this.placeholder));
    else if (this.multiple) {
      nodes.push(
        h(
          "span",
          { class: "nx-select__chips" },
          ...sel.map((o) => {
            const text = fieldText(o, this.#fields[0].key) || o.value;
            // Apagado, los chips no tienen × (no hay nada que quitar).
            return h("span", { class: "nx-select__chip" }, text, off ? null : h("span", { class: "nx-select__chip-x", "data-remove": o.value, "aria-hidden": "true" }, glyph(X)));
          }),
        ),
      );
    } else {
      const o = sel[0];
      const { primary, secondary } = this.#describe(o, false);
      if (this.avatar) nodes.push(h("span", { class: "nx-select__avatar", "aria-hidden": "true" }, initialsOf(fieldText(o, this.#fields[0].key))));
      nodes.push(h("span", { class: "nx-select__text" }, h("span", { class: "nx-select__primary" }, primary), secondary ? h("span", { class: "nx-select__secondary" }, secondary) : null));
    }
    if (this.clearable && sel.length && !off) {
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
