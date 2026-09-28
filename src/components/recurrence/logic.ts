/**
 * Lógica pura de `<nx-recurrence>`: la RRULE de iCalendar (RFC 5545) de ida y vuelta, el generador
 * de fechas, los festivos de Colombia y la frase canónica («El último viernes de cada mes, a las
 * 5:00 p. m.»). Sin DOM. El intérprete de frases está en `parse.ts` (el elemento lo carga cuando hay
 * algo escrito que entender).
 *
 * Por dentro una fecha es un día entero (días desde 1970-01-01, `core/days`) y una hora son minutos
 * del día: `día * 1440 + minutos`. Así no hay zonas ni horarios de verano que corran una fecha; la
 * `Date` local se arma solo al final.
 */
import { dayOf, dayOfISO, isoOf, jsDay, monthLen, startOfWeek, todayOf, validDay, ymd } from "../../core/days";
import type { RecurrenceFreq, RecurrenceHolidayMode, RecurrenceHolidays, RecurrenceOccurrence, RecurrenceParseOptions, RecurrenceRule, RecurrenceWeekday } from "./types";

const DAY = 1440;
const MS = 864e5;
const MAXD = 2932896; // 9999-12-31
/** Día de la semana con el lunes en 0. */
export const wd = (d: number): number => (jsDay(d) + 6) % 7;
export const uniq = (a: number[]): number[] => [...new Set(a)].sort((x, y) => x - y);
const WD2 = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
export const FREQS: RecurrenceFreq[] = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "HOURLY"];
/** ¿Es un texto de RRULE (y no una frase)? */
export const RRULE_RX = /^\s*(?:DTSTART|RRULE|FREQ=)/i;

// ---------------------------------------------------------------- festivos

