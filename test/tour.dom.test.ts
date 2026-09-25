// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanSteps, findTarget, nxTour } from "../src/components/tour/tour";

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
  // happy-dom no calcula cajas: todo cuenta como visible.
  Element.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(() => (document.body.innerHTML = ""));
const key = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const card = () => document.querySelector<HTMLElement>(".nx-tour__card");

const STEPS = [
  { target: "#nuevo", title: "Crea un pedido", text: "Empieza aquí." },
  { target: "[data-tour=nada]", title: "Sin elemento", text: "Va centrado." },
  { target: "#filtros", title: "Filtra" },
];

describe("nxTour()", () => {
  it("cleanSteps descarta lo que no tiene título; findTarget no rompe con un selector inválido", () => {
    expect(cleanSteps([{ title: "ok", target: "#a", onclick: "x" }, { target: "#b" }, null])).toEqual([{ title: "ok", target: "#a", text: undefined }]);
    expect(findTarget("###")).toBeNull();
    expect(findTarget(undefined)).toBeNull();
  });

  it("muestra cada paso con su luz; Enter/→ avanza, ← vuelve, y al final resuelve completed", async () => {
    document.body.innerHTML = '<button id="antes">antes</button><button id="nuevo">Nuevo</button><div id="filtros"></div>';
    const before = document.getElementById("antes")!;
    before.focus();
    const done = nxTour(STEPS);
    expect(card()!.getAttribute("role")).toBe("dialog");
    expect(document.activeElement).toBe(card());
    expect(card()!.querySelector(".nx-tour__title")!.textContent).toBe("Crea un pedido");
    expect(card()!.querySelector(".nx-tour__count")!.textContent).toBe("1 de 3");
    expect(document.querySelector<HTMLElement>(".nx-tour__spot")!.hidden).toBe(false);
    key("ArrowRight");
    expect(card()!.querySelector(".nx-tour__title")!.textContent).toBe("Sin elemento");
    expect(document.querySelector<HTMLElement>(".nx-tour__spot")!.hidden).toBe(true);
    key("ArrowLeft");
    key("Enter");
    key("Enter");
    expect(card()!.querySelector<HTMLButtonElement>('[data-t="next"]')!.textContent).toBe("Listo");
    key("Enter");
    await expect(done).resolves.toEqual({ completed: true, step: 2 });
    expect(document.querySelector(".nx-tour")).toBeNull();
    expect(document.activeElement).toBe(before);
  });

  it("Escape termina sin completar; un recorrido nuevo reemplaza al anterior", async () => {
    document.body.innerHTML = '<button id="nuevo">Nuevo</button>';
    const first = nxTour(STEPS);
    const second = nxTour([{ title: "Otro" }]);
    await expect(first).resolves.toEqual({ completed: false, step: 0 });
    expect(document.querySelectorAll(".nx-tour")).toHaveLength(1);
    key("Escape");
    await expect(second).resolves.toEqual({ completed: false, step: 0 });
  });

  it("sin pasos no hace nada; nada del texto se interpreta como HTML", async () => {
    await expect(nxTour([])).resolves.toEqual({ completed: false, step: -1 });
    void nxTour([{ title: "<img src=x onerror=alert(1)>", text: "<b>x</b>" }]);
    expect(document.querySelector(".nx-tour img, .nx-tour b")).toBeNull();
    key("Escape");
  });
});
