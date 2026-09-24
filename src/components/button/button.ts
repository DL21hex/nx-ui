/**
 * `<nx-button>`: un botón que sabe esperar. Mientras corre una tarea se bloquea, muestra un
 * spinner, el último mensaje deslizándose dentro del botón (ticker), el tiempo transcurrido y una
 * barra de progreso; debajo puede desplegar un registro tipo terminal.
 *
 * Dos fuentes de mensajes, las dos serializables o fuera de las props:
 * - **JS**: `btn.run(async ({ log, progress }) => …)`, o `busy` / `log()` / `done()` a mano.
 *   `log-mode` decide dónde se ve: `ticker` (en el botón), `inline` (registro debajo) o `none`.
 * - **Backend (BDUI)**: `stream="/url"`. Al hacer clic se pide la URL y cada línea de la
 *   respuesta (NDJSON o `data:` de SSE) se pinta: `{"msg":"Subiendo…","progress":0.4}`.
 *
 * Todo lo pinta el componente desde sus props (`label`, `icon`…): no hay hijos del autor que
 * mover, así que no rompe la hidratación. Por dentro hay un `<button>` nativo: foco, teclado y
 * envío de formularios funcionan solos.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph, icon } from "../../core/icons";
import { formatElapsed } from "../../core/format";
import { resolveLocale } from "../../core/locale";
import { readLines } from "../../core/stream";
import { normalizeProgress, parseStreamLine } from "./logic";
import type { ButtonLabels, LogLevel, LogLine, LogMode, RunContext, StreamEvent } from "./types";

export const BUTTON_LABELS: ButtonLabels = {
  busy: "Procesando…",
  done: "Listo",
  failed: "Falló",
  log: "Registro",
  hold: "Mantén pulsado para confirmar",
};

const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const ALERT = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const TERMINAL = '<path d="m4 17 6-6-6-6"/><path d="M12 19h8"/>';
/** Cuánto se queda a la vista el resultado antes de volver a la etiqueta. */
const RESULT_MS = { ok: 2200, error: 4000 };
const MAX_LINES = 200;
const PROPS = ["label", "icon", "variant", "type", "disabled", "busy", "logMode", "progress", "stream", "method", "labels", "hold"] as const;

export class NxButton extends Base {
  static observedAttributes = ["label", "icon", "variant", "type", "disabled", "busy", "log-mode", "progress", "stream", "method", "labels", "hold"];

  #labels: ButtonLabels = BUTTON_LABELS;
  #lines: LogLine[] = [];
  #start = 0;
  #result: { ok: boolean; msg: string } | null = null;
  #resultTimer = 0;
  #tick = 0;
  #logOpen: boolean | null = null;
  #built = false;
  #btn?: HTMLButtonElement;
  #lead?: HTMLSpanElement;
  #text?: HTMLSpanElement;
  #time?: HTMLSpanElement;
  #bar?: HTMLSpanElement;
  #toggle?: HTMLButtonElement;
  #panel?: HTMLDivElement;
  #status?: HTMLSpanElement;
  #fill?: HTMLSpanElement;
  #holdTimer = 0;
  #held = false;

  // ---------------------------------------------------------------- propiedades

