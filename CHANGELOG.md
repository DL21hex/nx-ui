# Registro de cambios

## 0.2.0 — 2026-10-03

Revisión de calidad multiagente de `<nx-button>`, `<nx-select>`, `<nx-dialog>`, `<nx-tabs>`,
`<nx-fields>`, `<nx-notice>`, `<nx-badge>`, `<nx-sidemenu>`, `<nx-breadcrumb>`, `<nx-command>`,
`<nx-launcher>`, `<nx-account>`, `<nx-grid>` y de lo transversal (núcleo, empaquetado, BDUI,
envoltorios de Solid y tokens). Cada hallazgo pasó por una verificación adversarial antes de
arreglarse, y cada arreglo, por una revisión de su diff. Son unos 200 arreglos de corrección,
seguridad, accesibilidad, rendimiento y estabilidad, con sus pruebas (vitest y Playwright en
Chromium y Firefox).

**Esta versión rompe la API.** Lee «Migrar desde 0.1» antes de actualizar.

### Migrar desde 0.1

**Eventos.** Cada evento propio de un componente se llama ahora `nx-<componente>-<acción>`.
`nx-open-change` sigue siendo el evento compartido. Los controles de formulario emiten además un
`change` nativo que burbujea, para el código genérico (marcar sucio, frameworks).

| Antes | Ahora |
|---|---|
| `nx-done` (`<nx-button>`) | `nx-button-done` |
| `nx-change` (`<nx-select>`) | `nx-select-change` (+ `change` nativo) |
| `nx-change` (`<nx-number>` y la corrección de `<nx-guard>`) | `nx-number-change` |
| `nx-change` (`<nx-date-range>`) | `nx-date-range-change` (+ `change` nativo) |
| `nx-change` (`<nx-recurrence>`) | `nx-recurrence-change` |
| `nx-select` (`<nx-sidemenu>`) | `nx-sidemenu-select` |
| `nx-toggle` (`<nx-sidemenu>`) | `nx-sidemenu-toggle` |
| `nx-tab-change` (`<nx-tabs>`) | `nx-tabs-change` (tipo `TabsChangeDetail`; `TabChangeDetail` queda como alias obsoleto) |
| `nx-ai-start`, `-done`, `-action`, `-feedback` | `nx-ai-answer-start`, `-done`, `-action`, `-feedback` |
| `nx-capture-file`, `-start`, `-done`, `-change`, `-submit` | `nx-doc-capture-file`, `-start`, `-done`, `-change`, `-submit` |
| `nx-keytip` | `nx-keytips-activate` (Solid: `onKeytip` → `onActivate`) |
| `nx-scan` | `nx-scan-read` (Solid: `onScan` → `onRead`) |

Ya no existe la declaración global de `nx-change` en `HTMLElementEventMap`. Si escuchabas
`nx-change` para marcar un formulario como modificado, escucha `change`.

**Nada de props que sean funciones u objetos vivos** (principio 2):

- `<nx-breadcrumb>`: se quitó `loadChildren` (y el tipo `BreadcrumbLoader`). Para pedir los
  hermanos bajo demanda, usa el atributo `children-endpoint` (plantilla con `{id}` y `{level}`,
  del mismo origen) o atiende el evento cancelable `nx-breadcrumb-expand` y responde con
  `detail.respond(...)`. En Solid: `childrenEndpoint` y `onExpand`. Sin `children-endpoint`, un
  nivel sin `children` solo abre su separador si lleva `expandable: true`.
- `<nx-account>`: `sync` es ahora el **nombre** de la cola de `nx-sync` (atributo y propiedad de
  texto, p. ej. `sync="nx-sync:ana"`), no el objeto de la cola. Se quitó `AccountSyncQueue`.
- BDUI: una clase puede declarar `static localProps`; `propsOf()` no las lista y `render()` las
  rechaza con aviso.

**Envoltorios de Solid.** Ignoran los eventos del mismo nombre que burbujean desde un hijo (antes
un `<nx-date-range>` dentro de un `<Dialog>` controlado cerraba el diálogo). Los que no tienen
hijos ya no aceptan `children`.

### Eliminado

