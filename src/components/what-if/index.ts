import { define } from "../../core/define";
import { NxWhatIf } from "./what-if";

define("nx-what-if", NxWhatIf);

export { NxWhatIf, WHAT_IF_LABELS } from "./what-if";
export { bestOf as whatIfBest, chartPaths as whatIfChart, deltaText as whatIfDelta, parseEvent as parseWhatIfEvent, stepValue as whatIfStep, valueText as whatIfText } from "./logic";
export type { ChartPaths as WhatIfChartPaths } from "./logic";
export type { WhatIfBetter, WhatIfChangeDetail, WhatIfComputeDetail, WhatIfEvent, WhatIfFormat, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfNote, WhatIfPoint, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfSpec, WhatIfTone, WhatIfValues } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-what-if": NxWhatIf;
  }
  interface HTMLElementEventMap {
    "nx-what-if-compute": CustomEvent<import("./types").WhatIfComputeDetail>;
    "nx-what-if-save": CustomEvent<import("./types").WhatIfSaveDetail>;
    "nx-what-if-change": CustomEvent<import("./types").WhatIfChangeDetail>;
  }
}
