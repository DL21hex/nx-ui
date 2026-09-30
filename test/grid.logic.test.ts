import { describe, expect, it } from "vitest";
import { nxFormat } from "../src/core/locale";
import {
  applyFilters,
  compact,
  crossfilter,
  facetColumns,
  facets,
  filterLabel,
  formatCell,
  groupRows,
  parseInput,
  parseNumber,
  parseTSV,
  sortRows,
  stats,
  toggleFacet,
  toTSV,
  fromSelection,
  relRange,
  resolveRel,
  selection,
} from "../src/components/grid/logic";
import { histogram, histogramSpec, niceEdges } from "../src/components/grid/bars";
import { excludeValue, parseAmount } from "../src/components/grid/grid-filter";
import { parseNL } from "../src/components/grid/nl";
import { colName, crc32, excelDate, sheetXml, xmlText } from "../src/components/grid/xlsx";
import type { GridColumn, GridFilter, GridRow } from "../src/components/grid/types";

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "prov", label: "Proveedor" },
  { key: "fecha", label: "Fecha", type: "date" },
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pend", label: "Pendiente", tone: "warning" }, { value: "apr", label: "Aprobado" }, { value: "anu", label: "Anulado" }] },
  { key: "monto", label: "Monto", type: "money", editable: true },
  { key: "atraso", label: "Atraso", type: "number" },
];
const ROWS: GridRow[] = [
  { oc: "OC-1", prov: "Aceros del Caribe", fecha: "2026-03-05", estado: "pend", monto: 8_200_000, atraso: 4 },
  { oc: "OC-2", prov: "Empaques Andinos", fecha: "2026-03-20", estado: "apr", monto: 1_500_000, atraso: 0 },
  { oc: "OC-3", prov: "Aceros del Caribe", fecha: "2026-04-02", estado: "pend", monto: 450_000, atraso: 9 },
  { oc: "OC-4", prov: "Químicos SA", fecha: "2026-01-15", estado: "anu", monto: 6_000_000, atraso: 0 },
];

describe("valores", () => {
  it("parseNumber entiende es-CO y el formato inglés", () => {
    expect(parseNumber("1.234.567")).toBe(1234567);
    expect(parseNumber("1.234,5")).toBe(1234.5);
    expect(parseNumber("$ 12")).toBe(12);
    expect(parseNumber("1234.5")).toBe(1234.5);
    expect(parseNumber("abc")).toBeNull();
  });

  it("formatCell por tipo", () => {
    expect(formatCell(8_200_000, COLS[4])).toBe("$ 8.200.000");
    expect(formatCell("2026-03-05", COLS[2])).toBe("5 mar 2026");
    expect(formatCell("pend", COLS[3])).toBe("Pendiente");
    expect(formatCell(null, COLS[0])).toBe("");
  });

  it("parseInput convierte lo escrito al tipo de la columna", () => {
    expect(parseInput("1.500.000", COLS[4])).toBe(1500000);
    expect(parseInput("aprobado", COLS[3])).toBe("apr");
  });

  it("compact", () => {
    expect(compact(8_200_000)).toBe("8,2 M");
    expect(compact(450_000)).toBe("450 k");
  });
});

