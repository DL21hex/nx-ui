// Importar la librería donde no hay DOM (el bundle de SSR de SolidStart) no puede lanzar.
import { describe, expect, it } from "vitest";

describe("SSR", () => {
  // Importa en frío la librería entera (vitest transforma cada módulo la primera vez): sola tarda ~2 s
  // y, con todas las suites en paralelo, pasaba de los 5 s por defecto. Lo que se prueba es que no
  // lance, no cuánto tarda.
  it("el entry importa sin DOM", async () => {
    expect(typeof globalThis.HTMLElement).toBe("undefined");
    const mod = await import("../src/index");
    expect(typeof mod.NxSidemenu).toBe("function");
    expect(typeof mod.registerIcons).toBe("function");
  }, 30_000);

  it("el adaptador BDUI importa sin DOM", async () => {
    const mod = await import("../src/bdui");
    expect(typeof mod.render).toBe("function");
  });
});
