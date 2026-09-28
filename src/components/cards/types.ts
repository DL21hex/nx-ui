/**
 * `<nx-cards>`: tipos. Todo es JSON (BDUI): los campos, el lugar de cada uno en la tarjeta y las
 * filas tal como salen de la base de datos.
 */

export type CardsTone = "neutral" | "info" | "success" | "warning" | "danger";
export type CardsFieldType = "text" | "number" | "money" | "percent" | "rating" | "date" | "status";
/** Los tres niveles del zoom: cuadros de color, tarjetas y fichas. */
export type CardsLevel = "map" | "cards" | "detail";

export interface CardsOption {
  value: string;
  label?: string;
  /**
   * El color del estado. En el mapa: `neutral` y `success` usan el acento (más intenso, más peso);
   * `warning` y `danger` se pintan de su color; `info` (en trámite) es un contorno punteado.
   */
  tone?: CardsTone;
  /** No se anuncia en las tarjetas (el estado normal, «Al día»): así resaltan los demás. */
  quiet?: boolean;
}

export interface CardsField {
  key: string;
  label: string;
  /** Por defecto `text`. `date` espera texto ISO; `percent`, 0–100; `rating`, 0–5 («★ 4,6»). */
  type?: CardsFieldType;
  /** Moneda de `money`: ISO («COP») o símbolo («$»). */
  currency?: string;
  /** `money` y `number` en forma corta («$ 1,2 mil M»). */
  compact?: boolean;
  /** Lo que sigue al número: «días». */
  unit?: string;
  /** `status`: los valores posibles, en el orden en que se agrupan y se cuentan. */
  options?: CardsOption[];
  /** Se puede ordenar por este campo, con esa dirección («Compras (mayor primero)»). */
  sort?: "asc" | "desc";
  /** Se puede agrupar por este campo. */
  group?: boolean;
  /** El buscador también mira este campo (el título y el subtítulo siempre). */
  search?: boolean;
  /** `percent` con barra: desde `good` es verde; hasta `bad`, rojo; en medio, ámbar. */
  good?: number;
  bad?: number;
}

/** Dónde va cada campo en la tarjeta: se nombran por su `key`. */
export interface CardsLayout {
  /** El nombre de la tarjeta. */
  title: string;
  /** Debajo del título, unidos con « · »: «Obra gris · Barranquilla». */
  subtitle?: string[];
  /** Un campo `status`: el chip, el color en el mapa y la leyenda. */
  status?: string;
  /** Una línea con el color del estado: «Póliza de cumplimiento vence el 3 oct». */
  note?: string;
  /** El dato grande: «$ 1.245 M · compras en 12 meses». */
  value?: string;
  /** Cambio porcentual del dato: ▲ 12 % / ▼ 4 %. */
  delta?: string;
  /** Una serie (`number[]`) para la minigráfica. */
  trend?: string;
  /** Decide la intensidad en el mapa y qué tarjetas ocupan dos columnas (el 10 % más alto). Por defecto, `value`. */
  weight?: string;
  /** La línea corta de las tarjetas: «★ 4,6 · 5 días · 96 %». */
  brief?: string[];
  /** Los datos de la ficha. */
  facts?: string[];
  /** Una lista para la tarjeta abierta (`[{title, meta?, value?, status?, tone?}]`), con la etiqueta de su campo. */
  related?: string;
  /** Un enlace «Abrir» en la tarjeta abierta. */
  href?: string;
}

/** Un elemento de la lista de la tarjeta abierta: «OC-2026-0418 · 12 sep · $ 48,2 M · Entregada». */
export interface CardsRelated {
  title: string;
  meta?: string;
  value?: string | number;
  status?: string;
  tone?: CardsTone;
}

export interface CardsAction {
  id: string;
  label: string;
  primary?: boolean;
  /** Los estados en los que no se puede (la acción se ve deshabilitada). */
  disabledFor?: string[];
}

export type CardsRow = Record<string, unknown>;

export interface CardsOpenDetail {
  row: CardsRow;
  open: boolean;
}

export interface CardsActionDetail {
  action: string;
  row: CardsRow;
}

export interface CardsLabels {
  search: string;
  placeholder: string;
  group: string;
  noGroup: string;
  sort: string;
  noSort: string;
  /** «mayor primero» */
  desc: string;
  /** «menor primero» */
  asc: string;
  /** «A–Z» (texto) */
  az: string;
  /** Fechas: «más reciente primero» / «más antiguo primero». */
  recent: string;
  oldest: string;
  level: string;
  map: string;
  cards: string;
  detail: string;
  /** «{n} registros» */
  count: string;
  countOne: string;
  /** «{n} de {total}» */
  countOf: string;
  /** «más intenso, más {label}» */
  intensity: string;
  empty: string;
  close: string;
  open: string;
  /** «Vista: {level}» (se anuncia al cambiar de nivel). */
  levelChanged: string;
}
