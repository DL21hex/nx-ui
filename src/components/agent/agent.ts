/**
 * `<nx-agent>`: un agente que actúa, no solo responde. Conversa en varios turnos, muestra lo que
 * hace (pasos, herramientas, razonamiento), mueve la pantalla que la persona está viendo (filtra y
 * selecciona en la tabla de `for`), y antes de cambiar datos pide aprobación con el impacto a la
 * vista. Lo reversible se puede deshacer mientras corre el tiempo.
 *
 * Habla AG-UI (https://docs.ag-ui.com): POST de un `RunAgentInput` a `endpoint` y lectura de los
 * eventos en streaming. Cualquier backend AG-UI sirve (CopilotKit, Microsoft Agent Framework, AWS
 * Bedrock AgentCore, uno propio). La cabina son herramientas del navegador (`UI_TOOLS`,
 * `GRID_TOOLS`): el agente las llama, el componente las atiende y responde con un mensaje `tool`
 * en la corrida siguiente. Herramientas propias de la app: `tools` + el evento `nx-agent-tool`.
 *
 * Cada tramo de respuesta (pasos y texto) es un `<nx-ai-answer bare>`: el mismo pintado de la IA.
 */
import { URL_PROPS, hasComponent, render, type BduiNode } from "../../bdui";
import { Base } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { glyph } from "../../core/icons";
import { lineData, readLines } from "../../core/stream";
import type { NxAiAnswer } from "../ai/ai-answer";
import "../ai/index";
import type { NxButton } from "../button/button";
import "../button/index";
import type { GridFilter } from "../grid/types";
import { nxTour } from "../tour/tour";
import { GRID_TOOLS, UI_TOOLS, applyPatch, parseAguiEvent, parseArgs, parseShow, showProps, toolConfirm } from "./logic";
import type { AgentLabels, AgentToolDetail, AguiContext, AguiEvent, AguiMessage, AguiTool, AguiToolCall, RunAgentInput } from "./types";

export const AGENT_LABELS: AgentLabels = {
  heading: "Asistente",
  placeholder: "Pídele algo…",
  send: "Enviar",
  stop: "Detener",
  newThread: "Nueva conversación",
  working: "Trabajando…",
  approve: "Aprobar",
  reject: "Rechazar",
  approved: "Aprobado",
  rejected: "Rechazado",
  answer: "Responder",
  undo: "Deshacer",
  undone: "Deshecho",
  error: "No se pudo continuar",
  unavailable: "Esa herramienta no está disponible aquí",
  context: "Viendo",
  empty: "Pídele algo sobre lo que tienes en pantalla.",
  touring: "Te muestro en la pantalla",
  tour: {},
  cancelled: "Cancelado",
  confirmTool: "¿Ejecutar «{name}»?",
};

const SPARK = '<path d="M9.94 14.06 5 19"/><path d="m14 4 1.27 3.73L19 9l-3.73 1.27L14 14l-1.27-3.73L9 9l3.73-1.27Z"/><path d="M5 3v4"/><path d="M3 5h4"/>';
const SEND = '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>';
const STOP = '<rect x="7" y="7" width="10" height="10" rx="1.5"/>';
const PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const PROPS = ["endpoint", "tools", "context", "suggestions", "labels", "state", "show"] as const;
/** Cuánto espera un aviso con deshacer antes de dar la acción por buena. */
const UNDO_MS = 7000;

type Grid = HTMLElement & { filters: GridFilter[]; selected: string[]; count: number; columns: { key: string; label: string; type?: string; options?: { value: string; label?: string }[] }[] };

let uid = 0;
const id = (p: string) => `${p}-${Date.now().toString(36)}-${++uid}`;

export class NxAgent extends Base {
  static observedAttributes = ["endpoint", "for", "heading", "placeholder", "labels", "suggestions", "show"];

