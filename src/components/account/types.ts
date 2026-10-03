/** `<nx-account>`: tipos. Todo es JSON: el backend lo puede mandar tal cual (BDUI). */

/** Quien inició sesión. */
export interface AccountUser {
  name: string;
  email?: string;
  /** Foto (`https:` o del mismo origen). Sin ella, las iniciales. */
  avatar?: string;
  /** Iniciales propias («DL»); si no, salen del nombre. */
  initials?: string;
}

/** Una empresa, sede o rol en el que se puede trabajar. */
export interface AccountTenant {
  id: string;
  /** «Crear Colombia S.A.S.» */
  name: string;
  /** «Sede Medellín» */
  detail?: string;
  /** «Aprobador» */
  role?: string;
  /** Agrupa en el selector (la empresa, cuando cada entrada es una sede). */
  group?: string;
}

export type AccountStatus = "online" | "away" | "dnd";
export type AccountTheme = "light" | "system" | "dark";

/** Una paleta de color: la de `palettes.css` por su id, o una propia con su color de muestra. */
export interface AccountPalette {
  id: string;
  label: string;
  /** Color de la muestra. Sin él, la muestra se pinta con la propia paleta (`data-nx-palette`). */
  color?: string;
}

/** Un enlace de la app en el panel («Mi perfil», «Configuración»). */
export interface AccountItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  /** A la derecha, en pequeño: un atajo («Ctrl ,») o un dato. */
  hint?: string;
}

export interface AccountLocale {
  value: string;
  label: string;
}

/** `expiresAt`: ISO o milisegundos desde epoch. */
export interface AccountSession {
  expiresAt: string | number;
  /** `POST` que extiende la sesión y responde `{expiresAt}`. Mismo origen (o `allowOrigins`). */
  extendEndpoint?: string;
}

/** Alguien a quien suplantar («Ver como…»): lo que responde `view-as-source`. */
export interface AccountPerson {
  id: string;
  name: string;
  role?: string;
  avatar?: string;
}

/** Lo que se recuerda en `localStorage` (bajo `storage`). */
export interface AccountPrefs {
  theme?: AccountTheme;
  palette?: string;
  /** Ids de las últimas empresas elegidas, la más reciente primero. */
  recent?: string[];
}

/** Lo mínimo de una cola de `nx-sync` (`nxSync`) que usa el cierre de sesión. */
export interface AccountSyncQueue {
  subscribe(fn: (state: { online: boolean; pending: number }) => void): () => void;
  flush(): Promise<void>;
}

/** Una entrada para `<nx-command>` (misma forma que `CommandItem`). */
export interface AccountCommand {
  id: string;
  label: string;
  group?: string;
  hint?: string;
  keywords?: string[];
  icon?: string;
  shortcut?: string;
  /** `{account, action, value}`: lo que hace (lo ejecuta la propia `<nx-account>`). */
  data: { account: string; action: string; value?: string };
}

export interface AccountLabels {
  /** Nombre del panel. */
  account: string;
  tenant: string;
  search: string;
  empty: string;
  loading: string;
  error: string;
  recent: string;
  status: string;
  online: string;
  away: string;
  dnd: string;
  until: string;
  hour: string;
  today: string;
  forever: string;
  theme: string;
  light: string;
  system: string;
  dark: string;
  color: string;
  language: string;
  shortcuts: string;
  viewAs: string;
  /** «Dejar de ver como {name}» */
  stopViewAs: string;
  logout: string;
  back: string;
  offline: string;
  /** «{n} cambios sin sincronizar» (uno / varios). */
  pendingOne: string;
  pendingMany: string;
  /** «Se envían antes de salir.» */
  pendingWait: string;
  /** Pasó el tope y la cola no se vació. */
  pendingStuck: string;
  logoutAnyway: string;
  /** «Tu sesión vence en {time}» */
  sessionWarn: string;
  /** Lo que se anuncia una vez al entrar en el tramo: «… en {min} min». */
  sessionAnnounce: string;
  extend: string;
  extending: string;
  extendError: string;
  expired: string;
  /** «Ahora en {name}» */
  switched: string;
}

export interface AccountSwitchDetail {
  tenant: AccountTenant;
}
export interface AccountStatusDetail {
  status: AccountStatus;
  /** Hasta cuándo (ms desde epoch); `null`: sin fin. */
  until: number | null;
}
export interface AccountThemeDetail {
  theme: AccountTheme;
  palette: string;
}
export interface AccountViewAsDetail {
  /** `null` al salir (también cancelable: la franja sigue hasta que la app asigne `viewAs = null`). */
  user: AccountPerson | null;
}
export interface AccountLogoutDetail {
  /** Cambios que quedaron sin enviar (al salir «de todos modos»). */
  pending: number;
}
