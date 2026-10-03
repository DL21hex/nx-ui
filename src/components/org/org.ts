/**
 * `<nx-org>`: el organigrama con dos lentes sobre los mismos datos.
 *
 * - **Yo:** una persona en el centro (por defecto, quien mira) con lo que tiene alrededor: su
 *   cadena hacia arriba en una línea, su jefe, quienes comparten jefe y su equipo directo. Para
 *   quien mira, «Para… / Acudes a…»: a quién acude para cada cosa. Si el centro es otra persona,
 *   el camino entre las dos: «Tu jefe común con Ana es Marta Ríos».
 * - **Organización:** el árbol de unidades, cada una con quien la dirige, su gente y el tono de su
 *   rama. Arriba en fila (con ramas); debajo de cada una, sus subunidades colgando de un riel, que
 *   se pliegan y despliegan. El camino hasta quien mira llega abierto y marcado. Al abrir una
 *   unidad, su gente con las ramas de «Yo»: el líder, cada jefe con su equipo y los directos.
 *   Una sola cifra a la vez (vacantes, ingresos…) se ve en cada unidad.
 *
 * Los datos son JSON (BDUI): `units`, `people` y `me`. Para una organización grande, `source`
 * entrega por partes (POST): las personas de una unidad, el entorno de una persona o una búsqueda.
 * Lo que el servidor no deja abrir llega con `locked` y se ve sin poder centrarse en ello.
 *
 * Light DOM: los textos del backend van siempre como texto; los estilos, en `org.css`.
 */
import { Base, attrProps, boolAttr, upgrade } from "../../core/define";
import { h, safeEndpoint, safeHref, safeImageSrc, reducedMotion as reduced } from "../../core/dom";
import { glyph, initials } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import {
  buildIndex,
  byName,
  chainOf,
  cleanPerson,
  cleanUnit,
  commonBoss,
  directCount,
  matchPerson,
  metricLevels,
  peersOf,
  reportsOf,
  teamSize,
  unitCount,
  unitLine,
  unitPath,
  type OrgIndex,
} from "./logic";
import type { OrgContact, OrgLabels, OrgMetric, OrgPage, OrgPerson, OrgRequest, OrgUnit, OrgView } from "./types";

export const ORG_LABELS: OrgLabels = {
  me: "Yo",
  map: "Organización",
  views: "Vista",
  search: "Buscar persona o unidad",
  placeholder: "Buscar…",
  you: "Tú",
  people: "{n} personas",
  peopleOne: "1 persona",
  boss: "Jefe",
  chain: "Cadena de mando",
  peers: "Comparten jefe",
  reports: "Equipo directo",
  teamOf: "Equipo de {name}",
  noBoss: "Sin jefe asignado",
  contactsFor: "Para…",
  contactsWho: "Acudes a…",
  more: "+{n}",
  subunits: "{n} subunidades",
  subunitOne: "1 subunidad",
  fold: "Plegar",
  direct: "Directos con {name}",
  span: "{n} a cargo",
  spanTotal: "{n} en total",
  peopleIn: "Personas en {name}",
  showMore: "Ver más",
  common: "Tu jefe común con {name} es {boss}",
  above: "{name} está en tu cadena de mando",
  below: "{name} hace parte de tu equipo",
  sameBoss: "Tú y {name} tienen el mismo jefe",
  levels: "{n} niveles arriba de ti",
  levelOne: "un nivel arriba de ti",
  noPath: "No hay una línea de mando conocida entre tú y {name}",
  seeMap: "Ver en la organización",
  seeMe: "Volver a mí",
  metric: "Color",
  noMetric: "Personas",
  loading: "Cargando…",
  error: "No se pudo cargar.",
  retry: "Reintentar",
  empty: "No hay nada que mostrar.",
  noResults: "Nada coincide con «{q}».",
  focusChanged: "Mostrando {name}",
  close: "Cerrar",
  open: "Abrir ficha",
  email: "Correo",
  phone: "Teléfono",
};

/** Subunidades visibles debajo de una unidad, y personas en cada pila, antes de «+n». */
const STACK = 12;
const PILE = 8;
/** Tarjetas de personas antes de «Ver más». */
const PAGE = 48;
/** Compañeros visibles antes del «+n». */
const PEERS = 8;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/** Ancho mínimo de una tarjeta del equipo (con el espacio entre ellas): decide las columnas del árbol. */
const CARD = 226;
/** Tonos de las ramas del árbol (oklch), en orden de tamaño: bien separados entre vecinos. */
const BRANCH = [255, 160, 40, 320, 200, 95, 10, 285, 130, 65];

let uid = 0;

const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
/** Un tono estable por persona: el mismo `id`, el mismo color en cada vista. */
const hueOf = (key: string) => {
  let x = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) x = Math.imul(x ^ key.charCodeAt(i), 16777619);
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) % 360;
};

export class NxOrg extends Base {
  static {
    attrProps(this, ["source", "metric"]);
  }
  declare source: string | null;
  declare metric: string | null;
  static observedAttributes = ["units", "people", "contacts", "metrics", "labels", "me", "view", "source", "metric", "searchable", "locale"];

  #units: OrgUnit[] = [];
  #given: OrgPerson[] = [];
  /** Lo que llegó de `source`, encima de `people`. */
  #fetched = new Map<string, OrgPerson>();
  #fetchedUnits = new Map<string, OrgUnit>();
  #contacts: OrgContact[] = [];
  #metrics: OrgMetric[] = [];
  #labels: OrgLabels = ORG_LABELS;
  #ix: OrgIndex | null = null;

  #view: OrgView = "me";
  #viewSet = false;
  #center: string | null = null;
  /** La unidad abierta en «Organización» (su gente), o `null`: el árbol. */
  #unit: string | null = null;
  /** Lo que se abrió o plegó a mano en el árbol; lo demás sigue la regla (ver `#isOpen`). */
  #opened = new Set<string>();
  #folded = new Set<string>();
  /** Listas que se ven completas: subunidades (`u:id`) y pilas de personas (`p:id`). */
  #full = new Set<string>();
  /** Al volver al árbol, la unidad que se enfoca. */
  #reveal: string | null = null;
  #page = PAGE;
  #peersOpen = false;

  #loaded = new Set<string>();
  #pending = new Map<string, Promise<void>>();
  #failed = new Set<string>();

  #query = "";
  #results: { id: string; label: string; meta: string; pick: () => void }[] = [];
  #active = -1;
  #qGen = 0;
  #qTimer = 0;

  #uid = `nx-org${++uid}`;
  #abort?: AbortController;
  #ro?: ResizeObserver;
  #queued = false;
  #dir = 0;
  #w = 0;
  /** Número de cada persona para su `view-transition-name` (los `id` pueden no ser identificadores CSS). */
  #vt = new Map<string, number>();

  #root?: HTMLDivElement;
  #bar?: HTMLDivElement;
  #input?: HTMLInputElement;
  #list?: HTMLUListElement;
  #crumbs?: HTMLElement;
  #stage?: HTMLDivElement;
  #live?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** Las unidades `{id, name, parent?, kind?, count?, direct?, leader?, metrics?}`. Sin unidades, solo la lente «Yo». */
  get units(): OrgUnit[] {
    return this.#units;
  }
  set units(value: OrgUnit[] | null | undefined) {
    this.#units = Array.isArray(value) ? (value.map(cleanUnit).filter(Boolean) as OrgUnit[]) : [];
    this.#changed();
  }

