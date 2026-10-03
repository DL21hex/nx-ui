import { define } from "../../core/define";
import { NxBreadcrumb } from "./breadcrumb";

define("nx-breadcrumb", NxBreadcrumb);

export { NxBreadcrumb, BREADCRUMB_LABELS } from "./breadcrumb";
export { cleanItems as cleanBreadcrumbItems, collapseCount } from "./logic";
export type { BreadcrumbChildrenDetail, BreadcrumbItem, BreadcrumbLabels, BreadcrumbNavigateDetail, BreadcrumbVia } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-breadcrumb": NxBreadcrumb;
  }
  interface HTMLElementEventMap {
    "nx-breadcrumb-navigate": CustomEvent<import("./types").BreadcrumbNavigateDetail>;
    "nx-breadcrumb-children": CustomEvent<import("./types").BreadcrumbChildrenDetail>;
  }
}
