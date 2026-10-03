/** `<Survey>` para SolidJS: envuelve `<nx-survey>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/survey/index";
import type { NxSurvey } from "../components/survey/survey";
import type { SurveyAnswers, SurveyLabels, SurveyQuestionInput, SurveyResults, SurveySubmitDetail } from "../components/survey/types";

export type { NxSurvey, SurveyAnswers, SurveyLabels, SurveyQuestionInput, SurveyResults, SurveySubmitDetail };

export interface SurveyProps extends Omit<JSX.HTMLAttributes<NxSurvey>, "onSubmit" | "onChange" | "children"> {
  questions: SurveyQuestionInput[];
  heading?: string;
  description?: string;
  /** Recibe `POST {answers, ms}`; puede responder con los resultados. */
  action?: string;
  /** Clave de `localStorage` para el borrador. */
  storage?: string;
  results?: SurveyResults | null;
  /** Respuestas precargadas `{id: valor}`. */
  answers?: SurveyAnswers;
  locale?: string;
  labels?: Partial<SurveyLabels>;
  /** Cancelable: no se envía a `action`. */
  onSubmit?: (e: CustomEvent<SurveySubmitDetail>) => void;
  onChange?: (e: CustomEvent<{ id: string; value: unknown; answers: SurveyAnswers }>) => void;
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function Survey(props: SurveyProps): JSX.Element {
  const [local, rest] = splitProps(props, ["questions", "heading", "description", "action", "storage", "results", "answers", "locale", "labels", "onSubmit", "onChange", "children"]);
  return (
    <nx-survey
      {...rest}
      prop:questions={local.questions}
      prop:results={local.results}
      prop:answers={local.answers}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:description={local.description}
      attr:action={local.action}
      attr:storage={local.storage}
      attr:locale={local.locale}
      on:nx-survey-submit={(e) => e.target === e.currentTarget && local.onSubmit?.(e)}
      on:nx-survey-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
    />
  );
}
