/**
 * `<nx-checklist>`: procedimientos con evidencia (cierre de mes, auditoría de inventario, recepción de
 * mercancía, alistamiento de un vehículo, apertura de caja). Cada paso con responsable, fecha límite
 * y la evidencia que exige (fotos, archivos, firma, nota, un número con rango, una opción); queda
 * quién marcó cada paso y cuándo.
 *
 * Un solo diseño, de formulario: el encabezado con un único indicador de avance, los pasos por
 * sección como filas livianas y, al abrir uno (clic o Enter), su detalle en el lugar (acordeón de
 * uno a la vez, sin modales). Solo se pinta con detalle lo abierto: 300 pasos no pesan.
 *
 * Guardado optimista: cada cambio se ve al instante y va al servidor en orden (`PATCH
 * {endpoint}/steps/{id}`, con las fotos antes por `POST …/files`). Sin red, los cambios esperan en
 * una cola en memoria («pendiente de enviar») y se siguen haciendo pasos; al volver la red se envían.
 * Un error del servidor revierte ese paso con un aviso. La firma (`<nx-signature>`), el celular
 * (`<nx-handoff>`) y el aviso (`nxToast`) se cargan con `import()` al usarlos.
 *
 * Los nodos del autor nunca se mueven (hidratación de Solid): lo propio va en un contenedor al final.
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { h, safeEndpoint, safeHref, safeImageSrc } from "../../core/dom";
import { initials } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import {
  checklistAgo,
  checklistBlankEvidence,
  checklistBlocks,
  checklistDeps,
  checklistDueText,
  checklistInRange,
  checklistLogFromState,
  checklistMissing,
  checklistNumber,
  checklistOptions,
  checklistParseNumber,
  checklistOverdue,
  checklistProgress,
  checklistResolved,
  cleanChecklistItems,
  cleanChecklistLog,
  cleanChecklistPerson,
  cleanChecklistState,
  cleanChecklistStepState,
  cleanChecklistSteps,
  parseJson,
  type ChecklistSequence,
  type ChecklistSort,
} from "./logic";
import type {
  ChecklistClosed,
  ChecklistEvidence,
  ChecklistEvidenceSpec,
  ChecklistFile,
  ChecklistLabels,
  ChecklistLogEntry,
  ChecklistMode,
  ChecklistPendingChange,
  ChecklistPerson,
  ChecklistProgress,
  ChecklistState,
  ChecklistStatus,
  ChecklistStep,
  ChecklistStepState,
  ChecklistSummaryItem,
} from "./types";

export const CHECKLIST_LABELS: ChecklistLabels = {
  progress: "{done} de {total}",
  overdue: "1 vencido|{n} vencidos",
  unsent: "1 sin enviar|{n} sin enviar",
  offline: "sin conexión",
  loading: "Cargando…",
  loadError: "No se pudo cargar el procedimiento",
  retry: "Reintentar",
  complete: "Procedimiento completo",
  completeBy: "Lo completó {name} {when}",
  close: "Cerrar procedimiento",
  closed: "Procedimiento cerrado",
  closedBy: "Lo cerró {name} {when}",
  due: "vence {when}",
  late: "venció {when}",
  today: "hoy",
  tomorrow: "mañana",
  yesterday: "ayer",
  todo: "pendiente",
  done: "hecho",
  skipped: "omitido",
  reopened: "reabierto",
  blocked: "bloqueado",
  by: "por {name}",
  optional: "opcional",
  first: "Primero: {step}",
  assignee: "Responsable: {name}",
  pending: "pendiente de enviar",
  outOfRange: "fuera de rango",
  range: "Entre {min} y {max}",
  min: "Mínimo {min}",
  max: "Máximo {max}",
  rangeWarn: "Fuera de rango: se puede cerrar, pero explica la novedad en la nota.",
  explain: "Nota: explica la novedad",
  markDone: "Marcar como hecho",
  missing: "Falta: {list}",
  skip: "Omitir",
  skipConfirm: "Omitir paso",
  reopen: "Reabrir",
  reopenConfirm: "Reabrir paso",
  cancel: "Cancelar",
  reason: "Motivo",
  reasonRequired: "Escribe el motivo",
  photo: "Foto",
  file: "Archivo",
  signature: "Firma",
  note: "Nota",
  number: "Valor",
  choice: "Opción",
  takePhoto: "Tomar foto",
  phone: "Tomar con el celular",
  attach: "Adjuntar archivo",
  remove: "Quitar {name}",
  needPhotos: "1 foto más|{n} fotos más",
  needFiles: "1 archivo más|{n} archivos más",
  activity: "Actividad",
  empty: "Todavía no hay actividad",
  logDone: "marcó «{step}» como hecho",
  logSkipped: "omitió «{step}»",
  logReopened: "reabrió «{step}»",
  logBlocked: "bloqueó «{step}»",
  logClosed: "cerró el procedimiento",
  logReverted: "no se guardó «{step}»",
  error: "No se guardó «{step}»: {message}",
  sort: "Ordenar",
  sortDue: "Por vencimiento",
  sortProgress: "Por avance",
  sortTitle: "Por nombre",
  count: "{done}/{total}",
};

/** Un cambio en la cola: el estado al que va el paso (o el cierre) y el de antes, para revertir. */
type Op = { cid: string; step: string; at: string; next?: ChecklistStepState; prev?: ChecklistStepState; close?: ChecklistClosed; body: Record<string, unknown> };
type Draft = { ev: ChecklistEvidence[]; note: string };
type Row = { li: HTMLLIElement; g: HTMLElement; btn: HTMLButtonElement; key: string };

