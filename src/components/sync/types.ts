/**
 * `<nx-sync>` y `nxSync`: tipos. Una operación es una escritura (POST, PUT, PATCH, DELETE) que la
 * app pide hacer; la cola la guarda en el dispositivo y la envía cuando hay conexión.
 */

/** Lo que cabe en JSON. */
export type SyncJson = string | number | boolean | null | SyncJson[] | { [k: string]: SyncJson };

export type SyncMethod = "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * - `pending`: espera su turno.
 * - `sending`: va en camino.
 * - `waiting`: falló por la red o el servidor (5xx, 429, 408); se reintenta en `nextAt`.
 * - `conflict`: el servidor respondió 409 con su versión; alguien tiene que elegir.
 * - `failed`: el servidor la rechazó (4xx); se corrige y se reintenta, o se descarta.
 */
export type SyncStatus = "pending" | "sending" | "waiting" | "conflict" | "failed";

/** Lo que recibe `nxSync.enqueue()`. */
export interface SyncInput {
  /** Identificador estable (también la cabecera `Idempotency-Key`). Sin él, uno nuevo. Encolar
   *  otra vez el mismo `id` reemplaza el cuerpo de la que aún no ha salido. */
  id?: string;
  method: SyncMethod | Lowercase<SyncMethod>;
  url: string;
  /** Cualquier valor JSON; se envía como `application/json`. */
  body?: SyncJson;
  /** Lo que la persona reconoce: «Pedido · Tienda La Esquina». Sin él, la píldora dice «Cambio sin
   *  nombre» (la URL no se usa: puede llevar datos o llaves en la query). */
  label: string;
  /** Las operaciones del mismo grupo no se adelantan a una en conflicto o fallida del grupo. */
  group?: string;
}

/** Un campo en disputa (`key` es la ruta con puntos: «productos.1.cantidad»). */
export interface SyncField {
  key: string;
  label: string;
}

/** Lo que mandó el servidor con el 409. */
export interface SyncConflict {
  /** Su versión. */
  server: SyncJson;
  /** La que tiene la cola (o la que el servidor dice haber recibido). */
  local: SyncJson;
  /** Los campos en disputa, si el servidor los dice (van primero en el comparador). */
  fields: SyncField[];
  /** Versión del servidor: se reenvía como `If-Match`. */
  etag?: string;
}

export interface SyncOp {
  id: string;
  method: SyncMethod;
  url: string;
  body?: SyncJson;
  label: string;
  group?: string;
  status: SyncStatus;
  /** Orden de llegada (sobrevive a recargar la página). */
  seq: number;
  /** Cuándo se encoló (ms). */
  createdAt: number;
  /** Intentos hechos. */
  attempts: number;
  /** Cuándo es el próximo intento (ms), si hay uno programado. */
  nextAt?: number;
  /** Por qué no salió: «Sin conexión», «El servidor no responde (503)»… */
  error?: string;
  /** El código HTTP de la última respuesta. */
  httpStatus?: number;
  conflict?: SyncConflict;
  /** `Idempotency-Key`: el `id`, y otra si el cuerpo cambia al resolver o corregir. */
  key: string;
  /** `If-Match` para el próximo envío. */
  etag?: string;
  /** Cuántas veces el servidor contestó 5xx, 429 o 408 (con `maxAttempts`, queda fallida). */
  fails?: number;
  /** Versión del registro: sube con cada escritura. Al juntar lo de otra pestaña gana la mayor. */
  rev?: number;
  /** La versión que llegó con `enqueue()` del mismo `id` mientras esta iba en camino: sale después,
   *  con otra llave (la anterior pudo haber llegado). */
  next?: SyncRevision;
}

/** Lo que cambia al encolar otra vez el mismo `id`. */
export interface SyncRevision {
  method: SyncMethod;
  url: string;
  body?: SyncJson;
  label: string;
}

/** Lo que ve quien se suscribe. */
export interface SyncState {
  /** Hay red y el servidor contesta. */
  online: boolean;
  /** Las operaciones en la cola, en orden (todas: también las que esperan a alguien). */
  ops: SyncOp[];
  /** Cuántas faltan por enviar (sin contar conflictos ni fallidas). */
  pending: number;
  conflicts: number;
  failed: number;
  /** Envío en curso: «2 de 5». `null` si no está sincronizando. */
  progress: { done: number; total: number } | null;
  /** La cola ya leyó lo guardado en el dispositivo. */
  ready: boolean;
  /** Lo encolado sobrevive a cerrar la pestaña: `false` si la cola vive en memoria (sin IndexedDB,
   *  o no se pudo abrir) o si falló la última escritura (disco lleno). */
  durable: boolean;
  /** El servidor pidió iniciar sesión (401): la cola se detuvo hasta `flush()`, `check()` o
   *  `configure()` con las cabeceras nuevas. */
  auth: boolean;
}

/** Qué acaba de pasar (el segundo argumento de quien se suscribe). */
export type SyncEvent =
  | { type: "online" | "offline" | "idle" }
  | { type: "enqueue" | "discard" | "conflict" | "failed" | "retry" | "auth" | "expired"; op: SyncOp }
  | { type: "done"; op: SyncOp; data: unknown; status: number };

export type SyncListener = (state: SyncState, event?: SyncEvent) => void;

