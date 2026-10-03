// <Grid> de Solid: `rowKey` llega como atributo después de `rows` (el elemento sale del template ya
// mejorado) y los eventos que suben de un hijo (`slot="bulk"`) no son de la tabla.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { Grid } from "../src/solid/grid";

afterEach(() => {
  document.body.innerHTML = "";
});

const COLS = [{ key: "oc", label: "Pedido" }];
const ROWS = [
  { id: "1", codigo: "A", oc: "OC-1" },
  { id: "2", codigo: "B", oc: "OC-2" },
];

describe("<Grid>", () => {
  it("rowKey: los id salen de esa columna", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onSelection = vi.fn();
    render(() => <Grid columns={COLS} rows={ROWS} rowKey="codigo" selectable onSelection={onSelection} />, root);
    root.querySelector<HTMLInputElement>('[data-r="1"] input[data-pick]')!.click();
    expect(onSelection).toHaveBeenCalledOnce();
    expect(onSelection.mock.calls[0][0].detail.ids).toEqual(["B"]);
  });

  it("un evento nx-grid-* que sube desde un hijo no llega a los manejadores de la tabla", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onFilter = vi.fn();
    const onSelection = vi.fn();
    render(
      () => (
        <Grid columns={COLS} rows={ROWS} onFilter={onFilter} onSelection={onSelection}>
          <span slot="bulk" class="hijo" />
        </Grid>
      ),
      root,
    );
    const child = root.querySelector(".hijo")!;
    child.dispatchEvent(new CustomEvent("nx-grid-filter", { bubbles: true, detail: {} }));
    child.dispatchEvent(new CustomEvent("nx-grid-selection", { bubbles: true, detail: {} }));
    expect(onFilter).not.toHaveBeenCalled();
    expect(onSelection).not.toHaveBeenCalled();
    root.querySelector("nx-grid")!.filters = [{ key: "oc", op: "in", values: ["OC-1"] }];
    root.querySelector("nx-grid")!.clearFilters();
    expect(onFilter).toHaveBeenCalledOnce();
  });
});
