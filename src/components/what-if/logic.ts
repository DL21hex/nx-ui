/** Lógica pura del simulador: validar, mover y leer valores, diferencias contra la base, el mejor
 *  escenario por métrica y el trazo del gráfico. Sin DOM. */
import type { NxFormat } from "../../core/locale";
import type { WhatIfBetter, WhatIfEvent, WhatIfFormat, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfPoint, WhatIfScenario, WhatIfSeries, WhatIfSpec, WhatIfTone, WhatIfValues } from "./types";

const FORMATS = new Set<WhatIfFormat>(["number", "money", "percent"]);
const TONES = new Set<WhatIfTone>(["neutral", "success", "warning", "danger"]);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const idOf = (v: unknown) => str(v) ?? (typeof v === "number" ? String(v) : undefined);
/** Un número finito (también escrito en formato de máquina: «4150.5»). */
export const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const spec = (o: Record<string, unknown>): WhatIfSpec => ({ format: FORMATS.has(o.format as WhatIfFormat) ? (o.format as WhatIfFormat) : "number", currency: str(o.currency), unit: str(o.unit) });
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Cuántos decimales tiene un paso (0,01 → 2): a eso se redondea, para no arrastrar 0,30000000004. */
export function decimalsOf(step: number): number {
  const m = /(?:\.(\d+))?(?:e-(\d+))?$/.exec(String(step));
  return Math.min(10, (m?.[1]?.length ?? 0) + Number(m?.[2] ?? 0));
}
const round = (v: number, d: number) => Number(v.toFixed(d));

/** Los supuestos válidos: `id`, `label` y `min` < `max`. La base se recorta al rango; sin `step`,
 *  la centésima parte del rango. */
export function cleanInputs(v: unknown): WhatIfInput[] {
  const out: WhatIfInput[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = obj(x);
    const id = idOf(o?.id);
    const label = str(o?.label);
    const min = num(o?.min);
    const max = num(o?.max);
    if (!o || !id || !label || min === undefined || max === undefined || !(min < max) || out.some((i) => i.id === id)) continue;
    const s = num(o.step);
    const step = s && s > 0 ? s : (max - min) / 100;
    const inp: WhatIfInput = { id, label, value: min, min, max, step, ...spec(o), hint: str(o.hint) };
    inp.value = clampValue(num(o.value) ?? min, inp);
    out.push(inp);
  }
  return out;
}

/** Una métrica (del prop `outputs` o de un evento). Solo `id` es obligatorio aquí: un evento puede
 *  mandar solo el valor de una métrica que ya se conoce. */
export function cleanMetric(v: unknown): WhatIfMetric | null {
  const o = obj(v);
  const id = idOf(o?.id);
  if (!o || !id) return null;
  return { id, label: str(o.label) ?? "", value: num(o.value), base: num(o.base), better: o.better === "up" || o.better === "down" ? o.better : undefined, ...spec(o), format: FORMATS.has(o.format as WhatIfFormat) ? (o.format as WhatIfFormat) : undefined };
}

/** Las métricas del prop `outputs`: con `id` y `label`, sin repetir. */
export function cleanMetrics(v: unknown): WhatIfMetric[] {
  const out: WhatIfMetric[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const m = cleanMetric(x);
    if (m?.label && !out.some((o) => o.id === m.id)) out.push({ ...m, format: m.format ?? "number" });
  }
  return out;
}

/** Junta lo que llegó de una métrica con lo que ya se sabía (lo que no vino, se conserva). */
export function mergeMetric(old: WhatIfMetric | undefined, m: WhatIfMetric): WhatIfMetric {
  const out: WhatIfMetric = { ...(old ?? { id: m.id, label: m.id, format: "number" }) };
  for (const [k, x] of Object.entries(m)) if (x !== undefined && x !== "") (out as unknown as Record<string, unknown>)[k] = x;
  return out;
}

/** Una serie con al menos dos puntos `{x, value, base?}`. */
export function cleanSeries(v: unknown): WhatIfSeries | null {
  const o = obj(v);
  const id = idOf(o?.id);
  if (!o || !id || !Array.isArray(o.points)) return null;
  const points: WhatIfPoint[] = [];
  for (const p of o.points) {
    const q = obj(p);
    const value = num(q?.value);
    if (q && value !== undefined) points.push({ x: idOf(q.x) ?? String(points.length + 1), value, base: num(q.base) });
  }
  return points.length >= 2 ? { id, label: str(o.label) ?? "", points, ...spec(o) } : null;
}

/** `{id: número}`, sin lo que no es un número. */
export function cleanValues(v: unknown): WhatIfValues {
  const out: WhatIfValues = {};
  for (const [k, x] of Object.entries(obj(v) ?? {})) {
    const n = num(x);
    if (n !== undefined) out[k] = n;
  }
  return out;
}

