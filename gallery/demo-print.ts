/**
 * Demo de `<nx-print>`: una factura electrónica de venta de Metalmecánica Los Andes S.A.S. (60 líneas,
 * tres hojas carta, IVA, retenciones y el total en letras) y una remisión en media carta horizontal.
 * Los selectores cambian tamaño, orientación y márgenes de la factura y «Agregar 20 líneas» escribe
 * en la tabla original: la vista previa se vuelve a paginar sola.
 *
 * Todo el marcado sale de constantes de la demo (nada viene de un usuario), por eso va como HTML.
 */
import "../src/components/print/index";
import type { NxPrint } from "../src/components/print/index";
import { numberToWords } from "../src/components/number/logic";
import { nxFormat } from "../src/core/locale";
import { formatNit, nitCheckDigit } from "../src/core/nit";

const fmt = nxFormat("es-CO");
const cop = (n: number) => fmt.money(n, { currency: "COP" });
const nit = (base: string) => formatNit(base, nitCheckDigit(base));

type Item = [code: string, desc: string, unit: string, price: number];
const CATALOG: Item[] = [
  ["LAM-HR3", "Lámina HR 3 mm × 4 × 8 pies", "UND", 412_000],
  ["LAM-CR18", "Lámina CR cal. 18 × 4 × 8 pies", "UND", 198_500],
  ["PER-C100", "Perfil C 100 × 50 × 2 mm × 6 m", "UND", 96_400],
  ["TUB-2214", "Tubo estructural 2 × 2\" cal. 14 × 6 m", "UND", 118_900],
  ["ANG-1518", "Ángulo 1½ × ⅛\" × 6 m", "UND", 64_300],
  ["PLA-214", "Platina 2 × ¼\" × 6 m", "UND", 71_800],
  ["VAR-12", "Varilla corrugada ½\" × 6 m", "UND", 32_600],
  ["SOL-6013", "Soldadura E6013 ⅛\" (caja de 20 kg)", "CAJA", 389_000],
  ["DIS-7", "Disco de corte 7\" × 1,6 mm", "UND", 8_900],
  ["PIN-AC", "Anticorrosivo gris mate", "GAL", 76_500],
  ["TOR-12", "Tornillo hexagonal ½ × 2\" grado 5", "CIENTO", 142_000],
  ["SRV-LAS", "Corte láser en lámina hasta 6 mm", "M", 12_400],
  ["SRV-DOB", "Doblez en prensa CNC", "GOLPE", 2_300],
  ["SRV-GAL", "Galvanizado en caliente", "KG", 5_600],
  ["IPE-200", "Viga IPE 200 × 6 m", "UND", 1_285_000],
  ["MAL-EL", "Malla electrosoldada 15 × 15 cm, 5 mm", "UND", 187_400],
];

/** Una línea de la factura, siempre la misma para el mismo número. */
function line(i: number) {
  const [code, desc, unit, price] = CATALOG[(i * 7) % CATALOG.length];
  const qty = unit === "M" || unit === "GOLPE" || unit === "KG" ? 40 + ((i * 53) % 260) : 1 + ((i * 37) % 23);
  return { code, desc, unit, price, qty, total: qty * price };
}
const itemRow = (i: number) => {
  const l = line(i);
  return `<tr><td class="n">${i + 1}</td><td class="code">${l.code}</td><td>${l.desc}</td><td class="n">${fmt.number(l.qty)}</td><td>${l.unit}</td><td class="n">${cop(l.price)}</td><td class="n" data-value="${l.total}">${cop(l.total)}</td></tr>`;
};

function totalsHtml(n: number): string {
  let sub = 0;
  for (let i = 0; i < n; i++) sub += line(i).total;
  const iva = Math.round(sub * 0.19);
  const total = sub + iva;
  const rete = Math.round(sub * 0.025);
  const reteIva = Math.round(iva * 0.15);
  const reteIca = Math.round((sub * 7) / 1000);
  const neto = total - rete - reteIva - reteIca;
  const row = (k: string, v: number, cls = "") => `<tr class="${cls}"><th scope="row">${k}</th><td>${cop(v)}</td></tr>`;
  return `<div class="fv-words"><span class="fv-label">Valor en letras</span><p>${numberToWords(neto, { currency: "COP" }).toUpperCase()}</p>
      <span class="fv-label">Forma de pago</span><p>Crédito a 30 días · Transferencia a la cuenta corriente Bancolombia 245-000118-37</p></div>
    <table class="fv-sum"><tbody>
      ${row("Subtotal", sub)}${row("IVA 19 %", iva)}${row("Total factura", total, "strong")}
      ${row("Retención en la fuente 2,5 %", -rete)}${row("ReteIVA 15 %", -reteIva)}${row("ReteICA 7 ‰", -reteIca)}
      ${row("Neto a pagar", neto, "strong")}
    </tbody></table>`;
}

