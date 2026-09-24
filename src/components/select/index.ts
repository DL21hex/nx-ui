import { define } from "../../core/define";
import { NxSelect } from "./select";

define("nx-select", NxSelect);

export { NxSelect, SELECT_LABELS } from "./select";
export type { SelectField, SelectOption, SelectLabels, SelectChangeDetail } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-select": NxSelect;
  }
  interface HTMLElementEventMap {
    "nx-change": CustomEvent<import("./types").SelectChangeDetail>;
  }
}
