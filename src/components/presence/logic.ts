/** Lógica pura de la presencia: validar eventos, llevar la lista de quién está, colores, textos y anuncios. Sin DOM. */
import { safeHref } from "../../core/dom";
import type { PresenceEvent, PresenceEventType, PresenceLabels, PresenceState, PresenceUser } from "./types";

/** Cada cuánto manda su latido quien está (ms). */
export const HEARTBEAT_MS = 15_000;
/** Sin latido en este tiempo, una persona se va sola (ms). */
export const TIMEOUT_MS = 45_000;
/**
 * A quien está inactivo se le da más margen: su pestaña, en segundo plano, recibe temporizadores
 * recortados (Chrome los alinea a un minuto) y sus latidos llegan tarde sin que se haya ido.
 */
export const IDLE_TIMEOUT_MS = 150_000;
/** «Escribiendo…» dura esto después del último aviso (ms). */
export const TYPING_MS = 3_000;

const TYPES = new Set<PresenceEventType>(["join", "leave", "focus", "blur", "typing", "lock", "unlock", "heartbeat"]);
const str = (v: unknown, max: number): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);

/** Una persona válida (`id` y `name`), con la foto solo si es una URL segura. */
export function cleanUser(v: unknown): PresenceUser | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = typeof o.id === "number" && Number.isFinite(o.id) ? String(o.id) : str(o.id, 128);
  const name = str(o.name, 80);
  if (!id || !name) return null;
  const avatar = safeHref(o.avatar);
  return avatar ? { id, name, avatar } : { id, name };
}

/** Un evento del transporte (objeto o texto JSON), validado; lo que no se entiende es `null`. */
export function cleanEvent(v: unknown): PresenceEvent | null {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const user = cleanUser(o.user);
  if (!user || !TYPES.has(o.type as PresenceEventType)) return null;
  const ev: PresenceEvent = { type: o.type as PresenceEventType, user };
  const field = str(o.field, 128);
  if (field) ev.field = field;
  else if (o.field === null) ev.field = null;
  if (typeof o.idle === "boolean") ev.idle = o.idle;
  if (typeof o.editing === "boolean") ev.editing = o.editing;
  return ev;
}

/** Una persona en la lista, con el instante en que deja de «escribir». */
export interface PresencePeer extends Omit<PresenceState, "typing"> {
  typingUntil: number;
}

/** Algo que vale la pena anunciar. */
export interface PresenceNote {
  kind: "join" | "leave" | "edit";
  id: string;
  name: string;
  field?: string;
}

/**
 * Aplica un evento a la lista (sin mutarla). Un evento de alguien que no estaba lo hace entrar;
 * los de `self` se ignoran (el servidor puede devolver los propios). Fuera del latido, quien hace
 * algo está activo.
 */
export function applyEvent(peers: readonly PresencePeer[], ev: PresenceEvent, now: number, self?: string | null): { peers: PresencePeer[]; notes: PresenceNote[] } {
  const notes: PresenceNote[] = [];
  const { id, name } = ev.user;
  if (self && id === self) return { peers: [...peers], notes };
  const was = peers.find((p) => p.id === id);
  if (ev.type === "leave") {
    if (was) notes.push({ kind: "leave", id, name: was.name });
    return { peers: peers.filter((p) => p !== was), notes };
  }
  if (!was) notes.push({ kind: "join", id, name });
  const p: PresencePeer = was
    ? { ...was, name, avatar: ev.user.avatar, seenAt: now }
    : { ...ev.user, field: null, editing: false, typingUntil: 0, idle: false, idleSince: null, joinedAt: now, seenAt: now };
  if (!p.avatar) delete p.avatar;
  const f = ev.field ?? null;
  const mine = !ev.field || ev.field === p.field;
  switch (ev.type) {
    case "focus":
      p.field = f;
      p.editing = false;
      p.typingUntil = 0;
      break;
    case "blur":
      if (mine) (p.field = null), (p.editing = false), (p.typingUntil = 0);
      break;
    case "typing":
      if (f) p.field = f;
      p.editing = !!p.field;
      p.typingUntil = p.field ? now + TYPING_MS : 0;
      break;
    case "lock":
      if (f) (p.field = f), (p.editing = true);
      break;
    case "unlock":
      if (mine) (p.editing = false), (p.typingUntil = 0);
      break;
    case "join":
    case "heartbeat":
      if (ev.field !== undefined) p.field = f;
      if (ev.editing !== undefined) p.editing = ev.editing;
      if (!p.field) (p.editing = false), (p.typingUntil = 0);
      break;
  }
  const idle = ev.idle ?? (ev.type === "heartbeat" || ev.type === "join" ? p.idle : false);
  if (idle !== p.idle) (p.idle = idle), (p.idleSince = idle ? now : null);
  if (p.editing && p.field && !(was?.editing && was.field === p.field)) notes.push({ kind: "edit", id, name, field: p.field });
  return { peers: was ? peers.map((x) => (x === was ? p : x)) : [...peers, p], notes };
}

