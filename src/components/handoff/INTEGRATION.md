# `<nx-handoff>`: integración

«Sigue en el celular». En el escritorio, «Usar el celular» muestra un QR; el teléfono lo abre, toma
la foto (o escanea, o firma) y el resultado aparece solo en el formulario. El mismo tag con
`side="phone"` es la página que abre el QR.

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Handoff", { tag: "nx-handoff", props: ["side", "endpoint", "for", "kind", "accept", "multiple", "context", "session", "token", "labels", "locale", "disabled"] }],
```

(`for` y `context` se asignan como propiedad: `el.for` refleja el atributo y `el.context` es el
objeto que viaja al servidor.)

## Peso

Medido con esbuild (min + gzip -9). La entrada se mide como `scripts/size.mjs`: un solo archivo
con los `import()` fuera.

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/handoff.js`: escritorio + QR + núcleo (`readLines`, `h`, `safeEndpoint`, `mergeLabels`) | **8,89 KB** (9 106 B); con `kind="signature"`, +43 B | 9,25 KB |
| Con el comando del brief (`--splitting`): solo `index.js`, sin los chunks compartidos que importa | 7,56 KB (7 738 B) | — |
| Chunk del celular (`handoff-phone-*.js`), se carga solo con `side="phone"`. `scripts/size.mjs` lo mide con el de escritorio que importa (lo que baja la página del celular) | **4,93 KB** solo; **11,95 KB** con el escritorio. Con `kind="signature"`: +0,39 KB (~12,35 KB) | 12,5 KB |
| `<nx-scan>` del celular (chunk `scan`, ya existente), solo con `kind="scan"` | 11,33 KB | — (el de scan) |
| `<nx-signature>` del celular (chunk `signature`), solo con `kind="signature"` | 6,88 KB | — (el de signature) |
| `dist/handoff.css` (los dos lados) | **1,42 KB** (1 453 B); con la pantalla completa de la firma, 1,48 KB | 1,75 KB |

El QR pesa ~2,3 KB de la entrada (las tablas de bloques van como cadenas: un tercio de lo que
pesaban como arreglos). Para caber en 9 KB: los textos del celular (`HANDOFF_PHONE_LABELS`) viven en
su chunk y los atributos de texto se reflejan con un solo `Object.defineProperty` en el prototipo.

Para `scripts/size.mjs`:

```js
  ["dist/handoff.js", 9.25 * 1024, "handoff + QR + núcleo (ESM; el lado celular y nx-scan con import())"],
  [lazy("handoff-phone"), 5.25 * 1024, "lado celular de nx-handoff (se carga con side=\"phone\")"],
  // …
  ["dist/handoff.css", 1.75 * 1024, "handoff (CSS)"],
```


## Nav

En `gallery/main.ts`, dentro de `NAV` (con los componentes nuevos):

```ts
  { id: "handoff", label: "Sigue en el celular", href: "#/handoff", icon: "smartphone", section: "Componentes", badge: "Nuevo" },
```

(Si `smartphone` no está entre los íconos registrados de la galería, `package` o `send` sirven.)

Y en `PAGES`: `"#/handoff": { template: "page-handoff", mount: mountHandoffDemo },` con
`import { mountHandoffDemo } from "./demo-handoff";` e `import "./pages/handoff.css";`. La plantilla
está en `gallery/pages/handoff.html` para pegarla en `gallery/index.html`. Las rutas de mentira las
registra `demo-handoff.ts` con `addDemoRoute("/demo/handoff", …)` al montar la página; además
envuelve `fetch` una vez para las fotos (`demoFetch` solo pasa cuerpos de texto y no responde
binario): guarda el `File` del `FormData` en memoria y lo sirve en `/demo/handoff/{id}/files/{key}`.

## Solid

En `src/solid/index.tsx`.

Comentario de cabecera: agregar `<Handoff>` a la lista de envoltorios. Imports y reexport:

