/** `<nx-fields>`: tipos. */

/** Cómo se muestra el valor al leer. `text` por defecto. */
export type FieldFormat = "text" | "number" | "money" | "date";

/** El control al editar. Sin `input.type`, sale del formato: `money`, `number`, `date` o `text`. */
export type FieldInputType = "text" | "email" | "tel" | "url" | "number" | "money" | "date" | "select" | "textarea";

export interface FieldOption {
  value: string;
  label?: string;
}

export interface FieldInput {
  type?: FieldInputType;
  /** Para `select`: textos sueltos o `{value, label}`. */
  options?: (string | FieldOption)[];
  required?: boolean;
  placeholder?: string;
  /** Una ayuda debajo del campo («Vacío si es un solo día»). */
  hint?: string;
  /** Filas de un `textarea` (3 por defecto). */
  rows?: number;
}

export interface FieldItem {
  /** La clave del dato: en `values`, en `errors` y en el `name` del campo. Por defecto `f1`, `f2`… */
  key?: string;
  label: string;
  value?: string | number | null;
  /** Ocupa la fila entera (correo, dirección, observaciones). */
  wide?: boolean;
  format?: FieldFormat;
  /** Moneda del monto (ISO, «COP», o un símbolo); si falta, la del componente. */
  currency?: string;
  /** El valor es un enlace (a otro registro). */
  href?: string;
  /** Un botón para copiar el valor (códigos, cuentas, correos). */
  copy?: boolean;
  /** Letra monoespaciada (códigos). */
  mono?: boolean;
  /** Al editar, sigue como texto con un candado: lo que no se cambia aquí. */
  readonly?: boolean;
  /** El control al editar. */
  input?: FieldInput;
}

/** `grid` (por defecto): etiqueta arriba y valor abajo, en columnas. `summary`: una franja de datos clave. */
export type FieldsVariant = "grid" | "summary";

export type FieldValue = string | number | null;

export interface FieldsLabels {
  /** Para el lector de pantalla, en lugar del «—» de un dato vacío. */
  empty: string;
  /** `aria-label` del botón de copiar: «Copiar {label}». */
  copy: string;
  copied: string;
  /** El candado de un dato que no se edita aquí. */
  readonly: string;
  /** La opción vacía de una lista. */
  choose: string;
  required: string;
  email: string;
  number: string;
}

export interface FieldsActionDetail {
  /** El texto del botón de la cabecera que se pulsó. */
  action: string;
}
