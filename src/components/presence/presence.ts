/**
 * `<nx-presence>`: quién más está aquí, en vivo. Una pila de avatares de quienes ven el mismo
 * registro (color estable por persona, iniciales o foto, punto verde si está activo y gris si no),
 * con «+3» y la lista completa de qué hace cada quien: «viendo», «editando Monto», «inactivo hace
 * 4 min». La persona actual (`me`) no sale en la pila.
 *
 * Con `for`, los campos de ese formulario (los que tienen `data-presence` o `name`) muestran un
 * contorno del color de quien los tiene enfocados, con su nombre encima —en una capa aparte, sin
 * mover nada del formulario— y «Ana está escribiendo…» mientras escribe. Si alguien está editando
 * un campo y la persona actual lo enfoca, un aviso que no bloquea: «tus cambios podrían pisar los
 * suyos», con «Seguir de todas formas».
 *
 * No depende de ningún backend: `channel` usa `BroadcastChannel` entre pestañas del mismo
 * navegador, `source` escucha un `EventSource` (SSE) y `push()` recibe eventos de un transporte
 * propio. Lo que hace la persona actual sale en `nx-presence-local`, para que la app lo mande a
 * su servidor. Latido cada 15 s; quien no da señales en 45 s se va solo.
 */
import { Base } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph, initials } from "../../core/icons";
import { resolveLocale } from "../../core/locale";
import { HEARTBEAT_MS, activityOf, agoText, applyEvent, cleanEvent, cleanUser, firstName, hueOf, nextTypingEnd, prune, statesOf, summarize, type PresenceNote, type PresencePeer } from "./logic";
import type { PresenceEvent, PresenceEventType, PresenceLabels, PresenceState, PresenceUser } from "./types";

export const PRESENCE_LABELS: PresenceLabels = {
  people: "Personas aquí",
  more: "+{n}",
  moreLabel: "Ver a las {n} personas",
  all: "Ver quién está aquí",
  here: "En este registro",
  alone: "Solo tú",
  you: "(tú)",
  viewing: "viendo",
  focus: "en {field}",
  editing: "editando {field}",
  typing: "escribiendo en {field}…",
  idle: "inactivo",
  idleFor: "inactivo {ago}",
  typingTag: "{name} está escribiendo…",
  joined: "{names} entró",
  joinedMany: "{names} entraron",
  left: "{names} salió",
  leftMany: "{names} salieron",
  editingNow: "{name} está editando {field}",
  andMore: "Y {n} cambios más",
  warn: "{name} está editando este campo; tus cambios podrían pisar los suyos.",
  proceed: "Seguir de todas formas",
  escHint: "Esc",
};

