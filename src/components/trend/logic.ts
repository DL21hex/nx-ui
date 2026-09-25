/** Lógica pura de `<nx-trend>`: validar datos, escalas, anomalías, resumen y la pregunta. Sin DOM. */
import type { TrendAnomaly, TrendContext, TrendFlag, TrendFormat, TrendKind, TrendLabels, TrendPoint, TrendSeries } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const idOf = (v: unknown): string | undefined => str(v) ?? (typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const FORMATS = new Set<TrendFormat>(["number", "money", "percent"]);
/** Un mes («2026-08») o un día («2026-08-15»). */
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/;

/** Los puntos válidos, ordenados por `x` y sin repetidos (gana el último). `y` no numérico es `null`. */
export function cleanPoints(v: unknown): TrendPoint[] {
  if (!Array.isArray(v)) return [];
  const by = new Map<string, number | null>();
  for (const raw of v) {
    const o = raw as Record<string, unknown> | null;
    const x = o && typeof o === "object" ? str(o.x)?.trim() : undefined;
    if (!x || !PERIOD.test(x)) continue;
    by.set(x, typeof o!.y === "number" && Number.isFinite(o!.y) ? o!.y : null);
  }
  return [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([x, y]) => ({ x, y }));
}

/** Las series válidas (con `id`, `label` y algún punto), sin lo que no es suyo. Un `id` repetido se descarta. */
export function cleanSeries(v: unknown): TrendSeries[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: TrendSeries[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = idOf(o.id);
    const label = str(o.label);
    const points = cleanPoints(o.points);
    if (!id || !label || !points.length || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label,
      points,
      format: FORMATS.has(o.format as TrendFormat) ? (o.format as TrendFormat) : undefined,
      currency: str(o.currency),
      kind: o.kind === "bar" || o.kind === "line" ? (o.kind as TrendKind) : undefined,
      muted: o.muted === true || undefined,
      hidden: o.hidden === true || undefined,
    });
  }
  return out;
}

/** Las anomalías válidas (`series` y `x`), con su etiqueta si la traen. */
export function cleanAnomalies(v: unknown): TrendAnomaly[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((raw) => {
    const o = raw as Record<string, unknown> | null;
    const series = o && typeof o === "object" ? idOf(o.series) : undefined;
    const x = o && str(o.x)?.trim();
    return series && x && PERIOD.test(x) ? [{ series, x, label: str(o!.label) }] : [];
  });
}

