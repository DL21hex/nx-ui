/**
 * `<nx-org>`: el organigrama con dos lentes sobre los mismos datos.
 *
 * - **Yo:** una persona en el centro (por defecto, quien mira) con lo que tiene alrededor: su
 *   cadena hacia arriba en una línea, su jefe, quienes comparten jefe y su equipo directo. Para
 *   quien mira, «Para… / Acudes a…»: a quién acude para cada cosa. Si el centro es otra persona,
 *   el camino entre las dos: «Tu jefe común con Ana es Marta Ríos».
 * - **Organización:** la empresa como bloques anidados, de tamaño proporcional a la gente. Al
 *   pulsar un bloque se entra en él (zoom); en una unidad sin subunidades, los bloques son los
 *   cargos, y en un cargo, las personas. «Tú» marca el camino hasta quien mira en todos los niveles,
 *   y una sola cifra a la vez (vacantes, ingresos…) colorea el mapa.
 *
 * Los datos son JSON (BDUI): `units`, `people` y `me`. Para una organización grande, `source`
 * entrega por partes (POST): las personas de una unidad, el entorno de una persona o una búsqueda.
 * Lo que el servidor no deja abrir llega con `locked` y se ve sin poder centrarse en ello.
 *
 * Light DOM: los textos del backend van siempre como texto; los estilos, en `org.css`.
 */
