/**
 * `<nx-what-if>`: un simulador de escenarios para decisiones de negocio («¿qué pasa con el margen
 * si el acero sube 8 % y vendemos 5 % menos?»). Los supuestos son deslizadores con la base marcada
 * en la pista y el valor grande que se puede escribir; los resultados son tarjetas cuyo número
 * corre hacia el valor nuevo, con la base y la diferencia coloreada según lo que es mejor, y un
 * gráfico de líneas propio (base punteada, escenario continuo).
 *
 * El cálculo no es una función en una prop (BDUI): lo hace el backend (`endpoint`, POST con
 * `{inputs}` y la respuesta en NDJSON) o la app, respondiendo a `nx-what-if-compute`. Se pide con
 * espera entre cambios y la petición anterior se cancela. Los escenarios se guardan con nombre y
 * se comparan lado a lado con la base, con la mejor celda de cada métrica resaltada.
 */
import { Base } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { glyph } from "../../core/icons";
import { nxFormat, resolveLocale } from "../../core/locale";
import { lineData, readLines } from "../../core/stream";
import {
  bestOf,
  chartPaths,
  clampValue,
  cleanEvent,
  cleanInputs,
  cleanLabels,
  cleanMetrics,
  cleanScenarios,
  cleanSeries,
  deltaText,
  editText,
  fill,
  mergeMetric,
  num,
  parseEvent,
  parseTyped,
  sameValues,
  snapValue,
  stepValue,
  toneOf,
  valueText,
} from "./logic";
import type { WhatIfEvent, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfNote, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfValues } from "./types";

export const WHAT_IF_LABELS: WhatIfLabels = {
  inputs: "Supuestos",
  outputs: "Resultados",
  resetAll: "Restablecer todo",
  reset: "Restablecer {label}",
  edit: "Escribir {label}",
  vsBase: "{delta} vs. base",
  atBase: "En la base",
  base: "Base",
  current: "Actual",
  points: "p. p.",
  save: "Guardar como…",
  name: "Nombre del escenario",
  untitled: "Escenario {n}",
  ok: "Guardar",
  cancel: "Cancelar",
  scenarios: "Escenarios",
  empty: "Guarda el escenario para compararlo lado a lado con la base y con otros.",
  load: "Cargar {name}",
  rename: "Renombrar {name}",
  remove: "Borrar {name}",
  best: "mejor",
  error: "No se pudo calcular el escenario.",
  retry: "Reintentar",
  scenario: "Escenario",
};

const PROPS = ["inputs", "outputs", "series", "scenarios", "values", "labels", "endpoint", "debounce", "heading", "locale"] as const;
const RESET = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>';
const SAVE = '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>';
const LOAD = '<path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M8 5H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4"/>';
const PEN = '<path d="M21.2 6.8a1 1 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/>';
const TRASH = '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>';
const WARN = '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const INFO = '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';
/** Lo que tarda el número de una tarjeta en llegar a su valor nuevo. */
const TWEEN_MS = 520;
/** El tamaño lógico del gráfico (se estira al ancho con `preserveAspectRatio="none"`). */
const W = 300;
const H = 100;

type Row = { el: HTMLElement; range: HTMLInputElement; big: HTMLButtonElement; type: HTMLInputElement; delta: HTMLElement; reset: HTMLButtonElement; fill: HTMLElement; mark: HTMLElement };
type Card = { el: HTMLElement; label: HTMLElement; num: HTMLElement; chip: HTMLElement; base: HTMLElement };
type Chart = { el: HTMLElement; cap: HTMLElement; hi: HTMLElement; lo: HTMLElement; zero: SVGLineElement; gap: SVGPathElement; base: SVGPathElement; value: SVGPathElement; xs: HTMLElement; table: HTMLTableElement };
type Run = { seq: number; atBase: boolean; notes: WhatIfNote[]; done?: boolean; failed?: boolean };

