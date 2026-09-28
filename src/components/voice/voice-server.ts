/**
 * `<nx-voice>`, la alternativa con servidor (chunk aparte: solo baja cuando el navegador no reconoce
 * voz o con `engine="server"`). Graba con `MediaRecorder` el mismo `getUserMedia` del medidor y, al
 * terminar, hace `POST {endpoint}` con el audio (`FormData`: `audio`, `lang`). La respuesta es
 * `{text}` en JSON, texto plano, o NDJSON / `data:` de SSE con `{partial}` mientras transcribe y
 * `{text}` al final (`{error}` si no pudo).
 */
import { lineData, readLines } from "../../core/stream";
import type { VoiceServerLine } from "./types";

export interface VoiceRecording {
  /** Detiene la grabación y devuelve el audio. */
  stop(): Promise<Blob>;
}

/** Empieza a grabar `stream` en el primer formato que el navegador soporte. */
export function record(stream: MediaStream): VoiceRecording {
  const mime = pickVoiceMime((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => e.data?.size && parts.push(e.data);
  rec.start();
  return {
    stop: () =>
      new Promise<Blob>((resolve) => {
        const done = () => resolve(new Blob(parts, { type: rec.mimeType || mime || "audio/webm" }));
        if (rec.state === "inactive") return done();
        rec.onstop = done;
        // Si `stop` no llega (una pista que ya se cortó), no se queda esperando.
        setTimeout(done, 1500);
        rec.stop();
      }),
  };
}

/** Manda el audio y devuelve el texto (con su confianza si el servidor la da). Lanza si el servidor
 *  responde con error o manda `{error}`. */
export async function transcribe(url: string, audio: Blob, lang: string, signal: AbortSignal, onPartial: (text: string) => void): Promise<{ text: string; confidence: number | null }> {
  const body = new FormData();
  body.append("audio", new File([audio], voiceFileName(audio.type), { type: audio.type }));
  body.append("lang", lang);
  const res = await fetch(url, { method: "POST", body, signal, credentials: "same-origin", headers: { Accept: "application/json, application/x-ndjson, text/event-stream" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (/^text\/plain/i.test(type)) return { text: (await res.text()).trim(), confidence: null };
  let out = { text: "", confidence: null as number | null };
  let failed = "";
  const take = (data: string | null) => {
    const ev = parseVoiceLine(data);
    if (!ev) return;
    if ("error" in ev) failed = ev.error;
    else if ("partial" in ev) onPartial(ev.partial);
    else out = ev;
  };
  // JSON de una vez (puede venir con saltos de línea); NDJSON y SSE, línea por línea.
  if (/json/i.test(type) && !/nd/i.test(type)) take(await res.text());
  else await readLines(res, (line) => take(lineData(line)));
  if (failed) throw new Error(failed);
  return out;
}

// ---------------------------------------------------------------- lógica pura (se prueba aparte)

/** Los formatos que se prueban, en orden: Opus en WebM (Chrome, Firefox, Edge), en Ogg (Firefox) y
 *  MP4 (Safari). */
export const VOICE_MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg", "audio/mp4"];

/** El primer formato que el navegador graba (`MediaRecorder.isTypeSupported`), o `""` (el suyo). */
export function pickVoiceMime(supported: (type: string) => boolean): string {
  for (const t of VOICE_MIMES) {
    try {
      if (supported(t)) return t;
    } catch {
      /* un navegador que lanza en vez de decir que no */
    }
  }
  return "";
}

/** El nombre del archivo que va en el `FormData`: «voz.webm», «voz.ogg», «voz.m4a». */
export const voiceFileName = (mime: string): string => `voz.${/ogg/.test(mime) ? "ogg" : /mp4|aac/.test(mime) ? "m4a" : "webm"}`;

/** Confianza 0–1 (acepta 0–100), o `null`. */
const confidenceOf = (v: unknown): number | null => (typeof v === "number" && v >= 0 && v <= 100 ? (v > 1 ? v / 100 : v) : null);

/** Una línea del servidor (ya sin el `data:` de SSE): `{partial}`, `{text, confidence?}` o `{error}`. */
export function parseVoiceLine(data: string | null): VoiceServerLine | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(data ?? "");
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  if (o.error) return { error: typeof o.error === "string" ? o.error : "error" };
  if (typeof o.text === "string") return { text: o.text.trim(), confidence: confidenceOf(o.confidence) };
  if (typeof o.partial === "string") return { partial: o.partial.trim() };
  return null;
}
