import { define } from "../../core/define";
import { NxPlanner } from "./planner";

define("nx-planner", NxPlanner);

export { NxPlanner, PLANNER_LABELS } from "./planner";
export {
  addDays as plannerAddDays,
  cleanBookings as cleanPlannerBookings,
  cleanResources as cleanPlannerResources,
  plannerClashes,
  plannerColumns,
  plannerHours,
  plannerISO,
  plannerLanes,
  plannerMove,
  plannerOccupancy,
  plannerParse,
  plannerRange,
  plannerResize,
  plannerSnap,
  plannerSpan,
  plannerStep,
  plannerTime,
  plannerX,
} from "./logic";
export type { PlannerColumn, PlannerItem, Span as PlannerSpan } from "./logic";
export type { PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerDeleteDetail, PlannerLabels, PlannerPlace, PlannerRangeDetail, PlannerResource, PlannerStatus, PlannerView, PlannerVia } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-planner": NxPlanner;
  }
  interface HTMLElementEventMap {
    "nx-planner-change": CustomEvent<import("./types").PlannerChangeDetail>;
    "nx-planner-create": CustomEvent<import("./types").PlannerCreateDetail>;
    "nx-planner-delete": CustomEvent<import("./types").PlannerDeleteDetail>;
    "nx-planner-select": CustomEvent<{ booking: import("./types").PlannerBooking }>;
    "nx-planner-range": CustomEvent<import("./types").PlannerRangeDetail>;
  }
}
