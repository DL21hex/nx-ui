/**
 * Protocolo de streaming de IA de nx-ui. Una línea = un evento (NDJSON, o `data:` de SSE). Es
 * independiente del modelo: cualquier backend que emita estas líneas sirve.
 *
 *   {"type":"step","id":"s1","label":"Consultando costos","status":"run"}
 *   {"type":"step","id":"s1","status":"done","detail":"1.248 filas"}
 *   {"type":"text","delta":"El costo subió **11,4 %**[^1] por…"}
 *   {"type":"source","id":"1","title":"Libro mayor · agosto","detail":"cuenta 7105","href":"/…"}
 *   {"type":"action","label":"Ver las órdenes","href":"/compras/oc?proveedor=12"}
 *   {"type":"action","label":"Redactar reclamo","id":"reclamo","data":{"proveedor":12}}
 *   {"type":"note","label":"cifras verificadas","tone":"success"}
 *   {"type":"error","message":"El modelo no respondió"}
 *   {"type":"done"}
 *
 * En el texto, `[^id]` es una cita a la fuente `id`. Markdown mínimo: **negrita**, `código`,
 * listas con «- » y párrafos separados por una línea en blanco. Nunca se interpreta HTML.
 */
export type AiStepStatus = "run" | "done" | "error";
export type AiTone = "neutral" | "success" | "warning" | "danger";

export type AiEvent =
  | { type: "step"; id: string; label?: string; status: AiStepStatus; detail?: string }
  | { type: "text"; delta: string }
  | { type: "source"; id: string; title: string; detail?: string; href?: string }
  | { type: "action"; label: string; href?: string; id?: string; data?: unknown; icon?: string }
  | { type: "note"; label: string; tone: AiTone }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AiStep {
  id: string;
  label: string;
  status: AiStepStatus;
  detail?: string;
  /** Milisegundos que tardó (de `run` a `done`/`error`). */
  ms?: number;
}

export interface AiLabels {
  placeholder: string;
  ask: string;
  stop: string;
  thought: string;
  steps: string;
  sources: string;
  useful: string;
  notUseful: string;
  error: string;
  stopped: string;
  ready: string;
}

export interface AiDoneDetail {
  question: string;
  text: string;
  sources: { id: string; title: string; detail?: string; href?: string }[];
  /** `done`, `error` o `stopped`. */
  status: "done" | "error" | "stopped";
}

export interface AiActionDetail {
  id: string;
  label: string;
  data: unknown;
}

export interface AiFeedbackDetail {
  value: "up" | "down";
  question: string;
  text: string;
}
