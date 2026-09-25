// @vitest-environment happy-dom
//
// <nx-grid> ante lo que salió de la revisión: selección en modo servidor, IA tras filas nuevas,
// reconexión, carreras de `ask()`, fórmulas al copiar, pegados enormes, exportar por bloques y
// endpoints de otro origen.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GridColumn, GridRow, NxGrid } from "../src/index";
import "../src/index";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido", editable: true },
  { key: "prov", label: "Proveedor" },
  { key: "monto", label: "Monto", type: "money", editable: true },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "=HYPERLINK(\"https://x/?\"&B1)", prov: "Aceros", monto: 100 },
  { id: "2", oc: "OC-2", prov: "Empaques", monto: -5 },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const body = (call: unknown) => JSON.parse(((call as [string, RequestInit])[1].body as string) ?? "{}");

function mount(attrs = "", rows: GridRow[] = ROWS, cols: GridColumn[] = COLS): NxGrid {
  document.body.innerHTML = `<nx-grid ${attrs}></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = cols;
  el.rows = rows;
  return el;
}
const scroll = (el: NxGrid) => el.querySelector<HTMLElement>(".nx-grid__scroll")!;
const key = (el: NxGrid, k: string, init: KeyboardEventInit = {}) => scroll(el).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));

/** Un backend de filas por bloques que filtra por `prov` (filtro `in`). */
function server(total = 250, withIds = true) {
  const all = Array.from({ length: total }, (_, i) => ({ ...(withIds ? { id: `r${i}` } : {}), oc: `OC-${i}`, prov: i % 2 ? "Aceros" : "Empaques", monto: 1000 }));
  return vi.fn(async (_url: string, init: RequestInit) => {
    const q = JSON.parse(init.body as string);
    const f = q.filters?.find((x: { key: string }) => x.key === "prov");
    const rows = f ? all.filter((r) => f.values.includes(r.prov)) : all;
    return new Response(JSON.stringify({ rows: rows.slice(q.offset, q.offset + q.limit), total: rows.length }));
  });
}

describe("modo servidor: la selección no alcanza filas de otra consulta", () => {
  it("«Seleccionar todo» tras filtrar marca solo las filas de la consulta actual", async () => {
    vi.stubGlobal("fetch", server(20));
    const el = mount('source="/datos" selectable');
    await sleep(20);
    el.filters = [{ key: "prov", op: "in", values: ["Aceros"] }];
    await sleep(20);
    el.querySelector<HTMLElement>('.nx-grid__selbar [data-pick="all"]')!.click();
    // Antes: las 20 filas indexadas de la primera consulta (también las Empaques).
    expect(el.selected).toHaveLength(10);
    expect(el.selectedRows.every((r) => r.prov === "Aceros")).toBe(true);
  });

  it("sin row-key, una marca posicional no pasa a otra fila al cambiar el filtro", async () => {
    vi.stubGlobal("fetch", server(20, false));
    const el = mount('source="/datos" selectable');
    await sleep(20);
    el.querySelector<HTMLInputElement>('[data-r="0"] input[data-pick]')!.click();
    expect(el.selected).toHaveLength(1);
    const first = el.selectedRows[0];
    el.filters = [{ key: "prov", op: "in", values: ["Aceros"] }];
    await sleep(20);
    expect(el.selected).toEqual([]);
    expect(el.selectedRows).not.toContain(first);
  });
});

describe("columnas de IA", () => {
  it("con filas nuevas se vuelven a pedir (no quedan cargando para siempre)", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const lines = JSON.parse(init.body as string).rows.map((r: GridRow) => JSON.stringify({ type: "cell", id: r.id, value: `v${r.id}` }));
      return new Response(`${lines.join("\n")}\n{"type":"done"}\n`);
    });
    vi.stubGlobal("fetch", fetch);
    const el = mount('ai-endpoint="/ia"');
    el.addAiColumn("Riesgo", "riesgo");
    await sleep(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll(".nx-grid__shim")).toHaveLength(0);
    // La app trae datos frescos (sin la columna de IA): antes, las celdas quedaban con el shim.
    el.rows = ROWS.map((r) => ({ ...r }));
    expect(el.querySelectorAll(".nx-grid__shim")).toHaveLength(2);
    await sleep(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll(".nx-grid__shim")).toHaveLength(0);
    expect(el.rows[0].ai_riesgo).toBe("v1");
  });

  it("una respuesta que llega después de cambiar las filas no se escribe en las nuevas", async () => {
    let release!: () => void;
    const fetch = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("abort", "AbortError")));
          release = () => resolve(new Response(`${JSON.stringify({ type: "cell", id: "1", value: "viejo" })}\n`));
        }),
    );
    vi.stubGlobal("fetch", fetch);
    const el = mount('ai-endpoint="/ia"');
    el.addAiColumn("Riesgo", "riesgo");
    await sleep(150);
    expect(fetch).toHaveBeenCalledOnce();
    expect((fetch.mock.calls[0][1] as RequestInit).signal!.aborted).toBe(false);
    el.rows = ROWS.map((r) => ({ ...r }));
    expect((fetch.mock.calls[0][1] as RequestInit).signal!.aborted).toBe(true);
    release();
    await sleep(10);
    expect(el.rows[0].ai_riesgo).not.toBe("viejo");
  });
});

describe("reconexión", () => {
  it("moverla en el DOM no vuelve a pedir los datos y vuelve a observar su tamaño", async () => {
    const observed: Element[] = [];
    const disconnected: number[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(el: Element) {
          observed.push(el);
        }
        disconnect() {
          disconnected.push(1);
        }
      },
    );
    const fetch = server(20);
    vi.stubGlobal("fetch", fetch);
    const el = mount('source="/datos"');
    await sleep(20);
    const calls = fetch.mock.calls.length;
    expect(observed).toHaveLength(1);
    const box = document.createElement("div");
    document.body.append(box);
    box.append(el); // desconectar y conectar
    await sleep(20);
    expect(disconnected).toHaveLength(1);
    expect(observed).toHaveLength(2);
    expect(fetch.mock.calls.length).toBe(calls);
    expect(el.querySelector('[data-r="0"] [data-c="0"]')!.textContent).toBe("OC-0");
  });
});

describe("ask() con nl-endpoint", () => {
  it("dos frases seguidas: gana la última aunque la primera responda después", async () => {
    const replies: Record<string, { at: number; filters: unknown[] }> = {
      lenta: { at: 60, filters: [{ key: "prov", op: "in", values: ["Aceros"] }] },
      rapida: { at: 5, filters: [{ key: "prov", op: "in", values: ["Empaques"] }] },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const r = replies[JSON.parse(init.body as string).q];
            const t = setTimeout(() => resolve(new Response(JSON.stringify({ filters: r.filters }))), r.at);
            init.signal?.addEventListener("abort", () => (clearTimeout(t), reject(new DOMException("abort", "AbortError"))));
          }),
      ),
    );
    const el = mount('nl-endpoint="/nl"');
    const a = el.ask("lenta");
    const b = el.ask("rapida");
    await Promise.all([a, b]);
    await sleep(80);
    expect(el.filters).toEqual([{ key: "prov", op: "in", values: ["Empaques"] }]);
  });
});

describe("copiar y pegar", () => {
  it("un texto que parece fórmula se copia con apóstrofo; un número negativo no", () => {
    const el = mount();
    key(el, "a", { ctrlKey: true });
    const dt = new DataTransfer();
    scroll(el).dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
    const [first, second] = dt.getData("text/plain").split("\n");
    expect(first.startsWith(`"'=HYPERLINK(`)).toBe(true);
    expect(second).toBe("OC-2\tEmpaques\t-5");
  });

  it("pegar lo copiado devuelve el texto original (sin el apóstrofo)", () => {
    const el = mount();
    const dt = new DataTransfer();
    dt.setData("text/plain", "'=1+1");
    key(el, "ArrowDown");
    scroll(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    expect(el.rows[1].oc).toBe("=1+1");
  });

  it("un pegado de 150 000 líneas y su deshacer no revientan (sin Math.max(...x))", () => {
    const rows = Array.from({ length: 150_000 }, (_, i) => ({ id: String(i), oc: "", prov: "x", monto: 0 }));
    const el = mount("", rows, [{ key: "oc", label: "Pedido", editable: true }]);
    const dt = new DataTransfer();
    dt.setData("text/plain", Array.from({ length: 150_000 }, (_, i) => `v${i}`).join("\n"));
    expect(() => scroll(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }))).not.toThrow();
    expect(el.rows[149_999].oc).toBe("v149999");
    expect(el.undo()).toBe(true);
    expect(el.rows[149_999].oc).toBe("");
  });
});

