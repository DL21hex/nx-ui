import { define } from "../../core/define";
import { NxAgent } from "./agent";

define("nx-agent", NxAgent);

export { NxAgent, AGENT_LABELS } from "./agent";
export { GRID_TOOLS, UI_TOOLS, applyPatch, parseAguiEvent } from "./logic";
export { nxTour, TOUR_LABELS } from "../tour/index";
export type { TourLabels, TourResult, TourStep } from "../tour/types";
export type { AgentLabels, AgentToolDetail, AguiContext, AguiEvent, AguiMessage, AguiTool, AguiToolCall, PatchOp, RunAgentInput } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-agent": NxAgent;
  }
  interface HTMLElementEventMap {
    "nx-agent-tool": CustomEvent<import("./types").AgentToolDetail>;
    "nx-agent-send": CustomEvent<{ input: import("./types").RunAgentInput }>;
    "nx-agent-state": CustomEvent<{ state: unknown }>;
    "nx-agent-custom": CustomEvent<{ name: string; value: unknown }>;
    "nx-agent-event": CustomEvent<import("./types").AguiEvent>;
  }
}
