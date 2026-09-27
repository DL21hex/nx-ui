/**
 * `<nx-award>`: tipos. Todo es JSON (BDUI): proveedores, artículos, cotizaciones, criterios y la
 * recomendación, que llega como eventos (del `endpoint`, en streaming, o en la prop `advice`).
 * El componente no puntúa ni decide: la recomendación es del backend y la elección, del comprador.
 */

export interface AwardSupplier {
  id: string;
  /** «Ferrex». */
  name: string;
  /** Una línea corta bajo el nombre: «★ 4,6 · 5 días». */
  detail?: string;
  /** Lo que el comprador debe saber antes de adjudicarle: «Póliza de cumplimiento vencida». */
  alert?: string;
}

export interface AwardItem {
  id: string;
  /** «Tubo PVC ½" x 6 m». */
  name: string;
  /** Cantidad pedida. */
  qty: number;
  /** «und», «m», «bulto». */
  unit?: string;
  /** Código del artículo (va en el detalle). */
  code?: string;
  /** Categoría: los artículos se agrupan por ella, en el orden en que aparecen. */
  group?: string;
}

/** Lo que cotizó un proveedor por un artículo. */
export interface AwardQuote {
  item: string;
  supplier: string;
  /** Precio unitario comparable, en la moneda del componente: ya normalizado por unidad o
   *  empaque, moneda e impuestos. Es el número que se compara. */
  price: number;
  /** Días de entrega de esta cotización. */
  leadTime?: number;
  /** Lo que cotizó de verdad, antes de normalizar: «US$ 4,20 la caja x12 · TRM 4.150». */
  original?: string;
  /** Una nota del proveedor: «Marca Pavco», «Entrega parcial: 200 de 240». */
  note?: string;
}

/** Un criterio de la recomendación. `weight` es relativo (se reparte sobre la suma). */
export interface AwardCriterion {
  id: string;
  /** «Precio». */
  label: string;
  weight: number;
}

/** Un proveedor en el ranking de un artículo: `score` (0–100) y lo que sacó en cada criterio (0–100). */
export interface AwardRank {
  supplier: string;
  score: number;
  scores?: Record<string, number>;
}

/** La recomendación para un artículo. `supplier: null` si no hay a quién recomendar. */
export interface AwardRecommendation {
  item: string;
  supplier: string | null;
  /** Una frase: «El más barato con entrega en 3 días». */
  reason?: string;
  /** Mejor primero. */
  ranking: AwardRank[];
}

export type AwardTone = "neutral" | "warning" | "danger";

/** Algo que merece que el comprador mire la fila. Con `supplier`, se marca también su celda. */
export interface AwardFlag {
  item: string;
  supplier?: string;
  /** «48 % bajo la mediana: ¿precio de otra unidad?». */
  message: string;
  tone: AwardTone;
}

/** Una alternativa completa a «lo mejor por artículo»: `picks` cambia la sugerencia de esos artículos. */
export interface AwardScenario {
  id: string;
  /** «Máximo 3 proveedores». */
  label: string;
  detail?: string;
  picks: Record<string, string>;
}

export interface AwardNote {
  message: string;
  tone: AwardTone;
}

/** Una línea del stream de la recomendación (o un elemento de `advice` / `respond(events)`). */
export type AwardEvent =
  | ({ type: "recommend" } & AwardRecommendation)
  | ({ type: "flag" } & AwardFlag)
  | ({ type: "scenario" } & AwardScenario)
  | ({ type: "note" } & AwardNote)
  | { type: "error"; message: string }
  | { type: "done" };

/** Una elección explícita del comprador (la que se aparta de la sugerencia lleva su motivo). */
export interface AwardChoice {
  item: string;
  supplier: string;
  reason?: string;
}

/** Lo que muestran las celdas: precio unitario, total de la línea, plazo o puntaje. */
export type AwardLens = "price" | "total" | "lead" | "score";

/** Qué filas se ven. */
export type AwardFilter = "all" | "alerts" | "changed";

/** `{artículo: proveedor}` de lo adjudicado. */
export type AwardValue = Record<string, string>;

/** Detalle de `nx-award-advise`: sin `endpoint`, la app recomienda con estos pesos y exclusiones
 *  y responde con los eventos del protocolo (ya, o después de `preventDefault()`). */
