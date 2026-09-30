// Pinta en el servidor, como SolidStart, un JSX que usa el adaptador publicado (`dist/solid/*.jsx`),
// e imprime el HTML. Lo usa `test/solid-hydrate.test.tsx`, que después lo hidrata en el DOM.
// Uso: node test/ssr/render.mjs <archivo.jsx>
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { transformAsync } from "@babel/core";
import solid from "babel-preset-solid";
import { build } from "esbuild";

const entry = resolve(process.argv[2]);
const ssr = {
  name: "solid-ssr",
  setup(b) {
    b.onLoad({ filter: /\.jsx$/ }, async (a) => {
      const out = await transformAsync(readFileSync(a.path, "utf8"), { filename: a.path, presets: [[solid, { generate: "ssr", hydratable: true }]], babelrc: false, configFile: false });
      return { contents: out.code, loader: "js", resolveDir: dirname(a.path) };
    });
  },
};
const out = await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", conditions: ["node"], write: false, logLevel: "error", plugins: [ssr] });
const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
process.stdout.write(mod.html());
