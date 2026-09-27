/**
 * Lógica pura de `<nx-guard>`: ¿este valor es un dedazo? Sin DOM: la usa el elemento y sirve igual
 * en un backend (para revisar un lote importado, por ejemplo).
 *
 * Lo habitual de un campo sale de su historia con estadística robusta (mediana y MAD, no media y
 * desviación: un solo atípico en la historia no mueve nada), o de un rango que da el autor. Contra
 * eso se buscan los errores de dedo de siempre, en este orden: un negativo donde no los hay, dos
 * dígitos invertidos o uno distinto de lo esperado, el separador decimal confundido, un cero de más
 * o de menos (una potencia de 10), y lo que simplemente está muy lejos. En fechas: el año con
 * dígitos invertidos o de otro siglo, lo que cae fuera del rango del campo, fines de semana y
 * festivos. Aparte: decimales en un campo de enteros y el mismo valor que el último registrado.
 *
 * Todo en tiempo lineal: la mediana es por selección (quickselect), sin ordenar la historia.
 */
import { nxFormat, type NxFormat } from "../../core/locale";
import { foldText } from "../../core/text";
import type { GuardFinding, GuardLabels, GuardRule } from "./types";

export const GUARD_LABELS: GuardLabels = {
  times: "{value} es {n} veces lo habitual ({typical}).",
  fraction: "{value} es {n} veces menos que lo habitual ({typical}).",
  timesExpected: "{value} es {n} veces lo esperado ({expected}).",
  fractionExpected: "{value} es {n} veces menos que lo esperado ({expected}).",
  extraZero: "¿Sobra un cero?",
  extraZeros: "¿Sobran {n} ceros?",
  missingZero: "¿Falta un cero?",
  missingZeros: "¿Faltan {n} ceros?",
  high: "Muy por encima de lo habitual ({typical})",
  low: "Muy por debajo de lo habitual ({typical})",
  decimal: "Se leyó {value}. ¿Querías {suggestion}?",
  swap: "¿Invertiste dos dígitos? Esperado {expected}",
  digit: "Difiere en un dígito de {expected}",
  year: "¿Año {year}? ¿Querías {suggestion}?",
  date: "Fuera de lo habitual para esta fecha ({typical})",
  weekend: "Cae en {day}",
  holiday: "Es festivo",
  repeat: "Igual al último registrado",
  integer: "Aquí siempre va un número entero",
  negative: "Aquí nunca hay negativos",
  fix: "Corregir a {value}",
  ack: "Está bien",
  confirm: "Revisa {n} valores inusuales o envía de todos modos",
  confirmOne: "Revisa 1 valor inusual o envía de todos modos",
};

/** «{n} veces» con sus variables. */
export const fillText = (t: string, vars: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));

// ---------------------------------------------------------------- estadística robusta

