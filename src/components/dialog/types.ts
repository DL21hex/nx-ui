/** `<nx-dialog>` y `nxConfirm()`: tipos. */

/** `modal`: centrado (en móvil, hoja desde abajo). `panel`: lateral y apilable. */
export type DialogMode = "modal" | "panel";
export type DialogSize = "sm" | "md" | "lg" | "full";

/** Por qué se cierra: lo decide la app en `nx-dialog-close` (cancelable). */
export type CloseReason = "button" | "escape" | "backdrop" | "drag" | "history" | "stack" | "form" | "api";

export interface DialogLabels {
  close: string;
  /** Aviso al cerrar con cambios sin guardar. */
  unsaved: string;
  discard: string;
  keep: string;
  /** `aria-label` de las migas de los paneles apilados. */
  stack: string;
}

export interface DialogCloseDetail {
  reason: CloseReason;
  value: string | undefined;
}

// ---------------------------------------------------------------- confirmación con impacto

export type ImpactTone = "neutral" | "success" | "warning" | "danger";

/** Una consecuencia de la acción: «2 recepciones · se revierten». */
export interface ImpactItem {
  label: string;
  detail?: string;
  tone?: ImpactTone;
  /** Nombre de un ícono registrado. */
  icon?: string;
}

/** Lo que transmite el endpoint de impacto, una línea por evento (NDJSON o SSE). */
export type ImpactEvent =
  | ({ type: "impact" } & ImpactItem)
  /** La acción no se puede hacer: el botón de confirmar queda bloqueado con este motivo. */
  | { type: "block"; message: string }
  /** Una nota al pie («Se notificará a 2 aprobadores»). */
  | { type: "note"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ConfirmOptions {
  heading: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` (por defecto): botón rojo y hay que mantenerlo pulsado. */
  tone?: "danger" | "primary";
  /** Las consecuencias: una lista, o una URL que las transmite (POST con `body`). */
  impact?: ImpactItem[] | string;
  body?: unknown;
  /** Milisegundos que hay que mantener pulsado el botón (0 = un clic). Por defecto 1000 si es `danger`. */
  hold?: number;
  /** De dónde nace el diálogo (el botón que lo abrió). */
  origin?: Element | null;
  labels?: Partial<ConfirmLabels>;
}

export interface ConfirmLabels {
  confirm: string;
  cancel: string;
  impact: string;
  loading: string;
  error: string;
}
