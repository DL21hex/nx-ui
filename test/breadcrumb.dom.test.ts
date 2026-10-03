// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/breadcrumb/index";
import type { BreadcrumbExpandDetail, BreadcrumbItem, NxBreadcrumb } from "../src/components/breadcrumb/index";

afterEach(() => {
  document.body.innerHTML = "";
});

const tick = () => new Promise((r) => setTimeout(r, 0));

const PEOPLE = ["Laura Gómez", "Andrés Pardo", "Marcela Ruiz", "Camilo Arango", "Daniela Henao", "Felipe Zapata", "Juliana Cardona", "Óscar Bedoya"];
const people = (): BreadcrumbItem[] => PEOPLE.map((label, i) => ({ id: `e${i}`, label, href: `/empleados/e${i}/contratos` }));

async function mount(html: string): Promise<NxBreadcrumb> {
  document.body.innerHTML = html;
  await tick();
  return document.querySelector("nx-breadcrumb")!;
}
async function withItems(items: BreadcrumbItem[]): Promise<NxBreadcrumb> {
  const b = await mount("<nx-breadcrumb></nx-breadcrumb>");
  b.items = items;
  await tick();
  return b;
}
const texts = (b: NxBreadcrumb) => [...b.querySelectorAll(".nx-breadcrumb__list > li:not([hidden]) :is(.nx-breadcrumb__link, .nx-breadcrumb__current)")].map((e) => e.textContent);
const menu = (b: NxBreadcrumb) => b.querySelector<HTMLElement>(".nx-breadcrumb__menu")!;
const menuItems = (b: NxBreadcrumb) => [...menu(b).querySelectorAll<HTMLElement>("li:not([hidden]) > [data-j]")];
/** Abre el menú de un separador (llega con `import()`) y espera a que esté. */
async function open(b: NxBreadcrumb, sel: string): Promise<HTMLElement> {
  const t = b.querySelector<HTMLElement>(sel)!;
  t.click();
  await vi.waitFor(() => expect(t.getAttribute("aria-expanded")).toBe("true"));
  await tick();
  return t;
}
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

const PATH: BreadcrumbItem[] = [
  { label: "Personas", href: "/hcm", children: [{ label: "Empleados", href: "/hcm/empleados" }, { label: "Vacantes", href: "/hcm/vacantes" }] },
  { label: "Empleados", href: "/hcm/empleados", children: people() },
  { id: "e0", label: "Laura Gómez", href: "/empleados/e0" },
  { label: "Contratos" },
];

