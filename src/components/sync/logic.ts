/**
 * La cola sin conexión (`nxSync`) y la lógica pura de `<nx-sync>`: esperas entre intentos, qué
 * hacer con cada respuesta, comparar dos versiones campo por campo y armar la resuelta. Sin DOM:
 * corre en node con un `fetch` y un reloj falsos.
 *
 * Cómo trabaja la cola:
 * - Cada operación se guarda en el dispositivo (IndexedDB; en memoria si no hay) antes de
 *   intentar nada: cerrar la pestaña o quedarse sin batería no la pierde.
 * - Se envían de a una, en el orden en que llegaron. Si la red o el servidor fallan (sin respuesta,
 *   5xx, 429, 408), la cola entera espera 1 s, 2 s, 4 s… (tope 60 s, ±20 % al azar para que mil
 *   teléfonos que recuperan la señal a la vez no lleguen juntos), o lo que diga `Retry-After`.
 * - Cada envío lleva `Idempotency-Key`: si la respuesta se perdió pero el servidor sí lo guardó,
 *   el reintento no lo duplica.
 * - Un 409 con `{server}` deja la operación «en conflicto»; otro 4xx, «fallida». Ninguna de las
 *   dos bloquea la cola: solo a las siguientes de su mismo `group`.
 */
import type { SyncConflict, SyncEvent, SyncField, SyncInput, SyncJson, SyncListener, SyncMethod, SyncOp, SyncOptions, SyncState, SyncStore } from "./types";

const METHODS: SyncMethod[] = ["POST", "PUT", "PATCH", "DELETE"];
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const isObj = (v: unknown): v is Record<string, SyncJson> => !!v && typeof v === "object" && !Array.isArray(v);
/** Una copia que es JSON de verdad (sin funciones, ciclos ni `undefined`), o `undefined`. */
const json = <T>(v: T): T | undefined => {
  try {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  } catch {
    return undefined;
  }
};

// ---------------------------------------------------------------- esperas y respuestas

/** Espera antes del intento `attempt` (1, 2, 3…): 1 s, 2 s, 4 s… hasta `max`, con ±20 % al azar. */
export function backoff(attempt: number, base = 1000, max = 60_000, random: () => number = Math.random): number {
  const d = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  return Math.round(Math.min(max, d * (0.8 + random() * 0.4)));
}

/** `Retry-After` en ms: segundos («3») o una fecha HTTP. `null` si no viene o no se entiende. */
export function retryAfter(v: string | null | undefined, now = Date.now()): number | null {
  const t = v?.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t) * 1000;
  const d = Date.parse(t);
  return Number.isNaN(d) ? null : Math.max(0, d - now);
}

export type SyncVerdict = "ok" | "retry" | "conflict" | "failed";

/** Qué hacer con una respuesta: 2xx listo; 408, 425, 429 y 5xx se reintentan; 409 y 412 son un
 *  conflicto; el resto de 4xx no se arregla reintentando. */
export function classify(status: number): SyncVerdict {
  if (status >= 200 && status < 300) return "ok";
  if (status === 409 || status === 412) return "conflict";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "retry";
  return "failed";
}

/** El mensaje que trae el cuerpo de un error (`message`, `error`, `detail` o `title`), si trae uno. */
export function errorText(data: unknown): string | undefined {
  if (typeof data === "string") return str(data) && data.length < 200 ? data.trim() : undefined;
  if (!isObj(data)) return undefined;
  for (const k of ["message", "error", "detail", "title"]) if (str(data[k])) return data[k] as string;
  return undefined;
}

// ---------------------------------------------------------------- datos de entrada

/** Una operación nueva a partir de lo que pidió la app, o `null` si no sirve (sin URL segura,
 *  método que no escribe, cuerpo que no es JSON). */
