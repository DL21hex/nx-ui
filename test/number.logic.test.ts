import { describe, expect, it } from "vitest";
import { affixes, clampValue, cleanAlign, cleanCurrency, cleanDecimals, cleanFormat, cleanLabels, cleanNumber, errorText, evaluate, formatEdit, formatText, numberToWords, roundTo, roundValue, stepValue, tidy, wordsCurrency } from "../src/components/number/logic";
import { NUMBER_LABELS } from "../src/components/number/number";
import type { NumberReading } from "../src/components/number/types";

const val = (text: string, o: Parameters<typeof evaluate>[1] = {}) => {
  const r = evaluate(text, o);
  return r.ok ? r.value : `error:${r.error}${r.token ? `:${r.token}` : ""}`;
};
const nb = (s: string) => s.replace(/[  ]/g, " ");

describe("evaluate: números en el formato del locale", () => {
  it.each([
    ["1.234,5", 1234.5],
    ["1234,5", 1234.5],
    ["1.450.000", 1450000],
    ["1.450.000,75", 1450000.75],
    ["0,5", 0.5],
    [",5", 0.5],
    ["12", 12],
    ["-1.200", -1200],
    ["+1.200", 1200],
    ["1.5", 1.5], // un solo punto con uno o dos decimales: decimal
    ["1.250", 1250], // grupos de tres: miles
    ["  7  ", 7],
    ["0", 0],
    ["-0", 0],
  ])("es-CO: «%s» → %s", (text, n) => expect(val(text)).toBe(n));

  it.each([
    ["1,234.5", 1234.5],
    ["1,450,000", 1450000],
    ["0.5", 0.5],
    ["-2,000.25", -2000.25],
    ["1.450.000", 1450000], // un monto en español pegado en inglés: el punto repetido es de miles
  ])("en-US: «%s» → %s", (text, n) => expect(val(text, { locale: "en-US" })).toBe(n));

  it("vacío es null (sin error)", () => {
    expect(evaluate("")).toEqual({ ok: true, value: null, calc: false });
    expect(evaluate("   ")).toEqual({ ok: true, value: null, calc: false });
  });

  it("un número simple no es una cuenta (no pide vista previa)", () => {
    expect(evaluate("1.450.000")).toEqual({ ok: true, value: 1450000, calc: false });
  });

  it("un locale inválido cae en es-CO", () => {
    expect(val("1.234,5", { locale: "xx-nope-123" })).toBe(1234.5);
  });
});

describe("evaluate: lo que se pega desde Excel, un PDF o un extracto", () => {
  it.each([
    ["$ 1.450.000,00", 1450000],
    ["$1.450.000", 1450000],
    ["COP 1.450.000", 1450000],
    ["USD 1,200.50", 1200.5],
    ["US$ 1.200,50", 1200.5],
    ["1.200,50 €", 1200.5],
    ["1 450 000", 1450000], // NBSP de miles
    ["1 450 000,5", 1450000.5], // espacio fino
    ["1 450 000", 1450000],
    ["1'450'000", 1450000],
    ["(1.200)", -1200], // contable
    ["$ (1.200,00)", -1200],
    ["($1,200.00)", -1200],
    ["1.200-", -1200], // SAP
    ["−1.200", -1200], // signo menos tipográfico
    ["\t1.450.000\n", 1450000],
    ["1,450,000.00", 1450000], // formato inglés en un campo en español: el último signo es el decimal
  ])("«%s» → %s", (text, n) => expect(val(text)).toBe(n));

  it("el negativo contable se marca como cálculo (la vista previa muestra el signo)", () => {
    expect(evaluate("(1.200)")).toMatchObject({ ok: true, calc: true });
  });
});

