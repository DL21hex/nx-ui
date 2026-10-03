/**
 * `<nx-launcher>`: tarjetas de navegación a los módulos de un área («Compras», «Talento humano»).
 *
 * Cada tarjeta dice para qué sirve el módulo y trae UN dato vivo (la señal: «7 por aprobar»). Con
 * puntero, al pasar por ella la descripción cede su lugar a las vistas del módulo, para entrar
 * directo a una; en pantallas táctiles las vistas se ven siempre. Una tarjeta destacada ocupa dos
 * columnas («Continuar donde ibas»).
 *
 * Reglas de diseño:
 * - **Light DOM y `<a href>` reales.** El router de la app las intercepta solo; en HTML plano
 *   navegan. `nx-launcher-select` (cancelable) es la puerta para quien quiera decidir otra cosa.
 * - **Nada se mueve al filtrar.** Con `search`, lo que no coincide se apaga en su sitio: la
 *   memoria de dónde está cada módulo vale más que un reacomodo.
 * - **La tarjeta se convierte en la página.** Al abrirla lleva los nombres de View Transitions
 *   `nx-launcher-card`, `-icon` y `-label`; si la página de destino los usa en su encabezado, el
 *   navegador anima el paso (entre documentos con `@view-transition`, o con `startViewTransition`
 *   en una SPA). Al volver, la misma tarjeta los recupera (`pagereveal`, o `reveal()`).
 * - **Las columnas no dejan huérfanas.** Entre las que caben y una menos, las que dejan menos
 *   tarjetas solas en la última fila (4 módulos van en 2 × 2, no en 3 + 1).
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph, icon } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import { balanceColumns, clampMeter, fill, firstTarget, fitColumns, formatBadge, groupBySection, itemHref, matchItem, moveIndex, progressParts, sparkPaths, type LauncherTarget } from "./logic";
import type { LauncherItem, LauncherLabels, LauncherSelectDetail, LauncherSignal } from "./types";

export const LAUNCHER_LABELS: LauncherLabels = {
  nav: "Módulos",
  search: "Ir a",
  placeholder: "Módulo o vista…",
  empty: "Ningún módulo coincide.",
  open: "Enter abre {name}",
  views: "Vistas de {name}",
};

const ARROW = '<path d="M7 17 17 7"/><path d="M8.5 7H17v8.5"/>';
const SVG = "http://www.w3.org/2000/svg";
const NAMES = ["nx-launcher-card", "nx-launcher-icon", "nx-launcher-label"] as const;
const STORE = "nx-launcher:from";
/** Cuánto duran los nombres de View Transitions en la tarjeta si nadie los usa. */
const HOLD = 1500;

let uid = 0;
/** La última tarjeta abierta en esta página (SPA): `reveal()` sin argumento vuelve a ella. */
let lastFrom: string | null = null;

interface Card {
  el: HTMLLIElement;
  item: LauncherItem;
  /** Prefijo de los ids de la tarjeta (los ids del backend pueden traer espacios). */
  base: string;
  /** Lo que la pinta, sin la señal: si cambia, la tarjeta se rehace. */
  body: string;
  signal: string;
}

/** «240px», «18rem» o «16em» en píxeles (lo demás, 0: se usa el valor por defecto). */
function toPx(value: string, em: number): number {
  const m = /^\s*([\d.]+)(px|rem|em)?\s*$/.exec(value);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const root = typeof document !== "undefined" ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;
  return m[2] === "rem" ? n * root : m[2] === "em" ? n * (em || 16) : n;
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
/** ¿Se está escribiendo en un campo? El origen real del evento: uno dentro de un shadow DOM llega reapuntado a su host. */
const isField = (e: Event) => {
  const t = e.composedPath?.()[0] ?? e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};

/** El formato de porcentaje, uno por locale (el mismo de `fmt`, ya validado). */
const percents = new Map<string, Intl.NumberFormat>();
function percent(locale: string): Intl.NumberFormat {
  let f = percents.get(locale);
  if (!f) percents.set(locale, (f = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 1 })));
  return f;
}