/** Saca a quien no ha dado señales en `timeout` ms (más margen si estaba inactivo). */
export function prune(peers: readonly PresencePeer[], now: number, timeout = TIMEOUT_MS): { peers: PresencePeer[]; notes: PresenceNote[] } {
  const notes: PresenceNote[] = [];
  const keep = peers.filter((p) => {
    const alive = now - p.seenAt <= (p.idle ? Math.max(timeout, IDLE_TIMEOUT_MS) : timeout);
    if (!alive) notes.push({ kind: "leave", id: p.id, name: p.name });
    return alive;
  });
  return { peers: keep, notes };
}

/** Lo que se publica de una persona: activos primero y, entre ellos, en orden de llegada. */
export function statesOf(peers: readonly PresencePeer[], now: number): PresenceState[] {
  return peers
    .map(({ typingUntil, ...p }): PresenceState => ({ ...p, typing: !!p.field && typingUntil > now }))
    .sort((a, b) => Number(a.idle) - Number(b.idle) || a.joinedAt - b.joinedAt);
}

/** El instante más próximo en que alguien deja de escribir (para volver a pintar), o 0. */
export function nextTypingEnd(peers: readonly PresencePeer[], now: number): number {
  let t = Infinity;
  for (const p of peers) if (p.typingUntil > now) t = Math.min(t, p.typingUntil);
  return t === Infinity ? 0 : t;
}

/** Tonos bien separados entre sí: dos personas rara vez se confunden. */
const HUES = [262, 25, 150, 300, 205, 55, 340, 115, 235, 5, 180, 85];

/** El tono estable de una persona, derivado de su `id` (el mismo en todas las pestañas). */
export function hueOf(id: string): number {
  let x = 0;
  for (const c of id) x = (Math.imul(x, 31) + c.codePointAt(0)!) >>> 0;
  return HUES[x % HUES.length];
}

/** Qué está haciendo: inactivo le gana a todo; sin campo, solo está viendo. */
export type PresenceActivity = "idle" | "viewing" | "focus" | "editing" | "typing";
export function activityOf(s: Pick<PresenceState, "idle" | "field" | "editing" | "typing">): PresenceActivity {
  if (s.idle) return "idle";
  if (!s.field) return "viewing";
  return s.typing ? "typing" : s.editing ? "editing" : "focus";
}

/** «hace 4 min», «hace 2 h»; menos de un minuto, «» (el llamador dice solo «inactivo»). */
export function agoText(ms: number, locale = "es-CO"): string {
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "";
  let rtf: Intl.RelativeTimeFormat;
  try {
    rtf = new Intl.RelativeTimeFormat(locale, { style: "short", numeric: "always" });
  } catch {
    rtf = new Intl.RelativeTimeFormat("es-CO", { style: "short", numeric: "always" });
  }
  return (m < 60 ? rtf.format(-m, "minute") : rtf.format(-Math.floor(m / 60), "hour")).replace(/[  ]/g, " ");
}

/** El primer nombre, para las etiquetas pequeñas: «Ana Restrepo» → «Ana». */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/**
 * Lo que se anuncia de un lote de novedades, agrupado y limitado: «Ana y Héctor entraron. Mariana
 * está editando Monto». Quien entra y sale en el mismo lote no se anuncia; de cada persona, solo su
 * última edición. Pasadas `max` frases, «y N cambios más».
 */
export function summarize(
  notes: readonly PresenceNote[],
  L: Pick<PresenceLabels, "joined" | "joinedMany" | "left" | "leftMany" | "editingNow" | "andMore">,
  list: (names: string[]) => string,
  label: (field: string) => string,
  max = 3,
): string {
  const joins = new Map<string, string>();
  const leaves = new Map<string, string>();
  const edits = new Map<string, PresenceNote>();
  for (const n of notes) {
    if (n.kind === "join") {
      if (!leaves.delete(n.id)) joins.set(n.id, n.name);
    } else if (n.kind === "leave") {
      edits.delete(n.id);
      if (!joins.delete(n.id)) leaves.set(n.id, n.name);
    } else edits.set(n.id, n);
  }
  const group = (m: Map<string, string>, one: string, many: string) => (m.size ? [(m.size > 1 ? many : one).replace("{names}", list([...m.values()]))] : []);
  const parts = [
    ...group(joins, L.joined, L.joinedMany),
    ...[...edits.values()].map((n) => L.editingNow.replace("{name}", n.name).replace("{field}", label(n.field ?? ""))),
    ...group(leaves, L.left, L.leftMany),
  ];
  if (parts.length > max) return [...parts.slice(0, max - 1), L.andMore.replace("{n}", String(parts.length - max + 1))].join(". ");
  return parts.join(". ");
}
