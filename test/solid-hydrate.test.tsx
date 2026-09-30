// El camino de nx32 (SolidStart): la página se pinta en el servidor con el adaptador publicado
// (`dist/solid/grid.jsx`), el JS del cliente define `<nx-grid>` (que se arma solo sobre el HTML del
// servidor) y después Solid hidrata. La tabla y los hijos del autor tienen que sobrevivir a las
// dos cosas, y a que los hijos cambien después.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hydrate } from "solid-js/web";

const hasDist = existsSync("dist/solid/grid.jsx") && existsSync("dist/grid.js");

afterEach(() => vi.restoreAllMocks());

describe.skipIf(!hasDist)("SSR + hidratación", () => {
  it("grid: se arma sobre el HTML del servidor, hidrata sin duplicar y aguanta que cambien los hijos", async () => {
    const html = execFileSync("node", ["test/ssr/render.mjs", "test/ssr/grid.jsx"], { encoding: "utf8" });
    expect(html).toContain("<nx-grid");
    expect(html).toContain("<template></template></nx-grid>");
    document.body.innerHTML = `<div id="app">${html}</div>`;
    // Lo que deja el <script> de `generateHydrationScript()` en la página del servidor.
    (globalThis as { _$HY?: unknown })._$HY = { events: [], completed: new WeakSet(), r: {}, fe() {} };
    const grid = document.querySelector("nx-grid")!;
    const err = vi.spyOn(console, "error");
    const warn = vi.spyOn(console, "warn");
    // El módulo del cliente: define <nx-grid>, que se arma en el acto sobre el HTML del servidor.
    const { Page, setBulk } = await import("./ssr/page.jsx");
    expect(grid.querySelector(".nx-grid__scroll")).not.toBeNull();
    const own = () => [...grid.children].filter((x) => !x.classList.contains("autor") && x.localName !== "template");
    const built = own();
    hydrate(() => <Page />, document.getElementById("app")!);
    expect(err).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    // Las props llegan al hidratar: filas y locale.
    expect(grid.querySelectorAll(".nx-grid__row").length).toBe(2);
    expect(grid.querySelectorAll(".autor").length).toBe(1);
    expect(own()).toEqual(built);
    setBulk(false);
    expect(grid.querySelector(".autor")).toBeNull();
    expect(own()).toEqual(built);
    setBulk(true);
    expect(grid.querySelectorAll(".autor").length).toBe(1);
    expect(own()).toEqual(built);
    // La acción en lote aparece con una fila marcada.
    grid.selected = ["1"];
    expect(grid.hasAttribute("data-selection")).toBe(true);
  });
});
