/** `<Select>` para SolidJS: envuelve `<nx-select>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/select/index";
import type { NxSelect } from "../components/select/select";
import type { SelectChangeDetail, SelectField, SelectLabels, SelectOption } from "../components/select/types";

export type { NxSelect, SelectChangeDetail, SelectField, SelectLabels, SelectOption };

export interface SelectProps extends Omit<JSX.HTMLAttributes<NxSelect>, "onChange"> {
  /** Columnas buscables; la primera es la principal. */
  fields: SelectField[];
  /** Registros locales. Para catálogos grandes, `source`. */
  options?: SelectOption[];
  /** URL de búsqueda en el servidor (`?q=`). */
  source?: string;
  value?: string | string[];
  /** Registros elegidos (con `source`, para pintar la selección inicial). */
  selection?: SelectOption[];
  multiple?: boolean;
  placeholder?: string;
  /** Nombre accesible del campo. */
  label?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  avatar?: boolean;
  /** Máximo de resultados a la vista (50). */
  limit?: number;
  labels?: Partial<SelectLabels>;
  onChange?: (e: CustomEvent<SelectChangeDetail>) => void;
}

export function Select(props: SelectProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "fields",
    "options",
    "source",
    "value",
    "selection",
    "multiple",
    "placeholder",
    "label",
    "name",
    "required",
    "disabled",
    "clearable",
    "avatar",
    "limit",
    "labels",
    "onChange",
  ]);
  return (
    <nx-select
      {...rest}
      prop:fields={local.fields}
      prop:options={local.options ?? []}
      prop:value={local.value}
      prop:selection={local.selection}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:placeholder={local.placeholder}
      attr:label={local.label}
      attr:name={local.name}
      attr:limit={local.limit === undefined ? undefined : String(local.limit)}
      bool:multiple={!!local.multiple}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:clearable={!!local.clearable}
      bool:avatar={!!local.avatar}
      on:nx-change={(e) => local.onChange?.(e as CustomEvent<SelectChangeDetail>)}
    />
  );
}
