# `<nx-thread>`: integración

La conversación dentro del registro: comentarios agrupados por día con «Nuevos», respuestas de un
nivel, editar y borrar (con deshacer) lo propio, resolver lo anclado a un campo, redactor con
`@menciones` y `#referencias`, globitos junto a los campos anclables, en vivo por SSE/NDJSON (o
sondeo), envío optimista con `clientId` y borrador en `sessionStorage`.

Archivos: `thread.ts` (entrada: lista, redactor, acciones, red), `logic.ts` (puro: tokens, días, no
leídos, anclas, borrador), `types.ts`, `thread.css`, y tres chunks con `import()`:

- `thread-pick.ts`: la lista de sugerencias (`@`, `#`, códigos) y la tarjeta de un registro. Se trae
  al primer foco o paso del puntero por una caja de texto o por una ficha: quien solo lee no la baja.
- `thread-live.ts`: el stream (lector de líneas, reconexión) y el «escribiendo…» en los dos sentidos.
  Solo si hay `stream`.
- `thread-anchors.ts`: los campos anclables y sus globitos. Solo si la página tiene `[data-thread]`
  o el hilo trae `anchors`.

`nxToast` (el «Deshacer» del borrado) también va con `import("../toast/index")`.

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Thread", { tag: "nx-thread", props: ["record", "endpoint", "stream", "poll", "peopleSource", "refsSource", "refPatterns", "me", "anchors", "presence", "readonly", "disabled", "locale", "labels", "comments"] }],
```

Todas tienen propiedad (también `locale`, `peopleSource` y `refsSource`, que reflejan su atributo),
así que el adaptador puede asignarlas tal cual. `me`, `anchors`, `refPatterns`, `labels` y `comments`
aceptan el objeto o su JSON (como atributo).

En `URL_PROPS` conviene sumar `"peopleSource"` y `"refsSource"` (el agente no debe dejar que el modelo
elija a dónde se piden personas o registros). `endpoint` y `stream` ya están.

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo con lo que importa
estáticamente, `import()` fuera; cada chunk con todo lo que importa).

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/thread.js`: lista, redactor, acciones, red, borrador, presencia + núcleo (+ `atTime`/`relTime`/`stampText` de history y `cleanUser`/`hueOf`/`firstName` de presence) | **11,90 KB** (12 181 B) | 12 KB |
| Chunk `thread-pick-*.js` (sugerencias y tarjeta) con lo que importa | 2,71 KB (2 779 B) | 3 KB |
| Chunk `thread-live-*.js` (stream, reconexión, «escribiendo…») con lo que importa (incluye `readLines`) | 2,44 KB (2 502 B) | 2,75 KB |
| Chunk `thread-anchors-*.js` (campos y globitos) con lo que importa | 1,32 KB (1 355 B) | 1,5 KB |
| `dist/thread.css` | **2,06 KB** (2 109 B) | 2,25 KB |

**Por qué hay tres chunks:** con todo en la entrada eran 15,5 KB. Lo que se separó es lo que no toda
página usa: quien solo lee no escribe (sugerencias), sin `stream` no hay stream ni «escribiendo…», y
sin campos anclables no hay globitos. Para bajar de 12 KB también: `record`, `endpoint`, `stream`,
`peopleSource`, `refsSource`, `presence` y `locale` se definen en el prototipo con un bucle (reflejan
su atributo), y la entrada no usa `glyph()` (el ✓ de lo resuelto es CSS). El margen que queda es de
~100 B: lo siguiente que crezca debería ir a un chunk (el candidato natural es editar/borrar/resolver).

Para `scripts/size.mjs`:

```js
  ["dist/thread.js", 12 * 1024, "thread + núcleo (ESM; sugerencias, stream, anclas y nxToast con import())"],
  [lazy("thread-pick"), 3 * 1024, "sugerencias @/# y tarjeta de registros de nx-thread (al primer foco en la caja)"],
  [lazy("thread-live"), 2.75 * 1024, "stream y «escribiendo…» de nx-thread (solo con stream)"],
  [lazy("thread-anchors"), 1.5 * 1024, "campos anclables y globitos de nx-thread (solo si la página los tiene)"],
  // …
  ["dist/thread.css", 2.25 * 1024, "thread (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV`:

