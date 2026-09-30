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
  /** `false` para no mostrar las barras en el filtro de la columna (montos, números y fechas). */
  histogram?: boolean;
  /** Filtro de la columna (el embudo de la cabecera). Por defecto sale del tipo: montos y números
   *  → rango, fechas → fechas, estados y texto con pocos valores → lista, el resto → «contiene».
   *  Un valor lo fuerza; `false` lo quita. */
  filter?: false | "list" | "range" | "date" | "text";
  /** Símbolo de `money` (por defecto `$`). */
  currency?: string;
  /** Panel de filtros: `true` la incluye, `false` la excluye (por defecto, las columnas con pocas
   *  opciones distintas). */
  facet?: boolean;
  /** El valor se ve como enlace: un clic (o Enter) emite `nx-grid-open` con la fila. */
  link?: boolean;
  /** Un círculo con las iniciales del valor antes del texto (nombres de personas). */
  avatar?: boolean;
}

export type GridRow = Record<string, unknown>;

/** Un tramo de fechas relativo a hoy: al asignar los filtros (una vista guardada, otro día), `min`
 *  y `max` se recalculan. */
export type GridDateRel = "past" | "last30" | "next30" | "month" | "lastMonth" | "year";

/** Un filtro serializable. `range`: `min` incluido, `max` excluido (números o fechas ISO). */
export type GridFilter =
  | { key: string; op: "in"; values: string[] }
  | { key: string; op: "notIn"; values: string[] }
  | { key: string; op: "range"; min?: number | string; max?: number | string; rel?: GridDateRel }
  | { key: string; op: "contains"; value: string };

export interface GridSort {
  key: string;
  dir: 1 | -1;
}

/** Las barras del filtro de una columna: `counts` sobre todas las filas, `filtered` tras los filtros. */
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
  filters: string;
  groupBy: string;
  noGroup: string;
  export: string;
  exporting: string;
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
  searchTable: string;
  clearSearch: string;
  more: string;
  less: string;
  empty: string;
  loading: string;
  presets: string;
  selected: string;
  selectedOne: string;
  selectAll: string;
  clearSelection: string;
  selectRow: string;
  undo: string;
  redo: string;
  undone: string;
  redone: string;
  views: string;
  columns: string;
  saveView: string;
  resize: string;
  gone: string;
  filterBy: string;
  filterOn: string;
  left: string;
  done: string;
  reset: string;
  allValues: string;
  allMatching: string;
  only: string;
  onlyValue: string;
  exceptValue: string;
  searchIn: string;
  enterOnly: string;
  noValues: string;
  from: string;
  to: string;
  fromValue: string;
  toValue: string;
  noMin: string;
  noMax: string;
  amountHint: string;
  anyDate: string;
  between: string;
  past: string;
  last30: string;
  next30: string;
  month: string;
  lastMonth: string;
  year: string;
  barHint: string;
  contains: string;
  containsHint: string;
  containsValue: string;
  matches: string;
  moreFilters: string;
  relax: string;
}

/** Una faceta que manda el backend (modo `source`). */
export interface GridFacetData {
  key: string;
  label: string;
  options: { value: string; label?: string; count: number }[];
}

/** Un atajo: un filtro con nombre, en una tarjeta con su conteo sobre la tabla («Contratos que
 *  vencen · 12»). Tocarla aplica sus filtros; otra vez, vuelve a los de antes. */
export interface GridPreset {
  id: string;
  label: string;
  /** Una línea corta bajo el nombre: «próximos 30 días». */
  hint?: string;
  /** Todos los filtros del atajo (reemplazan a los que haya). Un tramo con `rel` se recalcula cada día. */
  filters: GridFilter[];
}

/** Lo que responde `source`: un bloque de filas y, opcionalmente, los agregados con los filtros aplicados. */
export interface GridPage {
  rows: GridRow[];
  total: number;
  histograms?: Record<string, GridHistogram>;
  facets?: GridFacetData[];
  /** Cuántas filas deja cada atajo (`GridPreset.id` → conteo), sobre todos los datos, no sobre lo filtrado. */
  presets?: Record<string, number>;
  totals?: Record<string, number>;
}

/** De dónde viene un cambio (en `nx-grid-change`). */
export type GridChangeSource = "edit" | "paste" | "delete" | "undo" | "redo";

export interface GridChange {
  id: string;
  key: string;
  value: unknown;
  old: unknown;
}

/** El estado de la tabla que se puede guardar: filtros, orden, agrupación, columnas ocultas y anchos. */
export interface GridView {
  filters: GridFilter[];
  sort: GridSort | null;
  groupBy: string;
  /** Las columnas ocultas (por `key`). */
  hidden: string[];
  /** Los anchos que eligió la persona, en px (por `key`). */
  widths: Record<string, number>;
}

/** Una vista guardada con nombre (`views-storage`). */
export interface GridSavedView extends GridView {
  id: string;
  name: string;
  /** Se aplica al abrir la tabla (solo una puede tenerlo). */
  default?: boolean;
}

/** Los textos del menú de vistas y del selector de columnas (se cargan con ellos). */
export interface GridViewLabels {
  viewModified: string;
  viewEmpty: string;
  viewSaveNew: string;
  viewSaveChanges: string;
  viewEdit: string;
  viewDelete: string;
  viewDeleteYes: string;
  viewReset: string;
  viewName: string;
  viewDefault: string;
  viewSave: string;
  viewCancel: string;
  viewDuplicate: string;
  viewConfirm: string;
  viewUntitled: string;
  columnsTitle: string;
  columnsReset: string;
  columnsHint: string;
}