```tsx
import "../components/handoff/index";
import type { NxHandoff } from "../components/handoff/handoff";
import type { HandoffDoneDetail, HandoffItemDetail, HandoffKind, HandoffLabels, HandoffPhoneLabels, HandoffSide, HandoffState } from "../components/handoff/types";

export type { NxHandoff, HandoffDoneDetail, HandoffItemDetail, HandoffKind, HandoffLabels, HandoffPhoneLabels, HandoffSide, HandoffState };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `labels`: agregar `| Partial<HandoffLabels & HandoffPhoneLabels>` a la unión.
      // `context: unknown` ya existe.
    }
    interface ExplicitAttributes {
      // `kind`: ampliar a `TrendKind | HandoffKind | undefined`.
      // `endpoint`, `for`, `locale` ya existen.
      side: HandoffSide | undefined;
      accept: string | undefined;
      session: string | undefined;
      token: string | undefined;
    }
    interface ExplicitBoolAttributes {
      // `disabled` y `multiple` ya existen.
    }
    interface CustomEvents {
      "nx-handoff-state": CustomEvent<{ state: HandoffState }>;
      "nx-handoff-item": CustomEvent<HandoffItemDetail>;
      "nx-handoff-done": CustomEvent<HandoffDoneDetail>;
      "nx-handoff-error": CustomEvent<{ message: string }>;
    }
    interface IntrinsicElements {
      "nx-handoff": HTMLAttributes<NxHandoff> & { endpoint?: string; for?: string };
    }
```

El envoltorio (al final del archivo):

```tsx
export interface HandoffProps extends JSX.HTMLAttributes<NxHandoff> {
  /** `desktop` (por defecto): botón, QR y escucha. `phone`: la página que abre el QR. */
  side?: HandoffSide;
  /** Base de las rutas de la sesión (`/api/handoff`). Mismo origen o uno de `allowOrigins()`. */
  endpoint: string;
  /** `id` del elemento que recibe: `<nx-doc-capture>`, `<nx-scan>`, `<nx-signature>`, `<input type=file>` o un campo de texto. */
  for?: string;
  /** `photo` (por defecto), `file`, `scan` o `signature`. */
  kind?: HandoffKind;
  accept?: string;
  multiple?: boolean;
  /** Viaja al servidor al crear la sesión (`{ doc: "OC-2291" }`). */
  context?: unknown;
  /** Lado celular: si no vienen, se leen de `?s=` y `?t=`. */
  session?: string;
  token?: string;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<HandoffLabels & HandoffPhoneLabels>;
  onState?: (e: CustomEvent<{ state: HandoffState }>) => void;
  /** Cancelable: con `preventDefault()` no se entrega al destino (la app se encarga). */
  onItem?: (e: CustomEvent<HandoffItemDetail>) => void;
  onDone?: (e: CustomEvent<HandoffDoneDetail>) => void;
  onError?: (e: CustomEvent<{ message: string }>) => void;
}

export function Handoff(props: HandoffProps): JSX.Element {
  const [local, rest] = splitProps(props, ["side", "endpoint", "for", "kind", "accept", "multiple", "context", "session", "token", "disabled", "locale", "labels", "onState", "onItem", "onDone", "onError"]);
  return (
    <nx-handoff
      {...rest}
      prop:context={local.context}
      prop:labels={local.labels}
      attr:side={local.side}
      attr:endpoint={local.endpoint}
      attr:for={local.for}
      attr:kind={local.kind}
      attr:accept={local.accept}
      attr:session={local.session}
      attr:token={local.token}
      attr:locale={local.locale}
      bool:multiple={!!local.multiple}
      bool:disabled={!!local.disabled}
      on:nx-handoff-state={(e) => local.onState?.(e)}
      on:nx-handoff-item={(e) => local.onItem?.(e)}
      on:nx-handoff-done={(e) => local.onDone?.(e)}
      on:nx-handoff-error={(e) => local.onError?.(e)}
    />
  );
}
```

