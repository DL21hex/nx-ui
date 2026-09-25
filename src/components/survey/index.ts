import { define } from "../../core/define";
import { NxSurvey } from "./survey";

define("nx-survey", NxSurvey);

export { NxSurvey, SURVEY_LABELS } from "./survey";
export { aggregate as aggregateSurvey, npsOf, answerText, interpolate as interpolateSurvey, visibleQuestions } from "./logic";
export type { SurveyAnswer, SurveyAnswers, SurveyCondition, SurveyLabels, SurveyOption, SurveyQuestion, SurveyQuestionInput, SurveyQuestionResult, SurveyResults, SurveySubmitDetail, SurveyType } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-survey": NxSurvey;
  }
  interface HTMLElementEventMap {
    "nx-survey-submit": CustomEvent<import("./types").SurveySubmitDetail>;
    "nx-survey-change": CustomEvent<{ id: string; value: import("./types").SurveyAnswer | undefined; answers: import("./types").SurveyAnswers }>;
  }
}