export class NxLauncher extends Base {
  static observedAttributes = ["items", "labels", "search", "columns", "heading-level", "locale"];

  #items: LauncherItem[] = [];
  #labels: LauncherLabels = LAUNCHER_LABELS;
  #uid = `nx-la${++uid}`;
  #root?: HTMLDivElement;
  #nav?: HTMLElement;
  #input?: HTMLInputElement;
  #hint?: HTMLElement;
  #cards = new Map<string, Card>();
  /** La forma de la navegación (secciones y claves en orden): si no cambia, las tarjetas no se mueven. */
  #shape = "";
  #query = "";
  #target: LauncherTarget | null = null;
  #queued = false;
  #rendered = false;
  #abort?: AbortController;
  #resize?: ResizeObserver;
  #marked: HTMLElement | null = null;
  #seq = 0;
  #unmark = 0;

  // ---------------------------------------------------------------- propiedades

  /** Las tarjetas. El atributo `items` acepta el mismo arreglo como JSON. */
  get items(): LauncherItem[] {
    return this.#items;
  }
  set items(value: LauncherItem[] | null | undefined) {
    this.#items = Array.isArray(value) ? value.filter((it) => it && typeof it === "object") : [];
    this.#schedule();
  }

  get labels(): LauncherLabels {
    return this.#labels;
  }
  set labels(value: Partial<LauncherLabels> | null | undefined) {
    this.#labels = mergeLabels(LAUNCHER_LABELS, value);
    // Los textos van también dentro de las tarjetas («Vistas de …»): se rehacen.
    this.#cards.clear();
    this.#shape = "";
    this.#schedule();
  }

  /** Muestra el buscador «Ir a». Escribir con el foco en la página (o en una tarjeta) lo usa. */
  get search(): boolean {
    return boolAttr(this, "search");
  }
  set search(value: boolean) {
    this.#setAttr("search", value ? "" : null);
  }

  /** Máximo de columnas (4 por defecto). */
  get columns(): number {
    const n = Number(this.getAttribute("columns"));
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 4;
  }
  set columns(value: number | null | undefined) {
    this.#setAttr("columns", value == null ? null : String(value));
  }

  /** Nivel de los títulos de sección (2 por defecto). */
  get headingLevel(): number {
    const n = Number(this.getAttribute("heading-level"));
    return n >= 1 && n <= 6 ? Math.floor(n) : 2;
  }
  set headingLevel(value: number | null | undefined) {
    this.#setAttr("heading-level", value == null ? null : String(value));
  }

  /** Locale de los números de la señal («es-CO»); sin él, el `lang` más cercano. */
  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(value: string | null | undefined) {
    this.#setAttr("locale", value || null);
  }

