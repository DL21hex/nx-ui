import { describe, expect, it } from "vitest";
import { GUARD_LABELS, guardCheck, guardDate, isoParts, otherReadings, readAmount, robustRange } from "../src/components/guard/logic";
import type { GuardRule } from "../src/components/guard/types";

const TODAY = "2026-09-26"; // sábado
const PRICE: GuardRule = { history: [1180000, 1210000, 1195000, 1240000], format: "money", currency: "COP" };
const check = (v: unknown, rule: GuardRule = {}, opts: Parameters<typeof guardCheck>[2] = {}) => guardCheck(v, rule, { today: TODAY, ...opts });
const kinds = (v: unknown, rule: GuardRule = {}, opts: Parameters<typeof guardCheck>[2] = {}) => check(v, rule, opts).map((f) => f.kind);

describe("robustRange: mediana y MAD", () => {
  it("la historia de un precio", () => {
    const r = robustRange(PRICE.history)!;
    expect(r.n).toBe(4);
    expect(r.median).toBe(1202500);
    expect(r.mad).toBe(15000);
    // Piso de 2 % de la mediana: 24.050 > 1,4826 × 15.000.
    expect(r.spread).toBeCloseTo(24050);
    expect(r.lo).toBeCloseTo(1130350);
    expect(r.hi).toBeCloseTo(1274650);
  });

  it("un atípico en la historia no mueve el centro ni el ancho (la media sí)", () => {
    const xs = [10, 11, 12, 10, 11, 1000];
    const r = robustRange(xs)!;
    expect(r.median).toBe(11);
    expect(r.mad).toBe(1);
    expect(xs.reduce((a, b) => a + b) / xs.length).toBeGreaterThan(170);
    // Casi la mitad de atípicos, y el centro sigue en lo normal.
    expect(robustRange([100, 101, 99, 100, 102, 1e6, 1e6, -1e6])!.median).toBeCloseTo(100.5);
  });

  it("impares, pares, textos numéricos, basura y vacíos", () => {
    expect(robustRange([3, 1, 2])!.median).toBe(2);
    expect(robustRange([4, 1, 3, 2])!.median).toBe(2.5);
    expect(robustRange(["5", 7, "x", null, NaN, Infinity, 6] as unknown[])!).toMatchObject({ n: 3, median: 6 });
    expect(robustRange([])).toBeNull();
    expect(robustRange(null)).toBeNull();
    expect(robustRange(["a", NaN] as unknown[])).toBeNull();
  });

  it("sin negativos en la historia, lo habitual no baja de 0; con negativos, sí", () => {
    expect(robustRange([1, 1, 1, 50])!.lo).toBeGreaterThanOrEqual(0);
    expect(robustRange([-5, -4, -6, -5])!.lo).toBeLessThan(-5);
    // Todo igual: el piso de 2 % evita un ancho cero.
    expect(robustRange([10, 10, 10, 10])!.spread).toBeCloseTo(0.2);
  });

  it("100.000 valores en tiempo lineal (aleatorios, ordenados, todos iguales)", () => {
    const n = 100_000;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 1000;
    const cases = [Array.from({ length: n }, rnd), Array.from({ length: n }, (_, i) => i), Array.from({ length: n }, (_, i) => n - i), new Array(n).fill(42)];
    const t0 = performance.now();
    const rs = cases.map((c) => robustRange(c)!);
    expect(performance.now() - t0).toBeLessThan(400);
    expect(rs[1].median).toBe(49999.5);
    expect(rs[2].median).toBe(50000.5);
    expect(rs[3]).toMatchObject({ median: 42, mad: 0 });
    // Coincide con ordenar.
    const sorted = [...cases[0]].sort((a, b) => a - b);
    expect(rs[0].median).toBeCloseTo((sorted[n / 2 - 1] + sorted[n / 2]) / 2, 9);
  });
});

