/** `<Account>` para SolidJS: envuelve `<nx-account>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/account/index";
import type { NxAccount } from "../components/account/account";
import type { AccountItem, AccountLabels, AccountLocale, AccountLogoutDetail, AccountPalette, AccountPerson, AccountSession, AccountStatus, AccountStatusDetail, AccountSwitchDetail, AccountSyncQueue, AccountTenant, AccountThemeDetail, AccountUser, AccountViewAsDetail } from "../components/account/types";

export type { NxAccount, AccountItem, AccountLabels, AccountLocale, AccountLogoutDetail, AccountPalette, AccountPerson, AccountSession, AccountStatus, AccountStatusDetail, AccountSwitchDetail, AccountSyncQueue, AccountTenant, AccountThemeDetail, AccountUser, AccountViewAsDetail };

/** Sin hijos: la tarjeta y el panel los pinta el elemento. */
export interface AccountProps extends Omit<JSX.HTMLAttributes<NxAccount>, "onSelect" | "children"> {
  children?: never;
  user: AccountUser;
  tenants?: AccountTenant[];
  current?: string;
  status?: AccountStatus;
  items?: AccountItem[];
  palettes?: (string | AccountPalette)[];
  locales?: AccountLocale[];
  storage?: string;
  applyLocale?: boolean;
  session?: AccountSession | null;
  /** Vencimiento de la sesión (ISO o epoch ms); también sirve `session.expiresAt`. */
  expiresAt?: string;
  warnBefore?: number;
  viewAs?: AccountPerson | null;
  viewAsSource?: string;
  /** A dónde ir al salir (mismo origen): `POST` por defecto. */
  logoutUrl?: string;
  /** `"get"` navega en vez de enviar un formulario `POST`. */
  logoutMethod?: "post" | "get";
  /** Token CSRF del `POST` de salida, en el campo `logoutCsrfField` (`_csrf`). */
  logoutCsrf?: string;
  logoutCsrfField?: string;
  /** Una cola de `nxSync` para contar lo pendiente y vaciarla antes de salir. */
  sync?: AccountSyncQueue | null;
  labels?: Partial<AccountLabels>;
  locale?: string;
  disabled?: boolean;
  onSwitch?: (e: CustomEvent<AccountSwitchDetail>) => void;
  onStatus?: (e: CustomEvent<AccountStatusDetail>) => void;
  onTheme?: (e: CustomEvent<AccountThemeDetail>) => void;
  onLocale?: (e: CustomEvent<{ locale: string }>) => void;
  onSelect?: (e: CustomEvent<{ id: string }>) => void;
  onViewAs?: (e: CustomEvent<AccountViewAsDetail>) => void;
  onExtend?: (e: CustomEvent<{ session: AccountSession | null }>) => void;
  onExpired?: (e: CustomEvent<{ expiresAt: number | null }>) => void;
  onLogout?: (e: CustomEvent<AccountLogoutDetail>) => void;
}

export function Account(props: AccountProps): JSX.Element {
  const [local, rest] = splitProps(props, ["user", "tenants", "current", "status", "items", "palettes", "locales", "storage", "applyLocale", "session", "expiresAt", "warnBefore", "viewAs", "viewAsSource", "logoutUrl", "logoutMethod", "logoutCsrf", "logoutCsrfField", "sync", "labels", "locale", "disabled", "onSwitch", "onStatus", "onTheme", "onLocale", "onSelect", "onViewAs", "onExtend", "onExpired", "onLogout", "children"]);
  // Solo los eventos de esta cuenta (`e.target === e.currentTarget`), no los que burbujean desde dentro.
  return (
    <nx-account
      {...rest}
      prop:user={local.user}
      prop:tenants={local.tenants}
      prop:items={local.items}
      prop:palettes={local.palettes}
      prop:locales={local.locales}
      prop:session={local.session}
      prop:viewAs={local.viewAs}
      prop:sync={local.sync}
      prop:labels={local.labels}
      attr:current={local.current}
      attr:status={local.status}
      attr:storage={local.storage}
      attr:apply-locale={local.applyLocale === false ? "false" : undefined}
      attr:expires-at={local.expiresAt}
      attr:warn-before={local.warnBefore === undefined ? undefined : String(local.warnBefore)}
      attr:view-as-source={local.viewAsSource}
      attr:logout-url={local.logoutUrl}
      attr:logout-method={local.logoutMethod}
      attr:logout-csrf={local.logoutCsrf}
      attr:logout-csrf-field={local.logoutCsrfField}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-account-switch={(e) => e.target === e.currentTarget && local.onSwitch?.(e)}
      on:nx-account-status={(e) => e.target === e.currentTarget && local.onStatus?.(e)}
      on:nx-account-theme={(e) => e.target === e.currentTarget && local.onTheme?.(e)}
      on:nx-account-locale={(e) => e.target === e.currentTarget && local.onLocale?.(e)}
      on:nx-account-select={(e) => e.target === e.currentTarget && local.onSelect?.(e)}
      on:nx-account-view-as={(e) => e.target === e.currentTarget && local.onViewAs?.(e)}
      on:nx-account-extend={(e) => e.target === e.currentTarget && local.onExtend?.(e)}
      on:nx-account-expired={(e) => e.target === e.currentTarget && local.onExpired?.(e)}
      on:nx-account-logout={(e) => e.target === e.currentTarget && local.onLogout?.(e)}
    />
  );
}
