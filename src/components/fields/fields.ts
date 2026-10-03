/**
 * `<nx-fields>`: los datos de un registro, para leer y para editar en la misma rejilla.
 *
 * - **Leer.** Etiqueta arriba, valor abajo, en dos columnas; un dato largo (`wide`) ocupa la fila
 *   entera. Un dato vacío se ve como «—» (y se lee «Sin dato»): no se oculta, así la ficha conserva
 *   su forma de un registro a otro. Montos, números y fechas salen con el locale.
 * - **Resumir.** `variant="summary"`: la franja de tres o cuatro datos clave bajo el título de una
 *   ficha, separados por líneas; en un panel angosto pasa a 2 × 2.
 * - **Editar.** Con `editing`, cada valor se vuelve un campo en su sitio, así nada salta. Lo que no
 *   se edita aquí (`readonly`) sigue como texto, con candado. Los campos llevan `name` (la clave):
 *   dentro de un `<form>` sirven tal cual, y dentro de un `<nx-dialog>` marcan los cambios sin
 *   guardar. `values` los lee ya convertidos, `validate()` revisa lo obligatorio y el formato, y
 *   `errors` muestra los del servidor. Lo escrito no se pierde si la ficha se vuelve a pintar
 *   (cambia `heading`, o la app vuelve a asignar los mismos `items`); `reset()` lo descarta.
 *
 * Con `heading`, la sección lleva su título; con `action`, un botón al lado («Editar»), que avisa
 * con `nx-fields-action` y se oculta mientras se edita. Light DOM, sin hijos del autor: todo lo
 * pinta el componente.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale, type NxFormat } from "../../core/locale";
import type { FieldInput, FieldInputType, FieldItem, FieldOption, FieldsActionDetail, FieldsLabels, FieldsVariant, FieldValue } from "./types";

export const FIELDS_LABELS: FieldsLabels = {
  empty: "Sin dato",
  copy: "Copiar {label}",
  copied: "Copiado",
  readonly: "No se edita aquí",
  choose: "Elige una opción",
  required: "Este dato es obligatorio.",
  email: "Revisa el correo: le falta la @ o el dominio.",
  number: "Escribe solo el número.",
};

const COPY = '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const LOCK = '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

let uid = 0;

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const TYPES: FieldInputType[] = ["text", "email", "tel", "url", "number", "money", "date", "select", "textarea"];

const empty = (v: unknown) => v === null || v === undefined || v === "";
const keyOf = (it: FieldItem, i: number) => (it.key ? String(it.key) : `f${i + 1}`);
/** `input` tal como llega del backend: si no es un objeto, no hay nada que leer. */
const inputOf = (it: FieldItem): FieldInput => (it.input && typeof it.input === "object" ? it.input : {});
/** El control: `input.type` si es uno conocido (un `submit` o un `hidden` del backend no), o el del formato. */
const typeOf = (it: FieldItem): FieldInputType => {
  const t = inputOf(it).type;
  return t && TYPES.includes(t) ? t : it.format === "money" ? "money" : it.format === "number" ? "number" : it.format === "date" ? "date" : "text";
};
const optionOf = (o: string | FieldOption): FieldOption => (typeof o === "string" || typeof o === "number" ? { value: String(o) } : { value: String(o?.value ?? ""), label: o?.label });

const exact = new Map<string, Intl.NumberFormat>();
/** Un número para editarlo: con el formato del locale pero sin redondear (una tasa de 0,1275 no
 *  pasa a 0,13 sin que nadie la toque). */
function exactNumber(locale: string, n: number): string {
  let f = exact.get(locale);
  if (!f) exact.set(locale, (f = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 })));
  return f.format(n).replace(/[\u00a0\u202f]/g, " ");
}

/** Cómo nació cada campo: el valor del dato y el texto que se puso en el control. */
interface Initial {
  value: FieldItem["value"];
  text: string;
  /** El número original de un monto o un número: lo que devuelve `values` si nadie lo tocó. */
  n?: number | null;
}

export class NxFields extends Base {
  static observedAttributes = ["items", "variant", "columns", "heading", "action", "editing", "errors", "locale", "currency", "labels"];

