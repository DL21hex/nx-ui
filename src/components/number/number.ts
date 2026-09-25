/**
 * `<nx-number>`: el campo numérico de todos los días, bien hecho. Entiende lo que se escribe en el
 * formato del locale («1.234,5» o «1,234.5»), con sufijos («2,5M», «3 mil», «15%») y cuentas
 * («=450*3», «+15%» sobre el valor anterior); mientras se escribe muestra el resultado a la derecha
 * y al salir lo deja formateado como número, monto o porcentaje. Pegar desde Excel funciona
 * («$ 1.450.000,00», «(1.200)» contable), la rueda del mouse no cambia nada y ↑/↓ suman `step`.
 *
 * Con `words`, debajo va el monto en letras para cheques y documentos («un millón de pesos m/cte»).
 * Participa en un <form> nativo (`name`, `required`, validez con mensaje); `value` es un
 * `number` o `null`.
 */
import { Base, boolAttr } from "../../core/define";
import { h } from "../../core/dom";
import { resolveLocale } from "../../core/locale";
import {
  affixes,
  clampValue,
  cleanAlign,
  cleanCurrency,
  cleanDecimals,
  cleanFormat,
  cleanLabels,
  cleanNumber,
  errorText,
  evaluate,
  formatEdit,
  formatText,
  numberToWords,
  roundValue,
  stepValue,
  wordsCurrency,
  type FormatOptions,
} from "./logic";
import type { NumberAlign, NumberFormat, NumberLabels, NumberReading } from "./types";

export const NUMBER_LABELS: NumberLabels = {
  unknown: 'no entiendo "{token}"',
  incomplete: "falta un número",
  paren: "revisa los paréntesis",
  divZero: "no se puede dividir entre cero",
  noBase: "no hay un valor anterior",
  needEquals: "para calcular, empieza con =",
  tooBig: "es demasiado grande",
  min: "El mínimo es {min}",
  max: "El máximo es {max}",
  required: "Escribe un valor",
  equals: "=",
  words: "En letras",
};

const PROPS = ["value", "min", "max", "step", "format", "currency", "decimals", "words", "name", "required", "disabled", "readonly", "placeholder", "align", "label", "locale", "labels"] as const;
/** Lo que dura a la vista el aviso de «se recortó al máximo». */
const NOTICE_MS = 2600;

