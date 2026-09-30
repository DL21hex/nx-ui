/** `<Cards>` para SolidJS: envuelve `<nx-cards>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/cards/index";
import type { NxCards } from "../components/cards/cards";
import type { CardsAction, CardsActionDetail, CardsField, CardsLabels, CardsLayout, CardsLevel, CardsOpenDetail, CardsRow } from "../components/cards/types";

export type { NxCards, CardsAction, CardsActionDetail, CardsField, CardsLabels, CardsLayout, CardsLevel, CardsOpenDetail, CardsRow };

export interface CardsProps extends JSX.HTMLAttributes<NxCards> {
  /** Los campos `{key, label, type?, currency?, unit?, options?, sort?, group?, search?, good?, bad?}`. */
  fields: CardsField[];
  /** Dónde va cada campo: `{title, subtitle?, status?, note?, value?, delta?, trend?, weight?, brief?, facts?, related?, href?}`. */
  layout: CardsLayout;
  rows: CardsRow[];
  /** Botones de la tarjeta abierta → `onAction`. */
  actions?: CardsAction[];
  /** `map`, `cards` (por defecto) o `detail`. */
  level?: CardsLevel;
  group?: string;
  /** `campo` o `campo:asc` / `campo:desc`. */
  sort?: string;
  rowKey?: string;
  query?: string;
  /** Nivel de los títulos de las tarjetas (3 por defecto). */
  headingLevel?: number;
  locale?: string;
  labels?: Partial<CardsLabels>;
  onOpen?: (e: CustomEvent<CardsOpenDetail>) => void;
  onAction?: (e: CustomEvent<CardsActionDetail>) => void;
  onLevel?: (e: CustomEvent<{ level: CardsLevel }>) => void;
}

export function Cards(props: CardsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "layout", "rows", "actions", "level", "group", "sort", "rowKey", "query", "headingLevel", "locale", "labels", "onOpen", "onAction", "onLevel"]);
  return (
    <nx-cards
      {...rest}
      prop:fields={local.fields}
      prop:layout={local.layout}
      prop:rows={local.rows}
      prop:actions={local.actions}
      prop:query={local.query}
      prop:labels={local.labels}
      attr:level={local.level}
      attr:group={local.group}
      attr:sort={local.sort}
      attr:row-key={local.rowKey}
      attr:heading-level={local.headingLevel === undefined ? undefined : String(local.headingLevel)}
      attr:locale={local.locale}
      on:nx-cards-open={(e) => local.onOpen?.(e)}
      on:nx-cards-action={(e) => local.onAction?.(e)}
      on:nx-cards-level={(e) => local.onLevel?.(e)}
    />
  );
}
