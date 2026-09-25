/**
 * `<nx-sync>`: el estado de la cola sin conexión (`nxSync`) en una píldora. «En línea» discreta
 * en verde; «Sin conexión · 3 pendientes» en ámbar; «Sincronizando 2 de 5…» con su avance; «1
 * conflicto» en rojo, que se nota. Al pulsarla, un panel con cada operación (hace cuánto, intentos,
 * cuenta regresiva del próximo) y lo que se puede hacer: reintentar ya, descartar, resolver un
 * conflicto campo por campo o corregir el cuerpo de una que el servidor rechazó.
 *
 * El elemento solo muestra y maneja la cola de la página; la app encola con `nxSync.enqueue()`.
 * Anuncia (`aria-live`) cuando se va y vuelve la conexión y cuando termina de sincronizar.
 */
import { Base } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import { ago, cleanFields, countdown, diffFields, fieldLabel, midDiff, nxSync, plural, resolveBody } from "./logic";
import type { SyncChangeDetail, SyncEvent, SyncField, SyncJson, SyncLabels, SyncOp, SyncState } from "./types";

export const SYNC_LABELS: SyncLabels = {
  online: "En línea",
  offline: "Sin conexión",
  pendingOne: "{n} pendiente",
  pendingMany: "{n} pendientes",
  syncing: "Sincronizando {i} de {n}…",
  retryIn: "Reintento en {t}",
  conflictOne: "{n} conflicto",
  conflictMany: "{n} conflictos",
  failedOne: "{n} no se pudo enviar",
  failedMany: "{n} no se pudieron enviar",
  heading: "Sincronización",
  upToDate: "Todo está al día",
  emptyHint: "Lo que hagas sin conexión se guarda en este dispositivo y se envía solo cuando vuelva la señal.",
  syncNow: "Sincronizar ahora",
  pending: "En cola",
  sending: "Enviando…",
  waiting: "En espera",
  conflict: "Conflicto",
  failed: "Rechazado",
  sent: "Enviado",
  attemptOne: "{n} intento",
  attemptMany: "{n} intentos",
  nextIn: "reintento en {t}",
  retry: "Reintentar ya",
  discard: "Descartar",
  confirmDiscard: "¿Descartar? No se enviará.",
  cancel: "Cancelar",
  resolve: "Resolver",
  edit: "Corregir",
  back: "Volver a la lista",
  resolveTitle: "Resolver conflicto",
  resolveHint: "Alguien más cambió este registro mientras tanto. Elige qué valor queda en cada campo.",
  mine: "Lo mío",
  theirs: "Del servidor",
  allMine: "Todo lo mío",
  allTheirs: "Todo lo del servidor",
  same: "{n} campos iguales no se muestran.",
  sameOne: "1 campo igual no se muestra.",
  send: "Enviar versión resuelta",
  blank: "(vacío)",
  yes: "Sí",
  no: "No",
  editTitle: "Corregir y reintentar",
  editHint: "El servidor rechazó el envío. Corrige los datos y vuelve a intentarlo.",
  data: "Datos (JSON)",
  invalid: "No es JSON válido: {msg}",
  sendEdit: "Reintentar con estos datos",
  liveOffline: "Sin conexión. Tus cambios se guardan en este dispositivo y se envían al volver la señal.",
  liveOnline: "Conexión restablecida.",
  liveDone: "Todo sincronizado.",
  liveConflict: "Conflicto en «{label}»: hay que resolverlo.",
  liveFailed: "No se pudo enviar «{label}».",
  noNetwork: "Sin conexión",
  unavailable: "El servidor no responde ({status})",
  rejected: "El servidor lo rechazó ({status})",
  auth: "Inicia sesión para enviar",
  liveAuth: "La sesión venció: los cambios esperan a que vuelvas a iniciar sesión.",
  unnamed: "Cambio sin nombre",
  notDurable: "Este navegador no deja guardar en el dispositivo: si cierras la página antes de sincronizar, se pierde lo pendiente.",
};

const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
const UP = '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>';
const ALERT = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const X = '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>';
const OFF = '<path d="m2 2 20 20"/><path d="M5.8 5.8A7 7 0 0 0 7 19h11a4.5 4.5 0 0 0 1.9-.4M22 14.5A4.5 4.5 0 0 0 17.5 10h-1.8A7 7 0 0 0 9.4 5.4"/>';
const BACK = '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>';
const ICONS: Record<string, string> = { pending: CLOCK, waiting: CLOCK, sending: UP, conflict: ALERT, failed: X, sent: CHECK };
const PROPS = ["labels", "fields", "ping"] as const;

