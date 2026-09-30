/**
 * `<nx-voice>`: dictar al formulario. En bodega, en campo o manejando el montacargas: «veinte láminas
 * calibre catorce para Ferretería El Tornillo, entrega el viernes» y el formulario se llena.
 *
 * Reconoce con la Web Speech API del navegador (`SpeechRecognition`, con resultados parciales que se
 * ven mientras se habla) o, sin ella o con `engine="server"`, graba con `MediaRecorder` y le pide el
 * texto al servidor (`endpoint`, en un chunk aparte). Sin ninguno de los dos, el botón no aparece.
 *
 * Lo que se entiende va a `for`: a un `<nx-paste-fill>` (su `fill(text)` reparte los datos, con su
 * deshacer), o a un `<input>`/`<textarea>`, donde se dicta en el cursor con la puntuación dictada y las
 * órdenes («coma», «punto y aparte», «borrar eso»). Sin `for`, solo el evento `nx-voice-text`.
 *
 * El micrófono se apaga siempre: al terminar, al ocultar la pestaña, al desconectar el elemento y al
 * tope de `max-seconds`, con todas las pistas detenidas y el `AudioContext` cerrado.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { safeEndpoint } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import { clampVoice, cleanVoiceEngine, parseVoiceHotkey, speechTranscript, voiceErrorCode, voiceHotkeyMatches, voiceHotkeyText, voiceLevel } from "./logic";
import type { VoiceErrorCode, VoiceLabels, VoiceState } from "./types";
import type { VoiceRecording } from "./voice-server";

export const VOICE_LABELS: VoiceLabels = {
  dictate: "Dictar",
  stop: "Dejar de escuchar",
  tap: "Toca para dictar",
  hold: "Mantén presionado para dictar",
  asking: "Permite el micrófono…",
  listening: "Escuchando…",
  processing: "Procesando…",
  filled: "Llené {n} campos",
  filledOne: "Llené 1 campo",
  none: "No encontré datos para el formulario",
  undo: "Deshacer",
  undone: "Se deshizo el dictado",
  heard: "Dictado: {text}",
  notAllowed: "No tengo permiso para el micrófono. Actívalo en el candado junto a la dirección de la página y vuelve a intentar.",
  noSpeech: "No te entendí, intenta de nuevo.",
  network: "Sin conexión: el dictado del navegador necesita internet.",
  noMic: "No encontré un micrófono disponible.",
  server: "No se pudo transcribir el audio. Intenta de nuevo.",
  failed: "No se pudo dictar. Intenta de nuevo.",
};
const MESSAGE: Record<VoiceErrorCode, keyof VoiceLabels> = { "not-allowed": "notAllowed", "no-speech": "noSpeech", network: "network", "no-mic": "noMic", server: "server", failed: "failed" };

/** Cada cuánto se mide el volumen y se revisan el silencio y el tope. */
const TICK = 60;
/** Por encima de esto, el medidor cuenta como voz (con el servidor, así se detecta el silencio). */
const SPEAK = 0.08;
/** Sin oír nada en absoluto, se deja de escuchar a los 8 s (tocar para hablar). */
const NOTHING = 8000;
/** Tras `stop()`, lo que se espera el final del navegador antes de quedarse con lo que hay. */
const LATE = 4000;

