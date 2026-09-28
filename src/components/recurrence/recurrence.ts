/**
 * `<nx-recurrence>`: una repetición escrita como se dice («el último viernes de cada mes a las
 * 5 pm»). Debajo del campo, cómo se entendió (la frase canónica) y las próximas fechas reales, con
 * las que se corrieron por festivo; plegados, los controles clásicos (frecuencia, días, hora, desde,
 * hasta, festivos), sincronizados con la frase en los dos sentidos.
 *
 * Guarda una RRULE de iCalendar (con `X-NX-HOLIDAYS` para los festivos) y participa en un <form>
 * nativo: envía la RRULE (o el JSON con `value-format="json"`), con `required` y validez. El
 * intérprete y los controles llegan con `import()` (al acercarse al campo o si el valor es una frase).
 */
import { Base, boolAttr } from "../../core/define";
import { dayOf, dayOfISO, isoOf, todayOf } from "../../core/days";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import { colombiaHolidays, describeRecurrence, formatClock, occurrences, parseRRule, RRULE_RX, shortDate, toRRule } from "./logic";
import type { Manual } from "./recurrence-edit";
import type { RecurrenceLabels, RecurrenceOccurrence, RecurrenceRule, RecurrenceValue, RecurrenceValueFormat } from "./types";

type Edit = typeof import("./recurrence-edit");
let edit: Edit | undefined;
let editing: Promise<unknown> | undefined;
/** El intérprete y los controles (un solo `import()` para todos los elementos). Si no llega (sin
 *  red), se vuelve a pedir la próxima vez. */
const need = () =>
  (editing ??= import("./recurrence-edit").then(
    (m) => (edit = m),
    () => (editing = undefined),
  ));

export const RECURRENCE_LABELS: RecurrenceLabels = {
  placeholder: "Ej.: el último viernes de cada mes a las 5 pm",
  hint: "Escríbelo como lo dirías: «de lunes a viernes a las 7 am», «los días 5 y 20 de cada mes».",
  unknown: 'no entiendo "{text}"',
  required: "Escribe cuándo se repite",
  none: "Con esta regla no hay fechas",
  next: "Próximas fechas",
  moved: "{from} → {to}, por festivo",
  manual: "Ajustar a mano",
  freq: "Frecuencia",
  hourly: "Por horas",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  yearly: "Anual",
  every: "Cada",
  units: "horas|días|semanas|meses|años",
  days: "Días",
  monthDay: "Del mes",
  onDay: "El día",
  onThe: "El",
  ordinals: "primer|segundo|tercer|cuarto|último",
  day: "día",
  businessDay: "día hábil",
  month: "Mes",
  time: "Hora",
  from: "De",
  to: "a",
  start: "Desde",
  end: "Termina",
  never: "Nunca",
  onDate: "El día",
  after: "Después de",
  times: "veces",
  holidays: "Festivos",
  holidaysIgnore: "No importan",
  holidaysSkip: "Se saltan",
  holidaysBefore: "Día hábil anterior",
  holidaysAfter: "Día hábil siguiente",
};

const PROPS = ["value", "name", "required", "disabled", "readonly", "start", "holidays", "holidaysMode", "count", "valueFormat", "locale", "label", "labels"] as const;
/** Lo que se anuncia espera a que se deje de escribir. */
const SAY_MS = 800;
const localISO = (o: RecurrenceOccurrence) => (o.time === null ? o.day : `${o.day}T${String(Math.floor(o.time / 60)).padStart(2, "0")}:${String(o.time % 60).padStart(2, "0")}`);

let uid = 0;

export class NxRecurrence extends Base {
  static formAssociated = true;
  static observedAttributes = ["value", "name", "required", "disabled", "readonly", "start", "holidays", "holidays-mode", "count", "value-format", "locale", "label", "labels"];

