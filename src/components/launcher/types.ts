/** `<nx-launcher>`: tipos. Todo es JSON: el backend lo manda tal cual (BDUI). */

export type LauncherTone = "neutral" | "success" | "warning" | "danger";

/** El único dato vivo de una tarjeta: «7 por aprobar · la más antigua, hace 3 días». */
export interface LauncherSignal {
  /** El dato grande. Un número se formatea con el locale; un texto («$ 1.974.000», «12 sep») va tal cual. */
  value?: string | number;
  /** Lo que sigue al dato: «por aprobar». */
  label?: string;
  /** Una nota con un punto de color: «2 cierran hoy». */
  note?: string;
  /** El color de la nota (`neutral` por defecto). */
  tone?: LauncherTone;
  /** 0–100: una barra de avance debajo («71 % del presupuesto»). */
  meter?: number;
  /** Una serie corta para una minigráfica al lado del dato. */
  trend?: number[];
}

/** Una vista (pestaña) del módulo: se entra directo a ella desde la tarjeta. */
export interface LauncherView {
  id?: string;
  label: string;
  href?: string;
  /** Contador («7») o marca. Un número ≤ 0 no se pinta; más de 99 se muestra «99+». */
  badge?: string | number;
  /** Un texto corto al lado, más tenue: «15 sep 2026». */
  hint?: string;
}

/** Una parte de la barra de una tarjeta destacada: «38 adjudicados». */
export interface LauncherProgress {
  label: string;
  value: number;
}

export interface LauncherItem {
  id: string;
  label: string;
  /** Destino. Sin él, el de la primera vista; sin ninguno, la tarjeta es un botón (`nx-launcher-select`). */
  href?: string;
  /** Nombre de un ícono registrado con `registerIcons`. Sin ícono se pintan las iniciales. */
  icon?: string;
  /** Para qué sirve el módulo. Con puntero, cede su lugar a las vistas al pasar por la tarjeta. */
  description?: string;
  /** Agrupa las tarjetas consecutivas bajo un título («Día a día», «Datos y análisis»). */
  section?: string;
  views?: LauncherView[];
  signal?: LauncherSignal;
  /** Ocupa dos columnas, con el acento de fondo: «Continuar donde ibas». Una por pantalla, idealmente. */
  featured?: boolean;
  /** Línea pequeña sobre el nombre de una destacada: «Continuar donde ibas · hace 2 horas». */
  eyebrow?: string;
  /** Barra por partes de una destacada. La primera va en el acento, la segunda más suave y el resto
   *  queda como fondo de la barra («lo que falta»). */
  progress?: LauncherProgress[];
  /** Datos para la app: viajan en el evento. */
  data?: unknown;
}

export interface LauncherSelectDetail {
  item: LauncherItem;
  /** La vista elegida, o `null` si se eligió la tarjeta. */
  view: LauncherView | null;
  href: string | undefined;
}

export interface LauncherLabels {
  /** Nombre accesible de la navegación. */
  nav: string;
  search: string;
  placeholder: string;
  empty: string;
  /** «Enter abre {name}» */
  open: string;
  /** «Vistas de {name}» */
  views: string;
}
