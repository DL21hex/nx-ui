/**
 * Galería: `<nx-scan>`. La recepción de la OC-2291 de Aceros del Caribe en la bodega de Itagüí, en
 * modo conteo: seis productos esperados que describe `/demo/scan/producto?code=` (en el navegador,
 * con `addDemoRoute`), uno del catálogo que no venía en la orden (sobra) y una etiqueta sin
 * registrar. Cada producto trae su código EAN-13 dibujado, para escanearlo con el teléfono desde
 * la pantalla, y un botón para «simular una lectura» a quien no tenga cámara.
 */
import type { NxScan, ScanItem, ScanProduct } from "../src/components/scan/index";
import "../src/components/scan/index";
import { addDemoRoute } from "./demo-api";

export const SCAN_OC = { id: "OC-2291", supplier: "Aceros del Caribe S.A.S.", warehouse: "Bodega Itagüí", date: "25 sep 2026" };

/** Lo que el ERP sabe de cada código: la línea de la orden (con `expected`) o un producto del catálogo. */
export const SCAN_PRODUCTS: ScanProduct[] = [
  { code: "7707123450011", name: "Lámina HR 3 mm 4×8", unit: "und", expected: 40 },
  { code: "7707123450028", name: 'Tubo estructural 2" × 6 m', unit: "und", expected: 24 },
  { code: "7707123450035", name: 'Ángulo 1½" × ⅛" × 6 m', unit: "und", expected: 30 },
  { code: "7707123450042", name: 'Soldadura E6013 ⅛" · caja 20 kg', unit: "caja", expected: 12 },
  { code: "7707123450059", name: 'Tornillo hexagonal ½" × 2" G5 · caja ×100', unit: "caja", expected: 8 },
  { code: "7707123450066", name: "Anticorrosivo gris · galón", unit: "gal", expected: 15 },
];
/** Del catálogo, pero no venía en la OC: todo lo que llegue sobra. */
export const SCAN_EXTRA: ScanProduct = { code: "7707123450073", name: 'Disco de corte 7"', unit: "und", expected: 0 };
/** Una etiqueta que el ERP no conoce: la API responde 404. */
export const SCAN_UNKNOWN = "LOTE-AC-0873";

const CATALOG = new Map([...SCAN_PRODUCTS, SCAN_EXTRA].map((p) => [p.code, p]));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let routed = false;
function route(): void {
  if (routed) return;
  routed = true;
  // GET /demo/scan/producto?code=… → {code, name, unit, expected} o 404, con la pausa de una API real.
  addDemoRoute("/demo/scan/producto", async (req, out) => {
    const code = req.url.searchParams.get("code") ?? "";
    await sleep(220 + Math.random() * 380);
    if (out.closed()) return;
    out.type("application/json");
    const p = CATALOG.get(code);
    if (!p) {
      out.status(404);
      return out.end(JSON.stringify({ error: "No existe" }));
    }
    out.end(JSON.stringify(p));
  });
}

// ---------------------------------------------------------------- EAN-13 en SVG

const L_CODES = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G_CODES = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R_CODES = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Los 95 módulos de un EAN-13 (1 = barra). */
export function ean13Bits(code: string): string {
  const d = [...code].map(Number);
  const left = d
    .slice(1, 7)
    .map((n, i) => (PARITY[d[0]][i] === "L" ? L_CODES : G_CODES)[n])
    .join("");
  const right = d
    .slice(7)
    .map((n) => R_CODES[n])
    .join("");
  return `101${left}01010${right}101`;
}

