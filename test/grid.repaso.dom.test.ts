// @vitest-environment happy-dom
//
// <nx-grid>, repaso de los arreglos de la revisión del 2026-10-03: deshacer con una edición abierta,
// números que llegan como texto, el tope de reintentos, `row-key` que no cambia la clave efectiva,
// quitar `source` con un bloque en camino, el aviso de exportar que no pisa el de una vista, listas
// de filtros cambiadas en su lugar, la búsqueda que no rehace su lista en cada clic y el CRC de la
// hoja calculado por partes. Y lo del segundo repaso: bloques agotados que se vuelven a pedir, la
// misma consulta que no se repite y el valor nuevo en un campo abierto sin tocar.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GridColumn, GridRow, NxGrid } from "../src/index";
import "../src/index";
import { applyFilters, crossfilter, foldValue, parseNumber } from "../src/components/grid/logic";
import { crc32, zip } from "../src/components/grid/xlsx";

afterEach(() => {
  vi.useRealTimers();
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
  { id: "1", oc: "OC-1", prov: "Aceros", monto: 300 },
  { id: "2", oc: "OC-2", prov: "Empaques", monto: 100 },
  { id: "3", oc: "OC-3", prov: "Aceros", monto: 200 },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(attrs = "", rows: GridRow[] = ROWS, cols: GridColumn[] = COLS): NxGrid {
  document.body.innerHTML = `<nx-grid ${attrs}></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = cols;
  el.rows = rows;
  return el;
}
const scroll = (el: NxGrid) => el.querySelector<HTMLElement>(".nx-grid__scroll")!;
const key = (el: NxGrid, k: string, init: KeyboardEventInit = {}) => scroll(el).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
const input = (el: NxGrid) => el.querySelector<HTMLInputElement>(".nx-grid__input");
const enter = (el: NxGrid) => input(el)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

describe("deshacer desde código con una edición abierta", () => {
  it("la edición se guarda antes, como un paso, y el historial queda en orden", () => {
    const el = mount();
    key(el, "F2");
    input(el)!.value = "A";
    enter(el);
    key(el, "ArrowUp");
    key(el, "F2");
    input(el)!.value = "B";
    // `undo()` con «B» a medias: B se guarda y se deshace; «A» sigue, y rehacer trae B de vuelta.
    expect(el.undo()).toBe(true);
    expect(el.rows[0].oc).toBe("A");
    expect(el.canRedo).toBe(true);
    expect(el.redo()).toBe(true);
    expect(el.rows[0].oc).toBe("B");
    expect(el.undo()).toBe(true);
    expect(el.undo()).toBe(true);
    expect(el.rows[0].oc).toBe("OC-1");
    expect(el.canUndo).toBe(false);
  });
});

describe("números que llegan como texto", () => {
  it("un Decimal serializado («0.125») se abre como 0,125 y editado no se multiplica por mil", () => {
    const el = mount("", [{ id: "1", oc: "OC-1", prov: "A", monto: "0.125" }]);
    key(el, "End");
    key(el, "F2");
    expect(input(el)!.value).toBe("0,125");
    input(el)!.value = "0,126";
    enter(el);
    expect(el.rows[0].monto).toBe(0.126);
    expect(parseNumber("0.125")).toBe(0.125);
    expect(parseNumber("-0.125")).toBe(-0.125);
    expect(parseNumber("1.250")).toBe(1250);
  });
});

describe("modo servidor", () => {
  it("un bloque que falla siempre se reintenta solo hasta 5 veces; después, «Reintentar»", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "requestAnimationFrame", "cancelAnimationFrame"] });
    const fetch = vi.fn(async () => new Response("x", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    const errors: unknown[] = [];
    el.addEventListener("nx-grid-error", (e) => errors.push(e.detail));
    el.columns = COLS;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(errors).toHaveLength(5);
    // Nada más queda programado: la tabla quieta no sigue pidiendo.
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetch).toHaveBeenCalledTimes(5);
    el.querySelector<HTMLButtonElement>("[data-retry]")!.click();
    await vi.advanceTimersByTimeAsync(10);
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it("un bloque del medio que agotó sus intentos se vuelve a pedir al desplazarse, si el servidor volvió", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date", "requestAnimationFrame", "cancelAnimationFrame"] });
    const all = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), oc: `OC-${i}`, prov: "x", monto: i }));
    let down = true;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      if (down && q.offset >= 100) return new Response("x", { status: 500 });
      return new Response(JSON.stringify({ rows: all.slice(q.offset, q.offset + q.limit), total: all.length }));
    });
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    await vi.advanceTimersByTimeAsync(50);
    const middle = () => fetch.mock.calls.filter((c) => JSON.parse((c[1] as RequestInit).body as string).offset >= 100).length;
    const to = async (r: number) => {
      scroll(el).scrollTop = r * 32;
      scroll(el).dispatchEvent(new Event("scroll"));
      await vi.advanceTimersByTimeAsync(50);
    };
    await to(150);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(middle()).toBe(5);
    expect(el.querySelectorAll(".nx-grid__rows .is-loading").length).toBeGreaterThan(0);
    // El servidor vuelve y la persona se desplaza: otra tanda, y las filas llegan.
    down = false;
    await to(160);
    expect(middle()).toBe(6);
    expect(el.querySelectorAll(".nx-grid__rows .is-loading")).toHaveLength(0);
    expect(el.querySelector('[data-r="160"]')!.textContent).toContain("OC-160");
  });

  it("reasignar los mismos filtros u orden no vuelve a pedir ni cierra la edición abierta", async () => {
    const all = Array.from({ length: 3 }, (_, i) => ({ id: String(i), oc: `OC-${i}`, prov: "x", monto: i }));
    const fetch = vi.fn(async () => new Response(JSON.stringify({ rows: all, total: all.length })));
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.filters = [{ key: "prov", op: "in", values: ["x"] }];
    el.sort = { key: "monto", dir: -1 };
    await sleep(10);
    const n = fetch.mock.calls.length;
    key(el, "F2");
    input(el)!.value = "A MEDIAS";
    // Una app BDUI que repinta con el mismo estado.
    el.filters = [{ key: "prov", op: "in", values: ["x"] }];
    el.sort = { key: "monto", dir: -1 };
    await sleep(10);
    expect(fetch.mock.calls.length).toBe(n);
    expect(input(el)!.value).toBe("A MEDIAS");
    // Otra consulta sí se pide (y la edición se guarda antes).
    el.sort = { key: "monto", dir: 1 };
    await sleep(10);
    expect(fetch.mock.calls.length).toBe(n + 1);
    expect(input(el)).toBeNull();
  });

  it("quitar `source` con un bloque en camino: al llegar no se mezcla con las filas del cliente", async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (answer = r))));
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.rows = ROWS;
    await sleep(0);
    el.removeAttribute("source");
    expect(el.mode).toBe("client");
    expect(el.count).toBe(3);
    answer(new Response(JSON.stringify({ rows: Array.from({ length: 100 }, (_, i) => ({ id: `s${i}`, oc: `S-${i}` })), total: 5000 })));
    await sleep(10);
    expect(el.count).toBe(3);
    // Las filas del servidor no quedaron indexadas en el modo cliente.
    el.selected = ["s1", "2"];
    expect(el.selectedRows.map((r) => r.oc)).toEqual(["OC-2"]);
    expect([...el.querySelectorAll('.nx-grid__row > [data-c="0"]')].map((x) => x.textContent)).toEqual(["OC-1", "OC-2", "OC-3"]);
  });
});

describe("una edición abierta cuando la app trae datos", () => {
  it("sin tocar el campo, muestra el valor nuevo de la celda; con algo escrito, lo deja", () => {
    const el = mount();
    const got: unknown[] = [];
    el.addEventListener("nx-grid-change", (e) => got.push(...e.detail.changes));
    key(el, "F2");
    expect(input(el)!.value).toBe("OC-1");
    el.rows = [{ ...ROWS[0], oc: "OC-1 (servidor)" }, ROWS[1], ROWS[2]];
    expect(input(el)!.value).toBe("OC-1 (servidor)");
    // Salir sin tocarlo no cambia nada.
    enter(el);
    expect(got).toEqual([]);
    expect(el.rows[0].oc).toBe("OC-1 (servidor)");
    key(el, "ArrowUp");
    key(el, "F2");
    input(el)!.value = "MIO";
    el.rows = [{ ...ROWS[0], oc: "OTRO" }, ROWS[1], ROWS[2]];
    expect(input(el)!.value).toBe("MIO");
  });

  it("si la columna deja de ser editable, lo escrito se descarta y el aviso no dice que la fila se fue", async () => {
    const el = mount();
    key(el, "F2");
    input(el)!.value = "NADA";
    el.columns = COLS.map((c) => (c.key === "oc" ? { ...c, editable: false } : c));
    expect(input(el)).toBeNull();
    expect(el.rows[0].oc).toBe("OC-1");
    await Promise.resolve();
    const said = el.querySelector('[role="status"]')!.textContent!;
    expect(said).toBe(el.labels.editLost);
    expect(said).not.toMatch(/fila/i);
  });
});

describe("row-key", () => {
  it("pasar de sin atributo a row-key=\"id\" (la misma clave) no borra marcas ni historial", () => {
    const el = mount("selectable");
    el.selected = ["2"];
    key(el, "F2");
    input(el)!.value = "X";
    enter(el);
    el.rowKey = "id";
    el.rowKey = el.rowKey;
    expect(el.selected).toEqual(["2"]);
    expect(el.canUndo).toBe(true);
    // Otra clave sí los borra.
    el.rowKey = "oc";
    expect(el.selected).toEqual([]);
    expect(el.canUndo).toBe(false);
  });
});

describe("el aviso de exportar", () => {
  it("una exportación que sale bien no borra el aviso de una vista; solo quita su propio error", async () => {
    const el = mount();
    const note = el.querySelector<HTMLElement>(".nx-grid__note")!;
    el.view = { filters: [{ key: "centro", op: "in", values: ["x"] }] };
    const gone = note.textContent;
    expect(gone).toContain("centro");
    const btn = [...el.querySelectorAll<HTMLButtonElement>(".nx-grid__bar > .nx-grid__btn")].find((b) => /Export/.test(b.textContent ?? ""))!;
    el.exportXlsx = () => Promise.resolve(3);
    btn.click();
    await sleep(0);
    expect(note.hidden).toBe(false);
    expect(note.textContent).toBe(gone);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    el.exportXlsx = () => Promise.reject(new Error("caído"));
    btn.click();
    await sleep(0);
    expect(note.textContent).toBe("No se pudo exportar");
    el.exportXlsx = () => Promise.resolve(3);
    btn.click();
    await sleep(0);
    expect(note.hidden).toBe(true);
  });
});

describe("filtros y búsqueda", () => {
  it("una lista de valores cambiada en su lugar (mismo largo) se vuelve a leer", () => {
    const rows: GridRow[] = [{ p: "a" }, { p: "b" }, { p: "c" }];
    const f = { key: "p", op: "in" as const, values: ["a", "b"] };
    expect(applyFilters(rows, [f]).map((r) => r.p)).toEqual(["a", "b"]);
    f.values[1] = "c";
    expect(applyFilters(rows, [f]).map((r) => r.p)).toEqual(["a", "c"]);
    f.values[0] = "b";
    expect(crossfilter(rows, [f], []).filtered.map((r) => r.p)).toEqual(["b", "c"]);
  });

  it("con «Buscar en la tabla», cambiar un filtro no rehace la lista de lo encontrado", () => {
    const el = mount();
    el.search = "aceros";
    // La lista de lo encontrado sale de recorrer todas las filas (`rows.filter`): con la misma
    // búsqueda y las mismas filas, el panel del filtro guarda sus cálculos por ella.
    const spy = vi.spyOn(Array.prototype, "filter");
    el.filters = [{ key: "monto", op: "range", min: 250 }];
    el.filters = [{ key: "monto", op: "range", min: 150 }];
    const searched = spy.mock.contexts.filter((ctx) => ctx === el.rows).length;
    spy.mockRestore();
    expect(searched).toBe(0);
    expect(el.count).toBe(2);
    // Editar una fila sí obliga a buscar de nuevo en el próximo filtro: OC-1 deja de coincidir.
    el.search = "oc-1";
    expect(el.count).toBe(1);
    key(el, "F2");
    input(el)!.value = "ZZ";
    enter(el);
    expect(el.count).toBe(1); // editar no refiltra…
    el.filters = [];
    expect(el.count).toBe(0); // …pero el próximo filtro sí lo ve
  });

  it("un texto largo se pliega bien sin guardarse en la memoria compartida", () => {
    const long = "Observación Ñandú ".repeat(40);
    const set = vi.spyOn(Map.prototype, "set");
    expect(foldValue(long)).toBe("observacion nandu ".repeat(40));
    expect(set.mock.calls.some((c) => c[0] === long)).toBe(false);
    expect(foldValue("Ñandú corto")).toBe("nandu corto");
    expect(set.mock.calls.some((c) => c[0] === "Ñandú corto")).toBe(true);
  });
});

describe("el aviso sin filas", () => {
  it("va dentro de la tabla como una fila con una celda (un botón suelto en un role=grid no es válido)", () => {
    const el = mount();
    el.filters = [{ key: "prov", op: "in", values: ["Nadie"] }];
    const empty = el.querySelector<HTMLElement>(".nx-grid__empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.getAttribute("role")).toBe("row");
    expect(empty.parentElement!.getAttribute("role")).toBe("grid");
    const cell = empty.querySelector<HTMLElement>(':scope > [role="gridcell"]')!;
    expect(cell.querySelector("button")).not.toBeNull();
    expect([...empty.children]).toEqual([cell]);
    // La cabecera y el aviso: no «fila 2 de 1». La celda abarca las tres columnas.
    expect(scroll(el).getAttribute("aria-rowcount")).toBe("2");
    expect(cell.getAttribute("aria-colspan")).toBe("3");
    el.filters = [];
    expect(scroll(el).getAttribute("aria-rowcount")).toBe("4");
  });
});

describe("la hoja de Excel", () => {
  it("zip acepta el CRC ya calculado por partes y da el mismo archivo", async () => {
    const enc = new TextEncoder();
    const parts = [enc.encode("<a>"), enc.encode("hola"), enc.encode("</a>")];
    const crc = parts.reduce((c, p) => crc32(p, c), 0);
    const a = new Uint8Array(await (await zip([{ name: "x.xml", data: parts }])).arrayBuffer());
    const b = new Uint8Array(await (await zip([{ name: "x.xml", data: parts, crc }])).arrayBuffer());
    expect(b).toEqual(a);
  });
});