```ts
  { id: "thread", label: "Conversación", href: "#/thread", icon: "message-circle", section: "Componentes", badge: "Nuevo" },
```

`message-circle` no está en `src/icons/lucide.ts`: se suma en la lista de `scripts/gen-icons.mjs` y se
regenera (como `pen-line` con la firma). Si no, `users` sirve mientras tanto.

En `PAGES`: `"#/thread": { template: "page-thread", mount: mountThreadDemo },` con
`import { mountThreadDemo } from "./demo-thread";` e `import "./pages/thread.css";`. La plantilla está
en `gallery/pages/thread.html` para pegarla en `gallery/index.html`. `demo-thread.ts` importa
`thread.css` directamente (mientras `nx32-elements.css` no lo haga); esa línea sobra al unir.

La demo registra `/demo/thread/…` con `addDemoRoute` **al importarse** (el hilo pide sus comentarios
apenas se conecta, antes de que corra `mountThreadDemo`): `comentarios` (GET/POST/PATCH/DELETE y
`/typing`), `personas`, `referencias` y `stream` (NDJSON abierto). Botones: «En vivo» (Laura entra al
registro por el `<nx-presence>` de la cabecera y, cada ~20 s, escribe y comenta), «Fallar el próximo
envío» (503, para ver el reintento sin duplicar) y «Restaurar la conversación». La primera visita
siembra `nx-thread-seen:OC-2291:u7` en ayer a las 18:00 para que se vea la marca «Nuevos».

`test/thread.dom.test.ts` monta la plantilla con `mountThreadDemo` sobre `demoFetch` (sin navegador):
si se mueve la plantilla a `index.html`, esa prueba lee `gallery/pages/thread.html`; se puede dejar el
archivo o cambiar la prueba para leer la plantilla desde `index.html`.

## Solid

En `src/solid/index.tsx`: agregar `<Thread>` al comentario de cabecera, y

```tsx
import "../components/thread/index";
import type { NxThread } from "../components/thread/thread";
import type { ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadMentionDetail, ThreadPostDetail, ThreadRef, ThreadUser } from "../components/thread/types";

export type { NxThread, ThreadComment, ThreadErrorDetail, ThreadLabels, ThreadMentionDetail, ThreadPostDetail, ThreadRef, ThreadUser };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `me` ya existe (PresenceUser: la misma forma que ThreadUser). `labels`: sumar `Partial<ThreadLabels>`.
      anchors: string[] | undefined;
      refPatterns: string[] | undefined;
      comments: ThreadComment[] | undefined;
    }
    interface ExplicitAttributes {
      // `endpoint`, `stream` y `locale` ya existen. `record` existe como propiedad (objeto, de
      // nx-history): aquí va como atributo.
      record: string | undefined;
      poll: string | undefined;
      presence: string | undefined;
      "people-source": string | undefined;
      "refs-source": string | undefined;
    }
    // `readonly` y `disabled` ya están en ExplicitBoolAttributes.
    interface CustomEvents {
      "nx-thread-post": CustomEvent<ThreadPostDetail>;
      "nx-thread-change": CustomEvent<{ comments: ThreadComment[] }>;
      "nx-thread-mention": CustomEvent<ThreadMentionDetail>;
      "nx-thread-error": CustomEvent<ThreadErrorDetail>;
    }
    interface IntrinsicElements {
      "nx-thread": HTMLAttributes<NxThread>;
    }
```

El envoltorio:

