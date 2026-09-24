// Importar la librería donde no hay DOM (el bundle de SSR de SolidStart) no puede lanzar.
import { describe, expect, it } from "vitest";

describe("SSR", () => {
  it("el entry importa sin DOM", async () => {
    expect(typeof globalThis.HTMLElement).toBe("undefined");
    const mod = await import("../src/index");
    expect(typeof mod.NxSidemenu).toBe("function");
    expect(typeof mod.registerIcons).toBe("function");
  });

  it("el adaptador BDUI importa sin DOM", async () => {
    const mod = await import("../src/bdui");
    expect(typeof mod.render).toBe("function");
  });
});
