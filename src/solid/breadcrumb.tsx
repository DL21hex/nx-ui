/** `<Breadcrumb>` para SolidJS: envuelve `<nx-breadcrumb>`. Por qué `prop:` y `attr:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/breadcrumb/index";
import type { NxBreadcrumb } from "../components/breadcrumb/breadcrumb";
import type { BreadcrumbItem, BreadcrumbLabels, BreadcrumbLoader, BreadcrumbNavigateDetail, BreadcrumbVia } from "../components/breadcrumb/types";

export type { NxBreadcrumb, BreadcrumbItem, BreadcrumbLabels, BreadcrumbLoader, BreadcrumbNavigateDetail, BreadcrumbVia };

export interface BreadcrumbProps extends JSX.HTMLAttributes<NxBreadcrumb> {
  /** La ruta, si no sale de los hijos (`<a href>` y un `<span>` al final). */
  items?: BreadcrumbItem[];
  /** Pide los hijos de un nivel al abrir su separador. */
  loadChildren?: BreadcrumbLoader;
  /** Nombre de la ruta para el lector de pantalla («Ruta»). */
  label?: string;
  labels?: Partial<BreadcrumbLabels>;
  /** Cancelable: con un router SPA, `e.preventDefault()` y `navigate(e.detail.item.href)`. */
  onNavigate?: (e: CustomEvent<BreadcrumbNavigateDetail>) => void;
  children?: JSX.Element;
}

export function Breadcrumb(props: BreadcrumbProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "loadChildren", "label", "labels", "onNavigate", "children"]);
  return (
    <nx-breadcrumb
      {...rest}
      prop:items={local.items}
      prop:loadChildren={local.loadChildren}
      prop:labels={local.labels}
      attr:label={local.label}
      on:nx-breadcrumb-navigate={(e) => local.onNavigate?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-breadcrumb>
  );
}
