// @vitest-environment happy-dom
//
// happy-dom no tiene SpeechRecognition, getUserMedia, AudioContext ni MediaRecorder: se simulan
// aquí. La `SpeechRecognition` falsa entrega resultados cuando la prueba lo pide; el micrófono falso
// cuenta qué pistas se detuvieron; el AudioContext falso da el volumen que la prueba ponga.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/paste-fill/index";
import type { NxPasteFill } from "../src/components/paste-fill/index";
import { VOICE_LABELS, type NxVoice, type VoiceErrorDetail, type VoiceTextDetail } from "../src/components/voice/index";
// Los chunks que el elemento carga con `import()`: ya en caché, para no esperar al cargador.
import "../src/components/voice/voice-server";
import "../src/components/voice/voice-text";
import { NxVoice as VoiceClass } from "../src/components/voice/voice";

type Result = [text: string, final: boolean, confidence?: number];

class FakeRec {
  static all: FakeRec[] = [];
  lang = "";
  interimResults = false;
  continuous = false;
  maxAlternatives = 0;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  stopped = false;
  aborted = false;
  constructor() {
    FakeRec.all.push(this);
  }
  start() {
    this.started = true;
  }
  /** Como el navegador: el final llega un momento después de `stop()`. */
  stop() {
    this.stopped = true;
    setTimeout(() => this.onend?.(), 10);
  }
  abort() {
    this.aborted = true;
  }
  say(...results: Result[]) {
    this.onresult?.({ results: results.map(([t, isFinal, confidence]) => Object.assign([{ transcript: t, confidence: confidence ?? 0.9 }], { isFinal })) });
  }
  fail(error: string) {
    this.onerror?.({ error });
    this.onend?.();
  }
}
const rec = () => FakeRec.all[FakeRec.all.length - 1];

class FakeAC {
  static all: FakeAC[] = [];
  /** Amplitud alrededor de 128 que devuelve el analizador (0 = silencio). */
  static amp = 0;
  closed = false;
  constructor() {
    FakeAC.all.push(this);
  }
  createAnalyser() {
    return { fftSize: 0, getByteTimeDomainData: (buf: Uint8Array) => buf.forEach((_, i) => (buf[i] = 128 + (i % 2 ? FakeAC.amp : -FakeAC.amp))) };
  }
  createMediaStreamSource() {
    return { connect() {} };
  }
  resume() {
    return Promise.resolve();
  }
  close() {
    this.closed = true;
    return Promise.resolve();
  }
}

class FakeMR {
  static all: FakeMR[] = [];
  static isTypeSupported = (t: string) => t.startsWith("audio/ogg");
  state = "inactive";
  mimeType: string;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(
    public stream: unknown,
    opts?: { mimeType?: string },
  ) {
    this.mimeType = opts?.mimeType ?? "";
    FakeMR.all.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["OggS-audio"], { type: this.mimeType }) });
    this.onstop?.();
  }
}

let tracks: { stop: ReturnType<typeof vi.fn> }[] = [];
let getUserMedia: ReturnType<typeof vi.fn>;

/** El navegador de la prueba: con o sin la API de voz, el micrófono, el AudioContext y MediaRecorder. */
function browser({ speech = true, mic = true, audio = true, recorder = false, deny = "" } = {}) {
  FakeRec.all = [];
  FakeAC.all = [];
  FakeMR.all = [];
  FakeAC.amp = 0;
  tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
  getUserMedia = vi.fn(async () => {
    if (deny) throw Object.assign(new Error(deny), { name: deny });
    return { getTracks: () => tracks };
  });
  if (speech) vi.stubGlobal("webkitSpeechRecognition", FakeRec);
  if (audio) vi.stubGlobal("AudioContext", FakeAC);
  if (recorder) vi.stubGlobal("MediaRecorder", FakeMR);
  const nav = Object.create(navigator);
  Object.defineProperties(nav, { userAgent: { value: "Mozilla/5.0 (X11; Linux x86_64) Chrome/130", configurable: true }, mediaDevices: { value: mic ? { getUserMedia } : undefined }, clipboard: { value: undefined } });
  vi.stubGlobal("navigator", nav);
}
const micOff = () => tracks.every((t) => t.stop.mock.calls.length > 0);

