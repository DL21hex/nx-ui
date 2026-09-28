/**
 * `<nx-print>`: imprimir bien a la primera. El documento del autor (párrafos, tablas, bloques) se
 * mide y se reparte en hojas del tamaño real, con encabezado y pie en cada una, `<thead>` repetido,
 * «Van / Vienen» en las tablas que suman y «Página 2 de 3». Al imprimir sale exactamente la vista
 * previa, no el resto de la app.
 *
 * Reglas de diseño:
 * - **Los nodos del autor no se mueven.** Quedan en su sitio, ocultos a la vista pero no al lector
 *   de pantalla (es el documento de verdad, sin repeticiones). Las hojas se arman con copias, con
 *   `aria-hidden` e `inert`, sin `id` (no duplican los del original).
 * - **Una lectura de layout por paginación.** Las copias se ponen en una hoja de medir (del mismo
 *   ancho y con los mismos estilos que las hojas), se leen todas las alturas de una vez, el reparto
 *   es puro (`paginatePrint`) y luego las mismas copias pasan a sus hojas.
 * - **Nada en bucle.** Se vuelve a paginar solo si cambia el contenido (MutationObserver), el tamaño,
 *   los márgenes, las fuentes o una imagen del autor termina de cargar; con espera y en un frame.
 * - **Light DOM.** Estilos en `print.css`; la hoja de impresión (`@page`, ocultar lo demás) se pone
 *   al imprimir y se quita después.
 */
import { Base, boolAttr } from "../../core/define";
import { h } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale, type NxFormat } from "../../core/locale";
import { fillPageText, paginatePrint, parsePrintMargin, parsePrintSize, parseZoom, PX_PER_MM, stepZoom } from "./logic";
import type { PrintBlock, PrintLabels, PrintOrientation, PrintPiece, PrintZoom } from "./types";

export const PRINT_LABELS: PrintLabels = {
  toolbar: "Vista previa de impresión",
  print: "Imprimir",
  pdf: "Guardar como PDF",
  pdfHint: "En el diálogo, elige «Guardar como PDF» como destino.",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  fit: "Ajustar al ancho",
  actual: "Tamaño real",
  pages: "{n} páginas",
  pagesOne: "1 página",
  page: "Página {page} de {pages}",
  carriedOut: "Van",
  carriedIn: "Vienen",
};

const PROPS = ["size", "orientation", "margin", "heading", "currency", "zoom", "locale", "labels", "toolbar"] as const;
const SKIP = /^(SCRIPT|STYLE|TEMPLATE|LINK|META|NOSCRIPT)$/;
const PAD = 24;

/** El `<nx-print>` que está imprimiendo ahora (uno a la vez). */
let active: NxPrint | null = null;

interface SumCol {
  col: number;
  money: boolean;
  currency?: string;
}
interface TableInfo {
  el: HTMLTableElement;
  rows: HTMLTableRowElement[];
  parents: (Element | null)[];
  sums: SumCol[];
  values: number[][];
  ncols: number;
  sample?: HTMLTableRowElement;
  widthRow?: HTMLTableRowElement;
  widths?: number[];
  width?: number;
}

const kids = (el: Element) => Array.from(el.children);
const cellsOf = (tr: HTMLTableRowElement) => kids(tr).filter((c): c is HTMLTableCellElement => c.tagName === "TD" || c.tagName === "TH");
const span = (c: HTMLTableCellElement) => Math.max(1, Number(c.getAttribute("colspan")) || 1);
const spanOf = (tr: HTMLTableRowElement) => cellsOf(tr).reduce((s, c) => s + span(c), 0);
const cellAt = (tr: HTMLTableRowElement, col: number) => {
  let c = 0;
  for (const cell of cellsOf(tr)) if ((c += span(cell)) > col) return cell;
  return null;
};
const bodyRows = (t: HTMLTableElement) => kids(t).flatMap((s) => (s.tagName === "TBODY" ? kids(s) : s.tagName === "TR" ? [s] : [])).filter((r): r is HTMLTableRowElement => r.tagName === "TR");
const part = (t: Element, tag: string) => kids(t).find((c) => c.tagName === tag);

