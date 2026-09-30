# `<nx-checklist>`: integración

Procedimientos con evidencia: cierre de mes, auditoría de inventario, recepción de mercancía,
alistamiento de un vehículo, apertura de caja. Cada paso con responsable, fecha límite y la
evidencia que exige (fotos, archivos, firma, nota, número con rango, opción); queda quién marcó cada
paso y cuándo. Guardado optimista con cola sin conexión, bitácora «Actividad», `mode="summary"` para
varios procedimientos.

Archivos: `checklist.ts` (entrada: vista, acordeón, cola y servidor, bitácora), `checklist-fields.ts`
(los campos de evidencia del paso abierto, con `import()`), `checklist-summary.ts` (`mode="summary"`,
con `import()`), `logic.ts` (puro), `types.ts`, `checklist.css`, `index.ts`.

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Checklist", { tag: "nx-checklist", props: ["steps", "state", "endpoint", "me", "sequential", "handoff", "mode", "items", "heading", "readonly", "disabled", "locale", "labels"] }],
```

Todas tienen propiedad. `steps`, `state`, `me`, `items` y `labels` aceptan el objeto o su JSON;
`sequential` acepta `true`, una lista de secciones (`["Conteo"]`) o un nombre; los demás reflejan el
atributo. Con `endpoint` y sin `state`, el elemento pide el procedimiento con `GET {endpoint}`.

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo con lo que importa
estáticamente, los `import()` fuera).

| Pieza | gzip |
|---|---|
| `src/components/checklist/index.ts` (elemento + lógica + núcleo) | **12 037 B (11,75 KB)** · meta 12 KB |
| `checklist-fields.ts` solo, con lo que importa (`h`, `safeImageSrc`, parte de `logic`) | 2 409 B |
| entrada + `checklist-fields` (lo que mide `lazy()` si el chunk importa el de la entrada) | 13 305 B (12,99 KB) |
| `checklist-summary.ts` solo, con lo que importa | 1 661 B |
| entrada + `checklist-summary` | 12 642 B (12,35 KB) |
| `checklist.css` (targets de `build-css.mjs`) | **2 831 B (2,76 KB)** · meta 3 KB |

**Por qué hay dos chunks.** Con los campos en la entrada serían ~13 KB (la fila «entrada + campos»). Los campos de evidencia (fotos con
miniaturas y el celular, archivos, firma, número con rango, opciones, nota: ~1 KB gzip) solo se usan
con un paso abierto; el resumen solo en `mode="summary"`. **Sin conexión en bodega es lo normal**, así
que el chunk de los campos se pide en reposo apenas el elemento se conecta en `run`
(`requestIdleCallback`, o `setTimeout`), y también `<nx-signature>` si algún paso pide firma: cuando
se cae la señal, abrir un paso sigue funcionando. Si prefieres que la entrada lo lleve todo, sube el
límite a ~13,25 KB y cambia `#fields()` por un import estático (nada más depende de que sea perezoso).
`nx-signature`, `nx-handoff` y `nxToast` siguen con `import()`, como pide el encargo.

`sortChecklistItems` vive en `logic.ts` pero **no** se exporta desde la entrada (solo lo usa el
resumen): exportarlo cuesta ~150 B. Si se quiere en `nx32-elements/checklist`, agregarlo a `index.ts`.

Para `scripts/size.mjs` (en `BUDGET`):

```js
  ["dist/checklist.js", 12 * 1024, "checklist + núcleo (ESM; campos, resumen, firma, celular y aviso con import())"],
  // Como el celular de handoff: si el chunk importa el de la entrada, se mide todo lo que baja la página al abrir un paso.
  [lazy("checklist-fields"), 13.25 * 1024, "nx-checklist con sus campos de evidencia (se piden en reposo)"],
  [lazy("checklist-summary"), 12.75 * 1024, "nx-checklist mode=\"summary\" (se carga en ese modo)"],
  // …
  ["dist/checklist.css", 3 * 1024, "checklist (CSS)"],
```

(Si Rolldown pone `logic`/`dom` en un chunk compartido en vez de en el de la entrada, los chunks
perezosos medirán ~2,4 KB y ~1,7 KB: el límite de arriba sobra, bájalo.)

## Nav y galería

En `gallery/main.ts`, dentro de `NAV` (con los demás «Nuevo» de Componentes; `list-checks` ya está
en `src/icons/lucide.ts` y lo usa también Review; `clipboard-list` o `warehouse` sirven igual):

