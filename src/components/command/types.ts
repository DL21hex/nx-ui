/** `<nx-command>`: tipos. */

/**
 * Una entrada de la paleta. Es JSON: el backend la puede mandar tal cual (BDUI), y un buscador en
 * el servidor (`source`) responde con estas mismas entradas.
 */
export interface CommandItem {
  /** Identidad para «Recientes» (por defecto, `href` o `label`). */
  id?: string;
  label: string;
  /** Navega. Se pinta como `<a href>`: el router de la app lo intercepta y el clic central abre
   *  otra pestaña, igual que un enlace. */
  href?: string;
  /** El grupo en el que se muestra («Ir a», «Acciones», «Pedidos»). */
  group?: string;
  /** Texto secundario: la ruta en el menú («Ventas › Pedidos»), un estado, un monto. También se busca. */
  hint?: string;
  /** Palabras que también la encuentran (sinónimos: «cancelar» para «Anular»). */
  keywords?: string[];
  /** Nombre de un ícono registrado. */
  icon?: string;
  /** Atajo que se muestra al lado («G P»). Solo informativo. */
  shortcut?: string;
  /** Un submenú: elegirla abre otra lista («Cambiar paleta ›»). */
  children?: CommandItem[];
  /** Datos para la app: llegan en `nx-command-select`. */
  data?: unknown;
  disabled?: boolean;
}

/** Uso de una entrada: cuántas veces y cuándo fue la última (para «Recientes» y el orden). */
export interface CommandUse {
  n: number;
  t: number;
  item: CommandItem;
}
export type CommandUsage = Record<string, CommandUse>;

export interface CommandLabels {
  /** Nombre accesible de la paleta. */
  dialog: string;
  placeholder: string;
  empty: string;
  loading: string;
  error: string;
  recent: string;
  /** Grupo de las pantallas que vienen del menú (`menu`). */
  navigate: string;
  /** Grupo de las entradas sin `group`. */
  commands: string;
  /** Grupo de lo que responde el servidor sin `group`. */
  records: string;
  /** «Preguntarle al asistente» (con `agent`). */
  ask: string;
  back: string;
  keyMove: string;
  keyOpen: string;
  keyTab: string;
  keyClose: string;
}

export interface CommandSelectDetail {
  item: CommandItem;
  query: string;
  /** Se abrirá en otra pestaña (⌘/Ctrl + Enter). */
  newTab: boolean;
}