type View = { kind: "list" } | { kind: "resolve"; id: string; theirs: Set<string> } | { kind: "edit"; id: string };

let uid = 0;

export class NxSync extends Base {
  static observedAttributes = ["labels", "fields", "ping", "locale"];

  #uid = `nx-sync${++uid}`;
  #labels: SyncLabels = SYNC_LABELS;
  #fields: SyncField[] = [];
  #state: SyncState = { online: true, ops: [], pending: 0, conflicts: 0, failed: 0, progress: null, ready: false, durable: true, auth: false };
  #view: View = { kind: "list" };
  /** La vista que está pintada (para no rehacer el comparador a cada cambio de la cola). */
  #painted = "";
  /** La operación cuyo descarte espera confirmación. */
  #confirm: string | null = null;
  /** Las que se acaban de enviar: se ven un momento con su ✓ antes de irse. */
  #sent = new Map<string, SyncOp>();
  /** Las filas ya pintadas con el panel abierto (solo las nuevas entran con animación). */
  #shown = new Set<string>();
  #last = "";
  #isOpen = false;
  /** La lista del panel se rehace una vez por tanda de cambios (no una por cada aviso de la cola). */
  #listQueued = false;
  #off?: () => void;
  #tick?: ReturnType<typeof setInterval>;
  #track?: () => void;
  #built = false;
  // Nodos.
  #pill?: HTMLButtonElement;
  #text?: HTMLSpanElement;
  #pop?: HTMLDivElement;
  #live?: HTMLParagraphElement;

  // ---------------------------------------------------------------- propiedades

  get labels(): SyncLabels {
    return this.#labels;
  }
  set labels(v: Partial<SyncLabels> | null | undefined) {
    this.#labels = mergeLabels(SYNC_LABELS, v);
    this.#paint(true);
  }
  /** Nombres de los campos para el comparador, con comodines y hermanos entre llaves:
   *  `[{key: "productos.*.cantidad", label: "Cantidad · {nombre}"}]`. */
  get fields(): SyncField[] {
    return this.#fields;
  }
  set fields(v: SyncField[] | null | undefined) {
    this.#fields = cleanFields(v).filter((f) => f.label);
    this.#paint(true);
  }
  /** URL para comprobar que hay conexión de verdad (ajusta la cola de la página). Solo del mismo
   *  origen (o uno de `allowOrigins`): otra, y la cola sigue sin `ping`. */
  get ping(): string | null {
    return this.getAttribute("ping");
  }
  set ping(v: string | null) {
    if (v) this.setAttribute("ping", v);
    else this.removeAttribute("ping");
  }
  /** Hay red y el servidor contesta. */
  get online(): boolean {
    return this.#state.online;
  }
  /** Cuántas operaciones faltan por enviar. */
  get pending(): number {
    return this.#state.pending;
  }
  get conflicts(): number {
    return this.#state.conflicts;
  }
  /** El estado completo de la cola. */
  get state(): SyncState {
    return this.#state;
  }
  get open(): boolean {
    return this.#isOpen;
  }

  // ---------------------------------------------------------------- API

  show(): void {
    if (this.#pop && !this.open) this.#pop.showPopover?.();
  }
  hide(): void {
    if (this.open) this.#pop!.hidePopover?.();
  }
  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }
  /** Abre el comparador de un conflicto. */
  resolve(id: string): void {
    this.#go({ kind: "resolve", id, theirs: new Set() });
    this.show();
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
    if (this.ping) nxSync.configure({ ping: safeEndpoint(this.ping) ?? null });
    this.#off ??= nxSync.subscribe((s, e) => this.#onState(s, e));
  }

  disconnectedCallback(): void {
    this.#off?.();
    this.#off = undefined;
    this.#track?.();
    clearInterval(this.#tick);
    this.#tick = undefined;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "labels" || name === "fields") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-sync] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "ping" && this.isConnected) nxSync.configure({ ping: safeEndpoint(value) ?? null });
    this.#paint(true);
  }

  // ---------------------------------------------------------------- interno

  /** Un número con el formato del locale («1.250»). */
  #num(n: number): string {
    try {
      return n.toLocaleString(resolveLocale(this));
    } catch {
      return String(n);
    }
  }

