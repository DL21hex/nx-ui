/**
 * `<nx-paste-fill>`: pegas un texto y el formulario se llena solo. Envuelve un formulario del
 * autor (sus `<input>`, `<select>` y `<textarea>` con `name`, sin moverlos ni cambiarlos de
 * lugar): la persona pega un correo de un proveedor, un WhatsApp o una firma —con Ctrl/⌘+V sobre
 * el formulario, en la zona «Pega aquí…» o arrastrando el texto— y cada campo recibe lo suyo, con
 * su confianza y su evidencia (el tramo del texto de donde salió).
 *
 * La lectura es local (`logic.ts`, sin servidor). Con `endpoint`, el backend puede mejorarla con
 * el protocolo de `types.ts`: lo que manda gana sobre lo local, y si falla, queda lo local.
 *
 * Nunca pisa lo que la persona escribió: si un campo ya tenía otro valor, muestra la sugerencia con
 * «Usar» / «Dejar el mío». Lo dudoso (bajo `review-below`) queda marcado «Revisar» hasta que la
 * persona lo corrige o lo confirma. Todo se deshace de una vez (botón o Ctrl+Z fuera de un campo).
 * Cada campo que cambia recibe `input` y `change`, para que el framework del autor se entere.
 *
 * Las marcas sobre los campos van en una capa propia, encima del formulario: no se inserta nada
 * dentro del formulario del autor (solo `data-nx-fill` y la descripción accesible del campo).
 */
import { Base } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph } from "../../core/icons";
import { nxFormat, resolveLocale } from "../../core/locale";
import { lineData, readLines } from "../../core/stream";
import { foldText } from "../../core/text";
import { PASTE_HINTS, cleanFields, confidenceTier, fmtText, humanize, matchFields, mergeFields, parsePasteEvent } from "./logic";
import type { PasteField, PasteFieldInput, PasteFill, PasteFillDoneDetail, PasteFillLabels, PasteFillState, PasteSource } from "./types";

export const PASTE_FILL_LABELS: PasteFillLabels = {
  ...PASTE_HINTS,
  zone: "Pega aquí un correo, un WhatsApp o un texto…",
  zoneHint: "o presiona {mod}+V sobre el formulario, o arrastra el texto",
  paste: "Pegar",
  fill: "Llenar",
  drop: "Suelta el texto para llenar el formulario",
  reading: "Leyendo el texto…",
  server: "Consultando al servidor…",
  filled: "{n} campos llenados",
  filledOne: "1 campo llenado",
  none: "No encontré datos para este formulario",
  review: "{n} por revisar",
  suggestions: "{n} con sugerencia",
  evidence: "Evidencia",
  pasted: "Texto pegado",
  undo: "Deshacer",
  undone: "Se devolvieron los valores anteriores",
  close: "Cerrar y pegar otro texto",
  confirm: "Confirmar",
  reviewChip: "Revisar",
  use: "Usar",
  keep: "Dejar el mío",
  suggestion: "Sugerencia: {value}",
  serverError: "No se pudo consultar el servidor; quedó lo que se leyó aquí.",
  confidence: "Confianza {pct}",
  confirmed: "Confirmado",
  same: "Ya tenía este valor",
  yours: "Tienes «{value}»",
  fromText: "Llenado desde el texto pegado",
};

const PASTE = '<path d="M11 14h10"/><path d="M16 4h2a2 2 0 0 1 2 2v1.344"/><path d="m17 18 4-4-4-4"/><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 1.793-1.113"/><rect x="8" y="2" width="8" height="4" rx="1"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const TEXT = '<path d="M17 6H3"/><path d="M21 12H3"/><path d="M15 18H3"/>';
const WARN = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const PROPS = ["fields", "endpoint", "reviewBelow", "labels", "for"] as const;
/** Un color por campo (tono OKLCH): la marca en el texto y el campo comparten el suyo. */
const HUES = [262, 150, 25, 75, 200, 330, 110, 290, 50, 180];
const SKIP = /^(hidden|password|file|submit|button|reset|image|checkbox|radio|range|color)$/;
/** Ancho desde el que la evidencia va al lado del formulario y no encima. */
const WIDE = 720;

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
/** `set`: lo escribimos; `suggest`: la persona tenía otro valor y decide; `same`: ya tenía ese
 *  valor; `you`: la persona lo confirmó, lo corrigió o eligió «Usar». */
type Status = "set" | "suggest" | "same" | "you";
type Mark = { name: string; label: string; hue: number; value: string; shown: string; theirs?: string; confidence: number; source?: PasteSource; hint?: string; status: Status };
type Session = { text: string; marks: Map<string, Mark>; before: Map<string, string>; notes: string[]; failed: boolean };

