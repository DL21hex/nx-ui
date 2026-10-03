// @vitest-environment happy-dom
//
// <nx-grid>, núcleo: lo que salió de la revisión del 2026-10-03. Ediciones que no caen en otra fila,
// `row-key` tardío, ids repetidos, columnas y filtros de BDUI mal formados, el servidor que falla o
// que manda menos filas, el orden que no se rehace al filtrar, la cabecera con flechas y el editor
// numérico que no multiplica por mil.
import { afterEach, describe, expect, it, vi } from "vitest";
import { nxFormat } from "../src/core/locale";
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
  { id: "1", codigo: "A", oc: "OC-1", prov: "Aceros", monto: 300 },
  { id: "2", codigo: "B", oc: "OC-2", prov: "Empaques", monto: 100 },
  { id: "3", codigo: "C", oc: "OC-3", prov: "Aceros", monto: 200 },
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
const input = (el: NxGrid) => el.querySelector<HTMLInputElement>(".nx-grid__input");
const enter = (el: NxGrid) => input(el)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
const column = (el: NxGrid, c: number) => [...el.querySelectorAll(`.nx-grid__row > [data-c="${c}"]`)].map((x) => x.textContent);
const changes = (el: NxGrid) => {
  const out: unknown[] = [];
  el.addEventListener("nx-grid-change", (e) => out.push(...e.detail.changes));
  return out;
};

