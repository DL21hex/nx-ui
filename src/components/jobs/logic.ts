/**
 * `<nx-jobs>`: la lógica pura. Limpieza de lo que manda el servidor, fusión de eventos (fuera de
 * orden y repetidos) en el estado, orden de la lista y recientes, estimación del tiempo restante y
 * esperas (reconexión y sondeo). Nada toca el DOM.
 */
import type { Job, JobEvent, JobResult, JobStatus } from "./types";

const RANK: Record<JobStatus, number> = { queued: 0, running: 1, done: 2, failed: 2, canceled: 2 };

/** En la cola o corriendo. */
export const isJobActive = (j: Pick<Job, "status">): boolean => RANK[j.status] < 2;

const str = (v: unknown, max = 300): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
const iso = (v: unknown): string | undefined => {
  const t = typeof v === "number" ? v : typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : undefined;
};

function cleanResult(v: unknown): JobResult | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const d = o.download as Record<string, unknown> | undefined;
  const r: JobResult = {};
  if (str(o.href, 2000)) r.href = str(o.href, 2000);
  if (d && typeof d === "object" && str(d.url, 2000)) r.download = { url: str(d.url, 2000)!, name: str(d.name) };
  if (num(o.errors) !== undefined) r.errors = Math.floor(o.errors as number);
  if (str(o.errorsHref, 2000)) r.errorsHref = str(o.errorsHref, 2000);
  if (str(o.message, 1000)) r.message = str(o.message, 1000);
  return r;
}

/**
 * Un trabajo (o, con `partial`, un evento) de afuera, o `null` si no sirve: sin `id`, o con un
 * estado desconocido. Lo que no cumple la forma se descarta campo por campo.
 */
export function cleanJob(v: unknown, partial: true): JobEvent | null;
export function cleanJob(v: unknown, partial?: false): Job | null;
export function cleanJob(v: unknown, partial = false): JobEvent | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = str(o.id, 200);
  const status = o.status as JobStatus;
  const known = Object.hasOwn(RANK, status as string);
  if (!id || (o.status !== undefined && !known) || (!partial && !known)) return null;
  const j: JobEvent = { id };
  if (known) j.status = status;
  const title = str(o.title);
  if (title || !partial) j.title = title ?? "";
  const by = str(o.by) ?? str((o.by as { name?: unknown } | null)?.name);
  const set = { type: str(o.type, 100), stage: str(o.stage, 200), done: num(o.done), total: num(o.total) || undefined, startedAt: iso(o.startedAt), finishedAt: iso(o.finishedAt), by, result: cleanResult(o.result), seq: num(o.seq) };
  for (const [k, val] of Object.entries(set)) if (val !== undefined) (j as Record<string, unknown>)[k] = val;
  return j;
}

/** Una lista del servidor (`[…]` o `{jobs: […]}`), limpia y sin repetidos (queda el último). */
export function cleanJobs(v: unknown): Job[] {
  const list = Array.isArray(v) ? v : Array.isArray((v as { jobs?: unknown } | null)?.jobs) ? (v as { jobs: unknown[] }).jobs : [];
  const out = new Map<string, Job>();
  for (const x of list.slice(0, 500)) {
    const j = cleanJob(x);
    if (j) out.set(j.id, j);
  }
  return [...out.values()];
}

/**
 * Aplica un evento (o una foto del servidor) a un trabajo. Devuelve el trabajo nuevo, o `null` si
 * el evento no cambia nada o llegó tarde:
 * - Con `seq` en los dos, manda el número: uno igual o menor ya se aplicó.
 * - Sin él, un trabajo terminado no vuelve atrás (un «running» atrasado no revive un «done») y el
 *   avance de un mismo estado no retrocede.
 * `force` lo toma tal cual (la respuesta de un reintento, que vuelve a la cola a propósito).
 */