```ts
  { id: "checklist", label: "Procedimientos", href: "#/checklist", icon: "list-checks", section: "Componentes", badge: "Nuevo" },
```

En `PAGES`: `"#/checklist": { template: "page-checklist", mount: mountChecklistDemo },` con
`import { mountChecklistDemo } from "./demo-checklist";` e `import "./pages/checklist.css";`. La
plantilla está en `gallery/pages/checklist.html` para pegarla en `gallery/index.html`.
`demo-checklist.ts` importa `checklist.css` y `../src/components/checklist/index` directamente
(mientras `nx32-elements.css` y `src/index.ts` no los traigan); la línea del CSS sobra al unir.

El backend de mentira lo registra `demo-checklist.ts` al importarse (`addDemoRoute("/demo/checklist",
…)`): `GET /demo/checklist/recepcion-oc-2291`, `PATCH …/steps/{id}` y `POST …/close`. Como
`demoFetch` solo pasa cuerpos de texto, las fotos (`FormData` a `…/files`) y «Simular sin conexión»
los atiende un envoltorio de `fetch` de la misma demo (como `demo-sync.ts`). No hay que tocar
`demo-api.ts`.

La demo: la recepción de la OC-2291 de Aceros del Caribe en la bodega de Itagüí, 12 pasos en tres
secciones (Llegada: placa, remisión y factura, foto del camión —vencida—, sellos; Conteo, con
`sequential='["Conteo"]'`: descargue, láminas con tolerancia 118–122, ángulos 40, estado del empaque
con «Conforme / Con novedad / No conforme», fotos de novedades opcionales; Cierre: firma del
transportador —espera el conteo—, firma del jefe de bodega, nota final), dos pasos ya hechos por Laura
Gómez, los interruptores «Simular sin conexión» y «El servidor rechaza el próximo cambio», el log de
eventos y, debajo, `mode="summary"` con Cierre de septiembre, Auditoría de inventario Q3,
Alistamiento del camión TKR-512 y Apertura de caja. Sin `handoff` en la demo: el servidor de sesiones
vive en la pestaña y un celular de verdad no lo alcanza (la página de `<nx-handoff>` tiene el celular
simulado).

## Solid

En `src/solid/index.tsx`: agregar `<Checklist>` al comentario de cabecera, y

```tsx
import "../components/checklist/index";
import type { NxChecklist } from "../components/checklist/checklist";
import type { ChecklistSequence } from "../components/checklist/logic";
import type {
  ChecklistChangeDetail,
  ChecklistCompleteDetail,
  ChecklistErrorDetail,
  ChecklistLabels,
  ChecklistMode,
  ChecklistOpenDetail,
  ChecklistPerson,
  ChecklistState,
  ChecklistStep,
  ChecklistSummaryItem,
} from "../components/checklist/types";

export type { NxChecklist, ChecklistLabels, ChecklistMode, ChecklistPerson, ChecklistState, ChecklistStep, ChecklistSummaryItem };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      steps: ChecklistStep[] | undefined;
      state: ChecklistState | undefined;
      sequential: ChecklistSequence | undefined;
      // `me`: ampliar a `PresenceUser | ChecklistPerson | null | undefined`.
      // `items`: agregar `| ChecklistSummaryItem[]`.
      // `labels`: agregar `| Partial<ChecklistLabels>`.
    }
    interface ExplicitAttributes {
      // `mode`: ampliar a `DialogMode | ScanMode | GuardMode | ReviewMode | ChecklistMode | undefined`.
      // `endpoint`, `handoff`, `heading`, `locale` ya existen.
    }
    interface ExplicitBoolAttributes {
      // `readonly` y `disabled` ya existen.
    }
    interface CustomEvents {
      "nx-checklist-change": CustomEvent<ChecklistChangeDetail>;
      "nx-checklist-complete": CustomEvent<ChecklistCompleteDetail>;
      "nx-checklist-open": CustomEvent<ChecklistOpenDetail>;
      "nx-checklist-error": CustomEvent<ChecklistErrorDetail>;
    }
    interface IntrinsicElements {
      "nx-checklist": HTMLAttributes<NxChecklist>;
    }
```

El envoltorio (al final del archivo):

