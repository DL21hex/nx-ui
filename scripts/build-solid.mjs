// El adaptador de Solid se publica como JSX preservado (condición de export "solid"): lo compila
// el vite-plugin-solid de la app, en modo SSR o navegador. Sus imports internos apuntan al
// módulo ya construido del componente, no a src/.
import { build } from "esbuild";

const toDist = {
  name: "nx-ui-dist",
  setup(b) {
    // Cada componente (y `nxSync`) sale del módulo ya construido: una sola copia de las clases, del
    // registro de íconos y de la cola de nx-sync aunque la app importe también `nx-ui`.
    b.onResolve({ filter: /components\/([\w-]+)\/(index|logic)$/ }, (a) => ({ path: `../${/components\/([\w-]+)\//.exec(a.path)[1]}.js`, external: true }));
  },
};

await build({
  entryPoints: ["src/solid/index.tsx"],
  outfile: "dist/solid/index.jsx",
  bundle: true,
  format: "esm",
  jsx: "preserve",
  target: "es2022",
  external: ["solid-js", "solid-js/*"],
  plugins: [toDist],
  logLevel: "warning",
});
console.log("solid → dist/solid/index.jsx");