/** Lo que se usa de `SpeechRecognition` (aún no está en todos los `lib.dom`). */
interface Rec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string; confidence?: number }> & { isFinal?: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type W = { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec; AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
const win = (): W => (typeof window === "undefined" ? {} : (window as unknown as W));
/** Un `<nx-paste-fill>` (o cualquier cosa con `fill(text)`). */
type Filler = HTMLElement & { fill(text: string): Promise<{ values?: Record<string, string> } | null>; undo?(): boolean };
type Server = typeof import("./voice-server");

const STR = ["for", "endpoint", "engine", "hotkey", "layout", "locale"];
const BOOL = ["hold", "disabled"];

const MIC = '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/>';
// El marcado es SIEMPRE esta constante: los textos (que pueden venir de `labels`) van con `textContent`.
const TPL =
  `<div class="nx-voice__row"><button type="button" class="nx-voice__btn" aria-pressed="false"><span class="nx-voice__ring" aria-hidden="true"></span>` +
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${MIC}</svg>` +
  `<span class="nx-voice__dot" aria-hidden="true"></span></button><div class="nx-voice__body"><p class="nx-voice__status"></p>` +
  `<p class="nx-voice__text"><span class="nx-voice__final"></span> <span class="nx-voice__interim"></span></p>` +
  `<p class="nx-voice__done"><span></span> <button type="button" class="nx-voice__undo"></button></p></div></div><p class="nx-voice__sr" aria-live="polite"></p>`;

/** El que está escuchando: empezar otro lo detiene. */
let active: NxVoice | null = null;
let uid = 0;

export class NxVoice extends Base {
  static observedAttributes = ["labels", "engine", "endpoint", "hold", "hotkey", "disabled"];

  #labels = VOICE_LABELS;
  #state: VoiceState = "idle";
  #err: VoiceErrorCode | null = null;
  #gen = 0;
  #engine: "browser" | "server" | null = null;
  #stream: MediaStream | null = null;
  #ctx: AudioContext | null = null;
  #an: AnalyserNode | null = null;
  #buf = new Uint8Array(0);
  #lvl = 0;
  #rec: Rec | null = null;
  #server: Server | null = null;
  #recording: VoiceRecording | null = null;
  #abort: AbortController | null = null;
  #timer = 0;
  #late = 0;
  #t0 = 0;
  #heard = 0;
  #final = "";
  #interim = "";
  #conf: number | null = null;
  #summary = "";
  #undo: Filler | null = null;
  /** Lo último que se dictó en un campo (para «borrar eso» en el siguiente dictado). */
  #last: [number, number] | null = null;
  #lastEl: Element | null = null;
  #warned = false;
  #holding = false;
  #holdEnd = 0;
  #keyHold = false;
  #flip = false;
  #built = false;
  #btn!: HTMLButtonElement;
  #p!: HTMLElement[];

  // ---------------------------------------------------------------- propiedades

  /** El `id` de un `<nx-paste-fill>`, un `<input>` o un `<textarea>` que recibe lo dictado. */
  declare for: string | null;
  /** URL que recibe el audio (`POST`, `FormData` con `audio` y `lang`) y responde el texto. */
  declare endpoint: string | null;
  /** `auto` (por defecto), `browser` o `server`. */
  declare engine: string | null;
  /** Atajo de página («Alt+V»): empieza y termina de dictar sin tocar el botón. */
  declare hotkey: string | null;
  /** `inline` (por defecto) o `stacked`: la transcripción al lado o debajo del botón. */
  declare layout: string | null;
  declare locale: string | null;
  /** Mantener para hablar: escucha mientras se mantiene el botón (o la barra espaciadora). */
  declare hold: boolean;
  declare disabled: boolean;

  /** Tope de una toma en segundos (1–300; 30 por defecto). */
  get maxSeconds(): number {
    return clampVoice(this.getAttribute("max-seconds"), 30, 1, 300);
  }
  set maxSeconds(v: number | string | null) {
    this.#attr("max-seconds", v);
  }
  /** Silencio que termina una toma, en ms (300–15000; 2000 por defecto). No aplica con `hold`. */
  get silence(): number {
    return clampVoice(this.getAttribute("silence"), 2000, 300, 15000);
  }
  set silence(v: number | string | null) {
    this.#attr("silence", v);
  }
  /** «Borrar eso» y «borra la última palabra» como órdenes al dictar en un campo (`commands="false"` las apaga). */
  get commands(): boolean {
    return this.getAttribute("commands") !== "false";
  }
  set commands(v: boolean | string | null) {
    this.#attr("commands", v === false || v === "false" ? "false" : null);
  }
  get labels(): VoiceLabels {
    return this.#labels;
  }
  set labels(v: Partial<VoiceLabels> | string | null | undefined) {
    this.#labels = mergeLabels(VOICE_LABELS, v);
    this.#paint();
  }
  /** `idle`, `asking` (pidiendo el micrófono), `listening`, `processing`, `error` o `unavailable`. */
  get state(): VoiceState {
    return this.#state;
  }
  /** Si se puede dictar aquí: la API del navegador o, con `endpoint`, grabar para el servidor. */
  get supported(): boolean {
    return !!this.#pick();
  }
  /** El texto de la última toma. */
  get text(): string {
    return this.#final;
  }

  // ---------------------------------------------------------------- API

  /** Empieza a escuchar (pide el micrófono la primera vez). */
  async start(): Promise<void> {
    if (this.disabled || this.#busy()) return;
    const engine = (this.#engine = this.#pick());
    if (!engine) return this.#unavailable();
    if (active && active !== this) active.stop();
    active = this;
    const gen = ++this.#gen;
    this.#final = this.#interim = this.#summary = "";
    this.#conf = this.#err = this.#undo = null;
    this.#set("asking");
    const lazy = engine === "server" ? import("./voice-server") : null;
    // El AudioContext se crea aquí, dentro del gesto: creado después de un `await` puede quedar suspendido.
    const AC = win().AudioContext ?? win().webkitAudioContext;
    try {
      this.#ctx = AC ? new AC() : null;
    } catch {
      this.#ctx = null;
    }
    let stream: MediaStream | null = null;
    try {
      const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
      if (md?.getUserMedia) stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (gen !== this.#gen || !this.isConnected) return stopTracks(stream);
      this.#stream = stream;
      this.#meter(stream);
      if (lazy) {
        this.#server = await lazy;
        if (gen !== this.#gen) return;
        this.#recording = this.#server.record(stream!);
      } else this.#listen(gen);
    } catch (e) {
      stopTracks(stream);
      if (gen === this.#gen) this.#fail(voiceErrorCode((e as { name?: string } | null)?.name) ?? "failed");
      return;
    }
    this.#t0 = Date.now();
    this.#heard = 0;
    this.#timer = window.setInterval(() => this.#tick(), TICK);
    this.#set("listening");
    this.#emit("nx-voice-start", {});
  }

  /** Termina de escuchar y entrega lo que se entendió. */
  stop(): void {
    if (this.#state === "asking") return this.cancel();
    if (this.#state !== "listening") return;
    const gen = this.#gen;
    this.#set("processing");
    if (this.#rec) {
      this.#rec.stop();
      this.#release();
      this.#late = window.setTimeout(() => gen === this.#gen && void this.#finish(), LATE);
      return;
    }
    const audio = this.#recording!.stop();
    this.#release();
    void this.#upload(audio, gen);
  }

  /** Deja de escuchar sin entregar nada. */
  cancel(): void {
    if (!this.#busy()) return;
    this.#halt();
    this.#final = this.#interim = "";
    this.#set("idle");
    this.#emit("nx-voice-end", { text: "", canceled: true });
  }

  focus(options?: FocusOptions): void {
    this.#btn?.focus(options);
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    this.#build();
    document.addEventListener("keydown", this.#onKey, true);
    document.addEventListener("keyup", this.#onKeyUp, true);
    document.addEventListener("visibilitychange", this.#onHide);
    this.#check();
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.#onKey, true);
    document.removeEventListener("keyup", this.#onKeyUp, true);
    document.removeEventListener("visibilitychange", this.#onHide);
    this.cancel();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "labels") {
      try {
        this.labels = value === null ? null : JSON.parse(value);
      } catch {
        console.warn('[nx-voice] el atributo "labels" no es JSON válido');
      }
    } else if ((name === "engine" || name === "endpoint") && this.isConnected && !this.#busy()) this.#check();
    else {
      if (name === "disabled" && this.disabled) this.cancel();
      this.#paint();
    }
  }

  // ---------------------------------------------------------------- reconocimiento

  #pick(): "browser" | "server" | null {
    const e = cleanVoiceEngine(this.getAttribute("engine"));
    const w = win();
    if (e !== "server" && (w.SpeechRecognition ?? w.webkitSpeechRecognition)) return "browser";
    const endpoint = this.getAttribute("endpoint");
    return e !== "browser" && endpoint && typeof MediaRecorder !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && safeEndpoint(endpoint) ? "server" : null;
  }

  #check(): void {
    if (!this.#pick()) this.#unavailable();
    else if (this.#state === "unavailable") this.#set("idle");
    else this.#paint();
  }

  #unavailable(): void {
    this.#set("unavailable");
    if (this.#warned) return;
    this.#warned = true;
    this.#emit("nx-voice-unavailable", {});
  }

  /** La Web Speech API del navegador. */
  #listen(gen: number): void {
    const w = win();
    const rec = new (w.SpeechRecognition ?? w.webkitSpeechRecognition)!();
    rec.lang = resolveLocale(this);
    rec.interimResults = true;
    // En Android, el modo continuo repite los resultados: allí una frase por toma.
    rec.continuous = !/Android/i.test(navigator.userAgent);
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      if (gen !== this.#gen) return;
      const r = speechTranscript(e.results);
      this.#final = r.final;
      this.#interim = r.interim;
      if (r.confidence !== null) this.#conf = r.confidence;
      this.#heard = Date.now();
      this.#partial();
    };
    rec.onerror = (e) => {
      const code = voiceErrorCode(e.error);
      if (gen === this.#gen && code) this.#fail(code);
    };
    rec.onend = () => gen === this.#gen && void this.#finish();
    this.#rec = rec;
    rec.start();
  }

  /** El volumen, el silencio y el tope de tiempo. */
  #tick(): void {
    const now = Date.now();
    let level = 0;
    if (this.#an) {
      this.#an.getByteTimeDomainData(this.#buf);
      level = voiceLevel(this.#buf);
    }
    this.#lvl = this.#lvl * 0.4 + level * 0.6;
    this.#btn.style.setProperty("--nx-voice-level", this.#lvl.toFixed(2));
    const browser = this.#engine === "browser";
    if (!browser && level > SPEAK) this.#heard = now;
    if (now - this.#t0 >= this.maxSeconds * 1000) return this.stop();
    // Sin medidor, con el servidor no hay cómo saber si hay silencio: termina el botón o el tope.
    if (this.hold || (!browser && !this.#an)) return;
    if (this.#heard ? now - this.#heard >= this.silence : now - this.#t0 >= NOTHING) this.stop();
  }

  async #upload(audio: Promise<Blob>, gen: number): Promise<void> {
    const ctrl = (this.#abort = new AbortController());
    try {
      const blob = await audio;
      if (gen !== this.#gen) return;
      const r = await this.#server!.transcribe(safeEndpoint(this.endpoint) ?? "", blob, resolveLocale(this), ctrl.signal, (t) => {
        if (gen !== this.#gen) return;
        this.#interim = t;
        this.#partial();
      });
      if (gen !== this.#gen) return;
      this.#final = r.text;
      this.#interim = "";
      this.#conf = r.confidence;
      await this.#finish();
    } catch {
      if (gen === this.#gen) this.#fail("server");
    }
  }

  #partial(): void {
    this.#paint();
    this.#emit("nx-voice-partial", { text: `${this.#final} ${this.#interim}`.trim() });
  }

