/** `<Org>` para SolidJS: envuelve `<nx-org>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/org/index";
import type { NxOrg } from "../components/org/org";
import type { OrgContact, OrgFocusDetail, OrgLabels, OrgMetric, OrgPerson, OrgUnit, OrgView } from "../components/org/types";

export type { NxOrg, OrgContact, OrgFocusDetail, OrgLabels, OrgMetric, OrgPerson, OrgUnit, OrgView };

export interface OrgProps extends Omit<JSX.HTMLAttributes<NxOrg>, "children"> {
  /** Las unidades `{id, name, parent?, kind?, count?, direct?, leader?, metrics?}`. Sin ellas, solo «Yo». */
  units?: OrgUnit[];
  /** Las personas `{id, name, title?, unit?, boss?, avatar?, href?, reports?, team?, locked?}`. */
  people?: OrgPerson[];
  /** El `id` de quien mira. */
  me?: string;
  /** `me` o `map`. */
  view?: OrgView;
  /** «Para… / Acudes a…» de quien mira. */
  contacts?: OrgContact[];
  /** Las cifras que pueden verse en cada unidad. */
  metrics?: OrgMetric[];
  /** La cifra elegida (su `key`). */
  metric?: string;
  /** El POST que entrega por partes: `{unit}`, `{person}` o `{search}` → `{people?, units?}`. */
  source?: string;
  searchable?: boolean;
  locale?: string;
  labels?: Partial<OrgLabels>;
  onFocusChange?: (e: CustomEvent<OrgFocusDetail>) => void;
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function Org(props: OrgProps): JSX.Element {
  const [local, rest] = splitProps(props, ["units", "people", "me", "view", "contacts", "metrics", "metric", "source", "searchable", "locale", "labels", "onFocusChange", "children"]);
  return (
    <nx-org
      {...rest}
      prop:units={local.units}
      prop:people={local.people}
      prop:contacts={local.contacts}
      prop:metrics={local.metrics}
      prop:labels={local.labels}
      attr:me={local.me}
      attr:view={local.view}
      attr:metric={local.metric}
      attr:source={local.source}
      attr:locale={local.locale}
      bool:searchable={!!local.searchable}
      on:nx-org-focus={(e) => e.target === e.currentTarget && local.onFocusChange?.(e)}
    />
  );
}