function mount(attrs = "", extra = ""): NxVoice {
  document.body.innerHTML = `<nx-voice ${attrs}></nx-voice>${extra}`;
  return document.querySelector("nx-voice")!;
}
const btn = (el: Element) => el.querySelector<HTMLButtonElement>(".nx-voice__btn")!;
const status = (el: Element) => el.querySelector(".nx-voice__status")!.textContent;
const live = (el: Element) => el.querySelector(".nx-voice__sr")!.textContent!.replace(/​/g, "");
function track(el: HTMLElement) {
  const log: string[] = [];
  const texts: VoiceTextDetail[] = [];
  const errors: VoiceErrorDetail[] = [];
  const partials: string[] = [];
  const ends: { text: string; canceled: boolean }[] = [];
  for (const t of ["nx-voice-start", "nx-voice-partial", "nx-voice-text", "nx-voice-end", "nx-voice-error", "nx-voice-unavailable"]) el.addEventListener(t, () => log.push(t.slice(9)));
  el.addEventListener("nx-voice-text", (e) => texts.push(e.detail));
  el.addEventListener("nx-voice-error", (e) => errors.push(e.detail));
  el.addEventListener("nx-voice-partial", (e) => partials.push(e.detail.text));
  el.addEventListener("nx-voice-end", (e) => ends.push(e.detail));
  return { log, texts, errors, partials, ends };
}
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("disponibilidad", () => {
  it("sin API de voz ni servidor, el botón no aparece y avisa una sola vez", () => {
    browser({ speech: false });
    const seen = vi.fn();
    document.addEventListener("nx-voice-unavailable", seen);
    const el = mount();
    expect(el.state).toBe("unavailable");
    expect(el.supported).toBe(false);
    expect(el.dataset.state).toBe("unavailable");
    expect(seen).toHaveBeenCalledTimes(1);
    el.remove();
    document.body.append(el);
    void el.start();
    expect(seen).toHaveBeenCalledTimes(1);
    expect(getUserMedia).not.toHaveBeenCalled();
    document.removeEventListener("nx-voice-unavailable", seen);
  });

  it("sin API de voz pero con `endpoint` y MediaRecorder: usa el servidor", () => {
    browser({ speech: false, recorder: true });
    const el = mount('endpoint="/api/voz"');
    expect(el.supported).toBe(true);
    expect(el.state).toBe("idle");
  });

  it("`engine=\"browser\"` no cae al servidor; un endpoint de otro origen no cuenta", () => {
    browser({ speech: false, recorder: true });
    expect(mount('engine="browser" endpoint="/api/voz"').state).toBe("unavailable");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mount('endpoint="https://otro.example/voz"').state).toBe("unavailable");
  });

  it("cambiar `engine` o `endpoint` vuelve a mirar", () => {
    browser({ speech: false, recorder: true });
    const el = mount();
    expect(el.state).toBe("unavailable");
    el.endpoint = "/api/voz";
    expect(el.state).toBe("idle");
  });
});

describe("el botón", () => {
  it("nombre, estado y ayuda", () => {
    browser();
    const el = mount();
    const b = btn(el);
    expect(b.getAttribute("aria-pressed")).toBe("false");
    expect(b.getAttribute("aria-label")).toBe("Dictar");
    expect(status(el)).toBe("Toca para dictar");
    expect(b.getAttribute("aria-describedby")).toBe(el.querySelector(".nx-voice__status")!.id);
    expect(el.querySelector(".nx-voice__sr")!.getAttribute("aria-live")).toBe("polite");
    el.hold = true;
    expect(status(el)).toBe("Mantén presionado para dictar");
    el.hotkey = "alt+v";
    expect(status(el)).toBe("Mantén presionado para dictar (Alt+V)");
    expect(b.getAttribute("aria-keyshortcuts")).toBe("Alt+V");
    el.hotkey = null;
    expect(b.hasAttribute("aria-keyshortcuts")).toBe(false);
    el.disabled = true;
    expect(b.disabled).toBe(true);
  });

  it("labels (propiedad y atributo JSON; uno inválido no rompe)", () => {
    browser();
    const el = mount(`labels='{"dictate":"Hablar","tap":"Toca y habla","otro":1,"stop":5}'`);
    expect(btn(el).getAttribute("aria-label")).toBe("Hablar");
    expect(status(el)).toBe("Toca y habla");
    expect(el.labels.stop).toBe(VOICE_LABELS.stop);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    el.setAttribute("labels", "{no");
    expect(warn).toHaveBeenCalled();
    expect(el.labels.dictate).toBe("Hablar");
    el.labels = null;
    expect(btn(el).getAttribute("aria-label")).toBe("Dictar");
  });

  it("props puestas antes de registrar el elemento", () => {
    browser();
    const el = document.createElement("nx-voice-tarde") as NxVoice;
    const raw = el as unknown as Record<string, unknown>;
    raw.labels = { dictate: "Dictar pedido" };
    raw.hold = true;
    raw.maxSeconds = 12;
    raw.for = "obs";
    document.body.append(el);
    customElements.define("nx-voice-tarde", class extends VoiceClass {});
    expect(el.hold).toBe(true);
    expect(el.getAttribute("for")).toBe("obs");
    expect(el.maxSeconds).toBe(12);
    expect(btn(el).getAttribute("aria-label")).toBe("Dictar pedido");
  });

  it("valores por defecto y acotados", () => {
    browser();
    const el = mount('max-seconds="9999" silence="10"');
    expect(el.maxSeconds).toBe(300);
    expect(el.silence).toBe(300);
    el.maxSeconds = null;
    el.silence = "nada";
    expect(el.maxSeconds).toBe(30);
    expect(el.silence).toBe(2000);
    expect(el.commands).toBe(true);
    el.commands = false;
    expect(el.getAttribute("commands")).toBe("false");
    el.commands = true;
    expect(el.hasAttribute("commands")).toBe(false);
  });
});

