import { describe, expect, it } from "vitest";
import {
  buildOrders,
  changesOf,
  choiceList,
  cleanChoices,
  cleanCriteria,
  cleanEvent,
  cleanItems,
  cleanQuotes,
  cleanStrings,
  cleanSuppliers,
  contributions,
  fill,
  flagSig,
  gridMove,
  lineTotal,
  nextIndex,
  parseEvent,
  qkey,
  shares,
  totalOf,
} from "../src/components/award/logic";

const ITEMS = cleanItems([
  { id: "a", name: "Tubo", qty: 240, unit: "und" },
  { id: "b", name: "Cable", qty: 1500 },
  { id: "c", name: "Breaker", qty: 3 },
]);
const SUPPLIERS = cleanSuppliers([
  { id: "p1", name: "Ferrex" },
  { id: "p2", name: "Induma" },
]);
const QUOTES = cleanQuotes([
  { item: "a", supplier: "p1", price: 18500 },
  { item: "a", supplier: "p2", price: 17900 },
  { item: "b", supplier: "p2", price: 3200.1 },
  { item: "c", supplier: "p1", price: 0.1 },
]);

describe("validar", () => {
  it("proveedores y artículos: id y nombre, sin repetir; cantidad por defecto 1", () => {
    expect(cleanSuppliers([{ id: 1, name: "A", onclick: "x" }, { id: "1", name: "B" }, { name: "sin id" }, null, "x"])).toEqual([{ id: "1", name: "A", detail: undefined, alert: undefined }]);
    const items = cleanItems([{ id: "x", name: "X", qty: "-3" }, { id: "y", name: "Y", qty: "12.5", code: 77, group: "Eléctricos" }, { id: "x", name: "otra" }]);
    expect(items.map((i) => [i.id, i.qty, i.code, i.group])).toEqual([
      ["x", 1, undefined, undefined],
      ["y", 12.5, "77", "Eléctricos"],
    ]);
    // Un atributo JSON también sirve.
    expect(cleanItems('[{"id":"z","name":"Z","qty":2}]')[0].qty).toBe(2);
    expect(cleanItems("{no es json")).toEqual([]);
  });

  it("cotizaciones: precio finito y no negativo; la última gana; plazo solo si es válido", () => {
    const q = cleanQuotes([
      { item: "a", supplier: "p1", price: "100", leadTime: "5" },
      { item: "a", supplier: "p1", price: 90, leadTime: -2, original: "US$ 1 la caja" },
      { item: "a", supplier: "p2", price: -1 },
      { item: "a", supplier: "p3", price: "caro" },
      { item: "a", price: 5 },
    ]);
    expect([...q.keys()]).toEqual([qkey("a", "p1")]);
    expect(q.get(qkey("a", "p1"))).toEqual({ item: "a", supplier: "p1", price: 90, leadTime: undefined, original: "US$ 1 la caja", note: undefined });
  });

  it("criterios, elecciones y listas de textos", () => {
    expect(cleanCriteria([{ id: "precio", label: "Precio", weight: 0.55 }, { id: "plazo", label: "Plazo", weight: -1 }, { id: "precio", label: "otra" }])).toEqual([
      { id: "precio", label: "Precio", weight: 0.55 },
      { id: "plazo", label: "Plazo", weight: 1 },
    ]);
    const ch = cleanChoices([{ item: "a", supplier: "p1", reason: " " }, { item: "a", supplier: "p2", reason: "Calidad" }, { item: "b" }]);
    expect([...ch]).toEqual([["a", { supplier: "p2", reason: "Calidad" }]]);
    expect(choiceList(new Map([["a", { supplier: "p2" }], ["b", { supplier: "p1", reason: "Plazo" }]]))).toEqual([
      { item: "a", supplier: "p2" },
      { item: "b", supplier: "p1", reason: "Plazo" },
    ]);
    expect(cleanStrings(["p1", " p2 ", "p1", "", 3, null])).toEqual(["p1", "p2", "3"]);
  });
});