/** Todos los periodos de las series, ordenados (el eje x). Ocultar una serie no mueve el eje. */
export function periodsOf(series: readonly TrendSeries[]): string[] {
  return [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
}

/**
 * Ticks «redondos» para el eje y: 0 / 100 / 200… El dominio se amplía hasta el tick más cercano
 * (y a cero si `zero`, como piden las barras).
 */
export function niceTicks(min: number, max: number, count = 5, zero = false): number[] {
  if (zero) {
    min = Math.min(0, min);
    max = Math.max(0, max);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
  if (max === min) {
    const pad = Math.abs(max) * 0.1 || 1;
    min -= zero && min === 0 ? 0 : pad;
    max += pad;
  }
  const raw = (max - min) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  const ticks: number[] = [];
  // En pasos enteros y con 12 cifras, contra el ruido del punto flotante (3 × 0,2 = 0,6000…01).
  for (let k = Math.floor(min / step + 1e-9); k <= Math.ceil(max / step - 1e-9); k++) ticks.push(+(k * step).toPrecision(12));
  return ticks;
}

/** La media de los `window` valores anteriores al punto `i` (sin contar los nulos), o `null`. */
export function movingMean(points: readonly TrendPoint[], i: number, window = 3): number | null {
  const prev: number[] = [];
  for (let j = i - 1; j >= 0 && prev.length < window; j--) if (points[j].y !== null) prev.push(points[j].y as number);
  return prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : null;
}

/** Cambio relativo de `from` a `to` (0,11 = subió 11 %), o `null` si no se puede calcular. */
export function change(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from === null || from === undefined || to === null || to === undefined || from === 0) return null;
  return (to - from) / Math.abs(from);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Anomalías por desviación respecto a la media móvil: cada punto se compara con la media de los
 * `window` anteriores; se marca el que se aparta más de `threshold` desviaciones robustas (MAD) del
 * apartamiento típico de la serie (así una serie que crece parejo no se marca entera), y al menos
 * un 5 %.
 */
export function detectAnomalies(s: TrendSeries, threshold = 3, window = 3): TrendFlag[] {
  const res: { i: number; r: number }[] = [];
  s.points.forEach((p, i) => {
    const r = i >= 2 ? change(movingMean(s.points, i, window), p.y) : null;
    if (r !== null) res.push({ i, r });
  });
  if (res.length < 4) return [];
  const mid = median(res.map((x) => x.r));
  const scale = Math.max(0.02, 1.4826 * median(res.map((x) => Math.abs(x.r - mid))));
  return res.filter(({ r }) => Math.abs(r - mid) > threshold * scale && Math.abs(r) >= 0.05).map(({ i, r }) => ({ series: s.id, x: s.points[i].x, delta: r }));
}

/** Las anomalías que se pintan: las dadas (con su apartamiento calculado) y, con `detect`, las
 *  detectadas que no estaban. Solo las de puntos que existen y tienen valor. */
export function flagsOf(series: readonly TrendSeries[], given: readonly TrendAnomaly[], detect = 0): TrendFlag[] {
  const out: TrendFlag[] = [];
  const key = (f: { series: string; x: string }) => `${f.series}\u0000${f.x}`;
  const seen = new Set<string>();
  for (const a of given) {
    const s = series.find((x) => x.id === a.series);
    const i = s ? s.points.findIndex((p) => p.x === a.x) : -1;
    if (!s || i < 0 || s.points[i].y === null || seen.has(key(a))) continue;
    seen.add(key(a));
    const base = movingMean(s.points, i) ?? s.points[i - 1]?.y;
    out.push({ series: a.series, x: a.x, label: a.label, delta: change(base, s.points[i].y) ?? 0 });
  }
  if (detect > 0) for (const s of series) for (const f of detectAnomalies(s, detect)) if (!seen.has(key(f))) seen.add(key(f)), out.push(f);
  return out;
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
const dtf = (locale: string, o: Intl.DateTimeFormatOptions) => {
  const k = locale + JSON.stringify(o);
  let f = fmtCache.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...o, timeZone: "UTC" });
    } catch {
      f = new Intl.DateTimeFormat("es-CO", { ...o, timeZone: "UTC" });
    }
    fmtCache.set(k, f);
  }
  return f;
};

/**
 * Un periodo en palabras, con `Intl`: `short` («ago», «15 ago»), `long` («agosto», «15 de agosto»)
 * o `full` («agosto 2026», «15 ago 2026»).
 */
export function periodLabel(x: string, locale = "es-CO", style: "short" | "long" | "full" = "short"): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(x);
  if (!m) return x;
  const day = !!m[3];
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +(m[3] ?? 1)));
  const o: Intl.DateTimeFormatOptions = {
    day: day ? "numeric" : undefined,
    month: style === "long" || (style === "full" && !day) ? "long" : "short",
    year: style === "full" ? "numeric" : undefined,
  };
  // «agosto de 2026» → «agosto 2026», «1 de sept.» → «1 sept» (la forma corta, sin «de» ni punto).
  const t = dtf(locale, o).format(d).replace(/\.(?=\s|$)/g, "");
  return style === "long" ? t : t.replace(/ de /g, " ");
}

/** «+18 %», «−5,2 %»: con un decimal por debajo de 10 %. */
export function pctText(delta: number, locale = "es-CO", signed = true): string {
  const p = Math.abs(delta) * 100;
  const n = new Intl.NumberFormat(locale, { maximumFractionDigits: p < 10 ? 1 : 0 }).format(p);
  return `${signed ? (delta > 0 ? "+" : delta < 0 ? "−" : "") : ""}${n} %`;
}

