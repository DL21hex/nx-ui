# `<nx-kanban>`: integración

## BDUI

En `src/bdui.ts`, en la lista de componentes:

```ts
  ["Kanban", { tag: "nx-kanban", props: ["columns", "cards", "labels", "heading", "undo", "busy"] }],
```

## Peso

Medido con esbuild (min + gzip -9):

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/kanban.js`: kanban + toast + núcleo, con los `import()` fuera (como mide `scripts/size.mjs`) | **10,14 KB** (10 381 B) | 11 KB |
| `dist/kanban.css` | **2,30 KB** (2 354 B) | 3 KB |

`nxConfirm` (con `<nx-dialog>` y `<nx-button>`, ~8,9 KB) **se carga con `import("../confirm/index")` solo
cuando una tarjeta cae en una columna con `confirm`**: no pesa en la entrada del tablero. Con el comando
del brief (`esbuild --bundle` sin `--splitting`, que mete el `import()` en el mismo archivo) sale 17,2 KB;
en la build de la librería es un chunk aparte (la entrada `confirm` que ya existe).

Para `scripts/size.mjs`:

```js
  ["dist/kanban.js", 11 * 1024, "kanban + toast + núcleo (ESM; nxConfirm se carga con import())"],
  ["dist/kanban.css", 3 * 1024, "kanban (CSS)"],
```

## Nav

En `gallery/main.ts` (`NAV`), después de «Bandeja»:

```ts
  { id: "kanban", label: "Tablero", href: "#/kanban", icon: "layout-dashboard", section: "Componentes", badge: "Nuevo" },
```

y en `PAGES`: `"#/kanban": { template: "page-kanban", mount: mountKanbanDemo },` con
`import { mountKanbanDemo } from "./demo-kanban";`.

## Solid

En `src/solid/index.tsx`:

```tsx
import "../components/kanban/index";
import type { NxKanban } from "../components/kanban/kanban";
import type { KanbanCard, KanbanColumn, KanbanLabels, KanbanMoveDetail } from "../components/kanban/types";
export type { NxKanban, KanbanCard, KanbanColumn, KanbanLabels, KanbanMoveDetail };

export interface KanbanProps extends JSX.HTMLAttributes<NxKanban> {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  heading?: string;
  /** Milisegundos para deshacer un movimiento (7000); 0 registra al instante. */
  undo?: number;
  /** Cargando: columnas con tarjetas de relleno. */
  busy?: boolean;
  locale?: string;
  labels?: Partial<KanbanLabels>;
  /** Cancelable: la tarjeta vuelve a su lugar. */
  onMove?: (e: CustomEvent<KanbanMoveDetail>) => void;
  /** Pasó el tiempo de deshacer: aquí se registra en el backend. */
  onCommit?: (e: CustomEvent<KanbanMoveDetail>) => void;
  onUndo?: (e: CustomEvent<KanbanMoveDetail>) => void;
  onAdd?: (e: CustomEvent<{ column: string }>) => void;
  /** Cancelable: no se sigue el `href` de la tarjeta. */
  onOpen?: (e: CustomEvent<{ card: KanbanCard }>) => void;
}

