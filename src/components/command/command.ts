/**
 * `<nx-command>`: la paleta de comandos (⌘K / Ctrl+K). Una sola caja para ir a cualquier pantalla,
 * encontrar un registro, ejecutar una acción, y si nada de eso responde, preguntarle al asistente.
 *
 * Junta varias fuentes, todas JSON:
 * - `items`: entradas propias (acciones, pantallas, submenús);
 * - `menu="id"`: las pantallas de un `<nx-sidemenu>`, con su ruta como pista;
 * - `account="id"`: las acciones de un `<nx-account>` (tema, paleta, empresa, idioma, salir…);
 * - `source="/url"`: registros del servidor mientras se escribe (`?q=`);
 * - `agent="id"`: lo que no se encuentra va a ese `<nx-agent>` como pregunta.
 *
 * Aprende: lo que la persona elige seguido sube, y sin escribir nada aparece en «Recientes» (se
 * recuerda en `localStorage`, solo en ese navegador). Los enlaces son `<a href>` de verdad: el
 * router de la app los intercepta y ⌘/Ctrl + Enter o el clic central abren otra pestaña.
 *
 * El elemento es la capa superior (Popover API): `<button popovertarget="id">` lo abre sin JS.
 */
import { Base, upgrade } from "../../core/define";
import { h, safeEndpoint, safeHref } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { glyph, icon } from "../../core/icons";
import { listKeyStep } from "../../core/keys";
import { matchRanges } from "../select/logic";
import type { MenuItem } from "../sidemenu/types";
import { cleanItems, flattenItems, flattenMenu, groupItems, hotkeyHasModifier, itemKey, matchesHotkey, parseUsage, recentItems, recordUse, searchCommands } from "./logic";
import type { CommandItem, CommandLabels, CommandUsage } from "./types";