```tsx
export interface ChecklistProps extends Omit<JSX.HTMLAttributes<NxChecklist>, "onChange" | "onError"> {
  /** Los pasos: `{id, title, hint?, section?, assignee?, due?, required?, evidence?, dependsOn?, canSkip?}`. */
  steps?: ChecklistStep[];
  /** El estado por `id`. Sin él (y con `endpoint`), `GET {endpoint}`. */
  state?: ChecklistState;
  endpoint?: string;
  /** Quien usa la pantalla: el «por» de cada paso. */
  me?: ChecklistPerson | null;
  /** `true`: todo en orden; una lista: solo esas secciones. */
  sequential?: boolean | string[];
  /** La base de `<nx-handoff>`: «Tomar con el celular» en las fotos. */
  handoff?: string;
  mode?: ChecklistMode;
  items?: ChecklistSummaryItem[];
  heading?: string;
  readonly?: boolean;
  disabled?: boolean;
  locale?: string;
  labels?: Partial<ChecklistLabels>;
  onChange?: (e: CustomEvent<ChecklistChangeDetail>) => void;
  /** Cancelable: cancelarlo no cierra el procedimiento. */
  onComplete?: (e: CustomEvent<ChecklistCompleteDetail>) => void;
  /** `mode="summary"`, cancelable (cancelarlo no sigue el `href`). */
  onOpen?: (e: CustomEvent<ChecklistOpenDetail>) => void;
  onError?: (e: CustomEvent<ChecklistErrorDetail>) => void;
}

export function Checklist(props: ChecklistProps): JSX.Element {
  const [local, rest] = splitProps(props, ["steps", "state", "endpoint", "me", "sequential", "handoff", "mode", "items", "heading", "readonly", "disabled", "locale", "labels", "onChange", "onComplete", "onOpen", "onError"]);
  return (
    <nx-checklist
      {...rest}
      prop:steps={local.steps}
      prop:state={local.state}
      prop:me={local.me}
      prop:items={local.items}
      prop:labels={local.labels}
      prop:sequential={local.sequential}
      attr:endpoint={local.endpoint}
      attr:handoff={local.handoff}
      attr:mode={local.mode}
      attr:heading={local.heading}
      attr:locale={local.locale}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      on:nx-checklist-change={(e) => local.onChange?.(e)}
      on:nx-checklist-complete={(e) => local.onComplete?.(e)}
      on:nx-checklist-open={(e) => local.onOpen?.(e)}
      on:nx-checklist-error={(e) => local.onError?.(e)}
    />
  );
}
```

Ojo con `state`: pasarlo (aunque sea `{}`) evita el `GET`. Para que el elemento cargue solo, no pases
`state` y sí `endpoint`.

## Otros archivos compartidos

- `src/index.ts` → `export * from "./components/checklist/index";`. Nombres revisados contra lo
  exportado hoy (sin choques): `NxChecklist`, `CHECKLIST_LABELS`, `checklistAgo`,
  `checklistBlankEvidence`, `checklistBlocks`, `checklistDeps`, `checklistDueText`,
  `checklistDueTime`, `checklistInRange`, `checklistLogFromState`, `checklistMissing`,
  `checklistNeedsNote`, `checklistOptions`, `checklistOverdue`, `checklistProgress`,
  `checklistResolved`, `cleanChecklistItems`, `cleanChecklistLog`, `cleanChecklistState`,
  `cleanChecklistSteps` y los tipos `Checklist*`.
- `src/styles/nx32-elements.css` → `@import "../components/checklist/checklist.css";`
- `vite.config.ts` (entradas de la librería) → `checklist: "src/components/checklist/index.ts",`
  (los dos chunks salen solos de los `import()`).
- `scripts/build-css.mjs` → `"checklist": "src/components/checklist/checklist.css",`
- `package.json` → en `exports`:
  `"./checklist": { "types": "./dist/types/components/checklist/index.d.ts", "import": "./dist/checklist.js" },`
  y `"./checklist.css": "./dist/checklist.css",`. `sideEffects` ya cubre `./src/components/*/index.ts`
  y los chunks.
- `src/styles/tokens.css` (opcional): el ámbar de «fuera de rango» y «pendiente de enviar» sale de
  `--nx-warning-ink` si existe; si no, `checklist.css` trae el mismo tono que review.
- `README.md` → la sección de abajo.

## Protocolo con el servidor

Todo relativo a `endpoint` (mismo origen, o uno de `allowOrigins()`), con `credentials: "same-origin"`.

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `GET {endpoint}` | — | `{title?, steps?, state?, closed?: {by, at} \| null, log?: [{action, step?, by?, at, reason?}]}`. Lo que no venga se toma de los atributos. |
| `POST {endpoint}/steps/{id}/files` | `FormData`: cada foto o archivo nuevo en `files` (con su nombre) | `{files: [{url, id?}]}`, en el mismo orden. Las URL tienen que ser `https:` o del mismo origen para mostrarse como miniatura. |
| `PATCH {endpoint}/steps/{id}` | `{status, evidence, reason?, note?, clientId}` | `2xx`. Si el cuerpo es un estado (`{status, by?, at?, evidence?, …}`) y no hay otro cambio de ese paso en cola, reemplaza al local. |
| `POST {endpoint}/close` | `{clientId, at}` | `2xx`. |

