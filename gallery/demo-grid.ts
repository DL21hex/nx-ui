/**
 * Datos de ejemplo para `<nx-grid>`: un tablón de necesidades de compra. Los usa la galería (modo
 * cliente) y el servidor de desarrollo (modo servidor y la «IA» de las columnas calculadas).
 * No es parte de la librería.
 */
import { applyFilters, facetColumns, facets, histogram, histogramSpec, sortRows } from "../src/components/grid/logic";
import type { GridColumn, GridFilter, GridPage, GridRow, GridSort } from "../src/components/grid/types";

export const PURCHASE_COLUMNS: GridColumn[] = [
  { key: "oc", label: "Pedido", width: 96 },
  { key: "desc", label: "Descripción", width: 220, editable: true, facet: false },
  { key: "prov", label: "Proveedor", width: 170 },
  { key: "cat", label: "Categoría", width: 130 },
  { key: "area", label: "Área", width: 130 },
  { key: "fecha", label: "Fecha", type: "date" },
  {
    key: "estado",
    label: "Estado",
    type: "status",
    editable: true,
    options: [
      { value: "borrador", label: "Borrador", tone: "neutral" },
      { value: "pendiente", label: "Pendiente", tone: "warning" },
      { value: "aprobado", label: "Aprobado", tone: "info" },
      { value: "recibido", label: "Recibido", tone: "success" },
      { value: "anulado", label: "Anulado", tone: "danger" },
    ],
  },
  { key: "monto", label: "Monto", type: "money", currency: "COP", editable: true },
  { key: "atraso", label: "Atraso (días)", type: "number", width: 110 },
];

const PROVS = ["Aceros del Caribe", "Empaques Andinos", "Químicos del Norte", "Transportes Rivera", "Ferretería Industrial", "Lubricantes Costa", "Papelería Central", "Eléctricos del Valle"];
const CATS: Record<string, [string, string[]]> = {
  "Aceros del Caribe": ["Materia prima", ["Lámina HR 3 mm", "Perfil C 100×50", "Tubo cuadrado 2\"", "Varilla corrugada 1/2\""]],
  "Empaques Andinos": ["Empaques", ["Caja corrugada 40×30", "Película stretch", "Estiba plástica", "Cinta de embalaje"]],
  "Químicos del Norte": ["Químicos", ["Soda cáustica", "Desengrasante industrial", "Pintura epóxica", "Thinner"]],
  "Transportes Rivera": ["Transporte", ["Flete Barranquilla–Bogotá", "Flete a Cartagena", "Montacargas por día"]],
  "Ferretería Industrial": ["Repuestos", ["Rodamiento 6205", "Correa en V B-52", "Tornillería surtida", "Guantes de nitrilo"]],
  "Lubricantes Costa": ["Repuestos", ["Aceite hidráulico 68", "Grasa de litio", "Filtro de aceite"]],
  "Papelería Central": ["Servicios", ["Resmas carta", "Tóner HP 26A", "Etiquetas térmicas"]],
  "Eléctricos del Valle": ["Repuestos", ["Contactor 32 A", "Cable 12 AWG", "Variador 5 HP", "Luminaria LED 100 W"]],
};
const AREAS = ["Producción", "Mantenimiento", "Logística", "Calidad", "Administración"];
const STATES = ["borrador", "pendiente", "pendiente", "aprobado", "aprobado", "recibido", "recibido", "recibido", "anulado"];

/** Pseudoaleatorio con semilla: los mismos datos en cada carga (y en el cliente y el servidor). */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

export function purchaseRows(n: number, seed = 7): GridRow[] {
  const r = rng(seed);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const rows: GridRow[] = [];
  for (let i = 0; i < n; i++) {
    const prov = PROVS[Math.floor(r() ** 1.6 * PROVS.length)];
    const [cat, items] = CATS[prov];
    const month = Math.floor(r() * 12); // oct 2025 … sep 2026
    const y = month < 3 ? 2025 : 2026;
    const m = ((month + 9) % 12) + 1;
    const d = 1 + Math.floor(r() * 28);
    const estado = pick(STATES);
    const scale = cat === "Materia prima" ? 3e6 : cat === "Transporte" ? 8e5 : 3e5;
    const monto = Math.round((scale * Math.exp(r() * 3)) / 1000) * 1000;
    const late = estado === "pendiente" || estado === "aprobado" ? (r() < 0.35 ? 1 + Math.floor(r() * (prov === "Aceros del Caribe" ? 18 : 8)) : 0) : 0;
    const item = pick(items);
    rows.push({
      id: String(2201 + i),
      oc: `OC-${2201 + i}`,
      desc: cat === "Transporte" || cat === "Servicios" ? item : `${item} ×${1 + Math.floor(r() * 60)}`,
      prov,
      cat,
      area: pick(AREAS),
      fecha: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      estado,
      monto,
      atraso: late,
    });
  }
  return rows;
}