export const COMMAND_LABELS: CommandLabels = {
  dialog: "Paleta de comandos",
  placeholder: "Busca una pantalla, un registro o una acción…",
  empty: "Sin resultados",
  loading: "Buscando…",
  error: "No se pudo buscar en el servidor",
  results: "1 resultado|{n} resultados",
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
const DEBOUNCE_MS = 200;
/** Espera antes de anunciar cuántos resultados hay: no se lee una cifra por tecla. */
const ANNOUNCE_MS = 450;

type Row = { kind: "item"; item: CommandItem; recent?: boolean } | { kind: "ask" };
/** La identidad de una fila, para conservar el resaltado cuando la lista se rehace. */
const rowKey = (r: Row | undefined): string | null => (!r ? null : r.kind === "ask" ? "\0ask" : itemKey(r.item));

let uid = 0;
const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
/** ¿Se está escribiendo en un campo? Se mira el origen real del evento (`composedPath`): un campo dentro
 *  del shadow DOM de otra librería llega reapuntado a su host. */
const typing = (e: Event) => {
  const t = e.composedPath?.()[0] ?? e.target;
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
};

export class NxCommand extends Base {
  static observedAttributes = ["items", "labels", "placeholder", "hotkey", "storage", "account"];

  #uid = `nx-cmd${++uid}`;
  #items: CommandItem[] = [];
  #labels: CommandLabels = COMMAND_LABELS;
  #usage: CommandUsage | null = null;
  /** `items` con sus submenús aplanados (para «Recientes»); se rehace al cambiar `items`. */
  #flat: CommandItem[] | null = null;
  /** Las acciones de la cuenta, leídas al abrir (la cuenta las arma de nuevo en cada lectura). */
  #acc: CommandItem[] | null = null;
  /** Las pantallas del menú, aplanadas al abrir (o si cambia su arreglo) y no en cada tecla: así las
   *  entradas son las mismas y su texto sin tildes se reutiliza. */
  #nav: { src: readonly MenuItem[]; group: string; items: CommandItem[] } | null = null;
  /** Las filas pintadas, por entrada: si siguen en la lista se actualizan en su lugar. */
  #nodes = new Map<CommandItem | "ask", HTMLElement>();
  #seq = 0;
  #sayTimer = 0;
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
    // Un atajo sin modificador («/») es una letra más mientras se escribe en un campo, también en la
    // caja de la propia paleta («15/09»): ahí solo abre, no cierra.
    if (!hotkeyHasModifier(this.hotkey) && typing(e)) return;
    e.preventDefault();
    if (this.#open) this.hide();
    else this.show();
  };
  // Nodos.
  #crumbs?: HTMLSpanElement;
  #input?: HTMLInputElement;
  #spin?: HTMLSpanElement;
  #list?: HTMLDivElement;
  /** «Sin resultados», «Buscando…» o el error: fuera del listbox (que solo lleva opciones). */
  #msg?: HTMLParagraphElement;
  /** Región viva (oculta): cuántos resultados hay, o el mensaje. */
  #status?: HTMLParagraphElement;
  #foot?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** Entradas propias: acciones, pantallas y submenús. */
  get items(): CommandItem[] {
    return this.#items;
  }
  set items(v: CommandItem[] | null | undefined) {
    this.#items = cleanItems(v);
    this.#flat = null;
    // Lo del servidor no depende de `items`: no se vuelve a pedir, y el resaltado se queda donde estaba.
    if (this.#open) this.#render(true);
  }
  /** Id de un `<nx-sidemenu>`: sus pantallas entran en la paleta (se leen al abrir). */
  get menu(): string | null {
    return this.getAttribute("menu");
  }
  set menu(v: string | null) {
    this.#attr("menu", v);
  }
  /** Id de un `<nx-account>`: sus acciones (`commands`) entran en la paleta (se leen al abrir). Las
   *  ejecuta la propia cuenta al oír `nx-command-select`. */
  get account(): string | null {
    return this.getAttribute("account");
  }
  set account(v: string | null) {
    this.#attr("account", v);
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
  /**
   * Clave de `localStorage` para lo reciente (`"nx-command"`); `"none"`: solo mientras dura la
   * página. En un equipo compartido, que incluya al usuario (`"nx-command:ana"`): lo reciente de uno
   * no debe verlo otro. Se guarda solo `{id, label, href, icon, group}`.
   */
  get storage(): string {
    return this.getAttribute("storage") || "nx-command";
  }
  set storage(v: string) {
    this.#attr("storage", v);
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
    this.#labels = mergeLabels(COMMAND_LABELS, v);
    this.#paint();
    // Los títulos de grupo («Recientes», «Comandos», «Ir a») también son textos.
    if (this.#open) this.#render(true);
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
    upgrade(this);
    if (!this.#built) this.#build();
    this.#paint();
    document.addEventListener("keydown", this.#onKey);
  }

  disconnectedCallback(): void {
    document.removeEventListener("keydown", this.#onKey);
    this.#abort?.abort();
    clearTimeout(this.#timer);
    clearTimeout(this.#sayTimer);
    if (this.#open) {
      // Sacado del DOM abierto (un layout que lo mueve, un portal): el navegador oculta el popover sin
      // `beforetoggle`. Si `#open` siguiera en `true`, ni el atajo ni `show()` lo volverían a abrir.
      this.#open = false;
      this.#loading = false;
      this.#query = "";
      this.#pages = [];
      this.#returnTo = null;
      this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open: false }, bubbles: true, composed: true }));
    }
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "storage" || name === "account") {
      // Otra clave es otro usuario: lo reciente del anterior no se muestra ni se copia a la nueva. Otra
      // cuenta, otras acciones.
      if (name === "storage") this.#usage = null;
      else this.#acc = null;
      if (this.#open) this.#render(true);
      return;
    }
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
    // La miga del submenú: un clic vuelve (desde el teclado, Escape o Backspace). La caja la tiene
    // como descripción, así el lector sabe en qué submenú está.
    this.#crumbs = h("span", { id: `${this.#uid}-crumbs`, class: "nx-command__crumbs", role: "button" });
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
    this.#msg = h("p", { class: "nx-command__empty", hidden: true });
    this.#status = h("p", { class: "nx-sr-only", role: "status", "aria-live": "polite" });
    this.#foot = h("footer", { class: "nx-command__foot", "aria-hidden": "true" });
    this.append(h("div", { class: "nx-command__bar" }, glyph("search", "nx-command__search"), this.#crumbs, this.#input, this.#spin), this.#msg, this.#list, this.#status, this.#foot);

    this.addEventListener("beforetoggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      if (open === this.#open) return;
      this.#open = open;
      if (open) {
        const a = document.activeElement;
        this.#returnTo = a instanceof HTMLElement && a !== document.body && !this.contains(a) ? a : null;
        this.#pages = [];
        this.#acc = null;
        this.#nav = null;
        this.#input!.value = this.#query;
        this.#refresh(true);
      } else {
        this.#abort?.abort();
        clearTimeout(this.#timer);
        clearTimeout(this.#sayTimer);
        this.#status!.textContent = "";
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

    // Clic en una fila (o en el mensaje) sin robarle el foco al buscador.
    this.#list.addEventListener("mousedown", (e) => e.preventDefault());
    this.#msg.addEventListener("mousedown", (e) => e.preventDefault());
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
    // Enter o las flechas que confirman una composición (IME: japonés, chino) son de la composición.
    if (e.isComposing || e.keyCode === 229) return;
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
    this.#usage = parseUsage(null);
    if (this.storage !== "none") {
      try {
        this.#usage = parseUsage(JSON.parse(localStorage.getItem(this.storage) ?? "{}"));
      } catch {
        /* sin almacenamiento, o dañado: se empieza de cero */
      }
    }
    return this.#usage;
  }

  #remember(item: CommandItem): void {
    // Un registro del servidor (`source`) no se anota: es un dato de negocio (un cliente, una
    // factura) que no debe quedar en el navegador, y no volvería a aparecer en «Recientes».
    if (this.#remote.includes(item)) return;
    this.#usage = recordUse(this.#usageMap(), item, Date.now());
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
    if (this.#open) this.#render(true);
  }

  // ---------------------------------------------------------------- resultados

  /** Todo lo que se puede buscar en el nivel actual. */
  #pool(): CommandItem[] {
    const page = this.#pages[this.#pages.length - 1];
    if (page) return page.children ?? [];
    // Las mismas entradas en cada tecla (no copias nuevas): el texto sin tildes se calcula una vez.
    const menu = this.menu ? (document.getElementById(this.menu) as (HTMLElement & { items?: MenuItem[] }) | null) : null;
    let nav: CommandItem[] = [];
    if (Array.isArray(menu?.items)) {
      const group = this.#labels.navigate;
      const n = this.#nav;
      if (!n || n.src !== menu.items || n.group !== group) this.#nav = { src: menu.items, group, items: flattenMenu(menu.items, group) };
      nav = this.#nav!.items;
    }
    if (!this.#acc) {
      const acc = this.account ? (document.getElementById(this.account) as (HTMLElement & { commands?: unknown }) | null) : null;
      this.#acc = cleanItems(acc?.commands);
    }
    return [...this.#items, ...this.#acc, ...nav];
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
      const safe = safeEndpoint(src);
      if (!safe) throw new Error("source");
      const url = new URL(safe, location.href);
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
    // La persona pudo haber bajado mientras llegaba la respuesta: Enter abre lo que ella resaltó.
    this.#render(true);
  }

  /**
   * Pinta las filas. Con `keep` (la misma consulta: llegó el servidor, cambiaron `items` o los
   * textos), el resaltado sigue en la misma entrada si sigue en la lista; si no, va a la primera y la
   * lista vuelve arriba.
   */
  #render(keep = false): void {
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
      // Lo reciente, solo si sigue en la paleta (también dentro de un submenú de `items`).
      const recent = atRoot ? recentItems(this.#usageMap(), [...(this.#flat ??= flattenItems(this.#items)), ...pool.slice(this.#items.length)]) : [];
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

    const was = keep ? rowKey(this.#rows[this.#hl]) : null;
    this.#rows = sections.flatMap((s) => s.rows);
    const at = was === null ? -1 : this.#rows.findIndex((r) => rowKey(r) === was);
    this.#hl = at >= 0 ? at : this.#rows.length ? 0 : -1;
    const list = this.#list!;
    list.classList.toggle("nx-command__list--stale", this.#loading);
    this.#spin!.hidden = !this.#loading;
    // Las filas que siguen se actualizan en su lugar (sin volver a clonar íconos); las demás se crean.
    const prev = this.#nodes;
    const next = new Map<CommandItem | "ask", HTMLElement>();
    let i = 0;
    const node = (r: Row): HTMLElement => {
      const k = r.kind === "ask" ? "ask" : r.item;
      const old = next.has(k) ? undefined : prev.get(k);
      const el = old ? this.#update(old, r, i, q) : this.#row(r, i, q);
      i++;
      next.set(k, el);
      return el;
    };
    list.replaceChildren(
      ...sections
        .filter((s) => s.rows.length)
        .map((s, gi) => {
          const hid = `${this.#uid}-g${gi}`;
          return h(
            "div",
            { class: "nx-command__group", role: "group", "aria-labelledby": s.group ? hid : null },
            s.group ? h("div", { class: "nx-command__group-h", id: hid }, s.icon ? glyph(s.icon) : null, s.group) : null,
            ...s.rows.map(node),
          );
        }),
    );
    this.#nodes = next;
    // El listbox solo lleva opciones: sin ninguna se oculta y el mensaje va afuera.
    list.hidden = !this.#rows.length;
    if (this.#loading) list.setAttribute("aria-busy", "true");
    else list.removeAttribute("aria-busy");
    this.#input!.setAttribute("aria-expanded", String(!!this.#rows.length));
    const count = this.#rows.filter((r) => r.kind === "item").length;
    const msg = !count ? (this.#loading ? L.loading : this.#failed ? L.error : L.empty) : this.#failed ? L.error : "";
    this.#msg!.textContent = msg;
    this.#msg!.hidden = !msg;
    if (!keep) list.scrollTop = 0;
    this.#highlight(this.#hl, keep);
    this.#paintCrumbs();
    this.#announce(count ? [(L.results.split("|")[count === 1 ? 0 : 1] ?? L.results).replace("{n}", String(count)), this.#failed ? L.error : ""].filter(Boolean).join(". ") : msg);
  }

  /** Cuántos resultados hay (o el mensaje), en la región viva, cuando se deja de escribir. */
  #announce(text: string): void {
    clearTimeout(this.#sayTimer);
    const say = this.#query.trim() ? text : "";
    this.#sayTimer = window.setTimeout(() => {
      if (this.#open) this.#status!.textContent = say;
    }, ANNOUNCE_MS);
  }

  /** Una fila que ya estaba: su posición, su resaltado y lo que coincide con la nueva consulta. */
  #update(el: HTMLElement, r: Row, i: number, q: string): HTMLElement {
    el.dataset.i = String(i);
    el.setAttribute("aria-selected", "false");
    const label = el.querySelector(".nx-command__label")!;
    if (r.kind === "ask") label.replaceChildren(`${this.#labels.ask}: `, h("q", null, q));
    else {
      label.replaceChildren(this.#marked(r.item.label, q));
      if (r.item.hint) el.querySelector(".nx-command__hint")?.replaceChildren(this.#marked(r.item.hint, q));
    }
    return el;
  }

  #row(r: Row, i: number, q: string): HTMLElement {
    // El id es de la fila, no de la posición: si la primera opción pasa a ser otra, `aria-activedescendant` cambia.
    const attrs = { id: `${this.#uid}-o${++this.#seq}`, class: "nx-command__opt", role: "option", "data-i": i, "aria-selected": "false" };
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
    const path = this.#pages.map((p) => p.label);
    c.hidden = !path.length;
    c.replaceChildren(...path.map((label) => h("span", { class: "nx-command__crumb" }, label)));
    c.title = this.#labels.back;
    c.setAttribute("aria-label", `${this.#labels.back}: ${path.join(" › ")}`);
    if (path.length) this.#input!.setAttribute("aria-describedby", c.id);
    else this.#input!.removeAttribute("aria-describedby");
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
