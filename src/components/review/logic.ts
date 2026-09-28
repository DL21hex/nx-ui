/**
 * Lógica pura del resumen antes de guardar: comparar los valores de antes y de ahora, reconocer las
 * filas de detalle, contar cada cambio como se lee («$ 10.000 → $ 12.000 (+$ 2.000 · +20 %)») y
 * decidir qué es importante. Sin DOM: la misma función sirve en un backend en JavaScript.
 */
import type { NxFormat } from "../../core/locale";
import { wordDiff } from "../history/logic";
import type { ReviewChange, ReviewLabels, ReviewMeta, ReviewMode, ReviewReason, ReviewRow, ReviewValue, ReviewValues } from "./types";

export const REVIEW_LABELS: ReviewLabels = {
  title: "Vas a guardar 1 cambio|Vas a guardar {n} cambios",
  save: "Guardar",
  keep: "Seguir editando",
  none: "No hay cambios que guardar",
  empty: "(vacío)",
  yes: "Sí",
  no: "No",
  quote: "“{text}”",
  to: "cambia a",
  important: "importante",
  warning: "Aviso:",
  days: "{n} día|{n} días",
  added: "1 línea nueva|{n} líneas nuevas",
  removed: "1 quitada|{n} quitadas",
  changed: "1 cambiada|{n} cambiadas",
  row: "Línea {n}",
  rowAdded: "Nueva",
  rowRemoved: "Quitada",
  rowChanged: "Cambiada",
};

/** «{n} cambios» con sus variables; «uno|varios» elige por `n`. */
export function reviewText(t: string, vars: Record<string, string | number> = {}, n?: number): string {
  const [one, many] = t.split("|");
  return (n !== 1 && many !== undefined ? many : one).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

// ---------------------------------------------------------------- nombres y valores

const ROW = /^(.+?)(?:\[(\d+)\]|\.(\d+))(?:\.([^.[\]]+)|\[([^\]]+)\])$/;

/** Un campo de una fila de detalle: `items[0].qty`, `items[2][precio]`, `lineas.3.cantidad` → `{group, index, leaf}`. */
export function reviewRowName(name: string): { group: string; index: number; leaf: string } | null {
  const m = ROW.exec(name);
  return m ? { group: m[1], index: +(m[2] ?? m[3]), leaf: (m[4] ?? m[5])! } : null;
}

/** El nombre canónico (las filas, siempre como `grupo[i].campo`): así `items[2][qty]` y `items.2.qty` son el mismo. */
export function reviewName(name: string): string {
  const r = reviewRowName(name);
  return r ? `${r.group}[${r.index}].${r.leaf}` : name;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Un valor que cabe en un campo (texto, número finito, sí/no, lista de textos) o `null`. */
export function reviewValue(v: unknown): ReviewValue {
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && typeof x !== "object").map(String);
  return typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) ? v : null;
}

/**
 * Valores de la app (`initial`) como los lee el formulario: `{items: [{id, qty}]}` → `items[0].id`,
 * `items[0].qty`; `{cliente: {nit}}` → `cliente.nit`; los nombres ya planos se normalizan.
 */
export function flattenReview(v: unknown): ReviewValues {
  const out: ReviewValues = {};
  const walk = (o: Record<string, unknown>, pre: string, depth: number) => {
    for (const [k, x] of Object.entries(o)) {
      const name = pre ? `${pre}.${k}` : k;
      if (depth < 8 && Array.isArray(x) && x.some(isObj)) x.forEach((r, i) => isObj(r) && walk(r, `${name}[${i}]`, depth + 1));
      else if (depth < 8 && isObj(x)) walk(x, name, depth + 1);
      else out[reviewName(name)] = reviewValue(x);
    }
  };
  let o = v;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      return out;
    }
  }
  if (isObj(o)) walk(o, "", 0);
  return out;
}

