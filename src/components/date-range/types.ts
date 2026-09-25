/**
 * `<nx-date-range>`: tipos. Las fechas viajan como texto ISO («2026-07-01»), sin hora ni zona:
 * un rango de un reporte es de días de calendario, no de instantes.
 */

/** Un rango cerrado de días: `start` y `end` incluidos, `start <= end`. */
export interface DateRange {
  start: string;
  end: string;
}

/** Contra qué se compara: el período anterior del mismo largo, o el mismo del año anterior. */
export type DateRangeCompare = "previous" | "year";

/** El valor del campo (y el `detail.value` de `nx-change`). */
export interface DateRangeValue extends DateRange {
  /** El rango de comparación, si `compare` está activo. */
  compare?: DateRange;
  /** Cómo se eligió: el atajo («Este trimestre») o la frase escrita («Q3 2025»). Del calendario, nada. */
  label?: string;
}

/**
 * Un atajo. Como texto es una frase que se interpreta al abrir («Últimos 30 días»), así el backend
 * no calcula fechas; como objeto, una frase con otra etiqueta o fechas fijas.
 */
export type DateRangePresetInput = string | { label: string; phrase?: string; start?: string; end?: string };

export interface DateRangePreset {
  label: string;
  phrase?: string;
  start?: string;
  end?: string;
}

export interface DateRangeChangeDetail {
  value: DateRangeValue | null;
}

export interface DateRangeLabels {
  placeholder: string;
  /** Nombre del panel (si el campo no tiene `label`). */
  dialog: string;
  /** Nombre de la caja de texto. */
  ask: string;
  askPlaceholder: string;
  /** «No entendí «{text}»…» */
  unknown: string;
  /** Mientras no se ha escrito nada. */
  askHint: string;
  outOfRange: string;
  clamped: string;
  presets: string;
  prevMonth: string;
  nextMonth: string;
  pickEnd: string;
  today: string;
  /** «{n} día» y «{n} días» (el plural lo decide `Intl.PluralRules`). */
  day: string;
  days: string;
  compare: string;
  compareNone: string;
  comparePrevious: string;
  compareYear: string;
  /** «vs {range}» */
  versus: string;
  apply: string;
}
