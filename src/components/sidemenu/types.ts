/**
 * Un ítem del menú. Es un dato serializable en JSON, así que el backend puede mandarlo tal cual
 * (BDUI). La forma es compatible con `SessionMenuItem` de nx32: los campos que no se conocen se
 * ignoran.
 */
export interface MenuItem {
  id: string;
  label: string;
  /** Destino. Un ítem con `children` es un padre: abre su panel y nunca navega. */
  href?: string;
  /** Nombre de un ícono registrado con `registerIcons`. Sin ícono se pintan las iniciales. */
  icon?: string;
  /** Segunda línea en el panel de hijos. También se busca en ella. */
  description?: string;
  /** Agrupa los ítems consecutivos bajo un título ("Operación", "Configuración"). */
  section?: string;
  /** En el panel de un padre, el hijo va como chip al pie (configuración, reportes). */
  utility?: boolean;
  /** Contador o marca («12», «Nuevo»). Un número ≤ 0 no se pinta; más de 99 se muestra «99+».
   *  En modo compacto se reduce a un punto. */
  badge?: string | number;
  children?: MenuItem[];
}

export interface SidemenuLabels {
  /** Nombre accesible de la navegación. */
  nav: string;
  filter: string;
  empty: string;
  back: string;
  collapse: string;
  expand: string;
}

export interface SelectDetail {
  item: MenuItem;
  href: string | undefined;
}

export interface ToggleDetail {
  collapsed: boolean;
  /** `true` cuando lo pide `auto-collapse` al entrar o salir del rango de tablet, no el usuario. */
  auto: boolean;
}

export interface OpenChangeDetail {
  open: boolean;
}
