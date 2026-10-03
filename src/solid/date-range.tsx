/** `<DateRange>` para SolidJS: envuelve `<nx-date-range>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/date-range/index";
import type { NxDateRange } from "../components/date-range/date-range";
import type { DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePresetInput, DateRangeValue } from "../components/date-range/types";
import type { OpenChangeDetail } from "../components/sidemenu/types";

export type { NxDateRange, DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePresetInput, DateRangeValue };

export interface DateRangeProps extends Omit<JSX.HTMLAttributes<NxDateRange>, "onChange"> {
  /** `{start, end}` (ISO) o «2026-07-01/2026-09-30». Sin él, `start`/`end` o `phrase` dan el inicial. */
  value?: DateRangeValue | string | null;
  start?: string;
  end?: string;
  /** Valor inicial como frase: «este trimestre», «últimos 30 días». */
  phrase?: string;
  /** Atajos: frases o `{label, phrase | start + end}`. */
  presets?: DateRangePresetInput[];
  /** `previous`, `year` o `none` (la opción visible sin comparar). Sin él no se ofrece comparar. */
  compare?: DateRangeCompare | "none";
  min?: string;
  max?: string;
  today?: string;
  /** Mes en que empieza el año fiscal (1–12). */
  fiscalStart?: number;
  /** Primer día de la semana, 1 (lunes) … 7 (domingo). */
  weekStart?: number;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Nombre accesible del campo. */
  label?: string;
  locale?: string;
  labels?: Partial<DateRangeLabels>;
  onChange?: (e: CustomEvent<DateRangeChangeDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

export function DateRange(props: DateRangeProps): JSX.Element {
  const [local, rest] = splitProps(props, ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "placeholder", "label", "locale", "labels", "onChange", "onOpenChange"]);
  return (
    <nx-date-range
      {...rest}
      prop:value={local.value}
      prop:presets={local.presets}
      prop:labels={local.labels}
      attr:start={local.start}
      attr:end={local.end}
      attr:phrase={local.phrase}
      attr:compare={local.compare}
      attr:min={local.min}
      attr:max={local.max}
      attr:today={local.today}
      attr:fiscal-start={local.fiscalStart === undefined ? undefined : String(local.fiscalStart)}
      attr:week-start={local.weekStart === undefined ? undefined : String(local.weekStart)}
      attr:name={local.name}
      attr:placeholder={local.placeholder}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      on:nx-date-range-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    />
  );
}
