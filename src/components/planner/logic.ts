/**
 * Lógica pura de `<nx-planner>`: fechas locales, columnas por vista, posición en la línea de tiempo,
 * ajuste a la rejilla, carriles, choques y ocupación. Sin DOM.
 *
 * Por dentro un instante es un número (ms, como `Date`); todo se calcula en la hora local de quien
 * mira con la aritmética de calendario de `Date` (sumar días es `setDate`), así un cambio de horario
 * de verano no corre una columna.
 */
import type { PlannerBooking, PlannerResource, PlannerStatus, PlannerView } from "./types";

export const DAY_MS = 864e5;
const MIN = 6e4;

/** Un tramo de la línea de tiempo: `[start, end)`. */
export interface Span {
  start: number;
  end: number;
}
/** Una columna: su tramo visible y el día (medianoche local) al que pertenece. */
export interface PlannerColumn extends Span {
  day: number;
}

// ---------------------------------------------------------------- fechas

/**
 * Un ISO a ms. Con zona («Z», «-05:00») es ese instante; sin zona («2026-10-06T07:30», «2026-10-06»)
 * es hora local. Cualquier otra cosa → `null`.
 */
export function plannerParse(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i.exec(v.trim());
  if (!m) return null;
  const [y, mo, d, hh = "0", mm = "0", ss = "0"] = m.slice(1).map((x) => x ?? undefined) as string[];
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31 || +mm > 59 || +ss > 59 || +hh > 24 || (+hh === 24 && +mm + +ss > 0)) return null;
  if (m[7]) {
    const t = Date.parse(v.trim().replace(" ", "T"));
    return Number.isNaN(t) ? null : t;
  }
  const t = new Date(+y, +mo - 1, +d, +hh, +mm, +ss);
  t.setFullYear(+y);
  return t.getMonth() === +mo - 1 || +hh === 24 ? t.getTime() : null;
}

