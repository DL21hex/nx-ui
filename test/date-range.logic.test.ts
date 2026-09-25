import { describe, expect, it } from "vitest";
import { addMonths, clampRange, cleanPresets, compareRange, dayOf, dayOfISO, daysText, formatRange, isoOf, monthGrid, monthTitle, normalize, parsePhrase, presetRange, rangeDays, startOfWeek, toRange, weekdays, weekStartOf, type ParseOptions } from "../src/components/date-range/logic";

/** Hoy es viernes 25 de septiembre de 2026 (salvo que la prueba diga otra cosa). */
const TODAY = "2026-09-25";
const p = (text: string, opts: ParseOptions = {}) => {
  const r = parsePhrase(text, { today: TODAY, ...opts });
  return r ? `${r.start}/${r.end}` : null;
};

describe("días de calendario", () => {
  it("ISO ↔ día, sin fechas que no existen", () => {
    expect(isoOf(dayOf(2026, 9, 25))).toBe("2026-09-25");
    expect(dayOfISO("2026-09-25")).toBe(dayOf(2026, 9, 25));
    expect(dayOfISO("2024-02-29")).not.toBeNull();
    expect(dayOfISO("2023-02-29")).toBeNull();
    expect(dayOfISO("2026-13-01")).toBeNull();
    expect(dayOfISO("2026-04-31")).toBeNull();
    expect(dayOfISO("25/09/2026")).toBeNull();
    expect(dayOfISO(null)).toBeNull();
    expect(dayOfISO(20260925)).toBeNull();
  });

  it("sumar meses conserva el día o toma el último del mes (bisiestos incluidos)", () => {
    const iso = (s: string, n: number) => isoOf(addMonths(dayOfISO(s)!, n));
    expect(iso("2026-03-31", -1)).toBe("2026-02-28");
    expect(iso("2024-03-31", -1)).toBe("2024-02-29");
    expect(iso("2024-02-29", 12)).toBe("2025-02-28");
    expect(iso("2026-01-15", -1)).toBe("2025-12-15");
    expect(iso("2025-12-31", 2)).toBe("2026-02-28");
    expect(iso("2026-09-25", -120)).toBe("2016-09-25");
  });

  it("inicio de semana según el primer día (lunes o domingo)", () => {
    // 2026-01-01 fue jueves.
    expect(isoOf(startOfWeek(dayOf(2026, 1, 1), 1))).toBe("2025-12-29");
    expect(isoOf(startOfWeek(dayOf(2026, 1, 1), 7))).toBe("2025-12-28");
    expect(isoOf(startOfWeek(dayOf(2026, 1, 1), 6))).toBe("2025-12-27");
    expect(isoOf(startOfWeek(dayOf(2026, 9, 21), 1))).toBe("2026-09-21");
  });

  it("weekInfo del locale, o lunes", () => {
    expect([1, 7]).toContain(weekStartOf("es-CO"));
    expect(weekStartOf("es-ES")).toBe(1);
    expect(weekStartOf("no-es-un-locale-!!")).toBe(1);
  });
});

