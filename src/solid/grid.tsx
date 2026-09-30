/** `<Grid>` para SolidJS: envuelve `<nx-grid>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/grid/index";
import type { NxGrid } from "../components/grid/grid";
import type { GridChange, GridColumn, GridFilter, GridLabels, GridRow, GridSort } from "../components/grid/types";
import type { GridFilterDetail } from "./jsx";

export type { NxGrid, GridChange, GridColumn, GridFilter, GridLabels, GridRow, GridSort };

export interface GridProps extends Omit<JSX.HTMLAttributes<NxGrid>, "onChange"> {
  columns: GridColumn[];
  /** Filas en el cliente. Sin `source`, se filtra, ordena y agrega aquí. */
  rows?: GridRow[];
  /** URL de datos en el servidor (POST `{offset, limit, sort, filters}` → `GridPage`). */
  source?: string;
  /** Con `source`: si la consulta completa tiene hasta este tanto de filas, se trae una vez y se filtra en el cliente. */
  clientMax?: number;
  /** URL que calcula las columnas de IA. Sin ella no aparece «Columna IA». */
  aiEndpoint?: string;
  /** URL opcional para frases que el analizador local no entiende. */
  nlEndpoint?: string;
  filters?: GridFilter[];
  sort?: GridSort | null;
  groupBy?: string;
  rowKey?: string;
  facetsOpen?: boolean;
  /** Casillas para seleccionar filas; las acciones van como hijo con `slot="bulk"`. */
  selectable?: boolean;
  selected?: string[];
  height?: number;
  filename?: string;
  /** Formato de números, montos, fechas y orden (`es-CO`, `en-US`…). Por defecto, el `lang` de la página. */
  locale?: string;
  labels?: Partial<GridLabels>;
  onFilter?: (e: CustomEvent<GridFilterDetail>) => void;
  /** Cancelable: con `preventDefault()` la edición no se aplica. */
  onChange?: (e: CustomEvent<{ changes: GridChange[] }>) => void;
  onColumns?: (e: CustomEvent<{ columns: GridColumn[] }>) => void;
  onSelection?: (e: CustomEvent<{ ids: string[]; count: number }>) => void;
  /** Clic en una columna `link` o Enter en una fila: el detalle (p. ej. un `<Dialog mode="panel">`). */
  onOpen?: (e: CustomEvent<{ id: string; row: GridRow; key: string; origin: HTMLElement | null }>) => void;
  children?: JSX.Element;
}

export function Grid(props: GridProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "rows", "source", "clientMax", "aiEndpoint", "nlEndpoint", "filters", "sort", "groupBy", "rowKey", "facetsOpen", "height", "filename", "locale", "labels", "onFilter", "onChange", "onColumns", "selectable", "selected", "onSelection", "onOpen", "children"]);
  return (
    <nx-grid
      {...rest}
      prop:columns={local.columns}
      prop:rows={local.rows}
      prop:filters={local.filters}
      prop:sort={local.sort}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:client-max={local.clientMax ? String(local.clientMax) : undefined}
      attr:ai-endpoint={local.aiEndpoint}
      attr:nl-endpoint={local.nlEndpoint}
      attr:group-by={local.groupBy}
      attr:row-key={local.rowKey}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:filename={local.filename}
      attr:locale={local.locale}
      bool:facets-open={!!local.facetsOpen}
      on:nx-grid-filter={(e) => local.onFilter?.(e)}
      on:nx-grid-change={(e) => local.onChange?.(e)}
      on:nx-grid-columns={(e) => local.onColumns?.(e)}
      on:nx-grid-selection={(e) => local.onSelection?.(e)}
      on:nx-grid-open={(e) => local.onOpen?.(e)}
      prop:selected={local.selected}
      bool:selectable={!!local.selectable}
    >
      {local.children}
    </nx-grid>
  );
}