## README

````md
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
  un código va a `add(código)` de `<nx-scan>` o a un campo de texto; un dato (una firma) va a
  `load(dato)` de `<nx-signature>`. Antes sale `nx-handoff-item`, cancelable: la app puede encargarse ella.
- **Celular** (`side="phone"`, se carga aparte): una columna, botones grandes. «Tomar foto» (cámara
  trasera) o «Elegir de la galería», miniaturas, quitar, y «Enviar al computador». Las fotos se reducen
  en el teléfono (2000 px, JPEG 0,85) y suben una por una con reintento. Con `kind="scan"`, un
  `<nx-scan>` en modo conteo manda cada código al leerlo; con `kind="signature"`, un `<nx-signature>`
  (a pantalla completa y en horizontal si el teléfono deja) manda la firma al confirmarla.
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
| Propiedades / atributos | `side` (`desktop`, `phone`), `endpoint`, `for`, `kind` (`photo`, `file`, `scan`, `signature`), `accept`, `multiple`, `context` (JSON), `session`, `token` (celular; si no, `?s=`/`?t=`), `labels`, `locale`, `disabled` · `state` (solo lectura: `idle`, `creating`, `waiting`, `connected`, `receiving`, `done`, `expired`, `error`) |
| Métodos | `start()`, `cancel()` |
| Eventos | `nx-handoff-state` `{state}`, `nx-handoff-item` `{item, file?}` (cancelable), `nx-handoff-done` `{items}`, `nx-handoff-error` `{message}` |
| Protocolo | `POST {endpoint}` → `{id, url, expiresIn, token}` · `GET …/{id}/events?after=` (SSE/NDJSON) · `GET …/{id}?after=` (polling) · `GET …/{id}?t=` (celular) · `POST …/{id}/items?t=` y `…/done?t=` · `DELETE …/{id}`. Detalle en `src/components/handoff/INTEGRATION.md` |
| Funciones | `qrMatrix(texto, {ecc?})` (matriz booleana; modo byte, L/M/Q/H, versiones 1–40, las 8 máscaras), `qrSvgPath(matriz)` (un solo `d` con las corridas fusionadas), `parseHandoffEvent()` |
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/handoff/index";` (los nombres no chocan:
  `qrMatrix`, `qrSvgPath`, `QrEcc`, `QrOptions`, `setHandoffFiles`, `handoffCountdown`,
  `handoffRetryDelay`, `parseHandoff*` son nuevos).
- `src/styles/nx32-elements.css` → `@import "../components/handoff/handoff.css";`
- `vite.config.ts` (entradas de la librería) → `handoff: "src/components/handoff/index.ts",`
- `scripts/build-css.mjs` → `"handoff": "src/components/handoff/handoff.css",`
- `package.json` → en `exports`:
  `"./handoff": { "types": "./dist/types/components/handoff/index.d.ts", "import": "./dist/handoff.js" }`
  y `"./handoff.css": "./dist/handoff.css"`. `sideEffects` ya cubre `./dist/*.js` (el chunk `handoff-phone-*`
  lleva hash) y `./src/components/*/index.ts`.

---

## Protocolo

Seis rutas bajo `endpoint` (aquí `/api/handoff`). Las del **escritorio** van con la sesión normal de
la app (cookie; el componente usa `credentials: "same-origin"`) y el servidor comprueba que la sesión
de handoff sea de ese usuario. Las del **celular** van con `?t={token}` y sin cookie de la app: el
token es la única credencial y solo sirve para *mandar* a esa sesión, nunca para leer nada.