/** El k-ésimo menor de `a` (lo reordena), en tiempo lineal promedio. Pivote: mediana de tres. */
function select(a: Float64Array, k: number): number {
  let lo = 0;
  let hi = a.length - 1;
  while (hi > lo) {
    const x = a[lo];
    const y = a[(lo + hi) >> 1];
    const z = a[hi];
    const p = x < y ? (y < z ? y : x < z ? z : x) : x < z ? x : y < z ? z : y;
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < p) i++;
      while (a[j] > p) j--;
      if (i <= j) {
        const t = a[i];
        a[i++] = a[j];
        a[j--] = t;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}

/** La mediana (reordena `a`). */
function medianOf(a: Float64Array): number {
  const n = a.length;
  const upper = select(a, n >> 1);
  if (n % 2) return upper;
  // Todo lo que quedó a la izquierda es ≤: la mitad baja es el mayor de esos.
  let lower = -Infinity;
  for (let i = 0; i < n >> 1; i++) if (a[i] > lower) lower = a[i];
  return (lower + upper) / 2;
}

/** Un número finito, o un texto en formato de máquina («1180000», «-2.5»). */
const toNum = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export interface RobustRange {
  /** Cuántos valores numéricos había. */
  n: number;
  median: number;
  /** Desviación absoluta mediana. */
  mad: number;
  /** La dispersión que se usa: 1,4826 × MAD (la desviación de una normal), con un piso de 2 % de la mediana. */
  spread: number;
  /** Lo habitual: mediana ± 3 × `spread` (sin bajar de 0 si la historia no tiene negativos). */
  lo: number;
  hi: number;
}

/**
 * Lo habitual de una historia: mediana y MAD, en tiempo lineal. Ignora lo que no es un número. Un
 * atípico (o varios, hasta casi la mitad) no mueve el centro ni el ancho. `null` sin datos.
 */
export function robustRange(values: readonly unknown[] | null | undefined): RobustRange | null {
  if (!Array.isArray(values) || !values.length) return null;
  const a = new Float64Array(values.length);
  let n = 0;
  let neg = false;
  for (const v of values) {
    const x = toNum(v);
    if (x === null) continue;
    a[n++] = x;
    if (x < 0) neg = true;
  }
  if (!n) return null;
  const xs = a.subarray(0, n);
  const median = medianOf(xs);
  for (let i = 0; i < n; i++) xs[i] = Math.abs(xs[i] - median);
  const mad = medianOf(xs);
  const spread = Math.max(1.4826 * mad, 0.02 * Math.abs(median));
  const lo = median - 3 * spread;
  return { n, median, mad, spread, lo: !neg && lo < 0 ? 0 : lo, hi: median + 3 * spread };
}

// ---------------------------------------------------------------- lectura

/**
 * Un monto escrito, como lo lee `<nx-number>`: con `nxFormat(locale).parse` («1.234,5» en español,
 * «1,234.5» en inglés), y más tolerante con lo pegado: si aparecen «.» y «,», el último es el
 * decimal; si uno se repite, es de miles. Ignora símbolos y espacios. `null` si no hay un número.
 */
export function readAmount(text: string, locale = "es-CO"): number | null {
  const t = String(text ?? "").replace(/[^\d.,-]/g, "");
  if (!/\d/.test(t)) return null;
  const neg = t.startsWith("-") || t.endsWith("-");
  const body = t.replace(/-/g, "");
  const dots = body.split(".").length - 1;
  const commas = body.split(",").length - 1;
  let n: number | null;
  if (dots && commas) {
    const dec = body.lastIndexOf(".") > body.lastIndexOf(",") ? "." : ",";
    n = body.split(dec).length === 2 ? Number(body.split(dec === "." ? "," : ".").join("").replace(dec, ".")) : null;
  } else if (dots > 1 || commas > 1) n = Number(body.replace(/[.,]/g, ""));
  else n = nxFormat(locale).parse(body);
  return n === null || !Number.isFinite(n) ? null : neg ? -n : n;
}

/**
 * Las otras lecturas de un texto con separadores: todos de miles («1.5» → 15, «1.500» → 1500) o el
 * último decimal («1.500» → 1,5; «1,234.50» → 1234,5). Una de ellas suele ser la que se quiso.
 */
export function otherReadings(raw: string): number[] {
  const t = String(raw ?? "").replace(/[^\d.,-]/g, "");
  const body = t.replace(/-/g, "");
  const i = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  if (i < 0 || !/\d/.test(body)) return [];
  const sign = t.startsWith("-") || t.endsWith("-") ? -1 : 1;
  const out = [Number(body.replace(/[.,]/g, "")), Number(`${body.slice(0, i).replace(/[.,]/g, "") || "0"}.${body.slice(i + 1) || "0"}`)];
  return out.filter(Number.isFinite).map((x) => x * sign);
}

// ---------------------------------------------------------------- fechas

const pad = (n: number) => String(n).padStart(2, "0");
/** Una fecha UTC sin la trampa de `Date.UTC` con años < 100 (que los manda a 19xx). */
function utc(y: number, m: number, d: number): Date {
  const dt = new Date(0);
  dt.setUTCFullYear(y, m, d);
  return dt;
}
const iso = (dt: Date) => `${String(dt.getUTCFullYear()).padStart(4, "0")}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;

/** `[año, mes, día]` de una fecha ISO válida («2026-09-12», también con hora), o `null`. */
export function isoParts(v: unknown): [number, number, number] | null {
  const m = typeof v === "string" ? /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(v.trim()) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = utc(y, mo - 1, d);
  return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? [y, mo, d] : null;
}

/** Hoy en ISO, con la fecha local. */
export function todayISO(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Una fecha de la configuración: ISO, o relativa a `today`: «-30d», «+90d», «-2w», «+6m», «-1y»,
 * «today» (o «hoy»). `null` si no se entiende.
 */
export function guardDate(spec: unknown, today: string = todayISO()): string | null {
  if (typeof spec !== "string") return null;
  const t = spec.trim().toLowerCase();
  const base = isoParts(today);
  if (!base) return null;
  if (t === "today" || t === "hoy") return iso(utc(base[0], base[1] - 1, base[2]));
  const m = /^([+-]?)(\d{1,4})([dwmy])$/.exec(t);
  if (m) {
    const n = Number(m[2]) * (m[1] === "-" ? -1 : 1);
    const [y, mo, d] = base;
    return iso(m[3] === "y" ? utc(y + n, mo - 1, d) : m[3] === "m" ? utc(y, mo - 1 + n, d) : utc(y, mo - 1, d + n * (m[3] === "w" ? 7 : 1)));
  }
  return isoParts(t) ? t.slice(0, 10) : null;
}

/** Años a un dedazo de `y`: dos cifras vecinas invertidas, una cifra distinta, o «26» por 2026. */
function yearsNear(y: number): number[] {
  const s = String(y).padStart(4, "0");
  const out = new Set<number>();
  for (let i = 0; i < 3; i++) out.add(Number(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2)));
  for (let i = 0; i < 4; i++) for (let d = 0; d <= 9; d++) out.add(Number(s.slice(0, i) + d + s.slice(i + 1)));
  if (y < 100) out.add(2000 + y);
  out.delete(y);
  return [...out].filter((c) => c >= 1000);
}

// ---------------------------------------------------------------- el chequeo

export interface GuardCheckOptions {
  /** Locale de los mensajes («es-CO» por defecto). */
  locale?: string;
  /** Hoy en ISO (para fechas relativas); por defecto, la fecha local. */
  today?: string;
  /** El texto tal como se escribió («1.500»): permite ver un separador confundido. */
  raw?: string;
  labels?: GuardLabels;
}

/** Lo habitual contra lo que se mide un número. */
interface Band {
  lo: number;
  hi: number;
  /** Del autor (`typical`, `min`/`max`): salir ya es raro. De la historia: solo lo muy lejano. */
  hard: boolean;
  center: number;
  /** ¿Cae en lo habitual? (para las correcciones). */
  has(x: number): boolean;
  /** ¿Está lejos? */
  far(x: number): boolean;
  /** ¿Tan lejos que vale buscar una potencia de 10? */
  strong(x: number): boolean;
  /** Con historia corta (< 4) no se dice «muy por encima»: solo las correcciones obvias. */
  quiet: boolean;
}

function bandOf(rule: GuardRule, hist: number[]): Band | null {
  const t = Array.isArray(rule.typical) ? rule.typical.map(toNum) : [];
  const min = toNum(rule.min);
  const max = toNum(rule.max);
  if (t.length === 2 && t[0] !== null && t[1] !== null) return hardBand(Math.min(t[0], t[1]), Math.max(t[0], t[1]));
  if (hist.length) {
    const r = robustRange(hist)!;
    const c = r.median;
    const same = (x: number) => c !== 0 && Math.sign(x) === Math.sign(c);
    const ratio = (x: number) => Math.abs(x / c);
    if (r.n < 4) {
      // Pocos datos: solo lo que está a un orden de magnitud y cuya corrección cae casi exacta.
      return { lo: r.lo, hi: r.hi, hard: false, quiet: true, center: c, has: (x) => same(x) && Math.abs(x - c) <= 0.15 * Math.abs(c), far: (x) => !same(x) || ratio(x) >= 8 || ratio(x) <= 1 / 8, strong: (x) => same(x) && (ratio(x) >= 8 || ratio(x) <= 1 / 8) };
    }
    const near = Math.max(3 * r.spread, 0.25 * Math.abs(c));
    const far = (x: number) => Math.abs(x - c) > Math.max(5 * r.spread, 0.5 * Math.abs(c));
    return { lo: r.lo, hi: r.hi, hard: false, quiet: false, center: c, has: (x) => Math.abs(x - c) <= near, far, strong: (x) => far(x) && same(x) && (ratio(x) >= 3 || ratio(x) <= 1 / 3) };
  }
  if (min !== null || max !== null) return hardBand(min ?? -Infinity, max ?? Infinity);
  return null;
}

function hardBand(lo: number, hi: number): Band {
  const far = (x: number) => x < lo || x > hi;
  return {
    lo,
    hi,
    hard: true,
    quiet: false,
    center: lo > 0 && hi < Infinity ? Math.sqrt(lo * hi) : (lo + hi) / 2,
    has: (x) => x >= lo && x <= hi,
    far,
    // Justo afuera es solo «por encima»; tres veces afuera ya puede ser un cero de más.
    strong: (x) => (x > hi ? hi > 0 && x > 3 * hi : x < lo ? lo > 0 && x > 0 && x < lo / 3 : false),
  };
}

/** Las cifras de un número para comparar dígito a dígito (con centavos si alguno los tiene). */
const digitsOf = (x: number, cents: boolean) => String(Math.round(Math.abs(x) * (cents ? 100 : 1)));

/**
 * ¿Es raro este valor para este campo? Devuelve los hallazgos en orden de importancia (vacío si
 * todo cuadra). `value` es un número, una fecha ISO o un texto; con `type: "number"`, un texto se
 * lee como monto del locale («1.200.000»). `rule.expected` debe venir ya como número.
 */
export function guardCheck(value: unknown, rule: GuardRule = {}, opts: GuardCheckOptions = {}): GuardFinding[] {
  const locale = opts.locale || "es-CO";
  const fmt = nxFormat(locale);
  const L = opts.labels ?? GUARD_LABELS;
  const hist = Array.isArray(rule.history) ? rule.history : [];
  const type = rule.type ?? (typeof value === "number" ? "number" : isoParts(value) ? "date" : hist.some((h) => typeof h === "number") ? "number" : "text");
  if (value === null || value === undefined || value === "") return [];
  let out: GuardFinding[] = [];
  let key = value;
  if (type === "date") out = checkDate(String(value), rule, fmt, L, opts.today ?? todayISO());
  else if (type === "number") {
    const v = typeof value === "number" ? value : typeof value === "string" ? readAmount(value, locale) : null;
    if (v === null || !Number.isFinite(v)) return [];
    out = checkNumber(v, opts.raw ?? (typeof value === "string" ? value : undefined), rule, fmt, L);
    key = v;
  }
  // Igual al último registrado: el mismo número, la misma fecha o el mismo texto (sin tildes ni mayúsculas).
  const norm = (x: unknown) => (type === "number" ? toNum(x) : foldText(String(x).trim()).slice(0, type === "date" ? 10 : undefined));
  if (rule.repeat && hist.length && norm(hist[hist.length - 1]) === norm(key)) out.push(warn("repeat", L.repeat));
  return out;
}

/** Un hallazgo `warn` (con su corrección, si la hay). */
const warn = (kind: string, message: string, suggestion?: number | string): GuardFinding => (suggestion === undefined ? { kind, message, severity: "warn" } : { kind, message, suggestion, severity: "warn" });

function checkNumber(v: number, raw: string | undefined, rule: GuardRule, fmt: NxFormat, L: GuardLabels): GuardFinding[] {
  const hist: number[] = [];
  let ints = true;
  let neg = false;
  if (Array.isArray(rule.history))
    for (const h of rule.history) {
      const x = toNum(h);
      if (x === null) continue;
      hist.push(x);
      if (!Number.isInteger(x)) ints = false;
      if (x < 0) neg = true;
    }
  const money = rule.format === "money";
  const show = (n: number) => showValue(n, rule, fmt);
  const short = (n: number) => showValue(n, rule, fmt, true);
  const out: GuardFinding[] = [];
  const band = bandOf(rule, hist);
  const expected = toNum(rule.expected);

  // Negativo donde no los hay: lo dice el autor, o la historia, `typical` o `min` no tienen ninguno.
  const floors = [toNum(rule.min), band?.hard ? band.lo : null].filter((x): x is number => x !== null && x > -Infinity);
  const noNeg = rule.negative === false || (rule.negative === undefined && ((hist.length > 0 && !neg) || floors.some((x) => x >= 0) || (expected !== null && expected > 0)));
  let first: GuardFinding | null = null;
  if (v < 0 && noNeg) first = warn("negative", L.negative, -v);

  // Contra lo esperado: dos dígitos invertidos, uno distinto, o una potencia de 10.
  if (!first && expected !== null && v !== expected && Math.sign(v) === Math.sign(expected)) {
    const cents = !Number.isInteger(v) || !Number.isInteger(expected);
    const a = digitsOf(v, cents);
    const b = digitsOf(expected, cents);
    const vars = { value: show(v), expected: show(expected) };
    if (a.length === b.length) {
      const diff: number[] = [];
      for (let i = 0; i < a.length && diff.length < 3; i++) if (a[i] !== b[i]) diff.push(i);
      if (diff.length === 1) first = warn("digit", fillText(L.digit, vars), expected);
      else if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]]) first = warn("swap", fillText(L.swap, vars), expected);
    } else {
      const k = a.length - b.length;
      if (Math.abs(k) <= 3 && (k > 0 ? a === b + "0".repeat(k) : b === a + "0".repeat(-k)))
        first = warn("magnitude", `${fillText(k > 0 ? L.timesExpected : L.fractionExpected, { ...vars, n: fmt.number(10 ** Math.abs(k)) })} ${zeros(k, L)}`, expected);
    }
  }

  // El separador confundido: fuera de lo habitual, y otra lectura del mismo texto cae adentro (no
  // hace falta que esté muy lejos: «1.5» queriendo 15 está cerca, pero la otra lectura es exacta).
  if (!first && band && raw && /[.,]/.test(raw) && !band.has(v)) {
    const alt = otherReadings(raw).find((x) => x !== v && band.has(x));
    if (alt !== undefined) first = warn("decimal", fillText(L.decimal, { value: show(v), suggestion: show(alt) }), alt);
  }
  if (!first && band && band.far(v)) {
    const typical = band.hard ? span(band.lo, band.hi, short) : show(nice(band.center));
    // Un cero de más o de menos: v / 10^k cae en lo habitual (la menor potencia que sirva).
    if (!first && band.strong(v))
      for (let k = 1; k <= 3 && !first; k++) {
        const up = Math.abs(v) > Math.abs(band.center);
        const x = tidy(up ? v / 10 ** k : v * 10 ** k);
        if (band.has(x)) first = warn("magnitude", `${fillText(up ? L.times : L.fraction, { value: show(v), n: fmt.number(10 ** k), typical })} ${zeros(up ? k : -k, L)}`, x);
      }
    if (!first && !band.quiet) {
      const up = v > band.hi || (!band.hard && v > band.center);
      first = warn("range", fillText(up ? L.high : L.low, { typical: span(band.lo, band.hi, short) }));
    }
  }
  if (first) out.push(first);

  // Decimales donde siempre van enteros (lo dice el autor, o la historia de algo que no es un monto).
  const integer = rule.integer ?? (hist.length >= 4 && ints && !money && rule.format !== "percent");
  if (integer && !Number.isInteger(v) && !first?.suggestion) out.push(warn("integer", L.integer, Math.round(v)));
  return out;
}

/**
 * Un valor como se muestra en los mensajes y en «Corregir a …»: montos con su moneda, porcentajes,
 * números del locale y fechas ISO en corto («12 sept 2026»). `short`: compacto («$1,2 M»).
 */
export function showValue(v: number | string, rule: GuardRule, fmt: NxFormat, short = false): string {
  if (typeof v === "string") return isoParts(v) ? fmt.date(v) : v;
  if (rule.format === "money") return fmt.money(v, { currency: rule.currency }, short);
  return rule.format === "percent" ? `${fmt.number(v * 100)} %` : short ? fmt.compact(v) : fmt.number(v);
}

/** «¿Sobra un cero?», «¿Faltan 2 ceros?». */
const zeros = (k: number, L: GuardLabels) => (k === 1 ? L.extraZero : k === -1 ? L.missingZero : fillText(k > 0 ? L.extraZeros : L.missingZeros, { n: Math.abs(k) }));
/** Quita la basura de coma flotante (1234500 / 1000). */
const tidy = (n: number) => Number(n.toPrecision(12));
/** Para mostrar lo habitual: tres cifras significativas (1.202.500 → 1.200.000). */
const nice = (n: number) => (Math.abs(n) >= 1000 ? Number(n.toPrecision(3)) : n);
/** «1,1 M – 1,3 M», «≥ 10», «≤ 50» (un extremo abierto es `null` o infinito). */
const span = <T>(lo: T | null, hi: T | null, f: (x: T) => string) => (lo === null || lo === -Infinity ? `≤ ${f(hi!)}` : hi === null || hi === Infinity ? `≥ ${f(lo)}` : `${f(lo)} – ${f(hi)}`);

function checkDate(value: string, rule: GuardRule, fmt: NxFormat, L: GuardLabels, today: string): GuardFinding[] {
  const parts = isoParts(value);
  const now = isoParts(today);
  if (!parts || !now) return [];
  const date = value.trim().slice(0, 10);
  const [y, m, d] = parts;
  const year = now[0];
  const t = Array.isArray(rule.typical) ? rule.typical : [rule.min, rule.max];
  const lo = guardDate(t[0], today);
  const hi = guardDate(t[1], today);
  const ranged = !!(lo || hi);
  const inRange = (s: string) => (!lo || s >= lo) && (!hi || s <= hi);
  const out: GuardFinding[] = [];
  // Un año raro: fuera del rango del campo o, sin rango, de otro siglo o muy lejano (> 20 años).
  const odd = ranged ? !inRange(date) : y < 1900 || y > year + 20;
  if (odd) {
    let best: string | null = null;
    // Si el año ya es el de hoy, lo raro es el mes o el día: no se propone otro año.
    for (const c of y === year ? [] : yearsNear(y)) {
      const dt = utc(c, m - 1, d);
      if (dt.getUTCDate() !== d) continue; // 29 de febrero en un año que no es bisiesto
      const s = iso(dt);
      if (!(ranged ? inRange(s) : Math.abs(c - year) <= 1)) continue;
      if (!best || Math.abs(c - year) < Math.abs(Number(best.slice(0, 4)) - year)) best = s;
    }
    if (best) out.push(warn("year", fillText(L.year, { year: String(y).padStart(4, "0"), suggestion: best.slice(0, 4) }), best));
    else if (ranged) out.push(warn("date", fillText(L.date, { typical: span(lo, hi, fmt.date) })));
  }
  if (rule.workdays) {
    const dt = utc(y, m - 1, d);
    const holidays = Array.isArray(rule.holidays) ? rule.holidays : [];
    if (dt.getUTCDay() === 0 || dt.getUTCDay() === 6)
      out.push({ kind: "workday", message: fillText(L.weekend, { day: new Intl.DateTimeFormat(fmt.locale, { weekday: "long", timeZone: "UTC" }).format(dt) }), severity: "info" });
    else if (holidays.includes(date)) out.push({ kind: "workday", message: L.holiday, severity: "info" });
  }
  return out;
}