- **Bloqueo de pantalla de `<nx-account>`**: atributos `lock`, `lock-after` y `lock-endpoint`,
  propiedad `lockVerify`, método `lock()`, Ctrl+L, la fila y el comando «Bloquear»
  (`account:lock`), el evento `nx-lock-change`, `sessionStorage["nx-locked"]`,
  `data-nx-locked` y su label. Era un bloqueo solo de la pestaña y del cliente: abrir la app en
  otra pestaña lo saltaba sin herramientas.

### Cambios por componente

**`<nx-grid>`**
- La edición abierta ya no cae en otra fila cuando cambian los datos, el filtro o el orden. Si la
  app reasigna `rows`, `filters`, `sort`, `search`, `columns` o `group-by`, sigue abierta en su
  fila. Si la fila quedó oculta, se guarda en su registro. Si desaparece la fila o la columna, se
  descarta y se anuncia (`labels.editLost`). Con `source`, se guarda antes de cada consulta.
- Teclado según el patrón grid de la APG: la tabla es una sola parada de Tab. ↑ desde la primera
  fila lleva a la cabecera, ←/→ recorren las cabeceras, Alt+↓ abre el filtro y Ctrl+←/→ cambia
  el ancho. Los botones de la cabecera y las asas ya no son paradas de Tab.
- `row-key` se observa: asignarlo después de `rows` reindexa. Un id repetido recibe un id
  posicional y se avisa por consola.
- Columnas y filtros que llegan de BDUI se normalizan (opciones, anchos, tipos, valores de
  `in`/`notIn`, rangos).
- Las filas guardadas son objetos sin prototipo (`Object.create(null)`).
- Con `source`: un bloque que falla emite `nx-grid-error` y se reintenta con espera creciente
  (hasta 5 veces; después, «Reintentar» o `refresh()`). El aviso sin filas pasa de `<p>` a
  `div[role=row]` (misma clase). Los bloques lejanos se liberan. El alto virtual tiene un tope
  (8.000.000 px) con escala. Asignar `rows` o `columns` ya no vuelve a pedir datos.
- `exportXlsx()` resuelve con el número de filas y emite `nx-grid-export`. Los errores de
  exportación se anuncian. La hoja se arma por partes, sin el límite de cadena de V8.
- Rendimiento: filtrar o buscar ya no reordena todo (el orden se cachea), `in`/`notIn` usan `Set`
  y el texto plegado se calcula una vez por dato.
- Foco y celda activa visibles en alto contraste (forced-colors).
- `facets-open` abre el panel de arranque solo si cabe al lado de la tabla (640 px o más); más
  angosta, queda cerrado tras el botón «Filtros». Se juzga una vez, y lo que se abra con el botón
  no se vuelve a cerrar.

**`<nx-select>`**
- Participa de verdad en formularios: `required` con aviso visible, `reset()` vuelve al valor
  inicial, `name` tardío, `<fieldset disabled>` y la API de validez. `checkValidity()` del
  elemento no marca `aria-invalid` (`reportValidity()` y el envío fallido, sí).
- Enter en el buscador sin resultado ya no envía el formulario.
- `<label for>` y `aria-labelledby` le dan nombre al combobox. El combobox declara
  `aria-haspopup="dialog"` y el popover es `role="dialog"`. El buscador ya no usa `autofocus`.
- Un `value` repetido en las opciones se descarta con aviso. `multiple` ya no recorta el valor
  inicial según el orden de las props.

**`<nx-button>`**
- Los clics en el envoltorio, en «Registro» o en su panel ya no saltan `busy`, `disabled` ni
  `hold`. Acepta `type="reset"`, `name`, `value` e `icon-only` (con nombre accesible).
- El registro se actualiza en su lugar: el lector de pantalla solo anuncia lo nuevo.
- La pulsación larga (`hold`) no abre el menú contextual del toque largo.

**`<nx-dialog>`**
- Abrir y cerrar seguidos (con View Transitions) ya no desincroniza el estado.
- Tab sigue el orden en que se ve (cabecera, cuerpo, aviso, pie) sin atrapar el foco. Al cerrar
  un panel apilado, el foco vuelve al botón que lo abrió.
- Escape dentro de un popover del autor cierra solo el popover. Las tarjetas de la librería
  (`nx-explain`, `nx-trend`, `nx-tour`) reciben el foco encima del diálogo.
