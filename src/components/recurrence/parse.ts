/**
 * El intérprete de `<nx-recurrence>`, puro: una frase en español de Colombia (o inglés básico) →
 * la regla. Tolerante con tildes, mayúsculas, «a las 5 de la tarde», «17:00», «5pm» y números en
 * letras hasta 31; lo que no entiende lo dice («no entiendo "quincenal los"») sin lanzar.
 *
 * Va aparte de `logic.ts` para que el elemento lo traiga con `import()` solo cuando hay algo escrito
 * que entender: una RRULE que llega del backend se muestra sin él.
 */
import { addMonths, dayOf, isoOf, MONTH_RX as MON, monthNum, todayOf, validDay, ymd } from "../../core/days";
import { foldText } from "../../core/text";
import { fillRule, FREQS, parseRRule, RRULE_RX, uniq, wd } from "./logic";
import type { RecurrenceFreq, RecurrenceHolidayMode, RecurrenceParse, RecurrenceParseOptions, RecurrenceRule, RecurrenceWeekday } from "./types";

const WORKWEEK = [0, 1, 2, 3, 4];
const is = (rx: string, s: string) => new RegExp(`^${rx}$`).test(s);

const WDR = "(lunes|martes|miercoles|jueves|viernes|sabados?|domingos?)";
const wdNum = (w: string) => ["lu", "ma", "mi", "ju", "vi", "sa", "do"].indexOf(w.slice(0, 2));
const ORDW = "(?:primer[oa]?|segund[oa]|tercer[oa]?|cuart[oa]|quint[oa]|ultim[oa]|penultim[oa]|[1-5])";
const ordNum = (w: string) => (/\d/.test(w) ? +w : w[0] === "u" ? -1 : w.startsWith("pe") ? -2 : ["pr", "se", "te", "cu", "qu"].indexOf(w.slice(0, 2)) + 1);
/** Una hora: «7», «7:30», «5 pm», «5 de la tarde», «7 y media», «12 m» (meridiano). */
const TS = "(\\d{1,2})(?::(\\d{2}))?(?: ?(am|pm|m|de la (?:manana|madrugada|tarde|noche)|y media|y cuarto|en punto|horas|h)(?= |$))?";
const TR = TS.replace(/\((?!\?)/g, "(?:");
const DATE = `(hoy|pasado manana|manana|${WDR}|\\d{4}-\\d{1,2}-\\d{1,2}|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?|\\d{1,2} (?:de )?${MON}(?: (?:de |del )?\\d{4})?|${MON} \\d{1,2}(?: \\d{4})?|${MON}(?: (?:de |del )?\\d{4})?)`;
const F: Record<string, RecurrenceFreq> = { dia: "DAILY", semana: "WEEKLY", mes: "MONTHLY", ano: "YEARLY" };

/** Las horas de un texto, en minutos del día; `null` si alguna no existe («13 pm»). */
export function clockTimes(s: string): number[] | null {
  const out: number[] = [];
  for (const x of s.matchAll(new RegExp(`${TS}|(mediodia)|(medianoche)`, "g"))) {
    let h = +x[1];
    let m = +(x[2] ?? 0);
    const suf = x[3] ?? "";
    if (x[4] || x[5]) (h = x[4] ? 12 : 0), (m = 0);
    else if (suf[0] === "y") m += suf[2] === "m" ? 30 : 15;
    else if (/^(pm|de la [tn])/.test(suf)) h = h > 12 || !h ? 99 : (h % 12) + 12;
    else if (/^(am|de la m)/.test(suf)) h = h > 12 || !h ? 99 : h % 12;
    else if (suf === "m" && h !== 12) h = 99;
    if (h > 23 || m > 59) return null;
    out.push(h * 60 + m);
  }
  return out;
}

/** Las horas de lo que alguien escribe en un control («17:00», «5 p. m.», «8, 14:30»). */
export const readClock = (s: string): number[] | null => clockTimes(words(s, false)[0].join(" "));

/** «el lunes», «15 de marzo», «2026-12-31», «diciembre»: el próximo desde `ref` (incluido). Con
 *  `end`, un mes solo es su último día. */
function dateOf(s: string, ref: number, end = false): number | null {
  if (s === "hoy") return ref;
  if (s.endsWith("manana")) return ref + (s[0] === "p" ? 2 : 1);
  if (is(WDR, s)) return ref + ((wdNum(s) - wd(ref) + 6) % 7) + 1;
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (x) return validDay(+x[1], +x[2], +x[3]);
  let y: number | undefined;
  let m: number;
  let d: number | undefined;
  if ((x = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(s))) [d, m, y] = [+x[1], +x[2], x[3] ? +x[3] + (x[3].length === 2 ? 2000 : 0) : undefined];
  else {
    m = monthNum(new RegExp(MON).exec(s)![1]);
    for (const n of s.match(/\d+/g) ?? []) n.length === 4 ? (y = +n) : (d = +n);
  }
  const make = (yy: number) => (d === undefined ? dayOf(yy, m + (end ? 1 : 0), end ? 0 : 1) : validDay(yy, m, d));
  if (y !== undefined) return make(y);
  const y0 = ymd(ref)[0];
  for (let k = 0; k < 8; k++) {
    const v = make(y0 + k);
    if (v !== null && (d === undefined ? dayOf(y0 + k, m + 1, 0) : v) >= ref) return v;
  }
  return null;
}

/** Lo que se va entendiendo de la frase. */
interface St {
  f?: RecurrenceFreq;
  i?: number;
  /** «de cada mes»: la frecuencia si nada más la dice. */
  mk?: RecurrenceFreq;
  days: number[];
  ord: RecurrenceWeekday[];
  md: number[];
  pos: number[];
  mo: number[];
  dates: number[][];
  t: number[];
  win?: number[];
  step?: number;
  from?: number;
  until?: number;
  dur?: [number, string];
  count?: number;
  hol?: RecurrenceHolidayMode;
  /** «hábil» con ordinal: los festivos se quitan antes de elegir. */
  hs?: boolean;
  /** «días hábiles» (1, sin festivos) o «entre semana» (2). */
  wk?: number;
  /** Las palabras de las horas y de las fechas, para decir cuál no se puede guardar. */
  tsrc?: string;
  dsrc?: string;
}
type Clause = [string, (x: RegExpExecArray, p: St, ref: number, src: string) => unknown];

const CLAUSES: Clause[] = [
  // «si cae festivo, el día hábil anterior» / «… se corre al siguiente».
  [
    "si (?:cae|es|coincide con|toca)(?: (?:en|un|una|el|a|dia))* festivos?(?: (?:se|lo|la|le|corre|mueve|pasa|pasar|correr|mover|para|al|a|el|dia|habil|entonces))* (anterior|antes|siguiente|despues|posterior)(?: dia| habil)*",
    (x, p) => (p.hol = x[1][0] === "a" ? "before" : "after"),
  ],
  ["(?:menos|excepto|salvo|sin|no|pero no|que no (?:sea|caiga))(?: (?:los|las|en|el|un|dia|dias))* festivos?", (_, p) => (p.hol = "skip")],
  // Horario de «cada 2 horas de 8 a 18».
  [`(?:de|desde|entre)(?: las?)? ${TR} (?:a|hasta|y)(?: las?)? ${TR}`, (x, p, _, s) => {
    const w = clockTimes(x[0]);
    p.tsrc = s;
    return w?.length === 2 && w[0] < w[1] && (p.win = w);
  }],
  [`(?:desde|a partir del?|comenzando|empezando|iniciando)(?: el| la| este| esta| el dia)? ${DATE}`, (x, p, ref) => (p.from = dateOf(x[1], ref) ?? undefined) !== undefined],
  ["hasta (?:el )?fin(?:al)? del? (ano|mes)", (x, p, ref) => {
    const [y, m] = ymd(ref);
    p.until = x[1] === "mes" ? dayOf(y, m + 1, 0) : dayOf(y, 12, 31);
  }],
  [`hasta(?: el| la| el dia)? ${DATE}`, (x, p, ref) => (p.until = dateOf(x[1], ref, true) ?? undefined) !== undefined],
  ["durante (\\d+) (dia|semana|mes|ano)(?:e?s)?", (x, p) => (p.dur = [+x[1], x[2]])[0] > 0],
  ["(?:1|una?) vez (?:al|por|cada|a la|en la|en el) (dia|semana|mes|ano)", (x, p) => (p.f = F[x[1]])],
  ["(?:por |durante )?(\\d+|una?) (?:veces|vez|ocurrencias|repeticiones)", (x, p) => (p.count = +x[1] || 1) > 0],
  ["cada (?:(\\d+) )?horas?", (x, p) => (p.step = +(x[1] ?? 1)) > 0 && p.step < 24],
  [
    `a (?:las?|eso de las?) ${TR}(?:(?: y| e|) (?:a las? )?${TR}(?! (?:veces|vez)))*|(?:a |al )?(?:mediodia|medianoche)|\\d{1,2}:\\d{2}(?: ?(?:am|pm|m))?|\\d{1,2} ?(?:am|pm)`,
    (x, p, _, s) => {
      const t = clockTimes(x[0]);
      p.tsrc = s;
      return t && p.t.push(...t);
    },
  ],
  ["(?:todos los |cada |los )?(?:dias? (?:habiles|habil|laborables?|de semana|entre semana)|habil(?:es)? dias?)|entre semana", (x, p) => (p.wk = x[0].endsWith("semana") ? 2 : 1)],
  ["cada (?:(\\d+) |(otr[oa]) )?(dia|semana|mes|ano)(?:e?s)?|(dia|semana|mes|ano) de por medio", (x, p) => ((p.f = F[x[3] ?? x[4]]), (p.i = x[1] ? +x[1] : x[2] || x[4] ? 2 : 1) > 0)],
  [
    "(todos los dias|a diario|diari[oa](?:mente)?)|(todas las semanas|semanal(?:mente)?)|(todos los meses|mensual(?:mente)?)|(todos los anos|anual(?:mente)?)|(bi|tri|se)mestral(?:mente)?",
    (x, p) => {
      const g = [1, 2, 3, 4].find((k) => x[k]);
      p.f = g ? FREQS[g - 1] : "MONTHLY";
      if (!g) p.i = x[5] === "bi" ? 2 : x[5] === "tri" ? 3 : 6;
    },
  ],
  ["(?:de|del|al|por|en) (?:el |cada |todo el )?(mes|ano)", (x, p) => (p.mk = F[x[1]])],
  // «el último viernes», «el primer y tercer lunes», «el primer lunes hábil», «el último día hábil», «el último día».
  [
    `${ORDW}(?:(?: y| e|) ${ORDW})* (?:(habil) )?(?:(dia)|${WDR})(?: (habil(?:es)?|laborables?|entre semana))?`,
    (x, p) => {
      const ns = x[0].split(" ").filter((w) => is(ORDW, w)).map(ordNum);
      if (x[1] || x[4]) {
        p.pos.push(...ns);
        p.days.push(...(x[2] ? WORKWEEK : [wdNum(x[3])]));
        if (x[4] !== "entre semana") p.hs = true;
      } else if (x[2]) p.md.push(...ns);
      else for (const n of ns) p.ord.push({ day: wdNum(x[3]), n });
    },
  ],
  [`(?:de |desde )?${WDR} (?:a|al|hasta) ${WDR}`, (x, p) => {
    for (let d = wdNum(x[1]), k = 0; k < 7; k++, d = (d + 1) % 7) if (p.days.push(d) && d === wdNum(x[2])) break;
  }],
  ["fin(?:es)? de semana", (_, p) => p.days.push(5, 6)],
  [`${WDR}(?:(?: y| e| o|) ${WDR})*`, (x, p) => p.days.push(...x[0].split(" ").map(wdNum).filter((d) => d >= 0))],
  [`(?:el )?(\\d{1,2}) (?:de )?${MON}|${MON} (\\d{1,2})`, (x, p, _, s) => {
    const d = +(x[1] ?? x[4]);
    p.dsrc = s;
    return d >= 1 && d <= 31 && p.dates.push([monthNum(x[2] ?? x[3]), d]);
  }],
  [`(?:(?:el|los) )?dias? (\\d{1,2}(?:(?: y| e|) (?:el )?\\d{1,2})*)|(?:el|los) (\\d{1,2}(?:(?: y| e|) (?:el )?\\d{1,2})*)(?! (?:${WDR}|dia|habil))`, (x, p) => {
    const n = x[0].match(/\d+/g)!.map(Number);
    return n.every((v) => v >= 1 && v <= 31) && p.md.push(...n);
  }],
  [`(?:en |de |del mes de )?${MON}(?:(?: y| e|) ${MON})*`, (x, p) => p.mo.push(...x[0].split(" ").filter((w) => is(MON, w)).map(monthNum))],
];
let compiled: [RegExp, Clause[1]][] | undefined;
/** Palabras que no cambian nada («todos los», «de», «que se repite»). */
const FILL = /^(?:y|e|o|de|del|el|la|los|las|lo|en|a|al|que|se|repite|todos|todas|cada|por|pero|tambien|solo|siempre|es|con)$/;

// «un» y «una» no: «si cae en un festivo». «una vez» lo leen sus cláusulas.
const NUMS: Record<string, string> = { veintiun: "21", veintiuna: "21", treinta: "30" };
"cero uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciseis diecisiete dieciocho diecinueve veinte".split(" ").forEach((w, i) => (NUMS[w] = String(i)));
"uno dos tres cuatro cinco seis siete ocho nueve".split(" ").forEach((w, i) => (NUMS[`veinti${w}`] = String(21 + i)));

/** Inglés básico → las palabras del español que entiende el intérprete («_» es un espacio). */
const EN: Record<string, string> = Object.fromEntries(
  "every:cada each:cada other:otro day:dia days:dias week:semana weeks:semanas month:mes months:meses year:ano years:anos hour:hora hours:horas daily:diario weekly:semanal monthly:mensual yearly:anual annually:anual quarterly:trimestral on:el the:el of:de and:y or:o at:a_las from:desde starting:desde beginning:desde to:a through:hasta until:hasta till:hasta between:entre first:primer second:segundo third:tercer fourth:cuarto fifth:quinto last:ultimo penultimate:penultimo business:habil working:habil weekday:dia_de_semana weekdays:dias_de_semana weekend:fin_de_semana weekends:fines_de_semana times:veces time:vez except:menos excluding:menos but:pero not:no without:sin holiday:festivo holidays:festivos if:si it:_ falls:cae is:es previous:anterior prior:anterior before:anterior next:siguiente following:siguiente after:siguiente today:hoy tomorrow:manana noon:mediodia midnight:medianoche for:durante one:1 two:2 three:3 four:4 five:5 six:6 seven:7 eight:8 nine:9 ten:10 eleven:11 twelve:12 fifteen:15 twenty:20 thirty:30 monday:lunes tuesday:martes wednesday:miercoles thursday:jueves friday:viernes saturday:sabado sunday:domingo"
    .split(" ")
    .map((p) => p.split(":").map((s) => s.replace(/_/g, " "))),
);
const EN_MONTHS = "january february march april may june july august september october november december".split(" ");
const ES_MONTHS = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(" ");

/** La frase en palabras normalizadas (sin tildes ni signos, números en cifras), las palabras
 *  originales y, por cada normalizada, cuál la originó (para decir qué no se entendió). */
function words(text: string, en: boolean): [string[], string[], number[]] {
  const t = foldText(text)
    .replace(/(\d)[.h](\d\d)\b/g, "$1:$2")
    .replace(/[^a-z0-9:/ -]+|(?<!\d)-|-(?!\d)/g, " ")
    .replace(/ +/g, " ")
    .replace(/(\d) ?([ap]) ?m\b/g, "$1 $2m")
    .replace(/\b(\d+)(?:st|nd|rd|th|er|ro|do|to|vo|no|mo|o|a)\b/g, "$1")
    .replace(/\btreinta y un[oa]?\b/g, "31");
  const toks: string[] = [];
  const src = t.split(" ").filter(Boolean);
  const si: number[] = [];
  for (const [j, w] of src.entries()) {
    const k = EN_MONTHS.findIndex((m) => w === m || w === m.slice(0, 3) || (w === "sept" && m[0] === "s"));
    const v = en ? (EN[w] ?? EN[w.replace(/s$/, "")] ?? (k >= 0 ? ES_MONTHS[k] : w)) : w;
    for (const x of v.split(" ")) if (x) toks.push(NUMS[x] ?? x), si.push(j);
  }
  return [toks, src, si];
}

/**
 * Una frase («el último viernes de cada mes a las 5 pm», «de lunes a viernes a las 7 am», «cada 15
 * días desde el lunes»…) o una RRULE → la regla. Tolerante: tildes, mayúsculas, números en letras
 * hasta 31, «5 de la tarde», «17:00», «5pm». Lo que no entiende lo devuelve en `unknown` (las
 * palabras como se escribieron), sin lanzar. Texto vacío: `{rule: null}`.
 */
export function parseRecurrence(text: string, opts: RecurrenceParseOptions = {}): RecurrenceParse {
  const raw = String(text ?? "").trim();
  if (RRULE_RX.test(raw)) {
    const rule = parseRRule(raw);
    return rule ? { rule } : { rule: null, unknown: raw };
  }
  const ref = todayOf(opts.start);
  const [toks, src, si] = words(raw, /^en\b/i.test(opts.locale ?? ""));
  const rx = (compiled ??= CLAUSES.map(([s, fn]) => [new RegExp(`^(?:${s})(?= |$)`), fn]));
  const p: St = { days: [], ord: [], md: [], pos: [], mo: [], dates: [], t: [] };
  const runs: number[][] = [];
  let cur: number[] | null = null;
  let any = false;
  for (let i = 0; i < toks.length; ) {
    const rest = toks.slice(i).join(" ");
    let n = 0;
    for (const [re, fn] of rx) {
      const x = re.exec(rest);
      const k = x ? x[0].split(" ").length : 0;
      const ok = x && fn(x, p, ref, src.slice(si[i], si[i + k - 1] + 1).join(" "));
      // Una cláusula que devuelve `false` o `null` no se aplica (una hora que no existe, un día 32).
      if (x && ok !== false && ok !== null) {
        n = k;
        break;
      }
    }
    if (n) {
      any = true;
      cur = null;
      i += n;
      continue;
    }
    // Lo que no se entiende, con los rellenos que le siguen: «quincenal los».
    if (cur || !FILL.test(toks[i])) {
      if (!cur) runs.push((cur = []));
      if (cur.at(-1) !== si[i]) cur.push(si[i]);
    }
    i++;
  }
  if (runs.length) return { rule: null, unknown: runs[0].map((j) => src[j]).join(" ") };
  if (!any) return { rule: null };
  const r = build(p, ref);
  return typeof r === "string" ? { rule: null, unknown: r } : { rule: r };
}

/** Lo entendido → la regla (o las palabras de lo que no se puede guardar). */
function build(p: St, ref: number): RecurrenceRule | string {
  const start = p.from ?? ref;
  let f = p.f;
  let i = p.i ?? 1;
  let t = uniq(p.t);
  if (p.win) {
    t = [];
    for (let m = p.win[0]; m <= p.win[1]; m += (p.step ?? 1) * 60) t.push(m);
  } else if (p.step && !t.length) (f = "HOURLY"), (i = p.step);
  const hrs = uniq(t.map((v) => Math.floor(v / 60)));
  const mins = uniq(t.map((v) => v % 60));
  // La RRULE combina todas las horas con todos los minutos: «a las 8 y a las 2:30» no se puede.
  if (hrs.length * mins.length !== t.length) return p.tsrc!;
  const days = uniq(p.wk ? WORKWEEK : p.days);
  let md = uniq(p.md);
  let mo = uniq(p.mo);
  const dm = uniq(p.dates.map((d) => d[0]));
  const dd = uniq(p.dates.map((d) => d[1]));
  // «el 1 de enero y el 25 de diciembre» serían también el 25 de enero y el 1 de diciembre.
  if (new Set(p.dates.map(String)).size !== dm.length * dd.length) return p.dsrc!;
  mo = uniq([...mo, ...dm]);
  md = uniq([...md, ...dd]);
  const monthly = md.length || p.ord.length || p.pos.length;
  if (!f || (f === "DAILY" && i === 1 && days.length))
    f = (mo.length && monthly) || p.dates.length ? "YEARLY" : monthly ? "MONTHLY" : days.length ? "WEEKLY" : (p.mk ?? (mo.length ? "YEARLY" : "DAILY"));
  else if (f === "WEEKLY" && monthly) f = "MONTHLY";
  if (f === "YEARLY" && !mo.length && (md.length || p.ord.length || p.pos.length)) mo = [ymd(start)[1]];
  let until = p.until;
  if (p.dur) {
    const [n, u] = p.dur;
    until = u === "dia" ? start + n - 1 : u === "semana" ? start + 7 * n - 1 : addMonths(start, u === "mes" ? n : 12 * n) - 1;
  }
  return fillRule({
    freq: f,
    interval: i,
    byDay: [...p.ord, ...days.map((day) => ({ day, n: 0 }))],
    byMonthDay: md,
    byMonth: mo,
    byHour: hrs,
    byMinute: mins,
    bySetPos: p.pos,
    start: isoOf(start),
    until: until === undefined ? undefined : isoOf(until),
    count: p.count,
    holidays: p.hs ? "skip" : (p.hol ?? (p.wk === 1 ? "skip" : undefined)),
  });
}
