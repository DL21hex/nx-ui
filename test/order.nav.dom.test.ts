// @vitest-environment happy-dom
//
// src/core/order.ts ante lo que salió de probar <nx-dialog> y <nx-tabs> en navegador real: Tab desde
// una fecha (sus segmentos no mueven `document.activeElement`) y `reading-flow` apagado donde un hijo
// tiene `tabindex` negativo (con él, Chrome se salta todo lo de adentro de ese hijo).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasStops, readingFlow, stepTab, tabThrough } from "../src/core/order";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
});
afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hasStops", () => {
  it("las fechas y horas tienen segmentos; un texto o un botón, no", () => {
    const input = (type: string) => Object.assign(document.createElement("input"), { type });
    for (const t of ["date", "time", "datetime-local", "month", "week"]) expect(hasStops(input(t))).toBe(true);
    for (const t of ["text", "number", "checkbox"]) expect(hasStops(input(t))).toBe(false);
    expect(hasStops(document.createElement("button"))).toBe(false);
    expect(hasStops(null)).toBe(false);
  });
});

describe("reading-flow por contenedor", () => {
  const css = `#r{display:flex;flex-direction:column} #head{order:-1}`;
  function mount(flow: string): HTMLElement {
    document.head.innerHTML = `<style>${css}</style>`;
    document.body.innerHTML = `<div id="r" style="reading-flow: ${flow}"><input id="a"><input id="b"><div id="head"><button id="x">×</button></div></div>`;
    return document.getElementById("r")!;
  }

  it("con reading-flow en el contenedor que reordena, el navegador recorre el medio solo", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const r = mount("flex-visual");
    expect(readingFlow(r)).toBe(true);
    expect(stepTab(r, document.getElementById("a"), false).native).toBe(true);
  });

  it("apagado en ese contenedor (un hijo con tabindex negativo), lo que no es vecino en el documento lo mueve el componente", () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const r = mount("normal");
    expect(readingFlow()).toBe(true);
    expect(readingFlow(r)).toBe(false);
    // De la × (al final del DOM, arriba a la vista) al primer campo: el navegador no iría ahí.
    const step = stepTab(r, document.getElementById("x"), false);
    expect(step.to?.id).toBe("a");
    expect(step.native).toBe(false);
    // De un campo al siguiente, vecinos en el documento: sí.
    expect(stepTab(r, document.getElementById("a"), false).native).toBe(true);
  });
});

describe("tabThrough: Tab desde una fecha", () => {
  function mount(): { root: HTMLElement; date: HTMLInputElement; other: HTMLElement } {
    document.body.innerHTML = `<div id="r" tabindex="-1"><input id="d" type="date"><button id="o">otro</button></div>`;
    return { root: document.getElementById("r")!, date: document.getElementById("d") as HTMLInputElement, other: document.getElementById("o")! };
  }

  it("si el foco sale de la fecha, lo lleva a su lugar en el acto y devuelve el tabindex de la raíz", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const { root, date, other } = mount();
    date.focus();
    const go = vi.fn();
    tabThrough(root, date, go);
    // Mientras dura la pulsación, la raíz recibe el foco (Mayús+Tab desde lo primero no sale de ella).
    expect(root.getAttribute("tabindex")).toBe("0");
    root.focus();
    expect(go).toHaveBeenCalledTimes(1);
    expect(root.getAttribute("tabindex")).toBe("-1");
    other.focus();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("si el foco sigue en la fecha (pasó de segmento), no hace nada", async () => {
    vi.stubGlobal("CSS", { supports: () => false });
    const { root, date } = mount();
    root.removeAttribute("tabindex");
    date.focus();
    const go = vi.fn();
    tabThrough(root, date, go);
    await new Promise((r) => setTimeout(r));
    expect(go).not.toHaveBeenCalled();
    expect(root.hasAttribute("tabindex")).toBe(false);
  });

  it("con reading-flow, durante la pulsación el navegador sigue el orden del documento", async () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const { root, date } = mount();
    date.focus();
    tabThrough(root, date, () => {});
    expect(root.style.getPropertyValue("reading-flow")).toBe("normal");
    await new Promise((r) => setTimeout(r));
    expect(root.style.getPropertyValue("reading-flow")).toBe("");
  });
});
