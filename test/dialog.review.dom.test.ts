// @vitest-environment happy-dom
//
// <nx-dialog> ante lo que salió de la revisión de la ficha: abrir y cerrar seguidos con View
// Transitions, `show()` fuera del documento, adónde vuelve el foco al apilar paneles, el orden de
// Tab, Escape con un popover del autor o una tarjeta encima, y el nombre accesible.
//
// El popover se simula con estado, como en un navegador: `beforetoggle` en el acto, `toggle` en otra
// tarea, sin caja mientras está oculto, y `:popover-open` (que happy-dom no conoce) se traduce a un
// atributo de prueba.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NxDialog } from "../src/index";
import "../src/index";

const OPEN = "data-test-open";
const sel = (s: string) => s.replace(/:popover-open/g, `[${OPEN}]`);

beforeAll(() => {
  const proto = Element.prototype;
  const { matches, closest, querySelector } = proto;
  proto.matches = function (this: Element, s: string) {
    return matches.call(this, sel(s));
  } as typeof proto.matches;
  proto.closest = function (this: Element, s: string) {
    return closest.call(this, sel(s));
  } as typeof proto.closest;
  proto.querySelector = function (this: Element, s: string) {
    return querySelector.call(this, sel(s));
  } as typeof proto.querySelector;
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    if (!this.isConnected) throw new DOMException("no está en el documento", "InvalidStateError");
    this.dispatchEvent(Object.assign(new Event("beforetoggle"), { newState: "open" }));
    this.setAttribute(OPEN, "");
    setTimeout(() => this.dispatchEvent(Object.assign(new Event("toggle"), { newState: "open" })));
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    if (!this.hasAttribute(OPEN)) return;
    this.removeAttribute(OPEN);
    setTimeout(() => this.dispatchEvent(Object.assign(new Event("toggle"), { newState: "closed" })));
  };
  // Sin caja dentro de un popover oculto (un diálogo cerrado no se ve).
  Element.prototype.getClientRects = function (this: Element) {
    return (closest.call(this, `[popover]:not([${OPEN}])`) ? [] : [{}]) as unknown as DOMRectList;
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  document.querySelectorAll("nx-dialog").forEach((d) => (d as NxDialog).open && (d as NxDialog).close());
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (k: string, target: Element = document.activeElement ?? document.body, shiftKey = false) => {
  const e = new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
/** View Transitions: el cambio llega en otra tarea, como en el navegador. */
const viewTransitions = () => {
  (document as unknown as { startViewTransition: (cb: () => void) => object }).startViewTransition = (cb) => {
    const done = new Promise<void>((r) => setTimeout(() => (cb(), r())));
    return { finished: done, ready: done, updateCallbackDone: done };
  };
};

function mount(attrs = "", inner = "<input name='a'>"): NxDialog {
  document.body.innerHTML = `<button id="open">Abrir</button><nx-dialog heading="Pedido" ${attrs}>${inner}</nx-dialog>`;
  return document.querySelector<NxDialog>("nx-dialog")!;
}

describe("abrir y cerrar seguidos con View Transitions", () => {
  it("close() y show() en el mismo turno: queda abierto, con su promesa pendiente", async () => {
    viewTransitions();
    const d = mount();
    const btn = document.getElementById("open")!;
    const first = d.show(btn);
    await sleep(10);
    expect(d.matches(":popover-open")).toBe(true);
    const events: boolean[] = [];
    d.addEventListener("nx-open-change", (e) => events.push(e.detail.open));
    d.close("x");
    let settled = false;
    const second = d.show(btn);
    void second.then(() => (settled = true));
    await sleep(20);
    await expect(first).resolves.toBe("x");
    expect(d.open).toBe(true);
    expect(d.hasAttribute("open")).toBe(true);
    expect(d.matches(":popover-open")).toBe(true);
    expect(settled).toBe(false);
    expect(events).toEqual([false, true]);
    d.close("y");
    await expect(second).resolves.toBe("y");
  });

  it("show() y close() antes del siguiente cuadro: queda cerrado", async () => {
    viewTransitions();
    const d = mount();
    const p = d.show(document.getElementById("open"));
    d.close("x");
    await sleep(20);
    await expect(p).resolves.toBe("x");
    expect(d.open).toBe(false);
    expect(d.hasAttribute("open")).toBe(false);
    expect(d.matches(":popover-open")).toBe(false);
  });

  it("un `toggle` de cierre que llega tarde no termina la sesión nueva", async () => {
    const d = mount();
    void d.show();
    d.close();
    const p = d.show();
    await sleep(10);
    expect(d.open).toBe(true);
    let settled = false;
    void p.then(() => (settled = true));
    await sleep(0);
    expect(settled).toBe(false);
  });
});

describe("show() fuera del documento", () => {
  it("no abre, no queda en la pila y Tab sigue funcionando en la página", async () => {
    document.body.innerHTML = `<button id="b">B</button>`;
    const d = document.createElement("nx-dialog") as NxDialog;
    await expect(d.show()).resolves.toBeUndefined();
    expect(d.open).toBe(false);
    expect(key("Tab", document.getElementById("b")!).defaultPrevented).toBe(false);
  });

  it("<nx-dialog open> que se quita antes de abrirse no deja un diálogo fantasma", async () => {
    document.body.innerHTML = `<button id="b">B</button><nx-dialog open heading="x"><input></nx-dialog>`;
    const d = document.querySelector<NxDialog>("nx-dialog")!;
    d.remove();
    await sleep(0);
    expect(d.open).toBe(false);
    expect(key("Tab", document.getElementById("b")!).defaultPrevented).toBe(false);
    expect(key("Escape", document.getElementById("b")!).defaultPrevented).toBe(false);
  });

  it("si se quita entre show() y el cuadro de View Transitions, se deshace la apertura", async () => {
    viewTransitions();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = mount();
    const p = d.show(document.getElementById("open"));
    const parent = d.parentNode!;
    d.remove();
    parent.appendChild(d);
    d.remove();
    await sleep(20);
    await expect(p).resolves.toBeUndefined();
    expect(d.open).toBe(false);
  });
});

describe("paneles apilados", () => {
  it("al cerrar el de arriba, el foco vuelve al botón que lo abrió dentro del de abajo", () => {
    document.body.innerHTML = `<nx-dialog id="a" mode="panel" heading="Pedido"><input id="i"><button id="ver">Ver proveedor</button></nx-dialog><nx-dialog id="b" mode="panel" heading="Proveedor"><input id="j"></nx-dialog>`;
    const a = document.getElementById("a") as NxDialog;
    const b = document.getElementById("b") as NxDialog;
    void a.show();
    const ver = document.getElementById("ver")!;
    ver.focus();
    void b.show(ver);
    expect(document.activeElement).toBe(document.getElementById("j"));
    b.close();
    expect(document.activeElement).toBe(ver);
  });

  it("si el origen no está en el de abajo, va a su primer campo", () => {
    document.body.innerHTML = `<button id="fuera">F</button><nx-dialog id="a" mode="panel" heading="A"><input id="i"></nx-dialog><nx-dialog id="b" mode="panel" heading="B"></nx-dialog>`;
    const a = document.getElementById("a") as NxDialog;
    const b = document.getElementById("b") as NxDialog;
    void a.show();
    void b.show(document.getElementById("fuera"));
    b.close();
    expect(document.activeElement).toBe(document.getElementById("i"));
  });
});

describe("Tab en el orden en que se ve", () => {
  // Lo que importa de dialog.css: la cabecera arriba, el aviso y el pie abajo.
  const css = `nx-dialog{display:flex;flex-direction:column} .nx-dialog__head{order:-1} .nx-dialog__guard{order:98} nx-dialog > [slot="footer"]{order:99}`;

  it("con la cabecera al final del DOM (módulo diferido), Tab va de la × al cuerpo, al pie y vuelve a la ×", () => {
    document.head.innerHTML = `<style>${css}</style>`;
    const d = mount("", `<div slot="footer"><button id="z">Guardar</button></div><input id="a1">`);
    // Como con el módulo diferido: la cabecera y el aviso, después de los hijos del autor.
    d.append(d.querySelector(".nx-dialog__head")!, d.querySelector(".nx-dialog__guard")!);
    void d.show();
    const x = d.querySelector<HTMLElement>(".nx-dialog__x")!;
    expect(document.activeElement).toBe(document.getElementById("a1"));
    expect(key("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("z"));
    key("Tab");
    expect(document.activeElement).toBe(x);
    key("Tab");
    expect(document.activeElement).toBe(document.getElementById("a1"));
    key("Tab", document.activeElement!, true);
    expect(document.activeElement).toBe(x);
  });

  it("de un grupo de radios, Tab se detiene en uno solo", () => {
    document.head.innerHTML = `<style>${css}</style>`;
    const d = mount("", `<input type="radio" name="t" id="r1"><input type="radio" name="t" id="r2" checked><input type="radio" name="t" id="r3"><button id="z">Ok</button>`);
    void d.show();
    document.getElementById("r2")!.focus();
    key("Tab");
    expect(document.activeElement).toBe(document.getElementById("z"));
    key("Tab", document.activeElement!, true);
    expect(document.activeElement).toBe(document.getElementById("r2"));
  });

  it("un Tab que ya atendió un componente de adentro (defaultPrevented) no se mueve", () => {
    const d = mount("", `<input id="a1"><input id="a2">`);
    void d.show();
    const a2 = document.getElementById("a2")!;
    a2.focus();
    a2.addEventListener("keydown", (e) => e.preventDefault(), { once: true });
    key("Tab");
    expect(document.activeElement).toBe(a2);
  });
});

describe("Escape y el foco con capas encima", () => {
  it("con un popover del autor abierto adentro, Escape es suyo: el diálogo no se cierra", () => {
    const d = mount("", `<button id="m">Menú</button><div popover id="menu"><button>Uno</button></div>`);
    void d.show();
    document.getElementById("menu")!.showPopover();
    const e = key("Escape");
    expect(e.defaultPrevented).toBe(false);
    expect(d.open).toBe(true);
    document.getElementById("menu")!.hidePopover();
    key("Escape");
    expect(d.open).toBe(false);
  });

  it("la tarjeta de un componente que cuelga de <body> (popover) recibe el foco y su Escape", () => {
    const d = mount();
    void d.show();
    const card = document.body.appendChild(Object.assign(document.createElement("div"), { tabIndex: -1 }));
    card.setAttribute("popover", "auto");
    card.innerHTML = "<button id='c'>Ver más</button>";
    card.showPopover();
    card.focus();
    expect(document.activeElement).toBe(card);
    document.getElementById("c")!.focus();
    expect(document.activeElement).toBe(document.getElementById("c"));
    const tab = key("Tab");
    expect(tab.defaultPrevented).toBe(false);
    key("Escape");
    expect(d.open).toBe(true);
  });
});

describe("nombre accesible y atributos", () => {
  it("sin heading no apunta a un h2 vacío: queda el aria-label del autor", () => {
    document.body.innerHTML = `<nx-dialog aria-label="Filtros"></nx-dialog>`;
    const d = document.querySelector<NxDialog>("nx-dialog")!;
    expect(d.hasAttribute("aria-labelledby")).toBe(false);
    d.heading = "Filtros de la tabla";
    expect(document.getElementById(d.getAttribute("aria-labelledby")!)!.textContent).toBe("Filtros de la tabla");
  });

  it("un aria-labelledby del autor no se pisa", () => {
    document.body.innerHTML = `<h3 id="t">Mío</h3><nx-dialog aria-labelledby="t" heading="Otro"></nx-dialog>`;
    expect(document.querySelector("nx-dialog")!.getAttribute("aria-labelledby")).toBe("t");
  });

  it("quitar los atributos actions y labels vuelve a lo de fábrica", () => {
    const d = mount(`actions='[{"id":"a","label":"Anular"}]' labels='{"close":"Salir"}'`);
    expect(d.actions).toHaveLength(1);
    expect(d.labels.close).toBe("Salir");
    d.removeAttribute("actions");
    d.removeAttribute("labels");
    expect(d.actions).toEqual([]);
    expect(d.labels.close).toBe("Cerrar");
  });
});
