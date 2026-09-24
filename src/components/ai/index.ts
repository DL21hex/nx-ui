import { define } from "../../core/define";
import { NxAiAnswer } from "./ai-answer";

define("nx-ai-answer", NxAiAnswer);

export { NxAiAnswer, AI_LABELS } from "./ai-answer";
export { parseAiEvent } from "./logic";
export type { AiEvent, AiStep, AiStepStatus, AiTone, AiLabels, AiDoneDetail, AiActionDetail, AiFeedbackDetail } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-ai-answer": NxAiAnswer;
  }
  interface HTMLElementEventMap {
    "nx-ai-start": CustomEvent<{ question: string }>;
    "nx-ai-done": CustomEvent<import("./types").AiDoneDetail>;
    "nx-ai-action": CustomEvent<import("./types").AiActionDetail>;
    "nx-ai-feedback": CustomEvent<import("./types").AiFeedbackDetail>;
  }
}
