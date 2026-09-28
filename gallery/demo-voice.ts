/**
 * Galería: `<nx-voice>`. Un pedido rápido de bodega (cliente, producto, cantidad, calibre, entrega y
 * observaciones) envuelto en `<nx-paste-fill>`, con el botón de dictar arriba, y un `<textarea>` de
 * observaciones donde se dicta con la puntuación dicha.
 *
 * El agente que construye la galería no puede probar un micrófono, así que hay «Probar sin
 * micrófono»: tres frases que recorren los mismos eventos (parciales y final) con una
 * `SpeechRecognition` de mentira y un audio sintético en lugar del micrófono (el anillo reacciona a
 * ese audio). Con «Usar el servidor», los dos botones pasan a `engine="server"` contra
 * `/demo/voice/transcribe`, que responde un texto fijo (o la frase simulada).
 *
 * `/demo/voice/fill` es el «servidor» de `<nx-paste-fill>`: el extractor local no sabe de productos
 * ni de calibres, y este entiende pedidos de bodega como lo haría el backend de la app.
 */
import "../src/components/paste-fill/index";
import "../src/components/voice/index";
import { extract } from "../src/components/paste-fill/logic";
import type { NxVoice } from "../src/components/voice/index";
import { foldText } from "../src/core/text";
import { addDemoRoute } from "./demo-api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Phrase = { label: string; target: "order" | "notes"; text: string };
/** Como las entrega el reconocimiento de Chrome: sin puntuación y con los números en cifras. */
const PHRASES: Phrase[] = [
  { label: "«20 láminas galvanizadas calibre 14…»", target: "order", text: "20 láminas galvanizadas calibre 14 para Ferretería El Tornillo entrega el viernes" },
  {
    label: "«Descargar por la puerta 3 coma…»",
    target: "notes",
    text: "descargar por la puerta 3 coma con montacargas punto y aparte quién recibe en la portería signo de interrogación",
  },
  {
    label: "«35 varillas corrugadas para Construcciones Rivera…»",
    target: "order",
    text: "35 varillas corrugadas para Construcciones Rivera entrega el 15 de octubre observaciones llamar antes de llegar",
  },
];
const FIXED = PHRASES[0].text;
/** La frase que el «servidor» de transcripción devuelve la próxima vez (la de la simulación). */
let pending = "";

// ---------------------------------------------------------------- el «servidor»

const PRODUCTS: [RegExp, string][] = [
  [/laminas? galvanizadas?/, "LAM-GALV"],
  [/laminas?(?: hr| en caliente)?/, "LAM-HR"],
  [/varillas? corrugadas?|varillas?/, "VAR-12"],
  [/tubos?(?: estructural(?:es)?)?/, "TUB-2"],
  [/angulos?/, "ANG-18"],
  [/mallas?(?: electrosoldadas?)?/, "MAL-15"],
];
const WORDS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12, catorce: 14,
  quince: 15, dieciseis: 16, dieciocho: 18, veinte: 20, veintidos: 22, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
};
const NUM = `(\\d+|${Object.keys(WORDS).join("|")})`;
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s]);

type Field = { name: string; value: string; confidence: number; source?: { start: number; end: number } };

/** Un pedido de bodega dicho de corrido → los campos del formulario. */
function readOrder(text: string): Field[] {
  const low = foldText(text);
  const out: Field[] = [];
  const at = (m: RegExpExecArray, g = 0) => {
    const start = m.index + m[0].indexOf(m[g]);
    return { start, end: start + m[g].length };
  };
  for (const [re, code] of PRODUCTS) {
    const m = new RegExp(`${NUM}\\s+(${re.source})`).exec(low);
    if (!m) continue;
    out.push({ name: "cantidad", value: String(num(m[1])), confidence: 0.96, source: at(m, 1) });
    out.push({ name: "producto", value: code, confidence: 0.93, source: at(m, 2) });
    break;
  }
  const cal = new RegExp(`calibre\\s+${NUM}`).exec(low);
  if (cal) out.push({ name: "calibre", value: String(num(cal[1])), confidence: 0.95, source: at(cal) });
  const who = /(?:para|cliente)\s+(.+?)(?=\s*(?:,|\.|\bentrega\b|\bcon entrega\b|\bobservaciones?\b|$))/.exec(low);
  if (who && !/^el \d|^el (lunes|martes|miercoles|jueves|viernes|sabado|domingo)/.test(who[1])) {
    const s = at(who, 1);
    out.push({ name: "cliente", value: text.slice(s.start, s.end).replace(/(^|\s)\p{Ll}/gu, (c) => c.toUpperCase()), confidence: 0.88, source: s });
  }
  const date = extract(text).find((f) => f.kind === "date");
  if (date) out.push({ name: "entrega", value: date.value, confidence: 0.9, source: { start: date.start, end: date.end } });
  const obs = /(?:observaciones?|nota)\s*:?\s+(.+)$/.exec(low);
  if (obs) {
    const s = at(obs, 1);
    const v = text.slice(s.start, s.end).trim();
    if (v) out.push({ name: "observaciones", value: v[0].toUpperCase() + v.slice(1), confidence: 0.9, source: s });
  }
  return out;
}