/** ¿Vacío? `null`, `""`, `false` (una casilla sin marcar) y `[]`. */
const blank = (v: unknown): boolean => v === null || v === undefined || v === "" || v === false || (Array.isArray(v) && !v.length);
const text = (v: unknown) => String(v).replace(/\r\n?/g, "\n");

/** ¿El mismo valor? `12` y `"12"` lo son; `null`, `""` y `false` también; las listas, sin importar el orden. */
export function sameReviewValue(a: unknown, b: unknown): boolean {
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  if (Array.isArray(a) || Array.isArray(b)) return [a].flat().map(String).sort().join("\u0001") === [b].flat().map(String).sort().join("\u0001");
  if (typeof a === "number" || typeof b === "number") return Number(a) === Number(b);
  return text(a) === text(b);
}

// ---------------------------------------------------------------- comparar

/** Una fila de un lado: su índice (el de los nombres), su posición, su clave y sus valores por campo. */
export interface ReviewRowRef {
  index: number;
  pos: number;
  key: string;
  values: ReviewValues;
}
export interface ReviewRowsDiff {
  group: string;
  from: number;
  to: number;
  added: ReviewRowRef[];
  removed: ReviewRowRef[];
  changed: { from: ReviewRowRef; to: ReviewRowRef; cells: string[] }[];
}
/** Qué cambió, sin formato: los campos sueltos y, por grupo, las filas nuevas, quitadas y cambiadas. */
export interface ReviewDiff {
  fields: string[];
  rows: ReviewRowsDiff[];
}

/** La clave de una fila: su campo `id`. */
const KEY = "id";

function split(values: ReviewValues): { plain: string[]; groups: Map<string, ReviewRowRef[]> } {
  const plain: string[] = [];
  const by = new Map<string, Map<number, ReviewValues>>();
  for (const name of Object.keys(values)) {
    const r = reviewRowName(name);
    if (!r) {
      plain.push(name);
      continue;
    }
    let g = by.get(r.group);
    if (!g) by.set(r.group, (g = new Map()));
    let row = g.get(r.index);
    if (!row) g.set(r.index, (row = {}));
    row[r.leaf] = values[name];
  }
  const groups = new Map<string, ReviewRowRef[]>();
  for (const [group, rows] of by)
    groups.set(
      group,
      [...rows]
        .sort((a, b) => a[0] - b[0])
        .map(([index, v], pos) => ({ index, pos, key: blank(v[KEY]) ? "" : String(v[KEY]), values: v })),
    );
  return { plain, groups };
}

/**
 * Compara dos juegos de valores. Las filas de detalle se reconocen por su campo `id` (una fila sin
 * `id` es nueva o quitada); si ninguna fila tiene `id`, por posición. Lineal en campos y filas
 * (más el orden de las filas de cada grupo).
 */
export function diffReview(base: ReviewValues, now: ReviewValues): ReviewDiff {
  const A = split(base);
  const B = split(now);
  const fields: string[] = [];
  const seen = new Set<string>();
  for (const name of [...B.plain, ...A.plain]) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (!sameReviewValue(base[name], now[name])) fields.push(name);
  }
  const rows: ReviewRowsDiff[] = [];
  for (const group of new Set([...B.groups.keys(), ...A.groups.keys()])) {
    const a = A.groups.get(group) ?? [];
    const b = B.groups.get(group) ?? [];
    const d: ReviewRowsDiff = { group, from: a.length, to: b.length, added: [], removed: [], changed: [] };
    const byKey = new Map<string, ReviewRowRef>();
    const loose: ReviewRowRef[] = [];
    for (const r of a) (r.key && !byKey.has(r.key) ? byKey.set(r.key, r) : loose.push(r));
    const used = new Set<ReviewRowRef>();
    let li = 0;
    for (const r of b) {
      const m = r.key ? byKey.get(r.key) : loose[li++];
      if (!m || used.has(m)) {
        d.added.push(r);
        continue;
      }
      used.add(m);
      const cells = [...new Set([...Object.keys(r.values), ...Object.keys(m.values)])].filter((k) => k !== KEY && !sameReviewValue(m.values[k], r.values[k]));
      if (cells.length) d.changed.push({ from: m, to: r, cells });
    }
    d.removed = a.filter((r) => !used.has(r));
    if (d.added.length || d.removed.length || d.changed.length) rows.push(d);
  }
  return { fields, rows };
}

