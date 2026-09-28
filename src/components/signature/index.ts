import { define } from "../../core/define";
import { NxSignature } from "./signature";

define("nx-signature", NxSignature);

export { NxSignature, SIGNATURE_LABELS } from "./signature";
export {
  SIGNATURE_FONT,
  SIGNATURE_INK,
  SIGNATURE_MIN,
  SIGNATURE_PEN,
  cleanSignatureMeta,
  normalizeSignedText,
  parseSignatureValue,
  signatureBounds,
  signatureCheck,
  signatureDate,
  signatureHash,
  signaturePath,
  signatureSVG,
  signatureWidth,
  smoothSignaturePoints,
  strokeWidths as signatureStrokeWidths,
  typedSignatureSVG,
} from "./logic";
export type {
  SignatureDevice,
  SignatureDoneDetail,
  SignatureFormat,
  SignatureGeo,
  SignatureLabels,
  SignatureMeta,
  SignatureMinimum,
  SignaturePoint,
  SignatureStroke,
  SignatureValue,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-signature": NxSignature;
  }
  interface HTMLElementEventMap {
    "nx-signature-change": CustomEvent<{ empty: boolean }>;
    "nx-signature-done": CustomEvent<import("./types").SignatureDoneDetail>;
  }
}
