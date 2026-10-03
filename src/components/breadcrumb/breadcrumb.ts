/**
 * `<nx-breadcrumb>`: la ruta hasta la página actual, con un atajo: cada separador `›` se abre con
 * los hermanos del nivel siguiente (de Laura a Andrés sin volver a la lista).
 *
 * Los niveles son los hijos del autor (`<a href>` y un `<span>` al final) o `items` (BDUI). Los
 * hijos no se mueven, la hidratación de Solid sigue intacta: el componente agrega su `<nav>` al
 * final y el CSS esconde los originales. Sin JavaScript se ven como una ruta de enlaces.
 *
 * - **Separadores:** se abren si el nivel tiene `children` con alternativas, o si se pueden pedir
 *   (`expandable: true` o `children-endpoint`): al abrir se emite `nx-breadcrumb-expand`, donde la
 *   app puede responder; si no, se piden a `children-endpoint`. Se guardan por camino. Más de 7
 *   traen buscador (sin tildes).
 * - **Colapso:** si no cabe, los niveles del medio pasan a un «…» que se abre como menú; el primero
 *   y los dos últimos se quedan. Por debajo de 480 px queda solo «‹ Padre».
 * - **Navegar:** `nx-breadcrumb-navigate` es cancelable (routers SPA); si nadie lo cancela, manda el
 *   `href`. `Alt+↑` sube un nivel (en la ruta visible de más abajo de la página).
 */
import { Base, upgrade } from "../../core/define";
import { h, safeEndpoint, safeHref } from "../../core/dom";
import { glyph, hasIcon, icon } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import type { BreadcrumbMenu } from "./breadcrumb-menu";
import { cleanItems, collapseCount, itemKey } from "./logic";
import type { BreadcrumbExpandDetail, BreadcrumbItem, BreadcrumbLabels, BreadcrumbNavigateDetail, BreadcrumbVia } from "./types";

export const BREADCRUMB_LABELS: BreadcrumbLabels = {
  label: "Ruta",
  siblings: "Otros en {label}",
  more: "Niveles ocultos ({n})",
  hidden: "Niveles ocultos",
  search: "Buscar en {label}…",
  empty: "Sin resultados",
  loading: "Cargando…",
  error: "No se pudo cargar",
  back: "Volver a {label}",
};

const LEFT = '<path d="m15 18-6-6 6-6"/>';
const MORE = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
const COMPACT = 480;
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

const visible = (el: Element) => (el.checkVisibility ? el.checkVisibility() : el.isConnected);

export class NxBreadcrumb extends Base {
  static observedAttributes = ["items", "label", "labels", "children-endpoint"];

  #items: BreadcrumbItem[] | null = null;
  #labels: BreadcrumbLabels = BREADCRUMB_LABELS;
  /** Los hijos pedidos, por camino hasta el nivel (dos «General» en ramas distintas no se mezclan). */
  #cache = new Map<string, BreadcrumbItem[]>();
  /** Sube al cambiar `children-endpoint`: una respuesta que llega de antes ya no se guarda. */
  #gen = 0;
  #nav?: HTMLElement;
  #list?: HTMLOListElement;
  #back: HTMLElement | null = null;
  #menu?: HTMLDivElement;
  #mo?: MutationObserver;
  #ro?: ResizeObserver;
  #queued = false;
  #path: BreadcrumbItem[] = [];
  #keys: string[] = [];
  #hidden = 0;
  #width = -1;
  #m: BreadcrumbMenu | null = null;

  // ---------------------------------------------------------------- propiedades

  /** La ruta (BDUI). Sin ella, sale de los hijos. El atributo acepta el mismo arreglo como JSON. */
  get items(): BreadcrumbItem[] | null {
    return this.#items;
  }
  set items(v: BreadcrumbItem[] | null | undefined) {
    this.#items = Array.isArray(v) ? cleanItems(v) : null;
    this.#queue();
  }

  /**
   * URL que da los hijos de un nivel al abrir su separador: `GET`, responde `[{label, href?, …}]`.
   * `{id}` es la clave del nivel (`id`, o `href`, o `label`) y `{level}` su número; sin `{id}`, la
   * clave va como `?id=`. Del mismo origen (o de `allowOrigins`). Con ella, todo separador sin
   * `children` se abre (salvo `expandable: false`). Asignarla, aunque sea la misma, vacía lo guardado.
   */
  get childrenEndpoint(): string | null {
    return this.getAttribute("children-endpoint");
  }
  set childrenEndpoint(v: string | null | undefined) {
    if (v) this.setAttribute("children-endpoint", v);
    else if (this.hasAttribute("children-endpoint")) this.removeAttribute("children-endpoint");
    else this.#forget();
  }

