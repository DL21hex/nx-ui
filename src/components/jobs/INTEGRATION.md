# `<nx-jobs>`: integración

Trabajos largos que sobreviven a recargar (importar 10.000 filas, cerrar el mes, generar 500 facturas):
una píldora discreta con el avance agregado y un panel con cada trabajo (etapa, barra, tiempo restante,
quién y cuándo, cancelar con confirmación, reintentar, descargar, ver errores, quitar). Una sola conexión
(SSE/NDJSON o sondeo) abierta solo mientras hay trabajos en curso, compartida entre pestañas.

Archivos: `jobs.ts` (entrada: píldora, red, pestañas, estado, avisos), `jobs-panel.ts` (el contenido
del panel, con `import()`), `logic.ts` (puro), `types.ts`, `jobs.css`. `nxToast` va con
`import("../toast/index")` (solo al terminar un trabajo con el panel cerrado).

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Jobs", { tag: "nx-jobs", props: ["endpoint", "stream", "poll", "notify", "always", "recent", "locale", "labels", "disabled"] }],
```

Todas tienen propiedad (las de texto y las booleanas reflejan su atributo), así que el adaptador las
puede asignar tal cual; `labels` acepta el objeto o su JSON. `endpoint` y `stream` ya están en `URL_PROPS`.
Lanzar (`start()`) es JavaScript de la app: el nodo BDUI solo muestra y sigue.

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo con lo que importa
estáticamente, `import()` fuera; el chunk con todo lo que importa).

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/jobs.js`: píldora, red (stream/sondeo), pestañas, estado, avisos + lógica + núcleo | **8,84 KB** (9 055 B) | 9,25 KB |
| Chunk `jobs-panel-*.js` solo (filas, acciones, confirmación, teclado, posición) con lo que importa, sin la entrada | 3,47 KB (3 555 B) | — |
| Entrada + panel juntos (lo que mide `lazy("jobs-panel")` si el chunk importa el de `jobs`) | 10,81 KB (11 066 B) | 11,25 KB |
| `nxToast` | el chunk de `toast` que ya existe | — |
| `dist/jobs.css` | **1,94 KB** (1 983 B) | 2,25 KB |

**Por qué el panel va aparte:** con todo en la entrada eran 11,3 KB (y con `nxFormat`, que se cambió por
`toLocaleString` e `Intl` directo). La píldora es lo que se ve casi siempre; el panel se trae al apuntar
o enfocar la píldora (`pointerenter`/`focus`) y `show()` espera a que llegue antes de abrir.

Para `scripts/size.mjs`:

```js
  ["dist/jobs.js", 9.25 * 1024, "jobs + núcleo (ESM; el panel y nxToast con import())"],
  // El chunk del panel importa el de jobs (ya cargado en la página): se mide todo lo que baja la página.
  [lazy("jobs-panel"), 11.25 * 1024, "nx-jobs con su panel (se trae al apuntar a la píldora o al abrirla)"],
  // …
  ["dist/jobs.css", 2.25 * 1024, "jobs (CSS)"],
```

(Si Rollup deja `logic.ts` en un chunk compartido en vez de en `jobs.js`, `lazy("jobs-panel")` puede
salir más cerca de 3,5–5 KB; el límite de arriba cubre el peor caso.)

## Nav

En `gallery/main.ts`, dentro de `NAV`:

```ts
  { id: "jobs", label: "Trabajos largos", href: "#/jobs", icon: "list-checks", section: "Componentes", badge: "Nuevo" },
```

En `PAGES`: `"#/jobs": { template: "page-jobs", mount: mountJobsDemo },` con
`import { mountJobsDemo } from "./demo-jobs";` e `import "./pages/jobs.css";`. La plantilla está en
`gallery/pages/jobs.html` para pegarla en `gallery/index.html`. `demo-jobs.ts` importa `jobs.css`
directamente (mientras `nx32-elements.css` no lo haga); esa línea sobra al unir.

La demo registra `/demo/jobs` con `addDemoRoute` **al importarse** (el elemento pide la lista apenas se
conecta): lista, `POST` para lanzar, `/{id}`, `/{id}/cancel`, `/{id}/retry` y `/eventos` (NDJSON abierto,
con `?after=`). El «servidor» vive en el módulo, así que «Simular recarga» (quitar el elemento y montar
uno nuevo con los mismos atributos) retoma los trabajos donde iban. Las descargas no existen como
archivos: la demo intercepta el clic en `a[download]` y arma un CSV con `Blob`.

