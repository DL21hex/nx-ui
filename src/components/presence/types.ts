/**
 * `<nx-presence>`: tipos. La presencia es JSON (BDUI): quién está, en qué campo y si escribe viaja
 * como eventos pequeños por el transporte que haya (otra pestaña, SSE o el de la app).
 */

/** Una persona: su `id` estable (de él sale su color) y su nombre. */
export interface PresenceUser {
  id: string;
  name: string;
  /** URL de la foto (sin ella, las iniciales). Pasa por `safeHref()`. */
  avatar?: string;
}

export type PresenceEventType = "join" | "leave" | "focus" | "blur" | "typing" | "lock" | "unlock" | "heartbeat";

/**
 * Lo que viaja: `{type, user, field?}`. El latido lleva, además, el estado completo de quien lo
 * manda (`field`, `editing`, `idle`), para que quien acaba de entrar lo vea tal cual está.
 */
export interface PresenceEvent {
  type: PresenceEventType;
  user: PresenceUser;
  /** El campo (`data-presence` o `name`) al que se refiere. */
  field?: string | null;
  /** Inactivo: pestaña oculta o sin actividad (`idle` ms). */
  idle?: boolean;
  /** En el latido: ya escribió en `field` (lo tiene «bloqueado»). */
  editing?: boolean;
}

/** Una persona que está aquí, y qué hace. Es lo que devuelve `users`. */
export interface PresenceState extends PresenceUser {
  /** El campo que tiene enfocado, o `null`: solo está viendo. */
  field: string | null;
  /** Escribió en ese campo (bloqueo suave). */
  editing: boolean;
  /** Está escribiendo ahora mismo. */
  typing: boolean;
  idle: boolean;
  /** Desde cuándo está inactiva (ms de época), o `null`. */
  idleSince: number | null;
  /** Cuándo llegó y cuándo se supo algo de ella por última vez (ms de época). */
  joinedAt: number;
  seenAt: number;
}

export interface PresenceLabels {
  /** Nombre de la lista de avatares. */
  people: string;
  /** El botón con los que no caben: «+{n}» (lo que se ve). */
  more: string;
  /** Su nombre accesible: «Ver a las {n} personas». */
  moreLabel: string;
  /** Sin desborde, el botón que abre la lista. */
  all: string;
  /** Título de la lista: «En este registro». */
  here: string;
  /** Sin nadie más. */
  alone: string;
  /** Tras el propio nombre en la lista: «(tú)». */
  you: string;
  viewing: string;
  /** «en {field}»: lo tiene enfocado. */
  focus: string;
  /** «editando {field}». */
  editing: string;
  /** «escribiendo en {field}…». */
  typing: string;
  idle: string;
  /** «inactivo {ago}» («hace 4 min»). */
  idleFor: string;
  /** En la etiqueta del campo: «{name} está escribiendo…». */
  typingTag: string;
  /** Anuncios: «{names} entró» / «{names} entraron». */
  joined: string;
  joinedMany: string;
  left: string;
  leftMany: string;
  /** «{name} está editando {field}». */
  editingNow: string;
  /** «Y {n} cambios más». */
  andMore: string;
  /** El aviso del bloqueo suave. */
  warn: string;
  proceed: string;
  /** Pista del teclado en el aviso. */
  escHint: string;
}
