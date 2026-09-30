/**
 * `<nx-review>`: el resumen antes de guardar. Envuelve un formulario del autor (o un grupo de sus
 * campos) y, al enviar, compara cada campo con como estaba al cargar: «Vas a guardar 3 cambios»,
 * con «Precio unitario: $ 10.000 → $ 12.000 (+$ 2.000 · +20 %)», «Estado: Por aprobar → Aprobada»,
 * las líneas de detalle nuevas, quitadas y cambiadas, y los avisos de `<nx-guard>`. Es el antes de
 * `<nx-history>`: `changes` es la misma lista que la app manda como bitácora.
 *
 * El resumen es un panel en el lugar, justo encima de la fila del botón de enviar (sin modales ni
 * capas): «Guardar» vuelve a enviar con `requestSubmit(submitter)` y «Seguir editando» (o Esc) lleva
 * al primer campo cambiado. Mientras se escribe solo corre, con una pausa, la cuenta de `dirty`.
 *
 * Los nodos del autor nunca se mueven (hidratación de Solid): el panel es un nodo propio que se
 * inserta antes de la fila del botón y se quita al cerrar.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import { REVIEW_LABELS, countChanges, countReview, describeReview, diffReview, flattenReview, groupReview, humanizeName, reviewName, reviewRowName, reviewShouldOpen, reviewText, reviewValue, sameReviewValue } from "./logic";
import type { ReviewChange, ReviewLabels, ReviewMeta, ReviewMode, ReviewRow, ReviewValue, ReviewValues } from "./types";

export { REVIEW_LABELS };

const SKIP = /^(submit|button|reset|image|file|password)$/;
/** Pausa tras el último cambio antes de recalcular `dirty`. */
const DEBOUNCE = 200;
/** Cuánto se queda «No hay cambios que guardar». */
const NOTICE = 4000;

type Ctl = HTMLElement & { name?: string; value?: unknown; type?: string; checked?: boolean; multiple?: boolean; autocomplete?: string };
type Read = { values: ReviewValues; fields: Map<string, Ctl[]> };
type Computed = { changes: ReviewChange[]; warnings: Map<string, string[]>; meta: (name: string) => ReviewMeta | undefined };
type Pending = { form?: HTMLFormElement; submitter?: HTMLElement | null; resolve?: (ok: boolean) => void; changes: ReviewChange[] };

let uid = 0;
const custom = (el: Element) => el.localName.includes("-");
const clean = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").replace(/[\s*:]+$/, "").trim();
/** Una propiedad de texto de un elemento (la de un componente ya registrado) o su atributo. */
const prop = (el: Element, k: string): string => {
  const v = (el as unknown as Record<string, unknown>)[k];
  return typeof v === "string" && v ? v : (el.getAttribute(k) ?? "");
};
/** Un atributo numérico ≥ 0, o `def`. */
const numAttr = (el: Element, name: string, def: number): number => {
  const n = parseFloat(el.getAttribute(name) ?? "");
  return n >= 0 ? n : def;
};

export class NxReview extends Base {
  static observedAttributes = ["labels", "initial", "disabled"];

