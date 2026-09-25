// Tamaños (minificado + gzip) y presupuesto. Falla si algo se pasa.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

// Cada pieza tiene su límite: el JS de cada componente (con el núcleo que arrastra), su CSS y
// los tokens. Los paquetes agregados (todo el CSS, el IIFE) solo se informan: crecen con cada
// componente nuevo sin que ninguno haya engordado, así que un tope fijo ahí no mide nada.
// Los chunks que un componente carga con `import()` (p. ej. el XLSX del grid) no cuentan en su
// entrada: se miden aparte, con su propio límite.
const lazy = (name) => `dist/${readdirSync("dist").find((f) => f.startsWith(`${name}-`) && f.endsWith(".js")) ?? `${name}.js`}`;
const dynamicExternal = {
  name: "dynamic-external",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => (a.kind === "dynamic-import" ? { path: a.path, external: true } : undefined));
  },
};

const BUDGET = [
  // [archivo, límite gzip en bytes (null = solo se informa), descripción]
  ["dist/sidemenu.js", 6 * 1024, "sidemenu + núcleo (ESM)"],
  ["dist/button.js", 5 * 1024, "button + núcleo (ESM)"],
  ["dist/select.js", 6 * 1024, "select + núcleo (ESM)"],
  ["dist/ai.js", 6 * 1024, "ai-answer + núcleo (ESM)"],
  ["dist/capture.js", 10 * 1024, "doc-capture + button + núcleo (ESM)"],
  ["dist/grid.js", 19 * 1024, "grid + núcleo (ESM)"],
  [lazy("xlsx"), 3 * 1024, "generador de XLSX (se carga al exportar)"],
  ["dist/dialog.js", 5.5 * 1024, "dialog + núcleo (ESM)"],
  ["dist/confirm.js", 10 * 1024, "confirm + dialog + button + núcleo (ESM)"],
  ["dist/toast.js", 2.5 * 1024, "toast + núcleo (ESM)"],
  ["dist/agent.js", 17 * 1024, "agent + ai + button + bdui + tour + núcleo (ESM)"],
  ["dist/command.js", 7 * 1024, "command + núcleo (ESM)"],
  ["dist/explain.js", 7 * 1024, "explain + núcleo (ESM)"],
  ["dist/inbox.js", 9 * 1024, "inbox + toast + núcleo (ESM)"],
  ["dist/survey.js", 14 * 1024, "survey (4 diseños) + núcleo (ESM)"],
  ["dist/tour.js", 2.5 * 1024, "nxTour (ESM)"],
  ["dist/number.js", 9 * 1024, "number + núcleo (ESM)"],
  ["dist/kanban.js", 11 * 1024, "kanban + toast + núcleo (ESM; nxConfirm con import())"],
  ["dist/history.js", 10.5 * 1024, "history + toast + núcleo (ESM)"],
  ["dist/date-range.js", 11 * 1024, "date-range + núcleo (ESM)"],
  ["dist/bdui.js", 1024, "adaptador BDUI"],
  ["dist/tokens.css", 1.2 * 1024, "tokens"],
  ["dist/palettes.css", 1024, "paletas (opcional)"],
  ["dist/sidemenu.css", 3 * 1024, "sidemenu (CSS)"],
  ["dist/button.css", 2 * 1024, "button (CSS)"],
  ["dist/select.css", 2 * 1024, "select (CSS)"],
  ["dist/ai.css", 2.5 * 1024, "ai-answer (CSS)"],
  ["dist/capture.css", 3 * 1024, "doc-capture (CSS)"],
  ["dist/grid.css", 3.5 * 1024, "grid (CSS)"],
  ["dist/dialog.css", 2.5 * 1024, "dialog (CSS)"],
  ["dist/confirm.css", 1 * 1024, "confirm (CSS, además de dialog y button)"],
  ["dist/toast.css", 1.5 * 1024, "toast (CSS)"],
  ["dist/agent.css", 2.5 * 1024, "agent (CSS, además de ai y button)"],
  ["dist/command.css", 2 * 1024, "command (CSS)"],
  ["dist/explain.css", 2 * 1024, "explain (CSS)"],
  ["dist/inbox.css", 2.5 * 1024, "inbox (CSS)"],
  ["dist/survey.css", 6 * 1024, "survey (CSS, 4 diseños)"],
  ["dist/tour.css", 1.2 * 1024, "tour (CSS)"],
  ["dist/number.css", 1.5 * 1024, "number (CSS)"],
  ["dist/kanban.css", 3 * 1024, "kanban (CSS)"],
  ["dist/history.css", 3.25 * 1024, "history (CSS)"],
  ["dist/date-range.css", 2.5 * 1024, "date-range (CSS)"],
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
    const out = await build({ entryPoints: [file], bundle: true, minify: true, format: "esm", target: "es2022", write: false, plugins: [dynamicExternal] });
    code = out.outputFiles[0].text;
  }
  const size = gzipSync(code, { level: 9 }).length;
  const ok = limit === null || size <= limit;
  failed ||= !ok;
  const mark = limit === null ? "·" : ok ? "✓" : "✗ SE PASA";
  console.log(`${file.padEnd(24)}${kb(size).padEnd(12)}${(limit === null ? "—" : kb(limit)).padEnd(11)}${mark}  ${desc}`);
}
if (failed) process.exit(1);
