/**
 * `<nx-kanban>`: un tablero que se siente instantáneo. Las tarjetas se arrastran con el puntero (el
 * hueco se abre donde van a caer y las demás se apartan) o se mueven con el teclado (Espacio
 * levanta, las flechas mueven, Espacio suelta, Escape cancela), con cada paso anunciado al lector
 * de pantalla.
 *
 * Nada espera al servidor: el movimiento se ve al instante y se puede deshacer mientras corre el
 * aviso (o con Ctrl+Z). La app registra en el backend cuando llega `nx-kanban-commit`. Una columna
 * con `confirm` pide confirmación con impacto antes de aceptar la tarjeta (anular una orden no es
 * un arrastre distraído), una con `wip` avisa cuando se pasa de su límite, y cada una muestra
 * cuántas tarjetas tiene y cuánto suman.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph, initials } from "../../core/icons";
import { nxFormat, resolveLocale } from "../../core/locale";
import { nxToast } from "../toast/toast";
import "../toast/index";
import { boardStep, cleanCards, cleanColumns, columnCards, columnTotals, fill, isLate, matchesCard, moveCard, positionOf, wipState } from "./logic";
import type { KanbanCard, KanbanColumn, KanbanConfirm, KanbanLabels, KanbanMoveDetail, KanbanOutcome } from "./types";

export const KANBAN_LABELS: KanbanLabels = {
  board: "Tablero",
  filter: "Filtrar tarjetas",
  hits: "{n} de {total}",
  add: "Agregar",
  empty: "Sin tarjetas",
  collapse: "Plegar {column}",
  expand: "Desplegar {column}",
  card: "tarjeta",
  hint: "Espacio levanta la tarjeta; las flechas la mueven entre posiciones y columnas; Espacio la suelta y Escape cancela.",
  lifted: "Tarjeta {title} levantada. Columna {column}, posición {i} de {n}.",
  over: "Columna {column}, posición {i} de {n}.",
  dropped: "Tarjeta {title} soltada en {column}, posición {i} de {n}.",
  canceled: "Movimiento cancelado. {title} volvió a {column}.",
  wipOver: "{column} supera su límite de {wip}.",
  overLimit: "supera el límite ({n}/{wip})",
  count: "{n} tarjetas",
  wip: "límite {wip}",
  moved: "{title} → {column}",
  undone: "{title} volvió a {column}",
  due: "Vence",
  late: "Vencida",
};

const PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';
const CAL = '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>';
const PROPS = ["columns", "cards", "labels", "heading", "undo", "busy"] as const;
/** El puntero tiene que moverse esto antes de levantar la tarjeta: un clic no es un arrastre. */
const SLOP = 5;
/** Con el dedo se levanta manteniendo pulsado; deslizar sin esperar sigue siendo hacer scroll. */
const PRESS_MS = 260;
/** A esta distancia de un borde empieza el autoscroll, hasta esta velocidad (px por cuadro). */
const EDGE = 56;
const SPEED = 16;

type Parts = { root: HTMLElement; list: HTMLUListElement; fold: HTMLButtonElement; count: HTMLElement; sum: HTMLElement; warn: HTMLElement };
type Drag = { id: string; el: HTMLElement; pid: number; x0: number; y0: number; x: number; y: number; dx: number; dy: number; on: boolean; touch: boolean; timer: number; raf: number; ghost?: HTMLElement; to?: { column: string; index: number } };
type Pending = { detail: KanbanMoveDetail };

let uid = 0;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isCard = (n: Element) => n.classList.contains("nx-kanban__card");
/** Cuánto desplazar cerca de un borde: negativo hacia el inicio, positivo hacia el final. */
const edge = (p: number, lo: number, hi: number) => {
  const a = lo + EDGE - p;
  const b = p - (hi - EDGE);
  return a > 0 ? -Math.ceil(SPEED * Math.min(1, a / EDGE)) : b > 0 ? Math.ceil(SPEED * Math.min(1, b / EDGE)) : 0;
};

export class NxKanban extends Base {
  static observedAttributes = ["columns", "cards", "labels", "heading", "locale", "busy"];

