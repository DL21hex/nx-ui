/** `<Button>` para SolidJS: envuelve `<nx-button>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/button/index";
import type { NxButton } from "../components/button/button";
import type { ButtonLabels, ButtonVariant, DoneDetail, LogMode } from "../components/button/types";

export type { NxButton, ButtonLabels, ButtonVariant, DoneDetail, LogMode };

/** Sin hijos: el botón lo pinta el componente desde `label` (unos hijos los borraría al adoptarlos). */
export interface ButtonProps extends Omit<JSX.HTMLAttributes<NxButton>, "onClick" | "children"> {
  label: string;
  icon?: string;
  /** Solo el ícono a la vista; `label` queda como nombre accesible y `title`. */
  iconOnly?: boolean;
  variant?: ButtonVariant;
  type?: "button" | "submit" | "reset";
  /** `name` y `value` del botón: viajan en el envío con `type="submit"`. */
  name?: string;
  value?: string;
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
  /** Solo el clic del botón: no llega mientras está ocupado, deshabilitado o sin completar `hold`,
   *  ni desde «Registro». */
  onClick?: (e: MouseEvent) => void;
  onDone?: (e: CustomEvent<DoneDetail>) => void;
  children?: never;
}

/** `onDone` es solo el de este botón: uno que burbujea desde adentro no se toma como propio. */
export function Button(props: ButtonProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "label",
    "icon",
    "iconOnly",
    "variant",
    "type",
    "name",
    "value",
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
    "children",
  ]);
  return (
    <nx-button
      {...rest}
      attr:label={local.label}
      attr:icon={local.icon}
      attr:variant={local.variant}
      attr:type={local.type}
      attr:name={local.name}
      attr:value={local.value}
      attr:log-mode={local.logMode}
      attr:stream={local.stream}
      attr:method={local.method}
      attr:hold={local.hold ? String(local.hold) : undefined}
      bool:icon-only={!!local.iconOnly}
      bool:disabled={!!local.disabled}
      bool:busy={!!local.busy}
      prop:progress={local.progress ?? null}
      prop:labels={local.labels}
      on:click={(e) => local.onClick?.(e)}
      on:nx-button-done={(e) => e.target === e.currentTarget && local.onDone?.(e)}
    />
  );
}
