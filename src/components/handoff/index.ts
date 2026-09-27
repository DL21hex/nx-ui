import { define } from "../../core/define";
import { NxHandoff } from "./handoff";

define("nx-handoff", NxHandoff);

export { NxHandoff, HANDOFF_LABELS, setInputFiles as setHandoffFiles } from "./handoff";
export { parseHandoffEvent, parseHandoffItem, parseSession as parseHandoffSession, retryDelay as handoffRetryDelay, countdown as handoffCountdown } from "./logic";
export { qrMatrix, qrSvgPath } from "./qr";
export type { QrEcc, QrOptions } from "./qr";
export type { HandoffDoneDetail, HandoffEvent, HandoffItem, HandoffItemDetail, HandoffKind, HandoffLabels, HandoffPhoneInfo, HandoffSession, HandoffSide, HandoffState } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-handoff": NxHandoff;
  }
  interface HTMLElementEventMap {
    "nx-handoff-state": CustomEvent<{ state: import("./types").HandoffState }>;
    "nx-handoff-item": CustomEvent<import("./types").HandoffItemDetail>;
    "nx-handoff-done": CustomEvent<import("./types").HandoffDoneDetail>;
    "nx-handoff-error": CustomEvent<{ message: string }>;
  }
}
