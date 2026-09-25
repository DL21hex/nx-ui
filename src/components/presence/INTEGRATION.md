# `<nx-presence>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Presence", { tag: "nx-presence", props: ["me", "channel", "source", "for", "idle", "max", "labels"] }],
```

Todas son propiedades del elemento (`channel`, `source`, `for`, `idle` y `max` reflejan su
atributo). `users` es de solo lectura y no va en la lista. Lo típico desde un backend:
`{component: "Presence", props: {me: {...}, source: "/compras/oc-2291/presencia", for: "orden"}}`.

## Peso

Medido con los comandos del brief (esbuild, minificado + gzip -9):

| Pieza | Medido | Límite propuesto |
|---|---|---|
| `src/components/presence/index.ts` (componente + núcleo: define, dom, icons, locale) | 7 216 B (≈ 7,05 KB) | `7.5 * 1024` |
| `src/components/presence/presence.css` | 2 003 B (≈ 1,96 KB) | `2.25 * 1024` |

Para `scripts/size.mjs`:

```js
  ["dist/presence.js", 7.5 * 1024, "presence + núcleo (ESM)"],
  ["dist/presence.css", 2.25 * 1024, "presence (CSS)"],
```

Y para que existan esos archivos, como con survey: `presence: "src/components/presence/index.ts"`
en las entradas de `vite.config.ts` (build de la librería), `presence: "src/components/presence/presence.css"`
en `scripts/build-css.mjs`, `@import "../components/presence/presence.css";` en
`src/styles/nx-ui.css`, y en `package.json` las entradas `"./presence"` (types + import, como
`./survey`) y `"./presence.css": "./dist/presence.css"` en `exports`.

## Nav

En `gallery/main.ts`:

```ts
  { id: "presence", label: "Presencia", href: "#/presence", icon: "users", section: "Componentes", badge: "Nuevo" },
```

y en `PAGES`, con `import { mountPresenceDemo } from "./demo-presence";`:

```ts
  "#/presence": { template: "page-presence", mount: mountPresenceDemo },
```

La plantilla está en `gallery/pages/presence.html` (va dentro de `gallery/index.html`, con las
demás). El CSS de la demo (`gallery/pages/presence.css`) lo importa `gallery/demo-presence.ts`;
el del componente llega con `src/styles/nx-ui.css` (ver «Peso»). La demo no usa `demo-api.ts`:
todo va por `BroadcastChannel` y `push()`.

## Solid

En `src/solid/index.tsx`:

```tsx
import "../components/presence/index";
import type { NxPresence } from "../components/presence/presence";
import type { PresenceEvent, PresenceLabels, PresenceState, PresenceUser } from "../components/presence/types";

export type { NxPresence, PresenceEvent, PresenceLabels, PresenceState, PresenceUser };

export interface PresenceProps extends Omit<JSX.HTMLAttributes<NxPresence>, "onChange"> {
  /** La persona actual `{id, name, avatar?}`. Sin ella, solo escucha. */
  me?: PresenceUser | null;
  /** Canal entre pestañas del mismo navegador (`BroadcastChannel`). */
  channel?: string;
  /** URL de un `EventSource` (SSE) con los eventos de los demás. */
  source?: string;
  /** `id` del formulario cuyos campos se comparten. */
  for?: string;
  /** Milisegundos sin actividad para «inactivo» (120000). */
  idle?: number;
  /** Círculos en la pila, contando «+N» (4). */
  max?: number;
  locale?: string;
  labels?: Partial<PresenceLabels>;
  /** Quiénes están, cada vez que algo cambia. */
  onChange?: (e: CustomEvent<{ users: PresenceState[] }>) => void;
  /** Lo que hace la persona actual: aquí se manda al servidor. */
  onLocal?: (e: CustomEvent<PresenceEvent>) => void;
}