/** Cuántos cambios: cada campo suelto y cada fila nueva, quitada o cambiada. */
export const countReview = (d: ReviewDiff): number => d.rows.reduce((n, g) => n + g.added.length + g.removed.length + g.changed.length, d.fields.length);

// ---------------------------------------------------------------- contar cada cambio

export interface ReviewDescribeOptions {
  fmt: NxFormat;
  labels?: ReviewLabels;
  /** Desde qué cambio relativo un monto o un número es importante (0,2 = 20 %). */
  threshold?: number;
  /** Desde cuántos días una fecha que se movió es importante (más de 7). */
  days?: number;
  /**
   * Lo que se sabe de cada campo: se pide con su nombre (`precio`), con el del grupo de filas
   * (`items`) y con el de una columna (`items[].qty`).
   */
  meta?: (name: string) => ReviewMeta | undefined;
  /** Los avisos de `<nx-guard>` por nombre (canónico). */
  warnings?: Map<string, string[]>;
}

/** «fecha_entrega» → «Fecha entrega»; «precioUnitario» → «Precio unitario». */
export function humanizeName(name: string): string {
  const t = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_\-.[\]]+/g, " ")
    .trim()
    .toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const pcts = new Map<string, Intl.NumberFormat>();
function pctText(n: number, locale: string): string {
  let f = pcts.get(locale);
  if (!f) pcts.set(locale, (f = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 })));
  return f.format(n).replace(/[  ]/g, " ");
}
const num = (v: unknown): number | null => (typeof v === "number" ? v : blank(v) || typeof v !== "string" || !v.trim() ? null : Number.isFinite(+v) ? +v : null);
/** Días desde 1970 de una fecha ISO («2026-10-12», o el comienzo de «2026-10-12T08:00»). */
const isoDay = (v: unknown): number | null => {
  const m = typeof v === "string" && /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : null;
};
const sign = (n: number) => (n > 0 ? "+" : "−");

function guessKind(a: unknown, b: unknown): NonNullable<ReviewMeta["kind"]> {
  const v = blank(a) ? b : a;
  return typeof v === "number" ? "number" : typeof v === "boolean" ? "bool" : Array.isArray(v) ? "choice" : isoDay(v) !== null && /^\d{4}-\d\d-\d\d$/.test(String(v)) ? "date" : "text";
}

/** Cómo se lee un valor: la etiqueta de la opción, el monto, la fecha, «Sí», el texto citado o «(vacío)». */
export function reviewValueText(v: ReviewValue | undefined, meta: ReviewMeta | undefined, fmt: NxFormat, L: ReviewLabels = REVIEW_LABELS): string {
  const kind = meta?.kind ?? guessKind(v, null);
  if (kind === "bool") return v === true || v === "true" || v === "on" ? L.yes : blank(v) ? L.no : String(v);
  if (blank(v)) return L.empty;
  const opt = (x: unknown) => meta?.options?.[String(x)] ?? String(x);
  if (Array.isArray(v)) return v.map(opt).join(", ");
  const n = num(v);
  if (n !== null && (kind === "money" || kind === "number" || kind === "percent"))
    return kind === "money" ? fmt.money(n, meta ?? {}) : kind === "percent" ? pctText(n, fmt.locale) : fmt.number(n);
  if (kind === "date") return fmt.date(String(v));
  if (kind === "choice" || meta?.options?.[String(v)]) return opt(v);
  return reviewText(L.quote, { text: String(v) });
}

