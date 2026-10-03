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
    "nx-select-change": CustomEvent<import("./types").SelectChangeDetail>;
    // TEMPORAL: <nx-select> ya no emite `nx-change` (ahora es `nx-select-change` + `change`), pero
    // number, date-range, recurrence y guard todavía sí, y se apoyan en esta declaración. La quita
    // la ola que les cambia el nombre a esos eventos.
    "nx-change": CustomEvent<import("./types").SelectChangeDetail>;
  }
}