| # | Ruta | Quién | Cuerpo | Respuesta |
|---|---|---|---|---|
| 1 | `POST /api/handoff` | escritorio | JSON `{kind, accept?, multiple?, context?}` | `200` `{id, url, expiresIn, token?}` (o `expiresAt`, ISO o epoch) |
| 2 | `GET /api/handoff/{id}/events?after={seq}` | escritorio | — | `text/event-stream` (`data: {…}`) o `application/x-ndjson` (una línea por evento) |
| 3 | `GET /api/handoff/{id}?after={seq}` | escritorio | — | `200` `{events: […]}` (polling de respaldo) |
| 3′ | `GET /api/handoff/{id}?t={token}` | celular | — | `200` `{kind, accept?, multiple?, title?, hint?, expiresIn?, askName?, askId?}` |
| 4 | `POST /api/handoff/{id}/items?t={token}` | celular | `multipart/form-data` (campo `file`, uno por petición), o JSON `{kind: "code", code, format?}` o `{kind: "data", data}` | `200` `{item}` |
| 5 | `POST /api/handoff/{id}/done?t={token}` | celular | — | `200` |
| 6 | `DELETE /api/handoff/{id}` | escritorio | — | `204` (no se espera: `keepalive`) |

La 3 y la 3′ son la misma ruta: con `t` es el celular; sin `t`, el polling del escritorio.

**Firmar (`kind: "signature"`):** el celular carga `<nx-signature>` y, al confirmar, manda en la 4 el
JSON `{kind: "data", data: {svg, meta}}` (el SVG de la firma y sus metadatos: fecha, nombre, cédula,
trazos, dispositivo) y luego la 5. El servidor lo reenvía tal cual como ítem
`{kind: "data", id, data}`; en el escritorio va a `load(data)` del destino (el `<nx-signature>`, que
calcula ahí la huella del documento). `askName`/`askId` en la 3′ hacen que el celular pida nombre y
cédula: `<nx-signature handoff>` los manda en el `context` de la 1 (`{askName, askId}`) para que el
servidor los devuelva. Conviene un tope al tamaño de `data` (una firma pesa 5–40 KB de SVG).

**`url`** (la página del celular) es del mismo origen que la app o de uno de `allowOrigins()`; si no,
el componente no muestra el QR (`nx-handoff-error`). Lleva solo el id y el token:
`https://erp.miapp.co/m/handoff?s={id}&t={token}`. Nada del `context` ni del usuario va en la URL.
Relativa también sirve: el QR lleva la absoluta.

**Eventos** (2 y 3), cada uno con `seq` (entero creciente por sesión):

| Evento | Cuándo |
|---|---|
| `{type: "connected", device?}` | El celular abrió el enlace (3′). `device`: «iPhone», o «iPhone de Diego» si la app sabe quién es. |
| `{type: "progress", received, total?}` | Opcional: cuántos van (si el celular o el servidor sabe el total). |
| `{type: "item", item}` | Llegó algo. `item`: `{kind: "file", id, name, type, size, url}`, `{kind: "code", id, code, format?}` o `{kind: "data", id, data}`. |
| `{type: "done"}` | El celular pulsó «Enviar» (y subió todo) o «Terminar». |
| `{type: "expired"}` | Venció o se canceló. |
| `{type: "error", message}` | Algo que la persona debe leer («La OC-2291 ya se cerró»): se muestra tal cual. |

- **Reconexión:** el componente reconecta con `?after={último seq}`; el servidor manda solo los
  posteriores (si los repite, el cliente descarta los `seq` ya vistos y los ítems con `id` ya vistos).
  Espera creciente 1 s, 2 s, 4 s… hasta 15 s (±20 %). Tras 3 fallos seguidos, o si la ruta 2 responde
  404/405/501, pasa a polling (3) cada 2 s.
- **Cierre:** tras `done`, `expired` o `error` el componente deja de leer; el servidor puede cerrar.
- **Mantener vivo:** un comentario SSE (`: ping`) o una línea vacía NDJSON cada ~20 s, y sin buffer en
  el proxy (`X-Accel-Buffering: no` en nginx; `Cache-Control: no-store`). Un proxy que acumula la
  respuesta hasta el final deja al escritorio esperando: ahí conviene responder 404 en la ruta 2 y
  vivir con el polling.

