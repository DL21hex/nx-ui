# nx-ui

Componentes web ultraligeros, **sin dependencias**, compatibles con BDUI. Se usan igual en una
página HTML plana, en SolidJS (con SSR) o pintados desde un JSON que manda el backend.

| Paquete | min + gzip |
|---|---|
| `<nx-sidemenu>` + núcleo (ESM) | ≈ 5,8 KB |
| `<nx-button>` + núcleo (ESM) | ≈ 4,1 KB |
| `<nx-select>` + núcleo (ESM) | ≈ 5,7 KB |
| `<nx-ai-answer>` + núcleo (ESM) | ≈ 5,6 KB |
| `<nx-doc-capture>` + botón + núcleo (ESM) | ≈ 9,4 KB |
| `<nx-grid>` + núcleo (ESM); el generador de XLSX, ≈ 2,3 KB, se carga al exportar | ≈ 18 KB |
| `<nx-dialog>` + núcleo (ESM) | ≈ 4,2 KB |
| `nxToast()` + núcleo (ESM) | ≈ 2,2 KB |
| `nxConfirm()` + diálogo + botón + núcleo (ESM) | ≈ 8,6 KB |
| `<nx-agent>` + IA + botón + BDUI + recorrido + núcleo (ESM) | ≈ 15,8 KB |
| `<nx-command>` + núcleo (ESM) | ≈ 6,6 KB |
| `<nx-explain>` + núcleo (ESM) | ≈ 6,7 KB |
| `<nx-inbox>` + avisos + núcleo (ESM) | ≈ 8,6 KB |
| `<nx-survey>` + núcleo (ESM) | ≈ 11,4 KB |
| `nx-ui.css` (tokens + todos los componentes) | ≈ 15,4 KB |
| `nx-ui.iife.js` todo-en-uno con íconos | ≈ 66 KB |

Cada componente es una subruta (`nx-ui/sidemenu`, `nx-ui/button`): una app solo carga lo que importa.

`npm run size` imprime los números actuales y falla si una pieza (el JS o el CSS de un componente,
o los tokens) se pasa de su límite. Los paquetes agregados solo se informan.

## Principios

1. **Primero una librería normal.** Atributos para lo simple, propiedades para los datos
   (`items`), eventos para las acciones y slots para tu contenido.
2. **BDUI sin costo.** Ninguna prop es una función: todo lo que acepta un componente puede venir
   del backend. `nx-ui/bdui` es un adaptador opcional que convierte `{component, props}` en elementos.
3. **El navegador hace el trabajo pesado.** Los flotantes y el drawer usan la Popover API: capa
   superior, clic fuera, Escape y devolución del foco sin código propio.
4. **Neutro y tematizable.** Todo el color sale de variables `--nx-*` (el mismo vocabulario que el
   design system de nx32), con claro y oscuro vía `light-dark()`.
5. **Habla el formato de quien la usa.** Números, montos, fechas y tiempos salen de `Intl` con el
   locale de cada componente: su atributo `locale`, o el `lang` más cercano (el de la página), o
   «es-CO». Es un solo formateador compartido (`nxFormat`), cacheado por locale. Los textos de la
   interfaz van aparte, en `labels`.
6. **Rápida con muchos datos, no solo liviana.** Reglas para todos los componentes:
   - solo se pinta lo que se ve: filas virtualizadas que se reutilizan al desplazarse, o un tope
     (`limit`);
   - un nodo que ya está en pantalla se actualiza en su lugar, no se recrea;
   - el trabajo caro se hace una vez y se reutiliza: quitar tildes o armar el orden alfabético se
     calcula una vez por dato, no una vez por tecla o por comparación;
   - no se recalcula lo que no cambió: ordenar no vuelve a filtrar;
   - lo que se usa poco se carga al usarlo (el generador de Excel);
   - se mide: `npm run size` hace cumplir un límite de peso por pieza, y `npm run bench` mide la
     lógica con datos grandes (100.000 filas, 10.000 opciones).
7. **Probada donde se usa.** Además de las pruebas de lógica y de DOM, las interacciones (Popover
   API, foco, portapapeles, teclado, View Transitions, «atrás» del navegador) se prueban en
   Chromium, Firefox y WebKit con Playwright, en local antes de cada envío, y cada componente pasa axe (WCAG 2.1 AA) sin
   problemas graves. El contraste de los tokens se verifica en todas las paletas.

## Paletas

