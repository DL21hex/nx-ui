/** `<nx-breadcrumb>`: tipos. */

/** Un nivel de la ruta. Sin `items`, salen de los hijos del autor (`<a href>` y un `<span>` al final). */
export interface BreadcrumbItem {
  /** Para reconocerlo entre pintadas y marcar el actual en el menú. Por defecto, `href` o `label`. */
  id?: string;
  label: string;
  href?: string;
  /** Un ícono registrado (`registerIcons`). Lo normal es que solo lo lleve el primero: el módulo. */
  icon?: string;
  /** Los hijos de este nivel (los hermanos del siguiente), si llegan con la ruta. Si no, se piden al
   *  abrir su separador (`nx-breadcrumb-children` o `children-endpoint`). */
  children?: BreadcrumbItem[];
  /** `true`: su separador se abre sin `children` (los hijos se piden al abrir). `false`: no se abre
   *  aunque haya `children-endpoint`. */
  expandable?: boolean;
}

/** Por dónde se llegó: un nombre de la ruta, el menú de un separador o del «…», «‹ Padre» o `Alt+↑`. */
export type BreadcrumbVia = "link" | "menu" | "back" | "key";

export interface BreadcrumbNavigateDetail {
  item: BreadcrumbItem;
  /** En qué nivel queda (`0` es el primero). */
  level: number;
  via: BreadcrumbVia;
}

/**
 * Detalle de `nx-breadcrumb-children` (cancelable): se abrió el separador de `item` (nivel `level`)
 * y sus hijos no llegaron con la ruta. La app los da con `respond(hijos)`: ya, o después de
 * `preventDefault()` si los pide a su manera. Si nadie responde, se piden a `children-endpoint`.
 */
export interface BreadcrumbChildrenDetail {
  item: BreadcrumbItem;
  level: number;
  respond(children: BreadcrumbItem[] | Promise<BreadcrumbItem[]>): void;
}

export interface BreadcrumbLabels {
  /** Nombre de la ruta para el lector de pantalla, si no hay `label`. */
  label: string;
  /** El botón de un separador: «Otros en {label}». */
  siblings: string;
  /** El botón «…»: «Niveles ocultos ({n})». */
  more: string;
  /** El menú del «…». */
  hidden: string;
  /** El buscador del menú: «Buscar en {label}…». */
  search: string;
  empty: string;
  loading: string;
  error: string;
  /** «‹ Padre» en lo angosto: «Volver a {label}». */
  back: string;
}
