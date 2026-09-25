import { define } from "../../core/define";
import { NxKanban } from "./kanban";

define("nx-kanban", NxKanban);

export { NxKanban, KANBAN_LABELS } from "./kanban";
export { boardStep, columnTotals, matchesCard, moveCard as moveKanbanCard, positionOf as kanbanPosition, wipState } from "./logic";
export type { KanbanCard, KanbanColumn, KanbanConfirm, KanbanLabels, KanbanMoveDetail, KanbanOutcome, KanbanTag, KanbanTone, KanbanTotals } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-kanban": NxKanban;
  }
  interface HTMLElementEventMap {
    "nx-kanban-move": CustomEvent<import("./types").KanbanMoveDetail>;
    "nx-kanban-commit": CustomEvent<import("./types").KanbanMoveDetail>;
    "nx-kanban-undo": CustomEvent<import("./types").KanbanMoveDetail>;
    "nx-kanban-add": CustomEvent<{ column: string }>;
    "nx-kanban-open": CustomEvent<{ card: import("./types").KanbanCard }>;
  }
}
