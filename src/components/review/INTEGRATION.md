# `<nx-review>`: integración

El resumen antes de guardar. Envuelve un formulario del autor (o un grupo de sus campos), guarda la
base al conectar (o con `initial` / `snapshot()`), y al enviar muestra «Vas a guardar 3 cambios» en
un panel en el lugar, encima de la fila del botón: montos con diferencia y porcentaje, fechas con
días, selects por etiqueta, casillas Sí/No, textos largos con diferencia por palabras, filas de
detalle nuevas/quitadas/cambiadas y los avisos de `<nx-guard>`. `changes` es la bitácora.

Archivos: `review.ts` (elemento: lectura del DOM, envío, panel, `dirty`), `logic.ts` (puro:
comparar, filas, formato, importancia, orden), `types.ts`, `review.css`, `index.ts`.
`wordDiff` se importa de `../history/logic` **sin moverlo**: medido, esbuild solo arrastra la
función (551 B gzip, nada más de history), así que no hizo falta llevarlo a `src/core/`.

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Review", { tag: "nx-review", props: ["mode", "threshold", "maxSilent", "empty", "initial", "rebase", "locale", "labels", "disabled"] }],
```

Todas tienen propiedad (`maxSilent` es la del atributo `max-silent`; `locale` refleja el atributo).
`initial` y `labels` aceptan el objeto o su JSON. Como `<nx-guard>`, el renderizador tiene que poner
el formulario como hijo (el resumen lee lo que tiene adentro).

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo con lo que importa
estáticamente; no tiene `import()`).

| Pieza | gzip |
|---|---|
| `src/components/review/index.ts` (elemento + lógica + núcleo) | **10 666 B (10,42 KB)** |
| núcleo que arrastra (`Base`/`define`/`boolAttr`, `h`, `mergeLabels`, `nxFormat`/`resolveLocale`) | 1 328 B |
| `logic.ts` (con `wordDiff` 551 B y `REVIEW_LABELS` ~350 B) | 3 914 B |
| elemento (lectura del DOM, etiquetas, envío, panel, `dirty`, `reset`) | ~5 400 B |
| `review.css` (con los targets de `build-css.mjs`) | **1 532 B (1,50 KB)** |

**El JS pasa la meta de 7 KB** (como pasó con guard: 6 → 9,25). Lo que pesa es lo pedido: leer
bien cada tipo de campo (nativos, radios y casillas agrupados, selects múltiples, `<nx-number>`,
`<nx-select>` con sus etiquetas, componentes con `value`), sacar la etiqueta y la sección de cada
uno, filas por tres formas de nombre y por `data-review-row`, formato por tipo con delta y
porcentaje, diferencia por palabras, `reset()` que escribe de vuelta, `review()` sin formulario,
avisos de guard y el panel con filas anidadas. Ya se juntaron las piezas repetidas; para bajar a 7
habría que dejar fuera funciones del encargo (p. ej. `reset()`, las filas por `data-review-row`,
`<nx-select>`), o partir el panel en un chunk con `import()`, que no conviene: `changes` y la
decisión de `significant` necesitan casi todo de forma síncrona dentro del `submit`. El CSS entra
justo en 1,5 KB. Límites propuestos para `scripts/size.mjs` (en `BUDGET`):

```js
  ["dist/review.js", 10.75 * 1024, "review + núcleo (ESM; wordDiff de history)"],
  // …
  ["dist/review.css", 1.5 * 1024, "review (CSS)"],
```

## Nav y galería

En `gallery/main.ts`, dentro de `NAV` (con los demás «Nuevo» de Componentes; el ícono ya está en
`src/icons/lucide.ts`, no hay que tocar `gen-icons.mjs`):

```ts
  { id: "review", label: "Resumen antes de guardar", href: "#/review", icon: "clipboard-list", section: "Componentes", badge: "Nuevo" },
```

En `PAGES`: `"#/review": { template: "page-review", mount: mountReviewDemo },` con
`import { mountReviewDemo } from "./demo-review";` e `import "./pages/review.css";`. La plantilla está en
`gallery/pages/review.html` para pegarla en `gallery/index.html`. `demo-review.ts` importa
`review.css` y `../src/components/review/index` directamente (mientras `nx-ui.css` y `src/index.ts`
no los traigan); esas dos líneas sobran al unir. La demo no usa `addDemoRoute`.

La demo: la OC-2291 a Aceros del Caribe ya cargada (proveedor, fecha de entrega, condición de pago,
estado, IVA, observaciones largas y 5 líneas con `<nx-number>` de cantidad y precio), dentro de un
`<nx-guard>` con la historia de precios de cada ítem (`data-guard` en cada precio). «Prueba esto»
(aprobar, mover la entrega 10 días, 12.750.000 en la lámina, otra observación), «Agregar línea» y
«Quitar» por fila, el selector de `mode`, «Revisar sin enviar» (`review()`), la píldora de `dirty`
en el encabezado, el log de eventos y, al confirmar, el JSON de `changes` («esto es lo que va a la
bitácora»).

## Solid

En `src/solid/index.tsx`: agregar `<Review>` al comentario de cabecera, y

```tsx
import "../components/review/index";
import type { NxReview } from "../components/review/review";
import type { ReviewChange, ReviewConfirmDetail, ReviewDirtyDetail, ReviewLabels, ReviewMode, ReviewOpenDetail } from "../components/review/types";

