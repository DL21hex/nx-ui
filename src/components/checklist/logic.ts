/**
 * `<nx-checklist>`: la lógica pura. Limpieza de lo que llega (atributos o servidor), avance y
 * vencidos (con la hora local), bloqueos por dependencias y por orden (los ciclos se rompen, nada se
 * cuelga), qué evidencia falta y el rango de un número. Todo lineal en el número de pasos.
 */
import { foldText } from "../../core/text";
import type {
  ChecklistEvidence,
  ChecklistEvidenceSpec,
  ChecklistLogEntry,
  ChecklistMissing,
  ChecklistOption,
  ChecklistPerson,
  ChecklistProgress,
  ChecklistState,
  ChecklistStep,
  ChecklistStepState,
  ChecklistSummaryItem,
} from "./types";

const TYPES = /^(photo|file|signature|note|number|choice)$/;
const STATUS = /^(todo|done|skipped|blocked)$/;

/** Lo que llega de afuera (JSON): se lee campo por campo y se valida. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** Un `id`: texto o número (como texto). */
const key = (v: unknown): string | undefined => str(v) ?? (typeof v === "number" ? String(v) : undefined);
const obj = (v: unknown): Raw | null => (v && typeof v === "object" ? (v as Raw) : null);
/** Sin las claves vacías (lo que no vino no aparece como `undefined`). */
function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}
/** Un JSON en texto, o el valor tal cual. */
export const parseJson = (v: unknown): unknown => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
};
const list = (v: unknown): unknown[] => {
  const l = parseJson(v);
  return Array.isArray(l) ? l : [];
};

/** «Hecho» u «omitido»: el paso ya no detiene a nadie. */
export const checklistResolved = (s: ChecklistStepState | undefined): boolean => s?.status === "done" || s?.status === "skipped";

export function cleanChecklistPerson(v: unknown): ChecklistPerson | undefined {
  const o = obj(v);
  const name = str(o?.name);
  return name ? compact({ id: key(o!.id), name, avatar: str(o!.avatar) }) : undefined;
}

/** Las opciones de `choice` como `{value, label, note}`. «No conforme» exige nota aunque no lo diga. */
export function checklistOptions(spec: ChecklistEvidenceSpec): ChecklistOption[] {
  const out: ChecklistOption[] = [];
  for (const o of spec.options ?? []) {
    const r = obj(o);
    const value = typeof o === "string" ? str(o) : (str(r?.value) ?? str(r?.label));
    const label = typeof o === "string" ? o : (str(r?.label) ?? value);
    if (value) out.push({ value, label: label!, note: typeof r?.note === "boolean" ? r.note : /^no conform/.test(foldText(label!)) });
  }
  return out;
}

function cleanSpec(v: unknown): ChecklistEvidenceSpec | null {
  const o = obj(v);
  if (!o || !TYPES.test(o.type)) return null;
  const count = num(o.count);
  return compact({
    type: o.type,
    label: str(o.label),
    min: num(o.min),
    max: num(o.max),
    unit: str(o.unit),
    accept: str(o.accept),
    count: count === undefined ? count : Math.max(0, Math.floor(count)),
    required: o.required === false ? false : undefined,
    options: Array.isArray(o.options) ? checklistOptions(o as ChecklistEvidenceSpec) : undefined,
  });
}

/**
 * Los pasos válidos (con `id` único y `title`), agrupados por sección en el orden en que aparece
 * cada una: así se pintan, y ese es el orden de `sequential`.
 */