describe("frases: días", () => {
  it("hoy, ayer, anteayer, mañana, hace N días", () => {
    expect(p("hoy")).toBe("2026-09-25/2026-09-25");
    expect(p("Hoy")).toBe("2026-09-25/2026-09-25");
    expect(p("  HOY. ")).toBe("2026-09-25/2026-09-25");
    expect(p("ayer")).toBe("2026-09-24/2026-09-24");
    expect(p("anteayer")).toBe("2026-09-23/2026-09-23");
    expect(p("antier")).toBe("2026-09-23/2026-09-23");
    expect(p("mañana")).toBe("2026-09-26/2026-09-26");
    expect(p("pasado mañana")).toBe("2026-09-27/2026-09-27");
    expect(p("hace 3 días")).toBe("2026-09-22/2026-09-22");
    expect(p("hace una semana")).toBe("2026-09-18/2026-09-18");
  });

  it("ayer cruzando mes y año", () => {
    expect(p("ayer", { today: "2026-03-01" })).toBe("2026-02-28/2026-02-28");
    expect(p("ayer", { today: "2024-03-01" })).toBe("2024-02-29/2024-02-29");
    expect(p("ayer", { today: "2026-01-01" })).toBe("2025-12-31/2025-12-31");
  });

  it("fechas escritas de muchas formas", () => {
    expect(p("15 de marzo")).toBe("2026-03-15/2026-03-15");
    expect(p("15 marzo 2025")).toBe("2025-03-15/2025-03-15");
    expect(p("15 de marzo de 2025")).toBe("2025-03-15/2025-03-15");
    expect(p("15 de marzo del 2025")).toBe("2025-03-15/2025-03-15");
    expect(p("el 15 de mar.")).toBe("2026-03-15/2026-03-15");
    expect(p("marzo 15")).toBe("2026-03-15/2026-03-15");
    expect(p("2026-03-15")).toBe("2026-03-15/2026-03-15");
    expect(p("15/03/2026")).toBe("2026-03-15/2026-03-15");
    expect(p("15-03-2026")).toBe("2026-03-15/2026-03-15");
    expect(p("15.03.2026")).toBe("2026-03-15/2026-03-15");
    expect(p("15/3/26")).toBe("2026-03-15/2026-03-15");
    expect(p("15/03")).toBe("2026-03-15/2026-03-15");
    expect(p("1 sept 2026")).toBe("2026-09-01/2026-09-01");
    expect(p("1 setiembre 2026")).toBe("2026-09-01/2026-09-01");
  });

  it("sin año, la más reciente que ya empezó (en septiembre, «15 de diciembre» es el del año pasado)", () => {
    expect(p("15 de diciembre")).toBe("2025-12-15/2025-12-15");
    expect(p("25 de septiembre")).toBe("2026-09-25/2026-09-25");
    expect(p("26 de septiembre")).toBe("2025-09-26/2025-09-26");
  });

  it("bisiestos: el 29 de febrero sin año busca el último que existió; con año que no es bisiesto, nada", () => {
    expect(p("29 de febrero")).toBe("2024-02-29/2024-02-29");
    expect(p("29 feb 2024")).toBe("2024-02-29/2024-02-29");
    expect(p("29 feb 2023")).toBeNull();
    expect(p("29/02/2028")).toBe("2028-02-29/2028-02-29");
    expect(p("30 de febrero")).toBeNull();
    expect(p("31/04/2026")).toBeNull();
    expect(p("32 de enero")).toBeNull();
  });
});

describe("frases: semanas", () => {
  it("esta semana y la pasada (lunes a domingo por defecto)", () => {
    expect(p("esta semana")).toBe("2026-09-21/2026-09-27");
    expect(p("la semana pasada")).toBe("2026-09-14/2026-09-20");
    expect(p("semana anterior")).toBe("2026-09-14/2026-09-20");
    expect(p("la última semana")).toBe("2026-09-14/2026-09-20");
    expect(p("la próxima semana")).toBe("2026-09-28/2026-10-04");
    expect(p("semana que viene")).toBe("2026-09-28/2026-10-04");
  });

  it("con domingo como primer día", () => {
    expect(p("esta semana", { weekStart: 7 })).toBe("2026-09-20/2026-09-26");
    expect(p("la semana pasada", { weekStart: 7 })).toBe("2026-09-13/2026-09-19");
    // Un domingo es el primer día de su semana.
    expect(p("esta semana", { weekStart: 7, today: "2026-09-27" })).toBe("2026-09-27/2026-10-03");
    expect(p("esta semana", { weekStart: 1, today: "2026-09-27" })).toBe("2026-09-21/2026-09-27");
  });

  it("semanas que cruzan el año", () => {
    expect(p("esta semana", { today: "2026-01-01" })).toBe("2025-12-29/2026-01-04");
    expect(p("la semana pasada", { today: "2026-01-02" })).toBe("2025-12-22/2025-12-28");
    expect(p("la próxima semana", { today: "2025-12-30" })).toBe("2026-01-05/2026-01-11");
    expect(p("esta semana", { today: "2027-01-01", weekStart: 7 })).toBe("2026-12-27/2027-01-02");
  });

  it("semana ISO: la 1 puede empezar en diciembre; 53 solo si el año la tiene", () => {
    expect(p("semana 1 de 2026")).toBe("2025-12-29/2026-01-04");
    expect(p("semana 1 2021")).toBe("2021-01-04/2021-01-10");
    expect(p("semana 53 de 2026")).toBe("2026-12-28/2027-01-03");
    expect(p("semana 53 de 2020")).toBe("2020-12-28/2021-01-03");
    expect(p("semana 53 de 2025")).toBeNull();
    expect(p("semana 0 de 2025")).toBeNull();
    expect(p("semana 39")).toBe("2026-09-21/2026-09-27");
    // Sin año, la más reciente que ya empezó.
    expect(p("semana 50")).toBe("2025-12-08/2025-12-14");
  });
});