// ---------------------------------------------------------------- «IA» de las columnas calculadas

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** Una respuesta verosímil según el prompt (la galería no llama a ningún modelo). */
export function aiCell(prompt: string, row: GridRow): { value: string; tone?: Tone } {
  const p = prompt.toLowerCase();
  const monto = Number(row.monto) || 0;
  const atraso = Number(row.atraso) || 0;
  if (/riesgo|retras|cumpl/.test(p)) {
    const score = atraso * 2 + (row.prov === "Aceros del Caribe" ? 6 : 0) + (monto > 10e6 ? 5 : monto > 3e6 ? 2 : 0);
    return score >= 12 ? { value: "Alto", tone: "danger" } : score >= 5 ? { value: "Medio", tone: "warning" } : { value: "Bajo", tone: "success" };
  }
  if (/urgen|priori/.test(p)) {
    const urgent = row.area === "Producción" && (row.estado === "pendiente" || row.estado === "borrador");
    return urgent ? { value: "Urgente", tone: "danger" } : row.area === "Mantenimiento" ? { value: "Alta", tone: "warning" } : { value: "Normal", tone: "neutral" };
  }
  if (/recurrent|repet|frecuen/.test(p)) {
    const rec = /Resmas|Tóner|Guantes|Película|Cinta|Flete|Aceite/.test(String(row.desc));
    return rec ? { value: "Recurrente", tone: "info" } : { value: "Puntual" };
  }
  if (/ahorro|negoci|descuento/.test(p)) {
    const pct = monto > 10e6 ? 8 : monto > 3e6 ? 5 : 2;
    return { value: `${pct} % si se consolida con el pedido del mes`, tone: pct >= 5 ? "success" : undefined };
  }
  // Por defecto: un resumen de una línea.
  const qty = /×(\d+)/.exec(String(row.desc))?.[1];
  return { value: `${String(row.desc).replace(/ ×\d+/, "")}${qty ? ` (${qty} und.)` : ""} para ${row.area}${atraso ? `, ${atraso} días tarde` : ""}` };
}

// ---------------------------------------------------------------- modo servidor

let serverRows: GridRow[] | null = null;
let specs: Map<string, ReturnType<typeof histogramSpec>> | null = null;

/** Lo que haría un backend: filtra, ordena, pagina y devuelve histogramas, facetas y totales. */
export function purchasePage(req: { offset?: number; limit?: number; sort?: GridSort | null; filters?: GridFilter[] }): GridPage {
  serverRows ??= purchaseRows(20000, 11);
  specs ??= new Map(PURCHASE_COLUMNS.map((c) => [c.key, histogramSpec(c, serverRows!)]));
  const filters = Array.isArray(req.filters) ? req.filters : [];
  const filtered = applyFilters(serverRows, filters);
  const sorted = sortRows(filtered, req.sort ?? null, PURCHASE_COLUMNS);
  const offset = Math.max(0, Number(req.offset) || 0);
  const limit = Math.min(20000, Math.max(1, Number(req.limit) || 100));
  const histograms: GridPage["histograms"] = {};
  for (const c of PURCHASE_COLUMNS) {
    const spec = specs.get(c.key);
    if (spec) histograms[c.key] = histogram(spec, serverRows, filtered);
  }
  const monto = filtered.reduce((a, r) => a + (Number(r.monto) || 0), 0);
  return {
    rows: sorted.slice(offset, offset + limit),
    total: filtered.length,
    histograms,
    facets: facets(facetColumns(PURCHASE_COLUMNS, serverRows).filter((c) => c.facet !== false), serverRows, filters).map(({ key, label, options }) => ({ key, label, options })),
    totals: { monto },
  };
}
