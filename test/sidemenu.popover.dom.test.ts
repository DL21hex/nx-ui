// @vitest-environment happy-dom
//
// Lo que depende de la Popover API: el flotante abierto, el drill-down del drawer y el propio
// drawer. happy-dom no la tiene: aquí va un remedo que dispara `beforetoggle` (síncrono) y `toggle`
// (asíncrono) como el navegador, y responde `:popover-open`. El componente lleva el estado por esos
// eventos, así que se puede probar sin navegador.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { MenuItem, NxSidemenu } from "../src/index";
import "../src/components/sidemenu/index";

const shown = new WeakSet<Element>();
const fire = (el: HTMLElement, type: string, newState: "open" | "closed") =>
  el.dispatchEvent(Object.assign(new Event(type, { cancelable: type === "beforetoggle" }), { newState, oldState: newState === "open" ? "closed" : "open" }));
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
const { matches, closest } = Element.prototype;

beforeAll(() => {
  proto.showPopover = function (this: HTMLElement) {
    if (shown.has(this)) return;
    fire(this, "beforetoggle", "open");
    shown.add(this);
    setTimeout(() => fire(this, "toggle", "open"));
  };
  proto.hidePopover = function (this: HTMLElement) {
    if (!shown.has(this)) return;
    fire(this, "beforetoggle", "closed");
    shown.delete(this);
    setTimeout(() => fire(this, "toggle", "closed"));
  };
  Element.prototype.matches = function (this: Element, sel: string) {
    return sel === ":popover-open" ? shown.has(this) : matches.call(this, sel);
  } as typeof Element.prototype.matches;
  Element.prototype.closest = function (this: Element, sel: string) {
    if (sel !== ":popover-open") return closest.call(this, sel);
    for (let n: Element | null = this; n; n = n.parentElement) if (shown.has(n)) return n;
    return null;
  } as typeof Element.prototype.closest;
});
afterAll(() => {
  delete proto.showPopover;
  delete proto.hidePopover;
  Element.prototype.matches = matches;
  Element.prototype.closest = closest;
});

