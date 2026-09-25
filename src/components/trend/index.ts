import { define } from "../../core/define";
import { NxTrend } from "./trend";

define("nx-trend", NxTrend);

export { NxTrend, TREND_LABELS } from "./trend";
export { detectAnomalies, explainContext as trendContext, niceTicks, periodLabel, summarize as summarizeTrend, whyQuestion as trendQuestion } from "./logic";
export type { TrendAnomaly, TrendContext, TrendFlag, TrendFormat, TrendKind, TrendLabels, TrendPoint, TrendSeries, TrendWhyDetail } from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-trend": NxTrend;
  }
  interface HTMLElementEventMap {
    "nx-trend-why": CustomEvent<import("./types").TrendWhyDetail>;
    "nx-trend-toggle": CustomEvent<{ id: string; visible: boolean }>;
  }
}
