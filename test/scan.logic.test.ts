import { describe, expect, it } from "vitest";
import {
  DEFAULT_FORMATS,
  WEDGE,
  WEDGE_EMPTY,
  addRead,
  cleanCode,
  cleanFormats,
  cleanItems,
  cleanMode,
  cleanProduct,
  cleanQty,
  cleanWedge,
  fill,
  formatName,
  gtinValid,
  guessFormat,
  isBurst,
  isRepeat,
  itemStatus,
  mapBox,
  mergeProduct,
  parseEntry,
  setQty,
  totals,
  wedgeKey,
  type WedgeState,
} from "../src/components/scan/logic";
import type { ScanItem } from "../src/components/scan/types";

/** Teclea `text` con `gaps` ms entre teclas (un número o uno por tecla) y cierra con Enter a `enter` ms. */
function typeKeys(text: string, gaps: number | number[], enter = 10, start = 1000): { code: string | null; state: WedgeState } {
  let s = WEDGE_EMPTY;
  let t = start;
  [...text].forEach((ch, i) => {
    if (i) t += Array.isArray(gaps) ? gaps[i - 1] : gaps;
    s = wedgeKey(s, ch, t).state;
  });
  const r = wedgeKey(s, "Enter", t + enter);
  return { code: r.code, state: r.state };
}

describe("datos de entrada", () => {
  it("modo y pistola: lo que no se entiende vuelve al valor por defecto", () => {
    expect(cleanMode("count")).toBe("count");
    expect(cleanMode("COUNT")).toBe("single");
    expect(cleanMode(undefined)).toBe("single");
    expect(cleanWedge("field")).toBe("field");
    expect(cleanWedge("off")).toBe("off");
    expect(cleanWedge("siempre")).toBe("page");
  });

  it("formatos: arreglo, JSON o lista con comas; sin repetir, sin inventados, en minúscula", () => {
    expect(cleanFormats(["ean_13", "EAN-13", "qr_code", "codigo_raro"])).toEqual(["ean_13", "qr_code"]);
    expect(cleanFormats('["code_128","upc_a"]')).toEqual(["code_128", "upc_a"]);
    expect(cleanFormats("ean_13, code_128  qr_code")).toEqual(["ean_13", "code_128", "qr_code"]);
    expect(cleanFormats("")).toEqual(DEFAULT_FORMATS);
    expect(cleanFormats("[roto")).toEqual(DEFAULT_FORMATS);
    expect(cleanFormats(42)).toEqual(DEFAULT_FORMATS);
    // Una copia: cambiarla no toca los de siempre.
    cleanFormats(null).push("x");
    expect(DEFAULT_FORMATS).not.toContain("x");
  });

  it("nombre de cada formato", () => {
    expect(formatName("ean_13")).toBe("EAN-13");
    expect(formatName("qr_code")).toBe("QR");
    expect(formatName("code_128")).toBe("Code 128");
    expect(formatName("otro")).toBe("otro");
    expect(formatName("")).toBe("");
  });

  it("el código: sin los saltos que manda la pistola ni caracteres de control; el separador GS1 se queda", () => {
    expect(cleanCode(" 7702001043385\r\n")).toBe("7702001043385");
    expect(cleanCode("\t(01)0770\u001d(10)L-88\u0007")).toBe("(01)0770\u001d(10)L-88");
    expect(cleanCode(7702001043385)).toBe("7702001043385");
    expect(cleanCode("   ")).toBe("");
    expect(cleanCode({})).toBe("");
    expect(cleanCode("x".repeat(513))).toBe("");
  });

  it("producto de `source`: valida, recorta y usa el código pedido si no trae el suyo", () => {
    expect(cleanProduct({ code: "7702001043385", name: " Lámina HR 3 mm ", unit: "und", expected: 40, precio: 1 })).toEqual({ code: "7702001043385", name: "Lámina HR 3 mm", unit: "und", expected: 40 });
    expect(cleanProduct({ name: "Tornillo" }, "123")).toEqual({ code: "123", name: "Tornillo", unit: undefined, expected: undefined });
    expect(cleanProduct({ code: "1", name: "X", expected: -3 })?.expected).toBeUndefined();
    expect(cleanProduct({ code: "1", name: "X", expected: "40" })?.expected).toBeUndefined();
    expect(cleanProduct({ code: "1" })).toBeNull();
    expect(cleanProduct("Lámina")).toBeNull();
    expect(cleanProduct(null)).toBeNull();
  });

  it("líneas precargadas: con código; la cantidad por defecto es 0; un código repetido se suma", () => {
    const items = cleanItems([
      { code: "A", name: "Lámina", expected: 40, onclick: "x" },
      { code: "B", qty: 3, unit: "kg", format: "ean_13" },
      { code: "A", qty: 2 },
      { code: "C", qty: -1, unknown: true },
      { name: "sin código" },
      "B",
      null,
    ]);
    expect(items).toEqual([
      { code: "A", qty: 2, name: "Lámina", expected: 40 },
      { code: "B", qty: 3, unit: "kg", format: "ean_13" },
      { code: "C", qty: 0, unknown: true },
    ]);
    expect(cleanItems("nada")).toEqual([]);
  });

  it("cantidades: ≥ 0 y hasta 3 decimales", () => {
    expect(cleanQty(2.34567)).toBe(2.346);
    expect(cleanQty("12")).toBe(12);
    expect(cleanQty(-1)).toBeNull();
    expect(cleanQty(Number.NaN)).toBeNull();
    expect(cleanQty("")).toBeNull();
  });

  it("fill() reemplaza lo que conoce", () => {
    expect(fill("{name}: {qty} de {expected}", { name: "Lámina", qty: 3 })).toBe("Lámina: 3 de {expected}");
  });
});