export type { NxReview, ReviewChange, ReviewLabels, ReviewMode };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      initial: Record<string, unknown> | null | undefined;
      // `labels`: agregar `| Partial<ReviewLabels>` a la unión.
    }
    interface ExplicitAttributes {
      // `mode`: ampliar a `DialogMode | ScanMode | GuardMode | ReviewMode | undefined`.
      threshold: string | undefined;
      "max-silent": string | undefined;
      empty: "notice" | undefined;
      rebase: "false" | undefined;
      // `locale` ya existe.
    }
    interface ExplicitBoolAttributes {
      // `disabled` ya existe.
    }
    interface CustomEvents {
      "nx-review-open": CustomEvent<ReviewOpenDetail>;
      "nx-review-confirm": CustomEvent<ReviewConfirmDetail>;
      "nx-review-cancel": CustomEvent<{ changes: ReviewChange[] }>;
      "nx-review-dirty": CustomEvent<ReviewDirtyDetail>;
    }
    interface IntrinsicElements {
      "nx-review": HTMLAttributes<NxReview>;
    }
```

El envoltorio (al final del archivo):

```tsx
export interface ReviewProps extends JSX.HTMLAttributes<NxReview> {
  /** `significant` (por defecto), `always` o `never` (solo con `review()`). */
  mode?: ReviewMode;
  /** Desde qué porcentaje un monto es importante (20). */
  threshold?: number;
  /** Más de cuántos cambios se muestra aunque nada sea importante (5). */
  maxSilent?: number;
  /** `notice`: al enviar sin cambios, «No hay cambios que guardar» y no envía. */
  empty?: "notice";
  /** La base: el registro como se cargó (`{campo: valor}`, filas anidadas o planas). */
  initial?: Record<string, unknown> | null;
  /** `false`: después de guardar, la base no cambia. */
  rebase?: boolean;
  locale?: string;
  labels?: Partial<ReviewLabels>;
  disabled?: boolean;
  /** Cancelable: cancelarlo envía directo. */
  onOpen?: (e: CustomEvent<ReviewOpenDetail>) => void;
  onConfirm?: (e: CustomEvent<ReviewConfirmDetail>) => void;
  onCancel?: (e: CustomEvent<{ changes: ReviewChange[] }>) => void;
  onDirty?: (e: CustomEvent<ReviewDirtyDetail>) => void;
  children?: JSX.Element;
}