describe("una edición abierta no cae en otra fila", () => {
  it("si la app cambia los filtros mientras se edita, se guarda en la fila que se estaba editando", () => {
    const el = mount();
    const got = changes(el);
    key(el, "ArrowDown"); // OC-2
    key(el, "F2");
    input(el)!.value = "EDITADO";
    // Una sincronización filtra por código: OC-2 ya no se ve y la fila 1 pasa a ser otra.
    el.filters = [{ key: "prov", op: "in", values: ["Aceros"] }];
    expect(got).toEqual([{ id: "2", key: "oc", value: "EDITADO", old: "OC-2" }]);
    expect(el.rows.map((r) => r.oc)).toEqual(["OC-1", "EDITADO", "OC-3"]);
    expect(input(el)).toBeNull();
    expect(column(el, 0)).toEqual(["OC-1", "OC-3"]);
  });

  it("con filas nuevas en otro orden, el campo sigue abierto en su fila y lo escrito va a su id", () => {
    const el = mount();
    const got = changes(el);
    key(el, "F2");
    input(el)!.value = "EDITA";
    // Una tabla que se refresca sola: las mismas filas (copias nuevas), en otro orden.
    el.rows = [ROWS[2], ROWS[1], ROWS[0]].map((r) => ({ ...r }));
    // Nada se guardó a medias: el campo sigue, con lo escrito, en el lugar nuevo de OC-1 (la última).
    expect(got).toEqual([]);
    expect(input(el)!.value).toBe("EDITA");
    expect(input(el)!.closest<HTMLElement>(".nx-grid__row")!.dataset.r).toBe("2");
    input(el)!.value = "EDITADO";
    enter(el);
    expect(got).toEqual([{ id: "1", key: "oc", value: "EDITADO", old: "OC-1" }]);
    expect(el.rows.map((r) => r.oc)).toEqual(["OC-3", "OC-2", "EDITADO"]);
  });

  it("sin id (posicional): ordenar sigue a la misma fila; con filas nuevas se descarta y se anuncia", async () => {
    const plain = ROWS.map(({ id: _, ...r }) => r);
    const el = mount("", plain);
    const got = changes(el);
    key(el, "F2");
    input(el)!.value = "EDITADO";
    el.sort = { key: "monto", dir: 1 };
    // OC-1 (la de 300) pasa al final, con su campo.
    expect(input(el)!.closest<HTMLElement>(".nx-grid__row")!.dataset.r).toBe("2");
    enter(el);
    expect(got).toEqual([{ id: "#0", key: "oc", value: "EDITADO", old: "OC-1" }]);

    key(el, "F2");
    input(el)!.value = "OTRO";
    // Filas nuevas sin id: la posición ya no dice cuál era.
    el.rows = plain.map((r) => ({ ...r }));
    expect(input(el)).toBeNull();
    expect(got).toHaveLength(1);
    await Promise.resolve();
    expect(el.querySelector('[role="status"]')!.textContent).toBe(el.labels.editLost);
  });

  it("si la fila deja de estar en los datos, lo escrito se descarta; si solo queda filtrada, se guarda", async () => {
    const el = mount();
    const got = changes(el);
    key(el, "F2");
    input(el)!.value = "NADA";
    el.rows = [ROWS[1], ROWS[2]];
    expect(input(el)).toBeNull();
    expect(got).toEqual([]);
    expect(el.rows.map((r) => r.oc)).toEqual(["OC-2", "OC-3"]);
    await Promise.resolve();
    expect(el.querySelector('[role="status"]')!.textContent).toBe(el.labels.editLost);
    // Una columna escondida por una vista: el registro sigue, así que se guarda en él.
    key(el, "F2");
    input(el)!.value = "OCULTA";
    el.view = { hidden: ["oc"] };
    expect(got).toEqual([{ id: "2", key: "oc", value: "OCULTA", old: "OC-2" }]);
  });

  it("con datos en vivo el campo conserva el foco y el cursor, y la búsqueda o las columnas no lo cierran", () => {
    const el = mount();
    const got = changes(el);
    key(el, "ArrowDown");
    key(el, "F2");
    const box = input(el)!;
    box.value = "OC-2 nuevo";
    box.setSelectionRange(3, 3);
    expect(document.activeElement).toBe(box);
    el.rows = ROWS.map((r) => ({ ...r, monto: (r.monto as number) + 1 }));
    el.search = "oc";
    el.columns = [...COLS];
    el.filters = [{ key: "monto", op: "range", min: 0 }];
    expect(input(el)).toBe(box);
    expect(document.activeElement).toBe(box);
    expect([box.selectionStart, box.selectionEnd]).toEqual([3, 3]);
    expect(got).toEqual([]);
    // Lo nuevo de la app se ve en las demás celdas.
    expect(column(el, 2)[0]).toContain("301");
    // Quitar la columna que se edita: ya no hay dónde guardarlo.
    el.removeColumn("oc");
    expect(input(el)).toBeNull();
    expect(got).toEqual([]);
  });

  it("abrir el editor y salir sin tocarlo no guarda nada", () => {
    const el = mount();
    const got = changes(el);
    key(el, "F2");
    enter(el);
    expect(got).toEqual([]);
  });
});

describe("el editor numérico respeta el locale", () => {
  it("0.125 se abre como «0,125» en es-CO y vuelve igual (no 125)", () => {
    const el = mount("", [{ id: "1", oc: "OC-1", prov: "A", monto: 0.125 }]);
    const got = changes(el);
    key(el, "End");
    key(el, "F2");
    expect(input(el)!.value).toBe("0,125");
    enter(el);
    expect(got).toEqual([]);
    expect(el.rows[0].monto).toBe(0.125);
    // Tocado: se lee con el locale de la tabla.
    key(el, "ArrowUp");
    key(el, "F2");
    input(el)!.value = "1234,5";
    enter(el);
    expect(el.rows[0].monto).toBe(1234.5);
  });

  it("en en-US va con punto, y un número muy pequeño no sale en notación científica", () => {
    const el = mount('locale="en-US"', [{ id: "1", oc: "OC-1", prov: "A", monto: 1.234 }, { id: "2", oc: "OC-2", prov: "A", monto: 1e-7 }]);
    key(el, "End");
    key(el, "F2");
    expect(input(el)!.value).toBe("1.234");
    enter(el);
    expect(el.rows[0].monto).toBe(1.234);
    key(el, "F2");
    expect(input(el)!.value).toBe("0.0000001");
  });
});

