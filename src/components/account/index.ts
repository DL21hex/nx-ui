import { define } from "../../core/define";
import { NxAccount } from "./account";

define("nx-account", NxAccount);

export { NxAccount, ACCOUNT_LABELS, applyAccountPrefs } from "./account";
export {
  accountCommands,
  accountInitials,
  formatRemaining as formatSessionRemaining,
  normalizePalettes,
  pickTheme,
  revealRadius,
  sessionPhase,
  sessionRemaining,
  statusUntil as accountStatusUntil,
  BUILTIN_PALETTES,
} from "./logic";
export type {
  AccountCommand,
  AccountItem,
  AccountLabels,
  AccountLocale,
  AccountLogoutDetail,
  AccountPalette,
  AccountPerson,
  AccountPrefs,
  AccountSession,
  AccountStatus,
  AccountStatusDetail,
  AccountSwitchDetail,
  AccountSyncQueue,
  AccountTenant,
  AccountTheme,
  AccountThemeDetail,
  AccountUser,
  AccountViewAsDetail,
} from "./types";

declare global {
  interface HTMLElementTagNameMap {
    "nx-account": NxAccount;
  }
  interface HTMLElementEventMap {
    "nx-account-switch": CustomEvent<import("./types").AccountSwitchDetail>;
    "nx-account-status": CustomEvent<import("./types").AccountStatusDetail>;
    "nx-account-theme": CustomEvent<import("./types").AccountThemeDetail>;
    "nx-account-locale": CustomEvent<{ locale: string }>;
    "nx-account-select": CustomEvent<{ id: string }>;
    "nx-account-view-as": CustomEvent<import("./types").AccountViewAsDetail>;
    "nx-account-extend": CustomEvent<{ session: import("./types").AccountSession | null }>;
    "nx-account-expired": CustomEvent<{ expiresAt: number | null }>;
    "nx-account-logout": CustomEvent<import("./types").AccountLogoutDetail>;
  }
}
