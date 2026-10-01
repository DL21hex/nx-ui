/** `<Grid>` para SolidJS: envuelve `<nx-grid>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/grid/index";
import type { NxGrid } from "../components/grid/grid";
import type { GridChange, GridChangeSource, GridColumn, GridFilter, GridLabels, GridPreset, GridRow, GridSavedView, GridSort, GridView, GridViewLabels } from "../components/grid/types";
import type { GridFilterDetail } from "./jsx";

export type { NxGrid, GridChange, GridChangeSource, GridColumn, GridFilter, GridLabels, GridPreset, GridRow, GridSavedView, GridSort, GridView, GridViewLabels };

export interface GridProps extends Omit<JSX.HTMLAttributes<NxGrid>, "onChange"> {
  columns: GridColumn[];
  /** Filas en el cliente. Sin `source`, se filtra, ordena y agrega aquí. */
  rows?: GridRow[];
  /** URL de datos en el servidor (POST `{offset, limit, sort, filters}` → `GridPage`). */
  source?: string;
  /** Con `source`: si la consulta completa tiene hasta este tanto de filas, se trae una vez y se filtra en el cliente. */
  clientMax?: number;
  filters?: GridFilter[];
  sort?: GridSort | null;
  /** Buscar en la tabla: lo que dice la caja (asignarlo busca). */
  search?: string;
  /** Filtros, orden, agrupación, columnas ocultas y anchos de una vez. */
  view?: Partial<GridView>;
  /** Clave de `localStorage` para las vistas con nombre. Sin ella no hay menú de vistas. */
  viewsStorage?: string;
  /** Las vistas guardadas (asignarlas las guarda). */
  views?: GridSavedView[];
  groupBy?: string;
  rowKey?: string;
  facetsOpen?: boolean;
  /** La barra de desplazamiento horizontal también arriba de la tabla (solo si no cabe a lo ancho). Viene encendida: `false` la quita. */
  topScrollbar?: boolean;
  /** Atajos: tarjetas con un filtro y su conteo sobre la tabla. */
  presets?: GridPreset[];
  /** Casillas para seleccionar filas; las acciones van como hijo con `slot="bulk"`. */
  selectable?: boolean;
  selected?: string[];
  height?: number;
  filename?: string;
  /** Formato de números, montos, fechas y orden (`es-CO`, `en-US`…). Por defecto, el `lang` de la página. */
  locale?: string;
  labels?: Partial<GridLabels & GridViewLabels>;
  onFilter?: (e: CustomEvent<GridFilterDetail>) => void;
  /** Las vistas guardadas cambiaron (guardar, renombrar, borrar). */
  onViews?: (e: CustomEvent<{ views: GridSavedView[] }>) => void;
  /** Cancelable: con `preventDefault()` la edición no se aplica. */
  onChange?: (e: CustomEvent<{ changes: GridChange[]; source: GridChangeSource }>) => void;
  onColumns?: (e: CustomEvent<{ columns: GridColumn[] }>) => void;
  onSelection?: (e: CustomEvent<{ ids: string[]; count: number }>) => void;
  /** Clic en una columna `link` o Enter en una fila: el detalle (p. ej. un `<Dialog mode="panel">`). */
  onOpen?: (e: CustomEvent<{ id: string; row: GridRow; key: string; origin: HTMLElement | null }>) => void;
  children?: JSX.Element;
}

export function Grid(props: GridProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "rows", "view", "views", "viewsStorage", "onViews", "source", "clientMax", "filters", "sort", "search", "groupBy", "rowKey", "facetsOpen", "topScrollbar", "presets", "height", "filename", "locale", "labels", "onFilter", "onChange", "onColumns", "selectable", "selected", "onSelection", "onOpen", "children"]);
  return (
    <nx-grid
      {...rest}
      prop:columns={local.columns}
      prop:rows={local.rows}
      prop:filters={local.filters}
      prop:sort={local.sort}
      prop:search={local.search}
      prop:presets={local.presets}
      prop:view={local.view}
      prop:views={local.views}
      attr:views-storage={local.viewsStorage}
      on:nx-grid-views={(e) => local.onViews?.(e)}
      prop:labels={local.labels}
      attr:source={local.source}
      attr:client-max={local.clientMax ? String(local.clientMax) : undefined}
      attr:group-by={local.groupBy}
      attr:row-key={local.rowKey}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:filename={local.filename}
      attr:locale={local.locale}
      bool:facets-open={!!local.facetsOpen}
      attr:top-scrollbar={local.topScrollbar === false ? "false" : undefined}
      on:nx-grid-filter={(e) => local.onFilter?.(e)}
      on:nx-grid-change={(e) => local.onChange?.(e)}
      on:nx-grid-columns={(e) => local.onColumns?.(e)}
      on:nx-grid-selection={(e) => local.onSelection?.(e)}
      on:nx-grid-open={(e) => local.onOpen?.(e)}
      prop:selected={local.selected}
      bool:selectable={!!local.selectable}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-grid>
  );
}
