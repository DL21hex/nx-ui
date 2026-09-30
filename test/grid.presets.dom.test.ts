// @vitest-environment happy-dom
// Atajos de <nx-grid>: tarjetas con un filtro y su conteo sobre la tabla.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/grid/index";
import type { GridColumn, GridPreset, GridRow, NxGrid } from "../src/components/grid/index";

afterEach(() => vi.unstubAllGlobals());

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pend", label: "Pendiente" }, { value: "apr", label: "Aprobado" }] },
  { key: "monto", label: "Monto", type: "money" },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "OC-1", estado: "pend", monto: 8_000_000 },
  { id: "2", oc: "OC-2", estado: "apr", monto: 1_000_000 },
  { id: "3", oc: "OC-3", estado: "apr", monto: 500_000 },
  { id: "4", oc: "OC-4", estado: "pend", monto: 3_000_000 },
];
const PRESETS: GridPreset[] = [
  { id: "pend", label: "Pendientes", hint: "por aprobar", filters: [{ key: "estado", op: "in", values: ["pend"] }] },
  { id: "grandes", label: "Grandes", filters: [{ key: "monto", op: "range", min: 2_000_000 }] },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cards = (el: NxGrid) => [...el.querySelectorAll<HTMLButtonElement>(".nx-grid__preset")];
const pressed = (el: NxGrid) => cards(el).map((b) => b.getAttribute("aria-pressed"));

describe("nx-grid: atajos", () => {
  it("cuenta cada atajo sobre todas las filas; tocarlo filtra, y otra vez devuelve los filtros de antes", () => {
    document.body.innerHTML = "<nx-grid></nx-grid>";
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.rows = ROWS;
    el.filters = [{ key: "estado", op: "in", values: ["apr"] }];
    el.presets = PRESETS;
    expect(cards(el).map((b) => b.querySelector("strong")!.textContent)).toEqual(["2", "2"]);
    expect(cards(el)[0].textContent).toBe("2Pendientespor aprobar");
    expect(pressed(el)).toEqual(["false", "false"]);

    const seen = vi.fn();
    el.addEventListener("nx-grid-filter", seen);
    cards(el)[1].click();
    expect(el.filters).toEqual([{ key: "monto", op: "range", min: 2_000_000 }]);
    expect(pressed(el)).toEqual(["false", "true"]);
    expect(seen).toHaveBeenCalledTimes(1);
    // De un atajo a otro: el «antes» sigue siendo el de la persona.
    cards(el)[0].click();
    expect(pressed(el)).toEqual(["true", "false"]);
    cards(el)[0].click();
    expect(el.filters).toEqual([{ key: "estado", op: "in", values: ["apr"] }]);
    expect(pressed(el)).toEqual(["false", "false"]);
  });

  it("se desmarca solo si la persona cambia los filtros; y se marca si llega a los del atajo por otro camino", () => {
    document.body.innerHTML = "<nx-grid></nx-grid>";
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.rows = ROWS;
    el.presets = PRESETS;
    cards(el)[0].click();
    el.filters = [{ key: "estado", op: "in", values: ["apr"] }];
    expect(pressed(el)).toEqual(["false", "false"]);
    el.filters = [{ op: "range", min: 2_000_000, key: "monto" } as never];
    expect(pressed(el)).toEqual(["false", "true"]);
  });

  it("los conteos cambian con los datos, y sin atajos no hay barra", () => {
    document.body.innerHTML = "<nx-grid></nx-grid>";
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.rows = ROWS;
    const bar = el.querySelector<HTMLElement>(".nx-grid__presets")!;
    expect(bar.hidden).toBe(true);
    el.presets = PRESETS;
    expect(bar.hidden).toBe(false);
    el.rows = [...ROWS, { id: "5", oc: "OC-5", estado: "pend", monto: 9_000_000 }];
    expect(cards(el).map((b) => b.querySelector("strong")!.textContent)).toEqual(["3", "3"]);
  });

  it("con `source`, los conteos llegan del servidor (y mientras tanto, «—»)", async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (answer = r))));
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.presets = PRESETS;
    await sleep(10);
    expect(cards(el).map((b) => b.querySelector("strong")!.textContent)).toEqual(["—", "—"]);
    answer(new Response(JSON.stringify({ rows: ROWS, total: 4, presets: { pend: 1520, grandes: 7, otro: 3 } })));
    await sleep(10);
    expect(cards(el).map((b) => b.querySelector("strong")!.textContent)).toEqual(["1.520", "7"]);
  });
});
