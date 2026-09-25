/**
 * `<nx-command>`: la paleta de comandos (⌘K / Ctrl+K). Una sola caja para ir a cualquier pantalla,
 * encontrar un registro, ejecutar una acción, y si nada de eso responde, preguntarle al asistente.
 *
 * Junta varias fuentes, todas JSON:
 * - `items`: entradas propias (acciones, pantallas, submenús);
 * - `menu="id"`: las pantallas de un `<nx-sidemenu>`, con su ruta como pista;
 * - `source="/url"`: registros del servidor mientras se escribe (`?q=`);
 * - `agent="id"`: lo que no se encuentra va a ese `<nx-agent>` como pregunta.
 *
 * Aprende: lo que la persona elige seguido sube, y sin escribir nada aparece en «Recientes» (se
 * recuerda en `localStorage`, solo en ese navegador). Los enlaces son `<a href>` de verdad: el
 * router de la app los intercepta y ⌘/Ctrl + Enter o el clic central abren otra pestaña.
 *
 * El elemento es la capa superior (Popover API): `<button popovertarget="id">` lo abre sin JS.
 */
import { Base } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph, icon } from "../../core/icons";
import { listKeyStep } from "../../core/keys";
import { matchRanges } from "../select/logic";
import type { MenuItem } from "../sidemenu/types";
import { cleanItems, flattenMenu, groupItems, itemKey, matchesHotkey, recentItems, recordUse, searchCommands } from "./logic";
import type { CommandItem, CommandLabels, CommandUsage } from "./types";

export const COMMAND_LABELS: CommandLabels = {
  dialog: "Paleta de comandos",
  placeholder: "Busca una pantalla, un registro o una acción…",
  empty: "Sin resultados",
  loading: "Buscando…",
  error: "No se pudo buscar en el servidor",
  recent: "Recientes",
  navigate: "Ir a",
  commands: "Comandos",
  records: "Registros",
  ask: "Preguntarle al asistente",
  back: "Volver",
  keyMove: "navegar",
  keyOpen: "abrir",
  keyTab: "nueva pestaña",
  keyClose: "cerrar",
};

const SPARK = '<path d="M9.94 14.06 5 19"/><path d="m14 4 1.27 3.73L19 9l-3.73 1.27L14 14l-1.27-3.73L9 9l3.73-1.27Z"/>';
const RECENT = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>';
const PROPS = ["items", "menu", "source", "agent", "hotkey", "placeholder", "storage", "limit", "labels"] as const;
const DEBOUNCE_MS = 200;

type Row = { kind: "item"; item: CommandItem; recent?: boolean } | { kind: "ask" };