```tsx
export interface ThreadProps extends Omit<JSX.HTMLAttributes<NxThread>, "onChange" | "onError"> {
  /** El registro («OC-2291»): de él cuelgan los comentarios, el borrador y lo leído. */
  record: string;
  /** `GET ?record=`, `POST`, `PATCH /{id}`, `DELETE /{id}`. Sin él, todo es local (`comments`). */
  endpoint?: string;
  /** SSE o NDJSON con los cambios en vivo. */
  stream?: string;
  /** Sin `stream`: segundos entre consultas (30; `0` no sondea). */
  poll?: number;
  peopleSource?: string;
  refsSource?: string;
  refPatterns?: string[];
  /** Quien escribe desde aquí. Sin él, solo se lee. */
  me?: ThreadUser | null;
  anchors?: string[];
  /** `id` del `<nx-presence>` del que se lee quién está viendo. */
  presence?: string;
  comments?: ThreadComment[];
  readonly?: boolean;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<ThreadLabels>;
  onPost?: (e: CustomEvent<ThreadPostDetail>) => void;
  onChange?: (e: CustomEvent<{ comments: ThreadComment[] }>) => void;
  onMention?: (e: CustomEvent<ThreadMentionDetail>) => void;
  onError?: (e: CustomEvent<ThreadErrorDetail>) => void;
}

export function Thread(props: ThreadProps): JSX.Element {
  const [local, rest] = splitProps(props, ["record", "endpoint", "stream", "poll", "peopleSource", "refsSource", "refPatterns", "me", "anchors", "presence", "comments", "readonly", "disabled", "locale", "labels", "onPost", "onChange", "onMention", "onError"]);
  return (
    <nx-thread
      {...rest}
      prop:me={local.me}
      prop:anchors={local.anchors}
      prop:refPatterns={local.refPatterns}
      prop:comments={local.comments}
      prop:labels={local.labels}
      attr:record={local.record}
      attr:endpoint={local.endpoint}
      attr:stream={local.stream}
      attr:poll={local.poll === undefined ? undefined : String(local.poll)}
      attr:people-source={local.peopleSource}
      attr:refs-source={local.refsSource}
      attr:presence={local.presence}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      on:nx-thread-post={(e) => local.onPost?.(e)}
      on:nx-thread-change={(e) => local.onChange?.(e)}
      on:nx-thread-mention={(e) => local.onMention?.(e)}
      on:nx-thread-error={(e) => local.onError?.(e)}
    />
  );
}
```

(`comments` como propiedad solo tiene sentido sin `endpoint`: con él, la lista la trae el componente.)

## README

````md
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
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/thread/index";`. Nombres revisados contra lo exportado
  hoy (`groupByDay`, `dayLabel` y `relTime` de history no se reexportan; aquí todo lleva `thread`):
  `NxThread`, `THREAD_LABELS`, `THREAD_MAX_TEXT`, `parseThreadText`, `threadPlainText`, `threadMentions`,
  `groupThreadByDay`, `threadDayLabel`, `threadRefPatterns`, `threadFirstUnread`, `threadAnchorCounts`,
  `threadRoot`, `threadPick`, `cleanThreadComment`, `cleanThreadComments`, `mergeThreadComments`,
  `encodeThreadDraft`, `decodeThreadDraft` y los tipos `Thread*`.
- `src/styles/nx32-elements.css` → `@import "../components/thread/thread.css";`
- `vite.config.ts` → `thread: "src/components/thread/index.ts",` (los tres chunks salen solos del `import()`).
- `scripts/build-css.mjs` → `"thread": "src/components/thread/thread.css",`
- `package.json` → `"./thread": { "types": "./dist/types/components/thread/index.d.ts", "import": "./dist/thread.js" }`
  y `"./thread.css": "./dist/thread.css"`. `sideEffects` ya cubre `./dist/*.js` y `index.ts`.
- `README.md` → la sección de arriba.

## Protocolo

Todo es JSON, del mismo origen (o de `allowOrigins`), con `credentials: "same-origin"`: el servidor
sabe quién es la persona por su sesión. `me` es solo para pintar lo propio al instante.