  /** Nombre de la ruta para el lector de pantalla. */
  get label(): string | null {
    return this.getAttribute("label");
  }
  set label(v: string | null | undefined) {
    if (v == null) this.removeAttribute("label");
    else this.setAttribute("label", v);
  }

  get labels(): BreadcrumbLabels {
    return this.#labels;
  }
  set labels(v: Partial<BreadcrumbLabels> | null | undefined) {
    this.#labels = mergeLabels(BREADCRUMB_LABELS, v);
    this.#queue();
  }

  /** La ruta pintada (de `items` o de los hijos). */
  get path(): BreadcrumbItem[] {
    return this.#path;
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#nav) this.#build();
    this.#mo?.observe(this, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["href", "data-icon", "data-id", "data-expandable"] });
    this.#ro?.observe(this);
    document.addEventListener("keydown", this.#onKey);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => this.#paint(), { once: true });
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#mo?.disconnect();
    this.#ro?.disconnect();
    document.removeEventListener("keydown", this.#onKey);
    // Un popover que sale del DOM se oculta sin avisar: el estado vuelve a cerrado.
    this.#close(false);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "children-endpoint") this.#forget();
    if (name === "items" || name === "labels") {
      // Quitar el atributo vuelve a los hijos del autor, o a los textos de fábrica.
      if (value === null) {
        if (name === "items") this.items = null;
        else this.labels = null;
        return;
      }
      try {
        const parsed = JSON.parse(value);
        if (name === "items") this.items = parsed;
        else this.labels = parsed;
      } catch {
        console.warn(`[nx-breadcrumb] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    this.#queue();
  }

  // ---------------------------------------------------------------- interno

  #build(): void {
    this.#list = h("ol", { class: "nx-breadcrumb__list" });
    this.#nav = h("nav", { class: "nx-breadcrumb__nav" }, this.#list);
    this.#menu = h("div", { class: "nx-breadcrumb__menu", popover: "manual", hidden: true });
    this.append(this.#nav, this.#menu);
    this.setAttribute("data-ready", "");

    this.#nav.addEventListener("click", (e) => {
      const t = e.target as Element;
      const sep = t.closest<HTMLElement>("[data-sep], .nx-breadcrumb__more");
      if (sep) return void this.#openMenu(sep);
      const link = t.closest<HTMLElement>("[data-i]");
      if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
      const i = +link.dataset.i!;
      if (!this.#go(this.#path[i], i, link === this.#back ? "back" : "link")) e.preventDefault();
    });

    if (typeof MutationObserver !== "undefined")
      this.#mo = new MutationObserver((records) => {
        // Solo los hijos del autor: lo que pinta el componente no cuenta.
        if (records.some((r) => !this.#nav!.contains(r.target) && !this.#menu!.contains(r.target) && !(r.type === "childList" && r.target === this && [...r.addedNodes, ...r.removedNodes].every((n) => n === this.#nav || n === this.#menu)))) this.#queue();
      });
    if (typeof ResizeObserver !== "undefined")
      this.#ro = new ResizeObserver(() => {
        const w = this.clientWidth;
        if (w === this.#width) return;
        this.#width = w;
        this.#close(false);
        this.#fit();
      });
  }

  #queue(): void {
    if (this.#queued || !this.isConnected) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#paint();
    });
  }

  /** Los niveles escritos como hijos: `<a href>` (o cualquier elemento) con su texto. */
  #fromChildren(): BreadcrumbItem[] {
    const out: BreadcrumbItem[] = [];
    for (const el of this.children) {
      if (el === this.#nav || el === this.#menu || /^(TEMPLATE|SCRIPT|STYLE)$/.test(el.tagName)) continue;
      const d = (el as HTMLElement).dataset;
      const expandable = d.expandable === "false" ? false : d.expandable === "true" ? true : undefined;
      out.push({ label: el.textContent?.trim() ?? "", id: d.id, href: el.getAttribute("href") ?? undefined, icon: d.icon, expandable });
    }
    return cleanItems(out);
  }

  #paint(): void {
    if (!this.#list || !this.isConnected) return;
    this.#close(false);
    const L = this.#labels;
    const path = this.#items ?? this.#fromChildren();
    const keys = path.map(itemKey);
    const had = this.#keys.length > 0;
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.#nav!.contains(active) ? active.dataset.k : undefined;
    this.#path = path;
    this.#nav!.setAttribute("aria-label", this.label || L.label);

    const n = path.length;
    const lis = path.map((it, i) => {
      const last = i === n - 1;
      const ico = it.icon && hasIcon(it.icon) ? icon(it.icon) : null;
      const text = h("span", { class: "nx-breadcrumb__text" }, it.label);
      const href = safeHref(it.href);
      const name = last
        ? h("span", { class: "nx-breadcrumb__current", "aria-current": "page" }, ico, text)
        : href
          ? h("a", { class: "nx-breadcrumb__link", href, "data-i": i, "data-k": `l${i}` }, ico, text)
          : h("button", { type: "button", class: "nx-breadcrumb__link", "data-i": i, "data-k": `l${i}` }, ico, text);
      const fresh = had && this.#keys[i] !== keys[i];
      return h("li", { class: `nx-breadcrumb__item${last ? " is-last" : ""}${fresh ? " is-new" : ""}` }, name, last ? null : this.#sep(it, i));
    });
    const more = h("li", { class: "nx-breadcrumb__item is-more", hidden: true }, h("button", { type: "button", class: "nx-breadcrumb__more", "aria-haspopup": "menu", "aria-expanded": "false", "data-k": "m" }, glyph(MORE)));
    if (n > 3) lis.splice(1, 0, more);
    this.#list.replaceChildren(...lis);
    this.#keys = keys;

    // «‹ Padre», para lo angosto (el CSS lo muestra solo ahí).
    const parent = path[n - 2];
    this.#back?.remove();
    this.#back = null;
    if (parent) {
      const href = safeHref(parent.href);
      const attrs = { class: "nx-breadcrumb__back", "data-i": n - 2, "data-k": "b", "aria-label": L.back.replace("{label}", parent.label) };
      const content = [glyph(LEFT), h("span", { class: "nx-breadcrumb__text" }, parent.label)];
      this.#back = href ? h("a", { ...attrs, href }, ...content) : h("button", { ...attrs, type: "button" }, ...content);
      this.#nav!.append(this.#back);
    }
    this.#fit();
    if (focusKey) this.#nav!.querySelector<HTMLElement>(`[data-k="${focusKey}"]`)?.focus();
  }

  #sep(it: BreadcrumbItem, i: number): HTMLElement {
    const kids = it.children;
    const next = this.#path[i + 1];
    const can = it.expandable !== false && (kids ? kids.length > 1 || (kids.length === 1 && (!next || itemKey(kids[0]) !== itemKey(next))) : it.expandable === true || !!this.childrenEndpoint);
    if (!can) return h("span", { class: "nx-breadcrumb__sep", "aria-hidden": "true" }, glyph("chevron"));
    const b = h("button", { type: "button", class: "nx-breadcrumb__sep", "data-sep": i, "data-k": `s${i}`, "aria-haspopup": "menu", "aria-expanded": "false" }, glyph("chevron"));
    b.setAttribute("aria-label", this.#labels.siblings.replace("{label}", it.label));
    return b;
  }

  /** Esconde los niveles del medio que no caben (o pasa a «‹ Padre» en lo angosto). */
  #fit(): void {
    const list = this.#list;
    if (!list) return;
    const w = this.clientWidth;
    this.#width = w;
    const compact = w > 0 && w < COMPACT && this.#path.length > 1;
    this.#nav!.toggleAttribute("data-compact", compact);
    const lis = [...list.children] as HTMLElement[];
    const more = lis.find((li) => li.classList.contains("is-more"));
    const items = lis.filter((li) => li !== more);
    let k = 0;
    if (more && w > 0 && !compact) {
      for (const li of items) {
        li.hidden = false;
        li.classList.remove("is-tail");
      }
      list.classList.add("is-measuring");
      more.hidden = false;
      const mw = more.getBoundingClientRect().width;
      more.hidden = true;
      const iw = items.map((li) => li.getBoundingClientRect().width);
      const nw = items.map((li) => li.firstElementChild!.getBoundingClientRect().width);
      k = collapseCount(iw, nw, mw, list.clientWidth);
      list.classList.remove("is-measuring");
    }
    this.#hidden = k;
    items.forEach((li, i) => {
      li.hidden = i >= 1 && i < k;
      li.classList.toggle("is-tail", k > 0 && i === k);
    });
    if (more) {
      more.hidden = k === 0;
      more.firstElementChild!.setAttribute("aria-label", this.#labels.more.replace("{n}", String(k)));
    }
    // Los nombres cortados muestran el completo al pasar el ratón.
    for (const t of this.#nav!.querySelectorAll<HTMLElement>(".nx-breadcrumb__text")) {
      const host = t.parentElement!;
      if (t.scrollWidth > t.clientWidth) host.title = t.textContent ?? "";
      else host.removeAttribute("title");
    }
  }

  /** Avisa y dice si sigue (nadie canceló). Para `Alt+↑`, también manda el `href`. */
  #go(item: BreadcrumbItem | undefined, level: number, via: BreadcrumbVia): boolean {
    if (!item) return false;
    const detail: BreadcrumbNavigateDetail = { item, level, via };
    return this.dispatchEvent(new CustomEvent("nx-breadcrumb-navigate", { detail, bubbles: true, composed: true, cancelable: true }));
  }

  // ---------------------------------------------------------------- menú

  /** El menú de un separador (sus hijos) o del «…» (los niveles escondidos). Llega con `import()`. */
  async #openMenu(trigger: HTMLElement): Promise<void> {
    let Menu: typeof BreadcrumbMenu;
    try {
      ({ BreadcrumbMenu: Menu } = await import("./breadcrumb-menu"));
    } catch (err) {
      // Sin el menú (un despliegue nuevo borró el archivo, o se cayó la red) el separador no abre
      // nada, pero tampoco deja una promesa rechazada sin atender. El próximo clic lo reintenta.
      console.warn("[nx-breadcrumb] no se pudo cargar el menú", err);
      return;
    }
    const m = (this.#m ??= new Menu(this.#menu!, { labels: () => this.#labels, go: (it, level, via) => this.#go(it, level, via) }));
    if (!trigger.isConnected) return;
    const sep = trigger.dataset.sep;
    if (sep === undefined) return m.toggle({ trigger, name: this.#labels.hidden, level: 1, indent: true, current: null, items: this.#path.slice(1, 1 + this.#hidden) });
    const level = +sep;
    const parent = this.#path[level];
    const next = this.#path[level + 1];
    // Por el camino hasta el nivel, no solo su clave: dos «General» sin id ni href, en ramas
    // distintas, no comparten hijos.
    const key = this.#keys.slice(0, level + 1).join("\u0000");
    const known = parent.children ?? this.#cache.get(key);
    const gen = this.#gen;
    return m.toggle({
      trigger,
      name: parent.label,
      level: level + 1,
      indent: false,
      current: next ? itemKey(next) : null,
      items:
        known ??
        (async () => {
          const got = await this.#children(parent, level);
          const kids = cleanItems(got ?? [], false);
          // Se guarda si alguien respondió y `children-endpoint` sigue siendo el que se usó.
          if (got !== null && gen === this.#gen) {
            if (this.#cache.size > 50) this.#cache.delete(this.#cache.keys().next().value!);
            this.#cache.set(key, kids);
          }
          return kids;
        }),
    });
  }

  /**
   * Los hijos de un nivel: los da la app (`nx-breadcrumb-expand`, ya o tras `preventDefault()`)
   * o `children-endpoint`. `null` si no hay quién (se ve «Sin resultados» y no se guarda).
   */
  #children(item: BreadcrumbItem, level: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let answered = false;
      const respond = (v: BreadcrumbItem[] | Promise<BreadcrumbItem[]>) => {
        if (answered) return;
        answered = true;
        Promise.resolve(v).then(resolve, reject);
      };
      const detail: BreadcrumbExpandDetail = { item, level, respond };
      const free = this.dispatchEvent(new CustomEvent("nx-breadcrumb-expand", { detail, bubbles: true, composed: true, cancelable: true }));
      if (answered || !free) return;
      const tpl = this.childrenEndpoint;
      if (!tpl) return resolve(null);
      const id = encodeURIComponent(itemKey(item));
      const base = tpl.replaceAll("{level}", String(level));
      // Del mismo origen (o de `allowOrigins`): la ruta del usuario no viaja a un tercero.
      const url = safeEndpoint(base.includes("{id}") ? base.replaceAll("{id}", id) : `${base}${base.includes("?") ? "&" : "?"}id=${id}`);
      if (!url) return reject(new Error("children-endpoint bloqueado"));
      fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then(resolve, reject);
    });
  }

  /** Olvida los hijos pedidos (cambió de dónde salen). */
  #forget(): void {
    this.#cache.clear();
    this.#gen++;
    this.#queue();
  }

  #close(refocus: boolean): void {
    this.#m?.close(refocus);
  }

  /** `Alt+↑` sube un nivel, en la ruta visible de más abajo de la página (la de un diálogo abierto). */
  #onKey = (e: KeyboardEvent): void => {
    if (!e.altKey || e.key !== "ArrowUp" || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
    if ((e.target as Element | null)?.closest?.(EDITABLE)) return;
    const n = this.#path.length;
    if (n < 2) return;
    const shown = [...document.querySelectorAll("nx-breadcrumb")].filter(visible);
    if (shown[shown.length - 1] !== this) return;
    e.preventDefault();
    const parent = this.#path[n - 2];
    const href = safeHref(parent.href);
    if (this.#go(parent, n - 2, "key") && href) location.assign(href);
  };
}