`test/jobs.dom.test.ts` monta la plantilla con `mountJobsDemo` sobre `demoFetch` (relojes falsos): si se
mueve la plantilla a `index.html`, esa prueba lee `gallery/pages/jobs.html`; se puede dejar el archivo o
cambiar la prueba.

## Solid

En `src/solid/index.tsx`: agregar `<Jobs>` al comentario de cabecera, y

```tsx
import "../components/jobs/index";
import type { NxJobs } from "../components/jobs/jobs";
import type { Job, JobEvent, JobResult, JobSpec, JobStatus, JobsErrorDetail, JobsLabels } from "../components/jobs/types";

export type { NxJobs, Job, JobEvent, JobResult, JobSpec, JobStatus, JobsErrorDetail, JobsLabels };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitAttributes {
      // `endpoint`, `stream`, `poll` y `locale` ya existen.
      recent: string | undefined;
    }
    interface ExplicitBoolAttributes {
      // `disabled` ya existe.
      notify: boolean;
      always: boolean;
    }
    interface CustomEvents {
      "nx-jobs-change": CustomEvent<{ jobs: Job[] }>;
      "nx-jobs-done": CustomEvent<{ job: Job }>;
      "nx-jobs-error": CustomEvent<JobsErrorDetail>;
      // `nx-open-change` ya existe.
    }
    interface IntrinsicElements {
      "nx-jobs": HTMLAttributes<NxJobs>;
    }
```

(`labels`: sumar `Partial<JobsLabels>` a la unión que ya exista en `ExplicitProperties`.)

El envoltorio:

```tsx
export interface JobsProps extends Omit<JSX.HTMLAttributes<NxJobs>, "onChange" | "onError"> {
  /** Lista (`?active=1`), lanzar (`POST`), cada trabajo (`/{id}`), `/{id}/cancel`, `/{id}/retry`. */
  endpoint: string;
  /** SSE o NDJSON con los eventos de todos los trabajos. Sin él, sondeo. */
  stream?: string;
  /** Segundos entre consultas sin stream (3). */
  poll?: number;
  /** Notificación del sistema al terminar con la pestaña oculta (pide permiso al lanzar). */
  notify?: boolean;
  /** La píldora (tenue) también sin trabajos. */
  always?: boolean;
  /** Cuántos terminados quedan en «Recientes» (10). */
  recent?: number;
  locale?: string;
  labels?: Partial<JobsLabels>;
  disabled?: boolean;
  onChange?: (e: CustomEvent<{ jobs: Job[] }>) => void;
  onDone?: (e: CustomEvent<{ job: Job }>) => void;
  onError?: (e: CustomEvent<JobsErrorDetail>) => void;
  onOpenChange?: (e: CustomEvent<{ open: boolean }>) => void;
}

export function Jobs(props: JobsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["endpoint", "stream", "poll", "notify", "always", "recent", "locale", "labels", "disabled", "onChange", "onDone", "onError", "onOpenChange"]);
  return (
    <nx-jobs
      {...rest}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:stream={local.stream}
      attr:poll={local.poll === undefined ? undefined : String(local.poll)}
      attr:recent={local.recent === undefined ? undefined : String(local.recent)}
      attr:locale={local.locale}
      bool:notify={!!local.notify}
      bool:always={!!local.always}
      bool:disabled={!!local.disabled}
      on:nx-jobs-change={(e) => local.onChange?.(e)}
      on:nx-jobs-done={(e) => local.onDone?.(e)}
      on:nx-jobs-error={(e) => local.onError?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e as CustomEvent<{ open: boolean }>)}
    />
  );
}
```

(Para lanzar desde Solid: `ref={jobs}` y `jobs.start({...})`.)

## README

````md
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
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/jobs/index";`. Nombres revisados contra lo exportado hoy
  (todo lleva `job`/`jobs`; no choca con `backoff`/`retryAfter` de sync, que se reexportan como
  `syncBackoff`/`syncRetryAfter`): `NxJobs`, `JOBS_LABELS`, `cleanJob`, `cleanJobs`, `isJobActive`,
  `mergeJob`, `splitJobs`, `jobFraction`, `jobsFraction`, `jobPace`, `jobLeft`, `jobsDuration`,
  `jobsBackoff`, `jobsRetryAfter`, `jobsPollDelay`, `jobUrl`, `readJobsMemo` y los tipos `Job*`/`Jobs*`.