  /** Las personas `{id, name, title?, unit?, boss?, avatar?, href?, reports?, team?, locked?}`. */
  get people(): OrgPerson[] {
    return this.#given;
  }
  set people(value: OrgPerson[] | null | undefined) {
    this.#given = Array.isArray(value) ? (value.map(cleanPerson).filter(Boolean) as OrgPerson[]) : [];
    this.#changed();
  }

  /** «Para… / Acudes a…» de quien mira: `[{label, person?, text?, href?}]`. */
  get contacts(): OrgContact[] {
    return this.#contacts;
  }
  set contacts(value: OrgContact[] | null | undefined) {
    this.#contacts = Array.isArray(value) ? value.filter((c) => c && typeof c.label === "string" && c.label) : [];
    this.#schedule();
  }

  /** Las cifras que pueden verse en cada unidad: `[{key, label, tone?, per?}]`. */
  get metrics(): OrgMetric[] {
    return this.#metrics;
  }
  set metrics(value: OrgMetric[] | null | undefined) {
    this.#metrics = Array.isArray(value) ? value.filter((m) => m && typeof m.key === "string" && typeof m.label === "string") : [];
    this.#bar = undefined;
    this.#schedule();
  }

  get labels(): OrgLabels {
    return this.#labels;
  }
  set labels(value: Partial<OrgLabels> | null | undefined) {
    this.#labels = mergeLabels(ORG_LABELS, value);
    this.#bar = undefined;
    this.#schedule();
  }

