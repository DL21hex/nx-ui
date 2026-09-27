/**
 * `<nx-handoff>`: tipos. Lo que entra es JSON (BDUI): el lado, el endpoint, a quién se entrega, qué
 * se pide y el contexto que viaja al servidor. Lo que sale son eventos con cada cosa recibida.
 * El protocolo completo (rutas, cuerpos, errores) está en `INTEGRATION.md`.
 */

/** `desktop` (por defecto): el botón, el QR y la escucha. `phone`: la página que abre el QR. */
export type HandoffSide = "desktop" | "phone";

/** Qué se le pide al celular. */
export type HandoffKind = "photo" | "file" | "scan";

/** En qué va el lado escritorio. */
export type HandoffState =
  /** El botón, sin sesión. */
  | "idle"
  /** Pidiendo la sesión al servidor. */
  | "creating"
  /** El QR a la vista: nadie lo ha abierto. */
  | "waiting"
  /** El celular abrió el enlace. */
  | "connected"
  /** Llegan cosas. */
  | "receiving"
  /** El celular terminó: queda el resumen. */
  | "done"
  /** La sesión venció (o el servidor la dio por vencida). */
  | "expired"
  /** No se pudo crear o el servidor avisó un error. */
  | "error";

/** Lo que manda el celular. `id` (opcional) evita entregar dos veces lo mismo si el stream se repite. */
export type HandoffItem =
  | { kind: "file"; name: string; type: string; size: number; url: string; id?: string }
  | { kind: "code"; code: string; format?: string; id?: string }
  | { kind: "data"; data: unknown; id?: string };

/** Un evento de la sesión (stream SSE/NDJSON o polling). `seq` (opcional) ordena y deduplica. */
export type HandoffEvent = (
  | { type: "connected"; device?: string }
  | { type: "progress"; received: number; total?: number }
  | { type: "item"; item: HandoffItem }
  | { type: "done" }
  | { type: "expired" }
  | { type: "error"; message: string }
) & { seq?: number };

/** Respuesta de `POST {endpoint}`: la sesión. `expiresAt` ya normalizado a milisegundos locales. */
export interface HandoffSession {
  id: string;
  /** La página del celular (va en el QR). Absoluta. */
  url: string;
  /** Vencimiento, en ms de `Date.now()` de este equipo (se corrige el desfase de reloj con `expiresIn`). */
  expiresAt: number;
  token?: string;
}

/** Respuesta de `GET {endpoint}/{id}?t=…` para el celular. */
export interface HandoffPhoneInfo {
  kind: HandoffKind;
  accept?: string;
  multiple?: boolean;
  title?: string;
  hint?: string;
  expiresAt?: number;
}

/** `nx-handoff-item` (cancelable): lo recibido y, si es un archivo, ya descargado. */
export interface HandoffItemDetail {
  item: HandoffItem;
  file?: File;
}

export interface HandoffDoneDetail {
  items: HandoffItem[];
}

export interface HandoffLabels {
  /** Botón del escritorio. */
  start: string;
  creating: string;
  /** Nombre del panel. */
  panel: string;
  /** Instrucción bajo el QR. */
  scan: string;
  /** `aria-label` del QR. */
  qr: string;
  copy: string;
  copied: string;
  /** «Vence en {t}». */
  expiresIn: string;
  cancel: string;
  waiting: string;
  connected: string;
  /** «{device} conectado». */
  connectedDevice: string;
  /** «Recibiendo {what}…». */
  receiving: string;
  /** «{what} desde el celular» (el resumen al terminar). */
  received: string;
  again: string;
  expired: string;
  restart: string;
  error: string;
  retry: string;
  /** Qué se recibió: «1 foto» / «{n} fotos», y lo mismo con archivos y códigos. */
  photo1: string;
  photos: string;
  file1: string;
  files: string;
  code1: string;
  codes: string;
}

/**
 * Los textos del lado celular. Van en el mismo atributo `labels`; sus valores por defecto
 * (`HANDOFF_PHONE_LABELS`) viven en el chunk del celular para que el escritorio no los cargue.
 */
export interface HandoffPhoneLabels {
  loading: string;
  /** Título por defecto (el servidor puede mandar el suyo). */
  title: string;
  takePhoto: string;
  gallery: string;
  chooseFile: string;
  /** «Quitar {name}». */
  remove: string;
  send: string;
  /** «Enviando {i} de {n}…». */
  sending: string;
  /** Estado de cada archivo: en cola, enviado, falló. */
  queued: string;
  uploaded: string;
  failed: string;
  /** «No se pudo enviar {name}». */
  uploadFailed: string;
  sent: string;
  more: string;
  finish: string;
  /** «Enviados: {n}» (con «{n}» = «3 códigos»). */
  codesSent: string;
  invalid: string;
  offline: string;
}
