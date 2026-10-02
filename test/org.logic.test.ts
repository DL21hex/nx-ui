import { describe, expect, it } from "vitest";
import { buildIndex, chainOf, cleanPerson, cleanUnit, commonBoss, metricLevels, peersOf, reportsOf, teamSize, unitCount, unitLine, unitPath } from "../src/components/org/logic";
import type { OrgPerson, OrgUnit } from "../src/components/org/types";

const units: OrgUnit[] = [
  { id: "c1", name: "Agrovid", kind: "Empresa" },
  { id: "s1", name: "Finca La Esperanza", parent: "c1", kind: "Subdivisión" },
  { id: "s2", name: "Administración", parent: "c1", kind: "Subdivisión" },
];
const people: OrgPerson[] = [
  { id: "1", name: "Marta Ríos", title: "Gerente", unit: "s2" },
  { id: "2", name: "Laura Gómez", title: "Directora", unit: "s2", boss: "1" },
  { id: "3", name: "Pedro Ruiz", title: "Analista", unit: "s1", boss: "2" },
  { id: "4", name: "Sofía León", title: "Analista", unit: "s1", boss: "2" },
  { id: "5", name: "Ana Díaz", title: "Operaria", unit: "s1", boss: "3" },
  { id: "6", name: "Juan Mora", title: "Contador", unit: "s2", boss: "1" },
];
const ix = buildIndex(units, people);

describe("índice y cadenas", () => {
  it("la cadena hacia arriba, del jefe inmediato al más alto", () => {
    expect(chainOf(ix, "5").map((p) => p.id)).toEqual(["3", "2", "1"]);
    expect(chainOf(ix, "1")).toEqual([]);
  });

  it("un ciclo de jefes no cuelga", () => {
    const loop = buildIndex([], [
      { id: "a", name: "A", boss: "b" },
      { id: "b", name: "B", boss: "a" },
    ]);
    expect(chainOf(loop, "a").map((p) => p.id)).toEqual(["b"]);
  });

  it("pares, equipo y tamaño del equipo", () => {
    expect(peersOf(ix, "3").map((p) => p.id)).toEqual(["4"]);
    expect(reportsOf(ix, "2").map((p) => p.id)).toEqual(["3", "4"]);
    expect(teamSize(ix, ix.people.get("1")!)).toBe(5);
    expect(teamSize(ix, { id: "x", name: "X", team: 40 })).toBe(40);
  });

  it("limpia los datos: ids como texto y sin ser su propio jefe", () => {
    expect(cleanPerson({ id: 7, name: "Z", boss: 7 })).toMatchObject({ id: "7", boss: null });
    expect(cleanPerson({ name: "sin id" })).toBeNull();
    expect(cleanUnit({ id: 3, parent: 3, name: "U" })).toMatchObject({ id: "3", parent: "3" });
    // Una unidad que es su propio padre queda como raíz.
    expect(buildIndex([cleanUnit({ id: 3, parent: 3, name: "U" })!], []).childUnits.get("")?.[0].id).toBe("3");
  });
});

describe("unidades", () => {
  it("cuenta personas propias y de subunidades, o usa count", () => {
    expect(unitCount(ix, ix.units.get("c1")!)).toBe(6);
    expect(unitCount(ix, { id: "z", name: "Z", count: 120 })).toBe(120);
  });

  it("el camino y la línea de unidad", () => {
    expect(unitPath(ix, "s1").map((u) => u.id)).toEqual(["c1", "s1"]);
    expect(unitLine(ix, "s1")).toBe("Agrovid · Finca La Esperanza");
  });

  it("la intensidad de una cifra, absoluta o por persona", () => {
    const us: OrgUnit[] = [
      { id: "a", name: "A", count: 100, metrics: { r: 10 } },
      { id: "b", name: "B", count: 10, metrics: { r: 5 } },
      { id: "c", name: "C", count: 10 },
    ];
    const i2 = buildIndex(us, []);
    expect(metricLevels(i2, us, { key: "r", label: "R" }).get("a")).toBe(1);
    const per = metricLevels(i2, us, { key: "r", label: "R", per: "count" });
    expect(per.get("b")).toBe(1);
    expect(per.get("a")).toBeCloseTo(0.2);
    expect(per.get("c")).toBe(0);
  });
});

describe("el camino entre dos personas", () => {
  it("el jefe común y los niveles de cada lado", () => {
    expect(commonBoss(ix, "5", "6")).toMatchObject({ boss: { id: "1" }, up: 3, down: 1 });
    expect(commonBoss(ix, "3", "4")).toMatchObject({ boss: { id: "2" }, up: 1, down: 1 });
    expect(commonBoss(ix, "5", "2")).toMatchObject({ boss: { id: "2" }, up: 2, down: 0 });
  });

  it("sin línea conocida, null", () => {
    const i2 = buildIndex([], [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ]);
    expect(commonBoss(i2, "a", "b")).toBeNull();
  });
});