/** Un campo que cambió, contado: textos, diferencia, importancia y por qué. */
export function describeChange(field: string, from: ReviewValue | undefined, to: ReviewValue | undefined, meta: ReviewMeta | undefined, o: ReviewDescribeOptions): ReviewChange {
  const L = o.labels ?? REVIEW_LABELS;
  const kind = meta?.kind ?? guessKind(from, to);
  const m = { ...meta, kind };
  const c: ReviewChange = {
    field,
    label: meta?.label || humanizeName(reviewRowName(field)?.leaf ?? field),
    kind,
    from: from ?? null,
    to: to ?? null,
    fromText: reviewValueText(from, m, o.fmt, L),
    toText: reviewValueText(to, m, o.fmt, L),
    significant: false,
  };
  if (meta?.section) c.section = meta.section;
  let reason: ReviewReason | undefined;
  const a = num(from);
  const b = num(to);
  if ((kind === "money" || kind === "number" || kind === "percent") && a !== null && b !== null) {
    const by = b - a;
    const pct = a ? by / Math.abs(a) : null;
    const abs = Math.abs(by);
    const p = pct === null ? "" : ` · ${sign(pct)}${pctText(Math.abs(pct), o.fmt.locale)}`;
    c.delta = { by, pct, text: kind === "percent" ? undefined : `${sign(by)}${kind === "money" ? o.fmt.money(abs, m) : o.fmt.number(abs)}${p}` };
    if (!c.delta.text) delete c.delta.text;
    if (pct !== null && Math.abs(pct) >= (o.threshold ?? 0.2) - 1e-9) reason = "amount";
  } else if (kind === "date") {
    const da = isoDay(from);
    const db = isoDay(to);
    if (da !== null && db !== null) {
      const by = db - da;
      c.delta = { by, text: `${sign(by)}${reviewText(L.days, { n: o.fmt.number(Math.abs(by)) }, Math.abs(by))}` };
      if (Math.abs(by) > (o.days ?? 7)) reason = "date";
    }
  } else if (kind === "text" && typeof from === "string" && typeof to === "string" && from.trim() && to.trim() && (meta?.long || Math.max(from.length, to.length) > 48)) {
    c.diff = wordDiff(text(from), text(to));
  }
  if (meta?.status) reason = "status";
  if (meta?.important) reason = "important";
  const w = o.warnings?.get(field);
  if (w?.length) (c.warnings = w), (reason = "guard");
  if (reason) (c.significant = true), (c.reason = reason);
  return c;
}

/** Una fila nueva o quitada, legible: «Línea 3 · Lámina HR» y «Cantidad 12 · Precio $ 1.275.000». */
function rowOut(group: string, r: ReviewRowRef, o: ReviewDescribeOptions, L: ReviewLabels, changes?: ReviewChange[]): ReviewRow {
  const col = (leaf: string) => o.meta?.(`${group}[].${leaf}`);
  const leaves = Object.keys(r.values).filter((k) => k !== KEY);
  // El título: el primer texto de la fila (la descripción), si tiene.
  const head = leaves.find((k) => (col(k)?.kind ?? guessKind(r.values[k], null)) === "text" && !blank(r.values[k]));
  const title = reviewText(L.row, { n: r.pos + 1 }) + (head ? ` · ${String(r.values[head])}` : "");
  const row: ReviewRow = { key: r.key, index: r.index, title, values: r.values, significant: false };
  if (changes) {
    row.changes = changes;
    row.significant = changes.some((c) => c.significant);
  } else {
    row.text = leaves
      .filter((k) => k !== head && !blank(r.values[k]))
      .slice(0, 4)
      .map((k) => `${col(k)?.label || humanizeName(k)} ${reviewValueText(r.values[k], col(k), o.fmt, L)}`)
      .join(" · ");
    const w = leaves.some((k) => o.warnings?.get(`${group}[${r.index}].${k}`)?.length);
    row.significant = w;
  }
  return row;
}

