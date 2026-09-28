import { describe, expect, it } from "vitest";
import { colombiaHolidays, describeRecurrence, easterDay, fillRule, nextOccurrences, occurrences, parseRRule, shortDate, toRRule } from "../src/components/recurrence/logic";
import { clockTimes, parseRecurrence, readClock } from "../src/components/recurrence/parse";
import type { RecurrenceRule } from "../src/components/recurrence/types";
import { dayOf, isoOf } from "../src/core/days";

/** En las pruebas «hoy» es el lunes 28 de septiembre de 2026. */
const START = "2026-09-28";
const es = { start: START, locale: "es-CO" };
const en = { start: START, locale: "en-US" };

/** La RRULE (sin la línea DTSTART) de una frase. */
function rr(text: string, o = es): string {
  const r = parseRecurrence(text, o);
  if (!r.rule) throw new Error(`no se entendió «${text}»: ${r.unknown}`);
  return toRRule(r.rule).split("\n")[1].replace(/^RRULE:/, "").replace(/;WKST=MO/, "");
}
const dtstart = (text: string, o = es) => toRRule(parseRecurrence(text, o).rule!).split("\n")[0];
const rule = (text: string, o = es) => parseRecurrence(text, o).rule!;
/** Las próximas fechas como «2026-10-30» o «2026-10-30 17:00» (y «<2026-10-12» si se corrió). */
function days(r: RecurrenceRule | string, from: string, n = 5, holidays?: Parameters<typeof occurrences>[3]): string[] {
  // Una frase cuenta desde `from` (su DTSTART), como en el elemento.
  const start = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : START;
  return occurrences(typeof r === "string" && !/^(DTSTART|RRULE|FREQ)/.test(r) ? rule(r, { ...es, start }) : r, from, n, holidays).map(
    (o) => o.day + (o.time === null ? "" : ` ${String(Math.floor(o.time / 60)).padStart(2, "0")}:${String(o.time % 60).padStart(2, "0")}`) + (o.movedFrom ? `<${o.movedFrom}` : ""),
  );
}

// ---------------------------------------------------------------- el intérprete

