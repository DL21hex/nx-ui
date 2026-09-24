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
    el.addAiColumn("X", "y");
    el.rows[0].monto = 1;
    expect(rows[0].monto).toBe(8_000_000);
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

  it("clic en una barra del histograma filtra; el chip lo quita", () => {
    const el = mount();
    const events: unknown[] = [];
    el.addEventListener("nx-grid-filter", (e) => events.push(e.detail));
    const estado = el.querySelectorAll(".nx-grid__th")[2];
    const bars = estado.querySelectorAll<HTMLElement>(".nx-grid__hbar");
    expect(bars).toHaveLength(2);
    bars[0].click();
    expect(column(el, 0)).toEqual(["OC-1", "OC-4"]);
    expect(chips(el)).toEqual(["Estado: Pendiente"]);
    expect(foot(el)).toContain("2 de 4 filas");
    expect(events).toHaveLength(1);
    // La barra elegida queda marcada; la otra, fuera.
    const after = el.querySelectorAll(".nx-grid__th")[2].querySelectorAll(".nx-grid__hbar");
    expect([...after].map((b) => b.classList.contains("is-on"))).toEqual([true, false]);
    el.querySelector<HTMLButtonElement>(".nx-grid__chip button")!.click();
    expect(column(el, 0)).toHaveLength(4);
    expect(el.filters).toEqual([]);
  });

  it("una barra de rango filtra ese rango y Mayús la extiende", () => {
    const el = mount();
    const bars = () => el.querySelectorAll(".nx-grid__th")[3].querySelectorAll<HTMLElement>(".nx-grid__hbar");
    bars()[0].click();
    const [f] = el.filters as { min: number; max: number }[];
    expect(f.min).toBeLessThanOrEqual(500_000);
    bars()[bars().length - 1].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    expect(column(el, 0)).toHaveLength(4);
    expect(el.filters).toHaveLength(1);
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

  it("ask(): una frase se vuelve filtros y lo que no entiende se dice", async () => {
    const el = mount();
    const r = await el.ask("pendientes de más de 5 millones urgentes");
    expect(chips(el).sort()).toEqual(["Estado: Pendiente", "Monto ≥ $5 M"]);
    expect(column(el, 0)).toEqual(["OC-1"]);
    expect(r.unknown).toEqual(["urgentes"]);
    expect(el.querySelector(".nx-grid__note")!.textContent).toBe("No entendí «urgentes»");
  });

  it("ask() consulta nl-endpoint si el analizador local no entiende", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ filters: [{ key: "prov", op: "in", values: ["Químicos"] }, { key: "nope", op: "in", values: [] }] })));
    vi.stubGlobal("fetch", fetch);
    const el = mount('nl-endpoint="/nl"');
    await el.ask("los del laboratorio");
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).q).toBe("los del laboratorio");
    expect(el.filters).toEqual([{ key: "prov", op: "in", values: ["Químicos"] }]);
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

  it("columna IA: pide solo las filas visibles y pinta lo que llega en streaming", async () => {
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const lines = body.rows.map((r: GridRow) => JSON.stringify({ type: "cell", id: r.id, value: r.id === "1" ? "Alto" : "Bajo", tone: r.id === "1" ? "danger" : "success" }));
      return new Response(`${lines.join("\n")}\n`);
    });
    vi.stubGlobal("fetch", fetch);
    const el = mount('ai-endpoint="/ia"');
    expect(el.querySelector(".nx-grid__bar button[popovertarget]")!.hasAttribute("hidden")).toBe(false);
    el.addAiColumn("Riesgo", "riesgo de retraso");
    expect(el.querySelectorAll(".nx-grid__shim")).toHaveLength(4);
    await new Promise((r) => setTimeout(r, 200));
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toMatchObject({ prompt: "riesgo de retraso", column: "ai_riesgo" });
    expect(body.rows[0]).toEqual({ id: "1", oc: "OC-1", prov: "Aceros", estado: "pend", monto: 8_000_000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(el.querySelector(`[data-r="0"] > [data-c="4"] .nx-grid__pill`)!.getAttribute("data-tone")).toBe("danger");
    expect(el.rows[0].ai_riesgo).toBe("Alto");
    el.removeColumn("ai_riesgo");
    expect(el.columns).toHaveLength(4);
    expect("ai_riesgo" in el.rows[0]).toBe(false);
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
    expect(el.querySelectorAll(".nx-grid__th")[2].querySelectorAll(".nx-grid__hbar")).toHaveLength(2);
    expect(el.querySelector(".nx-grid__facet-title")!.textContent).toBe("Proveedor");
    expect(el.querySelector<HTMLElement>(".nx-grid__group")!.hidden).toBe(true);
    el.querySelectorAll(".nx-grid__th")[2].querySelector<HTMLElement>(".nx-grid__hbar")!.click();
    await tick();
    const last = JSON.parse((fetch.mock.calls.at(-1) as unknown as [string, RequestInit])[1].body as string);
    expect(last.filters).toEqual([{ key: "estado", op: "in", values: ["pend"] }]);
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

  it("etiquetas propias y BDUI", () => {
    document.body.innerHTML = "<div id=t></div>";
    const [el] = render({ component: "Grid", props: { columns: COLS, rows: ROWS, labels: { rows: "{n} registros" } } }, document.getElementById("t")!) as NxGrid[];
    expect(foot(el)).toContain("4 registros");
    expect(el.labels.clear).toBe(GRID_LABELS.clear);
  });
});
