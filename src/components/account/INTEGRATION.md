# `<nx-account>`: integración

La tarjeta de cuenta al pie de `<nx-sidemenu>` (`slot="footer"`) y su panel: empresa/sede/rol,
estado, tema y color (vista previa en vivo y transición circular), enlaces de la app, idioma y
formatos, atajos, «Ver como…», cerrar sesión (esperando la cola de `nx-sync`) y aviso de
vencimiento de sesión con «Extender». La API pública está en la sección `<nx-account>` del README.

Archivos: `account.ts` (entrada: tarjeta, sesión, acciones), `account-panel.ts` (contenido del
panel y sub-vistas, con `import()`), `view-as.ts` y `view-as.css` (la franja de «Ver como», con
`import()`; ver `VIEW-AS.md`), `logic.ts` (puro), `types.ts` y `account.css` (importa `view-as.css`).

La pantalla de bloqueo (`nxLock`, `lock`, `lock-after`, `lock-endpoint`, `lockVerify`, <kbd>Ctrl</kbd>
<kbd>L</kbd>) se quitó el 2026-10-03: un bloqueo solo de la pestaña y del cliente prometía más de lo
que daba (otra pestaña con la URL entraba sin clave).

## BDUI

El registro (`src/bdui.ts`) toma las props de los setters de la clase. `user`, `tenants`, `items`,
`palettes`, `locales`, `session`, `viewAs` y `labels` aceptan el objeto o su JSON; los demás son
atributos (también como propiedad en camelCase: `logoutUrl`, `viewAsSource`…). Quitar un atributo JSON
equivale a `null`: sin usuario, sin franja, los textos por defecto.

`sync` es el **nombre** de la cola (`createSync({name: "nx-sync:" + id})`), no el objeto: todo se
serializa (principio 2). La cuenta la busca en el registro de `nx-sync` (`onSyncQueue`, con
`import()`) y, si la app aún no la creó, espera a que la cree. Sin `sync`, escucha `nx-sync-change` de
un `<nx-sync>` de la página y, al salir con pendientes, usa `nxSync.flush()`.

## Peso

`scripts/size.mjs` (min + gzip, con el núcleo que arrastran), al 2026-10-03:

| Pieza | Tamaño | Referencia |
|---|---|---|
| `dist/account.js`: tarjeta, sesión, acciones, comandos + núcleo | 9,45 KB | 9,75 KB |
| Cuenta + chunk `account-panel-*.js` (lo que baja la página con el panel) | 12,70 KB | 13 KB |
| `view-as-*.js` | 1,24 KB | 1,75 KB |
| `dist/account.css` (con `view-as.css`) | 3,33 KB | 4,25 KB |

**Por qué el panel va aparte:** con todo en la entrada, la tarjeta sola bajaría ≈ 12,7 KB en vez de
9,45. El chunk se pide cuando la página queda libre (`requestIdleCallback`, tope 4 s) y antes si
alguien apunta, enfoca o toca la tarjeta; si aun así alguien abre en el primer instante, el panel se
pinta al llegar (unos ms) y ahí toma el foco. La precarga en reposo existe para el caso «sin red»:
cerrar sesión con cambios en cola ocurre justo cuando no hay conexión. Por lo mismo, con
`view-as-source` o `viewAs` también se trae en reposo la franja de «Ver como».

## Decisiones

- **La vista previa y la transición:** pasar el mouse (o el foco) por una muestra repinta la app al
  instante; salir sin elegir vuelve a lo que había, aunque no lo hubiera puesto la cuenta. Al hacer
  clic con la vista previa puesta, se vuelve primero a la elegida y el círculo crece desde el clic con
  la nueva. Con el tacto no hay vista previa. Solo el tema y la paleta usan `html[data-nx-reveal]`,
  así que las demás View Transitions de la app (el «morph» de `<nx-dialog>`) conservan su fundido.
- **`storage` guarda `{theme, palette, recent}`**, no el idioma: el locale suele vivir en el perfil del
  servidor; `nx-account-locale` avisa para que la app lo guarde.
- **Temporizadores:** cerrado, solo un `setTimeout` de la sesión (con `clampDelay`; en el tramo del
  aviso, un intervalo de 1 s que solo cambia el texto) y otro mientras hay un «No molestar hasta…».
  Se anuncia una vez al entrar al aviso y una al vencer. «Extender» emite `nx-account-extend`
  (cancelable); si no se cancela y hay `extendEndpoint`, `POST` y toma `{expiresAt}`.
- **En su lugar:** la tarjeta se arma una vez y `#paint` cambia sus textos; el avatar solo se rehace si
  cambia la foto o las iniciales. Un `nx-sync-change` toca `data-sync`, el texto oculto de la tarjeta y,
  cerrando sesión, el número de la franja del panel: nada más (ni la tarjeta ni el panel se rehacen).
  El panel se rehace entero solo cuando cambian datos que muestra (usuario, empresas, paletas…).
- **Avatar que no carga** (una URL firmada vencida): las iniciales, en la tarjeta, el panel y las
  personas de «Ver como».
- **Paletas:** `["indigo", …]` o `{id, label, color}`. `color` pasa por `safePaletteColor` (hex, nombre,
  función de color o `var(--x)`): lo demás se descarta, porque va al atributo `style` y puede venir del
  servidor. Sin `color`, la muestra lleva su propio `data-nx-palette` y la pintan los tokens.
