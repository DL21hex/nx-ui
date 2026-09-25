import { define } from "../../core/define";
import { NxScan } from "./scan";

define("nx-scan", NxScan);

export { NxScan, SCAN_LABELS } from "./scan";
export {
  DEFAULT_FORMATS as SCAN_FORMATS,
  WEDGE as WEDGE_TIMING,
  addRead as addScanRead,
  cleanItems as cleanScanItems,
  formatName as scanFormatName,
  gtinValid,
  itemStatus as scanItemStatus,
  parseEntry as parseScanEntry,
  setQty as setScanQty,
  totals as scanTotals,
  wedgeKey,
} from "./logic";
export type { WedgeState } from "./logic";
export type { ScanCountDetail, ScanDetail, ScanItem, ScanItemStatus, ScanLabels, ScanMode, ScanProblem, ScanProduct, ScanState, ScanTotals, ScanVia, ScanWedge } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-scan": NxScan;
  }
  interface HTMLElementEventMap {
    "nx-scan": CustomEvent<import("./types").ScanDetail>;
    "nx-scan-count": CustomEvent<import("./types").ScanCountDetail>;
    "nx-scan-error": CustomEvent<{ problem: import("./types").ScanProblem }>;
  }
}
