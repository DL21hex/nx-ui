/**
 * `<nx-grid>`: una tabla de datos que se explora sola. Cada cabecera trae un histograma que filtra
 * con un clic; se filtra también escribiendo una frase («pendientes de marzo de más de 5 millones»)
 * o con el panel de facetas; se navega, selecciona, copia, pega y edita como una hoja de cálculo;
 * se agrupa con subtotales; exporta a Excel (.xlsx real); y admite columnas que calcula una IA a
 * partir de los datos de cada fila y un prompt.
 *
 * Datos: `rows` (en el cliente; filtra, ordena y agrega aquí) o `source` (en el servidor: POST
 * `{offset, limit, sort, filters}` → `GridPage`, por bloques a medida que se desplaza).
 *
 * Un solo modelo de filtros (`GridFilter[]`): una barra del histograma, una casilla de faceta o
 * una frase producen el mismo filtro y el mismo chip, que la persona ve y puede quitar.
 *
 * Las filas se virtualizan (solo existen en el DOM las visibles); todo el texto va por
 * `textContent`.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph } from "../../core/icons";
import { lineData, readLines } from "../../core/stream";
import { foldText } from "../../core/text";
import { nxFormat, resolveLocale, type NxFormat } from "../../core/locale";
import {
  colType,
  crossfilter,
  facetColumns,
  facetOrder,
  filterLabel,
  formatCell,
  groupRows,
  histogram,
  histogramSpec,
  isNumeric,
  num,
  parseInput,
  parseTSV,
  sortRows,
  stats,
  toggleFacet,
  toTSV,
  type GridFacet,
  type GridGroup,
  type HistogramSpec,
} from "./logic";
import { parseNL } from "./nl";
import type { GridChange, GridColumn, GridFilter, GridHistogram, GridLabels, GridPage, GridRow, GridSort, GridTone } from "./types";

export const GRID_LABELS: GridLabels = {
  ask: "Filtra con tus palabras: «pendientes de marzo de más de 5 millones»",
  notUnderstood: "No entendí {words}",
  filters: "Filtros",
  groupBy: "Agrupar por {col}",
  noGroup: "Sin agrupar",
  export: "Exportar",
  aiColumn: "Columna IA",
  aiName: "Nombre de la columna",
  aiPrompt: "Qué debe calcular con los datos de cada fila",
  aiAdd: "Agregar columna",
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
  more: "Ver {n} más",
  less: "Ver menos",
  empty: "Ninguna fila coincide con los filtros",
};

const SPARK = '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"/>';
const SLIDERS = '<path d="M10 5H3"/><path d="M12 19H3"/><path d="M14 3v4"/><path d="M16 17v4"/><path d="M21 12h-9"/><path d="M21 19h-5"/><path d="M21 5h-7"/><path d="M8 10v4"/><path d="M8 12H3"/>';
const DOWNLOAD = '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const ARROW = '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>';

const ROW_H = 32;
const OVERSCAN = 8;
const BLOCK = 100;
const FACET_SHOWN = 6;
const WIDTH: Record<string, number> = { text: 180, number: 110, money: 140, date: 120, status: 130, ai: 220 };
const OPS = new Set(["in", "notIn", "range", "contains"]);
const PROPS = ["columns", "rows", "filters", "sort", "labels", "source", "aiEndpoint", "nlEndpoint", "groupBy", "rowKey", "facetsOpen", "filename", "locale"] as const;

type Item = { g: GridGroup } | { r: GridRow };
type Pos = { r: number; c: number };
type Editing = { r: number; c: number; input: HTMLInputElement; quick: boolean };

let uid = 0;

/** Los filtros que llegan de afuera (atributo, backend de lenguaje natural) se validan. */
function validFilters(v: unknown): GridFilter[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (f) => f && typeof f.key === "string" && OPS.has(f.op) && (f.op === "range" ? f.min !== undefined || f.max !== undefined : f.op === "contains" ? typeof f.value === "string" : Array.isArray(f.values)),
  ) as GridFilter[];
}

const lo = (a: number | string | undefined, b: number | string) => (a === undefined ? undefined : a < b ? a : b);
const hi = (a: number | string | undefined, b: number | string) => (a === undefined ? undefined : a > b ? a : b);

export class NxGrid extends Base {
  static observedAttributes = ["columns", "rows", "filters", "labels", "source", "group-by", "facets-open", "height", "locale"];

  #uid = `nx-grid${++uid}`;
  #labels: GridLabels = GRID_LABELS;
  #loc: NxFormat = nxFormat();
  #columns: GridColumn[] = [];
  #all: GridRow[] = [];
  #filters: GridFilter[] = [];
  #sort: GridSort | null = null;
  #built = false;
  // Derivados (modo cliente).
  #specs = new Map<string, HistogramSpec | null>();
  #facetCols: GridColumn[] = [];
  #order = new Map<string, string[]>();
  #filtered: GridRow[] = [];
  #sorted: GridRow[] = [];
  #groups: GridGroup[] | null = null;
  #groupMax: Record<string, number> = {};
  #view: Item[] = [];
  #collapsed = new Set<string>();
  // Agregados (del cliente o del servidor).
  #hist = new Map<string, GridHistogram>();
  #facetList: GridFacet[] = [];
  #totals: Record<string, number> = {};
  // Filas.
  #ids = new WeakMap<GridRow, string>();
  #byId = new Map<string, GridRow>();
  #edited = new Set<string>();
  #tones = new Map<string, GridTone>();
  // Servidor.
  #total = 0;
  #blocks = new Map<number, GridRow[] | "loading">();
  #gen = 0;
  // IA.
  #aiPending = new Set<string>();
  #aiQueue = new Map<string, Set<string>>();
  #aiTimer?: ReturnType<typeof setTimeout>;
  // Hoja de cálculo.
  #act: Pos = { r: 0, c: 0 };
  #anchor: Pos = { r: 0, c: 0 };
  #dragging = false;
  #editing: Editing | null = null;
  #win = { start: -1, end: -1 };
  #raf = 0;
  // Facetas.
  #facetQ = new Map<string, string>();
  #facetMore = new Set<string>();
  // Nodos.
  #askInput?: HTMLInputElement;
  #facetBtn?: HTMLButtonElement;
  #groupSel?: HTMLSelectElement;
  #aiBtn?: HTMLButtonElement;
  #exportBtn?: HTMLButtonElement;
  #aiPop?: HTMLDivElement;
  #note?: HTMLParagraphElement;
  #chips?: HTMLDivElement;
  #aside?: HTMLElement;
  #scroll?: HTMLDivElement;
  #head?: HTMLDivElement;
  #body?: HTMLDivElement;
  #rowsEl?: HTMLDivElement;
  #empty?: HTMLParagraphElement;
  #foot?: HTMLDivElement;
  #live?: HTMLSpanElement;
  #ths: HTMLElement[] = [];
  #ro?: ResizeObserver;

