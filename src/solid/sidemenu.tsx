/** `<SideMenu>` para SolidJS: envuelve `<nx-sidemenu>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { createEffect, splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/sidemenu/index";
import type { NxSidemenu } from "../components/sidemenu/sidemenu";
import type { MenuItem, OpenChangeDetail, SelectDetail, SidemenuLabels, ToggleDetail } from "../components/sidemenu/types";

export type { MenuItem, SidemenuLabels, SelectDetail, ToggleDetail, OpenChangeDetail, NxSidemenu };

export interface SideMenuProps extends Omit<JSX.HTMLAttributes<NxSidemenu>, "onSelect" | "onToggle"> {
  items: MenuItem[];
  /** El href (o id) de la pantalla actual, p. ej. `useLocation().pathname`. */
  active?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  /** Compacto automático en tablet (768–1023 px). */
  autoCollapse?: boolean;
  /** Controlado: abre y cierra el drawer móvil (en escritorio no hace nada). */
  open?: boolean;
  labels?: Partial<SidemenuLabels>;
  /** Cancelable: `e.preventDefault()` evita la navegación del enlace. */
  onSelect?: (e: CustomEvent<SelectDetail>) => void;
  /** Cancelable: con `preventDefault()` el estado compacto lo controla la app. */
  onToggle?: (e: CustomEvent<ToggleDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

export function SideMenu(props: SideMenuProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "items",
    "active",
    "collapsed",
    "collapsible",
    "autoCollapse",
    "open",
    "labels",
    "onSelect",
    "onToggle",
    "onOpenChange",
    "children",
  ]);
  let el: NxSidemenu | undefined;
  // Tras montar: el drawer es `popover` solo ya conectado, y sin `open` no se toca (lo abre la hamburguesa).
  createEffect(() => {
    const want = local.open;
    if (el && want !== undefined && want !== el.open) el.open = want;
  });
  return (
    <nx-sidemenu
      {...rest}
      ref={(e: NxSidemenu) => (el = e)}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:active={local.active}
      bool:collapsed={!!local.collapsed}
      bool:collapsible={!!local.collapsible}
      bool:auto-collapse={!!local.autoCollapse}
      on:nx-select={(e) => local.onSelect?.(e)}
      on:nx-toggle={(e) => local.onToggle?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    >
      {local.children}
    </nx-sidemenu>
  );
}
