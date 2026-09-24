import { define } from "../../core/define";
import { NxSidemenu } from "./sidemenu";

define("nx-sidemenu", NxSidemenu);

export { NxSidemenu, DEFAULT_LABELS } from "./sidemenu";
export type { MenuItem, SidemenuLabels, SelectDetail, ToggleDetail, OpenChangeDetail } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-sidemenu": NxSidemenu;
  }
  interface HTMLElementEventMap {
    "nx-select": CustomEvent<import("./types").SelectDetail>;
    "nx-toggle": CustomEvent<import("./types").ToggleDetail>;
    "nx-open-change": CustomEvent<import("./types").OpenChangeDetail>;
  }
}