  // ---------------------------------------------------------------- propiedades

  get columns(): GridColumn[] {
    return this.#columns;
  }
  set columns(v: GridColumn[] | null | undefined) {
    this.#columns = Array.isArray(v) ? v.filter((c) => c && typeof c.key === "string" && typeof c.label === "string") : [];
    this.#dataChanged(true);
  }
  /** Las filas (modo cliente). Se copian: las ediciones y los valores de IA quedan aquí, no en el original. */
  get rows(): GridRow[] {
    return this.#all;
  }
  set rows(v: GridRow[] | null | undefined) {
    this.#all = Array.isArray(v) ? v.filter((r) => r && typeof r === "object").map((r) => ({ ...r })) : [];
    this.#byId.clear();
    this.#edited.clear();
    this.#index(this.#all, 0);
    this.#dataChanged();
  }
  get filters(): GridFilter[] {
    return this.#filters;
  }
  set filters(v: GridFilter[] | null | undefined) {
    this.#setFilters(validFilters(v), false);
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
  /** URL que calcula las columnas de IA (POST `{prompt, column, columns, rows}` → eventos `cell`). */
  get aiEndpoint(): string | null {
    return this.getAttribute("ai-endpoint");
  }
  set aiEndpoint(v: string | null) {
    this.#attr("ai-endpoint", v);
    this.#paintAll();
  }
  /** URL opcional que interpreta frases que el analizador local no entiende (POST `{q, columns}` → `{filters, unknown?}`). */
  get nlEndpoint(): string | null {
    return this.getAttribute("nl-endpoint");
  }
  set nlEndpoint(v: string | null) {
    this.#attr("nl-endpoint", v);
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
  /** Nombre del archivo al exportar (sin extensión). */
  get filename(): string {
    return this.getAttribute("filename") || "tabla";
  }
  set filename(v: string) {
    this.#attr("filename", v);
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
  set labels(v: Partial<GridLabels> | null | undefined) {
    this.#labels = { ...GRID_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paintAll();
  }
  get #server(): boolean {
    return !!safeHref(this.source);
  }

  // ---------------------------------------------------------------- API

  /** Filtra con una frase. Lo que no se entiende se muestra aparte, nunca se ignora en silencio. */
  async ask(query: string): Promise<{ filters: GridFilter[]; unknown: string[] }> {
    const q = query.trim();
    if (!q) return { filters: [], unknown: [] };
    // En modo servidor el vocabulario sale también de las facetas que mandó el backend.
    const cols = this.#columns.map((c) => {
      const f = !c.options && this.#server ? this.#facetList.find((x) => x.key === c.key) : undefined;
      return f ? { ...c, options: f.options.map((o) => ({ value: o.value, label: o.label })) } : c;
    });
    let { filters, unknown } = parseNL(q, cols, this.#server ? [...this.#byId.values()] : this.#all);
    const url = safeHref(this.nlEndpoint);
    if (url && (unknown.length || !filters.length)) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ q, columns: this.#meta() }),
        });
        const data = (await res.json()) as { filters?: unknown; unknown?: unknown };
        const f = validFilters(data.filters).filter((x) => this.#columns.some((c) => c.key === x.key));
        if (f.length) {
          filters = f;
          unknown = Array.isArray(data.unknown) ? data.unknown.map(String) : [];
        }
      } catch {
        /* se queda con lo que entendió el analizador local */
      }
    }
    if (filters.length) {
      // Una frase reemplaza lo que ya hubiera sobre las mismas columnas.
      const keys = new Set(filters.map((f) => f.key));
      this.#setFilters([...this.#filters.filter((f) => !keys.has(f.key)), ...filters]);
      if (this.#askInput) this.#askInput.value = "";
    }
    if (this.#note) {
      this.#note.hidden = !unknown.length;
      this.#note.textContent = unknown.length ? this.#fmt(this.#labels.notUnderstood, { words: unknown.map((w) => `«${w}»`).join(", ") }) : "";
    }
    return { filters, unknown };
  }

  clearFilters(): void {
    this.#setFilters([]);
  }

  /** Agrega una columna que calcula la IA con los datos de cada fila (solo las filas que se ven). */
  addAiColumn(label: string, prompt: string): GridColumn | null {
    const name = label.trim();
    const p = prompt.trim();
    if (!name || !p) return null;
    let key = `ai_${foldText(name).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "col"}`;
    while (this.#columns.some((c) => c.key === key)) key += "_";
    const col: GridColumn = { key, label: name, ai: { prompt: p } };
    this.#columns = [...this.#columns, col];
    this.#dataChanged(true);
    this.#emit("nx-grid-columns", { columns: this.#columns });
    if (this.#scroll) this.#scroll.scrollLeft = this.#scroll.scrollWidth;
    return col;
  }

  removeColumn(key: string): void {
    const col = this.#columns.find((c) => c.key === key);
    if (!col) return;
    this.#columns = this.#columns.filter((c) => c !== col);
    if (col.ai) {
      for (const r of this.#byId.values()) delete r[key];
      for (const k of [...this.#aiPending]) if (k.startsWith(`${key}\u0000`)) this.#aiPending.delete(k);
      this.#aiQueue.delete(key);
    }
    this.#filters = this.#filters.filter((f) => f.key !== key);
    if (this.#sort?.key === key) this.#sort = null;
    this.#act = this.#anchor = { r: this.#act.r, c: Math.min(this.#act.c, this.#columns.length - 1) };
    this.#dataChanged(true);
    this.#emit("nx-grid-columns", { columns: this.#columns });
  }

  /** Vuelve a pedir los datos (modo servidor). */
  refresh(): void {
    if (this.#server) this.#reload();
  }

  /** Descarga las filas filtradas y ordenadas como .xlsx (el generador se carga solo en este momento). */
  async exportXlsx(filename = this.filename): Promise<void> {
    const [{ buildXlsx }, rows] = await Promise.all([import("./xlsx"), this.#server ? this.#fetchAll() : Promise.resolve(this.#sorted)]);
    const cols = this.#columns;
    const cells = rows.map((r) =>
      cols.map((c) => {
        const v = r[c.key];
        if (v === null || v === undefined || v === "") return null;
        if (isNumeric(c)) return num(v);
        if (colType(c) === "date") return String(v);
        return formatCell(v, c, this.#loc);
      }),
    );
    const types = cols.map((c) => (isNumeric(c) ? (colType(c) as "number" | "money") : colType(c) === "date" ? "date" : "text"));
    const widths = cols.map((c, ci) => Math.min(50, Math.max(10, c.label.length + 3, ...cells.slice(0, 200).map((r) => String(r[ci] ?? "").length + 2))));
    const blob = await buildXlsx(filename, cols.map((c) => c.label), cells, types, widths);
    const a = h("a", { href: URL.createObjectURL(blob), download: `${filename}.xlsx` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    for (const p of PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const self = this as unknown as Record<string, unknown>;
        const v = self[p];
        delete self[p];
        self[p] = v;
      }
    }
    if (!this.#built) this.#build();
    this.#dataChanged(true);
  }

  disconnectedCallback(): void {
    this.#ro?.disconnect();
    this.#ro = undefined;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if ((name === "columns" || name === "rows" || name === "filters" || name === "labels") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-grid] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (!this.#built || old === value) return;
    if (name === "source") this.#dataChanged(true);
    else if (name === "locale") this.#dataChanged();
    else if (name === "group-by") {
      this.#collapsed.clear();
      this.#refilter(true, "order");
    } else this.#paintAll();
  }

  // ---------------------------------------------------------------- datos

  #index(rows: readonly GridRow[], offset: number): void {
    const key = this.rowKey;
    rows.forEach((r, i) => {
      const v = r[key];
      const id = v === null || v === undefined ? `#${offset + i}` : String(v);
      this.#ids.set(r, id);
      this.#byId.set(id, r);
    });
  }

  /** Cambiaron las filas o las columnas: se recalcula todo lo que depende de ellas. */
  #dataChanged(columns = false): void {
    if (!this.#built) return;
    this.#loc = nxFormat(this.locale);
    if (columns) this.#buildHead();
    if (this.#server) return this.#reload();
    this.#specs = new Map(this.#columns.map((c) => [c.key, histogramSpec(c, this.#all, this.#loc)]));
    const auto = facetColumns(this.#columns, this.#all);
    this.#facetCols = this.#columns.filter((c) => !c.ai && (c.facet === true || (c.facet !== false && auto.includes(c))));
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
    if (this.#live) this.#live.textContent = this.#rowsText();
    if (emit) this.#emit("nx-grid-filter", { filters: this.#filters, sort: this.#sort, groupBy: this.groupBy, count: this.#rowCount() });
  }

  #setFilters(f: GridFilter[], emit = true): void {
    this.#filters = f;
    this.#refilter(emit);
  }

  /** `filter`: qué filas pasan (filtro y facetas en una pasada, histogramas y totales). Después,
   *  siempre: orden, grupos y la lista visible. Ordenar o agrupar no repite la primera etapa. */
  #recompute(stage: "filter" | "order"): void {
    const cols = this.#columns;
    if (stage === "filter") {
      const x = crossfilter(this.#all, this.#filters, this.#facetCols, this.#order);
      this.#filtered = x.filtered;
      this.#facetList = x.facets;
      this.#histAndTotals();
    }
    this.#sorted = sortRows(this.#filtered, this.#sort, cols, this.#loc);
    const gc = this.#groupable().find((c) => c.key === this.groupBy);
    this.#groups = gc ? groupRows(this.#sorted, gc, cols, this.#loc) : null;
    this.#groupStats();
    this.#flatten();
    this.#paintAll();
  }

  #histAndTotals(): void {
    this.#hist.clear();
    for (const c of this.#columns) {
      const spec = this.#specs.get(c.key);
      if (spec) this.#hist.set(c.key, histogram(spec, this.#all, this.#filtered));
    }
    this.#totals = {};
    const money = this.#columns.filter((c) => colType(c) === "money");
    for (const r of this.#filtered) for (const c of money) this.#totals[c.key] = (this.#totals[c.key] ?? 0) + (num(r[c.key]) ?? 0);
  }

  /** Subtotales (se recalculan tras una edición) y el mayor de cada columna, para las barras. */
  #groupStats(): void {
    this.#groupMax = {};
    for (const g of this.#groups ?? []) {
      for (const c of this.#columns.filter(isNumeric)) {
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
    return this.#columns.filter((c) => !c.ai && !isNumeric(c) && (colType(c) === "date" || this.#facetCols.includes(c)));
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
    this.#gen++;
    this.#blocks.clear();
    this.#win = { start: -1, end: -1 };
    void this.#load(0);
    this.#paintAll();
  }

  async #request(offset: number, limit: number): Promise<GridPage | null> {
    const url = safeHref(this.source);
    if (!url) return null;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ offset, limit, sort: this.#sort, filters: this.#filters }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as GridPage;
    return data && Array.isArray(data.rows) ? data : null;
  }

  async #load(block: number): Promise<void> {
    if (this.#blocks.has(block)) return;
    this.#blocks.set(block, "loading");
    const gen = this.#gen;
    let page: GridPage | null = null;
    try {
      page = await this.#request(block * BLOCK, BLOCK);
    } catch {
      /* el bloque se reintenta al volver a pasar por él */
    }
    if (gen !== this.#gen) return;
    if (!page) {
      this.#blocks.delete(block);
      return;
    }
    const rows = page.rows.filter((r) => r && typeof r === "object");
    this.#index(rows, block * BLOCK);
    this.#blocks.set(block, rows);
    this.#total = Math.max(0, Number(page.total) || 0);
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
    this.#paintAll();
  }

  async #fetchAll(): Promise<GridRow[]> {
    const page = await this.#request(0, Math.max(this.#total, 1)).catch(() => null);
    return page?.rows ?? [];
  }

  // ---------------------------------------------------------------- IA

  #meta() {
    return this.#columns.filter((c) => !c.ai).map(({ key, label, type, options }) => ({ key, label, type: type ?? "text", options }));
  }

  #queueAi(c: GridColumn, id: string): void {
    const k = `${c.key}\u0000${id}`;
    if (this.#aiPending.has(k) || !safeHref(this.aiEndpoint)) return;
    this.#aiPending.add(k);
    let q = this.#aiQueue.get(c.key);
    if (!q) this.#aiQueue.set(c.key, (q = new Set()));
    q.add(id);
    clearTimeout(this.#aiTimer);
    this.#aiTimer = setTimeout(() => {
      for (const [key, ids] of this.#aiQueue) {
        const col = this.#columns.find((x) => x.key === key);
        const list = [...ids];
        if (col?.ai) for (let i = 0; i < list.length; i += 50) void this.#fetchAi(col, list.slice(i, i + 50));
      }
      this.#aiQueue.clear();
    }, 120);
  }

  async #fetchAi(col: GridColumn, ids: string[]): Promise<void> {
    const url = safeHref(this.aiEndpoint);
    if (!url || !col.ai) return;
    const meta = this.#meta();
    const rows = ids.map((id) => {
      const r = this.#byId.get(id);
      const o: GridRow = { id };
      for (const c of meta) if (r?.[c.key] !== undefined) o[c.key] = r[c.key];
      return o;
    });
    const done = new Set<string>();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, text/event-stream" },
        credentials: "same-origin",
        body: JSON.stringify({ prompt: col.ai.prompt, column: col.key, label: col.label, columns: meta, rows }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readLines(res, (line) => {
        const d = lineData(line);
        if (!d || d === "[DONE]") return;
        let ev: { type?: string; id?: unknown; value?: unknown; tone?: GridTone };
        try {
          ev = JSON.parse(d);
        } catch {
          return;
        }
        const id = String(ev?.id);
        const r = this.#byId.get(id);
        if (ev?.type !== "cell" || !r || !ids.includes(id) || !this.#columns.includes(col)) return;
        r[col.key] = ev.value ?? null;
        if (typeof ev.tone === "string") this.#tones.set(`${col.key}\u0000${id}`, ev.tone);
        done.add(id);
        this.#soon();
      });
    } catch {
      /* las que no llegaron quedan vacías (no se vuelven a pedir en bucle) */
    }
    for (const id of ids) {
      const r = this.#byId.get(id);
      if (r && !done.has(id) && r[col.key] === undefined && this.#columns.includes(col)) r[col.key] = null;
    }
    this.#soon();
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
    this.#askInput = h("input", { type: "text", class: "nx-grid__ask-input", autocomplete: "off", spellcheck: "false" });
    const ask = h("form", { class: "nx-grid__ask", role: "search" }, glyph(SPARK), this.#askInput);
    ask.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.ask(this.#askInput!.value);
    });
    this.#facetBtn = h("button", { type: "button", class: "nx-grid__btn", "aria-controls": `${u}-facets` }, glyph(SLIDERS), h("span"), h("span", { class: "nx-grid__badge" }));
    this.#facetBtn.addEventListener("click", () => (this.facetsOpen = !this.facetsOpen));
    this.#groupSel = h("select", { class: "nx-grid__btn nx-grid__group" });
    this.#groupSel.addEventListener("change", () => (this.groupBy = this.#groupSel!.value));
    this.#aiBtn = h("button", { type: "button", class: "nx-grid__btn", popovertarget: `${u}-ai` }, glyph(SPARK), h("span"));
    this.#exportBtn = h("button", { type: "button", class: "nx-grid__btn" }, glyph(DOWNLOAD), h("span"));
    this.#exportBtn.addEventListener("click", () => void this.exportXlsx());
    const bar = h("div", { class: "nx-grid__bar" }, ask, this.#facetBtn, this.#groupSel, this.#aiBtn, this.#exportBtn);

    this.#note = h("p", { class: "nx-grid__note", hidden: true });
    this.#chips = h("div", { class: "nx-grid__chips" });
    this.#chips.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-i], [data-clear]");
      if (!b) return;
      if (b.dataset.clear !== undefined) this.clearFilters();
      else this.#setFilters(this.#filters.filter((_, i) => i !== Number(b.dataset.i)));
      this.#scroll?.focus({ preventScroll: true });
    });

    this.#aside = h("aside", { class: "nx-grid__facets", id: `${u}-facets` });
    this.#aside.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.type === "checkbox" && t.dataset.key) this.#setFilters(toggleFacet(this.#filters, t.dataset.key, t.dataset.value ?? ""));
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
    this.#head.addEventListener("pointermove", (e) => this.#peek(e));
    this.#head.addEventListener("pointerleave", () => this.#head!.querySelectorAll(".nx-grid__peek").forEach((p) => (p.textContent = "")));
    this.#rowsEl = h("div", { class: "nx-grid__rows", role: "rowgroup" });
    this.#body = h("div", { class: "nx-grid__body", role: "presentation" }, this.#rowsEl);
    this.#empty = h("p", { class: "nx-grid__empty", hidden: true });
    this.#scroll = h("div", { class: "nx-grid__scroll", role: "grid", tabindex: 0, "aria-multiselectable": "true" }, this.#head, this.#body, this.#empty);
    this.#scroll.addEventListener("scroll", () => this.#soon(), { passive: true });
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
    this.#rowsEl.addEventListener("dblclick", (e) => {
      if (this.#posOf(e.target)) this.#startEdit();
    });
    if (typeof ResizeObserver !== "undefined") {
      this.#ro = new ResizeObserver(() => this.#soon());
      this.#ro.observe(this.#scroll);
    }
    const main = h("div", { class: "nx-grid__main" }, this.#aside, this.#scroll);

    this.#foot = h("div", { class: "nx-grid__foot" });
    this.#live = h("span", { class: "nx-sr-only", role: "status" });
    this.#aiPop = this.#buildAiPop();
    this.append(bar, this.#note, this.#chips, main, this.#foot, this.#live, this.#aiPop);
  }

  #buildAiPop(): HTMLDivElement {
    const name = h("input", { class: "nx-grid__field", required: true, maxlength: 40, autocomplete: "off" });
    const prompt = h("textarea", { class: "nx-grid__field", required: true, rows: 3 });
    const form = h("form", { class: "nx-grid__ai-form" }, h("label", null, h("span"), name), h("label", null, h("span"), prompt), h("button", { type: "submit", class: "nx-grid__btn is-primary" }, glyph(SPARK), h("span")));
    const pop = h("div", { class: "nx-grid__pop", id: `${this.#uid}-ai`, popover: "auto" }, form);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (!this.addAiColumn(name.value, prompt.value)) return;
      form.reset();
      pop.hidePopover?.();
    });
    pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") pop.hidePopover?.();
    });
    pop.addEventListener("beforetoggle", (e) => {
      if ((e as ToggleEvent).newState !== "open") return;
      const r = this.#aiBtn!.getBoundingClientRect();
      pop.style.top = `${r.bottom + 6}px`;
      pop.style.left = `${Math.max(8, Math.min(r.right - 340, innerWidth - 348))}px`;
      requestAnimationFrame(() => name.focus());
    });
    return pop;
  }

  #buildHead(): void {
    const cols = this.#columns;
    const widths = cols.map((c) => c.width ?? WIDTH[c.ai ? "ai" : colType(c)] ?? 160);
    this.#scroll!.style.setProperty("--_cols", widths.map((w, i) => (i === widths.length - 1 ? `minmax(${w}px, 1fr)` : `${w}px`)).join(" "));
    this.#scroll!.style.setProperty("--_w", `${widths.reduce((a, b) => a + b, 0)}px`);
    this.#scroll!.setAttribute("aria-colcount", String(cols.length));
    this.#ths = cols.map((c, ci) =>
      h(
        "div",
        { role: "columnheader", class: `nx-grid__th${isNumeric(c) ? " is-num" : ""}${c.ai ? " is-ai" : ""}`, "aria-colindex": ci + 1, title: c.ai?.prompt },
        h("button", { type: "button", class: "nx-grid__sort", "data-sort": ci }, c.ai ? glyph(SPARK, "nx-grid__ai-mark") : null, h("span", { class: "nx-grid__th-label" }, c.label), glyph(ARROW, "nx-grid__sort-icon")),
        c.ai ? h("button", { type: "button", class: "nx-grid__rm", "data-rm": ci }, glyph(X)) : null,
        c.ai ? h("span", { class: "nx-grid__ai-prompt" }, c.ai.prompt) : h("div", { class: "nx-grid__hist", "data-ci": ci, "aria-hidden": "true" }),
        h("span", { class: "nx-grid__peek", "aria-hidden": "true" }),
      ),
    );
    this.#head!.replaceChildren(...this.#ths);
    this.#win = { start: -1, end: -1 };
  }

  // ---------------------------------------------------------------- pintar

  #paintAll(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const height = Number(this.getAttribute("height"));
    if (height > 0) this.style.setProperty("--nx-grid-height", `${height}px`);
    // Barra de herramientas.
    this.#askInput!.placeholder = L.ask;
    this.#askInput!.setAttribute("aria-label", L.ask);
    const applied = this.#filters.reduce((a, f) => a + ("values" in f ? f.values.length : 1), 0);
    this.#facetBtn!.hidden = !this.#facetList.length;
    this.#facetBtn!.setAttribute("aria-expanded", String(this.facetsOpen));
    this.#facetBtn!.children[1].textContent = L.filters;
    this.#facetBtn!.children[2].textContent = applied ? String(applied) : "";
    const groupable = this.#groupable();
    this.#groupSel!.hidden = !groupable.length;
    this.#groupSel!.setAttribute("aria-label", this.#fmt(L.groupBy, { col: "" }).trim());
    this.#groupSel!.replaceChildren(h("option", { value: "" }, L.noGroup), ...groupable.map((c) => h("option", { value: c.key }, this.#fmt(L.groupBy, { col: c.label }))));
    this.#groupSel!.value = groupable.some((c) => c.key === this.groupBy) ? this.groupBy : "";
    this.#aiBtn!.hidden = !safeHref(this.aiEndpoint);
    this.#aiBtn!.lastElementChild!.textContent = L.aiColumn;
    this.#exportBtn!.lastElementChild!.textContent = L.export;
    const [nameL, promptL] = this.#aiPop!.querySelectorAll("label > span");
    nameL.textContent = L.aiName;
    promptL.textContent = L.aiPrompt;
    this.#aiPop!.querySelector("button > span:last-child")!.textContent = L.aiAdd;
    // Chips.
    this.#chips!.hidden = !this.#filters.length;
    this.#chips!.replaceChildren(
      ...this.#filters.map((f, i) => {
        const text = filterLabel(f, this.#colOf(f.key), this.#loc);
        return h("span", { class: "nx-grid__chip" }, h("span", null, text), h("button", { type: "button", "data-i": i, "aria-label": `${L.remove}: ${text}` }, glyph(X)));
      }),
      h("button", { type: "button", class: "nx-grid__clear", "data-clear": "" }, L.clear),
    );
    // Cabeceras.
    this.#ths.forEach((th, ci) => this.#paintTh(th, this.#columns[ci]));
    this.#scroll!.setAttribute("aria-rowcount", String(this.#count() + 1));
    this.#empty!.textContent = L.empty;
    this.#empty!.hidden = this.#count() > 0 || (this.#server && this.#blocks.get(0) === "loading") || !this.#columns.length;
    this.#paintFacets();
    this.#paintRows(true);
  }

  #colOf(key: string): GridColumn | undefined {
    const c = this.#columns.find((x) => x.key === key);
    const f = this.#facetList.find((x) => x.key === key);
    // En modo servidor, las etiquetas de los valores vienen de las facetas.
    return c && !c.options && f ? { ...c, options: f.options.map((o) => ({ value: o.value, label: o.label })) } : c;
  }

  #paintTh(th: HTMLElement, c: GridColumn): void {
    const dir = this.#sort?.key === c.key ? this.#sort.dir : 0;
    th.setAttribute("aria-sort", dir === 1 ? "ascending" : dir === -1 ? "descending" : "none");
    th.dataset.sort = dir ? (dir === 1 ? "asc" : "desc") : "";
    th.querySelector(".nx-grid__rm")?.setAttribute("aria-label", `${this.#labels.remove}: ${c.label}`);
    const box = th.querySelector<HTMLElement>(".nx-grid__hist");
    if (!box) return;
    const hst = this.#hist.get(c.key);
    if (!hst) return box.replaceChildren();
    const max = Math.max(1, ...hst.counts);
    const sel = this.#barSel(c.key, hst);
    box.replaceChildren(
      ...hst.counts.map((n, i) => {
        const b = h("span", { class: `nx-grid__hbar${sel ? (sel[i] ? " is-on" : " is-off") : ""}`, "data-bar": i });
        b.style.setProperty("--_a", String(n ? Math.max(n / max, 0.06) : 0));
        b.style.setProperty("--_f", String(hst.filtered[i] ? Math.max(hst.filtered[i] / max, 0.06) : 0));
        return b;
      }),
    );
  }

  /** Qué barras quedan dentro de los filtros de su propia columna (null si no hay ninguno). */
  #barSel(key: string, hst: GridHistogram): boolean[] | null {
    const fs = this.#filters.filter((f) => f.key === key);
    if (!fs.length) return null;
    return hst.labels.map((_, i) =>
      fs.every((f) => {
        if (hst.kind === "categories") {
          const v = hst.values?.[i] ?? "";
          return f.op === "in" ? f.values.includes(v) : f.op === "notIn" ? !f.values.includes(v) : true;
        }
        if (f.op !== "range" || !hst.edges) return true;
        const a = hst.edges[i];
        const b = hst.edges[i + 1];
        return (f.min === undefined || b > f.min) && (f.max === undefined || a < f.max);
      }),
    );
  }

  #paintFacets(): void {
    const aside = this.#aside!;
    const open = this.facetsOpen && this.#facetList.length > 0;
    aside.hidden = !open;
    if (!open) return;
    const L = this.#labels;
    const focused = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>("[data-focus]");
    const focusKey = aside.contains(focused ?? null) ? focused!.dataset.focus : undefined;
    const sel = (key: string) => (this.#filters.find((f) => f.key === key && f.op === "in") as { values: string[] } | undefined)?.values ?? [];
    aside.setAttribute("aria-label", L.filters);
    aside.replaceChildren(
      h("div", { class: "nx-grid__facets-head" }, h("strong", null, L.filters), this.#filters.length ? h("button", { type: "button", class: "nx-grid__clear", "data-clear": "" }, L.clear) : null),
      ...this.#facetList.map((f) => {
        const selected = sel(f.key);
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

  #soon(): void {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      this.#paintRows();
    });
  }

  /** Pinta solo las filas visibles (y unas de margen). */
  #paintRows(force = false): void {
    if (!this.#built || this.#editing) return;
    const s = this.#scroll!;
    const n = this.#count();
    this.#body!.style.blockSize = `${n * ROW_H}px`;
    const vh = s.clientHeight || 420;
    const start = Math.max(0, Math.floor(s.scrollTop / ROW_H) - OVERSCAN);
    const end = Math.min(n, Math.ceil((s.scrollTop + vh) / ROW_H) + OVERSCAN);
    if (this.#server) for (let b = Math.floor(start / BLOCK); b <= Math.floor(Math.max(start, end - 1) / BLOCK); b++) void this.#load(b);
    const box = this.#rowsEl!;
    const old = this.#win;
    const kids = [...box.children] as HTMLElement[];
    if (!force && start === old.start && end === old.end && !kids.some((el) => this.#stale(el))) return;
    this.#win = { start, end };
    box.style.insetBlockStart = `${start * ROW_H}px`;
    if (force || old.start < 0 || end <= old.start || start >= old.end) {
      const rows: HTMLElement[] = [];
      for (let i = start; i < end; i++) rows.push(this.#rowEl(i));
      box.replaceChildren(...rows);
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

  /** Una fila pintada sin sus datos (bloque del servidor o celda de IA) que ya los tiene. */
  #stale(el: HTMLElement): boolean {
    const r = Number(el.dataset.r);
    if (el.classList.contains("is-loading")) return !!this.#itemAt(r);
    const shims = el.querySelectorAll(".nx-grid__shim");
    if (!shims.length) return false;
    const it = this.#itemAt(r);
    return !it || "g" in it || [...shims].some((x) => it.r[this.#columns[Number((x.parentElement as HTMLElement).dataset.c)]?.key ?? ""] !== undefined);
  }

  #rowEl(i: number): HTMLElement {
    const cols = this.#columns;
    const u = this.#uid;
    const it = this.#itemAt(i);
    const row = h("div", { role: "row", class: "nx-grid__row", "aria-rowindex": i + 2, "data-r": i });
    const cell = (c: GridColumn, ci: number) => h("div", { role: "gridcell", class: `nx-grid__cell${isNumeric(c) ? " is-num" : ""}`, id: `${u}-${i}-${ci}`, "data-c": ci });
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
        if (c.ai && v === undefined) {
          el.append(h("span", { class: "nx-grid__shim" }));
          this.#queueAi(c, id);
        } else {
          const text = formatCell(v, c, this.#loc);
          const tone = c.ai ? this.#tones.get(`${c.key}\u0000${id}`) : c.options?.find((o) => o.value === String(v))?.tone;
          if (text && (colType(c) === "status" || tone)) el.append(h("span", { class: "nx-grid__pill", "data-tone": tone ?? "neutral" }, text));
          else el.textContent = text;
          if (c.ai && text) el.title = text;
        }
        if (c.editable && !c.ai) el.classList.add("is-editable");
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
    return this.#filters.length && !this.#server ? this.#fmt(this.#labels.of, { n, total: this.#loc.number(total) }) : this.#fmt(this.#labels.rows, { n });
  }

  #paintFoot(): void {
    const L = this.#labels;
    const { r0, r1, c0, c1 } = this.#range();
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
    const bar = t.closest<HTMLElement>("[data-bar]");
    if (bar) return this.#barClick(Number(bar.closest<HTMLElement>("[data-ci]")!.dataset.ci), Number(bar.dataset.bar), e.shiftKey);
    const rm = t.closest<HTMLElement>("[data-rm]");
    if (rm) return this.removeColumn(this.#columns[Number(rm.dataset.rm)]?.key ?? "");
    const s = t.closest<HTMLElement>("[data-sort]");
    if (!s) return;
    const c = this.#columns[Number(s.dataset.sort)];
    const cur = this.#sort?.key === c.key ? this.#sort.dir : 0;
    this.#sort = cur === 0 ? { key: c.key, dir: 1 } : cur === 1 ? { key: c.key, dir: -1 } : null;
    this.#refilter(true, "order");
  }

  /** Clic en una barra: una categoría se suma o se quita; un rango reemplaza (Mayús lo extiende). */
  #barClick(ci: number, i: number, extend: boolean): void {
    const c = this.#columns[ci];
    const hst = c && this.#hist.get(c.key);
    if (!hst) return;
    if (hst.kind === "categories") {
      const v = hst.values?.[i];
      if (v !== undefined) this.#setFilters(toggleFacet(this.#filters.filter((f) => !(f.key === c.key && f.op === "notIn")), c.key, v));
      return;
    }
    const a = hst.edges?.[i];
    const b = hst.edges?.[i + 1];
    if (a === undefined || b === undefined) return;
    const cur = this.#filters.find((f) => f.key === c.key && f.op === "range") as Extract<GridFilter, { op: "range" }> | undefined;
    const rest = this.#filters.filter((f) => f !== cur);
    let next: GridFilter | null = { key: c.key, op: "range", min: a, max: b };
    if (cur && extend) next = { key: c.key, op: "range", min: lo(cur.min, a), max: hi(cur.max, b) };
    else if (cur && cur.min === a && cur.max === b) next = null;
    this.#setFilters(next ? [...rest, next] : rest);
  }

  #peek(e: PointerEvent): void {
    const bar = (e.target as Element).closest<HTMLElement>("[data-bar]");
    const th = (e.target as Element).closest<HTMLElement>(".nx-grid__th");
    this.#head!.querySelectorAll<HTMLElement>(".nx-grid__peek").forEach((p) => {
      if (p.parentElement !== th || !bar) return void (p.textContent = "");
      const hst = this.#hist.get(this.#columns[Number(bar.closest<HTMLElement>("[data-ci]")!.dataset.ci)]?.key ?? "");
      const i = Number(bar.dataset.bar);
      if (!hst) return;
      const f = hst.filtered[i];
      const n = hst.counts[i];
      p.textContent = `${hst.labels[i]} · ${f === n ? this.#loc.number(n) : `${this.#loc.number(f)}/${this.#loc.number(n)}`}`;
    });
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
    if (e.button !== 0 || (this.#editing && e.target === this.#editing.input)) return;
    const p = this.#posOf(e.target);
    if (!p) return;
    e.preventDefault();
    this.#scroll!.focus({ preventScroll: true });
    const it = this.#itemAt(p.r);
    if (it && "g" in it && (e.target as Element).closest(".nx-grid__chev, .nx-grid__g-label")) {
      this.#act = this.#anchor = p;
      return this.#toggleGroup(p.r);
    }
    this.#act = p;
    if (!e.shiftKey) this.#anchor = p;
    this.#paintSel();
    this.#dragging = true;
    document.addEventListener("pointerup", () => (this.#dragging = false), { once: true });
  }

  #toggleGroup(r: number): void {
    const it = this.#itemAt(r);
    if (!it || !("g" in it)) return;
    if (!this.#collapsed.delete(it.g.key)) this.#collapsed.add(it.g.key);
    this.#flatten();
    this.#scroll!.setAttribute("aria-rowcount", String(this.#count() + 1));
    this.#paintRows(true);
  }

  #onKey(e: KeyboardEvent): void {
    if (e.target !== this.#scroll) return;
    const n = this.#count();
    const m = this.#columns.length;
    if (!n || !m) return;
    const mod = e.ctrlKey || e.metaKey;
    let { r, c } = this.#act;
    const it = this.#itemAt(r);
    const page = Math.max(1, Math.floor((this.#scroll!.clientHeight - this.#head!.offsetHeight) / ROW_H) - 1);
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
        if (e.key !== " ") {
          e.preventDefault();
          return this.#startEdit();
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

  #moveTo(p: Pos, extend: boolean): void {
    this.#act = p;
    if (!extend) this.#anchor = p;
    this.#reveal();
    this.#paintSel();
  }

  /** Lleva la celda activa a la vista (bajo la cabecera fija). */
  #reveal(): void {
    const s = this.#scroll!;
    const top = this.#act.r * ROW_H;
    const vh = s.clientHeight - this.#head!.offsetHeight;
    if (top < s.scrollTop) s.scrollTop = top;
    else if (vh > 0 && top + ROW_H > s.scrollTop + vh) s.scrollTop = top + ROW_H - vh;
    this.#paintRows();
    this.#cell(this.#act)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  #cell(p: Pos): HTMLElement | null {
    const row = this.#rowsEl!.querySelector<HTMLElement>(`[data-r="${p.r}"]`);
    return [...((row?.children ?? []) as HTMLCollectionOf<HTMLElement>)].find((x) => Number(x.dataset.c) <= p.c && p.c <= Number(x.dataset.to ?? x.dataset.c)) ?? null;
  }

  #startEdit(initial?: string): void {
    const { r, c } = this.#act;
    const it = this.#itemAt(r);
    const col = this.#columns[c];
    if (!it || "g" in it || !col?.editable || col.ai) return;
    this.#anchor = this.#act;
    this.#reveal();
    this.#paintSel();
    const cell = this.#cell(this.#act);
    if (!cell) return;
    const v = it.r[col.key];
    const input = h("input", { class: "nx-grid__input", "aria-label": col.label, autocomplete: "off", inputmode: isNumeric(col) ? "decimal" : null });
    input.value = initial ?? (v === null || v === undefined ? "" : colType(col) === "status" ? formatCell(v, col, this.#loc) : String(v));
    const ed: Editing = { r, c, input, quick: initial !== undefined };
    this.#editing = ed;
    cell.classList.add("is-editing");
    cell.replaceChildren(input);
    if (col.options) {
      const dl = h("datalist", { id: `${this.#uid}-dl` }, ...col.options.map((o) => h("option", { value: o.label ?? o.value })));
      input.setAttribute("list", dl.id);
      cell.append(dl);
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
      if (this.#editing === ed) this.#endEdit(true);
    });
    input.focus();
    if (!ed.quick) input.select();
  }

  #endEdit(commit: boolean, dr = 0, dc = 0): void {
    const ed = this.#editing;
    if (!ed) return;
    this.#editing = null;
    const it = this.#itemAt(ed.r);
    const col = this.#columns[ed.c];
    if (commit && it && "r" in it && col) {
      const value = parseInput(ed.input.value, col, this.#loc);
      const old = it.r[col.key];
      if (value !== old && !(value === "" && (old === null || old === undefined))) this.#apply([{ id: this.#ids.get(it.r)!, key: col.key, value, old }]);
    }
    this.#paintRows(true);
    this.#scroll!.focus({ preventScroll: true });
    const n = this.#count();
    const m = this.#columns.length;
    this.#moveTo({ r: Math.max(0, Math.min(n - 1, ed.r + dr)), c: Math.max(0, Math.min(m - 1, ed.c + dc)) }, false);
  }

  /** Aplica ediciones (una celda, un pegado, un borrado), si nadie cancela `nx-grid-change`. No
   *  reordena ni refiltra las filas, como una hoja de cálculo; sí recalcula totales e histogramas. */
  #apply(changes: GridChange[]): void {
    if (!changes.length || !this.#emit("nx-grid-change", { changes }, true)) return;
    for (const ch of changes) {
      const r = this.#byId.get(ch.id);
      if (!r) continue;
      r[ch.key] = ch.value;
      this.#edited.add(`${ch.id}\u0000${ch.key}`);
    }
    if (!this.#server) {
      // Como una hoja de cálculo: no se reordena ni se refiltra; sí se recalculan los agregados.
      this.#specs = new Map(this.#columns.map((c) => [c.key, histogramSpec(c, this.#all, this.#loc)]));
      this.#order = facetOrder(this.#facetCols, this.#all);
      this.#facetList = crossfilter(this.#all, this.#filters, this.#facetCols, this.#order).facets;
      this.#histAndTotals();
      this.#groupStats();
    }
    this.#paintAll();
  }

  #editableCells(fn: (row: GridRow, col: GridColumn, i: number, j: number) => void): void {
    const { r0, r1, c0, c1 } = this.#range();
    for (let r = r0; r <= r1; r++) {
      const it = this.#itemAt(r);
      if (!it || "g" in it) continue;
      for (let c = c0; c <= c1; c++) {
        const col = this.#columns[c];
        if (col?.editable && !col.ai) fn(it.r, col, r - r0, c - c0);
      }
    }
  }

  #clearRange(): void {
    const changes: GridChange[] = [];
    this.#editableCells((row, col) => {
      if (row[col.key] !== null && row[col.key] !== undefined && row[col.key] !== "") changes.push({ id: this.#ids.get(row)!, key: col.key, value: null, old: row[col.key] });
    });
    this.#apply(changes);
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
        line.push(isNumeric(col) ? String(num(v) ?? "") : colType(col) === "date" ? String(v ?? "") : formatCell(v, col, this.#loc));
      }
      out.push(line);
    }
    e.clipboardData.setData("text/plain", toTSV(out));
    e.preventDefault();
    this.#scroll!.classList.remove("is-copied");
    void this.#scroll!.offsetWidth;
    this.#scroll!.classList.add("is-copied");
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
    const cols = fill ? c1 - c0 + 1 : Math.max(...m.map((x) => x.length));
    this.#anchor = { r: r0, c: c0 };
    this.#act = { r: Math.min(this.#count() - 1, r0 + rows - 1), c: Math.min(this.#columns.length - 1, c0 + cols - 1) };
    const changes: GridChange[] = [];
    this.#editableCells((row, col, i, j) => {
      const t = fill ? m[0][0] : m[i]?.[j];
      if (t === undefined) return;
      const value = parseInput(t, col, this.#loc);
      if (value === null && t.trim()) return; // texto que no es número en una columna numérica
      if (value !== row[col.key]) changes.push({ id: this.#ids.get(row)!, key: col.key, value, old: row[col.key] });
    });
    this.#apply(changes);
    this.#paintSel();
  }
}
