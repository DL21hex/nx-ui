/**
 * Filtro en lenguaje natural, local y sin modelo: convierte una frase en filtros normales
 * (`GridFilter`) que la persona ve como chips y puede corregir. El vocabulario sale de las columnas
 * declaradas y de los datos: valores de estado y categorías, nombres de meses, y comparaciones
 * numéricas («más de 5 millones», «atraso mayor a 3», «entre 1 y 2 millones»).
 *
 * Lo que no entiende lo devuelve aparte, para que la interfaz lo diga en vez de ignorarlo.
 */
import { foldText } from "../../core/text";
import { colType, isNumeric, parseNumber } from "./logic";
import type { GridColumn, GridFilter, GridRow } from "./types";

const MONTH_NAMES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const STOP = new Set(
  "de del la las el los y o con que en a por para un una unos unas al mas menos mayor mayores menor menores que entre sin no excepto todos todas mis me muestra muestrame dame ver solo solamente cuyo cuya cuyos cuyas este esta estos estas".split(" "),
);
const NEG = /(?:^|\s)(sin|no|excepto|menos los|salvo)\s+$/;

/** Singular aproximado: «pendientes» → «pendiente», «aprobados» → «aprobado». */
const stem = (w: string) => w.replace(/(es|s)$/, "");

export interface NlResult {
  filters: GridFilter[];
  /** Palabras que no se pudieron interpretar (sin las vacías). */
  unknown: string[];
}

/** Los valores de texto de una columna que valen como vocabulario (opciones, o pocos distintos). */
function vocabulary(c: GridColumn, rows: readonly GridRow[]): { value: string; words: string }[] {
  if (c.options) return c.options.flatMap((o) => [{ value: o.value, words: foldText(o.value) }, ...(o.label ? [{ value: o.value, words: foldText(o.label) }] : [])]);
  if (colType(c) !== "text") return [];
  const seen = new Set<string>();
  for (let i = 0; i < rows.length && i < 5000; i++) {
    const v = rows[i][c.key];
    if (typeof v === "string" && v.trim()) seen.add(v);
    if (seen.size > 60) return [];
  }
  return [...seen].map((v) => ({ value: v, words: foldText(v) }));
}

/** Busca una frase del vocabulario en la consulta, como palabras completas (con plurales). */
function findPhrase(q: string, words: string): number {
  const first = words.split(" ")[0];
  if (first.length < 3) return -1;
  // La primera palabra de la categoría basta si es distintiva («aceros» → «Aceros del Caribe»).
  const candidates = [words, stem(words), first.length >= 5 ? first : "", first.length >= 5 ? stem(first) : ""].filter(Boolean);
  for (const c of candidates) {
    const re = new RegExp(`(?:^|\\s)${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:es|s)?(?=\\s|$)`);
    const m = re.exec(q);
    if (m) return m.index + (m[0].startsWith(" ") ? 1 : 0);
  }
  return -1;
}

const UNIT = String.raw`(millones|millon|mill|m|mil|k)?`;
const NUM = String.raw`\$?\s*([\d][\d.,]*)\s*${UNIT}`;
const COMPARE = new RegExp(
  String.raw`(mas de|mayor(?:es)? (?:a|que|de)|superior(?:es)? a|por encima de|>=?|menos de|menor(?:es)? (?:a|que|de)|inferior(?:es)? a|por debajo de|<=?|entre)\s*${NUM}(?:\s*(?:y|a|-)\s*${NUM})?`,
  "g",
);

function scale(n: number, unit: string | undefined): number {
  if (!unit) return n;
  if (unit.startsWith("m") && unit !== "mil") return n * 1e6;
  return n * 1e3;
}

