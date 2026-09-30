/** `<Guard>` para SolidJS: envuelve `<nx-guard>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/guard/index";
import type { NxGuard } from "../components/guard/guard";
import type { GuardFields, GuardFinding, GuardLabels, GuardMode } from "../components/guard/types";

export type { NxGuard, GuardFields, GuardFinding, GuardLabels, GuardMode };

export interface GuardProps extends JSX.HTMLAttributes<NxGuard> {
  /** La configuración por `name`: `{precio: {history: [...], format: "money", currency: "COP"}}`. */
  fields?: GuardFields;
  /** `warn` (por defecto: nunca bloquea) o `confirm` (el primer envío con avisos se detiene). */
  mode?: GuardMode;
  /** Recibe `POST {field, value, values}` y responde `{findings: [...]}` (opcional). */
  endpoint?: string;
  locale?: string;
  labels?: Partial<GuardLabels>;
  disabled?: boolean;
  onWarn?: (e: CustomEvent<{ field: string; finding: GuardFinding }>) => void;
  onFix?: (e: CustomEvent<{ field: string; from: number | string | null; to: number | string }>) => void;
  onAck?: (e: CustomEvent<{ field: string; value: number | string | null }>) => void;
  /** Cancelable: cancelarlo deja pasar el envío. */
  onBlock?: (e: CustomEvent<{ findings: GuardFinding[] }>) => void;
  children?: JSX.Element;
}

export function Guard(props: GuardProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "mode", "endpoint", "locale", "labels", "disabled", "onWarn", "onFix", "onAck", "onBlock", "children"]);
  return (
    <nx-guard
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:endpoint={local.endpoint}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-guard-warn={(e) => local.onWarn?.(e)}
      on:nx-guard-fix={(e) => local.onFix?.(e)}
      on:nx-guard-ack={(e) => local.onAck?.(e)}
      on:nx-guard-block={(e) => local.onBlock?.(e)}
    >
      {local.children}
    </nx-guard>
  );
}
