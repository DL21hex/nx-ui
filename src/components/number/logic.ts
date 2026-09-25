/**
 * Lógica pura del campo numérico: entender lo que se escribe (con sufijos y cuentas), formatear y
 * escribir un monto en letras. Sin DOM: la usa el elemento y sirve igual en un backend.
 *
 * El evaluador es propio y pequeño (descenso recursivo sobre fichas): nada de `eval` ni
 * `Function`. Solo conoce números, `+ - * / ( ) %` y unos pocos sufijos; cualquier otra cosa es
 * un error con la ficha que no entendió.
 */
import { nxFormat } from "../../core/locale";
import type { NumberAlign, NumberErrorCode, NumberFormat, NumberLabels, NumberReading, WordsCurrency } from "./types";

/** Más allá, un `number` ya no guarda los pesos exactos (2^53 ≈ 9 × 10^15). */
export const NUMBER_LIMIT = 1e15;

/**
 * Quita la basura de coma flotante (0,1 + 0,2) y el −0. Con 15 cifras significativas, pero nunca
 * menos de dos decimales: desde 10^13 los centavos no caben en 15 cifras y se perderían.
 */
export function tidy(n: number): number {
  if (!Number.isFinite(n)) return n;
  const int = n ? Math.floor(Math.log10(Math.abs(n))) + 1 : 1;
  const v = Number(n.toPrecision(Math.min(17, Math.max(15, int + 2))));
  return v === 0 ? 0 : v;
}

/** Redondea a `d` decimales, bien también en los casos de siempre (1,005 → 1,01). */
export function roundTo(n: number, d: number): number {
  const f = 10 ** d;
  const m = Math.abs(n) * f;
  // Desde 10^15 un `number` ya no tiene decimales que limpiar: `toPrecision(15)` se comería cifras.
  const v = (Math.sign(n) * Math.round(m >= 1e15 ? m : Number(m.toPrecision(15)))) / f;
  // Un entero entre una potencia de 10 da el decimal más cercano: no hace falta `tidy`.
  return v === 0 ? 0 : v;
}

/**
 * El número en formato de máquina, sin exponente: «1450000.5», «0.0000001» (no «1e-7»). Es lo que
 * va al <form>.
 */
export function machineText(n: number): string {
  const s = String(n);
  return /e/i.test(s) && Math.abs(n) < 1 ? n.toFixed(20).replace(/\.?0+$/, "") : s;
}

// ---------------------------------------------------------------- limpiar lo que llega (BDUI)

/**
 * Un número finito, o un texto en formato de máquina («1450000.5»); lo demás es `null`. Desde
 * `NUMBER_LIMIT` (mil billones) tampoco: «1e21» no es un monto que el campo pueda guardar.
 */
export function cleanNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\s*-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i.test(v) ? Number(v) : NaN;
  return Number.isFinite(n) && Math.abs(n) < NUMBER_LIMIT ? n : null;
}

export function cleanFormat(v: unknown): NumberFormat {
  return v === "money" || v === "percent" ? v : "number";
}

export function cleanAlign(v: unknown, format: NumberFormat): NumberAlign {
  return v === "start" || v === "center" || v === "end" ? v : format === "number" ? "start" : "end";
}