  #uid = `nx-fields${++uid}`;
  #items: FieldItem[] = [];
  #errors: Record<string, string> = {};
  #labels: FieldsLabels = FIELDS_LABELS;
  #fmt: NxFormat = nxFormat();
  #head?: HTMLDivElement;
  #title?: HTMLHeadingElement;
  #action?: HTMLButtonElement;
  #list?: HTMLElement;
  #live?: HTMLSpanElement;
  /** Los campos del modo edición, por clave (para leer valores y pintar errores sin rehacer nada). */
  #controls = new Map<string, Control>();
  #initial = new Map<string, Initial>();
  #copyTimer = 0;

  // ---------------------------------------------------------------- propiedades

  /** Los datos. El atributo `items` acepta el mismo arreglo como JSON. */
  get items(): FieldItem[] {
    return this.#items;
  }
  set items(v: FieldItem[] | null | undefined) {
    this.#items = Array.isArray(v) ? v.filter((it) => it && typeof it === "object" && typeof it.label === "string") : [];
    this.#render();
  }

  get variant(): FieldsVariant {
    return this.getAttribute("variant") === "summary" ? "summary" : "grid";
  }
  set variant(v: FieldsVariant | null | undefined) {
    this.#attr("variant", v);
  }

  /** Columnas de la rejilla (1 a 4; 2 por defecto). En un contenedor angosto pasa a una. */
  get columns(): number {
    const n = Math.round(Number(this.getAttribute("columns")));
    return n >= 1 && n <= 4 ? n : 2;
  }
  set columns(v: number | null | undefined) {
    this.#attr("columns", v == null ? null : String(v));
  }

