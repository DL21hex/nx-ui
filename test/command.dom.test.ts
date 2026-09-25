// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador
// (`beforetoggle` síncrono, `toggle` después).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import "../src/index";
import type { CommandItem, NxCommand, NxSidemenu } from "../src/index";

beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    fire(this, "closed");
  };
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ITEMS: CommandItem[] = [
  { id: "nuevo", label: "Nuevo pedido", group: "Acciones", keywords: ["crear"], shortcut: "N" },
  { id: "tema", label: "Cambiar paleta", group: "Acciones", children: [{ id: "oceano", label: "Océano" }, { id: "bosque", label: "Bosque" }] },
  { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos", group: "Ir a" },
];

function mount(attrs = "", setup?: (el: NxCommand) => void): NxCommand {
  document.body.innerHTML = `<button id="before">antes</button><nx-command ${attrs}></nx-command>`;
  const el = document.querySelector("nx-command")!;
  el.items = ITEMS;
  setup?.(el);
  return el;
}
const input = (el: NxCommand) => el.querySelector<HTMLInputElement>(".nx-command__input")!;
const opts = (el: NxCommand) => [...el.querySelectorAll<HTMLElement>('[role="option"]')];
const texts = (el: NxCommand) => opts(el).map((o) => o.querySelector(".nx-command__label")!.textContent);
const groups = (el: NxCommand) => [...el.querySelectorAll(".nx-command__group-h")].map((g) => g.textContent);
const type = (el: NxCommand, q: string) => {
  input(el).value = q;
  input(el).dispatchEvent(new Event("input"));
};
const key = (el: NxCommand, k: string, o: KeyboardEventInit = {}) => input(el).dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o }));
const hotkey = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }));

