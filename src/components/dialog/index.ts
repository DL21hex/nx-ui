import { define } from "../../core/define";
import { NxDialog } from "./dialog";

define("nx-dialog", NxDialog);

export { NxDialog, DIALOG_LABELS } from "./dialog";
export type { CloseReason, DialogCloseDetail, DialogLabels, DialogMode, DialogSize } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-dialog": NxDialog;
  }
  interface HTMLElementEventMap {
    "nx-dialog-close": CustomEvent<import("./types").DialogCloseDetail>;
  }
}
