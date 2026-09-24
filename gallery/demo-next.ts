/**
 * Datos de ejemplo para `<nx-command>`, `<nx-explain>` y `<nx-inbox>`. Los usan la galería y el
 * servidor de desarrollo (vite.config.ts). No es parte de la librería.
 */
import { foldText } from "../src/core/text";
import type { CommandItem, ExplainEvent, InboxItem } from "../src/index";
import { EMPLOYEES } from "./demo-data";
import { purchaseRows } from "./demo-grid";

// ---------------------------------------------------------------- paleta de comandos

const ORDERS = purchaseRows(400);
const money = (n: number) => `$ ${new Intl.NumberFormat("es-CO").format(n)}`;

/** Lo que «encuentra el servidor» para la paleta: órdenes de compra y personas. */
export function commandSearch(q: string): CommandItem[] {
  const toks = foldText(q).split(/\s+/).filter(Boolean);
  const hit = (text: string) => {
    const t = foldText(text);
    return toks.every((k) => t.includes(k));
  };
  const orders = ORDERS.filter((o) => hit(`${o.oc} ${o.prov} ${o.desc}`))
    .slice(0, 5)
    .map((o): CommandItem => ({ id: `oc:${o.id}`, label: `${o.oc} · ${o.prov}`, hint: `${o.desc} · ${money(Number(o.monto))} · ${o.estado}`, href: "#/grid", group: "Órdenes de compra", icon: "receipt" }));
  const people = EMPLOYEES.filter((e) => hit(`${e.nombre} ${e.cargo} ${e.cedula}`))
    .slice(0, 5)
    .map((e): CommandItem => ({ id: `persona:${e.value}`, label: e.nombre, hint: `${e.cargo} · ${e.area}`, href: "#/th", group: "Personas", icon: "user" }));
  return [...orders, ...people];
}

// ---------------------------------------------------------------- de dónde sale la cifra

/** Los desgloses de la demo, por id. Cada uno es un guion de eventos que el servidor transmite con pausas. */
export const EXPLAIN: Record<string, ExplainEvent[]> = {
  factura: [
    { type: "value", label: "Total factura FE-10482", value: 10601500, format: "money", currency: "COP", detail: "Aceros del Caribe · 12 sep 2026" },
    { type: "term", label: "Subtotal", value: 9100000, source: "fe", explain: "/demo/explain?id=subtotal" },
    { type: "term", label: "IVA 19 %", value: 1729000, detail: "19 % de $ 9.100.000", source: "fe", explain: "/demo/explain?id=iva" },
    { type: "term", label: "Retención en la fuente 2,5 %", value: 227500, op: "-", detail: "compras · base $ 9.100.000", source: "ret" },
    { type: "compare", label: "la factura anterior", value: 9280000, better: "down" },
    { type: "source", id: "fe", title: "Factura electrónica FE-10482", detail: "CUFE 8f3a…c21 · DIAN", href: "#/capture" },
    { type: "source", id: "ret", title: "Tabla de retenciones 2026", detail: "concepto: compras generales" },
    { type: "text", delta: "La factura sube **14,2 %** frente a la anterior porque la lámina HR pasó de $ 190.000 a $ 200.000[^fe] y se agregó el transporte a Cartagena." },
    { type: "note", label: "cruzada con la OC-2291", tone: "success" },
  ],
  subtotal: [
    { type: "value", label: "Subtotal", value: 9100000, format: "money", currency: "COP" },
    { type: "term", label: "Lámina HR 3 mm × 40", value: 8000000, detail: "40 × $ 200.000", href: "#/grid" },
    { type: "term", label: "Flete a Cartagena", value: 1100000, detail: "Transportes Rivera · guía 55210" },
    { type: "note", label: "2 ítems de la OC-2291", tone: "neutral" },
  ],
  iva: [
    { type: "value", label: "IVA 19 %", value: 1729000, format: "money", currency: "COP" },
    { type: "term", label: "Base gravable", value: 9100000 },
    { type: "term", label: "Tarifa general", value: 0.19, op: "×", format: "percent" },
    { type: "text", delta: "Todo el subtotal está gravado a la **tarifa general**: ni la lámina ni el flete tienen exclusión." },
  ],
  costo: [
    { type: "value", label: "Costo de producción · agosto", value: 482300000, format: "money", currency: "COP" },
    { type: "term", label: "Materia prima", value: 301200000, source: "mayor", explain: "/demo/explain?id=materia" },
    { type: "term", label: "Mano de obra", value: 118400000, detail: "incluye 31 h extra por el paro", source: "nomina" },
    { type: "term", label: "Costos indirectos", value: 62700000, source: "mayor" },
    { type: "compare", label: "julio", value: 432900000, better: "down" },
    { type: "compare", label: "el presupuesto", value: 455000000, better: "down" },
    { type: "source", id: "mayor", title: "Libro mayor · agosto", detail: "cuentas 7105–7120", href: "#/grid" },
    { type: "source", id: "nomina", title: "Nómina de agosto", detail: "planta · 2 quincenas" },
    { type: "text", delta: "Sube **11,4 %** frente a julio. La mayor parte es la **materia prima**: el acero laminado aumentó 18 % desde el 3 de agosto[^mayor]. El resto, las horas extra que cubrieron el paro de la empacadora[^nomina]." },
    { type: "note", label: "cifras del cierre de agosto", tone: "success" },
  ],
  materia: [
    { type: "value", label: "Materia prima · agosto", value: 301200000, format: "money", currency: "COP" },
    { type: "term", label: "Acero laminado", value: 214800000, detail: "+18 % de precio desde el 3 ago" },
    { type: "term", label: "Empaques", value: 51900000 },
    { type: "term", label: "Químicos", value: 34500000 },
  ],
  margen: [
    { type: "value", label: "Margen bruto · agosto", value: 0.314, format: "percent" },
    { type: "term", label: "Utilidad bruta", value: 220700000, currency: "COP" },
    { type: "term", label: "Ventas netas", value: 702900000, currency: "COP", op: "÷" },
    { type: "compare", label: "julio", value: 0.352, better: "up" },
    { type: "text", delta: "Baja casi 4 puntos: las ventas se mantuvieron y el costo subió por el acero." },
  ],
  bancos: [
    { type: "value", label: "Saldo en bancos · hoy", value: 1284500000, format: "money", currency: "COP" },
    { type: "term", label: "Bancolombia ···4821", value: 812300000 },
    { type: "term", label: "Davivienda ···0937", value: 401900000 },
    { type: "term", label: "Banco de Bogotá ···5510", value: 64100000 },
    { type: "note", label: "extractos sincronizados a las 6:00", tone: "neutral" },
    { type: "text", delta: "Los tres extractos suman $ 6.200.000 menos que el saldo contable: hay un traslado del viernes sin conciliar." },
  ],
};

