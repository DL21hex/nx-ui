/**
 * Lógica pura del rango de fechas: días de calendario, frases en español («Q3 2025», «de marzo a
 * junio», «últimos 30 días»), comparación y formato con `Intl`. Sin DOM.
 *
 * Por dentro un día es un entero: días desde 1970-01-01 en UTC. Así no hay horas ni zonas que
 * muevan una fecha, y sumar días es sumar enteros. Hacia afuera, siempre texto ISO.
 */
import { foldText } from "../../core/text";
import type { DateRange, DateRangeCompare, DateRangePreset } from "./types";

const MS = 864e5;
type Span = [number, number];

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
const monthLen = (y: number, m: number) => ymd(dayOf(y, m + 1, 0))[2];
/** El día si la fecha existe (el 30 de febrero no), o `null`. */
function valid(y: number, m: number, d: number): number | null {
  return m >= 1 && m <= 12 && d >= 1 && d <= monthLen(y, m) ? dayOf(y, m, d) : null;
}
/** «2026-07-01» → día; cualquier otra cosa (una fecha que no existe, el año 0000) → `null`. */
export function dayOfISO(v: unknown): number | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim()) : null;
  return m && +m[1] >= 1 ? valid(+m[1], +m[2], +m[3]) : null;
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
const jsDay = (day: number) => (((day + 4) % 7) + 7) % 7;
/** El primer día de su semana; `ws` como en `Intl.Locale#weekInfo` (1 lunes … 7 domingo). */
export const startOfWeek = (day: number, ws = 1): number => day - ((jsDay(day) - (ws % 7) + 7) % 7);

/** La semana según `Intl.Locale` (weekInfo), o lunes si el navegador no lo sabe. */
export function weekStartOf(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    const d = (l.getWeekInfo?.() ?? l.weekInfo)?.firstDay;
    return d && d >= 1 && d <= 7 ? d : 1;
  } catch {
    return 1;
  }
}

// ---------------------------------------------------------------- períodos

type Unit = "week" | "month" | "quarter" | "half" | "year" | "fiscal";
const UNITS: Record<string, Unit> = { semana: "week", mes: "month", trimestre: "quarter", semestre: "half", ano: "year", "ano fiscal": "fiscal", af: "fiscal", fy: "fiscal" };

interface Ctx {
  /** Hoy. */
  t: number;
  /** Primer día de la semana (1–7) y mes en que empieza el año fiscal (1–12). */
  ws: number;
  fs: number;
  min?: number;
}

/** El período (semana, mes, trimestre…) que contiene `day`. */
function period(u: Unit, day: number, c: Ctx): Span {
  const [y, m] = ymd(day);
  if (u === "week") {
    const a = startOfWeek(day, c.ws);
    return [a, a + 6];
  }
  if (u === "fiscal") {
    const sy = m >= c.fs ? y : y - 1;
    return [dayOf(sy, c.fs, 1), dayOf(sy, c.fs + 12, 0)];
  }
  const n = u === "month" ? 1 : u === "quarter" ? 3 : u === "half" ? 6 : 12;
  const s = m - ((m - 1) % n);
  return [dayOf(y, s, 1), dayOf(y, s + n, 0)];
}

// ---------------------------------------------------------------- frases

