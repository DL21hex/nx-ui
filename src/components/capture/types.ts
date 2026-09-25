/**
 * Captura inteligente de documentos. El backend (OCR, un modelo, lo que sea) lee el documento y
 * transmite lo que encuentra con el mismo transporte que la IA de nx-ui (NDJSON o SSE):
 *
 *   {"type":"page","n":1,"src":"/docs/7/p1.png","width":1240,"height":1754}
 *   {"type":"field","key":"nit","value":"900.123.456-7","confidence":0.99,
 *    "box":{"page":1,"x":0.06,"y":0.07,"w":0.2,"h":0.02},"detail":"Dígito de verificación correcto"}
 *   {"type":"field","key":"vence","value":"12/1O/2026","confidence":0.61,"box":{…},
 *    "hint":"¿«O» en lugar de «0»?","suggest":"12/10/2026"}
 *   {"type":"field","key":"items.0.cantidad","value":"40","confidence":0.95,"box":{…}}
 *   {"type":"check","id":"iva","status":"ok","message":"El IVA es el 19 % del subtotal","fields":["iva","subtotal"]}
 *   {"type":"check","id":"precio","status":"warn","message":"…","fields":["items.0.unitario"]}
 *   {"type":"done"}            (o {"type":"error","message":"…"})
 *
 * `box` está en coordenadas 0–1 de la página (x, y: esquina superior izquierda). Una celda de
 * una tabla se nombra `tabla.fila.columna`.
 */
export type CaptureFieldType = "text" | "date" | "number" | "money";

export interface CaptureField {
  key: string;
  label: string;
  type?: CaptureFieldType;
  /** Título del grupo; los campos consecutivos con la misma sección van juntos. */
  section?: string;
  required?: boolean;
}

export interface CaptureTableColumn {
  key: string;
  label: string;
  type?: CaptureFieldType;
}

export interface CaptureTable {
  key: string;
  label: string;
  type: "table";
  columns: CaptureTableColumn[];
  section?: string;
}

export type CaptureSchemaItem = CaptureField | CaptureTable;

export interface CaptureBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CheckStatus = "ok" | "warn" | "error";

export type CaptureEvent =
  | { type: "page"; n: number; src: string; width: number; height: number }
  | { type: "field"; key: string; value: string; confidence: number; box?: CaptureBox; detail?: string; hint?: string; suggest?: string }
  | { type: "check"; id: string; status: CheckStatus; message: string; fields: string[] }
  | { type: "error"; message: string }
  | { type: "done" };

export interface CaptureLabels {
  dropTitle: string;
  dropHint: string;
  choose: string;
  reading: string;
  /** «{n} campos leídos en {t}» */
  read: string;
  /** «{n} por revisar» */
  pending: string;
  /** «{n} con aviso» (validaciones `warn`, no bloquean) */
  warnings: string;
  ready: string;
  submit: string;
  confirm: string;
  confirmedByYou: string;
  /** «Usar {value}» */
  use: string;
  checks: string;
  error: string;
  again: string;
  zoomIn: string;
  zoomOut: string;
  /** «El archivo pasa de {max}» (atributo `max-size`). */
  tooBig: string;
  /** Un archivo que no cumple `accept`. */
  badType: string;
}

export type CaptureValues = Record<string, string | Record<string, string>[]>;

export interface CaptureSubmitDetail {
  values: CaptureValues;
  /** Claves que una persona confirmó o corrigió. */
  confirmed: string[];
  checks: { id: string; status: CheckStatus; message: string }[];
}
