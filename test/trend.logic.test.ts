import { describe, expect, it } from "vitest";
import { change, cleanAnomalies, cleanPoints, cleanSeries, detectAnomalies, explainContext, flagsOf, movingMean, niceTicks, pctText, periodLabel, periodsOf, summarize, trendStep, whyQuestion } from "../src/components/trend/logic";
import { TREND_LABELS } from "../src/components/trend/trend";
import type { TrendSeries } from "../src/components/trend/types";

const months = (ys: (number | null)[]) => ys.map((y, i) => ({ x: `2026-${String(i + 1).padStart(2, "0")}`, y }));
const MP: TrendSeries = { id: "mp", label: "Materia prima", points: months([388, 392, 401, 396, 405, 409, 412, 486, 431]) };

describe("cleanSeries / cleanPoints / cleanAnomalies", () => {
  it("valida, ordena por x, descarta lo que no es suyo y los id repetidos", () => {
    const out = cleanSeries([
      { id: "v", label: "Ventas", kind: "bar", format: "money", currency: "COP", onclick: "x", points: [{ x: "2026-02", y: 2 }, { x: "2026-01", y: 1 }, { x: "2026-13", y: 9 }, { x: "ayer", y: 3 }, { x: "2026-03", y: "7" }] },
      { id: "v", label: "Repetida", points: [{ x: "2026-01", y: 1 }] },
      { id: 7, label: "Numérica", kind: "pie", format: "html", points: [{ x: "2026-01-15", y: 1 }] },
      { id: "vacía", label: "Sin puntos", points: [] },
      { label: "Sin id", points: [{ x: "2026-01", y: 1 }] },
      null,
    ]);
    expect(out.map((s) => s.id)).toEqual(["v", "7"]);
    expect(out[0].points).toEqual([{ x: "2026-01", y: 1 }, { x: "2026-02", y: 2 }, { x: "2026-03", y: null }]);
    expect(out[0]).toMatchObject({ kind: "bar", format: "money", currency: "COP" });
    expect("onclick" in out[0]).toBe(false);
    expect(out[1]).toMatchObject({ kind: undefined, format: undefined });
    expect(cleanSeries("nada")).toEqual([]);
  });

  it("un x repetido se queda con el último valor", () => {
    expect(cleanPoints([{ x: "2026-01", y: 1 }, { x: "2026-01", y: 5 }])).toEqual([{ x: "2026-01", y: 5 }]);
  });

  it("anomalías con serie y periodo válidos", () => {
    expect(cleanAnomalies([{ series: "mp", x: "2026-08", label: "Acero" }, { series: "mp", x: "agosto" }, { x: "2026-08" }, 3])).toEqual([{ series: "mp", x: "2026-08", label: "Acero" }]);
  });

  it("el eje x junta los periodos de todas las series", () => {
    const a = { id: "a", label: "A", points: months([1, 2]) };
    const b = { id: "b", label: "B", points: [{ x: "2025-12", y: 1 }, { x: "2026-02", y: 3 }] };
    expect(periodsOf([a, b])).toEqual(["2025-12", "2026-01", "2026-02"]);
  });
});

