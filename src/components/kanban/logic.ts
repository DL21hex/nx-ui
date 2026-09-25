/** Lógica pura de `<nx-kanban>`: validar datos, mover y reordenar, totales, límites y teclado. Sin DOM. */
import { foldText } from "../../core/text";
import type { KanbanCard, KanbanColumn, KanbanConfirm, KanbanTag, KanbanTone, KanbanTotals } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const idOf = (v: unknown): string | undefined => str(v) ?? (typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const TONES = new Set<KanbanTone>(["neutral", "primary", "success", "warning", "danger"]);
const tone = (v: unknown) => (TONES.has(v as KanbanTone) ? (v as KanbanTone) : undefined);

/** Las columnas válidas (con `id` y `label`), sin lo que no es suyo. Un `id` repetido se descarta. */
export function cleanColumns(v: unknown): KanbanColumn[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: KanbanColumn[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = idOf(o.id);
    const label = str(o.label);
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const c = o.confirm as Record<string, unknown> | undefined;
    let confirm: KanbanConfirm | undefined;
    if (c && typeof c === "object" && str(c.heading)) {
      confirm = {
        heading: String(c.heading),
        message: str(c.message),
        impact: str(c.impact),
        hold: typeof c.hold === "boolean" || (typeof c.hold === "number" && c.hold >= 0) ? c.hold : undefined,
        tone: c.tone === "primary" ? "primary" : undefined,
        confirmLabel: str(c.confirmLabel),
      };
    }
    const wip = typeof o.wip === "number" && o.wip >= 1 ? Math.floor(o.wip) : undefined;
    out.push({ id, label, tone: tone(o.tone), wip, confirm, collapsed: o.collapsed === true || undefined });
  }
  return out;
}

/** Las tarjetas válidas (con `id`, `column` y `title`), en su orden. Un `id` repetido se descarta. */
export function cleanCards(v: unknown): KanbanCard[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: KanbanCard[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = idOf(o.id);
    const column = idOf(o.column);
    const title = str(o.title);
    if (!id || !column || !title || seen.has(id)) continue;
    seen.add(id);
    const tags = Array.isArray(o.tags)
      ? o.tags
          .map((t): KanbanTag | null => (str(t) ? (t as string) : t && typeof t === "object" && str((t as { label?: unknown }).label) ? { label: (t as { label: string }).label, tone: tone((t as { tone?: unknown }).tone) } : null))
          .filter((t): t is KanbanTag => !!t)
      : undefined;
    out.push({
      id,
      column,
      title,
      subtitle: str(o.subtitle),
      tags: tags?.length ? tags : undefined,
      assignee: str(o.assignee),
      amount: typeof o.amount === "number" && Number.isFinite(o.amount) ? o.amount : undefined,
      currency: str(o.currency),
      due: str(o.due),
      href: str(o.href),
      data: o.data,
    });
  }
  return out;
}

/** Las tarjetas de una columna, en orden. */
export function columnCards(cards: readonly KanbanCard[], column: string): KanbanCard[] {
  return cards.filter((c) => c.column === column);
}

/** Dónde está una tarjeta: su columna y su posición en ella (desde 0). */
export function positionOf(cards: readonly KanbanCard[], id: string): { column: string; index: number } | null {
  const card = cards.find((c) => c.id === id);
  if (!card) return null;
  return { column: card.column, index: columnCards(cards, card.column).indexOf(card) };
}

/**
 * Mueve una tarjeta a `column`, en la posición `index` (contada sin ella; se ajusta al rango). El
 * arreglo es nuevo y la tarjeta también (con su nueva columna); el resto no cambia de orden.
 */
export function moveCard(cards: readonly KanbanCard[], id: string, column: string, index: number): KanbanCard[] {
  const card = cards.find((c) => c.id === id);
  if (!card) return [...cards];
  const rest = cards.filter((c) => c !== card);
  const target = columnCards(rest, column);
  const i = Math.max(0, Math.min(target.length, Math.floor(index) || 0));
  const moved = { ...card, column };
  // Delante de la que ocupa ese lugar; si va de última, detrás de la última de la columna (o al final).
  const at = i < target.length ? rest.indexOf(target[i]) : target.length ? rest.indexOf(target[target.length - 1]) + 1 : rest.length;
  rest.splice(at, 0, moved);
  return rest;
}

/** Cuántas tarjetas y cuánto suman (por moneda: una columna puede mezclar COP y USD). */
export function columnTotals(cards: readonly KanbanCard[], column: string): KanbanTotals {
  const list = columnCards(cards, column);
  const sums = new Map<string, number>();
  for (const c of list) if (c.amount !== undefined) sums.set(c.currency ?? "", (sums.get(c.currency ?? "") ?? 0) + c.amount);
  return { count: list.length, sums: [...sums].map(([currency, amount]) => ({ currency: currency || undefined, amount })) };
}

/** `"over"` si pasa el límite, `"full"` si lo alcanza, `null` si hay espacio (o no tiene límite). */
export function wipState(count: number, wip: number | undefined): "over" | "full" | null {
  if (!wip) return null;
  return count > wip ? "over" : count === wip ? "full" : null;
}

/** Si la tarjeta coincide con el filtro: todas las palabras, sin tildes ni mayúsculas, en cualquier campo. */
export function matchesCard(card: KanbanCard, query: string): boolean {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = foldText([card.id, card.title, card.subtitle, card.assignee, ...(card.tags ?? []).map((t) => (typeof t === "string" ? t : t.label))].filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/**
 * A dónde lleva una tecla en el tablero. `sizes`: tarjetas por columna (`-1` = plegada, se salta).
 * Con una tarjeta levantada (`lifted`) las posiciones van de 0 a `sizes[col]` (contadas sin ella)
 * y se puede llegar a una columna vacía; sin levantar, solo a tarjetas que existen.
 * @returns la nueva posición, o `null` si la tecla no es de navegación o no hay a dónde ir.
 */
export function boardStep(sizes: readonly number[], at: { col: number; index: number }, key: string, lifted: boolean): { col: number; index: number } | null {
  const max = (col: number) => (lifted ? sizes[col] : sizes[col] - 1);
  const ok = (col: number) => sizes[col] >= (lifted ? 0 : 1);
  const clamp = (col: number, i: number) => ({ col, index: Math.max(0, Math.min(max(col), i)) });
  switch (key) {
    case "ArrowUp":
      return at.index > 0 ? clamp(at.col, at.index - 1) : null;
    case "ArrowDown":
      return at.index < max(at.col) ? clamp(at.col, at.index + 1) : null;
    case "Home":
      return clamp(at.col, 0);
    case "End":
      return clamp(at.col, max(at.col));
    case "ArrowLeft":
    case "ArrowRight": {
      const dir = key === "ArrowLeft" ? -1 : 1;
      for (let c = at.col + dir; c >= 0 && c < sizes.length; c += dir) if (ok(c)) return clamp(c, at.index);
      return null;
    }
    default:
      return null;
  }
}

/** Una fecha límite vencida: antes de `today` (ISO, «2026-09-25»). */
export function isLate(due: string | undefined, today: string): boolean {
  return !!due && /^\d{4}-\d{2}-\d{2}/.test(due) && due.slice(0, 10) < today.slice(0, 10);
}

/** Reemplaza `{clave}` en un texto de `labels`. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
