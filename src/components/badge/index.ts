import { define } from "../../core/define";
import { NxBadge } from "./badge";

define("nx-badge", NxBadge);

export { NxBadge } from "./badge";
export type { BadgeTone } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-badge": NxBadge;
  }
}
