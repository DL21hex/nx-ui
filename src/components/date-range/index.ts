import { define } from "../../core/define";
import { NxDateRange } from "./date-range";

define("nx-date-range", NxDateRange);

export { NxDateRange, DATE_RANGE_LABELS } from "./date-range";
export { parsePhrase as parseDateRange, compareRange, clampRange, formatRange as formatDateRange, rangeDays, DEFAULT_PRESETS as DATE_RANGE_PRESETS, type ParseOptions as DateRangeParseOptions } from "./logic";
export type { DateRange, DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePreset, DateRangePresetInput, DateRangeValue } from "./types";

// `nx-change` y `nx-open-change` ya están en `HTMLElementEventMap` (los declaran `<nx-select>` y
// `<nx-sidemenu>` con su propio `detail`): otra declaración con otro tipo no compila. Quien integra
// los amplía a una unión (ver INTEGRATION.md).
declare global {
  interface HTMLElementTagNameMap {
    "nx-date-range": NxDateRange;
  }
}