describe("eventos", () => {
  it("recommend con ranking y puntajes por criterio; lo inválido se descarta", () => {
    const ev = cleanEvent({ type: "recommend", item: "a", supplier: "p2", reason: "El más barato", ranking: [{ supplier: "p2", score: "86.4", scores: { precio: 91, plazo: "x" } }, { supplier: "p1", score: 80 }, { supplier: "p2", score: 1 }, { score: 5 }] });
    expect(ev).toEqual({ type: "recommend", item: "a", supplier: "p2", reason: "El más barato", ranking: [{ supplier: "p2", score: 86.4, scores: { precio: 91 } }, { supplier: "p1", score: 80, scores: undefined }] });
    expect(cleanEvent({ type: "recommend", item: "a" })).toEqual({ type: "recommend", item: "a", supplier: null, reason: undefined, ranking: [] });
    expect(cleanEvent({ type: "recommend" })).toBeNull();
  });

  it("flag (ámbar por defecto), scenario, note, error y done", () => {
    expect(cleanEvent({ type: "flag", item: "a", supplier: "p1", message: "Atípico" })).toEqual({ type: "flag", item: "a", supplier: "p1", message: "Atípico", tone: "warning" });
    expect(cleanEvent({ type: "flag", item: "a", message: "x", tone: "danger" })!).toMatchObject({ tone: "danger" });
    expect(cleanEvent({ type: "flag", item: "a" })).toBeNull();
    expect(cleanEvent({ type: "scenario", id: "max3", label: "Máximo 3", picks: { a: "p1", b: 7, c: null } })).toEqual({ type: "scenario", id: "max3", label: "Máximo 3", detail: undefined, picks: { a: "p1", b: "7" } });
    expect(cleanEvent({ type: "scenario", id: "x", label: "X" })).toBeNull();
    expect(cleanEvent({ type: "note", message: "Hola", tone: "rara" })).toEqual({ type: "note", message: "Hola", tone: "neutral" });
    expect(cleanEvent({ type: "error", message: "Falló" })).toEqual({ type: "error", message: "Falló" });
    expect(cleanEvent({ type: "otro" })).toBeNull();
    expect(parseEvent("[DONE]")).toEqual({ type: "done" });
    expect(parseEvent('{"type":"done"}')).toEqual({ type: "done" });
    expect(parseEvent("{roto")).toBeNull();
    expect(parseEvent(null)).toBeNull();
  });
});

describe("cuentas", () => {
  it("totales sin arrastrar decimales, y cuántas órdenes", () => {
    expect(lineTotal(QUOTES.get(qkey("c", "p1")), ITEMS[2])).toBe(0.3);
    expect(lineTotal(undefined, ITEMS[0])).toBe(0);
    expect(totalOf(ITEMS, { a: "p2", b: "p2", c: "p1" }, QUOTES)).toEqual({ total: 17900 * 240 + 3200.1 * 1500 + 0.3, suppliers: 2 });
    // Un proveedor sin cotización en ese artículo no cuenta.
    expect(totalOf(ITEMS, { a: "p2", b: "p1" }, QUOTES)).toEqual({ total: 17900 * 240, suppliers: 1 });
  });

  it("órdenes por proveedor en el orden de las columnas, con lo que quedó sin adjudicar", () => {
    const { orders, total, unassigned } = buildOrders(ITEMS, SUPPLIERS, { a: "p2", c: "p1", b: "p9" }, QUOTES);
    expect(orders.map((o) => o.supplier)).toEqual(["p1", "p2"]);
    expect(orders[1]).toEqual({ supplier: "p2", lines: [{ item: "a", qty: 240, price: 17900, total: 4296000 }], total: 4296000 });
    expect(total).toBe(4296000.3);
    expect(unassigned).toEqual(["b"]);
  });

  it("cambios: solo donde hay sugerencia y la elección se aparta, con su costo", () => {
    const rec = (i: string) => ({ a: "p2", b: "p2", c: null })[i] ?? null;
    const choices = new Map([
      ["a", { supplier: "p1", reason: "Calidad" }],
      ["b", { supplier: "p2" }],
      ["c", { supplier: "p1" }],
    ]);
    expect(changesOf(ITEMS, choices, rec, QUOTES)).toEqual([{ item: "a", supplier: "p1", recommended: "p2", reason: "Calidad", delta: (18500 - 17900) * 240 }]);
  });
});

