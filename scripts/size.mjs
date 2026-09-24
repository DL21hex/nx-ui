// Tamaños (minificado + gzip) y presupuesto. Falla si algo se pasa.
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

// Cada pieza tiene su límite: el JS de cada componente (con el núcleo que arrastra), su CSS y
// los tokens. Los paquetes agregados (todo el CSS, el IIFE) solo se informan: crecen con cada
// componente nuevo sin que ninguno haya engordado, así que un tope fijo ahí no mide nada.
const BUDGET = [
  // [archivo, límite gzip en bytes (null = solo se informa), descripción]
  ["dist/sidemenu.js", 6 * 1024, "sidemenu + núcleo (ESM)"],
  ["dist/button.js", 4.5 * 1024, "button + núcleo (ESM)"],
  ["dist/select.js", 6 * 1024, "select + núcleo (ESM)"],
  ["dist/ai.js", 6 * 1024, "ai-answer + núcleo (ESM)"],
  ["dist/bdui.js", 1024, "adaptador BDUI"],
  ["dist/tokens.css", 1024, "tokens"],
  ["dist/sidemenu.css", 3 * 1024, "sidemenu (CSS)"],
  ["dist/button.css", 2 * 1024, "button (CSS)"],
  ["dist/select.css", 2 * 1024, "select (CSS)"],
  ["dist/ai.css", 2.5 * 1024, "ai-answer (CSS)"],
  ["dist/nx-ui.css", null, "todo el CSS (informativo)"],
  ["dist/nx-ui.iife.js", null, "todo-en-uno + íconos (informativo)"],
];

let failed = false;
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
console.log("\narchivo                 min+gzip    límite     ");
for (const [file, limit, desc] of BUDGET) {
  if (!existsSync(file)) {
    console.log(`${file.padEnd(24)}FALTA`);
    failed = true;
    continue;
  }
  let code = readFileSync(file, "utf8");
  // El ESM se publica sin minificar y repartido en chunks compartidos: se mide la entrada con
  // todo lo que importa, minificada, que es lo que termina en el bundle de la app.
  if (file.endsWith(".js")) {
    const out = await build({ entryPoints: [file], bundle: true, minify: true, format: "esm", target: "es2022", write: false });
    code = out.outputFiles[0].text;
  }
  const size = gzipSync(code, { level: 9 }).length;
  const ok = limit === null || size <= limit;
  failed ||= !ok;
  const mark = limit === null ? "·" : ok ? "✓" : "✗ SE PASA";
  console.log(`${file.padEnd(24)}${kb(size).padEnd(12)}${(limit === null ? "—" : kb(limit)).padEnd(11)}${mark}  ${desc}`);
}
if (failed) process.exit(1);
