/** Lógica pura de `<nx-grid>`: valores, filtros, orden, histogramas, grupos, estadísticas y TSV. */
import { foldText } from "../../core/text";
import { nxFormat, type NxFormat } from "../../core/locale";
import type { GridColumn, GridFilter, GridHistogram, GridRow, GridSort } from "./types";

// Las funciones que muestran o leen valores reciben el formato del locale (`nxFormat`); sin él,
// usan «es-CO».

export const colType = (c: GridColumn) => c.type ?? "text";
export const isNumeric = (c: GridColumn) => colType(c) === "number" || colType(c) === "money";

// ---------------------------------------------------------------- valores

export function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim()) {
    const n = parseNumber(v);
    return n;
  }
  return null;
}

/** «1.234.567», «1.234,5», «1234.5», «$ 12» → número. Para datos y frases en español; lo que se
 *  escribe en una celda se lee con el locale de la tabla (`NxFormat.parse`). */
export function parseNumber(text: string): number | null {
  let t = text.replace(/[^\d.,-]/g, "");
  if (!t || t === "-") return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** «8,2 M», «450 k», «85» (según el locale). */
export function compact(n: number, f: NxFormat = nxFormat()): string {
  return f.compact(n);
}

export function formatDate(iso: string, f: NxFormat = nxFormat()): string {
  return f.date(iso);
}

/** El texto de una celda (lo que se ve, se copia y se busca). */
export function formatCell(v: unknown, c: GridColumn, f: NxFormat = nxFormat()): string {
  if (v === null || v === undefined || v === "") return "";
  switch (colType(c)) {
    case "number": {
      const n = num(v);
      return n === null ? String(v) : f.number(n);
    }
    case "money": {
      const n = num(v);
      return n === null ? String(v) : f.money(n, c);
    }
    case "date":
      return f.date(String(v));
    case "status":
      return c.options?.find((o) => o.value === String(v))?.label ?? String(v);
    default:
      return String(v);
  }
}

/** Lo que alguien escribe en una celda editable, en el tipo de la columna. */
export function parseInput(text: string, c: GridColumn, f: NxFormat = nxFormat()): unknown {
  const t = text.trim();
  if (isNumeric(c)) return t ? f.parse(t) : null;
  if (colType(c) === "status") {
    const k = foldText(t);
    return c.options?.find((o) => foldText(o.value) === k || foldText(o.label ?? "") === k)?.value ?? t;
  }
  return t;
}

// ---------------------------------------------------------------- filtros y orden

export function matchFilter(row: GridRow, f: GridFilter): boolean {
  const v = row[f.key];
  switch (f.op) {
    case "in":
      return f.values.includes(String(v ?? ""));
    case "notIn":
      return !f.values.includes(String(v ?? ""));
    case "contains":
      return foldText(String(v ?? "")).includes(foldText(f.value));
    case "range": {
      if (v === null || v === undefined || v === "") return false;
      const x = typeof f.min === "string" || typeof f.max === "string" ? String(v) : num(v);
      if (x === null) return false;
      if (f.min !== undefined && x < f.min) return false;
      if (f.max !== undefined && x >= f.max) return false;
      return true;
    }
  }
}

export function applyFilters(rows: readonly GridRow[], filters: readonly GridFilter[]): GridRow[] {
  if (!filters.length) return rows as GridRow[];
  return rows.filter((r) => filters.every((f) => matchFilter(r, f)));
}

/** Orden estable. El texto sigue el alfabeto del locale (tildes y mayúsculas no cuentan, «OC-9» va
 *  antes que «OC-10»); los estados, el orden de sus opciones. */
export function sortRows(rows: readonly GridRow[], sort: GridSort | null, columns: readonly GridColumn[], f: NxFormat = nxFormat()): GridRow[] {
  if (!sort) return rows as GridRow[];
  const c = columns.find((x) => x.key === sort.key);
  if (!c) return rows as GridRow[];
  const numeric = isNumeric(c);
  const order = c.options && new Map(c.options.map((o, i) => [o.value, i]));
  const key = (r: GridRow): number | string => {
    const v = r[sort.key];
    if (numeric) return num(v) ?? Number.NEGATIVE_INFINITY;
    if (order) return order.get(String(v)) ?? order.size;
    return v === null || v === undefined ? "" : String(v);
  };
  const keyed = rows.map((r, i) => ({ r, i, k: key(r) }));
  // El texto se ordena por rango: los valores distintos (pocos, casi siempre) se ordenan con el
  // alfabeto del locale una sola vez, y las filas se comparan como números. Comparar 100.000
  // textos con `Intl.Collator` en cada paso es varias veces más lento.
  if (keyed.length && typeof keyed[0].k === "string") {
    const distinct = [...new Set(keyed.map((x) => x.k as string))].sort(f.compare);
    const rank = new Map<string, number>();
    // «Árbol» y «arbol» comparten rango: entre ellas manda el orden original (estable).
    distinct.forEach((v, i) => rank.set(v, i && f.compare(distinct[i - 1], v) === 0 ? rank.get(distinct[i - 1])! : i));
    for (const x of keyed) x.k = rank.get(x.k as string)!;
  }
  return keyed.sort((a, b) => ((a.k as number) - (b.k as number)) * sort.dir || a.i - b.i).map((x) => x.r);
}

/** El texto de un chip de filtro. */
export function filterLabel(f: GridFilter, c: GridColumn | undefined, fmt: NxFormat = nxFormat()): string {
  const name = c?.label ?? f.key;
  const show = (v: number | string) => (typeof v === "string" ? fmt.date(v) : c && colType(c) === "money" ? fmt.money(v, c, true) : fmt.compact(v));
  const opt = (v: string) => c?.options?.find((o) => o.value === v)?.label ?? v;
  switch (f.op) {
    case "in":
      return `${name}: ${f.values.map(opt).join(", ")}`;
    case "notIn":
      return `${name}: sin ${f.values.map(opt).join(", ")}`;
    case "contains":
      return `${name} contiene «${f.value}»`;
    case "range":
      if (typeof f.min === "string" && typeof f.max === "string" && /-01$/.test(f.min) && /-01$/.test(f.max) && monthSpan(f.min, f.max) === 1) return `${name}: ${fmt.date(f.min.slice(0, 7))}`;
      if (f.min !== undefined && f.max !== undefined) return `${name}: ${show(f.min)} – ${show(f.max)}`;
      if (f.min !== undefined) return `${name} ≥ ${show(f.min)}`;
      return `${name} < ${show(f.max!)}`;
  }
}

function monthSpan(a: string, b: string): number {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

// ---------------------------------------------------------------- histogramas

/** Bordes «bonitos» (1-2-5) entre min y max; logarítmicos si los datos abarcan varios órdenes. */
export function niceEdges(min: number, max: number, target = 10): number[] {
  if (!(max > min)) return [min, min + 1];
  if (min > 0 && max / min > 100) {
    const edges: number[] = [];
    for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
      for (const m of [1, 2, 5]) {
        const v = m * 10 ** e;
        if (v <= min) edges.length = 0;
        edges.push(v);
        if (v > max) return edges;
      }
    }
    return edges;
  }
  const raw = (max - min) / target;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw)!;
  const start = Math.floor(min / step) * step;
  const edges = [start];
  while (edges[edges.length - 1] <= max) edges.push(edges[edges.length - 1] + step);
  return edges;
}

