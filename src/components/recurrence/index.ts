import { define } from "../../core/define";
import { NxRecurrence } from "./recurrence";

define("nx-recurrence", NxRecurrence);

export { NxRecurrence, RECURRENCE_LABELS } from "./recurrence";
export {
  colombiaHolidays,
  describeRecurrence,
  fillRule as fillRecurrenceRule,
  nextOccurrences,
  occurrences as recurrenceOccurrences,
  parseRRule,
  toRRule,
} from "./logic";
// El intérprete de frases (`parseRecurrence`) vive en un chunk que el elemento carga al necesitarlo:
// se exporta desde `nx32-elements` (el índice general, ver INTEGRATION.md), no desde aquí, para que
// `nx32-elements/recurrence` no lo arrastre.
export type {
  RecurrenceChangeDetail,
  RecurrenceErrorDetail,
  RecurrenceFreq,
  RecurrenceHolidayMode,
  RecurrenceHolidays,
  RecurrenceLabels,
  RecurrenceOccurrence,
  RecurrenceParse,
  RecurrenceParseOptions,
  RecurrenceRule,
  RecurrenceValue,
  RecurrenceValueFormat,
  RecurrenceWeekday,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-recurrence": NxRecurrence;
  }
  interface HTMLElementEventMap {
    "nx-recurrence-change": CustomEvent<import("./types").RecurrenceChangeDetail>;
    "nx-recurrence-error": CustomEvent<import("./types").RecurrenceErrorDetail>;
  }
}