  /** Lo que hay escrito en el buscador. */
  get query(): string {
    return this.#query;
  }
  set query(value: string | null | undefined) {
    this.#query = String(value ?? "");
    if (this.#input) this.#input.value = this.#query;
    this.#applyFilter();
  }

  /** Enfoca la tarjeta `id` (o la primera). */
  focusItem(id?: string): void {
    this.#flush();
    const card = id === undefined ? this.#nav?.querySelector(".nx-launcher__card") : this.#cardOf(id)?.el;
    card?.querySelector<HTMLElement>(".nx-launcher__link")?.focus();
  }

  /**
   * Para volver con una View Transition en una SPA: dentro del `startViewTransition` de la vuelta,
   * después de montar el launcher, marca la tarjeta de la que se salió (o `id`) con los nombres de
   * la animación. Se limpian solos.
   */
  reveal(id?: string): void {
    this.#flush();
    const key = id ?? lastFrom ?? this.#stored();
    const card = key ? this.#cardOf(key) : undefined;
    if (card) this.#mark(card.el, HOLD);
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#root) this.#root = h("div", { class: "nx-launcher__root" });
    if (this.#root.parentNode !== this) this.append(this.#root);

    this.#abort?.abort();
    const signal = (this.#abort = new AbortController()).signal;
    this.addEventListener("click", this.#onClick, { signal });
    this.addEventListener("keydown", this.#onKey, { signal });
    this.addEventListener("pointermove", this.#onPointer, { signal, passive: true });
    document.addEventListener("keydown", this.#onTypeAhead, { signal });
    // Al volver a esta página (atrás, o desde el bfcache) con una View Transition entre documentos,
    // la tarjeta de la que se salió recupera los nombres para que la página se «encoja» en ella.
    addEventListener(
      "pagereveal",
      (e) => {
        const vt = (e as Event & { viewTransition?: ViewTransition | null }).viewTransition;
        const key = this.#stored();
        if (!vt || !key) return;
        this.#flush();
        const card = this.#cardOf(key);
        if (!card) return;
        this.#mark(card.el, 0);
        vt.finished.finally(() => this.#clearMark());
      },
      { signal },
    );
    if (typeof ResizeObserver === "function") {
      this.#resize = new ResizeObserver(() => this.#layout());
      this.#resize.observe(this);
    }
    this.#rendered = false;
    this.#render();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#resize?.disconnect();
    clearTimeout(this.#unmark);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "items" || name === "labels") {
      if (value === null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        console.warn(`[nx-launcher] el atributo "${name}" no es JSON válido`);
        return;
      }
      if (name === "items") this.items = parsed as LauncherItem[];
      else this.labels = parsed as Partial<LauncherLabels>;
      return;
    }
    // El nivel de los títulos, el buscador o el locale cambian lo que se pinta: se rehace todo.
    this.#shape = "";
    if (name === "locale") this.#cards.clear();
    this.#schedule();
  }

  // ---------------------------------------------------------------- estado interno

  #setAttr(name: string, value: string | null): void {
    if (value === null) this.removeAttribute(name);
    else this.setAttribute(name, value);
  }

  #emit<T>(type: string, detail: T, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => this.#flush());
  }

  /** Pinta ya lo pendiente (un método público no espera la microtarea). */
  #flush(): void {
    if (!this.#queued && this.#rendered) return;
    this.#queued = false;
    if (this.isConnected && this.#root) this.#render();
  }

  #cardOf(id: string): Card | undefined {
    for (const c of this.#cards.values()) if (c.item.id === id) return c;
    return undefined;
  }

  #stored(): string | null {
    try {
      const raw = sessionStorage.getItem(STORE);
      const s = raw ? (JSON.parse(raw) as { path?: string; id?: string }) : null;
      return s && s.path === location.pathname && typeof s.id === "string" ? s.id : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------- render

  #render(): void {
    const root = this.#root!;
    this.#queued = false;
    const first = !this.#rendered;
    this.#rendered = true;
    const fmt = nxFormat(resolveLocale(this));
    const groups = groupBySection(this.#items);

    // Dónde estaba el foco, para devolverlo si al rehacer o mover una tarjeta se pierde.
    const active = document.activeElement as HTMLElement | null;
    let focus: { key?: string; sel: string } | null = null;
    if (active && root.contains(active)) {
      const c = active.closest<HTMLElement>(".nx-launcher__card");
      if (active === this.#input) focus = { sel: "input" };
      else if (c) focus = { key: c.dataset.key, sel: active.dataset.nxView !== undefined ? `[data-nx-view="${active.dataset.nxView}"]` : ".nx-launcher__link" };
    }

    // Claves estables por id (los repetidos se desambiguan por su orden).
    const seen = new Map<string, number>();
    const keyed = groups.map((g) => ({
      label: g.label,
      entries: g.items.map((item) => {
        const id = String(item.id ?? "");
        const n = seen.get(id) ?? 0;
        seen.set(id, n + 1);
        return { item, key: n ? `${id}#${n}` : id };
      }),
    }));

    const next = new Map<string, Card>();
    for (const g of keyed) {
      for (const { item, key } of g.entries) {
        // `data` es de la app (puede ser cualquier cosa, hasta circular): no decide el pintado.
        const { signal: sig, data: _data, ...rest } = item;
        const body = JSON.stringify([rest, !!sig]);
        const signal = JSON.stringify(sig ?? null);
        const old = this.#cards.get(key);
        const changed = !first && sig?.value !== undefined && sig.value !== old?.item.signal?.value;
        if (old && old.body === body) {
          // Solo cambió el dato: se cambia en su sitio (la tarjeta conserva el puntero y el foco).
          if (old.signal !== signal) {
            old.el.querySelector(".nx-launcher__signal")?.remove();
            const s = this.#signal(sig, fmt, `${old.base}-s`);
            if (s) old.el.append(s);
            if (changed) this.#pulse(old.el);
          }
          next.set(key, { ...old, item, signal });
          continue;
        }
        const base = `${this.#uid}-c${++this.#seq}`;
        const el = this.#card(item, key, base, fmt);
        if (old) {
          old.el.replaceWith(el);
          if (changed) this.#pulse(el);
        }
        next.set(key, { el, item, base, body, signal });
      }
    }
    this.#cards = next;

    const shape = JSON.stringify([this.search, this.headingLevel, keyed.map((g) => [g.label, g.entries.map((e) => e.key)])]);
    if (shape !== this.#shape) {
      this.#shape = shape;
      root.replaceChildren(...this.#chrome(keyed.map((g) => ({ label: g.label, keys: g.entries.map((e) => e.key) }))));
    }
    if (focus && !root.contains(document.activeElement)) {
      const target = focus.sel === "input" ? this.#input : this.#cards.get(focus.key!)?.el.querySelector<HTMLElement>(focus.sel);
      target?.focus();
    }
    this.#layout();
    this.#applyFilter();
  }

  /** El buscador, las secciones y sus rejillas (con las tarjetas ya hechas). */
  #chrome(groups: { label: string | null; keys: string[] }[]): Node[] {
    const out: Node[] = [];
    const L = this.#labels;
    if (this.search) {
      const id = `${this.#uid}-q`;
      const hintId = `${this.#uid}-h`;
      this.#input ??= h("input", { type: "search", class: "nx-launcher__input", autocomplete: "off", spellcheck: "false", enterkeyhint: "go" });
      this.#input.id = id;
      this.#input.placeholder = L.placeholder;
      this.#input.setAttribute("aria-describedby", hintId);
      this.#input.value = this.#query;
      this.#input.oninput = () => {
        this.#query = this.#input!.value;
        this.#applyFilter();
      };
      this.#hint = h("p", { id: hintId, class: "nx-launcher__hint", "aria-live": "polite" });
      out.push(
        h("div", { class: "nx-launcher__search" }, h("label", { for: id, class: "nx-launcher__search-label" }, L.search), h("div", { class: "nx-launcher__field" }, glyph("search"), this.#input), this.#hint),
      );
    } else {
      this.#hint = undefined;
    }
    const nav = (this.#nav = h("nav", { class: "nx-launcher__nav", "aria-label": L.nav }));
    groups.forEach((g, gi) => {
      const hid = g.label ? `${this.#uid}-g${gi}` : null;
      const grid = h("ul", { class: "nx-launcher__grid", role: "list", "aria-labelledby": hid });
      for (const k of g.keys) grid.append(this.#cards.get(k)!.el);
      nav.append(h("section", { class: "nx-launcher__section" }, g.label ? h(`h${this.headingLevel}` as "h2", { id: hid, class: "nx-launcher__heading" }, g.label) : null, grid));
    });
    out.push(nav);
    return out;
  }

  #card(item: LauncherItem, key: string, base: string, fmt: ReturnType<typeof nxFormat>): HTMLLIElement {
    const L = this.#labels;
    const label = String(item.label ?? "");
    const descId = item.description ? `${base}-d` : null;
    const sigId = item.signal ? `${base}-s` : null;
    const href = safeHref(itemHref(item));
    const described = [descId, sigId].filter(Boolean).join(" ") || null;
    const text = h("span", { class: "nx-launcher__label" }, label);
    const link = href
      ? h("a", { class: "nx-launcher__link", href, "data-nx-open": "", "aria-describedby": described }, text)
      : h("button", { type: "button", class: "nx-launcher__link", "data-nx-open": "", "aria-describedby": described }, text);

    const views = (Array.isArray(item.views) ? item.views : []).filter((v) => v && typeof v === "object");
    const list = views.length
      ? h(
          "ul",
          { class: "nx-launcher__views", role: "list", "aria-label": fill(L.views, label) },
          ...views.map((v, i) => {
            const vHref = safeHref(v.href);
            const badge = formatBadge(v.badge);
            const content = [String(v.label ?? ""), v.hint ? h("span", { class: "nx-launcher__hint-text" }, String(v.hint)) : null, badge ? h("span", { class: "nx-launcher__badge" }, badge) : null];
            const attrs = { class: "nx-launcher__view", "data-nx-open": "", "data-nx-view": i };
            return h("li", null, vHref ? h("a", { ...attrs, href: vHref }, ...content) : h("button", { ...attrs, type: "button" }, ...content));
          }),
        )
      : null;

    const parts = item.featured ? progressParts(item.progress) : [];
    const el = h(
      "li",
      { class: `nx-launcher__card${item.featured ? " is-featured" : ""}${list ? " has-views" : ""}`, "data-key": key },
      h("div", { class: "nx-launcher__top" }, h("span", { class: "nx-launcher__icon" }, icon(item.icon, label)), glyph(ARROW, "nx-launcher__go")),
      item.featured && item.eyebrow ? h("p", { class: "nx-launcher__eyebrow" }, String(item.eyebrow)) : null,
      link,
      h("div", { class: "nx-launcher__swap" }, item.description ? h("p", { id: descId, class: "nx-launcher__desc" }, String(item.description)) : null, list),
      parts.length
        ? h(
            "div",
            { class: "nx-launcher__progress" },
            h("div", { class: "nx-launcher__bar", "aria-hidden": "true" }, ...parts.map((p, i) => h("i", { "data-part": Math.min(i, 2), style: `inline-size:${p.pct.toFixed(2)}%` }))),
            h("ul", { class: "nx-launcher__legend", role: "list" }, ...parts.map((p) => h("li", null, h("b", null, fmt.number(p.value)), ` ${p.label}`))),
          )
        : null,
    );
    const s = this.#signal(item.signal, fmt, sigId ?? "");
    if (s) el.append(s);
    return el;
  }

  #signal(sig: LauncherSignal | undefined, fmt: ReturnType<typeof nxFormat>, id: string): HTMLElement | null {
    if (!sig || typeof sig !== "object") return null;
    const value = typeof sig.value === "number" && Number.isFinite(sig.value) ? fmt.number(sig.value) : typeof sig.value === "string" ? sig.value : "";
    const meter = clampMeter(sig.meter);
    const spark = sparkPaths(sig.trend);
    if (!value && !sig.label && !sig.note && meter === null && !spark) return null;
    const tone = sig.tone === "success" || sig.tone === "warning" || sig.tone === "danger" ? sig.tone : null;
    const el = h(
      "div",
      { id: id || null, class: "nx-launcher__signal" },
      value ? h("b", { class: "nx-launcher__value" }, value) : null,
      sig.label ? h("span", { class: "nx-launcher__what" }, String(sig.label)) : null,
      sig.note ? h("span", { class: "nx-launcher__note", "data-tone": tone }, String(sig.note)) : null,
    );
    if (spark) {
      const svg = document.createElementNS(SVG, "svg");
      svg.setAttribute("class", "nx-launcher__trend");
      svg.setAttribute("viewBox", "0 0 100 22");
      svg.setAttribute("preserveAspectRatio", "none");
      svg.setAttribute("aria-hidden", "true");
      for (const [cls, d] of [["area", spark.area], ["line", spark.line]]) {
        const p = document.createElementNS(SVG, "path");
        p.setAttribute("class", `nx-launcher__trend-${cls}`);
        p.setAttribute("d", d);
        svg.append(p);
      }
      el.append(svg);
    }
    if (meter !== null) {
      // La barra se ve; el lector oye el porcentaje («71 %»), que también describe la tarjeta.
      const pct = percent(fmt.locale).format(meter / 100);
      el.append(h("span", { class: "nx-launcher__meter", "aria-hidden": "true" }, h("i", { style: `inline-size:${meter}%` })), h("span", { class: "nx-sr-only" }, pct));
    }
    return el;
  }

  /** Un dato que cambió se anuncia con un pulso breve (sin movimiento si se pidió menos movimiento). */
  #pulse(card: HTMLElement): void {
    if (reduced() || typeof card.animate !== "function") return;
    const ease = "cubic-bezier(0.2, 0.8, 0.2, 1)";
    card.querySelector(".nx-launcher__value")?.animate([{ transform: "translateY(-6px)", opacity: 0, color: "var(--nx-primary-ink)" }, { transform: "none", opacity: 1, color: "var(--nx-primary-ink)", offset: 0.5 }, {}], { duration: 900, easing: ease });
    card.animate([{ boxShadow: "0 0 0 0 var(--nx-primary-border)" }, { boxShadow: "0 0 0 6px transparent" }], { duration: 900, easing: "ease-out" });
  }

  /** Columnas: las que caben (o una menos, si deja menos huérfanas), iguales en todas las secciones. */
  #layout(): void {
    const nav = this.#nav;
    if (!nav) return;
    const grids = [...nav.querySelectorAll<HTMLElement>(".nx-launcher__grid")];
    const width = nav.clientWidth;
    if (!width || !grids.length) return;
    const css = getComputedStyle(this);
    const min = toPx(css.getPropertyValue("--_min"), parseFloat(css.fontSize)) || 240;
    const gap = parseFloat(getComputedStyle(grids[0]).columnGap) || 12;
    const sections = grids.map((g) => [...g.children].map((li) => this.#cards.get((li as HTMLElement).dataset.key!)?.item ?? {}));
    const cols = balanceColumns(sections, fitColumns(width, min, gap, this.columns));
    for (const g of grids) {
      if (g.dataset.cols === String(cols)) continue;
      g.dataset.cols = String(cols);
      g.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    }
  }

  // ---------------------------------------------------------------- buscador

  /** Apaga lo que no coincide (sin moverlo), enciende las vistas que sí y marca lo que abre `Enter`. */
  #applyFilter(): void {
    const q = this.#query;
    const ordered = [...(this.#nav?.querySelectorAll<HTMLElement>(".nx-launcher__card") ?? [])].map((el) => this.#cards.get(el.dataset.key!)).filter((c): c is Card => !!c);
    this.#target = this.search ? firstTarget(ordered.map((c) => c.item), q) : null;
    for (const c of ordered) {
      const m = q.trim() ? matchItem(c.item, q) : { own: true, views: [] };
      c.el.classList.toggle("is-dim", !m);
      c.el.classList.toggle("is-found", !!m && m.views.length > 0);
      c.el.classList.toggle("is-first", this.#target?.item === c.item);
      c.el.querySelectorAll<HTMLElement>(".nx-launcher__view").forEach((v, i) => v.classList.toggle("is-hit", !!m?.views.includes(i)));
    }
    if (this.#hint) {
      const t = this.#target;
      this.#hint.textContent = !q.trim() ? "" : t ? fill(this.#labels.open, t.view ? `${t.item.label} › ${t.view.label}` : String(t.item.label)) : this.#labels.empty;
    }
  }

  /** El enlace (o botón) que abre el objetivo del buscador. */
  #targetEl(): HTMLElement | null {
    const t = this.#target;
    if (!t) return null;
    const card = [...this.#cards.values()].find((c) => c.item === t.item);
    return card?.el.querySelector<HTMLElement>(t.view ? `[data-nx-view="${t.viewIndex}"]` : ".nx-launcher__link") ?? null;
  }

  // ---------------------------------------------------------------- transición

  /** Pone los nombres de View Transitions en la tarjeta (y los quita de la anterior). `hold` > 0: se limpian solos. */
  #mark(card: HTMLElement, hold: number): void {
    this.#clearMark();
    if (reduced()) return;
    const [c, i, l] = NAMES;
    card.style.viewTransitionName = c;
    const ic = card.querySelector<HTMLElement>(".nx-launcher__icon");
    const lb = card.querySelector<HTMLElement>(".nx-launcher__label");
    if (ic) ic.style.viewTransitionName = i;
    if (lb) lb.style.viewTransitionName = l;
    this.#marked = card;
    if (hold > 0) this.#unmark = window.setTimeout(() => this.#clearMark(), hold);
  }

  #clearMark(): void {
    clearTimeout(this.#unmark);
    const card = this.#marked;
    if (!card) return;
    this.#marked = null;
    for (const el of [card, card.querySelector<HTMLElement>(".nx-launcher__icon"), card.querySelector<HTMLElement>(".nx-launcher__label")]) {
      if (el) el.style.viewTransitionName = "";
    }
  }

  // ---------------------------------------------------------------- interacción

  #onClick = (e: MouseEvent): void => {
    const t = e.target as Element | null;
    const opener = t?.closest?.<HTMLElement>("[data-nx-open]");
    if (!opener || !this.contains(opener)) return;
    const cardEl = opener.closest<HTMLElement>(".nx-launcher__card");
    const card = cardEl ? this.#cards.get(cardEl.dataset.key!) : undefined;
    if (!card) return;
    // Un clic con modificador (abrir en otra pestaña) es del navegador: no se anuncia nada.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const vi = opener.dataset.nxView;
    const view = vi !== undefined ? (card.item.views?.[Number(vi)] ?? null) : null;
    const href = opener.getAttribute("href") ?? undefined;
    lastFrom = card.item.id;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ path: location.pathname, id: card.item.id }));
    } catch {
      /* sin almacenamiento: la vuelta no anima */
    }
    // Antes del evento: si la app anima con `startViewTransition` en su manejador, ya los encuentra.
    this.#mark(card.el, HOLD);
    const detail: LauncherSelectDetail = { item: card.item, view, href };
    if (!this.#emit("nx-launcher-select", detail, true)) e.preventDefault();
  };

  #onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (t === this.#input) {
      // Enter o las flechas que confirman una composición (IME: japonés, chino) son de la composición.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") {
        const el = this.#targetEl();
        if (el) {
          e.preventDefault();
          el.click();
        }
      } else if (e.key === "Escape" && this.#input.value) {
        e.preventDefault();
        this.query = "";
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        (this.#targetEl()?.closest(".nx-launcher__card")?.querySelector<HTMLElement>(".nx-launcher__link") ?? this.#nav?.querySelector<HTMLElement>(".nx-launcher__link"))?.focus();
      }
      return;
    }
    if (!t.classList?.contains("nx-launcher__link") || e.altKey || e.ctrlKey || e.metaKey) return;
    const links = [...(this.#nav?.querySelectorAll<HTMLElement>(".nx-launcher__link") ?? [])];
    const from = links.indexOf(t);
    const rects = links.map((l) => {
      const r = l.closest(".nx-launcher__card")!.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const to = moveIndex(rects, from, e.key);
    if (to === null) return;
    e.preventDefault();
    links[to]?.focus();
  };

  /** Con `search`, escribir con el foco en la página (o en una tarjeta) va al buscador. */
  #onTypeAhead = (e: KeyboardEvent): void => {
    const input = this.#input;
    if (!this.search || !input || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key.length !== 1 || e.key === " " || isField(e)) return;
    const active = document.activeElement;
    if (active && active !== document.body && !this.contains(active)) return;
    input.focus();
  };

  #onPointer = (e: PointerEvent): void => {
    const card = (e.target as Element | null)?.closest?.<HTMLElement>(".nx-launcher__card");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--nx-launcher-x", `${e.clientX - r.left}px`);
    card.style.setProperty("--nx-launcher-y", `${e.clientY - r.top}px`);
  };
}