let uid = 0;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export class NxNumber extends Base {
  static formAssociated = true;
  static observedAttributes = ["value", "min", "max", "step", "format", "currency", "decimals", "words", "name", "required", "disabled", "readonly", "placeholder", "align", "label", "labels", "locale"];

  #uid = `nx-num${++uid}`;
  #internals: ElementInternals | null = null;
  #labels: NumberLabels = NUMBER_LABELS;
  #value: number | null = null;
  /** El valor del atributo `value`: al que vuelve un <form reset>. */
  #default: number | null = null;
  /** El valor confirmado (al enfocar o con Enter): base de «+15%» y de `nx-change`. */
  #committed: number | null = null;
  /** El texto al enfocar: Escape vuelve a él. */
  #focusText = "";
  /** Se escribió algo desde el foco: el texto es de quien escribe y no se repinta. */
  #dirty = false;
  /** El error del texto que quedó al salir (sin entender). */
  #bad = "";
  #formDisabled = false;
  #noticeTimer = 0;
  #built = false;
  #field?: HTMLDivElement;
  #input?: HTMLInputElement;
  #prefix?: HTMLSpanElement;
  #suffix?: HTMLSpanElement;
  #hint?: HTMLSpanElement;
  #words?: HTMLParagraphElement;
  #note?: HTMLParagraphElement;

  constructor() {
    super();
    // Sin DOM (SSR) o en navegadores sin form-associated: funciona igual, sin el <form>.
    try {
      this.#internals = (this as HTMLElement).attachInternals?.() ?? null;
    } catch {
      this.#internals = null;
    }
  }

  // ---------------------------------------------------------------- propiedades

  /** El número (`null` vacío). En `percent` es la fracción: 0,19 es 19 %. Acepta también texto («1450000.5» o «1.450.000,5»). */
  get value(): number | null {
    return this.#value;
  }
  set value(v: number | string | null | undefined) {
    let n = cleanNumber(v);
    if (n === null && typeof v === "string" && v.trim()) {
      const r = evaluate(v, { locale: resolveLocale(this), format: this.format });
      n = r.ok ? r.value : null;
    }
    this.#value = n === null ? null : roundValue(n, this.#fo());
    this.#committed = this.#value;
    this.#bad = "";
    this.#dirty = false;
    this.#paint();
  }
  /** El valor como se lee: «$ 1.450.000», «19 %» (vacío si no hay valor). */
  get text(): string {
    return formatText(this.#value, this.#fo());
  }
  /** Límites (en las unidades del valor: en `percent`, fracciones). Al confirmar, se recorta y se avisa. */
  get min(): number | null {
    return cleanNumber(this.getAttribute("min"));
  }
  set min(v: number | null) {
    this.#attr("min", v === null || v === undefined ? null : String(v));
  }
  get max(): number | null {
    return cleanNumber(this.getAttribute("max"));
  }
  set max(v: number | null) {
    this.#attr("max", v === null || v === undefined ? null : String(v));
  }
  /** Lo que suman ↑/↓, en las unidades que se ven (en `percent`, puntos). Mayús ×10, Alt ÷10. */
  get step(): number {
    const n = cleanNumber(this.getAttribute("step"));
    return n && n > 0 ? n : 1;
  }
  set step(v: number) {
    this.#attr("step", String(v));
  }
  /** `number` (por defecto), `money` o `percent`. */
  get format(): NumberFormat {
    return cleanFormat(this.getAttribute("format"));
  }
  set format(v: NumberFormat) {
    this.#attr("format", v);
  }
  /** Con `money`: código ISO («COP», «USD») o un símbolo («$», el de siempre). */
  get currency(): string | undefined {
    return cleanCurrency(this.getAttribute("currency"));
  }
  set currency(v: string | undefined) {
    this.#attr("currency", v);
  }
  /** Decimales que se muestran y a los que se redondea (por defecto 2 en montos y porcentajes, 6 en números). */
  get decimals(): number | undefined {
    return cleanDecimals(this.getAttribute("decimals"));
  }
  set decimals(v: number | undefined) {
    this.#attr("decimals", v === undefined || v === null ? null : String(v));
  }
  /** El monto en letras debajo del campo (en español), para cheques y documentos. */
  get words(): boolean {
    return boolAttr(this, "words");
  }
  set words(v: boolean) {
    this.#bool("words", v);
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
  get readonly(): boolean {
    return boolAttr(this, "readonly");
  }
  set readonly(v: boolean) {
    this.#bool("readonly", v);
  }
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? "";
  }
  set placeholder(v: string) {
    this.#attr("placeholder", v);
  }
  /** `start`, `center` o `end`. Por defecto `end` (derecha) en montos y porcentajes, `start` en números. */
  get align(): NumberAlign {
    return cleanAlign(this.getAttribute("align"), this.format);
  }
  set align(v: NumberAlign) {
    this.#attr("align", v);
  }
  /** Nombre accesible del campo (si no hay un `<label for>` que lo nombre). */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }
  set label(v: string) {
    this.#attr("label", v);
  }
  /** Formato de lo que se escribe y se muestra («es-CO», «en-US»). Sin él, el `lang` más cercano. */
  get locale(): string {
    return resolveLocale(this);
  }
  set locale(v: string | null) {
    this.#attr("locale", v);
  }
  get labels(): NumberLabels {
    return this.#labels;
  }
  set labels(v: Partial<NumberLabels> | null | undefined) {
    this.#labels = cleanLabels(v, NUMBER_LABELS);
    this.#paint();
  }
  get form(): HTMLFormElement | null {
    return this.#internals?.form ?? null;
  }
  get validity(): ValidityState | undefined {
    return this.#internals?.validity;
  }
  get validationMessage(): string {
    return this.#internals?.validationMessage ?? "";
  }
  checkValidity(): boolean {
    return this.#internals?.checkValidity() ?? true;
  }
  reportValidity(): boolean {
    return this.#internals?.reportValidity() ?? true;
  }

  /** Enfoca el campo de texto (un `<label>` o `el.focus()` llegan aquí). */
  focus(options?: FocusOptions): void {
    this.#input?.focus(options);
  }
  select(): void {
    this.#input?.select();
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
    this.#name();
    // Un <label for> que viene después en el documento ya existe en el siguiente turno.
    queueMicrotask(() => this.#name());
  }

  disconnectedCallback(): void {
    clearTimeout(this.#noticeTimer);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "labels") {
      if (value === null) this.labels = null;
      else
        try {
          this.labels = JSON.parse(value);
        } catch {
          console.warn('[nx-number] el atributo "labels" no es JSON válido');
        }
      return;
    }
    if (name === "value") {
      this.value = value;
      this.#default = this.#value;
      return;
    }
    if (name === "label") this.#name();
    this.#paint();
  }

  /** Un <form reset> vuelve al valor del atributo `value`. */
  formResetCallback(): void {
    this.value = this.#default;
  }
  formDisabledCallback(disabled: boolean): void {
    this.#formDisabled = disabled;
    this.#paint();
  }
  formStateRestoreCallback(state: string | null): void {
    this.value = state;
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
  #fo(): FormatOptions {
    return { locale: resolveLocale(this), format: this.format, currency: this.currency, decimals: this.decimals };
  }
  /** Lo que dice el texto de ahora (con el valor confirmado como base de «+15%»). */
  #read(): NumberReading {
    return evaluate(this.#input!.value, { locale: resolveLocale(this), format: this.format, base: this.#committed });
  }
  /** En las unidades que se ven (puntos en `percent`). */
  #shown(v: number): number {
    return this.format === "percent" ? v * 100 : v;
  }

  #build(): void {
    this.#built = true;
    const id = this.#uid;
    this.#input = h("input", {
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      autocorrect: "off",
      spellcheck: "false",
      role: "spinbutton",
      class: "nx-number__input",
      id: `${id}-in`,
      "aria-describedby": `${id}-hint ${id}-words ${id}-note`,
    });
    this.#prefix = h("span", { class: "nx-number__affix", "aria-hidden": "true" });
    this.#suffix = h("span", { class: "nx-number__affix", "aria-hidden": "true" });
    this.#hint = h("span", { class: "nx-number__hint", id: `${id}-hint` });
    this.#field = h("div", { class: "nx-number__field" }, this.#prefix, this.#input, this.#suffix, this.#hint);
    this.#words = h("p", { class: "nx-number__words", id: `${id}-words` });
    this.#note = h("p", { class: "nx-number__note", id: `${id}-note`, role: "status" });
    this.replaceChildren(this.#field, this.#words, this.#note);

    const input = this.#input;
    input.addEventListener("focus", () => {
      this.#focusText = input.value;
      this.#committed = this.#value;
      this.#dirty = false;
    });
    input.addEventListener("input", (e) => {
      // El `input` que sale es el del elemento, y solo cuando cambia el número.
      e.stopPropagation();
      this.#dirty = true;
      this.#typed();
    });
    input.addEventListener("change", (e) => e.stopPropagation());
    input.addEventListener("blur", () => this.#commit(false));
    input.addEventListener("keydown", (e) => this.#onKey(e));
    input.addEventListener("paste", (e) => this.#onPaste(e));
    this.#field.addEventListener("animationend", (e) => {
      if (e.target === this.#field) this.#field.classList.remove("is-bump");
    });
    // Un clic en el símbolo o el borde del campo también escribe.
    this.#field.addEventListener("mousedown", (e) => {
      if (e.target !== input && !this.#input!.disabled) {
        e.preventDefault();
        input.focus();
      }
    });
    // Un <label> que envuelve o apunta al elemento le manda el clic a él: el foco va al campo.
    this.addEventListener("click", (e) => {
      if (e.target === this && !input.disabled) input.focus();
    });
    // La rueda del mouse NO cambia el valor: es `type="text"`, así que la página sigue desplazándose.
  }

  /** Mientras se escribe: el valor vivo, la vista previa o el error, y las letras. */
  #typed(): void {
    const r = this.#read();
    if (r.ok) {
      this.#bad = "";
      this.#setLive(r.value === null ? null : roundValue(r.value, this.#fo()));
    }
    this.#paintHint(r);
    this.#paintValue();
  }

  #onKey(e: KeyboardEvent): void {
    const input = this.#input!;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      if (input.readOnly || input.disabled) return;
      const r = this.#read();
      const from = r.ok && r.value !== null ? r.value : this.#value;
      const shown = stepValue(from === null ? null : this.#shown(from), e.key === "ArrowUp" ? 1 : -1, this.step, { shift: e.shiftKey, alt: e.altKey });
      let v = roundValue(this.format === "percent" ? shown / 100 : shown, this.#fo());
      const c = clampValue(v, this.min, this.max);
      if (c.clamped) this.#notice(c.clamped);
      v = c.value;
      this.#bad = "";
      this.#dirty = true;
      input.value = formatEdit(v, this.#fo());
      this.#setLive(v);
      this.#paintHint(null);
      this.#paintValue();
      return;
    }
    if (e.key === "Enter" && !e.isComposing) {
      this.#commit(true);
      if (this.#bad) e.preventDefault(); // con un error, Enter no envía el formulario
      return;
    }
    if (e.key === "Escape" && input.value !== this.#focusText) {
      // Deshace lo escrito desde el foco. Si no hay nada que deshacer, Escape sigue su camino
      // (cierra el diálogo que contiene el campo, por ejemplo).
      e.preventDefault();
      e.stopPropagation();
      input.value = this.#focusText;
      this.#dirty = false;
      this.#bad = "";
      this.#setLive(this.#committed);
      this.#paintHint(null);
      this.#paintValue();
    }
  }

  /**
   * Pegar un monto entero (el campo vacío o todo seleccionado) lo deja limpio de una vez:
   * «$ 1.450.000,00» de Excel queda «1.450.000»; «(1.200)» queda «-1.200».
   */
  #onPaste(e: ClipboardEvent): void {
    const input = this.#input!;
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const whole = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (!text || !whole || input.readOnly) return;
    const r = evaluate(text.trim(), { locale: resolveLocale(this), format: this.format, base: this.#committed });
    if (!r.ok || r.value === null || text.trim().startsWith("=")) return;
    e.preventDefault();
    const v = roundValue(r.value, this.#fo());
    input.value = formatEdit(v, this.#fo());
    this.#dirty = true;
    this.#bad = "";
    this.#setLive(v);
    this.#paintHint(null);
    this.#paintValue();
  }

  /** Confirma (al salir o con Enter): formatea, recorta a `min`/`max` y emite `nx-change` si cambió. */
  #commit(enter: boolean): void {
    if (!this.#built) return;
    const input = this.#input!;
    const r = this.#read();
    if (!r.ok) {
      this.#bad = cap(errorText(r, this.#labels));
      this.#paintHint(r);
      this.#paintValue();
      if (enter) this.#say(this.#bad);
      return;
    }
    let v = r.value === null ? null : roundValue(r.value, this.#fo());
    if (v !== null) {
      const c = clampValue(v, this.min, this.max);
      if (c.clamped) this.#notice(c.clamped);
      v = c.value;
    }
    this.#bad = "";
    this.#dirty = false;
    this.#setLive(v);
    input.value = v === null ? "" : formatEdit(v, this.#fo());
    this.#focusText = input.value;
    this.#paintHint(null);
    this.#paintValue();
    if (v !== this.#committed) {
      this.#committed = v;
      this.dispatchEvent(new Event("change", { bubbles: true }));
      this.dispatchEvent(new CustomEvent("nx-change", { detail: { value: v, text: this.text }, bubbles: true, composed: true }));
    }
  }

  /** Cambia el valor vivo y avisa con `input` (solo si cambió). */
  #setLive(v: number | null): void {
    if (v === this.#value) return;
    this.#value = v;
    this.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  }

  /** «El máximo es 100 %»: se muestra un momento debajo y el campo da un saltico. */
  #notice(which: "min" | "max"): void {
    const limit = which === "min" ? this.min : this.max;
    this.#say(this.#labels[which].replace(`{${which}}`, formatText(limit, this.#fo())));
    this.#field!.classList.remove("is-bump");
    void this.#field!.offsetWidth;
    this.#field!.classList.add("is-bump");
  }
  #say(text: string): void {
    const note = this.#note!;
    note.textContent = text;
    note.dataset.on = "";
    clearTimeout(this.#noticeTimer);
    this.#noticeTimer = window.setTimeout(() => {
      delete note.dataset.on;
      note.textContent = "";
    }, NOTICE_MS);
  }

  /** El nombre accesible: `label`, o los `<label>` asociados al elemento. */
  #name(): void {
    const input = this.#input;
    if (!input) return;
    if (this.label) {
      input.setAttribute("aria-label", this.label);
      input.removeAttribute("aria-labelledby");
      return;
    }
    input.removeAttribute("aria-label");
    let ids: string[] = [];
    try {
      ids = Array.from(this.#internals?.labels ?? [], (l, i) => ((l as HTMLElement).id ||= `${this.#uid}-label${i}`));
    } catch {
      /* sin `internals.labels` */
    }
    if (ids.length) input.setAttribute("aria-labelledby", ids.join(" "));
    else input.removeAttribute("aria-labelledby");
  }

  /** La vista previa («= 1.350») o el error, a la derecha del campo. */
  #paintHint(r: NumberReading | null): void {
    const hint = this.#hint!;
    let text = "";
    let bad = false;
    if (r && !r.ok) {
      text = errorText(r, this.#labels);
      bad = true;
    } else if (r?.ok && r.calc && r.value !== null) {
      const v = roundValue(r.value, this.#fo());
      text = `${this.#labels.equals} ${formatText(v, this.#fo())}`;
    }
    hint.textContent = text;
    hint.hidden = !text;
    hint.toggleAttribute("data-error", bad);
  }

  /** Lo que depende del valor: ARIA, las letras, el <form>. */
  #paintValue(): void {
    const input = this.#input!;
    const v = this.#value;
    const fo = this.#fo();
    if (v === null) {
      input.removeAttribute("aria-valuenow");
      input.removeAttribute("aria-valuetext");
    } else {
      input.setAttribute("aria-valuenow", String(v));
      input.setAttribute("aria-valuetext", formatText(v, fo));
    }
    input.toggleAttribute("aria-invalid", !!this.#bad);
    this.#field!.toggleAttribute("data-invalid", !!this.#bad);
    const words = this.words && v !== null ? this.#wordsOf(v) : "";
    this.#words!.textContent = words;
    this.#words!.hidden = !words;
    this.#sync();
  }

  #wordsOf(v: number): string {
    const locale = resolveLocale(this);
    if (this.format === "percent") {
      const w = numberToWords(roundValue(v * 100, { decimals: 2 }));
      return w && cap(`${w} por ciento`);
    }
    return cap(numberToWords(v, { currency: this.format === "money" ? wordsCurrency(this.currency, locale) : undefined }));
  }

  /** Todo lo demás: atributos del campo, símbolos, alineación, y el texto si no se está escribiendo. */
  #paint(): void {
    if (!this.#built) return;
    const input = this.#input!;
    const fo = this.#fo();
    input.disabled = this.disabled || this.#formDisabled;
    input.readOnly = this.readonly;
    input.placeholder = this.placeholder;
    input.required = false; // la validez es del elemento, no del campo interno
    const { min, max } = this;
    if (min === null) input.removeAttribute("aria-valuemin");
    else input.setAttribute("aria-valuemin", String(min));
    if (max === null) input.removeAttribute("aria-valuemax");
    else input.setAttribute("aria-valuemax", String(max));
    input.toggleAttribute("aria-required", this.required);
    const { prefix, suffix } = affixes(fo);
    this.#prefix!.textContent = prefix;
    this.#prefix!.hidden = !prefix;
    this.#suffix!.textContent = suffix;
    this.#suffix!.hidden = !suffix;
    this.#field!.dataset.align = this.align;
    this.#field!.toggleAttribute("data-disabled", input.disabled);
    this.#field!.toggleAttribute("data-readonly", this.readonly);
    if (!this.#dirty && !this.#bad) input.value = this.#value === null ? "" : formatEdit(this.#value, fo);
    if (!this.#bad) this.#paintHint(null);
    this.#paintValue();
  }

  /** El valor para el <form> (en formato de máquina: «1450000.5») y la validez. */
  #sync(): void {
    const i = this.#internals;
    if (!i) return;
    const v = this.#value;
    const { min, max } = this;
    try {
      i.setFormValue(v === null ? null : String(v));
      const anchor = this.#input;
      const L = this.#labels;
      if (this.#bad) i.setValidity({ badInput: true }, this.#bad, anchor);
      else if (this.required && v === null) i.setValidity({ valueMissing: true }, L.required, anchor);
      else if (v !== null && min !== null && v < min) i.setValidity({ rangeUnderflow: true }, L.min.replace("{min}", formatText(min, this.#fo())), anchor);
      else if (v !== null && max !== null && v > max) i.setValidity({ rangeOverflow: true }, L.max.replace("{max}", formatText(max, this.#fo())), anchor);
      else i.setValidity({});
    } catch {
      /* happy-dom y navegadores sin form-associated: se ignora */
    }
  }
}