describe("frases: meses", () => {
  it("este mes, el pasado, el próximo (con febreros)", () => {
    expect(p("este mes")).toBe("2026-09-01/2026-09-30");
    expect(p("mes actual")).toBe("2026-09-01/2026-09-30");
    expect(p("mes en curso")).toBe("2026-09-01/2026-09-30");
    expect(p("el mes pasado")).toBe("2026-08-01/2026-08-31");
    expect(p("mes anterior")).toBe("2026-08-01/2026-08-31");
    expect(p("el último mes")).toBe("2026-08-01/2026-08-31");
    expect(p("el próximo mes")).toBe("2026-10-01/2026-10-31");
    expect(p("el mes pasado", { today: "2024-03-10" })).toBe("2024-02-01/2024-02-29");
    expect(p("el mes pasado", { today: "2025-03-10" })).toBe("2025-02-01/2025-02-28");
    expect(p("el mes pasado", { today: "2026-01-31" })).toBe("2025-12-01/2025-12-31");
    expect(p("este mes", { today: "2024-02-29" })).toBe("2024-02-01/2024-02-29");
  });

  it("por nombre, abreviado, con o sin año, o numérico", () => {
    expect(p("marzo")).toBe("2026-03-01/2026-03-31");
    expect(p("Marzo 2025")).toBe("2025-03-01/2025-03-31");
    expect(p("marzo de 2025")).toBe("2025-03-01/2025-03-31");
    expect(p("mar 2025")).toBe("2025-03-01/2025-03-31");
    expect(p("mes de marzo")).toBe("2026-03-01/2026-03-31");
    expect(p("todo marzo")).toBe("2026-03-01/2026-03-31");
    expect(p("febrero 2024")).toBe("2024-02-01/2024-02-29");
    expect(p("febrero 2100")).toBe("2100-02-01/2100-02-28");
    expect(p("febrero 2000")).toBe("2000-02-01/2000-02-29");
    expect(p("03/2025")).toBe("2025-03-01/2025-03-31");
    expect(p("2025-03")).toBe("2025-03-01/2025-03-31");
    expect(p("13/2025")).toBeNull();
    for (const [name, m] of [["enero", "01"], ["ene", "01"], ["abril", "04"], ["mayo", "05"], ["junio", "06"], ["julio", "07"], ["agosto", "08"], ["ago", "08"], ["septiembre", "09"], ["setiembre", "09"], ["sep", "09"], ["octubre", "10"], ["noviembre", "11"], ["diciembre", "12"], ["dic", "12"]] as const) {
      expect(p(`${name} 2020`)?.slice(0, 10)).toBe(`2020-${m}-01`);
    }
  });

  it("sin año, el más reciente que ya empezó", () => {
    expect(p("septiembre")).toBe("2026-09-01/2026-09-30");
    expect(p("octubre")).toBe("2025-10-01/2025-10-31");
    expect(p("diciembre")).toBe("2025-12-01/2025-12-31");
    expect(p("enero", { today: "2027-01-02" })).toBe("2027-01-01/2027-01-31");
    expect(p("diciembre", { today: "2027-01-02" })).toBe("2026-12-01/2026-12-31");
  });
});

describe("frases: días hacia atrás", () => {
  it("últimos N días incluyen hoy", () => {
    expect(p("últimos 7 días")).toBe("2026-09-19/2026-09-25");
    expect(p("ultimos 7 dias")).toBe("2026-09-19/2026-09-25");
    expect(p("ÚLTIMOS 7 DÍAS")).toBe("2026-09-19/2026-09-25");
    expect(p("los últimos 30 días")).toBe("2026-08-27/2026-09-25");
    expect(p("últimos 90 días")).toBe("2026-06-28/2026-09-25");
    expect(p("últimos siete días")).toBe("2026-09-19/2026-09-25");
    expect(p("últimos treinta días")).toBe("2026-08-27/2026-09-25");
    expect(p("30 días")).toBe("2026-08-27/2026-09-25");
    expect(p("7d")).toBe("2026-09-19/2026-09-25");
    expect(p("último 1 día")).toBe("2026-09-25/2026-09-25");
    for (const n of [7, 30, 90]) expect(rangeDays(parsePhrase(`últimos ${n} días`, { today: TODAY })!)).toBe(n);
  });

  it("cruzando año y febrero bisiesto", () => {
    expect(p("últimos 7 días", { today: "2026-01-03" })).toBe("2025-12-28/2026-01-03");
    expect(p("últimos 30 días", { today: "2024-03-15" })).toBe("2024-02-15/2024-03-15");
    expect(p("últimos 30 días", { today: "2025-03-15" })).toBe("2025-02-14/2025-03-15");
  });

  it("semanas, meses, trimestres y años hacia atrás; próximos hacia adelante", () => {
    expect(p("últimas 2 semanas")).toBe("2026-09-12/2026-09-25");
    expect(p("los últimos tres meses")).toBe("2026-06-26/2026-09-25");
    expect(p("últimos 12 meses")).toBe("2025-09-26/2026-09-25");
    expect(p("últimos 2 trimestres")).toBe("2026-03-26/2026-09-25");
    expect(p("últimos 2 años")).toBe("2024-09-26/2026-09-25");
    expect(p("próximos 15 días")).toBe("2026-09-25/2026-10-09");
    expect(p("siguientes 2 meses")).toBe("2026-09-25/2026-11-24");
    expect(p("últimos 3 meses", { today: "2026-05-31" })).toBe("2026-03-01/2026-05-31");
  });

  it("lo corrido del período", () => {
    expect(p("en lo que va del año")).toBe("2026-01-01/2026-09-25");
    expect(p("lo que va del mes")).toBe("2026-09-01/2026-09-25");
    expect(p("en lo que va de la semana")).toBe("2026-09-21/2026-09-25");
    expect(p("año corrido")).toBe("2026-01-01/2026-09-25");
    expect(p("mes a la fecha")).toBe("2026-09-01/2026-09-25");
    expect(p("trimestre hasta hoy")).toBe("2026-07-01/2026-09-25");
    expect(p("YTD")).toBe("2026-01-01/2026-09-25");
    expect(p("mtd")).toBe("2026-09-01/2026-09-25");
    expect(p("qtd")).toBe("2026-07-01/2026-09-25");
  });
});

