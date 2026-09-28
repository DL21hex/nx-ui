/**
 * `<nx-signature>`: tipos. Lo que entra es JSON (BDUI): atributos simples, `labels` y, para mostrar
 * una firma ya guardada, `value` (`{svg, meta}` o el SVG). Lo que sale es el SVG (la fuente de
 * verdad), sus metadatos y, si se pide, un PNG.
 */

/** Con qué se firmó. `pointer` cuando no se sabe (una firma cargada, o escrita con el teclado). */
export type SignatureDevice = "pointer" | "touch" | "pen" | "mouse";

/** Un punto del trazo: posición en px CSS de la zona de firma, tiempo en ms y presión (0–1; 0,5 sin lápiz). */
export interface SignaturePoint {
  x: number;
  y: number;
  t: number;
  p: number;
}

/** Un trazo: del momento en que el dedo (o el lápiz, o el mouse) toca hasta que se levanta. */
export interface SignatureStroke {
  type: SignatureDevice;
  points: SignaturePoint[];
}

/** Dónde se firmó (si se pidió con `geo` y la persona lo permitió). */
export interface SignatureGeo {
  lat: number;
  lng: number;
  accuracy?: number;
}

export interface SignatureMeta {
  /** Cuándo se firmó (ISO 8601). Vacío en un SVG cargado sin metadatos. */
  signedAt: string;
  name?: string;
  id?: string;
  /** La firma es el nombre escrito (tipográfica), no un trazo. */
  typed: boolean;
  strokes: number;
  points: number;
  /** Tamaño del SVG (recortado a lo firmado, con margen). */
  width: number;
  height: number;
  device: SignatureDevice;
  /** SHA-256 (hex) del texto firmado normalizado + `signedAt`: prueba qué se firmó. No es una firma electrónica certificada. */
  hash?: string;
  geo?: SignatureGeo;
}

/** El valor completo: el SVG y sus metadatos. Es lo que viaja por defecto al <form> (`value-format="json"`). */
export interface SignatureValue {
  svg: string;
  meta: SignatureMeta;
}

/** `nx-signature-done`: la firma confirmada. */
export type SignatureDoneDetail = SignatureValue;

/** Lo que el <form> recibe: el JSON (`{svg, meta}`), el SVG, o el PNG como archivo. */
export type SignatureFormat = "json" | "svg" | "png";

/** Lo que exige una firma «de verdad» (`required`): longitud del trazo y tamaño mínimos, en px. */
export interface SignatureMinimum {
  length: number;
  width: number;
  height: number;
}

export interface SignatureLabels {
  /** Leyenda bajo la línea. */
  here: string;
  /** `aria-label` de la zona de firma, vacía y con firma. */
  pad: string;
  padSigned: string;
  undo: string;
  clear: string;
  /** Pasar a la firma escrita, y volver al trazo. */
  type: string;
  draw: string;
  /** El campo de la firma escrita. */
  typed: string;
  name: string;
  id: string;
  confirm: string;
  again: string;
  /** «Firmado el {date}». */
  signedAt: string;
  phone: string;
  required: string;
  /** Un punto o una raya no son una firma. */
  short: string;
  nameRequired: string;
  idRequired: string;
}
