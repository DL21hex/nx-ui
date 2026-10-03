# nx32-elements

Componentes web ultraligeros, **sin dependencias**, compatibles con BDUI. Se usan igual en una
página HTML plana, en SolidJS (con SSR) o pintados desde un JSON que manda el backend.

| Paquete | min + gzip |
|---|---|
| `<nx-sidemenu>` + núcleo (ESM) | ≈ 6,6 KB |
| `<nx-button>` + núcleo (ESM) | ≈ 5,4 KB |
| `<nx-select>` + núcleo (ESM) | ≈ 6,2 KB |
| `<nx-ai-answer>` + núcleo (ESM) | ≈ 7 KB |
| `<nx-doc-capture>` + botón + núcleo (ESM) | ≈ 11,2 KB |
| `<nx-grid>` + núcleo (ESM); el generador de XLSX, ≈ 2,6 KB, se carga al exportar | ≈ 20,1 KB |
| `<nx-dialog>` + núcleo (ESM) | ≈ 6,5 KB |
| `nxToast()` + núcleo (ESM) | ≈ 2,5 KB |
| `nxConfirm()` + diálogo + botón + núcleo (ESM) | ≈ 11,5 KB |
| `<nx-agent>` + IA + botón + BDUI + recorrido + núcleo (ESM) | ≈ 18,6 KB |
| `<nx-command>` + núcleo (ESM) | ≈ 7,1 KB |
| `<nx-explain>` + núcleo (ESM) | ≈ 7,9 KB |
| `<nx-inbox>` + avisos + núcleo (ESM) | ≈ 10,2 KB |
| `<nx-survey>` + núcleo (ESM) | ≈ 12,1 KB |
| `<nx-import>` + núcleo (ESM); el lector de .xlsx, ≈ 2 KB, se carga al llegar un libro | ≈ 16,4 KB |
| `<nx-keytips>` + núcleo (ESM) | ≈ 4 KB |
| `<nx-guard>` + núcleo (ESM) | ≈ 8,8 KB |
| `<nx-handoff>` + QR + núcleo (ESM); el lado celular, ≈ 5 KB, se carga con `side="phone"` | ≈ 8,9 KB |
| `<nx-award>` + núcleo (ESM) | ≈ 15,1 KB |
| `<nx-account>` + núcleo (ESM); el panel (≈ 4,2 KB) y «Ver como» (≈ 1,2 KB) se cargan aparte | ≈ 9,5 KB |
| `<nx-launcher>` + núcleo (ESM) | ≈ 7,9 KB |
| `<nx-cards>` + núcleo (ESM) | ≈ 10 KB |
| `<nx-org>` + núcleo (ESM) | ≈ 12,5 KB |
| `<nx-breadcrumb>` + núcleo (ESM); el menú de hermanos, ≈ 2,5 KB, se carga al abrir el primero | ≈ 4,8 KB |
| `<nx-print>` + núcleo (ESM) | ≈ 7,9 KB |
| `<nx-signature>` + núcleo (ESM); el PNG, la ubicación y el celular se cargan aparte | ≈ 6,9 KB |
| `<nx-planner>` + núcleo (ESM); el aviso se carga aparte | ≈ 13,9 KB |
| `<nx-review>` + núcleo (ESM) | ≈ 10,4 KB |
| `<nx-voice>` + núcleo (ESM); el dictado en un campo y el servidor se cargan aparte | ≈ 5,9 KB |
| `<nx-thread>` + núcleo (ESM); las sugerencias, el stream y las anclas se cargan aparte | ≈ 11,9 KB |
| `<nx-checklist>` + núcleo (ESM); los campos de evidencia, el resumen y la firma se cargan aparte | ≈ 11,8 KB |
| `<nx-recurrence>` + núcleo (ESM); el intérprete de frases y los controles se cargan aparte | ≈ 9,1 KB |
| `<nx-jobs>` + núcleo (ESM); el panel se carga aparte | ≈ 8,8 KB |
| `nx32-elements.css` (tokens + todos los componentes) | ≈ 37,1 KB |
| `nx32-elements.iife.js` todo-en-uno con íconos | ≈ 207 KB |

Cada componente es una subruta (`nx32-elements/sidemenu`, `nx32-elements/button`): una app solo carga lo que importa.

`npm run size` imprime los números actuales y marca con ⚠ la pieza (el JS o el CSS de un
componente, o los tokens) que pasa su peso de referencia. Por ahora no hace fallar el build: primero
que todo funcione, después se optimiza (`NX_SIZE_STRICT=1 npm run size` vuelve a exigir los topes).

## Principios

1. **Primero una librería normal.** Atributos para lo simple, propiedades para los datos
   (`items`), eventos para las acciones y slots para tu contenido. Cada evento se llama
   `nx-<componente>-<acción>`, con la etiqueta sin «nx-» (`nx-sidemenu-select`, `nx-number-change`,
   `nx-scan-read`); `nx-open-change` `{open}` es el único compartido. Los controles de formulario
   (`nx-select`, `nx-number`, `nx-date-range`, `nx-recurrence`, `nx-signature`) emiten además el
   `change` nativo, que burbujea: el código genérico no tiene que conocer el evento propio.
2. **BDUI sin costo.** Ninguna prop es una función: todo lo que acepta un componente puede venir
   del backend. `nx32-elements/bdui` es un adaptador opcional que convierte `{component, props}` en elementos.
3. **El navegador hace el trabajo pesado.** Los flotantes y el drawer usan la Popover API: capa
   superior, clic fuera, Escape y devolución del foco sin código propio.
4. **Neutro y tematizable.** Todo el color sale de variables `--nx-*` (el mismo vocabulario que el
   design system de nx32), con claro y oscuro vía `light-dark()`.
5. **Habla el formato de quien la usa.** Números, montos, fechas y tiempos salen de `Intl` con el
   locale de cada componente: su atributo `locale`, o el `lang` más cercano (el de la página), o
   «es-CO». Es un solo formateador compartido (`nxFormat`), cacheado por locale. Los textos de la
   interfaz van aparte, en `labels`. Lo que alguien escribe o pega se lee con `nxFormat().parse`, que
   prefiere `null` a un número equivocado: con «.» y «,» a la vez, el último es el decimal si el
   otro agrupa de a tres («1,234.56» es 1234,56 también en es-CO; «12.34,5» no se entiende); un
   separador repetido es de miles; uno solo es el decimal del locale, o de miles si agrupa («1.234»
   en es). Son negativos «-1.234», «1.234-», «−1.234» (U+2212) y «(1.234)», el formato contable.
   Si cambia el `lang` de la página, los componentes conectados repintan con el nuevo locale.
6. **Rápida con muchos datos, no solo liviana.** Reglas para todos los componentes:
   - solo se pinta lo que se ve: filas virtualizadas que se reutilizan al desplazarse, o un tope
     (`limit`);
   - un nodo que ya está en pantalla se actualiza en su lugar, no se recrea;
   - el trabajo caro se hace una vez y se reutiliza: quitar tildes o armar el orden alfabético se
     calcula una vez por dato, no una vez por tecla o por comparación;
   - no se recalcula lo que no cambió: ordenar no vuelve a filtrar;
   - lo que se usa poco se carga al usarlo (el generador de Excel);
   - se mide: `npm run size` informa el peso de cada pieza frente a su referencia, y `npm run bench` mide la
     lógica con datos grandes (100.000 filas, 10.000 opciones).
7. **Probada donde se usa.** Además de las pruebas de lógica y de DOM, las interacciones (Popover
   API, foco, portapapeles, teclado, View Transitions, «atrás» del navegador) se prueban en
   Chromium, Firefox y WebKit con Playwright, en local antes de cada envío, y cada componente pasa axe (WCAG 2.1 AA) sin
   problemas graves. El contraste de los tokens se verifica en todas las paletas.

## Paletas

`nx32-elements/palettes.css` trae nueve paletas listas: `indigo` (por defecto), `oceano`, `esmeralda`,
`bosque`, `terracota`, `frambuesa`, `violeta`, `medianoche` y `grafito`. Se aplican con un atributo,
en `<html>` o en cualquier zona de la página:

```html
<link rel="stylesheet" href="nx32-elements/palettes.css" />
<html data-nx-palette="oceano">
```

Una paleta propia son cinco números; claro, oscuro y todos los tokens derivados salen solos:

```css
[data-nx-palette="mi-marca"] {
  --nx-accent-h: 200;   /* tono del acento */
  --nx-accent-c: 0.14;  /* croma (0 = gris) */
  --nx-accent-l: 0.55;  /* luminosidad en claro; --nx-accent-l-dark en oscuro */
  --nx-neutral-h: 210;  /* tono de los grises */
  --nx-tint: 1.8;       /* cuánto color llevan los grises (1 = casi nada) */
}
```

Los tokens y el `color-scheme: light dark` de `tokens.css` van dentro de `:where()`, sin
especificidad: cualquier regla de la app les gana, cargue antes o después. Una app solo en claro
pone `:root { color-scheme: light }`; una marca, `:root { --nx-primary: … }`.

## Uso

**HTML plano**, sin build:

```html
<link rel="stylesheet" href="nx32-elements.css" />
<script src="nx32-elements.iife.js"></script>

<button popovertarget="menu" aria-label="Abrir menú">☰</button> <!-- solo se ve en móvil -->
<nx-sidemenu id="menu" active="/ventas/pedidos" collapsible>
  <a slot="header" href="/">Mi app</a>
</nx-sidemenu>
<script>
  menu.items = [
    { id: "inicio", label: "Inicio", href: "/", icon: "house" },
    { id: "ventas", label: "Ventas", icon: "shopping-cart", section: "Operación",
      children: [{ id: "pedidos", label: "Pedidos", href: "/ventas/pedidos" }] },
  ];
</script>
```

**Módulos (ESM):**

```js
import "nx32-elements/nx32-elements.css";
import "nx32-elements/sidemenu"; // registra <nx-sidemenu>
import { registerIcons } from "nx32-elements/core"; // sin efectos: no registra nada
import { lucide } from "nx32-elements/icons"; // opcional: ~28 íconos Lucide
registerIcons(lucide);
```

`nx32-elements/core` trae las utilidades del núcleo sin ningún componente: `registerIcons`,
`hasIcon`, `allowOrigins`, `safeEndpoint`, `safeHref`, `nxFormat`, `resolveLocale` y
`canonicalLocale`. La raíz (`nx32-elements`) también las exporta, pero registra los 48 componentes:
úsala solo si de verdad quieres la librería entera.

El CSS también va por pieza: `nx32-elements/<componente>.css` (`grid.css`, `tabs.css`…) más
`nx32-elements/tokens.css`, o todo junto en `nx32-elements/nx32-elements.css`.

**SolidJS:** cada componente tiene su envoltorio con los tipos JSX en `nx32-elements/solid/<componente>`
(`nx32-elements/solid/grid`, `nx32-elements/solid/sidemenu`…). Así la app carga solo lo que usa. `nx32-elements/solid` los
reexporta todos, pero importa la librería entera: sirve para prototipos, no para producción. Se
publica como JSX sin compilar bajo la condición de export `"solid"`, así que vite-plugin-solid lo
compila para SSR o navegador. La condición `"import"` entrega el mismo JSX y no hay `"default"`: un
bundler sin la condición `"solid"` (Rollup, esbuild o webpack sin el plugin de Solid) tiene que
compilar `nx32-elements/solid/*` con babel-preset-solid; no se publica una versión compilada.

```tsx
import { SideMenu } from "nx32-elements/solid/sidemenu";

<SideMenu items={menu()} active={useLocation().pathname} collapsible collapsed={compact()}
  onToggle={(e) => { e.preventDefault(); setCompact(e.detail.collapsed); }} />
```

Los `<a href>` del menú los intercepta `@solidjs/router` solo. Si se usa la etiqueta sin el
envoltorio, hay que usar `prop:items` y `bool:collapsed`. Con `items={…}` el SSR escribe
`"[object Object]"`, y con `collapsed={false}` el atributo queda como `"false"`.

**BDUI:**

```js
import { render } from "nx32-elements/bdui";
render({ component: "SideMenu", props: { items, active: "/ventas/pedidos" } }, contenedor);
```

Las props que acepta cada componente salen de su propia clase: las que tienen setter. No hay una
segunda lista que mantener: una prop nueva del componente llega sola a BDUI, y una clave sin setter
(un error de tipeo, `textContent`, `__proto__`) se ignora y se avisa por consola. `propsOf("Grid")`
devuelve la lista. `registerComponent(nombre, etiqueta)` hace lo mismo con un componente propio (o
se le pasa la lista explícita); solo acepta elementos personalizados (con guion) y nunca props como
`innerHTML`, `srcdoc` u `on*`. Si el módulo del componente aún no está cargado, las props esperan a
que se defina. Una prop que solo se puede asignar por código (una función, un objeto vivo) se
declara en la clase con `static localProps = ["…"]`: BDUI la rechaza con un aviso y `propsOf` no la
lista. Los componentes de la librería no tienen ninguna: lo que necesita control de la app va por un
evento.

**Orígenes permitidos.** Todo `endpoint`, `source`, `action` o canal que llega en un payload se usa
solo si es del mismo origen que la página. Así un payload no puede mandar filas, textos pegados ni
el contexto de la app a un tercero. Si la API vive en otro dominio, se declara una vez:

```js
import { allowOrigins } from "nx32-elements/core";
allowOrigins("https://api.miapp.co");
```

## `<nx-sidemenu>`

| | |
|---|---|
| Propiedades / atributos | `items` (JSON en el atributo), `active`, `collapsed`, `collapsible`, `auto-collapse` (compacto en tablet), `labels` |
| Métodos | `show()`, `hide()`, `toggle()` y `open`, para el drawer (< 768 px) |
| Eventos | `nx-sidemenu-select` `{item, href}` (cancelable), `nx-sidemenu-toggle` `{collapsed, auto}` (cancelable), `nx-open-change` `{open}` (también si el drawer sale del DOM abierto) |
| Slots | `slot="header"`, `slot="footer"` (no se mueven del DOM, así que no rompen la hidratación) |
| Variables | `--nx-sidemenu-width`, `--nx-sidemenu-width-collapsed`, `--nx-sidemenu-drawer-width`, `--nx-flyout-width` |

`MenuItem`:
- `id` y `label` son obligatorios.
- `href` solo acepta rutas relativas, `http(s)`, `mailto` y `tel`. Cualquier otro esquema se descarta.
- `icon` es un nombre registrado. Si falta, se pintan las iniciales.
- `section` agrupa ítems bajo un título.
- `description` es la segunda línea del panel.
- `children` convierte al ítem en un padre que abre un panel flotante. El buscador solo aparece con más de 3 hijos; con menos, el teclado (flechas, Enter) sigue funcionando sobre la lista. Al escribir queda resaltado el primero que coincide, así que Enter lo elige. Un tercer nivel no abre otro panel: sus hojas entran en el mismo, en una sección con el nombre de su padre.
- `utility` pone el hijo como chip al pie del panel.
- `badge` es un contador o marca (`12`, `"Nuevo"`). `0` no se pinta, más de 99 es «99+» y en compacto se reduce a un punto.

`active` acepta un href (exacto o por prefijo de ruta) o un id. El id de un padre lo enciende sin
hoja activa, útil en una ficha de detalle que no está en el menú. Los ítems sin `section` se pintan
arriba, antes de las secciones: ahí van los accesos fijos (Inicio, Pendientes…).

En compacto, el nombre de cada ítem aparece en una etiqueta junto al riel al pasar el ratón o al
llegar con Tab. Con un panel flotante o el drill-down abiertos, un cambio de `items`, `active` o
`labels` (un badge que llega del servidor) se pinta al cerrarlos: no se pierden la búsqueda ni el foco.

## `<nx-button>`

Un botón que sabe esperar. Mientras corre una tarea:
- se bloquea sin soltar el foco (`aria-busy`, `aria-disabled`) y el clic no llega a la app (a la
  app solo le llega el clic del botón: nunca el de «Registro», el del panel del registro o el del
  hueco entre ellos, ni un `el.click()` sobre el envoltorio);
- muestra un spinner, el último mensaje deslizándose dentro del botón, el tiempo transcurrido y una
  barra de progreso (indeterminada si no hay porcentaje);
- guarda un registro tipo terminal (`log-mode="inline"` lo despliega debajo; en `ticker`, por
  defecto, se abre con «Registro (n)»).

Al terminar muestra ✓ o ⚠ con un resumen unos segundos y emite `nx-button-done` `{ok, ms, lines}`.
`hold="800"` pide mantenerlo pulsado (para lo destructivo); `icon-only` deja solo el ícono a la
vista, con `label` como nombre accesible y `title`.

```js
btn.run(async ({ log, progress }) => {
  log("Generando PDF"); progress(0.3);
  await generarPdf();          // lo que lance deja el botón en error, con el mensaje
});
// A mano: btn.busy = true; btn.log("…"); btn.progress = 0.5; btn.done(ok, "mensaje final")
```

**Desde el backend (BDUI):** con `stream="/url"` el clic pide la URL (`POST` por defecto) y pinta
cada línea de la respuesta, NDJSON o `data:` de SSE: `{"msg":"Subiendo","progress":0.4}`,
`{"msg":"…","level":"warn"}` y al final `{"ok":true}` o `{"ok":false,"msg":"…"}`. Ese resultado
cierra la tarea aunque el servidor deje la conexión abierta. `stream` solo se pide si es del mismo
origen (o de uno permitido con `allowOrigins`); si el botón sale de la página, la petición se
cancela y una pulsación larga a medio camino no se completa.

| | |
|---|---|
| Propiedades / atributos | `label`, `icon`, `icon-only`, `variant` (`secondary`, `primary`, `ghost`, `danger`), `type` (`button`, `submit`, `reset`), `name`, `value`, `disabled`, `busy`, `progress`, `log-mode` (`ticker`, `inline`, `none`), `stream`, `method`, `hold`, `labels` |
| Métodos | `run(task)`, `log(msg, level?)`, `done(ok, msg?)`, `lines` |
| Eventos | `click` (solo el del botón), `nx-button-done` `{ok, ms, lines}` |

## `<nx-select>`

Un select con buscador que busca en varias columnas a la vez. Cerrado es un campo compacto con lo
elegido; se abre con un clic o al empezar a escribir sobre él, y al elegir se cierra.

```js
sel.fields = [
  { key: "nombre", label: "Nombre" },                  // la primera es la principal
  { key: "cedula", label: "Cédula", kind: "digits" },  // con o sin puntos; se muestra con separador
  { key: "cargo",  label: "Cargo" },
];
sel.options = [{ value: "17", nombre: "Ana María Rincón", cedula: "52341987", cargo: "Soldadora" }];
// o, para miles de registros: <nx-select source="/empleados/buscar"> → GET ?q=…
```

- Cada palabra puede coincidir en una columna distinta («ana soldad»), sin tildes ni mayúsculas.
- Una consulta de solo números busca únicamente en las columnas `digits` y lo avisa.
- Resalta lo que coincidió y dice en qué columna («Cargo»).
- `multiple` deja lo elegido como chips; elegir no cierra y Backspace quita el último.
- Es un control de `<form>` nativo: `name` (con `multiple`, una entrada por valor), `required` con
  el aviso del navegador sobre el campo (y `aria-invalid` tras un envío fallido o un
  `reportValidity()`; el `checkValidity()` del elemento solo pregunta, el del `<form>` sí marca
  porque no se distingue de un envío), `reset` vuelve al
  valor inicial (el atributo `value`, o lo que llegó antes de que la persona lo tocara),
  `<fieldset disabled>` lo apaga, y un `<label for>` lo nombra y lo enfoca.
- `value` de varios con `multiple`: da igual si `multiple` llega antes o después. En atributo, JSON
  (`value='["1","2"]'`).
- Un `value` repetido en `options` se avisa por consola y se queda el primero.
- `source`: mismo origen (o `allowOrigins`); lo que se escribe no sale hacia un tercero. Una
  búsqueda nueva cancela la anterior.

| | |
|---|---|
| Propiedades / atributos | `fields`, `options`, `source`, `value`, `selection`, `multiple`, `placeholder`, `label`, `name`, `required`, `disabled`, `clearable`, `avatar`, `limit`, `labels` |
| Métodos | `show()`, `hide()`, `open`, `focus()`, `checkValidity()`, `reportValidity()`, `setCustomValidity(msg)`, `form`, `validity`, `validationMessage`, `willValidate` |
| Eventos | `nx-select-change` `{value, options}` y un `change` nativo, al elegir, quitar o limpiar |

## `<nx-ai-answer>` y el protocolo de IA

Preguntar y ver a la IA pensar: los pasos del agente en vivo, la respuesta en streaming con citas
que iluminan su fuente, y al terminar un resumen plegable («Razonó en 4 pasos · 4,0 s · 3
fuentes»), acciones y 👍/👎.

No depende de ningún modelo. Hace `POST` a `endpoint` con `{question, context}` y pinta un
**protocolo de streaming** (NDJSON o `data:` de SSE, una línea por evento) que cualquier backend
puede emitir:

```
{"type":"step","id":"s1","label":"Consultando costos","status":"run"}      → luego "status":"done"
{"type":"source","id":"mayor","title":"Libro mayor · agosto","href":"/…"}
{"type":"text","delta":"El costo subió **11,4 %**[^mayor] por…"}           ← [^id] cita una fuente
{"type":"note","label":"cifras verificadas","tone":"success"}
{"type":"action","label":"Ver órdenes","href":"/…"}                          (o "id" + "data": nx-ai-answer-action)
{"type":"done"}                                                              (o {"type":"error","message":"…"})
```

El texto admite un Markdown mínimo (negrita, código, listas, párrafos) y nunca se interpreta como
HTML. Un tipo de evento desconocido se ignora. Con otro transporte (WebSocket, SDK propio) la app
entrega los eventos: `begin(q)`, `push(evento)`, `end()`.

Lo que manda el modelo no es de fiar. `endpoint` solo puede ser del mismo origen (u otro permitido
con `allowOrigins`). Con `method="GET"`, la pregunta va en `?q=` y el contexto en `?context=`
(JSON). El enlace de una **acción** solo se pinta si es del mismo origen; si no, la acción queda
como botón que emite `nx-ai-answer-action`. Una **fuente** puede ser de otro sitio y lleva
`rel="noopener noreferrer"`. Al llegar `done` o `error` se deja de leer y se suelta la conexión:
lo que el servidor siga mandando no entra en la respuesta siguiente. La respuesta se escribe en
su lugar (un bloque nuevo o el último que cambia), con `aria-busy` mientras llega y un solo aviso
al lector de pantalla al terminar.

| | |
|---|---|
| Propiedades / atributos | `endpoint`, `method`, `question`, `placeholder`, `suggestions`, `context`, `feedback`, `labels` |
| Métodos | `ask(q)`, `stop()`, `begin(q)`, `push(evento)`, `end()`, `state`, `busy`, `text` |
| Eventos | `nx-ai-answer-start`, `nx-ai-answer-done` `{question, text, sources, status}`, `nx-ai-answer-action` `{id, label, data}`, `nx-ai-answer-feedback` `{value, question, text}` |