export function mergeJob(job: Job | undefined, ev: JobEvent, force = false, now = Date.now()): Job | null {
  if (!job) {
    const n = { title: "", status: "queued", ...ev } as Job;
    if (!isJobActive(n) && !n.finishedAt) n.finishedAt = new Date(now).toISOString();
    return n;
  }
  const status = ev.status ?? job.status;
  const seqs = ev.seq !== undefined && job.seq !== undefined;
  if (!force) {
    if (seqs && ev.seq! <= job.seq!) return null;
    if (!seqs && (RANK[status] < RANK[job.status] || (!isJobActive(job) && ev.status !== undefined))) return null;
  }
  const next: Job = { ...job, ...ev, status };
  // Un evento sin número no hace retroceder la cuenta del mismo estado (llegó tarde).
  if (!force && !seqs && status === job.status && job.done !== undefined && ev.done !== undefined && ev.done < job.done) next.done = job.done;
  if (isJobActive(job) && !isJobActive(next)) next.finishedAt ??= new Date(now).toISOString();
  if (isJobActive(next)) delete next.finishedAt;
  if (force) return next;
  for (const k of new Set([...Object.keys(job), ...Object.keys(next)]) as Set<keyof Job>) {
    const a = next[k];
    const b = job[k];
    if (a !== b && (typeof a !== "object" || JSON.stringify(a) !== JSON.stringify(b))) return next;
  }
  return null;
}

const at = (s?: string): number => (s ? Date.parse(s) : 0) || 0;

/**
 * Las dos partes de la lista: en curso (corriendo primero, después en cola; lo más nuevo arriba) y
 * los recientes (terminados en las últimas `maxAge`, el último arriba, hasta `recent`).
 */
export function splitJobs(jobs: Iterable<Job>, recent = 10, now = Date.now(), maxAge = 86_400_000): { active: Job[]; recent: Job[] } {
  const active: Job[] = [];
  const done: Job[] = [];
  for (const j of jobs) {
    if (isJobActive(j)) active.push(j);
    else if (!j.finishedAt || now - at(j.finishedAt) <= maxAge) done.push(j);
  }
  active.sort((a, b) => RANK[b.status] - RANK[a.status] || at(b.startedAt) - at(a.startedAt));
  done.sort((a, b) => at(b.finishedAt) - at(a.finishedAt));
  return { active, recent: done.slice(0, Math.max(0, recent)) };
}

/** El avance de un trabajo (0–1), o `null` si el servidor no da total. */
export function jobFraction(j: Pick<Job, "done" | "total">): number | null {
  return j.total ? Math.min(1, Math.max(0, (j.done ?? 0) / j.total)) : null;
}

/** El avance agregado de los que tienen total (0–1), o `null` si ninguno lo tiene. */
export function jobsFraction(jobs: Job[]): number | null {
  let d = 0;
  let t = 0;
  for (const j of jobs) {
    if (!j.total) continue;
    d += Math.min(j.done ?? 0, j.total);
    t += j.total;
  }
  return t ? d / t : null;
}

/** La velocidad de un trabajo, para estimar cuánto falta. */
export interface JobPace {
  /** Cuándo se tomó la última muestra (ms) y cuánto iba. */
  at: number;
  done: number;
  /** Unidades por ms (media móvil), o `null` sin datos. */
  rate: number | null;
  /** Lo que faltaba en `at` (ms), o `null`. */
  eta: number | null;
}

/**
 * Una muestra más de avance. La velocidad es una media móvil exponencial en el tiempo (`tau`: cuánto
 * «recuerda»), así que un tramo lento o una ráfaga no la mueven de golpe; y lo que falta tampoco
 * salta: se acerca a la estimación nueva desde lo que ya venía descontando el reloj. Muestras a
 * menos de 250 ms se juntan con la siguiente. Si la cuenta vuelve atrás (un reintento), empieza de nuevo.
 */
export function jobPace(prev: JobPace | undefined, done: number, total: number | undefined, now: number, tau = 20_000): JobPace {
  if (!prev || done < prev.done || now < prev.at) return { at: now, done, rate: null, eta: null };
  const dt = now - prev.at;
  if (dt < 250) return prev;
  const k = 1 - Math.exp(-dt / tau);
  const inst = (done - prev.done) / dt;
  const rate = prev.rate === null ? inst : prev.rate + k * (inst - prev.rate);
  const raw = total && rate > 0 ? Math.max(0, total - done) / rate : null;
  const was = prev.eta === null ? null : Math.max(0, prev.eta - dt);
  const eta = raw === null ? null : was === null || !prev.rate ? raw : was + k * (raw - was);
  return { at: now, done, rate, eta };
}

