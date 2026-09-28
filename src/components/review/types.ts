/**
 * `<nx-review>`: tipos. Todo es JSON (BDUI): los valores de un formulario son `{campo: valor}` y la
 * lista de cambios que sale (`changes`) es lo que la app guarda como bitácora, lo mismo que
 * `<nx-history>` muestra después.
 */
import type { DiffPart } from "../history/logic";

/** El valor de un campo: texto, número, sí/no, nada o varios (casillas y selects múltiples). */
export type ReviewValue = string | number | boolean | null | string[];

/** Valores por `name`. Las filas de detalle van con su índice: `items[0].qty`, `items[2][precio]`, `lineas.3.cantidad`. */
export type ReviewValues = Record<string, ReviewValue>;

/** Cómo se lee un cambio. `rows` es un grupo de filas de detalle. */
export type ReviewKind = "text" | "number" | "money" | "percent" | "date" | "choice" | "bool" | "rows";

/** Por qué un cambio es importante (se muestra primero y marcado). */
export type ReviewReason = "guard" | "important" | "status" | "amount" | "date";

/** Cuándo aparece el resumen al enviar. */
export type ReviewMode = "always" | "significant" | "never";

/** Lo que se sabe de un campo para contar su cambio: sale de su etiqueta, su tipo y sus `data-*`. */
export interface ReviewMeta {
  label?: string;
  /** El `<legend>` de su `<fieldset>` (o `data-review-section`). */
  section?: string;
  kind?: Exclude<ReviewKind, "rows">;
  /** Montos: ISO («COP») o un símbolo («$»). */
  currency?: string;
  /** Selects, radios y casillas: valor → etiqueta. */
  options?: Record<string, string>;
  /** `data-review="important"`: cualquier cambio es importante. */
  important?: boolean;
  /** Un estado (`data-review="status"`, o un campo `estado`/`status`/`state`): cambiarlo es importante. */
  status?: boolean;
  /** Texto largo (un `<textarea>`): se muestra la diferencia por palabras. */
  long?: boolean;
}

/** La diferencia de un número o una fecha. */
export interface ReviewDelta {
  /** `to - from` (en días, para fechas). */
  by: number;
  /** El cambio relativo (0,2 es +20 %); `null` si antes era 0. Solo números y montos. */
  pct?: number | null;
  /** «+$ 2.000 · +20 %», «+3 días». */
  text?: string;
}

/** Una fila de detalle nueva, quitada o cambiada. */
export interface ReviewRow {
  /** Su clave: el campo `id` de la fila (o su `data-review-row`), o vacío si se reconoce por posición. */
  key: string;
  /** El índice en los nombres de sus campos (`items[3].qty` → 3). */
  index: number;
  /** «Línea 3 · Lámina HR 4×8 cal. 14». */
  title: string;
  /** Nuevas y quitadas: sus valores, legibles («Cantidad 12 · Precio $ 1.275.000»). */
  text?: string;
  values: ReviewValues;
  /** Cambiadas: cada campo que cambió (`field` es el nombre completo, `items[3].qty`). */
  changes?: ReviewChange[];
  significant: boolean;
}

export interface ReviewRows {
  added: ReviewRow[];
  removed: ReviewRow[];
  changed: ReviewRow[];
  /** «2 líneas nuevas · 1 quitada · 1 cambiada». */
  summary: string;
}

/** Un cambio: lo que va a la bitácora. */
export interface ReviewChange {
  /** El `name` del campo (o del grupo de filas: `items`). */
  field: string;
  label: string;
  section?: string;
  kind: ReviewKind;
  /** Los valores tal cual (en `rows`, cuántas filas había y hay). */
  from: ReviewValue;
  to: ReviewValue;
  /** Como se leen: «$ 10.000», «12 oct 2026», «Aprobada», «Sí», «(vacío)». */
  fromText: string;
  toText: string;
  significant: boolean;
  reason?: ReviewReason;
  delta?: ReviewDelta;
  /** Textos largos: la diferencia por palabras. */
  diff?: DiffPart[];
  rows?: ReviewRows;
  /** Los avisos de `<nx-guard>` de este campo. */
  warnings?: string[];
}

export interface ReviewLabels {
  /** «Vas a guardar 1 cambio|Vas a guardar {n} cambios» (singular|plural). */
  title: string;
  save: string;
  keep: string;
  /** «No hay cambios que guardar» (con `empty="notice"`). */
  none: string;
  empty: string;
  yes: string;
  no: string;
  /** «“{text}”»: cómo se cita un texto. */
  quote: string;
  /** Lo que el lector de pantalla dice en lugar de la flecha. */
  to: string;
  /** La marca de lo importante (va con un ícono: no solo color). */
  important: string;
  /** Para el lector de pantalla, antes de un aviso de `<nx-guard>`. */
  warning: string;
  /** «{n} día|{n} días». */
  days: string;
  /** «1 línea nueva|{n} líneas nuevas». */
  added: string;
  removed: string;
  changed: string;
  /** «Línea {n}». */
  row: string;
  rowAdded: string;
  rowRemoved: string;
  rowChanged: string;
}

export interface ReviewOpenDetail {
  changes: ReviewChange[];
}
export interface ReviewConfirmDetail {
  changes: ReviewChange[];
  /** `true` si el envío pasó sin mostrar el resumen (`significant` sin nada importante, o `nx-review-open` cancelado). */
  silent: boolean;
}
export interface ReviewDirtyDetail {
  dirty: boolean;
  count: number;
}
