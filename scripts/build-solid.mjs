// El adaptador de Solid se publica como JSX preservado (condición de export "solid"): lo compila
// el vite-plugin-solid de la app, en modo SSR o navegador. Sus imports internos apuntan al
// módulo ya construido del componente, no a src/.
import { build } from "esbuild";

const toDist = {
  name: "nx-ui-dist",
  setup(b) {
    b.onResolve({ filter: /components\/sidemenu\/index$/ }, () => ({ path: "../sidemenu.js", external: true }));
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