// ---------------------------------------------------------------- bandeja de aprobaciones

export const INBOX: InboxItem[] = [
  {
    id: "2291",
    title: "OC-2291 · Aceros del Caribe",
    subtitle: "Lámina HR 3 mm × 40",
    requester: "Ana María Rincón",
    amount: 10829000,
    currency: "COP",
    date: "2026-09-22",
    tags: [{ label: "Sobre presupuesto", tone: "danger" }],
    facts: [
      { label: "Centro de costo", value: "Producción · línea 2" },
      { label: "Entrega", value: "30 sep 2026" },
    ],
    impact: "/demo/inbox/impacto?id=2291",
    href: "#/grid",
  },
  { id: "2310", title: "OC-2310 · Empaques Andinos", subtitle: "Caja corrugada 40×30 × 2.000", requester: "Héctor Galeano", amount: 1450000, currency: "COP", date: "2026-09-23", impact: "/demo/inbox/impacto?id=2310", href: "#/grid" },
  { id: "2318", title: "OC-2318 · Químicos del Norte", subtitle: "Desengrasante industrial × 12", requester: "Mariana Ospina", amount: 3912000, currency: "COP", date: "2026-09-23", tags: ["Urgente"], impact: [{ label: "Presupuesto de Mantenimiento", detail: "queda en 71 %" }] },
  { id: "2322", title: "OC-2322 · Transportes Rivera", subtitle: "Flete a Cartagena", requester: "Walber Pumarejo", amount: 820000, currency: "COP", date: "2026-09-24", impact: [{ label: "Presupuesto de Logística", detail: "queda en 44 %" }] },
  { id: "2325", title: "OC-2325 · Ferretería Industrial", subtitle: "Rodamiento 6205 × 24", requester: "Héctor Galeano", amount: 648000, currency: "COP", date: "2026-09-24" },
  { id: "2327", title: "OC-2327 · Eléctricos del Valle", subtitle: "Variador 5 HP × 2", requester: "Ana María Rincón", amount: 7340000, currency: "COP", date: "2026-09-24", tags: [{ label: "Proveedor nuevo", tone: "warning" }], impact: "/demo/inbox/impacto?id=2327" },
  { id: "2330", title: "OC-2330 · Papelería Central", subtitle: "Tóner HP 26A × 6", requester: "Mariana Ospina", amount: 1290000, currency: "COP", date: "2026-09-24" },
  { id: "2331", title: "OC-2331 · Lubricantes Costa", subtitle: "Aceite hidráulico 68 × 8", requester: "Walber Pumarejo", amount: 2104000, currency: "COP", date: "2026-09-24", impact: [{ label: "Presupuesto de Mantenimiento", detail: "queda en 66 %" }] },
];

/** El impacto que transmite el servidor para algunas órdenes (una está bloqueada). */
export const INBOX_IMPACT: Record<string, object[]> = {
  "2291": [
    { type: "impact", icon: "wallet", label: "Presupuesto de Producción", detail: "queda en −4 %", tone: "danger" },
    { type: "impact", icon: "truck", label: "Recepción programada", detail: "30 sep · bodega 2" },
    { type: "note", message: "Supera el presupuesto: se notificará a la gerencia financiera." },
  ],
  "2310": [
    { type: "impact", icon: "wallet", label: "Presupuesto de Logística", detail: "queda en 38 %" },
    { type: "block", message: "Empaques Andinos tiene la cámara de comercio vencida desde el 15 sep. Hay que actualizarla antes de aprobar." },
  ],
  "2327": [
    { type: "impact", icon: "shield", label: "Proveedor nuevo", detail: "primera compra", tone: "warning" },
    { type: "impact", icon: "wallet", label: "Presupuesto de Mantenimiento", detail: "queda en 58 %" },
  ],
};
