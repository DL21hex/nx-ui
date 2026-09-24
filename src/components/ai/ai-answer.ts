/**
 * `<nx-ai-answer>`: preguntar y recibir una respuesta de IA que se ve pensar. Mientras trabaja
 * muestra los pasos del agente en vivo; al llegar el texto, lo escribe en streaming con citas que
 * iluminan su fuente; al terminar, los pasos se pliegan en un resumen («Razonó en 4 pasos · 4,0 s
 * · 3 fuentes») y quedan las acciones y 👍/👎.
 *
 * No sabe nada de modelos: consume el protocolo de `types.ts` desde `endpoint` (POST con
 * `{question, context}`), o desde la app con `begin()` / `push()` / `end()` si el transporte es
 * otro (WebSocket, SDK propio).
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { formatElapsed } from "../../core/format";
import { resolveLocale } from "../../core/locale";
import { glyph } from "../../core/icons";
import { lineData, readLines } from "../../core/stream";
import { parseAiEvent, parseBlocks, plainText, type Inline } from "./logic";
import type { AiEvent, AiLabels, AiStep, AiTone } from "./types";

export const AI_LABELS: AiLabels = {
  placeholder: "Pregúntale al sistema…",
  ask: "Preguntar",
  stop: "Detener",
  thought: "Razonó en",
  steps: "pasos",
  sources: "fuentes",
  useful: "Útil",
  notUseful: "No útil",
  error: "No se pudo responder",
  stopped: "Detenido",
  ready: "Respuesta lista",
};

const SPARK = '<path d="M9.94 14.06 5 19"/><path d="m14 4 1.27 3.73L19 9l-3.73 1.27L14 14l-1.27-3.73L9 9l3.73-1.27Z"/><path d="M5 3v4"/><path d="M3 5h4"/>';
const SEND = '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>';
const STOP = '<rect x="7" y="7" width="10" height="10" rx="1.5"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const CHEVRON = '<path d="m9 18 6-6-6-6"/>';
const UP = '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>';
const DOWN = '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>';
const PROPS = ["endpoint", "method", "question", "placeholder", "suggestions", "context", "labels", "feedback"] as const;

type State = "idle" | "working" | "streaming" | "done" | "error" | "stopped";
type Source = { id: string; title: string; detail?: string; href?: string };
type Action = Extract<AiEvent, { type: "action" }>;

export class NxAiAnswer extends Base {
  static observedAttributes = ["endpoint", "method", "question", "placeholder", "suggestions", "context", "labels", "feedback"];

  #labels: AiLabels = AI_LABELS;
  #suggestions: string[] = [];
  #context: unknown = null;
  #state: State = "idle";
  #question = "";
  #text = "";
  #steps: AiStep[] = [];
  #stepStart = new Map<string, number>();
  #sources: Source[] = [];
  #actions: Action[] = [];
  #notes: { label: string; tone: AiTone }[] = [];
  #errorMsg = "";
  #start = 0;
  #elapsed = 0;
  #traceOpen = false;
  #abort?: AbortController;
  #raf = 0;
  #built = false;
  #form?: HTMLFormElement;
  #input?: HTMLInputElement;
  #send?: HTMLButtonElement;
  #suggest?: HTMLDivElement;
  #body?: HTMLDivElement;
  #status?: HTMLSpanElement;
  // Secciones persistentes del cuerpo: se actualizan en su lugar. Volver a insertar un nodo
  // reinicia su animación de entrada, y con un repintado por frame los pasos quedaban invisibles.
  #summaryEl?: HTMLButtonElement;
  #traceEl?: HTMLOListElement;
  #stepEls = new Map<string, HTMLLIElement>();
  #skeletonEl?: HTMLDivElement;
  #answerEl?: HTMLDivElement;
  #errorEl?: HTMLParagraphElement;
  #stoppedEl?: HTMLParagraphElement;
  #sourcesEl?: HTMLOListElement;
  #actionsEl?: HTMLDivElement;
  #paintedSources = -1;
  #paintedActions = false;

  // ---------------------------------------------------------------- propiedades

  /** URL que responde en streaming: POST con `{question, context}`. */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    this.#attr("endpoint", v);
  }
  get method(): string {
    return (this.getAttribute("method") ?? "POST").toUpperCase();
  }
  set method(v: string) {
    this.#attr("method", v);
  }
  /** Pregunta inicial (se pone en la caja; con `endpoint`, el atributo la pregunta al conectar). */
  get question(): string {
    return this.#question || this.getAttribute("question") || "";
  }
  set question(v: string) {
    this.#attr("question", v);
  }
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? this.#labels.placeholder;
  }
  set placeholder(v: string) {
    this.#attr("placeholder", v);
  }
  /** Preguntas sugeridas antes de la primera pregunta. */
  get suggestions(): string[] {
    return this.#suggestions;
  }
  set suggestions(v: string[] | null | undefined) {
    this.#suggestions = Array.isArray(v) ? v.filter((s) => typeof s === "string" && s.trim()) : [];
    this.#paint();
  }
  /** Datos que viajan con cada pregunta (el registro que se está viendo, filtros…). JSON. */
  get context(): unknown {
    return this.#context;
  }
  set context(v: unknown) {
    this.#context = v ?? null;
  }
  get labels(): AiLabels {
    return this.#labels;
  }
  set labels(v: Partial<AiLabels> | null | undefined) {
    this.#labels = { ...AI_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }
  /** Muestra 👍/👎 al terminar (emite `nx-ai-feedback`). */
  get feedback(): boolean {
    return boolAttr(this, "feedback");
  }
  set feedback(v: boolean) {
    if (v) this.setAttribute("feedback", "");
    else this.removeAttribute("feedback");
  }
  get state(): State {
    return this.#state;
  }
  /** El texto de la respuesta, sin marcas. */
  get text(): string {
    return plainText(this.#text);
  }

  // ---------------------------------------------------------------- API

  /** Pregunta al `endpoint`. Devuelve cuando termina (bien, con error o detenida). */
  async ask(question?: string): Promise<void> {
    const q = (question ?? this.#input?.value ?? "").trim();
    const url = safeHref(this.endpoint);
    if (!q || !url) return;
    this.begin(q);
    const ctrl = (this.#abort = new AbortController());
    try {
      const res = await fetch(url, {
        method: this.method,
        signal: ctrl.signal,
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, text/event-stream" },
        body: this.method === "GET" ? undefined : JSON.stringify({ question: q, context: this.#context }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readLines(res, (line) => {
        const ev = parseAiEvent(lineData(line));
        if (ev) this.push(ev);
      });
      this.end();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      this.push({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Detiene la respuesta en curso; lo recibido hasta ahí se queda. */
  stop(): void {
    if (this.#state !== "working" && this.#state !== "streaming") return;
    this.#abort?.abort();
    this.#finish("stopped");
  }

  /** Empieza una respuesta nueva (transporte propio: después `push()` y `end()`). */
  begin(question: string): void {
    this.#abort?.abort();
    this.#question = question;
    this.#text = "";
    this.#steps = [];
    this.#stepStart.clear();
    this.#sources = [];
    this.#actions = [];
    this.#notes = [];
    this.#errorMsg = "";
    this.#traceOpen = false;
    this.#start = performance.now();
    this.#state = "working";
    this.#stepEls.clear();
    this.#traceEl?.replaceChildren();
    this.#paintedSources = -1;
    this.#paintedActions = false;
    if (this.#input) this.#input.value = question;
    this.dispatchEvent(new CustomEvent("nx-ai-start", { detail: { question }, bubbles: true, composed: true }));
    this.#paint();
  }

  /** Aplica un evento del protocolo. */
  push(ev: AiEvent): void {
    if (this.#state !== "working" && this.#state !== "streaming") return;
    switch (ev.type) {
      case "text":
        this.#text += ev.delta;
        this.#state = "streaming";
        break;
      case "step": {
        const now = performance.now();
        let s = this.#steps.find((x) => x.id === ev.id);
        if (!s) {
          s = { id: ev.id, label: ev.label ?? ev.id, status: ev.status };
          this.#steps.push(s);
          this.#stepStart.set(ev.id, now);
        }
        if (ev.label) s.label = ev.label;
        if (ev.detail) s.detail = ev.detail;
        s.status = ev.status;
        if (ev.status !== "run") s.ms = now - (this.#stepStart.get(ev.id) ?? now);
        if (this.#status && ev.status === "run") this.#status.textContent = s.label;
        break;
      }
      case "source":
        if (!this.#sources.some((x) => x.id === ev.id)) this.#sources.push({ id: ev.id, title: ev.title, detail: ev.detail, href: ev.href });
        break;
      case "action":
        this.#actions.push(ev);
        break;
      case "note":
        this.#notes.push({ label: ev.label, tone: ev.tone });
        break;
      case "error":
        this.#errorMsg = ev.message;
        this.#finish("error");
        return;
      case "done":
        this.end();
        return;
    }
    this.#schedule();
  }

  /** Termina la respuesta (lo hace solo al cerrarse el stream o con `{"type":"done"}`). */
  end(): void {
    if (this.#state === "working" || this.#state === "streaming") this.#finish("done");
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
    this.#abort?.abort();
    cancelAnimationFrame(this.#raf);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (value !== null && (name === "suggestions" || name === "context" || name === "labels")) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-ai-answer] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "question" && value && this.#input && this.#state === "idle") this.#input.value = value;
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #finish(status: "done" | "error" | "stopped"): void {
    this.#abort = undefined;
    this.#elapsed = performance.now() - this.#start;
    this.#state = status;
    // Un paso que seguía corriendo cuando todo terminó: terminó con la respuesta (o con el error).
    for (const s of this.#steps) {
      if (s.status === "run") {
        s.status = status === "error" ? "error" : "done";
        s.ms = performance.now() - (this.#stepStart.get(s.id) ?? this.#start);
      }
    }
    if (this.#status) this.#status.textContent = status === "done" ? this.#labels.ready : status === "error" ? this.#labels.error : this.#labels.stopped;
    this.#paint();
    this.dispatchEvent(
      new CustomEvent("nx-ai-done", { detail: { question: this.#question, text: this.text, sources: [...this.#sources], status }, bubbles: true, composed: true }),
    );
  }

  /** Muchos eventos por segundo: se pinta una vez por frame. */
  #schedule(): void {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      this.#paint();
    });
  }

  #build(): void {
    this.#built = true;
    this.#input = h("input", { type: "text", class: "nx-ai__input", autocomplete: "off", enterkeyhint: "send" });
    this.#send = h("button", { type: "submit", class: "nx-ai__send" });
    this.#form = h("form", { class: "nx-ai__ask", role: "search" }, glyph(SPARK, "nx-ai__spark"), this.#input, this.#send);
    this.#suggest = h("div", { class: "nx-ai__suggest" });
    this.#summaryEl = h("button", { type: "button", class: "nx-ai__summary", "data-toggle-trace": "", hidden: true });
    this.#traceEl = h("ol", { class: "nx-ai__trace", hidden: true });
    this.#skeletonEl = h("div", { class: "nx-ai__skeleton", "aria-hidden": "true", hidden: true }, h("span", null), h("span", null), h("span", null));
    this.#answerEl = h("div", { class: "nx-ai__answer", hidden: true });
    this.#errorEl = h("p", { class: "nx-ai__error", role: "alert", hidden: true });
    this.#stoppedEl = h("p", { class: "nx-ai__stopped", hidden: true });
    this.#sourcesEl = h("ol", { class: "nx-ai__sources", hidden: true });
    this.#actionsEl = h("div", { class: "nx-ai__actions", hidden: true });
    this.#body = h(
      "div",
      { class: "nx-ai__body", hidden: true },
      this.#summaryEl,
      this.#traceEl,
      this.#skeletonEl,
      this.#answerEl,
      this.#errorEl,
      this.#stoppedEl,
      this.#sourcesEl,
      this.#actionsEl,
    );
    this.#status = h("span", { class: "nx-sr-only", role: "status" });
    this.append(this.#form, this.#suggest, this.#body, this.#status);
    const q = this.getAttribute("question");
    if (q) this.#input.value = q;

    this.#form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.#state === "working" || this.#state === "streaming") this.stop();
      else void this.ask();
    });
    this.#suggest.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-q]");
      if (b) void this.ask(b.dataset.q);
    });
    this.#body.addEventListener("click", (e) => this.#onBodyClick(e));
    // La cita ilumina su fuente (y la fuente, sus citas).
    const hover = (e: Event, on: boolean) => {
      const id = (e.target as Element).closest<HTMLElement>("[data-cite]")?.dataset.cite;
      if (!id) return;
      for (const el of this.#body!.querySelectorAll<HTMLElement>(`[data-cite]`)) el.classList.toggle("is-lit", on && el.dataset.cite === id);
    };
    this.#body.addEventListener("pointerover", (e) => hover(e, true));
    this.#body.addEventListener("pointerout", (e) => hover(e, false));
    this.#body.addEventListener("focusin", (e) => hover(e, true));
    this.#body.addEventListener("focusout", (e) => hover(e, false));

    if (q && this.endpoint) queueMicrotask(() => void this.ask(q));
  }

  #onBodyClick(e: MouseEvent): void {
    const t = e.target as Element;
    if (t.closest("[data-toggle-trace]")) {
      this.#traceOpen = !this.#traceOpen;
      this.#paint();
      return;
    }
    const vote = t.closest<HTMLElement>("[data-vote]")?.dataset.vote as "up" | "down" | undefined;
    if (vote) {
      // Sin repintar: el botón conserva el foco.
      for (const b of this.#actionsEl!.querySelectorAll<HTMLElement>("[data-vote]")) b.setAttribute("aria-pressed", String(b.dataset.vote === vote));
      this.dispatchEvent(new CustomEvent("nx-ai-feedback", { detail: { value: vote, question: this.#question, text: this.text }, bubbles: true, composed: true }));
      return;
    }
    const act = t.closest<HTMLElement>("[data-action]");
    if (act) {
      const a = this.#actions[Number(act.dataset.action)];
      if (a) this.dispatchEvent(new CustomEvent("nx-ai-action", { detail: { id: a.id ?? "", label: a.label, data: a.data ?? null }, bubbles: true, composed: true }));
      return;
    }
    const cite = t.closest<HTMLElement>(".nx-ai__cite");
    if (cite) this.#body!.querySelector<HTMLElement>(`.nx-ai__source[data-cite="${CSS.escape(cite.dataset.cite ?? "")}"]`)?.focus();
  }

  #inline(parts: Inline[]): Node[] {
    return parts.map((p) => {
      if (p.t === "b") return h("strong", null, p.v);
      if (p.t === "code") return h("code", null, p.v);
      if (p.t === "cite") {
        const n = this.#sources.findIndex((s) => s.id === p.v);
        return h("sup", { class: "nx-ai__cite", "data-cite": p.v, title: this.#sources[n]?.title }, n >= 0 ? String(n + 1) : p.v);
      }
      return document.createTextNode(p.v);
    });
  }

  #paint(): void {
    if (!this.#built) return;
    const st = this.#state;
    const busy = st === "working" || st === "streaming";
    this.dataset.state = st;
    this.#input!.placeholder = this.placeholder;
    this.#input!.setAttribute("aria-label", this.placeholder);
    this.#send!.replaceChildren(glyph(busy ? STOP : SEND));
    this.#send!.setAttribute("aria-label", busy ? this.#labels.stop : this.#labels.ask);
    this.#send!.title = busy ? this.#labels.stop : this.#labels.ask;

    this.#suggest!.hidden = st !== "idle" || !this.#suggestions.length;
    if (!this.#suggest!.hidden) {
      this.#suggest!.replaceChildren(...this.#suggestions.map((s) => h("button", { type: "button", class: "nx-ai__chip", "data-q": s }, s)));
    }

    const body = this.#body!;
    body.hidden = st === "idle";
    if (st === "idle") return;

    // Pasos: en vivo mientras trabaja; al terminar, un resumen que los despliega.
    this.#paintSteps();
    const hasSteps = this.#steps.length > 0;
    this.#traceEl!.hidden = !hasSteps || (!busy && !this.#traceOpen);
    this.#summaryEl!.hidden = !hasSteps || busy;
    if (hasSteps && !busy) {
      const parts = [`${this.#labels.thought} ${this.#steps.length} ${this.#labels.steps}`, formatElapsed(this.#elapsed, resolveLocale(this))];
      if (this.#sources.length) parts.push(`${this.#sources.length} ${this.#labels.sources}`);
      this.#summaryEl!.setAttribute("aria-expanded", String(this.#traceOpen));
      this.#summaryEl!.replaceChildren(
        glyph(CHEVRON, "nx-ai__chev"),
        parts.join(" · "),
        ...this.#notes.map((n) => h("span", { class: `nx-ai__note nx-ai__note--${n.tone}` }, n.label)),
      );
    }

    // La respuesta: esqueleto hasta que llega el primer texto; después, el texto con cursor.
    this.#skeletonEl!.hidden = !(busy && !this.#text);
    this.#answerEl!.hidden = !this.#text;
    this.#answerEl!.setAttribute("aria-busy", String(busy));
    if (this.#text) {
      const blocks = parseBlocks(this.#text);
      this.#answerEl!.replaceChildren(
        ...blocks.map((b, i) => {
          const el = b.kind === "p" ? h("p", null, ...this.#inline(b.inl)) : h("ul", null, ...b.items.map((it) => h("li", null, ...this.#inline(it))));
          if (busy && i === blocks.length - 1) (b.kind === "p" ? el : el.lastElementChild!).append(h("span", { class: "nx-ai__cursor", "aria-hidden": "true" }));
          return el;
        }),
      );
    }

    this.#errorEl!.hidden = st !== "error";
    this.#errorEl!.textContent = this.#errorMsg ? `${this.#labels.error}: ${this.#errorMsg}` : this.#labels.error;
    this.#stoppedEl!.hidden = st !== "stopped";
    this.#stoppedEl!.textContent = this.#labels.stopped;

    // Fuentes (numeradas en el orden en que llegaron, como las citas): solo si cambiaron.
    this.#sourcesEl!.hidden = !this.#sources.length;
    if (this.#paintedSources !== this.#sources.length) {
      this.#paintedSources = this.#sources.length;
      this.#sourcesEl!.replaceChildren(
        ...this.#sources.map((s, i) => {
          const href = safeHref(s.href);
          const inner = [h("span", { class: "nx-ai__source-n" }, String(i + 1)), h("span", { class: "nx-ai__source-title" }, s.title), s.detail ? h("span", { class: "nx-ai__source-detail" }, s.detail) : null];
          return h("li", null, href ? h("a", { class: "nx-ai__source", href, "data-cite": s.id }, ...inner) : h("span", { class: "nx-ai__source", tabindex: "0", "data-cite": s.id }, ...inner));
        }),
      );
    }

    // Acciones y valoración: una vez, al terminar.
    const showActions = !busy && (this.#actions.length > 0 || (this.feedback && st === "done"));
    this.#actionsEl!.hidden = !showActions;
    if (showActions && !this.#paintedActions) {
      this.#paintedActions = true;
      this.#actionsEl!.replaceChildren(
        ...this.#actions.map((a, i) => {
          const href = safeHref(a.href);
          return href ? h("a", { class: "nx-ai__action", href }, a.label) : h("button", { type: "button", class: "nx-ai__action", "data-action": i }, a.label);
        }),
        this.feedback && st === "done"
          ? h(
              "span",
              { class: "nx-ai__vote" },
              h("button", { type: "button", "data-vote": "up", "aria-label": this.#labels.useful, title: this.#labels.useful, "aria-pressed": "false" }, glyph(UP)),
              h("button", { type: "button", "data-vote": "down", "aria-label": this.#labels.notUseful, title: this.#labels.notUseful, "aria-pressed": "false" }, glyph(DOWN)),
            )
          : "",
      );
    }
  }

  /** Cada paso es un <li> estable: se crea una vez (su animación de entrada corre una vez) y solo
   *  se vuelve a pintar por dentro cuando cambia su estado, detalle o duración. */
  #paintSteps(): void {
    for (const s of this.#steps) {
      let li = this.#stepEls.get(s.id);
      if (!li) {
        li = h("li", { class: "nx-ai__step" });
        this.#stepEls.set(s.id, li);
        this.#traceEl!.append(li);
      }
      const sig = `${s.status}|${s.label}|${s.detail ?? ""}|${s.ms === undefined ? "" : formatElapsed(s.ms, resolveLocale(this))}`;
      if (li.dataset.sig === sig) continue;
      li.dataset.sig = sig;
      li.className = `nx-ai__step nx-ai__step--${s.status}`;
      li.replaceChildren(
        s.status === "run" ? h("span", { class: "nx-spinner" }) : glyph(s.status === "done" ? CHECK : X),
        h("span", { class: "nx-ai__step-label" }, s.label),
        s.detail ? h("span", { class: "nx-ai__step-detail" }, s.detail) : "",
        s.ms !== undefined ? h("span", { class: "nx-ai__step-ms" }, formatElapsed(s.ms, resolveLocale(this))) : "",
      );
    }
  }
}