describe("reconocimiento del navegador", () => {
  it("parciales en gris, el final, el silencio termina y el micrófono se apaga", async () => {
    browser();
    const el = mount();
    const t = track(el);
    btn(el).click();
    await wait(0);
    expect(getUserMedia).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true } });
    const r = rec();
    expect(r.started).toBe(true);
    expect(r.lang).toBe("es-CO");
    expect(r.interimResults).toBe(true);
    expect(r.continuous).toBe(true);
    expect(el.state).toBe("listening");
    expect(btn(el).getAttribute("aria-pressed")).toBe("true");
    expect(btn(el).getAttribute("aria-label")).toBe("Dejar de escuchar");
    expect(status(el)).toBe("Escuchando…");

    r.say(["veinte láminas", false]);
    expect(el.querySelector(".nx-voice__interim")!.textContent).toBe("veinte láminas");
    expect(el.querySelector(".nx-voice__final")!.textContent).toBe("");
    await wait(1000);
    r.say(["veinte láminas calibre catorce", true, 0.92], [" para Ferretería", false]);
    expect(el.querySelector(".nx-voice__final")!.textContent).toBe("veinte láminas calibre catorce");
    expect(el.querySelector(".nx-voice__interim")!.textContent).toBe("para Ferretería");
    // La transcripción no es una región viva: el lector no oye cada palabra.
    expect(el.querySelector(".nx-voice__text")!.hasAttribute("aria-live")).toBe(false);
    expect(live(el)).toBe("");
    r.say(["veinte láminas calibre catorce", true, 0.92], [" para Ferretería El Tornillo", true, 0.88]);

    await wait(1900);
    expect(r.stopped).toBe(false);
    await wait(100);
    expect(r.stopped).toBe(true);
    expect(el.state).toBe("processing");
    expect(micOff()).toBe(true);
    expect(FakeAC.all[0].closed).toBe(true);
    await wait(20);
    expect(el.state).toBe("idle");
    expect(t.texts).toEqual([{ text: "veinte láminas calibre catorce para Ferretería El Tornillo", confidence: 0.9, final: true }]);
    expect(t.partials).toEqual(["veinte láminas", "veinte láminas calibre catorce para Ferretería", "veinte láminas calibre catorce para Ferretería El Tornillo"]);
    expect(t.log).toEqual(["start", "partial", "partial", "partial", "text", "end"]);
    expect(t.ends).toEqual([{ text: "veinte láminas calibre catorce para Ferretería El Tornillo", canceled: false }]);
    expect(live(el)).toBe("Dictado: veinte láminas calibre catorce para Ferretería El Tornillo");
    expect(el.text).toBe("veinte láminas calibre catorce para Ferretería El Tornillo");
  });

  it("tocar otra vez termina; sin resultado definitivo entrega lo parcial (`final: false`)", async () => {
    browser();
    const el = mount();
    const t = track(el);
    btn(el).click();
    await wait(0);
    rec().say(["entrega el viernes", false]);
    btn(el).click();
    expect(rec().stopped).toBe(true);
    // Mientras procesa, tocar no hace nada.
    btn(el).click();
    expect(FakeRec.all).toHaveLength(1);
    await wait(20);
    expect(t.texts).toEqual([{ text: "entrega el viernes", confidence: null, final: false }]);
  });

  it("si el final del navegador no llega, se queda con lo que hay", async () => {
    browser();
    const el = mount();
    const t = track(el);
    btn(el).click();
    await wait(0);
    const r = rec();
    r.stop = () => void (r.stopped = true);
    r.say(["listo", true]);
    el.stop();
    await wait(3900);
    expect(t.texts).toHaveLength(0);
    await wait(200);
    expect(t.texts.map((x) => x.text)).toEqual(["listo"]);
  });

  it("el idioma sale de `locale` o del `lang` más cercano", async () => {
    browser();
    document.body.innerHTML = `<div lang="en-US"><nx-voice></nx-voice></div><nx-voice locale="pt_BR"></nx-voice>`;
    const [a, b] = document.querySelectorAll("nx-voice");
    await a.start();
    expect(rec().lang).toBe("en-US");
    a.cancel();
    await b.start();
    expect(rec().lang).toBe("pt-BR");
  });

  it("en Android, una frase por toma (el modo continuo repite resultados)", async () => {
    browser();
    Object.defineProperty(navigator, "userAgent", { value: "Mozilla/5.0 (Linux; Android 14) Chrome/130", configurable: true });
    const el = mount();
    await el.start();
    expect(rec().continuous).toBe(false);
  });

  it("empezar otro detiene el que estaba escuchando", async () => {
    browser();
    document.body.innerHTML = `<nx-voice id="a"></nx-voice><nx-voice id="b"></nx-voice>`;
    const [a, b] = document.querySelectorAll("nx-voice");
    await a.start();
    const first = rec();
    first.say(["uno", true]);
    await b.start();
    expect(first.stopped).toBe(true);
    expect(b.state).toBe("listening");
  });
});

