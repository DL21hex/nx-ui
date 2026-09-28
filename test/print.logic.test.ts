import { describe, expect, it } from "vitest";
import { fillPageText, paginatePrint, parsePrintMargin, parsePrintSize, parseZoom, PRINT_SIZES, stepZoom, toMm } from "../src/components/print/logic";
import type { PrintBlock, PrintPiece } from "../src/components/print/types";

/** Qué bloques (y filas) hay en cada página, en texto: «0 | 1[0-5) · 2» */
const shape = (pages: PrintPiece[][]) =>
  pages.map((p) => p.map((x) => (x.from !== undefined ? `${x.block}[${x.from}-${x.to})` : x.clip !== undefined ? `${x.block}@${x.offset}` : `${x.block}`)).join(" · ")).join(" | ");
const table = (rows: number, rowH = 20, extra: Partial<NonNullable<PrintBlock["table"]>> = {}): PrintBlock => {
  const t = { head: 30, rows: new Array(rows).fill(rowH), ...extra };
  return { height: 0, table: t };
};

describe("tamaños y márgenes", () => {
  it("nombres conocidos, verticales por defecto", () => {
    expect(parsePrintSize("letter")).toEqual([215.9, 279.4]);
    expect(parsePrintSize("A4")).toEqual([210, 297]);
    expect(parsePrintSize("legal")).toEqual([215.9, 355.6]);
    expect(parsePrintSize("oficio")).toEqual([216, 330]);
    expect(parsePrintSize("half-letter")).toEqual([139.7, 215.9]);
    expect(parsePrintSize(undefined)).toEqual([215.9, 279.4]);
    expect(parsePrintSize("tabloide")).toEqual([215.9, 279.4]);
  });
  it("la orientación manda; unas medidas sin orientación van como se escribieron", () => {
    expect(parsePrintSize("half-letter", "landscape")).toEqual([215.9, 139.7]);
    expect(parsePrintSize("216mm 140mm")).toEqual([216, 140]);
    expect(parsePrintSize("216mm 140mm", "portrait")).toEqual([140, 216]);
    expect(parsePrintSize("8.5in 11in")[0]).toBeCloseTo(215.9);
    expect(parsePrintSize("21.6cm 33cm")).toEqual([216, 330]);
    expect(parsePrintSize("5mm 5mm")).toEqual([215.9, 279.4]); // absurdo: carta
    // No se modifica la tabla de tamaños al girar.
    parsePrintSize("letter", "landscape");
    expect(PRINT_SIZES.letter).toEqual([215.9, 279.4]);
  });
  it("unidades", () => {
    expect(toMm("1in")).toBeCloseTo(25.4);
    expect(toMm("72pt")).toBeCloseTo(25.4);
    expect(toMm("96px")).toBeCloseTo(25.4);
    expect(toMm("12")).toBe(12);
    expect(toMm("doce")).toBeNull();
  });
  it("márgenes de uno a cuatro valores, como en CSS", () => {
    expect(parsePrintMargin("12mm")).toEqual([12, 12, 12, 12]);
    expect(parsePrintMargin("10mm 15mm")).toEqual([10, 15, 10, 15]);
    expect(parsePrintMargin("10mm 15mm 20mm")).toEqual([10, 15, 20, 15]);
    expect(parsePrintMargin("1cm 2cm 3cm 4cm")).toEqual([10, 20, 30, 40]);
    expect(parsePrintMargin(8)).toEqual([8, 8, 8, 8]);
    expect(parsePrintMargin("mucho")).toEqual([12, 12, 12, 12]);
    expect(parsePrintMargin("1 2 3 4 5")).toEqual([12, 12, 12, 12]);
    expect(parsePrintMargin("500mm")).toEqual([60, 60, 60, 60]);
  });
  it("zoom", () => {
    expect(parseZoom(null)).toBe("fit");
    expect(parseZoom("fit")).toBe("fit");
    expect(parseZoom("1.25")).toBe(1.25);
    expect(parseZoom("125%")).toBe(1.25);
    expect(parseZoom("40")).toBe(4);
    expect(parseZoom("-1")).toBe("fit");
    expect(stepZoom(1, 1)).toBe(1.1);
    expect(stepZoom(1, -1)).toBe(0.9);
    expect(stepZoom(0.83, 1)).toBe(0.9);
    expect(stepZoom(2, 1)).toBe(2);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });
  it("{page} y {pages}", () => {
    expect(fillPageText("Página {page} de {pages}", 2, 3)).toBe("Página 2 de 3");
    expect(fillPageText("{page}/{page}", 1, 1)).toBe("1/1");
    expect(fillPageText("sin marcas", 1, 1)).toBe("sin marcas");
  });
});