describe("evaluate: sufijos", () => {
  it.each([
    ["2,5k", 2500],
    ["2,5K", 2500],
    ["3 mil", 3000],
    ["3mil", 3000],
    ["1,5M", 1500000],
    ["1,5 m", 1500000],
    ["2 millones", 2000000],
    ["1 millón", 1000000],
    ["1 millon", 1000000],
    ["2 mil millones", 2e9],
    ["4 mm", 4e9], // miles de millones en Colombia
    ["4MM", 4e9],
    ["1 billón", 1e12],
    ["3 millardos", 3e9],
    ["2bn", 2e9],
    ["15%", 0.15],
    ["$ 2,5M", 2500000],
  ])("es-CO: «%s» → %s", (text, n) => expect(val(text)).toBe(n));

  it.each([
    ["1.5k", 1500],
    ["4 mm", 4e6], // en inglés, MM es un millón
    ["2.5M", 2.5e6],
    ["3b", 3e9],
    ["2 million", 2e6],
  ])("en-US: «%s» → %s", (text, n) => expect(val(text, { locale: "en-US" })).toBe(n));

  it("«b» solo no es nada en español (billón es 10^12, se escribe entero)", () => {
    expect(val("3b")).toBe("error:unknown:b");
  });
});

describe("evaluate: cuentas con «=»", () => {
  it.each([
    ["=450*3", 1350],
    ["=1.200.000/12", 100000],
    ["= 2 + 3 * 4", 14],
    ["=(2+3)*4", 20],
    ["=((1+1)*(2+2))", 8],
    ["=-5+2", -3],
    ["=--5", 5],
    ["=10-2-3", 5], // izquierda a derecha
    ["=100/4/5", 5],
    ["=2x3", 6],
    ["=2×3", 6],
    ["=9÷3", 3],
    ["=100+15%", 115], // como una calculadora
    ["=100-15%", 85],
    ["=200*15%", 30],
    ["=15%", 0.15],
    ["=1,5k*2", 3000],
    ["=(1+2)k", 3000],
    ["=0,1+0,2", 0.3], // sin basura de coma flotante
    ["=$ 1.200 * 2", 2400],
  ])("«%s» → %s", (text, n) => expect(val(text)).toBe(n));

  it("siempre es un cálculo", () => {
    expect(evaluate("=5")).toEqual({ ok: true, value: 5, calc: true });
  });

  it.each([
    ["=", "incomplete"],
    ["=450*", "incomplete"],
    ["=*3", "incomplete"],
    ["=(1+2", "paren"],
    ["=1+2)", "paren"],
    ["=()", "incomplete"],
    ["=(1+)", "incomplete"],
    ["=)", "paren"],
    ["=10/0", "divZero"],
    ["=10/(5-5)", "divZero"],
    ["=2 k k", undefined], // dos sufijos se multiplican: 2 millones
  ])("«%s» → error %s", (text, code) => {
    const r = evaluate(text);
    if (code === undefined) expect(r).toMatchObject({ ok: true, value: 2e6 });
    else expect(r).toMatchObject({ ok: false, error: code });
  });

  it("dice qué no entendió", () => {
    expect(evaluate("=450*abc")).toEqual({ ok: false, error: "unknown", token: "abc" });
    expect(evaluate("=2^3")).toEqual({ ok: false, error: "unknown", token: "^" });
    expect(evaluate("=k")).toEqual({ ok: false, error: "unknown", token: "k" });
    expect(evaluate("=1 2")).toEqual({ ok: false, error: "unknown", token: "2" });
  });

  it("es seguro: nada de JavaScript", () => {
    expect(val("=alert(1)")).toBe("error:unknown:alert");
    expect(val("=constructor")).toBe("error:unknown:constructor");
    expect(val("=1;2")).toBe("error:unknown:;");
    expect(val("=`1`")).toBe("error:unknown:`");
    expect(val("=[1]")).toBe("error:unknown:[");
    expect(val("=this")).toBe("error:unknown:this");
    expect(val("x")).toBe("error:unknown:x"); // «x» sin números alrededor no multiplica
  });

  it("demasiado grande", () => {
    expect(val("=999999999*999999999")).toBe("error:tooBig");
    expect(val("2 billones")).toBe(2e12);
    expect(val("1000 billones")).toBe("error:tooBig");
  });
});

