import { define } from "../../core/define";
import { NxDocCapture } from "./doc-capture";

define("nx-doc-capture", NxDocCapture);

export { NxDocCapture, CAPTURE_LABELS } from "./doc-capture";
export { parseCaptureEvent } from "./logic";
export type {
  CaptureBox,
  CaptureEvent,
  CaptureField,
  CaptureFieldType,
  CaptureLabels,
  CaptureSchemaItem,
  CaptureSubmitDetail,
  CaptureTable,
  CaptureTableColumn,
  CaptureValues,
  CheckStatus,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-doc-capture": NxDocCapture;
  }
  interface HTMLElementEventMap {
    "nx-capture-file": CustomEvent<{ file: File }>;
    "nx-capture-start": CustomEvent<{ fileName: string }>;
    "nx-capture-done": CustomEvent<{ values: import("./types").CaptureValues; pending: string[] }>;
    "nx-capture-change": CustomEvent<{ key: string; value: string; values: import("./types").CaptureValues }>;
    "nx-capture-submit": CustomEvent<import("./types").CaptureSubmitDetail>;
  }
}