describe("frases: trimestres, semestres y años", () => {
  it("este trimestre, el último, el próximo", () => {
    expect(p("este trimestre")).toBe("2026-07-01/2026-09-30");
    expect(p("trimestre actual")).toBe("2026-07-01/2026-09-30");
    expect(p("último trimestre")).toBe("2026-04-01/2026-06-30");
    expect(p("el trimestre pasado")).toBe("2026-04-01/2026-06-30");
    expect(p("trimestre anterior")).toBe("2026-04-01/2026-06-30");
    expect(p("próximo trimestre")).toBe("2026-10-01/2026-12-31");
    expect(rangeDays(parsePhrase("este trimestre", { today: TODAY })!)).toBe(92);
  });

  it("trimestres en los bordes del año", () => {
    expect(p("último trimestre", { today: "2026-01-15" })).toBe("2025-10-01/2025-12-31");
    expect(p("este trimestre", { today: "2026-03-31" })).toBe("2026-01-01/2026-03-31");
    expect(p("este trimestre", { today: "2026-04-01" })).toBe("2026-04-01/2026-06-30");
    expect(p("próximo trimestre", { today: "2026-12-31" })).toBe("2027-01-01/2027-03-31");
    // Q1 de un bisiesto tiene 91 días; de uno normal, 90.
    expect(rangeDays(parsePhrase("Q1 2024", { today: TODAY })!)).toBe(91);
    expect(rangeDays(parsePhrase("Q1 2025", { today: TODAY })!)).toBe(90);
  });

  it("Q1–Q4 con y sin año, y sus variantes", () => {
    expect(p("Q3")).toBe("2026-07-01/2026-09-30");
    expect(p("q3")).toBe("2026-07-01/2026-09-30");
    expect(p("Q3 2025")).toBe("2025-07-01/2025-09-30");
    expect(p("Q3 de 2025")).toBe("2025-07-01/2025-09-30");
    expect(p("2025 Q3")).toBe("2025-07-01/2025-09-30");
    expect(p("2025-Q3")).toBe("2025-07-01/2025-09-30");
    expect(p("T2 2025")).toBe("2025-04-01/2025-06-30");
    expect(p("tercer trimestre de 2025")).toBe("2025-07-01/2025-09-30");
    expect(p("3er trimestre 2025")).toBe("2025-07-01/2025-09-30");
    expect(p("primer trimestre")).toBe("2026-01-01/2026-03-31");
    expect(p("segundo trimestre del 2024")).toBe("2024-04-01/2024-06-30");
    expect(p("cuarto trimestre 2025")).toBe("2025-10-01/2025-12-31");
    expect(p("trimestre 2 2025")).toBe("2025-04-01/2025-06-30");
    // En septiembre, Q4 sin año es el del año pasado (el de este aún no empieza).
    expect(p("Q4")).toBe("2025-10-01/2025-12-31");
    expect(p("Q5")).toBeNull();
  });

  it("semestres", () => {
    expect(p("primer semestre")).toBe("2026-01-01/2026-06-30");
    expect(p("1er semestre 2025")).toBe("2025-01-01/2025-06-30");
    expect(p("segundo semestre de 2025")).toBe("2025-07-01/2025-12-31");
    expect(p("segundo semestre")).toBe("2026-07-01/2026-12-31");
    expect(p("segundo semestre", { today: "2026-03-01" })).toBe("2025-07-01/2025-12-31");
    expect(p("H1 2025")).toBe("2025-01-01/2025-06-30");
    expect(p("S2")).toBe("2026-07-01/2026-12-31");
    expect(p("este semestre")).toBe("2026-07-01/2026-12-31");
    expect(p("semestre pasado")).toBe("2026-01-01/2026-06-30");
    expect(p("tercer semestre")).toBeNull();
  });

  it("años", () => {
    expect(p("este año")).toBe("2026-01-01/2026-12-31");
    expect(p("año actual")).toBe("2026-01-01/2026-12-31");
    expect(p("el año pasado")).toBe("2025-01-01/2025-12-31");
    expect(p("año anterior")).toBe("2025-01-01/2025-12-31");
    expect(p("el próximo año")).toBe("2027-01-01/2027-12-31");
    expect(p("2025")).toBe("2025-01-01/2025-12-31");
    expect(p("todo el 2025")).toBe("2025-01-01/2025-12-31");
    expect(p("el año 2024")).toBe("2024-01-01/2024-12-31");
    expect(rangeDays(parsePhrase("2024", { today: TODAY })!)).toBe(366);
    expect(rangeDays(parsePhrase("2025", { today: TODAY })!)).toBe(365);
  });

  it("año fiscal según fiscal-start (se nombra por el año en que empieza)", () => {
    expect(p("año fiscal")).toBe("2026-01-01/2026-12-31");
    expect(p("año fiscal", { fiscalStart: 4 })).toBe("2026-04-01/2027-03-31");
    expect(p("este año fiscal", { fiscalStart: 4 })).toBe("2026-04-01/2027-03-31");
    expect(p("año fiscal", { fiscalStart: 4, today: "2026-03-31" })).toBe("2025-04-01/2026-03-31");
    expect(p("año fiscal", { fiscalStart: 4, today: "2026-04-01" })).toBe("2026-04-01/2027-03-31");
    expect(p("año fiscal pasado", { fiscalStart: 4 })).toBe("2025-04-01/2026-03-31");
    expect(p("año fiscal anterior", { fiscalStart: 7 })).toBe("2025-07-01/2026-06-30");
    expect(p("próximo año fiscal", { fiscalStart: 10 })).toBe("2026-10-01/2027-09-30");
    expect(p("año fiscal 2025", { fiscalStart: 4 })).toBe("2025-04-01/2026-03-31");
    expect(p("AF 2025", { fiscalStart: 4 })).toBe("2025-04-01/2026-03-31");
    expect(p("FY2024", { fiscalStart: 7 })).toBe("2024-07-01/2025-06-30");
    expect(p("AF 2025-2026", { fiscalStart: 4 })).toBe("2025-04-01/2026-03-31");
    expect(p("AF 2025/26", { fiscalStart: 4 })).toBe("2025-04-01/2026-03-31");
    // Un año fiscal con febrero bisiesto tiene 366 días.
    expect(rangeDays(parsePhrase("año fiscal 2023", { today: TODAY, fiscalStart: 4 })!)).toBe(366);
    // Un fiscal-start inválido cae en enero.
    expect(p("año fiscal", { fiscalStart: 13 })).toBe("2026-01-01/2026-12-31");
  });
});