  #labels: AgentLabels = AGENT_LABELS;
  #tools: AguiTool[] = [];
  #context: AguiContext[] = [];
  #suggestions: string[] = [];
  #state: unknown = {};
  #threadId = id("thread");
  #messages: AguiMessage[] = [];
  #running = false;
  #abort?: AbortController;
  // La corrida actual.
  #asst: { id: string; content: string; toolCalls: AguiToolCall[] } | null = null;
  #calls = new Map<string, { name: string; args: string }>();
  #waiting = new Set<string>();
  #results: AguiMessage[] = [];
  #uiCalls = 0;
  #finished = false;
  /** La corrida vigente: los eventos y el cierre de una corrida anterior no la tocan. */
  #current = "";
  #built = false;
  /** Tarjetas que esperan a la persona (por id de la llamada): `stop()` las cancela. */
  #pending = new Map<string, () => void>();
  /** El texto del asistente en este turno: se anuncia una vez, al terminar. */
  #turnText = "";
  /** La tabla de `for` que se está escuchando, y cómo dejar de hacerlo. */
  #watched: { grid: HTMLElement; off: () => void } | null = null;
  // Nodos.
  #title?: HTMLElement;
  #ctx?: HTMLElement;
  #newBtn?: HTMLButtonElement;
  #thread?: HTMLDivElement;
  #empty?: HTMLDivElement;
  #form?: HTMLFormElement;
  #input?: HTMLTextAreaElement;
  #sendBtn?: HTMLButtonElement;
  #turn: HTMLElement | null = null;
  #seg: NxAiAnswer | null = null;
  #live?: HTMLSpanElement;

  // ---------------------------------------------------------------- propiedades

