import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  cleanBookings,
  cleanDates,
  cleanResources,
  cleanWorkdays,
  fill,
  plannerClashes,
  plannerColumns,
  plannerDate,
  plannerHours,
  plannerISO,
  plannerLanes,
  plannerMove,
  plannerOccupancy,
  plannerParse,
  plannerRange,
  plannerResize,
  plannerSnap,
  plannerSpan,
  plannerStep,
  plannerTime,
  plannerX,
  safeColor,
} from "../src/components/planner/logic";

// Todo en hora local: se fija Bogotá (sin horario de verano) y, en su bloque, Nueva York para el cambio de hora.
const TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Bogota";
});
afterAll(() => {
  process.env.TZ = TZ;
});

/** Hora local: `at(2026, 10, 6, 7, 30)`. */
const at = (y: number, mo: number, d: number, hh = 0, mm = 0) => new Date(y, mo - 1, d, hh, mm).getTime();
const hm = (t: number) => {
  const d = new Date(t);
  return `${plannerDate(t)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};
const MIN = 6e4;

describe("fechas", () => {
  it("lee ISO sin zona como hora local y con zona como ese instante", () => {
    expect(plannerParse("2026-10-06T07:30")).toBe(at(2026, 10, 6, 7, 30));
    expect(plannerParse("2026-10-06 07:30:15")).toBe(new Date(2026, 9, 6, 7, 30, 15).getTime());
    expect(plannerParse("2026-10-06")).toBe(at(2026, 10, 6));
    expect(plannerParse("2026-10-06T12:30:00Z")).toBe(Date.UTC(2026, 9, 6, 12, 30));
    expect(plannerParse("2026-10-06T07:30:00-05:00")).toBe(at(2026, 10, 6, 7, 30));
    expect(plannerParse("2026-10-06T24:00")).toBe(at(2026, 10, 7));
  });

  it("descarta lo que no existe o no se entiende", () => {
    for (const bad of ["2026-02-30", "2026-13-01", "2026-10-06T25:00", "2026-10-06T24:30", "6/10/2026", "", "mañana", 20261006, null, undefined]) expect(plannerParse(bad)).toBeNull();
  });

  it("escribe ISO local con su desfase y vuelve a leerlo igual", () => {
    const t = at(2026, 10, 6, 7, 30);
    expect(plannerISO(t)).toBe("2026-10-06T07:30:00-05:00");
    expect(plannerParse(plannerISO(t))).toBe(t);
    expect(plannerDate(t)).toBe("2026-10-06");
  });

  it("entiende el horario laboral", () => {
    expect(plannerHours("07:00-18:00")).toEqual([420, 1080]);
    expect(plannerHours(" 6:30 – 22:00 ")).toEqual([390, 1320]);
    expect(plannerHours("00:00-24:00")).toEqual([0, 1440]);
    for (const bad of ["18:00-07:00", "7-18", "07:00-25:00", "07:61-08:00", "", null]) expect(plannerHours(bad)).toBeNull();
  });

  it("días laborables y festivos", () => {
    expect([...cleanWorkdays(undefined)]).toEqual([1, 2, 3, 4, 5]);
    expect([...cleanWorkdays([1, 2, 7, 9, "x", 6.5])]).toEqual([1, 2, 0]);
    expect(cleanDates(["2026-10-12", "12/10/2026", 5, "2026-11-02"])).toEqual(["2026-10-12", "2026-11-02"]);
  });
});

describe("rango y columnas", () => {
  it("la semana empieza el lunes (o el día pedido) y el mes va del 1 al 1", () => {
    const sun = at(2026, 10, 11, 15);
    expect(plannerRange("week", sun)).toEqual({ start: at(2026, 10, 5), end: at(2026, 10, 12) });
    expect(plannerRange("week", at(2026, 10, 5, 0, 1))).toEqual({ start: at(2026, 10, 5), end: at(2026, 10, 12) });
    expect(plannerRange("week", sun, 7)).toEqual({ start: at(2026, 10, 11), end: at(2026, 10, 18) });
    expect(plannerRange("day", sun)).toEqual({ start: at(2026, 10, 11), end: at(2026, 10, 12) });
    expect(plannerRange("month", sun)).toEqual({ start: at(2026, 10, 1), end: at(2026, 11, 1) });
    expect(plannerRange("month", at(2026, 12, 31, 23))).toEqual({ start: at(2026, 12, 1), end: at(2027, 1, 1) });
    // Una semana que cruza el cambio de mes.
    expect(plannerRange("week", at(2026, 9, 30))).toEqual({ start: at(2026, 9, 28), end: at(2026, 10, 5) });
  });

  it("avanza de a período sin saltarse meses cortos", () => {
    expect(plannerStep("day", at(2026, 10, 31), 1)).toBe(at(2026, 11, 1));
    expect(plannerStep("week", at(2026, 10, 6), -1)).toBe(at(2026, 9, 29));
    expect(plannerStep("month", at(2026, 1, 31), 1)).toBe(at(2026, 2, 28));
    expect(plannerStep("month", at(2026, 12, 15), 1)).toBe(at(2027, 1, 15));
  });

  it("día: franjas del día entero; semana y mes: un día por columna con el horario", () => {
    const d = at(2026, 10, 6, 10);
    expect(plannerColumns("day", d, { slot: 60 })).toHaveLength(24);
    const q = plannerColumns("day", d, { slot: 15 });
    expect(q).toHaveLength(96);
    expect(hm(q[30].start)).toBe("2026-10-06 07:30");
    expect(q[95].end).toBe(at(2026, 10, 7));
    const w = plannerColumns("week", d, { hours: [420, 1080] });
    expect(w.map((c) => hm(c.start))).toEqual(["2026-10-05 07:00", "2026-10-06 07:00", "2026-10-07 07:00", "2026-10-08 07:00", "2026-10-09 07:00", "2026-10-10 07:00", "2026-10-11 07:00"]);
    expect(hm(w[0].end)).toBe("2026-10-05 18:00");
    expect(w[0].day).toBe(at(2026, 10, 5));
    const m = plannerColumns("month", d);
    expect(m).toHaveLength(31);
    expect(m[30].end).toBe(at(2026, 11, 1));
    expect(plannerColumns("month", at(2026, 2, 3))).toHaveLength(28);
  });

  it("posición y hora: ida y vuelta, fuera del horario se pega al borde", () => {
    const w = plannerColumns("week", at(2026, 10, 6), { hours: [420, 1080] });
    const W = 110;
    expect(plannerX(w, at(2026, 10, 6, 7), W)).toBe(W);
    expect(plannerX(w, at(2026, 10, 6, 12, 30), W)).toBeCloseTo(1.5 * W);
    expect(plannerX(w, at(2026, 10, 6, 20), W)).toBe(2 * W); // después de las 18: al borde derecho del martes
    expect(plannerX(w, at(2026, 10, 6, 5), W)).toBe(W); // antes de las 7: al final del lunes = inicio del martes
    expect(plannerX(w, at(2026, 10, 1), W)).toBe(0);
    expect(plannerX(w, at(2026, 10, 20), W)).toBe(7 * W);
    for (const t of [at(2026, 10, 5, 7), at(2026, 10, 7, 9, 15), at(2026, 10, 11, 17, 45)]) expect(plannerTime(w, plannerX(w, t, W), W)).toBeCloseTo(t, -3);
    expect(plannerTime(w, -50, W)).toBe(w[0].start);
    expect(plannerTime(w, 99999, W)).toBe(w[6].end);
    expect(plannerTime([], 10, W)).toBe(0);
  });
});

describe("ajuste a la rejilla", () => {
  it("redondea a la franja desde la medianoche local", () => {
    expect(hm(plannerSnap(at(2026, 10, 6, 7, 37), 15))).toBe("2026-10-06 07:30");
    expect(hm(plannerSnap(at(2026, 10, 6, 7, 38), 15))).toBe("2026-10-06 07:45");
    expect(hm(plannerSnap(at(2026, 10, 6, 7, 31), 15, "floor"))).toBe("2026-10-06 07:30");
    expect(hm(plannerSnap(at(2026, 10, 6, 7, 31), 15, "ceil"))).toBe("2026-10-06 07:45");
    expect(hm(plannerSnap(at(2026, 10, 6, 7, 30), 15, "ceil"))).toBe("2026-10-06 07:30");
    expect(hm(plannerSnap(at(2026, 10, 6, 7, 30), 15, "floor"))).toBe("2026-10-06 07:30");
  });

  it("cruza la medianoche y el cambio de mes", () => {
    expect(hm(plannerSnap(at(2026, 10, 31, 23, 55), 15))).toBe("2026-11-01 00:00");
    expect(hm(plannerSnap(at(2026, 10, 31, 23, 50), 30, "ceil"))).toBe("2026-11-01 00:00");
    expect(hm(plannerSnap(at(2026, 10, 31, 13), 1440))).toBe("2026-11-01 00:00");
    expect(hm(plannerSnap(at(2026, 10, 31, 11), 1440))).toBe("2026-10-31 00:00");
    expect(hm(plannerSnap(at(2026, 10, 31, 1), 1440, "ceil"))).toBe("2026-11-01 00:00");
  });

  it("con horario laboral, queda dentro del horario de ese día", () => {
    const hrs: [number, number] = [420, 1080];
    expect(hm(plannerSnap(at(2026, 10, 6, 5, 10), 15, "round", hrs))).toBe("2026-10-06 07:00");
    expect(hm(plannerSnap(at(2026, 10, 6, 19, 40), 30, "round", hrs))).toBe("2026-10-06 18:00");
    expect(hm(plannerSnap(at(2026, 10, 6, 17, 50), 30, "round", hrs))).toBe("2026-10-06 18:00");
  });

  it("mover conserva la duración; con días enteros conserva la hora", () => {
    const b = { start: at(2026, 10, 6, 7, 30), end: at(2026, 10, 6, 9) };
    const m = plannerMove(b, at(2026, 10, 6, 10, 8), 15);
    expect([hm(m.start), hm(m.end)]).toEqual(["2026-10-06 10:15", "2026-10-06 11:45"]);
    const d = plannerMove(b, at(2026, 10, 30, 23), 1440);
    expect([hm(d.start), hm(d.end)]).toEqual(["2026-10-31 07:30", "2026-10-31 09:00"]);
    const n = plannerMove({ start: at(2026, 10, 31, 22), end: at(2026, 11, 1, 2) }, at(2026, 11, 1, 22, 5), 30);
    expect([hm(n.start), hm(n.end)]).toEqual(["2026-11-01 22:00", "2026-11-02 02:00"]);
  });

  it("cambiar la duración nunca deja menos de una franja", () => {
    const b = { start: at(2026, 10, 6, 7, 30), end: at(2026, 10, 6, 9) };
    expect(hm(plannerResize(b, "end", at(2026, 10, 6, 10, 20), 15).end)).toBe("2026-10-06 10:15");
    expect(hm(plannerResize(b, "end", at(2026, 10, 6, 6), 15).end)).toBe("2026-10-06 07:45");
    expect(hm(plannerResize(b, "start", at(2026, 10, 6, 6, 50), 15).start)).toBe("2026-10-06 06:45");
    expect(hm(plannerResize(b, "start", at(2026, 10, 6, 11), 15).start)).toBe("2026-10-06 08:45");
    const day = { start: at(2026, 10, 6), end: at(2026, 10, 8) };
    expect(hm(plannerResize(day, "end", at(2026, 10, 5, 3), 1440).end)).toBe("2026-10-07 00:00");
    expect(hm(plannerResize(day, "start", at(2026, 10, 9), 1440).start)).toBe("2026-10-07 00:00");
  });

  it("crear arrastrando en cualquier sentido, de franja a franja", () => {
    const s = plannerSpan(at(2026, 10, 6, 9, 50), at(2026, 10, 6, 8, 10), 15);
    expect([hm(s.start), hm(s.end)]).toEqual(["2026-10-06 08:00", "2026-10-06 10:00"]);
    const one = plannerSpan(at(2026, 10, 6, 8, 5), at(2026, 10, 6, 8, 5), 30);
    expect([hm(one.start), hm(one.end)]).toEqual(["2026-10-06 08:00", "2026-10-06 08:30"]);
    const days = plannerSpan(at(2026, 10, 6, 14), at(2026, 10, 8, 3), 1440);
    expect([hm(days.start), hm(days.end)]).toEqual(["2026-10-06 00:00", "2026-10-09 00:00"]);
  });
});

describe("cambio de horario de verano (Nueva York)", () => {
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = "America/Bogota";
  });

  it("el día de 23 horas tiene sus columnas por hora local y posiciones crecientes", () => {
    const day = at(2026, 3, 8);
    const cols = plannerColumns("day", day, { slot: 60 });
    expect(cols).toHaveLength(24);
    expect(hm(cols[4].start)).toBe("2026-03-08 04:00");
    const xs = [1, 3, 4, 10, 23].map((h) => plannerX(cols, at(2026, 3, 8, h), 50));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(plannerX(cols, at(2026, 3, 8, 4), 50)).toBe(200);
    expect(hm(plannerSnap(at(2026, 3, 8, 3, 10), 15))).toBe("2026-03-08 03:15");
    expect(addDays(at(2026, 3, 7, 9), 1)).toBe(at(2026, 3, 8, 9));
    expect(plannerRange("week", at(2026, 3, 10)).start).toBe(at(2026, 3, 9));
  });
});

describe("carriles, choques y ocupación", () => {
  const s = (a: number, b: number, status?: "block") => ({ start: a * MIN, end: b * MIN, status });

  it("carriles con solapes encadenados: el primero libre", () => {
    // 1 solapa con 2, 2 con 3, pero 1 no con 3: dos carriles.
    const r = plannerLanes([s(0, 60), s(30, 120), s(90, 150), s(150, 180)]);
    expect(r).toEqual({ lanes: [0, 1, 0, 0], count: 2 });
    // Tres a la vez, en desorden: tres carriles; lo que toca el final de otro reusa su carril.
    expect(plannerLanes([s(20, 50), s(0, 100), s(10, 40), s(40, 60)])).toEqual({ lanes: [2, 0, 1, 1], count: 3 });
    expect(plannerLanes([])).toEqual({ lanes: [], count: 0 });
  });

  it("capacidad 1: dos a la vez chocan; tocarse no es chocar", () => {
    expect([...plannerClashes([s(0, 60), s(60, 120)]).clash]).toEqual([]);
    const r = plannerClashes([s(0, 60), s(30, 90), s(120, 180)]);
    expect([...r.clash].sort()).toEqual([0, 1]);
    expect(r.peak).toBe(2);
    // Encadenados: 0–1 y 1–2 chocan aunque 0 y 2 no se toquen.
    expect([...plannerClashes([s(0, 60), s(50, 110), s(100, 150)]).clash].sort()).toEqual([0, 1, 2]);
  });

  it("capacidad 2: choca solo el tercero a la vez", () => {
    expect(plannerClashes([s(0, 60), s(30, 90)], 2).clash.size).toBe(0);
    const r = plannerClashes([s(0, 60), s(30, 90), s(45, 50), s(100, 110)], 2);
    expect([...r.clash].sort()).toEqual([0, 1, 2]);
    expect(r.peak).toBe(3);
  });

  it("un bloqueo ocupa el recurso entero, sea cual sea la capacidad", () => {
    expect([...plannerClashes([s(0, 600, "block"), s(100, 160)], 3).clash].sort()).toEqual([0, 1]);
    expect(plannerClashes([s(0, 600, "block"), s(600, 660)], 3).clash.size).toBe(0);
    expect(plannerClashes([s(0, 600, "block")]).clash.size).toBe(0);
  });

  it("ocupación por día: cada recurso cuenta una vez, y lo que cruza la medianoche cuenta en los dos", () => {
    const cols = plannerColumns("week", at(2026, 10, 6), { hours: [420, 1080] });
    const a = [
      { start: at(2026, 10, 5, 8), end: at(2026, 10, 5, 9) },
      { start: at(2026, 10, 5, 10), end: at(2026, 10, 5, 11) },
    ];
    const b = [{ start: at(2026, 10, 6, 17), end: at(2026, 10, 7, 8) }];
    const c = [{ start: at(2026, 10, 8, 19), end: at(2026, 10, 8, 22) }]; // fuera del horario: no cuenta
    expect(plannerOccupancy([a, b, c, []], cols)).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  it("2.000 reservas en 300 recursos: tiempo casi lineal", () => {
    const make = (n: number) => {
      const out: { start: number; end: number }[] = [];
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
      for (let i = 0; i < n; i++) {
        const a = at(2026, 10, 1) + Math.floor(rnd() * 30 * 24) * 60 * MIN;
        out.push({ start: a, end: a + (1 + Math.floor(rnd() * 6)) * 60 * MIN });
      }
      return out;
    };
    const run = (n: number) => {
      const items = make(n);
      const t0 = performance.now();
      const by: (typeof items)[] = Array.from({ length: 300 }, () => []);
      items.forEach((b, i) => by[i % 300].push(b));
      for (const list of by) {
        plannerLanes(list);
        plannerClashes(list, 1 + (list.length % 2));
      }
      plannerOccupancy(by, plannerColumns("month", at(2026, 10, 1)));
      plannerLanes(items);
      plannerClashes(items, 50);
      return performance.now() - t0;
    };
    run(2000);
    const small = Math.max(0.5, run(2000));
    const big = run(20000);
    expect(small).toBeLessThan(80);
    // ×10 datos: con n log n son ~×13; se deja margen para el ruido de la máquina.
    expect(big / small).toBeLessThan(60);
  });
});

describe("SSR", () => {
  it("importar el componente en Node no lanza ni registra nada", async () => {
    const mod = await import("../src/components/planner/index");
    expect(typeof mod.NxPlanner).toBe("function");
    expect(mod.PLANNER_LABELS.today).toBe("Hoy");
  });
});

describe("datos", () => {
  it("recursos: sin id o nombre, o repetidos, se descartan", () => {
    const r = cleanResources([{ id: 1, name: "Camión TKR-512", capacity: 2.7 }, { id: "1", name: "otro" }, { id: "x" }, null, { id: "m", name: "Montacargas", group: "Patio", capacity: -1 }]);
    expect(r).toEqual([
      { id: "1", name: "Camión TKR-512", detail: undefined, avatar: undefined, icon: undefined, group: undefined, capacity: 2 },
      { id: "m", name: "Montacargas", detail: undefined, avatar: undefined, icon: undefined, group: "Patio", capacity: undefined },
    ]);
    expect(cleanResources("nada")).toEqual([]);
  });

  it("reservas: tramo válido, estado conocido, color sin url() y lo demás se conserva", () => {
    const list = cleanBookings([
      { id: "a", resource: "1", start: "2026-10-06T07:30", end: "2026-10-06T09:00", title: "Entrega", status: "block", color: "#0a7", data: { pedido: 9 } },
      { id: "b", resource: "1", start: "2026-10-06T09:00", end: "2026-10-06T08:00", title: "Al revés" },
      { id: "c", resource: "1", start: "ayer", end: "2026-10-06T08:00", title: "Mala" },
      { id: "a", resource: "1", start: "2026-10-06T07:30", end: "2026-10-06T09:00", title: "Repetida" },
      { id: "d", resource: 2, start: "2026-10-06", end: "2026-10-07", title: "Todo el día", status: "otro", color: "url(https://x.co/p.png)", readonly: "sí" },
    ]);
    expect(list.map((i) => i.b.id)).toEqual(["a", "d"]);
    expect(list[0]).toMatchObject({ start: at(2026, 10, 6, 7, 30), end: at(2026, 10, 6, 9), b: { status: "block", color: "#0a7", data: { pedido: 9 } } });
    expect(list[1].b).toMatchObject({ resource: "2", status: undefined, color: undefined, readonly: undefined });
  });

  it("colores aceptados", () => {
    expect(safeColor("oklch(0.6 0.15 250)")).toBe("oklch(0.6 0.15 250)");
    expect(safeColor("rgb(10 20 30 / 50%)")).toBe("rgb(10 20 30 / 50%)");
    expect(safeColor("teal")).toBe("teal");
    for (const bad of ["red;background:url(x)", "var(--x)", "expression(alert(1))", "#12", 5]) expect(safeColor(bad)).toBeUndefined();
  });

  it("reemplaza {claves} de los textos", () => {
    expect(fill("{n}/{total} {x}", { n: 7, total: 9 })).toBe("7/9 {x}");
  });
});
