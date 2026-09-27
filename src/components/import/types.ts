/**
 * `<nx-import>`: tipos. Importar una hoja de Excel o un CSV en tres pasos (archivo → columnas →
 * revisión) hacia los campos de destino (`columns`). Todo es serializable en JSON: las columnas, el
 * mapeo, las filas normalizadas y los errores pueden ir y venir del backend.
 *
 * Con `endpoint`, las filas listas se envían en lotes:
 *
 *   POST {"rows":[{"nit":"900359742-3","ciudad":"05001",…},…],"offset":500}
 *   ← 200 {}                                                  (todo el lote entró)
 *   ← 200 {"errors":[{"row":503,"field":"nit","message":"NIT ya existe en el sistema"}]}
 *
 * `row` es la posición de la fila dentro del envío (`offset` + su índice en el lote); también se
 * acepta el índice dentro del lote. Sin `field`, el error es de la fila entera.
 */

/** Qué espera un campo de destino (define cómo se normaliza y valida). */
export type ImportType = "text" | "number" | "money" | "percent" | "date" | "email" | "phone" | "nit" | "bool" | "option";

/** Una celda tal como llega del archivo: texto (CSV, texto pegado) o número (celda numérica de un .xlsx). */
export type ImportCell = string | number;

export interface ImportOption {
  value: string;
  label: string;
}

/** Un campo de destino. */
export interface ImportColumn {
  key: string;
  label: string;
  type: ImportType;
  required?: boolean;
  /** Sin repetidos dentro del archivo. */
  unique?: boolean;
  /** `option`: los valores posibles; se reconocen por `value` o por `label`, sin tildes ni mayúsculas. */
  options?: ImportOption[];
  /** Otros nombres con los que suele venir la columna («celular», «móvil»). */
  aliases?: string[];
  /** Números (en `percent`, la fracción) o fechas ISO. */
  min?: number | string;
  max?: number | string;
  /** Expresión regular que el texto debe cumplir completo (como el `pattern` de HTML). */
  pattern?: string;
  /** Una ayuda corta junto al campo en el paso de columnas. */
  hint?: string;
}

/** Lo que se asigna a `columns`: solo `key` es obligatorio. */
export type ImportColumnInput = Partial<ImportColumn> & { key: string };

/** La hoja ya partida: encabezados, filas de datos y el número de fila de cada una en el archivo (desde 1). */
export interface ImportTable {
  headers: string[];
  rows: ImportCell[][];
  lines: number[];
  /** Índice (desde 0) de la fila de encabezados en el archivo; −1 si no hay. */
  headerRow: number;
}

/** Cómo quedó asociado un campo: `name` (encabezado), `content` (los valores), `memory` (la última
 *  vez con los mismos encabezados), `hand` (la persona) o `none`. */
export type ImportMatchBy = "name" | "content" | "memory" | "hand" | "none";

export interface ImportMatch {
  /** Índice de la columna del archivo, o `null` (no se importa). */
  index: number | null;
  /** Confianza, 0–1. */
  score: number;
  by: ImportMatchBy;
}

/** Campo de destino → índice de la columna del archivo (o `null`). */
export type ImportMapping = Record<string, number | null>;

/** Una fila revisada. `values` trae solo los campos asociados, ya normalizados (números como
 *  `number`, fechas ISO, opciones por su `value`, booleanos). */
export interface ImportRowCheck {
  /** Índice en `table.rows`. */
  index: number;
  /** Número de la fila en el archivo. */
  line: number;
  values: Record<string, unknown>;
  /** Errores de la fila por campo (`"*"`: de la fila entera). */
  errors: Record<string, string>;
  /** Todas las celdas asociadas vacías: se omite. */
  empty: boolean;
  /** Repetidos (`unique`), calculados sobre todo el archivo. */
  dup?: Record<string, string>;
  /** Lo que respondió el servidor. */
  server?: Record<string, string>;
}

export interface ImportServerError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportSkipped {
  line: number;
  reason: string;
}

export interface ImportParsedDetail {
  name: string;
  /** La hoja leída y las que tiene el libro (.xlsx). */
  sheet?: string;
  sheets?: string[];
  headers: string[];
  headerRow: number;
  rows: number;
}