describe("pesos", () => {
  const C = cleanCriteria([
    { id: "precio", label: "Precio", weight: 55 },
    { id: "plazo", label: "Plazo", weight: 30 },
    { id: "calidad", label: "Calidad", weight: 15 },
  ]);
  it("se reparten sobre la suma; en cero, a partes iguales", () => {
    expect(shares(C, {})).toEqual({ precio: 0.55, plazo: 0.3, calidad: 0.15 });
    expect(shares(C, { precio: 0, plazo: 0, calidad: 0 })).toEqual({ precio: 1 / 3, plazo: 1 / 3, calidad: 1 / 3 });
    expect(shares(C, { precio: 50, plazo: 50, calidad: 0 })).toEqual({ precio: 0.5, plazo: 0.5, calidad: 0 });
  });
  it("el aporte de cada criterio al puntaje", () => {
    const parts = contributions({ supplier: "p1", score: 90, scores: { precio: 100, plazo: 50, calidad: 200 } }, C, shares(C, {}))!;
    expect(parts.map((p) => Math.round(p * 100) / 100)).toEqual([55, 15, 15]);
    expect(contributions({ supplier: "p1", score: 90 }, C, shares(C, {}))).toBeNull();
    expect(contributions({ supplier: "p1", score: 90, scores: { otro: 3 } }, C, shares(C, {}))).toBeNull();
  });
});

describe("grilla", () => {
  it("flechas, Inicio/Fin (con Ctrl, de la grilla) y páginas, sin salirse", () => {
    expect(gridMove("ArrowDown", 0, 2, 5, 4)).toEqual([1, 2]);
    expect(gridMove("ArrowUp", 0, 2, 5, 4)).toEqual([0, 2]);
    expect(gridMove("ArrowRight", 3, 3, 5, 4)).toEqual([3, 3]);
    expect(gridMove("ArrowLeft", 3, 1, 5, 4)).toEqual([3, 0]);
    expect(gridMove("Home", 3, 2, 5, 4)).toEqual([3, 0]);
    expect(gridMove("End", 3, 0, 5, 4, true)).toEqual([4, 3]);
    expect(gridMove("Home", 3, 2, 5, 4, true)).toEqual([0, 0]);
    expect(gridMove("PageDown", 1, 1, 30, 4)).toEqual([11, 1]);
    expect(gridMove("PageUp", 4, 1, 30, 4)).toEqual([0, 1]);
    expect(gridMove("a", 0, 0, 5, 4)).toBeNull();
    expect(gridMove("ArrowDown", 0, 0, 0, 4)).toBeNull();
  });
  it("la siguiente posición que cumple, dando la vuelta", () => {
    const ok = (i: number) => i === 1 || i === 4;
    expect(nextIndex(6, -1, 1, ok)).toBe(1);
    expect(nextIndex(6, 1, 1, ok)).toBe(4);
    expect(nextIndex(6, 4, 1, ok)).toBe(1);
    expect(nextIndex(6, 1, -1, ok)).toBe(4);
    expect(nextIndex(6, -1, -1, ok)).toBe(4);
    expect(nextIndex(6, -1, -1, (i) => i === 5)).toBe(5);
    expect(nextIndex(6, 0, 1, () => false)).toBe(-1);
    expect(nextIndex(0, 0, 1, () => true)).toBe(-1);
  });
  it("firma de las alertas y plantillas", () => {
    expect(flagSig("a", [{ item: "a", message: "x", tone: "warning" }])).not.toBe(flagSig("a", [{ item: "a", supplier: "p1", message: "x", tone: "warning" }]));
    expect(fill("{n} de {total}", { n: 2 })).toBe("2 de {total}");
  });
});
