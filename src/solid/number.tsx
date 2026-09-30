/** `<NumberInput>` para SolidJS: envuelve `<nx-number>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/number/index";
import type { NxNumber } from "../components/number/number";
import type { NumberAlign, NumberChangeDetail, NumberFormat, NumberLabels } from "../components/number/types";

export type { NxNumber, NumberAlign, NumberChangeDetail, NumberFormat, NumberLabels };

export interface NumberInputProps extends Omit<JSX.HTMLAttributes<NxNumber>, "onChange" | "onInput"> {
  /** `number | null`. En `percent`, la fracción (0,19 es 19 %). */
  value?: number | null;
  format?: NumberFormat;
  /** Con `money`: ISO («COP», «USD») o un símbolo («$»). */
  currency?: string;
  decimals?: number;
  min?: number;
  max?: number;
  /** Lo que suman ↑/↓, en las unidades que se ven (puntos en `percent`). */
  step?: number;
  /** El monto en letras debajo, para cheques y documentos. */
  words?: boolean;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  align?: NumberAlign;
  /** Nombre accesible (si no hay un `<label>`). */
  label?: string;
  locale?: string;
  labels?: Partial<NumberLabels>;
  /** Mientras se escribe, cada vez que cambia el número (`e.currentTarget.value`). */
  onInput?: (e: Event & { currentTarget: NxNumber }) => void;
  /** Al confirmar (salir o Enter): `{value, text}`. */
  onChange?: (e: CustomEvent<NumberChangeDetail>) => void;
}

export function NumberInput(props: NumberInputProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "value",
    "format",
    "currency",
    "decimals",
    "min",
    "max",
    "step",
    "words",
    "name",
    "required",
    "disabled",
    "readonly",
    "placeholder",
    "align",
    "label",
    "locale",
    "labels",
    "onInput",
    "onChange",
  ]);
  const str = (n: number | undefined) => (n === undefined ? undefined : String(n));
  return (
    <nx-number
      {...rest}
      prop:value={local.value}
      prop:labels={local.labels}
      attr:format={local.format}
      attr:currency={local.currency}
      attr:decimals={str(local.decimals)}
      attr:min={str(local.min)}
      attr:max={str(local.max)}
      attr:step={str(local.step)}
      attr:name={local.name}
      attr:placeholder={local.placeholder}
      attr:align={local.align}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:words={!!local.words}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:readonly={!!local.readonly}
      on:input={(e) => local.onInput?.(e as unknown as Event & { currentTarget: NxNumber })}
      on:nx-change={(e) => local.onChange?.(e as unknown as CustomEvent<NumberChangeDetail>)}
    />
  );
}
