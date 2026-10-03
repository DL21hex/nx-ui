/** `<Breadcrumb>` para SolidJS: envuelve `<nx-breadcrumb>`. Por qué `prop:` y `attr:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/breadcrumb/index";
import type { NxBreadcrumb } from "../components/breadcrumb/breadcrumb";
import type { BreadcrumbChildrenDetail, BreadcrumbItem, BreadcrumbLabels, BreadcrumbNavigateDetail, BreadcrumbVia } from "../components/breadcrumb/types";

export type { NxBreadcrumb, BreadcrumbItem, BreadcrumbLabels, BreadcrumbChildrenDetail, BreadcrumbNavigateDetail, BreadcrumbVia };

export interface BreadcrumbProps extends JSX.HTMLAttributes<NxBreadcrumb> {
  /** La ruta, si no sale de los hijos (`<a href>` y un `<span>` al final). */
  items?: BreadcrumbItem[];
  /** URL que da los hijos de un nivel al abrir su separador (`{id}`, `{level}`). */
  childrenEndpoint?: string;
  /** Nombre de la ruta para el lector de pantalla («Ruta»). */
  label?: string;
  labels?: Partial<BreadcrumbLabels>;
  /** Cancelable: con un router SPA, `e.preventDefault()` y `navigate(e.detail.item.href!)`. */
  onNavigate?: (e: CustomEvent<BreadcrumbNavigateDetail>) => void;
  /** Se abrió un separador sin `children`: `e.detail.respond(hijos)` (ya, o tras `preventDefault()`). */
  onChildren?: (e: CustomEvent<BreadcrumbChildrenDetail>) => void;
  children?: JSX.Element;
}

export function Breadcrumb(props: BreadcrumbProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "childrenEndpoint", "label", "labels", "onNavigate", "onChildren", "children"]);
  // Los eventos burbujean: cada manejador atiende solo los de esta ruta (no los de otra anidada).
  return (
    <nx-breadcrumb
      {...rest}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:label={local.label}
      attr:children-endpoint={local.childrenEndpoint}
      on:nx-breadcrumb-navigate={(e) => e.target === e.currentTarget && local.onNavigate?.(e)}
      on:nx-breadcrumb-children={(e) => e.target === e.currentTarget && local.onChildren?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-breadcrumb>
  );
}