/** Lo que falta ahora (ms) según la última muestra, o `null`. */
export const jobLeft = (p: JobPace | undefined, now = Date.now()): number | null => (p?.eta == null ? null : Math.max(0, p.eta - (now - p.at)));

const units = new Map<string, Intl.NumberFormat>();

/**
 * Una duración aproximada para «faltan ~{t}»: minutos redondeados («3 min», «3 minutos»), y horas
 * con un decimal desde la hora y media («1,5 h»). `null` si es menos de un minuto.
 */
export function jobsDuration(ms: number, locale = "es-CO", long = false): string | null {
  if (!(ms >= 45_000)) return null;
  const min = Math.round(ms / 60_000);
  const h = min >= 90;
  const key = `${locale}|${h}|${long}`;
  let f = units.get(key);
  if (!f) {
    const o: Intl.NumberFormatOptions = { style: "unit", unit: h ? "hour" : "minute", unitDisplay: long ? "long" : "short", maximumFractionDigits: 1 };
    try {
      f = new Intl.NumberFormat(locale, o);
    } catch {
      f = new Intl.NumberFormat("es-CO", o);
    }
    units.set(key, f);
  }
  return f.format(h ? Math.round(ms / 360_000) / 10 : Math.max(1, min)).replace(/[  ]/g, " ");
}

// ---------------------------------------------------------------- esperas

/** Espera antes de reconectar el intento `n` (1, 2, 3…): 1 s, 2 s, 4 s… hasta `max`, con ±20 % al azar. */
export function jobsBackoff(n: number, base = 1000, max = 30_000, random: () => number = Math.random): number {
  const d = Math.min(max, base * 2 ** Math.min(30, Math.max(0, n - 1)));
  return Math.round(Math.min(max, d * (0.8 + random() * 0.4)));
}

/** `Retry-After` en ms (segundos o fecha HTTP), acotado a una hora. `null` si no viene o no se entiende. */
export function jobsRetryAfter(v: string | null | undefined, now = Date.now()): number | null {
  const t = v?.trim();
  if (!t) return null;
  const ms = /^\d+(\.\d+)?$/.test(t) ? Number(t) * 1000 : Date.parse(t) - now;
  return Number.isNaN(ms) ? null : Math.min(3_600_000, Math.max(0, ms));
}

/**
 * La espera del sondeo: `base` mientras algo cambie, y ×1,5 por cada consulta sin cambios hasta 30 s
 * (o `base`, si es mayor). Con la pestaña en segundo plano, 30 s.
 */
export function jobsPollDelay(base: number, idle: number, hidden: boolean): number {
  const cap = Math.max(base, 30_000);
  return hidden ? cap : Math.min(cap, Math.round(base * 1.5 ** Math.min(20, Math.max(0, idle))));
}

// ---------------------------------------------------------------- URL y memoria

/** `/api/trabajos?x=1` + `42` + `/cancel` → `/api/trabajos/42/cancel?x=1`. */
export function jobUrl(base: string, id?: string, tail = ""): string {
  const [path, query] = base.split(/\?(.*)/s);
  return `${path.replace(/\/+$/, "")}${id === undefined ? "" : `/${encodeURIComponent(id)}`}${tail}${query ? `?${query}` : ""}`;
}

/** Suma `key=value` a la consulta de una URL. */
export const withQuery = (url: string, key: string, value: string): string => `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

/** Lo guardado en `localStorage`: los ids en curso (`a`) y los quitados de la lista (`d`). */
export function readJobsMemo(raw: string | null | undefined): { a: string[]; d: string[] } {
  let o: unknown;
  try {
    o = JSON.parse(raw ?? "null");
  } catch {
    /* dañado: como vacío */
  }
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length <= 200).slice(-100) : []);
  return { a: ids((o as { a?: unknown } | null)?.a), d: ids((o as { d?: unknown } | null)?.d) };
}
