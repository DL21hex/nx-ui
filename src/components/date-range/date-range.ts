/**
 * `<nx-date-range>`: un rango de fechas que se escribe como se dice. Cerrado es un campo compacto
 * («1 jul – 30 sept 2026 · 92 días»); abierto, una caja donde se escribe en español («Q3»,
 * «últimos 30 días», «de marzo a junio», «año fiscal») que muestra en vivo cómo se entendió, los
 * atajos y un calendario de dos meses que se maneja entero con el teclado.
 *
 * Con `compare` calcula y muestra contra qué se compara (el período anterior, o el mismo del año
 * anterior) y lo incluye en el valor. Participa en un <form> nativo: `name[start]` y `name[end]`.
 */
import { Base, boolAttr } from "../../core/define";
import { h } from "../../core/dom";
import { glyph } from "../../core/icons";
import { resolveLocale } from "../../core/locale";
import { foldText } from "../../core/text";
import { addMonths, clampRange, dayOf, cleanPresets, compareRange, dayLabel, dayOfISO, daysText, DEFAULT_PRESETS, formatRange, isoOf, monthGrid, monthTitle, parsePhrase, presetRange, rangeDays, startOfWeek, todayOf, toRange, weekdays, weekStartOf, ymd, type ParseOptions } from "./logic";
import type { DateRange, DateRangeCompare, DateRangeLabels, DateRangePreset, DateRangePresetInput, DateRangeValue } from "./types";

export const DATE_RANGE_LABELS: DateRangeLabels = {
  placeholder: "Elige un período",
  dialog: "Elegir período",
  ask: "Escribe un período",
  askPlaceholder: "Q3, últimos 30 días, de marzo a junio…",
  askHint: "Escríbelo como lo dirías: «este trimestre», «marzo 2025», «desde el 15 de marzo».",
  unknown: "No entendí «{text}». Prueba «Q3 2025» o «de marzo a junio».",
  outOfRange: "Queda fuera de las fechas permitidas",
  clamped: "ajustado a las fechas permitidas",
  presets: "Atajos",
  prevMonth: "Mes anterior",
  nextMonth: "Mes siguiente",
  pickEnd: "ahora elige el día final",
  today: "hoy",
  day: "{n} día",
  days: "{n} días",
  compare: "Comparar con",
  compareNone: "Nada",
  comparePrevious: "Período anterior",
  compareYear: "Año anterior",
  versus: "vs {range}",
  apply: "Enter para aplicar",
};

const CAL = '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>';
const SPARK = '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>';
const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
const PREV = '<path d="m15 18-6-6 6-6"/>';
const NEXT = '<path d="m9 18 6-6-6-6"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const PROPS = ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "label", "placeholder", "labels"] as const;
type Draft = { range: DateRange; clamped?: boolean } | { bad: "unknown" | "outOfRange" } | null;
type Span = [number, number];

let uid = 0;

export class NxDateRange extends Base {
  static formAssociated = true;
  static observedAttributes = ["start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscal-start", "week-start", "name", "required", "disabled", "placeholder", "labels", "label", "locale"];

  #range: DateRange | null = null;
  #rangeLabel: string | undefined;
  /** El valor lo eligió alguien (o `value`): los atributos de inicio ya no lo pisan. */
  #dirty = false;
  #presets: DateRangePreset[] | null = null;
  #labels: DateRangeLabels = DATE_RANGE_LABELS;
  #uid = `nx-dr${++uid}`;
  #internals: ElementInternals | null = null;
  #built = false;
  // Estado del panel abierto.
  #isOpen = false;
  #view = 0;
  #count = 2;
  #focus = 0;
  #anchor: number | null = null;
  #hover: number | null = null;
  #draft: Draft = null;
  #peek: Span | null = null;
  #typed = "";
  #track?: () => void;
  // Nodos.
  #field?: HTMLButtonElement;
  #pop?: HTMLDivElement;
  #input?: HTMLInputElement;
  #preview?: HTMLParagraphElement;
  #list?: HTMLDivElement;
  #months?: HTMLDivElement;
  #foot?: HTMLDivElement;
  #vs?: HTMLSpanElement;

