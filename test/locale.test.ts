// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { formatElapsed } from "../src/core/format";
import { nxFormat, resolveLocale } from "../src/core/locale";
import type { NxButton } from "../src/index";

describe("locale de la librería", () => {
  it("resolveLocale: atributo `locale`, luego el `lang` más cercano, luego es-CO", () => {
    document.body.innerHTML = `<div lang="en-US"><span id="a"></span><span id="b" locale="pt-BR"></span></div><span id="c"></span>`;
    document.documentElement.removeAttribute("lang");
    expect(resolveLocale(document.getElementById("a")!)).toBe("en-US");
    expect(resolveLocale(document.getElementById("b")!)).toBe("pt-BR");
    expect(resolveLocale(document.getElementById("c")!)).toBe("es-CO");
  });

  it("formatElapsed con el separador del locale", () => {
    expect(formatElapsed(800)).toBe("0,8 s");
    expect(formatElapsed(800, "en-US")).toBe("0.8 s");
    expect(formatElapsed(125_000, "en-US")).toBe("2:05");
  });

  it("el botón muestra el tiempo con el locale de la página", async () => {
    document.body.innerHTML = `<div lang="en-US"><nx-button label="Go"></nx-button></div>`;
    const b = document.querySelector<NxButton>("nx-button")!;
    await import("../src/index");
    b.busy = true;
    b.done(true);
    expect(b.querySelector('[role="status"]')!.textContent).toMatch(/· \d\.\d s$/);
  });

  it("parse en inglés: la coma solo es de miles si agrupa de verdad", () => {
    const en = nxFormat("en-US");
    expect(en.parse("1,234")).toBe(1234);
    expect(en.parse("1,234,567.5")).toBe(1234567.5);
    expect(en.parse("12,34,567.5")).toBe(1234567.5); // agrupación de la India
    // Una sola coma que no agrupa es el decimal de quien escribe a la europea, no ×10.
    expect(en.parse("0,5")).toBe(0.5);
    expect(en.parse("1,50")).toBe(1.5);
    expect(en.parse("12,5")).toBe(12.5);
    // Comas que no agrupan con un punto, o varias sueltas: no se entiende.
    expect(en.parse("1,5.3")).toBeNull();
    expect(en.parse("1,2,3")).toBeNull();
    expect(nxFormat("es-CO").parse("1.234,5")).toBe(1234.5);
  });

  it("nxFormat se cachea por locale", () => {
    expect(nxFormat("en-US")).toBe(nxFormat("en-US"));
    expect(nxFormat().locale).toBe("es-CO");
  });
});
