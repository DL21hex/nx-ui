import { define } from "../../core/define";
import { NxLauncher } from "./launcher";

define("nx-launcher", NxLauncher);

export { NxLauncher, LAUNCHER_LABELS } from "./launcher";
export { balanceColumns, firstTarget, fitColumns, matchItem, moveIndex, sparkPaths } from "./logic";
export type { LauncherItem, LauncherLabels, LauncherProgress, LauncherSelectDetail, LauncherSignal, LauncherTone, LauncherView } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-launcher": NxLauncher;
  }
  interface HTMLElementEventMap {
    "nx-launcher-select": CustomEvent<import("./types").LauncherSelectDetail>;
  }
}