## `<nx-doc-capture>`

Captura inteligente de documentos. Sueltas una factura, una remisión o un soporte, y el formulario
se llena solo. Cada dato trae su **confianza** y su **evidencia**: al pasar por un campo se ilumina
el recuadro del documento de donde salió, y al revés. Lo dudoso (bajo `review-below`) se revisa con
un clic: una sugerencia, una corrección a mano o ✓. Las validaciones cruzadas del backend avisan
(`warn`) o bloquean (`error`), y nada se registra sin que una persona confirme.

No sabe de OCR ni de modelos. Hace `POST` multipart (`file`) a `endpoint` y pinta el mismo
transporte que la IA, con sus propios eventos:

```
{"type":"page","n":1,"src":"/docs/7/p1.png","width":1240,"height":1754}
{"type":"field","key":"nit","value":"900.123.456-7","confidence":0.99,"box":{"page":1,"x":0.06,"y":0.07,"w":0.2,"h":0.02}}
{"type":"field","key":"vence","value":"12/1O/2026","confidence":0.61,"box":{…},"hint":"¿O o 0?","suggest":"12/10/2026"}
{"type":"field","key":"items.0.cantidad","value":"40","confidence":0.95,"box":{…}}
{"type":"check","id":"iva","status":"ok","message":"El IVA es el 19 % del subtotal","fields":["iva","subtotal"]}
{"type":"done"}
```

```js
cap.schema = [
  { key: "nit", label: "NIT", section: "Encabezado" },
  { key: "items", label: "Ítems", type: "table", section: "Detalle",
    columns: [{ key: "desc", label: "Descripción" }, { key: "cantidad", label: "Cant.", type: "number" }] },
  { key: "total", label: "Total", type: "money", section: "Totales" },
];
cap.addEventListener("nx-doc-capture-submit", (e) => guardar(e.detail.values)); // o action="/url"
```

El archivo se valida antes de enviarlo, también al soltarlo: tipo según `accept` y tamaño según
`max-size`, con el aviso en la zona para soltar (`labels.badType`, `labels.tooBig`). Lo que una
persona corrigió o confirmó no lo pisa un evento que llegue después. Solo queda «por revisar» lo
que tiene dónde verse (un campo o una celda del `schema`). `endpoint` y `action`: mismo origen (o
`allowOrigins`).

| | |
|---|---|
| Propiedades / atributos | `schema`, `endpoint`, `action`, `review-below`, `accept`, `max-size` (bytes, 20 MB), `labels` |
| Métodos | `extract(file)`, `begin()`, `push(evento)`, `end()`, `setCheck()`, `reset()`, `values`, `pending`, `state` |
| Eventos | `nx-doc-capture-file` (cancelable), `nx-doc-capture-start`, `nx-doc-capture-done`, `nx-doc-capture-change`, `nx-doc-capture-submit` (cancelable) |

La referencia completa y la demo en vivo están en la galería.

## `<nx-grid>`

Una tabla de datos que se explora sola:

- **Filtro por columna.** El embudo de cada cabecera (o Alt+↓) abre el filtro de la columna, que
  sale del dato:
  - estados y texto con pocos valores: una lista con cuántas filas quedan en cada uno, «Solo» y un
    buscador si son muchos (se pintan hasta 200; las demás aparecen al buscar);
  - montos y números: barras, dos manijas y campos que aceptan «5 M» o «5 millones»;
  - fechas: «Antes de hoy», «Últimos 30 días», «Próximos 30 días», «Este mes», «Mes pasado», «Este
    año» (se guardan relativos, con `rel`) o entre dos fechas;
  - el resto: «contiene», con ejemplos de lo que coincide.

  Se aplica mientras se elige y dice cuántas filas quedan (lo anuncia la tabla, una vez); lo escrito
  en «contiene», «Desde» o «Hasta» también se aplica al cerrar o al pasar a otra columna. El chip lo
  vuelve a abrir. Con más de la mitad marcada se guarda como exclusión («Proveedor: sin Aceros»).
  `filter` en la columna lo fuerza o lo quita (`false`). El panel se carga aparte, la primera vez que hace falta.
- **Buscar en la tabla.** La caja de la barra deja las filas que contienen lo escrito en alguna
  columna visible, sin tildes ni mayúsculas: lo que se ve (la etiqueta de un estado, el monto con
  formato) y, en números y fechas, también el valor sin formato. Busca un momento después de la
  última tecla (o con Enter); la ✕ o Escape la borran. Se suma a los filtros sin ser uno: no deja
  chip ni va en las vistas, y si no queda ninguna fila la tabla propone quitarla. `grid.search` la
  lee o la asigna. El texto de cada fila se arma la primera vez que se busca (con 10.000 filas,
  unos 20 ms) y después cada tecla solo lo recorre.
- **Filtrar desde una celda.** Clic derecho (o Mayús+F10): «Solo Aceros», «Sin Aceros», «Desde
  $ 5.000.000». Si no queda ninguna fila, la tabla propone qué filtro quitar y cuántas volverían.
- **Panel de filtros.** Facetas con casillas y conteos, con la misma regla del tablón de nx32:
  - las opciones de una faceta se suman (O) y las facetas se restringen entre sí (Y);
  - cada opción se cuenta con los demás filtros, nunca con el suyo;
  - una opción en 0 queda deshabilitada.

  `facets-open` lo abre de arranque **si cabe al lado de la tabla** (la tabla mide 640 px o más).
  Más angosta, el panel iría encima y empujaría la tabla hacia abajo: queda cerrado y lo abre el
  botón «Filtros». Se juzga una vez, la primera vez que el panel se mostraría; lo que se abra con el
  botón no se vuelve a cerrar.
- **Un solo modelo de filtros.** El filtro de la columna, la casilla y el menú de la celda producen
  el mismo filtro y el mismo chip.
- **Hoja de cálculo.** Navegación con teclado, rangos con suma, promedio, mínimo y máximo, copiar y
  pegar con Excel (TSV) y edición en línea (`nx-grid-change`, cancelable). Deshacer y rehacer
  (Ctrl+Z, Ctrl+Y o Ctrl+Mayús+Z, y botones): cada edición, pegado o borrado es un paso; lo
  deshecho queda seleccionado, y la marca de «editada» se va si la celda vuelve a su valor original.
  Una tabla que se refresca sola no le guarda a nadie lo que lleva escrito a medias: si la app
  asigna `rows`, `filters`, `sort`, `search` o `columns` mientras alguien edita y la fila sigue (por
  su id), el campo se queda abierto, con lo escrito y el cursor, en el lugar nuevo de la fila (la
  tabla la sigue si se movió). Si la fila ya no se ve (quedó filtrada, en una columna escondida), lo
  escrito se guarda en ella; si ya no está en los datos (o sin `row-key` llegaron filas nuevas, y la
  posición no dice cuál era), se descarta y se anuncia (`labels.editLost`). Si la app trae otro
  valor para la celda abierta y el campo sigue sin tocar, el campo muestra el nuevo. Con `source`,
  otra consulta trae otras filas: la edición se guarda antes de pedirla (reasignar los mismos
  filtros u orden no pide nada). Abrir una celda y salir sin tocarla no cambia nada.
- **Teclado.** La tabla es una sola parada de Tab (el patrón grid de la APG): flechas entre celdas,
  ↑ desde la primera fila sube a las cabeceras y ←/→ (Inicio, Fin) las recorren; ahí Enter ordena,
  Alt+↓ abre el filtro, Ctrl+←/→ cambia el ancho (Mayús, de a más), Supr lo devuelve y ↓ vuelve a
  las celdas.
- **Agrupación con subtotales** por cualquier columna de categorías o por mes.
- **Columnas a la medida.** «Columnas» muestra y esconde columnas (la última no se esconde, y el
  filtro de una columna oculta sigue puesto). El borde de cada cabecera cambia su ancho: arrastrar,
  Ctrl+←/→ con el foco en la cabecera, y doble clic o Supr para el original.
- **Vistas guardadas.** Con `views-storage="compras:ana"`, «Vistas» guarda el estado de la tabla
  con un nombre en `localStorage` (filtros, orden, agrupación, columnas ocultas y anchos) y lo
  aplica con un clic. Si después se cambia algo, el botón dice «modificada» y el menú ofrece
  guardar los cambios o guardarla como nueva; también renombrar, borrar y volver a la tabla
  original. Una puede abrir la tabla. Los tramos de fechas relativos siguen siendo ciertos otro
  día, lo de columnas que ya no existen se quita (y se dice) y otra pestaña que guarda se ve al
  instante. Guardar, renombrar o borrar cambia solo esa vista sobre lo guardado en ese momento: no
  pisa lo que guardó otra pestaña u otra tabla con la misma clave. `grid.view` lee o aplica ese
  estado sin guardarlo; el menú se carga aparte.
- **Exportar a .xlsx.** Es un Excel de verdad: números, montos (con el símbolo de su moneda y
  decimales solo si los hay) y fechas como valores, cabecera fija y autofiltro. El generador no
  tiene dependencias y se carga solo al exportar. Con `source`, las filas se piden por bloques de
  5.000 (hasta el tope de una hoja de Excel); si el servidor falla, `exportXlsx()` se rechaza. La
  hoja se arma por partes, sin una cadena gigante, y un texto de más de 32.767 caracteres (el tope
  de una celda de Excel) se recorta con «…».
- **Copiar sin fórmulas.** Un texto que empieza con `=`, `+`, `-` o `@` se copia con un apóstrofo
  delante (Excel lo pega como texto, no como fórmula); al pegarlo de vuelta en la tabla se quita.
- **Cliente o servidor.** Con `rows`, todo pasa en el navegador. Con `source`, se pide por bloques
  al desplazarse, y el backend devuelve los agregados. En el servidor, el filtro de una columna
  espera 250 ms tras el último cambio antes de pedir. Si un bloque no llega, sale `nx-grid-error` y
  se vuelve a pedir más tarde (1 s, 2 s, 4 s… hasta 30 s), hasta cinco intentos: con el servidor
  caído, la tabla no sigue pidiendo para siempre. Esos bloques vuelven a pedirse (otra tanda) al
  desplazarse o cuando llega bien otro bloque, y siempre con `refresh()`; si es el primero, la
  tabla lo dice con «Reintentar». Se guardan hasta 50 bloques: los más lejanos a la vista se sueltan. Cambiar la
  consulta o sacar la tabla del DOM corta lo que estaba en camino.
- **O que la tabla elija.** Con `source` y `client-max="20000"`, la primera página dice el total:
  si pasa del tope, sigue en el servidor sin pedir nada más; si cabe, trae la consulta completa una
  vez (`{offset: 0, limit: 20001, sort: null, filters: []}`) y sigue en el cliente, con conteos
  exactos, filtros al instante y agrupación. `grid.mode` dice dónde quedó. Las filas traídas son
  una foto: `refresh()` las vuelve a pedir (y vuelve a mirar el total). Es opcional: sin
  `client-max` nada cambia.
- **Barra horizontal también arriba.** Una tabla ancha lleva su barra de desplazamiento horizontal
  también encima de las columnas: la propia queda al pie de su caja y había que bajar hasta allá
  para moverla. Viene encendida; `top-scrollbar="false"` (`topScrollbar={false}` en Solid y en BDUI)
  la quita, y entonces la tabla se maqueta como antes. Es un espejo del scroller de la tabla, con un
  relleno del ancho de las columnas: aparece justo cuando no caben, en el mismo pase de maquetación
  (sin medir ni observar nada, y sin saltos al cargar). Es fina (4 px) y se ensancha a 8 px, más
  oscura, con el puntero encima o al arrastrar, dentro de una franja fija de 12 px que se puede
  agarrar entera; en Firefox es su barra fina nativa. Las dos se mueven juntas en proporción a sus
  recorridos, así que desde arriba se llega a la última columna aunque la barra vertical le quite
  ancho a la tabla (también en RTL). Va en su propia fila, solo sobre la tabla y al lado del panel
  «Filtros»: aparecer o irse no cambia el alto de la tabla. Si las columnas caben queda una franja
  vacía de 1 px, y en una pantalla táctil no se muestra (la tabla se desplaza con el dedo). Va con
  `aria-hidden` y fuera del orden del teclado (lo que se recorre es la tabla).
- **Filas virtualizadas.** Solo existen en el DOM las filas visibles, y al desplazarse se reutilizan.
  En el cliente, 100.000 filas se filtran y ordenan en décimas de segundo (se ordenan una vez:
  filtrar o buscar no vuelve a ordenar); más allá, `source`. Con cientos de miles de filas del
  servidor, el alto de la tabla tiene un tope (el navegador no pinta más; 8 millones de píxeles,
  porque Firefox suelta la cabecera fija pasados ~8,9) y el desplazamiento se escala para que la
  última fila se alcance.
  Con pocas filas, las líneas de las columnas siguen hasta el fondo de la tabla (solo las
  verticales: no se dibujan filas vacías), sin agregar scroll; sin filas, el aviso queda limpio.
- **Selección y detalle.** `selectable` agrega casillas (Mayús para un tramo, Espacio con teclado,
  «seleccionar las n» filtradas); lo que la app ponga con `slot="bulk"` aparece junto al conteo.
  Una columna `link` abre el detalle (`nx-grid-open`, también con Enter) y `avatar` muestra las
  iniciales. `grid.rows = grid.rows` recalcula tras cambiar filas por fuera.
- **Con el dedo.** Un toque marca la celda y otro toque sobre la misma la edita o abre la fila,
  como el doble clic (que en iOS no llega). La pulsación larga abre el menú de la celda. Arrastrar
  desplaza la tabla (no marca un rango) y, al llegar a su final, sigue la página. En una pantalla
  angosta los botones de la barra quedan solo con su ícono y el filtro de una columna sube como hoja
  inferior sin abrir el teclado; los campos van a 16 px, para que Safari no haga zoom al enfocarlos.
  Pintada en el servidor (SSR), la tabla guarda su alto hasta que carga el JS.
- **Locale.** Números, montos, fechas, lo que se escribe en una celda y el orden alfabético salen
  de `Intl` con `locale` («es-CO», «en-US», «pt-BR»…; por defecto, el `lang` de la página). Un
  `currency` ISO («COP», «USD») usa el formato de moneda del locale. Los textos de la interfaz van
  aparte, en `labels`. Los números de las filas deben llegar como `number`: un texto con punto y
  grupos de tres («1.250», un `Decimal` serializado con tres decimales) se lee como miles (1250);
  como texto, sirve con coma decimal («1,25») o sin esa ambigüedad («0.125», «1250.5»).

```js
grid.columns = [
  { key: "oc", label: "Pedido" },
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pend", label: "Pendiente", tone: "warning" }] },
  { key: "fecha", label: "Fecha", type: "date" },
  { key: "monto", label: "Monto", type: "money", editable: true },
];
grid.rows = pedidos; // o grid.source = "/compras/pedidos/buscar"
grid.addEventListener("nx-grid-change", (e) => guardar(e.detail.changes));
```

```
source       POST {offset, limit, sort, filters, search?} → {rows, total, histograms?, facets?, totals?}
filtro       {key, op:"in"|"notIn", values} · {key, op:"range", min?, max?, rel?} · {key, op:"contains", value}
```

Si el servidor tiene un tope por página menor que `limit`, puede mandar menos filas: al desplazarse y
al exportar, la tabla sigue pidiendo desde donde quedó hasta `total`. La exportación toma la consulta
al empezar (filtrar mientras exporta no mezcla dos consultas) y se dice al terminar, también si falla.

`source` solo se usa si es del mismo origen (o de uno permitido con `allowOrigins`): las filas no salen hacia un tercero. En modo servidor, «seleccionar las n» y las
acciones en lote alcanzan solo las filas de la consulta actual; sin `row-key`, una marca por
posición se pierde al cambiar de filtro u orden. `row-key` se puede cambiar en cualquier momento (los
id se rehacen, y se pierden las marcas y el historial; sin el atributo la clave es `id`, así que
`row-key="id"` no cambia nada); si un id se repite, esa fila se identifica por
su posición y se avisa en la consola. Las filas se guardan sin prototipo: una columna `constructor`
lee lo que trae la fila, no `Object`.

| | |
|---|---|
| Propiedades / atributos | `columns`, `rows`, `source`, `client-max`, `filters`, `sort`, `search`, `view`, `views-storage`, `views`, `group-by`, `facets-open`, `top-scrollbar`, `height`, `row-key`, `filename`, `locale`, `selectable`, `selected`, `labels` |
| Métodos | `clearFilters()`, `openFilter(key)`, `applyView(id)`, `activeView`, `exportXlsx()`, `removeColumn(key)`, `refresh()`, `undo()`, `redo()`, `canUndo`, `canRedo` |
| Eventos | `nx-grid-filter`, `nx-grid-change` (cancelable), `nx-grid-columns`, `nx-grid-selection`, `nx-grid-open`, `nx-grid-views`, `nx-grid-export` (`{ok, count, filename, error?}`), `nx-grid-error` (`{offset, limit, error}`, con `source`) |

## `<nx-dialog>`, `nxToast()` y `nxConfirm()`

Cuatro formas de hacer lo que hoy se hace con un modal, cada una para su caso:

- **A · El modal que nace del botón.** `<nx-dialog>` se expande desde el botón que lo abrió y
  vuelve a él (View Transitions; sin ellas, un fundido). En móvil es una hoja desde abajo que se
  arrastra para cerrar. Si hay cambios sin guardar, avisa dentro del propio diálogo en vez de
  perderlos: lo que cierra la persona pasa por el aviso; lo que cierra la app con `close()`, no.
  Buscar o filtrar dentro de un `<nx-select>` o una `<nx-grid>` no cuenta como cambio (sus
  controles de consulta llevan `data-nx-ephemeral`, y el diálogo ignora lo que venga de ahí);
  elegir un valor (el `change` de `<nx-select>`) o editar una celda (`nx-grid-change`) sí.
- **B · Paneles apilados.** `mode="panel"`: cada nivel se apila sobre el anterior (pedido →
  proveedor → factura), con migas para volver, y la página sigue a la vista. Con `url` (del mismo
  origen; si no, se ignora), «atrás» del navegador cierra el nivel de arriba. Al cerrarse quita su
  entrada del historial solo si sigue siendo la de arriba: si la app navegó desde el diálogo, no
  deshace esa navegación.
- **C · Deshacer en vez de confirmar.** `nxToast({ message, undo: true })`: la acción ocurre al
  instante y se puede deshacer mientras corre el tiempo (con el botón o Ctrl+Z). La promesa dice
  si se deshizo; si no, la app confirma en el backend.
- **D · Confirmación con impacto.** `nxConfirm({ heading, impact })`: el backend describe las
  consecuencias antes de actuar (una lista, o en streaming como la IA) y puede bloquear la acción
  con un motivo. Lo destructivo se confirma manteniendo pulsado el botón (`<nx-button hold>`).

El diálogo es el propio elemento en la capa superior (Popover API): el contenido del autor no se
mueve, así que la hidratación de Solid no se rompe. Se comporta como modal: `aria-modal`, foco
atrapado y devuelto a quien lo abrió, Escape, fondo que bloquea y scroll de la página bloqueado.
Tab sigue el orden en que se ve (cabecera, cuerpo, pie) y da la vuelta en los extremos; una fecha
se recorre por sus segmentos, y lo de adentro de un hijo con `tabindex="-1"` sigue en el recorrido.

```html
<button popovertarget="nuevo">Nuevo pedido</button>  <!-- o: const valor = await nuevo.show() -->
<nx-dialog id="nuevo" heading="Nuevo pedido">
  <form method="dialog">…<button value="guardar">Guardar</button></form>
  <div slot="footer"><button data-nx-close>Cancelar</button></div>
</nx-dialog>
```

```js
ocultar(fila);
if ((await nxToast({ message: "OC-2291 anulada", undo: true })) === "undo") mostrar(fila);
else anular(fila);

if (await nxConfirm({ heading: "Anular OC-2291", impact: "/compras/oc/2291/impacto" })) anular();
// {"type":"impact","label":"2 recepciones","detail":"se revierten","tone":"warning"}
// {"type":"block","message":"Ya tiene un pago"} · {"type":"note","message":"…"} · {"type":"done"}
```

