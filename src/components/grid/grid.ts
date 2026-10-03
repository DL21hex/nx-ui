/**
 * `<nx-grid>`: una tabla de datos que se explora sola. Cada cabecera trae un embudo que abre el
 * filtro de su columna (una lista, un rango, fechas o «contiene», según el dato); se filtra también
 * con el panel de facetas o desde una celda (clic derecho); se navega, selecciona, copia, pega y
 * edita como una hoja de cálculo;
 * se agrupa con subtotales y exporta a Excel (.xlsx real).
 *
 * Datos: `rows` (en el cliente; filtra, ordena y agrega aquí) o `source` (en el servidor: POST
 * `{offset, limit, sort, filters}` → `GridPage`, por bloques a medida que se desplaza). Con
 * `client-max`, si la consulta completa cabe en ese tope se trae una vez y se sigue en el cliente.
 *
 * Un solo modelo de filtros (`GridFilter[]`): el filtro de una columna, una casilla de faceta o el
 * menú de una celda producen el mismo filtro y el mismo chip, que la persona ve, vuelve a abrir y
 * puede quitar.
 * El panel del filtro se carga aparte (`grid-filter.ts`), la primera vez que hace falta.
 *
 * Vistas: `grid.view` es el estado que se puede guardar (filtros, orden, agrupación, columnas
 * ocultas y anchos). Con `views-storage`, la persona lo guarda con un nombre en `localStorage` y lo
 * aplica con un clic; el menú y el selector de columnas se cargan aparte (`grid-views.ts`).
 *
 * Las filas se virtualizan (solo existen en el DOM las visibles); todo el texto va por
 * `textContent`.
 */
import { Base, boolAttr, upgrade, attrProps } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { glyph, initials } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { foldText } from "../../core/text";
import { nxFormat, resolveLocale, type NxFormat } from "../../core/locale";
import { extent } from "../../core/time";
import {
  applyFilters,
  colType,
  crossfilter,
  DATE_RELS,
  facetColumns,
  facetOrder,
  filterLabel,
  formulaSafe,
  formatCell,
  groupRows,
  isNumeric,
  num,
  parseInput,
  parseTSV,
  resolveRel,
  rowTexter,
  selection,
  sortRows,
  stats,
  toggleFacet,
  toTSV,
  unformulaSafe,
  withColumn,
  type GridFacet,
  type GridGroup,
} from "./logic";
import type { FilterHost, FilterKind, FilterPanel } from "./grid-filter";
import type { ViewsHost, ViewsUI } from "./grid-views";
import type { GridChange, GridChangeSource, GridColumn, GridDateRel, GridFilter, GridHistogram, GridLabels, GridPage, GridPreset, GridRow, GridSavedView, GridSort, GridView, GridViewLabels } from "./types";

export const GRID_LABELS: GridLabels = {
  filters: "Filtros",
  groupBy: "Agrupar por {col}",
  noGroup: "Sin agrupar",
  export: "Exportar",
  exporting: "Exportando…",
  exported: "Se exportaron {n} filas",
  exportError: "No se pudo exportar",
  rows: "{n} filas",
  of: "{n} de {total} filas",
  cells: "{n} celdas",
  sum: "Suma",
  avg: "Promedio",
  min: "Mín",
  max: "Máx",
  total: "Total",
  clear: "Limpiar todo",
  remove: "Quitar",
  search: "Buscar",
  searchTable: "Buscar en la tabla",
  clearSearch: "Borrar la búsqueda",
  more: "Ver {n} más",
  less: "Ver menos",
  empty: "Ninguna fila coincide con los filtros",
  loading: "Cargando…",
  loadError: "No se pudieron cargar las filas",
  retry: "Reintentar",
  presets: "Atajos",
  selected: "{n} seleccionadas",
  selectedOne: "1 seleccionada",
  selectAll: "Seleccionar las {n}",
  clearSelection: "Quitar selección",
  selectRow: "Seleccionar fila",
  undo: "Deshacer",
  redo: "Rehacer",
  undone: "Deshecho",
  redone: "Rehecho",
  editLost: "La fila que se editaba ya no está: no se guardó lo escrito",
  views: "Vistas",
  columns: "Columnas",
  saveView: "Guardar como vista",
  resize: "Ancho de {col}",
  gone: "La vista usaba {cols}, que ya no está en la tabla.",
  filterBy: "Filtrar {col}",
  filterOn: "Cambiar el filtro «{filter}»",
  left: "Quedan {n} de {total}",
  done: "Listo",
  reset: "Limpiar",
  allValues: "Seleccionar todo",
  allMatching: "Todos los que coinciden ({n})",
  only: "Solo",
  onlyValue: "Solo «{v}»",
  exceptValue: "Sin «{v}»",
  searchIn: "Buscar en {n} valores",
  enterOnly: "Enter deja marcados solo estos.",
  noValues: "Ningún valor coincide.",
  moreValues: "Y {n} más: busca para verlos.",
  from: "Desde",
  to: "Hasta",
  fromValue: "Desde {v}",
  toValue: "Hasta {v}",
  noMin: "Sin mínimo",
  noMax: "Sin máximo",
  amountHint: "Acepta 5.000.000, 5 M o 5 millones.",
  anyDate: "Cualquier fecha",
  between: "Entre dos fechas…",
  past: "Antes de hoy",
  last30: "Últimos 30 días",
  next30: "Próximos 30 días",
  month: "Este mes",
  lastMonth: "Mes pasado",
  year: "Este año",
  barHint: "Clic en una barra para quedarte con ese tramo.",
  contains: "Contiene…",
  containsHint: "Escribe parte del texto. No distingue mayúsculas ni tildes.",
  containsValue: "Contiene «{v}»",
  matches: "1 fila coincide|{n} filas coinciden",
  moreFilters: "Más filtros de {col}…",
  relax: "Quitar {filter}: vuelve 1 fila|Quitar {filter}: vuelven {n} filas",
};

const SLIDERS = '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>';
const DOWNLOAD = '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const ARROW = '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>';
const UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
const REDO = '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>';
const BOOKMARK = '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>';
const COLUMNS = '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/>';
/** Límites del ancho que la persona elige para una columna (px). */
const MIN_W = 60;
const MAX_W = 800;
const FUNNEL = '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>';
/** En modo servidor, el filtro de una columna espera esto tras el último cambio antes de pedir. */
const SERVER_WAIT = 250;
/** Pasos que se pueden deshacer. */
const HISTORY = 100;

const ROW_H = 32;
const OVERSCAN = 8;
const BLOCK = 100;
/** Bloques del servidor que se guardan: al pasar de esto se sueltan los más lejanos a la vista
 *  (recorrer una tabla de un millón de filas no las deja todas en memoria). */
const KEEP = 50;
/** Intentos automáticos de un bloque que falla (el primero y sus reintentos). */
const TRIES = 5;
/** Tope del alto del cuerpo (px): los navegadores no pintan elementos más altos (Firefox, ~17,9 M), y
 *  Firefox deja de fijar la cabecera (`sticky`) pasados ~8,9 M de desplazamiento: con 15 M, al fondo
 *  de un millón de filas la cabecera se iba con el scroll. Más allá, el cuerpo se queda en este alto
 *  y el desplazamiento se escala. */
const MAX_H = 8_000_000;
const FACET_SHOWN = 6;
/** Exportar pide las filas al servidor de a este tanto, hasta el tope de filas de una hoja de Excel. */
const EXPORT_BLOCK = 5000;
const EXPORT_MAX = 1_048_575;
const WIDTH: Record<string, number> = { text: 180, number: 110, money: 140, date: 120, status: 130 };
const OPS = new Set(["in", "notIn", "range", "contains"]);

type Item = { g: GridGroup } | { r: GridRow };
type Pos = { r: number; c: number };
/** Una edición en curso: la posición (para moverse al terminar) y la fila misma, por su objeto y su
 *  id: si mientras tanto cambian los datos, los filtros o el orden, el campo sigue a esa fila (ver
 *  `#track`) y lo escrito no cae sobre la que hoy ocupa su lugar. `text`: lo que traía el campo al
 *  abrirlo (sin tocarlo no se guarda); `list`: las opciones de un estado. */
type Editing = { r: number; c: number; key: string; row: GridRow; id: string; text: string | null; input: HTMLInputElement; list?: HTMLElement; quick: boolean };

let uid = 0;

/** El borde de un tramo que llega de afuera: un número, una fecha ISO o un número escrito como texto
 *  («50000» de un JSON se compararía como texto: «9000» ≥ «50000»). Lo demás no sirve. */
function bound(v: unknown): number | string | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string" || !v.trim()) return undefined;
  if (/^\d{4}-\d{2}(-\d{2})?/.test(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Los filtros que llegan de afuera (atributo, una vista guardada, BDUI) se validan y se llevan a sus
 *  tipos: los valores de una lista como texto (las filas se comparan como texto: `[1]` no encontraba
 *  `1`), los bordes de un tramo como arriba y `rel` solo si es uno conocido. Los tramos relativos
 *  («este mes») se recalculan con la fecha de hoy. */
function validFilters(v: unknown): GridFilter[] {
  if (!Array.isArray(v)) return [];
  const out: GridFilter[] = [];
  for (const f of v as Record<string, unknown>[]) {
    if (!f || typeof f !== "object" || typeof f.key !== "string" || !OPS.has(f.op as string)) continue;
    const key = f.key;
    if (f.op === "range") {
      const min = bound(f.min);
      const max = bound(f.max);
      const rel = DATE_RELS.includes(f.rel as GridDateRel) ? (f.rel as GridDateRel) : undefined;
      if (min === undefined && max === undefined && !rel) continue;
      out.push({ key, op: "range", ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}), ...(rel ? { rel } : {}) });
    } else if (f.op === "contains") {
      if (typeof f.value === "string" || typeof f.value === "number") out.push({ key, op: "contains", value: String(f.value) });
    } else if (Array.isArray(f.values)) {
      const values = f.values.filter((x) => typeof x === "string" || typeof x === "number" || typeof x === "boolean").map(String);
      out.push({ key, op: f.op as "in" | "notIn", values });
    }
  }
  return resolveRel(out);
}

const TYPES = new Set(["text", "number", "money", "date", "status"]);
const KINDS = new Set(["list", "range", "date", "text"]);

/** Una columna que llega de afuera (BDUI: JSON). Sin `key` y `label` de texto no sirve; lo demás que
 *  no tenga la forma correcta se arregla o se quita: unas `options` que no son lista lanzaban al
 *  ordenar, y un `width` de texto se sumaba como texto («0200140px»). Una columna correcta queda
 *  como llegó (el mismo objeto). */
function cleanColumn(c: unknown): GridColumn | null {
  if (!c || typeof c !== "object") return null;
  const x = c as Record<string, unknown>;
  if (typeof x.key !== "string" || typeof x.label !== "string") return null;
  const fix: Record<string, unknown> = {};
  if (x.type !== undefined && !TYPES.has(x.type as string)) fix.type = undefined;
  if (x.width !== undefined && typeof x.width !== "number") fix.width = Number(x.width);
  const w = (fix.width ?? x.width) as number | undefined;
  if (w !== undefined && !(w > 0 && Number.isFinite(w))) fix.width = undefined;
  if (x.options !== undefined) {
    const list = Array.isArray(x.options) ? (x.options as Record<string, unknown>[]) : [];
    const ok = list.filter((o) => o && typeof o === "object" && (typeof o.value === "string" || typeof o.value === "number"));
    if (!Array.isArray(x.options) || ok.length !== list.length || ok.some((o) => typeof o.value !== "string" || (o.label != null && typeof o.label !== "string")))
      fix.options = ok.length ? ok.map((o) => ({ ...o, value: String(o.value), ...(o.label != null ? { label: String(o.label) } : {}) })) : undefined;
  }
  if (x.filter !== undefined && x.filter !== false && !KINDS.has(x.filter as string)) fix.filter = undefined;
  if (x.currency !== undefined && typeof x.currency !== "string") fix.currency = undefined;
  for (const k of ["editable", "link", "avatar", "histogram", "facet"]) if (x[k] !== undefined && typeof x[k] !== "boolean") fix[k] = !!x[k];
  if (!Object.keys(fix).length) return c as GridColumn;
  const out: Record<string, unknown> = { ...x, ...fix };
  for (const k of Object.keys(fix)) if (fix[k] === undefined) delete out[k];
  return out as unknown as GridColumn;
}

/** La copia de una fila que guarda la tabla: sin prototipo, para que una columna «constructor» o
 *  «toString» en una fila que no la trae lea `undefined` y no el código de una función. */
const own = (r: GridRow): GridRow => Object.assign(Object.create(null) as GridRow, r);

const clampW = (w: number) => Math.round(Math.min(MAX_W, Math.max(MIN_W, w)));

/** Una vista que llega de afuera (localStorage, la app): solo lo que tiene la forma correcta. */
function cleanView(v: unknown): GridView {
  const x = (v && typeof v === "object" ? v : {}) as Partial<GridView>;
  const sort = x.sort && typeof x.sort.key === "string" ? { key: x.sort.key, dir: x.sort.dir === -1 ? (-1 as const) : (1 as const) } : null;
  const widths: Record<string, number> = {};
  if (x.widths && typeof x.widths === "object") for (const [k, w] of Object.entries(x.widths)) if (typeof w === "number" && w > 0) widths[k] = clampW(w);
  return {
    filters: validFilters(x.filters),
    sort,
    groupBy: typeof x.groupBy === "string" ? x.groupBy : "",
    hidden: Array.isArray(x.hidden) ? x.hidden.filter((k): k is string => typeof k === "string") : [],
    widths,
  };
}

function cleanViews(list: unknown): GridSavedView[] {
  if (!Array.isArray(list)) return [];
  let def = false;
  return list
    .filter((v) => v && typeof v.id === "string" && typeof v.name === "string" && v.name.trim())
    .map((v) => {
      const on = !!v.default && !def;
      def ||= on;
      return { id: v.id, name: String(v.name).trim().slice(0, 80), ...cleanView(v), ...(on ? { default: true } : {}) };
    });
}

export class NxGrid extends Base {
  static {
    attrProps(this, ["height"]);
  }
  declare height: string | null;
  static observedAttributes = ["columns", "rows", "filters", "labels", "presets", "source", "client-max", "group-by", "facets-open", "height", "locale", "selectable", "views-storage", "top-scrollbar", "row-key"];