/** El código de barras dibujado (negro sobre blanco, con margen: se escanea desde la pantalla). */
function barcodeSvg(code: string): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const bits = ean13Bits(code);
  const q = 9;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${bits.length + q * 2} 62`);
  svg.setAttribute("class", "scan-code");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Código de barras ${code}`);
  const bg = document.createElementNS(NS, "rect");
  Object.entries({ width: String(bits.length + q * 2), height: "62", fill: "#fff" }).forEach(([k, v]) => bg.setAttribute(k, v));
  svg.append(bg);
  let path = "";
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    // Las guardas (inicio, centro y fin) bajan un poco más, como en el empaque.
    const guard = i < 3 || (i >= 45 && i < 50) || i >= 92;
    path += `M${q + i + 0.5} 4v${guard ? 50 : 44}`;
  }
  const bars = document.createElementNS(NS, "path");
  bars.setAttribute("d", path);
  bars.setAttribute("stroke", "#000");
  svg.append(bars);
  const text = document.createElementNS(NS, "text");
  Object.entries({ x: String((bits.length + q * 2) / 2), y: "60", "text-anchor": "middle", "font-size": "8", "font-family": "ui-monospace, monospace", fill: "#000", "letter-spacing": "1.5" }).forEach(([k, v]) => text.setAttribute(k, v));
  text.textContent = code;
  svg.append(text);
  return svg;
}

// ---------------------------------------------------------------- la página

export function mountScanDemo(root: HTMLElement): void {
  route();
  const count = root.querySelector<NxScan>("#scan-count")!;
  const single = root.querySelector<NxScan>("#scan-single")!;
  const log = root.querySelector<HTMLOListElement>("#scan-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  const summary = (items: ScanItem[]) => items.map((i) => `${i.code.slice(-4)}×${i.qty}`).join(", ") || "vacío";
  for (const el of [count, single]) {
    el.addEventListener("nx-scan", (e) => add(`nx-scan → #${el.id} ${JSON.stringify(e.detail)}`));
    el.addEventListener("nx-scan-error", (e) => add(`nx-scan-error → #${el.id} ${e.detail.problem}`));
  }
  count.addEventListener("nx-scan-count", (e) => add(`nx-scan-count → ${e.detail.items.length} líneas: ${summary(e.detail.items)}`));

  // Los productos de la orden, con su código dibujado y el botón para simular la lectura.
  const list = root.querySelector<HTMLUListElement>("#scan-sim")!;
  const item = (code: string, name: string, meta: string, withBars: boolean) => {
    const li = document.createElement("li");
    li.className = "scan-sim__item";
    const info = document.createElement("div");
    info.className = "scan-sim__info";
    const strong = document.createElement("strong");
    strong.textContent = name;
    const span = document.createElement("span");
    span.textContent = meta;
    info.append(strong, span);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dlg-plain scan-sim__btn";
    btn.textContent = "Simular lectura";
    btn.setAttribute("aria-label", `Simular la lectura de ${name}`);
    btn.addEventListener("click", () => count.add(code));
    li.append(...(withBars ? [barcodeSvg(code)] : []), info, btn);
    list.append(li);
  };
  for (const p of SCAN_PRODUCTS) item(p.code, p.name, `${p.code} · esperadas ${p.expected} ${p.unit}`, true);
  item(SCAN_EXTRA.code, 'Disco de corte 7"', `${SCAN_EXTRA.code} · no venía en la OC`, true);
  item(SCAN_UNKNOWN, "Etiqueta de lote", `${SCAN_UNKNOWN} · Code 128, sin registrar`, false);

  // La pistola lectora de mentira: teclea el código en ráfaga (8 ms por tecla) y un Enter, sobre lo
  // que tenga el foco, como una de verdad. La pistola es del último escáner que se tocó: aquí, el de
  // la recepción (el de abajo también se ve).
  root.querySelector("#scan-wedge")!.addEventListener("click", () => {
    const p = SCAN_PRODUCTS[Math.floor(Math.random() * SCAN_PRODUCTS.length)];
    count.dispatchEvent(new Event("pointerdown"));
    const t0 = performance.now();
    [...p.code, "Enter"].forEach((key, i) => {
      const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      Object.defineProperty(e, "timeStamp", { value: t0 + i * 8 });
      document.activeElement?.dispatchEvent(e);
    });
  });
  root.querySelector("#scan-reset")!.addEventListener("click", () => count.clear());
}
