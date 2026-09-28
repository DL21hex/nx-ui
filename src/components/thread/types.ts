/**
 * `<nx-thread>`: tipos. Todo es JSON (BDUI): los comentarios, las personas, los registros que se
 * referencian y los eventos del stream.
 */

/** Una persona: quien comenta o a quien se menciona. */
export interface ThreadUser {
  id: string;
  name: string;
  /** URL de la foto (sin ella, las iniciales). Pasa por `safeImageSrc()`. */
  avatar?: string;
}

/** Lo que devuelve `people-source?q=`: una persona que se puede mencionar. */
export interface ThreadPerson extends ThreadUser {
  /** Una línea más: el cargo, el área. */
  detail?: string;
}

/** Lo que devuelve `refs-source?q=`: un registro que se puede referenciar (una factura, un pedido). */
export interface ThreadRef {
  id: string;
  label: string;
  detail?: string;
  /** A dónde lleva la ficha. Pasa por `safeHref()`. */
  href?: string;
}

/** Un comentario, como lo manda el servidor (`GET {endpoint}?record=…`). */
export interface ThreadComment {
  id: string;
  author: ThreadUser;
  /** Texto plano con tokens: `@[Laura Gómez](u12)`, `#[FV-1873](fv-1873)`. Nunca HTML. */
  text: string;
  /** ISO 8601. */
  at: string;
  editedAt?: string;
  /** El campo al que está anclado (su `data-thread` o `name`). */
  anchor?: string;
  /** El comentario al que responde (un solo nivel: se cita arriba, no se anida). */
  replyTo?: string;
  /** Una conversación anclada, resuelta (va en su primer comentario). */
  resolved?: boolean;
  /** Quién la resolvió: su nombre (el servidor puede mandar `{id, name}`). */
  resolvedBy?: string;
  /** El `clientId` con que se envió: un reintento no duplica. */
  clientId?: string;
  /** Registros referenciados en el texto, si el servidor los manda (para sus enlaces y tarjetas). */
  refs?: ThreadRef[];
  /** Solo del lado del cliente: enviándose, o no se pudo enviar. */
  state?: "sending" | "failed";
}

/** Un trozo del texto de un comentario, ya reconocido. */
export type ThreadToken =
  | { type: "text"; text: string }
  | { type: "br" }
  | { type: "mention"; id: string; name: string }
  | { type: "ref"; id: string; label: string }
  | { type: "url"; href: string; text: string };

/** Lo que llega por `stream` (SSE o NDJSON), un objeto por línea. */
export type ThreadStreamEvent =
  | { type: "comment" | "update"; comment: ThreadComment; record?: string }
  | { type: "delete"; id: string; record?: string }
  | { type: "typing"; user: ThreadUser; record?: string };

/** El detalle de `nx-thread-post` (cancelable): lo que se va a enviar. */
export interface ThreadPostDetail {
  record: string;
  text: string;
  anchor?: string;
  replyTo?: string;
  clientId: string;
}

export interface ThreadMentionDetail {
  comment: ThreadComment;
  /** Las personas mencionadas por primera vez en ese comentario. */
  people: ThreadUser[];
}

export interface ThreadErrorDetail {
  action: "load" | "post" | "edit" | "delete" | "resolve" | "stream";
  message: string;
  id?: string;
}

export interface ThreadLabels {
  heading: string;
  placeholder: string;
  send: string;
  /** La pista bajo el redactor. */
  hint: string;
  today: string;
  yesterday: string;
  /** La marca antes del primer comentario sin leer. */
  unread: string;
  edited: string;
  reply: string;
  edit: string;
  delete: string;
  save: string;
  cancel: string;
  resolve: string;
  reopen: string;
  /** «Resuelto por {name}». */
  resolvedBy: string;
  show: string;
  hide: string;
  /** «Respondiendo a {name}». */
  replyingTo: string;
  /** El comentario citado ya no está. */
  gone: string;
  /** «Sobre: {field}» (el ancla del redactor y de cada comentario). */
  about: string;
  /** El selector para anclar desde el redactor. */
  aboutField: string;
  remove: string;
  sending: string;
  failed: string;
  retry: string;
  deleted: string;
  editFailed: string;
  /** «Ver anteriores ({n})». */
  older: string;
  loading: string;
  loadFailed: string;
  empty: string;
  /** Filtrado por un campo: «Sobre {field}». */
  filtered: string;
  showAll: string;
  /** El globito del campo: sin comentarios, uno o varios. */
  pinNone: string;
  pinOne: string;
  pinMany: string;
  /** «{names} está escribiendo…» / «{names} están escribiendo…». */
  typing: string;
  typingMany: string;
  /** «{names} está viendo» / «{names} están viendo». */
  viewing: string;
  viewingMany: string;
  /** Unión de los dos últimos nombres («Laura y Héctor») y el resto («{n} más»). */
  and: string;
  more: string;
  /** Anuncios: «Nuevo comentario de {name}» / «{n} comentarios nuevos». */
  newOne: string;
  newMany: string;
  /** Nombres de las listas de sugerencias. */
  people: string;
  refs: string;
  /** Quien escribe, si falta su nombre. */
  you: string;
}
