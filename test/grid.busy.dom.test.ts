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
    const spy = vi.fn(() => new Promise<number>((r) => (done = () => r(2))));
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
    // El resultado se anuncia.
    const live = el.querySelector<HTMLElement>('[role="status"]')!;
    const note = el.querySelector<HTMLElement>(".nx-grid__note")!;
    expect(live.textContent).toBe("Se exportaron 2 filas");
    expect(note.hidden).toBe(true);
    // Si falla, también se suelta, y se dice (no solo en la consola).
    el.exportXlsx = () => Promise.reject(new Error("caído"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    b.click();
    await sleep(0);
    expect(b.hasAttribute("aria-busy")).toBe(false);
    expect(live.textContent).toBe("No se pudo exportar");
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe("No se pudo exportar");
    warn.mockRestore();
  });

  it("modo servidor: mientras llega el primer bloque dice «Cargando…», no queda una tabla en blanco", async () => {
    let answer!: (r: Response) => void;
    const pending = vi.fn(() => new Promise<Response>((r) => (answer = r)));
    vi.stubGlobal("fetch", pending);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    await sleep(10);
    const empty = el.querySelector<HTMLElement>(".nx-grid__empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.classList.contains("is-loading")).toBe(true);
    expect(empty.textContent).toBe("Cargando…");
    // Sin filas en la respuesta: el aviso de siempre.
    answer(new Response(JSON.stringify({ rows: [], total: 0 })));
    await sleep(10);
    expect(empty.classList.contains("is-loading")).toBe(false);
    expect(empty.textContent).toContain("Ninguna fila coincide");
    // Con filas: sin aviso.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ rows: ROWS, total: 2 }))));
    el.refresh();
    await sleep(10);
    expect(empty.hidden).toBe(true);
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