/** Un código ISO («cop» → «COP») o un símbolo corto sin cifras («$», «US$», «€»). */
export function cleanCurrency(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (/^[a-z]{3}$/i.test(t)) return t.toUpperCase();
  return t && t.length <= 4 && !/[\d\s<>"'&]/.test(t) ? t : undefined;
}

/** Decimales: un entero entre 0 y 10. */
export function cleanDecimals(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 10 ? n : undefined;
}

/** Los textos: solo las claves conocidas y con texto. */
export function cleanLabels(v: unknown, defaults: NumberLabels): NumberLabels {
  const out = { ...defaults };
  if (v && typeof v === "object") {
    for (const k of Object.keys(defaults) as (keyof NumberLabels)[]) {
      const x = Object.prototype.hasOwnProperty.call(v, k) ? (v as Record<string, unknown>)[k] : undefined;
      if (typeof x === "string" && x) out[k] = x;
    }
  }
  return out;
}

// ---------------------------------------------------------------- leer lo que se escribe

type Op = "+" | "-" | "*" | "/";
type Tok = { t: "num"; v: number; raw: string } | { t: "op"; v: Op } | { t: "(" } | { t: ")" } | { t: "%" } | { t: "mul"; v: number; raw: string };

class Fail {
  constructor(
    readonly error: NumberErrorCode,
    readonly token?: string,
  ) {}
}

const isEnglish = (locale: string) => /^en\b/i.test(locale);

/** Paréntesis anidados que se aceptan: más no es una cuenta, y la recursión no se desborda. */
const MAX_DEPTH = 100;

/**
 * Cifras de otros sistemas a 0–9: «١٢٣» (árabe), «۱۲۳» (persa), «１２３» (ancho completo). Las
 * cifras de un sistema son 10 seguidas en Unicode: la posición en su tramo es su valor. También
 * los separadores árabes («٫» decimal, «٬» de miles, «٪») y las marcas de dirección.
 */
export function latinDigits(s: string): string {
  return s
    .replace(/\p{Nd}/gu, (c) => {
      let cp = c.codePointAt(0)!;
      let k = 0;
      while (k < 60 && /\p{Nd}/u.test(String.fromCodePoint(cp - 1))) cp--, k++;
      return String(k % 10);
    })
    .replace(/\u066b/g, ".")
    .replace(/\u066c/g, ",")
    .replace(/\u066a/g, "%")
    .replace(/[\u200e\u200f\u061c]/g, "");
}

/**
 * Los sufijos que multiplican. «m» y «M» son millón (el «mil» se escribe entero). «mm» es la
 * ambigüedad clásica: en Colombia (y en español en general) se lee «miles de millones»
 * (1.000 millones), mientras que en las finanzas en inglés «MM» es un millón (M romana × M
 * romana). Se resuelve por el locale: 10^9 en español, 10^6 en inglés.
 */
function multiplier(word: string, locale: string): number | undefined {
  switch (word) {
    case "k":
    case "mil":
    case "miles":
    case "thousand":
      return 1e3;
    case "m":
    case "mill":
    case "millon":
    case "millones":
    case "million":
    case "millions":
      return 1e6;
    case "mm":
      return isEnglish(locale) ? 1e6 : 1e9;
    case "millardo":
    case "millardos":
    case "bn":
    case "billion":
    case "billions":
      return 1e9;
    case "b":
      return isEnglish(locale) ? 1e9 : undefined;
    case "billon":
    case "billones":
      return 1e12;
    default:
      return undefined;
  }
}

/**
 * Un número escrito con separadores. Se apoya en `nxFormat(locale).parse` («1.234,5» en español,
 * «1,234.5» en inglés) y lo hace más tolerante para lo que se pega: si aparecen los dos signos, el
 * último es el decimal («1,450,000.00» también en español); si uno se repite, es de miles
 * («1.450.000» también en inglés).
 */
function readLiteral(raw: string, locale: string): number | null {
  const dots = raw.split(".").length - 1;
  const commas = raw.split(",").length - 1;
  let t: string | null = null;
  if (dots && commas) {
    const dec = raw.lastIndexOf(".") > raw.lastIndexOf(",") ? "." : ",";
    const grp = dec === "." ? "," : ".";
    if (raw.split(dec).length === 2) t = raw.split(grp).join("").replace(dec, ".");
  } else if (dots > 1 || commas > 1) {
    t = raw.replace(/[.,]/g, "");
  }
  if (t !== null) {
    const n = t && t !== "." ? Number(t) : NaN;
    return Number.isFinite(n) ? n : null;
  }
  return raw.replace(/[.,]/g, "") ? nxFormat(locale).parse(raw) : null;
}

function tokenize(s: string, locale: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") {
      i++;
    } else if (/[\d.,]/.test(c)) {
      // Cifras y separadores; un espacio o un apóstrofo entre grupos de tres también es de miles
      // («1 450 000», «1'450'000»: lo que sale de Excel o de un PDF).
      let j = i;
      let raw = "";
      while (j < s.length) {
        const d = s[j];
        if (/[\d.,]/.test(d)) raw += d;
        else if (!((d === " " || d === "'") && /\d$/.test(raw) && /^\d{3}(?!\d)/.test(s.slice(j + 1)))) break;
        j++;
      }
      const v = readLiteral(raw, locale);
      if (v === null) throw new Fail("unknown", raw);
      out.push({ t: "num", v, raw });
      i = j;
    } else if ("+-*/".includes(c)) {
      out.push({ t: "op", v: c as Op });
      i++;
    } else if (c === "(" || c === ")" || c === "%") {
      out.push({ t: c });
      i++;
    } else if (/[$€£¥₡₲₱₩₹¢]/.test(c)) {
      i++; // un símbolo de moneda pegado con el monto
    } else if (/\p{L}/u.test(c)) {
      const word = /^\p{L}+/u.exec(s.slice(i))![0];
      const low = word.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
      const m = multiplier(low, locale);
      if (m) out.push({ t: "mul", v: m, raw: word });
      // «450x3», y «x2» al comienzo (relativa).
      else if (low === "x" && (out.length ? /^(num|mul|%|\))$/.test(out[out.length - 1].t) : /^\s*[\d(.,]/.test(s.slice(i + 1)))) out.push({ t: "op", v: "*" });
      else if (!/^[A-Z]{2,3}$/.test(word)) throw new Fail("unknown", word); // «COP», «USD», el «US» de «US$»: se ignoran
      i += word.length;
    } else {
      throw new Fail("unknown", c);
    }
  }
  return out;
}

