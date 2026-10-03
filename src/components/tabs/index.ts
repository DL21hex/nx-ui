import { define } from "../../core/define";
import { NxTabs } from "./tabs";

define("nx-tabs", NxTabs);

export { NxTabs, TABS_LABELS } from "./tabs";
export type { TabChangeDetail, TabItem, TabsLabels } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-tabs": NxTabs;
  }
  interface HTMLElementEventMap {
    "nx-tabs-change": CustomEvent<import("./types").TabChangeDetail>;
  }
}