describe("filtros y orden", () => {
  it("in, notIn, range (números y fechas) y contains", () => {
    expect(applyFilters(ROWS, [{ key: "estado", op: "in", values: ["pend"] }]).map((r) => r.oc)).toEqual(["OC-1", "OC-3"]);
    expect(applyFilters(ROWS, [{ key: "estado", op: "notIn", values: ["anu"] }])).toHaveLength(3);
    expect(applyFilters(ROWS, [{ key: "monto", op: "range", min: 1_000_000, max: 7_000_000 }]).map((r) => r.oc)).toEqual(["OC-2", "OC-4"]);
    expect(applyFilters(ROWS, [{ key: "fecha", op: "range", min: "2026-03-01", max: "2026-04-01" }]).map((r) => r.oc)).toEqual(["OC-1", "OC-2"]);
    expect(applyFilters(ROWS, [{ key: "prov", op: "contains", value: "quimicos" }]).map((r) => r.oc)).toEqual(["OC-4"]);
  });

  it("sortRows: números, el orden de las opciones, y estable", () => {
    expect(sortRows(ROWS, { key: "monto", dir: -1 }, COLS).map((r) => r.oc)).toEqual(["OC-1", "OC-4", "OC-2", "OC-3"]);
    expect(sortRows(ROWS, { key: "estado", dir: 1 }, COLS).map((r) => r.oc)).toEqual(["OC-1", "OC-3", "OC-2", "OC-4"]);
  });

  it("filterLabel", () => {
    expect(filterLabel({ key: "estado", op: "in", values: ["pend", "apr"] }, COLS[3])).toBe("Estado: Pendiente, Aprobado");
    expect(filterLabel({ key: "fecha", op: "range", min: "2026-03-01", max: "2026-04-01" }, COLS[2])).toBe("Fecha: mar 2026");
    // Un tramo que no empieza el día 1 no es «un mes».
    expect(filterLabel({ key: "fecha", op: "range", min: "2026-09-24", max: "2026-10-24" }, COLS[2])).toBe("Fecha: 24 sept 2026 – 23 oct 2026");
    expect(filterLabel({ key: "monto", op: "range", min: 5_000_001 }, COLS[4])).toBe("Monto ≥ $5 M");
  });
});

