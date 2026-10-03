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
  /** `nx-sidemenu-select`, cancelable: `e.preventDefault()` evita la navegación del enlace. */
  onSelect?: (e: CustomEvent<SelectDetail>) => void;
  /** `nx-sidemenu-toggle`, cancelable: con `preventDefault()` el estado compacto lo controla la app. */
  onToggle?: (e: CustomEvent<ToggleDetail>) => void;
  /** El drawer. Solo el del menú: el de un popover hijo (la cuenta del pie) no llega aquí. */
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
  // Los eventos burbujean: cada manejador atiende solo los del propio menú (un `nx-open-change` del
  // panel de `<nx-account>` en el pie no es el drawer).
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
      on:nx-sidemenu-select={(e) => e.target === e.currentTarget && local.onSelect?.(e)}
      on:nx-sidemenu-toggle={(e) => e.target === e.currentTarget && local.onToggle?.(e)}
      on:nx-open-change={(e) => e.target === e.currentTarget && local.onOpenChange?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-sidemenu>
  );
}