describe("GTIN y entrada escrita", () => {
  it("dígito de control de EAN-13, EAN-8 y UPC-A", () => {
    expect(gtinValid("7702001043385")).toBe(true);
    expect(gtinValid("7702001043386")).toBe(false);
    expect(gtinValid("96385074")).toBe(true);
    expect(gtinValid("036000291452")).toBe(true);
    expect(gtinValid("ABC")).toBe(false);
    expect(guessFormat("7702001043385")).toBe("ean_13");
    expect(guessFormat("96385074")).toBe("ean_8");
    expect(guessFormat("036000291452")).toBe("upc_a");
    // Si el dígito no cuadra, no se adivina.
    expect(guessFormat("7702001043386")).toBe("");
    expect(guessFormat("LOTE-2291")).toBe("");
  });

  it("parseEntry: un código, o un código con cantidad antes o después de * o ×", () => {
    expect(parseEntry("  7702001043385 ")).toEqual({ code: "7702001043385", qty: 1 });
    expect(parseEntry("12*7702001043385")).toEqual({ code: "7702001043385", qty: 12 });
    expect(parseEntry("7702001043385 × 12")).toEqual({ code: "7702001043385", qty: 12 });
    expect(parseEntry("2,5*AC-HR-414")).toEqual({ code: "AC-HR-414", qty: 2.5 });
    expect(parseEntry("0*ABC")).toEqual({ code: "0*ABC", qty: 1 });
    expect(parseEntry("")).toBeNull();
    expect(parseEntry("   ")).toBeNull();
  });
});

