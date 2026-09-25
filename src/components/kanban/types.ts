/**
 * `<nx-kanban>`: tipos. El tablero es JSON (BDUI): el backend manda las columnas y las tarjetas, y
 * recibe cada movimiento cuando ya no se puede deshacer (`nx-kanban-commit`).
 */

export type KanbanTone = "neutral" | "primary" | "success" | "warning" | "danger";

/** Lo que se pide antes de dejar una tarjeta en la columna (la confirmación con impacto de `nxConfirm`). */
export interface KanbanConfirm {
  /** «¿Anular {title}?»: `{title}` se reemplaza por el de la tarjeta. */
  heading: string;
  message?: string;
  /** URL del protocolo de impacto (NDJSON o SSE). Recibe `POST {card, from, to, index, data}`. */
  impact?: string;
  /** Mantener pulsado para confirmar: `true` (1 s), milisegundos, o `false` para un clic. */
  hold?: boolean | number;
  /** `danger` (por defecto) o `primary`. */
  tone?: "danger" | "primary";
  confirmLabel?: string;
}

export interface KanbanColumn {
  id: string;
  label: string;
  /** El punto de color junto al nombre. */
  tone?: KanbanTone;
  /** Límite de trabajo en curso: por encima, la columna se marca («6/5»). */
  wip?: number;
  confirm?: KanbanConfirm;
  /** Empieza plegada. */
  collapsed?: boolean;
}

export type KanbanTag = string | { label: string; tone?: KanbanTone };

export interface KanbanCard {
  id: string;
  /** El `id` de su columna. El orden dentro de la columna es el del arreglo. */
  column: string;
  title: string;
  subtitle?: string;
  tags?: KanbanTag[];
  /** Nombre de la persona responsable (se muestran sus iniciales). */
  assignee?: string;
  amount?: number;
  currency?: string;
  /** Fecha límite ISO («2026-09-30»); vencida se marca en rojo. */
  due?: string;
  href?: string;
  /** Lo que la app quiera llevar con la tarjeta (vuelve en los eventos). */
  data?: unknown;
}

/** Un movimiento: de dónde a dónde. `index` es la posición en la columna destino. */
export interface KanbanMoveDetail {
  card: KanbanCard;
  from: string;
  fromIndex: number;
  to: string;
  index: number;
  /** Cómo se movió: arrastrando, con el teclado o desde código. */
  via: "pointer" | "keyboard" | "api";
}

/** Cómo terminó un movimiento: se registró, se deshizo, o no ocurrió (cancelado, negado o sin cambio). */
export type KanbanOutcome = "commit" | "undo" | "cancel";

/** Totales de una columna: tarjetas y suma de montos por moneda. */
export interface KanbanTotals {
  count: number;
  sums: { currency?: string; amount: number }[];
}

export interface KanbanLabels {
  /** Nombre del tablero cuando no tiene `heading`. */
  board: string;
  filter: string;
  /** «{n} de {total}» */
  hits: string;
  add: string;
  empty: string;
  /** «Plegar {column}» / «Desplegar {column}» */
  collapse: string;
  expand: string;
  /** Cómo se anuncia una tarjeta («tarjeta»). */
  card: string;
  hint: string;
  /** «Tarjeta {title} levantada. Columna {column}, posición {i} de {n}.» */
  lifted: string;
  /** «Columna {column}, posición {i} de {n}.» */
  over: string;
  /** «{title} soltada en {column}, posición {i} de {n}.» */
  dropped: string;
  /** «Movimiento cancelado. {title} volvió a {column}.» */
  canceled: string;
  /** «{column} supera su límite de {wip}.» */
  wipOver: string;
  /** En el aviso: «supera el límite ({n}/{wip})». */
  overLimit: string;
  /** «{n} tarjetas» */
  count: string;
  /** «límite {wip}» */
  wip: string;
  /** El aviso con deshacer: «{title} → {column}». */
  moved: string;
  /** «{title} volvió a {column}» */
  undone: string;
  /** Vence (o venció) el… */
  due: string;
  late: string;
}
