/** `<Badge>` para SolidJS: envuelve `<nx-badge>`. Por qué `attr:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/badge/index";
import type { NxBadge } from "../components/badge/badge";
import type { BadgeTone } from "../components/badge/types";

export type { NxBadge, BadgeTone };

export interface BadgeProps extends JSX.HTMLAttributes<NxBadge> {
  /** El texto, si no va como hijo. */
  label?: string;
  tone?: BadgeTone;
  children?: JSX.Element;
}

export function Badge(props: BadgeProps): JSX.Element {
  const [local, rest] = splitProps(props, ["label", "tone", "children"]);
  return (
    <nx-badge {...rest} attr:label={local.label} attr:tone={local.tone}>
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-badge>
  );
}