const JSON_ATTRS = ["steps", "state", "items", "me", "labels"];
/** Cada cuánto se ponen al día «vence hoy…» y «hace 5 min». */
const TICK = 60_000;
const MAX_WAIT = 30_000;

let uid = 0;
const fill = (t: string, o: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));
const plural = (t: string, n: number) => fill(t.split("|")[n === 1 ? 0 : 1] ?? t, { n });
/** Reintentable: la red o el servidor de paso (sin revertir). */
const transient = (s: number) => s === 408 || s === 429 || (s >= 502 && s <= 504);
const cid = () => globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
const iso = () => new Date().toISOString();
const clone = (ev: ChecklistEvidence[] = []) => ev.map((e) => ({ ...e, files: e.files?.slice() }));
/** Con un espacio entre cada uno: en un contenedor flex no se ve, pero el nombre accesible (y el texto) no sale pegado. */
const spaced = (...nodes: (Node | string | null | false | undefined)[]): (Node | string)[] => nodes.filter((n): n is Node | string => !!n).flatMap((n, i) => (i ? [" ", n] : [n]));
const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 0);

export class NxChecklist extends Base {
  static observedAttributes = [...JSON_ATTRS, "mode", "sequential", "readonly", "disabled", "locale", "heading"];

  #uid = `nx-cl${++uid}-`;
  #labels = CHECKLIST_LABELS;
  #steps: ChecklistStep[] = [];
  #state: ChecklistState = {};
  #items: ChecklistSummaryItem[] = [];
  #me: ChecklistPerson | undefined;
  #title = "";
  #closed: ChecklistClosed | null = null;
  /** La bitácora del servidor (o la deducida del estado) más lo hecho aquí. */
  #log: ChecklistLogEntry[] | null = null;
  #stateGiven = false;
  #loaded = false;
  #loading = false;
  #loadErr = false;
  #drafts = new Map<string, Draft>();
  #q: Op[] = [];
  #flushing = false;
  #offline = false;
  #tries = 0;
  #open: string | null = null;
  #reason: "skip" | "reopen" | null = null;
  #sort: ChecklistSort = "due";
  #deps = new Map<string, string[]>();
  #blocks = new Map<string, string>();
  #rows = new Map<string, Row>();
  /** Los archivos de verdad detrás de cada adjunto (lo que se sube), y las miniaturas locales del panel abierto. */
  #blobs = new WeakMap<ChecklistFile, File>();
  #taken = new WeakSet<File>();
  #urls: string[] = [];
  #root?: HTMLElement;
  #panel?: HTMLElement;
  #check?: () => void;
  #ac?: AbortController;
  #send?: AbortController;
  #tick?: ReturnType<typeof setInterval>;
  #retry?: ReturnType<typeof setTimeout>;
  #built = false;
  #endKey = "";

  // ---------------------------------------------------------------- propiedades

