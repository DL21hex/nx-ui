# `<nx-account>`: integración

La tarjeta de cuenta al pie de `<nx-sidemenu>` (`slot="footer"`) y su panel: empresa/sede/rol,
estado, tema y color (vista previa en vivo y transición circular), enlaces de la app, idioma y
formatos, atajos, «Ver como…», bloquear, cerrar sesión (esperando la cola de `nx-sync`) y aviso de
vencimiento de sesión con «Extender».

Archivos: `account.ts` (entrada: tarjeta, sesión, acciones), `account-panel.ts` (contenido del
panel y sub-vistas, con `import()`), `logic.ts` (puro), `types.ts`, `account.css`, y los dos
**stubs** `lock.ts` / `view-as.ts` (se reemplazan por los del otro agente al unir; las firmas son
las del encargo).

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Account", { tag: "nx-account", props: ["user", "tenants", "current", "status", "items", "palettes", "locales", "storage", "applyLocale", "session", "expiresAt", "warnBefore", "viewAs", "viewAsSource", "lock", "lockEndpoint", "lockAfter", "logoutUrl", "labels", "locale", "disabled"] }],
```

(`user`, `tenants`, `items`, `palettes`, `locales`, `session`, `viewAs` y `labels` aceptan el objeto
o su JSON; los demás son atributos. Si el adaptador pasa las props en camelCase como propiedades,
`applyLocale`, `expiresAt`, `warnBefore`, `viewAsSource`, `lockEndpoint`, `lockAfter` y `logoutUrl`
**no** tienen propiedad: van como atributo con guion, igual que `auto-collapse` del sidemenu.)

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo, `import()` fuera).

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/account.js`: tarjeta, sesión, inactividad, acciones, comandos + núcleo | **9,23 KB** (9 452 B) | 9,75 KB |
| Con `--splitting` (solo `index.js`, sin los chunks compartidos) | 7,22 KB (7 390 B) | — |
| Chunk `account-panel-*.js` (vista principal, sub-vistas, teclado, posición) con lo que importa | **5,15 KB** (5 269 B) | 5,5 KB |
| `lock-*.js`, `view-as-*.js` | los del otro agente | los suyos |
| `sync/logic` (solo `nxSync.flush()` al salir con pendientes y sin `sync`): chunk ya existente | — | — |
| `dist/account.css` | **2,95 KB** (3 017 B) | 3,1 KB |

**Por qué el panel va aparte:** con todo en la entrada eran 12,5 KB. El chunk se pide cuando la página
queda libre (`requestIdleCallback`, tope 4 s) y antes si alguien apunta, enfoca o toca la tarjeta; si
aun así alguien abre en el primer instante, el panel se pinta al llegar (unos ms) y ahí toma el foco.
La prefetch en reposo existe para el caso «sin red»: cerrar sesión con cambios en cola ocurre justo
cuando no hay conexión, y el panel tiene que estar ya cargado. Si prefieres que la entrada lo lleve
todo, sube el límite a ~12,75 KB y cambia `loadPanel()` por un import estático (nada más depende de
que sea perezoso).

Para `scripts/size.mjs`:

```js
  ["dist/account.js", 9.75 * 1024, "account + núcleo (ESM; panel, lock, view-as y nxSync con import())"],
  [lazy("account-panel"), 5.5 * 1024, "panel de nx-account (se trae en reposo o al apuntar a la tarjeta)"],
  // …
  ["dist/account.css", 3.1 * 1024, "account (CSS)"],
```

`scripts/build-css.mjs`: `"account": "src/components/account/account.css",` — y el CSS de `lock` y
`view-as` del otro agente: o se importa desde `account.css` (`@import "./lock.css";`) o va como entrada
aparte; `account.css` hoy no lo importa (a propósito, lo decides al unir).

## Nav

En `gallery/main.ts`, dentro de `NAV`:

```ts
  { id: "account", label: "Cuenta", href: "#/account", icon: "user", section: "Componentes", badge: "Nuevo" },
```

En `PAGES`: `"#/account": { template: "page-account", mount: mountAccountDemo },` con
`import { mountAccountDemo } from "./demo-account";` e `import "./pages/account.css";`. La plantilla
está en `gallery/pages/account.html` para pegarla en `gallery/index.html`. `demo-account.ts` importa
`account.css` directamente (mientras `nx32-elements.css` no lo haga); esa línea sobra al unir.

