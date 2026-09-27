/**
 * Lógica pura de `<nx-import>`, sin DOM: leer el texto (codificación, separador, comillas), hallar
 * la fila de encabezados, asociar las columnas del archivo a los campos de destino (por nombre y por
 * contenido), recordar ese mapeo, normalizar y validar cada fila, y armar el CSV de lo que no entró.
 *
 * Todo es lineal en el tamaño del archivo (50.000 filas × 15 columnas en una fracción de segundo) y
 * sin expresiones regulares que puedan dispararse: los patrones van anclados y sin anidar.
 */
import { canonicalLocale, nxFormat } from "../../core/locale";
import { foldText } from "../../core/text";
import { nitCheckDigit } from "../paste-fill/logic";
import type { ImportCell, ImportColumn, ImportMapping, ImportMatch, ImportMessages, ImportOption, ImportRowCheck, ImportTable, ImportType } from "./types";

export const IMPORT_MESSAGES: ImportMessages = {
  required: "Falta este dato",
  number: "No es un número",
  date: "No es una fecha válida",
  email: "No es un correo válido",
  phone: "No es un teléfono válido",
  nit: "No es un NIT válido",
  nitDv: "El dígito de verificación no cuadra: debería ser {dv}",
  bool: "Escribe sí o no",
  option: "No está en la lista",
  min: "Debe ser al menos {min}",
  max: "Debe ser como mucho {max}",
  pattern: "No tiene el formato esperado",
  duplicate: "Repetido: ya está en la fila {line}",
  rejectedRow: "Rechazada por el servidor",
};

const TYPES = new Set<ImportType>(["text", "number", "money", "percent", "date", "email", "phone", "nit", "bool", "option"]);

/** «{n} filas» con sus variables; «1 fila|{n} filas» elige la forma por `n`. */
export function fmtLabel(t: string, vars: Record<string, string | number> = {}): string {
  const bar = t.indexOf("|");
  if (bar >= 0) t = String(vars.n) === "1" ? t.slice(0, bar) : t.slice(bar + 1);
  return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
export const cellText = (v: ImportCell | undefined | null): string => (v === undefined || v === null ? "" : typeof v === "number" ? String(v) : v.trim());

// ---------------------------------------------------------------- columnas

/** Las columnas válidas (de JSON o de un arreglo): `key` obligatorio y sin repetir; lo demás, si sirve. */
export function cleanColumns(v: unknown): ImportColumn[] {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  const out: ImportColumn[] = [];
  for (const raw of v as unknown[]) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const key = str(o.key);
    if (!key || out.some((c) => c.key === key)) continue;
    const options = Array.isArray(o.options) ? o.options.map(cleanOption).filter((x): x is ImportOption => !!x) : undefined;
    const type = TYPES.has(o.type as ImportType) ? (o.type as ImportType) : options?.length ? "option" : "text";
    const c: ImportColumn = { key, label: str(o.label) ?? key, type };
    if (o.required === true) c.required = true;
    if (o.unique === true) c.unique = true;
    if (options?.length) c.options = options;
    if (Array.isArray(o.aliases)) c.aliases = o.aliases.filter((a): a is string => typeof a === "string" && !!a.trim());
    for (const k of ["min", "max"] as const) {
      const x = o[k];
      if ((typeof x === "number" && Number.isFinite(x)) || (typeof x === "string" && x.trim())) c[k] = x as number | string;
    }
    if (str(o.pattern)) c.pattern = str(o.pattern);
    if (str(o.hint)) c.hint = str(o.hint);
    out.push(c);
  }
  return out;
}
function cleanOption(x: unknown): ImportOption | null {
  const s = str(x);
  if (s) return { value: s, label: s };
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const value = str(o.value);
  return value ? { value, label: str(o.label) ?? value } : null;
}

// ---------------------------------------------------------------- texto y CSV

/**
 * Los bytes de un archivo de texto → texto. Quita el BOM (UTF-8 o UTF-16, el «Texto Unicode» de
 * Excel); UTF-8, y si trae bytes inválidos, windows-1252 (el CSV de Excel en español: «Bogotá» no
 * queda como «Bogot�»).
 */
export function decodeBytes(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    // 0x80–0x9F son «–», «€», comillas… (Node 22 los deja como controles de latin1; el navegador no).
    return new TextDecoder("windows-1252").decode(b).replace(/[\x80-\x9f]/g, (c) => CP1252[c.charCodeAt(0) - 128]);
  }
}
const CP1252 = "€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8dŽ\x8f\x90‘’“”•–—˜™š›œ\x9džŸ";

const DELIMS = ["\t", ";", ",", "|"];

