/** Lógica pura de la captura: validar eventos y armar los valores. Sin DOM. */
import type { CaptureBox, CaptureEvent, CaptureSchemaItem, CaptureValues, CheckStatus } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Un recuadro válido (coordenadas 0–1; se acepta 0–100 y se escala), o `undefined`. */
export function normalizeBox(v: unknown): CaptureBox | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const [x, y, w, h] = [num(o.x), num(o.y), num(o.w), num(o.h)];
  if (x === undefined || y === undefined || w === undefined || h === undefined || w <= 0 || h <= 0) return undefined;
  const scale = Math.max(x, y, w, h) > 1 ? 100 : 1;
  return { page: Math.max(1, Math.floor(num(o.page) ?? 1)), x: clamp01(x / scale), y: clamp01(y / scale), w: clamp01(w / scale), h: clamp01(h / scale) };
}

/** Confianza en 0–1 (acepta 0–100). Sin dato, 1: el backend no dijo que dudara. */
export function normalizeConfidence(v: unknown): number {
  const n = num(v);
  if (n === undefined || n < 0) return 1;
  return Math.min(1, n > 1 ? n / 100 : n);
}

const STATUSES = new Set<CheckStatus>(["ok", "warn", "error"]);

export function parseCaptureEvent(data: string | null): CaptureEvent | null {
  if (!data) return null;
  if (data === "[DONE]") return { type: "done" };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(data);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  switch (o.type) {
    case "page": {
      const src = str(o.src);
      const n = num(o.n) ?? 1;
      return src ? { type: "page", n: Math.max(1, Math.floor(n)), src, width: num(o.width) ?? 1000, height: num(o.height) ?? 1414 } : null;
    }
    case "field": {
      const key = str(o.key);
      if (!key || (typeof o.value !== "string" && typeof o.value !== "number")) return null;
      return {
        type: "field",
        key,
        value: String(o.value),
        confidence: normalizeConfidence(o.confidence),
        box: normalizeBox(o.box),
        detail: str(o.detail),
        hint: str(o.hint),
        suggest: typeof o.suggest === "string" || typeof o.suggest === "number" ? String(o.suggest) : undefined,
      };
    }
    case "check": {
      const message = str(o.message);
      if (!message) return null;
      const status = STATUSES.has(o.status as CheckStatus) ? (o.status as CheckStatus) : "warn";
      const fields = Array.isArray(o.fields) ? o.fields.filter((f): f is string => typeof f === "string") : [];
      return { type: "check", id: str(o.id) ?? message, status, message, fields };
    }
    case "error":
      return { type: "error", message: str(o.message) ?? "" };
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

/** «alta» (≥ umbral + 0,1), «media» (≥ umbral) o «baja» (bajo el umbral: hay que revisarlo). */
export function confidenceTier(confidence: number, threshold: number): "high" | "mid" | "low" {
  if (confidence < threshold) return "low";
  return confidence >= Math.min(1, threshold + 0.1) ? "high" : "mid";
}

/**
 * Los valores planos (`"nit"`, `"items.0.cantidad"`) como objeto: los campos sueltos quedan como
 * texto y cada tabla del schema como un arreglo de filas, en orden y sin huecos.
 */
export function buildValues(schema: readonly CaptureSchemaItem[], flat: ReadonlyMap<string, string>): CaptureValues {
  const out: CaptureValues = {};
  for (const item of schema) {
    if (item.type === "table") {
      const rows = new Map<number, Record<string, string>>();
      for (const [k, v] of flat) {
        const m = new RegExp(`^${item.key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)\\.(.+)$`).exec(k);
        if (!m) continue;
        const i = Number(m[1]);
        if (!rows.has(i)) rows.set(i, {});
        rows.get(i)![m[2]] = v;
      }
      out[item.key] = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    } else if (flat.has(item.key)) out[item.key] = flat.get(item.key)!;
  }
  return out;
}

/** Cuántas filas tiene una tabla según las claves recibidas (`items.3.x` ⇒ al menos 4). */
export function tableRowCount(tableKey: string, keys: Iterable<string>): number {
  let max = -1;
  const prefix = `${tableKey}.`;
  for (const k of keys) {
    if (!k.startsWith(prefix)) continue;
    const i = Number(k.slice(prefix.length).split(".")[0]);
    if (Number.isInteger(i)) max = Math.max(max, i);
  }
  return max + 1;
}

/** Tipos que el navegador a veces no informa (`file.type === ""`), por su extensión. */
const BY_EXT: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic" };

/**
 * Si un archivo cumple `accept` (la misma sintaxis del `<input type=file>`: `.pdf`, `image/*`,
 * `application/pdf`). Al soltar un archivo el navegador no lo comprueba; aquí sí.
 */
export function acceptsFile(accept: string, name: string, type: string): boolean {
  const tokens = accept.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!tokens.length) return true;
  const lower = name.toLowerCase();
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
  const mime = (type || BY_EXT[ext] || "").toLowerCase();
  return tokens.some((t) => (t.startsWith(".") ? lower.endsWith(t) : t.endsWith("/*") ? !!mime && mime.startsWith(t.slice(0, -1)) : mime === t));
}

/** 20971520 → «20 MB» (con el separador decimal del locale). */
export function formatBytes(n: number, locale = "es-CO"): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(locale, { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 })} ${units[i]}`;
}