  /** Terminó la toma: lo que se entendió se avisa (cancelable) y se entrega a `for`. */
  async #finish(): Promise<void> {
    const final = !!this.#final;
    const text = (this.#final || this.#interim).trim();
    if (!text) return this.#fail("no-speech");
    this.#halt();
    this.#final = text;
    this.#interim = "";
    this.#set("idle");
    const heard = this.#labels.heard.replace("{text}", text);
    if (this.#emit("nx-voice-text", { text, confidence: this.#conf, final }, true)) await this.#deliver(text);
    this.#say([heard, this.#summary].filter(Boolean).join(". "));
    this.#emit("nx-voice-end", { text, canceled: false });
  }

  #fail(code: VoiceErrorCode): void {
    this.#halt();
    this.#err = code;
    this.#interim = "";
    this.#set("error");
    const message = this.#labels[MESSAGE[code]];
    this.#say(message);
    this.#emit("nx-voice-error", { code, message });
    this.#emit("nx-voice-end", { text: "", canceled: false });
  }

  /** Suelta todo: el reconocimiento, la grabación, la petición y el micrófono. Lo que llegue tarde se ignora. */
  #halt(): void {
    this.#gen++;
    clearTimeout(this.#late);
    const rec = this.#rec;
    this.#rec = null;
    if (rec) {
      rec.onresult = rec.onerror = rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ya terminó */
      }
    }
    this.#abort?.abort();
    this.#abort = null;
    this.#recording = null;
    this.#release();
    if (active === this) active = null;
  }

