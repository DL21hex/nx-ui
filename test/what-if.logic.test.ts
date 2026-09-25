import { describe, expect, it } from "vitest";
import { nxFormat } from "../src/core/locale";
import {
  bestOf,
  chartPaths,
  clampValue,
  cleanEvent,
  cleanInputs,
  cleanLabels,
  cleanMetrics,
  cleanScenarios,
  cleanSeries,
  cleanValues,
  decimalsOf,
  deltaText,
  editText,
  fill,
  mergeMetric,
  parseEvent,
  parseTyped,
  sameValues,
  snapValue,
  stepValue,
  toneOf,
  valueText,
} from "../src/components/what-if/logic";
import { WHAT_IF_LABELS } from "../src/components/what-if/what-if";

const f = nxFormat("es-CO");
const nb = (s: string) => s.replace(/[  ]/g, " ");
const [ACERO, VOL, PCT] = cleanInputs([
  { id: "acero", label: "Precio del acero", value: 780, min: 546, max: 1014, step: 5, format: "money", currency: "US$" },
  { id: "volumen", label: "Volumen", value: 144000, min: 115200, max: 172800, step: 1440, unit: "u." },
  { id: "tasa", label: "Tasa", value: 0.1, min: 0, max: 0.3, step: 0.005, format: "percent" },
]);

describe("cleanInputs", () => {
  it("valida, completa y descarta lo que no es suyo", () => {
    const ins = cleanInputs([
      { id: "a", label: "A", value: "50", min: 0, max: "100", onclick: "x" },
      { id: "b", label: "B", value: 500, min: 0, max: 100, step: 5, format: "raro" },
      { id: "c", label: "C", min: 10, max: 10 },
      { id: "a", label: "Repetido", min: 0, max: 1 },
      { label: "Sin id", min: 0, max: 1 },
      { id: 7, label: "Numérico", min: -1, max: 1, hint: "  ", unit: "h" },
      null,
    ]);
    expect(ins.map((i) => i.id)).toEqual(["a", "b", "7"]);
    expect(ins[0]).toEqual({ id: "a", label: "A", value: 50, min: 0, max: 100, step: 1, format: "number", currency: undefined, unit: undefined, hint: undefined });
    // La base se recorta al rango; un formato desconocido es número.
    expect(ins[1].value).toBe(100);
    expect(ins[1].format).toBe("number");
    // Sin valor, el mínimo; sin paso, la centésima del rango.
    expect(ins[2].value).toBe(-1);
    expect(ins[2].step).toBe(0.02);
    expect(ins[2].unit).toBe("h");
    expect(ins[2].hint).toBeUndefined();
    expect(cleanInputs("nada")).toEqual([]);
  });
});

describe("métricas, series, escenarios y valores", () => {
  it("cleanMetrics pide id y label; better solo up/down", () => {
    const ms = cleanMetrics([
      { id: "m", label: "Margen", format: "percent", better: "up", value: 0.22 },
      { id: "u", label: "Utilidad", better: "arriba", base: "10" },
      { id: "x" },
      { id: "m", label: "Repetida" },
    ]);
    expect(ms.map((m) => m.id)).toEqual(["m", "u"]);
    expect(ms[0].value).toBe(0.22);
    expect(ms[1].better).toBeUndefined();
    expect(ms[1].base).toBe(10);
    expect(ms[1].format).toBe("number");
  });

  it("mergeMetric conserva lo que no vino", () => {
    const old = cleanMetrics([{ id: "m", label: "Margen", format: "percent", better: "up", base: 0.2, value: 0.2 }])[0];
    const got = mergeMetric(old, { id: "m", label: "", value: 0.18 });
    expect(got).toMatchObject({ id: "m", label: "Margen", format: "percent", better: "up", base: 0.2, value: 0.18 });
    expect(mergeMetric(undefined, { id: "n", label: "", value: 3 })).toMatchObject({ id: "n", label: "n", format: "number", value: 3 });
  });

  it("cleanSeries: al menos dos puntos con valor", () => {
    expect(cleanSeries({ id: "caja", label: "Caja", points: [{ x: "ene", value: 1 }] })).toBeNull();
    const s = cleanSeries({ id: "caja", label: "Caja", format: "money", currency: "COP", points: [{ x: "ene", value: 1, base: 2 }, { value: "3" }, { x: "mar" }] })!;
    expect(s.points).toEqual([{ x: "ene", value: 1, base: 2 }, { x: "2", value: 3, base: undefined }]);
    expect(s.format).toBe("money");
  });

  it("cleanScenarios y cleanValues", () => {
    const sc = cleanScenarios([{ id: 1, name: "Uno", inputs: { a: 1, b: "2", c: "x", d: null }, outputs: { m: 0.2 } }, { id: 1, name: "Repetido" }, { id: 2 }]);
    expect(sc).toEqual([{ id: "1", name: "Uno", inputs: { a: 1, b: 2 }, outputs: { m: 0.2 } }]);
    expect(cleanValues([1, 2])).toEqual({});
  });

  it("cleanLabels y fill", () => {
    const L = cleanLabels({ save: "Save as…", reset: 3, nuevo: "x" }, WHAT_IF_LABELS);
    expect(L.save).toBe("Save as…");
    expect(L.reset).toBe(WHAT_IF_LABELS.reset);
    expect(fill("Escenario {n} de {m}", { n: 3 })).toBe("Escenario 3 de {m}");
  });
});