describe("paginatePrint: bloques", () => {
  it("vacío: una página", () => {
    expect(paginatePrint([], { pageHeight: 500 })).toEqual([[]]);
  });
  it("llena la página y pasa a la siguiente el que no cabe", () => {
    const b = [200, 200, 200].map((height) => ({ height, gap: 10 }));
    expect(shape(paginatePrint(b, { pageHeight: 500 }))).toBe("0 · 1 | 2");
  });
  it("el espacio de después no cuenta al pie de la página", () => {
    const b = [{ height: 240, gap: 20 }, { height: 240, gap: 20 }];
    expect(shape(paginatePrint(b, { pageHeight: 500 }))).toBe("0 · 1");
  });
  it("salto forzado antes y después (sin páginas en blanco)", () => {
    const b: PrintBlock[] = [{ height: 50, breakBefore: true }, { height: 50, breakAfter: true }, { height: 50 }, { height: 50, breakBefore: true }, { height: 50, breakAfter: true }];
    expect(shape(paginatePrint(b, { pageHeight: 500 }))).toBe("0 · 1 | 2 | 3 · 4");
  });
  it("keep-with-next: el título no queda solo al pie", () => {
    const b: PrintBlock[] = [{ height: 420 }, { height: 30, keepWithNext: true }, { height: 100 }];
    expect(shape(paginatePrint(b, { pageHeight: 500 }))).toBe("0 | 1 · 2");
  });
  it("keep-with-next en cadena (título y subtítulo)", () => {
    const b: PrintBlock[] = [{ height: 400 }, { height: 30, keepWithNext: true }, { height: 20, keepWithNext: true }, { height: 100 }];
    expect(shape(paginatePrint(b, { pageHeight: 500 }))).toBe("0 | 1 · 2 · 3");
  });
  it("keep-with-next con una tabla: basta con que quepan el encabezado y dos filas", () => {
    const b: PrintBlock[] = [{ height: 350 }, { height: 30, keepWithNext: true }, table(20)];
    // 350 + 30 + (30 + 2×20) = 450 ≤ 500: el título se queda y la tabla empieza en la misma página.
    const pages = paginatePrint(b, { pageHeight: 500 });
    expect(pages[0].map((p) => p.block)).toEqual([0, 1, 2]);
  });
  it("keep-with-next que no cabe ni en una página vacía se ignora", () => {
    const b: PrintBlock[] = [{ height: 100 }, { height: 30, keepWithNext: true }, { height: 490 }];
    expect(shape(paginatePrint(b, { pageHeight: 500 }))).toBe("0 · 1 | 2");
  });
  it("un bloque más alto que una página se parte en tajadas (y termina)", () => {
    const b: PrintBlock[] = [{ height: 100 }, { height: 1200 }, { height: 50 }];
    const pages = paginatePrint(b, { pageHeight: 500 });
    expect(shape(pages)).toBe("0 | 1@0 | 1@500 | 1@1000 · 2");
    expect(pages[3][0].clip).toBe(200);
  });
  it("keep más alto que la página también se parte", () => {
    expect(paginatePrint([{ height: 1001, keep: true }], { pageHeight: 500 })).toHaveLength(3);
  });
  it("alturas raras (NaN, negativas, sin objeto) no rompen", () => {
    const b = [{ height: NaN }, { height: -5 }, null as unknown as PrintBlock, { height: Infinity }];
    expect(() => paginatePrint(b, { pageHeight: 500 })).not.toThrow();
    expect(paginatePrint([{ height: 10 }], { pageHeight: 0 }).length).toBeGreaterThan(0);
  });
  it("tope de páginas: un bloque gigante no cuelga", () => {
    const pages = paginatePrint([{ height: 1e12 }], { pageHeight: 1, maxPages: 50 });
    expect(pages).toHaveLength(50);
  });
});