const MON = "(ene(?:ro)?|feb(?:rero)?|mar(?:zo)?|abr(?:il)?|may(?:o)?|jun(?:io)?|jul(?:io)?|ago(?:sto)?|sep(?:t(?:iembre)?)?|set(?:iembre)?|oct(?:ubre)?|nov(?:iembre)?|dic(?:iembre)?)";
const monthNum = (w: string) => (w.startsWith("set") ? 9 : "enefebmarabrmayjunjulagosepoctnovdic".indexOf(w.slice(0, 3)) / 3 + 1);
/** Un año opcional al final: « 2025», « de 2025», « del 2025». */
const Y = "(?: (?:de |del )?(\\d{4}))?";
const ORD = "(primer|primero|segundo|tercer|tercero|cuarto|[1-4](?:er|ro|do|to|o)?)";
const ordNum = (w: string) => (/^\d/.test(w) ? +w[0] : w.startsWith("pri") ? 1 : w.startsWith("seg") ? 2 : w.startsWith("ter") ? 3 : 4);
const RX = (s: string) => new RegExp(`^${s}$`);
const RX_QUARTER = [RX(`[qt]([1-4])${Y}`), RX(`${ORD} trimestre${Y}`), RX(`trimestre ([1-4])${Y}`)];
const RX_HALF = [RX(`[sh]([12])${Y}`), RX(`${ORD} semestre${Y}`), RX(`semestre ([12])${Y}`)];
const RX_MONTH = RX(`${MON}${Y}`);
const RX_DAY = RX(`(\\d{1,2})(?: de)? ${MON}${Y}`);
const RX_DAY_MD = RX(`${MON} (\\d{1,2})${Y}`);
const RX_WEEK = RX(`semana (\\d{1,2})${Y}`);
const RX_THIS = /^(?:(este|esta|actual|ultim[oa]|anterior|pasad[oa]|proxim[oa]|siguiente) )?(semana|mes|trimestre|semestre|ano fiscal|ano|af|fy)(?: (actual|en curso|corriente|pasad[oa]|anterior|proxim[oa]|siguiente|que viene))?$/;
const RX_ROLL = /^(?:(ultim|pasad|proxim|siguient)(?:[oa]s?|es)? )?(\d+|[a-z]+) ?(d|dias?|semanas?|meses|mes|trimestres?|anos?)$/;
const RX_TODATE = /^(?:que va (?:del|de la|de este|de esta) (semana|mes|trimestre|semestre|ano fiscal|ano)|(semana|mes|trimestre|semestre|ano fiscal|ano) (?:corrid[oa]|a la fecha|hasta hoy))$/;
/** Palabras que no cambian el significado al principio («todo el 2025», «la semana pasada»). */
const FILL = /^(?:(?:todo|toda|todos|todas|durante|en|el|la|los|las|lo|mes de|de|del)\s+)+/;
const REL: Record<string, number> = { hoy: 0, ayer: -1, anteayer: -2, antier: -2, "antes de ayer": -2, manana: 1, "pasado manana": 2 };
const WORDS: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30, sesenta: 60, noventa: 90, cien: 100 };
const count = (w: string) => (/^\d+$/.test(w) ? +w : Object.hasOwn(WORDS, w) ? WORDS[w] : 0);

