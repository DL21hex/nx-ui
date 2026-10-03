/**
 * `<nx-import>`: importar una hoja de Excel o un CSV sin sufrir. Tres pasos con un solo indicador
 * («Paso 2 de 3 · Columnas») y controles de formulario normales:
 *
 * 1. **Archivo.** Se arrastra, se elige o se pega (Ctrl/⌘+V de lo copiado en Excel). CSV/TSV con
 *    separador, comillas y codificación detectados; .xlsx con su lector propio (`read-xlsx.ts`, que se
 *    carga solo cuando llega un libro). La fila de encabezados se encuentra aunque haya títulos arriba.
 * 2. **Columnas.** Cada campo de destino queda asociado a una columna del archivo (por nombre o por
 *    contenido) con una muestra y la confianza; se cambia con un `<select>`, se deja «No importar» o
 *    se le pone un mismo valor para todas las filas. El mapeo se recuerda por encabezados.
 * 3. **Revisión.** Cada fila se normaliza y valida; primero las que tienen errores, con la celda
 *    editable ahí mismo. Se corrigen o se omiten, y se importa: con `endpoint`, en lotes con avance,
 *    cancelable, y lo que el servidor rechaza vuelve a la revisión.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeEndpoint, emit, setAttr } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import {
  IMPORT_MESSAGES,
  autoMap,
  buildTable,
  cellText,
  cleanColumns,
  columnContext,
  columnLetter,
  countChecks,
  decodeBytes,
  detectHeaderRow,
  fmtLabel,
  hasIssues,
  importValidator,
  markDuplicates,
  normalizeValue,
  parseCsv,
  parseServerErrors,
  parseSize,
  recallMapping,
  rememberMapping,
  rowIssues,
  toCsv,
} from "./logic";
import type { ImportCell, ImportColumn, ImportColumnInput, ImportDoneDetail, ImportErrorCode, ImportLabels, ImportMapping, ImportMatch, ImportRowCheck, ImportState, ImportTable } from "./types";
import type { XlsxBook } from "./read-xlsx";

export const IMPORT_LABELS: ImportLabels = {
  ...IMPORT_MESSAGES,
  step: "Paso {n} de {total} · ",
  stepFile: "Archivo",
  stepColumns: "Columnas",
  stepReview: "Revisión",
  drop: "Arrastra aquí el archivo o elige uno",
  dropHint: "CSV, TSV, TXT o Excel (.xlsx), hasta {max}. También puedes pegar lo copiado de Excel con {mod}+V.",
  change: "Cambiar el archivo",
  dragging: "Suelta el archivo para leerlo",
  reading: "Leyendo el archivo…",
  pasted: "Texto pegado",
  fileInfo: "{name} · {rows} · {cols}",
  rowCount: "1 fila|{n} filas",
  colCount: "1 columna|{n} columnas",
  sheet: "Hoja",
  headerRow: "Los encabezados están en la fila",
  noHeader: "Sin encabezados",
  column: "Columna {n}",
  tooBig: "El archivo pesa {size}; el máximo es {max}.",
  unreadable: "No se pudo leer el archivo. Guárdalo como .xlsx o CSV e inténtalo de nuevo.",
  oldExcel: "Los .xls antiguos no se pueden leer: guárdalo como .xlsx o CSV.",
  emptyFile: "El archivo no tiene datos.",
  onlyHeaders: "El archivo solo tiene los encabezados, sin filas de datos.",
  noColumns: "No hay campos de destino configurados (columns).",
  back: "Anterior",
  next: "Siguiente",
  skip: "No importar",
  fixed: "Mismo valor para todas las filas…",
  fixedLabel: "Valor para todas las filas",
  sample: "Ej.: {values}",
  emptyColumn: "Columna vacía",
  byName: "Por el nombre",
  byContent: "Por el contenido",
  remembered: "Usamos el mismo orden de la última vez.",
  unused: "No se importan: {names}",
  missing: "Elige la columna del archivo o un valor para todas las filas",
  checking: "Revisando las filas… {pct}",
  ready: "1 fila lista|{n} filas listas",
  invalid: "1 con errores|{n} con errores",
  emptyRows: "1 vacía que se omite|{n} vacías que se omiten",
  line: "Fila",
  more: "y 1 fila más|y {n} filas más",
  skipErrors: "Omitir las filas con errores",
  fixFirst: "Corrige las filas con errores o marca «Omitir las filas con errores».",
  import: "Importar 1 fila|Importar {n} filas",
  finish: "Terminar",
  sending: "Enviando {done} de {total}…",
  cancel: "Cancelar",
  cancelled: "Envío cancelado. Se importaron {n}; puedes seguir con el resto.",
  failed: "No se pudo enviar ({error}). Se importaron {n}; puedes reintentar el resto.",
  rejected: "El servidor rechazó 1 fila: corrígela y vuelve a enviarla.|El servidor rechazó {n} filas: corrígelas y vuelve a enviarlas.",
  done: "Importamos 1 fila|Importamos {n} filas",
  notImported: "1 fila no entró|{n} filas no entraron",
  download: "Descargar las que no entraron (CSV)",
  reason: "Motivo",
  again: "Importar otro archivo",
  yes: "Sí",
  no: "No",
  failedFile: "filas-sin-importar",
};

const UPLOAD = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const ACCEPT = ".csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Filas de la revisión que se pintan como mucho (las demás se cuentan: «y N más»). */
const LIMIT = 200;
/** Filas por tramo al revisar: entre tramos, la página respira. */
const SLICE = 5000;
const STEPS = ["file", "columns", "review"] as const;