describe("paginatePrint: tablas", () => {
  it("una tabla que cabe va entera", () => {
    expect(shape(paginatePrint([table(10)], { pageHeight: 500 }))).toBe("0[0-10)");
  });
  it("se parte por filas, con el encabezado en cada pedazo, sin partir una fila", () => {
    // 30 de encabezado + 20 por fila: caben 23 filas en 500.
    const pages = paginatePrint([table(60)], { pageHeight: 500 });
    expect(shape(pages)).toBe("0[0-23) | 0[23-46) | 0[46-60)");
    expect(pages[0][0]).toMatchObject({ first: true, last: false });
    expect(pages[2][0]).toMatchObject({ first: false, last: true });
  });
  it("filas de alto distinto: nunca se pasa del alto", () => {
    const rows = Array.from({ length: 200 }, (_, i) => 12 + ((i * 7) % 30));
    const P = 480;
    const pages = paginatePrint([{ height: 0, table: { head: 24, rows, foot: 40, extra: 2 } }], { pageHeight: P });
    for (const [p] of pages) {
      let h = 2 + 24 + (p.last ? 40 : 0);
      for (let r = p.from!; r < p.to!; r++) h += rows[r];
      expect(h).toBeLessThanOrEqual(P + 0.5);
    }
    expect(pages.flat().reduce((s, p) => s + p.to! - p.from!, 0)).toBe(200);
  });
  it("el caption solo en el primer pedazo; el tfoot, en el último", () => {
    // Con caption de 60 caben 20 filas en la primera; con el pie de 100, el último tiene que dejarle espacio.
    const pages = paginatePrint([table(40, 20, { caption: 60, foot: 100 })], { pageHeight: 500 });
    expect(pages[0][0].to).toBe(20);
    const last = pages[pages.length - 1][0];
    expect(30 + (last.to! - last.from!) * 20 + 100).toBeLessThanOrEqual(500);
  });
  it("huérfanas: si solo cabe una fila al pie, la tabla empieza en la página siguiente", () => {
    const pages = paginatePrint([{ height: 440 }, table(10)], { pageHeight: 500 });
    // 440 + 30 + 20 = 490: cabría una fila, pero no dos.
    expect(shape(pages)).toBe("0 | 1[0-10)");
  });
  it("viudas: la última página de la tabla no empieza con una sola fila", () => {
    // Caben 23 filas por página; con 24, la segunda tendría una sola: se pasan dos.
    const pages = paginatePrint([table(24)], { pageHeight: 500 });
    expect(shape(pages)).toBe("0[0-22) | 0[22-24)");
  });
  it("minRows configurable", () => {
    const pages = paginatePrint([table(26)], { pageHeight: 500, minRows: 4 });
    expect(shape(pages)).toBe("0[0-22) | 0[22-26)");
  });
  it("tabla con keep que cabe en una página no se parte: pasa entera", () => {
    const b: PrintBlock[] = [{ height: 300 }, { ...table(10), keep: true }];
    expect(shape(paginatePrint(b, { pageHeight: 500 }))).toBe("0 | 1[0-10)");
  });
  it("tabla con keep más alta que una página se parte igual", () => {
    expect(paginatePrint([{ ...table(60), keep: true }], { pageHeight: 500 })).toHaveLength(3);
  });
  it("una fila más alta que la página va sola y el reparto sigue", () => {
    const b: PrintBlock = { height: 0, table: { head: 30, rows: [20, 900, 20, 20] } };
    const pages = paginatePrint([b], { pageHeight: 500 });
    expect(pages.flat().reduce((s, p) => s + p.to! - p.from!, 0)).toBe(4);
    expect(pages.some((p) => p[0].from === 1 && p[0].to === 2)).toBe(true);
  });
  it("una tabla sin filas es un bloque más", () => {
    expect(shape(paginatePrint([{ height: 0, table: { head: 30, rows: [] } }], { pageHeight: 500 }))).toBe("0[0-0)");
  });
  it("lo que sigue a una tabla partida continúa en su última página", () => {
    const pages = paginatePrint([table(30), { height: 100 }], { pageHeight: 500 });
    expect(shape(pages)).toBe("0[0-23) | 0[23-30) · 1");
  });
});