`nx-ui/palettes.css` trae nueve paletas listas: `indigo` (por defecto), `oceano`, `esmeralda`,
`bosque`, `terracota`, `frambuesa`, `violeta`, `medianoche` y `grafito`. Se aplican con un atributo,
en `<html>` o en cualquier zona de la página:

```html
<link rel="stylesheet" href="nx-ui/palettes.css" />
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

## Uso

**HTML plano**, sin build:

```html
<link rel="stylesheet" href="nx-ui.css" />
<script src="nx-ui.iife.js"></script>

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
import "nx-ui/nx-ui.css";
import { registerIcons } from "nx-ui"; // registra <nx-sidemenu>
import { lucide } from "nx-ui/icons"; // opcional: ~28 íconos Lucide
registerIcons(lucide);
```

**SolidJS:** `nx-ui/solid` trae un envoltorio y los tipos JSX. Se publica como JSX sin compilar
bajo la condición de export `"solid"`, así que vite-plugin-solid lo compila para SSR o navegador.

```tsx
import { SideMenu } from "nx-ui/solid";

<SideMenu items={menu()} active={useLocation().pathname} collapsible collapsed={compact()}
  onToggle={(e) => { e.preventDefault(); setCompact(e.detail.collapsed); }} />
```

Los `<a href>` del menú los intercepta `@solidjs/router` solo. Si se usa la etiqueta sin el
envoltorio, hay que usar `prop:items` y `bool:collapsed`. Con `items={…}` el SSR escribe
`"[object Object]"`, y con `collapsed={false}` el atributo queda como `"false"`.

**BDUI:**

```js
import { render } from "nx-ui/bdui";
render({ component: "SideMenu", props: { items, active: "/ventas/pedidos" } }, contenedor);
```

Cada componente declara qué props acepta. Una clave que no está en la lista se ignora y se avisa
por consola. `registerComponent` solo acepta elementos personalizados (con guion) y nunca props como
`innerHTML`, `srcdoc` u `on*`.

**Orígenes permitidos.** Todo `endpoint`, `source`, `action` o canal que llega en un payload se usa
solo si es del mismo origen que la página. Así un payload no puede mandar filas, textos pegados ni
el contexto de la app a un tercero. Si la API vive en otro dominio, se declara una vez:

```js
import { allowOrigins } from "nx-ui";
allowOrigins("https://api.miapp.co");
```

## `<nx-sidemenu>`

| | |
|---|---|
| Propiedades / atributos | `items` (JSON en el atributo), `active`, `collapsed`, `collapsible`, `auto-collapse` (compacto en tablet), `labels` |
| Métodos | `show()`, `hide()`, `toggle()` y `open`, para el drawer (< 768 px) |
| Eventos | `nx-select` `{item, href}` (cancelable), `nx-toggle` `{collapsed, auto}` (cancelable), `nx-open-change` `{open}` |
| Slots | `slot="header"`, `slot="footer"` (no se mueven del DOM, así que no rompen la hidratación) |
| Variables | `--nx-sidemenu-width`, `--nx-sidemenu-width-collapsed`, `--nx-sidemenu-drawer-width`, `--nx-flyout-width` |

`MenuItem`:
- `id` y `label` son obligatorios.
- `href` solo acepta rutas relativas, `http(s)`, `mailto` y `tel`. Cualquier otro esquema se descarta.
- `icon` es un nombre registrado. Si falta, se pintan las iniciales.
- `section` agrupa ítems bajo un título.
- `description` es la segunda línea del panel.
- `children` convierte al ítem en un padre que abre un panel flotante. El buscador solo aparece con más de 3 hijos; con menos, el teclado (flechas, Enter) sigue funcionando sobre la lista.
- `utility` pone el hijo como chip al pie del panel.
- `badge` es un contador o marca (`12`, `"Nuevo"`). `0` no se pinta, más de 99 es «99+» y en compacto se reduce a un punto.

`active` acepta un href (exacto o por prefijo de ruta) o un id. El id de un padre lo enciende sin
hoja activa, útil en una ficha de detalle que no está en el menú. Los ítems sin `section` se pintan
arriba, antes de las secciones: ahí van los accesos fijos (Inicio, Pendientes…).

## `<nx-button>`

Un botón que sabe esperar. Mientras corre una tarea:
- se bloquea sin soltar el foco (`aria-busy`, `aria-disabled`) y el clic no llega a la app;
- muestra un spinner, el último mensaje deslizándose dentro del botón, el tiempo transcurrido y una
  barra de progreso (indeterminada si no hay porcentaje);
- guarda un registro tipo terminal (`log-mode="inline"` lo despliega debajo; en `ticker`, por
  defecto, se abre con «Registro (n)»).

Al terminar muestra ✓ o ⚠ con un resumen unos segundos y emite `nx-done` `{ok, ms, lines}`.

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
| Propiedades / atributos | `label`, `icon`, `variant` (`secondary`, `primary`, `ghost`, `danger`), `type`, `disabled`, `busy`, `progress`, `log-mode` (`ticker`, `inline`, `none`), `stream`, `method`, `labels` |
| Métodos | `run(task)`, `log(msg, level?)`, `done(ok, msg?)`, `lines` |
| Eventos | `nx-done` `{ok, ms, lines}` |

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
- Participa en un `<form>` nativo (`name`, `required`, `reset`).
- `source`: mismo origen (o `allowOrigins`); lo que se escribe no sale hacia un tercero. Una
  búsqueda nueva cancela la anterior.

| | |
|---|---|
| Propiedades / atributos | `fields`, `options`, `source`, `value`, `selection`, `multiple`, `placeholder`, `label`, `name`, `required`, `disabled`, `clearable`, `avatar`, `limit`, `labels` |
| Métodos | `show()`, `hide()`, `open` |
| Eventos | `nx-change` `{value, options}` |

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
{"type":"action","label":"Ver órdenes","href":"/…"}                          (o "id" + "data": nx-ai-action)
{"type":"done"}                                                              (o {"type":"error","message":"…"})
```

