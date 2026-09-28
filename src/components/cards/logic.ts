/** Lógica pura de `<nx-cards>`: sin DOM, para probarse en node. */
import type { NxFormat } from "../../core/locale";
import { foldText } from "../../core/text";
import type { CardsField, CardsLayout, CardsLevel, CardsOption, CardsRow, CardsTone } from "./types";

export { moveIndex, type Box } from "../../core/nav";
export { sparkPaths } from "../../core/spark";

export const LEVELS: readonly CardsLevel[] = ["map", "cards", "detail"];

/** Un nivel válido (`cards` por defecto). */
export function parseLevel(v: unknown): CardsLevel {
  return LEVELS.includes(v as CardsLevel) ? (v as CardsLevel) : "cards";
}

/** Un nivel más de detalle (`dir` > 0) o menos, sin salirse de los extremos. */
export function stepLevel(level: CardsLevel, dir: number): CardsLevel {
  const i = LEVELS.indexOf(level) + Math.sign(dir);
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i))];
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** El estado de un valor en un campo `status` (o `null`). */
export function statusOf(field: CardsField | undefined, v: unknown): CardsOption | null {
  if (v === null || v === undefined || v === "") return null;
  return field?.options?.find((o) => o.value === String(v)) ?? { value: String(v) };
}

/** El texto de un valor según su campo. Vacío si no hay nada que mostrar. */
export function formatField(field: CardsField | undefined, v: unknown, fmt: NxFormat): string {
  if (v === null || v === undefined || v === "") return "";
  const n = num(v);
  const unit = field?.unit ? ` ${field.unit}` : "";
  switch (field?.type) {
    case "money":
      return n === null ? String(v) : fmt.money(n, { currency: field.currency }, !!field.compact);
    case "number":
      return n === null ? String(v) : `${field.compact ? fmt.compact(n) : fmt.number(n)}${unit}`;
    case "percent":
      return n === null ? String(v) : `${fmt.number(n)} %`;
    case "rating":
      return n === null ? String(v) : `★ ${fmt.number(n)}`;
    case "date":
      return fmt.date(String(v));
    case "status": {
      const o = statusOf(field, v)!;
      return o.label ?? o.value;
    }
    default:
      return `${typeof v === "object" ? "" : String(v)}${n === null ? "" : unit}`;
  }
}

/** Un cambio porcentual: «▲ 12 %» o «▼ 4 %» (redondeado). */
export function deltaParts(v: unknown, fmt: NxFormat): { up: boolean; text: string } | null {
  const n = num(v);
  if (n === null) return null;
  return { up: n >= 0, text: `${n >= 0 ? "▲" : "▼"} ${fmt.number(Math.abs(Math.round(n)))} %` };
}

/** El tono de una barra de porcentaje según `good` y `bad` (sin umbrales, `null`: el acento). */
export function meterTone(v: unknown, field: CardsField | undefined): CardsTone | null {
  const n = num(v);
  if (n === null || !field || (field.good === undefined && field.bad === undefined)) return null;
  if (field.good !== undefined && n >= field.good) return "success";
  if (field.bad !== undefined && n <= field.bad) return "danger";
  return "warning";
}

/**
 * La posición de cada fila por peso, de 0 (la menor) a 1 (la mayor). Las filas sin peso cuentan
 * como la menor. Decide la intensidad en el mapa y las tarjetas que ocupan dos columnas.
 */
export function weightRanks(rows: readonly CardsRow[], key: string | undefined): Map<CardsRow, number> {
  const out = new Map<CardsRow, number>();
  if (!key || rows.length < 2) {
    for (const r of rows) out.set(r, 0);
    return out;
  }
  const sorted = [...rows].sort((a, b) => (num(a[key]) ?? -Infinity) - (num(b[key]) ?? -Infinity));
  sorted.forEach((r, i) => out.set(r, num(r[key]) === null ? 0 : i / (sorted.length - 1)));
  return out;
}

/** La intensidad del acento en el mapa para una posición 0–1: de 14 % a 82 %. */
export function mixFor(rank: number): number {
  return Math.round(14 + Math.max(0, Math.min(1, rank)) * 68);
}

