/** `<Print>` para SolidJS: envuelve `<nx-print>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/print/index";
import type { NxPrint } from "../components/print/print";
import type { PrintLabels, PrintOrientation, PrintPaginateDetail, PrintZoom } from "../components/print/types";

export type { NxPrint, PrintLabels, PrintOrientation, PrintPaginateDetail, PrintZoom };

export interface PrintProps extends JSX.HTMLAttributes<NxPrint> {
  /** `letter` (por defecto), `a4`, `a5`, `legal`, `oficio`, `half-letter` o «216mm 140mm». */
  size?: string;
  orientation?: PrintOrientation;
  /** Uno a cuatro valores, como en CSS (12 mm). */
  margin?: string;
  /** Título del documento: el nombre sugerido del PDF. */
  heading?: string;
  currency?: string;
  /** `"fit"` (por defecto) o un factor (1 = tamaño real). */
  zoom?: PrintZoom;
  locale?: string;
  labels?: Partial<PrintLabels>;
  toolbar?: boolean;
  onPaginate?: (e: CustomEvent<PrintPaginateDetail>) => void;
  onBeforePrint?: (e: CustomEvent<PrintPaginateDetail>) => void;
  onAfterPrint?: (e: CustomEvent<PrintPaginateDetail>) => void;
  children?: JSX.Element;
}

export function Print(props: PrintProps): JSX.Element {
  const [local, rest] = splitProps(props, ["size", "orientation", "margin", "heading", "currency", "zoom", "locale", "labels", "toolbar", "onPaginate", "onBeforePrint", "onAfterPrint", "children"]);
  return (
    <nx-print
      {...rest}
      prop:labels={local.labels}
      attr:size={local.size}
      attr:orientation={local.orientation}
      attr:margin={local.margin}
      attr:heading={local.heading}
      attr:currency={local.currency}
      attr:zoom={local.zoom === undefined ? undefined : String(local.zoom)}
      attr:locale={local.locale}
      attr:toolbar={local.toolbar === false ? "false" : undefined}
      on:nx-print-paginate={(e) => e.target === e.currentTarget && local.onPaginate?.(e)}
      on:nx-print-before={(e) => e.target === e.currentTarget && local.onBeforePrint?.(e)}
      on:nx-print-after={(e) => e.target === e.currentTarget && local.onAfterPrint?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-print>
  );
}