describe("eventos del stream", () => {
  it("metric, series, note, error, done; lo demás se ignora", () => {
    expect(parseEvent('{"type":"metric","id":"m","value":0.2,"base":0.22}')).toMatchObject({ type: "metric", id: "m", value: 0.2, base: 0.22 });
    expect(parseEvent('{"type":"series","id":"c","points":[{"x":"ene","value":1},{"x":"feb","value":2}]}')).toMatchObject({ type: "series", id: "c" });
    expect(parseEvent('{"type":"note","message":"Ojo","tone":"rojo"}')).toEqual({ type: "note", message: "Ojo", tone: "neutral" });
    expect(parseEvent('{"type":"note","message":"Ojo","tone":"warning"}')).toEqual({ type: "note", message: "Ojo", tone: "warning" });
    expect(parseEvent('{"type":"error","message":"Falló"}')).toEqual({ type: "error", message: "Falló" });
    expect(parseEvent('{"type":"done"}')).toEqual({ type: "done" });
    expect(parseEvent("[DONE]")).toEqual({ type: "done" });
    expect(parseEvent('{"type":"note"}')).toBeNull();
    expect(parseEvent('{"type":"metric"}')).toBeNull();
    expect(parseEvent('{"type":"html","html":"<b>"}')).toBeNull();
    expect(parseEvent("no es json")).toBeNull();
    expect(parseEvent(null)).toBeNull();
    expect(cleanEvent([1])).toBeNull();
  });
});

describe("mover valores", () => {
  it("decimalsOf y clampValue", () => {
    expect(decimalsOf(5)).toBe(0);
    expect(decimalsOf(0.005)).toBe(3);
    expect(decimalsOf(1e-7)).toBe(7);
    expect(clampValue(2000, ACERO)).toBe(1014);
    expect(clampValue(0.1 + 0.2, PCT)).toBe(0.3);
  });

  it("stepValue: flechas, Mayús, páginas, Inicio/Fin", () => {
    expect(stepValue(780, ACERO, "ArrowRight")).toBe(785);
    expect(stepValue(780, ACERO, "ArrowDown")).toBe(775);
    expect(stepValue(780, ACERO, "ArrowUp", true)).toBe(830);
    expect(stepValue(780, ACERO, "PageDown")).toBe(730);
    expect(stepValue(1010, ACERO, "PageUp")).toBe(1014);
    expect(stepValue(780, ACERO, "Home")).toBe(546);
    expect(stepValue(780, ACERO, "End")).toBe(1014);
    expect(stepValue(780, ACERO, "a")).toBeNull();
    // La grilla parte de la base (780), no del mínimo (546); fuera de ella, al punto siguiente.
    expect(stepValue(551, ACERO, "ArrowLeft")).toBe(550);
    expect(stepValue(782, ACERO, "ArrowRight")).toBe(785);
    expect(stepValue(782, ACERO, "ArrowLeft")).toBe(780);
    expect(stepValue(550, ACERO, "ArrowLeft")).toBe(546);
    expect(stepValue(0.1, PCT, "ArrowUp")).toBe(0.105);
  });

  it("snapValue: arrastrando se vuelve exacto a la base y se llega a los extremos", () => {
    expect(snapValue(781.2, ACERO)).toBe(780);
    expect(snapValue(783, ACERO)).toBe(785);
    expect(snapValue(546, ACERO)).toBe(546);
    expect(snapValue(1014, ACERO)).toBe(1014);
    expect(snapValue(0.1024, PCT)).toBe(0.1);
  });
});

