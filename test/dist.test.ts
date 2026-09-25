// @vitest-environment happy-dom
//
// Sobre el paquete CONSTRUIDO (`npm run build` antes; si no hay dist/, se omite). Cubre lo que
// las pruebas de src/ no ven: que el bundler no descarte el registro de los elementos por
// considerarlo "sin efectos" (`sideEffects` del package.json).
import { existsSync, readFileSync } from "node:fs";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const hasDist = existsSync("dist/nx-ui.iife.js");

describe.skipIf(!hasDist)("dist/", () => {
  it("el IIFE registra <nx-sidemenu> y expone NxUI", () => {
    (0, eval)(readFileSync("dist/nx-ui.iife.js", "utf8"));
    expect(customElements.get("nx-sidemenu")).toBeTypeOf("function");
    expect((globalThis as unknown as { NxUI: { render: unknown } }).NxUI.render).toBeTypeOf("function");
  });

  it("una app que solo importa registerIcons conserva el registro del elemento", async () => {
    const out = await build({
      stdin: { contents: 'import { registerIcons } from "./dist/index.js"; registerIcons({});', resolveDir: process.cwd() },
      bundle: true,
      minify: true,
      format: "esm",
      write: false,
    });
    expect(out.outputFiles[0].text).toContain("customElements.define");
  });

  it("el adaptador Solid importa los componentes de dist/ y no trae su propia copia", () => {
    const jsx = readFileSync("dist/solid/index.jsx", "utf8");
    expect(jsx).toContain('from "../sync.js"');
    expect(jsx).not.toMatch(/customElements\.define|extends Base/);
  });
});