/** El domingo de Pascua de un año (algoritmo anónimo gregoriano, Meeus/Jones/Butcher), como día. */
export function easterDay(y: number): number {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const h = (19 * a + b - Math.floor(b / 4) - Math.floor((b - Math.floor((b + 8) / 25) + 1) / 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * Math.floor(c / 4) - h - (c % 4)) % 7;
  const n = h + l - 7 * Math.floor((a + 11 * h + 22 * l) / 451) + 114;
  return dayOf(y, Math.floor(n / 31), (n % 31) + 1);
}

/**
 * Los festivos de Colombia de un año, en ISO y en orden (Ley 51 de 1983, «Emiliani»): los fijos, los
 * que se corren al lunes siguiente y los que dependen de la Pascua (Jueves y Viernes Santo fijos;
 * Ascensión, Corpus Christi y Sagrado Corazón corridos al lunes). Dos que coinciden cuentan una vez.
 */
export function colombiaHolidays(year: number): string[] {
  const e = easterDay(year);
  const monday = (d: number) => d + ((7 - wd(d)) % 7);
  const f = (m: number, d: number) => dayOf(year, m, d);
  const days = [f(1, 1), f(5, 1), f(7, 20), f(8, 7), f(12, 8), f(12, 25), e - 3, e - 2, monday(e + 39), monday(e + 60), monday(e + 68)];
  for (const [m, d] of [[1, 6], [3, 19], [6, 29], [8, 15], [10, 12], [11, 1], [11, 11]]) days.push(monday(f(m, d)));
  return uniq(days).map(isoOf);
}

const daySet = (it: Iterable<string>) => new Set([...it].map(dayOfISO));

/** ¿Es festivo? `undefined` → Colombia; `null` → ninguno; una lista o una función por año. */
function holidayTest(src: RecurrenceHolidays | undefined): (day: number) => boolean {
  if (src === undefined) src = colombiaHolidays;
  if (!src) return () => false;
  const byYear = typeof src === "function" ? src : null;
  const all = byYear ? null : daySet(src as Iterable<string>);
  const cache = new Map<number, Set<number | null>>();
  return (d) => {
    if (all) return all.has(d);
    const y = ymd(d)[0];
    let s = cache.get(y);
    if (!s) cache.set(y, (s = daySet(byYear!(y))));
    return s.has(d);
  };
}

// ---------------------------------------------------------------- reglas

const byDayKey = (a: RecurrenceWeekday, b: RecurrenceWeekday) => a.day - b.day || a.n - b.n;

/** La regla ordenada y con lo que la RRULE deja implícito escrito (el día de la semana de
 *  `WEEKLY`, el día del mes de `MONTHLY`, el día y el mes de `YEARLY`, como en RFC 5545). */
export function fillRule(r: RecurrenceRule): RecurrenceRule {
  const d = dayOfISO(r.start) ?? todayOf();
  const [, m, dd] = ymd(d);
  const out: RecurrenceRule = {
    ...r,
    interval: Math.max(1, Math.floor(r.interval) || 1),
    byDay: r.byDay.filter((b, i, a) => a.findIndex((c) => !byDayKey(b, c)) === i).sort(byDayKey),
    byMonthDay: uniq(r.byMonthDay),
    byMonth: uniq(r.byMonth),
    byHour: uniq(r.byHour),
    byMinute: uniq(r.byMinute),
    bySetPos: uniq(r.bySetPos),
    start: isoOf(d),
  };
  const none = !out.byDay.length && !out.byMonthDay.length;
  if (out.freq === "WEEKLY" && !out.byDay.length) out.byDay = [{ day: wd(d), n: 0 }];
  if ((out.freq === "MONTHLY" || out.freq === "YEARLY") && none) out.byMonthDay = [dd];
  if (out.freq === "YEARLY" && none && !out.byMonth.length) out.byMonth = [m];
  if (out.byHour.length && !out.byMinute.length) out.byMinute = [0];
  return out;
}

const stamp = (iso: string) => iso.replace(/-/g, "");
const p2 = (n: number) => String(n).padStart(2, "0");

/**
 * La regla como iCalendar: `DTSTART:…` y `RRULE:…` en dos líneas. `DTSTART` es hora local flotante;
 * `UNTIL` es el final de ese día. Los festivos van en `X-NX-HOLIDAYS` (una extensión: un lector
 * estándar la ignora y da las fechas sin saltar ni correr festivos).
 */
export function toRRule(rule: RecurrenceRule): string {
  const r = fillRule(rule);
  const parts = [`FREQ=${r.freq}`];
  const add = (k: string, v: unknown) => {
    if (Array.isArray(v) ? v.length : v !== undefined) parts.push(`${k}=${Array.isArray(v) ? v.join(",") : v}`);
  };
  if (r.interval > 1) add("INTERVAL", r.interval);
  add("BYMONTH", r.byMonth);
  add("BYMONTHDAY", r.byMonthDay);
  add("BYDAY", r.byDay.map((b) => (b.n || "") + WD2[b.day]));
  add("BYHOUR", r.byHour);
  add("BYMINUTE", r.byHour.length || r.freq === "HOURLY" ? r.byMinute : []);
  add("BYSETPOS", r.bySetPos);
  add("COUNT", r.count);
  if (r.until) add("UNTIL", `${stamp(r.until)}T235959`);
  parts.push("WKST=MO");
  add("X-NX-HOLIDAYS", r.holidays);
  const t = r.freq === "HOURLY" ? (r.startTime ?? 0) : 0;
  return `DTSTART:${stamp(r.start)}T${p2(Math.floor(t / 60))}${p2(t % 60)}00\nRRULE:${parts.join(";")}`;
}

/** «20260928T070000» (o con `Z`, en UTC) → [día local, minutos]. */
function readStamp(v: string): [number, number | undefined] | null {
  const x = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  let d = x && validDay(+x[1], +x[2], +x[3]);
  if (!x || d === null) return null;
  if (!x[4]) return [d, undefined];
  let m = +x[4] * 60 + +x[5];
  if (x[7]) {
    const t = new Date(Date.UTC(+x[1], +x[2] - 1, +x[3], +x[4], +x[5]));
    d = dayOf(t.getFullYear(), t.getMonth() + 1, t.getDate());
    m = t.getHours() * 60 + t.getMinutes();
  }
  return m < DAY ? [d, m] : null;
}

/**
 * Lee una RRULE: `DTSTART:…` + `RRULE:…`, solo `RRULE:…` o solo `FREQ=…` (`DTSTART` también vale como
 * parte, `DTSTART=…`). `null` si no se entiende o usa algo que el generador no sabe hacer
 * (`BYWEEKNO`, `BYYEARDAY`, `MINUTELY`…). Sin `DTSTART`, hoy.
 */
export function parseRRule(text: string): RecurrenceRule | null {
  const r: RecurrenceRule = { freq: "DAILY", interval: 1, byDay: [], byMonthDay: [], byMonth: [], byHour: [], byMinute: [], bySetPos: [], start: "" };
  let freq = "";
  let time: number | undefined;
  for (const line of String(text).trim().split(/\s*[\r\n]+\s*/)) {
    const [, name, val] = /^(?:(DTSTART|RRULE)[^:]*:)?(.*)$/i.exec(line)!;
    for (const part of /^d/i.test(name ?? "") ? [`DTSTART=${val}`] : val.split(";")) {
      if (!part.trim()) continue;
      const [k, v = ""] = part.toUpperCase().split("=").map((s) => s.trim());
      const nums = (lo: number, hi: number) => {
        const a = v.split(",").map(Number);
        return a.every((n) => Number.isInteger(n) && n >= lo && n <= hi && (lo >= 0 || n)) ? a : null;
      };
      let ok: unknown = true;
      if (k === "FREQ") ok = FREQS.includes((freq = v) as RecurrenceFreq);
      else if (k === "INTERVAL") ok = (r.interval = +v) >= 1 && r.interval < 1e4 && Number.isInteger(r.interval);
      else if (k === "COUNT") ok = (r.count = +v) >= 1 && Number.isInteger(r.count);
      else if (k === "BYMONTH") ok = (r.byMonth = nums(1, 12)!);
      else if (k === "BYMONTHDAY") ok = (r.byMonthDay = nums(-31, 31)!);
      else if (k === "BYHOUR") ok = (r.byHour = nums(0, 23)!);
      else if (k === "BYMINUTE") ok = (r.byMinute = nums(0, 59)!);
      else if (k === "BYSETPOS") ok = (r.bySetPos = nums(-366, 366)!);
      else if (k === "BYDAY")
        ok = v.split(",").every((s) => {
          const x = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(s);
          return x && Math.abs(+(x[1] ?? 0)) < 54 && r.byDay.push({ day: WD2.indexOf(x[2]), n: +(x[1] ?? 0) });
        });
      else if (k === "UNTIL" || k === "DTSTART") {
        const s = readStamp(v);
        if ((ok = s) && k === "UNTIL") r.until = isoOf(s![0]);
        else if (s) (r.start = isoOf(s[0])), (time = s[1]);
      } else if (k === "X-NX-HOLIDAYS") r.holidays = /^(SKIP|BEFORE|AFTER)$/.test(v) ? (v.toLowerCase() as RecurrenceHolidayMode) : undefined;
      else ok = k === "WKST" || k.startsWith("X-");
      if (!ok) return null;
    }
  }
  if (!freq) return null;
  r.freq = freq as RecurrenceFreq;
  if (freq === "HOURLY") r.startTime = time;
  else if (time !== undefined && (time || r.byMinute.length) && !r.byHour.length) r.byHour = [Math.floor(time / 60)];
  if (r.byHour.length && !r.byMinute.length) r.byMinute = [(time ?? 0) % 60];
  return fillRule(r);
}

// ---------------------------------------------------------------- generador

/**
 * Las próximas `n` fechas de la regla desde `from` (incluido; por defecto, ahora). Recorre período
 * por período (año, mes, semana, día u hora) desde `DTSTART`, con tope: una regla imposible («el 31
 * de febrero») termina sin fechas en vez de colgarse. `holidays`: por defecto los de Colombia.
 */
export function occurrences(rule: RecurrenceRule | string, from: Date | string | number = new Date(), n = 5, holidays?: RecurrenceHolidays): RecurrenceOccurrence[] {
  const src = typeof rule === "string" ? parseRRule(rule) : rule;
  if (!src || !(n > 0) || dayOfISO(src.start) === null) return [];
  const r = fillRule(src);
  const want = Math.min(Math.floor(n), 1e5);
  const isHol = holidayTest(holidays);
  const F = r.freq;
  const I = r.interval;
  const d0 = dayOfISO(r.start)!;
  const [y0, m0] = ymd(d0);
  const st = F === "HOURLY" ? (r.startTime ?? 0) : 0;
  const startT = d0 * DAY + st;
  const untilT = r.until ? (dayOfISO(r.until) ?? -Infinity) * DAY + DAY - 1 : Infinity;
  const allDay = F !== "HOURLY" && !r.byHour.length;
  const times = allDay ? [0] : uniq(r.byHour.flatMap((h) => r.byMinute.map((m) => h * 60 + m)));
  const skip = r.holidays === "skip";
  const move = r.holidays === "before" ? -1 : r.holidays === "after" ? 1 : 0;
  let fromT: number;
  if (typeof from === "string" && dayOfISO(from) !== null) fromT = dayOfISO(from)! * DAY;
  else {
    const f = new Date(from);
    if (isNaN(+f)) return [];
    fromT = dayOf(f.getFullYear(), f.getMonth() + 1, f.getDate()) * DAY + f.getHours() * 60 + f.getMinutes() + (f.getSeconds() || f.getMilliseconds() ? 1 : 0);
  }

  const okDay = (d: number, weekly?: boolean) => {
    const [y, m, dd] = ymd(d);
    if (r.byMonth.length && !r.byMonth.includes(m)) return false;
    if (weekly) return true;
    if (r.byMonthDay.length && !r.byMonthDay.some((v) => v === dd || v === dd - monthLen(y, m) - 1)) return false;
    return !r.byDay.length || r.byDay.some((b) => b.day === wd(d));
  };
  /** Los días de `byDay` en [a, a + len): todos, o el n-ésimo (negativo desde el final). */
  const expand = (a: number, len: number) => {
    const out: number[] = [];
    for (const b of r.byDay) {
      const first = a + ((b.day - wd(a) + 7) % 7);
      const cnt = Math.max(0, Math.ceil((a + len - first) / 7));
      const k = b.n > 0 ? b.n - 1 : cnt + b.n;
      if (!b.n) for (let j = 0; j < cnt; j++) out.push(first + 7 * j);
      else if (k >= 0 && k < cnt) out.push(first + 7 * k);
    }
    return out;
  };
  const monthDays = (y: number, m: number) => {
    const L = monthLen(y, m);
    const a = dayOf(y, m, 1);
    if (!r.byMonthDay.length) return expand(a, L);
    const out = r.byMonthDay.map((v) => (v > 0 ? v : L + v + 1)).filter((v) => v >= 1 && v <= L).map((v) => a + v - 1);
    // Con los dos, `BYDAY` limita: «el día 13 si es viernes».
    return r.byDay.length ? out.filter((d) => r.byDay.some((b) => b.day === wd(d))) : out;
  };
  /** Los días del período k (en unidades de la frecuencia), o `null` pasado el año 9999. */
  const periodDays = (k: number): number[] | null => {
    if (F === "YEARLY") {
      const y = y0 + k;
      if (y > 9999) return null;
      if (r.byMonth.length || r.byMonthDay.length) return (r.byMonth.length ? r.byMonth : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).flatMap((m) => monthDays(y, m));
      return expand(dayOf(y, 1, 1), dayOf(y + 1, 1, 1) - dayOf(y, 1, 1));
    }
    if (F === "MONTHLY") {
      const t = m0 - 1 + k;
      const y = y0 + Math.floor(t / 12);
      const m = (t % 12) + 1;
      return y > 9999 ? null : !r.byMonth.length || r.byMonth.includes(m) ? monthDays(y, m) : [];
    }
    if (F === "WEEKLY") {
      const w = startOfWeek(d0) + 7 * k;
      return w > MAXD ? null : r.byDay.map((b) => w + b.day).filter((d) => okDay(d, true));
    }
    return d0 + k > MAXD ? null : okDay(d0 + k) ? [d0 + k] : [];
  };
  const candidates = (k: number): number[] | null => {
    let ts: number[];
    if (F === "HOURLY") {
      const h = d0 * DAY + Math.floor(st / 60) * 60 + k * 60;
      const d = Math.floor(h / DAY);
      if (d > MAXD) return null;
      ts = okDay(d) && (!r.byHour.length || r.byHour.includes((h - d * DAY) / 60)) && !(skip && isHol(d)) ? (r.byMinute.length ? r.byMinute : [st % 60]).map((m) => h + m) : [];
    } else {
      const ds = periodDays(k);
      if (!ds) return null;
      ts = uniq(ds)
        .filter((d) => !(skip && isHol(d)))
        .flatMap((d) => times.map((t) => d * DAY + t));
    }
    // `BYSETPOS` elige dentro del período, después de quitar los festivos que se saltan.
    if (r.bySetPos.length) ts = uniq(r.bySetPos.map((p) => ts[p > 0 ? p - 1 : ts.length + p]).filter((v) => v !== undefined));
    return ts;
  };

  const unit = F === "HOURLY" ? 60 : F === "DAILY" ? DAY : F === "WEEKLY" ? 7 * DAY : F === "MONTHLY" ? 30.44 * DAY : 365.25 * DAY;
  const shift = move ? 40 * DAY : 0;
  // Sin COUNT no hace falta contar desde el principio: salta cerca de `from`.
  let k = r.count ? 0 : Math.max(0, Math.floor((fromT - shift - startT) / unit / I) - 1) * I;
  const gap = (F === "HOURLY" ? 3660 : 146100) * DAY;
  const out: [number, number?][] = [];
  let seen = 0;
  let last = Math.max(startT, fromT);
  loop: for (let it = 0; it < 5e5; it++, k += I) {
    const ts = candidates(k);
    if (!ts) break;
    for (const t of ts) {
      if (t < startT) continue;
      if (t > untilT || (r.count && ++seen > r.count) || (out.length >= want && t > out[want - 1][0] + shift)) break loop;
      last = t;
      const d = Math.floor(t / DAY);
      let e = t;
      let moved: number | undefined;
      if (move && isHol(d)) {
        let x = d + move;
        for (let j = 0; (isHol(x) || wd(x) > 4) && j < 40; j++) x += move;
        e = t + (x - d) * DAY;
        moved = d;
      }
      if (e < fromT) continue;
      let i = out.length;
      while (i && out[i - 1][0] > e) i--;
      if (!i || out[i - 1][0] !== e) out.splice(i, 0, moved === undefined ? [e] : [e, moved]);
    }
    // Años sin una sola fecha: la regla no ocurre (o ya no ocurre más).
    if (startT + k * unit - last > gap) break;
  }
  return out.slice(0, want).map(([e, mv]) => {
    const d = Math.floor(e / DAY);
    const t = e - d * DAY;
    const [y, m, dd] = ymd(d);
    const date = new Date(2000, 0, 1);
    date.setFullYear(y, m - 1, dd);
    date.setHours(Math.floor(t / 60), t % 60, 0, 0);
    return { date, day: isoOf(d), time: allDay ? null : t, ...(mv !== undefined && { movedFrom: isoOf(mv) }) };
  });
}

/** Las próximas `n` fechas como `Date` (ver `occurrences`). */
export const nextOccurrences = (rule: RecurrenceRule | string, from?: Date | string | number, n?: number, holidays?: RecurrenceHolidays): Date[] => occurrences(rule, from, n, holidays).map((o) => o.date);

// ---------------------------------------------------------------- frase canónica

const fmts = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = locale + JSON.stringify(o);
  let f = fmts.get(k);
  if (!f) {
    try {
      f = new Intl.DateTimeFormat(locale, { ...o, timeZone: "UTC" });
    } catch {
      f = new Intl.DateTimeFormat("es-CO", { ...o, timeZone: "UTC" });
    }
    fmts.set(k, f);
  }
  return f;
}
/** «5:00 p. m.» / «5:00 PM». */
export const formatClock = (t: number, locale: string): string => dtf(locale, { hour: "numeric", minute: "2-digit" }).format(t * 6e4);
/** El nombre del día (0 lunes): «lunes» / «Monday». */
export const weekdayName = (d: number, locale: string, o: Intl.DateTimeFormatOptions = { weekday: "long" }): string => dtf(locale, o).format(dayOf(2024, 1, 1 + d) * MS);

