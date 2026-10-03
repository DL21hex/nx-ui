/**
 * `<nx-cards>`: una vista de tarjetas con zoom semántico. El mismo conjunto de registros en tres
 * niveles, y al pasar de uno a otro cada tarjeta se transforma en su sitio:
 *
 * - **Mapa:** un cuadro por registro. El color dice el estado; la intensidad, el peso (las compras,
 *   el monto). Cientos de un vistazo, para ver patrones («¿cuántos van atrasados?»).
 * - **Tarjetas:** título, subtítulo, el dato grande con su minigráfica y una línea corta. Las de más
 *   peso ocupan dos columnas; el estado normal no se anuncia, para que resalten los demás.
 * - **Fichas:** todos los datos.
 *
 * Una tarjeta se abre donde está (ocupa la fila) con su lista relacionada y sus acciones.
 *
 * Reglas de diseño:
 * - **Un nodo por registro, siempre el mismo.** Cambiar de nivel, ordenar, agrupar o filtrar mueve
 *   los nodos (FLIP): nada salta y el registro bajo el puntero se queda en su sitio. El cuerpo de la
 *   tarjeta se arma la primera vez que hace falta: el mapa de miles de registros solo pinta cuadros.
 * - **El zoom es un solo control:** el selector, `Ctrl` + rueda (o el pellizco del trackpad) sobre
 *   la vista, o `+` / `−` con el foco adentro.
 * - **Light DOM.** Los textos del backend van siempre como texto; los estilos, en `cards.css`.
 */
import { Base, upgrade, attrProps } from "../../core/define";
import { h, safeHref, reducedMotion as reduced, emit } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale, type NxFormat } from "../../core/locale";
import { deltaParts, fillCount, formatField, groupRows, isHeavy, LEVELS, matchRow, meterTone, mixFor, moveIndex, parseLevel, sortRows, sparkPaths, statusOf, stepLevel, weightRanks } from "./logic";
import type { CardsAction, CardsField, CardsLabels, CardsLayout, CardsLevel, CardsRelated, CardsRow, CardsTone } from "./types";

export const CARDS_LABELS: CardsLabels = {
  search: "Buscar",
  placeholder: "Buscar…",
  group: "Agrupar por",
  noGroup: "Sin agrupar",
  sort: "Ordenar por",
  noSort: "Orden original",
  desc: "mayor primero",
  asc: "menor primero",
  az: "A–Z",
  recent: "más reciente primero",
  oldest: "más antiguo primero",
  level: "Detalle",
  map: "Mapa",
  cards: "Tarjetas",
  detail: "Fichas",
  count: "{n} registros",
  countOne: "1 registro",
  countOf: "{n} de {total}",
  intensity: "más intenso, más {label}",
  empty: "Nada coincide con «{q}».",
  close: "Cerrar",
  open: "Abrir",
  levelChanged: "Vista: {level}",
};

const LEVEL_GLYPHS: Record<CardsLevel, string> = {
  map: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="9.5" y="3" width="5" height="5" rx="1"/><rect x="16" y="3" width="5" height="5" rx="1"/><rect x="3" y="9.5" width="5" height="5" rx="1"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><rect x="16" y="9.5" width="5" height="5" rx="1"/><rect x="3" y="16" width="5" height="5" rx="1"/><rect x="9.5" y="16" width="5" height="5" rx="1"/><rect x="16" y="16" width="5" height="5" rx="1"/>',
  cards: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>',
  detail: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7.5 8h9M7.5 12h9M7.5 16h5"/>',
};
const CLOSE = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const SVG = "http://www.w3.org/2000/svg";
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Con más registros que esto, las tarjetas fuera de la pantalla no se pintan (`content-visibility`). */
const MANY = 300;

let uid = 0;

interface Card {
  key: string;
  el: HTMLLIElement;
  hit: HTMLButtonElement;
  row: CardsRow;
  /** La fila serializada: si cambia, el cuerpo se vuelve a armar. */
  sig: string;
  body?: HTMLElement;
}

const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const sig = (row: CardsRow) => {
  try {
    return JSON.stringify(row);
  } catch {
    return "";
  }
};

export class NxCards extends Base {
  static {
    attrProps(this, ["headingLevel"]);
  }
  declare headingLevel: string | null;
  static observedAttributes = ["fields", "layout", "rows", "actions", "labels", "level", "group", "sort", "row-key", "heading-level", "locale"];

  #fields: CardsField[] = [];
  #fieldMap = new Map<string, CardsField>();
  #layout: CardsLayout | null = null;
  #rows: CardsRow[] = [];
  #actions: CardsAction[] = [];
  #labels: CardsLabels = CARDS_LABELS;
  #level: CardsLevel = "cards";
  #query = "";
  #uid = `nx-cd${++uid}`;
  #cards = new Map<string, Card>();
  #open: string | null = null;
  #visible = 0;
  #queued = false;
  #rendered = false;
  #abort?: AbortController;
  #qTimer = 0;
  #wheel = { acc: 0, at: 0 };