describe("<nx-command>", () => {
  it("es un diálogo en la capa superior con un combobox; ⌘/Ctrl+K lo abre y lo cierra", () => {
    const el = mount();
    expect(el.getAttribute("popover")).toBe("auto");
    expect(el.getAttribute("role")).toBe("dialog");
    expect(el.getAttribute("aria-label")).toBe("Paleta de comandos");
    expect(input(el).getAttribute("role")).toBe("combobox");
    hotkey();
    expect(el.open).toBe(true);
    expect(document.activeElement).toBe(input(el));
    hotkey();
    expect(el.open).toBe(false);
  });

  it("hotkey='none' no escucha el teclado; show(q) abre con la consulta escrita", () => {
    const el = mount('hotkey="none"');
    hotkey();
    expect(el.open).toBe(false);
    el.show("pedi");
    expect(input(el).value).toBe("pedi");
    expect(texts(el)).toEqual(["Pedidos", "Nuevo pedido"]);
  });

  it("sin consulta muestra todo por grupos; al escribir filtra, resalta y marca lo que coincide", () => {
    const el = mount();
    el.show();
    expect(groups(el)).toEqual(["Acciones", "Ir a"]);
    type(el, "crear");
    expect(texts(el)).toEqual(["Nuevo pedido"]);
    type(el, "nuevo");
    expect(opts(el)[0].querySelector("mark")!.textContent).toBe("Nuevo");
    expect(opts(el)[0].getAttribute("aria-selected")).toBe("true");
    expect(input(el).getAttribute("aria-activedescendant")).toBe(opts(el)[0].id);
    expect(opts(el)[0].querySelector("kbd")!.textContent).toBe("N");
  });

  it("los enlaces son <a href>; Enter navega como un clic y la paleta se cierra", () => {
    const el = mount();
    const clicks: string[] = [];
    document.addEventListener("click", (e) => {
      const a = (e.target as Element).closest("a");
      if (a) {
        clicks.push(a.getAttribute("href")!);
        e.preventDefault(); // la prueba no navega
      }
    });
    el.show();
    type(el, "pedidos");
    expect(opts(el)[0].tagName).toBe("A");
    key(el, "Enter");
    expect(clicks).toEqual(["/ventas/pedidos"]);
    expect(el.open).toBe(false);
  });

  it("una acción avisa con nx-command-select {item, query}; cancelarlo deja la paleta abierta", () => {
    const el = mount();
    const got: string[] = [];
    el.addEventListener("nx-command-select", (e) => got.push(`${e.detail.item.id}:${e.detail.query}`));
    el.show();
    type(el, "nuevo");
    key(el, "Enter");
    expect(got).toEqual(["nuevo:nuevo"]);
    expect(el.open).toBe(false);

    el.addEventListener("nx-command-select", (e) => e.preventDefault(), { once: true });
    el.show();
    type(el, "nuevo");
    key(el, "Enter");
    expect(el.open).toBe(true);
  });

  it("un submenú abre otra lista con su miga; Escape o Backspace vuelven, y Escape de nuevo cierra", () => {
    const el = mount();
    el.show();
    type(el, "paleta");
    key(el, "Enter");
    expect(el.open).toBe(true);
    expect(texts(el)).toEqual(["Océano", "Bosque"]);
    expect(el.querySelector(".nx-command__crumb")!.textContent).toBe("Cambiar paleta");
    key(el, "Backspace");
    expect(texts(el)).toContain("Cambiar paleta");
    type(el, "paleta");
    key(el, "Enter");
    key(el, "Escape");
    expect(el.open).toBe(true);
    expect(el.querySelector(".nx-command__crumb")).toBeNull();
    key(el, "Escape");
    expect(el.open).toBe(false);
  });

  it("flechas mueven el resaltado; Tab no saca el foco", () => {
    const el = mount();
    el.show();
    key(el, "ArrowDown");
    expect(opts(el)[1].getAttribute("aria-selected")).toBe("true");
    key(el, "ArrowUp");
    key(el, "ArrowUp");
    expect(opts(el).at(-1)!.getAttribute("aria-selected")).toBe("true");
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    input(el).dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
  });

  it("recuerda lo elegido: aparece en «Recientes» y sobrevive a otra instancia (localStorage)", () => {
    let el = mount();
    el.addEventListener("nx-command-select", () => {});
    el.show();
    type(el, "paleta");
    key(el, "Enter"); // Cambiar paleta (submenú)
    key(el, "ArrowDown");
    key(el, "Enter"); // Bosque
    el = mount();
    el.show();
    expect(groups(el)[0]).toBe("Recientes");
    expect(texts(el).slice(0, 2)).toEqual(["Bosque", "Cambiar paleta"]);
    // El reciente de un submenú lleva su camino como pista.
    expect(opts(el)[0].querySelector(".nx-command__hint")!.textContent).toBe("Cambiar paleta");
    // Lo reciente no se repite abajo.
    expect(texts(el).filter((t) => t === "Cambiar paleta")).toHaveLength(1);
    el.clearHistory();
    expect(groups(el)[0]).toBe("Acciones");
  });

  it("un registro del servidor no se guarda en localStorage ni vuelve a «Recientes»", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify([{ id: "cli-1", label: "Ana Pérez · CC 1234567", data: { cedula: "1234567" } }]))));
    let el = mount('source="/buscar"');
    const chosen: string[] = [];
    el.addEventListener("nx-command-select", (e) => chosen.push(e.detail.item.label));
    el.show("ana");
    await sleep(10);
    opts(el).find((o) => o.textContent!.includes("Ana"))!.click();
    expect(chosen).toEqual(["Ana Pérez · CC 1234567"]);
    el = mount();
    el.show();
    expect(localStorage.getItem("nx-command") ?? "").not.toContain("1234567");
    expect(texts(el)).not.toContain("Ana Pérez · CC 1234567");
  });

  it("lo guardado de una entrada que ya no está (otra sesión, otro usuario) no aparece", () => {
    localStorage.setItem("nx-command", JSON.stringify({ viejo: { n: 3, t: Date.now(), item: { id: "viejo", label: "Factura de Ana", href: "/f/9", data: { x: 1 } } } }));
    const el = mount();
    el.show();
    expect(groups(el)[0]).toBe("Acciones");
    expect(texts(el)).not.toContain("Factura de Ana");
  });

  it("un atajo sin modificador («/») no se atiende mientras se escribe en un campo", () => {
    document.body.innerHTML = '<input id="campo"><nx-command hotkey="/"></nx-command>';
    const el = document.querySelector("nx-command")!;
    const campo = document.querySelector<HTMLInputElement>("#campo")!;
    const slash = new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true });
    campo.dispatchEvent(slash);
    expect(slash.defaultPrevented).toBe(false);
    expect(el.open).toBe(false);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true }));
    expect(el.open).toBe(true);
  });

  it("source de otro origen no se llama", async () => {
    const fetchMock = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('source="https://evil.example/buscar"');
    el.show("pedidos");
    await sleep(10);
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("menu='id' suma las pantallas de un <nx-sidemenu> con su ruta como pista", () => {
    document.body.innerHTML = '<nx-sidemenu id="nav"></nx-sidemenu><nx-command menu="nav"></nx-command>';
    const nav = document.querySelector<NxSidemenu>("#nav")!;
    nav.items = [{ id: "ventas", label: "Ventas", children: [{ id: "facturas", label: "Facturas", href: "/ventas/facturas" }] }];
    const el = document.querySelector("nx-command")!;
    el.show("factu");
    expect(texts(el)).toEqual(["Facturas"]);
    expect(opts(el)[0].querySelector(".nx-command__hint")!.textContent).toBe("Ventas");
    expect(groups(el)).toEqual(["Ir a"]);
  });

  it("source: pide ?q= al servidor y agrega los registros en su orden, sin repetir", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      expect(url.searchParams.get("q")).toBe("pedidos");
      return new Response(JSON.stringify({ items: [{ id: "pedidos", label: "Pedidos", href: "/x" }, { id: "oc", label: "OC-2291 · pedidos de acero", href: "/oc/2291", group: "Órdenes" }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('source="/buscar"');
    el.show("pedidos");
    expect(el.querySelector<HTMLElement>(".nx-command__spin")!.hidden).toBe(false);
    await sleep(10);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(texts(el)).toEqual(["Pedidos", "OC-2291 · pedidos de acero"]);
    expect(groups(el)).toEqual(["Ir a", "Órdenes"]);
  });

  it("agent='id': lo que no se encuentra se le pregunta al asistente (nx-command-ask)", () => {
    document.body.innerHTML = '<div id="asis"></div><nx-command agent="asis"></nx-command>';
    const asis = document.getElementById("asis") as HTMLElement & { send: (t: string) => void };
    const sent: string[] = [];
    asis.send = (t) => sent.push(t);
    const el = document.querySelector("nx-command")!;
    el.items = ITEMS;
    el.show("¿qué pedidos vencen hoy?");
    expect(el.querySelector(".nx-command__empty")!.textContent).toBe("Sin resultados");
    expect(opts(el)).toHaveLength(1);
    expect(opts(el)[0].textContent).toContain("Preguntarle al asistente");
    key(el, "Enter");
    expect(sent).toEqual(["¿qué pedidos vencen hoy?"]);
    expect(el.open).toBe(false);
  });

  it("devuelve el foco a donde estaba al cerrarse", () => {
    const el = mount();
    const before = document.getElementById("before")!;
    before.focus();
    hotkey();
    expect(document.activeElement).toBe(input(el));
    key(el, "Escape");
    expect(document.activeElement).toBe(before);
  });

  it("BDUI: {component: 'Command'} con sus props", () => {
    const [el] = render({ component: "Command", props: { items: ITEMS, hotkey: "none", onclick: "x" } }, document.body) as NxCommand[];
    expect(el.tagName).toBe("NX-COMMAND");
    expect(el.items).toHaveLength(3);
    expect(el.hotkey).toBe("none");
  });

  it("el texto de las entradas nunca se interpreta como HTML", () => {
    const el = mount("", (c) => (c.items = [{ label: '<img src=x onerror="alert(1)">', href: "javascript:alert(1)" }]));
    el.show();
    expect(el.querySelector("img")).toBeNull();
    expect(opts(el)[0].tagName).toBe("DIV"); // un href inseguro no se pinta como enlace
  });
});