  get label(): string {
    return this.getAttribute("label") ?? "";
  }
  set label(v: string) {
    this.setAttribute("label", v ?? "");
  }
  get icon(): string | null {
    return this.getAttribute("icon");
  }
  set icon(v: string | null) {
    this.#attr("icon", v);
  }
  get variant(): string {
    return this.getAttribute("variant") ?? "secondary";
  }
  set variant(v: string) {
    this.#attr("variant", v);
  }
  get type(): string {
    return this.getAttribute("type") === "submit" ? "submit" : "button";
  }
  set type(v: string) {
    this.#attr("type", v);
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    this.#bool("disabled", v);
  }
  /** Ocupado: bloqueado, con spinner. Al pasar a `true` empieza un registro nuevo. */
  get busy(): boolean {
    return boolAttr(this, "busy");
  }
  set busy(v: boolean) {
    this.#bool("busy", v);
  }
  get logMode(): LogMode {
    const v = this.getAttribute("log-mode");
    return v === "inline" || v === "none" ? v : "ticker";
  }
  set logMode(v: LogMode) {
    this.#attr("log-mode", v);
  }
  /** 0–1, o `null` para una barra indeterminada. */
  get progress(): number | null {
    return normalizeProgress(Number(this.getAttribute("progress") ?? Number.NaN));
  }
  set progress(v: number | null) {
    const p = normalizeProgress(v);
    this.#attr("progress", p === null ? null : String(p));
  }
  /** URL que transmite el avance (NDJSON o SSE). Con ella, el clic corre la tarea solo. */
  get stream(): string | null {
    return this.getAttribute("stream");
  }
  set stream(v: string | null) {
    this.#attr("stream", v);
  }
  get method(): string {
    return (this.getAttribute("method") ?? "POST").toUpperCase();
  }
  set method(v: string) {
    this.#attr("method", v);
  }
  get labels(): ButtonLabels {
    return this.#labels;
  }
  set labels(v: Partial<ButtonLabels> | null | undefined) {
    this.#labels = { ...BUTTON_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }
  /** Mantener pulsado (ms) para activarlo: para lo destructivo, en vez de «¿Está seguro?».
   *  `hold` sin valor = 1000 ms. Con teclado, mantener Enter o Espacio. */
  get hold(): number {
    const v = this.getAttribute("hold");
    if (v === null) return 0;
    const n = Number(v);
    return v === "" || !Number.isFinite(n) ? 1000 : Math.max(0, n);
  }
  set hold(v: number) {
    this.#attr("hold", v ? String(v) : null);
  }
  /** Copia del registro de la última tarea. */
  get lines(): LogLine[] {
    return [...this.#lines];
  }

  // ---------------------------------------------------------------- API de tareas

  /** Añade una línea al registro (y arranca la tarea si no estaba ocupado). La anterior queda
   *  como terminada (✓) salvo que fuera un error. */
  log(msg: string, level: LogLevel = "info"): void {
    if (!msg) return;
    if (!this.busy) this.busy = true;
    this.#lines.push({ t: performance.now() - this.#start, msg, level });
    if (this.#lines.length > MAX_LINES) this.#lines.splice(0, this.#lines.length - MAX_LINES);
    if (this.#status) this.#status.textContent = msg;
    this.#paint(true);
  }

  /** Termina la tarea: muestra el resultado un momento y emite `nx-done`. */
  done(ok = true, msg?: string): void {
    if (!this.busy) return;
    const ms = performance.now() - this.#start;
    // Al fallar, el paso que estaba corriendo es el que falló.
    const last = this.#lines[this.#lines.length - 1];
    if (!ok && last) last.level = "error";
    if (msg) this.#lines.push({ t: ms, msg, level: ok ? "ok" : "error" });
    this.#result = { ok, msg: msg ?? `${ok ? this.#labels.done : this.#labels.failed} · ${formatElapsed(ms, resolveLocale(this))}` };
    if (this.#status) this.#status.textContent = this.#result.msg;
    this.#bool("busy", false);
    clearTimeout(this.#resultTimer);
    this.#resultTimer = window.setTimeout(() => {
      this.#result = null;
      this.#btn?.style.removeProperty("min-inline-size");
      this.#paint();
    }, ok ? RESULT_MS.ok : RESULT_MS.error);
    this.dispatchEvent(new CustomEvent("nx-done", { detail: { ok, ms, lines: this.lines }, bubbles: true, composed: true }));
  }

  /**
   * Corre una tarea con el botón ocupado. Lo que lance cuenta como fallo y su mensaje va al
   * registro. Devuelve lo que devuelva la tarea (o `undefined` si falló).
   */
  async run<T>(task: (ctx: RunContext) => Promise<T> | T): Promise<T | undefined> {
    if (this.busy) return undefined;
    this.busy = true;
    try {
      const out = await task({ log: (m, l) => this.log(m, l), progress: (p) => (this.progress = p) });
      this.done(true);
      return out;
    } catch (err) {
      this.done(false, err instanceof Error ? err.message : String(err));
      return undefined;
    }
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
    // Con el <script> en el <head> (o un parser que conecta antes de leer los hijos), el texto de
    // <nx-button>Guardar</nx-button> todavía no existe: se vuelve a mirar cuando llegue.
    this.#adoptText();
    queueMicrotask(() => this.#adoptText());
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.#adoptText(), { once: true });
    this.#paint();
  }

  disconnectedCallback(): void {
    clearInterval(this.#tick);
    this.#tick = 0;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === "labels") {
      if (value === null) return;
      try {
        this.labels = JSON.parse(value);
      } catch {
        console.warn('[nx-button] el atributo "labels" no es JSON válido');
      }
      return;
    }
    if (name === "busy" && (old === null) !== (value === null) && boolAttr(this, "busy")) this.#begin();
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

  /** Empieza un registro nuevo. */
  #begin(): void {
    clearTimeout(this.#resultTimer);
    // El ancho de partida es el mínimo mientras dure: los mensajes pueden ensancharlo, nunca
    // encogerlo a medio camino (lo de al lado no salta con cada mensaje).
    if (this.#btn && !this.#result) this.#btn.style.minInlineSize = `${this.#btn.offsetWidth}px`;
    this.#result = null;
    this.#lines = [];
    this.#start = performance.now();
    this.#logOpen = null;
    this.removeAttribute("progress");
  }

  #build(): void {
    this.#built = true;
    this.#lead = h("span", { class: "nx-button__lead" });
    this.#text = h("span", { class: "nx-button__text" });
    this.#time = h("span", { class: "nx-button__time" });
    this.#bar = h("span", { class: "nx-button__bar", "aria-hidden": "true" });
    this.#fill = h("span", { class: "nx-button__hold", "aria-hidden": "true" });
    this.#btn = h("button", { class: "nx-button__btn" }, this.#fill, this.#lead, this.#text, this.#time, this.#bar);
    this.#toggle = h("button", { type: "button", class: "nx-button__toggle", hidden: true });
    this.#panel = h("div", { class: "nx-button__log", role: "log", hidden: true });
    this.#status = h("span", { class: "nx-sr-only", role: "status" });
    this.append(this.#btn, this.#toggle, this.#panel, this.#status);

    this.#btn.addEventListener("click", (e) => {
      // Ocupado: el clic no existe (el botón no se deshabilita para no perder el foco).
      // Con `hold`, solo cuenta el clic que llega al completar la pulsación larga.
      if (this.busy || this.disabled || (this.hold && !this.#held)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      // `type="submit"` lo envía el <button> nativo solo; aquí solo el modo stream.
      if (this.stream) {
        e.preventDefault();
        void this.#runStream();
      }
    });
    const cancel = () => {
      clearTimeout(this.#holdTimer);
      delete this.#btn!.dataset.holding;
    };
    const start = () => {
      if (!this.hold || this.busy || this.disabled || this.#btn!.dataset.holding !== undefined) return;
      this.#btn!.style.setProperty("--_hold", `${this.hold}ms`);
      this.#btn!.dataset.holding = "";
      this.#holdTimer = window.setTimeout(() => {
        cancel();
        this.#held = true;
        this.#btn!.click();
        this.#held = false;
      }, this.hold);
    };
    this.#btn.addEventListener("pointerdown", (e) => e.button === 0 && start());
    for (const t of ["pointerup", "pointerleave", "pointercancel", "blur"]) this.#btn.addEventListener(t, cancel);
    this.#btn.addEventListener("keydown", (e) => {
      if (this.hold && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        if (!e.repeat) start();
      }
    });
    this.#btn.addEventListener("keyup", (e) => (e.key === "Enter" || e.key === " ") && cancel());
    this.#toggle.addEventListener("click", () => {
      this.#logOpen = !this.#isLogOpen();
      this.#paint();
    });
  }

  /** En HTML plano se puede escribir <nx-button>Guardar</nx-button>: los nodos de texto sueltos se
   *  adoptan como etiqueta. En un framework con hidratación, usa el atributo `label`. */
  #adoptText(): void {
    const loose = [...this.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE);
    const txt = loose.map((n) => n.textContent).join("").trim();
    if (!txt) return;
    loose.forEach((n) => n.remove());
    if (!this.hasAttribute("label")) this.setAttribute("label", txt);
  }

  #isLogOpen(): boolean {
    return this.#logOpen ?? (this.logMode === "inline" && (this.busy || this.#result !== null));
  }

  async #runStream(): Promise<void> {
    const url = safeHref(this.stream);
    if (!url) return;
    await this.run(async ({ log, progress }) => {
      const res = await fetch(url, {
        method: this.method,
        credentials: "same-origin",
        headers: { Accept: "application/x-ndjson, text/event-stream, text/plain" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let final: StreamEvent | null = null;
      await readLines(res, (raw) => {
        const ev = parseStreamLine(raw);
        if (!ev) return;
        if (ev.progress !== undefined) progress(ev.progress);
        if (ev.done) final = ev;
        else if (ev.msg) log(ev.msg, ev.level);
      });
      const end = final as StreamEvent | null;
      if (end?.ok === false) throw new Error(end.msg ?? this.#labels.failed);
      if (end?.msg) log(end.msg, "ok");
    });
  }

  /** Pinta el estado actual. `fromLog`: solo cambió el registro (anima el ticker). */
  #paint(fromLog = false): void {
    if (!this.#built) return;
    const btn = this.#btn!;
    const busy = this.busy;
    const result = this.#result;
    const last = this.#lines[this.#lines.length - 1];

    btn.type = this.type as "button" | "submit";
    btn.className = `nx-button__btn nx-button--${this.variant}`;
    btn.toggleAttribute("data-busy", busy);
    btn.dataset.result = result ? (result.ok ? "ok" : "error") : "";
    btn.setAttribute("aria-busy", String(busy));
    // `aria-disabled` y no `disabled`: un botón deshabilitado suelta el foco en pleno clic.
    btn.setAttribute("aria-disabled", String(busy || this.disabled));
    if (this.hold) btn.setAttribute("aria-description", this.#labels.hold);
    else btn.removeAttribute("aria-description");

    // Lo que va delante: spinner, resultado o ícono.
    const lead = busy ? "busy" : result ? (result.ok ? "ok" : "error") : `icon:${this.icon ?? ""}`;
    if (this.#lead!.dataset.state !== lead) {
      this.#lead!.dataset.state = lead;
      this.#lead!.replaceChildren(
        busy ? h("span", { class: "nx-spinner" }) : result ? glyph(result.ok ? CHECK : ALERT) : this.icon ? icon(this.icon, this.label) : "",
      );
    }

    // El texto: la etiqueta, el último mensaje (ticker) o el resultado.
    const text = busy ? (this.logMode !== "none" && last ? last.msg : this.#labels.busy) : result ? result.msg : this.label;
    if (this.#text!.textContent !== text) {
      const span = h("span", { class: fromLog || busy ? "nx-button__msg nx-button__msg--in" : "nx-button__msg" }, text);
      this.#text!.replaceChildren(span);
    }

    // Reloj y barra.
    this.#time!.hidden = !busy;
    if (busy && !this.#tick) {
      this.#tick = window.setInterval(() => this.#time && (this.#time.textContent = formatElapsed(performance.now() - this.#start, resolveLocale(this))), 100);
    }
    if (!busy && this.#tick) {
      clearInterval(this.#tick);
      this.#tick = 0;
    }
    if (busy) this.#time!.textContent = formatElapsed(performance.now() - this.#start, resolveLocale(this));
    const p = this.progress;
    this.#bar!.hidden = !busy;
    this.#bar!.classList.toggle("nx-button__bar--indeterminate", busy && p === null);
    this.#bar!.style.inlineSize = p === null ? "" : `${p * 100}%`;

    // Registro.
    const lines = this.logMode === "none" ? [] : this.#lines;
    const open = lines.length > 0 && this.#isLogOpen();
    this.#toggle!.hidden = lines.length === 0;
    this.#toggle!.setAttribute("aria-expanded", String(open));
    this.#toggle!.replaceChildren(glyph(TERMINAL), `${this.#labels.log} (${lines.length})`);
    this.#panel!.hidden = !open;
    if (open) this.#paintLog(lines, busy);
  }

  #paintLog(lines: LogLine[], busy: boolean): void {
    const panel = this.#panel!;
    const stick = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 8;
    panel.replaceChildren(
      ...lines.map((l, i) => {
        const running = busy && i === lines.length - 1;
        const level = running ? "run" : l.level === "info" ? "ok" : l.level;
        const mark = { run: "›", ok: "✓", warn: "!", error: "✗" }[level];
        return h(
          "div",
          { class: `nx-button__line nx-button__line--${level}` },
          h("span", { class: "nx-button__t" }, `+${formatElapsed(l.t, resolveLocale(this))}`),
          h("span", { class: "nx-button__mark", "aria-hidden": "true" }, mark),
          h("span", { class: "nx-button__m" }, l.msg),
          running ? h("span", { class: "nx-button__cursor", "aria-hidden": "true" }) : null,
        );
      }),
    );
    if (stick) panel.scrollTop = panel.scrollHeight;
  }
}