La demo registra `/demo/account/unlock` (clave «1234»), `/demo/account/extend` y
`/demo/account/people?q=` con `addDemoRoute`, y le pone `account="acc"` al `#cmd` de la galería para
que <kbd>Ctrl</kbd> <kbd>K</kbd> «oscuro» o «bogotá» funcione.

### Choque de preferencias con la galería (decides al unir)

La galería ya guarda tema y paleta en `nx32-elements-gallery-theme` (`auto|light|dark`) y
`nx32-elements-gallery-palette`, y los aplica al cargar. Si la cuenta de la demo guardara en su propia clave,
al volver a la página de Cuenta aplicaría su tema viejo encima del de la galería. Lo que hace la demo
hoy: **`storage="none"`** (la cuenta no guarda ni aplica nada al conectar; lee el estado de `<html>`
al abrir) y, en `nx-account-theme`, escribe las claves de la galería y marca sus botones
`[data-theme-set]`. Costo: los «recientes» de empresa no persisten en la demo (con tres empresas no
se muestran de todos modos). Alternativa más limpia: que `gallery/main.ts` use `applyAccountPrefs("nx32-elements-gallery")`
y la demo `storage="nx32-elements-gallery"`, migrando las dos claves viejas.

## Solid

En `src/solid/index.tsx`: agregar `<Account>` al comentario de cabecera, y

```tsx
import "../components/account/index";
import type { NxAccount } from "../components/account/account";
import type { AccountItem, AccountLabels, AccountLocale, AccountPalette, AccountPerson, AccountSession, AccountStatus, AccountStatusDetail, AccountSwitchDetail, AccountTenant, AccountThemeDetail, AccountUser, AccountViewAsDetail, AccountLogoutDetail } from "../components/account/types";

export type { NxAccount, AccountItem, AccountLabels, AccountLocale, AccountPalette, AccountPerson, AccountSession, AccountStatus, AccountTenant, AccountUser };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      user: AccountUser | null | undefined;
      tenants: AccountTenant[] | undefined;
      palettes: (string | AccountPalette)[] | undefined;
      locales: AccountLocale[] | undefined;
      session: AccountSession | null | undefined;
      viewAs: AccountPerson | null | undefined;
      // `items`, `labels`, `current`, `status`: ampliar las uniones que ya existan.
    }
    interface ExplicitAttributes {
      storage: string | undefined; // ya existe (nx-command)
      "apply-locale": string | undefined;
      "expires-at": string | undefined;
      "warn-before": string | undefined;
      "view-as-source": string | undefined;
      "lock-endpoint": string | undefined;
      "lock-after": string | undefined;
      "logout-url": string | undefined;
    }
    interface ExplicitBoolAttributes {
      lock: boolean;
    }
    interface CustomEvents {
      "nx-account-switch": CustomEvent<AccountSwitchDetail>;
      "nx-account-status": CustomEvent<AccountStatusDetail>;
      "nx-account-theme": CustomEvent<AccountThemeDetail>;
      "nx-account-locale": CustomEvent<{ locale: string }>;
      "nx-account-select": CustomEvent<{ id: string }>;
      "nx-account-view-as": CustomEvent<AccountViewAsDetail>;
      "nx-account-extend": CustomEvent<{ session: AccountSession | null }>;
      "nx-account-expired": CustomEvent<{ expiresAt: number | null }>;
      "nx-account-logout": CustomEvent<AccountLogoutDetail>;
    }
    interface IntrinsicElements {
      "nx-account": HTMLAttributes<NxAccount>;
    }
```

El envoltorio:

