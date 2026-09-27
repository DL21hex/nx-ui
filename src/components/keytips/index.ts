import { define } from "../../core/define";
import { NxKeytips } from "./keytips";

define("nx-keytips", NxKeytips);

export { NxKeytips, KEYTIPS_LABELS } from "./keytips";
export { assignKeytips, keytipLetters, keytipChar, cleanKeytip, KEYTIPS_SINGLE_MAX } from "./logic";
export type { KeytipAssignment, KeytipDetail, KeytipInput, KeytipsLabels } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-keytips": NxKeytips;
  }
  interface HTMLElementEventMap {
    "nx-keytip": CustomEvent<import("./types").KeytipDetail>;
  }
  // `nx-open-change` ({open}) ya lo declara <nx-sidemenu> con el mismo detalle.
}