describe("guardCheck: un cero de más o de menos", () => {
  it("12.000.000 donde siempre va 1,2 M: sobra un cero, con la corrección", () => {
    const [f] = check(12_000_000, PRICE);
    expect(f).toEqual({ kind: "magnitude", message: "$ 12.000.000 es 10 veces lo habitual ($ 1.200.000). ¿Sobra un cero?", suggestion: 1_200_000, severity: "warn" });
  });

  it("hacia abajo y con varias potencias", () => {
    expect(check(120_000, PRICE)[0]).toMatchObject({ kind: "magnitude", suggestion: 1_200_000, message: "$ 120.000 es 10 veces menos que lo habitual ($ 1.200.000). ¿Falta un cero?" });
    expect(check(1_200, PRICE)[0]).toMatchObject({ kind: "magnitude", suggestion: 1_200_000, message: expect.stringContaining("1.000 veces menos") });
    expect(check(1_200, PRICE)[0].message).toMatch(/¿Faltan 3 ceros\?$/);
    expect(check(120_000_000, PRICE)[0]).toMatchObject({ suggestion: 1_200_000, message: expect.stringMatching(/100 veces lo habitual .*¿Sobran 2 ceros\?$/) });
  });

  it("tolerancia: la corrección solo tiene que caer en lo habitual, no ser idéntica", () => {
    expect(check(13_500_000, PRICE)[0]).toMatchObject({ kind: "magnitude", suggestion: 1_350_000 });
    // Ni 3 M ni 300 mil son habituales: está muy lejos, sin corrección.
    expect(check(30_000_000, PRICE)).toEqual([{ kind: "range", message: "Muy por encima de lo habitual ($1,1 M – $1,3 M)", severity: "warn" }]);
  });

  it("lo normal y lo un poco raro no avisan; lo muy lejano sí, sin corrección", () => {
    expect(check(1_300_000, PRICE)).toEqual([]);
    expect(check(1_195_000, PRICE)).toEqual([]);
    expect(kinds(2_000_000, PRICE)).toEqual(["range"]);
    expect(check(400_000, PRICE)[0].message).toBe("Muy por debajo de lo habitual ($1,1 M – $1,3 M)");
  });

  it("con un atípico en la historia, sigue detectándolo", () => {
    const rule = { ...PRICE, history: [1180000, 1210000, 12000000, 1195000, 1240000] };
    expect(check(1_220_000, rule)).toEqual([]);
    expect(check(12_000_000, rule)[0]).toMatchObject({ kind: "magnitude", suggestion: 1_200_000 });
  });

  it("con pocos datos (< 4) es conservador: solo la potencia de 10 casi exacta", () => {
    const rule: GuardRule = { history: [1_200_000, 1_250_000] };
    expect(check(12_500_000, rule)[0]).toMatchObject({ kind: "magnitude", suggestion: 1_250_000 });
    expect(check(2_000_000, rule)).toEqual([]);
    expect(check(5_000_000, rule)).toEqual([]);
    expect(check(20_000_000, rule)).toEqual([]);
  });

  it("`typical` del autor: fuera ya es raro; tres veces fuera busca la potencia", () => {
    const rule: GuardRule = { typical: [1, 50] };
    expect(check(1000, rule)[0]).toMatchObject({ kind: "magnitude", suggestion: 10, message: "1.000 es 100 veces lo habitual (1 – 50). ¿Sobran 2 ceros?" });
    expect(check(200, rule)[0]).toMatchObject({ kind: "magnitude", suggestion: 20 });
    expect(check(60, rule)).toEqual([{ kind: "range", message: "Muy por encima de lo habitual (1 – 50)", severity: "warn" }]);
    expect(check(0.5, rule)[0].kind).toBe("range");
    expect(check(25, rule)).toEqual([]);
    expect(check(0.1, { typical: [10, 50] })[0]).toMatchObject({ kind: "magnitude", suggestion: 10 });
  });

  it("`min`/`max` blandos", () => {
    expect(check(150, { min: 0, max: 100 })[0].message).toBe("Muy por encima de lo habitual (0 – 100)");
    expect(check(150, { max: 100 })[0].message).toBe("Muy por encima de lo habitual (≤ 100)");
    expect(check(5, { min: 10 })[0].message).toBe("Muy por debajo de lo habitual (≥ 10)");
    expect(check(50, { min: 10, max: 100 })).toEqual([]);
  });

  it("sin configuración, un número no se vigila", () => {
    expect(check(12_000_000)).toEqual([]);
    expect(check(-5)).toEqual([]);
  });
});

