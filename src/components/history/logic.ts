/** Lógica pura del historial: validar, reconstruir el pasado, diferencias por palabras, fechas y filtros. Sin DOM. */
import type { NxFormat } from "../../core/locale";
import { foldText } from "../../core/text";
import type { HistoryAction, HistoryActor, HistoryChange, HistoryEvent, HistoryField, HistoryFieldType, HistoryTone, HistoryValue } from "./types";

const ACTIONS = new Set<HistoryAction>(["create", "update", "delete", "comment", "status"]);
const TYPES = new Set<HistoryFieldType>(["text", "number", "money", "date", "status"]);
const TONES = new Set<HistoryTone>(["neutral", "success", "warning", "danger"]);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const idOf = (v: unknown) => str(v) ?? (typeof v === "number" ? String(v) : undefined);
/**
 * El instante de un `at` (ms). Un día sin hora («2026-09-12») es ese día en la hora local, no la
 * medianoche UTC (que en Bogotá cae el día anterior); lo demás, como lo lee `Date.parse`.
 */
export function atTime(at: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(at.trim());
  if (!m) return Date.parse(at);
  const d = new Date(2000, +m[2] - 1, +m[3]);
  d.setFullYear(+m[1]);
  return d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d.getTime() : NaN;
}
/** `atTime` como `Date`. */
export const atDate = (at: string): Date => new Date(atTime(at));

/** Lo que cabe en un campo: texto, número, sí/no o nada. Un objeto no es un valor. */
const prim = (v: unknown): HistoryValue => (typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) ? v : null);

/** Los campos válidos (`key` y `label`), sin lo que no es suyo. */
export function cleanFields(v: unknown): HistoryField[] {
  if (!Array.isArray(v)) return [];
  const out: HistoryField[] = [];
  for (const o of v) {
    const key = str(o?.key);
    const label = str(o?.label);
    if (!key || !label || out.some((f) => f.key === key)) continue;
    out.push({
      key,
      label,
      type: TYPES.has(o.type) ? o.type : "text",
      currency: str(o.currency),
      options: Array.isArray(o.options)
        ? o.options.filter((x: unknown) => idOf((x as { value?: unknown })?.value)).map((x: { value: unknown; label?: unknown; tone?: HistoryTone }) => ({ value: String(x.value), label: str(x.label) ?? String(x.value), tone: TONES.has(x.tone!) ? x.tone : undefined }))
        : undefined,
    });
  }
  return out;
}

/** El registro, solo con valores simples. */
export function cleanRecord(v: unknown): Record<string, HistoryValue> {
  const out: Record<string, HistoryValue> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) out[k] = prim(x);
  return out;
}

/**
 * Los eventos válidos, del más viejo al más nuevo. Necesitan `id`, una fecha que se entienda y
 * quién lo hizo (`actor` o su nombre). Un `id` repetido se descarta; una acción desconocida es `update`.
 */
export function cleanEvents(v: unknown): HistoryEvent[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: HistoryEvent[] = [];
  for (const o of v) {
    if (!o || typeof o !== "object") continue;
    const id = idOf(o.id);
    const at = str(o.at);
    const a = o.actor;
    const actor: HistoryActor | undefined = str(a) ? { name: a } : str(a?.name) ? { name: a.name, avatar: str(a.avatar) } : undefined;
    if (!id || !at || Number.isNaN(atTime(at)) || !actor || seen.has(id)) continue;
    seen.add(id);
    const changes = Array.isArray(o.changes) ? o.changes.filter((c: unknown) => str((c as HistoryChange)?.field)).map((c: HistoryChange): HistoryChange => ({ field: c.field, from: prim(c.from), to: prim(c.to) })) : [];
    out.push({ id, at, actor, action: ACTIONS.has(o.action) ? o.action : "update", changes: changes.length ? changes : undefined, note: str(o.note), revertOf: idOf(o.revertOf) });
  }
  return sortEvents(out);
}

/** Del más viejo al más nuevo (estable: dos eventos del mismo instante conservan su orden). */
export const sortEvents = (evs: readonly HistoryEvent[]): HistoryEvent[] => [...evs].sort((a, b) => atTime(a.at) - atTime(b.at));

/** Junta dos listas de eventos (la segunda gana si un `id` se repite), en orden. */
export function mergeEvents(a: readonly HistoryEvent[], b: readonly HistoryEvent[]): HistoryEvent[] {
  const ids = new Set(b.map((e) => e.id));
  return sortEvents([...a.filter((e) => !ids.has(e.id)), ...b]);
}

/**
 * El registro como estaba justo después del evento `i` (los eventos en orden, del más viejo al más
 * nuevo): desde el registro de hoy, se deshacen los cambios de los eventos posteriores, del más
 * nuevo hacia atrás.
 */
export function stateAt(record: Readonly<Record<string, HistoryValue>>, events: readonly HistoryEvent[], i: number): Record<string, HistoryValue> {
  const s = { ...record };
  for (let k = events.length - 1; k > i; k--) {
    const cs = events[k].changes ?? [];
    for (let j = cs.length - 1; j >= 0; j--) s[cs[j].field] = cs[j].from;
  }
  return s;
}