const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (m, k) => vars[k] ?? m);

/** Los dos últimos puntos con valor de una serie (índices), o `null`. */
function lastTwo(points: readonly TrendPoint[]): [number, number] | null {
  const idx = points.flatMap((p, i) => (p.y === null ? [] : [i]));
  return idx.length >= 2 ? [idx[idx.length - 2], idx[idx.length - 1]] : null;
}

/** «sube 11 %», «baja 3,2 %», «se mantiene». */
function changeText(d: number | null, labels: TrendLabels, locale: string): string {
  if (d === null || Math.abs(d) < 0.005) return labels.flat;
  return fill(labels.change, { dir: d > 0 ? labels.up : labels.down, pct: pctText(d, locale, false) });
}

/**
 * El resumen que lee el lector de pantalla (y que se ve bajo el gráfico): por serie, cómo cambió
 * del penúltimo al último periodo y dónde está su máximo; después, las anomalías.
 * «Ventas: sube 11 % de julio a agosto; máximo en agosto. Materia prima fuera de lo normal en agosto (+18 % vs. la media).»
 */
export function summarize(series: readonly TrendSeries[], flags: readonly TrendFlag[], labels: TrendLabels, locale = "es-CO"): string {
  const out: string[] = [];
  for (const s of series) {
    const two = lastTwo(s.points);
    const valid = s.points.filter((p) => p.y !== null);
    if (!two || !valid.length) continue;
    const [a, b] = two;
    const max = valid.reduce((m, p) => ((p.y as number) > (m.y as number) ? p : m));
    out.push(
      fill(labels.summary, {
        label: s.label,
        change: changeText(change(s.points[a].y, s.points[b].y), labels, locale),
        from: periodLabel(s.points[a].x, locale, "long"),
        to: periodLabel(s.points[b].x, locale, "long"),
        max: periodLabel(max.x, locale, "long"),
      }),
    );
  }
  for (const f of flags) {
    const s = series.find((x) => x.id === f.series);
    if (s) out.push(fill(labels.outlier, { label: s.label, period: periodLabel(f.x, locale, "long"), delta: pctText(f.delta, locale) }));
  }
  return out.length ? `${out.join(". ")}.` : "";
}

/** La pregunta por defecto: «¿Por qué sube Materia prima en agosto?». */
export function whyQuestion(s: TrendSeries, i: number, labels: TrendLabels, locale = "es-CO"): string {
  const p = s.points[i];
  const prev = s.points.slice(0, i).reverse().find((q) => q.y !== null);
  const d = change(prev?.y, p?.y);
  const vars = { label: s.label, period: periodLabel(p?.x ?? "", locale, "long"), dir: d !== null && d < 0 ? labels.down : labels.up };
  return fill(d === null || Math.abs(d) < 0.005 ? labels.whyFlat : labels.why, vars);
}

/** El `context` que viaja al `explain-endpoint`: la serie, el punto, el anterior y la ventana. */
export function explainContext(s: TrendSeries, i: number, format: TrendFormat, currency: string | undefined, locale = "es-CO", flag?: TrendFlag): TrendContext {
  const p = s.points[i];
  let prev: TrendPoint | undefined;
  for (let j = i - 1; j >= 0 && !prev; j--) if (s.points[j].y !== null) prev = s.points[j];
  return {
    series: { id: s.id, label: s.label, format, currency },
    point: { x: p.x, y: p.y as number, label: periodLabel(p.x, locale, "full") },
    previous: prev ? { x: prev.x, y: prev.y as number } : null,
    window: s.points.slice(Math.max(0, i - 6), i + 3),
    ...(flag ? { anomaly: { label: flag.label, delta: flag.delta } } : {}),
  };
}

/** Qué hace una tecla sobre el eje x: el índice nuevo entre `count`, o `null` si no es suya. */
export function trendStep(key: string, index: number, count: number): number | null {
  if (!count) return null;
  switch (key) {
    case "ArrowRight":
      return Math.min(count - 1, index + 1);
    case "ArrowLeft":
      return Math.max(0, index - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