interface Val {
  v: number;
  /** Viene de un «%»: al sumar o restar es un porcentaje de lo de la izquierda (15% de a). */
  pct: boolean;
}

/**
 * La gramática, de menor a mayor precedencia:
 *   expr    := term (("+" | "-") term)*
 *   term    := unary (("*" | "/") unary)*
 *   unary   := ("+" | "-") unary | postfix
 *   postfix := primary sufijo* "%"?
 *   primary := número | "(" expr ")"
 * El «%» funciona como en una calculadora: «a + 15%» es a × 1,15; «a × 15%» es a × 0,15; solo, 0,15.
 * Con `unit` (el modo porcentaje, donde se escribe en puntos) el «%» no cambia nada.
 */
function evalTokens(toks: Tok[], unit: boolean): number {
  let i = 0;
  const peek = () => toks[i];
  const expr = (): Val => {
    let left = term();
    for (let t = peek(); t?.t === "op" && (t.v === "+" || t.v === "-"); t = peek()) {
      i++;
      const r = term();
      const rv = r.pct ? left.v * r.v : r.v;
      left = { v: t.v === "+" ? left.v + rv : left.v - rv, pct: false };
    }
    return left;
  };
  const term = (): Val => {
    let left = unary();
    for (let t = peek(); t?.t === "op" && (t.v === "*" || t.v === "/"); t = peek()) {
      i++;
      const r = unary();
      if (t.v === "/" && r.v === 0) throw new Fail("divZero");
      left = { v: t.v === "*" ? left.v * r.v : left.v / r.v, pct: false };
    }
    return left;
  };
  // Sin recursión: «=------1» no gasta la pila.
  const unary = (): Val => {
    let neg = false;
    for (let t = peek(); t?.t === "op" && (t.v === "-" || t.v === "+"); t = peek()) {
      i++;
      if (t.v === "-") neg = !neg;
    }
    const u = postfix();
    return neg ? { v: -u.v, pct: u.pct } : u;
  };
  let depth = 0;
  const postfix = (): Val => {
    const p = primary();
    for (let t = peek(); t?.t === "mul"; t = peek()) {
      i++;
      p.v *= t.v;
    }
    if (peek()?.t === "%") {
      i++;
      if (!unit) return { v: p.v / 100, pct: true };
    }
    return p;
  };
  const primary = (): Val => {
    const t = toks[i++];
    if (!t) throw new Fail("incomplete");
    if (t.t === "num") return { v: t.v, pct: false };
    if (t.t === "(") {
      if (++depth > MAX_DEPTH) throw new Fail("paren");
      const v = expr();
      depth--;
      if (toks[i++]?.t !== ")") throw new Fail("paren");
      return { v: v.v, pct: false };
    }
    // «=()» o «=(1+)»: falta un número antes del paréntesis; «=)» sobra.
    if (t.t === ")") throw new Fail(toks[i - 2] ? "incomplete" : "paren");
    if (t.t === "mul") throw new Fail("unknown", t.raw);
    throw new Fail("incomplete");
  };
  const out = expr();
  const rest = toks[i];
  if (rest) throw rest.t === ")" ? new Fail("paren") : rest.t === "num" ? new Fail("unknown", rest.raw) : new Fail("incomplete");
  return out.v;
}