const EMISOR = nit("901284417");
const CLIENTE = nit("900873215");

function invoiceHtml(n: number): string {
  return `
  <header slot="header" class="fv-head">
    <div class="fv-brand"><span class="fv-logo" aria-hidden="true">MLA</span><div>
      <strong>Metalmecánica Los Andes S.A.S.</strong>
      <span>NIT ${EMISOR} · Responsable de IVA · Actividad 2592</span>
      <span>Carrera 50 # 12 Sur-87, Itagüí, Antioquia · (604) 444 7120</span>
    </div></div>
    <div class="fv-id"><span class="fv-label">Factura electrónica de venta</span><strong>FV-2026-01873</strong>
      <span data-print-page>Página {page} de {pages}</span></div>
  </header>
  <footer slot="footer" class="fv-foot">
    <span>Autorización de numeración DIAN 18764081234567 del 15 ene 2026, prefijo FV, del 1 al 5.000, vigencia 24 meses.</span>
    <span>Página {page} de {pages}</span>
  </footer>
  <section class="fv-parties" data-print-keep>
    <div><span class="fv-label">Cliente</span><strong>Constructora Altos del Río S.A.S.</strong>
      <span>NIT ${CLIENTE} · Calle 10 # 43D-25, Medellín</span><span>Obra Torres del Parque · Orden de compra OC-2026-0418</span></div>
    <dl><dt>Fecha de emisión</dt><dd>28 sep 2026</dd><dt>Vencimiento</dt><dd>28 oct 2026</dd><dt>Vendedor</dt><dd>Paula Restrepo</dd></dl>
  </section>
  <table class="fv-items">
    <thead><tr><th class="n">#</th><th>Código</th><th>Descripción</th><th class="n">Cant.</th><th>Und.</th><th class="n">Vr. unitario</th><th class="n" data-print-sum data-currency="COP">Vr. total</th></tr></thead>
    <tbody>${Array.from({ length: n }, (_, i) => itemRow(i)).join("")}</tbody>
  </table>
  <section class="fv-totals" data-print-keep>${totalsHtml(n)}</section>
  <h3 class="fv-h" data-print-keep-with-next>Observaciones</h3>
  <p class="fv-note">Material despachado desde la planta de Itagüí. Los cortes y dobleces se hicieron según los planos TP-EST-014 rev. 3.
    Esta factura se asimila en sus efectos a la letra de cambio (art. 774 del Código de Comercio).</p>
  <section class="fv-signs" data-print-keep>
    <div><span></span>Elaboró · Paula Restrepo</div>
    <div><span></span>Recibí a satisfacción · nombre, C.C. y fecha</div>
  </section>`;
}

const REMISION: [string, string, string, number, number][] = [
  ["PER-C100", "Perfil C 100 × 50 × 2 mm × 6 m", "UND", 24, 12.6],
  ["TUB-2214", "Tubo estructural 2 × 2\" cal. 14 × 6 m", "UND", 18, 14.3],
  ["ANG-1518", "Ángulo 1½ × ⅛\" × 6 m", "UND", 30, 7.3],
  ["PLA-214", "Platina 2 × ¼\" × 6 m", "UND", 12, 15.2],
  ["LAM-HR3", "Lámina HR 3 mm × 4 × 8 pies", "UND", 8, 70.2],
  ["VAR-12", "Varilla corrugada ½\" × 6 m", "UND", 60, 5.97],
  ["MAL-EL", "Malla electrosoldada 15 × 15 cm, 5 mm", "UND", 14, 38.4],
  ["IPE-200", "Viga IPE 200 × 6 m", "UND", 4, 134.4],
  ["TOR-12", "Tornillo hexagonal ½ × 2\" grado 5", "CIENTO", 3, 11.5],
  ["SOL-6013", "Soldadura E6013 ⅛\" (caja de 20 kg)", "CAJA", 2, 20],
  ["PIN-AC", "Anticorrosivo gris mate", "GAL", 6, 4.8],
  ["DIS-7", "Disco de corte 7\" × 1,6 mm", "UND", 50, 0.12],
  ["LAM-CR18", "Lámina CR cal. 18 × 4 × 8 pies", "UND", 10, 35.1],
  ["PER-C150", "Perfil C 150 × 50 × 2,5 mm × 6 m", "UND", 16, 19.8],
];