describe("errores", () => {
  it("permiso negado: el mensaje con cómo darlo", async () => {
    browser({ deny: "NotAllowedError" });
    const el = mount();
    const t = track(el);
    await el.start();
    expect(el.state).toBe("error");
    expect(status(el)).toBe(VOICE_LABELS.notAllowed);
    expect(t.errors).toEqual([{ code: "not-allowed", message: VOICE_LABELS.notAllowed }]);
    expect(live(el)).toBe(VOICE_LABELS.notAllowed);
    expect(FakeRec.all).toHaveLength(0);
    expect(FakeAC.all[0].closed).toBe(true);
    expect(t.log).toEqual(["error", "end"]);
  });

  it("el reconocimiento: not-allowed, no-speech y network", async () => {
    for (const [code, want, msg] of [
      ["not-allowed", "not-allowed", VOICE_LABELS.notAllowed],
      ["no-speech", "no-speech", VOICE_LABELS.noSpeech],
      ["network", "network", VOICE_LABELS.network],
      ["audio-capture", "no-mic", VOICE_LABELS.noMic],
    ]) {
      browser();
      const el = mount();
      const t = track(el);
      await el.start();
      rec().fail(code);
      expect(t.errors).toEqual([{ code: want, message: msg }]);
      expect(status(el)).toBe(msg);
      expect(micOff()).toBe(true);
      // `onend` llega después del error: no hay una segunda entrega.
      expect(t.log.filter((x) => x === "end")).toHaveLength(1);
      // Se puede volver a intentar.
      await el.start();
      expect(el.state).toBe("listening");
      el.cancel();
    }
  });

  it("sin oír nada en 8 s: «No te entendí»", async () => {
    browser();
    const el = mount();
    const t = track(el);
    await el.start();
    await wait(7900);
    expect(el.state).toBe("listening");
    await wait(200);
    expect(rec().stopped).toBe(true);
    await wait(20);
    expect(t.errors.map((e) => e.code)).toEqual(["no-speech"]);
    expect(t.texts).toHaveLength(0);
  });
});

