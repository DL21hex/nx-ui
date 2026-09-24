export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type LogLevel = "info" | "ok" | "warn" | "error";
/** `ticker`: el mensaje corre dentro del botón y el registro se abre a pedido. `inline`: el
 *  registro se despliega debajo mientras corre. `none`: solo el spinner. */
export type LogMode = "ticker" | "inline" | "none";

export interface LogLine {
  /** Milisegundos desde que empezó la tarea. */
  t: number;
  msg: string;
  level: LogLevel;
}

/** Una línea del stream del backend (NDJSON o `data:` de SSE). Todo es opcional. */
export interface StreamEvent {
  msg?: string;
  level?: LogLevel;
  /** 0–1 (o 0–100, que se normaliza). */
  progress?: number;
  /** Fin de la tarea. Sin él, la tarea termina cuando se cierra el stream. */
  done?: boolean;
  ok?: boolean;
}

export interface ButtonLabels {
  busy: string;
  done: string;
  failed: string;
  log: string;
  /** Descripción accesible de un botón con `hold`. */
  hold: string;
}

export interface DoneDetail {
  ok: boolean;
  /** Duración en milisegundos. */
  ms: number;
  lines: LogLine[];
}

export interface RunContext {
  log(msg: string, level?: LogLevel): void;
  progress(value: number | null): void;
}
