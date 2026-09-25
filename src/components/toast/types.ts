/** `nxToast()`: tipos. */

export type ToastTone = "neutral" | "success" | "warning" | "danger";
/** Cómo terminó un aviso. Con `undo`, todo lo que no sea `"undo"` significa «hazlo». */
export type ToastResult = "undo" | "action" | "timeout" | "dismiss";

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Ofrece «Deshacer» (también Ctrl+Z) mientras corre el tiempo. */
  undo?: boolean;
  /** Un botón propio: la promesa se resuelve con `"action"`. */
  action?: string;
  /** Milisegundos a la vista (por defecto 5000; 7000 con deshacer). 0 = hasta cerrarlo. */
  duration?: number;
  /** Cierra el aviso desde el código (se resuelve con `"dismiss"`): p. ej. el componente que lo
   *  pidió salió del DOM y ya confirmó la acción. */
  signal?: AbortSignal;
}

export interface ToastLabels {
  undo: string;
  undone: string;
  dismiss: string;
  region: string;
}
