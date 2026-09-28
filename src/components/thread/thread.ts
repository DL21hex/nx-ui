/**
 * `<nx-thread>`: la conversación dentro del registro. En vez de «te mandé un correo sobre la
 * OC-2291», los comentarios viven en el pedido, la factura o la orden, y se pueden anclar a un
 * campo del formulario («¿por qué este descuento?»).
 *
 * La lista va del más viejo al más nuevo, agrupada por día («Hoy», «Ayer», «lun 21 sept»), con una
 * marca «Nuevos» desde la última visita. Las respuestas son de un solo nivel (citan arriba el
 * comentario al que responden). Lo propio se edita en su lugar y se borra con deshacer. Una
 * conversación anclada se resuelve y queda plegada.
 *
 * El redactor reconoce `@` (personas de `people-source`), `#` y los códigos de `ref-patterns`
 * (registros de `refs-source`). El texto es SIEMPRE texto: solo se pintan los tokens de mención y
 * referencia, las URL y los saltos de línea (`parseThreadText`, en `logic.ts`).
 *
 * Los campos de la página con `data-thread` (o los de `anchors`) llevan un globito con los
 * comentarios abiertos sobre ese campo: un botón propio que se inserta junto a su etiqueta, sin
 * mover nada del autor. En vivo por `stream` (SSE o NDJSON), o con un sondeo suave (`poll`).
 * El envío es optimista, con `clientId` para que un reintento no duplique.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeEndpoint, safeHref, safeImageSrc } from "../../core/dom";
import { initials } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import { atTime, relTime, stampText } from "../history/logic";
import { cleanUser, firstName, hueOf } from "../presence/logic";
import {
  anchorCounts,
  cleanComment,
  cleanComments,
  cleanDraft,
  cleanRef,
  decodeDraft,
  encodeDraft,
  firstUnread,
  groupThreadByDay,
  latestAt,
  mergeComments,
  parseThreadText,
  refPatterns,
  threadDayLabel,
  threadMentions,
  threadNames,
  threadPlainText,
  threadRoot,
  type ThreadPick,
} from "./logic";
import type { ThreadField } from "./thread-anchors";
import type { ThreadLive, ThreadLiveHost } from "./thread-live";
import type { ThreadPicker } from "./thread-pick";
import type { ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadPostDetail, ThreadRef, ThreadToken, ThreadUser } from "./types";

export const THREAD_LABELS: ThreadLabels = {
  heading: "Comentarios",
  placeholder: "Escribe un comentario…",
  send: "Enviar",
  hint: "Enter envía · Mayús+Enter, nueva línea · @ menciona · # referencia",
  today: "Hoy",
  yesterday: "Ayer",
  unread: "Nuevos",
  edited: "(editado)",
  reply: "Responder",
  edit: "Editar",
  delete: "Borrar",
  save: "Guardar",
  cancel: "Cancelar",
  resolve: "Resolver",
  reopen: "Reabrir",
  resolvedBy: "Resuelto por {name}",
  show: "ver",
  hide: "Ocultar",
  replyingTo: "Respondiendo a {name}",
  gone: "(comentario borrado)",
  about: "Sobre: {field}",
  aboutField: "Sobre un campo…",
  remove: "Quitar",
  sending: "Enviando…",
  failed: "No se envió",
  retry: "Reintentar",
  deleted: "Comentario borrado",
  editFailed: "No se guardó el cambio.",
  older: "Ver anteriores ({n})",
  loading: "Cargando comentarios…",
  loadFailed: "No se pudieron cargar los comentarios.",
  empty: "Todavía no hay comentarios.",
  filtered: "Sobre {field}",
  showAll: "Ver todos",
  pinNone: "Comentar sobre {field}",
  pinOne: "1 comentario sobre {field}",
  pinMany: "{n} comentarios sobre {field}",
  typing: "{names} está escribiendo…",
  typingMany: "{names} están escribiendo…",
  viewing: "{names} está viendo",
  viewingMany: "{names} están viendo",
  and: " y ",
  more: "{n} más",
  newOne: "Nuevo comentario de {name}",
  newMany: "{n} comentarios nuevos",
  people: "Personas",
  refs: "Registros",
  you: "Tú",
};

const PROPS = ["record", "endpoint", "stream", "poll", "peopleSource", "refsSource", "refPatterns", "me", "anchors", "presence", "readonly", "disabled", "locale", "labels", "comments"] as const;
const JSON_ATTRS: Record<string, string> = { me: "me", labels: "labels", anchors: "anchors", "ref-patterns": "refPatterns" };
/** Cuántos comentarios se pintan (y cuántos más con «Ver anteriores»). */
const PAGE = 50;

type Field = ThreadField;