describe("leer y escribir", () => {
  it("valueText: montos, porcentajes, unidades y compacto", () => {
    expect(nb(valueText(780, ACERO, f))).toBe("US$ 780");
    expect(nb(valueText(144000, VOL, f))).toBe("144.000 u.");
    expect(nb(valueText(0.221, PCT, f))).toMatch(/^22,1\s?%$/);
    expect(nb(valueText(20_144_210_499, { format: "money", currency: "COP" }, f, true))).toMatch(/^\$\s?20,1/);
    // Compacto con tres cifras significativas.
    expect(nb(valueText(7_658_100_000, { format: "money", currency: "COP" }, f, true))).toMatch(/7660/);
    expect(valueText(undefined, VOL, f)).toBe("—");
    expect(nb(valueText(1234.567, {}, f))).toBe("1.235");
    expect(nb(valueText(12.345, {}, f))).toBe("12,35");
  });

  it("editText y parseTyped (formato del locale, sufijos, porcentaje en puntos)", () => {
    expect(editText(4_536_000, {}, f)).toBe("4.536.000");
    expect(editText(0.085, { format: "percent" }, f)).toBe("8,5");
    expect(parseTyped("4.536.000", {}, f)).toBe(4_536_000);
    expect(parseTyped("$ 4.600", { format: "money" }, f)).toBe(4600);
    expect(parseTyped("4,5 M", {}, f)).toBe(4_500_000);
    expect(parseTyped("150 mil", {}, f)).toBe(150_000);
    expect(parseTyped("2 millones", {}, f)).toBe(2_000_000);
    expect(parseTyped("120k", {}, f)).toBe(120_000);
    expect(parseTyped("8,5", { format: "percent" }, f)).toBe(0.085);
    expect(parseTyped("abc", {}, f)).toBeNull();
    expect(parseTyped("1,234.5", {}, nxFormat("en-US"))).toBe(1234.5);
  });

  it("toneOf según better", () => {
    expect(toneOf(12, 10, "up")).toBe("good");
    expect(toneOf(8, 10, "up")).toBe("bad");
    expect(toneOf(8, 10, "down")).toBe("good");
    expect(toneOf(8, 10)).toBe("neutral");
    expect(toneOf(10, 10, "up")).toBe("flat");
    expect(toneOf(undefined, 10, "up")).toBe("flat");
  });

  it("deltaText: relativo, puntos, absoluto y base en cero", () => {
    expect(nb(deltaText(842.4, 780, ACERO, f, "p. p."))).toMatch(/^\+8\s?%$/);
    expect(nb(deltaText(129_600, 144_000, VOL, f, "p. p."))).toMatch(/^-10\s?%$/);
    expect(deltaText(0.193, 0.221, PCT, f, "p. p.")).toBe("-2,8 p. p.");
    expect(deltaText(0.25, 0.221, PCT, f, "p. p.")).toBe("+2,9 p. p.");
    expect(nb(deltaText(110, 100, { unit: "u." }, f, "p. p.", true))).toMatch(/^\+10 u\. · \+10\s?%$/);
    expect(nb(deltaText(5, 0, {}, f, "p. p."))).toBe("+5");
  });
});

describe("comparar", () => {
  it("bestOf según better, con empates y sin comparación posible", () => {
    expect(bestOf([1, 3, 2], "up")).toEqual([1]);
    expect(bestOf([1, 3, 2], "down")).toEqual([0]);
    expect(bestOf([3, 1, 3], "up")).toEqual([0, 2]);
    expect(bestOf([2, 2], "up")).toEqual([]);
    expect(bestOf([2, undefined], "up")).toEqual([]);
    expect(bestOf([1, 2])).toEqual([]);
  });

  it("sameValues", () => {
    expect(sameValues({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 }, ["a", "b"])).toBe(true);
    expect(sameValues({ a: 1 }, { a: 2 }, ["a"])).toBe(false);
  });
});

describe("chartPaths", () => {
  it("líneas, área entre base y escenario, y el cero si el rango lo cruza", () => {
    const p = chartPaths(
      [
        { x: "ene", base: 10, value: 10 },
        { x: "feb", base: 20, value: -10 },
        { x: "mar", base: 30, value: 0 },
      ],
      300,
      100,
      0,
    );
    expect(p.lo).toBe(-10);
    expect(p.hi).toBe(30);
    expect(p.value).toBe("M0 50L150 100L300 75");
    expect(p.base).toBe("M0 50L150 25L300 0");
    expect(p.gap).toBe("M0 50L150 100L300 75L300 0L150 25L0 50Z");
    expect(p.zero).toBe(75);
  });

  it("sin base: sin línea punteada ni área; un rango plano no divide entre cero", () => {
    const p = chartPaths([{ x: "a", value: 5 }, { x: "b", value: 5 }], 100, 10, 0);
    expect(p.base).toBe("");
    expect(p.gap).toBe("");
    expect(p.value).toBe("M0 5L100 5");
    expect(p.zero).toBeUndefined();
  });
});