describe("al desplazarse mientras se edita", () => {
  const many = Array.from({ length: 2000 }, (_, i) => ({ id: String(i), oc: `OC-${i}`, prov: "A", monto: i }));

  it("la tabla sigue al scroll; si la fila editada sale de la vista, la edición se guarda", async () => {
    const el = mount("", many);
    const got = changes(el);
    key(el, "F2");
    input(el)!.value = "X";
    // Un poco: la fila de la edición sigue en la vista y conserva su campo.
    scroll(el).scrollTop = 32 * 3;
    scroll(el).dispatchEvent(new Event("scroll"));
    await sleep(30);
    expect(input(el)).not.toBeNull();
    expect(el.querySelector('.nx-grid__row[data-r="20"]')).not.toBeNull();
    // Mucho: antes quedaban las filas 0-21 y el área visible en blanco.
    scroll(el).scrollTop = 20_000;
    scroll(el).dispatchEvent(new Event("scroll"));
    await sleep(30);
    const rows = [...el.querySelectorAll<HTMLElement>(".nx-grid__row")].map((x) => Number(x.dataset.r));
    expect(rows[0]).toBeGreaterThan(600);
    expect(got).toEqual([{ id: "0", key: "oc", value: "X", old: "OC-0" }]);
    expect(input(el)).toBeNull();
  });
});

describe("row-key", () => {
  it("asignado después de rows, los id salen de esa columna", () => {
    const el = mount();
    el.rowKey = "codigo";
    const got = changes(el);
    key(el, "F2");
    input(el)!.value = "Z";
    enter(el);
    expect(got).toEqual([{ id: "A", key: "oc", value: "Z", old: "OC-1" }]);
  });

  it("con el elemento fuera del DOM (como lo arma Solid): rows antes que el atributo", () => {
    const el = document.createElement("nx-grid");
    el.columns = COLS;
    el.rows = ROWS;
    el.setAttribute("row-key", "codigo");
    el.selectable = true;
    document.body.append(el);
    el.querySelector<HTMLInputElement>('[data-r="1"] input[data-pick]')!.click();
    expect(el.selected).toEqual(["B"]);
  });
});

describe("ids repetidos", () => {
  it("editar la primera de dos filas con el mismo id no cambia la otra, y se avisa", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount("", [
      { id: "1", oc: "a", prov: "A", monto: 1 },
      { id: "1", oc: "b", prov: "A", monto: 2 },
    ]);
    expect(warn).toHaveBeenCalledOnce();
    key(el, "F2");
    input(el)!.value = "NUEVO";
    enter(el);
    expect(el.rows.map((r) => r.oc)).toEqual(["NUEVO", "b"]);
  });
});

describe("columnas y filtros de BDUI mal formados", () => {
  it("options que no son lista y width de texto no rompen la tabla", () => {
    const el = mount("", ROWS, [
      { key: "oc", label: "Pedido", width: "200" as unknown as number },
      { key: "prov", label: "Prov", type: "status", options: { a: 1 } as unknown as [] },
      { key: "monto", label: "Monto", type: "raro" as "text", width: -5 },
    ]);
    el.sort = { key: "prov", dir: 1 };
    expect(el.columns[0].width).toBe(200);
    expect(el.columns[1].options).toBeUndefined();
    expect(el.columns[2].type).toBeUndefined();
    expect(el.columns[2].width).toBeUndefined();
    expect(scroll(el).style.getPropertyValue("--_w")).toBe(`${200 + 130 + 180}px`);
    expect(column(el, 1)).toEqual(["Aceros", "Aceros", "Empaques"]);
  });

  it("una columna correcta queda como llegó", () => {
    const el = mount();
    expect(el.columns[2]).toBe(COLS[2]);
  });

  it("values numéricos en «in» coinciden, y un tramo con números en texto compara como número", () => {
    const el = mount("", [
      { id: "1", nivel: 1, oc: "OC-1", prov: "A", monto: 9000 },
      { id: "2", nivel: 2, oc: "OC-2", prov: "A", monto: 60000 },
    ]);
    el.filters = [{ key: "nivel", op: "in", values: [1] as unknown as string[] }];
    expect(el.count).toBe(1);
    expect(el.filters).toEqual([{ key: "nivel", op: "in", values: ["1"] }]);
    el.filters = [{ key: "monto", op: "range", min: "50000" }];
    expect(el.count).toBe(1);
    expect(column(el, 0)).toEqual(["OC-2"]);
    // Un `rel` desconocido sin bordes no deja un filtro que no filtra nada.
    el.filters = [{ key: "monto", op: "range", rel: "ayer" as "past" }];
    expect(el.filters).toEqual([]);
  });
});