| Petición | Cuerpo | Respuesta |
|---|---|---|
| `GET {endpoint}?record=OC-2291` | — | `[comentario]` o `{comments: [comentario]}` |
| `POST {endpoint}` | `{record, text, anchor?, replyTo?, clientId}` | el comentario creado (con su `id` y el `clientId`) |
| `PATCH {endpoint}/{id}` | `{text}` o `{resolved: true \| false}` | el comentario (opcional: sin cuerpo se queda lo optimista) |
| `DELETE {endpoint}/{id}` | — | `204` (sale con `keepalive`: también cuando el hilo deja la página) |
| `POST {endpoint}/typing` | `{record, user}` | `204` (solo se manda con `stream`, como mucho cada 3 s) |
| `GET {stream}?record=OC-2291` | — | SSE o NDJSON: un evento por línea (abajo) |
| `GET {people-source}?q=lau` | — | `[{id, name, detail?, avatar?}]` o `{items}` |
| `GET {refs-source}?q=FV-18` | — | `[{id, label, detail?, href}]` o `{items}` |

**Comentario:** `{id, author: {id, name, avatar?}, text, at, editedAt?, anchor?, replyTo?, resolved?,
resolvedBy?, clientId?, refs?}`. `at`/`editedAt` en ISO 8601. `text` es texto plano con dos tokens:
`@[Laura Gómez](u12)` (mención) y `#[FV-1873](fv-1873)` (referencia). `resolvedBy`: el nombre, o
`{id, name}`. `refs` (opcional) trae `{id, label, detail?, href}` de los registros del texto, para que
sus fichas sean enlaces sin preguntar; si no viene, la ficha pregunta a `refs-source?q=<label>` al
enfocarla o señalarla. Lo que no cumpla la forma se descarta sin romper la lista.

**Reglas del servidor:**

- `clientId` es idempotente: un `POST` con un `clientId` que ya existe devuelve el comentario existente
  (el reintento de «No se envió» no duplica). El eco por el stream también debe llevar el `clientId`.
- Las respuestas heredan el ancla de su conversación: basta con `anchor` en el primer comentario
  (el componente manda `anchor` solo en los que no responden a nada). `resolved` va en ese primero.
- Editar y borrar: solo lo propio (el componente solo ofrece los botones en lo de `me`, pero la
  autorización es del servidor). Resolver: cualquiera que pueda comentar.
- Menciones: el servidor puede avisar por su lado al recibir el `POST`; el componente además emite
  `nx-thread-mention` con las personas mencionadas por primera vez (también al editar).

**Eventos del stream** (una línea cada uno; SSE con `data:` o NDJSON; `record` opcional: si viene y no
es el del hilo, se ignora):

```json
{"type": "comment", "comment": { … }}
{"type": "update", "comment": { … }}
{"type": "delete", "id": "c9"}
{"type": "typing", "user": {"id": "u12", "name": "Laura Gómez"}}
```

Si el stream se corta, el hilo vuelve a conectarse tras 1 s, 2 s, 4 s… (hasta 30 s; la espera vuelve a
1 s en cuanto llega algo) y, al volver, pide la lista otra vez para ponerse al día. Un comentario que
ya estaba (o su `clientId`) no se duplica.

### Un servidor mínimo (Node, sin dependencias)