export function cleanChecklistSteps(v: unknown): ChecklistStep[] {
  const seen = new Set<string>();
  const groups = new Map<string, ChecklistStep[]>();
  for (const x of list(v)) {
    const o = obj(x);
    const id = key(o?.id);
    const title = str(o?.title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    const s: ChecklistStep = compact({
      id,
      title,
      hint: str(o!.hint),
      section: str(o!.section)?.trim(),
      assignee: cleanChecklistPerson(o!.assignee),
      due: str(o!.due),
      required: o!.required === false ? false : undefined,
      canSkip: o!.canSkip === true || undefined,
      evidence: Array.isArray(o!.evidence) ? o!.evidence.map(cleanSpec).filter((x: unknown): x is ChecklistEvidenceSpec => !!x) : undefined,
      dependsOn: Array.isArray(o!.dependsOn) ? o!.dependsOn.map(key).filter((d: string | undefined): d is string => !!d) : undefined,
    });
    const k = s.section ?? "";
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(s);
  }
  return [...groups.values()].flat();
}

function cleanEvidence(v: unknown): ChecklistEvidence | null {
  const o = obj(v);
  if (!o || !TYPES.test(o.type)) return null;
  const sig = obj(o.signature);
  return compact({
    type: o.type,
    files: Array.isArray(o.files) ? o.files.map(obj).filter((f: Raw | null): f is Raw => !!str(f?.name)).map((f: Raw) => compact({ name: f.name, type: str(f.type), size: num(f.size), url: str(f.url), id: str(f.id) })) : undefined,
    signature: str(sig?.svg) ? { svg: sig!.svg, meta: sig!.meta } : undefined,
    value: typeof o.value === "string" ? o.value : num(o.value),
    outOfRange: o.outOfRange === true || undefined,
  });
}

export function cleanChecklistStepState(v: unknown): ChecklistStepState | null {
  const o = obj(v);
  if (!o || !STATUS.test(o.status)) return null;
  return compact({
    status: o.status,
    by: cleanChecklistPerson(o.by),
    at: str(o.at),
    evidence: Array.isArray(o.evidence) ? o.evidence.map(cleanEvidence).filter((x: unknown): x is ChecklistEvidence => !!x) : undefined,
    reason: str(o.reason),
    note: str(o.note),
  });
}

/** El estado por `id` (también una lista `[{id, status, …}]`). */
export function cleanChecklistState(v: unknown): ChecklistState {
  const o = obj(parseJson(v));
  const out: ChecklistState = {};
  for (const [id, raw] of Array.isArray(o) ? o.map((x) => [key(x?.id), x]) : Object.entries(o ?? {})) {
    const s = id && cleanChecklistStepState(raw);
    if (s) out[id] = s;
  }
  return out;
}

export function cleanChecklistLog(v: unknown): ChecklistLogEntry[] {
  const out: ChecklistLogEntry[] = [];
  for (const x of list(v)) {
    const o = obj(x);
    if (o && str(o.at) && /^(done|skipped|reopened|blocked|closed|reverted)$/.test(o.action))
      out.push(compact({ action: o.action, step: key(o.step), by: cleanChecklistPerson(o.by), at: o.at, reason: str(o.reason) }));
  }
  return out;
}

export function cleanChecklistItems(v: unknown): ChecklistSummaryItem[] {
  const out: ChecklistSummaryItem[] = [];
  for (const x of list(v)) {
    const o = obj(x);
    if (!str(o?.title)) continue;
    const total = Math.max(0, num(o!.total) ?? 0);
    out.push(
      compact({
        id: key(o!.id) ?? String(out.length),
        title: o!.title,
        href: str(o!.href),
        done: Math.min(total, Math.max(0, num(o!.done) ?? 0)),
        total,
        overdue: Math.max(0, num(o!.overdue) ?? 0),
        assignee: cleanChecklistPerson(o!.assignee),
        due: str(o!.due),
      }),
    );
  }
  return out;
}

/** La bitácora que se deduce del estado (quién hizo u omitió cada paso), cuando el servidor no manda la suya. */
export function checklistLogFromState(steps: readonly ChecklistStep[], state: ChecklistState): ChecklistLogEntry[] {
  const out: ChecklistLogEntry[] = [];
  for (const s of steps) {
    const st = state[s.id];
    if (st?.at && st.status !== "todo") out.push(compact({ action: st.status, step: s.id, by: st.by, at: st.at, reason: st.reason }));
  }
  return out.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

// ---------------------------------------------------------------- fechas

/**
 * Cuándo vence (ms): un día solo («2026-09-30») vence al final de ese día en la hora local; una
 * fecha con hora sin zona («2026-09-30T17:00») es hora local; con zona, la que diga. `null` si no se entiende.
 */
export function checklistDueTime(due: string | undefined): number | null {
  if (!due) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(due.trim());
  const t = m ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999).getTime() : Date.parse(due);
  return Number.isFinite(t) ? t : null;
}

const dayOf = (t: number) => new Date(t).setHours(0, 0, 0, 0);
type Fmt = Intl.DateTimeFormat | Intl.RelativeTimeFormat | Intl.NumberFormat;
// Formateadores por locale (el locale llega de `resolveLocale`: siempre canónico, `Intl` no lanza).
const fmts = new Map<string, Fmt>();
function cached<T extends Fmt>(k: string, make: () => T): T {
  let f = fmts.get(k) as T | undefined;
  if (!f) fmts.set(k, (f = make()));
  return f;
}
const dtf = (locale: string, o: Intl.DateTimeFormatOptions) => cached(`d${locale}${JSON.stringify(o)}`, () => new Intl.DateTimeFormat(locale, o));
const clean = (s: string) => s.replace(/[  ]/g, " ").replace(/ de /g, " ");
/** «5:00 p. m.». */
export const checklistClock = (t: number, locale: string): string => clean(dtf(locale, { hour: "numeric", minute: "2-digit" }).format(t));
/** «3 oct» (con el año si no es este). */
export function checklistDay(t: number, now: number, locale: string): string {
  const y = new Date(t).getFullYear() !== new Date(now).getFullYear();
  return clean(dtf(locale, { day: "numeric", month: "short", year: y ? "numeric" : undefined }).format(t)).replace(/\.$/, "");
}

export interface ChecklistDueLabels {
  due: string;
  late: string;
  today: string;
  tomorrow: string;
  yesterday: string;
}

/** «vence hoy 5:00 p. m.», «vence mañana», «venció ayer 8:00 a. m.», «vence 3 oct». */
export function checklistDueText(due: string | undefined, now: number, locale: string, L: ChecklistDueLabels): { text: string; late: boolean } | null {
  const t = checklistDueTime(due);
  if (t === null) return null;
  const late = t < now;
  const days = Math.round((dayOf(t) - dayOf(now)) / 864e5);
  const day = days === 0 ? L.today : days === 1 ? L.tomorrow : days === -1 ? L.yesterday : checklistDay(t, now, locale);
  const timed = !/^\d{4}-\d{2}-\d{2}$/.test(due!.trim());
  const when = timed && Math.abs(days) <= 1 ? `${day} ${checklistClock(t, locale)}` : day;
  return { text: (late ? L.late : L.due).replace("{when}", when), late };
}

/** «ahora», «hace 5 min», «hace 2 h», «ayer», «hace 3 días»; de una semana para atrás, el día. */
export function checklistAgo(at: string | undefined, now: number, locale: string): string {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return "";
  const s = (now - t) / 1000;
  if (s < 0 || s >= 7 * 86400) return checklistDay(t, now, locale);
  const r = cached(`r${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" }));
  const f = (n: number, u: Intl.RelativeTimeFormatUnit) => clean(r.format(n, u));
  if (s < 45) return f(0, "second");
  if (s < 3600) return f(-Math.max(1, Math.floor(s / 60)), "minute");
  if (s < 86400 && dayOf(t) === dayOf(now)) return f(-Math.floor(s / 3600), "hour");
  return f(-Math.max(1, Math.round((dayOf(now) - dayOf(t)) / 864e5)), "day");
}

// ---------------------------------------------------------------- números

const nf = (locale: string) => cached(`n${locale}`, () => new Intl.NumberFormat(locale, { maximumFractionDigits: 4 }));
/** «1.234,5» (es) · «1,234.5» (en). */
export const checklistNumber = (n: number, locale: string): string => clean(nf(locale).format(n));

/**
 * Lo que alguien escribe → número, con el separador decimal del locale («2,5» en es-CO, «2.5» en
 * en-US). Los miles solo se quitan si agrupan de verdad («1.200» es 1200 en es-CO); «2.5» en es-CO es
 * 2,5 (quien escribe a la inglesa). `null` si no hay número.
 */
export function checklistParseNumber(text: string, locale: string): number | null {
  const parts = nf(locale).formatToParts(12345.6);
  const dec = parts.find((p) => p.type === "decimal")?.value ?? ",";
  const grp = parts.find((p) => p.type === "group")?.value ?? ".";
  let t = text.replace(/[\s  ]/g, "");
  const groups = t.split(grp);
  if (t.includes(dec)) t = groups.join("").replace(dec, ".");
  else if (groups.length > 1 && /^-?\d{1,3}$/.test(groups[0]) && groups.slice(1).every((g) => /^\d{3}$/.test(g))) t = groups.join("");
  else t = t.replace(/,/g, ".");
  t = t.replace(/[^\d.-]/g, "");
  const n = /\d/.test(t) ? Number(t) : NaN;
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------- avance y bloqueos

/** ¿Vencido? Sin hacer (ni omitido) y con la fecha límite pasada. */
export const checklistOverdue = (step: ChecklistStep, st: ChecklistStepState | undefined, now: number): boolean => {
  const t = checklistDueTime(step.due);
  return t !== null && t < now && !checklistResolved(st);
};

export function checklistProgress(steps: readonly ChecklistStep[], state: ChecklistState, now = Date.now()): ChecklistProgress {
  const p: ChecklistProgress = { done: 0, total: steps.length, required: 0, requiredDone: 0, skipped: 0, overdue: 0, complete: false };
  for (const s of steps) {
    const st = state[s.id];
    const ok = checklistResolved(st);
    if (ok) p.done++;
    if (st?.status === "skipped") p.skipped++;
    if (s.required !== false) {
      p.required++;
      if (ok) p.requiredDone++;
    }
    if (checklistOverdue(s, st, now)) p.overdue++;
  }
  p.complete = p.required > 0 && p.requiredDone === p.required;
  return p;
}

/**
 * Las dependencias limpias: solo pasos que existen, sin el propio paso y sin ciclos. Los ciclos se
 * encuentran con Tarjan (componentes fuertemente conexas, iterativo: una cadena de 30 000 no revienta
 * la pila) y se sueltan las dependencias DENTRO de cada ciclo: el ciclo queda libre en vez de
 * bloqueado para siempre, y lo que dependía de él sigue esperándolo. `cycles` son esos pasos.
 */
export function checklistDeps(steps: readonly ChecklistStep[]): { deps: Map<string, string[]>; cycles: string[] } {
  const ids = new Set(steps.map((s) => s.id));
  const deps = new Map<string, string[]>();
  for (const s of steps) deps.set(s.id, [...new Set(s.dependsOn ?? [])].filter((x) => x !== s.id && ids.has(x)));
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const comp = new Map<string, number>();
  const size: number[] = [];
  const stack: string[] = [];
  let n = 0;
  for (const root of ids) {
    if (index.has(root)) continue;
    const work: [string, number][] = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const v = top[0];
      if (!index.has(v)) {
        index.set(v, n);
        low.set(v, n++);
        stack.push(v);
      }
      const ds = deps.get(v)!;
      if (top[1] < ds.length) {
        const w = ds[top[1]++];
        if (!index.has(w)) work.push([w, 0]);
        else if (!comp.has(w)) low.set(v, Math.min(low.get(v)!, index.get(w)!));
        continue;
      }
      work.pop();
      if (work.length) {
        const u = work[work.length - 1][0];
        low.set(u, Math.min(low.get(u)!, low.get(v)!));
      }
      if (low.get(v) === index.get(v)) {
        const c = size.push(0) - 1;
        let w: string;
        do {
          w = stack.pop()!;
          comp.set(w, c);
          size[c]++;
        } while (w !== v);
      }
    }
  }
  const cycles = steps.filter((s) => size[comp.get(s.id)!] > 1).map((s) => s.id);
  for (const id of cycles) deps.set(id, deps.get(id)!.filter((x) => comp.get(x) !== comp.get(id)));
  return { deps, cycles };
}

/** `sequential`: todo el procedimiento (`true`) o solo esas secciones. */
export type ChecklistSequence = boolean | readonly string[];

/**
 * Qué detiene a cada paso: el `id` del primero que falta (su dependencia, o el paso requerido
 * anterior de su secuencia), o `""` si el servidor lo marcó `blocked`. Los que no aparecen están libres.
 * Un paso hecho no se bloquea (se puede ver y reabrir).
 */
export function checklistBlocks(steps: readonly ChecklistStep[], state: ChecklistState, sequential: ChecklistSequence = false, deps = checklistDeps(steps).deps): Map<string, string> {
  const out = new Map<string, string>();
  const secs = Array.isArray(sequential) ? new Set(sequential) : null;
  /** Por secuencia (toda o por sección): el primer requerido sin resolver hasta aquí. */
  const firstOpen = new Map<string, string>();
  for (const s of steps) {
    const st = state[s.id];
    const inSeq = sequential === true || !!secs?.has(s.section ?? "");
    const key = sequential === true ? "" : (s.section ?? "");
    if (!checklistResolved(st)) {
      const dep = deps.get(s.id)?.find((d) => !checklistResolved(state[d]));
      const seq = inSeq ? firstOpen.get(key) : undefined;
      if (seq !== undefined) out.set(s.id, seq);
      else if (dep !== undefined) out.set(s.id, dep);
      else if (st?.status === "blocked") out.set(s.id, "");
    }
    if (inSeq && s.required !== false && !checklistResolved(st) && !firstOpen.has(key)) firstOpen.set(key, s.id);
  }
  return out;
}

// ---------------------------------------------------------------- evidencia

/** `true` dentro de `min`–`max` (inclusive), `false` fuera, `null` sin número. */
export function checklistInRange(value: unknown, spec: Pick<ChecklistEvidenceSpec, "min" | "max">): boolean | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return !((spec.min !== undefined && value < spec.min) || (spec.max !== undefined && value > spec.max));
}

/** ¿Lo entregado pide explicar una novedad (un número fuera de rango, una opción con `note`)? */
export function checklistNeedsNote(step: ChecklistStep, ev: readonly (ChecklistEvidence | undefined)[]): boolean {
  return (step.evidence ?? []).some((spec, i) => {
    const v = ev[i]?.value;
    if (spec.type === "number") return checklistInRange(v, spec) === false;
    return spec.type === "choice" && v != null && !!checklistOptions(spec).find((o) => o.value === v)?.note;
  });
}

const filled = (e: ChecklistEvidence | undefined, type: string): number =>
  !e
    ? 0
    : type === "photo" || type === "file"
      ? (e.files?.length ?? 0)
      : type === "signature"
        ? +!!e.signature?.svg
        : type === "number"
          ? +(typeof e.value === "number" && Number.isFinite(e.value))
          : +(typeof e.value === "string" ? !!e.value.trim() : e.value != null);

/**
 * Qué falta para marcar el paso como hecho: cada evidencia obligatoria vacía (o con menos fotos que
 * `count`) y, si hay una novedad, su nota (la evidencia `note` del paso, o la nota aparte: `index` -1).
 */
export function checklistMissing(step: ChecklistStep, ev: readonly (ChecklistEvidence | undefined)[], note = ""): { missing: ChecklistMissing[]; needsNote: boolean; outOfRange: boolean } {
  const specs = step.evidence ?? [];
  const missing: ChecklistMissing[] = [];
  const needsNote = checklistNeedsNote(step, ev);
  const outOfRange = specs.some((s, i) => s.type === "number" && checklistInRange(ev[i]?.value, s) === false);
  let noteAt = -1;
  specs.forEach((spec, i) => {
    if (spec.type === "note" && noteAt < 0) noteAt = i;
    const have = filled(ev[i], spec.type);
    const want = spec.type === "photo" || spec.type === "file" ? Math.max(1, spec.count ?? 1) : 1;
    const must = spec.required !== false || (needsNote && i === noteAt);
    if (must && have < want) missing.push({ index: i, type: spec.type, label: spec.label, ...(want > 1 || have ? { need: want - have } : {}) });
  });
  if (needsNote && noteAt < 0 && !note.trim()) missing.push({ index: -1, type: "note" });
  return { missing, needsNote, outOfRange };
}

/** La evidencia vacía de un paso (una por cada una que pide). */
export const checklistBlankEvidence = (step: ChecklistStep): ChecklistEvidence[] => (step.evidence ?? []).map((s) => ({ type: s.type }));

// ---------------------------------------------------------------- summary

export type ChecklistSort = "due" | "progress" | "title";

/** Por vencimiento (los que tienen vencidos, luego por fecha; sin fecha al final), por avance (el menos avanzado primero) o por nombre. */
export function sortChecklistItems(items: readonly ChecklistSummaryItem[], by: ChecklistSort, compare: (a: string, b: string) => number = (a, b) => a.localeCompare(b)): ChecklistSummaryItem[] {
  const pct = (i: ChecklistSummaryItem) => (i.total ? i.done / i.total : 1);
  const due = (i: ChecklistSummaryItem) => checklistDueTime(i.due) ?? Infinity;
  return [...items].sort((a, b) =>
    by === "title"
      ? compare(a.title, b.title)
      : by === "progress"
        ? pct(a) - pct(b) || compare(a.title, b.title)
        : +!a.overdue - +!b.overdue || due(a) - due(b) || (b.overdue ?? 0) - (a.overdue ?? 0) || compare(a.title, b.title),
  );
}