/** «30 oct 2026», «vie 30 oct» / «Fri, Oct 30»: la forma corta, sin los «de» ni las comas del español. */
export function shortDate(day: number, locale: string, weekday: boolean, year: boolean): string {
  const f = dtf(locale, { weekday: weekday ? "short" : undefined, day: "numeric", month: "short", year: year ? "numeric" : undefined });
  const es = /^(es|pt)/.test(f.resolvedOptions().locale);
  return f
    .formatToParts(day * MS)
    .map((p) => (p.type === "literal" ? p.value.replace(/\s*\bde\b\s*/g, " ").replace(es ? /,/g : /^$/, "") : p.value.replace(/\.$/, "")))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** Una regla que es «cada N horas de A a B»: `[N, A, B]` (en minutos), o `null`. */
export function hourlyForm(r: RecurrenceRule): [number, number, number] | null {
  const h = r.byHour;
  const step = h.length > 2 && r.byMinute.length === 1 ? h[1] - h[0] : 0;
  const ok = step && h.every((v, k) => !k || v - h[k - 1] === step) && (r.freq === "DAILY" || r.freq === "WEEKLY") && r.interval === 1 && !r.bySetPos.length && !r.byMonth.length && !r.byMonthDay.length && (r.freq === "WEEKLY" || !r.byDay.length);
  return ok ? [step, h[0] * 60 + r.byMinute[0], h[h.length - 1] * 60 + r.byMinute[0]] : null;
}

/**
 * La frase canónica de una regla, que el intérprete vuelve a leer igual: «El último viernes de cada
 * mes, a las 5:00 p. m.». En español, o en inglés con un locale `en…`.
 */
export function describeRecurrence(rule: RecurrenceRule, opts: RecurrenceParseOptions = {}): string {
  const lc = opts.locale ?? "";
  const en = /^en\b/i.test(lc);
  const loc = en || /^es\b/i.test(lc) ? lc : "es-CO";
  const r = fillRule(rule);
  const I = r.interval;
  const plain = r.byDay.filter((b) => !b.n).map((b) => b.day);
  const skip = r.holidays === "skip";
  const dk = plain.join();
  const name = (d: number, pl?: boolean) => weekdayName(d, loc) + (pl && !en && /o$/.test(weekdayName(d, loc)) ? "s" : "");
  const month = (m: number) => dtf(loc, { month: "long" }).format(dayOf(2024, m, 1) * MS);
  const list = (a: string[], c = en ? " and " : " y ") => (a.length > 1 ? `${a.slice(0, -1).join(", ")}${c}${a[a.length - 1]}` : (a[0] ?? ""));
  const ord = (n: number) => (en ? "first second third fourth fifth" : "primer segundo tercer cuarto quinto").split(" ")[n - 1] ?? (n === -1 ? (en ? "last" : "último") : n === -2 ? (en ? "penultimate" : "penúltimo") : String(n));
  const clock = (t: number) => formatClock(t, loc);
  const date = (iso: string) => shortDate(dayOfISO(iso)!, loc, false, true);
  const every = (n: number, one: string, many: string) => `${en ? "every" : "cada"} ${n > 1 ? `${n} ${many}` : one}`;
  const range = dk === "0,1,2,3,4" ? (en ? "Monday to Friday" : "de lunes a viernes") : dk === "0,1,2,3,4,5,6" ? (en ? "Monday to Sunday" : "de lunes a domingo") : "";
  const onDays = (lead: string) => range || `${lead} ${list(plain.map((d) => name(d, true)))}`;
  const hf = hourlyForm(r);
  const parts: string[] = [];
  const the = en ? "the" : "el";

  if (hf) {
    if (r.freq === "WEEKLY" && dk !== "0,1,2,3,4,5,6") parts.push(onDays(en ? "every" : "los"));
    parts.push(every(hf[0], en ? "hour" : "hora", en ? "hours" : "horas"), `${en ? "from" : "de"} ${clock(hf[1])} ${en ? "to" : "a"} ${clock(hf[2])}`);
  } else if (r.freq === "HOURLY") {
    parts.push(every(I, en ? "hour" : "hora", en ? "hours" : "horas"));
    if (plain.length) parts.push(onDays(en ? "on" : "los"));
  } else if (r.freq === "DAILY") {
    parts.push(I > 1 ? every(I, "", en ? "days" : "días") : en ? "every day" : "todos los días");
    if (plain.length) parts.push(onDays(en ? "on" : "los"));
  } else if (r.freq === "WEEKLY") {
    if (I > 1) parts.push(every(I, "", en ? "weeks" : "semanas"));
    parts.push(onDays(en ? (I > 1 ? "on" : "every") : "los"));
  } else {
    const sel: string[] = [];
    if (r.bySetPos.length) {
      const base =
        dk === "0,1,2,3,4"
          ? en
            ? skip
              ? "business day"
              : "weekday"
            : skip
              ? "día hábil"
              : "día entre semana"
          : plain.length === 1
            ? en
              ? (skip ? "business " : "") + name(plain[0])
              : name(plain[0]) + (skip ? " hábil" : "")
            : list(plain.map((d) => name(d)), en ? " or " : " o ");
      sel.push(`${the} ${list(r.bySetPos.map(ord))} ${base}`);
    } else {
      for (const d of uniq(r.byDay.filter((b) => b.n).map((b) => b.day))) sel.push(`${the} ${list(r.byDay.filter((b) => b.n && b.day === d).map((b) => ord(b.n)))} ${name(d)}`);
      if (plain.length) sel.push(onDays(en ? "every" : "los"));
    }
    const pd = r.byMonthDay.filter((v) => v > 0);
    const dates = pd.length && !r.byDay.length && !r.bySetPos.length && r.freq === "YEARLY" && pd.length === r.byMonthDay.length;
    if (pd.length && !dates) sel.push(en ? `on day${pd.length > 1 ? "s" : ""} ${list(pd.map(String))}` : pd.length > 1 ? `los días ${list(pd.map(String))}` : `el día ${pd[0]}`);
    for (const v of r.byMonthDay.filter((v) => v < 0)) sel.push(`${the} ${ord(v)} ${en ? "day" : "día"}`);
    const S = list(sel);
    const M = list(r.byMonth.map(month));
    if (r.freq === "MONTHLY") {
      if (I > 1) parts.push(every(I, "", en ? "months" : "meses"), S);
      else parts.push(`${S} ${en ? "of every month" : "de cada mes"}`);
      if (M) parts.push(`${en ? "in" : "en"} ${M}`);
    } else {
      parts.push(
        every(I, en ? "year" : "año", en ? "years" : "años"),
        dates ? (en ? (pd.length === 1 && r.byMonth.length === 1 ? `on ${M} ${pd[0]}` : `on day${pd.length > 1 ? "s" : ""} ${list(pd.map(String))} of ${M}`) : `el ${list(pd.map(String))} de ${M}`) : M ? `${S} ${en ? "of" : "de"} ${M}` : S,
      );
    }
  }
  if (r.byHour.length && !hf && r.freq !== "HOURLY") {
    const ts = list(uniq(r.byHour.flatMap((h) => r.byMinute.map((m) => h * 60 + m))).map(clock));
    parts.push(en ? `at ${ts}` : `${/^1:/.test(ts) ? "a la" : "a las"} ${ts}`);
  }
  if (r.start !== isoOf(todayOf(opts.start))) parts.push(`${en ? "starting" : "desde el"} ${date(r.start)}`);
  if (r.until) parts.push(`${en ? "until" : "hasta el"} ${date(r.until)}`);
  if (r.count) parts.push(`${r.count} ${en ? (r.count > 1 ? "times" : "time") : r.count > 1 ? "veces" : "vez"}`);
  const h = r.holidays;
  if (h && !(skip && r.bySetPos.length)) parts.push(h === "skip" ? (en ? "except holidays" : "menos en festivos") : `${en ? "if it falls on a holiday, the" : "si cae festivo, el día hábil"} ${h === "before" ? (en ? "previous" : "anterior") : en ? "next" : "siguiente"}${en ? " business day" : ""}`);
  const s = parts.join(", ");
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}${s.endsWith(".") ? "" : "."}`;
}
