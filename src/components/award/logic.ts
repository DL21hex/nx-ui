/** Lógica pura de la adjudicación: validar lo que llega (props, eventos), las cuentas de libro
 *  (totales, órdenes por proveedor, lo que cuesta apartarse de la sugerencia), el reparto de los
 *  pesos y el movimiento por la grilla. Sin DOM. Aquí no se puntúa: eso es del backend. */
import type { AwardChange, AwardChoice, AwardCriterion, AwardEvent, AwardFlag, AwardItem, AwardOrder, AwardQuote, AwardRank, AwardRecommendation, AwardScenario, AwardSupplier, AwardTone, AwardValue } from "./types";

const TONES = new Set<AwardTone>(["neutral", "warning", "danger"]);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const idOf = (v: unknown) => str(v) ?? (typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const list = (v: unknown): unknown[] => {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v : [];
};
/** Un número finito (también escrito en formato de máquina: «4150.5»). */
export const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
/** Dos decimales: las cuentas de dinero no arrastran 0,30000000000000004. */
export const cents = (n: number): number => Math.round(n * 100) / 100;

/** «{n} cambios» → «3 cambios». Lo que no está en `vars` queda como estaba. */
export const fill = (t: string, vars: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

/** La clave de una cotización. */
export const qkey = (item: string, supplier: string): string => `${item}\u0000${supplier}`;

// ---------------------------------------------------------------- validar

/** Los proveedores válidos (`id` y `name`, sin repetir). */
export function cleanSuppliers(v: unknown): AwardSupplier[] {
  const out: AwardSupplier[] = [];
  for (const x of list(v)) {
    const o = obj(x);
    const id = idOf(o?.id);
    const name = str(o?.name);
    if (o && id && name && !out.some((s) => s.id === id)) out.push({ id, name, detail: str(o.detail), alert: str(o.alert) });
  }
  return out;
}

/** Los artículos válidos (`id` y `name`, sin repetir). Sin cantidad (o con una inválida), 1. */
export function cleanItems(v: unknown): AwardItem[] {
  const out: AwardItem[] = [];
  for (const x of list(v)) {
    const o = obj(x);
    const id = idOf(o?.id);
    const name = str(o?.name);
    if (!o || !id || !name || out.some((i) => i.id === id)) continue;
    const qty = num(o.qty);
    out.push({ id, name, qty: qty !== undefined && qty >= 0 ? qty : 1, unit: str(o.unit), code: idOf(o.code), group: str(o.group) });
  }
  return out;
}

/** Las cotizaciones, por `qkey(item, supplier)`. Un precio inválido o negativo se descarta; si un
 *  proveedor cotiza dos veces el mismo artículo, vale la última. */
export function cleanQuotes(v: unknown): Map<string, AwardQuote> {
  const out = new Map<string, AwardQuote>();
  for (const x of list(v)) {
    const o = obj(x);
    const item = idOf(o?.item);
    const supplier = idOf(o?.supplier);
    const price = num(o?.price);
    if (!o || !item || !supplier || price === undefined || price < 0) continue;
    const lead = num(o.leadTime);
    out.set(qkey(item, supplier), { item, supplier, price, leadTime: lead !== undefined && lead >= 0 ? lead : undefined, original: str(o.original), note: str(o.note) });
  }
  return out;
}

/** Los criterios (`id` y `label`); sin peso (o con uno negativo), 1. */
export function cleanCriteria(v: unknown): AwardCriterion[] {
  const out: AwardCriterion[] = [];
  for (const x of list(v)) {
    const o = obj(x);
    const id = idOf(o?.id);
    const label = str(o?.label);
    const w = num(o?.weight);
    if (o && id && label && !out.some((c) => c.id === id)) out.push({ id, label, weight: w !== undefined && w >= 0 ? w : 1 });
  }
  return out;
}

/** Las elecciones explícitas del comprador, por artículo (la última gana). */
export function cleanChoices(v: unknown): Map<string, { supplier: string; reason?: string }> {
  const out = new Map<string, { supplier: string; reason?: string }>();
  for (const x of list(v)) {
    const o = obj(x);
    const item = idOf(o?.item);
    const supplier = idOf(o?.supplier);
    if (o && item && supplier) out.set(item, { supplier, reason: str(o.reason) });
  }
  return out;
}

/** Una lista de textos (ids excluidos, motivos), sin vacíos ni repetidos. */
export function cleanStrings(v: unknown): string[] {
  const out: string[] = [];
  for (const x of list(v)) {
    const s = idOf(x)?.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function cleanRanking(v: unknown): AwardRank[] {
  const out: AwardRank[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = obj(x);
    const supplier = idOf(o?.supplier);
    const score = num(o?.score);
    if (!o || !supplier || score === undefined || out.some((r) => r.supplier === supplier)) continue;
    const s = obj(o.scores);
    const scores: Record<string, number> = {};
    if (s) for (const [k, n] of Object.entries(s)) if (num(n) !== undefined) scores[k] = num(n)!;
    out.push({ supplier, score, scores: s ? scores : undefined });
  }
  return out;
}

/** Un evento de la recomendación, validado (lo que no se entiende se ignora). */
export function cleanEvent(v: unknown): AwardEvent | null {
  const o = obj(v);
  if (!o) return null;
  const tone = TONES.has(o.tone as AwardTone) ? (o.tone as AwardTone) : undefined;
  switch (o.type) {
    case "recommend": {
      const item = idOf(o.item);
      if (!item) return null;
      const rec: AwardRecommendation = { item, supplier: idOf(o.supplier) ?? null, reason: str(o.reason), ranking: cleanRanking(o.ranking) };
      return { type: "recommend", ...rec };
    }
    case "flag": {
      const item = idOf(o.item);
      const message = str(o.message);
      if (!item || !message) return null;
      const flag: AwardFlag = { item, supplier: idOf(o.supplier), message, tone: tone ?? "warning" };
      return { type: "flag", ...flag };
    }
    case "scenario": {
      const id = idOf(o.id);
      const label = str(o.label);
      const p = obj(o.picks);
      if (!id || !label || !p) return null;
      const picks: AwardValue = {};
      for (const [k, s] of Object.entries(p)) if (idOf(s)) picks[k] = idOf(s)!;
      const sc: AwardScenario = { id, label, detail: str(o.detail), picks };
      return { type: "scenario", ...sc };
    }
    case "note":
    case "error": {
      const message = str(o.message);
      if (!message) return null;
      return o.type === "error" ? { type: "error", message } : { type: "note", message, tone: tone ?? "neutral" };
    }
    case "done":
      return { type: "done" };
  }
  return null;
}

/** Una línea del stream (ya sin `data:`): JSON → evento. `[DONE]` también termina. */
export function parseEvent(raw: string | null): AwardEvent | null {
  if (raw === "[DONE]") return { type: "done" };
  try {
    return raw ? cleanEvent(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- cuentas

/** Lo que vale una línea: precio × cantidad. */
export const lineTotal = (q: AwardQuote | undefined, item: AwardItem): number => (q ? cents(q.price * item.qty) : 0);

/** El total de una adjudicación y cuántos proveedores (órdenes) usa. */
export function totalOf(items: readonly AwardItem[], value: AwardValue, quotes: ReadonlyMap<string, AwardQuote>): { total: number; suppliers: number } {
  let total = 0;
  const used = new Set<string>();
  for (const it of items) {
    const s = value[it.id];
    const q = s ? quotes.get(qkey(it.id, s)) : undefined;
    if (!q) continue;
    total += lineTotal(q, it);
    used.add(s);
  }
  return { total: cents(total), suppliers: used.size };
}

/** Las órdenes de compra, una por proveedor (en el orden de `suppliers`), y lo que quedó sin adjudicar. */
export function buildOrders(items: readonly AwardItem[], suppliers: readonly AwardSupplier[], value: AwardValue, quotes: ReadonlyMap<string, AwardQuote>): { orders: AwardOrder[]; total: number; unassigned: string[] } {
  const by = new Map<string, AwardOrder>();
  const unassigned: string[] = [];
  let total = 0;
  for (const it of items) {
    const s = value[it.id];
    const q = s ? quotes.get(qkey(it.id, s)) : undefined;
    if (!q) {
      unassigned.push(it.id);
      continue;
    }
    let o = by.get(s);
    if (!o) by.set(s, (o = { supplier: s, lines: [], total: 0 }));
    const t = lineTotal(q, it);
    o.lines.push({ item: it.id, qty: it.qty, price: q.price, total: t });
    o.total = cents(o.total + t);
    total += t;
  }
  const rank = new Map(suppliers.map((s, i) => [s.id, i]));
  const orders = [...by.values()].sort((a, b) => (rank.get(a.supplier) ?? 1e9) - (rank.get(b.supplier) ?? 1e9));
  return { orders, total: cents(total), unassigned };
}

/** Los artículos donde la elección se aparta de la sugerencia, con lo que cuesta de más (o de menos). */
export function changesOf(items: readonly AwardItem[], choices: ReadonlyMap<string, { supplier: string; reason?: string }>, rec: (item: string) => string | null, quotes: ReadonlyMap<string, AwardQuote>): AwardChange[] {
  const out: AwardChange[] = [];
  for (const it of items) {
    const c = choices.get(it.id);
    const r = rec(it.id);
    const q = c && quotes.get(qkey(it.id, c.supplier));
    if (!c || !r || !q || c.supplier === r) continue;
    out.push({ item: it.id, supplier: c.supplier, recommended: r, reason: c.reason?.trim() || undefined, delta: cents(lineTotal(q, it) - lineTotal(quotes.get(qkey(it.id, r)), it)) });
  }
  return out;
}

/** Las elecciones como lista (`choices` de la prop). */
export const choiceList = (m: ReadonlyMap<string, { supplier: string; reason?: string }>): AwardChoice[] => [...m].map(([item, c]) => (c.reason?.trim() ? { item, supplier: c.supplier, reason: c.reason.trim() } : { item, supplier: c.supplier }));

// ---------------------------------------------------------------- pesos

/** Los pesos de los criterios como fracción de su suma (si todos son 0, a partes iguales). */
export function shares(criteria: readonly AwardCriterion[], weights: Readonly<Record<string, number>>): Record<string, number> {
  const w = criteria.map((c) => Math.max(0, weights[c.id] ?? c.weight));
  const sum = w.reduce((a, b) => a + b, 0);
  return Object.fromEntries(criteria.map((c, i) => [c.id, sum > 0 ? w[i] / sum : 1 / criteria.length]));
}

/** Cuánto aporta cada criterio al puntaje de un proveedor (0–100 en total): su parte del peso por
 *  lo que sacó. Sin puntajes por criterio, `null` (se muestra solo el total). */
export function contributions(rank: AwardRank, criteria: readonly AwardCriterion[], share: Readonly<Record<string, number>>): number[] | null {
  if (!rank.scores || !criteria.some((c) => rank.scores![c.id] !== undefined)) return null;
  return criteria.map((c) => Math.max(0, Math.min(100, rank.scores![c.id] ?? 0)) * (share[c.id] ?? 0));
}

/** «{id}\n{mensajes}»: una alerta abierta sigue abierta si llega igual en otra recomendación. */
export const flagSig = (item: string, flags: readonly AwardFlag[]): string => [item, ...flags.map((f) => `${f.supplier ?? ""}:${f.message}`)].join("\n");

// ---------------------------------------------------------------- grilla

/**
 * A dónde lleva una tecla en la grilla (patrón «data grid» de WAI-ARIA): flechas una celda,
 * Inicio/Fin al comienzo o final de la fila (con Ctrl, de la grilla), RePág/AvPág diez filas.
 * `null` si la tecla no es de movimiento.
 */
export function gridMove(key: string, row: number, col: number, rows: number, cols: number, ctrl = false): [number, number] | null {
  if (rows < 1 || cols < 1) return null;
  const r = (n: number) => Math.max(0, Math.min(rows - 1, n));
  const c = (n: number) => Math.max(0, Math.min(cols - 1, n));
  switch (key) {
    case "ArrowUp":
      return [r(row - 1), col];
    case "ArrowDown":
      return [r(row + 1), col];
    case "ArrowLeft":
      return [row, c(col - 1)];
    case "ArrowRight":
      return [row, c(col + 1)];
    case "Home":
      return ctrl ? [0, 0] : [row, 0];
    case "End":
      return ctrl ? [rows - 1, cols - 1] : [row, cols - 1];
    case "PageUp":
      return [r(row - 10), col];
    case "PageDown":
      return [r(row + 10), col];
  }
  return null;
}

/** La siguiente posición (en `dir`, dando la vuelta) que cumple `ok`, empezando después de `from`. -1 si ninguna. */
export function nextIndex(n: number, from: number, dir: 1 | -1, ok: (i: number) => boolean): number {
  // Sin posición (-1): hacia adelante empieza por la primera; hacia atrás, por la última.
  if (from < 0) from = dir > 0 ? -1 : n;
  for (let k = 1; k <= n; k++) {
    const i = (((from + dir * k) % n) + n) % n;
    if (ok(i)) return i;
  }
  return -1;
}