/** El separador que deja las filas más parejas (la misma cantidad de columnas, más de una), mirando
 *  el comienzo del texto. Sin nada claro, la coma. */
export function detectDelimiter(text: string): string {
  let sample = text.slice(0, 65536);
  const cut = sample.lastIndexOf("\n");
  if (text.length > sample.length && cut > 0) sample = sample.slice(0, cut);
  let best = ",";
  let bestScore = 0;
  for (const d of DELIMS) {
    const counts = new Map<number, number>();
    for (const row of parseCsv(sample, d).slice(0, 60)) if (row.length > 1) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    let score = 0;
    for (const [w, n] of counts) score = Math.max(score, n * 1000 + w);
    if (score > bestScore) (best = d), (bestScore = score);
  }
  return best;
}

/**
 * Un CSV (o TSV) → filas de celdas. Comillas con `""` escapadas, separadores y saltos de línea dentro
 * de comillas, `\r\n` / `\n` / `\r`, BOM. Sin `delimiter`, se detecta. Lineal: una sola pasada.
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const d = delimiter ?? detectDelimiter(text);
  const dc = d.charCodeAt(0);
  const n = text.length;
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i < n) {
    if (text.charCodeAt(i) === 34) {
      let val = "";
      i++;
      for (;;) {
        const q = text.indexOf('"', i);
        if (q < 0) {
          val += text.slice(i);
          i = n;
          break;
        }
        val += text.slice(i, q);
        if (text.charCodeAt(q + 1) === 34) {
          val += '"';
          i = q + 2;
        } else {
          i = q + 1;
          break;
        }
      }
      // Lo que sobra entre la comilla de cierre y el separador («"a"b») va pegado al valor.
      const from = i;
      while (i < n && text.charCodeAt(i) !== dc && text.charCodeAt(i) !== 10 && text.charCodeAt(i) !== 13) i++;
      row.push(val + text.slice(from, i));
    } else {
      let j = i;
      while (j < n) {
        const c = text.charCodeAt(j);
        if (c === dc || c === 10 || c === 13) break;
        j++;
      }
      row.push(text.slice(i, j));
      i = j;
    }
    if (i >= n) break;
    const c = text.charCodeAt(i);
    if (c === dc) {
      i++;
      if (i === n) row.push("");
      continue;
    }
    i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
    rows.push(row);
    row = [];
  }
  if (row.length) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------- encabezados

// Los patrones sobre celdas van con tope de largo: una celda de 1 MB no hace retroceder a ninguno.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;
const isEmail = (t: string): boolean => t.length <= 254 && EMAIL_RE.test(t);
const NUM_RE = /^[(\-+]?\s*(?:[$€£]|US\$|COP|USD)?[\d.,\s]+%?\)?-?$/i;
const numLike = (t: string): boolean => t.length <= 64 && NUM_RE.test(t) && /\d/.test(t);
const DATELIKE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/;

/** ¿Parece un nombre de columna? Texto que no es número, fecha ni correo. */
const labelLike = (v: ImportCell): boolean => {
  if (typeof v === "number") return false;
  const t = v.trim();
  return !!t && !numLike(t) && !DATELIKE.test(t) && !isEmail(t);
};
const width = (r: ImportCell[] | undefined): number => {
  let w = 0;
  if (r) for (const c of r) if (cellText(c)) w++;
  return w;
};

/**
 * La fila de encabezados (índice desde 0), aunque arriba haya títulos («Reporte de clientes –
 * septiembre») o filas vacías: la primera fila tan ancha como los datos cuya mayoría de celdas son
 * texto. −1 si la primera fila ancha ya son datos (el archivo no trae encabezados).
 */
export function detectHeaderRow(rows: ImportCell[][], look = 30): number {
  const n = Math.min(rows.length, look + 20);
  const counts = new Map<number, number>();
  for (let r = 0; r < n; r++) {
    const w = width(rows[r]);
    if (w) counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let typical = 0;
  let most = 0;
  for (const [w, k] of counts) if (k > most || (k === most && w > typical)) (typical = w), (most = k);
  const need = Math.max(1, Math.ceil(typical * 0.6));
  for (let r = 0; r < Math.min(rows.length, look); r++) {
    const w = width(rows[r]);
    if (w < need) continue;
    let texty = 0;
    for (const c of rows[r]) if (labelLike(c)) texty++;
    return texty * 2 > w ? r : -1;
  }
  return -1;
}

/** La tabla a partir de la fila de encabezados: nombres (vacíos → «»), filas de datos y su número de fila. */
export function buildTable(rows: ImportCell[][], headerRow: number): ImportTable {
  const start = headerRow + 1;
  let cols = 0;
  for (let r = Math.max(0, headerRow); r < rows.length; r++) if (rows[r].length > cols) cols = rows[r].length;
  // Las columnas vacías del final (el «;;;» de Excel) no cuentan.
  const used = new Uint8Array(cols);
  for (let r = Math.max(0, headerRow); r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) if (!used[c] && cellText(row[c])) used[c] = 1;
  }
  while (cols > 0 && !used[cols - 1]) cols--;
  const head = headerRow >= 0 ? rows[headerRow] : [];
  const headers = Array.from({ length: cols }, (_, c) => cellText(head[c]).replace(/\s+/g, " "));
  const data = rows.slice(start);
  return { headers, rows: data, lines: data.map((_, i) => start + i + 1), headerRow };
}