  /** URL del agente (AG-UI): POST de un `RunAgentInput`, responde con eventos en streaming. */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    this.#attr("endpoint", v);
  }
  /** Herramientas propias de la app (JSON Schema). Se atienden con `nx-agent-tool`. */
  get tools(): AguiTool[] {
    return this.#tools;
  }
  set tools(v: AguiTool[] | null | undefined) {
    this.#tools = Array.isArray(v) ? v.filter((t) => t && typeof t.name === "string") : [];
  }
  /**
   * Qué componentes BDUI puede mostrar el agente con `nx_show` («Trend, Grid»). Sin él, todos los
   * registrados. Las props con URL (`endpoint`, `action`, `source`…) nunca pasan.
   */
  get show(): string[] | null {
    return parseShow(this.getAttribute("show"));
  }
  set show(v: string[] | string | null | undefined) {
    const list = parseShow(v);
    this.#attr("show", list ? list.join(",") : null);
  }
  /** Contexto que viaja con cada corrida (`{description, value}`); la tabla de `for` se agrega sola. */
  get context(): AguiContext[] {
    return this.#context;
  }
  set context(v: AguiContext[] | null | undefined) {
    this.#context = Array.isArray(v) ? v.filter((c) => c && typeof c.description === "string").map((c) => ({ description: c.description, value: typeof c.value === "string" ? c.value : JSON.stringify(c.value) })) : [];
  }
  get suggestions(): string[] {
    return this.#suggestions;
  }
  set suggestions(v: string[] | null | undefined) {
    this.#suggestions = Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
    this.#paint();
  }
  /** Estado compartido con el agente (`STATE_SNAPSHOT` / `STATE_DELTA`). */
  get state(): unknown {
    return this.#state;
  }
  set state(v: unknown) {
    this.#state = v ?? {};
  }
  get messages(): AguiMessage[] {
    return [...this.#messages];
  }
  get threadId(): string {
    return this.#threadId;
  }
  get running(): boolean {
    return this.#running;
  }
  get labels(): AgentLabels {
    return this.#labels;
  }
  set labels(v: Partial<AgentLabels> | null | undefined) {
    const merged = mergeLabels(AGENT_LABELS, v);
    // `tour` es un objeto (los textos del recorrido): se toma aparte.
    const tour = v && typeof v === "object" && (v as { tour?: unknown }).tour;
    this.#labels = { ...merged, tour: tour && typeof tour === "object" ? (tour as AgentLabels["tour"]) : {} };
    this.#paint();
  }

  // ---------------------------------------------------------------- API

  /** Envía un mensaje de la persona y arranca una corrida. */
  send(text: string): void {
    const t = text.trim();
    if (!t || this.#running) return;
    this.#messages.push({ id: id("msg"), role: "user", content: t });
    this.#thread!.append(h("div", { class: "nx-agent__user" }, t));
    this.#turnText = "";
    this.#turn = h("div", { class: "nx-agent__turn" });
    this.#thread!.append(this.#turn);
    this.#scroll(true);
    void this.#run();
  }

  stop(): void {
    this.#abort?.abort();
    this.#current = "";
    // El mensaje del asistente ya entró al historial con sus llamadas: cada una necesita su
    // respuesta `tool`, o el modelo rechaza todo lo que siga en la conversación (HTTP 400).
    if (this.#finished && (this.#waiting.size || this.#results.length)) {
      this.#messages.push(...this.#results);
      for (const callId of this.#waiting) this.#messages.push({ id: id("tool"), role: "tool", toolCallId: callId, content: JSON.stringify({ cancelled: true }), error: "cancelled" });
    }
    this.#results = [];
    this.#waiting.clear();
    // Las tarjetas que esperaban quedan cerradas: ya no se puede aprobar algo que no se enviará.
    for (const cancel of this.#pending.values()) cancel();
    this.#pending.clear();
    this.#turn?.querySelectorAll<HTMLElement>(".nx-agent__card:not(.is-done)").forEach((c) => c.classList.add("is-done", "is-stopped"));
    this.#endSeg();
    this.#setRunning(false);
  }

  /** Conversación nueva (otro `threadId`). */
  reset(): void {
    this.stop();
    this.#messages = [];
    this.#threadId = id("thread");
    this.#thread!.replaceChildren();
    this.#turn = null;
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
    this.#watchTarget();
    this.#paint();
  }


  disconnectedCallback(): void {
    // Sacarlo de la página detiene la corrida (sin esto quedaba «Trabajando…» para siempre).
    if (this.#running) this.stop();
    else this.#abort?.abort();
    this.#watched?.off();
    this.#watched = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "show") return;
    if ((name === "labels" || name === "suggestions") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-agent] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "for" && this.#built) this.#watchTarget();
    this.#paint();
  }

  // ---------------------------------------------------------------- corrida AG-UI

  async #run(): Promise<void> {
    const url = safeEndpoint(this.endpoint);
    if (!url) return;
    // La corrida anterior (la que pidió las herramientas) suelta su conexión.
    this.#abort?.abort();
    this.#asst = null;
    this.#calls.clear();
    this.#waiting.clear();
    this.#results = [];
    this.#uiCalls = 0;
    this.#finished = false;
    this.#setRunning(true);
    const grid = this.#grid();
    const runId = (this.#current = id("run"));
    const input: RunAgentInput = {
      threadId: this.#threadId,
      runId,
      state: this.#state,
      messages: this.#messages,
      tools: [...this.#uiTools(), ...(grid ? GRID_TOOLS : []), ...this.#tools.map(({ name, description, parameters }) => ({ name, description, parameters }))],
      context: [...(grid ? [this.#gridContext(grid)] : []), ...this.#tourContext(), ...this.#context],
      forwardedProps: {},
    };
    // La app puede ajustar la entrada (contexto, props) justo antes de enviarla.
    this.dispatchEvent(new CustomEvent("nx-agent-send", { detail: { input }, bubbles: true, composed: true }));
    const ctrl = (this.#abort = new AbortController());
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream, application/x-ndjson" },
        credentials: "same-origin",
        body: JSON.stringify(input),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const live = () => !ctrl.signal.aborted && this.#current === runId;
      await readLines(res, (line) => {
        if (!live()) return false;
        const ev = parseAguiEvent(lineData(line));
        if (ev) this.#on(ev);
        // `RUN_FINISHED`: la corrida terminó aunque el servidor no cierre; se suelta la conexión.
        return live() && !this.#finished;
      });
      if (live()) this.#finishRun();
    } catch (err) {
      if (ctrl.signal.aborted || this.#current !== runId) return;
      ctrl.abort();
      this.#seg ?? this.#segment();
      this.#seg!.push({ type: "error", message: `${this.#labels.error}: ${err instanceof Error ? err.message : String(err)}` });
      this.#seg = null;
      this.#setRunning(false);
    }
  }

  #on(ev: AguiEvent): void {
    this.dispatchEvent(new CustomEvent("nx-agent-event", { detail: ev, bubbles: true, composed: true }));
    switch (ev.type) {
      case "RUN_STARTED":
        if (ev.threadId) this.#threadId = ev.threadId;
        break;
      case "STEP_STARTED":
      case "STEP_FINISHED":
        this.#segment().push({ type: "step", id: ev.stepName, label: ev.stepName, status: ev.type === "STEP_STARTED" ? "run" : "done" });
        break;
      case "REASONING_START":
      case "REASONING_END":
        this.#segment().push({ type: "step", id: `reasoning-${ev.messageId ?? ""}`, label: "Razonando", status: ev.type === "REASONING_START" ? "run" : "done" });
        break;
      case "TEXT_MESSAGE_START":
        this.#assistant();
        break;
      case "TEXT_MESSAGE_CONTENT":
      case "TEXT_MESSAGE_CHUNK":
        if (!ev.delta) break;
        this.#assistant().content += ev.delta;
        this.#turnText += ev.delta;
        this.#segment().push({ type: "text", delta: ev.delta });
        this.#scroll();
        break;
      case "TOOL_CALL_START": {
        this.#calls.set(ev.toolCallId, { name: ev.toolCallName, args: "" });
        // Herramientas del backend: se ven como un paso («Consultando la nómina…»).
        if (!this.#isUiTool(ev.toolCallName)) this.#segment().push({ type: "step", id: ev.toolCallId, label: String(ev.metadata?.label ?? ev.toolCallName), status: "run" });
        break;
      }
      case "TOOL_CALL_ARGS": {
        const c = this.#calls.get(ev.toolCallId);
        if (c) c.args += ev.delta;
        break;
      }
      case "TOOL_CALL_END": {
        const c = this.#calls.get(ev.toolCallId);
        if (!c) break;
        this.#assistant().toolCalls.push({ id: ev.toolCallId, type: "function", function: { name: c.name, arguments: c.args || "{}" } });
        if (this.#isUiTool(c.name)) {
          this.#uiCalls++;
          this.#waiting.add(ev.toolCallId);
          this.#execute(ev.toolCallId, c.name, parseArgs(c.args));
        }
        break;
      }
      case "TOOL_CALL_RESULT":
        // Herramienta del backend: su resultado va al historial (los modelos exigen cada respuesta).
        this.#seg?.push({ type: "step", id: ev.toolCallId, status: "done" });
        this.#results.push({ id: (ev as { messageId?: string }).messageId ?? id("tool"), role: "tool", toolCallId: ev.toolCallId, content: typeof ev.content === "string" ? ev.content : JSON.stringify(ev.content) });
        break;
      case "STATE_SNAPSHOT":
        this.#state = ev.snapshot ?? {};
        this.#emitState();
        break;
      case "STATE_DELTA":
        this.#state = applyPatch(this.#state, ev.delta);
        this.#emitState();
        break;
      case "RUN_ERROR":
        this.#segment().push({ type: "error", message: ev.message });
        this.#seg = null;
        break;
      case "RUN_FINISHED":
        this.#finishRun();
        break;
      case "CUSTOM":
        this.dispatchEvent(new CustomEvent("nx-agent-custom", { detail: { name: ev.name, value: ev.value }, bubbles: true, composed: true }));
        break;
    }
  }

  /** Fin de la corrida: el mensaje del asistente entra al historial; si pidió herramientas del
   *  navegador, la conversación sigue cuando todas tengan respuesta. */
  #finishRun(): void {
    if (this.#finished) return;
    this.#finished = true;
    this.#endSeg();
    if (this.#asst) {
      const a = this.#asst;
      this.#messages.push({ id: a.id, role: "assistant", ...(a.content ? { content: a.content } : {}), ...(a.toolCalls.length ? { toolCalls: a.toolCalls } : {}) });
    }
    this.#continue();
  }

  #continue(): void {
    if (!this.#finished || this.#waiting.size) return;
    this.#messages.push(...this.#results);
    this.#results = [];
    if (this.#uiCalls && this.#running) void this.#run();
    else this.#setRunning(false);
  }

  #respond(callId: string, content: unknown, error?: string): void {
    if (!this.#waiting.delete(callId)) return;
    this.#results.push({ id: id("tool"), role: "tool", toolCallId: callId, content: typeof content === "string" ? content : JSON.stringify(content ?? null), ...(error ? { error } : {}) });
    this.#continue();
  }

  // ---------------------------------------------------------------- herramientas del navegador

  #isUiTool(name: string): boolean {
    return [...UI_TOOLS, ...(this.#grid() ? GRID_TOOLS : []), ...this.#tools].some((t) => t.name === name);
  }

  /** Las herramientas de la cabina; `nx_show` dice qué componentes puede mostrar (si `show` los limita). */
  #uiTools(): AguiTool[] {
    const allowed = this.show;
    if (!allowed) return UI_TOOLS;
    return UI_TOOLS.flatMap((t) => (t.name !== "nx_show" ? [t] : allowed.length ? [{ ...t, description: `${t.description} Componentes: ${allowed.join(", ")}.` }] : []));
  }

  /** Si el modelo puede mostrar ese componente: registrado y, con `show`, en la lista. */
  #canShow(component: string): boolean {
    const allowed = this.show;
    return hasComponent(component) && (!allowed || allowed.includes(component));
  }

  /** Lo que se puede señalar con `nx_tour`: los `[data-tour]` visibles de la página, con su nombre. */
  #tourContext(): AguiContext[] {
    const marks = [...document.querySelectorAll<HTMLElement>("[data-tour]")].filter((el) => el.getClientRects().length);
    if (!marks.length) return [];
    const name = (el: HTMLElement) => (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
    return [{ description: "Elementos de la pantalla que nx_tour puede señalar (target → qué es)", value: JSON.stringify(marks.map((el) => ({ target: `[data-tour="${el.dataset.tour}"]`, name: name(el) }))) }];
  }

  #execute(callId: string, name: string, args: Record<string, unknown>): void {
    this.#endSeg();
    const L = this.#labels;
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    const reply = (content: unknown, error?: string) => this.#respond(callId, content, error);
    const grid = this.#grid();
    switch (name) {
      case "nx_confirm":
        return this.#confirmCard(callId, args, reply);
      case "nx_ask":
        return this.#askCard(callId, args, reply);
      case "nx_notify":
        return this.#notify(callId, args, reply);
      case "nx_tour": {
        const steps = Array.isArray(args.steps) ? (args.steps as { title?: unknown }[]) : [];
        if (!steps.length) return reply(null, L.unavailable);
        this.#line(`${L.touring} · ${steps.length} ${steps.length === 1 ? "paso" : "pasos"}`);
        void nxTour(steps as never, L.tour).then((r) => reply(r));
        return;
      }
      case "nx_show": {
        const component = s(args.component);
        if (!this.#canShow(component)) return reply({ shown: false }, L.unavailable);
        const box = h("div", { class: "nx-agent__card nx-agent__show is-done" });
        this.#turn!.append(box);
        const out = render({ component, props: showProps(args.props, URL_PROPS) } as BduiNode, box);
        if (!out.length) box.remove();
        this.#scroll();
        return reply(out.length ? { shown: true } : { shown: false }, out.length ? undefined : L.unavailable);
      }
      case "nx_grid_filter":
        if (!grid) return reply(null, L.unavailable);
        grid.filters = Array.isArray(args.filters) ? (args.filters as GridFilter[]) : [];
        this.#line(`${grid.filters.length ? "Filtré" : "Quité los filtros de"} la tabla · ${grid.count} ${grid.count === 1 ? "fila" : "filas"}`);
        this.#paintContext();
        return reply({ rows: grid.count, filters: grid.filters });
      case "nx_grid_select":
        if (!grid) return reply(null, L.unavailable);
        grid.selected = Array.isArray(args.ids) ? (args.ids as unknown[]).map(String) : [];
        this.#line(`Seleccioné ${grid.selected.length} ${grid.selected.length === 1 ? "fila" : "filas"}`);
        this.#paintContext();
        return reply({ selected: grid.selected.length });
    }
    // Herramienta de la app: la atiende quien escuche `nx-agent-tool` (y llame a `respond`).
    const dispatch = () => {
      const detail: AgentToolDetail = { id: callId, name, args, respond: reply };
      const handled = !this.dispatchEvent(new CustomEvent("nx-agent-tool", { detail, bubbles: true, composed: true, cancelable: true }));
      if (!handled) reply(null, L.unavailable);
    };
    // Con `confirm`, la aprobación la pide el componente, no el modelo: una instrucción inyectada
    // no puede saltársela. Rechazada, el modelo recibe `{declined: true}`.
    const tool = this.#tools.find((t) => t.name === name);
    const confirm = tool ? toolConfirm(tool.confirm) : null;
    if (!confirm) return dispatch();
    this.#confirmCard(
      callId,
      { title: confirm.title ?? L.confirmTool.replace("{name}", name), detail: confirm.detail ?? tool!.description, tone: confirm.tone },
      (r) => (r.approved ? dispatch() : reply({ declined: true })),
    );
  }

  /** Una línea de lo que el agente hizo en la pantalla («Filtré la tabla · 5 filas»). */
  #line(text: string): void {
    this.#turn!.append(h("div", { class: "nx-agent__did" }, glyph(CHECK), h("span", null, text)));
    this.#scroll();
  }

  #card(title: string, detail?: string): HTMLDivElement {
    const card = h("div", { class: "nx-agent__card" }, h("p", { class: "nx-agent__card-title" }, title), detail ? h("p", { class: "nx-agent__card-detail" }, detail) : null);
    this.#turn!.append(card);
    this.#scroll(true);
    return card;
  }

  /** Cierra una tarjeta que ya no espera respuesta (se detuvo la corrida): sin botones, «Cancelado». */
  #cancelCard(card: HTMLElement, ...controls: (Element | null | undefined)[]): void {
    for (const c of controls) c?.remove();
    card.append(h("p", { class: "nx-agent__verdict" }, this.#labels.cancelled));
    card.classList.add("is-done", "is-stopped");
  }

  #confirmCard(callId: string, args: Record<string, unknown>, reply: (c: { approved: boolean }) => void): void {
    const L = this.#labels;
    const danger = args.tone === "danger";
    const card = this.#card(String(args.title ?? ""), typeof args.detail === "string" ? args.detail : undefined);
    card.dataset.tone = danger ? "danger" : "primary";
    const items = Array.isArray(args.impact) ? (args.impact as Record<string, unknown>[]).filter((x) => x && typeof x.label === "string") : [];
    if (items.length)
      card.append(
        h(
          "ul",
          { class: "nx-agent__impact" },
          ...items.map((it) => h("li", { "data-tone": typeof it.tone === "string" ? it.tone : "neutral" }, h("span", null, String(it.label)), typeof it.detail === "string" ? h("span", null, it.detail) : null)),
        ),
      );
    const no = h("nx-button", { label: L.reject, variant: "ghost", "log-mode": "none" }) as NxButton;
    const yes = h("nx-button", { label: typeof args.confirmLabel === "string" && args.confirmLabel ? args.confirmLabel : L.approve, variant: danger ? "danger" : "primary", "log-mode": "none", hold: danger ? "1000" : null }) as NxButton;
    const bar = h("div", { class: "nx-agent__card-actions" }, no, yes);
    card.append(bar);
    const decide = (approved: boolean) => {
      if (!this.#pending.delete(callId)) return;
      bar.replaceChildren(h("span", { class: `nx-agent__verdict${approved ? " is-yes" : ""}` }, approved ? L.approved : L.rejected));
      card.classList.add("is-done");
      reply({ approved });
    };
    this.#pending.set(callId, () => this.#cancelCard(card, bar));
    no.addEventListener("click", () => decide(false));
    yes.addEventListener("click", () => decide(true));
    requestAnimationFrame(() => (danger ? no : yes).querySelector("button")?.focus({ preventScroll: true }));
  }

  #askCard(callId: string, args: Record<string, unknown>, reply: (c: unknown) => void): void {
    const L = this.#labels;
    const card = this.#card(String(args.question ?? ""));
    const options = Array.isArray(args.options) ? (args.options as unknown[]).filter((o): o is string => typeof o === "string") : [];
    this.#pending.set(callId, () => this.#cancelCard(card, card.querySelector(".nx-agent__options"), card.querySelector("form")));
    const done = (answer: string) => {
      if (!this.#pending.delete(callId)) return;
      card.querySelector(".nx-agent__options")?.remove();
      card.querySelector("form")?.remove();
      card.append(h("p", { class: "nx-agent__reply" }, answer));
      card.classList.add("is-done");
      reply({ answer });
    };
    if (options.length) {
      const row = h("div", { class: "nx-agent__options" }, ...options.map((o) => h("button", { type: "button", class: "nx-agent__option" }, o)));
      row.addEventListener("click", (e) => {
        const b = (e.target as Element).closest("button");
        if (b) done(b.textContent ?? "");
      });
      card.append(row);
    }
    if (!options.length || typeof args.placeholder === "string") {
      const input = h("input", { class: "nx-agent__field", placeholder: typeof args.placeholder === "string" ? args.placeholder : "", "aria-label": String(args.question ?? "") });
      const form = h("form", { class: "nx-agent__ask" }, input, h("button", { type: "submit", class: "nx-agent__option" }, L.answer));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (input.value.trim()) done(input.value.trim());
      });
      card.append(form);
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
  }

  /** Un resultado; con `undo`, se da por bueno solo si nadie lo deshace a tiempo. */
  #notify(callId: string, args: Record<string, unknown>, reply: (c: unknown) => void): void {
    const L = this.#labels;
    const tone = typeof args.tone === "string" ? args.tone : "success";
    const el = h("div", { class: "nx-agent__notice", "data-tone": tone }, h("span", null, String(args.message ?? "")));
    this.#turn!.append(el);
    this.#scroll();
    if (args.undo !== true) return reply({ undone: false });
    const btn = h("button", { type: "button", class: "nx-agent__undo" }, L.undo);
    const ring = h("span", { class: "nx-agent__ring", "aria-hidden": "true" });
    ring.style.setProperty("--_dur", `${UNDO_MS}ms`);
    el.append(btn, ring);
    let over = false;
    const end = (undone: boolean) => {
      if (over) return;
      over = true;
      this.#pending.delete(callId);
      clearTimeout(timer);
      btn.remove();
      ring.remove();
      if (undone) {
        el.dataset.tone = "neutral";
        el.firstElementChild!.textContent = L.undone;
      }
      reply({ undone });
    };
    const timer = setTimeout(() => end(false), UNDO_MS);
    btn.addEventListener("click", () => end(true));
    // Detenida la corrida, el aviso se cierra sin dar la acción por buena (se responde `cancelled`).
    this.#pending.set(callId, () => {
      over = true;
      clearTimeout(timer);
      btn.remove();
      ring.remove();
    });
  }

  // ---------------------------------------------------------------- la tabla de `for`

  #grid(): Grid | null {
    const target = this.getAttribute("for");
    const el = target ? document.getElementById(target) : null;
    return el && el.localName === "nx-grid" ? (el as Grid) : null;
  }

  /** Lo que el agente necesita saber de la tabla: columnas, filtros, selección y cuántas filas. */
  #gridContext(g: Grid): AguiContext {
    const columns = g.columns.map((c) => ({ key: c.key, label: c.label, type: c.type ?? "text", ...(c.options ? { options: c.options.map((o) => o.value) } : {}) }));
    return { description: "La tabla que la persona está viendo (nx-grid). Se maneja con nx_grid_filter y nx_grid_select.", value: JSON.stringify({ columns, filters: g.filters, selected: g.selected.slice(0, 200), rows: g.count }) };
  }

  /** Escucha la tabla de `for` (y deja de escuchar la anterior): un agente que se vuelve a montar,
   *  o que cambia de tabla, sigue al día. */
  #watchTarget(): void {
    const g = this.#grid();
    if (this.#watched?.grid === g) return;
    this.#watched?.off();
    this.#watched = null;
    if (!g) return;
    const on = () => this.#paintContext();
    const types = ["nx-grid-filter", "nx-grid-selection"];
    for (const t of types) g.addEventListener(t, on);
    this.#watched = { grid: g, off: () => types.forEach((t) => g.removeEventListener(t, on)) };
  }

  // ---------------------------------------------------------------- pintar

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #build(): void {
    this.#built = true;
    this.#title = h("strong", { class: "nx-agent__title" });
    this.#ctx = h("span", { class: "nx-agent__ctx" });
    this.#newBtn = h("button", { type: "button", class: "nx-agent__icon" }, glyph(PLUS));
    this.#newBtn.addEventListener("click", () => this.reset());
    const head = h("div", { class: "nx-agent__head" }, glyph(SPARK, "nx-agent__spark"), this.#title, this.#ctx, this.#newBtn);
    this.#empty = h("div", { class: "nx-agent__empty" });
    this.#empty.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-q]");
      if (b) this.send(b.dataset.q!);
    });
    // Sin `role="log"` ni `aria-live`: la respuesta se escribe token a token y el lector de pantalla
    // la releía entera en cada frame. Mientras corre, `aria-busy`; al terminar, el texto se anuncia
    // una vez por `#live`.
    this.#thread = h("div", { class: "nx-agent__thread" });
    this.#input = h("textarea", { class: "nx-agent__input", rows: 1 });
    this.#sendBtn = h("button", { type: "submit", class: "nx-agent__send" });
    this.#form = h("form", { class: "nx-agent__composer" }, this.#input, this.#sendBtn);
    this.#live = h("span", { class: "nx-sr-only", role: "status" });
    this.append(head, this.#empty, this.#thread, this.#form, this.#live);

    this.#form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.#running) return this.stop();
      const t = this.#input!.value;
      this.#input!.value = "";
      this.#grow();
      this.send(t);
    });
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.#form!.requestSubmit();
      }
    });
    this.#input.addEventListener("input", () => this.#grow());
  }

  #grow(): void {
    const i = this.#input!;
    i.style.height = "auto";
    i.style.height = `${Math.min(i.scrollHeight, 160)}px`;
  }

  #setRunning(on: boolean): void {
    const was = this.#running;
    this.#running = on;
    this.toggleAttribute("data-running", on);
    this.#thread?.setAttribute("aria-busy", String(on));
    if (!on) this.#abort = undefined;
    this.#paint();
    if (!this.#live) return;
    if (on) this.#live.textContent = "";
    else if (was) this.#live.textContent = this.#turnText.replace(/\[\^[\w-]+\]/g, "").replace(/\*\*|`/g, "").trim();
  }

  #segment(): NxAiAnswer {
    if (!this.#seg) {
      this.#turn ??= this.#thread!.appendChild(h("div", { class: "nx-agent__turn" }));
      this.#seg = h("nx-ai-answer", { bare: "", class: "nx-agent__answer" }) as NxAiAnswer;
      this.#turn.append(this.#seg);
      this.#seg.begin("");
    }
    return this.#seg;
  }

  /** Cierra el tramo de respuesta actual (el que venga después va debajo de la tarjeta). */
  #endSeg(): void {
    const s = this.#seg;
    if (!s) return;
    this.#seg = null;
    s.end();
    if (!s.text && !s.querySelector(".nx-ai__trace li, .nx-ai__error:not([hidden])")) s.remove();
  }

  #assistant() {
    return (this.#asst ??= { id: id("msg"), content: "", toolCalls: [] });
  }

  #emitState(): void {
    this.dispatchEvent(new CustomEvent("nx-agent-state", { detail: { state: this.#state }, bubbles: true, composed: true }));
  }

  #scroll(force = false): void {
    const t = this.#thread!;
    if (force || t.scrollHeight - t.scrollTop - t.clientHeight < 120) requestAnimationFrame(() => (t.scrollTop = t.scrollHeight));
  }

  #paintContext(): void {
    const g = this.#grid();
    if (!this.#ctx) return;
    this.#ctx.hidden = !g;
    if (!g) return;
    const parts = [`${g.count} ${g.count === 1 ? "fila" : "filas"}`];
    if (g.filters.length) parts.push(`${g.filters.length} ${g.filters.length === 1 ? "filtro" : "filtros"}`);
    if (g.selected.length) parts.push(`${g.selected.length} ${g.selected.length === 1 ? "seleccionada" : "seleccionadas"}`);
    this.#ctx.textContent = `${this.#labels.context}: ${parts.join(" · ")}`;
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    this.#title!.textContent = this.getAttribute("heading") || L.heading;
    this.#newBtn!.setAttribute("aria-label", L.newThread);
    this.#newBtn!.title = L.newThread;
    this.#input!.placeholder = this.#running ? L.working : this.getAttribute("placeholder") || L.placeholder;
    this.#input!.setAttribute("aria-label", this.getAttribute("placeholder") || L.placeholder);
    this.#sendBtn!.replaceChildren(glyph(this.#running ? STOP : SEND));
    this.#sendBtn!.setAttribute("aria-label", this.#running ? L.stop : L.send);
    const empty = !this.#messages.length;
    this.#empty!.hidden = !empty;
    if (empty)
      this.#empty!.replaceChildren(
        h("p", null, L.empty),
        ...(this.#suggestions.length ? [h("div", { class: "nx-agent__options" }, ...this.#suggestions.map((q) => h("button", { type: "button", class: "nx-agent__option", "data-q": q }, q)))] : []),
      );
    this.#paintContext();
  }
}
