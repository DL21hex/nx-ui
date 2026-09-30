// @vitest-environment happy-dom
//
// Sobre el paquete CONSTRUIDO (`npm run build` antes; si no hay dist/, se omite). Cubre lo que
// las pruebas de src/ no ven: que el bundler no descarte el registro de los elementos por
// considerarlo "sin efectos" (`sideEffects` del package.json).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const hasDist = existsSync("dist/nx32-elements.iife.js");

describe.skipIf(!hasDist)("dist/", () => {
  it("el IIFE registra <nx-sidemenu> y expone Nx32Elements", () => {
    (0, eval)(readFileSync("dist/nx32-elements.iife.js", "utf8"));
    expect(customElements.get("nx-sidemenu")).toBeTypeOf("function");
    expect((globalThis as unknown as { Nx32Elements: { render: unknown } }).Nx32Elements.render).toBeTypeOf("function");
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

  const solid = () => readdirSync("dist/solid").filter((f) => f.endsWith(".jsx"));

  it("el adaptador Solid importa los componentes de dist/ y no trae su propia copia", () => {
    expect(readFileSync("dist/solid/index.jsx", "utf8")).toContain('from "../sync.js"');
    for (const f of solid()) expect(readFileSync(`dist/solid/${f}`, "utf8"), f).not.toMatch(/customElements\.define|extends Base/);
  });

  it("cada componente de Solid trae solo el suyo: nx32-elements/solid/grid no arrastra la librería", () => {
    for (const f of solid().filter((f) => f !== "index.jsx")) {
      const imports = [...readFileSync(`dist/solid/${f}`, "utf8").matchAll(/(?:from |import )"(\.\.?\/[\w-]+\.jsx?)"/g)].map((m) => m[1]);
      expect(imports, f).toEqual([`../${f.replace(".jsx", ".js")}`]);
    }
    const index = readFileSync("dist/solid/index.jsx", "utf8");
    expect(index).toContain('export * from "./grid.jsx"');
    expect(index).not.toMatch(/splitProps/);
  });

  it("cada nombre que el adaptador Solid importa de dist/ existe en ese módulo", async () => {
    const jsx = solid().map((f) => readFileSync(`dist/solid/${f}`, "utf8")).join("\n");
    for (const [, names, file] of jsx.matchAll(/import\s*\{([^}]+)\}\s*from\s*"\.\.\/([\w-]+\.js)"/g)) {
      const src = readFileSync(`dist/${file}`, "utf8");
      for (const n of names.split(",").map((x) => x.trim().split(/\s+as\s+/)[0])) {
        expect(src, `${n} en dist/${file}`).toMatch(new RegExp(`export\\s*\\{[^}]*\\b${n}\\b`));
      }
    }
  });
});
