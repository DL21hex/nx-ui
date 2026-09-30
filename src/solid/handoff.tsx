/** `<Handoff>` para SolidJS: envuelve `<nx-handoff>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/handoff/index";
import type { NxHandoff } from "../components/handoff/handoff";
import type { HandoffDoneDetail, HandoffItemDetail, HandoffKind, HandoffLabels, HandoffPhoneLabels, HandoffSide, HandoffState } from "../components/handoff/types";

export type { NxHandoff, HandoffDoneDetail, HandoffItemDetail, HandoffKind, HandoffLabels, HandoffPhoneLabels, HandoffSide, HandoffState };

export interface HandoffProps extends Omit<JSX.HTMLAttributes<NxHandoff>, "onError"> {
  /** `desktop` (por defecto): botón, QR y escucha. `phone`: la página que abre el QR. */
  side?: HandoffSide;
  /** Base de las rutas de la sesión (`/api/handoff`). Mismo origen o uno de `allowOrigins()`. */
  endpoint: string;
  /** `id` del elemento que recibe: `<nx-doc-capture>`, `<nx-scan>`, `<input type=file>` o un campo de texto. */
  for?: string;
  /** `photo` (por defecto), `file` o `scan`. */
  kind?: HandoffKind;
  accept?: string;
  multiple?: boolean;
  /** Viaja al servidor al crear la sesión (`{ doc: "OC-2291" }`). */
  context?: unknown;
  /** Lado celular: si no vienen, se leen de `?s=` y `?t=`. */
  session?: string;
  token?: string;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<HandoffLabels & HandoffPhoneLabels>;
  onState?: (e: CustomEvent<{ state: HandoffState }>) => void;
  /** Cancelable: con `preventDefault()` no se entrega al destino (la app se encarga). */
  onItem?: (e: CustomEvent<HandoffItemDetail>) => void;
  onDone?: (e: CustomEvent<HandoffDoneDetail>) => void;
  onError?: (e: CustomEvent<{ message: string }>) => void;
}

export function Handoff(props: HandoffProps): JSX.Element {
  const [local, rest] = splitProps(props, ["side", "endpoint", "for", "kind", "accept", "multiple", "context", "session", "token", "disabled", "locale", "labels", "onState", "onItem", "onDone", "onError"]);
  return (
    <nx-handoff
      {...rest}
      prop:context={local.context}
      prop:labels={local.labels}
      attr:side={local.side}
      attr:endpoint={local.endpoint}
      attr:for={local.for}
      attr:kind={local.kind}
      attr:accept={local.accept}
      attr:session={local.session}
      attr:token={local.token}
      attr:locale={local.locale}
      bool:multiple={!!local.multiple}
      bool:disabled={!!local.disabled}
      on:nx-handoff-state={(e) => local.onState?.(e)}
      on:nx-handoff-item={(e) => local.onItem?.(e)}
      on:nx-handoff-done={(e) => local.onDone?.(e)}
      on:nx-handoff-error={(e) => local.onError?.(e)}
    />
  );
}