describe("guardCheck: separador decimal confundido", () => {
  const WEIGHT: GuardRule = { history: [1.5, 2, 1.8, 2.2, 1.6] };

  it("es-CO: «1.500» queriendo 1,5 (así lo lee <nx-number>: 1500)", () => {
    expect(check(1500, WEIGHT, { raw: "1.500" })).toEqual([{ kind: "decimal", message: "Se leyó 1.500. ¿Querías 1,5?", suggestion: 1.5, severity: "warn" }]);
    // El mismo texto en un <input> nativo: se lee igual que <nx-number>.
    expect(check("1.500", { ...WEIGHT, type: "number" })[0]).toMatchObject({ kind: "decimal", suggestion: 1.5 });
  });

  it("es-CO: «1,500» de un sistema en inglés queriendo mil quinientos", () => {
    const rule: GuardRule = { history: [1500, 1480, 1520, 1510] };
    expect(check("1,500", rule)).toEqual([{ kind: "decimal", message: "Se leyó 1,5. ¿Querías 1.500?", suggestion: 1500, severity: "warn" }]);
  });

  it("es-CO: «1,234.50» pegado se lee bien (el último signo es el decimal): nada que decir", () => {
    expect(readAmount("1,234.50", "es-CO")).toBe(1234.5);
    expect(check("1,234.50", { history: [1200.5, 1250, 1180.25, 1300] })).toEqual([]);
  });

  it("en-US: «1.500» es 1,5; si lo habitual es 1500, pregunta", () => {
    const rule: GuardRule = { history: [1500, 1480, 1520, 1510] };
    expect(check("1.500", rule, { locale: "en-US" })).toEqual([{ kind: "decimal", message: "Se leyó 1.5. ¿Querías 1,500?", suggestion: 1500, severity: "warn" }]);
    expect(check("1,500", rule, { locale: "en-US" })).toEqual([]);
  });

  it("sin separador en lo escrito, es una potencia de 10 y no un separador", () => {
    expect(check(1500, WEIGHT, { raw: "1500" })[0]).toMatchObject({ kind: "magnitude", suggestion: 1.5 });
    expect(check(1500, WEIGHT)[0].kind).toBe("magnitude");
  });

  it("«1.5» en es-CO es 1,5 (como <nx-number>): en un campo de 1,5 no avisa", () => {
    expect(readAmount("1.5", "es-CO")).toBe(1.5);
    expect(check("1.5", { ...WEIGHT, type: "number" })).toEqual([]);
    // En un campo de decenas, «1.5» queriendo 15 (el punto se coló), aunque 1,5 no esté «muy» lejos.
    expect(check("1.5", { history: [10, 12, 8, 12, 14, 10, 12], type: "number" })[0]).toMatchObject({ kind: "decimal", suggestion: 15, message: "Se leyó 1,5. ¿Querías 15?" });
    expect(check("1.5", { history: [14, 15, 16, 15, 17], type: "number" })[0]).toMatchObject({ kind: "decimal", suggestion: 15 });
  });
});

describe("guardCheck: contra lo esperado", () => {
  const OC: GuardRule = { expected: 1_530_000, format: "money", currency: "COP" };

  it("dos dígitos adyacentes invertidos (la diferencia es múltiplo de 9)", () => {
    expect((1_530_000 - 1_350_000) % 9).toBe(0);
    expect(check(1_350_000, OC)).toEqual([{ kind: "swap", message: "¿Invertiste dos dígitos? Esperado $ 1.530.000", suggestion: 1_530_000, severity: "warn" }]);
    expect(check(1_503_000, OC)[0].kind).toBe("swap");
  });

  it("un dígito distinto", () => {
    expect(check(1_580_000, OC)).toEqual([{ kind: "digit", message: "Difiere en un dígito de $ 1.530.000", suggestion: 1_530_000, severity: "warn" }]);
  });

  it("un cero de más respecto de lo esperado", () => {
    expect(check(15_300_000, OC)[0]).toMatchObject({ kind: "magnitude", suggestion: 1_530_000, message: "$ 15.300.000 es 10 veces lo esperado ($ 1.530.000). ¿Sobra un cero?" });
    expect(check(153_000, OC)[0].message).toMatch(/10 veces menos que lo esperado.*¿Falta un cero\?/);
  });

  it("igual, muy distinto, dos dígitos no vecinos o de otro signo: nada", () => {
    expect(check(1_530_000, OC)).toEqual([]);
    expect(check(1_600_000, OC)).toEqual([]);
    expect(check(1_035_000, OC)).toEqual([]);
    expect(check(2_530_001, OC)).toEqual([]);
  });

  it("con centavos", () => {
    expect(check(1243.56, { expected: 1234.56 })[0]).toMatchObject({ kind: "swap", suggestion: 1234.56 });
    expect(check(1234.57, { expected: 1234.56 })[0].kind).toBe("digit");
  });

  it("lo esperado gana sobre la historia (es más específico)", () => {
    expect(check(1_350_000, { ...PRICE, expected: 1_530_000 })[0].kind).toBe("swap");
  });
});