let uid = 0;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string> = {}): SVGElementTagNameMap[K] => {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const btn = (cls: string, label: string, g: string, text?: string) => h("button", { type: "button", class: `nx-what-if__${cls}`, "aria-label": text ? null : label, title: text ? null : label }, glyph(g), text && h("span", null, text));

export class NxWhatIf extends Base {
  static observedAttributes = ["inputs", "outputs", "series", "scenarios", "labels", "endpoint", "heading", "locale"];

  #uid = `nx-wi${++uid}`;
  #inputs: WhatIfInput[] = [];
  #values: WhatIfValues = {};
  #metrics: WhatIfMetric[] = [];
  #series: WhatIfSeries[] = [];
  #scenarios: WhatIfScenario[] = [];
  #notes: WhatIfNote[] = [];
  #failed = false;
  #labels = WHAT_IF_LABELS;
  #seq = 0;
  #ctrl?: AbortController;
  #timer = 0;
  #queued = false;
  /** Lo que muestra cada tarjeta ahora (el número que corre) y hacia dónde va. */
  #shown = new Map<string, number>();
  #tweens = new Map<string, { from: number; to: number; t0: number }>();
  #raf = 0;
  /** Un «Guardar» que espera a que termine el cálculo en curso. */
  #pending: string | null = null;
  #renaming: string | null = null;
  /** Lo escrito al renombrar (sobrevive a un repintado de la tabla). */
  #renameText = "";
  #isBusy = false;
  #rows = new Map<string, Row>();
  #cards = new Map<string, Card>();
  #charts = new Map<string, Chart>();
  #built = false;
  #title?: HTMLHeadingElement;
  #resetAll?: HTMLButtonElement;
  #saveBtn?: HTMLButtonElement;
  #form?: HTMLFormElement;
  #name?: HTMLInputElement;
  #list?: HTMLElement;
  #results?: HTMLElement;
  #notesEl?: HTMLElement;
  #cardsEl?: HTMLUListElement;
  #chartsEl?: HTMLElement;
  #empty?: HTMLElement;
  #wrap?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** Los supuestos: `{id, label, value (la base), min, max, step?, format?, currency?, unit?, hint?}`. Al asignarlos, vuelven a la base. */
  get inputs(): WhatIfInput[] {
    return this.#inputs;
  }
  set inputs(v: unknown) {
    this.#inputs = cleanInputs(v);
    this.#values = Object.fromEntries(this.#inputs.map((i) => [i.id, i.value]));
    this.#buildRows();
    this.#request(0);
  }
  /** Las métricas: `{id, label, value?, base?, format?, currency?, unit?, better?: "up" | "down"}`. Sin `base`, la da el primer cálculo con los supuestos en la base. */
  get outputs(): WhatIfMetric[] {
    return this.#metrics;
  }
  set outputs(v: unknown) {
    this.#metrics = cleanMetrics(v);
    this.#cardsEl?.replaceChildren();
    this.#cards.clear();
    this.#shown.clear();
    this.#queue();
  }
  /** Series para el gráfico: `{id, label, format?, currency?, points: [{x, base?, value}]}`. */
  get series(): WhatIfSeries[] {
    return this.#series;
  }
  set series(v: unknown) {
    this.#series = (Array.isArray(v) ? v : []).map(cleanSeries).filter((s): s is WhatIfSeries => !!s);
    this.#queue();
  }
  /** Los escenarios guardados `{id, name, inputs, outputs}`. La app los persiste (`nx-what-if-save`). */
  get scenarios(): WhatIfScenario[] {
    return this.#scenarios;
  }
  set scenarios(v: unknown) {
    this.#scenarios = cleanScenarios(v);
    this.#queue();
  }
  /** Los valores actuales de los supuestos, `{id: valor}`. Asignarlos mueve los deslizadores y recalcula. */
  get values(): WhatIfValues {
    return { ...this.#values };
  }
  set values(v: WhatIfValues) {
    this.#setMany(v ?? {});
  }
  /** URL que calcula: `POST {inputs}` → NDJSON (`metric`, `series`, `note`, `error`, `done`). Sin ella, `nx-what-if-compute`.
   *  Solo del mismo origen (o uno de `allowOrigins`); otra se ignora, como si no hubiera. */
  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }
  set endpoint(v: string) {
    this.#attr("endpoint", v);
  }
  /** Espera (ms) entre el último cambio y el cálculo. Por defecto 250. */
  get debounce(): number {
    const n = num(this.getAttribute("debounce"));
    return n !== undefined && n >= 0 ? n : 250;
  }
  set debounce(v: number) {
    this.#attr("debounce", String(v));
  }
  /** Idioma de números y montos («es-CO», «en-US»); sin él, el `lang` más cercano. */
  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(v: string | null | undefined) {
    this.#attr("locale", v);
  }
  /** Título arriba a la izquierda («Plan de compras 2027»). */
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string) {
    this.#attr("heading", v);
  }
  get labels(): WhatIfLabels {
    return this.#labels;
  }
  set labels(v: Partial<WhatIfLabels> | null | undefined) {
    this.#labels = cleanLabels(v, WHAT_IF_LABELS);
    if (this.#built) this.#build();
  }

  /** Vuelve a la base un supuesto (o todos, sin `id`). */
  reset(id?: string): void {
    this.#setMany(Object.fromEntries(this.#inputs.filter((i) => !id || i.id === id).map((i) => [i.id, i.value])));
  }
  /** Vuelve a pedir el cálculo ya. */
  recompute(): void {
    this.#request(0);
  }
  /** Guarda los supuestos y resultados de ahora como escenario (si hay un cálculo en curso, al terminar). */
  save(name?: string): void {
    const n = name?.trim() || fill(this.#labels.untitled, { n: this.#scenarios.length + 1 });
    if (this.#isBusy) this.#pending = n;
    else this.#doSave(n);
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
    this.#request(0);
  }

  disconnectedCallback(): void {
    this.#ctrl?.abort();
    this.#ctrl = undefined;
    clearTimeout(this.#timer);
    this.#timer = 0;
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "inputs" || name === "outputs" || name === "series" || name === "scenarios" || name === "labels") {
      try {
        (this as unknown as Record<string, unknown>)[name] = value === null ? null : JSON.parse(value);
      } catch {
        console.warn(`[nx-what-if] el atributo "${name}" no es JSON válido`);
      }
    } else if (name === "endpoint") this.#request(0);
    else if (this.#built) this.#build();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }
  get #fmt() {
    return nxFormat(resolveLocale(this));
  }
  #emit<T>(name: string, detail: T, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true, cancelable }));
  }

  #build(): void {
    this.#built = true;
    const L = this.#labels;
    const id = this.#uid;
    this.#title = h("h2", { class: "nx-what-if__title" }, this.heading);
    this.#title.hidden = !this.heading;
    this.#resetAll = btn("btn", L.resetAll, RESET, L.resetAll);
    this.#resetAll.addEventListener("click", () => {
      this.reset();
      this.#rows.values().next().value?.range.focus();
    });
    this.#saveBtn = btn("btn nx-what-if__btn--primary", L.save, SAVE, L.save);
    this.#saveBtn.addEventListener("click", () => this.#openForm(true));
    this.#name = h("input", { class: "nx-what-if__name", "aria-label": L.name, autocomplete: "off", maxlength: "60" });
    const cancel = h("button", { type: "button", class: "nx-what-if__btn" }, L.cancel);
    this.#form = h("form", { class: "nx-what-if__form" }, this.#name, h("button", { class: "nx-what-if__btn nx-what-if__btn--primary" }, L.ok), cancel);
    this.#form.hidden = true;
    this.#form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.#openForm(false);
      this.save(this.#name!.value);
    });
    cancel.addEventListener("click", () => this.#openForm(false));
    this.#form.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.#openForm(false);
      }
    });
    this.#list = h("div", { class: "nx-what-if__list" });
    this.#notesEl = h("div", { class: "nx-what-if__notes", role: "status" });
    this.#cardsEl = h("ul", { class: "nx-what-if__cards", role: "list" });
    this.#chartsEl = h("div", { class: "nx-what-if__charts" });
    this.#results = h(
      "section",
      { class: "nx-what-if__results", "aria-labelledby": `${id}-out` },
      h("h3", { class: "nx-what-if__h", id: `${id}-out` }, L.outputs),
      this.#notesEl,
      this.#cardsEl,
      this.#chartsEl,
    );
    this.#empty = h("p", { class: "nx-what-if__empty" }, L.empty);
    this.#wrap = h("div", { class: "nx-what-if__scroll", role: "region", tabindex: "0", "aria-labelledby": `${id}-cmp` });
    this.replaceChildren(
      h("div", { class: "nx-what-if__head" }, this.#title, h("div", { class: "nx-what-if__bar" }, this.#resetAll, this.#saveBtn, this.#form)),
      h(
        "div",
        { class: "nx-what-if__body" },
        h("section", { class: "nx-what-if__inputs", "aria-labelledby": `${id}-in` }, h("h3", { class: "nx-what-if__h", id: `${id}-in` }, L.inputs), this.#list),
        this.#results,
      ),
      h("section", { class: "nx-what-if__cmp" }, h("h3", { class: "nx-what-if__h", id: `${id}-cmp` }, L.scenarios), this.#empty, this.#wrap),
    );
    this.#cards.clear();
    this.#charts.clear();
    this.#shown.clear();
    this.#buildRows();
    this.#paintNotes();
  }

  #openForm(open: boolean): void {
    this.#form!.hidden = !open;
    this.#saveBtn!.hidden = open;
    if (open) {
      this.#name!.value = fill(this.#labels.untitled, { n: this.#scenarios.length + 1 });
      this.#name!.focus();
      this.#name!.select();
    } else this.#saveBtn!.focus();
  }

  // ---------------------------------------------------------------- supuestos

  #buildRows(): void {
    if (!this.#built) return;
    this.#rows.clear();
    const f = this.#fmt;
    const L = this.#labels;
    this.#list!.replaceChildren(
      ...this.#inputs.map((inp) => {
        const rid = `${this.#uid}-${inp.id}`;
        const range = h("input", { type: "range", id: rid, class: "nx-what-if__range", min: inp.min, max: inp.max, step: "any", "aria-describedby": inp.hint ? `${rid}-hint` : null });
        const big = h("button", { type: "button", class: "nx-what-if__big" });
        const type = h("input", { class: "nx-what-if__type", inputmode: "decimal", autocomplete: "off", "aria-label": fill(L.edit, { label: inp.label }) });
        type.hidden = true;
        const reset = btn("reset", fill(L.reset, { label: inp.label }), RESET);
        const fillEl = h("span", { class: "nx-what-if__fill" });
        const mark = h("span", { class: "nx-what-if__mark" });
        const row: Row = { el: h("div", { class: "nx-what-if__row" }), range, big, type, delta: h("span", { class: "nx-what-if__delta" }), reset, fill: fillEl, mark };
        row.el.append(
          h("div", { class: "nx-what-if__top" }, h("label", { class: "nx-what-if__label", for: rid }, inp.label), reset),
          h("div", { class: "nx-what-if__val" }, big, type, row.delta),
          h("div", { class: "nx-what-if__track" }, h("span", { class: "nx-what-if__rail" }, fillEl, mark), range),
          h("div", { class: "nx-what-if__scale", "aria-hidden": "true" }, h("span", null, valueText(inp.min, inp, f, true)), h("span", null, valueText(inp.max, inp, f, true))),
          inp.hint ? h("p", { class: "nx-what-if__hint", id: `${rid}-hint` }, inp.hint) : "",
        );
        range.addEventListener("input", () => this.#set(inp.id, snapValue(Number(range.value), inp)));
        range.addEventListener("keydown", (e) => {
          const v = stepValue(this.#values[inp.id], inp, e.key, e.shiftKey);
          if (v === null) return;
          e.preventDefault();
          this.#set(inp.id, v);
        });
        reset.addEventListener("click", () => {
          this.#set(inp.id, inp.value);
          range.focus();
        });
        big.addEventListener("click", () => this.#edit(row, inp, true));
        type.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            this.#edit(row, inp, false, e.key === "Enter");
          }
        });
        type.addEventListener("blur", () => this.#edit(row, inp, false, true, false));
        this.#rows.set(inp.id, row);
        this.#paintRow(inp);
        return row.el;
      }),
    );
    this.#queue();
  }

  /** Abre o cierra el campo para escribir el valor. Al cerrar con `commit`, lo aplica (recortado). */
  #edit(row: Row, inp: WhatIfInput, open: boolean, commit = false, refocus = true): void {
    if (open) {
      row.type.value = editText(this.#values[inp.id], inp, this.#fmt);
      row.big.hidden = true;
      row.type.hidden = false;
      row.type.focus();
      row.type.select();
      return;
    }
    if (row.type.hidden) return;
    const n = commit ? parseTyped(row.type.value, inp, this.#fmt) : null;
    row.type.hidden = true;
    row.big.hidden = false;
    if (n !== null) this.#set(inp.id, clampValue(n, inp));
    if (refocus) row.big.focus();
  }

  #set(id: string, v: number): void {
    const inp = this.#inputs.find((i) => i.id === id);
    if (!inp) return;
    v = clampValue(v, inp);
    if (this.#values[id] === v) return this.#paintRow(inp);
    this.#values[id] = v;
    this.#paintRow(inp);
    this.#request(this.debounce);
    this.#emit("nx-what-if-change", { id, inputs: this.values });
  }

  #setMany(v: WhatIfValues, delay = this.debounce): void {
    for (const inp of this.#inputs) {
      const n = num(v[inp.id]);
      if (n !== undefined) this.#values[inp.id] = clampValue(n, inp);
      this.#paintRow(inp);
    }
    this.#request(delay);
    this.#emit("nx-what-if-change", { id: null, inputs: this.values });
  }

  #paintRow(inp: WhatIfInput | undefined): void {
    const row = inp && this.#rows.get(inp.id);
    if (!row) return;
    const f = this.#fmt;
    const v = this.#values[inp.id];
    const moved = v !== inp.value;
    const text = valueText(v, inp, f);
    const delta = moved ? fill(this.#labels.vsBase, { delta: deltaText(v, inp.value, inp, f, this.#labels.points) }) : this.#labels.atBase;
    const at = (n: number) => (n - inp.min) / (inp.max - inp.min);
    row.range.value = String(v);
    row.range.setAttribute("aria-valuetext", moved ? `${text}, ${delta}` : text);
    row.big.textContent = text;
    row.big.setAttribute("aria-label", `${text}, ${fill(this.#labels.edit, { label: inp.label })}`);
    row.delta.textContent = delta;
    row.el.toggleAttribute("data-moved", moved);
    row.reset.hidden = !moved;
    row.el.style.setProperty("--lo", String(Math.min(at(v), at(inp.value))));
    row.el.style.setProperty("--hi", String(Math.max(at(v), at(inp.value))));
    row.el.style.setProperty("--b", String(at(inp.value)));
    this.#resetAll!.hidden = this.#inputs.every((i) => this.#values[i.id] === i.value);
    this.#queue();
  }

  // ---------------------------------------------------------------- cálculo

  /** Marca los resultados como viejos y pide el cálculo después de `delay` ms (cancela lo anterior). */
  #request(delay: number): void {
    if (!this.isConnected || !this.#built) return;
    clearTimeout(this.#timer);
    this.#busy(true);
    this.#timer = window.setTimeout(() => {
      this.#timer = 0;
      void this.#compute();
    }, delay);
  }

  #busy(on: boolean): void {
    this.#isBusy = on;
    this.#results?.toggleAttribute("data-busy", on);
    this.#results?.setAttribute("aria-busy", String(on));
  }

  async #compute(): Promise<void> {
    this.#ctrl?.abort();
    this.#ctrl = undefined;
    const inputs = this.values;
    const run: Run = { seq: ++this.#seq, atBase: this.#inputs.every((i) => inputs[i.id] === i.value), notes: [] };
    const url = safeEndpoint(this.endpoint);
    if (!url) {
      let answered = false;
      const respond = (evs: unknown[]) => {
        answered = true;
        for (const x of Array.isArray(evs) ? evs : []) {
          const ev = cleanEvent(x);
          if (ev) this.#apply(run, ev);
        }
        this.#finish(run);
      };
      const free = this.#emit("nx-what-if-compute", { inputs, respond }, true);
      // Nadie calcula (ni ahora ni después, con `preventDefault()`): no se queda «cargando».
      if (!answered && free) this.#busy(false);
      return;
    }
    const ctrl = (this.#ctrl = new AbortController());
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/x-ndjson, text/event-stream", "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ inputs }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readLines(res, (line) => {
        // Otro cálculo tomó su lugar (o terminó con `done`): se deja de leer y se suelta la conexión.
        if (ctrl.signal.aborted || run.done) return false;
        const ev = parseEvent(lineData(line));
        if (ev) this.#apply(run, ev);
        if (run.done) return false;
      });
    } catch {
      if (ctrl.signal.aborted) return;
      run.failed = true;
    }
    if (!ctrl.signal.aborted) this.#finish(run);
  }

  #apply(run: Run, ev: WhatIfEvent): void {
    if (run.seq !== this.#seq || run.done) return;
    if (ev.type === "metric") {
      const { type: _, ...m } = ev;
      const i = this.#metrics.findIndex((x) => x.id === m.id);
      const next = mergeMetric(this.#metrics[i], m);
      // Sin `base` en el evento, la da un cálculo con todo en la base.
      if (m.base === undefined && run.atBase && m.value !== undefined) next.base = m.value;
      if (i < 0) this.#metrics.push(next);
      else this.#metrics[i] = next;
    } else if (ev.type === "series") {
      const { type: _, ...s } = ev;
      const i = this.#series.findIndex((x) => x.id === s.id);
      // Sin `base` en los puntos: la del cálculo en la base, que se conserva en los siguientes.
      s.points.forEach((p, k) => (p.base ??= run.atBase ? p.value : this.#series[i]?.points[k]?.base));
      if (i < 0) this.#series.push(s);
      else this.#series[i] = s;
    } else if (ev.type === "note") run.notes.push({ message: ev.message, tone: ev.tone });
    else if (ev.type === "error") run.notes.push({ message: ev.message, tone: "danger" }), (run.failed = true);
    else return this.#finish(run);
    this.#queue();
  }

  #finish(run: Run): void {
    if (run.done || run.seq !== this.#seq) return;
    run.done = true;
    this.#ctrl = undefined;
    this.#notes = run.notes;
    this.#failed = !!run.failed;
    if (this.#timer) return; // ya hay otro cálculo esperando
    this.#busy(false);
    this.#paintNotes();
    this.#queue();
    if (this.#pending !== null) {
      const n = this.#pending;
      this.#pending = null;
      this.#doSave(n);
    }
  }

  // ---------------------------------------------------------------- resultados

  /** Varios eventos seguidos se pintan una sola vez. */
  #queue(): void {
    if (this.#queued || !this.#built) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#paintCards();
      this.#paintCharts();
      this.#paintTable();
    });
  }

  #paintNotes(): void {
    const L = this.#labels;
    const notes = this.#failed && !this.#notes.some((n) => n.tone === "danger") ? [...this.#notes, { message: L.error, tone: "danger" as const }] : this.#notes;
    this.#notesEl!.replaceChildren(
      ...notes.map((n) => {
        const p = h("p", { class: "nx-what-if__note", "data-tone": n.tone }, glyph(n.tone === "warning" || n.tone === "danger" ? WARN : INFO), h("span", null, n.message));
        if (n.tone === "danger" && this.#failed) {
          const retry = h("button", { type: "button", class: "nx-what-if__retry" }, L.retry);
          retry.addEventListener("click", () => this.recompute());
          p.append(retry);
        }
        return p;
      }),
    );
  }

  #paintCards(): void {
    const f = this.#fmt;
    const L = this.#labels;
    const now = performance.now();
    for (const m of this.#metrics) {
      let c = this.#cards.get(m.id);
      if (!c) {
        c = { el: h("li", { class: "nx-what-if__card" }), label: h("p", { class: "nx-what-if__mlabel" }), num: h("p", { class: "nx-what-if__num" }), chip: h("span", { class: "nx-what-if__chip" }), base: h("span", { class: "nx-what-if__base" }) };
        c.el.append(c.label, c.num, h("p", { class: "nx-what-if__foot" }, c.chip, c.base));
        this.#cards.set(m.id, c);
        this.#cardsEl!.append(c.el);
      }
      const tone = toneOf(m.value, m.base, m.better);
      c.el.dataset.tone = tone;
      c.label.textContent = m.label;
      c.base.textContent = m.base === undefined ? "" : `${L.base} ${valueText(m.base, m, f, true)}`;
      c.chip.textContent = m.value === undefined || m.base === undefined ? "" : tone === "flat" ? "" : deltaText(m.value, m.base, m, f, L.points, true);
      c.chip.hidden = !c.chip.textContent;
      const from = this.#shown.get(m.id);
      const to = m.value;
      if (to === undefined || from === undefined || reduced()) {
        if (to !== undefined) this.#shown.set(m.id, to);
        this.#tweens.delete(m.id);
        c.num.textContent = valueText(to, m, f, true);
      } else if (from !== to && this.#tweens.get(m.id)?.to !== to) this.#tweens.set(m.id, { from, to, t0: now });
    }
    if (this.#tweens.size && !this.#raf) this.#raf = requestAnimationFrame((t) => this.#tick(t));
  }

  /** Un cuadro de la animación de los números (ease-out cúbico). */
  #tick(t: number): void {
    this.#raf = 0;
    const f = this.#fmt;
    for (const [id, tw] of this.#tweens) {
      const m = this.#metrics.find((x) => x.id === id);
      const c = this.#cards.get(id);
      if (!m || !c) {
        this.#tweens.delete(id);
        continue;
      }
      const p = Math.min(1, Math.max(0, (t - tw.t0) / TWEEN_MS));
      const v = p >= 1 ? tw.to : tw.from + (tw.to - tw.from) * (1 - (1 - p) ** 3);
      this.#shown.set(id, v);
      c.num.textContent = valueText(v, m, f, true);
      if (p >= 1) this.#tweens.delete(id);
    }
    if (this.#tweens.size) this.#raf = requestAnimationFrame((t) => this.#tick(t));
  }

  #paintCharts(): void {
    const f = this.#fmt;
    const L = this.#labels;
    for (const s of this.#series) {
      let c = this.#charts.get(s.id);
      if (!c) {
        const plot = svg("svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", "aria-hidden": "true", focusable: "false" });
        c = {
          el: h("figure", { class: "nx-what-if__chart" }),
          cap: h("span"),
          hi: h("span"),
          lo: h("span"),
          zero: svg("line", { class: "nx-what-if__zero", x1: "0", x2: String(W) }),
          gap: svg("path", { class: "nx-what-if__gap" }),
          base: svg("path", { class: "nx-what-if__lbase" }),
          value: svg("path", { class: "nx-what-if__lvalue" }),
          xs: h("div", { class: "nx-what-if__x", "aria-hidden": "true" }),
          table: h("table", { class: "nx-what-if__vh" }),
        };
        plot.append(c.zero, c.gap, c.base, c.value);
        c.el.append(
          h("figcaption", { class: "nx-what-if__cap" }, c.cap, h("span", { class: "nx-what-if__legend", "aria-hidden": "true" }, h("i", { class: "is-base" }), L.base, h("i"), L.scenario)),
          h("div", { class: "nx-what-if__plot" }, h("div", { class: "nx-what-if__y", "aria-hidden": "true" }, c.hi, c.lo), plot, h("span"), c.xs),
          c.table,
        );
        this.#charts.set(s.id, c);
        this.#chartsEl!.append(c.el);
      }
      const p = chartPaths(s.points, W, H);
      c.cap.textContent = s.label;
      c.hi.textContent = valueText(p.hi, s, f, true);
      c.lo.textContent = valueText(p.lo, s, f, true);
      c.value.setAttribute("d", p.value);
      c.base.setAttribute("d", p.base);
      c.gap.setAttribute("d", p.gap);
      c.zero.style.display = p.zero === undefined ? "none" : "";
      if (p.zero !== undefined) c.zero.setAttribute("y1", String(p.zero)), c.zero.setAttribute("y2", String(p.zero));
      c.xs.replaceChildren(...s.points.map((pt) => h("span", null, pt.x)));
      // Para el lector de pantalla, los mismos datos en una tabla (oculta a la vista).
      c.table.replaceChildren(
        h("caption", null, s.label),
        h("tr", null, h("td"), h("th", { scope: "col" }, L.base), h("th", { scope: "col" }, L.scenario)),
        ...s.points.map((pt) => h("tr", null, h("th", { scope: "row" }, pt.x), h("td", null, valueText(pt.base, s, f)), h("td", null, valueText(pt.value, s, f)))),
      );
    }
  }

  // ---------------------------------------------------------------- escenarios

  #doSave(name: string): void {
    const scenario: WhatIfScenario = {
      id: `s${Date.now().toString(36)}${this.#seq}`,
      name,
      inputs: this.values,
      outputs: Object.fromEntries(this.#metrics.flatMap((m) => (m.value === undefined ? [] : [[m.id, m.value]]))),
    };
    this.#change("save", scenario, [...this.#scenarios, scenario]);
  }

  /** Emite `nx-what-if-save` (cancelable) y, si nadie lo cancela, aplica la lista nueva. */
  #change(action: WhatIfSaveDetail["action"], scenario: WhatIfScenario, scenarios: WhatIfScenario[]): void {
    if (this.#emit<WhatIfSaveDetail>("nx-what-if-save", { action, scenario, scenarios }, true)) this.#scenarios = scenarios;
    this.#paintTable();
  }

  #load(s: WhatIfScenario): void {
    // Lo guardado se ve ya; el cálculo lo confirma enseguida.
    for (const m of this.#metrics) if (s.outputs[m.id] !== undefined) m.value = s.outputs[m.id];
    this.#setMany(s.inputs, 0);
  }

  #paintTable(): void {
    if (!this.#built) return;
    const f = this.#fmt;
    const L = this.#labels;
    const ids = this.#inputs.map((i) => i.id);
    const base = this.#inputs.every((i) => this.#values[i.id] === i.value);
    const match = this.#scenarios.find((s) => sameValues(s.inputs, this.#values, ids));
    type Col = { s?: WhatIfScenario; name: string; inputs: WhatIfValues; outputs: Record<string, number | undefined> };
    const cols: Col[] = [
      { name: L.base, inputs: Object.fromEntries(this.#inputs.map((i) => [i.id, i.value])), outputs: Object.fromEntries(this.#metrics.map((m) => [m.id, m.base])) },
      ...(base || match ? [] : [{ name: L.current, inputs: this.#values, outputs: Object.fromEntries(this.#metrics.map((m) => [m.id, m.value])) }]),
      ...this.#scenarios.map((s) => ({ s, name: s.name, inputs: s.inputs, outputs: s.outputs })),
    ];
    this.#empty!.hidden = !!this.#scenarios.length;
    const active = document.activeElement as HTMLElement | null;
    const key = active && this.contains(active) ? active.dataset.f : undefined;
    const act = (s: WhatIfScenario, k: string, label: string, g: string, run: () => void) => {
      const b = btn("act", fill(label, { name: s.name }), g);
      b.dataset.f = `${k}:${s.id}`;
      b.addEventListener("click", run);
      return b;
    };
    const head = cols.map((c, i) => {
      const s = c.s;
      if (!s) return h("th", { scope: "col", class: i ? "is-current" : null }, c.name);
      if (this.#renaming === s.id) {
        const inp = h("input", { class: "nx-what-if__name", value: this.#renameText, "aria-label": fill(L.rename, { name: s.name }), maxlength: "60" });
        inp.dataset.f = `name:${s.id}`;
        const done = (ok: boolean) => {
          if (this.#renaming !== s.id) return;
          this.#renaming = null;
          const name = inp.value.trim();
          if (ok && name && name !== s.name) {
            const next = { ...s, name };
            this.#change("rename", next, this.#scenarios.map((x) => (x.id === s.id ? next : x)));
          } else this.#paintTable();
          this.#focusF(`ren:${s.id}`);
        };
        inp.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            done(e.key === "Enter");
          }
        });
        inp.addEventListener("input", () => (this.#renameText = inp.value));
        inp.addEventListener("blur", () => done(true));
        queueMicrotask(() => (inp.focus(), inp.select()));
        return h("th", { scope: "col" }, inp);
      }
      return h(
        "th",
        { scope: "col", class: s === match ? "is-active" : null, "aria-current": s === match ? "true" : null },
        h("span", { class: "nx-what-if__sname" }, s.name),
        h(
          "span",
          { class: "nx-what-if__acts" },
          act(s, "load", L.load, LOAD, () => this.#load(s)),
          act(s, "ren", L.rename, PEN, () => {
            this.#renaming = s.id;
            this.#renameText = s.name;
            this.#paintTable();
          }),
          act(s, "del", L.remove, TRASH, () => {
            const rest = this.#scenarios.filter((x) => x !== s);
            const i = this.#scenarios.indexOf(s);
            this.#change("delete", s, rest);
            const near = this.#scenarios[i] ?? this.#scenarios[i - 1];
            if (near) this.#focusF(`del:${near.id}`);
            else this.#wrap!.focus();
          }),
        ),
      );
    });
    const group = (text: string) => h("tr", { class: "nx-what-if__group" }, h("th", { scope: "colgroup", colspan: cols.length + 1 }, text));
    const rows = [
      group(L.inputs),
      ...this.#inputs.map((inp) => h("tr", null, h("th", { scope: "row" }, inp.label), ...cols.map((c, i) => h("td", { class: i && c.inputs[inp.id] !== inp.value ? "is-moved" : null }, valueText(c.inputs[inp.id], inp, f, true))))),
      group(L.outputs),
      ...this.#metrics.map((m) => {
        const best = bestOf(cols.map((c) => c.outputs[m.id]), m.better);
        return h(
          "tr",
          null,
          h("th", { scope: "row" }, m.label),
          ...cols.map((c, i) => (best.includes(i) ? h("td", { class: "is-best" }, valueText(c.outputs[m.id], m, f, true), h("span", { class: "nx-what-if__vh" }, ` (${L.best})`)) : h("td", null, valueText(c.outputs[m.id], m, f, true)))),
        );
      }),
    ];
    this.#wrap!.replaceChildren(h("table", { class: "nx-what-if__table" }, h("thead", null, h("tr", null, h("td"), ...head)), h("tbody", null, ...rows)));
    if (key) this.#focusF(key);
  }

  /** Enfoca el control de la tabla con esa clave (`load:<id>`, `ren:<id>`…), si existe. */
  #focusF(key: string): void {
    [...this.#wrap!.querySelectorAll<HTMLElement>("[data-f]")].find((el) => el.dataset.f === key)?.focus();
  }
}