let uid = 0;
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export class NxCommand extends Base {
  static observedAttributes = ["items", "labels", "placeholder", "hotkey"];

  #uid = `nx-cmd${++uid}`;
  #items: CommandItem[] = [];
  #labels: CommandLabels = COMMAND_LABELS;
  #usage: CommandUsage | null = null;
  #built = false;
  #open = false;
  #query = "";
  /** Submenús abiertos (el último es el que se ve). */
  #pages: CommandItem[] = [];
  #rows: Row[] = [];
  #hl = -1;
  #remote: CommandItem[] = [];
  #loading = false;
  #failed = false;
  #timer = 0;
  #abort?: AbortController;
  #lastPointer: { x: number; y: number } | null = null;
  #returnTo: HTMLElement | null = null;
  #onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || !matchesHotkey(e, this.hotkey)) return;
    e.preventDefault();
    if (this.#open) this.hide();
    else this.show();
  };
  // Nodos.
  #crumbs?: HTMLSpanElement;
  #input?: HTMLInputElement;
  #spin?: HTMLSpanElement;
  #list?: HTMLDivElement;
  #foot?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** Entradas propias: acciones, pantallas y submenús. */
  get items(): CommandItem[] {
    return this.#items;
  }
  set items(v: CommandItem[] | null | undefined) {
    this.#items = cleanItems(v);
    if (this.#open) this.#refresh(false);
  }
  /** Id de un `<nx-sidemenu>`: sus pantallas entran en la paleta (se leen al abrir). */
  get menu(): string | null {
    return this.getAttribute("menu");
  }
  set menu(v: string | null) {
    this.#attr("menu", v);
  }
  /** Búsqueda en el servidor: `GET source?q=…` → un arreglo de entradas (o `{items}`). */
  get source(): string | null {
    return this.getAttribute("source");
  }
  set source(v: string | null) {
    this.#attr("source", v);
  }
  /** Id de un `<nx-agent>`: lo que se escribe se le puede preguntar. */
  get agent(): string | null {
    return this.getAttribute("agent");
  }
  set agent(v: string | null) {
    this.#attr("agent", v);
  }
  /** Atajo global (`"mod+k"` por defecto; `mod` es ⌘ o Ctrl). `"none"` lo quita. */
  get hotkey(): string {
    return this.getAttribute("hotkey") || "mod+k";
  }
  set hotkey(v: string) {
    this.#attr("hotkey", v);
  }
  get placeholder(): string {
    return this.getAttribute("placeholder") ?? this.#labels.placeholder;
  }
  set placeholder(v: string) {
    this.#attr("placeholder", v);
  }
  /** Clave de `localStorage` para lo reciente (`"nx-command"`); `"none"`: solo mientras dura la página. */
  get storage(): string {
    return this.getAttribute("storage") || "nx-command";
  }
  set storage(v: string) {
    this.#attr("storage", v);
    this.#usage = null;
  }
  /** Máximo de filas a la vista (50). */
  get limit(): number {
    const n = Number(this.getAttribute("limit"));
    return Number.isFinite(n) && n > 0 ? n : 50;
  }
  set limit(v: number) {
    this.#attr("limit", String(v));
  }
  get labels(): CommandLabels {
    return this.#labels;
  }
  set labels(v: Partial<CommandLabels> | null | undefined) {
    this.#labels = { ...COMMAND_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }
  get open(): boolean {
    return this.#open;
  }
  /** Lo que está escrito. */
  get query(): string {
    return this.#query;
  }

  /** Abre la paleta; con `query`, ya escrita. */
  show(query = ""): void {
    if (!this.#built) this.#build();
    this.#query = query;
    if (this.#open) {
      this.#input!.value = query;
      this.#refresh(true);
      return;
    }
    this.showPopover?.();
    // En el acto, no al llegar `toggle` (que es asíncrono): lo que se teclea justo después de ⌘K
    // tiene que caer en la caja, no en lo que tenía el foco antes.
    if (this.#open) this.#input!.focus({ preventScroll: true });
  }
  hide(): void {
    if (this.#open) this.hidePopover?.();
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
    this.#paint();
    document.addEventListener("keydown", this.#onKey);
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.#onKey);
    this.#abort?.abort();
    clearTimeout(this.#timer);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "items" || name === "labels") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-command] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #build(): void {
    this.#built = true;
    if (!this.hasAttribute("popover")) this.setAttribute("popover", "auto");
    this.setAttribute("role", "dialog");
    this.setAttribute("aria-modal", "true");
    const listId = `${this.#uid}-list`;
    this.#crumbs = h("span", { class: "nx-command__crumbs" });
    this.#input = h("input", {
      type: "text",
      class: "nx-command__input",
      role: "combobox",
      "aria-expanded": "true",
      "aria-controls": listId,
      "aria-autocomplete": "list",
      autocomplete: "off",
      spellcheck: "false",
      enterkeyhint: "go",
      // La Popover API enfoca lo que tenga `autofocus` al mostrarse, también desde un
      // `popovertarget`: lo que se escribe enseguida no se pierde.
      autofocus: true,
    });
    this.#spin = h("span", { class: "nx-spinner nx-command__spin", hidden: true });
    this.#list = h("div", { id: listId, class: "nx-command__list", role: "listbox" });
    this.#foot = h("footer", { class: "nx-command__foot", "aria-hidden": "true" });
    this.append(h("div", { class: "nx-command__bar" }, glyph("search", "nx-command__search"), this.#crumbs, this.#input, this.#spin), this.#list, this.#foot);

    this.addEventListener("beforetoggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      if (open === this.#open) return;
      this.#open = open;
      if (open) {
        const a = document.activeElement;
        this.#returnTo = a instanceof HTMLElement && a !== document.body && !this.contains(a) ? a : null;
        this.#pages = [];
        this.#input!.value = this.#query;
        this.#refresh(true);
      } else {
        this.#abort?.abort();
        clearTimeout(this.#timer);
        this.#loading = false;
        this.#query = "";
      }
      this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open }, bubbles: true, composed: true }));
    });
    this.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState === "open") {
        this.#input!.focus({ preventScroll: true });
        const at = this.#input!.value.length;
        this.#input!.setSelectionRange(at, at);
      } else if (!this.#open) {
        // El foco vuelve a donde estaba, salvo que la persona ya se haya ido a otra parte.
        const a = document.activeElement;
        if (this.#returnTo?.isConnected && (!a || a === document.body || this.contains(a))) this.#returnTo.focus({ preventScroll: true });
        this.#returnTo = null;
      }
    });

    this.#input.addEventListener("input", () => {
      this.#query = this.#input!.value;
      this.#refresh(false);
    });
    this.#input.addEventListener("keydown", (e) => this.#key(e));
    this.#crumbs.addEventListener("click", () => this.#back());

    // Clic en una fila sin robarle el foco al buscador.
    this.#list.addEventListener("mousedown", (e) => e.preventDefault());
    this.#list.addEventListener("click", (e) => {
      const el = (e.target as Element).closest<HTMLElement>('[role="option"]');
      if (!el) return;
      const mouse = e as MouseEvent;
      if (!this.#choose(Number(el.dataset.i), mouse.ctrlKey || mouse.metaKey)) e.preventDefault();
    });
    this.#list.addEventListener("mousemove", (e) => {
      const moved = this.#lastPointer !== null && (this.#lastPointer.x !== e.clientX || this.#lastPointer.y !== e.clientY);
      this.#lastPointer = { x: e.clientX, y: e.clientY };
      const el = (e.target as Element).closest<HTMLElement>('[role="option"]');
      if (moved && el) this.#highlight(Number(el.dataset.i), false);
    });
  }

  #key(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === "Escape") {
      // Se atiende aquí (y no se deja al navegador): primero se sale del submenú.
      e.preventDefault();
      e.stopPropagation();
      if (this.#pages.length) this.#back();
      else this.hide();
      return;
    }
    if (e.key === "Backspace" && !this.#input!.value && this.#pages.length) {
      e.preventDefault();
      this.#back();
      return;
    }
    if (e.key === "Tab") {
      // Un solo campo: el foco no se escapa de la paleta (ni un diálogo abierto debajo se lo lleva).
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (e.key === "Home" || e.key === "End") return;
    const step = listKeyStep(e.key, this.#hl, this.#rows.length);
    if (step === null || step === "close") return;
    e.preventDefault();
    if (step !== "select") return this.#highlight(step, true);
    const row = this.#rows[this.#hl];
    const el = this.#list!.querySelector<HTMLElement>(`[data-i="${this.#hl}"]`);
    const href = row?.kind === "item" ? safeHref(row.item.href) : undefined;
    if (href && mod && el?.tagName === "A") {
      if (this.#choose(this.#hl, true)) window.open(href, "_blank", "noopener");
    } else if (el?.tagName === "A") el.click(); // el enlace navega como si se hubiera pulsado
    else this.#choose(this.#hl, false);
  }

  /**
   * Elegir una fila. Devuelve `true` si el enlace debe seguir su curso (navegar). Una pregunta va al
   * asistente, un submenú se abre, y lo demás avisa con `nx-command-select` (cancelable: la paleta
   * se queda abierta y no navega).
   */
  #choose(i: number, newTab: boolean): boolean {
    const row = this.#rows[i];
    if (!row) return false;
    const q = this.#query.trim();
    if (row.kind === "ask") {
      const ok = this.dispatchEvent(new CustomEvent("nx-command-ask", { detail: { query: q }, bubbles: true, composed: true, cancelable: true }));
      this.hide();
      if (ok) {
        const agent = this.agent ? (document.getElementById(this.agent) as (HTMLElement & { send?: (t: string) => void }) | null) : null;
        agent?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        agent?.send?.(q);
      }
      return false;
    }
    const item = row.item;
    if (item.disabled) return false;
    const ok = this.dispatchEvent(new CustomEvent("nx-command-select", { detail: { item, query: q, newTab }, bubbles: true, composed: true, cancelable: true }));
    if (!ok) return false;
    this.#remember(item);
    if (item.children?.length && !newTab) {
      this.#pages.push(item);
      this.#query = "";
      this.#input!.value = "";
      this.#refresh(true);
      return false;
    }
    this.hide();
    return !!item.href;
  }

  #back(): void {
    if (!this.#pages.pop()) return;
    this.#query = "";
    this.#input!.value = "";
    this.#refresh(true);
    this.#input!.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- lo reciente

  #usageMap(): CommandUsage {
    if (this.#usage) return this.#usage;
    this.#usage = {};
    if (this.storage !== "none") {
      try {
        const raw = JSON.parse(localStorage.getItem(this.storage) ?? "{}") as unknown;
        if (raw && typeof raw === "object") {
          for (const [k, u] of Object.entries(raw as Record<string, { n?: unknown; t?: unknown; item?: unknown }>)) {
            if (u && typeof u.n === "number" && typeof u.t === "number" && u.item && typeof u.item === "object") this.#usage[k] = { n: u.n, t: u.t, item: u.item as CommandItem };
          }
        }
      } catch {
        /* sin almacenamiento, o dañado: se empieza de cero */
      }
    }
    return this.#usage;
  }

  #remember(item: CommandItem): void {
    // Los submenús cuentan por la entrada que se eligió al final, no por el camino.
    this.#usage = recordUse(this.#usageMap(), this.#pages.length ? { ...item, hint: this.#pages.map((p) => p.label).join(" › ") } : item, Date.now());
    if (this.storage === "none") return;
    try {
      localStorage.setItem(this.storage, JSON.stringify(this.#usage));
    } catch {
      /* lleno o bloqueado: se recuerda solo en esta página */
    }
  }

  /** Olvida lo reciente. */
  clearHistory(): void {
    this.#usage = {};
    try {
      if (this.storage !== "none") localStorage.removeItem(this.storage);
    } catch {
      /* nada que hacer */
    }
    if (this.#open) this.#refresh(true);
  }

  // ---------------------------------------------------------------- resultados

  /** Todo lo que se puede buscar en el nivel actual. */
  #pool(): CommandItem[] {
    const page = this.#pages[this.#pages.length - 1];
    if (page) return page.children ?? [];
    const menu = this.menu ? (document.getElementById(this.menu) as (HTMLElement & { items?: MenuItem[] }) | null) : null;
    const nav = Array.isArray(menu?.items) ? flattenMenu(menu.items, this.#labels.navigate) : [];
    return [...this.#items, ...nav];
  }

  /** Recalcula las filas; con `source`, pide al servidor (con espera entre teclas). */
  #refresh(immediate: boolean): void {
    const src = this.source;
    const q = this.#query.trim();
    this.#abort?.abort();
    clearTimeout(this.#timer);
    this.#failed = false;
    this.#loading = !!(src && q.length >= 2 && !this.#pages.length);
    // Mientras llega la respuesta, lo anterior del servidor se queda (atenuado) en vez de parpadear.
    if (!this.#loading) this.#remote = [];
    this.#render();
    if (this.#loading) this.#timer = window.setTimeout(() => void this.#fetch(src!, q), immediate ? 0 : DEBOUNCE_MS);
  }

  async #fetch(src: string, q: string): Promise<void> {
    const ctrl = (this.#abort = new AbortController());
    try {
      const url = new URL(src, location.href);
      url.searchParams.set("q", q);
      const res = await fetch(url, { signal: ctrl.signal, credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as unknown;
      this.#remote = cleanItems(Array.isArray(data) ? data : (data as { items?: unknown })?.items);
    } catch {
      if (ctrl.signal.aborted) return;
      this.#failed = true;
    }
    this.#loading = false;
    this.#render();
  }

  #render(): void {
    const L = this.#labels;
    const q = this.#query.trim();
    const pool = this.#pool();
    const atRoot = !this.#pages.length;
    const sections: { group: string; rows: Row[]; icon?: string }[] = [];
    let budget = this.limit;
    const take = (items: CommandItem[], recent = false): Row[] => {
      const rows = items.slice(0, Math.max(0, budget)).map((item): Row => ({ kind: "item", item, recent }));
      budget -= rows.length;
      return rows;
    };

    if (!q) {
      const recent = atRoot ? recentItems(this.#usageMap(), pool) : [];
      const seen = new Set(recent.map(itemKey));
      if (recent.length) sections.push({ group: L.recent, rows: take(recent, true), icon: RECENT });
      for (const g of groupItems(pool.filter((i) => !seen.has(itemKey(i))), L.commands)) sections.push({ group: g.group, rows: take(g.items) });
    } else {
      const ranked = searchCommands(pool, q, this.#usageMap()).map((r) => r.item);
      const seen = new Set(ranked.map(itemKey));
      for (const g of groupItems(ranked, L.commands)) sections.push({ group: g.group, rows: take(g.items) });
      // Lo del servidor va después, en su orden (ya viene ordenado), sin repetir lo que ya está.
      const remote = this.#remote.filter((i) => !seen.has(itemKey(i)));
      for (const g of groupItems(remote, L.records)) sections.push({ group: g.group, rows: take(g.items) });
      if (atRoot && this.agent) sections.push({ group: "", rows: [{ kind: "ask" }] });
    }

    this.#rows = sections.flatMap((s) => s.rows);
    this.#hl = this.#rows.length ? 0 : -1;
    const list = this.#list!;
    list.classList.toggle("nx-command__list--stale", this.#loading);
    this.#spin!.hidden = !this.#loading;
    let i = 0;
    list.replaceChildren(
      ...sections
        .filter((s) => s.rows.length)
        .map((s, gi) => {
          const hid = `${this.#uid}-g${gi}`;
          return h(
            "div",
            { class: "nx-command__group", role: "group", "aria-labelledby": s.group ? hid : null },
            s.group ? h("div", { class: "nx-command__group-h", id: hid }, s.icon ? glyph(s.icon) : null, s.group) : null,
            ...s.rows.map((r) => this.#row(r, i++, q)),
          );
        }),
    );
    const onlyAsk = this.#rows.length === 1 && this.#rows[0].kind === "ask";
    if (!this.#rows.length || onlyAsk) {
      const msg = this.#loading ? L.loading : this.#failed ? L.error : L.empty;
      list.prepend(h("p", { class: "nx-command__empty" }, msg));
    } else if (this.#failed) list.append(h("p", { class: "nx-command__empty" }, L.error));
    this.#highlight(this.#hl, false);
    this.#paintCrumbs();
  }

  #row(r: Row, i: number, q: string): HTMLElement {
    const attrs = { id: `${this.#uid}-o${i}`, class: "nx-command__opt", role: "option", "data-i": i, "aria-selected": "false" };
    if (r.kind === "ask") {
      return h("div", { ...attrs, class: "nx-command__opt nx-command__opt--ask" }, glyph(SPARK, "nx-command__icon"), h("span", { class: "nx-command__text" }, h("span", { class: "nx-command__label" }, `${this.#labels.ask}: `, h("q", null, q))));
    }
    const it = r.item;
    const href = safeHref(it.href);
    const body = [
      it.icon ? icon(it.icon, it.label) : h("span", { class: "nx-icon nx-command__blank", "aria-hidden": "true" }),
      h("span", { class: "nx-command__text" }, h("span", { class: "nx-command__label" }, this.#marked(it.label, q)), it.hint ? h("span", { class: "nx-command__hint" }, this.#marked(it.hint, q)) : null),
      it.shortcut ? h("kbd", { class: "nx-command__kbd" }, it.shortcut) : null,
      it.children?.length ? glyph("chevron", "nx-command__more") : null,
    ];
    const a = { ...attrs, "aria-disabled": it.disabled ? "true" : null };
    return href && !it.children?.length && !it.disabled ? h("a", { ...a, href, tabindex: "-1" }, ...body) : h("div", a, ...body);
  }

  /** Un texto con lo que coincide en `<mark>` (siempre como nodos de texto). */
  #marked(text: string, q: string): DocumentFragment | string {
    const ranges = q ? matchRanges(text, q) : [];
    if (!ranges.length) return text;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const [a, b] of ranges) {
      if (a > at) frag.append(text.slice(at, a));
      frag.append(h("mark", null, text.slice(a, b)));
      at = b;
    }
    if (at < text.length) frag.append(text.slice(at));
    return frag;
  }

  #highlight(i: number, scroll: boolean): void {
    const list = this.#list!;
    list.querySelector('[aria-selected="true"]')?.setAttribute("aria-selected", "false");
    this.#hl = i;
    const el = list.querySelector<HTMLElement>(`[data-i="${i}"]`);
    if (el) {
      el.setAttribute("aria-selected", "true");
      this.#input!.setAttribute("aria-activedescendant", el.id);
      if (scroll) el.scrollIntoView({ block: "nearest" });
    } else this.#input!.removeAttribute("aria-activedescendant");
  }

  #paintCrumbs(): void {
    const c = this.#crumbs!;
    c.hidden = !this.#pages.length;
    c.replaceChildren(...this.#pages.map((p) => h("span", { class: "nx-command__crumb" }, p.label)));
    c.title = this.#labels.back;
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    this.setAttribute("aria-label", L.dialog);
    this.#input!.placeholder = this.placeholder;
    this.#input!.setAttribute("aria-label", this.placeholder);
    const mod = isMac() ? "⌘" : "Ctrl";
    const k = (key: string, text: string) => h("span", null, h("kbd", null, key), ` ${text}`);
    this.#foot!.replaceChildren(k("↑↓", L.keyMove), k("↵", L.keyOpen), k(`${mod} ↵`, L.keyTab), k("esc", L.keyClose));
  }
}
