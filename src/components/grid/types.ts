/**
 * `<nx-grid>`: tipos. Todo es JSON (BDUI): columnas, filas, filtros, orden y agrupación.
 */
export type GridColumnType = "text" | "number" | "money" | "date" | "status";
export type GridTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface GridOption {
  value: string;
  label?: string;
  tone?: GridTone;
}

export interface GridColumn {
  key: string;
  label: string;
  /** Por defecto `text`. `date` espera texto ISO (`2026-03-12`). */
  type?: GridColumnType;
  /** Ancho en px (por defecto según el tipo). */
  width?: number;
  editable?: boolean;
  /** `status`: los valores posibles, con su etiqueta y tono. */
  options?: GridOption[];
  /** `false` para no mostrar el histograma de la cabecera. */
  histogram?: boolean;
  /** Símbolo de `money` (por defecto `$`). */
  currency?: string;
  /** Panel de filtros: `true` la incluye, `false` la excluye (por defecto, las columnas con pocas
   *  opciones distintas). */
  facet?: boolean;
  /** El valor se ve como enlace: un clic (o Enter) emite `nx-grid-open` con la fila. */
  link?: boolean;
  /** Un círculo con las iniciales del valor antes del texto (nombres de personas). */
  avatar?: boolean;
  /** Columna calculada por IA: el backend (`ai-endpoint`) la llena fila por fila. */
  ai?: { prompt: string };
}

export type GridRow = Record<string, unknown>;

/** Un filtro serializable. `range`: `min` incluido, `max` excluido (números o fechas ISO). */
export type GridFilter =
  | { key: string; op: "in"; values: string[] }
  | { key: string; op: "notIn"; values: string[] }
  | { key: string; op: "range"; min?: number | string; max?: number | string }
  | { key: string; op: "contains"; value: string };

export interface GridSort {
  key: string;
  dir: 1 | -1;
}

/** Un histograma de cabecera: `counts` sobre todas las filas, `filtered` tras los filtros. */
export interface GridHistogram {
  kind: "bins" | "categories";
  labels: string[];
  counts: number[];
  filtered: number[];
  /** `bins`: los bordes (n + 1) para armar el filtro `range`. `categories`: los valores. */
  edges?: (number | string)[];
  values?: string[];
}

export interface GridLabels {
  ask: string;
  notUnderstood: string;
  filters: string;
  groupBy: string;
  noGroup: string;
  export: string;
  aiColumn: string;
  aiName: string;
  aiPrompt: string;
  aiAdd: string;
  rows: string;
  of: string;
  cells: string;
  sum: string;
  avg: string;
  min: string;
  max: string;
  total: string;
  clear: string;
  remove: string;
  search: string;
  more: string;
  less: string;
  empty: string;
  selected: string;
  selectedOne: string;
  selectAll: string;
  clearSelection: string;
  selectRow: string;
}

/** Una faceta que manda el backend (modo `source`). */
export interface GridFacetData {
  key: string;
  label: string;
  options: { value: string; label?: string; count: number }[];
}

/** Lo que responde `source`: un bloque de filas y, opcionalmente, los agregados con los filtros aplicados. */
export interface GridPage {
  rows: GridRow[];
  total: number;
  histograms?: Record<string, GridHistogram>;
  facets?: GridFacetData[];
  totals?: Record<string, number>;
}

export interface GridChange {
  id: string;
  key: string;
  value: unknown;
  old: unknown;
}