export function cleanInput(v: unknown, id: string, seq: number, now: number): SyncOp | null {
  if (!isObj(v)) return null;
  const method = String(v.method ?? "").toUpperCase() as SyncMethod;
  const url = str(v.url)?.trim();
  // Solo rutas relativas o http(s): la cola no llama a `javascript:` ni a `data:`.
  if (!METHODS.includes(method) || !url || (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url))) return null;
  const body = json(v.body);
  if (v.body !== undefined && body === undefined) return null;
  const opId = str(v.id) ?? id;
  return {
    id: opId,
    key: opId,
    method,
    url,
    ...(body !== undefined ? { body } : null),
    label: str(v.label) ?? `${method} ${url}`,
    ...(str(v.group) ? { group: v.group as string } : null),
    status: "pending",
    seq,
    createdAt: now,
    attempts: 0,
  };
}

/** Los campos en disputa que manda el servidor: `["cantidad"]` o `[{key, label}]`. */
export function cleanFields(v: unknown): SyncField[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((f): SyncField | null => (str(f) ? { key: f as string, label: "" } : isObj(f) && str(f.key) ? { key: f.key as string, label: str(f.label) ?? "" } : null))
    .filter((f): f is SyncField => !!f);
}

/** Lo que llega con un 409: `{server, local?, fields?, etag?}`. `null` si no trae la versión del servidor. */
export function cleanConflict(data: unknown, local: SyncJson | undefined, etag?: string | null): SyncConflict | null {
  if (!isObj(data) || !("server" in data)) return null;
  return { server: json(data.server) ?? null, local: json(data.local) ?? local ?? null, fields: cleanFields(data.fields), ...(str(data.etag) || etag ? { etag: (str(data.etag) ?? etag)! } : null) };
}

// ---------------------------------------------------------------- comparar y resolver

/** Las hojas de un valor JSON por ruta con puntos: `{a: {b: [1]}}` → `a.b.0 = 1`. */
export function flatten(v: SyncJson | undefined, pre = "", out = new Map<string, SyncJson>()): Map<string, SyncJson> {
  if (v && typeof v === "object" && Object.keys(v).length) {
    for (const [k, x] of Object.entries(v)) flatten(x, pre ? `${pre}.${k}` : k, out);
  } else if (v !== undefined) out.set(pre, v);
  return out;
}

/** Una fila del comparador: el valor mío y el del servidor (`undefined`: no existe de ese lado). */
export interface SyncDiff {
  key: string;
  mine?: SyncJson;
  theirs?: SyncJson;
  /** El servidor la señaló como en disputa. */
  hot: boolean;
}

/** Los campos que difieren entre mi versión y la del servidor (los señalados primero) y cuántos
 *  son iguales. */
export function diffFields(local: SyncJson | undefined, server: SyncJson | undefined, hot: string[] = []): { rows: SyncDiff[]; same: number } {
  const a = flatten(local);
  const b = flatten(server);
  const rows: SyncDiff[] = [];
  let same = 0;
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const mine = a.get(key);
    const theirs = b.get(key);
    if (JSON.stringify(mine) === JSON.stringify(theirs)) same++;
    else rows.push({ key, mine, theirs, hot: hot.includes(key) });
  }
  return { rows: rows.sort((p, q) => Number(q.hot) - Number(p.hot)), same };
}

/** Pone `value` en la ruta `key` (crea lo que falte); `undefined` la borra. */
function setPath(root: SyncJson, key: string, value: SyncJson | undefined): SyncJson {
  if (!key) return value ?? null;
  const parts = key.split(".");
  const box = (p: string): SyncJson => (/^\d+$/.test(p) ? [] : {});
  if (!root || typeof root !== "object") root = box(parts[0]);
  let o = root as Record<string, SyncJson>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!o[parts[i]] || typeof o[parts[i]] !== "object") o[parts[i]] = box(parts[i + 1]);
    o = o[parts[i]] as Record<string, SyncJson>;
  }
  const last = parts[parts.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
  return root;
}

/** Quita de las listas los huecos y los objetos que quedaron vacíos al elegir «lo del servidor». */
function prune(v: SyncJson): SyncJson {
  if (Array.isArray(v)) return v.filter((x) => x !== undefined && !(isObj(x) && !Object.keys(x).length)).map(prune);
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prune(x)]));
  return v;
}

/** La versión resuelta: la mía, con el valor del servidor en los campos de `theirs`. */
export function resolveBody(local: SyncJson | undefined, server: SyncJson | undefined, theirs: Iterable<string>): SyncJson {
  const b = flatten(server);
  let out = json(local) ?? null;
  for (const key of theirs) out = setPath(out, key, b.get(key));
  return prune(out);
}

