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
 *   teléfonos que recuperan la señal a la vez no lleguen juntos), o lo que diga `Retry-After` si es
 *   más (hasta 1 h). Tras `maxAttempts` respuestas de error del servidor, la operación queda
 *   «fallida» y deja pasar a las demás; la falta de red no gasta intentos.
 * - Un 401 detiene la cola (estado `auth`): la sesión venció y reintentar con las mismas
 *   cabeceras no sirve. Sigue con `flush()`, `check()` o `configure({headers})`.
 * - Con varias pestañas abiertas, una sola envía (`navigator.locks`); las demás guardan lo suyo en
 *   la misma base y se enteran de los cambios por `BroadcastChannel`.
 * - Cada envío lleva `Idempotency-Key`: si la respuesta se perdió pero el servidor sí lo guardó,
 *   el reintento no lo duplica.
 * - Un 409 con `{server}` deja la operación «en conflicto»; otro 4xx, «fallida». Ninguna de las
 *   dos bloquea la cola: solo a las siguientes de su mismo `group`.
 */
import { clampDelay } from "../../core/time";
import type { SyncChannel, SyncConflict, SyncEvent, SyncField, SyncInput, SyncJson, SyncListener, SyncLocks, SyncMethod, SyncOp, SyncOptions, SyncRevision, SyncState, SyncStatus, SyncStore } from "./types";

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

export type SyncVerdict = "ok" | "retry" | "conflict" | "failed" | "auth";

/** Qué hacer con una respuesta: 2xx listo; 408, 425, 429 y 5xx se reintentan; 409 y 412 son un
 *  conflicto; 401 (y 419/440, sesión vencida en Laravel e IIS) pide iniciar sesión; el resto de
 *  4xx no se arregla reintentando. */
export function classify(status: number): SyncVerdict {
  if (status >= 200 && status < 300) return "ok";
  if (status === 401 || status === 419 || status === 440) return "auth";
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

/** Solo rutas relativas o http(s): la cola no llama a `javascript:` ni a `data:`. */
const okUrl = (url: string | undefined): url is string => !!url && !(/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^https?:/i.test(url));

/** Una operación nueva a partir de lo que pidió la app, o `null` si no sirve (sin URL segura,
 *  método que no escribe, cuerpo que no es JSON). Sin `label`, queda vacía (la URL no se muestra:
 *  puede llevar una llave o datos en la query). */
export function cleanInput(v: unknown, id: string, seq: number, now: number): SyncOp | null {
  if (!isObj(v)) return null;
  const method = String(v.method ?? "").toUpperCase() as SyncMethod;
  const url = str(v.url)?.trim();
  if (!METHODS.includes(method) || !okUrl(url)) return null;
  const body = json(v.body);
  if (v.body !== undefined && body === undefined) return null;
  const opId = str(v.id) ?? id;
  return {
    id: opId,
    key: opId,
    method,
    url,
    ...(body !== undefined ? { body } : null),
    label: str(v.label) ?? "",
    ...(str(v.group) ? { group: v.group as string } : null),
    status: "pending",
    seq,
    createdAt: now,
    attempts: 0,
  };
}

const STATUSES = new Set<SyncStatus>(["pending", "sending", "waiting", "conflict", "failed"]);
const fin = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Una operación leída del almacén, validada (un registro corrupto o de una versión anterior no
 * rompe la cola), o `null` si no tiene arreglo. Lo que iba en camino cuando se cerró la página
 * vuelve a la fila: la llave evita duplicarlo.
 */
export function cleanStored(v: unknown, now: number, fresh = true): SyncOp | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const method = String(v.method ?? "").toUpperCase() as SyncMethod;
  const url = str(v.url)?.trim();
  if (!id || !METHODS.includes(method) || !okUrl(url)) return null;
  const body = json(v.body);
  const status = STATUSES.has(v.status as SyncStatus) ? (v.status as SyncStatus) : "pending";
  const op: SyncOp = {
    id,
    key: str(v.key) ?? id,
    method,
    url,
    ...(body !== undefined ? { body } : null),
    label: typeof v.label === "string" ? v.label : "",
    ...(str(v.group) ? { group: v.group as string } : null),
    status: fresh && status === "sending" ? "pending" : status,
    seq: fin(v.seq) ? v.seq : NaN,
    createdAt: fin(v.createdAt) ? v.createdAt : now,
    attempts: fin(v.attempts) && v.attempts >= 0 ? Math.floor(v.attempts) : 0,
  };
  if (fin(v.rev)) op.rev = v.rev;
  if (fin(v.fails) && v.fails > 0) op.fails = Math.floor(v.fails);
  if (fin(v.nextAt) && op.status === "waiting") op.nextAt = v.nextAt;
  else if (op.status === "waiting") op.status = "pending";
  if (typeof v.error === "string") op.error = v.error;
  if (fin(v.httpStatus)) op.httpStatus = v.httpStatus;
  if (str(v.etag)) op.etag = v.etag as string;
  const c = isObj(v.conflict) ? cleanConflict(v.conflict, body, str(v.conflict.etag)) : null;
  if (c) op.conflict = c;
  else if (op.status === "conflict") op.status = "failed";
  if (isObj(v.next)) {
    const n = cleanInput({ ...v.next, id }, id, 0, 0);
    if (n) op.next = { method: n.method, url: n.url, label: n.label, ...(n.body !== undefined ? { body: n.body } : null) };
  }
  return op;
}

