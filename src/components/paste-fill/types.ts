/**
 * `<nx-paste-fill>`: tipos. El formulario es del autor; el componente lee sus campos, saca los datos
 * de un texto pegado (correo, WhatsApp, firma) y los reparte. Con `endpoint`, el backend puede
 * mejorar la lectura con el mismo protocolo en streaming (NDJSON o SSE):
 *
 *   {"type":"field","name":"nit","value":"900.359.742-1","confidence":0.97,"source":{"start":120,"end":133}}
 *   {"type":"field","name":"entrega","value":"2026-10-02","confidence":0.7,"hint":"«el próximo viernes»"}
 *   {"type":"note","message":"El proveedor no existe todavía en el maestro de terceros."}
 *   {"type":"done"}            (o {"type":"error","message":"…"})
 */

/** Qué clase de dato espera un campo. Sin `kind`, se deduce del `type`, el `name` y la etiqueta. */
export type PasteKind =
  | "email"
  | "phone"
  | "nit"
  | "id"
  | "money"
  | "date"
  | "url"
  | "name"
  | "company"
  | "role"
  | "address"
  | "city"
  | "number"
  | "text";

export interface PasteOption {
  value: string;
  label: string;
}

/** Un campo del formulario, como lo ve el extractor. */
export interface PasteField {
  name: string;
  label: string;
  /** El `type` del control («text», «email», «tel», «date», «number»…) o «select» / «textarea». */
  type: string;
  kind?: PasteKind;
  /** Las opciones de un `<select>` (sin la vacía). */
  options?: PasteOption[];
}

/** Lo que se le asigna a `fields`: solo `name` es obligatorio; lo demás enriquece lo leído del formulario. */
export type PasteFieldInput = Partial<PasteField> & { name: string };

/** Un tramo del texto pegado: `text.slice(start, end)`. */
export interface PasteSource {
  start: number;
  end: number;
}

/** Un dato encontrado en el texto, antes de asignarlo a un campo. */
export interface PasteFinding {
  kind: PasteKind;
  /** Normalizado: «310 456 7890», «900.359.742-1», fecha ISO, monto como número. */
  value: string;
  start: number;
  end: number;
  confidence: number;
  hint?: string;
  /** Lo que precede al dato en su frase, sin tildes ni mayúsculas («cel», «nit», «con entrega el»). */
  ctx: string;
  /** Montos: el número y la moneda ISO. */
  num?: number;
  currency?: string;
  /** Teléfonos: celular o fijo. */
  mobile?: boolean;
}

/** Un valor para un campo: lo que arma el extractor local o lo que manda el servidor. */
export interface PasteFill {
  name: string;
  value: string;
  confidence: number;
  source?: PasteSource;
  hint?: string;
}

export type PasteEvent =
  | ({ type: "field" } & PasteFill)
  | { type: "note"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };

/** Los avisos del extractor (van en `labels`, así se traducen con el resto). */
export interface PasteHints {
  /** «El dígito de verificación no cuadra: con {base} debería ser {dv}» */
  nitBad: string;
  /** «Sin dígito de verificación: se calculó ({dv})» */
  nitCalc: string;
  /** «También aparece «{other}»» */
  several: string;
  /** «Se agregó el indicativo {code}» */
  oldPhone: string;
  /** «Sin indicativo de ciudad» */
  shortPhone: string;
  /** «Calculada desde hoy: «{text}»» */
  relative: string;
  /** «Sin año: se asumió {year}» */
  noYear: string;
  /** «Es donde se expidió la cédula» */
  issued: string;
}

export interface PasteFillLabels extends PasteHints {
  zone: string;
  /** «o presiona {mod}+V sobre el formulario, o arrastra el texto» */
  zoneHint: string;
  paste: string;
  fill: string;
  drop: string;
  reading: string;
  server: string;
  /** «{n} campos llenados» */
  filled: string;
  filledOne: string;
  none: string;
  /** «{n} por revisar» */
  review: string;
  /** «{n} con sugerencia» */
  suggestions: string;
  evidence: string;
  /** El nombre de la región con el texto pegado. */
  pasted: string;
  undo: string;
  undone: string;
  close: string;
  confirm: string;
  reviewChip: string;
  use: string;
  keep: string;
  /** «Sugerencia: {value}» */
  suggestion: string;
  serverError: string;
  /** «Confianza {pct}» */
  confidence: string;
  confirmed: string;
  same: string;
  /** «Tienes «{value}»»: lo que la persona había escrito, junto a una sugerencia. */
  yours: string;
  /** Lo que el lector de pantalla oye de un campo llenado: «Llenado desde el texto pegado». */
  fromText: string;
}

export interface PasteFillDoneDetail {
  /** Los valores que quedaron en los campos que se llenaron. */
  values: Record<string, string>;
  /** Todo lo que se encontró, se haya aplicado o haya quedado como sugerencia. */
  fields: { name: string; value: string; confidence: number }[];
}

export type PasteFillState = "idle" | "busy" | "filled";