describe("<nx-breadcrumb>", () => {
  it("arma la ruta desde los hijos sin moverlos; el último es la página actual", async () => {
    const b = await mount(`<nx-breadcrumb label="Ruta del empleado">
      <a href="/hcm" data-icon="users">Personas</a>
      <a href="/hcm/empleados">Empleados</a>
      <span>Laura Gómez</span>
    </nx-breadcrumb>`);
    expect(b.hasAttribute("data-ready")).toBe(true);
    expect(texts(b)).toEqual(["Personas", "Empleados", "Laura Gómez"]);
    expect([...b.querySelectorAll(":scope > a")].map((a) => a.textContent)).toEqual(["Personas", "Empleados"]);
    expect(b.querySelector("nav")!.getAttribute("aria-label")).toBe("Ruta del empleado");
    const cur = b.querySelector(".nx-breadcrumb__current")!;
    expect(cur.getAttribute("aria-current")).toBe("page");
    expect(cur.closest("a")).toBeNull();
    expect(b.querySelector<HTMLAnchorElement>(".nx-breadcrumb__link")!.getAttribute("href")).toBe("/hcm");
    expect(b.path.map((p) => p.label)).toEqual(["Personas", "Empleados", "Laura Gómez"]);
  });

  it("repinta cuando cambian los hijos del autor", async () => {
    const b = await mount(`<nx-breadcrumb><a href="/hcm">Personas</a><span>Empleados</span></nx-breadcrumb>`);
    b.querySelector(":scope > span")!.textContent = "Vacantes";
    await tick();
    expect(texts(b)).toEqual(["Personas", "Vacantes"]);
  });

  it("un separador sin alternativas no se abre; con hijos, expandable: true o children-endpoint, sí", async () => {
    const b = await withItems(PATH);
    const seps = [...b.querySelectorAll(".nx-breadcrumb__sep")];
    expect(seps.map((s) => s.tagName)).toEqual(["BUTTON", "BUTTON", "SPAN"]);
    expect(seps[1].getAttribute("aria-label")).toBe("Otros en Empleados");
    b.items = [...PATH.slice(0, 2), { ...PATH[2], expandable: true }, PATH[3]];
    await tick();
    expect(b.querySelectorAll("button.nx-breadcrumb__sep")).toHaveLength(3);
    b.items = PATH;
    b.childrenEndpoint = "/api/hijos/{id}";
    await tick();
    expect(b.getAttribute("children-endpoint")).toBe("/api/hijos/{id}");
    expect(b.querySelectorAll("button.nx-breadcrumb__sep")).toHaveLength(3);
  });

  it("el separador abre los hermanos con el actual marcado y buscador si son más de 7", async () => {
    const b = await withItems(PATH);
    await open(b, '[data-sep="1"]');
    expect(menu(b).hidden).toBe(false);
    expect(menuItems(b).map((m) => m.textContent)).toEqual(PEOPLE);
    expect(menuItems(b)[0].getAttribute("aria-checked")).toBe("true");
    expect(menuItems(b)[1].getAttribute("href")).toBe("/empleados/e1/contratos");
    const input = menu(b).querySelector("input")!;
    expect(document.activeElement).toBe(input);
    input.value = "oscar";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(menuItems(b).map((m) => m.textContent)).toEqual(["Óscar Bedoya"]);
    input.value = "zzz";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(menu(b).querySelector<HTMLElement>(".nx-breadcrumb__status")!.textContent).toBe("Sin resultados");
  });

  it("con pocos hermanos no hay buscador; el foco va al actual y las flechas recorren", async () => {
    const b = await withItems(PATH);
    await open(b, '[data-sep="0"]');
    expect(menu(b).querySelector("input")).toBeNull();
    const [a, v] = menuItems(b);
    expect(document.activeElement).toBe(a);
    key(a, "ArrowDown");
    expect(document.activeElement).toBe(v);
    key(v, "ArrowDown");
    expect(document.activeElement).toBe(a);
    key(a, "v");
    expect(document.activeElement).toBe(v);
  });

  it("tabindex itinerante: una sola entrada con 0 (la actual o la enfocada); el filtro no la deja escondida", async () => {
    const b = await withItems(PATH);
    await open(b, '[data-sep="1"]');
    const zero = () => menuItems(b).filter((m) => m.tabIndex === 0).map((m) => m.textContent);
    // El foco está en el buscador; la lista igual tiene una entrada enfocable (axe: scrollable-region-focusable).
    expect(zero()).toEqual(["Laura Gómez"]);
    key(menu(b).querySelector("input")!, "ArrowDown");
    expect(document.activeElement).toBe(menuItems(b)[0]);
    key(menuItems(b)[0], "ArrowDown");
    expect(zero()).toEqual(["Andrés Pardo"]);
    const input = menu(b).querySelector("input")!;
    input.value = "oscar";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(zero()).toEqual(["Óscar Bedoya"]);
  });

  it("Esc cierra y devuelve el foco; un segundo clic también cierra", async () => {
    const b = await withItems(PATH);
    const sep = await open(b, '[data-sep="0"]');
    key(menuItems(b)[0], "Escape");
    expect(menu(b).hidden).toBe(true);
    expect(sep.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(sep);
    await open(b, '[data-sep="0"]');
    sep.click();
    await vi.waitFor(() => expect(menu(b).hidden).toBe(true));
  });

  it("elegir un hermano avisa con nx-breadcrumb-navigate; cancelarlo deja el href sin seguir", async () => {
    const b = await withItems(PATH);
    const spy = vi.fn((e: Event) => e.preventDefault());
    b.addEventListener("nx-breadcrumb-navigate", spy);
    await open(b, '[data-sep="1"]');
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    menuItems(b)[1].dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    const detail = (spy.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.item.label).toBe("Andrés Pardo");
    expect(detail.level).toBe(2);
    expect(detail.via).toBe("menu");
    expect(menu(b).hidden).toBe(true);
  });

  it("elegir el que ya está solo cierra el menú", async () => {
    const b = await withItems(PATH);
    const spy = vi.fn();
    b.addEventListener("nx-breadcrumb-navigate", spy);
    await open(b, '[data-sep="1"]');
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    menuItems(b)[0].dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it("un nombre de la ruta avisa con via «link» y su nivel", async () => {
    const b = await withItems(PATH);
    const spy = vi.fn();
    b.addEventListener("nx-breadcrumb-navigate", (e) => {
      spy(e.detail);
      e.preventDefault();
    });
    b.querySelectorAll<HTMLElement>(".nx-breadcrumb__link")[1].click();
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ level: 1, via: "link" }));
  });

  it("nx-breadcrumb-expand se emite al abrir, una vez por camino; la app responde después de cancelarlo; si falla, lo dice", async () => {
    const b = await mount(`<nx-breadcrumb><a href="/a" data-expandable="true">A</a><a href="/b" data-expandable="false">B</a><span>C</span></nx-breadcrumb>`);
    let respond!: (v: BreadcrumbItem[] | Promise<BreadcrumbItem[]>) => void;
    const asked = vi.fn((e: CustomEvent<BreadcrumbExpandDetail>) => {
      e.preventDefault();
      respond = e.detail.respond;
    });
    b.addEventListener("nx-breadcrumb-expand", asked);
    expect(b.querySelectorAll("button.nx-breadcrumb__sep")).toHaveLength(1);
    const sep = await open(b, '[data-sep="0"]');
    expect(menu(b).textContent).toBe("Cargando…");
    expect(asked.mock.calls[0][0].detail).toMatchObject({ item: { label: "A", href: "/a" }, level: 0 });
    respond([{ label: "B", href: "/b" }, { label: "Z", href: "/z" }]);
    await vi.waitFor(() => expect(menuItems(b).map((m) => m.textContent)).toEqual(["B", "Z"]));
    expect(menuItems(b)[0].getAttribute("aria-checked")).toBe("true");
    sep.click();
    await vi.waitFor(() => expect(menu(b).hidden).toBe(true));
    await open(b, '[data-sep="0"]');
    expect(menuItems(b)).toHaveLength(2);
    expect(asked).toHaveBeenCalledTimes(1);

    b.items = [{ label: "X", expandable: true }, { label: "Y" }, { label: "Z" }];
    await tick();
    await open(b, '[data-sep="0"]');
    // La región viva es la misma: cambia su texto, y así se anuncia.
    const live = menu(b).querySelector(".nx-breadcrumb__status")!;
    expect(live.textContent).toBe("Cargando…");
    respond(Promise.reject(new Error("x")));
    await vi.waitFor(() => expect(menu(b).textContent).toBe("No se pudo cargar"));
    expect(menu(b).querySelector(".nx-breadcrumb__status")).toBe(live);
  });

  it("si la app responde en el momento, no hace falta cancelar; si nadie responde, «Sin resultados»", async () => {
    const b = await withItems([{ label: "A", expandable: true }, { label: "B", expandable: true }, { label: "C" }]);
    b.addEventListener("nx-breadcrumb-expand", (e) => {
      if (e.detail.level === 0) e.detail.respond([{ label: "B" }, { label: "Otra" }]);
    });
    await open(b, '[data-sep="0"]');
    expect(menuItems(b).map((m) => m.textContent)).toEqual(["B", "Otra"]);
    await open(b, '[data-sep="1"]');
    await vi.waitFor(() => expect(menu(b).textContent).toBe("Sin resultados"));
  });

  it("«‹ Padre» apunta al nivel de arriba y avisa con via «back»", async () => {
    const b = await withItems(PATH);
    const back = b.querySelector<HTMLAnchorElement>(".nx-breadcrumb__back")!;
    expect(back.getAttribute("href")).toBe("/empleados/e0");
    expect(back.getAttribute("aria-label")).toBe("Volver a Laura Gómez");
    const spy = vi.fn((e: Event) => e.preventDefault());
    b.addEventListener("nx-breadcrumb-navigate", spy);
    back.click();
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ level: 2, via: "back" });
  });

  it("Alt+↑ sube un nivel (no mientras se escribe)", async () => {
    const b = await withItems(PATH);
    document.body.append(document.createElement("input"));
    const spy = vi.fn((e: Event) => e.preventDefault());
    b.addEventListener("nx-breadcrumb-navigate", spy);
    key(document.querySelector("input")!, "ArrowUp", { altKey: true });
    expect(spy).not.toHaveBeenCalled();
    key(document.body, "ArrowUp", { altKey: true });
    expect((spy.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ level: 2, via: "key" });
  });

  it("solo los niveles nuevos entran con animación", async () => {
    const b = await withItems(PATH);
    expect(b.querySelectorAll(".is-new")).toHaveLength(0);
    b.items = [...PATH.slice(0, 2), { id: "e1", label: "Andrés Pardo" }];
    await tick();
    expect([...b.querySelectorAll(".is-new")].map((li) => li.textContent)).toEqual(["Andrés Pardo"]);
  });

  it("al repintar, el foco vuelve al mismo separador", async () => {
    const b = await withItems(PATH);
    b.querySelector<HTMLButtonElement>('[data-sep="1"]')!.focus();
    b.items = [...PATH.slice(0, 2), { id: "e1", label: "Andrés Pardo", href: "/empleados/e1" }, { label: "Contratos" }];
    await tick();
    expect(document.activeElement).toBe(b.querySelector('[data-sep="1"]'));
  });

  it("si no cabe, esconde los niveles del medio en «…», que abre un menú con ellos", async () => {
    // happy-dom no mide: anchos falsos (cada nivel 150, su nombre 130, el «…» 30) en una ruta de 600.
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.localName === "nx-breadcrumb" || this.localName === "ol" ? 600 : 0;
    });
    const rect = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      const width = this.classList.contains("is-more") ? 30 : this.localName === "li" ? 150 : 130;
      return { width, height: 20, top: 0, left: 0, right: width, bottom: 20, x: 0, y: 0, toJSON() {} } as DOMRect;
    });
    try {
      const b = await withItems([...PATH, { label: "Contrato 2024" }]);
      // Cinco niveles = 750. k=1 (sin el nombre de «Empleados»): 650, no alcanza; k=2 (sale
      // «Empleados» entero y el nombre de «Laura»): 750 - 150 - 130 + 30 = 500.
      expect([...b.querySelectorAll(".nx-breadcrumb__list > li:not([hidden]):not(.is-tail) :is(.nx-breadcrumb__link, .nx-breadcrumb__current)")].map((e) => e.textContent)).toEqual(["Personas", "Contratos", "Contrato 2024"]);
      const tail = b.querySelector(".is-tail")!;
      expect(tail.querySelector(".nx-breadcrumb__link")!.textContent).toBe("Laura Gómez");
      expect(tail.querySelector(".nx-breadcrumb__sep")).not.toBeNull();
      const more = b.querySelector<HTMLElement>(".nx-breadcrumb__more")!;
      expect(more.getAttribute("aria-label")).toBe("Niveles ocultos (2)");
      await open(b, ".nx-breadcrumb__more");
      expect(menuItems(b).map((m) => m.textContent)).toEqual(["Empleados", "Laura Gómez"]);
      expect(menuItems(b)[1].style.getPropertyValue("--_lvl")).toBe("1");
      expect(menuItems(b)[0].getAttribute("role")).toBe("menuitem");
      const spy = vi.fn((e: Event) => e.preventDefault());
      b.addEventListener("nx-breadcrumb-navigate", spy);
      menuItems(b)[1].click();
      expect((spy.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ level: 2, via: "menu" });
    } finally {
      cw.mockRestore();
      rect.mockRestore();
    }
  });

  it("por debajo de 480 px queda «‹ Padre»", async () => {
    const cw = vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    try {
      const b = await withItems(PATH);
      expect(b.querySelector("nav")!.hasAttribute("data-compact")).toBe(true);
      expect(b.querySelector(".nx-breadcrumb__back")!.textContent).toBe("Laura Gómez");
    } finally {
      cw.mockRestore();
    }
  });

  it("un nivel sin href es un botón; el atributo items acepta JSON", async () => {
    const b = await mount(`<nx-breadcrumb items='[{"label":"Raíz"},{"label":"Hoja"}]'></nx-breadcrumb>`);
    expect(b.querySelector(".nx-breadcrumb__link")!.tagName).toBe("BUTTON");
    expect(texts(b)).toEqual(["Raíz", "Hoja"]);
  });

  it("labels cambia los textos", async () => {
    const b = await withItems(PATH);
    b.labels = { siblings: "More in {label}", label: "Path" };
    await tick();
    expect(b.querySelector('[data-sep="0"]')!.getAttribute("aria-label")).toBe("More in Personas");
    expect(b.querySelector("nav")!.getAttribute("aria-label")).toBe("Path");
  });

  it("al desconectarse cierra el menú", async () => {
    const b = await withItems(PATH);
    await open(b, '[data-sep="0"]');
    b.remove();
    expect(menu(b).hidden).toBe(true);
    document.body.append(b);
    await tick();
    await open(b, '[data-sep="0"]');
    expect(menu(b).hidden).toBe(false);
  });
});

