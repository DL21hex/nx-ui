# `<nx-planner>`: integración

Agenda de recursos: recursos en filas (agrupables), tiempo en columnas (`day` / `week` / `month`),
reservas que se mueven, estiran, crean y borran con el puntero o el teclado, actualización optimista
con reversión y deshacer, choques por capacidad, fila de ocupación, virtualización en los dos ejes y
carga por período.

Archivos: `planner.ts` (el elemento), `logic.ts` (puro: fechas locales, columnas, posición, rejilla,
carriles, choques, ocupación), `types.ts`, `planner.css`, `index.ts`. Pruebas en
`test/planner.logic.test.ts` y `test/planner.dom.test.ts`. Galería en `gallery/pages/planner.html` y
`gallery/demo-planner.ts`.

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Planner", { tag: "nx-planner", props: ["resources", "bookings", "view", "date", "snap", "hours", "workdays", "holidays", "summary", "source", "endpoint", "readonly", "locale", "labels"] }],
```

Todas son propiedades del elemento (el adaptador las asigna tal cual). `resources`, `bookings`,
`workdays`, `holidays` y `labels` aceptan el arreglo/objeto o su JSON por atributo; `summary` acepta
`true` o el nombre de lo que se cuenta («equipos»).

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo, `import()` fuera):

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/planner.js`: planner + núcleo | **13,95 KB** (14 289 B) | 16 KB |
| `dist/planner.css` | **2,69 KB** (2 754 B) | 3,5 KB |

`nxToast` se carga con `import("../toast/index")` la primera vez que hay un aviso (como `<nx-scan>`):
en la build es la entrada `toast` que ya existe, así que no hay chunk nuevo que medir.

Para `scripts/size.mjs`:

```js
  ["dist/planner.js", 16 * 1024, "planner + núcleo (ESM; el toast se carga aparte)"],
  // …
  ["dist/planner.css", 3.5 * 1024, "planner (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV` (después de «Tablero», por afinidad):

```ts
  { id: "planner", label: "Agenda de recursos", href: "#/planner", icon: "calendar", section: "Componentes", badge: "Nuevo" },
```

En `PAGES`: `"#/planner": { template: "page-planner", mount: mountPlannerDemo },` con
`import { mountPlannerDemo } from "./demo-planner";`. La plantilla está en `gallery/pages/planner.html`
para pegarla en `gallery/index.html` (no necesita CSS de página). `demo-planner.ts` importa
`planner.css` directamente mientras `nx-ui.css` no lo haga; esa línea sobra al unir.

La demo registra `addDemoRoute("/demo/planner", …)` al importarse: `PATCH`/`POST`/`DELETE
/demo/planner/reservas/{id}` (350 ms; 409 con `{message}` si el tramo pisa un mantenimiento del
recurso, para ver la reversión) y `GET /demo/planner/flota?from=&to=` (500 ms; 300 recursos y ~2.000
reservas del mes pedido, para «Cargar 300 recursos»). Usa los íconos `truck` y `warehouse`, que ya
registra la galería (`registerIcons(lucide)`).

## Solid

En `src/solid/index.tsx`: agregar `<Planner>` al comentario de cabecera, y

```tsx
import "../components/planner/index";
import type { NxPlanner } from "../components/planner/planner";
import type { PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerDeleteDetail, PlannerLabels, PlannerRangeDetail, PlannerResource, PlannerView } from "../components/planner/types";

export type { NxPlanner, PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerDeleteDetail, PlannerLabels, PlannerRangeDetail, PlannerResource, PlannerView };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      resources: PlannerResource[] | undefined;
      bookings: PlannerBooking[] | undefined;
      workdays: number[] | undefined;
      holidays: string[] | undefined;
      // `labels`: sumar `| Partial<PlannerLabels>` a la unión que ya existe.
    }
    interface ExplicitAttributes {
      view: PlannerView | undefined;
      date: string | undefined;
      snap: string | undefined;
      hours: string | undefined;
      summary: string | undefined;
      // `source`, `endpoint` y `locale` ya existen; `readonly` ya está en ExplicitBoolAttributes.
    }
    interface CustomEvents {
      "nx-planner-change": CustomEvent<PlannerChangeDetail>;
      "nx-planner-create": CustomEvent<PlannerCreateDetail>;
      "nx-planner-delete": CustomEvent<PlannerDeleteDetail>;
      "nx-planner-select": CustomEvent<{ booking: PlannerBooking }>;
      "nx-planner-range": CustomEvent<PlannerRangeDetail>;
    }
    interface IntrinsicElements {
      "nx-planner": HTMLAttributes<NxPlanner>;
    }
```