describe("histogramas", () => {
  it("niceEdges: lineal 1-2-5, o logarítmico si hay varios órdenes de magnitud", () => {
    expect(niceEdges(0, 9, 10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const log = niceEdges(150_000, 40_000_000);
    expect(log[0]).toBe(100_000);
    expect(log[log.length - 1]).toBeGreaterThan(40_000_000);
    expect(log).toContain(1_000_000);
  });

  it("categorías con conteo total y filtrado", () => {
    const spec = histogramSpec(COLS[3], ROWS)!;
    const h = histogram(spec, ROWS, applyFilters(ROWS, [{ key: "monto", op: "range", min: 1_000_000 }]));
    expect(h.kind).toBe("categories");
    expect(h.labels).toEqual(["Pendiente", "Aprobado", "Anulado"]);
    expect(h.counts).toEqual([2, 1, 1]);
    expect(h.filtered).toEqual([1, 1, 1]);
  });

  it("fechas por mes, con bordes ISO para filtrar", () => {
    const spec = histogramSpec(COLS[2], ROWS)!;
    expect(spec.labels).toEqual(["ene 2026", "mar 2026", "abr 2026"]);
    expect(spec.edges![1]).toBe("2026-03-01");
  });

  it("sin histograma: texto con muchos valores o columnas de IA", () => {
    expect(histogramSpec(COLS[0], ROWS)).toBeNull();
    expect(histogramSpec({ key: "x", label: "X", ai: { prompt: "p" } }, ROWS)).toBeNull();
  });
});

describe("grupos, estadísticas y TSV", () => {
  it("groupRows con subtotales", () => {
    const g = groupRows(ROWS, COLS[1], COLS);
    expect(g[0].label).toBe("Aceros del Caribe");
    expect(g[0].rows).toHaveLength(2);
    expect(g[0].sums.monto).toBe(8_650_000);
    expect(groupRows(ROWS, COLS[2], COLS).map((x) => x.label)).toEqual(["ene 2026", "mar 2026", "abr 2026"]);
  });

  it("stats", () => {
    expect(stats([2, 4, 6])).toEqual({ count: 3, sum: 12, avg: 4, min: 2, max: 6 });
    expect(stats([])).toBeNull();
  });

  it("TSV de ida y vuelta, con comillas de Excel", () => {
    const m = [["a", "b\tc"], ['d"e', "f\ng"]];
    expect(parseTSV(toTSV(m))).toEqual(m);
    expect(parseTSV("1\t2\r\n3\t4\r\n")).toEqual([["1", "2"], ["3", "4"]]);
  });
});

describe("facetas (la regla de nx32)", () => {
  it("facetColumns: status y texto con pocas opciones; no números, fechas ni identificadores", () => {
    expect(facetColumns(COLS, ROWS).map((c) => c.key)).toEqual(["prov", "estado"]);
  });

  it("cada opción se cuenta sin su propia faceta; entre facetas se restringe", () => {
    const filters = toggleFacet(toggleFacet([], "estado", "pend"), "prov", "Aceros del Caribe");
    const [prov, estado] = facets([COLS[1], COLS[3]], ROWS, filters);
    // Estado cuenta con el filtro de proveedor (Aceros) pero no con el suyo.
    expect(estado.options.map((o) => [o.value, o.count])).toEqual([["pend", 2], ["apr", 0], ["anu", 0]]);
    expect(estado.selected).toEqual(["pend"]);
    // Proveedor cuenta con estado=pend.
    expect(prov.options.find((o) => o.value === "Aceros del Caribe")!.count).toBe(2);
    expect(prov.options.find((o) => o.value === "Químicos SA")!.count).toBe(0);
  });

  it("toggleFacet agrega, quita y elimina el filtro vacío", () => {
    let f = toggleFacet([], "estado", "pend");
    f = toggleFacet(f, "estado", "apr");
    expect(f).toEqual([{ key: "estado", op: "in", values: ["pend", "apr"] }]);
    f = toggleFacet(toggleFacet(f, "estado", "pend"), "estado", "apr");
    expect(f).toEqual([]);
  });
});

describe("lenguaje natural", () => {
  const nl = (q: string) => parseNL(q, COLS, ROWS);

  it("estados en plural, meses y «más de N millones»", () => {
    const { filters, unknown } = nl("pedidos pendientes de marzo de más de 5 millones");
    expect(filters).toContainEqual({ key: "estado", op: "in", values: ["pend"] });
    expect(filters).toContainEqual({ key: "fecha", op: "range", min: "2026-03-01", max: "2026-04-01" });
    expect(filters).toContainEqual({ key: "monto", op: "range", min: 5_000_001 });
    expect(unknown).toEqual(["pedidos"]);
  });

  it("la columna nombrada antes de la comparación gana («atraso mayor a 3»)", () => {
    expect(nl("atraso mayor a 3").filters).toEqual([{ key: "atraso", op: "range", min: 4 }]);
  });

  it("«entre», categorías por su primera palabra y negación", () => {
    const { filters } = nl("de aceros entre 1 y 2 millones sin anulados");
    expect(filters).toContainEqual({ key: "monto", op: "range", min: 1_000_000, max: 2_000_000 });
    expect(filters).toContainEqual({ key: "prov", op: "in", values: ["Aceros del Caribe"] });
    expect(filters).toContainEqual({ key: "estado", op: "notIn", values: ["anu"] });
  });

  it("una etiqueta de varias palabras cuenta entera como entendida", () => {
    const cols: GridColumn[] = [{ key: "estado", label: "Estado", type: "status", options: [{ value: "prueba", label: "Período de prueba" }, { value: "activo", label: "Activo" }] }];
    expect(parseNL("en período de prueba", cols, [])).toEqual({ filters: [{ key: "estado", op: "in", values: ["prueba"] }], unknown: [] });
  });

  it("texto entre comillas es «contiene»; lo que no entiende se devuelve", () => {
    expect(nl('«OC-3»').filters).toEqual([{ key: "oc", op: "contains", value: "OC-3" }]);
    expect(nl("urgentes del cliente").unknown).toEqual(["urgentes", "cliente"]);
  });
});

describe("xlsx", () => {
  it("crc32, nombres de columna y fechas de Excel", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
    expect(excelDate("2026-03-05")).toBe(46086);
  });

  it("la hoja: cabecera en negrita, números como números, fechas como serie, texto escapado", () => {
    const xml = sheetXml(["Pedido", "Monto", "Fecha"], [["<OC-1>", 8200000, "2026-03-05"]], ["text", "money", "date"], [12, 14, 12]);
    expect(xml).toContain('<c r="A1" t="inlineStr" s="1">');
    expect(xml).toContain('<c r="B2" s="3"><v>8200000</v></c>');
    expect(xml).toContain('<c r="C2" s="2"><v>46086</v></c>');
    expect(xml).toContain("&lt;OC-1&gt;");
    expect(xml).toContain('<autoFilter ref="A1:C2"/>');
    expect(xmlText("a\u0001b")).toBe("ab");
  });
});

describe("locale (nxFormat)", () => {
  it("números, compactos, fechas y montos según el locale", () => {
    const en = nxFormat("en-US");
    expect(formatCell(1234567.5, { key: "n", label: "N", type: "number" }, en)).toBe("1,234,567.5");
    expect(en.compact(8_200_000)).toBe("8.2M");
    expect(en.date("2026-03-12")).toBe("Mar 12, 2026");
    expect(nxFormat("es-CO").date("2026-03")).toBe("mar 2026");
    expect(nxFormat("pt-BR").date("2026-03-12")).toBe("12 mar. 2026");
    // `currency` ISO usa el formato de moneda del locale; un símbolo, el de siempre.
    expect(en.money(8_200_000, { currency: "USD" })).toBe("$8,200,000");
    expect(nxFormat("es-CO").money(8_200_000, { currency: "COP" })).toBe("$ 8.200.000");
    expect(nxFormat("de-DE").money(1500, { currency: "EUR" })).toBe("1.500 €");
    expect(en.money(1500, { currency: "US$" })).toBe("US$ 1,500");
  });

  it("lo que se escribe se lee con el separador decimal del locale", () => {
    const col: GridColumn = { key: "m", label: "M", type: "money" };
    expect(parseInput("1,234.5", col, nxFormat("en-US"))).toBe(1234.5);
    expect(parseInput("1.234,5", col, nxFormat("de-DE"))).toBe(1234.5);
    expect(parseInput("1.500", col, nxFormat("es-CO"))).toBe(1500);
    expect(parseInput("1.500", col, nxFormat("en-US"))).toBe(1.5);
  });

  it("un locale inválido cae en es-CO", () => {
    expect(nxFormat("no_es_un_locale!!").locale).toBe("es-CO");
  });

  it("el orden de texto ignora tildes y mayúsculas y compara números naturalmente", () => {
    const rows = ["OC-10", "oc-9", "Árbol", "arco", "Zeta"].map((x) => ({ x }));
    const out = sortRows(rows, { key: "x", dir: 1 }, [{ key: "x", label: "X" }]).map((r) => r.x);
    expect(out).toEqual(["Árbol", "arco", "oc-9", "OC-10", "Zeta"]);
  });
});

describe("crossfilter: una pasada, mismo resultado que filtrar faceta por faceta", () => {
  it("coincide con el cálculo directo en datos al azar", () => {
    let seed = 3;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const cols: GridColumn[] = [{ key: "a", label: "A" }, { key: "b", label: "B" }, { key: "c", label: "C" }];
    const rows = Array.from({ length: 400 }, () => ({ a: pick(["x", "y", "z"]), b: pick(["p", "q"]), c: pick(["1", "2", "3", "4"]), n: Math.floor(rnd() * 100) }));
    const filters: GridFilter[] = [
      { key: "a", op: "in", values: ["x", "y"] },
      { key: "b", op: "notIn", values: ["q"] },
      { key: "n", op: "range", min: 20, max: 80 },
      { key: "n", op: "range", min: 10 },
    ];
    const { filtered, facets: fs } = crossfilter(rows, filters, cols);
    expect(filtered).toEqual(applyFilters(rows, filters));
    for (const f of fs) {
      const base = applyFilters(rows, filters.filter((x) => x.key !== f.key));
      for (const o of f.options) expect(o.count).toBe(base.filter((r) => String(r[f.key as "a"]) === o.value).length);
    }
  });

  it("sin filtros devuelve el mismo arreglo (los histogramas lo aprovechan)", () => {
    const rows = [{ a: "x" }, { a: "y" }];
    expect(crossfilter(rows, [], []).filtered).toBe(rows);
  });
});

describe("filtro por columna", () => {
  it("relRange: tramos relativos a hoy, con `max` excluido", () => {
    expect(relRange("past", "2026-09-29")).toEqual({ max: "2026-09-29" });
    expect(relRange("last30", "2026-09-29")).toEqual({ min: "2026-08-30", max: "2026-09-30" });
    expect(relRange("next30", "2026-09-29")).toEqual({ min: "2026-09-29", max: "2026-10-30" });
    expect(relRange("month", "2026-12-05")).toEqual({ min: "2026-12-01", max: "2027-01-01" });
    expect(relRange("lastMonth", "2026-01-15")).toEqual({ min: "2025-12-01", max: "2026-01-01" });
    expect(relRange("year", "2026-09-29")).toEqual({ min: "2026-01-01", max: "2027-01-01" });
  });

  it("resolveRel recalcula con hoy; un `rel` desconocido deja el tramo fijo", () => {
    const out = resolveRel(
      [
        { key: "f", op: "range", rel: "month", min: "2020-01-01", max: "2020-02-01" },
        { key: "g", op: "range", rel: "otro" as "month", min: "2026-01-01" },
        { key: "h", op: "in", values: ["a"] },
      ],
      "2026-09-29",
    );
    expect(out).toEqual([
      { key: "f", op: "range", rel: "month", min: "2026-09-01", max: "2026-10-01" },
      { key: "g", op: "range", min: "2026-01-01" },
      { key: "h", op: "in", values: ["a"] },
    ]);
  });

  it("selection y fromSelection: todo marcado no filtra; más de la mitad es exclusión", () => {
    const vals = ["a", "b", "c", "d"];
    expect(selection([], "k", vals)).toBeNull();
    expect([...selection([{ key: "k", op: "notIn", values: ["b"] }], "k", vals)!]).toEqual(["a", "c", "d"]);
    expect(fromSelection("k", new Set(vals), vals)).toEqual([]);
    expect(fromSelection("k", new Set(["a", "b", "c"]), vals)).toEqual([{ key: "k", op: "notIn", values: ["d"] }]);
    expect(fromSelection("k", new Set(["a", "b", "c"]), vals, false)).toEqual([{ key: "k", op: "in", values: ["a", "b", "c"] }]);
    expect(fromSelection("k", new Set(["b", "a"]), vals)).toEqual([{ key: "k", op: "in", values: ["a", "b"] }]);
  });

  it("excludeValue quita el valor de un `in` o lo suma al `notIn`", () => {
    expect(excludeValue([], "k", "a")).toEqual([{ key: "k", op: "notIn", values: ["a"] }]);
    expect(excludeValue([{ key: "k", op: "notIn", values: ["a"] }], "k", "b")).toEqual([{ key: "k", op: "notIn", values: ["a", "b"] }]);
    expect(excludeValue([{ key: "k", op: "in", values: ["a", "b"] }], "k", "a")).toEqual([{ key: "k", op: "in", values: ["b"] }]);
  });

  it("toggleFacet parte de lo que deja una exclusión", () => {
    const vals = ["a", "b", "c"];
    expect(toggleFacet([{ key: "k", op: "notIn", values: ["c"] }], "k", "b", vals)).toEqual([{ key: "k", op: "in", values: ["a"] }]);
    expect(toggleFacet([{ key: "k", op: "notIn", values: ["c"] }], "k", "c", vals)).toEqual([]);
  });

  it("parseAmount: como sale natural", () => {
    expect(parseAmount("5.000.000")).toBe(5_000_000);
    expect(parseAmount("$ 5 M")).toBe(5_000_000);
    expect(parseAmount("2,5 millones")).toBe(2_500_000);
    expect(parseAmount("450 mil")).toBe(450_000);
    expect(parseAmount("450k")).toBe(450_000);
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("m")).toBeNull();
  });

  it("filterLabel: tramos relativos con su nombre; sin valores, una raya", () => {
    expect(filterLabel({ key: "fecha", op: "range", rel: "month", min: "2026-09-01", max: "2026-10-01" }, COLS[2], undefined, { month: "Este mes" })).toBe("Fecha: este mes");
    expect(filterLabel({ key: "fecha", op: "range", max: "2026-09-29" }, COLS[2])).toBe("Fecha ≤ 28 sept 2026");
    expect(filterLabel({ key: "estado", op: "in", values: [] }, COLS[3])).toBe("Estado: —");
  });
});
