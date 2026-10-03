// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index";
import type { GridColumn, GridRow, GridSavedView, NxGrid } from "../src/index";

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "prov", label: "Proveedor" },
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pend", label: "Pendiente", tone: "warning" }, { value: "apr", label: "Aprobado", tone: "info" }] },
  { key: "monto", label: "Monto", type: "money" },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "OC-1", prov: "Aceros", estado: "pend", monto: 8_000_000 },
  { id: "2", oc: "OC-2", prov: "Empaques", estado: "apr", monto: 1_000_000 },
  { id: "3", oc: "OC-3", prov: "Aceros", estado: "apr", monto: 500_000 },
  { id: "4", oc: "OC-4", prov: "Químicos", estado: "pend", monto: 3_000_000 },
];
const KEY = "test:vistas";

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

function mount(attrs = ""): NxGrid {
  document.body.innerHTML = `<nx-grid ${attrs}></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = COLS;
  el.rows = ROWS;
  return el;
}

const heads = (el: NxGrid) => [...el.querySelectorAll(".nx-grid__th-label")].map((x) => x.textContent);
const column = (el: NxGrid, c: number) => [...el.querySelectorAll(`.nx-grid__row:not(.nx-grid__row--group) > [data-c="${c}"]`)].map((x) => x.textContent);
const chips = (el: NxGrid) => [...el.querySelectorAll(".nx-grid__chip")].map((c) => c.textContent);
const viewsBtn = (el: NxGrid) => el.querySelector<HTMLButtonElement>(".nx-grid__views")!;
const colsBtn = (el: NxGrid) => [...el.querySelectorAll<HTMLButtonElement>(".nx-grid__bar .nx-grid__btn")].find((b) => b.textContent === "Columnas")!;

/** El menú se carga aparte: espera a que aparezca con algo adentro. */
async function until<T>(fn: () => T | null | undefined | false): Promise<T> {
  for (let i = 0; i < 200; i++) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error("no llegó");
}
const pops = (el: NxGrid) => [...el.querySelectorAll<HTMLElement>(".nx-grid__vpop")];
const menuItems = (el: NxGrid) => [...pops(el)[0].querySelectorAll<HTMLButtonElement>(".nx-grid__menu-item")];
const itemText = (el: NxGrid, text: string) => menuItems(el).find((b) => b.textContent!.startsWith(text))!;

describe("<nx-grid>: columnas", () => {
  it("esconder y mostrar columnas: el filtro de una columna oculta sigue; la última no se esconde", async () => {
    const el = mount();
    el.filters = [{ key: "prov", op: "in", values: ["Aceros"] }];
    colsBtn(el).click();
    const cpop = await until(() => pops(el)[1]?.querySelector("input[data-col]") && pops(el)[1]);
    const box = (k: string) => cpop.querySelector<HTMLInputElement>(`input[data-col="${k}"]`)!;
    box("prov").click();
    expect(heads(el)).toEqual(["Pedido", "Estado", "Monto"]);
    expect(el.view.hidden).toEqual(["prov"]);
    expect(column(el, 0)).toEqual(["OC-1", "OC-3"]);
    expect(chips(el)).toEqual(["Proveedor: Aceros"]);
    // `columns` sigue con todas.
    expect(el.columns).toHaveLength(4);
    for (const k of ["oc", "estado"]) box(k).click();
    expect(heads(el)).toEqual(["Monto"]);
    expect(box("monto").disabled).toBe(true);
    // Mostrar todas, con su ancho original.
    el.view = { ...el.view, widths: { monto: 300 } };
    cpop.querySelector<HTMLButtonElement>(".nx-grid__clear")!.click();
    expect(heads(el)).toEqual(["Pedido", "Proveedor", "Estado", "Monto"]);
    expect(el.view.widths).toEqual({});
    expect(box("monto").disabled).toBe(false);
  });

  it("ancho: flechas en el borde de la cabecera, Supr y doble clic lo devuelven", () => {
    const el = mount();
    const scroll = el.querySelector<HTMLElement>(".nx-grid__scroll")!;
    const handle = el.querySelectorAll<HTMLElement>(".nx-grid__resize")[0];
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-label")).toBe("Ancho de Pedido");
    expect(handle.getAttribute("aria-valuenow")).toBe("180");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, shiftKey: true }));
    expect(el.view.widths).toEqual({ oc: 260 });
    expect(scroll.style.getPropertyValue("--_cols")).toMatch(/^260px /);
    expect(el.querySelectorAll(".nx-grid__resize")[0].getAttribute("aria-valuenow")).toBe("260");
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    expect(el.view.widths).toEqual({});
    el.view = { ...el.view, widths: { oc: 20_000 } };
    expect(el.view.widths).toEqual({ oc: 800 });
    el.querySelectorAll<HTMLElement>(".nx-grid__resize")[0].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(el.view.widths).toEqual({});
  });
});

describe("<nx-grid>: vista", () => {
  it("grid.view aplica filtros, orden, grupos, columnas y anchos; lo de columnas que no existen se quita y se dice", () => {
    const el = mount();
    const events: unknown[] = [];
    el.addEventListener("nx-grid-filter", (e) => events.push(e.detail));
    el.view = {
      filters: [
        { key: "estado", op: "in", values: ["apr"] },
        { key: "centro", op: "in", values: ["x"] },
      ],
      sort: { key: "monto", dir: -1 },
      groupBy: "",
      hidden: ["oc"],
      widths: { prov: 250 },
    };
    expect(el.filters).toEqual([{ key: "estado", op: "in", values: ["apr"] }]);
    expect(el.sort).toEqual({ key: "monto", dir: -1 });
    expect(heads(el)).toEqual(["Proveedor", "Estado", "Monto"]);
    expect(column(el, 0)).toEqual(["Empaques", "Aceros"]);
    expect(el.querySelector(".nx-grid__note")!.textContent).toBe("La vista usaba «centro», que ya no está en la tabla.");
    expect(events).toHaveLength(1);
    el.view = { groupBy: "prov" };
    expect(el.groupBy).toBe("prov");
    expect(el.filters).toEqual([]);
    expect(el.querySelectorAll(".nx-grid__row--group")).toHaveLength(3);
  });
});

describe("<nx-grid>: vistas guardadas", () => {
  it("sin views-storage no hay botón de vistas", () => {
    const el = mount();
    expect(viewsBtn(el).hidden).toBe(true);
  });

  it("guardar, ver «modificada», guardar cambios, renombrar, borrar y volver a la original", async () => {
    const el = mount(`views-storage="${KEY}"`);
    const saved: GridSavedView[][] = [];
    el.addEventListener("nx-grid-views", (e) => saved.push(e.detail.views));
    expect(viewsBtn(el).hidden).toBe(false);
    el.filters = [{ key: "estado", op: "in", values: ["pend"] }];
    // «Guardar como vista» junto a los chips: directo al formulario, con el nombre sugerido.
    el.querySelector<HTMLButtonElement>(".nx-grid__save-view")!.click();
    const name = await until(() => pops(el)[0]?.querySelector<HTMLInputElement>("form input[type=text]"));
    expect(name.value).toBe("Estado: Pendiente");
    name.value = "Pendientes";
    pops(el)[0].querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(el.views.map((v) => v.name)).toEqual(["Pendientes"]);
    expect(JSON.parse(localStorage.getItem(KEY)!).views[0]).toMatchObject({ name: "Pendientes", filters: [{ key: "estado", op: "in", values: ["pend"] }] });
    expect(saved).toHaveLength(1);
    expect(el.activeView).toBe(el.views[0].id);
    expect(viewsBtn(el).textContent).toBe("Pendientes");
    // Otro cambio: «modificada», y guardarlo.
    el.sort = { key: "monto", dir: 1 };
    expect(viewsBtn(el).textContent).toBe("Pendientes · modificada");
    viewsBtn(el).click();
    await until(() => menuItems(el).length);
    itemText(el, "Guardar los cambios").click();
    expect(el.views[0].sort).toEqual({ key: "monto", dir: 1 });
    expect(viewsBtn(el).textContent).toBe("Pendientes");
    // Una segunda vista, y el nombre repetido no pasa.
    el.filters = [];
    viewsBtn(el).click();
    itemText(el, "Guardar como vista nueva").click();
    const form = pops(el)[0].querySelector("form")!;
    const input = form.querySelector<HTMLInputElement>("input[type=text]")!;
    input.value = "pendientes";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(form.querySelector(".nx-grid__v-error")!.textContent).toBe("Ya tienes una vista con ese nombre.");
    input.value = "Todo por monto";
    form.querySelector<HTMLInputElement>("input[type=checkbox]")!.checked = true;
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(el.views.map((v) => [v.name, !!v.default])).toEqual([
      ["Pendientes", false],
      ["Todo por monto", true],
    ]);
    // Aplicar la primera desde el menú.
    viewsBtn(el).click();
    menuItems(el).find((b) => b.textContent === "Pendientes")!.click();
    expect(el.filters).toEqual([{ key: "estado", op: "in", values: ["pend"] }]);
    expect(column(el, 0)).toEqual(["OC-4", "OC-1"]);
    // Renombrar.
    viewsBtn(el).click();
    itemText(el, "Renombrar").click();
    const rename = pops(el)[0].querySelector<HTMLInputElement>("form input[type=text]")!;
    expect(rename.value).toBe("Pendientes");
    rename.value = "Por aprobar";
    pops(el)[0].querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(el.views[0].name).toBe("Por aprobar");
    expect(viewsBtn(el).textContent).toBe("Por aprobar");
    // Borrar, con confirmación.
    viewsBtn(el).click();
    itemText(el, "Borrar").click();
    expect(pops(el)[0].querySelector(".nx-grid__v-text")!.textContent).toBe("¿Borrar la vista «Por aprobar»? No se puede deshacer.");
    pops(el)[0].querySelector<HTMLButtonElement>(".is-danger")!.click();
    expect(el.views.map((v) => v.name)).toEqual(["Todo por monto"]);
    expect(el.activeView).toBeNull();
    expect(viewsBtn(el).textContent).toBe("Vistas");
    // Volver a la tabla original.
    viewsBtn(el).click();
    itemText(el, "Volver a la tabla original").click();
    expect(el.filters).toEqual([]);
    expect(el.sort).toBeNull();
  });

  it("la vista marcada se aplica al abrir; los tramos relativos se recalculan; lo roto se ignora", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 29, 12));
    localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 1,
        views: [
          null,
          { id: "x", name: "" },
          { id: "a", name: "Aceros", filters: [{ key: "prov", op: "in", values: ["Aceros"] }], hidden: ["oc"], default: true },
          { id: "b", name: "Este mes", filters: [{ key: "fecha", op: "range", rel: "month", min: "2020-01-01", max: "2020-02-01" }], default: true },
        ],
      }),
    );
    const el = mount(`views-storage="${KEY}"`);
    expect(el.views.map((v) => [v.id, !!v.default])).toEqual([
      ["a", true],
      ["b", false],
    ]);
    expect(el.views[1].filters[0]).toMatchObject({ rel: "month", min: "2026-09-01", max: "2026-10-01" });
    expect(el.activeView).toBe("a");
    expect(heads(el)).toEqual(["Proveedor", "Estado", "Monto"]);
    expect(column(el, 0)).toEqual(["Aceros", "Aceros"]);
    await until(() => viewsBtn(el).textContent === "Aceros");
  });

  it("un guardado roto no rompe la tabla; otra pestaña que guarda se ve aquí", async () => {
    localStorage.setItem(KEY, "{no es json");
    const el = mount(`views-storage="${KEY}"`);
    expect(el.views).toEqual([]);
    localStorage.setItem(KEY, JSON.stringify({ v: 1, views: [{ id: "a", name: "De la otra pestaña" }] }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(el.views.map((v) => v.name)).toEqual(["De la otra pestaña"]);
    el.applyView("a");
    expect(el.activeView).toBe("a");
    expect(el.applyView("nada")).toBe(false);
  });
});

describe("<nx-grid>: el menú de vistas guarda sobre la lista de ahora", () => {
  const stored = () => JSON.parse(localStorage.getItem(KEY)!).views.map((v: GridSavedView) => v.name);

  it("otra pestaña guardó con el formulario abierto: su vista no se pierde", async () => {
    const el = mount(`views-storage="${KEY}"`);
    el.filters = [{ key: "estado", op: "in", values: ["pend"] }];
    viewsBtn(el).click();
    await until(() => pops(el)[0]?.querySelector(".nx-grid__menu-item"));
    itemText(el, "Guardar como vista nueva").click();
    const form = pops(el)[0].querySelector("form")!;
    localStorage.setItem(KEY, JSON.stringify({ v: 1, views: [{ id: "b", name: "De la otra pestaña" }] }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    form.querySelector<HTMLInputElement>("input[type=text]")!.value = "Mía";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(stored()).toEqual(["De la otra pestaña", "Mía"]);
    expect(el.views.map((v) => v.name)).toEqual(["De la otra pestaña", "Mía"]);
  });

  it("dos tablas con la misma clave en una página: guardar desde una no borra lo que guardó la otra", async () => {
    document.body.innerHTML = `<nx-grid views-storage="${KEY}"></nx-grid><nx-grid views-storage="${KEY}"></nx-grid>`;
    const [a, b] = [...document.querySelectorAll("nx-grid")];
    for (const g of [a, b]) {
      g.columns = COLS;
      g.rows = ROWS;
    }
    const open = async (g: NxGrid, name: string) => {
      viewsBtn(g).click();
      await until(() => pops(g)[0]?.querySelector(".nx-grid__menu-item"));
      itemText(g, "Guardar como vista nueva").click();
      const form = pops(g)[0].querySelector("form")!;
      form.querySelector<HTMLInputElement>("input[type=text]")!.value = name;
      return () => form.dispatchEvent(new Event("submit", { cancelable: true }));
    };
    const fromA = await open(a, "De A");
    (await open(b, "De B"))();
    fromA();
    expect(stored()).toEqual(["De B", "De A"]);
    // B guarda otra después del último guardado de A: A no la tiene en su lista. Borrar desde A, que
    // no había vuelto a leer la lista, no se la lleva.
    (await open(b, "Otra de B"))();
    expect(stored()).toEqual(["De B", "De A", "Otra de B"]);
    expect(a.views.map((v) => v.name)).toEqual(["De B", "De A"]);
    viewsBtn(a).click();
    await until(() => pops(a)[0]?.querySelector(".nx-grid__menu-item"));
    itemText(a, "Borrar").click();
    pops(a)[0].querySelector<HTMLButtonElement>(".is-danger")!.click();
    expect(stored()).toEqual(["De B", "Otra de B"]);
  });

  it("la lista abierta se repinta si otra pestaña guarda", async () => {
    const el = mount(`views-storage="${KEY}"`);
    viewsBtn(el).click();
    await until(() => pops(el)[0]?.querySelector(".nx-grid__v-text"));
    localStorage.setItem(KEY, JSON.stringify({ v: 1, views: [{ id: "b", name: "Nueva" }] }));
    window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    expect(menuItems(el).map((b) => b.textContent)).toContain("Nueva");
  });

  it("el menú sigue a su botón al desplazar la página y abre hacia arriba si abajo no cabe", async () => {
    const el = mount(`views-storage="${KEY}"`);
    const btn = viewsBtn(el);
    let top = 700;
    btn.getBoundingClientRect = () => ({ top, bottom: top + 36, left: 20, right: 120, width: 100, height: 36, x: 20, y: top, toJSON: () => ({}) }) as DOMRect;
    btn.click();
    const pop = await until(() => pops(el)[0]?.querySelector(".nx-grid__v-text") && pops(el)[0]);
    Object.defineProperty(pop, "offsetHeight", { configurable: true, get: () => 300 });
    window.dispatchEvent(new Event("resize"));
    expect(pop.style.getPropertyValue("--_top")).toBe(`${700 - 6 - 300}px`);
    expect(pop.style.getPropertyValue("--_maxh")).toBe(`${700 - 14}px`);
    top = 100;
    document.dispatchEvent(new Event("scroll"));
    expect(pop.style.getPropertyValue("--_top")).toBe("142px");
    // Cerrado, ya no escucha.
    pop.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    top = 300;
    window.dispatchEvent(new Event("resize"));
    expect(pop.style.getPropertyValue("--_top")).toBe("142px");
  });
});
