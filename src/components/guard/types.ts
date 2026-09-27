/**
 * `<nx-guard>`: tipos. Todo es JSON (BDUI): la configuración de cada campo va en `fields` (por
 * `name`) o en el `data-guard` del propio campo, y los hallazgos son objetos planos.
 */

/** Qué clase de rareza se encontró. `remote` es lo que dijo el `endpoint`. */
export type GuardKind =
  /** Una potencia de 10 lejos de lo habitual: un cero de más o de menos. */
  | "magnitude"
  /** El separador decimal confundido («1.500» queriendo 1,5). */
  | "decimal"
  /** Muy por encima o por debajo de lo habitual (sin una corrección obvia). */
  | "range"
  /** Dos dígitos adyacentes invertidos respecto de lo esperado. */
  | "swap"
  /** Un solo dígito distinto de lo esperado. */
  | "digit"
  /** Año con dígitos invertidos o de otro siglo. */
  | "year"
  /** Fecha fuera de lo habitual para el campo. */
  | "date"
  /** Fin de semana o festivo en un campo de días hábiles. */
  | "workday"
  /** Igual al último valor registrado. */
  | "repeat"
  /** Decimales donde siempre van enteros. */
  | "integer"
  /** Negativo donde nunca hay negativos. */
  | "negative"
  | "remote";

/** `warn`: casi seguro un dedazo; `info`: raro, pero puede ser a propósito. */
export type GuardSeverity = "warn" | "info";

/** Un hallazgo: qué es, el mensaje para la persona y, si la hay, la corrección de un clic. */
export interface GuardFinding {
  kind: GuardKind | (string & {});
  message: string;
  /** El valor corregido: un número, una fecha ISO («2026-09-12») o un texto. */
  suggestion?: number | string;
  severity: GuardSeverity;
  /** El `name` del campo (en `check()`, `findings` y los eventos). */
  field?: string;
}

/**
 * La configuración de un campo. Todo es opcional: sin nada, un campo numérico no se vigila y uno
 * de fecha solo por años absurdos (2062, 0226).
 *
 * Fechas relativas (en `typical`, `min` y `max` de un campo de fecha): «-30d», «+90d», «-2w»,
 * «+6m», «-1y», «today» (o «0d»), relativas a hoy; o una fecha ISO.
 */
export interface GuardRule {
  /** `number`, `date` o `text`. Sin él, se deduce del campo y de la configuración. */
  type?: "number" | "date" | "text";
  /** Valores recientes del campo (el último es el más reciente). Números, o textos en un campo de texto. */
  history?: (number | string)[];
  /** Rango habitual `[lo, hi]`: números, o fechas (ISO o relativas) en un campo de fecha. */
  typical?: [number | string, number | string];
  /** Límites blandos: avisan, no bloquean (para límites duros, los del propio campo). */
  min?: number | string;
  max?: number | string;
  /**
   * El valor esperado: un número, o de dónde leerlo: `"#total-oc"` (el elemento con ese `id`: su
   * `value` o su texto) o `"@total"` (el campo con ese `name` dentro del guard).
   */
  expected?: number | string;
  /** Cómo se muestra en los mensajes: `number` (por defecto), `money` o `percent`. */
  format?: "number" | "money" | "percent";
  /** Con `money`: ISO («COP») o un símbolo («$»). */
  currency?: string;
  /** Solo enteros. Sin él, se deduce de la historia (si todos son enteros y no es un monto). */
  integer?: boolean;
  /** ¿Puede ser negativo? Sin él, se deduce: si la historia, `typical` o `min` no tienen negativos, no. */
  negative?: boolean;
  /** Avisar si es igual al último de `history` (un número de factura repetido). */
  repeat?: boolean;
  /** Fechas: avisar si cae en fin de semana o en uno de `holidays`. */
  workdays?: boolean;
  /** Festivos en ISO («2026-10-12»), con `workdays`. */
  holidays?: string[];
  /** `false`: este campo no se manda al `endpoint`. */
  remote?: boolean;
}

/** `fields`: la configuración por `name`. */
export type GuardFields = Record<string, GuardRule>;

/** `warn` (por defecto) nunca bloquea; `confirm` detiene el primer envío con avisos sin reconocer. */
export type GuardMode = "warn" | "confirm";

/** Lo que manda el `endpoint`. */
export interface GuardRemoteResponse {
  findings?: { field?: string; kind?: string; message: string; suggestion?: number | string; severity?: GuardSeverity }[];
}

export interface GuardLabels {
  /** «{value} es {n} veces lo habitual ({typical}).» */
  times: string;
  /** «{value} es {n} veces menos que lo habitual ({typical}).» */
  fraction: string;
  /** «{value} es {n} veces lo esperado ({expected}).» */
  timesExpected: string;
  /** «{value} es {n} veces menos que lo esperado ({expected}).» */
  fractionExpected: string;
  extraZero: string;
  /** «¿Sobran {n} ceros?» */
  extraZeros: string;
  missingZero: string;
  /** «¿Faltan {n} ceros?» */
  missingZeros: string;
  /** «Muy por encima de lo habitual ({typical})» */
  high: string;
  /** «Muy por debajo de lo habitual ({typical})» */
  low: string;
  /** «Lo leí como {value}. ¿Querías {suggestion}?» */
  decimal: string;
  /** «¿Invertiste dos dígitos? Esperado {expected}» */
  swap: string;
  /** «Difiere en un dígito de {expected}» */
  digit: string;
  /** «¿Año {year}? Quizás {suggestion}» */
  year: string;
  /** «Fuera de lo habitual para esta fecha ({typical})» */
  date: string;
  /** «Cae en {day}» */
  weekend: string;
  holiday: string;
  repeat: string;
  integer: string;
  negative: string;
  /** Botón: «Corregir a {value}» */
  fix: string;
  /** Botón: «Está bien» */
  ack: string;
  /** Al enviar en `confirm`: «Revisa {n} valores inusuales o envía de todos modos» */
  confirm: string;
  confirmOne: string;
}