  constructor() {
    super();
    // Sin DOM (SSR) o sin form-associated, funciona igual; solo no participa en el <form>.
    try {
      this.#internals = (this as HTMLElement).attachInternals?.() ?? null;
    } catch {
      this.#internals = null;
    }
  }

  // ---------------------------------------------------------------- propiedades

  /** `{start, end, compare?, label?}` o `null`. Acepta también «2026-07-01/2026-09-30». */
  get value(): DateRangeValue | null {
    const r = this.#range;
    if (!r) return null;
    const mode = this.#mode();
    return { ...r, ...(mode ? { compare: compareRange(r, mode) } : null), ...(this.#rangeLabel ? { label: this.#rangeLabel } : null) };
  }
  set value(v: Partial<DateRangeValue> | string | null | undefined) {
    // `undefined` no toca nada (un framework que no lo pasa); `null` limpia.
    if (v === undefined) return;
    const r = toRange(v);
    this.#set(r && clampRange(r, this.min, this.max), r && typeof v === "object" && typeof v?.label === "string" ? v.label : undefined);
    this.#dirty = true;
  }
  /** Inicio en ISO («2026-07-01»); el atributo fija el valor inicial. */
  get start(): string {
    return this.#range?.start ?? "";
  }
  set start(v: string) {
    this.#attr("start", v);
  }
  get end(): string {
    return this.#range?.end ?? "";
  }
  set end(v: string) {
    this.#attr("end", v);
  }
  /** Valor inicial como frase («este trimestre»): el backend no tiene que calcular fechas. */
  get phrase(): string | null {
    return this.getAttribute("phrase");
  }
  set phrase(v: string | null) {
    this.#attr("phrase", v);
  }
  /** Atajos: frases («Últimos 7 días») o `{label, phrase | start + end}`. `null` vuelve a los de siempre. */
  get presets(): DateRangePreset[] {
    return this.#presets ?? cleanPresets(this.fiscalStart === 1 ? DEFAULT_PRESETS : [...DEFAULT_PRESETS, "Año fiscal", "Año fiscal pasado"]);
  }
  set presets(v: DateRangePresetInput[] | null | undefined) {
    this.#presets = Array.isArray(v) ? cleanPresets(v) : null;
    if (this.open) this.#renderPresets();
  }
  /** `previous` o `year` comparan; `none` muestra la opción sin comparar; sin atributo, no hay opción. */
  get compare(): DateRangeCompare | "none" | null {
    const v = this.getAttribute("compare");
    return v === null ? null : v === "previous" || v === "year" ? v : "none";
  }
  set compare(v: DateRangeCompare | "none" | null) {
    if (v === null || v === undefined) this.removeAttribute("compare");
    else this.setAttribute("compare", v);
  }
  /** Fechas permitidas (ISO): lo de afuera se deshabilita y se recorta. */
  get min(): string | null {
    return this.getAttribute("min");
  }
  set min(v: string | null) {
    this.#attr("min", v);
  }
  get max(): string | null {
    return this.getAttribute("max");
  }
  set max(v: string | null) {
    this.#attr("max", v);
  }
  /** «Hoy» (ISO) para las frases y el calendario; por defecto, la fecha local. Útil para demos y pruebas. */
  get today(): string {
    return isoOf(todayOf(this.getAttribute("today")));
  }
  set today(v: string | null) {
    this.#attr("today", v);
  }
  /** Mes en que empieza el año fiscal (1–12): «año fiscal» y sus atajos. */
  get fiscalStart(): number {
    const n = Number(this.getAttribute("fiscal-start"));
    return Number.isInteger(n) && n >= 1 && n <= 12 ? n : 1;
  }
  set fiscalStart(v: number) {
    this.#attr("fiscal-start", String(v));
  }
  /** Primer día de la semana, 1 (lunes) … 7 (domingo). Por defecto, el del locale (`Intl.Locale` weekInfo) o lunes. */
  get weekStart(): number {
    const n = Number(this.getAttribute("week-start"));
    return Number.isInteger(n) && n >= 1 && n <= 7 ? n : weekStartOf(resolveLocale(this));
  }
  set weekStart(v: number) {
    this.#attr("week-start", String(v));
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
  /** Nombre accesible del campo y del panel («Período»). */
  get label(): string | null {
    return this.getAttribute("label");
  }
  set label(v: string | null) {
    this.#attr("label", v);
  }
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? this.#labels.placeholder;
  }
  set placeholder(v: string) {
    this.#attr("placeholder", v);
  }
  get labels(): DateRangeLabels {
    return this.#labels;
  }
  set labels(v: Partial<DateRangeLabels> | null | undefined) {
    this.#labels = { ...DATE_RANGE_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }
  get open(): boolean {
    return this.#isOpen;
  }

  /** Abre el panel; con `text`, con esa frase ya escrita (y su interpretación a la vista). */
  show(text?: string): void {
    if (this.disabled || !this.#pop) return;
    if (text !== undefined) this.#typed = text;
    if (!this.open) {
      this.#pop.showPopover();
      // En el acto, no al llegar `toggle` (que es asíncrono): lo que se teclea justo después tiene
      // que caer en la caja. Lo que ya dice queda seleccionado para reemplazarlo.
      if (this.open) this.#focusInput();
    } else if (text !== undefined) (this.#input!.value = text), this.#onType();
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
    if (!this.#dirty) this.#initial();
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#track?.();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "presets" || name === "labels") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-date-range] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    // Lo que define el valor inicial (o cómo se interpreta la frase) lo recalcula mientras nadie elija.
    if (/^(start|end|phrase)$/.test(name)) this.#dirty = false;
    if (!this.#dirty && /^(start|end|phrase|today|fiscal-start|week-start|min|max)$/.test(name)) this.#initial();
    else this.#sync();
    this.#paint();
    if (this.open) this.#renderAll();
  }

  /** Un <form reset> vuelve al valor de los atributos (`start`/`end` o `phrase`). */
  formResetCallback(): void {
    this.#dirty = false;
    this.#initial();
    this.#paint();
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
  #locale(): string {
    return resolveLocale(this);
  }
  #mode(): DateRangeCompare | null {
    const c = this.compare;
    return c === "previous" || c === "year" ? c : null;
  }
  #opts(): ParseOptions {
    return { today: this.today, weekStart: this.weekStart, fiscalStart: this.fiscalStart, min: this.min ?? undefined };
  }
  #days(r: DateRange): string {
    return daysText(rangeDays(r), this.#locale(), this.#labels);
  }
  #bounds(): [number, number] {
    return [dayOfISO(this.min) ?? -Infinity, dayOfISO(this.max) ?? Infinity];
  }

  /** El valor de los atributos: `start`/`end`, o `phrase` interpretada. */
  #initial(): void {
    const s = this.getAttribute("start");
    const p = this.phrase;
    const r = s ? toRange({ start: s, end: this.getAttribute("end") ?? s }) : p ? parsePhrase(p, this.#opts()) : null;
    this.#set(r && clampRange(r, this.min, this.max), !s && r ? (p ?? undefined) : undefined);
  }

  #set(r: DateRange | null, label?: string): void {
    this.#range = r ? { start: r.start, end: r.end } : null;
    this.#rangeLabel = r ? label : undefined;
    this.#sync();
    this.#paint();
  }

  /** El valor para el <form> (`name[start]`, `name[end]` y, al comparar, `name[compare][start|end]`) y `required`. */
  #sync(): void {
    const i = this.#internals;
    if (!i) return;
    try {
      const v = this.value;
      const n = this.name;
      if (v && n) {
        const fd = new FormData();
        fd.append(`${n}[start]`, v.start);
        fd.append(`${n}[end]`, v.end);
        if (v.compare) fd.append(`${n}[compare][start]`, v.compare.start), fd.append(`${n}[compare][end]`, v.compare.end);
        i.setFormValue(fd);
      } else i.setFormValue(null);
      if (this.required && !v) i.setValidity({ valueMissing: true }, this.placeholder, this.#field);
      else i.setValidity({});
    } catch {
      /* happy-dom y navegadores sin form-associated: se ignora */
    }
  }

  #commit(r: DateRange | null, label?: string): void {
    const c = r && clampRange(r, this.min, this.max);
    if (!c) return;
    this.#dirty = true;
    this.#set(c, label);
    this.#emit();
    this.hide();
    this.#field!.focus();
  }

  #emit(): void {
    this.dispatchEvent(new CustomEvent("nx-change", { detail: { value: this.value }, bubbles: true, composed: true }));
  }

  #build(): void {
    this.#built = true;
    const popId = `${this.#uid}-pop`;
    const prevId = `${this.#uid}-said`;
    this.#field = h("button", { type: "button", class: "nx-date-range__field", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": popId });
    this.#input = h("input", { type: "text", class: "nx-date-range__input", autocomplete: "off", spellcheck: "false", enterkeyhint: "done", "aria-describedby": prevId });
    this.#preview = h("p", { id: prevId, class: "nx-date-range__said", "aria-live": "polite" });
    this.#list = h("div", { class: "nx-date-range__presets", role: "group" });
    this.#months = h("div", { class: "nx-date-range__months" });
    const nav = (dir: -1 | 1) => h("button", { type: "button", class: `nx-date-range__nav nx-date-range__nav--${dir < 0 ? "prev" : "next"}`, "data-nav": dir }, glyph(dir < 0 ? PREV : NEXT));
    this.#vs = h("span", { class: "nx-date-range__vs" });
    // Los radios no son del <form> de la página (`form` a un id que no existe): el valor lo envía el elemento.
    this.#foot = h(
      "div",
      { class: "nx-date-range__foot" },
      h("span", { id: `${this.#uid}-cmp`, class: "nx-date-range__cmp-label" }),
      h("div", { class: "nx-date-range__seg", role: "radiogroup", "aria-labelledby": `${this.#uid}-cmp` }, ...["none", "previous", "year"].map((v) => h("label", null, h("input", { type: "radio", name: `${this.#uid}-cmp`, value: v, form: `${this.#uid}-none` }), h("span")))),
      this.#vs,
    );
    this.#pop = h(
      "div",
      { id: popId, class: "nx-date-range__pop", popover: "auto", role: "dialog" },
      h("div", { class: "nx-date-range__ask" }, glyph(SPARK, "nx-date-range__spark"), this.#input, h("kbd", { class: "nx-date-range__enter", "aria-hidden": "true" }, "↵")),
      this.#preview,
      h("div", { class: "nx-date-range__body" }, this.#list, h("div", { class: "nx-date-range__cal" }, nav(-1), nav(1), this.#months)),
      this.#foot,
    );
    this.append(this.#field, this.#pop);

    const f = this.#field;
    // Con el panel abierto, presionar el campo ya lo cierra (clic fuera del popover): ese mismo
    // clic no debe volver a abrirlo.
    let wasOpen = false;
    f.addEventListener("pointerdown", () => (wasOpen = this.open));
    f.addEventListener("click", () => {
      if (this.open) this.hide();
      else if (!wasOpen) this.show();
      wasOpen = false;
    });
    f.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.show();
      } else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Escribir sobre el campo cerrado abre la caja con esa letra: «q» → «q3».
        e.preventDefault();
        this.show(e.key);
      }
    });

    const pop = this.#pop;
    pop.addEventListener("beforetoggle", (e) => {
      // `beforetoggle` es síncrono (también al cerrar por clic fuera): de aquí sale `open`.
      this.#isOpen = (e as ToggleEvent).newState === "open";
      if (!this.#isOpen) return;
      this.#anchor = this.#hover = this.#peek = null;
      this.#count = innerWidth < 640 ? 1 : 2;
      pop.dataset.months = String(this.#count);
      delete this.#months!.dataset.dir;
      const r = this.#range;
      this.#focus = this.#clampDay(r ? dayOfISO(r.end)! : todayOf(this.today));
      const [fy, fm] = ymd(this.#focus);
      this.#view = fy * 12 + fm - this.#count;
      this.#draft = null;
      // Si el valor salió de una frase, la caja la muestra (seleccionada, para reemplazarla).
      const said = this.#rangeLabel && r && JSON.stringify(parsePhrase(this.#rangeLabel, this.#opts())) === JSON.stringify(r) ? this.#rangeLabel : "";
      this.#input!.value = this.#typed || said;
      this.#renderAll();
      if (this.#input!.value) this.#onType();
      this.#place();
      requestAnimationFrame(() => this.#place());
      this.#startTracking();
    });
    pop.addEventListener("toggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      f.setAttribute("aria-expanded", String(open));
      if (open) {
        if (!this.#pop!.contains(document.activeElement)) this.#focusInput();
        this.#typed = "";
      } else if (!this.open) {
        this.#track?.();
        this.#typed = "";
        // Cerrado con el foco adentro (o perdido): vuelve al campo.
        const a = document.activeElement;
        if (!a || a === document.body || pop.contains(a)) f.focus();
      }
      if (open === this.open) this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open }, bubbles: true, composed: true }));
    });
    // Tab no se atrapa: si el foco sale del panel (a otra cosa que el campo), se cierra.
    pop.addEventListener("focusout", (e) => {
      const to = e.relatedTarget as Node | null;
      if (to && !pop.contains(to) && to !== f) this.hide();
    });
    pop.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Escape primero suelta un inicio a medio elegir; después cierra.
      e.preventDefault();
      e.stopPropagation();
      if (this.#anchor !== null) {
        this.#anchor = this.#hover = null;
        this.#renderSaid();
        this.#paintCells();
      } else {
        this.hide();
        f.focus();
      }
    });

    this.#input.addEventListener("input", () => this.#onType());
    this.#input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const d = this.#draft;
      if (d && "range" in d) this.#commit(d.range, this.#input!.value.trim());
      else if (this.#input!.value.trim()) {
        // No se entendió: se sacude la interpretación (y el lector ya oyó por qué).
        this.#preview!.classList.remove("is-shake");
        void this.#preview!.offsetWidth;
        this.#preview!.classList.add("is-shake");
      }
    });

    this.#list.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-i]");
      const p = b && this.presets[Number(b.dataset.i)];
      if (p) this.#commit(presetRange(p, this.#opts()), p.label);
    });
    // Pasar sobre un atajo (o enfocarlo) muestra su rango en el calendario y en la interpretación.
    const peek = (e: Event) => {
      const b = (e.target as Element).closest<HTMLButtonElement>("[data-i]");
      const r = b && !b.disabled ? presetRange(this.presets[Number(b.dataset.i)], this.#opts()) : null;
      const c = r && clampRange(r, this.min, this.max);
      this.#peek = c ? [dayOfISO(c.start)!, dayOfISO(c.end)!] : null;
      this.#renderSaid();
      this.#paintCells();
    };
    this.#list.addEventListener("pointerover", peek);
    this.#list.addEventListener("focusin", peek);
    const unpeek = () => {
      if (!this.#peek) return;
      this.#peek = null;
      this.#renderSaid();
      this.#paintCells();
    };
    this.#list.addEventListener("pointerleave", unpeek);
    this.#list.addEventListener("focusout", unpeek);

    const cal = this.#months.parentElement!;
    cal.addEventListener("click", (e) => {
      const t = e.target as Element;
      const nav = t.closest<HTMLElement>("[data-nav]");
      if (nav) {
        this.#view += Number(nav.dataset.nav);
        this.#months!.dataset.dir = nav.dataset.nav;
        this.#focus = this.#clampDay(Math.min(Math.max(this.#focus, this.#first()), this.#last()));
        this.#renderCal();
        return;
      }
      const cell = t.closest<HTMLElement>("[data-day]");
      if (cell) this.#pick(Number(cell.dataset.day));
    });
    this.#months.addEventListener("pointerover", (e) => {
      const cell = (e.target as Element).closest<HTMLElement>("[data-day]");
      if (cell && this.#anchor !== null) {
        this.#hover = Number(cell.dataset.day);
        this.#renderSaid();
        this.#paintCells();
      }
    });
    this.#months.addEventListener("keydown", (e) => this.#gridKey(e));

    this.#foot.addEventListener("change", (e) => {
      this.compare = (e.target as HTMLInputElement).value as DateRangeCompare | "none";
      this.#sync();
      if (this.#range) this.#emit();
    });
  }

  /** Teclado del calendario (patrón «grid» de WAI-ARIA para fechas). */
  #gridKey(e: KeyboardEvent): void {
    const d = this.#focus;
    const k = e.key;
    const sow = startOfWeek(d, this.weekStart);
    const step: Record<string, number> = { ArrowLeft: d - 1, ArrowRight: d + 1, ArrowUp: d - 7, ArrowDown: d + 7, Home: sow, End: sow + 6 };
    if (k === "PageUp" || k === "PageDown") step[k] = addMonths(d, (k === "PageUp" ? -1 : 1) * (e.shiftKey ? 12 : 1));
    if (k === "Enter" || k === " ") {
      e.preventDefault();
      this.#pick(d);
    } else if (k in step) {
      e.preventDefault();
      this.#moveTo(step[k]);
    }
  }

  #moveTo(day: number): void {
    const d = this.#clampDay(day);
    this.#focus = d;
    if (this.#anchor !== null) this.#hover = d;
    if (!this.#show(d)) this.#paintCells();
    else this.#renderCal();
    this.#renderSaid();
    this.#months!.querySelector<HTMLElement>(`[data-day="${d}"]`)?.focus();
  }

  /** Clic o Enter sobre un día: el primero marca el inicio; el segundo, el fin (y se aplica). */
  #pick(day: number): void {
    const [lo, hi] = this.#bounds();
    if (day < lo || day > hi) return;
    this.#focus = day;
    if (this.#anchor === null) {
      this.#anchor = this.#hover = day;
      this.#input!.value = "";
      this.#draft = null;
      this.#renderSaid();
      this.#paintCells();
      return;
    }
    const a = Math.min(this.#anchor, day);
    const b = Math.max(this.#anchor, day);
    this.#anchor = this.#hover = null;
    this.#commit({ start: isoOf(a), end: isoOf(b) });
  }

  #onType(): void {
    const text = this.#input!.value;
    const r = text.trim() ? parsePhrase(text, this.#opts()) : null;
    const c = r && clampRange(r, this.min, this.max);
    this.#draft = !text.trim() ? null : c ? { range: c, clamped: c.clamped } : { bad: r ? "outOfRange" : "unknown" };
    this.#anchor = this.#hover = null;
    // El calendario va a donde está lo que se escribió.
    if (c && this.#show(dayOfISO(c.end)!, true)) this.#renderCal();
    else this.#paintCells();
    this.#renderSaid();
  }

  #focusInput(): void {
    const i = this.#input!;
    i.focus({ preventScroll: true });
    if (this.#typed) i.setSelectionRange(i.value.length, i.value.length);
    else i.select();
  }

  /** Un día dentro de `min`/`max`. */
  #clampDay(d: number): number {
    const [lo, hi] = this.#bounds();
    return Math.min(Math.max(d, lo), hi);
  }
  #first(): number {
    return dayOf(Math.floor(this.#view / 12), (this.#view % 12) + 1, 1);
  }
  #last(): number {
    return addMonths(this.#first(), this.#count) - 1;
  }
  /** Mueve la vista para que `day` se vea: hacia atrás queda de primero; hacia adelante (o con
   *  `last`), de último. `true` si cambió. */
  #show(day: number, last = false): boolean {
    const [y, m] = ymd(day);
    const idx = y * 12 + m - 1;
    if (idx >= this.#view && idx < this.#view + this.#count) return false;
    this.#months!.dataset.dir = idx < this.#view ? "-1" : "1";
    this.#view = idx < this.#view && !last ? idx : idx - this.#count + 1;
    return true;
  }

  /** Lo que el calendario muestra como selección: el que se está eligiendo, el escrito, el atajo bajo el puntero o el valor. */
  #shown(): Span | null {
    if (this.#anchor !== null) {
      const o = this.#hover ?? this.#anchor;
      return [Math.min(this.#anchor, o), Math.max(this.#anchor, o)];
    }
    if (this.#peek) return this.#peek;
    const d = this.#draft;
    const r = d && "range" in d ? d.range : d ? null : this.#range;
    return r && [dayOfISO(r.start)!, dayOfISO(r.end)!];
  }

  #renderAll(): void {
    const L = this.#labels;
    this.#pop!.setAttribute("aria-label", this.getAttribute("label") || L.dialog);
    this.#input!.setAttribute("aria-label", L.ask);
    this.#input!.placeholder = L.askPlaceholder;
    this.#list!.setAttribute("aria-label", L.presets);
    this.#pop!.querySelector("[data-nav='-1']")!.setAttribute("aria-label", L.prevMonth);
    this.#pop!.querySelector("[data-nav='1']")!.setAttribute("aria-label", L.nextMonth);
    const foot = this.#foot!;
    foot.hidden = this.compare === null;
    foot.firstElementChild!.textContent = L.compare;
    const names = [L.compareNone, L.comparePrevious, L.compareYear];
    foot.querySelectorAll("label").forEach((l, i) => {
      l.querySelector("span")!.textContent = names[i];
      l.querySelector("input")!.checked = l.querySelector("input")!.value === (this.#mode() ?? "none");
    });
    this.#renderPresets();
    this.#renderCal();
    this.#renderSaid();
  }

  #renderPresets(): void {
    const opts = this.#opts();
    const loc = this.#locale();
    this.#list!.replaceChildren(
      ...this.presets.map((p, i) => {
        const r = presetRange(p, opts);
        const c = r && clampRange(r, this.min, this.max);
        return h("button", { type: "button", class: "nx-date-range__preset", "data-i": i, "aria-pressed": String(!!this.#range && foldText(p.label) === foldText(this.#rangeLabel ?? "")), disabled: !c, title: c ? formatRange(c, loc) : null }, p.label);
      }),
    );
  }

  #renderCal(): void {
    const loc = this.#locale();
    const ws = this.weekStart;
    const heads = weekdays(loc, ws);
    const T = todayOf(this.today);
    const [lo, hi] = this.#bounds();
    const months: HTMLElement[] = [];
    for (let k = 0; k < this.#count; k++) {
      const idx = this.#view + k;
      const y = Math.floor(idx / 12);
      const m = (idx % 12) + 1;
      const tid = `${this.#uid}-m${k}`;
      const cells = monthGrid(y, m, ws);
      const rows: HTMLElement[] = [h("div", { role: "row", class: "nx-date-range__row" }, ...heads.map((w) => h("span", { role: "columnheader", class: "nx-date-range__wd", title: w.long, "aria-label": w.long }, w.short)))];
      for (let i = 0; i < cells.length; i += 7) {
        rows.push(
          h(
            "div",
            { role: "row", class: "nx-date-range__row" },
            ...cells.slice(i, i + 7).map((d) =>
              d === null
                ? h("span", { role: "gridcell", class: "nx-date-range__blank" })
                : h("span", { role: "gridcell", class: "nx-date-range__day", "data-day": d, tabindex: "-1", "aria-label": dayLabel(d, loc) + (d === T ? `, ${this.#labels.today}` : ""), "aria-current": d === T ? "date" : null, "aria-disabled": d < lo || d > hi ? "true" : null }, String(ymd(d)[2])),
            ),
          ),
        );
      }
      months.push(h("div", { class: "nx-date-range__month" }, h("p", { id: tid, class: "nx-date-range__title" }, monthTitle(y, m, loc)), h("div", { role: "grid", class: "nx-date-range__grid", "aria-labelledby": tid }, ...rows)));
    }
    this.#months!.replaceChildren(...months);
    const [first, last] = [this.#first(), this.#last()];
    (this.#pop!.querySelector("[data-nav='-1']") as HTMLButtonElement).disabled = first <= lo;
    (this.#pop!.querySelector("[data-nav='1']") as HTMLButtonElement).disabled = last >= hi;
    this.#paintCells();
  }

  /** Solo los estados de las celdas (inicio, fin, dentro, comparación, foco): sin reconstruir. */
  #paintCells(): void {
    const s = this.#shown();
    const mode = this.#mode();
    const cr = s && mode ? compareRange({ start: isoOf(s[0]), end: isoOf(s[1]) }, mode) : null;
    const c = cr && [dayOfISO(cr.start)!, dayOfISO(cr.end)!];
    this.#pop!.toggleAttribute("data-picking", this.#anchor !== null);
    const r = this.#range;
    this.#pop!.toggleAttribute("data-tentative", !!s && !(r && s[0] === dayOfISO(r.start) && s[1] === dayOfISO(r.end)));
    let tabbable: HTMLElement | null = null;
    const cells = this.#months!.querySelectorAll<HTMLElement>("[data-day]");
    for (const el of cells) {
      const d = Number(el.dataset.day);
      const inside = !!s && d >= s[0] && d <= s[1];
      el.toggleAttribute("data-in", inside);
      el.toggleAttribute("data-s", !!s && d === s[0]);
      el.toggleAttribute("data-e", !!s && d === s[1]);
      el.toggleAttribute("data-c", !!c && d >= c[0] && d <= c[1]);
      el.setAttribute("aria-selected", String(inside));
      el.tabIndex = -1;
      if (d === this.#focus) tabbable = el;
    }
    (tabbable ?? cells[0])?.setAttribute("tabindex", "0");
  }

  /** La línea de interpretación: cómo se entendió lo escrito, qué se está eligiendo, o una pista. */
  #renderSaid(): void {
    const L = this.#labels;
    const p = this.#preview!;
    const d = this.#draft;
    const said = (r: Span, extra?: string, ok = false) => {
      const range = { start: isoOf(r[0]), end: isoOf(r[1]) };
      const mode = this.#mode();
      p.replaceChildren(
        ok ? glyph(CHECK, "nx-date-range__ok") : "",
        h("strong", null, formatRange(range, this.#locale())),
        h("span", null, ` · ${this.#days(range)}${extra ? ` · ${extra}` : ""}`),
        mode ? h("span", { class: "nx-date-range__said-vs" }, ` · ${L.versus.replace("{range}", formatRange(compareRange(range, mode), this.#locale()))}`) : "",
      );
    };
    p.removeAttribute("data-state");
    this.#pop!.toggleAttribute("data-ready", !!d && "range" in d);
    if (this.#anchor !== null) said(this.#shown()!, this.#hover === this.#anchor ? L.pickEnd : undefined);
    else if (this.#peek) said(this.#peek);
    else if (d && "range" in d) said([dayOfISO(d.range.start)!, dayOfISO(d.range.end)!], d.clamped ? L.clamped : undefined, true);
    else if (d) {
      p.dataset.state = "bad";
      p.textContent = d.bad === "unknown" ? L.unknown.replace("{text}", this.#input!.value.trim()) : L.outOfRange;
    } else {
      p.dataset.state = "hint";
      p.textContent = L.askHint;
    }
    this.#vs!.textContent = "";
    const s = this.#shown();
    const mode = this.#mode();
    if (s && mode) this.#vs!.textContent = formatRange(compareRange({ start: isoOf(s[0]), end: isoOf(s[1]) }, mode), this.#locale());
  }

  /** El campo cerrado: el rango y sus días (y la comparación), o el placeholder. */
  #paint(): void {
    if (!this.#built) return;
    const f = this.#field!;
    f.disabled = this.disabled;
    const v = this.value;
    const loc = this.#locale();
    const nodes: Node[] = [glyph(CAL, "nx-date-range__icon")];
    if (!v) nodes.push(h("span", { class: "nx-date-range__placeholder" }, this.placeholder));
    else {
      nodes.push(
        h(
          "span",
          { class: "nx-date-range__text" },
          h("span", { class: "nx-date-range__main" }, h("span", { class: "nx-date-range__range" }, formatRange(v, loc)), h("span", { class: "nx-date-range__days" }, ` · ${this.#days(v)}`)),
          v.compare ? h("span", { class: "nx-date-range__cmpline" }, this.#labels.versus.replace("{range}", formatRange(v.compare, loc))) : null,
        ),
      );
    }
    nodes.push(glyph(CHEVRON, "nx-date-range__chev"));
    f.replaceChildren(...nodes);
    const label = this.getAttribute("label");
    if (label) f.setAttribute("aria-label", `${label}: ${f.textContent}`);
    else f.removeAttribute("aria-label");
    f.title = v?.label ?? "";
  }

  /** Debajo del campo, alineado a su borde; arriba si abajo no cabe. */
  #place(): void {
    const pop = this.#pop!;
    const r = this.#field!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const width = pop.offsetWidth;
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    const ph = pop.offsetHeight;
    const below = vh - r.bottom - 6;
    const top = ph > below && r.top > below ? Math.max(8, r.top - 6 - ph) : r.bottom + 6;
    Object.assign(pop.style, { left: `${Math.max(8, left)}px`, top: `${top}px` });
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
