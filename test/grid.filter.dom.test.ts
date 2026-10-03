// @vitest-environment happy-dom
// El filtro por columna de <nx-grid>: lo que salió de la revisión. Lo escrito y no aplicado al
// cerrar o al pasar a otra columna, listas con miles de valores, «Solo» fuera del label, una sola
// región viva y las barras que se actualizan en su lugar.
import { describe, expect, it } from "vitest";
import "../src/index";
import type { GridColumn, GridRow, NxGrid } from "../src/index";

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "prov", label: "Proveedor" },
  { key: "monto", label: "Monto", type: "money" },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "OC-1", prov: "Aceros", monto: 8_000_000 },
  { id: "2", oc: "OC-2", prov: "Empaques", monto: 1_000_000 },
  { id: "3", oc: "OC-3", prov: "Aceros", monto: 500_000 },
  { id: "4", oc: "OC-4", prov: "Químicos", monto: 3_000_000 },
];

function mount(cols = COLS, rows = ROWS): NxGrid {
  document.body.innerHTML = `<nx-grid></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = cols;
  el.rows = rows;
  return el;
}

/** El panel del filtro se carga aparte: espera a que muestre esa columna. */
async function panel(el: NxGrid, title: string): Promise<HTMLElement> {
  for (let i = 0; i < 200 && el.querySelector(".nx-grid__filter .nx-grid__f-head")?.textContent !== title; i++) await new Promise((r) => setTimeout(r, 10));
  const pop = el.querySelector<HTMLElement>(".nx-grid__filter")!;
  expect(pop.querySelector(".nx-grid__f-head")!.textContent).toBe(title);
  return pop;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const escape = (target: HTMLElement) => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

describe("<nx-grid>: lo escrito en el filtro y no aplicado todavía", () => {
  it("«contiene» + Escape antes de que se aplique: se aplica a su columna, sin errores", async () => {
    const el = mount();
    await el.openFilter("oc");
    const pop = await panel(el, "Pedido");
    const input = pop.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.focus();
    input.value = "oc-3";
    input.dispatchEvent(new Event("input"));
    escape(input);
    expect(el.filters).toEqual([{ key: "oc", op: "contains", value: "oc-3" }]);
    // El temporizador ya no corre: nada se vuelve a aplicar ni lanza un error.
    await wait(200);
    expect(el.filters).toEqual([{ key: "oc", op: "contains", value: "oc-3" }]);
  });

  it("«contiene» y en seguida otra columna: no borra el filtro de la otra", async () => {
    const el = mount();
    el.filters = [{ key: "prov", op: "in", values: ["Aceros"] }];
    await el.openFilter("oc");
    const pop = await panel(el, "Pedido");
    const input = pop.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = "oc-3";
    input.dispatchEvent(new Event("input"));
    await el.openFilter("prov");
    await panel(el, "Proveedor");
    await wait(200);
    expect(el.filters).toEqual([
      { key: "prov", op: "in", values: ["Aceros"] },
      { key: "oc", op: "contains", value: "oc-3" },
    ]);
  });

  it("«Desde» + Escape: el monto se aplica y el `change` que llega al salir del campo no falla", async () => {
    const el = mount();
    await el.openFilter("monto");
    const pop = await panel(el, "Monto");
    const from = pop.querySelector<HTMLInputElement>(".nx-grid__f-pair input")!;
    from.focus();
    from.value = "1 M";
    escape(from);
    expect(el.filters).toEqual([{ key: "monto", op: "range", min: 1_000_000 }]);
    let events = 0;
    el.addEventListener("nx-grid-filter", () => events++);
    from.dispatchEvent(new Event("change"));
    expect(events).toBe(0);
    expect(el.filters).toEqual([{ key: "monto", op: "range", min: 1_000_000 }]);
  });

  it("«Restablecer» descarta lo escrito que no se aplicó", async () => {
    const el = mount();
    await el.openFilter("oc");
    const pop = await panel(el, "Pedido");
    const input = pop.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = "oc-3";
    input.dispatchEvent(new Event("input"));
    await wait(200);
    input.value = "oc-1";
    input.dispatchEvent(new Event("input"));
    pop.querySelector<HTMLButtonElement>(".nx-grid__clear")!.click();
    await wait(200);
    expect(el.filters).toEqual([]);
  });
});

describe("<nx-grid>: una lista con miles de valores", () => {
  const many = Array.from({ length: 500 }, (_, i) => ({ id: String(i), cod: `c-${String(i).padStart(3, "0")}`, n: i }));
  const cols: GridColumn[] = [{ key: "cod", label: "Código", filter: "list" }];

  it("pinta hasta 200 y dice cuántas más; buscar y «todas» alcanzan también a las que no se pintan", async () => {
    const el = mount(cols, many);
    await el.openFilter("cod");
    const pop = await panel(el, "Código");
    const boxes = () => pop.querySelectorAll("input[data-v]");
    expect(boxes()).toHaveLength(200);
    const hints = () => [...pop.querySelectorAll<HTMLElement>(".nx-grid__f-hint")].filter((x) => !x.hidden).map((x) => x.textContent);
    expect(hints()).toContain("Y 300 más: busca para verlos.");
    const search = pop.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = "c-4";
    search.dispatchEvent(new Event("input"));
    expect([...boxes()].map((b) => (b as HTMLInputElement).dataset.v)).toHaveLength(100);
    expect(hints()).not.toContain("Y 300 más: busca para verlos.");
    search.value = "c-";
    search.dispatchEvent(new Event("input"));
    // Desmarcar «todas las que coinciden» desmarca las 500, no solo las 200 pintadas.
    const all = pop.querySelector<HTMLInputElement>(".nx-grid__opt-all input")!;
    all.checked = false;
    all.dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.filters).toEqual([{ key: "cod", op: "in", values: [] }]);
  });

  it("una fila que se vuelve a mostrar es el mismo nodo (se actualiza, no se recrea)", async () => {
    const el = mount(cols, many);
    await el.openFilter("cod");
    const pop = await panel(el, "Código");
    const first = pop.querySelector<HTMLInputElement>('input[data-v="c-000"]')!;
    first.click();
    expect(pop.querySelector('input[data-v="c-000"]')).toBe(first);
    expect(first.checked).toBe(false);
  });
});

describe("<nx-grid>: «Solo» y las barras", () => {
  it("«Solo» va al lado del label de la casilla, no adentro", async () => {
    const el = mount();
    await el.openFilter("prov");
    const pop = await panel(el, "Proveedor");
    const only = pop.querySelector<HTMLButtonElement>('[data-only="Aceros"]')!;
    expect(only.closest("label")).toBeNull();
    const box = pop.querySelector<HTMLInputElement>('input[data-v="Aceros"]')!;
    expect(box.closest("label")!.textContent).toBe("Aceros2");
    only.click();
    expect(el.filters).toEqual([{ key: "prov", op: "in", values: ["Aceros"] }]);
  });

  it("las barras se actualizan en su lugar al cambiar el tramo", async () => {
    const el = mount();
    await el.openFilter("monto");
    const pop = await panel(el, "Monto");
    const bars = [...pop.querySelectorAll(".nx-grid__fbar")];
    expect(bars.length).toBeGreaterThan(1);
    (bars[0] as HTMLElement).click();
    const after = [...pop.querySelectorAll(".nx-grid__fbar")];
    expect(after.every((b, i) => b === bars[i])).toBe(true);
    expect(after.some((b) => b.classList.contains("is-off"))).toBe(true);
  });
});
