import { define } from "../../core/define";
import { NxPasteFill } from "./paste-fill";

define("nx-paste-fill", NxPasteFill);

export { NxPasteFill, PASTE_FILL_LABELS } from "./paste-fill";
export { extract as extractPasteData, matchFields as matchPasteFields, inferKind as inferPasteKind, nitCheckDigit, parsePasteEvent, PASTE_HINTS } from "./logic";
export type { PasteEvent, PasteField, PasteFieldInput, PasteFill, PasteFillDoneDetail, PasteFillLabels, PasteFillState, PasteFinding, PasteHints, PasteKind, PasteOption, PasteSource } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-paste-fill": NxPasteFill;
  }
  interface HTMLElementEventMap {
    "nx-paste-fill-start": CustomEvent<{ text: string }>;
    "nx-paste-fill-done": CustomEvent<import("./types").PasteFillDoneDetail>;
    "nx-paste-fill-undo": CustomEvent<{ values: Record<string, string> }>;
  }
}
