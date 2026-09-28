/**
 * `<nx-voice>`: lógica pura que va con el elemento: atributos, lo que dice `SpeechRecognition`, sus
 * errores, el volumen y el atajo de página. El dictado en un campo (`voice-text.ts`) y la grabación para el
 * servidor (`voice-server.ts`) van en chunks aparte.
 */
import type { VoiceEngine, VoiceErrorCode, VoiceHotkey, VoiceLayout } from "./types";

export const cleanVoiceEngine = (v: unknown): VoiceEngine => (v === "browser" || v === "server" ? v : "auto");
export const cleanVoiceLayout = (v: unknown): VoiceLayout => (v === "stacked" ? v : "inline");

/** Un número del atributo dentro de `[min, max]`, o `fallback` si no es un número. */
export function clampVoice(v: unknown, fallback: number, min: number, max: number): number {
  const n = v === null || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

// ---------------------------------------------------------------- lo que dicen el navegador y el servidor

type SpeechAlt = { transcript: string; confidence?: number };
type SpeechResult = ArrayLike<SpeechAlt> & { isFinal?: boolean };

/** Lo definitivo y lo parcial de los resultados de `SpeechRecognition` (todos, no solo los nuevos:
 *  así un motor que reescribe un resultado no duplica palabras), y la confianza media de lo definitivo. */
export function speechTranscript(results: ArrayLike<SpeechResult> | null | undefined): { final: string; interim: string; confidence: number | null } {
  const fin: string[] = [];
  const mid: string[] = [];
  let sum = 0;
  let n = 0;
  for (let i = 0; i < (results?.length ?? 0); i++) {
    const r = results![i];
    const alt = r?.[0];
    const t = String(alt?.transcript ?? "").trim();
    if (!t) continue;
    if (r.isFinal) {
      fin.push(t);
      // Chrome da 0 cuando no la sabe: eso no es «nada de confianza».
      if (typeof alt.confidence === "number" && alt.confidence > 0) (sum += Math.min(1, alt.confidence)), n++;
    } else mid.push(t);
  }
  return { final: fin.join(" "), interim: mid.join(" "), confidence: n ? sum / n : null };
}

/** El código de un error de `SpeechRecognition` («not-allowed», «no-speech»…) o del micrófono
 *  (`NotAllowedError`, `NotFoundError`…). `null` para «aborted» (lo detuvimos nosotros). */
export function voiceErrorCode(e: string | null | undefined): VoiceErrorCode | null {
  const c = String(e ?? "");
  if (c === "aborted") return null;
  if (/^(not-allowed|service-not-allowed|NotAllowedError|SecurityError|PermissionDeniedError)$/.test(c)) return "not-allowed";
  if (/^(no-speech|no-match)$/.test(c)) return "no-speech";
  if (c === "network") return "network";
  if (/^(audio-capture|NotFoundError|NotReadableError|OverconstrainedError|AbortError|DevicesNotFoundError|TrackStartError)$/.test(c)) return "no-mic";
  return "failed";
}

/** Qué tan fuerte suena un cuadro de `AnalyserNode.getByteTimeDomainData` (128 = silencio): 0–1,
 *  con la voz normal hacia la mitad. */
export function voiceLevel(bytes: ArrayLike<number>): number {
  let sum = 0;
  const n = bytes?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const v = (bytes[i] - 128) / 128;
    sum += v * v;
  }
  return n ? Math.min(1, Math.sqrt(sum / n) * 4) : 0;
}

// ---------------------------------------------------------------- atajo de página

const MODS: Record<string, keyof Omit<VoiceHotkey, "key">> = { alt: "alt", option: "alt", ctrl: "ctrl", control: "ctrl", shift: "shift", meta: "meta", cmd: "meta", command: "meta" };

/** «Alt+V», «Ctrl+Shift+D», «F2» → el atajo; `null` si no se entiende. */
export function parseVoiceHotkey(v: string | null | undefined): VoiceHotkey | null {
  const parts = String(v ?? "")
    .toLowerCase()
    .split("+")
    .map((p) => p.trim());
  const key = parts.pop();
  if (!key) return null;
  const hk: VoiceHotkey = { key: key === "space" ? " " : key, alt: false, ctrl: false, shift: false, meta: false };
  for (const p of parts) {
    if (!Object.hasOwn(MODS, p)) return null;
    hk[MODS[p]] = true;
  }
  return hk;
}

/** Si la tecla es el atajo. Las letras y los dígitos se comparan por la tecla física (`code`): con
 *  Alt en un Mac, `key` es «√» y no «v». Los modificadores tienen que ser exactamente los del atajo. */
export function voiceHotkeyMatches(hk: VoiceHotkey | null, e: { key: string; code?: string; altKey: boolean; ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }): boolean {
  if (!hk || e.altKey !== hk.alt || e.ctrlKey !== hk.ctrl || e.shiftKey !== hk.shift || e.metaKey !== hk.meta) return false;
  const k = hk.key;
  const key = String(e.key ?? "").toLowerCase();
  if (/^[a-z]$/.test(k)) return e.code === `Key${k.toUpperCase()}` || key === k;
  if (/^\d$/.test(k)) return e.code === `Digit${k}` || key === k;
  return key === k;
}

/** «Alt+V» tal como se muestra y va en `aria-keyshortcuts`. */
export function voiceHotkeyText(hk: VoiceHotkey): string {
  const key = hk.key === " " ? "Space" : hk.key.length === 1 ? hk.key.toUpperCase() : hk.key.replace(/^./, (c) => c.toUpperCase());
  return [hk.ctrl && "Control", hk.alt && "Alt", hk.shift && "Shift", hk.meta && "Meta", key].filter(Boolean).join("+");
}
