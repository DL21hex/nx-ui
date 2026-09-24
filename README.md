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
| `<nx-agent>` + IA + botón + BDUI + núcleo (ESM) | ≈ 14 KB |
| `nx-ui.css` (tokens + todos los componentes) | ≈ 12,6 KB |
| `nx-ui.iife.js` todo-en-uno con íconos | ≈ 54 KB |

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
por consola.

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
`{"msg":"…","level":"warn"}` y al final `{"ok":true}` o `{"ok":false,"msg":"…"}`.

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

| | |
|---|---|
| Propiedades / atributos | `endpoint`, `method`, `question`, `placeholder`, `suggestions`, `context`, `feedback`, `labels` |
| Métodos | `ask(q)`, `stop()`, `begin(q)`, `push(evento)`, `end()`, `state`, `text` |
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

| | |
|---|---|
| Propiedades / atributos | `schema`, `endpoint`, `action`, `review-below`, `accept`, `labels` |
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
- **Exportar a .xlsx.** Es un Excel de verdad: números, montos y fechas como valores, cabecera fija
  y autofiltro. El generador no tiene dependencias y se carga solo al exportar.
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
- **B · Paneles apilados.** `mode="panel"`: cada nivel se apila sobre el anterior (pedido →
  proveedor → factura), con migas para volver, y la página sigue a la vista. Con `url`, «atrás»
  del navegador cierra el nivel de arriba.
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
| `nxToast()` | `{message, tone?, undo?, action?, duration?}` → `"undo"`, `"action"`, `"timeout"` o `"dismiss"`. Se pausa con el mouse o el foco encima; al cerrar la página, los pendientes terminan como `"timeout"` |
| `nxConfirm()` | `{heading, message?, impact?, body?, confirmLabel?, tone?, hold?}` → `true` / `false` |
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
| `nx_show` | Pinta un componente de nx-ui (nodo BDUI, con su lista de props permitidas) | `{shown}` |
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
| Propiedades / atributos | `endpoint`, `for`, `heading`, `placeholder`, `suggestions`, `tools`, `context`, `state`, `labels` · `messages`, `threadId`, `running` (lectura) |
| Métodos | `send(texto)`, `stop()`, `reset()` |
| Eventos | `nx-agent-tool` (herramientas de la app), `nx-agent-send` (ajustar la entrada), `nx-agent-state`, `nx-agent-custom`, `nx-agent-event` (cada evento AG-UI) |

Nada que cambie datos ocurre en el navegador: las herramientas de la cabina solo muestran,
preguntan y mueven la pantalla. Escribir datos lo hace el backend, después de la aprobación.

## Desarrollo

```bash
npm install
npm run dev            # galería en http://localhost:5173
npm run build          # dist/: ESM, IIFE, CSS, adaptador Solid, tipos y chequeo de tamaño
npm test               # vitest: lógica (node), render/ARIA (happy-dom) y dist/ si existe
npm run typecheck
npm run bench          # rendimiento de la lógica con datos grandes (mediana de varias corridas)
npm run e2e            # Playwright sobre la galería en Chromium, con axe
npm run contrast       # contraste AA de los tokens de texto, en claro y oscuro y en las 9 paletas
npm run check          # todo lo anterior + build y límites de peso; Chromium, Firefox y WebKit
```

No hay CI en GitHub: las verificaciones corren en local. `npm install` activa el hook `pre-push`
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
