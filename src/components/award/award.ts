/**
 * `<nx-award>`: el cuadro comparativo para adjudicar una cotización. Artículos en filas, proveedores
 * en columnas y, en cada celda, lo que cotizó. La IA sugiere un proveedor por artículo (contorno
 * punteado y ✦) y el comprador elige (relleno): al principio coinciden, y cuando se aparta, la
 * sugerencia sigue a la vista y la fila dice cuánto cuesta el cambio y por qué se hizo.
 *
 * Con 60 artículos y 10 proveedores son 600 números: el componente no pide leerlos todos. Las
 * alertas del backend (un precio atípico, una sola cotización, una decisión cerrada, un proveedor
 * con la póliza vencida) marcan las filas que merecen ojo humano, y «Siguiente alerta» (o J/K) lleva
 * de una a otra. El detalle de una fila muestra el ranking con el aporte de cada criterio, el precio
 * original antes de normalizar y el motivo del cambio. Arriba, el total, lo que cuestan los cambios
 * frente a la IA y cuántas órdenes salen; abajo, lo adjudicado a cada proveedor.
 *
 * La recomendación no es una función en una prop (BDUI): la calcula el backend (`endpoint`, POST con
 * `{weights, excluded}` y la respuesta en NDJSON) o la app (`advice`, o respondiendo a
 * `nx-award-advise`). Mover los pesos o excluir a un proveedor la vuelve a pedir.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import { lineData, readLines } from "../../core/stream";
import { buildOrders, changesOf, choiceList, cleanChoices, cleanCriteria, cleanEvent, cleanItems, cleanQuotes, cleanStrings, cleanSuppliers, contributions, fill, flagSig, gridMove, lineTotal, nextIndex, num, parseEvent, qkey, shares, totalOf } from "./logic";
import type { AwardChangeDetail, AwardChoice, AwardCriterion, AwardEvent, AwardFilter, AwardFlag, AwardItem, AwardLabels, AwardLens, AwardNote, AwardQuote, AwardRecommendation, AwardScenario, AwardSubmitDetail, AwardSupplier, AwardValue } from "./types";

export const AWARD_LABELS: AwardLabels = {
  table: "Cuadro comparativo de cotizaciones",
  item: "Artículo",
  awarded: "Adjudicado",
  total: "Total adjudicado",
  vsAi: "Frente a la IA",
  same: "Igual",
  changeOne: "1 cambio",
  changeMany: "{n} cambios",
  orders: "Órdenes",
  supplierOne: "1 proveedor",
  supplierMany: "{n} proveedores",
  pending: "Por revisar",
  pendingOf: "de {total} alertas",
  reviewed: "todas abiertas",
  noAlerts: "sin alertas",
  next: "Siguiente alerta",
  unassigned: "{n} sin adjudicar",
  lens: "Ver",
  lensPrice: "Precio unitario",
  lensTotal: "Total de la línea",
  lensLead: "Plazo",
  lensScore: "Puntaje",
  show: "Mostrar",
  filterAll: "Todos",
  filterAlerts: "Con alertas",
  filterChanged: "Cambiados",
  scenario: "Escenario",
  best: "Mejor por artículo",
  criteria: "Criterios",
  reset: "Restablecer",
  suggested: "sugerida por la IA",
  noQuote: "No cotizó",
  nobody: "Nadie cotizó",
  changed: "cambiado",
  pick: "Elegir a {name}",
  youChose: "Elegiste {supplier}: {delta} frente a la sugerencia.",
  youChoseFree: "Elegiste {supplier}.",
  reason: "Motivo del cambio",
  undo: "Volver a la sugerencia",
  excluded: "Excluido",
  exclude: "Excluir de la sugerencia",
  include: "Volver a considerarlo",
  giveAll: "Darle todo lo que cotizó",
  gaveAll: "{n} artículos pasaron a {supplier}.",
  bulkReason: "Consolidar en {supplier}",
  revert: "Deshacer",
  supplierStats: "{quoted} cotizados · {awarded} adjudicados · {total}",
  close: "Cerrar",
  submit: "Generar órdenes",
  busy: "Espera a que termine la recomendación.",
  needReview: "Abre las alertas pendientes antes de generar las órdenes.",
  needReason: "Falta el motivo del cambio en {name}.",
  advising: "La IA está revisando las cotizaciones…",
  error: "No se pudo obtener la recomendación.",
  retry: "Reintentar",
  days: "{n} d",
  points: "{n} pts",
  quoted: "Cotizó",
  count: "{n} art.",
};

/** Los motivos que se sugieren al apartarse de la IA (se puede escribir otro). */
export const AWARD_REASONS: readonly string[] = ["Proveedor habitual", "Calidad comprobada", "Consolidar en menos órdenes", "Plazo de entrega", "Garantía o soporte"];

const JSON_ATTRS = new Set(["suppliers", "items", "quotes", "criteria", "advice", "choices", "excluded", "reasons", "labels"]);
const LENSES: readonly AwardLens[] = ["price", "total", "lead", "score"];
const LENS_LABEL = { price: "lensPrice", total: "lensTotal", lead: "lensLead", score: "lensScore" } as const;
const FILTERS: readonly AwardFilter[] = ["all", "alerts", "changed"];
const FILTER_LABEL = { all: "filterAll", alerts: "filterAlerts", changed: "filterChanged" } as const;
/** Espera entre el último movimiento de un peso y el pedido de la recomendación. */
const DEBOUNCE = 350;

const SPARK = '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5a2 2 0 0 0 1.44 1.44l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>';
const WARN = '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
const CLOSE = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

type Choice = { supplier: string; reason?: string };
type Pos = { r: string; c: number };
type RowRef = { item: AwardItem; tr: HTMLTableRowElement; th: HTMLTableCellElement; cells: HTMLTableCellElement[] };
type GroupRef = { tr: HTMLTableRowElement; th: HTMLTableCellElement; name: string; rows: RowRef[] };
/** Una recomendación en curso. Lo que no vuelve a mandar desaparece al terminar (`done`). */
type Run = { seq: number; recs: Set<string>; flagged: Set<string>; scenarios: AwardScenario[] | null; notes: AwardNote[]; done?: boolean; failed?: boolean; partial?: boolean };

let uid = 0;
const vh = (text: string) => h("span", { class: "nx-award__vh" }, text);
const pcts = new Map<string, Intl.NumberFormat>();
/** 0,083 → «8 %»; con `sign`, «+8,3 %». */
function pct(n: number, locale: string, sign = false): string {
  const key = `${locale}|${sign}`;
  let f = pcts.get(key);
  if (!f) pcts.set(key, (f = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: sign ? 1 : 0, signDisplay: sign ? "exceptZero" : "auto" })));
  return f.format(n).replace(/[  ]/g, " ");
}

export class NxAward extends Base {
  static observedAttributes = ["suppliers", "items", "quotes", "criteria", "advice", "choices", "excluded", "reasons", "labels", "scenario", "endpoint", "heading", "locale", "currency", "lens", "readonly"];