describe("<nx-breadcrumb> hijos pedidos, foco y lugar del menú", () => {
  const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));
  afterEach(() => vi.unstubAllGlobals());

  it("children-endpoint: GET con {id} y {level}, del mismo origen; sin {id}, va como ?id=", async () => {
    const fetch = vi.fn((_url: string, _init?: RequestInit) => json([{ label: "Vacantes", href: "/hcm/vacantes" }, { label: "Empleados", href: "/hcm/empleados" }]));
    vi.stubGlobal("fetch", fetch);
    const b = await mount(`<nx-breadcrumb children-endpoint="/api/hijos/{id}?nivel={level}"><a href="/hcm">Personas</a><a href="/hcm/empleados">Empleados</a><span>Laura</span></nx-breadcrumb>`);
    await open(b, '[data-sep="0"]');
    await vi.waitFor(() => expect(menuItems(b).map((m) => m.textContent)).toEqual(["Vacantes", "Empleados"]));
    expect(fetch.mock.calls[0][0]).toBe("/api/hijos/%2Fhcm?nivel=0");
    expect(menuItems(b)[1].getAttribute("aria-checked")).toBe("true");
    b.childrenEndpoint = "/api/hijos";
    await tick();
    await open(b, '[data-sep="1"]');
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls[1][0]).toBe("/api/hijos?id=%2Fhcm%2Fempleados");
  });

  it("children-endpoint de otro origen no se pide: «No se pudo cargar»", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn(() => json([]));
    vi.stubGlobal("fetch", fetch);
    const b = await mount(`<nx-breadcrumb children-endpoint="https://otro.example/{id}"><a href="/a">A</a><span>B</span></nx-breadcrumb>`);
    await open(b, '[data-sep="0"]');
    await vi.waitFor(() => expect(menu(b).textContent).toBe("No se pudo cargar"));
    expect(fetch).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("lo guardado es por camino: dos «General» sin id ni href, en ramas distintas, no comparten hijos", async () => {
    const asked: string[] = [];
    const b = await withItems([{ label: "Raíz" }, { label: "General", expandable: true }, { label: "X" }]);
    b.addEventListener("nx-breadcrumb-expand", (e) => {
      const root = b.path[0].label;
      asked.push(root);
      e.detail.respond([{ label: `hijo de ${root}` }, { label: "X" }]);
    });
    await open(b, '[data-sep="1"]');
    expect(menuItems(b)[0].textContent).toBe("hijo de Raíz");
    b.items = [{ label: "Otra raíz" }, { label: "General", expandable: true }, { label: "Y" }];
    await tick();
    await open(b, '[data-sep="1"]');
    expect(menuItems(b)[0].textContent).toBe("hijo de Otra raíz");
    expect(asked).toEqual(["Raíz", "Otra raíz"]);
  });

  it("una respuesta del children-endpoint anterior que llega tarde no se guarda", async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (answer = r))));
    const b = await mount(`<nx-breadcrumb children-endpoint="/viejo/{id}"><a href="/a">A</a><a href="/b">B</a><span>C</span></nx-breadcrumb>`);
    await open(b, '[data-sep="0"]');
    b.childrenEndpoint = "/nuevo/{id}";
    answer(new Response(JSON.stringify([{ label: "del viejo" }, { label: "B", href: "/b" }])));
    await tick();
    const fetch = vi.fn((_url: string, _init?: RequestInit) => json([{ label: "del nuevo" }, { label: "B", href: "/b" }]));
    vi.stubGlobal("fetch", fetch);
    await open(b, '[data-sep="0"]');
    await vi.waitFor(() => expect(menuItems(b)[0]?.textContent).toBe("del nuevo"));
    expect(fetch.mock.calls[0][0]).toBe("/nuevo/%2Fa");
  });

  it("mientras carga, Esc en el separador cierra; si el foco se va a otra parte, cierra y no se lo roba", async () => {
    const b = await withItems([{ label: "A", expandable: true }, { label: "B" }, { label: "C" }]);
    const other = document.body.appendChild(document.createElement("input"));
    let respond!: (v: BreadcrumbItem[]) => void;
    b.addEventListener("nx-breadcrumb-expand", (e) => {
      e.preventDefault();
      respond = e.detail.respond;
    });
    const sep = await open(b, '[data-sep="0"]');
    sep.focus();
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    sep.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(sep.getAttribute("aria-expanded")).toBe("false");
    expect(menu(b).hidden).toBe(true);
    expect(document.activeElement).toBe(sep);

    await open(b, '[data-sep="0"]');
    other.focus();
    expect(menu(b).hidden).toBe(true);
    respond([{ label: "B" }, { label: "Z" }]);
    await tick();
    expect(document.activeElement).toBe(other);
    expect(menu(b).hidden).toBe(true);
  });

  it("Tab dentro del menú lo cierra con el foco de vuelta en el separador (sigue desde ahí)", async () => {
    const b = await withItems(PATH);
    const sep = await open(b, '[data-sep="0"]');
    key(menuItems(b)[0], "Tab");
    expect(menu(b).hidden).toBe(true);
    expect(document.activeElement).toBe(sep);
  });

  it("cerca del borde de abajo se abre hacia arriba; en RTL se alinea por la derecha del botón", async () => {
    const b = await withItems(PATH);
    const sep = b.querySelector<HTMLElement>('[data-sep="0"]')!;
    const at = (top: number) => (sep.getBoundingClientRect = () => ({ top, bottom: top + 24, left: 100, right: 124, width: 24, height: 24, x: 100, y: top, toJSON() {} }) as DOMRect);
    at(innerHeight - 60);
    await open(b, '[data-sep="0"]');
    expect(menu(b).hasAttribute("data-up")).toBe(true);
    expect(menu(b).style.top).toBe("auto");
    expect(menu(b).style.bottom).toBe(`${60 + 6}px`);
    sep.click();
    await vi.waitFor(() => expect(menu(b).hidden).toBe(true));
    at(40);
    // happy-dom no hereda `dir` en getComputedStyle: la dirección va en el propio botón.
    sep.style.direction = "rtl";
    Object.defineProperty(menu(b), "offsetWidth", { configurable: true, value: 256 });
    await open(b, '[data-sep="0"]');
    expect(menu(b).hasAttribute("data-up")).toBe(false);
    expect(menu(b).style.top).toBe("70px");
    // Borde derecho del botón (124) + 8 − ancho del menú (256), sin salirse de la ventana.
    expect(menu(b).style.left).toBe("8px");
  });

  it("con pantalla táctil, el menú con buscador enfoca el actual, no el buscador (no abre el teclado)", async () => {
    const mm = vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: !q.includes("pointer: fine"), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    try {
      const b = await withItems(PATH);
      await open(b, '[data-sep="1"]');
      expect(menu(b).querySelector("input")).not.toBeNull();
      expect(document.activeElement).toBe(menuItems(b)[0]);
    } finally {
      mm.mockRestore();
    }
  });

  it("desplazar con el foco en el buscador: con puntero fino cierra; en táctil recoloca, salvo que el botón ya no se vea", async () => {
    const b = await withItems(PATH);
    await open(b, '[data-sep="1"]');
    expect(document.activeElement).toBe(menu(b).querySelector("input"));
    window.dispatchEvent(new Event("scroll"));
    expect(menu(b).hidden).toBe(true);

    const mm = vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: !q.includes("pointer: fine"), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    try {
      const sep = await open(b, '[data-sep="1"]');
      menu(b).querySelector("input")!.focus();
      let top = 100;
      sep.getBoundingClientRect = () => ({ top, bottom: top + 20, left: 100, right: 120, width: 20, height: 20, x: 100, y: top }) as DOMRect;
      window.dispatchEvent(new Event("scroll"));
      await new Promise((r) => requestAnimationFrame(r));
      expect(menu(b).hidden).toBe(false);
      expect(menu(b).style.top).toBe("126px");
      top = -50;
      window.dispatchEvent(new Event("scroll"));
      expect(menu(b).hidden).toBe(true);
    } finally {
      mm.mockRestore();
    }
  });

  it("quitar el atributo labels vuelve a los textos de fábrica", async () => {
    const b = await mount(`<nx-breadcrumb labels='{"label":"Camino"}'><a href="/a">A</a><span>B</span></nx-breadcrumb>`);
    expect(b.labels.label).toBe("Camino");
    b.removeAttribute("labels");
    await tick();
    expect(b.labels.label).toBe("Ruta");
    expect(b.querySelector("nav")!.getAttribute("aria-label")).toBe("Ruta");
  });
});