- **Pendientes de sincronizar:** con `sync="nx-sync:ana"`, la cola de ese nombre (`subscribe`/`flush`),
  y se ignora el `nx-sync-change` de la página (es de `nxSync`, otra cola). Sin `sync`, el
  `nx-sync-change` en `document` (de un `<nx-sync>`) y, al salir, `import("../sync/logic")` →
  `nxSync.flush()`. Con `sync` y la cola sin crear, salir no vacía `nxSync`. Cambiar `sync` suelta la
  anterior y vuelve a contar. Tope de 10 s: pasado, la franja dice que quedan guardados en el equipo y
  espera a «Salir de todos modos» (no sale sola: podrían perderse). Lo que queda es de esta persona en
  este equipo: la app usa una cola por usuario (`createSync({name})`), **pone su nombre en `sync`** y,
  en `nx-account-logout` con `pending > 0`, decide si la vacía.
- **Cerrar sesión cancelable** (`nx-account-logout`, `{pending}`). `logout-url` pasa por `safeHref` y
  debe ser del mismo origen. Por defecto sale con un `POST` (un `<form>` creado y enviado, con el token
  de `logout-csrf` en `logout-csrf-field`, `_csrf`): un `GET` que cierra sesión lo dispara una `<img>`
  de otro sitio o un precargador. El formulario lleva `target="_self"` (un `<base target>` de la página
  no lo manda a otra pestaña) y se quita del `body` al segundo. `logout-method="get"` navega con
  `location.assign`.
- **Ver como:** entrar y salir emiten `nx-account-view-as`, cancelable; si la app cancela la salida, la
  franja sigue hasta que asigne `viewAs = null`. La cuenta lleva `data-view-as="{id}"` mientras hay
  suplantación; si el módulo de la franja no carga, el CSS marca la tarjeta (`html:not([data-nx-view-as])`),
  su texto oculto dice «Viendo como {name}.» (`labels.viewingAs`) y se reintenta (1 s, 2 s… hasta 30 s;
  una sola cadena de reintentos, aunque se pida dos veces, y un error de `showViewAsBanner` también
  reintenta). La franja se quita al desconectar la cuenta y vuelve al
  conectar si `viewAs` sigue puesto: un layout sin `<nx-account>` no muestra la franja. Las personas del
  servidor se muestran en su orden (máx. 50), con `safeEndpoint`, 250 ms entre teclas y `AbortController`.
- **Sub-vistas:** cerrar el panel (elegir, clic fuera) descarta la sub-vista; al reabrir, el foco va a la
  vista principal. Si `tenants` cambia con la de empresas abierta, la lista se repinta.
- **«Atajos de teclado · Alt»** cierra el panel y llama `show()` del primer `<nx-keytips>`; sin uno,
  `nx-account-select {id: "shortcuts"}`.
- **Paleta de comandos:** `<nx-command account="id">` suma `commands` (entradas planas, para que
  «oscuro», «océano» o «bogotá» las encuentren desde la raíz). `commands` devuelve el mismo arreglo
  mientras no cambien los textos, las paletas, las empresas, los idiomas ni `view-as-source`: la
  paleta abierta lo compara en cada tecla y, si la cuenta cambió, lo lee de nuevo. Quien ejecuta es la cuenta, que oye
  `nx-command-select` en `document` y solo actúa sobre entradas con su `data.account` (si la app no lo
  canceló).
- **Clics dentro del menú:** los botones de la cuenta usan `data-k` y nunca `data-nx-key`/`data-nx-back`,
  así `<nx-sidemenu>` no los toma como hojas.
- **Nada de `CSS.escape`** (happy-dom no lo tiene): la búsqueda por `data-k` recorre los botones.

### Aplicar el tema antes del primer pintado

`applyAccountPrefs()` corre al conectar la cuenta. Con el `<script>` de la librería en el `<head>`
(IIFE) eso ya es antes del primer pintado; con módulos (diferidos), el snippet mínimo para el `<head>`:

```html
<script>try{var p=JSON.parse(localStorage.getItem("nx-account")||"{}"),d=document.documentElement;if(p.theme==="light"||p.theme==="dark")d.dataset.theme=p.theme;else if(p.theme==="system")d.removeAttribute("data-theme");if(/^[\w-]{1,40}$/.test(p.palette||""))d.dataset.nxPalette=p.palette}catch(e){}</script>
```

### La galería

La galería guarda tema y paleta en `nx32-elements-gallery-theme` y `nx32-elements-gallery-palette`. La
demo va con `storage="none"` y, en `nx-account-theme`, escribe esas claves y marca sus botones: así no
hay dos preferencias peleándose. La demo registra `/demo/account/extend` y `/demo/account/people?q=`
con `addDemoRoute`, y le pone `account="acc"` al `#cmd` de la galería. Los cambios en cola van a una
cola de verdad, `createSync({name: "nx-sync:demo-cuenta"})` en memoria, con un «servidor» que tarda 4 s
por envío; la cuenta la toma con `sync="nx-sync:demo-cuenta"`.

## No verificado (sin navegador)

- El diseño (panel, hoja móvil, riel compacto, modo oscuro, las 9 paletas), axe y contraste.
- La transición circular real (`startViewTransition` + `clip-path` en `::view-transition-new(root)`).
- La posición del panel con medidas reales, y que no quede detrás de la franja de «Ver como».
- El envío real del formulario `POST` de salida (cookies `SameSite`, el token) contra un servidor.
- La marca de la tarjeta cuando la franja no carga, y si un `import()` fallido se reintenta de verdad
  (algunos navegadores recuerdan el fallo del módulo hasta recargar).
- `requestIdleCallback` real para traer el panel y el primer clic «en frío».