El envoltorio:

```tsx
export interface PlannerProps extends JSX.HTMLAttributes<NxPlanner> {
  resources: PlannerResource[];
  bookings?: PlannerBooking[];
  view?: PlannerView;
  /** El día a la vista (ISO). Controlable: cambiarlo lleva la vista a ese período. */
  date?: string;
  /** Minutos de la rejilla (15 en día, 30 en semana; en mes, un día). */
  snap?: number;
  /** Horario laboral: "07:00-18:00". */
  hours?: string;
  workdays?: number[];
  holidays?: string[];
  /** Fila de ocupación; un texto nombra lo que se cuenta («equipos»). */
  summary?: boolean | string;
  source?: string;
  endpoint?: string;
  readonly?: boolean;
  locale?: string;
  labels?: Partial<PlannerLabels>;
  /** Cancelable: vuelve a su lugar (con `e.detail.message` como motivo del aviso). */
  onChange?: (e: CustomEvent<PlannerChangeDetail>) => void;
  /** Cancelable: la reserva provisional se quita sin aviso (la app abre su formulario con el rango). */
  onCreate?: (e: CustomEvent<PlannerCreateDetail>) => void;
  onDelete?: (e: CustomEvent<PlannerDeleteDetail>) => void;
  onSelect?: (e: CustomEvent<{ booking: PlannerBooking }>) => void;
  onRange?: (e: CustomEvent<PlannerRangeDetail>) => void;
}

export function Planner(props: PlannerProps): JSX.Element {
  const [local, rest] = splitProps(props, ["resources", "bookings", "view", "date", "snap", "hours", "workdays", "holidays", "summary", "source", "endpoint", "readonly", "locale", "labels", "onChange", "onCreate", "onDelete", "onSelect", "onRange"]);
  return (
    <nx-planner
      {...rest}
      prop:resources={local.resources}
      prop:bookings={local.bookings}
      prop:workdays={local.workdays}
      prop:holidays={local.holidays}
      prop:labels={local.labels}
      attr:view={local.view}
      attr:date={local.date}
      attr:snap={local.snap === undefined ? undefined : String(local.snap)}
      attr:hours={local.hours}
      attr:summary={local.summary === true ? "" : local.summary || undefined}
      attr:source={local.source}
      attr:endpoint={local.endpoint}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      on:nx-planner-change={(e) => local.onChange?.(e)}
      on:nx-planner-create={(e) => local.onCreate?.(e)}
      on:nx-planner-delete={(e) => local.onDelete?.(e)}
      on:nx-planner-select={(e) => local.onSelect?.(e)}
      on:nx-planner-range={(e) => local.onRange?.(e)}
    />
  );
}
```

(`bookings` refleja el estado con los cambios aplicados; si la app vuelve a pasar el suyo tras cada
`onChange`, el deshacer sigue funcionando mientras la reserva esté donde la dejó el cambio.)

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/planner/index";`. Nombres revisados contra lo que se
  exporta hoy: `NxPlanner`, `PLANNER_LABELS`, `plannerAddDays`, `plannerClashes`, `plannerColumns`,
  `plannerHours`, `plannerISO`, `plannerLanes`, `plannerMove`, `plannerOccupancy`, `plannerParse`,
  `plannerRange`, `plannerResize`, `plannerSnap`, `plannerSpan`, `plannerStep`, `plannerTime`,
  `plannerX`, `cleanPlannerBookings`, `cleanPlannerResources` y los tipos `Planner*` son nuevos (sin
  choque con `addDays`/`startOfWeek` de date-range, `fill` de kanban, etc., que aquí van renombrados o
  no se exportan).
- `src/styles/nx-ui.css` → `@import "../components/planner/planner.css";`
- `vite.config.ts` → `planner: "src/components/planner/index.ts",`
- `scripts/build-css.mjs` → `"planner": "src/components/planner/planner.css",`
- `package.json` → `"./planner": { "types": "./dist/types/components/planner/index.d.ts", "import": "./dist/planner.js" }`
  y `"./planner.css": "./dist/planner.css"`. `sideEffects` ya cubre `./src/components/*/index.ts` y los chunks.
- `README.md` → la sección de abajo.

## README

````md
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
````

## Decisiones (no estaban en el encargo)

