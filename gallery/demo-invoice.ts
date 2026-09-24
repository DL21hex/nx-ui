/**
 * Una factura ficticia para la demo de `<nx-doc-capture>`. De la MISMA descripción salen la
 * imagen (SVG) y los recuadros de evidencia, así lo que se ilumina coincide con lo que se ve.
 * La usa el servidor de desarrollo (vite.config.ts); no es parte de la librería.
 */
const W = 800;
const H = 1030;

type Txt = { text: string; x: number; y: number; size?: number; bold?: boolean; end?: boolean; gray?: boolean; blur?: boolean; key?: string };

const ITEMS = [
  ["Lámina HR 3 mm", "40", "185.000", "7.400.000"],
  ["Perfil C 100×50", "25", "58.000", "1.450.000"],
  ["Transporte a planta", "1", "250.000", "250.000"],
];

const TEXTS: Txt[] = [
  { text: "ACEROS DEL CARIBE S.A.S.", x: 48, y: 82, size: 22, bold: true, key: "prov" },
  { text: "NIT", x: 48, y: 110, size: 13, gray: true },
  { text: "900.123.456-7", x: 80, y: 110, size: 13, key: "nit" },
  { text: "Cra 45 # 12-30 · Barranquilla · (605) 385 2200", x: 48, y: 130, size: 11.5, gray: true },
  { text: "FACTURA ELECTRÓNICA DE VENTA", x: 752, y: 82, size: 14, bold: true, end: true },
  { text: "No.", x: 590, y: 108, size: 12.5, gray: true },
  { text: "FE-10482", x: 752, y: 108, size: 12.5, end: true, key: "num" },
  { text: "Fecha:", x: 590, y: 128, size: 12.5, gray: true },
  { text: "12/09/2026", x: 752, y: 128, size: 12.5, end: true, key: "fecha" },
  { text: "Vence:", x: 590, y: 148, size: 12.5, gray: true },
  { text: "12/1O/2026", x: 752, y: 148, size: 12.5, end: true, blur: true, key: "vence" },
  { text: "Cliente: Industrias NX S.A. · NIT 800.555.111-2", x: 48, y: 200, size: 12 },
  { text: "Su orden de compra:", x: 48, y: 220, size: 12, gray: true },
  { text: "OC-2291", x: 172, y: 220, size: 12, key: "oc" },
  { text: "Descripción", x: 48, y: 264, size: 11.5, gray: true },
  { text: "Cant.", x: 470, y: 264, size: 11.5, gray: true, end: true },
  { text: "V. unitario", x: 610, y: 264, size: 11.5, gray: true, end: true },
  { text: "Total", x: 752, y: 264, size: 11.5, gray: true, end: true },
  ...ITEMS.flatMap(([desc, cant, unit, total], i) => {
    const y = 300 + i * 28;
    return [
      { text: desc, x: 48, y, size: 12.5, key: `items.${i}.desc` },
      { text: cant, x: 470, y, size: 12.5, end: true, key: `items.${i}.cantidad` },
      { text: unit, x: 610, y, size: 12.5, end: true, key: `items.${i}.unitario` },
      { text: total, x: 752, y, size: 12.5, end: true, key: `items.${i}.total` },
    ];
  }),
  { text: "Subtotal", x: 590, y: 412, size: 12.5, gray: true },
  { text: "9.100.000", x: 752, y: 412, size: 12.5, end: true, key: "subtotal" },
  { text: "IVA 19 %", x: 590, y: 434, size: 12.5, gray: true },
  { text: "1.729.000", x: 752, y: 434, size: 12.5, end: true, key: "iva" },
  { text: "Total a pagar", x: 590, y: 464, size: 14, bold: true },
  { text: "10.829.000", x: 752, y: 464, size: 14, bold: true, end: true, key: "total" },
  { text: "Resolución DIAN 18764003345121 · Numeración FE-1 a FE-50000", x: 48, y: 986, size: 9.5, gray: true },
  { text: "CUFE 3f9a6c1e0b27d48e95c0a7f3d2b18e64c5a9f07e1d3b26c8a4f5e9d0c7b1a2e3", x: 48, y: 1004, size: 9.5, gray: true },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** La factura como SVG (la «imagen de la página» que mandaría un backend). */
export function invoiceSvg(): string {
  const lines = [170, 274, 370].map((y) => `<line x1="48" x2="752" y1="${y}" y2="${y}" stroke="#e5e7eb"/>`).join("");
  const texts = TEXTS.map(
    (t) =>
      `<text x="${t.x}" y="${t.y}" font-size="${t.size ?? 12}" ${t.bold ? 'font-weight="700"' : ""} ${t.end ? 'text-anchor="end"' : ""} fill="${t.gray ? "#6b7280" : "#1f2328"}" ${t.blur ? 'filter="url(#b)" opacity=".8"' : ""}>${esc(t.text)}</text>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="Arial, Helvetica, sans-serif"><defs><filter id="b"><feGaussianBlur stdDeviation=".9"/></filter></defs><rect width="100%" height="100%" fill="#fff"/>${lines}${texts}</svg>`;
}

/** El recuadro (0–1) de un texto: ancho estimado por caracteres, con un margen. */
function boxOf(t: Txt) {
  const size = t.size ?? 12;
  const w = t.text.length * size * (t.bold ? 0.62 : 0.56) + 8;
  const x = (t.end ? t.x - w + 4 : t.x - 4) / W;
  const y = (t.y - size * 0.95) / H;
  return { page: 1, x, y, w: w / W, h: (size * 1.35) / H };
}

const CONF: Record<string, number> = { prov: 0.99, nit: 0.99, num: 0.97, fecha: 0.96, vence: 0.61, oc: 0.93, subtotal: 0.98, iva: 0.98, total: 0.99 };
const EXTRA: Record<string, object> = {
  prov: { detail: "En el sistema · proveedor #412" },
  nit: { detail: "Dígito de verificación correcto" },
  vence: { hint: "Poco legible: ¿una «O» en lugar de «0»?", suggest: "12/10/2026" },
  oc: { detail: "Vinculada · emitida el 28 ago" },
};

/** Lo que «lee» el backend, en orden, como eventos del protocolo. */
export function invoiceEvents(): object[] {
  const events: object[] = [{ type: "page", n: 1, src: "/demo/capture/factura.svg", width: W, height: H }];
  for (const t of TEXTS) {
    if (!t.key) continue;
    const conf = CONF[t.key] ?? (t.key.endsWith(".desc") ? 0.94 : 0.96);
    events.push({ type: "field", key: t.key, value: t.text, confidence: conf, box: boxOf(t), ...EXTRA[t.key] });
  }
  events.push(
    { type: "check", id: "suma", status: "ok", message: "Los ítems suman el subtotal (9.100.000)", fields: ["subtotal", "items.0.total", "items.1.total", "items.2.total"] },
    { type: "check", id: "iva", status: "ok", message: "El IVA es el 19 % del subtotal", fields: ["iva", "subtotal"] },
    { type: "check", id: "total", status: "ok", message: "El total cuadra: 9.100.000 + 1.729.000", fields: ["total", "subtotal", "iva"] },
    { type: "check", id: "precio", status: "warn", message: "Lámina HR 3 mm a 185.000; en la OC-2291 se pactó a 179.500 (+3,1 %)", fields: ["items.0.unitario", "oc"] },
  );
  return events;
}
