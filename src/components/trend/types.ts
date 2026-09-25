/**
 * `<nx-trend>`: tipos. El gráfico es JSON (BDUI): el backend manda las series y, si quiere, las
 * anomalías; el componente pinta, resume y pregunta «¿por qué?» al `explain-endpoint` con el
 * protocolo de IA de la librería (`../ai/types`).
 */

export type TrendKind = "line" | "bar";
export type TrendFormat = "number" | "money" | "percent";

/** Un punto: `x` es un mes («2026-08») o un día («2026-08-15»); `y`, el valor (o `null`: sin dato). */
export interface TrendPoint {
  x: string;
  y: number | null;
}

export interface TrendSeries {
  id: string;
  label: string;
  points: TrendPoint[];
  /** Por defecto, el `format` del gráfico. En `percent`, `y` es la fracción (0,19 es 19 %). */
  format?: TrendFormat;
  /** Con `money`: ISO («COP») o un símbolo («$»). Por defecto, el `currency` del gráfico. */
  currency?: string;
  /** `line` o `bar`. Por defecto, el `kind` del gráfico. */
  kind?: TrendKind;
  /** De referencia (el año anterior, el presupuesto): gris, detrás de las demás. */
  muted?: boolean;
  /** Empieza oculta (se muestra desde la leyenda). */
  hidden?: boolean;
}

/** Un punto fuera de lo normal, marcado con un anillo y una etiqueta corta. */
export interface TrendAnomaly {
  series: string;
  x: string;
  /** «+18 % acero». Sin etiqueta, se calcula contra la media móvil. */
  label?: string;
}

/** Una anomalía ya resuelta: de dónde viene y cuánto se aparta de la media móvil. */
export interface TrendFlag {
  series: string;
  x: string;
  label?: string;
  /** Diferencia contra la media móvil, como fracción (0,18 = 18 % por encima). */
  delta: number;
}

/** Lo que viaja al `explain-endpoint` (el `context` de `<nx-ai-answer>`). */
export interface TrendContext {
  series: { id: string; label: string; format: TrendFormat; currency?: string };
  point: { x: string; y: number; label: string };
  previous: { x: string; y: number } | null;
  /** Los puntos alrededor (hasta 6 antes y 2 después), para que el backend vea la tendencia. */
  window: TrendPoint[];
  anomaly?: { label?: string; delta: number };
}

/** `nx-trend-why` (cancelable: con `preventDefault()` no se abre el popover). */
export interface TrendWhyDetail extends TrendContext {
  question: string;
}

export interface TrendLabels {
  /** Nombre del gráfico cuando no tiene `heading`. */
  chart: string;
  /** Pista de teclado de los puntos. */
  hint: string;
  table: string;
  chartView: string;
  period: string;
  empty: string;
  /** «¿Por qué {dir} {label} en {period}?» */
  why: string;
  /** Sin punto anterior para comparar: «¿Qué explica {label} en {period}?» */
  whyFlat: string;
  up: string;
  down: string;
  flat: string;
  /** «{label}: {change} de {from} a {to}; máximo en {max}» */
  summary: string;
  /** «{change}» con cambio: «{dir} {pct}» */
  change: string;
  /** «{label} fuera de lo normal en {period} ({delta} vs. la media)» */
  outlier: string;
  anomaly: string;
  /** En el popover: «vs. {period}» */
  versus: string;
  close: string;
  /** Pista en el tooltip. */
  ask: string;
}
