/**
 * Una columna buscable. La primera es la principal (el nombre); las demás van en la línea
 * secundaria, separadas por «·».
 */
export interface SelectField {
  key: string;
  /** Cómo se llama la columna para la persona («Cédula»): sale en «coincide en…». */
  label: string;
  /** `digits`: se compara solo por dígitos (con o sin puntos) y se muestra con separador de miles.
   *  Si la consulta son solo números, se busca únicamente en estas columnas. */
  kind?: "text" | "digits";
}

/** Un registro: `value` y las claves que declaran los `fields`. Serializable en JSON. */
export type SelectOption = { value: string; disabled?: boolean } & Record<string, unknown>;

export interface SelectLabels {
  placeholder: string;
  search: string;
  empty: string;
  loading: string;
  error: string;
  clear: string;
  /** «Buscando solo por {field}» */
  onlyField: string;
  /** «coincide en {fields}» (para lectores de pantalla) */
  matchedIn: string;
}

export interface SelectChangeDetail {
  /** `string` (simple, `""` sin selección) o `string[]` (múltiple). */
  value: string | string[];
  options: SelectOption[];
}
