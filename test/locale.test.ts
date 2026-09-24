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

  it("nxFormat se cachea por locale", () => {
    expect(nxFormat("en-US")).toBe(nxFormat("en-US"));
    expect(nxFormat().locale).toBe("es-CO");
  });
});
