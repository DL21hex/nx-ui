/**
 * El filtro por columna de `<nx-grid>`: el panel que abre el embudo de una cabecera (o el chip, o
 * Alt+↓) y el menú de una celda (clic derecho, o Mayús+F10). Se carga aparte, la primera vez que
 * hace falta: la tabla sola no lo paga.
 *
 * El panel sale del dato: lista (estados y texto con pocos valores), rango (montos y números),
 * fechas (tramos relativos a hoy, o entre dos fechas) y «contiene» (texto con casi un valor por
 * fila). Se aplica mientras se elige, dice cuántas filas quedan y escribe en el mismo modelo de
 * filtros (`GridFilter[]`) que las facetas y la frase.
 */
import { h } from "../../core/dom";
import { foldText } from "../../core/text";
import { nxFormat, type NxFormat } from "../../core/locale";
import { histogram, histogramSpec, type HistogramSpec } from "./bars";
import { addDays, applyFilters, colType, crossfilter, DATE_RELS, facetOrder, foldValue, formatCell, fromSelection, matchFilter, relRange, selection, todayISO, type GridFacet } from "./logic";
import type { GridColumn, GridDateRel, GridFilter, GridHistogram, GridLabels, GridRow } from "./types";

export type FilterKind = "list" | "range" | "date" | "text";

/** Lo que el panel necesita de la tabla. Los conteos y las barras se calculan aquí, no en ella:
 *  la tabla sola no carga ese código. */
export interface FilterHost {
  readonly el: HTMLElement;
  readonly labels: GridLabels;
  readonly loc: NxFormat;
  readonly filters: GridFilter[];
  /** Los datos están en el servidor: los conteos y las barras llegan con cada página. */
  readonly server: boolean;
  /** Todas las filas (modo cliente). */
  readonly all: GridRow[];
  kind(col: GridColumn): FilterKind;
  /** Reemplaza los filtros de una columna. */
  set(key: string, next: GridFilter[]): void;
  /** La faceta ya calculada de una columna (o la que mandó el servidor). */
  facet(key: string): GridFacet | undefined;
  /** Las barras que mandó el servidor. */
  hist(key: string): GridHistogram | undefined;
  /** Filas que quedan y el total (null si no se sabe). */
  left(): { n: number; total: number | null };
  /** El embudo de la columna (para devolverle el foco). */
  funnel(key: string): HTMLElement | null;
  /** El foco vuelve a la tabla (tras el menú de una celda). */
  back(): void;
}

/** `flush`: el cuerpo se va (el panel se cierra o pasa a otra columna). Lo escrito que todavía no
 *  se aplicó («contiene» espera un momento; «Desde» y «Hasta», a salir del campo) se aplica a SU
 *  columna, o se descarta (`apply` falso: «Restablecer»). Después, el cuerpo ya no escribe. */
type Body = { el: HTMLElement; update(): void; focus(): void; flush?(apply: boolean): void };
/** Lo caro que sale de todas las filas (el orden de una lista, cómo se reparten las barras): se
 *  calcula una vez por versión de los datos mientras el panel está abierto, no en cada cambio. */
type Memo<T> = { rows?: GridRow[]; v?: T };
type Value = { value: string; label: string; tone?: string; count?: number };
type Range = Extract<GridFilter, { op: "range" }>;

let radioGroup = 0;
/** Las opciones de una lista que se pintan: con miles de valores, abrir el panel y cada clic
 *  tardaban décimas de segundo. El resto aparece al buscar. */