```js
import { createServer } from "node:http";

const db = new Map(); // record → [comentario]
const streams = new Map(); // record → Set<res>
let seq = 0;
const who = (req) => ({ id: "u7", name: "Diego Llinás" }); // la persona de la sesión
const send = (res, status, body) => (res.writeHead(status, { "Content-Type": "application/json" }), res.end(body === undefined ? "" : JSON.stringify(body)));
const push = (record, ev) => { for (const res of streams.get(record) ?? []) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
const read = (req) => new Promise((ok) => { let s = ""; req.on("data", (c) => (s += c)).on("end", () => ok(s ? JSON.parse(s) : {})); });

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  const [, , id] = url.pathname.split("/").filter(Boolean); // /api/comentarios/:id
  const record = url.searchParams.get("record");
  if (url.pathname === "/api/comentarios/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store" });
    if (!streams.has(record)) streams.set(record, new Set());
    streams.get(record).add(res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    return req.on("close", () => (clearInterval(ping), streams.get(record).delete(res)));
  }
  if (!url.pathname.startsWith("/api/comentarios")) return send(res, 404);
  if (req.method === "GET") return send(res, 200, db.get(record) ?? []);
  const body = req.method === "DELETE" ? {} : await read(req);
  if (id === "typing") return push(body.record, { type: "typing", user: who(req) }), send(res, 204);
  if (req.method === "POST") {
    const list = db.get(body.record) ?? [];
    const again = list.find((c) => c.clientId === body.clientId);
    if (again) return send(res, 200, again);
    const c = { id: `c${++seq}`, author: who(req), text: String(body.text).slice(0, 10_000), at: new Date().toISOString(), anchor: body.anchor, replyTo: body.replyTo, clientId: body.clientId };
    db.set(body.record, [...list, c]);
    push(body.record, { type: "comment", comment: c });
    return send(res, 201, c);
  }
  for (const [rec, list] of db) {
    const c = list.find((x) => x.id === id);
    if (!c) continue;
    if (req.method === "DELETE") return db.set(rec, list.filter((x) => x !== c)), push(rec, { type: "delete", id }), send(res, 204);
    if (typeof body.text === "string") Object.assign(c, { text: body.text, editedAt: new Date().toISOString() });
    if (typeof body.resolved === "boolean") Object.assign(c, { resolved: body.resolved, resolvedBy: body.resolved ? who(req).name : undefined });
    push(rec, { type: "update", comment: c });
    return send(res, 200, c);
  }
  send(res, 404);
}).listen(8080);
```

(Para `people-source` y `refs-source`, cualquier búsqueda que devuelva la forma de arriba.)

## Decisiones

- **La caja sigue siendo `textbox`.** ARIA no admite `role="combobox"` en un `<textarea>` (axe lo marca):
  se usa el patrón del combobox sin el rol: `aria-autocomplete="list"`, `aria-controls` a la lista y
  `aria-activedescendant` a la opción resaltada; el foco nunca sale de la caja. Sin resultados no se
  muestra la lista (un `listbox` vacío no dice nada).
- **En la caja se ve `@Laura Gómez`, no el token.** El redactor guarda aparte lo elegido de la lista y
  al enviar lo convierte en `@[Laura Gómez](u12)` (solo palabras enteras, el nombre más largo primero).
  Escribir «@Laura» a mano no es una mención. Al editar, el texto vuelve a verse así (`decodeDraft`).
  Una referencia elegida se ve `#FV-1873`.
- **Los códigos conocidos** (`ref-patterns`) también se reconocen en el texto ya guardado: `OC-2291`
  sin `#` se pinta como ficha (con `id` = el código). Si su registro no se conoce, la ficha es un
  `<span tabindex="0">` y al enfocarla o señalarla se pregunta a `refs-source?q=OC-2291`; si trae `href`
  (seguro), pasa a enlace.
- **Patrones seguros:** hasta 8, de hasta 60 caracteres, compilados como `^(?:…)$` con `u`. Se descartan
  los que pueden explotar: grupos con `+`, `*` o `{n,}` (`(a+)+`, `(a|aa)+`), cuantificadores seguidos
  (`a**`), retroreferencias y lookaround. Además solo se prueban contra palabras de hasta 32
  caracteres, así que ni un patrón «polinómico» alcanza a tardar.
- **El globito no va dentro del `<label>`:** su nombre accesible se sumaría al del campo. Va después de
  un `<label for>` que no envuelve al campo («junto a su etiqueta»), o después del `<label>` que lo
  envuelve, o después del campo. La etiqueta del campo no cambia (los nodos del autor nunca se
  mueven). En la galería, la etiqueta y el globito van en una línea con `flex-wrap`. Sin comentarios
  abiertos, el globito queda tenue y dice «Comentar sobre Descuento».
- **Resolver solo lo anclado** (el primer comentario de una conversación con `anchor`). Las respuestas
  se pliegan con ella; «ver» la despliega con «Reabrir» y «Ocultar».
- **Sin `me` no hay redactor** (el comentario optimista necesita autor). `readonly`: sin redactor ni
  acciones (los globitos siguen filtrando). `disabled`: redactor apagado y sin acciones.