```tsx
export interface AccountProps extends JSX.HTMLAttributes<NxAccount> {
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
  warnBefore?: number;
  viewAs?: AccountPerson | null;
  viewAsSource?: string;
  lock?: boolean;
  lockEndpoint?: string;
  lockAfter?: number;
  logoutUrl?: string;
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
  const [local, rest] = splitProps(props, ["user", "tenants", "current", "status", "items", "palettes", "locales", "storage", "applyLocale", "session", "warnBefore", "viewAs", "viewAsSource", "lock", "lockEndpoint", "lockAfter", "logoutUrl", "labels", "locale", "disabled", "onSwitch", "onStatus", "onTheme", "onLocale", "onSelect", "onViewAs", "onExtend", "onExpired", "onLogout"]);
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
      prop:labels={local.labels}
      attr:current={local.current}
      attr:status={local.status}
      attr:storage={local.storage}
      attr:apply-locale={local.applyLocale === false ? "false" : undefined}
      attr:warn-before={local.warnBefore === undefined ? undefined : String(local.warnBefore)}
      attr:view-as-source={local.viewAsSource}
      attr:lock-endpoint={local.lockEndpoint}
      attr:lock-after={local.lockAfter === undefined ? undefined : String(local.lockAfter)}
      attr:logout-url={local.logoutUrl}
      attr:locale={local.locale}
      bool:lock={!!local.lock}
      bool:disabled={!!local.disabled}
      on:nx-account-switch={(e) => local.onSwitch?.(e)}
      on:nx-account-status={(e) => local.onStatus?.(e)}
      on:nx-account-theme={(e) => local.onTheme?.(e)}
      on:nx-account-locale={(e) => local.onLocale?.(e)}
      on:nx-account-select={(e) => local.onSelect?.(e)}
      on:nx-account-view-as={(e) => local.onViewAs?.(e)}
      on:nx-account-extend={(e) => local.onExtend?.(e)}
      on:nx-account-expired={(e) => local.onExpired?.(e)}
      on:nx-account-logout={(e) => local.onLogout?.(e)}
    />
  );
}
```

(`status` es controlable: si la app lo pasa, al elegir otro estado en el panel la cuenta pone el
atributo y avisa; la app lo guarda y lo vuelve a pasar. Igual `current`.)

## README

````md
## `<nx-account>`

**La cuenta, al pie del menú.** Avatar con su punto de estado, nombre y «Empresa · Sede». Un clic y
está todo lo de la persona, en un panel sobrio que se abre hacia arriba (a la derecha del riel
compacto; en el celular, una hoja desde abajo):

- **Empresa, sede y rol**: selector en el mismo panel, con buscador sin tildes, recientes, agrupado por
  empresa y 1–9 como atajo. `nx-account-switch` es cancelable.
- **Estado**: En línea, Ausente, No molestar (1 h, hoy o sin fin). El avatar también dice si hay
  cambios en cola (anillo ámbar) o si no hay conexión (punto gris), de `<nx-sync>`.
- **Tema y color**: Claro/Sistema/Oscuro y las paletas de `palettes.css`. Pasar el mouse por un color
  repinta toda la app; al elegir, el cambio crece como un círculo desde el clic (View Transitions).
  Se guarda en `localStorage` y se aplica al cargar (`applyAccountPrefs()` en el `<head>` evita el destello).
- **Idioma y formatos**: cada locale con su muestra («1.234.567,50 · 26 sept 2026»); elegir pone
  `<html lang>` y toda la librería lo sigue.
- **Ver como…**, **Bloquear pantalla** (<kbd>Ctrl</kbd> <kbd>L</kbd> y por inactividad) y **Cerrar
  sesión** sin «¿Seguro?»: si hay cambios sin sincronizar, se envían antes (con tope y «Salir de
  todos modos»).
- **Sesión por vencer**: «Tu sesión vence en 4:59 · Extender», un solo anuncio para el lector de pantalla.
- **Paleta de comandos**: `<nx-command account="cuenta">` suma sus acciones («Tema: Oscuro», «Color:
  Océano», cada sede…).

```html
<nx-sidemenu id="menu">
  <nx-account slot="footer" id="cuenta" user='{"name":"Diego Llinás","email":"diego@crear.co"}'
    tenants='[{"id":"med","name":"Crear Colombia S.A.S.","detail":"Sede Medellín","role":"Aprobador"}]' current="med"
    session='{"expiresAt":"2026-09-26T18:00:00Z","extendEndpoint":"/api/sesion/extender"}'
    lock-endpoint="/api/desbloquear" lock-after="15" logout-url="/salir"></nx-account>
</nx-sidemenu>
<nx-command account="cuenta"></nx-command>
```

