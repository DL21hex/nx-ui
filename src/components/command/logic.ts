/** Lógica pura de la paleta de comandos: buscar, ordenar por uso y aplanar el menú. Sin DOM. */
import { foldText } from "../../core/text";
import type { MenuItem } from "../sidemenu/types";
import type { CommandItem, CommandUsage } from "./types";

/** Una semana: lo usado hace una semana pesa la mitad que lo usado hoy. */
const HALF_LIFE = 7 * 86_400_000;

/** La identidad de una entrada, para recordar su uso. */
export const itemKey = (item: CommandItem): string => item.id ?? item.href ?? item.label;

/** Una entrada válida (con `label`), copiada sin lo que no es suyo. Lo demás se descarta. */
export function cleanItem(v: unknown): CommandItem | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.label !== "string" || !o.label.trim()) return null;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
  const children = Array.isArray(o.children) ? cleanItems(o.children) : undefined;
  return {
    id: str(o.id) ?? (typeof o.id === "number" ? String(o.id) : undefined),
    label: o.label,
    href: str(o.href),
    group: str(o.group),
    hint: str(o.hint),
    keywords: Array.isArray(o.keywords) ? o.keywords.filter((k): k is string => typeof k === "string") : undefined,
    icon: str(o.icon),
    shortcut: str(o.shortcut),
    children: children?.length ? children : undefined,
    data: o.data,
    disabled: o.disabled === true || undefined,
  };
}

export function cleanItems(v: unknown): CommandItem[] {
  return Array.isArray(v) ? v.map(cleanItem).filter((x): x is CommandItem => !!x) : [];
}

/**
 * Las pantallas de un `<nx-sidemenu>` como entradas: cada destino con su ruta en el menú como
 * pista («Ventas › Pedidos») y la sección como palabra clave. Los padres sin `href` no se listan:
 * sus hijos sí.
 */
export function flattenMenu(items: readonly MenuItem[], group: string, trail: string[] = []): CommandItem[] {
  const out: CommandItem[] = [];
  for (const m of items) {
    if (!m || typeof m.label !== "string") continue;
    if (m.href && !m.children?.length)
      out.push({ id: `menu:${m.id ?? m.href}`, label: m.label, href: m.href, icon: m.icon, group, hint: trail.join(" › ") || undefined, keywords: [m.section, m.description].filter((k): k is string => !!k) });
    if (m.children?.length) out.push(...flattenMenu(m.children, group, [...trail, m.label]));
  }
  return out;
}

/** Cuánto pesa el uso de una entrada hoy: sus usos, que valen la mitad cada semana que pasa. */
export function frecency(use: { n: number; t: number } | undefined, now: number): number {
  return use ? use.n * 0.5 ** (Math.max(0, now - use.t) / HALF_LIFE) : 0;
}

/** De lo que más a lo que menos pesa; a igual peso, lo más reciente. Dos usos en el mismo
 *  milisegundo empatan también en `t`: ahí decide el orden en que se anotaron (lo último anotado
 *  queda al final del objeto, y se recorre al revés). */
const byWeight = (a: { n: number; t: number }, b: { n: number; t: number }, now: number) => frecency(b, now) - frecency(a, now) || b.t - a.t;

/** Anota un uso. Se guardan las `max` entradas que más pesan (sin sus submenús: se vuelven a leer). */
export function recordUse(usage: CommandUsage, item: CommandItem, now: number, max = 30): CommandUsage {
  const key = itemKey(item);
  const prev = usage[key];
  const next: CommandUsage = { ...usage };
  delete next[key];
  next[key] = { n: (prev ? frecency(prev, now) : 0) + 1, t: now, item: { ...item, children: undefined } };
  const keys = Object.keys(next).reverse();
  if (keys.length <= max) return next;
  keys.sort((a, b) => byWeight(next[a], next[b], now));
  return Object.fromEntries(keys.slice(0, max).map((k) => [k, next[k]]));
}

type Folded = { label: string; initials: string; rest: string };
const folded = new WeakMap<CommandItem, Folded>();