export function Review(props: ReviewProps): JSX.Element {
  const [local, rest] = splitProps(props, ["mode", "threshold", "maxSilent", "empty", "initial", "rebase", "locale", "labels", "disabled", "onOpen", "onConfirm", "onCancel", "onDirty", "children"]);
  return (
    <nx-review
      {...rest}
      prop:initial={local.initial}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:threshold={local.threshold === undefined ? undefined : String(local.threshold)}
      attr:max-silent={local.maxSilent === undefined ? undefined : String(local.maxSilent)}
      attr:empty={local.empty}
      attr:rebase={local.rebase === false ? "false" : undefined}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-review-open={(e) => local.onOpen?.(e)}
      on:nx-review-confirm={(e) => local.onConfirm?.(e)}
      on:nx-review-cancel={(e) => local.onCancel?.(e)}
      on:nx-review-dirty={(e) => local.onDirty?.(e)}
    >
      {local.children}
    </nx-review>
  );
}
```

Con Solid, el formulario suele cargar el registro después de montar: pasar `initial={registro()}`
(o llamar `ref.snapshot()` cuando llegan los datos). Lo que entra en el mismo turno en que el
elemento se conecta ya cuenta como base.

## Otros archivos compartidos

- `src/index.ts` → `export * from "./components/review/index";`. Nombres revisados contra lo exportado
  hoy (sin choques): `NxReview`, `REVIEW_LABELS`, `diffReview`, `describeReview`,
  `describeReviewChange`, `countReview`, `countReviewChanges`, `groupReview`, `reviewShouldOpen`,
  `reviewRowName`, `reviewName`, `reviewValueText`, `flattenReview`, `sameReviewValue` y los tipos
  `Review*`.
- `src/styles/nx-ui.css` → `@import "../components/review/review.css";`
- `vite.config.ts` (entradas de la librería) → `review: "src/components/review/index.ts",`
- `scripts/build-css.mjs` → `"review": "src/components/review/review.css",`
- `package.json` → en `exports`:
  `"./review": { "types": "./dist/types/components/review/index.d.ts", "import": "./dist/review.js" },`
  y `"./review.css": "./dist/review.css",`. `sideEffects` ya cubre `./src/components/*/index.ts` y los chunks.
- `src/styles/tokens.css` (opcional): como guard, el ámbar de lo importante sale de `--nx-warning` /
  `--nx-warning-ink` si existen; si no, `review.css` trae el mismo tono que guard.
- `README.md` → la sección de abajo.

## README

````md
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
````

## Decisiones

- **`nx-review-confirm` también cuando el envío pasa sin resumen** (`{silent: true}`): en
  `significant`, la mayoría de los guardados no muestran nada, y la bitácora igual tiene que
  enterarse. Después de cualquier envío que pasa (confirmado o silencioso) la base se vuelve lo
  guardado (`rebase`), en un `setTimeout(0)`: el `submit` de la app todavía puede leer `changes`.
  Si la validación nativa detiene el reenvío, la base no cambia. En `never`, el envío ni se mira.
- **Formato del porcentaje según el locale**: en es-CO, Intl dice «+20%» (sin espacio; «20 %» es
  es-ES). Se respeta el locale en vez del «+20 %» del encargo. La diferencia de un monto va con el
  valor y el porcentaje: «(+$ 2.000 · +20%)»; «20 % o más» es importante (con tolerancia de coma
  flotante: 10.000 → 12.000 cuenta). En `percent`, la diferencia no se muestra (serían puntos).
- **Base con hijos que llegan tarde**: se toma al conectar; si el documento está cargando, en
  `DOMContentLoaded`; lo que entra en el mismo turno (una app que agrega los campos justo después de
  insertar el elemento) se suma a la base en un microtask, salvo que ya se haya llamado
  `snapshot()`. Una fila que entra después es nueva.
- **Filas**: por `id` (un campo `id` en la fila, o el valor de `data-review-row`); las filas sin `id`
  se emparejan por posición entre ellas (así una línea nueva sin guardar no se confunde con una
  guardada). «Línea n» es la posición en la tabla; el título suma su primer texto («Línea 3 ·
  Platina»). Los ocultos solo se leen si son la clave de una fila (`…id`) o tienen `data-label`.
- **Estado**: un select es «estado» con `data-review="status"` o si su nombre es `estado`, `status` o
  `state`.
- **Grupo de filas**: su etiqueta es el `data-label`/`aria-label` del contenedor
  (`data-review-rows`, la tabla o el fieldset), el `<caption>` o el `<legend>`; la de cada columna, la
  del campo o el `<th>` de su columna.
- **Casillas**: una sola es Sí/No; varias con el mismo nombre son una lista («Lunes, Miércoles»).
  Sin marcar es lo mismo que vacío (así una casilla nueva sin marcar no cuenta como cambio).
- **Textos**: citados («“Entregar en portería”»), para distinguirlos de «(vacío)»; más de 48
  caracteres (o un `<textarea>`) van como diferencia por palabras, con el mismo estilo que history.
- **El panel se pone al día** si alguien cambia un campo con el resumen abierto (con la pausa de
  `dirty`); si ya no queda nada, se cierra solo (`nx-review-cancel`).
- **Encabezado**: `<h3>` enfocable (`tabindex=-1`) con `aria-live="polite"`, dentro de
  `role="region"` con `aria-labelledby`. El foco programático no dibuja anillo en el título (no es un
  control); los botones sí.
- **Despliegue**: `@starting-style` con `block-size: 0` + `interpolate-size` donde existe (Chrome);
  en los demás, aparece con un fundido. `prefers-reduced-motion`: sin transición, y el
  `scrollIntoView` va sin animación.
- **Esc** se maneja en el panel (`keydown`, `preventDefault` + `stopPropagation`) para que dentro de
  un `<nx-dialog>` no cierre el diálogo.
- **`locale` como propiedad** (refleja el atributo) para que BDUI lo pueda pasar.

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el diseño del panel (claro/oscuro, las paletas,
  angosto con `@container`), ni axe/contraste (`npm run contrast` no corrió), ni Playwright.
- La transición de despliegue (`@starting-style` + `interpolate-size`) y el `scrollIntoView` con un
  formulario largo.
- El reenvío real con `requestSubmit(submitter)` en cada navegador (en happy-dom sí: el `submitter`
  llega igual) y el orden de los oyentes en captura cuando el resumen va dentro del `<form>`.
- Esc dentro de un `<nx-dialog>` real y el anuncio del `aria-live` en lectores de pantalla.
- La demo de la galería solo se probó montándola en happy-dom (una prueba temporal, no versionada):
  las filas, los «Prueba esto», el aviso de guard en el resumen, el JSON de la bitácora y el rebase.
