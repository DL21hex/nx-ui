// @vitest-environment happy-dom
// Los ayudantes que antes repetía cada componente (`reduced()`, `#emit`, `#attr`).
import { afterEach, describe, expect, it, vi } from "vitest";
import { emit, reducedMotion, safeHref, setAttr } from "../src/core/dom";

afterEach(() => vi.unstubAllGlobals());

describe("ayudantes del núcleo", () => {
  it("reducedMotion: lo que diga matchMedia, y false sin matchMedia (SSR)", () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce") }));
    expect(reducedMotion()).toBe(true);
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(reducedMotion()).toBe(false);
    vi.stubGlobal("matchMedia", undefined);
    expect(reducedMotion()).toBe(false);
  });

  it("emit: burbujea, cruza sombras y devuelve false si se canceló (solo si es cancelable)", () => {
    const parent = document.createElement("div");
    const el = parent.appendChild(document.createElement("span"));
    const seen: CustomEvent[] = [];
    parent.addEventListener("nx-x-y", (e) => {
      seen.push(e as CustomEvent);
      e.preventDefault();
    });
    expect(emit(el, "nx-x-y", { a: 1 })).toBe(true);
    expect(emit(el, "nx-x-y", { a: 2 }, true)).toBe(false);
    expect(seen.map((e) => [e.detail.a, e.bubbles, e.composed, e.cancelable])).toEqual([
      [1, true, true, false],
      [2, true, true, true],
    ]);
  });

  it("setAttr: null, undefined y \"\" quitan el atributo; lo demás va como texto", () => {
    const el = document.createElement("div");
    setAttr(el, "a", 3);
    expect(el.getAttribute("a")).toBe("3");
    setAttr(el, "a", "");
    expect(el.hasAttribute("a")).toBe(false);
    setAttr(el, "a", "x");
    setAttr(el, "a", null);
    expect(el.hasAttribute("a")).toBe(false);
    setAttr(el, "a", false);
    expect(el.getAttribute("a")).toBe("false");
  });

  it("safeHref: solo rutas relativas y http(s), mailto o tel", () => {
    expect(safeHref("java\tscript:alert(1)")).toBeUndefined();
    expect(safeHref(" /ruta ")).toBe("/ruta");
    expect(safeHref("mailto:a@b.co")).toBe("mailto:a@b.co");
  });
});
