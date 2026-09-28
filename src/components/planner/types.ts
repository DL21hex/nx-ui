/**
 * `<nx-planner>`: tipos. Recursos y reservas son JSON (BDUI). Las fechas van como ISO con hora; sin
 * zona («2026-10-06T07:30») se toman como hora local de quien mira, y así salen en los eventos
 * (con su desfase: «2026-10-06T07:30:00-05:00»).
 */

export type PlannerView = "day" | "week" | "month";
/** Tono de una reserva: confirmada, tentativa, en curso, o un bloqueo (mantenimiento: ocupa todo el recurso). */
export type PlannerStatus = "confirmed" | "tentative" | "active" | "block";

export interface PlannerResource {
  id: string;
  name: string;
  detail?: string;
  /** Foto (https o del mismo origen). */
  avatar?: string;
  /** Nombre de un ícono registrado con `registerIcons`. Sin foto ni ícono, las iniciales. */
  icon?: string;
  /** Encabezado plegable que agrupa recursos («Camiones», «Montacargas»). */
  group?: string;
  /** Cuántas reservas admite a la vez (1). Más, y la fila se marca como choque. */
  capacity?: number;
}

export interface PlannerBooking {
  id: string;
  /** El `id` de su recurso. */
  resource: string;
  start: string;
  end: string;
  title: string;
  detail?: string;
  status?: PlannerStatus;
  /** Color propio (`#0a7`, `rgb(…)`, `oklch(…)`); si no, el del estado. */
  color?: string;
  /** No se puede mover, cambiar ni borrar. */
  readonly?: boolean;
  /** Lo que la app quiera llevar con la reserva (vuelve en los eventos). */
  data?: unknown;
}

/** Dónde y cuándo está una reserva. */
export interface PlannerPlace {
  resource: string;
  start: string;
  end: string;
}

export type PlannerVia = "pointer" | "keyboard" | "undo";

/** `nx-planner-change` (cancelable). `message`: lo que dirá el aviso si la app lo cancela. */
export interface PlannerChangeDetail {
  booking: PlannerBooking;
  from: PlannerPlace;
  to: PlannerPlace;
  via: PlannerVia;
  message?: string;
}
/** `nx-planner-create` (cancelable: la app puede abrir su propio formulario con el rango). */
export interface PlannerCreateDetail extends PlannerPlace {
  booking: PlannerBooking;
  via: PlannerVia;
  message?: string;
}
/** `nx-planner-delete` (cancelable). */
export interface PlannerDeleteDetail {
  booking: PlannerBooking;
  via: PlannerVia;
  message?: string;
}
export interface PlannerRangeDetail {
  from: string;
  to: string;
  view: PlannerView;
}

export interface PlannerLabels {
  /** Nombre de la rejilla. */
  grid: string;
  resources: string;
  today: string;
  prev: string;
  next: string;
  date: string;
  day: string;
  week: string;
  month: string;
  zoomIn: string;
  zoomOut: string;
  /** Cómo se anuncia una reserva («reserva»). */
  booking: string;
  hint: string;
  /** Una celda: «{resource}, {when}». */
  cell: string;
  free: string;
  /** Título de una reserva creada arrastrando. */
  newBooking: string;
  confirmed: string;
  tentative: string;
  active: string;
  block: string;
  /** «Choque» (en la sombra del arrastre y en el aviso de la fila). */
  clash: string;
  /** «{n} a la vez, capacidad {cap}». */
  clashDetail: string;
  /** En la barra: «{n} choques». */
  clashes: string;
  /** Ocupación por columna: «{n}/{total}». */
  summary: string;
  moved: string;
  created: string;
  deleted: string;
  /** El cambio no quedó: «{reason}. {title} volvió a su lugar.» */
  reverted: string;
  /** Razón por defecto cuando la app cancela. */
  rejected: string;
  /** Razón por defecto cuando el servidor falla. */
  failed: string;
  undone: string;
  loading: string;
  loadError: string;
  empty: string;
  collapse: string;
  expand: string;
}
