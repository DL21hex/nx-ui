// El adaptador de Solid se publica como JSX preservado (condición de export "solid"): lo compila
// el vite-plugin-solid de la app, en modo SSR o navegador. Sus imports internos apuntan al
// módulo ya construido del componente, no a src/.
//
// Un archivo por componente (`dist/solid/grid.jsx` → `nx-ui/solid/grid`): la app que usa solo la
// tabla no arrastra los demás. `index.jsx` los reexporta, sin copiarlos.
import { readdirSync } from "node:fs";
import { build } from "esbuild";

const toDist = {
  name: "nx-ui-dist",
  setup(b) {
    // Cada componente (y `nxSync`) sale del módulo ya construido: una sola copia de las clases, del
    // registro de íconos y de la cola de nx-sync aunque la app importe también `nx-ui`.
    b.onResolve({ filter: /components\/([\w-]+)\/(index|logic)$/ }, (a) => ({ path: `../${/components\/([\w-]+)\//.exec(a.path)[1]}.js`, external: true }));
    // Entre archivos del adaptador (el índice): el `.jsx` hermano ya publicado. `./jsx` son solo
    // tipos y se funde como un módulo vacío.
    b.onResolve({ filter: /^\.\/[\w-]+$/ }, (a) => (a.path === "./jsx" ? undefined : { path: `${a.path}.jsx`, external: true }));
  },
};

const entries = readdirSync("src/solid").filter((f) => f.endsWith(".tsx"));
await build({
  entryPoints: entries.map((f) => `src/solid/${f}`),
  outdir: "dist/solid",
  outExtension: { ".js": ".jsx" },
  bundle: true,
  format: "esm",
  jsx: "preserve",
  target: "es2022",
  external: ["solid-js", "solid-js/*"],
  plugins: [toDist],
  logLevel: "warning",
});
console.log(`solid → dist/solid/ (${entries.length} archivos)`);
