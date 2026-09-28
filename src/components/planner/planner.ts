/**
 * `<nx-planner>`: agenda de recursos. Personas, vehículos, máquinas o salas en filas y el tiempo en
 * columnas (día, semana o mes), con las reservas como barras que se mueven, se estiran y se crean
 * arrastrando o con el teclado.
 *
 * Nada espera al servidor: el cambio se pinta al soltar, sale `nx-planner-change` (cancelable) y, si
 * hay `endpoint`, el `PATCH`; si la app lo cancela o el servidor falla, vuelve a su lugar con un
 * aviso. El último cambio se deshace con el aviso o con Ctrl/⌘+Z (el aviso, `nxToast`, se carga
 * con `import()` la primera vez).
 *
 * Solo se pinta lo que se ve: las filas por su altura (una por carril de reservas solapadas) y las
 * columnas por su ancho, con un margen. Durante el arrastre solo se mueve una sombra con `transform`.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeEndpoint, safeImageSrc } from "../../core/dom";
import { glyph, hasIcon, icon, initials } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import {
  addDays,
  cleanBookings,
  cleanDates,
  cleanResources,
  cleanWorkdays,
  fill,
  plannerClashes,
  plannerColumns,
  plannerDate,
  plannerHours,
  plannerISO,
  plannerLanes,
  plannerMove,
  plannerOccupancy,
  plannerParse,
  plannerRange,
  plannerResize,
  plannerSpan,
  plannerStep,
  plannerTime,
  plannerX,
  type PlannerColumn,
  type PlannerItem,
  type Span,
} from "./logic";
import type { PlannerBooking, PlannerLabels, PlannerPlace, PlannerResource, PlannerView, PlannerVia } from "./types";

export const PLANNER_LABELS: PlannerLabels = {
  grid: "Agenda de recursos",
  resources: "Recursos",
  today: "Hoy",
  prev: "Anterior",
  next: "Siguiente",
  date: "Ir a la fecha",
  day: "Día",
  week: "Semana",
  month: "Mes",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
  booking: "reserva",
  hint: "Flechas: recurso y franja; Enter crea en la franja o abre la reserva. En una reserva: flechas la mueven, Mayús+flechas cambian la duración, Supr la elimina, Escape vuelve a la rejilla.",
  cell: "{resource}, {when}",
  free: "libre",
  newBooking: "Nueva reserva",
  confirmed: "Confirmada",
  tentative: "Tentativa",
  active: "En curso",
  block: "Bloqueo",
  clash: "Choque",
  clashDetail: "{n} a la vez, capacidad {cap}",
  clashes: "{n} con choque",
  summary: "{n}/{total}",
  moved: "{title} → {resource} · {when}",
  created: "{title} creada · {resource} · {when}",
  deleted: "{title} eliminada",
  reverted: "{reason}. {title} volvió a su lugar.",
  rejected: "Cambio no permitido",
  failed: "No se pudo guardar",
  undone: "Deshecho",
  loading: "Cargando…",
  loadError: "No se pudo cargar la agenda",
  empty: "Sin recursos",
  collapse: "Plegar {group}",
  expand: "Desplegar {group}",
};

const PROPS = ["resources", "bookings", "view", "date", "snap", "hours", "workdays", "holidays", "summary", "source", "endpoint", "readonly", "locale", "labels"] as const;
const JSON_ATTRS = new Set(["resources", "bookings", "workdays", "holidays", "labels"]);
/** Alto de un carril, relleno de la fila, fila de grupo y encabezado (con y sin la fila de ocupación). */
const LANE = 38;
const PAD = 3;
const GROUP_H = 30;
const HEAD_H = 44;
const SUM_H = 22;
const ZOOM = [0.5, 0.75, 1, 1.5, 2, 3];
/** Ancho base de una hora (día), de un día (semana) y de un día (mes). */
const BASE: Record<PlannerView, number> = { day: 64, week: 150, month: 44 };
const VIEWS: PlannerView[] = ["day", "week", "month"];
const MIN = 6e4;
/** Con el dedo se arrastra manteniendo pulsado; antes, deslizar es desplazarse. */
const PRESS_MS = 300;
const SLOP = 4;
const EDGE = 40;
const SPEED = 18;
/** Tras la última flecha sobre una reserva, esto sin tocar nada y el cambio se registra. */
const KB_IDLE = 700;
const CHEV = '<path d="m15 18-6-6 6-6"/>';

type Place = { resource: string; start: number; end: number };
type Row = { top: number; h: number; g?: string; r?: PlannerResource; n?: number; items: PlannerItem[]; lanes: number[]; clash: Set<number>; peak: number };
type Op = { k: "change" | "create" | "delete"; b: PlannerBooking; from?: Place; to?: Place };
type Drag = { mode: "move" | "start" | "end" | "create"; it?: PlannerItem; row: Row; pid: number; cx: number; cy: number; x0: number; y0: number; on: boolean; touch: boolean; timer: number; raf: number; ghost?: HTMLElement; to?: Place };

