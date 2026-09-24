// CSS de la librería: resuelve los @import, baja el anidamiento para Safari 17.0 y minifica.
import { build } from "esbuild";

const target = ["chrome114", "firefox125", "safari17"];
const entries = {
  "nx-ui": "src/styles/nx-ui.css",
  tokens: "src/styles/tokens.css",
  sidemenu: "src/components/sidemenu/sidemenu.css",
  button: "src/components/button/button.css",
  select: "src/components/select/select.css",
  ai: "src/components/ai/ai-answer.css",
};

await build({
  entryPoints: entries,
  outdir: "dist",
  bundle: true,
  minify: true,
  target,
  logLevel: "warning",
});
console.log("css →", Object.keys(entries).map((k) => `dist/${k}.css`).join(", "));