El texto admite un Markdown mínimo (negrita, código, listas, párrafos) y nunca se interpreta como
HTML. Un tipo de evento desconocido se ignora. Con otro transporte (WebSocket, SDK propio) la app
entrega los eventos: `begin(q)`, `push(evento)`, `end()`.

Lo que manda el modelo no es de fiar. `endpoint` solo puede ser del mismo origen (u otro permitido
con `allowOrigins`). Con `method="GET"`, la pregunta va en `?q=` y el contexto en `?context=`
(JSON). El enlace de una **acción** solo se pinta si es del mismo origen; si no, la acción queda
como botón que emite `nx-ai-action`. Una **fuente** puede ser de otro sitio y lleva
`rel="noopener noreferrer"`. Al llegar `done` o `error` se deja de leer y se suelta la conexión:
lo que el servidor siga mandando no entra en la respuesta siguiente. La respuesta se escribe en
su lugar (un bloque nuevo o el último que cambia), con `aria-busy` mientras llega y un solo aviso
al lector de pantalla al terminar.

| | |
|---|---|
| Propiedades / atributos | `endpoint`, `method`, `question`, `placeholder`, `suggestions`, `context`, `feedback`, `labels` |
| Métodos | `ask(q)`, `stop()`, `begin(q)`, `push(evento)`, `end()`, `state`, `busy`, `text` |
| Eventos | `nx-ai-start`, `nx-ai-done` `{question, text, sources, status}`, `nx-ai-action` `{id, label, data}`, `nx-ai-feedback` `{value, question, text}` |

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
cap.addEventListener("nx-capture-submit", (e) => guardar(e.detail.values)); // o action="/url"
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
| Eventos | `nx-capture-file` (cancelable), `nx-capture-start`, `nx-capture-done`, `nx-capture-change`, `nx-capture-submit` (cancelable) |

La referencia completa y la demo en vivo están en la galería.

## `<nx-grid>`

Una tabla de datos que se explora sola:

- **Histogramas que filtran.** Cada cabecera muestra cómo se reparten los datos de su columna: el
  total en gris y lo que queda tras los filtros en color. Un clic filtra: en una categoría suma o
  quita el valor; en números y fechas elige un rango, y Mayús+clic lo extiende.
- **Filtro en lenguaje natural.** «pendientes de marzo de más de 5 millones», «sin anulados»,
  «atraso mayor a 3». Lo resuelve un analizador local con el vocabulario de las columnas y los
  datos. Lo que no entiende lo dice; con `nl-endpoint`, esas frases van al backend.
- **Panel de filtros.** Facetas con casillas y conteos, con la misma regla del tablón de nx32:
  - las opciones de una faceta se suman (O) y las facetas se restringen entre sí (Y);
  - cada opción se cuenta con los demás filtros, nunca con el suyo;
  - una opción en 0 queda deshabilitada.
