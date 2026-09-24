import { define } from "../../core/define";
import { NxExplain } from "./explain";

define("nx-explain", NxExplain);

export { NxExplain, EXPLAIN_LABELS } from "./explain";
export { parseExplainEvent, applyEvent as applyExplainEvent, balance as explainBalance } from "./logic";
export type { ExplainEvent, ExplainFormat, ExplainLabels, ExplainNumber, ExplainOp, ExplainState, ExplainTerm, ExplainTone } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-explain": NxExplain;
  }
}
