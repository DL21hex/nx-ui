import { describe, expect, it } from "vitest";
import { cleanItems, collapseCount, itemKey } from "../src/components/breadcrumb/logic";

describe("collapseCount", () => {
  // Cinco niveles de 100 (nombre 80 + separador 20) y un «…» de 30.
  const item = [100, 100, 100, 100, 100];
  const name = [80, 80, 80, 80, 80];

  it("no esconde nada si cabe", () => {
    expect(collapseCount(item, name, 30, 500)).toBe(0);
    expect(collapseCount(item, name, 30, 499.6)).toBe(0);
  });

  it("esconde lo justo: primero el nombre del nivel 1, después niveles enteros", () => {
    // k=1: 500 - 80 + 30 = 450.
    expect(collapseCount(item, name, 30, 450)).toBe(1);
    // k=2: 500 - 100 - 80 + 30 = 350.
    expect(collapseCount(item, name, 30, 400)).toBe(2);
    expect(collapseCount(item, name, 30, 350)).toBe(2);
  });

  it("nunca esconde el primero ni los dos últimos (el último se corta)", () => {
    expect(collapseCount(item, name, 30, 10)).toBe(2);
    expect(collapseCount([100, 100, 100], [80, 80, 80], 30, 10)).toBe(0);
    expect(collapseCount([], [], 30, 0)).toBe(0);
  });
});

describe("cleanItems", () => {
  it("se queda con los niveles válidos y descarta los href peligrosos", () => {
    const out = cleanItems([
      { label: "Personas", href: "/hcm", icon: "users", id: 7 },
      { label: "Malo", href: "javascript:alert(1)" },
      { href: "/sin-nombre" },
      null,
      "texto",
      { label: "Hoja", expandable: false, children: [{ label: "A", children: [{ label: "nieto" }] }, { nope: 1 }] },
    ]);
    expect(out).toEqual([
      { label: "Personas", href: "/hcm", icon: "users", id: "7" },
      { label: "Malo" },
      { label: "Hoja", expandable: false, children: [{ label: "A" }] },
    ]);
    expect(cleanItems("x")).toEqual([]);
  });

  it("un nombre numérico (un año) pasa a texto en vez de perder el nivel; expandable: true se conserva", () => {
    expect(cleanItems([{ label: "Contabilidad" }, { label: 2024, expandable: true }, { label: Number.NaN }, { label: "Enero", expandable: "sí" }])).toEqual([
      { label: "Contabilidad" },
      { label: "2024", expandable: true },
      { label: "Enero" },
    ]);
  });

  it("la clave es id, después href, después el nombre", () => {
    expect(itemKey({ id: "a", href: "/b", label: "c" })).toBe("a");
    expect(itemKey({ href: "/b", label: "c" })).toBe("/b");
    expect(itemKey({ label: "c" })).toBe("c");
  });
});