const setWidth = (width: number) => (window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }).happyDOM.setViewport({ width, height: 800 });
afterEach(() => {
  document.body.innerHTML = "";
  setWidth(1024);
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const MENU: MenuItem[] = [
  { id: "home", label: "Inicio", href: "/" },
  {
    id: "seg",
    label: "Seguridad Física",
    children: [
      { id: "porteria", label: "Portería", href: "/seg/porteria" },
      { id: "visitas", label: "Visitas", href: "/seg/visitas" },
      { id: "reportes", label: "Reportes", href: "/seg/reportes" },
      { id: "rondas", label: "Rondas", href: "/seg/rondas" },
    ],
  },
  { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos" },
];
/** El mismo menú, con un badge nuevo (lo que haría un refresco del servidor). */
const withBadge = () => MENU.map((it) => (it.id === "pedidos" ? { ...it, badge: 3 } : it));

async function mount(inner = ""): Promise<NxSidemenu> {
  document.body.innerHTML = `<nx-sidemenu>${inner}</nx-sidemenu>`;
  const el = document.querySelector("nx-sidemenu")!;
  el.items = MENU;
  await flush();
  return el;
}
const type = (input: HTMLInputElement, text: string) => {
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input"));
};

describe("<nx-sidemenu> con el flotante abierto", () => {
  it("un cambio de items, active o labels no lo saca del DOM: espera a que se cierre", async () => {
    const el = await mount();
    const trigger = el.querySelector<HTMLButtonElement>("button[popovertarget]")!;
    const fly = el.querySelector<HTMLElement>(`#${trigger.getAttribute("popovertarget")}`)!;
    fly.showPopover();
    await flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const input = fly.querySelector<HTMLInputElement>("input")!;
    type(input, "ron");

    el.items = withBadge();
    el.active = "/seg/visitas";
    el.labels = { filter: "Buscar" };
    await flush();
    expect(fly.isConnected).toBe(true);
    expect(fly.querySelector("input")).toBe(input);
    expect(input.value).toBe("ron");
    expect(document.activeElement).toBe(input);
    expect(el.querySelector(".nx-sidemenu__body .nx-badge")).toBeNull();

    // Al cerrarse (Escape devuelve el foco al disparador) se pinta lo pendiente y el foco sigue ahí.
    trigger.focus();
    fly.hidePopover();
    await flush();
    expect(fly.isConnected).toBe(false);
    expect(el.querySelector(".nx-sidemenu__body .nx-badge")?.textContent).toBe("3");
    expect(el.querySelector("button[popovertarget]")!.hasAttribute("data-active")).toBe(true);
    expect(document.activeElement).toBe(el.querySelector("button[popovertarget]"));
  });

  it("al cerrarse se vacía y aria-expanded vuelve a false", async () => {
    const el = await mount();
    const trigger = el.querySelector<HTMLButtonElement>("button[popovertarget]")!;
    const fly = el.querySelector<HTMLElement>(`#${trigger.getAttribute("popovertarget")}`)!;
    fly.showPopover();
    await flush();
    expect(fly.querySelector(".nx-panel")).not.toBeNull();
    fly.hidePopover();
    await flush();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(fly.childElementCount).toBe(0);
  });

  it("elegir una hoja lo cierra y avisa con nx-sidemenu-select", async () => {
    const el = await mount();
    const got = vi.fn((e: Event) => e.preventDefault());
    el.addEventListener("nx-sidemenu-select", got);
    const fly = el.querySelector<HTMLElement>(".nx-flyout")!;
    fly.showPopover();
    fly.querySelector<HTMLElement>('[data-nx-key="1.1"]')!.click();
    expect((got.mock.calls[0][0] as CustomEvent).detail.item.id).toBe("visitas");
    expect(fly.matches(":popover-open")).toBe(false);
  });
});

describe("<nx-sidemenu> drawer (móvil)", () => {
  it("con el drill-down abierto, cambiar active no borra la búsqueda ni el foco", async () => {
    setWidth(500);
    const el = await mount();
    el.show();
    expect(el.open).toBe(true);
    el.querySelector<HTMLButtonElement>("[data-nx-drill]")!.click();
    const input = el.querySelector<HTMLInputElement>(".nx-sidemenu__drill input")!;
    type(input, "ron");
    el.active = "/seg/rondas";
    el.items = withBadge();
    await flush();
    expect(el.querySelector(".nx-sidemenu__drill input")).toBe(input);
    expect(input.value).toBe("ron");
    expect(document.activeElement).toBe(input);
    // Al cerrar el drawer, el riel sale con lo nuevo.
    el.hide();
    await flush();
    expect(el.querySelector(".nx-sidemenu__drill")).toBeNull();
    expect(el.querySelector("[data-nx-drill]")!.hasAttribute("data-active")).toBe(true);
    expect(el.querySelector(".nx-sidemenu__body .nx-badge")?.textContent).toBe("3");
  });

  it("si sale del DOM abierto, avisa nx-open-change {open: false}", async () => {
    setWidth(500);
    const el = await mount();
    const seen: boolean[] = [];
    el.addEventListener("nx-open-change", (e) => seen.push(e.detail.open));
    el.show();
    await flush();
    el.remove();
    expect(seen).toEqual([true, false]);
    expect(el.open).toBe(false);
  });

  it("Escape dentro de otro popover abierto (en el slot) no cierra el drawer", async () => {
    setWidth(500);
    const el = await mount('<div slot="header"><div id="otro" popover="auto"><button>Opción</button></div></div>');
    el.show();
    const otro = el.querySelector<HTMLElement>("#otro")!;
    otro.showPopover();
    const key = (t: Element) => t.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    key(otro.querySelector("button")!);
    expect(el.open).toBe(true);
    // Fuera de él, Escape sí lo cierra.
    key(el.querySelector(".nx-sidemenu__item")!);
    expect(el.open).toBe(false);
  });
});