- **Un solo modelo de filtros.** La barra, la casilla y la frase producen el mismo filtro y el mismo
  chip.
- **Hoja de cálculo.** Navegación con teclado, rangos con suma, promedio, mínimo y máximo, copiar y
  pegar con Excel (TSV) y edición en línea (`nx-grid-change`, cancelable). Deshacer y rehacer
  (Ctrl+Z, Ctrl+Y o Ctrl+Mayús+Z, y botones): cada edición, pegado o borrado es un paso; lo
  deshecho queda seleccionado, y la marca de «editada» se va si la celda vuelve a su valor original.
- **Agrupación con subtotales** por cualquier columna de categorías o por mes.
- **Exportar a .xlsx.** Es un Excel de verdad: números, montos (con el símbolo de su moneda y
  decimales solo si los hay) y fechas como valores, cabecera fija y autofiltro. El generador no
  tiene dependencias y se carga solo al exportar. Con `source`, las filas se piden por bloques de
  5.000 (hasta el tope de una hoja de Excel); si el servidor falla, `exportXlsx()` se rechaza.
- **Copiar sin fórmulas.** Un texto que empieza con `=`, `+`, `-` o `@` se copia con un apóstrofo
  delante (Excel lo pega como texto, no como fórmula); al pegarlo de vuelta en la tabla se quita.
- **Columnas de IA.** Un nombre y un prompt; `ai-endpoint` recibe las filas visibles, en lotes, y
  responde celda por celda en streaming.
- **Cliente o servidor.** Con `rows`, todo pasa en el navegador. Con `source`, se pide por bloques
  al desplazarse, y el backend devuelve los agregados.
- **Filas virtualizadas.** Solo existen en el DOM las filas visibles, y al desplazarse se reutilizan.
  En el cliente, 100.000 filas se filtran y ordenan en décimas de segundo; más allá, `source`.
- **Selección y detalle.** `selectable` agrega casillas (Mayús para un tramo, Espacio con teclado,
  «seleccionar las n» filtradas); lo que la app ponga con `slot="bulk"` aparece junto al conteo.
  Una columna `link` abre el detalle (`nx-grid-open`, también con Enter) y `avatar` muestra las
  iniciales. `grid.rows = grid.rows` recalcula tras cambiar filas por fuera.