const WARN = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const DOWN = '<path d="m6 9 6 6 6-6"/>';
const PROPS = ["me", "labels", "channel", "source", "for", "idle", "max"] as const;
const JSON_ATTRS = ["me", "labels"];
/** Cada cuánto se revisa todo: latido propio, quién se fue, inactividad, «hace N min». */
const TICK_MS = 5_000;
/** «Escribiendo» se avisa como mucho una vez en este tiempo. */
const TYPING_EVERY_MS = 1_200;
/** Los anuncios se agrupan: uno como mucho cada tanto. */
const SAY_EVERY_MS = 3_000;
const FIELD_TAGS = /^(INPUT|SELECT|TEXTAREA)$/;
const q = (s: string) => s.replace(/["\\]/g, "\\$&");

let uid = 0;
interface Mark {
  box: HTMLElement;
  tag: HTMLElement;
  el: HTMLElement | null;
  field: string;
}

export class NxPresence extends Base {
  static observedAttributes = [...JSON_ATTRS, "channel", "source", "for", "idle", "max", "locale"];

  #uid = `nx-presence${++uid}`;
  #me: PresenceUser | null = null;
  #labels: PresenceLabels = PRESENCE_LABELS;
  #peers: PresencePeer[] = [];
  /** Lo que hace la persona actual. */
  #local = { field: null as string | null, editing: false, idle: false, typedAt: 0 };
  #activity = 0;
  #beat = 0;
  #bc?: BroadcastChannel;
  #es?: EventSource;
  #off?: AbortController;
  #ro?: ResizeObserver;
  #tick = 0;
  #typing = 0;
  #raf = 0;
  #notes: PresenceNote[] = [];
  #sayTimer = 0;
  #saidAt = 0;
  #snap = "[]";
  #live = false;
  /** Ya se despidió (la página se está yendo): no manda nada más. */
  #gone = false;
  #built = false;
  /** Avisos ya descartados («campo|persona»): no vuelven mientras esa persona siga editándolo. */
  #dismissed = new Set<string>();
  #marks = new Map<string, Mark>();
  // Nodos.
  #stack?: HTMLUListElement;
  #more?: HTMLButtonElement;
  #pop?: HTMLElement;
  #alone?: HTMLElement;
  #sr?: HTMLElement;
  #layer?: HTMLElement;
  #notice?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  /** La persona actual `{id, name, avatar?}`. Sin ella, el componente solo escucha. */
  get me(): PresenceUser | null {
    return this.#me && { ...this.#me };
  }
  set me(v: PresenceUser | null | undefined) {
    const old = this.#me;
    this.#me = cleanUser(v);
    if (!this.#live) return;
    if (old && old.id !== this.#me?.id) this.#send("leave", undefined, old);
    this.#send("join");
    this.#paint();
  }
  /** Quienes están aquí (sin `me`), activos primero. Solo lectura. */
  get users(): PresenceState[] {
    return statesOf(this.#peers, Date.now());
  }
  /** Nombre del canal entre pestañas (`BroadcastChannel`); quienes usan el mismo se ven. */
  get channel(): string | null {
    return this.getAttribute("channel");
  }
  set channel(v: string | null) {
    if (v) this.setAttribute("channel", v);
    else this.removeAttribute("channel");
  }
  /** URL de un `EventSource` (SSE) que manda los eventos de los demás. */
  get source(): string | null {
    return this.getAttribute("source");
  }
  set source(v: string | null) {
    if (v) this.setAttribute("source", v);
    else this.removeAttribute("source");
  }
  /** `id` del formulario (o contenedor) cuyos campos se comparten. */
  get for(): string | null {
    return this.getAttribute("for");
  }
  set for(v: string | null) {
    if (v) this.setAttribute("for", v);
    else this.removeAttribute("for");
  }
  /** Milisegundos sin actividad para pasar a «inactivo» (120000). */
  get idle(): number {
    const n = Number(this.getAttribute("idle"));
    return this.hasAttribute("idle") && Number.isFinite(n) && n > 0 ? n : 120_000;
  }
  set idle(v: number) {
    this.setAttribute("idle", String(v));
  }
  /** Cuántos círculos caben en la pila, contando «+N» (4). */
  get max(): number {
    const n = Math.floor(Number(this.getAttribute("max")));
    return Number.isFinite(n) && n >= 2 ? n : 4;
  }
  set max(v: number) {
    this.setAttribute("max", String(v));
  }
  get labels(): PresenceLabels {
    return this.#labels;
  }
  set labels(v: Partial<PresenceLabels> | null | undefined) {
    this.#labels = { ...PRESENCE_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }

  // ---------------------------------------------------------------- API

  /** Recibe un evento de un transporte propio (objeto o JSON). `false` si no se entendió. */
  push(event: PresenceEvent | string): boolean {
    const ev = cleanEvent(event);
    if (!ev) return false;
    this.#receive(ev);
    return true;
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
    this.#start();
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#stop();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (JSON_ATTRS.includes(name)) {
      if (value === null) return;
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-presence] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (!this.#live || old === value) return this.#paint();
    // Otro canal u otra fuente es otra sala: se sale de la anterior y se empieza de cero.
    if (name === "channel" || name === "source") {
      this.#send("leave");
      this.#peers = [];
      this.#open();
      this.#send("join");
    }
    if (name === "for") {
      this.#hideNotice();
      this.#observe();
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- transporte

  #start(): void {
    if (this.#live) return;
    this.#live = true;
    const ac = (this.#off = new AbortController());
    const o = { signal: ac.signal, capture: true };
    const doc = document;
    doc.addEventListener("focusin", (e) => this.#onFocusIn(e), o);
    doc.addEventListener("focusout", (e) => this.#onFocusOut(e), o);
    doc.addEventListener("input", (e) => this.#onInput(e), o);
    doc.addEventListener("keydown", (e) => this.#onKey(e), o);
    for (const t of ["pointerdown", "pointermove", "wheel", "touchstart"]) doc.addEventListener(t, () => this.#active(), { ...o, passive: true });
    doc.addEventListener("scroll", () => this.#schedulePlace(), { ...o, passive: true });
    doc.addEventListener("visibilitychange", () => (doc.visibilityState === "hidden" ? this.#setIdle(true) : this.#active()), o);
    addEventListener("resize", () => this.#schedulePlace(), o);
    // Al cerrar la pestaña (o navegar), se despide y calla (el `visibilitychange` que sigue la haría
    // volver): los demás no esperan los 45 s. Si vuelve del bfcache, entra de nuevo.
    addEventListener("pagehide", () => (this.#send("leave"), (this.#gone = true)), o);
    addEventListener("pageshow", (e) => (e as PageTransitionEvent).persisted && ((this.#gone = false), this.#send("join")), o);
    this.#activity = Date.now();
    this.#local.idle = doc.visibilityState === "hidden";
    this.#open();
    this.#observe();
    this.#tick = window.setInterval(() => this.#onTick(), TICK_MS);
    this.#send("join");
  }

  #stop(): void {
    if (!this.#live) return;
    this.#send("leave");
    this.#live = false;
    this.#off?.abort();
    this.#bc?.close();
    this.#es?.close();
    this.#bc = this.#es = undefined;
    this.#ro?.disconnect();
    clearInterval(this.#tick);
    clearTimeout(this.#typing);
    clearTimeout(this.#sayTimer);
    cancelAnimationFrame(this.#raf);
    this.#sayTimer = 0;
    this.#layer?.remove();
    this.#layer = this.#notice = undefined;
    this.#marks.clear();
    this.#dismissed.clear();
    this.#peers = [];
    this.#local = { field: null, editing: false, idle: false, typedAt: 0 };
  }

  #open(): void {
    this.#bc?.close();
    this.#es?.close();
    this.#bc = this.#es = undefined;
    const ch = this.channel;
    if (ch && typeof BroadcastChannel !== "undefined") {
      this.#bc = new BroadcastChannel(`nx-presence:${ch}`);
      this.#bc.onmessage = (e) => this.push(e.data);
    }
    const src = this.source;
    if (src && typeof EventSource !== "undefined") {
      this.#es = new EventSource(src);
      this.#es.onmessage = (e) => this.push(e.data);
    }
  }

  /** Manda lo que hace la persona actual: por el canal (si hay) y en `nx-presence-local`. */
  #send(type: PresenceEventType, field?: string | null, as = this.#me): void {
    if (!as || !this.#live || this.#gone) return;
    const L = this.#local;
    const ev: PresenceEvent = { type, user: as };
    if (type === "join" || type === "heartbeat") Object.assign(ev, { field: L.field, editing: L.editing, idle: L.idle });
    else if (field !== undefined) ev.field = field;
    this.#beat = Date.now();
    try {
      this.#bc?.postMessage(ev);
    } catch {
      /* canal cerrado: la app aún recibe el evento */
    }
    this.dispatchEvent(new CustomEvent("nx-presence-local", { detail: ev, bubbles: true, composed: true }));
  }

  #receive(ev: PresenceEvent): void {
    const now = Date.now();
    const known = this.#peers.some((p) => p.id === ev.user.id);
    const r = applyEvent(this.#peers, ev, now, this.#me?.id);
    this.#peers = r.peers;
    // Quien llega (o de quien no sabíamos) no sabe que estamos: se le cuenta con un latido.
    if (ev.user.id !== this.#me?.id && ev.type !== "leave" && (ev.type === "join" || !known)) this.#send("heartbeat");
    // Un aviso descartado vuelve si esa persona suelta el campo y lo retoma.
    for (const k of this.#dismissed) {
      const [f, id] = k.split("\u0000");
      if (!this.#peers.some((p) => p.id === id && p.field === f && p.editing)) this.#dismissed.delete(k);
    }
    this.#say(r.notes);
    this.#paint();
  }

  #onTick(): void {
    const now = Date.now();
    if (!this.#local.idle && now - this.#activity >= this.idle) this.#setIdle(true);
    if (now - this.#beat >= HEARTBEAT_MS - TICK_MS / 10) this.#send("heartbeat");
    const r = prune(this.#peers, now);
    this.#peers = r.peers;
    this.#say(r.notes);
    this.#paint();
  }

  // ---------------------------------------------------------------- lo que hace la persona actual

  #active(): void {
    this.#activity = Date.now();
    if (this.#local.idle && document.visibilityState !== "hidden") this.#setIdle(false);
  }
  #setIdle(v: boolean): void {
    if (this.#local.idle === v) return;
    this.#local.idle = v;
    this.#send("heartbeat");
    this.#paintPop();
  }

  #target(): HTMLElement | null {
    const id = this.for;
    if (!id) return null;
    const root = this.getRootNode() as Document | ShadowRoot;
    return (root.getElementById?.(id) ?? document.getElementById(id)) as HTMLElement | null;
  }
  /** El campo compartido de un elemento: `[data-presence]` o un campo con `name`, dentro de `for`. */
  #fieldOf(t: EventTarget | null): [HTMLElement, string] | null {
    const root = this.#target();
    if (!root || !(t instanceof Element) || !root.contains(t)) return null;
    const el = t.closest<HTMLElement>("[data-presence]");
    if (el && root.contains(el) && el.dataset.presence) return [el, el.dataset.presence];
    const name = (t as HTMLInputElement).name;
    return FIELD_TAGS.test(t.tagName) && typeof name === "string" && name ? [t as HTMLElement, name] : null;
  }
  #fieldEl(key: string): HTMLElement | null {
    const root = this.#target();
    return root?.querySelector<HTMLElement>(`[data-presence="${q(key)}"]`) ?? root?.querySelector<HTMLElement>(`[name="${q(key)}"]`) ?? null;
  }
  /** Cómo se llama un campo: `data-presence-label`, `aria-label`, su `<label>`, o la clave. */
  #label(key: string): string {
    const el = this.#fieldEl(key);
    const t = el && (el.dataset.presenceLabel || el.getAttribute("aria-label") || (el as HTMLInputElement).labels?.[0]?.textContent || el.querySelector("label, legend")?.textContent);
    return t?.replace(/\s+/g, " ").replace(/\s*\*$/, "").trim() || key;
  }

  #onFocusIn(e: FocusEvent): void {
    this.#active();
    if (this.#notice?.contains(e.target as Node)) return;
    const f = this.#fieldOf(e.target);
    if (!f) return;
    if (f[1] !== this.#local.field) {
      Object.assign(this.#local, { field: f[1], editing: false });
      this.#send("focus", f[1]);
      this.#paintPop();
    }
    this.#checkNotice();
  }
  #onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null;
    const from = this.#notice?.contains(e.target as Node) ? this.#local.field : this.#fieldOf(e.target)?.[1];
    if (!from || this.#notice?.contains(next) || this.#fieldOf(next)) return;
    Object.assign(this.#local, { field: null, editing: false });
    this.#send("blur", from);
    this.#hideNotice();
    this.#paintPop();
  }
  #onInput(e: Event): void {
    const f = this.#fieldOf(e.target);
    if (!f) return;
    const L = this.#local;
    if (L.field !== f[1]) Object.assign(L, { field: f[1], editing: false }), this.#send("focus", f[1]);
    if (!L.editing) (L.editing = true), this.#send("lock", f[1]), this.#paintPop();
    const now = Date.now();
    if (now - L.typedAt >= TYPING_EVERY_MS) (L.typedAt = now), this.#send("typing", f[1]);
  }
  #onKey(e: KeyboardEvent): void {
    this.#active();
    if (e.key === "Escape" && this.#notice && !e.defaultPrevented && (this.#fieldOf(e.target) || this.#notice.contains(e.target as Node))) {
      e.preventDefault();
      this.#dismiss();
    }
  }

  // ---------------------------------------------------------------- anuncios

  /** Agrupa lo que pasa y lo anuncia sin saturar: una frase como mucho cada `SAY_EVERY_MS`. */
  #say(notes: PresenceNote[]): void {
    if (!notes.length) return;
    this.#notes.push(...notes);
    if (this.#sayTimer) return;
    const wait = Math.max(600, this.#saidAt + SAY_EVERY_MS - Date.now());
    this.#sayTimer = window.setTimeout(() => {
      this.#sayTimer = 0;
      this.#saidAt = Date.now();
      let list = (n: string[]) => n.join(", ");
      try {
        const lf = new Intl.ListFormat(resolveLocale(this), { type: "conjunction" });
        list = (n) => lf.format(n);
      } catch {
        /* sin ListFormat: con comas */
      }
      if (this.#sr) this.#sr.textContent = summarize(this.#notes, this.#labels, list, (k) => this.#label(k));
      this.#notes = [];
    }, wait);
  }

  // ---------------------------------------------------------------- construcción

  #build(): void {
    this.#built = true;
    this.#stack = h("ul", { class: "nx-presence__stack" });
    this.#alone = h("span", { class: "nx-presence__alone" });
    this.#pop = h("div", { class: "nx-presence__pop", id: `${this.#uid}-pop`, popover: "auto" });
    this.#more = h("button", { type: "button", class: "nx-presence__more", popovertarget: `${this.#uid}-pop`, "aria-expanded": "false" });
    this.#sr = h("span", { class: "nx-presence__sr", role: "status" });
    this.append(this.#stack, this.#alone, this.#more, this.#pop, this.#sr);
    // Un clic en un avatar también abre la lista (el botón es el camino del teclado).
    this.#stack.addEventListener("click", () => {
      try {
        this.#pop!.showPopover();
      } catch {
        /* ya abierta, o sin Popover API */
      }
    });
    this.#pop.addEventListener("beforetoggle", (e) => {
      if ((e as ToggleEvent).newState !== "open") return;
      this.#pop!.dataset.open = "";
      this.#paintPop();
      const r = this.getBoundingClientRect();
      const s = this.#pop!.style;
      s.top = `${r.bottom + 6}px`;
      // Pegado al borde derecho de la pila, salvo que no quepa hacia la izquierda.
      if (r.right > 300) (s.left = "auto"), (s.right = `${Math.max(8, innerWidth - r.right)}px`);
      else (s.right = "auto"), (s.left = `${Math.max(8, r.left)}px`);
    });
    this.#pop.addEventListener("toggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      if (!open) delete this.#pop!.dataset.open;
      this.#more!.setAttribute("aria-expanded", String(open));
    });
  }

  #observe(): void {
    this.#ro?.disconnect();
    const t = this.#target();
    if (t && typeof ResizeObserver !== "undefined") (this.#ro ??= new ResizeObserver(() => this.#schedulePlace())).observe(t);
  }

  // ---------------------------------------------------------------- pintado

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const now = Date.now();
    const all = statesOf(this.#peers, now);
    const n = all.length;
    const max = this.max;
    const shown = n > max ? all.slice(0, max - 1) : all;
    const rest = n - shown.length;
    const stack = this.#stack!;
    stack.setAttribute("aria-label", L.people);
    stack.hidden = !n;
    // Por `id`: un avatar que ya estaba no se vuelve a crear (y no repite su entrada animada).
    // Solo se mueve lo que cambió de lugar: reinsertar un nodo repetiría su animación.
    const old = new Map([...stack.children].map((li) => [(li as HTMLElement).dataset.id!, li as HTMLElement]));
    const keep = new Set(shown.map((s) => s.id));
    for (const [id, li] of old) if (!keep.has(id)) li.remove();
    shown.forEach((s, i) => {
      const doing = this.#doing(s, now);
      const li = old.get(s.id) ?? h("li", { class: "nx-presence__av", "data-id": s.id }, this.#avatar(s), h("span", { class: "nx-presence__vh" }));
      li.title = `${s.name} · ${doing}`;
      li.toggleAttribute("data-idle", s.idle);
      li.toggleAttribute("data-typing", s.typing);
      li.lastElementChild!.textContent = `${s.name}, ${doing}`;
      // El primero, encima: los demás asoman por detrás.
      li.style.zIndex = String(shown.length - i);
      if (stack.children[i] !== li) stack.insertBefore(li, stack.children[i] ?? null);
    });
    this.#alone!.hidden = !!n;
    this.#alone!.textContent = L.alone;
    const more = this.#more!;
    more.hidden = !n;
    more.dataset.rest = rest ? String(rest) : "";
    if (rest) more.replaceChildren(L.more.replace("{n}", String(rest)));
    else if (!more.querySelector(".nx-glyph")) more.replaceChildren(glyph(DOWN));
    more.setAttribute("aria-label", rest ? L.moreLabel.replace("{n}", String(n)) : L.all);
    this.#paintPop();
    this.#paintMarks(all);
    this.#checkNotice();
    // Quien deja de escribir: se vuelve a pintar justo entonces.
    clearTimeout(this.#typing);
    const end = nextTypingEnd(this.#peers, now);
    if (end && this.#live) this.#typing = window.setTimeout(() => this.#paint(), end - now + 30);
    const snap = JSON.stringify(all.map(({ seenAt, ...s }) => s));
    if (snap !== this.#snap) {
      this.#snap = snap;
      if (this.#live) this.dispatchEvent(new CustomEvent("nx-presence-change", { detail: { users: all }, bubbles: true, composed: true }));
    }
  }

  #avatar(u: PresenceUser): HTMLElement {
    const src = safeHref(u.avatar);
    return h("span", { class: "nx-presence__face", "aria-hidden": "true", style: `--h:${hueOf(u.id)}` }, src ? h("img", { src, alt: "", loading: "lazy" }) : initials(u.name));
  }

  /** «viendo», «editando Monto», «inactivo hace 4 min». */
  #doing(s: Pick<PresenceState, "idle" | "idleSince" | "field" | "editing" | "typing">, now: number): string {
    const L = this.#labels;
    const k = activityOf(s);
    if (k === "idle") {
      const ago = agoText(now - (s.idleSince ?? now), resolveLocale(this));
      return ago ? L.idleFor.replace("{ago}", ago) : L.idle;
    }
    return k === "viewing" ? L.viewing : L[k].replace("{field}", this.#label(s.field!));
  }

  /** La lista completa (solo si está abierta): primero la persona actual, luego los demás. */
  #paintPop(): void {
    const pop = this.#pop;
    if (!pop || !("open" in pop.dataset)) return;
    const L = this.#labels;
    const now = Date.now();
    const all = statesOf(this.#peers, now);
    const me = this.#me;
    const row = (u: PresenceUser, doing: string, idle: boolean, you = false) =>
      h("li", { class: "nx-presence__row", "data-idle": idle ? "" : null }, h("span", { class: "nx-presence__av" }, this.#avatar(u)), h("span", { class: "nx-presence__who" }, h("strong", null, u.name, you ? ` ${L.you}` : ""), h("span", null, doing)));
    const loc = this.#local;
    pop.replaceChildren(
      h("p", { class: "nx-presence__title", id: `${this.#uid}-t` }, L.here, h("span", null, String(all.length + (me ? 1 : 0)))),
      h(
        "ul",
        { class: "nx-presence__list", "aria-labelledby": `${this.#uid}-t` },
        me ? row(me, this.#doing({ ...loc, idleSince: null, typing: false }, now), loc.idle, true) : null,
        ...all.map((s) => row(s, this.#doing(s, now), s.idle)),
      ),
    );
  }

  /** Los contornos y etiquetas de los campos: uno por persona, que se desliza al campo que enfoca. */
  #paintMarks(all: PresenceState[]): void {
    const L = this.#labels;
    const on = all.filter((s) => s.field && this.#fieldEl(s.field));
    if (on.length && !this.#layer) document.body.append((this.#layer = h("div", { class: "nx-presence__layer" })));
    const seen = new Set<string>();
    const slots = new Map<string, number>();
    for (const s of on) {
      seen.add(s.id);
      const slot = slots.get(s.field!) ?? 0;
      slots.set(s.field!, slot + 1);
      let m = this.#marks.get(s.id);
      if (!m) {
        const tag = h("span", { class: "nx-presence__tag" });
        m = { box: h("div", { class: "nx-presence__mark", "aria-hidden": "true", style: `--h:${hueOf(s.id)}` }, tag), tag, el: null, field: "" };
        this.#marks.set(s.id, m);
        this.#layer!.append(m.box);
      } else if (m.field !== s.field) {
        // De un campo a otro, el contorno se desliza (sin transición al hacer scroll).
        m.box.dataset.move = "";
        setTimeout(() => delete m!.box.dataset.move, 320);
      }
      m.field = s.field!;
      m.el = this.#fieldEl(s.field!);
      m.box.dataset.slot = String(Math.min(slot, 2));
      m.box.toggleAttribute("data-idle", s.idle);
      m.box.toggleAttribute("data-typing", s.typing);
      m.tag.textContent = s.typing ? L.typingTag.replace("{name}", firstName(s.name)) : firstName(s.name);
      if (m.el) m.box.style.borderRadius = getComputedStyle(m.el).borderRadius;
    }
    for (const [id, m] of this.#marks) if (!seen.has(id)) m.box.remove(), this.#marks.delete(id);
    this.#place();
  }

  #schedulePlace(): void {
    if (this.#raf || (!this.#marks.size && !this.#notice)) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      this.#place();
    });
  }

  /** Posiciona contornos y aviso sobre sus campos (capa fija: nada del formulario se mueve). */
  #place(): void {
    const vh = innerHeight;
    for (const m of this.#marks.values()) {
      const r = m.el?.getBoundingClientRect();
      const off = !r || (!r.width && !r.height) || r.bottom < 0 || r.top > vh;
      m.box.hidden = off;
      if (off) continue;
      const s = m.box.style;
      s.transform = `translate(${r.left}px, ${r.top}px)`;
      s.width = `${r.width}px`;
      s.height = `${r.height}px`;
    }
    const n = this.#notice;
    const el = this.#local.field ? this.#fieldEl(this.#local.field) : null;
    if (n && el) {
      const r = el.getBoundingClientRect();
      const below = r.bottom + 8 + n.offsetHeight < vh || r.top < n.offsetHeight + 8;
      n.style.transform = `translate(${Math.max(8, Math.min(r.left, innerWidth - n.offsetWidth - 8))}px, ${below ? r.bottom + 8 : r.top - n.offsetHeight - 8}px)`;
    }
  }

  // ---------------------------------------------------------------- bloqueo suave

  /** Si alguien más está editando el campo que la persona actual tiene enfocado: el aviso. */
  #checkNotice(): void {
    const key = this.#local.field;
    const who = key ? this.#peers.find((p) => p.field === key && p.editing && !this.#dismissed.has(`${key}\u0000${p.id}`)) : undefined;
    if (!who || !this.#live) return this.#hideNotice();
    const id = `${key}\u0000${who.id}`;
    if (this.#notice?.dataset.key === id) return;
    this.#hideNotice();
    const L = this.#labels;
    const btn = h("button", { type: "button", class: "nx-presence__go" }, L.proceed);
    btn.addEventListener("click", () => this.#dismiss());
    this.#notice = h(
      "div",
      { class: "nx-presence__notice", role: "alert", "data-key": id, style: `--h:${hueOf(who.id)}` },
      glyph(WARN),
      h("p", null, L.warn.replace("{name}", who.name)),
      h("span", { class: "nx-presence__acts" }, btn, h("kbd", null, L.escHint)),
    );
    if (!this.#layer) document.body.append((this.#layer = h("div", { class: "nx-presence__layer" })));
    this.#layer.append(this.#notice);
    this.#place();
  }

  #hideNotice(): void {
    this.#notice?.remove();
    this.#notice = undefined;
  }

  /** «Seguir de todas formas»: el aviso se va (y no vuelve por esa persona en ese campo) y el foco al campo. */
  #dismiss(): void {
    const key = this.#notice?.dataset.key;
    if (!key) return;
    this.#dismissed.add(key);
    // El foco vuelve al campo antes de quitar el aviso (quitarlo con el foco adentro lo perdería).
    const el = this.#local.field ? this.#fieldEl(this.#local.field) : null;
    if (this.#notice!.contains(document.activeElement)) (el && FIELD_TAGS.test(el.tagName) ? el : el?.querySelector<HTMLElement>("input, select, textarea, [contenteditable]"))?.focus();
    this.#hideNotice();
  }
}