describe("guardCheck: fechas", () => {
  it("año con dígitos invertidos o de otro siglo, sin configuración", () => {
    expect(check("2062-09-12")).toEqual([{ kind: "year", message: "¿Año 2062? ¿Querías 2026?", suggestion: "2026-09-12", severity: "warn" }]);
    expect(check("2206-09-12")[0]).toMatchObject({ kind: "year", suggestion: "2026-09-12" });
    expect(check("0226-09-12")[0]).toMatchObject({ kind: "year", suggestion: "2026-09-12", message: "¿Año 0226? ¿Querías 2026?" });
    expect(check("0026-01-15")[0]).toMatchObject({ suggestion: "2026-01-15" });
    expect(check("3026-01-15")[0]).toMatchObject({ suggestion: "2026-01-15" });
  });

  it("fechas posibles no avisan sin rango (un nacimiento, un vencimiento lejano)", () => {
    expect(check("2025-12-31")).toEqual([]);
    expect(check("1962-05-01")).toEqual([]);
    expect(check("2045-01-01")).toEqual([]);
    // Año absurdo sin un vecino cercano a hoy: no hay nada seguro que decir.
    expect(check("5555-05-05")).toEqual([]);
  });

  it("rango relativo a hoy: fuera, con año corregible o sin él", () => {
    const rule: GuardRule = { type: "date", typical: ["-30d", "+90d"] };
    expect(check("2026-10-01", rule)).toEqual([]);
    expect(check("2016-09-20", rule)[0]).toMatchObject({ kind: "year", suggestion: "2026-09-20" });
    expect(check("2026-12-31", rule)).toEqual([{ kind: "date", message: "Fuera de lo habitual para esta fecha (27 ago 2026 – 25 dic 2026)", severity: "warn" }]);
    expect(check("2026-06-01", { type: "date", min: "-30d" })[0].message).toBe("Fuera de lo habitual para esta fecha (≥ 27 ago 2026)");
  });

  it("guardDate: relativas y absolutas", () => {
    expect(guardDate("-30d", TODAY)).toBe("2026-08-27");
    expect(guardDate("+90d", TODAY)).toBe("2026-12-25");
    expect(guardDate("+2w", TODAY)).toBe("2026-10-10");
    expect(guardDate("+6m", TODAY)).toBe("2027-03-26");
    expect(guardDate("-1y", TODAY)).toBe("2025-09-26");
    expect(guardDate("today", TODAY)).toBe(TODAY);
    expect(guardDate("0d", TODAY)).toBe(TODAY);
    expect(guardDate("2026-01-31", TODAY)).toBe("2026-01-31");
    expect(guardDate("mañana", TODAY)).toBeNull();
    expect(guardDate(5, TODAY)).toBeNull();
    expect(guardDate("2026-02-30", TODAY)).toBeNull();
  });

  it("isoParts: válidas, con hora, inválidas y años de dos cifras", () => {
    expect(isoParts("2026-02-28")).toEqual([2026, 2, 28]);
    expect(isoParts("2026-09-12T10:00")).toEqual([2026, 9, 12]);
    expect(isoParts("2026-02-29")).toBeNull();
    expect(isoParts("0026-03-01")).toEqual([26, 3, 1]);
    expect(isoParts("12/09/2026")).toBeNull();
  });

  it("días hábiles: fin de semana y festivos (informativo)", () => {
    const rule: GuardRule = { type: "date", workdays: true, holidays: ["2026-10-12"] };
    expect(check("2026-09-26", rule)).toEqual([{ kind: "workday", message: "Cae en sábado", severity: "info" }]);
    expect(check("2026-09-27", rule)[0].message).toBe("Cae en domingo");
    expect(check("2026-10-12", rule)).toEqual([{ kind: "workday", message: "Es festivo", severity: "info" }]);
    expect(check("2026-09-28", rule)).toEqual([]);
    expect(check("2026-09-26", rule, { locale: "en-US" })[0].message).toBe("Cae en Saturday");
  });

  it("una fecha inválida o vacía no dice nada", () => {
    expect(check("2026-13-01", { type: "date" })).toEqual([]);
    expect(check("", { type: "date" })).toEqual([]);
  });
});