describe("frases: rangos", () => {
  it("de un mes a otro, con el año que falta tomado del otro extremo", () => {
    expect(p("de marzo a junio")).toBe("2026-03-01/2026-06-30");
    expect(p("marzo a junio")).toBe("2026-03-01/2026-06-30");
    expect(p("entre marzo y junio")).toBe("2026-03-01/2026-06-30");
    expect(p("marzo - junio")).toBe("2026-03-01/2026-06-30");
    expect(p("desde marzo hasta junio")).toBe("2026-03-01/2026-06-30");
    expect(p("de marzo a junio de 2025")).toBe("2025-03-01/2025-06-30");
    expect(p("marzo 2024 a junio 2025")).toBe("2024-03-01/2025-06-30");
    expect(p("de marzo a diciembre")).toBe("2026-03-01/2026-12-31");
  });

  it("cruzando el año: el fin es el primero que viene después del inicio", () => {
    expect(p("de noviembre a febrero")).toBe("2025-11-01/2026-02-28");
    expect(p("de diciembre a febrero de 2024")).toBe("2023-12-01/2024-02-29");
    expect(p("diciembre 2025 a enero")).toBe("2025-12-01/2026-01-31");
    expect(p("del 15 de diciembre al 10 de enero")).toBe("2025-12-15/2026-01-10");
  });

  it("días, con el mes y el año prestados", () => {
    expect(p("15/03/2026 - 20/04/2026")).toBe("2026-03-15/2026-04-20");
    expect(p("15/03/2026-20/04/2026")).toBe("2026-03-15/2026-04-20");
    expect(p("2026-03-15 - 2026-04-20")).toBe("2026-03-15/2026-04-20");
    expect(p("2026-03-15 a 2026-04-20")).toBe("2026-03-15/2026-04-20");
    expect(p("del 15 de marzo al 20 de abril")).toBe("2026-03-15/2026-04-20");
    expect(p("15 al 20 de abril")).toBe("2026-04-15/2026-04-20");
    expect(p("15-20 abril 2025")).toBe("2025-04-15/2025-04-20");
    expect(p("del 1 al 15")).toBe("2026-09-01/2026-09-15");
    expect(p("del 1 al 15", { today: "2024-02-20" })).toBe("2024-02-01/2024-02-15");
    expect(p("del 1 de septiembre a hoy")).toBe("2026-09-01/2026-09-25");
    expect(p("de ayer a hoy")).toBe("2026-09-24/2026-09-25");
  });

  it("periodos como extremos; al revés se ordena", () => {
    expect(p("entre Q1 y Q2 2025")).toBe("2025-01-01/2025-06-30");
    expect(p("Q1 - Q3")).toBe("2026-01-01/2026-09-30");
    expect(p("2024-2025")).toBe("2024-01-01/2025-12-31");
    expect(p("20/04/2026 - 15/03/2026")).toBe("2026-03-15/2026-04-20");
    expect(p("de 2025 a 2024")).toBe("2024-01-01/2025-12-31");
  });

  it("desde … (hasta hoy) y hasta … (desde min o el 1 de enero)", () => {
    expect(p("desde el 15 de marzo")).toBe("2026-03-15/2026-09-25");
    expect(p("a partir de abril")).toBe("2026-04-01/2026-09-25");
    expect(p("marzo en adelante")).toBe("2026-03-01/2026-09-25");
    expect(p("desde el 15/03/2025")).toBe("2025-03-15/2026-09-25");
    // Desde algo que aún no termina: hasta su fin.
    expect(p("desde este mes")).toBe("2026-09-01/2026-09-30");
    expect(p("hasta el 10 de abril")).toBe("2026-01-01/2026-04-10");
    expect(p("hasta el 10 de abril", { min: "2024-01-01" })).toBe("2024-01-01/2026-04-10");
    expect(p("hasta hoy")).toBe("2026-01-01/2026-09-25");
    expect(p("hasta marzo 2025")).toBe("2025-01-01/2025-03-31");
  });
});

