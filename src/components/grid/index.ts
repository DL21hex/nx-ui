import { define } from "../../core/define";
import { NxGrid } from "./grid";

define("nx-grid", NxGrid);

export { NxGrid, GRID_LABELS } from "./grid";
export { applyFilters, crossfilter, filterLabel, formatCell, parseTSV, sortRows, toTSV } from "./logic";
export { parseNL } from "./nl";
export type {
  GridChange,
  GridChangeSource,
  GridColumn,
  GridColumnType,
  GridFacetData,
  GridFilter,
  GridHistogram,
  GridLabels,
  GridOption,
  GridPage,
  GridRow,
  GridSort,
  GridTone,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-grid": NxGrid;
  }
  interface HTMLElementEventMap {
    "nx-grid-filter": CustomEvent<{ filters: import("./types").GridFilter[]; sort: import("./types").GridSort | null; groupBy: string; count: number }>;
    "nx-grid-change": CustomEvent<{ changes: import("./types").GridChange[]; source: import("./types").GridChangeSource }>;
    "nx-grid-columns": CustomEvent<{ columns: import("./types").GridColumn[] }>;
    "nx-grid-selection": CustomEvent<{ ids: string[]; count: number }>;
    "nx-grid-open": CustomEvent<{ id: string; row: import("./types").GridRow; key: string; origin: HTMLElement | null }>;
  }
}
