/** `<Fields>` para SolidJS: envuelve `<nx-fields>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/fields/index";
import type { NxFields } from "../components/fields/fields";
import type { FieldFormat, FieldInput, FieldInputType, FieldItem, FieldOption, FieldsActionDetail, FieldsLabels, FieldsVariant, FieldValue } from "../components/fields/types";

export type { NxFields, FieldFormat, FieldInput, FieldInputType, FieldItem, FieldOption, FieldsActionDetail, FieldsLabels, FieldsVariant, FieldValue };

export interface FieldsProps extends JSX.HTMLAttributes<NxFields> {
  items?: FieldItem[];
  variant?: FieldsVariant;
  /** Columnas de la rejilla (1 a 4; 2 por defecto). */
  columns?: number;
  heading?: string;
  /** El botón al lado del título («Editar»). */
  action?: string;
  /** Cada valor se vuelve un campo en su sitio. Lee lo escrito con `ref.values`. */
  editing?: boolean;
  /** Errores por clave, debajo de cada campo. */
  errors?: Record<string, string>;
  locale?: string;
  currency?: string;
  labels?: Partial<FieldsLabels>;
  onAction?: (e: CustomEvent<FieldsActionDetail>) => void;
}

export function Fields(props: FieldsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "variant", "columns", "heading", "action", "editing", "errors", "locale", "currency", "labels", "onAction"]);
  return (
    <nx-fields
      {...rest}
      prop:items={local.items}
      prop:errors={local.errors}
      prop:labels={local.labels}
      attr:variant={local.variant}
      attr:columns={local.columns === undefined ? undefined : String(local.columns)}
      attr:heading={local.heading}
      attr:action={local.action}
      attr:locale={local.locale}
      attr:currency={local.currency}
      bool:editing={!!local.editing}
      on:nx-fields-action={(e) => local.onAction?.(e)}
    />
  );
}