- **Festivo de la demo: 12 de octubre de 2026**, no el 13. El encargo decía «el festivo del 13 de octubre
  de 2026», pero el Día de la Raza de 2026 cae lunes 12 (el ejemplo de la API del mismo encargo usa
  `"2026-10-12"`). La demo muestra esa semana (lunes 12 festivo, entregas de martes a sábado). Si de
  verdad se quería el 13, es cambiar `holidays` y la fecha de la demo.
- **Día: el día entero, con lo que queda fuera de `hours` sombreado** (y la vista arranca en la hora de
  entrada); **semana y mes: solo el horario** («horas resumidas»), y lo que cae fuera se pega al borde
  de su columna. Así un despacho que sale a las 5:30 se ve en el día y no deforma la semana.
- **`snap` explícito vale para día y semana; en mes es siempre un día** (mover conserva la hora, de a
  días enteros). Por defecto: 15 min en día, 30 en semana.
- **Semana desde el lunes** (sin atributo para cambiarlo; `plannerRange(view, t, weekStart)` ya lo admite).
- **Un bloqueo (`status: "block"`) ocupa toda la capacidad**: cualquier cosa que lo pise es choque,
  aunque el recurso admita 2.
- **Crear cancelado no avisa**: la app que cancela `nx-planner-create` suele abrir su propio formulario
  con el rango; la reserva provisional se quita sin «volvió a su lugar». Cambiar o borrar cancelados sí
  avisan, con `e.detail.message` si la app lo puso.
- **El `POST` de crear va a `{endpoint}/{id}` con un `id` del cliente** (`crypto.randomUUID()`), así el
  reintento es idempotente y el deshacer (un `DELETE`) sabe a quién. Lo que el servidor devuelva en
  `PATCH`/`POST` (un objeto) se mezcla en la reserva (p. ej. `status`), sin cambiar su `id`.
- **Teclado sobre una reserva**: cada flecha se ve al instante y el cambio se registra (evento +
  petición + aviso) cuando se deja de mover 700 ms, al pulsar `Enter` o al salir de la reserva;
  `Escape` antes de eso lo deshace sin pedir nada. Así cinco flechas son un solo `PATCH`.
- **Deshacer**: solo el último cambio, pero se puede deshacer desde que se suelta (también mientras el
  servidor contesta). Deshacer emite el evento inverso con `via: "undo"` (cancelable) y su petición.
- **Cursor de la rejilla**: `role="grid"` con `aria-activedescendant` hacia una celda virtual que se
  pinta en la fila activa; las reservas son `gridcell` con `aria-roledescription="reserva"` y su nombre
  completo (también como `title`, porque en la semana las barras cortas no muestran el texto entero).
- **Choques en la barra**: «N con choque» cuenta recursos con choque en el período; el botón lleva al
  primero. El encabezado del grupo lleva un punto rojo si alguno de sus recursos tiene choque (se ve
  aunque esté plegado).
- **Resumen**: cuenta recursos (no reservas) con algo en la columna, bloqueos incluidos (un camión en
  mantenimiento no está disponible). El total es el número de recursos.
- **Cambiar de período conserva el desplazamiento vertical** y aborta ya la petición de `source` en
  vuelo (la nueva sale tras 200 ms sin más cambios).

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el aspecto (tonos, rayado de los bloqueos, modo
  oscuro, las 9 paletas), ni axe/contraste (`npm run contrast` no corrió), ni Playwright.
- Las posiciones reales: en happy-dom no hay diseño; las pruebas simulan el rectángulo y el tamaño del
  área desplazable y asumen la columna de recursos de 208 px. Falta ver `position: sticky` de la
  columna de recursos, del encabezado y del título dentro de barras largas (`overflow: clip`), y que el
  ancho medido de la columna (`offsetWidth` de la esquina) cambie bien con la consulta de contenedor
  (52 px en angosto).
- El arrastre real con mouse y con el dedo (mantener pulsado 300 ms, que `touchmove` con
  `preventDefault` evite el desplazamiento en iOS/Android, el autodesplazamiento cerca de los bordes),
  `Ctrl` + rueda y el pellizco del trackpad (llega como `wheel` con `ctrlKey` en Chromium).
- El rendimiento con 300 × 2.000 en un navegador real (en happy-dom el montaje tarda decenas de ms y
  solo se crean las filas visibles) y que el desplazamiento no titubee al cruzar ventanas de pintado.
- El aviso (`nxToast`) real: aquí el popover se simula.