  #onState(s: SyncState, e?: SyncEvent): void {
    this.#state = s;
    const L = this.#labels;
    if (e?.type === "done") {
      this.#sent.set(e.op.id, e.op);
      setTimeout(() => this.#sent.delete(e.op.id) && this.#paint(), 1400);
      this.dispatchEvent(new CustomEvent("nx-sync-done", { detail: { op: e.op, data: e.data }, bubbles: true, composed: true }));
    }
    if (e?.type === "auth") this.dispatchEvent(new CustomEvent("nx-sync-auth", { detail: { op: e.op }, bubbles: true, composed: true }));
    const say =
      e?.type === "offline"
        ? L.liveOffline
        : e?.type === "online"
          ? L.liveOnline
          : e?.type === "idle"
            ? L.liveDone
            : e?.type === "auth"
              ? L.liveAuth
              : e?.type === "conflict" || e?.type === "failed"
                ? (e.type === "conflict" ? L.liveConflict : L.liveFailed).replace("{label}", this.#name(e.op))
                : "";
    if (say && this.#live) this.#live.textContent = say + (this.#live.textContent === say ? " " : "");
    const detail: SyncChangeDetail = { online: s.online, pending: s.pending, conflicts: s.conflicts };
    const key = JSON.stringify(detail);
    if (key !== this.#last) {
      this.#last = key;
      this.dispatchEvent(new CustomEvent("nx-sync-change", { detail, bubbles: true, composed: true }));
    }
    this.#paint();
  }

  #build(): void {
    this.#built = true;
    const popId = `${this.#uid}-pop`;
    this.#text = h("span", { class: "nx-sync__text" });
    this.#pill = h("button", { type: "button", class: "nx-sync__pill", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": popId }, h("span", { class: "nx-sync__dot", "aria-hidden": "true" }, glyph(OFF), glyph(ALERT)), this.#text);
    this.#pop = h("div", { id: popId, class: "nx-sync__pop", popover: "auto", role: "dialog", "aria-labelledby": `${this.#uid}-h` });
    this.#live = h("p", { class: "nx-sync__vh", role: "status", "aria-live": "polite" });
    this.append(this.#pill, this.#pop, this.#live);

    const pill = this.#pill;
    // Con el panel abierto, presionar la píldora ya lo cierra (clic fuera): ese clic no lo reabre.
    let wasOpen = false;
    pill.addEventListener("pointerdown", () => (wasOpen = this.open));
    pill.addEventListener("click", () => {
      if (this.open) this.hide();
      else if (!wasOpen) this.show();
      wasOpen = false;
    });
    const pop = this.#pop;
    pop.addEventListener("beforetoggle", (e) => {
      this.#isOpen = (e as ToggleEvent).newState === "open";
      if (!this.#isOpen) return;
      this.#view = this.#view.kind === "list" || this.#op(this.#view.id) ? this.#view : { kind: "list" };
      this.#confirm = null;
      this.#paint(true);
      this.#place();
      requestAnimationFrame(() => this.#place());
      this.#startTracking();
    });
    pop.addEventListener("toggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      pill.setAttribute("aria-expanded", String(open));
      if (open) {
        if (!pop.contains(document.activeElement)) this.#focusHead();
      } else if (!this.open) {
        this.#track?.();
        this.#view = { kind: "list" };
        this.#sent.clear();
        this.#shown.clear();
        const a = document.activeElement;
        if (!a || a === document.body || pop.contains(a)) pill.focus();
      }
      this.#ticking();
    });
    pop.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Escape primero cancela un descarte o vuelve a la lista; después cierra.
      e.preventDefault();
      e.stopPropagation();
      if (this.#confirm) this.#ask(null);
      else if (this.#view.kind !== "list") this.#back();
      else this.hide(), pill.focus();
    });
    pop.addEventListener("click", (e) => this.#onClick(e));
    pop.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      const v = this.#view;
      if (v.kind === "resolve" && t.type === "radio") {
        if (t.value === "theirs") v.theirs.add(t.dataset.key!);
        else v.theirs.delete(t.dataset.key!);
      }
    });
    pop.addEventListener("input", (e) => {
      const t = e.target as HTMLTextAreaElement;
      if (t.tagName === "TEXTAREA") this.#check(t);
    });
  }

  /** Lo que se muestra de una operación: su `label`, o «Cambio sin nombre» (nunca la URL). */
  #name(op: SyncOp): string {
    return op.label || this.#labels.unnamed;
  }

  #op(id: string): SyncOp | undefined {
    return this.#state.ops.find((o) => o.id === id);
  }

