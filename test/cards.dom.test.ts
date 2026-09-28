// @vitest-environment happy-dom
//
// happy-dom no calcula cajas: el FLIP no anima (no hay tamaños que comparar) y las flechas avanzan
// en orden (la geometría se prueba en launcher.logic.test.ts). La animación entre niveles, el
// pellizco del trackpad y la luz que sigue al puntero se ven en el navegador.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/cards/index";
import type { CardsActionDetail, CardsField, CardsLayout, CardsOpenDetail, CardsRow, NxCards } from "../src/components/cards/index";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});
const tick = () => new Promise((r) => setTimeout(r, 0));

const FIELDS: CardsField[] = [
  { key: "name", label: "Proveedor", sort: "asc" },
  { key: "city", label: "Ciudad", group: true, search: true },
  { key: "cat", label: "Categoría", group: true },
  {
    key: "state",
    label: "Estado",
    type: "status",
    group: true,
    options: [
      { value: "ok", label: "Al día", tone: "success", quiet: true },
      { value: "vence", label: "Póliza por vencer", tone: "warning" },
      { value: "revision", label: "En revisión", tone: "info" },
      { value: "bloqueado", label: "Bloqueado", tone: "danger" },
    ],
  },
  { key: "compras", label: "Compras en 12 meses", type: "money", currency: "COP", sort: "desc" },
  { key: "delta", label: "Cambio", type: "percent" },
  { key: "cumpl", label: "Entregas a tiempo", type: "percent", sort: "asc", good: 90, bad: 80 },
  { key: "rating", label: "Calificación", type: "rating" },
  { key: "lead", label: "Plazo de entrega", type: "number", unit: "días" },
  { key: "note", label: "Nota" },
  { key: "orders", label: "Últimas órdenes de compra" },
  { key: "url", label: "Ficha" },
];
const LAYOUT: CardsLayout = {
  title: "name",
  subtitle: ["cat", "city"],
  status: "state",
  note: "note",
  value: "compras",
  delta: "delta",
  trend: "months",
  brief: ["rating", "lead", "cumpl"],
  facts: ["rating", "lead", "cumpl", "city"],
  related: "orders",
  href: "url",
};
const ROWS: CardsRow[] = [
  { id: "a", name: "Ferrecaribe", city: "Barranquilla", cat: "Ferretería", state: "ok", compras: 900e6, delta: 12, cumpl: 96, rating: 4.6, lead: 5, months: [3, 4, 5, 4, 6], url: "/proveedores/a", orders: [{ title: "OC-2026-0941", meta: "12 sep", value: "$ 48,2 M", status: "Entregada", tone: "success" }] },
  { id: "b", name: "Aceros Malambo", city: "Malambo", cat: "Obra gris", state: "vence", note: "Póliza vence el 3 oct", compras: 2100e6, delta: -4, cumpl: 88, rating: 4, lead: 6 },
  { id: "c", name: "Distri Sabana", city: "Bogotá", cat: "Obra gris", state: "bloqueado", compras: 300e6, cumpl: 71, url: "javascript:alert(1)" },
  { id: "d", name: "Eléctricos del Norte", city: "Barranquilla", cat: "Eléctricos", state: "revision", compras: 450e6, cumpl: 93 },
];

async function mount(attrs = "", rows: CardsRow[] = ROWS): Promise<NxCards> {
  document.body.innerHTML = `<nx-cards locale="es-CO" ${attrs}></nx-cards>`;
  const el = document.querySelector("nx-cards")!;
  el.fields = FIELDS;
  el.layout = LAYOUT;
  el.actions = [
    { id: "order", label: "Nueva orden de compra", primary: true, disabledFor: ["bloqueado"] },
    { id: "quotes", label: "Ver cotizaciones" },
  ];
  el.rows = rows.map((r) => ({ ...r }));
  await tick();
  return el;
}
const card = (el: NxCards, id: string) => el.querySelector<HTMLElement>(`.nx-cards__card[data-key="${id}"]`)!;
const hit = (el: NxCards, id: string) => card(el, id).querySelector<HTMLButtonElement>(".nx-cards__hit")!;
const order = (el: NxCards) => [...el.querySelectorAll<HTMLElement>(".nx-cards__card")].map((c) => c.dataset.key);
const root = (el: NxCards) => el.querySelector<HTMLElement>(".nx-cards__root")!;
const key = (t: Element, k: string) => t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const click = (t: Element) => t.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