  #uid = `nx-aw${++uid}`;
  #suppliers: AwardSupplier[] = [];
  #items: AwardItem[] = [];
  #quotes = new Map<string, AwardQuote>();
  #criteria: AwardCriterion[] = [];
  /** Los pesos de ahora, en porcentaje de la suma de los de base (lo que muestran los deslizadores). */
  #weights: Record<string, number> = {};
  #baseWeights: Record<string, number> = {};
  #recs = new Map<string, AwardRecommendation>();
  #flags = new Map<string, AwardFlag[]>();
  #scenarios: AwardScenario[] = [];
  #scenario = "";
  #notes: AwardNote[] = [];
  #failed = false;
  /** Lo que eligió el comprador a mano. Sin entrada, el artículo sigue a la sugerencia. */
  #choices = new Map<string, Choice>();
  #excluded = new Set<string>();
  #reasons: string[] = [...AWARD_REASONS];
  /** Las alertas ya abiertas (por su firma: si cambian, vuelven a estar por revisar). */
  #seen = new Set<string>();
  #labels = AWARD_LABELS;
  #filter: AwardFilter = "all";
  #open: string | null = null;
  #sup: string | null = null;
  /** El último proveedor abierto (al cerrar su barra, el foco vuelve a su columna). */
  #lastSup = "";
  #bulk: { supplier: string; prev: Map<string, Choice>; n: number } | null = null;
  /** La celda con el foco de la grilla (`null`: la primera fila visible). */
  #active: Pos | null = null;
  #advised = false;
  /** Hay una recomendación pedida que no terminó (se vuelve a pedir al reconectar). */
  #stale = false;
  /** Pesos asignados antes que los criterios: se aplican al llegar `criteria`. */
  #wantWeights: Record<string, number> | null = null;
  #seq = 0;
  #ctrl?: AbortController;
  #timer = 0;
  #isBusy = false;
  // ---- pintado
  #built = false;
  #queued = false;
  #structure = true;
  #full = false;
  #detailDirty = false;
  #dirty = new Set<string>();
  /** Lo que muestra cada sección la última vez que se pintó: si no cambia, no se recrea. */
  #sigs = new Map<string, string>();
  #detailSig = "";
  /** El campo del motivo abierto: se reusa al repintar el detalle (no pierde lo escrito). */
  #reason?: { el: HTMLInputElement; item: string; supplier: string };
  /** La celda que tenía el foco antes de rehacer la tabla. */
  #refocus: Pos | null = null;
  #live?: HTMLElement;
  #rows = new Map<string, RowRef>();
  #groups: GroupRef[] = [];
  #pos = new WeakMap<Element, Pos>();
  #heads: HTMLTableCellElement[] = [];
  #corner?: HTMLTableCellElement;
  #tabEl?: HTMLElement;
  #footTotal?: HTMLElement;
  #footCells: HTMLTableCellElement[] = [];
  #detailTr?: HTMLTableRowElement;
  #title?: HTMLHeadingElement;
  #scenarioField?: HTMLElement;
  #scenarioSel?: HTMLSelectElement;
  #scenarioSig = "";
  #lensSel?: HTMLSelectElement;
  #filterBtns: HTMLButtonElement[] = [];
  #critBtn?: HTMLButtonElement;
  #crit?: HTMLElement;
  #critRows = new Map<string, { range: HTMLInputElement; out: HTMLElement }>();
  #critReset?: HTMLButtonElement;
  #sum?: { total: HTMLElement; totalSub: HTMLElement; delta: HTMLElement; deltaSub: HTMLElement; orders: HTMLElement; pending: HTMLElement; pendingSub: HTMLElement; next: HTMLButtonElement };
  #notesEl?: HTMLElement;
  #supEl?: HTMLElement;
  #table?: HTMLTableElement;
  #datalist?: HTMLDataListElement;
  #msgEl?: HTMLElement;
  #submitBtn?: HTMLButtonElement;

  // ---------------------------------------------------------------- propiedades

