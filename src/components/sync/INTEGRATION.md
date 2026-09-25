# `<nx-sync>` y `nxSync`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Sync", { tag: "nx-sync", props: ["ping", "fields", "labels"] }],
```

(`nxSync.enqueue()` es la API de JavaScript de la app; el nodo BDUI solo pinta el estado de la cola
de la página.)

## Peso

Medido con los comandos del brief (esbuild, minificado + gzip -9):

| Pieza | Medido | Límite propuesto |
|---|---|---|
| `src/components/sync/index.ts` (cola + elemento + núcleo) | 10 250 B (10,0 KB) | `["dist/sync.js", 10.5 * 1024, "sync: cola sin conexión + píldora + comparador (ESM)"]` |
| `src/components/sync/sync.css` | 2 735 B (2,67 KB) | `["dist/sync.css", 3 * 1024, "sync (CSS)"]` |

Pasa del objetivo de 9 KB: son dos piezas en una. La cola sola (`nxSync`: IndexedDB, esperas con
jitter, `Retry-After`, `ping`, idempotencia, grupos, conflictos) pesa 3,2 KB; el elemento (píldora,
panel con cuenta regresiva, comparador campo por campo y editor JSON) el resto. No usa `nxFormat`
(solo `resolveLocale` + `Intl`) para ahorrar ~0,6 KB.

Además, como con los demás: `sync: "src/components/sync/index.ts"` en las entradas de
`vite.config.ts` (build de la librería), `"./sync"` en `exports` de `package.json` (la demo y el
README importan `nxSync` desde `nx-ui/sync`), y `sync: "src/components/sync/sync.css"` en
`scripts/build-css.mjs`.

## Nav

En `gallery/main.ts`:

```ts
  { id: "sync", label: "Sin conexión", href: "#/sync", icon: "truck", section: "Componentes", badge: "Nuevo" },
```

y en `PAGES`, con `import { mountSyncDemo } from "./demo-sync";` y `import "./pages/sync.css";`:

```ts
  "#/sync": { template: "page-sync", mount: mountSyncDemo },
```

La plantilla está en `gallery/pages/sync.html` (va en `gallery/index.html`, con las demás páginas).
El backend de mentira lo registra `gallery/demo-sync.ts` con `addDemoRoute("/demo/sync", …)` al
importarse; no hay que tocar `demo-api.ts`.

## Solid

En `src/solid/index.tsx`:

```tsx
import "../components/sync/index";
import type { NxSync } from "../components/sync/sync";
import type { SyncChangeDetail, SyncField, SyncLabels, SyncOp } from "../components/sync/types";

export type { NxSync, SyncChangeDetail, SyncField, SyncLabels, SyncOp };
export { nxSync } from "../components/sync/logic";

export interface SyncProps extends Omit<JSX.HTMLAttributes<NxSync>, "onChange"> {
  /** URL que responde rápido para comprobar que hay conexión de verdad (ajusta la cola de la página). */
  ping?: string;
  /** Nombres de los campos para el comparador: `[{key: "productos.*.cantidad", label: "Cantidad · {nombre}"}]`. */
  fields?: SyncField[];
  locale?: string;
  labels?: Partial<SyncLabels>;
  /** `{online, pending, conflicts}` cada vez que cambia algo de eso. */
  onChange?: (e: CustomEvent<SyncChangeDetail>) => void;
  /** Una operación llegó al servidor: `{op, data}` con la respuesta. */
  onDone?: (e: CustomEvent<{ op: SyncOp; data: unknown }>) => void;
}

