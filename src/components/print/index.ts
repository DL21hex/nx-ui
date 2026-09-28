import { define } from "../../core/define";
import { NxPrint } from "./print";

define("nx-print", NxPrint);

export { NxPrint, PRINT_LABELS } from "./print";
export { fillPageText, paginatePrint, parsePrintMargin, parsePrintSize, PRINT_SIZES } from "./logic";
export type { PrintBlock, PrintLabels, PrintOrientation, PrintPaginateDetail, PrintPaginateOptions, PrintPiece, PrintSizeName, PrintTable, PrintZoom } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-print": NxPrint;
  }
  interface HTMLElementEventMap {
    "nx-print-paginate": CustomEvent<import("./types").PrintPaginateDetail>;
    "nx-print-before": CustomEvent<import("./types").PrintPaginateDetail>;
    "nx-print-after": CustomEvent<import("./types").PrintPaginateDetail>;
  }
}
