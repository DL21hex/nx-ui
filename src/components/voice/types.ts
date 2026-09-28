/**
 * `<nx-voice>`: tipos. Lo que entra es JSON (BDUI): a quién se le dicta (`for`), el motor, cómo se
 * habla y los textos. Lo que sale son eventos con lo que se entendió.
 */

/** Quién reconoce la voz. `auto`: el del navegador si lo hay; si no, el servidor (`endpoint`). */
export type VoiceEngine = "auto" | "browser" | "server";

/** Dónde va la transcripción: al lado del botón (`inline`) o debajo (`stacked`). */
export type VoiceLayout = "inline" | "stacked";

/** En qué está. `unavailable`: ni el navegador ni el servidor sirven (el botón no aparece). */
export type VoiceState = "idle" | "asking" | "listening" | "processing" | "error" | "unavailable";

/** Por qué falló. */
export type VoiceErrorCode =
  /** La persona (o la política del sitio) negó el micrófono. */
  | "not-allowed"
  /** No se oyó nada, o nada que se entendiera. */
  | "no-speech"
  /** Sin conexión (la voz de Chrome se reconoce en los servidores de Google). */
  | "network"
  /** No hay micrófono, u otra aplicación lo tiene. */
  | "no-mic"
  /** El servidor (`endpoint`) respondió con un error. */
  | "server"
  /** Cualquier otra cosa (idioma no soportado, un fallo del motor). */
  | "failed";

/** `nx-voice-text`: lo que se entendió (cancelable: si se cancela, no se entrega a `for`). */
export interface VoiceTextDetail {
  text: string;
  /** 0–1 según el motor, o `null` si no la dio. */
  confidence: number | null;
  /** `false` si el reconocimiento terminó (tope de tiempo, pestaña oculta) sin un resultado definitivo:
   *  se entrega lo último que se alcanzó a oír. */
  final: boolean;
}

export interface VoiceErrorDetail {
  code: VoiceErrorCode;
  message: string;
}

/** `nx-voice-end`: terminó (con o sin texto). `canceled`: por `cancel()`, Escape o al desconectarse. */
export interface VoiceEndDetail {
  text: string;
  canceled: boolean;
}

/** Un atajo de página ya leído («Alt+V» → `{key: "v", alt: true, …}`). */
export interface VoiceHotkey {
  key: string;
  alt: boolean;
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
}

/** El resultado de dictar en un campo de texto: el valor nuevo, dónde queda el cursor y el tramo que
 *  se insertó (para «borrar eso» en el siguiente dictado). */
export interface DictationEdit {
  value: string;
  caret: number;
  range: [number, number] | null;
}

/** Una línea de la respuesta del servidor: `{partial}` mientras transcribe, `{text}` al final, o `{error}`. */
export type VoiceServerLine = { partial: string } | { text: string; confidence: number | null } | { error: string };

export interface VoiceLabels {
  /** Nombre del botón en reposo y mientras escucha. */
  dictate: string;
  stop: string;
  /** La ayuda junto al botón: «Toca para dictar», «Mantén presionado para dictar». */
  tap: string;
  hold: string;
  asking: string;
  listening: string;
  processing: string;
  /** Resumen de lo que llenó `<nx-paste-fill>`: «Llené {n} campos», «Llené 1 campo». */
  filled: string;
  filledOne: string;
  none: string;
  undo: string;
  undone: string;
  /** Lo que oye el lector de pantalla al terminar: «Dictado: {text}». */
  heard: string;
  notAllowed: string;
  noSpeech: string;
  network: string;
  noMic: string;
  server: string;
  failed: string;
}
