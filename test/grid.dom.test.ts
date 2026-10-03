// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import { GRID_LABELS, type GridColumn, type GridRow, type NxGrid } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "prov", label: "Proveedor" },
  { key: "estado", label: "Estado", type: "status", editable: true, options: [{ value: "pend", label: "Pendiente", tone: "warning" }, { value: "apr", label: "Aprobado", tone: "info" }] },
  { key: "monto", label: "Monto", type: "money", editable: true },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "OC-1", prov: "Aceros", estado: "pend", monto: 8_000_000 },
  { id: "2", oc: "OC-2", prov: "Empaques", estado: "apr", monto: 1_000_000 },
  { id: "3", oc: "OC-3", prov: "Aceros", estado: "apr", monto: 500_000 },
  { id: "4", oc: "OC-4", prov: "Químicos", estado: "pend", monto: 3_000_000 },
];

const tick = () => new Promise((r) => setTimeout(r, 0));

function mount(attrs = ""): NxGrid {
  document.body.innerHTML = `<nx-grid ${attrs}></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = COLS;
  el.rows = ROWS;
  return el;
}

const scroll = (el: NxGrid) => el.querySelector<HTMLElement>(".nx-grid__scroll")!;
const cellText = (el: NxGrid, r: number, c: number) => el.querySelector(`[data-r="${r}"] > [data-c="${c}"]`)?.textContent;
const column = (el: NxGrid, c: number) => [...el.querySelectorAll(`.nx-grid__row:not(.nx-grid__row--group) > [data-c="${c}"]`)].map((x) => x.textContent);
const chips = (el: NxGrid) => [...el.querySelectorAll(".nx-grid__chip")].map((c) => c.textContent);
const key = (el: NxGrid, k: string, init: KeyboardEventInit = {}) => scroll(el).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
const foot = (el: NxGrid) => el.querySelector(".nx-grid__foot")!.textContent;
/** El panel del filtro se carga aparte: espera a que muestre esa columna. */
async function panel(el: NxGrid, title: string): Promise<HTMLElement> {
  for (let i = 0; i < 200 && el.querySelector(".nx-grid__filter .nx-grid__f-head")?.textContent !== title; i++) await new Promise((r) => setTimeout(r, 10));
  const pop = el.querySelector<HTMLElement>(".nx-grid__filter")!;
  expect(pop.querySelector(".nx-grid__f-head")!.textContent).toBe(title);
  return pop;
}

describe("<nx-grid>", () => {
  it("pinta cabeceras, filas y el pie; el texto va como texto", () => {
    const el = mount();
    el.rows = [...ROWS, { id: "5", oc: "<img src=x onerror=alert(1)>", prov: "Aceros", estado: "pend", monto: 1 }];
    expect([...el.querySelectorAll(".nx-grid__th-label")].map((x) => x.textContent)).toEqual(["Pedido", "Proveedor", "Estado", "Monto"]);
    expect(scroll(el).getAttribute("role")).toBe("grid");
    expect(column(el, 0)).toContain("<img src=x onerror=alert(1)>");
    expect(el.querySelector("img")).toBeNull();
    expect(cellText(el, 0, 3)).toBe("$ 8.000.000");
    expect(el.querySelector(`[data-r="0"] > [data-c="2"] .nx-grid__pill`)!.getAttribute("data-tone")).toBe("warning");
    expect(foot(el)).toContain("5 filas");
  });

  it("los atributos JSON funcionan; JSON inválido se ignora sin romper", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `<nx-grid columns='${JSON.stringify(COLS)}' rows='${JSON.stringify(ROWS)}'></nx-grid>`;
    const el = document.querySelector("nx-grid")!;
    expect(column(el, 0)).toEqual(["OC-1", "OC-2", "OC-3", "OC-4"]);
    el.setAttribute("rows", "{no es json");
    expect(warn).toHaveBeenCalled();
    expect(el.rows).toHaveLength(4);
    warn.mockRestore();
  });

  it("no modifica las filas originales", () => {
    const rows = ROWS.map((r) => ({ ...r }));
    const el = mount();
    el.rows = rows;
    el.rows[0].monto = 1;
    expect(rows[0].monto).toBe(8_000_000);
  });

  it("grid.rows = grid.rows recalcula sin copiar (tras cambiar filas por fuera)", () => {
    const el = mount();
    const first = el.rows[0];
    first.estado = "apr";
    el.rows = el.rows;
    expect(el.rows[0]).toBe(first);
    expect(cellText(el, 0, 2)).toBe("Aprobado");
  });

  it("clic en la etiqueta ordena: ascendente, descendente, sin orden", () => {
    const el = mount();
    const sort = el.querySelectorAll<HTMLButtonElement>(".nx-grid__sort")[3];
    sort.click();
    expect(column(el, 0)).toEqual(["OC-3", "OC-2", "OC-4", "OC-1"]);
    expect(sort.parentElement!.getAttribute("aria-sort")).toBe("ascending");
    sort.click();
    expect(column(el, 0)).toEqual(["OC-1", "OC-4", "OC-2", "OC-3"]);
    sort.click();
    expect(column(el, 0)).toEqual(["OC-1", "OC-2", "OC-3", "OC-4"]);
    expect(el.sort).toBeNull();
  });

  it("embudo → lista: conteos, desmarcar filtra al instante, «Solo», y el chip vuelve a abrir el filtro", async () => {
    const el = mount();
    const events: unknown[] = [];
    el.addEventListener("nx-grid-filter", (e) => events.push(e.detail));
    const funnels = el.querySelectorAll<HTMLButtonElement>(".nx-grid__funnel");
    expect(funnels).toHaveLength(4);
    expect(funnels[2].getAttribute("aria-label")).toBe("Filtrar Estado");
    expect(el.querySelector(".nx-grid__hist, .nx-grid__hbar")).toBeNull();
    funnels[2].click();
    const pop = await panel(el, "Estado");
    expect(funnels[2].getAttribute("aria-expanded")).toBe("true");
    const opt = (v: string) => pop.querySelector<HTMLInputElement>(`input[data-v="${v}"]`)!;
    expect([opt("pend").checked, opt("apr").checked]).toEqual([true, true]);
    expect([...pop.querySelectorAll(".nx-grid__opt-n")].map((x) => x.textContent)).toEqual(["2", "2"]);
    opt("apr").click();
    expect(el.filters).toEqual([{ key: "estado", op: "in", values: ["pend"] }]);
    expect(column(el, 0)).toEqual(["OC-1", "OC-4"]);
    expect(pop.querySelector(".nx-grid__f-left")!.textContent).toBe("Quedan 2 de 4");
    expect(chips(el)).toEqual(["Estado: Pendiente"]);
    expect(funnels[2].classList.contains("is-on")).toBe(true);
    expect(funnels[2].getAttribute("aria-label")).toBe("Cambiar el filtro «Estado: Pendiente»");
    expect(events).toHaveLength(1);
    pop.querySelector<HTMLButtonElement>('[data-only="apr"]')!.click();
    expect(el.filters).toEqual([{ key: "estado", op: "in", values: ["apr"] }]);
    // «Listo» cierra; el chip lo vuelve a abrir; la × lo quita.
    pop.querySelector<HTMLButtonElement>(".nx-grid__f-foot .nx-grid__btn")!.click();
    expect(funnels[2].getAttribute("aria-expanded")).toBe("false");
    el.querySelector<HTMLButtonElement>(".nx-grid__chip-edit")!.click();
    await panel(el, "Estado");
    expect(funnels[2].getAttribute("aria-expanded")).toBe("true");
    el.querySelector<HTMLButtonElement>(".nx-grid__chip [data-i]")!.click();
    expect(el.filters).toEqual([]);
    expect(opt("apr").checked).toBe(true);
  });

  it("con más de la mitad marcada se guarda como exclusión, y el panel de facetas la entiende", async () => {
    const el = mount("facets-open");
    await el.openFilter("prov");
    const pop = await panel(el, "Proveedor");
    pop.querySelector<HTMLInputElement>('input[data-v="Químicos"]')!.click();
    expect(el.filters).toEqual([{ key: "prov", op: "notIn", values: ["Químicos"] }]);
    expect(chips(el)).toEqual(["Proveedor: sin Químicos"]);
    const aside = el.querySelector<HTMLElement>(".nx-grid__facets")!;
    const box = (v: string) => aside.querySelector<HTMLInputElement>(`input[data-value="${v}"]`)!;
    expect([box("Aceros").checked, box("Empaques").checked, box("Químicos").checked]).toEqual([true, true, false]);
    box("Empaques").click();
    expect(el.filters).toEqual([{ key: "prov", op: "in", values: ["Aceros"] }]);
    expect(pop.querySelector<HTMLInputElement>('input[data-v="Empaques"]')!.checked).toBe(false);
  });

  it("rango: barras y campos que aceptan «1 M» o «3 millones»; «Hasta» incluye lo escrito", async () => {
    const el = mount();
    await el.openFilter("monto");
    const pop = await panel(el, "Monto");
    expect(pop.querySelectorAll(".nx-grid__fbar").length).toBeGreaterThan(1);
    const [from, to] = pop.querySelectorAll<HTMLInputElement>(".nx-grid__f-pair input");
    from.value = "1 M";
    from.dispatchEvent(new Event("change"));
    expect(el.filters).toEqual([{ key: "monto", op: "range", min: 1_000_000 }]);
    expect(column(el, 0)).toEqual(["OC-1", "OC-2", "OC-4"]);
    to.value = "3 millones";
    to.dispatchEvent(new Event("change"));
    expect(column(el, 0)).toEqual(["OC-2", "OC-4"]);
    expect(chips(el)).toEqual(["Monto: $1 M – $3 M"]);
    expect(to.value).toBe("$ 3.000.000");
    // Clic en una barra: ese tramo.
    pop.querySelector<HTMLElement>(".nx-grid__fbar")!.click();
    expect((el.filters[0] as { min?: number }).min).toBeUndefined();
  });

  it("fechas: tramos relativos con su conteo, que se guardan como `rel` y se recalculan al asignarlos", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    try {
      const el = mount();
      el.columns = [...COLS, { key: "fecha", label: "Fecha", type: "date" }];
      el.rows = ROWS.map((r, i) => ({ ...r, fecha: ["2026-09-02", "2026-09-28", "2026-10-10", "2026-08-15"][i] }));
      await el.openFilter("fecha");
      const pop = await panel(el, "Fecha");
      const radio = (v: string) => pop.querySelector<HTMLInputElement>(`input[value="${v}"]`)!;
      const n = (v: string) => radio(v).closest("label")!.querySelector(".nx-grid__opt-n")!.textContent;
      expect([n("past"), n("next30"), n("month"), n("lastMonth")]).toEqual(["3", "1", "2", "1"]);
      expect(radio("any").checked).toBe(true);
      radio("month").click();
      expect(el.filters).toEqual([{ key: "fecha", op: "range", rel: "month", min: "2026-09-01", max: "2026-10-01" }]);
      expect(chips(el)).toEqual(["Fecha: este mes"]);
      expect(column(el, 0)).toEqual(["OC-1", "OC-2"]);
      // Entre dos fechas: «Hasta» incluye ese día.
      radio("custom").click();
      const [from, to] = pop.querySelectorAll<HTMLInputElement>(".nx-grid__f-pair input");
      expect(from.value).toBe("2026-09-01");
      to.value = "2026-09-28";
      to.dispatchEvent(new Event("change"));
      expect(el.filters).toEqual([{ key: "fecha", op: "range", min: "2026-09-01", max: "2026-09-29" }]);
      expect(chips(el)).toEqual(["Fecha: 1 sept 2026 – 28 sept 2026"]);
      // Una vista guardada otro mes se recalcula con la fecha de hoy.
      el.filters = [{ key: "fecha", op: "range", rel: "month", min: "2020-01-01", max: "2020-02-01" }];
      expect(el.filters[0]).toMatchObject({ min: "2026-09-01", max: "2026-10-01" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("texto con un valor por fila: «contiene», con ejemplos marcados", async () => {
    const el = mount();
    await el.openFilter("oc");
    const pop = await panel(el, "Pedido");
    const input = pop.querySelector<HTMLInputElement>('input[type="search"]')!;
    input.value = "oc-3";
    input.dispatchEvent(new Event("input"));
    await new Promise((r) => setTimeout(r, 200));
    expect(el.filters).toEqual([{ key: "oc", op: "contains", value: "oc-3" }]);
    expect(column(el, 0)).toEqual(["OC-3"]);
    expect(pop.querySelector(".nx-grid__f-sample mark")!.textContent).toBe("OC-3");
    expect(pop.querySelector(".nx-grid__f-stack > .nx-grid__f-hint")!.textContent).toBe("1 fila coincide");
    // Lo que queda lo anuncia una sola región viva, la de la tabla (no dos o tres a la vez).
    expect(pop.querySelectorAll("[role=status]")).toHaveLength(0);
  });

  it("clic derecho en una celda: «Solo» o «Sin» ese valor, «Desde» un monto", async () => {
    const el = mount();
    const menuOn = async (r: number, c: number) => {
      el.querySelector(".nx-grid__menu")?.replaceChildren();
      el.querySelector(`[data-r="${r}"] > [data-c="${c}"]`)!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
      for (let i = 0; i < 100 && !el.querySelector(".nx-grid__menu-item"); i++) await new Promise((res) => setTimeout(res, 10));
      return [...el.querySelectorAll<HTMLButtonElement>(".nx-grid__menu-item")];
    };
    const items = await menuOn(0, 1);
    expect(items.map((b) => b.textContent)).toEqual(["Solo «Aceros»", "Sin «Aceros»", "Más filtros de Proveedor…"]);
    items[1].click();
    expect(el.filters).toEqual([{ key: "prov", op: "notIn", values: ["Aceros"] }]);
    expect(column(el, 0)).toEqual(["OC-2", "OC-4"]);
    const money = await menuOn(1, 3);
    expect(money[0].textContent).toBe("Desde $ 3.000.000");
    money[0].click();
    expect(column(el, 0)).toEqual(["OC-4"]);
  });

  it("Alt+↓ abre el filtro de la columna activa; Escape lo cierra y devuelve el foco al embudo", async () => {
    const el = mount();
    key(el, "ArrowRight");
    key(el, "ArrowRight");
    key(el, "ArrowDown", { altKey: true });
    const pop = await panel(el, "Estado");
    const funnel = el.querySelectorAll<HTMLElement>(".nx-grid__funnel")[2];
    expect(pop.contains(document.activeElement)).toBe(true);
    document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect(funnel.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(funnel);
  });

  it("si no queda ninguna fila, propone qué filtro quitar y cuántas filas volverían", () => {
    const el = mount();
    el.filters = [
      { key: "prov", op: "in", values: ["Químicos"] },
      { key: "estado", op: "in", values: ["apr"] },
    ];
    const empty = el.querySelector<HTMLElement>(".nx-grid__empty")!;
    expect(empty.hidden).toBe(false);
    const btns = [...empty.querySelectorAll<HTMLButtonElement>("button")];
    expect(btns.map((b) => b.textContent)).toEqual(["Quitar «Proveedor: Químicos»: vuelven 2 filas", "Quitar «Estado: Aprobado»: vuelve 1 fila"]);
    btns[1].click();
    expect(el.filters).toEqual([{ key: "prov", op: "in", values: ["Químicos"] }]);
    expect(column(el, 0)).toEqual(["OC-4"]);
  });

  it("filter: false quita el embudo", () => {
    const el = mount();
    el.columns = COLS.map((c) => (c.key === "prov" ? { ...c, filter: false as const } : c));
    expect([...el.querySelectorAll(".nx-grid__th")].map((th) => !!th.querySelector(".nx-grid__funnel"))).toEqual([true, false, true, true]);
  });

  it("panel de facetas: conteos sin la propia faceta, opciones en 0 deshabilitadas", () => {
    const el = mount("facets-open");
    const aside = el.querySelector<HTMLElement>(".nx-grid__facets")!;
    expect(aside.hidden).toBe(false);
    expect([...aside.querySelectorAll(".nx-grid__facet-title")].map((t) => t.textContent)).toEqual(["Proveedor", "Estado"]);
    const box = (v: string) => aside.querySelector<HTMLInputElement>(`input[data-value="${v}"]`)!;
    box("Aceros").click();
    expect(column(el, 0)).toEqual(["OC-1", "OC-3"]);
    const aside2 = el.querySelector<HTMLElement>(".nx-grid__facets")!;
    const opt = (v: string) => aside2.querySelector<HTMLInputElement>(`input[data-value="${v}"]`)!;
    // Proveedor no se cuenta a sí mismo: los demás siguen disponibles.
    expect(opt("Empaques").disabled).toBe(false);
    // Estado sí se restringe por proveedor.
    expect(opt("pend").closest("label")!.textContent).toContain("1");
    expect(el.querySelector(".nx-grid__badge")!.textContent).toBe("1");
    // Botón «Filtros» muestra u oculta el panel.
    el.querySelector<HTMLButtonElement>(".nx-grid__bar .nx-grid__btn[aria-controls]")!.click();
    expect(el.facetsOpen).toBe(false);
    expect(el.querySelector<HTMLElement>(".nx-grid__facets")!.hidden).toBe(true);
  });

  it("teclado: mover, extender el rango y ver las estadísticas en el pie", () => {
    const el = mount();
    key(el, "End");
    key(el, "ArrowDown", { shiftKey: true });
    key(el, "ArrowDown", { shiftKey: true });
    expect(scroll(el).getAttribute("aria-activedescendant")).toMatch(/-2-3$/);
    expect(el.querySelectorAll(".is-sel")).toHaveLength(3);
    expect(foot(el)).toContain("3 celdas");
    expect(foot(el)).toContain("Suma $ 9.500.000");
    key(el, "Escape");
    expect(el.querySelectorAll(".is-sel")).toHaveLength(0);
    key(el, "a", { ctrlKey: true });
    expect(foot(el)).toContain("16 celdas");
  });

  it("editar: escribir empieza, Enter guarda y baja; nx-grid-change es cancelable", () => {
    const el = mount();
    const changes: unknown[] = [];
    el.addEventListener("nx-grid-change", (e) => changes.push(...e.detail.changes));
    key(el, "End");
    key(el, "7");
    const input = el.querySelector<HTMLInputElement>(".nx-grid__input")!;
    expect(input.value).toBe("7");
    input.value = "7.500.000";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(changes).toEqual([{ id: "1", key: "monto", value: 7_500_000, old: 8_000_000 }]);
    expect(cellText(el, 0, 3)).toBe("$ 7.500.000");
    expect(el.querySelector('[data-r="0"] > [data-c="3"]')!.classList.contains("is-edited")).toBe(true);
    expect(scroll(el).getAttribute("aria-activedescendant")).toMatch(/-1-3$/);
    // Cancelada: no se aplica.
    el.addEventListener("nx-grid-change", (e) => e.preventDefault());
    key(el, "F2");
    const again = el.querySelector<HTMLInputElement>(".nx-grid__input")!;
    again.value = "1";
    again.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(el.rows[1].monto).toBe(1_000_000);
  });

  it("Esc cancela la edición; las columnas no editables no se editan", () => {
    const el = mount();
    key(el, "Enter");
    expect(el.querySelector(".nx-grid__input")).toBeNull();
    key(el, "End");
    key(el, "F2");
    const input = el.querySelector<HTMLInputElement>(".nx-grid__input")!;
    input.value = "99";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el.rows[0].monto).toBe(8_000_000);
  });

  it("copiar da TSV (números sin formato); pegar llena las columnas editables", () => {
    const el = mount();
    key(el, "ArrowRight");
    key(el, "ArrowRight");
    key(el, "ArrowRight", { shiftKey: true });
    key(el, "ArrowDown", { shiftKey: true });
    const dt = new DataTransfer();
    scroll(el).dispatchEvent(new ClipboardEvent("copy", { clipboardData: dt, bubbles: true, cancelable: true }));
    expect(dt.getData("text/plain")).toBe("Pendiente\t8000000\nAprobado\t1000000");
    key(el, "ArrowUp");
    key(el, "ArrowLeft");
    const paste = new DataTransfer();
    paste.setData("text/plain", "aprobado\t2.000.000\r\npend\t3000\r\n");
    scroll(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: paste, bubbles: true, cancelable: true }));
    expect(el.rows.slice(0, 2).map((r) => [r.estado, r.monto])).toEqual([
      ["apr", 2_000_000],
      ["pend", 3000],
    ]);
    // Texto que no es número en una columna numérica: se deja la celda como estaba.
    const bad = new DataTransfer();
    bad.setData("text/plain", "mucho");
    key(el, "ArrowRight");
    scroll(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: bad, bubbles: true, cancelable: true }));
    expect(el.rows[0].monto).toBe(2_000_000);
  });

  it("Supr borra las celdas editables del rango", () => {
    const el = mount();
    key(el, "End");
    key(el, "Home", { shiftKey: true });
    key(el, "Delete");
    expect(el.rows[0]).toMatchObject({ oc: "OC-1", estado: null, monto: null });
  });

  it("agrupa con subtotales y se pliega", () => {
    const el = mount('group-by="prov"');
    const groups = () => [...el.querySelectorAll(".nx-grid__row--group")];
    expect(groups().map((g) => g.querySelector(".nx-grid__g-label")!.textContent)).toEqual(["Aceros", "Empaques", "Químicos"]);
    expect(groups()[0].querySelector('[data-c="3"]')!.textContent).toBe("$ 8.500.000");
    expect(el.querySelector<HTMLSelectElement>(".nx-grid__group")!.value).toBe("prov");
    key(el, "Enter");
    expect(groups()[0].getAttribute("aria-expanded")).toBe("false");
    expect(column(el, 0)).toEqual(["OC-2", "OC-4"]);
  });

  it("removeColumn quita la columna con su filtro y su orden", () => {
    const el = mount();
    const counts: number[] = [];
    el.addEventListener("nx-grid-columns", (e) => counts.push(e.detail.columns.length));
    el.filters = [{ key: "prov", op: "in", values: ["Aceros"] }];
    el.sort = { key: "prov", dir: -1 };
    el.removeColumn("prov");
    expect(el.columns.map((c) => c.key)).toEqual(["oc", "estado", "monto"]);
    expect(el.filters).toEqual([]);
    expect(el.sort).toBeNull();
    expect(counts).toEqual([3]);
    expect(column(el, 0)).toEqual(["OC-1", "OC-2", "OC-3", "OC-4"]);
  });

  it("sin columnas de IA ni filtro de frases", () => {
    const el = mount('ai-endpoint="/ia" nl-endpoint="/nl"');
    expect(el.querySelector(".nx-grid__bar [popovertarget], .nx-grid__pop, .nx-grid__rm, .nx-grid__ask")).toBeNull();
    expect("addAiColumn" in el || "ask" in el).toBe(false);
  });

  it("modo servidor: pide bloques con filtros y orden, y usa sus agregados", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      const rows = Array.from({ length: Math.min(q.limit, 250 - q.offset) }, (_, i) => ({ id: String(q.offset + i), oc: `OC-${q.offset + i}`, prov: "Aceros", estado: "pend", monto: 1000 }));
      return new Response(
        JSON.stringify({
          rows,
          total: 250,
          histograms: { estado: { kind: "categories", labels: ["Pendiente", "Aprobado"], values: ["pend", "apr"], counts: [200, 50], filtered: [200, 50] } },
          facets: [{ key: "prov", label: "Proveedor", options: [{ value: "Aceros", count: 250 }] }],
          totals: { monto: 250_000 },
        }),
      );
    });
    vi.stubGlobal("fetch", fetch);
    const el = mount('source="/datos" facets-open');
    await new Promise((r) => setTimeout(r, 20));
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ offset: 0, limit: 100, sort: null, filters: [] });
    expect(foot(el)).toContain("250 filas");
    expect(foot(el)).toContain("$ 250.000");
    expect(el.querySelector(".nx-grid__facet-title")!.textContent).toBe("Proveedor");
    expect(el.querySelector<HTMLElement>(".nx-grid__group")!.hidden).toBe(true);
    // El filtro de la columna: la lista sale de las opciones; los valores de texto, de las facetas.
    await el.openFilter("prov");
    let pop = await panel(el, "Proveedor");
    expect(pop.querySelector(".nx-grid__opt-n")!.textContent).toBe("250");
    await el.openFilter("estado");
    pop = await panel(el, "Estado");
    const calls = fetch.mock.calls.length;
    pop.querySelector<HTMLInputElement>('input[data-v="apr"]')!.click();
    expect(chips(el)).toEqual(["Estado: Pendiente"]);
    // Espera a que se termine de elegir antes de pedir; sin opciones completas, nada de «sin».
    await tick();
    expect(fetch.mock.calls.length).toBe(calls);
    await new Promise((r) => setTimeout(r, 300));
    const last = JSON.parse((fetch.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
    expect(last.filters).toEqual([{ key: "estado", op: "in", values: ["pend"] }]);
    expect(pop.querySelector(".nx-grid__f-left")!.textContent).toBe("250 filas");
  });

  it("client-max: si la consulta completa cabe, se trae una vez y se sigue en el cliente", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      const all = Array.from({ length: 250 }, (_, i) => ({ id: String(i), oc: `OC-${i}`, prov: i % 2 ? "Aceros" : "Empaques", estado: i % 5 ? "pend" : "apr", monto: 1000 }));
      const rows = q.filters.length ? all.filter((r) => r.estado === "apr") : all;
      return new Response(JSON.stringify({ rows: rows.slice(q.offset, q.offset + q.limit), total: rows.length }));
    });
    vi.stubGlobal("fetch", fetch);
    const bodies = () => fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    const el = mount('source="/datos" client-max="1000"');
    await new Promise((r) => setTimeout(r, 30));
    // Una sola vez la consulta completa, sin filtros ni orden.
    expect(bodies().filter((b) => b.limit === 1001)).toEqual([{ offset: 0, limit: 1001, sort: null, filters: [] }]);
    const calls = fetch.mock.calls.length;
    expect(el.mode).toBe("client");
    expect(el.rows).toHaveLength(250);
    expect(foot(el)).toContain("250 filas");
    // En el cliente: filtrar no pide nada y agrupar vuelve a estar.
    expect(el.querySelector<HTMLElement>(".nx-grid__group")!.hidden).toBe(false);
    el.filters = [{ key: "estado", op: "in", values: ["apr"] }];
    expect(foot(el)).toContain("50 de 250 filas");
    expect(fetch).toHaveBeenCalledTimes(calls);
    // refresh() vuelve a mirar el servidor: la primera página (con el filtro) y la consulta completa.
    el.refresh();
    expect(el.mode).toBe("server");
    await new Promise((r) => setTimeout(r, 30));
    expect(bodies().slice(calls)).toEqual([
      { offset: 0, limit: 100, sort: null, filters: [{ key: "estado", op: "in", values: ["apr"] }] },
      { offset: 0, limit: 1001, sort: null, filters: [] },
    ]);
    expect(el.mode).toBe("client");
    expect(foot(el)).toContain("50 de 250 filas");
  });

  it("client-max: si la consulta pasa del tope, se queda en el servidor sin pedir de más", async () => {
    const fetch = vi.fn(async (_u: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ rows: Array.from({ length: Math.min(q.limit, 100) }, (_, i) => ({ id: String(q.offset + i), oc: `OC-${q.offset + i}` })), total: 5000 }));
    });
    vi.stubGlobal("fetch", fetch);
    const el = mount('source="/datos" client-max="1000"');
    await new Promise((r) => setTimeout(r, 30));
    expect(fetch.mock.calls.every((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).limit === 100)).toBe(true);
    expect(el.mode).toBe("server");
    // Un total que miente (dice 10 y llegan más del tope): se queda en el servidor.
    const liar = vi.fn(async (_u: string, init: RequestInit) => {
      const q = JSON.parse(init.body as string);
      return new Response(JSON.stringify({ rows: Array.from({ length: Math.min(q.limit, 20) }, (_, i) => ({ id: String(i) })), total: 10 }));
    });
    vi.stubGlobal("fetch", liar);
    el.clientMax = 15;
    await new Promise((r) => setTimeout(r, 30));
    expect(liar.mock.calls.some((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string).limit === 16)).toBe(true);
    expect(el.mode).toBe("server");
  });

  it("locale: formatos del atributo, o del lang más cercano", () => {
    document.body.innerHTML = `<div lang="en-US"><nx-grid></nx-grid></div>`;
    const el = document.querySelector("nx-grid")!;
    el.columns = [...COLS.slice(0, 3), { key: "monto", label: "Monto", type: "money", currency: "USD", editable: true }];
    el.rows = ROWS;
    expect(el.locale).toBe("en-US");
    expect(cellText(el, 0, 3)).toBe("$8,000,000");
    key(el, "End");
    key(el, "F2");
    const input = el.querySelector<HTMLInputElement>(".nx-grid__input")!;
    input.value = "1,250.5";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(el.rows[0].monto).toBe(1250.5);
    el.locale = "de-DE";
    expect(cellText(el, 0, 3)).toBe("1.250,5 $");
  });

  it("al desplazarse reutiliza las filas que siguen a la vista", async () => {
    const el = mount();
    el.rows = Array.from({ length: 300 }, (_, i) => ({ id: String(i), oc: `OC-${i}`, prov: "A", estado: "pend", monto: i }));
    const row = (r: number) => el.querySelector(`.nx-grid__row[data-r="${r}"]`);
    const kept = row(20);
    expect(kept).not.toBeNull();
    scroll(el).scrollTop = 32 * 10;
    scroll(el).dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 50));
    expect(row(20)).toBe(kept);
    expect(row(0)).toBeNull();
    expect(row(30)).not.toBeNull();
    expect([...el.querySelectorAll<HTMLElement>(".nx-grid__row")].map((x) => Number(x.dataset.r))).toEqual([...Array(el.querySelectorAll(".nx-grid__row").length)].map((_, i) => i + 2));
  });

  it("selectable: casillas, Mayús para un tramo, Espacio, «seleccionar las n» y el slot bulk", () => {
    document.body.innerHTML = `<nx-grid selectable><div slot="bulk"><button>Pedir documentos</button></div></nx-grid>`;
    const el = document.querySelector("nx-grid")!;
    el.columns = COLS;
    el.rows = ROWS;
    const seen: number[] = [];
    el.addEventListener("nx-grid-selection", (e) => seen.push(e.detail.count));
    const boxes = () => el.querySelectorAll<HTMLInputElement>("input[data-pick]");
    expect(boxes()).toHaveLength(4);
    expect(el.hasAttribute("data-selection")).toBe(false);
    boxes()[0].click();
    boxes()[2].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    expect(el.selected).toEqual(["1", "2", "3"]);
    expect(el.getAttribute("data-selection")).toBe("3");
    expect(el.querySelector(".nx-grid__selbar")!.textContent).toContain("3 seleccionadas");
    expect(el.querySelector('[data-r="1"]')!.classList.contains("is-picked")).toBe(true);
    // Espacio marca o desmarca la fila activa.
    key(el, "ArrowDown", {});
    key(el, "ArrowDown", {});
    key(el, "ArrowDown", {});
    key(el, " ");
    expect(el.selected).toHaveLength(4);
    el.querySelector<HTMLButtonElement>("[data-pick='none']")!.click();
    expect(el.selected).toEqual([]);
    el.querySelector<HTMLButtonElement>("[data-pick='all']")!.click();
    expect(el.selected).toHaveLength(4);
    expect(seen.at(-1)).toBe(4);
    // Se conserva al filtrar; las filas se marcan al volver a verse.
    el.filters = [{ key: "estado", op: "in", values: ["pend"] }];
    expect(el.selected).toHaveLength(4);
    expect(el.selectedRows.map((r) => r.oc)).toEqual(["OC-1", "OC-2", "OC-3", "OC-4"]);
  });

  it("link: clic en el nombre o Enter emite nx-grid-open con la fila; avatar con iniciales", () => {
    document.body.innerHTML = `<nx-grid></nx-grid>`;
    const el = document.querySelector("nx-grid")!;
    el.columns = [{ key: "prov", label: "Proveedor", link: true, avatar: true }, ...COLS.slice(2)];
    el.rows = ROWS;
    const opened: string[] = [];
    el.addEventListener("nx-grid-open", (e) => opened.push(e.detail.id));
    expect(el.querySelector(".nx-grid__avatar")!.textContent).toBe("Ac");
    el.querySelector<HTMLElement>('[data-r="2"] .nx-grid__link')!.click();
    expect(opened).toEqual(["3"]);
    key(el, "ArrowUp");
    key(el, "Enter");
    expect(opened).toEqual(["3", "2"]);
  });

  it("deshacer y rehacer: Ctrl+Z, Ctrl+Y, Ctrl+Mayús+Z; un pegado es un solo paso", () => {
    const el = mount();
    const sources: string[] = [];
    el.addEventListener("nx-grid-change", (e) => sources.push(e.detail.source));
    const undoBtn = el.querySelector<HTMLButtonElement>(".nx-grid__icon")!;
    expect(undoBtn.hidden).toBe(false);
    expect(undoBtn.disabled).toBe(true);
    // Una edición y un pegado de dos filas.
    key(el, "End");
    key(el, "9");
    const input = el.querySelector<HTMLInputElement>(".nx-grid__input")!;
    input.value = "9";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const paste = new DataTransfer();
    paste.setData("text/plain", "10\n20");
    scroll(el).dispatchEvent(new ClipboardEvent("paste", { clipboardData: paste, bubbles: true, cancelable: true }));
    expect(el.rows.map((r) => r.monto)).toEqual([9, 10, 20, 3_000_000]);
    expect(undoBtn.disabled).toBe(false);
    // Deshacer el pegado vuelve las dos celdas; la marca de editada se va si vuelven al original.
    key(el, "z", { ctrlKey: true });
    expect(el.rows.map((r) => r.monto)).toEqual([9, 1_000_000, 500_000, 3_000_000]);
    expect(el.querySelector('[data-r="1"] > [data-c="3"]')!.classList.contains("is-edited")).toBe(false);
    expect(el.querySelector('[data-r="0"] > [data-c="3"]')!.classList.contains("is-edited")).toBe(true);
    // Lo deshecho queda seleccionado.
    expect(el.querySelectorAll(".is-sel")).toHaveLength(2);
    key(el, "z", { ctrlKey: true });
    expect(el.rows[0].monto).toBe(8_000_000);
    expect(el.canUndo).toBe(false);
    key(el, "y", { ctrlKey: true });
    key(el, "Z", { ctrlKey: true, shiftKey: true });
    expect(el.rows.map((r) => r.monto)).toEqual([9, 10, 20, 3_000_000]);
    expect(sources).toEqual(["edit", "paste", "undo", "undo", "redo", "redo"]);
    // Un cambio nuevo borra lo que había para rehacer.
    key(el, "z", { ctrlKey: true });
    expect(el.canRedo).toBe(true);
    key(el, "Delete");
    expect(el.canRedo).toBe(false);
  });

  it("si la app cancela nx-grid-change, deshacer no pierde el paso; filas nuevas limpian el historial", () => {
    const el = mount();
    key(el, "End");
    key(el, "Delete");
    expect(el.rows[0].monto).toBeNull();
    const block = (e: Event) => e.preventDefault();
    el.addEventListener("nx-grid-change", block);
    expect(el.undo()).toBe(false);
    expect(el.canUndo).toBe(true);
    el.removeEventListener("nx-grid-change", block);
    expect(el.undo()).toBe(true);
    expect(el.rows[0].monto).toBe(8_000_000);
    el.redo();
    el.rows = ROWS;
    expect(el.canUndo).toBe(false);
  });

  it("etiquetas propias y BDUI", () => {
    document.body.innerHTML = "<div id=t></div>";
    const [el] = render({ component: "Grid", props: { columns: COLS, rows: ROWS, labels: { rows: "{n} registros" } } }, document.getElementById("t")!) as NxGrid[];
    expect(foot(el)).toContain("4 registros");
    expect(el.labels.clear).toBe(GRID_LABELS.clear);
  });
});