  #root?: HTMLDivElement;
  #bar?: HTMLDivElement;
  #input?: HTMLInputElement;
  #groupSel?: HTMLSelectElement;
  #sortSel?: HTMLSelectElement;
  #count?: HTMLElement;
  #seg?: HTMLFieldSetElement;
  #legend?: HTMLUListElement;
  #zone?: HTMLDivElement;
  #live?: HTMLElement;
  #tip?: HTMLDivElement;

  // ---------------------------------------------------------------- propiedades

  /** Los campos `{key, label, type?, …}`. El atributo `fields` acepta el mismo arreglo como JSON. */
  get fields(): CardsField[] {
    return this.#fields;
  }
  set fields(value: CardsField[] | null | undefined) {
    this.#fields = Array.isArray(value) ? value.filter((f) => f && typeof f === "object" && typeof f.key === "string") : [];
    this.#fieldMap = new Map(this.#fields.map((f) => [f.key, f]));
    this.#invalidate();
  }

  /** Dónde va cada campo: `{title, subtitle?, status?, note?, value?, delta?, trend?, weight?, brief?, facts?, related?, href?}`. */
  get layout(): CardsLayout | null {
    return this.#layout;
  }
  set layout(value: CardsLayout | null | undefined) {
    this.#layout = value && typeof value === "object" && typeof value.title === "string" ? value : null;
    this.#invalidate();
  }

  /** Los registros, tal como salen de la base de datos. */
  get rows(): CardsRow[] {
    return this.#rows;
  }
  set rows(value: CardsRow[] | null | undefined) {
    this.#rows = Array.isArray(value) ? value.filter((r) => r && typeof r === "object") : [];
    this.#schedule();
  }

  /** Botones de la tarjeta abierta: `[{id, label, primary?, disabledFor?}]` → `nx-cards-action`. */
  get actions(): CardsAction[] {
    return this.#actions;
  }
  set actions(value: CardsAction[] | null | undefined) {
    this.#actions = Array.isArray(value) ? value.filter((a) => a && typeof a.id === "string") : [];
    this.#invalidate();
  }

  get labels(): CardsLabels {
    return this.#labels;
  }
  set labels(value: Partial<CardsLabels> | null | undefined) {
    this.#labels = mergeLabels(CARDS_LABELS, value);
    this.#bar = undefined;
    this.#invalidate();
  }

  /** `map`, `cards` (por defecto) o `detail`. */
  get level(): CardsLevel {
    return this.#level;
  }
  set level(value: CardsLevel | null | undefined) {
    this.setAttribute("level", parseLevel(value));
  }

  /** El campo por el que se agrupa (uno con `group: true`), o `null`. */
  get group(): string | null {
    return this.getAttribute("group");
  }
  set group(value: string | null | undefined) {
    this.#attr("group", value || null);
  }

  /** `campo` o `campo:asc` / `campo:desc` (uno con `sort`), o `null` para el orden original. */
  get sort(): string | null {
    return this.getAttribute("sort");
  }
  set sort(value: string | null | undefined) {
    this.#attr("sort", value || null);
  }

  /** El campo que identifica cada registro (`id` por defecto). */
  get rowKey(): string {
    return this.getAttribute("row-key") || "id";
  }
  set rowKey(value: string | null | undefined) {
    this.#attr("row-key", value || null);
  }

  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(value: string | null | undefined) {
    this.#attr("locale", value || null);
  }

