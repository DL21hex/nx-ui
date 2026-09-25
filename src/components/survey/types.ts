/**
 * `<nx-survey>`: tipos. La encuesta es JSON (BDUI): el backend manda las preguntas y recibe las
 * respuestas; los resultados vuelven en la misma forma que arma `aggregate()`.
 */

/** Una opción de `choice`, `multi` o `rank`. */
export interface SurveyOption {
  value: string;
  label: string;
  /** Un emoji o dos letras que acompañan la opción («🚚», «AM»). */
  emoji?: string;
  hint?: string;
}

/** Cuándo se muestra una pregunta: según la respuesta a otra. */
export interface SurveyCondition {
  question: string;
  /** Igual a (texto o número), o incluido (con `multi`). */
  equals?: string | number;
  /** Alguno de estos valores. */
  in?: (string | number)[];
  /** Número: menor o mayor que. */
  lt?: number;
  gt?: number;
  /** Respondida (o no, con `false`). */
  answered?: boolean;
}

export type SurveyType = "choice" | "multi" | "scale" | "rating" | "text" | "rank" | "slider";

export interface SurveyQuestion {
  id: string;
  type: SurveyType;
  /** El enunciado. `{{id}}` inserta la respuesta a otra pregunta («¿Qué mejorarías de {{area}}?»). */
  title: string;
  description?: string;
  required?: boolean;
  /** `choice`, `multi`, `rank`. */
  options?: SurveyOption[];
  /** `choice` y `multi`: agrega «Otra…» con texto libre. */
  other?: boolean;
  /** `multi`: mínimo y máximo de opciones. `text`: mínimo y máximo de caracteres. `scale`, `slider`: el rango. */
  min?: number;
  max?: number;
  step?: number;
  /** `scale`: textos de los extremos («Nada probable», «Muy probable»). */
  minLabel?: string;
  maxLabel?: string;
  /** `scale`: 0–10 con los colores de NPS (detractores, pasivos, promotores). */
  nps?: boolean;
  /** `rating`: estrellas (por defecto) o caras. */
  icon?: "star" | "face";
  /** `text`: varias líneas. */
  long?: boolean;
  placeholder?: string;
  /** `slider`: formato del valor (número, monto o porcentaje) y moneda. */
  format?: "number" | "money" | "percent";
  currency?: string;
  /** `slider`: unidad detrás del número («h», «km»). */
  unit?: string;
  when?: SurveyCondition | SurveyCondition[];
}

/** Lo que se le pasa a `questions`: las opciones también pueden ser texto (`["Sí", "No"]`). */
export type SurveyQuestionInput = Omit<SurveyQuestion, "options"> & { options?: (SurveyOption | string)[] };

/** Una respuesta: texto (`choice`, `text`), números (`scale`, `rating`, `slider`) o listas (`multi`, `rank`). */
export type SurveyAnswer = string | number | string[];
export type SurveyAnswers = Record<string, SurveyAnswer>;

/** Resultados de una pregunta. */
export interface SurveyQuestionResult {
  /** Respuestas que recibió. */
  n: number;
  /** `choice`, `multi`, `scale`, `rating`: cuántas por valor. */
  counts?: Record<string, number>;
  /** `scale`, `rating`, `slider`: promedio. `rank`: posición promedio por opción. */
  avg?: number;
  ranks?: Record<string, number>;
  /** `scale` con `nps`. */
  nps?: { score: number; promoters: number; passives: number; detractors: number };
  /** `text`: las palabras más repetidas. */
  words?: [string, number][];
}

export interface SurveyResults {
  /** Personas que respondieron (incluida la actual, si ya envió). */
  total: number;
  questions: Record<string, SurveyQuestionResult>;
}

export interface SurveySubmitDetail {
  answers: SurveyAnswers;
  /** Milisegundos desde la primera pregunta. */
  ms: number;
}

export interface SurveyLabels {
  start: string;
  next: string;
  back: string;
  submit: string;
  sending: string;
  required: string;
  /** «Elige al menos {n}» */
  minChoices: string;
  /** «Hasta {n}» */
  maxChoices: string;
  /** «Mínimo {n} caracteres» */
  minLength: string;
  other: string;
  otherPlaceholder: string;
  /** «{n} preguntas · {min} min» */
  meta: string;
  /** «Pregunta {i} de {n}» */
  progress: string;
  /** «Arrastra o usa ↑↓ para ordenar» */
  rankHint: string;
  thanks: string;
  thanksDetail: string;
  results: string;
  /** «{n} respuestas» */
  responses: string;
  you: string;
  /** «Promedio {avg}» */
  average: string;
  error: string;
  resume: string;
  restart: string;
  faces: string[];
  words: string;
  /** Volver a una respuesta para cambiarla. */
  edit: string;
  skipped: string;
  /** El nombre de la lista de respuestas ya dadas. */
  given: string;
  /** «Ver {n} respuestas anteriores» */
  earlier: string;
}

