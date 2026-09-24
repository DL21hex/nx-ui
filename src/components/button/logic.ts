/** Lógica pura del botón: sin DOM, para probarse en node. */
import type { LogLevel, StreamEvent } from "./types";

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
  let line = raw.trim();
  if (!line || line.startsWith(":") || /^(event|id|retry):/.test(line)) return null;
  if (line.startsWith("data:")) line = line.slice(5).trim();
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

/** Parte un buffer en líneas completas; devuelve el resto (una línea aún incompleta). */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

/** «0,8 s», «12 s», «2:05». Con coma decimal (es-CO); `locale` para otros idiomas. */
export function formatElapsed(ms: number, locale = "es"): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `${s.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  if (s < 60) return `${Math.floor(s)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