- **Locale.** Números, montos, fechas, lo que se escribe en una celda y el orden alfabético salen
  de `Intl` con `locale` («es-CO», «en-US», «pt-BR»…; por defecto, el `lang` de la página). Un
  `currency` ISO («COP», «USD») usa el formato de moneda del locale. Los textos de la interfaz van
  aparte, en `labels`, y el filtro en lenguaje natural local entiende español (otros idiomas, con
  `nl-endpoint`).

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
source       POST {offset, limit, sort, filters} → {rows, total, histograms?, facets?, totals?}
ai-endpoint  POST {prompt, column, label, columns, rows:[{id, …}]} → {"type":"cell","id":"2201","value":"Alto","tone":"danger"} por línea
nl-endpoint  POST {q, columns} → {filters, unknown?}
filtro       {key, op:"in"|"notIn", values} · {key, op:"range", min?, max?} · {key, op:"contains", value}
```

`source`, `ai-endpoint` y `nl-endpoint` solo se usan si son del mismo origen (o de uno permitido con
`allowOrigins`): las filas no salen hacia un tercero. En modo servidor, «seleccionar las n» y las
acciones en lote alcanzan solo las filas de la consulta actual; sin `row-key`, una marca por
posición se pierde al cambiar de filtro u orden. Con filas nuevas (o otra consulta) las columnas de
IA se vuelven a pedir, y lo que llegue tarde de la petición anterior se descarta.

| | |
|---|---|
| Propiedades / atributos | `columns`, `rows`, `source`, `filters`, `sort`, `group-by`, `ai-endpoint`, `nl-endpoint`, `facets-open`, `height`, `row-key`, `filename`, `locale`, `selectable`, `selected`, `labels` |
| Métodos | `ask(frase)`, `clearFilters()`, `exportXlsx()`, `addAiColumn(nombre, prompt)`, `removeColumn(key)`, `refresh()`, `undo()`, `redo()`, `canUndo`, `canRedo` |
| Eventos | `nx-grid-filter`, `nx-grid-change` (cancelable), `nx-grid-columns`, `nx-grid-selection`, `nx-grid-open` |

## `<nx-dialog>`, `nxToast()` y `nxConfirm()`

Cuatro formas de hacer lo que hoy se hace con un modal, cada una para su caso:

- **A · El modal que nace del botón.** `<nx-dialog>` se expande desde el botón que lo abrió y
  vuelve a él (View Transitions; sin ellas, un fundido). En móvil es una hoja desde abajo que se
  arrastra para cerrar. Si hay cambios sin guardar, avisa dentro del propio diálogo en vez de
  perderlos: lo que cierra la persona pasa por el aviso; lo que cierra la app con `close()`, no.
  Buscar o filtrar dentro de un `<nx-select>` o una `<nx-grid>` no cuenta como cambio (sus
  controles de consulta llevan `data-nx-ephemeral`, y el diálogo ignora lo que venga de ahí);
  elegir un valor (`nx-change`) o editar una celda (`nx-grid-change`) sí.
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
| `<nx-dialog>` | `heading`, `description`, `mode` (`modal` / `panel`), `size` (`sm` / `md` / `lg` / `full`), `persistent`, `url`, `open`, `dirty`, `labels` · `show(origen?)` → promesa con el valor, `close(valor?)` · `nx-dialog-close` (cancelable), `nx-open-change` |
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
| `nx_show` | Pinta un componente de nx-ui (nodo BDUI, con su lista de props permitidas). Nunca pasan las props con URL (`endpoint`, `action`, `source`, `*Endpoint`…); con `show="Trend, Grid"`, solo esos componentes | `{shown}` |
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

**`nxTour(pasos)`** (`nx-ui/tour`) es el mismo recorrido, para cualquier app (una bienvenida, una
novedad): ilumina el elemento de cada paso, oscurece lo demás y pone al lado una tarjeta con título
y texto. `Enter`/`→` avanza, `←` vuelve y `Escape` termina; el foco vuelve a donde estaba. Mientras
se escribe en un campo de la página, las flechas y `Enter` son del campo. Solo muestra: no hace
clic ni cambia nada.

```js
import { nxTour } from "nx-ui/tour";
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
- `source="/url"`: registros del servidor mientras se escribe (`GET /url?q=…` → entradas, o `{items}`).
- `agent="id"`: lo que se escribe se le puede preguntar a ese `<nx-agent>`.

Busca sin tildes ni mayúsculas, en el nombre, la pista y las palabras clave, y también por
iniciales («np» → «Nuevo pedido»). Aprende: lo que se elige seguido sube (cada semana pesa la
mitad) y sin escribir nada aparece en «Recientes». Eso se recuerda en `localStorage`, solo en ese
navegador (`storage="none"` lo desactiva). Se guarda solo `{id, label, href, icon, group}`, nunca
`data` ni `hint`. Los registros de `source` no se guardan. Un reciente se muestra solo si sigue en
la paleta (`items`, sus submenús o `menu`). En un equipo compartido, la clave debe incluir al
usuario (`storage="nx-command:ana"`). `source` va al mismo origen (o `allowOrigins`). Un `hotkey`
sin modificador (`"/"`) no se atiende mientras se escribe en un campo. El elemento es la capa
superior (Popover API): `<button popovertarget="cmd">` la abre sin JS.

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
| Propiedades / atributos | `items`, `menu`, `source`, `agent`, `hotkey` (`"mod+k"`; `"none"` lo quita), `placeholder`, `limit`, `storage`, `labels` |
| Métodos | `show(q?)`, `hide()`, `clearHistory()`, `open`, `query` |
| Eventos | `nx-command-select` `{item, query, newTab}` (cancelable: no navega y la paleta sigue abierta), `nx-command-ask` `{query}` (cancelable), `nx-open-change` |

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
  precio.addEventListener("nx-change", (e) => guardar(e.detail.value)); // {value, text}
</script>
```

| | |
|---|---|
| Propiedades / atributos | `value` (`number \| null`; en `percent`, la fracción), `format` (`number`, `money`, `percent`), `currency` (ISO o símbolo), `decimals`, `min`, `max`, `step`, `words`, `name`, `required`, `disabled`, `readonly`, `placeholder`, `align` (`end` en montos y porcentajes), `label`, `locale`, `labels` · `text` (el valor formateado) |
| Métodos | `focus()`, `select()`, `checkValidity()`, `reportValidity()` |
| Eventos | `input` (cada vez que cambia el número), `nx-change` `{value, text}` y `change` al confirmar |
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
  periodo.addEventListener("nx-change", (e) => {
    const { start, end, compare, label } = e.detail.value; // "2026-08-27", "2026-09-25", {start, end}, "Últimos 30 días"
  });
</script>
```

