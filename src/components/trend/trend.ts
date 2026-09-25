/**
 * `<nx-trend>`: un gráfico de líneas o barras que se explica. Series de tiempo de un ERP (ventas,
 * costos, inventario) en SVG propio: ejes legibles, una línea vertical que sigue al puntero (o a
 * las flechas) con todas las series en ese periodo, anomalías con un anillo que late, y la
 * pregunta que importa: clic (o Enter) en un punto → «¿Por qué sube Materia prima en agosto?»,
 * contestada en streaming por el `explain-endpoint` en un popover anclado al punto.
 *
 * Accesible sin trucos: el SVG es una imagen con un resumen generado («Ventas: sube 11 % de julio
 * a agosto; máximo en agosto»), cada punto es un botón (un solo Tab; las flechas recorren), hay una
 * tabla equivalente («Ver como tabla») y las series se distinguen también por la forma del marcador.
 * `<nx-ai-answer>` se carga con `import()` la primera vez que se pregunta.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import { extent } from "../../core/time";
import { change, cleanAnomalies, cleanSeries, explainContext, flagsOf, niceTicks, pctText, periodLabel, periodsOf, summarize, trendStep, whyQuestion } from "./logic";
import type { TrendAnomaly, TrendFlag, TrendFormat, TrendKind, TrendLabels, TrendSeries } from "./types";

export const TREND_LABELS: TrendLabels = {
  chart: "Gráfico",
  hint: "Flechas ← → recorren los periodos y ↑ ↓ cambian de serie; Enter pregunta por qué.",
  table: "Ver como tabla",
  chartView: "Ver como gráfico",
  period: "Periodo",
  empty: "Sin datos para mostrar",
  why: "¿Por qué {dir} {label} en {period}?",
  whyFlat: "¿Qué explica {label} en {period}?",
  up: "sube",
  down: "baja",
  flat: "se mantiene",
  summary: "{label}: {change} de {from} a {to}; máximo en {max}",
  change: "{dir} {pct}",
  outlier: "{label} fuera de lo normal en {period} ({delta} vs. la media)",
  anomaly: "anomalía",
  versus: "vs. {period}",
  close: "Cerrar",
  ask: "Clic: ¿por qué?",
};

const NS = "http://www.w3.org/2000/svg";
/** Una forma por serie (además del color): círculo, cuadrado, rombo, triángulo, triángulo invertido. */
const SHAPES: [number, number, string][] = [[-4, 0, "a4 4 0 1 0 8 0a4 4 0 1 0-8 0"], [-3.5, -3.5, "h7v7h-7z"], [0, -5, "l5 5-5 5-5-5z"], [0, -5, "l4.6 8.5h-9.2z"], [0, 5, "l4.6-8.5h-9.2z"]];
/** La forma de la serie `i` centrada en (x, y), en coordenadas absolutas (sin \`transform\`, para
 *  que la escala del resaltado sea desde su centro). */
const shape = (i: number, x = 0, y = 0) => {
  const [dx, dy, d] = SHAPES[i % SHAPES.length];
  return `M${r1(x + dx)} ${r1(y + dy)}${d}`;
};
const PROPS = ["series", "anomalies", "labels", "heading", "format", "currency", "kind", "height", "detect", "explainEndpoint", "busy", "locale"] as const;

type Attrs = Record<string, string | number | null | undefined | false>;
/** Un nodo SVG (los textos, siempre como nodos de texto). */
const s = (tag: string, attrs: Attrs = {}, ...kids: (Node | string)[]): SVGElement => {
  const el = document.createElementNS(NS, tag) as SVGElement;
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined && v !== false) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Una barra con la punta redondeada (4 px) y la base recta, hacia arriba o hacia abajo. */
const barPath = (x: number, w: number, y0: number, y1: number) => {
  const r = Math.min(4, w / 2, Math.abs(y1 - y0));
  const d = y1 < y0 ? 1 : -1;
  return `M${r1(x)} ${r1(y0)}V${r1(y1 + d * r)}Q${r1(x)} ${r1(y1)} ${r1(x + r)} ${r1(y1)}H${r1(x + w - r)}Q${r1(x + w)} ${r1(y1)} ${r1(x + w)} ${r1(y1 + d * r)}V${r1(y0)}Z`;
};
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let uid = 0;

/** Lo que se dibujó: dónde está cada punto, para el puntero, el teclado y el popover. */
type Geo = { L: number; R: number; T: number; B: number; band: number; y: (v: number) => number; cx: (i: number) => number };
type Pt = { si: number; pi: number; xi: number; x: number; y: number; bar?: [number, number] };

export class NxTrend extends Base {
  static observedAttributes = ["series", "anomalies", "labels", "heading", "format", "currency", "kind", "height", "detect", "explain-endpoint", "locale", "busy"];