/** Lo leído del almacén: validado, en orden y con `seq` corrido (los que no lo traían, al final).
 *  Con `fresh`, lo que figuraba «enviando» vuelve a la fila (la pestaña que lo enviaba ya no está). */
export function cleanLoaded(list: unknown, now: number, fresh = true): SyncOp[] {
  const ops = (Array.isArray(list) ? list : []).map((x) => cleanStored(x, now, fresh)).filter((x): x is SyncOp => !!x);
  ops.sort((a, b) => (Number.isNaN(a.seq) ? 1 : Number.isNaN(b.seq) ? -1 : a.seq - b.seq));
  let last = 0;
  for (const op of ops) last = op.seq = Number.isNaN(op.seq) || op.seq <= last ? last + 1 : op.seq;
  return ops;
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
    durable: false,
    load: async () => [...m.values()].map((op) => json(op)!),
    get: async (id) => (m.has(id) ? json(m.get(id)) : undefined),
    put: async (op) => m.set(op.id, json(op)!),
    del: async (id) => m.delete(id),
  };
}

/**
 * La cola en IndexedDB (base `name`, almacén `ops`). Cada escritura resuelve cuando la transacción
 * se completa: un disco lleno (`QuotaExceededError`) llega como `abort` de la transacción, después
 * del `success` de la petición, y tiene que llegar como error.
 */
export function idbStore(name = "nx-sync"): SyncStore {
  let db: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> =>
    (db ??= new Promise<IDBDatabase>((ok, ko) => {
      const r = indexedDB.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("ops", { keyPath: "id" });
      r.onsuccess = () => {
        const d = r.result;
        // Otra pestaña sube la versión o el navegador cierra la base: se suelta y se vuelve a abrir
        // en el próximo uso (una conexión cerrada ya no sirve para nada).
        d.onversionchange = () => (d.close(), (db = undefined));
        d.onclose = () => (db = undefined);
        ok(d);
      };
      r.onerror = () => ko(r.error);
      r.onblocked = () => ko(new Error("[nxSync] IndexedDB bloqueada por otra pestaña"));
    }).catch((e: unknown) => {
      db = undefined;
      throw e;
    }));
  const tx = async <T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, again = true): Promise<T> => {
    let t: IDBTransaction;
    try {
      t = (await open()).transaction("ops", mode);
    } catch (e) {
      // La conexión se cerró entre medio: una vez más, con una nueva.
      db = undefined;
      if (again) return tx(mode, fn, false);
      throw e;
    }
    const r = fn(t.objectStore("ops"));
    return new Promise<T>((ok, ko) => {
      t.oncomplete = () => ok(r.result);
      t.onabort = t.onerror = () => ko(t.error ?? r.error ?? new DOMException("Transacción abortada", "AbortError"));
    });
  };
  return {
    durable: true,
    load: () => tx("readonly", (s) => s.getAll() as IDBRequest<SyncOp[]>),
    get: (id) => tx("readonly", (s) => s.get(id) as IDBRequest<SyncOp | undefined>),
    put: (op) => tx("readwrite", (s) => s.put(op)),
    del: (id) => tx("readwrite", (s) => s.delete(id)),
  };
}

// ---------------------------------------------------------------- la cola

export interface SyncQueue {
  /** Guarda la operación y la envía cuando se pueda. Devuelve la operación ya guardada; rechaza si
   *  no se pudo guardar en el dispositivo (disco lleno) o si la cola está llena (`maxOps`). */
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
  /** Vacía la cola (al cerrar sesión), también lo que va en camino y lo de las otras pestañas. */
  clear(): Promise<void>;
  /** Avisa cada cambio (y una vez al suscribirse). Devuelve cómo dejar de escuchar. */
  subscribe(fn: SyncListener): () => void;
  configure(options: SyncOptions): void;
  readonly state: SyncState;
}

