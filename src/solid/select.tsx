/** `<Select>` para SolidJS: envuelve `<nx-select>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/select/index";
import type { NxSelect } from "../components/select/select";
import type { SelectChangeDetail, SelectField, SelectLabels, SelectOption } from "../components/select/types";

export type { NxSelect, SelectChangeDetail, SelectField, SelectLabels, SelectOption };

/** Sin hijos: el campo y el panel los pinta el componente. */
export interface SelectProps extends Omit<JSX.HTMLAttributes<NxSelect>, "onChange" | "children"> {
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
  /** Nombre accesible del campo (si no hay un `<label for>` que lo nombre). */
  label?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  avatar?: boolean;
  /** Máximo de resultados a la vista (50). */
  limit?: number;
  labels?: Partial<SelectLabels>;
  /** `nx-select-change`: al elegir, quitar o limpiar. */
  onChange?: (e: CustomEvent<SelectChangeDetail>) => void;
  children?: never;
}

/** `multiple` va antes que `value` y `selection` (el componente ya no depende del orden, pero así
 *  el primer valor se lee entero). `onChange` es solo el de este select, no uno que burbujea. */
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
    "children",
  ]);
  return (
    <nx-select
      {...rest}
      bool:multiple={!!local.multiple}
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
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:clearable={!!local.clearable}
      bool:avatar={!!local.avatar}
      on:nx-select-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
    />
  );
}