  /** El título de la sección. */
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string | null | undefined) {
    this.#attr("heading", v);
  }

  /** El botón al lado del título («Editar»): avisa con `nx-fields-action`. */
  get action(): string {
    return this.getAttribute("action") ?? "";
  }
  set action(v: string | null | undefined) {
    this.#attr("action", v);
  }

  /** Cada valor se vuelve un campo en su sitio. */
  get editing(): boolean {
    return boolAttr(this, "editing");
  }
  set editing(v: boolean | null | undefined) {
    if (v) this.setAttribute("editing", "");
    else this.removeAttribute("editing");
  }

  /** Errores por clave (`{correo: "Ya existe"}`), debajo de cada campo. Se borran al escribir en él. */
  get errors(): Record<string, string> {
    return { ...this.#errors };
  }
  set errors(v: Record<string, string> | null | undefined) {
    this.#errors = {};
    if (v && typeof v === "object") for (const [k, m] of Object.entries(v)) if (typeof m === "string" && m) this.#errors[k] = m;
    this.#paintErrors();
  }

  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(v: string | null | undefined) {
    this.#attr("locale", v);
  }

  /** Moneda de los montos que no traen la suya (ISO o símbolo). */
  get currency(): string | null {
    return this.getAttribute("currency");
  }
  set currency(v: string | null | undefined) {
    this.#attr("currency", v);
  }

  get labels(): FieldsLabels {
    return this.#labels;
  }
  set labels(v: Partial<FieldsLabels> | null | undefined) {
    this.#labels = mergeLabels(FIELDS_LABELS, v);
    this.#render();
  }

  /** Los valores por clave. Al editar, lo que hay en los campos (montos y números ya convertidos;
   *  vacío es `null`); si no, los de `items`. */
  get values(): Record<string, FieldValue> {
    const out: Record<string, FieldValue> = {};
    this.#items.forEach((it, i) => {
      const k = keyOf(it, i);
      const c = this.#controls.get(k);
      out[k] = c ? this.#read(it, c, k) : empty(it.value) ? null : (it.value as FieldValue);
    });
    return out;
  }

  // ---------------------------------------------------------------- API

  /** Revisa lo obligatorio y el formato (correo, número), muestra los errores y enfoca el primero.
   *  Devuelve `true` si todo está bien. Fuera del modo edición no hay nada que revisar. */
  validate(): boolean {
    const L = this.#labels;
    const errors: Record<string, string> = {};
    this.#items.forEach((it, i) => {
      const k = keyOf(it, i);
      const c = this.#controls.get(k);
      if (!c) return;
      const raw = c.value.trim();
      const t = typeOf(it);
      if (!raw) {
        if (inputOf(it).required) errors[k] = L.required;
      } else if (t === "email" && !EMAIL.test(raw)) errors[k] = L.email;
      else if ((t === "number" || t === "money") && this.#fmt.parse(raw) === null) errors[k] = L.number;
    });
    this.errors = errors;
    const first = Object.keys(errors)[0];
    if (first) this.#controls.get(first)?.focus();
    return !first;
  }

  /** Descarta lo escrito: los campos vuelven a los valores de `items` (un formulario que se reabre). */
  reset(): void {
    this.#render(false, true);
  }

  /** Enfoca el campo de `key` (al editar) y lo trae a la vista. */
  focusField(key: string): void {
    const c = this.#controls.get(key);
    if (!c) return;
    c.focus({ preventScroll: true });
    c.scrollIntoView?.({ block: "nearest" });
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    this.#render();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === "items" || name === "labels" || name === "errors") {
      // Quitar el atributo lo vacía (sin datos, sin errores, los textos por defecto).
      if (value === null) return void (name === "items" ? (this.items = null) : name === "labels" ? (this.labels = null) : (this.errors = null));
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        console.warn(`[nx-fields] el atributo "${name}" no es JSON válido`);
        return;
      }
      if (name === "items") this.items = parsed as FieldItem[];
      else if (name === "labels") this.labels = parsed as Partial<FieldsLabels>;
      else this.errors = parsed as Record<string, string>;
      return;
    }
    if (name === "editing" && (old === null) === (value === null)) return;
    this.#render(name === "editing");
  }

  // ---------------------------------------------------------------- pintar

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined) this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #build(): void {
    this.#title = h("h3", { class: "nx-fields__title" });
    this.#action = h("button", { type: "button", class: "nx-fields__action" });
    this.#action.addEventListener("click", () => {
      const detail: FieldsActionDetail = { action: this.action };
      this.dispatchEvent(new CustomEvent("nx-fields-action", { detail, bubbles: true, composed: true }));
    });
    this.#head = h("div", { class: "nx-fields__head" }, this.#title, this.#action);
    this.#live = h("span", { class: "nx-sr-only", "aria-live": "polite" });
    this.addEventListener("input", (e) => {
      const k = (e.target as Element).getAttribute?.("data-k");
      if (k && this.#errors[k]) {
        delete this.#errors[k];
        this.#paintErrors();
      }
    });
    this.addEventListener("click", (e) => {
      const b = (e.target as Element).closest?.<HTMLButtonElement>(".nx-fields__copy");
      if (b && this.contains(b)) this.#copy(b);
    });
  }

  /** Rehace la rejilla. `modeChanged`: se entró o salió del modo edición (el foco no se pierde).
   *  `fresh`: los campos salen de `items` aunque haya algo escrito (`reset()`). */
  #render(modeChanged = false, fresh = false): void {
    if (!this.isConnected) return;
    if (!this.#head) this.#build();
    const active = document.activeElement;
    const hadFocus = this.contains(active);
    const L = this.#labels;
    this.#fmt = nxFormat(resolveLocale(this));
    const summary = this.variant === "summary";
    const editing = this.editing && !summary;

    this.#title!.textContent = this.heading;
    this.#title!.hidden = !this.heading;
    this.#action!.textContent = this.action;
    this.#action!.hidden = !this.action || editing;
    this.#head!.hidden = !this.heading && !this.action;

    this.style.setProperty("--_cols", String(this.columns));
    this.style.setProperty("--_n", String(Math.min(4, Math.max(1, this.#items.length))));
    // Lo que la persona escribió (y dónde estaba): se pasa a los campos nuevos de la misma clave,
    // salvo que la app haya cambiado ese dato.
    const typed = new Map<string, { text: string; value: FieldItem["value"] }>();
    let focusKey: string | undefined;
    let sel: [number | null, number | null] | undefined;
    if (editing && !modeChanged && !fresh)
      for (const [k, c] of this.#controls) {
        const init = this.#initial.get(k);
        if (init && c.value !== init.text) typed.set(k, { text: c.value, value: init.value });
        if (c === active) {
          focusKey = k;
          if (!(c instanceof HTMLSelectElement)) sel = [c.selectionStart, c.selectionEnd];
        }
      }
    this.#controls.clear();
    this.#initial.clear();
    const list = editing ? h("div", { class: "nx-fields__list" }) : h("dl", { class: "nx-fields__list" });
    this.#items.forEach((it, i) => list.append(editing ? this.#editRow(it, i) : this.#readRow(it, summary, L)));
    for (const [k, t] of typed) {
      const c = this.#controls.get(k);
      if (!c || this.#initial.get(k)?.value !== t.value) continue;
      if (c instanceof HTMLSelectElement && ![...c.options].some((o) => o.value === t.text)) continue;
      c.value = t.text;
    }
    this.#list?.remove();
    this.#list = list;
    for (const el of [this.#head!, list, this.#live!]) this.append(el);
    this.#paintErrors();
    // El campo que tenía el foco lo recupera, con el cursor donde estaba.
    const again = focusKey && this.#controls.get(focusKey);
    if (again) {
      again.focus({ preventScroll: true });
      if (sel && !(again instanceof HTMLSelectElement))
        try {
          again.setSelectionRange(sel[0], sel[1]);
        } catch {
          /* tipos sin selección (correo, fecha) */
        }
    }

    if (modeChanged && hadFocus) {
      // Entrar a editar desde el botón «Editar» (que se oculta): el foco va al primer campo.
      // Salir: vuelve al botón de la sección, para no perderse en la página.
      const first = this.#controls.values().next().value;
      if (editing && first) first.focus();
      else if (!editing && !this.#action!.hidden) this.#action!.focus();
    }
  }

  #display(it: FieldItem): string {
    const v = it.value;
    if (empty(v)) return "";
    if (it.format === "money" || it.format === "number") {
      const n = typeof v === "number" ? v : this.#fmt.parse(String(v));
      if (n === null || !Number.isFinite(n)) return String(v);
      return it.format === "money" ? this.#fmt.money(n, { currency: it.currency ?? this.currency ?? undefined }) : this.#fmt.number(n);
    }
    if (it.format === "date") return this.#fmt.date(String(v));
    return String(v);
  }

  /** El valor pintado: `dd` dentro de la lista de lectura; `div` en el modo edición (sin `dl`). */
  #value(it: FieldItem, L: FieldsLabels, title: boolean, tag: "dd" | "div" = "dd"): HTMLElement {
    const text = this.#display(it);
    const dd = h(tag, { class: `nx-fields__v${it.mono ? " nx-fields__mono" : ""}` });
    if (!text) {
      dd.append(h("span", { class: "nx-fields__empty", "aria-hidden": "true" }, "—"), h("span", { class: "nx-sr-only" }, L.empty));
      return dd;
    }
    const href = safeHref(it.href);
    dd.append(href ? h("a", { href }, text) : h("span", null, text));
    if (title) dd.title = text;
    if (it.copy) dd.append(h("button", { type: "button", class: "nx-fields__copy", "data-copy": text, "aria-label": L.copy.replace("{label}", it.label) }, glyph(COPY)));
    return dd;
  }

  #readRow(it: FieldItem, summary: boolean, L: FieldsLabels): HTMLElement {
    return h("div", { class: `nx-fields__f${it.wide && !summary ? " is-wide" : ""}` }, h("dt", { class: "nx-fields__l" }, it.label), this.#value(it, L, summary));
  }

  #editRow(it: FieldItem, i: number): HTMLElement {
    const L = this.#labels;
    const k = keyOf(it, i);
    const row = h("div", { class: `nx-fields__f${it.wide ? " is-wide" : ""}${it.readonly ? " is-ro" : ""}` });
    if (it.readonly) {
      const v = this.#value(it, L, false, "div");
      const lock = glyph(LOCK, "nx-fields__lock");
      lock.removeAttribute("aria-hidden");
      lock.setAttribute("role", "img");
      lock.setAttribute("aria-label", L.readonly);
      lock.title = L.readonly;
      v.append(lock);
      row.append(h("span", { class: "nx-fields__l" }, it.label), v);
      return row;
    }
    // El id sale de la posición, no de la clave: una clave con espacios rompería `aria-describedby`.
    const id = `${this.#uid}-f${i}`;
    const t = typeOf(it);
    const inp = inputOf(it);
    const raw = it.value;
    let n: number | null | undefined;
    let c: Control;
    if (t === "select") {
      const opts = Array.isArray(inp.options) ? inp.options.map(optionOf) : [];
      const cur = empty(raw) ? "" : String(raw);
      c = h("select", { class: "nx-fields__input" });
      if (!inp.required || !cur) c.append(h("option", { value: "" }, inp.placeholder ?? L.choose));
      for (const o of opts) c.append(h("option", { value: o.value }, o.label ?? o.value));
      // Un valor que no está en la lista no se pierde al guardar.
      if (cur && !opts.some((o) => o.value === cur)) c.append(h("option", { value: cur }, cur));
      c.value = cur;
    } else if (t === "textarea") {
      const rows = Math.round(Number(inp.rows));
      c = h("textarea", { class: "nx-fields__input", rows: rows >= 1 ? rows : 3, placeholder: inp.placeholder });
      c.value = empty(raw) ? "" : String(raw);
    } else {
      const numeric = t === "number" || t === "money";
      n = numeric && !empty(raw) ? (typeof raw === "number" && Number.isFinite(raw) ? raw : this.#fmt.parse(String(raw))) : null;
      const value = empty(raw) ? "" : numeric && n !== null ? exactNumber(this.#fmt.locale, n) : t === "date" ? String(raw).slice(0, 10) : String(raw);
      c = h("input", {
        class: "nx-fields__input",
        type: numeric ? "text" : t,
        inputmode: numeric ? "decimal" : null,
        autocomplete: t === "email" ? "email" : t === "tel" ? "tel" : null,
        placeholder: inp.placeholder,
      });
      c.value = value;
    }
    c.id = id;
    c.name = k;
    c.setAttribute("data-k", k);
    if (inp.required) {
      c.required = true;
      c.setAttribute("aria-required", "true");
    }
    this.#controls.set(k, c);
    this.#initial.set(k, { value: raw, text: c.value, n });
    const label = h("label", { class: "nx-fields__l", for: id }, it.label, inp.required ? h("span", { class: "nx-fields__req", "aria-hidden": "true" }, "*") : null);
    let control: HTMLElement = c;
    if (t === "money") {
      const sample = this.#fmt.money(0, { currency: it.currency ?? this.currency ?? undefined });
      const sym = sample.replace(/[\d\s.,]/g, "");
      if (sym) {
        const after = /^\d/.test(sample.trim());
        control = h("span", { class: `nx-fields__affix${after ? " is-after" : ""}`, style: `--_sym:${sym.length}ch` }, c, h("span", { class: "nx-fields__sym", "aria-hidden": "true" }, sym));
      }
    }
    row.append(label, control);
    if (inp.hint) row.append(h("span", { class: "nx-fields__hint", id: `${id}-h` }, inp.hint));
    return row;
  }

  #read(it: FieldItem, c: Control, k: string): FieldValue {
    const raw = c.value.trim();
    if (!raw) return null;
    const t = typeOf(it);
    if (t === "number" || t === "money") {
      // Sin tocar, el número de siempre (sin pasar por el texto).
      const init = this.#initial.get(k);
      if (init && init.n != null && c.value === init.text) return init.n;
      return this.#fmt.parse(raw);
    }
    return raw;
  }

  #paintErrors(): void {
    for (const [k, c] of this.#controls) {
      const row = c.closest(".nx-fields__f");
      if (!row) continue;
      const msg = this.#errors[k];
      let err = row.querySelector<HTMLElement>(".nx-fields__err");
      row.classList.toggle("is-invalid", !!msg);
      if (msg) {
        err ??= row.appendChild(h("span", { class: "nx-fields__err", id: `${c.id}-e` }));
        err.textContent = msg;
        c.setAttribute("aria-invalid", "true");
      } else {
        err?.remove();
        c.removeAttribute("aria-invalid");
      }
      const hint = row.querySelector(".nx-fields__hint");
      const by = [msg ? `${c.id}-e` : "", hint && !msg ? hint.id : ""].filter(Boolean).join(" ");
      if (by) c.setAttribute("aria-describedby", by);
      else c.removeAttribute("aria-describedby");
    }
  }

  #copy(b: HTMLButtonElement): void {
    const text = b.dataset.copy ?? "";
    const done = () => {
      b.replaceChildren(glyph(CHECK));
      b.dataset.copied = "";
      this.#live!.textContent = this.#labels.copied;
      clearTimeout(this.#copyTimer);
      this.#copyTimer = window.setTimeout(() => {
        b.replaceChildren(glyph(COPY));
        delete b.dataset.copied;
        this.#live!.textContent = "";
      }, 1600);
    };
    try {
      navigator.clipboard.writeText(text).then(done, () => {});
    } catch {
      /* sin portapapeles: no hay nada que avisar */
    }
  }
}