  #onClick(e: Event): void {
    const b = (e.target as Element).closest<HTMLButtonElement>("button");
    if (!b || !this.#pop!.contains(b)) return;
    const { act, id } = b.dataset;
    const v = this.#view;
    if (act === "flush") void nxSync.flush();
    else if (act === "retry") void nxSync.retry(id!);
    else if (act === "discard") this.#ask(id!);
    else if (act === "no") this.#ask(null);
    else if (act === "yes") {
      this.#confirm = null;
      void nxSync.discard(id!).then(() => this.#focusHead());
    } else if (act === "resolve") this.#go({ kind: "resolve", id: id!, theirs: new Set() });
    else if (act === "edit") this.#go({ kind: "edit", id: id! });
    else if (act === "back") this.#back();
    else if (act === "all" && v.kind === "resolve") {
      for (const r of this.#pop!.querySelectorAll<HTMLInputElement>("input[type=radio]")) {
        r.checked = r.value === b.value;
        if (r.checked && r.value === "theirs") v.theirs.add(r.dataset.key!);
        else if (r.checked) v.theirs.delete(r.dataset.key!);
      }
    } else if (act === "send" && v.kind === "resolve") {
      const c = this.#op(v.id)?.conflict;
      if (c) void nxSync.resolve(v.id, resolveBody(c.local, c.server, v.theirs));
      this.#back();
    } else if (act === "save" && v.kind === "edit") {
      const ta = this.#pop!.querySelector("textarea")!;
      const body = this.#check(ta);
      if (body === undefined) return ta.focus();
      void nxSync.retry(v.id, body);
      this.#back();
    }
  }

  #ask(id: string | null): void {
    const was = this.#confirm;
    this.#confirm = id;
    this.#paint(true);
    // Confirmar: el foco va a «Cancelar» (lo seguro); cancelar: vuelve a «Descartar».
    this.#pop!.querySelector<HTMLElement>(id ? `[data-k="no|${CSS.escape(id)}"]` : `[data-k="discard|${CSS.escape(was ?? "")}"]`)?.focus();
  }