function remisionHtml(): string {
  const rows = REMISION.map(([code, desc, unit, qty, kg], i) => `<tr><td class="n">${i + 1}</td><td class="code">${code}</td><td>${desc}</td><td class="n">${fmt.number(qty)}</td><td>${unit}</td><td class="n" data-value="${qty * kg}">${fmt.number(Math.round(qty * kg * 10) / 10)}</td></tr>`).join("");
  return `
  <header slot="header" class="fv-head fv-head--small">
    <div class="fv-brand"><span class="fv-logo" aria-hidden="true">MLA</span><div><strong>Metalmecánica Los Andes S.A.S.</strong><span>NIT ${EMISOR}</span></div></div>
    <div class="fv-id"><span class="fv-label">Remisión</span><strong>RM-2026-00412</strong><span data-print-page>Hoja {page} de {pages}</span></div>
  </header>
  <footer slot="footer" class="fv-foot"><span>Original: cliente · Copia: planta</span><span>{page}/{pages}</span></footer>
  <section class="fv-parties fv-parties--small" data-print-keep>
    <div><span class="fv-label">Entregar a</span><strong>Constructora Altos del Río S.A.S. · Obra Torres del Parque</strong><span>Carrera 43A # 1 Sur-100, Medellín · Recibe: ing. Camilo Ospina</span></div>
    <dl><dt>Despacho</dt><dd>28 sep 2026, 6:40 a. m.</dd><dt>Vehículo</dt><dd>TMK 482 · Jhon Fredy Zapata</dd></dl>
  </section>
  <table class="fv-items">
    <thead><tr><th class="n">#</th><th>Código</th><th>Descripción</th><th class="n">Cant.</th><th>Und.</th><th class="n" data-print-sum="number">Peso (kg)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <section class="fv-signs" data-print-keep><div><span></span>Despachó · Almacén planta Itagüí</div><div><span></span>Recibió · nombre, C.C., fecha y hora</div></section>`;
}

export function mountPrintDemo(root: HTMLElement): void {
  const log = root.querySelector<HTMLOListElement>("#pr-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  const fv = root.querySelector<NxPrint>("#pr-fv")!;
  const rm = root.querySelector<NxPrint>("#pr-rm")!;
  let lines = 60;
  fv.innerHTML = invoiceHtml(lines);
  rm.innerHTML = remisionHtml();

  for (const [el, name] of [[fv, "factura"], [rm, "remisión"]] as const) {
    el.addEventListener("nx-print-paginate", (e) => add(`nx-print-paginate · ${name} · ${e.detail.pages} ${e.detail.pages === 1 ? "hoja" : "hojas"}`));
    el.addEventListener("nx-print-before", () => add(`nx-print-before · ${name}`));
    el.addEventListener("nx-print-after", () => add(`nx-print-after · ${name}`));
  }

  const sel = (name: string) => root.querySelector<HTMLSelectElement>(`[data-pr="${name}"]`)!;
  sel("size").addEventListener("change", (e) => (fv.size = (e.target as HTMLSelectElement).value));
  sel("orientation").addEventListener("change", (e) => (fv.orientation = (e.target as HTMLSelectElement).value as "portrait" | "landscape"));
  sel("margin").addEventListener("change", (e) => (fv.margin = (e.target as HTMLSelectElement).value));

  root.querySelector<HTMLButtonElement>("[data-pr=add]")!.addEventListener("click", () => {
    // Se escribe en la tabla del autor, como lo haría la app: la vista previa lo nota sola.
    const body = fv.querySelector(":scope > .fv-items tbody")!;
    body.insertAdjacentHTML("beforeend", Array.from({ length: 20 }, (_, k) => itemRow(lines + k)).join(""));
    lines += 20;
    fv.querySelector(":scope > .fv-totals")!.innerHTML = totalsHtml(lines);
    add(`${lines} líneas`);
  });
}