/** El texto normalizado de una entrada, una vez por entrada (quitar tildes es lo caro). */
function prepared(item: CommandItem): Folded {
  let f = folded.get(item);
  if (!f) {
    const label = foldText(item.label);
    const initials = label
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((w) => w[0])
      .join("");
    f = { label, initials, rest: foldText([item.hint, item.group, ...(item.keywords ?? [])].filter(Boolean).join(" ")) };
    folded.set(item, f);
  }
  return f;
}

const tokens = (q: string) => foldText(q).trim().split(/\s+/).filter(Boolean);
const wordStart = (s: string, i: number) => i === 0 || !/[\p{L}\p{N}]/u.test(s[i - 1]);

/**
 * El puntaje de texto de una entrada, o `null` si alguna palabra no aparece. Cada palabra tiene que
 * estar en el nombre, la pista, el grupo o las palabras clave (sin tildes ni mayúsculas). Pesa más
 * en el nombre, y más al inicio de una palabra. Una sola palabra también vale como iniciales:
 * «np» encuentra «Nuevo pedido».
 */
export function scoreItem(item: CommandItem, query: string): number | null {
  const toks = tokens(query);
  if (!toks.length) return 0;
  const f = prepared(item);
  if (toks.length === 1 && toks[0].length > 1 && f.initials.startsWith(toks[0]) && !f.label.includes(toks[0])) return 4;
  let score = 0;
  for (const t of toks) {
    const i = f.label.indexOf(t);
    if (i >= 0) score += (i === 0 ? 6 : wordStart(f.label, i) ? 4 : 2) + (f.label === t ? 4 : 0);
    else {
      const j = f.rest.indexOf(t);
      if (j < 0) return null;
      score += wordStart(f.rest, j) ? 1.5 : 1;
    }
  }
  return score;
}

export interface Ranked {
  item: CommandItem;
  score: number;
}

/**
 * Las entradas que coinciden con la consulta, de la más a la menos relevante. El uso suma: lo que
 * la persona elige seguido sube, sin tapar una coincidencia claramente mejor. A igual puntaje se
 * conserva el orden original. Sin consulta, nada (la paleta muestra «Recientes» y todo).
 */
export function searchCommands(items: readonly CommandItem[], query: string, usage: CommandUsage = {}, now = Date.now()): Ranked[] {
  if (!tokens(query).length) return [];
  const out: Ranked[] = [];
  for (const item of items) {
    const s = scoreItem(item, query);
    if (s === null) continue;
    out.push({ item, score: s + Math.min(4, Math.log2(1 + frecency(usage[itemKey(item)], now)) * 1.5) });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Lo usado, de lo que más a lo que menos pesa; con la versión actual de cada entrada si sigue existiendo. */
export function recentItems(usage: CommandUsage, items: readonly CommandItem[], now = Date.now(), max = 5): CommandItem[] {
  const current = new Map(items.map((i) => [itemKey(i), i]));
  return Object.entries(usage)
    .reverse()
    .sort((a, b) => byWeight(a[1], b[1], now))
    .slice(0, max)
    .map(([k, u]) => current.get(k) ?? cleanItem(u.item))
    .filter((i): i is CommandItem => !!i);
}

/** Agrupa conservando el orden: cada grupo aparece donde está su mejor entrada. */
export function groupItems(items: readonly CommandItem[], fallback: string): { group: string; items: CommandItem[] }[] {
  const groups = new Map<string, CommandItem[]>();
  for (const item of items) {
    const g = item.group ?? fallback;
    const list = groups.get(g);
    if (list) list.push(item);
    else groups.set(g, [item]);
  }
  return [...groups].map(([group, list]) => ({ group, items: list }));
}

/** `"mod+k"` → ¿esta tecla es ese atajo? `mod` es ⌘ en Mac y Ctrl en lo demás (se aceptan los dos). */
export function matchesHotkey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split("+").map((p) => p.trim());
  const key = parts.pop();
  if (!key || key === "none") return false;
  const want = new Set(parts);
  const mod = want.has("mod") || want.has("ctrl") || want.has("meta") || want.has("cmd");
  return e.key.toLowerCase() === key && (e.ctrlKey || e.metaKey) === mod && e.altKey === want.has("alt") && e.shiftKey === want.has("shift");
}