  #go(v: View): void {
    this.#view = v;
    this.#confirm = null;
    this.#paint(true);
    this.#focusHead();
  }

  #back(): void {
    const id = "id" in this.#view ? this.#view.id : "";
    this.#go({ kind: "list" });
    this.#pop!.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  }

  #focusHead(): void {
    this.#pop!.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }

  /** El cuerpo del editor, si es JSON; si no, `undefined` y el error a la vista. */
  #check(ta: HTMLTextAreaElement): SyncJson | undefined {
    const bad = this.#pop!.querySelector<HTMLElement>(".nx-sync__bad")!;
    try {
      const v = JSON.parse(ta.value) as SyncJson;
      ta.removeAttribute("aria-invalid");
      bad.textContent = "";
      return v;
    } catch (err) {
      ta.setAttribute("aria-invalid", "true");
      bad.textContent = this.#labels.invalid.replace("{msg}", (err as Error).message);
      return undefined;
    }
  }

  // ---------------------------------------------------------------- pintado

  /** Lo que dice la píldora y su tono. */
  #summary(): [string, string] {
    const s = this.#state;
    const L = this.#labels;
    const off = s.online ? "" : `${L.offline} · `;
    if (s.auth) return [L.auth, "alert"];
    if (s.conflicts) return [off + plural(s.conflicts, L.conflictOne, L.conflictMany), "alert"];
    if (s.failed) return [off + plural(s.failed, L.failedOne, L.failedMany), "alert"];
    const pend = plural(s.pending, L.pendingOne, L.pendingMany);
    if (!s.online) return [s.pending ? off + pend : L.offline, "offline"];
    if (s.progress) return [L.syncing.replace("{i}", String(Math.min(s.progress.done + 1, s.progress.total))).replace("{n}", String(s.progress.total)), "syncing"];
    const next = s.ops.find((o) => o.status === "waiting" && o.nextAt);
    if (next) return [`${L.retryIn.replace("{t}", countdown(next.nextAt! - Date.now()))} · ${pend}`, "waiting"];
    return s.pending ? [pend, "syncing"] : [L.online, "online"];
  }

  #paint(force = false): void {
    if (!this.#built) return;
    const [text, tone] = this.#summary();
    const p = this.#state.progress;
    this.dataset.state = tone;
    this.#text!.textContent = text;
    this.#pill!.style.setProperty("--p", p ? `${Math.round((p.done / p.total) * 100)}%` : "0%");
    this.#ticking();
    if (!this.open) return;
    const v = this.#view;
    const op = v.kind === "list" ? undefined : this.#op(v.id);
    // El comparador y el editor se quedan quietos mientras la operación siga igual.
    if (v.kind !== "list" && (!op || op.status !== (v.kind === "resolve" ? "conflict" : "failed"))) {
      this.#view = { kind: "list" };
      return this.#paint(true);
    }
    const key = v.kind === "list" ? "" : `${v.kind}|${op!.id}|${op!.key}`;
    if (key && key === this.#painted && !force) return;
    if (!key && !force) {
      // La lista, una vez por tanda: al vaciar una cola de miles, cada envío avisa varias veces.
      if (this.#listQueued) return;
      this.#listQueued = true;
      return queueMicrotask(() => {
        this.#listQueued = false;
        if (this.open && this.#view.kind === "list") this.#paint(true);
      });
    }
    this.#painted = key;
    const k = (document.activeElement as HTMLElement | null)?.closest?.("[data-k]")?.getAttribute("data-k");
    this.#pop!.replaceChildren(...(v.kind === "list" ? this.#list() : v.kind === "resolve" ? this.#resolver(op!, v.theirs) : this.#editor(op!)));
    if (k && !this.#pop!.contains(document.activeElement)) {
      // El foco vuelve a lo mismo; si su fila ya no está (se envió), al título.
      (this.#pop!.querySelector<HTMLElement>(`[data-k="${CSS.escape(k)}"]`) ?? this.#pop!.querySelector("h2"))?.focus({ preventScroll: true });
    }
  }

  #head(title: string, back = false): HTMLElement {
    return h(
      "header",
      { class: "nx-sync__head" },
      back ? h("button", { type: "button", class: "nx-sync__back", "data-act": "back", "data-k": "back", "aria-label": this.#labels.back, title: this.#labels.back }, glyph(BACK)) : null,
      h("h2", { id: `${this.#uid}-h`, tabindex: "-1" }, title),
    );
  }

  #list(): (Node | string)[] {
    const L = this.#labels;
    const s = this.#state;
    const [text, tone] = this.#summary();
    const ops = [...s.ops, ...[...this.#sent.values()].filter((o) => !this.#op(o.id)).map((o) => ({ ...o, status: "sent" }) as unknown as SyncOp)];
    const canFlush = s.ops.some((o) => o.status === "pending" || o.status === "waiting");
    return [
      this.#head(L.heading),
      h(
        "div",
        { class: "nx-sync__bar" },
        h("p", { class: "nx-sync__sum", "data-tone": tone }, glyph(({ online: CHECK, syncing: UP, waiting: CLOCK, offline: OFF } as Record<string, string>)[tone] ?? ALERT), h("span", null, text)),
        canFlush ? h("button", { type: "button", class: "nx-sync__now", "data-act": "flush", "data-k": "flush" }, L.syncNow) : null,
      ),
      ops.length
        ? h("ol", { class: "nx-sync__list", "aria-label": L.heading }, ...ops.map((o) => this.#row(o)))
        : h("div", { class: "nx-sync__empty" }, glyph(CHECK), h("strong", null, L.upToDate), h("span", null, L.emptyHint)),
      s.durable ? "" : h("p", { class: "nx-sync__warn" }, glyph(ALERT), h("span", null, L.notDurable)),
    ];
  }

  #row(op: SyncOp): HTMLLIElement {
    const L = this.#labels;
    const st = op.status as string;
    const id = op.id;
    const name = this.#name(op);
    const btn = (act: string, label: string, cls = "") => h("button", { type: "button", class: `nx-sync__btn ${cls}`.trim(), "data-act": act, "data-id": id, "data-k": `${act}|${id}`, "aria-label": `${label} · ${name}` }, label);
    const acts =
      this.#confirm === id
        ? [h("span", { class: "nx-sync__ask" }, L.confirmDiscard), btn("yes", L.discard, "is-danger"), btn("no", L.cancel)]
        : st === "sent" || st === "sending"
          ? []
          : [
              st === "conflict" ? btn("resolve", L.resolve, "is-primary") : null,
              st === "failed" && op.body !== undefined ? btn("edit", L.edit, "is-primary") : null,
              // «Reintentar ya» solo donde sirve: lo que espera su turno sale en orden de todos modos.
              st === "waiting" || st === "failed" ? btn("retry", L.retry) : null,
              btn("discard", L.discard),
            ];
    const meta: (string | Node)[] = [h("span", { "data-ago": op.createdAt }, ago(Date.now() - op.createdAt, resolveLocale(this)))];
    if (op.attempts) meta.push(plural(op.attempts, L.attemptOne, L.attemptMany, this.#num(op.attempts)));
    if (st === "waiting" && op.nextAt) meta.push(h("span", { "data-next": op.nextAt }, L.nextIn.replace("{t}", countdown(op.nextAt - Date.now()))));
    const fresh = !this.#shown.has(id);
    this.#shown.add(id);
    const why = st === "waiting" ? (op.httpStatus ? L.unavailable.replace("{status}", String(op.httpStatus)) : L.noNetwork) : st === "failed" ? (op.error ?? L.rejected.replace("{status}", String(op.httpStatus ?? ""))) : st === "conflict" ? op.error : undefined;
    return h(
      "li",
      { class: "nx-sync__op", "data-status": st, "data-new": fresh ? "" : null },
      h("span", { class: "nx-sync__ico", "aria-hidden": "true" }, glyph(ICONS[st] ?? CLOCK)),
      h(
        "div",
        { class: "nx-sync__main" },
        h("p", { class: "nx-sync__label" }, name),
        h("p", { class: "nx-sync__meta" }, h("span", { class: "nx-sync__tag" }, L[st as "pending"] ?? st), ...meta.flatMap((m, i) => (i ? [" · ", m] : [m]))),
        why ? h("p", { class: "nx-sync__why" }, why) : null,
      ),
      acts.length ? h("div", { class: "nx-sync__acts" }, ...acts) : null,
    );
  }

  /** Un valor para el comparador, con lo distinto marcado. */
  #val(v: SyncJson | undefined, other: SyncJson | undefined): HTMLElement {
    const L = this.#labels;
    const show = (x: SyncJson | undefined) => (x === undefined || x === null || x === "" ? L.blank : typeof x === "number" ? this.#num(x) : typeof x === "boolean" ? (x ? L.yes : L.no) : typeof x === "object" ? JSON.stringify(x) : x);
    const a = show(v);
    const b = show(other);
    const [pre, mid, , post] = midDiff(a, b);
    // Se marca lo distinto cuando hay algo en común alrededor, o si el valor es corto (una
    // cantidad, un código); un texto largo del todo distinto no se pinta entero de amarillo.
    const mark = a !== L.blank && b !== L.blank && mid && (pre || post || a.length < 16);
    return h("span", { class: "nx-sync__val", "data-blank": a === L.blank ? "" : null }, ...(mark ? [pre, h("mark", null, mid), post] : [a]));
  }

  #resolver(op: SyncOp, theirs: Set<string>): (Node | string)[] {
    const L = this.#labels;
    const c = op.conflict!;
    const hot = c.fields.map((f) => f.key);
    const { rows, same } = diffFields(c.local, c.server, hot);
    const names = [...this.#fields, ...c.fields];
    return [
      this.#head(L.resolveTitle, true),
      h("p", { class: "nx-sync__hint" }, h("strong", null, this.#name(op)), " · ", op.error ?? L.resolveHint),
      h(
        "div",
        { class: "nx-sync__all" },
        ...(["mine", "theirs"] as const).map((side) => h("button", { type: "button", class: "nx-sync__btn", "data-act": "all", value: side, "data-k": `all|${side}` }, side === "mine" ? L.allMine : L.allTheirs)),
      ),
      h(
        "div",
        { class: "nx-sync__cmp" },
        ...rows.map((r, i) =>
          h(
            "fieldset",
            { class: "nx-sync__f", "data-hot": r.hot ? "" : null },
            h("legend", null, fieldLabel(r.key, names, c.local)),
            ...(["mine", "theirs"] as const).map((side) =>
              h(
                "label",
                { class: "nx-sync__opt", "data-side": side },
                h("input", { type: "radio", name: `${this.#uid}-f${i}`, value: side, "data-key": r.key, "data-k": `f${i}|${side}`, checked: theirs.has(r.key) === (side === "theirs") }),
                h("span", { class: "nx-sync__who" }, side === "mine" ? L.mine : L.theirs),
                side === "mine" ? this.#val(r.mine, r.theirs) : this.#val(r.theirs, r.mine),
              ),
            ),
          ),
        ),
      ),
      same ? h("p", { class: "nx-sync__same" }, plural(same, L.sameOne, L.same)) : "",
      h("div", { class: "nx-sync__foot" }, h("button", { type: "button", class: "nx-sync__btn is-primary", "data-act": "send", "data-k": "send" }, L.send)),
    ];
  }

  #editor(op: SyncOp): (Node | string)[] {
    const L = this.#labels;
    const ta = `${this.#uid}-json`;
    const bad = `${this.#uid}-bad`;
    const area = h("textarea", { id: ta, class: "nx-sync__json", rows: "8", spellcheck: "false", autocomplete: "off", "aria-describedby": bad, "data-k": "json" });
    area.value = JSON.stringify(op.body ?? null, null, 2);
    return [
      this.#head(L.editTitle, true),
      h("p", { class: "nx-sync__hint" }, h("strong", null, this.#name(op)), " · ", op.error ? `${op.error}. ` : "", L.editHint),
      h("label", { class: "nx-sync__lbl", for: ta }, L.data),
      area,
      h("p", { id: bad, class: "nx-sync__bad", "aria-live": "polite" }),
      h("div", { class: "nx-sync__foot" }, h("button", { type: "button", class: "nx-sync__btn is-primary", "data-act": "save", "data-k": "save" }, L.sendEdit)),
    ];
  }

  /** Cada segundo, mientras haga falta: cuentas regresivas y «hace cuánto». */
  #ticking(): void {
    const need = this.isConnected && (this.open || this.#state.ops.some((o) => o.status === "waiting"));
    if (need && !this.#tick) {
      this.#tick = setInterval(() => {
        const [text] = this.#summary();
        this.#text!.textContent = text;
        const loc = resolveLocale(this);
        for (const el of this.#pop!.querySelectorAll<HTMLElement>("[data-next]")) el.textContent = this.#labels.nextIn.replace("{t}", countdown(Number(el.dataset.next) - Date.now()));
        for (const el of this.#pop!.querySelectorAll<HTMLElement>("[data-ago]")) el.textContent = ago(Date.now() - Number(el.dataset.ago), loc);
      }, 1000);
    } else if (!need && this.#tick) {
      clearInterval(this.#tick);
      this.#tick = undefined;
    }
  }

  #place(): void {
    const pop = this.#pop!;
    const r = this.#pill!.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = pop.offsetWidth;
    // Hacia donde hay más pantalla: alineado al borde derecho de la píldora si está en la mitad
    // derecha (lo usual en una barra superior), al izquierdo si no.
    const left = r.left + r.width / 2 > vw / 2 ? r.right - w : r.left;
    const ph = pop.offsetHeight;
    const below = vh - r.bottom - 8;
    const top = ph > below && r.top > below ? Math.max(8, r.top - 8 - ph) : r.bottom + 8;
    Object.assign(pop.style, { left: `${Math.max(8, Math.min(left, vw - w - 8))}px`, top: `${top}px` });
  }

  #startTracking(): void {
    this.#track?.();
    let raf = 0;
    const onMove = (e: Event) => {
      if (e.target instanceof Node && this.#pop!.contains(e.target)) return;
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), this.#place()));
    };
    addEventListener("scroll", onMove, { capture: true, passive: true });
    addEventListener("resize", onMove, { passive: true });
    this.#track = () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onMove, { capture: true });
      removeEventListener("resize", onMove);
      this.#track = undefined;
    };
  }
}