- `src/styles/nx32-elements.css` → `@import "../components/jobs/jobs.css";`
- `vite.config.ts` → `jobs: "src/components/jobs/index.ts",` (el chunk del panel sale solo del `import()`).
- `scripts/build-css.mjs` → `"jobs": "src/components/jobs/jobs.css",`
- `package.json` → `"./jobs": { "types": "./dist/types/components/jobs/index.d.ts", "import": "./dist/jobs.js" }`
  y `"./jobs.css": "./dist/jobs.css"`. `sideEffects` ya cubre `./dist/*.js` y `index.ts`.
- `README.md` → la sección de arriba.

## Protocolo

Todo JSON, del mismo origen (o de `allowOrigins`), con `credentials: "same-origin"`: el servidor sabe
quién es la persona por su sesión.

| Petición | Cuerpo | Respuesta |
|---|---|---|
| `GET {endpoint}?active=1` | — | `[trabajo]` o `{jobs: [trabajo]}`: los en curso y los terminados de las últimas 24 h |
| `POST {endpoint}` | `{type, title, params}` | el trabajo creado (con su `id`; `status` por defecto `queued`) |
| `GET {endpoint}/{id}` | — | el trabajo; `404`/`410` lo saca de la lista |
| `POST {endpoint}/{id}/cancel` | — | el trabajo (opcional: sin cuerpo, el estado llega por el stream) |
| `POST {endpoint}/{id}/retry` | — | el trabajo otra vez en cola (mismo `id`), u otro trabajo nuevo (se sigue ese) |
| `GET {stream}` | — | SSE o NDJSON abierto, un evento por línea, de **todos** los trabajos de la persona |

**Trabajo:** `{id, type?, title, status: "queued" | "running" | "done" | "failed" | "canceled", stage?,
done?, total?, startedAt?, finishedAt?, by?, result?: {href?, download?: {url, name?}, errors?, errorsHref?,
message?}}`. Fechas ISO 8601. `by` es un nombre (o `{name}`). Los enlaces pasan por `safeHref`: un
`javascript:` no se pinta. Lo que no cumple la forma se descarta campo por campo.

**Eventos del stream:** `{id, status?, stage?, done?, total?, result?, seq?}` (solo `id` es obligatorio).
Con `seq` (un número creciente por persona) el orden es exacto: uno igual o menor al último aplicado se
ignora. Con SSE, la línea `id: 41` hace de `seq` para el evento que sigue. Sin número, el componente se
protege igual: un trabajo terminado no vuelve atrás y el avance de un mismo estado no retrocede.

**Retomar:** al reconectar manda `Last-Event-ID: 41` **y** `?after=41` (algunos proxies no dejan pasar la
cabecera); el servidor debería repetir lo posterior. Si todavía no hubo ningún evento con número, al
conectarse vuelve a pedir la lista para no perder lo que pasó entre el `POST` y el stream.

**Reconexión:** 1 s, 2 s, 4 s… hasta 30 s (±20 %), o lo que diga `Retry-After` en un 429/503. Un 4xx del
stream (que no sea 408/429) no se reintenta: el componente sigue con el sondeo.

**Un evento de un trabajo desconocido** (lanzado en otro dispositivo) se agrega; si no trae `title`, la
pestaña líder pide `GET {endpoint}/{id}`.

## Delegar un envío enorme desde `<nx-import>` (sin tocar import)

Con `endpoint`, `<nx-import>` envía las filas él mismo, en lotes y con su avance: sirve mientras la
persona espera en la pantalla. Para un archivo enorme (o un proceso que después de guardar sigue
validando contra otros módulos) conviene que el servidor lo haga como trabajo. Se usa `<nx-import>`
**sin `endpoint`**: al terminar la revisión emite `nx-import-done` con las filas ya normalizadas y
validadas, y la app lanza el trabajo con esas filas:

```html
<nx-import id="imp" columns='[…]'></nx-import>
<nx-jobs id="trabajos" endpoint="/api/trabajos" stream="/api/trabajos/eventos"></nx-jobs>
<script type="module">
  const jobs = document.getElementById("trabajos");
  document.getElementById("imp").addEventListener("nx-import-done", (e) => {
    const n = e.detail.rows.length.toLocaleString("es-CO");
    void jobs.start({ type: "importar-clientes", title: `Importar ${n} clientes`, params: { rows: e.detail.rows } });
  });
</script>
```

Si las filas son demasiadas para un `POST` con JSON, la app las sube primero (un archivo en su
almacenamiento) y lanza el trabajo con la referencia (`params: {archivo: "…"}`); o un endpoint propio
responde `202 {id}` y la app hace `jobs.track(id)`. En los dos casos, lo que el trabajo rechace vuelve
como `result.errors`/`errorsHref`/`download` («Ver filas con error», «Descargar»).

## Decisiones