type Loaded = { name: string; rows: ImportCell[][]; book?: XlsxBook; sheet: number };

let uid = 0;
const pause = () => new Promise((r) => setTimeout(r, 0));
function store(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

export class NxImport extends Base {
  static observedAttributes = ["columns", "endpoint", "batch", "accept", "max-size", "memory", "locale", "labels", "disabled"];

  #uid = `nx-imp${++uid}`;
  #labels: ImportLabels = IMPORT_LABELS;
  #columns: ImportColumn[] = [];
  #step: ImportState = "file";
  #file: Loaded | null = null;
  #table: ImportTable | null = null;
  #samples: string[][] = [];
  #matches: Record<string, ImportMatch> = {};
  #fixed: Record<string, string> = {};
  #remembered = false;
  /** Campos obligatorios sin columna al intentar seguir (se marcan hasta que se arreglen). */
  #missing = new Map<string, string>();
  #check: ((i: number, edits?: Record<string, string>) => ImportRowCheck) | null = null;
  #checks: ImportRowCheck[] = [];
  #checking = false;
  #edits = new Map<number, Record<string, string>>();
  #accepted = new Set<number>();
  #skip = false;
  #error = "";
  #status = "";
  #progress: [number, number] | null = null;
  #done: ImportDoneDetail | null = null;
  #abort?: AbortController;
  /** Sube con cada lectura o revisión: una que quedó vieja no pinta encima de la nueva. */
  #run = 0;
  #built = false;
  #title?: HTMLHeadingElement;
  #body?: HTMLFieldSetElement;
  #back?: HTMLButtonElement;
  #next?: HTMLButtonElement;
  #statusEl?: HTMLParagraphElement;
  #bar?: HTMLProgressElement;
  #input?: HTMLInputElement;

  // ---------------------------------------------------------------- propiedades

  /** Los campos de destino: `[{key, label, type?, required?, unique?, options?, aliases?, min?, max?, pattern?, hint?}]`. */
  get columns(): ImportColumn[] {
    return this.#columns;
  }
  set columns(v: ImportColumnInput[] | string | null | undefined) {
    this.#columns = cleanColumns(v);
    if (this.#table) {
      this.#automap();
      if (this.#step === "review" || this.#step === "done") this.#step = "columns";
    }
    this.#paint();
  }
  /** URL que recibe `POST {rows, offset}` por lotes (del mismo origen, o de uno de `allowOrigins`). */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    this.#attr("endpoint", v);
  }
  /** Filas por lote (por defecto 500). */
  get batch(): number {
    const n = Math.floor(Number(this.getAttribute("batch")));
    return n > 0 ? n : 500;
  }
  set batch(v: number) {
    this.#attr("batch", String(v));
  }
  get accept(): string {
    return this.getAttribute("accept") || ACCEPT;
  }
  set accept(v: string | null) {
    this.#attr("accept", v);
  }
  /** Tamaño máximo del archivo en bytes (el atributo acepta «20MB», «500 KB»). Por defecto 20 MB. */
  get maxSize(): number {
    return parseSize(this.getAttribute("max-size"));
  }
  set maxSize(v: number | string | null) {
    this.#attr("max-size", v === null || v === undefined ? null : String(v));
  }
  /** Clave para recordar el mapeo (sin ella, el `id`). */
  get memory(): string {
    return this.getAttribute("memory") ?? "";
  }
  set memory(v: string | null) {
    this.#attr("memory", v);
  }
  get locale(): string {
    return resolveLocale(this);
  }
  set locale(v: string | null) {
    this.#attr("locale", v);
  }
  get labels(): ImportLabels {
    return this.#labels;
  }
  set labels(v: Partial<ImportLabels> | string | null | undefined) {
    this.#labels = mergeLabels(IMPORT_LABELS, v);
    this.#paint();
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    if (v) this.setAttribute("disabled", "");
    else this.removeAttribute("disabled");
  }
  /** `file`, `columns`, `review`, `sending` o `done`. */
  get state(): ImportState {
    return this.#step;
  }
  /** Campo → índice de la columna del archivo (o `null`). */
  get mapping(): ImportMapping {
    return Object.fromEntries(this.#columns.map((c) => [c.key, this.#matches[c.key]?.index ?? null]));
  }
  /** Las filas normalizadas: las importadas al terminar; antes, las que están listas. */
  get rows(): Record<string, unknown>[] {
    if (this.#done) return this.#done.rows;
    return this.#checks.filter((c) => !c.empty && !hasIssues(c)).map((c) => c.values);
  }

  // ---------------------------------------------------------------- API

  /** Lee un archivo (CSV, TSV, TXT o .xlsx) o un texto (lo copiado de Excel) y deja listo el paso 1. */
  async load(src: Blob | string): Promise<void> {
    if (!this.#built) this.#build();
    const run = ++this.#run;
    this.#abort?.abort();
    const L = this.#labels;
    this.#error = "";
    let name = L.pasted;
    let rows: ImportCell[][];
    let book: XlsxBook | undefined;
    let sheet = 0;
    if (typeof src === "string") rows = parseCsv(src);
    else {
      name = (src as File).name || name;
      if (src.size > this.maxSize) return this.#fail("size", fmtLabel(L.tooBig, { size: this.#size(src.size), max: this.#size(this.maxSize) }));
      this.#setStatus(L.reading);
      try {
        const bytes = new Uint8Array(await src.arrayBuffer());
        if (bytes[0] === 0xd0 && bytes[1] === 0xcf) return this.#fail("read", L.oldExcel, run);
        // Una imagen, un PDF o un audio (una captura pegada, el archivo equivocado) no es una tabla.
        if (/^(image|audio|video)\//.test(src.type) || src.type === "application/pdf" || /^(\x89PNG|\xff\xd8\xff|%PDF|GIF8)/.test(String.fromCharCode(...bytes.subarray(0, 4)))) return this.#fail("read", L.unreadable, run);
        if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3) {
          const { readXlsx } = await import("./read-xlsx");
          book = await readXlsx(bytes);
          rows = [];
          for (let i = 0; i < book.names.length; i++) {
            rows = await book.sheet(i);
            sheet = i;
            if (rows.some((r) => r.length)) break;
          }
        } else rows = parseCsv(decodeBytes(bytes));
      } catch {
        return this.#fail("read", L.unreadable, run);
      }
    }
    if (run !== this.#run) return;
    this.#reset(false);
    this.#file = { name, rows, book, sheet };
    this.#read(detectHeaderRow(rows));
  }

  /** Vuelve al paso 1, sin archivo. */
  reset(): void {
    this.#run++;
    this.#abort?.abort();
    this.#reset(true);
    this.#paint();
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#built) this.#build();
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "labels" || name === "columns") {
      if (value)
        try {
          JSON.parse(value);
        } catch {
          console.warn(`[nx-import] el atributo "${name}" no es JSON válido`);
        }
      (this as unknown as Record<string, unknown>)[name] = value;
      return;
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    setAttr(this, name, v);
  }
  #fmt() {
    return nxFormat(resolveLocale(this));
  }
  #size(bytes: number): string {
    const mb = bytes / 1048576;
    return mb >= 1 ? `${this.#fmt().number(Math.round(mb * 10) / 10)} MB` : `${this.#fmt().number(Math.max(1, Math.round(bytes / 1024)))} KB`;
  }
  /** Un texto con `{n}` (y su plural «uno|varios»), con el número en el formato del locale. */
  #count(t: string, n: number): string {
    return fmtLabel(t, { n: this.#fmt().number(n) });
  }
  #emit<T>(type: string, detail: T): void {
    emit(this, type, detail);
  }
  #setStatus(text: string, progress: [number, number] | null = null): void {
    this.#status = text;
    this.#progress = progress;
    this.#paintFoot();
  }

  #reset(all: boolean): void {
    this.#step = "file";
    this.#table = null;
    this.#checks = [];
    this.#check = null;
    this.#checking = false;
    this.#edits.clear();
    this.#accepted.clear();
    this.#missing.clear();
    this.#skip = false;
    this.#done = null;
    this.#status = "";
    this.#progress = null;
    if (all) (this.#file = null), (this.#error = "");
  }

  #fail(code: ImportErrorCode, message: string, run = this.#run): void {
    if (run !== this.#run) return;
    this.#reset(true);
    this.#error = message;
    this.#paint();
    this.#emit("nx-import-error", { code, message });
  }

  /** Arma la tabla desde la fila de encabezados y asocia las columnas. Si la persona eligió una fila
   *  sin datos debajo, el archivo se queda (con el aviso) para que elija otra. */
  #read(headerRow: number, manual = false): void {
    const f = this.#file!;
    const L = this.#labels;
    const t = buildTable(f.rows, headerRow);
    const data = t.rows.some((r) => r.some((c) => cellText(c)));
    this.#error = "";
    if (!t.headers.length || (!data && headerRow < 0)) return this.#fail("empty", L.emptyFile);
    if (!data && !manual) return this.#fail("empty", L.onlyHeaders);
    if (!data) this.#error = L.onlyHeaders;
    this.#table = t;
    // Otra tabla (otra fila de encabezados u otra hoja): los índices de antes ya no son estas filas.
    this.#checks = [];
    this.#accepted.clear();
    this.#samples = t.headers.map((_, c) => {
      const out: string[] = [];
      for (let r = 0; r < t.rows.length && out.length < 3 && r < 500; r++) {
        const v = cellText(t.rows[r][c]);
        if (v && !out.includes(v)) out.push(v.length > 40 ? `${v.slice(0, 39)}…` : v);
      }
      return out;
    });
    this.#automap();
    this.#paint();
    this.#setStatus(this.#fileInfo());
    this.#emit("nx-import-parsed", { name: f.name, sheet: f.book?.names[f.sheet], sheets: f.book?.names, headers: this.#headers(), headerRow: t.headerRow, rows: t.rows.length });
  }

  #fileInfo(): string {
    const t = this.#table!;
    const L = this.#labels;
    return fmtLabel(L.fileInfo, { name: this.#file!.name, rows: this.#count(L.rowCount, t.rows.length), cols: this.#count(L.colCount, t.headers.length) });
  }
  /** Los encabezados, con «Columna N» donde no hay. */
  #headers(): string[] {
    return this.#table!.headers.map((x, i) => x || fmtLabel(this.#labels.column, { n: i + 1 }));
  }

  #automap(): void {
    const t = this.#table!;
    const cols = this.#columns;
    const mem = recallMapping(store(), this.memory || this.id, t.headers, cols);
    this.#missing.clear();
    if (mem && cols.some((c) => mem.mapping[c.key] !== null || c.key in mem.fixed)) {
      this.#matches = Object.fromEntries(cols.map((c) => [c.key, { index: mem.mapping[c.key], score: 1, by: mem.mapping[c.key] !== null || c.key in mem.fixed ? "memory" : "none" }]));
      this.#fixed = mem.fixed;
      this.#remembered = true;
    } else {
      this.#matches = autoMap(cols, t);
      this.#fixed = {};
      this.#remembered = false;
    }
  }

  #go(step: ImportState): void {
    this.#step = step;
    this.#status = "";
    this.#progress = null;
    this.#paint();
    this.#title?.focus({ preventScroll: true });
    this.#title?.scrollIntoView?.({ block: "nearest" });
  }

  // ---------------------------------------------------------------- construcción

  #build(): void {
    this.#built = true;
    // Enfocable con el mouse (no con Tab): un clic en un hueco deja listo Ctrl+V.
    if (!this.hasAttribute("tabindex")) this.tabIndex = -1;
    this.#title = h("h3", { class: "nx-imp__title", tabindex: "-1" });
    this.#body = h("fieldset", { class: "nx-imp__body" });
    this.#back = h("button", { type: "button", class: "nx-imp__btn nx-imp__btn--soft", "data-act": "back" });
    this.#next = h("button", { type: "button", class: "nx-imp__btn", "data-act": "next" });
    this.#statusEl = h("p", { class: "nx-imp__status", role: "status" });
    this.#bar = h("progress", { class: "nx-imp__bar", max: "1", hidden: true });
    this.#input = h("input", { type: "file", hidden: true, tabindex: "-1" });
    this.append(this.#title, this.#body, h("div", { class: "nx-imp__foot" }, this.#back, h("div", { class: "nx-imp__progress" }, this.#bar, this.#statusEl), this.#next), this.#input);

    this.#input.addEventListener("change", () => {
      const f = this.#input!.files?.[0];
      if (f) void this.load(f);
      this.#input!.value = "";
    });
    this.addEventListener("click", (e) => this.#onClick(e));
    this.addEventListener("change", (e) => this.#onChange(e));
    this.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.fixed) this.#fixed[t.dataset.fixed] = t.value;
    });
    this.addEventListener("paste", (e) => {
      if (this.#step !== "file" || this.disabled) return;
      const cd = e.clipboardData;
      const file = cd?.files?.[0];
      const text = cd?.getData("text/plain") ?? "";
      if (!file && !text.trim()) return;
      e.preventDefault();
      void this.load(file ?? text);
    });
    const files = (e: DragEvent) => this.#step === "file" && !this.disabled && [...(e.dataTransfer?.types ?? [])].includes("Files");
    this.addEventListener("dragover", (e) => {
      if (!files(e)) return;
      e.preventDefault();
      this.toggleAttribute("data-drag", true);
    });
    this.addEventListener("dragleave", (e) => {
      if (!this.contains(e.relatedTarget as Node | null)) this.removeAttribute("data-drag");
    });
    this.addEventListener("drop", (e) => {
      this.removeAttribute("data-drag");
      if (!files(e)) return;
      e.preventDefault();
      const f = e.dataTransfer!.files[0];
      if (f) void this.load(f);
    });
  }

  #onClick(e: Event): void {
    const b = (e.target as Element).closest<HTMLElement>("[data-act]");
    if (!b || this.disabled || (b as HTMLButtonElement).disabled) return;
    switch (b.dataset.act) {
      case "pick":
        this.#input!.accept = this.accept;
        return this.#input!.click();
      case "back":
        return this.#go(this.#step === "review" ? "columns" : "file");
      case "next":
        return this.#onNext();
      case "cancel":
        return this.#abort?.abort();
      case "download":
        return this.#download();
    }
  }

  #onChange(e: Event): void {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const act = t.dataset.act;
    if (act === "header") {
      this.#read(Number(t.value), true);
      return this.#body!.querySelector<HTMLElement>("[data-act=header]")?.focus();
    }
    if (act === "sheet") return void this.#sheet(Number(t.value));
    if (act === "skip") {
      this.#skip = (t as HTMLInputElement).checked;
      return this.#paintFoot();
    }
    if (t.dataset.map) return this.#remap(t.dataset.map, t.value);
    if (t.dataset.i) {
      // Se revisa en el siguiente turno: el foco ya llegó a donde iba (Tab, clic).
      const i = Number(t.dataset.i);
      const key = t.dataset.key!;
      const at = [...this.#body!.querySelectorAll("input[data-i]")].indexOf(t);
      setTimeout(() => this.#edit(i, key, t.value, at));
    }
  }

  async #sheet(i: number): Promise<void> {
    const f = this.#file;
    if (!f?.book) return;
    const run = ++this.#run;
    let rows: ImportCell[][];
    try {
      rows = await f.book.sheet(i);
    } catch {
      return this.#fail("read", this.#labels.unreadable, run);
    }
    if (run !== this.#run) return;
    f.rows = rows;
    f.sheet = i;
    this.#read(detectHeaderRow(rows));
    this.#body!.querySelector<HTMLElement>("[data-act=sheet]")?.focus();
  }

  #onNext(): void {
    const L = this.#labels;
    switch (this.#step) {
      case "file":
        if (this.#table) this.#go("columns");
        else this.#body!.querySelector<HTMLElement>("[data-act=pick]")?.focus();
        return;
      case "columns": {
        this.#missing.clear();
        const locale = resolveLocale(this);
        for (const c of this.#columns) {
          const fx = this.#fixed[c.key];
          if (this.#matches[c.key]?.index != null) continue;
          // Un valor para todas las filas tiene que ser válido (una ciudad de la lista, una fecha).
          const err = fx === undefined ? (c.required ? L.missing : "") : fx.trim() ? normalizeValue(fx, c, columnContext([fx], locale), { messages: L, locale })[1] : L.missing;
          if (err) this.#missing.set(c.key, err);
        }
        if (!this.#columns.length) return;
        if (this.#missing.size) {
          this.#paint();
          return this.#body!.querySelector<HTMLElement>(`[aria-invalid="true"]`)?.focus();
        }
        const t = this.#table!;
        const mapping = this.mapping;
        const fixed = Object.fromEntries(Object.entries(this.#fixed).filter(([k]) => mapping[k] === null));
        this.#fixed = fixed;
        rememberMapping(store(), this.memory || this.id, t.headers, mapping, fixed);
        this.#emit("nx-import-mapped", { mapping, fixed, remembered: this.#remembered });
        this.#go("review");
        void this.#checkAll();
        return;
      }
      case "review": {
        const { invalid } = this.#counts();
        if (invalid && !this.#skip) {
          this.#setStatus(L.fixFirst);
          return this.#body!.querySelector<HTMLElement>("input[data-i]")?.focus();
        }
        return void this.#send();
      }
      case "sending":
        return this.#abort?.abort();
      case "done":
        this.reset();
        this.#title?.focus();
    }
  }

  /** La persona cambió la columna de un campo. Uno a uno: si otro campo la tenía, queda sin columna. */
  #remap(key: string, value: string): void {
    this.#missing.delete(key);
    if (value === "fixed") {
      this.#matches[key] = { index: null, score: 0, by: "hand" };
      this.#fixed[key] ??= "";
    } else {
      const idx = value === "" ? null : Number(value);
      delete this.#fixed[key];
      for (const c of this.#columns) if (c.key !== key && idx !== null && this.#matches[c.key]?.index === idx) (this.#matches[c.key] = { index: null, score: 0, by: "none" }), this.#paintMap(c.key);
      this.#matches[key] = { index: idx, score: idx === null ? 0 : 1, by: idx === null ? "none" : "hand" };
    }
    this.#paintMap(key);
    this.#paintUnused();
  }

  /** Normaliza y valida todo el archivo, por tramos (50.000 filas no congelan la página). */
  async #checkAll(): Promise<void> {
    const run = ++this.#run;
    const t = this.#table!;
    const L = this.#labels;
    const check = importValidator(t, this.#columns, this.mapping, { messages: L, locale: resolveLocale(this), fixed: this.#fixed });
    const out: ImportRowCheck[] = new Array(t.rows.length);
    // Lo que ya entró al servidor (un envío cancelado o fallido, y luego Anterior → Siguiente) sigue
    // enviado: se queda con lo que se mandó y no se reenvía. Solo un archivo nuevo o `reset()` lo olvidan.
    const prev = this.#checks;
    this.#check = check;
    this.#checks = [];
    this.#edits.clear();
    this.#checking = true;
    this.#skip = false;
    for (let i = 0; i < t.rows.length; i++) {
      out[i] = this.#accepted.has(i) && prev[i] ? prev[i] : check(i);
      if (i % SLICE === SLICE - 1) {
        this.#setStatus(fmtLabel(L.checking, { pct: `${Math.round((i / t.rows.length) * 100)} %` }), [i, t.rows.length]);
        await pause();
        if (run !== this.#run) return;
        // La persona volvió a las columnas: esta revisión ya no sirve (al seguir se hace otra) y no
        // puede repintar el paso de columnas encima (se llevaba el select con el foco).
        if (this.#step !== "review") {
          this.#checking = false;
          return;
        }
      }
    }
    markDuplicates(out, this.#columns, L);
    this.#checks = out;
    this.#checking = false;
    this.#status = "";
    this.#progress = null;
    this.#paint();
  }

  #counts(): { ready: number; invalid: number; empty: number } {
    return countChecks(this.#checks.filter((c) => !this.#accepted.has(c.index)));
  }

  /** Una celda corregida: se revisa de nuevo esa fila (y los repetidos del archivo). */
  #edit(i: number, key: string, value: string, at: number): void {
    const check = this.#check;
    if (!check || this.#step !== "review" || !this.#checks[i]) return;
    const edits = { ...this.#edits.get(i), [key]: value };
    this.#edits.set(i, edits);
    this.#checks[i] = check(i, edits);
    markDuplicates(this.#checks, this.#columns, this.#labels);
    // El foco: si pasó a otra celda de la tabla (Tab, clic), ahí sigue; si se quedó en la corregida,
    // va a la que ocupa su lugar (la siguiente con error). Fuera de la tabla no se toca.
    const a = document.activeElement as HTMLElement | null;
    const inBody = !!a && this.#body!.contains(a);
    const same = inBody && a!.dataset.i ? `input[data-i="${a!.dataset.i}"][data-key="${CSS.escape(a!.dataset.key ?? "")}"]` : "";
    this.#status = "";
    this.#paint();
    if (!inBody) return;
    const inputs = this.#body!.querySelectorAll<HTMLElement>("input[data-i]");
    ((same && this.#body!.querySelector<HTMLElement>(same)) || inputs[Math.min(at, inputs.length - 1)] || this.#next)?.focus();
  }

  // ---------------------------------------------------------------- envío

  async #send(): Promise<void> {
    const L = this.#labels;
    const url = safeEndpoint(this.endpoint);
    const todo = this.#checks.filter((c) => !c.empty && !this.#accepted.has(c.index) && !hasIssues(c));
    if (!url || !todo.length) {
      for (const c of todo) this.#accepted.add(c.index);
      return this.#finish();
    }
    const ctrl = (this.#abort = new AbortController());
    const run = this.#run;
    const size = this.batch;
    const fmt = this.#fmt();
    let rejected = 0;
    this.#step = "sending";
    this.#paint();
    const progress = (done: number) => this.#setStatus(fmtLabel(L.sending, { done: fmt.number(done), total: fmt.number(todo.length) }), [done, todo.length]);
    progress(0);
    try {
      for (let k = 0; k < todo.length; k += size) {
        const part = todo.slice(k, k + size);
        const res = await fetch(url, {
          method: "POST",
          signal: ctrl.signal,
          credentials: "same-origin",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ rows: part.map((c) => c.values), offset: k }),
        });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* sin cuerpo JSON: vale si fue 2xx */
        }
        if (run !== this.#run) return;
        const errs = parseServerErrors(body, k, part.length);
        if (!res.ok && !errs.length) throw new Error(`HTTP ${res.status}`);
        const bad = new Set<number>();
        for (const e of errs) {
          const c = part[e.index];
          const field = e.field && this.mapping[e.field] != null ? e.field : "*";
          (c.server ??= {})[field] = e.message || L.rejectedRow;
          bad.add(e.index);
        }
        part.forEach((c, j) => bad.has(j) || this.#accepted.add(c.index));
        rejected += bad.size;
        progress(Math.min(k + size, todo.length));
      }
    } catch (err) {
      if (run !== this.#run) return;
      this.#step = "review";
      const n = fmt.number(this.#accepted.size);
      if (ctrl.signal.aborted) this.#setStatus(this.#count(L.cancelled, this.#accepted.size));
      else {
        const message = fmtLabel(L.failed, { error: err instanceof Error ? err.message : String(err), n });
        this.#setStatus(message);
        this.#emit("nx-import-error", { code: "network", message });
      }
      return this.#paint();
    }
    if (!rejected) return this.#finish();
    this.#step = "review";
    this.#paint();
    this.#setStatus(this.#count(L.rejected, rejected));
    this.#body!.querySelector<HTMLElement>("input[data-i]")?.focus();
  }

  #finish(): void {
    const rows: Record<string, unknown>[] = [];
    const skipped: { line: number; reason: string }[] = [];
    for (const c of this.#checks) {
      if (c.empty) continue;
      if (this.#accepted.has(c.index)) rows.push(c.values);
      else skipped.push({ line: c.line, reason: Object.values(rowIssues(c)).join("; ") });
    }
    const mapping = this.mapping;
    this.#done = { rows, skipped, mapping, fixed: { ...this.#fixed }, headers: this.#headers() };
    this.#go("done");
    this.#emit("nx-import-done", this.#done);
  }

  /** Un CSV (con BOM, para Excel) con las filas que no entraron, tal como venían (con lo corregido), y el motivo. */
  #download(): void {
    const t = this.#table;
    const done = this.#done;
    if (!t || !done) return;
    const L = this.#labels;
    const mapping = done.mapping;
    const lines = new Set(done.skipped.map((s) => s.line));
    const out: ImportCell[][] = [[L.line, ...this.#headers(), L.reason]];
    for (const c of this.#checks) {
      if (!lines.has(c.line)) continue;
      const row = t.headers.map((_, k) => t.rows[c.index][k] ?? "");
      for (const [key, v] of Object.entries(this.#edits.get(c.index) ?? {})) if (mapping[key] != null) row[mapping[key]!] = v;
      out.push([c.line, ...row, Object.values(rowIssues(c)).join("; ")]);
    }
    const csv = toCsv(out, this.#fmt().number(1.5).includes(",") ? ";" : ",");
    const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: `${L.failedFile}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------------------------------------------------------- pintado

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const step = this.#step;
    const n = STEPS.indexOf(step === "sending" ? "review" : (step as (typeof STEPS)[number]));
    this.dataset.state = step;
    this.setAttribute("data-drop", L.dragging);
    this.#title!.replaceChildren(
      ...(step === "done"
        ? [glyph(CHECK, "nx-imp__ok"), this.#count(L.done, this.#done!.rows.length)]
        : [h("span", { class: "nx-imp__count" }, fmtLabel(L.step, { n: n + 1, total: 3 })), [L.stepFile, L.stepColumns, L.stepReview][n]]),
    );
    this.#body!.disabled = this.disabled || step === "sending";
    this.#body!.replaceChildren(...(step === "file" ? this.#fileStep() : step === "columns" ? this.#columnsStep() : step === "done" ? this.#doneStep() : this.#reviewStep()));
    if (step === "columns") {
      for (const c of this.#columns) this.#paintMap(c.key);
      this.#paintUnused();
    }
    this.#paintFoot();
  }

  #paintFoot(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const step = this.#step;
    const back = this.#back!;
    const next = this.#next!;
    back.textContent = L.back;
    back.hidden = step === "file" || step === "done";
    back.disabled = this.disabled || step === "sending";
    next.disabled = this.disabled || (step === "file" && (!this.#table || !!this.#error)) || (step === "columns" && !this.#columns.length) || (step === "review" && this.#checking);
    next.className = step === "sending" ? "nx-imp__btn nx-imp__btn--soft" : "nx-imp__btn";
    next.dataset.act = step === "sending" ? "cancel" : "next";
    if (step === "sending") next.disabled = false;
    if (step === "review") {
      const { ready } = this.#counts();
      next.textContent = ready ? this.#count(L.import, ready) : L.finish;
    } else next.textContent = step === "sending" ? L.cancel : step === "done" ? L.again : L.next;
    this.#statusEl!.textContent = this.#status;
    const bar = this.#bar!;
    bar.hidden = !this.#progress;
    if (this.#progress) bar.value = this.#progress[1] ? this.#progress[0] / this.#progress[1] : 0;
  }

  #fileStep(): Node[] {
    const L = this.#labels;
    const t = this.#table;
    const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    const out: Node[] = [
      h(
        "button",
        { type: "button", class: "nx-imp__drop", "data-act": "pick" },
        glyph(UPLOAD, "nx-imp__drop-icon"),
        h("span", { class: "nx-imp__drop-text" }, h("strong", null, t ? L.change : L.drop), h("small", null, fmtLabel(L.dropHint, { max: this.#size(this.maxSize), mod: mac ? "⌘" : "Ctrl" }))),
      ),
    ];
    if (this.#error) out.push(h("p", { class: "nx-imp__error", role: "alert" }, this.#error));
    if (!t) return out;
    const f = this.#file!;
    const opts = h("div", { class: "nx-imp__opts" });
    const select = (act: string, label: string, options: [string, string][], value: string) => {
      const s = h("select", { class: "nx-imp__select", "data-act": act }, ...options.map(([v, text]) => h("option", { value: v }, text)));
      s.value = value;
      return h("label", { class: "nx-imp__field" }, h("span", null, label), s);
    };
    if (f.book && f.book.names.length > 1) opts.append(select("sheet", L.sheet, f.book.names.map((n, i) => [String(i), n]), String(f.sheet)));
    const rowsOpts: [string, string][] = [["-1", L.noHeader]];
    for (let r = 0; r < Math.min(f.rows.length, Math.max(20, t.headerRow + 5)); r++) rowsOpts.push([String(r), String(r + 1)]);
    opts.append(select("header", L.headerRow, rowsOpts, String(t.headerRow)));
    // Vista previa: unas filas alrededor de los encabezados, para ver si quedaron bien.
    const from = Math.max(0, t.headerRow - 3);
    const to = Math.min(f.rows.length, Math.max(t.headerRow, 0) + 6);
    const cols = Math.min(t.headers.length, 12);
    const preview = h("table", { class: "nx-imp__table nx-imp__table--preview" });
    for (let r = from; r < to; r++) {
      const head = r === t.headerRow;
      preview.append(
        h(
          "tr",
          head ? { class: "is-head" } : null,
          h("th", { scope: "row" }, String(r + 1)),
          ...Array.from({ length: cols }, (_, c) => h(head ? "th" : "td", head ? { scope: "col" } : null, cellText(f.rows[r]?.[c]).slice(0, 60))),
        ),
      );
    }
    out.push(h("p", { class: "nx-imp__meta" }, this.#fileInfo()), opts, h("div", { class: "nx-imp__scroll", tabindex: "0", role: "region", "aria-label": f.name }, preview));
    return out;
  }

  #columnsStep(): Node[] {
    const L = this.#labels;
    if (!this.#columns.length) return [h("p", { class: "nx-imp__error", role: "alert" }, L.noColumns)];
    const map = h("div", { class: "nx-imp__map" }, ...this.#columns.map((c) => this.#mapRow(c)));
    const unused = h("p", { class: "nx-imp__note", "data-unused": "" });
    return this.#remembered ? [h("p", { class: "nx-imp__note" }, L.remembered), map, unused] : [map, unused];
  }

  #mapRow(c: ImportColumn): HTMLElement {
    const L = this.#labels;
    const id = `${this.#uid}-${this.#columns.indexOf(c)}`;
    const headers = this.#headers();
    const sel = h(
      "select",
      { class: "nx-imp__select", id, "data-map": c.key, "aria-describedby": `${id}-info ${id}-err`, "aria-required": c.required ? "true" : null },
      h("option", { value: "" }, L.skip),
      ...headers.map((x, i) => h("option", { value: String(i) }, `${columnLetter(i)} · ${x}`)),
      h("option", { value: "fixed" }, L.fixed),
    );
    const fixed = c.options?.length
      ? h("select", { class: "nx-imp__select", "data-fixed": c.key, "aria-label": `${c.label}: ${L.fixedLabel}` }, h("option", { value: "" }, "—"), ...c.options.map((o) => h("option", { value: o.value }, o.label)))
      : h("input", { class: "nx-imp__input", "data-fixed": c.key, "aria-label": `${c.label}: ${L.fixedLabel}`, autocomplete: "off" });
    const row = h(
      "div",
      { class: "nx-imp__row", "data-key": c.key },
      h("label", { class: "nx-imp__label", for: id }, c.label, c.required ? h("span", { class: "nx-imp__req", "aria-hidden": "true" }, " *") : null, c.hint ? h("small", null, c.hint) : null),
      h("div", { class: "nx-imp__ctl" }, sel, fixed),
      h("p", { class: "nx-imp__info", id: `${id}-info` }),
      h("p", { class: "nx-imp__msg", id: `${id}-err` }),
    );
    return row;
  }

  /** Pinta en su lugar la fila de un campo (sin recrear el select que tiene el foco). */
  #paintMap(key: string): void {
    const row = this.#body!.querySelector<HTMLElement>(`.nx-imp__row[data-key="${CSS.escape(key)}"]`);
    const c = this.#columns.find((x) => x.key === key);
    if (!row || !c) return;
    const L = this.#labels;
    const m = this.#matches[key] ?? { index: null, score: 0, by: "none" };
    const isFixed = m.index === null && key in this.#fixed;
    const sel = row.querySelector<HTMLSelectElement>("[data-map]")!;
    const fixed = row.querySelector<HTMLInputElement>("[data-fixed]")!;
    sel.value = isFixed ? "fixed" : m.index === null ? "" : String(m.index);
    fixed.hidden = !isFixed;
    if (isFixed && fixed.value !== this.#fixed[key]) fixed.value = this.#fixed[key];
    const info = row.querySelector<HTMLElement>(".nx-imp__info")!;
    const samples = m.index === null ? [] : this.#samples[m.index];
    // La confianza solo cuando la decidimos nosotros (no si la eligió la persona o salió de la memoria).
    const by = m.by === "name" ? L.byName : m.by === "content" ? L.byContent : "";
    info.textContent = m.index === null ? "" : [samples.length ? fmtLabel(L.sample, { values: samples.join(", ") }) : L.emptyColumn, by && `${by} · ${Math.round(m.score * 100)} %`].filter(Boolean).join(" · ");
    const bad = this.#missing.has(key);
    const msg = row.querySelector<HTMLElement>(".nx-imp__msg")!;
    msg.textContent = this.#missing.get(key) ?? "";
    msg.hidden = !bad;
    (isFixed ? fixed : sel).setAttribute("aria-invalid", String(bad));
    (isFixed ? sel : fixed).removeAttribute("aria-invalid");
    if (isFixed) fixed.setAttribute("aria-describedby", `${sel.id}-err`);
    row.toggleAttribute("data-invalid", bad);
  }

  #paintUnused(): void {
    const el = this.#body!.querySelector<HTMLElement>("[data-unused]");
    if (!el) return;
    const used = new Set(Object.values(this.#matches).map((m) => m.index));
    const names = this.#headers().filter((x, i) => !used.has(i) && this.#samples[i]?.length);
    el.textContent = names.length ? fmtLabel(this.#labels.unused, { names: names.join(", ") }) : "";
    el.hidden = !names.length;
  }

  #reviewStep(): Node[] {
    const L = this.#labels;
    if (this.#checking) return [];
    const { ready, invalid, empty } = this.#counts();
    const out: Node[] = [
      h(
        "p",
        { class: "nx-imp__summary" },
        h("strong", null, this.#count(L.ready, ready)),
        ...(invalid ? [" · ", h("span", { class: "nx-imp__bad" }, this.#count(L.invalid, invalid))] : []),
        ...(empty ? [` · ${this.#count(L.emptyRows, empty)}`] : []),
      ),
    ];
    if (invalid) out.push(h("label", { class: "nx-imp__check" }, h("input", { type: "checkbox", "data-act": "skip", checked: this.#skip }), L.skipErrors));
    // Primero las filas con errores, luego las listas; nunca más de LIMIT nodos de fila.
    const bad: ImportRowCheck[] = [];
    const ok: ImportRowCheck[] = [];
    for (const c of this.#checks) {
      if (c.empty || this.#accepted.has(c.index)) continue;
      if (hasIssues(c)) bad.push(c);
      else if (bad.length + ok.length < LIMIT) ok.push(c);
    }
    const shown = bad.concat(ok).slice(0, LIMIT);
    const cols = this.#columns.filter((c) => this.#matches[c.key]?.index != null);
    const table = h(
      "table",
      { class: "nx-imp__table" },
      h("thead", null, h("tr", null, h("th", { scope: "col" }, L.line), ...cols.map((c) => h("th", { scope: "col" }, c.label)))),
      h("tbody", null, ...shown.map((r) => this.#reviewRow(r, cols))),
    );
    out.push(h("div", { class: "nx-imp__scroll", tabindex: "0", role: "region", "aria-label": L.stepReview }, table));
    const more = ready + invalid - shown.length;
    if (more > 0) out.push(h("p", { class: "nx-imp__note" }, this.#count(L.more, more)));
    return out;
  }

  #reviewRow(r: ImportRowCheck, cols: ImportColumn[]): HTMLElement {
    const issues = rowIssues(r);
    const whole = issues["*"];
    const base = `${this.#uid}-r${r.index}`;
    const edits = this.#edits.get(r.index);
    const tr = h("tr", Object.keys(issues).length ? { "data-bad": "" } : null, h("th", { scope: "row" }, String(r.line), whole ? h("span", { class: "nx-imp__msg", id: `${base}-all` }, whole) : null));
    cols.forEach((c, k) => {
      const msg = issues[c.key];
      if (!msg && !whole) return void tr.append(h("td", null, this.#show(r.values[c.key], c)));
      const raw = edits?.[c.key] ?? cellText(this.#table!.rows[r.index][this.#matches[c.key].index!]);
      const id = `${base}-${k}`;
      tr.append(
        h(
          "td",
          { class: msg ? "is-bad" : null },
          h("input", { class: "nx-imp__input", value: raw, "data-i": String(r.index), "data-key": c.key, "aria-label": `${c.label}, ${this.#labels.line.toLowerCase()} ${r.line}`, "aria-invalid": msg ? "true" : null, "aria-describedby": msg ? id : `${base}-all`, autocomplete: "off" }),
          msg ? h("span", { class: "nx-imp__msg", id }, msg) : null,
        ),
      );
    });
    return tr;
  }

  /** Un valor normalizado como se lee («$ 1.500.000», «12 sep 2026», «Sí», la etiqueta de la opción). */
  #show(v: unknown, c: ImportColumn): string {
    if (v === null || v === undefined) return "";
    const f = this.#fmt();
    const L = this.#labels;
    if (typeof v === "number") return c.type === "money" ? f.money(v, {}) : c.type === "percent" ? `${f.number(v * 100)} %` : f.number(v);
    if (typeof v === "boolean") return v ? L.yes : L.no;
    if (c.type === "date") return f.date(String(v));
    if (c.type === "option") return c.options?.find((o) => o.value === v)?.label ?? String(v);
    return String(v);
  }

  #doneStep(): Node[] {
    const L = this.#labels;
    const n = this.#done!.skipped.length;
    if (!n) return [];
    return [h("p", { class: "nx-imp__note" }, this.#count(L.notImported, n)), h("button", { type: "button", class: "nx-imp__btn nx-imp__btn--soft", "data-act": "download" }, L.download)];
  }
}