describe("evaluate: relativas al valor anterior", () => {
  const base = 1_000_000;
  it.each([
    ["+15%", 1150000],
    ["-10%", 900000],
    ["*2", 2000000],
    ["x2", 2000000],
    ["/4", 250000],
    ["÷4", 250000],
    ["+50.000", 1050000],
    ["*(1+19%)", 1190000],
    ["+ 2,5k", 1002500],
  ])("sobre 1.000.000: «%s» → %s", (text, n) => expect(val(text, { base })).toBe(n));

  it("un «-» sin «%» es un negativo, no una resta", () => {
    expect(val("-50.000", { base })).toBe(-50000);
  });

  it("sin valor anterior: «+15%» y «*2» no tienen sobre qué calcular", () => {
    expect(val("+15%")).toBe("error:noBase");
    expect(val("*2", { base: null })).toBe("error:noBase");
    expect(val("-10%")).toBe("error:noBase");
    expect(val("+1.200")).toBe(1200); // un «+» con un número es solo el signo
  });

  it("sin «=», una cuenta pide el «=»", () => {
    expect(val("450*3")).toBe("error:needEquals");
    expect(val("100+15")).toBe("error:needEquals");
    expect(val("(1+2)")).toBe("error:needEquals");
  });
});

describe("evaluate: modo porcentaje", () => {
  const pct = { format: "percent" as const };
  it.each([
    ["19", 0.19],
    ["19%", 0.19],
    ["19 %", 0.19],
    ["12,5", 0.125],
    ["0", 0],
    ["=38/2", 0.19],
    ["-5", -0.05],
    ["+5", 0.05], // sin relativas: «+5» es 5 %
  ])("«%s» → %s", (text, n) => expect(val(text, pct)).toBe(n));

  it("el «%» no es un cálculo en modo porcentaje", () => {
    expect(evaluate("19%", pct)).toEqual({ ok: true, value: 0.19, calc: false });
  });
});

describe("errorText", () => {
  it("pone la ficha en el mensaje", () => {
    const r = evaluate("=2+hola") as Extract<NumberReading, { ok: false }>;
    expect(errorText(r, NUMBER_LABELS)).toBe('no entiendo "hola"');
    expect(errorText({ ok: false, error: "needEquals" }, NUMBER_LABELS)).toBe("para calcular, empieza con =");
  });
});

describe("límites, pasos y redondeo", () => {
  it("clampValue", () => {
    expect(clampValue(5, 0, 10)).toEqual({ value: 5, clamped: null });
    expect(clampValue(-1, 0, 10)).toEqual({ value: 0, clamped: "min" });
    expect(clampValue(11, 0, 10)).toEqual({ value: 10, clamped: "max" });
    expect(clampValue(11, null, null)).toEqual({ value: 11, clamped: null });
  });

  it("stepValue: Mayús ×10, Alt ÷10, sin basura de coma flotante", () => {
    expect(stepValue(5, 1, 1)).toBe(6);
    expect(stepValue(5, -1, 1)).toBe(4);
    expect(stepValue(5, 1, 1, { shift: true })).toBe(15);
    expect(stepValue(5, 1, 1, { alt: true })).toBe(5.1);
    expect(stepValue(0.1, 1, 0.1, { alt: false })).toBe(0.2);
    expect(stepValue(0.2, 1, 0.1)).toBe(0.3);
    expect(stepValue(null, 1, 1000)).toBe(1000);
  });

  it("roundTo y tidy", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-1.005, 2)).toBe(-1.01);
    expect(roundTo(1234.5678, 0)).toBe(1235);
    expect(tidy(0.1 + 0.2)).toBe(0.3);
    expect(Object.is(tidy(-0), 0)).toBe(true);
  });

  it("roundValue según el formato y los decimales", () => {
    expect(roundValue(1200.456, { format: "money" })).toBe(1200.46);
    expect(roundValue(1200.456, { format: "money", decimals: 0 })).toBe(1200);
    expect(roundValue(0.12345, { format: "percent" })).toBe(0.1235);
    expect(roundValue(3.14159265, {})).toBe(3.141593);
  });
});