  /** El micrófono: todas las pistas detenidas y el AudioContext cerrado. */
  #release(): void {
    clearInterval(this.#timer);
    stopTracks(this.#stream);
    this.#stream = null;
    const ctx = this.#ctx;
    this.#ctx = this.#an = null;
    try {
      void ctx?.close().catch(() => {});
    } catch {
      /* ya cerrado */
    }
    this.#lvl = 0;
    this.#btn?.style.removeProperty("--nx-voice-level");
  }

  #meter(stream: MediaStream | null): void {
    const ctx = this.#ctx;
    if (!stream || !ctx) return;
    try {
      void ctx.resume?.()?.catch?.(() => {});
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      this.#an = an;
      this.#buf = new Uint8Array(an.fftSize);
    } catch {
      /* sin medidor: el punto queda quieto */
    }
  }

  // ---------------------------------------------------------------- entrega

  async #deliver(text: string): Promise<void> {
    const id = this.for;
    const t = id ? ((this.getRootNode() as Document).getElementById?.(id) ?? document.getElementById(id)) : null;
    if (!t) return;
    if (typeof (t as Filler).fill === "function") {
      const d = await (t as Filler).fill(text).catch(() => null);
      const n = Object.keys(d?.values ?? {}).length;
      const L = this.#labels;
      this.#summary = n === 1 ? L.filledOne : n ? L.filled.replace("{n}", String(n)) : L.none;
      this.#undo = n && typeof (t as Filler).undo === "function" ? (t as Filler) : null;
      this.#paint();
    } else if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) this.#write(t, text, (await import("./voice-text")).applyDictation);
  }

  /** Dicta en el cursor del campo (reemplaza lo seleccionado) y avisa con `input` y `change`. */
  #write(el: HTMLInputElement | HTMLTextAreaElement, text: string, applyDictation: typeof import("./voice-text").applyDictation): void {
    let a: number | null = null;
    let b: number | null = null;
    try {
      a = el.selectionStart;
      b = el.selectionEnd;
    } catch {
      /* un tipo sin selección (email, number) */
    }
    const v = el.value;
    const edit = applyDictation(v, a ?? v.length, b ?? a ?? v.length, text, { orders: this.commands, last: this.#lastEl === el ? this.#last : null });
    // Con el setter nativo: React y compañía vigilan `value` en la instancia.
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
    if (set) set.call(el, edit.value);
    else el.value = edit.value;
    try {
      el.setSelectionRange(edit.caret, edit.caret);
    } catch {
      /* igual */
    }
    this.#last = edit.range;
    this.#lastEl = el;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------------------------------------------------------------- teclado y pestaña

  #busy(): boolean {
    return this.#state === "asking" || this.#state === "listening" || this.#state === "processing";
  }

  #toggle(): void {
    if (this.#state === "processing") return;
    if (this.#busy()) this.stop();
    else void this.start();
  }

  #onKey = (e: KeyboardEvent): void => {
    if (e.repeat || this.disabled || this.#state === "unavailable" || !voiceHotkeyMatches(parseVoiceHotkey(this.hotkey), e)) return;
    // Con los atajos de `<nx-keytips>` a la vista, la letra es de ellos.
    if ([...document.querySelectorAll("nx-keytips")].some((k) => (k as { open?: boolean }).open)) return;
    e.preventDefault();
    if (!this.hold) return this.#toggle();
    this.#keyHold = true;
    void this.start();
  };

  #onKeyUp = (): void => {
    if (!this.#keyHold) return;
    this.#keyHold = false;
    this.stop();
  };

  #onHide = (): void => {
    if (document.hidden) this.stop();
  };

  // ---------------------------------------------------------------- pintar

  #build(): void {
    if (this.#built) return;
    this.#built = true;
    this.innerHTML = TPL;
    this.#btn = this.querySelector("button")!;
    this.#p = [...this.querySelectorAll<HTMLElement>(".nx-voice__status, .nx-voice__text, .nx-voice__final, .nx-voice__interim, .nx-voice__done, .nx-voice__sr")];
    const [status] = this.#p;
    status.id = `nx-voice${++uid}`;
    this.#btn.setAttribute("aria-describedby", status.id);
    const btn = this.#btn;
    const release = (): void => {
      if (!this.#holding) return;
      this.#holding = false;
      this.#holdEnd = Date.now();
      this.stop();
    };
    btn.addEventListener("click", (e) => {
      // Con `hold`, el puntero y la barra ya hicieron lo suyo; queda Enter, que alterna.
      if (this.hold && (e.detail || Date.now() - this.#holdEnd < 400)) return;
      this.#toggle();
    });
    btn.addEventListener("pointerdown", (e) => {
      if (!this.hold || e.button || this.disabled) return;
      e.preventDefault();
      btn.focus();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* sin captura */
      }
      this.#holding = true;
      void this.start();
    });
    for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) btn.addEventListener(t, release);
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.#busy()) {
        e.preventDefault();
        return this.cancel();
      }
      if (!this.hold || e.key !== " ") return;
      e.preventDefault();
      if (e.repeat || this.#holding) return;
      this.#holding = true;
      void this.start();
    });
    btn.addEventListener("keyup", (e) => {
      if (!this.hold || e.key !== " ") return;
      e.preventDefault();
      release();
    });
    this.querySelector(".nx-voice__undo")!.addEventListener("click", () => {
      this.#undo?.undo?.();
      this.#undo = null;
      this.#summary = this.#labels.undone;
      this.#paint();
      this.#say(this.#summary);
    });
  }

  #set(state: VoiceState): void {
    this.#state = state;
    if (state !== "error") this.#err = null;
    this.#paint();
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const st = this.#state;
    const on = st === "asking" || st === "listening";
    const hk = parseVoiceHotkey(this.hotkey);
    const keys = hk && voiceHotkeyText(hk);
    const [status, text, fin, mid, done] = this.#p;
    this.dataset.state = st;
    const btn = this.#btn;
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? L.stop : L.dictate);
    btn.disabled = this.disabled;
    if (keys) btn.setAttribute("aria-keyshortcuts", keys);
    else btn.removeAttribute("aria-keyshortcuts");
    status.textContent = st === "error" ? L[MESSAGE[this.#err ?? "failed"]] : st === "idle" || st === "unavailable" ? `${this.hold ? L.hold : L.tap}${keys ? ` (${keys})` : ""}` : L[st];
    fin.textContent = this.#final;
    mid.textContent = this.#interim;
    text.hidden = !this.#final && !this.#interim;
    done.hidden = !this.#summary;
    done.firstElementChild!.textContent = this.#summary;
    const undo = done.lastElementChild as HTMLElement;
    undo.hidden = !this.#undo;
    undo.textContent = L.undo;
  }

  /** Para el lector de pantalla: solo lo final (un carácter invisible alterno repite lo mismo). */
  #say(text: string): void {
    this.#flip = !this.#flip;
    if (this.#built) this.#p[5].textContent = text + (this.#flip ? "​" : "");
  }

  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  #attr(name: string, v: unknown): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, String(v));
  }
}

function stopTracks(stream: MediaStream | null): void {
  for (const t of stream?.getTracks() ?? []) t.stop();
}

for (const prop of STR.concat(BOOL)) {
  const bool = BOOL.includes(prop);
  Object.defineProperty(NxVoice.prototype, prop, {
    configurable: true,
    get(this: HTMLElement) {
      return bool ? boolAttr(this, prop) : this.getAttribute(prop);
    },
    set(this: HTMLElement, v: unknown) {
      if (bool ? !v : v === null || v === undefined || v === "") this.removeAttribute(prop);
      else this.setAttribute(prop, bool ? "" : String(v));
    },
  });
}