describe("paginatePrint: Van / Vienen", () => {
  it("cada página parcial termina en «Van» y la siguiente empieza en «Vienen», con sumas exactas", () => {
    const n = 60;
    const sums = Array.from({ length: n }, (_, i) => [1_000_000 + i * 12_345.67, 0.1]);
    const pages = paginatePrint([table(n, 20, { carry: 22, sums })], { pageHeight: 500 });
    let acc = [0, 0];
    for (let p = 0; p < pages.length; p++) {
      const piece = pages[p][0];
      if (p > 0) expect(piece.carryIn).toEqual(acc);
      else expect(piece.carryIn).toBeUndefined();
      const add = sums.slice(piece.from, piece.to).reduce((a, r) => [a[0] + Math.round(r[0] * 100), a[1] + Math.round(r[1] * 100)], [0, 0]);
      acc = [(Math.round(acc[0] * 100) + add[0]) / 100, (Math.round(acc[1] * 100) + add[1]) / 100];
      if (p < pages.length - 1) expect(piece.carryOut).toEqual(acc);
      else expect(piece.carryOut).toBeUndefined();
      // Encabezado + Vienen + filas + Van caben.
      const h = 30 + (p > 0 ? 22 : 0) + (piece.to! - piece.from!) * 20 + (p < pages.length - 1 ? 22 : 0);
      expect(h).toBeLessThanOrEqual(500);
    }
    // 0,1 × filas sin error de coma flotante.
    expect(pages[1][0].carryIn![1]).toBe(Number((pages[0][0].to! * 0.1).toFixed(2)));
  });
  it("sin columnas que sumen no hay filas de arrastre (ni se reserva su espacio)", () => {
    const pages = paginatePrint([table(60, 20, { carry: 22 })], { pageHeight: 500 });
    expect(pages[0][0].to).toBe(23);
    expect(pages[0][0].carryOut).toBeUndefined();
  });
  it("la tabla que cabe entera no lleva arrastre", () => {
    const pages = paginatePrint([table(5, 20, { carry: 22, sums: [[1], [2], [3], [4], [5]] })], { pageHeight: 500 });
    expect(pages[0][0].carryIn).toBeUndefined();
    expect(pages[0][0].carryOut).toBeUndefined();
  });
  it("valores raros cuentan como 0", () => {
    const pages = paginatePrint([table(30, 20, { carry: 20, sums: Array.from({ length: 30 }, (_, i) => (i === 3 ? [NaN] : [1])) })], { pageHeight: 400 });
    expect(pages[0][0].carryOut![0]).toBe(pages[0][0].to! - 1);
  });
});

describe("SSR", () => {
  it("el componente importa sin DOM", async () => {
    expect(typeof globalThis.HTMLElement).toBe("undefined");
    const mod = await import("../src/components/print/index");
    expect(typeof mod.NxPrint).toBe("function");
    expect(typeof mod.paginatePrint).toBe("function");
  });
});

describe("paginatePrint: rendimiento", () => {
  it("5.000 filas en tiempo lineal", () => {
    const run = (n: number) => {
      const sums = Array.from({ length: n }, (_, i) => [i * 1000, i]);
      const blocks: PrintBlock[] = [{ height: 120, keepWithNext: true }, table(n, 18, { carry: 20, sums }), { height: 200 }];
      const t0 = performance.now();
      const pages = paginatePrint(blocks, { pageHeight: 700 });
      return { ms: performance.now() - t0, pages };
    };
    run(5000); // calentar
    const small = run(5000);
    const big = run(50_000);
    expect(small.pages.flat().filter((p) => p.block === 1).reduce((s, p) => s + p.to! - p.from!, 0)).toBe(5000);
    expect(small.ms).toBeLessThan(50);
    // Diez veces las filas no puede costar cien veces el tiempo.
    expect(big.ms).toBeLessThan(Math.max(20, small.ms) * 30);
  });
});
