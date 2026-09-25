/**
 * `<nx-history>`: la máquina del tiempo de un registro. Una línea de tiempo agrupada por día
 * («Hoy», «Ayer», «lunes 21 de septiembre») con quién hizo qué: «Estado: Pendiente → Aprobado»,
 * montos con su formato y, en los textos largos, qué palabras se quitaron y cuáles se agregaron.
 *
 * Al lado, un deslizador recorre los eventos y muestra el registro como estaba en ese momento
 * (reconstruido desde el de hoy, deshaciendo los cambios posteriores), con lo que cambió desde
 * entonces marcado. Se filtra por persona y por campo, se busca, se comenta, y un cambio que sigue
 * vigente se revierte con un clic: se aplica al instante, se puede deshacer mientras corre el
 * tiempo, y la app lo registra en el backend cuando llega `nx-history-commit`.
 *
 * Todo es JSON: `record` (hoy), `fields` y `events`, o `source`, una URL que los devuelve y pagina
 * hacia atrás con `?before=<id>` cuando se llega al final.
 */
import { Base } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph, initials } from "../../core/icons";
import { nxFormat, resolveLocale } from "../../core/locale";
import { nxToast } from "../toast/toast";
import "../toast/index";
import { canRevert, changedKeys, cleanEvents, cleanFields, cleanRecord, dayLabel, filterEvents, groupByDay, isLongText, mergeEvents, relTime, revertChange, revertedKeys, stampText, stateAt, tally, valueText, wordDiff, type HistoryFilter } from "./logic";
import type { HistoryActor, HistoryChange, HistoryEvent, HistoryField, HistoryLabels, HistoryPage, HistoryValue } from "./types";

export const HISTORY_LABELS: HistoryLabels = {
  heading: "Historial",
  search: "Buscar en el historial",
  people: "Personas",
  fields: "Campos",
  today: "Hoy",
  yesterday: "Ayer",
  create: "creó el registro",
  update: "actualizó",
  delete: "eliminó el registro",
  comment: "comentó",
  status: "cambió el estado",
  reverted: "Revertido",
  revertVerb: "revirtió un cambio",
  revert: "Revertir",
  revertLabel: "Revertir {field} a {value}",
  revertDone: "{field} vuelve a {value}",
  note: "Agregar una nota…",
  send: "Comentar",
  travel: "Viaje en el tiempo",
  asOf: "Así estaba el {date}",
  now: "Así está ahora",
  present: "Volver al presente",
  nowValue: "Ahora: {value}",
  jump: "Ver cómo estaba · {time}",
  step: "{i} de {n}",
  more: "Cargar anteriores",
  loading: "Cargando historial…",
  error: "No se pudo cargar el historial.",
  retry: "Reintentar",
  empty: "Todavía no hay cambios.",
  noMatch: "Nada coincide con los filtros.",
  clear: "Quitar filtros",
  you: "Tú",
};

const UNDO = '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>';
const CLOCK = '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>';
const PROPS = ["record", "fields", "events", "labels", "user", "source", "heading", "undo"] as const;
const JSON_ATTRS = ["record", "fields", "events", "labels", "user"];

let uid = 0;
type Outcome = "commit" | "undo" | "cancel";

export class NxHistory extends Base {
  static observedAttributes = [...JSON_ATTRS, "source", "heading", "locale"];

  #uid = `nx-history${++uid}`;
  #record: Record<string, HistoryValue> = {};
  #fields: HistoryField[] = [];
  #events: HistoryEvent[] = [];
  #labels: HistoryLabels = HISTORY_LABELS;
  #user: HistoryActor | null = null;
  /** El evento que se está viendo en el tiempo (índice en `#events`), o -1: el presente. */
  #at = -1;
  #flt: HistoryFilter = {};
  /** Reversiones que esperan su tiempo de deshacer. */
  #pending = new Set<string>();
  #more = false;
  #loading = false;
  #failed = false;
  #abort?: AbortController;
  #io?: IntersectionObserver;
  #built = false;
  // Nodos.
  #title?: HTMLElement;
  #search?: HTMLInputElement;
  #chips?: HTMLElement;
  #main?: HTMLElement;
  #feed?: HTMLOListElement;
  #foot?: HTMLElement;
  #panel?: HTMLElement;
  #range?: HTMLInputElement;