**Errores:**

| Código | Ruta | Qué hace el componente |
|---|---|---|
| 401/403 | 1 | Estado `error` con «Reintentar». |
| 404/405/501 | 2 | Pasa a polling. |
| 404/410 | 2, 3 | `expired`. |
| 401/403/404/410 | 3′, 4, 5 | El celular muestra «Este enlace venció o ya se usó» y no hace nada más. |
| 408/425/429/5xx, red | 4, 5 | Reintenta (3 intentos, 0,6 s → 1,2 s → …). |
| 400/409/413/415 | 4 | No reintenta: «No se pudo enviar factura.jpg», con «Enviar» para volver a intentar. |

**Vencimiento:** 5–10 min (`expiresIn`, en segundos, evita el desfase de reloj). El escritorio
muestra «Vence en 4:32» y, al llegar a cero, deja de escuchar y ofrece «Generar otro». «Recibir más»
reusa la sesión si le quedan más de 20 s.

**Un solo uso:** la primera 3′ **ata la sesión a ese teléfono** (una cookie propia de la sesión,
`HttpOnly`, `SameSite=Strict`, con `Path` en la sesión; o el id que prefieras). Desde otro equipo, 410.
`done` cierra una tanda, no la sesión: el mismo teléfono puede mandar más («Enviar más») hasta que
venza o el escritorio cancele. `DELETE` (6) la invalida para siempre.

**Límites sugeridos:** 15 MB por archivo (el celular reduce las fotos a ~0,5 MB), 50 ítems por
sesión, tipos según `accept` (415 si no), sesiones activas por usuario (p. ej. 5), y rate limit por
IP en 3′/4/5.

**Qué hace el servidor con los archivos:** los guarda **de paso** (memoria, disco temporal o un
bucket con vencimiento), atados a la sesión, y los sirve en la `url` del ítem solo al usuario dueño
(cookie de la app, mismo origen: el componente descarga con `credentials: "same-origin"`). Se borran
al vencer la sesión (o tras descargarlos). El archivo definitivo lo guarda la app por su camino de
siempre: llega al `<input type=file>` o a `<nx-doc-capture>` como si la persona lo hubiera elegido.

**Seguridad:**
- id y token aleatorios (≥ 128 bits), el token guardado como hash y comparado en tiempo constante.
- La página del celular con `Referrer-Policy: no-referrer` y `Cache-Control: no-store` (el token no
  se filtra a terceros ni queda en cachés).
- Las rutas del escritorio con la protección CSRF normal de la app (JSON + `SameSite`); las del
  celular no usan cookies de la app.

### Servidor mínimo (Hono, en memoria)

Corre en Node (`@hono/node-server`), Bun, Deno o Workers. `c.get("user")` lo pone el middleware de
autenticación de la app.

