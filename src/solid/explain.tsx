/** `<Explain>` para SolidJS: envuelve `<nx-explain>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/explain/index";
import type { NxExplain } from "../components/explain/explain";
import type { ExplainEvent, ExplainLabels } from "../components/explain/types";

export type { NxExplain, ExplainEvent, ExplainLabels };

export interface ExplainProps extends JSX.HTMLAttributes<NxExplain> {
  /** URL del desglose (eventos en streaming). */
  endpoint?: string;
  method?: "GET" | "POST";
  /** El desglose ya armado, sin servidor. */
  explanation?: ExplainEvent[];
  context?: unknown;
  locale?: string;
  labels?: Partial<ExplainLabels>;
  /** La cifra. */
  children?: JSX.Element;
}

export function Explain(props: ExplainProps): JSX.Element {
  const [local, rest] = splitProps(props, ["endpoint", "method", "explanation", "context", "locale", "labels", "children"]);
  return (
    <nx-explain
      {...rest}
      attr:endpoint={local.endpoint}
      attr:method={local.method}
      attr:locale={local.locale}
      prop:explanation={local.explanation}
      prop:context={local.context}
      prop:labels={local.labels}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-explain>
  );
}
