/**
 * `<nx-guard>`: el detector de dedazos. Envuelve un formulario del autor (o un grupo de campos) y,
 * al salir de un campo, compara lo escrito con lo habitual para ese campo: un precio con un cero de
 * más, una cantidad de 1000 donde siempre van 10, una fecha en 2062, dos dígitos invertidos en un
 * total. Si algo no cuadra, lo dice **debajo del campo, sin bloquear**, con la corrección a un clic
 * («Corregir a $ 1.200.000») y «Está bien» para reconocerlo.
 *
 * Los campos no se registran: se vigilan por delegación (`change` y `focusout` en el propio guard),
 * así que los que entran después también cuentan, y mientras nadie escribe no se hace nada. La
 * configuración va por `name` en `fields`, o en el `data-guard` del campo. La lógica es pura
 * (`logic.ts`); con `endpoint`, el backend puede sumar lo que solo él sabe («esta factura ya se
 * registró»). Si el servidor falla o tarda, silencio: el guard nunca bloquea por su cuenta.
 *
 * Los nodos del autor nunca se mueven (hidratación de Solid): el aviso es un nodo propio que se
 * inserta después del campo (o de su `<label>`) y se quita. Al campo solo se le suma el aviso en
 * `aria-describedby` y `data-nx-guard`; nada de `aria-invalid`, porque no es un error.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import { GUARD_LABELS, fillText, guardCheck, readAmount, showValue } from "./logic";
import type { GuardFields, GuardFinding, GuardLabels, GuardMode, GuardRemoteResponse, GuardRule } from "./types";

export { GUARD_LABELS };

const PROPS = ["fields", "labels", "mode", "endpoint", "disabled"] as const;
const SKIP = /^(hidden|password|file|submit|button|reset|image|checkbox|radio|range|color)$/;
/** Espera tras el último cambio antes de preguntarle al servidor, y cuánto se le espera. */
const DEBOUNCE = 300;
const TIMEOUT = 4000;

type Field = HTMLElement & { value?: unknown; name?: string };
type Read = { value: number | string | null; raw?: string; key: string };
type Result = Read & { el: Field; local: GuardFinding[] };
type Job = { key: string; ctrl: AbortController; timer?: ReturnType<typeof setTimeout>; found?: GuardFinding[] };

let uid = 0;
const isNumber = (el: Element) => el.localName === "nx-number";
const nameOf = (el: Element) => el.getAttribute("name") ?? "";
const keyOf = (el: Field) => String(el.value ?? "").trim();

