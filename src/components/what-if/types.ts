/**
 * `<nx-what-if>`: tipos. Todo es JSON (BDUI): los supuestos, las métricas, las series y los
 * escenarios guardados. El cálculo NO es una función en una prop: lo hace el backend (`endpoint`,
 * en streaming) o la app, respondiendo al evento `nx-what-if-compute`.
 */

/** Cómo se muestra un valor. En `percent` el valor es la fracción: 0,08 es 8 %. */
export type WhatIfFormat = "number" | "money" | "percent";

/** Hacia dónde es mejor una métrica: `up` (utilidad, margen) o `down` (costos, punto de equilibrio). */
export type WhatIfBetter = "up" | "down";

export type WhatIfTone = "neutral" | "success" | "warning" | "danger";

/** Lo que el formato necesita saber de un valor. */
export interface WhatIfSpec {
  format?: WhatIfFormat;
  /** Con `money`: código ISO («COP») o un símbolo («$», «US$»). */
  currency?: string;
  /** Lo que va después del número: «u.», «días», «h/mes». */
  unit?: string;
}

/** Un supuesto: un deslizador entre `min` y `max`, que arranca (y vuelve) en `value`, la base. */
export interface WhatIfInput extends WhatIfSpec {
  id: string;
  /** «Precio del acero». */
  label: string;
  /** El valor base. */
  value: number;
  min: number;
  max: number;
  /** Lo que suma una flecha (por defecto, la centésima parte del rango). */
  step: number;
  /** Una línea de ayuda debajo: «Lámina HR, precio CIF». */
  hint?: string;
}

/** Una métrica del resultado. `base` es su valor con los supuestos en la base. */
export interface WhatIfMetric extends WhatIfSpec {
  id: string;
  /** «Margen bruto». */
  label: string;
  /** El valor del escenario (sin él, «—» hasta que llegue). */
  value?: number;
  base?: number;
  better?: WhatIfBetter;
}

/** Un punto de una serie: base y escenario. `x` es la etiqueta del eje («ene»). */
export interface WhatIfPoint {
  x: string;
  base?: number;
  value: number;
}

/** Una serie para el gráfico de líneas (p. ej. la caja de 12 meses). */
export interface WhatIfSeries extends WhatIfSpec {
  id: string;
  label: string;
  points: WhatIfPoint[];
}

export interface WhatIfNote {
  message: string;
  tone: WhatIfTone;
}

/** Una línea del stream del cálculo (o un elemento de `respond(events)`). */
export type WhatIfEvent =
  | ({ type: "metric" } & WhatIfMetric)
  | ({ type: "series" } & WhatIfSeries)
  | ({ type: "note" } & WhatIfNote)
  | { type: "error"; message: string }
  | { type: "done" };

/** `{id: valor}` de los supuestos. */
export type WhatIfValues = Record<string, number>;

/** Un escenario guardado: los supuestos y lo que dieron las métricas. */
export interface WhatIfScenario {
  id: string;
  name: string;
  inputs: WhatIfValues;
  outputs: WhatIfValues;
}

/** Detalle de `nx-what-if-compute`: calcula `inputs` y llama `respond(events)` (ya, o después de
 *  `preventDefault()` si el cálculo es asíncrono). */
export interface WhatIfComputeDetail {
  inputs: WhatIfValues;
  respond(events: unknown[]): void;
}

/** Detalle de `nx-what-if-save` (cancelable): qué pasó, con qué escenario, y la lista que queda. */
export interface WhatIfSaveDetail {
  action: "save" | "rename" | "delete";
  scenario: WhatIfScenario;
  scenarios: WhatIfScenario[];
}

/** Detalle de `nx-what-if-change`: un supuesto cambió (`id: null` si cambiaron varios a la vez). */
export interface WhatIfChangeDetail {
  id: string | null;
  inputs: WhatIfValues;
}

export interface WhatIfLabels {
  /** Título de la columna de supuestos. */
  inputs: string;
  /** Título de la columna de resultados. */
  outputs: string;
  resetAll: string;
  /** «Restablecer {label}». */
  reset: string;
  /** Nombre del valor grande, que se puede escribir: «Escribir {label}». */
  edit: string;
  /** «{delta} vs. base». */
  vsBase: string;
  /** Un supuesto en su base. */
  atBase: string;
  base: string;
  /** Columna del escenario sin guardar. */
  current: string;
  /** Puntos porcentuales: «p. p.». */
  points: string;
  save: string;
  /** Nombre del campo del nombre al guardar. */
  name: string;
  /** Nombre por defecto: «Escenario {n}». */
  untitled: string;
  ok: string;
  cancel: string;
  scenarios: string;
  /** Sin escenarios guardados. */
  empty: string;
  load: string;
  rename: string;
  remove: string;
  /** Lo que se lee después de la mejor celda de una métrica. */
  best: string;
  error: string;
  retry: string;
  /** Leyenda del gráfico: la línea del escenario. */
  scenario: string;
}