describe("guardCheck: repetido, enteros y negativos", () => {
  it("igual al último registrado (texto, sin mayúsculas ni espacios de más)", () => {
    const rule: GuardRule = { repeat: true, history: ["FC-8810", "FC-8811"] };
    expect(check("fc-8811 ", rule)).toEqual([{ kind: "repeat", message: "Igual al último registrado", severity: "warn" }]);
    expect(check("FC-8812", rule)).toEqual([]);
    expect(check("FC-8811", { history: ["FC-8811"] })).toEqual([]);
  });

  it("repetido en números y fechas", () => {
    expect(kinds(250, { repeat: true, history: [100, 250] })).toEqual(["repeat"]);
    expect(kinds("2026-09-20", { repeat: true, type: "date", history: ["2026-09-18", "2026-09-20"] })).toEqual(["repeat"]);
  });

  it("decimales donde siempre van enteros (dicho o deducido de la historia)", () => {
    const rule: GuardRule = { history: [24, 30, 26, 28, 32, 30] };
    expect(check(27.5, rule)).toEqual([{ kind: "integer", message: "Aquí siempre va un número entero", suggestion: 28, severity: "warn" }]);
    expect(check(2.5, { integer: true })[0]).toMatchObject({ kind: "integer", suggestion: 3 });
    // Un monto con centavos no es una cantidad.
    expect(check(1_200_000.5, PRICE)).toEqual([]);
    // Lejos y con decimales: los dos.
    expect(kinds(1.5, rule)).toEqual(["range", "integer"]);
  });

  it("negativo donde nunca hay negativos, con la corrección", () => {
    expect(check(-1_200_000, PRICE)[0]).toEqual({ kind: "negative", message: "Aquí nunca hay negativos", suggestion: 1_200_000, severity: "warn" });
    expect(kinds(-5, { typical: [0, 50] })).toEqual(["negative"]);
    expect(kinds(-5, { negative: false })).toEqual(["negative"]);
    expect(kinds(-5, { history: [10, -3, 8, 12] })).not.toContain("negative");
    expect(kinds(-5, { history: [10, 8, 12, 9], negative: true })).not.toContain("negative");
  });
});

describe("guardCheck: entradas raras y textos", () => {
  it("vacíos, NaN, basura", () => {
    for (const v of [null, undefined, "", NaN, Infinity, "abc"]) expect(check(v, { ...PRICE, type: "number" })).toEqual([]);
    expect(check({}, PRICE)).toEqual([]);
  });

  it("una configuración incompleta o mal formada no lanza", () => {
    expect(() => check(5, { history: "x" as unknown as number[], typical: [1] as unknown as [number, number], expected: "abc" })).not.toThrow();
    expect(check(5, { typical: ["a", "b"] as unknown as [number, number] })).toEqual([]);
  });

  it("readAmount y otherReadings", () => {
    expect(readAmount("$ 1.450.000,00", "es-CO")).toBe(1450000);
    expect(readAmount("-1.200", "es-CO")).toBe(-1200);
    expect(readAmount("1.200-", "es-CO")).toBe(-1200);
    expect(readAmount("1,234.5", "en-US")).toBe(1234.5);
    expect(readAmount("12.000.000", "en-US")).toBe(12000000);
    expect(readAmount("abc", "es-CO")).toBeNull();
    expect(otherReadings("1.5")).toEqual([15, 1.5]);
    expect(otherReadings("1,234.50")).toEqual([123450, 1234.5]);
    expect(otherReadings("-1.500")).toEqual([-1500, -1.5]);
    expect(otherReadings("1500")).toEqual([]);
  });

  it("labels propios con sus plantillas", () => {
    const labels = { ...GUARD_LABELS, times: "{value} = {n} × ({typical})", extraZero: "¿Un 0 de más?" };
    expect(check(12_000_000, PRICE, { labels })[0].message).toBe("$ 12.000.000 = 10 × ($ 1.200.000) ¿Un 0 de más?");
  });

  it("en-US: montos y rangos en el formato del locale", () => {
    expect(check(12_000_000, PRICE, { locale: "en-US" })[0].message).toBe("$12,000,000 es 10 veces lo habitual ($1,200,000). ¿Sobra un cero?");
    expect(check(30_000_000, PRICE, { locale: "en-US" })[0].message).toBe("Muy por encima de lo habitual ($1.1M – $1.3M)");
  });

  it("percent y number en los mensajes", () => {
    expect(check(1.9, { history: [0.19, 0.19, 0.19, 0.19], format: "percent" })[0].message).toBe("190 % es 10 veces lo habitual (19 %). ¿Sobra un cero?");
  });
});