describe("pintado", () => {
  it("barra: buscador, agrupar y ordenar (con los campos que lo permiten), cuenta y niveles", async () => {
    const el = await mount();
    expect(el.querySelector<HTMLInputElement>(".nx-cards__input")).not.toBeNull();
    const [group, sort] = el.querySelectorAll<HTMLSelectElement>(".nx-cards__select");
    expect([...group.options].map((o) => o.textContent)).toEqual(["Sin agrupar", "Ciudad", "Categoría", "Estado"]);
    expect([...sort.options].map((o) => o.textContent)).toEqual(["Orden original", "Proveedor (A–Z)", "Compras en 12 meses (mayor primero)", "Entregas a tiempo (menor primero)"]);
    expect(el.querySelector(".nx-cards__count")!.textContent).toBe("4 registros");
    const radios = [...el.querySelectorAll<HTMLInputElement>(".nx-cards__radio")];
    expect(radios.map((r) => [r.value, r.checked])).toEqual([["map", false], ["cards", true], ["detail", false]]);
    expect(root(el).dataset.level).toBe("cards");
  });

  it("la tarjeta: título, estado, subtítulo, nota, dato con cambio, minigráfica, línea corta y ficha", async () => {
    const el = await mount();
    const b = card(el, "b");
    expect(b.querySelector(".nx-cards__title")!.textContent).toBe("Aceros Malambo");
    expect(b.querySelector(".nx-cards__chip")!.textContent).toBe("Póliza por vencer");
    expect(b.querySelector(".nx-cards__sub")!.textContent).toBe("Obra gris · Malambo");
    expect(b.querySelector(".nx-cards__note")!.textContent).toBe("Póliza vence el 3 oct");
    expect(b.querySelector(".nx-cards__value")!.textContent).toBe("$ 2.100.000.000");
    expect(b.querySelector(".nx-cards__delta")!.textContent).toBe("▼ 4 %");
    expect(b.querySelector(".nx-cards__delta")!.hasAttribute("data-up")).toBe(false);
    expect(b.querySelector(".nx-cards__brief")!.textContent).toBe("★ 4 · 6 días · 88 %");
    expect([...b.querySelectorAll(".nx-cards__facts dt")].map((d) => d.textContent)).toEqual(["Calificación", "Plazo de entrega", "Entregas a tiempo", "Ciudad"]);
    expect(b.querySelector(".nx-cards__bar")!.getAttribute("data-tone")).toBe("warning");
    expect(card(el, "a").querySelectorAll(".nx-cards__spark path").length).toBe(2);
    expect(b.querySelector(".nx-cards__spark")).toBeNull();
    // El estado normal no se anuncia en las tarjetas (CSS con data-quiet).
    expect(card(el, "a").querySelector(".nx-cards__chip")!.hasAttribute("data-quiet")).toBe(true);
    expect(card(el, "a").dataset.tone).toBe("success");
    expect(hit(el, "b").getAttribute("aria-label")).toBe("Aceros Malambo, Póliza por vencer, $ 2.100.000.000");
  });

  it("agrupa en estantes con título, cuántos y el total; en el orden del estado", async () => {
    const el = await mount('group="state"');
    const heads = [...el.querySelectorAll(".nx-cards__shelf-head")];
    expect(heads.map((h) => h.querySelector("h3")!.textContent)).toEqual(["Al día", "Póliza por vencer", "En revisión", "Bloqueado"]);
    expect(heads[0].querySelector(".nx-cards__shelf-count")!.textContent).toBe("1 registro");
    expect(heads[0].querySelector(".nx-cards__shelf-total")!.textContent).toBe("$ 900.000.000");
    const section = el.querySelector("section")!;
    expect(section.getAttribute("aria-labelledby")).toBe(heads[0].querySelector("h3")!.id);
    el.group = "city";
    await tick();
    expect([...el.querySelectorAll(".nx-cards__shelf-title")].map((h) => h.textContent)).toEqual(["Malambo", "Barranquilla", "Bogotá"]);
    expect(el.querySelector<HTMLSelectElement>(".nx-cards__select")!.value).toBe("city");
  });

  it("ordena con el atributo sort (y respeta la dirección pedida)", async () => {
    const el = await mount('sort="compras"');
    expect(order(el)).toEqual(["b", "a", "d", "c"]);
    el.sort = "compras:asc";
    await tick();
    expect(order(el)).toEqual(["c", "d", "a", "b"]);
    el.sort = "no-existe";
    await tick();
    expect(order(el)).toEqual(["a", "b", "c", "d"]);
  });

  it("el texto del backend nunca se interpreta como HTML", async () => {
    const el = await mount("", [{ id: "x", name: "<img src=x onerror=alert(1)>", state: "<b>ok</b>", compras: 1 }]);
    expect(el.querySelector(".nx-cards__zone img, .nx-cards__zone b")).toBeNull();
    expect(card(el, "x").querySelector(".nx-cards__title")!.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("acepta todo como atributos JSON", async () => {
    document.body.innerHTML = `<nx-cards level="detail" fields='[{"key":"n","label":"Nombre"}]' layout='{"title":"n"}' rows='[{"id":"1","n":"Uno"}]'></nx-cards>`;
    await tick();
    const el = document.querySelector("nx-cards")!;
    expect(card(el, "1").querySelector(".nx-cards__title")!.textContent).toBe("Uno");
    expect(root(el).dataset.level).toBe("detail");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    el.setAttribute("rows", "[no");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("niveles", () => {
  it("el mapa no arma los cuerpos: solo cuadros; al acercarse se arman", async () => {
    const el = await mount('level="map"');
    expect(root(el).dataset.level).toBe("map");
    expect(el.querySelectorAll(".nx-cards__body").length).toBe(0);
    const log: string[] = [];
    el.addEventListener("nx-cards-level", (e) => log.push(e.detail.level));
    el.querySelector<HTMLInputElement>('.nx-cards__radio[value="cards"]')!.dispatchEvent(new Event("change"));
    expect(root(el).dataset.level).toBe("cards");
    expect(el.getAttribute("level")).toBe("cards");
    expect(el.querySelectorAll(".nx-cards__body").length).toBe(4);
    expect(log).toEqual(["cards"]);
    expect(el.querySelector(".nx-cards__live")!.textContent).toBe("Vista: Tarjetas");
  });

  it("la leyenda cuenta por estado", async () => {
    const el = await mount('level="map"');
    const items = [...el.querySelectorAll(".nx-cards__legend li")].map((li) => li.textContent);
    expect(items[0]).toBe("Al día 1 · más intenso, más compras en 12 meses");
    expect(items.slice(1)).toEqual(["Póliza por vencer 1", "En revisión 1", "Bloqueado 1"]);
  });

  it("zoom(), la propiedad level y las teclas + y −", async () => {
    const el = await mount();
    el.zoom(1);
    expect(el.level).toBe("detail");
    el.zoom(1);
    expect(el.level).toBe("detail");
    el.level = "map";
    expect(root(el).dataset.level).toBe("map");
    hit(el, "a").focus();
    key(hit(el, "a"), "+");
    expect(el.level).toBe("cards");
    key(hit(el, "a"), "-");
    expect(el.level).toBe("map");
    // En el buscador, + y − se escriben.
    key(el.querySelector(".nx-cards__input")!, "+");
    expect(el.level).toBe("map");
  });

  it("en el mapa, el globo dice nombre, dato y estado", async () => {
    const el = await mount('level="map"');
    hit(el, "c").focus();
    const tip = el.querySelector<HTMLElement>(".nx-cards__tip")!;
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe("Distri Sabana$ 300.000.000 · Bloqueado");
    el.level = "cards";
    expect(tip.hidden).toBe(true);
  });
});

describe("buscar", () => {
  it("filtra (con espera) y cuenta «n de total»; sin resultados, lo dice", async () => {
    vi.useFakeTimers();
    const el = await mountFake();
    const input = el.querySelector<HTMLInputElement>(".nx-cards__input")!;
    input.value = "barranquilla";
    input.dispatchEvent(new Event("input"));
    expect(order(el)).toHaveLength(4);
    vi.advanceTimersByTime(200);
    expect(order(el)).toEqual(["a", "d"]);
    expect(el.querySelector(".nx-cards__count")!.textContent).toBe("2 de 4");
    el.query = "zzz";
    await vi.runAllTimersAsync();
    expect(order(el)).toEqual([]);
    expect(el.querySelector(".nx-cards__empty")!.textContent).toBe("Nada coincide con «zzz».");
  });
});

async function mountFake(): Promise<NxCards> {
  document.body.innerHTML = `<nx-cards locale="es-CO"></nx-cards>`;
  const el = document.querySelector("nx-cards")!;
  el.fields = FIELDS;
  el.layout = LAYOUT;
  el.rows = ROWS.map((r) => ({ ...r }));
  await Promise.resolve();
  return el;
}

describe("abrir en su sitio", () => {
  it("clic: se abre con su lista y sus acciones; Escape la cierra y el foco vuelve", async () => {
    const el = await mount();
    const log: string[] = [];
    el.addEventListener("nx-cards-open", (e) => log.push(`${(e as CustomEvent<CardsOpenDetail>).detail.row.id}:${e.detail.open}`));
    click(hit(el, "a"));
    const a = card(el, "a");
    expect(a.classList.contains("is-open")).toBe(true);
    expect(hit(el, "a").getAttribute("aria-expanded")).toBe("true");
    expect(el.openKey).toBe("a");
    expect(document.activeElement).toBe(a.querySelector(".nx-cards__close"));
    expect(a.querySelector(".nx-cards__more-title")!.textContent).toBe("Últimas órdenes de compra");
    expect(a.querySelector(".nx-cards__related li")!.textContent).toBe("OC-2026-094112 sep$ 48,2 MEntregada");
    expect(a.querySelector<HTMLAnchorElement>(".nx-cards__link")!.getAttribute("href")).toBe("/proveedores/a");
    // Abrir otra cierra la anterior.
    click(hit(el, "b"));
    expect(a.classList.contains("is-open")).toBe(false);
    key(card(el, "b").querySelector(".nx-cards__close")!, "Escape");
    expect(el.openKey).toBeNull();
    expect(document.activeElement).toBe(hit(el, "b"));
    expect(log).toEqual(["a:true", "a:false", "b:true", "b:false"]);
  });

  it("en el mapa también se abre (arma el cuerpo solo para ella)", async () => {
    const el = await mount('level="map"');
    el.openRow("d");
    expect(card(el, "d").querySelector(".nx-cards__body")).not.toBeNull();
    expect(el.querySelectorAll(".nx-cards__body").length).toBe(1);
    el.openRow(null);
    expect(el.openKey).toBeNull();
  });

  it("acciones: nx-cards-action con la fila; deshabilitada en los estados que no puede; href inseguro fuera", async () => {
    const el = await mount();
    const got: string[] = [];
    el.addEventListener("nx-cards-action", (e) => got.push(`${(e as CustomEvent<CardsActionDetail>).detail.action}:${e.detail.row.id}`));
    el.openRow("c");
    const c = card(el, "c");
    const [order, quotes] = c.querySelectorAll<HTMLButtonElement>("[data-nx-action]");
    expect(order.disabled).toBe(true);
    click(quotes);
    expect(got).toEqual(["quotes:c"]);
    expect(c.querySelector(".nx-cards__link")).toBeNull();
  });
});

describe("actualizaciones y teclado", () => {
  it("la misma fila conserva su nodo; si cambia, se rehace el cuerpo", async () => {
    const el = await mount();
    const before = card(el, "a");
    const body = before.querySelector(".nx-cards__body");
    el.rows = el.rows.map((r) => ({ ...r }));
    await tick();
    expect(card(el, "a")).toBe(before);
    expect(before.querySelector(".nx-cards__body")).toBe(body);
    el.rows = el.rows.map((r) => (r.id === "a" ? { ...r, compras: 1e9 } : r));
    await tick();
    expect(card(el, "a")).toBe(before);
    expect(before.querySelector(".nx-cards__body")).not.toBe(body);
    expect(before.querySelector(".nx-cards__value")!.textContent).toBe("$ 1.000.000.000");
  });

  it("las flechas pasan de una tarjeta a otra; Inicio y Fin", async () => {
    const el = await mount();
    hit(el, "a").focus();
    key(hit(el, "a"), "ArrowRight");
    expect(document.activeElement).toBe(hit(el, "b"));
    key(hit(el, "b"), "End");
    expect(document.activeElement).toBe(hit(el, "d"));
    key(hit(el, "d"), "Home");
    expect(document.activeElement).toBe(hit(el, "a"));
  });

  it("ids repetidos no se pisan", async () => {
    const el = await mount("", [
      { id: "x", name: "Uno" },
      { id: "x", name: "Dos" },
    ]);
    expect(order(el)).toEqual(["x", "x#1"]);
  });
});
