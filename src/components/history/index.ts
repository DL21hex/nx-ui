import { define } from "../../core/define";
import { NxHistory } from "./history";

define("nx-history", NxHistory);

export { NxHistory, HISTORY_LABELS } from "./history";
export { stateAt as historyStateAt, wordDiff, revertChange, cleanEvents as cleanHistoryEvents } from "./logic";
export type { DiffPart, HistoryFilter } from "./logic";
export type { HistoryAction, HistoryActor, HistoryChange, HistoryCommitDetail, HistoryEvent, HistoryField, HistoryFieldType, HistoryLabels, HistoryPage, HistoryRevertDetail, HistoryTone, HistoryValue } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-history": NxHistory;
  }
  interface HTMLElementEventMap {
    "nx-history-revert": CustomEvent<import("./types").HistoryRevertDetail>;
    "nx-history-commit": CustomEvent<import("./types").HistoryCommitDetail>;
    "nx-history-comment": CustomEvent<{ text: string }>;
    "nx-history-travel": CustomEvent<{ id: string | null; record: Record<string, import("./types").HistoryValue> }>;
  }
}