  /** Los proveedores `{id, name, detail?, alert?}`, en el orden de las columnas. */
  get suppliers(): AwardSupplier[] {
    return this.#suppliers;
  }
  set suppliers(v: unknown) {
    this.#suppliers = cleanSuppliers(v);
    this.#restructure();
  }
  /** Los artículos `{id, name, qty, unit?, code?, group?}`, en el orden de las filas. */
  get items(): AwardItem[] {
    return this.#items;
  }
  set items(v: unknown) {
    this.#items = cleanItems(v);
    this.#restructure();
  }
  /** Las cotizaciones `{item, supplier, price, leadTime?, original?, note?}`. `price` es el unitario comparable. */
  get quotes(): AwardQuote[] {
    return [...this.#quotes.values()];
  }
  set quotes(v: unknown) {
    this.#quotes = cleanQuotes(v);
    this.#restructure();
  }
  /** Los criterios `{id, label, weight}`: la leyenda del puntaje y los deslizadores de «Criterios». */
  get criteria(): AwardCriterion[] {
    return this.#criteria;
  }
  set criteria(v: unknown) {
    this.#criteria = cleanCriteria(v);
    const sh = shares(this.#criteria, {});
    this.#baseWeights = Object.fromEntries(this.#criteria.map((c) => [c.id, Math.round(sh[c.id] * 100)]));
    this.#weights = { ...this.#baseWeights };
    if (this.#wantWeights) {
      const want = this.#wantWeights;
      this.#wantWeights = null;
      this.weights = want;
    }
    this.#buildCrit();
    this.#detailDirty = true;
    this.#queue();
  }
  /** Los pesos de ahora `{criterio: peso}` (relativos). Asignarlos vuelve a pedir la recomendación. */
  get weights(): Record<string, number> {
    return { ...this.#weights };
  }
  set weights(v: Record<string, number> | null | undefined) {
    if (!this.#criteria.length) {
      this.#wantWeights = v ? { ...v } : null;
      return;
    }
    for (const c of this.#criteria) {
      const n = num(v?.[c.id]);
      if (n !== undefined && n >= 0) this.#weights[c.id] = Math.min(100, n);
    }
    this.#paintCrit();
    this.#detailDirty = true;
    this.#request(0);
  }
  /** La recomendación como eventos del protocolo (`recommend`, `flag`, `scenario`, `note`), sin
   *  servidor. Reemplaza la anterior; leerla devuelve la de ahora (para guardarla). */
  get advice(): AwardEvent[] {
    return [
      ...[...this.#recs.values()].map((r) => ({ type: "recommend" as const, ...r })),
      ...[...this.#flags.values()].flat().map((f) => ({ type: "flag" as const, ...f })),
      ...this.#scenarios.map((s) => ({ type: "scenario" as const, ...s })),
      { type: "done" as const },
    ];
  }
  set advice(v: unknown) {
    // `undefined` (un framework que asigna la prop vacía) no borra nada; `[]` sí.
    if (v === null || v === undefined) return;
    clearTimeout(this.#timer);
    this.#timer = 0;
    this.#ctrl?.abort();
    this.#ctrl = undefined;
    this.#applyAll(this.#newRun(), Array.isArray(v) ? v : []);
  }
  /** Lo que el comprador eligió a mano `[{item, supplier, reason?}]` (para guardar un borrador). */
  get choices(): AwardChoice[] {
    return choiceList(this.#choices);
  }
  set choices(v: unknown) {
    this.#choices = cleanChoices(v);
    this.#bulk = null;
    this.#repaint();
  }
  /** Los proveedores que no entran en la sugerencia (ids). */
  get excluded(): string[] {
    return [...this.#excluded];
  }
  set excluded(v: unknown) {
    const next = new Set(cleanStrings(v));
    const changed = next.size !== this.#excluded.size || [...next].some((x) => !this.#excluded.has(x));
    this.#excluded = next;
    this.#repaint();
    if (changed) this.#request(0);
  }
  /** Los motivos que se sugieren al apartarse de la IA. */
  get reasons(): string[] {
    return this.#reasons;
  }
  set reasons(v: unknown) {
    this.#reasons = v === null || v === undefined ? [...AWARD_REASONS] : cleanStrings(v);
    this.#paintReasons();
  }
  get labels(): AwardLabels {
    return this.#labels;
  }
  set labels(v: Partial<AwardLabels> | string | null | undefined) {
    this.#labels = mergeLabels(AWARD_LABELS, v);
    if (this.#built) this.#build();
  }
  /** El escenario aplicado (`""`: lo mejor por artículo). Cambia la sugerencia de los artículos que toca. */
  get scenario(): string {
    return this.#scenario;
  }
  set scenario(v: string | null | undefined) {
    this.#setScenario(v ?? "", false);
  }
  /** Qué filas se ven: `all`, `alerts` (con alertas) o `changed` (apartadas de la sugerencia). */
  get filter(): AwardFilter {
    return this.#filter;
  }
  set filter(v: AwardFilter) {
    if (!FILTERS.includes(v) || v === this.#filter) return;
    this.#filter = v;
    this.#repaint();
  }
  /** Lo que muestran las celdas: `price` (por defecto), `total`, `lead` o `score`. */
  get lens(): AwardLens {
    const v = this.getAttribute("lens") as AwardLens;
    return LENSES.includes(v) ? v : "price";
  }
  set lens(v: AwardLens) {
    this.#attr("lens", v);
  }
  /** URL de la recomendación: `POST {weights, excluded}` → NDJSON. Sin ella, `nx-award-advise`.
   *  Solo del mismo origen (o uno de `allowOrigins`); otra se ignora, como si no hubiera. */
  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }
  set endpoint(v: string) {
    this.#attr("endpoint", v);
  }
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string) {
    this.#attr("heading", v);
  }
  /** Idioma de números y montos («es-CO», «en-US»); sin él, el `lang` más cercano. */
  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(v: string | null | undefined) {
    this.#attr("locale", v);
  }
  /** Moneda de los precios: código ISO («COP») o símbolo («$»). */
  get currency(): string {
    return this.getAttribute("currency") ?? "";
  }
  set currency(v: string) {
    this.#attr("currency", v);
  }
  /** Solo lectura: una adjudicación cerrada se consulta, no se cambia. */
  get readonly(): boolean {
    return boolAttr(this, "readonly");
  }
  set readonly(v: boolean) {
    this.toggleAttribute("readonly", !!v);
  }
  /** Apartarse de la sugerencia pide motivo: «Generar órdenes» lleva al que falta. */
  get requireReason(): boolean {
    return boolAttr(this, "require-reason");
  }
  set requireReason(v: boolean) {
    this.toggleAttribute("require-reason", !!v);
  }
  /** Las alertas se abren antes de generar las órdenes: «Generar órdenes» lleva a la siguiente. */
  get requireReview(): boolean {
    return boolAttr(this, "require-review");
  }
  set requireReview(v: boolean) {
    this.toggleAttribute("require-review", !!v);
  }
  /** `{artículo: proveedor}` de lo adjudicado ahora (lo elegido a mano, o la sugerencia). */
  get value(): AwardValue {
    const out: AwardValue = {};
    for (const it of this.#items) {
      const s = this.#choiceOf(it.id);
      if (s) out[it.id] = s;
    }
    return out;
  }

  /** Abre el detalle de un artículo (o lo cierra, con `null`). */
  open(item: string | null): void {
    this.#setOpen(item && this.#items.some((i) => i.id === item) ? item : null);
  }
  /** Abre la siguiente alerta por revisar (o, si ya se vieron todas, la siguiente) y la enfoca. */
  next(dir: 1 | -1 = 1): void {
    const order = [...this.#rows.keys()];
    const from = order.indexOf(this.#open ?? this.#active?.r ?? "");
    let i = nextIndex(order.length, from, dir, (k) => this.#pending(order[k]));
    if (i < 0) i = nextIndex(order.length, from, dir, (k) => this.#flags.has(order[k]));
    if (i >= 0) this.#reveal(order[i]);
  }
  /** Vuelve a pedir la recomendación ya. */
  refresh(): void {
    this.#request(0);
  }
  /** Genera las órdenes (`nx-award-submit`). Con `require-reason` o `require-review`, antes lleva a
   *  lo que falta y devuelve `false`. */
  submit(): boolean {
    const L = this.#labels;
    // Con una recomendación en camino, las órdenes saldrían de la anterior.
    if (this.#isBusy) {
      this.#say(L.busy);
      return false;
    }
    const changes = changesOf(this.#items, this.#choices, (i) => this.#recOf(i), this.#quotes);
    if (this.requireReason) {
      const miss = changes.find((c) => !c.reason?.trim());
      if (miss) {
        this.#say(fill(L.needReason, { name: this.#items.find((i) => i.id === miss.item)!.name }));
        this.#reveal(miss.item, "reason");
        return false;
      }
    }
    const pending = this.#items.filter((i) => this.#pending(i.id)).length;
    if (pending && this.requireReview) {
      this.#say(L.needReview);
      this.next(1);
      return false;
    }
    const value = this.value;
    const { orders, total, unassigned } = buildOrders(this.#items, this.#suppliers, value, this.#quotes);
    this.#say("");
    this.#emit<AwardSubmitDetail>("nx-award-submit", { orders, changes, value, total, unassigned, scenario: this.#scenario, weights: this.weights, excluded: this.excluded, pending });
    return true;
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#built) this.#build();
    if ((!this.#advised || this.#stale) && !this.#timer && !this.#ctrl) this.#request(0);
  }

  disconnectedCallback(): void {
    this.#ctrl?.abort();
    this.#ctrl = undefined;
    clearTimeout(this.#timer);
    this.#timer = 0;
    this.#busy(false);
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (JSON_ATTRS.has(name)) {
      try {
        (this as unknown as Record<string, unknown>)[name] = value === null ? null : JSON.parse(value);
      } catch {
        console.warn(`[nx-award] el atributo "${name}" no es JSON válido`);
      }
    } else if (name === "endpoint") this.#request(0);
    else if (name === "scenario") this.scenario = value;
    else if (name === "readonly" || name === "heading") {
      if (this.#built) this.#build();
    } else this.#repaint();
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
  /** Un monto: completo, o con `short` compacto desde el millón («$4,42 M»). */
  #money(n: number, short = false): string {
    const big = short && Math.abs(n) >= 1e6;
    return this.#fmt.money(big ? Number(n.toPrecision(3)) : Math.abs(n) >= 100 ? Math.round(n) : n, { currency: this.currency || undefined }, big);
  }
  #qty(it: AwardItem): string {
    return `${this.#fmt.number(it.qty)}${it.unit ? ` ${it.unit}` : ""}`;
  }
  #name(id: string): string {
    return this.#suppliers.find((s) => s.id === id)?.name ?? id;
  }
  /** Un aviso junto a «Generar órdenes», también para el lector de pantalla (región siempre presente). */
  #say(text: string): void {
    if (this.#msgEl) this.#msgEl.textContent = text;
    this.#announce(text);
  }
  #announce(text: string): void {
    if (this.#live) this.#live.textContent = text;
  }

  // ---------------------------------------------------------------- estado

  /** La sugerencia de un artículo: la del escenario aplicado, o la de la IA (siempre alguien que cotizó). */
  #recOf(id: string): string | null {
    const pick = this.#scenario ? this.#scenarios.find((s) => s.id === this.#scenario)?.picks[id] : undefined;
    if (pick && this.#quotes.has(qkey(id, pick))) return pick;
    const r = this.#recs.get(id)?.supplier;
    return r && this.#quotes.has(qkey(id, r)) ? r : null;
  }
  /** Lo adjudicado: lo elegido a mano o, sin elección, la sugerencia. */
  #choiceOf(id: string): string | null {
    const c = this.#choices.get(id)?.supplier;
    return c && this.#quotes.has(qkey(id, c)) ? c : this.#recOf(id);
  }
  /** ¿El comprador se apartó de la sugerencia? */
  #changed(id: string): boolean {
    const c = this.#choices.get(id)?.supplier;
    const r = this.#recOf(id);
    return !!c && !!r && c !== r && this.#quotes.has(qkey(id, c));
  }
  #pending(id: string): boolean {
    const f = this.#flags.get(id);
    return !!f?.length && !this.#seen.has(flagSig(id, f));
  }
  #markSeen(id: string): void {
    const f = this.#flags.get(id);
    if (f?.length) this.#seen.add(flagSig(id, f));
  }
  #matches(id: string): boolean {
    return this.#filter === "all" || (this.#filter === "alerts" ? !!this.#flags.get(id)?.length : this.#changed(id));
  }

  #choose(id: string, supplier: string | null): void {
    if (this.readonly || (supplier !== null && !this.#quotes.has(qkey(id, supplier)))) return;
    const r = this.#recOf(id);
    const prev = this.#choices.get(id);
    if (supplier === null || supplier === r) {
      if (!prev) return;
      this.#choices.delete(id);
    } else {
      if (prev?.supplier === supplier) return;
      this.#choices.set(id, { supplier });
      // Al apartarse de la IA se abre el detalle: ahí está lo que cuesta y el motivo.
      if (r) this.#setOpen(id);
    }
    this.#bulk = null;
    this.#say("");
    this.#dirty.add(id);
    this.#detailDirty = true;
    this.#queue();
    this.#emit<AwardChangeDetail>("nx-award-change", { item: id, supplier: this.#choiceOf(id), recommended: r, reason: this.#choices.get(id)?.reason?.trim() || undefined, value: this.value });
  }

  #setOpen(id: string | null): void {
    if (this.#open) this.#dirty.add(this.#open);
    this.#open = id;
    if (id) {
      this.#markSeen(id);
      this.#dirty.add(id);
    }
    this.#detailDirty = true;
    this.#queue();
  }

  /** Muestra y abre un artículo (quitando el filtro si lo esconde) y enfoca su fila o un control del detalle. */
  #reveal(id: string, focus?: string): void {
    if (!this.#matches(id)) {
      this.#filter = "all";
      this.#full = true;
    }
    this.#setOpen(id);
    this.#flushNow();
    const el = focus ? [...(this.#detailTr?.querySelectorAll<HTMLElement>("[data-f]") ?? [])].find((x) => x.dataset.f === focus) : undefined;
    if (el) el.focus();
    else this.#focus(id, 0);
  }

  #setScenario(id: string, emit: boolean): void {
    if (id === this.#scenario) return;
    this.#scenario = id;
    this.#repaint();
    if (emit) this.#emit<AwardChangeDetail>("nx-award-change", { item: null, supplier: null, recommended: null, value: this.value });
  }

  #toggleSup(id: string | null): void {
    this.#sup = id === this.#sup ? null : id;
    this.#queue();
  }

  #toggleExclude(id: string): void {
    if (!this.#excluded.delete(id)) this.#excluded.add(id);
    this.#repaint();
    this.#request(0);
  }

  /** Le adjudica al proveedor todo lo que cotizó (con un motivo en bloque) y deja deshacerlo. */
  #giveAll(sid: string): void {
    const prev = new Map([...this.#choices].map(([k, v]) => [k, { ...v }]));
    const reason = fill(this.#labels.bulkReason, { supplier: this.#name(sid) });
    let n = 0;
    for (const it of this.#items) {
      if (!this.#quotes.has(qkey(it.id, sid)) || this.#choiceOf(it.id) === sid) continue;
      if (this.#recOf(it.id) === sid) this.#choices.delete(it.id);
      else this.#choices.set(it.id, { supplier: sid, reason });
      n++;
    }
    if (!n) return;
    this.#bulk = { supplier: sid, prev, n };
    this.#repaint();
    this.#announce(fill(this.#labels.gaveAll, { n, supplier: this.#name(sid) }));
    this.#emit<AwardChangeDetail>("nx-award-change", { item: null, supplier: sid, recommended: null, reason, value: this.value });
  }

  #revert(): void {
    if (!this.#bulk) return;
    this.#choices = this.#bulk.prev;
    this.#bulk = null;
    this.#repaint();
    this.#emit<AwardChangeDetail>("nx-award-change", { item: null, supplier: null, recommended: null, value: this.value });
  }

  // ---------------------------------------------------------------- recomendación

  #newRun(): Run {
    return { seq: ++this.#seq, recs: new Set(), flagged: new Set(), scenarios: null, notes: [] };
  }

  /** Pide la recomendación después de `delay` ms (cancela lo anterior). */
  #request(delay: number): void {
    this.#stale = true;
    if (!this.isConnected || !this.#built) return;
    clearTimeout(this.#timer);
    this.#busy(true);
    this.#timer = window.setTimeout(() => {
      this.#timer = 0;
      void this.#advise();
    }, delay);
  }

  #busy(on: boolean): void {
    if (this.#isBusy === on) return;
    this.#isBusy = on;
    this.toggleAttribute("data-busy", on);
    this.#table?.setAttribute("aria-busy", String(on));
    this.#queue();
  }

  async #advise(): Promise<void> {
    this.#ctrl?.abort();
    this.#ctrl = undefined;
    const run = this.#newRun();
    const weights = this.weights;
    const excluded = this.excluded;
    const url = safeEndpoint(this.endpoint);
    if (!url) {
      let answered = false;
      const respond = (evs: unknown[]) => {
        if (answered) return;
        answered = true;
        this.#applyAll(run, Array.isArray(evs) ? evs : []);
      };
      const free = this.#emit("nx-award-advise", { weights, excluded, respond }, true);
      // Nadie recomienda (ni ahora ni después, con `preventDefault()`): no se queda «revisando».
      if (!answered && free && run.seq === this.#seq) this.#busy(false);
      return;
    }
    const ctrl = (this.#ctrl = new AbortController());
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Accept: "application/x-ndjson, text/event-stream", "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ weights, excluded }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readLines(res, (line) => {
        // Otra recomendación tomó su lugar (o terminó con `done`): se suelta la conexión.
        if (ctrl.signal.aborted || run.done) return false;
        const ev = parseEvent(lineData(line));
        if (ev) this.#apply(run, ev);
        if (run.done) return false;
      });
      // Cerró sin `done` (un proxy, un servidor que se cayó): no es toda la verdad.
      if (!run.done) run.partial = true;
    } catch {
      if (ctrl.signal.aborted) return;
      run.failed = true;
    }
    if (!ctrl.signal.aborted) this.#finish(run);
  }

  #applyAll(run: Run, evs: unknown[]): void {
    for (const x of evs) {
      const ev = cleanEvent(x);
      if (ev) this.#apply(run, ev);
    }
    this.#finish(run);
  }

  #apply(run: Run, ev: AwardEvent): void {
    if (run.seq !== this.#seq || run.done) return;
    switch (ev.type) {
      case "recommend": {
        const { type: _, ...r } = ev;
        run.recs.add(r.item);
        this.#recs.set(r.item, r);
        this.#dirty.add(r.item);
        break;
      }
      case "flag": {
        const { type: _, ...f } = ev;
        // La primera alerta de un artículo en esta recomendación reemplaza las que tenía.
        if (!run.flagged.has(f.item)) run.flagged.add(f.item), this.#flags.set(f.item, []);
        this.#flags.get(f.item)!.push(f);
        // Quien tiene el artículo abierto la está viendo.
        if (f.item === this.#open) this.#markSeen(f.item);
        this.#dirty.add(f.item);
        break;
      }
      case "scenario": {
        const { type: _, ...s } = ev;
        // Se aplican al terminar: a medias, la tabla mezclaría filas del escenario con filas de la IA.
        (run.scenarios ??= []).push(s);
        break;
      }
      case "note":
        run.notes.push({ message: ev.message, tone: ev.tone });
        break;
      case "error":
        run.notes.push({ message: ev.message, tone: "danger" });
        run.failed = true;
        break;
      case "done":
        return this.#finish(run);
    }
    if (this.#open && this.#dirty.has(this.#open)) this.#detailDirty = true;
    this.#queue();
  }

  #finish(run: Run): void {
    if (run.done || run.seq !== this.#seq) return;
    run.done = true;
    this.#ctrl = undefined;
    let dropped = false;
    if (!run.failed) {
      if (!run.partial) {
        // Una recomendación completa es toda la verdad: lo que no volvió a mandar, ya no va.
        for (const id of [...this.#recs.keys()]) if (!run.recs.has(id)) this.#recs.delete(id);
        for (const id of [...this.#flags.keys()]) if (!run.flagged.has(id)) this.#flags.delete(id);
        this.#scenarios = run.scenarios ?? [];
      } else if (run.scenarios) this.#scenarios = run.scenarios;
      // El escenario elegido ya no existe: vuelve a lo mejor por artículo.
      if (this.#scenario && !this.#scenarios.some((x) => x.id === this.#scenario)) (this.#scenario = ""), (dropped = true);
      this.#advised = true;
    }
    if (this.#open) this.#markSeen(this.#open);
    this.#notes = run.notes;
    this.#failed = !!run.failed;
    this.#full = true;
    if (!this.#timer) {
      this.#stale = false;
      this.#busy(false);
    }
    this.#queue();
    if (dropped) this.#emit<AwardChangeDetail>("nx-award-change", { item: null, supplier: null, recommended: null, value: this.value });
  }

  // ---------------------------------------------------------------- pintado

  #restructure(): void {
    this.#structure = true;
    this.#queue();
  }
  #repaint(): void {
    this.#full = true;
    this.#queue();
  }
  /** Varios cambios seguidos (un trozo del stream, una ráfaga de clics) se pintan una sola vez. */
  #queue(): void {
    if (this.#queued || !this.#built) return;
    this.#queued = true;
    queueMicrotask(() => {
      if (!this.#queued) return;
      this.#queued = false;
      this.#flush();
    });
  }
  #flushNow(): void {
    this.#queued = false;
    this.#flush();
  }

  #flush(): void {
    if (!this.#built) return;
    const a = document.activeElement as HTMLElement | null;
    const was = this.#refocus ?? (a && this.#pos.get(a)) ?? null;
    this.#refocus = null;
    if (this.#structure) {
      this.#structure = false;
      this.#buildTable();
      this.#detailDirty = true;
    } else if (this.#full) {
      for (const ref of this.#rows.values()) this.#paintRow(ref);
      this.#detailDirty = true;
    } else
      for (const id of this.#dirty) {
        const ref = this.#rows.get(id);
        if (ref) this.#paintRow(ref);
      }
    this.#full = false;
    this.#dirty.clear();
    this.#paintHeads();
    this.#paintGroups();
    this.#paintFoot();
    this.#paintSummary();
    this.#paintTools();
    this.#keepFocus(this.#notesEl, () => this.#paintNotes(), () => this.#notesEl!.focus());
    this.#keepFocus(this.#supEl, () => this.#paintSup(), () => {
      if (!(this.#sup && this.#focusKey("sup:all"))) this.#focus("", 1 + this.#suppliers.findIndex((s) => s.id === this.#lastSup));
    });
    if (this.#detailDirty) {
      this.#detailDirty = false;
      const id = this.#open;
      this.#keepFocus(this.#detailTr, () => this.#paintDetail(), () => id && this.#focusNear({ r: id, c: 0 }));
    }
    this.#syncTab();
    // La celda con el foco se rehízo o quedó oculta (filtro): el foco pasa a la más cercana.
    if (was && (!a?.isConnected || !this.contains(a) || a.closest("tr")?.hidden)) this.#focusNear(was);
  }

  /** Pinta una sección solo si cambió lo que muestra (`sig`). */
  #once(key: string, sig: string, paint: () => void): void {
    if (this.#sigs.get(key) === sig) return;
    this.#sigs.set(key, sig);
    paint();
  }
  #focusKey(key: string): boolean {
    const el = [...this.querySelectorAll<HTMLElement>("[data-f]")].find((x) => x.dataset.f === key);
    el?.focus();
    return !!el;
  }

  /** Repinta y devuelve el foco (y el cursor de un campo) al control con la misma `data-f`. */
  #keepFocus(box: HTMLElement | undefined, paint: () => void, fallback?: () => void): void {
    const a = document.activeElement as HTMLElement | null;
    const inside = !!(a && box?.contains(a));
    const key = inside ? a!.dataset.f : undefined;
    const sel = inside && a instanceof HTMLInputElement ? [a.selectionStart, a.selectionEnd] : null;
    paint();
    if (!inside || (a!.isConnected && this.contains(a))) return;
    const el = key ? [...this.querySelectorAll<HTMLElement>("[data-f]")].find((x) => x.dataset.f === key) : undefined;
    if (!el || el.closest("[hidden]")) return fallback?.();
    el.focus();
    if (sel && el instanceof HTMLInputElement && sel[0] !== null) el.setSelectionRange(sel[0], sel[1]);
  }

  #build(): void {
    this.#refocus = this.#pos.get(document.activeElement as Element) ?? this.#refocus;
    this.#built = true;
    this.#sigs.clear();
    this.#detailSig = "";
    this.#reason = undefined;
    const L = this.#labels;
    const id = this.#uid;
    const ro = this.readonly;
    this.#title = h("h2", { class: "nx-award__title", id: `${id}-t` }, this.heading);
    this.#title.hidden = !this.heading;
    this.#scenarioSel = h("select", { class: "nx-award__select" });
    this.#scenarioSel.addEventListener("change", () => this.#setScenario(this.#scenarioSel!.value, true));
    this.#scenarioField = h("label", { class: "nx-award__field" }, h("span", null, L.scenario), this.#scenarioSel);
    this.#scenarioSig = "";
    this.#lensSel = h("select", { class: "nx-award__select" }, ...LENSES.map((k) => h("option", { value: k }, L[LENS_LABEL[k]])));
    this.#lensSel.addEventListener("change", () => (this.lens = this.#lensSel!.value as AwardLens));
    this.#filterBtns = FILTERS.map((k) => {
      const b = h("button", { type: "button", class: "nx-award__segbtn", "aria-pressed": "false" });
      b.addEventListener("click", () => (this.filter = k));
      return b;
    });
    this.#critBtn = h("button", { type: "button", class: "nx-award__btn", "aria-expanded": "false", "aria-controls": `${id}-crit` }, L.criteria);
    this.#critBtn.addEventListener("click", () => {
      this.#crit!.hidden = !this.#crit!.hidden;
      this.#critBtn!.setAttribute("aria-expanded", String(!this.#crit!.hidden));
    });
    this.#crit = h("div", { class: "nx-award__crit", id: `${id}-crit`, role: "group", "aria-label": L.criteria });
    this.#crit.hidden = true;
    const s = {
      total: h("span"),
      totalSub: h("small"),
      delta: h("span"),
      deltaSub: h("small"),
      orders: h("span"),
      pending: h("span"),
      pendingSub: h("small"),
      next: h("button", { type: "button", class: "nx-award__next" }, L.next),
    };
    s.next.addEventListener("click", () => this.next(1));
    this.#sum = s;
    const stat = (label: string, ...kids: Node[]) => h("div", null, h("dt", null, label), h("dd", null, ...kids));
    this.#notesEl = h("div", { class: "nx-award__notes", role: "status", tabindex: "-1" });
    this.#live = h("span", { class: "nx-award__vh", role: "status" });
    this.#supEl = h("div", { class: "nx-award__sup", id: `${id}-sup` });
    this.#supEl.hidden = true;
    this.#table = h("table", { class: "nx-award__table", role: "grid", "aria-labelledby": this.heading ? `${id}-t` : null, "aria-label": this.heading ? null : L.table, "aria-readonly": ro ? "true" : null, "aria-multiselectable": "true", "aria-busy": String(this.#isBusy) });
    this.#table.addEventListener("click", (e) => this.#onClick(e));
    this.#table.addEventListener("keydown", (e) => this.#onKey(e));
    this.#table.addEventListener("focusin", (e) => {
      const p = this.#pos.get(e.target as Element);
      if (p) (this.#active = p), this.#setTab(e.target as HTMLElement);
    });
    this.#datalist = h("datalist", { id: `${id}-r` });
    this.#msgEl = h("p", { class: "nx-award__msg" });
    this.#submitBtn = h("button", { type: "button", class: "nx-award__btn nx-award__btn--primary" }, L.submit);
    this.#submitBtn.addEventListener("click", () => this.submit());
    this.#submitBtn.hidden = ro;
    this.replaceChildren(
      h(
        "div",
        { class: "nx-award__head" },
        this.#title,
        h("div", { class: "nx-award__tools" }, this.#scenarioField, h("label", { class: "nx-award__field" }, h("span", null, L.lens), this.#lensSel), h("div", { class: "nx-award__seg", role: "group", "aria-label": L.show }, ...this.#filterBtns), this.#critBtn),
      ),
      this.#crit,
      h("dl", { class: "nx-award__sum" }, stat(L.total, s.total, s.totalSub), stat(L.vsAi, s.delta, s.deltaSub), stat(L.orders, s.orders), stat(L.pending, s.pending, s.pendingSub, s.next)),
      this.#notesEl,
      this.#supEl,
      h("div", { class: "nx-award__scroll" }, this.#table),
      h("div", { class: "nx-award__foot" }, this.#msgEl, this.#submitBtn),
      this.#datalist,
      this.#live,
    );
    this.#buildCrit();
    this.#paintReasons();
    this.#tabEl = undefined;
    this.#structure = true;
    this.#queue();
  }

  // ---------------------------------------------------------------- tabla

  #buildTable(): void {
    const L = this.#labels;
    const n = this.#suppliers.length;
    this.#rows.clear();
    this.#groups = [];
    this.#detailTr = undefined;
    this.#detailSig = "";
    for (const k of ["heads", "groups", "foot"]) this.#sigs.delete(k);
    this.#pos = new WeakMap();
    this.#table!.style.setProperty("--n", String(n));
    this.#corner = h("th", { scope: "col", class: "nx-award__corner", tabindex: "-1" }, L.item);
    this.#pos.set(this.#corner, { r: "", c: 0 });
    this.#heads = this.#suppliers.map((s, j) => {
      const th = h("th", { scope: "col", class: "nx-award__shead", tabindex: "-1", "aria-controls": `${this.#uid}-sup`, "data-supplier": s.id });
      this.#pos.set(th, { r: "", c: j + 1 });
      return th;
    });
    const names = [...new Set(this.#items.map((i) => i.group ?? ""))];
    const grouped = names.some(Boolean);
    const bodies = names.map((name) => {
      const tb = h("tbody");
      let g: GroupRef | undefined;
      if (grouped) {
        const th = h("th", { colspan: n + 1, scope: "rowgroup" });
        g = { name, rows: [], th, tr: h("tr", { class: "nx-award__group" }, th) };
        this.#groups.push(g);
        tb.append(g.tr);
      }
      for (const it of this.#items) {
        if ((it.group ?? "") !== name) continue;
        const th = h("th", { scope: "row", class: "nx-award__item", tabindex: "-1", "aria-expanded": "false" });
        const cells = this.#suppliers.map(() => h("td", { class: "nx-award__cell", tabindex: "-1" }));
        const ref: RowRef = { item: it, tr: h("tr", { class: "nx-award__row", "data-item": it.id }, th, ...cells), th, cells };
        this.#pos.set(th, { r: it.id, c: 0 });
        cells.forEach((td, j) => this.#pos.set(td, { r: it.id, c: j + 1 }));
        this.#rows.set(it.id, ref);
        g?.rows.push(ref);
        tb.append(ref.tr);
      }
      return tb;
    });
    this.#footTotal = h("span", { class: "nx-award__ftotal" });
    this.#footCells = this.#suppliers.map(() => h("td"));
    this.#table!.replaceChildren(
      h("colgroup", null, h("col", { class: "nx-award__c0" }), ...this.#suppliers.map(() => h("col"))),
      h("thead", null, h("tr", null, this.#corner, ...this.#heads)),
      ...bodies,
      h("tfoot", null, h("tr", null, h("th", { scope: "row" }, h("span", null, L.awarded), this.#footTotal), ...this.#footCells)),
    );
    this.#tabEl = undefined;
    for (const ref of this.#rows.values()) this.#paintRow(ref);
  }

  #cellText(it: AwardItem, q: AwardQuote): string {
    const f = this.#fmt;
    switch (this.lens) {
      case "total":
        return this.#money(lineTotal(q, it), true);
      case "lead":
        return q.leadTime === undefined ? "—" : fill(this.#labels.days, { n: f.number(q.leadTime) });
      case "score": {
        const r = this.#recs.get(it.id)?.ranking.find((x) => x.supplier === q.supplier);
        return r ? f.number(Math.round(r.score)) : "—";
      }
      default:
        return f.number(q.price);
    }
  }

  #paintRow(ref: RowRef): void {
    const L = this.#labels;
    const { item, th, tr, cells } = ref;
    const id = item.id;
    const rec = this.#recOf(id);
    const choice = this.#choiceOf(id);
    const changed = this.#changed(id);
    const flags = this.#flags.get(id) ?? [];
    const open = this.#open === id;
    const q = choice ? this.#quotes.get(qkey(id, choice)) : undefined;
    const quoted = this.#suppliers.some((s) => this.#quotes.has(qkey(id, s.id)));
    tr.hidden = !this.#matches(id);
    tr.toggleAttribute("data-changed", changed);
    tr.toggleAttribute("data-open", open);
    th.setAttribute("aria-expanded", String(open));
    th.title = item.name;
    th.replaceChildren(
      h(
        "span",
        { class: "nx-award__iname" },
        flags.length ? glyph(WARN, this.#pending(id) ? "nx-award__warn" : "nx-award__warn is-seen") : "",
        h("span", { class: "nx-award__itext" }, item.name),
        glyph("chevron", "nx-award__chev"),
      ),
      h("span", { class: "nx-award__isub" }, this.#qty(item), q ? ` · ${this.#money(lineTotal(q, item), true)}` : quoted ? "" : ` · ${L.nobody}`, changed ? h("span", { class: "nx-award__chg" }, ` · ${L.changed}`) : ""),
      flags.length ? vh(`. ${flags.map((f) => f.message).join(". ")}`) : "",
    );
    this.#suppliers.forEach((s, j) => {
      const cell = cells[j];
      const quote = this.#quotes.get(qkey(id, s.id));
      const isRec = !!quote && rec === s.id;
      const isChosen = !!quote && choice === s.id;
      const flag = flags.find((f) => f.supplier === s.id);
      cell.toggleAttribute("data-rec", isRec);
      cell.toggleAttribute("data-chosen", isChosen);
      cell.toggleAttribute("data-none", !quote);
      cell.toggleAttribute("data-excluded", this.#excluded.has(s.id));
      if (flag) cell.dataset.tone = flag.tone;
      else delete cell.dataset.tone;
      cell.setAttribute("aria-selected", String(isChosen));
      if (quote) cell.removeAttribute("aria-disabled");
      else cell.setAttribute("aria-disabled", "true");
      cell.title = flag?.message ?? (quote?.original ? `${L.quoted}: ${quote.original}` : "");
      cell.replaceChildren(
        flag ? glyph(WARN, "nx-award__cwarn") : "",
        quote ? h("span", { class: "nx-award__v" }, this.#cellText(item, quote)) : h("span", { class: "nx-award__v", "aria-hidden": "true" }, "—"),
        isRec ? glyph(SPARK, "nx-award__spark") : "",
        quote ? "" : vh(L.noQuote),
        isRec ? vh(`, ${L.suggested}`) : "",
        flag ? vh(`. ${flag.message}`) : "",
      );
    });
  }

  #paintHeads(): void {
    const L = this.#labels;
    const sig = JSON.stringify([this.#suppliers, [...this.#excluded], this.#sup, L.excluded, this.#heads.length]);
    this.#once("heads", sig, () => this.#suppliers.forEach((s, j) => {
      const th = this.#heads[j];
      if (!th) return;
      const ex = this.#excluded.has(s.id);
      th.toggleAttribute("data-excluded", ex);
      th.setAttribute("aria-expanded", String(this.#sup === s.id));
      th.title = s.alert ?? "";
      th.replaceChildren(
        h("span", { class: "nx-award__sname" }, s.alert ? glyph(WARN, "nx-award__warn") : "", h("span", null, s.name)),
        h("span", { class: "nx-award__sdetail" }, ex ? L.excluded : (s.detail ?? "")),
        s.alert ? vh(`. ${s.alert}`) : "",
      );
    }));
  }

  #paintGroups(): void {
    const L = this.#labels;
    const view = this.#groups.map((g) => {
      let sub = 0;
      for (const r of g.rows) {
        const c = this.#choiceOf(r.item.id);
        sub += c ? lineTotal(this.#quotes.get(qkey(r.item.id, c)), r.item) : 0;
      }
      return [g.rows.some((r) => !r.tr.hidden), ` · ${fill(L.count, { n: g.rows.length })} · ${this.#money(sub, true)}`] as const;
    });
    this.#once("groups", JSON.stringify(view), () =>
      this.#groups.forEach((g, i) => {
        g.tr.hidden = !view[i][0];
        g.th.replaceChildren(h("span", null, g.name || "—", h("small", null, view[i][1])));
      }),
    );
  }

  #paintFoot(): void {
    const L = this.#labels;
    const by = new Map<string, { n: number; t: number }>();
    let total = 0;
    for (const it of this.#items) {
      const c = this.#choiceOf(it.id);
      if (!c) continue;
      const t = lineTotal(this.#quotes.get(qkey(it.id, c)), it);
      const o = by.get(c) ?? { n: 0, t: 0 };
      o.n++;
      o.t += t;
      by.set(c, o);
      total += t;
    }
    const view = this.#suppliers.map((s) => {
      const o = by.get(s.id);
      return o ? [fill(L.count, { n: o.n }), this.#money(o.t, true)] : null;
    });
    this.#once("foot", JSON.stringify([this.#money(total, true), view]), () => {
      if (this.#footTotal) this.#footTotal.textContent = this.#money(total, true);
      view.forEach((v, j) => this.#footCells[j]?.replaceChildren(...(v ? [h("span", null, v[0]), h("small", null, v[1])] : [h("small", null, "—")])));
    });
  }

  #paintSummary(): void {
    const s = this.#sum!;
    const L = this.#labels;
    const value = this.value;
    const { total, suppliers } = totalOf(this.#items, value, this.#quotes);
    const missing = this.#items.length - Object.keys(value).length;
    s.total.textContent = this.#money(total, true);
    s.totalSub.textContent = missing ? fill(L.unassigned, { n: missing }) : "";
    const ch = changesOf(this.#items, this.#choices, (i) => this.#recOf(i), this.#quotes);
    const d = ch.reduce((a, c) => a + c.delta, 0);
    s.delta.textContent = ch.length ? `${d > 0 ? "+" : d < 0 ? "−" : ""}${this.#money(Math.abs(d), true)}` : L.same;
    s.delta.dataset.tone = ch.length && d ? (d > 0 ? "up" : "down") : "";
    s.deltaSub.textContent = ch.length ? fill(ch.length === 1 ? L.changeOne : L.changeMany, { n: ch.length }) : "";
    s.orders.textContent = fill(suppliers === 1 ? L.supplierOne : L.supplierMany, { n: suppliers });
    const alerts = this.#items.filter((i) => this.#flags.get(i.id)?.length).length;
    const pending = this.#items.filter((i) => this.#pending(i.id)).length;
    s.pending.textContent = String(pending);
    s.pending.dataset.tone = pending ? "warn" : "";
    s.pendingSub.textContent = !alerts ? L.noAlerts : pending ? fill(L.pendingOf, { total: alerts }) : L.reviewed;
    s.next.hidden = !alerts;
  }

  #paintTools(): void {
    const L = this.#labels;
    const f = this.#fmt;
    this.#title!.textContent = this.heading;
    this.#title!.hidden = !this.heading;
    // Escenarios: cada uno con cuántas órdenes da y lo que cuesta frente a lo mejor por artículo.
    const field = this.#scenarioField!;
    field.hidden = !this.#scenarios.length;
    if (this.#scenarios.length) {
      const base: AwardValue = {};
      for (const it of this.#items) {
        const r = this.#recs.get(it.id)?.supplier;
        if (r && this.#quotes.has(qkey(it.id, r))) base[it.id] = r;
      }
      const bt = totalOf(this.#items, base, this.#quotes);
      const texts = [
        `${L.best} · ${fill(bt.suppliers === 1 ? L.supplierOne : L.supplierMany, { n: bt.suppliers })}`,
        ...this.#scenarios.map((sc) => {
          const v = { ...base };
          for (const [k, s] of Object.entries(sc.picks)) if (this.#quotes.has(qkey(k, s))) v[k] = s;
          const t = totalOf(this.#items, v, this.#quotes);
          const d = bt.total ? (t.total - bt.total) / bt.total : 0;
          return `${sc.label} · ${fill(t.suppliers === 1 ? L.supplierOne : L.supplierMany, { n: t.suppliers })}${Math.abs(d) >= 0.0005 ? ` · ${pct(d, f.locale, true)}` : ""}`;
        }),
      ];
      // Solo se recrean las opciones si cambian: recrearlas cierra la lista abierta.
      const sig = JSON.stringify(texts);
      if (sig !== this.#scenarioSig) {
        this.#scenarioSig = sig;
        this.#scenarioSel!.replaceChildren(...texts.map((t, i) => h("option", { value: i ? this.#scenarios[i - 1].id : "" }, t)));
      }
      this.#scenarioSel!.value = this.#scenarios.some((s) => s.id === this.#scenario) ? this.#scenario : "";
    }
    const quotes = [...this.#quotes.values()];
    const lens = this.lens;
    for (const opt of this.#lensSel!.options) opt.hidden = (opt.value === "lead" && !quotes.some((q) => q.leadTime !== undefined)) || (opt.value === "score" && ![...this.#recs.values()].some((r) => r.ranking.length));
    this.#lensSel!.value = lens;
    const counts = { all: this.#items.length, alerts: this.#items.filter((i) => this.#flags.get(i.id)?.length).length, changed: this.#items.filter((i) => this.#changed(i.id)).length };
    this.#filterBtns.forEach((b, i) => {
      const k = FILTERS[i];
      b.setAttribute("aria-pressed", String(this.#filter === k));
      b.replaceChildren(L[FILTER_LABEL[k]], h("span", { class: "nx-award__n" }, f.number(counts[k])));
    });
    this.#critBtn!.hidden = !this.#criteria.length;
    if (!this.#criteria.length) this.#crit!.hidden = true;
  }

  #paintNotes(): void {
    const L = this.#labels;
    // El aviso de «revisando» es un nodo que persiste mientras dura: su pulso no se reinicia.
    this.#once("notes", JSON.stringify([this.#isBusy, this.#failed, this.#notes, L.advising, L.error, L.retry]), () => this.#notesNow());
  }
  #notesNow(): void {
    const L = this.#labels;
    const out: HTMLElement[] = [];
    if (this.#isBusy) out.push(h("p", { class: "nx-award__note", "data-tone": "busy" }, glyph(SPARK), h("span", null, L.advising)));
    const notes = this.#failed && !this.#notes.some((n) => n.tone === "danger") ? [...this.#notes, { message: L.error, tone: "danger" as const }] : this.#notes;
    for (const n of notes) {
      const p = h("p", { class: "nx-award__note", "data-tone": n.tone }, n.tone === "neutral" ? "" : glyph(WARN), h("span", null, n.message));
      if (n.tone === "danger" && this.#failed && !this.#isBusy) {
        const retry = h("button", { type: "button", class: "nx-award__next", "data-f": "retry" }, L.retry);
        retry.addEventListener("click", () => this.refresh());
        p.append(retry);
      }
      out.push(p);
    }
    this.#notesEl!.replaceChildren(...out);
  }

  #paintSup(): void {
    const el = this.#supEl!;
    const s = this.#suppliers.find((x) => x.id === this.#sup);
    if (!s)
      return this.#once("sup", "", () => {
        el.hidden = true;
        el.replaceChildren();
      });
    this.#lastSup = s.id;
    const L = this.#labels;
    const ro = this.readonly;
    const quoted = this.#items.filter((i) => this.#quotes.has(qkey(i.id, s.id)));
    const mine = this.#items.filter((i) => this.#choiceOf(i.id) === s.id);
    const total = mine.reduce((a, i) => a + lineTotal(this.#quotes.get(qkey(i.id, s.id)), i), 0);
    const ex = this.#excluded.has(s.id);
    const btn = (text: string, key: string, run: () => void, g?: string) => {
      const b = h("button", { type: "button", class: g ? "nx-award__x" : "nx-award__btn", "data-f": `sup:${key}`, "aria-label": g ? text : null, title: g ? text : null }, g ? glyph(g) : text);
      b.addEventListener("click", run);
      return b;
    };
    const sig = JSON.stringify([s, quoted.length, mine.length, total, ex, ro, this.#bulk?.supplier, this.#bulk?.n, L]);
    this.#once("sup", sig, () => {
      el.hidden = false;
      el.replaceChildren(
      h("strong", null, s.name),
      s.detail ? h("span", null, s.detail) : "",
      h("span", null, fill(L.supplierStats, { quoted: quoted.length, awarded: mine.length, total: this.#money(total, true) })),
      s.alert ? h("span", { class: "nx-award__supalert" }, glyph(WARN), s.alert) : "",
      h(
        "span",
        { class: "nx-award__supacts" },
        ro ? "" : btn(ex ? L.include : L.exclude, "ex", () => this.#toggleExclude(s.id)),
        ro || !quoted.length ? "" : btn(L.giveAll, "all", () => this.#giveAll(s.id)),
        btn(L.close, "close", () => this.#toggleSup(null), CLOSE),
      ),
      this.#bulk?.supplier === s.id ? h("p", { class: "nx-award__bulk" }, fill(L.gaveAll, { n: this.#bulk.n, supplier: s.name }), btn(L.revert, "rev", () => this.#revert())) : "",
      );
    });
  }

  #paintDetail(): void {
    const ref = this.#open ? this.#rows.get(this.#open) : undefined;
    const id = ref && !ref.tr.hidden ? ref.item.id : "";
    // Lo que muestra el detalle: si no cambió (una recomendación que no lo toca), no se recrea.
    const sig = id ? JSON.stringify([id, this.#recs.get(id), this.#flags.get(id), this.#recOf(id), this.#choiceOf(id), this.#choices.get(id)?.supplier, this.#weights, this.#criteria, [...this.#excluded], this.readonly, this.currency, this.#fmt.locale]) : "";
    if (sig && sig === this.#detailSig && this.#detailTr?.isConnected && this.#detailTr.previousElementSibling === ref!.tr) return;
    this.#detailSig = sig;
    this.#detailTr?.remove();
    this.#detailTr = undefined;
    if (!ref || !id) return;
    this.#detailTr = h("tr", { class: "nx-award__drow" }, h("td", { colspan: this.#suppliers.length + 1 }, this.#detail(ref.item)));
    ref.tr.after(this.#detailTr);
  }

  #detail(it: AwardItem): HTMLElement {
    const L = this.#labels;
    const id = it.id;
    const ro = this.readonly;
    const rec = this.#recs.get(id);
    const r = this.#recOf(id);
    const c = this.#choiceOf(id);
    const flags = this.#flags.get(id) ?? [];
    const share = shares(this.#criteria, this.#weights);
    const rank = new Map((rec?.ranking ?? []).map((x, i) => [x.supplier, i]));
    const quoted = this.#suppliers
      .filter((s) => this.#quotes.has(qkey(id, s.id)))
      .sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || this.#quotes.get(qkey(id, a.id))!.price - this.#quotes.get(qkey(id, b.id))!.price);
    const parts: (Node | string)[] = [h("p", { class: "nx-award__dhead" }, h("strong", null, it.name), h("span", null, [it.code, this.#qty(it)].filter(Boolean).join(" · ")))];
    if (flags.length) parts.push(h("ul", { class: "nx-award__flags" }, ...flags.map((f) => h("li", { "data-tone": f.tone }, glyph(WARN), h("span", null, f.supplier ? `${this.#name(f.supplier)}: ${f.message}` : f.message)))));
    if (rec?.reason) parts.push(h("p", { class: "nx-award__ai" }, glyph(SPARK), h("span", null, rec.reason)));
    const bars = !!rec?.ranking.some((x) => contributions(x, this.#criteria, share));
    if (bars) parts.push(h("ul", { class: "nx-award__legend" }, ...this.#criteria.map((cr, k) => h("li", null, h("i", { "data-k": Math.min(k, 4) }), `${cr.label} ${pct(share[cr.id], this.#fmt.locale)}`))));
    const lines = quoted.map((s) => {
      const q = this.#quotes.get(qkey(id, s.id))!;
      const rk = rec?.ranking.find((x) => x.supplier === s.id);
      const isRec = r === s.id;
      const isChosen = c === s.id;
      const pick = h(
        "button",
        { type: "button", class: "nx-award__pick", "aria-pressed": String(isChosen), "data-f": `pick:${s.id}`, disabled: ro, "aria-label": `${fill(L.pick, { name: s.name })}${isRec ? `, ${L.suggested}` : ""}` },
        isChosen ? glyph(CHECK) : isRec ? glyph(SPARK, "nx-award__spark") : h("i"),
        h("span", null, s.name),
      );
      pick.addEventListener("click", () => this.#choose(id, s.id));
      const bar = h("span", { class: "nx-award__bar", "aria-hidden": "true" });
      if (rk) {
        const segs = contributions(rk, this.#criteria, share) ?? [Math.max(0, Math.min(100, rk.score))];
        segs.forEach((w, k) => {
          const seg = h("span", { "data-k": Math.min(k, 4) });
          seg.style.inlineSize = `${Math.round(w * 100) / 100}%`;
          bar.append(seg);
        });
      }
      const flag = flags.find((f) => f.supplier === s.id);
      const lead = q.leadTime === undefined ? "" : ` · ${fill(L.days, { n: this.#fmt.number(q.leadTime) })}`;
      const sub = [q.original && `${L.quoted}: ${q.original}`, q.note, flag?.message, this.#excluded.has(s.id) && L.excluded].filter(Boolean).join(" · ");
      return h(
        "li",
        { "data-rec": isRec, "data-chosen": isChosen, "data-tone": flag?.tone },
        pick,
        bar,
        h("span", { class: "nx-award__score" }, rk ? fill(L.points, { n: this.#fmt.number(Math.round(rk.score)) }) : ""),
        h("span", { class: "nx-award__price" }, `${this.#money(q.price)}${lead}`, h("small", null, this.#money(lineTotal(q, it), true))),
        sub ? h("span", { class: "nx-award__sub" }, sub) : "",
      );
    });
    parts.push(lines.length ? h("ol", { class: "nx-award__rank" }, ...lines) : h("p", { class: "nx-award__empty" }, L.nobody));
    const choice = this.#choices.get(id);
    if (c && choice && choice.supplier === c && c !== r) {
      const q = this.#quotes.get(qkey(id, c))!;
      const d = r ? lineTotal(q, it) - lineTotal(this.#quotes.get(qkey(id, r)), it) : 0;
      const [a, b = ""] = fill(r ? L.youChose : L.youChoseFree, { supplier: this.#name(c) }).split("{delta}");
      // El mismo campo mientras sea el mismo artículo y proveedor: lo escrito (con sus espacios) no se pierde.
      const keep = this.#reason?.item === id && this.#reason.supplier === c ? this.#reason.el : undefined;
      const input = keep ?? h("input", { class: "nx-award__reason", list: `${this.#uid}-r`, value: choice.reason ?? "", "aria-label": L.reason, placeholder: L.reason, "data-f": "reason", maxlength: "200", autocomplete: "off" });
      input.readOnly = ro;
      if (!keep) {
        input.addEventListener("input", () => {
          const ch = this.#choices.get(id);
          if (ch) ch.reason = input.value || undefined;
        });
        input.addEventListener("change", () => {
          this.#bulk = null;
          this.#queue();
          this.#emit<AwardChangeDetail>("nx-award-change", { item: id, supplier: this.#choiceOf(id), recommended: this.#recOf(id), reason: this.#choices.get(id)?.reason?.trim() || undefined, value: this.value });
        });
        this.#reason = { el: input, item: id, supplier: c };
      }
      const undo = r && !ro ? h("button", { type: "button", class: "nx-award__btn", "data-f": "undo" }, glyph(UNDO), L.undo) : "";
      if (undo) undo.addEventListener("click", () => this.#choose(id, null));
      parts.push(
        h(
          "div",
          { class: "nx-award__change" },
          h("p", null, a, r ? h("span", { "data-tone": d > 0 ? "up" : d < 0 ? "down" : "" }, `${d > 0 ? "+" : d < 0 ? "−" : ""}${this.#money(Math.abs(d))}`) : "", b),
          input,
          undo,
        ),
      );
    }
    return h("div", { class: "nx-award__detail" }, ...parts);
  }

  // ---------------------------------------------------------------- criterios y motivos

  #buildCrit(): void {
    if (!this.#built) return;
    const L = this.#labels;
    this.#critRows.clear();
    const reset = h("button", { type: "button", class: "nx-award__btn" }, L.reset);
    reset.addEventListener("click", () => {
      this.#critRows.values().next().value?.range.focus();
      this.#weights = { ...this.#baseWeights };
      this.#paintCrit();
      this.#detailDirty = true;
      this.#request(0);
    });
    this.#critReset = reset;
    this.#crit!.replaceChildren(
      ...this.#criteria.flatMap((c, k) => {
        const rid = `${this.#uid}-w${k}`;
        const range = h("input", { type: "range", id: rid, class: "nx-award__range", min: "0", max: "100", step: "1", disabled: this.readonly });
        const out = h("output", { class: "nx-award__share", for: rid });
        range.addEventListener("input", () => {
          this.#weights[c.id] = Number(range.value);
          this.#paintCrit();
          this.#detailDirty = true;
          this.#queue();
          this.#request(DEBOUNCE);
        });
        this.#critRows.set(c.id, { range, out });
        return [h("label", { for: rid }, h("i", { "data-k": Math.min(k, 4) }), c.label), range, out];
      }),
      h("div", { class: "nx-award__cfoot" }, reset),
    );
    this.#paintCrit();
  }

  #paintCrit(): void {
    const sh = shares(this.#criteria, this.#weights);
    const locale = this.#fmt.locale;
    for (const [id, row] of this.#critRows) {
      const text = pct(sh[id], locale);
      row.range.value = String(this.#weights[id] ?? 0);
      row.range.setAttribute("aria-valuetext", text);
      row.out.textContent = text;
    }
    if (this.#critReset) this.#critReset.hidden = this.#criteria.every((c) => this.#weights[c.id] === this.#baseWeights[c.id]);
  }

  #paintReasons(): void {
    this.#datalist?.replaceChildren(...this.#reasons.map((r) => h("option", { value: r })));
  }

  // ---------------------------------------------------------------- teclado y foco

  #cellEl(r: string, c: number): HTMLElement | undefined {
    if (!r) return c ? this.#heads[c - 1] : this.#corner;
    const ref = this.#rows.get(r);
    return ref && (c ? ref.cells[c - 1] : ref.th);
  }
  #visible(): string[] {
    return [...this.#rows.values()].filter((r) => !r.tr.hidden).map((r) => r.item.id);
  }
  #setTab(el: HTMLElement): void {
    if (this.#tabEl === el) return;
    if (this.#tabEl) this.#tabEl.tabIndex = -1;
    el.tabIndex = 0;
    this.#tabEl = el;
  }
  /** Una sola celda en el orden de tabulación (la activa, o la primera fila visible). */
  #syncTab(): void {
    let el = this.#active && this.#cellEl(this.#active.r, this.#active.c);
    if (!el || el.closest("tr")?.hidden) {
      this.#active = null;
      el = this.#cellEl(this.#visible()[0] ?? "", 0);
    }
    if (el) this.#setTab(el);
  }
  /** Enfoca la celda, o la de la fila visible más cercana (la suya se ocultó o ya no existe). */
  #focusNear(p: Pos): void {
    const c = Math.min(p.c, this.#suppliers.length);
    if (!p.r) return this.#focus("", c);
    const order = [...this.#rows.keys()];
    const shown = (id: string | undefined) => id !== undefined && !this.#rows.get(id)!.tr.hidden;
    const i = order.indexOf(p.r);
    let r = shown(p.r) ? p.r : undefined;
    for (let k = 1; !r && i >= 0 && k < order.length; k++) r = [order[i + k], order[i - k]].find(shown);
    r ??= this.#visible()[0];
    this.#focus(r ?? "", r ? c : 0);
  }
  #focus(r: string, c: number): void {
    const el = this.#cellEl(r, c);
    if (!el) return;
    this.#active = { r, c };
    this.#setTab(el);
    el.focus();
  }

  #activate(p: Pos): void {
    if (!p.r) {
      if (p.c) this.#toggleSup(this.#suppliers[p.c - 1].id);
      return;
    }
    if (!p.c) return this.#setOpen(this.#open === p.r ? null : p.r);
    this.#choose(p.r, this.#suppliers[p.c - 1].id);
  }

  #onClick(e: MouseEvent): void {
    const cell = (e.target as Element).closest?.("th, td");
    const p = cell && this.#pos.get(cell);
    if (p) this.#activate(p);
  }

  #onKey(e: KeyboardEvent): void {
    const p = this.#pos.get(e.target as Element);
    if (e.key === "Escape" && this.#open && (p?.r === this.#open || this.#detailTr?.contains(e.target as Node))) {
      e.preventDefault();
      e.stopPropagation();
      const id = this.#open;
      this.#setOpen(null);
      this.#flushNow();
      return this.#focus(id, 0);
    }
    if (!p || e.altKey) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      return this.#activate(p);
    }
    if (p.r && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      return this.#choose(p.r, null);
    }
    if (!e.ctrlKey && !e.metaKey && (e.key === "j" || e.key === "k")) {
      e.preventDefault();
      return this.next(e.key === "j" ? 1 : -1);
    }
    const rows = ["", ...this.#visible()];
    const m = gridMove(e.key, rows.indexOf(p.r), p.c, rows.length, this.#suppliers.length + 1, e.ctrlKey || e.metaKey);
    if (!m) return;
    e.preventDefault();
    this.#focus(rows[m[0]], m[1]);
  }
}
