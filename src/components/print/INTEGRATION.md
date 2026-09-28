# `<nx-print>`: integración

Imprimir bien a la primera: vista previa paginada en hojas del tamaño real (carta por defecto), con
encabezado y pie en cada hoja, `<thead>` repetido, «Van / Vienen» en las tablas que suman, viudas y
huérfanas, `{page}` / `{pages}`, zoom y un botón «Imprimir» que imprime exactamente la vista previa.

Archivos: `print.ts` (el elemento), `logic.ts` (puro: tamaños, márgenes, zoom y `paginatePrint`),
`types.ts`, `print.css`, `index.ts`. Pruebas: `test/print.logic.test.ts`, `test/print.dom.test.ts`.
Galería: `gallery/pages/print.html`, `gallery/pages/print.css`, `gallery/demo-print.ts`.

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Print", { tag: "nx-print", props: ["size", "orientation", "margin", "heading", "currency", "zoom", "locale", "labels", "toolbar"] }],
```

(Todas son atributos salvo `labels`, que acepta el objeto o su JSON. El documento en sí son los
**hijos** del elemento, HTML de la app: el adaptador BDUI no lleva marcado, a propósito, así que un
payload BDUI solo configura la hoja; el contenido lo pone la app, o un componente BDUI que lo pinte
dentro.)

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo, con lo que importa
estáticamente; no hay `import()`):

| Pieza | Tamaño | Presupuesto | Límite propuesto |
|---|---|---|---|
| `dist/print.js`: elemento + paginación + núcleo (`define`, `h`, `mergeLabels`, `nxFormat`) | **7,89 KB** (8 077 B) | 8 KB | 8,25 KB |
| `dist/print.css` | **1,31 KB** (1 338 B) | 2,5 KB | 1,75 KB |

Para quedar bajo 8 KB el botón «Imprimir» va sin ícono (un SVG propio costaba ~170 B; `glyph()` de
`core/icons` arrastraba el registro de íconos, ~350 B).

Para `scripts/size.mjs`:

```js
  ["dist/print.js", 8.25 * 1024, "print + núcleo (ESM)"],
  // …
  ["dist/print.css", 1.75 * 1024, "print (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV`:

```ts
  { id: "print", label: "Imprimir documentos", href: "#/print", icon: "receipt", section: "Componentes", badge: "Nuevo" },
```

(Lucide tiene `printer`, pero `src/icons/lucide.ts` no lo trae; si se agrega, es mejor ícono:
`printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>'`.)

En `PAGES`: `"#/print": { template: "page-print", mount: mountPrintDemo },` con
`import { mountPrintDemo } from "./demo-print";` e `import "./pages/print.css";`. La plantilla está en
`gallery/pages/print.html` para pegarla en `gallery/index.html`. `demo-print.ts` importa `print.css`
directamente (mientras `nx-ui.css` no lo haga); esa línea sobra al unir. La demo usa `numberToWords`
de `src/components/number/logic.ts` (el total en letras) y `formatNit`/`nitCheckDigit` de `src/core/nit.ts`;
la librería no los importa. No registra rutas en `demo-api.ts`.

## Solid

En `src/solid/index.tsx`: agregar `<Print>` al comentario de cabecera, y

```tsx
import "../components/print/index";
import type { NxPrint } from "../components/print/print";
import type { PrintLabels, PrintOrientation, PrintPaginateDetail, PrintZoom } from "../components/print/types";

export type { NxPrint, PrintLabels, PrintOrientation, PrintPaginateDetail, PrintZoom };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `labels`: agregar `| Partial<PrintLabels>` a la unión.
    }
    interface ExplicitAttributes {
      // `size` ya existe como `DialogSize`: ampliarlo a `DialogSize | string` (acá es «letter», «a4» o «216mm 140mm»).
      orientation: PrintOrientation | undefined;
      margin: string | undefined;
      zoom: string | undefined;
      toolbar: "false" | undefined;
      // `heading`, `currency` y `locale` ya existen.
    }
    interface CustomEvents {
      "nx-print-paginate": CustomEvent<PrintPaginateDetail>;
      "nx-print-before": CustomEvent<PrintPaginateDetail>;
      "nx-print-after": CustomEvent<PrintPaginateDetail>;
    }
    interface IntrinsicElements {
      "nx-print": HTMLAttributes<NxPrint> & { heading?: string };
    }
```

El envoltorio (los hijos son el documento; van tal cual, Solid los hidrata en su sitio porque el
elemento nunca los mueve):

```tsx
export interface PrintProps extends JSX.HTMLAttributes<NxPrint> {
  /** `letter` (por defecto), `a4`, `a5`, `legal`, `oficio`, `half-letter` o «216mm 140mm». */
  size?: string;
  orientation?: PrintOrientation;
  /** Uno a cuatro valores, como en CSS (12 mm). */
  margin?: string;
  /** Título del documento: el nombre sugerido del PDF. */
  heading?: string;
  currency?: string;
  /** `"fit"` (por defecto) o un factor (1 = tamaño real). */
  zoom?: PrintZoom;
  locale?: string;
  labels?: Partial<PrintLabels>;
  toolbar?: boolean;
  onPaginate?: (e: CustomEvent<PrintPaginateDetail>) => void;
  onBeforePrint?: (e: CustomEvent<PrintPaginateDetail>) => void;
  onAfterPrint?: (e: CustomEvent<PrintPaginateDetail>) => void;
  children?: JSX.Element;
}

export function Print(props: PrintProps): JSX.Element {
  const [local, rest] = splitProps(props, ["size", "orientation", "margin", "heading", "currency", "zoom", "locale", "labels", "toolbar", "onPaginate", "onBeforePrint", "onAfterPrint", "children"]);
  return (
    <nx-print
      {...rest}
      prop:labels={local.labels}
      attr:size={local.size}
      attr:orientation={local.orientation}
      attr:margin={local.margin}
      attr:heading={local.heading}
      attr:currency={local.currency}
      attr:zoom={local.zoom === undefined ? undefined : String(local.zoom)}
      attr:locale={local.locale}
      attr:toolbar={local.toolbar === false ? "false" : undefined}
      on:nx-print-paginate={(e) => local.onPaginate?.(e)}
      on:nx-print-before={(e) => local.onBeforePrint?.(e)}
      on:nx-print-after={(e) => local.onAfterPrint?.(e)}
    >
      {local.children}
    </nx-print>
  );
}
```

## README

````md
## `<nx-print>`

**Imprimir bien a la primera.** Facturas, remisiones, órdenes de compra, cotizaciones y actas desde
HTML. `window.print()` corta filas a la mitad, pierde el encabezado de la tabla en la página 2 y no
dice «Página 2 de 3»; `<nx-print>` mide el documento y lo reparte en hojas del tamaño real, y lo que
sale del diálogo de impresión es exactamente esa vista previa, no el resto de la app.

- **Hojas de verdad**: `letter` (carta, por defecto), `a4`, `a5`, `legal`, `oficio` (21,6 × 33 cm),
  `half-letter` (media carta) o dos medidas («216mm 140mm»), en vertical u horizontal, con los
  márgenes que digas. Sobre un fondo gris, con zoom (ajustar al ancho, 100 %, + y −).
- **Encabezado y pie en cada hoja** (`slot="header"`, `slot="footer"`), con `{page}` y `{pages}`
  (también en cualquier elemento con `data-print-page`).
- **Tablas**: nunca una fila partida; `<thead>` en cada hoja; al menos dos filas a cada lado del
  corte. Las columnas con `data-print-sum` en su `<th>` llevan «Van: $ 12.450.000» al pie de la hoja y
  «Vienen» al comienzo de la siguiente.
- **Cortes**: `data-print-keep` (o `break-inside: avoid`) no parte un bloque;
  `data-print-keep-with-next` (o `break-after: avoid`) no deja un título solo al pie;
  `data-print-break="before|after"` fuerza el salto.
- **Siempre al día**: si el contenido cambia, carga una imagen o una fuente, o cambian tamaño y
  márgenes, se vuelve a paginar, con espera y una sola lectura de alturas; si nada cambia, no trabaja.
- **PDF**: «Guardar como PDF» abre el diálogo del navegador con una pista y el número del documento
  como nombre del archivo. No hay un PDF propio: sin dependencias no se puede hacer bien.

```html
<nx-print class="factura" size="letter" margin="12mm" heading="FV-2026-01873" currency="COP">
  <header slot="header">…logo, NIT, número… <span data-print-page>Página {page} de {pages}</span></header>
  <footer slot="footer">Resolución DIAN… · Página {page} de {pages}</footer>
  <section data-print-keep>…cliente…</section>
  <table>
    <thead><tr><th>Descripción</th><th>Cant.</th><th data-print-sum>Vr. total</th></tr></thead>
    <tbody>…</tbody>
  </table>
  <h3 data-print-keep-with-next>Observaciones</h3>
  <p>…</p>
</nx-print>
```

Estiliza el documento con selectores de descendiente (`.factura td`), no de hijo directo
(`nx-print > table`) ni por `id`: las hojas son copias sin `id`. Solo se parten las tablas que son
hijas directas del elemento.

| | |
|---|---|
| Atributos / propiedades | `size`, `orientation` (`portrait`, `landscape`), `margin`, `heading`, `currency`, `zoom` (`fit` o un factor), `locale`, `labels`, `toolbar` (`"false"` la quita) · `pages` (solo lectura) |
| Métodos | `print()`, `paginate()` (devuelve el número de hojas) |
| Eventos | `nx-print-paginate` `{pages}`, `nx-print-before` `{pages}` (cancelable), `nx-print-after` `{pages}` |
| En el documento | `slot="header"`, `slot="footer"`, `{page}`, `{pages}`, `data-print-page`, `data-print-keep`, `data-print-keep-with-next`, `data-print-break`, `data-print-sum` (`number` para cantidades), `data-currency`, `data-value` |
| Funciones | `paginatePrint(blocks, {pageHeight, minRows?})`, `parsePrintSize()`, `parsePrintMargin()`, `fillPageText()`, `PRINT_SIZES`, `PRINT_LABELS` |
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/print/index";`. Nombres revisados contra lo exportado
  hoy: `NxPrint`, `PRINT_LABELS`, `PRINT_SIZES`, `paginatePrint`, `parsePrintSize`, `parsePrintMargin`,
  `fillPageText` y los tipos `Print*` son nuevos (ningún componente exporta nada con «print»).
  `toMm`, `parseZoom`, `stepZoom`, `ZOOM_STEPS` y `PX_PER_MM` quedan internos a propósito (nombres
  genéricos que chocarían).
- `src/styles/nx-ui.css` → `@import "../components/print/print.css";`
- `vite.config.ts` → `print: "src/components/print/index.ts",`
- `scripts/build-css.mjs` → `"print": "src/components/print/print.css",`
- `package.json` → `"./print": { "types": "./dist/types/components/print/index.d.ts", "import": "./dist/print.js" }`
  y `"./print.css": "./dist/print.css"`. `sideEffects` ya cubre `./src/components/*/index.ts` y los chunks.
- `README.md` → la sección de arriba.

## Decisiones

- **Accesibilidad: el original es el accesible.** Los hijos del autor quedan en su sitio, ocultos a la
  vista con la técnica «solo para lectores» (1 px, `clip-path`), y el lector los recorre como un
  documento normal: una tabla, un encabezado de tabla, sin «Van/Vienen» ni encabezados repetidos. Las
  hojas llevan `aria-hidden` e `inert` (nada enfocable adentro). Excepciones: el **pie** original
  (`slot="footer"`) y los elementos con **`data-print-page`** del original van con `display: none`,
  porque sus textos son marcas («Página {page} de {pages}») que el lector leería tal cual. Si el pie
  lleva datos que importan (la resolución DIAN), también están en la hoja; para el lector conviene
  repetirlos en el cuerpo o en el encabezado.
- **Se mide en una hoja de medir, no el original.** Las copias van a una hoja invisible del mismo ancho
  y con los mismos estilos que las definitivas; así lo medido es lo que se pinta (y el original sigue
  oculto y sin tocar). Se leen todas las alturas de una vez (`getBoundingClientRect` y
  `getComputedStyle`), sin escrituras en medio; después las mismas copias pasan a sus hojas (las filas
  se mueven, no se vuelven a clonar). Hay una prueba que verifica que no hay lecturas después de
  escribir las hojas.
- **Anchos de columna fijos** en cada pedazo de tabla (`table-layout: fixed` con los anchos medidos
  de la primera fila completa): si no, cada hoja calcularía sus columnas con sus filas, el texto se
  envolvería distinto y las alturas medidas no valdrían.
- **Alturas y espacios**: cada bloque avanza su alto más el espacio hasta el siguiente (márgenes
  colapsados, medidos). El espacio de después no cuenta al pie de la hoja, y el primer bloque de cada
  hoja va sin margen superior. Se dejan 1 px de holgura por redondeo.
- **La fila «Van/Vienen»**: la etiqueta ocupa las columnas hasta la primera que suma
  (`<th scope="row" colspan>`) y cada columna que suma lleva su total; se mide con una fila de muestra
  (con el total general, el texto más ancho). Se suma en centavos enteros: 5.000 filas sin error de
  coma flotante. `data-print-sum="number"` suma cantidades (kilos, unidades) sin moneda. El valor de
  cada celda sale de `data-value` o de su texto con `nxFormat(locale).parse`.
- **`<tfoot>` solo al final** (los totales de la tabla), no en cada hoja como hace el navegador;
  `<caption>` solo en la primera.
- **Bloque más alto que una hoja**: se parte en tajadas del alto de la hoja (se ve con un margen
  negativo dentro de una caja recortada). Puede cortar una línea de texto a la mitad: es el último
  recurso para que nada se pierda. Solo las **tablas hijas directas** se parten por filas; una tabla
  dentro de un `<div>` es un bloque más.
- **Ctrl+P**: el primer `<nx-print>` visible de la página toma el `beforeprint` y se imprime como su
  vista previa. `nx-print-before` es cancelable también ahí: cancelarlo deja imprimir la página tal cual
  (el diálogo ya está abierto; no se puede evitar).
- **La hoja de impresión** se inyecta al imprimir y se quita en `afterprint`: `@page { size; margin: 0 }`
  y, con `:has()`, oculta todo lo que no contenga el `<nx-print>` que imprime y aplana a sus ancestros
  (`display: block`, sin posición, alto, desborde ni transformaciones), para que un layout de app con
  `height: 100vh; overflow: auto` no corte la impresión en una hoja. El resto (la barra, el zoom, las
  sombras, un salto por hoja) está en `print.css` bajo `nx-print[data-nx-printing]`.
- **El título** (`heading`) reemplaza `document.title` mientras el diálogo está abierto: Chrome y Edge
  lo usan como nombre del PDF.
- **`print()` y `afterprint`**: se limpia en `afterprint`, que los navegadores de escritorio emiten
  dentro de `window.print()` (bloquea). Donde `print()` no bloquea, la hoja queda puesta hasta que llega
  `afterprint`; en pantalla no se nota (es `@media print`).
- **Zoom**: `fit` (por defecto) ajusta al ancho **sin pasar de 100 %**: en pantallas anchas una hoja
  carta a 150 % se ve peor que a tamaño real. Se aplica con la propiedad CSS `zoom` sobre la pila de
  hojas (fuera de la hoja de medir, así no afecta las medidas); al imprimir, `zoom: 1`.
  Un `ResizeObserver` sobre la mesa solo recalcula el zoom, nunca vuelve a paginar.
- **Barra**: `role="toolbar"` con una sola parada de tabulación (flechas, Inicio y Fin); los botones de
  símbolo (−, +) llevan `aria-label`; «100 %» lleva su texto como nombre y «Tamaño real» como `title`
  (así el nombre accesible coincide con lo que se ve). La pista del PDF es `role="status"` y se pinta
  antes de abrir el diálogo (un frame y un `setTimeout`).
- **`oficio`** es el de Colombia (21,6 × 33 cm); `legal` es el Legal de EE. UU. (21,6 × 35,6 cm): las
  impresoras los distinguen. El encargo decía «legal —oficio—»; están los dos.
- **Tamaño con medidas y orientación**: con un nombre, sin `orientation` va vertical; con medidas
  («216mm 140mm»), van como se escribieron salvo que `orientation` diga otra cosa.
- **`innerHTML` nuevo**: si la app reemplaza los hijos del elemento (y con ellos la vista previa), la
  próxima paginación la vuelve a poner al final.
- **Hojas blancas en modo oscuro**: son papel. `color-scheme: light` en la hoja hace que los tokens
  `--nx-*` que use el documento se resuelvan en claro.

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni la vista previa, ni el diálogo de impresión real, ni
  axe/contraste, ni modo oscuro. Las pruebas usan happy-dom con alturas simuladas.
- **Lo impreso de verdad**: que `@page { size; margin: 0 }` más hojas de alto exacto den una hoja por
  hoja sin una página en blanco al final por redondeo (si aparece, bajar el alto de la hoja impresa
  una fracción de milímetro), que el aplanado de ancestros con `:has()` deje solo las hojas en layouts
  reales (la galería con su menú lateral), y `print-color-adjust: exact` para las bandas grises.
- **Que lo medido coincida con lo pintado**: márgenes colapsados, `border-collapse`, anchos fijos de
  columna y la holgura de 1 px. Con fuentes que cargan tarde, que `document.fonts` dispare la
  re-paginación a tiempo.
- **El rendimiento de 500 líneas < 100 ms** con layout real: la prueba solo verifica un único pase de
  lectura (lineal) y el reparto puro de 5.000 filas en < 50 ms; el costo real lo pone el layout del
  navegador.
- La propiedad CSS `zoom` (Firefox la soporta desde la 126) y el cálculo de «ajustar al ancho».
- Que la pista de «Guardar como PDF» alcance a pintarse antes de que el diálogo bloquee la página.
- Que `document.title` temporal se use como nombre del PDF en Firefox y Safari (en Chrome sí es así).
- Los tamaños reales de la demo (que la factura de 60 líneas ocupe 3 hojas carta y la remisión 2
  medias cartas) dependen de las fuentes; no se midieron.
