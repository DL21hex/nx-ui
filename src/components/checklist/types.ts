/**
 * `<nx-checklist>`: tipos. Todo es JSON (BDUI): los pasos, el estado de cada uno, quién usa la
 * pantalla y, en `summary`, la lista de procedimientos. El protocolo con el servidor está en
 * `INTEGRATION.md`.
 */

/** En qué va un paso. `blocked` lo pone el servidor (con `reason`); el bloqueo por orden se calcula. */
export type ChecklistStatus = "todo" | "done" | "skipped" | "blocked";

/** Qué evidencia pide un paso. */
export type ChecklistEvidenceType = "photo" | "file" | "signature" | "note" | "number" | "choice";

/** `run` (por defecto): un procedimiento. `summary`: varios, compactos. */
export type ChecklistMode = "run" | "summary";

export interface ChecklistPerson {
  id?: string;
  name: string;
  /** Foto: `https:` o del mismo origen. */
  avatar?: string;
}

/** Una opción de `choice`. `note: true` exige una nota al elegirla («No conforme» la exige sin decirlo). */
export interface ChecklistOption {
  value: string;
  label: string;
  note?: boolean;
}

/** Lo que exige un paso. */
export interface ChecklistEvidenceSpec {
  type: ChecklistEvidenceType;
  /** «Foto del camión», «Temperatura del cuarto frío». */
  label?: string;
  /** `number`: el rango aceptado (inclusive). Fuera de él, el paso se puede cerrar con una nota. */
  min?: number;
  max?: number;
  /** `number`: «°C», «und». */
  unit?: string;
  /** `choice`: textos o `{value, label, note}`. */
  options?: (string | ChecklistOption)[];
  /** `photo` / `file`: cuántos como mínimo (1). */
  count?: number;
  /** `file`: el `accept` del selector. */
  accept?: string;
  /** `false`: se puede dejar vacía (por defecto, toda evidencia es obligatoria). */
  required?: boolean;
}

export interface ChecklistStep {
  id: string;
  title: string;
  /** La ayuda: qué revisar, cómo. */
  hint?: string;
  section?: string;
  assignee?: ChecklistPerson;
  /** ISO: «2026-09-28T17:00» (hora local), con zona, o solo el día (vence al terminar ese día, hora local). */
  due?: string;
  /** `false`: no cuenta para completar el procedimiento. */
  required?: boolean;
  evidence?: ChecklistEvidenceSpec[];
  /** Pasos que tienen que estar hechos (u omitidos) antes. Los ciclos se rompen (con un aviso en consola). */
  dependsOn?: string[];
  /** Se puede omitir, con un motivo. */
  canSkip?: boolean;
}

/** Un archivo o foto ya adjunto. `url` llega del servidor al subirlo (`POST …/files`). */
export interface ChecklistFile {
  name: string;
  type?: string;
  size?: number;
  url?: string;
  id?: string;
}

/** Lo que se entregó para una evidencia (en el mismo orden que `evidence` del paso). */
export interface ChecklistEvidence {
  type: ChecklistEvidenceType;
  /** `photo` y `file`. */
  files?: ChecklistFile[];
  /** `signature`: el valor de `<nx-signature>` (`{svg, meta}`). */
  signature?: { svg: string; meta?: unknown };
  /** `note` (texto), `number` (número) y `choice` (el `value` de la opción). */
  value?: string | number | null;
  /** `number` fuera de `min`–`max`. */
  outOfRange?: boolean;
}

/** El estado de un paso. */
export interface ChecklistStepState {
  status: ChecklistStatus;
  /** Quién lo marcó (o lo omitió, o lo reabrió) y cuándo (ISO). */
  by?: ChecklistPerson;
  at?: string;
  evidence?: ChecklistEvidence[];
  /** Por qué se omitió, se reabrió o está bloqueado. */
  reason?: string;
  /** La nota que exige una novedad (fuera de rango, «No conforme») cuando el paso no pide una evidencia `note`. */
  note?: string;
}

/** Estado de todos los pasos, por `id`. */
export type ChecklistState = Record<string, ChecklistStepState>;

export type ChecklistAction = "done" | "skipped" | "reopened" | "blocked" | "closed" | "reverted";

/** Una línea de la bitácora («Actividad»). */
export interface ChecklistLogEntry {
  action: ChecklistAction;
  step?: string;
  by?: ChecklistPerson;
  at: string;
  reason?: string;
}