describe("mantener para hablar", () => {
  it("con el puntero: escucha mientras se mantiene, aunque haya silencio", async () => {
    browser();
    const el = mount("hold");
    const t = track(el);
    const b = btn(el);
    b.setPointerCapture = () => {};
    b.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1, bubbles: true, cancelable: true }));
    await wait(0);
    expect(el.state).toBe("listening");
    rec().say(["tubo", true]);
    await wait(9000);
    expect(el.state).toBe("listening");
    b.dispatchEvent(new PointerEvent("pointerup", { button: 0, pointerId: 1, bubbles: true }));
    // El clic que sigue al soltar no vuelve a empezar.
    b.dispatchEvent(new MouseEvent("click", { detail: 1, bubbles: true }));
    expect(rec().stopped).toBe(true);
    expect(el.state).toBe("processing");
    await wait(20);
    expect(t.texts.map((x) => x.text)).toEqual(["tubo"]);
    expect(FakeRec.all).toHaveLength(1);
  });

  it("con la barra espaciadora sobre el botón; Enter alterna", async () => {
    browser();
    const el = mount("hold");
    const b = btn(el);
    const down = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    b.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    await wait(0);
    expect(el.state).toBe("listening");
    b.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true, cancelable: true }));
    rec().say(["ángulo", true]);
    const up = new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true });
    b.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(rec().stopped).toBe(true);
    // El clic que la barra dispara al soltar se ignora.
    b.dispatchEvent(new MouseEvent("click", { detail: 0, bubbles: true }));
    expect(FakeRec.all).toHaveLength(1);
    await wait(500);
    // Enter (clic sin puntero) alterna, para quien no puede mantener.
    b.dispatchEvent(new MouseEvent("click", { detail: 0, bubbles: true }));
    await wait(0);
    expect(el.state).toBe("listening");
  });

  it("Escape sobre el botón cancela sin entregar", async () => {
    browser();
    const el = mount();
    const t = track(el);
    await el.start();
    rec().say(["algo", true]);
    btn(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(el.state).toBe("idle");
    expect(rec().aborted).toBe(true);
    expect(micOff()).toBe(true);
    await wait(50);
    expect(t.texts).toHaveLength(0);
    expect(t.ends).toEqual([{ text: "", canceled: true }]);
  });
});