/** Dónde se guarda la cola: IndexedDB en el navegador, memoria en las pruebas o sin IndexedDB. */
export interface SyncStore {
  load(): Promise<SyncOp[]>;
  /** Resuelve cuando quedó escrito de verdad (en IndexedDB, al completar la transacción). */
  put(op: SyncOp): Promise<unknown>;
  del(id: string): Promise<unknown>;
  /** Una sola, para releerla antes de enviarla (otra pestaña pudo cambiarla o descartarla). */
  get?(id: string): Promise<SyncOp | undefined>;
  /** `false` si lo guardado no sobrevive a cerrar la página (la de memoria). */
  durable?: boolean;
}

/** Lo mínimo de `navigator.locks` que usa la cola (para probar con uno falso). */
export interface SyncLocks {
  request(name: string, fn: () => Promise<unknown>): Promise<unknown>;
}

/** Lo mínimo de `BroadcastChannel` que usa la cola. */
export interface SyncChannel {
  postMessage(msg: unknown): void;
  onmessage: ((e: { data: unknown }) => void) | null;
}

/** Ajustes de la cola (`nxSync.configure()` o `createSync()`). */
export interface SyncOptions {
  /** URL que responde rápido (GET, cualquier 2xx–4xx) para saber si hay conexión de verdad. */
  ping?: string | null;
  /** Primera espera entre intentos (1000 ms); se duplica en cada uno. */
  base?: number;
  /** Tope de la espera (60 000 ms). */
  max?: number;
  /** Cuánto esperar una respuesta antes de darla por perdida (30 000 ms). */
  timeout?: number;
  /** Cabeceras para cada envío (p. ej. `Authorization`); una función para leerlas al enviar. */
  headers?: Record<string, string> | (() => Record<string, string>);
  /** Intentos con respuesta 5xx, 429 o 408 antes de darla por fallida (8). La falta de red no cuenta:
   *  sin conexión se espera lo que haga falta. */
  maxAttempts?: number;
  /** Tope de lo que se respeta de un `Retry-After` (1 h). */
  maxRetryAfter?: number;
  /** Cuántas operaciones caben en la cola; más, y `enqueue()` rechaza (sin tope por defecto). */
  maxOps?: number;
  /** Vida máxima de una operación sin enviar (ms desde que se encoló); vencida, se descarta con el
   *  evento `expired`. Sin tope por defecto. */
  ttl?: number;
  /** Nombre de la base de IndexedDB, del candado y del canal entre pestañas («nx-sync»). Una cola
   *  por usuario: `createSync({name: "nx-sync:" + userId})`. */
  name?: string;
  // Para pruebas y entornos sin navegador:
  fetch?: typeof fetch;
  store?: SyncStore;
  now?: () => number;
  random?: () => number;
  /** ¿Hay red? (por defecto `navigator.onLine`). */
  network?: () => boolean;
  /** Candado entre pestañas (por defecto `navigator.locks` con el almacén de IndexedDB); `null`, sin. */
  locks?: SyncLocks | null;
  /** Canal entre pestañas (por defecto un `BroadcastChannel` con el almacén de IndexedDB); `null`, sin. */
  channel?: SyncChannel | null;
}

export interface SyncLabels {
  online: string;
  offline: string;
  /** «{n} pendiente» / «{n} pendientes» */
  pendingOne: string;
  pendingMany: string;
  /** «Sincronizando {i} de {n}…» */
  syncing: string;
  /** «Reintento en {t}» (la píldora) */
  retryIn: string;
  conflictOne: string;
  conflictMany: string;
  failedOne: string;
  failedMany: string;
  heading: string;
  upToDate: string;
  emptyHint: string;
  syncNow: string;
  /** Estados de una operación. */
  pending: string;
  sending: string;
  waiting: string;
  conflict: string;
  failed: string;
  sent: string;
  attemptOne: string;
  attemptMany: string;
  /** «reintento en {t}» (una fila) */
  nextIn: string;
  retry: string;
  discard: string;
  confirmDiscard: string;
  cancel: string;
  resolve: string;
  edit: string;
  back: string;
  resolveTitle: string;
  resolveHint: string;
  mine: string;
  theirs: string;
  allMine: string;
  allTheirs: string;
  /** «{n} campos iguales no se muestran.» */
  same: string;
  sameOne: string;
  send: string;
  /** Un valor vacío o que no existe de ese lado. */
  blank: string;
  yes: string;
  no: string;
  editTitle: string;
  editHint: string;
  data: string;
  /** «No es JSON válido: {msg}» */
  invalid: string;
  sendEdit: string;
  liveOffline: string;
  liveOnline: string;
  liveDone: string;
  /** «Conflicto en «{label}»: hay que resolverlo.» */
  liveConflict: string;
  /** «No se pudo enviar «{label}».» */
  liveFailed: string;
  noNetwork: string;
  /** «El servidor no responde ({status})» */
  unavailable: string;
  /** «El servidor lo rechazó ({status})» */
  rejected: string;
  /** La píldora cuando el servidor pidió iniciar sesión. */
  auth: string;
  /** Anuncio del mismo caso. */
  liveAuth: string;
  /** Una operación sin `label`. */
  unnamed: string;
  /** Aviso en el panel cuando la cola vive en memoria. */
  notDurable: string;
}

export interface SyncChangeDetail {
  online: boolean;
  pending: number;
  conflicts: number;
}
