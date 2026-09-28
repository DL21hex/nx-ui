import { define } from "../../core/define";
import { NxReview } from "./review";

define("nx-review", NxReview);

export { NxReview, REVIEW_LABELS } from "./review";
export {
  diffReview,
  describeReview,
  describeChange as describeReviewChange,
  countReview,
  countChanges as countReviewChanges,
  groupReview,
  reviewShouldOpen,
  reviewRowName,
  reviewName,
  reviewValueText,
  flattenReview,
  sameReviewValue,
} from "./logic";
export type { ReviewDescribeOptions, ReviewDiff, ReviewRowRef, ReviewRowsDiff } from "./logic";
export type { ReviewChange, ReviewConfirmDetail, ReviewDelta, ReviewDirtyDetail, ReviewKind, ReviewLabels, ReviewMeta, ReviewMode, ReviewOpenDetail, ReviewReason, ReviewRow, ReviewRows, ReviewValue, ReviewValues } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-review": NxReview;
  }
  interface HTMLElementEventMap {
    "nx-review-open": CustomEvent<import("./types").ReviewOpenDetail>;
    "nx-review-confirm": CustomEvent<import("./types").ReviewConfirmDetail>;
    "nx-review-cancel": CustomEvent<{ changes: import("./types").ReviewChange[] }>;
    "nx-review-dirty": CustomEvent<import("./types").ReviewDirtyDetail>;
  }
}