/** Las que ocupan dos columnas: el 10 % de más peso, y solo si hay al menos 10 filas. */
export function isHeavy(rank: number, count: number): boolean {
  return count >= 10 && rank >= 0.9;
}

/** Si la fila coincide con la consulta: título, subtítulo, estado y los campos con `search`. */
export function matchRow(row: CardsRow, query: string, fields: ReadonlyMap<string, CardsField>, layout: CardsLayout, fmt: NxFormat): boolean {
  const q = foldText(query).trim();
  if (!q) return true;
  const keys = new Set<string>([layout.title, ...(layout.subtitle ?? [])]);
  if (layout.status) keys.add(layout.status);
  for (const f of fields.values()) if (f.search) keys.add(f.key);
  for (const k of keys) {
    const text = formatField(fields.get(k), row[k], fmt) || String(row[k] ?? "");
    if (foldText(text).includes(q)) return true;
  }
  return false;
}

/** Ordena (estable) por un campo: los vacíos siempre al final. Sin campo, el orden original. */
export function sortRows(rows: readonly CardsRow[], field: CardsField | undefined, dir: "asc" | "desc", fmt: NxFormat): CardsRow[] {
  if (!field) return [...rows];
  const sign = dir === "desc" ? -1 : 1;
  const k = field.key;
  const statusIndex = (v: unknown) => field.options?.findIndex((o) => o.value === String(v)) ?? -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => {
      const va = a.r[k];
      const vb = b.r[k];
      const ea = va === null || va === undefined || va === "";
      const eb = vb === null || vb === undefined || vb === "";
      if (ea || eb) return ea === eb ? a.i - b.i : ea ? 1 : -1;
      let c: number;
      if (field.type === "status" && field.options?.length) c = statusIndex(va) - statusIndex(vb);
      else if (typeof va === "number" && typeof vb === "number") c = va - vb;
      else c = fmt.compare(String(va), String(vb));
      return c * sign || a.i - b.i;
    })
    .map((x) => x.r);
}

export interface CardsGroup {
  key: string;
  label: string;
  rows: CardsRow[];
  /** La suma del campo `value`, si es numérico. */
  total: number | null;
}

/**
 * Agrupa (conservando el orden de las filas dentro de cada grupo). Un campo `status` sigue el orden
 * de sus opciones; los demás, de mayor a menor peso total (o por cantidad, sin peso). Sin campo, un
 * solo grupo sin título. Las filas sin valor van en «—» al final.
 */
export function groupRows(rows: readonly CardsRow[], field: CardsField | undefined, layout: CardsLayout, fmt: NxFormat): CardsGroup[] {
  const valueKey = layout.value;
  const sum = (list: CardsRow[]) => {
    if (!valueKey) return null;
    let t = 0;
    let any = false;
    for (const r of list) {
      const n = num(r[valueKey]);
      if (n !== null) {
        t += n;
        any = true;
      }
    }
    return any ? t : null;
  };
  if (!field) return [{ key: "", label: "", rows: [...rows], total: sum([...rows]) }];
  const map = new Map<string, CardsRow[]>();
  for (const r of rows) {
    const v = r[field.key];
    const k = v === null || v === undefined || v === "" ? "" : String(v);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  const weightKey = layout.weight ?? layout.value;
  const weight = (list: CardsRow[]) => (weightKey ? list.reduce((t, r) => t + (num(r[weightKey]) ?? 0), 0) : list.length);
  const groups = [...map].map(([k, list]) => ({ key: k, label: k ? formatField(field, k, fmt) : "—", rows: list, total: sum(list), w: weight(list) }));
  const order = field.type === "status" && field.options?.length ? field.options.map((o) => o.value) : null;
  groups.sort((a, b) => {
    if (!a.key !== !b.key) return a.key ? -1 : 1;
    if (order) return (order.indexOf(a.key) + 1 || 1e9) - (order.indexOf(b.key) + 1 || 1e9);
    return b.w - a.w || b.rows.length - a.rows.length;
  });
  return groups.map(({ w: _w, ...g }) => g);
}

/** «{n} de {total}» con los números puestos. */
export function fillCount(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}
