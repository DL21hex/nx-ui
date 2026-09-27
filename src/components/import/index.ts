import { define } from "../../core/define";
import { NxImport } from "./import";

define("nx-import", NxImport);

export { NxImport, IMPORT_LABELS } from "./import";
export {
  parseCsv,
  detectDelimiter as detectCsvDelimiter,
  decodeBytes as decodeImportBytes,
  detectHeaderRow,
  buildTable as buildImportTable,
  autoMap as autoMapColumns,
  cleanColumns as cleanImportColumns,
  normalizeValue as normalizeImportValue,
  validateRows as validateImportRows,
  importValidator,
  parseNumber as parseImportNumber,
  parseDate as parseImportDate,
  excelSerialDate,
  rememberMapping as rememberImportMapping,
  recallMapping as recallImportMapping,
  toCsv as importRowsToCsv,
  IMPORT_MESSAGES,
} from "./logic";
export type {
  ImportCell,
  ImportColumn,
  ImportColumnInput,
  ImportDoneDetail,
  ImportErrorCode,
  ImportErrorDetail,
  ImportLabels,
  ImportMappedDetail,
  ImportMapping,
  ImportMatch,
  ImportMatchBy,
  ImportMessages,
  ImportOption,
  ImportParsedDetail,
  ImportRowCheck,
  ImportServerError,
  ImportSkipped,
  ImportState,
  ImportTable,
  ImportType,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-import": NxImport;
  }
  interface HTMLElementEventMap {
    "nx-import-parsed": CustomEvent<import("./types").ImportParsedDetail>;
    "nx-import-mapped": CustomEvent<import("./types").ImportMappedDetail>;
    "nx-import-done": CustomEvent<import("./types").ImportDoneDetail>;
    "nx-import-error": CustomEvent<import("./types").ImportErrorDetail>;
  }
}
