import { define } from "../../core/define";
import { NxButton } from "./button";

define("nx-button", NxButton);

export { NxButton, BUTTON_LABELS } from "./button";
export type { ButtonVariant, ButtonLabels, LogLevel, LogLine, LogMode, RunContext, StreamEvent, DoneDetail } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-button": NxButton;
  }
  interface HTMLElementEventMap {
    "nx-done": CustomEvent<import("./types").DoneDetail>;
  }
}
