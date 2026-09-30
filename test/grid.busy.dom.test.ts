// @vitest-environment happy-dom
// <nx-grid> trabajando: el botón de exportar mientras exporta, y el conteo para el lector de
// pantalla en modo servidor (llega con la respuesta, no antes).
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/grid/index";
import type { GridColumn, GridRow, NxGrid } from "../src/components/grid/index";

afterEach(() => vi.unstubAllGlobals());

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pend", label: "Pendiente" }, { value: "apr", label: "Aprobado" }] },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "OC-1", estado: "pend" },
  { id: "2", oc: "OC-2", estado: "apr" },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const exportBtn = (el: NxGrid) => [...el.querySelectorAll<HTMLButtonElement>(".nx-grid__bar > .nx-grid__btn")].find((b) => /Export/.test(b.textContent ?? ""))!;

describe("nx-grid trabajando", () => {
  it("exportar: el botón queda ocupado (gira, dice «Exportando…») y no atiende otro clic hasta terminar", async () => {
    document.body.innerHTML = "<nx-grid></nx-grid>";
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.rows = ROWS;
    let done!: () => void;
    const spy = vi.fn(() => new Promise<void>((r) => (done = r)));
    el.exportXlsx = spy;
    const b = exportBtn(el);
    b.click();
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.textContent).toBe("Exportando…");
    b.click();
    expect(spy).toHaveBeenCalledTimes(1);
    done();
    await sleep(0);
    expect(b.hasAttribute("aria-busy")).toBe(false);
    expect(b.textContent).toBe("Exportar");
    // Si falla, también se suelta.
    el.exportXlsx = () => Promise.reject(new Error("caído"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    b.click();
    await sleep(0);
    expect(b.hasAttribute("aria-busy")).toBe(false);
    warn.mockRestore();
  });

  it("modo servidor: el aviso del lector de pantalla dice el total filtrado que llega, no el anterior", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ rows: [{ id: "1", oc: "OC-1" }], total: q.filters.length ? 7 : 40 }));
    });
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    await sleep(20);
    const live = el.querySelector(".nx-sr-only[role=status]")!;
    expect(live.textContent).toBe("40 filas");
    el.filters = [{ key: "estado", op: "in", values: ["apr"] }];
    await sleep(20);
    expect(live.textContent).toBe("7 filas");
  });
});