/**
 * Un número sin cuenta: el literal con su sufijo y su «%», y las formas de escribir un negativo que
 * llegan pegadas de Excel o de un extracto: «-1.200», «(1.200)» (contable) y «1.200-» (SAP).
 */
function evalPlain(toks: Tok[], unit: boolean): { v: number; calc: boolean } {
  let neg = false;
  let calc = false;
  let t = toks;
  const last = t[t.length - 1];
  if (t.length > 1 && last.t === "op" && last.v === "-") {
    t = t.slice(0, -1);
    neg = true;
    calc = true;
  }
  const first = t[0];
  if (first?.t === "op" && (first.v === "-" || first.v === "+")) {
    t = t.slice(1);
    if (first.v === "-") neg = !neg;
  }
  if (t[0]?.t === "(" && t[t.length - 1]?.t === ")") {
    t = t.slice(1, -1);
    neg = !neg;
    calc = true;
  }
  if (!t.length) throw new Fail("incomplete");
  const bad = t.findIndex((x, k) => (k === 0 ? x.t !== "num" : !(x.t === "mul" || (x.t === "%" && k === t.length - 1))));
  if (bad >= 0) {
    if (t.some((x) => x.t === "op" || x.t === "(" || x.t === ")")) throw new Fail("needEquals");
    const x = t[bad];
    throw x.t === "num" || x.t === "mul" ? new Fail("unknown", x.raw) : new Fail("incomplete");
  }
  let v = (t[0] as { v: number }).v;
  for (const x of t.slice(1)) {
    if (x.t === "mul") v *= x.v;
    else if (unit) continue; // en modo porcentaje el «%» solo acompaña
    else v /= 100;
    calc = true;
  }
  return { v: neg ? -v : v, calc };
}

export interface EvaluateOptions {
  /** Locale de lo que se escribe («es-CO» por defecto). */
  locale?: string;
  /** Con `percent` se escribe en puntos («19» o «19 %») y el valor es la fracción (0,19). */
  format?: NumberFormat;
  /** El valor anterior, para «+15%», «*2», «/12». */
  base?: number | null;
}

/**
 * Lo que alguien escribió en un campo numérico, entendido:
 *
 * - Un número en el formato del locale, con lo que traiga pegado: «$ 1.450.000,00», «USD 1,200.50»,
 *   «1 450 000», «(1.200)» (negativo contable), «1.200-».
 * - Sufijos: «2,5k», «3 mil», «1,5M», «2 millones», «4 mm» (ver `multiplier`), «15%».
 * - Cuentas si empiezan con «=»: «=450*3», «=1.200.000/12», «=(3+2)*1,5k».
 * - Relativas al valor anterior (`base`) si empiezan por un operador: «+15%», «-10%», «*2», «/12»,
 *   «+50.000». Un «-» al comienzo es un negativo, salvo que termine en «%» («-10%»: descuento).
 *   En modo porcentaje no hay relativas: «+5» es 5 %.
 */