let uid = 0;
const fill = (s: string, o: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in o ? String(o[k]) : m));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const withQuery = (url: string, k: string, v: string) => `${url}${url.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;
const dayOf = (t: number) => new Date(t).toDateString();

/** `localStorage` (0) o `sessionStorage` (1), a prueba de modo privado y de cuota: leer (`v` ausente),
 *  guardar o borrar (`null`). */
function stash(session: 0 | 1, key: string, v?: string | null): string | null {
  try {
    const s = session ? sessionStorage : localStorage;
    if (v === undefined) return s.getItem(key);
    if (v === null) s.removeItem(key);
    else s.setItem(key, v);
  } catch {
    /* sin almacenamiento */
  }
  return null;
}

export class NxThread extends Base {
  static observedAttributes = ["record", "endpoint", "stream", "poll", "people-source", "refs-source", "ref-patterns", "me", "anchors", "presence", "readonly", "disabled", "locale", "labels"];

  #uid = `nx-thread${++uid}`;
  #seq = 0;
  #comments: ThreadComment[] = [];
  #me: ThreadUser | null = null;
  #labels: ThreadLabels = THREAD_LABELS;
  #patterns: RegExp[] = [];
  #anchors: string[] = [];
  /** Registros conocidos (de la lista de sugerencias, de `refs` en los comentarios o consultados). */
  #refs = new Map<string, ThreadRef>();
  #tokens = new WeakMap<ThreadComment, ThreadToken[]>();
  #filter: string | null = null;
  #limit = PAGE;
  #loaded = false;
  #loading = false;
  #failed = false;
  /** El primer comentario sin leer al abrir (la marca «Nuevos» se queda ahí durante la visita). */
  #mark: string | null = null;
  /** Conversaciones resueltas desplegadas. */
  #open = new Set<string>();
  #editing: string | null = null;
  #editText = "";
  #editPicks: ThreadPick[] = [];
  #picks: ThreadPick[] = [];
  #reply: string | null = null;
  #anchor: string | null = null;
  /** Borrados que esperan su tiempo de deshacer. */
  #deleting = new Map<string, AbortController>();
  /** El stream en curso (`thread-live.ts`): para avisar que se escribe. */
  #stream?: ThreadLive;
  #news: string[] = [];
  /** La lista de sugerencias y la tarjeta de registros (`thread-pick.ts`, con `import()`). */
  #picker?: ThreadPicker;
  #pickerP?: Promise<ThreadPicker>;
  #pins = new Map<string, HTMLButtonElement>();
  #anch?: typeof import("./thread-anchors");
  #anchP?: Promise<unknown>;
  #pres: Element | null = null;
  #ctxSig = "";
  #day = "";
  #live = false;
  #built = false;
  // Red y tiempos.
  #life?: AbortController;
  #ac?: AbortController;
  #sac?: AbortController;
  #pollT = 0;
  #tickT = 0;
  #sayT = 0;
  // Nodos.
  #title!: HTMLElement;
  #count!: HTMLElement;
  #here!: HTMLElement;
  #bar!: HTMLElement;
  #body!: HTMLElement;
  #older!: HTMLButtonElement;
  #list!: HTMLOListElement;
  #msg!: HTMLElement;
  #typing!: HTMLElement;
  #form!: HTMLFormElement;
  #ctx!: HTMLElement;
  #ta!: HTMLTextAreaElement;
  #send!: HTMLButtonElement;
  #hint!: HTMLElement;
  #sr!: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  // `record`, `endpoint`, `stream`, `peopleSource`, `refsSource`, `presence` y `locale` solo
  // reflejan su atributo: se definen abajo, en el prototipo, de una vez.
  /** El registro («OC-2291»): de él cuelgan los comentarios, el borrador y lo leído. */
  declare record: string | null;
  /** `GET ?record=`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Mismo origen (o `allowOrigins`). */
  declare endpoint: string | null;
  /** SSE o NDJSON con los cambios en vivo (`?record=` se agrega solo). */
  declare stream: string | null;
  /** `?q=` → `[{id, name, detail?, avatar?}]`: a quién se puede mencionar. */
  declare peopleSource: string | null;
  /** `?q=` → `[{id, label, detail?, href}]`: qué registros se pueden referenciar. */
  declare refsSource: string | null;
  /** `id` del `<nx-presence>` del que se lee quién está viendo (sin él, el primero de la página). */
  declare presence: string | null;
  /** Fechas y horas («es-CO», «en-US»…); sin él, el `lang` más cercano. */
  declare locale: string | null;
  /** Sin `stream`: cada cuántos segundos se vuelve a pedir la lista (30; `0` no sondea). */
  get poll(): number {
    const n = Number(this.getAttribute("poll") ?? 30);
    return !Number.isFinite(n) ? 30 : n > 0 ? Math.max(5, n) : 0;
  }
  set poll(v: number) {
    this.setAttribute("poll", String(v));
  }
  /** Los códigos que se reconocen solos (`["OC-\\d{3,6}", "FV-\\d{3,6}"]`), como texto de cada patrón. */
  get refPatterns(): string[] {
    return this.#patterns.map((p) => p.source.slice(4, -2));
  }
  set refPatterns(v: string[] | string | null | undefined) {
    this.#patterns = refPatterns(v);
    this.#tokens = new WeakMap();
    this.#paint();
  }
  /** Quien escribe desde aquí `{id, name, avatar?}`. Sin ella, se lee pero no se comenta. */
  get me(): ThreadUser | null {
    return this.#me && { ...this.#me };
  }
  set me(v: ThreadUser | null | undefined) {
    this.#me = cleanUser(v);
    this.#paint();
  }
  /** Campos anclables además de los `[data-thread]`: `name` o selectores. */
  get anchors(): string[] {
    return [...this.#anchors];
  }
  set anchors(v: string[] | null | undefined) {
    this.#anchors = Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 100) : [];
    this.#paint();
  }
  get readonly(): boolean {
    return boolAttr(this, "readonly");
  }
  set readonly(v: boolean) {
    this.toggleAttribute("readonly", !!v);
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    this.toggleAttribute("disabled", !!v);
  }
  get labels(): ThreadLabels {
    return this.#labels;
  }
  set labels(v: Partial<ThreadLabels> | null | undefined) {
    this.#labels = mergeLabels(THREAD_LABELS, v);
    this.#ctxSig = "";
    this.#paint();
  }
  /** Los comentarios (sin los que se están borrando). Asignarlos sirve sin `endpoint`. */
  get comments(): ThreadComment[] {
    return this.#comments.filter((c) => !this.#deleting.has(c.id));
  }
  set comments(v: ThreadComment[] | null | undefined) {
    this.#take(cleanComments(v ?? []));
  }

  // ---------------------------------------------------------------- API

  /** Vuelve a pedir los comentarios. */
  reload(): Promise<void> {
    return this.#load(this.#loaded);
  }
  /** Lleva el foco al redactor; con `anchor`, lo deja «Sobre: ese campo» (`null` lo quita). */
  focusComposer(anchor?: string | null): void {
    if (anchor !== undefined) {
      this.#anchor = anchor || null;
      this.#reply = null;
      this.#saveDraft();
      this.#paintComposer();
    }
    this.#ta?.focus();
  }
  /** Muestra solo lo anclado a un campo (`null`: todo). */
  filter(anchor: string | null): void {
    this.#filter = anchor || null;
    this.#limit = PAGE;
    this.#paint("bottom");
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
  }

  disconnectedCallback(): void {
    this.#stop();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    const prop = JSON_ATTRS[name];
    if (prop) {
      if (value === null) return;
      try {
        (this as unknown as Record<string, unknown>)[prop] = JSON.parse(value);
      } catch {
        console.warn(`[nx-thread] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (old === value || !this.#live) return this.#paint();
    if (name === "record" || name === "endpoint") this.#reset();
    else if (name === "stream" || name === "poll") this.#connect();
    else if (name === "presence") this.#watchPresence();
    else this.#paint();
  }

  #start(): void {
    if (this.#live) return;
    this.#live = true;
    const signal = (this.#life = new AbortController()).signal;
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && (this.#markSeen(), this.#times()), { signal });
    // Con el <script> en el <head>, el formulario de la página todavía no existe: globitos y presencia, al terminar.
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => (this.#watchPresence(), this.#paint()), { signal, once: true });
    this.#restoreDraft();
    void this.#load(this.#loaded);
    this.#connect();
    this.#tickT = window.setInterval(() => this.#times(), 60_000);
    this.#watchPresence();
    this.#paint();
  }

  #stop(): void {
    if (!this.#live) return;
    this.#live = false;
    for (const c of [this.#life, this.#ac, this.#sac]) c?.abort();
    clearTimeout(this.#sayT);
    clearInterval(this.#pollT);
    clearInterval(this.#tickT);
    this.#loading = false;
    this.#sayT = 0;
    // Lo que esperaba su tiempo de deshacer se borra ya (y su aviso se cierra).
    for (const [id, ac] of this.#deleting) {
      this.#deleting.delete(id);
      void this.#commitDelete(id);
      ac.abort();
    }
    for (const p of this.#pins.values()) p.remove();
    this.#pins.clear();
    this.#pres?.removeEventListener("nx-presence-change", this.#onPresence);
    this.#pres = null;
    this.#picker?.stop();
  }

  /** Otro registro (u otro servidor): de cero. */
  #reset(): void {
    this.#ac?.abort();
    this.#comments = [];
    this.#loaded = this.#failed = false;
    this.#mark = this.#filter = this.#editing = null;
    this.#open.clear();
    this.#limit = PAGE;
    this.#restoreDraft();
    void this.#load();
    this.#connect();
  }

  // ---------------------------------------------------------------- red

  async #req(method: string, id?: string, body?: unknown, keepalive = false): Promise<unknown> {
    const url = safeEndpoint(this.endpoint);
    // Sin `endpoint`, todo es local: la app escucha los eventos y guarda por su cuenta.
    if (!url) return null;
    const res = await fetch(id === undefined ? url : `${url.replace(/\/+$/, "")}/${encodeURIComponent(id)}`, {
      method,
      keepalive,
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: keepalive ? undefined : this.#life?.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.status === 204 ? null : res.json().catch(() => null);
  }

  async #load(quiet = false): Promise<void> {
    const url = safeEndpoint(this.endpoint);
    const rec = this.record;
    if (!url || !rec || !this.#live) return;
    this.#ac?.abort();
    const ac = (this.#ac = new AbortController());
    if (!quiet) {
      this.#loading = true;
      this.#failed = false;
      this.#paint();
    }
    try {
      const res = await fetch(withQuery(url, "record", rec), { headers: { Accept: "application/json" }, credentials: "same-origin", signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = cleanComments(await res.json());
      this.#loading = false;
      this.#failed = false;
      this.#take(list);
    } catch (e) {
      if (ac.signal.aborted) return;
      this.#loading = false;
      if (!quiet) this.#failed = true;
      this.#error("load", e);
      this.#paint();
    }
  }

  /** Lo que llega completo (la carga, o `comments`): se junta con lo que se está enviando. */
  #take(list: ThreadComment[]): void {
    const me = this.#me?.id;
    const before = new Set(this.#comments.flatMap((c) => [c.id, c.clientId ?? c.id]));
    this.#comments = mergeComments(
      this.#comments.filter((c) => c.state),
      list,
    );
    const first = !this.#loaded;
    if (first) {
      this.#loaded = true;
      const raw = stash(0, this.#seenKey());
      const i = firstUnread(this.#comments, raw === null ? null : Number(raw), me);
      this.#mark = i >= 0 ? this.#comments[i].id : null;
    } else for (const c of this.#comments) if (!before.has(c.id) && !(c.clientId && before.has(c.clientId)) && !c.state && c.author.id !== me) this.#announce(c);
    this.#changed(first ? "mark" : undefined);
  }

  #connect(): void {
    this.#sac?.abort();
    this.#stream = undefined;
    clearInterval(this.#pollT);
    if (!this.#live) return;
    if (safeEndpoint(this.stream)) {
      // El lector del stream (y el de líneas SSE/NDJSON) solo baja si hay stream.
      const ac = (this.#sac = new AbortController());
      import("./thread-live").then(({ threadListen }) => void (ac.signal.aborted || (this.#stream = threadListen(this.#liveHost, ac.signal))), (e) => this.#error("stream", e));
    } else if (this.poll) this.#pollT = window.setInterval(() => document.visibilityState !== "hidden" && void this.#load(true), this.poll * 1000);
  }

  #liveHost: ThreadLiveHost = {
    url: () => {
      const url = safeEndpoint(this.stream);
      const rec = this.record;
      return url && rec && this.#live ? withQuery(url, "record", rec) : null;
    },
    typingUrl: () => {
      const url = safeEndpoint(this.endpoint);
      return url ? `${url.replace(/\/+$/, "")}/typing` : null;
    },
    record: () => this.record,
    me: () => this.#me,
    labels: () => this.#labels,
    line: () => this.#typing,
    caughtUp: () => void this.#load(true),
    remove: (id) => {
      const ac = this.#deleting.get(id);
      this.#deleting.delete(id);
      ac?.abort();
      if (this.#find(id)) (this.#comments = this.#comments.filter((c) => c.id !== id)), this.#changed();
    },
    comment: (c) => {
      const known = this.#comments.some((x) => x.id === c.id || (c.clientId && x.id === c.clientId));
      this.#comments = mergeComments(this.#comments, [c]);
      if (!known && c.author.id !== this.#me?.id) this.#announce(c);
      this.#changed();
    },
    error: (e) => this.#error("stream", e),
  };

  // ---------------------------------------------------------------- acciones

  #find(id: string | null | undefined): ThreadComment | undefined {
    return id ? this.#comments.find((c) => c.id === id) : undefined;
  }
  #replace(c: ThreadComment): void {
    this.#comments = this.#comments.map((x) => (x.id === c.id ? c : x));
  }
  #byId(): Map<string, ThreadComment> {
    return new Map(this.#comments.map((c) => [c.id, c]));
  }
  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(`nx-thread-${type}`, { detail, bubbles: true, composed: true, cancelable }));
  }
  #error(action: ThreadErrorDetail["action"], e: unknown, id?: string): void {
    this.#emit("error", { action, message: errText(e), ...(id ? { id } : null) } satisfies ThreadErrorDetail);
  }
  #changed(mode?: "mark" | "bottom"): void {
    this.#markSeen();
    this.#paint(mode);
    this.#emit("change", { comments: this.comments });
  }
  #can(): boolean {
    return !!this.#me && !this.readonly && !this.disabled;
  }

  #submit(): void {
    const me = this.#me;
    const rec = this.record;
    const raw = this.#ta.value.trim();
    if (!me || !rec || !raw || this.readonly || this.disabled) return;
    const reply = this.#find(this.#reply);
    const d: ThreadPostDetail = { record: rec, text: encodeDraft(raw, this.#picks), clientId: `c${Date.now().toString(36)}${(++this.#seq).toString(36)}${Math.random().toString(36).slice(2, 7)}` };
    if (reply) d.replyTo = reply.id;
    else if (this.#anchor) d.anchor = this.#anchor;
    if (!this.#emit("post", d, true)) return;
    const c: ThreadComment = { id: d.clientId, clientId: d.clientId, author: me, text: d.text, at: new Date().toISOString(), state: "sending" };
    if (d.replyTo) c.replyTo = d.replyTo;
    if (d.anchor) c.anchor = d.anchor;
    this.#comments = [...this.#comments, c];
    this.#ta.value = "";
    this.#picks = [];
    this.#reply = null;
    // Sobre un campo que se está mirando, lo siguiente también suele ser sobre él.
    if (this.#anchor !== this.#filter) this.#anchor = null;
    this.#grow(this.#ta);
    this.#saveDraft();
    this.#picker?.close();
    this.#changed("bottom");
    void this.#post(c);
  }

  async #post(c: ThreadComment): Promise<void> {
    // Un reintento vuelve a «Enviando…» (con el mismo `clientId`: el servidor no lo duplica).
    if (c.state === "failed") this.#replace({ ...c, state: "sending" }), this.#paint();
    try {
      const data = await this.#req("POST", undefined, { record: this.record, text: c.text, anchor: c.anchor, replyTo: c.replyTo, clientId: c.clientId });
      const { state: _s, ...local } = c;
      const got = cleanComment(data) ?? local;
      got.clientId ??= c.clientId;
      if (!this.#find(c.id) && !this.#find(got.id)) return;
      this.#comments = mergeComments(this.#comments, [got]);
      this.#changed();
      const people = threadMentions(got.text);
      if (people.length) this.#emit("mention", { comment: got, people });
    } catch (e) {
      const cur = this.#find(c.id);
      if (cur) this.#replace({ ...cur, state: "failed" }), this.#changed();
      if (!this.#life?.signal.aborted) this.#error("post", e, c.id);
    }
  }

  /** Un cambio optimista (editar, resolver): se ve ya, y vuelve atrás si el servidor no lo acepta. */
  async #patch(c: ThreadComment, next: ThreadComment, body: object, action: "edit" | "resolve"): Promise<void> {
    this.#replace(next);
    this.#changed();
    try {
      const got = cleanComment(await this.#req("PATCH", c.id, body));
      if (got?.id === c.id) this.#replace(got), this.#changed();
      if (action === "edit") {
        const was = new Set(threadMentions(c.text).map((p) => p.id));
        const people = threadMentions(next.text).filter((p) => !was.has(p.id));
        if (people.length) this.#emit("mention", { comment: got ?? next, people });
      }
    } catch (e) {
      if (this.#find(c.id) === next) this.#replace(c), this.#changed();
      if (action === "edit") this.#say(this.#labels.editFailed);
      this.#error(action, e, c.id);
    }
  }

  #saveEdit(): void {
    const c = this.#find(this.#editing);
    const raw = this.#editText.trim();
    this.#editing = null;
    this.#picker?.close();
    if (!c || !raw) return this.#paint();
    const text = encodeDraft(raw, this.#editPicks);
    if (text === c.text) return this.#paint();
    void this.#patch(c, { ...c, text, editedAt: new Date().toISOString() }, { text }, "edit");
  }

  #resolve(c: ThreadComment, on: boolean): void {
    const next: ThreadComment = { ...c, resolved: on };
    if (on && this.#me) next.resolvedBy = this.#me.name;
    if (!on) delete next.resolved, delete next.resolvedBy;
    this.#open.delete(c.id);
    void this.#patch(c, next, { resolved: on }, "resolve");
  }

  /** Borrar: se va al instante, con «Deshacer» en un aviso (`nxToast`, que se carga con `import()`). */
  #del(c: ThreadComment): void {
    if (c.state === "failed") return void ((this.#comments = this.#comments.filter((x) => x !== c)), this.#changed());
    if (c.state) return;
    const ac = new AbortController();
    this.#deleting.set(c.id, ac);
    this.#changed();
    import("../toast/index")
      .then(({ nxToast }) => nxToast({ message: this.#labels.deleted, undo: true, signal: ac.signal }))
      .catch(() => "timeout")
      .then((r) => {
        // Ya se borró (el hilo salió del DOM) o lo borró otra persona.
        if (!this.#deleting.delete(c.id)) return;
        if (r === "undo") this.#changed();
        else void this.#commitDelete(c.id);
      });
  }

  async #commitDelete(id: string): Promise<void> {
    const c = this.#find(id);
    if (!c) return;
    this.#comments = this.#comments.filter((x) => x !== c);
    this.#changed();
    try {
      // `keepalive`: también sale si el hilo se está yendo de la página.
      await this.#req("DELETE", id, undefined, true);
    } catch (e) {
      this.#comments = mergeComments(this.#comments, [c]);
      this.#changed();
      this.#error("delete", e, id);
    }
  }

  // ---------------------------------------------------------------- borrador, lo leído, anuncios

  #seenKey(): string {
    return `nx-thread-seen:${this.record ?? ""}:${this.#me?.id ?? ""}`;
  }
  #markSeen(): void {
    const t = latestAt(this.#comments);
    if (t !== null && this.record && typeof document !== "undefined" && document.visibilityState !== "hidden") stash(0, this.#seenKey(), String(t));
  }
  #saveDraft(): void {
    const rec = this.record;
    if (!rec || !this.#ta) return;
    const text = this.#ta.value;
    const keep = text.trim() || this.#anchor || this.#reply;
    stash(1, `nx-thread-draft:${rec}`, keep ? JSON.stringify({ text, picks: this.#picks, anchor: this.#anchor ?? undefined, replyTo: this.#reply ?? undefined }) : null);
  }
  #restoreDraft(): void {
    const rec = this.record;
    const d = rec ? cleanDraft(stash(1, `nx-thread-draft:${rec}`)) : null;
    this.#ta.value = d?.text ?? "";
    this.#picks = d?.picks ?? [];
    this.#anchor = d?.anchor ?? null;
    this.#reply = d?.replyTo ?? null;
    this.#ctxSig = "";
    queueMicrotask(() => this.#grow(this.#ta));
  }
  #say(text: string): void {
    this.#sr.textContent = "";
    this.#sr.textContent = text;
  }
  /** Lo nuevo de los demás se anuncia agrupado: «Nuevo comentario de Laura» o «3 comentarios nuevos». */
  #announce(c: ThreadComment): void {
    this.#news.push(c.author.name);
    if (this.#sayT) return;
    this.#sayT = window.setTimeout(() => {
      const n = this.#news;
      const L = this.#labels;
      this.#sayT = 0;
      this.#news = [];
      this.#say(n.length === 1 ? fill(L.newOne, { name: n[0] }) : fill(L.newMany, { n: n.length }));
    }, 1000);
  }

  // ---------------------------------------------------------------- campos anclables

  #scope(): ParentNode {
    const r = this.getRootNode();
    return r !== this && "querySelectorAll" in r ? (r as ParentNode) : this.ownerDocument;
  }
  /**
   * Los campos anclables (`thread-anchors.ts`, con `import()` solo si la página tiene `[data-thread]`
   * o hay `anchors`). Mientras llega, ninguno: al llegar se vuelve a pintar.
   */
  #fields(): Field[] {
    const scope = this.#scope();
    if (!this.#live) return [];
    if (this.#anch) return this.#anch.threadFields(scope, this.#anchors, this);
    if (!this.#anchP && (this.#anchors.length || scope.querySelector("[data-thread]")))
      this.#anchP = import("./thread-anchors").then(
        (m) => ((this.#anch = m), this.#paint()),
        () => (this.#anchP = undefined),
      );
    return [];
  }
  #fieldLabel(key: string, fields = this.#fields()): string {
    return fields.find((f) => f.key === key)?.label ?? key;
  }

  #pinClick(key: string): void {
    const off = this.#filter === key;
    this.filter(off ? null : key);
    if (!off && this.#can()) this.focusComposer(key);
  }

  // ---------------------------------------------------------------- presencia

  #onPresence = (): void => {
    const users = (this.#pres as unknown as { users?: unknown })?.users;
    const names = (Array.isArray(users) ? users : []).filter((u) => u && u.id !== this.#me?.id && !u.idle && typeof u.name === "string").map((u) => firstName(u.name));
    const L = this.#labels;
    this.#here.hidden = !names.length;
    this.#here.textContent = names.length ? fill(names.length > 1 ? L.viewingMany : L.viewing, { names: threadNames(names, L.and, L.more) }) : "";
  };
  #watchPresence(): void {
    const id = this.presence;
    const el = id ? this.ownerDocument.getElementById(id) : this.ownerDocument.querySelector("nx-presence");
    if (el !== this.#pres) {
      this.#pres?.removeEventListener("nx-presence-change", this.#onPresence);
      el?.addEventListener("nx-presence-change", this.#onPresence);
      this.#pres = el;
    }
    this.#onPresence();
  }

  // ---------------------------------------------------------------- construcción

  #build(): void {
    this.#built = true;
    const id = this.#uid;
    this.#title = h("h2", { class: "nx-thread__title", id: `${id}-t` });
    this.#count = h("span", { class: "nx-thread__count" });
    this.#here = h("p", { class: "nx-thread__here", hidden: true });
    this.#bar = h("p", { class: "nx-thread__bar", hidden: true });
    this.#older = h("button", { type: "button", class: "nx-thread__older", "data-a": "older", hidden: true });
    this.#list = h("ol", { class: "nx-thread__days", "aria-labelledby": `${id}-t` });
    this.#msg = h("div", { class: "nx-thread__msg" });
    this.#body = h("div", { class: "nx-thread__body" }, this.#older, this.#list, this.#msg);
    this.#typing = h("p", { class: "nx-thread__typing", hidden: true });
    this.#ctx = h("div", { class: "nx-thread__ctx" });
    this.#ta = h("textarea", { class: "nx-thread__input", rows: 1, "aria-autocomplete": "list", "aria-describedby": `${id}-h` });
    this.#send = h("button", { type: "submit", class: "nx-thread__send" });
    this.#hint = h("p", { class: "nx-thread__hint", id: `${id}-h` });
    this.#form = h("form", { class: "nx-thread__compose" }, this.#ctx, h("div", { class: "nx-thread__box" }, this.#ta, this.#send), this.#hint);
    this.#sr = h("span", { class: "nx-thread__sr", role: "status" });
    this.append(h("header", { class: "nx-thread__head" }, h("div", null, this.#title, this.#count), this.#here), this.#bar, this.#body, this.#typing, this.#form, this.#sr);

    this.#form.addEventListener("submit", (e) => (e.preventDefault(), this.#submit()));
    this.addEventListener("click", (e) => this.#onClick(e));
    this.addEventListener("keydown", (e) => this.#onKey(e));
    this.addEventListener("input", (e) => {
      const ta = e.target as HTMLTextAreaElement;
      if (ta === this.#ta) this.#saveDraft(), this.#stream?.typed();
      else if (ta.dataset.a === "text") this.#editText = ta.value;
      else return;
      this.#grow(ta);
      this.#withPicker((p) => p.input(ta));
    });
    this.addEventListener("change", (e) => {
      const s = e.target as HTMLSelectElement;
      if (s.dataset.a !== "on") return;
      this.#anchor = s.value || null;
      this.#saveDraft();
      this.#paintComposer();
      this.#ta.focus();
    });
    this.addEventListener("focusout", (e) => {
      this.#picker?.blur(e.target);
      this.#picker?.hide(e.target);
    });
    // Entrar a una caja trae la lista de sugerencias; señalar o enfocar una ficha, su tarjeta.
    const ref = (e: Event) => {
      const t = e.target as Element;
      const a = t.closest?.<HTMLElement>(".nx-thread__ref");
      if (a) this.#withPicker((p) => p.show(a));
      else if (t.localName === "textarea") this.#withPicker(() => {});
    };
    this.addEventListener("focusin", ref);
    this.addEventListener("pointerover", ref);
    this.addEventListener("pointerout", (e) => {
      const a = (e.target as Element).closest?.(".nx-thread__ref");
      if (a && !a.contains(e.relatedTarget as Node)) this.#picker?.hide(a);
    });
  }

  #withPicker(fn: (p: ThreadPicker) => void): void {
    if (this.#picker) return fn(this.#picker);
    this.#pickerP ??= import("./thread-pick").then(
      ({ ThreadPicker }) =>
        (this.#picker = new ThreadPicker({
          el: this,
          uid: this.#uid,
          refs: this.#refs,
          labels: () => this.#labels,
          patterns: () => this.#patterns,
          source: (k) => (k === "mention" ? this.peopleSource : this.refsSource),
          avatar: (u) => this.#avatar(u),
          picked: (ta, p) => {
            const picks = ta === this.#ta ? this.#picks : this.#editPicks;
            if (!picks.some((x) => x.token === p.token)) picks.push(p);
            if (ta === this.#ta) this.#saveDraft();
            else this.#editText = ta.value;
            this.#grow(ta);
          },
          learned: () => this.#paint(),
        })),
    );
    // Sin red para el chunk: se vuelve a intentar la próxima vez.
    this.#pickerP.then((p) => this.#live && fn(p), () => (this.#pickerP = undefined));
  }

  #onClick(e: MouseEvent): void {
    const b = (e.target as Element).closest<HTMLElement>("button[data-a]");
    if (!b || !this.contains(b)) return;
    const a = b.dataset.a!;
    const c = this.#find(b.closest<HTMLElement>("[data-id]")?.dataset.id);
    if (a === "older") {
      this.#limit += PAGE;
      return this.#paint("older");
    }
    if (a === "load") return void this.#load();
    if (a === "all" || a === "about") return this.filter(a === "all" ? null : b.dataset.v!);
    if (a === "x-reply") this.#reply = null;
    else if (a === "x-anchor") this.#anchor = null;
    if (a.startsWith("x-")) {
      this.#saveDraft();
      this.#paintComposer();
      return this.#ta.focus();
    }
    if (!c) return;
    if (a === "goto") {
      const li = [...this.#list.querySelectorAll<HTMLElement>("li[data-id]")].find((x) => x.dataset.id === b.dataset.v);
      li?.scrollIntoView?.({ block: "nearest" });
      return li?.querySelector<HTMLElement>("article, button")?.focus();
    }
    if (a === "unfold" || a === "fold") {
      if (a === "unfold") this.#open.add(c.id);
      else this.#open.delete(c.id);
      this.#paint();
      return [...this.#list.querySelectorAll<HTMLElement>("li[data-id]")].find((x) => x.dataset.id === c.id)?.querySelector<HTMLElement>("button")?.focus();
    }
    if (a === "retry") return void this.#post(c);
    if (a === "reply") {
      this.#reply = c.id;
      this.#saveDraft();
      this.#paintComposer();
      return this.#ta.focus();
    }
    if (a === "edit") {
      const d = decodeDraft(c.text);
      this.#editing = c.id;
      this.#editText = d.text;
      this.#editPicks = d.picks;
      this.#paint();
      const ta = this.#list.querySelector<HTMLTextAreaElement>("[data-a=text]");
      ta?.focus();
      return ta?.setSelectionRange(ta.value.length, ta.value.length);
    }
    if (a === "cancel") return this.#cancelEdit();
    if (a === "save") return this.#saveEdit();
    if (a === "del") return this.#del(c);
    if (a === "resolve" || a === "reopen") this.#resolve(c, a === "resolve");
  }

  #cancelEdit(): void {
    const id = this.#editing;
    this.#editing = null;
    this.#picker?.close();
    this.#paint();
    [...this.#list.querySelectorAll<HTMLElement>("li[data-id]")].find((x) => x.dataset.id === id)?.querySelector<HTMLElement>("[data-a=edit]")?.focus();
  }

  #onKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement;
    if (e.key === "Escape") this.#picker?.hide();
    if (t.localName !== "textarea" || e.isComposing) return;
    const ta = t as HTMLTextAreaElement;
    if (this.#picker?.key(e, ta)) return;
    const edit = ta !== this.#ta;
    // En un celular (sin teclado físico), Enter es un salto de línea: se envía con el botón.
    const coarse = typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (e.key === "Enter" && !e.shiftKey && !coarse) {
      e.preventDefault();
      if (edit) this.#saveEdit();
      else this.#submit();
    } else if (e.key === "Escape" && edit) {
      e.preventDefault();
      this.#cancelEdit();
    }
  }

  #grow(ta: HTMLTextAreaElement): void {
    ta.style.height = "";
    if (ta.scrollHeight) ta.style.height = `${ta.scrollHeight + 2}px`;
  }

  // ---------------------------------------------------------------- pintado

  #paint(mode?: "mark" | "bottom" | "older"): void {
    if (!this.#built) return;
    const L = this.#labels;
    const fields = this.#live ? this.#fields() : [];
    this.#title.textContent = L.heading;
    const n = this.comments.length;
    this.#count.textContent = n ? n.toLocaleString(resolveLocale(this)) : "";
    this.#onPresence();
    const f = this.#filter;
    this.#bar.hidden = !f;
    if (f) this.#bar.replaceChildren(h("span", null, fill(L.filtered, { field: this.#fieldLabel(f, fields) })), h("button", { type: "button", "data-a": "all" }, L.showAll));
    this.#paintList(mode, fields);
    this.#paintComposer(fields);
    if (this.#live && this.#anch) this.#anch.threadPins(this.#pins, fields, anchorCounts(this.comments), this.#filter, this.#labels, (k) => this.#pinClick(k));
  }

  /** Lo que se ve: sin lo que se está borrando, lo del campo filtrado, y lo resuelto plegado. */
  #view(byId: Map<string, ThreadComment>): ThreadComment[] {
    return this.#comments.filter((c) => {
      if (this.#deleting.has(c.id)) return false;
      const r = threadRoot(byId, c);
      if (this.#filter && r.anchor !== this.#filter) return false;
      return !(r.resolved && r !== c && !this.#open.has(r.id));
    });
  }

  #paintList(mode: "mark" | "bottom" | "older" | undefined, fields: Field[]): void {
    const L = this.#labels;
    const loc = resolveLocale(this);
    const now = new Date();
    const body = this.#body;
    const list = this.#list;
    const near = body.scrollHeight - body.scrollTop - body.clientHeight < 48;
    const h0 = body.scrollHeight;
    // El foco vuelve a lo mismo después de pintar (el botón de ese comentario, o la caja de edición).
    const act = document.activeElement as HTMLElement | null;
    const fk = act && list.contains(act) ? [act.closest<HTMLElement>("li[data-id]")?.dataset.id, act.dataset.a, (act as HTMLTextAreaElement).selectionStart] : null;
    const byId = this.#byId();
    const view = this.#view(byId);
    if (mode === "mark" && this.#mark) {
      const i = view.findIndex((c) => c.id === this.#mark);
      if (i >= 0 && view.length - i > this.#limit) this.#limit = Math.min(view.length - i + 3, 500);
    }
    const shown = view.slice(-this.#limit);
    const hidden = view.length - shown.length;
    this.#older.hidden = !hidden;
    this.#older.textContent = fill(L.older, { n: hidden.toLocaleString(loc) });
    this.#day = dayOf(+now);
    list.setAttribute("aria-busy", String(this.#loading));
    list.replaceChildren(
      ...groupThreadByDay(shown).map((g) =>
        h(
          "li",
          { class: "nx-thread__day" },
          h("h3", null, threadDayLabel(g.day, now, loc, L.today, L.yesterday)),
          h("ol", null, ...g.items.flatMap((c) => [c.id === this.#mark ? h("li", { class: "nx-thread__unread" }, h("span", null, L.unread)) : null, this.#item(c, byId, now, loc, fields)])),
        ),
      ),
    );
    const msg = this.#msg;
    msg.removeAttribute("role");
    if (this.#loading) msg.replaceChildren(L.loading);
    else if (this.#failed) msg.setAttribute("role", "alert"), msg.replaceChildren(L.loadFailed, " ", h("button", { type: "button", "data-a": "load" }, L.retry));
    else msg.replaceChildren(view.length ? "" : L.empty);
    msg.hidden = !msg.textContent;
    if (fk) {
      const li = [...list.querySelectorAll<HTMLElement>("li[data-id]")].find((x) => x.dataset.id === fk[0]);
      const el = li?.querySelector<HTMLElement>(fk[1] ? `[data-a="${fk[1]}"]` : "article") ?? li?.querySelector<HTMLElement>("button");
      el?.focus({ preventScroll: true });
      if (el instanceof HTMLTextAreaElement && typeof fk[2] === "number") el.setSelectionRange(fk[2], fk[2]);
    }
    const edit = list.querySelector<HTMLTextAreaElement>("[data-a=text]");
    if (edit) this.#grow(edit);
    const unread = list.querySelector<HTMLElement>(".nx-thread__unread");
    if (mode === "older") body.scrollTop += body.scrollHeight - h0;
    else if (mode === "mark" && unread) body.scrollTop = unread.offsetTop - 8;
    else if (mode || near) body.scrollTop = body.scrollHeight;
  }

  #avatar(u: ThreadUser): HTMLElement {
    const src = safeImageSrc(u.avatar);
    return h("span", { class: "nx-thread__av", "aria-hidden": "true", style: `--h:${hueOf(u.id)}` }, src ? h("img", { src, alt: "", loading: "lazy", referrerpolicy: "no-referrer" }) : initials(u.name));
  }

  #tokensOf(c: ThreadComment): ThreadToken[] {
    let t = this.#tokens.get(c);
    if (!t) this.#tokens.set(c, (t = parseThreadText(c.text, this.#patterns)));
    for (const r of c.refs ?? []) if (!this.#refs.has(r.id)) this.#refs.set(r.id, r);
    return t;
  }

  /** El texto de un comentario: nodos de texto, fichas y enlaces. Nunca HTML. */
  #render(c: ThreadComment): (Node | string)[] {
    const me = this.#me?.id;
    return this.#tokensOf(c).map((t) => {
      if (t.type === "text") return t.text;
      if (t.type === "br") return h("br");
      if (t.type === "mention") return h("span", { class: "nx-thread__mention", "data-id": t.id, "data-me": t.id === me ? "" : null }, `@${t.name}`);
      if (t.type === "url") return h("a", { class: "nx-thread__url", href: t.href, rel: "noopener noreferrer", target: "_blank", title: t.text === t.href ? null : t.href }, t.text);
      const href = safeHref(this.#refs.get(t.id)?.href);
      return href ? h("a", { class: "nx-thread__ref", href, "data-id": t.id }, t.label) : h("span", { class: "nx-thread__ref", tabindex: 0, "data-id": t.id }, t.label);
    });
  }

  #item(c: ThreadComment, byId: Map<string, ThreadComment>, now: Date, loc: string, fields: Field[]): HTMLLIElement {
    const L = this.#labels;
    const root = threadRoot(byId, c);
    const isRoot = root === c;
    const btn = (a: string, text: string, v?: string) => h("button", { type: "button", "data-a": a, "data-v": v }, text);
    if (isRoot && c.resolved && !this.#open.has(c.id)) {
      const by = c.resolvedBy ? fill(L.resolvedBy, { name: c.resolvedBy }) : L.resolvedBy.replace(/\s*\S*\s*\{name\}/, "");
      return h("li", { class: "nx-thread__fold", "data-id": c.id }, h("span", null, c.anchor ? `${fill(L.about, { field: this.#fieldLabel(c.anchor, fields) })} · ` : "", by), btn("unfold", L.show));
    }
    const mine = !!this.#me && c.author.id === this.#me.id;
    const can = this.#can();
    const n = ++this.#seq;
    const d = new Date(atTime(c.at));
    const parent = byId.get(c.replyTo!);
    const edit = this.#editing === c.id;
    const acts = !can || c.state ? [] : [btn("reply", L.reply), mine && btn("edit", L.edit), mine && btn("del", L.delete), isRoot && c.anchor && btn(c.resolved ? "reopen" : "resolve", c.resolved ? L.reopen : L.resolve)];
    if (isRoot && c.resolved) acts.push(btn("fold", L.hide));
    if (c.state === "failed" && mine && can) acts.push(btn("del", L.delete));
    let body: HTMLElement;
    if (edit) {
      const ta = h("textarea", { class: "nx-thread__input", "data-a": "text", rows: 1, "aria-label": L.edit, "aria-autocomplete": "list" });
      ta.value = this.#editText;
      body = h("div", { class: "nx-thread__editbox" }, ta, h("div", { class: "nx-thread__acts" }, h("button", { type: "button", "data-a": "save", class: "nx-thread__primary" }, L.save), btn("cancel", L.cancel)));
    } else body = h("p", { class: "nx-thread__text" }, ...this.#render(c));
    return h(
      "li",
      { "data-id": c.id },
      h(
        "article",
        { class: "nx-thread__c", tabindex: -1, "aria-labelledby": `${this.#uid}-a${n} ${this.#uid}-w${n}`, "data-state": c.state ?? null, "data-mine": mine ? "" : null, "data-resolved": c.resolved ? "" : null },
        this.#avatar(c.author),
        h(
          "div",
          { class: "nx-thread__main" },
          h(
            "p",
            { class: "nx-thread__meta" },
            h("strong", { id: `${this.#uid}-a${n}` }, c.author.name),
            h("time", { id: `${this.#uid}-w${n}`, datetime: c.at, title: stampText(d, loc), "data-t": +d }, relTime(d, now, loc)),
            c.editedAt ? h("span", { class: "nx-thread__edited", title: stampText(new Date(atTime(c.editedAt)), loc) }, L.edited) : null,
            isRoot && c.anchor && this.#filter !== c.anchor ? h("button", { type: "button", class: "nx-thread__about", "data-a": "about", "data-v": c.anchor }, fill(L.about, { field: this.#fieldLabel(c.anchor, fields) })) : null,
          ),
          c.replyTo
            ? h("p", { class: "nx-thread__quote" }, parent ? h("button", { type: "button", "data-a": "goto", "data-v": parent.id }, h("strong", null, parent.author.name), " ", threadPlainText(this.#tokensOf(parent)).slice(0, 120)) : L.gone)
            : null,
          body,
          c.state ? h("p", { class: "nx-thread__state" }, c.state === "sending" ? L.sending : L.failed, c.state === "failed" && can ? btn("retry", L.retry) : null) : null,
          acts.some(Boolean) ? h("div", { class: "nx-thread__acts" }, ...acts) : null,
        ),
      ),
    );
  }

  /** Las horas relativas, cada minuto (y todo de nuevo si cambió el día: «Hoy» pasa a «Ayer»). */
  #times(): void {
    if (!this.#built || document.visibilityState === "hidden") return;
    const now = new Date();
    if (dayOf(+now) !== this.#day) return this.#paint();
    const loc = resolveLocale(this);
    for (const t of this.#list.querySelectorAll<HTMLElement>("time[data-t]")) t.textContent = relTime(new Date(Number(t.dataset.t)), now, loc);
  }

  #paintComposer(fields = this.#live ? this.#fields() : []): void {
    if (!this.#built) return;
    const L = this.#labels;
    const show = !!this.#me && !this.readonly;
    this.#form.hidden = !show;
    if (!show) return;
    const off = this.disabled;
    this.#ta.disabled = this.#send.disabled = off;
    this.#ta.placeholder = L.placeholder;
    this.#ta.setAttribute("aria-label", L.placeholder);
    this.#send.textContent = L.send;
    this.#hint.textContent = L.hint;
    const reply = this.#find(this.#reply);
    if (this.#reply && !reply && this.#loaded) this.#reply = null;
    const anchor = reply ? threadRoot(this.#byId(), reply).anchor : this.#anchor;
    const sig = JSON.stringify([reply?.id, reply?.author.name, anchor, fields.map((f) => [f.key, f.label]), off, L.remove]);
    if (sig === this.#ctxSig) return;
    this.#ctxSig = sig;
    const chip = (text: string, act: string | null) => h("span", { class: "nx-thread__chip" }, text, act ? h("button", { type: "button", "data-a": act, "aria-label": `${L.remove}: ${text}`, disabled: off }, "×") : null);
    this.#ctx.replaceChildren(
      reply ? chip(fill(L.replyingTo, { name: reply.author.name }), "x-reply") : "",
      anchor ? chip(fill(L.about, { field: this.#fieldLabel(anchor, fields) }), reply ? null : "x-anchor") : "",
      !reply && !anchor && fields.length
        ? h("select", { class: "nx-thread__on", "data-a": "on", "aria-label": L.aboutField, disabled: off }, h("option", { value: "" }, L.aboutField), ...fields.map((f) => h("option", { value: f.key }, f.label)))
        : "",
    );
  }
}

for (const [p, a] of [["record"], ["endpoint"], ["stream"], ["peopleSource", "people-source"], ["refsSource", "refs-source"], ["presence"], ["locale"]]) {
  const name = a ?? p;
  Object.defineProperty(NxThread.prototype, p, {
    configurable: true,
    get(this: Element) {
      return this.getAttribute(name);
    },
    set(this: Element, v: string | null) {
      if (v) this.setAttribute(name, v);
      else this.removeAttribute(name);
    },
  });
}