/** «A», «B»… «AA»: la letra de una columna, como en Excel. */
export function columnLetter(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// ---------------------------------------------------------------- mapeo

const STOP = new Set("de del la las el los y e o a en por para su sus".split(" "));
const words = (s: string): string[] =>
  foldText(s)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !STOP.has(w));
/** Un encabezado que no dice nada: vacío, «Columna 3», «Col3», «Campo 2», «F3», «Unnamed: 4». */
const GENERIC = /^(?:(?:columna|column|col|campo|field|unnamed|f)\s*\d*|[a-z]{1,2}|\d+)$/;
/** Palabras que delatan el tipo de una columna aunque el nombre no coincida. */
const TYPE_WORDS: Partial<Record<ImportType, string[]>> = {
  email: ["correo", "email", "mail", "e"],
  phone: ["telefono", "tel", "celular", "cel", "movil", "whatsapp", "fijo"],
  nit: ["nit", "rut", "cc", "cedula", "documento", "identificacion"],
  date: ["fecha", "date"],
  money: ["valor", "monto", "cupo", "precio", "total", "saldo", "credito"],
  bool: ["activo", "activa", "habilitado"],
  percent: ["porcentaje", "pct", "tasa"],
};

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}
/** Parecido entre dos textos (Dice sobre pares de letras), 0–1: tolera una letra de más o de menos. */
function dice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  let hit = 0;
  for (const [g, k] of bigrams(b)) {
    const x = ga.get(g);
    if (x) hit += Math.min(x, k);
  }
  return (2 * hit) / (a.length + b.length - 2);
}

/** Qué tanto se parece un encabezado a un campo: 1 igual (por `label`, `key` o un alias), 0,85 si
 *  todas las palabras de uno están en el otro, algo menos si se parece letra a letra o si trae una
 *  palabra típica de su tipo. */
export function nameScore(header: string, col: ImportColumn): number {
  const h = words(header);
  if (!h.length) return 0;
  const hs = h.join("");
  let best = 0;
  for (const name of [col.label, col.key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.]+/g, " "), ...(col.aliases ?? [])]) {
    const n = words(name);
    if (!n.length) continue;
    const ns = n.join("");
    if (hs === ns) return 1;
    if (n.every((w) => h.includes(w)) || h.every((w) => n.includes(w))) best = Math.max(best, 0.85);
    else best = Math.max(best, dice(hs, ns) * 0.8);
  }
  const tw = TYPE_WORDS[col.type];
  if (tw && h.some((w) => tw.includes(w))) best = Math.max(best, 0.6);
  return best;
}

/** Lo que dicen los valores de una columna del archivo (sobre las primeras 200 celdas con algo). */
export interface ColumnProfile {
  n: number;
  email: number;
  nit: number;
  date: number;
  num: number;
  money: number;
  pct: number;
  bool: number;
  phone: number;
  values: string[];
}

const BOOL_T = new Set("si s yes y x 1 true verdadero v activo activa ok ✓ ✔".split(" "));
const BOOL_F = new Set("no n 0 false falso f inactivo inactiva -".split(" "));

export function profileColumn(rows: ImportCell[][], c: number, limit = 200): ColumnProfile {
  const p: ColumnProfile = { n: 0, email: 0, nit: 0, date: 0, num: 0, money: 0, pct: 0, bool: 0, phone: 0, values: [] };
  for (let r = 0; r < rows.length && p.n < limit; r++) {
    const raw = rows[r][c];
    const t = cellText(raw);
    if (!t) continue;
    p.n++;
    p.values.push(t);
    const low = foldText(t);
    if (BOOL_T.has(low) || BOOL_F.has(low)) p.bool++;
    const nit = t.length < 30 && /^([\d.]{5,})\s*-\s*(\d)$/.exec(t);
    if (isEmail(t)) p.email++;
    else if (nit) {
      if (nitCheckDigit(nit[1]) === Number(nit[2])) p.nit++;
    } else if (typeof raw === "number" || numLike(t)) {
      p.num++;
      if (/[$€£]|cop|usd/i.test(t)) p.money++;
      if (t.endsWith("%")) p.pct++;
      const digits = t.replace(/\D/g, "");
      if (/^\+?[\d\s().-]+$/.test(t) && digits.length >= 7 && digits.length <= 13 && !/[.,]\d{1,2}$/.test(t)) p.phone++;
    }
    if (parseDate(t, true) || parseDate(t, false)) p.date++;
  }
  return p;
}