export function evaluate(text: string, opts: EvaluateOptions = {}): NumberReading {
  const locale = opts.locale || "es-CO";
  const unit = opts.format === "percent";
  const base = opts.base === null || opts.base === undefined || !Number.isFinite(opts.base) ? null : unit ? opts.base * 100 : opts.base;
  const s = latinDigits(String(text ?? ""))
    .replace(/[    \t\r\n]/g, " ")
    .replace(/[−‒–—]/g, "-")
    .replace(/[×·]/g, "*")
    .replace(/÷/g, "/")
    .trim();
  if (!s) return { ok: true, value: null, calc: false };
  try {
    let v: number;
    let calc = true;
    if (s.startsWith("=")) {
      const toks = tokenize(s.slice(1), locale);
      if (!toks.length) throw new Fail("incomplete");
      v = evalTokens(toks, unit);
    } else {
      const toks = tokenize(s, locale);
      if (!toks.length) throw new Fail("incomplete");
      const head = toks[0];
      const pctTail = toks[toks.length - 1].t === "%";
      const relative = !unit && head.t === "op" && (head.v !== "-" || pctTail) && (head.v !== "+" || base !== null || pctTail) && toks.length > 1;
      if (relative) {
        if (base === null) throw new Fail("noBase");
        v = evalTokens([{ t: "num", v: base, raw: "" }, ...toks], unit);
      } else {
        ({ v, calc } = evalPlain(toks, unit));
      }
    }
    if (!Number.isFinite(v) || Math.abs(v) >= NUMBER_LIMIT * (unit ? 100 : 1)) throw new Fail("tooBig");
    return { ok: true, value: tidy(unit ? v / 100 : v), calc };
  } catch (e) {
    if (e instanceof Fail) return e.token ? { ok: false, error: e.error, token: e.token } : { ok: false, error: e.error };
    // Nunca lanza: lo que se escribe no puede romper el campo (ni un backend que lo use).
    return { ok: false, error: "unknown", token: s.length > 12 ? `${s.slice(0, 12)}…` : s };
  }
}

/** El mensaje de un error, con la ficha que no se entendió. */
export function errorText(r: Extract<NumberReading, { ok: false }>, labels: NumberLabels): string {
  return labels[r.error].replace("{token}", r.token ?? "");
}

// ---------------------------------------------------------------- límites y pasos

/** El valor dentro de `min`–`max`, y cuál de los dos lo recortó. */
export function clampValue(v: number, min: number | null, max: number | null): { value: number; clamped: "min" | "max" | null } {
  if (min !== null && v < min) return { value: min, clamped: "min" };
  if (max !== null && v > max) return { value: max, clamped: "max" };
  return { value: v, clamped: null };
}

/**
 * ↑/↓: suma o resta `step` (en las unidades que se ven: puntos en porcentaje). Mayús multiplica por
 * 10 y Alt divide por 10. Sin valor, parte de 0 (o del límite más cercano).
 */
export function stepValue(v: number | null, dir: 1 | -1, step: number, mods: { shift?: boolean; alt?: boolean } = {}): number {
  const s = step * (mods.shift ? 10 : 1) * (mods.alt ? 0.1 : 1);
  return tidy((v ?? 0) + dir * s);
}

// ---------------------------------------------------------------- formatear

export interface FormatOptions {
  locale?: string;
  format?: NumberFormat;
  /** ISO («COP», «USD») o un símbolo («$»). Solo en `money`; sin él, «$». */
  currency?: string;
  decimals?: number;
}

