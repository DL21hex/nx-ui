/** `<Recurrence>` para SolidJS: envuelve `<nx-recurrence>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/recurrence/index";
import type { NxRecurrence } from "../components/recurrence/recurrence";
import type { RecurrenceChangeDetail, RecurrenceErrorDetail, RecurrenceHolidayMode, RecurrenceLabels, RecurrenceRule, RecurrenceValue, RecurrenceValueFormat } from "../components/recurrence/types";

export type { NxRecurrence, RecurrenceChangeDetail, RecurrenceErrorDetail, RecurrenceHolidayMode, RecurrenceLabels, RecurrenceRule, RecurrenceValue, RecurrenceValueFormat };

export interface RecurrenceProps extends Omit<JSX.HTMLAttributes<NxRecurrence>, "onChange" | "onError" | "children"> {
  /** Una frase («los lunes a las 8») o una RRULE. */
  value?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  /** Desde cuándo (ISO); por defecto hoy. */
  start?: string;
  /** Festivos propios (ISO), sumados a los de Colombia o en su lugar. */
  holidays?: string[];
  holidaysMode?: "add" | "replace";
  /** Cuántas próximas fechas mostrar (5). */
  count?: number;
  valueFormat?: RecurrenceValueFormat;
  label?: string;
  locale?: string;
  labels?: Partial<RecurrenceLabels>;
  /** Al confirmar lo escrito o cambiar un control: `{value, rrule, text, next}`. */
  onChange?: (e: CustomEvent<RecurrenceChangeDetail>) => void;
  onError?: (e: CustomEvent<RecurrenceErrorDetail>) => void;
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function Recurrence(props: RecurrenceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["value", "name", "required", "disabled", "readonly", "start", "holidays", "holidaysMode", "count", "valueFormat", "label", "locale", "labels", "onChange", "onError", "children"]);
  return (
    <nx-recurrence
      {...rest}
      prop:value={local.value}
      prop:holidays={local.holidays}
      prop:labels={local.labels}
      attr:name={local.name}
      attr:start={local.start}
      attr:holidays-mode={local.holidaysMode}
      attr:count={local.count === undefined ? undefined : String(local.count)}
      attr:value-format={local.valueFormat}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:readonly={!!local.readonly}
      on:nx-recurrence-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
      on:nx-recurrence-error={(e) => e.target === e.currentTarget && local.onError?.(e)}
    />
  );
}