const match = (pattern: string, key: string) => {
  const p = pattern.split(".");
  const k = key.split(".");
  return p.length === k.length && p.every((x, i) => x === "*" || x === k[i]);
};

/**
 * La etiqueta de un campo. `fields` acepta comodines y nombra a sus hermanos entre llaves:
 * `{key: "productos.*.cantidad", label: "Cantidad · {nombre}"}` → «Cantidad · Aceite Premier 1 L».
 * Sin etiqueta, la ruta legible: «productos › #2 › cantidad».
 */
export function fieldLabel(key: string, fields: SyncField[], body?: SyncJson): string {
  const f = fields.find((x) => x.label && match(x.key, key));
  if (!f) return key.split(".").map((p) => (/^\d+$/.test(p) ? `#${Number(p) + 1}` : p)).join(" › ");
  const flat = flatten(body);
  const parent = key.split(".").slice(0, -1).join(".");
  return f.label.replace(/\{(\w+)\}/g, (_, n: string) => {
    const v = flat.get(parent ? `${parent}.${n}` : n);
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Lo común al principio y al final, y lo distinto en medio: «1[2] cajas» / «1[8] cajas». */
export function midDiff(a: string, b: string): [string, string, string, string] {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return [a.slice(0, i), a.slice(i, a.length - j), b.slice(i, b.length - j), a.slice(a.length - j)];
}

// ---------------------------------------------------------------- textos

/** «12 s», «1:05»: lo que falta para el próximo intento. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** «ahora», «hace 3 min», «hace 2 h», «hace 1 día» (con `Intl`). */
export function ago(ms: number, locale = "es-CO"): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const m = Math.round(ms / 60_000);
  if (m < 1) return rtf.format(0, "second");
  if (m < 60) return rtf.format(-m, "minute");
  const h = Math.round(m / 60);
  return h < 24 ? rtf.format(-h, "hour") : rtf.format(-Math.round(h / 24), "day");
}

/** `one` o `many` según `n`, con `{n}` reemplazado. */
export const plural = (n: number, one: string, many: string, num = String(n)) => (n === 1 ? one : many).replace("{n}", num);

// ---------------------------------------------------------------- almacenamiento

/** La cola en memoria (pruebas, SSR o un navegador sin IndexedDB). `seed`: lo «guardado» antes. */
export function memoryStore(seed: SyncOp[] = []): SyncStore {
  const m = new Map(seed.map((op) => [op.id, json(op)!]));
  return {
    load: async () => [...m.values()].map((op) => json(op)!),
    put: async (op) => m.set(op.id, json(op)!),
    del: async (id) => m.delete(id),
  };
}

/** La cola en IndexedDB (base `name`, almacén `ops`). */
export function idbStore(name = "nx-sync"): SyncStore {
  let db: Promise<IDBDatabase> | undefined;
  const req = <T>(r: IDBRequest<T>) => new Promise<T>((ok, ko) => ((r.onsuccess = () => ok(r.result)), (r.onerror = () => ko(r.error))));
  const open = () =>
    (db ??= new Promise((ok, ko) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("ops", { keyPath: "id" });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ko(r.error);
    }));
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => req(fn((await open()).transaction("ops", mode).objectStore("ops")));
  return {
    load: () => tx("readonly", (s) => s.getAll() as IDBRequest<SyncOp[]>),
    put: (op) => tx("readwrite", (s) => s.put(op)),
    del: (id) => tx("readwrite", (s) => s.delete(id)),
  };
}

// ---------------------------------------------------------------- la cola

export interface SyncQueue {
  /** Guarda la operación y la envía cuando se pueda. Devuelve la operación ya guardada. */
  enqueue(input: SyncInput): Promise<SyncOp>;
  /** Lo que falta por confirmar (también conflictos y fallidas), en orden. */
  pending(): Promise<SyncOp[]>;
  /** Reintenta ya. Con `body`, con ese cuerpo (corregido). */
  retry(id: string, body?: SyncJson): Promise<boolean>;
  /** Reenvía un conflicto con la versión elegida (y `If-Match` si el servidor mandó `etag`). */
  resolve(id: string, body: SyncJson): Promise<boolean>;
  /** La saca de la cola sin enviarla. */
  discard(id: string): Promise<boolean>;
  /** Intenta todo ya, sin esperar los tiempos. Termina cuando la cola se vacía o se detiene. */
  flush(): Promise<void>;
  /** Comprueba la conexión ya (con `ping`) y envía lo pendiente si volvió. Útil al volver a la
   *  pestaña o cuando la app sospecha que se cayó la red. */
  check(): Promise<boolean>;
  /** Vacía la cola (al cerrar sesión). */
  clear(): Promise<void>;
  /** Avisa cada cambio (y una vez al suscribirse). Devuelve cómo dejar de escuchar. */
  subscribe(fn: SyncListener): () => void;
  configure(options: SyncOptions): void;
  readonly state: SyncState;
}

let uid = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `op-${Date.now().toString(36)}-${(++uid).toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Una cola. La librería trae una lista para usar (`nxSync`, base «nx-sync»); `createSync()` sirve
 * para otra base o para probar con `fetch`, `store`, `now`, `random`, `network` y `events` falsos.
 * No toca el navegador hasta el primer uso: importarla en el servidor no hace nada.
 */
export function createSync(init: SyncOptions & { events?: Pick<EventTarget, "addEventListener"> } = {}): SyncQueue {
  const o = { base: 1000, max: 60_000, timeout: 30_000, ...init };
  const subs = new Set<SyncListener>();
  let ops: SyncOp[] = [];
  let store: SyncStore;
  let boot: Promise<void> | undefined;
  let loaded = false;
  /** El servidor contestó la última vez (la red puede estar «arriba» y no llegar a ningún lado). */
  let reachable = true;
  let wasOnline = true;
  let loop: Promise<void> | undefined;
  let busy = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** Cuántas se enviaron en esta tanda (para «2 de 5»); `null` fuera de una tanda. */
  let done: number | null = null;
  let seq = 0;
  let probes = 0;
  /** Comprobar la conexión con `ping` en la próxima vuelta, aunque se crea que hay. */
  let probe = false;

  const now = () => (o.now ?? Date.now)();
  const net = () => (o.network ? o.network() : typeof navigator === "undefined" || navigator.onLine !== false);
  const online = () => net() && reachable;
  const doFetch = (...a: Parameters<typeof fetch>) => (o.fetch ?? fetch)(...a);
  const stuck = (op: SyncOp) => op.status === "conflict" || op.status === "failed";
  /** Las que se pueden enviar, en orden: sin las atascadas ni las de su grupo que vienen detrás. */
  const live = () => {
    const blocked = new Set<string>();
    return ops.filter((op) => {
      if (stuck(op)) return op.group && blocked.add(op.group), false;
      return !(op.group && blocked.has(op.group));
    });
  };

  const state = (): SyncState => {
    const count = (s: string) => ops.filter((op) => op.status === s).length;
    const left = live().length;
    return {
      online: online(),
      ops: ops.map((op) => ({ ...op })),
      pending: ops.length - count("conflict") - count("failed"),
      conflicts: count("conflict"),
      failed: count("failed"),
      progress: done !== null && busy && left ? { done, total: done + left } : null,
      ready: loaded,
    };
  };
  const notify = (ev?: SyncEvent) => {
    const on = online();
    if (on !== wasOnline) {
      wasOnline = on;
      if (!on) done = null;
      notify({ type: on ? "online" : "offline" });
    }
    const s = state();
    for (const fn of subs) {
      try {
        fn(s, ev);
      } catch (e) {
        console.error(e);
      }
    }
  };
  const save = (op: SyncOp) => store.put(op).catch(() => {});
  const find = (id: string) => ops.find((op) => op.id === id);
  const wait = (op: SyncOp, ms: number) => {
    op.status = "waiting";
    op.nextAt = now() + ms;
    save(op);
  };

  const start = () =>
    (boot ??= (async () => {
      store = o.store ?? (typeof indexedDB === "undefined" ? memoryStore() : idbStore());
      try {
        // Lo que iba en camino cuando se cerró la página vuelve a la fila (la llave evita duplicarlo).
        ops = (await store.load())
          .filter((op) => op && typeof op.id === "string" && typeof op.url === "string" && METHODS.includes(op.method))
          .map((op) => (op.status === "sending" ? { ...op, status: "pending" as const } : op))
          .sort((a, b) => a.seq - b.seq);
      } catch {
        store = memoryStore();
      }
      seq = Math.max(0, ...ops.map((op) => op.seq));
      loaded = true;
      const ev = o.events ?? (typeof addEventListener === "function" ? globalThis : undefined);
      ev?.addEventListener("online", () => {
        // Volvió la red: sin `ping` se confía; con `ping`, se comprueba antes de enviar.
        for (const op of ops) if (op.status === "waiting") op.nextAt = undefined;
        void check();
      });
      ev?.addEventListener("offline", () => notify());
      notify();
      void pump();
    })());

  /** ¿Contesta el servidor? (`ping`: cualquier respuesta sirve; solo la falta de una cuenta). */
  const ping = async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), o.timeout);
    try {
      return !!(await doFetch(o.ping!, { cache: "no-store", signal: ac.signal }));
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  };

  async function send(op: SyncOp): Promise<void> {
    op.status = "sending";
    op.attempts++;
    op.nextAt = undefined;
    save(op);
    notify();
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), o.timeout);
    let res: Response | undefined;
    try {
      const extra = typeof o.headers === "function" ? o.headers() : o.headers;
      res = await doFetch(op.url, {
        method: op.method,
        headers: { Accept: "application/json", ...extra, "Idempotency-Key": op.key, ...(op.body !== undefined ? { "Content-Type": "application/json" } : null), ...(op.etag ? { "If-Match": op.etag } : null) },
        body: op.body === undefined ? undefined : JSON.stringify(op.body),
        signal: ac.signal,
      });
    } catch {
      /* sin respuesta: red caída o se agotó el tiempo */
    } finally {
      clearTimeout(t);
    }
    if (!ops.includes(op)) return;
    if (!res) {
      reachable = false;
      op.error = op.httpStatus = undefined;
      return wait(op, backoff(op.attempts, o.base, o.max, o.random)), notify();
    }
    reachable = true;
    let data: unknown = null;
    try {
      const text = await res.text();
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    op.httpStatus = res.status;
    op.error = errorText(data);
    const verdict = classify(res.status);
    if (verdict === "ok") {
      ops = ops.filter((x) => x !== op);
      store.del(op.id).catch(() => {});
      done = (done ?? 0) + 1;
      return notify({ type: "done", op: { ...op }, data, status: res.status });
    }
    if (verdict === "retry") return wait(op, retryAfter(res.headers.get("Retry-After"), now()) ?? backoff(op.attempts, o.base, o.max, o.random)), notify();
    const conflict = verdict === "conflict" ? cleanConflict(data, op.body, res.headers.get("ETag")) : null;
    op.status = conflict ? "conflict" : "failed";
    if (conflict) op.conflict = conflict;
    save(op);
    notify({ type: op.status as "conflict" | "failed", op: { ...op } });
  }

  async function run(): Promise<void> {
    clearTimeout(timer);
    busy = true;
    while (net()) {
      const op = live().find((x) => x.status !== "sending");
      const ms = op ? (op.nextAt ?? 0) - now() : 0;
      if (o.ping && (probe || (!reachable && ms <= 0))) {
        // Sin conexión (o pedida la comprobación): primero el `ping`, sin gastar intentos de la
        // operación. Mientras no conteste, se sigue probando cada vez más espaciado.
        probe = false;
        const was = reachable;
        reachable = await ping();
        if (!reachable) {
          const d = backoff(++probes, o.base, o.max, o.random);
          if (op) wait(op, d);
          notify();
          timer = setTimeout(() => void pump(), d);
          break;
        }
        probes = 0;
        // Volvió: lo que esperaba por la red sale ya.
        if (!was) for (const x of ops) if (x.status === "waiting") x.nextAt = undefined;
        notify();
        continue;
      }
      if (ms > 0) {
        timer = setTimeout(() => void pump(), ms);
        break;
      }
      if (!op) {
        // Sin `ping` ni nada que enviar no hay cómo saberlo: se confía en la red.
        reachable ||= !o.ping;
        break;
      }
      done ??= 0;
      await send(op);
    }
  }
  /** Una sola vuelta a la vez; quien llega mientras corre espera a la misma. */
  const pump = (): Promise<void> =>
    (loop ??= run().finally(() => {
      loop = undefined;
      busy = false;
      // Algo llegó justo cuando la vuelta terminaba: otra vuelta.
      // (o pidieron comprobar la conexión mientras corría).
      const next = live().find((x) => x.status !== "sending");
      if (net() && ((probe && o.ping) || (next && !((next.nextAt ?? 0) > now())))) return void pump();
      // Se acabó la tanda: nada más que enviar.
      if (done !== null && !live().length) {
        const n = done;
        done = null;
        notify(n ? { type: "idle" } : undefined);
      } else notify();
    }));

  /** Comprueba la conexión ya (con `ping`, si hay) y envía si volvió. */
  async function check(): Promise<boolean> {
    await start();
    // Si se creía sin conexión, lo que esperaba por la red ya no tiene por qué esperar.
    if (!online()) for (const op of ops) if (op.status === "waiting") op.nextAt = undefined;
    probe = !!o.ping;
    probes = 0;
    reachable ||= !o.ping;
    await pump();
    return online();
  }

  /** Vuelve a la fila (con otro cuerpo, otra llave: ya no es la misma petición). */
  const requeue = async (id: string, body: SyncJson | undefined, from?: SyncOp["status"]): Promise<boolean> => {
    await start();
    const op = find(id);
    if (!op || op.status === "sending" || (from && op.status !== from)) return false;
    const fresh = body !== undefined || stuck(op);
    if (body !== undefined) op.body = json(body) ?? null;
    if (op.conflict?.etag) op.etag = op.conflict.etag;
    if (fresh) op.key = `${op.id}.${op.attempts}`;
    op.status = "pending";
    op.nextAt = op.error = op.conflict = undefined;
    reachable ||= !o.ping;
    save(op);
    notify({ type: "retry", op: { ...op } });
    void pump();
    return true;
  };

  return {
    async enqueue(input) {
      await start();
      const op = cleanInput(input, newId(), seq + 1, now());
      if (!op) throw new TypeError("[nxSync] operación inválida: hace falta method (POST, PUT, PATCH, DELETE), url y un body JSON");
      const same = find(op.id);
      if (same) {
        // El mismo id otra vez: si aún no sale, se actualiza (la última versión es la que vale).
        if (same.status !== "sending") {
          if (stuck(same)) Object.assign(same, { status: "pending", key: `${same.id}.${same.attempts}`, conflict: undefined, error: undefined });
          Object.assign(same, { body: op.body, label: op.label, method: op.method, url: op.url });
        }
        save(same);
        notify();
        void pump();
        return { ...same };
      }
      seq++;
      ops.push(op);
      await save(op);
      notify({ type: "enqueue", op: { ...op } });
      void pump();
      return { ...op };
    },
    async pending() {
      await start();
      return state().ops;
    },
    retry: (id, body) => requeue(id, body),
    resolve: (id, body) => requeue(id, body, "conflict"),
    async discard(id) {
      await start();
      const op = find(id);
      if (!op || op.status === "sending") return false;
      ops = ops.filter((x) => x !== op);
      store.del(id).catch(() => {});
      notify({ type: "discard", op: { ...op } });
      void pump();
      return true;
    },
    async flush() {
      await start();
      reachable ||= !o.ping;
      probes = 0;
      for (const op of ops) if (op.status === "waiting") op.nextAt = undefined;
      notify();
      await pump();
    },
    check,
    async clear() {
      await start();
      for (const op of ops) store.del(op.id).catch(() => {});
      ops = ops.filter((op) => op.status === "sending");
      notify();
    },
    subscribe(fn) {
      subs.add(fn);
      fn(state());
      void start();
      return () => void subs.delete(fn);
    },
    configure(options) {
      Object.assign(o, options);
      if (loaded) void pump();
    },
    get state() {
      return state();
    },
  };
}

/** La cola de la página (IndexedDB «nx-sync»). */
export const nxSync: SyncQueue = createSync();