let uid = 0;
const newId = () => globalThis.crypto?.randomUUID?.() ?? `op-${Date.now().toString(36)}-${(++uid).toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const bySeq = (a: SyncOp, b: SyncOp) => a.seq - b.seq;

/**
 * Una cola. La librería trae una lista para usar (`nxSync`, base «nx-sync»); `createSync()` sirve
 * para otra base (una por usuario: `{name: "nx-sync:" + id}`) o para probar con `fetch`, `store`,
 * `now`, `random`, `network`, `events`, `locks` y `channel` falsos. No toca el navegador hasta el
 * primer uso: importarla en el servidor no hace nada.
 */
export function createSync(init: SyncOptions & { events?: Pick<EventTarget, "addEventListener"> } = {}): SyncQueue {
  const o = { base: 1000, max: 60_000, timeout: 30_000, maxAttempts: 8, maxRetryAfter: 3_600_000, name: "nx-sync", ...init };
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
  /** La última escritura en el almacén salió bien. */
  let wrote = true;
  /** El servidor pidió iniciar sesión: nada sale hasta que la app lo diga. */
  let auth = false;
  /** Esta pestaña envía: tiene el candado, o no hay candado y cada una envía lo suyo. */
  let leader = true;
  let channel: SyncChannel | null = null;
  /** Sube con `clear()`: lo que vuelva de un envío de antes ya no se guarda. */
  let gen = 0;
  const inflight = new Set<AbortController>();
  /** La que esta pestaña está enviando (en la vista de otra, «enviando» es de otra pestaña). */
  let current: SyncOp | null = null;

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
    let conflicts = 0;
    let failed = 0;
    for (const op of ops) {
      if (op.status === "conflict") conflicts++;
      else if (op.status === "failed") failed++;
    }
    const left = done !== null && busy ? live().length : 0;
    return {
      online: online(),
      ops: ops.map((op) => ({ ...op })),
      pending: ops.length - conflicts - failed,
      conflicts,
      failed,
      progress: left ? { done: done!, total: done! + left } : null,
      ready: loaded,
      durable: !loaded || (store.durable !== false && wrote),
      auth,
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
  /** Avisa a las otras pestañas que el almacén cambió (una vez por vuelta del bucle de eventos). */
  let told = false;
  const announce = () => {
    if (!channel || told) return;
    told = true;
    queueMicrotask(() => {
      told = false;
      post({ type: "changed" });
    });
  };
  const post = (msg: unknown) => {
    try {
      channel?.postMessage(msg);
    } catch {
      /* canal cerrado */
    }
  };
  /** Una escritura en el almacén: `true` si quedó. Si falla, la cola deja de ser «durable». */
  const persist = (p: Promise<unknown>): Promise<boolean> =>
    p.then(
      () => {
        if (!wrote) (wrote = true), notify();
        announce();
        return true;
      },
      () => {
        if (wrote) (wrote = false), notify();
        return false;
      },
    );
  const save = (op: SyncOp) => {
    op.rev = (op.rev ?? 0) + 1;
    return persist(store.put(op));
  };
  const drop = (id: string) => persist(store.del(id));
  const find = (id: string) => ops.find((op) => op.id === id);
  const wait = (op: SyncOp, ms: number) => {
    op.status = "waiting";
    op.nextAt = now() + clampDelay(ms);
    void save(op);
  };
  /** Lo que esperaba por falta de red sale ya (no lo que esperaba porque el servidor lo pidió). */
  const wake = () => {
    for (const op of ops) if (op.status === "waiting" && !op.httpStatus) op.nextAt = undefined;
  };
  /** ¿La descartaron (en otra pestaña) mientras iba en camino? Entonces no se vuelve a guardar. */
  const gone = async (op: SyncOp): Promise<boolean> => {
    if (!store.get) return false;
    try {
      return !(await store.get(op.id));
    } catch {
      return false;
    }
  };
  /** Aplica una versión nueva. Si la anterior ya salió alguna vez (pudo llegar), va con otra llave:
   *  con la misma, el servidor devolvería lo guardado y la edición se perdería. */
  const revise = (op: SyncOp, rev: SyncRevision) => {
    const changed = JSON.stringify(op.body) !== JSON.stringify(rev.body) || op.url !== rev.url || op.method !== rev.method;
    const was = stuck(op);
    op.method = rev.method;
    op.url = rev.url;
    if (rev.label) op.label = rev.label;
    if (rev.body === undefined) delete op.body;
    else op.body = rev.body;
    if (was || (changed && op.attempts > 0)) op.key = `${op.id}.${op.attempts}`;
    if (was) {
      op.status = "pending";
      op.conflict = op.error = undefined;
      op.fails = 0;
    }
    delete op.next;
  };
  /** Las vencidas (`ttl`) se van sin enviarse. */
  const sweep = () => {
    if (!o.ttl) return;
    const t = now();
    for (const op of ops.filter((x) => x.status !== "sending" && t - x.createdAt > o.ttl!)) {
      ops = ops.filter((x) => x !== op);
      void drop(op.id);
      notify({ type: "expired", op: { ...op } });
    }
  };

  /** Lee otra vez el almacén (otra pestaña encoló, reintentó o descartó). Con `fresh`, lo toma tal
   *  cual (esta pestaña acaba de quedarse con la cola); si no, gana la versión más nueva de cada una
   *  y lo que esta pestaña está enviando se queda como está. */
  async function reload(fresh = false): Promise<void> {
    let list: SyncOp[];
    try {
      list = cleanLoaded(await store.load(), now(), fresh);
    } catch {
      return;
    }
    if (fresh) ops = list;
    else {
      const mine = new Map(ops.map((op) => [op.id, op]));
      const seen = new Set(list.map((x) => x.id));
      ops = [
        ...list.map((x) => {
          const m = mine.get(x.id);
          return m && (m === current || (m.rev ?? 0) >= (x.rev ?? 0)) ? m : x;
        }),
        ...ops.filter((m) => !seen.has(m.id) && m === current),
      ].sort(bySeq);
    }
    seq = ops.reduce((m, op) => Math.max(m, op.seq), seq);
  }

  const onMessage = (m: unknown) => {
    const type = isObj(m) ? m.type : undefined;
    if (type === "clear") return void wipe();
    if (type !== "changed" && type !== "flush") return;
    void reload().then(() => {
      if (type === "flush") for (const op of ops) if (op.status === "waiting") op.nextAt = undefined;
      notify();
      void pump();
    });
  };

  /** Con el almacén de IndexedDB y `navigator.locks`, una sola pestaña envía: la que tiene el
   *  candado, hasta cerrarse; entonces lo toma otra y retoma lo que iba en camino. */
  const elect = (locks: SyncLocks | null | undefined) => {
    if (!locks?.request) return;
    leader = false;
    locks
      .request(`nx-sync:${o.name}`, async () => {
        leader = true;
        await reload(true);
        notify();
        void pump();
        await new Promise(() => {});
      })
      .catch(() => {
        // Sin candado (un contexto que no lo permite): cada pestaña envía, como sin `navigator.locks`.
        leader = true;
        void pump();
      });
  };

  const start = () =>
    (boot ??= (async () => {
      let shared = !o.store && typeof indexedDB !== "undefined";
      store = o.store ?? (shared ? idbStore(o.name) : memoryStore());
      const locks = o.locks !== undefined ? o.locks : shared && typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: SyncLocks }).locks : null;
      try {
        // Con candado, lo que figura «enviando» puede estar yendo desde otra pestaña: se deja así
        // hasta que esta se quede con la cola.
        ops = cleanLoaded(await store.load(), now(), !locks);
      } catch {
        store = memoryStore();
        shared = false;
      }
      seq = ops.reduce((m, op) => Math.max(m, op.seq), 0);
      loaded = true;
      if (o.channel !== undefined) channel = o.channel;
      else if (shared && typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel(`nx-sync:${o.name}`);
        (bc as unknown as { unref?: () => void }).unref?.();
        channel = bc as unknown as SyncChannel;
      }
      if (channel) channel.onmessage = (e) => onMessage(e.data);
      const ev = o.events ?? (typeof addEventListener === "function" ? globalThis : undefined);
      ev?.addEventListener("online", () => {
        // Volvió la red: sin `ping` se confía; con `ping`, se comprueba antes de enviar.
        wake();
        void check();
      });
      ev?.addEventListener("offline", () => notify());
      sweep();
      if (shared || o.locks) elect(locks);
      notify();
      void pump();
    })());

  /** ¿Contesta el servidor? (`ping`: cualquier respuesta sirve; solo la falta de una cuenta). */
  const ping = async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), clampDelay(o.timeout, 30_000));
    try {
      return !!(await doFetch(o.ping!, { cache: "no-store", signal: ac.signal }));
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  };

  async function send(op: SyncOp): Promise<void> {
    const g = gen;
    // Otra pestaña pudo descartarla o cambiarla desde que se leyó: sale lo que está guardado.
    if (store.get) {
      let cur: unknown = op;
      try {
        cur = await store.get(op.id);
      } catch {
        /* sin almacén: lo que hay en memoria */
      }
      if (g !== gen || !ops.includes(op)) return;
      if (!cur) {
        ops = ops.filter((x) => x !== op);
        return notify({ type: "discard", op: { ...op } });
      }
      const c = cur === op ? null : cleanStored(cur, now(), false);
      if (c && (c.rev ?? 0) > (op.rev ?? 0)) {
        for (const k of Object.keys(op) as (keyof SyncOp)[]) if (!(k in c)) delete op[k];
        Object.assign(op, c);
        if (op.status === "sending") op.status = "pending";
        if (stuck(op) || (op.nextAt ?? 0) > now()) return notify();
      }
    }
    op.status = "sending";
    op.attempts++;
    op.nextAt = undefined;
    void save(op);
    notify();
    const ac = new AbortController();
    inflight.add(ac);
    const t = setTimeout(() => ac.abort(), clampDelay(o.timeout, 30_000));
    let res: Response | undefined;
    let data: unknown = null;
    try {
      const extra = typeof o.headers === "function" ? o.headers() : o.headers;
      res = await doFetch(op.url, {
        method: op.method,
        headers: { Accept: "application/json", ...extra, "Idempotency-Key": op.key, ...(op.body !== undefined ? { "Content-Type": "application/json" } : null), ...(op.etag ? { "If-Match": op.etag } : null) },
        body: op.body === undefined ? undefined : JSON.stringify(op.body),
        signal: ac.signal,
      });
      // El cuerpo también cuenta en el tiempo: un servidor que manda las cabeceras y se queda
      // callado no deja la cola colgada.
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : null;
      } catch {
        data = null;
      }
    } catch {
      /* sin respuesta: red caída o se agotó el tiempo */
    } finally {
      clearTimeout(t);
      inflight.delete(ac);
    }
    // `clear()` mientras iba (cerró sesión): lo que vuelva no se guarda ni se reintenta.
    if (g !== gen || !ops.includes(op)) return;
    const verdict = res ? classify(res.status) : null;
    if (verdict === "ok") {
      done = (done ?? 0) + 1;
      const sent = { ...op, httpStatus: res!.status, error: undefined };
      if (op.next) {
        // Llegó otra versión mientras esta iba: ahora sale esa.
        revise(op, op.next);
        op.status = "pending";
        op.error = op.httpStatus = undefined;
        void save(op);
      } else {
        ops = ops.filter((x) => x !== op);
        void drop(op.id);
      }
      return notify({ type: "done", op: sent, data, status: res!.status });
    }
    if (await gone(op)) {
      ops = ops.filter((x) => x !== op);
      return notify({ type: "discard", op: { ...op } });
    }
    if (g !== gen || !ops.includes(op)) return;
    if (op.next) revise(op, op.next);
    if (!res) {
      reachable = false;
      op.error = op.httpStatus = undefined;
      return wait(op, backoff(op.attempts, o.base, o.max, o.random)), notify();
    }
    reachable = true;
    op.httpStatus = res.status;
    op.error = errorText(data);
    if (verdict === "auth") {
      // La sesión venció: reintentar con las mismas cabeceras no sirve. La operación no gasta nada.
      auth = true;
      op.status = "pending";
      void save(op);
      return notify({ type: "auth", op: { ...op } });
    }
    if (verdict === "retry") {
      op.fails = (op.fails ?? 0) + 1;
      if (op.fails < o.maxAttempts) {
        // Lo que pide el servidor, pero nunca menos que la espera que toca (un `Retry-After: 0`
        // no es una invitación a martillar) ni más que `maxRetryAfter`.
        const ms = Math.min(Math.max(retryAfter(res.headers.get("Retry-After"), now()) ?? 0, backoff(op.attempts, o.base, o.max, o.random)), o.maxRetryAfter);
        return wait(op, ms), notify();
      }
    }
    const conflict = verdict === "conflict" ? cleanConflict(data, op.body, res.headers.get("ETag")) : null;
    op.status = conflict ? "conflict" : "failed";
    op.nextAt = undefined;
    if (conflict) op.conflict = conflict;
    void save(op);
    notify({ type: op.status as "conflict" | "failed", op: { ...op } });
  }

  async function run(): Promise<void> {
    clearTimeout(timer);
    busy = true;
    while (net() && leader && !auth) {
      sweep();
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
          // Ahora espera por la red, no por el servidor: `wake()` la suelta cuando vuelva.
          if (op) (op.httpStatus = undefined), wait(op, d);
          notify();
          timer = setTimeout(() => void pump(), clampDelay(d));
          break;
        }
        probes = 0;
        // Volvió: lo que esperaba por la red sale ya.
        if (!was) wake();
        notify();
        continue;
      }
      if (ms > 0) {
        // Un `nextAt` lejano no desborda `setTimeout` (más de 24,8 días dispararía al instante).
        timer = setTimeout(() => void pump(), clampDelay(ms));
        break;
      }
      if (!op) {
        // Sin `ping` ni nada que enviar no hay cómo saberlo: se confía en la red.
        reachable ||= !o.ping;
        break;
      }
      done ??= 0;
      current = op;
      try {
        await send(op);
      } finally {
        current = null;
      }
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
      if (net() && leader && !auth && ((probe && o.ping) || (next && !((next.nextAt ?? 0) > now())))) return void pump();
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
    if (!online()) wake();
    auth = false;
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
    op.fails = 0;
    op.nextAt = op.error = op.conflict = undefined;
    reachable ||= !o.ping;
    auth = false;
    void save(op);
    notify({ type: "retry", op: { ...op } });
    void pump();
    return true;
  };

  /** Vacía la cola de esta pestaña: aborta lo que va en camino y borra lo guardado. */
  const wipe = () => {
    gen++;
    for (const ac of inflight) ac.abort();
    inflight.clear();
    const all = ops;
    ops = [];
    done = null;
    auth = false;
    for (const op of all) store.del(op.id).catch(() => {});
    notify();
    return all;
  };

  return {
    async enqueue(input) {
      await start();
      const op = cleanInput(input, newId(), seq + 1, now());
      if (!op) throw new TypeError("[nxSync] operación inválida: hace falta method (POST, PUT, PATCH, DELETE), url y un body JSON");
      const same = find(op.id);
      if (same) {
        // El mismo id otra vez: la última versión es la que vale. Si la anterior va en camino, la
        // nueva sale después (con otra llave: la anterior pudo llegar).
        const rev: SyncRevision = { method: op.method, url: op.url, label: op.label, ...(op.body !== undefined ? { body: op.body } : null) };
        if (same.status === "sending") same.next = rev;
        else revise(same, rev);
        const ok = await save(same);
        notify();
        void pump();
        if (!ok) throw new Error("[nxSync] no se pudo guardar la operación en el dispositivo");
        return { ...same };
      }
      if (o.maxOps && ops.length >= o.maxOps) throw new RangeError(`[nxSync] la cola está llena (${o.maxOps} operaciones)`);
      seq = Math.max(seq, op.seq);
      // Primero en el dispositivo; solo si quedó, en la fila. Una que no se pudo guardar no se
      // envía a medias: la app se entera y decide.
      if (!(await save(op))) throw new Error("[nxSync] no se pudo guardar la operación en el dispositivo");
      if (!find(op.id)) ops.push(op);
      ops.sort(bySeq);
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
      void drop(id);
      notify({ type: "discard", op: { ...op } });
      void pump();
      return true;
    },
    async flush() {
      await start();
      reachable ||= !o.ping;
      probes = 0;
      auth = false;
      for (const op of ops) if (op.status === "waiting") op.nextAt = undefined;
      notify();
      if (!leader) post({ type: "flush" });
      await pump();
    },
    check,
    async clear() {
      await start();
      wipe();
      // Y lo que otra pestaña guardó y esta aún no ve.
      try {
        for (const op of await store.load()) await store.del(op.id);
      } catch {
        /* sin almacén */
      }
      post({ type: "clear" });
    },
    subscribe(fn) {
      subs.add(fn);
      fn(state());
      void start();
      return () => void subs.delete(fn);
    },
    configure(options) {
      Object.assign(o, options);
      // Cabeceras nuevas (la app renovó la sesión): la cola sigue.
      if ("headers" in options) auth = false;
      if (loaded) void pump();
    },
    get state() {
      return state();
    },
  };
}

/** La cola de la página (IndexedDB «nx-sync»). */
export const nxSync: SyncQueue = createSync();