export function Sync(props: SyncProps): JSX.Element {
  const [local, rest] = splitProps(props, ["ping", "fields", "locale", "labels", "onChange", "onDone"]);
  return (
    <nx-sync
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:ping={local.ping}
      attr:locale={local.locale}
      on:nx-sync-change={(e) => local.onChange?.(e)}
      on:nx-sync-done={(e) => local.onDone?.(e)}
    />
  );
}
```

En `declare module "solid-js"`:

- `ExplicitProperties`: ampliar los que ya existen:
  `fields: SelectField[] | HistoryField[] | SyncField[] | undefined;` y
  `labels: … | Partial<SyncLabels> | undefined;`.
- `ExplicitAttributes`: agregar `ping: string | undefined;` (`locale` ya está).
- `ExplicitBoolAttributes`: nada.
- `CustomEvents`:
  ```ts
  "nx-sync-change": CustomEvent<SyncChangeDetail>;
  "nx-sync-done": CustomEvent<{ op: SyncOp; data: unknown }>;
  ```
- `IntrinsicElements`:
  ```ts
  "nx-sync": HTMLAttributes<NxSync> & { ping?: string };
  ```

Y en el comentario de cabecera, `<Sync>` en la lista de envoltorios.

## README

````md
## `<nx-sync>` y `nxSync`

Trabajar sin conexión, y que nada se pierda: para vendedores en ruta, bodegas y plantas con señal
intermitente.

- **La cola (`nxSync`)** guarda cada escritura en IndexedDB (en memoria si no hay) antes de
  intentar nada, y la envía cuando hay conexión, **en orden**, de a una. Cerrar la pestaña o
  recargar no la pierde: lo que iba en camino vuelve a la fila.
- **Reintentos** sin respuesta, 5xx, 429 o 408: toda la cola espera 1 s, 2 s, 4 s… (tope 60 s, ±20 %
  al azar), o lo que diga `Retry-After` (segundos o fecha).
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
| `nxSync` | `enqueue({id?, method, url, body?, label, group?})` → la operación guardada · `pending()` · `retry(id, body?)` · `resolve(id, body)` · `discard(id)` · `flush()` · `check()` · `clear()` · `subscribe(fn)` → dejar de escuchar (`fn(state, event)`) · `state` `{online, ops, pending, conflicts, failed, progress}` · `configure({ping, base, max, timeout, headers})` · `createSync()` para otra cola |
| Propiedades / atributos | `ping`, `fields` (`[{key, label}]`, con `*` y `{hermano}`), `labels`, `locale` · `online`, `pending`, `conflicts`, `state`, `open` |
| Métodos | `show()`, `hide()`, `toggle()`, `resolve(id)` |
| Eventos | `nx-sync-change` `{online, pending, conflicts}`, `nx-sync-done` `{op, data}` |
| Protocolo | cada envío con `Idempotency-Key`, `Content-Type: application/json` e `If-Match` al resolver · 409 `{server, local?, fields?, etag?, message?}` · otro 4xx `{message}` · `GET ping`: cualquier respuesta es conexión |
````

## A11y

Para `e2e/a11y.spec.ts` (espera a que terminen las animaciones de entrada, que pasan por opacidad,
antes de cada auditoría):

```ts
test("sin conexión: la píldora en cada estado, el panel, el comparador y el editor", async ({ page }) => {
  const settle = () => page.waitForFunction(() => document.getAnimations().every((a) => a.effect?.getTiming().iterations === Infinity || a.playState !== "running"));
  await open(page, "#/sync");
  const sync = page.locator("#sync-demo");
  const pill = sync.locator(".nx-sync__pill");
  await page.getByRole("switch", { name: /Red inestable/ }).click();
  await expect(pill).toHaveText("En línea");
  await audit(page, ["#sync-demo"]);
  await page.getByRole("switch", { name: /Simular sin conexión/ }).click();
  await page.getByRole("switch", { name: /responde con conflicto/ }).click();
  await page.getByRole("button", { name: "Tomar pedido" }).click();
  await expect(pill).toHaveText("Sin conexión · 1 pendiente");
  await pill.click();
  await settle();
  await audit(page, ["#sync-demo"]);
  await page.keyboard.press("Escape");
  await page.getByRole("switch", { name: /Simular sin conexión/ }).click();
  await expect(pill).toHaveText("1 conflicto");
  await settle();
  await audit(page, ["#sync-demo"]);
  await pill.click();
  await page.getByRole("button", { name: /^Resolver · / }).click();
  await page.getByRole("radio", { name: /Del servidor/ }).first().focus();
  await settle();
  await audit(page, ["#sync-demo"]);
  await page.getByRole("button", { name: "Enviar versión resuelta" }).click();
  await expect(pill).toHaveText("En línea");
  await page.keyboard.press("Escape");
  await page.getByRole("switch", { name: /responde con conflicto/ }).click();
  await page.locator('[name="cliente"]').selectOption({ label: "Tienda Doña Carmen · La Victoria" });
  await page.getByRole("spinbutton", { name: "Cantidad de Arroz blanco 500 g" }).fill("90");
  await page.getByRole("button", { name: "Tomar pedido" }).click();
  await expect(pill).toHaveText(/no se pudo enviar/);
  await pill.click();
  await page.getByRole("button", { name: /^Corregir · / }).click();
  await page.getByRole("textbox", { name: "Datos (JSON)" }).fill("{");
  await settle();
  await audit(page, ["#sync-demo"]);
});
```

(Lo corrí en claro y en oscuro, cuatro veces cada uno: cero violaciones serias o críticas.)

## Notas

- No toqué `src/core/`.
- CSS: agregar `@import "../components/sync/sync.css";` a `src/styles/nx-ui.css`.
- `src/index.ts`: `export * from "./components/sync/index";` (o la lista explícita). Exporta
  `NxSync` (la clase), `SYNC_LABELS`, `nxSync` (la cola de la página), `createSync`,
  `syncMemoryStore`, `syncIdbStore`, `syncBackoff`, `syncRetryAfter`, `classifySyncResponse`,
  `syncDiffFields`, `syncResolveBody` y los tipos `Sync*` (`SyncQueue` es el tipo de la cola).
- `nxSync` es un singleton por página (IndexedDB «nx-sync», almacén `ops`). No toca el navegador al
  importarse (SSR seguro): abre la base y escucha `online`/`offline` en el primer uso
  (`subscribe`, `enqueue`…). Varias `<nx-sync>` en la página muestran la misma cola; el atributo
  `ping` de cualquiera ajusta la cola.
- La demo: la API de demostración (`demo-api.ts`) solo modela estado y tipo de contenido, así que
  `gallery/demo-sync.ts` envuelve `fetch` para `/demo/sync/*` y ahí pasa `Idempotency-Key` e
  `If-Match` al manejador, agrega `Retry-After` a la respuesta y simula la red caída
  («Simular sin conexión»: `TypeError` como un `fetch` real sin red). `context.setOffline()` de
  Playwright funciona sin eso (la cola ve `navigator.onLine` y los eventos).
- La demo tiene tres casos fijos: Minimercado El Progreso choca una vez con televentas (409), Tienda
  Doña Carmen tiene cupo de $ 250.000 (422), y «Red inestable» (encendida al entrar) da 503 con
  `Retry-After` (18 %) y respuestas perdidas tras guardar (12 %), para ver la idempotencia. Las
  pruebas e2e la apagan.
- Varias pestañas con la misma cola podrían enviar la misma operación a la vez; la
  `Idempotency-Key` evita el duplicado en un servidor que la respete. Un candado entre pestañas
  (Web Locks) quedaría para después.
- Claves con punto dentro de un cuerpo (`{"a.b": 1}`) se confunden con rutas en el comparador.
- `npx tsc --noEmit -p .` solo da los errores que ya había en `examples/solid/main.tsx`.
