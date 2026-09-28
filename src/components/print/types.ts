/**
 * `<nx-print>`: tipos. La paginación es pura: entra la altura de cada bloque (y de cada fila de las
 * tablas) con sus reglas de corte, sale qué va en cada página.
 */

/** Tamaños con nombre. `legal` es el Legal de EE. UU. (8,5 × 14 in); `oficio`, el de Colombia (21,6 × 33 cm). */
export type PrintSizeName = "letter" | "a4" | "a5" | "legal" | "oficio" | "half-letter";
export type PrintOrientation = "portrait" | "landscape";
/** `"fit"` (ajustar al ancho, sin pasar de 100 %) o un factor: 1 es el tamaño real. */
export type PrintZoom = "fit" | number;

/** Una tabla que se puede partir entre páginas. Alturas en px. */
export interface PrintTable {
  /** El `<thead>`: se repite en cada página. */
  head: number;
  /** Cada fila del cuerpo (lo que avanza: su alto más el espacio hasta la siguiente). */
  rows: number[];
  /** El `<tfoot>`: solo al final de la tabla. */
  foot?: number;
  /** El `<caption>`: solo en el primer pedazo. */
  caption?: number;
  /** Lo que cada pedazo suma aparte (bordes, `border-spacing`). */
  extra?: number;
  /** La fila «Van» / «Vienen» (solo si hay `sums`). */
  carry?: number;
  /** Por fila, el valor de cada columna que suma (`data-print-sum`), en el mismo orden. */
  sums?: number[][];
}

/** Un bloque del documento: un hijo del elemento. Alturas en px. */
export interface PrintBlock {
  height: number;
  /** El espacio hasta el bloque siguiente (márgenes colapsados). */
  gap?: number;
  /** `data-print-keep` o `break-inside: avoid`: no se parte (salvo que no quepa en una página). */
  keep?: boolean;
  /** `data-print-keep-with-next` o `break-after: avoid`: va en la misma página que el comienzo del siguiente. */
  keepWithNext?: boolean;
  /** `data-print-break="before"` o `break-before: page`. */
  breakBefore?: boolean;
  /** `data-print-break="after"` o `break-after: page`. */
  breakAfter?: boolean;
  table?: PrintTable;
}

/** Lo que va en una página: un bloque entero, un pedazo de tabla o una tajada de un bloque gigante. */
export interface PrintPiece {
  block: number;
  /** Tabla: las filas `[from, to)`. */
  from?: number;
  to?: number;
  /** Tabla: el primer pedazo (lleva el `<caption>`) y el último (lleva el `<tfoot>`). */
  first?: boolean;
  last?: boolean;
  /** «Vienen»: lo sumado en las páginas anteriores, por columna. */
  carryIn?: number[];
  /** «Van»: lo sumado hasta el final de esta página, por columna. */
  carryOut?: number[];
  /** Bloque más alto que una página: se ve desde `offset`, `clip` px. */
  offset?: number;
  clip?: number;
}

export interface PrintPaginateOptions {
  /** El alto útil de cada página (sin márgenes, encabezado ni pie), en px. */
  pageHeight: number;
  /** Viudas y huérfanas: filas mínimas de una tabla en cada página que la parte (2). */
  minRows?: number;
  /** Tope de páginas (5000): nunca un bucle sin fin. */
  maxPages?: number;
}

export interface PrintLabels {
  toolbar: string;
  print: string;
  pdf: string;
  /** Se muestra mientras está abierto el diálogo pedido con «Guardar como PDF». */
  pdfHint: string;
  zoomIn: string;
  zoomOut: string;
  fit: string;
  actual: string;
  /** «{n} páginas» */
  pages: string;
  pagesOne: string;
  /** «Página {page} de {pages}», bajo cada hoja. */
  page: string;
  /** Al pie de una página que parte una tabla con sumas. */
  carriedOut: string;
  /** Al comienzo de la siguiente. */
  carriedIn: string;
}

export interface PrintPaginateDetail {
  pages: number;
}