/** ¿El mismo valor? `1` y `"1"` lo son; `null`, `undefined` y `""` también. */
export const same = (a: unknown, b: unknown): boolean => String(a ?? "") === String(b ?? "");

/** Los campos que cambiaron entre `then` y `now`. */
export const changedKeys = (then: Record<string, unknown>, now: Record<string, unknown>, keys: readonly string[]): string[] => keys.filter((k) => !same(then[k], now[k]));

/** ¿Se puede revertir? Solo un cambio que sigue vigente (el campo aún tiene el valor al que cambió). */
export const canRevert = (record: Record<string, unknown>, ev: HistoryEvent, c: HistoryChange): boolean => ev.action !== "create" && ev.action !== "comment" && same(record[c.field], c.to) && !same(c.from, c.to);

/** El cambio inverso: el registro con el valor anterior y el evento de reversión que lo cuenta. */
export function revertChange(record: Readonly<Record<string, HistoryValue>>, ev: HistoryEvent, c: HistoryChange, actor: HistoryActor, now: Date): { record: Record<string, HistoryValue>; event: HistoryEvent } {
  return {
    record: { ...record, [c.field]: c.from },
    event: { id: `${ev.id}~${c.field}~${now.getTime()}`, at: now.toISOString(), actor, action: "update", changes: [{ field: c.field, from: record[c.field] ?? null, to: c.from }], revertOf: ev.id },
  };
}

/** Los cambios que un evento posterior ya revirtió («id|campo»). */
export function revertedKeys(events: readonly HistoryEvent[]): Set<string> {
  const out = new Set<string>();
  for (const e of events) if (e.revertOf) for (const c of e.changes ?? []) out.add(`${e.revertOf}|${c.field}`);
  return out;
}

// ---------------------------------------------------------------- diferencias por palabras

export interface DiffPart {
  /** `=` igual, `-` quitado, `+` agregado. */
  op: "=" | "-" | "+";
  text: string;
}

/**
 * Qué cambió entre dos textos, por palabras (la subsecuencia común más larga). Los espacios entre
 * dos cambios se funden con ellos y cada tramo cambiado queda como «lo quitado» y luego «lo
 * agregado», que se lee mejor que palabras sueltas intercaladas. Textos enormes (más de 500
 * palabras por lado, aprox.) se comparan enteros.
 */
export function wordDiff(a: string, b: string): DiffPart[] {
  const A = a.match(/\s+|\S+/g) ?? [];
  const B = b.match(/\s+|\S+/g) ?? [];
  const n = A.length;
  const m = B.length;
  const raw: DiffPart[] = [];
  if (n * m > 1e6) {
    raw.push({ op: "-", text: a }, { op: "+", text: b });
  } else {
    const W = m + 1;
    const L = new Uint16Array((n + 1) * W);
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * W + j] = A[i] === B[j] ? L[(i + 1) * W + j + 1] + 1 : Math.max(L[(i + 1) * W + j], L[i * W + j + 1]);
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) raw.push({ op: "=", text: A[i++] }), j++;
      else if (j >= m || (i < n && L[(i + 1) * W + j] >= L[i * W + j + 1])) raw.push({ op: "-", text: A[i++] });
      else raw.push({ op: "+", text: B[j++] });
    }
  }
  const out: DiffPart[] = [];
  let del = "";
  let add = "";
  const flush = () => {
    // El espacio con que terminan los dos lados queda fuera del cambio.
    const ws = (del && add && /\s+$/.exec(del)?.[0]) || "";
    const tail = ws && add.endsWith(ws) ? ws : "";
    if (tail) (del = del.slice(0, -tail.length)), (add = add.slice(0, -tail.length));
    if (del) out.push({ op: "-", text: del });
    if (add) out.push({ op: "+", text: add });
    if (tail) out.push({ op: "=", text: tail });
    del = add = "";
  };
  raw.forEach((p, k) => {
    if (p.op === "-") del += p.text;
    else if (p.op === "+") add += p.text;
    else if ((del || add) && !p.text.trim() && raw[k + 1] && raw[k + 1].op !== "=") {
      del += p.text;
      add += p.text;
    } else {
      flush();
      const last = out[out.length - 1];
      if (last?.op === "=") last.text += p.text;
      else out.push({ ...p });
    }
  });
  flush();
  return out.filter((p) => p.text);
}

/** ¿Un cambio de texto largo, que se lee mejor como diferencia que como «antes → después»? */
export const isLongText = (f: HistoryField | undefined, c: HistoryChange): boolean => (!f || f.type === "text") && !f?.options && typeof c.from === "string" && typeof c.to === "string" && Math.max(c.from.length, c.to.length) > 48;

// ---------------------------------------------------------------- valores y fechas