/** Una copia sin `id`: los del original no se duplican (ni `getElementById` encuentra la copia). */
function copy<T extends Element>(el: T): T {
  const c = el.cloneNode(true) as T;
  c.removeAttribute("id");
  c.removeAttribute("slot");
  for (const x of c.querySelectorAll("[id]")) x.removeAttribute("id");
  return c;
}

/** Cambia `{page}` y `{pages}` en los textos de `root`. */
function fill(root: Node, page: number, pages: number): void {
  const walk = document.createTreeWalker(root, 4 /* SHOW_TEXT */);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) if (n.nodeValue?.includes("{page")) n.nodeValue = fillPageText(n.nodeValue, page, pages);
}

/** La hoja que se pone al imprimir: tamaño de página y nada más que las hojas de este elemento. */
const printCss = (w: number, hh: number) =>
  `@page{size:${w}mm ${hh}mm;margin:0!important}@media print{:has(nx-print[data-nx-printing]){display:block!important;position:static!important;margin:0!important;padding:0!important;border:0!important;block-size:auto!important;min-block-size:0!important;max-block-size:none!important;overflow:visible!important;transform:none!important;contain:none!important;zoom:1!important}body :not(:has(nx-print[data-nx-printing]),nx-print[data-nx-printing],nx-print[data-nx-printing] *){display:none!important}}`;

export class NxPrint extends Base {
  static observedAttributes = ["size", "orientation", "margin", "zoom", "locale", "labels", "toolbar", "currency"];

  #labels: PrintLabels = PRINT_LABELS;
  #pages = 0;
  #dirty = true;
  #timer = 0;
  #raf = 0;
  #abort?: AbortController;
  #mo?: MutationObserver;
  #ro?: ResizeObserver;
  #style?: HTMLStyleElement;
  #title: string | null = null;
  #width = 0;
  #eff = 1;

  #ui?: HTMLDivElement;
  #bar?: HTMLDivElement;
  #count?: HTMLElement;
  #zoomText?: HTMLElement;
  #hint?: HTMLElement;
  #desk?: HTMLDivElement;
  #stack?: HTMLDivElement;
  #measure?: HTMLDivElement;

  // ---------------------------------------------------------------- propiedades

  /** `letter` (por defecto), `a4`, `a5`, `legal`, `oficio`, `half-letter` o dos medidas («216mm 140mm»). */
  get size(): string {
    return this.getAttribute("size") || "letter";
  }
  set size(v: string | null | undefined) {
    this.#attr("size", v);
  }

  get orientation(): PrintOrientation | null {
    const o = this.getAttribute("orientation");
    return o === "portrait" || o === "landscape" ? o : null;
  }
  set orientation(v: PrintOrientation | null | undefined) {
    this.#attr("orientation", v);
  }

  /** Uno a cuatro valores, como en CSS («12mm», «10mm 15mm»). 12 mm por defecto. */
  get margin(): string {
    return this.getAttribute("margin") || "12mm";
  }
  set margin(v: string | number | null | undefined) {
    this.#attr("margin", v === null || v === undefined ? null : String(v));
  }

  /** El título del documento: el nombre sugerido del PDF (`document.title` mientras se imprime). */
  get heading(): string | null {
    return this.getAttribute("heading");
  }
  set heading(v: string | null | undefined) {
    this.#attr("heading", v);
  }

  /** La moneda de las columnas que suman (si su `<th>` no trae `data-currency`). */
  get currency(): string | null {
    return this.getAttribute("currency");
  }
  set currency(v: string | null | undefined) {
    this.#attr("currency", v);
  }

  /** `"fit"` (por defecto: ajustar al ancho, sin pasar de 100 %) o un factor (1 = tamaño real). */
  get zoom(): PrintZoom {
    return parseZoom(this.getAttribute("zoom"));
  }
  set zoom(v: PrintZoom | string | null | undefined) {
    this.#attr("zoom", v === null || v === undefined ? null : String(v));
  }

  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(v: string | null | undefined) {
    this.#attr("locale", v);
  }

