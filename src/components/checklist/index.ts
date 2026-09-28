import { define } from "../../core/define";
import { NxChecklist } from "./checklist";

define("nx-checklist", NxChecklist);

export { NxChecklist, CHECKLIST_LABELS } from "./checklist";
export {
  checklistAgo,
  checklistBlankEvidence,
  checklistBlocks,
  checklistDeps,
  checklistDueText,
  checklistDueTime,
  checklistInRange,
  checklistLogFromState,
  checklistMissing,
  checklistNeedsNote,
  checklistOptions,
  checklistOverdue,
  checklistProgress,
  checklistResolved,
  cleanChecklistItems,
  cleanChecklistLog,
  cleanChecklistState,
  cleanChecklistSteps,
} from "./logic";
export type { ChecklistDueLabels, ChecklistSequence, ChecklistSort } from "./logic";
export type {
  ChecklistAction,
  ChecklistChangeDetail,
  ChecklistClosed,
  ChecklistCompleteDetail,
  ChecklistData,
  ChecklistErrorDetail,
  ChecklistEvidence,
  ChecklistEvidenceSpec,
  ChecklistEvidenceType,
  ChecklistFile,
  ChecklistLabels,
  ChecklistLogEntry,
  ChecklistMissing,
  ChecklistMode,
  ChecklistOpenDetail,
  ChecklistOption,
  ChecklistPendingChange,
  ChecklistPerson,
  ChecklistProgress,
  ChecklistState,
  ChecklistStatus,
  ChecklistStep,
  ChecklistStepState,
  ChecklistSummaryItem,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-checklist": NxChecklist;
  }
  interface HTMLElementEventMap {
    "nx-checklist-change": CustomEvent<import("./types").ChecklistChangeDetail>;
    "nx-checklist-complete": CustomEvent<import("./types").ChecklistCompleteDetail>;
    "nx-checklist-open": CustomEvent<import("./types").ChecklistOpenDetail>;
    "nx-checklist-error": CustomEvent<import("./types").ChecklistErrorDetail>;
  }
}