const LIST_MAX = 200;
const fmt = (t: string, vars: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
/** Lo escrito en «Hasta» se incluye: se guarda con un centavo más (`max` es excluyente). */
const inclusive = (v: number) => Math.round((v + 0.01) * 100) / 100;
const shownMax = (m: number) => (Math.round(m * 100) % 100 === 1 ? Math.round((m - 0.01) * 100) / 100 : m);

function mark(el: HTMLElement, text: string, q: string): void {
  const i = q ? foldText(text).indexOf(q) : -1;
  if (i < 0) el.textContent = text;
  else el.replaceChildren(text.slice(0, i), h("mark", null, text.slice(i, i + q.length)), text.slice(i + q.length));
}

/** Las barras de un panel. `mask`: cuáles quedan dentro del filtro de la columna. Las barras ya
 *  pintadas se actualizan en su lugar (al arrastrar, la que está bajo el puntero no parpadea). */
function drawBars(box: HTMLElement, hst: GridHistogram, mask: boolean[] | null): void {
  const max = Math.max(1, ...hst.counts);
  if (box.children.length !== hst.counts.length) box.replaceChildren(...hst.counts.map((_, i) => h("span", { "data-bar": i })));
  hst.counts.forEach((n, i) => {
    const b = box.children[i] as HTMLElement;
    b.className = `nx-grid__fbar${mask && !mask[i] ? " is-off" : ""}`;
    b.title = hst.labels[i];
    b.style.setProperty("--_a", String(n ? Math.max(n / max, 0.06) : 0));
    b.style.setProperty("--_f", String(hst.filtered[i] ? Math.max(hst.filtered[i] / max, 0.06) : 0));
  });
}

/** Deja fuera un valor (menú de una celda): lo quita de un `in` o lo suma al `notIn`. */
export function excludeValue(filters: readonly GridFilter[], key: string, value: string): GridFilter[] {
  const inc = filters.find((f): f is Extract<GridFilter, { op: "in" }> => f.key === key && f.op === "in");
  if (inc) return filters.map((f) => (f === inc ? { ...inc, values: inc.values.filter((v) => v !== value) } : f));
  const not = filters.find((f): f is Extract<GridFilter, { op: "notIn" }> => f.key === key && f.op === "notIn");
  return [...filters.filter((f) => f !== not), { key, op: "notIn", values: [...(not?.values ?? []).filter((v) => v !== value), value] }];
}

/** Un monto escrito como sale natural: «5.000.000», «5 M», «2,5 millones», «450 mil», «450k». */
export function parseAmount(text: string, f: NxFormat = nxFormat()): number | null {
  let t = foldText(text).trim();
  let k = 1;
  const m = /\s*(millones|millon|mill|mm|m|mil|k)\.?$/.exec(t);
  if (m && /\d/.test(t.slice(0, m.index))) {
    k = m[1] === "mil" || m[1] === "k" ? 1e3 : 1e6;
    t = t.slice(0, m.index);
  }
  const n = f.parse(t);
  return n === null ? null : Math.round(n * k * 100) / 100;
}

/** Un filtro de rango sin claves vacías (así viaja limpio al servidor). */
function range(key: string, min: number | string | undefined, max: number | string | undefined): Range {
  const f: Range = { key, op: "range" };
  if (min !== undefined) f.min = min;
  if (max !== undefined) f.max = max;
  return f;
}

const overlaps = (a: number | string, b: number | string, f: Range | undefined) => !f || ((f.min === undefined || b > f.min) && (f.max === undefined || a < f.max));

export class FilterPanel {
  #host: FilterHost;
  #pop: HTMLDivElement;
  #menu: HTMLDivElement;
  #title: HTMLElement;
  #box: HTMLElement;
  #left: HTMLElement;
  #clear: HTMLButtonElement;
  #doneBtn: HTMLButtonElement;
  #col: GridColumn | null = null;
  #body: Body | null = null;
  #closed = { key: "", t: 0 };
  #anchor: HTMLElement | null = null;
  #place = () => this.#position();

  constructor(host: FilterHost) {
    this.#host = host;
    this.#title = h("strong");
    this.#box = h("div", { class: "nx-grid__f-body" });
    // Sin región viva: lo que queda lo anuncia la tabla (una vez por cambio, no dos o tres).
    this.#left = h("span", { class: "nx-grid__f-left" });
    this.#clear = h("button", { type: "button", class: "nx-grid__clear" });
    this.#doneBtn = h("button", { type: "button", class: "nx-grid__btn" });
    this.#clear.addEventListener("click", () => {
      if (!this.#col) return;
      this.#body?.flush?.(false);
      this.#host.set(this.#col.key, []);
      this.#open(this.#col, this.#anchor);
    });
    this.#doneBtn.addEventListener("click", () => this.close());
    // `data-nx-ephemeral`: filtrar no es un cambio de datos (ver la barra de la tabla).
    this.#pop = h(
      "div",
      { class: "nx-grid__filter", popover: "auto", role: "dialog", tabindex: -1, "data-nx-ephemeral": "" },
      h("div", { class: "nx-grid__f-head" }, this.#title),
      this.#box,
      h("div", { class: "nx-grid__f-foot" }, this.#clear, this.#left, this.#doneBtn),
    );
    this.#pop.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });
    // `beforetoggle` llega antes de cerrar: el foco sigue adentro y se puede devolver al embudo.
    this.#pop.addEventListener("beforetoggle", (e) => {
      if ((e as ToggleEvent).newState !== "closed" || !this.#col) return;
      this.#closing(true);
    });
    this.#menu = h("div", { class: "nx-grid__menu", popover: "auto", role: "menu", "data-nx-ephemeral": "" });
    this.#menu.addEventListener("keydown", (e) => {
      const items = [...this.#menu.querySelectorAll<HTMLElement>("button")];
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
      } else if (e.key === "Escape") {
        e.stopPropagation();
        this.#hideMenu();
      }
    });
    host.el.append(this.#pop, this.#menu);
  }

  /** La columna del panel abierto. */
  get openKey(): string | null {
    return this.#col?.key ?? null;
  }

  /** Abre el panel de una columna (o lo cierra, si ya era el suyo: el embudo es un interruptor). */
  toggle(col: GridColumn, anchor: HTMLElement | null): void {
    const again = this.#closed.key === col.key && performance.now() - this.#closed.t < 250;
    if (this.#col?.key === col.key || again) return this.close();
    this.#open(col, anchor);
  }

  close(): void {
    if (!this.#col) return;
    this.#closing(false);
    this.#pop.hidePopover?.();
  }

  /** La tabla cambió (filtros, filas o los agregados del servidor): conteos y barras al día. */
  refresh(): void {
    if (!this.#col) return;
    this.#body?.update();
    this.#foot();
  }

  /** `dismissed`: lo cerró el navegador (un clic afuera). Si ese clic fue en el mismo embudo, el
   *  clic que sigue no debe volver a abrirlo. */
  #closing(dismissed: boolean): void {
    const key = this.#col!.key;
    const body = this.#body;
    const inside = this.#pop.contains(document.activeElement) || document.activeElement === document.body;
    this.#col = null;
    this.#body = null;
    // Lo escrito y no aplicado va a su columna (con el panel ya cerrado: aplicarlo no lo repinta).
    body?.flush?.(true);
    this.#closed = dismissed ? { key, t: performance.now() } : { key: "", t: 0 };
    removeEventListener("resize", this.#place);
    removeEventListener("scroll", this.#place, true);
    const f = this.#host.funnel(key);
    f?.setAttribute("aria-expanded", "false");
    if (inside) queueMicrotask(() => f?.focus({ preventScroll: true }));
  }

  #open(col: GridColumn, anchor: HTMLElement | null): void {
    const L = this.#host.labels;
    const was = this.#col;
    if (was) this.#body?.flush?.(true);
    if (was && was.key !== col.key) this.#host.funnel(was.key)?.setAttribute("aria-expanded", "false");
    this.#col = col;
    this.#anchor = anchor;
    const kind = this.#host.kind(col);
    this.#body = (kind === "list" ? this.#list : kind === "range" ? this.#range : kind === "date" ? this.#dates : this.#text).call(this, col);
    this.#title.textContent = col.label;
    this.#pop.setAttribute("aria-label", fmt(L.filterBy, { col: col.label }));
    this.#clear.textContent = L.reset;
    this.#doneBtn.textContent = L.done;
    this.#box.replaceChildren(this.#body.el);
    this.#body.update();
    this.#foot();
    this.#host.funnel(col.key)?.setAttribute("aria-expanded", "true");
    if (!was) {
      addEventListener("resize", this.#place);
      addEventListener("scroll", this.#place, true);
    }
    if (!this.#pop.matches?.(":popover-open")) this.#pop.showPopover?.();
    this.#position();
    // En una pantalla táctil, el foco en el buscador o en «Desde» abriría el teclado encima de la
    // hoja: el foco queda en el panel, salvo en «contiene», que es para escribir.
    if (kind !== "text" && typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches) this.#pop.focus({ preventScroll: true });
    else this.#body.focus();
  }

  #foot(): void {
    const L = this.#host.labels;
    const { n, total } = this.#host.left();
    const nf = this.#host.loc.number;
    this.#left.textContent = total === null ? fmt(L.rows, { n: nf(n) }) : fmt(L.left, { n: nf(n), total: nf(total) });
    this.#clear.disabled = !this.#host.filters.some((f) => f.key === this.#col?.key);
  }

  /** Bajo la cabecera, alineado a su borde (el derecho en los números); en una pantalla angosta el
   *  CSS lo vuelve una hoja inferior. */
  #position(): void {
    const a = this.#anchor;
    if (!a || !this.#col) return;
    const r = a.getBoundingClientRect();
    const w = this.#pop.offsetWidth || 304;
    const num = colType(this.#col) === "number" || colType(this.#col) === "money";
    const left = Math.min(Math.max(8, num ? r.right - w : r.left), innerWidth - w - 8);
    const top = Math.max(8, r.bottom + 4);
    this.#pop.style.setProperty("--_left", `${left}px`);
    this.#pop.style.setProperty("--_top", `${top}px`);
    this.#pop.style.setProperty("--_maxh", `${Math.max(260, innerHeight - top - 12)}px`);
  }

  // ---------------------------------------------------------------- cálculos

  /** Las filas que pasan todos los filtros menos los de la columna (nunca se cuenta a sí misma). */
  #others(key: string): GridRow[] {
    return applyFilters(
      this.#host.all,
      this.#host.filters.filter((f) => f.key !== key),
    );
  }

  #memo<T>(m: Memo<T>, make: (rows: GridRow[]) => T): T {
    const rows = this.#host.all;
    if (m.rows !== rows) {
      m.rows = rows;
      m.v = make(rows);
    }
    return m.v as T;
  }

  /** Los valores de una lista, con cuántas filas quedarían (contando los demás filtros). */
  #values(c: GridColumn, order: Memo<Map<string, string[]>>): Value[] {
    const tone = (v: string) => c.options?.find((o) => o.value === v)?.tone;
    const facet = this.#host.facet(c.key) ?? (this.#host.server ? undefined : crossfilter(this.#host.all, this.#host.filters, [c], this.#memo(order, (rows) => facetOrder([c], rows))).facets[0]);
    if (facet) return facet.options.map((o) => ({ ...o, tone: tone(o.value) }));
    return (c.options ?? []).map((o) => ({ value: o.value, label: o.label ?? o.value, tone: o.tone }));
  }

  /** `true` si se conocen todos los valores (se puede guardar «sin Cali»). */
  #complete(c: GridColumn): boolean {
    return !this.#host.server || !!c.options;
  }

  /** Las barras: `counts` sobre todas las filas y `filtered` con los demás filtros. El reparto
   *  (`spec`, con su conteo sobre todas las filas) se arma una vez: al arrastrar, cada paso solo
   *  cuenta lo filtrado. */
  #bars(c: GridColumn, memo: Memo<HistogramSpec | null>): GridHistogram | null {
    if (c.histogram === false) return null;
    if (this.#host.server) return this.#host.hist(c.key) ?? null;
    const spec = this.#memo(memo, (rows) => histogramSpec(c, rows, this.#host.loc));
    return spec ? histogram(spec, this.#host.all, this.#others(c.key)) : null;
  }

  /** Cuántas filas pasarían cada filtro, con los demás (null en el servidor: no se sabe). */
  #counts(c: GridColumn, fs: GridFilter[]): number[] | null {
    if (this.#host.server) return null;
    const rows = this.#others(c.key);
    return fs.map((f) => rows.reduce((n, r) => n + (matchFilter(r, f) ? 1 : 0), 0));
  }

  /** Hasta 5 valores que contienen `q` y cuántas filas coinciden (null en el servidor). */
  #sample(c: GridColumn, q: string): { values: string[]; n: number } | null {
    if (this.#host.server) return null;
    const values = new Set<string>();
    let n = 0;
    for (const r of this.#others(c.key)) {
      const v = formatCell(r[c.key], c, this.#host.loc);
      if (!foldValue(v).includes(q)) continue;
      n++;
      if (values.size < 5) values.add(v);
    }
    return { values: [...values], n };
  }

  #own(): GridFilter[] {
    return this.#host.filters.filter((f) => f.key === this.#col?.key);
  }
  /** El tramo de la columna (la intersección, si hay varios). */
  #range_(): Range | undefined {
    const rs = this.#own().filter((f): f is Range => f.op === "range");
    if (!rs.length) return undefined;
    if (rs.length === 1) return rs[0];
    const mins = rs.map((f) => f.min).filter((x) => x !== undefined);
    const maxs = rs.map((f) => f.max).filter((x) => x !== undefined);
    return { key: rs[0].key, op: "range", min: mins.length ? mins.reduce((a, b) => (b > a ? b : a)) : undefined, max: maxs.length ? maxs.reduce((a, b) => (b < a ? b : a)) : undefined };
  }

  // ---------------------------------------------------------------- lista

  #list(col: GridColumn): Body {
    const L = this.#host.labels;
    const key = col.key;
    const order: Memo<Map<string, string[]>> = {};
    let q = "";
    type Item = { row: HTMLElement; box: HTMLInputElement; text: HTMLElement; n: HTMLElement; q?: string };
    let vals: Value[] = [];
    let values: string[] = [];
    // Las etiquetas sin tildes, una vez por lista (no en cada tecla del buscador).
    let folds: string[] = [];
    // Las filas se crean al mostrarse y se reutilizan; `shown`: las que están en la lista.
    let made = new Map<string, Item>();
    let shown: Item[] = [];
    let match: number[] = [];
    const search = h("input", { type: "search", class: "nx-grid__field", autocomplete: "off" });
    const hint = h("p", { class: "nx-grid__f-hint", hidden: true }, L.enterOnly);
    const all = h("input", { type: "checkbox" });
    const allText = h("span", { class: "nx-grid__opt-label" });
    const allRow = h("label", { class: "nx-grid__opt nx-grid__opt-all" }, all, allText);
    const list = h("div", { class: "nx-grid__f-opts", role: "group", "aria-label": col.label });
    const none = h("p", { class: "nx-grid__f-hint", hidden: true }, L.noValues);
    const more = h("p", { class: "nx-grid__f-hint", hidden: true });
    const sel = () => selection(this.#host.filters, key, values) ?? new Set(values);
    const commit = (s: Set<string>) => this.#host.set(key, fromSelection(key, s, values, this.#complete(col)));
    /** Los valores que coinciden con lo buscado (también los que no se pintan). */
    const visible = () => match.map((i) => values[i]);
    // La casilla y su texto van en el label; «Solo» va al lado, fuera de él (un botón dentro de un
    // label no es válido y le cambiaba el nombre a la casilla).
    const item = (v: Value): Item => {
      let it = made.get(v.value);
      if (!it) {
        const box = h("input", { type: "checkbox", "data-v": v.value });
        const text = h("span", { class: "nx-grid__opt-label" });
        const n = h("span", { class: "nx-grid__opt-n" });
        const only = h("button", { type: "button", class: "nx-grid__only", "data-only": v.value, "aria-label": fmt(L.onlyValue, { v: v.label }) }, L.only);
        const row = h("div", { class: "nx-grid__opt" }, h("label", { class: "nx-grid__opt-main" }, box, v.tone ? h("span", { class: "nx-grid__dot", "data-tone": v.tone }) : null, text, n), only);
        made.set(v.value, (it = { row, box, text, n }));
      }
      return it;
    };
    const build = (next: Value[]) => {
      values = next.map((v) => v.value);
      folds = next.map((v) => foldText(v.label));
      made = new Map();
      search.placeholder = fmt(L.searchIn, { n: this.#host.loc.number(values.length) });
      search.setAttribute("aria-label", search.placeholder);
      search.hidden = values.length <= 7;
    };
    list.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      const s = sel();
      if (t === all) {
        const vis = visible();
        const on = vis.every((v) => s.has(v));
        for (const v of vis) on ? s.delete(v) : s.add(v);
      } else if (t.dataset.v !== undefined) t.checked ? s.add(t.dataset.v) : s.delete(t.dataset.v);
      commit(s);
    });
    list.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-only]");
      if (!b) return;
      e.preventDefault();
      commit(new Set([b.dataset.only!]));
    });
    search.addEventListener("input", () => {
      q = foldText(search.value.trim());
      update();
    });
    search.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const vis = visible();
      if (q && vis.length) commit(new Set(vis));
    });
    const update = () => {
      // Los valores llegan después en modo servidor (las facetas vienen con cada bloque).
      vals = this.#values(col, order);
      if (vals.length !== values.length || vals.some((v, i) => v.value !== values[i])) build(vals);
      const s = sel();
      match = [];
      for (let i = 0; i < values.length; i++) if (!q || folds[i].includes(q)) match.push(i);
      const at = match.slice(0, LIST_MAX);
      const next = at.map((i) => item(vals[i]));
      if (next.length !== shown.length || next.some((x, i) => x !== shown[i])) list.replaceChildren(allRow, ...next.map((x) => x.row));
      shown = next;
      next.forEach((it, k) => {
        const v = vals[at[k]];
        it.box.checked = s.has(v.value);
        it.n.textContent = v.count === undefined ? "" : this.#host.loc.number(v.count);
        it.row.classList.toggle("is-zero", v.count === 0);
        if (it.q !== q) mark(it.text, v.label, (it.q = q));
      });
      const on = match.filter((i) => s.has(values[i])).length;
      all.checked = match.length > 0 && on === match.length;
      all.indeterminate = on > 0 && on < match.length;
      allText.textContent = q ? fmt(L.allMatching, { n: match.length }) : L.allValues;
      allRow.hidden = !match.length;
      none.hidden = match.length > 0;
      hint.hidden = !q || !match.length;
      more.hidden = match.length <= LIST_MAX;
      more.textContent = more.hidden ? "" : fmt(L.moreValues, { n: this.#host.loc.number(match.length - LIST_MAX) });
    };
    build([]);
    return { el: h("div", { class: "nx-grid__f-stack" }, search, hint, list, more, none), update, focus: () => (search.hidden ? (shown[0]?.box ?? all) : search).focus() };
  }

  // ---------------------------------------------------------------- rango

  #range(col: GridColumn): Body {
    const L = this.#host.labels;
    const loc = this.#host.loc;
    const money = colType(col) === "money";
    const show = (v: number) => (money ? loc.money(v, col) : loc.number(v));
    const bars = h("div", { class: "nx-grid__fbars", "aria-hidden": "true" });
    const lo = h("input", { type: "range", step: 1, min: 0, "aria-label": L.from });
    const hi = h("input", { type: "range", step: 1, min: 0, "aria-label": L.to });
    const fill = h("i");
    const slider = h("div", { class: "nx-grid__slider" }, h("div", { class: "nx-grid__track" }, fill), lo, hi);
    const axis = h("div", { class: "nx-grid__axis" }, h("span"), h("span"));
    const from = h("input", { class: "nx-grid__field", inputmode: "decimal", autocomplete: "off" });
    const to = h("input", { class: "nx-grid__field", inputmode: "decimal", autocomplete: "off" });
    const bars_: Memo<HistogramSpec | null> = {};
    let edges: number[] = [];
    let dead = false;
    /** Lo último que «Desde» y «Hasta» mostraron o aplicaron: si el campo dice otra cosa, se escribió
     *  y todavía no se aplicó (el `change` llega al salir del campo). */
    let last = ["", ""];
    const set = (min: number | undefined, max: number | undefined) => this.#host.set(col.key, min === undefined && max === undefined ? [] : [range(col.key, min, max)]);
    const idx = (v: number | string | undefined, d: number) => (typeof v !== "number" ? d : edges.reduce((b, e, i) => (Math.abs(e - v) < Math.abs(edges[b] - v) ? i : b), 0));
    const slide = (e: Event) => {
      const n = edges.length - 1;
      let a = Number(lo.value);
      let b = Number(hi.value);
      if (a >= b) {
        if (e.target === lo) b = (a = Math.min(a, n - 1)) + 1;
        else a = (b = Math.max(b, 1)) - 1;
      }
      set(a > 0 ? edges[a] : undefined, b < n ? edges[b] : undefined);
    };
    lo.addEventListener("input", slide);
    hi.addEventListener("input", slide);
    bars.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-bar]");
      if (!b) return;
      const i = Number(b.dataset.bar);
      set(i > 0 ? edges[i] : undefined, i + 1 < edges.length - 1 ? edges[i + 1] : undefined);
    });
    const apply = () => {
      const a = parseAmount(from.value, loc);
      const b = parseAmount(to.value, loc);
      set(a ?? undefined, b === null ? undefined : inclusive(b));
      last = [from.value, to.value];
    };
    // Tras cerrar, el campo pierde el foco y llega su `change`: ya se aplicó (o se descartó).
    const typed = () => {
      if (!dead) apply();
    };
    for (const inp of [from, to]) {
      inp.addEventListener("change", typed);
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          typed();
        }
      });
    }
    const update = () => {
      const f = this.#range_();
      const hst = this.#bars(col, bars_);
      edges = hst?.edges?.every((x) => typeof x === "number") ? (hst.edges as number[]) : [];
      const n = edges.length - 1;
      bars.hidden = slider.hidden = axis.hidden = n < 1;
      if (hst && n >= 1) {
        drawBars(bars, hst, f ? edges.slice(0, -1).map((e, i) => overlaps(e, edges[i + 1], f)) : null);
        const a = idx(f?.min, 0);
        const b = idx(f?.max, n);
        for (const x of [lo, hi]) x.max = String(n);
        lo.value = String(a);
        hi.value = String(b);
        lo.setAttribute("aria-valuetext", a ? show(edges[a]) : L.noMin);
        hi.setAttribute("aria-valuetext", b < n ? show(edges[b]) : L.noMax);
        fill.style.insetInlineStart = `${(a / n) * 100}%`;
        fill.style.insetInlineEnd = `${(1 - b / n) * 100}%`;
        axis.firstChild!.textContent = money ? loc.money(edges[0], col, true) : loc.compact(edges[0]);
        axis.lastChild!.textContent = money ? loc.money(edges[n], col, true) : loc.compact(edges[n]);
      }
      from.placeholder = L.noMin;
      to.placeholder = L.noMax;
      if (document.activeElement !== from) from.value = last[0] = typeof f?.min === "number" ? show(f.min) : "";
      if (document.activeElement !== to) to.value = last[1] = typeof f?.max === "number" ? show(shownMax(f.max)) : "";
    };
    const el = h(
      "div",
      { class: "nx-grid__f-stack" },
      bars,
      slider,
      axis,
      h("div", { class: "nx-grid__f-pair" }, h("label", null, h("span", null, L.from), from), h("label", null, h("span", null, L.to), to)),
      h("p", { class: "nx-grid__f-hint" }, L.amountHint),
    );
    // Lo escrito se aplica aunque el campo ya no tenga el foco: en Firefox, un clic afuera lo saca
    // del campo antes de cerrar el panel, y lo escrito se perdía.
    const flush = (go: boolean) => {
      if (dead) return;
      dead = true;
      if (go && (from.value !== last[0] || to.value !== last[1])) apply();
    };
    return { el, update, focus: () => from.focus(), flush };
  }

  // ---------------------------------------------------------------- fechas

  #dates(col: GridColumn): Body {
    const L = this.#host.labels;
    const key = col.key;
    const today = todayISO();
    let custom = false;
    const name = `nx-grid-dates${++radioGroup}`;
    const choices: ("any" | GridDateRel | "custom")[] = ["any", ...DATE_RELS, "custom"];
    const radios = choices.map((c) => {
      const r = h("input", { type: "radio", name, value: c });
      const n = h("span", { class: "nx-grid__opt-n" });
      const text = c === "any" ? L.anyDate : c === "custom" ? L.between : L[c];
      return { c, r, n, row: h("label", { class: "nx-grid__opt" }, r, h("span", { class: "nx-grid__opt-label" }, text), n) };
    });
    const from = h("input", { type: "date", class: "nx-grid__field" });
    const to = h("input", { type: "date", class: "nx-grid__field" });
    const pair = h("div", { class: "nx-grid__f-pair" }, h("label", null, h("span", null, L.from), from), h("label", null, h("span", null, L.to), to));
    const bars = h("div", { class: "nx-grid__fbars", "aria-hidden": "true" });
    const barHint = h("p", { class: "nx-grid__f-hint" }, L.barHint);
    const list = h("div", { class: "nx-grid__f-opts", role: "radiogroup", "aria-label": col.label }, ...radios.map((x) => x.row));
    list.addEventListener("change", (e) => {
      const c = (e.target as HTMLInputElement).value as (typeof choices)[number];
      custom = c === "custom";
      if (c === "any") this.#host.set(key, []);
      else if (c !== "custom") this.#host.set(key, [{ key, op: "range", rel: c, ...relRange(c, today) }]);
      else {
        const f = this.#range_();
        if (f?.rel) this.#host.set(key, [range(key, f.min, f.max)]);
        else update();
        from.focus();
      }
    });
    const typed = () => {
      custom = true;
      const a = from.value || undefined;
      const b = to.value ? addDays(to.value, 1) : undefined;
      this.#host.set(key, a || b ? [range(key, a, b)] : []);
    };
    from.addEventListener("change", typed);
    to.addEventListener("change", typed);
    let edges: string[] = [];
    const bars_: Memo<HistogramSpec | null> = {};
    bars.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-bar]");
      if (!b) return;
      const i = Number(b.dataset.bar);
      custom = true;
      this.#host.set(key, [{ key, op: "range", min: edges[i], max: edges[i + 1] }]);
    });
    const update = () => {
      const f = this.#range_();
      const mode = f ? (f.rel ?? "custom") : custom ? "custom" : "any";
      const presets = DATE_RELS.map((rel): GridFilter => ({ key, op: "range", ...relRange(rel, today) }));
      const counts = this.#counts(col, presets);
      for (const x of radios) {
        x.r.checked = x.c === mode;
        const i = DATE_RELS.indexOf(x.c as GridDateRel);
        x.n.textContent = counts && i >= 0 ? this.#host.loc.number(counts[i]) : "";
        x.row.classList.toggle("is-zero", !!counts && i >= 0 && counts[i] === 0);
      }
      pair.hidden = mode !== "custom";
      if (document.activeElement !== from) from.value = typeof f?.min === "string" ? f.min.slice(0, 10) : "";
      if (document.activeElement !== to) to.value = typeof f?.max === "string" ? addDays(f.max, -1) : "";
      const hst = this.#bars(col, bars_);
      edges = hst?.edges?.every((x) => typeof x === "string") ? (hst.edges as string[]) : [];
      bars.hidden = barHint.hidden = !hst || edges.length < 2;
      if (hst && edges.length > 1) {
        drawBars(bars, hst, f ? edges.slice(0, -1).map((e, i) => overlaps(e, edges[i + 1], f)) : null);
        // Hoy, si cae en las barras.
        const i = edges.findIndex((e, j) => j < edges.length - 1 && e.slice(0, 10) <= today && today < edges[j + 1].slice(0, 10));
        const bar = bars.children[i] as HTMLElement | undefined;
        if (bar) bar.classList.add("is-today");
      }
    };
    const el = h("div", { class: "nx-grid__f-stack" }, list, pair, bars, barHint);
    return { el, update, focus: () => (radios.find((x) => x.r.checked) ?? radios[0]).r.focus() };
  }

  // ---------------------------------------------------------------- contiene

  #text(col: GridColumn): Body {
    const L = this.#host.labels;
    const key = col.key;
    const input = h("input", { type: "search", class: "nx-grid__field", autocomplete: "off", placeholder: L.contains, "aria-label": `${col.label}: ${L.contains}` });
    const res = h("p", { class: "nx-grid__f-hint" });
    const list = h("ul", { class: "nx-grid__f-sample" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dead = false;
    const commit = () => {
      const v = input.value.trim();
      this.#host.set(key, v ? [{ key, op: "contains", value: v }] : []);
    };
    // Escape cierra el panel aplicando lo escrito: sin esto, el campo de búsqueda se vaciaba solo
    // (lo hace el navegador en Firefox) y ese vacío, ya cerrado el panel, quitaba el filtro.
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") e.preventDefault();
    });
    input.addEventListener("input", () => {
      if (dead) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        commit();
      }, 150);
    });
    const update = () => {
      const f = this.#own().find((x): x is Extract<GridFilter, { op: "contains" }> => x.op === "contains");
      if (document.activeElement !== input) input.value = f?.value ?? "";
      const q = foldText(f?.value ?? "");
      const s = q ? this.#sample(col, q) : null;
      res.textContent = s ? fmt(L.matches.split("|")[s.n === 1 ? 0 : 1] ?? L.matches, { n: this.#host.loc.number(s.n) }) : L.containsHint;
      list.replaceChildren(
        ...(s?.values ?? []).map((v) => {
          const li = h("li");
          mark(li, v, q);
          return li;
        }),
      );
    };
    const flush = (apply: boolean) => {
      dead = true;
      if (timer === undefined) return;
      clearTimeout(timer);
      timer = undefined;
      if (apply) commit();
    };
    return { el: h("div", { class: "nx-grid__f-stack" }, input, res, list), update, focus: () => input.focus(), flush };
  }

  // ---------------------------------------------------------------- menú de una celda

  /** Filtrar desde lo que se mira: «Solo Cali», «Desde $ 5.000.000»… en (x, y). */
  menu(col: GridColumn, value: unknown, x: number, y: number): void {
    const L = this.#host.labels;
    const loc = this.#host.loc;
    const key = col.key;
    const kind = this.#host.kind(col);
    const filters = this.#host.filters;
    const items: HTMLElement[] = [];
    const add = (text: string, fn: () => void) => {
      const b = h("button", { type: "button", role: "menuitem", class: "nx-grid__menu-item" }, text);
      b.addEventListener("click", () => {
        this.#hideMenu();
        fn();
      });
      items.push(b);
    };
    const own = filters.filter((f) => f.key === key);
    const fixed = own.find((f): f is Range => f.op === "range" && !f.rel);
    const empty = value === null || value === undefined || value === "";
    if (!empty && kind === "list") {
      const v = String(value);
      const label = col.options?.find((o) => o.value === v)?.label ?? v;
      add(fmt(L.onlyValue, { v: label }), () => this.#host.set(key, [{ key, op: "in", values: [v] }]));
      add(fmt(L.exceptValue, { v: label }), () => this.#host.set(key, excludeValue(own, key, v)));
    } else if (!empty && kind === "range" && typeof value === "number") {
      const show = colType(col) === "money" ? loc.money(value, col) : loc.number(value);
      add(fmt(L.fromValue, { v: show }), () => this.#host.set(key, [range(key, value, fixed?.max)]));
      add(fmt(L.toValue, { v: show }), () => this.#host.set(key, [range(key, fixed?.min, inclusive(value))]));
    } else if (!empty && kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const d = value.slice(0, 10);
      add(fmt(L.fromValue, { v: loc.date(d) }), () => this.#host.set(key, [range(key, d, fixed?.max)]));
      add(fmt(L.toValue, { v: loc.date(d) }), () => this.#host.set(key, [range(key, fixed?.min, addDays(d, 1))]));
    } else if (!empty && kind === "text") {
      const v = String(value).slice(0, 40);
      add(fmt(L.containsValue, { v }), () => this.#host.set(key, [{ key, op: "contains", value: v }]));
    }
    if (items.length) items.push(h("hr"));
    add(fmt(L.moreFilters, { col: col.label }), () => this.#open(col, this.#host.funnel(key)?.closest(".nx-grid__th") as HTMLElement | null));
    this.#menu.setAttribute("aria-label", fmt(L.filterBy, { col: col.label }));
    this.#menu.replaceChildren(...items);
    this.#menu.showPopover?.();
    const w = this.#menu.offsetWidth || 220;
    const hgt = this.#menu.offsetHeight || 120;
    // El punto del clic (o del dedo, en una pulsación larga) queda siempre dentro del menú: si no cabe
    // hacia abajo o hacia la derecha, abre hacia arriba o hacia la izquierda. Si quedara afuera, el
    // navegador lo cerraría al soltar el botón o levantar el dedo.
    const left = x + w + 8 > innerWidth ? x - w + 4 : x - 4;
    const top = y + hgt + 8 > innerHeight ? y - hgt + 4 : y - 4;
    this.#menu.style.setProperty("--_left", `${Math.max(8, left)}px`);
    this.#menu.style.setProperty("--_top", `${Math.max(8, top)}px`);
    this.#menu.querySelector<HTMLElement>("button")?.focus();
  }

  #hideMenu(): void {
    this.#menu.hidePopover?.();
    this.#host.back();
  }
}