export function Kanban(props: KanbanProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "cards", "heading", "undo", "busy", "locale", "labels", "onMove", "onCommit", "onUndo", "onAdd", "onOpen"]);
  return (
    <nx-kanban
      {...rest}
      prop:columns={local.columns}
      prop:cards={local.cards}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:undo={local.undo === undefined ? undefined : String(local.undo)}
      attr:locale={local.locale}
      bool:busy={!!local.busy}
      on:nx-kanban-move={(e) => local.onMove?.(e)}
      on:nx-kanban-commit={(e) => local.onCommit?.(e)}
      on:nx-kanban-undo={(e) => local.onUndo?.(e)}
      on:nx-kanban-add={(e) => local.onAdd?.(e)}
      on:nx-kanban-open={(e) => local.onOpen?.(e)}
    />
  );
}
```

En `declare module "solid-js"`:

- `ExplicitProperties`: `columns: GridColumn[] | KanbanColumn[];` (reemplaza la de `GridColumn[]`),
  `cards: KanbanCard[] | undefined;`, y agregar `| Partial<KanbanLabels>` a `labels`.
- `ExplicitAttributes`: nada nuevo (`heading`, `undo` y `locale` ya están).
- `ExplicitBoolAttributes`: nada nuevo (`busy` ya está).
- `CustomEvents`:
  ```ts
      "nx-kanban-move": CustomEvent<KanbanMoveDetail>;
      "nx-kanban-commit": CustomEvent<KanbanMoveDetail>;
      "nx-kanban-undo": CustomEvent<KanbanMoveDetail>;
      "nx-kanban-add": CustomEvent<{ column: string }>;
      "nx-kanban-open": CustomEvent<{ card: KanbanCard }>;
  ```
- `IntrinsicElements`: `"nx-kanban": HTMLAttributes<NxKanban> & { heading?: string };`

Y `<Kanban>` en la lista del comentario de cabecera.

## README

````md
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
````

## A11y

Para `e2e/a11y.spec.ts`:

```ts
test("tablero en reposo, filtrado, con una columna plegada y con una tarjeta levantada", async ({ page }) => {
  await open(page, "#/kanban");
  await audit(page, ["#kanban-demo"]);
  await page.locator("#kanban-demo .nx-kanban__filter").fill("logistica");
  await page.locator('#kanban-demo .nx-kanban__col[data-col="recibido"] .nx-kanban__fold').click();
  await audit(page, ["#kanban-demo"]);
  await page.locator("#kanban-demo .nx-kanban__filter").fill("");
  await page.locator('#kanban-demo .nx-kanban__card[data-id="2276"]').focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('#kanban-demo .nx-kanban__col[data-col="por-aprobar"] .nx-kanban__warn')).toBeVisible();
  await audit(page, ["#kanban-demo"]);
});
```

(Probado en claro y en oscuro: cero violaciones serias o críticas.)

## Notas

- **No toqué nada del núcleo** (`src/core/`) ni de otros componentes.
- Falta, además de lo de arriba: `export * from "./components/kanban/index";` en `src/index.ts`;
  `@import "../components/kanban/kanban.css";` en `src/styles/nx-ui.css`; la entrada
  `kanban: "src/components/kanban/index.ts"` en `vite.config.ts` (build de la librería) y
  `kanban: "src/components/kanban/kanban.css"` en `scripts/build-css.mjs`; `"./kanban"` y
  `"./kanban.css"` en los `exports` de `package.json` (como `./inbox`).
- **Galería:** la página está en `gallery/pages/kanban.html` (va en `gallery/index.html`, p. ej. después
  de la de la bandeja). El backend de mentira está en `gallery/server-kanban.ts`: en `vite.config.ts`,
  `import { configureKanban } from "./gallery/server-kanban";` y en `plugins` del modo `serve`,
  `{ name: "nx-demo-kanban", configureServer: configureKanban }`. Registra `POST /demo/kanban/impacto`.
- `gallery/demo-kanban.ts` importa `../src/components/kanban/index` para registrar el elemento; una vez
  que `src/index.ts` lo exporte, esa línea sobra pero no molesta.
- **Tab** va de columna en columna (una tarjeta por columna en el orden de Tab: la última enfocada) y
  las flechas se mueven entre tarjetas; así cada lista con scroll tiene contenido enfocable (axe
  `scrollable-region-focusable`).
- El filtro no usa transparencia para atenuar (axe la cuenta como contraste insuficiente): las tarjetas
  que no coinciden se aplanan y pasan a gris con `--nx-text-tertiary`.
- En la demo, la orden en dólares usa `currency: "US$"` (símbolo) y no `"USD"`: con `es-CO`,
  `Intl` con `currencyDisplay: "narrowSymbol"` pinta `USD` como «$», igual que un peso.
- `tsc --noEmit -p .` solo muestra los errores que ya había en `examples/solid/main.tsx` (no encuentra
  `nx-ui` sin `dist/`); nada de este componente.
