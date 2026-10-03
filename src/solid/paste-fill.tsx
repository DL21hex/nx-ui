/** `<PasteFill>` para SolidJS: envuelve `<nx-paste-fill>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/paste-fill/index";
import type { NxPasteFill } from "../components/paste-fill/paste-fill";
import type { PasteFieldInput, PasteFillDoneDetail, PasteFillLabels } from "../components/paste-fill/types";

export type { NxPasteFill, PasteFieldInput, PasteFillDoneDetail, PasteFillLabels };

export interface PasteFillProps extends JSX.HTMLAttributes<NxPasteFill> {
  /** Enriquece los campos leídos del formulario, por `name` (p. ej. `{ name: "monto", kind: "money" }`). */
  fields?: PasteFieldInput[];
  /** Recibe `POST {text, fields}` y responde con el protocolo en streaming (opcional). */
  endpoint?: string;
  /** Confianza bajo la cual un campo queda «Revisar» (0,8). */
  reviewBelow?: number;
  /** El `id` de un formulario que está en otra parte (sin él, el que envuelve). */
  for?: string;
  locale?: string;
  labels?: Partial<PasteFillLabels>;
  /** Cancelable: no se llena nada. */
  onStart?: (e: CustomEvent<{ text: string }>) => void;
  onDone?: (e: CustomEvent<PasteFillDoneDetail>) => void;
  onUndo?: (e: CustomEvent<{ values: Record<string, string> }>) => void;
  children?: JSX.Element;
}

export function PasteFill(props: PasteFillProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "endpoint", "reviewBelow", "for", "locale", "labels", "onStart", "onDone", "onUndo", "children"]);
  return (
    <nx-paste-fill
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:review-below={local.reviewBelow === undefined ? undefined : String(local.reviewBelow)}
      attr:for={local.for}
      attr:locale={local.locale}
      on:nx-paste-fill-start={(e) => e.target === e.currentTarget && local.onStart?.(e)}
      on:nx-paste-fill-done={(e) => e.target === e.currentTarget && local.onDone?.(e)}
      on:nx-paste-fill-undo={(e) => e.target === e.currentTarget && local.onUndo?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-paste-fill>
  );
}