export interface ImportMappedDetail {
  mapping: ImportMapping;
  /** Campos con un mismo valor para todas las filas. */
  fixed: Record<string, string>;
  /** El mapeo salió de la memoria (mismos encabezados que la última vez). */
  remembered: boolean;
}

export interface ImportDoneDetail {
  /** Las filas importadas, normalizadas. */
  rows: Record<string, unknown>[];
  /** Las que no entraron (con errores que se omitieron o que rechazó el servidor). */
  skipped: ImportSkipped[];
  mapping: ImportMapping;
  fixed: Record<string, string>;
  headers: string[];
}

export type ImportErrorCode = "size" | "read" | "empty" | "network";

export interface ImportErrorDetail {
  code: ImportErrorCode;
  message: string;
}

/** `file`, `columns`, `review` (los tres pasos), `sending` y `done`. */
export type ImportState = "file" | "columns" | "review" | "sending" | "done";

/** Los mensajes de validación (van en `labels`, así se traducen con el resto). */
export interface ImportMessages {
  required: string;
  number: string;
  date: string;
  email: string;
  phone: string;
  nit: string;
  /** «El dígito de verificación no cuadra: debería ser {dv}» */
  nitDv: string;
  bool: string;
  option: string;
  /** «Debe ser al menos {min}» */
  min: string;
  max: string;
  pattern: string;
  /** «Repetido: ya está en la fila {line}» */
  duplicate: string;
  /** Un rechazo del servidor sin mensaje. */
  rejectedRow: string;
}

export interface ImportLabels extends ImportMessages {
  /** «Paso {n} de {total} · » */
  step: string;
  stepFile: string;
  stepColumns: string;
  stepReview: string;
  drop: string;
  /** «CSV, TSV, TXT o Excel (.xlsx), hasta {max}. También puedes pegar lo copiado de Excel con {mod}+V.» */
  dropHint: string;
  change: string;
  dragging: string;
  reading: string;
  pasted: string;
  /** «{name} · {rows} · {cols}», con `rowCount` y `colCount`. */
  fileInfo: string;
  /** «1 fila|{n} filas»: los textos con `|` tienen forma singular y plural. */
  rowCount: string;
  colCount: string;
  sheet: string;
  headerRow: string;
  noHeader: string;
  /** «Columna {n}»: el nombre de una columna sin encabezado. */
  column: string;
  /** «El archivo pesa {size}; el máximo es {max}.» */
  tooBig: string;
  unreadable: string;
  oldExcel: string;
  emptyFile: string;
  onlyHeaders: string;
  noColumns: string;
  back: string;
  next: string;
  skip: string;
  fixed: string;
  fixedLabel: string;
  /** «Ej.: {values}» */
  sample: string;
  emptyColumn: string;
  byName: string;
  byContent: string;
  remembered: string;
  /** «No se importan: {names}» */
  unused: string;
  missing: string;
  /** «Revisando las filas… {pct}» */
  checking: string;
  /** «{n} filas listas» */
  ready: string;
  /** «{n} con errores» */
  invalid: string;
  /** «{n} vacías que se omiten» */
  emptyRows: string;
  line: string;
  /** «y {n} filas más» */
  more: string;
  skipErrors: string;
  fixFirst: string;
  /** «Importar {n} filas» */
  import: string;
  finish: string;
  /** «Enviando {done} de {total}…» */
  sending: string;
  cancel: string;
  /** «Envío cancelado. Se importaron {n} filas.» */
  cancelled: string;
  /** «No se pudo enviar ({error}). Se importaron {n}; puedes reintentar el resto.» */
  failed: string;
  /** «El servidor rechazó {n} filas: corrígelas y vuelve a enviarlas.» */
  rejected: string;
  /** «Importamos {n} filas» */
  done: string;
  /** «{n} filas no entraron» */
  notImported: string;
  download: string;
  reason: string;
  again: string;
  yes: string;
  no: string;
  /** El nombre del CSV con lo que no entró (sin extensión). */
  failedFile: string;
}
