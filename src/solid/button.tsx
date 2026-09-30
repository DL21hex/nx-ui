/** `<Button>` para SolidJS: envuelve `<nx-button>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/button/index";
import type { NxButton } from "../components/button/button";
import type { ButtonLabels, ButtonVariant, DoneDetail, LogMode } from "../components/button/types";

export type { NxButton, ButtonLabels, ButtonVariant, DoneDetail, LogMode };

export interface ButtonProps extends Omit<JSX.HTMLAttributes<NxButton>, "onClick"> {
  label: string;
  icon?: string;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  /** Ocupado: spinner y bloqueo. Para tareas con registro, usa `ref` y `el.run(...)`. */
  busy?: boolean;
  progress?: number | null;
  logMode?: LogMode;
  /** URL que transmite el avance (NDJSON o SSE): el clic corre la tarea solo. */
  stream?: string;
  method?: string;
  labels?: Partial<ButtonLabels>;
  /** Mantener pulsado (ms) para activarlo: para lo destructivo. */
  hold?: number;
  /** No se dispara mientras está ocupado. */
  onClick?: (e: MouseEvent) => void;
  onDone?: (e: CustomEvent<DoneDetail>) => void;
}

export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "label",
    "icon",
    "variant",
    "type",
    "disabled",
    "busy",
    "progress",
    "logMode",
    "stream",
    "method",
    "labels",
    "hold",
    "onClick",
    "onDone",
  ]);
  return (
    <nx-button
      {...rest}
      attr:label={local.label}
      attr:icon={local.icon}
      attr:variant={local.variant}
      attr:type={local.type}
      attr:log-mode={local.logMode}
      attr:stream={local.stream}
      attr:method={local.method}
      attr:hold={local.hold ? String(local.hold) : undefined}
      bool:disabled={!!local.disabled}
      bool:busy={!!local.busy}
      prop:progress={local.progress ?? null}
      prop:labels={local.labels}
      on:click={(e) => local.onClick?.(e)}
      on:nx-done={(e) => local.onDone?.(e)}
    />
  );
}