  #uid = `nx-review${++uid}-`;
  #labels: ReviewLabels = REVIEW_LABELS;
  /** Lo que había en el formulario al tomar la base, y `initial` encima (si la app lo pasó). */
  #domBase: ReviewValues = {};
  #initial: ReviewValues | null = null;
  #base: ReviewValues = {};
  /** Los elementos de la base: dicen la etiqueta y el formato de un campo que ya no está. */
  #baseEls = new Map<string, Ctl[]>();
  #based = false;
  /** Lo que entre en el mismo turno en que se conectó todavía es base (hasta un `snapshot()`). */
  #lateOk = false;
  #dirty = false;
  #count = 0;
  #pending: Pending | null = null;
  /** El envío que el propio resumen hace al confirmar: ese pasa. */
  #passing = false;
  #sent = false;
  #timer?: ReturnType<typeof setTimeout>;
  #rebaseTimer?: ReturnType<typeof setTimeout>;
  #noticeTimer?: ReturnType<typeof setTimeout>;
  #outer: HTMLFormElement | null = null;
  #mo: MutationObserver | null = null;
  // Nodos propios.
  #panel?: HTMLElement;
  #title?: HTMLElement;
  #body?: HTMLElement;
  #notice?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** `significant` (por defecto), `always` o `never` (solo con `review()`). */
  get mode(): ReviewMode {
    const m = this.getAttribute("mode");
    return m === "always" || m === "never" ? m : "significant";
  }
  set mode(v: ReviewMode) {
    this.setAttribute("mode", v);
  }
  /** Desde qué porcentaje un cambio de monto es importante (20). */
  get threshold(): number {
    return numAttr(this, "threshold", 20);
  }
  set threshold(v: number) {
    this.setAttribute("threshold", String(v));
  }
  /** Con `significant`, más de cuántos cambios se muestran aunque nada sea importante (5). */
  get maxSilent(): number {
    return numAttr(this, "max-silent", 5);
  }
  set maxSilent(v: number) {
    this.setAttribute("max-silent", String(v));
  }
  /** `notice`: al enviar sin cambios, dice «No hay cambios que guardar» y no envía. */
  get empty(): "notice" | "" {
    return this.getAttribute("empty") === "notice" ? "notice" : "";
  }
  set empty(v: "notice" | "" | null) {
    if (v) this.setAttribute("empty", v);
    else this.removeAttribute("empty");
  }
  /** `false`: tras guardar, la base no cambia (la app llama `snapshot()` cuando le conviene). */
  get rebase(): boolean {
    return this.getAttribute("rebase") !== "false";
  }
  set rebase(v: boolean) {
    this.setAttribute("rebase", String(!!v));
  }
  /** El locale de montos y fechas: el atributo, o el `lang` más cercano, o «es-CO». */
  get locale(): string {
    return resolveLocale(this);
  }
  set locale(v: string | null) {
    if (v) this.setAttribute("locale", v);
    else this.removeAttribute("locale");
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    this.toggleAttribute("disabled", !!v);
  }
  get labels(): ReviewLabels {
    return this.#labels;
  }
  set labels(v: Partial<ReviewLabels> | null | undefined) {
    this.#labels = mergeLabels(REVIEW_LABELS, v);
  }
  /** Los valores como se cargaron (`{campo: valor}`, con filas anidadas o planas): la base, encima de lo que hay en el formulario. */
  get initial(): ReviewValues | null {
    return this.#initial;
  }
  set initial(v: Record<string, unknown> | string | null | undefined) {
    this.#initial = v === null || v === undefined ? null : flattenReview(v);
    if (this.#based) this.#rebuild();
  }
  /** Lo que va a cambiar (en el orden del formulario): lo que la app manda como bitácora. */
  get changes(): ReviewChange[] {
    return this.#compute().changes;
  }
  /** ¿Hay algo distinto de la base? */
  get dirty(): boolean {
    return countReview(diffReview(this.#base, this.#read().values)) > 0;
  }

  // ---------------------------------------------------------------- API

  /** La base es lo que hay ahora en el formulario (después de cargar el registro, por ejemplo). */
  snapshot(): void {
    this.#initial = null;
    this.#lateOk = false;
    this.#take();
  }

  /**
   * Muestra el resumen (sin formulario: la app lo llama desde su propio botón «Guardar») y resuelve
   * `true` al confirmar o `false` al seguir editando. Sin cambios, `true` enseguida (con
   * `empty="notice"`, `false` y el aviso).
   */
  review(): Promise<boolean> {
    if (this.disabled) return Promise.resolve(true);
    const all = this.#compute();
    const { changes } = all;
    const at = this.ownerDocument.activeElement;
    const anchor = at instanceof HTMLElement && this.contains(at) && !this.#panel?.contains(at) ? at : null;
    if (!changes.length) {
      if (this.empty) this.#showNotice(null, anchor);
      return Promise.resolve(!this.empty);
    }
    if (!this.#emit("open", { changes }, true)) {
      this.#pass(changes);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => this.#open({ resolve, changes }, all, null, anchor));
  }

  /** Vuelve a la base: pone en cada campo su valor de antes (con `input` y `change`) y cierra el resumen. */
  reset(): void {
    this.#close();
    for (const [name, els] of this.#collect()) if (name in this.#base && !sameReviewValue(this.#value(els), this.#base[name])) this.#write(els, this.#base[name]);
    this.#schedule();
  }

  // ---------------------------------------------------------------- ciclo de vida

  constructor() {
    super();
    this.addEventListener("submit", this.#onSubmit, true);
    for (const t of ["input", "change", "nx-change"]) this.addEventListener(t, this.#touch);
  }

  connectedCallback(): void {
    upgrade(this);
    // Si el resumen va dentro del <form> (envolviendo un grupo), el envío no pasa por aquí.
    this.#outer = this.parentElement?.closest("form") ?? null;
    this.#outer?.addEventListener("submit", this.#onSubmit, true);
    // Filas que entran o salen («Agregar línea»): solo se recalcula `dirty` (con pausa).
    if (typeof MutationObserver !== "undefined") {
      this.#mo ??= new MutationObserver((rs) => {
        const named = (n: Node) => n instanceof Element && (n.hasAttribute("name") || !!n.querySelector("[name]"));
        if (rs.some((r) => [...r.addedNodes, ...r.removedNodes].some(named))) this.#schedule();
      });
      this.#mo.observe(this, { childList: true, subtree: true });
    }
    // Con el <script> en el <head>, los campos todavía no existen: la base se toma al terminar de cargar.
    // Si la app pone los campos justo después de conectarlo (en el mismo turno), también son la base.
    if (!this.#based) {
      if (this.ownerDocument.readyState === "loading") this.ownerDocument.addEventListener("DOMContentLoaded", this.#ready, { once: true });
      else this.#take(), (this.#lateOk = true), queueMicrotask(() => this.#late());
    }
  }

  disconnectedCallback(): void {
    this.#outer?.removeEventListener("submit", this.#onSubmit, true);
    this.#outer = null;
    this.ownerDocument.removeEventListener("DOMContentLoaded", this.#ready);
    this.#mo?.disconnect();
    for (const t of [this.#timer, this.#rebaseTimer, this.#noticeTimer]) clearTimeout(t);
    this.#notice?.remove();
    this.#close();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "disabled") {
      if (this.disabled) this.#close();
      return;
    }
    let v: unknown = null;
    try {
      v = value === null ? null : JSON.parse(value);
    } catch {
      /* abajo */
    }
    if (value !== null && (!v || typeof v !== "object")) console.warn(`[nx-review] el atributo "${name}" no es JSON válido`);
    else (this as unknown as Record<string, unknown>)[name] = v;
  }

  // ---------------------------------------------------------------- base y lectura

  #ready = (): void => {
    if (!this.#based && this.isConnected) this.#take();
  };

  #take(): void {
    const r = this.#read();
    this.#domBase = r.values;
    this.#baseEls = r.fields;
    this.#based = true;
    this.#rebuild();
  }
  /** Lo que entró en el mismo turno en que se conectó: a la base (no son filas nuevas). */
  #late(): void {
    if (!this.#lateOk || !this.isConnected) return;
    this.#lateOk = false;
    const r = this.#read();
    for (const [k, els] of r.fields)
      if (!(k in this.#domBase)) {
        this.#domBase[k] = r.values[k];
        this.#baseEls.set(k, els);
      }
    this.#rebuild();
  }
  #rebuild(): void {
    this.#base = this.#initial ? { ...this.#domBase, ...this.#initial } : this.#domBase;
    this.#check();
  }

  /** ¿Un campo del formulario? Controles nativos con `name` y componentes con `value` (no sus piezas internas). */
  #isField(el: Ctl): boolean {
    if (el.closest(".nx-review, .nx-review__none, [data-review='off']")) return false;
    const tag = el.localName;
    if (tag === "input") {
      if (SKIP.test(el.type!) || /password/.test(el.autocomplete ?? "")) return false;
      // Ocultos: solo la clave de una fila (`items[0].id`) o uno con `data-label`.
      if (el.type === "hidden" && !/(^|[.[])id\]?$/.test(el.getAttribute("name")!) && !el.dataset.label) return false;
    } else if (tag !== "select" && tag !== "textarea" && !(custom(el) && ("value" in el || el.hasAttribute("value")))) return false;
    const host = el.parentElement?.closest("[name]");
    return !(host && custom(host) && this.contains(host));
  }

  /** Los campos por nombre canónico (los radios y casillas de un mismo nombre, juntos), en el orden del documento. */
  #collect(): Map<string, Ctl[]> {
    const out = new Map<string, Ctl[]>();
    const rows = new Map<Element, string>();
    const count = new Map<string, number>();
    for (const el of this.querySelectorAll<Ctl>("[name]")) {
      if (!this.#isField(el)) continue;
      let name = el.getAttribute("name")!;
      const row = el.closest("[data-review-row]");
      if (row && this.contains(row)) {
        // `data-review-row` por fila: el grupo es el `data-review-rows` de alrededor y la fila, su posición.
        let pre = rows.get(row);
        if (pre === undefined) {
          const g = row.closest("[data-review-rows]")?.getAttribute("data-review-rows") || "rows";
          const i = count.get(g) ?? 0;
          count.set(g, i + 1);
          rows.set(row, (pre = `${g}[${i}].`));
          // Su valor es la clave de la fila (si no tiene un campo `id`).
          const key = row.getAttribute("data-review-row");
          if (key) out.set(`${pre}id`, [Object.assign(h("input", { type: "hidden" }), { value: key }) as Ctl]);
        }
        name = pre + (reviewRowName(name)?.leaf ?? name.replace(/\[\]$/, ""));
      } else name = reviewName(name);
      const list = out.get(name);
      if (list) list.push(el);
      else out.set(name, [el]);
    }
    return out;
  }

  /** El valor de un campo: número, texto, fecha ISO, sí/no, una opción o varias. */
  #value(els: Ctl[]): ReviewValue {
    const el = els[0];
    const t = el.type;
    if (el.localName === "input" && (t === "checkbox" || t === "radio")) {
      const on = els.filter((e) => e.checked).map((e) => String(e.value));
      return t === "radio" ? (on[0] ?? null) : els.length > 1 ? on : !!el.checked;
    }
    if (el instanceof HTMLSelectElement && el.multiple) return [...el.options].filter((o) => o.selected).map((o) => o.value);
    const v = "value" in el ? el.value : el.getAttribute("value");
    if (el.localName === "input" && (t === "number" || t === "range")) return v === "" ? null : Number.isFinite(+String(v)) ? +String(v) : String(v);
    return reviewValue(typeof v === "string" ? v.replace(/\r\n?/g, "\n") : v);
  }

  #read(): Read {
    const fields = this.#collect();
    const values: ReviewValues = {};
    for (const [name, els] of fields) values[name] = this.#value(els);
    return { values, fields };
  }

  // ---------------------------------------------------------------- etiquetas y formato

  /** ¿Es el `<fieldset>` de un grupo de radios o casillas (todo lo que tiene adentro es de ese nombre)? */
  #own(fs: Element, el: Ctl): boolean {
    const n = el.getAttribute("name");
    return el.type === "radio" || el.type === "checkbox" ? [...fs.querySelectorAll("[name]")].every((x) => x.getAttribute("name") === n) : false;
  }
  #legend(n: Element): string {
    return n.firstElementChild?.localName === "legend" ? clean(n.firstElementChild.textContent) : "";
  }
  #section(el: Element): string | undefined {
    for (let n = el.parentElement?.closest<HTMLElement>("fieldset, [data-review-section]"); n && this.contains(n); n = n.parentElement?.closest<HTMLElement>("fieldset, [data-review-section]")) {
      if (n.dataset.reviewSection) return n.dataset.reviewSection;
      const t = !this.#own(n, el as Ctl) && this.#legend(n);
      if (t) return t;
    }
  }

  /** La etiqueta de un campo: `data-label`, su `<label>`, `aria-labelledby`, `aria-label`, `label`, el encabezado de su columna o su nombre. */
  #label(el: Ctl, many: boolean): string {
    if (el.dataset.label) return el.dataset.label;
    if (el.type === "radio" || (el.type === "checkbox" && many)) {
      const fs = el.closest("fieldset");
      const t = (fs && this.#own(fs, el) && this.#legend(fs)) || el.closest("[role=radiogroup], [role=group]")?.getAttribute("aria-label");
      return t || humanizeName(reviewRowName(el.getAttribute("name")!)?.leaf ?? el.getAttribute("name")!);
    }
    return this.#own1(el) || humanizeName(reviewRowName(el.getAttribute("name")!)?.leaf ?? el.getAttribute("name")!);
  }
  /** La etiqueta propia de un control (sin mirar el grupo). */
  #own1(el: Ctl): string {
    const doc = this.ownerDocument;
    const lab = (/^[\w-]+$/.test(el.id) && doc.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
    let t = "";
    if (lab) {
      const c = lab.cloneNode(true) as Element;
      c.querySelectorAll("input, select, textarea, button, [name], [aria-hidden='true']").forEach((n) => n.remove());
      t = clean(c.textContent);
    }
    const cell = el.closest("td");
    const th = cell && cell.closest("table")?.querySelector("thead tr")?.children[[...cell.parentElement!.children].indexOf(cell)];
    return (
      t ||
      clean(
        (el.getAttribute("aria-labelledby") ?? "")
          .split(/\s+/)
          .map((id) => (id && doc.getElementById(id)?.textContent) || "")
          .join(" "),
      ) ||
      clean(el.getAttribute("aria-label") || el.getAttribute("label") || th?.textContent || el.getAttribute("placeholder"))
    );
  }

  #metaOf(els: Ctl[]): ReviewMeta {
    const el = els[0];
    const tag = el.localName;
    const t = el.type;
    const d = el.dataset;
    const name = el.getAttribute("name") ?? "";
    const m: ReviewMeta = { label: this.#label(el, els.length > 1), section: this.#section(el) };
    const format = d.format || (custom(el) ? prop(el, "format") : "");
    const currency = d.currency || (custom(el) ? prop(el, "currency") : "");
    let options: Record<string, string> | undefined;
    if (tag === "input" && t === "checkbox" && els.length < 2) m.kind = "bool";
    else if (el instanceof HTMLSelectElement) options = Object.fromEntries([...el.options].map((o) => [o.value, clean(o.text)]));
    else if (tag === "input" && (t === "radio" || t === "checkbox")) options = Object.fromEntries(els.map((e) => [String(e.value), this.#own1(e) || String(e.value)]));
    else if (custom(el) && Array.isArray((el as unknown as { options?: unknown }).options)) {
      // Un <nx-select> (u otro con `options`): la etiqueta es su primera columna (`fields[0].key`), o `label`.
      const x = el as unknown as { options: Record<string, unknown>[]; selection?: Record<string, unknown>[]; fields?: { key: string }[] };
      const key = x.fields?.[0]?.key ?? "label";
      options = {};
      for (const o of [...x.options, ...(x.selection ?? [])]) if (o && o.value !== undefined) options[String(o.value)] = String(o[key] ?? o.label ?? o.value);
    }
    if (options) (m.kind = "choice"), (m.options = options);
    else if (!m.kind)
      m.kind = /^(money|percent|number|date|text)$/.test(format)
        ? (format as ReviewMeta["kind"])
        : currency
          ? "money"
          : t === "date"
            ? "date"
            : t === "number" || t === "range" || tag === "nx-number"
              ? "number"
              : "text";
    if (currency) m.currency = currency;
    if (tag === "textarea") m.long = true;
    if (d.review === "important") m.important = true;
    if (d.review === "status" || /^(estado|status|state)$/i.test(reviewRowName(name)?.leaf ?? name)) m.status = true;
    return m;
  }

  /** Lo que se sabe de un campo, de un grupo de filas (`items`) o de una columna (`items[].qty`). */
  #meta(fields: Map<string, Ctl[]>): (name: string) => ReviewMeta | undefined {
    const cols = new Map<string, Ctl[]>();
    const groups = new Map<string, Ctl>();
    for (const map of [fields, this.#baseEls])
      for (const [k, els] of map) {
        const r = reviewRowName(k);
        if (!r || !els[0].hasAttribute("name")) continue;
        if (!cols.has(`${r.group}[].${r.leaf}`)) cols.set(`${r.group}[].${r.leaf}`, els);
        if (!groups.has(r.group) && els[0].isConnected) groups.set(r.group, els[0]);
      }
    const cache = new Map<string, ReviewMeta | undefined>();
    return (name) => {
      if (cache.has(name)) return cache.get(name);
      let m: ReviewMeta | undefined;
      const els = cols.get(name) ?? fields.get(name) ?? this.#baseEls.get(name);
      if (els?.[0].hasAttribute("name")) m = this.#metaOf(els);
      else if (groups.has(name)) {
        // El contenedor de las filas: su `data-label`, `aria-label`, el `<caption>` de la tabla o el `<legend>`.
        const first = groups.get(name)!;
        const c = first.closest<HTMLElement>("[data-review-rows], table, fieldset") ?? first;
        const label = c.dataset.label || c.getAttribute("aria-label") || clean(c.closest("table")?.caption?.textContent) || (c.localName === "fieldset" ? this.#legend(c) : "");
        m = { label: label || humanizeName(name), section: this.#section(c) };
      }
      cache.set(name, m);
      return m;
    };
  }

  /** Los avisos vigentes de los `<nx-guard>` de alrededor y de adentro, por campo. */
  #warnings(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const g of [this.closest("nx-guard"), ...this.querySelectorAll("nx-guard")]) {
      const list = (g as unknown as { findings?: { field?: string; message?: string }[] } | null)?.findings;
      if (Array.isArray(list))
        for (const f of list) {
          if (typeof f?.field !== "string" || typeof f.message !== "string") continue;
          const k = reviewName(f.field);
          out.set(k, [...(out.get(k) ?? []), f.message]);
        }
    }
    return out;
  }

  #compute(): Computed {
    const { values, fields } = this.#read();
    const warnings = this.#warnings();
    const meta = this.#meta(fields);
    const d = diffReview(this.#base, values);
    const changes = describeReview(d, this.#base, values, { fmt: nxFormat(resolveLocale(this)), labels: this.#labels, threshold: this.threshold / 100, meta, warnings });
    // En el orden del formulario: un grupo de filas va donde está su primera fila.
    const pos = new Map<string, number>();
    let i = 0;
    for (const k of fields.keys()) {
      const g = reviewRowName(k)?.group;
      if (g && !pos.has(g)) pos.set(g, i);
      pos.set(k, i++);
    }
    changes.sort((a, b) => (pos.get(a.field) ?? i) - (pos.get(b.field) ?? i));
    return { changes, warnings, meta };
  }

  // ---------------------------------------------------------------- envío

  #onSubmit = (e: Event): void => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (this.#passing) {
      this.#passing = false;
      this.#sent = true;
      return;
    }
    if (this.disabled || this.mode === "never") return;
    const submitter = (e as SubmitEvent).submitter;
    const all = this.#compute();
    const { changes, warnings } = all;
    if (!changes.length) {
      if (this.empty) this.#stop(e), this.#showNotice(form, submitter);
      return;
    }
    const n = [...warnings.values()].reduce((s, w) => s + w.length, 0);
    if (!reviewShouldOpen(changes, this.mode, this.maxSilent, n) || !this.#emit("open", { changes }, true)) return this.#pass(changes);
    this.#stop(e);
    this.#open({ form, submitter, changes }, all, form, submitter);
  };

  #stop(e: Event): void {
    e.preventDefault();
    e.stopImmediatePropagation();
  }

  /** Pasó sin resumen: la bitácora igual se entera y, después del envío, esto es la base. */
  #pass(changes: ReviewChange[]): void {
    this.#emit("confirm", { changes, silent: true });
    this.#rebaseSoon();
  }
  #rebaseSoon(): void {
    // Después del envío (y de lo que la app haga en su `submit`, que todavía puede leer `changes`).
    if (!this.rebase) return;
    clearTimeout(this.#rebaseTimer);
    this.#rebaseTimer = setTimeout(() => this.isConnected && this.snapshot(), 0);
  }

  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(`nx-review-${type}`, { detail, bubbles: true, composed: true, cancelable }));
  }

  /** Donde va el panel: justo antes de la fila del botón de enviar (o del botón que llamó `review()`). */
  #place(node: HTMLElement, form: HTMLFormElement | null, at: Element | null | undefined): void {
    const box: Element = form ?? this;
    let row: Element | null | undefined = at && at !== form && box.contains(at) ? at : form?.querySelector("[type=submit], button:not([type])");
    while (row && row.parentElement !== box) row = row.parentElement;
    if (row) {
      if (row.previousElementSibling !== node) row.before(node);
    } else if (node.parentElement !== box || node.nextElementSibling) box.append(node);
  }

