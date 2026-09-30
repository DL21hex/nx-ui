/** `<Trend>` para SolidJS: envuelve `<nx-trend>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/trend/index";
import type { NxTrend } from "../components/trend/trend";
import type { TrendAnomaly, TrendFormat, TrendKind, TrendLabels, TrendSeries, TrendWhyDetail } from "../components/trend/types";

export type { NxTrend, TrendAnomaly, TrendFormat, TrendKind, TrendLabels, TrendSeries, TrendWhyDetail };

export interface TrendProps extends Omit<JSX.HTMLAttributes<NxTrend>, "onToggle"> {
  /** `{id, label, points: {x, y}[], format?, currency?, kind?, muted?, hidden?}`. */
  series: TrendSeries[];
  /** `{series, x, label?}`: anillo que late y etiqueta corta. */
  anomalies?: TrendAnomaly[];
  heading?: string;
  /** Por defecto de las series: `line` (por defecto) o `bar`. */
  kind?: TrendKind;
  format?: TrendFormat;
  /** Con `money`: ISO («COP») o un símbolo. */
  currency?: string;
  /** Alto en px, con el eje x (260). */
  height?: number;
  /** Detección automática: `true` (3 desviaciones robustas) o un número. */
  detect?: boolean | number;
  /** Protocolo de IA que contesta «¿por qué?» (POST `{question, context}`). */
  explainEndpoint?: string;
  busy?: boolean;
  locale?: string;
  labels?: Partial<TrendLabels>;
  /** Clic o Enter en un punto (cancelable: no se abre el popover). */
  onWhy?: (e: CustomEvent<TrendWhyDetail>) => void;
  /** La leyenda mostró u ocultó una serie. */
  onToggle?: (e: CustomEvent<{ id: string; visible: boolean }>) => void;
}

export function Trend(props: TrendProps): JSX.Element {
  const [local, rest] = splitProps(props, ["series", "anomalies", "heading", "kind", "format", "currency", "height", "detect", "explainEndpoint", "busy", "locale", "labels", "onWhy", "onToggle"]);
  return (
    <nx-trend
      {...rest}
      prop:series={local.series}
      prop:anomalies={local.anomalies}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:kind={local.kind}
      attr:format={local.format}
      attr:currency={local.currency}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:detect={local.detect === true ? "" : local.detect ? String(local.detect) : undefined}
      attr:explain-endpoint={local.explainEndpoint}
      attr:locale={local.locale}
      bool:busy={!!local.busy}
      on:nx-trend-why={(e) => local.onWhy?.(e)}
      on:nx-trend-toggle={(e) => local.onToggle?.(e)}
    />
  );
}