export interface AwardAdviseDetail {
  weights: Record<string, number>;
  excluded: string[];
  respond(events: unknown[]): void;
}

/** Detalle de `nx-award-change`: cambió la elección de un artículo (`item: null` si fueron varios). */
export interface AwardChangeDetail {
  item: string | null;
  supplier: string | null;
  /** Lo que sugiere la IA para ese artículo. */
  recommended: string | null;
  reason?: string;
  value: AwardValue;
}

export interface AwardOrderLine {
  item: string;
  qty: number;
  price: number;
  total: number;
}

/** Una orden de compra: todo lo adjudicado a un proveedor. */
export interface AwardOrder {
  supplier: string;
  lines: AwardOrderLine[];
  total: number;
}

/** Un artículo donde el comprador se apartó de la sugerencia. */
export interface AwardChange {
  item: string;
  supplier: string;
  recommended: string;
  reason?: string;
  /** Lo que cuesta de más (o de menos, negativo) frente a la sugerencia. */
  delta: number;
}

/** Detalle de `nx-award-submit`: las órdenes agrupadas por proveedor y la trazabilidad. */
export interface AwardSubmitDetail {
  orders: AwardOrder[];
  changes: AwardChange[];
  value: AwardValue;
  total: number;
  /** Artículos sin adjudicar (nadie cotizó, o no se eligió). */
  unassigned: string[];
  /** El escenario aplicado (`""`, lo mejor por artículo). */
  scenario: string;
  weights: Record<string, number>;
  excluded: string[];
  /** Alertas sin abrir. */
  pending: number;
}

export interface AwardLabels {
  /** Nombre de la tabla sin `heading`. */
  table: string;
  /** Primera columna. */
  item: string;
  /** Pie de la tabla. */
  awarded: string;
  total: string;
  vsAi: string;
  /** Sin cambios frente a la sugerencia. */
  same: string;
  /** «1 cambio» / «{n} cambios». */
  changeOne: string;
  changeMany: string;
  orders: string;
  /** «1 proveedor» / «{n} proveedores». */
  supplierOne: string;
  supplierMany: string;
  pending: string;
  /** Bajo el número de alertas por revisar: «de {total} alertas». */
  pendingOf: string;
  /** Todas las alertas abiertas. */
  reviewed: string;
  /** Sin alertas. */
  noAlerts: string;
  next: string;
  /** «{n} sin adjudicar». */
  unassigned: string;
  lens: string;
  lensPrice: string;
  lensTotal: string;
  lensLead: string;
  lensScore: string;
  /** Filtro de filas. */
  show: string;
  filterAll: string;
  filterAlerts: string;
  filterChanged: string;
  scenario: string;
  /** El escenario base. */
  best: string;
  criteria: string;
  reset: string;
  /** Lo que se lee después de una celda sugerida. */
  suggested: string;
  noQuote: string;
  nobody: string;
  /** Marca de la fila que se apartó de la sugerencia. */
  changed: string;
  /** «Elegir a {name}». */
  pick: string;
  /** «Elegiste {supplier}: {delta} frente a la sugerencia.». */
  youChose: string;
  /** Sin sugerencia: «Elegiste {supplier}.». */
  youChoseFree: string;
  reason: string;
  undo: string;
  excluded: string;
  exclude: string;
  include: string;
  giveAll: string;
  /** «{n} artículos pasaron a {supplier}.». */
  gaveAll: string;
  /** El motivo que llevan esos artículos: «Consolidar en {supplier}». */
  bulkReason: string;
  /** Deshacer lo último en bloque. */
  revert: string;
  /** «{quoted} cotizados · {awarded} adjudicados · {total}». */
  supplierStats: string;
  close: string;
  submit: string;
  /** «Generar órdenes» mientras llega una recomendación. */
  busy: string;
  needReview: string;
  /** «Falta el motivo del cambio en {name}.». */
  needReason: string;
  advising: string;
  error: string;
  retry: string;
  /** «{n} d». */
  days: string;
  /** «{n} pts». */
  points: string;
  /** Antes del precio original: «Cotizó». */
  quoted: string;
  /** «{n} art.». */
  count: string;
}