| | |
|---|---|
| Propiedades / atributos | `user`, `tenants`, `current`, `status` (`online`, `away`, `dnd`), `items`, `palettes`, `locales`, `storage` (`nx-account`; `none`), `apply-locale`, `session` / `expires-at`, `warn-before` (min, 5), `view-as`, `view-as-source`, `lock`, `lock-endpoint`, `lock-after` (min), `logout-url` (mismo origen), `labels`, `locale`, `disabled` · propiedades `sync` (cola de nx-sync), `lockVerify`, `commands` (solo lectura), `open` |
| Métodos | `show()`, `hide()`, `lock()`, `logout()` |
| Eventos | `nx-account-switch` `{tenant}` (cancelable), `nx-account-status` `{status, until}`, `nx-account-theme` `{theme, palette}`, `nx-account-locale` `{locale}`, `nx-account-select` `{id}`, `nx-account-view-as` `{user}` (cancelable al entrar), `nx-account-extend` (cancelable), `nx-account-expired`, `nx-account-logout` `{pending}` (cancelable), `nx-open-change` `{open}` |
| Funciones | `applyAccountPrefs(storage?)`, `accountCommands()`, `accountInitials()`, `sessionRemaining()`, `sessionPhase()`, `formatSessionRemaining()` («4:59»), `normalizePalettes()`, `pickTheme()`, `revealRadius()`, `accountStatusUntil()`, `BUILTIN_PALETTES` |
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/account/index";`. Nombres revisados contra lo
  exportado hoy: `NxAccount`, `ACCOUNT_LABELS`, `applyAccountPrefs`, `accountCommands`,
  `accountInitials`, `formatSessionRemaining`, `normalizePalettes`, `pickTheme`, `revealRadius`,
  `sessionPhase`, `sessionRemaining`, `accountStatusUntil`, `BUILTIN_PALETTES` y los tipos `Account*`
  son nuevos (sin choque con `formatElapsed`, `countdown` de handoff, `initials`, etc.).
- `src/styles/nx32-elements.css` → `@import "../components/account/account.css";`
- `vite.config.ts` → `account: "src/components/account/index.ts",`
- `scripts/build-css.mjs` → `"account": "src/components/account/account.css",`
- `package.json` → `"./account": { "types": "./dist/types/components/account/index.d.ts", "import": "./dist/account.js" }`
  y `"./account.css": "./dist/account.css"`. `sideEffects` ya cubre los chunks con hash.
- `README.md` → la sección de arriba.

### Cambio en `src/components/command/*` (permitido por el encargo)

`<nx-command>` ya tenía `menu="id"`; se agregó lo mínimo para `account="id"`: la propiedad/atributo
`account` (y en `PROPS`), y en `#pool()` las entradas de `document.getElementById(account).commands`
(pasadas por `cleanItems`, como todo) entre las propias y las del menú. Nada más: **quien ejecuta** es
la cuenta, que oye `nx-command-select` en `document` y solo actúa sobre entradas con su
`data.account` (y si la app no lo canceló). Así también sirve sin el atributo:
`cmd.items = [...mias, ...cuenta.commands]`. Pruebas en `test/account.dom.test.ts`
(«`<nx-command account="id">`»); las de command siguen pasando.

### Aplicar el tema antes del primer pintado

`applyAccountPrefs()` corre al conectar la cuenta. Con el `<script>` de la librería en el `<head>`
(IIFE) eso ya es antes del primer pintado; con módulos (diferidos), el snippet mínimo para el `<head>`:

```html
<script>try{var p=JSON.parse(localStorage.getItem("nx-account")||"{}"),d=document.documentElement;if(p.theme==="light"||p.theme==="dark")d.dataset.theme=p.theme;else if(p.theme==="system")d.removeAttribute("data-theme");if(/^[\w-]{1,40}$/.test(p.palette||""))d.dataset.nxPalette=p.palette}catch(e){}</script>
```

## Decisiones

- **La vista previa y la transición:** pasar el mouse (o el foco) por una muestra repinta la app al
  instante; salir sin elegir vuelve a lo que había, aunque no lo hubiera puesto la cuenta. Al hacer
  clic con la vista previa puesta, se vuelve primero a la elegida y el círculo crece desde el clic con
  la nueva: la transición confirma la elección en vez de no verse (sin esto, con mouse nunca se vería).
  Con el tacto no hay vista previa (no hay «pasar por encima»), así que el círculo va directo.
  Solo el tema y la paleta usan `html[data-nx-reveal]`, así que las demás View Transitions de la app
  (el «morph» de `<nx-dialog>`) conservan su fundido.
- **`storage` guarda `{theme, palette, recent}`**, no el idioma: el locale suele vivir en el perfil del
  servidor (y afecta lo que el servidor pinta); `nx-account-locale` avisa para que la app lo guarde.
- **«No molestar hasta…»** es un tercer `setTimeout` (además de sesión e inactividad), solo mientras hay
  un «hasta»; al cumplirse vuelve a En línea y avisa `nx-account-status`.
- **Inactividad barata:** los eventos (`pointermove`, teclas, rueda, toques) solo anotan la hora; un
  único `setTimeout` al cumplirse mira la última y se reprograma por lo que falte. `visibilitychange`
  revisa sesión e inactividad (tras suspender el equipo, bloquea al volver).