describe("formatear", () => {
  it("formatEdit: lo que queda escrito, sin símbolo", () => {
    expect(formatEdit(1450000)).toBe("1.450.000");
    expect(formatEdit(1234.5, { locale: "en-US" })).toBe("1,234.5");
    expect(formatEdit(1200.5, { format: "money" })).toBe("1.200,50"); // un monto con centavos los muestra todos
    expect(formatEdit(1200, { format: "money" })).toBe("1.200");
    expect(formatEdit(0.19, { format: "percent" })).toBe("19");
    expect(formatEdit(0.125, { format: "percent" })).toBe("12,5");
    expect(formatEdit(-1200)).toBe("-1.200");
    expect(formatEdit(2.5, { decimals: 0 })).toBe("3");
  });

  it("formatText: el valor completo", () => {
    expect(nb(formatText(1450000, { format: "money", currency: "COP" }))).toBe("$ 1.450.000");
    expect(nb(formatText(1200.5, { format: "money", currency: "USD" }))).toBe("US$ 1.200,50");
    expect(nb(formatText(1200.5, { format: "money", currency: "USD", locale: "en-US" }))).toBe("$1,200.50");
    expect(formatText(1200, { format: "money", currency: "$" })).toBe("$ 1.200");
    expect(formatText(1200, { format: "money" })).toBe("$ 1.200");
    expect(nb(formatText(0.19, { format: "percent" }))).toMatch(/^19 ?%$/);
    expect(formatText(1234.5, { locale: "en-US" })).toBe("1,234.5");
    expect(formatText(null)).toBe("");
  });

  it("affixes: el símbolo y de qué lado va", () => {
    expect(affixes({ format: "money", currency: "COP" })).toEqual({ prefix: "$", suffix: "" });
    expect(affixes({ format: "money", currency: "USD", locale: "en-US" })).toEqual({ prefix: "$", suffix: "" });
    expect(affixes({ format: "money", currency: "EUR", locale: "es-ES" })).toEqual({ prefix: "", suffix: "€" });
    expect(affixes({ format: "money", currency: "US$" })).toEqual({ prefix: "US$", suffix: "" });
    expect(affixes({ format: "percent" })).toEqual({ prefix: "", suffix: "%" });
    expect(affixes({ format: "number" })).toEqual({ prefix: "", suffix: "" });
  });
});

describe("numberToWords", () => {
  it.each([
    [0, "cero"],
    [1, "uno"],
    [7, "siete"],
    [10, "diez"],
    [15, "quince"],
    [16, "dieciséis"],
    [20, "veinte"],
    [21, "veintiuno"],
    [22, "veintidós"],
    [23, "veintitrés"],
    [26, "veintiséis"],
    [30, "treinta"],
    [31, "treinta y uno"],
    [45, "cuarenta y cinco"],
    [99, "noventa y nueve"],
    [100, "cien"],
    [101, "ciento uno"],
    [115, "ciento quince"],
    [121, "ciento veintiuno"],
    [200, "doscientos"],
    [500, "quinientos"],
    [555, "quinientos cincuenta y cinco"],
    [700, "setecientos"],
    [900, "novecientos"],
    [999, "novecientos noventa y nueve"],
    [1000, "mil"],
    [1001, "mil uno"],
    [1100, "mil cien"],
    [2000, "dos mil"],
    [21000, "veintiún mil"],
    [31000, "treinta y un mil"],
    [100000, "cien mil"],
    [101000, "ciento un mil"],
    [121000, "ciento veintiún mil"],
    [999999, "novecientos noventa y nueve mil novecientos noventa y nueve"],
    [1000000, "un millón"],
    [1000001, "un millón uno"],
    [1450000, "un millón cuatrocientos cincuenta mil"],
    [2000000, "dos millones"],
    [21000000, "veintiún millones"],
    [100000000, "cien millones"],
    [1000000000, "mil millones"],
    [2500000000, "dos mil quinientos millones"],
    [1e12, "un billón"],
    [3e12, "tres billones"],
    [-5, "menos cinco"],
    [12.5, "doce con 50/100"],
    [0.07, "cero con 07/100"],
  ])("%s → «%s»", (n, words) => expect(numberToWords(n)).toBe(words));

  it.each([
    [0, "cero pesos m/cte"],
    [1, "un peso m/cte"],
    [2, "dos pesos m/cte"],
    [21, "veintiún pesos m/cte"],
    [31, "treinta y un pesos m/cte"],
    [100, "cien pesos m/cte"],
    [101, "ciento un pesos m/cte"],
    [1000, "mil pesos m/cte"],
    [21000, "veintiún mil pesos m/cte"],
    [1000000, "un millón de pesos m/cte"],
    [1000100, "un millón cien pesos m/cte"],
    [1450000, "un millón cuatrocientos cincuenta mil pesos m/cte"],
    [2000000, "dos millones de pesos m/cte"],
    [1e9, "mil millones de pesos m/cte"],
    [1e12, "un billón de pesos m/cte"],
    [1200.5, "mil doscientos pesos con 50/100 m/cte"],
    [1000000.5, "un millón de pesos con 50/100 m/cte"],
    [0.5, "cero pesos con 50/100 m/cte"],
    [1234.56, "mil doscientos treinta y cuatro pesos con 56/100 m/cte"],
    [99.999, "cien pesos m/cte"], // los centavos que redondean a 100 suben un peso
    [-1200, "menos mil doscientos pesos m/cte"],
  ])("COP: %s → «%s»", (n, words) => expect(numberToWords(n, { currency: "COP" })).toBe(words));

  it("otras monedas", () => {
    expect(numberToWords(1, { currency: "USD" })).toBe("un dólar");
    expect(numberToWords(21, { currency: "usd" })).toBe("veintiún dólares");
    expect(numberToWords(1200.5, { currency: "USD" })).toBe("mil doscientos dólares con 50/100");
    expect(numberToWords(1e6, { currency: "EUR" })).toBe("un millón de euros");
    expect(numberToWords(1e6, { currency: "MXN" })).toBe("un millón de pesos mexicanos");
    expect(numberToWords(3, { currency: { one: "bulto", many: "bultos" } })).toBe("tres bultos");
    expect(numberToWords(3, { currency: "XYZ" })).toBe("tres"); // desconocida: solo el número
  });

  it("fuera de rango o no finito: vacío", () => {
    expect(numberToWords(1e15)).toBe("");
    expect(numberToWords(Number.NaN)).toBe("");
    expect(numberToWords(Number.POSITIVE_INFINITY)).toBe("");
  });

  it("wordsCurrency: «$» en Colombia son pesos", () => {
    expect(wordsCurrency("USD", "es-CO")).toBe("USD");
    expect(wordsCurrency("$", "es-CO")).toBe("COP");
    expect(wordsCurrency(undefined, "es-CO")).toBe("COP");
    expect(wordsCurrency("$", "en-US")).toBeUndefined();
    expect(wordsCurrency("CHF", "es-CO")).toBeUndefined();
  });
});

