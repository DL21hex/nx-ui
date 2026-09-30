/** `<AIAnswer>` para SolidJS: envuelve `<nx-ai-answer>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/ai/index";
import type { NxAiAnswer } from "../components/ai/ai-answer";
import type { AiActionDetail, AiDoneDetail, AiEvent, AiFeedbackDetail, AiLabels } from "../components/ai/types";

export type { NxAiAnswer, AiActionDetail, AiDoneDetail, AiEvent, AiFeedbackDetail, AiLabels };

export interface AIAnswerProps extends JSX.HTMLAttributes<NxAiAnswer> {
  /** URL que responde con el protocolo de streaming de nx-ui (POST `{question, context}`). */
  endpoint?: string;
  method?: string;
  /** Pregunta inicial; con `endpoint`, se pregunta al montar. */
  question?: string;
  placeholder?: string;
  suggestions?: string[];
  /** Datos que viajan con cada pregunta (el registro que se está viendo…). */
  context?: unknown;
  feedback?: boolean;
  labels?: Partial<AiLabels>;
  onDone?: (e: CustomEvent<AiDoneDetail>) => void;
  onAction?: (e: CustomEvent<AiActionDetail>) => void;
  onFeedback?: (e: CustomEvent<AiFeedbackDetail>) => void;
}

export function AIAnswer(props: AIAnswerProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "endpoint",
    "method",
    "question",
    "placeholder",
    "suggestions",
    "context",
    "feedback",
    "labels",
    "onDone",
    "onAction",
    "onFeedback",
  ]);
  return (
    <nx-ai-answer
      {...rest}
      attr:endpoint={local.endpoint}
      attr:method={local.method}
      attr:question={local.question}
      attr:placeholder={local.placeholder}
      prop:suggestions={local.suggestions}
      prop:context={local.context}
      prop:labels={local.labels}
      bool:feedback={!!local.feedback}
      on:nx-ai-done={(e) => local.onDone?.(e)}
      on:nx-ai-action={(e) => local.onAction?.(e)}
      on:nx-ai-feedback={(e) => local.onFeedback?.(e)}
    />
  );
}