let uid = 0;
const isField = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && !SKIP.test((t as HTMLInputElement).type)));
const same = (a: string, b: string) => foldText(a.trim()) === foldText(b.trim());

/** La etiqueta de un control: su `<label>`, `aria-labelledby`, `aria-label`, `placeholder` o `name`. */
function labelOf(el: Control): string {
  const doc = el.ownerDocument;
  const lab = (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest("label");
  let t = "";
  if (lab) {
    const c = lab.cloneNode(true) as HTMLElement;
    c.querySelectorAll("input, select, textarea, button, [aria-hidden='true']").forEach((n) => n.remove());
    t = c.textContent ?? "";
  }
  t ||= (el.getAttribute("aria-labelledby") ?? "")
    .split(/\s+/)
    .map((id) => (id && doc.getElementById(id)?.textContent) || "")
    .join(" ");
  t = t.trim() || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.title || humanize(el.name);
  return t.replace(/\s+/g, " ").replace(/[\s*:]+$/, "").trim();
}

/** Escribe con el setter nativo: React y compañía vigilan `value` en la instancia y no se enteran
 *  de una asignación directa. */
function writeValue(el: Control, v: string): void {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (set) set.call(el, v);
  else el.value = v;
}

export class NxPasteFill extends Base {
  static observedAttributes = ["endpoint", "review-below", "labels", "fields", "for", "locale"];

  #uid = `nx-pf${++uid}`;
  #labels: PasteFillLabels = PASTE_FILL_LABELS;
  #explicit: PasteFieldInput[] = [];
  #stack: Session[] = [];
  #state: PasteFillState = "idle";
  #busy = "";
  /** El último valor que escribimos en cada campo: si sigue ahí, no es de la persona. */
  #mine = new Map<string, string>();
  /** Campos que la persona editó a mano. */
  #touched = new Set<string>();
  /** Valor de cada `<select>` cuando se vio por primera vez (siempre tiene uno). */
  #initial = new Map<string, string>();
  /** `aria-describedby` original de cada campo marcado, para devolverlo. */
  #described = new Map<string, string | null>();
  #open: boolean | null = null;
  #writing = false;
  #abort?: AbortController;
  #ro?: ResizeObserver;
  #raf = 0;
  #built = false;
  // Nodos propios.
  #bar?: HTMLDivElement;
  #zone?: HTMLDivElement;
  #input?: HTMLTextAreaElement;
  #status?: HTMLDivElement;
  #panel?: HTMLElement;
  #layer?: HTMLDivElement;
  #descs?: HTMLDivElement;
  #live?: HTMLSpanElement;
  #rings = new Map<string, HTMLDivElement>();

  // ---------------------------------------------------------------- propiedades

  /**
   * Los campos: los que se leen del formulario (`name`, etiqueta, `type`, opciones de un select),
   * enriquecidos con los que se asignan aquí por `name` (p. ej. `{name:"monto", kind:"money"}`).
   */
  get fields(): PasteField[] {
    return mergeFields(
      [...this.#controls().values()].map((el) => ({
        name: el.name,
        label: labelOf(el),
        type: el instanceof HTMLSelectElement ? "select" : el instanceof HTMLTextAreaElement ? "textarea" : el.type,
        options: el instanceof HTMLSelectElement ? [...el.options].filter((o) => o.value && !o.disabled).map((o) => ({ value: o.value, label: o.text.trim() })) : undefined,
      })),
      this.#explicit,
    );
  }
  set fields(v: PasteFieldInput[] | null | undefined) {
    this.#explicit = cleanFields(v);
  }
  /** URL que recibe `POST {text, fields}` y responde con el protocolo en streaming (opcional). */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    this.#attr("endpoint", v);
  }
  /** Confianza por debajo de la cual un campo queda «Revisar» (0–1, por defecto 0,8). */
  get reviewBelow(): number {
    const n = Number(this.getAttribute("review-below"));
    return Number.isFinite(n) && n > 0 ? (n > 1 ? n / 100 : n) : 0.8;
  }
  set reviewBelow(v: number) {
    this.#attr("review-below", String(v));
  }
  /** El `id` de un formulario que está en otra parte de la página (sin él, el que envuelve). */
  get for(): string | null {
    return this.getAttribute("for");
  }
  set for(v: string | null) {
    this.#attr("for", v);
  }
  get labels(): PasteFillLabels {
    return this.#labels;
  }
  set labels(v: Partial<PasteFillLabels> | null | undefined) {
    this.#labels = { ...PASTE_FILL_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }
  /** `idle`, `busy` (leyendo o esperando al servidor) o `filled`. */
  get state(): PasteFillState {
    return this.#state;
  }
  /** El último texto pegado. */
  get text(): string {
    return this.#top()?.text ?? "";
  }
  /** Campos que esperan a la persona: confianza baja sin confirmar, o una sugerencia. */
  get pending(): string[] {
    return [...(this.#top()?.marks.values() ?? [])].filter((m) => this.#tier(m) === "low" || m.status === "suggest").map((m) => m.name);
  }

  // ---------------------------------------------------------------- API

  /**
   * Llena el formulario con lo que encuentre en `text`. `nx-paste-fill-start` (cancelable) avisa
   * antes; `nx-paste-fill-done` al terminar (también tras el servidor). Devuelve ese mismo detalle.
   */
  async fill(text: string): Promise<PasteFillDoneDetail | null> {
    text = String(text ?? "")
      .normalize("NFC")
      .replace(/\r\n?/g, "\n")
      .trim();
    if (!text) return null;
    const go = this.dispatchEvent(new CustomEvent("nx-paste-fill-start", { detail: { text }, bubbles: true, composed: true, cancelable: true }));
    if (!go) return null;
    this.#abort?.abort();
    if (!this.#built) this.#build();
    const refocus = this.#bar!.contains(document.activeElement);
    const ses: Session = { text, marks: new Map(), before: new Map(), notes: [], failed: false };
    this.#clearMarks();
    this.#stack.push(ses);
    if (this.#stack.length > 10) this.#stack.shift();
    const fields = this.fields;
    const fmt = nxFormat(resolveLocale(this));
    matchFields(fields, text, { fmt, hints: this.#labels }).forEach((f, i) => this.#apply(ses, f, i));
    const url = safeHref(this.endpoint);
    this.#state = url ? "busy" : "filled";
    this.#busy = url ? this.#labels.server : "";
    this.#paint();
    if (refocus) this.focus({ preventScroll: true });
    if (url) {
      const ctrl = (this.#abort = new AbortController());
      let n = 0;
      try {
        const res = await fetch(url, { method: "POST", signal: ctrl.signal, credentials: "same-origin", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, text/event-stream" }, body: JSON.stringify({ text, fields }) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let failed = false;
        await readLines(res, (line) => {
          const ev = parsePasteEvent(lineData(line));
          if (!ev || this.#top() !== ses) return;
          if (ev.type === "field") this.#apply(ses, ev, n++);
          else if (ev.type === "note" && ev.message) ses.notes.push(ev.message);
          else if (ev.type === "error") failed = true;
          this.#paint();
        });
        if (failed) throw new Error("stream");
      } catch {
        if (ctrl.signal.aborted) return null;
        ses.failed = true;
      }
      if (this.#top() !== ses) return null;
      this.#state = "filled";
      this.#busy = "";
      this.#paint();
    }
    const detail = this.#detail(ses);
    const L = this.#labels;
    const pending = this.pending.length;
    this.#say([this.#summary(ses), pending ? fmtText(L.review, { n: pending }) : "", ses.failed ? L.serverError : ""].filter(Boolean).join(". "));
    this.dispatchEvent(new CustomEvent("nx-paste-fill-done", { detail, bubbles: true, composed: true }));
    return detail;
  }

  /** Devuelve los valores de antes del último llenado (los campos que la persona cambió después se
   *  respetan). `false` si no había nada que deshacer. */
  undo(): boolean {
    const ses = this.#stack.pop();
    if (!ses) return false;
    this.#abort?.abort();
    const refocus = this.#bar?.contains(document.activeElement);
    const values: Record<string, string> = {};
    const controls = this.#controls();
    for (const [name, prev] of ses.before) {
      const el = controls.get(name);
      if (!el || el.value !== this.#mine.get(name)) continue;
      this.#write(el, prev);
      this.#mine.set(name, prev);
      values[name] = prev;
    }
    this.#clearMarks();
    this.#state = this.#stack.length ? "filled" : "idle";
    this.#busy = "";
    this.#paint();
    if (refocus) (this.#state === "idle" ? this.#input : this.#status?.querySelector<HTMLElement>("[data-act=undo]"))?.focus();
    this.#say(this.#labels.undone);
    this.dispatchEvent(new CustomEvent("nx-paste-fill-undo", { detail: { values }, bubbles: true, composed: true }));
    return true;
  }

  /** Quita las marcas y la evidencia y vuelve a la zona para pegar (los valores quedan). */
  clear(): void {
    this.#abort?.abort();
    this.#clearMarks();
    this.#stack = [];
    this.#state = "idle";
    this.#busy = "";
    this.#paint();
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
    for (const [name, el] of this.#controls()) if (el instanceof HTMLSelectElement && !this.#initial.has(name)) this.#initial.set(name, el.value);
    if (typeof ResizeObserver !== "undefined") {
      this.#ro ??= new ResizeObserver(() => this.#layout());
      this.#ro.observe(this);
    }
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#ro?.disconnect();
    cancelAnimationFrame(this.#raf);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "labels" || name === "fields") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-paste-fill] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }
  #top(): Session | undefined {
    return this.#stack[this.#stack.length - 1];
  }
  #say(text: string): void {
    if (this.#live) this.#live.textContent = text;
  }

  /** Los controles del formulario por `name` (el primero de cada nombre), sin los propios. */
  #controls(): Map<string, Control> {
    const root = (this.for && this.ownerDocument.getElementById(this.for)) || this;
    const out = new Map<string, Control>();
    for (const el of root.querySelectorAll<Control>("input[name], select[name], textarea[name]")) {
      if (el.closest(".nx-pf__bar") || el.disabled || (el as HTMLInputElement).readOnly || SKIP.test(el.type) || out.has(el.name)) continue;
      out.set(el.name, el);
    }
    return out;
  }

  /** ¿Lo escribió la persona? Un texto con algo que no pusimos nosotros; un select que cambió. */
  #theirs(name: string, el: Control): boolean {
    if (el.value === this.#mine.get(name)) return false;
    return el instanceof HTMLSelectElement ? this.#touched.has(name) || el.value !== (this.#initial.get(name) ?? el.value) : el.value.trim() !== "";
  }

  #write(el: Control, v: string): void {
    this.#writing = true;
    try {
      writeValue(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      this.#writing = false;
    }
  }

  /** Un valor para un campo (del extractor o del servidor). `i` escalona el resplandor. */
  #apply(ses: Session, f: PasteFill, i: number): void {
    const el = this.#controls().get(f.name);
    if (!el) return;
    let value = f.value;
    let shown = value;
    if (el instanceof HTMLSelectElement) {
      const o = [...el.options].find((x) => x.value === value) ?? [...el.options].find((x) => same(x.text, value));
      if (!o || !o.value) return;
      (value = o.value), (shown = o.text.trim());
    } else if (el.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) shown = nxFormat(resolveLocale(this)).date(value);
    const prev = ses.marks.get(f.name);
    const label = this.#explicit.find((x) => x.name === f.name)?.label ?? labelOf(el);
    const theirs = el instanceof HTMLSelectElement ? el.selectedOptions[0]?.text.trim() : el.value;
    const idx = [...this.#controls().keys()].indexOf(f.name);
    let status: Status;
    if (same(el.value, value)) status = prev?.status === "set" || !this.#theirs(f.name, el) ? (prev?.status ?? "set") : "same";
    else if (this.#theirs(f.name, el)) status = "suggest";
    else {
      if (!ses.before.has(f.name)) ses.before.set(f.name, el.value);
      this.#write(el, value);
      // Un valor que el control no acepta (una fecha inválida en `type=date`) no cuenta.
      if (el.value !== value) {
        this.#write(el, ses.before.get(f.name)!);
        return;
      }
      this.#mine.set(f.name, value);
      status = "set";
    }
    ses.marks.set(f.name, { name: f.name, label, hue: HUES[Math.max(0, idx) % HUES.length], value, shown, confidence: f.confidence, source: f.source && f.source.end <= ses.text.length ? f.source : undefined, hint: f.hint, status, theirs });
    if (status === "set") this.#glow(f.name, i);
  }

  #tier(m: Mark): string {
    return m.status === "set" ? confidenceTier(m.confidence, this.reviewBelow) : m.status;
  }

  #detail(ses: Session): PasteFillDoneDetail {
    const values: Record<string, string> = {};
    const controls = this.#controls();
    for (const m of ses.marks.values()) if (m.status === "set" || m.status === "you") values[m.name] = controls.get(m.name)?.value ?? m.value;
    return { values, fields: [...ses.marks.values()].map((m) => ({ name: m.name, value: m.value, confidence: m.confidence })) };
  }

  #summary(ses: Session): string {
    const L = this.#labels;
    const marks = [...ses.marks.values()];
    const n = marks.filter((m) => m.status === "set" || m.status === "you").length;
    const sug = marks.filter((m) => m.status === "suggest").length;
    return n === 1 ? L.filledOne : n ? fmtText(L.filled, { n }) : sug ? fmtText(L.suggestions, { n: sug }) : marks.length ? L.same : L.none;
  }

  // ---------------------------------------------------------------- construcción

  #build(): void {
    this.#built = true;
    // Enfocable con el mouse (no con Tab): un clic en un hueco del formulario deja listo Ctrl+V.
    if (!this.hasAttribute("tabindex")) this.tabIndex = -1;
    this.#input = h("textarea", { class: "nx-pf__input", rows: "1", spellcheck: "false" });
    this.#zone = h(
      "div",
      { class: "nx-pf__zone" },
      glyph(PASTE, "nx-pf__zone-icon"),
      h("div", { class: "nx-pf__zone-body" }, this.#input, h("p", { class: "nx-pf__hint" })),
      h("button", { type: "button", class: "nx-pf__btn", "data-act": "fill", hidden: true }),
      h("button", { type: "button", class: "nx-pf__btn nx-pf__btn--soft", "data-act": "paste", hidden: true }),
    );
    const tool = (act: string, icon: string, attrs?: Record<string, string>) => h("button", { type: "button", class: "nx-pf__tool", "data-act": act, ...attrs }, glyph(icon), h("span"));
    this.#status = h(
      "div",
      { class: "nx-pf__status", hidden: true },
      h("span", { class: "nx-pf__msg" }),
      h("button", { type: "button", class: "nx-pf__pill", "data-act": "next" }),
      h("span", { class: "nx-pf__tools" }, tool("evidence", TEXT, { "aria-controls": `${this.#uid}-ev` }), tool("undo", UNDO), tool("close", X, { class: "nx-pf__tool nx-pf__tool--icon" })),
      h("span", { class: "nx-pf__err" }),
    );
    this.#bar = h("div", { class: "nx-pf__bar" }, this.#zone, this.#status);
    this.#panel = h("section", { class: "nx-pf__panel", id: `${this.#uid}-ev`, hidden: true });
    this.#layer = h("div", { class: "nx-pf__layer", "aria-hidden": "true" });
    this.#descs = h("div", { hidden: true });
    this.#live = h("span", { class: "nx-pf__sr", role: "status" });
    this.prepend(this.#bar, this.#panel);
    this.append(this.#layer, this.#descs, this.#live);

    this.#input.addEventListener("input", () => this.#paintZone());
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.#fillFromInput();
      }
    });
    this.addEventListener("click", (e) => this.#onClick(e));
    this.addEventListener("paste", (e) => {
      const t = e.target as Element;
      // Pegar en un campo es pegar en ese campo; en la zona o en un hueco del formulario, llenar.
      if (isField(t) && t !== this.#input) return;
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text.trim()) return;
      e.preventDefault();
      this.#input!.value = "";
      void this.fill(text);
    });
    this.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z" && !isField(e.target) && this.#stack.length) {
        e.preventDefault();
        this.undo();
      }
    });
    // Arrastrar texto (no archivos) sobre el formulario; sobre un campo, cae en el campo.
    const textDrag = (e: DragEvent) => {
      const types = [...(e.dataTransfer?.types ?? [])];
      return types.includes("text/plain") && !types.includes("Files") && (!isField(e.target) || e.target === this.#input);
    };
    this.addEventListener("dragover", (e) => {
      if (!textDrag(e)) return;
      e.preventDefault();
      this.toggleAttribute("data-drag", true);
    });
    this.addEventListener("dragleave", (e) => {
      if (!this.contains(e.relatedTarget as Node | null)) this.removeAttribute("data-drag");
    });
    this.addEventListener("drop", (e) => {
      this.removeAttribute("data-drag");
      if (!textDrag(e)) return;
      e.preventDefault();
      void this.fill(e.dataTransfer!.getData("text/plain"));
    });
    // Lo que la persona escribe en un campo: queda como suyo (y lo marcado, confirmado).
    const edited = (e: Event) => {
      const t = e.target as Control;
      if (this.#writing || !t.name || t === this.#input || !this.#controls().has(t.name)) return;
      this.#touched.add(t.name);
      const m = this.#top()?.marks.get(t.name);
      if (m && m.status !== "you") {
        m.status = "you";
        this.#paint();
      }
      this.#layout();
    };
    this.addEventListener("input", edited, true);
    this.addEventListener("change", edited, true);
    // Evidencia: campo ⇄ tramo del texto ⇄ fila, con el mouse o con el foco.
    const link = (e: Event, on: boolean) => {
      const t = e.target as Element;
      const name = t.closest<HTMLElement>("[data-name]")?.dataset.name ?? (isField(t) ? (t as Control).name : "");
      if (name && this.#top()?.marks.has(name)) this.#light(name, on, !t.closest(".nx-pf__panel"));
    };
    this.addEventListener("pointerover", (e) => link(e, true));
    this.addEventListener("pointerout", (e) => link(e, false));
    this.addEventListener("focusin", (e) => link(e, true));
    this.addEventListener("focusout", (e) => link(e, false));
  }

  async #fillFromInput(): Promise<void> {
    const t = this.#input!.value;
    this.#input!.value = "";
    this.#paintZone();
    await this.fill(t);
  }

  #onClick(e: Event): void {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>("[data-act]");
    const name = t.closest<HTMLElement>("[data-name]")?.dataset.name;
    const m = name ? this.#top()?.marks.get(name) : undefined;
    switch (b?.dataset.act) {
      case "fill":
        return void this.#fillFromInput();
      case "paste":
        // Lectura del portapapeles (con permiso); si no se puede, la zona para Ctrl+V.
        return void navigator.clipboard.readText().then(
          (text) => (text.trim() ? void this.fill(text) : this.#input!.focus()),
          () => this.#input!.focus(),
        );
      case "undo":
        return void this.undo();
      case "close":
        this.clear();
        return this.#input!.focus();
      case "evidence":
        this.#open = !!this.#panel!.hidden;
        return this.#paint();
      case "next": {
        const next = this.pending[0];
        return void (next && this.#controls().get(next)?.focus());
      }
      case "confirm":
      case "use":
      case "keep":
        if (m) this.#decide(m, b.dataset.act);
        return;
    }
    // Un clic en el tramo del texto o en la fila lleva al campo.
    if (name && !b && t.closest(".nx-pf__panel")) this.#controls().get(name)?.focus();
  }

  /** «Confirmar», «Usar» (la sugerencia) o «Dejar el mío». El foco sigue a lo que falta revisar. */
  #decide(m: Mark, act: string): void {
    const ses = this.#top()!;
    const el = this.#controls().get(m.name);
    if (act === "use" && el) {
      if (!ses.before.has(m.name)) ses.before.set(m.name, el.value);
      this.#write(el, m.value);
      this.#mine.set(m.name, m.value);
    }
    if (act === "keep") ses.marks.delete(m.name);
    else m.status = "you";
    this.#paint();
    const next = this.pending[0];
    (this.#panel!.querySelector<HTMLElement>(`li[data-name="${CSS.escape(next ?? "")}"] button`) ?? (act === "keep" ? null : el) ?? this.#status!.querySelector<HTMLElement>("[data-act=undo]"))?.focus();
  }

  // ---------------------------------------------------------------- pintado

  #glow(name: string, i: number): void {
    const ring = this.#ring(name);
    ring.classList.remove("is-new");
    void ring.offsetWidth;
    ring.style.setProperty("--_d", `${Math.min(i, 12) * 70}ms`);
    ring.classList.add("is-new");
  }

  #ring(name: string): HTMLDivElement {
    let ring = this.#rings.get(name);
    if (!ring) {
      ring = h("div", { class: "nx-pf__ring", "data-name": name }, h("span", { class: "nx-pf__chip" }));
      ring.addEventListener("animationend", () => ring!.classList.remove("is-new"));
      this.#rings.set(name, ring);
      this.#layer!.append(ring);
    }
    return ring;
  }

  /** Quita anillos, `data-nx-fill` y descripciones (devuelve el `aria-describedby` original). */
  #clearMarks(): void {
    const controls = this.#controls();
    for (const [name, orig] of this.#described) {
      const el = controls.get(name);
      if (!el) continue;
      el.removeAttribute("data-nx-fill");
      if (orig) el.setAttribute("aria-describedby", orig);
      else el.removeAttribute("aria-describedby");
    }
    this.#described.clear();
    this.#rings.forEach((r) => r.remove());
    this.#rings.clear();
    this.#descs?.replaceChildren();
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const ses = this.#top();
    this.dataset.state = this.#state;
    this.setAttribute("data-drop", L.drop);
    this.#paintZone();
    this.#zone!.hidden = !!ses;
    this.#status!.hidden = !ses;
    this.#panel!.hidden = !ses || !this.#isOpen();
    this.toggleAttribute("data-open", !this.#panel!.hidden);
    if (!ses) {
      this.#clearMarks();
      this.#panel!.replaceChildren();
      return this.#layout();
    }
    const pending = this.pending.length;
    const [msg, pill, tools, err] = this.#status!.children as unknown as HTMLElement[];
    const [evidence, undo, close] = tools.children as unknown as HTMLElement[];
    msg.dataset.tone = ses.failed ? "warn" : "ok";
    msg.replaceChildren(this.#state === "busy" ? h("span", { class: "nx-pf__spin", "aria-hidden": "true" }) : glyph(ses.failed ? WARN : CHECK), h("span", null, this.#summary(ses), this.#busy ? h("span", { class: "nx-pf__busy" }, ` · ${this.#busy}`) : null));
    pill.hidden = !pending;
    pill.textContent = fmtText(L.review, { n: pending });
    err.hidden = !ses.failed;
    err.textContent = L.serverError;
    evidence.setAttribute("aria-expanded", String(!this.#panel!.hidden));
    evidence.lastElementChild!.textContent = L.evidence;
    undo.lastElementChild!.textContent = L.undo;
    close.setAttribute("aria-label", L.close);
    close.title = L.close;
    // La ayuda de cada campo marcado: lo que oye el lector de pantalla al entrar.
    const controls = this.#controls();
    const descs: HTMLElement[] = [];
    for (const m of ses.marks.values()) {
      const el = controls.get(m.name);
      if (!el) continue;
      const tier = this.#tier(m);
      const pct = `${Math.round(m.confidence * 100)} %`;
      const id = `${this.#uid}-d-${m.name}`;
      const words =
        m.status === "suggest"
          ? [fmtText(L.suggestion, { value: m.shown })]
          : m.status === "same"
            ? [L.same]
            : m.status === "you"
              ? [L.fromText, L.confirmed]
              : [L.fromText, fmtText(L.confidence, { pct }), tier === "low" ? L.reviewChip : "", m.hint ?? ""];
      descs.push(h("span", { id }, words.filter(Boolean).join(" · ")));
      if (!this.#described.has(m.name)) {
        const orig = el.getAttribute("aria-describedby");
        this.#described.set(m.name, orig);
        el.setAttribute("aria-describedby", `${orig ? `${orig} ` : ""}${id}`);
      }
      el.setAttribute("data-nx-fill", tier);
      const ring = this.#ring(m.name);
      ring.dataset.tier = tier;
      ring.style.setProperty("--_h", String(m.hue));
      const chip = ring.firstElementChild as HTMLElement;
      const mini = (act: string, text: string, icon?: string) => h("button", { type: "button", tabindex: "-1", "data-act": act, "data-name": m.name, title: text }, icon ? glyph(icon) : text);
      chip.replaceChildren(
        ...(m.status === "suggest"
          ? [h("span", { class: "nx-pf__chip-text" }, fmtText(L.suggestion, { value: m.shown })), mini("use", L.use), mini("keep", L.keep)]
          : m.status === "you" || m.status === "same"
            ? [glyph(CHECK)]
            : tier === "low"
              ? [`${L.reviewChip} · ${pct}`, mini("confirm", L.confirm, CHECK)]
              : [pct]),
      );
    }
    // Anillos de campos que ya no están marcados («Dejar el mío»).
    for (const [name, ring] of this.#rings) if (!ses.marks.has(name)) ring.remove(), this.#rings.delete(name);
    for (const [name, orig] of this.#described) {
      if (ses.marks.has(name)) continue;
      const el = controls.get(name);
      el?.removeAttribute("data-nx-fill");
      if (orig) el?.setAttribute("aria-describedby", orig);
      else el?.removeAttribute("aria-describedby");
      this.#described.delete(name);
    }
    this.#descs!.replaceChildren(...descs);
    this.#paintPanel(ses);
    this.#layout();
  }

  #paintZone(): void {
    const L = this.#labels;
    const input = this.#input!;
    input.placeholder = L.zone;
    input.setAttribute("aria-label", L.zone);
    const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    this.#zone!.querySelector(".nx-pf__hint")!.textContent = fmtText(L.zoneHint, { mod: mac ? "⌘" : "Ctrl" });
    const [fill, paste] = this.#zone!.querySelectorAll<HTMLButtonElement>("button");
    fill.textContent = L.fill;
    paste.textContent = L.paste;
    const typed = !!input.value.trim();
    fill.hidden = !typed;
    paste.hidden = typed || typeof navigator === "undefined" || !navigator.clipboard?.readText;
  }

  #isOpen(): boolean {
    return this.#open ?? this.offsetWidth >= WIDE;
  }

  /** El texto con los tramos usados, cada uno del color de su campo; debajo, la lista de campos. */
  #paintPanel(ses: Session): void {
    const L = this.#labels;
    const marks = [...ses.marks.values()];
    const spans = marks.filter((m) => m.source).sort((a, b) => a.source!.start - b.source!.start);
    const text = h("div", { class: "nx-pf__text", tabindex: "0", role: "region", "aria-label": L.pasted });
    let at = 0;
    spans.forEach((m, i) => {
      const { start, end } = m.source!;
      if (start < at) return;
      text.append(ses.text.slice(at, start), h("mark", { "data-name": m.name, title: m.label, style: `--_h:${m.hue};--_d:${i * 70}ms` }, ses.text.slice(start, end)));
      at = end;
    });
    text.append(ses.text.slice(at));
    const list = h(
      "ul",
      { class: "nx-pf__list" },
      ...marks.map((m) => {
        const tier = this.#tier(m);
        const btn = (act: string, label: string, soft = false) => h("button", { type: "button", class: soft ? "nx-pf__act nx-pf__act--soft" : "nx-pf__act", "data-act": act }, label);
        return h(
          "li",
          { "data-name": m.name, "data-tier": tier, style: `--_h:${m.hue}` },
          h("span", { class: "nx-pf__dot", "aria-hidden": "true" }),
          h(
            "span",
            { class: "nx-pf__row" },
            h("span", { class: "nx-pf__row-label" }, m.label),
            h("span", { class: "nx-pf__row-val" }, m.shown),
            m.status === "suggest" ? h("small", null, fmtText(L.yours, { value: m.theirs ?? "" })) : m.status === "same" ? h("small", null, L.same) : m.hint && m.status !== "you" ? h("small", null, m.hint) : null,
          ),
          h("span", { class: "nx-pf__conf" }, m.status === "you" ? L.confirmed : `${Math.round(m.confidence * 100)} %`),
          m.status === "suggest" ? h("span", { class: "nx-pf__acts" }, btn("use", L.use), btn("keep", L.keep, true)) : tier === "low" ? h("span", { class: "nx-pf__acts" }, btn("confirm", L.confirm)) : null,
        );
      }),
    );
    // Repintar no le quita el foco ni el scroll a quien está leyendo o revisando.
    const panel = this.#panel!;
    const a = panel.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    const back = a?.dataset.act ? `li[data-name="${CSS.escape(a.closest("li")?.dataset.name ?? "")}"] [data-act="${a.dataset.act}"]` : a ? ".nx-pf__text" : "";
    const top = panel.querySelector(".nx-pf__text")?.scrollTop ?? 0;
    panel.setAttribute("aria-label", L.evidence);
    panel.replaceChildren(...(ses.notes.length ? [h("ul", { class: "nx-pf__notes" }, ...ses.notes.map((n) => h("li", null, n)))] : []), text, list);
    text.scrollTop = top;
    if (back) panel.querySelector<HTMLElement>(back)?.focus({ preventScroll: true });
  }

  /** Ilumina un campo, su tramo y su fila; lleva el tramo a la vista dentro del panel (sin mover la página). */
  #light(name: string, on: boolean, reveal: boolean): void {
    this.#rings.get(name)?.classList.toggle("is-lit", on);
    for (const el of this.#panel!.querySelectorAll<HTMLElement>(`[data-name="${CSS.escape(name)}"]`)) {
      el.classList.toggle("is-lit", on);
      const box = el.parentElement;
      if (on && reveal && el.tagName === "MARK" && box) {
        const top = el.offsetTop - box.offsetTop;
        if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - 20) box.scrollTo?.({ top: top - box.clientHeight / 3, behavior: "smooth" });
      }
    }
  }

  /** Coloca los anillos sobre los campos (en el siguiente cuadro, una vez aunque se pida varias). */
  #layout(): void {
    if (typeof requestAnimationFrame === "undefined") return;
    cancelAnimationFrame(this.#raf);
    this.#raf = requestAnimationFrame(() => {
      const wide = this.offsetWidth >= WIDE;
      this.toggleAttribute("data-wide", wide);
      if (this.#open === null && this.#top() && this.#panel!.hidden === wide) return this.#paint();
      const box = this.#layer!.getBoundingClientRect();
      const controls = this.#controls();
      for (const [name, ring] of this.#rings) {
        const r = controls.get(name)?.getBoundingClientRect();
        ring.hidden = !r || !r.width;
        if (r) Object.assign(ring.style, { left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      }
    });
  }
}