/** Minúsculas, sin tildes, sin signos; guiones largos a «-»; los puntos solo entre dígitos. */
export function normalize(text: string): string {
  return foldText(text)
    .replace(/[‐-―−]/g, "-")
    .replace(/[^a-z0-9/.\- ]+/g, " ")
    .replace(/\.(?!\d)|(?<!\d)\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Una expresión ya resuelta: el rango, su año, su mes (si lo tiene) y si el año se dedujo. */
interface U {
  a: number;
  b: number;
  y: number;
  m?: number;
  /** Sin año escrito: el año lo puso la regla (o el otro extremo del rango). */
  yl?: boolean;
}
/** Lo que el otro extremo de un rango le presta a este: el año. */
interface Force {
  year?: number;
}

const fixed = (r: Span): U => {
  const [y, m] = ymd(r[0]);
  return { a: r[0], b: r[1], y, m };
};

/**
 * Una expresión sin año («marzo», «Q3», «15 de diciembre») es la más reciente que ya empezó: en
 * septiembre, «diciembre» es el del año pasado. Con año escrito, ese; con año prestado, ese.
 */
function yearly(build: (y: number) => Span | null, year: string | undefined, f: Force, c: Ctx, m?: number): U | null {
  if (year || f.year !== undefined) {
    const y = year ? +year : f.year!;
    const r = build(y);
    return r && { a: r[0], b: r[1], y, m, yl: !year || undefined };
  }
  const y0 = ymd(c.t)[0];
  // Hasta 8 años atrás: el 29 de febrero sin año busca el último bisiesto.
  for (let y = y0; y > y0 - 8; y--) {
    const r = build(y);
    if (r && r[0] <= c.t) return { a: r[0], b: r[1], y, m, yl: true };
  }
  return null;
}

const dayBuild = (m: number, d: number) => (y: number): Span | null => {
  const v = valid(y, m, d);
  return v === null ? null : [v, v];
};
const monthBuild = (m: number) => (y: number): Span => [dayOf(y, m, 1), dayOf(y, m + 1, 0)];

/** Una sola expresión: un día, un mes, un trimestre, «este mes», «últimos 7 días»… */
function unit(s: string, c: Ctx, f: Force = {}): U | null {
  const t = s.replace(FILL, "");
  const T = c.t;
  let x: RegExpExecArray | null;
  if (Object.hasOwn(REL, t)) return fixed([T + REL[t], T + REL[t]]);
  if ((x = /^hace (\d+|[a-z]+) (dias?|semanas?)$/.exec(t))) {
    const n = count(x[1]);
    const d = T - n * (x[2][0] === "s" ? 7 : 1);
    return n ? fixed([d, d]) : null;
  }
  // «este mes», «la semana pasada», «último trimestre», «el próximo año», «año fiscal».
  if ((x = RX_THIS.exec(t))) {
    const w = (x[1] ?? x[3] ?? "").slice(0, 3);
    const u = UNITS[x[2]];
    const now = period(u, T, c);
    return fixed(/^(ult|ant|pas)/.test(w) ? period(u, now[0] - 1, c) : /^(pro|sig|que)/.test(w) ? period(u, now[1] + 1, c) : now);
  }
  // «en lo que va del año», «mes corrido», «año a la fecha».
  if ((x = RX_TODATE.exec(t))) return fixed([period(UNITS[x[1] ?? x[2]], T, c)[0], T]);
  if ((x = /^([ymqw])td$/.exec(t))) return fixed([period(({ y: "year", m: "month", q: "quarter", w: "week" } as const)[x[1] as "y"], T, c)[0], T]);
  // «últimos 7 días» (hoy incluido), «últimas 2 semanas», «próximos 3 meses», «30d».
  if ((x = RX_ROLL.exec(t)) && count(x[2])) {
    const n = count(x[2]);
    const k = x[3][0];
    const months = k === "m" ? n : k === "t" ? 3 * n : k === "a" ? 12 * n : 0;
    const len = k === "s" ? 7 * n : n;
    if (x[1] === "proxim" || x[1] === "siguient") return fixed([T, months ? addMonths(T, months) - 1 : T + len - 1]);
    return fixed([months ? addMonths(T, -months) + 1 : T - len + 1, T]);
  }
  // Trimestres: «Q3», «Q3 2025», «2025 Q3», «tercer trimestre de 2025», «T3».
  let qy: [string, string | undefined] | null = null;
  if ((x = /^(\d{4}) ?-?[qt]([1-4])$/.exec(t))) qy = [x[2], x[1]];
  else
    for (const rx of RX_QUARTER)
      if ((x = rx.exec(t))) {
        qy = [x[1], x[2]];
        break;
      }
  if (qy) {
    const q = ordNum(qy[0]);
    return yearly((y) => [dayOf(y, 3 * q - 2, 1), dayOf(y, 3 * q + 1, 0)], qy[1], f, c);
  }
  // Semestres: «primer semestre», «S2 2025», «H1».
  for (const rx of RX_HALF) if ((x = rx.exec(t))) break;
  if (x) {
    const h = ordNum(x[1]);
    return h > 2 ? null : yearly((y) => [dayOf(y, 6 * h - 5, 1), dayOf(y, 6 * h + 1, 0)], x[2], f, c);
  }
  // Año fiscal con número: el del año en que empieza («año fiscal 2025», «AF 2025-2026», «FY2025»).
  if ((x = /^(?:ano fiscal|af|fy) ?(\d{4})(?: ?[-/] ?(\d{4}|\d{2}))?$/.exec(t))) {
    const y = +x[1];
    if (x[2] && +x[2] !== y + 1 && +x[2] !== (y + 1) % 100) return null;
    return fixed([dayOf(y, c.fs, 1), dayOf(y, c.fs + 12, 0)]);
  }
  // Semana ISO: «semana 12», «semana 53 de 2026».
  if ((x = RX_WEEK.exec(t))) {
    const n = +x[1];
    return yearly((y) => {
      const a = startOfWeek(dayOf(y, 1, 4), 1) + 7 * (n - 1);
      return n >= 1 && ymd(a + 3)[0] === y ? [a, a + 6] : null;
    }, x[2], f, c);
  }
  if ((x = /^(?:ano )?(\d{4})$/.exec(t))) return fixed([dayOf(+x[1], 1, 1), dayOf(+x[1], 12, 31)]);
  // Meses: «marzo», «marzo 2025», «mar de 2025», «03/2025», «2025-03».
  if ((x = RX_MONTH.exec(t))) {
    const m = monthNum(x[1]);
    return yearly(monthBuild(m), x[2], f, c, m);
  }
  if ((x = /^(\d{1,2})[/-](\d{4})$/.exec(t) ?? /^(\d{4})[/-](\d{1,2})$/.exec(t))) {
    const [m, y] = x[1].length === 4 ? [+x[2], +x[1]] : [+x[1], +x[2]];
    return m >= 1 && m <= 12 ? yearly(monthBuild(m), String(y), f, c, m) : null;
  }
  // Días: «15 de marzo», «15 marzo 2025», «marzo 15», «2026-03-15», «15/03/2026», «15/3/26», «15/03».
  if ((x = RX_DAY.exec(t) ?? RX_DAY_MD.exec(t))) {
    const [d, w] = /^\d/.test(x[1]) ? [+x[1], x[2]] : [+x[2], x[1]];
    const m = monthNum(w);
    return yearly(dayBuild(m, d), x[3], f, c, m);
  }
  if ((x = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(t))) return yearly(dayBuild(+x[2], +x[3]), x[1], f, c, +x[2]);
  if ((x = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?$/.exec(t))) {
    const y = x[3] && (x[3].length === 2 ? String(2000 + +x[3]) : x[3]);
    return yearly(dayBuild(+x[2], +x[1]), y, f, c, +x[2]);
  }
  // Un día suelto («15») solo vale como extremo de un rango: lo resuelve `pair`.
  return null;
}

/** El número de un día suelto («15», «el 15»), o 0. «2025-13» no es «de 2025 al 13»: un día
 *  suelto solo acompaña a otro día. */
const bareDay = (s: string) => {
  const x = /^(\d{1,2})$/.exec(s.replace(FILL, ""));
  return x ? +x[1] : 0;
};

/**
 * Un día suelto frente a otro día: toma el mes y el año del otro extremo. Si así queda del lado
 * equivocado, es el mes de al lado, no otro año: «25 al 5» es del 25 del mes pasado al 5.
 * `dir` = −1 si el día suelto es el inicio (va antes de `day`), +1 si es el fin.
 */
function besideDay(n: number, day: number, dir: -1 | 1): number | null {
  const [y, m, d] = ymd(day);
  // Del lado correcto, ese mes (aunque no exista: «del 15 de febrero al 30» no es el 30 de marzo).
  if (dir < 0 ? n <= d : n >= d) return valid(y, m, n);
  const [y2, m2] = ymd(dayOf(y, m + dir, 1));
  return valid(y2, m2, n);
}

/** Dos extremos: el que no dice su año (o su mes) lo toma del otro. */
function pair(ls: string, rs: string, c: Ctx): Span | null {
  const dl = bareDay(ls);
  const dr = bareDay(rs);
  if (dl && dr) {
    // «del 1 al 15»: los dos en el mes de hoy (el inicio, en el anterior si queda después del fin).
    const [y, m] = ymd(c.t);
    const b = valid(y, m, dr);
    const a = b === null ? null : besideDay(dl, b, -1);
    return a === null || b === null ? null : [a, b];
  }
  if (dr) {
    // «del 15 de marzo al 20»: el fin, en el mes del inicio (o el siguiente).
    const l = unit(ls, c);
    if (!l || l.a !== l.b) return null;
    const b = besideDay(dr, l.a, 1);
    return b === null ? null : [l.a, b];
  }
  if (dl) {
    // «15 al 20 de abril»: el inicio, en el mes del fin (o el anterior). Sin año escrito, el año es
    // el del inicio más reciente que ya empezó (como una expresión sola).
    const lead = (r: U | null): Span | null => {
      if (!r || r.a !== r.b) return null;
      const a = besideDay(dl, r.a, -1);
      return a === null ? null : [a, r.b];
    };
    const r = unit(rs, c);
    if (!r?.yl) return lead(r);
    const y0 = ymd(c.t)[0];
    for (let y = y0 + 1; y > y0 - 8; y--) {
      const s = lead(unit(rs, c, { year: y }));
      if (s && s[0] <= c.t) return s;
    }
    return null;
  }
  let r = unit(rs, c);
  if (!r) return null;
  let l = unit(ls, c, r.yl ? {} : { year: r.y });
  if (!l) return null;
  if (!r.yl) {
    // «diciembre a febrero de 2026»: diciembre es del año anterior.
    if (l.yl && l.a > r.b) l = unit(ls, c, { year: r.y - 1 });
  } else {
    // «de noviembre a febrero»: el fin es el primero que viene después del inicio.
    r = unit(rs, c, { year: l.y });
    if (r && r.b < l.a) r = unit(rs, c, { year: l.y + 1 });
  }
  if (!l || !r) return null;
  return l.a <= r.b ? [l.a, r.b] : [r.a, l.b];
}

function span(t: string, c: Ctx): Span | null {
  const u = unit(t, c);
  if (u) return [u.a, u.b];
  // «de marzo a junio», «del 15 de marzo al 20 de abril», «entre Q1 y Q2», «15/03/2026 - 20/04/2026».
  const r = t.replace(/^(?:desde|entre|de|del) /, "");
  for (const m of r.matchAll(/ (?:al|a|hasta|y) | ?- ?/g)) {
    const out = pair(r.slice(0, m.index), r.slice(m.index! + m[0].length), c);
    if (out) return out;
  }
  let x: RegExpExecArray | null;
  // «desde el 15 de marzo» (hasta hoy), «a partir de abril», «marzo en adelante».
  if ((x = /^(?:desde|a partir del?) (.+?)(?: en adelante)?$|^(.+) en adelante$/.exec(t))) {
    const v = unit(x[1] ?? x[2], c);
    return v && [v.a, Math.max(c.t, v.b)];
  }
  // «hasta el 10 de abril»: desde `min`, o desde el 1 de enero de ese año.
  if ((x = /^hasta (.+)$/.exec(t))) {
    const v = unit(x[1], c);
    return v && [Math.min(c.min ?? dayOf(ymd(v.b)[0], 1, 1), v.a), v.b];
  }
  return null;
}

export interface ParseOptions {
  /** Hoy, en ISO (por defecto, la fecha local del navegador). */
  today?: string;
  /** Primer día de la semana, 1 (lunes) … 7 (domingo). Por defecto, lunes. */
  weekStart?: number;
  /** Mes en que empieza el año fiscal, 1–12. Por defecto, enero. */
  fiscalStart?: number;
  /** Desde cuándo cuenta «hasta …». */
  min?: string;
}

/** «Hoy» para la lógica: `today` si es una fecha válida, o la fecha local. */
export function todayOf(today?: string | null): number {
  const t = dayOfISO(today);
  if (t !== null) return t;
  const n = new Date();
  return dayOf(n.getFullYear(), n.getMonth() + 1, n.getDate());
}
const intIn = (v: unknown, lo: number, hi: number, dflt: number) => (Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : dflt);

/**
 * Una frase en español → el rango que quiere decir, o `null` si no se entiende. Sin tildes ni
 * mayúsculas: «ultimos 30 dias» vale lo mismo que «Últimos 30 días».
 */
export function parsePhrase(text: string, opts: ParseOptions = {}): DateRange | null {
  const t = normalize(text);
  if (!t) return null;
  const c: Ctx = { t: todayOf(opts.today), ws: intIn(opts.weekStart, 1, 7, 1), fs: intIn(opts.fiscalStart, 1, 12, 1), min: dayOfISO(opts.min) ?? undefined };
  const r = span(t, c);
  // «últimos 99999999 días» empezaría antes del año 1: no es un rango que se pueda escribir.
  const start = r ? isoOf(r[0]) : "";
  const end = r ? isoOf(r[1]) : "";
  return start && end ? { start, end } : null;
}

// ---------------------------------------------------------------- rangos

/** Un rango desde `{start, end}` o «start/end» (intervalo ISO 8601), ordenado; lo inválido → `null`. */
export function toRange(v: unknown): DateRange | null {
  let a: unknown, b: unknown;
  if (typeof v === "string") [a, b] = v.split("/");
  else if (v && typeof v === "object") ({ start: a, end: b } = v as DateRange);
  const x = dayOfISO(a);
  const y = dayOfISO(b ?? a);
  if (x === null || y === null) return null;
  return { start: isoOf(Math.min(x, y)), end: isoOf(Math.max(x, y)) };
}

/** Cuántos días tiene, ambos extremos incluidos. */
export const rangeDays = (r: DateRange): number => dayOfISO(r.end)! - dayOfISO(r.start)! + 1;

/** Recorta a `min`/`max`. `null` si queda por fuera del todo; `clamped` si se recortó. */
export function clampRange(r: DateRange, min?: string | null, max?: string | null): (DateRange & { clamped?: true }) | null {
  let a = dayOfISO(r.start);
  let b = dayOfISO(r.end);
  // Un extremo inválido no es el 1970-01-01 (el `null` como número).
  if (a === null || b === null) return null;
  const lo = dayOfISO(min);
  const hi = dayOfISO(max);
  let clamped = false;
  if (lo !== null && a < lo) (a = lo), (clamped = true);
  if (hi !== null && b > hi) (b = hi), (clamped = true);
  if (a > b) return null;
  return clamped ? { start: isoOf(a), end: isoOf(b), clamped } : { start: isoOf(a), end: isoOf(b) };
}

/**
 * El rango de comparación. `previous`: el mismo largo, justo antes; si el rango son meses
 * completos, los meses anteriores (Q3 → Q2, marzo → febrero entero). `year`: las mismas fechas un
 * año antes (29 feb → 28 feb; un mes completo sigue completo).
 */
export function compareRange(r: DateRange, mode: DateRangeCompare): DateRange {
  const a = dayOfISO(r.start)!;
  const b = dayOfISO(r.end)!;
  const [ya, ma, da] = ymd(a);
  const [yb, mb] = ymd(b);
  const whole = da === 1 && b === dayOf(yb, mb + 1, 0);
  const months = (yb - ya) * 12 + mb - ma + 1;
  const endOfMonth = (d: number) => dayOf(ymd(d)[0], ymd(d)[1] + 1, 0);
  if (mode === "year") return { start: isoOf(addMonths(a, -12)), end: isoOf(whole ? endOfMonth(addMonths(b, -12)) : addMonths(b, -12)) };
  if (whole) return { start: isoOf(addMonths(a, -months)), end: isoOf(a - 1) };
  return { start: isoOf(a - (b - a + 1)), end: isoOf(a - 1) };
}

// ---------------------------------------------------------------- atajos

/** Los atajos por defecto: frases que se interpretan al abrir. */
export const DEFAULT_PRESETS: readonly string[] = ["Hoy", "Ayer", "Últimos 7 días", "Últimos 30 días", "Este mes", "El mes pasado", "Este trimestre", "Último trimestre", "Este año", "El año pasado"];

/** Los atajos válidos, sin lo que no es suyo: texto, o `{label}` con `phrase` o `start`/`end`. */
export function cleanPresets(v: unknown): DateRangePreset[] {
  if (!Array.isArray(v)) return [];
  const out: DateRangePreset[] = [];
  for (const x of v) {
    if (typeof x === "string") {
      if (x.trim()) out.push({ label: x.trim() });
      continue;
    }
    const o = x as Record<string, unknown> | null;
    if (!o || typeof o !== "object" || typeof o.label !== "string" || !o.label.trim()) continue;
    const range = toRange(o);
    out.push(range ? { label: o.label.trim(), ...range } : typeof o.phrase === "string" && o.phrase.trim() ? { label: o.label.trim(), phrase: o.phrase } : { label: o.label.trim() });
  }
  return out;
}

/** El rango de un atajo: sus fechas, o su frase (o su etiqueta) interpretada. */
export function presetRange(p: DateRangePreset, opts: ParseOptions = {}): DateRange | null {
  return p.start && p.end ? { start: p.start, end: p.end } : parsePhrase(p.phrase ?? p.label, opts);
}

// ---------------------------------------------------------------- calendario y formato

/** Las celdas de un mes (semanas de 7, con `null` en los huecos del principio y del final). */
export function monthGrid(y: number, m: number, ws = 1): (number | null)[] {
  const first = dayOf(y, m, 1);
  const lead = first - startOfWeek(first, ws);
  const n = monthLen(y, m);
  const cells: (number | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < n; i++) cells.push(first + i);
  while (cells.length % 7) cells.push(null);
  return cells;
}

const fmts = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, key: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${locale}|${key}`;
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
/** Partes → texto, en la forma corta de una tabla: «1 jul 2026» y no «1 de jul de 2026». */
const tidy = (parts: { type: string; value: string }[]) =>
  parts
    .map((p) => (p.type === "literal" && /^\s*de\s*$/.test(p.value) ? " " : p.value))
    .join("")
    .replace(/[\s  ]+/g, " ")
    .trim();
const SHORT: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/** «1 jul – 30 sept 2026», «1 – 30 sept 2026», «15 dic 2025 – 10 ene 2026», «25 sept 2026». */
export function formatRange(r: DateRange, locale: string): string {
  const x = dayOfISO(r.start);
  const y = dayOfISO(r.end);
  if (x === null || y === null) return "";
  const a = new Date(x * MS);
  const b = new Date(y * MS);
  const f = dtf(locale, "s", SHORT);
  if (r.start === r.end) return tidy(f.formatToParts(a));
  try {
    const parts = f.formatRangeToParts(a, b);
    // El separador («al», «a», «–») es el literal compartido justo antes del fin: siempre «–».
    const i = parts.findIndex((p) => p.source === "endRange");
    if (i > 0 && parts[i - 1].type === "literal") parts[i - 1] = { ...parts[i - 1], value: " – " };
    return tidy(parts);
  } catch {
    return `${tidy(f.formatToParts(a))} – ${tidy(f.formatToParts(b))}`;
  }
}

/** «Septiembre 2026». */
export function monthTitle(y: number, m: number, locale: string): string {
  const s = tidy(dtf(locale, "m", { month: "long", year: "numeric" }).formatToParts(new Date(dayOf(y, m, 1) * MS)));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «miércoles, 2 de septiembre de 2026» (el nombre accesible de una celda). */
export const dayLabel = (day: number, locale: string): string => dtf(locale, "f", { dateStyle: "full" }).format(new Date(day * MS));

/** Los encabezados de la semana desde `ws`: corto («Lu») y completo («lunes»). */
export function weekdays(locale: string, ws = 1): { short: string; long: string }[] {
  const s = dtf(locale, "w", { weekday: "short" });
  const l = dtf(locale, "W", { weekday: "long" });
  // 2024-01-01 fue lunes: ws − 1 días después es el primero.
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(dayOf(2024, 1, ws + i) * MS);
    const short = s.format(d).replace(".", "");
    return { short: short.charAt(0).toUpperCase() + short.slice(1, 2), long: l.format(d) };
  });
}

/** «1 día», «92 días», «1.234 días», con el plural del locale. */
export function daysText(n: number, locale: string, labels: { day: string; days: string }): string {
  let one = n === 1;
  let num = String(n);
  try {
    one = new Intl.PluralRules(locale).select(n) === "one";
    num = new Intl.NumberFormat(locale).format(n);
  } catch {
    /* locale inválido: el plural del español, sin separador */
  }
  return (one ? labels.day : labels.days).replace("{n}", num);
}