  #uid = `nx-grid${++uid}`;
  #labels: GridLabels = GRID_LABELS;
  #loc: NxFormat = nxFormat();
  /** Todas las columnas (`#cols`) y las que se ven (`#columns`: sin las ocultas). */
  #cols: GridColumn[] = [];
  #columns: GridColumn[] = [];
  #hidden = new Set<string>();
  #widths = new Map<string, number>();
  // Vistas guardadas (`views-storage`): la lista leída, la aplicada y la clave ya arrancada.
  #viewList: GridSavedView[] | null = null;
  #activeView: string | null = null;
  #booted = "";
  #quiet = false;
  #viewsUI?: ViewsUI;
  #viewsLoad?: Promise<ViewsUI>;
  #labelsIn: unknown;
  #all: GridRow[] = [];
  #filters: GridFilter[] = [];
  #sort: GridSort | null = null;
  // Buscar en la tabla: lo escrito, lo mismo plegado, las filas que pasan y el texto de cada fila
  // (se arma la primera vez que se busca, y se rehace si cambian las filas, las columnas o el locale).
  #search = "";
  #q = "";
  #base: GridRow[] = [];
  /** De qué búsqueda salió `#base`: mientras no cambien lo buscado, las filas ni su texto, se reutiliza
   *  (el filtro de una columna guarda cálculos por esa lista, que se perdían en cada clic). */
  #baseQ: string | null = null;
  #hay = new WeakMap<GridRow, string>();
  #texter?: (r: GridRow) => string;
  #searchWait?: ReturnType<typeof setTimeout>;
  #built = false;
  // Derivados (modo cliente).
  #facetCols: GridColumn[] = [];
  #order = new Map<string, string[]>();
  #filtered: GridRow[] = [];
  #sorted: GridRow[] = [];
  /** Todas las filas ya ordenadas por `sort`: filtrar o buscar no reordena, solo recorre esto. Se
   *  olvida si cambian las filas, las columnas, el locale o un valor de la columna del orden. */
  #sortedAll: { sort: GridSort; rows: GridRow[] } | null = null;
  #groups: GridGroup[] | null = null;
  #groupMax: Record<string, number> = {};
  #view: Item[] = [];
  #collapsed = new Set<string>();
  // Agregados (las barras llegan del servidor; en el cliente se calculan al abrir un filtro).
  #hist = new Map<string, GridHistogram>();
  #facetList: GridFacet[] = [];
  #presets: GridPreset[] = [];
  /** Conteos de los atajos: del servidor, o calculados aquí sobre `#all` (se olvidan al cambiar los datos). */
  #presetN = new Map<string, number>();
  #presetKey = "";
  /** Los filtros que había antes de tocar un atajo: tocarlo otra vez los devuelve. */
  #beforePreset: GridFilter[] | null = null;
  #presetBar?: HTMLDivElement;
  #totals: Record<string, number> = {};
  // Filas.
  #ids = new WeakMap<GridRow, string>();
  #byId = new Map<string, GridRow>();
  #edited = new Set<string>();
  /** Valor antes de la primera edición de cada celda: si vuelve a él, la marca se quita. */
  #orig = new Map<string, unknown>();
  #undo: GridChange[][] = [];
  #redo: GridChange[][] = [];
  // Servidor.
  #total = 0;
  #blocks = new Map<number, GridRow[] | "loading">();
  #gen = 0;
  #wait?: ReturnType<typeof setTimeout>;
  /** Las peticiones de bloques de esta consulta (se cortan al cambiarla o al salir del DOM) y la de
   *  `client-max`; `#resume`: al salir del DOM quedó algo sin pedir, que se pide al volver. */
  #ac?: AbortController;
  #tryAc?: AbortController;
  #resume = false;
  /** Bloques que fallaron: cuántas veces y desde cuándo se pueden volver a pedir (1 s, 2 s, 4 s… hasta
   *  30 s). `#loadError`: falló el primero y no hay filas que mostrar. */
  #fails = new Map<number, { n: number; at: number }>();
  #retry?: ReturnType<typeof setTimeout>;
  #retryAt = 0;
  #loadError = false;
  /** Los agregados de la última página pintados: un bloque que trae los mismos no repinta la barra. */
  #pageSig = "";
  /** `client-max`: la consulta completa se trajo y se filtra aquí (`local`); ya se miró el total (`decided`). */
  #local = false;
  #decided = false;
  // Filtro por columna (se carga aparte).
  #panel?: FilterPanel;
  #panelLoad?: Promise<FilterPanel>;
  // Hoja de cálculo.
  #act: Pos = { r: 0, c: 0 };
  #anchor: Pos = { r: 0, c: 0 };
  #dragging = false;
  /** Con el dedo: el último toque fue sobre la celda que ya estaba activa (ver `#onPointerDown`). */
  #tap: Pos | null = null;
  #touch = false;
  #editing: Editing | null = null;
  /** El campo de la edición pasa de la fila vieja a la repintada (su `blur` no la termina). */
  #moving = false;
  #win = { start: -1, end: -1 };
  #raf = 0;
  /** El pie se recalcula solo si cambió el rango o esto (datos, textos, grupos). */
  #footDirty = true;
  #footKey = "";
  // Facetas.
  #picked = new Set<string>();
  #lastPick = -1;
  #facetQ = new Map<string, string>();
  #facetMore = new Set<string>();
  // Nodos.
  #searchInput?: HTMLInputElement;
  #searchClear?: HTMLButtonElement;
  #viewsBtn?: HTMLButtonElement;
  #colsBtn?: HTMLButtonElement;
  #facetBtn?: HTMLButtonElement;
  #groupSel?: HTMLSelectElement;
  #exportBtn?: HTMLButtonElement;
  #undoBtn?: HTMLButtonElement;
  #redoBtn?: HTMLButtonElement;
  #note?: HTMLParagraphElement;
  #chips?: HTMLDivElement;
  #aside?: HTMLElement;
  #scroll?: HTMLDivElement;
  /** La barra horizontal de arriba (`top-scrollbar`) y, de ella y de la tabla, el último `scrollLeft`
   *  que ya está reflejado en la otra. */
  #hbar?: HTMLDivElement;
  #synced = new Map<Element, number>();
  #fill?: HTMLDivElement;
  #head?: HTMLDivElement;
  #body?: HTMLDivElement;
  #rowsEl?: HTMLDivElement;
  /** El aviso sin filas («Cargando…», «Ninguna fila coincide…», «Reintentar»): dentro de la tabla
   *  va como una fila con una celda (un botón suelto dentro de un `role="grid"` no es válido). */
  #empty?: HTMLDivElement;
  #emptyCell?: HTMLSpanElement;
  #foot?: HTMLDivElement;
  #live?: HTMLSpanElement;
  #ths: HTMLElement[] = [];
  #selbar?: HTMLDivElement;
  #headCheck?: HTMLInputElement;
  #ro?: ResizeObserver;
  #copied?: ReturnType<typeof setTimeout>;
  #groupKey = "";
  #urls = new Map<string, { raw: string | null; at: string; url: string | undefined }>();

  // ---------------------------------------------------------------- propiedades

  get columns(): GridColumn[] {
    return this.#cols;
  }
  set columns(v: GridColumn[] | null | undefined) {
    this.#cols = Array.isArray(v) ? v.map(cleanColumn).filter((c): c is GridColumn => !!c) : [];
    this.#syncColumns();
    // Con `source`, las columnas no viajan al servidor: se rehace la cabecera sin volver a pedir.
    this.#dataChanged(true, true);
  }