describe("agrupar y contar", () => {
  it("una lectura nueva entra arriba; una repetida suma en su lugar; no se toca la lista anterior", () => {
    let items: ScanItem[] = [];
    let r = addRead(items, "A", 1, "ean_13");
    expect(r.created).toBe(true);
    items = r.items;
    items = addRead(items, "B").items;
    expect(items.map((i) => i.code)).toEqual(["B", "A"]);
    const before = items;
    r = addRead(items, "A", 2, "code_128");
    expect(r.created).toBe(false);
    expect(r.item).toEqual({ code: "A", qty: 3, format: "code_128" });
    expect(r.items.map((i) => `${i.code}:${i.qty}`)).toEqual(["B:1", "A:3"]);
    expect(before.find((i) => i.code === "A")!.qty).toBe(1);
    // Con decimales (kg).
    expect(addRead([{ code: "K", qty: 0.1 }], "K", 0.2).item.qty).toBe(0.3);
  });

  it("setQty: cambia la cantidad; en 0 se va, salvo que se espere (queda como faltante)", () => {
    const items: ScanItem[] = [
      { code: "A", qty: 3 },
      { code: "B", qty: 1, expected: 4 },
    ];
    expect(setQty(items, "A", 7)[0].qty).toBe(7);
    expect(setQty(items, "A", 0).map((i) => i.code)).toEqual(["B"]);
    expect(setQty(items, "B", 0)).toEqual([{ code: "A", qty: 3 }, { code: "B", qty: 0, expected: 4 }]);
    expect(setQty(items, "A", -5).map((i) => i.code)).toEqual(["B"]);
    expect(setQty(items, "Z", 3)).toEqual(items);
  });

  it("mergeProduct: completa sin pisar lo que ya venía; null marca el código sin registrar", () => {
    const items: ScanItem[] = [
      { code: "A", qty: 2, expected: 10 },
      { code: "B", qty: 1 },
    ];
    const m = mergeProduct(items, "A", { code: "A", name: "Lámina HR 3 mm", unit: "und", expected: 40 });
    expect(m[0]).toEqual({ code: "A", qty: 2, expected: 10, name: "Lámina HR 3 mm", unit: "und" });
    expect(m[1]).toBe(items[1]);
    expect(mergeProduct(items, "B", null)[1]).toEqual({ code: "B", qty: 1, unknown: true });
    expect(mergeProduct([{ code: "B", qty: 1, unknown: true }], "B", { code: "B", name: "Ya existe" })[0]).toEqual({ code: "B", qty: 1, name: "Ya existe" });
  });

  it("faltantes, completas y sobrantes", () => {
    expect(itemStatus({ code: "A", qty: 38, expected: 40 })).toEqual({ status: "short", diff: -2 });
    expect(itemStatus({ code: "A", qty: 40, expected: 40 })).toEqual({ status: "ok", diff: 0 });
    expect(itemStatus({ code: "A", qty: 41, expected: 40 })).toEqual({ status: "over", diff: 1 });
    expect(itemStatus({ code: "A", qty: 5 })).toEqual({ status: "none", diff: 0 });
    expect(itemStatus({ code: "A", qty: 0.3, expected: 0.1 }).diff).toBe(0.2);
  });

  it("totales del pie", () => {
    const t = totals([
      { code: "A", qty: 38, expected: 40 },
      { code: "B", qty: 12, expected: 12 },
      { code: "C", qty: 7, expected: 5 },
      { code: "D", qty: 0, expected: 3 },
      { code: "E", qty: 2 },
    ]);
    expect(t).toEqual({ codes: 5, units: 59, expected: 60, missing: 5, extra: 2, shortLines: 2, overLines: 1 });
    expect(totals([])).toEqual({ codes: 0, units: 0, expected: 0, missing: 0, extra: 0, shortLines: 0, overLines: 0 });
  });
});

describe("la cámara no lee dos veces lo mismo", () => {
  it("el mismo código cuenta otra vez tras 1,5 s y solo si salió del cuadro", () => {
    expect(isRepeat(null, "A", 0)).toBe(false);
    const last = { code: "A", at: 1000, seen: 1000 };
    expect(isRepeat(last, "B", 1100)).toBe(false);
    expect(isRepeat(last, "A", 1100)).toBe(true);
    expect(isRepeat(last, "A", 2600)).toBe(false);
    // Sostenido frente a la cámara: se sigue viendo, no vuelve a contar aunque pase el tiempo.
    expect(isRepeat({ ...last, seen: 2500 }, "A", 2600)).toBe(true);
    expect(isRepeat({ ...last, seen: 2100 }, "A", 2600)).toBe(false);
  });
});