/** Qué tanto los valores de una columna del archivo son de un tipo (0 si menos del 60 %). */
export function contentScore(col: ImportColumn, p: ColumnProfile): number {
  if (!p.n) return 0;
  let hits = 0;
  switch (col.type) {
    case "email":
      hits = p.email;
      break;
    case "nit":
      hits = p.nit;
      break;
    case "date":
      hits = p.date;
      break;
    case "money":
      hits = p.money ? p.num : p.num * 0.8;
      break;
    case "number":
      hits = p.num * 0.8;
      break;
    case "percent":
      hits = p.pct ? p.num : 0;
      break;
    case "bool":
      hits = p.bool;
      break;
    case "phone":
      hits = p.phone * 0.9;
      break;
    case "option": {
      const opts = optionIndex(col);
      hits = p.values.filter((v) => opts.has(foldText(v))).length;
    }
  }
  const r = hits / p.n;
  return r >= 0.6 ? r : 0;
}

/**
 * Asocia cada campo de destino a una columna del archivo, uno a uno: por nombre (encabezado contra
 * `label`, `key` y `aliases`) y por contenido cuando el encabezado no dice nada («Columna 3» o
 * vacío): correos, NIT con dígito válido, fechas, montos, opciones. Asignación codiciosa por
 * puntaje (de mayor a menor), sin nada exponencial. Por debajo de 0,5 no se asocia.
 */
export function autoMap(columns: readonly ImportColumn[], table: ImportTable): Record<string, ImportMatch> {
  const profiles = table.headers.map((_, c) => profileColumn(table.rows, c));
  const cand: [number, number, number, "name" | "content"][] = [];
  columns.forEach((col, ci) => {
    table.headers.forEach((header, hi) => {
      const generic = !header || GENERIC.test(foldText(header).trim());
      const name = generic ? 0 : nameScore(header, col);
      const content = contentScore(col, profiles[hi]);
      const byContent = generic ? content * 0.9 : content * 0.6;
      const score = Math.min(1, Math.max(name, byContent) + (name && content ? 0.1 : 0));
      if (score >= 0.5) cand.push([score, ci, hi, name >= byContent ? "name" : "content"]);
    });
  });
  cand.sort((a, b) => b[0] - a[0] || a[1] - b[1] || a[2] - b[2]);
  const out: Record<string, ImportMatch> = {};
  for (const col of columns) out[col.key] = { index: null, score: 0, by: "none" };
  const taken = new Set<number>();
  for (const [score, ci, hi, by] of cand) {
    const m = out[columns[ci].key];
    if (m.index !== null || taken.has(hi)) continue;
    taken.add(hi);
    out[columns[ci].key] = { index: hi, score: Math.round(score * 100) / 100, by };
  }
  return out;
}

// ---------------------------------------------------------------- memoria

