import { define } from "../../core/define";
import { NxSurvey } from "./survey";

define("nx-survey", NxSurvey);

export { NxSurvey, SURVEY_LABELS } from "./survey";
export { aggregate as aggregateSurvey, npsOf, answerText, echoOf as surveyEcho, interpolate as interpolateSurvey, visibleQuestions } from "./logic";
export type { SurveyEcho } from "./logic";
export type { SurveyAnswer, SurveyAnswers, SurveyCondition, SurveyLabels, SurveyLayout, SurveyOption, SurveyQuestion, SurveyQuestionInput, SurveyQuestionResult, SurveyResults, SurveySubmitDetail, SurveyType } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-survey": NxSurvey;
  }
  interface HTMLElementEventMap {
    "nx-survey-submit": CustomEvent<import("./types").SurveySubmitDetail>;
    "nx-survey-change": CustomEvent<{ id: string; value: import("./types").SurveyAnswer | undefined; answers: import("./types").SurveyAnswers }>;
  }
}