| | |
|---|---|
| `<nx-dialog>` | `heading`, `description`, `mode` (`modal` / `panel`), `size` (`sm` / `md` / `lg` / `full`), `persistent`, `url`, `open`, `dirty`, `labels` · `show(origen?)` → promesa con el valor, `close(valor?)` · `nx-dialog-close` (cancelable), `nx-open-change` · cabecera de ficha (`avatar`, `badge`, `nav`, `actions`): ver [La ficha lateral](#la-ficha-lateral-nx-tabs-nx-fields-nx-notice-y-nx-badge) |
| `nxToast()` | `{message, tone?, undo?, action?, duration?, signal?}` → `"undo"`, `"action"`, `"timeout"` o `"dismiss"`. Abortar `signal` lo cierra con `"dismiss"`. Se pausa con el mouse o el foco encima; al cerrar la página, los pendientes terminan como `"timeout"`. Un `tone` desconocido es neutro; `duration` se acota a lo que acepta `setTimeout` (0 = hasta cerrarlo) |
| `nxConfirm()` | `{heading, message?, impact?, body?, confirmLabel?, tone?, hold?, failOpen?}` → `true` / `false`. Con `impact` como URL (mismo origen o `allowOrigins`) falla cerrado: si hay un error de red o del servidor, un evento `error` o el stream termina sin `done`, no se puede confirmar; `failOpen: true` deja confirmar igual, con el aviso a la vista |
| `<nx-button hold>` | Mantener pulsado (ms, 1000 por defecto) para activarlo; con teclado, mantener Enter o Espacio |

## `<nx-agent>` (AG-UI)

Un agente que actúa, no solo responde. Conversa en varios turnos y muestra lo que hace: pasos,
herramientas del backend y razonamiento, con el mismo pintado de `<nx-ai-answer>`. Mueve la pantalla
que la persona está viendo: con `for`, filtra y selecciona en esa `<nx-grid>`. Antes de cambiar
datos pide aprobación con el impacto a la vista, y lo reversible se puede deshacer mientras corre
el tiempo.

Habla [AG-UI](https://docs.ag-ui.com). Hace un POST de un `RunAgentInput`
(`threadId`, `runId`, `state`, `messages`, `tools`, `context`) y lee los eventos en SSE o NDJSON.
Sirve cualquier backend AG-UI: CopilotKit, Microsoft Agent Framework, AWS Bedrock AgentCore o uno
propio. La «cabina» son herramientas del navegador que el agente llama y el componente atiende;
la respuesta vuelve como mensaje `tool` en la corrida siguiente.

| Herramienta | Qué hace | Devuelve |
|---|---|---|
| `nx_confirm` | Tarjeta de aprobación con impacto (`tone: "danger"` → mantener pulsado) | `{approved}` |
| `nx_ask` | Pregunta con opciones o texto libre | `{answer}` |
| `nx_notify` | Un resultado; con `undo`, espera 7 s por si la persona lo deshace | `{undone}` |
| `nx_show` | Pinta un componente de nx32-elements (nodo BDUI, con su lista de props permitidas). Nunca pasan las props con URL (`endpoint`, `action`, `source`, `*Endpoint`, `*Source`, `*Url`…); con `show="Trend, Grid"`, solo esos componentes | `{shown}` |
| `nx_tour` | Un recorrido guiado sobre la pantalla («¿cómo…?»): cada paso señala un elemento. Los `[data-tour]` visibles viajan en el contexto para que el modelo sepa qué puede señalar | `{completed, step}` |
| `nx_grid_filter`, `nx_grid_select` | Filtra o selecciona en la tabla de `for` (y la tabla viaja como contexto) | `{rows}`, `{selected}` |

```html
<nx-grid id="personas" selectable></nx-grid>
<nx-agent for="personas" endpoint="/ia/agente"></nx-agent>
<script>
  agente.tools = [{ name: "crear_tarea", description: "Crea una tarea", parameters: { type: "object", properties: { titulo: { type: "string" } } } }];
  agente.addEventListener("nx-agent-tool", (e) => {
    if (e.detail.name !== "crear_tarea") return;
    e.preventDefault();
    crearTarea(e.detail.args).then((t) => e.detail.respond({ id: t.id }));
  });
</script>
```

| | |
|---|---|
| Propiedades / atributos | `endpoint`, `for`, `heading`, `placeholder`, `suggestions`, `tools` (con `confirm`), `show` (componentes que `nx_show` puede pintar; sin él, todos los registrados), `context`, `state`, `labels` · `messages`, `threadId`, `running` (lectura) |
| Métodos | `send(texto)`, `stop()`, `reset()` |
| Eventos | `nx-agent-tool` (herramientas de la app), `nx-agent-send` (ajustar la entrada), `nx-agent-state`, `nx-agent-custom`, `nx-agent-event` (cada evento AG-UI) |

**`nxTour(pasos)`** (`nx32-elements/tour`) es el mismo recorrido, para cualquier app (una bienvenida, una
novedad): ilumina el elemento de cada paso, oscurece lo demás y pone al lado una tarjeta con título
y texto. `Enter`/`→` avanza, `←` vuelve y `Escape` termina; el foco vuelve a donde estaba. Mientras
se escribe en un campo de la página, las flechas y `Enter` son del campo. Solo muestra: no hace
clic ni cambia nada.

```js
import { nxTour } from "nx32-elements/tour";
const { completed } = await nxTour([
  { target: "#nuevo", title: "Crea un pedido", text: "Empieza aquí." },
  { target: "[data-tour=filtros]", title: "Filtra", text: "Escribe en tus palabras." },
]);
```

Nada que cambie datos ocurre en el navegador: las herramientas de la cabina solo muestran,
preguntan y mueven la pantalla. Escribir datos lo hace el backend, después de la aprobación.

Una herramienta de la app que cambia datos lleva `confirm: true` (o `{title, detail, tone:
"danger"}`). El componente pide la aprobación con su propia tarjeta antes de despachar
`nx-agent-tool`, sin depender de que el modelo llame a `nx_confirm`. Si se rechaza, el modelo
recibe `{declined: true}`. `confirm` no viaja al backend. **El backend debe revalidar igual:** el
historial (con `{approved: true}`) lo arma el navegador. Detener con una tarjeta pendiente la cierra
(«Cancelado») y le responde `{cancelled: true}` a esa llamada, para que el historial siga siendo
válido. `endpoint`: mismo origen (o `allowOrigins`). El hilo no es una región viva: mientras corre
lleva `aria-busy`, y al terminar la respuesta se anuncia una vez.

## `<nx-command>`

La paleta de comandos (⌘K / Ctrl+K). Una sola caja para ir a cualquier pantalla, encontrar un
registro, ejecutar una acción y, si nada de eso responde, preguntarle al asistente. Junta varias
fuentes, todas JSON:

- `items`: entradas propias `{label, href?, group?, hint?, keywords?, icon?, shortcut?, children?, data?}`.
  Con `href` es un `<a>` de verdad (el router de la app lo intercepta; ⌘/Ctrl + Enter abre otra
  pestaña); con `children` abre un submenú; sin ninguno de los dos, avisa con `nx-command-select`.
- `menu="id"`: las pantallas de un `<nx-sidemenu>`, con su ruta como pista («Ventas › Pedidos»).
- `account="id"`: las acciones de un `<nx-account>` (tema, paleta, empresa, idioma, salir…); las
  ejecuta la propia cuenta al oír `nx-command-select`. Si la cuenta cambia con la paleta abierta, se ven
  enseguida.
- `source="/url"`: registros del servidor mientras se escribe (`GET /url?q=…` → entradas, o `{items}`).
- `agent="id"`: lo que se escribe se le puede preguntar a ese `<nx-agent>`.

Busca sin tildes ni mayúsculas, en el nombre, la pista y las palabras clave, y también por
iniciales («np» → «Nuevo pedido»). Aprende: lo que se elige seguido sube (cada semana pesa la
mitad) y sin escribir nada aparece en «Recientes». Eso se recuerda en `localStorage`, solo en ese
navegador (`storage="none"` lo desactiva). Se guarda solo `{id, label, href, icon, group}`, nunca
`data` ni `hint`. Los registros de `source` no se guardan. Un reciente se muestra solo si sigue en
la paleta (`items`, sus submenús o `menu`). En un equipo compartido, la clave debe incluir al
usuario (`storage="nx-command:ana"`); al cambiar la clave, lo del anterior deja de verse. `source`
va al mismo origen (o `allowOrigins`). Un `hotkey` sin modificador (`"/"`) no se atiende mientras se
escribe en un campo, tampoco en la caja de la paleta. El atajo compara el carácter: «/» vale aunque
el teclado lo escriba con Shift (Shift+7 en español), y una letra vale por su tecla física con una
distribución no latina. Cuántos resultados hay, «Sin resultados» o «Buscando…» se anuncian al lector
de pantalla. En un submenú, la miga de arriba vuelve con un clic (con el teclado, Escape o Backspace) y
la caja se describe como «En: Cambiar paleta» (`labels.where`). El elemento es la capa superior (Popover API): `<button popovertarget="cmd">` la abre
sin JS.

```html
<button popovertarget="cmd">Buscar… ⌘K</button>
<nx-command id="cmd" menu="nav" source="/buscar" agent="asistente"></nx-command>
<script>
  cmd.items = [
    { id: "nuevo", label: "Nuevo pedido", group: "Acciones", keywords: ["crear"], shortcut: "N" },
    { id: "tema", label: "Cambiar tema", children: [{ id: "claro", label: "Claro" }, { id: "oscuro", label: "Oscuro" }] },
  ];
  cmd.addEventListener("nx-command-select", (e) => ejecutar(e.detail.item.id));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `items`, `menu`, `account`, `source`, `agent`, `hotkey` (`"mod+k"`; `"none"` lo quita), `placeholder`, `limit`, `storage`, `labels` |
| Solo lectura | `open`, `query` |
| Métodos | `show(q?)`, `hide()`, `clearHistory()` |
| Eventos | `nx-command-select` `{item, query, newTab}` (cancelable: no navega y la paleta sigue abierta), `nx-command-ask` `{query}` (cancelable), `nx-open-change` `{open}` |

## `<nx-explain>`

«¿De dónde sale este número?». Envuelve una cifra; al pulsarla se abre su desglose, que el backend
transmite: la fórmula término a término, la comparación con otro período, las fuentes y una
explicación breve. Un término con `explain` se abre en su propio desglose, y así hasta el documento
de origen (con migas para volver; `Esc` vuelve un nivel).

Comprueba lo que muestra: si los términos (sumas y restas) no dan la cifra, lo dice con los dos
valores. Una cifra que se puede auditar con un clic es una cifra en la que se confía.

```
{"type":"value","label":"Total factura FE-10482","value":10601500,"format":"money","currency":"COP"}
{"type":"term","label":"Subtotal","value":9100000,"source":"fe","explain":"/explicar/subtotal?f=10482"}
{"type":"term","label":"IVA 19 %","value":1729000,"detail":"19 % de $ 9.100.000"}
{"type":"term","label":"Retención en la fuente","value":227500,"op":"-","href":"/retenciones/88"}
{"type":"compare","label":"agosto","value":9280000,"better":"down"}     → «▲ 14,2 % vs. agosto», en rojo
{"type":"source","id":"fe","title":"Factura electrónica FE-10482","href":"/…"}
{"type":"text","delta":"Sube por el precio de la lámina[^fe]."}
{"type":"note","label":"cruzada con la OC-2291","tone":"success"}
{"type":"done"}
```

`op` es `+` (por defecto), `-`, `×`, `÷` o `=` (subtotal, no suma); `format` es `money`, `number` o
`percent` (0,19 = 19 %); `total` fija contra qué se comprueba (por defecto, la cifra). Sin servidor,
`explanation` recibe los mismos eventos. `endpoint` y cada `explain` solo se piden si son del mismo
origen (o de uno permitido con `allowOrigins`): un desglose que manda el backend no puede llevar el
`context` a otro sitio. Los enlaces a otro sitio llevan `rel="noopener noreferrer"`.

```html
Total: <nx-explain endpoint="/explicar/factura/10482">$ 10.601.500</nx-explain>
```

| | |
|---|---|
| Propiedades / atributos | `endpoint`, `method` (`GET`; `POST` manda `{context}`), `context`, `explanation`, `locale`, `labels` |
| Métodos | `show()`, `hide()`, `refresh()` (se guarda lo traído por URL), `open`, `state` |
| Eventos | `nx-open-change` `{open}` |

## `<nx-inbox>`

La bandeja de aprobaciones que se trabaja con el teclado: `J`/`K` (o las flechas) para moverse,
`A` para aprobar, `R` para rechazar con un motivo, `X` para seleccionar varios (`Mayús` + mover
extiende, `Ctrl`+`A` todos). Al decidir, el ítem sale y el siguiente queda listo: cuarenta
aprobaciones son cuarenta teclas, no cuarenta diálogos.

Cada ítem muestra qué pasa si se aprueba (`impact`: una lista, o una URL con el protocolo de
`nxConfirm`, `POST {id, data}`), y el backend puede bloquearlo con un motivo: queda con un candado
y aprobar en lote lo omite y lo dice. Aprobar espera el impacto que aún no llegó, también el de los
ítems de una selección que nunca se abrieron. Uno que no se pudo calcular (o de otro origen) queda
«sin verificar» y no se aprueba. Nada pregunta «¿está seguro?»: la decisión se aplica al
instante y se deshace mientras corre el tiempo (el aviso o `Ctrl`+`Z`). La app registra en el
backend cuando llega `nx-inbox-commit`. Al vaciarla, dice cuántas se decidieron y en cuánto tiempo.

```html
<nx-inbox id="bandeja" heading="Órdenes por aprobar" require-reason></nx-inbox>
<script>
  bandeja.items = [{ id: "2291", title: "OC-2291 · Aceros del Caribe", requester: "Ana María Rincón",
    amount: 10829000, currency: "COP", impact: "/compras/oc/2291/impacto", href: "/compras/oc/2291" }];
  bandeja.addEventListener("nx-inbox-commit", (e) =>
    fetch(`/compras/${e.detail.decision}`, { method: "POST", keepalive: true, body: JSON.stringify(e.detail) }));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `items` (`{id, title, subtitle?, requester?, amount?, currency?, date?, tags?, facts?, impact?, href?, data?}`), `undo` (ms, 7000; 0 = sin aviso), `require-reason`, `heading`, `locale`, `labels` · `active`, `selected`, `pending` |
| Métodos | `decide(decisión, ids?, motivo?)` → `"commit"`, `"undo"` o `"cancel"` |
| Eventos | `nx-inbox-decide` `{decision, ids, items, reason?}` (cancelable), `nx-inbox-commit`, `nx-inbox-undo`, `nx-inbox-active`, `nx-inbox-open` (cancelable) |

## `<nx-survey>`

Una encuesta que da gusto contestar, con aspecto de formulario y no de presentación: una pregunta
a la vez y, arriba, lo que ya respondiste en líneas compactas (un clic vuelve a esa pregunta para
cambiarla; con más de tres, las viejas se pliegan). Un encabezado con el avance y un pie con
«Anterior» y «Siguiente». Al terminar, los resultados van plegados por pregunta, con tu respuesta
en el resumen.

También con el teclado, sin anunciarlo en cada pregunta: `A`, `B`, `C`… eligen, los números califican
(`1` y `0` seguidos es un 10), `Enter` sigue. Una elección simple pasa sola a la siguiente.

- **Siete tipos:** `choice` (con «Otra…» si hay `other`), `multi` (`min`/`max`), `scale` (con `nps`:
  0–10 con los colores de detractores, pasivos y promotores), `rating` (estrellas o caras),
  `text` (con contador), `rank` (ordenar arrastrando o con ↑↓) y `slider` (con monto, porcentaje o
  unidad).
- **Lógica condicional:** `when: {question, equals | in | lt | gt | answered}`. Un NPS bajo abre
  «¿qué cambiarías?», uno alto «¿qué te gusta?». Lo contestado en una rama abandonada no se envía.
- **Respuestas en el texto:** `{{area}}` en un título inserta la respuesta («¿Qué cambiarías en
  Producción?»).
- **Borrador:** con `storage`, se retoma donde se quedó. Las respuestas abiertas pueden ser
  sensibles: en un equipo compartido, la clave debe incluir al usuario (`"clima-2026:ana"`). El
  borrador (y `answers`) se valida contra las preguntas: lo de otra versión del cuestionario se
  descarta. `action` va al mismo origen (o `allowOrigins`).
- **Resultados al terminar:** cómo respondieron los demás, con la respuesta propia marcada «Tú»:
  barras, NPS con su reparto, histograma de calificaciones, promedio contra el propio valor en un
  deslizador, posición promedio al ordenar y las palabras más repetidas en los textos.
  `aggregateSurvey(preguntas, respuestas)` arma esos resultados, en el navegador o en un backend
  en JavaScript.

```html
<nx-survey id="clima" heading="¿Cómo va todo?" action="/encuestas/clima" storage="clima-2026"></nx-survey>
<script>
  clima.questions = [
    { id: "area", type: "choice", title: "¿En qué área trabajas?", required: true,
      options: [{ value: "prod", label: "Producción", emoji: "🏭" }, { value: "adm", label: "Administración" }] },
    { id: "nps", type: "scale", nps: true, title: "¿Recomendarías trabajar en {{area}}?" },
    { id: "mejorar", type: "text", long: true, title: "¿Qué cambiarías?", when: { question: "nps", lt: 7 } },
  ];
</script>
```

| | |
|---|---|
| Propiedades / atributos | `questions`, `answers`, `results`, `heading`, `description`, `action` (`POST {answers, ms}`; puede responder con los resultados), `storage`, `locale`, `labels` · `screen`, `current` |
| Métodos | `start()`, `next()`, `back()`, `goto(i)`, `submit()`, `reset()` |
| Eventos | `nx-survey-change` `{id, value, answers}`, `nx-survey-submit` `{answers, ms}` (cancelable) |

## `<nx-number>`

El campo numérico que se usa todos los días, bien hecho. Es un `<input>` propio (con
`inputmode="decimal"` en el móvil) que entiende lo que se escribe en el formato del locale y lo deja
formateado al salir.

- **Entiende:** «1.234,5» (es) o «1,234.5» (en); sufijos «2,5k», «3 mil», «1,5M», «2 millones»,
  «4 mm» (miles de millones en Colombia; en inglés «MM» es un millón, y así se lee con
  `locale="en-US"`) y «15%».
- **Cuentas:** con `=` («=450*3», «=1.200.000/12», «=(3+2)*1,5k») o relativas al valor anterior si
  empiezan por un operador («+15%», «-10%», «*2», «/12»). Mientras se escribe, el resultado se ve a
  la derecha («= 1.350») o lo que no se entendió («no entiendo "x"»). El intérprete es propio: nada
  de `eval`.
- **Pegar desde Excel:** «$ 1.450.000,00», «USD 1,200.50», «(1.200)» contable, «1.200-» o con
  espacios duros quedan limpios al pegar.
- **Teclado:** ↑/↓ suman `step` (Mayús ×10, Alt ÷10); `min`/`max` recortan al confirmar y lo
  avisan; Esc deshace lo escrito desde el foco. La rueda del mouse **no** cambia el valor.
- **En letras:** con `words`, debajo va el monto como en un cheque: «un millón cuatrocientos
  cincuenta mil pesos m/cte», «veintiún dólares», «mil doscientos pesos con 50/100 m/cte».
  `numberToWords(n, {currency})` hace lo mismo en el backend.
- **Formulario:** `name`, `required`, validez nativa con mensaje (`valueMissing`, `badInput`,
  `rangeUnderflow`/`rangeOverflow`), `reset` y `<fieldset disabled>`. El valor va en formato de
  máquina, sin exponente («1450000.5», «0.0000001»). Con un texto que no se entiende al salir
  («1200x»), `value` es `null` y el formulario no envía nada hasta que se corrija (Escape vuelve a
  lo confirmado). Desde mil billones no hay valor (`value = 1e21` queda `null`).

```html
<label for="precio">Precio unitario</label>
<nx-number id="precio" name="precio" format="money" currency="COP" step="1000" min="0" required></nx-number>
<nx-number id="total" format="money" currency="COP" readonly words></nx-number>
<script>
  precio.addEventListener("input", () => (total.value = cantidad.value * precio.value));
  precio.addEventListener("nx-number-change", (e) => guardar(e.detail.value)); // {value, text}
</script>
```

| | |
|---|---|
| Propiedades / atributos | `value` (`number \| null`; en `percent`, la fracción), `format` (`number`, `money`, `percent`), `currency` (ISO o símbolo), `decimals`, `min`, `max`, `step`, `words`, `name`, `required`, `disabled`, `readonly`, `placeholder`, `align` (`end` en montos y porcentajes), `label`, `locale`, `labels` · `text` (el valor formateado) |
| Métodos | `focus()`, `select()`, `checkValidity()`, `reportValidity()` |
| Eventos | `input` (cada vez que cambia el número), `nx-number-change` `{value, text}` y `change` al confirmar |
| Funciones | `evaluateNumber(texto, {locale, format, base})`, `numberToWords(n, {currency})`, `formatNumberText(n, {locale, format, currency, decimals})` |

## `<nx-kanban>`

Un tablero que se siente instantáneo. Las tarjetas se arrastran con el mouse o el dedo (manteniendo
pulsado): el hueco se abre donde van a caer, las demás se apartan con una animación y el tablero y la
columna se desplazan solos cerca de los bordes. También se mueven con el teclado: `Espacio` levanta,
las flechas mueven entre posiciones y columnas, `Espacio` suelta y `Escape` cancela, con cada paso
anunciado al lector de pantalla («Tarjeta OC-2291 levantada. Columna Aprobado, posición 2 de 5»).

Nada espera al servidor: el movimiento se ve al instante y se deshace mientras corre el aviso (o con
`Ctrl`+`Z`); la app registra en el backend cuando llega `nx-kanban-commit`. Si el tablero sale del DOM
con un movimiento pendiente, se registra en ese momento y el aviso se cierra (el evento ya no sube
hasta `document`: escúchelo en el elemento). Una columna con `confirm`
pide confirmación con impacto antes de aceptar la tarjeta (el protocolo de `nxConfirm`, que se carga
solo cuando hace falta; si se niega, la tarjeta vuelve). Una con `wip` se marca en rojo cuando se pasa
de su límite («6/5») y lo avisa al llevarle una tarjeta. Cada columna muestra cuántas tarjetas tiene y
cuánto suman (por moneda), se puede plegar, y el filtro (sin tildes) atenúa lo que no coincide sin
mover nada. En móvil, las columnas se desplazan de lado con snap.

```html
<nx-kanban id="compras" heading="Órdenes de compra"></nx-kanban>
<script>
  compras.columns = [
    { id: "borrador", label: "Borrador" },
    { id: "por-aprobar", label: "Por aprobar", tone: "warning", wip: 5 },
    { id: "aprobado", label: "Aprobado", tone: "primary" },
    { id: "anulado", label: "Anulado", tone: "danger",
      confirm: { heading: "¿Anular la {title}?", impact: "/compras/oc/impacto", hold: true } },
  ];
  compras.cards = [{ id: "2291", column: "por-aprobar", title: "OC-2291", subtitle: "Aceros del Caribe",
    tags: ["Producción"], assignee: "Ana María Rincón", amount: 10829000, currency: "COP", due: "2026-09-30" }];
  compras.addEventListener("nx-kanban-commit", (e) =>
    fetch(`/compras/oc/${e.detail.card.id}`, { method: "PATCH", keepalive: true,
      body: JSON.stringify({ estado: e.detail.to, orden: e.detail.index }) }));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `columns` (`{id, label, tone?, wip?, confirm?: {heading, message?, impact?, hold?, tone?, confirmLabel?}, collapsed?}`), `cards` (`{id, column, title, subtitle?, tags?, assignee?, amount?, currency?, due?, href?, data?}`; el orden de cada columna es el del arreglo, y el getter devuelve el estado actual), `heading`, `undo` (ms, 7000; 0 = sin aviso), `busy`, `locale`, `labels` |
| Métodos | `move(id, columna, índice?)` → `"commit"`, `"undo"` o `"cancel"` (el mismo flujo que arrastrar) |
| Eventos | `nx-kanban-move` `{card, from, fromIndex, to, index, via}` (cancelable), `nx-kanban-commit`, `nx-kanban-undo`, `nx-kanban-add` `{column}`, `nx-kanban-open` `{card}` (cancelable) |
| Impacto | `confirm.impact` recibe `POST {card, from, to, index, data}` y transmite NDJSON o SSE: `impact`, `block`, `note`, `done` |

## `<nx-history>`

La máquina del tiempo de un registro: quién cambió qué y cuándo, y cómo estaba en cualquier momento.

- **Línea de tiempo** del más nuevo al más viejo, agrupada por día («Hoy», «Ayer», «lunes 21 de
  septiembre»), con la hora relativa («hace 3 h») y el avatar o las iniciales de quien lo hizo.
  Cada cambio se lee «Estado: Por aprobar → Aprobada», con el formato de su campo (`money`,
  `number`, `date`, `status` con su tono, o la etiqueta de `options`).
- **Textos largos como diferencia por palabras:** lo quitado tachado en rojo suave, lo agregado en
  verde suave (subsecuencia común más larga, `wordDiff()`).
- **Viaje en el tiempo:** un deslizador (y ←/→, Inicio/Fin sobre él) recorre los eventos; el panel
  muestra el registro como estaba en ese momento —reconstruido desde el de hoy deshaciendo los
  cambios posteriores (`historyStateAt()`)—, con lo que cambió desde entonces marcado y su valor
  actual. «Así estaba el 12 sept 2026, 3:40 p. m.». Esc o «Volver al presente» regresan.
- **Filtros** por persona y por campo (chips con su conteo) y un buscador sin tildes que también
  encuentra valores formateados.
- **Revertir** un cambio que sigue vigente: `nx-history-revert` (cancelable), se aplica al instante
  con un evento que lo cuenta, se deshace desde el aviso (o Ctrl+Z) y, al acabar el tiempo,
  `nx-history-commit`: ahí la app guarda. Deshacer no pisa un registro más nuevo que haya llegado
  mientras tanto. Si el historial sale del DOM con una reversión pendiente, se registra en ese momento
  (el evento ya no sube hasta `document`: escúchelo en el elemento).
- **Notas** que aparecen al instante (`nx-history-comment`, cancelable).
- **`source`:** una URL http(s) del mismo origen (o de `allowOrigins`) que devuelve
  `{events, record?, more?}`; al llegar al final de la línea pide `?before=<id>` (la página
  anterior). Cambiarla empieza de cero: filtros, eventos y el `record` de la anterior (salvo uno
  puesto por la app). Un `at` sin hora («2026-09-12») es ese día en la hora local.

```html
<nx-history id="historia" heading="OC-2291" source="/compras/oc-2291/historial"></nx-history>
<script>
  historia.fields = [
    { key: "estado", label: "Estado", type: "status",
      options: [{ value: "por-aprobar", label: "Por aprobar", tone: "warning" }, { value: "aprobada", label: "Aprobada", tone: "success" }] },
    { key: "monto", label: "Monto", type: "money", currency: "COP" },
    { key: "observaciones", label: "Observaciones" },
  ];
  historia.user = { name: "Sofía Herrera" };
  historia.addEventListener("nx-history-commit", (e) =>
    fetch("/compras/oc-2291", { method: "PATCH", body: JSON.stringify({ [e.detail.change.field]: e.detail.change.from }) }));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `record`, `fields` (`{key, label, type?, currency?, options?}`), `events` (`{id, at, actor: {name, avatar?}, action, changes?: [{field, from, to}], note?, revertOf?}`), `source`, `user`, `undo` (ms, 7000; 0 = sin aviso), `heading`, `locale`, `labels` · `at`, `snapshot` |
| Métodos | `travel(id \| null)`, `revert(id, field)` → `"commit"` \| `"undo"` \| `"cancel"`, `comment(text)`, `reload()` |
| Eventos | `nx-history-revert` `{event, change}` (cancelable), `nx-history-commit` `{event, change, revert, record}`, `nx-history-comment` `{text}` (cancelable), `nx-history-travel` `{id, record}` |

## `<nx-date-range>`

Un rango de fechas que se escribe como se dice. Cerrado es un campo compacto
(«1 jul – 30 sept 2026 · 92 días»); abierto, una caja donde se escribe en español, que muestra en
vivo cómo lo entendió («1 jul – 30 sept 2026 · 92 días» o «No entendí…») y `Enter` lo aplica;
debajo, atajos y un calendario de dos meses.

- **Frases** (sin tildes ni mayúsculas): «hoy», «ayer», «esta semana», «la semana pasada», «este
  mes», «el mes pasado», «últimos 7/30/90 días», «este trimestre», «último trimestre», «Q3», «Q3
  2025», «este año», «2025», «marzo», «marzo 2025», «de marzo a junio», «desde el 15 de marzo»,
  «hasta el 10 de abril», «15/03/2026 - 20/04/2026», «primer semestre», «semana 12», «en lo que va
  del año», «año fiscal» (con `fiscal-start`). Sin año, la más reciente que ya empezó (en
  septiembre, «Q4» es el del año pasado); en un rango, el extremo que no dice su año o su mes lo
  toma del otro («15 al 20 de abril», «de noviembre a febrero»); un día suelto que así quedaría
  del lado equivocado es del mes de al lado («25 al 5»: del 25 del mes pasado al 5). «Último
  trimestre» es el anterior completo; «últimos N días» cuenta hoy.
- **Calendario** de dos meses (uno en móvil): clic en el inicio y en el fin con vista previa al
  pasar; teclado completo (flechas, `PageUp`/`PageDown`, con `Shift` un año, `Home`/`End`, `Enter`,
  `Escape` suelta un inicio a medias y luego cierra); `min`/`max` deshabilitan días; hoy marcado.
  La semana empieza según `Intl.Locale` (weekInfo), o lunes; `week-start` la fija.
- **Comparar:** `compare="previous"` (el mismo largo justo antes; meses completos → los meses
  anteriores: Q3 → Q2) o `"year"` (las mismas fechas un año antes; 29 feb → 28 feb). Se pinta en el
  calendario y va en el valor.
- **Formulario:** con `name="periodo"` envía `periodo[start]` y `periodo[end]` (y
  `periodo[compare][start|end]`): dos fechas ISO que el servidor lee sin partir nada. `required` y
  `reset` nativos.
- La misma lógica, sin DOM, para el backend: `parseDateRange("Q3 2025", {today, fiscalStart})`,
  `compareRange()`, `formatDateRange()`.

```html
<nx-date-range id="periodo" name="periodo" phrase="últimos 30 días" compare="previous" min="2024-01-01" label="Período"></nx-date-range>
<script>
  periodo.addEventListener("nx-date-range-change", (e) => {
    const { start, end, compare, label } = e.detail.value; // "2026-08-27", "2026-09-25", {start, end}, "Últimos 30 días"
  });
</script>
```

| | |
|---|---|
| Propiedades / atributos | `value` (`{start, end, compare?, label?}` o «start/end»), `start`, `end`, `phrase`, `presets`, `compare` (`previous` \| `year` \| `none`), `min`, `max`, `today`, `fiscal-start`, `week-start`, `name`, `required`, `disabled`, `placeholder`, `label`, `locale`, `labels` |
| Métodos | `show(frase?)`, `hide()`, `open` |
| Eventos | `nx-date-range-change` `{value}` y `change` (nativo), `nx-open-change` `{open}` |

## `<nx-paste-fill>`

Pegas un texto y el formulario se llena solo. Envuelve un formulario tuyo (sus `<input>`,
`<select>` y `<textarea>` con `name`, sin moverlos): la persona pega un correo de un proveedor, un
WhatsApp o una firma —con Ctrl/⌘+V sobre el formulario, en la zona «Pega aquí…», con el botón
«Pegar» o arrastrando el texto— y cada campo recibe lo suyo con su **confianza** y su
**evidencia**, como `<nx-doc-capture>` pero para texto.

- **Esquema automático:** lee cada campo (`name`, su `<label>` o `aria-label` o `placeholder`,
  `type`, opciones de un select). `fields` lo enriquece por `name`:
  `{ name: "monto", kind: "money" }` (`kind`: `email`, `phone`, `nit`, `id`, `money`, `date`,
  `url`, `name`, `company`, `role`, `address`, `city`, `number`, `text`). Sin `kind`, se deduce del
  `type`, el `name` y la etiqueta, sin tildes.
- **Extractor local, sin servidor:** correo; celular y fijo colombianos (`+57`, `60X`, y los de 7
  cifras de antes con su indicativo nuevo); NIT con su dígito de verificación (si no cuadra,
  confianza baja y el dígito correcto en el aviso); cédula; montos (`$ 1.450.000`, `1,45 millones`,
  `450 mil`, `USD 300`, «2 palos»); fechas (`15/03/2026`, `15 de marzo`, `el próximo viernes`,
  `en 15 días hábiles`, relativas a hoy); direcciones (`Cra. 15 # 93-47 Of. 301`); ciudades; razón
  social (S.A.S., S.A., Ltda.); el nombre tras «Atentamente,» o «--» y su cargo; «Etiqueta: valor».
  Cada campo recibe lo más probable según lo que dice el texto justo antes («con entrega el…» →
  «Fecha de entrega»); si hay dos candidatos casi empatados, baja la confianza y lo dice.
- **Al llenar:** cada campo brilla un instante; queda con un chip de confianza, y lo que está bajo
  `review-below` (0,8) queda «Revisar» hasta que la persona lo corrige o lo confirma. Lo que la
  persona ya había escrito **no se pisa**: se muestra la sugerencia con «Usar» / «Dejar el mío».
  Cada campo que cambia recibe `input` y `change` (con el setter nativo: React también se entera).
- **Evidencia:** el texto pegado con cada tramo del color de su campo; pasar por un campo ilumina
  su tramo y al revés; clic en un tramo enfoca el campo.
- **Deshacer:** el botón o Ctrl/⌘+Z fuera de un campo devuelven los valores de antes (lo que la
  persona cambió después se respeta).
- **Servidor opcional:** con `endpoint`, se llena primero lo local y a la vez se hace
  `POST {text, fields}`; la respuesta (NDJSON o SSE) gana:
  `{"type":"field","name","value","confidence","source":{"start","end"},"hint"?}`,
  `{"type":"note","message"}`, `{"type":"done"}` / `{"type":"error"}`. Si falla, queda lo local y
  se avisa. El `endpoint` es del mismo origen (o de uno de `allowOrigins()`).
- **Lo que se pega en un control es de ese control:** en un campo (también una contraseña o una
  casilla) no se intercepta ni se lee. Más de 50 000 caracteres no se leen: la zona lo dice.

```html
<nx-paste-fill endpoint="/proveedores/leer" fields='[{"name":"monto","kind":"money"}]'>
  <form>
    <label>Razón social <input name="razon_social"></label>
    <label>NIT <input name="nit"></label>
    <label>Correo <input name="correo" type="email"></label>
    <label>Fecha de entrega <input name="entrega" type="date"></label>
  </form>
</nx-paste-fill>
```

| | |
|---|---|
| Propiedades / atributos | `fields`, `endpoint`, `review-below`, `for` (el `id` de un formulario en otra parte), `locale`, `labels` · `state`, `text`, `pending` |
| Métodos | `fill(text)`, `undo()`, `clear()` |
| Eventos | `nx-paste-fill-start` `{text}` (cancelable), `nx-paste-fill-done` `{values, fields}`, `nx-paste-fill-undo` `{values}` |
| Funciones | `extractPasteData(text)`, `matchPasteFields(fields, text)`, `nitCheckDigit(base)`: el mismo extractor, en el navegador o en un backend en JavaScript |

## `<nx-presence>`

Quién más está aquí, en vivo: los avatares de quienes tienen abierto el mismo registro, en qué
campo está cada quien y quién escribe, sin depender de ningún backend.

- **Pila de avatares** sin la persona actual (`me`): color estable por persona (sale de su `id`,
  igual en todas las pestañas), foto (`avatar`, solo `https:` o del mismo origen, sin referrer) o iniciales, punto verde si
  está activa y gris si no. Los que no caben van en «+N» (`max`); la lista completa dice qué hace
  cada quien: «viendo», «editando Monto», «inactivo hace 4 min».
- **Campos compartidos:** con `for="id-del-formulario"`, los campos con `data-presence="clave"` (o
  con `name`) muestran un contorno del color de quien los enfoca y su nombre encima, en una capa
  aparte que no mueve el layout; el contorno se desliza al campo siguiente. «Ana está
  escribiendo…» mientras escribe. `data-presence-label` le da nombre a un campo (si no, su
  `<label>`).
- **Bloqueo suave:** si otra persona está editando un campo y la actual lo enfoca, un aviso que no
  bloquea («Ana está editando este campo; tus cambios podrían pisar los suyos») con «Seguir de
  todas formas» (o Esc).
- **Latidos:** cada 15 s; quien no da señales en 45 s se va solo, quien cierra la pestaña se
  despide al instante. Pestaña oculta o `idle` ms sin actividad (120000): inactivo.
- **Transporte:** `channel` (`BroadcastChannel` entre pestañas), `source` (`EventSource`/SSE) o
  `push(evento)` con el tuyo. Lo que hace la persona actual sale en `nx-presence-local`: la app lo
  manda a su servidor. `source` es del mismo origen. El `user` de un evento no se verifica en el
  navegador: el servidor debe sellarlo con la sesión de quien envía.
- **Accesible:** la pila es una lista con nombres y actividad; entradas, salidas y ediciones se
  anuncian en una región `aria-live`, agrupadas («Ana y Héctor entraron») y como mucho una frase
  cada 3 s.

```html
<nx-presence id="aqui" channel="oc-2291" for="orden"></nx-presence>
<form id="orden">
  <label>Monto <input name="monto"></label>
  <div data-presence="notas" data-presence-label="Notas">…</div>
</form>
<script>
  aqui.me = { id: "u-812", name: "Sofía Herrera", avatar: "/fotos/812.jpg" };
  // Con un servidor: SSE para recibir, y lo propio de vuelta.
  aqui.source = "/compras/oc-2291/presencia";
  aqui.addEventListener("nx-presence-local", (e) =>
    fetch("/compras/oc-2291/presencia", { method: "POST", keepalive: true, body: JSON.stringify(e.detail) }));
</script>
```

El protocolo: `{type, user: {id, name, avatar?}, field?}`, con `type` = `join`, `leave`, `focus`,
`blur`, `typing`, `lock`, `unlock` o `heartbeat`. El latido (y `join`) lleva además el estado
completo (`field`, `editing`, `idle`), para que quien acaba de entrar lo vea tal cual. Los eventos
propios que devuelva el servidor se ignoran.

| | |
|---|---|
| Propiedades / atributos | `me` (`{id, name, avatar?}`), `channel`, `source`, `for`, `idle` (ms, 120000), `max` (4), `locale`, `labels` · `users` (solo lectura: `{id, name, avatar?, field, editing, typing, idle, idleSince, joinedAt, seenAt}[]`) |
| Métodos | `push(evento)` → `boolean` (objeto o JSON) |
| Eventos | `nx-presence-change` `{users}`, `nx-presence-local` (un evento del protocolo) |

## `<nx-what-if>`

Un simulador de escenarios para decisiones de negocio: «¿qué pasa con el margen si el acero sube 8 %
y vendemos 5 % menos?». El componente no lleva fórmulas: el cálculo lo hace el backend (en
streaming) o la app. Todo lo demás —deslizadores, animación, diferencias contra la base, gráfico y
comparación de escenarios— es suyo.

- **Supuestos:** deslizadores con la base marcada en la pista y el tramo desde ella resaltado. El
  valor grande se escribe con un clic («4.600», «4,5 M», «150 mil»; en porcentaje, puntos) y debajo
  va «+8 % vs. base». «Restablecer» por supuesto y para todos. La grilla de `step` parte de la base,
  así que arrastrando se vuelve exacto a ella.
- **Teclado:** ←/→ ± `step` (Mayús ×10), RePág/AvPág ± 10 pasos, Inicio/Fin. `aria-valuetext` dice el
  valor con su formato y la diferencia («US$ 842, +8 % vs. base»).
- **Resultados:** tarjetas con el valor del escenario (el número corre hacia el nuevo; directo con
  `prefers-reduced-motion`), la base y la diferencia, en verde si mejora según `better` y en rojo si
  empeora (en porcentajes, en puntos: «-2,8 p. p.»). Un gráfico de líneas propio, sin librerías:
  base punteada, escenario continuo, el área entre los dos y el cero si el rango lo cruza (y una
  tabla oculta con los datos para el lector de pantalla).
- **Cálculo:** con espera entre cambios (`debounce`, 250 ms); la petición anterior se cancela
  (`AbortController`) y una respuesta vieja nunca pisa a una nueva. Mientras llega, los resultados se
  atenúan. Sin `endpoint` (o con uno de otro origen, que no se usa), el evento
  `nx-what-if-compute` le pide el cálculo a la app.
- **Escenarios:** «Guardar como…» guarda supuestos y resultados con un nombre. Una tabla compara la
  base, el escenario actual y los guardados lado a lado, con la mejor celda de cada métrica resaltada;
  desde el encabezado de cada columna se cargan, renombran y borran. La app los persiste
  (`nx-what-if-save`).

```html
<nx-what-if id="plan" heading="Plan de compras 2027" endpoint="/finanzas/plan-2027/simular"></nx-what-if>
<script>
  plan.inputs = [
    { id: "acero", label: "Precio del acero", value: 780, min: 546, max: 1014, step: 5, format: "money", currency: "US$" },
    { id: "volumen", label: "Volumen de ventas", value: 144000, min: 115200, max: 172800, step: 1440, unit: "u." },
  ];
  plan.outputs = [
    { id: "margen", label: "Margen bruto", format: "percent", better: "up" },
    { id: "equilibrio", label: "Punto de equilibrio", unit: "u.", better: "down" },
  ];
  plan.addEventListener("nx-what-if-save", (e) => guardar(e.detail.scenarios));
</script>
```

El backend recibe `POST {inputs: {acero: 842, volumen: 136800}}` y responde una línea por evento:

```
{"type":"metric","id":"margen","value":0.193,"base":0.221}
{"type":"series","id":"caja","label":"Saldo de caja","format":"money","currency":"COP","points":[{"x":"ene","base":7640e6,"value":7329e6}, …]}
{"type":"note","message":"El margen cae bajo el 15 %","tone":"warning"}
{"type":"done"}
```

| | |
|---|---|
| Propiedades / atributos | `inputs` (`[{id, label, value, min, max, step?, format?, currency?, unit?, hint?}]`), `outputs` (`[{id, label, value?, base?, format?, currency?, unit?, better?}]`), `series` (`[{id, label, format?, currency?, points: [{x, base?, value}]}]`), `scenarios` (`[{id, name, inputs, outputs}]`), `values`, `endpoint`, `debounce`, `heading`, `locale`, `labels` |
| Métodos | `reset(id?)`, `recompute()`, `save(name?)` |
| Eventos | `nx-what-if-compute` `{inputs, respond(events)}`, `nx-what-if-save` `{action, scenario, scenarios}` (cancelable), `nx-what-if-change` `{id, inputs}` |
| Protocolo | NDJSON o SSE: `metric`, `series`, `note` (`tone`), `error`, `done` |

## `<nx-trend>`

Un gráfico que se explica. Series de tiempo del ERP (ventas, costos, inventario) en líneas o barras,
en SVG propio y sin librerías, con la pregunta que importa a un clic: **«¿por qué?»**.

- **Se lee:** ticks redondos en el eje y («400 M», con `Intl`), meses cortos en el x (con el año bajo
  enero), cuadrícula de una línea, el último valor al final de cada línea, y una leyenda que muestra
  y oculta series (el color sigue a la serie, no a su posición). Se adapta al ancho (ResizeObserver).
- **Se recorre:** una línea vertical sigue al puntero, o a ←/→ con el foco en el gráfico, con un
  tooltip de todas las series en ese periodo; ↑/↓ cambian de serie.
- **Anomalías:** las que manda el backend (`anomalies`) y, con `detect`, las que se apartan de la
  media móvil (desviación robusta, así una serie que crece parejo no se marca entera): un anillo que
  late y una etiqueta corta («Acero +18 %»).
- **«¿Por qué?»:** clic o Enter en un punto abre, anclado a él, un `<nx-ai-answer>` que pregunta a
  `explain-endpoint` «¿Por qué sube Materia prima en agosto?» con `context: {series, point, previous,
  window, anomaly?}` y muestra la respuesta en streaming con sus pasos y citas (el protocolo de IA de
  la librería). Se puede repreguntar desde la caja. `<nx-ai-answer>` se carga con `import()` la
  primera vez. `explain-endpoint` es del mismo origen (o de uno de `allowOrigins()`).
- **Accesible:** el SVG es una imagen con un resumen generado («Ventas: sube 11 % de julio a agosto;
  máximo en agosto»), que también se ve debajo; cada punto es un botón (un solo Tab); la tabla
  equivalente está siempre para el lector de pantalla y a la vista con «Ver como tabla»; cada serie
  tiene además su forma de marcador. Los colores (`--nx-trend-1…8`) son una paleta categórica
  validada para daltonismo en claro y en oscuro; `muted` pinta una serie de referencia en gris.
- **Movimiento:** la línea se dibuja y las barras crecen al llegar los datos (nada con
  `prefers-reduced-motion`).

```html
<nx-trend id="costos" heading="Costo de producción 2026" format="money" currency="COP"
  explain-endpoint="/ia/por-que" detect></nx-trend>
<script>
  costos.series = [
    { id: "mp", label: "Materia prima", points: [{ x: "2026-01", y: 388400000 }, /* … */] },
    { id: "mo", label: "Mano de obra", points: [/* … */] },
  ];
  costos.anomalies = [{ series: "mp", x: "2026-08", label: "Acero +18 %" }];
  costos.addEventListener("nx-trend-why", (e) => console.log(e.detail.question, e.detail.point));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `series` (`{id, label, points: {x, y}[], format?, currency?, kind?, muted?, hidden?}`; `x` «2026-08» o «2026-08-15»; `y` `null` corta la línea), `anomalies` (`{series, x, label?}`), `heading`, `kind` (`line`, `bar`), `format` (`number`, `money`, `percent`), `currency`, `height` (260), `detect` (sin valor: 3), `explain-endpoint`, `busy`, `locale`, `labels` · `flags`, `summary` |
| Métodos | `explain(id, x, pregunta?)`, `close()` |
| Eventos | `nx-trend-why` `{question, series, point, previous, window, anomaly?}` (cancelable: no se abre el popover), `nx-trend-toggle` `{id, visible}` |
| Funciones | `detectAnomalies(serie, umbral?, ventana?)`, `niceTicks(min, max)`, `periodLabel(x, locale, estilo)`, `summarizeTrend(series, anomalías, labels, locale)`, `trendQuestion(…)`, `trendContext(…)` |

## `<nx-scan>`

Escanear códigos de barras y QR con la cámara, para inventario y recepción. Abre la cámara trasera
(`getUserMedia`) y lee con `BarcodeDetector` los `formats` pedidos: un recuadro guía con una línea que
barre, linterna si la cámara la tiene (`torch`), cambio de cámara, y al leer vibra, suena un «bip»
(desactivable) y el visor destella con un recuadro sobre el código. El mismo código no vuelve a
contar antes de 1,5 s, ni mientras siga quieto frente a la cámara.

- **Sin cámara también sirve.** Sin `BarcodeDetector` (Firefox, Safari de escritorio, Chrome en
  Windows/Linux), sin permiso, sin HTTPS o sin cámara, lo dice en el visor y quedan: el campo para
  escribir el código (`12*7707123450011` suma 12), la **pistola lectora USB** y **leer desde una foto**
  (si hay detector).
- **Pistola lectora.** Las pistolas «teclean» el código y un Enter. Una ráfaga así (menos de 60 ms
  entre teclas, 40 en promedio) se toma como lectura en cualquier parte de la página, aunque el foco
  no esté en el campo, y su Enter no activa el botón enfocado. Con el foco en otro campo, escribe en
  ese campo como siempre: nunca se roba lo que la persona teclea.
- **Conteo** (`mode="count"`): cada lectura suma a una lista agrupada por código, con la cantidad
  editable (−/+ o escribiéndola), la última lectura resaltada, deshacer (el aviso o `Ctrl`+`Z`) y
  totales. Con `source` (del mismo origen), cada código nuevo trae su descripción: «Lámina HR 3 mm · esperadas 40 ·
  contadas 38», con faltantes (rojo), completas (verde) y sobrantes (ámbar).
- **Modo único** (por defecto): una lectura dispara `nx-scan-read` y la cámara se apaga.
- **Sin cámara prendida de más:** se apaga al salir de la página, al ocultarse la pestaña o si el
  componente queda fuera de la pantalla, y vuelve sola.
- Todo se usa sin cámara y con teclado; cada lectura se anuncia (`aria-live`).

```html
<nx-scan id="recepcion" mode="count" source="/inventario/producto?code=" formats="ean_13,code_128,qr_code"></nx-scan>
<script>
  // Las líneas de la orden: lo que falta se ve desde el comienzo.
  recepcion.items = [{ code: "7707123450011", name: "Lámina HR 3 mm", unit: "und", expected: 40, qty: 0 }];
  recepcion.addEventListener("nx-scan-count", (e) => guardarBorrador(e.detail.items));
</script>

<nx-scan id="buscar"></nx-scan>
<script>
  buscar.addEventListener("nx-scan-read", (e) => abrirProducto(e.detail.code)); // {code, format, via}
</script>
```

| | |
|---|---|
| Propiedades / atributos | `mode` (`single`, `count`), `formats` (lista con comas o JSON; `ean_13`, `ean_8`, `upc_a`, `upc_e`, `code_128`, `code_39`, `code_93`, `codabar`, `itf`, `qr_code`, `data_matrix`, `pdf417`, `aztec`), `source` (URL + código, o con `{code}`), `items` (`{code, qty, name?, unit?, expected?, format?}`), `muted`, `autostart`, `wedge` (`page`, `field`, `off`), `locale`, `labels` · `state`, `problem` (solo lectura) |
| Métodos | `start()`, `stop()`, `add(código, cantidad?)`, `undo()`, `clear()`, `focus()` |
| Eventos | `nx-scan-read` `{code, format, via}` (cancelable; `via`: `camera`, `photo`, `manual`, `wedge`, `api`), `nx-scan-count` `{items}`, `nx-scan-error` `{problem}` (`nodetector`, `nocamera`, `insecure`, `denied`, `busy`, `failed`) |
| `source` | `GET` → `{code, name, unit?, expected?}`; 404 si no existe («Código sin registrar»). Una vez por código |
| Funciones | `wedgeKey(estado, tecla, ms)` (la detección de la pistola, sin DOM), `gtinValid(código)`, `scanTotals(items)`, `scanItemStatus(item)`, `parseScanEntry(texto)` |

## `<nx-sync>` y `nxSync`

Trabajar sin conexión, y que nada se pierda: para vendedores en ruta, bodegas y plantas con señal
intermitente.

- **La cola (`nxSync`)** guarda cada escritura en IndexedDB (en memoria si no hay) antes de
  intentar nada, y la envía cuando hay conexión, **en orden**, de a una. Cerrar la pestaña o
  recargar no la pierde: lo que iba en camino vuelve a la fila.
- **Reintentos** sin respuesta, 5xx, 429 o 408: toda la cola espera 1 s, 2 s, 4 s… (tope 60 s, ±20 %
  al azar), o lo que diga `Retry-After` (segundos o fecha) si es más, hasta 1 h. Tras 8 respuestas
  de error del servidor (`maxAttempts`), «fallida»; sin red se espera lo que haga falta. Un 401
  detiene la cola hasta que la app renueve la sesión (`configure({headers})`).
- **Una pestaña envía:** con varias abiertas, `navigator.locks` elige una; las demás se enteran por
  `BroadcastChannel`. `enqueue()` rechaza si no se pudo guardar en el dispositivo, y
  `state.durable` dice si lo pendiente sobrevive a cerrar la página. Lo guardado va en claro: llama
  a `nxSync.clear()` al cerrar sesión (usa una cola por usuario, `createSync({name})`, y pon su nombre
  en `<nx-account sync>`), y acota con `maxOps` y `ttl`.
- **Conexión real:** `navigator.onLine`, los eventos `online`/`offline` y un `ping` opcional; con
  red «arriba» pero sin llegar al servidor, se sigue probando sin gastar intentos.
- **Sin duplicados:** cada envío lleva `Idempotency-Key` con el id de la operación; si la respuesta
  se perdió, el reintento no crea otro registro. Al corregir o resolver, la llave cambia (ya es otra
  petición).
- **Conflictos:** un 409 con `{server, local?, fields?, etag?}` deja la operación «en conflicto». El
  panel muestra un comparador campo por campo (lo mío / lo del servidor, lo distinto resaltado), se
  elige por campo o «todo lo mío / todo lo del servidor», y la versión resuelta sale con `If-Match`.
- **Rechazos:** otro 4xx queda «rechazado» con el mensaje del servidor; se corrige el cuerpo (JSON,
  validado) y se reintenta, o se descarta. Ni conflictos ni rechazos frenan la cola: solo a las
  siguientes de su mismo `group`.
- **La píldora `<nx-sync>`:** «En línea» (verde, discreta), «Sin conexión · 3 pendientes» (ámbar),
  «Sincronizando 2 de 5…» (con su avance), «Reintento en 12 s», «1 conflicto» (roja, se nota). Al
  pulsarla, el panel con cada operación (hace cuánto, intentos, cuenta regresiva) y sus acciones:
  reintentar ya, descartar (con confirmación), resolver, corregir. Anuncia con `aria-live` cuando se
  va y vuelve la conexión y cuando termina de sincronizar.

```html
<nx-sync id="sync" ping="/api/ping"></nx-sync>
<script type="module">
  import { nxSync } from "nx32-elements/sync";

  sync.fields = [{ key: "productos.*.cantidad", label: "Cantidad · {nombre}" }];
  await nxSync.enqueue({
    method: "POST", url: "/api/pedidos", body: pedido,
    label: `Pedido · ${tienda.nombre}`, group: tienda.nit,
  });
  sync.addEventListener("nx-sync-done", (e) => pintarConfirmado(e.detail.data));
</script>
```

| | |
|---|---|
| `nxSync` | `enqueue({id?, method, url, body?, label, group?})` → la operación guardada (rechaza si no se pudo guardar) · `pending()` · `retry(id, body?)` · `resolve(id, body)` · `discard(id)` · `flush()` · `check()` · `clear()` (al cerrar sesión) · `subscribe(fn)` → dejar de escuchar (`fn(state, event)`) · `state` `{online, ops, pending, conflicts, failed, progress, durable, auth}` · `configure({ping, base, max, timeout, headers, maxAttempts, maxRetryAfter, maxOps, ttl})` · `createSync({name})` para otra cola · `syncQueue(name)` (la cola de ese nombre; `nxSync` sin nombre) · `onSyncQueue(name, fn)` (avisa cuando exista) → dejar de esperar |
| Propiedades / atributos | `ping` (mismo origen), `fields` (`[{key, label}]`, con `*` y `{hermano}`), `labels`, `locale` · `online`, `pending`, `conflicts`, `state`, `open` |
| Métodos | `show()`, `hide()`, `toggle()`, `resolve(id)` |
| Eventos | `nx-sync-change` `{online, pending, conflicts}`, `nx-sync-done` `{op, data}`, `nx-sync-auth` `{op}` |
| Protocolo | cada envío con `Idempotency-Key`, `Content-Type: application/json` e `If-Match` al resolver · 409 `{server, local?, fields?, etag?, message?}` · otro 4xx `{message}` · `GET ping`: cualquier respuesta es conexión |

## `<nx-import>`

Importar una hoja de Excel o un CSV sin sufrir. Hoy la persona pega mil filas, el sistema dice
«error en la fila 412» y vuelve a empezar. Aquí se suelta el archivo, las columnas se acomodan
solas, los errores se corrigen ahí mismo y se importa. Tres pasos con un solo indicador («Paso 2
de 3 · Columnas»), controles de formulario normales y botones Anterior / Siguiente.

- **Archivo.** Se arrastra, se elige (la zona es un botón) o se pega con Ctrl/⌘+V lo copiado de
  Excel. CSV/TSV/TXT: detecta el separador (`,` `;` tabulador `|`) por consistencia de columnas,
  respeta comillas, comillas escapadas y saltos de línea dentro de una celda, quita el BOM y lee
  UTF-8, UTF-16 (el «Texto Unicode» de Excel) o windows-1252 si trae bytes inválidos («Bogotá» y no
  «Bogot�»). .xlsx: lector propio sin dependencias (ZIP con `DecompressionStream`, textos
  compartidos y enriquecidos, fechas por su formato, sistema 1900 y 1904) que se carga solo cuando
  llega un libro; si hay varias hojas, se elige. La **fila de encabezados** se encuentra aunque haya
  títulos o filas vacías arriba, y se cambia a mano. Tope de tamaño (`max-size`, 20 MB).
- **Columnas.** Cada campo queda asociado a una columna del archivo, con una muestra de sus valores
  y la confianza: **por el nombre** (`label`, `key` y `aliases`, sin tildes, tolerante a una letra
  de más: «Nit/CC» ↔ `nit`, «Celular» ↔ «Teléfono móvil») o, si el encabezado no dice nada
  («Columna 3» o vacío), **por el contenido**: correos, NIT con dígito de verificación válido,
  fechas, montos, opciones. Uno a uno. Un `<select>` lo cambia, lo deja en «No importar» o le pone
  **un mismo valor a todas las filas** («Ciudad: Medellín»). Un obligatorio sin columna no deja
  seguir. El mapeo se **recuerda** (`localStorage`, por `memory` o `id` y los encabezados): el
  mismo archivo del mes siguiente sale igual, y se dice.
- **Revisión.** Cada fila se normaliza y valida por el tipo del campo (`text`, `number`, `money`,
  `percent`, `date`, `email`, `phone`, `nit`, `bool`, `option`) y las reglas (`required`, `unique`,
  `min`/`max`, `pattern`). Los números en el formato del locale, pero **decidido por columna**: una
  columna «1,234.50» en un archivo es-CO se lee bien; montos con `$`, contables `(1.200)`, `19%` o
  `0,19`. Fechas ISO, dd/mm o mm/dd (por columna: si algún día pasa de 12 en la primera posición es
  dd/mm; si no se sabe, el del locale), «12-sep-2026», seriales de Excel, años de 2 cifras. Arriba,
  «1.204 filas listas · 7 con errores · 3 vacías que se omiten»; abajo, primero las filas con
  error (con su número de fila del archivo) y la celda **editable ahí mismo**; al corregir se
  revisa de nuevo esa fila. O «Omitir las filas con errores». Nunca más de 200 filas pintadas.
- **Importar.** Sin `endpoint`: `nx-import-done` con `{rows, skipped, mapping, fixed, headers}`
  (números como número, fechas ISO, opciones por su `value`). Con `endpoint` (del mismo origen, o
  de uno de `allowOrigins()`): `POST {rows, offset}` en lotes de `batch`, con avance y
  cancelable; la respuesta puede traer `{errors: [{row, field?, message}]}` (`row` = `offset` +
  índice en el lote) y esas filas vuelven a la revisión para corregirlas y reenviar solo esas. Al
  final, «Importamos 1.197 clientes» y un CSV (con BOM, para Excel) con lo que no entró y el motivo.
- 50.000 filas × 15 columnas se revisan por tramos, sin congelar la página.

```html
<nx-import id="clientes" endpoint="/api/clientes/importar" columns='[
  {"key":"nit","label":"NIT","type":"nit","required":true,"unique":true,"aliases":["nit/cc"]},
  {"key":"razon_social","label":"Razón social","required":true},
  {"key":"ciudad","label":"Ciudad","type":"option","options":[{"value":"05001","label":"Medellín"},{"value":"11001","label":"Bogotá D.C."}]},
  {"key":"cupo","label":"Cupo de crédito","type":"money","min":0},
  {"key":"alta","label":"Fecha de alta","type":"date"}
]'></nx-import>
<script>
  clientes.addEventListener("nx-import-done", (e) => console.log(e.detail.rows));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `columns` (`{key, label, type?, required?, unique?, options?, aliases?, min?, max?, pattern?, hint?}`), `endpoint`, `batch` (500), `accept`, `max-size` («20MB»), `memory`, `locale`, `labels` (plural con «uno\|varios»), `disabled` · `state`, `rows`, `mapping` (solo lectura) |
| Métodos | `load(archivo \| texto)`, `reset()` |
| Eventos | `nx-import-parsed` `{name, sheet?, sheets?, headers, headerRow, rows}`, `nx-import-mapped` `{mapping, fixed, remembered}`, `nx-import-done` `{rows, skipped, mapping, fixed, headers}`, `nx-import-error` `{code, message}` (`size`, `read`, `empty`, `network`) |
| Funciones | `parseCsv`, `decodeImportBytes`, `detectHeaderRow`, `autoMapColumns`, `validateImportRows`, `normalizeImportValue`, `parseImportNumber`, `parseImportDate`, `importRowsToCsv`…: la misma lógica sin DOM, para un backend en JavaScript |

## `<nx-keytips>`

Atajos de teclado sin configurar nada, como los KeyTips de Office. Se pone una vez en la página;
se **toca Alt** (se presiona y se suelta, sola) y cada acción visible muestra una letra en una
etiqueta pequeña; se pulsa la letra y se ejecuta. Esc, Tab, un clic o otro toque de Alt los ocultan.
Mantener Alt ~400 ms también los muestra (y Alt+letra sin soltar ejecuta).

- **Qué recibe letra:** botones, enlaces, pestañas, `summary`, casillas, campos, listas,
  `contenteditable`, lo tabulable con nombre y lo marcado con `data-keytip`; solo lo visible y sin
  tapar dentro de `scope`. Nada deshabilitado, inerte, oculto ni `data-keytip="off"` (en un
  contenedor, todo lo de adentro). Con un diálogo modal (`<nx-dialog>`, `<dialog>`) o un popover
  abierto, solo lo de adentro.
- **Qué letra:** la inicial de la primera palabra que importa del nombre accesible, sin tildes
  («Guardar» G, «Enviar al cliente» E), luego las iniciales de las demás palabras y luego sus otras
  letras. `data-keytip="X"` la fija. Es **estable**: el mismo elemento conserva su letra entre
  aperturas mientras siga en pantalla. Con más de 30 acciones, dos letras (como Vimium): la primera
  atenúa las que no empiezan por ella. `assignKeytips()` es la misma asignación, pura.
- **Qué hace:** un clic (botones, enlaces, pestañas, casillas; en `<nx-button>`, su botón) o el
  foco con el texto seleccionado (campos). Antes sale `nx-keytips-activate`, cancelable.
- **No estorba:** funciona mientras se escribe en un campo (la letra no se escribe); Alt+Tab, AltGr
  para «@» y Ctrl+Alt no lo activan; Tab y los atajos con Ctrl/⌘ (la paleta con Ctrl+K) cierran los
  atajos y siguen su camino. Cerrado, solo escucha `keydown`/`keyup`.

```html
<nx-keytips></nx-keytips>

<button data-keytip="X">Exportar a Excel</button>  <!-- letra fija -->
<button data-keytip="off">Eliminar</button>         <!-- sin atajo -->
```

| | |
|---|---|
| Propiedades / atributos | `scope` (selector), `key` (`Alt`, `Control`, `Shift`, `Meta` o `none`), `disabled`, `labels` · `open`, `assignments` (`[{key, name, element}]`) |
| Métodos | `show()`, `hide()` |
| Eventos | `nx-keytips-activate` `{key, target, name}` (cancelable), `nx-open-change` `{open}` |
| Funciones | `assignKeytips([{name, forced?, prev?}])` → códigos, `keytipLetters(nombre)` |

## `<nx-guard>`

El detector de dedazos. Los errores más caros de un ERP no son los que la validación rechaza, sino
los valores válidos pero absurdos: un precio con un cero de más, una cantidad de 1000 donde siempre
van 10, una fecha en 2062, dos dígitos invertidos en un total. `<nx-guard>` envuelve tu formulario
(sin mover sus campos) y, al salir de un campo, compara lo escrito con lo habitual; si algo no
cuadra, lo dice **junto al campo, sin bloquear**, con la corrección a un clic.

- **Un cero de más o de menos:** con `history` (valores recientes del campo) calcula lo habitual
  con mediana y MAD (un atípico en la historia no mueve nada; tiempo lineal, sin ordenar). Si el
  valor está lejos y ÷ o × 10, 100 o 1.000 cae en lo habitual: «$ 12.000.000 es 10 veces lo
  habitual ($ 1.200.000). ¿Sobra un cero?» con «Corregir a $ 1.200.000». Si solo está muy lejos:
  «Muy por encima de lo habitual ($1,1 M – $1,3 M)». Con menos de 4 datos, solo lo obvio. Sin
  historia, `typical: [lo, hi]` o `min`/`max` blandos.
- **Separador confundido:** «1.500» queriendo 1,5, o «1,500» de un sistema en inglés: si la otra
  lectura de lo tecleado cae en lo habitual, «Se leyó 1.500. ¿Querías 1,5?». Lee como
  `<nx-number>` y `nxFormat().parse`.
- **Dígitos invertidos:** con `expected` (un número, `"#id"` de un elemento con el valor o
  `"@name"` de otro campo): «¿Invertiste dos dígitos? Esperado $ 1.530.000» o «Difiere en un
  dígito de …».
- **Fechas:** año con dígitos invertidos o de otro siglo (2062, 2206, 0226 → 2026), fuera de
  `typical: ["-30d", "+90d"]` (ISO o relativas a hoy: `d`, `w`, `m`, `y`, `today`), fin de semana
  o festivo con `workdays` y `holidays`.
- **Además:** `repeat` (igual al último de `history`), decimales donde siempre van enteros
  (`integer`, o deducido de la historia) y negativos donde nunca los hay (`negative`, o deducido).
- **El servidor:** con `endpoint`, `POST {field, value, values}` tras 300 ms (un cambio nuevo
  cancela el anterior); responde `{findings: [{field, kind, message, suggestion?}]}` («Esta factura
  ya se registró el 12 sep»). Si falla o tarda más de 4 s, silencio.
- **Cómo avisa:** una línea sobria debajo del campo (después de su `<label>` si lo envuelve), con
  «Corregir a …» (en `<nx-number>` por su `value`; en un input, con `input` y `change`) y «Está
  bien» (no vuelve a avisar por ese valor). El campo la suma a su `aria-describedby` (nunca
  `aria-invalid`) y se anuncia en una región `role="status"`. Con `mode="confirm"`, el primer envío
  con avisos se detiene y dice cuántos arriba del botón; el segundo pasa.
- **Sin trabajo de más:** delegación de eventos en el guard (los campos que entran después también
  cuentan); nada corre mientras nadie toca el formulario.

```html
<nx-guard mode="confirm" fields='{
  "precio": {"history": [1180000, 1210000, 1195000, 1240000], "format": "money", "currency": "COP"},
  "cantidad": {"typical": [1, 50]},
  "total": {"expected": "#total-oc", "format": "money", "currency": "COP"},
  "fecha": {"typical": ["-60d", "today"]}
}'>
  <form>
    <label for="precio">Precio unitario</label>
    <nx-number id="precio" name="precio" format="money" currency="COP"></nx-number>
    <label>Cantidad <input name="cantidad" data-guard='{"integer": true}'></label>
    <label>Fecha <input name="fecha" type="date"></label>
  </form>
</nx-guard>
```

| | |
|---|---|
| Propiedades / atributos | `fields` (por `name`; o `data-guard` en el campo), `mode` (`warn`, `confirm`), `endpoint`, `locale`, `labels`, `disabled` · `findings` |
| Por campo | `history`, `typical`, `min`, `max`, `expected`, `format`, `currency`, `integer`, `negative`, `repeat`, `type`, `workdays`, `holidays`, `remote: false` |
| Métodos | `check(name?)` (revisa ya y devuelve los hallazgos), `reset()` |
| Eventos | `nx-guard-warn` `{field, finding}`, `nx-guard-fix` `{field, from, to}`, `nx-guard-ack` `{field, value}`, `nx-guard-block` `{findings}` (cancelable) |
| Funciones | `guardCheck(valor, regla, {locale, raw})`, `robustRange(historia)`, `guardDate("-30d")`: la misma lógica en un backend en JavaScript |

## `<nx-handoff>`

**Sigue en el celular.** Alguien en el escritorio necesita la foto de una factura, de una cédula o
del producto recibido, o escanear 30 códigos. En vez de tomarla, mandarla por WhatsApp, descargarla
y subirla: «Usar el celular» muestra un QR, el teléfono lo abre con la cámara, toma la foto (o
escanea) y el resultado aparece solo en el formulario.

- **Escritorio** (por defecto): un panel sobrio debajo del botón con el QR (dibujado aquí, sin
  dependencias), «Copiar enlace», cuánto falta para que venza y «Cancelar». Un solo indicador que
  avanza: *Esperando el celular…* → *iPhone de Diego conectado* → *Recibiendo 2 fotos…*. Al terminar
  el panel se cierra solo y queda «2 fotos desde el celular · Recibir más».
- **Entrega al destino** (`for`): un archivo se descarga y va a `extract(file)` de
  `<nx-doc-capture>` o a un `<input type=file>` (con `input` y `change`, como si lo hubieran elegido);
  un código va a `add(código)` de `<nx-scan>` o a un campo de texto. Antes sale `nx-handoff-item`,
  cancelable: la app puede encargarse ella.
- **Celular** (`side="phone"`, se carga aparte): una columna, botones grandes. «Tomar foto» (cámara
  trasera) o «Elegir de la galería», miniaturas, quitar, y «Enviar al computador». Las fotos se reducen
  en el teléfono (2000 px, JPEG 0,85) y suben una por una con reintento. Con `kind="scan"`, un
  `<nx-scan>` en modo conteo manda cada código al leerlo.
- **Red:** SSE o NDJSON con reconexión de espera creciente y polling de respaldo. Nada queda abierto
  al cerrar el panel, al vencer la sesión o al sacar el componente de la página.
- **Seguridad:** sesión de un solo uso con token opaco (lo único que va en el QR), vencimiento
  visible, «Cancelar» la invalida en el servidor. `endpoint`, el enlace del QR y los archivos, solo
  del mismo origen (o de `allowOrigins()`).

```html
<nx-handoff endpoint="/api/handoff" for="factura" kind="photo" context='{"doc":"OC-2291"}'></nx-handoff>
<nx-doc-capture id="factura" endpoint="/api/captura"></nx-doc-capture>

<!-- La página del celular (el url del QR; lee ?s= y ?t=) -->
<nx-handoff side="phone" endpoint="/api/handoff"></nx-handoff>
```

| | |
|---|---|
| Propiedades / atributos | `side` (`desktop`, `phone`), `endpoint`, `for`, `kind` (`photo`, `file`, `scan`), `accept`, `multiple`, `context` (JSON), `session`, `token` (celular; si no, `?s=`/`?t=`), `labels`, `locale`, `disabled` · `state` (solo lectura: `idle`, `creating`, `waiting`, `connected`, `receiving`, `done`, `expired`, `error`) |
| Métodos | `start()`, `cancel()` |
| Eventos | `nx-handoff-state` `{state}`, `nx-handoff-item` `{item, file?}` (cancelable), `nx-handoff-done` `{items}`, `nx-handoff-error` `{message}` |
| Protocolo | `POST {endpoint}` → `{id, url, expiresIn, token}` · `GET …/{id}/events?after=` (SSE/NDJSON) · `GET …/{id}?after=` (polling) · `GET …/{id}?t=` (celular) · `POST …/{id}/items?t=` y `…/done?t=` · `DELETE …/{id}`. Detalle en `src/components/handoff/INTEGRATION.md` |
| Funciones | `qrMatrix(texto, {ecc?})` (matriz booleana; modo byte, L/M/Q/H, versiones 1–40, las 8 máscaras), `qrSvgPath(matriz)` (un solo `d` con las corridas fusionadas), `parseHandoffEvent()` |

## `<nx-award>`

**Adjudicar una cotización con la IA al lado.** Artículos en filas, proveedores en columnas y, en
cada celda, lo que cotizó. La IA sugiere un proveedor por artículo y esa sugerencia arranca como la
elección del comprador; él decide al final. Con 60 artículos y 10 proveedores son 600 números: el
componente no pide leerlos todos, sino que lleva a las filas que merecen ojo humano.

- **Tres marcas en la celda, nada más:** contorno punteado con ✦ (sugerida por la IA), relleno (lo
  elegido) y ámbar (una alerta). Cuando el comprador se aparta, la sugerencia sigue a la vista.
- **Alertas del backend:** un precio atípico que no se tuvo en cuenta, una sola cotización, una
  decisión cerrada, un proveedor con la póliza por vencer. «Siguiente alerta» (o `J`/`K`) abre la
  próxima; el resumen cuenta las que faltan.
- **El costo de apartarse:** arriba, el total, lo que cuestan los cambios frente a la IA (en rojo si
  suben), cuántas órdenes salen y las alertas por abrir. En el detalle de la fila, «Elegiste
  Ferrecaribe: +$ 144.000 frente a la sugerencia», el motivo (sugerencias o texto libre; obligatorio
  con `require-reason`) y «Volver a la sugerencia».
- **Por qué:** el detalle muestra la razón de la IA, el ranking con el aporte de cada criterio (una
  barra por proveedor) y el precio original antes de normalizar («US$ 28,50 · TRM 4.150»).
- **Proveedor:** clic en su columna para ver lo que cotizó y lo que se le adjudica, excluirlo de la
  sugerencia (se vuelve a pedir) o darle todo lo que cotizó (se deshace con un clic).
- **Criterios y escenarios:** mover un peso vuelve a pedir la recomendación y los contornos cambian
  de celda; los escenarios del backend («Máximo 3 proveedores») dicen cuántas órdenes dan y cuánto
  cuestan.
- **Vista:** precio unitario, total de la línea, plazo o puntaje; todos, con alertas o cambiados.
  Encabezado, primera columna y pie (lo adjudicado a cada proveedor) fijos al desplazarse.
- **Teclado:** una grilla WAI-ARIA con un solo punto de tabulación: flechas, `Inicio`/`Fin`,
  `RePág`/`AvPág`; `Espacio` elige, `Supr` vuelve a la sugerencia, `↵` abre el detalle, `Esc` lo
  cierra.

El componente no puntúa: la recomendación es del backend, en streaming, y las celdas se marcan a
medida que llega. `price` es el unitario comparable (ya normalizado por unidad, moneda e impuestos).

```html
<nx-award id="rfq" heading="RFQ-0412" endpoint="/compras/rfq/412/recomendar" currency="COP" require-reason></nx-award>
<script>
  rfq.suppliers = [{ id: "ferrecaribe", name: "Ferrecaribe", detail: "★ 4,6 · 5 d" }, …];
  rfq.items = [{ id: "A15", name: "Tubo PVC ½\" x 6 m", qty: 240, unit: "und", group: "Hidráulicos" }, …];
  rfq.quotes = [{ item: "A15", supplier: "ferrecaribe", price: 18500, leadTime: 5 }, …];
  rfq.criteria = [{ id: "precio", label: "Precio", weight: 50 }, { id: "plazo", label: "Plazo", weight: 30 }];
  rfq.addEventListener("nx-award-submit", (e) => crearOrdenes(e.detail.orders));
</script>
```

El backend recibe `POST {weights, excluded}` y responde una línea por evento:

```
{"type":"recommend","item":"A15","supplier":"tresr","reason":"El precio más bajo, con entrega en 4 días.","ranking":[{"supplier":"tresr","score":91.2,"scores":{"precio":100,"plazo":75,"calidad":94}}, …]}
{"type":"flag","item":"A27","supplier":"rivera","message":"Cotiza 46 % bajo la mediana: ¿otra unidad? No se tuvo en cuenta."}
{"type":"scenario","id":"tres","label":"Máximo 3 proveedores","picks":{"A15":"andes", …}}
{"type":"done"}
```

| | |
|---|---|
| Propiedades / atributos | `suppliers` (`[{id, name, detail?, alert?}]`), `items` (`[{id, name, qty, unit?, code?, group?}]`), `quotes` (`[{item, supplier, price, leadTime?, original?, note?}]`), `criteria` (`[{id, label, weight}]`), `weights`, `advice` (los eventos, sin servidor), `choices` (`[{item, supplier, reason?}]`), `excluded`, `reasons`, `scenario`, `filter` (`all`, `alerts`, `changed`), `lens` (`price`, `total`, `lead`, `score`), `endpoint`, `heading`, `currency`, `readonly`, `require-reason`, `require-review`, `locale`, `labels` · `value` (solo lectura: `{artículo: proveedor}`) |
| Métodos | `submit()`, `next(dir?)`, `open(item)`, `refresh()` |
| Eventos | `nx-award-advise` `{weights, excluded, respond(events)}` (sin `endpoint`; cancelable), `nx-award-change` `{item, supplier, recommended, reason, value}`, `nx-award-submit` `{orders, changes, value, total, unassigned, scenario, weights, excluded, pending}` |
| Protocolo | NDJSON o SSE: `recommend`, `flag` (`tone`), `scenario`, `note`, `error`, `done`. Lo que una recomendación completa no vuelve a mandar desaparece |
| Funciones | `awardOrders()`, `awardChanges()`, `awardTotal()`, `awardShares()`, `awardGridMove()`, `parseAwardEvent()` |

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
- **Ver como…**: busca a la persona en `view-as-source` y pone la franja «Estás viendo como…»
  (la tarjeta, además, lleva `data-view-as`). Entrar y salir emiten `nx-account-view-as`, cancelable:
  la app puede terminar la suplantación en su servidor y luego asignar `viewAs = null`.
- **Cerrar sesión** sin «¿Seguro?»: si hay cambios sin sincronizar, se envían antes (con tope y «Salir
  de todos modos»). Con `logout-url`, sale con un `POST` (un formulario con el token de `logout-csrf`
  en el campo `_csrf`, o el de `logout-csrf-field`); `logout-method="get"` navega. «Salir de todos
  modos» deja lo pendiente en la cola de este equipo: usa una cola por usuario
  (`createSync({name: "nx-sync:" + id})`, ver `<nx-sync>`) **y pon su nombre en `sync`**: sin él, la
  cuenta cuenta y vacía la cola de la página (`nxSync`), no la tuya. En `nx-account-logout` con
  `pending > 0`, decide si la vacías (`clear()`).
- **Sesión por vencer**: «Tu sesión vence en 4:59 · Extender», un solo anuncio para el lector de pantalla.
- **Paleta de comandos**: `<nx-command account="cuenta">` suma sus acciones («Tema: Oscuro», «Color:
  Océano», cada sede…).

```html
<nx-sidemenu id="menu">
  <nx-account slot="footer" id="cuenta" user='{"name":"Diego Llinás","email":"diego@crear.co"}'
    tenants='[{"id":"med","name":"Crear Colombia S.A.S.","detail":"Sede Medellín","role":"Aprobador"}]' current="med"
    session='{"expiresAt":"2026-09-26T18:00:00Z","extendEndpoint":"/api/sesion/extender"}'
    logout-url="/salir" logout-csrf="{token}" sync="nx-sync:diego"></nx-account>
</nx-sidemenu>
<nx-command account="cuenta"></nx-command>
```

| | |
|---|---|
| Propiedades / atributos | `user`, `tenants`, `current`, `status` (`online`, `away`, `dnd`), `items`, `palettes`, `locales`, `storage` (`nx-account`; `none`), `apply-locale`, `session` / `expires-at`, `warn-before` (min, 5), `view-as`, `view-as-source`, `logout-url` (mismo origen), `logout-method` (`post`; `get`), `logout-csrf`, `logout-csrf-field` (`_csrf`), `sync` (el nombre de la cola de `createSync({name})`; sin él, la de `<nx-sync>`), `labels`, `locale`, `disabled` · propiedades `commands` (solo lectura; el mismo arreglo mientras no cambie), `open` |
| Métodos | `show()`, `hide()`, `logout()` |
| Eventos | `nx-account-switch` `{tenant}` (cancelable), `nx-account-status` `{status, until}`, `nx-account-theme` `{theme, palette}`, `nx-account-locale` `{locale}`, `nx-account-select` `{id}`, `nx-account-view-as` `{user}` (cancelable, al entrar y al salir), `nx-account-extend` (cancelable), `nx-account-expired`, `nx-account-logout` `{pending}` (cancelable), `nx-open-change` `{open}` |
| Funciones | `applyAccountPrefs(storage?)`, `accountCommands()`, `accountInitials()`, `sessionRemaining()`, `sessionPhase()`, `formatSessionRemaining()` («4:59»), `normalizePalettes()`, `pickTheme()`, `revealRadius()`, `accountStatusUntil()`, `BUILTIN_PALETTES` |

## `<nx-launcher>`

**Tarjetas para entrar a los módulos de un área.** Cada tarjeta dice para qué sirve el módulo y trae
un solo dato vivo, la señal: «3 de tu equipo por aprobar · el más antiguo, hace 2 días».

- **Vistas en la misma tarjeta:** con puntero, al pasar por ella (o al llegar con `Tab`) la
  descripción cede su lugar a las vistas del módulo («Con salario», «Sin salario»), para entrar
  directo a una sin cambiar el tamaño de la tarjeta. En pantallas táctiles se ven siempre. Llevan
  contador y una pista corta («Última · 15 sep 2026»).
- **Señal:** el dato (un número sale con el locale), su etiqueta y una nota con punto de color, una
  barra (`meter`) o una minigráfica (`trend`). Si el dato cambia, pulsa; si solo cambia la señal, la
  tarjeta no se rehace (conserva el puntero y el foco).
- **Destacada:** `featured` ocupa dos columnas con el acento de fondo, una línea superior y una barra
  por partes («Continuar donde ibas»).
- **Columnas sin huérfanas:** las que caben con `--nx-launcher-min`, hasta `columns`; entre esas y
  una menos, las que dejan menos tarjetas solas (4 módulos donde caben 3 van en 2 × 2).
- **Buscador (`search`):** escribir con el foco en la página va a «Ir a». Lo que no coincide se apaga
  en su sitio, sin reacomodar; `Enter` abre la primera coincidencia, que puede ser una vista.
- **La tarjeta se convierte en la página:** la tarjeta abierta lleva los nombres de View Transitions
  `nx-launcher-card`, `-icon` y `-label`. Si el encabezado de la página de destino usa los mismos
  (`.nx-launcher-hero`, `.nx-launcher-hero-icon`, `.nx-launcher-hero-label`), el navegador anima el
  paso: con `startViewTransition` en una SPA o entre documentos con `@view-transition { navigation: auto }`.
  Al volver, `reveal()` (o solo, con `pagereveal`) devuelve los nombres a la tarjeta de la que se salió.
- **Teclado:** las flechas pasan de una tarjeta a la vecina, también entre secciones; `Inicio`/`Fin`.

```html
<nx-launcher id="th"></nx-launcher>
<script>
  th.items = [
    { id: "certificados", label: "Certificados laborales", icon: "file-text", href: "/talento/certificados",
      description: "Genera tu certificado para bancos, arriendos o trámites.",
      views: [{ label: "Con salario", href: "/talento/certificados?salario=1" }, { label: "Sin salario", href: "/talento/certificados?salario=0" }] },
    { id: "permisos", label: "Permisos", icon: "calendar", href: "/talento/permisos",
      views: [{ label: "Propias", href: "/talento/permisos/propias" }, { label: "De mis colaboradores", href: "/talento/permisos/equipo", badge: 3 }],
      signal: { value: 3, label: "de tu equipo por aprobar", note: "el más antiguo, hace 2 días", tone: "warning" } },
    { id: "desprendibles", label: "Desprendibles de pago", icon: "receipt",
      views: [{ label: "Última", hint: "15 sep 2026", href: "/talento/desprendibles/ultima" }, { label: "Todas", href: "/talento/desprendibles" }] },
    { id: "cesantias", label: "Cesantías", icon: "wallet", href: "/talento/cesantias", signal: { value: "$ 11.482.300", label: "en el fondo" } },
  ];
</script>
```

| | |
|---|---|
| Propiedades / atributos | `items` (`[{id, label, href?, icon?, description?, section?, views?, signal?, featured?, eyebrow?, progress?, data?}]`; `views`: `[{label, href?, badge?, hint?}]`; `signal`: `{value?, label?, note?, tone?, meter?, trend?}`; `progress`: `[{label, value}]`), `search`, `query`, `columns` (4), `heading-level` (2), `locale`, `labels` |
| Métodos | `focusItem(id?)`, `reveal(id?)` |
| Eventos | `nx-launcher-select` `{item, view, href}` (cancelable; un clic con modificador es del navegador y no se anuncia) |
| CSS | `--nx-launcher-min` (240px), `--nx-launcher-gap` (12px), `--nx-launcher-warn` / `--nx-launcher-ink`; `.nx-launcher-hero`, `.nx-launcher-hero-icon`, `.nx-launcher-hero-label` para la página de destino |
| Funciones | `matchItem()`, `firstTarget()`, `fitColumns()`, `balanceColumns()`, `moveIndex()`, `sparkPaths()` |

## `<nx-cards>`

**Una vista de tarjetas con zoom semántico.** Los mismos registros en tres niveles, y al pasar de
uno a otro cada tarjeta se transforma en su sitio:

- **Mapa:** un cuadro por registro. El color dice el estado y la intensidad, el peso (cuánto se le
  compra, el monto): cientos de un vistazo, para ver patrones. Al pasar el puntero, el nombre, el
  dato y el estado; la leyenda cuenta cada estado.
- **Tarjetas:** título, estado, subtítulo, una nota con el color del estado, el dato grande con su
  cambio (▲ 12 %) y su minigráfica, y una línea corta. El 10 % de más peso ocupa dos columnas; el
  estado normal (`quiet`) no se anuncia, para que resalten los demás.
- **Fichas:** todos los datos; un porcentaje con `good` / `bad` lleva barra verde, ámbar o roja.
- **Abrir en su sitio:** la tarjeta ocupa la fila con su lista relacionada («Últimas órdenes de
  compra») y sus acciones. `Esc` la cierra.
- **Todo se mueve:** cambiar de nivel, ordenar, agrupar (estantes con cuántos y el total) o buscar
  mueve los mismos nodos desde donde estaban (FLIP), y el registro bajo el puntero se queda en su
  sitio. Sin animación si se pidió menos movimiento.
- **Zoom:** el selector, `Ctrl` + rueda (o el pellizco del trackpad) sobre la vista, o `+` / `−` con
  el foco adentro. Las flechas pasan de una tarjeta a otra.
- **Miles de registros:** el mapa no arma el cuerpo de las tarjetas (solo pinta cuadros) y, con más
  de 300, las tarjetas fuera de la pantalla no se pintan (`content-visibility`).

Los datos llegan tal como salen de la base de datos (`rows`); `fields` dice qué es cada campo y
`layout`, dónde va en la tarjeta.

```html
<nx-cards id="prov" group="cat" sort="compras"></nx-cards>
<script>
  prov.fields = [
    { key: "name", label: "Nombre", sort: "asc" },
    { key: "cat", label: "Categoría", group: true },
    { key: "state", label: "Estado", type: "status", group: true, options: [
      { value: "ok", label: "Al día", tone: "success", quiet: true },
      { value: "vence", label: "Póliza por vencer", tone: "warning" },
      { value: "bloqueado", label: "Bloqueado", tone: "danger" }] },
    { key: "compras", label: "Compras en 12 meses", type: "money", currency: "COP", sort: "desc" },
    { key: "cumpl", label: "Entregas a tiempo", type: "percent", sort: "asc", good: 90, bad: 80 },
    { key: "orders", label: "Últimas órdenes de compra" },
  ];
  prov.layout = { title: "name", subtitle: ["cat", "city"], status: "state", note: "note", value: "compras",
    delta: "delta", trend: "months", brief: ["cumpl"], facts: ["cumpl", "city"], related: "orders" };
  prov.actions = [{ id: "orden", label: "Nueva orden de compra", primary: true, disabledFor: ["bloqueado"] }];
  prov.rows = await (await fetch("/api/proveedores")).json();
  prov.addEventListener("nx-cards-action", (e) => nuevaOrden(e.detail.row.id));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `fields` (`[{key, label, type?, currency?, compact?, unit?, options?, sort?, group?, search?, good?, bad?}]`; `type`: `text`, `number`, `money`, `percent`, `rating`, `date`, `status` con `options: [{value, label?, tone?, quiet?}]`), `layout` (`{title, subtitle?, status?, note?, value?, delta?, trend?, weight?, brief?, facts?, related?, href?}`), `rows`, `row-key` (`id`), `actions` (`[{id, label, primary?, disabledFor?}]`), `level` (`map`, `cards`, `detail`), `group`, `sort` (`campo` o `campo:asc`/`campo:desc`), `query`, `heading-level` (3), `locale`, `labels` · `openKey` (solo lectura) |
| Métodos | `zoom(dir, anchor?)`, `openRow(key)` |
| Eventos | `nx-cards-level` `{level}`, `nx-cards-open` `{row, open}`, `nx-cards-action` `{action, row}` |
| CSS | `--nx-cards-top` (dónde se pega la barra), `--nx-cards-warn` / `--nx-cards-ink` |
| Funciones | `formatCardsField()`, `groupCards()`, `matchCard()`, `sortCards()`, `stepLevel()`, `weightRanks()` |

## `<nx-org>`

**El organigrama, con dos lentes sobre los mismos datos.**

- **Yo:** una persona en el centro (por defecto, `me`: quien mira) con lo que tiene alrededor: su
  cadena hacia arriba en caras solapadas (el nombre se abre al pasar por encima), su jefe, quienes
  comparten jefe a los dos lados (los primeros ocho y «+n»; debajo, en lo angosto) y su equipo
  directo colgando de ramas, con las caras y el número de quienes tiene a cargo cada uno. Para
  quien mira, `contacts`: «Para… / Acudes a…» («Aprobar vacaciones → Laura Gómez»).
- **Caras:** sin `avatar`, las iniciales llevan un tono propio de cada persona (sale de su `id`):
  el mismo en todas las vistas. Al cambiar de persona, con View Transitions, cada tarjeta viaja a
  su nuevo lugar (la pulsada sube al centro); sin la API o con movimiento reducido, cambia directo.
- **El camino:** al centrarse en otra persona, dibujado en caras (Tú —↑2— el jefe común —↓1— la
  otra persona) y en una frase («Tu jefe común con Ana es Marta Ríos · 2 niveles arriba de ti»),
  con «Volver a mí».
- **Organización:** el árbol de unidades. Con una sola raíz (el grupo), ella arriba y sus hijas en
  fila con ramas; debajo de cada una, sus subunidades colgando de un riel (hasta 12 y «+n»), que se
  pliegan y despliegan. Cada unidad lleva la franja del tono de su rama (sus subunidades lo
  heredan), su líder con su cara (`leader`), cuántas personas tiene y algunas caras. El camino hasta
  quien mira llega abierto y marcado, y «Tú» va en su unidad.
- **Una unidad abierta:** su gente con las ramas de «Yo»: el líder arriba, cada jefe en su columna
  con su equipo en pila (8 y «+n»), los directos del líder aparte, y quien no cuelga de nadie dentro
  de la unidad, en tarjetas. Debajo, sus subunidades. Las migas suben; con View Transitions, la
  tarjeta de la unidad se vuelve la cabecera, y al volver, regresa a su lugar del árbol.
- **Color por cifra:** una sola cifra a la vez en cada unidad (`metrics` sobre `unit.metrics`:
  vacantes, ingresos, rotación), en el acento, ámbar o rojo, más intensa cuanto más alta entre sus
  hermanas; con `per: "count"`, por persona de la unidad.
- **Teclado:** en el árbol, `→` despliega y `←` pliega las subunidades de la tarjeta enfocada; en
  una unidad, `Esc` (o `Retroceso`) vuelve al árbol con el foco en ella. La búsqueda (`searchable`)
  encuentra personas sin tildes y unidades.

Para una organización grande, `source` entrega por partes con un POST de JSON: `{unit}` (sus
personas), `{person}` (su cadena, sus pares y su equipo) o `{search}`, y responde `{people?, units?}`.
Lo que llega completo de arranque no se vuelve a pedir (`reports` y `direct` dicen cuántos hay).
Quien no puede ver el entorno de alguien lo recibe con `locked`: se ve, pero no se abre.

```html
<nx-org id="org" me="e214" searchable></nx-org>
<script>
  org.units = [
    { id: "agro", name: "Agrovid", kind: "Empresa", count: 230 },
    { id: "agro-esp", name: "Finca La Esperanza", parent: "agro", kind: "Subdivisión", count: 74, metrics: { vacantes: 3 } },
  ];
  org.people = [{ id: "e214", name: "Ana Díaz", title: "Analista de rutas", unit: "log-baq", boss: "e180" }];
  org.metrics = [{ key: "vacantes", label: "Vacantes", tone: "warning" }];
  org.contacts = [{ label: "Aprobar permisos y vacaciones", person: "e180" }];
  org.source = "/api/organigrama";
</script>
```

| | |
|---|---|
| Propiedades / atributos | `units` (`[{id, name, parent?, kind?, count?, direct?, leader?, metrics?}]`), `people` (`[{id, name, title?, unit?, boss?, avatar?, href?, reports?, team?, locked?}]`), `me`, `view` (`me`, `map`), `contacts` (`[{label, person?, text?, href?}]`), `metrics` (`[{key, label, tone?, per?}]`), `metric`, `source`, `searchable`, `locale`, `labels` · `center` (solo lectura) |
| Métodos | `focusPerson(id)`, `focusUnit(id)` |
| Eventos | `nx-org-focus` `{view, id}` |
| CSS | `--nx-org-top` (dónde se pega la barra) |
| Funciones | `buildOrgIndex()`, `chainOf()`, `commonBoss()`, `groupByTitle()`, `squarify()`, `topWithRest()` |

## `<nx-print>`

**Imprimir bien a la primera.** Facturas, remisiones, órdenes de compra, cotizaciones y actas desde
HTML. `window.print()` corta filas a la mitad, pierde el encabezado de la tabla en la página 2 y no
dice «Página 2 de 3»; `<nx-print>` mide el documento y lo reparte en hojas del tamaño real, y lo que
sale del diálogo de impresión es exactamente esa vista previa, no el resto de la app.

- **Hojas de verdad**: `letter` (carta, por defecto), `a4`, `a5`, `legal`, `oficio` (21,6 × 33 cm),
  `half-letter` (media carta) o dos medidas («216mm 140mm»), en vertical u horizontal, con los
  márgenes que digas. Sobre un fondo gris, con zoom (ajustar al ancho, 100 %, + y −).
- **Encabezado y pie en cada hoja** (`slot="header"`, `slot="footer"`), con `{page}` y `{pages}`
  (también en cualquier elemento con `data-print-page`).
- **Tablas**: nunca una fila partida; `<thead>` en cada hoja; al menos dos filas a cada lado del
  corte. Las columnas con `data-print-sum` en su `<th>` llevan «Van: $ 12.450.000» al pie de la hoja y
  «Vienen» al comienzo de la siguiente.
- **Cortes**: `data-print-keep` (o `break-inside: avoid`) no parte un bloque;
  `data-print-keep-with-next` (o `break-after: avoid`) no deja un título solo al pie;
  `data-print-break="before|after"` fuerza el salto.
- **Siempre al día**: si el contenido cambia, carga una imagen o una fuente, o cambian tamaño y
  márgenes, se vuelve a paginar, con espera y una sola lectura de alturas; si nada cambia, no trabaja.
- **PDF**: «Guardar como PDF» abre el diálogo del navegador con una pista y el número del documento
  como nombre del archivo. No hay un PDF propio: sin dependencias no se puede hacer bien.

```html
<nx-print class="factura" size="letter" margin="12mm" heading="FV-2026-01873" currency="COP">
  <header slot="header">…logo, NIT, número… <span data-print-page>Página {page} de {pages}</span></header>
  <footer slot="footer">Resolución DIAN… · Página {page} de {pages}</footer>
  <section data-print-keep>…cliente…</section>
  <table>
    <thead><tr><th>Descripción</th><th>Cant.</th><th data-print-sum>Vr. total</th></tr></thead>
    <tbody>…</tbody>
  </table>
  <h3 data-print-keep-with-next>Observaciones</h3>
  <p>…</p>
</nx-print>
```

Estiliza el documento con selectores de descendiente (`.factura td`), no de hijo directo
(`nx-print > table`) ni por `id`: las hojas son copias sin `id`. Solo se parten las tablas que son
hijas directas del elemento.

| | |
|---|---|
| Atributos / propiedades | `size`, `orientation` (`portrait`, `landscape`), `margin`, `heading`, `currency`, `zoom` (`fit` o un factor), `locale`, `labels`, `toolbar` (`"false"` la quita) · `pages` (solo lectura) |
| Métodos | `print()`, `paginate()` (devuelve el número de hojas) |
| Eventos | `nx-print-paginate` `{pages}`, `nx-print-before` `{pages}` (cancelable), `nx-print-after` `{pages}` |
| En el documento | `slot="header"`, `slot="footer"`, `{page}`, `{pages}`, `data-print-page`, `data-print-keep`, `data-print-keep-with-next`, `data-print-break`, `data-print-sum` (`number` para cantidades), `data-currency`, `data-value` |
| Funciones | `paginatePrint(blocks, {pageHeight, minRows?})`, `parsePrintSize()`, `parsePrintMargin()`, `fillPageText()`, `PRINT_SIZES`, `PRINT_LABELS` |

## La ficha lateral: `<nx-tabs>`, `<nx-fields>`, `<nx-notice>` y `<nx-badge>`

**El registro que se abre desde una tabla**, en un panel lateral (`<nx-dialog mode="panel">`), con
seis zonas siempre en el mismo orden: arriba orienta, en medio informa o edita, abajo decide.

1. **Cabecera** (la del diálogo): quién es (`avatar`), su estado (`badge`), pasar al registro
   anterior o siguiente sin cerrar (`nav`, también con J y K) y el menú «Más» (`actions`: lo poco
   usado y lo destructivo, separado al final). Se carga aparte, solo si se usa.
2. **Resumen**: `<nx-fields variant="summary">`, tres o cuatro datos clave, solo lectura.
3. **Aviso**: `<nx-notice>`, uno solo y solo si hay algo que hacer, con su acción adentro.
4. **Pestañas**: `<nx-tabs sticky>`, temas y no pasos, pegadas bajo la cabecera al desplazarse.
5. **Cuerpo**: secciones con `<nx-fields heading action>`, tus indicadores y listas.
6. **Pie**: `slot="footer"`, una acción primaria; al editar, Cancelar · Guardar.

- **`<nx-fields>`: leer y editar en la misma rejilla.** Etiqueta arriba, valor abajo, dos columnas;
  `wide` ocupa la fila. Un dato vacío se ve «—» (y se lee «Sin dato»): no se oculta, así la ficha no
  cambia de forma entre registros. Montos, números y fechas con el locale; `href` (enlace a otro
  registro), `copy` (botón para copiar) y `mono`. Con `editing`, cada valor se vuelve un campo en su
  sitio (texto, correo, teléfono, número, monto, fecha, lista o área de texto) con `name`, así que
  sirve dentro de un `<form>` y marca los cambios sin guardar de `<nx-dialog>`; `readonly` sigue como
  texto con candado. `values` devuelve lo escrito ya convertido, `validate()` revisa lo obligatorio y
  el formato y enfoca el primer error, y `errors` muestra los del servidor. Un número se edita sin
  redondear; lo escrito en los items con `key` no se pierde si la ficha se vuelve a pintar (los
  mismos `items` otra vez, otro `locale`), y `reset()` lo descarta (un formulario que se reabre).
- **`<nx-tabs>`**: los paneles son tus hijos con `data-tab` (no se mueven: la hidratación de Solid
  sigue intacta), con `data-count` o `data-errors` (en rojo, para un formulario largo). Teclado de la
  APG; `nx-tabs-change` es cancelable. Con `tabs` (BDUI), la lista sale de ahí.
- **`<nx-notice>`**: `info`, `success`, `warning` o `danger` (este se anuncia), con `action` (botón,
  `nx-notice-action`) o `action-href` (enlace).
- **`<nx-badge>`**: el estado en una píldora; el texto lo dice, el color lo refuerza.

```html
<nx-dialog mode="panel" heading="Laura Gómez Restrepo" description="Analista de nómina · EMP-0482"
  avatar="Laura Gómez" badge="Activa" badge-tone="success" nav="prev next"
  actions='[{"id":"copiar","label":"Copiar código"},{"id":"retirar","label":"Retirar empleada","danger":true}]'>
  <nx-fields variant="summary" items='[{"label":"Área","value":"Nómina"},{"label":"Salario","value":4850000,"format":"money"}]'></nx-fields>
  <nx-notice tone="warning" action="Renovar">El contrato vence el 12 de octubre.</nx-notice>
  <nx-tabs sticky label="Secciones del empleado">
    <section data-tab="Resumen">…</section>
    <section data-tab="Datos"><nx-fields id="contrato" heading="Contrato" action="Editar" items='[…]'></nx-fields></section>
    <section data-tab="Documentos" data-count="12">…</section>
  </nx-tabs>
  <div slot="footer"><button id="guardar">Guardar cambios</button></div>
</nx-dialog>
```

```js
contrato.addEventListener("nx-fields-action", () => (contrato.editing = true));
guardar.onclick = async () => {
  if (!contrato.validate()) return;
  const r = await api.guardar(contrato.values);
  if (r.errors) contrato.errors = r.errors; // {correo: "Ya existe"}
  else contrato.editing = false;
};
```

| | |
|---|---|
| `<nx-dialog>` (ficha) | `avatar`, `badge`, `badge-tone`, `nav` (`"prev next"`, `"next"`, `"prev"`, `""`), `actions` (`[{id, label, danger?, disabled?, icon?}]`) · `nx-dialog-nav` `{dir}`, `nx-dialog-action` `{id}` · pone `--nx-sticky-top` (alto de su cabecera) |
| `<nx-fields>` | `items` (`[{key?, label, value, wide?, format?, currency?, href?, copy?, mono?, readonly?, input?}]`; `format`: `text`, `number`, `money`, `date`; `input`: `{type?, options?, required?, placeholder?, hint?, rows?}`), `variant` (`grid` / `summary`), `columns` (1–4), `heading`, `action`, `editing`, `errors`, `locale`, `currency`, `labels` · `values`, `validate()`, `focusField(key)`, `reset()` · `nx-fields-action` `{action}` |
| `<nx-tabs>` | hijos con `data-tab`, `data-value`, `data-count`, `data-errors`, `data-disabled`, o `tabs` (`[{value, label, count?, errors?, disabled?}]`) · `value`, `sticky`, `label`, `labels` · `nx-tabs-change` `{value, previous}` (cancelable) |
| `<nx-notice>` | `tone` (`info`, `success`, `warning`, `danger`), `text`, `action`, `action-href` · `nx-notice-action` `{action}` |
| `<nx-badge>` | `tone` (`neutral`, `success`, `info`, `warning`, `danger`), `label` (si no va como contenido) |
| Tokens nuevos | `--nx-warning`, `--nx-warning-ink` (texto e íconos), `--nx-warning-soft` |

## `<nx-breadcrumb>`

**La ruta hasta la página actual, con un atajo:** cada `›` se abre con los hermanos del nivel
siguiente. De «Personas › Empleados › Laura Gómez › Contratos» se pasa a Andrés sin volver a la
lista.

- **Nombres:** suben a ese nivel. El último es la página actual (`aria-current="page"`) y no es un
  enlace. Los largos se cortan y muestran el nombre completo al pasar el ratón.
- **Separadores:** abren los hijos del nivel, con el actual marcado. Llegan en `children` o se
  piden al abrir, una vez por camino: primero se emite `nx-breadcrumb-expand` `{item, level,
  respond}`, donde la app puede dar los hijos con `respond(hijos)` (ya, o después de
  `preventDefault()`); si nadie responde, se piden a `children-endpoint` (`GET`, del mismo origen;
  `{id}` es la clave del nivel y `{level}` su número). Sin `children-endpoint`, un nivel sin
  `children` se abre con `expandable: true` (`data-expandable="true"`). Si no hay alternativas, el
  `›` no se abre (`expandable: false` lo apaga). Con más de 7 aparece un buscador que no distingue
  tildes. El menú se carga aparte (`import()`) al abrir el primero; abre hacia arriba si abajo no
  cabe.
- **Colapso:** si no cabe, los niveles del medio pasan a un «…» que se abre como menú. Siempre
  quedan el primero y los dos últimos. Por debajo de 480 px de ancho del componente queda solo
  «‹ Padre», porque el título de la página ya dice dónde estás.
- **Navegar:** `nx-breadcrumb-navigate` es cancelable: un router SPA lo cancela y navega él. Si
  nadie lo cancela, se sigue el `href`. Para conservar la sección al cambiar de persona («de Laura ›
  Contratos a Andrés › Contratos»), el `href` de cada hermano ya apunta a ella. `Alt+↑` sube un
  nivel (en la ruta visible de más abajo de la página, la de un diálogo abierto).
- **Sin JavaScript:** los hijos son enlaces normales y se ven como una ruta con `›`.

```html
<!-- Al abrir un separador: GET /api/hermanos?de=%2Fhcm%2Fempleados (la clave del nivel, su href, codificada). -->
<nx-breadcrumb label="Ruta" children-endpoint="/api/hermanos?de={id}">
  <a href="/hcm" data-icon="users">Personas</a>
  <a href="/hcm/empleados">Empleados</a>
  <a href="/hcm/empleados/482">Laura Gómez</a>
  <span>Contratos</span>
</nx-breadcrumb>
```

```tsx
import { Breadcrumb } from "nx32-elements/solid/breadcrumb";

// Sin children-endpoint, los niveles de ruta() que se abren llevan `expandable: true`
// (o sus `children`): si no, el › no se abre y onExpand no llega.
<Breadcrumb items={ruta()}
  onExpand={(e) => e.detail.respond(hermanos(e.detail.item))}
  onNavigate={(e) => { e.preventDefault(); navigate(e.detail.item.href!); }} />
```

| | |
|---|---|
| Propiedades / atributos | hijos (`<a href>` con `data-icon`, `data-id`, `data-expandable`; el último, un `<span>`) o `items` (`[{id?, label, href?, icon?, children?, expandable?}]`), `children-endpoint` / `childrenEndpoint`, `label`, `labels` · `path` (solo lectura) |
| Eventos | `nx-breadcrumb-navigate` `{item, level, via}` (cancelable; `via`: `link`, `menu`, `back`, `key`), `nx-breadcrumb-expand` `{item, level, respond}` (cancelable) |
| Funciones | `cleanBreadcrumbItems()`, `collapseCount()` |

## `<nx-signature>`

**Firma a mano** para el recibido a satisfacción de una entrega, un acta o una autorización: en la
pantalla con mouse, lápiz o dedo, o en el celular de quien recibe.

- **Trazo que se ve como tinta:** Pointer Events con captura y eventos coalescidos, `touch-action:
  none`, más fino cuanto más rápido y más grueso con más presión del lápiz, curvas suavizadas y nítido
  a cualquier densidad de pantalla. La zona de firma es clara también en modo oscuro (una firma se
  archiva sobre papel), con la línea, la «×» y «Firme aquí».
- **Vector:** cada trazo es un `<path>` (su contorno relleno), recortado a lo firmado. El SVG es la
  fuente de verdad: `toPNG(escala)` y el valor del formulario salen de él.
- **Quién y qué:** nombre y cédula (`ask-name`, `ask-id`); con `document`, la huella SHA-256 del texto
  firmado más la fecha (prueba qué se firmó; no es una firma electrónica certificada); con `geo`, la
  ubicación si la persona la permite.
- **Sin trazo:** «Escribir mi nombre» genera la firma con la cursiva del sistema, marcada
  `typed: true`: el camino por teclado y para quien no puede firmar con el dedo.
- **Formulario:** `name`, `required` (ni un punto ni una raya valen), `value-format` (`json` con
  `{svg, meta}`, `svg` o `png`), `reset` la borra, `readonly` muestra una guardada.
- **En el celular:** con `handoff`, «Firmar en el celular» muestra el QR de
  `<nx-handoff kind="signature">`; el teléfono firma (a pantalla completa y en horizontal si se puede) y
  la firma aparece aquí.

```html
<form method="post">
  <article id="remision">…</article>
  <nx-signature name="recibido" ask-name ask-id required document="remision" handoff="/api/handoff"></nx-signature>
  <button>Registrar el recibido</button>
</form>

<!-- Una firma guardada -->
<nx-signature readonly value='{"svg":"<svg …>","meta":{…}}'></nx-signature>
```

| | |
|---|---|
| Propiedades / atributos | `name`, `required`, `readonly`, `disabled`, `ask-name`, `ask-id`, `document`, `geo`, `value-format` (`json`, `svg`, `png`), `auto`, `handoff`, `pen-color`, `height` (px, 180), `locale`, `labels` · `value` (`{svg, meta}`, su JSON o el SVG) · `strokes` (solo lectura) |
| Métodos | `clear()`, `undo()` (también Ctrl/⌘+Z), `toSVG()`, `toPNG(escala?)` → `Promise<Blob \| null>`, `load(valor)` → `boolean`, `isEmpty()`, `checkValidity()` |
| Eventos | `nx-signature-change` `{empty}`, `nx-signature-done` `{svg, meta}` y `change` (nativo) |
| `meta` | `{signedAt, name?, id?, typed, strokes, points, width, height, device, hash?, geo?}` |
| Funciones | `signatureSVG(trazos, tinta?)`, `signaturePath(puntos, anchos)`, `signatureWidth(velocidad, presión, lápiz)`, `signatureStrokeWidths(trazo)`, `smoothSignaturePoints(puntos)`, `signatureBounds(trazos, margen)`, `signatureCheck(trazos, mínimo?)`, `signatureHash(texto, fecha)`, `typedSignatureSVG(nombre)`, `parseSignatureValue(valor)`, `cleanSignatureMeta(meta)`, `signatureDate(iso, locale)`, `normalizeSignedText(texto)`, `SIGNATURE_LABELS`, `SIGNATURE_MIN`, `SIGNATURE_PEN`, `SIGNATURE_INK`, `SIGNATURE_FONT` |

## `<nx-planner>`

**Agenda de recursos.** Personas, vehículos, máquinas o salas en filas y el tiempo en columnas: para
despachos, turnos, mantenimientos, citas y alquiler de equipos. Tres vistas: `day` (franjas de 60, 30
o 15 minutos según el zoom), `week` y `month` (un día por columna; con `hours`, solo el horario
laboral). Encabezado pegajoso, línea de «ahora», fines de semana y festivos sombreados, Hoy, ← →,
selector de fecha y zoom con `Ctrl` + rueda.

- **Reservas** como barras con título, detalle y el tono de su estado (`confirmed`, `tentative`,
  `active`, `block`). Las que se solapan se apilan en carriles; si pasan de la `capacity` del recurso
  (1), la fila y las barras se marcan como **choque** y la barra superior dice cuántos recursos lo tienen.
- **Editar arrastrando**: mover en el tiempo y entre recursos, cambiar la duración por los bordes, y
  crear sobre un hueco, ajustado a `snap`. La sombra dice «Mar, 13 oct, 7:30 – 9:00 a. m.» y si
  chocaría. Con el dedo, manteniendo pulsado (deslizar sin esperar desplaza la agenda).
- **Optimista**: soltar pinta el cambio y emite `nx-planner-change` (cancelable); con `endpoint`, el
  `PATCH {endpoint}/{id}`. Si la app cancela (con `e.detail.message`) o el servidor responde error
  (`{message}`), vuelve a su lugar con un aviso. El último cambio se deshace con el aviso o `Ctrl`/`⌘`+`Z`.
- **Teclado**: la rejilla recibe el foco; flechas por recurso y franja, `Enter` crea o abre. En una
  reserva, las flechas la mueven de a `snap`, `Mayús`+flechas cambian la duración, `Supr` la borra
  (`nx-planner-delete`, cancelable). Cada reserva se anuncia entera («TKR-512 · Entrega Ferretería El
  Tornillo · mar, 13 oct, 7:30 – 9:00 a. m.»).
- **Ocupación** (`summary`): una fila con cuántos recursos tienen algo en cada columna («7/12»).
- **Datos grandes**: 300 recursos × 2.000 reservas sin congelar: solo se pintan las filas y columnas
  visibles, los carriles se calculan ordenando una vez y el arrastre solo mueve una sombra. Con
  `source`, cada período se pide aparte: `GET {source}?from=…&to=…` → `{resources?, bookings}`.
- **Fechas**: todo en la hora local de quien mira. `start`/`end` sin zona («2026-10-13T07:30») se toman
  como locales; los eventos las devuelven con su desfase («2026-10-13T07:30:00-05:00»).

```html
<nx-planner id="despachos" view="week" hours="06:00-18:00" holidays='["2026-10-12"]'
  summary="equipos" endpoint="/api/despachos/reservas"></nx-planner>
<script>
  despachos.resources = [
    { id: "TKR-512", name: "TKR-512", detail: "Jorge Pérez · 10 t", icon: "truck", group: "Camiones" },
    { id: "MC-01", name: "Montacargas 1", icon: "warehouse", group: "Montacargas" },
  ];
  despachos.bookings = [{ id: "E-101", resource: "TKR-512", start: "2026-10-13T07:30",
    end: "2026-10-13T09:30", title: "Entrega Ferretería El Tornillo", detail: "Barranquilla · 6 t" }];
</script>
```

| | |
|---|---|
| Propiedades / atributos | `resources` (`{id, name, detail?, avatar?, icon?, group?, capacity?}`), `bookings` (`{id, resource, start, end, title, detail?, status?, color?, readonly?, data?}`), `view` (`day`, `week`, `month`), `date`, `snap` (min), `hours` (`"07:00-18:00"`), `workdays` (`[1,2,3,4,5]`), `holidays`, `summary`, `source`, `endpoint`, `readonly`, `locale`, `labels` |
| Métodos | `goTo(fecha)`, `today()`, `scrollToBooking(id)`, `undo()` |
| Eventos | `nx-planner-change` `{booking, from, to, via}`, `nx-planner-create` `{booking, resource, start, end, via}`, `nx-planner-delete` `{booking, via}` (los tres cancelables), `nx-planner-select` `{booking}`, `nx-planner-range` `{from, to, view}` |
| Funciones | `plannerLanes()`, `plannerClashes()`, `plannerSnap()`, `plannerMove()`, `plannerResize()`, `plannerSpan()`, `plannerRange()`, `plannerColumns()`, `plannerX()`, `plannerTime()`, `plannerOccupancy()`, `plannerParse()`, `plannerISO()`, `PLANNER_LABELS` |

## `<nx-review>`

**Resumen antes de guardar.** Envuelve tu formulario y, al enviar, dice qué va a cambiar: «Vas a
guardar 3 cambios», en un panel sobrio justo encima del botón (sin modales), con «Guardar» y «Seguir
editando». Es el antes de `<nx-history>`: la misma lista (`changes`) va al servidor como bitácora.

- **Qué compara**: cada campo contra como estaba al cargar (o contra `initial`, o contra lo que haya
  cuando llamas `snapshot()` después de traer el registro). Inputs nativos, selects, radios, casillas,
  `<nx-number>`, `<nx-select>` y cualquier elemento con `name` y `value`. Nunca contraseñas ni
  `data-review="off"`.
- **Cómo lo dice**, con el locale: «Precio unitario: $ 10.000 → $ 12.000 (+$ 2.000 · +20%)»,
  «Fecha de entrega: 12 oct 2026 → 15 oct 2026 (+3 días)», «Estado: Por aprobar → Aprobada»,
  «Facturar con IVA: Sí → No», los textos largos con la diferencia por palabras, agrupado por
  `<fieldset>`.
- **Filas de detalle** (`lineas[0].cantidad`, `lineas[2][precio]`, `lineas.3.cantidad` o un
  `data-review-row` por fila): «2 líneas nuevas · 1 quitada · 1 cambiada», reconocidas por su `id`.
- **Lo importante primero y marcado** (ícono y texto, no solo color): un monto que cambió 20 % o más
  (`threshold`), una fecha que se movió más de 7 días, un estado, un campo `data-review="important"` y
  los avisos de `<nx-guard>`.
- **Cuándo aparece**: `significant` (por defecto: si hay algo importante o más de `max-silent`
  cambios), `always` o `never` (solo con `review()`). «Guardar» reenvía con el mismo botón.
- **`dirty`** y `nx-review-dirty` `{dirty, count}` para el «¿Salir sin guardar?».

```html
<nx-review mode="significant" empty="notice">
  <form>
    <fieldset><legend>Encabezado</legend>
      <label>Fecha de entrega <input name="entrega" type="date" value="2026-10-12"></label>
      <label>Estado <select name="estado">…</select></label>
    </fieldset>
    <table data-label="Líneas de la orden">
      <tr><td><input type="hidden" name="lineas[0].id" value="L-101">
        <nx-number name="lineas[0].precio" format="money" currency="COP" value="1275000"></nx-number></td></tr>
    </table>
    <button>Guardar</button>
  </form>
</nx-review>
<script>
  review.addEventListener("nx-review-confirm", (e) => bitacora(e.detail.changes));
  if (await review.review()) await guardar(); // sin <form>, con tu propio botón
</script>
```

| | |
|---|---|
| Propiedades / atributos | `mode` (`significant`, `always`, `never`), `threshold` (20), `max-silent` (5), `empty` (`notice`), `initial`, `rebase`, `locale`, `labels`, `disabled` · en los campos: `data-label`, `data-format`, `data-currency`, `data-review` (`important`, `status`, `off`), `data-review-section`, `data-review-rows`, `data-review-row` |
| Métodos | `snapshot()`, `review()` (promesa `true`/`false`), `reset()` |
| Getters | `changes` (`{field, label, section, from, to, fromText, toText, kind, significant, reason, delta, diff, rows, warnings}`), `dirty` |
| Eventos | `nx-review-open` `{changes}` (cancelable: cancelarlo envía directo), `nx-review-confirm` `{changes, silent}`, `nx-review-cancel`, `nx-review-dirty` `{dirty, count}` |
| Funciones | `diffReview()`, `describeReview()`, `groupReview()`, `reviewShouldOpen()`, `flattenReview()`, `reviewRowName()`, `sameReviewValue()`, `REVIEW_LABELS` |

## `<nx-voice>`

**Dictar al formulario.** En bodega, en campo o manejando el montacargas: «veinte láminas calibre
catorce para Ferretería El Tornillo, entrega el viernes» y el formulario se llena.

- **Reconocimiento:** la Web Speech API del navegador (`SpeechRecognition`), en el idioma del
  `locale` (es-CO por defecto), con los parciales en gris mientras se habla y el final en negro. Sin
  ella, o con `engine="server"`, graba con `MediaRecorder` (WebM/Ogg con Opus, MP4 en Safari) y hace
  `POST {endpoint}` con el audio (`FormData`: `audio`, `lang`); el servidor responde `{text}`, texto
  plano, o NDJSON/SSE con `{partial}` y `{text}`. Sin ninguna de las dos, **el botón no aparece** y
  `nx-voice-unavailable` avisa una vez: el formulario sigue igual.
- **Cómo se habla:** tocar para hablar (otro toque o 2 s de silencio terminan) o `hold`: mientras se
  mantiene el botón o la barra espaciadora (con guantes o ruido). `hotkey="Alt+V"` para toda la página,
  sin chocar con el toque de Alt de `<nx-keytips>`. Escape cancela.
- **Feedback:** el anillo alrededor del botón sigue el volumen real (`AnalyserNode` sobre el mismo
  micrófono); con movimiento reducido, un punto que toma el color del acento. «Escuchando…»,
  «Procesando…» y los errores con qué hacer: sin permiso, «No te entendí», «Sin conexión».
- **Entrega:** a un `<nx-paste-fill>` le pasa el texto a `fill(text)` y muestra «Llené 4 campos ·
  Deshacer». En un `<input>`/`<textarea>` escribe en el cursor (o sobre lo seleccionado), con
  `input` y `change`: los signos dichos («coma», «punto y aparte», «nueva línea», «signo de
  interrogación»…), mayúscula al empezar la frase, el «¿» de apertura, y «borrar eso» / «borra la
  última palabra» (`commands="false"` las apaga). Sin `for`, solo el evento `nx-voice-text`
  (cancelable).
- **Privacidad:** el micrófono se apaga siempre al terminar, al ocultar la pestaña, al desconectar el
  elemento y a los `max-seconds` (30), con todas las pistas detenidas y el `AudioContext` cerrado.
  Nunca graba en segundo plano. **La voz de Chrome y Edge se reconoce en los servidores de Google o
  Microsoft** (el audio sale del equipo); `engine="server"` usa el servidor propio de la app aunque el
  navegador tenga la API. `endpoint` solo del mismo origen (o de `allowOrigins`).

```html
<nx-voice for="pedido-fill" hotkey="Alt+V"></nx-voice>
<nx-paste-fill id="pedido-fill" fields='[{"name":"cantidad","kind":"number"}]'>
  <form>…</form>
</nx-paste-fill>

<textarea id="novedades"></textarea>
<nx-voice for="novedades" hold layout="stacked"></nx-voice>

<nx-voice for="pedido-fill" engine="server" endpoint="/api/voz"></nx-voice>
```

| | |
|---|---|
| Propiedades / atributos | `for`, `endpoint`, `engine` (`auto`, `browser`, `server`), `hold`, `hotkey`, `max-seconds` (30), `silence` (ms, 2000), `commands` (`"false"` las apaga), `layout` (`inline`, `stacked`), `locale`, `labels`, `disabled` · solo lectura: `state` (`idle`, `asking`, `listening`, `processing`, `error`, `unavailable`), `supported`, `text` |
| Métodos | `start()`, `stop()`, `cancel()` |
| Eventos | `nx-voice-start`, `nx-voice-partial` `{text}`, `nx-voice-text` `{text, confidence, final}` (cancelable), `nx-voice-end` `{text, canceled}`, `nx-voice-error` `{code, message}` (`not-allowed`, `no-speech`, `network`, `no-mic`, `server`, `failed`), `nx-voice-unavailable` |
| Funciones | `applyDictation(valor, inicio, fin, dicho, {orders?, last?})` → `{value, caret, range}`, `parseDictation(dicho)`, `pickVoiceMime(isTypeSupported)`, `parseVoiceLine(línea)`, `voiceFileName(tipo)`, `parseVoiceHotkey("Alt+V")`, `voiceHotkeyMatches(atajo, evento)`, `speechTranscript(resultados)`, `voiceLevel(bytes)`, `voiceErrorCode(error)`, `VOICE_LABELS`, `VOICE_MIMES` |

## `<nx-thread>`

**La conversación dentro del registro.** En vez de «te mandé un correo sobre la OC-2291», los
comentarios viven en el pedido, la factura o la orden de compra, y se pueden anclar a un campo
(«¿por qué este descuento?»).

- **Lista**: del más viejo al más nuevo, agrupada por día («Hoy», «Ayer», «lun 21 sept»), con avatar,
  hora relativa (la exacta al pasar el cursor) y «(editado)». «Nuevos» marca el primer comentario de
  otra persona desde la última visita. Con muchos comentarios pinta los últimos 50 y «Ver anteriores».
- **Respuestas de un solo nivel**: responder cita arriba el comentario, en pequeño. Lo propio se edita
  en su lugar y se borra con «Deshacer» (sin «¿Seguro?»).
- **Anclas**: los campos con `data-thread` (o los de `anchors`) llevan junto a su etiqueta un globito
  con los comentarios abiertos («3 comentarios sobre Descuento»); un clic filtra el hilo y deja el
  redactor «Sobre: Descuento». Una conversación anclada se **resuelve** y queda plegada («Resuelto por
  Laura · ver»).
- **Redactor**: `@` menciona (lista de `people-source` con teclado), `#` o un código conocido
  (`ref-patterns`: `FV-1873`) referencia un registro de `refs-source`, que se ve como ficha con su
  tarjeta. El texto es siempre texto: solo se reconocen menciones, referencias, URL y saltos de línea.
- **Envío optimista**, «No se envió · Reintentar» sin perder el texto (con `clientId`, sin duplicar) y
  el borrador guardado por registro.
- **En vivo** con `stream` (SSE o NDJSON: comentarios, ediciones, borrados y «escribiendo…»), con
  reconexión; sin él, un sondeo suave. Con `<nx-presence>`: «Laura está viendo».
- Cada mención nueva emite `nx-thread-mention` para que la app avise por su lado (correo, `<nx-inbox>`).

```html
<label for="desc">Descuento</label> <input id="desc" name="descuento" data-thread="descuento">

<nx-thread record="OC-2291" endpoint="/api/comentarios" stream="/api/comentarios/stream"
  people-source="/api/personas" refs-source="/api/referencias" ref-patterns='["OC-\\d{3,6}", "FV-\\d{3,6}"]'
  me='{"id":"u7","name":"Diego Llinás"}'></nx-thread>
```

| | |
|---|---|
| Propiedades / atributos | `record`, `endpoint`, `stream`, `poll` (s, 30; `0` no sondea), `people-source`, `refs-source`, `ref-patterns`, `me`, `anchors`, `presence` (`id` de un `<nx-presence>`), `readonly`, `disabled`, `locale`, `labels` · propiedad `comments` (sin `endpoint`, todo local) |
| Métodos | `reload()`, `focusComposer(ancla?)`, `filter(ancla \| null)` |
| Eventos | `nx-thread-post` `{record, text, anchor?, replyTo?, clientId}` (cancelable), `nx-thread-change` `{comments}`, `nx-thread-mention` `{comment, people}`, `nx-thread-error` `{action, message, id?}` |
| Protocolo | `GET {endpoint}?record=` → `[{id, author, text, at, editedAt?, anchor?, replyTo?, resolved?, resolvedBy?}]` · `POST {endpoint}` · `PATCH {endpoint}/{id}` `{text}` o `{resolved}` · `DELETE {endpoint}/{id}` · `POST {endpoint}/typing` · stream `{type: "comment" \| "update" \| "delete" \| "typing", …}` |
| Funciones | `parseThreadText()`, `threadPlainText()`, `threadMentions()`, `groupThreadByDay()`, `threadDayLabel()`, `threadRefPatterns()`, `threadFirstUnread()`, `threadAnchorCounts()`, `threadRoot()`, `cleanThreadComment(s)()`, `mergeThreadComments()`, `encodeThreadDraft()`, `decodeThreadDraft()`, `threadPick()`, `THREAD_LABELS`, `THREAD_MAX_TEXT` |

## `<nx-checklist>`

**Procedimientos con evidencia.** Cierre de mes, auditoría de inventario, recepción de mercancía,
alistamiento de un vehículo, apertura de caja: cada paso con responsable, fecha límite y la evidencia
que exige. Queda quién marcó cada paso y cuándo, y funciona sin señal en la bodega.

- **Un solo diseño, sobrio**: el nombre del procedimiento, un único indicador de avance («7 de 12 · 2
  vencidos») y los pasos por sección, cada uno con su casilla, responsable y vencimiento («vence hoy
  5:00 p. m.»; lo vencido va en rojo, con ícono y texto).
- **Evidencia en su lugar**: al abrir un paso (clic o <kbd>Enter</kbd>) se despliega ahí mismo, uno a
  la vez: fotos (con la cámara del celular, o «Tomar con el celular» con `<nx-handoff>`), archivos,
  firma (`<nx-signature>`), nota, un número con rango («2–8 °C») y opciones. «Marcar como hecho» se
  habilita cuando está completa y dice qué falta. Un número fuera de rango o «No conforme» se pueden
  cerrar, con aviso y nota obligatoria.
- **Omitir** y **reabrir** piden motivo; todo queda en «Actividad» (quién, qué, cuándo, por qué).
- **Orden**: `sequential` (todo, o algunas secciones) y `dependsOn` («Primero: Contar las láminas»).
- **Optimista y sin conexión**: cada cambio se ve al instante y va al servidor en orden (las fotos
  antes); sin red queda «pendiente de enviar» y se sigue trabajando. Un rechazo del servidor revierte
  ese paso con un aviso.
- **Al terminar**: «Procedimiento completo», quién y cuándo, y «Cerrar procedimiento» (solo lectura).
- **Varios a la vez**: `mode="summary"` con su avance y sus vencidos («Cierre de septiembre · 18/24 · 3
  vencidos»), ordenable.

```html
<nx-checklist endpoint="/api/procedimientos/recepcion-oc-2291"
  me='{"id":"u7","name":"Diego Llinás"}' sequential='["Conteo"]' handoff="/api/handoff"></nx-checklist>

<nx-checklist heading="Apertura de caja" steps='[
  {"id":"base","title":"Contar la base","evidence":[{"type":"number","min":200000,"max":200000,"unit":"COP"}]},
  {"id":"foto","title":"Foto del arqueo","evidence":[{"type":"photo"}]},
  {"id":"firma","title":"Firma del cajero","dependsOn":["base"],"evidence":[{"type":"signature"}]}]'></nx-checklist>

<nx-checklist mode="summary" items='[{"id":"cierre","title":"Cierre de septiembre","done":18,"total":24,"overdue":3,"href":"/cierre"}]'></nx-checklist>
```

| | |
|---|---|
| Propiedades / atributos | `steps` (`{id, title, hint?, section?, assignee?, due?, required?, evidence?, dependsOn?, canSkip?}`), `state` (por `id`: `{status, by, at, evidence, reason?}`), `endpoint`, `me`, `sequential`, `handoff`, `mode` (`run`, `summary`), `items`, `heading`, `readonly`, `disabled`, `locale`, `labels` |
| Evidencia | `{type: "photo"\|"file"\|"signature"\|"note"\|"number"\|"choice", label?, min?, max?, unit?, options?, count?, accept?, required?}` |
| Métodos | `open(stepId)`, `reload()` |
| Getters | `progress` (`{done, total, required, requiredDone, skipped, overdue, complete}`), `pending` (cambios sin enviar), `closed` |
| Eventos | `nx-checklist-change` `{step, status, evidence, reason?, note?}`, `nx-checklist-complete` (cancelable), `nx-checklist-open` `{item}` (summary, cancelable), `nx-checklist-error` `{message, step?, status?}` |
| Protocolo | `GET {endpoint}`, `POST {endpoint}/steps/{id}/files`, `PATCH {endpoint}/steps/{id}` `{status, evidence, reason?, clientId}`, `POST {endpoint}/close` |
| Funciones | `checklistProgress()`, `checklistBlocks()`, `checklistDeps()`, `checklistMissing()`, `checklistInRange()`, `checklistOverdue()`, `checklistDueText()`, `CHECKLIST_LABELS` |

## `<nx-recurrence>`

**Repeticiones en tus palabras**: reportes que se envían solos, el cobro de un arriendo, un
mantenimiento preventivo, un recordatorio de cierre.

```html
<nx-recurrence name="regla" value="el último viernes de cada mes a las 5 pm"></nx-recurrence>
```

- **Se escribe como se dice** (español de Colombia; inglés básico con `locale="en-US"`): «todos los
  días a las 7», «de lunes a viernes a las 7 am», «cada 15 días desde el lunes», «los días 5 y 20 de
  cada mes», «el primer lunes hábil del mes», «el último día hábil del mes», «cada año el 15 de
  enero», «cada 2 horas de 8 a 18», «hasta el 31 de diciembre», «10 veces», «menos en festivos», «si
  cae festivo, el día hábil siguiente». Tildes, mayúsculas, «5 de la tarde», «17:00», «5pm» y números
  en letras dan igual; lo que no entiende lo dice («no entiendo "quincenal los"»).
- **Cómo se entendió**: la frase canónica («El último viernes de cada mes, a las 5:00 p. m.») y las
  próximas fechas reales («vie 30 oct 2026, 5:00 p. m. · vie 27 nov · …»), marcando las corridas por
  festivo («lun 12 oct → mar 13 oct 2026, por festivo»).
- **Ajustar a mano**: frecuencia, cada N, días (L M M J V S D), del mes («el día 5» / «el último
  viernes»), hora u horario, desde, hasta o N veces, festivos. Los controles reescriben la frase; la
  frase mueve los controles.
- **Festivos de Colombia** incluidos (fijos, Ley Emiliani y los de Pascua, por año); `holidays` suma
  los propios o los reemplaza (`holidays-mode="replace"`).
- **Estándar**: una RRULE de iCalendar (RFC 5545) con `X-NX-HOLIDAYS=skip|before|after`.

| | |
|---|---|
| Propiedades / atributos | `value` (frase o RRULE; al leer, la RRULE), `name`, `required`, `disabled`, `readonly`, `start` (ISO, hoy), `holidays` (JSON), `holidays-mode` (`add`, `replace`), `count` (5), `value-format` (`rrule`, `json`), `locale`, `label`, `labels` · solo lectura: `rule`, `text`, `next` (`Date[]`); `toJSON()` → `{rrule, text, holidays, next}` |
| Eventos | `nx-recurrence-change` `{value, rrule, text, next}` (al confirmar lo escrito o cambiar un control) y `change` (nativo), `nx-recurrence-error` `{message}` |
| Funciones | `parseRecurrence(frase, {start, locale})`, `describeRecurrence(regla)`, `toRRule()`, `parseRRule()`, `nextOccurrences(regla, desde, n, festivos)`, `recurrenceOccurrences()` (con `movedFrom`), `colombiaHolidays(año)`, `fillRecurrenceRule()`, `RECURRENCE_LABELS` |

**`X-NX-HOLIDAYS`** (la RRULE no tiene festivos): `skip` quita los festivos del conjunto de cada
período **antes** de `BYSETPOS` (así «el último día hábil» es `BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;X-NX-HOLIDAYS=skip`)
y `COUNT` no los cuenta; `before`/`after` corren una fecha que cae en festivo al día hábil (lunes a
viernes, no festivo) anterior o siguiente. Un lector estándar la ignora y da las fechas sin saltar
ni correr festivos.

## `<nx-jobs>`

**Trabajos largos que sobreviven a recargar.** Importar 10.000 filas, cerrar el mes, recalcular costos,
generar 500 facturas electrónicas: en vez de un spinner eterno (y la duda de si terminó al recargar), el
trabajo vive en el servidor y una píldora discreta en la barra dice cómo va.

- **Píldora**: sin trabajos no se ve (o un ícono tenue con `always`); con trabajos, «2 trabajos en curso»
  con un anillo del avance agregado; al terminar, «Listo: Cierre de septiembre» un rato; si falla, en rojo
  hasta que se abra el panel.
- **Panel** (hoja desde abajo en el celular): cada trabajo con su etapa («Guardando · 4.200 de 10.000 ·
  faltan ~3 min»), barra real (indeterminada si el servidor no da total), hora y quién lo lanzó, y sus
  acciones: Cancelar (con confirmación en línea: «Lo ya guardado queda»), Reintentar lo que falló,
  Descargar, Ver filas con error, Ir al registro, Quitar. Los terminados quedan en «Recientes», plegados.
- **Tiempo restante** con una media móvil de la velocidad: una ráfaga o un tramo lento no lo hacen saltar.
- **Sobrevive a recargar y a cambiar de página**: al conectar pide los activos y recientes; los ids en
  curso también se guardan en `localStorage`.
- **Una sola conexión**: `stream` (SSE o NDJSON) abierto solo mientras hay trabajos en curso, con
  reconexión creciente, `Retry-After` y `Last-Event-ID`/`?after=`; sin `stream`, un sondeo que se espacia
  si nada cambia y en segundo plano. Con varias pestañas abiertas, una sola conecta y comparte los eventos.
- **Avisa al terminar**: un aviso en la página si el panel está cerrado y, con `notify`, una notificación
  del sistema si la pestaña está oculta (el permiso se pide al lanzar, nunca al cargar).

```html
<nx-jobs id="trabajos" endpoint="/api/trabajos" stream="/api/trabajos/eventos" notify></nx-jobs>
<script type="module">
  const jobs = document.getElementById("trabajos");
  const job = await jobs.start({ type: "cierre-mes", title: "Cierre de septiembre", params: { mes: "2026-09" } });
</script>
```

| | |
|---|---|
| Propiedades / atributos | `endpoint`, `stream`, `poll` (s, 3), `notify`, `always`, `recent` (10), `locale`, `labels` (`JOBS_LABELS`), `disabled` · solo lectura: `jobs`, `active`, `open` |
| Métodos | `start({type, title, params})`, `track(id \| job)`, `cancel(id)`, `retry(id)`, `dismiss(id)`, `show()`, `hide()` |
| Eventos | `nx-jobs-change` `{jobs}`, `nx-jobs-done` `{job}` (terminado, fallido o cancelado), `nx-jobs-error` `{action, message, id?, status?}`, `nx-open-change` `{open}` |
| Protocolo | `GET {endpoint}?active=1` → `[{id, type, title, status, stage?, done?, total?, startedAt, finishedAt?, by?, result?}]` · `POST {endpoint}` · `GET {endpoint}/{id}` · `POST {endpoint}/{id}/cancel` · `POST {endpoint}/{id}/retry` · stream `{id, status?, stage?, done?, total?, result?, seq?}` |
| Funciones | `jobPace()`, `jobLeft()`, `jobsDuration()`, `mergeJob()`, `splitJobs()`, `cleanJob(s)()`, `isJobActive()`, `jobFraction()`, `jobsFraction()`, `jobsBackoff()`, `jobsRetryAfter()`, `jobsPollDelay()`, `jobUrl()`, `readJobsMemo()` |

## Desarrollo

**Galería en línea:** https://dl21hex.github.io/nx32-elements/ — la documentación con todos los ejemplos
funcionando. Se publica sola en cada push a `main` (`.github/workflows/pages.yml`). Los ejemplos que
«hablan con un servidor» (la IA, la captura, el agente, el impacto…) usan una API de mentira que
corre en el navegador (`gallery/demo-api.ts`), así que no hace falta backend ni en local ni en Pages.

```bash
npm install
npm run dev            # galería en http://localhost:5173
npm run build:gallery  # dist-gallery/: la galería como archivos estáticos (la publica GitHub Pages)
npm run build          # dist/: ESM, IIFE, CSS, adaptador Solid, tipos y chequeo de tamaño
npm test               # vitest: lógica (node), render/ARIA (happy-dom) y dist/ si existe
npm run typecheck
npm run bench          # rendimiento de la lógica con datos grandes (mediana de varias corridas)
npm run e2e            # Playwright sobre la galería en Chromium, con axe
npm run contrast       # contraste AA de los tokens de texto, en claro y oscuro y en las 9 paletas
npm run check          # todo lo anterior + build y peso; Chromium, Firefox y WebKit
```

Las verificaciones corren en local. En GitHub solo corre el despliegue de la galería a Pages
(`.github/workflows/pages.yml`), sin pruebas. `npm install` activa el hook `pre-push`
(`.githooks/`), que corre `npm run check` antes de cada `git push` y no deja enviar si algo falla.
WebKit se prueba si la máquina lo puede abrir; en Linux necesita `sudo npx playwright install-deps webkit`.

```bash
npm run example:solid  # ejemplo con @solidjs/router sobre dist/ (hace falta build antes)
```

`examples/html/index.html` es una página HTML sin build: se sirve la raíz del repo con cualquier
servidor estático y se abre `/examples/html/`.

```
src/core/            h() y safeHref(), registro de íconos, define() seguro para SSR
src/components/      un directorio por componente: lógica pura, render y CSS
src/styles/          tokens.css y nx32-elements.css (tokens + todos los componentes)
src/solid/           adaptador para SolidJS (un archivo por componente; jsx.ts, los tipos JSX)
src/bdui.ts          adaptador BDUI
gallery/             la galería (usa <nx-sidemenu> como su propia navegación)
```

**Navegadores:** Chrome/Edge 123+, Safari 17.5+ y Firefox 125+. Importar la librería en el
servidor (SSR) no lanza errores: los elementos solo se registran en el navegador.

Los íconos de `nx32-elements/icons` son de [Lucide](https://lucide.dev) (licencia ISC, ver
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)). Para regenerarlos: `node scripts/gen-icons.mjs`.

## Licencia

[MIT](LICENSE).