- Sin `heading` no pone `aria-labelledby`, y respeta el del autor.

**`<nx-tabs>`, `<nx-fields>`, `<nx-notice>`, `<nx-badge>`**
- `<nx-tabs>`: botones actualizados en su lugar, pestaña activa visible en alto contraste, orden
  de lectura con `aria-owns` y contadores con `nxFormat`.
- `<nx-fields>`: un repintado ya no borra lo escrito ni el foco (en los items con `key`). Ningún
  número se redondea sin que la persona lo toque. Nuevo método `reset()`.
- Quitar un atributo JSON (`items`, `labels`, `actions`, `errors`…) vuelve al valor por defecto.

**`<nx-sidemenu>`**
- Un cambio de `items`, `labels` o `collapsed` ya no cierra el flotante abierto: espera a que se
  cierre.
- En compacto, el nombre de cada ítem sale en una etiqueta flotante accesible (antes `title`).
- `open` sale de `beforetoggle`/`toggle` y se resetea al sacar el drawer del DOM.

**`<nx-breadcrumb>`**
- El menú de hermanos tiene tabindex itinerante y foco visible en alto contraste. Tab vuelve al
  separador. Abre hacia arriba cerca del borde, sigue a RTL y no abre el teclado virtual en
  táctil.
- Si el módulo del menú no carga, el separador navega al `href` de su nivel.

**`<nx-command>` y `<nx-launcher>`**
- Un atajo sin modificador («/») funciona con teclados español y latinoamericano, y escribirlo en
  la caja no cierra la paleta. Respeta IME (`isComposing`).
- La paleta se reabre tras sacarla del DOM abierta. El resaltado no salta al llegar `source`, y
  la lista vuelve arriba al escribir.
- Se anuncian «N resultados», «Sin resultados», «Buscando…» y los errores. El listbox nunca queda
  sin opciones.
- `<nx-launcher>`: las vistas ocultas siguen en el árbol de accesibilidad, el medidor tiene
  texto y los enlaces inseguros se descartan.

**`<nx-account>`**
- Cierre de sesión por **POST** (formulario con `logout-csrf` en `logout-csrf-field`, `_csrf`
  por defecto). `logout-method="get"` conserva la navegación GET.
- Salir de «Ver como» es cancelable (`nx-account-view-as {user:null}`). La franja va en la
  entrada y se reintenta si falla.
- Inyección de CSS por el color de una paleta, el reemplazo con `$&` en los textos y los avatares
  rotos, arreglados. Quitar un atributo JSON resetea la propiedad.

### Núcleo, empaquetado y tokens

- Nueva subruta sin efectos **`nx32-elements/core`** (`registerIcons`, `hasIcon`,
  `allowOrigins`, `safeEndpoint`, `safeHref`, `nxFormat`, `resolveLocale`, `canonicalLocale`):
  ya no hace falta importar la raíz, que registra todos los componentes.
- Todas las hojas por pieza se exportan (`nx32-elements/<pieza>.css`), y también
  `nx32-elements/package.json` y la condición `default`.
- `nxFormat().parse` no devuelve un número equivocado en silencio: entiende separadores mezclados
  («1,234.56» en es-CO), negativos contables «(1.234)» y el signo menos U+2212, y devuelve `null`
  ante lo ambiguo («12.34,5», fechas, horas). «0.123» en es y «0,500» en en se leen como
  decimales. `nxFormat().date` devuelve tal cual una fecha inexistente.
- Cambiar `<html lang>` (por ejemplo, el selector de idioma de `<nx-account>`) repinta los
  componentes que dependen del locale.
- `tokens.css`: tokens y `color-scheme` dentro de `:where()`, así que la app los sobreescribe sin
  depender del orden. `.nx-spinner`, `@keyframes nx-spin` y la base de los íconos pasan de
  `button.css`/`sidemenu.css` a `tokens.css`.
- `nx-sync`: `createSync({name})` registra la cola por nombre (`syncQueue(name)`,
  `onSyncQueue(name, fn)`).
- `npm run size` solo informa el peso frente a su referencia: por ahora, primero que todo
  funcione, después se optimiza (`NX_SIZE_STRICT=1` vuelve a exigir los topes).