/** Los escenarios guardados: `id` y `name`, sin repetir. */
export function cleanScenarios(v: unknown): WhatIfScenario[] {
  const out: WhatIfScenario[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = obj(x);
    const id = idOf(o?.id);
    const name = str(o?.name);
    if (o && id && name && !out.some((s) => s.id === id)) out.push({ id, name, inputs: cleanValues(o.inputs), outputs: cleanValues(o.outputs) });
  }
  return out;
}

/** Un evento del cálculo, validado (lo que no se entiende se ignora). */
export function cleanEvent(v: unknown): WhatIfEvent | null {
  const o = obj(v);
  if (!o) return null;
  switch (o.type) {
    case "metric": {
      const m = cleanMetric(o);
      return m && { type: "metric", ...m };
    }
    case "series": {
      const s = cleanSeries(o);
      return s && { type: "series", ...s };
    }
    case "note":
    case "error": {
      const message = str(o.message);
      if (!message) return null;
      return o.type === "error" ? { type: "error", message } : { type: "note", message, tone: TONES.has(o.tone as WhatIfTone) ? (o.tone as WhatIfTone) : "neutral" };
    }
    case "done":
      return { type: "done" };
  }
  return null;
}

/** Una línea del stream (ya sin `data:`): JSON → evento. `[DONE]` también termina. */
export function parseEvent(raw: string | null): WhatIfEvent | null {
  if (raw === "[DONE]") return { type: "done" };
  try {
    return raw ? cleanEvent(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function cleanLabels(v: unknown, defaults: WhatIfLabels): WhatIfLabels {
  const out = { ...defaults };
  const o = obj(v);
  if (o) for (const k of Object.keys(defaults) as (keyof WhatIfLabels)[]) if (Object.prototype.hasOwnProperty.call(o, k) && str(o[k])) out[k] = o[k] as string;
  return out;
}

/** «Escenario {n}» → «Escenario 3». Lo que no está en `vars` queda como estaba. */
export const fill = (t: string, vars: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

// ---------------------------------------------------------------- mover valores

/** Recorta al rango y redondea a los decimales del paso. */
export function clampValue(v: number, i: Pick<WhatIfInput, "min" | "max" | "step">): number {
  return round(Math.min(i.max, Math.max(i.min, v)), decimalsOf(i.step));
}

/** Al punto más cercano de la grilla, que parte de la base (`value` ± k·`step`): arrastrando se
 *  vuelve exactamente a la base aunque `min` no esté en la grilla. Los extremos siempre se alcanzan. */
export function snapValue(v: number, i: WhatIfInput): number {
  return clampValue(i.value + Math.round((v - i.value) / i.step) * i.step, i);
}

/**
 * Qué hace una tecla sobre un deslizador: flechas ± `step` (Mayús ×10), RePág/AvPág ± 10 pasos,
 * Inicio/Fin al mínimo/máximo. La grilla parte de la base; desde un valor fuera de ella (escrito a
 * mano), el primer paso lleva al punto siguiente. `null` si la tecla no es del deslizador.
 */
export function stepValue(v: number, i: WhatIfInput, key: string, shift = false): number | null {
  if (key === "Home") return i.min;
  if (key === "End") return i.max;
  const dir = key === "ArrowUp" || key === "ArrowRight" || key === "PageUp" ? 1 : key === "ArrowDown" || key === "ArrowLeft" || key === "PageDown" ? -1 : 0;
  if (!dir) return null;
  const n = (key.startsWith("Page") || shift ? 10 : 1) * dir;
  const k = (v - i.value) / i.step;
  const g = Math.abs(k - Math.round(k)) < 1e-6 ? Math.round(k) : dir > 0 ? Math.floor(k) : Math.ceil(k);
  return clampValue(i.value + (g + n) * i.step, i);
}

// ---------------------------------------------------------------- leer y escribir valores

const pcts = new Map<string, Intl.NumberFormat>();
/** 0,083 → «8,3 %»; con `sign`, «+8,3 %». */
export function pct(n: number, locale: string, sign = false): string {
  const key = `${locale}|${sign}`;
  let f = pcts.get(key);
  if (!f) pcts.set(key, (f = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1, signDisplay: sign ? "exceptZero" : "auto" })));
  return f.format(n).replace(/[  ]/g, " ");
}

/**
 * Cómo se lee un valor: «$ 4.536.000», «22,1 %», «144.000 u.». Con `short`, de un millón para
 * arriba en forma compacta y con tres cifras («$20,1 mil M»). Los montos y números de 100 para arriba, sin decimales.
 */
export function valueText(n: number | undefined, s: WhatIfSpec, f: NxFormat, short = false): string {
  if (n === undefined || !Number.isFinite(n)) return "—";
  const big = short && Math.abs(n) >= 1e6;
  // En compacto, tres cifras significativas: «$7660 M» y no «$7658,1 M».
  const r = big ? Number(n.toPrecision(3)) : Math.abs(n) >= 100 ? Math.round(n) : n;
  const t = s.format === "money" ? f.money(r, s, big) : s.format === "percent" ? pct(n, f.locale) : big ? f.compact(r) : f.number(r);
  return s.unit ? `${t} ${s.unit}` : t;
}

/** El valor para escribirlo a mano: sin símbolo ni unidad, en puntos si es porcentaje («8,5»). */
export function editText(n: number, s: WhatIfSpec, f: NxFormat): string {
  return f.number(s.format === "percent" ? round(n * 100, 4) : n);
}

/**
 * Lo que se escribió en el valor grande → número (o `null`). Entiende el formato del locale
 * («4.536.000» o «4,536,000»), «4,5 M» o «4,5 millones», «120 k» o «120 mil»; en porcentaje, puntos («8» es 8 %).
 */
export function parseTyped(text: string, s: WhatIfSpec, f: NxFormat): number | null {
  const t = text.trim();
  const m = /(k|mil|m|mill[oó]n(?:es)?)\.?\s*$/i.exec(t);
  const mult = m ? (/^(k|mil)$/i.test(m[1]) ? 1e3 : 1e6) : 1;
  const n = f.parse(m ? t.slice(0, m.index) : t);
  return n === null ? null : (n * mult) / (s.format === "percent" ? 100 : 1);
}

/** ¿Mejor, peor o igual que la base, según `better`? (Sin `better`, `flat` o `neutral`.) */
export function toneOf(value: number | undefined, base: number | undefined, better?: WhatIfBetter): "good" | "bad" | "flat" | "neutral" {
  if (value === undefined || base === undefined || Math.abs(value - base) <= 1e-9 * Math.max(1, Math.abs(base))) return "flat";
  if (!better) return "neutral";
  return (value > base) === (better === "up") ? "good" : "bad";
}

/**
 * La diferencia contra la base: en porcentaje, puntos («-2,8 p. p.»); si no, el cambio relativo
 * («+8 %»), y con `abs` también el absoluto («-$4,3 mil M · -21,4 %»). Base en 0: el absoluto.
 */
export function deltaText(value: number, base: number, s: WhatIfSpec, f: NxFormat, points: string, abs = false): string {
  const d = value - base;
  const sign = d > 0 ? "+" : "";
  if (s.format === "percent") return `${sign}${f.number(round(d * 100, 1))} ${points}`;
  const a = `${sign}${valueText(d, s, f, true)}`;
  if (!base) return a;
  const r = pct(d / Math.abs(base), f.locale, true);
  return abs ? `${a} · ${r}` : r;
}

/** Las posiciones con el mejor valor según `better` (todas si empatan). Vacío si no hay con qué
 *  comparar: sin `better`, menos de dos valores, o todos iguales. */
export function bestOf(values: readonly (number | undefined)[], better?: WhatIfBetter): number[] {
  const nums = values.filter((v): v is number => v !== undefined);
  if (!better || nums.length < 2) return [];
  const best = better === "up" ? Math.max(...nums) : Math.min(...nums);
  if (nums.every((v) => v === best)) return [];
  return values.flatMap((v, i) => (v === best ? [i] : []));
}

/** ¿Los mismos valores en esos supuestos? */
export const sameValues = (a: WhatIfValues, b: WhatIfValues, ids: readonly string[]): boolean => ids.every((id) => a[id] === b[id]);

// ---------------------------------------------------------------- gráfico

export interface ChartPaths {
  /** El escenario (línea continua). */
  value: string;
  /** La base (punteada), si los puntos la traen. */
  base: string;
  /** El área entre base y escenario. */
  gap: string;
  lo: number;
  hi: number;
  /** La altura del cero, si el rango lo cruza. */
  zero?: number;
}

/** Los trazos de un gráfico de líneas de `w`×`h` (el margen vertical es `pad`). */
export function chartPaths(points: readonly WhatIfPoint[], w: number, h: number, pad = 6): ChartPaths {
  const all = points.flatMap((p) => (p.base === undefined ? [p.value] : [p.value, p.base]));
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  if (lo === hi) (lo -= 1), (hi += 1);
  const x = (i: number) => round((i * w) / (points.length - 1), 1);
  const y = (v: number) => round(pad + ((hi - v) * (h - 2 * pad)) / (hi - lo), 1);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i)} ${y(v)}`).join("");
  const hasBase = points.every((p) => p.base !== undefined);
  const base = hasBase ? line(points.map((p) => p.base!)) : "";
  const value = line(points.map((p) => p.value));
  const back = hasBase ? [...points].reverse().map((p, i) => `L${x(points.length - 1 - i)} ${y(p.base!)}`).join("") : "";
  return { value, base, gap: hasBase ? `${value}${back}Z` : "", lo, hi, zero: lo < 0 && hi > 0 ? y(0) : undefined };
}