describe("editar recalcula lo que toca", () => {
  it("el total y las facetas siguen al día tras una edición", () => {
    const el = mount("facets-open", [
      { id: "1", oc: "a", prov: "Aceros", monto: 100 },
      { id: "2", oc: "b", prov: "Aceros", monto: 50 },
      { id: "3", oc: "c", prov: "Empaques", monto: 10 },
    ]);
    el.columns = [...COLS.slice(0, 2), { key: "monto", label: "Monto", type: "money", editable: true }, { key: "prov2", label: "P2", editable: true, facet: true }];
    expect(el.querySelector(".nx-grid__foot")!.textContent).toContain("160");
    key(el, "ArrowRight");
    key(el, "ArrowRight");
    const dt = new DataTransfer();
    dt.setData("text/plain", "1000");
    scroll(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    expect(el.querySelector(".nx-grid__foot")!.textContent).toContain("1.060");
  });
});

describe("el pie no se recalcula en cada cuadro del scroll", () => {
  it("con todo seleccionado, desplazarse no rehace el pie", async () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({ id: String(i), oc: `OC-${i}`, prov: "x", monto: i }));
    const el = mount("", rows);
    key(el, "a", { ctrlKey: true });
    const foot = el.querySelector(".nx-grid__foot")!;
    const before = foot.firstChild;
    expect(foot.textContent).toContain("1.200 celdas");
    scroll(el).scrollTop = 3000;
    scroll(el).dispatchEvent(new Event("scroll"));
    await sleep(40);
    expect(el.querySelector('[data-r="0"]')).toBeNull();
    expect(foot.firstChild).toBe(before);
    // Cambiar el rango sí lo rehace.
    key(el, "Escape");
    expect(foot.firstChild).not.toBe(before);
  });
});