  #uid = `nx-rec${++uid}`;
  #internals: ElementInternals | null = null;
  #labels: RecurrenceLabels = RECURRENCE_LABELS;
  #rule: RecurrenceRule | null = null;
  /** Lo que no se entendió (las palabras), o `""`. */
  #bad = "";
  #next: RecurrenceOccurrence[] = [];
  /** La RRULE de la última vez que se avisó (`nx-change` sale solo si cambia). */
  #sent = "";
  /** El valor del atributo: al que vuelve un <form reset>. */
  #default = "";
  /** El texto del campo es la frase canónica (vino de una RRULE o de los controles): cambia con el locale. */
  #canon = false;
  /** `value` antes de construir (una propiedad puesta antes de registrar el elemento). */
  #initial: string | null = null;
  #holidays: string[] = [];
  #formDisabled = false;
  #timer = 0;
  #built = false;
  #input?: HTMLInputElement;
  #said?: HTMLParagraphElement;
  #list?: HTMLOListElement;
  #nextBox?: HTMLDivElement;
  #live?: HTMLSpanElement;
  #cap?: HTMLSpanElement;
  #manual?: HTMLDetailsElement;
  #ctl?: Manual;

  constructor() {
    super();
    try {
      this.#internals = (this as HTMLElement).attachInternals?.() ?? null;
    } catch {
      this.#internals = null;
    }
  }

  // ---------------------------------------------------------------- propiedades

