/** `<Award>` para SolidJS: envuelve `<nx-award>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/award/index";
import type { NxAward } from "../components/award/award";
import type { AwardAdviseDetail, AwardChangeDetail, AwardChoice, AwardCriterion, AwardEvent, AwardFilter, AwardItem, AwardLabels, AwardLens, AwardQuote, AwardSubmitDetail, AwardSupplier } from "../components/award/types";

export type { NxAward, AwardAdviseDetail, AwardChangeDetail, AwardChoice, AwardCriterion, AwardEvent, AwardFilter, AwardItem, AwardLabels, AwardLens, AwardQuote, AwardSubmitDetail, AwardSupplier };

export interface AwardProps extends Omit<JSX.HTMLAttributes<NxAward>, "onChange" | "onSubmit" | "children"> {
  /** Los proveedores `{id, name, detail?, alert?}`, en el orden de las columnas. */
  suppliers: AwardSupplier[];
  /** Los artículos `{id, name, qty, unit?, code?, group?}`. */
  items: AwardItem[];
  /** Las cotizaciones `{item, supplier, price, leadTime?, original?, note?}`; `price` es el unitario comparable. */
  quotes: AwardQuote[];
  /** `{id, label, weight}`: la leyenda del puntaje y los deslizadores de «Criterios». */
  criteria?: AwardCriterion[];
  /** Sin `endpoint`: la recomendación como eventos del protocolo. */
  advice?: AwardEvent[];
  /** Lo que el comprador ya eligió a mano (un borrador guardado). */
  choices?: AwardChoice[];
  excluded?: string[];
  /** Los motivos que se sugieren al apartarse de la IA. */
  reasons?: string[];
  scenario?: string;
  /** Los pesos `{criterio: peso}` (relativos). Cambiarlos vuelve a pedir la recomendación. */
  weights?: Record<string, number>;
  /** Qué filas se ven: `all` (por defecto), `alerts` o `changed`. */
  filter?: AwardFilter;
  /** Lo que muestran las celdas: `price` (por defecto), `total`, `lead` o `score`. */
  lens?: AwardLens;
  /** `POST {weights, excluded}` → NDJSON. Sin él, `onAdvise`. */
  endpoint?: string;
  heading?: string;
  /** Moneda de los precios: ISO («COP») o un símbolo. */
  currency?: string;
  readonly?: boolean;
  requireReason?: boolean;
  requireReview?: boolean;
  locale?: string;
  labels?: Partial<AwardLabels>;
  /** Sin `endpoint`: recomienda con `e.detail.weights` y `e.detail.excluded` y llama `e.detail.respond(events)` (o `preventDefault()` y responde después). */
  onAdvise?: (e: CustomEvent<AwardAdviseDetail>) => void;
  onChange?: (e: CustomEvent<AwardChangeDetail>) => void;
  /** Las órdenes por proveedor, con los cambios frente a la IA y su motivo. */
  onSubmit?: (e: CustomEvent<AwardSubmitDetail>) => void;
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function Award(props: AwardProps): JSX.Element {
  const [local, rest] = splitProps(props, ["suppliers", "items", "quotes", "criteria", "advice", "choices", "excluded", "reasons", "scenario", "weights", "filter", "lens", "endpoint", "heading", "currency", "readonly", "requireReason", "requireReview", "locale", "labels", "onAdvise", "onChange", "onSubmit", "children"]);
  return (
    <nx-award
      {...rest}
      prop:suppliers={local.suppliers}
      prop:items={local.items}
      prop:quotes={local.quotes}
      prop:criteria={local.criteria}
      prop:advice={local.advice}
      prop:choices={local.choices}
      prop:excluded={local.excluded}
      prop:reasons={local.reasons}
      prop:weights={local.weights}
      prop:filter={local.filter}
      prop:labels={local.labels}
      attr:scenario={local.scenario}
      attr:lens={local.lens}
      attr:endpoint={local.endpoint}
      attr:heading={local.heading}
      attr:currency={local.currency}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:require-reason={!!local.requireReason}
      bool:require-review={!!local.requireReview}
      on:nx-award-advise={(e) => e.target === e.currentTarget && local.onAdvise?.(e)}
      on:nx-award-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
      on:nx-award-submit={(e) => e.target === e.currentTarget && local.onSubmit?.(e)}
    />
  );
}