describe("exportar", () => {
  it("modo servidor: pide por bloques de 5 000 y descarta filas que no son objetos", async () => {
    const all = Array.from({ length: 7000 }, (_, i) => (i === 3 ? null : { id: String(i), oc: `OC-${i}`, prov: "x", monto: i }));
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ rows: all.slice(q.offset, q.offset + q.limit), total: all.length }));
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("CompressionStream", undefined);
    let blob: Blob | undefined;
    URL.createObjectURL = (b: Blob) => ((blob = b), "blob:x");
    URL.revokeObjectURL = () => {};
    // happy-dom navegaría al `blob:` (un navegador descarga por el atributo `download`).
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const el = mount('source="/datos"');
    await sleep(20);
    fetch.mockClear();
    await el.exportXlsx("pedidos");
    expect(fetch.mock.calls.map((c) => body(c))).toEqual([
      { offset: 0, limit: 5000, sort: null, filters: [] },
      { offset: 5000, limit: 5000, sort: null, filters: [] },
    ]);
    const text = new TextDecoder().decode(new Uint8Array(await blob!.arrayBuffer()));
    expect(text).toContain('<dimension ref="A1:C7000"/>');
  });

  it("si el servidor falla, el botón no deja una promesa rechazada sin atender", async () => {
    const el = mount('source="/datos"');
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(el.exportXlsx()).rejects.toThrow("HTTP 500");
    el.querySelector<HTMLButtonElement>(".nx-grid__bar > button:last-child")!.click();
    await sleep(20);
    expect(warn).toHaveBeenCalledWith("[nx-grid] no se pudo exportar", expect.any(Error));
  });
});

describe("endpoints de otro origen", () => {
  it("source, ai-endpoint y nl-endpoint de otro origen no se usan", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('source="https://otro.example/datos" ai-endpoint="//otro.example/ia" nl-endpoint="https://otro.example/nl"');
    el.addAiColumn("Riesgo", "riesgo");
    await el.ask("algo raro");
    await sleep(200);
    expect(fetch).not.toHaveBeenCalled();
    // Sin `source` válido la tabla muestra `rows`; el botón de IA no aparece.
    expect(el.querySelector('[data-r="0"] [data-c="1"]')!.textContent).toBe("Aceros");
    expect(el.querySelector<HTMLElement>(".nx-grid__bar button[popovertarget]")!.hidden).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});

describe("dentro de un diálogo, consultar no es editar", () => {
  it("la frase, las facetas, agrupar y las casillas llevan data-nx-ephemeral", () => {
    const el = mount("selectable facets-open");
    for (const sel of [".nx-grid__ask-input", ".nx-grid__group", ".nx-grid__facets", "input[data-pick]", "input[data-pick-all]"]) {
      expect(el.querySelector(sel)!.closest("[data-nx-ephemeral]"), sel).not.toBeNull();
    }
    expect(el.querySelector(".nx-grid__rows [data-c]")!.closest("[data-nx-ephemeral]")).toBeNull();
  });
});