addDemoRoute("/demo/voice", async (req, out) => {
  const path = req.url.pathname.slice(req.url.pathname.indexOf("/demo/voice"));
  out.type("application/x-ndjson");
  const send = (o: object) => !out.closed() && out.write(`${JSON.stringify(o)}\n`);
  if (path === "/demo/voice/transcribe") {
    // Un texto fijo (o la frase que se está simulando), con parciales como un servidor que transcribe por partes.
    const text = pending || FIXED;
    pending = "";
    const words = text.split(" ");
    await sleep(350);
    for (let i = 3; i < words.length; i += 3) {
      send({ partial: words.slice(0, i).join(" ") });
      await sleep(160);
    }
    send({ text, confidence: 0.91 });
    return out.end();
  }
  if (path === "/demo/voice/fill") {
    let text = "";
    try {
      text = String(JSON.parse(req.body || "{}").text ?? "");
    } catch {
      /* vacío */
    }
    await sleep(300);
    for (const f of readOrder(text)) {
      if (out.closed()) return;
      send({ type: "field", ...f });
      await sleep(90);
    }
    send({ type: "done" });
    return out.end();
  }
  out.status(404);
  out.end();
});

// ---------------------------------------------------------------- la simulación

type W = Record<string, unknown>;

/** Una `SpeechRecognition` de mentira que «oye» `text` palabra por palabra. */
function fakeRecognition(text: string, onWord: () => void) {
  return class DemoRecognition {
    lang = "";
    interimResults = false;
    continuous = false;
    maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onend: (() => void) | null = null;
    #timers: number[] = [];
    start() {
      const words = text.split(" ");
      const result = (t: string, isFinal: boolean) => Object.assign([{ transcript: t, confidence: isFinal ? 0.92 : 0 }], { isFinal });
      words.forEach((_, i) => {
        this.#timers.push(
          window.setTimeout(() => {
            onWord();
            const last = i === words.length - 1;
            this.onresult?.({ results: [result(words.slice(0, i + 1).join(" "), last)] });
          }, 500 + i * 190),
        );
      });
    }
    stop() {
      this.#timers.push(window.setTimeout(() => this.onend?.(), 150));
    }
    abort() {
      this.#timers.forEach(clearTimeout);
    }
  };
}

/** Un «micrófono» sintético: un tono suave que sube con cada palabra, para que el anillo reaccione. */
function fakeMic(): { stream: MediaStream; word(): void; close(): void } | null {
  const AC = (window as unknown as W).AudioContext as typeof AudioContext | undefined;
  if (!AC) return null;
  const ctx = new AC();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const dest = ctx.createMediaStreamDestination();
  osc.frequency.value = 180;
  gain.gain.value = 0;
  osc.connect(gain).connect(dest);
  osc.start();
  return {
    stream: dest.stream,
    word() {
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(0.5 + Math.random() * 0.4, t);
      gain.gain.linearRampToValueAtTime(0.005, t + 0.17);
    },
    close: () => void ctx.close().catch(() => {}),
  };
}