/** Cómo se lee un valor: la etiqueta de la opción, el monto, la fecha, el número o el texto. */
export function valueText(f: HistoryField | undefined, v: unknown, fmt: NxFormat, empty = "—"): string {
  if (v === null || v === undefined || v === "") return empty;
  const opt = f?.options?.find((o) => o.value === String(v));
  if (opt) return opt.label;
  if (typeof v === "number") return f?.type === "money" ? fmt.money(v, f) : fmt.number(v);
  if (f?.type === "date" && typeof v === "string") return fmt.date(v);
  return String(v);
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
/** Los formateadores, uno por locale y opciones: crearlos por cada evento pintado es lo caro. */
const dtfs = new Map<string, Intl.DateTimeFormat>();
const rtfs = new Map<string, Intl.RelativeTimeFormat>();
function dtf(locale: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = `${locale}|${JSON.stringify(o)}`;
  let f = dtfs.get(k);
  if (!f) dtfs.set(k, (f = new Intl.DateTimeFormat(locale, o)));
  return f;
}
/** Una fecha con `Intl`, cambiando por un espacio los separadores que dice `drop`: sin «de» por
 *  defecto («12 sept 2026, 3:40 p. m.» y no «12 de sept de 2026…»), como `nxFormat().date`. */
const fmtDate = (d: Date, locale: string, o: Intl.DateTimeFormatOptions, drop = /^\s*de\s*$/) =>
  dtf(locale, o)
    .formatToParts(d)
    .map((p) => (p.type === "literal" && drop.test(p.value) ? " " : p.value))
    .join("")
    .replace(/[\u00a0\u202f]/g, " ");

/** El encabezado de un día: «Hoy», «Ayer», «lunes 21 de septiembre» (con el año si no es este). */
export function dayLabel(d: Date, now: Date, locale: string, today: string, yesterday: string): string {
  const days = Math.round((dayStart(now) - dayStart(d)) / 864e5);
  return days === 0 ? today : days === 1 ? yesterday : fmtDate(d, locale, { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" }, /^,\s*$/);
}

/** La hora del día: «3:40 p. m.». */
export const clockText = (d: Date, locale: string): string => fmtDate(d, locale, { hour: "numeric", minute: "2-digit" });

/** Día y hora: «12 sept 2026, 3:40 p. m.». */
export const stampText = (d: Date, locale: string): string => fmtDate(d, locale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** Hace cuánto: «ahora», «hace 5 min», «hace 3 h»; de un día para atrás, la hora («3:40 p. m.»: el día lo dice el encabezado). */
export function relTime(d: Date, now: Date, locale: string): string {
  const s = (now.getTime() - d.getTime()) / 1000;
  if (s < 0 || s >= 86400) return clockText(d, locale);
  let r = rtfs.get(locale);
  if (!r) rtfs.set(locale, (r = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" })));
  return s < 45 ? r.format(0, "second") : s < 3600 ? r.format(-Math.max(1, Math.floor(s / 60)), "minute") : r.format(-Math.floor(s / 3600), "hour");
}

/** Los eventos agrupados por día, del más nuevo al más viejo (así se lee un historial). */
export function groupByDay(events: readonly HistoryEvent[]): HistoryEvent[][] {
  const out: HistoryEvent[][] = [];
  let key = NaN;
  for (let i = events.length - 1; i >= 0; i--) {
    const k = dayStart(atDate(events[i].at));
    if (k !== key) out.push([]), (key = k);
    out[out.length - 1].push(events[i]);
  }
  return out;
}

// ---------------------------------------------------------------- filtros

export interface HistoryFilter {
  actor?: string | null;
  field?: string | null;
  query?: string;
}

/** Cuántos eventos por persona y por campo (un evento cuenta una vez por campo que tocó). */
export function tally(events: readonly HistoryEvent[]): { actors: Map<string, number>; fields: Map<string, number> } {
  const actors = new Map<string, number>();
  const fields = new Map<string, number>();
  for (const e of events) {
    actors.set(e.actor.name, (actors.get(e.actor.name) ?? 0) + 1);
    for (const f of new Set((e.changes ?? []).map((c) => c.field))) fields.set(f, (fields.get(f) ?? 0) + 1);
  }
  return { actors, fields };
}

/** Los eventos que pasan los filtros: de esa persona, que tocan ese campo y que dicen lo buscado
 *  (en el nombre, la nota, el campo o sus valores; sin tildes ni mayúsculas). */
export function filterEvents(events: readonly HistoryEvent[], flt: HistoryFilter, fields: readonly HistoryField[], fmt: NxFormat): HistoryEvent[] {
  const q = foldText(flt.query?.trim() ?? "");
  return events.filter((e) => {
    if (flt.actor && e.actor.name !== flt.actor) return false;
    if (flt.field && !e.changes?.some((c) => c.field === flt.field)) return false;
    if (!q) return true;
    const f = (k: string) => fields.find((x) => x.key === k);
    const text = [e.actor.name, e.note, ...(e.changes ?? []).flatMap((c) => [f(c.field)?.label ?? c.field, valueText(f(c.field), c.from, fmt, ""), valueText(f(c.field), c.to, fmt, "")])].join(" ");
    return q.split(/\s+/).every((w) => foldText(text).includes(w));
  });
}
