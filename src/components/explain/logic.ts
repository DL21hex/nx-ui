/** Lógica pura de `<nx-explain>`: validar eventos, armar el desglose y comprobar que cuadre. Sin DOM. */
import type { ExplainEvent, ExplainFormat, ExplainOp, ExplainState, ExplainTone } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const TONES = new Set<ExplainTone>(["neutral", "success", "warning", "danger"]);
const FORMATS = new Set<ExplainFormat>(["money", "number", "percent"]);
const OPS = new Set<ExplainOp>(["+", "-", "×", "÷", "="]);

/** Un número o un texto ya formateado («N/A», «3 de 5»). */
const value = (v: unknown) => num(v) ?? str(v);
const numberBits = (o: Record<string, unknown>) => ({ format: FORMATS.has(o.format as ExplainFormat) ? (o.format as ExplainFormat) : undefined, currency: str(o.currency) });

/** Una línea del stream validada, o `null`. Lo que no cumple la forma se ignora sin romper el stream. */
export function parseExplainEvent(data: string | null): ExplainEvent | null {
  if (!data) return null;
  if (data === "[DONE]") return { type: "done" };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(data);
  } catch {
    return null;
  }
  return o && typeof o === "object" ? toEvent(o) : null;
}

/** Un evento ya parseado (de `explanation`, o de una línea), validado. */
export function toEvent(o: Record<string, unknown>): ExplainEvent | null {
  switch (o.type) {
    case "value": {
      const v = value(o.value);
      return v === undefined ? null : { type: "value", label: str(o.label), detail: str(o.detail), value: v, ...numberBits(o) };
    }
    case "term": {
      const label = str(o.label);
      const v = value(o.value);
      if (!label || v === undefined) return null;
      // «−» (signo menos) y «x» también valen.
      const raw = o.op === "−" ? "-" : o.op === "x" || o.op === "*" ? "×" : o.op === "/" ? "÷" : o.op;
      return { type: "term", label, value: v, ...numberBits(o), op: OPS.has(raw as ExplainOp) ? (raw as ExplainOp) : undefined, detail: str(o.detail), source: str(o.source) ?? (typeof o.source === "number" ? String(o.source) : undefined), href: str(o.href), explain: str(o.explain) };
    }
    case "total": {
      const v = num(o.value);
      return v === undefined ? null : { type: "total", value: v };
    }
    case "compare": {
      const label = str(o.label);
      const v = num(o.value);
      return label && v !== undefined ? { type: "compare", label, value: v, better: o.better === "up" || o.better === "down" ? o.better : undefined } : null;
    }
    case "source": {
      const id = str(o.id) ?? (typeof o.id === "number" ? String(o.id) : undefined);
      const title = str(o.title);
      return id && title ? { type: "source", id, title, detail: str(o.detail), href: str(o.href) } : null;
    }
    case "text":
      return typeof o.delta === "string" && o.delta ? { type: "text", delta: o.delta } : null;
    case "note": {
      const label = str(o.label);
      return label ? { type: "note", label, tone: TONES.has(o.tone as ExplainTone) ? (o.tone as ExplainTone) : "neutral" } : null;
    }
    case "error":
      return { type: "error", message: str(o.message) ?? "" };
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

export const emptyState = (): ExplainState => ({ head: null, terms: [], total: null, compare: [], sources: [], text: "", notes: [], error: null, done: false });

/** Aplica un evento al desglose (lo muta y lo devuelve). */
export function applyEvent(s: ExplainState, ev: ExplainEvent): ExplainState {
  switch (ev.type) {
    case "value":
      s.head = ev;
      break;
    case "term":
      s.terms.push(ev);
      break;
    case "total":
      s.total = ev.value;
      break;
    case "compare":
      s.compare.push(ev);
      break;
    case "source":
      if (!s.sources.some((x) => x.id === ev.id)) s.sources.push(ev);
      break;
    case "text":
      s.text += ev.delta;
      break;
    case "note":
      s.notes.push(ev);
      break;
    case "error":
      s.error = ev.message;
      s.done = true;
      break;
    case "done":
      s.done = true;
      break;
  }
  return s;
}

export interface Balance {
  sum: number;
  total: number;
  ok: boolean;
}

/**
 * ¿Los términos dan la cifra? Solo si todos son números y se suman o restan (`+`, `-`; los `=`
 * son subtotales y no cuentan): con una multiplicación o un texto de por medio no se puede saber y
 * devuelve `null`. La cifra es `total`, o el valor de la cabecera.
 */
export function balance(s: ExplainState): Balance | null {
  const total = s.total ?? (typeof s.head?.value === "number" ? s.head.value : null);
  const terms = s.terms.filter((t) => t.op !== "=");
  if (total === null || !terms.length) return null;
  let sum = 0;
  for (const t of terms) {
    if (typeof t.value !== "number" || t.op === "×" || t.op === "÷") return null;
    sum += t.op === "-" ? -Math.abs(t.value) : t.value;
  }
  // Medio centavo, o una parte en mil millones en cifras muy grandes (errores de coma flotante).
  const tol = Math.max(0.005, Math.abs(total) * 1e-9);
  return { sum, total, ok: Math.abs(sum - total) <= tol };
}

/** Cuánto cambió la cifra frente a otra: 0,14 = subió 14 %. `null` si no se puede (la otra es 0). */
export function change(current: number, previous: number): number | null {
  return previous === 0 ? null : (current - previous) / Math.abs(previous);
}

/** El tono de un cambio: sin `better` es neutro; si subir es bueno, subir es verde. */
export function changeTone(delta: number, better?: "up" | "down"): ExplainTone {
  if (!better || delta === 0) return "neutral";
  return (delta > 0) === (better === "up") ? "success" : "danger";
}