  /** Al leer, la RRULE (`""` sin regla). Al escribir, una frase («los lunes a las 8») o una RRULE. */
  get value(): string {
    return this.rule;
  }
  set value(v: string | null | undefined) {
    if (v === undefined) return;
    this.#load(v ?? "");
  }
  /** La RRULE: `DTSTART:…` y `RRULE:…` (con `X-NX-HOLIDAYS` si aplica), o `""`. */
  get rule(): string {
    return this.#rule ? toRRule(this.#rule) : "";
  }
  /** La frase canónica («El último viernes de cada mes, a las 5:00 p. m.»), o `""`. */
  get text(): string {
    return this.#rule ? describeRecurrence(this.#rule, this.#opts()) : "";
  }
  /** Las próximas fechas (tantas como `count`). */
  get next(): Date[] {
    return this.#next.map((o) => o.date);
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
  /** Desde cuándo (ISO): el `DTSTART` si la frase no dice «desde…». Por defecto, hoy. */
  get start(): string {
    return isoOf(todayOf(this.getAttribute("start")));
  }
  set start(v: string | null) {
    this.#attr("start", v);
  }
  /** Festivos propios (fechas ISO): se suman a los de Colombia, o los reemplazan con `holidays-mode="replace"`. */
  get holidays(): string[] {
    return this.#holidays;
  }
  set holidays(v: string[] | string | null | undefined) {
    let a: unknown = v;
    if (typeof v === "string")
      try {
        a = JSON.parse(v);
      } catch {
        console.warn('[nx-recurrence] el atributo "holidays" no es JSON válido');
        a = null;
      }
    this.#holidays = Array.isArray(a) ? a.filter((d) => dayOfISO(d) !== null) : [];
    this.#refresh();
  }
  get holidaysMode(): "add" | "replace" {
    return this.getAttribute("holidays-mode") === "replace" ? "replace" : "add";
  }
  set holidaysMode(v: "add" | "replace") {
    this.#attr("holidays-mode", v);
  }
  /** Cuántas próximas fechas mostrar (0–50, 5). */
  get count(): number {
    const n = Number(this.getAttribute("count") ?? 5);
    return Number.isInteger(n) && n >= 0 ? Math.min(n, 50) : 5;
  }
  set count(v: number) {
    this.#attr("count", String(v));
  }
  /** Qué envía el <form>: la RRULE (`rrule`) o `toJSON()` como JSON (`json`). */
  get valueFormat(): RecurrenceValueFormat {
    return this.getAttribute("value-format") === "json" ? "json" : "rrule";
  }
  set valueFormat(v: RecurrenceValueFormat) {
    this.#attr("value-format", v);
  }
  /** Idioma de la frase (español; `en…`, inglés) y formato de las fechas. Sin él, el `lang` más cercano. */
  get locale(): string {
    return resolveLocale(this);
  }
  set locale(v: string | null) {
    this.#attr("locale", v);
  }
  /** Nombre accesible del campo (si no hay un `<label for>` que lo nombre). */
  get label(): string {
    return this.getAttribute("label") ?? "";
  }
  set label(v: string) {
    this.#attr("label", v);
  }
  get labels(): RecurrenceLabels {
    return this.#labels;
  }
  set labels(v: Partial<RecurrenceLabels> | string | null | undefined) {
    this.#labels = mergeLabels(RECURRENCE_LABELS, v);
    this.#texts();
    this.#refresh();
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
  focus(options?: FocusOptions): void {
    this.#input?.focus(options);
  }
  /** `{rrule, text, holidays, next}`: lo que va al backend (`next` en hora local, «2026-10-30T17:00»). */
  toJSON(): RecurrenceValue {
    return { rrule: this.rule, text: this.text, holidays: this.#rule?.holidays ?? null, next: this.#next.map(localISO) };
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
    this.#name();
    queueMicrotask(() => this.#name());
  }

  disconnectedCallback(): void {
    clearTimeout(this.#timer);
  }

  attributeChangedCallback(name: string, _old: string | null, v: string | null): void {
    if (name === "labels" || name === "holidays") {
      (this as unknown as Record<string, unknown>)[name] = v;
      return;
    }
    if (name === "value") return this.#load((this.#default = v ?? ""));
    if (name === "label") return this.#name();
    // Otro «hoy»: una frase escrita se vuelve a leer (su DTSTART y sus «el lunes» cambian).
    if (name === "start" && !this.#canon && this.#input?.value) return this.#load(this.#input.value);
    if (name === "locale") {
      if (this.#canon && this.#rule) this.#show(this.#rule);
      this.#ctl?.texts();
    }
    this.#refresh();
  }

  formResetCallback(): void {
    this.#load(this.#default);
  }
  formDisabledCallback(disabled: boolean): void {
    this.#formDisabled = disabled;
    this.#refresh();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }
  #bool(name: string, v: boolean): void {
    this.toggleAttribute(name, !!v);
  }
  #opts() {
    return { start: this.start, locale: this.locale };
  }

  #build(): void {
    this.#built = true;
    const id = this.#uid;
    const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, attrs: Record<string, string> = {}) => {
      const el = document.createElement(tag);
      el.className = `nx-recurrence__${cls}`;
      for (const k in attrs) el.setAttribute(k, attrs[k]);
      return el;
    };
    // El campo no tiene `name` y apunta a un `form` que no existe: el <form> recibe el valor del elemento.
    const input = (this.#input = mk("input", "input", { type: "text", autocomplete: "off", spellcheck: "false", enterkeyhint: "done", "aria-describedby": `${id}-said ${id}-next`, form: `${id}-none` }));
    const field = mk("div", "field");
    field.append(input);
    this.#said = mk("p", "said", { id: `${id}-said` });
    this.#nextBox = mk("div", "next", { id: `${id}-next` });
    this.#cap = mk("span", "cap", { id: `${id}-cap` });
    this.#list = mk("ol", "list", { "aria-labelledby": `${id}-cap` });
    this.#nextBox.append(this.#cap, this.#list);
    this.#live = mk("span", "live", { role: "status" });
    const manual = (this.#manual = mk("details", "manual"));
    manual.append(document.createElement("summary"));
    this.append(field, this.#said, this.#nextBox, this.#live, manual);

    input.addEventListener("input", () => {
      this.#canon = false;
      this.#parse(input.value, true);
    });
    input.addEventListener("change", (e) => {
      e.stopPropagation();
      this.#commit();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        this.#commit();
        if (this.#bad) e.preventDefault();
      }
    });
    // El intérprete y los controles llegan con `import()`: se piden al acercarse, antes de escribir.
    for (const t of ["focusin", "pointerenter"]) this.addEventListener(t, () => void need(), { once: true });
    manual.addEventListener("toggle", () => {
      if (manual.open) this.#controls();
    });
    this.#texts();
    this.#load(this.#initial ?? this.getAttribute("value") ?? "");
  }

  /** Los controles de «Ajustar a mano» (se construyen la primera vez que hacen falta). */
  #controls(): void {
    if (this.#ctl || !this.#built) return;
    if (!edit) return void need().then(() => edit && this.#controls());
    this.#ctl = edit.manual({
      root: this.#manual!,
      uid: this.#uid,
      labels: () => this.#labels,
      locale: () => this.locale,
      start: () => this.start,
      apply: (r) => {
        // Los controles reescriben la frase canónica en el campo; la regla es la que esa frase dice.
        this.#show(r);
        this.#rule = edit!.parseRecurrence(this.#input!.value, this.#opts()).rule ?? r;
        this.#bad = "";
        this.#ctl!.sync(this.#rule);
        this.#refresh(true);
        this.#commit();
      },
    });
    if (this.#rule) this.#ctl.sync(this.#rule);
    this.#refresh();
  }

  /** Los textos que no cambian con el valor. */
  #texts(): void {
    if (!this.#built) return;
    this.#input!.placeholder = this.#labels.placeholder;
    this.#manual!.firstElementChild!.textContent = this.#labels.manual;
    this.#cap!.textContent = this.#labels.next;
    this.#ctl?.texts();
  }

  /** Un valor de afuera (atributo, propiedad, reset): una RRULE se muestra como su frase canónica. */
  #load(v: string): void {
    if (!this.#built) return void (this.#initial = v);
    this.#canon = false;
    this.#input!.value = v;
    this.#parse(v, false);
    if (RRULE_RX.test(v) && this.#rule) this.#show(this.#rule);
  }

  /** La regla en el campo como su frase canónica (desde una RRULE o desde los controles). */
  #show(r: RecurrenceRule): void {
    this.#canon = true;
    this.#input!.value = describeRecurrence(r, this.#opts());
  }

  /** Lo escrito (o lo que llegó de afuera) → la regla. Una frase necesita el intérprete: si todavía
   *  no llegó, se interpreta al llegar (si el texto sigue siendo el mismo). */
  #parse(text: string, typed: boolean): void {
    let rule: RecurrenceRule | null = null;
    let bad = "";
    if (RRULE_RX.test(text)) bad = (rule = parseRRule(text)) ? "" : text.trim();
    else if (text.trim()) {
      if (!edit) return void need().then(() => edit && this.#input!.value === text && this.#parse(text, typed));
      const res = edit.parseRecurrence(text, this.#opts());
      rule = res.rule;
      bad = res.unknown ?? "";
    }
    this.#rule = rule;
    this.#bad = bad;
    if (rule) this.#ctl?.sync(rule);
    // Lo que llega de afuera no se avisa: `nx-change` es para lo que cambia quien usa el campo.
    if (!typed) this.#sent = this.rule;
    this.#refresh(typed);
  }

  /** Al salir del campo o con Enter: avisa si la regla cambió, o por qué no se entiende. */
  #commit(): void {
    const v = this.#input!.value;
    // Una frase que todavía espera al intérprete se confirma cuando llega (después de entenderla).
    if (!edit && v.trim() && !RRULE_RX.test(v)) return void need().then(() => edit && this.#commit());
    if (this.#bad) {
      this.dispatchEvent(new CustomEvent("nx-recurrence-error", { detail: { message: this.#message() }, bubbles: true, composed: true }));
      return;
    }
    const rrule = this.rule;
    if (rrule === this.#sent) return;
    this.#sent = rrule;
    this.dispatchEvent(new Event("change", { bubbles: true }));
    this.dispatchEvent(new CustomEvent("nx-change", { detail: { value: rrule, rrule, text: this.text, next: this.next }, bubbles: true, composed: true }));
  }

  #message(): string {
    return this.#labels.unknown.replace("{text}", this.#bad);
  }

  /** Las fechas, la frase interpretada, el <form> y lo que se anuncia. */
  #refresh(say = false): void {
    if (!this.#built) return;
    const L = this.#labels;
    const loc = this.locale;
    const input = this.#input!;
    input.disabled = this.disabled || this.#formDisabled;
    input.readOnly = this.readonly;
    input.toggleAttribute("aria-invalid", !!this.#bad);
    input.toggleAttribute("aria-required", this.required);
    this.#ctl?.disable(input.disabled || this.readonly);
    const r = this.#rule;
    const custom = this.#holidays;
    const now = new Date();
    // Las próximas desde ahora, o desde `DTSTART` si empieza después.
    const from = r && dayOf(now.getFullYear(), now.getMonth() + 1, now.getDate()) < dayOfISO(r.start)! ? r.start : now;
    this.#next = r ? occurrences(r, from, this.count, this.holidaysMode === "replace" ? custom : (y) => [...colombiaHolidays(y), ...custom]) : [];
    const said = this.#said!;
    said.dataset.state = this.#bad ? "bad" : r ? "ok" : "hint";
    said.textContent = this.#bad ? this.#message() : r ? this.text : L.hint;
    this.#nextBox!.hidden = !r || !this.count;
    const n = this.#next;
    const day = (iso: string, year: boolean) => shortDate(dayOfISO(iso)!, loc, true, year);
    this.#list!.replaceChildren(
      ...(r && !n.length ? [L.none] : n).map((o, i) => {
        const li = document.createElement("li");
        if (typeof o === "string") return (li.textContent = o), li;
        // «vie 30 oct 2026, 5:00 p. m.», y después solo lo que cambia: «vie 27 nov».
        const text = day(o.day, !i || o.day.slice(0, 4) !== n[i - 1].day.slice(0, 4)) + (o.time !== null && (!i || o.time !== n[0].time) ? `, ${formatClock(o.time, loc)}` : "");
        li.textContent = o.movedFrom ? L.moved.replace("{from}", day(o.movedFrom, false)).replace("{to}", text) : text;
        li.toggleAttribute("data-moved", !!o.movedFrom);
        return li;
      }),
    );
    this.#sync();
    // La interpretación se anuncia con cortesía cuando se deja de escribir, no por cada tecla.
    clearTimeout(this.#timer);
    if (say) this.#timer = window.setTimeout(() => (this.#live!.textContent = said.textContent), SAY_MS);
  }

  /** El valor para el <form> y la validez. */
  #sync(): void {
    const i = this.#internals;
    if (!i) return;
    try {
      i.setFormValue(this.#rule ? (this.valueFormat === "json" ? JSON.stringify(this.toJSON()) : this.rule) : null);
      if (this.#bad) i.setValidity({ badInput: true }, this.#message(), this.#input);
      else if (this.required && !this.#rule) i.setValidity({ valueMissing: true }, this.#labels.required, this.#input);
      else i.setValidity({});
    } catch {
      /* happy-dom y navegadores sin form-associated */
    }
  }

  /** El nombre accesible: `label`, o los `<label>` asociados al elemento. */
  #name(): void {
    const input = this.#input;
    if (!input) return;
    if (this.label) return input.setAttribute("aria-label", this.label);
    input.removeAttribute("aria-label");
    let ids: string[] = [];
    try {
      ids = Array.from(this.#internals?.labels ?? [], (l, k) => ((l as HTMLElement).id ||= `${this.#uid}-l${k}`));
    } catch {
      /* sin `internals.labels` */
    }
    if (ids.length) input.setAttribute("aria-labelledby", ids.join(" "));
    else input.removeAttribute("aria-labelledby");
  }
}