/** Quién cerró el procedimiento y cuándo. */
export interface ChecklistClosed {
  by?: ChecklistPerson;
  at: string;
}

/** Lo que responde `GET {endpoint}`. Todo es opcional: lo que no venga se toma de los atributos. */
export interface ChecklistData {
  title?: string;
  steps?: ChecklistStep[];
  state?: ChecklistState;
  closed?: ChecklistClosed | null;
  log?: ChecklistLogEntry[];
}

export interface ChecklistProgress {
  /** Hechos u omitidos. */
  done: number;
  total: number;
  /** Cuántos cuentan para completar, y cuántos de esos están hechos u omitidos. */
  required: number;
  requiredDone: number;
  skipped: number;
  /** Sin hacer y con la fecha límite ya pasada. */
  overdue: number;
  /** Todos los requeridos hechos u omitidos (y hay al menos uno). */
  complete: boolean;
}

/** Un procedimiento en `mode="summary"`. */
export interface ChecklistSummaryItem {
  id: string;
  title: string;
  href?: string;
  done: number;
  total: number;
  overdue?: number;
  assignee?: ChecklistPerson;
  due?: string;
}

/** Qué le falta a un paso para marcarlo como hecho. `index` es la evidencia (-1: la nota de la novedad). */
export interface ChecklistMissing {
  index: number;
  type: ChecklistEvidenceType;
  /** `photo` / `file`: cuántos faltan. */
  need?: number;
  label?: string;
}

/** Un cambio sin enviar al servidor. */
export interface ChecklistPendingChange {
  clientId: string;
  /** Vacío: cerrar el procedimiento. */
  step: string;
  status: ChecklistStatus | "closed";
  at: string;
}

export interface ChecklistChangeDetail {
  step: string;
  status: ChecklistStatus;
  evidence: ChecklistEvidence[];
  reason?: string;
  note?: string;
}
export interface ChecklistCompleteDetail {
  by?: ChecklistPerson;
  at: string;
  progress: ChecklistProgress;
}
export interface ChecklistOpenDetail {
  item: ChecklistSummaryItem;
}
export interface ChecklistErrorDetail {
  message: string;
  step?: string;
  status?: number;
}

export interface ChecklistLabels {
  /** Encabezado: «{done} de {total}», y lo que se suma con « · ». */
  progress: string;
  /** «1 vencido|{n} vencidos» (singular|plural). */
  overdue: string;
  unsent: string;
  offline: string;
  loading: string;
  loadError: string;
  retry: string;
  complete: string;
  /** «Lo completó {name} {when}». */
  completeBy: string;
  close: string;
  closed: string;
  closedBy: string;
  /** Vencimiento: «vence {when}», «venció {when}»; {when} = «hoy 5:00 p. m.», «mañana», «3 oct». */
  due: string;
  late: string;
  today: string;
  tomorrow: string;
  yesterday: string;
  /** Estado para el lector de pantalla y el panel. */
  todo: string;
  done: string;
  skipped: string;
  reopened: string;
  blocked: string;
  /** «por {name}». */
  by: string;
  optional: string;
  /** «Primero: {step}». */
  first: string;
  /** «Responsable: {name}». */
  assignee: string;
  pending: string;
  outOfRange: string;
  /** «Entre {min} y {max}», «Mínimo {min}», «Máximo {max}». */
  range: string;
  min: string;
  max: string;
  /** Aviso al salir del rango. */
  rangeWarn: string;
  explain: string;
  markDone: string;
  /** «Falta: {list}». */
  missing: string;
  skip: string;
  skipConfirm: string;
  reopen: string;
  reopenConfirm: string;
  cancel: string;
  reason: string;
  reasonRequired: string;
  /** Evidencias: el nombre por defecto de cada tipo. */
  photo: string;
  file: string;
  signature: string;
  note: string;
  number: string;
  choice: string;
  takePhoto: string;
  phone: string;
  attach: string;
  /** «Quitar {name}». */
  remove: string;
  /** Lo que falta: «1 foto más|{n} fotos más», «1 archivo|{n} archivos». */
  needPhotos: string;
  needFiles: string;
  /** Bitácora. */
  activity: string;
  empty: string;
  logDone: string;
  logSkipped: string;
  logReopened: string;
  logBlocked: string;
  logClosed: string;
  logReverted: string;
  /** «No se guardó «{step}»: {message}». */
  error: string;
  /** Summary. */
  sort: string;
  sortDue: string;
  sortProgress: string;
  sortTitle: string;
  /** «{done}/{total}». */
  count: string;
}
