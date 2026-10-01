import { define } from "../../core/define";
import { NxNotice } from "./notice";

define("nx-notice", NxNotice);

export { NxNotice } from "./notice";
export type { NoticeActionDetail, NoticeTone } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-notice": NxNotice;
  }
  interface HTMLElementEventMap {
    "nx-notice-action": CustomEvent<import("./types").NoticeActionDetail>;
  }
}