  /** Los pasos (JSON): `{id, title, hint?, section?, assignee?, due?, required?, evidence?, dependsOn?, canSkip?}`. */
  get steps(): ChecklistStep[] {
    return this.#steps;
  }
  set steps(v: ChecklistStep[] | string | null | undefined) {
    this.#setSteps(v);
    this.#render();
  }
  /** El estado de cada paso, por `id` (`{status, by, at, evidence, reason?}`), con lo que falta por enviar encima. */
  get state(): ChecklistState {
    return this.#state;
  }
  set state(v: ChecklistState | string | null | undefined) {
    this.#stateGiven = v != null;
    this.#state = cleanChecklistState(v);
    this.#log = null;
    this.#overlay();
    this.#render();
  }
  /** `mode="summary"`: los procedimientos `[{id, title, href?, done, total, overdue?, assignee?, due?}]`. */
  get items(): ChecklistSummaryItem[] {
    return this.#items;
  }
  set items(v: ChecklistSummaryItem[] | string | null | undefined) {
    this.#items = cleanChecklistItems(v);
    this.#render();
  }
  /** Quien usa la pantalla (`{id, name, avatar?}`): el «por» de cada paso. */
  get me(): ChecklistPerson | null {
    return this.#me ?? null;
  }
  set me(v: ChecklistPerson | string | null | undefined) {
    this.#me = cleanChecklistPerson(parseJson(v));
  }
  get labels(): ChecklistLabels {
    return this.#labels;
  }
  set labels(v: Partial<ChecklistLabels> | string | null | undefined) {
    this.#labels = mergeLabels(CHECKLIST_LABELS, v);
    this.#render();
  }
  /** `true` (atributo vacío): todo en orden; una lista (JSON) o un nombre: solo esas secciones. */
  get sequential(): ChecklistSequence {
    const v = this.getAttribute("sequential");
    if (v === null || v === "false") return false;
    if (v === "" || v === "true") return true;
    const j = parseJson(v);
    return Array.isArray(j) ? j.map(String) : [v];
  }
  set sequential(v: ChecklistSequence | string | null | undefined) {
    if (v === false || v == null) this.removeAttribute("sequential");
    else this.setAttribute("sequential", v === true ? "" : typeof v === "string" ? v : JSON.stringify(v));
  }
  get mode(): ChecklistMode {
    return this.getAttribute("mode") === "summary" ? "summary" : "run";
  }
  set mode(v: ChecklistMode) {
    this.setAttribute("mode", v);
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
  get locale(): string {
    return resolveLocale(this);
  }
  set locale(v: string | null) {
    this.#attr("locale", v);
  }
  /** La base de las rutas: `GET {endpoint}`, `PATCH {endpoint}/steps/{id}`, `POST {endpoint}/steps/{id}/files`, `POST {endpoint}/close`. */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    this.#attr("endpoint", v);
  }
  /** La base de `<nx-handoff>` (`/api/handoff`): muestra «Tomar con el celular» en las fotos. */
  get handoff(): string | null {
    return this.getAttribute("handoff");
  }
  set handoff(v: string | null) {
    this.#attr("handoff", v);
  }
  /** El nombre del procedimiento (si el servidor no manda `title`). */
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string | null) {
    this.#attr("heading", v);
  }
  /** `{done, total, required, requiredDone, skipped, overdue, complete}`. */
  get progress(): ChecklistProgress {
    return checklistProgress(this.#steps, this.#state);
  }
  /** Los cambios que todavía no llegan al servidor, en orden. */
  get pending(): ChecklistPendingChange[] {
    return this.#q.map((o) => ({ clientId: o.cid, step: o.step, status: o.close ? "closed" : o.next!.status, at: o.at }));
  }
  /** Quién cerró el procedimiento y cuándo (o `null`). */
  get closed(): ChecklistClosed | null {
    return this.#closed;
  }

  // ---------------------------------------------------------------- API

  /** Abre un paso (y lo trae a la vista). */
  open(stepId: string): void {
    if (!this.#rows.has(stepId)) return;
    this.#toggle(stepId, true);
    const r = this.#rows.get(stepId)!;
    r.li.scrollIntoView?.({ block: "nearest" });
    r.btn.focus();
  }

  /** Vuelve a traer el procedimiento (`GET {endpoint}`); lo que falta por enviar queda encima. */
  reload(): Promise<void> {
    return this.#load();
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    this.#built = true;
    this.#render();
    this.#tick = setInterval(() => this.#update(), TICK);
    // En reposo, lo que un paso abierto va a necesitar: sin señal en la bodega se abre igual.
    if (this.mode === "run")
      (globalThis.requestIdleCallback ?? setTimeout)(() => {
        void this.#fields().catch(() => {});
        if (this.#steps.some((s) => s.evidence?.some((e) => e.type === "signature"))) void import("../signature/index").catch(() => {});
      });
    addEventListener("online", this.#online);
    if (this.mode === "run" && this.endpoint && !this.#stateGiven && !this.#loaded) void this.#load();
    else void this.#flush();
  }

  disconnectedCallback(): void {
    clearInterval(this.#tick);
    clearTimeout(this.#retry);
    removeEventListener("online", this.#online);
    this.#ac?.abort();
    this.#send?.abort();
    this.#revoke();
  }

  attributeChangedCallback(name: string, old: string | null, value: string | null): void {
    if (old === value) return;
    if (JSON_ATTRS.includes(name)) {
      const v = value === null ? null : parseJson(value);
      // Un JSON inválido avisa y deja lo que había.
      if (value !== null && v === undefined) console.warn(`[nx-checklist] el atributo "${name}" no es JSON válido`);
      else (this as unknown as Record<string, unknown>)[name] = v;
    } else this.#render();
  }

  // ---------------------------------------------------------------- servidor

  async #load(): Promise<void> {
    const url = safeEndpoint(this.endpoint);
    if (!url || !this.isConnected) return;
    this.#ac?.abort();
    const ac = (this.#ac = new AbortController());
    this.#loading = true;
    this.#loadErr = false;
    if (this.#steps.length) this.#root?.setAttribute("aria-busy", "true");
    else this.#render();
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" }, credentials: "same-origin", signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = ((await res.json()) ?? {}) as Record<string, unknown>;
      if (ac.signal.aborted) return;
      if (typeof d.title === "string") this.#title = d.title;
      if (Array.isArray(d.steps)) this.#setSteps(d.steps);
      if (d.state) this.#state = cleanChecklistState(d.state);
      if ("closed" in d) this.#closed = d.closed && typeof d.closed === "object" ? (d.closed as ChecklistClosed) : null;
      this.#log = Array.isArray(d.log) ? cleanChecklistLog(d.log) : null;
      this.#overlay();
      this.#loaded = true;
    } catch (e) {
      if (ac.signal.aborted) return;
      this.#loadErr = true;
      this.#emit("error", { message: e instanceof Error ? e.message : String(e) });
    }
    this.#loading = false;
    this.#render();
    void this.#flush();
  }

  /** Lo que falta por enviar va encima de lo que llegó del servidor. */
  #overlay(): void {
    for (const o of this.#q) {
      if (o.next) this.#state[o.step] = o.next;
      if (o.close) this.#closed = o.close;
    }
  }

  #online = () => {
    this.#tries = 0;
    void this.#flush();
  };

  #enqueue(op: Op): void {
    if (!safeEndpoint(this.endpoint)) return;
    this.#q.push(op);
    void this.#flush();
  }

  /** Envía la cola en orden. Sin red (o con el servidor de paso), espera y reintenta; un rechazo revierte ese paso. */
  async #flush(): Promise<void> {
    const ep = safeEndpoint(this.endpoint);
    if (this.#flushing || !ep || !this.isConnected) return;
    this.#flushing = true;
    clearTimeout(this.#retry);
    try {
      while (this.#q.length && this.isConnected) {
        const op = this.#q[0];
        let res: Response;
        try {
          res = await this.#post(ep, op);
        } catch {
          if (!this.isConnected) return;
          res = new Response(null, { status: 503 });
        }
        if (transient(res.status)) {
          this.#offline = true;
          this.#update();
          this.#retry = setTimeout(() => void this.#flush(), Math.min(MAX_WAIT, 1000 * 2 ** this.#tries++));
          return;
        }
        this.#offline = false;
        this.#tries = 0;
        this.#q.shift();
        if (res.ok) {
          const st = cleanChecklistStepState(await res.json().catch(() => null));
          if (st && op.next && !this.#q.some((o) => o.step === op.step)) this.#state[op.step] = st;
        } else {
          let message = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            if (typeof j?.message === "string") message = j.message;
          } catch {
            /* sin cuerpo */
          }
          this.#revert(op, message, res.status);
        }
        this.#update();
      }
    } finally {
      this.#flushing = false;
    }
  }

  /** Las fotos y archivos nuevos (`POST …/files`) y después el cambio (`PATCH …/steps/{id}`, o `POST …/close`). */
  async #post(ep: string, op: Op): Promise<Response> {
    const base = ep.replace(/\/+$/, "");
    const url = op.close ? `${base}/close` : `${base}/steps/${encodeURIComponent(op.step)}`;
    this.#send = new AbortController();
    const init = { credentials: "same-origin" as const, signal: this.#send.signal };
    const up = (op.next?.evidence ?? []).flatMap((e) => (e.files ?? []).filter((f) => !f.url && this.#blobs.has(f)));
    if (up.length) {
      const fd = new FormData();
      for (const f of up) fd.append("files", this.#blobs.get(f)!, f.name);
      const res = await fetch(`${url}/files`, { ...init, method: "POST", body: fd });
      if (!res.ok) return res;
      const got = ((await res.json().catch(() => null)) as { files?: Partial<ChecklistFile>[] } | null)?.files ?? [];
      up.forEach((f, i) => {
        const g = got[i];
        if (typeof g?.url === "string") f.url = g.url;
        if (typeof g?.id === "string") f.id = g.id;
      });
    }
    return fetch(url, { ...init, method: op.close ? "POST" : "PATCH", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(op.body) });
  }

  /** El servidor rechazó un cambio: ese paso vuelve a como estaba (y se descarta lo que venía detrás para él). */
  #revert(op: Op, message: string, status: number): void {
    this.#logNow();
    this.#q = this.#q.filter((o) => o.step !== op.step || !!o.close !== !!op.close);
    if (op.close) this.#closed = null;
    else if (op.prev) this.#state[op.step] = op.prev;
    else delete this.#state[op.step];
    this.#drafts.delete(op.step);
    this.#pushLog({ action: "reverted", step: op.step || undefined, at: iso(), reason: message });
    const title = this.#stepById(op.step)?.title ?? "";
    const text = fill(this.#labels.error, { step: title, message });
    this.#emit("error", { message, step: op.step || undefined, status });
    void import("../toast/index").then(({ nxToast }) => nxToast({ message: text, tone: "danger" })).catch(() => {});
    this.#update();
    this.#paintPanel();
  }

  // ---------------------------------------------------------------- acciones

  /** Aplica un cambio al instante, lo anota en la bitácora y lo pone en la cola. */
  #commit(step: ChecklistStep, next: ChecklistStepState, action: ChecklistLogEntry["action"]): void {
    this.#logNow();
    const prev = this.#state[step.id];
    this.#state[step.id] = next;
    this.#reason = null;
    if (next.status !== "todo") this.#drafts.delete(step.id);
    this.#pushLog({ action, step: step.id, by: next.by, at: next.at!, reason: next.reason });
    const evidence = next.evidence ?? [];
    const body: Record<string, unknown> = { status: next.status, evidence, clientId: cid() };
    if (next.reason) body.reason = next.reason;
    if (next.note) body.note = next.note;
    this.#enqueue({ cid: body.clientId as string, step: step.id, at: next.at!, next, prev, body });
    this.#emit("change", { step: step.id, status: next.status, evidence, reason: next.reason, note: next.note });
    if (next.status !== "todo") this.#open = null;
    this.#update();
    this.#paintPanel();
    this.#rows.get(step.id)?.btn.focus();
  }

  #done(step: ChecklistStep): void {
    const d = this.#draft(step);
    const { missing } = checklistMissing(step, d.ev, d.note);
    if (missing.length || !this.#editable(step)) return;
    const ev = clone(d.ev);
    (step.evidence ?? []).forEach((s, i) => {
      if (s.type === "number" && ev[i]) ev[i].outOfRange = checklistInRange(ev[i].value, s) === false || undefined;
    });
    const note = checklistMissing(step, ev).needsNote && !(step.evidence ?? []).some((s) => s.type === "note") ? d.note.trim() : "";
    this.#commit(step, { status: "done", by: this.#me, at: iso(), evidence: ev, ...(note ? { note } : {}) }, "done");
  }

  #withReason(step: ChecklistStep, reason: string): void {
    const cur = this.#state[step.id];
    if (this.#reason === "skip") this.#commit(step, { status: "skipped", by: this.#me, at: iso(), reason, evidence: clone(this.#drafts.get(step.id)?.ev ?? []) }, "skipped");
    else {
      // Reabierto: la evidencia queda como borrador, para corregirla.
      this.#drafts.set(step.id, { ev: clone(cur?.evidence), note: cur?.note ?? "" });
      this.#commit(step, { status: "todo", by: this.#me, at: iso(), reason, evidence: cur?.evidence ?? [] }, "reopened");
    }
  }

  #close(): void {
    const progress = this.progress;
    if (!progress.complete || this.#closed || this.#ro()) return;
    const at = iso();
    if (!this.#emit("complete", { by: this.#me, at, progress }, true)) return;
    const closed: ChecklistClosed = { by: this.#me, at };
    const id = cid();
    this.#logNow();
    this.#closed = closed;
    this.#pushLog({ action: "closed", by: this.#me, at });
    this.#enqueue({ cid: id, step: "", at, close: closed, body: { clientId: id, at } });
    this.#open = null;
    this.#render();
    this.#root?.querySelector<HTMLElement>(".nx-cl__end")?.focus();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v == null || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(`nx-checklist-${type}`, { detail, bubbles: true, composed: true, cancelable }));
  }

  #setSteps(v: unknown): void {
    this.#steps = cleanChecklistSteps(v);
    const { deps, cycles } = checklistDeps(this.#steps);
    this.#deps = deps;
    if (cycles.length) console.warn(`[nx-checklist] dependencias en ciclo (se ignoran entre ellos): ${cycles.join(", ")}`);
  }

  #stepById(id: string): ChecklistStep | undefined {
    return this.#steps.find((s) => s.id === id);
  }

  #ro(): boolean {
    return this.readonly || this.disabled || !!this.#closed;
  }

  #editable(step: ChecklistStep): boolean {
    return !this.#ro() && !this.#blocks.has(step.id) && !checklistResolved(this.#state[step.id]);
  }

  /** La bitácora deducida del estado se fija antes de cambiarlo (si no, reabrir borraría el «hecho» de antes). */
  #logNow(): ChecklistLogEntry[] {
    return (this.#log ??= checklistLogFromState(this.#steps, this.#state));
  }

  #pushLog(e: ChecklistLogEntry): void {
    this.#logNow().push(e);
  }

  #draft(step: ChecklistStep): Draft {
    let d = this.#drafts.get(step.id);
    if (!d) {
      const st = this.#state[step.id];
      const blank = checklistBlankEvidence(step);
      const ev = clone(st?.evidence);
      d = { ev: blank.map((b, i) => (ev[i]?.type === b.type ? ev[i] : b)), note: st?.note ?? "" };
      this.#drafts.set(step.id, d);
    }
    return d;
  }

  /** Los campos de evidencia (chunk aparte, pedido en reposo al conectar). */
  #fields() {
    return import("./checklist-fields");
  }

  #revoke(): void {
    for (const u of this.#urls.splice(0)) URL.revokeObjectURL(u);
  }

  #who(p: ChecklistPerson | undefined, cls = "nx-cl__who"): HTMLElement {
    const src = safeImageSrc(p?.avatar);
    const el = h("span", { class: cls, style: `--h:${hue(p?.name ?? "")}` }, src ? h("img", { src, alt: "", referrerpolicy: "no-referrer" }) : initials(p?.name ?? ""));
    if (p) {
      el.title = p.name;
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", fill(this.#labels.assignee, { name: p.name }));
    }
    return el;
  }

  /** «hecho por Laura Gómez hace 2 h». */
  #statusText(st: ChecklistStepState | undefined, blocker: string | undefined): string {
    const L = this.#labels;
    if (blocker !== undefined) {
      const b = blocker && this.#stepById(blocker);
      return b ? fill(L.first, { step: b.title }) : [L.blocked, st?.reason].filter(Boolean).join(": ");
    }
    if (!checklistResolved(st)) return L.todo;
    return [L[st!.status as "done" | "skipped"], st!.by && fill(L.by, { name: st!.by.name }), checklistAgo(st!.at, Date.now(), this.locale)].filter(Boolean).join(" ");
  }

  // ---------------------------------------------------------------- pintado

  #render(): void {
    if (!this.#built || !this.isConnected) return;
    const L = this.#labels;
    this.#revoke();
    this.#panel = undefined;
    this.#rows.clear();
    const summary = this.mode === "summary";
    const root = h("div", { class: `nx-cl${summary ? " nx-cl--summary" : ""}` });
    this.#root?.remove();
    this.#root = root;
    this.#endKey = "";
    this.append(root);
    if (summary) {
      root.setAttribute("aria-busy", "true");
      void import("./checklist-summary").then(({ renderChecklistSummary }) => {
        if (this.#root !== root) return;
        renderChecklistSummary(root, {
          items: this.#items,
          labels: L,
          locale: this.locale,
          sort: this.#sort,
          uid: this.#uid,
          who: (p) => this.#who(p),
          open: (item) => this.#emit("open", { item }, true),
          resort: (by) => {
            this.#sort = by;
            this.#render();
            queueMicrotask(() => setTimeout(() => this.#root?.querySelector("select")?.focus()));
          },
        });
      });
      return;
    }
    root.addEventListener("click", this.#onClick);
    root.addEventListener("keydown", this.#onKey);
    root.append(
      h(
        "header",
        { class: "nx-cl__head" },
        h("h2", { class: "nx-cl__title" }, this.#title || this.heading),
        h("div", { class: "nx-cl__bar", role: "progressbar", "aria-valuemin": 0 }, h("span")),
        h("p", { class: "nx-cl__sum", "aria-live": "polite" }),
        h("div", { class: "nx-cl__end", tabindex: -1 }),
      ),
    );
    if (this.#loading && !this.#steps.length) root.append(h("p", { class: "nx-cl__note" }, L.loading));
    if (this.#loadErr) root.append(h("p", { class: "nx-cl__note", role: "alert" }, L.loadError, " ", h("button", { type: "button", class: "nx-cl__btn", "data-a": "reload" }, L.retry)));
    root.toggleAttribute("aria-busy", this.#loading);
    let list: HTMLElement | null = null;
    let sec: string | undefined | null = null;
    for (const s of this.#steps) {
      if (!list || s.section !== sec) {
        sec = s.section;
        const id = `${this.#uid}s${this.#rows.size}`;
        list = h("ol", { class: "nx-cl__list", "aria-labelledby": sec ? id : null });
        root.append(h("section", { class: "nx-cl__sec" }, sec ? h("h3", { class: "nx-cl__sect", id }, sec) : null, list));
      }
      const btn = h("button", { type: "button", class: "nx-cl__open", "aria-expanded": "false", "data-step": s.id });
      const g = h("div", { class: "nx-cl__g", role: "group" }, h("div", { class: "nx-cl__row" }, h("span", { class: "nx-cl__box", "aria-hidden": "true", "data-step": s.id }), btn, s.assignee ? this.#who(s.assignee) : null));
      const li = h("li", { class: "nx-cl__step" }, g);
      list.append(li);
      this.#rows.set(s.id, { li, g, btn, key: "" });
    }
    const log = h("details", { class: "nx-cl__log" }, h("summary", null, L.activity), h("ol"));
    log.addEventListener("toggle", () => this.#paintLog());
    root.append(log);
    this.#update();
    this.#paintPanel();
  }

  /** Pone al día el encabezado y las filas que cambiaron (una clave por fila: las demás no se tocan). */
  #update(): void {
    const root = this.#root;
    if (!root || this.mode === "summary") return;
    const L = this.#labels;
    const now = Date.now();
    const loc = this.locale;
    this.#blocks = checklistBlocks(this.#steps, this.#state, this.sequential, this.#deps);
    const p = checklistProgress(this.#steps, this.#state, now);
    const pend = new Set(this.#q.map((o) => o.step));
    const bar = root.querySelector<HTMLElement>(".nx-cl__bar")!;
    const parts = [fill(L.progress, { done: p.done, total: p.total })];
    if (p.overdue) parts.push(plural(L.overdue, p.overdue));
    if (this.#q.length) parts.push(plural(L.unsent, this.#q.length) + (this.#offline ? ` (${L.offline})` : ""));
    const sum = parts.join(" · ");
    const sumEl = root.querySelector(".nx-cl__sum")!;
    // Solo si cambió: el reloj de cada minuto no vuelve a anunciar lo mismo (`aria-live`).
    if (sumEl.textContent !== sum) sumEl.textContent = sum;
    bar.setAttribute("aria-valuemax", String(p.total));
    bar.setAttribute("aria-valuenow", String(p.done));
    bar.setAttribute("aria-valuetext", sum);
    const name = this.#title || this.heading;
    if (name) bar.setAttribute("aria-label", name);
    bar.style.setProperty("--p", `${p.total ? (p.done / p.total) * 100 : 0}%`);
    root.toggleAttribute("data-complete", p.complete);
    root.toggleAttribute("data-offline", this.#offline && !!this.#q.length);
    // El final: completo (con quién y cuándo) y «Cerrar procedimiento», o cerrado.
    const end = root.querySelector<HTMLElement>(".nx-cl__end")!;
    const last = p.complete && !this.#closed ? this.#steps.reduce<ChecklistStepState | undefined>((a, s) => ((this.#state[s.id]?.at ?? "") > (a?.at ?? "") && s.required !== false ? this.#state[s.id] : a), undefined) : undefined;
    const who = this.#closed ?? last;
    // Se rehace solo si cambia qué dice (no con el reloj): el botón enfocado no pierde el foco.
    const endKey = `${!!this.#closed}|${p.complete}|${this.#ro()}|${!!who}`;
    if (endKey !== this.#endKey) {
      this.#endKey = endKey;
      end.replaceChildren(
        ...(this.#closed || p.complete
          ? spaced(
              h("strong", null, this.#closed ? L.closed : L.complete),
              who && h("span"),
              !this.#closed && !this.#ro() && h("button", { type: "button", class: "nx-cl__btn nx-cl__btn--primary", "data-a": "close" }, L.close),
            )
          : []),
      );
    }
    const whoEl = end.querySelector("span");
    if (whoEl && who) whoEl.textContent = fill(this.#closed ? L.closedBy : L.completeBy, { name: who.by?.name ?? "", when: checklistAgo(who.at, now, loc) }).replace(/\s+/g, " ");
    for (const s of this.#steps) {
      const r = this.#rows.get(s.id)!;
      const st = this.#state[s.id];
      const blocker = this.#blocks.get(s.id);
      const due = checklistResolved(st) ? null : checklistDueText(s.due, now, loc, L);
      const status = checklistResolved(st) ? st!.status : blocker !== undefined ? "blocked" : "todo";
      const range = st?.status === "done" && st.evidence?.some((e) => e.outOfRange);
      const text = this.#statusText(st, blocker);
      const open = this.#open === s.id;
      const key = [status, text, due?.text, pend.has(s.id), range, open].join("|");
      if (key === r.key) continue;
      r.key = key;
      r.li.dataset.s = status;
      r.li.toggleAttribute("data-late", !!due?.late);
      r.g.setAttribute("aria-label", [s.title, text, due?.text].filter(Boolean).join(", "));
      r.btn.setAttribute("aria-expanded", String(open));
      if (open) r.btn.setAttribute("aria-controls", `${this.#uid}p`);
      else r.btn.removeAttribute("aria-controls");
      const chip = (cls: string, t: string) => h("span", { class: `nx-cl__chip nx-cl__chip--${cls}` }, t);
      const meta = spaced(
        status !== "todo" && chip(status, text),
        due && chip(due.late ? "late" : "due", due.text),
        range && chip("range", L.outOfRange),
        s.required === false && status === "todo" && chip("opt", L.optional),
        pend.has(s.id) && chip("pending", L.pending),
      );
      r.btn.replaceChildren(...spaced(h("span", { class: "nx-cl__t" }, s.title), meta.length > 0 && h("span", { class: "nx-cl__m" }, ...meta)));
    }
    if (root.querySelector<HTMLDetailsElement>(".nx-cl__log")?.open) this.#paintLog();
  }

  #paintLog(): void {
    const log = this.#root?.querySelector<HTMLDetailsElement>(".nx-cl__log");
    if (!log) return;
    const L = this.#labels;
    const entries = this.#log ?? checklistLogFromState(this.#steps, this.#state);
    const verb: Record<string, string> = { done: L.logDone, skipped: L.logSkipped, reopened: L.logReopened, blocked: L.logBlocked, closed: L.logClosed, reverted: L.logReverted };
    const now = Date.now();
    const fmt = new Intl.DateTimeFormat(this.locale, { dateStyle: "medium", timeStyle: "short" });
    log.querySelector("summary")!.textContent = `${L.activity} (${entries.length})`;
    log.querySelector("ol")!.replaceChildren(
      ...(entries.length
        ? [...entries].reverse().map((e) => {
            const t = Date.parse(e.at);
            return h(
              "li",
              null,
              e.by ? h("strong", null, e.by.name) : null,
              ` ${fill(verb[e.action], { step: this.#stepById(e.step ?? "")?.title ?? e.step ?? "" })}`,
              h("time", { datetime: e.at, title: Number.isFinite(t) ? fmt.format(t) : null }, ` · ${checklistAgo(e.at, now, this.locale)}`),
              e.reason ? h("small", null, `${L.reason}: ${e.reason}`) : null,
            );
          })
        : [h("li", { class: "nx-cl__note" }, L.empty)]),
    );
  }

  #toggle(id: string | null, force?: boolean): void {
    this.#open = force || this.#open !== id ? id : null;
    this.#reason = null;
    this.#update();
    this.#paintPanel();
  }

  /** El detalle del paso abierto (solo uno): ayuda, evidencia (para llenar o para ver) y acciones. */
  #paintPanel(): void {
    this.#revoke();
    this.#panel?.remove();
    this.#panel = undefined;
    this.#check = undefined;
    const step = this.#open ? this.#stepById(this.#open) : undefined;
    const row = step && this.#rows.get(step.id);
    if (!step || !row) return;
    const L = this.#labels;
    const st = this.#state[step.id];
    const blocker = this.#blocks.get(step.id);
    const edit = this.#editable(step);
    const p = h("div", { class: "nx-cl__panel", id: `${this.#uid}p`, "data-step": step.id });
    this.#panel = p;
    if (step.hint) p.append(h("p", { class: "nx-cl__hint" }, step.hint));
    if (blocker !== undefined) p.append(h("p", { class: "nx-cl__lock" }, this.#statusText(st, blocker)));
    if (checklistResolved(st) || (st?.reason && st.status === "todo")) {
      const when = new Date(st!.at ?? "");
      p.append(
        h(
          "p",
          { class: "nx-cl__by" },
          [st!.status === "todo" ? L.reopened : L[st!.status as "done"], st!.by && fill(L.by, { name: st!.by.name }), Number.isFinite(when.getTime()) ? new Intl.DateTimeFormat(this.locale, { dateStyle: "medium", timeStyle: "short" }).format(when) : ""].filter(Boolean).join(" "),
          st!.reason ? h("small", null, `${L.reason}: ${st!.reason}`) : null,
        ),
      );
    }
    const acts = h("div", { class: "nx-cl__acts" });
    if (edit) {
      const d = this.#draft(step);
      const warn = h("p", { class: "nx-cl__warn", role: "status", hidden: true }, L.rangeWarn);
      const extraId = `${this.#uid}x`;
      const extra = h("textarea", { id: extraId, class: "nx-cl__in", rows: 2 });
      extra.value = d.note;
      extra.addEventListener("input", () => ((d.note = extra.value), this.#check?.()));
      const extraBox = h("div", { class: "nx-cl__ev", hidden: true }, h("label", { class: "nx-cl__lab", for: extraId }, L.explain), extra);
      const fields = h("div", { class: "nx-cl__fields" });
      if (step.evidence?.length) p.append(fields);
      void this.#fields().then(({ checklistField }) => {
        if (this.#panel !== p) return;
        const host = { labels: L, locale: this.locale, uid: this.#uid, handoff: this.handoff ?? this.querySelector(":scope > nx-handoff")?.getAttribute("endpoint"), blobs: this.#blobs, taken: this.#taken, urls: this.#urls, changed: () => this.#check?.() };
        (step.evidence ?? []).forEach((spec, i) => fields.append(checklistField(host, spec, i, (d.ev[i] ??= { type: spec.type }))));
      });
      const missId = `${this.#uid}m`;
      const miss = h("p", { class: "nx-cl__miss", id: missId });
      const doneBtn = h("button", { type: "button", class: "nx-cl__btn nx-cl__btn--primary", "data-a": "done", "aria-describedby": missId }, L.markDone);
      p.append(extraBox, warn);
      acts.append(doneBtn, step.canSkip ? h("button", { type: "button", class: "nx-cl__btn", "data-a": "skip" }, L.skip) : "", miss);
      this.#check = () => {
        const r = checklistMissing(step, d.ev, d.note);
        const noteSpec = (step.evidence ?? []).some((s) => s.type === "note");
        extraBox.hidden = !r.needsNote || noteSpec;
        warn.hidden = !r.outOfRange;
        doneBtn.disabled = !!r.missing.length;
        miss.textContent = r.missing.length ? fill(L.missing, { list: r.missing.map((m) => this.#missText(m)).join(", ") }) : "";
      };
      this.#check();
    } else {
      (step.evidence ?? []).forEach((spec, i) => {
        const v = this.#view(spec, st?.evidence?.[i]);
        if (v) p.append(v);
      });
      if (st?.note) p.append(h("div", { class: "nx-cl__ev" }, h("span", { class: "nx-cl__lab" }, L.explain), h("p", { class: "nx-cl__val" }, st.note)));
      if (checklistResolved(st) && !this.#ro()) acts.append(h("button", { type: "button", class: "nx-cl__btn", "data-a": "reopen" }, L.reopen));
    }
    if (this.#reason) {
      const rid = `${this.#uid}r`;
      const input = h("input", { id: rid, class: "nx-cl__in", autocomplete: "off" });
      const err = h("span", { class: "nx-cl__miss", role: "alert" });
      acts.replaceChildren(
        h("label", { class: "nx-cl__lab", for: rid }, L.reason),
        input,
        h("button", { type: "button", class: "nx-cl__btn nx-cl__btn--primary", "data-a": "confirm" }, this.#reason === "skip" ? L.skipConfirm : L.reopenConfirm),
        h("button", { type: "button", class: "nx-cl__btn", "data-a": "cancel" }, L.cancel),
        err,
      );
      acts.classList.add("nx-cl__acts--reason");
      queueMicrotask(() => input.focus());
    }
    if (acts.childNodes.length) p.append(acts);
    row.g.append(p);
  }

  #missText(m: { index: number; type: ChecklistEvidenceSpec["type"]; need?: number; label?: string }): string {
    const L = this.#labels;
    if (m.index < 0) return L.explain;
    const many = m.type === "photo" ? L.needPhotos : m.type === "file" ? L.needFiles : "";
    const base = m.label ?? L[m.type];
    return many && m.need && m.need > 1 ? `${base} (${plural(many, m.need)})` : base;
  }

  /** Una evidencia entregada, para ver. */
  #view(spec: ChecklistEvidenceSpec, ev: ChecklistEvidence | undefined): HTMLElement | null {
    if (!ev) return null;
    const L = this.#labels;
    let val: Node | string | null = null;
    if (ev.files?.length)
      val = h(
        "ul",
        { class: "nx-cl__files" },
        ...ev.files.map((f) => {
          const blob = this.#blobs.get(f);
          const src = spec.type === "photo" && (safeImageSrc(f.url) || (blob && this.#urls[this.#urls.push(URL.createObjectURL(blob)) - 1]));
          const href = safeHref(f.url);
          return h("li", null, src ? h("img", { src, alt: f.name }) : href ? h("a", { href, target: "_blank", rel: "noopener" }, f.name) : h("span", { class: "nx-cl__fname" }, f.name));
        }),
      );
    else if (ev.signature) val = h("img", { class: "nx-cl__sig", alt: spec.label ?? L.signature, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ev.signature.svg)}` });
    else if (typeof ev.value === "number") val = `${checklistNumber(ev.value, this.locale)}${spec.unit ? ` ${spec.unit}` : ""}${ev.outOfRange ? ` · ${L.outOfRange}` : ""}`;
    else if (typeof ev.value === "string" && ev.value) val = spec.type === "choice" ? (checklistOptions(spec).find((o) => o.value === ev.value)?.label ?? ev.value) : ev.value;
    return val ? h("div", { class: "nx-cl__ev", "data-type": spec.type, "data-out": ev.outOfRange ? "" : null }, h("span", { class: "nx-cl__lab" }, spec.label ?? L[spec.type]), typeof val === "string" ? h("p", { class: "nx-cl__val" }, val) : val) : null;
  }

  #onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    const a = t.closest<HTMLElement>("[data-a]")?.dataset.a;
    const openBtn = t.closest<HTMLElement>(".nx-cl__open, .nx-cl__box");
    if (openBtn && !a) {
      const step = this.#stepById(openBtn.dataset.step ?? "");
      if (!step) return;
      // La casilla de un paso sin evidencia obligatoria lo marca de una vez.
      if (openBtn.classList.contains("nx-cl__box") && this.#editable(step) && !checklistMissing(step, this.#draft(step).ev, this.#draft(step).note).missing.length) return this.#done(step);
      return this.#toggle(step.id);
    }
    const step = this.#open ? this.#stepById(this.#open) : undefined;
    if (a === "reload") void this.#load();
    else if (a === "close") this.#close();
    if (!step) return;
    if (a === "done") this.#done(step);
    else if (a === "skip" || a === "reopen") {
      this.#reason = a;
      this.#paintPanel();
    } else if (a === "cancel") {
      this.#reason = null;
      this.#paintPanel();
    } else if (a === "confirm") this.#confirmReason(step);
  };

  #confirmReason(step: ChecklistStep): void {
    const input = this.#panel?.querySelector<HTMLInputElement>(".nx-cl__acts--reason input");
    const reason = input?.value.trim() ?? "";
    if (!reason) {
      this.#panel!.querySelector(".nx-cl__acts--reason [role=alert]")!.textContent = this.#labels.reasonRequired;
      input?.setAttribute("aria-invalid", "true");
      input?.focus();
      return;
    }
    this.#withReason(step, reason);
  }

  #onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (e.key === "Escape" && this.#open && this.#panel?.contains(t)) {
      e.preventDefault();
      e.stopPropagation();
      const id = this.#open;
      if (this.#reason) {
        this.#reason = null;
        this.#paintPanel();
      } else this.#toggle(null);
      this.#rows.get(id)?.btn.focus();
      return;
    }
    if (e.key === "Enter" && t.closest(".nx-cl__acts--reason") && t.localName === "input") {
      e.preventDefault();
      const step = this.#stepById(this.#open ?? "");
      if (step) this.#confirmReason(step);
      return;
    }
    if (!t.classList.contains("nx-cl__open")) return;
    const btns = [...this.#rows.values()].map((r) => r.btn);
    const i = btns.indexOf(t as HTMLButtonElement);
    const j = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : -2;
    if (j < -1) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, j))]?.focus();
  };
}
