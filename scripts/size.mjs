// Tamaños (minificado + gzip) y presupuesto de referencia.
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
  ["dist/button.js", 5.75 * 1024, "button + núcleo (ESM)"],
  ["dist/select.js", 6.5 * 1024, "select + núcleo (ESM)"],
  ["dist/ai.js", 7.5 * 1024, "ai-answer + núcleo (ESM)"],
  ["dist/capture.js", 11.75 * 1024, "doc-capture + button + núcleo (ESM)"],
  ["dist/grid.js", 21 * 1024, "grid + núcleo (ESM; con columnas, anchos, vistas, búsqueda, toques y atajos)"],
  [lazy("xlsx"), 3 * 1024, "generador de XLSX (se carga al exportar)"],
  // El panel importa el chunk de la tabla (ya cargado en la página): se mide todo lo que baja con él.
  [lazy("grid-filter"), 26.5 * 1024, "nx-grid con su filtro por columna (se trae al acercarse a la cabecera)"],
  // Este no importa el chunk de la tabla: se mide solo lo que baja al abrir «Vistas» o «Columnas».
  [lazy("grid-views"), 3.5 * 1024, "menú de vistas y selector de columnas de nx-grid (al tocarlos, o en reposo con views-storage)"],
  ["dist/dialog.js", 5.5 * 1024, "dialog + núcleo (ESM)"],
  [lazy("dialog-head"), 2.5 * 1024, "cabecera de ficha de nx-dialog: avatar, estado, anterior/siguiente y «Más» (solo si los usa)"],
  ["dist/confirm.js", 10.25 * 1024, "confirm + dialog + button + núcleo (ESM)"],
  ["dist/toast.js", 2.75 * 1024, "toast + núcleo (ESM)"],
  ["dist/agent.js", 19.5 * 1024, "agent + ai + button + bdui + tour + núcleo (ESM)"],
  ["dist/command.js", 7.5 * 1024, "command + núcleo (ESM)"],
  ["dist/explain.js", 8.25 * 1024, "explain + núcleo (ESM)"],
  ["dist/inbox.js", 10.75 * 1024, "inbox + toast + núcleo (ESM)"],
  ["dist/survey.js", 12.75 * 1024, "survey + núcleo (ESM)"],
  ["dist/tour.js", 2.5 * 1024, "nxTour (ESM)"],
  ["dist/number.js", 9 * 1024, "number + núcleo (ESM)"],
  ["dist/kanban.js", 11 * 1024, "kanban + toast + núcleo (ESM; nxConfirm con import())"],
  ["dist/history.js", 11.5 * 1024, "history + toast + núcleo (ESM)"],
  ["dist/date-range.js", 11.5 * 1024, "date-range + núcleo (ESM)"],
  ["dist/paste-fill.js", 18.75 * 1024, "paste-fill + extractor + núcleo (ESM)"],
  ["dist/presence.js", 7.75 * 1024, "presence + núcleo (ESM)"],
  ["dist/what-if.js", 11.25 * 1024, "what-if + núcleo (ESM)"],
  ["dist/trend.js", 10.75 * 1024, "trend + núcleo (ESM; nx-ai-answer se carga aparte)"],
  ["dist/scan.js", 12.5 * 1024, "scan + núcleo (ESM; el toast se carga aparte)"],
  ["dist/sync.js", 13.25 * 1024, "sync + núcleo (ESM)"],
  ["dist/keytips.js", 4.25 * 1024, "keytips + núcleo (ESM)"],
  ["dist/import.js", 17 * 1024, "import + núcleo (ESM; el lector de .xlsx se carga aparte)"],
  [lazy("read-xlsx"), 2.5 * 1024, "lector de .xlsx de nx-import (se carga al llegar un libro)"],
  ["dist/guard.js", 9.25 * 1024, "guard + núcleo (ESM)"],
  ["dist/handoff.js", 9.25 * 1024, "handoff + QR + núcleo (ESM; el lado celular y nx-scan con import())"],
  // El chunk del celular importa el de escritorio (ya cargado en esa página): se mide todo lo que baja el celular.
  [lazy("handoff-phone"), 13 * 1024, "página del celular de nx-handoff: handoff + su chunk (se carga con side=\"phone\")"],
  ["dist/award.js", 15.5 * 1024, "award + núcleo (ESM)"],
  ["dist/account.js", 9.75 * 1024, "account + núcleo (ESM; panel, bloqueo, ver como y nxSync con import())"],
  // Igual que el del celular de handoff: el chunk del panel importa el de la cuenta; se mide todo lo que baja la página.
  [lazy("account-panel"), 13 * 1024, "nx-account con su panel: cuenta + panel (el panel se trae en reposo o al apuntar a la tarjeta)"],
  [lazy("lock"), 3.75 * 1024, "pantalla de bloqueo de nx-account (se carga al bloquear)"],
  [lazy("view-as"), 1.75 * 1024, "franja «Ver como» de nx-account (se carga al suplantar)"],
  ["dist/launcher.js", 8.25 * 1024, "launcher + núcleo (ESM)"],
  ["dist/cards.js", 10.75 * 1024, "cards + núcleo (ESM)"],
  ["dist/print.js", 8.25 * 1024, "print + núcleo (ESM)"],
  ["dist/badge.js", 1 * 1024, "badge + núcleo (ESM)"],
  ["dist/notice.js", 1.75 * 1024, "notice + núcleo (ESM)"],
  ["dist/fields.js", 5.25 * 1024, "fields + núcleo (ESM; lectura, resumen y edición en la misma rejilla)"],
  ["dist/tabs.js", 2.75 * 1024, "tabs + núcleo (ESM)"],
  ["dist/breadcrumb.js", 4.5 * 1024, "breadcrumb + núcleo (ESM; colapso y «‹ Padre»)"],
  // Importa el chunk del componente (ya cargado en la página): la cifra lo incluye; el menú solo son ~2,1 KB.
  [lazy("breadcrumb-menu"), 5.75 * 1024, "nx-breadcrumb con su menú de hermanos y niveles ocultos (al abrir el primero)"],
  ["dist/org.js", 13 * 1024, "org + núcleo (ESM; «Yo» y el árbol de unidades, con ramas, caras, View Transitions y la búsqueda)"],
  ["dist/signature.js", 7.25 * 1024, "signature + núcleo (ESM; PNG, ubicación y el celular con import())"],
  [lazy("signature-extras"), 0.75 * 1024, "extras de nx-signature: PNG, ubicación y <nx-handoff> (se cargan al usarlos)"],
  ["dist/planner.js", 14.5 * 1024, "planner + núcleo (ESM; el aviso con import())"],
  ["dist/review.js", 10.75 * 1024, "review + núcleo (ESM)"],
  ["dist/voice.js", 6.25 * 1024, "voice + núcleo (ESM; el dictado en un campo y el servidor con import())"],
  [lazy("voice-text"), 2 * 1024, "dictado en un campo de nx-voice: puntuación, órdenes, cursor (se carga al dictar en un campo)"],
  [lazy("voice-server"), 2 * 1024, "grabación y transcripción con servidor de nx-voice (se carga con engine=\"server\")"],
  ["dist/thread.js", 12.5 * 1024, "thread + núcleo (ESM; sugerencias, stream, anclas y nxToast con import())"],
  // Estos dos importan el chunk del hilo (ya cargado en la página): se mide todo lo que baja la página con ellos.
  [lazy("thread-pick"), 13.75 * 1024, "nx-thread con sus sugerencias @/# y la tarjeta de registros (al primer foco en la caja)"],
  [lazy("thread-live"), 13.75 * 1024, "nx-thread con su stream y «escribiendo…» (solo con stream)"],
  [lazy("thread-anchors"), 1.5 * 1024, "campos anclables y globitos de nx-thread (solo si la página los tiene)"],
  ["dist/checklist.js", 12.25 * 1024, "checklist + núcleo (ESM; campos, resumen, firma, celular y aviso con import())"],
  // Como el celular de handoff: estos chunks importan el de la entrada; se mide todo lo que baja la página.
  [lazy("checklist-fields"), 13.75 * 1024, "nx-checklist con sus campos de evidencia (se piden en reposo)"],
  [lazy("checklist-summary"), 13.25 * 1024, "nx-checklist mode=\"summary\" (se carga en ese modo)"],
  ["dist/recurrence.js", 9.5 * 1024, "recurrence + núcleo (ESM; el intérprete y los controles con import())"],
  // El chunk importa el de recurrence (ya cargado en la página): se mide todo lo que baja la página al escribir.
  [lazy("recurrence-edit"), 15.75 * 1024, "nx-recurrence con su intérprete de frases y controles (se carga al acercarse al campo)"],
  ["dist/jobs.js", 9.25 * 1024, "jobs + núcleo (ESM; el panel y nxToast con import())"],
  // El chunk del panel importa el de jobs (ya cargado en la página): se mide todo lo que baja la página.
  [lazy("jobs-panel"), 11.25 * 1024, "nx-jobs con su panel (se trae al apuntar a la píldora o al abrirla)"],
  ["dist/bdui.js", 2.5 * 1024, "adaptador BDUI (el registro crece con cada componente)"],
  ["dist/solid/index.jsx", 0.75 * 1024, "adaptador Solid, índice (solo reexporta los de cada componente)"],
  ["dist/solid/grid.jsx", 1 * 1024, "adaptador Solid de grid (JSX; importa el componente de dist/, no lo copia)"],
  ["dist/tokens.css", 1.2 * 1024, "tokens"],
  ["dist/palettes.css", 1024, "paletas (opcional)"],
  ["dist/sidemenu.css", 3 * 1024, "sidemenu (CSS)"],
  ["dist/button.css", 2 * 1024, "button (CSS)"],
  ["dist/select.css", 2 * 1024, "select (CSS)"],
  ["dist/ai.css", 2.5 * 1024, "ai-answer (CSS)"],
  ["dist/capture.css", 3 * 1024, "doc-capture (CSS)"],
  ["dist/grid.css", 5.25 * 1024, "grid (CSS; con el filtro por columna, las vistas, lo táctil, el botón ocupado, los atajos y la barra de arriba)"],
  ["dist/dialog.css", 2.5 * 1024, "dialog (CSS)"],
  ["dist/confirm.css", 1 * 1024, "confirm (CSS, además de dialog y button)"],
  ["dist/toast.css", 1.5 * 1024, "toast (CSS)"],
  ["dist/agent.css", 2.5 * 1024, "agent (CSS, además de ai y button)"],
  ["dist/command.css", 2 * 1024, "command (CSS)"],
  ["dist/explain.css", 2 * 1024, "explain (CSS)"],
  ["dist/inbox.css", 2.5 * 1024, "inbox (CSS)"],
  ["dist/survey.css", 4.5 * 1024, "survey (CSS)"],
  ["dist/tour.css", 1.2 * 1024, "tour (CSS)"],
  ["dist/number.css", 1.5 * 1024, "number (CSS)"],
  ["dist/kanban.css", 3 * 1024, "kanban (CSS)"],
  ["dist/history.css", 3.25 * 1024, "history (CSS)"],
  ["dist/date-range.css", 2.5 * 1024, "date-range (CSS)"],
  ["dist/paste-fill.css", 3 * 1024, "paste-fill (CSS)"],
  ["dist/presence.css", 2.25 * 1024, "presence (CSS)"],
  ["dist/what-if.css", 3 * 1024, "what-if (CSS)"],
  ["dist/trend.css", 3 * 1024, "trend (CSS)"],
  ["dist/scan.css", 3.5 * 1024, "scan (CSS)"],
  ["dist/sync.css", 3 * 1024, "sync (CSS)"],
  ["dist/keytips.css", 0.75 * 1024, "keytips (CSS)"],
  ["dist/import.css", 2 * 1024, "import (CSS)"],
  ["dist/guard.css", 1 * 1024, "guard (CSS)"],
  ["dist/handoff.css", 1.75 * 1024, "handoff (CSS)"],
  ["dist/award.css", 3.25 * 1024, "award (CSS)"],
  ["dist/account.css", 4.25 * 1024, "account (CSS)"],
  ["dist/launcher.css", 2.75 * 1024, "launcher (CSS)"],
  ["dist/cards.css", 3.5 * 1024, "cards (CSS)"],
  ["dist/print.css", 1.75 * 1024, "print (CSS)"],
  ["dist/badge.css", 0.5 * 1024, "badge (CSS)"],
  ["dist/notice.css", 1 * 1024, "notice (CSS)"],
  ["dist/fields.css", 1.75 * 1024, "fields (CSS)"],
  ["dist/tabs.css", 1 * 1024, "tabs (CSS)"],
  ["dist/breadcrumb.css", 1.5 * 1024, "breadcrumb (CSS)"],
  ["dist/org.css", 4 * 1024, "org (CSS)"],
  ["dist/signature.css", 1.25 * 1024, "signature (CSS)"],
  ["dist/planner.css", 3 * 1024, "planner (CSS)"],
  ["dist/review.css", 1.75 * 1024, "review (CSS)"],
  ["dist/voice.css", 1.5 * 1024, "voice (CSS)"],
  ["dist/thread.css", 2.25 * 1024, "thread (CSS)"],
  ["dist/checklist.css", 3 * 1024, "checklist (CSS)"],
  ["dist/recurrence.css", 1.5 * 1024, "recurrence (CSS)"],
  ["dist/jobs.css", 2.25 * 1024, "jobs (CSS)"],
  ["dist/nx32-elements.css", null, "todo el CSS (informativo)"],
  ["dist/nx32-elements.iife.js", null, "todo-en-uno + íconos (informativo)"],
];

// Por ahora los topes no hacen fallar el build: primero funcional, después ligero (decisión del
// 2026-10-03). Lo que pasa su referencia se marca con ⚠; `NX_SIZE_STRICT=1` los vuelve a exigir.
// Un archivo que falta sí falla siempre: es un error de build, no de peso.
const strict = process.env.NX_SIZE_STRICT === "1";
let failed = false;
let over = 0;
const kb = (n) => `${(n / 1024).toFixed(2)} KB`;
console.log("\narchivo                     min+gzip    límite     ");
for (const [file, limit, desc] of BUDGET) {
  if (!existsSync(file)) {
    console.log(`${file.padEnd(28)}FALTA`);
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
  if (!ok) over++;
  failed ||= strict && !ok;
  const mark = limit === null ? "·" : ok ? "✓" : strict ? "✗ SE PASA" : "⚠ pasa la referencia";
  console.log(`${file.padEnd(28)}${kb(size).padEnd(12)}${(limit === null ? "—" : kb(limit)).padEnd(11)}${mark}  ${desc}`);
}
if (over && !strict) console.log(`\n⚠ ${over} pieza(s) pasan su referencia de peso (solo se informa; NX_SIZE_STRICT=1 para exigirla).`);
if (failed) process.exit(1);