| | |
|---|---|
| Propiedades / atributos | `value` (`{start, end, compare?, label?}` o «start/end»), `start`, `end`, `phrase`, `presets`, `compare` (`previous` \| `year` \| `none`), `min`, `max`, `today`, `fiscal-start`, `week-start`, `name`, `required`, `disabled`, `placeholder`, `label`, `locale`, `labels` |
| Métodos | `show(frase?)`, `hide()`, `open` |
| Eventos | `nx-change` `{value}`, `nx-open-change` `{open}` |

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
- **Modo único** (por defecto): una lectura dispara `nx-scan` y la cámara se apaga.
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
  buscar.addEventListener("nx-scan", (e) => abrirProducto(e.detail.code)); // {code, format, via}
</script>
```

| | |
|---|---|
| Propiedades / atributos | `mode` (`single`, `count`), `formats` (lista con comas o JSON; `ean_13`, `ean_8`, `upc_a`, `upc_e`, `code_128`, `code_39`, `code_93`, `codabar`, `itf`, `qr_code`, `data_matrix`, `pdf417`, `aztec`), `source` (URL + código, o con `{code}`), `items` (`{code, qty, name?, unit?, expected?, format?}`), `muted`, `autostart`, `wedge` (`page`, `field`, `off`), `locale`, `labels` · `state`, `problem` (solo lectura) |
| Métodos | `start()`, `stop()`, `add(código, cantidad?)`, `undo()`, `clear()`, `focus()` |
| Eventos | `nx-scan` `{code, format, via}` (cancelable; `via`: `camera`, `photo`, `manual`, `wedge`, `api`), `nx-scan-count` `{items}`, `nx-scan-error` `{problem}` (`nodetector`, `nocamera`, `insecure`, `denied`, `busy`, `failed`) |
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
  a `nxSync.clear()` al cerrar sesión (usa una cola por usuario, `createSync({name})`), y acota con
  `maxOps` y `ttl`.
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
  import { nxSync } from "nx-ui/sync";

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
| `nxSync` | `enqueue({id?, method, url, body?, label, group?})` → la operación guardada (rechaza si no se pudo guardar) · `pending()` · `retry(id, body?)` · `resolve(id, body)` · `discard(id)` · `flush()` · `check()` · `clear()` (al cerrar sesión) · `subscribe(fn)` → dejar de escuchar (`fn(state, event)`) · `state` `{online, ops, pending, conflicts, failed, progress, durable, auth}` · `configure({ping, base, max, timeout, headers, maxAttempts, maxRetryAfter, maxOps, ttl})` · `createSync({name})` para otra cola |
| Propiedades / atributos | `ping` (mismo origen), `fields` (`[{key, label}]`, con `*` y `{hermano}`), `labels`, `locale` · `online`, `pending`, `conflicts`, `state`, `open` |
| Métodos | `show()`, `hide()`, `toggle()`, `resolve(id)` |
| Eventos | `nx-sync-change` `{online, pending, conflicts}`, `nx-sync-done` `{op, data}`, `nx-sync-auth` `{op}` |
| Protocolo | cada envío con `Idempotency-Key`, `Content-Type: application/json` e `If-Match` al resolver · 409 `{server, local?, fields?, etag?, message?}` · otro 4xx `{message}` · `GET ping`: cualquier respuesta es conexión |

## Desarrollo

**Galería en línea:** https://dl21hex.github.io/nx-ui/ — la documentación con todos los ejemplos
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
npm run check          # todo lo anterior + build y límites de peso; Chromium, Firefox y WebKit
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
src/styles/          tokens.css y nx-ui.css (tokens + todos los componentes)
src/solid/           adaptador para SolidJS
src/bdui.ts          adaptador BDUI
gallery/             la galería (usa <nx-sidemenu> como su propia navegación)
```

**Navegadores:** Chrome/Edge 123+, Safari 17.5+ y Firefox 125+. Importar la librería en el
servidor (SSR) no lanza errores: los elementos solo se registran en el navegador.

Los íconos de `nx-ui/icons` son de [Lucide](https://lucide.dev) (licencia ISC, ver
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md)). Para regenerarlos: `node scripts/gen-icons.mjs`.

## Licencia

[MIT](LICENSE).