  #showNotice(form: HTMLFormElement | null, at: Element | null | undefined): void {
    this.#notice ??= h("p", { class: "nx-review__none", role: "status" });
    this.#place(this.#notice, form, at);
    this.#notice.textContent = this.#labels.none;
    clearTimeout(this.#noticeTimer);
    this.#noticeTimer = setTimeout(() => this.#notice?.remove(), NOTICE);
  }

  // ---------------------------------------------------------------- el panel

  #open(p: Pending, all: Computed, form: HTMLFormElement | null, at: Element | null | undefined): void {
    this.#pending?.resolve?.(false);
    this.#pending = p;
    this.#notice?.remove();
    const panel = this.#build();
    this.#paint(all);
    this.#place(panel, form, at);
    // Con un formulario largo, el panel se desplaza a la vista; el foco va a su encabezado.
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    panel.scrollIntoView?.({ block: "nearest", behavior: still ? "auto" : "smooth" });
    this.#title!.focus({ preventScroll: true });
  }

  #build(): HTMLElement {
    if (this.#panel) return this.#panel;
    const id = `${this.#uid}t`;
    this.#title = h("h3", { class: "nx-review__title", id, tabindex: "-1", "aria-live": "polite" });
    this.#body = h("div", { class: "nx-review__body" });
    const btn = (act: string, cls: string) => h("button", { type: "button", class: cls, "data-act": act });
    const keep = btn("keep", "nx-review__keep");
    const save = btn("save", "nx-review__save");
    const panel = (this.#panel = h("section", { class: "nx-review", role: "region", "aria-labelledby": id }, this.#title, this.#body, h("div", { class: "nx-review__acts" }, keep, save)));
    panel.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button");
      if (!b) return;
      if (b.dataset.act === "save") this.#confirm();
      else if (b.dataset.act === "keep") this.#cancel(true);
      else if (b.dataset.field) this.#focus(b.dataset.field);
    });
    panel.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      e.stopPropagation();
      this.#cancel(true);
    });
    return panel;
  }

  #paint({ changes, warnings, meta }: Computed): void {
    const L = this.#labels;
    const n = countChanges(changes);
    const fmt = nxFormat(resolveLocale(this));
    const text = reviewText(L.title, { n: fmt.number(n) }, n);
    if (this.#title!.textContent !== text) this.#title!.textContent = text;
    const [keep, save] = this.#panel!.querySelectorAll<HTMLElement>(".nx-review__acts button");
    keep.textContent = L.keep;
    save.textContent = L.save;

    const sr = (t: string) => h("span", { class: "nx-review__sr" }, t);
    const imp = (c: { significant: boolean }) => c.significant && h("span", { class: "nx-review__imp" }, L.important);
    const vals = (c: ReviewChange) =>
      c.diff
        ? h("span", { class: "nx-review__diff" }, ...c.diff.map((p) => (p.op === "=" ? p.text : h(p.op === "-" ? "del" : "ins", null, p.text))))
        : h(
            "span",
            { class: "nx-review__vals" },
            h("span", { class: "nx-review__from" }, c.fromText),
            h("span", { class: "nx-review__arrow", "aria-hidden": "true" }, "→"),
            sr(` ${L.to} `),
            h("span", { class: "nx-review__to" }, c.toText),
            c.delta?.text && h("span", { class: "nx-review__delta" }, `(${c.delta.text})`),
          );
    const line = (c: ReviewChange, name = c.field) =>
      h("button", { type: "button", class: "nx-review__line", "data-field": name }, h("span", { class: "nx-review__label" }, c.label), imp(c), vals(c));
    const row = (r: ReviewRow, kind: "added" | "removed" | "changed", tag: string, group: string) => {
      const head = [h("span", { class: "nx-review__tag" }, tag), h("span", { class: "nx-review__rtitle" }, r.title), imp(r), r.text && h("span", { class: "nx-review__rtext" }, r.text)];
      const first = Object.keys(r.values).find((k) => k !== "id");
      return h(
        "li",
        { class: "nx-review__row", "data-kind": kind },
        // Una fila quitada ya no tiene campos a los que ir.
        kind === "added" && first ? h("button", { type: "button", class: "nx-review__line", "data-field": `${group}[${r.index}].${first}` }, ...head) : h("span", { class: "nx-review__line" }, ...head),
        r.changes && h("ul", { class: "nx-review__cells" }, ...r.changes.map((c) => h("li", null, line(c)))),
      );
    };

    // Los avisos de guard, arriba: «Precio unitario: $ 12.000.000 es 10 veces lo habitual».
    const warns = [...warnings].flatMap(([k, list]) => {
      const r = reviewRowName(k);
      const label = (r ? `${meta(`${r.group}[].${r.leaf}`)?.label ?? humanizeName(r.leaf)} (${reviewText(L.row, { n: r.index + 1 })})` : meta(k)?.label) ?? humanizeName(k);
      return list.map((w) => [k, `${label}: ${w}`] as const);
    });
    const body: Node[] = [];
    if (warns.length)
      body.push(
        h(
          "ul",
          { class: "nx-review__warns" },
          ...warns.map(([field, w]) => h("li", null, h("button", { type: "button", class: "nx-review__warn", "data-field": field }, sr(`${L.warning} `), w))),
        ),
      );
    for (const g of groupReview(changes)) {
      const items = g.changes.map((c) =>
        h(
          "li",
          { class: "nx-review__item", "data-significant": c.significant },
          ...(c.rows
            ? [
                h(
                  "button",
                  { type: "button", class: "nx-review__line", "data-field": this.#firstOf(c) },
                  h("span", { class: "nx-review__label" }, c.label),
                  imp(c),
                  h("span", { class: "nx-review__vals" }, c.rows.summary),
                ),
                h(
                  "ul",
                  { class: "nx-review__rows" },
                  ...c.rows.added.map((r) => row(r, "added", L.rowAdded, c.field)),
                  ...c.rows.removed.map((r) => row(r, "removed", L.rowRemoved, c.field)),
                  ...c.rows.changed.map((r) => row(r, "changed", L.rowChanged, c.field)),
                ),
              ]
            : [line(c)]),
        ),
      );
      body.push(h("div", { class: "nx-review__sec" }, g.section && h("p", { class: "nx-review__sec-title" }, g.section), h("ul", { class: "nx-review__list" }, ...items)));
    }
    this.#body!.replaceChildren(...body);
  }

  /** El primer campo de un cambio (en un grupo de filas: el de la primera fila nueva o cambiada). */
  #firstOf(c: ReviewChange): string {
    const r = c.rows;
    if (!r) return c.field;
    const ch = r.changed[0]?.changes?.[0];
    if (ch) return ch.field;
    const a = r.added[0];
    const k = a && Object.keys(a.values).find((x) => x !== "id");
    return k ? `${c.field}[${a.index}].${k}` : c.field;
  }

  /** Enfoca un campo por nombre: el control de adentro de un componente, o el radio marcado. */
  #focus(name: string): boolean {
    const els = this.#collect().get(name);
    const el = els && (els.find((e) => e.checked) ?? els[0]);
    if (!el || !el.hasAttribute("name")) return false;
    const target = custom(el) ? (el.querySelector<HTMLElement>("input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex='-1'])") ?? el) : el;
    target.focus();
    return true;
  }

  #close(): void {
    this.#panel?.remove();
    const p = this.#pending;
    this.#pending = null;
    p?.resolve?.(false);
  }

  #cancel(focus: boolean): void {
    const p = this.#pending;
    if (!p) return;
    this.#close();
    this.#emit("cancel", { changes: p.changes });
    if (focus) {
      // Al primer campo cambiado (en el orden del formulario).
      if (!p.changes.some((c) => this.#focus(this.#firstOf(c)))) p.submitter?.focus();
    }
  }

  #confirm(): void {
    const p = this.#pending;
    if (!p) return;
    this.#pending = null;
    this.#panel?.remove();
    this.#emit("confirm", { changes: p.changes, silent: false });
    const f = p.form;
    if (f?.isConnected) {
      const s = p.submitter;
      const ok = s && s !== f && (s as HTMLButtonElement).form === f && /^(submit|image)$/.test((s as HTMLButtonElement).type) ? s : undefined;
      this.#passing = true;
      this.#sent = false;
      try {
        f.requestSubmit(ok);
      } catch {
        f.requestSubmit();
      } finally {
        this.#passing = false;
      }
      // Un envío que la validación detuvo no cambia la base.
      if (this.#sent) this.#rebaseSoon();
    } else this.#rebaseSoon();
    p.resolve?.(true);
  }

  // ---------------------------------------------------------------- dirty

  #touch = (e: Event): void => {
    const t = e.target as Element;
    if (t.closest?.("[data-nx-ephemeral], .nx-review")) return;
    this.#notice?.remove();
    this.#schedule();
  };
  #schedule(): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => this.#check(), DEBOUNCE);
  }
  /** Recalcula `dirty` (y avisa si cambió); con el resumen abierto, lo pone al día. */
  #check(): void {
    if (this.#pending && this.#panel?.isConnected) {
      const all = this.#compute();
      if (all.changes.length) (this.#pending.changes = all.changes), this.#paint(all);
      else this.#cancel(false);
    }
    const count = countReview(diffReview(this.#base, this.#read().values));
    if (count !== this.#count || !!count !== this.#dirty) {
      this.#count = count;
      this.#dirty = count > 0;
      this.#emit("dirty", { dirty: this.#dirty, count });
    }
  }

  /** Pone un valor en un campo como una persona (con `input` y `change`, para el framework). */
  #write(els: Ctl[], v: ReviewValue): void {
    const fire = (el: Element) => {
      el.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    const el = els[0];
    const t = el.type;
    if (el.localName === "input" && (t === "checkbox" || t === "radio")) {
      const list = [v].flat().map(String);
      for (const e of els) {
        const on = t === "radio" || els.length > 1 ? list.includes(String(e.value)) : v === true || v === "true";
        if (e.checked !== on) (e.checked = on), fire(e);
      }
      return;
    }
    if (el instanceof HTMLSelectElement && el.multiple) {
      const list = [v].flat().map(String);
      for (const o of el.options) o.selected = list.includes(o.value);
    } else if (custom(el)) (el as { value?: unknown }).value = v;
    else {
      // Con el setter nativo: React y compañía vigilan `value` en la instancia.
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
      const s = v === null ? "" : String(v);
      if (set) set.call(el, s);
      else el.value = s;
    }
    fire(el);
  }
}
