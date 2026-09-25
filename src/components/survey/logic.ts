/** Lógica pura de la encuesta: validar, qué preguntas se ven, insertar respuestas y agregar resultados. Sin DOM. */
import { foldText } from "../../core/text";
import type { SurveyAnswer, SurveyAnswers, SurveyCondition, SurveyQuestion, SurveyQuestionResult, SurveyResults, SurveyType } from "./types";

const TYPES = new Set<SurveyType>(["choice", "multi", "scale", "rating", "text", "rank", "slider"]);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Las preguntas válidas, copiadas sin lo que no es suyo. Un `id` repetido o un tipo desconocido se descartan. */
export function cleanQuestions(v: unknown): SurveyQuestion[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: SurveyQuestion[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = str(o.id);
    const title = str(o.title);
    if (!id || !title || !TYPES.has(o.type as SurveyType) || seen.has(id)) continue;
    const type = o.type as SurveyType;
    const options = Array.isArray(o.options)
      ? o.options
          .map((x) => (typeof x === "string" ? { value: x, label: x } : x && typeof x === "object" && (str(x.value) || typeof x.value === "number") ? { value: String(x.value), label: str(x.label) ?? String(x.value), emoji: str(x.emoji), hint: str(x.hint) } : null))
          .filter((x): x is NonNullable<typeof x> => !!x)
      : undefined;
    if ((type === "choice" || type === "multi" || type === "rank") && !options?.length) continue;
    seen.add(id);
    const conds = (Array.isArray(o.when) ? o.when : o.when ? [o.when] : []).filter((c): c is SurveyCondition => !!c && typeof c === "object" && !!str((c as SurveyCondition).question));
    out.push({
      id,
      type,
      title,
      description: str(o.description),
      required: o.required === true || undefined,
      options,
      other: o.other === true || undefined,
      min: num(o.min),
      max: num(o.max),
      step: num(o.step),
      minLabel: str(o.minLabel),
      maxLabel: str(o.maxLabel),
      nps: o.nps === true || undefined,
      icon: o.icon === "face" ? "face" : o.icon === "star" ? "star" : undefined,
      long: o.long === true || undefined,
      placeholder: str(o.placeholder),
      format: o.format === "money" || o.format === "percent" || o.format === "number" ? o.format : undefined,
      currency: str(o.currency),
      unit: str(o.unit),
      when: conds.length ? conds : undefined,
    });
  }
  return out;
}

/** El rango de una pregunta numérica: NPS 0–10, escala 1–5, estrellas 1–5, deslizador 0–100 por defecto. */
export function rangeOf(q: SurveyQuestion): { min: number; max: number; step: number } {
  if (q.type === "scale") return q.nps ? { min: 0, max: 10, step: 1 } : { min: q.min ?? 1, max: q.max ?? 5, step: 1 };
  if (q.type === "rating") return { min: 1, max: q.max ?? 5, step: 1 };
  return { min: q.min ?? 0, max: q.max ?? 100, step: q.step ?? 1 };
}

export function isAnswered(a: SurveyAnswer | undefined): boolean {
  if (a === undefined || a === null) return false;
  if (Array.isArray(a)) return a.length > 0;
  return typeof a === "number" ? Number.isFinite(a) : a.trim() !== "";
}

function holds(c: SurveyCondition, a: SurveyAnswer | undefined): boolean {
  if (c.answered !== undefined) return isAnswered(a) === c.answered;
  if (!isAnswered(a)) return false;
  const list = Array.isArray(a) ? a : [a];
  if (c.equals !== undefined && !list.some((x) => String(x) === String(c.equals))) return false;
  if (c.in && !list.some((x) => c.in!.map(String).includes(String(x)))) return false;
  if (c.lt !== undefined && !(typeof a === "number" && a < c.lt)) return false;
  if (c.gt !== undefined && !(typeof a === "number" && a > c.gt)) return false;
  return true;
}

/** ¿Se muestra? Todas sus condiciones se cumplen (y la pregunta de la que depende también se ve). */
export function isVisible(q: SurveyQuestion, answers: SurveyAnswers, all: readonly SurveyQuestion[], depth = 0): boolean {
  if (!q.when || depth > 20) return true;
  const conds = Array.isArray(q.when) ? q.when : [q.when];
  return conds.every((c) => {
    const dep = all.find((x) => x.id === c.question);
    return (!dep || isVisible(dep, answers, all, depth + 1)) && holds(c, answers[c.question]);
  });
}

export function visibleQuestions(all: readonly SurveyQuestion[], answers: SurveyAnswers): SurveyQuestion[] {
  return all.filter((q) => isVisible(q, answers, all));
}

