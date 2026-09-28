/** Lógica pura de `<nx-handoff>`: validar lo que manda el servidor, tiempos, esperas y URLs. Sin DOM. */
import type { HandoffEvent, HandoffItem, HandoffKind, HandoffLabels, HandoffPhoneInfo, HandoffSession } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const KINDS = new Set<HandoffKind>(["photo", "file", "scan", "signature"]);

/** Vigencia por defecto de una sesión que no dice cuándo vence (10 min). */
export const DEFAULT_TTL = 10 * 60_000;

/** Un `HandoffKind` válido, o `photo`. */
export function cleanKind(v: unknown): HandoffKind {
  return KINDS.has(v as HandoffKind) ? (v as HandoffKind) : "photo";
}

/** Un objeto JSON (o el texto de uno), o `null`. */
function obj(v: unknown): Record<string, unknown> | null {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Un ítem válido, o `null`. Un archivo sin `url` no sirve (no hay de dónde bajarlo). */
export function parseHandoffItem(v: unknown): HandoffItem | null {
  const o = obj(v);
  if (!o) return null;
  const id = str(o.id) ?? (num(o.id) !== undefined ? String(o.id) : undefined);
  const withId = (it: HandoffItem): HandoffItem => (id ? { ...it, id } : it);
  switch (o.kind) {
    case "file": {
      const url = str(o.url);
      if (!url) return null;
      return withId({ kind: "file", name: str(o.name) ?? "archivo", type: str(o.type) ?? "application/octet-stream", size: Math.max(0, num(o.size) ?? 0), url });
    }
    case "code": {
      const code = str(o.code) ?? (num(o.code) !== undefined ? String(o.code) : undefined);
      if (!code) return null;
      const format = str(o.format);
      return withId(format ? { kind: "code", code: code.trim(), format } : { kind: "code", code: code.trim() });
    }
    case "data":
      return o.data === undefined ? null : withId({ kind: "data", data: o.data });
    default:
      return null;
  }
}

/**
 * Un evento de la sesión a partir de una línea (ya sin `data:`), o `null` si no se entiende: el
 * stream sigue aunque llegue basura. `[DONE]` es `done`.
 */
export function parseHandoffEvent(data: unknown): HandoffEvent | null {
  if (data === "[DONE]") return { type: "done" };
  const o = obj(data);
  if (!o) return null;
  const seq = num(o.seq);
  const out = (ev: HandoffEvent): HandoffEvent => (seq !== undefined ? { ...ev, seq } : ev);
  switch (o.type) {
    case "connected": {
      const device = str(o.device);
      return out(device ? { type: "connected", device: device.trim().slice(0, 60) } : { type: "connected" });
    }
    case "progress": {
      const received = Math.max(0, Math.floor(num(o.received) ?? 0));
      const total = num(o.total);
      return out(total !== undefined && total > 0 ? { type: "progress", received, total: Math.floor(total) } : { type: "progress", received });
    }
    case "item": {
      const item = parseHandoffItem(o.item);
      return item ? out({ type: "item", item }) : null;
    }
    case "done":
    case "expired":
      return out({ type: o.type });
    case "error":
      return out({ type: "error", message: str(o.message) ?? "" });
    default:
      return null;
  }
}

/** Lo que responde el polling (`GET {endpoint}/{id}?after=`): `{events: […]}` o la lista sola. */
export function parsePollEvents(v: unknown): HandoffEvent[] {
  const list = Array.isArray(v) ? v : Array.isArray(obj(v)?.events) ? (obj(v)!.events as unknown[]) : [];
  return list.map(parseHandoffEvent).filter((e): e is HandoffEvent => !!e);
}

/** Si un evento cierra la escucha. */
export function isFinal(ev: HandoffEvent): boolean {
  return ev.type === "done" || ev.type === "expired" || ev.type === "error";
}

/**
 * El vencimiento en ms locales: `expiresIn` (segundos, inmune al desfase de reloj) o `expiresAt`
 * (ISO o epoch en s/ms). Sin ninguno, `DEFAULT_TTL`.
 */
export function parseExpiry(o: Record<string, unknown>, now = Date.now()): number {
  const inS = num(o.expiresIn);
  if (inS !== undefined) return now + Math.max(0, inS) * 1000;
  const at = o.expiresAt;
  if (typeof at === "number" && Number.isFinite(at)) return at < 1e11 ? at * 1000 : at;
  if (typeof at === "string") {
    const t = Date.parse(at);
    if (!Number.isNaN(t)) return t;
  }
  return now + DEFAULT_TTL;
}

/** La sesión que devuelve `POST {endpoint}`, o `null` si le falta el `id` o el `url`. */
export function parseSession(v: unknown, now = Date.now()): HandoffSession | null {
  const o = obj(v);
  if (!o) return null;
  const id = str(o.id) ?? (num(o.id) !== undefined ? String(o.id) : undefined);
  const url = str(o.url);
  if (!id || !url) return null;
  const token = str(o.token);
  return { id, url: url.trim(), expiresAt: parseExpiry(o, now), ...(token ? { token } : {}) };
}

/** Lo que el celular sabe de la sesión (`GET {endpoint}/{id}?t=`), o `null`. */
export function parsePhoneInfo(v: unknown, now = Date.now()): HandoffPhoneInfo | null {
  const o = obj(v);
  if (!o) return null;
  const info: HandoffPhoneInfo = { kind: cleanKind(o.kind) };
  const accept = str(o.accept);
  if (accept) info.accept = accept;
  if (o.multiple === true) info.multiple = true;
  const title = str(o.title);
  if (title) info.title = title;
  const hint = str(o.hint);
  if (hint) info.hint = hint;
  if (o.askName === true) info.askName = true;
  if (o.askId === true) info.askId = true;
  if (o.expiresAt !== undefined || o.expiresIn !== undefined) info.expiresAt = parseExpiry(o, now);
  return info;
}

/** Lo que falta para `deadline`, en ms (nunca negativo). */
export function remaining(deadline: number, now = Date.now()): number {
  return Math.max(0, deadline - now);
}

/** «4:32» (minutos:segundos, redondeando hacia arriba: «0:01» hasta el último segundo). */
export function countdown(ms: number): string {
  const s = Math.ceil(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Espera antes del intento `attempt` (1, 2, 3…): 1 s, 2 s, 4 s… hasta `max`, con ±20 % al azar. */
export function retryDelay(attempt: number, base = 1000, max = 15_000, random: () => number = Math.random): number {
  const d = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(Math.min(max, d * (0.8 + random() * 0.4)));
}

/**
 * `{endpoint}/{id}{path}` con los parámetros agregados, respetando una consulta que ya traiga el
 * endpoint («/api/handoff?tenant=7»). El id va codificado: viene del servidor.
 */
export function sessionUrl(endpoint: string, id: string, path = "", params: Record<string, string | number | undefined> = {}): string {
  const q = endpoint.indexOf("?");
  const base = (q < 0 ? endpoint : endpoint.slice(0, q)).replace(/\/+$/, "");
  const query = new URLSearchParams(q < 0 ? "" : endpoint.slice(q + 1));
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") query.set(k, String(v));
  const qs = query.toString();
  return `${base}/${encodeURIComponent(id)}${path}${qs ? `?${qs}` : ""}`;
}

/** La sesión y el token de la página del celular: `?s=…&t=…` (también `session`/`token`). */
export function phoneParams(search: string): { session?: string; token?: string } {
  const p = new URLSearchParams(search);
  return { session: str(p.get("s") ?? p.get("session")) ?? undefined, token: str(p.get("t") ?? p.get("token")) ?? undefined };
}

/** Reemplaza `{clave}` en un texto. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}

/** «1 foto», «3 fotos», «2 códigos», «1 firma»… según lo pedido. */
export function countText(kind: HandoffKind, n: number, L: HandoffLabels): string {
  const [one, many] = kind === "photo" ? [L.photo1, L.photos] : kind === "scan" ? [L.code1, L.codes] : kind === "signature" ? [L.signature1, L.signatures] : [L.file1, L.files];
  return fill(n === 1 ? one : many, { n });
}

/** El tamaño al que se reduce una foto: lado mayor ≤ `max`, sin agrandar. */
export function fitSize(width: number, height: number, max = 2000): { width: number; height: number; scaled: boolean } {
  const big = Math.max(width, height);
  if (!(big > max) || !(width > 0) || !(height > 0)) return { width, height, scaled: false };
  const k = max / big;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)), scaled: true };
}

/** El nombre de una foto reducida a JPEG: «IMG_2041.HEIC» → «IMG_2041.jpg». */
export function jpegName(name: string): string {
  const base = name.replace(/\.[^./\\]{1,5}$/, "") || "foto";
  return `${base}.jpg`;
}

/** Qué hacer con una respuesta del servidor al subir: seguir, reintentar, o la sesión ya no sirve. */
export function uploadVerdict(status: number): "ok" | "retry" | "gone" | "fail" {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 403 || status === 404 || status === 410) return "gone";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "retry";
  return "fail";
}
