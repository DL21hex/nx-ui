// Lógica del filtro por columna y del .xlsx de <nx-grid> que salió de la revisión: listas `in` /
// `notIn` con miles de valores, «contiene» que pliega cada dato una vez, una hoja que no cabe en
// una sola cadena y lo que Excel no acepta en una celda.
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyFilters, foldValue, matchFilter, selection } from "../src/components/grid/logic";
import { buildXlsx, CELL_MAX, cellText, crc32, sheetParts, sheetXml, xmlText, type XlsxCell } from "../src/components/grid/xlsx";
import type { GridFilter, GridRow } from "../src/components/grid/types";

afterEach(() => vi.unstubAllGlobals());

describe("filtros in / notIn con miles de valores", () => {
  const rows: GridRow[] = Array.from({ length: 100_000 }, (_, i) => ({ prov: `p-${i % 5000}` }));
  const values = Array.from({ length: 4000 }, (_, i) => `p-${i}`);

  it("se evalúan con un conjunto: 100.000 filas y 4.000 valores en mucho menos de un segundo", () => {
    const t = performance.now();
    const out = applyFilters(rows, [{ key: "prov", op: "notIn", values }]);
    const inc = applyFilters(rows, [{ key: "prov", op: "in", values }]);
    // Con `Array.includes` por fila tardaba varios segundos.
    expect(performance.now() - t).toBeLessThan(1000);
    expect(out).toHaveLength(20_000);
    expect(inc).toHaveLength(80_000);
  });

  it("lo marcado de una lista sale del mismo conjunto, y una lista cambiada en su lugar se vuelve a leer", () => {
    const f: GridFilter = { key: "prov", op: "in", values: ["a", "b"] };
    expect([...selection([f], "prov", ["a", "b", "c"])!]).toEqual(["a", "b"]);
    expect(matchFilter({ prov: "c" }, f)).toBe(false);
    f.values.push("c");
    expect(matchFilter({ prov: "c" }, f)).toBe(true);
    expect(matchFilter({ prov: null }, { key: "prov", op: "notIn", values: [""] })).toBe(false);
  });
});

describe("«contiene» pliega cada dato una vez", () => {
  it("sin tildes ni mayúsculas, y el mismo dato no se vuelve a plegar", () => {
    expect(matchFilter({ d: "Tubería de Ñandú" }, { key: "d", op: "contains", value: "TUBERIA de nandu" })).toBe(true);
    expect(foldValue("Ñandú")).toBe("nandu");
    const rows = Array.from({ length: 50 }, (_, i) => ({ d: i % 2 ? "Ñandú" : "Árbol" }));
    const spy = vi.spyOn(String.prototype, "normalize");
    expect(applyFilters(rows, [{ key: "d", op: "contains", value: "and" }])).toHaveLength(25);
    // Lo buscado se pliega una vez; cada dato, una vez (el primero ya estaba plegado).
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockClear();
    expect(applyFilters(rows, [{ key: "d", op: "contains", value: "and" }])).toHaveLength(25);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("xlsx", () => {
  it("el CRC se puede calcular por partes", () => {
    const enc = new TextEncoder();
    expect(crc32(enc.encode("6789"), crc32(enc.encode("12345")))).toBe(crc32(enc.encode("123456789")));
  });

  it("U+FFFE y U+FFFF no van en el XML", () => {
    expect(xmlText("a￾b￿c")).toBe("abc");
  });

  it("un texto de más de 32.767 caracteres se recorta con «…» (Excel no pide reparar el libro)", () => {
    const long = "x".repeat(40_000);
    expect(cellText(long)).toHaveLength(CELL_MAX);
    expect(cellText(long).endsWith("…")).toBe(true);
    expect(cellText("corto")).toBe("corto");
    // Sin partir un emoji en dos.
    expect(cellText(`${"x".repeat(CELL_MAX - 2)}😀😀`).endsWith("x…")).toBe(true);
    const xml = sheetXml(["A"], [[long]], ["text"], [10]);
    expect(xml).toContain(`<t xml:space="preserve">${"x".repeat(CELL_MAX - 1)}…</t>`);
  });

  it("la hoja sale por partes, cada una de un bloque de filas", () => {
    const rows: XlsxCell[][] = Array.from({ length: 4500 }, (_, i) => [`OC-${i}`, i]);
    const parts = [...sheetParts(["Pedido", "N"], rows, ["text", "number"], [10, 10])];
    // El principio, tres bloques y el final.
    expect(parts).toHaveLength(5);
    expect(parts.join("")).toBe(sheetXml(["Pedido", "N"], rows, ["text", "number"], [10, 10]));
    expect(parts[3]).toContain('<row r="4501">');
  });

  it("el libro por partes, comprimido: la hoja descomprimida y su CRC coinciden", async () => {
    const rows: XlsxCell[][] = Array.from({ length: 6000 }, (_, i) => [`OC-${i}`, i * 1000, "2026-03-05"]);
    const types = ["text", "money", "date"] as const;
    const blob = await buildXlsx("Pedidos", ["Pedido", "Monto", "Fecha"], rows, [...types], [10, 10, 10]);
    const buf = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(buf.buffer);
    // Busca la cabecera local de la hoja.
    const dec = new TextDecoder();
    let at = 0;
    for (;;) {
      expect(view.getUint32(at, true)).toBe(0x04034b50);
      const n = view.getUint16(at + 26, true);
      const size = view.getUint32(at + 18, true);
      if (dec.decode(buf.subarray(at + 30, at + 30 + n)) === "xl/worksheets/sheet1.xml") {
        const method = view.getUint16(at + 8, true);
        const crc = view.getUint32(at + 14, true);
        const body = buf.subarray(at + 30 + n, at + 30 + n + size);
        const raw = method === 8 ? new Uint8Array(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()) : body;
        expect(method).toBe(8);
        expect(view.getUint32(at + 22, true)).toBe(raw.length);
        expect(crc32(raw)).toBe(crc);
        expect(dec.decode(raw)).toBe(sheetXml(["Pedido", "Monto", "Fecha"], rows, [...types], [10, 10, 10], [undefined, undefined, undefined]));
        break;
      }
      at += 30 + n + size;
    }
  });
});