```ts
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";

type Ev = { seq: number; type: string; [k: string]: unknown };
type S = { id: string; token: string; user: string; kind: string; accept?: string; multiple?: boolean; context?: unknown; exp: number; phone?: string; closed?: boolean; events: Ev[]; files: Map<string, File>; wake: Set<() => void> };

const TTL = 10 * 60_000, MAX_FILE = 15 << 20, MAX_ITEMS = 50;
const sessions = new Map<string, S>();
const rnd = () => crypto.randomUUID().replaceAll("-", "");
const alive = (s?: S) => (s && !s.closed && Date.now() < s.exp ? s : undefined);
const emit = (s: S, ev: object) => (s.events.push({ ...ev, seq: s.events.length + 1 } as Ev), s.wake.forEach((w) => w()));
const device = (ua = "") => (/iPhone/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Celular");

const app = new Hono<{ Variables: { user: string } }>();
const mine = (c: any) => { const s = sessions.get(c.req.param("id")); return s?.user === c.get("user") ? s : undefined; };
// El celular: token correcto, sesión viva y (después de la primera vez) el mismo teléfono.
const phone = (c: any) => { const s = alive(sessions.get(c.req.param("id"))); return s && c.req.query("t") === s.token && (!s.phone || getCookie(c, `hd_${s.id}`) === s.phone) ? s : undefined; };

app.post("/api/handoff", async (c) => {
  const { kind = "photo", accept, multiple, context } = await c.req.json();
  const s: S = { id: rnd(), token: rnd(), user: c.get("user"), kind, accept, multiple, context, exp: Date.now() + TTL, events: [], files: new Map(), wake: new Set() };
  sessions.set(s.id, s);
  return c.json({ id: s.id, token: s.token, expiresIn: TTL / 1000, url: `/m/handoff?s=${s.id}&t=${s.token}` });
});

app.get("/api/handoff/:id/events", (c) => {
  const s = mine(c);
  if (!s) return c.body(null, 404);
  let after = Number(c.req.query("after") ?? 0);
  c.header("X-Accel-Buffering", "no");
  return streamSSE(c, async (out) => {
    while (!out.aborted) {
      for (const ev of s.events.filter((e) => e.seq > after)) await out.writeSSE({ data: JSON.stringify(ev) }), (after = ev.seq);
      if (!alive(s)) return void (await out.writeSSE({ data: '{"type":"expired"}' }));
      await new Promise<void>((r) => { const go = () => (s.wake.delete(go), r()); s.wake.add(go); setTimeout(go, 20_000); });
      await out.write(": ping\n\n");
    }
  });
});

app.get("/api/handoff/:id", (c) => {
  if (c.req.query("t") === undefined) {
    const s = alive(mine(c));
    return s ? c.json({ events: s.events.filter((e) => e.seq > Number(c.req.query("after") ?? 0)) }) : c.body(null, 410);
  }
  const s = phone(c);
  if (!s) return c.body(null, 410);
  if (!s.phone) {
    s.phone = rnd();
    setCookie(c, `hd_${s.id}`, s.phone, { httpOnly: true, secure: true, sameSite: "Strict", path: `/api/handoff/${s.id}` });
    emit(s, { type: "connected", device: device(c.req.header("user-agent")) });
  }
  c.header("Cache-Control", "no-store");
  const ask = s.kind === "signature" ? (s.context as { askName?: boolean; askId?: boolean } | undefined) : undefined;
  return c.json({ kind: s.kind, accept: s.accept, multiple: s.multiple, title: "Factura del proveedor", expiresIn: Math.round((s.exp - Date.now()) / 1000), askName: ask?.askName === true, askId: ask?.askId === true });
});

app.post("/api/handoff/:id/items", async (c) => {
  const s = phone(c);
  if (!s) return c.body(null, 410);
  if (s.events.filter((e) => e.type === "item").length >= MAX_ITEMS) return c.body(null, 409);
  let item;
  const json = c.req.header("content-type")?.startsWith("application/json") ? await c.req.json() : null;
  if (json?.kind === "data") {
    // Una firma (u otro dato): se reenvía tal cual, con tope de tamaño.
    if (json.data === undefined || JSON.stringify(json.data).length > 256_000) return c.body(null, 413);
    item = { kind: "data", id: rnd(), data: json.data };
  } else if (c.req.header("content-type")?.startsWith("multipart/")) {
    const { file } = await c.req.parseBody();
    if (!(file instanceof File)) return c.body(null, 400);
    if (file.size > MAX_FILE) return c.body(null, 413);
    const key = rnd();
    s.files.set(key, file);
    item = { kind: "file", id: key, name: file.name, type: file.type, size: file.size, url: `/api/handoff/${s.id}/files/${key}` };
  } else {
    const { code, format } = json ?? {};
    if (typeof code !== "string" || !code.trim() || code.length > 200) return c.body(null, 400);
    item = { kind: "code", id: rnd(), code: code.trim(), format };
  }
  emit(s, { type: "item", item });
  return c.json({ item });
});

app.post("/api/handoff/:id/done", (c) => { const s = phone(c); if (!s) return c.body(null, 410); emit(s, { type: "done" }); return c.json({}); });
app.delete("/api/handoff/:id", (c) => { const s = mine(c); if (s) (s.closed = true), s.wake.forEach((w) => w()); return c.body(null, 204); });
app.get("/api/handoff/:id/files/:key", (c) => {
  const f = mine(c)?.files.get(c.req.param("key"));
  return f ? new Response(f, { headers: { "Content-Type": f.type || "application/octet-stream", "Cache-Control": "no-store" } }) : c.body(null, 404);
});

// La página del celular: la misma app, sin sesión de usuario.
app.get("/m/handoff", (c) => {
  c.header("Referrer-Policy", "no-referrer");
  c.header("Cache-Control", "no-store");
  return c.html(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/nx32-elements.css"><script type="module" src="/handoff.js"></script><main style="padding:16px"><nx-handoff side="phone" endpoint="/api/handoff"></nx-handoff></main>`);
});

