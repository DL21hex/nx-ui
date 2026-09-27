import { define } from "../../core/define";
import { NxGuard } from "./guard";

define("nx-guard", NxGuard);

export { NxGuard, GUARD_LABELS } from "./guard";
export { guardCheck, robustRange, guardDate, readAmount as readGuardAmount, otherReadings as guardReadings } from "./logic";
export type { GuardCheckOptions, RobustRange } from "./logic";
export type { GuardFields, GuardFinding, GuardKind, GuardLabels, GuardMode, GuardRemoteResponse, GuardRule, GuardSeverity } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-guard": NxGuard;
  }
  interface HTMLElementEventMap {
    "nx-guard-warn": CustomEvent<{ field: string; finding: import("./types").GuardFinding }>;
    "nx-guard-fix": CustomEvent<{ field: string; from: number | string | null; to: number | string }>;
    "nx-guard-ack": CustomEvent<{ field: string; value: number | string | null }>;
    "nx-guard-block": CustomEvent<{ findings: import("./types").GuardFinding[] }>;
  }
}