describe("limpiar lo que llega (BDUI)", () => {
  it("cleanNumber", () => {
    expect(cleanNumber(12)).toBe(12);
    expect(cleanNumber("1450000.5")).toBe(1450000.5);
    expect(cleanNumber(" -3 ")).toBe(-3);
    expect(cleanNumber("1e3")).toBe(1000);
    expect(cleanNumber("1.450.000")).toBeNull(); // no es formato de máquina
    expect(cleanNumber(Number.NaN)).toBeNull();
    expect(cleanNumber(Number.POSITIVE_INFINITY)).toBeNull();
    expect(cleanNumber("")).toBeNull();
    expect(cleanNumber({})).toBeNull();
    expect(cleanNumber(null)).toBeNull();
  });

  it("cleanFormat, cleanAlign, cleanCurrency, cleanDecimals", () => {
    expect(cleanFormat("money")).toBe("money");
    expect(cleanFormat("html")).toBe("number");
    expect(cleanAlign(undefined, "money")).toBe("end");
    expect(cleanAlign(undefined, "number")).toBe("start");
    expect(cleanAlign("center", "money")).toBe("center");
    expect(cleanAlign("left", "number")).toBe("start");
    expect(cleanCurrency("cop")).toBe("COP");
    expect(cleanCurrency("US$")).toBe("US$");
    expect(cleanCurrency("<b>")).toBeUndefined();
    expect(cleanCurrency("pesos colombianos")).toBeUndefined();
    expect(cleanCurrency(3)).toBeUndefined();
    expect(cleanDecimals("2")).toBe(2);
    expect(cleanDecimals(0)).toBe(0);
    expect(cleanDecimals(-1)).toBeUndefined();
    expect(cleanDecimals(1.5)).toBeUndefined();
    expect(cleanDecimals("x")).toBeUndefined();
  });

  it("cleanLabels: solo claves conocidas con texto", () => {
    const l = cleanLabels({ min: "Mín. {min}", nope: "x", max: 3, __proto__: { unknown: "hack" } }, NUMBER_LABELS);
    expect(l.min).toBe("Mín. {min}");
    expect(l.max).toBe(NUMBER_LABELS.max);
    expect("nope" in l).toBe(false);
    expect(l.unknown).toBe(NUMBER_LABELS.unknown);
  });
});