/**
 * Los cambios, contados: un `ReviewChange` por campo suelto y uno por grupo de filas (con el
 * detalle de cada fila). En el orden de `now` (el del formulario); lo que ya no está, al final.
 */
export function describeReview(d: ReviewDiff, base: ReviewValues, now: ReviewValues, o: ReviewDescribeOptions): ReviewChange[] {
  const L = o.labels ?? REVIEW_LABELS;
  const out = d.fields.map((f) => describeChange(f, base[f], now[f], o.meta?.(f), o));
  for (const g of d.rows) {
    const gm = o.meta?.(g.group);
    const changed = g.changed.map((c) =>
      rowOut(
        g.group,
        c.to,
        o,
        L,
        c.cells.map((k) => {
          const field = `${g.group}[${c.to.index}].${k}`;
          const ch = describeChange(field, c.from.values[k], c.to.values[k], o.meta?.(`${g.group}[].${k}`), o);
          delete ch.section;
          return ch;
        }),
      ),
    );
    const added = g.added.map((r) => rowOut(g.group, r, o, L));
    const removed = g.removed.map((r) => rowOut(g.group, r, o, L));
    const summary = [
      [L.added, added.length],
      [L.removed, removed.length],
      [L.changed, changed.length],
    ]
      .filter(([, n]) => n)
      .map(([t, n]) => reviewText(t as string, { n: o.fmt.number(n as number) }, n as number))
      .join(" · ");
    const all = [...added, ...removed, ...changed];
    const warnings = [...(o.warnings ?? [])].filter(([k]) => reviewRowName(k)?.group === g.group).flatMap(([, w]) => w);
    const c: ReviewChange = {
      field: g.group,
      label: gm?.label || humanizeName(g.group),
      kind: "rows",
      from: g.from,
      to: g.to,
      fromText: o.fmt.number(g.from),
      toText: o.fmt.number(g.to),
      significant: all.some((r) => r.significant),
      rows: { added, removed, changed, summary },
    };
    if (gm?.section) c.section = gm.section;
    if (warnings.length) c.warnings = warnings;
    if (c.significant) c.reason = warnings.length ? "guard" : (changed.flatMap((r) => r.changes!).find((x) => x.significant)?.reason ?? "amount");
    out.push(c);
  }
  return out;
}

/** Cuántos cambios cuenta una lista (cada campo, y cada fila de un grupo). */
export const countChanges = (changes: readonly ReviewChange[]): number =>
  changes.reduce((n, c) => n + (c.rows ? c.rows.added.length + c.rows.removed.length + c.rows.changed.length : 1), 0);

/**
 * Para el panel: por sección (en el orden en que aparecen, las que tienen algo importante primero),
 * y dentro de cada una lo importante primero. El orden de lo demás se conserva.
 */
export function groupReview(changes: readonly ReviewChange[]): { section: string; changes: ReviewChange[] }[] {
  const by = new Map<string, ReviewChange[]>();
  for (const c of changes) {
    const k = c.section ?? "";
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(c);
  }
  const first = <T>(list: T[], sig: (x: T) => boolean) => [...list.filter(sig), ...list.filter((x) => !sig(x))];
  return first(
    [...by].map(([section, list]) => ({ section, changes: first(list, (c) => c.significant) })),
    (g) => g.changes[0].significant,
  );
}

/**
 * ¿Se muestra el resumen al enviar? `always`: si hay cambios; `significant`: si algo es importante,
 * hay avisos de `<nx-guard>` o cambiaron más de `maxSilent`; `never`: no (solo con `review()`).
 */
export function reviewShouldOpen(changes: readonly ReviewChange[], mode: ReviewMode, maxSilent = 5, warnings = 0): boolean {
  if (!changes.length || mode === "never") return false;
  return mode === "always" || warnings > 0 || changes.some((c) => c.significant) || countChanges(changes) > maxSilent;
}