- **Orden**: la cola es una sola y va de a un pedido; las fotos de un cambio suben antes que su
  `PATCH`. Un archivo ya subido (con `url`) no se vuelve a subir en un reintento.
- **`evidence`**: metadatos, en el orden de `evidence` del paso. Foto/archivo `{type, files: [{name,
  type, size, url, id}]}`; firma `{type: "signature", signature: {svg, meta}}` (la de
  `<nx-signature>`); nota/número/opción `{type, value}`; número fuera de rango con `outOfRange: true`.
  `note` es la nota que exige una novedad cuando el paso no pide una evidencia `note`.
- **`status`**: `done`, `skipped` (con `reason`), `todo` (reabierto, con `reason`).
- **`clientId`**: único por cambio. Un reintento lleva el mismo: el servidor debe ignorar uno que ya
  aplicó (la respuesta pudo perderse).
- **Sin red** (`fetch` rechaza), `408`, `429`, `502`, `503`, `504`: el cambio queda en cola («sin
  enviar», «pendiente de enviar» en la fila) y se reintenta a los 1 s, 2 s, 4 s… hasta 30 s, y apenas
  llega el evento `online`. No se revierte nada.
- **Otro error** (`4xx`, `500`): ese paso vuelve a como estaba (y se descartan los cambios que venían
  detrás para el mismo paso), con `nxToast` («No se guardó «Nota final»: {message}»), una línea en la
  actividad y `nx-checklist-error` `{message, step, status}`. `{message}` sale del cuerpo JSON.
- **La cola vive en memoria**: recargar la página con cambios sin enviar los pierde. `pending` los
  lista (`[{clientId, step, status, at}]`) para que la app avise antes de salir.

### Servidor de ejemplo mínimo (Node + Express)

```js
import express from "express";
import multer from "multer";

const app = express();
const upload = multer({ dest: "uploads/" });
const db = new Map(); // id del procedimiento → {title, steps, state, log, closed, seen:Set}

app.get("/api/procedimientos/:p", (req, res) => {
  const p = db.get(req.params.p);
  if (!p) return res.status(404).json({ message: "No existe" });
  res.json({ title: p.title, steps: p.steps, state: p.state, log: p.log, closed: p.closed });
});

app.post("/api/procedimientos/:p/steps/:id/files", upload.array("files"), (req, res) => {
  res.json({ files: req.files.map((f) => ({ id: f.filename, url: `/archivos/${f.filename}` })) });
});

app.patch("/api/procedimientos/:p/steps/:id", express.json({ limit: "2mb" }), (req, res) => {
  const p = db.get(req.params.p);
  const { status, evidence, reason, note, clientId } = req.body;
  if (p.closed) return res.status(409).json({ message: "El procedimiento ya se cerró" });
  if (p.seen.has(clientId)) return res.json(p.state[req.params.id]); // un reintento: ya estaba
  p.seen.add(clientId);
  const at = new Date().toISOString();
  const by = { id: req.user.id, name: req.user.name }; // quien firmó la sesión, no lo que diga el cliente
  p.state[req.params.id] = { status, by, at, evidence, reason, note };
  p.log.push({ action: status === "todo" ? "reopened" : status, step: req.params.id, by, at, reason });
  res.json(p.state[req.params.id]);
});

app.post("/api/procedimientos/:p/close", express.json(), (req, res) => {
  const p = db.get(req.params.p);
  p.closed = { by: { id: req.user.id, name: req.user.name }, at: new Date().toISOString() };
  p.log.push({ action: "closed", by: p.closed.by, at: p.closed.at });
  res.json({ ok: true });
});
```

El servidor debe validar de nuevo lo que importa (que la evidencia requerida esté, el rango, que las
dependencias estén hechas): `checklistMissing()`, `checklistBlocks()` y `checklistInRange()` son la
misma lógica, sin DOM, para un backend en JavaScript.

## README

````md
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
````

## Decisiones

- **Dos chunks perezosos** (campos de evidencia y resumen), con los campos pedidos en reposo al
  conectar (y `<nx-signature>` si algún paso pide firma), para que la entrada quepa en 12 KB sin que
  un paso deje de abrirse sin señal. Ver «Peso».