- **Sesión:** un `setTimeout` (con `clampDelay`) hasta el tramo del aviso; en el tramo, un intervalo de
  1 s que solo cambia el texto de la cuenta regresiva. Se anuncia una vez al entrar
  («vence en 5 min. Puedes extenderla.») y una al vencer. «Extender» emite primero
  `nx-account-extend` (cancelable); si no se cancela y hay `extendEndpoint`, `POST` y toma `{expiresAt}`.
- **Pendientes de sincronizar:** `nx-sync-change` en `document` (de un `<nx-sync>`) y, si la app la
  pasa, la cola en `sync` (`subscribe`/`flush`). Al salir con pendientes: `sync.flush()` o, sin `sync`,
  `import("../sync/logic")` → `nxSync.flush()`. Tope de 10 s: pasado, la franja dice que quedan
  guardados en el equipo y espera a «Salir de todos modos» (no sale sola: podrían perderse).
- **Cerrar sesión cancelable** (`nx-account-logout`), `{pending}` dice cuántos quedaron sin enviar.
  `logout-url` pasa por `safeHref` y debe ser del mismo origen; si no, se ignora con un aviso.
- **«Atajos de teclado · Alt»** cierra el panel y llama `show()` del primer `<nx-keytips>`; sin uno,
  `nx-account-select {id: "shortcuts"}`. La fila está siempre.
- **Bloquear:** la fila y <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>L</kbd> solo con `lock` o `lock-endpoint`;
  `lock()` como método funciona siempre (hay usuario). A `nxLock` le llegan los `labels` tal cual
  (los de la pantalla de bloqueo pueden ir en el mismo objeto), `locale` y `onLogout → logout()`.
  Sin endpoint, la propiedad `lockVerify` pasa la verificación de la app.
- **Ver como:** la franja la pone el módulo del otro agente; la cuenta la quita al desconectarse y la
  vuelve a mostrar al conectar si `viewAs` sigue puesto. Salir desde la franja o desde el panel emite
  `{user: null}`. Las personas del servidor se muestran en su orden (máx. 50), con `safeEndpoint`,
  espera de 250 ms entre teclas y `AbortController`.
- **Paleta de comandos:** entradas planas (no submenús) para que «oscuro», «océano» o «bogotá» las
  encuentren desde la raíz; grupos «Tema», «Empresa y sede», «Idioma y formatos», «Cuenta».
- **Paletas:** `["indigo", …]` o `{id, label, color}`. Sin `color`, la muestra lleva su propio
  `data-nx-palette` y la pintan los tokens (siempre fiel a la paleta y al tema). Con paleta propia, la
  app define su `[data-nx-palette="marca"]`. La elegida lleva anillo y un punto (no solo color).
- **Estado en la tarjeta** también como texto oculto («· No molestar Sin conexión 3 cambios…»); en el
  riel compacto el nombre queda oculto a la vista pero no al lector ni a `<nx-keytips>`.
- **Clics dentro del menú:** los botones de la cuenta usan `data-k` y nunca `data-nx-key`/`data-nx-back`,
  así `<nx-sidemenu>` no los toma como hojas (hay prueba).
- **Nada de `CSS.escape`** (happy-dom no lo tiene): la búsqueda por `data-k` recorre los botones.

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el diseño (panel, hoja móvil, riel compacto,
  modo oscuro, las 9 paletas), ni axe/contraste (`npm run contrast` no corrió), ni Playwright.
- La transición circular real (`startViewTransition` + `clip-path` en `::view-transition-new(root)`)
  y si el «volver a la elegida y crecer» con la vista previa puesta se ve bien o como un parpadeo.
  Las pruebas solo verifican que se llama y con qué círculo.
- La posición del panel (arriba de la tarjeta, a la derecha del riel, hacia abajo si no cabe) con
  medidas reales; en happy-dom se simularon los rectángulos.
- Que <kbd>Ctrl</kbd>+<kbd>L</kbd> se pueda interceptar en cada navegador (en algunos enfoca la barra de
  direcciones antes de llegar a la página).
- `requestIdleCallback` real para traer el panel y el primer clic «en frío».
- Escape nativo del popover en el panel del navegador de Claude (se atiende a mano, como el sidemenu).
- La integración con los `lock.ts`/`view-as.ts` reales del otro agente (aquí van simulados).