/** Una huella corta de los encabezados (sin tildes ni mayúsculas): el mismo archivo de cada mes. */
export function headerSignature(headers: readonly string[]): string {
  let h = 5381;
  const s = headers.map((x) => foldText(x.trim())).join("\u0001");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${headers.length}-${(h >>> 0).toString(36)}`;
}

type Store = Pick<Storage, "getItem" | "setItem">;
const memKey = (id: string, headers: readonly string[]) => `nx-import:${id}:${headerSignature(headers)}`;

/** Guarda el mapeo para la próxima vez (mismo `id` y mismos encabezados). Si no se puede, nada. */
export function rememberMapping(store: Store | null | undefined, id: string, headers: readonly string[], mapping: ImportMapping, fixed: Record<string, string> = {}): void {
  if (!store || !id) return;
  try {
    store.setItem(memKey(id, headers), JSON.stringify({ m: mapping, f: fixed }));
  } catch {
    /* sin espacio o bloqueado: no pasa nada */
  }
}

/** El mapeo guardado para estos encabezados, solo con lo que sigue siendo válido; `null` si no hay. */
export function recallMapping(store: Store | null | undefined, id: string, headers: readonly string[], columns: readonly ImportColumn[]): { mapping: ImportMapping; fixed: Record<string, string> } | null {
  if (!store || !id) return null;
  let o: { m?: Record<string, unknown>; f?: Record<string, unknown> };
  try {
    o = JSON.parse(store.getItem(memKey(id, headers)) ?? "null");
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || !o.m || typeof o.m !== "object") return null;
  const mapping: ImportMapping = {};
  const fixed: Record<string, string> = {};
  const used = new Set<number>();
  for (const c of columns) {
    const v = o.m[c.key];
    mapping[c.key] = typeof v === "number" && Number.isInteger(v) && v >= 0 && v < headers.length && !used.has(v) ? (used.add(v), v) : null;
    const f = o.f?.[c.key];
    if (mapping[c.key] === null && typeof f === "string" && f.trim()) fixed[c.key] = f;
  }
  return { mapping, fixed };
}

// ---------------------------------------------------------------- normalizar

/** Lo que se decide por columna mirando todos sus valores. */
export interface ColumnContext {
  /** Separador decimal de los números ambiguos («1.500»). */
  dec: "," | ".";
  /** Fechas numéricas: día primero (dd/mm) o mes primero (mm/dd). */
  dmy: boolean;
  /** Porcentajes sin «%» escritos en puntos (19) y no como fracción (0,19). */
  points: boolean;
}

const localeDmy = new Map<string, boolean>();
function dmyOf(locale: string): boolean {
  let v = localeDmy.get(locale);
  if (v === undefined) {
    const parts = new Intl.DateTimeFormat(locale).formatToParts(new Date(2000, 10, 22));
    v = parts.findIndex((p) => p.type === "day") < parts.findIndex((p) => p.type === "month");
    localeDmy.set(locale, v);
  }
  return v;
}
const decOf = (locale: string): "," | "." => (nxFormat(locale).number(1.5).includes(",") ? "," : ".");

/** El voto de un número por su separador decimal: «1.234,5» → «,»; «1,5» → «,»; «1.500.000» → «,»;
 *  «1.500» → nada (puede ser mil quinientos o uno y medio). */
function decVote(t: string): "," | "." | null {
  const lastDot = t.lastIndexOf(".");
  const lastComma = t.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) return lastDot > lastComma ? "." : ",";
  const sep = lastDot >= 0 ? "." : lastComma >= 0 ? "," : "";
  if (!sep) return null;
  if (t.indexOf(sep) !== t.lastIndexOf(sep)) return sep === "." ? "," : ".";
  // «0,500», «,5» o «1234,567»: antes de un separador de miles no hay cero, ni nada, ni más de 3 cifras.
  if (/^0?[.,]/.test(t) || t.indexOf(sep) > 3) return sep;
  return t.length - t.lastIndexOf(sep) - 1 === 3 ? null : sep;
}

const DMY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[\sT].*)?$/;

/** El contexto de una columna: formato de sus números (aunque el archivo venga en el formato del
 *  otro locale) y orden de sus fechas (si algún día pasa de 12 en la primera posición, es dd/mm). */
export function columnContext(values: Iterable<ImportCell | undefined>, locale = "es-CO"): ColumnContext {
  const loc = canonicalLocale(locale) || "es-CO";
  let comma = 0;
  let dot = 0;
  let dFirst = 0;
  let mFirst = 0;
  let points = false;
  for (const v of values) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (!t) continue;
    const m = DMY.exec(t);
    if (m) {
      if (Number(m[1]) > 12) dFirst++;
      else if (Number(m[2]) > 12) mFirst++;
      continue;
    }
    const digits = t.replace(/[^\d.,]/g, "");
    const vote = decVote(digits);
    if (vote === ",") comma++;
    else if (vote === ".") dot++;
    if (!t.includes("%")) {
      const n = parseNumber(t, vote ?? ",");
      if (n !== null && Math.abs(n) > 1) points = true;
    }
  }
  return { dec: comma > dot ? "," : dot > comma ? "." : decOf(loc), dmy: dFirst && !mFirst ? true : mFirst && !dFirst ? false : dmyOf(loc), points };
}

/**
 * Un número como viene en una hoja: «1.234,50», «1,234.50», «$ 1.500.000», «US$ 300», «(1.200)»
 * contable, «1.200-», «19 %». `dec` decide solo los ambiguos («1.500»). `null` si no es un número.
 */
export function parseNumber(raw: ImportCell, dec: "," | "." = ","): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  let t = raw.replace(/[\s\u00a0\u202f]/g, "");
  if (!numLike(t)) return null;
  let neg = false;
  if (t.startsWith("(") && t.endsWith(")")) (neg = true), (t = t.slice(1, -1));
  if (t.endsWith("-")) (neg = !neg), (t = t.slice(0, -1));
  if (t.endsWith("%")) t = t.slice(0, -1);
  if (t.startsWith("-")) (neg = !neg), (t = t.slice(1));
  else if (t.startsWith("+")) t = t.slice(1);
  t = t.replace(/^(?:US\$|[$€£]|COP|USD)/i, "");
  if (!/^[\d.,]+$/.test(t)) return null;
  // El separador decimal: el que dice el propio número, o el de la columna si es ambiguo.
  const d = decVote(t) ?? dec;
  let s = t.split(d === "," ? "." : ",").join("");
  if (s.indexOf(d) !== s.lastIndexOf(d)) return null;
  s = s.replace(d, ".");
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const MONTHS = ["ene jan", "feb", "mar", "abr apr", "may", "jun", "jul", "ago aug", "sep set", "oct", "nov", "dic dec"];
const monthOf = (w: string): number => {
  const k = foldText(w).slice(0, 3);
  return MONTHS.findIndex((m) => m.split(" ").includes(k)) + 1;
};
function isoDate(y: number, m: number, d: number): string | null {
  if (y < 100) y += y < 50 ? 2000 : 1900;
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
}

/** Número de serie de Excel (sistema 1900, con su 29 de febrero de 1900 que no existió) → fecha ISO. */
export function excelSerialDate(n: number, date1904 = false): string | null {
  if (!Number.isFinite(n) || n < 1 || n > 2958465) return null;
  const base = date1904 ? Date.UTC(1904, 0, 1) : n < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  return new Date(base + Math.floor(n) * 864e5).toISOString().slice(0, 10);
}

/**
 * Una fecha → ISO («2026-09-12»), o `null`. ISO, dd/mm/aaaa o mm/dd/aaaa (según `dmy`), con `-`, `/`
 * o `.`, años de 2 dígitos (00–49 → 2000), «12-sep-2026», «12 de septiembre de 2026», «Sep 12, 2026»
 * y seriales de Excel (5 cifras). Una fecha que no existe (31/02) es `null`.
 */
export function parseDate(raw: ImportCell, dmy = true): string | null {
  if (typeof raw === "number") return excelSerialDate(raw);
  const t = raw.trim();
  if (t.length > 40) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT].*)?$/.exec(t);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  if ((m = DMY.exec(t))) return dmy ? isoDate(+m[3], +m[2], +m[1]) : isoDate(+m[3], +m[1], +m[2]);
  if ((m = /^(\d{1,2})(?:[-/.\s]+|\s+de\s+)([a-zñé]{3,})\.?(?:[-/.\s]+|\s+de\s+)(\d{2}|\d{4})$/i.exec(t))) {
    const mo = monthOf(m[2]);
    return mo ? isoDate(+m[3], mo, +m[1]) : null;
  }
  if ((m = /^([a-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(t))) {
    const mo = monthOf(m[1]);
    return mo ? isoDate(+m[3], mo, +m[2]) : null;
  }
  if (/^\d{5}(?:\.\d+)?$/.test(t)) return excelSerialDate(Number(t));
  return null;
}

const optionCache = new WeakMap<ImportColumn, Map<string, string>>();
/** Las opciones de un campo por su valor y su etiqueta, sin tildes ni mayúsculas. */
function optionIndex(col: ImportColumn): Map<string, string> {
  let m = optionCache.get(col);
  if (!m) {
    m = new Map();
    for (const o of col.options ?? []) m.set(foldText(o.label.trim()), o.value);
    for (const o of col.options ?? []) m.set(foldText(o.value.trim()), o.value);
    optionCache.set(col, m);
  }
  return m;
}

export interface NormalizeOptions {
  messages?: ImportMessages;
  locale?: string;
}

/**
 * Un valor del archivo según el tipo del campo: `[valor, error?]`. Vacío → `[null]`. Los números
 * salen como `number` (en `percent`, la fracción: «19%» → 0,19), las fechas en ISO, los booleanos
 * como `true`/`false`, las opciones por su `value`, los NIT como «900359742-3». Revisa `min`, `max`
 * y `pattern`; `required` y `unique` son de la fila y del archivo (`importValidator`).
 */
export function normalizeValue(raw: ImportCell | undefined, col: ImportColumn, ctx: ColumnContext, opts: NormalizeOptions = {}): [unknown, string?] {
  const M = opts.messages ?? IMPORT_MESSAGES;
  const t = cellText(raw);
  if (!t) return [null];
  let v: unknown = t;
  switch (col.type) {
    case "number":
    case "money":
    case "percent": {
      let n = parseNumber(typeof raw === "number" ? raw : t, ctx.dec);
      if (n === null) return [null, M.number];
      if (col.type === "percent" && (t.endsWith("%") || (ctx.points && typeof raw !== "number"))) n = Math.round(n * 1e10) / 1e12;
      v = n;
      break;
    }
    case "date": {
      const d = parseDate(typeof raw === "number" ? raw : t, ctx.dmy);
      if (!d) return [null, M.date];
      v = d;
      break;
    }
    case "email":
      if (!isEmail(t)) return [null, M.email];
      v = t.toLowerCase();
      break;
    case "phone": {
      const digits = t.replace(/\D/g, "");
      if (t.length > 40 || !/^\+?[\d\s().-]+(?:\s*(?:ext\.?|x)\s*\d+)?$/i.test(t) || digits.length < 7 || digits.length > 15) return [null, M.phone];
      v = (t.startsWith("+") ? "+" : "") + t.replace(/\s*(?:ext\.?|x)\s*\d+$/i, "").replace(/\D/g, "");
      break;
    }
    case "nit": {
      const m = t.length > 30 ? null : /^([\d.\s]+?)\s*(?:-\s*(\d))?$/.exec(t);
      const base = m ? m[1].replace(/\D/g, "") : "";
      if (!m || base.length < 5 || base.length > 15) return [null, M.nit];
      if (m[2] !== undefined) {
        const dv = nitCheckDigit(base);
        if (dv !== Number(m[2])) return [null, fmtLabel(M.nitDv, { dv })];
      }
      v = m[2] !== undefined ? `${base}-${m[2]}` : base;
      break;
    }
    case "bool": {
      const low = foldText(t);
      if (BOOL_T.has(low)) v = true;
      else if (BOOL_F.has(low)) v = false;
      else return [null, M.bool];
      break;
    }
    case "option": {
      const o = optionIndex(col).get(foldText(t));
      if (o === undefined) return [null, M.option];
      v = o;
      break;
    }
  }
  // Límites: números contra números, fechas ISO contra fechas ISO (se comparan como texto).
  const out = (x: number | string | undefined, over: boolean) => x !== undefined && typeof x === typeof v && (over ? (v as number) > (x as number) : (v as number) < (x as number));
  const low = out(col.min, false);
  if (low || out(col.max, true)) {
    const fmt = nxFormat(opts.locale);
    const x = (low ? col.min : col.max)!;
    const shown = typeof x === "number" ? (col.type === "percent" ? `${fmt.number(x * 100)} %` : fmt.number(x)) : col.type === "date" ? fmt.date(x) : x;
    return [null, low ? fmtLabel(M.min, { min: shown }) : fmtLabel(M.max, { max: shown })];
  }
  if (col.pattern) {
    const re = patternOf(col.pattern);
    if (re && !re.test(t)) return [null, M.pattern];
  }
  return [v];
}

const patterns = new Map<string, RegExp | null>();
function patternOf(p: string): RegExp | null {
  let re = patterns.get(p);
  if (re === undefined) {
    try {
      re = new RegExp(`^(?:${p})$`, "u");
    } catch {
      re = null;
    }
    patterns.set(p, re);
  }
  return re;
}

// ---------------------------------------------------------------- validar

export interface ValidatorOptions extends NormalizeOptions {
  /** Campos con un mismo valor para todas las filas («Ciudad: Medellín»). */
  fixed?: Record<string, string>;
}

/**
 * Prepara la revisión: el contexto de cada columna (una pasada) y una función que revisa una fila
 * (con `edits` opcionales, lo que la persona corrigió). Así la interfaz puede ir por tramos sin
 * congelarse y revisar de nuevo solo la fila que se editó.
 */
export function importValidator(table: ImportTable, columns: readonly ImportColumn[], mapping: ImportMapping, opts: ValidatorOptions = {}): (i: number, edits?: Record<string, string>) => ImportRowCheck {
  const M = opts.messages ?? IMPORT_MESSAGES;
  const fixed = opts.fixed ?? {};
  const active = columns.filter((c) => (mapping[c.key] ?? null) !== null || fixed[c.key] !== undefined);
  const ctxs = active.map((c) => {
    const idx = mapping[c.key];
    if (idx === null || idx === undefined) return columnContext([fixed[c.key]], opts.locale);
    return columnContext(
      (function* () {
        for (const r of table.rows) yield r[idx];
      })(),
      opts.locale,
    );
  });
  return (i, edits) => {
    const row = table.rows[i] ?? [];
    const values: Record<string, unknown> = {};
    const errors: Record<string, string> = {};
    let empty = true;
    const pending: ImportColumn[] = [];
    active.forEach((c, k) => {
      const idx = mapping[c.key];
      const edited = edits?.[c.key];
      const raw = edited !== undefined ? edited : idx !== null && idx !== undefined ? row[idx] : fixed[c.key];
      const own = idx !== null && idx !== undefined;
      if (own && cellText(raw)) empty = false;
      const [v, err] = normalizeValue(raw, c, ctxs[k], opts);
      values[c.key] = v;
      if (err) errors[c.key] = err;
      else if (v === null && c.required) pending.push(c);
    });
    if (!empty) for (const c of pending) errors[c.key] = M.required;
    return { index: i, line: table.lines[i] ?? i + 1, values, errors: empty ? {} : errors, empty };
  };
}

/** Marca los repetidos de los campos `unique` (la primera aparición queda bien). Lineal. */
export function markDuplicates(checks: readonly ImportRowCheck[], columns: readonly ImportColumn[], messages: ImportMessages = IMPORT_MESSAGES): void {
  for (const r of checks) delete r.dup;
  for (const c of columns) {
    if (!c.unique) continue;
    const seen = new Map<string, number>();
    for (const r of checks) {
      const v = r.values[c.key];
      if (r.empty || v === null || v === undefined || r.errors[c.key]) continue;
      const k = typeof v === "string" ? foldText(v) : String(v);
      const first = seen.get(k);
      if (first === undefined) seen.set(k, r.line);
      else (r.dup ??= {})[c.key] = fmtLabel(messages.duplicate, { line: first });
    }
  }
}

/** Todos los problemas de una fila: los suyos, los repetidos y los del servidor. */
export const rowIssues = (r: ImportRowCheck): Record<string, string> => ({ ...r.errors, ...r.dup, ...r.server });
export const hasIssues = (r: ImportRowCheck): boolean => !r.empty && (Object.keys(r.errors).length > 0 || !!r.dup || !!r.server);

export interface ValidateResult {
  checks: ImportRowCheck[];
  ready: number;
  invalid: number;
  empty: number;
}

/** Revisa todo el archivo de una vez (sin tramos): normaliza, valida y marca repetidos. */
export function validateRows(table: ImportTable, columns: readonly ImportColumn[], mapping: ImportMapping, opts: ValidatorOptions = {}): ValidateResult {
  const check = importValidator(table, columns, mapping, opts);
  const checks = table.rows.map((_, i) => check(i));
  markDuplicates(checks, columns, opts.messages);
  return { checks, ...countChecks(checks) };
}

export function countChecks(checks: readonly ImportRowCheck[]): { ready: number; invalid: number; empty: number } {
  let invalid = 0;
  let empty = 0;
  for (const r of checks) {
    if (r.empty) empty++;
    else if (hasIssues(r)) invalid++;
  }
  return { ready: checks.length - invalid - empty, invalid, empty };
}

// ---------------------------------------------------------------- servidor y salida

/** Los errores de la respuesta de un lote, como índices del lote (`row` absoluto — `offset` + i — o
 *  relativo al lote). Lo que no se entiende se descarta. */
export function parseServerErrors(body: unknown, offset: number, size: number): { index: number; field?: string; message: string }[] {
  const list = body && typeof body === "object" ? (body as { errors?: unknown }).errors : undefined;
  if (!Array.isArray(list)) return [];
  const out: { index: number; field?: string; message: string }[] = [];
  for (const e of list) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const row = typeof o.row === "number" && Number.isInteger(o.row) ? o.row : NaN;
    const index = row >= offset && row < offset + size ? row - offset : row >= 0 && row < size ? row : -1;
    if (index < 0) continue;
    out.push({ index, field: str(o.field), message: str(o.message) ?? "" });
  }
  return out;
}

/** Un CSV para Excel: `;` o `,` según el locale, comillas donde hacen falta y BOM. Los textos que
 *  Excel tomaría como fórmula (`=`, `+`, `-`, `@` sin ser un número) van con un apóstrofo. */
export function toCsv(rows: readonly (readonly ImportCell[])[], delimiter = ";"): string {
  const esc = (v: ImportCell | undefined) => {
    let s = v === undefined || v === null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d.,\s]+$/.test(s)) s = `'${s}`;
    return s.includes(delimiter) || /["\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `﻿${rows.map((r) => r.map(esc).join(delimiter)).join("\r\n")}\r\n`;
}

/** «20MB», «500 KB», «1048576» → bytes (por defecto 20 MB). */
export function parseSize(v: unknown, fallback = 20 * 1024 * 1024): number {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(kb|mb|gb|k|m|g|b)?\s*$/i.exec(String(v ?? ""));
  if (!m) return fallback;
  const n = Number(m[1].replace(",", "."));
  const u = (m[2] ?? "b")[0].toLowerCase();
  const bytes = n * (u === "g" ? 1024 ** 3 : u === "m" ? 1024 ** 2 : u === "k" ? 1024 : 1);
  return bytes > 0 ? bytes : fallback;
}