  #uid = `nx-trend${++uid}`;
  #series: TrendSeries[] = [];
  #anomalies: TrendAnomaly[] = [];
  #labels: TrendLabels = TREND_LABELS;
  #hidden = new Set<string>();
  #flags: TrendFlag[] = [];
  #periods: string[] = [];
  #pts: Pt[] = [];
  /** Las marcas del SVG por periodo (para resaltar la columna sin recorrer todo el SVG). */
  #marks: SVGElement[][] = [];
  #on: SVGElement[] = [];
  /** Los listeners de `window` que pone el popover abierto (para quitarlos también al desconectar). */
  #unplace?: () => void;
  #geo?: Geo;
  #at = -1;
  #tab = "";
  #table = false;
  #enter = true;
  #width = 0;
  #built = false;
  #ro?: ResizeObserver;
  #bar?: HTMLElement;
  #legend?: HTMLElement;
  #view?: HTMLButtonElement;
  #plot?: HTMLElement;
  #svg?: SVGSVGElement;
  #layer?: HTMLElement;
  #tip?: HTMLElement;
  #cross?: SVGElement;
  #sum?: HTMLElement;
  #wrap?: HTMLElement;
  #card?: HTMLElement;
  #anchor?: HTMLElement;
  #was?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** Las series: `{id, label, points: {x, y}[], format?, currency?, kind?, muted?, hidden?}`. */
  get series(): TrendSeries[] {
    return this.#series;
  }
  set series(v: TrendSeries[] | null | undefined) {
    this.#series = cleanSeries(v);
    this.#hidden = new Set(this.#series.filter((x) => x.hidden).map((x) => x.id));
    this.#enter = true;
    this.#render();
  }
  /** Puntos fuera de lo normal: `{series, x, label?}`. */
  get anomalies(): TrendAnomaly[] {
    return this.#anomalies;
  }
  set anomalies(v: TrendAnomaly[] | null | undefined) {
    this.#anomalies = cleanAnomalies(v);
    this.#render();
  }
  get labels(): TrendLabels {
    return this.#labels;
  }
  set labels(v: Partial<TrendLabels> | null | undefined) {
    this.#labels = mergeLabels(TREND_LABELS, v);
    this.#render();
  }
  /** Idioma de fechas y números («es-CO», «en-US»); sin él, el `lang` más cercano. */
  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(v: string | null | undefined) {
    this.#attr("locale", v);
  }
  /** Título del gráfico (y su nombre accesible). */
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string) {
    this.#attr("heading", v);
  }
  /** Formato por defecto de los valores: `number` (por defecto), `money` o `percent`. */
  get format(): TrendFormat {
    const f = this.getAttribute("format");
    return f === "money" || f === "percent" ? f : "number";
  }
  set format(v: TrendFormat) {
    this.#attr("format", v);
  }
  /** Moneda por defecto con `money`: ISO («COP») o un símbolo. */
  get currency(): string | undefined {
    return this.getAttribute("currency") ?? undefined;
  }
  set currency(v: string | undefined) {
    this.#attr("currency", v);
  }
  /** Tipo por defecto de las series: `line` (por defecto) o `bar`. */
  get kind(): TrendKind {
    return this.getAttribute("kind") === "bar" ? "bar" : "line";
  }
  set kind(v: TrendKind) {
    this.#attr("kind", v);
  }
  /** Alto del gráfico en px, con el eje x (260). */
  get height(): number {
    const n = Number(this.getAttribute("height"));
    return n >= 120 ? n : 260;
  }
  set height(v: number) {
    this.#attr("height", String(v));
  }
  /** Detección automática de anomalías: cuántas desviaciones robustas respecto a la media móvil
   *  (el atributo sin valor es 3). `0` la apaga. */
  get detect(): number {
    const v = this.getAttribute("detect");
    if (v === null || v === "false") return 0;
    const n = Number(v);
    return v === "" || v === "true" || !(n >= 0) ? 3 : n;
  }
  set detect(v: number | boolean) {
    if (v === true) this.setAttribute("detect", "");
    else this.#attr("detect", v ? String(v) : null);
  }
  /** URL del protocolo de IA que contesta «¿por qué?» (POST `{question, context}`). Solo del mismo
   *  origen (o uno de `allowOrigins`): el contexto del gráfico no viaja a un tercero. */
  get explainEndpoint(): string | null {
    return this.getAttribute("explain-endpoint");
  }
  set explainEndpoint(v: string | null) {
    this.#attr("explain-endpoint", v);
  }
  /** Cargando: el gráfico en espera. */
  get busy(): boolean {
    return boolAttr(this, "busy");
  }
  set busy(v: boolean) {
    this.toggleAttribute("busy", !!v);
  }
  /** Las anomalías que se ven (las dadas y las detectadas), con su apartamiento de la media. */
  get flags(): TrendFlag[] {
    return [...this.#flags];
  }
  /** El resumen que se lee en voz alta. */
  get summary(): string {
    return summarize(this.#visible(), this.#flags, this.#labels, resolveLocale(this));
  }

  /** Pregunta «¿por qué?» por el punto `x` de la serie `id` (con la pregunta por defecto o `question`). */
  explain(id: string, x: string, question?: string): void {
    const si = this.#series.findIndex((q) => q.id === id);
    const pi = si < 0 ? -1 : this.#series[si].points.findIndex((p) => p.x === x);
    if (pi >= 0) void this.#why(si, pi, question);
  }
  /** Cierra el popover de «¿por qué?». */
  close(): void {
    this.#card?.hidePopover?.();
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
    this.#render();
    if (typeof ResizeObserver !== "undefined") {
      this.#ro ??= new ResizeObserver(() => this.#plot!.clientWidth !== this.#width && this.#draw());
      this.#ro.observe(this.#plot!);
    }
  }

  disconnectedCallback(): void {
    this.#ro?.disconnect();
    // Quitar un popover abierto no dispara `toggle`: sus listeners de `window` se quitan aquí.
    this.#unplace?.();
    this.#card?.remove();
    this.#card = undefined;
    this.#anchor = undefined;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "series" || name === "anomalies" || name === "labels") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-trend] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    this.#render();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }
  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(`nx-trend-${type}`, { detail, bubbles: true, composed: true, cancelable }));
  }
  #visible(): TrendSeries[] {
    return this.#series.filter((x) => !this.#hidden.has(x.id));
  }
  /** El color de una serie sale de su lugar en `series` (no de las que se ven): ocultar otra no la repinta. */
  #slot(x: TrendSeries): string {
    if (x.muted) return "m";
    return String((this.#series.filter((q) => !q.muted).indexOf(x) % 8) + 1);
  }
  #kind(x: TrendSeries): TrendKind {
    return x.kind ?? this.kind;
  }
  #fmt(x: TrendSeries, v: number, short = false): string {
    const f = nxFormat(resolveLocale(this));
    const format = x.format ?? this.format;
    if (format === "percent") return pctText(v, f.locale, false);
    if (format === "money") return f.money(v, { currency: x.currency ?? this.currency }, short);
    return short ? f.compact(v) : f.number(v);
  }

  #build(): void {
    this.#built = true;
    this.#legend = h("div", { class: "nx-trend__legend", role: "group" });
    this.#view = h("button", { type: "button", class: "nx-trend__view", "aria-pressed": "false" });
    this.#bar = h("div", { class: "nx-trend__top" }, h("h3", { class: "nx-trend__heading", id: `${this.#uid}-h` }), this.#legend, this.#view);
    this.#svg = s("svg", { class: "nx-trend__svg", role: "img" }) as SVGSVGElement;
    this.#layer = h("div", { class: "nx-trend__points", role: "group", "aria-describedby": `${this.#uid}-hint` });
    this.#tip = h("div", { class: "nx-trend__tip", "aria-hidden": "true", hidden: true });
    this.#plot = h("div", { class: "nx-trend__plot" }, this.#svg, this.#layer, this.#tip);
    this.#sum = h("p", { class: "nx-trend__summary", "aria-hidden": "true" });
    this.#wrap = h("div", { class: "nx-trend__table", tabindex: "-1" });
    this.append(this.#bar, this.#plot, this.#sum, this.#wrap, h("p", { class: "nx-trend__sr", id: `${this.#uid}-hint` }));

    this.#legend.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-id]");
      if (!b) return;
      const id = b.dataset.id!;
      const on = this.#hidden.has(id);
      // La última serie visible no se oculta: el gráfico no se queda vacío por un clic.
      if (!on && this.#visible().length < 2) return;
      if (on) this.#hidden.delete(id);
      else this.#hidden.add(id);
      this.#render();
      this.#legend!.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
      this.#emit("toggle", { id, visible: on });
    });
    this.#view.addEventListener("click", () => {
      this.#table = !this.#table;
      this.#render();
    });
    const plot = this.#plot;
    plot.addEventListener("pointermove", (e) => {
      const g = this.#geo;
      if (!g || e.pointerType === "touch") return;
      const r = plot.getBoundingClientRect();
      const i = Math.floor((e.clientX - r.left - g.L) / g.band);
      this.#hover(i >= 0 && i < this.#periods.length ? i : -1, e.clientY - r.top);
    });
    plot.addEventListener("pointerleave", () => !this.#layer!.contains(document.activeElement) && this.#hover(-1));
    plot.addEventListener("pointerdown", () => (this.#was = this.#anchor));
    plot.addEventListener("click", (e) => this.#click(e));
    this.#layer.addEventListener("keydown", (e) => this.#key(e));
    this.#layer.addEventListener("focusin", (e) => {
      const pt = this.#ptOf(e.target as Element);
      if (!pt) return;
      this.#tab = `${pt.si}:${pt.pi}`;
      for (const b of this.#layer!.children) (b as HTMLElement).tabIndex = b === e.target ? 0 : -1;
      this.#hover(pt.xi, pt.y);
    });
    this.#layer.addEventListener("focusout", (e) => !this.#layer!.contains(e.relatedTarget as Node) && this.#hover(-1));
  }

  #ptOf(el: Element | null): Pt | undefined {
    const b = el?.closest?.<HTMLElement>(".nx-trend__pt");
    return b ? this.#pts[Number(b.dataset.k)] : undefined;
  }

  // ---------------------------------------------------------------- pintado

  #render(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const loc = resolveLocale(this);
    const vis = this.#visible();
    this.#periods = periodsOf(this.#series);
    this.#flags = flagsOf(vis, this.#anomalies, this.detect);
    const head = this.#bar!.firstElementChild as HTMLElement;
    head.textContent = this.heading;
    head.hidden = !this.heading;
    const name = this.heading || L.chart;
    this.setAttribute("role", "figure");
    this.setAttribute("aria-label", name);
    this.#legend!.setAttribute("aria-label", name);
    this.#layer!.setAttribute("aria-label", name);
    this.#layer!.hidden = this.busy;
    this.#plot!.setAttribute("aria-busy", String(this.busy));
    this.#plot!.style.blockSize = `${this.height}px`;
    this.lastElementChild!.textContent = L.hint;
    this.toggleAttribute("data-table", this.#table);
    this.#view!.setAttribute("aria-pressed", String(this.#table));
    this.#view!.textContent = this.#table ? L.chartView : L.table;
    this.#view!.hidden = !this.#series.length;

    // Leyenda (con dos o más series): botones que muestran y ocultan, con la misma marca del gráfico.
    this.#legend!.hidden = this.#series.length < 2;
    this.#legend!.replaceChildren(
      ...this.#series.map((x) => {
        const on = !this.#hidden.has(x.id);
        return h(
          "button",
          { type: "button", class: "nx-trend__key", "data-id": x.id, "data-slot": this.#slot(x), "aria-pressed": String(on) },
          this.#mark(x, this.#series.indexOf(x)),
          x.label,
        );
      }),
    );

    const text = this.summary;
    this.#sum!.textContent = text;
    this.#svg!.setAttribute("aria-label", text ? `${name}. ${text}` : name);
    this.#table_(loc);
    this.#draw();
  }

  /** La marca de una serie en la leyenda y el tooltip: una línea con su forma, o un bloque. */
  #mark(x: TrendSeries, i: number): SVGElement {
    const bar = this.#kind(x) === "bar";
    return s(
      "svg",
      { class: "nx-trend__swatch", viewBox: "-8 -6 16 12", "aria-hidden": "true", "data-slot": this.#slot(x) },
      bar ? s("rect", { x: -5, y: -5, width: 10, height: 10, rx: 2 }) : s("path", { d: "M-8 0H8", class: "nx-trend__kl" }),
      bar ? "" : s("path", { d: shape(i), class: "nx-trend__km" }),
    );
  }

  /** La tabla equivalente: un periodo por fila, una serie por columna, las anomalías dichas. */
  #table_(loc: string): void {
    const L = this.#labels;
    const vis = this.#visible();
    // Por periodo, sin buscar en cada celda (miles de periodos × series era cuadrático).
    const at = vis.map((q) => new Map(q.points.map((p) => [p.x, p])));
    const flags = new Map(this.#flags.map((f) => [`${f.series}\u0000${f.x}`, f]));
    const rows = this.#periods.map((x) =>
      h(
        "tr",
        null,
        h("th", { scope: "row" }, periodLabel(x, loc, "full")),
        ...vis.map((q, qi) => {
          const p = at[qi].get(x);
          const flag = flags.get(`${q.id}\u0000${x}`);
          return h("td", flag ? { "data-flag": "" } : null, p?.y == null ? "—" : this.#fmt(q, p.y), flag ? h("small", null, ` · ${flag.label ?? L.anomaly}`) : null);
        }),
      ),
    );
    this.#wrap!.replaceChildren(
      h(
        "table",
        null,
        h("caption", null, this.heading || L.chart),
        h("thead", null, h("tr", null, h("th", { scope: "col" }, L.period), ...vis.map((q) => h("th", { scope: "col" }, q.label)))),
        h("tbody", null, ...rows),
      ),
    );
  }

  /** Dibuja el SVG al ancho actual. Solo lo que depende del tamaño: se llama también al redimensionar. */
  #draw(): void {
    const svg = this.#svg!;
    const plot = this.#plot!;
    const W = (this.#width = plot.clientWidth) || 600;
    const H = this.height;
    const loc = resolveLocale(this);
    const vis = this.#visible();
    const P = this.#periods;
    const n = P.length;
    this.#pts = [];
    this.#marks = [];
    this.#on = [];
    this.#at = -1;
    this.#tip!.hidden = true;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    if (!n || this.busy) {
      svg.replaceChildren(this.busy ? "" : s("text", { x: W / 2, y: H / 2, class: "nx-trend__empty", "text-anchor": "middle" }, this.#labels.empty));
      this.#layer!.replaceChildren();
      return;
    }

    // Escalas: el eje y sale de lo que se ve (desde cero si hay barras); el x, de todos los periodos.
    // Sin `Math.min(...vals)`: con ~120 000 valores lanza `RangeError`.
    const ext = extent((function* () {
      for (const q of vis) for (const p of q.points) if (p.y !== null) yield p.y;
    })()) ?? [Infinity, -Infinity];
    const bars = vis.filter((q) => this.#kind(q) === "bar");
    const lines = vis.filter((q) => this.#kind(q) === "line");
    const ticks = niceTicks(ext[0], ext[1], H < 200 ? 3 : 5, bars.length > 0);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const ref = vis[0];
    const tickText = (v: number) => ((ref.format ?? this.format) === "percent" ? pctText(v, loc, false) : nxFormat(loc).compact(v));
    const month = !/-\d{2}-/.test(P[0]);
    const years = month && new Set(P.map((x) => x.slice(0, 4))).size > 1;
    const ends = W >= 520 && lines.length > 0 && lines.length <= 4;
    const T = 22;
    const B = years ? 40 : 28;
    const Lm = Math.max(...ticks.map((t) => tickText(t).length)) * 6.6 + 14;
    const Rm = ends ? 62 : 14;
    const band = (W - Lm - Rm) / n;
    // A la mitad, para que `hi − lo` no desborde con valores cerca de ±1e308.
    const y = (v: number) => T + (1 - (v / 2 - lo / 2) / (hi / 2 - lo / 2 || 1)) * (H - T - B);
    const xi = new Map(P.map((x, i) => [x, i]));
    const cx = (i: number) => Lm + band * (i + 0.5);
    this.#geo = { L: Lm, R: Rm, T, B, band, y, cx };
    const kids: SVGElement[] = [];

    // Cuadrícula (líneas finas, recesivas) y eje y.
    for (const t of ticks) {
      kids.push(s("line", { x1: Lm, x2: W - Rm, y1: r1(y(t)), y2: r1(y(t)), class: t === 0 || t === lo ? "nx-trend__base" : "nx-trend__grid" }));
      kids.push(s("text", { x: Lm - 8, y: r1(y(t)), class: "nx-trend__tick", "text-anchor": "end", dy: "0.32em" }, tickText(t)));
    }
    // Eje x: los que caben, con el año debajo del primero y de cada enero.
    const every = Math.ceil((month ? 34 : 46) / band);
    P.forEach((x, i) => {
      if (i % every) return;
      const yr = years && (i === 0 || x.endsWith("-01"));
      kids.push(s("text", { x: r1(cx(i)), y: H - B + 18, class: "nx-trend__tick", "text-anchor": "middle" }, periodLabel(x, loc), yr ? s("tspan", { x: r1(cx(i)), dy: 13 }, x.slice(0, 4)) : ""));
    });
    this.#cross = s("line", { class: "nx-trend__cross", y1: T - 6, y2: H - B, visibility: "hidden" });
    kids.push(this.#cross);

    const enter = this.#enter && !reduced();
    this.#enter = false;
    svg.classList.toggle("is-enter", enter);
    const sIndex = (q: TrendSeries) => this.#series.indexOf(q);

    // Barras: agrupadas en el periodo, de hasta 24 px, con 2 px de aire entre vecinas.
    const k = bars.length;
    const gw = Math.min(band * 0.72, k * 24 + (k - 1) * 2);
    const bw = k ? (gw - (k - 1) * 2) / k : 0;
    const y0 = y(Math.max(lo, Math.min(0, hi)));
    bars.forEach((q, j) => {
      const g = s("g", { class: "nx-trend__series", "data-slot": this.#slot(q) });
      q.points.forEach((p, pi) => {
        if (p.y === null) return;
        const i = xi.get(p.x)!;
        const x = cx(i) - gw / 2 + j * (bw + 2);
        const top = y(p.y);
        const bar = s("path", { d: barPath(x, bw, y0, top), class: "nx-trend__bar", "data-i": i, "data-neg": p.y < 0 ? "" : null, style: `--d:${i}` });
        g.append(bar);
        (this.#marks[i] ??= []).push(bar);
        this.#pts.push({ si: sIndex(q), pi, xi: i, x: x + bw / 2, y: top, bar: [x, bw] });
      });
      kids.push(g);
    });

    // Líneas: 2 px, cortadas donde falta el dato, con la forma de la serie en cada punto.
    const dense = n > 40;
    const labels: { y: number; t: string; slot: string }[] = [];
    for (const q of lines) {
      const si = sIndex(q);
      let d = "";
      let gap = true;
      const marks: SVGElement[] = [];
      q.points.forEach((p, pi) => {
        if (p.y === null) return void (gap = true);
        const i = xi.get(p.x)!;
        const px = cx(i);
        const py = y(p.y);
        d += `${gap ? "M" : "L"}${r1(px)} ${r1(py)}`;
        gap = false;
        const mk = s("path", { d: shape(si, px, py), class: "nx-trend__mk", "data-i": i, style: `--d:${i}` });
        marks.push(mk);
        (this.#marks[i] ??= []).push(mk);
        this.#pts.push({ si, pi, xi: i, x: px, y: py });
      });
      const last = [...q.points].reverse().find((p) => p.y !== null);
      if (ends && last) labels.push({ y: y(last.y!), t: this.#fmt(q, last.y!, true), slot: this.#slot(q) });
      kids.push(s("g", { class: "nx-trend__series", "data-slot": this.#slot(q), "data-dense": dense ? "" : null }, s("path", { d, class: "nx-trend__line", pathLength: 1 }), ...marks));
    }
    // Valor al final de cada línea; si dos chocan, se quedan en la leyenda y el tooltip.
    labels.sort((a, b) => a.y - b.y);
    labels.forEach((l, i) => {
      if (Math.abs(l.y - (labels[i - 1]?.y ?? -99)) < 13 || Math.abs(l.y - (labels[i + 1]?.y ?? 1e9)) < 13) return;
      kids.push(s("text", { x: W - Rm + 8, y: r1(l.y), dy: "0.32em", class: "nx-trend__end" }, l.t));
    });

    // Anomalías: un anillo que late y una etiqueta corta (arriba, o abajo si no cabe).
    const ptAt = new Map(this.#pts.map((p) => [`${p.si}\u0000${this.#series[p.si].points[p.pi].x}`, p]));
    for (const f of this.#flags) {
      const si = this.#series.findIndex((q) => q.id === f.series);
      const pt = ptAt.get(`${si}\u0000${f.x}`);
      if (!pt) continue;
      const t = f.label ?? pctText(f.delta, loc);
      const w = t.length * 6.3 + 14;
      const above = pt.y - T > 18;
      const lx = Math.min(Math.max(pt.x, Lm + w / 2), W - Rm - w / 2 + (ends ? 50 : 0));
      const ly = above ? pt.y - 26 : pt.y + 12;
      kids.push(
        s(
          "g",
          { class: "nx-trend__flag", "data-slot": this.#slot(this.#series[si]) },
          s("circle", { cx: r1(pt.x), cy: r1(pt.y), r: 9, class: "nx-trend__pulse" }),
          s("circle", { cx: r1(pt.x), cy: r1(pt.y), r: 7, class: "nx-trend__ring" }),
          s("rect", { x: r1(lx - w / 2), y: r1(ly), width: r1(w), height: 17, rx: 8.5 }),
          s("text", { x: r1(lx), y: r1(ly + 12), "text-anchor": "middle" }, t),
        ),
      );
    }
    svg.replaceChildren(...kids);
    this.#points(loc);
  }

  /** Un botón por punto (24 px de blanco, más que la marca): foco, Enter y lector de pantalla. */
  #points(loc: string): void {
    const L = this.#labels;
    const keys = this.#pts.map((p) => `${p.si}:${p.pi}`);
    if (!keys.includes(this.#tab)) this.#tab = keys[0] ?? "";
    const had = this.#layer!.contains(document.activeElement);
    const flags = new Map(this.#flags.map((f) => [`${f.series}\u0000${f.x}`, f]));
    this.#layer!.replaceChildren(
      ...this.#pts.map((p, k) => {
        const q = this.#series[p.si];
        const pt = q.points[p.pi];
        const flag = flags.get(`${q.id}\u0000${pt.x}`);
        const label = `${q.label}, ${periodLabel(pt.x, loc, "full")}: ${this.#fmt(q, pt.y!)}${flag ? `, ${L.anomaly} ${flag.label ?? pctText(flag.delta, loc)}` : ""}`;
        return h("button", {
          type: "button",
          class: "nx-trend__pt",
          "data-k": k,
          "data-slot": this.#slot(q),
          tabindex: keys[k] === this.#tab ? 0 : -1,
          "aria-label": label,
          "aria-haspopup": this.explainEndpoint ? "dialog" : null,
          style: `left:${r1(p.x)}px;top:${r1(p.y)}px`,
        });
      }),
    );
    if (had) this.#layer!.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
  }

  /** La línea vertical y el tooltip en el periodo `i` (o nada con -1). */
  #hover(i: number, py = 0): void {
    const g = this.#geo;
    if (!g || i === this.#at) return this.#placeTip(py);
    this.#at = i;
    const svg = this.#svg!;
    svg.toggleAttribute("data-active", i >= 0);
    // Solo las marcas de la columna que se va y la que llega (no todo el SVG en cada movimiento).
    for (const m of this.#on) m.classList.remove("is-on");
    this.#on = i >= 0 ? (this.#marks[i] ?? []) : [];
    for (const m of this.#on) m.classList.add("is-on");
    this.#cross!.setAttribute("visibility", i < 0 ? "hidden" : "visible");
    const tip = this.#tip!;
    tip.hidden = i < 0;
    if (i < 0) return;
    const x = r1(g.cx(i));
    this.#cross!.setAttribute("x1", String(x));
    this.#cross!.setAttribute("x2", String(x));
    const loc = resolveLocale(this);
    const period = this.#periods[i];
    const rows = this.#visible().flatMap((q) => {
      const p = q.points.find((p) => p.x === period);
      if (!p || p.y === null) return [];
      const flag = this.#flags.find((f) => f.series === q.id && f.x === period);
      return [h("div", { class: "nx-trend__row", "data-slot": this.#slot(q) }, h("i", { class: "nx-trend__lk" }), h("strong", null, this.#fmt(q, p.y)), h("span", null, q.label), flag ? h("em", null, flag.label ?? pctText(flag.delta, loc)) : null)];
    });
    tip.replaceChildren(h("p", { class: "nx-trend__tip-h" }, periodLabel(period, loc, "full")), ...rows, this.explainEndpoint ? h("p", { class: "nx-trend__tip-ask" }, this.#labels.ask) : "");
    this.#placeTip(py);
  }

  /** El tooltip junto a la línea vertical: a la derecha, o a la izquierda si no cabe. */
  #placeTip(py: number): void {
    const g = this.#geo;
    const tip = this.#tip!;
    if (!g || this.#at < 0) return;
    const W = this.#width || 600;
    const x = g.cx(this.#at);
    const w = tip.offsetWidth;
    const left = x + 14 + w > W ? Math.max(0, x - 14 - w) : x + 14;
    const top = Math.min(Math.max(0, py - tip.offsetHeight / 2), this.height - tip.offsetHeight);
    tip.style.transform = `translate(${r1(left)}px,${r1(top)}px)`;
  }

  #click(e: MouseEvent): void {
    let pt = this.#ptOf(e.target as Element);
    const g = this.#geo;
    if (!pt && g) {
      // Clic en la columna del periodo (también con el dedo, sin hover): la barra bajo el puntero,
      // o la serie más cercana en altura.
      const r = this.#plot!.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const xi = Math.floor((px - g.L) / g.band);
      const here = this.#pts.filter((p) => p.xi === xi);
      pt = here.find((p) => p.bar && px >= p.bar[0] - 1 && px <= p.bar[0] + p.bar[1] + 1) ?? here.sort((a, b) => Math.abs(a.y - py) - Math.abs(b.y - py))[0];
    }
    // El punto que ya estaba abierto: ese clic lo cerró (clic fuera del popover), no lo reabre.
    if (pt && this.#layer!.children[this.#pts.indexOf(pt)] !== this.#was) void this.#why(pt.si, pt.pi);
    this.#was = undefined;
  }

  #key(e: KeyboardEvent): void {
    const cur = this.#ptOf(e.target as Element);
    if (!cur) return;
    if (e.key === "Escape") return this.#hover(-1);
    let next: Pt | undefined;
    const mine = this.#pts.filter((p) => p.si === cur.si);
    const step = trendStep(e.key, mine.indexOf(cur), mine.length);
    if (step !== null) next = mine[step];
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // Otra serie visible, en el mismo periodo (o el más cercano que tenga).
      const order = [...new Set(this.#pts.map((p) => p.si))];
      const si = order[(order.indexOf(cur.si) + (e.key === "ArrowDown" ? 1 : order.length - 1)) % order.length];
      next = this.#pts.filter((p) => p.si === si).sort((a, b) => Math.abs(a.xi - cur.xi) - Math.abs(b.xi - cur.xi))[0];
    } else return;
    e.preventDefault();
    (this.#layer!.children[this.#pts.indexOf(next!)] as HTMLElement | undefined)?.focus();
  }

  // ---------------------------------------------------------------- «¿por qué?»

  async #why(si: number, pi: number, question?: string): Promise<void> {
    const q = this.#series[si];
    const p = q.points[pi];
    if (!q || !p || p.y === null) return;
    const loc = resolveLocale(this);
    const flag = this.#flags.find((f) => f.series === q.id && f.x === p.x);
    const ctx = explainContext(q, pi, q.format ?? this.format, q.format === "money" || (!q.format && this.format === "money") ? (q.currency ?? this.currency) : undefined, loc, flag);
    const ask = question ?? whyQuestion(q, pi, this.#labels, loc);
    const url = safeEndpoint(this.explainEndpoint);
    if (!this.#emit("why", { ...ctx, question: ask }, true) || !url) return;

    const L = this.#labels;
    const k = this.#pts.findIndex((x) => x.si === si && x.pi === pi);
    const anchor = (this.#layer!.children[k] as HTMLElement | undefined) ?? this.#layer!;
    const card = this.#ensureCard();
    if (this.#card!.matches?.(":popover-open")) card.hidePopover?.();
    this.#anchor = anchor;
    const d = change(ctx.previous?.y, p.y);
    card.replaceChildren(
      h(
        "header",
        { class: "nx-trend-why__head" },
        h("p", { class: "nx-trend-why__label", "data-slot": this.#slot(q) }, this.#mark(q, si), `${q.label} · ${ctx.point.label}`),
        h("p", { class: "nx-trend-why__value" }, this.#fmt(q, p.y)),
        d !== null && ctx.previous ? h("p", { class: "nx-trend-why__delta" }, `${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${pctText(d, loc, false)} ${L.versus.replace("{period}", periodLabel(ctx.previous.x, loc, "long"))}`, flag ? h("span", null, flag.label ?? L.anomaly) : "") : null,
        h("button", { type: "button", class: "nx-trend-why__close", "aria-label": L.close, title: L.close }, s("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" }, s("path", { d: "M18 6 6 18M6 6l12 12" }))),
      ),
    );
    card.setAttribute("aria-label", ask);
    anchor.setAttribute("aria-expanded", "true");
    card.showPopover?.();
    card.focus({ preventScroll: true });
    this.#place();
    await import("../ai/index");
    if (this.#anchor !== anchor || !card.isConnected) return;
    const ai = document.createElement("nx-ai-answer");
    ai.setAttribute("endpoint", url);
    ai.setAttribute("question", ask);
    ai.context = ctx;
    card.append(ai);
    this.#place();
  }

  #ensureCard(): HTMLElement {
    if (this.#card) return this.#card;
    // Vive en <body> (capa superior): lleva el idioma del gráfico, no el de la página.
    const card = h("div", { id: `${this.#uid}-why`, class: "nx-trend-why", popover: "auto", role: "dialog", tabindex: "-1", lang: resolveLocale(this) });
    this.#card = card;
    document.body.append(card);
    const place = () => this.#place();
    const unplace = () => {
      removeEventListener("resize", place);
      removeEventListener("scroll", place, true);
      this.#unplace = undefined;
    };
    card.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState === "open") {
        addEventListener("resize", place);
        addEventListener("scroll", place, true);
        this.#unplace = unplace;
        return;
      }
      unplace();
      card.querySelector("nx-ai-answer")?.remove();
      const a = this.#anchor;
      a?.removeAttribute("aria-expanded");
      this.#anchor = undefined;
      const f = document.activeElement;
      if (a?.isConnected && (!f || f === document.body || card.contains(f))) a.focus({ preventScroll: true });
    });
    card.addEventListener("click", (e) => (e.target as Element).closest(".nx-trend-why__close") && card.hidePopover());
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      card.hidePopover();
    });
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(place).observe(card);
    return card;
  }

  /** Junto al punto: a la derecha, a la izquierda, o debajo/encima si la pantalla es angosta. */
  #place(): void {
    const card = this.#card;
    const a = this.#anchor;
    if (!card || !a) return;
    const r = a.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = card.offsetWidth;
    const ch = card.offsetHeight;
    let left = r.right + 10;
    let top = r.top + r.height / 2 - 48;
    if (left + w > vw - 8) left = r.left - 10 - w;
    if (left < 8) {
      left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), vw - w - 8);
      top = vh - r.bottom - 8 >= ch || r.top < vh / 2 ? r.bottom + 8 : r.top - 8 - ch;
    }
    left = Math.max(8, left);
    top = Math.min(Math.max(8, top), Math.max(8, vh - ch - 8));
    Object.assign(card.style, { left: `${r1(left)}px`, top: `${r1(top)}px` });
  }
}