export function parseNL(query: string, columns: readonly GridColumn[], rows: readonly GridRow[]): NlResult {
  const q = ` ${foldText(query).replace(/[¿?¡!,;:]/g, " ").replace(/\s+/g, " ").trim()} `;
  const used: [number, number][] = [];
  const filters: GridFilter[] = [];
  const take = (at: number, len: number) => used.push([at, at + len]);

  // 1. Texto entre comillas: «contiene» en la primera columna de texto libre.
  const quoted = /[«"“]([^»"”]+)[»"”]/.exec(query);
  if (quoted) {
    const c = columns.find((x) => colType(x) === "text" && !x.options);
    if (c) filters.push({ key: c.key, op: "contains", value: quoted[1].trim() });
  }

  // 2. Comparaciones numéricas; la columna es la que se nombra justo antes, o la de dinero.
  for (const m of q.matchAll(COMPARE)) {
    const [whole, op, n1, u1, n2, u2] = m;
    const a = parseNumber(n1);
    if (a === null) continue;
    const before = q.slice(Math.max(0, m.index! - 28), m.index);
    const named = columns.find((c) => isNumeric(c) && before.includes(foldText(c.label).split(" ")[0]));
    const money = columns.find((c) => colType(c) === "money");
    const target = named ?? (u1 || u2 || whole.includes("$") ? (money ?? columns.find(isNumeric)) : (columns.find((c) => colType(c) === "number") ?? money));
    if (!target) continue;
    const va = scale(a, u1 ?? u2);
    if (op === "entre" && n2) {
      const b = parseNumber(n2);
      if (b !== null) filters.push({ key: target.key, op: "range", min: va, max: scale(b, u2 ?? u1) });
    } else if (/^(mas|mayor|superior|por encima|>)/.test(op)) filters.push({ key: target.key, op: "range", min: op === ">=" ? va : va + (Number.isInteger(va) ? 1 : 0.01) });
    else filters.push({ key: target.key, op: "range", max: op === "<=" ? va + 1 : va });
    take(m.index!, whole.length);
    if (named) take(m.index! - before.length + before.lastIndexOf(foldText(named.label).split(" ")[0]), foldText(named.label).split(" ")[0].length);
  }

  // 3. Meses (y año) sobre la primera columna de fecha.
  const dateCol = columns.find((c) => colType(c) === "date");
  if (dateCol) {
    const months = MONTH_NAMES.map((m, i) => ({ i, at: q.indexOf(` ${m} `) })).filter((x) => x.at >= 0);
    const year = /\b(20\d{2})\b/.exec(q)?.[1];
    if (months.length || year) {
      const y =
        year ??
        String(
          Math.max(
            ...rows
              .slice(0, 5000)
              .map((r) => Number(String(r[dateCol.key] ?? "").slice(0, 4)))
              .filter(Number.isFinite),
          ),
        );
      const pad = (n: number) => String(n + 1).padStart(2, "0");
      if (months.length) {
        const lo = Math.min(...months.map((m) => m.i));
        const hi = Math.max(...months.map((m) => m.i));
        filters.push({ key: dateCol.key, op: "range", min: `${y}-${pad(lo)}-01`, max: hi === 11 ? `${Number(y) + 1}-01-01` : `${y}-${pad(hi + 1)}-01` });
        months.forEach((m) => take(m.at + 1, MONTH_NAMES[m.i].length));
      } else filters.push({ key: dateCol.key, op: "range", min: `${y}-01-01`, max: `${Number(y) + 1}-01-01` });
      if (year) take(q.indexOf(year), 4);
    }
  }

  // 4. Valores de estado y categorías («pendientes», «aceros»), con «sin» / «no» / «excepto».
  for (const c of columns) {
    const inc: string[] = [];
    const exc: string[] = [];
    for (const { value, words } of vocabulary(c, rows)) {
      const at = findPhrase(q, words);
      if (at < 0 || inc.includes(value) || exc.includes(value)) continue;
      (NEG.test(q.slice(0, at)) ? exc : inc).push(value);
      take(at, words.length);
    }
    if (inc.length) filters.push({ key: c.key, op: "in", values: inc });
    if (exc.length) filters.push({ key: c.key, op: "notIn", values: exc });
  }

  // Lo que sobra (sin palabras vacías ni lo ya interpretado).
  const unknown: string[] = [];
  for (const m of q.matchAll(/\S+/g)) {
    const w = m[0];
    const inside = used.some(([a, b]) => m.index! >= a - 1 && m.index! < b);
    if (!inside && !STOP.has(w) && !/^\d/.test(w) && !NEG.test(` ${w} `) && w.length > 2 && !quoted?.[1].toLowerCase().includes(w)) unknown.push(w);
  }
  return { filters, unknown };
}