/** Las respuestas de las preguntas que se ven (lo que se contestó en una rama que se abandonó no se envía). */
export function answersToSend(all: readonly SurveyQuestion[], answers: SurveyAnswers): SurveyAnswers {
  const out: SurveyAnswers = {};
  for (const q of visibleQuestions(all, answers)) if (isAnswered(answers[q.id])) out[q.id] = answers[q.id];
  return out;
}

/** «a», «a y b», «a, b y c» (con la conjunción del idioma). */
export function listText(items: string[], and = "y"): string {
  if (items.length < 2) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

/** Cómo se lee una respuesta: la etiqueta de la opción, la lista, o el número. */
export function answerText(q: SurveyQuestion | undefined, a: SurveyAnswer | undefined): string {
  if (!isAnswered(a)) return "";
  const label = (v: string) => q?.options?.find((o) => o.value === v)?.label ?? v;
  if (Array.isArray(a)) return listText(a.map(label));
  return typeof a === "number" ? String(a) : label(String(a));
}

/** `{{id}}` en un texto → la respuesta a esa pregunta. Sin respuesta, `missing` (por defecto se
 *  quita con su espacio; una pregunta que aún no llega puede mostrar «…»). */
export function interpolate(text: string, answers: SurveyAnswers, all: readonly SurveyQuestion[], missing = ""): string {
  return text
    .replace(/\{\{\s*([\w-]+)\s*\}\}/g, (_, id: string) => answerText(all.find((q) => q.id === id), answers[id]) || missing)
    .replace(/\s{2,}/g, " ")
    .trim();
}

export type Invalid = { key: "required" | "minChoices" | "maxChoices" | "minLength"; n?: number };

/** Por qué una respuesta no sirve todavía, o `null`. */
export function validate(q: SurveyQuestion, a: SurveyAnswer | undefined): Invalid | null {
  if (!isAnswered(a)) return q.required ? { key: "required" } : null;
  if (q.type === "multi" && Array.isArray(a)) {
    if (q.min !== undefined && a.length < q.min) return { key: "minChoices", n: q.min };
    if (q.max !== undefined && a.length > q.max) return { key: "maxChoices", n: q.max };
  }
  if (q.type === "text" && typeof a === "string" && q.min !== undefined && a.trim().length < q.min) return { key: "minLength", n: q.min };
  return null;
}

/** Minutos que toma, redondeando hacia arriba: una elección ~6 s, un texto ~25 s, ordenar ~15 s. */
export function estimateMinutes(qs: readonly SurveyQuestion[]): number {
  const s = qs.reduce((t, q) => t + (q.type === "text" ? (q.long ? 40 : 20) : q.type === "rank" ? 15 : q.type === "multi" ? 9 : 6), 0);
  return Math.max(1, Math.ceil(s / 60));
}

/** Net Promoter Score de respuestas 0–10: % de promotores (9–10) − % de detractores (0–6). */
export function npsOf(values: readonly number[]): { score: number; promoters: number; passives: number; detractors: number } {
  let p = 0;
  let d = 0;
  for (const v of values) {
    if (v >= 9) p++;
    else if (v <= 6) d++;
  }
  const n = values.length;
  return { score: n ? Math.round(((p - d) / n) * 100) : 0, promoters: p, passives: n - p - d, detractors: d };
}

/** Palabras vacías que no dicen nada en una nube (español e inglés, lo básico). */
const STOP = new Set(
  "a al algo algun alguna algunas alguno algunos ante antes aqui asi aun cada como con contra cual cuando de del desde donde dos el ella ellas ellos en entre era es esa ese eso esta estan este esto estos fue ha hay la las le les lo los mas me mi mis mucho muy nada ni no nos o otra otro para pero poco por porque que se sea ser si sin sobre solo son su sus tambien tan te tener tiene todo todos tu un una uno unos y ya yo the and for with that this are was not you but have has".split(" "),
);

/** Las `n` palabras más repetidas (sin tildes ni mayúsculas para contar; se muestra la forma más
 *  común, así «ERP» sigue en mayúsculas). */
export function topWords(texts: readonly string[], n = 12): [string, number][] {
  const counts = new Map<string, { n: number; forms: Map<string, number> }>();
  for (const t of texts) {
    for (const w of t.match(/[\p{L}\p{N}]{3,}/gu) ?? []) {
      const k = foldText(w);
      if (STOP.has(k)) continue;
      let e = counts.get(k);
      if (!e) counts.set(k, (e = { n: 0, forms: new Map() }));
      e.n++;
      e.forms.set(w, (e.forms.get(w) ?? 0) + 1);
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, n)
    .map((e) => {
      const w = [...e.forms].sort((a, b) => b[1] - a[1])[0][0];
      // «Mejor» al inicio de una frase se muestra «mejor»; una sigla («ERP») se queda como está.
      return [/^\p{Lu}[\p{Ll}\p{N}]+$/u.test(w) ? w.toLowerCase() : w, e.n];
    });
}

/**
 * Los resultados de muchas respuestas, en la forma que pinta la encuesta. Sirve igual en el
 * navegador (la demo) que en un backend en JavaScript.
 */
export function aggregate(qs: readonly SurveyQuestion[], responses: readonly SurveyAnswers[]): SurveyResults {
  const questions: Record<string, SurveyQuestionResult> = {};
  for (const q of qs) {
    const given = responses.map((r) => r[q.id]).filter(isAnswered) as SurveyAnswer[];
    const r: SurveyQuestionResult = { n: given.length };
    if (q.type === "choice" || q.type === "multi" || q.type === "scale" || q.type === "rating") {
      r.counts = {};
      for (const a of given) for (const v of Array.isArray(a) ? a : [a]) r.counts[String(v)] = (r.counts[String(v)] ?? 0) + 1;
    }
    const nums = given.filter((a): a is number => typeof a === "number");
    if (nums.length) r.avg = Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10;
    if (q.type === "scale" && q.nps) r.nps = npsOf(nums);
    if (q.type === "rank") {
      r.ranks = {};
      for (const o of q.options ?? []) {
        const pos = given.map((a) => (Array.isArray(a) ? a.indexOf(o.value) : -1)).filter((i) => i >= 0);
        if (pos.length) r.ranks[o.value] = Math.round((pos.reduce((s, i) => s + i + 1, 0) / pos.length) * 10) / 10;
      }
    }
    if (q.type === "text") r.words = topWords(given.filter((a): a is string => typeof a === "string"));
    questions[q.id] = r;
  }
  return { total: responses.length, questions };
}

/** A, B, C… para elegir con el teclado (hasta la Z). */
export const letterOf = (i: number): string => String.fromCharCode(65 + i);

/** Qué decir justo después de responder (el «eco»): cómo respondieron los demás. */
export type SurveyEcho =
  | { kind: "same"; pct: number }
  | { kind: "multi"; value: string; pct: number }
  | { kind: "nps"; band: 0 | 1 | 2; pct: number }
  | { kind: "above"; pct: number }
  | { kind: "avg"; avg: number }
  | { kind: "rank"; top: string };

/**
 * El eco de una respuesta, o `null` si no hay nada que decir. Elección: cuántos respondieron lo
 * mismo. Varias: la opción propia más elegida. NPS: el grupo (detractor, pasivo, promotor) y cuántos
 * hay en él. Escala y calificación: por encima de cuántos quedó. Deslizador: el promedio. Ordenar:
 * lo que la mayoría puso primero.
 */
export function echoOf(q: SurveyQuestion, r: SurveyQuestionResult | undefined, a: SurveyAnswer | undefined): SurveyEcho | null {
  if (!r || !r.n || !isAnswered(a)) return null;
  const pct = (c: number) => Math.round((c / r.n) * 100);
  const counts = r.counts ?? {};
  switch (q.type) {
    case "choice":
      return counts[String(a)] !== undefined ? { kind: "same", pct: pct(counts[String(a)]) } : null;
    case "multi": {
      const best = (a as string[]).filter((v) => counts[v] !== undefined).sort((x, y) => counts[y] - counts[x])[0];
      return best ? { kind: "multi", value: best, pct: pct(counts[best]) } : null;
    }
    case "scale":
    case "rating": {
      const v = Number(a);
      if (q.nps && r.nps) {
        const band = v >= 9 ? 2 : v >= 7 ? 1 : 0;
        return { kind: "nps", band, pct: pct([r.nps.detractors, r.nps.passives, r.nps.promoters][band]) };
      }
      const below = Object.entries(counts).reduce((s, [k, c]) => s + (Number(k) < v ? c : 0), 0);
      return below ? { kind: "above", pct: pct(below) } : r.avg !== undefined ? { kind: "avg", avg: r.avg } : null;
    }
    case "slider":
      return r.avg !== undefined ? { kind: "avg", avg: r.avg } : null;
    case "rank": {
      const top = Object.entries(r.ranks ?? {}).sort((x, y) => x[1] - y[1])[0];
      return top ? { kind: "rank", top: top[0] } : null;
    }
    default:
      return null;
  }
}
