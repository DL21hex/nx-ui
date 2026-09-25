# `<nx-trend>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Trend", { tag: "nx-trend", props: ["series", "anomalies", "heading", "kind", "format", "currency", "height", "detect", "explainEndpoint", "busy", "locale", "labels"] }],
```

## Peso

Medido con los comandos del brief (gzip -9):

- JS `src/components/trend/index.ts` (ESM, minificado, con núcleo), sin `<nx-ai-answer>` (se carga
  con `import("../ai/index")` la primera vez que se pregunta; medido con `--external:../ai/index`,
  igual que el plugin `dynamic-external` de `scripts/size.mjs`): **9.885 B (9,7 KB)**.
  Con el comando literal del brief (esbuild sin `--splitting` mete el `import()` en el mismo
  archivo): 14.828 B; esa diferencia es el chunk de IA, que en `dist/` sale aparte (y es el mismo
  `dist/ai.js` si la app ya lo usa).
- CSS `src/components/trend/trend.css`: **2.454 B (2,4 KB)**. No incluye el de `<nx-ai-answer>`
  (`ai.css`), que el popover necesita: ya viene en `nx-ui.css`; quien cargue CSS por componente
  debe cargar también `ai.css`.

Límites propuestos para `scripts/size.mjs` (en `BUDGET`):

```js
  ["dist/trend.js", 10 * 1024, "trend + núcleo (ESM; nx-ai-answer con import())"],
  // …
  ["dist/trend.css", 3 * 1024, "trend (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV` (por ejemplo, después de «Número»):

```ts
  { id: "trend", label: "Tendencias", href: "#/trend", icon: "trending-up", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES`: `"#/trend": { template: "page-trend", mount: mountTrendDemo },` con
`import { mountTrendDemo } from "./demo-trend";` e `import "./pages/trend.css";` (el CSS de la
demo). La plantilla está en `gallery/pages/trend.html` para pegarla en `gallery/index.html`. La ruta
`/demo/trend/why` la registra el propio `gallery/demo-trend.ts` con `addDemoRoute` al importarse (no
hay que tocar `demo-api.ts`).

## Solid

En `src/solid/index.tsx`.

Comentario de cabecera: agregar `<Trend>` a la lista de envoltorios. Imports y reexport:

```tsx
import "../components/trend/index";
import type { NxTrend } from "../components/trend/trend";
import type { TrendAnomaly, TrendFormat, TrendKind, TrendLabels, TrendSeries, TrendWhyDetail } from "../components/trend/types";

export type { NxTrend, TrendAnomaly, TrendFormat, TrendKind, TrendLabels, TrendSeries, TrendWhyDetail };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      series: TrendSeries[] | undefined;
      anomalies: TrendAnomaly[] | undefined;
      // `labels`: agregar `| Partial<TrendLabels>` a la unión.
    }
    interface ExplicitAttributes {
      kind: TrendKind | undefined;
      detect: string | undefined;
      "explain-endpoint": string | undefined;
      // `format` ya existe como `NumberFormat` (los mismos tres valores que `TrendFormat`);
      // `heading`, `currency`, `height` y `locale` ya existen.
    }
    interface ExplicitBoolAttributes {
      // `busy` ya existe.
    }
    interface CustomEvents {
      "nx-trend-why": CustomEvent<TrendWhyDetail>;
      "nx-trend-toggle": CustomEvent<{ id: string; visible: boolean }>;
    }
    interface IntrinsicElements {
      "nx-trend": HTMLAttributes<NxTrend> & { heading?: string };
    }
```

El envoltorio (al final del archivo):

```tsx
export interface TrendProps extends JSX.HTMLAttributes<NxTrend> {
  /** `{id, label, points: {x, y}[], format?, currency?, kind?, muted?, hidden?}`. */
  series: TrendSeries[];
  /** `{series, x, label?}`: anillo que late y etiqueta corta. */
  anomalies?: TrendAnomaly[];
  heading?: string;
  /** Por defecto de las series: `line` (por defecto) o `bar`. */
  kind?: TrendKind;
  format?: TrendFormat;
  /** Con `money`: ISO («COP») o un símbolo. */
  currency?: string;
  /** Alto en px, con el eje x (260). */
  height?: number;
  /** Detección automática: `true` (3 desviaciones robustas) o un número. */
  detect?: boolean | number;
  /** Protocolo de IA que contesta «¿por qué?» (POST `{question, context}`). */
  explainEndpoint?: string;
  busy?: boolean;
  locale?: string;
  labels?: Partial<TrendLabels>;
  /** Clic o Enter en un punto (cancelable: no se abre el popover). */
  onWhy?: (e: CustomEvent<TrendWhyDetail>) => void;
  /** La leyenda mostró u ocultó una serie. */
  onToggle?: (e: CustomEvent<{ id: string; visible: boolean }>) => void;
}

export function Trend(props: TrendProps): JSX.Element {
  const [local, rest] = splitProps(props, ["series", "anomalies", "heading", "kind", "format", "currency", "height", "detect", "explainEndpoint", "busy", "locale", "labels", "onWhy", "onToggle"]);
  return (
    <nx-trend
      {...rest}
      prop:series={local.series}
      prop:anomalies={local.anomalies}
      prop:labels={local.labels}
      attr:heading={local.heading}
      attr:kind={local.kind}
      attr:format={local.format}
      attr:currency={local.currency}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:detect={local.detect === true ? "" : local.detect ? String(local.detect) : undefined}
      attr:explain-endpoint={local.explainEndpoint}
      attr:locale={local.locale}
      bool:busy={!!local.busy}
      on:nx-trend-why={(e) => local.onWhy?.(e)}
      on:nx-trend-toggle={(e) => local.onToggle?.(e)}
    />
  );
}
```

## README

````md
## `<nx-trend>`

Un gráfico que se explica. Series de tiempo del ERP (ventas, costos, inventario) en líneas o barras,
en SVG propio y sin librerías, con la pregunta que importa a un clic: **«¿por qué?»**.

- **Se lee:** ticks redondos en el eje y («400 M», con `Intl`), meses cortos en el x (con el año bajo
  enero), cuadrícula de una línea, el último valor al final de cada línea, y una leyenda que muestra
  y oculta series (el color sigue a la serie, no a su posición). Se adapta al ancho (ResizeObserver).
- **Se recorre:** una línea vertical sigue al puntero, o a ←/→ con el foco en el gráfico, con un
  tooltip de todas las series en ese periodo; ↑/↓ cambian de serie.
- **Anomalías:** las que manda el backend (`anomalies`) y, con `detect`, las que se apartan de la
  media móvil (desviación robusta, así una serie que crece parejo no se marca entera): un anillo que
  late y una etiqueta corta («Acero +18 %»).
- **«¿Por qué?»:** clic o Enter en un punto abre, anclado a él, un `<nx-ai-answer>` que pregunta a
  `explain-endpoint` «¿Por qué sube Materia prima en agosto?» con `context: {series, point, previous,
  window, anomaly?}` y muestra la respuesta en streaming con sus pasos y citas (el protocolo de IA de
  la librería). Se puede repreguntar desde la caja. `<nx-ai-answer>` se carga con `import()` la
  primera vez.
- **Accesible:** el SVG es una imagen con un resumen generado («Ventas: sube 11 % de julio a agosto;
  máximo en agosto»), que también se ve debajo; cada punto es un botón (un solo Tab); la tabla
  equivalente está siempre para el lector de pantalla y a la vista con «Ver como tabla»; cada serie
  tiene además su forma de marcador. Los colores (`--nx-trend-1…8`) son una paleta categórica
  validada para daltonismo en claro y en oscuro; `muted` pinta una serie de referencia en gris.
- **Movimiento:** la línea se dibuja y las barras crecen al llegar los datos (nada con
  `prefers-reduced-motion`).

```html
<nx-trend id="costos" heading="Costo de producción 2026" format="money" currency="COP"
  explain-endpoint="/ia/por-que" detect></nx-trend>
<script>
  costos.series = [
    { id: "mp", label: "Materia prima", points: [{ x: "2026-01", y: 388400000 }, /* … */] },
    { id: "mo", label: "Mano de obra", points: [/* … */] },
  ];
  costos.anomalies = [{ series: "mp", x: "2026-08", label: "Acero +18 %" }];
  costos.addEventListener("nx-trend-why", (e) => console.log(e.detail.question, e.detail.point));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `series` (`{id, label, points: {x, y}[], format?, currency?, kind?, muted?, hidden?}`; `x` «2026-08» o «2026-08-15»; `y` `null` corta la línea), `anomalies` (`{series, x, label?}`), `heading`, `kind` (`line`, `bar`), `format` (`number`, `money`, `percent`), `currency`, `height` (260), `detect` (sin valor: 3), `explain-endpoint`, `busy`, `locale`, `labels` · `flags`, `summary` |
| Métodos | `explain(id, x, pregunta?)`, `close()` |
| Eventos | `nx-trend-why` `{question, series, point, previous, window, anomaly?}` (cancelable: no se abre el popover), `nx-trend-toggle` `{id, visible}` |
| Funciones | `detectAnomalies(serie, umbral?, ventana?)`, `niceTicks(min, max)`, `periodLabel(x, locale, estilo)`, `summarizeTrend(series, anomalías, labels, locale)`, `trendQuestion(…)`, `trendContext(…)` |
````

## A11y

Para `e2e/a11y.spec.ts`:

```ts
test("tendencias: gráfico, tooltip, popover con la respuesta y tabla", async ({ page }) => {
  await open(page, "#/trend");
  await audit(page, ["#trend-cost", "#trend-sales"]);
  await page.locator("#trend-cost").getByRole("button", { name: /^Materia prima, agosto 2026/ }).focus();
  await expect(page.locator("#trend-cost .nx-trend__tip")).toBeVisible();
  await audit(page, ["#trend-cost"]);
  await page.keyboard.press("Enter");
  await expect(page.locator(".nx-trend-why .nx-ai__answer")).toContainText("Aceros del Caribe", { timeout: 10_000 });
  await expect(page.locator(".nx-trend-why .nx-ai__summary")).toBeVisible({ timeout: 10_000 });
  await audit(page, [".nx-trend-why"]);
  await page.keyboard.press("Escape");
  await page.locator("#trend-cost").getByRole("button", { name: "Ver como tabla" }).click();
  await audit(page, ["#trend-cost"]);
});
```

## Notas

- **No toqué el núcleo** (`src/core/`). Uso `h()`, `safeHref()`, `nxFormat()`/`resolveLocale()` y
  `boolAttr()`; el SVG se arma con un ayudante propio (`createElementNS`, textos como nodos de texto).
- **Otros archivos a tocar** (como con los demás): `src/index.ts` → `export * from
  "./components/trend/index";`; `src/styles/nx-ui.css` → `@import "../components/trend/trend.css";`;
  `vite.config.ts` (entradas de la librería) → `trend: "src/components/trend/index.ts"`;
  `scripts/build-css.mjs` → `trend: "src/components/trend/trend.css"`; `package.json` →
  `"./trend": { "types": "./dist/types/components/trend/index.d.ts", "import": "./dist/trend.js" }`
  y `"./trend.css": "./dist/trend.css"`. Los nombres que exporta no chocan con los que ya hay
  (`niceTicks`, `periodLabel`, `detectAnomalies` son nuevos; revisar si se prefiere prefijarlos).
- **Galería (para probar):** además de la plantilla y la navegación, `gallery/main.ts` necesita el CSS
  del componente mientras `nx-ui.css` no lo importe (`import "../src/components/trend/trend.css";`,
  que sobra una vez agregado a `nx-ui.css`).
- **Colores:** la paleta categórica es la de referencia de la skill de visualización, validada con su
  script contra `--nx-card` (blanco y oklch 0,225): pasa separación para daltonismo y el piso de
  visión normal en claro y oscuro; en claro, aqua/amarillo/magenta quedan por debajo de 3:1 contra el
  fondo, y por eso hay marcadores con forma, valores al final de la línea y la tabla. No uso
  `--nx-primary` como primer color a propósito: con paletas como «terracota» chocaría con el naranja
  del segundo lugar. Se cambian con `--nx-trend-1…8` y `--nx-trend-muted`.
- **Decisiones a revisar:** los meses sin dato (`y: null`) cortan la línea y no son puntos; una serie
  no se puede ocultar si es la última visible; el eje y arranca en cero solo si hay barras visibles
  (las líneas usan el rango de los datos); el eje x junta los periodos de todas las series (ocultar
  una no lo mueve). Con `money`, los ticks van compactos sin símbolo («400 M»), como pide el brief.
- **Repreguntar:** usa la caja de `<nx-ai-answer>`, con el mismo `context`; mientras una respuesta
  llega, Enter la detiene (es el comportamiento de `<nx-ai-answer>`).
- **`tsc`:** los únicos errores son los de `examples/solid/main.tsx` (no encuentra `nx-ui` porque el
  worktree no tiene `dist/`), preexistentes y ajenos a este componente.
- **Verificado solo en Chromium** (Playwright con el Chromium instalado, más captura en claro,
  oscuro y 390 px, y axe en claro y oscuro sin violaciones). No corrí Firefox ni WebKit.