describe("frases que no son", () => {
  it("devuelven null (sin lanzar)", () => {
    for (const t of ["", "   ", "blabla", "toString", "constructor", "últimos días", "últimos cero días", "hace x días", "15", "Q", "marzo de", "de marzo a", "a junio", "2025-13", "99/99/9999", "1/2/3/4", "<script>", "desde", "hasta", "--", "q3 q4"]) {
      expect(parsePhrase(t, { today: TODAY }), t).toBeNull();
    }
  });

  it("normaliza tildes, mayúsculas, signos y guiones largos", () => {
    expect(normalize("  Últimos   7 DÍAS!! ")).toBe("ultimos 7 dias");
    expect(normalize("1 sept. – 3 oct.")).toBe("1 sept - 3 oct");
    expect(normalize("15.03.2026")).toBe("15.03.2026");
    expect(normalize("año")).toBe("ano");
  });

  it("sin today usa la fecha local", () => {
    const r = parsePhrase("hoy")!;
    const n = new Date();
    expect(r.start).toBe(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`);
  });
});

describe("rangos, recorte y comparación", () => {
  it("toRange acepta objeto o intervalo ISO y ordena", () => {
    expect(toRange({ start: "2026-07-01", end: "2026-09-30" })).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(toRange("2026-07-01/2026-09-30")).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(toRange({ start: "2026-09-30", end: "2026-07-01" })).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(toRange({ start: "2026-07-01" })).toEqual({ start: "2026-07-01", end: "2026-07-01" });
    expect(toRange({ start: "2026-02-30", end: "2026-03-01" })).toBeNull();
    expect(toRange("ayer")).toBeNull();
    expect(toRange(null)).toBeNull();
    expect(toRange(42)).toBeNull();
  });

  it("clampRange recorta a min/max o dice que queda por fuera", () => {
    const r = { start: "2023-12-01", end: "2024-01-31" };
    expect(clampRange(r, "2024-01-01")).toEqual({ start: "2024-01-01", end: "2024-01-31", clamped: true });
    expect(clampRange(r, null, "2023-12-15")).toEqual({ start: "2023-12-01", end: "2023-12-15", clamped: true });
    expect(clampRange(r)).toEqual(r);
    expect(clampRange(r, "2024-02-01")).toBeNull();
    expect(clampRange(r, "2023-01-01", "2025-01-01")).toEqual(r);
  });

  it("período anterior: mismo largo, justo antes; meses completos → meses anteriores", () => {
    expect(compareRange({ start: "2026-09-19", end: "2026-09-25" }, "previous")).toEqual({ start: "2026-09-12", end: "2026-09-18" });
    expect(compareRange({ start: "2026-07-01", end: "2026-09-30" }, "previous")).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(compareRange({ start: "2024-03-01", end: "2024-03-31" }, "previous")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(compareRange({ start: "2025-03-01", end: "2025-03-31" }, "previous")).toEqual({ start: "2025-02-01", end: "2025-02-28" });
    expect(compareRange({ start: "2026-01-01", end: "2026-01-31" }, "previous")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
    expect(compareRange({ start: "2026-01-01", end: "2026-12-31" }, "previous")).toEqual({ start: "2025-01-01", end: "2025-12-31" });
    expect(compareRange({ start: "2026-09-25", end: "2026-09-25" }, "previous")).toEqual({ start: "2026-09-24", end: "2026-09-24" });
    // Un rango que empieza el 1 pero no termina fin de mes: días, no meses.
    expect(compareRange({ start: "2026-03-01", end: "2026-03-10" }, "previous")).toEqual({ start: "2026-02-19", end: "2026-02-28" });
    expect(compareRange({ start: "2026-01-01", end: "2026-01-07" }, "previous")).toEqual({ start: "2025-12-25", end: "2025-12-31" });
  });

  it("año anterior: mismas fechas; 29 feb → 28 feb; un mes completo sigue completo", () => {
    expect(compareRange({ start: "2026-07-01", end: "2026-09-30" }, "year")).toEqual({ start: "2025-07-01", end: "2025-09-30" });
    expect(compareRange({ start: "2024-02-29", end: "2024-02-29" }, "year")).toEqual({ start: "2023-02-28", end: "2023-02-28" });
    expect(compareRange({ start: "2025-02-01", end: "2025-02-28" }, "year")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(compareRange({ start: "2024-02-01", end: "2024-02-29" }, "year")).toEqual({ start: "2023-02-01", end: "2023-02-28" });
    expect(compareRange({ start: "2025-12-20", end: "2026-01-10" }, "year")).toEqual({ start: "2024-12-20", end: "2025-01-10" });
  });
});

describe("atajos", () => {
  it("cleanPresets acepta frases y objetos, descarta lo demás", () => {
    const out = cleanPresets(["Hoy", "  ", { label: "Temporada alta", start: "2026-12-15", end: "2026-11-15" }, { label: "Q3", phrase: "q3" }, { label: "Solo etiqueta" }, { phrase: "sin label" }, null, 3, { label: "Mala", start: "2026-02-30", end: "x", onclick: "alert(1)" }]);
    expect(out).toEqual([{ label: "Hoy" }, { label: "Temporada alta", start: "2026-11-15", end: "2026-12-15" }, { label: "Q3", phrase: "q3" }, { label: "Solo etiqueta" }, { label: "Mala" }]);
    expect(cleanPresets("Hoy")).toEqual([]);
  });

  it("presetRange: fechas fijas, o la frase (o la etiqueta) interpretada", () => {
    expect(presetRange({ label: "X", start: "2026-01-01", end: "2026-01-31" })).toEqual({ start: "2026-01-01", end: "2026-01-31" });
    expect(presetRange({ label: "Tercer trimestre", phrase: "Q3" }, { today: TODAY })).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(presetRange({ label: "Últimos 7 días" }, { today: TODAY })).toEqual({ start: "2026-09-19", end: "2026-09-25" });
    expect(presetRange({ label: "Sin sentido" }, { today: TODAY })).toBeNull();
  });
});

describe("calendario y formato", () => {
  it("monthGrid: huecos según el primer día de la semana", () => {
    // Septiembre 2026 empieza martes.
    const mon = monthGrid(2026, 9, 1);
    expect(mon.slice(0, 2)).toEqual([null, dayOf(2026, 9, 1)]);
    expect(mon.length % 7).toBe(0);
    expect(mon.filter((d) => d !== null)).toHaveLength(30);
    const sun = monthGrid(2026, 9, 7);
    expect(sun.slice(0, 3)).toEqual([null, null, dayOf(2026, 9, 1)]);
    expect(monthGrid(2024, 2, 1).filter((d) => d !== null)).toHaveLength(29);
    // Febrero 2026 empieza domingo: con lunes, seis huecos.
    expect(monthGrid(2026, 2, 1).indexOf(dayOf(2026, 2, 1))).toBe(6);
  });

  it("formatRange: corto, sin «de», con el año una vez", () => {
    expect(formatRange({ start: "2026-07-01", end: "2026-09-30" }, "es-CO")).toMatch(/^1 jul – 30 sept? 2026$/);
    expect(formatRange({ start: "2026-09-01", end: "2026-09-30" }, "es-CO")).toMatch(/^1 – 30 sept? 2026$/);
    expect(formatRange({ start: "2025-12-15", end: "2026-01-10" }, "es-CO")).toBe("15 dic 2025 – 10 ene 2026");
    expect(formatRange({ start: "2026-09-25", end: "2026-09-25" }, "es-CO")).toMatch(/^25 sept? 2026$/);
    expect(formatRange({ start: "2026-07-01", end: "2026-09-30" }, "en-US")).toBe("Jul 1 – Sep 30, 2026");
    expect(formatRange({ start: "2026-07-01", end: "2026-07-01" }, "no-valido-!!")).toMatch(/2026/);
  });

  it("títulos, días de la semana y nombres accesibles", () => {
    expect(monthTitle(2026, 9, "es-CO")).toBe("Septiembre 2026");
    expect(monthTitle(2026, 9, "en-US")).toBe("September 2026");
    expect(weekdays("es-CO", 1).map((w) => w.short)).toEqual(["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]);
    expect(weekdays("es-CO", 7)[0]).toEqual({ short: "Do", long: "domingo" });
  });

  it("daysText: plural del locale y separador de miles", () => {
    const L = { day: "{n} día", days: "{n} días" };
    expect(daysText(1, "es-CO", L)).toBe("1 día");
    expect(daysText(92, "es-CO", L)).toBe("92 días");
    expect(daysText(1234, "es-CO", L)).toBe("1234 días".replace("1234", (1234).toLocaleString("es-CO")));
    expect(daysText(0, "es-CO", L)).toBe("0 días");
  });
});

describe("SSR", () => {
  it("el módulo importa sin DOM", async () => {
    const mod = await import("../src/components/date-range/index");
    expect(typeof mod.NxDateRange).toBe("function");
    expect(mod.parseDateRange("Q3", { today: TODAY })).toEqual({ start: "2026-07-01", end: "2026-09-30" });
  });
});

describe("revisión: días sueltos y años extremos", () => {
  // Hoy, jueves 24: el 25 todavía no empezó.
  const q = (text: string) => p(text, { today: "2026-09-24" });

  it("un día suelto toma el mes del otro extremo; del lado equivocado, el mes de al lado (no otro año)", () => {
    expect(q("25 al 5")).toBe("2026-08-25/2026-09-05");
    expect(q("del 25 al 5 de octubre")).toBe("2025-09-25/2025-10-05");
    expect(q("del 15 de marzo al 20")).toBe("2026-03-15/2026-03-20");
    expect(q("del 25 de marzo al 5")).toBe("2026-03-25/2026-04-05");
    expect(q("del 20 al 30 de septiembre")).toBe("2026-09-20/2026-09-30");
    expect(q("del 25 al 5 de enero")).toBe("2025-12-25/2026-01-05");
    expect(q("del 26 a hoy")).toBe("2026-08-26/2026-09-24");
    expect(q("del 25 al 5 de octubre de 2027")).toBe("2027-09-25/2027-10-05");
    // Un día que no existe en ese mes no salta al siguiente.
    expect(q("del 15 de febrero al 30")).toBeNull();
    expect(q("del 31 al 5 de octubre")).toBeNull();
    // Un día suelto solo acompaña a otro día.
    expect(q("del 5 al 2025")).toBeNull();
    expect(q("marzo al 15")).toBeNull();
  });

  it("los años 1–99 no se vuelven 19xx; fuera de 0001–9999 no hay ISO", () => {
    expect(isoOf(dayOf(50, 3, 1))).toBe("0050-03-01");
    expect(dayOfISO("0050-03-01")).toBe(dayOf(50, 3, 1));
    expect(isoOf(dayOfISO("0001-01-01")!)).toBe("0001-01-01");
    expect(dayOfISO("0000-12-31")).toBeNull();
    expect(isoOf(dayOf(0, 12, 31))).toBe("");
    expect(isoOf(dayOf(10000, 1, 1))).toBe("");
    expect(isoOf(dayOf(9999, 12, 31))).toBe("9999-12-31");
    expect(toRange("0099-02-28/0099-03-01")).toEqual({ start: "0099-02-28", end: "0099-03-01" });
  });

  it("una frase que se sale de los años válidos no da rango (ni 1970)", () => {
    expect(p("últimos 99999999 días")).toBeNull();
    expect(p("últimos 999999999999 días")).toBeNull();
    expect(p("próximos 99999999 meses")).toBeNull();
    expect(clampRange({ start: "-271764-01-01", end: "2026-01-01" }, "2020-01-01")).toBeNull();
    expect(formatRange({ start: "x", end: "2026-01-01" }, "es-CO")).toBe("");
  });
});