  #uid = `nx-kanban${++uid}`;
  #columns: KanbanColumn[] = [];
  #cards: KanbanCard[] = [];
  #labels: KanbanLabels = KANBAN_LABELS;
  #folded = new Set<string>();
  #query = "";
  /** La última tarjeta enfocada en cada columna: la que recibe el Tab. */
  #tabs = new Map<string, string>();
  /** Levantada con el teclado: de dónde salió y dónde va. */
  #lift: { id: string; from: { column: string; index: number }; at: { column: string; index: number } } | null = null;
  #drag: Drag | null = null;
  /** Movimientos que esperan su tiempo de deshacer, por tarjeta. */
  #pending = new Map<string, Pending>();
  /** Cambia cada vez que llegan tarjetas nuevas: lo que estaba pendiente ya no toca el DOM. */
  #gen = 0;
  /** Mientras el tablero mueve nodos, el foco que se pierde no cuenta como salir. */
  #moving = false;
  #built = false;
  #els = new Map<string, HTMLLIElement>();
  #cols = new Map<string, Parts>();
  #bar?: HTMLElement;
  #board?: HTMLElement;
  #filter?: HTMLInputElement;
  #hits?: HTMLElement;
  #live?: HTMLElement;
  #hint?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** Las columnas, en orden: `{id, label, tone?, wip?, confirm?, collapsed?}`. */
  get columns(): KanbanColumn[] {
    return this.#columns;
  }
  set columns(v: KanbanColumn[] | null | undefined) {
    this.#columns = cleanColumns(v);
    this.#folded = new Set(this.#columns.filter((c) => c.collapsed).map((c) => c.id));
    this.#render();
  }
  /** Las tarjetas en su estado actual (con los movimientos ya aplicados), en orden. */
  get cards(): KanbanCard[] {
    return [...this.#cards];
  }
  set cards(v: KanbanCard[] | null | undefined) {
    this.#stop();
    this.#cards = cleanCards(v);
    this.#pending.clear();
    this.#gen++;
    this.#render();
  }
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string) {
    this.setAttribute("heading", v);
  }
  /** Milisegundos para deshacer un movimiento (7000). `0`: se registra al instante, sin aviso. */
  get undo(): number {
    const n = Number(this.getAttribute("undo"));
    return this.hasAttribute("undo") && Number.isFinite(n) && n >= 0 ? n : 7000;
  }
  set undo(v: number) {
    this.setAttribute("undo", String(v));
  }
  /** Cargando: columnas con tarjetas de relleno. */
  get busy(): boolean {
    return boolAttr(this, "busy");
  }
  set busy(v: boolean) {
    this.toggleAttribute("busy", !!v);
  }
  get labels(): KanbanLabels {
    return this.#labels;
  }
  set labels(v: Partial<KanbanLabels> | null | undefined) {
    this.#labels = { ...KANBAN_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#render();
  }

  /**
   * Mueve una tarjeta a `column`, en la posición `index` (por defecto, al final), como si la
   * hubieran arrastrado: evento, confirmación si la columna la pide, y aviso con deshacer.
   */
  move(cardId: string, column: string, index = Infinity): Promise<KanbanOutcome> {
    return this.#commit(String(cardId), String(column), index, "api");
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
  }

  disconnectedCallback(): void {
    this.#stop();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "columns" || name === "cards" || name === "labels") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-kanban] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    this.#render();
  }

  // ---------------------------------------------------------------- interno

