/** Las barras del filtro de una columna de `<nx-grid>` (montos, números y fechas): cómo se reparten
 *  los datos. Solo las usa el panel del filtro, que se carga aparte. */
import { nxFormat, type NxFormat } from "../../core/locale";
import { colType, isNumeric, num } from "./logic";
import type { GridColumn, GridHistogram, GridRow } from "./types";

/** Bordes «bonitos» (1-2-5) entre min y max; logarítmicos si los datos abarcan varios órdenes. */
export function niceEdges(min: number, max: number, target = 10): number[] {
  if (!(max > min) || !Number.isFinite(min) || !Number.isFinite(max)) return [min, min + 1];
  // Un rango por debajo de la precisión del número (0,3 y 0,1 + 0,2; 1e17 y 1e17 + 16): sumar el
  // paso no mueve el borde y el bucle no terminaría. Se trata como un solo valor.
  if ((max - min) / Math.max(Math.abs(min), Math.abs(max)) < 1e-9) return [min, max + Math.abs(max) * 1e-6];
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
  // Con un paso ≥ rango/objetivo bastan objetivo + 2 bordes; el tope es una red por si el redondeo
  // de coma flotante deja de avanzar.
  while (edges[edges.length - 1] <= max) {
    if (edges.length > target * 4 + 2) return [min, max + Math.abs(max - min) * 1e-6 || max + 1];
    edges.push(edges[edges.length - 1] + step);
  }
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