/** Dicta `phrase` en `voice` sin micrófono: instala la API y el micrófono de mentira mientras dura. */
async function simulate(voice: NxVoice, phrase: Phrase): Promise<void> {
  // Lo que estuviera escuchando se suelta antes de cambiar la API por la de mentira.
  voice.cancel();
  const w = window as unknown as W;
  const md = navigator.mediaDevices as (MediaDevices & W) | undefined;
  const saved = { SR: w.SpeechRecognition, webkit: w.webkitSpeechRecognition };
  const mic = fakeMic();
  const server = voice.getAttribute("engine") === "server";
  const words = phrase.text.split(" ").length;
  let spoken = 0;
  const onWord = () => {
    mic?.word();
    // Con `hold` nada termina por silencio: se «suelta» el botón al terminar la frase.
    if (++spoken === words && voice.hold) window.setTimeout(() => voice.stop(), 700);
  };
  const Recognition = fakeRecognition(phrase.text, onWord);
  w.SpeechRecognition = w.webkitSpeechRecognition = Recognition;
  if (md && mic) Object.defineProperty(md, "getUserMedia", { configurable: true, value: async () => mic.stream });
  // Con el servidor no hay SpeechRecognition: el audio sintético «dice» las palabras a su ritmo.
  const timers: number[] = [];
  if (server) {
    pending = phrase.text;
    for (let i = 0; i < words; i++) timers.push(window.setTimeout(onWord, 500 + i * 190));
  }
  const restore = () => {
    timers.forEach(clearTimeout);
    if (saved.SR === undefined) delete w.SpeechRecognition;
    else w.SpeechRecognition = saved.SR;
    if (saved.webkit === undefined) delete w.webkitSpeechRecognition;
    else w.webkitSpeechRecognition = saved.webkit;
    if (md && mic) delete (md as W).getUserMedia;
    window.setTimeout(() => mic?.close(), 500);
  };
  voice.addEventListener("nx-voice-end", restore, { once: true });
  await voice.start();
  // No arrancó (deshabilitado, sin soporte): se devuelve todo ya.
  if (voice.state !== "listening") {
    voice.removeEventListener("nx-voice-end", restore);
    restore();
  }
}

// ---------------------------------------------------------------- la página

export function mountVoiceDemo(root: HTMLElement): void {
  const order = root.querySelector<NxVoice>("#vc-voice")!;
  const notes = root.querySelector<NxVoice>("#vc-notes-voice")!;
  const log = root.querySelector<HTMLOListElement>("#vc-log")!;
  const support = root.querySelector<HTMLElement>("#vc-support")!;
  const serverBox = root.querySelector<HTMLInputElement>("#vc-server")!;

  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 10) log.lastElementChild!.remove();
  };

  const w = window as unknown as W;
  const native = !!(w.SpeechRecognition ?? w.webkitSpeechRecognition);
  support.textContent = native
    ? "Este navegador trae la API de voz: toca el micrófono y habla (pide permiso la primera vez). En Chrome y Edge el audio se reconoce en los servidores de Google o Microsoft."
    : "Este navegador no trae la API de voz, así que los botones de dictar no aparecen: el formulario sigue igual. Usa «Probar sin micrófono», o marca «Usar el servidor» para grabar de verdad y que el servidor de mentira responda.";

  for (const [name, voice] of [
    ["pedido", order],
    ["observaciones", notes],
  ] as const) {
    voice.addEventListener("nx-voice-start", () => add(`${name}: nx-voice-start`));
    let last = "";
    voice.addEventListener("nx-voice-partial", (e) => {
      // Uno de cada tanto: el log no es para cada palabra.
      if (e.detail.text.length - last.length < 12) return;
      last = e.detail.text;
      add(`${name}: nx-voice-partial → «${e.detail.text}»`);
    });
    voice.addEventListener("nx-voice-text", (e) => {
      last = "";
      const c = e.detail.confidence;
      add(`${name}: nx-voice-text → «${e.detail.text}»${c === null ? "" : ` · ${Math.round(c * 100)} %`}${e.detail.final ? "" : " · parcial"}`);
    });
    voice.addEventListener("nx-voice-error", (e) => add(`${name}: nx-voice-error → ${e.detail.code}`));
    voice.addEventListener("nx-voice-end", (e) => add(`${name}: nx-voice-end${e.detail.canceled ? " (cancelado)" : ""}`));
    voice.addEventListener("nx-voice-unavailable", () => add(`${name}: nx-voice-unavailable`));
  }
  root.querySelector<HTMLElement>("#vc-fill")!.addEventListener("nx-paste-fill-done", (e) => add(`nx-paste-fill-done → ${Object.keys(e.detail.values).join(", ") || "nada"}`));
  root.querySelector("#vc-form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target as HTMLFormElement));
    add(`submit → ${JSON.stringify(data)}`);
  });

  serverBox.addEventListener("change", () => {
    for (const v of [order, notes]) {
      if (serverBox.checked) {
        v.setAttribute("engine", "server");
        v.setAttribute("endpoint", "/demo/voice/transcribe");
      } else {
        v.removeAttribute("engine");
        v.removeAttribute("endpoint");
      }
    }
    add(serverBox.checked ? 'engine="server" → graba y manda el audio a /demo/voice/transcribe' : "engine=\"auto\" → la API del navegador si la hay");
  });

  const box = root.querySelector<HTMLElement>("#vc-phrases")!;
  for (const p of PHRASES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "vc-phrase";
    b.textContent = p.label;
    b.title = p.text;
    b.addEventListener("click", () => void simulate(p.target === "order" ? order : notes, p));
    box.append(b);
  }
}