function binIndex(edges: readonly (number | string)[], v: number | string): number {
  let lo = 0;
  let hi = edges.length - 2;
  if (v < edges[0] || v >= edges[edges.length - 1]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (v >= edges[mid]) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export interface HistogramSpec {
  kind: "bins" | "categories";
  labels: string[];
  edges?: (number | string)[];
  values?: string[];
  /** Índice de la barra de una fila, o -1. */
  index: (row: GridRow) => number;
  /** Conteo sobre todas las filas, calculado una vez por arreglo de filas. */
  memo?: { rows: readonly GridRow[]; counts: number[] };
}

const MAX_CATEGORIES = 12;

/** Cómo se reparte una columna (se calcula sobre TODAS las filas, una vez por versión de datos). */
export function histogramSpec(c: GridColumn, rows: readonly GridRow[], f: NxFormat = nxFormat()): HistogramSpec | null {
  if (c.histogram === false || c.ai) return null;
  const t = colType(c);
  if (isNumeric(c)) {
    let min = Infinity;
    let max = -Infinity;
    for (const r of rows) {
      const v = num(r[c.key]);
      if (v === null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) return null;
    const edges = niceEdges(min, max);
    const show = (v: number) => (t === "money" ? f.money(v, c, true) : f.compact(v));
    return {
      kind: "bins",
      edges,
      labels: edges.slice(0, -1).map((e, i) => `${show(e)} – ${show(edges[i + 1])}`),
      index: (r) => {
        const v = num(r[c.key]);
        return v === null ? -1 : binIndex(edges, v);
      },
    };
  }
  if (t === "date") {
    const months = new Set<string>();
    for (const r of rows) {
      const v = String(r[c.key] ?? "");
      if (/^\d{4}-\d{2}/.test(v)) months.add(v.slice(0, 7));
    }
    if (!months.size) return null;
    const sorted = [...months].sort();
    const byYear = sorted.length > 24;
    const keys = byYear ? [...new Set(sorted.map((m) => m.slice(0, 4)))] : sorted;
    const next = (k: string) => {
      if (byYear) return `${Number(k) + 1}-01-01`;
      const [y, m] = k.split("-").map(Number);
      return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    };
    const edges = [...keys.map((k) => (byYear ? `${k}-01-01` : `${k}-01`)), next(keys[keys.length - 1])];
    return {
      kind: "bins",
      edges,
      labels: keys.map((k) => (byYear ? k : f.date(k))),
      index: (r) => {
        const v = String(r[c.key] ?? "");
        return v ? binIndex(edges, v) : -1;
      },
    };
  }
  // Categorías: las opciones declaradas, o los valores distintos si son pocos.
  let values = c.options?.map((o) => o.value);
  if (!values) {
    const count = new Map<string, number>();
    for (const r of rows) {
      const v = String(r[c.key] ?? "");
      if (!v) continue;
      count.set(v, (count.get(v) ?? 0) + 1);
      if (count.size > MAX_CATEGORIES * 4) return null;
    }
    // Si ningún valor se repite es un identificador, no una categoría.
    if (count.size > MAX_CATEGORIES || count.size < 2 || count.size === rows.length) return null;
    values = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
  }
  const at = new Map(values.map((v, i) => [v, i]));
  return {
    kind: "categories",
    values,
    labels: values.map((v) => c.options?.find((o) => o.value === v)?.label ?? v),
    index: (r) => at.get(String(r[c.key] ?? "")) ?? -1,
  };
}

export function histogram(spec: HistogramSpec, all: readonly GridRow[], filtered: readonly GridRow[]): GridHistogram {
  if (spec.memo?.rows !== all) {
    const c = new Array<number>(spec.labels.length).fill(0);
    for (const r of all) {
      const i = spec.index(r);
      if (i >= 0) c[i]++;
    }
    spec.memo = { rows: all, counts: c };
  }
  const counts = spec.memo.counts;
  const fcounts = new Array<number>(spec.labels.length).fill(0);
  if (filtered === all) fcounts.splice(0, fcounts.length, ...counts);
  else
    for (const r of filtered) {
      const i = spec.index(r);
      if (i >= 0) fcounts[i]++;
    }
  return { kind: spec.kind, labels: spec.labels, counts, filtered: fcounts, edges: spec.edges, values: spec.values };
}

// ---------------------------------------------------------------- grupos

export interface GridGroup {
  key: string;
  label: string;
  rows: GridRow[];
  /** Subtotales de las columnas numéricas. */
  sums: Record<string, number>;
}

/** Agrupa por una columna (por mes si es fecha), con subtotales. Ordena por tamaño, o por el orden
 *  de las opciones / cronológico. */
export function groupRows(rows: readonly GridRow[], c: GridColumn, columns: readonly GridColumn[], f: NxFormat = nxFormat()): GridGroup[] {
  const numeric = columns.filter(isNumeric);
  const date = colType(c) === "date";
  const groups = new Map<string, GridGroup>();
  for (const r of rows) {
    const raw = String(r[c.key] ?? "");
    const key = date ? raw.slice(0, 7) : raw;
    let g = groups.get(key);
    if (!g) {
      g = { key, label: key ? (date ? f.date(key) : formatCell(raw, c, f)) : "—", rows: [], sums: {} };
      groups.set(key, g);
    }
    g.rows.push(r);
    for (const n of numeric) g.sums[n.key] = (g.sums[n.key] ?? 0) + (num(r[n.key]) ?? 0);
  }
  const list = [...groups.values()];
  const order = c.options?.map((o) => o.value);
  if (date) list.sort((a, b) => (a.key < b.key ? -1 : 1));
  else if (order) list.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  else list.sort((a, b) => b.rows.length - a.rows.length);
  return list;
}

// ---------------------------------------------------------------- selección y portapapeles

export function stats(values: readonly number[]): { count: number; sum: number; avg: number; min: number; max: number } | null {
  if (!values.length) return null;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return { count: values.length, sum, avg: sum / values.length, min, max };
}

/** Una matriz como TSV (lo que Excel entiende al pegar). Las celdas con tabs o saltos van entre comillas. */
export function toTSV(matrix: readonly (readonly string[])[]): string {
  const cell = (s: string) => (/[\t\n"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return matrix.map((r) => r.map(cell).join("\t")).join("\n");
}

/** TSV (lo que Excel copia) a matriz, con las comillas de Excel. */
export function parseTSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const t = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// ---------------------------------------------------------------- facetas

export interface GridFacet {
  key: string;
  label: string;
  /** Opciones en orden, con su conteo (aplicando los DEMÁS filtros, no los de esta faceta). */
  options: { value: string; label: string; count: number }[];
  /** Lo marcado ahora (el filtro `in` de esta columna). */
  selected: string[];
}

/** Las columnas que van al panel: `status`, y texto con pocas opciones distintas. */
export function facetColumns(columns: readonly GridColumn[], rows: readonly GridRow[], max = 40): GridColumn[] {
  return columns.filter((c) => {
    if (c.ai || isNumeric(c) || colType(c) === "date") return false;
    if (c.options) return true;
    const seen = new Set<string>();
    let n = 0;
    for (let i = 0; i < rows.length && i < 20000; i++, n++) {
      const v = rows[i][c.key];
      if (typeof v === "string" && v) seen.add(v);
      if (seen.size > max) return false;
    }
    return seen.size >= 2 && seen.size < n;
  });
}

/** El orden de las opciones de cada faceta: las declaradas, o por frecuencia en TODAS las filas.
 *  Es estable: marcar una casilla no reordena la lista. Se calcula una vez por versión de datos. */
export function facetOrder(columns: readonly GridColumn[], rows: readonly GridRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const c of columns) {
    if (c.options) {
      out.set(c.key, c.options.map((o) => o.value));
      continue;
    }
    const total = new Map<string, number>();
    for (const r of rows) {
      const v = String(r[c.key] ?? "");
      if (v) total.set(v, (total.get(v) ?? 0) + 1);
    }
    out.set(c.key, [...total.keys()].sort((a, b) => total.get(b)! - total.get(a)! || a.localeCompare(b)));
  }
  return out;
}

/**
 * Filtra y cuenta las facetas en UNA pasada, con la regla de nx32 (`ListingGrid`): dentro de una
 * faceta las opciones se suman (O), entre facetas se restringen (Y), y cada opción se cuenta con
 * todos los filtros MENOS los de su propia columna (una faceta nunca se cuenta a sí misma).
 *
 * Por fila se evalúa cada columna filtrada una vez: si no falla ninguna, la fila pasa y cuenta en
 * todas las facetas; si falla solo una, cuenta únicamente en la faceta de esa columna.
 */
export function crossfilter(
  rows: readonly GridRow[],
  filters: readonly GridFilter[],
  columns: readonly GridColumn[],
  order: Map<string, string[]> = facetOrder(columns, rows),
): { filtered: GridRow[]; facets: GridFacet[] } {
  const byKey = new Map<string, GridFilter[]>();
  for (const f of filters) byKey.set(f.key, [...(byKey.get(f.key) ?? []), f]);
  const groups = [...byKey];
  const counts = columns.map(() => new Map<string, number>());
  const at = new Map(columns.map((c, i) => [c.key, i]));
  const bump = (i: number, r: GridRow) => {
    const v = String(r[columns[i].key] ?? "");
    if (v) counts[i].set(v, (counts[i].get(v) ?? 0) + 1);
  };
  const filtered: GridRow[] = [];
  for (const r of rows) {
    let fails = 0;
    let failed = "";
    for (const [key, fs] of groups) {
      if (fs.every((f) => matchFilter(r, f))) continue;
      failed = key;
      if (++fails > 1) break;
    }
    if (fails === 0) {
      filtered.push(r);
      for (let i = 0; i < columns.length; i++) bump(i, r);
    } else if (fails === 1) {
      const i = at.get(failed);
      if (i !== undefined) bump(i, r);
    }
  }
  return {
    filtered: filters.length ? filtered : (rows as GridRow[]),
    facets: columns.map((c, i) => {
      const own = filters.find((f): f is Extract<GridFilter, { op: "in" }> => f.key === c.key && f.op === "in");
      return {
        key: c.key,
        label: c.label,
        options: (order.get(c.key) ?? []).map((v) => ({ value: v, label: c.options?.find((o) => o.value === v)?.label ?? v, count: counts[i].get(v) ?? 0 })),
        selected: own?.values ?? [],
      };
    }),
  };
}

/** Solo las facetas (ver `crossfilter`). */
export function facets(columns: readonly GridColumn[], rows: readonly GridRow[], filters: readonly GridFilter[]): GridFacet[] {
  return crossfilter(rows, filters, columns).facets;
}

/** Marca o desmarca un valor de faceta: edita (o crea, o quita) el filtro `in` de esa columna. */
export function toggleFacet(filters: readonly GridFilter[], key: string, value: string): GridFilter[] {
  const own = filters.find((f): f is Extract<GridFilter, { op: "in" }> => f.key === key && f.op === "in");
  const rest = filters.filter((f) => f !== own);
  const values = own ? (own.values.includes(value) ? own.values.filter((v) => v !== value) : [...own.values, value]) : [value];
  return values.length ? [...rest, { key, op: "in", values }] : rest;
}