describe("el orden no se rehace al filtrar", () => {
  it("buscar o filtrar recorre el orden ya hecho (sin volver a comparar textos)", () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({ id: String(i), oc: `OC-${(i * 7919) % 400}`, prov: i % 2 ? "Aceros" : "Empaques", monto: i }));
    const el = mount("", rows);
    const f = nxFormat("es-CO");
    const compare = vi.spyOn(f, "compare");
    el.sort = { key: "oc", dir: 1 };
    const first = compare.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    el.search = "OC-1";
    el.filters = [{ key: "prov", op: "in", values: ["Aceros"] }];
    el.search = "";
    expect(compare.mock.calls.length).toBe(first);
    // El resultado es el mismo que ordenar lo filtrado.
    const shown = column(el, 0);
    expect(shown).toEqual([...shown].sort(f.compare));
    expect(el.count).toBe(200);
    // Editar la columna del orden: el siguiente filtro ya lo ve.
    el.sort = { key: "monto", dir: -1 };
    el.filters = [];
    const top = () => el.querySelector('.nx-grid__row[data-r="0"] > [data-c="0"]')!.textContent;
    const was = top();
    key(el, "End");
    key(el, "F2");
    input(el)!.value = "-1";
    enter(el);
    expect(top()).toBe(was); // editar no reordena…
    el.search = "OC";
    expect(top()).not.toBe(was); // …pero la búsqueda siguiente sí ve el valor nuevo
  });
});