import { Base, attrProps, boolAttr, upgrade } from "../../core/define";
import { h, safeEndpoint, safeHref, safeImageSrc } from "../../core/dom";
import { glyph, initials } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { nxFormat, resolveLocale } from "../../core/locale";
import { moveIndex } from "../../core/nav";
import {
  buildIndex,
  chainOf,
  childOnPath,
  cleanPerson,
  cleanUnit,
  commonBoss,
  directCount,
  groupByTitle,
  matchPerson,
  metricLevels,
  peersOf,
  reportsOf,
  squarify,
  teamSize,
  topWithRest,
  unitCount,
  unitLine,
  unitPath,
  type OrgIndex,
  type Rect,
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
  peers: "Comparten jefe",
  reports: "Equipo directo",
  teamOf: "Equipo de {name}",
  noBoss: "Sin jefe asignado",
  contactsFor: "Para…",
  contactsWho: "Acudes a…",
  more: "+{n}",
  rest: "Otras {n} unidades",
  restTitles: "Otros {n} cargos",
  noTitle: "Sin cargo",
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
  seeMap: "Ver en el mapa",
  seeMe: "Volver a mí",
  up: "Subir un nivel",
  metric: "Color",
  noMetric: "Personas",
  leader: "Líder",
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

/** Bloques por nivel del mapa: más, y los nombres ya no caben. */
const MAX_TILES = 18;
/** Tarjetas de personas antes de «Ver más». */
const PAGE = 48;
/** Compañeros visibles antes del «+n». */
const PEERS = 8;
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

/** Un paso del recorrido del mapa: una unidad, lo que no cupo en una, o un cargo de una unidad. */
type Step = { t: "unit"; id: string } | { t: "rest"; id: string | null; skip: number } | { t: "title"; id: string; title: string };

interface Tile {
  key: string;
  label: string;
  kind?: string;
  value: number;
  /** Intensidad 0–1 del color. */
  level: number;
  you: boolean;
  metric?: string;
  leader?: string;
  preview?: number[];
  go: () => void;
}

let uid = 0;

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const isField = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const fill = (tpl: string, vars: Record<string, string | number>) => tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));

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
  #trail: Step[] = [];
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
  #from: DOMRect | null = null;
  /** Lo que hace cada bloque del mapa pintado, por su clave. */
  #gos = new Map<string, () => void>();
  #dir = 0;
  #size = { w: 0, h: 0 };

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

  /** Las cifras que pueden colorear el mapa: `[{key, label, tone?, per?}]`. */
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

  /** El `id` de la persona que mira: el centro de «Yo» y el «Tú» del mapa. */
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

  /** Abre el mapa en una unidad (`null`: la organización entera). */
  focusUnit(id: string | number | null): void {
    const key = id === null ? null : String(id);
    const sole = this.#soleRoot();
    this.#trail = key
      ? unitPath(this.#index(), key)
          .filter((u) => u.id !== sole)
          .map((u) => ({ t: "unit", id: u.id }) as Step)
      : [];
    this.#page = PAGE;
    this.#setView("map");
    this.#announce(key ? (this.#index().units.get(key)?.name ?? "") : this.#labels.map);
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
        if (Math.abs(w - this.#size.w) > 24) this.#schedule();
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
    const id = view === "me" ? this.center : (this.#trail.at(-1)?.id ?? this.#soleRoot());
    this.dispatchEvent(new CustomEvent("nx-org-focus", { detail: { view, id }, bubbles: true, composed: true }));
  }

  #announce(name: string): void {
    if (this.#live && name) this.#live.textContent = fill(this.#labels.focusChanged, { name });
  }

  #goPerson(id: string | null, dir: number): void {
    const target = id && id !== this.me ? id : null;
    this.#center = target;
    this.#peersOpen = false;
    this.#dir = dir;
    this.#closeResults();
    const who = target ?? this.me;
    if (who) void this.#ensurePerson(who);
    this.#setView("me");
    const p = who ? this.#index().people.get(who) : undefined;
    if (p) this.#announce(p.name);
  }

  #push(step: Step, from?: Element | null): void {
    this.#from = from?.getBoundingClientRect() ?? null;
    this.#dir = 1;
    this.#trail = [...this.#trail, step];
    this.#page = PAGE;
    this.#schedule();
    this.#emitFocus();
  }

  #up(to = this.#trail.length - 1): void {
    if (to < 0 || to >= this.#trail.length) return;
    this.#dir = -1;
    this.#from = null;
    this.#trail = this.#trail.slice(0, to);
    this.#page = PAGE;
    this.#schedule();
    this.#emitFocus();
    const step = this.#trail.at(-1);
    this.#announce(step ? this.#stepName(step) : this.#labels.map);
  }

  /** Con una sola raíz (el grupo), el mapa arranca dentro de ella: un bloque solo no dice nada. */
  #soleRoot(): string | null {
    const roots = this.#index().childUnits.get("") ?? [];
    return roots.length === 1 ? roots[0].id : null;
  }

  #stepName(s: Step): string {
    if (s.t === "title") return s.title;
    if (s.t === "rest") return "…";
    return this.#index().units.get(s.id)?.name ?? s.id;
  }

  // ---------------------------------------------------------------- render

  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected && this.#root) this.#render();
    });
  }

  #render(): void {
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
    const body = view === "map" ? this.#renderMap() : this.#renderMe();
    this.#stage!.replaceChildren(body);
    this.#restoreFocus(focus);
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

    // La cadena hacia arriba, en una línea: del más alto al jefe inmediato.
    const chain = chainOf(ix, id);
    if (chain.length) {
      crumbs.setAttribute("aria-label", L.boss);
      const ol = h("ol", { class: "nx-org__trail" });
      for (const b of [...chain].reverse()) ol.append(h("li", null, this.#personLink(b, "nx-org__crumb")));
      crumbs.append(ol);
    }

    // El camino entre quien mira y el centro.
    if (this.me && id !== this.me) {
      const note = h("div", { class: "nx-org__path" }, h("span", null, this.#pathText(this.me, p)), h("button", { type: "button", class: "nx-org__link", "data-act": "home" }, L.seeMe));
      wrap.append(note);
    }

    const boss = chain[0];
    wrap.append(
      h(
        "section",
        { class: "nx-org__level nx-org__level--boss", "aria-label": L.boss },
        boss ? this.#card(boss, "boss") : p.boss && this.#pending.has(key) ? h("p", { class: "nx-org__muted" }, L.loading) : h("p", { class: "nx-org__muted nx-org__noboss" }, L.noBoss),
      ),
    );

    const center = this.#card(p, "center");
    const peers = peersOf(ix, id).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const mid = h("section", { class: "nx-org__level nx-org__level--center" }, center);
    if (peers.length) {
      const shown = this.#peersOpen ? peers : peers.slice(0, PEERS);
      const ul = h("ul", { class: "nx-org__peers", role: "list" });
      for (const q of shown) ul.append(h("li", null, this.#chip(q)));
      if (peers.length > shown.length) ul.append(h("li", null, h("button", { type: "button", class: "nx-org__chip nx-org__chip--more", "data-act": "peers" }, fill(L.more, { n: peers.length - shown.length }))));
      mid.append(h("div", { class: "nx-org__peerbox" }, h("h3", { class: "nx-org__h" }, `${L.peers} · ${this.#fmtNum(peers.length)}`), ul));
    }
    wrap.append(mid);

    const team = reportsOf(ix, id);
    const expected = directCount(ix, p);
    if (team.length || expected) {
      const sec = h("section", { class: "nx-org__level nx-org__level--team" }, h("h3", { class: "nx-org__h" }, `${L.reports} · ${this.#fmtNum(Math.max(team.length, expected))}`));
      if (team.length) {
        const ul = h("ul", { class: "nx-org__cards", role: "list" });
        for (const q of team.slice(0, this.#page)) ul.append(h("li", null, this.#card(q, "team")));
        sec.append(ul);
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
    return h("span", { class: `${cls} ${cls}--initials`, "aria-hidden": "true" }, initials(p.name));
  }

  /** Una tarjeta de persona. Se centra en ella al pulsarla, salvo que esté `locked` o ya sea el centro. */
  #card(p: OrgPerson, role: "boss" | "center" | "team"): HTMLElement {
    const L = this.#labels;
    const ix = this.#index();
    const team = teamSize(ix, p);
    const direct = directCount(ix, p);
    const line = unitLine(ix, p.unit);
    const isMe = p.id === this.me;
    const body = [
      this.#avatar(p),
      h(
        "span",
        { class: "nx-org__who" },
        h("span", { class: "nx-org__name" }, p.name, isMe && role !== "center" ? h("span", { class: "nx-org__you" }, L.you) : null),
        p.title ? h("span", { class: "nx-org__title" }, p.title) : null,
        line ? h("span", { class: "nx-org__unit" }, line) : null,
        direct || team ? h("span", { class: "nx-org__span" }, this.#spanText(direct, team)) : null,
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

  #chip(p: OrgPerson): HTMLElement {
    const body = [this.#avatar(p, "nx-org__mini"), h("span", { class: "nx-org__chip-name" }, p.name)];
    const title = p.title ? `${p.name} · ${p.title}` : p.name;
    if (p.locked || p.id === this.center) return h("span", { class: "nx-org__chip", title }, ...body);
    return h("button", { type: "button", class: "nx-org__chip", "data-person": p.id, title }, ...body);
  }

  #personLink(p: OrgPerson, cls: string): HTMLElement {
    const text = [h("span", { class: "nx-org__crumb-name" }, p.name), p.title ? h("span", { class: "nx-org__crumb-title" }, p.title) : null];
    if (p.locked) return h("span", { class: cls }, ...text);
    return h("button", { type: "button", class: cls, "data-person": p.id }, ...text);
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
    const L = this.#labels;
    const ix = this.#index();
    const wrap = h("div", { class: "nx-org__map" });
    const step = this.#trail.at(-1);
    this.#renderTrail();

    const me = this.me ? ix.people.get(this.me) : undefined;
    const myUnit = me?.unit ?? null;

    // En un cargo: las personas.
    if (step?.t === "title") {
      const groups = groupByTitle(ix.members.get(step.id) ?? [], L.noTitle);
      const people = groups.find((g) => g.title === step.title)?.people ?? [];
      wrap.append(this.#peopleGrid(people, step.title));
      return wrap;
    }

    const unitId = step ? step.id : this.#soleRoot();
    const unit = unitId ? ix.units.get(unitId) : undefined;
    const children = ix.childUnits.get(unitId ?? "") ?? [];

    let tiles: Tile[] = [];
    let pinned: string | null = null;
    if (children.length) {
      pinned = childOnPath(ix, unitId, myUnit);
      const skip = step?.t === "rest" ? step.skip : 0;
      const ordered = [...children].sort((a, b) => unitCount(ix, b) - unitCount(ix, a) || a.name.localeCompare(b.name, "es"));
      const pool = ordered.slice(skip);
      const { shown, rest, restValue } = topWithRest(pool, (u) => unitCount(ix, u), MAX_TILES);
      const metric = this.#metricDef();
      const total = Math.max(1, ...shown.map((s) => s.value));
      const levels = metricLevels(ix, shown.map((s) => s.item), metric);
      tiles = shown.map(({ item: u, value }) => {
        const m = metric ? u.metrics?.[metric.key] : undefined;
        const leader = u.leader ? ix.people.get(u.leader) : undefined;
        const kids = ix.childUnits.get(u.id) ?? [];
        return {
          key: u.id,
          label: u.name,
          kind: u.kind,
          value,
          level: metric ? (levels.get(u.id) ?? 0) : value / total,
          you: pinned === u.id || (!!myUnit && myUnit === u.id),
          metric: metric && typeof m === "number" ? `${metric.label}: ${this.#fmtNum(m)}` : undefined,
          leader: leader ? `${L.leader}: ${leader.name}` : undefined,
          preview: kids.length > 1 ? kids.map((k) => unitCount(ix, k)).sort((a, b) => b - a).slice(0, 12) : undefined,
          go: () => {
            const el = this.querySelector(`[data-tile="${CSS.escape(u.id)}"]`);
            this.#push({ t: "unit", id: u.id }, el);
            if (!(ix.childUnits.get(u.id) ?? []).length) void this.#ensureUnit(u.id);
          },
        };
      });
      if (rest.length) {
        const where = unitId;
        const nextSkip = skip + shown.length;
        tiles.push({
          key: "#rest",
          label: fill(L.rest, { n: this.#fmtNum(rest.length) }),
          value: Math.max(restValue, (shown.at(-1)?.value ?? 1) * 1.5),
          level: 0,
          you: !!pinned && rest.some((u) => u.id === pinned),
          go: () => this.#push({ t: "rest", id: where, skip: nextSkip }, this.querySelector('[data-tile="#rest"]')),
        });
      }
    } else if (unitId) {
      // Una unidad sin subunidades: sus cargos.
      const key = `u:${unitId}`;
      // Las que ya se ven pueden ser solo las del entorno de alguien: se piden todas, una vez.
      if (!this.#failed.has(key)) void this.#ensureUnit(unitId);
      const members = this.#index().members.get(unitId) ?? [];
      if (!members.length || this.#pending.has(key)) {
        wrap.append(this.#status(key, () => void this.#ensureUnit(unitId)));
        return wrap;
      }
      const groups = groupByTitle(members, L.noTitle);
      const myTitle = me && me.unit === unitId ? me.title?.trim() || L.noTitle : null;
      if (groups.length <= 1) {
        wrap.append(this.#peopleGrid(members, unit?.name ?? ""));
        return wrap;
      }
      const { shown, rest } = topWithRest(groups, (g) => g.people.length, MAX_TILES);
      const total = Math.max(1, ...shown.map((s) => s.value));
      tiles = shown.map(({ item: g, value }) => ({
        key: `t:${g.title}`,
        label: g.title,
        value,
        level: value / total,
        you: g.title === myTitle,
        go: () => this.#push({ t: "title", id: unitId, title: g.title }, this.querySelector(`[data-tile="${CSS.escape(`t:${g.title}`)}"]`)),
      }));
      if (rest.length) {
        const people = rest.flatMap((g) => g.people);
        wrap.append(this.#tiles(tiles), this.#peopleGrid(people, fill(L.restTitles, { n: this.#fmtNum(rest.length) })));
        return wrap;
      }
    }

    if (tiles.length) wrap.append(this.#tiles(tiles));
    else wrap.append(h("p", { class: "nx-org__empty" }, L.empty));

    // Quienes están directamente en una unidad con subunidades (la gerencia de una empresa).
    if (unitId && children.length && step?.t !== "rest") {
      const direct = ix.members.get(unitId) ?? [];
      if (direct.length) wrap.append(this.#peopleGrid(direct, fill(L.peopleIn, { name: unit?.name ?? "" })));
    }
    return wrap;
  }

  #renderTrail(): void {
    const L = this.#labels;
    const crumbs = this.#crumbs!;
    crumbs.setAttribute("aria-label", L.map);
    const ol = h("ol", { class: "nx-org__trail" });
    const steps = this.#trail;
    const sole = this.#soleRoot();
    const items: { label: string; to: number }[] = [{ label: (sole && this.#index().units.get(sole)?.name) || L.map, to: 0 }];
    steps.forEach((s, i) => items.push({ label: this.#stepName(s), to: i + 1 }));
    items.forEach((it, i) => {
      const last = i === items.length - 1;
      ol.append(h("li", null, last ? h("span", { class: "nx-org__crumb", "aria-current": "page" }, it.label) : h("button", { type: "button", class: "nx-org__crumb", "data-to": it.to }, it.label)));
    });
    crumbs.replaceChildren(ol);
  }

  #tiles(tiles: Tile[]): HTMLElement {
    const L = this.#labels;
    const box = h("div", { class: "nx-org__tiles" });
    // El ancho real decide la forma: apaisado en el escritorio, alto en el celular.
    const w = this.#stage?.clientWidth || 960;
    const hgt = Math.round(Math.min(Math.max(w * (w < 560 ? 1.25 : 0.56), 320), 640));
    this.#size = { w, h: hgt };
    box.style.blockSize = `${hgt}px`;
    const rects = squarify(
      tiles.map((t) => t.value),
      { x: 0, y: 0, w, h: hgt },
    );
    const metric = this.#metricDef();
    if (metric?.tone && metric.tone !== "accent") box.dataset.tone = metric.tone;
    this.#gos = new Map(tiles.map((t) => [t.key, t.go]));
    tiles.forEach((t, i) => {
      const r = rects[i];
      if (!r.w || !r.h) return;
      const size = r.w < 76 || r.h < 46 ? "xs" : r.w < 150 || r.h < 92 ? "sm" : "lg";
      const count = t.key.startsWith("#") ? "" : this.#fmtCount(t.value);
      const btn = h(
        "button",
        {
          type: "button",
          class: `nx-org__tile is-${size}${t.you ? " is-you" : ""}${t.key === "#rest" ? " is-rest" : ""}`,
          "data-tile": t.key,
          "aria-label": [t.kind, t.label, count, t.metric, t.you ? L.you : ""].filter(Boolean).join(", "),
          title: size === "xs" ? [t.label, count].filter(Boolean).join(" · ") : null,
          style: `left:${(r.x / w) * 100}%;top:${(r.y / hgt) * 100}%;width:${(r.w / w) * 100}%;height:${(r.h / hgt) * 100}%;--i:${t.level.toFixed(3)}`,
        },
        t.kind && size === "lg" ? h("span", { class: "nx-org__kind" }, t.kind) : null,
        size !== "xs" ? h("span", { class: "nx-org__tile-name" }, t.label) : null,
        count && size !== "xs" ? h("span", { class: "nx-org__count" }, count) : null,
        t.metric && size === "lg" ? h("span", { class: "nx-org__tile-metric" }, t.metric) : null,
        t.leader && size === "lg" ? h("span", { class: "nx-org__tile-leader" }, t.leader) : null,
        t.you ? h("span", { class: "nx-org__you", "aria-hidden": "true" }, L.you) : null,
        t.preview && size === "lg" && r.h > 150 && r.w > 200 ? this.#preview(t.preview) : null,
      );
      box.append(btn);
    });
    return box;
  }

  /** Las subunidades de un bloque grande, en miniatura, para leer su forma sin entrar. */
  #preview(values: number[]): HTMLElement {
    const box = h("span", { class: "nx-org__preview", "aria-hidden": "true" });
    const rects: Rect[] = squarify(values, { x: 0, y: 0, w: 100, h: 100 });
    for (const r of rects) if (r.w && r.h) box.append(h("span", { class: "nx-org__cell", style: `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%` }));
    return box;
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

  /** Entrar: el contenido nuevo crece desde el bloque pulsado. Salir: se acerca un poco. */
  #animate(el: HTMLElement): void {
    const from = this.#from;
    const dir = this.#dir;
    this.#from = null;
    this.#dir = 0;
    if (!dir || reduced() || typeof el.animate !== "function") return;
    const to = el.getBoundingClientRect();
    if (from && to.width && to.height) {
      const sx = from.width / to.width;
      const sy = from.height / to.height;
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      el.animate([{ transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0.4 }, { transformOrigin: "0 0", transform: "none", opacity: 1 }], { duration: 320, easing: EASE });
      return;
    }
    el.animate([{ transform: `scale(${dir > 0 ? 0.97 : 1.03})`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 220, easing: EASE });
  }

  #focusSnapshot(): string | null {
    const a = document.activeElement;
    if (!(a instanceof HTMLElement) || !this.#stage?.contains(a)) return null;
    return a.dataset.tile ? `[data-tile="${CSS.escape(a.dataset.tile)}"]` : a.dataset.person ? `[data-person="${CSS.escape(a.dataset.person)}"]` : a.dataset.act ? `[data-act="${a.dataset.act}"]` : null;
  }

  #restoreFocus(sel: string | null): void {
    if (!sel) return;
    this.#stage!.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
  }

  /** Tras cambiar de foco con el teclado, el primer elemento útil del escenario. */
  #focusStage(): void {
    queueMicrotask(() =>
      queueMicrotask(() => {
        const first = this.#stage?.querySelector<HTMLElement>(".nx-org__tile, .nx-org__person--center, button.nx-org__person, .nx-org__empty");
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
    const tile = t.closest<HTMLElement>("[data-tile]");
    if (tile && this.contains(tile)) {
      this.#tileGo(tile.dataset.tile!);
      return;
    }
    const crumb = t.closest<HTMLElement>("[data-to]");
    if (crumb) {
      this.#up(Number(crumb.dataset.to));
      return;
    }
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    if (act === "home") return this.#goPerson(null, -1);
    if (act === "peers") {
      this.#peersOpen = true;
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

  #tileGo(key: string): void {
    const el = this.querySelector<HTMLElement>(`[data-tile="${CSS.escape(key)}"]`);
    this.#gos.get(key)?.();
    const name = el?.querySelector(".nx-org__tile-name")?.textContent;
    if (name) this.#announce(name);
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
    if ((e.key === "Escape" || e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) && view === "map" && this.#trail.length) {
      e.preventDefault();
      this.#up();
      this.#focusStage();
      return;
    }
    if (e.key === "Backspace" && view === "me" && this.#center) {
      e.preventDefault();
      this.#goPerson(null, -1);
      this.#focusStage();
      return;
    }
    // Flechas entre bloques, por geometría.
    if (t.matches(".nx-org__tile")) {
      const tiles = [...this.querySelectorAll<HTMLElement>(".nx-org__tile")];
      const boxes = tiles.map((el) => ({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }));
      const next = moveIndex(boxes, tiles.indexOf(t), e.key);
      if (next !== null) {
        e.preventDefault();
        tiles[next]?.focus();
      }
    }
  };
}
