/** `<Checklist>` para SolidJS: envuelve `<nx-checklist>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/checklist/index";
import type { NxChecklist } from "../components/checklist/checklist";
import type { ChecklistSequence } from "../components/checklist/logic";
import type { ChecklistChangeDetail, ChecklistCompleteDetail, ChecklistErrorDetail, ChecklistLabels, ChecklistMode, ChecklistOpenDetail, ChecklistPerson, ChecklistState, ChecklistStep, ChecklistSummaryItem } from "../components/checklist/types";

export type { NxChecklist, ChecklistChangeDetail, ChecklistCompleteDetail, ChecklistErrorDetail, ChecklistLabels, ChecklistMode, ChecklistOpenDetail, ChecklistPerson, ChecklistState, ChecklistStep, ChecklistSummaryItem };

export interface ChecklistProps extends Omit<JSX.HTMLAttributes<NxChecklist>, "onChange" | "onError"> {
  /** Los pasos: `{id, title, hint?, section?, assignee?, due?, required?, evidence?, dependsOn?, canSkip?}`. */
  steps?: ChecklistStep[];
  /** El estado por `id`. Sin él (y con `endpoint`), `GET {endpoint}`. */
  state?: ChecklistState;
  endpoint?: string;
  /** Quien usa la pantalla: el «por» de cada paso. */
  me?: ChecklistPerson | null;
  /** `true`: todo en orden; una lista: solo esas secciones. */
  sequential?: boolean | string[];
  /** La base de `<nx-handoff>`: «Tomar con el celular» en las fotos. */
  handoff?: string;
  mode?: ChecklistMode;
  items?: ChecklistSummaryItem[];
  heading?: string;
  readonly?: boolean;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<ChecklistLabels>;
  onChange?: (e: CustomEvent<ChecklistChangeDetail>) => void;
  /** Cancelable: cancelarlo no cierra el procedimiento. */
  onComplete?: (e: CustomEvent<ChecklistCompleteDetail>) => void;
  /** `mode="summary"`, cancelable (cancelarlo no sigue el `href`). */
  onOpen?: (e: CustomEvent<ChecklistOpenDetail>) => void;
  onError?: (e: CustomEvent<ChecklistErrorDetail>) => void;
}

export function Checklist(props: ChecklistProps): JSX.Element {
  const [local, rest] = splitProps(props, ["steps", "state", "endpoint", "me", "sequential", "handoff", "mode", "items", "heading", "readonly", "disabled", "locale", "labels", "onChange", "onComplete", "onOpen", "onError"]);
  return (
    <nx-checklist
      {...rest}
      prop:steps={local.steps}
      prop:state={local.state}
      prop:me={local.me}
      prop:items={local.items}
      prop:labels={local.labels}
      prop:sequential={local.sequential}
      attr:endpoint={local.endpoint}
      attr:handoff={local.handoff}
      attr:mode={local.mode}
      attr:heading={local.heading}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      on:nx-checklist-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
      on:nx-checklist-complete={(e) => e.target === e.currentTarget && local.onComplete?.(e)}
      on:nx-checklist-open={(e) => e.target === e.currentTarget && local.onOpen?.(e)}
      on:nx-checklist-error={(e) => e.target === e.currentTarget && local.onError?.(e)}
    />
  );
}
