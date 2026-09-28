import { describe, expect, it } from "vitest";
import { deltaParts, fillCount, formatField, groupRows, isHeavy, matchRow, meterTone, mixFor, parseLevel, sortRows, statusOf, stepLevel, weightRanks } from "../src/components/cards/logic";
import type { CardsField, CardsLayout, CardsRow } from "../src/components/cards/types";
import { nxFormat } from "../src/core/locale";

const fmt = nxFormat("es-CO");
const F: CardsField[] = [
  { key: "name", label: "Proveedor", sort: "asc" },
  { key: "city", label: "Ciudad", group: true },
  { key: "cat", label: "Categoría", group: true, search: true },
  { key: "state", label: "Estado", type: "status", group: true, options: [{ value: "bloqueado", label: "Bloqueado", tone: "danger" }, { value: "vence", label: "Póliza por vencer", tone: "warning" }, { value: "ok", label: "Al día", tone: "success", quiet: true }] },
  { key: "compras", label: "Compras en 12 meses", type: "money", currency: "COP", sort: "desc" },
  { key: "cumpl", label: "Entregas a tiempo", type: "percent", sort: "asc", good: 90, bad: 80 },
  { key: "rating", label: "Calificación", type: "rating" },
  { key: "lead", label: "Plazo", type: "number", unit: "días" },
  { key: "last", label: "Última orden", type: "date", sort: "desc" },
];
const FM = new Map(F.map((f) => [f.key, f]));
const LAYOUT: CardsLayout = { title: "name", subtitle: ["cat", "city"], status: "state", value: "compras" };
const ROWS: CardsRow[] = [
  { id: "a", name: "Ferrecaribe", city: "Barranquilla", cat: "Ferretería", state: "ok", compras: 900e6, cumpl: 96 },
  { id: "b", name: "Aceros Malambo", city: "Malambo", cat: "Obra gris", state: "vence", compras: 2100e6, cumpl: 88 },
  { id: "c", name: "Distri Sabana", city: "Bogotá", cat: "Obra gris", state: "bloqueado", compras: 300e6, cumpl: 71 },
  { id: "d", name: "Eléctricos del Norte", city: "Barranquilla", cat: "Eléctricos", state: "ok", compras: null, cumpl: 93 },
];

describe("niveles", () => {
  it("parseLevel y stepLevel sin salirse de los extremos", () => {
    expect(parseLevel("map")).toBe("map");
    expect(parseLevel("x")).toBe("cards");
    expect(stepLevel("cards", 1)).toBe("detail");
    expect(stepLevel("detail", 1)).toBe("detail");
    expect(stepLevel("cards", -3)).toBe("map");
    expect(stepLevel("map", -1)).toBe("map");
  });
});

describe("formatField", () => {
  it("formatea según el tipo, con el locale", () => {
    expect(formatField(FM.get("compras"), 1245000000, fmt)).toBe("$ 1.245.000.000");
    expect(formatField({ key: "x", label: "x", type: "money", currency: "COP", compact: true }, 1245000000, fmt)).toMatch(/M$/);
    expect(formatField(FM.get("cumpl"), 96, fmt)).toBe("96 %");
    expect(formatField(FM.get("rating"), 4.6, fmt)).toBe("★ 4,6");
    expect(formatField(FM.get("lead"), 5, fmt)).toBe("5 días");
    expect(formatField(FM.get("last"), "2026-09-12", fmt)).toMatch(/12 sept?\.? 2026/);
    expect(formatField(FM.get("state"), "vence", fmt)).toBe("Póliza por vencer");
    expect(formatField(FM.get("state"), "raro", fmt)).toBe("raro");
    expect(formatField(undefined, "texto", fmt)).toBe("texto");
    expect(formatField(FM.get("compras"), null, fmt)).toBe("");
    expect(formatField(undefined, { a: 1 }, fmt)).toBe("");
  });
  it("statusOf, deltaParts y meterTone", () => {
    expect(statusOf(FM.get("state"), "ok")).toMatchObject({ label: "Al día", quiet: true });
    expect(statusOf(FM.get("state"), "")).toBeNull();
    expect(deltaParts(12.4, fmt)).toEqual({ up: true, text: "▲ 12 %" });
    expect(deltaParts(-3.6, fmt)).toEqual({ up: false, text: "▼ 4 %" });
    expect(deltaParts("x", fmt)).toBeNull();
    expect(meterTone(96, FM.get("cumpl"))).toBe("success");
    expect(meterTone(85, FM.get("cumpl"))).toBe("warning");
    expect(meterTone(71, FM.get("cumpl"))).toBe("danger");
    expect(meterTone(71, FM.get("lead"))).toBeNull();
  });
});

