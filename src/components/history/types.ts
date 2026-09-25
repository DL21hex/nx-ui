/**
 * `<nx-history>`: tipos. El historial es JSON (BDUI): el backend manda el registro como está hoy,
 * sus campos y los eventos que lo trajeron hasta aquí; el componente reconstruye el pasado.
 */

/** Un valor de un campo: lo que cabe en JSON sin anidar. */
export type HistoryValue = string | number | boolean | null;

export type HistoryFieldType = "text" | "number" | "money" | "date" | "status";
export type HistoryTone = "neutral" | "success" | "warning" | "danger";

/** Un campo del registro: cómo se llama y cómo se muestra su valor. */
export interface HistoryField {
  key: string;
  /** «Monto», «Proveedor». */
  label: string;
  /** `text` por defecto. `money` usa `currency`; `status` y cualquier campo con `options` muestran la etiqueta. */
  type?: HistoryFieldType;
  /** Moneda ISO («COP») o un símbolo («$»). */
  currency?: string;
  /** Los valores posibles («pendiente» → «Pendiente»), con un tono para el estado. */
  options?: { value: string; label: string; tone?: HistoryTone }[];
}

export type HistoryAction = "create" | "update" | "delete" | "comment" | "status";

/** Un campo que cambió: de qué valor a cuál. */
export interface HistoryChange {
  field: string;
  from: HistoryValue;
  to: HistoryValue;
}

export interface HistoryActor {
  name: string;
  /** URL de la foto (sin ella, las iniciales). */
  avatar?: string;
}

/** Algo que le pasó al registro. */
export interface HistoryEvent {
  id: string;
  /** Fecha ISO con hora («2026-09-12T15:40:00-05:00»). */
  at: string;
  actor: HistoryActor;
  action: HistoryAction;
  changes?: HistoryChange[];
  /** Un comentario, o el porqué del cambio. */
  note?: string;
  /** Este evento revierte un cambio de aquel. */
  revertOf?: string;
}

/** Lo que devuelve `source` (y cada página de `?before=<id>`). */
export interface HistoryPage {
  events: HistoryEvent[];
  /** El registro como está hoy (si no se pasó en `record`). */
  record?: Record<string, unknown>;
  /** ¿Hay eventos más viejos? Sin este dato, se pide otra página hasta que llegue vacía. */
  more?: boolean;
}

export interface HistoryRevertDetail {
  event: HistoryEvent;
  change: HistoryChange;
}

export interface HistoryCommitDetail extends HistoryRevertDetail {
  /** El evento de reversión que se agregó. */
  revert: HistoryEvent;
  /** El registro después de revertir. */
  record: Record<string, HistoryValue>;
}

export interface HistoryLabels {
  heading: string;
  search: string;
  people: string;
  fields: string;
  today: string;
  yesterday: string;
  create: string;
  update: string;
  delete: string;
  comment: string;
  status: string;
  reverted: string;
  /** «revirtió un cambio» (el verbo de un evento con `revertOf`). */
  revertVerb: string;
  revert: string;
  /** «Revertir {field} a {value}» */
  revertLabel: string;
  /** «{field} vuelve a {value}» */
  revertDone: string;
  note: string;
  send: string;
  travel: string;
  /** «Así estaba el {date}» */
  asOf: string;
  now: string;
  present: string;
  /** «Ahora: {value}» */
  nowValue: string;
  /** «Ver cómo estaba · {time}» */
  jump: string;
  /** «{i} de {n}» */
  step: string;
  more: string;
  loading: string;
  error: string;
  retry: string;
  empty: string;
  noMatch: string;
  clear: string;
  you: string;
}
