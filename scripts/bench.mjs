// Rendimiento de la lógica de los componentes, con datos grandes y siempre los mismos.
// `npm run bench` imprime la mediana de varias corridas de cada operación. Sirve para comparar
// antes y después de un cambio en la misma máquina; los números no son un límite.
//
// Mide la lógica pura (filtrar, ordenar, buscar), que es lo que crece con los datos. El pintado
// está acotado por diseño: la tabla solo pinta las filas visibles y el select, `limit` opciones.
import { build } from "esbuild";

const entry = `
import { applyFilters, crossfilter, facetColumns, facetOrder, groupRows, histogram, histogramSpec, sortRows } from "./src/components/grid/logic";
import { parseNL } from "./src/components/grid/nl";
import { searchOptions } from "./src/components/select/logic";
import { filterItems } from "./src/components/sidemenu/logic";
import { nxFormat } from "./src/core/locale";
import { PURCHASE_COLUMNS, purchaseRows } from "./gallery/demo-grid";
import { EMPLOYEE_FIELDS, EMPLOYEES } from "./gallery/demo-data";
export const lib = { applyFilters, crossfilter, facetColumns, facetOrder, groupRows, histogram, histogramSpec, sortRows, parseNL, searchOptions, filterItems, nxFormat, PURCHASE_COLUMNS, purchaseRows, EMPLOYEE_FIELDS, EMPLOYEES };
`;
const out = await build({ stdin: { contents: entry, resolveDir: process.cwd(), loader: "ts" }, bundle: true, format: "esm", platform: "node", write: false, logLevel: "error" });
const { lib } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

const RUNS = 7;
function measure(fn) {
  fn(); // calentamiento
  const t = [];
  for (let i = 0; i < RUNS; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  return t.sort((x, y) => x - y)[RUNS >> 1];
}

const rows = [];
function bench(component, name, fn) {
  rows.push([component, name, measure(fn)]);
}

// ---------------------------------------------------------------- <nx-grid>
const C = lib.PURCHASE_COLUMNS;
const f = lib.nxFormat("es-CO");
for (const n of [10_000, 100_000]) {
  const data = lib.purchaseRows(n, 3);
  const k = `${n / 1000}k`;
  const facetCols = lib.facetColumns(C, data).filter((c) => c.facet !== false);
  const order = lib.facetOrder(facetCols, data);
  const one = [{ key: "estado", op: "in", values: ["pendiente"] }];
  const three = [...one, { key: "monto", op: "range", min: 5e6 }, { key: "prov", op: "in", values: ["Aceros del Caribe"] }];
  bench("grid", `filtro + facetas, 1 condición (${k})`, () => lib.crossfilter(data, one, facetCols, order));
  bench("grid", `filtro + facetas, 3 condiciones (${k})`, () => lib.crossfilter(data, three, facetCols, order));
  const specs = C.map((c) => lib.histogramSpec(c, data, f)).filter(Boolean);
  const filtered = lib.applyFilters(data, one);
  bench("grid", `histogramas de ${specs.length} columnas (${k})`, () => specs.forEach((s) => lib.histogram(s, data, filtered)));
  bench("grid", `ordenar número (${k})`, () => lib.sortRows(data, { key: "monto", dir: -1 }, C, f));
  bench("grid", `ordenar texto con repetidos (${k})`, () => lib.sortRows(data, { key: "desc", dir: 1 }, C, f));
  bench("grid", `ordenar texto único (${k})`, () => lib.sortRows(data, { key: "oc", dir: 1 }, C, f));
  bench("grid", `agrupar (${k})`, () => lib.groupRows(data, C[2], C, f));
  bench("grid", `frase en lenguaje natural (${k})`, () => lib.parseNL("pendientes de aceros de marzo de más de 5 millones", C, data));
}

// ---------------------------------------------------------------- <nx-select>
const many = Array.from({ length: 10_000 }, (_, i) => ({ ...lib.EMPLOYEES[i % lib.EMPLOYEES.length], value: String(i) }));
bench("select", "buscar «gonzalez» en 3 campos (10k)", () => lib.searchOptions(many, lib.EMPLOYEE_FIELDS, "gonzalez"));
bench("select", "buscar una cédula parcial (10k)", () => lib.searchOptions(many, lib.EMPLOYEE_FIELDS, "1023"));

// ---------------------------------------------------------------- <nx-sidemenu>
const children = Array.from({ length: 2_000 }, (_, i) => ({ id: String(i), label: `Opción de menú número ${i} · Portería`, href: `/x/${i}` }));
bench("sidemenu", "filtrar hijos del flotante (2k)", () => lib.filterItems(children, "porteria 19"));

console.log(`\ncomponente  operación${" ".repeat(38)}mediana`);
for (const [c, name, ms] of rows) console.log(`${c.padEnd(12)}${name.padEnd(47)}${ms.toFixed(1).padStart(7)} ms`);