const p2 = (n: number) => String(n).padStart(2, "0");
/** ms → ISO local con su desfase: «2026-10-06T07:30:00-05:00». */
export function plannerISO(t: number): string {
  const d = new Date(t);
  const o = -d.getTimezoneOffset();
  const off = `${o < 0 ? "-" : "+"}${p2(Math.floor(Math.abs(o) / 60))}:${p2(Math.abs(o) % 60)}`;
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${off}`;
}
/** ms → «2026-10-06» (día local). */
export const plannerDate = (t: number): string => {
  const d = new Date(t);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
/** Medianoche local del día de `t`. */
export const dayStart = (t: number): number => new Date(t).setHours(0, 0, 0, 0);
/** `t` más `n` días de calendario (misma hora local). */
export function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}
/** Minutos desde la medianoche local. */
const minuteOf = (t: number) => {
  const d = new Date(t);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60 + d.getMilliseconds() / MIN;
};
/** La hora local `min` minutos después de la medianoche del día de `t`. */
const atMinute = (t: number, min: number) => new Date(t).setHours(0, min, 0, 0);

/** «07:00-18:00» → `[420, 1080]` (minutos), o `null` si no se entiende o está al revés. */
export function plannerHours(v: unknown): [number, number] | null {
  const m = typeof v === "string" ? /^\s*(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*$/.exec(v) : null;
  if (!m) return null;
  const a = +m[1] * 60 + +m[2];
  const b = +m[3] * 60 + +m[4];
  return +m[2] < 60 && +m[4] < 60 && a < b && b <= 1440 ? [a, b] : null;
}

// ---------------------------------------------------------------- rango y columnas

/**
 * El período que contiene `t`: el día, la semana (desde `weekStart`: 1 lunes … 7 domingo) o el mes.
 * `to` es exclusivo (la medianoche siguiente).
 */
export function plannerRange(view: PlannerView, t: number, weekStart = 1): Span {
  const d = new Date(dayStart(t));
  if (view === "month") {
    d.setDate(1);
    const start = d.getTime();
    d.setMonth(d.getMonth() + 1);
    return { start, end: d.getTime() };
  }
  if (view === "week") {
    const start = addDays(d.getTime(), -((d.getDay() - (weekStart % 7) + 7) % 7));
    return { start, end: addDays(start, 7) };
  }
  return { start: d.getTime(), end: addDays(d.getTime(), 1) };
}

/** Un período más o menos (`n` = ±1): días, semanas o meses de calendario. */
export function plannerStep(view: PlannerView, t: number, n: number): number {
  if (view !== "month") return addDays(t, view === "week" ? 7 * n : n);
  const d = new Date(t);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d.getTime();
}

/**
 * Las columnas del período. `day`: franjas de `slot` minutos del día entero. `week`/`month`: un día
 * por columna, que con `hours` muestra solo el horario laboral («horas resumidas»).
 */
export function plannerColumns(view: PlannerView, t: number, opts: { hours?: [number, number] | null; slot?: number; weekStart?: number } = {}): PlannerColumn[] {
  const r = plannerRange(view, t, opts.weekStart);
  const out: PlannerColumn[] = [];
  if (view === "day") {
    const slot = Math.max(5, Math.min(240, opts.slot || 60));
    for (let m = 0; m < 1440; m += slot) out.push({ start: atMinute(r.start, m), end: atMinute(r.start, Math.min(1440, m + slot)), day: r.start });
    return out;
  }
  const [a, b] = opts.hours ?? [0, 1440];
  for (let d = r.start, i = 0; d < r.end && i < 42; d = addDays(d, 1), i++) out.push({ start: atMinute(d, a), end: atMinute(d, b), day: d });
  return out;
}

/** Índice de la última columna que empieza en o antes de `t` (−1 si ninguna). Búsqueda binaria. */
function colAt(cols: readonly Span[], t: number): number {
  let lo = 0;
  let hi = cols.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cols[mid].start <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/**
 * Posición en px de un instante (columnas de `w` px). Lo que cae fuera del horario visible se pega
 * al borde de su columna; antes del período, 0; después, el final.
 */
export function plannerX(cols: readonly Span[], t: number, w: number): number {
  const i = colAt(cols, t);
  if (i < 0) return 0;
  const c = cols[i];
  return (i + Math.min(1, (t - c.start) / Math.max(1, c.end - c.start))) * w;
}

/** El instante en una posición en px (lo inverso de `plannerX`). */
export function plannerTime(cols: readonly Span[], x: number, w: number): number {
  if (!cols.length) return 0;
  const i = Math.max(0, Math.min(cols.length - 1, Math.floor(x / w)));
  const c = cols[i];
  const f = Math.max(0, Math.min(1, x / w - i));
  return c.start + f * (c.end - c.start);
}

// ---------------------------------------------------------------- rejilla

export type SnapMode = "round" | "floor" | "ceil";

/**
 * Ajusta `t` a la rejilla de `snap` minutos, contada desde la medianoche local (así 7:30 cae en 7:30
 * aunque el día tenga 23 horas). Con `hours`, además, queda dentro del horario de ese día. Con
 * `snap` ≥ 1440, a la medianoche más cercana (o anterior / siguiente).
 */
export function plannerSnap(t: number, snap: number, mode: SnapMode = "round", hours?: [number, number] | null): number {
  const s = Math.max(1, snap || 15);
  if (s >= 1440) {
    const a = dayStart(t);
    if (mode === "floor" || t === a) return a;
    const b = addDays(a, 1);
    return mode === "ceil" || t - a >= (b - a) / 2 ? b : a;
  }
  const q = minuteOf(t) / s;
  let r = (mode === "floor" ? Math.floor(q + 1e-9) : mode === "ceil" ? Math.ceil(q - 1e-9) : Math.round(q)) * s;
  if (hours) r = Math.max(hours[0], Math.min(hours[1], r));
  return atMinute(t, r);
}

/** La duración mínima de una reserva: una franja (o un día). */
const minLen = (start: number, snap: number) => (snap >= 1440 ? addDays(start, 1) : start + Math.max(1, snap) * MIN);

/**
 * Mover: la reserva empieza en `raw` ajustado a la rejilla y conserva su duración. Con `snap` de un
 * día se corre de a días enteros, conservando la hora.
 */
export function plannerMove(b: Span, raw: number, snap: number, hours?: [number, number] | null): Span {
  let start: number;
  if (snap >= 1440) start = addDays(b.start, Math.round((raw - b.start) / DAY_MS));
  else start = plannerSnap(raw, snap, "round", hours);
  return { start, end: start + (b.end - b.start) };
}

/** Cambiar la duración por un borde; nunca menos de una franja. */
export function plannerResize(b: Span, edge: "start" | "end", raw: number, snap: number, hours?: [number, number] | null): Span {
  const t = plannerSnap(raw, snap, "round", hours);
  if (edge === "end") return { start: b.start, end: Math.max(t, minLen(b.start, snap)) };
  const lim = snap >= 1440 ? addDays(b.end, -1) : b.end - Math.max(1, snap) * MIN;
  return { start: Math.min(t, lim), end: b.end };
}

/** Crear arrastrando de `a` a `b` (en cualquier sentido): de la franja de uno a la del otro. */
export function plannerSpan(a: number, b: number, snap: number, hours?: [number, number] | null): Span {
  const start = plannerSnap(Math.min(a, b), snap, "floor", hours);
  const end = plannerSnap(Math.max(a, b), snap, "ceil", hours);
  return { start, end: Math.max(end, minLen(start, snap)) };
}

// ---------------------------------------------------------------- carriles y choques

/**
 * Carriles para las reservas de un recurso: cada una en el primer carril libre, en orden de inicio.
 * Devuelve el carril de cada una (en el orden recibido) y cuántos hay. O(n log n + n·carriles).
 */
export function plannerLanes(items: readonly Span[]): { lanes: number[]; count: number } {
  const order = items.map((_, i) => i).sort((a, b) => items[a].start - items[b].start || items[b].end - items[a].end);
  const ends: number[] = [];
  const lanes = new Array<number>(items.length);
  for (const i of order) {
    let l = 0;
    while (l < ends.length && ends[l] > items[i].start) l++;
    ends[l] = items[i].end;
    lanes[i] = l;
  }
  return { lanes, count: ends.length };
}

/**
 * Qué reservas están en choque: en algún momento hay más a la vez que `capacity`. Un bloqueo
 * (mantenimiento) ocupa el recurso entero. Barrido por inicios y finales: O(n log n + choques).
 * @returns los índices en choque y el mayor número de reservas a la vez.
 */
export function plannerClashes(items: readonly (Span & { status?: PlannerStatus })[], capacity = 1): { clash: Set<number>; peak: number } {
  const cap = Math.max(1, capacity);
  const ev: [number, number, number][] = [];
  items.forEach((b, i) => {
    if (b.end > b.start) ev.push([b.start, 1, i], [b.end, -1, i]);
  });
  // A la misma hora, primero lo que termina: 9:00–10:00 no choca con 8:00–9:00.
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const on = new Set<number>();
  const clash = new Set<number>();
  let load = 0;
  let peak = 0;
  for (const [, k, i] of ev) {
    const w = items[i].status === "block" ? cap : 1;
    if (k < 0) {
      on.delete(i);
      load -= w;
      continue;
    }
    on.add(i);
    load += w;
    peak = Math.max(peak, on.size);
    if (load > cap) for (const j of on) clash.add(j);
  }
  return { clash, peak };
}

/**
 * Ocupación por columna: cuántos recursos tienen algo (una reserva o un bloqueo) en cada una.
 * `byResource`: las reservas de cada recurso. O(reservas · columnas que cubre).
 */
export function plannerOccupancy(byResource: Iterable<readonly Span[]>, cols: readonly Span[]): number[] {
  const n = new Array<number>(cols.length).fill(0);
  const mark = new Array<number>(cols.length).fill(-1);
  let r = 0;
  for (const list of byResource) {
    for (const b of list) {
      let i = Math.max(0, colAt(cols, b.start));
      for (; i < cols.length && cols[i].start < b.end; i++) {
        if (cols[i].end > b.start && mark[i] !== r) {
          mark[i] = r;
          n[i]++;
        }
      }
    }
    r++;
  }
  return n;
}

// ---------------------------------------------------------------- datos

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const idOf = (v: unknown): string | undefined => str(v) ?? (typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const STATUS = new Set<PlannerStatus>(["confirmed", "tentative", "active", "block"]);
/** Un color de CSS inofensivo (sin `url()` ni `;`): hex, un nombre o una función de color. */
export const safeColor = (v: unknown): string | undefined =>
  typeof v === "string" && /^(#[\da-f]{3,8}|[a-z]{3,20}|(?:rgba?|hsla?|oklch|oklab|lab|lch)\([\d\s.,%/-]+\))$/i.test(v.trim()) ? v.trim() : undefined;

/** Los recursos válidos (con `id` y `name`); un `id` repetido se descarta. */
export function cleanResources(v: unknown): PlannerResource[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: PlannerResource[] = [];
  for (const o of v as Record<string, unknown>[]) {
    const id = idOf(o?.id);
    const name = str(o?.name);
    if (!id || !name || seen.has(id)) continue;
    seen.add(id);
    const cap = Number(o.capacity);
    out.push({ id, name, detail: str(o.detail), avatar: str(o.avatar), icon: str(o.icon), group: str(o.group), capacity: Number.isFinite(cap) && cap >= 1 ? Math.floor(cap) : undefined });
  }
  return out;
}

/** Una reserva ya leída: la original (lo que vuelve en los eventos) y su tramo en ms. */
export interface PlannerItem extends Span {
  b: PlannerBooking;
}

/** Las reservas válidas (con `id`, `resource`, `title` y un tramo que se entiende, `end > start`). */
export function cleanBookings(v: unknown): PlannerItem[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: PlannerItem[] = [];
  for (const o of v as Record<string, unknown>[]) {
    const id = idOf(o?.id);
    const resource = idOf(o?.resource);
    const title = str(o?.title);
    const start = plannerParse(o?.start);
    const end = plannerParse(o?.end);
    if (!id || !resource || !title || start === null || end === null || end <= start || seen.has(id)) continue;
    seen.add(id);
    const b: PlannerBooking = { ...(o as object), id, resource, title, start: o.start as string, end: o.end as string } as PlannerBooking;
    b.status = STATUS.has(o.status as PlannerStatus) ? (o.status as PlannerStatus) : undefined;
    b.detail = str(o.detail);
    b.color = safeColor(o.color);
    b.readonly = o.readonly === true || undefined;
    out.push({ b, start, end });
  }
  return out;
}

/** Fechas «YYYY-MM-DD» (festivos). */
export const cleanDates = (v: unknown): string[] => (Array.isArray(v) ? v.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : []);

/** Días laborables (0 o 7 domingo … 6 sábado) → conjunto de `getDay()`. */
export const cleanWorkdays = (v: unknown): Set<number> =>
  new Set(Array.isArray(v) ? v.filter((d) => Number.isInteger(d) && d >= 0 && d <= 7).map((d) => (d as number) % 7) : [1, 2, 3, 4, 5]);

/** Reemplaza `{clave}` en un texto de `labels`. */
export function fill(text: string, vars: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}