let uid = 0;
const fmts = new Map<string, Intl.DateTimeFormat>();
function dtf(locale: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = locale + JSON.stringify(o);
  let f = fmts.get(k);
  if (!f) fmts.set(k, (f = new Intl.DateTimeFormat(locale, o)));
  return f;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const WHEN: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" };
const iso = (p: Place): PlannerPlace => ({ resource: p.resource, start: plannerISO(p.start), end: plannerISO(p.end) });
const same = (a?: Place, b?: Place) => !!a && !!b && a.resource === b.resource && a.start === b.start && a.end === b.end;
const placeOf = (it: PlannerItem): Place => ({ resource: it.b.resource, start: it.start, end: it.end });
/** Cuánto desplazar cerca de un borde (negativo hacia el inicio). */
const edge = (p: number, lo: number, hi: number) => (p < lo + EDGE ? -Math.ceil((SPEED * Math.min(EDGE, lo + EDGE - p)) / EDGE) : p > hi - EDGE ? Math.ceil((SPEED * Math.min(EDGE, p - hi + EDGE)) / EDGE) : 0);
const newId = () => globalThis.crypto?.randomUUID?.() ?? `nx-${Date.now().toString(36)}-${++uid}`;

export class NxPlanner extends Base {
  static observedAttributes = ["resources", "bookings", "view", "date", "snap", "hours", "workdays", "holidays", "summary", "source", "endpoint", "readonly", "locale", "labels"];

  #uid = `nx-planner${++uid}`;
  #res: PlannerResource[] = [];
  #items: PlannerItem[] = [];
  #byId = new Map<string, PlannerItem>();
  #labels: PlannerLabels = PLANNER_LABELS;
  #holidays = new Set<string>();
  #workdays = cleanWorkdays(null);
  /** El día que se mira (ms) y el nivel de zoom. */
  #t = Date.now();
  #z = 2;
  #folded = new Set<string>();
  #cols: PlannerColumn[] = [];
  #cw = 150;
  #range: Span = { start: 0, end: 0 };
  #rows: Row[] = [];
  #occ: number[] = [];
  #bodyH = 0;
  #resW = 208;
  #win = "";
  #sel = "";
  #cur: { rid: string; c: number } | null = null;
  #drag: Drag | null = null;
  #kb: { b: PlannerBooking; from: Place; timer: number } | null = null;
  #last: Op | null = null;
  #pending = new Set<string>();
  /** Cambia cuando llegan datos nuevos: lo que estaba en vuelo ya no los revierte. */
  #gen = 0;
  #moving = false;
  #built = false;
  #homed = false;
  #raf = 0;
  #clock = 0;
  #loadT = 0;
  #wheel = 0;
  #ac?: AbortController;
  #tc?: AbortController;
  #ro?: ResizeObserver;
  #bar?: HTMLElement;
  #title?: HTMLElement;
  #pick?: HTMLInputElement;
  #clashBtn?: HTMLButtonElement;
  #scroll?: HTMLElement;
  #canvas?: HTMLElement;
  #head?: HTMLElement;
  #corner?: HTMLElement;
  #hcols?: HTMLElement;
  #bg?: HTMLElement;
  #rowsEl?: HTMLElement;
  #live?: HTMLElement;
  #hint?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** `[{id, name, detail?, avatar?, icon?, group?, capacity?}]`, en orden. */
  get resources(): PlannerResource[] {
    return this.#res;
  }
  set resources(v: PlannerResource[] | null | undefined) {
    this.#stop();
    this.#res = cleanResources(v);
    this.#layout();
  }
  /** Las reservas en su estado actual (con los cambios ya aplicados). */
  get bookings(): PlannerBooking[] {
    return this.#items.map((i) => i.b);
  }
  set bookings(v: PlannerBooking[] | null | undefined) {
    this.#stop();
    this.#items = cleanBookings(v);
    this.#byId = new Map(this.#items.map((i) => [i.b.id, i]));
    this.#gen++;
    this.#layout();
  }
  get view(): PlannerView {
    const v = this.getAttribute("view") as PlannerView;
    return VIEWS.includes(v) ? v : "week";
  }
  set view(v: PlannerView) {
    this.setAttribute("view", v);
  }
  /** El día a la vista (ISO). */
  get date(): string {
    return plannerDate(this.#t);
  }
  set date(v: string) {
    this.goTo(v);
  }
  /** Minutos de la rejilla (15 en día, 30 en semana; en mes, siempre un día). */
  get snap(): number {
    const n = Number(this.getAttribute("snap"));
    return this.view === "month" ? Math.max(1440, n || 0) : n > 0 ? Math.min(n, 1440) : this.view === "day" ? 15 : 30;
  }
  set snap(v: number) {
    this.setAttribute("snap", String(v));
  }
  get hours(): string {
    return this.getAttribute("hours") ?? "";
  }
  set hours(v: string) {
    this.setAttribute("hours", v);
  }
  get workdays(): number[] {
    return [...this.#workdays];
  }
  set workdays(v: number[] | null | undefined) {
    this.#workdays = cleanWorkdays(v);
    this.#layout();
  }
  get holidays(): string[] {
    return [...this.#holidays];
  }
  set holidays(v: string[] | null | undefined) {
    this.#holidays = new Set(cleanDates(v));
    this.#layout();
  }
  /** Fila de ocupación: `true`, o el nombre de lo que se cuenta («camiones»). */
  get summary(): boolean | string {
    const v = this.getAttribute("summary");
    return v === null || v === "false" ? false : v || true;
  }
  set summary(v: boolean | string) {
    if (v === false || v === null || v === undefined) this.removeAttribute("summary");
    else this.setAttribute("summary", v === true ? "" : String(v));
  }
  get source(): string {
    return this.getAttribute("source") ?? "";
  }
  set source(v: string) {
    this.setAttribute("source", v);
  }
  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }
  set endpoint(v: string) {
    this.setAttribute("endpoint", v);
  }
  get readonly(): boolean {
    return boolAttr(this, "readonly");
  }
  set readonly(v: boolean) {
    this.toggleAttribute("readonly", !!v);
  }
  /** Formato de fechas y horas («es-CO», «en-US»…); si no, el `lang` más cercano. */
  get locale(): string {
    return this.getAttribute("locale") ?? "";
  }
  set locale(v: string) {
    this.setAttribute("locale", v);
  }
  get labels(): PlannerLabels {
    return this.#labels;
  }
  set labels(v: Partial<PlannerLabels> | null | undefined) {
    this.#labels = mergeLabels(PLANNER_LABELS, v);
    this.#layout();
  }

  // ---------------------------------------------------------------- métodos

  /** Lleva la vista al período que contiene `date` (ISO o `Date`). */
  goTo(date: string | Date): void {
    const t = date instanceof Date ? date.getTime() : plannerParse(date);
    if (t === null || !Number.isFinite(t)) return;
    this.#t = t;
    this.#period();
  }
  today(): void {
    this.goTo(new Date());
  }
  /** Muestra una reserva (cambia de período y despliega su grupo si hace falta). `false` si no existe. */
  scrollToBooking(id: string): boolean {
    const it = this.#byId.get(String(id));
    if (!it) return false;
    if (it.end <= this.#range.start || it.start >= this.#range.end) {
      this.#t = it.start;
      this.#period(false);
    }
    const g = this.#res.find((r) => r.id === it.b.resource)?.group;
    if (g && this.#folded.delete(g)) this.#layout();
    const row = this.#rows.find((r) => r.r?.id === it.b.resource);
    if (!row || !this.#built) return !!row;
    this.#sel = it.b.id;
    this.#reveal(this.#xOf(it.start), this.#xOf(it.end) - this.#xOf(it.start), row.top, row.h);
    this.#paint(true);
    return true;
  }
  /** Deshace el último cambio (mover, crear o borrar). `false` si no había nada. */
  async undo(): Promise<boolean> {
    this.#tc?.abort();
    this.#tc = undefined;
    if (this.#kb) return this.#cancelKb(), true;
    const op = this.#last;
    this.#last = null;
    if (!op) return false;
    const id = op.b.id;
    const it = this.#byId.get(id);
    if (op.k === "delete") return !this.#byId.has(id) && this.#run({ k: "create", b: op.b, to: op.from }, "undo");
    if (!it || !same(placeOf(it), op.to)) return false;
    return this.#run(op.k === "create" ? { k: "delete", b: it.b, from: op.to } : { k: "change", b: it.b, from: op.to, to: op.from }, "undo");
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
    if (typeof ResizeObserver !== "undefined" && !this.#ro) {
      this.#ro = new ResizeObserver(() => this.#measure());
      this.#ro.observe(this.#scroll!);
    }
    this.#clock = window.setInterval(() => this.#paintNow(), 60_000);
    this.#period(!this.#homed);
  }

  disconnectedCallback(): void {
    this.#stop();
    this.#ro?.disconnect();
    this.#ro = undefined;
    clearInterval(this.#clock);
    clearTimeout(this.#loadT);
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#ac?.abort();
    this.#ac = undefined;
    this.#tc?.abort();
    this.#tc = undefined;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (JSON_ATTRS.has(name)) {
      if (value === null) return;
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-planner] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "date") return value ? this.goTo(value) : undefined;
    if (name === "view" || name === "source") return old === value ? undefined : this.#period(name === "view");
    this.#layout();
  }

  // ---------------------------------------------------------------- estructura

  #build(): void {
    this.#built = true;
    const btn = (act: string, content: Node | string, cls = "") => h("button", { type: "button", class: `nx-planner__btn ${cls}`.trim(), "data-act": act }, content);
    this.#title = h("h2", { class: "nx-planner__title", "aria-live": "polite" });
    this.#pick = h("input", { type: "date", class: "nx-planner__pick" });
    this.#clashBtn = btn("clash", "", "nx-planner__clashes") as HTMLButtonElement;
    this.#bar = h(
      "div",
      { class: "nx-planner__bar" },
      h("div", { class: "nx-planner__nav" }, btn("today", ""), btn("prev", glyph(CHEV)), btn("next", glyph(CHEV))),
      this.#title,
      this.#pick,
      this.#clashBtn,
      h("div", { class: "nx-planner__seg", role: "group" }, ...VIEWS.map((v) => h("button", { type: "button", class: "nx-planner__btn", "data-view": v }))),
      h("div", { class: "nx-planner__seg" }, btn("out", "−"), btn("in", "+")),
    );
    this.#corner = h("div", { class: "nx-planner__corner", role: "columnheader" });
    this.#hcols = h("div", { class: "nx-planner__hcols" });
    this.#head = h("div", { class: "nx-planner__head", role: "row" }, this.#corner, this.#hcols);
    this.#bg = h("div", { class: "nx-planner__bg", "aria-hidden": "true" });
    this.#rowsEl = h("div", { class: "nx-planner__rows" });
    this.#canvas = h("div", { class: "nx-planner__canvas" }, this.#head, h("div", { class: "nx-planner__body" }, this.#bg, this.#rowsEl));
    this.#hint = h("p", { class: "nx-planner__sr", id: `${this.#uid}-hint` });
    this.#scroll = h("div", { class: "nx-planner__scroll", role: "grid", tabindex: "0", "aria-describedby": this.#hint.id }, this.#canvas);
    this.#live = h("div", { class: "nx-planner__sr", "aria-live": "polite", "aria-atomic": "true" });
    this.append(this.#bar, this.#scroll, this.#hint, this.#live);

    this.#bar.addEventListener("click", this.#barClick);
    this.#pick.addEventListener("change", () => this.#pick!.value && this.goTo(this.#pick!.value));
    this.#scroll.addEventListener("scroll", () => this.#soon());
    this.#scroll.addEventListener("wheel", this.#onWheel, { passive: false });
    this.#scroll.addEventListener("pointerdown", this.#down);
    this.#scroll.addEventListener("click", this.#click);
    this.#scroll.addEventListener("focus", () => this.#showCursor());
    this.#scroll.addEventListener("blur", () => this.#showCursor(false));
    this.addEventListener("keydown", this.#key);
    this.addEventListener("focusout", (e) => {
      const to = e.relatedTarget as Element | null;
      if (this.#kb && !this.#moving && to?.closest?.(".nx-planner__bk")?.getAttribute("data-id") !== this.#kb.b.id) this.#flushKb();
    });
    this.addEventListener("dragstart", (e) => e.preventDefault());
    this.addEventListener("touchmove", (e) => this.#drag?.on && e.preventDefault(), { passive: false });
    this.addEventListener("contextmenu", (e) => this.#drag && e.preventDefault());
  }

  // ---------------------------------------------------------------- estado → geometría

  get #hrs(): [number, number] | null {
    return plannerHours(this.hours);
  }
  #xOf(t: number): number {
    return plannerX(this.#cols, t, this.#cw);
  }
  #tOf(x: number): number {
    return plannerTime(this.#cols, x, this.#cw);
  }
  #headH(): number {
    return HEAD_H + (this.summary !== false ? SUM_H : 0);
  }
  #locale(): string {
    return resolveLocale(this);
  }
  #when(a: number, b: number): string {
    const f = dtf(this.#locale(), WHEN);
    return b > a && f.formatRange ? f.formatRange(a, b) : f.format(a);
  }
  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(`nx-planner-${type}`, { detail, bubbles: true, composed: true, cancelable }));
  }
  #say(text: string): void {
    if (this.#live) this.#live.textContent = text;
  }

  /** Cambió el día o la vista: columnas nuevas, título, aviso del rango y, con `source`, a pedir datos. */
  #period(home = true): void {
    if (!this.#built) return;
    const view = this.view;
    this.#range = plannerRange(view, this.#t);
    this.#win = "";
    this.#layout();
    if (home) this.#home();
    this.#homed = true;
    const r = this.#range;
    this.#emit("range", { from: plannerISO(r.start), to: plannerISO(r.end), view });
    // Lo que venía en camino era de otro período (o de otro `source`): se aborta ya.
    clearTimeout(this.#loadT);
    this.#ac?.abort();
    if (this.source) this.#loadT = window.setTimeout(() => void this.#load(), 200);
    else this.removeAttribute("aria-busy");
  }

  /** Columnas y ancho según vista y zoom. */
  #layoutCols(): void {
    const view = this.view;
    const z = ZOOM[this.#z];
    const slot = view === "day" ? (z >= 2 ? 15 : z >= 1.5 ? 30 : 60) : 0;
    this.#cols = plannerColumns(view, this.#t, { hours: this.#hrs, slot });
    this.#cw = Math.max(20, Math.round(view === "day" ? (BASE.day * z * slot) / 60 : BASE[view] * z));
  }

  /** Filas (grupos y recursos con sus carriles y choques), ocupación y alturas. Luego pinta. */
  #layout(): void {
    if (!this.#built || !this.#range.end) return;
    this.#layoutCols();
    const { start, end } = this.#range;
    const by = new Map<string, PlannerItem[]>(this.#res.map((r) => [r.id, []]));
    for (const it of this.#items) if (it.end > start && it.start < end) by.get(it.b.resource)?.push(it);
    const groups = new Map<string, PlannerResource[]>();
    for (const r of this.#res) {
      const g = r.group ?? "";
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g)!.push(r);
    }
    const rows: Row[] = [];
    let top = 0;
    let clashes = 0;
    const empty = { items: [], lanes: [], clash: new Set<number>(), peak: 0 };
    // Sin grupo, primero y sin encabezado.
    for (const [g, list] of [...groups].sort((a, b) => (a[0] ? 1 : 0) - (b[0] ? 1 : 0))) {
      const info = list.map((r) => {
        const items = by.get(r.id)!.sort((a, b) => a.start - b.start);
        const { lanes, count } = plannerLanes(items);
        const { clash, peak } = plannerClashes(items.map((i) => ({ start: i.start, end: i.end, status: i.b.status })), r.capacity ?? 1);
        if (clash.size) clashes++;
        return { top: 0, h: Math.max(1, count) * LANE + 2 * PAD, r, items, lanes, clash, peak } as Row;
      });
      if (g) {
        rows.push({ ...empty, top, h: GROUP_H, g, n: list.length, clash: new Set(info.some((i) => i.clash.size) ? [0] : []) });
        top += GROUP_H;
        if (this.#folded.has(g)) continue;
      }
      for (const row of info) {
        row.top = top;
        top += row.h;
        rows.push(row);
      }
    }
    this.#rows = rows;
    this.#bodyH = top;
    this.#occ = this.summary !== false ? plannerOccupancy(by.values(), this.#cols) : [];
    this.#clashBtn!.hidden = !clashes;
    this.#clashBtn!.textContent = fill(this.#labels.clashes, { n: clashes });
    this.#render();
  }

  /** Lo que depende de los textos y atributos simples, y el pintado completo. */
  #render(): void {
    if (!this.#built || !this.#range.end) return;
    const L = this.#labels;
    const bar = this.#bar!;
    const view = this.view;
    const r = this.#range;
    const lo = this.#locale();
    this.setAttribute("data-view", view);
    this.#title!.textContent = cap(
      view === "month"
        ? dtf(lo, { month: "long", year: "numeric" }).format(r.start)
        : view === "week"
          ? dtf(lo, { day: "numeric", month: "short", year: "numeric" }).formatRange(r.start, addDays(r.end, -1)).replace(/ de /g, " ")
          : dtf(lo, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(r.start),
    );
    this.#pick!.value = plannerDate(this.#t);
    const b = (sel: string) => bar.querySelector<HTMLElement>(sel)!;
    b('[data-act="today"]').textContent = L.today;
    b('[data-act="prev"]').setAttribute("aria-label", L.prev);
    b('[data-act="next"]').setAttribute("aria-label", L.next);
    b('[data-act="out"]').setAttribute("aria-label", L.zoomOut);
    b('[data-act="in"]').setAttribute("aria-label", L.zoomIn);
    (b('[data-act="out"]') as HTMLButtonElement).disabled = this.#z === 0;
    (b('[data-act="in"]') as HTMLButtonElement).disabled = this.#z === ZOOM.length - 1;
    for (const v of VIEWS) {
      const el = b(`[data-view="${v}"]`);
      el.textContent = L[v];
      el.setAttribute("aria-pressed", String(v === this.view));
    }
    this.#pick!.setAttribute("aria-label", L.date);
    this.#corner!.textContent = L.resources;
    this.#hint!.textContent = L.hint;
    this.#scroll!.setAttribute("aria-label", L.grid);
    this.#scroll!.setAttribute("aria-rowcount", String(this.#rows.length + 1));
    this.#scroll!.setAttribute("aria-readonly", String(this.readonly));
    const hh = this.#headH();
    this.#head!.style.blockSize = `${hh}px`;
    this.#canvas!.style.inlineSize = `calc(var(--_res) + ${this.#cols.length * this.#cw}px)`;
    this.#canvas!.style.setProperty("--_cw", `${this.#cw}px`);
    (this.#rowsEl!.parentElement as HTMLElement).style.blockSize = `${Math.max(this.#bodyH, 1)}px`;
    this.#rowsEl!.toggleAttribute("data-empty", !this.#res.length);
    this.#rowsEl!.setAttribute("data-empty-text", L.empty);
    this.#measure(false);
    this.#paint(true);
  }

  /** El ancho real de la columna de recursos (cambia con el ancho del componente). */
  #measure(paint = true): void {
    this.#resW = this.#corner?.offsetWidth || 208;
    if (paint) this.#paint(true);
  }

  #soon(): void {
    if (this.#raf) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      this.#paint();
    });
  }

  /** Dónde empieza la vista: «ahora» si está en el período; si no, el comienzo del horario (en día)
   *  o del período. */
  #anchor(): number {
    const now = Date.now();
    const hrs = this.#hrs;
    return now >= this.#range.start && now < this.#range.end ? now : this.view === "day" && hrs ? new Date(this.#range.start).setHours(0, hrs[0]) : this.#range.start;
  }

  /** Al cambiar de período, a donde empieza la vista (con «ahora», un poco de contexto antes). La
   *  posición vertical se conserva: con cientos de recursos, cambiar de semana no vuelve arriba. */
  #home(): void {
    const t = this.#anchor();
    this.#scroll!.scrollLeft = Math.max(0, this.#xOf(t) - (t === this.#range.start ? 0 : t === Date.now() ? 96 : 8));
    this.#paint(true);
  }

  /** Desplaza lo mínimo para que se vea un tramo (coordenadas de la línea de tiempo y del cuerpo). */
  #reveal(x: number, w: number, top: number, hgt: number): void {
    const s = this.#scroll!;
    const vw = (s.clientWidth || 1000) - this.#resW;
    const vh = (s.clientHeight || 600) - this.#headH();
    if (x < s.scrollLeft || w > vw) s.scrollLeft = Math.max(0, x - 8);
    else if (x + w > s.scrollLeft + vw) s.scrollLeft = x + w - vw + 8;
    if (top < s.scrollTop) s.scrollTop = top;
    else if (top + hgt > s.scrollTop + vh) s.scrollTop = top + hgt - vh;
  }

  // ---------------------------------------------------------------- pintado

  /** Pinta lo visible (y un margen): columnas del encabezado, franjas sombreadas y filas. */
  #paint(force = false): void {
    if (!this.#built || !this.#range.end) return;
    const s = this.#scroll!;
    const cw = this.#cw;
    const vw = s.clientWidth || 1000;
    const vh = s.clientHeight || 600;
    const c0 = Math.max(0, Math.floor(s.scrollLeft / cw) - 4);
    const c1 = Math.min(this.#cols.length, Math.ceil((s.scrollLeft + vw) / cw) + 4);
    const rows = this.#rows;
    const y0 = s.scrollTop - 240;
    const y1 = s.scrollTop + vh + 240;
    let r0 = 0;
    for (let lo = 0, hi = rows.length - 1; lo <= hi; ) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].top + rows[mid].h < y0) lo = r0 = mid + 1;
      else hi = mid - 1;
    }
    let r1 = r0;
    while (r1 < rows.length && rows[r1].top < y1) r1++;
    const key = `${c0},${c1},${r0},${r1}`;
    if (!force && key === this.#win) return;
    this.#win = key;

    const a = document.activeElement as HTMLElement | null;
    const focusId = a && this.#rowsEl!.contains(a) ? a.dataset.id : undefined;
    this.#moving = true;
    try {
      this.#paintHead(c0, c1);
      this.#paintBg(c0, c1);
      const els: HTMLElement[] = [];
      for (let i = r0; i < r1; i++) els.push(this.#rowEl(rows[i], i, c0 * cw, c1 * cw));
      this.#rowsEl!.replaceChildren(...els);
      if (this.#drag?.ghost) this.#rowsEl!.append(this.#drag.ghost);
      if (focusId) (this.#bkEl(focusId) ?? s).focus({ preventScroll: true });
      this.#showCursor(false);
    } finally {
      this.#moving = false;
    }
  }

  /** Un día libre: no laborable o festivo. */
  #off(day: number): boolean {
    return !this.#workdays.has(new Date(day).getDay()) || this.#holidays.has(plannerDate(day));
  }

  #paintHead(c0: number, c1: number): void {
    const view = this.view;
    const lo = this.#locale();
    const cw = this.#cw;
    const hrs = this.#hrs;
    const today = plannerDate(Date.now());
    const total = this.#res.length;
    const unit = typeof this.summary === "string" ? ` ${this.summary}` : "";
    const cells: HTMLElement[] = [];
    for (let i = c0; i < c1; i++) {
      const c = this.#cols[i];
      const m = new Date(c.start).getHours() * 60 + new Date(c.start).getMinutes();
      const outH = view === "day" && !!hrs && (m < hrs[0] || m >= hrs[1]);
      let text: (Node | string)[] = [];
      if (view === "day") text = m % 60 ? [] : [dtf(lo, { hour: "numeric" }).format(c.start)];
      else if (view === "week") text = [cap(dtf(lo, { weekday: "short", day: "numeric" }).format(c.day))];
      else text = [h("small", null, dtf(lo, { weekday: "narrow" }).format(c.day)), String(new Date(c.day).getDate())];
      const cell = h(
        "div",
        {
          class: "nx-planner__hc",
          role: "columnheader",
          "aria-label": view === "day" ? this.#when(c.start, c.end) : dtf(lo, { weekday: "long", day: "numeric", month: "long" }).format(c.day),
          "data-off": this.#off(c.day) || outH || null,
          "data-today": view !== "day" && plannerDate(c.day) === today ? "" : null,
          "data-hour": view === "day" && !(m % 60) ? "" : null,
          style: `inset-inline-start:${i * cw}px;inline-size:${cw}px`,
        },
        h("span", { class: "nx-planner__hl" }, ...text),
      );
      if (this.#occ.length) {
        const n = this.#occ[i] ?? 0;
        cell.append(
          h(
            "span",
            { class: "nx-planner__sum", "data-full": total && n >= total ? "" : null, title: `${fill(this.#labels.summary, { n, total })}${unit}` },
            h("i", { style: `inline-size:${total ? Math.min(100, (n / total) * 100) : 0}%` }),
            fill(this.#labels.summary, { n, total }),
          ),
        );
      }
      cells.push(cell);
    }
    this.#hcols!.replaceChildren(...cells);
  }

  #paintBg(c0: number, c1: number): void {
    const cw = this.#cw;
    const hrs = this.#hrs;
    const out: HTMLElement[] = [];
    for (let i = c0; i < c1; i++) {
      const c = this.#cols[i];
      const d = new Date(c.start);
      const m = d.getHours() * 60 + d.getMinutes();
      if (this.#off(c.day) || (this.view === "day" && hrs && (m < hrs[0] || m >= hrs[1]))) out.push(h("i", { class: "nx-planner__off", style: `inset-inline-start:${i * cw}px;inline-size:${cw}px` }));
    }
    this.#bg!.replaceChildren(...out, h("i", { class: "nx-planner__now", hidden: true }));
    this.#paintNow();
  }

  #paintNow(): void {
    const now = Date.now();
    const el = this.#bg?.querySelector<HTMLElement>(".nx-planner__now");
    if (!el) return;
    el.hidden = !(now >= this.#range.start && now < this.#range.end);
    el.style.insetInlineStart = `${this.#xOf(now)}px`;
  }

  #rowEl(row: Row, i: number, x0: number, x1: number): HTMLElement {
    const L = this.#labels;
    const el = h("div", { class: "nx-planner__row", role: "row", "aria-rowindex": i + 2, "data-i": i, style: `inset-block-start:${row.top}px;block-size:${row.h}px`, "data-clash": row.clash.size ? "" : null });
    if (row.g) {
      const open = !this.#folded.has(row.g);
      el.classList.add("nx-planner__grp");
      el.append(
        h(
          "div",
          { class: "nx-planner__res", role: "rowheader" },
          h("button", { type: "button", class: "nx-planner__fold", "data-group": row.g, "aria-expanded": String(open), title: fill(open ? L.collapse : L.expand, { group: row.g }) }, glyph("chevron"), row.g, h("span", { class: "nx-planner__n" }, String(row.n))),
        ),
      );
      return el;
    }
    const r = row.r!;
    const src = safeImageSrc(r.avatar);
    const pic = src ? h("img", { class: "nx-planner__pic", src, alt: "", referrerpolicy: "no-referrer", loading: "lazy" }) : hasIcon(r.icon) ? icon(r.icon, r.name) : h("span", { class: "nx-planner__pic", "aria-hidden": "true" }, initials(r.name));
    const warn = row.clash.size ? this.#clashText(row) : "";
    el.append(
      h(
        "div",
        { class: "nx-planner__res", role: "rowheader", title: warn || null },
        pic,
        h("span", { class: "nx-planner__who" }, h("b", null, r.name), r.detail ? h("span", null, r.detail) : null),
        warn ? h("span", { class: "nx-planner__warn" }, "!", h("span", { class: "nx-planner__sr" }, warn)) : null,
      ),
    );
    const lane = h("div", { class: "nx-planner__lane" });
    const edit = !this.readonly;
    row.items.forEach((it, k) => {
      const a = this.#xOf(it.start);
      const b = this.#xOf(it.end);
      if (b < x0 || a > x1) return;
      const bk = it.b;
      const clash = row.clash.has(k);
      const status = bk.status ? L[bk.status] : "";
      const label = [r.name, bk.title, this.#when(it.start, it.end), status, clash ? warn : ""].filter(Boolean).join(" · ");
      const bar = h(
        "div",
        {
          class: "nx-planner__bk",
          role: "gridcell",
          tabindex: "-1",
          "data-id": bk.id,
          "data-status": bk.status ?? "confirmed",
          "data-clash": clash ? "" : null,
          "data-selected": bk.id === this.#sel ? "" : null,
          "data-drag": this.#drag?.on && this.#drag.it === it ? "" : null,
          "aria-busy": this.#pending.has(bk.id) ? "true" : null,
          "aria-roledescription": L.booking,
          "aria-label": label,
          // Con el puntero, lo mismo al pasar por encima (las barras cortas no muestran el título entero).
          title: label,
          style: `inset-inline-start:${a}px;inline-size:${Math.max(4, b - a - 1)}px;inset-block-start:${row.lanes[k] * LANE + PAD}px${bk.color ? `;--_c:${bk.color}` : ""}`,
        },
        h("span", { class: "nx-planner__bt" }, bk.title),
        bk.detail ? h("span", { class: "nx-planner__bd" }, bk.detail) : null,
      );
      if (edit && !bk.readonly) bar.append(h("span", { class: "nx-planner__grip", "data-edge": "start" }), h("span", { class: "nx-planner__grip", "data-edge": "end" }));
      lane.append(bar);
    });
    el.append(lane);
    return el;
  }

  #clashText(row: Row): string {
    return `${this.#labels.clash}: ${fill(this.#labels.clashDetail, { n: row.peak, cap: row.r!.capacity ?? 1 })}`;
  }

  #bkEl(id: string): HTMLElement | undefined {
    return [...this.#rowsEl!.querySelectorAll<HTMLElement>(".nx-planner__bk")].find((e) => e.dataset.id === id);
  }

  // ---------------------------------------------------------------- cursor de teclado

  #resRows(): Row[] {
    return this.#rows.filter((r) => r.r);
  }
  /** La celda del cursor dentro de su fila (si está pintada) y lo que se anuncia de ella. */
  #showCursor(announce = true): void {
    const s = this.#scroll!;
    if (document.activeElement !== s) return this.#rowsEl!.querySelector(".nx-planner__cur")?.remove();
    const rows = this.#resRows();
    if (!rows.length || !this.#cols.length) return;
    let cur = this.#cur;
    if (!cur || !rows.some((r) => r.r!.id === cur!.rid)) {
      const t = this.#anchor();
      cur = this.#cur = { rid: rows[0].r!.id, c: Math.max(0, this.#cols.findIndex((c) => t < c.end)) };
    }
    cur.c = Math.min(cur.c, this.#cols.length - 1);
    const i = this.#rows.findIndex((r) => r.r?.id === cur!.rid);
    const row = this.#rows[i];
    const col = this.#cols[cur.c];
    const hits = row.items.filter((it) => it.start < col.end && it.end > col.start);
    const text = `${fill(this.#labels.cell, { resource: row.r!.name, when: this.#when(col.start, col.end) })}: ${hits.map((it) => it.b.title).join(", ") || this.#labels.free}`;
    let el = this.#rowsEl!.querySelector<HTMLElement>(".nx-planner__cur");
    const lane = [...this.#rowsEl!.children].find((e) => (e as HTMLElement).dataset.i === String(i))?.querySelector(".nx-planner__lane");
    if (!lane) return el?.remove(), s.removeAttribute("aria-activedescendant");
    if (!el) el = h("div", { class: "nx-planner__cur", role: "gridcell", id: `${this.#uid}-cur` });
    el.setAttribute("aria-label", text);
    el.style.cssText = `inset-inline-start:${cur.c * this.#cw}px;inline-size:${this.#cw}px;block-size:${row.h}px`;
    if (el.parentElement !== lane) lane.prepend(el);
    s.setAttribute("aria-activedescendant", el.id);
    if (announce) this.#say(text);
  }

  #gridKey(e: KeyboardEvent): void {
    const k = e.key;
    const rows = this.#resRows();
    if (!rows.length || !this.#cur) return;
    const cur = this.#cur;
    const ri = Math.max(0, rows.findIndex((r) => r.r!.id === cur.rid));
    const last = this.#cols.length - 1;
    let c = cur.c;
    let r = ri;
    if (k === "ArrowLeft") c = Math.max(0, c - 1);
    else if (k === "ArrowRight") c = Math.min(last, c + 1);
    else if (k === "ArrowUp") r = Math.max(0, r - 1);
    else if (k === "ArrowDown") r = Math.min(rows.length - 1, r + 1);
    else if (k === "Home") c = 0;
    else if (k === "End") c = last;
    else if (k === "Enter" || k === " ") {
      e.preventDefault();
      const row = rows[ri];
      const col = this.#cols[c];
      const it = row.items.find((i) => i.start < col.end && i.end > col.start);
      if (it) return this.#open(it, true);
      if (this.readonly) return;
      const span = this.view === "week" ? { start: col.start, end: Math.min(col.end, col.start + 60 * MIN) } : this.view === "month" ? { start: col.day, end: addDays(col.day, 1) } : col;
      return void this.#run({ k: "create", b: this.#draft(), to: { resource: row.r!.id, start: span.start, end: span.end } }, "keyboard");
    } else return;
    e.preventDefault();
    this.#cur = { rid: rows[r].r!.id, c };
    this.#reveal(c * this.#cw, this.#cw, rows[r].top, rows[r].h);
    this.#paint();
    this.#showCursor();
  }

  /** Una reserva nueva, con su `id` ya puesto (el `POST` es idempotente). */
  #draft(): PlannerBooking {
    return { id: newId(), resource: "", start: "", end: "", title: this.#labels.newBooking, status: "tentative" };
  }

  /** Clic o Enter en una reserva: `nx-planner-select` (y, desde la rejilla, el foco pasa a ella). */
  #open(it: PlannerItem, focus = false): void {
    this.#sel = it.b.id;
    for (const e of this.#rowsEl!.querySelectorAll<HTMLElement>(".nx-planner__bk")) e.toggleAttribute("data-selected", e.dataset.id === it.b.id);
    if (focus) this.#bkEl(it.b.id)?.focus();
    this.#emit("select", { booking: it.b });
  }

  // ---------------------------------------------------------------- teclado

  #key = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    const k = e.key;
    const t = e.target as HTMLElement;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && k.toLowerCase() === "z" && t !== this.#pick) {
      if (this.#last || this.#kb) {
        e.preventDefault();
        void this.undo();
      }
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || this.#drag?.on) return;
    if (t === this.#scroll) return this.#gridKey(e);
    const bkEl = t.closest?.<HTMLElement>(".nx-planner__bk");
    const it = bkEl ? this.#byId.get(bkEl.dataset.id!) : undefined;
    if (!it) return;
    const edit = !this.readonly && !it.b.readonly;
    if (k === "Enter") {
      e.preventDefault();
      this.#flushKb();
      this.#open(it);
    } else if (k === "Escape") {
      e.preventDefault();
      if (this.#kb) return this.#cancelKb();
      this.#toGrid(it);
    } else if ((k === "Delete" || k === "Backspace") && edit) {
      e.preventDefault();
      this.#flushKb();
      this.#toGrid(it);
      void this.#run({ k: "delete", b: it.b, from: placeOf(it) }, "keyboard");
    } else if (k.startsWith("Arrow") && edit) {
      e.preventDefault();
      this.#nudge(it, k, e.shiftKey);
    }
  };

  /** Vuelve a la rejilla, con el cursor donde estaba la reserva. */
  #toGrid(it: PlannerItem): void {
    this.#cur = { rid: it.b.resource, c: Math.max(0, this.#cols.findIndex((c) => it.start < c.end)) };
    this.#scroll!.focus();
    this.#showCursor();
  }

  /** Una flecha sobre una reserva: se ve al instante y se registra al dejar de mover (o al salir). */
  #nudge(it: PlannerItem, k: string, shift: boolean): void {
    if (this.#kb && this.#kb.b.id !== it.b.id) this.#flushKb();
    this.#kb ??= { b: it.b, from: placeOf(it), timer: 0 };
    const snap = this.snap;
    const hrs = this.view === "day" ? null : this.#hrs;
    const d = k === "ArrowLeft" || k === "ArrowUp" ? -1 : 1;
    const step = (t: number) => (snap >= 1440 ? addDays(t, d) : t + d * snap * MIN);
    let p = placeOf(it);
    if (k === "ArrowUp" || k === "ArrowDown") {
      const rows = this.#resRows();
      const next = rows[rows.findIndex((r) => r.r!.id === p.resource) + d];
      if (!next) return;
      p.resource = next.r!.id;
    } else if (shift) p = { ...p, ...plannerResize(it, "end", step(it.end), snap, hrs) };
    else {
      let m = plannerMove(it, step(it.start), snap, hrs);
      // Con el horario resumido, en el borde del día se salta al día siguiente (o al anterior).
      if (hrs && m.start === it.start) {
        const dur = it.end - it.start;
        const day = new Date(addDays(it.start, d)).setHours(0, d > 0 ? hrs[0] : hrs[1], 0, 0);
        m = d > 0 ? { start: day, end: day + dur } : { start: day - dur, end: day };
      }
      p = { ...p, ...m };
    }
    this.#place(it, p);
    this.#layout();
    const row = this.#rows.find((r) => r.r?.id === p.resource)!;
    this.#reveal(this.#xOf(p.start), this.#xOf(p.end) - this.#xOf(p.start), row.top, row.h);
    this.#paint(true);
    this.#bkEl(it.b.id)?.focus({ preventScroll: true });
    const k2 = row.items.indexOf(it);
    this.#say([row.r!.name, cap(this.#when(p.start, p.end)), row.clash.has(k2) ? this.#clashText(row) : ""].filter(Boolean).join(" · "));
    clearTimeout(this.#kb.timer);
    this.#kb.timer = window.setTimeout(() => this.#flushKb(), KB_IDLE);
  }

  #flushKb(): void {
    const kb = this.#kb;
    if (!kb) return;
    this.#kb = null;
    clearTimeout(kb.timer);
    const it = this.#byId.get(kb.b.id);
    if (it && !same(placeOf(it), kb.from)) void this.#run({ k: "change", b: kb.b, from: kb.from, to: placeOf(it) }, "keyboard");
  }

  #cancelKb(): void {
    const kb = this.#kb;
    if (!kb) return;
    this.#kb = null;
    clearTimeout(kb.timer);
    const it = this.#byId.get(kb.b.id);
    if (!it) return;
    this.#place(it, kb.from);
    this.#layout();
    this.#bkEl(it.b.id)?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- barra, clic, rueda

  #barClick = (e: MouseEvent): void => {
    const t = (e.target as Element).closest<HTMLElement>("[data-act], [data-view]");
    if (!t) return;
    const act = t.dataset.act;
    if (t.dataset.view) {
      if (t.dataset.view !== this.view) this.view = t.dataset.view as PlannerView;
    } else if (act === "today") this.today();
    else if (act === "prev" || act === "next") {
      this.#t = plannerStep(this.view, this.#t, act === "prev" ? -1 : 1);
      this.#period();
    } else if (act === "in" || act === "out") this.#zoomBy(act === "in" ? 1 : -1);
    else if (act === "clash") {
      const row = this.#rows.find((r) => r.r && r.clash.size);
      const it = row?.items[[...row.clash][0]];
      if (it) this.scrollToBooking(it.b.id);
    }
  };

  #click = (e: MouseEvent): void => {
    const t = e.target as Element;
    const fold = t.closest<HTMLElement>("[data-group]");
    if (fold) {
      const g = fold.dataset.group!;
      if (!this.#folded.delete(g)) this.#folded.add(g);
      this.#layout();
      return;
    }
    const bk = t.closest<HTMLElement>(".nx-planner__bk");
    const it = bk && this.#byId.get(bk.dataset.id!);
    if (it) this.#open(it);
  };

  #onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    this.#wheel += e.deltaY;
    if (Math.abs(this.#wheel) < 40) return;
    this.#zoomBy(this.#wheel < 0 ? 1 : -1, e.clientX);
    this.#wheel = 0;
  };

  /** Acerca o aleja conservando el instante bajo el puntero (o el centro). */
  #zoomBy(dir: number, clientX?: number): void {
    const z = Math.max(0, Math.min(ZOOM.length - 1, this.#z + dir));
    if (z === this.#z) return;
    const s = this.#scroll!;
    const ax = clientX === undefined ? ((s.clientWidth || 1000) - this.#resW) / 2 : clientX - s.getBoundingClientRect().left - this.#resW;
    const t = this.#tOf(s.scrollLeft + ax);
    this.#z = z;
    this.#layout();
    s.scrollLeft = Math.max(0, this.#xOf(t) - ax);
    this.#paint(true);
  }

  // ---------------------------------------------------------------- arrastre

  /** El puntero en coordenadas de la línea de tiempo (x) y del cuerpo (y). */
  #pt(cx: number, cy: number): { x: number; y: number } {
    const s = this.#scroll!;
    const r = s.getBoundingClientRect();
    return { x: cx - r.left - s.clientLeft + s.scrollLeft - this.#resW, y: cy - r.top - s.clientTop + s.scrollTop - this.#headH() };
  }
  #rowAt(y: number): Row | undefined {
    return this.#rows.find((r) => y >= r.top && y < r.top + r.h && r.r);
  }

  #down = (e: PointerEvent): void => {
    const t = e.target as HTMLElement;
    const lane = t.closest(".nx-planner__lane");
    if (e.button !== 0 || this.#drag || !lane || this.readonly) return;
    const bk = t.closest<HTMLElement>(".nx-planner__bk");
    const it = bk ? this.#byId.get(bk.dataset.id!) : undefined;
    if (bk && (!it || it.b.readonly)) return;
    const row = this.#rows[Number((lane.parentElement as HTMLElement).dataset.i)];
    if (!row?.r) return;
    const p = this.#pt(e.clientX, e.clientY);
    const mode = it ? ((t.dataset.edge as "start" | "end" | undefined) ?? "move") : "create";
    const d: Drag = { mode, it, row, pid: e.pointerId, cx: e.clientX, cy: e.clientY, x0: p.x, y0: p.y, on: false, touch: e.pointerType === "touch", timer: 0, raf: 0 };
    this.#drag = d;
    this.#flushKb();
    if (d.touch) d.timer = window.setTimeout(() => this.#drag === d && this.#startDrag(), PRESS_MS);
    addEventListener("pointermove", this.#onMove, { passive: false });
    addEventListener("pointerup", this.#onUp);
    addEventListener("pointercancel", this.#onCancel);
    addEventListener("keydown", this.#onKey, true);
    addEventListener("blur", this.#onCancel);
  };

  #onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !this.#drag?.on) return;
    e.preventDefault();
    e.stopPropagation();
    this.#endDrag(false);
  };
  #onMove = (e: PointerEvent): void => {
    const d = this.#drag;
    if (!d || e.pointerId !== d.pid) return;
    if (e.buttons === 0) return this.#endDrag(false);
    d.cx = e.clientX;
    d.cy = e.clientY;
    if (!d.on) {
      const p = this.#pt(d.cx, d.cy);
      const far = Math.hypot(p.x - d.x0, p.y - d.y0) > SLOP;
      if (far && d.touch) return this.#endDrag(false);
      if (!far) return;
      this.#startDrag();
    }
    e.preventDefault();
    this.#track();
  };
  #onUp = (e: PointerEvent): void => {
    if (this.#drag && e.pointerId === this.#drag.pid) this.#endDrag(true);
  };
  #onCancel = (e: Event): void => {
    if (this.#drag && (!(e instanceof PointerEvent) || e.pointerId === this.#drag.pid)) this.#endDrag(false);
  };

  #startDrag(): void {
    const d = this.#drag!;
    d.on = true;
    d.ghost = h("div", { class: "nx-planner__ghost", "aria-hidden": "true", "data-status": d.it?.b.status ?? "tentative" }, h("span", { class: "nx-planner__bt" }), h("span", { class: "nx-planner__bd" }));
    if (d.it?.b.color) d.ghost.style.setProperty("--_c", d.it.b.color);
    this.#rowsEl!.append(d.ghost);
    if (d.it) this.#bkEl(d.it.b.id)?.setAttribute("data-drag", "");
    this.setAttribute("data-dragging", d.mode);
    getSelection?.()?.removeAllRanges();
    const tick = () => {
      if (this.#drag !== d) return;
      const s = this.#scroll!;
      const r = s.getBoundingClientRect();
      const sx = edge(d.cx, r.left + this.#resW, r.right);
      const sy = d.mode === "move" ? edge(d.cy, r.top + this.#headH(), r.bottom) : 0;
      if (sx || sy) {
        s.scrollLeft += sx;
        s.scrollTop += sy;
        this.#track();
      }
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
    this.#track();
  }

  /** Sigue al puntero: la sombra (solo `transform`, y el ancho al cambiar de franja), su hora y si chocaría. */
  #track(): void {
    const d = this.#drag!;
    const { x, y } = this.#pt(d.cx, d.cy);
    const snap = this.snap;
    const hrs = this.view === "day" ? null : this.#hrs;
    let row = d.row;
    let span: Span;
    if (d.mode === "create") span = plannerSpan(this.#tOf(d.x0), this.#tOf(x), snap, hrs);
    else if (d.mode === "move") {
      span = plannerMove(d.it!, this.#tOf(this.#xOf(d.it!.start) + x - d.x0), snap, hrs);
      row = this.#rowAt(y) ?? row;
    } else span = plannerResize(d.it!, d.mode, this.#tOf(x), snap, hrs);
    const to = { resource: row.r!.id, ...span };
    if (same(to, d.to)) return;
    d.to = to;
    const g = d.ghost!;
    const gx = this.#xOf(span.start);
    g.style.transform = `translate(${this.#resW + gx}px,${row.top + PAD}px)`;
    g.style.inlineSize = `${Math.max(6, this.#xOf(span.end) - gx - 1)}px`;
    const others = row.items.filter((i) => i !== d.it).map((i) => ({ start: i.start, end: i.end, status: i.b.status }));
    const clash = plannerClashes([...others, { ...span, status: d.it?.b.status }], row.r!.capacity ?? 1).clash.has(others.length);
    g.toggleAttribute("data-clash", clash);
    const when = cap(this.#when(span.start, span.end));
    g.firstElementChild!.textContent = when;
    g.lastElementChild!.textContent = [d.it?.b.title ?? this.#labels.newBooking, row !== d.row ? row.r!.name : "", clash ? this.#labels.clash : ""].filter(Boolean).join(" · ");
  }

  #endDrag(drop: boolean): void {
    const d = this.#drag;
    if (!d) return;
    this.#drag = null;
    clearTimeout(d.timer);
    cancelAnimationFrame(d.raf);
    removeEventListener("pointermove", this.#onMove);
    removeEventListener("pointerup", this.#onUp);
    removeEventListener("pointercancel", this.#onCancel);
    removeEventListener("keydown", this.#onKey, true);
    removeEventListener("blur", this.#onCancel);
    if (!d.on) return;
    d.ghost!.remove();
    this.removeAttribute("data-dragging");
    if (d.it) this.#bkEl(d.it.b.id)?.removeAttribute("data-drag");
    // El clic que sigue a soltar no selecciona.
    const swallow = (e: Event) => (e.stopPropagation(), e.preventDefault());
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0);
    if (!drop || !d.to) return;
    if (d.mode === "create") void this.#run({ k: "create", b: this.#draft(), to: d.to }, "pointer");
    else if (!same(placeOf(d.it!), d.to)) void this.#run({ k: "change", b: d.it!.b, from: placeOf(d.it!), to: d.to }, "pointer");
  }

  /** Suelta lo que esté en el aire sin cambiar nada (llegan datos nuevos o sale del DOM). */
  #stop(): void {
    if (this.#drag) this.#endDrag(false);
    this.#flushKb();
  }

  // ---------------------------------------------------------------- cambios

  #place(it: PlannerItem, p: Place): void {
    it.start = p.start;
    it.end = p.end;
    it.b = { ...it.b, resource: p.resource, start: plannerISO(p.start), end: plannerISO(p.end) };
  }

  /** Aplica una operación (o la deshace con `back`). Al deshacer, solo si nadie la movió después. */
  #apply(op: Op, back: boolean): void {
    const id = op.b.id;
    const it = this.#byId.get(id);
    const add = op.k === "create" ? !back : op.k === "delete" ? back : null;
    if (add === null) {
      if (it && (!back || same(placeOf(it), op.to))) this.#place(it, back ? op.from! : op.to!);
    } else if (add && !it) {
      const p = (op.k === "create" ? op.to : op.from)!;
      const n: PlannerItem = { b: op.b, start: 0, end: 0 };
      this.#place(n, p);
      this.#items.push(n);
      this.#byId.set(id, n);
    } else if (!add && it) {
      this.#items.splice(this.#items.indexOf(it), 1);
      this.#byId.delete(id);
    }
    this.#layout();
  }

  /**
   * Un cambio completo: se pinta, sale el evento (cancelable) y, con `endpoint`, la petición. Si la
   * app lo cancela o el servidor falla, vuelve atrás con un aviso; si no, queda como «lo último» para
   * deshacer, con su aviso.
   */
  async #run(op: Op, via: PlannerVia): Promise<boolean> {
    const L = this.#labels;
    const gen = this.#gen;
    this.#apply(op, false);
    const it = this.#byId.get(op.b.id);
    const b = it?.b ?? op.b;
    const p = op.to ?? op.from!;
    const detail = op.k === "change" ? { booking: op.b, from: iso(op.from!), to: iso(op.to!), via } : op.k === "create" ? { booking: b, ...iso(op.to!), via } : { booking: op.b, via };
    let reason: string | undefined;
    // Lo último que se puede deshacer, desde ya (también mientras el servidor contesta).
    const mine = via === "undo" ? null : op.k === "delete" ? op : { ...op, b };
    // Crear cancelado es la app que se hace cargo (su propio formulario): vuelve sin aviso.
    if (!this.#emit(op.k, detail, true)) reason = op.k === "create" && via !== "undo" ? "" : (detail as { message?: string }).message || L.rejected;
    else {
      if (mine) this.#last = mine;
      reason = await this.#send(op, it);
    }
    const res = this.#res.find((r) => r.id === p.resource)?.name ?? "";
    if (reason !== undefined) {
      if (mine && this.#last === mine) this.#last = null;
      if (gen === this.#gen) this.#apply(op, true);
      if (reason) {
        const text = fill(L.reverted, { reason, title: b.title });
        this.#say(text);
        this.#toast(text, "warning", false);
      }
      return false;
    }
    if (via === "undo") return this.#say(L.undone), true;
    const text = fill(op.k === "change" ? L.moved : op.k === "create" ? L.created : L.deleted, { title: b.title, resource: res, when: this.#when(p.start, p.end) });
    this.#say(text);
    this.#toast(text, "neutral", true);
    return true;
  }

  /** `PATCH`/`POST`/`DELETE {endpoint}/{id}`. `undefined` si salió bien; si no, el motivo. */
  async #send(op: Op, it?: PlannerItem): Promise<string | undefined> {
    const base = safeEndpoint(this.endpoint);
    if (!base) return undefined;
    const id = op.b.id;
    const method = op.k === "change" ? "PATCH" : op.k === "create" ? "POST" : "DELETE";
    const body = op.k === "change" ? iso(op.to!) : op.k === "create" ? it?.b : undefined;
    this.#pending.add(id);
    this.#bkEl(id)?.setAttribute("aria-busy", "true");
    try {
      const res = await fetch(`${base.replace(/\/+$/, "")}/${encodeURIComponent(id)}`, { method, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        const m = j?.message ?? j?.error;
        return typeof m === "string" && m.trim() ? m.slice(0, 200) : this.#labels.failed;
      }
      // Lo que el servidor devuelva de la reserva (su versión normalizada) reemplaza a la local.
      const cur = this.#byId.get(id);
      const merged = op.k !== "delete" && cur && j && typeof j === "object" && !Array.isArray(j) ? cleanBookings([{ ...cur.b, ...j, id }])[0] : undefined;
      if (merged && cur) {
        cur.b = merged.b;
        cur.start = merged.start;
        cur.end = merged.end;
        this.#layout();
      }
      return undefined;
    } catch {
      return this.#labels.failed;
    } finally {
      this.#pending.delete(id);
      this.#bkEl(id)?.removeAttribute("aria-busy");
    }
  }

  /** Un aviso (`nxToast`, cargado con `import()`); con `undo`, reemplaza al anterior con deshacer. */
  #toast(message: string, tone: "neutral" | "warning", undo: boolean): void {
    let ctrl: AbortController | undefined;
    if (undo) {
      this.#tc?.abort();
      ctrl = this.#tc = new AbortController();
    }
    void import("../toast/index")
      .then(({ nxToast }) => (ctrl?.signal.aborted ? null : nxToast({ message, tone, undo, signal: ctrl?.signal })))
      .then((r) => r === "undo" && ctrl && this.#tc === ctrl && this.undo())
      .catch(() => {});
  }

  // ---------------------------------------------------------------- carga perezosa

  /** `GET {source}?from=&to=` → `{resources?, bookings}`; la anterior se aborta. */
  async #load(): Promise<void> {
    const url = safeEndpoint(this.source);
    if (!url || !this.isConnected) return;
    this.#ac?.abort();
    const ac = (this.#ac = new AbortController());
    const q = new URLSearchParams({ from: plannerISO(this.#range.start), to: plannerISO(this.#range.end) });
    this.setAttribute("aria-busy", "true");
    this.#say(this.#labels.loading);
    try {
      const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}${q}`, { signal: ac.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      if (ac !== this.#ac) return;
      if (Array.isArray(j?.resources)) this.#res = cleanResources(j.resources);
      this.bookings = j?.bookings;
      this.#say("");
    } catch (err) {
      if ((err as Error)?.name !== "AbortError" && ac === this.#ac) this.#say(this.#labels.loadError);
    } finally {
      if (ac === this.#ac) this.removeAttribute("aria-busy");
    }
  }
}
