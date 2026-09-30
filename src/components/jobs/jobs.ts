/**
 * `<nx-jobs>`: trabajos largos que sobreviven a recargar. Importar 10.000 filas, cerrar el mes,
 * generar 500 facturas: el trabajo vive en el servidor y el elemento lo sigue. Una píldora discreta
 * («2 trabajos en curso» con un anillo de avance; «Listo: Cierre de septiembre» un rato al terminar;
 * en rojo si falló) abre un panel con cada trabajo: etapa, barra, tiempo restante, quién y cuándo, y
 * sus acciones (cancelar con confirmación, reintentar, descargar, ver errores, quitar).
 *
 * - Al conectar pide `GET {endpoint}?active=1` (en curso y recientes) y los ids guardados en
 *   `localStorage`, así que recargar o cambiar de página retoma todo.
 * - Una sola conexión para todo: `stream` (SSE o NDJSON) abierto solo mientras hay trabajos en curso,
 *   con reconexión creciente, `Retry-After` y `Last-Event-ID`/`?after=`; sin `stream`, sondeo de
 *   `GET {endpoint}/{id}` que se espacia si nada cambia y en segundo plano.
 * - Con varias pestañas, una sola mantiene la conexión (`BroadcastChannel`, `navigator.locks` si
 *   existe) y reparte los eventos.
 * - Al terminar: `nx-jobs-done`, un aviso (`nxToast`, cargado con `import()`) si el panel no está a
 *   la vista y, con `notify`, una notificación del sistema si la pestaña está oculta.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import { lineData, readLines } from "../../core/stream";
import { cleanJob, cleanJobs, isJobActive, jobPace, jobsBackoff, jobsFraction, jobsPollDelay, jobsRetryAfter, jobUrl, mergeJob, readJobsMemo, splitJobs, withQuery, type JobPace } from "./logic";
import type { JobsPanel } from "./jobs-panel";
import type { Job, JobEvent, JobSpec, JobsErrorDetail, JobsLabels } from "./types";

export const JOBS_LABELS: JobsLabels = {
  heading: "Trabajos",
  runningOne: "{n} trabajo en curso",
  runningMany: "{n} trabajos en curso",
  doneFlash: "Listo: {title}",
  failedFlash: "Error: {title}",
  canceledFlash: "Cancelado: {title}",
  failedMany: "{n} trabajos con error",
  empty: "No hay trabajos en curso.",
  recent: "Recientes",
  queued: "En cola",
  running: "En curso",
  done: "Terminado",
  failed: "Falló",
  canceled: "Cancelado",
  of: "{done} de {total}",
  left: "faltan ~{t}",
  leftLong: "faltan unos {t}",
  soon: "falta menos de un minuto",
  started: "Inició {time}",
  finished: "Terminó {time}",
  by: "por {name}",
  errorsOne: "{n} fila con error",
  errorsMany: "{n} filas con error",
  cancel: "Cancelar",
  confirmCancel: "¿Cancelar «{title}»? Lo ya guardado queda.",
  confirmYes: "Sí, cancelar",
  confirmNo: "No",
  canceling: "Cancelando…",
  retry: "Reintentar",
  retryErrors: "Reintentar lo que falló",
  download: "Descargar",
  viewErrors: "Ver filas con error",
  open: "Ir al registro",
  dismiss: "Quitar de la lista",
  liveDone: "Terminó: {title}",
  liveFailed: "Falló: {title}",
  liveCanceled: "Se canceló: {title}",
  view: "Ver",
  untitled: "Trabajo sin nombre",
  error: "No se pudo completar ({status})",
};

const CLOCK = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const ALERT = '<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>';
const BAN = '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>';
const ACCEPT = "text/event-stream, application/x-ndjson";
const STR = ["endpoint", "stream", "poll", "recent", "locale"] as const;
const BOOL = ["notify", "always", "disabled"] as const;
const PROPS = [...STR, ...BOOL, "labels"] as const;

const fill = (s: string, v: Record<string, string | number>): string => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const json = async (r: Response): Promise<Record<string, unknown> | null> => {
  try {
    return await r.json();
  } catch {
    return null;
  }
};

type Msg = { t: string; from?: string; ev?: JobEvent; id?: string; on?: boolean };
type Locks = { request(name: string, opts: { signal: AbortSignal }, fn: () => Promise<void>): Promise<unknown> };

let uid = 0;

export class NxJobs extends Base {
  static observedAttributes = [...PROPS];
  /** Lista, lanzar (`POST`), cada trabajo (`/{id}`), `/{id}/cancel` y `/{id}/retry`. Del mismo origen. */
  declare endpoint: string | null;
  /** SSE o NDJSON con los eventos de todos los trabajos de la persona. Sin él, sondeo. */
  declare stream: string | null;
  /** Segundos entre consultas del sondeo (3). */
  declare poll: string | number | null;
  /** Cuántos terminados se guardan en «Recientes» (10). */
  declare recent: string | number | null;
  declare locale: string | null;
  /** Notificación del sistema al terminar con la pestaña oculta (pide permiso al lanzar). */
  declare notify: boolean;
  /** Muestra la píldora (tenue) también sin trabajos. */
  declare always: boolean;
  declare disabled: boolean;

  #tab = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  #labels = JOBS_LABELS;
  #jobs = new Map<string, Job>();
  #pace = new Map<string, JobPace>();
  /** Quitados de la lista (no vuelven al recargar). */
  #gone = new Set<string>();
  /** Fallidos que la persona aún no vio (la píldora queda en rojo hasta abrir el panel). */
  #unseen = new Set<string>();
  #flash: Job | null = null;
  #flashT?: ReturnType<typeof setTimeout>;
  #confirm: string | null = null;
  #canceling = new Set<string>();
  /** La fila pintada de cada trabajo, con la clave de lo que no cambia en cada evento. */
  #rows = new Map<string, [string, HTMLLIElement]>();
  #raf = 0;
  #changed = false;
  #on = false;
  #loaded = false;
  #loadedAt = 0;
  #memo = "";
  // Pestañas.
  #leader = false;
  #ch?: BroadcastChannel;
  #release?: () => void;
  #lockAc?: AbortController;
  #et?: ReturnType<typeof setTimeout>;
  #peers = new Set<string>();
  // Red.
  #ac?: AbortController;
  #sac?: AbortController;
  #timer?: ReturnType<typeof setTimeout>;
  #busy = false;
  #tries = 0;
  #idle = 0;
  #wait = 0;
  #noStream = false;
  #last = "";
  #sseId?: string;
  // Panel.
  #isOpen = false;
  #built = false;
  #track?: () => void;
  #panel?: JobsPanel;
  #panelP?: Promise<JobsPanel>;
  #pill?: HTMLButtonElement;
  #ring?: HTMLSpanElement;
  #text?: HTMLSpanElement;
  #pop?: HTMLDivElement;
  #live?: HTMLParagraphElement;

  get labels(): JobsLabels {
    return this.#labels;
  }
  set labels(v: Partial<JobsLabels> | null | undefined) {
    this.#labels = mergeLabels(JOBS_LABELS, v);
    this.#rows.clear();
    this.#queue();
  }
  /** En curso y recientes, en el orden del panel. */
  get jobs(): Job[] {
    const s = splitJobs(this.#jobs.values(), this.#recent());
    return [...s.active, ...s.recent];
  }
  /** Solo los que están en cola o corriendo. */
  get active(): Job[] {
    return splitJobs(this.#jobs.values(), 0).active;
  }
  get open(): boolean {
    return this.#isOpen;
  }

  // ---------------------------------------------------------------- API

  /** Lanza un trabajo (`POST {endpoint}` con `{type, title, params}`) y lo sigue. */
  async start(spec: JobSpec): Promise<Job> {
    const base = this.#base();
    if (!base) throw new Error("[nx-jobs] sin endpoint");
    if (this.notify && typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        void Notification.requestPermission()?.catch?.(() => {});
      } catch {
        /* sin permiso: se avisa en la página */
      }
    }
    let res: Response;
    try {
      res = await this.#get(base, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(spec) });
    } catch (e) {
      this.#err("start", String(e));
      throw e;
    }
    if (!res.ok) throw new Error(await this.#bad("start", res));
    const j = cleanJob({ status: "queued", type: spec.type, title: spec.title, startedAt: Date.now(), ...(await json(res)) });
    if (!j) throw new Error("[nx-jobs] el servidor no devolvió el trabajo");
    this.track(j);
    return this.#jobs.get(j.id) ?? j;
  }

  /** Sigue un trabajo creado por la app: su `id` (se pide `GET {endpoint}/{id}`) o el trabajo. */
  track(v: string | JobEvent): void {
    const ev = cleanJob(typeof v === "string" ? { id: v } : v, true);
    if (!ev) return;
    this.#gone.delete(ev.id);
    this.#apply(ev);
    if (!ev.title) void this.#fetchJob(ev.id);
    this.#post({ t: "job", ev: this.#jobs.get(ev.id) });
  }

  /** Cancela (`POST {endpoint}/{id}/cancel`) sin preguntar: el panel ya pidió la confirmación. */
  async cancel(id: string): Promise<void> {
    const base = this.#base();
    const j = this.#jobs.get(id);
    if (!base || !j || !isJobActive(j)) return;
    this.#confirm = null;
    this.#canceling.add(id);
    this.#queue();
    try {
      const res = await this.#get(jobUrl(base, id, "/cancel"), { method: "POST" });
      if (!res.ok) throw await this.#bad("cancel", res, id);
      const r = cleanJob(await json(res), true);
      if (r?.id === id) this.#event(r);
    } catch (e) {
      if (typeof e !== "string") this.#err("cancel", String(e), id);
      this.#canceling.delete(id);
      this.#queue();
    }
  }

  /** Reintenta lo que falló (`POST {endpoint}/{id}/retry`). Si el servidor crea otro trabajo, sigue ese. */
  async retry(id: string): Promise<Job | null> {
    const base = this.#base();
    if (!base) return null;
    try {
      const res = await this.#get(jobUrl(base, id, "/retry"), { method: "POST" });
      if (!res.ok) throw await this.#bad("retry", res, id);
      const j = cleanJob({ id, status: "queued", ...(await json(res)) }, true) ?? { id, status: "queued" };
      this.#unseen.delete(id);
      this.#pace.delete(id);
      // Vuelve a la cola a propósito: lo de la vez anterior (errores, mensaje) ya no vale.
      if (j.id === id) this.#apply({ result: undefined, ...j }, true);
      else this.track(j);
      return this.#jobs.get(j.id) ?? null;
    } catch (e) {
      if (typeof e !== "string") this.#err("retry", String(e), id);
      return null;
    }
  }

  /** Quita un trabajo terminado de la lista (no vuelve al recargar). Uno en curso no se quita. */
  dismiss(id: string): boolean {
    const j = this.#jobs.get(id);
    if (j && isJobActive(j)) return false;
    this.#drop(id);
    this.#post({ t: "dis", id });
    return true;
  }

  /** Abre el panel (lo trae primero si aún no llegó). */
  async show(): Promise<void> {
    if (this.#isOpen || this.disabled || !this.#pop) return;
    await this.#loadPanel();
    if (!this.#isOpen && this.isConnected) this.#pop.showPopover?.();
  }
  hide(): void {
    if (this.#isOpen) this.#pop!.hidePopover?.();
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#built) this.#build();
    if (this.#on) return;
    this.#on = true;
    this.#ac = new AbortController();
    const memo = this.#readMemo();
    this.#gone = new Set(memo.d);
    document.addEventListener("visibilitychange", this.#onVis);
    addEventListener("pagehide", this.#bye);
    addEventListener("pageshow", this.#back);
    this.#elect();
    void this.#load(memo.a);
    this.#queue();
  }

  disconnectedCallback(): void {
    this.#on = false;
    this.#loaded = false;
    this.#ac?.abort();
    this.#close();
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    clearTimeout(this.#flashT);
    document.removeEventListener("visibilitychange", this.#onVis);
    removeEventListener("pagehide", this.#bye);
    removeEventListener("pageshow", this.#back);
    this.#bye();
    // Un popover que sale del DOM se oculta sin `toggle`.
    this.#isOpen = false;
    this.#track?.();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (name === "labels") {
      if (value !== null) {
        try {
          this.labels = JSON.parse(value);
        } catch {
          console.warn('[nx-jobs] el atributo "labels" no es JSON válido');
        }
      }
      return;
    }
    if (!this.#on || old === value) return this.#queue();
    if (name === "endpoint") {
      this.disconnectedCallback();
      this.#jobs.clear();
      this.#rows.clear();
      this.connectedCallback();
    } else if (name === "stream") {
      this.#close();
      this.#noStream = false;
      this.#sync();
    }
    this.#queue();
  }

  // ---------------------------------------------------------------- red

  #base(): string | undefined {
    return safeEndpoint(this.endpoint);
  }
  #get(url: string, init: RequestInit = {}): Promise<Response> {
    return fetch(url, { credentials: "same-origin", cache: "no-store", headers: { Accept: "application/json" }, ...init });
  }
  #err(action: JobsErrorDetail["action"], message: string, id?: string, status?: number): void {
    this.dispatchEvent(new CustomEvent<JobsErrorDetail>("nx-jobs-error", { detail: { action, message, id, status }, bubbles: true, composed: true }));
  }
  /** Avisa el error de una respuesta (con el `message` del servidor si lo trae) y lo devuelve. */
  async #bad(action: JobsErrorDetail["action"], res: Response, id?: string): Promise<string> {
    const b = await json(res);
    const msg = typeof b?.message === "string" ? b.message : fill(this.#labels.error, { status: res.status });
    this.#err(action, msg, id, res.status);
    return msg;
  }

  async #load(ids: string[] = []): Promise<void> {
    const base = this.#base();
    const sig = this.#ac!.signal;
    if (!base) return;
    this.#loadedAt = Date.now();
    try {
      const res = await this.#get(withQuery(base, "active", "1"), { signal: sig });
      if (!res.ok) throw await this.#bad("load", res);
      for (const j of cleanJobs(await res.json())) this.#apply(j);
    } catch (e) {
      if (!sig.aborted && typeof e !== "string") this.#err("load", String(e));
    }
    if (sig.aborted) return;
    // Los que esta pestaña lanzó y el servidor no listó: se piden uno por uno.
    for (const id of ids) if (!this.#jobs.has(id)) void this.#fetchJob(id, true);
    this.#loaded = true;
    this.#sync();
  }

  /** Pide un trabajo y lo aplica. `true` si cambió algo. `keep`: si no se puede pedir, queda en
   *  la lista como «en cola» para seguirlo (un id guardado que el servidor no listó). */
  async #fetchJob(id: string, keep = false): Promise<boolean> {
    const base = this.#base();
    const sig = this.#ac?.signal;
    if (!base) return false;
    try {
      const res = await this.#get(jobUrl(base, id), { signal: sig });
      if (res.status === 404 || res.status === 410) return this.#drop(id), true;
      if (!res.ok) {
        this.#wait = Math.max(this.#wait, jobsRetryAfter(res.headers.get("Retry-After")) ?? 0);
        throw res;
      }
      const j = cleanJob(await res.json());
      return !!j && j.id === id && this.#event(j);
    } catch {
      if (keep && !sig?.aborted) this.#apply({ id });
      return false;
    }
  }

  /** Abre o cierra la conexión según haga falta: solo la pestaña líder, y solo con trabajos en curso. */
  #sync(): void {
    const s = this.#noStream ? undefined : safeEndpoint(this.stream);
    if (!this.#on || !this.#leader || !this.#loaded || !this.active.length) {
      this.#tries = this.#idle = 0;
      return this.#close();
    }
    if (this.#sac || this.#timer || this.#busy) return;
    if (s) void this.#open(s);
    else this.#timer = setTimeout(() => void this.#poll(), Math.max(this.#wait, jobsPollDelay(Math.max(1, Number(this.poll ?? 3) || 3) * 1000, this.#idle, document.hidden && !this.#peers.size)));
  }

  #close(): void {
    this.#sac?.abort();
    this.#sac = undefined;
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  async #open(url: string): Promise<void> {
    const ac = (this.#sac = new AbortController());
    const last = this.#last;
    let wait = 0;
    try {
      const res = await fetch(last ? withQuery(url, "after", last) : url, { credentials: "same-origin", cache: "no-store", headers: last ? { Accept: ACCEPT, "Last-Event-ID": last } : { Accept: ACCEPT }, signal: ac.signal });
      if (!res.ok) {
        wait = jobsRetryAfter(res.headers.get("Retry-After")) ?? 0;
        // Un 4xx no se arregla reconectando: se sigue con el sondeo.
        if (res.status !== 429 && res.status !== 408 && res.status < 500) this.#noStream = true;
        this.#err("stream", fill(this.#labels.error, { status: res.status }), undefined, res.status);
      } else {
        // Sin punto desde donde retomar, lo que pasó mientras se conectaba se pide de nuevo.
        if (!last && Date.now() - this.#loadedAt > 2000) void this.#load();
        await readLines(res, (line) => {
          if (ac.signal.aborted) return false;
          if (line.startsWith("id:")) return void (this.#last = this.#sseId = line.slice(3).trim());
          const d = lineData(line);
          let ev: JobEvent | null = null;
          try {
            ev = d ? cleanJob(JSON.parse(d), true) : null;
          } catch {
            /* una línea que no es JSON */
          }
          if (!ev) return;
          if (this.#sseId !== undefined && ev.seq === undefined && /^\d+$/.test(this.#sseId)) ev.seq = Number(this.#sseId);
          this.#sseId = undefined;
          this.#tries = 0;
          this.#event(ev);
        });
      }
    } catch {
      /* se cortó la red o se cerró a propósito */
    }
    if (this.#sac !== ac) return;
    this.#sac = undefined;
    if (!this.#on) return;
    this.#timer = setTimeout(() => ((this.#timer = undefined), this.#sync()), this.#noStream ? 0 : Math.max(wait, jobsBackoff(++this.#tries)));
  }

  async #poll(): Promise<void> {
    this.#timer = undefined;
    this.#busy = true;
    this.#wait = 0;
    const hits = await Promise.all(this.active.map((j) => this.#fetchJob(j.id)));
    this.#busy = false;
    if (!this.#on) return;
    this.#idle = hits.includes(true) ? 0 : this.#idle + 1;
    this.#sync();
  }

  /** Volvió la pestaña (esta u otra): lo que esperaba sale ya. */
  #wake(): void {
    if (!this.#timer) return;
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#idle = this.#tries = 0;
    if (!this.#noStream && this.stream) this.#sync();
    else void this.#poll();
  }

  #onVis = (): void => {
    if (this.#leader) {
      if (!document.hidden) this.#wake();
    } else this.#post({ t: "vis", on: !document.hidden });
  };

  // ---------------------------------------------------------------- pestañas

  #post(m: Msg): void {
    try {
      this.#ch?.postMessage({ ...m, from: this.#tab });
    } catch {
      /* canal cerrado */
    }
  }

  #elect(): void {
    if (typeof BroadcastChannel === "undefined") return void (this.#leader = true);
    const name = `nx-jobs:${this.endpoint ?? ""}`;
    this.#ch = new BroadcastChannel(name);
    this.#ch.onmessage = (e) => this.#msg(e.data);
    this.#onVis();
    const locks = (navigator as Navigator & { locks?: Locks }).locks;
    if (locks?.request) {
      // La que tiene el candado es la líder hasta cerrarse; entonces lo toma la siguiente.
      const ac = (this.#lockAc = new AbortController());
      try {
        locks.request(name, { signal: ac.signal }, () => new Promise<void>((res) => ((this.#release = res), this.#lead()))).catch(() => {});
        return;
      } catch {
        this.#lockAc = undefined;
      }
    }
    this.#claim();
  }

  /** Sin candados: «¿hay líder?»; si nadie contesta en ~250 ms, esta lo es. */
  #claim(): void {
    this.#post({ t: "who" });
    clearTimeout(this.#et);
    this.#et = setTimeout(() => this.#lead(), 200 + Math.random() * 100);
  }

  #lead(): void {
    this.#leader = true;
    this.#post({ t: "lead" });
    this.#sync();
  }

  #bye = (): void => {
    clearTimeout(this.#et);
    this.#post({ t: "bye" });
    this.#release?.();
    this.#lockAc?.abort();
    this.#ch?.close();
    this.#ch = this.#release = this.#lockAc = undefined;
    this.#leader = false;
    this.#peers.clear();
  };

  /** La página volvió de la caché del navegador (atrás/adelante): se une otra vez a las pestañas. */
  #back = (e: PageTransitionEvent): void => {
    if (e.persisted && this.#on && !this.#ch) this.#elect();
  };

  #msg(m: Msg): void {
    if (!m || typeof m !== "object" || !m.from) return;
    const t = m.t;
    if (t === "who" && this.#leader) this.#post({ t: "lead" });
    else if (t === "lead") {
      clearTimeout(this.#et);
      // Dos se proclamaron a la vez: queda la de id menor.
      if (this.#leader && !this.#release && m.from < this.#tab) {
        this.#leader = false;
        this.#close();
      }
    } else if (t === "bye") {
      this.#peers.delete(m.from);
      if (!this.#leader && !this.#lockAc) this.#claim();
    } else if (t === "vis") {
      if (m.on) this.#peers.add(m.from);
      else this.#peers.delete(m.from);
      if (m.on && this.#leader) this.#wake();
    } else if (t === "ev" && m.ev) this.#event(m.ev, false);
    else if (t === "job" && m.ev) this.#apply(m.ev);
    else if (t === "dis" && m.id) this.#drop(m.id);
  }

  // ---------------------------------------------------------------- estado

  /** Un evento del stream, del sondeo o de la pestaña líder. La líder lo reparte. */
  #event(raw: JobEvent, relay = true): boolean {
    const ev = cleanJob(raw, true);
    if (!ev) return false;
    if (ev.seq !== undefined) this.#last = String(ev.seq);
    if (relay && this.#leader) this.#post({ t: "ev", ev });
    const known = this.#jobs.has(ev.id);
    const ok = this.#apply(ev);
    // Uno lanzado en otro dispositivo llega sin título: se piden sus datos (la líder, una vez).
    if (ok && relay && !known && !this.#jobs.get(ev.id)!.title) void this.#fetchJob(ev.id);
    return ok;
  }

  #apply(ev: JobEvent, force = false): boolean {
    if (this.#gone.has(ev.id)) return false;
    const old = this.#jobs.get(ev.id);
    const job = mergeJob(old, ev, force);
    if (!job) return false;
    this.#jobs.set(job.id, job);
    if (job.status === "running" && job.done !== undefined) {
      const start = Date.parse(job.startedAt ?? "");
      // La primera muestra después de recargar: desde que empezó, así ya hay estimación.
      const prev = this.#pace.get(job.id) ?? (start && job.done > 0 ? { at: start, done: 0, rate: null, eta: null } : undefined);
      this.#pace.set(job.id, jobPace(prev, job.done, job.total, Date.now()));
    }
    const was = !!old && isJobActive(old);
    const is = isJobActive(job);
    if (was && !is) this.#end(job);
    this.#changed = true;
    this.#queue();
    if (was !== is || !old) {
      this.#save();
      this.#sync();
    }
    return true;
  }

  #drop(id: string): void {
    this.#jobs.delete(id);
    this.#rows.delete(id);
    this.#unseen.delete(id);
    this.#gone.add(id);
    if (this.#flash?.id === id) this.#flash = null;
    this.#changed = true;
    this.#save();
    this.#queue();
    this.#sync();
  }

  /** Terminó (bien, mal o cancelado) mientras la página lo seguía. */
  #end(job: Job): void {
    const L = this.#labels;
    const st = job.status;
    this.#pace.delete(job.id);
    this.#canceling.delete(job.id);
    if (this.#confirm === job.id) this.#confirm = null;
    const say = fill(st === "done" ? L.liveDone : st === "failed" ? L.liveFailed : L.liveCanceled, { title: this.#name(job) });
    if (this.#live) this.#live.textContent = say + (this.#live.textContent === say ? " " : "");
    if (st === "failed" && !this.#isOpen) this.#unseen.add(job.id);
    else {
      this.#flash = job;
      clearTimeout(this.#flashT);
      this.#flashT = setTimeout(() => ((this.#flash = null), this.#queue()), 6000);
    }
    this.dispatchEvent(new CustomEvent("nx-jobs-done", { detail: { job }, bubbles: true, composed: true }));
    if (!this.#isOpen) {
      const tone = st === "failed" ? "danger" : st === "canceled" ? "neutral" : job.result?.errors ? "warning" : "success";
      void import("../toast/index")
        .then(({ nxToast }) => nxToast({ message: say, tone, action: L.view }))
        .then((r) => r === "action" && void this.show());
    }
    if (this.notify && document.hidden && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        // La misma `tag` en todas las pestañas: el sistema muestra una sola.
        new Notification(say, { body: job.result?.message ?? "", tag: `nx-jobs:${job.id}` });
      } catch {
        /* sin notificaciones en este contexto */
      }
    }
  }

  #key(): string {
    return `nx-jobs:${this.endpoint ?? ""}`;
  }
  #readMemo(): { a: string[]; d: string[] } {
    try {
      return readJobsMemo(localStorage.getItem(this.#key()));
    } catch {
      return readJobsMemo(null);
    }
  }
  #save(): void {
    const s = JSON.stringify({ a: this.active.map((j) => j.id), d: [...this.#gone].slice(-100) });
    if (s === this.#memo) return;
    this.#memo = s;
    try {
      localStorage.setItem(this.#key(), s);
    } catch {
      /* sin almacenamiento: se sigue igual */
    }
  }

  #recent(): number {
    const n = Math.floor(Number(this.recent ?? 10));
    return n >= 0 ? Math.min(n, 50) : 10;
  }
  #loc(): string {
    return resolveLocale(this);
  }
  #name(j: Job): string {
    return j.title || this.#labels.untitled;
  }

  // ---------------------------------------------------------------- pintado

  #queue(): void {
    if (!this.#raf && this.#built) this.#raf = requestAnimationFrame(() => this.#flush());
  }

  /** Todo lo que cambió desde el cuadro anterior, de una vez: la píldora y las filas visibles. */
  #flush(): void {
    cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    const L = this.#labels;
    const { active, recent } = splitJobs(this.#jobs.values(), this.#recent());
    // Lo que ya no se muestra (terminado de más, o de hace más de un día) se olvida.
    const keep = new Set([...active, ...recent].map((j) => j.id));
    for (const id of this.#jobs.keys()) if (!keep.has(id)) this.#jobs.delete(id), this.#unseen.delete(id);

    const n = active.length;
    const f = n ? jobsFraction(active) : null;
    const bad = [...this.#unseen].map((id) => this.#jobs.get(id)!);
    const flash = this.#flash;
    let state = n ? "running" : "idle";
    let t = n ? fill(n === 1 ? L.runningOne : L.runningMany, { n }) : L.heading;
    let label = t;
    if (bad.length) {
      state = "failed";
      t = bad.length === 1 ? fill(L.failedFlash, { title: this.#name(bad[0]) }) : fill(L.failedMany, { n: bad.length });
    } else if (flash) {
      state = flash.status;
      t = fill(L[`${flash.status}Flash` as "doneFlash"] ?? "", { title: this.#name(flash) });
    } else if (f !== null) label = `${t}, ${this.#pct(f)}`;
    this.dataset.state = state;
    this.toggleAttribute("data-ind", n > 0 && f === null);
    this.#ring!.style.setProperty("--p", `${Math.round((f ?? 0) * 100)}%`);
    if (this.#text!.textContent !== t) this.#text!.textContent = t;
    const pill = this.#pill!;
    pill.setAttribute("aria-label", state === "running" ? label : t);
    pill.disabled = this.disabled;
    pill.hidden = state === "idle" && !this.always;
    if (this.#isOpen) this.#panel?.paint(active, recent);
    if (this.#changed) {
      this.#changed = false;
      this.dispatchEvent(new CustomEvent("nx-jobs-change", { detail: { jobs: [...active, ...recent] }, bubbles: true, composed: true }));
    }
  }

  #pct(f: number): string {
    try {
      return new Intl.NumberFormat(resolveLocale(this), { style: "percent" }).format(f).replace(/[  ]/g, " ");
    } catch {
      return `${Math.round(f * 100)} %`;
    }
  }

  // ---------------------------------------------------------------- panel

  /** El panel va aparte (`import()`): se trae al apuntar a la píldora o al abrirla. */
  #loadPanel(): Promise<JobsPanel> {
    return (this.#panelP ??= import("./jobs-panel").then(({ jobsPanel }) => {
      const self = this;
      return (this.#panel = jobsPanel({
        host: this,
        pill: this.#pill!,
        pop: this.#pop!,
        labels: () => this.#labels,
        pace: this.#pace,
        canceling: this.#canceling,
        rows: this.#rows,
        get confirm() {
          return self.#confirm;
        },
        set confirm(v) {
          self.#confirm = v;
        },
        name: (j) => this.#name(j),
        pct: (f) => this.#pct(f),
        flush: () => this.#flush(),
        cancel: (id) => this.cancel(id),
        retry: (id) => this.retry(id),
        dismiss: (id) => this.dismiss(id),
        hide: () => this.hide(),
      }));
    }));
  }

  #build(): void {
    this.#built = true;
    const id = `nx-jobs${++uid}-pop`;
    this.#ring = h("span", { class: "nx-jobs__ring", "aria-hidden": "true" }, glyph(CLOCK), glyph(CHECK), glyph(ALERT), glyph(BAN));
    this.#text = h("span", { class: "nx-jobs__text" });
    const pill = (this.#pill = h("button", { type: "button", class: "nx-jobs__pill", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": id }, this.#ring, this.#text));
    const pop = (this.#pop = h("div", { id, class: "nx-jobs__pop", popover: "auto", role: "dialog" }));
    this.#live = h("p", { class: "nx-jobs__vh", role: "status", "aria-live": "polite" });
    this.append(pill, pop, this.#live);

    const pre = () => void this.#loadPanel();
    pill.addEventListener("pointerenter", pre);
    pill.addEventListener("focus", pre);
    // Con el panel abierto, presionar la píldora ya lo cierra (clic fuera): ese clic no lo reabre.
    let wasOpen = false;
    pill.addEventListener("pointerdown", () => (wasOpen = this.#isOpen));
    pill.addEventListener("click", () => {
      if (this.#isOpen) this.hide();
      else if (!wasOpen) void this.show();
      wasOpen = false;
    });
    pop.addEventListener("beforetoggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      if (open === this.#isOpen) return;
      this.#isOpen = open;
      if (open) {
        this.#unseen.clear();
        this.#confirm = null;
        this.#flush();
        this.#panel?.place();
        this.#track = this.#panel?.follow();
      } else this.#track?.();
    });
    pop.addEventListener("toggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      pill.setAttribute("aria-expanded", String(open));
      if (open) {
        if (!pop.contains(document.activeElement)) pop.querySelector("h2")?.focus({ preventScroll: true });
      } else {
        this.#queue();
        const a = document.activeElement;
        if (!a || a === document.body || pop.contains(a)) pill.focus();
      }
      this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open }, bubbles: true, composed: true }));
    });
  }
}

for (const p of STR) {
  Object.defineProperty(NxJobs.prototype, p, {
    configurable: true,
    get(this: NxJobs) {
      return this.getAttribute(p);
    },
    set(this: NxJobs, v: unknown) {
      if (v === null || v === undefined || v === "") this.removeAttribute(p);
      else this.setAttribute(p, String(v));
    },
  });
}
for (const p of BOOL) {
  Object.defineProperty(NxJobs.prototype, p, {
    configurable: true,
    get(this: NxJobs) {
      return boolAttr(this, p);
    },
    set(this: NxJobs, v: unknown) {
      this.toggleAttribute(p, !!v && v !== "false");
    },
  });
}