/** El JSON de configuración: solo objetos (un `data-guard` mal escrito no rompe nada). */
function obj<T>(v: unknown): T | null {
  try {
    const o = typeof v === "string" ? JSON.parse(v) : v;
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/** Suma o quita un id de `aria-describedby`, sin tocar los del autor. */
function describe(el: HTMLElement, id: string, on: boolean): void {
  const ids = (el.getAttribute("aria-describedby") ?? "").split(" ").filter((x) => x && x !== id);
  if (on) ids.push(id);
  if (ids.length) el.setAttribute("aria-describedby", ids.join(" "));
  else el.removeAttribute("aria-describedby");
}

export class NxGuard extends Base {
  static observedAttributes = ["fields", "labels", "mode", "endpoint", "disabled", "locale"];

  #uid = `nx-guard${++uid}-`;
  #seq = 0;
  #fields: GuardFields = {};
  #labels: GuardLabels = GUARD_LABELS;
  /** Lo último revisado de cada campo (por `name`). */
  #results = new Map<string, Result>();
  /** Lo que se le preguntó al servidor por cada campo (y lo que dijo, para ese valor). */
  #jobs = new Map<string, Job>();
  /** Valores reconocidos («Está bien») por campo. */
  #acked = new Map<string, Set<string>>();
  /** Lo que se tecleó en un `<nx-number>` (al salir ya queda formateado): delata un separador. */
  #raw = new Map<string, string>();
  #notes = new Map<string, HTMLDivElement>();
  /** El valor de un campo al entrar: salir sin cambiarlo no revisa nada. */
  #focusKey: string | null = null;
  /** Lo que ya se avisó al detener un envío (`confirm`): con eso mismo, el siguiente pasa. */
  #blocked = new Set<string>();
  #line?: HTMLParagraphElement;
  #live?: HTMLSpanElement;
  #writing = false;

  // ---------------------------------------------------------------- propiedades

  /** La configuración por `name`: `{precio: {history: [...], format: "money"}, fecha: {type: "date"}}`. */
  get fields(): GuardFields {
    return this.#fields;
  }
  set fields(v: GuardFields | string | null | undefined) {
    const out: GuardFields = {};
    for (const [k, r] of Object.entries(obj<GuardFields>(v) ?? {})) if (obj(r)) out[k] = r;
    this.#fields = out;
  }
  /** `warn` (por defecto: nunca bloquea) o `confirm` (el primer envío con avisos se detiene). */
  get mode(): GuardMode {
    return this.getAttribute("mode") === "confirm" ? "confirm" : "warn";
  }
  set mode(v: GuardMode) {
    this.setAttribute("mode", v);
  }
  /** URL que recibe `POST {field, value, values}` y responde `{findings: [...]}` (opcional). */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    if (v) this.setAttribute("endpoint", v);
    else this.removeAttribute("endpoint");
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    this.toggleAttribute("disabled", !!v);
  }
  get labels(): GuardLabels {
    return this.#labels;
  }
  set labels(v: Partial<GuardLabels> | null | undefined) {
    this.#labels = mergeLabels(GUARD_LABELS, v);
  }
  /** Los avisos vigentes (sin los reconocidos), en el orden de los campos en la página. */
  get findings(): GuardFinding[] {
    return [...this.#results]
      .sort(([, a], [, b]) => (a.el.compareDocumentPosition(b.el) & 2 ? 1 : -1))
      .flatMap(([name, r]) => (this.#acked.get(name)?.has(r.key) ? [] : this.#all(name, r)));
  }

  // ---------------------------------------------------------------- API

  /**
   * Revisa ya un campo (por `name`) o todos, pinta los avisos y devuelve los hallazgos vigentes.
   * No anuncia nada: lo que se anuncia es lo que pasa al salir de un campo.
   */
  check(name?: string): GuardFinding[] {
    for (const el of this.#controls()) if (!name || nameOf(el) === name) this.#run(el, false);
    return this.findings.filter((f) => !name || f.field === name);
  }

  /** Quita los avisos y olvida lo reconocido, lo tecleado y lo que dijo el servidor. */
  reset(): void {
    this.#stop();
    for (const name of [...this.#notes.keys()]) this.#unmark(name);
    for (const m of [this.#results, this.#acked, this.#raw, this.#blocked]) m.clear();
    this.#line?.remove();
    this.#line = undefined;
  }

  // ---------------------------------------------------------------- ciclo de vida

  constructor() {
    super();
    // Todo por delegación: nada por campo, y nada corre mientras nadie toca el formulario.
    this.addEventListener("focusin", (e) => {
      // La región de anuncios se crea cuando alguien entra (ya hidratado), antes del primer aviso.
      this.#region();
      const el = this.#field(e.target);
      this.#focusKey = el ? keyOf(el) : null;
    });
    // Lo que se teclea en un <nx-number> (su `input` interno no sale de él: se oye en captura).
    this.addEventListener(
      "input",
      (e) => {
        const t = e.target as HTMLInputElement;
        const host = t.closest?.("nx-number") as Element | null;
        if (host && host !== t && !this.#writing) this.#raw.set(nameOf(host), t.value);
      },
      true,
    );
    this.addEventListener("change", (e) => {
      const el = this.#field(e.target);
      if (el && !this.#writing) this.#run(el, true);
    });
    // Un valor que cambió sin `change` (lo puso un script mientras tenía el foco).
    this.addEventListener("focusout", (e) => {
      const el = this.#field(e.target);
      const key = el && !isNumber(el) && !this.#writing && keyOf(el);
      if (el && key !== false && key !== this.#focusKey && key !== this.#results.get(nameOf(el))?.key) this.#run(el, true);
    });
    this.addEventListener("click", (e) => {
      const b = (e.target as Element).closest?.<HTMLElement>(".nx-guard__note button");
      const name = b?.parentElement?.parentElement?.dataset.field;
      if (name !== undefined) this.#decide(name, b!.dataset.act === "fix");
    });
    this.addEventListener("submit", (e) => this.#submit(e as SubmitEvent), true);
  }

  connectedCallback(): void {
    for (const p of PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const self = this as unknown as Record<string, unknown>;
        const v = self[p];
        delete self[p];
        self[p] = v;
      }
    }
  }

  disconnectedCallback(): void {
    this.#stop();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "fields" || name === "labels") {
      const v = value === null ? null : obj(value);
      if (value !== null && !v) console.warn(`[nx-guard] el atributo "${name}" no es JSON válido`);
      else (this as unknown as Record<string, unknown>)[name] = v;
    } else if (name === "disabled" && this.disabled) this.reset();
  }

  // ---------------------------------------------------------------- interno

  #stop(): void {
    for (const name of this.#jobs.keys()) this.#cancel(name);
  }
  #cancel(name: string): void {
    const j = this.#jobs.get(name);
    clearTimeout(j?.timer);
    j?.ctrl.abort();
    this.#jobs.delete(name);
  }
  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(`nx-guard-${type}`, { detail, bubbles: true, composed: true, cancelable }));
  }

  #region(): HTMLSpanElement {
    if (!this.#live?.isConnected) this.append((this.#live = h("span", { class: "nx-guard__sr", role: "status" })));
    return this.#live!;
  }
  #say(text: string): void {
    const live = this.#region();
    // Mismo texto dos veces: se vacía antes para que se anuncie otra vez.
    live.textContent = "";
    live.textContent = text;
  }

  /** El campo vigilado de un evento: un control con `name` o un `<nx-number>` (no los propios). */
  #field(t: EventTarget | null): Field | null {
    const el = (t instanceof Element && (t.closest("nx-number") ?? t)) as Field;
    return el && nameOf(el) && this.contains(el) && (isNumber(el) || /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) && !SKIP.test((el as HTMLInputElement).type) ? el : null;
  }
  #controls(): Field[] {
    return [...this.querySelectorAll<Field>("[name]")].filter((el) => this.#field(el) === el);
  }

  /** La configuración de un campo: `fields[name]` y encima su `data-guard`. Sin nada, solo las fechas. */
  #rule(el: Field): GuardRule | null {
    const base = this.#fields[nameOf(el)];
    const own = obj<GuardRule>(el.dataset.guard);
    const type = (el as HTMLInputElement).type;
    if (!base && !own && type !== "date") return null;
    const r: GuardRule = { ...base, ...own };
    const t = Array.isArray(r.typical) ? r.typical : [];
    const hints = [t[0], t[1], r.min, r.max, r.expected, Array.isArray(r.history) ? r.history[r.history.length - 1] : null];
    const numeric = isNumber(el) || type === "number" || !!(r.format || r.expected || r.integer !== undefined || r.negative !== undefined) || hints.some((x) => typeof x === "number");
    const dateish = r.workdays || hints.some((x) => typeof x === "string" && /^([+-]?\d+[dwmy]|today|hoy|\d{4}-\d\d-\d\d)$/i.test(x.trim()));
    r.type ??= type === "date" || (!numeric && dateish) ? "date" : numeric ? "number" : "text";
    if (isNumber(el)) {
      const n = el as unknown as GuardRule;
      r.format ??= n.format;
      r.currency ??= n.currency;
    }
    if (r.expected !== undefined) r.expected = this.#expected(r.expected) ?? undefined;
    return r;
  }

  /** `expected`: un número, `"#id"` (el `value` o el texto de ese elemento) o `"@name"` (un campo del guard). */
  #expected(spec: unknown): number | null {
    if (typeof spec !== "string") return typeof spec === "number" ? spec : null;
    const locale = resolveLocale(this);
    const id = spec.trim().slice(1);
    const el: Field | null | undefined = spec[0] === "#" ? (this.ownerDocument.getElementById(id) as Field) : spec[0] === "@" ? this.#controls().find((c) => nameOf(c) === id) : null;
    if (!el) return spec[0] === "#" || spec[0] === "@" ? null : readAmount(spec, locale);
    const v = el.value;
    return typeof v === "number" ? v : readAmount(typeof v === "string" ? v : (el.textContent ?? ""), locale);
  }

  #read(el: Field, rule: GuardRule): Read {
    if (isNumber(el)) {
      const v = el.value as number | null;
      // Lo tecleado solo cuenta si todavía es este valor (un pegado o una cuenta no pasan por aquí).
      const raw = this.#raw.get(nameOf(el));
      return { value: v, raw: raw !== undefined && readAmount(raw, resolveLocale(this)) === v ? raw : undefined, key: keyOf(el) };
    }
    const key = keyOf(el);
    const num = rule.type === "number";
    return { value: !key ? null : num && (el as HTMLInputElement).type === "number" ? Number(key) : key, raw: num ? key : undefined, key };
  }

  /** Todos los hallazgos de un campo: lo del servidor (si es de este valor) primero. */
  #all(name: string, r: Result): GuardFinding[] {
    const j = this.#jobs.get(name);
    return [...(j?.key === r.key && j.found ? j.found : []), ...r.local];
  }

  /** Revisa un campo y pinta (o quita) su aviso. `say`: anunciarlo si es nuevo. */
  #run(el: Field, say: boolean): void {
    const name = nameOf(el);
    const rule = this.disabled ? null : this.#rule(el);
    if (!rule) {
      this.#results.delete(name);
      return this.#unmark(name);
    }
    const r = this.#read(el, rule);
    const local = r.value === null ? [] : guardCheck(r.value, rule, { locale: resolveLocale(this), raw: r.raw, labels: this.#labels }).map((f) => ({ ...f, field: name }));
    this.#results.set(name, { ...r, el, local });
    const url = r.value !== null && rule.remote !== false && safeEndpoint(this.endpoint);
    if (this.#jobs.get(name)?.key !== r.key) {
      this.#cancel(name);
      if (url) this.#ask(name, r, url);
    }
    this.#paint(name, say);
  }

  /** Le pregunta al servidor (tras una pausa); lo que llega tarde, de otro valor o con error, se ignora. */
  #ask(name: string, r: Read, url: string): void {
    const job: Job = { key: r.key, ctrl: new AbortController() };
    this.#jobs.set(name, job);
    job.timer = setTimeout(async () => {
      const stop = setTimeout(() => job.ctrl.abort(), TIMEOUT);
      try {
        const values: Record<string, unknown> = {};
        for (const el of this.#controls()) values[nameOf(el)] ??= isNumber(el) ? el.value : String(el.value ?? "");
        const res = await fetch(url, {
          method: "POST",
          signal: job.ctrl.signal,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ field: name, value: r.value, values }),
        });
        const data = res.ok ? ((await res.json()) as GuardRemoteResponse) : null;
        if (!data || this.#jobs.get(name) !== job) return;
        job.found = (Array.isArray(data.findings) ? data.findings : [])
          .filter((f) => typeof f?.message === "string" && f.message.trim() && (f.field ?? name) === name)
          .map((f) => ({
            kind: typeof f.kind === "string" ? f.kind : "remote",
            message: f.message,
            ...(typeof f.suggestion === "number" || typeof f.suggestion === "string" ? { suggestion: f.suggestion } : null),
            severity: f.severity === "info" ? "info" : "warn",
            field: name,
          }));
        if (this.#results.get(name)?.key === job.key) this.#paint(name, true);
      } catch {
        /* sin servidor, o lento: silencio */
      } finally {
        clearTimeout(stop);
      }
    }, DEBOUNCE);
  }

  /** Pinta el aviso de un campo: el primer hallazgo sin reconocer. El nodo se actualiza en su lugar. */
  #paint(name: string, say: boolean): void {
    const r = this.#results.get(name);
    const f = r && !this.#acked.get(name)?.has(r.key) ? this.#all(name, r)[0] : undefined;
    if (!f) this.#unmark(name);
    else {
      const L = this.#labels;
      const el = r!.el;
      let note = this.#notes.get(name);
      const fresh = note?.dataset.key !== r!.key || note.dataset.msg !== f.message;
      if (!note) this.#notes.set(name, (note = h("div", { class: "nx-guard__note", id: this.#uid + ++this.#seq, tabindex: "-1", "data-field": name })));
      // Junto al campo, sin mover nada del autor: después de su <label> si lo envuelve.
      const anchor = (!isNumber(el) && el.closest("label")) || el;
      if (note.previousElementSibling !== anchor) anchor.after(note);
      Object.assign(note.dataset, { key: r!.key, msg: f.message, severity: f.severity });
      const btn = (act: string, text: string) => h("button", { type: "button", "data-act": act }, text);
      const fix = f.suggestion !== undefined && btn("fix", fillText(L.fix, { value: this.#show(el, f.suggestion) }));
      note.replaceChildren(h("span", { class: "nx-guard__msg" }, f.message), h("span", { class: "nx-guard__acts" }, fix, btn("ack", L.ack)));
      describe(this.#focusable(el), note.id, true);
      el.setAttribute("data-nx-guard", f.severity);
      if (fresh) {
        if (say) this.#say(`${this.#labelOf(el)}: ${f.message}`);
        this.#emit("warn", { field: name, finding: f });
      }
    }
    this.#count();
  }

  /** Quita el aviso de un campo y su parte de `aria-describedby` (lo demás del autor queda). */
  #unmark(name: string): void {
    const note = this.#notes.get(name);
    const el = this.#results.get(name)?.el ?? this.#controls().find((c) => nameOf(c) === name);
    if (!note) return;
    this.#notes.delete(name);
    note.remove();
    if (!el) return;
    describe(this.#focusable(el), note.id, false);
    el.removeAttribute("data-nx-guard");
  }

  /** El control que recibe el foco (el <input> de adentro de un <nx-number>). */
  #focusable(el: Field): HTMLElement {
    return (isNumber(el) && el.querySelector("input")) || el;
  }

  /** La etiqueta de un campo, para lo que se anuncia: su `<label for>`, `aria-label`, `label` o `name`. */
  #labelOf(el: Field): string {
    const lab = (/^[\w-]+$/.test(el.id) && this.ownerDocument.querySelector(`label[for="${el.id}"]`)) || el.closest("label");
    return ((lab && lab.textContent!.trim()) || el.getAttribute("aria-label") || el.getAttribute("label") || nameOf(el)).replace(/[\s*:]+$/, "");
  }

  /** Un valor como se muestra: montos con su moneda, fechas del locale, números con separadores. */
  #show(el: Field, v: number | string): string {
    return showValue(v, this.#rule(el) ?? {}, nxFormat(resolveLocale(this)));
  }

  /**
   * «Corregir a …» (`fix`): pone el valor (con `input` y `change` para el framework; en un
   * `<nx-number>`, por su `value`) y vuelve al campo. «Está bien»: no vuelve a avisar por este valor
   * en este campo.
   */
  #decide(name: string, fix: boolean): void {
    const r = this.#results.get(name);
    const to = r && this.#all(name, r)[0]?.suggestion;
    if (!r || (fix && to === undefined)) return;
    const el = r.el;
    if (fix) {
      const fire = (t: string) => el.dispatchEvent(new Event(t, { bubbles: true, composed: true }));
      this.#writing = true;
      try {
        if (isNumber(el)) el.value = to;
        else {
          // Con el setter nativo: React y compañía vigilan `value` en la instancia.
          const input = el as HTMLInputElement;
          const text = typeof to === "number" && input.type !== "number" ? nxFormat(resolveLocale(this)).number(to) : String(to);
          Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")!.set!.call(input, text);
        }
        fire("input");
        fire("change");
        if (isNumber(el)) el.dispatchEvent(new CustomEvent("nx-change", { detail: { value: el.value, text: (el as unknown as { text: string }).text }, bubbles: true, composed: true }));
      } finally {
        this.#writing = false;
      }
      // Lo corregido no se vuelve a revisar: el aviso se quita y el campo queda con su valor nuevo.
      this.#raw.delete(name);
      this.#cancel(name);
      this.#results.set(name, { el, key: keyOf(el), value: isNumber(el) ? (el.value as number) : to!, local: [] });
    } else {
      if (!this.#acked.has(name)) this.#acked.set(name, new Set());
      this.#acked.get(name)!.add(r.key);
    }
    this.#paint(name, false);
    el.focus();
    this.#focusKey = keyOf(el);
    if (fix) this.#emit("fix", { field: name, from: r.value, to });
    else this.#emit("ack", { field: name, value: r.value });
  }

  /** `confirm`: el primer envío con avisos sin reconocer se detiene; con los mismos avisos, el siguiente pasa. */
  #submit(e: SubmitEvent): void {
    const form = e.target;
    if (this.disabled || this.mode !== "confirm" || !(form instanceof HTMLFormElement)) return;
    for (const el of this.#controls()) if (form.contains(el)) this.#run(el, false);
    const pending = this.findings.filter((f) => form.contains(this.#results.get(f.field!)!.el));
    const sigs = pending.map((f) => `${f.field}\n${this.#results.get(f.field!)!.key}`);
    if (sigs.every((s) => this.#blocked.has(s)) || !this.#emit("block", { findings: pending }, true)) {
      this.#blocked.clear();
      this.#line?.remove();
      this.#line = undefined;
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    for (const s of sigs) this.#blocked.add(s);
    // La línea va arriba del botón (de la fila del botón, si está en una).
    let at: Element | null = e.submitter ?? form.querySelector("[type=submit], button:not([type])");
    while (at && at.parentElement !== form) at = at.parentElement;
    this.#line ??= h("p", { class: "nx-guard__confirm" });
    if (at) at.before(this.#line);
    else form.append(this.#line);
    this.#count();
    this.#say(this.#line.textContent!);
    this.querySelector<HTMLElement>(".nx-guard__note")?.focus();
  }

  /** La línea de `confirm`, con la cuenta al día (y fuera cuando ya no queda nada). */
  #count(): void {
    if (!this.#line) return;
    const n = new Set(this.findings.map((f) => f.field)).size;
    if (n) this.#line.textContent = n === 1 ? this.#labels.confirmOne : fillText(this.#labels.confirm, { n });
    else {
      this.#line.remove();
      this.#line = undefined;
    }
  }
}