describe("niceTicks", () => {
  it("ticks redondos que cubren los datos", () => {
    expect(niceTicks(96, 486)).toEqual([0, 100, 200, 300, 400, 500]);
    expect(niceTicks(1.38e9, 1.93e9, 5, true)).toEqual([0, 5e8, 1e9, 1.5e9, 2e9]);
    expect(niceTicks(0.12, 0.31)).toEqual([0.1, 0.15, 0.2, 0.25, 0.3, 0.35]);
  });
  it("sin cero, las líneas usan el rango de los datos; con barras, desde cero (y los negativos)", () => {
    expect(niceTicks(380, 490)[0]).toBe(380);
    expect(niceTicks(380, 490, 5, true)[0]).toBe(0);
    expect(niceTicks(-40, 60, 5, true)).toEqual([-40, -20, 0, 20, 40, 60]);
  });
  it("un solo valor se abre alrededor", () => {
    const t = niceTicks(100, 100);
    expect(t[0]).toBeLessThan(100);
    expect(t[t.length - 1]).toBeGreaterThan(100);
    expect(niceTicks(0, 0, 5, true)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe("anomalías", () => {
  it("media móvil y cambio relativo", () => {
    expect(movingMean(MP.points, 3)).toBe((388 + 392 + 401) / 3);
    expect(movingMean(months([null, 10, null, 20]), 3)).toBe(10);
    expect(movingMean(MP.points, 0)).toBeNull();
    expect(change(100, 111)).toBeCloseTo(0.11);
    expect(change(0, 5)).toBeNull();
    expect(change(-100, -50)).toBeCloseTo(0.5);
  });

  it("detecta el pico contra la media móvil (y solo ese)", () => {
    const f = detectAnomalies(MP);
    expect(f.map((x) => x.x)).toEqual(["2026-08"]);
    expect(f[0].delta).toBeCloseTo(486 / ((405 + 409 + 412) / 3) - 1, 5);
  });

  it("una serie que crece parejo no tiene anomalías; con pocos puntos no se detecta nada", () => {
    expect(detectAnomalies({ id: "g", label: "G", points: months([100, 110, 121, 133, 146, 161, 177, 195]) })).toEqual([]);
    expect(detectAnomalies({ id: "g", label: "G", points: months([100, 100, 300]) })).toEqual([]);
  });

  it("una caída también es anomalía; el umbral la hace más o menos sensible", () => {
    const s = { id: "i", label: "Inventario", points: months([50, 51, 50, 52, 51, 50, 38, 51]) };
    expect(detectAnomalies(s).map((x) => [x.x, Math.sign(x.delta)])).toEqual([["2026-07", -1]]);
    expect(detectAnomalies(s, 50)).toEqual([]);
  });

  it("flagsOf: las dadas con su apartamiento, más las detectadas que no estaban", () => {
    const MO = { id: "mo", label: "Mano de obra", points: months([214, 215, 216, 216, 217, 221, 222, 248, 224]) };
    const given = [{ series: "mp", x: "2026-08", label: "Acero +18 %" }, { series: "mp", x: "2026-08" }, { series: "zz", x: "2026-08" }, { series: "mp", x: "2030-01" }];
    const off = flagsOf([MP, MO], given);
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ series: "mp", x: "2026-08", label: "Acero +18 %" });
    expect(off[0].delta).toBeGreaterThan(0.18);
    const on = flagsOf([MP, MO], given, 3);
    expect(on.map((f) => `${f.series}@${f.x}`)).toEqual(["mp@2026-08", "mo@2026-08"]);
  });
});

describe("textos", () => {
  it("periodos con Intl, cortos, largos y completos", () => {
    expect(periodLabel("2026-08", "es-CO")).toBe("ago");
    expect(periodLabel("2026-09", "es-CO")).toBe("sept");
    expect(periodLabel("2026-08", "es-CO", "long")).toBe("agosto");
    expect(periodLabel("2026-08", "es-CO", "full")).toBe("agosto 2026");
    expect(periodLabel("2026-08-15", "es-CO")).toBe("15 ago");
    expect(periodLabel("2026-08-15", "es-CO", "long")).toBe("15 de agosto");
    expect(periodLabel("2026-08", "en-US", "full")).toBe("August 2026");
    expect(periodLabel("raro")).toBe("raro");
  });

  it("porcentajes con signo y un decimal por debajo de 10 %", () => {
    expect(pctText(0.1794)).toBe("+18 %");
    expect(pctText(-0.052)).toBe("−5,2 %");
    expect(pctText(0.052, "en-US", false)).toBe("5.2 %");
  });

  it("el resumen: cómo cambió, dónde está el máximo y las anomalías", () => {
    const ventas = { id: "v", label: "Ventas", points: months([90, 95, 100, 98, 99, 101, 100, 111]) };
    expect(summarize([ventas], [], TREND_LABELS)).toBe("Ventas: sube 11 % de julio a agosto; máximo en agosto.");
    const text = summarize([MP], [{ series: "mp", x: "2026-08", delta: 0.19 }], TREND_LABELS);
    expect(text).toContain("Materia prima: baja 11 % de agosto a septiembre; máximo en agosto.");
    expect(text).toContain("Materia prima fuera de lo normal en agosto (+19 % vs. la media).");
    expect(summarize([{ id: "x", label: "X", points: months([5, 5]) }], [], TREND_LABELS)).toBe("X: se mantiene de enero a febrero; máximo en enero.");
    expect(summarize([], [], TREND_LABELS)).toBe("");
  });

  it("la pregunta por defecto dice si sube o baja", () => {
    expect(whyQuestion(MP, 7, TREND_LABELS)).toBe("¿Por qué sube Materia prima en agosto?");
    expect(whyQuestion(MP, 8, TREND_LABELS)).toBe("¿Por qué baja Materia prima en septiembre?");
    expect(whyQuestion(MP, 0, TREND_LABELS)).toBe("¿Qué explica Materia prima en enero?");
  });
});

describe("explainContext y teclado", () => {
  it("la serie, el punto, el anterior con valor y la ventana", () => {
    const s = { id: "mp", label: "MP", points: months([1, 2, 3, 4, null, 6, 7, 8, 9, 10]) };
    const ctx = explainContext(s, 5, "money", "COP", "es-CO", { series: "mp", x: "2026-06", delta: 0.2, label: "Pico" });
    expect(ctx.series).toEqual({ id: "mp", label: "MP", format: "money", currency: "COP" });
    expect(ctx.point).toEqual({ x: "2026-06", y: 6, label: "junio 2026" });
    expect(ctx.previous).toEqual({ x: "2026-04", y: 4 });
    expect(ctx.window.map((p) => p.x)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    expect(ctx.anomaly).toEqual({ label: "Pico", delta: 0.2 });
    expect(explainContext(s, 0, "number", undefined).previous).toBeNull();
  });

  it("flechas, Inicio y Fin sobre el eje x", () => {
    expect(trendStep("ArrowRight", 2, 5)).toBe(3);
    expect(trendStep("ArrowRight", 4, 5)).toBe(4);
    expect(trendStep("ArrowLeft", 0, 5)).toBe(0);
    expect(trendStep("Home", 3, 5)).toBe(0);
    expect(trendStep("End", 1, 5)).toBe(4);
    expect(trendStep("a", 1, 5)).toBeNull();
    expect(trendStep("ArrowRight", 0, 0)).toBeNull();
  });
});