export function Presence(props: PresenceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["me", "channel", "source", "for", "idle", "max", "locale", "labels", "onChange", "onLocal"]);
  return (
    <nx-presence
      {...rest}
      prop:me={local.me}
      prop:labels={local.labels}
      attr:channel={local.channel}
      attr:source={local.source}
      attr:for={local.for}
      attr:idle={local.idle === undefined ? undefined : String(local.idle)}
      attr:max={local.max === undefined ? undefined : String(local.max)}
      attr:locale={local.locale}
      on:nx-presence-change={(e) => local.onChange?.(e)}
      on:nx-presence-local={(e) => local.onLocal?.(e)}
    />
  );
}
```

Para quien usa el elemento con `ref`: `el.push(evento)` recibe los eventos de un transporte propio.

En `declare module "solid-js"`:

- `ExplicitProperties`: agregar
  ```ts
  me: PresenceUser | null | undefined;
  ```
  y ampliar `labels: … | Partial<PresenceLabels> | undefined;`.
- `ExplicitAttributes`: agregar
  ```ts
  channel: string | undefined;
  idle: string | undefined;
  ```
  (`source`, `for`, `max` y `locale` ya están).
- `ExplicitBoolAttributes`: nada.
- `CustomEvents`:
  ```ts
  "nx-presence-change": CustomEvent<{ users: PresenceState[] }>;
  "nx-presence-local": CustomEvent<PresenceEvent>;
  ```
- `IntrinsicElements`:
  ```ts
  "nx-presence": HTMLAttributes<NxPresence> & { channel?: string; source?: string; for?: string };
  ```

Y en el comentario de cabecera, `<Presence>` en la lista de envoltorios.

## README

````md
## `<nx-presence>`

Quién más está aquí, en vivo: los avatares de quienes tienen abierto el mismo registro, en qué
campo está cada quien y quién escribe, sin depender de ningún backend.

- **Pila de avatares** sin la persona actual (`me`): color estable por persona (sale de su `id`,
  igual en todas las pestañas), foto (`avatar`, si pasa `safeHref()`) o iniciales, punto verde si
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
  manda a su servidor.
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
````

## A11y

Para `e2e/a11y.spec.ts`:

```ts
test("presencia: la pila, los campos marcados, el aviso de bloqueo y la lista", async ({ page }) => {
  await open(page, "#/presence");
  const p = page.locator("#presence-demo");
  await audit(page, ["#presence-demo", ".prs"]);
  await page.locator("#presence-sim").click();
  await expect(page.locator(".nx-presence__mark", { hasText: "está escribiendo…" })).toBeVisible({ timeout: 5000 });
  await page.locator("#presence-form [name=monto]").focus();
  await expect(page.getByRole("alert")).toContainText("está editando este campo");
  await audit(page, ["#presence-demo", ".prs", ".nx-presence__layer"]);
  await p.getByRole("button", { name: "Ver quién está aquí" }).click();
  await expect(p.locator(".nx-presence__pop .nx-presence__row")).toHaveCount(3);
  await page.waitForTimeout(250);
  await audit(page, ["#presence-demo"]);
});
```

(Lo corrí en claro y en oscuro: cero violaciones serias o críticas.)

## Seguridad y robustez

- **La identidad de un evento no se verifica:** `user` viene dentro del mensaje, así que cualquiera
  que pueda escribir en el transporte puede hacerse pasar por otra persona (mandar su `leave`,
  «bloquear» un campo a su nombre). `BroadcastChannel` es solo del mismo origen; con SSE o un
  transporte propio, **el servidor debe sellar `user` con la sesión de quien envía** (no reenviar el
  que manda el cliente) y descartar lo que no pase. El componente solo muestra; no toma decisiones
  de permisos con estos datos.
- El avatar de otra persona solo se pinta si es `https:` o del mismo origen (`safeImageSrc()`), con
  `referrerpolicy="no-referrer"`: un `http:` o una ruta cualquiera la cargaría el navegador de todos
  los que miran (rastreo, o un GET con cookies a la propia app).
- `source` (SSE) solo del mismo origen o de uno de `allowOrigins()`.
- Una clave de campo remota se limpia de caracteres de control y se escapa como cadena CSS: un
  salto de línea hacía lanzar a `querySelector` en cada pintado mientras esa persona siguiera ahí.

## Notas

- **No toqué `src/core/`.**
- **`src/index.ts`:** `export * from "./components/presence/index";` (o la lista explícita:
  `NxPresence`, `PRESENCE_LABELS`, `PRESENCE_HEARTBEAT_MS`, `PRESENCE_TIMEOUT_MS`,
  `applyPresenceEvent`, `cleanPresenceEvent`, `presenceHue`, `summarizePresence` y los tipos
  `Presence*`). Los nombres no chocan con los existentes.
- **La capa de los campos** (contornos, etiquetas y el aviso) va en un `<div class="nx-presence__layer">`
  que el componente agrega a `document.body` (posición fija, `z-index: 60`, sin eventos de
  puntero salvo el aviso) y quita al desconectarse. Así no se toca el DOM ni los estilos del
  formulario de la app, y funciona con cualquier framework. Se reposiciona con scroll, resize y
  un `ResizeObserver` sobre el contenedor de `for`.
- **El aviso de bloqueo** tiene `role="alert"` (se anuncia al aparecer). Su botón está al final
  del orden de tabulación (en la capa); por teclado, <kbd>Esc</kbd> en el campo lo descarta, que
  es lo mismo que «Seguir de todas formas». Un aviso descartado no vuelve por esa persona en ese
  campo hasta que ella lo suelte y lo retome.
- **Latido e inactividad:** a una persona inactiva se le da 150 s antes de sacarla (en vez de
  45 s): Chrome alinea los temporizadores de una pestaña oculta a un minuto y sus latidos llegan
  tarde sin que se haya ido. Al cerrar o navegar (`pagehide`) el componente manda `leave` y ya no
  manda nada más (el `visibilitychange` que sigue la haría volver); si la página vuelve del
  bfcache (`pageshow` con `persisted`), entra de nuevo.
- **Quien llega** recibe un latido de cada quien ya presente (se responde a `join` y a cualquier
  evento de alguien desconocido), así ve a todos en el acto y no a los 15 s.
- **La prueba e2e** usa dos páginas del mismo contexto de Playwright (BroadcastChannel funciona
  entre ellas) y cierra la segunda con `page.close({ runBeforeUnload: true })`: el `close()` por
  defecto de Playwright no corre `pagehide`, un cierre de pestaña real sí.
- **La demo** elige un nombre al azar por pestaña; si al llegar ya hay alguien con ese nombre, a
  los 1,2 s toma otro libre (cambiar `me` sale con el anterior y entra con el nuevo). Además
  comparte los valores del formulario entre pestañas por un canal suyo
  (`nx-presence-demo:oc-2291`), para que se vea por qué importa el aviso.
- `npx tsc --noEmit -p .` solo da los 4 errores que ya había en `examples/solid/main.tsx` (no
  encuentra `nx-ui` sin un `dist/` construido).
