/** `nxTour()`: tipos. */

export interface TourStep {
  /** Selector CSS del elemento que se señala (`#nuevo`, `[data-tour=filtros]`). Sin él, el paso va centrado. */
  target?: string;
  title: string;
  text?: string;
}

export interface TourResult {
  /** Se llegó al último paso y se pulsó «Listo». */
  completed: boolean;
  /** El paso más avanzado que se vio (desde 0). */
  step: number;
}

export interface TourLabels {
  next: string;
  back: string;
  done: string;
  close: string;
  step: string;
}
