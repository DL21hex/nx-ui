import { define } from "../../core/define";
import { NxFields } from "./fields";

define("nx-fields", NxFields);

export { NxFields, FIELDS_LABELS } from "./fields";
export type { FieldFormat, FieldInput, FieldInputType, FieldItem, FieldOption, FieldsActionDetail, FieldsLabels, FieldsVariant, FieldValue } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-fields": NxFields;
  }
  interface HTMLElementEventMap {
    "nx-fields-action": CustomEvent<import("./types").FieldsActionDetail>;
  }
}