const nfCache = new Map<string, Intl.NumberFormat>();
function nf(locale: string, o: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(o)}`;
  let f = nfCache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, o);
    } catch {
      f = new Intl.NumberFormat("es-CO", { ...o, style: o.style === "currency" ? "decimal" : o.style });
    }
    nfCache.set(key, f);
  }
  return f;
}
const space = (s: string) => s.replace(/[  ]/g, " ");
const iso = (c: string | undefined) => (c && /^[A-Z]{3}$/.test(c) ? c : undefined);

/** Los decimales que se muestran (y a los que se redondea al confirmar), en las unidades que se ven. */
export function maxDecimals(format: NumberFormat, decimals?: number): number {
  return decimals ?? (format === "number" ? 6 : 2);
}

/** El valor redondeado a lo que se muestra (en porcentaje, la fracción a dos decimales más). */
export function roundValue(v: number, o: FormatOptions): number {
  const f = cleanFormat(o.format);
  return roundTo(v, maxDecimals(f, o.decimals) + (f === "percent" ? 2 : 0));
}

/**
 * Lo que queda escrito en el campo: el número con los separadores del locale y sin símbolo (el
 * símbolo va aparte, al lado): «1.450.000», «1.200,50», «19». En porcentaje, en puntos.
 */
export function formatEdit(v: number, o: FormatOptions = {}): string {
  const f = cleanFormat(o.format);
  const max = maxDecimals(f, o.decimals);
  const n = f === "percent" ? tidy(v * 100) : v;
  // Un monto con centavos los muestra todos («1.200,50», no «1.200,5»).
  const min = f === "money" && roundTo(n, max) % 1 !== 0 ? max : 0;
  // Siempre con cifras latinas (en ar-EG saldría «١٬٢٣٤٫٥»): es lo que se edita y se vuelve a leer.
  return space(nf(o.locale || "es-CO", { minimumFractionDigits: min, maximumFractionDigits: max, numberingSystem: "latn" }).format(n));
}

/** El símbolo que acompaña al campo y de qué lado va, según el locale: «$» antes, «€» o «%» después. */
export function affixes(o: FormatOptions = {}): { prefix: string; suffix: string } {
  const f = cleanFormat(o.format);
  const locale = o.locale || "es-CO";
  if (f === "number") return { prefix: "", suffix: "" };
  const code = iso(o.currency);
  if (f === "money" && !code) return { prefix: o.currency || "$", suffix: "" };
  const parts = nf(locale, f === "money" ? { style: "currency", currency: code, currencyDisplay: "symbol" } : { style: "percent" }).formatToParts(1);
  const k = parts.findIndex((p) => p.type === "currency" || p.type === "percentSign");
  if (k < 0) return { prefix: "", suffix: "" };
  const sym = parts[k].value;
  return k < parts.findIndex((p) => p.type === "integer") ? { prefix: sym, suffix: "" } : { prefix: "", suffix: sym };
}

/** El valor completo, como se lee en un documento: «$ 1.450.000», «US$ 1.200,50», «19 %», «1,234.5». */
export function formatText(v: number | null, o: FormatOptions = {}): string {
  if (v === null || !Number.isFinite(v)) return "";
  const f = cleanFormat(o.format);
  const edit = formatEdit(v, o);
  if (f === "number") return edit;
  const code = iso(o.currency);
  if (f === "money" && !code) return `${o.currency || "$"} ${edit}`;
  const max = maxDecimals(f, o.decimals);
  const opts: Intl.NumberFormatOptions =
    f === "money"
      ? { style: "currency", currency: code, currencyDisplay: "symbol", minimumFractionDigits: roundTo(v, max) % 1 ? max : 0, maximumFractionDigits: max }
      : { style: "percent", minimumFractionDigits: 0, maximumFractionDigits: max };
  return space(nf(o.locale || "es-CO", opts).format(v));
}

// ---------------------------------------------------------------- en letras

/** Monedas que se nombran en letras. Todas masculinas: la concordancia es la de «un peso», «doscientos dólares». */
export const WORDS_CURRENCIES: Record<string, WordsCurrency> = {
  COP: { one: "peso", many: "pesos", tail: "m/cte" },
  USD: { one: "dólar", many: "dólares" },
  EUR: { one: "euro", many: "euros" },
  MXN: { one: "peso mexicano", many: "pesos mexicanos" },
  CLP: { one: "peso chileno", many: "pesos chilenos" },
  ARS: { one: "peso argentino", many: "pesos argentinos" },
  PEN: { one: "sol", many: "soles" },
  BRL: { one: "real", many: "reales" },
};

const UNITS = "cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve".split(" ");
const TENS = ",,,treinta,cuarenta,cincuenta,sesenta,setenta,ochenta,noventa".split(",");
const HUNDREDS = ",ciento,doscientos,trescientos,cuatrocientos,quinientos,seiscientos,setecientos,ochocientos,novecientos".split(",");

/** 1–99. `short`: «un»/«veintiún»/«treinta y un» delante de un sustantivo (pesos, mil, millones). */
function upTo99(n: number, short: boolean): string {
  if (n < 30) return short && n === 1 ? "un" : short && n === 21 ? "veintiún" : UNITS[n];
  const u = n % 10;
  return u ? `${TENS[Math.floor(n / 10)]} y ${short && u === 1 ? "un" : UNITS[u]}` : TENS[n / 10];
}
/** 1–999: «cien» solo, «ciento» con algo detrás. */
function upTo999(n: number, short: boolean): string {
  if (n === 100) return "cien";
  const r = n % 100;
  return [HUNDREDS[Math.floor(n / 100)], r ? upTo99(r, short) : ""].filter(Boolean).join(" ");
}
/** 1–999.999: «mil», no «un mil»; «veintiún mil». */
function upTo999999(n: number, short: boolean): string {
  const th = Math.floor(n / 1000);
  const r = n % 1000;
  return [th === 0 ? "" : th === 1 ? "mil" : `${upTo999(th, true)} mil`, r ? upTo999(r, short) : ""].filter(Boolean).join(" ");
}
/** Un entero hasta 999 billones, en escala larga (millón = 10^6, billón = 10^12). */
function integerWords(n: number, short: boolean): string {
  if (n === 0) return "cero";
  const bill = Math.floor(n / 1e12);
  const mill = Math.floor(n / 1e6) % 1e6;
  const rest = n % 1e6;
  return [
    bill ? (bill === 1 ? "un billón" : `${upTo999999(bill, true)} billones`) : "",
    mill ? (mill === 1 ? "un millón" : `${upTo999999(mill, true)} millones`) : "",
    rest ? upTo999999(rest, short) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Un monto en letras, como se escribe en un cheque o una factura:
 *   1450000, {currency: "COP"} → «un millón cuatrocientos cincuenta mil pesos m/cte»
 *   1000000, {currency: "COP"} → «un millón de pesos m/cte»
 *   21, {currency: "USD"}      → «veintiún dólares»;  21 → «veintiuno»
 *   1200.5, {currency: "COP"}  → «mil doscientos pesos con 50/100 m/cte»
 * Los centavos van como fracción «con NN/100». `currency` es un código de `WORDS_CURRENCIES` o una
 * moneda propia `{one, many, tail?}`; sin ella, solo el número. Desde mil billones devuelve «».
 */
export function numberToWords(n: number, opts: { currency?: string | WordsCurrency } = {}): string {
  if (!Number.isFinite(n) || Math.abs(n) >= NUMBER_LIMIT) return "";
  const c = opts.currency;
  const cur = typeof c === "string" ? WORDS_CURRENCIES[c.toUpperCase()] : c && typeof c.one === "string" && typeof c.many === "string" ? c : undefined;
  const abs = Math.abs(n);
  let int = Math.floor(abs);
  let cents = Math.round(Number(((abs - int) * 100).toPrecision(12)));
  if (cents === 100) {
    int++;
    cents = 0;
  }
  const out = [n < 0 && (int || cents) ? "menos" : "", integerWords(int, !!cur)];
  // «un millón de pesos», «dos mil millones de pesos»; pero «un millón cien pesos».
  if (cur) out.push(`${int >= 1e6 && int % 1e6 === 0 ? "de " : ""}${int === 1 ? cur.one : cur.many}`);
  if (cents) out.push(`con ${String(cents).padStart(2, "0")}/100`);
  if (cur?.tail) out.push(cur.tail);
  return out.filter(Boolean).join(" ");
}

/**
 * La moneda para las letras: el código ISO si es uno conocido; «$» (o nada) en un locale colombiano
 * se lee como pesos.
 */
export function wordsCurrency(currency: string | undefined, locale: string): string | undefined {
  if (currency && WORDS_CURRENCIES[currency]) return currency;
  return (!currency || currency === "$") && /-CO\b/i.test(locale) ? "COP" : undefined;
}