describe("modo servidor", () => {
  it("si el primer bloque falla: lo dice, emite nx-grid-error y «Reintentar» vuelve a pedir", async () => {
    let fail = true;
    const fetch = vi.fn(async () => (fail ? new Response("x", { status: 500 }) : new Response(JSON.stringify({ rows: [{ id: "1", oc: "OC-1" }], total: 1 }))));
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    const errors: unknown[] = [];
    el.addEventListener("nx-grid-error", (e) => errors.push(e.detail));
    el.columns = COLS;
    await sleep(20);
    const empty = el.querySelector<HTMLElement>(".nx-grid__empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.classList.contains("is-loading")).toBe(false);
    expect(empty.textContent).toBe("No se pudieron cargar las filasReintentar");
    expect(errors).toEqual([{ offset: 0, limit: 100, error: "HTTP 500" }]);
    fail = false;
    empty.querySelector<HTMLButtonElement>("[data-retry]")!.click();
    await sleep(20);
    expect(empty.hidden).toBe(true);
    expect(column(el, 0)).toEqual(["OC-1"]);
  });

  it("un bloque que falla no se vuelve a pedir en cada cuadro del scroll", async () => {
    const fetch = vi.fn(async () => new Response("x", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    await sleep(20);
    const calls = fetch.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      scroll(el).dispatchEvent(new Event("scroll"));
      await sleep(20);
    }
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it("con un tope por página menor que el bloque, pide lo que falta y el bloque se llena", async () => {
    const all = Array.from({ length: 250 }, (_, i) => ({ id: `r${i}`, oc: `OC-${i}` }));
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ rows: all.slice(q.offset, q.offset + Math.min(q.limit, 50)), total: all.length }));
    });
    vi.stubGlobal("fetch", fetch);
    document.body.innerHTML = '<nx-grid source="/datos"></nx-grid>';
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    await sleep(30);
    expect(fetch.mock.calls.map((c) => [body(c).offset, body(c).limit])).toEqual([
      [0, 100],
      [50, 50],
    ]);
    scroll(el).scrollTop = 55 * 32;
    scroll(el).dispatchEvent(new Event("scroll"));
    await sleep(30);
    expect(el.querySelectorAll(".nx-grid__row.is-loading")).toHaveLength(0);
    expect(el.querySelector('.nx-grid__row[data-r="60"] > [data-c="0"]')!.textContent).toBe("OC-60");
  });

  it("al montar se pide una vez, aunque las columnas lleguen después de conectarse", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ rows: [{ id: "1", oc: "OC-1" }], total: 1 })));
    vi.stubGlobal("fetch", fetch);
    const el = mount('source="/datos"');
    await sleep(20);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(column(el, 0)).toEqual(["OC-1"]);
    el.columns = [...COLS].reverse();
    await sleep(20);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(column(el, 2)).toEqual(["OC-1"]);
  });

  it("exportar toma la consulta al empezar: filtrar mientras exporta no mezcla consultas", async () => {
    const all = Array.from({ length: 12_000 }, (_, i) => ({ id: `r${i}`, oc: `OC-${i}`, prov: i % 2 ? "A" : "B" }));
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      await sleep(5);
      return new Response(JSON.stringify({ rows: all.slice(q.offset, q.offset + q.limit), total: all.length }));
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("CompressionStream", undefined);
    URL.createObjectURL = () => "blob:x";
    URL.revokeObjectURL = () => {};
    // happy-dom navegaría al `blob:` (un navegador descarga por el atributo `download`).
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const el = mount('source="/datos"');
    await sleep(20);
    const done = el.exportXlsx();
    await sleep(8);
    el.filters = [{ key: "prov", op: "in", values: ["A"] }];
    expect(await done).toBe(12_000);
    const exports = fetch.mock.calls.map(body).filter((b) => b.limit === 5000);
    expect(exports.map((b) => b.filters.length)).toEqual([0, 0, 0]);
  });

  it("salir del DOM corta lo que estaba en camino y la búsqueda pendiente no pide nada", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ rows: [{ id: "1", oc: "OC-1" }], total: 1 })));
    vi.stubGlobal("fetch", fetch);
    const el = mount('source="/datos"');
    await sleep(20);
    const calls = fetch.mock.calls.length;
    const box = el.querySelector<HTMLInputElement>(".nx-grid__search-input")!;
    box.value = "OC";
    box.dispatchEvent(new Event("input"));
    el.remove();
    await sleep(400);
    expect(fetch.mock.calls.length).toBe(calls);
  });

  it("con muchísimas filas el alto del cuerpo tiene tope y el final se alcanza", async () => {
    const total = 1_000_000;
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ rows: Array.from({ length: Math.min(q.limit, total - q.offset) }, (_, i) => ({ id: String(q.offset + i), oc: `OC-${q.offset + i}` })), total }));
    });
    vi.stubGlobal("fetch", fetch);
    const el = mount('source="/datos"');
    const s = scroll(el);
    const tall = el.querySelector<HTMLElement>(".nx-grid__body")!;
    // Lo que llega por `fetch` se espera por su efecto, no con una pausa fija (bajo carga no alcanza).
    await vi.waitFor(() => expect(tall.style.blockSize).toBe("8000000px"));
    // happy-dom no maqueta: el alto del scroller y su recorrido se fijan aquí.
    Object.defineProperty(s, "clientHeight", { value: 420, configurable: true });
    Object.defineProperty(s, "scrollHeight", { value: 8_000_000 + 40, configurable: true });
    s.scrollTop = 8_000_040 - 420;
    s.dispatchEvent(new Event("scroll"));
    const last = () => [...el.querySelectorAll<HTMLElement>(".nx-grid__row")].map((x) => Number(x.dataset.r)).at(-1);
    await vi.waitFor(() => expect(last()).toBe(total - 1));
    expect(el.querySelector(`.nx-grid__row[data-r="${total - 1}"] > [data-c="0"]`)!.textContent).toBe(`OC-${total - 1}`);
  });
});