- **Cola propia en memoria, no `nxSync`**: `nxSync` encola JSON; aquí cada cambio lleva archivos
  (`FormData`) que suben antes del `PATCH`, y un rechazo tiene que revertir ese paso de la pantalla.
  Importar `sync/logic` además crea la cola de la página al cargar (no se puede sacudir): no era
  barato. Consecuencia: recargar con cambios sin enviar los pierde (`pending` los dice). Reintento: 1,
  2, 4… hasta 30 s, y al evento `online`; `408/429/502–504` cuentan como «sin red».
- **Hecho u omitido** resuelven un paso para el avance, las dependencias y la secuencia. Los
  **opcionales** (`required: false`) no detienen la secuencia ni cuentan para completar.
- **Bloqueo por secuencia**: dice el **primer** paso requerido sin hacer de la secuencia («Primero:
  Descargar…»), que es el accionable, no el inmediatamente anterior.
- **Bloqueados**: se ven y se abren para leer (ayuda y «Primero: …»), sin campos ni acciones. Un paso
  ya hecho nunca se bloquea (se puede ver y reabrir).
- **Ciclos**: Tarjan iterativo (una cadena de 30 000 no revienta la pila); se sueltan solo las
  dependencias dentro de cada ciclo, con un aviso en consola. Lo que depende de un ciclo lo sigue
  esperando.
- **Fechas**: un día solo (`"2026-09-30"`) vence al final de ese día en la hora local; con hora y sin
  zona es hora local; con zona, la que diga. «vence hoy 5:00 p. m.», «vence mañana», «venció ayer
  8:00 a. m.», «vence 3 oct» (con año si no es este).
- **Nota obligatoria**: si el paso pide una evidencia `note`, esa se vuelve obligatoria ante una
  novedad; si no, aparece «Nota: explica la novedad» y va en `state.note`. «No conforme» se reconoce
  sin tildes ni mayúsculas; `{value, label, note}` lo controla opción por opción.
- **La casilla** de un paso sin evidencia obligatoria lo marca de una vez (clic); en los demás abre
  el paso. La casilla no es un control aparte (con 300 pasos serían 600 paradas de <kbd>Tab</kbd>): el
  teclado va por el botón de la fila (flechas, Inicio, Fin) y «Marcar como hecho».
- **Reabrir** deja la evidencia como borrador y el paso abierto; el panel dice «Reabierto por …, fecha,
  Motivo».
- **«Lo completó»**: quien hizo el último paso requerido (el `at` más reciente). Cerrar va por
  `POST {endpoint}/close` en la misma cola; un rechazo lo reabre.
- **`nx-handoff` del autor**: además del atributo `handoff`, un `<nx-handoff endpoint>` hijo sirve para
  decir el endpoint (se oculta con CSS; no se mueve). Lo que manda el celular entra por el mismo
  `<input type=file>` del campo: el componente solo toma los archivos nuevos del `FileList`.
- **`heading`** como nombre si el servidor no manda `title`. `closed` como getter extra.
- **Números**: parser propio (`checklistParseNumber`) en vez de `nxFormat` (−0,8 KB): la coma decimal
  del locale; los miles solo si agrupan de verdad («1.200» es 1200 en es-CO, «2.5» es 2,5).
- **Un JSON inválido en un atributo** avisa en consola y deja el valor anterior.
- **Espacios entre las piezas de una fila**: en un contenedor flex no se ven, pero el nombre accesible
  y el texto no salen pegados («18/24 3 vencidos», no «18/243 vencidos»).
- **`sortChecklistItems`** no se exporta desde la entrada (ver «Peso»).

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el diseño (claro/oscuro, paletas, angosto con
  `@container`), ni axe/contraste (`npm run contrast` no corrió), ni Playwright.
- No corrió `vite build`: los nombres de los chunks (`checklist-fields-*.js`, `checklist-summary-*.js`)
  y lo que mide `lazy()` están deducidos de cómo salen los de account y handoff.
- La cámara (`capture="environment"`) en un celular, `<nx-handoff>` y `<nx-signature>` de verdad dentro
  del panel (en las pruebas son de mentira), y `requestIdleCallback` con la red caída.
- Lectores de pantalla: el nombre de cada grupo, el `progressbar` y los `aria-live`.
- La demo de la galería solo se montó en happy-dom (una prueba temporal, no versionada): carga, marcar
  con la casilla, sin conexión y vuelta en orden, y el rechazo del servidor con reversión.