describe("pistola lectora vs. tecleo humano", () => {
  it("una ráfaga rápida cerrada con Enter es un código", () => {
    expect(typeKeys("7702001043385", 8).code).toBe("7702001043385");
    // Bluetooth, más lenta pero pareja.
    expect(typeKeys("LOTE-2291", 35, 30).code).toBe("LOTE-2291");
    // El estado queda limpio.
    expect(typeKeys("7702001043385", 8).state).toEqual(WEDGE_EMPTY);
  });

  it("una persona escribiendo (aunque sea rápido) no lo es", () => {
    expect(typeKeys("7702001043385", 120).code).toBeNull();
    expect(typeKeys("hola mundo", 70).code).toBeNull();
    // Dedos que se solapan: algunas teclas casi juntas, pero el promedio es humano.
    expect(typeKeys("buscar", [15, 110, 20, 130, 90]).code).toBeNull();
  });

  it("muy corto, o el Enter llega tarde, no cuenta", () => {
    expect(typeKeys("123", 5).code).toBeNull();
    expect(typeKeys("7702001043385", 8, 400).code).toBeNull();
  });

  it("una pausa larga en medio empieza otra ráfaga: se toma solo lo último", () => {
    // «abcd» a mano, medio segundo de pausa y luego la pistola: solo lo de la pistola.
    const gaps = [90, 90, 90, 500, ...Array(7).fill(6)];
    expect(typeKeys("abcd" + "x7702001", gaps).code).toBe("x7702001");
  });

  it("Mayús no cuenta; una flecha o Backspace cortan la ráfaga", () => {
    let s = WEDGE_EMPTY;
    s = wedgeKey(s, "A", 0).state;
    s = wedgeKey(s, "Shift", 5).state;
    s = wedgeKey(s, "B", 10).state;
    s = wedgeKey(s, "C", 18).state;
    s = wedgeKey(s, "D", 25).state;
    expect(s.buf).toBe("ABCD");
    expect(wedgeKey(s, "Enter", 30).code).toBe("ABCD");
    expect(wedgeKey(s, "Backspace", 30).state).toEqual(WEDGE_EMPTY);
  });

  it("isBurst mira el promedio de toda la ráfaga", () => {
    const s = { buf: "123456", first: 0, last: 5 * (WEDGE.avgGap + 5) };
    expect(isBurst(s, s.last + 5)).toBe(false);
    expect(isBurst({ ...s, last: 5 * WEDGE.avgGap }, 5 * WEDGE.avgGap + 5)).toBe(true);
  });
});

describe("dónde está el código en pantalla", () => {
  it("object-fit: cover — escala para llenar y centra", () => {
    // Video 1280×720 en un visor 400×300: escala 300/720, sobra a los lados.
    const k = 300 / 720;
    const r = mapBox({ x: 640, y: 360, width: 128, height: 72 }, { width: 1280, height: 720 }, { width: 400, height: 300 })!;
    expect(r.x).toBeCloseTo(640 * k + (400 - 1280 * k) / 2);
    expect(r.y).toBeCloseTo(150);
    expect(r.width).toBeCloseTo(128 * k);
    expect(r.height).toBeCloseTo(30);
    expect(mapBox({ x: 0, y: 0, width: 1, height: 1 }, { width: 0, height: 0 }, { width: 400, height: 300 })).toBeNull();
  });
});

describe("SSR", () => {
  it("importar el componente sin DOM no lanza", async () => {
    const mod = await import("../src/components/scan/index");
    expect(typeof mod.NxScan).toBe("function");
    expect(mod.SCAN_LABELS.start).toBe("Activar cámara");
  });
});