describe("atajo de página", () => {
  const key = (type: string, init: KeyboardEventInit) => {
    const e = new KeyboardEvent(type, { bubbles: true, cancelable: true, ...init });
    document.body.dispatchEvent(e);
    return e;
  };

  it("Alt+V empieza y termina (tocar para hablar)", async () => {
    browser();
    const el = mount('hotkey="Alt+V"');
    // Alt solo (el toque de <nx-keytips>) no hace nada.
    key("keydown", { key: "Alt", code: "AltLeft", altKey: true });
    expect(el.state).toBe("idle");
    const e = key("keydown", { key: "√", code: "KeyV", altKey: true });
    expect(e.defaultPrevented).toBe(true);
    await wait(0);
    expect(el.state).toBe("listening");
    // Mantener la tecla (repeat) no alterna.
    key("keydown", { key: "v", code: "KeyV", altKey: true, repeat: true });
    expect(el.state).toBe("listening");
    key("keydown", { key: "v", code: "KeyV", altKey: true });
    expect(el.state).toBe("processing");
  });

  it("con `hold`: escucha mientras se mantiene el atajo", async () => {
    browser();
    const el = mount('hotkey="Alt+V" hold');
    key("keydown", { key: "v", code: "KeyV", altKey: true });
    await wait(0);
    expect(el.state).toBe("listening");
    key("keyup", { key: "v", code: "KeyV", altKey: true });
    expect(el.state).toBe("processing");
  });

  it("con los atajos de <nx-keytips> abiertos, la letra es de ellos", async () => {
    browser();
    const el = mount('hotkey="Alt+V"', "<nx-keytips></nx-keytips>");
    (document.querySelector("nx-keytips") as unknown as { open: boolean }).open = true;
    const e = key("keydown", { key: "v", code: "KeyV", altKey: true });
    expect(e.defaultPrevented).toBe(false);
    await wait(0);
    expect(el.state).toBe("idle");
  });

  it("deshabilitado o desconectado, el atajo no hace nada", async () => {
    browser();
    const el = mount('hotkey="Alt+V" disabled');
    key("keydown", { key: "v", code: "KeyV", altKey: true });
    await wait(0);
    expect(el.state).toBe("idle");
    el.disabled = false;
    el.remove();
    key("keydown", { key: "v", code: "KeyV", altKey: true });
    await wait(0);
    expect(el.state).toBe("idle");
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe("privacidad: el micrófono se apaga siempre", () => {
  it("al ocultar la pestaña", async () => {
    browser();
    const el = mount();
    await el.start();
    rec().say(["hola", true]);
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(rec().stopped).toBe(true);
    expect(micOff()).toBe(true);
    expect(FakeAC.all[0].closed).toBe(true);
    delete (document as unknown as Record<string, unknown>).hidden;
  });

  it("al desconectar el elemento (y lo que llegue tarde se ignora)", async () => {
    browser();
    const el = mount();
    const t = track(el);
    await el.start();
    const r = rec();
    el.remove();
    expect(r.aborted).toBe(true);
    expect(micOff()).toBe(true);
    expect(FakeAC.all[0].closed).toBe(true);
    r.say(["tarde", true]);
    r.onend?.();
    await wait(3000);
    expect(t.texts).toHaveLength(0);
    expect(t.ends).toEqual([{ text: "", canceled: true }]);
  });

  it("al desconectar mientras pide el permiso", async () => {
    browser();
    let grant!: (s: unknown) => void;
    getUserMedia.mockImplementation(() => new Promise((r) => (grant = r)));
    const el = mount();
    const p = el.start();
    expect(el.state).toBe("asking");
    expect(btn(el).getAttribute("aria-pressed")).toBe("true");
    el.remove();
    grant({ getTracks: () => tracks });
    await p;
    expect(micOff()).toBe(true);
    expect(FakeRec.all).toHaveLength(0);
  });

  it("al tope de `max-seconds`, aunque siga hablando", async () => {
    browser();
    const el = mount('max-seconds="3"');
    const t = track(el);
    await el.start();
    for (let i = 0; i < 5; i++) {
      rec().say([`palabra ${i}`, true]);
      await wait(700);
    }
    expect(rec().stopped).toBe(true);
    expect(micOff()).toBe(true);
    await wait(20);
    expect(t.texts).toHaveLength(1);
  });

  it("`disabled` mientras escucha cancela", async () => {
    browser();
    const el = mount();
    await el.start();
    el.disabled = true;
    expect(el.state).toBe("idle");
    expect(micOff()).toBe(true);
  });

  it("sin getUserMedia (sin medidor), la API del navegador igual dicta", async () => {
    browser({ mic: false });
    const el = mount();
    const t = track(el);
    await el.start();
    expect(el.state).toBe("listening");
    rec().say(["hola", true]);
    el.stop();
    await wait(20);
    expect(t.texts.map((x) => x.text)).toEqual(["hola"]);
  });
});

describe("el medidor", () => {
  it("el anillo sigue el volumen y se limpia al terminar", async () => {
    browser();
    const el = mount();
    await el.start();
    FakeAC.amp = 16;
    await wait(300);
    const level = Number(btn(el).style.getPropertyValue("--nx-voice-level"));
    expect(level).toBeGreaterThan(0.4);
    el.cancel();
    expect(btn(el).style.getPropertyValue("--nx-voice-level")).toBe("");
  });
});

describe("entrega", () => {
  const FORM = `<nx-paste-fill id="pf"><form>
    <label>Correo <input name="correo" type="email"></label>
    <label>Fecha de entrega <input name="entrega" type="date"></label>
  </form></nx-paste-fill>`;

  it("a un <nx-paste-fill>: llama `fill(text)`, muestra el resumen y deshace", async () => {
    browser();
    const el = mount('for="pf"', FORM);
    const pf = document.getElementById("pf") as NxPasteFill;
    const fill = vi.spyOn(pf, "fill");
    const undo = vi.spyOn(pf, "undo");
    await el.start();
    rec().say(["escribir a compras@eltornillo.co con entrega el 15/10/2026", true]);
    el.stop();
    await wait(20);
    await vi.waitFor(() => expect(el.querySelector(".nx-voice__done")!.hasAttribute("hidden")).toBe(false));
    expect(fill).toHaveBeenCalledWith("escribir a compras@eltornillo.co con entrega el 15/10/2026");
    expect(pf.querySelector<HTMLInputElement>("[name=correo]")!.value).toBe("compras@eltornillo.co");
    expect(pf.querySelector<HTMLInputElement>("[name=entrega]")!.value).toBe("2026-10-15");
    expect(el.querySelector(".nx-voice__done span")!.textContent).toBe("Llené 2 campos");
    expect(live(el)).toBe("Dictado: escribir a compras@eltornillo.co con entrega el 15/10/2026. Llené 2 campos");
    const u = el.querySelector<HTMLButtonElement>(".nx-voice__undo")!;
    expect(u.hidden).toBe(false);
    expect(u.textContent).toBe("Deshacer");
    u.click();
    expect(undo).toHaveBeenCalled();
    expect(pf.querySelector<HTMLInputElement>("[name=correo]")!.value).toBe("");
    expect(el.querySelector(".nx-voice__done span")!.textContent).toBe("Se deshizo el dictado");
    expect(u.hidden).toBe(true);
  });

  it("a un <nx-paste-fill> sin datos: lo dice y no ofrece deshacer", async () => {
    browser();
    const el = mount('for="pf"', FORM);
    await el.start();
    rec().say(["hola buenos días", true]);
    el.stop();
    await wait(20);
    await vi.waitFor(() => expect(el.querySelector(".nx-voice__done span")!.textContent).toBe("No encontré datos para el formulario"));
    expect(el.querySelector<HTMLButtonElement>(".nx-voice__undo")!.hidden).toBe(true);
  });

  it("`nx-voice-text` cancelado no entrega", async () => {
    browser();
    const el = mount('for="pf"', FORM);
    const fill = vi.spyOn(document.getElementById("pf") as NxPasteFill, "fill");
    el.addEventListener("nx-voice-text", (e) => e.preventDefault());
    const t = track(el);
    await el.start();
    rec().say(["compras@eltornillo.co", true]);
    el.stop();
    await wait(20);
    expect(t.texts).toHaveLength(1);
    expect(fill).not.toHaveBeenCalled();
    expect(t.log.at(-1)).toBe("end");
  });

  it("a un <textarea>: dicta en el cursor con puntuación, y «borrar eso» en la siguiente toma", async () => {
    browser();
    const el = mount('for="obs"', `<textarea id="obs">Descargar por la puerta 3.</textarea>`);
    const ta = document.getElementById("obs") as HTMLTextAreaElement;
    ta.setSelectionRange(ta.value.length, ta.value.length);
    const events: string[] = [];
    ta.addEventListener("input", () => events.push("input"));
    ta.addEventListener("change", () => events.push("change"));
    await el.start();
    rec().say(["cuidado coma material frágil punto", true]);
    el.stop();
    await wait(20);
    await vi.waitFor(() => expect(ta.value).toBe("Descargar por la puerta 3. Cuidado, material frágil."));
    expect(events).toEqual(["input", "change"]);
    expect(ta.selectionStart).toBe(ta.value.length);
    await el.start();
    rec().say(["borrar eso", true]);
    el.stop();
    await wait(20);
    await vi.waitFor(() => expect(ta.value).toBe("Descargar por la puerta 3."));
  });

  it("a un <input> con texto seleccionado: lo reemplaza", async () => {
    browser();
    const el = mount('for="cli"', `<input id="cli" value="Cliente: Ferretería X">`);
    const input = document.getElementById("cli") as HTMLInputElement;
    input.setSelectionRange(20, 21);
    await el.start();
    rec().say(["El Tornillo", true]);
    el.stop();
    await wait(20);
    await vi.waitFor(() => expect(input.value).toBe("Cliente: Ferretería El Tornillo"));
  });

  it('`commands="false"`: «borrar eso» se escribe', async () => {
    browser();
    const el = mount('for="obs" commands="false"', `<textarea id="obs"></textarea>`);
    const ta = document.getElementById("obs") as HTMLTextAreaElement;
    await el.start();
    rec().say(["hay que borrar eso", true]);
    el.stop();
    await wait(20);
    await vi.waitFor(() => expect(ta.value).toBe("Hay que borrar eso"));
  });

  it("sin `for` (o con un id que no existe), solo el evento", async () => {
    browser();
    const el = mount('for="no-existe"');
    const t = track(el);
    await el.start();
    rec().say(["hola", true]);
    el.stop();
    await wait(20);
    expect(t.texts.map((x) => x.text)).toEqual(["hola"]);
    expect(el.querySelector<HTMLElement>(".nx-voice__done")!.hidden).toBe(true);
  });
});

describe("alternativa con servidor", () => {
  /** Una respuesta NDJSON en trozos. */
  const ndjson = (...lines: object[]) => new Response(lines.map((l) => `${JSON.stringify(l)}\n`).join(""), { headers: { "content-type": "application/x-ndjson" } });

  it("graba, detecta el silencio por el volumen, manda el audio y lee los parciales", async () => {
    browser({ speech: true, recorder: true });
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ndjson({ partial: "veinte" }, { partial: "veinte láminas" }, { text: "veinte láminas calibre 14", confidence: 0.8 }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('engine="server" endpoint="/api/voz" locale="es-CO"');
    const t = track(el);
    await el.start();
    expect(FakeRec.all).toHaveLength(0);
    const mr = FakeMR.all[0];
    expect(mr.mimeType).toBe("audio/ogg;codecs=opus");
    expect(mr.state).toBe("recording");
    expect(el.state).toBe("listening");
    // Habla 1 s y calla: a los 2 s de silencio termina.
    FakeAC.amp = 16;
    await wait(1000);
    FakeAC.amp = 0;
    await wait(1900);
    expect(el.state).toBe("listening");
    await wait(200);
    expect(mr.state).toBe("inactive");
    expect(micOff()).toBe(true);
    expect(FakeAC.all[0].closed).toBe(true);
    await vi.waitFor(() => expect(t.texts).toHaveLength(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/voz");
    expect(init.method).toBe("POST");
    const body = init.body as FormData;
    const audio = body.get("audio") as File;
    expect(audio).toBeInstanceOf(Blob);
    expect(audio.name).toBe("voz.ogg");
    expect(body.get("lang")).toBe("es-CO");
    expect(t.partials).toEqual(["veinte", "veinte láminas"]);
    expect(t.texts).toEqual([{ text: "veinte láminas calibre 14", confidence: 0.8, final: true }]);
    expect(el.state).toBe("idle");
  });

  it("respuesta JSON `{text}`", async () => {
    browser({ speech: false, recorder: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{\n  "text": "tubo estructural"\n}', { headers: { "content-type": "application/json" } })));
    const el = mount('endpoint="/api/voz"');
    const t = track(el);
    await el.start();
    el.stop();
    await vi.waitFor(() => expect(t.texts.map((x) => x.text)).toEqual(["tubo estructural"]));
  });

  it("el servidor falla o no entiende nada", async () => {
    browser({ speech: false, recorder: true });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("caído", { status: 503 })));
    const el = mount('endpoint="/api/voz"');
    const t = track(el);
    await el.start();
    el.stop();
    await vi.waitFor(() => expect(t.errors.map((e) => e.code)).toEqual(["server"]));
    expect(status(el)).toBe(VOICE_LABELS.server);
    vi.stubGlobal("fetch", vi.fn(async () => ndjson({ error: "cuota" })));
    await el.start();
    el.stop();
    await vi.waitFor(() => expect(t.errors.map((e) => e.code)).toEqual(["server", "server"]));
    vi.stubGlobal("fetch", vi.fn(async () => ndjson({ text: "" })));
    await el.start();
    el.stop();
    await vi.waitFor(() => expect(t.errors.map((e) => e.code)).toEqual(["server", "server", "no-speech"]));
  });

  it("las pistas se detienen al ocultar la pestaña, al desconectar y al tope", async () => {
    browser({ speech: false, recorder: true });
    const fetchMock = vi.fn(async () => ndjson({ text: "hola" }));
    vi.stubGlobal("fetch", fetchMock);
    // Al ocultar la pestaña: termina y entrega lo grabado.
    let el = mount('endpoint="/api/voz"');
    await el.start();
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    delete (document as unknown as Record<string, unknown>).hidden;
    expect(micOff()).toBe(true);
    expect(FakeMR.all[0].state).toBe("inactive");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Al desconectar: nada se manda.
    browser({ speech: false, recorder: true });
    el = mount('endpoint="/api/voz"');
    await el.start();
    el.remove();
    expect(micOff()).toBe(true);
    await wait(100);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Al tope de segundos, aunque haya ruido todo el tiempo.
    browser({ speech: false, recorder: true });
    el = mount('endpoint="/api/voz" max-seconds="2"');
    await el.start();
    FakeAC.amp = 20;
    await wait(1900);
    expect(micOff()).toBe(false);
    await wait(200);
    expect(micOff()).toBe(true);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("cancelar mientras transcribe aborta la petición", async () => {
    browser({ speech: false, recorder: true });
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise(() => {});
      }),
    );
    const el = mount('endpoint="/api/voz"');
    const t = track(el);
    await el.start();
    el.stop();
    await vi.waitFor(() => expect(signal).toBeDefined());
    expect(el.state).toBe("processing");
    btn(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(signal!.aborted).toBe(true);
    expect(el.state).toBe("idle");
    expect(t.ends.at(-1)).toEqual({ text: "", canceled: true });
  });
});
