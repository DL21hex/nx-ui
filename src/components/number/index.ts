import { define } from "../../core/define";
import { NxNumber } from "./number";

define("nx-number", NxNumber);

export { NxNumber, NUMBER_LABELS } from "./number";
export { evaluate as evaluateNumber, numberToWords, formatText as formatNumberText, affixes as numberAffixes, WORDS_CURRENCIES } from "./logic";
export type { NumberAlign, NumberChangeDetail, NumberErrorCode, NumberFormat, NumberLabels, NumberReading, WordsCurrency } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-number": NxNumber;
  }
  // `nx-change` ya lo declara <nx-select> con su detalle (`{value, options}`); el de <nx-number> es
  // `NumberChangeDetail` (`{value, text}`). Ver INTEGRATION.md, «Notas».
}