describe("peso", () => {
  it("rango 0–1 por peso; sin peso cuenta como el menor", () => {
    const r = weightRanks(ROWS, "compras");
    expect(ROWS.map((row) => r.get(row))).toEqual([2 / 3, 1, 1 / 3, 0]);
    expect(weightRanks(ROWS, undefined).get(ROWS[1])).toBe(0);
    expect(mixFor(0)).toBe(14);
    expect(mixFor(1)).toBe(82);
    expect(mixFor(7)).toBe(82);
  });
  it("dos columnas: el 10 % más alto, con al menos 10 registros", () => {
    expect(isHeavy(0.95, 20)).toBe(true);
    expect(isHeavy(0.85, 20)).toBe(false);
    expect(isHeavy(1, 4)).toBe(false);
  });
});

describe("buscar, ordenar y agrupar", () => {
  it("busca sin tildes en título, subtítulo, estado y campos con search", () => {
    const m = (q: string) => ROWS.filter((r) => matchRow(r, q, FM, LAYOUT, fmt)).map((r) => r.id);
    expect(m("")).toEqual(["a", "b", "c", "d"]);
    expect(m("electricos")).toEqual(["d"]);
    expect(m("barranquilla")).toEqual(["a", "d"]);
    expect(m("poliza")).toEqual(["b"]);
    expect(m("obra gris")).toEqual(["b", "c"]);
    expect(m("zzz")).toEqual([]);
  });
  it("ordena por número, texto o estado; los vacíos al final; estable", () => {
    const ids = (rows: CardsRow[]) => rows.map((r) => r.id);
    expect(ids(sortRows(ROWS, FM.get("compras"), "desc", fmt))).toEqual(["b", "a", "c", "d"]);
    expect(ids(sortRows(ROWS, FM.get("compras"), "asc", fmt))).toEqual(["c", "a", "b", "d"]);
    expect(ids(sortRows(ROWS, FM.get("name"), "asc", fmt))).toEqual(["b", "c", "d", "a"]);
    expect(ids(sortRows(ROWS, FM.get("state"), "asc", fmt))).toEqual(["c", "b", "a", "d"]);
    expect(ids(sortRows(ROWS, undefined, "asc", fmt))).toEqual(["a", "b", "c", "d"]);
  });
  it("agrupa: estado en el orden de sus opciones, lo demás por peso; con totales", () => {
    const byState = groupRows(ROWS, FM.get("state"), LAYOUT, fmt);
    expect(byState.map((g) => [g.label, g.rows.length, g.total])).toEqual([
      ["Bloqueado", 1, 300e6],
      ["Póliza por vencer", 1, 2100e6],
      ["Al día", 2, 900e6],
    ]);
    const byCity = groupRows(ROWS, FM.get("city"), LAYOUT, fmt);
    expect(byCity.map((g) => g.label)).toEqual(["Malambo", "Barranquilla", "Bogotá"]);
    const none = groupRows(ROWS, undefined, LAYOUT, fmt);
    expect(none).toHaveLength(1);
    expect(none[0].label).toBe("");
    // Sin valor: «—» al final.
    const withEmpty = groupRows([...ROWS, { id: "e", name: "Sin ciudad", compras: 5e9 }], FM.get("city"), LAYOUT, fmt);
    expect(withEmpty.at(-1)!.label).toBe("—");
  });
  it("fillCount pone las variables", () => {
    expect(fillCount("{n} de {total}", { n: "3", total: "10" })).toBe("3 de 10");
    expect(fillCount("{x}", {})).toBe("{x}");
  });
});
