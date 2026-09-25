// @vitest-environment happy-dom
//
// El panel de hijos con datos del backend mal formados: hijos `null`, etiquetas numéricas o
// ausentes. Antes rompía al abrir el flotante o al escribir en su buscador.
import { describe, expect, it } from "vitest";
import { renderChildPanel } from "../src/components/sidemenu/flyout";
import { filterItems } from "../src/components/sidemenu/logic";
import { DEFAULT_LABELS, type MenuItem } from "../src/index";

const BAD = {
  id: "p",
  label: 42,
  description: 7,
  children: [null, "texto", { id: "a", label: 2026, href: "/a" }, { id: "b", href: "/b" }, { id: "c", label: "Cuentas", description: 99, href: "/c" }, { id: "d", label: "Datos", href: "/d" }],
} as unknown as MenuItem;

describe("panel de hijos con datos mal formados", () => {
  it("ignora lo que no es un objeto y convierte etiquetas y descripciones a texto", () => {
    const { el, input } = renderChildPanel({ item: BAD, active: null, labels: DEFAULT_LABELS, idPrefix: "x", keyOf: (c) => c.id, autofocus: false });
    expect(el.querySelector(".nx-panel__title")!.textContent).toBe("42");
    expect([...el.querySelectorAll(".nx-panel__option .nx-panel__label")].map((x) => x.textContent)).toEqual(["2026", "", "Cuentas", "Datos"]);
    // Escribir en el buscador no lanza con etiquetas numéricas o ausentes.
    input!.value = "99";
    expect(() => input!.dispatchEvent(new Event("input"))).not.toThrow();
    expect([...el.querySelectorAll(".nx-panel__option .nx-panel__label")].map((x) => x.textContent)).toEqual(["Cuentas"]);
    expect(input!.hasAttribute("data-nx-ephemeral")).toBe(true);
  });

  it("filterItems tolera hijos nulos y etiquetas que no son texto", () => {
    const items = [null, { label: 5 }, { label: "Cinco" }] as unknown as MenuItem[];
    expect(filterItems(items, "")).toHaveLength(2);
    expect(filterItems(items, "5")).toEqual([{ label: 5 }]);
  });
});