  // ---------------------------------------------------------------- propiedades

  /** El registro como está hoy. */
  get record(): Record<string, HistoryValue> {
    return { ...this.#record };
  }
  set record(v: Record<string, unknown> | null | undefined) {
    this.#record = cleanRecord(v);
    this.#paint();
  }
  /** Los campos: cómo se llaman y cómo se muestran (sin ellos, las claves del registro). */
  get fields(): HistoryField[] {
    return this.#fields;
  }
  set fields(v: HistoryField[] | null | undefined) {
    this.#fields = cleanFields(v);
    this.#paint();
  }
  /** Los eventos, del más viejo al más nuevo (se ordenan solos). */
  get events(): HistoryEvent[] {
    return this.#events;
  }
  set events(v: HistoryEvent[] | null | undefined) {
    this.#events = cleanEvents(v);
    this.#at = -1;
    this.#paint();
  }
  /** Quién comenta y revierte desde aquí (sin él, «Tú»). */
  get user(): HistoryActor | null {
    return this.#user;
  }
  set user(v: HistoryActor | null | undefined) {
    this.#user = v && typeof v.name === "string" && v.name.trim() ? { name: v.name, avatar: typeof v.avatar === "string" ? v.avatar : undefined } : null;
  }
  /** URL que devuelve `{events, record?, more?}`; con `?before=<id>`, la página anterior. */
  get source(): string | null {
    return this.getAttribute("source");
  }
  set source(v: string | null) {
    if (v) this.setAttribute("source", v);
    else this.removeAttribute("source");
  }
  get heading(): string {
    return this.getAttribute("heading") ?? this.#labels.heading;
  }
  set heading(v: string) {
    this.setAttribute("heading", v);
  }
  /** Milisegundos para deshacer una reversión (7000). `0`: se registra al instante, sin aviso. */
  get undo(): number {
    const n = Number(this.getAttribute("undo"));
    return this.hasAttribute("undo") && Number.isFinite(n) && n >= 0 ? n : 7000;
  }
  set undo(v: number) {
    this.setAttribute("undo", String(v));
  }
  get labels(): HistoryLabels {
    return this.#labels;
  }
  set labels(v: Partial<HistoryLabels> | null | undefined) {
    this.#labels = { ...HISTORY_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }
  /** El `id` del evento que se está viendo en el tiempo, o `null` en el presente. */
  get at(): string | null {
    return this.#events[this.#at]?.id ?? null;
  }
  /** El registro como estaba en el momento que se está viendo. */
  get snapshot(): Record<string, HistoryValue> {
    return this.#at < 0 ? this.record : stateAt(this.#record, this.#events, this.#at);
  }

  // ---------------------------------------------------------------- API

  /** Viaja al momento justo después del evento `id` (`null`: vuelve al presente). */
  travel(id: string | null): void {
    const i = id === null ? -1 : this.#events.findIndex((e) => e.id === id);
    if (id !== null && i < 0) return;
    this.#at = i >= this.#events.length - 1 ? -1 : i;
    this.#paintTravel(true);
    this.dispatchEvent(new CustomEvent("nx-history-travel", { detail: { id: this.at, record: this.snapshot }, bubbles: true, composed: true }));
  }

  /** Agrega una nota: `nx-history-comment` (cancelable) y aparece al instante. */
  comment(text: string): boolean {
    const t = text.trim();
    if (!t || !this.dispatchEvent(new CustomEvent("nx-history-comment", { detail: { text: t }, bubbles: true, composed: true, cancelable: true }))) return false;
    this.#events = mergeEvents(this.#events, [{ id: `${this.#uid}-${Date.now()}`, at: new Date().toISOString(), actor: this.#me(), action: "comment", note: t }]);
    this.#paint();
    return true;
  }

  /**
   * Revierte el cambio de `field` en el evento `id`: `nx-history-revert` (cancelable), el registro
   * vuelve al valor anterior con un evento que lo cuenta y, al acabar el tiempo de deshacer,
   * `nx-history-commit`. La promesa dice cómo terminó.
   */
  async revert(id: string, field: string): Promise<Outcome> {
    const event = this.#events.find((e) => e.id === id);
    const change = event?.changes?.find((c) => c.field === field);
    if (!event || !change || !canRevert(this.#record, event, change)) return "cancel";
    const detail = { event, change };
    if (!this.dispatchEvent(new CustomEvent("nx-history-revert", { detail, bubbles: true, composed: true, cancelable: true }))) return "cancel";
    const was = this.#record[field] ?? null;
    const r = revertChange(this.#record, event, change, this.#me(), new Date());
    this.#record = r.record;
    this.#events = mergeEvents(this.#events, [r.event]);
    this.#pending.add(r.event.id);
    this.#paint();
    const f = this.#field(field);
    const L = this.#labels;
    const result = this.undo ? await nxToast({ message: L.revertDone.replace("{field}", f?.label ?? field).replace("{value}", valueText(f, change.from, this.#fmt())), undo: true, duration: this.undo, tone: "success" }) : "timeout";
    this.#pending.delete(r.event.id);
    if (result === "undo") {
      this.#record = { ...this.#record, [field]: was };
      this.#events = this.#events.filter((e) => e !== r.event);
      this.#paint();
      return "undo";
    }
    this.#paint();
    this.dispatchEvent(new CustomEvent("nx-history-commit", { detail: { ...detail, revert: r.event, record: this.record }, bubbles: true, composed: true }));
    return "commit";
  }

  /** Vuelve a pedir `source` desde el principio. */
  reload(): void {
    this.#events = [];
    this.#at = -1;
    void this.#load();
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
    if (this.source && !this.#events.length && !this.#loading) void this.#load();
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#loading = false;
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (JSON_ATTRS.includes(name) && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-history] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    // Antes de conectarse no se pide nada: lo hace `connectedCallback`.
    if (name === "source" && value && value !== old && this.#built && this.isConnected) return this.reload();
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #fmt() {
    return nxFormat(resolveLocale(this));
  }
  #me(): HistoryActor {
    return this.#user ?? { name: this.#labels.you };
  }
  /** Los campos declarados, o las claves del registro tal cual. */
  #keys(): HistoryField[] {
    return this.#fields.length ? this.#fields : Object.keys(this.#record).map((key) => ({ key, label: key }));
  }
  #field(key: string): HistoryField | undefined {
    return this.#fields.find((f) => f.key === key);
  }
  #verb(e: HistoryEvent): string {
    return e.revertOf ? this.#labels.revertVerb : this.#labels[e.action];
  }

  async #load(more = false): Promise<void> {
    const src = this.source;
    if (!src || (more && this.#loading)) return;
    this.#abort?.abort();
    const ac = (this.#abort = new AbortController());
    this.#loading = true;
    this.#failed = false;
    this.#paintFoot();
    const oldest = more ? this.#events[0]?.id : undefined;
    try {
      const res = await fetch(oldest ? `${src}${src.includes("?") ? "&" : "?"}before=${encodeURIComponent(oldest)}` : src, { headers: { Accept: "application/json" }, signal: ac.signal });
      if (!res.ok) throw res.status;
      const data = (await res.json()) as HistoryPage | HistoryEvent[];
      const page: HistoryPage = Array.isArray(data) ? { events: data } : (data ?? { events: [] });
      const evs = cleanEvents(page.events);
      if (page.record && !Object.keys(this.#record).length) this.#record = cleanRecord(page.record);
      const n = this.#events.length;
      this.#events = mergeEvents(this.#events, evs);
      // Lo que llega es más viejo: el momento que se está viendo se corre con él.
      if (this.#at >= 0) this.#at += this.#events.length - n;
      this.#more = page.more ?? evs.length > 0;
    } catch {
      if (ac.signal.aborted) return;
      this.#failed = true;
    }
    this.#loading = false;
    this.#paint();
  }

  #build(): void {
    this.#built = true;
    this.setAttribute("role", "region");
    this.#title = h("h2", { class: "nx-history__title" });
    this.#search = h("input", { type: "search", class: "nx-history__q", autocomplete: "off" });
    this.#chips = h("div", { class: "nx-history__chips" });
    this.#feed = h("ol", { class: "nx-history__feed" });
    this.#foot = h("div", { class: "nx-history__foot" });
    const note = h("textarea", { class: "nx-history__note-in", rows: "1" });
    this.#main = h(
      "div",
      { class: "nx-history__main" },
      h("form", { class: "nx-history__compose" }, h("span", { class: "nx-history__me" }), note, h("button", { type: "submit", class: "nx-history__send" })),
      this.#feed,
      this.#foot,
    );
    this.#range = h("input", { type: "range", class: "nx-history__range", min: "0", step: "1" });
    this.#panel = h(
      "aside",
      { class: "nx-history__panel", "aria-labelledby": `${this.#uid}-t` },
      h("p", { class: "nx-history__eyebrow" }, glyph(CLOCK), h("span")),
      h("h3", { class: "nx-history__asof", id: `${this.#uid}-t` }),
      h("p", { class: "nx-history__who" }),
      h("div", { class: "nx-history__ticks", "aria-hidden": "true" }),
      this.#range,
      h("button", { type: "button", class: "nx-history__present", "data-act": "present" }, glyph(UNDO), h("span")),
      h("dl", { class: "nx-history__state" }),
    );
    this.append(
      h("header", { class: "nx-history__head" }, this.#title, h("label", { class: "nx-history__search" }, glyph("search"), this.#search), this.#chips),
      h("div", { class: "nx-history__cols" }, this.#main, this.#panel),
    );

    this.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button");
      if (!b || !this.contains(b)) return;
      const d = b.dataset;
      if (d.jump) this.travel(this.#events[Number(d.jump)]?.id ?? null);
      else if (d.act === "present") this.travel(null), this.#range!.focus();
      else if (d.revert) void this.revert(d.revert, d.field!);
      else if (d.filter) {
        const k = d.filter as "actor" | "field";
        this.#flt[k] = this.#flt[k] === d.v ? null : d.v;
        this.#paint();
      } else if (d.act === "clear") {
        this.#flt = {};
        this.#search!.value = "";
        this.#paint();
        this.#search!.focus();
      } else if (d.act === "more") void this.#load(true);
      else if (d.act === "retry") void this.#load(this.#events.length > 0);
    });
    this.#search.addEventListener("input", () => {
      this.#flt.query = this.#search!.value;
      this.#paintFeed();
    });
    this.#range.addEventListener("input", () => {
      const i = Number(this.#range!.value);
      this.travel(this.#events[i]?.id ?? null);
    });
    this.#range.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.#at >= 0) e.preventDefault(), this.travel(null);
    });
    const form = this.#main.firstElementChild as HTMLFormElement;
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      if (this.comment(note.value)) (note.value = ""), (note.style.height = "");
    });
    note.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) e.preventDefault(), form.requestSubmit();
    });
    // La caja crece con lo que se escribe.
    note.addEventListener("input", () => {
      note.style.height = "";
      note.style.height = `${note.scrollHeight}px`;
    });
    // Al llegar al final, la página anterior (el botón queda para el teclado).
    if (typeof IntersectionObserver !== "undefined") this.#io = new IntersectionObserver((es) => es.some((x) => x.isIntersecting) && this.#more && void this.#load(true), { root: this.#main, rootMargin: "120px" });
  }

  // ---------------------------------------------------------------- pintado

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    // El foco vuelve a lo mismo después de volver a pintar (o al evento, si su botón ya no está).
    const k = (document.activeElement as HTMLElement | null)?.closest?.("[data-k]")?.getAttribute("data-k");
    this.setAttribute("aria-label", this.heading);
    this.#title!.textContent = this.heading;
    this.#search!.setAttribute("aria-label", L.search);
    this.#search!.placeholder = L.search;
    const [me, note, send] = this.#main!.firstElementChild!.children as unknown as HTMLElement[];
    me.replaceChildren(this.#avatar(this.#me()));
    note.setAttribute("aria-label", L.note);
    note.setAttribute("placeholder", L.note);
    send.textContent = L.send;
    this.#range!.setAttribute("aria-label", L.travel);
    this.#panel!.querySelector(".nx-history__eyebrow > :last-child")!.textContent = L.travel;
    this.#panel!.querySelector(".nx-history__present > :last-child")!.textContent = L.present;
    this.#paintChips();
    this.#paintFeed();
    if (k && this.contains(document.activeElement) === false) {
      const [kind, id] = k.split("|");
      const q = (x: string) => this.querySelector<HTMLElement>(`[data-k="${CSS.escape(x)}"]`);
      (q(k) ?? (kind === "r" ? q(`j|${id}`) : null))?.focus({ preventScroll: true });
    }
  }

  #avatar(a: HistoryActor): HTMLElement {
    const src = safeHref(a.avatar);
    let hue = 0;
    for (const c of a.name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
    return h("span", { class: "nx-history__avatar", "aria-hidden": "true", style: `--h:${hue}` }, src ? h("img", { src, alt: "" }) : initials(a.name));
  }

  #paintChips(): void {
    const L = this.#labels;
    const { actors, fields } = tally(this.#events);
    const n = this.#fmt().number;
    const group = (label: string, kind: "actor" | "field", rows: [string, string, number, HistoryActor?][]) =>
      rows.length > 1
        ? h(
            "div",
            { class: "nx-history__group", role: "group", "aria-label": label },
            ...rows.map(([v, text, c, a]) => h("button", { type: "button", class: "nx-history__chip", "data-k": `${kind}|${v}`, "data-filter": kind, "data-v": v, "aria-pressed": String(this.#flt[kind] === v) }, a ? this.#avatar(a) : null, text, h("span", { class: "nx-history__n" }, n(c)))),
          )
        : "";
    this.#chips!.replaceChildren(
      group(L.people, "actor", [...actors].map(([name, c]) => [name, name, c, this.#events.find((e) => e.actor.name === name)!.actor])),
      group(
        L.fields,
        "field",
        this.#keys()
          .filter((f) => fields.has(f.key))
          .map((f) => [f.key, f.label, fields.get(f.key)!]),
      ),
    );
  }

  #paintFeed(): void {
    const L = this.#labels;
    const loc = resolveLocale(this);
    const now = new Date();
    const idx = new Map(this.#events.map((e, i) => [e, i]));
    const rev = revertedKeys(this.#events);
    const shown = filterEvents(this.#events, this.#flt, this.#fields, this.#fmt());
    this.#feed!.setAttribute("aria-label", this.heading);
    this.#feed!.replaceChildren(
      ...groupByDay(shown).map((g) => h("li", { class: "nx-history__day" }, h("h3", null, dayLabel(new Date(g[0].at), now, loc, L.today, L.yesterday)), h("ol", null, ...g.map((e) => this.#item(e, idx.get(e)!, rev, now, loc))))),
    );
    const filtered = !!(this.#flt.actor || this.#flt.field || this.#flt.query?.trim());
    this.#feed!.hidden = !shown.length;
    this.#foot!.dataset.empty = !shown.length && !this.#loading ? (filtered ? "filter" : "none") : "";
    this.#paintFoot();
    this.#paintTravel();
  }

  #paintFoot(): void {
    const L = this.#labels;
    const foot = this.#foot!;
    const empty = foot.dataset.empty;
    this.#feed!.setAttribute("aria-busy", String(this.#loading));
    this.#io?.disconnect();
    let more: HTMLElement | null = null;
    foot.replaceChildren(
      this.#loading
        ? h("div", { class: "nx-history__skel", role: "status" }, h("span", { class: "nx-history__vh" }, L.loading), ...[0, 1, 2].map(() => h("i", { "aria-hidden": "true" })))
        : this.#failed
          ? h("p", { class: "nx-history__msg", role: "alert" }, L.error, " ", h("button", { type: "button", class: "nx-history__link", "data-act": "retry" }, L.retry))
          : empty
            ? h("p", { class: "nx-history__msg" }, empty === "filter" ? L.noMatch : L.empty, " ", empty === "filter" ? h("button", { type: "button", class: "nx-history__link", "data-act": "clear" }, L.clear) : null)
            : this.#more
              ? (more = h("button", { type: "button", class: "nx-history__more", "data-act": "more", "data-k": "more" }, L.more))
              : "",
    );
    if (more) this.#io?.observe(more);
  }

  #item(e: HistoryEvent, i: number, rev: Set<string>, now: Date, loc: string): HTMLLIElement {
    const L = this.#labels;
    const d = new Date(e.at);
    const stamp = stampText(d, loc);
    return h(
      "li",
      { class: "nx-history__ev", "data-i": i, "data-action": e.revertOf ? "revert" : e.action, "data-pending": this.#pending.has(e.id) ? "" : null },
      this.#avatar(e.actor),
      h(
        "div",
        { class: "nx-history__card" },
        h(
          "p",
          { class: "nx-history__line" },
          h("strong", null, e.actor.name),
          ` ${this.#verb(e)} `,
          h("button", { type: "button", class: "nx-history__when", "data-jump": i, "data-k": `j|${e.id}`, "aria-label": L.jump.replace("{time}", stamp) }, h("time", { datetime: e.at, title: stamp }, relTime(d, now, loc))),
        ),
        e.changes ? h("ul", { class: "nx-history__changes" }, ...e.changes.map((c) => this.#change(e, c, rev.has(`${e.id}|${c.field}`)))) : null,
        e.note ? h("p", { class: "nx-history__note" }, e.note) : null,
      ),
    );
  }

  #val(f: HistoryField | undefined, v: HistoryValue, old = false): HTMLElement {
    const opt = f?.options?.find((o) => o.value === String(v));
    return h("span", { class: "nx-history__val", "data-old": old ? "" : null, "data-tone": opt ? (opt.tone ?? "neutral") : null }, valueText(f, v, this.#fmt()));
  }

  #change(e: HistoryEvent, c: HistoryChange, reverted: boolean): HTMLLIElement {
    const L = this.#labels;
    const f = this.#field(c.field);
    const label = f?.label ?? c.field;
    const fresh = c.from === null || c.from === "";
    const ok = !reverted && !this.#pending.has(e.id) && canRevert(this.#record, e, c);
    return h(
      "li",
      { "data-reverted": reverted ? "" : null },
      h("span", { class: "nx-history__field" }, label),
      isLongText(f, c)
        ? h("p", { class: "nx-history__diff" }, ...wordDiff(String(c.from ?? ""), String(c.to ?? "")).map((p) => (p.op === "=" ? p.text : h(p.op === "-" ? "del" : "ins", null, p.text))))
        : h("span", { class: "nx-history__fromto" }, fresh ? null : this.#val(f, c.from, true), fresh ? null : h("span", { class: "nx-history__arrow" }, "→"), this.#val(f, c.to)),
      reverted ? h("span", { class: "nx-history__tag" }, L.reverted) : null,
      ok
        ? h(
            "button",
            { type: "button", class: "nx-history__revert", "data-revert": e.id, "data-field": c.field, "data-k": `r|${e.id}|${c.field}`, "aria-label": L.revertLabel.replace("{field}", label).replace("{value}", valueText(f, c.from, this.#fmt())) },
            glyph(UNDO),
            h("span", null, L.revert),
          )
        : null,
    );
  }

  /** El panel del tiempo y las marcas en la línea (sin volver a pintar la lista). */
  #paintTravel(scroll = false): void {
    const L = this.#labels;
    const evs = this.#events;
    const n = evs.length;
    if (this.#at >= n - 1) this.#at = -1;
    const past = this.#at >= 0;
    const i = past ? this.#at : n - 1;
    const e = evs[i];
    const loc = resolveLocale(this);
    const fmt = this.#fmt();
    const then = past ? stateAt(this.#record, evs, i) : this.#record;
    const keys = this.#keys();
    const changed = new Set(changedKeys(then, this.#record, keys.map((f) => f.key)));
    const hit = new Set((e?.changes ?? []).map((c) => c.field));
    const stamp = e ? stampText(new Date(e.at), loc) : "";
    const panel = this.#panel!;
    const range = this.#range!;
    range.max = String(Math.max(0, n - 1));
    range.value = String(i);
    range.disabled = n < 2;
    range.style.setProperty("--p", `${n > 1 ? (i / (n - 1)) * 100 : 100}%`);
    const step = L.step.replace("{i}", String(i + 1)).replace("{n}", String(n));
    range.setAttribute("aria-valuetext", e ? `${stamp} · ${e.actor.name} ${this.#verb(e)} · ${step}` : L.empty);
    this.toggleAttribute("data-past", past);
    panel.querySelector(".nx-history__asof")!.textContent = past ? L.asOf.replace("{date}", stamp) : L.now;
    panel.querySelector(".nx-history__who")!.replaceChildren(...(e ? [this.#avatar(e.actor), h("span", null, h("strong", null, e.actor.name), ` ${this.#verb(e)}`, h("small", null, ` · ${past ? step : stamp}`))] : []));
    (panel.querySelector(".nx-history__present") as HTMLElement).hidden = !past;
    const ticks = panel.querySelector(".nx-history__ticks")!;
    if (ticks.childElementCount !== n) ticks.replaceChildren(...evs.map(() => h("i")));
    [...ticks.children].forEach((t, k) => {
      t.setAttribute("data-action", evs[k].revertOf ? "revert" : evs[k].action);
      t.toggleAttribute("data-on", k === i);
      t.toggleAttribute("data-future", k > i);
    });
    panel.querySelector(".nx-history__state")!.replaceChildren(
      ...keys.map((f) =>
        h(
          "div",
          { "data-changed": changed.has(f.key) ? "" : null, "data-hit": past && hit.has(f.key) ? "" : null },
          h("dt", null, f.label),
          h("dd", null, h("span", { class: "nx-history__v" }, this.#val(f, then[f.key] ?? null)), changed.has(f.key) ? h("small", null, L.nowValue.replace("{value}", valueText(f, this.#record[f.key], fmt))) : null),
        ),
      ),
    );
    for (const li of this.#feed!.querySelectorAll<HTMLElement>(".nx-history__ev")) {
      const k = Number(li.dataset.i);
      li.toggleAttribute("data-future", past && k > i);
      li.toggleAttribute("data-on", past && k === i);
      // Suave o no según el CSS (`scroll-behavior`, que respeta el movimiento reducido).
      if (scroll && past && k === i) li.scrollIntoView?.({ block: "nearest" });
    }
  }
}
