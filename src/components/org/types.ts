/**
 * `<nx-org>`: tipos. Todo es JSON (BDUI): las unidades de la estructura (empresa, subdivisión,
 * área…), las personas con su jefe y, si la organización es grande, un `source` que entrega las
 * personas por partes.
 */

/** Las dos lentes: «Yo» (alrededor de una persona) y «Organización» (el árbol de unidades). */
export type OrgView = "me" | "map";

/** Una unidad de la estructura. Las raíces no tienen `parent`. */
export interface OrgUnit {
  id: string;
  name: string;
  parent?: string | null;
  /** Qué es: «Empresa», «Subdivisión», «Área»… Se muestra pequeño sobre el nombre. */
  kind?: string;
  /** Personas en la unidad y en todas sus subunidades. Sin él, se cuentan las `people` cargadas. */
  count?: number;
  /** Personas que están directamente en la unidad (no en sus subunidades). */
  direct?: number;
  /** El líder de la unidad: el `id` de una persona. */
  leader?: string;
  /** Cifras para la lente de color: `{ vacantes: 3, ingresos: 12 }`, con las claves de `metrics`. */
  metrics?: Record<string, number>;
}

/** Una persona. `boss` es el `id` de su jefe; `unit`, el de su unidad. */
export interface OrgPerson {
  id: string;
  name: string;
  /** El cargo. */
  title?: string;
  unit?: string | null;
  boss?: string | null;
  /** URL de la foto (https o del mismo origen). Sin ella, las iniciales. */
  avatar?: string;
  email?: string;
  phone?: string;
  /** Un enlace a su ficha. */
  href?: string;
  /** Cuántas personas tiene a cargo, directas (si no llegan todas en `people`). */
  reports?: number;
  /** Cuántas personas hay debajo, contando todos los niveles. */
  team?: number;
  /** No se puede centrar en ella (quien mira no tiene acceso a su entorno): se ve, no se abre. */
  locked?: boolean;
}

/** «Para… / Acudes a…»: a quién acude la persona para cada cosa. */
export interface OrgContact {
  /** «Aprobar vacaciones». */
  label: string;
  /** El `id` de una persona (se muestra con su foto y se puede abrir). */
  person?: string;
  /** O un texto: «Equipo de nómina · Sede Cali». */
  text?: string;
  href?: string;
}

/** Una cifra para mostrar en cada unidad: la clave en `unit.metrics` y su nombre. */
export interface OrgMetric {
  key: string;
  label: string;
  /** El color de la intensidad: el acento (por defecto), ámbar o rojo. */
  tone?: "accent" | "warning" | "danger";
  /** `count`: la intensidad es la cifra por persona de la unidad (rotación, ausencias). */
  per?: "count";
}

/** La respuesta de `source`: lo que el componente agrega a lo que ya tiene. */
export interface OrgPage {
  people?: OrgPerson[];
  units?: OrgUnit[];
}

/** Lo que se le pide a `source` (POST con JSON): las personas de una unidad, el entorno de una
 *  persona (su cadena hacia arriba, sus pares y su equipo) o una búsqueda. */
export type OrgRequest = { unit: string } | { person: string } | { search: string };

export interface OrgFocusDetail {
  view: OrgView;
  /** La unidad abierta en «Organización» (`null`: el árbol) o la persona en el centro de «Yo». */
  id: string | null;
}

export interface OrgOpenDetail {
  person: OrgPerson;
}

export interface OrgLabels {
  me: string;
  map: string;
  views: string;
  search: string;
  placeholder: string;
  you: string;
  /** «{n} personas» */
  people: string;
  peopleOne: string;
  boss: string;
  /** Junto a las caras de la cadena hacia arriba, en «Yo». */
  chain: string;
  peers: string;
  reports: string;
  /** «Equipo de {name}» */
  teamOf: string;
  noBoss: string;
  contactsFor: string;
  contactsWho: string;
  /** «+{n}» */
  more: string;
  /** «{n} subunidades» (el botón que las despliega) */
  subunits: string;
  subunitOne: string;
  /** El botón que pliega las subunidades. */
  fold: string;
  /** «Directos con {name}»: quienes dependen del líder sin equipo propio. */
  direct: string;
  /** «{n} a cargo» */
  span: string;
  /** «{n} en total» */
  spanTotal: string;
  /** «Personas en {name}» */
  peopleIn: string;
  showMore: string;
  /** «Tu jefe común con {name} es {boss}» */
  common: string;
  /** «{name} es parte de tu cadena» / está debajo de ti */
  above: string;
  below: string;
  /** «Tú y {name} tienen el mismo jefe» */
  sameBoss: string;
  /** «{n} niveles arriba» */
  levels: string;
  levelOne: string;
  noPath: string;
  seeMap: string;
  seeMe: string;
  metric: string;
  noMetric: string;
  loading: string;
  error: string;
  retry: string;
  empty: string;
  noResults: string;
  /** Anunciado al cambiar de foco: «Mostrando {name}». */
  focusChanged: string;
  close: string;
  open: string;
  email: string;
  phone: string;
}