/** [frase, RRULE esperada (sin DTSTART ni WKST)]. */
const PHRASES: [string, string][] = [
  ["todos los días a las 7", "FREQ=DAILY;BYHOUR=7;BYMINUTE=0"],
  ["Todos Los Días A Las 7 AM", "FREQ=DAILY;BYHOUR=7;BYMINUTE=0"],
  ["todos los dias a las 7", "FREQ=DAILY;BYHOUR=7;BYMINUTE=0"],
  ["diariamente a las 6", "FREQ=DAILY;BYHOUR=6;BYMINUTE=0"],
  ["diario", "FREQ=DAILY"],
  ["de lunes a viernes a las 7 am", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=0"],
  ["de viernes a lunes", "FREQ=WEEKLY;BYDAY=MO,FR,SA,SU"],
  ["cada 15 días desde el lunes", "FREQ=DAILY;INTERVAL=15"],
  ["cada semana los martes y jueves", "FREQ=WEEKLY;BYDAY=TU,TH"],
  ["los lunes, miércoles y viernes a las 6:30 de la mañana", "FREQ=WEEKLY;BYDAY=MO,WE,FR;BYHOUR=6;BYMINUTE=30"],
  ["sábados y domingos a las 9", "FREQ=WEEKLY;BYDAY=SA,SU;BYHOUR=9;BYMINUTE=0"],
  ["los fines de semana a mediodía", "FREQ=WEEKLY;BYDAY=SA,SU;BYHOUR=12;BYMINUTE=0"],
  ["entre semana a las 6 am", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=6;BYMINUTE=0"],
  ["todos los días hábiles a las 7", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=0;X-NX-HOLIDAYS=skip"],
  ["cada dos semanas los viernes", "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"],
  ["cada otra semana el lunes", "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO"],
  ["cada 4 semanas el jueves", "FREQ=WEEKLY;INTERVAL=4;BYDAY=TH"],
  ["semanal", "FREQ=WEEKLY;BYDAY=MO"],
  ["día de por medio", "FREQ=DAILY;INTERVAL=2"],
  ["los días 5 y 20 de cada mes", "FREQ=MONTHLY;BYMONTHDAY=5,20"],
  ["el 5 y el 20 de cada mes", "FREQ=MONTHLY;BYMONTHDAY=5,20"],
  ["el día quince de cada mes", "FREQ=MONTHLY;BYMONTHDAY=15"],
  ["el treinta y uno de cada mes", "FREQ=MONTHLY;BYMONTHDAY=31"],
  ["cada mes el día 15 a las 12 m", "FREQ=MONTHLY;BYMONTHDAY=15;BYHOUR=12;BYMINUTE=0"],
  ["mensual", "FREQ=MONTHLY;BYMONTHDAY=28"],
  ["una vez al mes", "FREQ=MONTHLY;BYMONTHDAY=28"],
  ["bimestral el día 10", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=10"],
  ["trimestral el último día", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1"],
  ["semestral", "FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=28"],
  ["cada 3 meses el día 1", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1"],
  ["cada 3 meses el primer lunes", "FREQ=MONTHLY;INTERVAL=3;BYDAY=1MO"],
  ["el último viernes de cada mes a las 5 pm", "FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=17;BYMINUTE=0"],
  ["  el ÚLTIMO viernes   de cada mes ", "FREQ=MONTHLY;BYDAY=-1FR"],
  ["el primer y tercer lunes de cada mes a las 8:30", "FREQ=MONTHLY;BYDAY=1MO,3MO;BYHOUR=8;BYMINUTE=30"],
  ["el 2do martes de cada mes", "FREQ=MONTHLY;BYDAY=2TU"],
  ["el primer lunes hábil del mes", "FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1;X-NX-HOLIDAYS=skip"],
  ["el último día hábil del mes", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;X-NX-HOLIDAYS=skip"],
  ["el penúltimo día hábil de cada mes", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2;X-NX-HOLIDAYS=skip"],
  ["el quinto día hábil de cada mes", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=5;X-NX-HOLIDAYS=skip"],
  ["el último día entre semana del mes", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1"],
  ["cada año el 15 de enero", "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=15"],
  ["el 15 de enero", "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=15"],
  ["el 15 de enero y julio", "FREQ=YEARLY;BYMONTH=1,7;BYMONTHDAY=15"],
  ["en enero y julio el día 15", "FREQ=YEARLY;BYMONTH=1,7;BYMONTHDAY=15"],
  ["cada 2 años el 1 de marzo", "FREQ=YEARLY;INTERVAL=2;BYMONTH=3;BYMONTHDAY=1"],
  ["cada año el primer lunes de marzo", "FREQ=YEARLY;BYMONTH=3;BYDAY=1MO"],
  ["el último día de febrero", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1"],
  ["el 29 de febrero", "FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29"],
  ["anual", "FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=28"],
  ["cada 2 horas de 8 a 18", "FREQ=DAILY;BYHOUR=8,10,12,14,16,18;BYMINUTE=0"],
  ["cada hora entre las 9 y las 12", "FREQ=DAILY;BYHOUR=9,10,11,12;BYMINUTE=0"],
  ["de lunes a viernes cada hora de 8 am a 5 pm", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=8,9,10,11,12,13,14,15,16,17;BYMINUTE=0"],
  ["cada 3 horas desde las 8:30 hasta las 17:30", "FREQ=DAILY;BYHOUR=8,11,14,17;BYMINUTE=30"],
  ["cada hora", "FREQ=HOURLY"],
  ["cada 3 horas los sábados", "FREQ=HOURLY;INTERVAL=3;BYDAY=SA"],
  ["a las 5 de la tarde", "FREQ=DAILY;BYHOUR=17;BYMINUTE=0"],
  ["a la 1 de la tarde", "FREQ=DAILY;BYHOUR=13;BYMINUTE=0"],
  ["17:00", "FREQ=DAILY;BYHOUR=17;BYMINUTE=0"],
  ["5pm", "FREQ=DAILY;BYHOUR=17;BYMINUTE=0"],
  ["a las 5 p. m.", "FREQ=DAILY;BYHOUR=17;BYMINUTE=0"],
  ["a las 7:30", "FREQ=DAILY;BYHOUR=7;BYMINUTE=30"],
  ["a las 7 y media", "FREQ=DAILY;BYHOUR=7;BYMINUTE=30"],
  ["a las 8 y cuarto", "FREQ=DAILY;BYHOUR=8;BYMINUTE=15"],
  ["a las 12 a. m.", "FREQ=DAILY;BYHOUR=0;BYMINUTE=0"],
  ["a medianoche", "FREQ=DAILY;BYHOUR=0;BYMINUTE=0"],
  ["a las 8 y a las 14", "FREQ=DAILY;BYHOUR=8,14;BYMINUTE=0"],
  ["a las 7h30", "FREQ=DAILY;BYHOUR=7;BYMINUTE=30"],
  ["todos los días hasta el 31 de diciembre", "FREQ=DAILY;UNTIL=20261231T235959"],
  ["hasta fin de año los viernes", "FREQ=WEEKLY;BYDAY=FR;UNTIL=20261231T235959"],
  ["los martes hasta el 2027-03-31", "FREQ=WEEKLY;BYDAY=TU;UNTIL=20270331T235959"],
  ["los martes hasta el 31/03/2027", "FREQ=WEEKLY;BYDAY=TU;UNTIL=20270331T235959"],
  ["los martes hasta marzo", "FREQ=WEEKLY;BYDAY=TU;UNTIL=20270331T235959"],
  ["durante 3 meses todos los lunes", "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261227T235959"],
  ["los lunes 10 veces", "FREQ=WEEKLY;BYDAY=MO;COUNT=10"],
  ["10 veces cada lunes", "FREQ=WEEKLY;BYDAY=MO;COUNT=10"],
  ["cada 10 días, cinco veces", "FREQ=DAILY;INTERVAL=10;COUNT=5"],
  ["una vez", "FREQ=DAILY;COUNT=1"],
  ["todos los días menos en festivos", "FREQ=DAILY;X-NX-HOLIDAYS=skip"],
  ["los lunes a las 8 excepto festivos", "FREQ=WEEKLY;BYDAY=MO;BYHOUR=8;BYMINUTE=0;X-NX-HOLIDAYS=skip"],
  ["el día 5 de cada mes, si cae festivo, el día hábil anterior", "FREQ=MONTHLY;BYMONTHDAY=5;X-NX-HOLIDAYS=before"],
  ["los días 5 de cada mes, si cae festivo el día hábil siguiente", "FREQ=MONTHLY;BYMONTHDAY=5;X-NX-HOLIDAYS=after"],
  ["los martes, si es festivo se corre al siguiente", "FREQ=WEEKLY;BYDAY=TU;X-NX-HOLIDAYS=after"],
];

describe("parseRecurrence: frases", () => {
  it.each(PHRASES)("«%s» → %s", (text, want) => {
    expect(rr(text)).toBe(want);
  });

  it("son más de 60 frases, y cada una vuelve igual desde su frase canónica", () => {
    expect(PHRASES.length).toBeGreaterThan(60);
    for (const [text] of PHRASES) {
      const r = rule(text);
      const canon = describeRecurrence(r, es);
      expect(toRRule(rule(canon)), `«${text}» → «${canon}»`).toBe(toRRule(r));
    }
  });

  it("«desde»: el próximo lunes, mañana, una fecha (sin año, la próxima)", () => {
    expect(dtstart("cada 15 días desde el lunes")).toBe("DTSTART:20261005T000000");
    expect(dtstart("desde mañana todos los días")).toBe("DTSTART:20260929T000000");
    expect(dtstart("a partir del 15 de enero de 2027 cada 2 semanas los miércoles")).toBe("DTSTART:20270115T000000");
    expect(dtstart("desde el 1/10 los jueves")).toBe("DTSTART:20261001T000000");
    // Sin año y ya pasó: el del año que viene.
    expect(dtstart("desde el 3 de febrero los jueves")).toBe("DTSTART:20270203T000000");
    // Sin «desde», el `start` de las opciones.
    expect(dtstart("los lunes")).toBe("DTSTART:20260928T000000");
  });

  it("lo que no entiende lo dice, sin lanzar", () => {
    const bad = (t: string) => parseRecurrence(t, es);
    expect(bad("quincenal los viernes")).toEqual({ rule: null, unknown: "quincenal los" });
    expect(bad("cada tanto").unknown).toBe("tanto");
    expect(bad("a las 25").unknown).toBe("25");
    expect(bad("a las 13 pm").unknown).toBe("13 pm");
    expect(bad("el día 32 de cada mes").unknown).toBe("dia 32");
    expect(bad("blablá").unknown).toBe("blabla");
    expect(bad("los lunes y también el cumpleaños de Ana").unknown).toBe("cumpleanos de ana");
    // La RRULE no puede guardar dos fechas del año con días distintos, ni horas con minutos distintos.
    expect(bad("el 1 de enero y el 25 de diciembre").unknown).toBe("el 25 de diciembre");
    expect(bad("a las 8 y a las 2:30 pm").unknown).toBe("a las 8 y a las 2:30 pm");
    // Vacío o solo relleno: sin regla y sin queja.
    expect(bad("")).toEqual({ rule: null });
    expect(bad("  de la ")).toEqual({ rule: null });
    expect(parseRecurrence(null as unknown as string)).toEqual({ rule: null });
  });

  it("acepta una RRULE en vez de la frase", () => {
    expect(rr("RRULE:FREQ=WEEKLY;BYDAY=MO")).toBe("FREQ=WEEKLY;BYDAY=MO");
    expect(rr("FREQ=MONTHLY;BYDAY=-1FR")).toBe("FREQ=MONTHLY;BYDAY=-1FR");
    expect(parseRecurrence("FREQ=SECONDLY").unknown).toBe("FREQ=SECONDLY");
  });

  it("inglés básico con locale en-US", () => {
    const cases: [string, string][] = [
      ["every day at 7", "FREQ=DAILY;BYHOUR=7;BYMINUTE=0"],
      ["Monday to Friday at 7am", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=7;BYMINUTE=0"],
      ["every 2 weeks on Tuesday and Thursday", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH"],
      ["on the 5th and 20th of every month", "FREQ=MONTHLY;BYMONTHDAY=5,20"],
      ["the last Friday of every month at 5 pm", "FREQ=MONTHLY;BYDAY=-1FR;BYHOUR=17;BYMINUTE=0"],
      ["the first business day of the month", "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1;X-NX-HOLIDAYS=skip"],
      ["every 3 months on day 1", "FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=1"],
      ["every year on January 15", "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=15"],
      ["every 2 hours from 8 to 18", "FREQ=DAILY;BYHOUR=8,10,12,14,16,18;BYMINUTE=0"],
      ["every weekday until December 31", "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261231T235959"],
      ["every Monday 10 times", "FREQ=WEEKLY;BYDAY=MO;COUNT=10"],
      ["every day except holidays", "FREQ=DAILY;X-NX-HOLIDAYS=skip"],
      ["on the 5th of every month, if it falls on a holiday, the next business day", "FREQ=MONTHLY;BYMONTHDAY=5;X-NX-HOLIDAYS=after"],
      ["every other week on Friday", "FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"],
      ["every fifteen days starting Monday", "FREQ=DAILY;INTERVAL=15"],
    ];
    for (const [text, want] of cases) {
      expect(rr(text, en), text).toBe(want);
      const r = rule(text, en);
      const canon = describeRecurrence(r, en);
      expect(toRRule(rule(canon, en)), `«${text}» → «${canon}»`).toBe(toRRule(r));
    }
    expect(parseRecurrence("fortnightly on Friday", en).unknown).toBe("fortnightly on");
    // En español no se lee inglés.
    expect(parseRecurrence("every day", es).unknown).toBe("every day");
  });

  it("las horas: clockTimes y readClock", () => {
    expect(clockTimes("7 y media")).toEqual([450]);
    expect(clockTimes("12 m")).toEqual([720]);
    expect(clockTimes("7 m")).toBeNull();
    expect(clockTimes("0 pm")).toBeNull();
    expect(readClock("5 p. m., 17:30 y 8")).toEqual([1020, 1050, 480]);
    expect(readClock("")).toEqual([]);
  });

  it("una frase larga llena de palabras se lee en tiempo razonable", () => {
    const t0 = performance.now();
    const r = parseRecurrence("cumpleaños ".repeat(300), es);
    expect(r.rule).toBeNull();
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

// ---------------------------------------------------------------- frase canónica

describe("describeRecurrence", () => {
  const d = (text: string, o = es) => describeRecurrence(rule(text, o), o).replace(/[\u00a0\u202f]/g, " ");
  it("en español", () => {
    expect(d("el último viernes de cada mes a las 5 pm")).toBe("El último viernes de cada mes, a las 5:00 p. m.");
    expect(d("de lunes a viernes a las 7 am")).toBe("De lunes a viernes, a las 7:00 a. m.");
    expect(d("los días 5 y 20 de cada mes, si cae festivo, el día hábil siguiente")).toBe("Los días 5 y 20 de cada mes, si cae festivo, el día hábil siguiente.");
    expect(d("el primer lunes hábil del mes")).toBe("El primer lunes hábil de cada mes.");
    expect(d("el último día hábil del mes a las 6 pm")).toBe("El último día hábil de cada mes, a las 6:00 p. m.");
    expect(d("cada 15 días desde el lunes")).toBe("Cada 15 días, desde el 5 oct 2026.");
    expect(d("cada 2 horas de 8 a 18")).toBe("Cada 2 horas, de 8:00 a. m. a 6:00 p. m.");
    expect(d("cada año el 15 de enero")).toBe("Cada año, el 15 de enero.");
    expect(d("los sábados a la 1 pm 3 veces")).toBe("Los sábados, a la 1:00 p. m., 3 veces.");
    expect(d("todos los días menos en festivos hasta el 31 de diciembre")).toBe("Todos los días, hasta el 31 dic 2026, menos en festivos.");
  });
  it("en inglés", () => {
    expect(d("the last Friday of every month at 5 pm", en)).toBe("The last Friday of every month, at 5:00 PM.");
    expect(d("every 15 days starting Monday", en)).toBe("Every 15 days, starting Oct 5, 2026.");
    expect(d("Monday to Friday at 7am except holidays", en)).toBe("Monday to Friday, at 7:00 AM, except holidays.");
  });
  it("una RRULE de afuera con lo implícito (sin BYDAY, sin BYMONTHDAY)", () => {
    expect(describeRecurrence(parseRRule("DTSTART:20261001T000000\nRRULE:FREQ=WEEKLY")!, es)).toBe("Los jueves, desde el 1 oct 2026.");
    expect(describeRecurrence(parseRRule("DTSTART:20260928T000000\nRRULE:FREQ=MONTHLY")!, es)).toBe("El día 28 de cada mes.");
  });
  it("shortDate: sin los «de» del español", () => {
    expect(shortDate(dayOf(2026, 10, 30), "es-CO", true, true)).toMatch(/^vie 30 oct 2026$/);
    expect(shortDate(dayOf(2026, 10, 30), "en-US", true, false)).toBe("Fri, Oct 30");
  });
});

// ---------------------------------------------------------------- RRULE

describe("RRULE de ida y vuelta", () => {
  it("toRRule y parseRRule son inversos", () => {
    for (const [text] of PHRASES) {
      const s = toRRule(rule(text));
      expect(toRRule(parseRRule(s)!), text).toBe(s);
    }
  });

  it("DTSTART y RRULE en dos líneas; los festivos en X-NX-HOLIDAYS", () => {
    expect(toRRule(rule("el último día hábil del mes a las 6 pm"))).toBe("DTSTART:20260928T000000\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=18;BYMINUTE=0;BYSETPOS=-1;WKST=MO;X-NX-HOLIDAYS=skip");
  });

  it("lee las formas de afuera: solo FREQ, parámetros en DTSTART, UTC, hora en DTSTART", () => {
    const r = parseRRule("DTSTART;TZID=America/Bogota:20261005T073000\nRRULE:FREQ=DAILY;INTERVAL=2;COUNT=3")!;
    expect(r).toMatchObject({ freq: "DAILY", interval: 2, count: 3, start: "2026-10-05", byHour: [7], byMinute: [30] });
    expect(parseRRule("rrule:freq=weekly;byday=mo,we")).toMatchObject({ freq: "WEEKLY", byDay: [{ day: 0, n: 0 }, { day: 2, n: 0 }] });
    expect(parseRRule("FREQ=MONTHLY;BYMONTHDAY=-1;UNTIL=20261231")).toMatchObject({ byMonthDay: [-1], until: "2026-12-31" });
    expect(parseRRule("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;DTSTART=20240229")).toMatchObject({ start: "2024-02-29" });
    expect(parseRRule("FREQ=HOURLY;INTERVAL=3;DTSTART=20261005T090000")).toMatchObject({ startTime: 540 });
    // Un DTSTART en UTC (con Z) pasa a la hora local.
    const z = parseRRule("DTSTART:20261005T120000Z\nRRULE:FREQ=DAILY")!;
    const local = new Date(Date.UTC(2026, 9, 5, 12));
    expect(z.byHour).toEqual([local.getHours()]);
    // Partes que no conoce (X-…) se ignoran; WKST también.
    expect(parseRRule("FREQ=DAILY;WKST=SU;X-OTRA=1")).toMatchObject({ freq: "DAILY" });
  });

  it("rechaza lo que no sabe hacer o no es válido", () => {
    for (const s of ["", "FREQ=SECONDLY", "FREQ=MINUTELY", "BYDAY=MO", "FREQ=WEEKLY;BYWEEKNO=20", "FREQ=YEARLY;BYYEARDAY=100", "FREQ=DAILY;INTERVAL=0", "FREQ=DAILY;INTERVAL=x", "FREQ=MONTHLY;BYMONTHDAY=0", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=DAILY;BYHOUR=24", "FREQ=WEEKLY;BYDAY=XX", "FREQ=DAILY;COUNT=0", "FREQ=DAILY;UNTIL=20261340", "DTSTART:2026\nRRULE:FREQ=DAILY"]) expect(parseRRule(s), s).toBeNull();
  });

  it("fillRule escribe lo implícito como RFC 5545", () => {
    const base = { interval: 1, byDay: [], byMonthDay: [], byMonth: [], byHour: [], byMinute: [], bySetPos: [], start: "2026-10-01" };
    expect(fillRule({ ...base, freq: "WEEKLY" }).byDay).toEqual([{ day: 3, n: 0 }]);
    expect(fillRule({ ...base, freq: "MONTHLY" }).byMonthDay).toEqual([1]);
    expect(fillRule({ ...base, freq: "YEARLY" })).toMatchObject({ byMonth: [10], byMonthDay: [1] });
    // YEARLY con BYMONTHDAY y sin BYMONTH: todos los meses (como RFC 5545).
    expect(fillRule({ ...base, freq: "YEARLY", byMonthDay: [1] }).byMonth).toEqual([]);
  });
});

// ---------------------------------------------------------------- generador

describe("occurrences", () => {
  it("los casos del encargo", () => {
    expect(days("el último viernes de cada mes a las 5 pm", START)).toEqual(["2026-10-30 17:00", "2026-11-27 17:00", "2026-12-25 17:00", "2027-01-29 17:00", "2027-02-26 17:00"]);
    expect(days("de lunes a viernes a las 7 am", START, 6)).toEqual(["2026-09-28 07:00", "2026-09-29 07:00", "2026-09-30 07:00", "2026-10-01 07:00", "2026-10-02 07:00", "2026-10-05 07:00"]);
    expect(days("cada 15 días desde el lunes", START, 4)).toEqual(["2026-10-05", "2026-10-20", "2026-11-04", "2026-11-19"]);
    expect(days("cada 2 horas de 8 a 18", "2026-09-28", 7)).toEqual(["2026-09-28 08:00", "2026-09-28 10:00", "2026-09-28 12:00", "2026-09-28 14:00", "2026-09-28 16:00", "2026-09-28 18:00", "2026-09-29 08:00"]);
    expect(days("cada 3 meses el día 1", START, 3)).toEqual(["2026-12-01", "2027-03-01", "2027-06-01"]);
  });

  it("el último día hábil: salta fines de semana y festivos", () => {
    expect(days("el último día hábil del mes", START, 5)).toEqual(["2026-09-30", "2026-10-30", "2026-11-30", "2026-12-31", "2027-01-29"]);
    // Junio de 2025 termina en lunes festivo (Sagrado Corazón y San Pedro, el 30): el último hábil es el viernes 27.
    expect(days("el último día hábil del mes", "2025-06-01", 1)).toEqual(["2025-06-27"]);
    // Enero de 2027: el primer día hábil no es el viernes 1 (Año Nuevo) sino el lunes 4.
    expect(days("el primer día hábil del mes", "2027-01-01", 1)).toEqual(["2027-01-04"]);
    // Noviembre de 2026: el primer lunes (2) es festivo; el primer lunes hábil es el 9.
    expect(days("el primer lunes hábil del mes", "2026-11-01", 1)).toEqual(["2026-11-09"]);
    expect(days("el primer lunes del mes", "2026-11-01", 1)).toEqual(["2026-11-02"]);
    // Sin festivos, el 2 de noviembre sí es hábil.
    expect(days("el primer lunes hábil del mes", "2026-11-01", 1, null)).toEqual(["2026-11-02"]);
  });

  it("el 31 en meses cortos se salta; «el último día» no", () => {
    expect(days("el día 31 de cada mes", "2026-01-01", 5)).toEqual(["2026-01-31", "2026-03-31", "2026-05-31", "2026-07-31", "2026-08-31"]);
    expect(days("el último día de cada mes", "2026-01-01", 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(days("el penúltimo día de cada mes", "2028-02-01", 1)).toEqual(["2028-02-28"]);
  });

  it("29 de febrero: solo en bisiestos (2100 no lo es)", () => {
    expect(days("el 29 de febrero", "2025-01-01", 3)).toEqual(["2028-02-29", "2032-02-29", "2036-02-29"]);
    expect(days("el 29 de febrero", "2096-03-01", 1)).toEqual(["2104-02-29"]);
    expect(days("el último día de febrero", "2027-01-01", 2)).toEqual(["2027-02-28", "2028-02-29"]);
  });

  it("BYSETPOS: dentro del período, con horas también", () => {
    expect(days("DTSTART:20261001T000000\nRRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=3", "2026-10-01", 3, null)).toEqual(["2026-10-05", "2026-11-04", "2026-12-03"]);
    expect(days("DTSTART:20261001T000000\nRRULE:FREQ=DAILY;BYHOUR=8,12,16;BYMINUTE=0;BYSETPOS=-1", "2026-10-01", 2)).toEqual(["2026-10-01 16:00", "2026-10-02 16:00"]);
    expect(days("DTSTART:20261001T000000\nRRULE:FREQ=MONTHLY;BYMONTHDAY=1,15,-1;BYSETPOS=1,-1", "2026-10-01", 4)).toEqual(["2026-10-01", "2026-10-31", "2026-11-01", "2026-11-30"]);
  });

  it("cruces de mes y de año", () => {
    expect(days("los lunes", "2026-12-26", 3)).toEqual(["2026-12-28", "2027-01-04", "2027-01-11"]);
    expect(days("DTSTART:20261216T000000\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=WE", "2026-12-20", 3)).toEqual(["2026-12-30", "2027-01-13", "2027-01-27"]);
    expect(days("DTSTART:20261130T000000\nRRULE:FREQ=MONTHLY;INTERVAL=5;BYMONTHDAY=30", "2026-11-01", 3)).toEqual(["2026-11-30", "2027-04-30", "2027-09-30"]);
    expect(days("DTSTART:20261231T220000\nRRULE:FREQ=HOURLY;INTERVAL=1;BYMINUTE=15", "2026-12-31T22:00", 3)).toEqual(["2026-12-31 22:15", "2026-12-31 23:15", "2027-01-01 00:15"]);
    expect(days("DTSTART:20241231T000000\nRRULE:FREQ=YEARLY;BYMONTH=12;BYMONTHDAY=31", "2026-01-01", 2)).toEqual(["2026-12-31", "2027-12-31"]);
  });

  it("festivos: se saltan, o se corren al día hábil anterior o siguiente", () => {
    // El lunes 12 de octubre de 2026 es festivo (Día de la Raza).
    expect(days("el día 12 de cada mes, si cae festivo, el día hábil siguiente", "2026-10-01", 2)).toEqual(["2026-10-13<2026-10-12", "2026-11-12"]);
    expect(days("el día 12 de cada mes, si cae festivo, el día hábil anterior", "2026-10-01", 2)).toEqual(["2026-10-09<2026-10-12", "2026-11-12"]);
    // Jueves y Viernes Santo 2026 (2 y 3 de abril): del jueves 2 al lunes 6.
    expect(days("el día 2 de cada mes, si cae festivo, el día hábil siguiente", "2026-04-01", 1)).toEqual(["2026-04-06<2026-04-02"]);
    expect(days("todos los días menos en festivos", "2026-10-10", 3)).toEqual(["2026-10-10", "2026-10-11", "2026-10-13"]);
    // Un corrido que cae sobre otra fecha de la regla no se repite, y el orden se mantiene.
    expect(days("de lunes a viernes, si cae festivo, el día hábil siguiente", "2026-10-09", 3)).toEqual(["2026-10-09", "2026-10-13<2026-10-12", "2026-10-14"]);
    expect(days("de lunes a viernes, si cae festivo, el día hábil anterior", "2026-10-08", 3)).toEqual(["2026-10-08", "2026-10-09", "2026-10-13"]);
    // Festivos propios (una lista) o ninguno.
    expect(days("los lunes menos en festivos", "2026-10-01", 2, ["2026-10-05"])).toEqual(["2026-10-12", "2026-10-19"]);
    expect(days("los lunes menos en festivos", "2026-10-01", 2, null)).toEqual(["2026-10-05", "2026-10-12"]);
    expect(days("los lunes menos en festivos", "2026-10-01", 2, (y) => (y === 2026 ? ["2026-10-19"] : []))).toEqual(["2026-10-05", "2026-10-12"]);
  });

  it("COUNT cuenta desde DTSTART (sin los que se saltan); UNTIL incluye su día", () => {
    expect(days("DTSTART:20260928T000000\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3", "2026-09-01", 10)).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(days("DTSTART:20260928T000000\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3", "2026-10-06", 10)).toEqual(["2026-10-12"]);
    expect(days("DTSTART:20261005T000000\nRRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2;X-NX-HOLIDAYS=skip", "2026-10-01", 10)).toEqual(["2026-10-05", "2026-10-19"]);
    expect(days("DTSTART:20260928T000000\nRRULE:FREQ=DAILY;BYHOUR=18;BYMINUTE=0;UNTIL=20260930T235959", START, 10)).toEqual(["2026-09-28 18:00", "2026-09-29 18:00", "2026-09-30 18:00"]);
  });

  it("desde `from`: las de hoy que ya pasaron no; un DTSTART futuro manda", () => {
    const from = new Date(2026, 8, 28, 8, 0);
    expect(days("todos los días a las 7", from as unknown as string, 1)).toEqual(["2026-09-29 07:00"]);
    expect(days("todos los días a las 8", from as unknown as string, 1)).toEqual(["2026-09-28 08:00"]);
    expect(days("DTSTART:20270101T000000\nRRULE:FREQ=DAILY", START, 1)).toEqual(["2027-01-01"]);
    expect(nextOccurrences("FREQ=DAILY;DTSTART=20261001", new Date(2026, 9, 3, 12), 2).map((d) => d.toDateString())).toEqual([new Date(2026, 9, 4).toDateString(), new Date(2026, 9, 5).toDateString()]);
    expect(occurrences("FREQ=DAILY", "no es fecha", 2)).toEqual([]);
    expect(occurrences("FREQ=DAILY", START, 0)).toEqual([]);
  });

  it("las fechas son Date locales, a la hora de la regla", () => {
    const [o] = occurrences(rule("el último viernes de cada mes a las 5 pm"), START, 1);
    expect(o.date.getFullYear()).toBe(2026);
    expect(o.date.getMonth()).toBe(9);
    expect(o.date.getDate()).toBe(30);
    expect(o.date.getHours()).toBe(17);
    expect(o.time).toBe(1020);
    expect(occurrences(rule("los lunes"), START, 1)[0].time).toBeNull();
  });

  it("reglas imposibles: terminan sin fechas, rápido", () => {
    const t0 = performance.now();
    expect(days("el 31 de febrero", START)).toEqual([]);
    expect(days("DTSTART:20260401T000000\nRRULE:FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=31", START)).toEqual([]);
    expect(days("FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30", START)).toEqual([]);
    expect(days("FREQ=HOURLY;BYMONTH=4;BYMONTHDAY=31", START)).toEqual([]);
    expect(days("FREQ=WEEKLY;BYDAY=MO;BYMONTH=2;BYMONTHDAY=30", START)).not.toBeNull();
    expect(days("DTSTART:20260101T000000\nRRULE:FREQ=DAILY;UNTIL=20251231T235959", START)).toEqual([]);
    expect(days("DTSTART:99991231T000000\nRRULE:FREQ=DAILY", "9999-12-30", 3)).toEqual(["9999-12-31"]);
    // Todo son festivos: nada que saltar a ningún lado, sin colgarse.
    expect(days("todos los días menos en festivos", START, 3, (y) => Array.from({ length: 366 }, (_, i) => isoOf(dayOf(y, 1, 1 + i))))).toEqual([]);
    expect(performance.now() - t0).toBeLessThan(3000);
  });

  it("1.000 ocurrencias en tiempo lineal", () => {
    const r = rule("de lunes a viernes a las 8 y a las 14, menos en festivos");
    const t0 = performance.now();
    const a = occurrences(r, START, 1000);
    const t1 = performance.now();
    const b = occurrences(r, START, 10000);
    const t2 = performance.now();
    expect(a).toHaveLength(1000);
    expect(b).toHaveLength(10000);
    expect(b.slice(0, 1000).map((o) => +o.date)).toEqual(a.map((o) => +o.date));
    // En orden y sin repetir.
    for (let i = 1; i < b.length; i++) expect(+b[i].date > +b[i - 1].date).toBe(true);
    expect(t1 - t0).toBeLessThan(500);
    expect(t2 - t1).toBeLessThan(3000);
    // 1.000 por hora y 1.000 corridos por festivo.
    expect(occurrences(rule("cada hora"), START, 1000)).toHaveLength(1000);
    expect(occurrences(rule("todos los días, si cae festivo, el día hábil siguiente"), START, 1000)).toHaveLength(1000);
  });
});

// ---------------------------------------------------------------- festivos

describe("colombiaHolidays", () => {
  it("la Pascua (computus)", () => {
    expect(isoOf(easterDay(2025))).toBe("2025-04-20");
    expect(isoOf(easterDay(2026))).toBe("2026-04-05");
    expect(isoOf(easterDay(2027))).toBe("2027-03-28");
    expect(isoOf(easterDay(2000))).toBe("2000-04-23");
    expect(isoOf(easterDay(2038))).toBe("2038-04-25");
  });

  it("2025: 18 festivos en 17 fechas (San Pedro y el Sagrado Corazón caen el mismo lunes 30 de junio)", () => {
    expect(colombiaHolidays(2025)).toEqual([
      "2025-01-01", "2025-01-06", "2025-03-24", "2025-04-17", "2025-04-18", "2025-05-01", "2025-06-02", "2025-06-23", "2025-06-30",
      "2025-07-20", "2025-08-07", "2025-08-18", "2025-10-13", "2025-11-03", "2025-11-17", "2025-12-08", "2025-12-25",
    ]);
  });

  it("2026, como el calendario oficial", () => {
    expect(colombiaHolidays(2026)).toEqual([
      "2026-01-01", "2026-01-12", "2026-03-23", "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-18", "2026-06-08", "2026-06-15",
      "2026-06-29", "2026-07-20", "2026-08-07", "2026-08-17", "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
    ]);
  });

  it("2027", () => {
    expect(colombiaHolidays(2027)).toEqual([
      "2027-01-01", "2027-01-11", "2027-03-22", "2027-03-25", "2027-03-26", "2027-05-01", "2027-05-10", "2027-05-31", "2027-06-07",
      "2027-07-05", "2027-07-20", "2027-08-07", "2027-08-16", "2027-10-18", "2027-11-01", "2027-11-15", "2027-12-08", "2027-12-25",
    ]);
  });

  it("los que se corren caen siempre en lunes", () => {
    for (let y = 2000; y <= 2060; y++) {
      const hs = colombiaHolidays(y);
      expect(hs.length).toBeGreaterThanOrEqual(17);
      for (const iso of hs) {
        const [, m, d] = iso.split("-").map(Number);
        const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
        const fixed = ["01-01", "05-01", "07-20", "08-07", "12-08", "12-25"].includes(iso.slice(5));
        // Los fijos y Semana Santa (jueves y viernes) pueden caer cualquier día; los demás, en lunes.
        if (!fixed && !(wd === 4 || wd === 5)) expect(wd, `${iso} (${m}/${d})`).toBe(1);
      }
    }
  });
});

describe("SSR", () => {
  it("importar el elemento en Node (sin DOM) no lanza", async () => {
    const m = await import("../src/components/recurrence/index");
    expect(typeof m.NxRecurrence).toBe("function");
    expect(m.toRRule(m.parseRRule("FREQ=DAILY")!)).toContain("FREQ=DAILY");
  });
});