- **Sin `endpoint` todo es local:** `comments` como propiedad, y enviar/editar/borrar quedan
  confirmados al instante (la app escucha los eventos).
- **«Nuevos»:** se calcula una vez al cargar (`nx-thread-seen:{record}:{me.id}` en `localStorage`, el
  instante del comentario más nuevo) y se queda durante la visita. Sin visita anterior no hay marca
  (todo sería nuevo). Si el primer sin leer queda más atrás de los 50 que se pintan, se amplía hasta él
  (con tope de 500). Lo leído se actualiza solo con la pestaña visible.
- **Borrar:** sin confirmación, con `nxToast` y «Deshacer» (7 s). Si el hilo sale del DOM con un borrado
  pendiente, el `DELETE` sale ya (con `keepalive`) y el aviso se cierra. Un comentario que no se pudo
  enviar se descarta sin llamar al servidor.
- **Editar o resolver** es optimista; si el servidor no acepta, vuelve atrás, lo anuncia («No se guardó
  el cambio.») y emite `nx-thread-error`.
- **Ancla del redactor tras enviar:** si el hilo está filtrado a ese mismo campo, se queda (lo siguiente
  suele ser sobre él); si no, se quita.
- **Anuncios:** los comentarios nuevos de otras personas se agrupan en la región `status` (uno por
  segundo como mucho: «Nuevo comentario de Laura Gómez» o «3 comentarios nuevos»). «Escribiendo…» es una
  línea visible que no se anuncia.
- **Enter en el celular:** con `(hover: none) and (pointer: coarse)` Enter es salto de línea y se envía
  con el botón; la pista del teclado se esconde.
- **Presencia:** sin `presence`, el hilo escucha el primer `<nx-presence>` de la página. Lee su propiedad
  `users` y `nx-presence-change`; no cuenta a `me` ni a quien está inactivo.
- **Sin `nxSync`:** la cola sin conexión de `<nx-sync>` no se usa. Lo que no se envía queda como «No se
  envió · Reintentar» y el borrador vive en `sessionStorage`; traer `nxSync` (13 KB) para esto no
  compensaba.
- **Horas:** `relTime`/`stampText`/`atTime` de history (misma forma en toda la librería); el día, con
  `weekday: "short"` («lun 21 sept», sin «de»). Color del avatar: `hueOf` de presence, así una persona
  tiene el mismo color en la pila de presencia y en el hilo.
- **Poll:** `poll="0"` lo apaga; un valor inválido vuelve a 30; el mínimo es 5 s. Solo con la pestaña
  visible.

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el diseño (el hilo al lado del formulario, lo angosto,
  el modo oscuro, las 9 paletas), ni axe/contraste (`npm run contrast` no corrió), ni Playwright.
  El contraste de `--nx-text-tertiary` (horas, días) y de «Nuevos» en `--nx-danger` sobre la tarjeta se
  supone AA por los tokens, sin medir.
- La posición de la lista de sugerencias (encima de la caja) y de la tarjeta de un registro: happy-dom
  no tiene layout. La tarjeta se ubica con `getBoundingClientRect` relativo al hilo; puede salirse por
  la derecha si la ficha está al borde.
- El desplazamiento: al cargar, al fondo (o a «Nuevos»); con «Ver anteriores», conservar la posición;
  con uno nuevo, seguir al fondo solo si ya se estaba ahí. Las pruebas no miden `scrollTop`.
- Que el textarea crezca bien (`scrollHeight`) y el tope de 180 px.
- El globito junto a etiquetas reales de otros formularios (grid, flex en columna): depende del CSS
  del autor; en la galería se probó solo en happy-dom.
- El stream real por SSE del navegador (en las pruebas es un `ReadableStream` NDJSON) y la demo en vivo
  con tiempos reales (en las pruebas solo se verificó «Laura está viendo» y el envío).
- Lectores de pantalla: los nombres de los artículos (autor + hora), el anuncio agrupado y el patrón de
  la lista de sugerencias sobre un `textbox`.