// Limpieza: las sesiones y sus archivos se van un minuto después de vencer.
setInterval(() => { for (const [id, s] of sessions) if (Date.now() > s.exp + 60_000) sessions.delete(id); }, 60_000);
```

(`accept` se valida igual que en el cliente —`image/*`, `.pdf`…— y responde 415; se omitió para que
el ejemplo quepa. En varias instancias, las sesiones y los eventos van a Redis o a la base, y el
`wake` a un pub/sub.)

---

## Decisiones

- **Panel en línea, no popover:** debajo del botón, en el flujo del formulario (sobrio, sin capa
  encima, sin trampas de foco). Al abrir se enfoca el panel (`tabindex=-1`, `role=group` con
  `aria-label`); Escape dentro del panel cancela; al terminar el foco pasa a «Recibir más» si estaba
  adentro. El estado es un solo `role="status"`; la cuenta regresiva no es región viva (no se anuncia
  cada segundo).
- **Botón propio (`.nx-ho__btn`), no `<nx-button>`:** arrastraría su JS y su CSS; con los tokens de la
  librería se ve igual de sobrio.
- **El QR siempre oscuro sobre claro** con variables propias (`--nx-handoff-qr-dark`/`-light`), no
  con `light-dark()`: un QR invertido en modo oscuro lo leen mal muchos teléfonos.
- **Sesión y token del celular:** atributos `session`/`token`, o `?s=`/`?t=` de la página (también
  `?session=`/`?token=`). Así la página del celular es HTML estático con un solo tag.
- **`done` no mata la sesión:** cierra una tanda; «Recibir más» (escritorio) y «Enviar más» (celular)
  siguen en la misma hasta que venza. El «un solo uso» es por teléfono (la primera apertura la ata).
- **Deduplicación:** por `seq` (eventos) y por `item.id` (ítems). Sin ellos, un servidor que repite el
  historial al reconectar entregaría dos veces.
- **Textos del celular aparte** (`HANDOFF_PHONE_LABELS` en `handoff-phone.ts`, tipo `HandoffPhoneLabels`): el
  mismo atributo `labels` sirve para los dos lados, pero sus valores por defecto no pesan en el
  escritorio. `HANDOFF_LABELS` (escritorio) sí se exporta desde el índice.
- **El resumen** es «2 fotos desde el celular» (y no «2 fotos recibidas…»): evita la concordancia de
  género entre fotos/archivos/códigos con una sola plantilla (`received: "{what} desde el celular"`).
- **Copiar enlace:** `navigator.clipboard` y, si no hay (una intranet en `http://`), `execCommand`.
- **`side` se lee al conectarse:** cambiarlo con el elemento en la página no lo rehace (sacarlo y
  volverlo a poner sí). Si el escritorio se saca y se vuelve a poner con la sesión viva, retoma la
  escucha.
- **Entrega a un `<input type=file>`:** con `multiple`, se acumulan; sin él, reemplaza. Sin
  `DataTransfer` (Safari < 14.1) queda una `FileList` de mentira que el JS de la app lee, pero un
  envío nativo del formulario no la ve. A un campo de texto se escribe con el *setter* nativo (React y
  compañía ven el cambio).
- **Fotos:** se reducen solo si pasan de 2000 px (y solo si el resultado pesa menos); un PNG con
  transparencia queda sobre blanco. `createImageBitmap(file, {imageOrientation: "from-image"})`
  respeta la orientación EXIF. Un HEIC que el navegador no decodifica va tal cual.
- **Descargas:** 3 intentos por archivo; si fallan, `nx-handoff-error` y se sigue con los demás.
- **`kind="signature"`** (lo agregó `<nx-signature>`): el celular carga `<nx-signature>` con `import()`
  (chunk aparte: la entrada de escritorio solo sumó el tipo, dos textos y la entrega a `load()`, +43 B),
  la zona de firma toma el alto de la pantalla, y «Firmar en pantalla completa» solo aparece con
  puntero táctil y Fullscreen API (pide `landscape`; si no se puede, se firma en vertical). La firma
  se manda al confirmarla y, sin red, «Reintentar» manda la misma (no hay que volver a firmar). Un
  ítem `data` se entrega a `load()` de cualquier destino que lo tenga.

## Verificación del QR

- **Contra libqrencode 4.1.1** (`qrencode` de la máquina): las 160 combinaciones versión × nivel,
  llenas hasta la capacidad, y 182 textos más (1 a 1 675 bytes, con tildes y emoji), forzando la
  misma máscara que eligió libqrencode: **matrices idénticas bit a bit**. Las 160 capacidades también
  coinciden. (La elección de máscara difiere en ~1/3 de los casos: libqrencode no sigue al pie de la
  letra N3/N4; aquí la penalización coincide con una implementación de referencia de la norma escrita
  aparte en la prueba.)
- **Con un lector real (OpenCV 4.11, `QRCodeDetector` y `QRCodeDetectorAruco`):** 441 imágenes
  (versiones 1–30, los cuatro niveles, las 8 máscaras en un quinto de los casos) decodificadas al
  texto exacto. El detector base, a una sola escala, lee 127 de 145 de las nuestras y 126 de 145 de
  las que genera libqrencode para los mismos textos: es el detector, no el símbolo (las que no lee a
  esa escala las lee a otra o con el detector Aruco).
- **En `test/qr.test.ts`:** polinomios generadores y codewords de «01234567» y «HELLO WORLD» 1-M, los
  32 formatos, bits de versión, las 160 capacidades, centros de alineación, y un decodificador
  mínimo propio (formato, versión, desenmascarado, zigzag, desintercalado, síndrome RS = 0, texto) con
  ida y vuelta de 1 a 300 bytes en los cuatro niveles y las 8 máscaras.
- Un error que encontró la prueba de capacidades: la tabla tenía 80 bloques para 40-H (son 81).

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el QR en pantalla leído por un teléfono real, ni el
  diseño (panel, celular simulado, modo oscuro), ni axe/contraste, ni Playwright.
- `createImageBitmap`/`OffscreenCanvas`/`toBlob` (la reducción de fotos) no existen en happy-dom: la
  prueba cubre el camino «se envía tal cual»; la reducción real no se ejecutó.
- `capture="environment"` abriendo la cámara trasera en Android/iOS; el selector de la galería.
- `navigator.clipboard` y `execCommand("copy")` reales.
- El stream SSE real a través de un proxy (buffering) y la reconexión contra un servidor real; el
  ejemplo de Hono no se ejecutó (es ilustrativo).
- La página de la galería no está enlazada (falta `gallery/main.ts`/`index.html`, ver «Nav»).