describe("teclado: la tabla es una sola parada de Tab", () => {
  it("los controles de la cabecera no están en el orden de Tab; ↑ sube a la cabecera y ←/→ la recorren", () => {
    const el = mount("selectable");
    for (const x of el.querySelectorAll(".nx-grid__head button, .nx-grid__head [role=separator], .nx-grid__head input")) expect(x.getAttribute("tabindex")).toBe("-1");
    scroll(el).focus();
    key(el, "ArrowRight");
    key(el, "ArrowUp");
    const sorts = [...el.querySelectorAll<HTMLElement>(".nx-grid__sort")];
    expect(document.activeElement).toBe(sorts[1]);
    sorts[1].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(sorts[2]);
    sorts[2].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(el.querySelector(".nx-grid__head input[data-pick-all]"));
    (document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(sorts[2]);
    // Ctrl+→ cambia el ancho; ↓ vuelve a las celdas, en la misma columna.
    sorts[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", ctrlKey: true, bubbles: true }));
    expect(el.view.widths).toEqual({ monto: 156 });
    sorts[2].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(scroll(el));
    expect(scroll(el).getAttribute("aria-activedescendant")).toMatch(/-0-2$/);
  });

  it("con selectable, aria-colcount y aria-colindex cuentan la columna de casillas", () => {
    const el = mount("selectable");
    expect(scroll(el).getAttribute("aria-colcount")).toBe("4");
    expect([...el.querySelectorAll(".nx-grid__head > [role=columnheader]")].map((x) => x.getAttribute("aria-colindex"))).toEqual(["1", "2", "3", "4"]);
    expect([...el.querySelector('.nx-grid__row[data-r="0"]')!.children].map((x) => x.getAttribute("aria-colindex"))).toEqual(["1", "2", "3", "4"]);
  });

  it("cambiar labels cambia los nombres de la cabecera; «seleccionar todo» dice cuántas", () => {
    const el = mount("selectable");
    const all = el.querySelector(".nx-grid__head input[data-pick-all]")!;
    expect(all.getAttribute("aria-label")).toBe("Seleccionar las 3");
    el.labels = { resize: "Width of {col}", selectAll: "Select all {n}" };
    expect(el.querySelector(".nx-grid__resize")!.getAttribute("aria-label")).toBe("Width of Pedido");
    expect(all.getAttribute("aria-label")).toBe("Select all 3");
  });
});

describe("detalles", () => {
  it("una columna «constructor» en filas que no la traen queda vacía", () => {
    const el = mount("", ROWS, [{ key: "constructor", label: "Constructor" }, ...COLS]);
    expect(column(el, 0)).toEqual(["", "", ""]);
  });

  it("quitar height quita el alto", () => {
    const el = mount('height="600"');
    expect(el.style.getPropertyValue("--nx-grid-height")).toBe("600px");
    el.removeAttribute("height");
    expect(el.style.getPropertyValue("--nx-grid-height")).toBe("");
  });

  it("el destello de copiar se quita al terminar", async () => {
    const el = mount();
    const dt = new DataTransfer();
    const ev = new Event("copy", { bubbles: true }) as ClipboardEvent;
    Object.defineProperty(ev, "clipboardData", { value: dt });
    scroll(el).dispatchEvent(ev);
    expect(scroll(el).classList.contains("is-copied")).toBe(true);
    await sleep(650);
    expect(scroll(el).classList.contains("is-copied")).toBe(false);
  });
});
