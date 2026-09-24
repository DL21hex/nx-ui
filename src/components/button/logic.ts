/** Lógica pura del botón: sin DOM, para probarse en node. */
import { lineData } from "../../core/stream";
import type { LogLevel, StreamEvent } from "./types";

export { splitLines } from "../../core/stream";
export { formatElapsed } from "../../core/format";

const LEVELS = new Set<LogLevel>(["info", "ok", "warn", "error"]);

/** Un progreso en 0–1. Acepta 0–100 (un backend suele mandar porcentajes); lo demás es `null`. */
export function normalizeProgress(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.min(1, value > 1 ? value / 100 : value);
}

/**
 * Una línea del stream del backend, o `null` si no trae nada que pintar. Entiende:
 * - NDJSON: `{"msg":"Subiendo…","progress":0.4}`
 * - SSE: `data: {...}` (se ignoran `event:`, `id:`, `retry:` y los comentarios `:`)
 * - texto plano: la línea entera es el mensaje. `[DONE]` cierra la tarea.
 */
export function parseStreamLine(raw: string): StreamEvent | null {
  const line = lineData(raw);
  if (!line) return null;
  if (line === "[DONE]") return { done: true };
  if (line.startsWith("{")) {
    try {
      const o = JSON.parse(line) as Record<string, unknown>;
      const ev: StreamEvent = {};
      if (typeof o.msg === "string" && o.msg.trim()) ev.msg = o.msg;
      if (typeof o.level === "string" && LEVELS.has(o.level as LogLevel)) ev.level = o.level as LogLevel;
      const p = normalizeProgress(o.progress);
      if (p !== null) ev.progress = p;
      if (o.done === true) ev.done = true;
      if (typeof o.ok === "boolean") {
        ev.ok = o.ok;
        ev.done = true;
      }
      return Object.keys(ev).length ? ev : null;
    } catch {
      /* no es JSON: se pinta como texto */
    }
  }
  return { msg: line };
}
