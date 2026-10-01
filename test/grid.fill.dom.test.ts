// @vitest-environment happy-dom
// Las líneas de las columnas hasta el fondo de <nx-grid>: un relleno con las mismas columnas detrás de
// las filas. Que se alinee y no agregue scroll lo prueba e2e/grid.spec.ts; aquí, el DOM.
import { describe, expect, it } from "vitest";
import "../src/components/grid/index";
import type { GridColumn, NxGrid } from "../src/components/grid/index";

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "prov", label: "Proveedor" },
  { key: "monto", label: "Monto", type: "money" },
];
const ROWS = [
  { id: "1", oc: "OC-1", prov: "Aceros", monto: 1 },
  { id: "2", oc: "OC-2", prov: "Empaques", monto: 2 },
];

function mount(attrs = ""): NxGrid {
  document.body.innerHTML = `<nx-grid ${attrs}></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = COLS;
  el.rows = ROWS;
  return el;
}
const fill = (el: NxGrid) => el.querySelector<HTMLElement>(".nx-grid__fill")!;

describe("nx-grid: líneas de las columnas hasta el fondo", () => {
  it("un relleno con una línea por columna, primero en la tabla (queda detrás de las filas) y fuera del árbol de accesibilidad", () => {
    const el = mount();
    const scroll = el.querySelector(".nx-grid__scroll")!;
    expect(scroll.firstElementChild).toBe(fill(el));
    expect(fill(el).getAttribute("aria-hidden")).toBe("true");
    expect(fill(el).children).toHaveLength(3);
    expect(fill(el).hidden).toBe(false);
  });

  it("sigue a las columnas: casillas, columnas quitadas", () => {
    const el = mount("selectable");
    expect(fill(el).children).toHaveLength(4);
    el.removeColumn("prov");
    expect(fill(el).children).toHaveLength(3);
    el.selectable = false;
    expect(fill(el).children).toHaveLength(2);
    expect(fill(el).children).toHaveLength(el.querySelector(".nx-grid__head")!.children.length);
  });

  it("sin filas no se dibuja (cruzaría el aviso); vuelve con ellas", () => {
    const el = mount();
    el.filters = [{ key: "prov", op: "in", values: ["Nadie"] }];
    expect(el.querySelector<HTMLElement>(".nx-grid__empty")!.hidden).toBe(false);
    expect(fill(el).hidden).toBe(true);
    el.filters = [];
    expect(fill(el).hidden).toBe(false);
    el.rows = [];
    expect(fill(el).hidden).toBe(true);
  });
});