  /** El estado que se puede guardar: filtros, orden, agrupación, columnas ocultas y anchos. */
  get view(): GridView {
    return { filters: this.#filters, sort: this.#sort, groupBy: this.groupBy, hidden: [...this.#hidden], widths: Object.fromEntries(this.#widths) };
  }
  set view(v: Partial<GridView> | null | undefined) {
    this.#applyView(v, null);
  }
  /** La clave de `localStorage` donde se guardan las vistas con nombre. Sin ella no hay menú de vistas. */
  get viewsStorage(): string {
    return this.getAttribute("views-storage") ?? "";
  }
  set viewsStorage(v: string | null) {
    this.#attr("views-storage", v);
  }
  /** Las vistas guardadas. Asignarlas las guarda (y emite `nx-grid-views`). */
  get views(): GridSavedView[] {
    if (!this.#viewList) {
      let raw: unknown = null;
      try {
        raw = JSON.parse((this.viewsStorage && localStorage.getItem(this.viewsStorage)) || "null");
      } catch {
        /* guardado roto o sin acceso: sin vistas */
      }
      this.#viewList = cleanViews((raw as { views?: unknown } | null)?.views);
    }
    return this.#viewList;
  }
  set views(v: GridSavedView[] | null | undefined) {
    this.#viewList = cleanViews(v);
    if (this.#activeView && !this.#viewList.some((x) => x.id === this.#activeView)) this.#activeView = null;
    try {
      if (this.viewsStorage) localStorage.setItem(this.viewsStorage, JSON.stringify({ v: 1, views: this.#viewList }));
    } catch {
      /* sin espacio o bloqueado: quedan en esta página */
    }
    this.#emit("nx-grid-views", { views: this.#viewList });
    this.#paintChrome();
  }
  /** La vista guardada que está aplicada (su `id`), o null. */
  get activeView(): string | null {
    return this.#activeView;
  }
  /** Las filas (modo cliente). Se copian: las ediciones quedan aquí, no en el original. Asignar de nuevo `grid.rows` (el mismo arreglo) recalcula filtros y agregados. */
  get rows(): GridRow[] {
    return this.#all;
  }
  set rows(v: GridRow[] | null | undefined) {
    // `grid.rows = grid.rows` (tras cambiar filas por fuera) recalcula sin copiar: las filas son
    // las mismas que la app ya tiene en la mano.
    // Filas nuevas: se empieza de cero (marcas de edición e historial para deshacer).
    // Una edición abierta sigue abierta en su fila, si la fila sigue (ver `#track`).
    if (v !== this.#all) {
      this.#all = Array.isArray(v) ? v.filter((r) => r && typeof r === "object").map(own) : [];
      this.#edited.clear();
      this.#orig.clear();
      this.#undo = [];
      this.#redo = [];
    }
    // Con `source`, `rows` no se usa: ni se indexa ni se vuelve a pedir nada.
    if (this.#server) return;
    this.#reindex();
    this.#dataChanged();
  }
  get filters(): GridFilter[] {
    return this.#filters;
  }
  set filters(v: GridFilter[] | null | undefined) {
    this.#setFilters(validFilters(v), false);
  }
  /** Buscar en la tabla: quedan las filas que contienen este texto en alguna columna visible (sin
   *  tildes ni mayúsculas). Se suma a los filtros, pero no es uno: no deja chip ni va en las vistas.
   *  Con `source`, viaja al servidor como `search`. */
  get search(): string {
    return this.#search;
  }
  set search(v: string | null | undefined) {
    this.#search = String(v ?? "");
    clearTimeout(this.#searchWait);
    this.#paintSearch();
    const q = foldText(this.#search.trim());
    if (q === this.#q) return;
    this.#q = q;
    this.#refilter(true);
  }
  get sort(): GridSort | null {
    return this.#sort;
  }
  set sort(v: GridSort | null | undefined) {
    this.#sort = v && typeof v.key === "string" ? { key: v.key, dir: v.dir === -1 ? -1 : 1 } : null;
    this.#refilter(false, "order");
  }
  /** URL de datos en el servidor. Con ella, `rows` no se usa. */
  get source(): string | null {
    return this.getAttribute("source");
  }
  set source(v: string | null) {
    this.#attr("source", v);
  }
  /** Con `source`: si la consulta sin filtros tiene hasta este tanto de filas, se traen todas una
   *  vez y se sigue en el cliente (conteos exactos, filtros al instante, agrupar). 0: siempre en el
   *  servidor. */
  get clientMax(): number {
    return Math.max(0, Math.floor(Number(this.getAttribute("client-max")) || 0));
  }
  set clientMax(v: number | null) {
    this.#attr("client-max", v ? String(v) : null);
  }
  /** Dónde se filtra ahora: `client` (las filas están en el navegador) o `server`. */
  get mode(): "client" | "server" {
    return this.#server ? "server" : "client";
  }
  get groupBy(): string {
    return this.getAttribute("group-by") ?? "";
  }
  set groupBy(v: string | null) {
    this.#attr("group-by", v);
  }
  /** El campo que identifica cada fila (por defecto `id`). */
  get rowKey(): string {
    return this.getAttribute("row-key") || "id";
  }
  set rowKey(v: string) {
    this.#attr("row-key", v);
  }
  get facetsOpen(): boolean {
    return boolAttr(this, "facets-open");
  }
  set facetsOpen(v: boolean) {
    this.toggleAttribute("facets-open", !!v);
  }
  /** La barra de desplazamiento horizontal también arriba de la tabla (la propia queda al pie de su
   *  caja), solo si las columnas no caben a lo ancho. Viene encendida; `top-scrollbar="false"` la quita. */
  get topScrollbar(): boolean {
    return this.getAttribute("top-scrollbar") !== "false";
  }
  set topScrollbar(v: boolean | null | undefined) {
    this.#attr("top-scrollbar", v === false ? "false" : null);
  }
  /** Atajos: tarjetas con un filtro y su conteo sobre la tabla. Con `source`, los conteos los manda
   *  el servidor (`presets` en la respuesta); con las filas aquí, se cuentan aquí. */
  get presets(): GridPreset[] {
    return this.#presets;
  }
  set presets(v: GridPreset[] | null | undefined) {
    this.#presets = Array.isArray(v) ? v.filter((p) => p && typeof p.id === "string" && typeof p.label === "string" && Array.isArray(p.filters)) : [];
    if (!this.#server) this.#presetN.clear();
    this.#presetKey = "";
    this.#paintPresets();
  }
  /** Nombre del archivo al exportar (sin extensión). */
  get filename(): string {
    return this.getAttribute("filename") || "tabla";
  }
  set filename(v: string) {
    this.#attr("filename", v);
  }
  /** Casillas para seleccionar filas (acciones en lote). Lo que la app ponga con `slot="bulk"` se
   *  muestra junto al conteo mientras haya filas seleccionadas. */
  get selectable(): boolean {
    return boolAttr(this, "selectable");
  }
  set selectable(v: boolean) {
    this.toggleAttribute("selectable", !!v);
  }
  /** Los `id` de las filas seleccionadas (se conservan al filtrar). */
  get selected(): string[] {
    return [...this.#picked];
  }
  set selected(v: string[] | null | undefined) {
    this.#picked = new Set(Array.isArray(v) ? v.map(String) : []);
    this.#paintPicked(false);
  }
  /** Cuántas filas pasan los filtros. */
  get count(): number {
    return this.#rowCount();
  }
  /** Las filas seleccionadas (las que están cargadas). */
  get selectedRows(): GridRow[] {
    return this.selected.map((id) => this.#byId.get(id)).filter((r): r is GridRow => !!r);
  }
  /** Formato de números, montos, fechas y orden alfabético (`es-CO`, `en-US`…). Por defecto, el
   *  `lang` más cercano, o «es-CO». Los textos de la interfaz van aparte, en `labels`. */
  get locale(): string {
    return resolveLocale(this);
  }
  set locale(v: string | null) {
    this.#attr("locale", v);
  }
  get labels(): GridLabels {
    return this.#labels;
  }
  set labels(v: Partial<GridLabels & GridViewLabels> | null | undefined) {
    // Los textos de las vistas los toma su propio módulo (se carga aparte), de lo mismo que llegó.
    this.#labelsIn = v;
    this.#labels = mergeLabels(GRID_LABELS, v);
    this.#paintAll();
  }
  get #server(): boolean {
    return !this.#local && !!this.#url("source");
  }

  /** La URL de un atributo (`source`) si es del mismo origen (o de uno
   *  permitido con `allowOrigins`). Se recuerda por valor y página: se consulta en cada pintado y
   *  `safeEndpoint` avisa por consola cada vez que bloquea una. */
  #url(attr: string): string | undefined {
    const raw = this.getAttribute(attr);
    const at = typeof location === "undefined" ? "" : location.href;
    const hit = this.#urls.get(attr);
    if (hit && hit.raw === raw && hit.at === at) return hit.url;
    const url = raw ? safeEndpoint(raw) : undefined;
    this.#urls.set(attr, { raw, at, url });
    return url;
  }

  // ---------------------------------------------------------------- API

  clearFilters(): void {
    this.#setFilters([]);
  }

  /** Abre el filtro de una columna (el mismo panel que el embudo de su cabecera). */
  async openFilter(key: string): Promise<void> {
    const col = this.#cols.find((c) => c.key === key);
    if (!col || !this.#filterable(col)) return;
    const panel = await this.#loadPanel();
    if (panel.openKey !== key) panel.toggle(col, this.#thOf(key) ?? this.#chips ?? null);
  }

  /** Aplica una vista guardada (por su `id`); `false` si no existe. */
  applyView(id: string): boolean {
    const v = this.views.find((x) => x.id === id);
    if (v) this.#applyView(v, v.id);
    return !!v;
  }

  removeColumn(key: string): void {
    const col = this.#cols.find((c) => c.key === key);
    if (!col) return;
    this.#cols = this.#cols.filter((c) => c !== col);
    this.#syncColumns();
    // Con `source` solo se vuelve a pedir si la consulta cambia (tenía un filtro o el orden).
    const query = this.#filters.some((f) => f.key === key) || this.#sort?.key === key;
    this.#filters = this.#filters.filter((f) => f.key !== key);
    if (this.#sort?.key === key) this.#sort = null;
    this.#act = this.#anchor = { r: this.#act.r, c: Math.min(this.#act.c, this.#columns.length - 1) };
    this.#dataChanged(true, !query);
    this.#emit("nx-grid-columns", { columns: this.#cols });
  }

  /** Vuelve a pedir los datos (con `source`). Con `client-max`, vuelve a mirar si caben en el cliente. */
  refresh(): void {
    if (!this.#url("source")) return;
    this.#local = this.#decided = false;
    this.#dataChanged();
  }

  /** Descarga las filas filtradas y ordenadas como .xlsx (el generador se carga solo en este
   *  momento) y resuelve con cuántas filas llevó. En modo servidor las pide por bloques; si el
   *  servidor falla, la promesa se rechaza. Sale `nx-grid-export` con el resultado. */
  async exportXlsx(filename = this.filename): Promise<number> {
    try {
      const n = await this.#export(filename);
      this.#emit("nx-grid-export", { ok: true, count: n, filename });
      return n;
    } catch (err) {
      this.#emit("nx-grid-export", { ok: false, count: 0, filename, error: String((err as Error)?.message ?? err) });
      throw err;
    }
  }

  async #export(filename: string): Promise<number> {
    const [{ buildXlsx, moneyFormat }, rows] = await Promise.all([import("./xlsx"), this.#server ? this.#fetchAll() : Promise.resolve(this.#sorted)]);
    const cols = this.#columns;
    const cells = rows.map((r) =>
      cols.map((c) => {
        const v = Object.hasOwn(r, c.key) ? r[c.key] : undefined;
        if (v === null || v === undefined || v === "") return null;
        if (isNumeric(c)) return num(v);
        if (colType(c) === "date") return String(v);
        return formatCell(v, c, this.#loc);
      }),
    );
    const types = cols.map((c) => (isNumeric(c) ? (colType(c) as "number" | "money") : colType(c) === "date" ? "date" : "text"));
    const widths = cols.map((c, ci) => {
      let w = Math.max(10, c.label.length + 3);
      for (let i = 0; i < cells.length && i < 200; i++) w = Math.max(w, String(cells[i][ci] ?? "").length + 2);
      return Math.min(50, w);
    });
    // Cada columna de dinero con su moneda (el símbolo que se ve en la tabla) y con decimales solo
    // si alguno de sus montos los tiene.
    const formats = cols.map((c, ci) => {
      if (colType(c) !== "money") return undefined;
      const symbol = this.#loc.money(0, c).replace(/[\d\s.,\u00a0\u202f-]/g, "");
      const decimals = cells.some((r) => typeof r[ci] === "number" && !Number.isInteger(r[ci])) ? 2 : 0;
      return moneyFormat(symbol, decimals);
    });
    const blob = await buildXlsx(filename, cols.map((c) => c.label), cells, types, widths, formats);
    const a = h("a", { href: URL.createObjectURL(blob), download: `${filename}.xlsx` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return rows.length;
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    const first = !this.#built;
    if (first) this.#build();
    if (typeof ResizeObserver !== "undefined" && !this.#ro) {
      this.#ro = new ResizeObserver(() => this.#soon());
      this.#ro.observe(this.#scroll!);
    }
    addEventListener("storage", this.#onStorage);
    // La vista de inicio se aplica antes del primer cálculo: la tabla no parpadea sin ella.
    if (first) this.#bootViews();
    // Movido en el DOM (un portal, una lista que se reordena): los datos no cambiaron, no se
    // recalcula ni se vuelve a pedir nada; solo se repintan las filas visibles.
    if (first) this.#dataChanged(true);
    else if (this.#resume) {
      // Al salir del DOM quedó una petición cortada o un filtro sin pedir: se pide ahora.
      this.#resume = false;
      this.#refilter(true);
    } else this.#paintRows(true);
    // Lo escrito en la búsqueda que no alcanzó a aplicarse antes de salir del DOM.
    if (!first && this.#searchInput!.value !== this.#search) this.search = this.#searchInput!.value;
  }

  /** Otra pestaña guardó vistas con la misma clave: la lista se vuelve a leer. */
  #onStorage = (e: StorageEvent) => {
    if (!e.key || e.key !== this.viewsStorage) return;
    this.#viewList = null;
    this.#paintChrome();
  };

  disconnectedCallback(): void {
    this.#ro?.disconnect();
    this.#ro = undefined;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    // Un popover abierto que sale del DOM se oculta sin avisar: el panel se da por cerrado.
    this.#panel?.close();
    this.#viewsUI?.close();
    removeEventListener("storage", this.#onStorage);
    // Nada sigue trabajando para una tabla fuera del DOM: las esperas se cancelan y las peticiones
    // se cortan. Si vuelve (un portal, una lista que se reordena), lo que faltaba se pide otra vez.
    clearTimeout(this.#searchWait);
    clearTimeout(this.#retry);
    this.#retry = undefined;
    clearTimeout(this.#copied);
    if (this.#wait !== undefined) {
      clearTimeout(this.#wait);
      this.#wait = undefined;
      this.#resume = true;
    }
    this.#ac?.abort();
    this.#ac = undefined;
    if (this.#tryAc) {
      this.#tryAc.abort();
      this.#tryAc = undefined;
      this.#decided = false;
      this.#resume = true;
    }
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if ((name === "columns" || name === "rows" || name === "filters" || name === "labels" || name === "presets") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-grid] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    // `row-key` cambia los id: también antes de conectarse (Solid asigna `rows` antes que el atributo).
    // Lo que cuenta es la clave efectiva: sin atributo es «id», así que pasar a `row-key="id"` no
    // cambia ningún id (y no se pierden marcas ni historial).
    if (name === "row-key") return void ((old || "id") !== (value || "id") && this.#rekey());
    if (!this.#built || old === value || this.#quiet) return;
    if (name === "source" || name === "client-max") {
      this.#settle();
      // Lo que seguía en camino de la consulta anterior ya no sirve: un bloque que llegara después
      // indexaría filas del servidor en el modo cliente y cambiaría el total.
      this.#drop();
      this.#local = this.#decided = false;
      // Sin `source` las filas vuelven a ser las de `rows`.
      if (!this.#server) this.#reindex();
      this.#dataChanged(true);
    } else if (name === "views-storage") {
      this.#viewList = null;
      this.#activeView = null;
      this.#bootViews();
      this.#paintChrome();
    } else if (name === "top-scrollbar") {
      // Vuelta a encender con la tabla ya desplazada: la barra arranca en 0 y, al tocarla, la tabla saltaría.
      // En el siguiente frame (ya visible y maquetada) toma la posición de la tabla.
      this.#synced.clear();
      requestAnimationFrame(() => this.#follow(this.#scroll!, this.#hbar!));
    } else if (name === "locale" || name === "selectable") this.#dataChanged(name === "selectable");
    else if (name === "group-by") {
      this.#collapsed.clear();
      this.#refilter(true, "order");
    } else this.#paintAll();
  }

  // ---------------------------------------------------------------- datos

  #index(rows: readonly GridRow[], offset: number): void {
    const key = this.rowKey;
    // Sin `row-key`, el id es la posición. En el servidor la posición cambia con cada filtro u
    // orden: el id lleva la generación de la consulta, para que una selección vieja no caiga
    // sobre otra fila que hoy ocupa ese lugar.
    const pos = this.#server ? `#${this.#gen}:` : "#";
    let dup: string | undefined;
    rows.forEach((r, i) => {
      const v = Object.hasOwn(r, key) ? r[key] : undefined;
      let id = v === null || v === undefined ? `${pos}${offset + i}` : String(v);
      // Un id repetido (un join, un `row-key` que no es único) haría que editar o marcar una fila
      // cayera sobre la otra: la segunda se identifica por su posición, y se avisa.
      const had = this.#byId.get(id);
      if (had && had !== r) {
        dup ??= id;
        id = `${pos}${offset + i}`;
      }
      this.#ids.set(r, id);
      this.#byId.set(id, r);
    });
    if (dup !== undefined) console.warn(`[nx-grid] el id «${dup}» (de "${key}") se repite: esas filas se identifican por su posición`);
  }

  /** Las filas de `rows` se vuelven a indexar (filas nuevas, otro `row-key`); las marcas de filas que
   *  ya no están se quitan. */
  #reindex(): void {
    this.#byId.clear();
    this.#index(this.#all, 0);
    for (const id of this.#picked) if (!this.#byId.has(id)) this.#picked.delete(id);
  }

  /** Otro `row-key`: los id cambian, así que las marcas, las ediciones y el historial (que van por
   *  id) ya no significan nada. */
  #rekey(): void {
    this.#settle();
    const had = this.#picked.size > 0;
    this.#picked.clear();
    this.#edited.clear();
    this.#orig.clear();
    this.#undo = [];
    this.#redo = [];
    if (this.#server) {
      if (this.#built) this.#reload();
    } else {
      this.#reindex();
      this.#paintAll();
    }
    this.#paintPicked(had);
  }

  /** Cambiaron las filas o las columnas: se recalcula todo lo que depende de ellas. `columnsOnly`:
   *  solo las columnas; con `source` no hace falta volver a pedir (no viajan en la consulta), salvo
   *  que aún no se haya pedido nada. */
  #dataChanged(columns = false, columnsOnly = false): void {
    if (!this.#built) return;
    if (!this.#server) this.#presetN.clear();
    this.#loc = nxFormat(this.locale);
    this.#sortedAll = null;
    this.#forgetText();
    if (columns) this.#buildHead();
    if (this.#server) return columnsOnly && this.#gen ? this.#paintAll() : this.#reload();
    // Las facetas salen de todas las columnas: esconder una no quita su filtro ni su lista.
    const auto = facetColumns(this.#cols, this.#all);
    this.#facetCols = this.#cols.filter((c) => (c.facet === true || (c.facet !== false && auto.includes(c))));
    this.#order = facetOrder(this.#facetCols, this.#all);
    this.#recompute("filter");
  }

  /** Filtros, orden o agrupación: en el cliente se recalcula; en el servidor se vuelve a pedir.
   *  `order`: solo cambió cómo se ordenan o agrupan las filas, no cuáles pasan. */
  #refilter(emit: boolean, stage: "filter" | "order" = "filter"): void {
    if (!this.#built) return;
    if (this.#server) this.#reload();
    else this.#recompute(stage);
    this.#clampSel();
    if (this.#live && !this.#server) this.#live.textContent = this.#rowsText();
    if (emit) this.#emit("nx-grid-filter", { filters: this.#filters, sort: this.#sort, groupBy: this.groupBy, search: this.#search.trim(), count: this.#rowCount() });
  }

  #setFilters(f: GridFilter[], emit = true): void {
    this.#filters = f;
    this.#refilter(emit);
  }

  /** `filter`: qué filas pasan (filtro y facetas en una pasada, histogramas y totales). Después,
   *  siempre: orden, grupos y la lista visible. Ordenar o agrupar no repite la primera etapa. */
  #recompute(stage: "filter" | "order"): void {
    const cols = this.#cols;
    if (stage === "filter") {
      // La búsqueda va primero: las facetas y los filtros de columna cuentan sobre lo que encontró.
      const q = this.#q;
      if (!q) this.#base = this.#all;
      else if (this.#baseQ !== q) this.#base = this.#all.filter((r) => this.#textOf(r).includes(q));
      this.#baseQ = q;
      const x = crossfilter(this.#base, this.#filters, this.#facetCols, this.#order);
      this.#filtered = x.filtered;
      this.#facetList = x.facets;
      this.#sumTotals();
    }
    this.#sorted = this.#sortOf(this.#filtered);
    const gc = this.#groupable().find((c) => c.key === this.groupBy);
    this.#groups = gc ? groupRows(this.#sorted, gc, cols, this.#loc) : null;
    this.#groupStats();
    this.#flatten();
    this.#paintAll();
  }

  /** Las filas que pasan, en orden. Filtrar no cambia el orden: se recorre el de todas las filas
   *  (ordenado una vez por orden y datos) y quedan las que pasan; con 100.000 nombres distintos,
   *  ordenar en cada tecla de la búsqueda costaba un cuarto de segundo. Si pasan pocas (y aún no hay
   *  orden de todas), se ordenan solas: un clic en la cabecera no ordena las que no se ven. */
  #sortOf(rows: GridRow[]): GridRow[] {
    const sort = this.#sort;
    if (!sort) return rows;
    let all = this.#sortedAll?.sort === sort ? this.#sortedAll.rows : null;
    if (!all && rows.length * 4 < this.#all.length) return sortRows(rows, sort, this.#cols, this.#loc);
    if (!all) this.#sortedAll = { sort, rows: (all = sortRows(this.#all, sort, this.#cols, this.#loc)) };
    if (rows.length === this.#all.length) return all;
    const pass = new Set(rows);
    return all.filter((r) => pass.has(r));
  }

  #textOf(r: GridRow): string {
    let t = this.#hay.get(r);
    if (t === undefined) this.#hay.set(r, (t = (this.#texter ??= rowTexter(this.#columns, this.#loc))(r)));
    return t;
  }

  /** Cambiaron las filas, las columnas que se ven o el locale: el texto de búsqueda se rehace. */
  #forgetText(): void {
    this.#baseQ = null;
    this.#hay = new WeakMap();
    this.#texter = undefined;
  }

  #sumTotals(): void {
    this.#totals = {};
    const money = this.#cols.filter((c) => colType(c) === "money");
    for (const r of this.#filtered) for (const c of money) this.#totals[c.key] = (this.#totals[c.key] ?? 0) + (num(r[c.key]) ?? 0);
  }

  /** Subtotales (se recalculan tras una edición) y el mayor de cada columna, para las barras. */
  #groupStats(): void {
    this.#groupMax = {};
    for (const g of this.#groups ?? []) {
      for (const c of this.#cols.filter(isNumeric)) {
        g.sums[c.key] = g.rows.reduce((a, r) => a + (num(r[c.key]) ?? 0), 0);
        this.#groupMax[c.key] = Math.max(this.#groupMax[c.key] ?? 0, Math.abs(g.sums[c.key]));
      }
    }
  }

  #flatten(): void {
    this.#view = this.#groups
      ? this.#groups.flatMap((g): Item[] => [{ g }, ...(this.#collapsed.has(g.key) ? [] : g.rows.map((r) => ({ r })))])
      : this.#sorted.map((r) => ({ r }));
  }

  #groupable(): GridColumn[] {
    if (this.#server) return [];
    return this.#cols.filter((c) => !isNumeric(c) && (colType(c) === "date" || this.#facetCols.includes(c)));
  }

  #count(): number {
    return this.#server ? this.#total : this.#view.length;
  }
  #rowCount(): number {
    return this.#server ? this.#total : this.#filtered.length;
  }

  #itemAt(i: number): Item | null {
    if (!this.#server) return this.#view[i] ?? null;
    const b = this.#blocks.get(Math.floor(i / BLOCK));
    const r = Array.isArray(b) ? b[i % BLOCK] : undefined;
    return r ? { r } : null;
  }

  // ---------------------------------------------------------------- servidor

  #reload(): void {
    // Las filas de la consulta anterior se sueltan: una edición abierta no puede seguir a la suya.
    this.#settle();
    this.#gen++;
    // Lo que seguía en camino de la consulta anterior ya no sirve: se corta.
    this.#ac?.abort();
    this.#ac = new AbortController();
    this.#blocks.clear();
    this.#fails.clear();
    clearTimeout(this.#retry);
    this.#retry = undefined;
    this.#loadError = false;
    this.#pageSig = "";
    // Solo quedan indexadas las filas de ESTA consulta: «Seleccionar todo», el conteo y las acciones
    // en lote nunca alcanzan filas que ya no pasan el filtro. Las marcas con id real se conservan
    // (pueden volver a aparecer); las posicionales de otra consulta ya no significan nada.
    this.#byId.clear();
    for (const id of this.#picked) if (id.startsWith("#")) this.#picked.delete(id);
    this.#win = { start: -1, end: -1 };
    void this.#load(0);
    this.#paintAll();
  }

  /** La consulta de ahora (orden, filtros y búsqueda). */
  #query(): { sort: GridSort | null; filters: GridFilter[]; search?: string } {
    return { sort: this.#sort, filters: this.#filters, ...(this.#search.trim() ? { search: this.#search.trim() } : {}) };
  }

  async #request(offset: number, limit: number, q: { sort: GridSort | null; filters: GridFilter[]; search?: string } = this.#query(), signal?: AbortSignal): Promise<GridPage | null> {
    const url = this.#url("source");
    if (!url) return null;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ offset, limit, ...q }),
      signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as GridPage;
    return data && Array.isArray(data.rows) ? data : null;
  }

  async #load(block: number): Promise<void> {
    if (this.#blocks.has(block)) return;
    // Un bloque que falló espera su turno (no se vuelve a pedir en cada cuadro del scroll).
    const fail = this.#fails.get(block);
    if (fail && fail.at > Date.now()) return fail.at < Infinity ? this.#retryLater(fail.at) : undefined;
    this.#blocks.set(block, "loading");
    const gen = this.#gen;
    const signal = (this.#ac ??= new AbortController()).signal;
    const q = this.#query();
    const offset = block * BLOCK;
    let page: GridPage | null = null;
    let raw: unknown[] = [];
    let error: unknown = null;
    try {
      page = await this.#request(offset, BLOCK, q, signal);
      raw = page?.rows ?? [];
      // El servidor puede tener un tope por página menor que el bloque: se pide lo que falta, desde
      // donde quedó, hasta llenarlo o llegar al total (si no, el resto del bloque quedaba como
      // esqueleto para siempre).
      const total = Number(page?.total) || 0;
      while (page && raw.length && raw.length < BLOCK && offset + raw.length < total) {
        const more = await this.#request(offset + raw.length, BLOCK - raw.length, q, signal);
        if (!more?.rows.length) break;
        raw = raw.concat(more.rows);
      }
    } catch (err) {
      error = err;
    }
    if (gen !== this.#gen) return;
    if (!page || error) {
      this.#blocks.delete(block);
      // Cortada porque la tabla salió del DOM: se pide otra vez al volver.
      if (signal?.aborted) return;
      return this.#failed(block, error ?? new Error("la respuesta no trae rows"));
    }
    const rows = raw.filter((r): r is GridRow => !!r && typeof r === "object").map(own);
    this.#fails.delete(block);
    if (block === 0) this.#loadError = false;
    this.#index(rows, offset);
    this.#blocks.set(block, rows);
    this.#evict();
    this.#total = Math.max(0, Number(page.total) || 0);
    // El conteo para el lector de pantalla, con el total nuevo (al filtrar aún no se sabía).
    if (block === 0 && this.#live) this.#live.textContent = this.#rowsText();
    if (page.histograms && typeof page.histograms === "object") this.#hist = new Map(Object.entries(page.histograms).filter(([, x]) => x && Array.isArray(x.counts)));
    if (Array.isArray(page.facets))
      this.#facetList = page.facets
        .filter((f) => f && typeof f.key === "string" && Array.isArray(f.options))
        .map((f) => ({
          key: f.key,
          label: f.label ?? f.key,
          options: f.options.map((o) => ({ value: String(o.value), label: String(o.label ?? o.value), count: Number(o.count) || 0 })),
          selected: (this.#filters.find((x) => x.key === f.key && x.op === "in") as { values: string[] } | undefined)?.values ?? [],
        }));
    if (page.totals && typeof page.totals === "object") this.#totals = page.totals;
    if (page.presets && typeof page.presets === "object")
      this.#presetN = new Map(Object.entries(page.presets).filter((e): e is [string, number] => typeof e[1] === "number"));
    // `client-max`: con la primera página se sabe el total (con los filtros, que nunca es mayor que
    // sin ellos). Si puede caber, se pide la consulta completa una vez, sin filtros.
    const max = this.clientMax;
    if (block === 0 && max && !this.#decided) {
      this.#decided = true;
      if (this.#total <= max) void this.#tryLocal(max);
    }
    // Un bloque que llega no rehace todo: el pie, las filas que esperaban sus datos (las que siguen a
    // la vista se reutilizan en el próximo cuadro) y, solo si cambiaron los agregados (o es el primer
    // bloque), la barra, los chips y las facetas.
    this.#footDirty = true;
    const sig = JSON.stringify([this.#total, page.facets, page.presets, page.histograms]);
    if (block === 0 || sig !== this.#pageSig) {
      this.#pageSig = sig;
      this.#paintChrome();
    }
    this.#paintFoot();
    this.#soon();
    this.#paintPicked(false);
  }

  /** Se descarta lo del servidor: lo que seguía en camino (y su reintento) y los bloques guardados. */
  #drop(): void {
    this.#gen++;
    this.#ac?.abort();
    this.#ac = undefined;
    this.#blocks.clear();
    this.#fails.clear();
    clearTimeout(this.#retry);
    this.#retry = undefined;
    this.#loadError = false;
  }

  /** Un bloque no llegó: se dice (`nx-grid-error`; sin filas, en el aviso, con «Reintentar») y se
   *  vuelve a pedir más tarde, cada vez con más espera, hasta `TRIES` veces: con el servidor caído
   *  del todo, la tabla no sigue pidiendo (ni emitiendo errores) para siempre. Después, o si ya no
   *  hay a dónde pedir, solo «Reintentar» o `refresh()`. */
  #failed(block: number, error: unknown): void {
    const n = (this.#fails.get(block)?.n ?? 0) + 1;
    const again = n < TRIES && !!this.#url("source");
    const at = again ? Date.now() + Math.min(30_000, 1000 * 2 ** (n - 1)) : Infinity;
    this.#fails.set(block, { n, at });
    if (again) this.#retryLater(at);
    if (block === 0) this.#loadError = true;
    this.#emit("nx-grid-error", { offset: block * BLOCK, limit: BLOCK, error: String((error as Error)?.message ?? error) });
    this.#paintChrome();
  }

  /** Vuelve a pintar (y así a pedir los bloques que faltan) en `at`, si no hay ya un intento antes. */
  #retryLater(at: number): void {
    if (this.#retry !== undefined && this.#retryAt <= at) return;
    clearTimeout(this.#retry);
    this.#retryAt = at;
    this.#retry = setTimeout(() => {
      this.#retry = undefined;
      this.#soon();
    }, Math.max(0, at - Date.now()));
  }

  /** Con más de `KEEP` bloques guardados, se sueltan los más lejanos a la vista (y sus filas del
   *  índice: «seleccionar todo» y las acciones en lote alcanzan las filas cargadas). */
  #evict(): void {
    if (this.#blocks.size <= KEEP) return;
    const mid = Math.floor(Math.max(0, this.#win.start) / BLOCK);
    const far = [...this.#blocks.keys()].filter((b) => Array.isArray(this.#blocks.get(b))).sort((a, b) => Math.abs(b - mid) - Math.abs(a - mid));
    for (const b of far.slice(0, this.#blocks.size - KEEP)) {
      for (const r of this.#blocks.get(b) as GridRow[]) {
        const id = this.#ids.get(r);
        if (id !== undefined && this.#byId.get(id) === r) this.#byId.delete(id);
      }
      this.#blocks.delete(b);
    }
  }

  /** Trae la consulta completa (hasta `max` + 1 filas) y, si cabe, sigue en el cliente con ella. */
  async #tryLocal(max: number): Promise<void> {
    const src = this.getAttribute("source");
    const ac = (this.#tryAc = new AbortController());
    let page: GridPage | null = null;
    try {
      page = await this.#request(0, max + 1, { sort: null, filters: [] }, ac.signal);
    } catch {
      return; // se queda en el servidor
    } finally {
      if (this.#tryAc === ac) this.#tryAc = undefined;
    }
    // Mientras tanto cambió el origen o el tope: esa respuesta ya no dice nada.
    if (!page || src !== this.getAttribute("source") || !this.#server || !this.#decided) return;
    const rows = page.rows.filter((r) => r && typeof r === "object");
    if (rows.length > max || rows.length < (Number(page.total) || 0)) return;
    // Lo que falte por llegar del servidor se descarta.
    this.#drop();
    clearTimeout(this.#wait);
    this.#wait = undefined;
    this.#local = true;
    this.rows = rows;
  }

  /** Todas las filas de la consulta (para exportar), por bloques: nunca una sola respuesta con
   *  millones de filas. Se detiene en el tope de una hoja de Excel. La consulta se toma una vez, al
   *  empezar: si la persona filtra mientras exporta, el archivo no mezcla dos consultas. */
  async #fetchAll(): Promise<GridRow[]> {
    const out: GridRow[] = [];
    const q = this.#query();
    // El servidor puede mandar menos de lo pedido (un tope por página, p. ej. 100): se sigue desde
    // donde quedó hasta el total, no se corta en el primer bloque corto.
    for (let offset = 0, i = 0; out.length < EXPORT_MAX && i < 20_000; i++) {
      const page = await this.#request(offset, EXPORT_BLOCK, q);
      if (!page?.rows.length) break;
      for (const r of page.rows) if (r && typeof r === "object" && out.length < EXPORT_MAX) out.push(r);
      offset += page.rows.length;
      if (offset >= (Number(page.total) || 0)) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- vistas y columnas

  /** Las columnas que se ven. Nunca todas ocultas: una tabla sin columnas no se puede arreglar
   *  desde ella misma. */
  #syncColumns(): void {
    this.#forgetText();
    this.#columns = this.#cols.filter((c) => !this.#hidden.has(c.key));
    if (!this.#columns.length && this.#cols.length) {
      this.#hidden.clear();
      this.#columns = this.#cols;
    }
  }

  /** Aplica una vista (guardada, con su `id`, o suelta). Lo de columnas que ya no existen se quita,
   *  y se dice. */
  #applyView(v: unknown, id: string | null): void {
    const x = cleanView(v);
    const known = (k: string) => !this.#cols.length || this.#cols.some((c) => c.key === k);
    const gone = [...new Set([...x.filters.map((f) => f.key), ...(x.sort ? [x.sort.key] : [])].filter((k) => !known(k)))];
    this.#activeView = id;
    this.#hidden = new Set(x.hidden);
    this.#widths = new Map(Object.entries(x.widths));
    this.#syncColumns();
    this.#sort = x.sort && known(x.sort.key) ? x.sort : null;
    this.#filters = x.filters.filter((f) => known(f.key));
    if (this.#note) {
      this.#note.hidden = !gone.length;
      this.#note.textContent = gone.length ? this.#fmt(this.#labels.gone, { cols: gone.map((k) => `«${k}»`).join(", ") }) : "";
    }
    if (this.#built) this.#buildHead();
    this.#collapsed.clear();
    // `group-by` es un atributo: se cambia sin que su aviso vuelva a calcular; se calcula una vez aquí.
    this.#quiet = true;
    this.groupBy = x.groupBy;
    this.#quiet = false;
    this.#refilter(true);
  }

  /** Con `views-storage`: la vista marcada «abrir con esta vista» se aplica al empezar (una vez por
   *  clave), y el menú se trae en reposo para poner su nombre en el botón. */
  #bootViews(): void {
    const key = this.viewsStorage;
    if (!key || key === this.#booted) return;
    this.#booted = key;
    this.#viewList = null;
    const d = this.views.find((v) => v.default);
    if (d) this.#applyView(d, d.id);
    void this.#loadViews().catch(() => {});
  }

  /** Si el menú ya está cargado, en el mismo clic; si no, al llegar. */
  #withViews(fn: (v: ViewsUI) => void): void {
    if (this.#viewsUI) fn(this.#viewsUI);
    else void this.#loadViews().then(fn, (err) => console.warn("[nx-grid] no se pudo cargar el menú de vistas", err));
  }

  /** Si la carga falla (un corte de red, un despliegue que borró el archivo), no se recuerda: el
   *  siguiente clic lo vuelve a intentar. */
  #loadViews(): Promise<ViewsUI> {
    return (this.#viewsLoad ??= import("./grid-views").then(
      (m) => (this.#viewsUI = new m.ViewsUI(this.#viewsHost())),
      (err) => {
        this.#viewsLoad = undefined;
        throw err;
      },
    ));
  }

  /** Esconde o muestra una columna. */
  #setHidden(key: string, hidden: boolean): void {
    this.#settle();
    if (hidden) this.#hidden.add(key);
    else this.#hidden.delete(key);
    this.#syncColumns();
    this.#buildHead();
    // La búsqueda mira las columnas que se ven: esconder o mostrar una puede cambiar lo que encuentra.
    if (this.#q && !this.#server) this.#recompute("filter");
    this.#clampSel();
    this.#paintAll();
  }

  /** El ancho de una columna (null: el original). `paint`: al soltar, no en cada paso del arrastre. */
  #setWidth(key: string, w: number | null, paint = true): void {
    if (w === null) this.#widths.delete(key);
    else this.#widths.set(key, clampW(w));
    this.#applyWidths();
    if (paint) this.#paintChrome();
  }

  #widthOf(c: GridColumn): number {
    return this.#widths.get(c.key) ?? c.width ?? WIDTH[colType(c)] ?? 160;
  }

  #applyWidths(): void {
    const widths = this.#columns.map((c) => this.#widthOf(c));
    const check = this.selectable ? "36px " : "";
    this.#scroll!.style.setProperty("--_cols", check + widths.map((w, i) => (i === widths.length - 1 ? `minmax(${w}px, 1fr)` : `${w}px`)).join(" "));
    const w = `${widths.reduce((a, b) => a + b, check ? 36 : 0)}px`;
    this.#scroll!.style.setProperty("--_w", w);
    // El relleno de la barra de arriba mide lo mismo que las columnas: su barra nativa aparece justo
    // cuando la tabla desborda, en el mismo pase de maquetación (sin medir ni observar nada).
    this.#hbar!.style.setProperty("--_w", w);
    this.#ths.forEach((th, i) => th.querySelector(".nx-grid__resize")?.setAttribute("aria-valuenow", String(widths[i])));
  }

  #viewsHost(): ViewsHost {
    const self = this;
    return {
      el: this,
      get labels() {
        return self.#labels;
      },
      get labelsIn() {
        return self.#labelsIn;
      },
      get cols() {
        return self.#cols;
      },
      get hidden() {
        return self.#hidden;
      },
      get view() {
        return self.view;
      },
      get views() {
        return self.views;
      },
      get active() {
        return self.#activeView;
      },
      apply: (id) => {
        const v = id && this.views.find((x) => x.id === id);
        this.#applyView(v || {}, v ? v.id : null);
      },
      save: (list, active) => {
        this.views = list;
        this.#activeView = active;
        this.#paintChrome();
      },
      setHidden: (key, hidden) => this.#setHidden(key, hidden),
      resetColumns: () => {
        this.#hidden.clear();
        this.#widths.clear();
        this.#setHidden("", false);
      },
      chipText: (f) => this.#chipText(f),
      viewsBtn: this.#viewsBtn!,
      colsBtn: this.#colsBtn!,
    };
  }

  // ---------------------------------------------------------------- estructura

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }
  #fmt(t: string, vars: Record<string, string | number>): string {
    return t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  }
  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  #build(): void {
    this.#built = true;
    const u = this.#uid;
    this.#viewsBtn = h("button", { type: "button", class: "nx-grid__btn nx-grid__views", "aria-haspopup": "dialog", hidden: true }, glyph(BOOKMARK), h("span"));
    this.#viewsBtn.addEventListener("click", () => this.#withViews((v) => v.toggleViews()));
    this.#colsBtn = h("button", { type: "button", class: "nx-grid__btn", "aria-haspopup": "dialog" }, glyph(COLUMNS), h("span"));
    this.#colsBtn.addEventListener("click", () => this.#withViews((v) => v.toggleColumns()));
    this.#facetBtn = h("button", { type: "button", class: "nx-grid__btn", "aria-controls": `${u}-facets` }, glyph(SLIDERS), h("span"), h("span", { class: "nx-grid__badge" }));
    this.#facetBtn.addEventListener("click", () => (this.facetsOpen = !this.facetsOpen));
    // `data-nx-ephemeral`: filtrar, agrupar o seleccionar no son cambios de datos (un <nx-dialog> que
    // contiene la tabla no los cuenta como «cambios sin guardar»).
    this.#groupSel = h("select", { class: "nx-grid__btn nx-grid__group", "data-nx-ephemeral": "" });
    this.#groupSel.addEventListener("change", () => (this.groupBy = this.#groupSel!.value));
    this.#exportBtn = h("button", { type: "button", class: "nx-grid__btn" }, glyph(DOWNLOAD), h("span"));
    // Mientras exporta (en modo servidor pide todas las filas, puede tardar), el botón gira y no
    // atiende otro clic. No se usa `disabled`: sacaría el foco del botón al teclado.
    this.#exportBtn.addEventListener("click", () => {
      const b = this.#exportBtn!;
      if (b.hasAttribute("aria-busy")) return;
      b.setAttribute("aria-busy", "true");
      this.#paintChrome();
      // El resultado se dice: en la región viva y, si falló, también en la nota sobre la tabla. La
      // nota es la misma del aviso de una vista: un éxito solo quita el error de una exportación
      // anterior, no ese aviso.
      const say = (text: string, failed: boolean) => {
        if (this.#live) this.#live.textContent = text;
        const note = this.#note!;
        if (failed) note.textContent = text;
        else if (note.textContent === this.#labels.exportError) note.textContent = "";
        note.hidden = !note.textContent;
      };
      this.exportXlsx()
        .then(
          (n) => say(this.#fmt(this.#labels.exported, { n: this.#loc.number(n) }), false),
          (err) => {
            console.warn("[nx-grid] no se pudo exportar", err);
            say(this.#labels.exportError, true);
          },
        )
        .finally(() => {
          b.removeAttribute("aria-busy");
          this.#paintChrome();
        });
    });
    this.#undoBtn = h("button", { type: "button", class: "nx-grid__btn nx-grid__icon" }, glyph(UNDO));
    this.#redoBtn = h("button", { type: "button", class: "nx-grid__btn nx-grid__icon" }, glyph(REDO));
    this.#undoBtn.addEventListener("click", () => this.undo());
    this.#redoBtn.addEventListener("click", () => this.redo());
    // Buscar en la tabla: mientras se escribe (un momento después de la última tecla), o con Enter.
    const input = (this.#searchInput = h("input", { type: "search", class: "nx-grid__search-input", autocomplete: "off", spellcheck: "false", enterkeyhint: "search" }));
    const clear = (this.#searchClear = h("button", { type: "button", class: "nx-grid__search-clear", hidden: true }, glyph(X)));
    const search = h("div", { class: "nx-grid__search", role: "search", "data-nx-ephemeral": "" }, glyph("search"), input, clear);
    input.addEventListener("input", () => {
      clear.hidden = !input.value;
      clearTimeout(this.#searchWait);
      this.#searchWait = setTimeout(() => (this.search = input.value), this.#server ? SERVER_WAIT : 150);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this.search = input.value;
      else if (e.key === "Escape" && input.value) this.search = "";
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
    clear.addEventListener("click", () => {
      this.search = "";
      input.focus();
    });
    const bar = h("div", { class: "nx-grid__bar" }, this.#viewsBtn, search, this.#facetBtn, this.#groupSel, this.#colsBtn, this.#undoBtn, this.#redoBtn, this.#exportBtn);

    this.#selbar = h("div", { class: "nx-grid__selbar", hidden: true }, h("strong"), h("button", { type: "button", class: "nx-grid__clear", "data-pick": "all" }), h("button", { type: "button", class: "nx-grid__clear", "data-pick": "none" }));
    this.#selbar.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-pick]");
      if (b) this.#pickAll(b.dataset.pick === "all");
    });
    this.#note = h("p", { class: "nx-grid__note", hidden: true });
    this.#chips = h("div", { class: "nx-grid__chips" });
    this.#chips.addEventListener("click", (e) => {
      const edit = (e.target as Element).closest<HTMLElement>("[data-edit]");
      if (edit) return void this.#toggleFilter(edit.dataset.edit!, edit);
      if ((e.target as Element).closest("[data-save-view]")) return this.#withViews((v) => v.toggleViews(true));
      const b = (e.target as Element).closest<HTMLElement>("[data-i], [data-clear]");
      if (!b) return;
      if (b.dataset.clear !== undefined) this.clearFilters();
      else this.#setFilters(this.#filters.filter((_, i) => i !== Number(b.dataset.i)));
      this.#scroll?.focus({ preventScroll: true });
    });

    this.#aside = h("aside", { class: "nx-grid__facets", id: `${u}-facets`, "data-nx-ephemeral": "" });
    this.#aside.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      const key = t.dataset.key;
      if (t.type !== "checkbox" || !key) return;
      const values = this.#facetList.find((f) => f.key === key)?.options.map((o) => o.value);
      this.#setFilters(toggleFacet(this.#filters, key, t.dataset.value ?? "", values));
    });
    this.#aside.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.q === undefined) return;
      this.#facetQ.set(t.dataset.q, t.value);
      this.#paintFacets();
    });
    this.#aside.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-more], [data-clear]");
      if (!b) return;
      if (b.dataset.clear !== undefined) return this.clearFilters();
      const k = b.dataset.more!;
      if (!this.#facetMore.delete(k)) this.#facetMore.add(k);
      this.#paintFacets();
    });

    this.#head = h("div", { class: "nx-grid__head", role: "row", "aria-rowindex": 1 });
    this.#head.addEventListener("click", (e) => this.#onHeadClick(e));
    // El borde de una cabecera cambia su ancho: arrastrar, doble clic (el original) o flechas.
    this.#head.addEventListener("pointerdown", (e) => {
      const hd = (e.target as Element).closest<HTMLElement>("[data-resize]");
      const col = hd && this.#columns[Number(hd.dataset.resize)];
      if (!hd || !col || e.button !== 0) return;
      e.preventDefault();
      const x0 = e.clientX;
      const w0 = hd.parentElement!.getBoundingClientRect().width;
      const dir = getComputedStyle(this).direction === "rtl" ? -1 : 1;
      hd.setPointerCapture?.(e.pointerId);
      const move = (ev: PointerEvent) => this.#setWidth(col.key, w0 + (ev.clientX - x0) * dir, false);
      const up = () => {
        hd.removeEventListener("pointermove", move);
        hd.removeEventListener("pointerup", up);
        hd.removeEventListener("pointercancel", up);
        this.#paintChrome();
      };
      hd.addEventListener("pointermove", move);
      hd.addEventListener("pointerup", up);
      hd.addEventListener("pointercancel", up);
    });
    this.#head.addEventListener("dblclick", (e) => {
      const hd = (e.target as Element).closest<HTMLElement>("[data-resize]");
      const col = hd && this.#columns[Number(hd.dataset.resize)];
      if (col) this.#setWidth(col.key, null);
    });
    this.#head.addEventListener("keydown", (e) => this.#onHeadKey(e));
    // El panel se trae antes de que haga falta: al acercarse a la cabecera.
    for (const ev of ["pointerenter", "focusin"]) this.#head.addEventListener(ev, () => void this.#loadPanel().catch(() => {}), { once: true });
    this.#rowsEl = h("div", { class: "nx-grid__rows", role: "rowgroup" });
    this.#body = h("div", { class: "nx-grid__body", role: "presentation" }, this.#rowsEl);
    this.#emptyCell = h("span", { role: "gridcell" });
    this.#empty = h("div", { class: "nx-grid__empty", role: "row", "aria-rowindex": 2, hidden: true }, this.#emptyCell);
    this.#empty.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-retry]")) {
        this.refresh();
        return this.#scroll!.focus({ preventScroll: true });
      }
      const b = (e.target as Element).closest<HTMLElement>("[data-relax]");
      if (!b) return;
      const k = b.dataset.relax;
      if (k) this.#setFilters(this.#filters.filter((f) => f.key !== k));
      else this.search = "";
    });
    // Las líneas de las columnas hasta el fondo (con pocas filas, sin un recuadro en blanco debajo):
    // un relleno con las mismas columnas, primero en el árbol para quedar detrás de las filas.
    this.#fill = h("div", { class: "nx-grid__fill", "aria-hidden": "true" });
    this.#scroll = h("div", { class: "nx-grid__scroll", role: "grid", tabindex: 0, "aria-multiselectable": "true" }, this.#fill, this.#head, this.#body, this.#empty);
    this.#scroll.addEventListener(
      "scroll",
      () => {
        this.#follow(this.#scroll!, this.#hbar!);
        this.#soon();
      },
      { passive: true },
    );
    // La barra de arriba (`top-scrollbar`) es un espejo: otro scroller con un relleno del ancho de
    // las columnas. Con `top-scrollbar="false"`, el CSS la deja en `display: none`. Fuera de la tabla y del árbol
    // de accesibilidad (el que se recorre es el `role="grid"`), y fuera del orden del teclado: Chrome
    // enfoca un scroller sin hijos enfocables.
    this.#hbar = h("div", { class: "nx-grid__hscroll", "aria-hidden": "true", tabindex: -1 }, h("div"));
    this.#hbar.addEventListener("scroll", () => this.#follow(this.#hbar!, this.#scroll!), { passive: true });
    this.#scroll.addEventListener("keydown", (e) => this.#onKey(e));
    this.#scroll.addEventListener("copy", (e) => this.#copy(e));
    this.#scroll.addEventListener("paste", (e) => this.#paste(e));
    this.#rowsEl.addEventListener("pointerdown", (e) => this.#onPointerDown(e));
    this.#rowsEl.addEventListener("pointerover", (e) => {
      if (!this.#dragging) return;
      const p = this.#posOf(e.target);
      if (p && (p.r !== this.#act.r || p.c !== this.#act.c)) {
        this.#act = p;
        this.#paintSel();
      }
    });
    this.#rowsEl.addEventListener("contextmenu", (e) => {
      const p = this.#posOf(e.target);
      if (!p || this.#editing || !this.#menuFor(p)) return;
      e.preventDefault();
      this.#act = this.#anchor = p;
      this.#paintSel();
      void this.#cellMenu(p, e.clientX, e.clientY);
    });
    // Doble clic: edita la celda, o abre la fila. No mientras se edita (el doble clic que
    // selecciona una palabra en el campo rehacía el campo y borraba lo escrito) ni con el dedo
    // (lo atiende el segundo toque, abajo; si no, se abriría dos veces).
    this.#rowsEl.addEventListener("dblclick", (e) => {
      if (!this.#editing && !this.#touch && this.#posOf(e.target) && !this.#startEdit()) this.#openRow();
    });
    this.#rowsEl.addEventListener("click", (e) => {
      const t = e.target as Element;
      const tap = this.#tap;
      this.#tap = null;
      const box = t.closest<HTMLInputElement>("input[data-pick]");
      if (box) return this.#pick(Number(box.closest<HTMLElement>("[data-r]")!.dataset.r), box.checked, (e as MouseEvent).shiftKey);
      const p = this.#posOf(t);
      if (t.closest(".nx-grid__link")) {
        if (p) this.#act = this.#anchor = p;
        return this.#openRow();
      }
      // Con el dedo, tocar otra vez la celda activa es el doble clic: en iOS no llega `dblclick`, y
      // así el teclado del celular abre (el foco se pide dentro del toque).
      if (tap && p && p.r === tap.r && p.c === tap.c && !this.#editing && !this.#startEdit()) this.#openRow();
    });
    this.#head.addEventListener("change", (e) => {
      if ((e.target as HTMLInputElement).dataset.pickAll !== undefined) this.#pickAll((e.target as HTMLInputElement).checked);
    });
    const main = h("div", { class: "nx-grid__main" }, this.#aside, this.#hbar, this.#scroll);

    this.#foot = h("div", { class: "nx-grid__foot" });
    this.#live = h("span", { class: "nx-sr-only", role: "status" });
    this.#presetBar = h("div", { class: "nx-grid__presets", role: "group", hidden: true });
    this.#presetBar.addEventListener("click", (e) => {
      const id = (e.target as Element).closest<HTMLElement>("[data-preset]")?.dataset.preset;
      const p = this.#presets.find((x) => x.id === id);
      if (!p) return;
      if (this.#presetOn(p)) {
        this.#setFilters(this.#beforePreset ?? []);
        this.#beforePreset = null;
      } else {
        if (!this.#presets.some((x) => this.#presetOn(x))) this.#beforePreset = this.#filters;
        this.#setFilters(validFilters(p.filters));
      }
    });
    this.append(this.#presetBar, bar, this.#selbar, this.#note, this.#chips, main, this.#foot, this.#live);
  }

  /** La tabla es una sola parada de Tab (patrón grid de la APG): los controles de la cabecera van
   *  con `tabindex="-1"` y se llega a ellos con las flechas (ver `#onHeadKey`). Con `selectable`, la
   *  columna de casillas es la primera: `aria-colcount` y `aria-colindex` la cuentan. */
  #buildHead(): void {
    const cols = this.#columns;
    const off = this.selectable ? 1 : 0;
    this.#scroll!.setAttribute("aria-colcount", String(cols.length + off));
    this.#ths = cols.map((c, ci) =>
      h(
        "div",
        { role: "columnheader", class: `nx-grid__th${isNumeric(c) ? " is-num" : ""}`, "aria-colindex": ci + 1 + off },
        h("button", { type: "button", class: "nx-grid__sort", tabindex: -1, "data-sort": ci }, h("span", { class: "nx-grid__th-label" }, c.label), glyph(ARROW, "nx-grid__sort-icon")),
        this.#filterable(c) ? h("button", { type: "button", class: "nx-grid__funnel", tabindex: -1, "data-filter": ci, "aria-haspopup": "dialog", "aria-expanded": "false" }, glyph(FUNNEL)) : null,
        h("span", { class: "nx-grid__resize", role: "separator", tabindex: -1, "aria-orientation": "vertical", "aria-valuemin": MIN_W, "aria-valuemax": MAX_W, "data-resize": ci }),
      ),
    );
    this.#applyWidths();
    this.#panel?.close();
    this.#headCheck = this.selectable ? h("input", { type: "checkbox", tabindex: -1, "data-pick-all": "", "data-nx-ephemeral": "" }) : undefined;
    this.#head!.replaceChildren(...(this.#headCheck ? [h("div", { role: "columnheader", class: "nx-grid__th nx-grid__check", "aria-colindex": 1 }, this.#headCheck)] : []), ...this.#ths);
    this.#fill!.replaceChildren(...[...this.#head!.children].map(() => h("i")));
    this.#win = { start: -1, end: -1 };
  }

  // ---------------------------------------------------------------- pintar

  #paintAll(): void {
    if (!this.#built) return;
    this.#footDirty = true;
    this.#paintChrome();
    this.#paintRows(true);
    this.#paintPicked(false);
  }

  /** Todo menos las filas: barra, chips, cabeceras, facetas, historial y el filtro abierto. */
  #paintChrome(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const height = Number(this.getAttribute("height"));
    if (height > 0) this.style.setProperty("--nx-grid-height", `${height}px`);
    else this.style.removeProperty("--nx-grid-height");
    // Barra de herramientas.
    this.#searchInput!.placeholder = L.searchTable;
    this.#searchInput!.setAttribute("aria-label", L.searchTable);
    this.#searchClear!.setAttribute("aria-label", L.clearSearch);
    this.#paintSearch();
    const applied = this.#filters.reduce((a, f) => a + ("values" in f ? f.values.length : 1), 0);
    this.#facetBtn!.hidden = !this.#facetList.length;
    this.#facetBtn!.setAttribute("aria-expanded", String(this.facetsOpen));
    this.#facetBtn!.children[1].textContent = L.filters;
    this.#facetBtn!.children[2].textContent = applied ? String(applied) : "";
    const groupable = this.#groupable();
    this.#groupSel!.hidden = !groupable.length;
    this.#groupSel!.setAttribute("aria-label", this.#fmt(L.groupBy, { col: "" }).trim());
    // Las opciones se rehacen solo si cambian (no con cada bloque que llega del servidor).
    const groupKey = JSON.stringify([L.noGroup, L.groupBy, groupable.map((c) => [c.key, c.label])]);
    if (groupKey !== this.#groupKey) {
      this.#groupKey = groupKey;
      this.#groupSel!.replaceChildren(h("option", { value: "" }, L.noGroup), ...groupable.map((c) => h("option", { value: c.key }, this.#fmt(L.groupBy, { col: c.label }))));
    }
    this.#groupSel!.value = groupable.some((c) => c.key === this.groupBy) ? this.groupBy : "";
    this.#exportBtn!.lastElementChild!.textContent = this.#exportBtn!.hasAttribute("aria-busy") ? L.exporting : L.export;
    this.#viewsBtn!.hidden = !this.viewsStorage;
    if (!this.#viewsUI) this.#viewsBtn!.lastElementChild!.textContent = L.views;
    this.#colsBtn!.hidden = this.#cols.length < 2;
    this.#colsBtn!.lastElementChild!.textContent = L.columns;
    // Chips.
    this.#chips!.hidden = !this.#filters.length;
    this.#chips!.replaceChildren(
      ...this.#filters.map((f, i) => {
        const text = this.#chipText(f);
        const col = this.#cols.find((c) => c.key === f.key);
        // El texto del chip vuelve a abrir el filtro de su columna.
        const label = col && this.#filterable(col) ? h("button", { type: "button", class: "nx-grid__chip-edit", "data-edit": f.key, title: this.#fmt(L.filterBy, { col: col.label }) }, text) : h("span", null, text);
        return h("span", { class: "nx-grid__chip" }, label, h("button", { type: "button", "data-i": i, "aria-label": `${L.remove}: ${text}` }, glyph(X)));
      }),
      h("button", { type: "button", class: "nx-grid__clear", "data-clear": "" }, L.clear),
      ...(this.viewsStorage ? [h("button", { type: "button", class: "nx-grid__save-view", "data-save-view": "" }, L.saveView)] : []),
    );
    // Cabeceras.
    this.#ths.forEach((th, ci) => this.#paintTh(th, this.#columns[ci]));
    this.#scroll!.setAttribute("aria-rowcount", String(this.#count() + 1));
    // Sin filas todavía porque el servidor no ha respondido: «Cargando…», no una tabla en blanco
    // (parecía que no había datos). Con filas ya contadas, las que faltan se pintan como esqueleto.
    const loading = this.#server && this.#blocks.get(0) === "loading" && !this.#count() && this.#columns.length > 0;
    // Si la primera página no llegó, se dice (no «Cargando…» para siempre) y se ofrece reintentar.
    const failed = !loading && this.#server && this.#loadError && !this.#count() && this.#columns.length > 0;
    this.#empty!.hidden = !loading && !failed && (this.#count() > 0 || !this.#columns.length);
    // Sin filas, las líneas cruzarían el aviso: solo con filas.
    this.#fill!.hidden = !this.#count();
    this.#empty!.classList.toggle("is-loading", loading);
    if (failed) this.#emptyCell!.replaceChildren(L.loadError, h("span", { class: "nx-grid__relax" }, h("button", { type: "button", class: "nx-grid__btn", "data-retry": "" }, L.retry)));
    else this.#emptyCell!.replaceChildren(loading ? L.loading : L.empty, ...(this.#empty!.hidden || loading ? [] : this.#relax()));
    this.#paintFacets();
    this.#paintPresets();
    this.#paintHistory();
    this.#panel?.refresh();
    this.#viewsUI?.refresh();
  }

  /** Si los filtros de ahora son los del atajo (en cualquier orden): su tarjeta queda marcada, y se
   *  desmarca sola si la persona cambia un filtro a mano o aplica una vista. */
  #presetOn(p: GridPreset): boolean {
    const canon = (fs: readonly GridFilter[]) =>
      fs
        .map((f) => JSON.stringify(f, Object.keys(f).sort()))
        .sort()
        .join();
    return canon(this.#filters) === canon(validFilters(p.filters));
  }

  #paintPresets(): void {
    const bar = this.#presetBar;
    if (!bar) return;
    const list = this.#presets;
    // Con las filas aquí, cada atajo se cuenta una vez por juego de datos (no en cada pintado).
    if (!this.#server && list.some((p) => !this.#presetN.has(p.id)))
      for (const p of list) this.#presetN.set(p.id, applyFilters(this.#all, validFilters(p.filters)).length);
    const state = list.map((p) => [p.id, p.label, p.hint, this.#presetN.get(p.id), this.#presetOn(p)]);
    const key = JSON.stringify([this.#labels.presets, this.locale, state]);
    if (key === this.#presetKey) return;
    this.#presetKey = key;
    bar.hidden = !list.length;
    bar.setAttribute("aria-label", this.#labels.presets);
    bar.replaceChildren(
      ...list.map((p) => {
        const n = this.#presetN.get(p.id);
        return h(
          "button",
          { type: "button", class: "nx-grid__preset", "data-preset": p.id, "aria-pressed": String(this.#presetOn(p)) },
          h("strong", null, n === undefined ? "—" : this.#loc.number(n)),
          h("span", null, p.label),
          p.hint ? h("small", null, p.hint) : null,
        );
      }),
    );
  }

  /** Sin filas: qué filtro quitar (o la búsqueda), y cuántas volverían (en el cliente; en el
   *  servidor no se sabe). */
  #relax(): HTMLElement[] {
    if (this.#server || (!this.#filters.length && !this.#q)) return [];
    const opts = [...new Set(this.#filters.map((f) => f.key))].map((key) => ({
      key,
      n: this.#others(key).length,
      what: this.#filters
        .filter((f) => f.key === key)
        .map((f) => `«${this.#chipText(f)}»`)
        .join(", "),
    }));
    // La búsqueda también se puede quitar (su botón lleva la clave vacía).
    if (this.#q) opts.push({ key: "", n: applyFilters(this.#all, this.#filters).length, what: `«${this.#search.trim()}»` });
    const top = opts
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 2);
    if (!top.length) return [];
    return [
      h(
        "span",
        { class: "nx-grid__relax" },
        ...top.map(({ key, n, what }) =>
          h("button", { type: "button", class: "nx-grid__btn", "data-relax": key }, this.#fmt(this.#labels.relax.split("|")[n === 1 ? 0 : 1] ?? this.#labels.relax, { filter: what, n: this.#loc.number(n) })),
        ),
      ),
    ];
  }

  /** La caja de búsqueda dice lo mismo que `search` (se asigna también desde código). */
  #paintSearch(): void {
    if (!this.#searchInput) return;
    if (this.#searchInput.value !== this.#search) this.#searchInput.value = this.#search;
    this.#searchClear!.hidden = !this.#search;
  }

  #chipText(f: GridFilter): string {
    return filterLabel(f, this.#colOf(f.key), this.#loc, this.#labels);
  }

  /** Los botones de deshacer y rehacer: solo si hay columnas editables. */
  #paintHistory(): void {
    const L = this.#labels;
    const editable = this.#columns.some((c) => c.editable);
    for (const [b, label, on] of [
      [this.#undoBtn!, `${L.undo} (Ctrl+Z)`, this.canUndo],
      [this.#redoBtn!, `${L.redo} (Ctrl+Y)`, this.canRedo],
    ] as const) {
      b.hidden = !editable;
      b.disabled = !on;
      b.setAttribute("aria-label", label);
      b.title = label;
    }
  }

  #colOf(key: string): GridColumn | undefined {
    const c = this.#cols.find((x) => x.key === key);
    const f = this.#facetList.find((x) => x.key === key);
    // En modo servidor, las etiquetas de los valores vienen de las facetas.
    return c && !c.options && f ? { ...c, options: f.options.map((o) => ({ value: o.value, label: o.label })) } : c;
  }

  #paintTh(th: HTMLElement, c: GridColumn): void {
    th.querySelector(".nx-grid__resize")?.setAttribute("aria-label", this.#fmt(this.#labels.resize, { col: c.label }));
    const dir = this.#sort?.key === c.key ? this.#sort.dir : 0;
    th.setAttribute("aria-sort", dir === 1 ? "ascending" : dir === -1 ? "descending" : "none");
    th.dataset.sort = dir ? (dir === 1 ? "asc" : "desc") : "";
    const funnel = th.querySelector<HTMLElement>(".nx-grid__funnel");
    if (!funnel) return;
    const own = this.#filters.filter((f) => f.key === c.key);
    funnel.classList.toggle("is-on", own.length > 0);
    const label = own.length ? this.#fmt(this.#labels.filterOn, { col: c.label, filter: own.map((f) => this.#chipText(f)).join(", ") }) : this.#fmt(this.#labels.filterBy, { col: c.label });
    funnel.setAttribute("aria-label", label);
    funnel.title = label;
  }

  #paintFacets(): void {
    const aside = this.#aside!;
    const open = this.facetsOpen && this.#facetList.length > 0;
    aside.hidden = !open;
    if (!open) return;
    const L = this.#labels;
    const focused = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>("[data-focus]");
    const focusKey = aside.contains(focused ?? null) ? focused!.dataset.focus : undefined;
    // Lo marcado: un `in`, o lo que deja una exclusión («sin Cali», del filtro de la cabecera).
    const sel = (f: GridFacet) => [...(selection(this.#filters, f.key, f.options.map((o) => o.value)) ?? [])];
    aside.setAttribute("aria-label", L.filters);
    aside.replaceChildren(
      h("div", { class: "nx-grid__facets-head" }, h("strong", null, L.filters), this.#filters.length ? h("button", { type: "button", class: "nx-grid__clear", "data-clear": "" }, L.clear) : null),
      ...this.#facetList.map((f) => {
        const selected = sel(f);
        const raw = this.#facetQ.get(f.key) ?? "";
        const q = foldText(raw.trim());
        const opts = q ? f.options.filter((o) => foldText(o.label).includes(q)) : f.options;
        const expanded = this.#facetMore.has(f.key);
        const shown = q || expanded ? opts : opts.filter((o, i) => i < FACET_SHOWN || selected.includes(o.value));
        return h(
          "section",
          { class: "nx-grid__facet" },
          h("h3", { class: "nx-grid__facet-title" }, f.label, selected.length ? h("span", { class: "nx-grid__facet-n" }, String(selected.length)) : null),
          f.options.length > 8
            ? h("input", { type: "search", class: "nx-grid__facet-q", placeholder: L.search, value: raw, "aria-label": `${L.search}: ${f.label}`, "data-q": f.key, "data-focus": `q\u0000${f.key}` })
            : null,
          h(
            "ul",
            { class: "nx-grid__opts" },
            ...shown.map((o) => {
              const on = selected.includes(o.value);
              return h(
                "li",
                null,
                h(
                  "label",
                  { class: `nx-grid__opt${!o.count && !on ? " is-zero" : ""}` },
                  h("input", { type: "checkbox", checked: on, disabled: !o.count && !on, "data-key": f.key, "data-value": o.value, "data-focus": `${f.key}\u0000${o.value}` }),
                  h("span", { class: "nx-grid__opt-label" }, o.label),
                  h("span", { class: "nx-grid__opt-n" }, this.#loc.number(o.count)),
                ),
              );
            }),
          ),
          !q && opts.length > FACET_SHOWN ? h("button", { type: "button", class: "nx-grid__more", "data-more": f.key }, expanded ? L.less : this.#fmt(L.more, { n: opts.length - shown.length })) : null,
        );
      }),
    );
    if (focusKey) {
      const el = [...aside.querySelectorAll<HTMLElement>("[data-focus]")].find((x) => x.dataset.focus === focusKey);
      el?.focus();
      if (el instanceof HTMLInputElement && el.type === "search") el.setSelectionRange(el.value.length, el.value.length);
    }
  }

  /** Lleva el desplazamiento horizontal de `from` a `to`, en proporción a sus recorridos: la barra
   *  de arriba es más ancha que el área visible de la tabla (no tiene su barra vertical ni sus bordes)
   *  y así los dos extremos coinciden, también en RTL (`scrollLeft` negativo). Con la barra apagada no
   *  lee nada; un desplazamiento vertical no lee más que `scrollLeft`. */
  #follow(from: HTMLElement, to: HTMLElement): void {
    if (!this.topScrollbar) return;
    const x = from.scrollLeft;
    const seen = this.#synced;
    // Ya reflejado: un desplazamiento vertical, o el eco de lo que se le asignó aquí. El eco llega
    // después, quizá con la persona ya más adelante en la otra: devolverlo la haría retroceder en
    // pleno arrastre. (Sin valor anotado, `x - undefined` es NaN y no lo detiene.)
    if (Math.abs(x - seen.get(from)!) < 1) return;
    seen.set(from, x);
    const k = (to.scrollWidth - to.clientWidth) / (from.scrollWidth - from.clientWidth);
    // Sin recorrido en alguna de las dos (la tabla cabe, o aún sin maquetar): nada que llevar.
    if (!(k > 0 && k < Infinity) || Math.abs(to.scrollLeft - x * k) < 1) return;
    to.scrollLeft = x * k;
    seen.set(to, to.scrollLeft);
  }

  #soon(): void {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      this.#paintRows();
    });
  }

  /** Pinta solo las filas visibles (y unas de margen). Mientras se edita, la fila de la edición se
   *  queda en su nodo (el campo tiene el foco) y las demás siguen al desplazamiento; si la persona la
   *  saca de la vista, la edición se guarda (sin mover la celda activa). Si hay que rehacer todas
   *  (cambiaron los datos), el campo sigue a su fila (ver `#track`). */
  #paintRows(force = false): void {
    if (!this.#built) return;
    const s = this.#scroll!;
    const n = this.#count();
    this.#body!.style.blockSize = `${Math.min(n * ROW_H, MAX_H)}px`;
    const vh = s.clientHeight || 420;
    let top = s.scrollTop * this.#ratio();
    let start = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
    let end = Math.min(n, Math.ceil((top + vh) / ROW_H) + OVERSCAN);
    const box = this.#rowsEl!;
    const old = this.#win;
    const ed = this.#editing;
    const all = force || old.start < 0;
    const was = ed?.r;
    if (ed && all) {
      if (!this.#track(ed)) return;
      // La fila se movió fuera de la vista (otro orden, filas nuevas): la tabla la sigue.
      if (ed.r < start || ed.r >= end) {
        this.#scrollTo(ed.r);
        top = s.scrollTop * this.#ratio();
        start = Math.max(0, Math.floor(top / ROW_H) - OVERSCAN);
        end = Math.min(n, Math.ceil((top + vh) / ROW_H) + OVERSCAN);
      }
    }
    if (ed && (ed.r < start || ed.r >= end)) return this.#endEdit(true, 0, 0, false);
    if (this.#server) for (let b = Math.floor(start / BLOCK); b <= Math.floor(Math.max(start, end - 1) / BLOCK); b++) void this.#load(b);
    // Con el alto escalado (ver `MAX_H`) las filas se corren en cada cuadro, no solo al cambiar la ventana.
    box.style.insetBlockStart = `${start * ROW_H - (top - s.scrollTop)}px`;
    const kids = [...box.children] as HTMLElement[];
    if (!force && start === old.start && end === old.end && !kids.some((el) => this.#stale(el))) return;
    this.#win = { start, end };
    if (all || end <= old.start || start >= old.end) {
      const rows: HTMLElement[] = [];
      for (let i = start; i < end; i++) rows.push(this.#rowEl(i));
      // El campo de la edición sale del DOM con su fila vieja: eso no es terminarla.
      const focused = !!ed && document.activeElement === ed.input;
      this.#moving = true;
      try {
        box.replaceChildren(...rows);
      } finally {
        this.#moving = false;
      }
      if (ed) this.#mountEdit(ed, focused, ed.r !== was);
    } else {
      // Al desplazarse se reutilizan las filas que siguen a la vista; solo se crean las que entran
      // (y se rehacen las que esperaban datos que ya llegaron).
      for (const el of kids) {
        const r = Number(el.dataset.r);
        if (r < start || r >= end) el.remove();
        else if (this.#stale(el)) el.replaceWith(this.#rowEl(r));
      }
      const before: HTMLElement[] = [];
      for (let i = start; i < Math.min(old.start, end); i++) before.push(this.#rowEl(i));
      const after: HTMLElement[] = [];
      for (let i = Math.max(old.end, start); i < end; i++) after.push(this.#rowEl(i));
      box.prepend(...before);
      box.append(...after);
    }
    this.#paintSel();
  }

  /** Píxeles de la tabla por píxel de desplazamiento: 1, salvo que todas las filas pasen de `MAX_H`;
   *  entonces el recorrido del scroll cubre las n filas (la última se alcanza). */
  #ratio(): number {
    const extra = this.#count() * ROW_H - MAX_H;
    if (extra <= 0) return 1;
    const range = this.#scroll!.scrollHeight - this.#scroll!.clientHeight;
    return range > 0 ? 1 + extra / range : 1;
  }

  /** Una fila pintada sin sus datos (un bloque del servidor que no había llegado) que ya los tiene. */
  #stale(el: HTMLElement): boolean {
    return el.classList.contains("is-loading") && !!this.#itemAt(Number(el.dataset.r));
  }

  #rowEl(i: number): HTMLElement {
    const cols = this.#columns;
    const u = this.#uid;
    const it = this.#itemAt(i);
    const row = h("div", { role: "row", class: "nx-grid__row", "aria-rowindex": i + 2, "data-r": i });
    const rid = it && "r" in it ? (this.#ids.get(it.r) ?? "") : "";
    if (this.selectable) {
      const on = !!rid && this.#picked.has(rid);
      row.append(h("div", { role: "gridcell", class: "nx-grid__cell nx-grid__check", "aria-colindex": 1 }, rid ? h("input", { type: "checkbox", "data-pick": "", "data-nx-ephemeral": "", checked: on, tabindex: -1, "aria-label": this.#labels.selectRow }) : null));
      row.classList.toggle("is-picked", on);
      row.setAttribute("aria-selected", String(on));
    }
    const off = this.selectable ? 1 : 0;
    const cell = (c: GridColumn, ci: number) => h("div", { role: "gridcell", class: `nx-grid__cell${isNumeric(c) ? " is-num" : ""}`, id: `${u}-${i}-${ci}`, "aria-colindex": ci + 1 + off, "data-c": ci });
    if (!it) {
      row.classList.add("is-loading");
      row.append(...cols.map((c, ci) => cell(c, ci)));
      return row;
    }
    if ("g" in it) {
      const g = it.g;
      row.classList.add("nx-grid__row--group");
      row.setAttribute("aria-expanded", String(!this.#collapsed.has(g.key)));
      // La etiqueta ocupa las columnas de texto hasta la primera numérica (donde van los subtotales).
      const span = Math.max(1, cols.findIndex(isNumeric) < 0 ? cols.length : cols.findIndex(isNumeric));
      row.append(
        ...cols.slice(span - 1).map((c, k) => {
          const ci = k + span - 1;
          const el = cell(c, ci);
          if (k === 0) {
            el.dataset.c = "0";
            el.dataset.to = String(ci);
            el.setAttribute("aria-colindex", String(1 + off));
            if (span > 1) el.setAttribute("aria-colspan", String(span));
            el.style.gridColumn = `span ${span}`;
            el.append(glyph("chevron", "nx-grid__chev"), h("span", { class: "nx-grid__g-label" }, g.label), h("span", { class: "nx-grid__g-n" }, this.#loc.number(g.rows.length)));
          } else if (isNumeric(c)) {
            el.append(h("span", null, formatCell(g.sums[c.key] ?? 0, c, this.#loc)));
            el.classList.add("has-bar");
            el.style.setProperty("--_p", String(Math.abs(g.sums[c.key] ?? 0) / (this.#groupMax[c.key] || 1)));
          }
          return el;
        }),
      );
      return row;
    }
    const r = it.r;
    const id = this.#ids.get(r) ?? "";
    row.append(
      ...cols.map((c, ci) => {
        const el = cell(c, ci);
        const v = r[c.key];
        const text = formatCell(v, c, this.#loc);
        const tone = c.options?.find((o) => o.value === String(v))?.tone;
        if (text && (colType(c) === "status" || tone)) el.append(h("span", { class: "nx-grid__pill", "data-tone": tone ?? "neutral" }, text));
        else if (text && (c.link || c.avatar)) {
          // El tono del avatar sale del texto: la misma persona, siempre el mismo color.
          const hue = [...text].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) % 360, 7);
          if (c.avatar) el.append(h("span", { class: "nx-grid__avatar", style: `--_h:${hue}`, "aria-hidden": "true" }, initials(text)));
          el.append(c.link ? h("span", { class: "nx-grid__link" }, text) : text);
        } else el.textContent = text;
        if (c.editable) el.classList.add("is-editable");
        if (this.#edited.has(`${id}\u0000${c.key}`)) el.classList.add("is-edited");
        return el;
      }),
    );
    return row;
  }

  #range() {
    const a = this.#anchor;
    const b = this.#act;
    return { r0: Math.min(a.r, b.r), r1: Math.max(a.r, b.r), c0: Math.min(a.c, b.c), c1: Math.max(a.c, b.c) };
  }

  #paintSel(): void {
    const { r0, r1, c0, c1 } = this.#range();
    const multi = r0 !== r1 || c0 !== c1;
    for (const row of this.#rowsEl!.children as HTMLCollectionOf<HTMLElement>) {
      const r = Number(row.dataset.r);
      for (const cell of row.children as HTMLCollectionOf<HTMLElement>) {
        if (cell.dataset.c === undefined) continue;
        const c = Number(cell.dataset.c);
        const to = Number(cell.dataset.to ?? c);
        const inside = r >= r0 && r <= r1 && to >= c0 && c <= c1;
        cell.classList.toggle("is-sel", inside && multi);
        cell.classList.toggle("is-active", r === this.#act.r && this.#act.c >= c && this.#act.c <= to);
        cell.setAttribute("aria-selected", String(inside));
      }
    }
    const has = this.#count() > 0 && this.#columns.length > 0;
    const active = has ? this.#cell(this.#act) : null;
    if (active) this.#scroll!.setAttribute("aria-activedescendant", active.id);
    else this.#scroll!.removeAttribute("aria-activedescendant");
    this.#paintFoot();
  }

  #rowsText(): string {
    const n = this.#loc.number(this.#rowCount());
    const total = this.#server ? this.#total : this.#all.length;
    return (this.#filters.length || this.#q) && !this.#server ? this.#fmt(this.#labels.of, { n, total: this.#loc.number(total) }) : this.#fmt(this.#labels.rows, { n });
  }

  /** El pie: conteo y totales, o las estadísticas del rango. Se recalcula solo si cambió el rango o
   *  los datos (`#footDirty`), no en cada cuadro del scroll: con Ctrl+A sobre 100 000 filas recorrer
   *  el rango en cada cuadro trababa el desplazamiento. */
  #paintFoot(): void {
    const L = this.#labels;
    const { r0, r1, c0, c1 } = this.#range();
    const key = `${r0},${r1},${c0},${c1}`;
    if (!this.#footDirty && key === this.#footKey) return;
    this.#footDirty = false;
    this.#footKey = key;
    const parts: Node[] = [];
    const part = (label: string, value: string) => h("span", null, h("span", { class: "nx-grid__foot-k" }, label), ` ${value}`);
    if ((r1 > r0 || c1 > c0) && this.#count()) {
      const nums: number[] = [];
      const numCols = new Set<GridColumn>();
      let cells = 0;
      for (let r = r0; r <= r1; r++) {
        const it = this.#itemAt(r);
        if (!it || "g" in it) continue;
        for (let c = c0; c <= c1; c++) {
          cells++;
          const col = this.#columns[c];
          const v = isNumeric(col) ? num(it.r[col.key]) : null;
          if (v !== null) {
            nums.push(v);
            numCols.add(col);
          }
        }
      }
      parts.push(h("span", null, this.#fmt(L.cells, { n: this.#loc.number(cells) })));
      const st = stats(nums);
      if (st) {
        const f: GridColumn = numCols.size === 1 ? [...numCols][0] : { key: "", label: "", type: "number" };
        parts.push(part(L.sum, formatCell(st.sum, f, this.#loc)), part(L.avg, formatCell(st.avg, f, this.#loc)), part(L.min, formatCell(st.min, f, this.#loc)), part(L.max, formatCell(st.max, f, this.#loc)));
      }
    } else {
      parts.push(h("span", null, this.#rowsText()));
      for (const c of this.#columns) if (colType(c) === "money" && this.#totals[c.key] !== undefined) parts.push(part(`${L.total} ${c.label}`, formatCell(this.#totals[c.key], c, this.#loc)));
    }
    this.#foot!.replaceChildren(...parts);
  }

  // ---------------------------------------------------------------- cabeceras

  #onHeadClick(e: MouseEvent): void {
    const t = e.target as Element;
    const fb = t.closest<HTMLElement>("[data-filter]");
    if (fb) return void this.#toggleFilter(this.#columns[Number(fb.dataset.filter)]?.key ?? "");
    const s = t.closest<HTMLElement>("[data-sort]");
    if (!s) return;
    const c = this.#columns[Number(s.dataset.sort)];
    const cur = this.#sort?.key === c.key ? this.#sort.dir : 0;
    this.#sort = cur === 0 ? { key: c.key, dir: 1 } : cur === 1 ? { key: c.key, dir: -1 } : null;
    this.#refilter(true, "order");
  }

  /** Lleva el foco a la cabecera de la columna `c` (-1: la casilla de «seleccionar todo»). */
  #focusHead(c: number): void {
    const el = c < 0 ? this.#headCheck : this.#ths[c]?.querySelector<HTMLElement>("[data-sort]");
    (el ?? this.#headCheck)?.focus();
  }

  /** Teclado en la fila de cabeceras (patrón grid de la APG; la tabla es una sola parada de Tab y
   *  Tab sale de ella): ←/→, Inicio y Fin recorren las cabeceras; ↓ vuelve a las celdas; Enter o
   *  Espacio ordenan (es un botón); Alt+↓ abre el filtro; Ctrl+←/→ cambia el ancho (con Mayús, de a
   *  más) y Supr lo devuelve. En el borde de una cabecera (el asa del ancho), las flechas solas. */
  #onHeadKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    const th = t.closest<HTMLElement>(".nx-grid__th");
    if (!th) return;
    const ci = this.#ths.indexOf(th);
    const col = this.#columns[ci];
    const rtl = getComputedStyle(this).direction === "rtl";
    const horiz = e.key === "ArrowLeft" || e.key === "ArrowRight";
    const done = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (col && ((horiz && (e.ctrlKey || e.metaKey || t.matches("[data-resize]"))) || e.key === "Delete" || e.key === "Backspace")) {
      done();
      const step = (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 64 : 16) * (rtl ? -1 : 1);
      return this.#setWidth(col.key, horiz ? this.#widthOf(col) + step : null);
    }
    if (e.key === "ArrowDown" && e.altKey) {
      done();
      if (col) void this.#toggleFilter(col.key);
      return;
    }
    const first = this.#headCheck ? -1 : 0;
    const last = this.#ths.length - 1;
    let to: number;
    if (horiz) to = ci + ((e.key === "ArrowRight") !== rtl ? 1 : -1);
    else if (e.key === "Home") to = first;
    else if (e.key === "End") to = last;
    else if (e.key === "ArrowDown" && !e.ctrlKey && !e.metaKey) {
      done();
      if (!this.#count()) return;
      this.#scroll!.focus({ preventScroll: true });
      return this.#moveTo({ r: 0, c: Math.max(0, ci) }, false);
    } else return;
    done();
    this.#focusHead(Math.max(first, Math.min(last, to)));
  }

  // ---------------------------------------------------------------- filtro por columna

  /** Si la columna lleva embudo (las de `filter: false`, no). */
  #filterable(c: GridColumn): boolean {
    return c.filter !== false;
  }

  /** Qué filtro lleva una columna. Lo fuerza `filter`; si no, sale del tipo y, en el texto, de
   *  cuántos valores distintos tiene (se mira al abrirlo, no en cada pintado). */
  #kind(c: GridColumn): FilterKind {
    if (c.filter) return c.filter;
    if (isNumeric(c)) return "range";
    if (colType(c) === "date") return "date";
    if (c.options || colType(c) === "status") return "list";
    if (this.#server) return this.#facetList.some((f) => f.key === c.key) ? "list" : "text";
    return this.#facetCols.includes(c) || facetColumns([c], this.#all).length ? "list" : "text";
  }

  /** Como `#loadViews`: una carga que falla no se recuerda, el siguiente intento la repite. */
  #loadPanel(): Promise<FilterPanel> {
    return (this.#panelLoad ??= import("./grid-filter").then(
      (m) => (this.#panel = new m.FilterPanel(this.#filterHost())),
      (err) => {
        this.#panelLoad = undefined;
        throw err;
      },
    ));
  }

  /** El embudo es un interruptor: abre el filtro de la columna, o lo cierra si ya estaba abierto. */
  async #toggleFilter(key: string, anchor?: HTMLElement): Promise<void> {
    const col = this.#cols.find((c) => c.key === key);
    if (!col || !this.#filterable(col)) return;
    try {
      (await this.#loadPanel()).toggle(col, this.#thOf(key) ?? anchor ?? this.#chips ?? null);
    } catch (err) {
      console.warn("[nx-grid] no se pudo cargar el filtro", err);
    }
  }

  /** La cabecera de una columna, si se ve. */
  #thOf(key: string): HTMLElement | undefined {
    return this.#ths[this.#columns.findIndex((c) => c.key === key)];
  }

  /** Las filas que pasan todos los filtros menos los de una columna (una columna nunca se cuenta a
   *  sí misma). */
  #others(key: string): GridRow[] {
    return applyFilters(
      this.#base,
      this.#filters.filter((f) => f.key !== key),
    );
  }

  /** Reemplaza los filtros de una columna. En el servidor se espera a que la persona termine de
   *  elegir (arrastrar un rango no pide una página por cada paso). */
  #setColumn(key: string, next: GridFilter[]): void {
    const filters = withColumn(this.#filters, key, next);
    if (!this.#server) return this.#setFilters(filters);
    this.#filters = filters;
    this.#paintChrome();
    clearTimeout(this.#wait);
    this.#wait = setTimeout(() => {
      this.#wait = undefined;
      this.#refilter(true);
    }, SERVER_WAIT);
  }

  #filterHost(): FilterHost {
    const self = this;
    return {
      el: this,
      get labels() {
        return self.#labels;
      },
      get loc() {
        return self.#loc;
      },
      get filters() {
        return self.#filters;
      },
      get server() {
        return self.#server;
      },
      // Lo que dejó la búsqueda: el panel cuenta y dibuja sus barras sobre eso.
      get all() {
        return self.#base;
      },
      kind: (c) => this.#kind(c),
      set: (key, next) => this.#setColumn(key, next),
      facet: (key) => this.#facetList.find((f) => f.key === key),
      hist: (key) => this.#hist.get(key),
      left: () => (this.#server ? { n: this.#total, total: null } : { n: this.#filtered.length, total: this.#all.length }),
      funnel: (key) => this.#head?.querySelector<HTMLElement>(`[data-filter="${this.#columns.findIndex((c) => c.key === key)}"]`) ?? null,
      back: () => this.#scroll?.focus({ preventScroll: true }),
    };
  }

  /** La columna de una celda de datos, si se puede filtrar desde ella. */
  #menuFor(p: Pos): GridColumn | null {
    const it = this.#itemAt(p.r);
    const col = this.#columns[p.c];
    return it && "r" in it && col && this.#filterable(col) ? col : null;
  }

  /** El menú de una celda: «Solo Cali», «Desde $ 5.000.000»… */
  async #cellMenu(p: Pos, x: number, y: number): Promise<void> {
    const col = this.#menuFor(p);
    const it = this.#itemAt(p.r);
    if (!col || !it || !("r" in it)) return;
    try {
      (await this.#loadPanel()).menu(col, it.r[col.key], x, y);
    } catch (err) {
      console.warn("[nx-grid] no se pudo cargar el filtro", err);
    }
  }

  // ---------------------------------------------------------------- hoja de cálculo

  #posOf(target: EventTarget | null): Pos | null {
    const cell = (target as Element | null)?.closest?.<HTMLElement>("[data-c]");
    const row = cell?.parentElement;
    if (!cell || !row?.dataset.r) return null;
    return { r: Number(row.dataset.r), c: Number(cell.dataset.c) };
  }

  #clampSel(): void {
    const n = Math.max(0, this.#count() - 1);
    const m = Math.max(0, this.#columns.length - 1);
    const clamp = (p: Pos) => ({ r: Math.min(p.r, n), c: Math.min(p.c, m) });
    this.#act = clamp(this.#act);
    this.#anchor = clamp(this.#anchor);
  }

  #onPointerDown(e: PointerEvent): void {
    this.#touch = e.pointerType !== "mouse";
    this.#tap = null;
    if (e.button !== 0 || (this.#editing && e.target === this.#editing.input)) return;
    const p = this.#posOf(e.target);
    if (!p) return;
    e.preventDefault();
    // La celda activa de una tabla que aún no tiene el foco (recién abierta) no la eligió nadie.
    const had = document.activeElement === this.#scroll;
    this.#scroll!.focus({ preventScroll: true });
    const it = this.#itemAt(p.r);
    if (it && "g" in it && (e.target as Element).closest(".nx-grid__chev, .nx-grid__g-label")) {
      this.#act = this.#anchor = p;
      return this.#toggleGroup(p.r);
    }
    const { r0, r1, c0, c1 } = this.#range();
    if (this.#touch && had && r0 === p.r && r1 === p.r && c0 === p.c && c1 === p.c) this.#tap = p;
    this.#act = p;
    if (!e.shiftKey) this.#anchor = p;
    this.#paintSel();
    // Arrastrar para marcar un rango, solo con el mouse: con el dedo, arrastrar desplaza la tabla (y
    // el navegador cierra con `pointercancel`, no con `pointerup`).
    if (this.#touch) return;
    this.#dragging = true;
    const end = () => {
      this.#dragging = false;
      document.removeEventListener("pointerup", end);
      document.removeEventListener("pointercancel", end);
    };
    document.addEventListener("pointerup", end);
    document.addEventListener("pointercancel", end);
  }

  #toggleGroup(r: number): void {
    const it = this.#itemAt(r);
    if (!it || !("g" in it)) return;
    this.#settle();
    if (!this.#collapsed.delete(it.g.key)) this.#collapsed.add(it.g.key);
    this.#flatten();
    this.#scroll!.setAttribute("aria-rowcount", String(this.#count() + 1));
    this.#footDirty = true;
    this.#paintRows(true);
  }

  #onKey(e: KeyboardEvent): void {
    if (e.target !== this.#scroll) return;
    const n = this.#count();
    const m = this.#columns.length;
    const mod = e.ctrlKey || e.metaKey;
    let { r, c } = this.#act;
    // ↑ desde la primera fila (o cualquier flecha sin filas) sube a las cabeceras.
    if (m && !e.altKey && ((e.key === "ArrowUp" && !mod && !e.shiftKey && r === 0) || (!n && e.key.startsWith("Arrow")))) {
      e.preventDefault();
      return this.#focusHead(Math.min(c, m - 1));
    }
    if (!n || !m) return;
    const it = this.#itemAt(r);
    const page = Math.max(1, Math.floor((this.#scroll!.clientHeight - this.#head!.offsetHeight) / ROW_H) - 1);
    // Ctrl+Z deshace; Ctrl+Y o Ctrl+Mayús+Z rehace. (La tabla lo atiende: los avisos de la página no.)
    if (mod && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y")) {
      e.preventDefault();
      if (e.key.toLowerCase() === "y" || e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    // Alt+↓ abre el filtro de la columna activa; Mayús+F10 (o la tecla de menú), el de la celda.
    if (e.altKey && e.key === "ArrowDown") {
      e.preventDefault();
      return void this.#toggleFilter(this.#columns[c]?.key ?? "");
    }
    if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const rect = this.#cell(this.#act)?.getBoundingClientRect();
      if (this.#menuFor(this.#act)) void this.#cellMenu(this.#act, rect?.left ?? 0, rect?.bottom ?? 0);
      return;
    }
    if (mod && e.key.toLowerCase() === "a") {
      e.preventDefault();
      this.#anchor = { r: 0, c: 0 };
      this.#act = { r: n - 1, c: m - 1 };
      return this.#paintSel();
    }
    switch (e.key) {
      case "ArrowDown":
        r = mod ? n - 1 : r + 1;
        break;
      case "ArrowUp":
        r = mod ? 0 : r - 1;
        break;
      case "ArrowRight":
      case "ArrowLeft": {
        const rtl = getComputedStyle(this).direction === "rtl";
        const d = (e.key === "ArrowRight") !== rtl ? 1 : -1;
        c = mod ? (d > 0 ? m - 1 : 0) : c + d;
        break;
      }
      case "Home":
        c = 0;
        if (mod) r = 0;
        break;
      case "End":
        c = m - 1;
        if (mod) r = n - 1;
        break;
      case "PageDown":
        r += page;
        break;
      case "PageUp":
        r -= page;
        break;
      case "Tab":
        return;
      case "Escape":
        this.#anchor = this.#act;
        return this.#paintSel();
      case "Delete":
      case "Backspace":
        e.preventDefault();
        return this.#clearRange();
      case "Enter":
      case "F2":
      case " ":
        if (it && "g" in it && e.key !== "F2") {
          e.preventDefault();
          return this.#toggleGroup(r);
        }
        if (e.key === " " && this.selectable) {
          e.preventDefault();
          return this.#pick(r, !this.#picked.has(it && "r" in it ? (this.#ids.get(it.r) ?? "") : ""), e.shiftKey);
        }
        if (e.key !== " ") {
          e.preventDefault();
          if (!this.#startEdit() && e.key === "Enter") this.#openRow();
          return;
        }
      // falls through
      default:
        if (e.key.length === 1 && !mod && !e.altKey) {
          e.preventDefault();
          this.#startEdit(e.key);
        }
        return;
    }
    e.preventDefault();
    this.#moveTo({ r: Math.max(0, Math.min(n - 1, r)), c: Math.max(0, Math.min(m - 1, c)) }, e.shiftKey);
  }

  /** Marca o desmarca la fila `r`; con Mayús, todo el tramo desde la última marcada. */
  #pick(r: number, on: boolean, range: boolean): void {
    const from = range && this.#lastPick >= 0 ? Math.min(this.#lastPick, r) : r;
    const to = range && this.#lastPick >= 0 ? Math.max(this.#lastPick, r) : r;
    for (let i = from; i <= to; i++) {
      const it = this.#itemAt(i);
      const id = it && "r" in it ? this.#ids.get(it.r) : undefined;
      if (id) on ? this.#picked.add(id) : this.#picked.delete(id);
    }
    this.#lastPick = r;
    this.#paintPicked(true);
  }

  /** Todas las filas filtradas (en el servidor, las cargadas), o ninguna. */
  #pickAll(on: boolean): void {
    if (!on) this.#picked.clear();
    else for (const r of this.#server ? this.#byId.values() : this.#filtered) this.#picked.add(this.#ids.get(r)!);
    this.#paintPicked(true);
  }

  #paintPicked(emit: boolean): void {
    if (!this.#built) return;
    const n = this.#picked.size;
    const L = this.#labels;
    for (const row of this.#rowsEl!.children as HTMLCollectionOf<HTMLElement>) {
      const box = row.querySelector<HTMLInputElement>("input[data-pick]");
      const it = this.#itemAt(Number(row.dataset.r));
      const on = !!it && "r" in it && this.#picked.has(this.#ids.get(it.r) ?? "");
      if (box) box.checked = on;
      row.classList.toggle("is-picked", on);
      if (this.selectable) row.setAttribute("aria-selected", String(on));
    }
    const pool = this.#server ? this.#byId.size : this.#filtered.length;
    if (this.#headCheck) {
      this.#headCheck.checked = n > 0 && n >= pool;
      this.#headCheck.indeterminate = n > 0 && n < pool;
      this.#headCheck.setAttribute("aria-label", this.#fmt(L.selectAll, { n: this.#loc.number(pool) }));
    }
    if (n) this.setAttribute("data-selection", String(n));
    else this.removeAttribute("data-selection");
    this.#selbar!.hidden = !n;
    const [count, all, none] = this.#selbar!.children as HTMLCollectionOf<HTMLElement>;
    count.textContent = n === 1 ? L.selectedOne : this.#fmt(L.selected, { n: this.#loc.number(n) });
    all.hidden = n >= pool;
    all.textContent = this.#fmt(L.selectAll, { n: this.#loc.number(pool) });
    none.textContent = L.clearSelection;
    if (emit) this.#emit("nx-grid-selection", { ids: this.selected, count: n });
  }

  /** `nx-grid-open`: la persona quiere ver el detalle de la fila activa. */
  #openRow(): void {
    const it = this.#itemAt(this.#act.r);
    if (!it || "g" in it) return;
    this.#emit("nx-grid-open", { id: this.#ids.get(it.r), row: it.r, key: this.#columns[this.#act.c]?.key, origin: this.#cell(this.#act) });
  }

  #moveTo(p: Pos, extend: boolean): void {
    this.#act = p;
    if (!extend) this.#anchor = p;
    this.#reveal();
    this.#paintSel();
  }

  /** Lleva la celda activa a la vista (bajo la cabecera fija). */
  #reveal(): void {
    this.#scrollTo(this.#act.r);
    this.#paintRows();
    this.#cell(this.#act)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  /** Desplaza lo justo para que la fila `r` quede a la vista. */
  #scrollTo(r: number): void {
    const s = this.#scroll!;
    const k = this.#ratio();
    const top = r * ROW_H;
    const at = s.scrollTop * k;
    const vh = s.clientHeight - this.#head!.offsetHeight;
    if (top < at) s.scrollTop = top / k;
    else if (vh > 0 && top + ROW_H > at + vh) s.scrollTop = (top + ROW_H - vh) / k;
  }

  #cell(p: Pos): HTMLElement | null {
    const row = this.#rowsEl!.querySelector<HTMLElement>(`[data-r="${p.r}"]`);
    return [...((row?.children ?? []) as HTMLCollectionOf<HTMLElement>)].find((x) => Number(x.dataset.c) <= p.c && p.c <= Number(x.dataset.to ?? x.dataset.c)) ?? null;
  }

  /** Empieza a editar la celda activa; `false` si no es editable. */
  #startEdit(initial?: string): boolean {
    const { r, c } = this.#act;
    const it = this.#itemAt(r);
    const col = this.#columns[c];
    if (!it || "g" in it || !col?.editable) return false;
    this.#anchor = this.#act;
    this.#reveal();
    this.#paintSel();
    const cell = this.#cell(this.#act);
    if (!cell) return false;
    const v = it.r[col.key];
    const input = h("input", { class: "nx-grid__input", "aria-label": col.label, autocomplete: "off", inputmode: isNumeric(col) ? "decimal" : null });
    const text = v === null || v === undefined ? "" : colType(col) === "status" ? formatCell(v, col, this.#loc) : isNumeric(col) && num(v) !== null ? this.#editText(num(v)!) : String(v);
    input.value = initial ?? text;
    const ed: Editing = { r, c, key: col.key, row: it.r, id: this.#ids.get(it.r) ?? "", text: initial === undefined ? text : null, input, quick: initial !== undefined };
    this.#editing = ed;
    cell.classList.add("is-editing");
    cell.replaceChildren(input);
    if (col.options) {
      ed.list = h("datalist", { id: `${this.#uid}-dl` }, ...col.options.map((o) => h("option", { value: o.label ?? o.value })));
      input.setAttribute("list", ed.list.id);
      cell.append(ed.list);
    }
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const arrows: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (e.key === "Escape") this.#endEdit(false);
      else if (e.key === "Enter") this.#endEdit(true, e.shiftKey ? -1 : 1, 0);
      else if (e.key === "Tab") this.#endEdit(true, 0, e.shiftKey ? -1 : 1);
      else if (ed.quick && arrows[e.key]) this.#endEdit(true, ...arrows[e.key]);
      else return;
      e.preventDefault();
    });
    input.addEventListener("blur", () => {
      // Mientras el campo pasa a la fila repintada (ver `#mountEdit`), sacarlo del DOM no es salir.
      if (this.#editing === ed && !this.#moving) this.#endEdit(true);
    });
    input.focus();
    if (!ed.quick) input.select();
    return true;
  }

  /** Un número como texto que el campo vuelve a leer igual con el locale de la tabla: sin separador
   *  de miles y con su signo decimal («0,125» en es-CO). `String(0.125)` en es-CO se leía como miles:
   *  abrir la celda y salir sin tocarla la dejaba en 125. */
  #editText(n: number): string {
    let t = String(n);
    if (/e/i.test(t)) t = n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
    return this.#loc.number(1.5).includes(",") ? t.replace(".", ",") : t;
  }

  /** Una edición abierta se guarda ya: antes de lo que no puede seguirla (otra consulta al servidor,
   *  otro `source` o `row-key`) o de una acción que la persona hace desde fuera del campo. */
  #settle(): void {
    if (this.#editing) this.#endEdit(true, 0, 0, false);
  }

  /** Cambiaron los datos con una edición abierta (filas nuevas, filtros, orden, búsqueda, columnas):
   *  una tabla que se refresca sola no le puede guardar a la persona lo que lleva escrito a medias.
   *  Si su fila sigue en la tabla (el mismo id real, o el mismo objeto si el id es la posición) y su
   *  columna se ve y se edita, el campo se queda con lo escrito y pasa al lugar nuevo de la fila.
   *  Si no se ve (quedó filtrada, en un grupo cerrado o en una columna escondida), lo escrito se
   *  guarda en su registro; si el registro o la columna ya no están, se descarta y se anuncia
   *  (`labels.editLost`). `false` si la edición terminó. */
  #track(ed: Editing): boolean {
    const cur = this.#byId.get(ed.id);
    const row = cur && (cur === ed.row || !ed.id.startsWith("#")) ? cur : undefined;
    const col = this.#cols.find((c) => c.key === ed.key);
    const c = this.#columns.findIndex((x) => x.key === ed.key);
    let r = -1;
    if (row && col?.editable && c >= 0) {
      const at = this.#itemAt(ed.r);
      r = at && "r" in at && at.r === row ? ed.r : this.#indexOf(row);
    }
    if (r >= 0) {
      ed.row = row!;
      ed.r = r;
      ed.c = c;
      this.#act = this.#anchor = { r, c };
      return true;
    }
    const keep = !!row && !!col?.editable;
    const lost = !keep && ed.input.value !== ed.text;
    this.#endEdit(keep, 0, 0, false);
    // Después del conteo de filas que anuncia el mismo cambio (si no, lo taparía).
    if (lost) queueMicrotask(() => this.#live && (this.#live.textContent = this.#labels.editLost));
    return false;
  }

  /** Dónde está una fila en la lista que se pinta (-1 si no está, o si su bloque no se ha cargado). */
  #indexOf(row: GridRow): number {
    if (!this.#server) return this.#view.findIndex((it) => "r" in it && it.r === row);
    for (const [b, rows] of this.#blocks) {
      const i = Array.isArray(rows) ? rows.indexOf(row) : -1;
      if (i >= 0) return b * BLOCK + i;
    }
    return -1;
  }

  /** Pone el campo de la edición en su celda, recién repintada, sin perder lo escrito, el cursor ni
   *  el foco. `moved`: la fila cambió de lugar; si la persona está escribiendo, el campo queda a la
   *  vista también en la página (la tabla puede ser más alta que la ventana). */
  #mountEdit(ed: Editing, focused: boolean, moved = false): void {
    const cell = this.#cell({ r: ed.r, c: ed.c });
    if (!cell || cell.contains(ed.input)) return;
    const { input } = ed;
    const sel = [input.selectionStart, input.selectionEnd, input.selectionDirection] as const;
    cell.classList.add("is-editing");
    cell.replaceChildren(input, ...(ed.list ? [ed.list] : []));
    if (!focused) return;
    input.focus({ preventScroll: true });
    if (moved) input.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    try {
      if (sel[0] !== null && sel[1] !== null) input.setSelectionRange(sel[0], sel[1], sel[2] ?? undefined);
    } catch {
      /* un campo sin selección */
    }
  }

  /** Termina la edición. Lo escrito va a la fila que se estaba editando (por su objeto y su id), no a
   *  la que hoy ocupa su lugar; si ya no está (filas nuevas sin esa fila), se descarta. Sin tocar el
   *  campo no se guarda nada. `move`: mover la celda activa (Enter, Tab), o no (se desplazó o
   *  cambiaron los datos). */
  #endEdit(commit: boolean, dr = 0, dc = 0, move = true): void {
    const ed = this.#editing;
    if (!ed) return;
    this.#editing = null;
    const focused = document.activeElement === ed.input;
    const col = this.#cols.find((c) => c.key === ed.key);
    const cur = this.#byId.get(ed.id);
    const row = cur === ed.row || (cur && !ed.id.startsWith("#")) ? cur : undefined;
    if (commit && row && col && ed.input.value !== ed.text) {
      const value = parseInput(ed.input.value, col, this.#loc);
      const old = row[col.key];
      if (value !== old && !(value === "" && (old === null || old === undefined))) this.#apply([{ id: ed.id, key: col.key, value, old }]);
    }
    this.#paintRows(true);
    if (!move) {
      if (focused) this.#scroll!.focus({ preventScroll: true });
      return;
    }
    this.#scroll!.focus({ preventScroll: true });
    const n = this.#count();
    const m = this.#columns.length;
    this.#moveTo({ r: Math.max(0, Math.min(n - 1, ed.r + dr)), c: Math.max(0, Math.min(m - 1, ed.c + dc)) }, false);
  }

  /** Aplica ediciones (una celda, un pegado, un borrado), si nadie cancela `nx-grid-change`. No
   *  reordena ni refiltra las filas, como una hoja de cálculo; sí recalcula totales y facetas. */
  #apply(changes: GridChange[], source: GridChangeSource = "edit"): boolean {
    if (!changes.length || !this.#emit("nx-grid-change", { changes, source }, true)) return false;
    for (const ch of changes) {
      const r = this.#byId.get(ch.id);
      if (!r) continue;
      const k = `${ch.id}\u0000${ch.key}`;
      if (!this.#orig.has(k)) this.#orig.set(k, ch.old);
      r[ch.key] = ch.value;
      this.#hay.delete(r);
      // El próximo filtro vuelve a buscar: la fila editada puede haber dejado de coincidir (o empezado).
      this.#baseQ = null;
      // La marca de «editada» se va si la celda vuelve a su valor original.
      const o = this.#orig.get(k);
      if (ch.value === o || ((ch.value === null || ch.value === undefined || ch.value === "") && (o === null || o === undefined || o === ""))) this.#edited.delete(k);
      else this.#edited.add(k);
    }
    if (source !== "undo" && source !== "redo") {
      this.#undo.push(changes);
      if (this.#undo.length > HISTORY) this.#undo.shift();
      this.#redo = [];
    }
    if (!this.#server) this.#reaggregate(new Set(changes.map((c) => c.key)));
    // Una edición no reordena, pero el próximo filtro o búsqueda sí ve el valor nuevo.
    if (this.#sort && changes.some((c) => c.key === this.#sort!.key)) this.#sortedAll = null;
    this.#paintAll();
    return true;
  }

  /** Como una hoja de cálculo: una edición no reordena ni refiltra, pero sí mueve los agregados.
   *  Solo se recalcula lo de las columnas tocadas (antes, cada Enter recorría todas las filas por
   *  cada columna). */
  #reaggregate(keys: Set<string>): void {
    const touched = this.#cols.filter((c) => keys.has(c.key));
    for (const c of touched) {
      if (colType(c) === "money") {
        let t = 0;
        for (const r of this.#filtered) t += num(r[c.key]) ?? 0;
        this.#totals[c.key] = t;
      }
    }
    const facets = this.#facetCols.filter((c) => keys.has(c.key));
    for (const c of facets) this.#order.set(c.key, facetOrder([c], this.#all).get(c.key) ?? []);
    // Las facetas cuentan con los filtros de las demás columnas: cambian si se editó una faceta o
    // una columna con filtro.
    if (facets.length || this.#filters.some((f) => keys.has(f.key))) this.#facetList = crossfilter(this.#base, this.#filters, this.#facetCols, this.#order).facets;
    if (this.#groups && touched.some(isNumeric)) this.#groupStats();
  }

  /** Deshace el último cambio (una celda, un pegado, un borrado). `false` si no había, o si la app
   *  canceló `nx-grid-change`. */
  undo(): boolean {
    // Una edición abierta es un paso más: se guarda antes de tomar los historiales (guardarla vacía
    // el de rehacer, y el viaje dejaría lo deshecho en la lista vieja). Sin mover la celda activa
    // ni robar el foco del botón.
    this.#settle();
    return this.#travel(this.#undo, this.#redo, "undo");
  }
  redo(): boolean {
    this.#settle();
    return this.#travel(this.#redo, this.#undo, "redo");
  }
  get canUndo(): boolean {
    return this.#undo.length > 0;
  }
  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  #travel(from: GridChange[][], to: GridChange[][], source: "undo" | "redo"): boolean {
    const batch = from.pop();
    if (!batch) return false;
    const changes = source === "undo" ? batch.map((c) => ({ id: c.id, key: c.key, value: c.old, old: c.value })) : batch;
    if (!this.#apply(changes, source)) {
      from.push(batch);
      return false;
    }
    to.push(batch);
    // Queda seleccionado lo que cambió, para que se vea qué se deshizo.
    // Un mapa id → índice (no un `findIndex` por cambio: un pegado grande era cuadrático) y los
    // extremos con un bucle (`Math.min(...x)` lanza con ~120 000 elementos).
    const at = new Map<string, number>();
    if (!this.#server) this.#view.forEach((it, i) => "r" in it && at.set(this.#ids.get(it.r) ?? "", i));
    else for (const [b, rows] of this.#blocks) if (Array.isArray(rows)) rows.forEach((r, i) => at.set(this.#ids.get(r) ?? "", b * BLOCK + i));
    const colAt = new Map(this.#columns.map((c, i) => [c.key, i]));
    const rows = extent(changes.map((c) => at.get(c.id) ?? Number.NaN));
    const cols = extent(changes.map((c) => colAt.get(c.key) ?? Number.NaN));
    if (rows && cols) {
      this.#anchor = { r: rows[0], c: cols[0] };
      this.#act = { r: rows[1], c: cols[1] };
      this.#reveal();
      this.#paintSel();
    }
    if (this.#live) this.#live.textContent = `${source === "undo" ? this.#labels.undone : this.#labels.redone} · ${this.#fmt(this.#labels.cells, { n: changes.length })}`;
    this.#paintHistory();
    return true;
  }

  #editableCells(fn: (row: GridRow, col: GridColumn, i: number, j: number) => void): void {
    const { r0, r1, c0, c1 } = this.#range();
    for (let r = r0; r <= r1; r++) {
      const it = this.#itemAt(r);
      if (!it || "g" in it) continue;
      for (let c = c0; c <= c1; c++) {
        const col = this.#columns[c];
        if (col?.editable) fn(it.r, col, r - r0, c - c0);
      }
    }
  }

  #clearRange(): void {
    this.#settle();
    const changes: GridChange[] = [];
    this.#editableCells((row, col) => {
      if (row[col.key] !== null && row[col.key] !== undefined && row[col.key] !== "") changes.push({ id: this.#ids.get(row)!, key: col.key, value: null, old: row[col.key] });
    });
    this.#apply(changes, "delete");
  }

  /** Copia el rango como TSV: Excel y Sheets lo pegan en celdas. Los números van sin formato. */
  #copy(e: ClipboardEvent): void {
    if (this.#editing || !e.clipboardData) return;
    const { r0, r1, c0, c1 } = this.#range();
    const out: string[][] = [];
    for (let r = r0; r <= r1; r++) {
      const it = this.#itemAt(r);
      if (!it || "g" in it) continue;
      const line: string[] = [];
      for (let c = c0; c <= c1; c++) {
        const col = this.#columns[c];
        const v = it.r[col.key];
        // Un texto que empieza con = + - @ se pegaría en Excel como fórmula (y una fórmula puede
        // sacar datos de las celdas vecinas): va con el apóstrofo que lo deja como texto.
        line.push(isNumeric(col) ? String(num(v) ?? "") : formulaSafe(colType(col) === "date" ? String(v ?? "") : formatCell(v, col, this.#loc)));
      }
      out.push(line);
    }
    e.clipboardData.setData("text/plain", toTSV(out));
    e.preventDefault();
    // El destello dura lo que su animación (0,6 s); la clase se quita al terminar: si se quedara, cada
    // celda que pasa a ser activa (o cada fila recreada al desplazarse) volvería a destellar.
    const s = this.#scroll!;
    s.classList.remove("is-copied");
    void s.offsetWidth;
    s.classList.add("is-copied");
    clearTimeout(this.#copied);
    this.#copied = setTimeout(() => s.classList.remove("is-copied"), 600);
  }

  /** Pega TSV desde la celda activa; un solo valor sobre un rango lo llena entero (como Excel). */
  #paste(e: ClipboardEvent): void {
    if (this.#editing) return;
    const text = e.clipboardData?.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const m = parseTSV(text);
    const { r0, r1, c0, c1 } = this.#range();
    const fill = m.length === 1 && m[0].length === 1;
    const rows = fill ? r1 - r0 + 1 : m.length;
    let cols = fill ? c1 - c0 + 1 : 0;
    if (!fill) for (const x of m) if (x.length > cols) cols = x.length;
    this.#anchor = { r: r0, c: c0 };
    this.#act = { r: Math.min(this.#count() - 1, r0 + rows - 1), c: Math.min(this.#columns.length - 1, c0 + cols - 1) };
    const changes: GridChange[] = [];
    this.#editableCells((row, col, i, j) => {
      const t = fill ? m[0][0] : m[i]?.[j];
      if (t === undefined) return;
      // El apóstrofo con el que se copió un texto que parecía fórmula (ver `formulaSafe`) se quita.
      const value = parseInput(isNumeric(col) ? t : unformulaSafe(t), col, this.#loc);
      if (value === null && t.trim()) return; // texto que no es número en una columna numérica
      if (value !== row[col.key]) changes.push({ id: this.#ids.get(row)!, key: col.key, value, old: row[col.key] });
    });
    this.#apply(changes, "paste");
    this.#paintSel();
  }
}
