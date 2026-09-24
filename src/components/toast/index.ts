import { define } from "../../core/define";
import { NxToaster } from "./toast";

define("nx-toaster", NxToaster);

export { NxToaster, nxToast, setToastLabels, TOAST_LABELS } from "./toast";
export type { ToastLabels, ToastOptions, ToastResult, ToastTone } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-toaster": NxToaster;
  }
}
