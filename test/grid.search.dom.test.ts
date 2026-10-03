// @vitest-environment happy-dom
// «Buscar en la tabla»: la caja de la barra de <nx-grid>.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/grid/index";
import type { GridColumn, GridRow, NxGrid } from "../src/components/grid/index";

afterEach(() => vi.unstubAllGlobals());

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "prov", label: "Proveedor" },
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pend", label: "Pendiente" }, { value: "apr", label: "Aprobado" }] },
  { key: "monto", label: "Monto", type: "money", editable: true },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "OC-1", prov: "Aceros", estado: "pend", monto: 8_000_000 },
  { id: "2", oc: "OC-2", prov: "Empaques", estado: "apr", monto: 1_000_000 },
  { id: "3", oc: "OC-3", prov: "Aceros", estado: "apr", monto: 500_000 },
  { id: "4", oc: "OC-4", prov: "Químicos", estado: "pend", monto: 3_000_000 },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(attrs = ""): NxGrid {
  document.body.innerHTML = `<nx-grid ${attrs}></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = COLS;
  el.rows = ROWS;
  return el;
}

const box = (el: NxGrid) => el.querySelector<HTMLInputElement>(".nx-grid__search-input")!;
const clearBtn = (el: NxGrid) => el.querySelector<HTMLButtonElement>(".nx-grid__search-clear")!;
const shown = (el: NxGrid) => [...el.querySelectorAll('.nx-grid__row > [data-c="0"]')].map((x) => x.textContent);
/** Escribir en la caja y dar Enter (sin esperar la pausa). */
function type(el: NxGrid, text: string): void {
  box(el).value = text;
  box(el).dispatchEvent(new Event("input", { bubbles: true }));
  box(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

describe("Buscar en la tabla", () => {
  it("la caja está en la barra, con su nombre, y no cuenta como cambio de datos", () => {
    const el = mount();
    expect(box(el).placeholder).toBe("Buscar en la tabla");
    expect(box(el).getAttribute("aria-label")).toBe("Buscar en la tabla");
    expect(box(el).closest(".nx-grid__bar")).not.toBeNull();
    expect(box(el).closest("[data-nx-ephemeral]")).not.toBeNull();
    expect(clearBtn(el).hidden).toBe(true);
  });

  it("sin tildes ni mayúsculas, en cualquier columna", () => {
    const el = mount();
    type(el, "QUIMICOS");
    expect(shown(el)).toEqual(["OC-4"]);
    type(el, "aceros");
    expect(shown(el)).toEqual(["OC-1", "OC-3"]);
    expect(el.search).toBe("aceros");
    expect(el.count).toBe(2);
    expect(el.querySelector(".nx-grid__foot")!.textContent).toContain("2 de 4 filas");
  });

  it("encuentra lo que se ve (la etiqueta del estado, el monto con formato) y el valor sin formato", () => {
    const el = mount();
    type(el, "pendiente");
    expect(shown(el)).toEqual(["OC-1", "OC-4"]);
    type(el, "8.000.000");
    expect(shown(el)).toEqual(["OC-1"]);
    type(el, "8000000");
    expect(shown(el)).toEqual(["OC-1"]);
  });

  it("mientras se escribe, busca un momento después de la última tecla", async () => {
    const el = mount();
    box(el).value = "empaq";
    box(el).dispatchEvent(new Event("input", { bubbles: true }));
    expect(clearBtn(el).hidden).toBe(false);
    expect(shown(el)).toHaveLength(4);
    await sleep(200);
    expect(shown(el)).toEqual(["OC-2"]);
  });

  it("solo mira las columnas que se ven", () => {
    const el = mount();
    el.view = { hidden: ["prov"] };
    type(el, "aceros");
    expect(shown(el)).toEqual([]);
    el.view = { hidden: [] };
    type(el, "aceros");
    expect(shown(el)).toEqual(["OC-1", "OC-3"]);
  });

  it("se suma a los filtros, y las facetas cuentan sobre lo que encontró", () => {
    const el = mount("facets-open");
    el.filters = [{ key: "estado", op: "in", values: ["apr"] }];
    type(el, "aceros");
    expect(shown(el)).toEqual(["OC-3"]);
    // Empaques no pasa la búsqueda: queda en 0 y no se muestra.
    expect(el.querySelector('.nx-grid__facets input[data-value="Empaques"]')).toBeNull();
    expect(el.querySelector('.nx-grid__facets input[data-value="Aceros"]')).not.toBeNull();
  });

  it("la ✕ y Escape la borran; asignar `search` actualiza la caja", () => {
    const el = mount();
    type(el, "OC-2");
    clearBtn(el).click();
    expect(el.search).toBe("");
    expect(box(el).value).toBe("");
    expect(shown(el)).toHaveLength(4);
    type(el, "OC-2");
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    box(el).dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(shown(el)).toHaveLength(4);
    el.search = "OC-3";
    expect(box(el).value).toBe("OC-3");
    expect(clearBtn(el).hidden).toBe(false);
    expect(shown(el)).toEqual(["OC-3"]);
  });

  it("sin resultados, propone quitar la búsqueda", () => {
    const el = mount();
    type(el, "zzz");
    const btn = el.querySelector<HTMLButtonElement>(".nx-grid__empty button")!;
    expect(btn.textContent).toBe("Quitar «zzz»: vuelven 4 filas");
    btn.click();
    expect(el.search).toBe("");
    expect(shown(el)).toHaveLength(4);
  });

  it("nx-grid-filter dice lo buscado", () => {
    const el = mount();
    const events: { search: string; count: number }[] = [];
    el.addEventListener("nx-grid-filter", (e) => events.push(e.detail));
    type(el, "aceros");
    expect(events.at(-1)).toMatchObject({ search: "aceros", count: 2 });
  });

  it("una celda editada se busca con su valor nuevo", () => {
    const el = mount();
    type(el, "OC");
    el.querySelector<HTMLElement>('[data-r="1"] > [data-c="3"]')!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
    el.querySelector<HTMLElement>('[data-r="1"] > [data-c="3"]')!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = el.querySelector<HTMLInputElement>(".nx-grid__input")!;
    input.value = "7777777";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    type(el, "7.777.777");
    expect(shown(el)).toEqual(["OC-2"]);
  });

  it("con source, la búsqueda viaja al servidor como `search`", async () => {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(init.body as string));
        return new Response(JSON.stringify({ rows: ROWS, total: 4 }));
      }),
    );
    const el = mount('source="/datos"');
    await sleep(20);
    expect(bodies[0]).not.toHaveProperty("search");
    el.search = "  aceros ";
    await sleep(20);
    expect(bodies.at(-1)).toMatchObject({ offset: 0, search: "aceros" });
  });
});
