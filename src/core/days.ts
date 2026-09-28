/**
 * Días de calendario como enteros: días desde 1970-01-01 en UTC. Así no hay horas ni zonas que
 * muevan una fecha, y sumar días es sumar enteros. Lo usan `<nx-date-range>` y `<nx-recurrence>`.
 */

const MS = 864e5;

/**
 * El día (entero) de una fecha; el mes y el día pueden desbordar (`d = 0` es el último del mes
 * anterior). Con `setUTCFullYear` y no `Date.UTC`, que convierte los años 0–99 en 1900–1999.
 */
export function dayOf(y: number, m: number, d: number): number {
  const t = new Date(0);
  t.setUTCFullYear(y, m - 1, d);
  return Math.round(t.getTime() / MS);
}
/** Año, mes (1–12) y día de un día. */
export function ymd(day: number): [number, number, number] {
  const d = new Date(day * MS);
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}
const pad = (n: number, w = 2) => String(n).padStart(w, "0");
/** El día en ISO («2026-07-01»); `""` fuera de los años 0001–9999, que no se escriben con 4 cifras. */
export function isoOf(day: number): string {
  const [y, m, d] = ymd(day);
  return y >= 1 && y <= 9999 ? `${pad(y, 4)}-${pad(m)}-${pad(d)}` : "";
}
/** Cuántos días tiene el mes. */
export const monthLen = (y: number, m: number): number => ymd(dayOf(y, m + 1, 0))[2];
/** El día si la fecha existe (el 30 de febrero no), o `null`. */
export function validDay(y: number, m: number, d: number): number | null {
  return m >= 1 && m <= 12 && d >= 1 && d <= monthLen(y, m) ? dayOf(y, m, d) : null;
}
/** «2026-07-01» → día; cualquier otra cosa (una fecha que no existe, el año 0000) → `null`. */
export function dayOfISO(v: unknown): number | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim()) : null;
  return m && +m[1] >= 1 ? validDay(+m[1], +m[2], +m[3]) : null;
}
/** Suma meses conservando el día, o el último del mes si no existe (31 mar − 1 mes → 28/29 feb). */
export function addMonths(day: number, n: number): number {
  const [y, m, d] = ymd(day);
  const t = m - 1 + n;
  const ty = y + Math.floor(t / 12);
  const tm = (((t % 12) + 12) % 12) + 1;
  return dayOf(ty, tm, Math.min(d, monthLen(ty, tm)));
}
/** Día de la semana de JS (domingo 0). El 1970-01-01 fue jueves. */
export const jsDay = (day: number): number => (((day + 4) % 7) + 7) % 7;
/** El primer día de su semana; `ws` como en `Intl.Locale#weekInfo` (1 lunes … 7 domingo). */
export const startOfWeek = (day: number, ws = 1): number => day - ((jsDay(day) - (ws % 7) + 7) % 7);

/** «Hoy» para la lógica: `today` si es una fecha válida, o la fecha local. */
export function todayOf(today?: string | null): number {
  const t = dayOfISO(today);
  if (t !== null) return t;
  const n = new Date();
  return dayOf(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

/** Los meses en español (sin tildes, como deja `foldText`), completos o abreviados. Un grupo. */
export const MONTH_RX = "(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)";
/** «marzo», «mar» → 3; «set», «sept» → 9. */
export const monthNum = (w: string): number => (w.startsWith("set") ? 9 : "enefebmarabrmayjunjulagosepoctnovdic".indexOf(w.slice(0, 3)) / 3 + 1);
