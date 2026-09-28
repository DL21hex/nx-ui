import { define } from "../../core/define";
import { NxThread } from "./thread";

define("nx-thread", NxThread);

export { NxThread, THREAD_LABELS } from "./thread";
export {
  THREAD_MAX_TEXT,
  anchorCounts as threadAnchorCounts,
  cleanComment as cleanThreadComment,
  cleanComments as cleanThreadComments,
  decodeDraft as decodeThreadDraft,
  encodeDraft as encodeThreadDraft,
  firstUnread as threadFirstUnread,
  groupThreadByDay,
  mergeComments as mergeThreadComments,
  parseThreadText,
  refPatterns as threadRefPatterns,
  threadDayLabel,
  threadMentions,
  threadPick,
  threadPlainText,
  threadRoot,
} from "./logic";
export type { ThreadDay, ThreadPick, ThreadTrigger } from "./logic";
export type { ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadMentionDetail, ThreadPerson, ThreadPostDetail, ThreadRef, ThreadStreamEvent, ThreadToken, ThreadUser } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-thread": NxThread;
  }
  interface HTMLElementEventMap {
    "nx-thread-post": CustomEvent<import("./types").ThreadPostDetail>;
    "nx-thread-change": CustomEvent<{ comments: import("./types").ThreadComment[] }>;
    "nx-thread-mention": CustomEvent<import("./types").ThreadMentionDetail>;
    "nx-thread-error": CustomEvent<import("./types").ThreadErrorDetail>;
  }
}
