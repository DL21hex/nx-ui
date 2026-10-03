import { define } from "../../core/define";
import { NxDateRange } from "./date-range";

define("nx-date-range", NxDateRange);

export { NxDateRange, DATE_RANGE_LABELS } from "./date-range";
export { parsePhrase as parseDateRange, compareRange, clampRange, formatRange as formatDateRange, rangeDays, DEFAULT_PRESETS as DATE_RANGE_PRESETS, type ParseOptions as DateRangeParseOptions } from "./logic";
export type { DateRange, DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePreset, DateRangePresetInput, DateRangeValue } from "./types";

// `nx-open-change` ya está en `HTMLElementEventMap` (lo declara `<nx-sidemenu>` con el mismo `{open}`).
declare global {
  interface HTMLElementTagNameMap {
    "nx-date-range": NxDateRange;
  }
  interface HTMLElementEventMap {
    "nx-date-range-change": CustomEvent<import("./types").DateRangeChangeDetail>;
  }
}
