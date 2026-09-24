/** Lógica pura del select: sin DOM, para probarse en node. */
import { foldText } from "../../core/text";
import type { SelectField, SelectOption } from "./types";

export const onlyDigits = (s: string): string => s.replace(/\D/g, "");

export function fieldText(option: SelectOption, key: string): string {
  const v = option[key];
  return v === null || v === undefined ? "" : String(v);
}

/** Solo números (con puntos, espacios o guiones) y al menos 4 dígitos: parece un documento. */
export function looksLikeDigits(query: string): boolean {
  return /^[\d.\s,-]+$/.test(query.trim()) && onlyDigits(query).length >= 4;
}

function tokens(query: string): string[] {
  return foldText(query).trim().split(/\s+/).filter(Boolean);
}

/** Las columnas donde se busca: solo las numéricas si la consulta parece un documento. */
export function searchScope(fields: readonly SelectField[], query: string): { fields: SelectField[]; digitsOnly: boolean } {
  const digit = fields.filter((f) => f.kind === "digits");
  return digit.length && looksLikeDigits(query) ? { fields: digit, digitsOnly: true } : { fields: [...fields], digitsOnly: false };
}

export interface Match {
  option: SelectOption;
  /** Las claves de las columnas donde coincidió algo. */
  fields: string[];
  score: number;
}

/**
 * Cada palabra de la consulta tiene que aparecer en ALGUNA columna (no necesariamente la misma):
 * «ana soldad» encuentra a «Ana María Rincón · Soldadora». Sin tildes ni mayúsculas; una columna
 * `digits` compara solo dígitos, así que «52.341.987» y «52341987» son lo mismo.
 * Orden: coincidencia exacta de columna > inicio de palabra > en medio; la columna principal pesa
 * un punto más. A igual puntaje se conserva el orden original.
 */
export function matchOption(option: SelectOption, fields: readonly SelectField[], query: string): Match | null {
  return matchPrepared(option, fields, prepare(fields, query));
}

type Prepared = { fields: SelectField[]; toks: string[] };

/** La consulta se analiza una vez por búsqueda, no una vez por opción. */
function prepare(fields: readonly SelectField[], query: string): Prepared {
  const scope = searchScope(fields, query);
  return { fields: scope.fields, toks: scope.digitsOnly ? [onlyDigits(query)] : tokens(query) };
}

// El texto normalizado de cada columna se calcula una vez por opción (quitar tildes es lo caro) y
// se reutiliza en cada tecla. Se recalcula si cambia el valor.
const folded = new WeakMap<SelectOption, Map<string, [string, string]>>();
function searchable(option: SelectOption, f: SelectField): string {
  const raw = fieldText(option, f.key);
  let byKey = folded.get(option);
  if (!byKey) folded.set(option, (byKey = new Map()));
  const id = `${f.kind ?? ""}:${f.key}`;
  const hit = byKey.get(id);
  if (hit && hit[0] === raw) return hit[1];
  const v = f.kind === "digits" ? onlyDigits(raw) : foldText(raw);
  byKey.set(id, [raw, v]);
  return v;
}

function matchPrepared(option: SelectOption, fields: readonly SelectField[], p: Prepared): Match | null {
  if (!p.toks.length) return { option, fields: [], score: 0 };
  const matched = new Set<string>();
  let score = 0;
  for (const tok of p.toks) {
    let hit = false;
    for (const f of p.fields) {
      const t = f.kind === "digits" ? onlyDigits(tok) : tok;
      if (!t) continue;
      const v = searchable(option, f);
      const i = v.indexOf(t);
      if (i < 0) continue;
      hit = true;
      matched.add(f.key);
      score += (i === 0 || v[i - 1] === " " ? 3 : 1) + (f === fields[0] ? 1 : 0) + (v === t ? 5 : 0);
    }
    if (!hit) return null;
  }
  return { option, fields: [...matched], score };
}

export function searchOptions(options: readonly SelectOption[], fields: readonly SelectField[], query: string): Match[] {
  const p = prepare(fields, query);
  const out: Match[] = [];
  for (const o of options) {
    const m = matchPrepared(o, fields, p);
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Los tramos `[inicio, fin)` de `text` que coinciden con la consulta (para `<mark>`). */
export function matchRanges(text: string, query: string, kind: SelectField["kind"] = "text"): [number, number][] {
  const digits = kind === "digits";
  const base = digits ? onlyDigits(text) : foldText(text);
  // Un plegado que cambia la longitud (una letra fuera del latín) no se resalta: mejor nada que mal.
  if (!digits && base.length !== text.length) return [];
  const toks = looksLikeDigits(query) && digits ? [onlyDigits(query)] : tokens(query).map((t) => (digits ? onlyDigits(t) : t));
  const marks = new Array<boolean>(base.length).fill(false);
  for (const t of toks) {
    if (!t) continue;
    for (let i = base.indexOf(t); i >= 0; i = base.indexOf(t, i + 1)) marks.fill(true, i, i + t.length);
  }
  const ranges: [number, number][] = [];
  marks.forEach((m, i) => {
    if (!m) return;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === i) last[1] = i + 1;
    else ranges.push([i, i + 1]);
  });
  return ranges;
}

/**
 * Un número de documento con separador de miles («52341987» → «52.341.987»), y los tramos
 * resaltados trasladados a esa forma. Lo que no son solo dígitos se deja tal cual.
 */
export function formatDigits(raw: string, ranges: [number, number][] = []): { text: string; ranges: [number, number][] } {
  const d = onlyDigits(raw);
  if (!d || d !== raw.trim()) return { text: raw, ranges };
  let text = "";
  const pos: number[] = [];
  for (let i = 0; i < d.length; i++) {
    if (i > 0 && (d.length - i) % 3 === 0) text += ".";
    pos.push(text.length);
    text += d[i];
  }
  return { text, ranges: ranges.map(([a, b]) => [pos[a], pos[b - 1] + 1] as [number, number]) };
}

/** Iniciales para el avatar: «Ana María Rincón» → «AM». */
export function initialsOf(text: string): string {
  const w = text.trim().split(/\s+/).filter(Boolean);
  return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : (w[0] ?? "").slice(0, 2).toUpperCase();
}