  get labels(): PrintLabels {
    return this.#labels;
  }
  set labels(v: Partial<PrintLabels> | string | null | undefined) {
    this.#labels = mergeLabels(PRINT_LABELS, v);
    if (this.#bar) this.#buildBar();
    this.#schedule(0);
  }

  /** La barra (Imprimir, PDF, zoom). `toolbar="false"` la quita. */
  get toolbar(): boolean {
    return this.getAttribute("toolbar") !== "false";
  }
  set toolbar(v: boolean | null | undefined) {
    this.#attr("toolbar", v === false ? "false" : null);
  }

  /** Cuántas páginas salieron en la última paginación (0 antes de la primera). */
  get pages(): number {
    return this.#pages;
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    for (const p of PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const self = this as unknown as Record<string, unknown>;
        const value = self[p];
        delete self[p];
        self[p] = value;
      }
    }
    if (!this.#ui) {
      this.#desk = h("div", { class: "nx-print__desk" });
      this.#stack = h("div", { class: "nx-print__stack", "aria-hidden": "true", inert: true });
      this.#measure = h("div", { class: "nx-print__measure", "aria-hidden": "true", inert: true });
      this.#desk.append(this.#stack);
      this.#ui = h("div", { class: "nx-print__ui" }, this.#desk, this.#measure);
      this.#buildBar();
    }
    if (this.#ui.parentNode !== this) this.append(this.#ui);

    this.#abort?.abort();
    const signal = (this.#abort = new AbortController()).signal;
    this.addEventListener("click", this.#onClick, { signal });
    this.addEventListener("keydown", this.#onKey, { signal });
    // Una imagen del autor que termina de cargar cambia las alturas (`load` no burbujea: captura).
    this.addEventListener("load", (e) => !this.#ui!.contains(e.target as Node) && this.#schedule(), { signal, capture: true });
    // Ctrl+P sin pasar por `print()`: el primer `<nx-print>` de la página se imprime como su vista previa.
    addEventListener(
      "beforeprint",
      () => {
        if (active || document.querySelector("nx-print:not([hidden])") !== this) return;
        if (this.#dirty) this.paginate();
        this.#begin();
      },
      { signal },
    );
    addEventListener("afterprint", () => active === this && this.#end(), { signal });
    const fonts = document.fonts;
    if (fonts?.addEventListener) {
      fonts.addEventListener("loadingdone", () => this.#schedule(), { signal });
      if (fonts.status === "loading") fonts.ready.then(() => this.isConnected && this.#schedule());
    }
    if (typeof MutationObserver === "function") {
      this.#mo ??= new MutationObserver((records) => {
        if (records.some((r) => this.#matters(r))) this.#schedule();
      });
      this.#mo.observe(this, { childList: true, subtree: true, characterData: true, attributes: true });
    }
    if (typeof ResizeObserver === "function") {
      this.#ro ??= new ResizeObserver(() => this.#applyZoom());
      this.#ro.observe(this.#desk!);
    }
    this.#schedule(0);
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#mo?.disconnect();
    this.#ro?.disconnect();
    clearTimeout(this.#timer);
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.#raf);
    if (active === this) this.#end();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "labels") {
      if (value === null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        console.warn('[nx-print] el atributo "labels" no es JSON válido');
        return;
      }
      this.labels = parsed as Partial<PrintLabels>;
      return;
    }
    if (name === "zoom") return this.#applyZoom();
    if (name === "toolbar") {
      if (this.#bar) this.#bar.hidden = !this.toolbar;
      return;
    }
    this.#schedule(0);
  }

  // ---------------------------------------------------------------- API

  /** Abre el diálogo de impresión con la vista previa (paginada ya, si había algo pendiente). */
  print(): void {
    if (!this.isConnected || active === this) return;
    if (this.#dirty) this.paginate();
    if (!this.#begin()) return;
    try {
      window.print();
    } catch {
      this.#end();
    }
  }

  /** Mide y reparte ya (sin esperar). Devuelve el número de páginas. */
  paginate(): number {
    clearTimeout(this.#timer);
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.#raf);
    if (!this.#ui || !this.isConnected) return this.#pages;
    // Un `innerHTML` (o un framework) pudo llevarse la vista previa con el contenido viejo.
    if (this.#ui.parentNode !== this) this.append(this.#ui);
    this.#dirty = false;
    const L = this.#labels;
    const fmt = nxFormat(resolveLocale(this));
    const [w, hh] = parsePrintSize(this.getAttribute("size"), this.getAttribute("orientation"));
    const m = parsePrintMargin(this.getAttribute("margin") ?? "12mm");
    this.#width = w * PX_PER_MM;
    const ui = this.#ui.style;
    ui.setProperty("--nx-print-w", `${w}mm`);
    ui.setProperty("--nx-print-h", `${hh}mm`);
    ui.setProperty("--nx-print-m", m.map((x) => `${x}mm`).join(" "));

    // 1) Lo que hay: encabezado, pie y los bloques del documento (los hijos del autor).
    const heads: Element[] = [];
    const feet: Element[] = [];
    const src: Element[] = [];
    for (const el of kids(this)) {
      if (el === this.#ui || SKIP.test(el.tagName)) continue;
      const slot = el.getAttribute("slot");
      (slot === "header" ? heads : slot === "footer" ? feet : src).push(el);
    }

    // 2) Escritura: las copias en la hoja de medir (con una fila «Van» de muestra en cada tabla que suma).
    const head = h("div", { class: "nx-print__head" }, ...heads.map(copy));
    const foot = h("div", { class: "nx-print__foot" }, ...feet.map(copy));
    const clones = src.map(copy);
    const tables = clones.map((c) => (c.tagName === "TABLE" ? this.#tableInfo(c as HTMLTableElement, fmt) : null));
    const body = h("div", { class: "nx-print__body" }, ...clones);
    this.#measure!.replaceChildren(h("div", { class: "nx-print__sheet" }, head, body, foot));

    // 3) Lectura: todas las alturas de una vez.
    const headH = heads.length ? head.getBoundingClientRect().height : 0;
    const footH = feet.length ? foot.getBoundingClientRect().height : 0;
    const rects = clones.map((c) => c.getBoundingClientRect());
    const blocks: PrintBlock[] = clones.map((_, i) => {
      const r = rects[i];
      const next = rects[i + 1];
      const el = src[i];
      const cs = getComputedStyle(el);
      const brk = el.getAttribute("data-print-break") ?? "";
      const page = /^(page|always|left|right|recto|verso)$/;
      const b: PrintBlock = {
        height: r.height,
        gap: next ? Math.max(0, next.top - r.top - r.height) : 0,
        keep: boolAttr(el, "data-print-keep") || /^avoid/.test(cs.breakInside),
        keepWithNext: boolAttr(el, "data-print-keep-with-next") || /^avoid/.test(cs.breakAfter),
        breakBefore: brk.includes("before") || page.test(cs.breakBefore),
        breakAfter: brk.includes("after") || page.test(cs.breakAfter),
      };
      const t = tables[i];
      if (t) b.table = this.#measureTable(t, r.height);
      return b;
    });

    // 4) El reparto (puro).
    const content = (hh - m[0] - m[2]) * PX_PER_MM - headH - footH - 1;
    const plan = paginatePrint(blocks, { pageHeight: content, minRows: 2 });
    const n = plan.length;

    // 5) Escritura: las hojas, con las mismas copias.
    const placed = new Set<number>();
    const sheets = plan.map((pieces, p) => {
      const pageBody = h("div", { class: "nx-print__body" });
      for (const piece of pieces) pageBody.append(this.#piece(piece, clones, tables, placed, fmt));
      for (const el of pageBody.querySelectorAll("[data-print-page]")) fill(el, p + 1, n);
      const hd = heads.length ? head.cloneNode(true) : null;
      const ft = feet.length ? foot.cloneNode(true) : null;
      if (hd) fill(hd, p + 1, n);
      if (ft) fill(ft, p + 1, n);
      return h(
        "div",
        { class: "nx-print__page" },
        h("div", { class: "nx-print__sheet" }, hd, pageBody, ft),
        h("p", { class: "nx-print__num" }, fillPageText(L.page, p + 1, n)),
      );
    });
    this.#stack!.replaceChildren(...sheets);
    this.#measure!.replaceChildren();
    this.#mo?.takeRecords();

    this.#pages = n;
    if (this.#count) this.#count.textContent = n === 1 ? L.pagesOne : L.pages.replace("{n}", fmt.number(n));
    this.#applyZoom();
    this.#emit("nx-print-paginate", { pages: n });
    return n;
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, value: string | null | undefined): void {
    if (value === null || value === undefined || value === "") this.removeAttribute(name);
    else this.setAttribute(name, value);
  }

  #emit<T>(type: string, detail: T, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  /** ¿Este cambio afecta el documento? Lo que pasa en las hojas (nuestro) o en los atributos propios, no. */
  #matters(r: MutationRecord): boolean {
    if (this.#ui!.contains(r.target)) return false;
    if (r.target === this) {
      if (r.type === "attributes") return r.attributeName === "class" || r.attributeName === "style";
      return [...Array.from(r.addedNodes), ...Array.from(r.removedNodes)].some((x) => x !== this.#ui);
    }
    return true;
  }

  #schedule(delay = 80): void {
    this.#dirty = true;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      if (typeof requestAnimationFrame !== "function") return this.paginate();
      cancelAnimationFrame(this.#raf);
      this.#raf = requestAnimationFrame(() => this.#dirty && this.paginate());
    }, delay) as unknown as number;
  }

  #buildBar(): void {
    const L = this.#labels;
    // `label` es el nombre accesible de los botones de símbolo (−, +); `title`, solo la ayuda al pasar.
    const btn = (k: string, text: string, cls = "", label?: string, title = label) =>
      h("button", { type: "button", class: `nx-print__btn ${cls}`.trim(), "data-k": k, "aria-label": label, title, tabindex: -1 }, text);
    const printBtn = btn("print", L.print, "nx-print__btn--primary");
    printBtn.tabIndex = 0;
    this.#count = h("span", { class: "nx-print__count" });
    this.#zoomText = h("span", { class: "nx-print__zoom" });
    this.#hint = h("p", { class: "nx-print__hint", role: "status" });
    const bar = h(
      "div",
      { class: "nx-print__bar", role: "toolbar", "aria-label": L.toolbar },
      printBtn,
      btn("pdf", L.pdf),
      this.#count,
      btn("out", "−", "nx-print__btn--icon", L.zoomOut),
      this.#zoomText,
      btn("in", "+", "nx-print__btn--icon", L.zoomIn),
      btn("fit", L.fit),
      btn("actual", "100 %", "", undefined, L.actual),
      this.#hint,
    );
    bar.hidden = !this.toolbar;
    if (this.#bar) this.#bar.replaceWith(bar);
    else this.#ui!.prepend(bar);
    this.#bar = bar;
    if (this.#pages) this.#count.textContent = this.#pages === 1 ? L.pagesOne : L.pages.replace("{n}", this.#fmt().number(this.#pages));
    this.#applyZoom();
  }

  #fmt(): NxFormat {
    return nxFormat(resolveLocale(this));
  }

  #applyZoom(): void {
    if (!this.#stack || !this.#desk) return;
    const z = this.zoom;
    const avail = this.#desk.clientWidth - 2 * PAD;
    const fit = avail > 0 && this.#width > 0 ? Math.max(0.1, Math.min(1, avail / this.#width)) : 1;
    const eff = (this.#eff = z === "fit" ? fit : z);
    this.#stack.style.setProperty("--nx-print-zoom", String(Math.round(eff * 1000) / 1000));
    if (this.#zoomText) this.#zoomText.textContent = `${this.#fmt().number(Math.round(eff * 100))} %`;
    for (const b of this.#bar?.querySelectorAll<HTMLButtonElement>("[data-k=fit],[data-k=actual]") ?? []) {
      b.setAttribute("aria-pressed", String(b.dataset.k === "fit" ? z === "fit" : z !== "fit" && Math.abs(eff - 1) < 0.001));
    }
  }

  #onClick = (e: MouseEvent): void => {
    const b = (e.target as Element).closest?.<HTMLButtonElement>(".nx-print__btn");
    if (!b || !this.#bar?.contains(b)) return;
    this.#rove(b);
    const k = b.dataset.k;
    if (k === "print") this.print();
    else if (k === "pdf") {
      // La pista tiene que pintarse antes de que el diálogo (que bloquea) se abra.
      this.#hint!.textContent = this.#labels.pdfHint;
      const go = () => setTimeout(() => this.print(), 0);
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
      else go();
    } else if (k === "fit") this.zoom = "fit";
    else if (k === "actual") this.zoom = 1;
    else if (k === "in" || k === "out") {
      const z = this.zoom;
      this.zoom = stepZoom(z === "fit" ? this.#eff : z, k === "in" ? 1 : -1);
    }
  };

  /** Barra con una sola parada de tabulación: las flechas pasan de un botón al otro. */
  #onKey = (e: KeyboardEvent): void => {
    const btns = Array.from(this.#bar?.querySelectorAll<HTMLButtonElement>(".nx-print__btn") ?? []);
    const i = btns.indexOf(e.target as HTMLButtonElement);
    if (i < 0) return;
    const last = btns.length - 1;
    const j = e.key === "ArrowRight" ? (i + 1) % btns.length : e.key === "ArrowLeft" ? (i || btns.length) - 1 : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (j < 0) return;
    e.preventDefault();
    this.#rove(btns[j]);
    btns[j].focus();
  };

  #rove(b: HTMLButtonElement): void {
    for (const x of this.#bar!.querySelectorAll<HTMLButtonElement>(".nx-print__btn")) x.tabIndex = x === b ? 0 : -1;
  }

  /** Pone la hoja de impresión. `false` si `nx-print-before` se canceló. */
  #begin(): boolean {
    if (active && active !== this) active.#end();
    if (!this.#emit("nx-print-before", { pages: this.#pages }, true)) {
      if (this.#hint) this.#hint.textContent = "";
      return false;
    }
    active = this;
    const [w, hh] = parsePrintSize(this.getAttribute("size"), this.getAttribute("orientation"));
    this.#style = h("style");
    this.#style.textContent = printCss(w, hh);
    document.head.append(this.#style);
    this.setAttribute("data-nx-printing", "");
    const t = this.heading?.trim();
    if (t) {
      this.#title = document.title;
      document.title = t;
    }
    return true;
  }

  #end(): void {
    if (active !== this) return;
    active = null;
    this.#style?.remove();
    this.#style = undefined;
    this.removeAttribute("data-nx-printing");
    if (this.#title !== null) document.title = this.#title;
    this.#title = null;
    if (this.#hint) this.#hint.textContent = "";
    this.#emit("nx-print-after", { pages: this.#pages });
  }

  // ---------------------------------------------------------------- tablas

  /** Lo que se sabe de una tabla sin medir: filas, columnas que suman y sus valores. */
  #tableInfo(el: HTMLTableElement, fmt: NxFormat): TableInfo {
    const rows = bodyRows(el);
    const th = part(el, "THEAD");
    const headRows = (th ? kids(th) : []).filter((r): r is HTMLTableRowElement => r.tagName === "TR");
    const sums: SumCol[] = [];
    let ncols = 0;
    for (const tr of [...headRows, ...rows.slice(0, 1)]) ncols = Math.max(ncols, spanOf(tr));
    for (const tr of headRows) {
      let c = 0;
      for (const cell of cellsOf(tr)) {
        const kind = cell.getAttribute("data-print-sum");
        if (kind !== null && !sums.some((s) => s.col === c)) sums.push({ col: c, money: kind !== "number", currency: cell.getAttribute("data-currency") || this.currency || undefined });
        c += span(cell);
      }
    }
    sums.sort((a, b) => a.col - b.col);
    const values = sums.length
      ? rows.map((tr) =>
          sums.map(({ col }) => {
            const cell = cellAt(tr, col);
            const raw = cell?.getAttribute("data-value");
            const v = raw !== null && raw !== undefined ? Number(raw) : fmt.parse(cell?.textContent ?? "");
            return typeof v === "number" && Number.isFinite(v) ? v : 0;
          }),
        )
      : [];
    const info: TableInfo = { el, rows, parents: rows.map((r) => r.parentElement), sums, values, ncols };
    const full = (tr: HTMLTableRowElement) => cellsOf(tr).length === ncols && cellsOf(tr).every((c) => span(c) === 1);
    info.widthRow = [...headRows].reverse().find(full) ?? rows.find(full);
    if (sums.length && rows.length) {
      const total = sums.map((_, k) => values.reduce((s, v) => s + v[k], 0));
      info.sample = this.#carryRow(info, this.#labels.carriedIn, total, fmt);
      (info.parents[info.parents.length - 1] ?? el).append(info.sample);
    }
    return info;
  }

  /** Lectura de las alturas de una tabla (dentro del mismo pase de lectura). */
  #measureTable(t: TableInfo, height: number): PrintBlock["table"] {
    const hOf = (el: Element | null | undefined) => (el ? el.getBoundingClientRect().height : 0);
    const head = hOf(part(t.el, "THEAD"));
    const foot = hOf(part(t.el, "TFOOT"));
    const caption = hOf(part(t.el, "CAPTION"));
    const carry = hOf(t.sample);
    const rects = t.rows.map((r) => r.getBoundingClientRect());
    const rows = rects.map((r, k) => Math.max(r.height, (k + 1 < rects.length ? rects[k + 1].top : t.sample ? t.sample.getBoundingClientRect().top : r.top) - r.top));
    if (t.widthRow) {
      t.widths = cellsOf(t.widthRow).map((c) => c.getBoundingClientRect().width);
      t.width = t.el.getBoundingClientRect().width;
    }
    const sum = rows.reduce((s, x) => s + x, 0);
    return { head, rows, foot, caption, carry, extra: Math.max(0, height - head - foot - caption - sum - carry), sums: t.sums.length ? t.values : undefined };
  }

  /** La fila «Van» / «Vienen»: la etiqueta hasta la primera columna que suma, y los montos. */
  #carryRow(t: TableInfo, label: string, values: number[], fmt: NxFormat): HTMLTableRowElement {
    const tr = h("tr", { class: "nx-print__carry" });
    const first = t.sums[0].col;
    if (first > 0) tr.append(h("th", { scope: "row", colspan: first }, label));
    for (let c = first; c < Math.max(t.ncols, t.sums[t.sums.length - 1].col + 1); c++) {
      const k = t.sums.findIndex((s) => s.col === c);
      const s = t.sums[k];
      const text = s ? (s.money ? fmt.money(values[k], { currency: s.currency }) : fmt.number(values[k])) : "";
      tr.append(h("td", { class: s ? "nx-print__sum" : null }, first === 0 && c === 0 ? `${label} ${text}` : text));
    }
    return tr;
  }

  /** Lo que va en la hoja por un pedazo del plan. */
  #piece(piece: PrintPiece, clones: Element[], tables: (TableInfo | null)[], placed: Set<number>, fmt: NxFormat): Node {
    const i = piece.block;
    const t = tables[i];
    if (piece.clip !== undefined) {
      const node = placed.has(i) ? copy(clones[i]) : clones[i];
      placed.add(i);
      t?.sample?.remove();
      const inner = h("div", { style: `margin-block-start:${-(piece.offset ?? 0)}px` }, node);
      return h("div", { class: "nx-print__slice", style: `block-size:${piece.clip}px` }, inner);
    }
    if (!t) return clones[i];
    t.sample?.remove();
    if (piece.first && piece.last) return t.el;
    // Un pedazo de tabla: la misma tabla (atributos, colgroup, anchos de columna fijos), su encabezado y sus filas.
    const tp = t.el.cloneNode(false) as HTMLTableElement;
    const cg = part(t.el, "COLGROUP");
    if (t.widths?.length && t.width) {
      tp.style.tableLayout = "fixed";
      tp.style.width = `${t.width}px`;
      tp.append(h("colgroup", null, ...t.widths.map((w) => h("col", { style: `width:${w}px` }))));
    } else if (cg) tp.append(cg.cloneNode(true));
    const cap = part(t.el, "CAPTION");
    if (piece.first && cap) tp.prepend(cap);
    const th = part(t.el, "THEAD");
    if (th) tp.append(th.cloneNode(true));
    if (piece.carryIn) tp.append(h("tbody", null, this.#carryRow(t, this.#labels.carriedIn, piece.carryIn, fmt)));
    let src: Element | null | undefined;
    let tb: Element | undefined;
    for (let k = piece.from ?? 0; k < (piece.to ?? 0); k++) {
      const parent = t.parents[k];
      if (!tb || parent !== src) {
        src = parent;
        tb = parent && parent !== t.el ? (parent.cloneNode(false) as Element) : h("tbody");
        tp.append(tb);
      }
      tb.append(t.rows[k]);
    }
    if (piece.carryOut) tp.append(h("tbody", null, this.#carryRow(t, this.#labels.carriedOut, piece.carryOut, fmt)));
    const tf = part(t.el, "TFOOT");
    if (piece.last && tf) tp.append(tf);
    return tp;
  }
}
