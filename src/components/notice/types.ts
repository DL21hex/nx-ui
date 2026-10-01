/** `<nx-notice>`: tipos. */

/** `info` (por defecto), `success`, `warning` o `danger`. */
export type NoticeTone = "info" | "success" | "warning" | "danger";

export interface NoticeActionDetail {
  /** El texto del botón que se pulsó. */
  action: string;
}