- **El panel en un chunk aparte** (ver Peso). El contexto que recibe (`JobsPanelCtx`) no importa el
  elemento: estado compartido por referencia (mapas y conjuntos) y funciones.
- **`poll`, `recent`, `endpoint`, `stream`, `locale`** reflejan su atributo (la propiedad devuelve el texto
  del atributo; se le puede asignar un número). `notify`, `always`, `disabled` son booleanos que también
  entienden `"false"`.
- **Pestañas:** con `navigator.locks`, la que tiene el candado `nx-jobs:{endpoint}` es la líder hasta
  cerrarse. Sin candados, un líder simple: «¿hay líder?» por `BroadcastChannel`, y si nadie contesta en
  ~250 ms, esta lo es; si dos se proclaman a la vez, queda la de id menor. La líder conecta y reparte cada
  evento; las demás aplican lo que llega. `start()`/`track()` en cualquier pestaña se avisan a todas. Las
  seguidoras cuentan si están a la vista, así la líder oculta no espacia el sondeo a 30 s mientras otra
  pestaña visible lo muestra. `pagehide` suelta el liderazgo (con candados lo suelta el navegador).
  Sin `BroadcastChannel`, cada pestaña la suya.
- **Aviso al terminar:** `nx-jobs-done` y el aviso (`nxToast`, con botón «Ver» que abre el panel) solo por
  transiciones vistas en vivo (de en curso a terminado), en cada pestaña. Lo que ya estaba terminado al
  cargar no avisa. Con el panel abierto no hay aviso (se ve ahí). La notificación del sistema lleva
  `tag: "nx-jobs:{id}"`: con varias pestañas ocultas, el sistema muestra una.
- **Fallidos sin ver:** la píldora queda roja («Error: …» o «2 trabajos con error») hasta abrir el panel;
  «Listo»/«Cancelado» se ven 6 s.
- **Cancelar** es `POST /{id}/cancel`; mientras el servidor no confirma, la fila dice «Cancelando…» sin
  botón. **Reintentar** manda `POST /{id}/retry` y vuelve a la cola (limpia el `result` anterior).
  **Quitar** solo en terminados; se recuerda en `localStorage` (hasta 100 ids) para que al recargar no
  vuelva de los recientes del servidor. No se llama al servidor.
- **Ids guardados que el servidor no lista:** se piden uno por uno; si la petición falla (red), quedan en
  la lista como «en cola» para seguirlos; un 404 los olvida.
- **Estimación:** media móvil exponencial en el tiempo (τ = 20 s) de la velocidad, y lo que falta se acerca
  a la estimación nueva desde lo que venía descontando el reloj. La primera muestra tras recargar se toma
  desde `startedAt` (así ya hay estimación). Menos de 45 s: «falta menos de un minuto».
- **Rendimiento:** cada evento se funde en el estado al instante (O(1)); la píldora y las filas se pintan
  una vez por cuadro (`requestAnimationFrame`). Una fila solo se rehace si cambia su estado, título o
  resultado; el avance se actualiza en su lugar y solo si el texto cambió. En una pestaña oculta el
  navegador no da cuadros: `nx-jobs-change` llega al volver (`nx-jobs-done` y los avisos salen al instante).
- **Anuncios:** región `status` solo para terminado, falló y cancelado; los porcentajes no se anuncian.
  Cada barra es un `progressbar` con `aria-valuetext` («4.200 de 10.000, faltan unos 3 minutos»); sin
  total, sin `aria-valuenow` (indeterminada).
- **Números y horas** con `toLocaleString`/`Intl` del locale resuelto (no `nxFormat`, ~0,9 KB menos). El
  porcentaje con `Intl` `style: "percent"` («42 %» o «42%» según el locale).

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el diseño (píldora en sus estados, panel, hoja móvil,
  modo oscuro, las 9 paletas), ni axe/contraste (`npm run contrast` no corrió), ni Playwright.
- La posición del panel junto a la píldora con medidas reales (happy-dom no tiene layout) y la hoja desde
  abajo en el celular (`@media (max-width: 640px)` con `inset` `!important` sobre el `left`/`top` en línea).
- `navigator.locks` y `BroadcastChannel` reales entre dos pestañas (las pruebas usan unos falsos), y que el
  candado se suelte solo al cerrar una pestaña de golpe.
- La notificación del sistema real (permiso, `tag`) y que el aviso de `nxToast` se pause en la pestaña oculta.
- El stream real por SSE del navegador y la demo con tiempos reales (en las pruebas corre con relojes falsos).
- Lectores de pantalla: el nombre de la píldora, los `progressbar` con `aria-valuetext` y los anuncios.
