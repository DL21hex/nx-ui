import { define } from "../../core/define";
import { NxInbox } from "./inbox";

define("nx-inbox", NxInbox);

export { NxInbox, INBOX_LABELS } from "./inbox";
export { nextActive, decisionMessage } from "./logic";
export type { InboxDecision, InboxDecisionDetail, InboxImpact, InboxItem, InboxLabels, InboxOutcome } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-inbox": NxInbox;
  }
  interface HTMLElementEventMap {
    "nx-inbox-decide": CustomEvent<import("./types").InboxDecisionDetail>;
    "nx-inbox-commit": CustomEvent<import("./types").InboxDecisionDetail>;
    "nx-inbox-undo": CustomEvent<import("./types").InboxDecisionDetail>;
    "nx-inbox-active": CustomEvent<{ id: string; item: import("./types").InboxItem }>;
    "nx-inbox-open": CustomEvent<{ id: string; item: import("./types").InboxItem }>;
  }
}