  /** El `id` de la persona que mira: el centro de «Yo» y el «Tú» de «Organización». */
  get me(): string | null {
    return this.getAttribute("me");
  }
  set me(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === "") this.removeAttribute("me");
    else this.setAttribute("me", String(value));
  }

  /** `me` o `map`. Por defecto, `me` si hay `me`; si no, `map`. */
  get view(): OrgView {
    return this.#currentView();
  }
  set view(value: OrgView | null | undefined) {
    if (value === "me" || value === "map") this.setAttribute("view", value);
    else this.removeAttribute("view");
  }

  /** Muestra el buscador (con `source`, busca en el servidor). */
  get searchable(): boolean {
    return boolAttr(this, "searchable");
  }
  set searchable(value: boolean | null | undefined) {
    this.toggleAttribute("searchable", !!value);
  }

  get locale(): string | null {
    return this.getAttribute("locale");
  }
  set locale(value: string | null | undefined) {
    if (value) this.setAttribute("locale", value);
    else this.removeAttribute("locale");
  }

  /** La persona en el centro de «Yo». */
  get center(): string | null {
    return this.#center ?? this.me;
  }

  /** Centra «Yo» en una persona (la carga de `source` si hace falta). */
  focusPerson(id: string | number | null): void {
    this.#goPerson(id === null ? null : String(id), 1);
  }

  /** Abre una unidad en «Organización» (`null`: el árbol entero). */
  focusUnit(id: string | number | null): void {
    this.#openUnit(id === null ? null : String(id), 1);
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#root) {
      this.#root = h("div", { class: "nx-org__root" });
      this.#crumbs = h("nav", { class: "nx-org__crumbs" });
      this.#stage = h("div", { class: "nx-org__stage" });
      this.#live = h("p", { class: "nx-org__live", "aria-live": "polite" });
    }
    if (this.#root.parentNode !== this) this.append(this.#root);
    this.#abort?.abort();
    const signal = (this.#abort = new AbortController()).signal;
    this.addEventListener("click", this.#onClick, { signal });
    this.addEventListener("keydown", this.#onKey, { signal });
    this.addEventListener("input", this.#onInput, { signal });
    this.addEventListener("change", this.#onChange, { signal });
    this.addEventListener("focusout", this.#onFocusOut, { signal });
    if (typeof ResizeObserver === "function") {
      this.#ro = new ResizeObserver(() => {
        const w = this.#stage?.clientWidth ?? 0;
        if (Math.abs(w - this.#w) > 24) this.#schedule();
      });
      this.#ro.observe(this);
    }
    if (this.center) void this.#ensurePerson(this.center);
    this.#render();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#ro?.disconnect();
    clearTimeout(this.#qTimer);
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === "units" || name === "people" || name === "contacts" || name === "metrics" || name === "labels") {
      if (value === null) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(value);
      } catch {
        console.warn(`[nx-org] el atributo "${name}" no es JSON válido`);
        return;
      }
      (this as unknown as Record<string, unknown>)[name] = parsed;
      return;
    }
    if (name === "view") {
      this.#viewSet = value === "me" || value === "map";
      if (this.#viewSet) this.#view = value as OrgView;
    }
    if (name === "me" && old !== value) {
      this.#center = null;
      if (value && this.isConnected) void this.#ensurePerson(value);
    }
    // La cifra no rehace la barra: el selector conservaría el foco perdido.
    if (name === "searchable") this.#bar = undefined;
    this.#schedule();
  }

  // ---------------------------------------------------------------- datos

  #changed(): void {
    this.#ix = null;
    this.#schedule();
  }

  #index(): OrgIndex {
    if (!this.#ix) {
      const people = new Map<string, OrgPerson>();
      for (const p of this.#given) people.set(p.id, p);
      for (const p of this.#fetched.values()) people.set(p.id, { ...people.get(p.id), ...p });
      const units = new Map<string, OrgUnit>();
      for (const u of this.#units) units.set(u.id, u);
      for (const u of this.#fetchedUnits.values()) units.set(u.id, { ...units.get(u.id), ...u });
      this.#ix = buildIndex([...units.values()], [...people.values()]);
    }
    return this.#ix;
  }

  #url(): string | undefined {
    return this.source ? safeEndpoint(this.source) : undefined;
  }

  async #request(body: OrgRequest): Promise<OrgPage | null> {
    const url = this.#url();
    if (!url) return null;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as OrgPage;
    return data && typeof data === "object" ? data : null;
  }

  #merge(page: OrgPage | null): void {
    if (!page) return;
    for (const p of Array.isArray(page.people) ? page.people : []) {
      const c = cleanPerson(p);
      if (c) this.#fetched.set(c.id, c);
    }
    for (const u of Array.isArray(page.units) ? page.units : []) {
      const c = cleanUnit(u);
      if (c) this.#fetchedUnits.set(c.id, c);
    }
    this.#ix = null;
  }

  /** Pide una vez lo que falta (`key`: «p:id» o «u:id»); si no hay `source`, no hace nada. */
  #ensure(key: string, body: OrgRequest): Promise<void> {
    if (!this.#url() || this.#loaded.has(key)) return Promise.resolve();
    const running = this.#pending.get(key);
    if (running) return running;
    this.#failed.delete(key);
    const job = this.#request(body)
      .then((page) => {
        this.#merge(page);
        this.#loaded.add(key);
      })
      .catch(() => {
        this.#failed.add(key);
      })
      .finally(() => {
        this.#pending.delete(key);
        this.#schedule();
      });
    this.#pending.set(key, job);
    this.#schedule();
    return job;
  }

  #ensurePerson(id: string): Promise<void> {
    if (this.#hasNeighborhood(id)) this.#loaded.add(`p:${id}`);
    return this.#ensure(`p:${id}`, { person: id });
  }

  #ensureUnit(id: string): Promise<void> {
    const ix = this.#index();
    const u = ix.units.get(id);
    const have = ix.members.get(id)?.length ?? 0;
    // Cuántas tiene: `direct`, o `count` si no tiene subunidades.
    const need = typeof u?.direct === "number" ? u.direct : u && !ix.childUnits.get(id)?.length && typeof u.count === "number" ? u.count : null;
    if (need !== null && have >= need) this.#loaded.add(`u:${id}`);
    return this.#ensure(`u:${id}`, { unit: id });
  }

  /** Si ya está todo lo de su entorno: la cadena hasta arriba, y su equipo y el de su jefe completos
   *  según `reports`. Así lo que el servidor manda de arranque no se vuelve a pedir. */
  #hasNeighborhood(id: string): boolean {
    const ix = this.#index();
    const p = ix.people.get(id);
    if (!p) return false;
    const top = chainOf(ix, id).at(-1) ?? p;
    if (top.boss) return false;
    const full = (q: OrgPerson | undefined) => !q || typeof q.reports !== "number" || (ix.reports.get(q.id)?.length ?? 0) >= q.reports;
    return full(p) && full(p.boss ? ix.people.get(p.boss) : undefined);
  }

  // ---------------------------------------------------------------- estado

  #currentView(): OrgView {
    const hasMap = this.#index().units.size > 0;
    const hasMe = !!this.me || !!this.#center;
    if (this.#viewSet && this.#view === "map" && hasMap) return "map";
    if (this.#viewSet && this.#view === "me" && hasMe) return "me";
    return hasMe || !hasMap ? "me" : "map";
  }

  #setView(view: OrgView): void {
    this.#view = view;
    this.#viewSet = true;
    if (this.getAttribute("view") !== view) this.setAttribute("view", view);
    else this.#schedule();
    this.#emitFocus();
  }

  #emitFocus(): void {
    const view = this.#currentView();
    const id = view === "me" ? this.center : this.#unit;
    this.dispatchEvent(new CustomEvent("nx-org-focus", { detail: { view, id }, bubbles: true, composed: true }));
  }

  #announce(name: string): void {
    if (this.#live && name) this.#live.textContent = fill(this.#labels.focusChanged, { name });
  }

  #goPerson(id: string | null, dir: number): void {
    const target = id && id !== this.me ? id : null;
    this.#morph(() => {
      this.#center = target;
      this.#peersOpen = false;
      this.#dir = dir;
      this.#closeResults();
      const who = target ?? this.me;
      if (who) void this.#ensurePerson(who);
      this.#setView("me");
    });
    const who = target ?? this.me;
    const p = who ? this.#index().people.get(who) : undefined;
    if (p) this.#announce(p.name);
  }

  /**
   * Cambia de persona con View Transitions: cada tarjeta que está antes y después viaja a su nuevo
   * lugar (la pulsada sube al centro, el centro pasa a jefe o a compañero). Sin la API, o con
   * movimiento reducido, el cambio es directo y anima `#animate`.
   */
  #morph(update: () => void): void {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready: Promise<void>; updateCallbackDone: Promise<void> } };
    if (!doc.startViewTransition || reduced() || !this.#stage?.getClientRects().length) return update();
    this.#names(true);
    const t = doc.startViewTransition(() => {
      this.#names(false);
      update();
      this.#dir = 0;
      this.#render();
      this.#names(true);
    });
    const quiet = () => {};
    t.ready.catch(quiet);
    t.updateCallbackDone.catch(quiet);
    t.finished.catch(quiet).finally(() => this.#names(false));
  }

  /** Un `view-transition-name` por persona y por unidad (la primera vez que aparece), o ninguno. */
  #names(on: boolean): void {
    const seen = new Set<string>();
    for (const el of this.#stage?.querySelectorAll<HTMLElement>(".nx-org__person[data-person], .nx-org__peer[data-person], .nx-org__ucard, .nx-org__uhead") ?? []) {
      const id = el.dataset.person ? `p${el.dataset.person}` : `u${el.dataset.unit}`;
      let n = this.#vt.get(id);
      if (n === undefined) this.#vt.set(id, (n = this.#vt.size));
      el.style.setProperty("view-transition-name", on && !seen.has(id) ? `${this.#uid}-${n}` : "");
      seen.add(id);
    }
  }

  /** Abre una unidad (su gente) o vuelve al árbol, con su camino desplegado para encontrarla. */
  #openUnit(id: string | null, dir: number): void {
    const was = this.#unit;
    this.#morph(() => {
      // Sus antecesoras quedan desplegadas: al volver al árbol, la unidad está a la vista.
      for (const u of unitPath(this.#index(), id).slice(0, -1)) {
        this.#folded.delete(u.id);
        this.#opened.add(u.id);
      }
      this.#unit = id;
      this.#reveal = id ? null : was;
      this.#page = PAGE;
      this.#dir = dir;
      this.#closeResults();
      this.#setView("map");
    });
    this.#announce(id ? (this.#index().units.get(id)?.name ?? "") : this.#labels.map);
  }

  /** La raíz, si es una sola (el grupo): va arriba del árbol y sus hijas en fila. */
  #soleRoot(): string | null {
    const roots = this.#index().childUnits.get("") ?? [];
    return roots.length === 1 ? roots[0].id : null;
  }

  // ---------------------------------------------------------------- render

  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      // Un render directo (el de una View Transition) ya lo hizo.
      if (this.#queued && this.isConnected && this.#root) this.#render();
    });
  }

  #render(): void {
    this.#queued = false;
    const root = this.#root!;
    const view = this.#currentView();
    root.dataset.view = view;
    if (!this.#bar) {
      this.#buildBar();
      root.replaceChildren(this.#bar!, this.#crumbs!, this.#stage!, this.#live!);
    }
    for (const b of this.#bar!.querySelectorAll<HTMLButtonElement>("button[data-view]")) b.setAttribute("aria-pressed", String(b.dataset.view === view));
    const metricField = this.#bar!.querySelector<HTMLElement>(".nx-org__metric");
    if (metricField) {
      metricField.hidden = view !== "map";
      const sel = metricField.querySelector("select")!;
      const key = this.#metricDef()?.key ?? "";
      if (sel.value !== key) sel.value = key;
    }

    const focus = this.#focusSnapshot();
    this.#w = this.#stage!.clientWidth;
    const body = view === "map" ? this.#renderMap() : this.#renderMe();
    this.#stage!.replaceChildren(body);
    this.#restoreFocus(focus);
    const back = this.#reveal && this.#stage!.querySelector<HTMLElement>(`[data-open="${CSS.escape(this.#reveal)}"]`);
    this.#reveal = null;
    if (back) {
      back.focus({ preventScroll: true });
      back.scrollIntoView?.({ block: "nearest" });
    }
    this.#animate(body);
  }

  #buildBar(): void {
    const L = this.#labels;
    const bar = h("div", { class: "nx-org__bar" });
    const hasMap = this.#index().units.size > 0;
    if (hasMap && (this.me || this.#center)) {
      const seg = h("div", { class: "nx-org__views", role: "group", "aria-label": L.views });
      for (const v of ["me", "map"] as const) seg.append(h("button", { type: "button", class: "nx-org__view", "data-view": v, "aria-pressed": "false" }, L[v]));
      bar.append(seg);
    }
    if (this.searchable) {
      const lid = `${this.#uid}-results`;
      this.#input = h("input", {
        type: "search",
        class: "nx-org__input",
        placeholder: L.placeholder,
        "aria-label": L.search,
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": "false",
        "aria-controls": lid,
        autocomplete: "off",
      });
      this.#input.value = this.#query;
      this.#list = h("ul", { class: "nx-org__results", id: lid, role: "listbox", "aria-label": L.search, hidden: true });
      bar.append(h("div", { class: "nx-org__search" }, glyph("search", "nx-org__search-icon"), this.#input, this.#list));
    } else {
      this.#input = undefined;
      this.#list = undefined;
    }
    if (this.#metrics.length) {
      const sel = h("select", { class: "nx-org__select", "aria-label": L.metric });
      sel.append(h("option", { value: "" }, L.noMetric));
      for (const m of this.#metrics) sel.append(h("option", { value: m.key }, m.label));
      sel.value = this.#metricDef()?.key ?? "";
      bar.append(h("label", { class: "nx-org__metric" }, h("span", { class: "nx-org__label" }, L.metric), sel));
    }
    this.#bar = bar;
  }

  #metricDef(): OrgMetric | undefined {
    const key = this.metric;
    return key ? this.#metrics.find((m) => m.key === key) : undefined;
  }

  #fmtCount(n: number): string {
    return n === 1 ? this.#labels.peopleOne : fill(this.#labels.people, { n: nxFormat(resolveLocale(this)).number(n) });
  }

  #fmtNum(n: number): string {
    return nxFormat(resolveLocale(this)).number(n);
  }

  // ---------------------------------------------------------------- lente «Yo»

  #renderMe(): HTMLElement {
    const L = this.#labels;
    const ix = this.#index();
    const id = this.center;
    const wrap = h("div", { class: "nx-org__me" });
    const crumbs = this.#crumbs!;
    crumbs.replaceChildren();
    crumbs.removeAttribute("aria-label");
    if (!id) {
      wrap.append(h("p", { class: "nx-org__empty" }, L.empty));
      return wrap;
    }
    const p = ix.people.get(id);
    const key = `p:${id}`;
    if (!p) {
      if (!this.#failed.has(key)) void this.#ensurePerson(id);
      wrap.append(this.#status(key, () => void this.#ensurePerson(id)));
      return wrap;
    }

    // La cadena hacia arriba, en caras solapadas: del más alto al jefe inmediato (el nombre se
    // despliega al pasar por encima o con el foco).
    const chain = chainOf(ix, id);
    if (chain.length) {
      crumbs.setAttribute("aria-label", L.chain);
      const ol = h("ol", { class: "nx-org__trail nx-org__chain" });
      for (const b of [...chain].reverse()) ol.append(h("li", null, this.#personLink(b, "nx-org__crumb nx-org__face")));
      crumbs.append(h("div", { class: "nx-org__chainbox" }, h("span", { class: "nx-org__label" }, L.chain), ol));
    }

    // El camino entre quien mira y el centro: dibujado, y en una frase.
    if (this.me && id !== this.me) {
      wrap.append(h("div", { class: "nx-org__path" }, this.#route(this.me, p), h("p", null, h("span", null, this.#pathText(this.me, p)), " ", h("button", { type: "button", class: "nx-org__link", "data-act": "home" }, L.seeMe))));
    }

    const boss = chain[0];
    wrap.append(
      h(
        "section",
        { class: "nx-org__level nx-org__level--boss", "aria-label": L.boss },
        boss ? this.#card(boss, "boss") : p.boss && this.#pending.has(key) ? h("p", { class: "nx-org__muted" }, L.loading) : h("p", { class: "nx-org__muted nx-org__noboss" }, L.noBoss),
      ),
    );

    // El centro, con quienes comparten jefe a los dos lados (debajo, en lo angosto).
    const team = reportsOf(ix, id);
    const expected = directCount(ix, p);
    const axis = h("div", { class: `nx-org__axis${team.length || expected ? " has-team" : ""}` }, this.#card(p, "center"));
    const mid = h("section", { class: "nx-org__level nx-org__level--center" }, axis);
    const peers = peersOf(ix, id).sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (peers.length) {
      const shown = this.#peersOpen ? peers : peers.slice(0, PEERS);
      const half = Math.ceil(shown.length / 2);
      const side = (list: OrgPerson[], cls: string) => {
        const ul = h("ul", { class: `nx-org__peers ${cls}`, role: "list", "aria-label": `${L.peers} · ${this.#fmtNum(peers.length)}` });
        for (const q of list) ul.append(h("li", null, this.#peer(q)));
        return ul;
      };
      const left = side(shown.slice(0, half), "is-l");
      const right = side(shown.slice(half), "is-r");
      left.prepend(h("li", { class: "nx-org__h", "aria-hidden": "true" }, `${L.peers} · ${this.#fmtNum(peers.length)}`));
      if (peers.length > shown.length) (half < shown.length ? right : left).append(h("li", null, h("button", { type: "button", class: "nx-org__chip nx-org__chip--more", "data-act": "peers" }, fill(L.more, { n: peers.length - shown.length }))));
      mid.prepend(left);
      mid.append(right);
    }
    wrap.append(mid);

    if (team.length || expected) {
      const sec = h("section", { class: "nx-org__level nx-org__level--team" }, h("h3", { class: "nx-org__h nx-org__pill" }, `${L.reports} · ${this.#fmtNum(Math.max(team.length, expected))}`));
      if (team.length) {
        const page = team.slice(0, this.#page);
        sec.append(this.#tree(page.map((q) => [this.#card(q, "team")]), CARD, 920));
        if (team.length > this.#page) sec.append(h("button", { type: "button", class: "nx-org__more", "data-act": "page" }, L.showMore));
      } else sec.append(this.#status(key, () => void this.#ensurePerson(id)));
      wrap.append(sec);
    }

    if (id === this.me && this.#contacts.length) wrap.append(this.#renderContacts());
    return wrap;
  }

  #pathText(me: string, to: OrgPerson): string {
    const L = this.#labels;
    const ix = this.#index();
    const r = commonBoss(ix, me, to.id);
    if (!r || !r.boss) return fill(L.noPath, { name: to.name });
    if (r.boss.id === to.id) return fill(L.above, { name: to.name });
    if (r.boss.id === me) return fill(L.below, { name: to.name });
    if (r.up === 1 && r.down === 1) return fill(L.sameBoss, { name: to.name });
    const levels = r.up === 1 ? L.levelOne : fill(L.levels, { n: r.up });
    return `${fill(L.common, { name: to.name, boss: r.boss.name })} · ${levels}`;
  }

  /** El camino en caras: Tú —↑2— jefe común —↓1— la otra persona. Sin línea de mando, nada. */
  #route(me: string, to: OrgPerson): HTMLElement | null {
    const ix = this.#index();
    const r = commonBoss(ix, me, to.id);
    const mine = ix.people.get(me);
    if (!r?.boss || !mine) return null;
    const node = (p: OrgPerson, label = p.name) => {
      const body = [this.#avatar(p, "nx-org__mini"), h("span", { class: "nx-org__node-name" }, label)];
      return p.id === to.id || p.locked ? h("span", { class: "nx-org__node" }, ...body) : h("button", { type: "button", class: "nx-org__node", ...(p.id === me ? { "data-act": "home" } : { "data-person": p.id }) }, ...body);
    };
    const edge = (n: number, up: boolean) => h("span", { class: "nx-org__edge", "aria-hidden": "true" }, `${up ? "↑" : "↓"} ${n}`);
    const out = h("div", { class: "nx-org__route" }, node(mine, this.#labels.you));
    if (r.up) out.append(edge(r.up, true));
    if (r.boss.id !== me && r.boss.id !== to.id) out.append(node(r.boss));
    if (r.down) out.append(edge(r.down, false), node(to));
    else if (r.boss.id === to.id) out.append(node(to));
    return out;
  }

  /** Quien comparte jefe con el centro: pequeña, a un lado. */
  #peer(p: OrgPerson): HTMLElement {
    const body = [this.#avatar(p, "nx-org__mini"), h("span", { class: "nx-org__who" }, h("span", { class: "nx-org__peer-name" }, p.name), p.title ? h("span", { class: "nx-org__peer-title" }, p.title) : null)];
    const title = p.title ? `${p.name} · ${p.title}` : p.name;
    const cls = `nx-org__peer${p.id === this.me ? " is-me" : ""}`;
    if (p.locked) return h("span", { class: cls, "data-person": p.id, title }, ...body);
    return h("button", { type: "button", class: cls, "data-person": p.id, title }, ...body);
  }

  #renderContacts(): HTMLElement {
    const L = this.#labels;
    const ix = this.#index();
    const dl = h("dl", { class: "nx-org__contacts" }, h("dt", { class: "nx-org__contacts-head" }, L.contactsFor), h("dd", { class: "nx-org__contacts-head" }, L.contactsWho));
    for (const c of this.#contacts) {
      const who = c.person ? ix.people.get(String(c.person)) : undefined;
      const href = safeHref(c.href);
      const value = who ? this.#chip(who) : href ? h("a", { class: "nx-org__link", href }, c.text ?? href) : h("span", null, c.text ?? "—");
      dl.append(h("dt", null, c.label), h("dd", null, value));
    }
    return h("section", { class: "nx-org__level nx-org__level--contacts" }, dl);
  }

  #avatar(p: OrgPerson, cls = "nx-org__avatar"): HTMLElement {
    const src = safeImageSrc(p.avatar);
    if (src) return h("img", { class: cls, src, alt: "", loading: "lazy", referrerpolicy: "no-referrer", decoding: "async" });
    return h("span", { class: `${cls} ${cls}--initials`, "aria-hidden": "true", style: `--h:${hueOf(p.id)}` }, initials(p.name));
  }

  /** Una tarjeta de persona. Se centra en ella al pulsarla, salvo que esté `locked` o ya sea el centro.
   *  `bare`: sin la unidad (dentro de una unidad abierta, sobra). */
  #card(p: OrgPerson, role: "boss" | "center" | "team", bare = false): HTMLElement {
    const L = this.#labels;
    const ix = this.#index();
    const team = teamSize(ix, p);
    const direct = directCount(ix, p);
    const line = bare ? "" : unitLine(ix, p.unit);
    const isMe = p.id === this.me;
    const body = [
      this.#avatar(p),
      h(
        "span",
        { class: "nx-org__who" },
        h("span", { class: "nx-org__name" }, p.name, isMe && role !== "center" ? h("span", { class: "nx-org__you" }, L.you) : null),
        p.title ? h("span", { class: "nx-org__title" }, p.title) : null,
        line ? h("span", { class: "nx-org__unit" }, line) : null,
        direct || team ? h("span", { class: "nx-org__span" }, role === "team" ? this.#faces(ix.reports.get(p.id) ?? []) : null, this.#spanText(direct, team)) : null,
      ),
    ];
    const cls = `nx-org__person nx-org__person--${role}${isMe ? " is-me" : ""}`;
    if (role === "center" || p.locked) {
      const card = h("div", { class: cls, "data-person": p.id }, ...body);
      const href = role === "center" ? safeHref(p.href) : undefined;
      if (href) card.append(h("a", { class: "nx-org__link nx-org__open", href }, L.open));
      if (role === "center") card.append(h("button", { type: "button", class: "nx-org__link nx-org__tomap", "data-act": "tomap", hidden: !ix.units.size || !p.unit }, L.seeMap));
      return card;
    }
    return h("button", { type: "button", class: cls, "data-person": p.id }, ...body);
  }

  /** «4 a cargo · 37 en total». */
  #spanText(direct: number, team: number): string {
    const L = this.#labels;
    const first = fill(L.span, { n: this.#fmtNum(direct || team) });
    return team > direct && direct ? `${first} · ${fill(L.spanTotal, { n: this.#fmtNum(team) })}` : first;
  }

  /** Hasta cuatro caras solapadas (las de su equipo, o las de una unidad). */
  #faces(people: OrgPerson[]): HTMLElement | null {
    return people.length ? h("span", { class: "nx-org__faces", "aria-hidden": "true" }, ...people.slice(0, 4).map((q) => this.#avatar(q, "nx-org__mini"))) : null;
  }

  #chip(p: OrgPerson): HTMLElement {
    const body = [this.#avatar(p, "nx-org__mini"), h("span", { class: "nx-org__chip-name" }, p.name)];
    const title = p.title ? `${p.name} · ${p.title}` : p.name;
    if (p.locked || p.id === this.center) return h("span", { class: "nx-org__chip", title }, ...body);
    return h("button", { type: "button", class: "nx-org__chip", "data-person": p.id, title }, ...body);
  }

  #personLink(p: OrgPerson, cls: string): HTMLElement {
    const text = [this.#avatar(p, "nx-org__mini"), h("span", { class: "nx-org__crumb-name" }, p.name)];
    const title = p.title ? `${p.name} · ${p.title}` : p.name;
    if (p.locked) return h("span", { class: cls, title }, ...text);
    return h("button", { type: "button", class: cls, "data-person": p.id, title, "aria-label": title }, ...text);
  }

  #status(key: string, retry: () => void): HTMLElement {
    const L = this.#labels;
    if (this.#failed.has(key)) {
      const btn = h("button", { type: "button", class: "nx-org__link" }, L.retry);
      btn.addEventListener("click", retry);
      return h("p", { class: "nx-org__muted", role: "alert" }, `${L.error} `, btn);
    }
    if (this.#pending.has(key) || (this.#url() && !this.#loaded.has(key))) return h("p", { class: "nx-org__muted" }, L.loading);
    return h("p", { class: "nx-org__empty" }, L.empty);
  }

  // ---------------------------------------------------------------- lente «Organización»

  #renderMap(): HTMLElement {
    const id = this.#unit && this.#index().units.has(this.#unit) ? this.#unit : null;
    this.#renderTrail(id);
    return id ? this.#renderUnit(id) : this.#renderTree();
  }

  /** Las migas: «Organización › Grupo › Empresa › la unidad abierta». En el árbol, nada. */
  #renderTrail(id: string | null): void {
    const crumbs = this.#crumbs!;
    crumbs.setAttribute("aria-label", this.#labels.map);
    if (!id) return crumbs.replaceChildren();
    const ol = h("ol", { class: "nx-org__trail" });
    const path = unitPath(this.#index(), id);
    ol.append(h("li", null, h("button", { type: "button", class: "nx-org__crumb", "data-go": "" }, this.#labels.map)));
    path.forEach((u, i) => ol.append(h("li", null, i === path.length - 1 ? h("span", { class: "nx-org__crumb", "aria-current": "page" }, u.name) : h("button", { type: "button", class: "nx-org__crumb", "data-go": u.id }, u.name))));
    crumbs.replaceChildren(ol);
  }

  /** Las unidades del camino hasta quien mira. */
  #myPath(): Set<string> {
    const me = this.me ? this.#index().people.get(this.me) : undefined;
    return new Set(unitPath(this.#index(), me?.unit).map((u) => u.id));
  }

  /** Abierta: lo que se tocó a mano manda; si no, la fila de arriba y el camino hasta quien mira. */
  #isOpen(u: OrgUnit, depth: number, mine: Set<string>): boolean {
    if (this.#folded.has(u.id)) return false;
    if (this.#opened.has(u.id)) return true;
    const myUnit = this.me ? this.#index().people.get(this.me)?.unit : null;
    return depth === 0 || (mine.has(u.id) && u.id !== myUnit);
  }

  #sorted(list: readonly OrgUnit[]): OrgUnit[] {
    const ix = this.#index();
    return [...list].sort((a, b) => unitCount(ix, b) - unitCount(ix, a) || byName(a, b));
  }

  /** El árbol: la raíz (si es una sola), sus hijas en fila con ramas y el resto colgando debajo. */
  #renderTree(): HTMLElement {
    const ix = this.#index();
    const wrap = h("div", { class: "nx-org__map" });
    const sole = this.#soleRoot();
    const top = this.#sorted(ix.childUnits.get(sole ?? "") ?? []);
    const mine = this.#myPath();
    if (sole) {
      wrap.append(this.#ucard(ix.units.get(sole)!, [], mine, -1));
      if (top.length) wrap.append(h("div", { class: `nx-org__trunk${mine.has(sole) ? " is-on" : ""}` }));
    }
    if (top.length)
      wrap.append(
        this.#tree(
          top.map((u) => [this.#ucard(u, top, mine, 0), this.#substack(u, 0, mine)]),
          270,
          Infinity,
          !!sole,
          top.map((u) => mine.has(u.id)),
        ),
      );
    else if (!sole) wrap.append(h("p", { class: "nx-org__empty" }, this.#labels.empty));
    return wrap;
  }

  /** Las subunidades de `u`, en columna sobre un riel (si está abierta), con «+n» pasadas `STACK`. */
  #substack(u: OrgUnit, depth: number, mine: Set<string>): HTMLElement | null {
    const kids = this.#sorted(this.#index().childUnits.get(u.id) ?? []);
    if (!kids.length || !this.#isOpen(u, depth, mine)) return null;
    const key = `u:${u.id}`;
    const shown = this.#full.has(key) ? kids : kids.slice(0, STACK);
    const box = h("div", null, this.#stack(shown.map((k) => [this.#ucard(k, kids, mine, depth + 1), this.#substack(k, depth + 1, mine)]), shown.map((k) => mine.has(k.id))));
    if (kids.length > shown.length) box.append(this.#moreBtn(key, kids.length - shown.length));
    return box;
  }

  #moreBtn(key: string, n: number): HTMLElement {
    return h("button", { type: "button", class: "nx-org__more nx-org__more--stack", "data-act": "full", "data-key": key }, fill(this.#labels.more, { n: this.#fmtNum(n) }));
  }

  /**
   * Una fila de columnas: con `bus`, una barra con ramas a la primera fila (como el equipo de «Yo»).
   * Las columnas salen del ancho; `on` marca la que lleva a quien mira.
   */
  #tree(cols: (Node | null)[][], card: number, cap = Infinity, bus = true, on: boolean[] = []): HTMLElement {
    const w = Math.min(this.#w || 960, cap);
    const n = Math.max(1, Math.min(cols.length, Math.floor((w + 16) / card)));
    const ul = h("ul", { class: "nx-org__cards nx-org__tree", role: "list", style: `--cols:${n}` });
    cols.forEach((c, i) => ul.append(h("li", { class: [bus && i < n ? `is-top${i === n - 1 ? " is-end" : ""}` : "", on[i] ? "is-on" : ""].join(" ").trim() || null }, ...c)));
    return ul;
  }

  /** Una columna sobre un riel; `on` tiñe el riel hasta la fila que lleva a quien mira. */
  #stack(rows: (Node | null)[][], on: boolean[] = []): HTMLElement {
    const at = on.indexOf(true);
    const ul = h("ul", { class: "nx-org__stack", role: "list" });
    rows.forEach((r, i) => ul.append(h("li", { class: i === at ? "is-on" : i < at ? "is-rail" : null }, ...r)));
    return ul;
  }

  /**
   * La tarjeta de una unidad: abrirla (su gente) y, si tiene subunidades, plegarlas o desplegarlas.
   * `depth`: -1 la raíz, 0 la fila de arriba, y así hacia abajo.
   */
  #ucard(u: OrgUnit, sibs: OrgUnit[], mine: Set<string>, depth: number): HTMLElement {
    const L = this.#labels;
    const ix = this.#index();
    const kids = ix.childUnits.get(u.id) ?? [];
    const lead = u.leader ? ix.people.get(u.leader) : undefined;
    const hue = this.#branchHue(u.id);
    const card = h(
      "div",
      { class: `nx-org__ucard${depth < 0 ? " is-root" : ""}${mine.has(u.id) ? " is-on" : ""}`, "data-unit": u.id, style: hue === undefined ? null : `--h:${hue}` },
      h(
        "button",
        { type: "button", class: "nx-org__uopen", "data-open": u.id },
        u.kind ? h("span", { class: "nx-org__kind" }, u.kind) : null,
        h("span", { class: "nx-org__uname" }, u.name),
        lead ? h("span", { class: "nx-org__ulead" }, this.#avatar(lead), h("span", { class: "nx-org__who" }, h("span", { class: "nx-org__peer-name" }, lead.name), lead.title ? h("span", { class: "nx-org__peer-title" }, lead.title) : null)) : null,
        h("span", { class: "nx-org__ufoot" }, this.#bigCount(unitCount(ix, u)), this.#faces(this.#someMembers(u.id, lead?.id))),
        this.#metricChip(u, sibs),
      ),
      this.me && ix.people.get(this.me)?.unit === u.id ? h("span", { class: "nx-org__you", "aria-hidden": "true" }, L.you) : null,
    );
    if (kids.length && depth >= 0) {
      const open = this.#isOpen(u, depth, mine);
      card.append(h("button", { type: "button", class: "nx-org__utoggle", "data-toggle": u.id, "aria-expanded": String(open) }, open ? L.fold : kids.length === 1 ? L.subunitOne : fill(L.subunits, { n: this.#fmtNum(kids.length) })));
    }
    return card;
  }

  /** La cifra elegida, con su intensidad entre las hermanas. */
  #metricChip(u: OrgUnit, sibs: OrgUnit[]): HTMLElement | null {
    const metric = this.#metricDef();
    const v = metric ? u.metrics?.[metric.key] : undefined;
    if (!metric || typeof v !== "number") return null;
    const level = metricLevels(this.#index(), sibs.length ? sibs : [u], metric).get(u.id) ?? 0;
    return h("span", { class: "nx-org__metric-chip", "data-tone": metric.tone ?? null, style: `--i:${level.toFixed(3)}` }, `${metric.label}: ${this.#fmtNum(v)}`);
  }

  /** Una unidad abierta: su cabecera, su gente en árbol (como «Yo») y sus subunidades. */
  #renderUnit(id: string): HTMLElement {
    const L = this.#labels;
    const ix = this.#index();
    const u = ix.units.get(id)!;
    const sibs = u.parent ? (ix.childUnits.get(u.parent) ?? []) : [];
    const hue = this.#branchHue(id);
    const wrap = h(
      "div",
      { class: "nx-org__map nx-org__unitview" },
      h(
        "div",
        { class: "nx-org__uhead", "data-unit": id, style: hue === undefined ? null : `--h:${hue}` },
        u.kind ? h("span", { class: "nx-org__kind" }, u.kind) : null,
        h("h2", { class: "nx-org__uname" }, u.name),
        h("span", { class: "nx-org__ufoot" }, this.#bigCount(unitCount(ix, u)), this.#metricChip(u, sibs)),
      ),
    );
    const key = `u:${id}`;
    if (!this.#failed.has(key)) void this.#ensureUnit(id);
    const members = this.#index().members.get(id) ?? [];
    const kids = this.#sorted(ix.childUnits.get(id) ?? []);
    if (members.length && !this.#pending.has(key)) wrap.append(...this.#peopleTree(u, members));
    // Sin gente directa, una unidad con subunidades no necesita aviso: se ven sus subunidades.
    else if (!kids.length || this.#pending.has(key) || this.#failed.has(key)) wrap.append(this.#status(key, () => void this.#ensureUnit(id)));
    if (kids.length) {
      const mine = this.#myPath();
      const ul = h("ul", { class: "nx-org__cards nx-org__subunits", role: "list" });
      for (const k of kids) ul.append(h("li", null, this.#ucard(k, kids, mine, -2)));
      wrap.append(h("section", { class: "nx-org__members" }, h("h3", { class: "nx-org__h" }, kids.length === 1 ? L.subunitOne : fill(L.subunits, { n: this.#fmtNum(kids.length) })), ul));
    }
    return wrap;
  }

  /**
   * La gente de una unidad como en «Yo»: quien no tiene jefe dentro de la unidad (el líder) arriba,
   * sus jefes en columnas con su equipo en pila, y sus directos aparte. Sin línea de mando, en tarjetas.
   */
  #peopleTree(u: OrgUnit, members: OrgPerson[]): HTMLElement[] {
    const L = this.#labels;
    const ix = this.#index();
    const inUnit = new Set(members.map((p) => p.id));
    const below = (p: OrgPerson) => (ix.reports.get(p.id) ?? []).filter((q) => inUnit.has(q.id));
    const has = (list: OrgPerson[]) => !!this.me && list.some((q) => q.id === this.me);
    const roots = members.filter((p) => !p.boss || !inUnit.has(p.boss)).sort((a, b) => Number(b.id === u.leader) - Number(a.id === u.leader) || byName(a, b));
    const trees = roots.filter((r) => below(r).length);
    const loose = roots.filter((r) => !below(r).length);
    const out: HTMLElement[] = [];
    for (const r of trees) {
      const kids = below(r);
      const inner = kids.filter((k) => below(k).length).sort((a, b) => below(b).length - below(a).length || byName(a, b));
      const leaves = kids.filter((k) => !below(k).length);
      let total = 0;
      for (const queue = [r]; queue.length; )
        for (const q of below(queue.pop()!)) {
          total++;
          queue.push(q);
        }
      const first = r.name.split(" ")[0];
      const cols: (Node | null)[][] = inner.map((k) => [this.#card(k, "team", true), this.#pile(below(k), `p:${k.id}`)]);
      const on = inner.map((k) => k.id === this.me || has(below(k)));
      if (leaves.length) {
        cols.push([h("div", { class: "nx-org__colhead" }, `${fill(L.direct, { name: first })} · ${this.#fmtNum(leaves.length)}`), this.#pile(leaves, `p:${r.id}`)]);
        on.push(has(leaves));
      }
      out.push(
        h(
          "section",
          { class: "nx-org__level nx-org__level--team nx-org__level--root" },
          h("div", { class: "nx-org__lead" }, this.#card(r, "boss", true)),
          h("h3", { class: "nx-org__h nx-org__pill" }, `${fill(L.teamOf, { name: first })} · ${this.#fmtNum(total)}`),
          this.#tree(cols, 250, Infinity, true, on),
        ),
      );
    }
    if (loose.length) out.push(this.#peopleGrid(loose, trees.length ? fill(L.peopleIn, { name: u.name }) : ""));
    return out;
  }

  /** Una pila de personas sobre un riel (quien mira primero), con «+n» pasadas `PILE`. */
  #pile(list: OrgPerson[], key: string): HTMLElement {
    const sorted = [...list].sort((a, b) => Number(b.id === this.me) - Number(a.id === this.me) || byName(a, b));
    const shown = this.#full.has(key) ? sorted : sorted.slice(0, PILE);
    const box = h("div", null, this.#stack(shown.map((p) => [this.#peer(p)]), shown.map((p) => p.id === this.me)));
    if (sorted.length > shown.length) box.append(this.#moreBtn(key, sorted.length - shown.length));
    return box;
  }

  /** El tono de la rama de primer nivel a la que pertenece la unidad (por su tamaño entre sus hermanas). */
  #branchHue(id: string): number | undefined {
    const ix = this.#index();
    const path = unitPath(ix, id);
    const at = path.findIndex((u) => u.id !== this.#soleRoot());
    if (at < 0) return undefined;
    return BRANCH[Math.max(0, this.#sorted(ix.childUnits.get(at ? path[at - 1].id : "") ?? []).indexOf(path[at])) % BRANCH.length];
  }

  /** Unas pocas personas ya cargadas de la unidad o de sus subunidades, sin el líder. */
  #someMembers(id: string, skip?: string): OrgPerson[] {
    const ix = this.#index();
    const out: OrgPerson[] = [];
    const queue = [id];
    for (let i = 0; i < queue.length && i < 40 && out.length < 4; i++) {
      for (const p of ix.members.get(queue[i]) ?? []) if (p.id !== skip && out.length < 4) out.push(p);
      for (const c of ix.childUnits.get(queue[i]) ?? []) queue.push(c.id);
    }
    return out;
  }

  /** «1.234 personas» con la cifra grande (la plantilla decide dónde va). */
  #bigCount(n: number): HTMLElement {
    const L = this.#labels;
    const [tpl, mark] = n === 1 ? [L.peopleOne, "1"] : [L.people, "{n}"];
    const at = tpl.indexOf(mark);
    if (at < 0) return h("span", { class: "nx-org__count" }, this.#fmtCount(n));
    return h("span", { class: "nx-org__count" }, tpl.slice(0, at), h("b", { class: "nx-org__big" }, this.#fmtNum(n)), tpl.slice(at + mark.length));
  }

  #peopleGrid(people: OrgPerson[], heading: string): HTMLElement {
    const sec = h("section", { class: "nx-org__members" });
    if (heading) sec.append(h("h3", { class: "nx-org__h" }, `${heading} · ${this.#fmtNum(people.length)}`));
    const sorted = [...people].sort((a, b) => Number(b.id === this.me) - Number(a.id === this.me) || a.name.localeCompare(b.name, "es"));
    const ul = h("ul", { class: "nx-org__cards", role: "list" });
    for (const p of sorted.slice(0, this.#page)) ul.append(h("li", null, this.#card(p, "team")));
    sec.append(ul);
    if (sorted.length > this.#page) sec.append(h("button", { type: "button", class: "nx-org__more", "data-act": "page" }, this.#labels.showMore));
    return sec;
  }

  // ---------------------------------------------------------------- movimiento

  /** Sin View Transitions: entrar se acerca un poco; salir, se aleja. */
  #animate(el: HTMLElement): void {
    const dir = this.#dir;
    this.#dir = 0;
    if (!dir || reduced() || typeof el.animate !== "function") return;
    el.animate([{ transform: `scale(${dir > 0 ? 0.97 : 1.03})`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: EASE });
  }

  #focusSnapshot(): string | null {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement) || !this.#stage?.contains(a)) return null;
    const d = a.dataset;
    return d.open ? `[data-open="${CSS.escape(d.open)}"]` : d.toggle ? `[data-toggle="${CSS.escape(d.toggle)}"]` : d.person ? `[data-person="${CSS.escape(d.person)}"]` : d.act ? `[data-act="${d.act}"]` : null;
  }

  #restoreFocus(sel: string | null): void {
    if (!sel) return;
    this.#stage!.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }

  /** Tras cambiar de foco con el teclado, el primer elemento útil del escenario. */
  #focusStage(): void {
    queueMicrotask(() =>
      queueMicrotask(() => {
        const first = this.#stage?.querySelector<HTMLElement>(".nx-org__uhead, .nx-org__uopen, .nx-org__person--center, button.nx-org__person, .nx-org__empty");
        if (first) {
          if (!first.matches("button")) first.tabIndex = -1;
          first.focus({ preventScroll: true });
        }
      }),
    );
  }

  // ---------------------------------------------------------------- búsqueda

  #onInput = (e: Event): void => {
    if (e.target !== this.#input) return;
    this.#query = this.#input!.value;
    clearTimeout(this.#qTimer);
    const q = this.#query.trim();
    if (!q) {
      this.#closeResults();
      return;
    }
    this.#localResults(q);
    if (this.#url() && q.length >= 2) {
      const gen = ++this.#qGen;
      this.#qTimer = setTimeout(() => {
        this.#request({ search: q })
          .then((page) => {
            if (gen !== this.#qGen) return;
            this.#merge(page);
            this.#localResults(q, page?.people?.map((p) => String(p.id)));
          })
          .catch(() => {
            /* quedan los resultados locales */
          });
      }, 250) as unknown as number;
    }
  };

  #localResults(q: string, order?: string[]): void {
    const ix = this.#index();
    const people = order ? (order.map((id) => ix.people.get(id)).filter(Boolean) as OrgPerson[]) : [...ix.people.values()].filter((p) => matchPerson(p, q)).slice(0, 8);
    const units = [...ix.units.values()].filter((u) => matchPerson({ id: u.id, name: u.name }, q)).slice(0, 4);
    this.#results = [
      ...people.slice(0, 8).map((p) => ({ id: `p:${p.id}`, label: p.name, meta: [p.title, unitLine(ix, p.unit)].filter(Boolean).join(" · "), pick: () => this.#goPerson(p.id, 1) })),
      ...units.map((u) => ({ id: `u:${u.id}`, label: u.name, meta: [u.kind, this.#fmtCount(unitCount(ix, u))].filter(Boolean).join(" · "), pick: () => this.focusUnit(u.id) })),
    ];
    this.#active = this.#results.length ? 0 : -1;
    this.#paintResults(q);
  }

  #paintResults(q: string): void {
    const list = this.#list;
    const input = this.#input;
    if (!list || !input) return;
    list.replaceChildren();
    if (!this.#results.length) list.append(h("li", { class: "nx-org__noresult", role: "presentation" }, fill(this.#labels.noResults, { q })));
    this.#results.forEach((r, i) => {
      list.append(
        h(
          "li",
          { id: `${this.#uid}-r${i}`, class: "nx-org__result", role: "option", "aria-selected": String(i === this.#active), "data-result": i },
          h("span", { class: "nx-org__result-name" }, r.label),
          r.meta ? h("span", { class: "nx-org__result-meta" }, r.meta) : null,
        ),
      );
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (this.#active >= 0) input.setAttribute("aria-activedescendant", `${this.#uid}-r${this.#active}`);
    else input.removeAttribute("aria-activedescendant");
  }

  #closeResults(): void {
    this.#qGen++;
    clearTimeout(this.#qTimer);
    this.#results = [];
    this.#active = -1;
    if (this.#list) this.#list.hidden = true;
    this.#input?.setAttribute("aria-expanded", "false");
    this.#input?.removeAttribute("aria-activedescendant");
  }

  #pick(i: number): void {
    const r = this.#results[i];
    if (!r) return;
    this.#query = "";
    if (this.#input) this.#input.value = "";
    this.#closeResults();
    r.pick();
    this.#focusStage();
  }

  #onChange = (e: Event): void => {
    const t = e.target as HTMLElement;
    if (t instanceof HTMLSelectElement && t.classList.contains("nx-org__select")) this.metric = t.value || null;
  };

  #onFocusOut = (e: FocusEvent): void => {
    const next = e.relatedTarget as Node | null;
    if (this.#list && !this.#list.hidden && !(next && this.#bar?.contains(next))) this.#closeResults();
  };

  // ---------------------------------------------------------------- eventos

  #onClick = (e: MouseEvent): void => {
    const t = e.target as HTMLElement;
    const result = t.closest<HTMLElement>("[data-result]");
    if (result) {
      this.#pick(Number(result.dataset.result));
      return;
    }
    const viewBtn = t.closest<HTMLElement>("button[data-view]");
    if (viewBtn) {
      const v = viewBtn.dataset.view as OrgView;
      if (v === "me") {
        this.#dir = -1;
        this.#setView("me");
      } else {
        this.#dir = 1;
        this.#setView("map");
      }
      return;
    }
    const open = t.closest<HTMLElement>("[data-open]");
    if (open) return this.#openUnit(open.dataset.open!, 1);
    const go = t.closest<HTMLElement>("[data-go]");
    if (go) return this.#openUnit(go.dataset.go || null, -1);
    const toggle = t.closest<HTMLElement>("[data-toggle]");
    if (toggle) return this.#toggle(toggle.dataset.toggle!, toggle.getAttribute("aria-expanded") !== "true");
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "home") return this.#goPerson(null, -1);
    if (act === "peers") {
      this.#peersOpen = true;
      this.#schedule();
      return;
    }
    if (act === "full") {
      this.#full.add(t.closest<HTMLElement>("[data-key]")!.dataset.key!);
      this.#schedule();
      return;
    }
    if (act === "page") {
      this.#page += PAGE;
      this.#schedule();
      return;
    }
    if (act === "tomap") {
      const p = this.center ? this.#index().people.get(this.center) : undefined;
      if (p?.unit) this.focusUnit(p.unit);
      return;
    }
    const person = t.closest<HTMLElement>("button[data-person]");
    if (person && this.contains(person)) this.#goPerson(person.dataset.person!, 1);
  };

  /** Pliega o despliega las subunidades; la tarjeta conserva el foco. */
  #toggle(id: string, open: boolean): void {
    this.#morph(() => {
      (open ? this.#opened : this.#folded).add(id);
      (open ? this.#folded : this.#opened).delete(id);
      this.#schedule();
    });
  }

  #onKey = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (t === this.#input) {
      const n = this.#results.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (!n) return;
        e.preventDefault();
        this.#active = (this.#active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        this.#paintResults(this.#query);
      } else if (e.key === "Enter") {
        if (this.#active >= 0) {
          e.preventDefault();
          this.#pick(this.#active);
        }
      } else if (e.key === "Escape" && this.#list && !this.#list.hidden) {
        e.preventDefault();
        this.#closeResults();
      }
      return;
    }
    if (isField(t)) return;
    const view = this.#currentView();
    if ((e.key === "Escape" || e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) && view === "map" && this.#unit) {
      e.preventDefault();
      this.#openUnit(null, -1);
      return;
    }
    if (e.key === "Backspace" && view === "me" && this.#center) {
      e.preventDefault();
      this.#goPerson(null, -1);
      this.#focusStage();
      return;
    }
    // Como en un árbol: → despliega y ← pliega las subunidades de la tarjeta enfocada.
    const card = t.closest<HTMLElement>(".nx-org__ucard");
    const btn = card?.querySelector<HTMLElement>("[data-toggle]");
    if (btn && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const open = e.key === "ArrowRight";
      if ((btn.getAttribute("aria-expanded") === "true") === open) return;
      e.preventDefault();
      this.#toggle(card!.dataset.unit!, open);
    }
  };
}
