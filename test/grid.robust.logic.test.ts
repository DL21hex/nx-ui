// Casos límite de la lógica de <nx-grid> y del .xlsx que salieron de la revisión: datos del backend
// que congelaban la pestaña, fórmulas al copiar y un libro que Excel tenía que «reparar».
import { afterEach, describe, expect, it, vi } from "vitest";
import { formulaSafe, histogram, histogramSpec, niceEdges, parseTSV, toTSV, unformulaSafe } from "../src/components/grid/logic";
import { buildXlsx, moneyFormat, sheetName, sheetXml } from "../src/components/grid/xlsx";

afterEach(() => vi.unstubAllGlobals());

describe("niceEdges: nunca un bucle infinito", () => {
  it("un rango por debajo de la precisión del número (ruido de coma flotante) da una sola barra", () => {
    for (const [a, b] of [
      [0.3, 0.1 + 0.2],
      [1234.56, 1234.5600000000002],
      [1e17, 1e17 + 16],
      [1e20, 1e20 + 16384],
      [-1e20 - 16384, -1e20],
    ]) {
      const edges = niceEdges(Math.min(a, b), Math.max(a, b));
      expect(edges.length).toBeLessThanOrEqual(42);
      expect(edges[0]).toBeLessThanOrEqual(Math.min(a, b));
      expect(edges[edges.length - 1]).toBeGreaterThan(Math.max(a, b));
    }
  });

  it("no finitos o iguales: dos bordes", () => {
    expect(niceEdges(5, 5)).toEqual([5, 6]);
    expect(niceEdges(Number.NaN, 3)).toHaveLength(2);
  });

  it("una columna de montos con ruido de coma flotante se reparte sin colgarse", () => {
    const rows = [{ m: 0.3 }, { m: 0.1 + 0.2 }, { m: 0.3 }];
    const spec = histogramSpec({ key: "m", label: "M", type: "money" }, rows)!;
    expect(spec.kind).toBe("bins");
    expect(histogram(spec, rows, rows).counts.reduce((a, b) => a + b, 0)).toBe(3);
  });
});

describe("TSV: fórmulas al copiar", () => {
  it("antepone un apóstrofo a lo que Excel tomaría como fórmula, y lo quita al pegar", () => {
    for (const t of ["=HYPERLINK(\"https://x/?\"&A1)", "+57 300", "-cmd", "@SUMA(A1)", "\tx", "\rx"]) {
      expect(formulaSafe(t)).toBe(`'${t}`);
      expect(unformulaSafe(formulaSafe(t))).toBe(t);
    }
    expect(formulaSafe("OC-2291")).toBe("OC-2291");
    expect(unformulaSafe("'hola")).toBe("'hola");
    // Sigue siendo TSV válido: vuelve igual.
    const m = [[formulaSafe("=1+1"), "b"]];
    expect(parseTSV(toTSV(m))).toEqual(m);
  });
});

describe("xlsx", () => {
  it("el nombre de la hoja: sin caracteres prohibidos ni apóstrofos en los bordes", () => {
    expect(sheetName("Ventas/2026: [Q1]")).toBe("Ventas 2026   Q1");
    expect(sheetName("'citado'")).toBe("citado");
    expect(sheetName("'''")).toBe("Hoja1");
    expect(sheetName("x".repeat(40))).toHaveLength(31);
  });

  it("formato de moneda con el símbolo y los decimales de la columna", () => {
    expect(moneyFormat("$", 0)).toBe('"$"\\ #,##0');
    expect(moneyFormat("€", 2)).toBe('"€"\\ #,##0.00');
    expect(moneyFormat('U"S$', 2)).toBe('"US$"\\ #,##0.00');
  });

  it("cada columna usa el estilo de su formato propio", () => {
    const xml = sheetXml(["A", "B"], [[1.5, 2]], ["money", "money"], [10, 10], [5, undefined]);
    expect(xml).toContain('<c r="A2" s="5"><v>1.5</v></c>');
    expect(xml).toContain('<c r="B2" s="3"><v>2</v></c>');
  });

  it("el libro: apóstrofo duplicado en la referencia del autofiltro y los formatos en los estilos", async () => {
    // Sin CompressionStream el zip va sin comprimir y se puede leer como texto.
    vi.stubGlobal("CompressionStream", undefined);
    const blob = await buildXlsx("O'Brien", ["Monto", "Total"], [[1.25, 3]], ["money", "money"], [10, 10], [moneyFormat("€", 2), moneyFormat("US$", 0)]);
    const text = new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text).toContain(`<sheet name="O'Brien"`);
    expect(text).toContain(`'O''Brien'!$A$1:$B$2`);
    expect(text).toContain('<numFmt numFmtId="166" formatCode="&quot;€&quot;\\ #,##0.00"/>');
    expect(text).toContain('<numFmt numFmtId="167" formatCode="&quot;US$&quot;\\ #,##0"/>');
    expect(text).toContain('<cellXfs count="7">');
    expect(text).toContain('<c r="A2" s="5"><v>1.25</v></c><c r="B2" s="6"><v>3</v></c>');
  });
});