  #column(id: string): KanbanColumn | undefined {
    return this.#columns.find((c) => c.id === id);
  }
  #card(id: string): KanbanCard | undefined {
    return this.#cards.find((c) => c.id === id);
  }
  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(`nx-kanban-${type}`, { detail, bubbles: true, composed: true, cancelable }));
  }
  /** Al lector de pantalla (región `aria-live`). */
  #say(text: string): void {
    if (this.#live) this.#live.textContent = text;
  }

  #build(): void {
    this.#built = true;
    this.setAttribute("role", "region");
    this.#filter = h("input", { type: "search", class: "nx-kanban__filter", autocomplete: "off", spellcheck: "false" });
    this.#hits = h("span", { class: "nx-kanban__hits", "aria-live": "polite" });
    this.#bar = h("div", { class: "nx-kanban__bar" }, h("h2", { class: "nx-kanban__heading", id: `${this.#uid}-h` }), h("label", { class: "nx-kanban__search" }, glyph("search"), this.#filter), this.#hits);
    this.#board = h("div", { class: "nx-kanban__board" });
    this.#hint = h("p", { class: "nx-kanban__sr", id: `${this.#uid}-hint` });
    this.#live = h("div", { class: "nx-kanban__sr", "aria-live": "assertive", "aria-atomic": "true" });
    this.append(this.#bar, this.#board, this.#hint, this.#live);

    this.#filter.addEventListener("input", () => {
      this.#query = this.#filter!.value;
      this.#paintFilter();
    });
    this.addEventListener("keydown", (e) => this.#key(e));
    this.addEventListener("click", (e) => this.#click(e));
    this.addEventListener("pointerdown", (e) => this.#down(e));
    this.addEventListener("focusin", (e) => {
      const card = (e.target as Element).closest?.<HTMLElement>(".nx-kanban__card");
      if (card) this.#setTab(card.dataset.id);
    });
    this.addEventListener("focusout", (e) => {
      // Levantada con el teclado y el foco se va a otra parte: se cancela.
      if (this.#lift && !this.#moving && !this.contains(e.relatedTarget as Node)) this.#cancelLift();
    });
    // Sin el arrastre nativo del navegador (enlaces, texto): el tablero tiene el suyo.
    this.addEventListener("dragstart", (e) => e.preventDefault());
    // Con el dedo: una vez levantada, deslizar mueve la tarjeta y no la página.
    this.addEventListener("touchmove", (e) => this.#drag?.on && e.preventDefault(), { passive: false });
    this.addEventListener("contextmenu", (e) => this.#drag && e.preventDefault());
  }

  // ---------------------------------------------------------------- pintado

  #render(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const heading = this.heading;
    const hEl = this.#bar!.firstElementChild as HTMLElement;
    hEl.textContent = heading;
    hEl.hidden = !heading;
    if (heading) {
      this.setAttribute("aria-labelledby", hEl.id);
      this.removeAttribute("aria-label");
    } else {
      this.setAttribute("aria-label", L.board);
      this.removeAttribute("aria-labelledby");
    }
    this.#filter!.setAttribute("aria-label", L.filter);
    this.#filter!.placeholder = `${L.filter}…`;
    this.#hint!.textContent = L.hint;
    this.#board!.setAttribute("aria-busy", String(this.busy));

    const f = nxFormat(resolveLocale(this));
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    this.#els.clear();
    for (const c of this.#cards) this.#els.set(c.id, this.#cardEl(c, f, today));
    this.#cols.clear();
    this.#board!.replaceChildren(...this.#columns.map((c, i) => this.#colEl(c, i)));
    this.#place(false);
    this.#paintFilter();
  }

  #colEl(col: KanbanColumn, i: number): HTMLElement {
    const L = this.#labels;
    const tid = `${this.#uid}-c${i}`;
    const fold = h("button", { type: "button", class: "nx-kanban__fold" }, glyph("chevron"), h("span", { class: "nx-kanban__dot", "aria-hidden": "true" }), h("span", { class: "nx-kanban__label" }, col.label));
    const count = h("span", { class: "nx-kanban__count" });
    const sum = h("span", { class: "nx-kanban__sum" });
    const warn = h("p", { class: "nx-kanban__warn", hidden: true });
    const list = h("ul", { class: "nx-kanban__list", "aria-labelledby": tid, "data-empty": L.empty });
    const root = h(
      "div",
      { class: "nx-kanban__col", role: "group", "data-col": col.id, "data-tone": col.tone ?? "neutral" },
      h("header", { class: "nx-kanban__head" }, h("h3", { class: "nx-kanban__title", id: tid }, fold), count, sum),
      warn,
      list,
      h("button", { type: "button", class: "nx-kanban__add", "data-add": col.id }, glyph(PLUS), L.add),
    );
    this.#cols.set(col.id, { root, list, fold, count, sum, warn });
    this.#paintFold(col);
    return root;
  }

  #cardEl(c: KanbanCard, f: ReturnType<typeof nxFormat>, today: string): HTMLLIElement {
    const L = this.#labels;
    const href = safeHref(c.href);
    const late = isLate(c.due, today);
    const foot = c.amount !== undefined || c.due || c.assignee;
    return h(
      "li",
      { class: "nx-kanban__card", "data-id": c.id, tabindex: "-1", "aria-roledescription": L.card, "aria-describedby": this.#hint!.id },
      h("span", { class: "nx-kanban__card-title" }, href ? h("a", { href, tabindex: "-1", draggable: "false" }, c.title) : c.title),
      c.subtitle ? h("span", { class: "nx-kanban__sub" }, c.subtitle) : null,
      c.tags ? h("span", { class: "nx-kanban__tags" }, ...c.tags.map((t) => h("span", { class: "nx-kanban__tag", "data-tone": typeof t === "string" ? null : (t.tone ?? null) }, typeof t === "string" ? t : t.label))) : null,
      foot
        ? h(
            "span",
            { class: "nx-kanban__foot" },
            c.amount !== undefined ? h("span", { class: "nx-kanban__amount" }, f.money(c.amount, { currency: c.currency })) : null,
            c.due ? h("span", { class: "nx-kanban__due", "data-late": late || null }, glyph(CAL), h("span", { class: "nx-kanban__sr" }, `${late ? L.late : L.due} `), f.date(c.due)) : null,
            c.assignee ? h("span", { class: "nx-kanban__who", title: c.assignee }, h("span", { "aria-hidden": "true" }, initials(c.assignee)), h("span", { class: "nx-kanban__sr" }, c.assignee)) : null,
          )
        : null,
    );
  }

  #paintFold(col: KanbanColumn): void {
    const p = this.#cols.get(col.id)!;
    const folded = this.#folded.has(col.id);
    p.root.toggleAttribute("data-folded", folded);
    p.fold.setAttribute("aria-expanded", String(!folded));
    p.fold.title = fill(folded ? this.#labels.expand : this.#labels.collapse, { column: col.label });
  }

  /**
   * Pone cada tarjeta en su columna, en el orden del estado (moviendo los nodos que ya existen, así
   * el foco y las animaciones siguen). Con `animate`, las tarjetas se deslizan a su nuevo lugar.
   */
  #place(animate: boolean): void {
    const run = () => {
      for (const col of this.#columns) {
        const p = this.#cols.get(col.id)!;
        const want: HTMLLIElement[] = columnCards(this.#cards, col.id).map((c) => this.#els.get(c.id)!);
        if (this.busy && !want.length) want.push(...[0, 1, 2].map(() => h("li", { class: "nx-kanban__skel", "aria-hidden": "true" })));
        const have = [...p.list.children];
        if (want.length !== have.length || want.some((el, i) => el !== have[i])) p.list.replaceChildren(...want);
      }
    };
    this.#keepFocus(() => (animate ? this.#flip(run) : run()));
    this.#paintCounts();
    this.#setTab();
  }

  /** Mueve nodos sin perder el foco (quitar un nodo enfocado del DOM lo desenfoca). */
  #keepFocus(fn: () => void): void {
    const a = document.activeElement as HTMLElement | null;
    const inside = !!a && this.contains(a);
    this.#moving = true;
    try {
      fn();
    } finally {
      if (inside && a!.isConnected && document.activeElement !== a) a!.focus({ preventScroll: true });
      this.#moving = false;
    }
  }

  /** Animación FLIP: cada tarjeta se desliza desde donde estaba. */
  #flip(fn: () => void): void {
    const els = [...this.#els.values()].filter((e) => e.isConnected);
    const before = new Map(els.map((e) => [e, e.getBoundingClientRect()]));
    fn();
    if (reduced()) return;
    for (const [e, r] of before) {
      if (!e.isConnected || !r.width || !e.animate) continue;
      const n = e.getBoundingClientRect();
      const dx = r.left - n.left;
      const dy = r.top - n.top;
      if (n.width && (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)) e.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: 200, easing: "cubic-bezier(0.2,0.8,0.2,1)" });
    }
  }

  /** Contador («6/5» en rojo si se pasa del límite), suma de montos y el nombre accesible de cada columna. */
  #paintCounts(): void {
    const L = this.#labels;
    const f = nxFormat(resolveLocale(this));
    for (const col of this.#columns) {
      const p = this.#cols.get(col.id)!;
      const t = columnTotals(this.#cards, col.id);
      const st = wipState(t.count, col.wip);
      p.root.toggleAttribute("data-over", st === "over");
      p.root.toggleAttribute("data-full", st === "full");
      p.count.textContent = col.wip ? `${t.count}/${col.wip}` : String(t.count);
      p.sum.textContent = t.sums.map((s) => f.money(s.amount, { currency: s.currency }, true)).join(" · ");
      const full = t.sums.map((s) => f.money(s.amount, { currency: s.currency })).join(" · ");
      p.sum.title = full;
      p.root.setAttribute("aria-label", [col.label, fill(L.count, { n: t.count }), col.wip ? fill(L.wip, { wip: col.wip }) : "", full].filter(Boolean).join(", "));
    }
  }

  /** El filtro atenúa lo que no coincide, sin mover nada. */
  #paintFilter(): void {
    const q = this.#query.trim();
    let n = 0;
    for (const c of this.#cards) {
      const ok = matchesCard(c, q);
      this.#els.get(c.id)?.toggleAttribute("data-dim", !ok);
      if (ok && this.#column(c.column)) n++;
    }
    this.#hits!.textContent = q ? fill(this.#labels.hits, { n, total: this.#cards.filter((c) => this.#column(c.column)).length }) : "";
  }

  /** Marca la columna a la que va la tarjeta (o ninguna) y, si se pasa de su límite, lo dice. */
  #warn(column: string | null, id?: string): string {
    let text = "";
    for (const col of this.#columns) {
      const p = this.#cols.get(col.id)!;
      const n = columnCards(this.#cards, col.id).filter((c) => c.id !== id).length + 1;
      const on = col.id === column && !!col.wip && n > col.wip;
      p.root.toggleAttribute("data-target", col.id === column);
      p.root.toggleAttribute("data-warn", on);
      p.warn.hidden = !on;
      if (on) p.warn.textContent = text = fill(this.#labels.wipOver, { column: col.label, wip: col.wip! });
    }
    return text;
  }

  /**
   * Tabindex itinerante por columna: Tab pasa de columna en columna (a la tarjeta enfocada, la
   * última que se enfocó en ella, o la primera) y las flechas se mueven dentro del tablero.
   */
  #setTab(id?: string): void {
    const active = document.activeElement;
    // Según el DOM (no el estado): con una tarjeta en el aire, cuenta donde se ve.
    for (const [cid, p] of this.#cols) {
      const els = [...p.list.children].filter(isCard) as HTMLElement[];
      if (id && els.some((e) => e.dataset.id === id)) this.#tabs.set(cid, id);
      const last = this.#tabs.get(cid);
      const want = els.find((e) => e === active) ?? els.find((e) => e.dataset.id === last) ?? els[0];
      for (const e of els) e.tabIndex = e === want ? 0 : -1;
    }
  }

  // ---------------------------------------------------------------- teclado

  /** Tarjetas por columna para moverse con las flechas (`-1`: plegada), sin contar `skip`. */
  #sizes(skip?: string): number[] {
    return this.#columns.map((c) => (this.#folded.has(c.id) ? -1 : columnCards(this.#cards, c.id).filter((x) => x.id !== skip).length));
  }

  #key(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    // Arrastrando, el teclado solo cancela (lo escucha `#onKey`, esté donde esté el foco).
    if (this.#drag?.on) return;
    const t = e.target as HTMLElement;
    if (t === this.#filter) {
      if (k === "Escape" && this.#filter.value) {
        e.preventDefault();
        this.#filter.value = this.#query = "";
        this.#paintFilter();
      } else if (k === "ArrowDown") {
        e.preventDefault();
        // A la primera tarjeta que se ve (la que coincide con el filtro, si hay uno).
        const el = [...this.#board!.querySelectorAll<HTMLElement>(".nx-kanban__card")].find((c) => c.offsetParent && !c.hasAttribute("data-dim"));
        this.#focusCard(el?.dataset.id ?? null);
      }
      return;
    }
    if (!t.classList.contains("nx-kanban__card")) return;
    const id = t.dataset.id!;
    if (this.#lift) {
      if (k === "Tab") return this.#cancelLift();
      e.preventDefault();
      if (k === " " || k === "Enter") this.#dropLift();
      else if (k === "Escape") this.#cancelLift();
      else this.#stepLift(k);
      return;
    }
    if (k === " ") {
      e.preventDefault();
      this.#liftCard(id);
    } else if (k === "Enter") {
      e.preventDefault();
      this.#open(id, null);
    } else if (k === "/") {
      e.preventDefault();
      this.#filter!.focus();
    } else {
      const pos = positionOf(this.#cards, id);
      if (!pos) return;
      const to = boardStep(this.#sizes(), { col: this.#columns.findIndex((c) => c.id === pos.column), index: pos.index }, k, false);
      if (!to) return;
      e.preventDefault();
      this.#focusCard(columnCards(this.#cards, this.#columns[to.col].id)[to.index]?.id ?? null);
    }
  }

  #focusCard(id: string | null): void {
    const el = id ? this.#els.get(id) : undefined;
    if (!el?.isConnected) return;
    el.focus();
    this.#setTab(el.dataset.id);
    el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }

  /** «Columna Aprobado, posición 2 de 5» para la tarjeta levantada. */
  #where(column: string, index: number, id: string): { column: string; i: number; n: number } {
    return { column: this.#column(column)!.label, i: index + 1, n: columnCards(this.#cards, column).filter((c) => c.id !== id).length + 1 };
  }

  #liftCard(id: string): void {
    const pos = positionOf(this.#cards, id);
    const card = this.#card(id);
    if (!pos || !card || this.#folded.has(pos.column) || !this.#column(pos.column)) return;
    this.#lift = { id, from: pos, at: { ...pos } };
    this.#els.get(id)!.setAttribute("data-lifted", "");
    this.setAttribute("data-moving", "");
    this.#say(fill(this.#labels.lifted, { title: card.title, ...this.#where(pos.column, pos.index, id) }));
  }

  #stepLift(k: string): void {
    const lift = this.#lift!;
    const to = boardStep(this.#sizes(lift.id), { col: this.#columns.findIndex((c) => c.id === lift.at.column), index: lift.at.index }, k, true);
    if (!to) return;
    const column = this.#columns[to.col].id;
    lift.at = { column, index: to.index };
    const el = this.#els.get(lift.id)!;
    const list = this.#cols.get(column)!.list;
    const others = [...list.children].filter((n) => n !== el && isCard(n));
    this.#keepFocus(() => this.#flip(() => list.insertBefore(el, others[to.index] ?? null)));
    this.#setTab(lift.id);
    el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    const warn = column !== lift.from.column ? this.#warn(column, lift.id) : this.#warn(null);
    this.#say(`${fill(this.#labels.over, this.#where(column, to.index, lift.id))}${warn ? ` ${warn}` : ""}`);
  }

  #endLift(): { id: string; from: { column: string; index: number }; at: { column: string; index: number } } | null {
    const lift = this.#lift;
    if (!lift) return null;
    this.#lift = null;
    this.#els.get(lift.id)?.removeAttribute("data-lifted");
    this.removeAttribute("data-moving");
    this.#warn(null);
    return lift;
  }

  #dropLift(): void {
    const lift = this.#endLift()!;
    const card = this.#card(lift.id)!;
    this.#say(fill(this.#labels.dropped, { title: card.title, ...this.#where(lift.at.column, lift.at.index, lift.id) }));
    void this.#commit(lift.id, lift.at.column, lift.at.index, "keyboard");
  }

  #cancelLift(): void {
    const lift = this.#endLift();
    if (!lift) return;
    this.#place(true);
    const card = this.#card(lift.id);
    if (card) this.#say(fill(this.#labels.canceled, { title: card.title, column: this.#column(lift.from.column)?.label ?? "" }));
  }

  // ---------------------------------------------------------------- clic

  #click(e: MouseEvent): void {
    const t = e.target as Element;
    const add = t.closest<HTMLElement>("[data-add]");
    if (add) return void this.#emit("add", { column: add.dataset.add });
    const fold = t.closest(".nx-kanban__fold");
    if (fold) {
      const id = fold.closest<HTMLElement>("[data-col]")!.dataset.col!;
      if (!this.#folded.delete(id)) this.#folded.add(id);
      this.#paintFold(this.#column(id)!);
      return;
    }
    const card = t.closest<HTMLElement>(".nx-kanban__card");
    if (card) this.#open(card.dataset.id!, e);
  }

  /** `nx-kanban-open` (cancelable) y, si la tarjeta tiene `href`, su enlace. */
  #open(id: string, e: MouseEvent | null): void {
    const card = this.#card(id);
    if (!card) return;
    const link = this.#els.get(id)?.querySelector("a");
    const onLink = !!e && !!(e.target as Element).closest("a");
    if (!this.#emit("open", { card }, true)) {
      if (onLink) e!.preventDefault();
      return;
    }
    if (link && !onLink) link.click();
  }

  // ---------------------------------------------------------------- arrastre con el puntero

  #down(e: PointerEvent): void {
    const t = e.target as Element;
    const el = t.closest<HTMLElement>(".nx-kanban__card");
    if (e.button !== 0 || !el || this.#drag || this.#lift || t.closest("button, input")) return;
    const r = el.getBoundingClientRect();
    const d: Drag = { id: el.dataset.id!, el, pid: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, on: false, touch: e.pointerType === "touch", timer: 0, raf: 0 };
    this.#drag = d;
    if (d.touch) d.timer = window.setTimeout(() => this.#drag === d && this.#startDrag(), PRESS_MS);
    addEventListener("pointermove", this.#onMove, { passive: false });
    addEventListener("pointerup", this.#onUp);
    addEventListener("pointercancel", this.#onCancel);
    addEventListener("keydown", this.#onKey, true);
  }

  #onKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape" || !this.#drag?.on) return;
    e.preventDefault();
    e.stopPropagation();
    this.#endDrag(false);
  };

  #onMove = (e: PointerEvent): void => {
    const d = this.#drag;
    if (!d || e.pointerId !== d.pid) return;
    d.x = e.clientX;
    d.y = e.clientY;
    if (!d.on) {
      const far = Math.hypot(d.x - d.x0, d.y - d.y0) > SLOP;
      // Con el dedo, moverse antes de tiempo es hacer scroll.
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
  #onCancel = (e: PointerEvent): void => {
    if (this.#drag && e.pointerId === this.#drag.pid) this.#endDrag(false);
  };

  #startDrag(): void {
    const d = this.#drag!;
    d.on = true;
    const r = d.el.getBoundingClientRect();
    const ghost = d.el.cloneNode(true) as HTMLElement;
    ghost.className = "nx-kanban__card nx-kanban__ghost";
    for (const a of ["tabindex", "data-id", "aria-roledescription", "aria-describedby"]) ghost.removeAttribute(a);
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.inlineSize = `${r.width}px`;
    ghost.style.blockSize = `${r.height}px`;
    d.ghost = ghost;
    this.append(ghost);
    d.el.setAttribute("data-placeholder", "");
    this.setAttribute("data-dragging", "");
    getSelection?.()?.removeAllRanges();
    const tick = () => {
      if (this.#drag !== d) return;
      // Autoscroll: el tablero hacia los lados y la columna hacia arriba o abajo.
      const b = this.#board!.getBoundingClientRect();
      const sx = edge(d.x, b.left, b.right);
      const list = d.to ? this.#cols.get(d.to.column)?.list : undefined;
      const lr = list?.getBoundingClientRect();
      const sy = lr && lr.height ? edge(d.y, lr.top, lr.bottom) : 0;
      const x0 = this.#board!.scrollLeft;
      const y0 = list?.scrollTop ?? 0;
      if (sx) this.#board!.scrollLeft += sx;
      if (sy) list!.scrollTop += sy;
      if (this.#board!.scrollLeft !== x0 || (list?.scrollTop ?? 0) !== y0) this.#track();
      d.raf = requestAnimationFrame(tick);
    };
    d.raf = requestAnimationFrame(tick);
    this.#track();
  }

  /** Sigue al puntero: la sombra va con él y el hueco se abre donde caería. */
  #track(): void {
    const d = this.#drag!;
    d.ghost!.style.transform = `translate(${d.x - d.dx}px, ${d.y - d.dy}px)`;
    // La columna bajo el puntero, por su franja horizontal (soltar debajo de la última tarjeta también vale).
    let col: KanbanColumn | undefined;
    for (const c of this.#columns) {
      const r = this.#cols.get(c.id)!.root.getBoundingClientRect();
      if (d.x >= r.left && d.x <= r.right) col = c;
    }
    if (!col) return;
    const list = this.#cols.get(col.id)!.list;
    const others = [...list.children].filter((n): n is HTMLElement => n !== d.el && isCard(n));
    let index = others.length;
    if (!this.#folded.has(col.id)) {
      // Contra la posición de diseño (offsetTop, relativa a la lista), no la animada: así el hueco no titubea.
      const y = d.y - list.getBoundingClientRect().top - list.clientTop + list.scrollTop;
      const i = others.findIndex((n) => y < n.offsetTop + n.offsetHeight / 2);
      if (i >= 0) index = i;
    }
    if (d.to?.column === col.id && d.to.index === index) return;
    d.to = { column: col.id, index };
    this.#keepFocus(() => this.#flip(() => list.insertBefore(d.el, others[index] ?? null)));
    this.#setTab(d.id);
    this.#warn(col.id !== this.#card(d.id)?.column ? col.id : null, d.id);
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
    if (!d.on) return;
    this.removeAttribute("data-dragging");
    this.#warn(null);
    // El clic que sigue a soltar no abre la tarjeta.
    const swallow = (e: Event) => (e.stopPropagation(), e.preventDefault());
    addEventListener("click", swallow, { capture: true, once: true });
    setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0);
    const ghost = d.ghost!;
    const done = () => {
      ghost.remove();
      d.el.removeAttribute("data-placeholder");
    };
    if (!drop || !d.to) {
      done();
      this.#place(true);
      return;
    }
    // La sombra aterriza en el hueco.
    const r = d.el.getBoundingClientRect();
    if (!reduced() && ghost.animate && r.width) ghost.animate([{ transform: ghost.style.transform }, { transform: `translate(${r.left}px, ${r.top}px)`, rotate: "0deg", scale: "1", boxShadow: "none" }], { duration: 170, easing: "cubic-bezier(0.2,0.8,0.2,1)", fill: "forwards" }).onfinish = done;
    else done();
    if (d.el.isConnected && r.width) d.el.focus({ preventScroll: true });
    void this.#commit(d.id, d.to.column, d.to.index, "pointer");
  }

  /** Suelta lo que esté en el aire sin mover nada (llegan datos nuevos, o el tablero sale del DOM). */
  #stop(): void {
    if (this.#drag) this.#endDrag(false);
    this.#endLift();
  }

  // ---------------------------------------------------------------- mover

  /**
   * El movimiento: `nx-kanban-move` (cancelable), la confirmación si la columna la pide, el cambio
   * al instante y el aviso con deshacer. Al terminar el tiempo, `nx-kanban-commit`.
   */
  async #commit(id: string, to: string, index: number, via: KanbanMoveDetail["via"]): Promise<KanbanOutcome> {
    const L = this.#labels;
    const card = this.#card(id);
    const from = positionOf(this.#cards, id);
    const col = this.#column(to);
    if (!card || !from || !col) return this.#place(true), "cancel";
    index = Math.max(0, Math.min(columnCards(this.#cards, to).filter((c) => c.id !== id).length, Math.floor(index) || 0));
    if (from.column === to && from.index === index) return this.#place(true), "cancel";
    const detail: KanbanMoveDetail = { card, from: from.column, fromIndex: from.index, to, index, via };
    if (!this.#emit("move", detail, true)) return this.#place(true), "cancel";

    const gen = this.#gen;
    // Optimista: se ve de una vez.
    this.#cards = moveCard(this.#cards, id, to, index);
    this.#place(true);
    const el = this.#els.get(id);
    if (col.confirm) {
      el?.setAttribute("data-pending", "");
      const ok = await this.#confirm(col.confirm, detail, el ?? null);
      el?.removeAttribute("data-pending");
      if (gen !== this.#gen) return "cancel";
      if (!ok) {
        this.#back(id, from);
        this.#say(fill(L.undone, { title: card.title, column: this.#column(from.column)?.label ?? "" }));
        return "cancel";
      }
    }
    // Si la tarjeta ya tenía un movimiento esperando, ese queda registrado: este sale de donde aquel la dejó.
    const prev = this.#pending.get(id);
    if (prev) this.#emit("commit", prev.detail);
    const mine: Pending = { detail };
    this.#pending.set(id, mine);

    const n = columnCards(this.#cards, to).length;
    const over = wipState(n, col.wip) === "over";
    const message = `${fill(L.moved, { title: card.title, column: col.label })}${over ? ` · ${fill(L.overLimit, { n, wip: col.wip! })}` : ""}`;
    const result = this.undo ? await nxToast({ message, undo: true, duration: this.undo, tone: over ? "warning" : "neutral" }) : "timeout";
    if (this.#pending.get(id) === mine) this.#pending.delete(id);
    else if (gen === this.#gen) return "commit";
    if (result === "undo") {
      if (gen === this.#gen) {
        if (this.#lift?.id === id || this.#drag?.id === id) this.#stop();
        this.#back(id, from);
        this.#say(fill(L.undone, { title: card.title, column: this.#column(from.column)?.label ?? "" }));
      }
      this.#emit("undo", detail);
      return "undo";
    }
    this.#emit("commit", detail);
    return "commit";
  }

  #back(id: string, from: { column: string; index: number }): void {
    this.#cards = moveCard(this.#cards, id, from.column, from.index);
    this.#place(true);
  }

  /** La confirmación con impacto. `nxConfirm` (y su diálogo) se cargan solo cuando hace falta. */
  async #confirm(c: KanbanConfirm, d: KanbanMoveDetail, origin: Element | null): Promise<boolean> {
    const { nxConfirm } = await import("../confirm/index");
    const vars = { title: d.card.title, column: this.#column(d.to)?.label ?? "" };
    return nxConfirm({
      heading: fill(c.heading, vars),
      message: c.message ? fill(c.message, vars) : undefined,
      impact: c.impact,
      body: { card: d.card.id, from: d.from, to: d.to, index: d.index, data: d.card.data ?? null },
      hold: c.hold === true ? 1000 : c.hold === false ? 0 : c.hold,
      tone: c.tone,
      confirmLabel: c.confirmLabel,
      origin,
    });
  }
}
