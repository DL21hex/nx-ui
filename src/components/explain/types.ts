/**
 * `<nx-explain>`: tipos y protocolo. «¿De dónde sale este número?»: el backend lo desglosa, una
 * línea por evento (NDJSON, o `data:` de SSE), igual que la IA:
 *
 *   {"type":"value","label":"Total factura FE-10482","value":10829000,"format":"money","currency":"COP"}
 *   {"type":"term","label":"Subtotal","value":9100000,"source":"mayor","explain":"/explicar/subtotal?f=10482"}
 *   {"type":"term","label":"IVA 19 %","value":1729000,"detail":"19 % de $ 9.100.000"}
 *   {"type":"term","label":"Retención en la fuente","value":227500,"op":"-"}
 *   {"type":"compare","label":"agosto","value":9500000,"better":"down"}
 *   {"type":"source","id":"mayor","title":"Libro mayor · septiembre","detail":"cuenta 4135","href":"/…"}
 *   {"type":"text","delta":"Subió por el IVA de la lámina importada[^mayor]."}
 *   {"type":"note","label":"cifras del cierre","tone":"success"}
 *   {"type":"done"}
 *
 * Los términos se comprueban: si sumados no dan la cifra, se avisa. Un término con `explain` se
 * abre en su propio desglose (y así hasta el origen); uno con `href`, lleva al documento.
 */
export type ExplainFormat = "money" | "number" | "percent";
export type ExplainTone = "neutral" | "success" | "warning" | "danger";
/** Cómo entra el término en la cifra. `+` por defecto; `=` es un resultado intermedio (no suma). */
export type ExplainOp = "+" | "-" | "×" | "÷" | "=";

/** Cómo se muestra un valor: `format` y `currency` (ISO «COP», o un símbolo). */
export interface ExplainNumber {
  value: number | string;
  format?: ExplainFormat;
  currency?: string;
}

export type ExplainEvent =
  | ({ type: "value"; label?: string; detail?: string } & ExplainNumber)
  | ({ type: "term"; label: string; op?: ExplainOp; detail?: string; source?: string; href?: string; explain?: string } & ExplainNumber)
  /** El valor contra el que se comprueban los términos (por defecto, el de `value`). */
  | { type: "total"; value: number }
  /** Una comparación: la cifra de otro período. `better` dice si subir es bueno (`up`) o malo (`down`). */
  | { type: "compare"; label: string; value: number; better?: "up" | "down" }
  | { type: "source"; id: string; title: string; detail?: string; href?: string }
  | { type: "text"; delta: string }
  | { type: "note"; label: string; tone: ExplainTone }
  | { type: "error"; message: string }
  | { type: "done" };

export type ExplainTerm = Extract<ExplainEvent, { type: "term" }>;

/** Lo que se lleva armado de un desglose (una cifra). */
export interface ExplainState {
  head: Extract<ExplainEvent, { type: "value" }> | null;
  terms: ExplainTerm[];
  total: number | null;
  compare: Extract<ExplainEvent, { type: "compare" }>[];
  sources: Extract<ExplainEvent, { type: "source" }>[];
  text: string;
  notes: Extract<ExplainEvent, { type: "note" }>[];
  error: string | null;
  done: boolean;
}

export interface ExplainLabels {
  /** Nombre accesible del disparador («Ver de dónde sale»). */
  trigger: string;
  dialog: string;
  loading: string;
  error: string;
  back: string;
  sources: string;
  /** «Cuadra»: los términos suman la cifra. */
  balanced: string;
  /** «Los términos suman {sum}, no {total}». */
  unbalanced: string;
  /** «vs. {label}» */
  versus: string;
  drill: string;
  close: string;
}