  /** Lo escrito en el buscador. */
  get query(): string {
    return this.#query;
  }
  set query(value: string | null | undefined) {
    this.#query = String(value ?? "");
    if (this.#input && this.#input.value !== this.#query) this.#input.value = this.#query;
    this.#schedule();
  }

  /** El registro abierto (su clave), o `null`. */
  get openKey(): string | null {
    return this.#open;
  }

  /** Abre el registro con esa clave en su sitio (o cierra el abierto con `null`). */
  openRow(key: string | null): void {
    this.#flush();
    if (key === this.#open) return;
    const card = key === null ? null : this.#cards.get(key);
    if (key !== null && !card) return;
    this.#toggle(card ?? this.#cards.get(this.#open!)!, !!card);
  }

  /** Un nivel más de detalle (`dir` > 0) o menos; con `anchor`, ese registro se queda en su sitio. */
  zoom(dir: number, anchor?: string): void {
    this.#flush();
    this.#setLevel(stepLevel(this.#level, dir), anchor ? this.#cards.get(anchor)?.el : undefined);
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#root) {
      this.#root = h("div", { class: "nx-cards__root" });
      this.#legend = h("ul", { class: "nx-cards__legend", role: "list" });
      this.#zone = h("div", { class: "nx-cards__zone" });
      this.#live = h("p", { class: "nx-cards__live", "aria-live": "polite" });
      this.#tip = h("div", { class: "nx-cards__tip", hidden: true, "aria-hidden": "true" });
    }
    if (this.#root.parentNode !== this) this.append(this.#root);

    this.#abort?.abort();
    const signal = (this.#abort = new AbortController()).signal;
    this.addEventListener("click", this.#onClick, { signal });
    this.addEventListener("keydown", this.#onKey, { signal });
    this.addEventListener("wheel", this.#onWheel, { signal, passive: false });
    this.addEventListener("pointermove", this.#onPointer, { signal, passive: true });
    this.addEventListener("pointerover", this.#onOver, { signal });
    this.addEventListener("pointerleave", () => this.#hideTip(), { signal });
    this.addEventListener("focusin", this.#onFocusIn, { signal });
    this.addEventListener("focusout", () => this.#hideTip(), { signal });
    addEventListener("scroll", () => this.#hideTip(), { signal, passive: true, capture: true });
    this.#rendered = false;
    this.#render();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    clearTimeout(this.#qTimer);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "fields" || name === "layout" || name === "rows" || name === "actions" || name === "labels") {
      if (value === null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        console.warn(`[nx-cards] el atributo "${name}" no es JSON válido`);
        return;
      }
      (this as unknown as Record<string, unknown>)[name] = parsed;
      return;
    }
    if (name === "level") {
      const next = parseLevel(value);
      if (next !== this.#level) this.#setLevel(next);
      return;
    }
    if (name === "locale" || name === "heading-level" || name === "row-key") {
      this.#invalidate();
      return;
    }
    // group / sort: con animación si ya se pintó.
    if (this.#rendered && this.isConnected) this.#transition(() => this.#render());
    else this.#schedule();
  }

  // ---------------------------------------------------------------- estado interno

  #attr(name: string, value: string | null): void {
    if (value === null) this.removeAttribute(name);
    else this.setAttribute(name, value);
  }

  #emit<T>(type: string, detail: T, cancelable = false): boolean {
    return emit(this, type, detail, cancelable);
  }

  /** Algo que cambia cómo se pinta cada tarjeta: se rehacen todas. */
  #invalidate(): void {
    for (const c of this.#cards.values()) c.sig = "";
    this.#bar = undefined;
    this.#schedule();
  }

  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => this.#flush());
  }

  #flush(): void {
    if (!this.#queued && this.#rendered) return;
    this.#queued = false;
    if (this.isConnected && this.#root) this.#render();
  }

  #fmt(): NxFormat {
    return nxFormat(resolveLocale(this));
  }

  #headingLevel(): number {
    const n = Number(this.getAttribute("heading-level"));
    return n >= 1 && n <= 6 ? Math.floor(n) : 3;
  }

  /** El campo y la dirección del orden actual. */
  #sortSpec(): { field: CardsField | undefined; dir: "asc" | "desc" } {
    const [key, d] = (this.sort ?? "").split(":");
    const field = this.#fieldMap.get(key);
    if (!field?.sort) return { field: undefined, dir: "asc" };
    return { field, dir: d === "asc" || d === "desc" ? d : field.sort };
  }

  // ---------------------------------------------------------------- render

  #render(): void {
    const root = this.#root!;
    this.#queued = false;
    this.#rendered = true;
    root.dataset.level = this.#level;
    const L = this.#layout;
    if (!this.#bar) {
      this.#buildBar();
      root.replaceChildren(this.#bar!, this.#legend!, this.#zone!, this.#live!, this.#tip!);
    }
    if (!L) {
      this.#zone!.replaceChildren();
      return;
    }
    const fmt = this.#fmt();
    const focus = this.#focusSnapshot();

    // Qué se ve y en qué orden.
    const ranks = weightRanks(this.#rows, L.weight ?? L.value);
    const shown = this.#rows.filter((r) => matchRow(r, this.#query, this.#fieldMap, L, fmt));
    const { field: sortField, dir } = this.#sortSpec();
    const groupField = this.#fieldMap.get(this.group ?? "");
    const groups = groupRows(sortRows(shown, sortField, dir, fmt), groupField?.group ? groupField : undefined, L, fmt);
    this.#visible = shown.length;

    // Una tarjeta por registro; la misma de antes si ya existía.
    const keyOf = this.rowKey;
    const seen = new Map<string, number>();
    const next = new Map<string, Card>();
    const keyFor = (row: CardsRow) => {
      const id = String(row[keyOf] ?? "");
      const n = seen.get(id) ?? 0;
      seen.set(id, n + 1);
      return n ? `${id}#${n}` : id;
    };
    const cardFor = new Map<CardsRow, Card>();
    for (const row of this.#rows) {
      const key = keyFor(row);
      const s = sig(row);
      let card = this.#cards.get(key);
      if (!card) card = this.#newCard(key, row);
      else if (card.sig !== s || !s) {
        card.body?.remove();
        card.body = undefined;
      }
      card.row = row;
      card.sig = s;
      this.#paintTile(card, ranks.get(row) ?? 0, fmt);
      next.set(key, card);
      cardFor.set(row, card);
    }
    this.#cards = next;
    if (this.#open && !next.has(this.#open)) this.#open = null;

    // Estantes (grupos) con sus tarjetas; las que no se ven quedan fuera del documento.
    const hl = this.#headingLevel();
    const shelves = groups.map((g, gi) => {
      const hid = g.label ? `${this.#uid}-g${gi}` : null;
      const grid = h("ul", { class: "nx-cards__grid", role: "list", "aria-labelledby": hid });
      for (const row of g.rows) {
        const card = cardFor.get(row)!;
        card.el.classList.toggle("is-open", card.key === this.#open);
        grid.append(card.el);
      }
      const head = g.label
        ? h(
            "div",
            { class: "nx-cards__shelf-head" },
            h(`h${hl}` as "h3", { id: hid, class: "nx-cards__shelf-title" }, g.label),
            h("span", { class: "nx-cards__shelf-count" }, this.#countText(g.rows.length)),
            g.total !== null && L.value ? h("span", { class: "nx-cards__shelf-total" }, formatField(this.#fieldMap.get(L.value), g.total, fmt)) : null,
          )
        : null;
      return h("section", { class: "nx-cards__shelf", "aria-labelledby": hid }, head, grid);
    });
    const q = this.#query.trim();
    this.#zone!.replaceChildren(...shelves, shown.length ? "" : h("p", { class: "nx-cards__empty" }, fillCount(this.#labels.empty, { q })));
    root.classList.toggle("is-many", shown.length > MANY);

    this.#ensureBodies();
    this.#paintBar(shown.length);
    this.#paintLegend(shown, fmt);
    this.#restoreFocus(focus);
  }

  /** Los cuerpos que hacen falta en este nivel (y el de la abierta). */
  #ensureBodies(): void {
    const fmt = this.#fmt();
    for (const c of this.#cards.values()) {
      if (!c.el.isConnected) continue;
      if ((this.#level !== "map" || c.key === this.#open) && !c.body) {
        c.body = this.#body(c.row, fmt);
        c.el.append(c.body);
      }
    }
  }

  #newCard(key: string, row: CardsRow): Card {
    const hit = h("button", { type: "button", class: "nx-cards__hit", "aria-expanded": "false" });
    const el = h("li", { class: "nx-cards__card", "data-key": key }, hit);
    const card: Card = { key, el, hit, row, sig: "" };
    return card;
  }

  /** Lo que se ve siempre: el color del cuadro, el peso y el nombre accesible. */
  #paintTile(card: Card, rank: number, fmt: NxFormat): void {
    const L = this.#layout!;
    const st = L.status ? statusOf(this.#fieldMap.get(L.status), card.row[L.status]) : null;
    const tone: CardsTone = st?.tone ?? "neutral";
    card.el.dataset.tone = tone;
    card.el.style.setProperty("--nx-cards-mix", `${mixFor(rank)}%`);
    card.el.classList.toggle("is-heavy", isHeavy(rank, this.#rows.length));
    const title = String(card.row[L.title] ?? "");
    const value = L.value ? formatField(this.#fieldMap.get(L.value), card.row[L.value], fmt) : "";
    card.hit.setAttribute("aria-label", [title, st ? (st.label ?? st.value) : "", value].filter(Boolean).join(", "));
  }

  #body(row: CardsRow, fmt: NxFormat): HTMLElement {
    const L = this.#layout!;
    const F = this.#fieldMap;
    const text = (k: string | undefined) => (k ? formatField(F.get(k), row[k], fmt) : "");
    const st = L.status ? statusOf(F.get(L.status), row[L.status]) : null;
    const subtitle = (L.subtitle ?? []).map(text).filter(Boolean).join(" · ");
    const value = text(L.value);
    const delta = L.delta ? deltaParts(row[L.delta], fmt) : null;
    const brief = (L.brief ?? []).map(text).filter(Boolean).join(" · ");

    const main = h(
      "div",
      { class: "nx-cards__main" },
      h(
        "div",
        { class: "nx-cards__head" },
        h("strong", { class: "nx-cards__title" }, String(row[L.title] ?? "")),
        st ? h("span", { class: "nx-cards__chip", "data-tone": st.tone ?? "neutral", "data-quiet": st.quiet || null }, st.label ?? st.value) : null,
      ),
      subtitle ? h("p", { class: "nx-cards__sub" }, subtitle) : null,
      L.note && row[L.note] ? h("p", { class: "nx-cards__note" }, text(L.note)) : null,
    );
    if (value || delta) {
      const kpi = h(
        "div",
        { class: "nx-cards__kpi" },
        h(
          "div",
          null,
          value ? h("span", { class: "nx-cards__value" }, value) : null,
          h(
            "span",
            { class: "nx-cards__value-label" },
            L.value ? (F.get(L.value)?.label ?? "") : "",
            delta ? h("span", { class: "nx-cards__delta", "data-up": delta.up ? "" : null }, delta.text) : null,
          ),
        ),
      );
      const spark = L.trend ? sparkPaths(row[L.trend] as unknown[], 30) : null;
      if (spark) kpi.append(this.#spark(spark));
      main.append(kpi);
    }
    if (brief) main.append(h("p", { class: "nx-cards__brief" }, brief));
    const facts = (L.facts ?? []).filter((k) => text(k));
    if (facts.length) {
      main.append(
        h(
          "dl",
          { class: "nx-cards__facts" },
          ...facts.map((k) => {
            const f = F.get(k);
            const tone = f?.type === "percent" ? meterTone(row[k], f) : null;
            const n = typeof row[k] === "number" ? Math.max(0, Math.min(100, row[k] as number)) : null;
            return h(
              "div",
              null,
              h("dt", null, f?.label ?? k),
              h("dd", null, text(k), f?.type === "percent" && n !== null && (f.good !== undefined || f.bad !== undefined) ? h("span", { class: "nx-cards__meter", "data-tone": tone }, h("i", { style: `inline-size:${n}%` })) : null),
            );
          }),
        ),
      );
    }

    const more = h("div", { class: "nx-cards__more" });
    const related = L.related && Array.isArray(row[L.related]) ? (row[L.related] as CardsRelated[]).filter((r) => r && typeof r === "object") : [];
    if (related.length) {
      more.append(
        h("h4", { class: "nx-cards__more-title" }, F.get(L.related!)?.label ?? ""),
        h(
          "ul",
          { class: "nx-cards__related", role: "list" },
          ...related.map((r) =>
            h(
              "li",
              null,
              h("span", { class: "nx-cards__related-title" }, String(r.title ?? ""), r.meta ? h("span", { class: "nx-cards__related-meta" }, String(r.meta)) : null),
              r.value !== undefined && r.value !== null ? h("span", { class: "nx-cards__related-value" }, typeof r.value === "number" ? fmt.number(r.value) : String(r.value)) : null,
              r.status ? h("span", { class: "nx-cards__chip", "data-tone": r.tone ?? "neutral" }, String(r.status)) : null,
            ),
          ),
        ),
      );
    }
    const href = L.href ? safeHref(row[L.href]) : undefined;
    const statusValue = L.status ? String(row[L.status] ?? "") : "";
    if (this.#actions.length || href) {
      more.append(
        h(
          "div",
          { class: "nx-cards__actions" },
          ...this.#actions.map((a) =>
            h("button", { type: "button", class: `nx-cards__btn${a.primary ? " is-primary" : ""}`, "data-nx-action": a.id, disabled: !!a.disabledFor?.includes(statusValue) }, String(a.label ?? a.id)),
          ),
          href ? h("a", { class: "nx-cards__btn nx-cards__link", href }, this.#labels.open) : null,
        ),
      );
    }
    const close = h("button", { type: "button", class: "nx-cards__close", "data-nx-close": "", "aria-label": this.#labels.close, title: this.#labels.close }, glyph(CLOSE));
    return h("div", { class: "nx-cards__body" }, main, more.childNodes.length ? more : null, close);
  }

  #spark(p: { line: string; area: string; last: number }): HTMLElement {
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 100 30");
    svg.setAttribute("preserveAspectRatio", "none");
    for (const [cls, d] of [["area", p.area], ["line", p.line]]) {
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("class", `nx-cards__spark-${cls}`);
      path.setAttribute("d", d);
      svg.append(path);
    }
    return h("div", { class: "nx-cards__spark", "aria-hidden": "true" }, svg, h("span", { class: "nx-cards__dot", style: `inset-block-start:${((p.last / 30) * 100).toFixed(1)}%` }));
  }

  // ---------------------------------------------------------------- barra de herramientas

  #buildBar(): void {
    const L = this.#labels;
    const id = this.#uid;
    this.#input = h("input", { type: "search", id: `${id}-q`, class: "nx-cards__input", placeholder: L.placeholder, autocomplete: "off", spellcheck: "false" });
    this.#input.value = this.#query;
    this.#input.addEventListener("input", () => {
      clearTimeout(this.#qTimer);
      this.#qTimer = window.setTimeout(() => {
        this.#query = this.#input!.value;
        this.#transition(() => this.#render());
      }, 140);
    });

    const groupable = this.#fields.filter((f) => f.group);
    const sortable = this.#fields.filter((f) => f.sort);
    this.#groupSel = groupable.length
      ? h("select", { id: `${id}-g`, class: "nx-cards__select" }, h("option", { value: "" }, L.noGroup), ...groupable.map((f) => h("option", { value: f.key }, f.label)))
      : undefined;
    const dirLabel = (f: CardsField) => (f.type === "text" || f.type === undefined ? L.az : f.type === "date" ? (f.sort === "desc" ? L.recent : L.oldest) : f.sort === "desc" ? L.desc : L.asc);
    this.#sortSel = sortable.length
      ? h("select", { id: `${id}-s`, class: "nx-cards__select" }, h("option", { value: "" }, L.noSort), ...sortable.map((f) => h("option", { value: f.key }, `${f.label} (${dirLabel(f)})`)))
      : undefined;
    this.#groupSel?.addEventListener("change", () => (this.group = this.#groupSel!.value));
    this.#sortSel?.addEventListener("change", () => (this.sort = this.#sortSel!.value));
    this.#count = h("span", { class: "nx-cards__count", "aria-live": "polite" });

    this.#seg = h(
      "fieldset",
      { class: "nx-cards__levels" },
      h("legend", { class: "nx-cards__label" }, L.level),
      h(
        "div",
        { class: "nx-cards__track" },
        ...LEVELS.map((lv) => {
          const input = h("input", { type: "radio", name: `${id}-lv`, value: lv, class: "nx-cards__radio" });
          input.addEventListener("change", () => this.#setLevel(lv));
          return h("label", { class: "nx-cards__level" }, input, glyph(LEVEL_GLYPHS[lv]), L[lv]);
        }),
      ),
    );
    const field = (label: string, control: HTMLElement | undefined, cls = "") =>
      control ? h("label", { class: `nx-cards__field ${cls}`.trim() }, h("span", { class: "nx-cards__label" }, label), control) : null;
    this.#bar = h(
      "div",
      { class: "nx-cards__bar" },
      field(L.search, this.#input, "nx-cards__field--search"),
      field(L.group, this.#groupSel),
      field(L.sort, this.#sortSel),
      this.#count,
      this.#seg,
    );
  }

  #countText(n: number): string {
    return n === 1 ? this.#labels.countOne : fillCount(this.#labels.count, { n: this.#fmt().number(n) });
  }

  #paintBar(shown: number): void {
    const fmt = this.#fmt();
    const total = this.#rows.length;
    this.#count!.textContent = shown === total ? this.#countText(total) : fillCount(this.#labels.countOf, { n: fmt.number(shown), total: fmt.number(total) });
    if (this.#groupSel) this.#groupSel.value = this.#fieldMap.get(this.group ?? "")?.group ? this.group! : "";
    if (this.#sortSel) this.#sortSel.value = this.#sortSpec().field?.key ?? "";
    for (const r of this.#seg!.querySelectorAll<HTMLInputElement>("input")) r.checked = r.value === this.#level;
  }

  /** La leyenda del mapa: un renglón por estado, con cuántos hay. */
  #paintLegend(shown: CardsRow[], fmt: NxFormat): void {
    const L = this.#layout!;
    const field = L.status ? this.#fieldMap.get(L.status) : undefined;
    const legend = this.#legend!;
    if (!field?.options?.length) {
      legend.replaceChildren();
      return;
    }
    const counts = new Map<string, number>();
    for (const r of shown) {
      const v = String(r[field.key] ?? "");
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const weight = this.#fieldMap.get(L.weight ?? L.value ?? "");
    legend.replaceChildren(
      ...field.options.map((o) => {
        const ramp = !o.tone || o.tone === "neutral" || o.tone === "success";
        const swatch = h("span", { class: "nx-cards__swatch", "data-tone": o.tone ?? "neutral", "aria-hidden": "true" });
        if (ramp) swatch.append(h("i", { style: "--m:18%" }), h("i", { style: "--m:46%" }), h("i", { style: "--m:80%" }));
        return h(
          "li",
          null,
          swatch,
          o.label ?? o.value,
          " ",
          h("b", null, fmt.number(counts.get(o.value) ?? 0)),
          ramp && weight ? h("span", { class: "nx-cards__ramp" }, ` · ${fillCount(this.#labels.intensity, { label: weight.label.toLocaleLowerCase(fmt.locale) })}`) : null,
        );
      }),
    );
  }

  // ---------------------------------------------------------------- movimiento

  /**
   * FLIP sobre los nodos persistentes: se mide, se cambia, se vuelve a medir y cada tarjeta que se
   * ve arranca desde donde estaba. Con `anchor`, ese registro se queda en el mismo punto de la
   * pantalla (se desplaza la página lo que haga falta).
   */
  #transition(mutate: () => void, anchor?: HTMLElement | null): void {
    const animate = !reduced() && this.#rendered && typeof HTMLElement.prototype.animate === "function";
    const cards = [...this.#cards.values()].map((c) => c.el);
    const before = new Map<HTMLElement, DOMRect>();
    const top = anchor?.isConnected ? anchor.getBoundingClientRect().top : null;
    if (animate) {
      // Se mide antes de cancelar: una animación en curso sigue desde donde se ve.
      for (const el of cards) if (el.isConnected) before.set(el, el.getBoundingClientRect());
      for (const el of cards) el.getAnimations?.({ subtree: true }).forEach((a) => a.cancel());
    }
    mutate();
    if (top !== null && anchor?.isConnected) window.scrollBy(0, anchor.getBoundingClientRect().top - top);
    if (!animate) return;
    const vh = innerHeight;
    const inView = (r: DOMRect) => r.bottom > -40 && r.top < vh + 40;
    for (const el of cards) {
      if (!el.isConnected) continue;
      const a = el.getBoundingClientRect();
      const b = before.get(el);
      if (!b) {
        if (inView(a)) el.animate([{ opacity: 0, transform: "scale(0.96)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: EASE });
        continue;
      }
      if (!a.width || !b.width || (!inView(a) && !inView(b))) continue;
      const dx = b.left - a.left;
      const dy = b.top - a.top;
      const sx = b.width / a.width;
      const sy = b.height / a.height;
      const resized = Math.abs(sx - 1) > 0.04 || Math.abs(sy - 1) > 0.04;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !resized) continue;
      el.animate(
        [
          { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
          { transformOrigin: "0 0", transform: "none" },
        ],
        { duration: resized ? 460 : 360, easing: EASE },
      );
      // El contenido estirado no se ve: aparece cuando la tarjeta ya casi tiene su forma nueva.
      const body = el.querySelector<HTMLElement>(".nx-cards__body");
      if (resized && body?.offsetParent) body.animate([{ opacity: 0 }, { opacity: 0, offset: 0.4 }, { opacity: 1 }], { duration: 460, easing: "ease-out" });
    }
  }

  /** La primera tarjeta que se ve (debajo de la barra, si es fija): el ancla por defecto. */
  #firstVisible(): HTMLElement | null {
    const barBottom = Math.max(0, this.#bar?.getBoundingClientRect().bottom ?? 0);
    for (const el of this.#zone?.querySelectorAll<HTMLElement>(".nx-cards__card") ?? []) {
      if (el.getBoundingClientRect().bottom > barBottom + 4) return el;
    }
    return null;
  }

  #setLevel(level: CardsLevel, anchor?: HTMLElement | null): void {
    if (level === this.#level) return;
    this.#hideTip();
    const open = this.#open ? this.#cards.get(this.#open)?.el : null;
    const apply = () => {
      this.#level = level;
      if (this.getAttribute("level") !== level) this.setAttribute("level", level);
      if (this.#root) {
        this.#root.dataset.level = level;
        this.#ensureBodies();
        if (this.#seg) for (const r of this.#seg.querySelectorAll<HTMLInputElement>("input")) r.checked = r.value === level;
      }
    };
    if (!this.#rendered || !this.isConnected) {
      apply();
      return;
    }
    this.#transition(apply, open ?? anchor ?? this.#firstVisible());
    this.#live!.textContent = fillCount(this.#labels.levelChanged, { level: this.#labels[level] });
    this.#emit("nx-cards-level", { level });
  }

  #toggle(card: Card, open: boolean): void {
    const prev = this.#open ? this.#cards.get(this.#open) : undefined;
    this.#hideTip();
    this.#transition(() => {
      if (prev) {
        prev.el.classList.remove("is-open");
        prev.hit.setAttribute("aria-expanded", "false");
      }
      this.#open = open ? card.key : null;
      card.el.classList.toggle("is-open", open);
      card.hit.setAttribute("aria-expanded", String(open));
      this.#ensureBodies();
    }, card.el);
    if (prev && prev !== card) this.#emit("nx-cards-open", { row: prev.row, open: false });
    this.#emit("nx-cards-open", { row: card.row, open });
    if (open) {
      card.el.querySelector<HTMLElement>(".nx-cards__close")?.focus({ preventScroll: true });
      const r = card.el.getBoundingClientRect();
      const barBottom = Math.max(0, this.#bar?.getBoundingClientRect().bottom ?? 0);
      if (r.top < barBottom || r.bottom > innerHeight) window.scrollBy({ top: r.top - barBottom - 12, behavior: reduced() ? "auto" : "smooth" });
    } else {
      card.hit.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------------- foco

  #focusSnapshot(): { key?: string; sel: string } | null {
    const a = document.activeElement as HTMLElement | null;
    if (!a || !this.#zone?.contains(a)) return null;
    const card = a.closest<HTMLElement>(".nx-cards__card");
    if (!card) return null;
    return { key: card.dataset.key, sel: a.classList.contains("nx-cards__close") ? ".nx-cards__close" : ".nx-cards__hit" };
  }

  #restoreFocus(f: { key?: string; sel: string } | null): void {
    if (!f || this.#zone!.contains(document.activeElement)) return;
    const card = f.key !== undefined ? this.#cards.get(f.key) : undefined;
    (card?.el.isConnected ? card.el.querySelector<HTMLElement>(f.sel) : this.#zone!.querySelector<HTMLElement>(".nx-cards__hit"))?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- globo del mapa

  #showTip(el: HTMLElement): void {
    const card = this.#cards.get(el.dataset.key ?? "");
    const tip = this.#tip;
    const L = this.#layout;
    if (!card || !tip || !L || this.#level !== "map" || card.key === this.#open) return;
    const fmt = this.#fmt();
    const st = L.status ? statusOf(this.#fieldMap.get(L.status), card.row[L.status]) : null;
    const value = L.value ? formatField(this.#fieldMap.get(L.value), card.row[L.value], fmt) : "";
    tip.replaceChildren(h("b", null, String(card.row[L.title] ?? "")), h("span", null, [value, st ? (st.label ?? st.value) : ""].filter(Boolean).join(" · ")));
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth;
    const hgt = tip.offsetHeight;
    let y = r.top - hgt - 8;
    if (y < 8) y = r.bottom + 8;
    tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${y}px`;
  }

  #hideTip(): void {
    if (this.#tip) this.#tip.hidden = true;
  }

  // ---------------------------------------------------------------- interacción

  #onClick = (e: MouseEvent): void => {
    const t = e.target as Element | null;
    if (!t?.closest) return;
    const cardEl = t.closest<HTMLElement>(".nx-cards__card");
    const card = cardEl && this.contains(cardEl) ? this.#cards.get(cardEl.dataset.key ?? "") : undefined;
    if (!card) return;
    const act = t.closest<HTMLElement>("[data-nx-action]");
    if (act) {
      this.#emit("nx-cards-action", { action: act.dataset.nxAction!, row: card.row });
      return;
    }
    if (t.closest("[data-nx-close]")) this.#toggle(card, false);
    else if (t.closest(".nx-cards__hit")) this.#toggle(card, card.key !== this.#open);
  };

  #onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (e.key === "Escape" && this.#open && !isField(t)) {
      e.preventDefault();
      this.#toggle(this.#cards.get(this.#open)!, false);
      return;
    }
    if (isField(t) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_") {
      e.preventDefault();
      const el = t.closest?.<HTMLElement>(".nx-cards__card");
      this.#setLevel(stepLevel(this.#level, e.key === "+" || e.key === "=" ? 1 : -1), el);
      return;
    }
    if (!t.classList?.contains("nx-cards__hit")) return;
    const hits = [...(this.#zone?.querySelectorAll<HTMLElement>(".nx-cards__card:not(.is-open) > .nx-cards__hit") ?? [])];
    const boxes = hits.map((b) => {
      const r = b.parentElement!.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const to = moveIndex(boxes, hits.indexOf(t), e.key);
    if (to === null) return;
    e.preventDefault();
    hits[to]?.focus();
  };

  /** `Ctrl` + rueda (y el pellizco del trackpad, que llega igual): acercar = más detalle. */
  #onWheel = (e: WheelEvent): void => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const w = this.#wheel;
    w.acc += e.deltaY;
    const now = performance.now();
    if (Math.abs(w.acc) > 40 && now - w.at > 380) {
      const under = (e.target as Element | null)?.closest?.<HTMLElement>(".nx-cards__card");
      this.#setLevel(stepLevel(this.#level, w.acc < 0 ? 1 : -1), under);
      w.acc = 0;
      w.at = now;
    }
  };

  #onPointer = (e: PointerEvent): void => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(".nx-cards__card");
    if (!card || this.#level === "map") return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--nx-cards-x", `${e.clientX - r.left}px`);
    card.style.setProperty("--nx-cards-y", `${e.clientY - r.top}px`);
  };

  #onOver = (e: PointerEvent): void => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(".nx-cards__card");
    if (card) this.#showTip(card);
    else this.#hideTip();
  };

  #onFocusIn = (e: FocusEvent): void => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(".nx-cards__card");
    if (card && (e.target as Element).classList.contains("nx-cards__hit")) this.#showTip(card);
  };
}
