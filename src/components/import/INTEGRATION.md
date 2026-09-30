# `<nx-import>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Import", { tag: "nx-import", props: ["columns", "endpoint", "batch", "accept", "maxSize", "memory", "locale", "labels", "disabled"] }],
```

(Todo es serializable: `columns` y `labels` son JSON; `maxSize` acepta número de bytes o «20MB».)

## Peso

Medido con esbuild (min + gzip -9), `--bundle --splitting` (el `import()` del lector queda aparte):

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/import.js`: import + núcleo, con el lector de .xlsx fuera | **17,02 KB** (17 431 B) | 17,5 KB |
| Lector de .xlsx (`read-xlsx-*.js`, se carga solo al llegar un libro) | **1,99 KB** (2 042 B) | 2,5 KB |
| `dist/import.css` | **1,67 KB** (1 715 B) | 2 KB |
| `gallery/pages/import.css` (demo, no es de la librería) | 0,50 KB (509 B) | — |

**Pasa de los 14 KB del encargo** (el lector y el CSS quedan holgados). De dónde sale:

- **Núcleo, ~2,5 KB**: `nxFormat` (números, montos y fechas del locale), `h`, `glyph`, `mergeLabels`,
  `safeEndpoint`, `foldText`.
- **Residuo de `paste-fill/logic.ts`, 0,76 KB (761 B)**: el encargo pide importar `nitCheckDigit` de
  ahí, pero ese módulo tiene constantes de nivel superior que esbuild no puede descartar porque
  llaman a `.split()` / `new Set(…)` (`MONTHS`, `WEEKDAYS`, `CITIES`, `CONNECT`, `STOPW`): entran en
  el bundle aunque nadie las use. Medido: con una copia local de `nitCheckDigit` la entrada queda en
  16 569 B. Arreglo sin tocar el comportamiento: anotar esas constantes con `/* @__PURE__ */` en
  `paste-fill/logic.ts`, o mover `nitCheckDigit` al núcleo (`src/core/nit.ts`). No lo hice porque no
  es mi archivo.
- **Textos, ~1,2 KB**: ~80 textos de la interfaz y 14 mensajes de validación, en `labels`.
- El resto es el componente: tres pasos, lector CSV con detección de separador y codificación,
  encabezados desplazados, mapeo por nombre y por contenido con memoria, normalización y validación
  de 10 tipos, revisión editable, envío por lotes cancelable con errores del servidor y el CSV de lo
  que no entró. Está en la línea de `grid` (21,5 KB) y `paste-fill` (18,75 KB).

Recorté lo que no se usaba o se repetía (la confianza «a mano» / «de memoria» por fila, un `cellText`
duplicado, `min`/`max` que armaban un formateador en cada celda). No encontré más recortes sin quitar
algo del encargo.

Para `scripts/size.mjs`:

```js
  ["dist/import.js", 17.5 * 1024, "import + núcleo (ESM; el lector de .xlsx se carga aparte)"],
  [lazy("read-xlsx"), 2.5 * 1024, "lector de .xlsx de nx-import (se carga al llegar un libro)"],
  // …
  ["dist/import.css", 2 * 1024, "import (CSS)"],
```

**Ojo con `lazy()`:** busca el primer archivo de `dist/` que empiece por `${name}-`. El lector se llama
`read-xlsx.ts` (y no `xlsx-read.ts`) a propósito: un chunk `xlsx-read-*.js` también empezaría por
`xlsx-` y `lazy("xlsx")` (el generador del grid) podría medir el archivo equivocado.

## Construcción

- `src/index.ts` → `export * from "./components/import/index";` (los nombres no chocan: revisé los
  de todos los `index.ts`; las funciones puras salen con nombres propios: `parseCsv`,
  `detectCsvDelimiter`, `decodeImportBytes`, `detectHeaderRow`, `buildImportTable`, `autoMapColumns`,
  `cleanImportColumns`, `normalizeImportValue`, `validateImportRows`, `importValidator`,
  `parseImportNumber`, `parseImportDate`, `excelSerialDate`, `rememberImportMapping`,
  `recallImportMapping`, `importRowsToCsv`, `IMPORT_MESSAGES`, `IMPORT_LABELS`).
- `src/styles/nx32-elements.css` → `@import "../components/import/import.css";`
- `vite.config.ts` (entradas de la librería) → `import: "src/components/import/index.ts"`.
- `scripts/build-css.mjs` → `import: "src/components/import/import.css"`.
- `package.json` → `"./import": { "types": "./dist/types/components/import/index.d.ts", "import": "./dist/import.js" }`
  y `"./import.css": "./dist/import.css"`. `sideEffects` ya cubre `./dist/*.js` y
  `./src/components/*/index.ts`.

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los componentes nuevos):

```ts
  { id: "import", label: "Importar", href: "#/import", icon: "folder", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES`: `"#/import": { template: "page-import", mount: mountImportDemo },` con
`import { mountImportDemo } from "./demo-import";` e `import "./pages/import.css";`. La plantilla está
en `gallery/pages/import.html` para pegarla en `gallery/index.html`. La ruta de mentira
(`POST /demo/import/clientes`) la registra `demo-import.ts` con `addDemoRoute` al importarse (como
`demo-paste-fill.ts`). (No hay un ícono de «subir» en `src/icons/lucide.ts`; `folder` es el más
cercano de los que ya hay.)

## Solid

En `src/solid/index.tsx`.

Comentario de cabecera: agregar `<Import>` a la lista de envoltorios. Imports y reexport:

```tsx
import "../components/import/index";
import type { NxImport } from "../components/import/import";
import type { ImportColumnInput, ImportDoneDetail, ImportErrorDetail, ImportLabels, ImportMappedDetail, ImportParsedDetail, ImportState } from "../components/import/types";

export type { NxImport, ImportColumnInput, ImportDoneDetail, ImportErrorDetail, ImportLabels, ImportMappedDetail, ImportParsedDetail, ImportState };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `columns`: agregar `| ImportColumnInput[]` a la unión.
      // `labels`: agregar `| Partial<ImportLabels>` a la unión.
    }
    interface ExplicitAttributes {
      batch: string | undefined;
      accept: string | undefined;
      "max-size": string | undefined;
      memory: string | undefined;
      // `endpoint` y `locale` ya existen.
    }
    // `disabled` ya existe en ExplicitBoolAttributes.
    interface CustomEvents {
      "nx-import-parsed": CustomEvent<ImportParsedDetail>;
      "nx-import-mapped": CustomEvent<ImportMappedDetail>;
      "nx-import-done": CustomEvent<ImportDoneDetail>;
      "nx-import-error": CustomEvent<ImportErrorDetail>;
    }
    interface IntrinsicElements {
      "nx-import": HTMLAttributes<NxImport> & { endpoint?: string };
    }
```

El envoltorio (al final del archivo):

```tsx
export interface ImportProps extends JSX.HTMLAttributes<NxImport> {
  /** Los campos de destino: `{key, label, type?, required?, unique?, options?, aliases?, min?, max?, pattern?, hint?}`. */
  columns: ImportColumnInput[];
  /** Recibe `POST {rows, offset}` por lotes y puede responder `{errors: [{row, field?, message}]}`. Sin él, solo `onDone`. */
  endpoint?: string;
  /** Filas por lote (500). */
  batch?: number;
  accept?: string;
  /** Tamaño máximo del archivo: bytes o «20MB» (por defecto 20 MB). */
  maxSize?: number | string;
  /** Clave para recordar el mapeo (sin ella, el `id`). */
  memory?: string;
  locale?: string;
  labels?: Partial<ImportLabels>;
  disabled?: boolean;
  onParsed?: (e: CustomEvent<ImportParsedDetail>) => void;
  onMapped?: (e: CustomEvent<ImportMappedDetail>) => void;
  /** `{rows, skipped, mapping, fixed, headers}`: las filas ya normalizadas. */
  onDone?: (e: CustomEvent<ImportDoneDetail>) => void;
  onError?: (e: CustomEvent<ImportErrorDetail>) => void;
}

export function Import(props: ImportProps): JSX.Element {
  const [local, rest] = splitProps(props, ["columns", "endpoint", "batch", "accept", "maxSize", "memory", "locale", "labels", "disabled", "onParsed", "onMapped", "onDone", "onError"]);
  return (
    <nx-import
      {...rest}
      prop:columns={local.columns}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:batch={local.batch === undefined ? undefined : String(local.batch)}
      attr:accept={local.accept}
      attr:max-size={local.maxSize === undefined ? undefined : String(local.maxSize)}
      attr:memory={local.memory}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-import-parsed={(e) => local.onParsed?.(e)}
      on:nx-import-mapped={(e) => local.onMapped?.(e)}
      on:nx-import-done={(e) => local.onDone?.(e)}
      on:nx-import-error={(e) => local.onError?.(e)}
    />
  );
}
```

(`prop:labels` con `undefined` vuelve a los textos por defecto, como `labels = null`.)

## README

````md
## `<nx-import>`

Importar una hoja de Excel o un CSV sin sufrir. Hoy la persona pega mil filas, el sistema dice
«error en la fila 412» y vuelve a empezar. Aquí se suelta el archivo, las columnas se acomodan
solas, los errores se corrigen ahí mismo y se importa. Tres pasos con un solo indicador («Paso 2
de 3 · Columnas»), controles de formulario normales y botones Anterior / Siguiente.

- **Archivo.** Se arrastra, se elige (la zona es un botón) o se pega con Ctrl/⌘+V lo copiado de
  Excel. CSV/TSV/TXT: detecta el separador (`,` `;` tabulador `|`) por consistencia de columnas,
  respeta comillas, comillas escapadas y saltos de línea dentro de una celda, quita el BOM y lee
  UTF-8, UTF-16 (el «Texto Unicode» de Excel) o windows-1252 si trae bytes inválidos («Bogotá» y no
  «Bogot�»). .xlsx: lector propio sin dependencias (ZIP con `DecompressionStream`, textos
  compartidos y enriquecidos, fechas por su formato, sistema 1900 y 1904) que se carga solo cuando
  llega un libro; si hay varias hojas, se elige. La **fila de encabezados** se encuentra aunque haya
  títulos o filas vacías arriba, y se cambia a mano. Tope de tamaño (`max-size`, 20 MB).
- **Columnas.** Cada campo queda asociado a una columna del archivo, con una muestra de sus valores
  y la confianza: **por el nombre** (`label`, `key` y `aliases`, sin tildes, tolerante a una letra
  de más: «Nit/CC» ↔ `nit`, «Celular» ↔ «Teléfono móvil») o, si el encabezado no dice nada
  («Columna 3» o vacío), **por el contenido**: correos, NIT con dígito de verificación válido,
  fechas, montos, opciones. Uno a uno. Un `<select>` lo cambia, lo deja en «No importar» o le pone
  **un mismo valor a todas las filas** («Ciudad: Medellín»). Un obligatorio sin columna no deja
  seguir. El mapeo se **recuerda** (`localStorage`, por `memory` o `id` y los encabezados): el
  mismo archivo del mes siguiente sale igual, y se dice.
- **Revisión.** Cada fila se normaliza y valida por el tipo del campo (`text`, `number`, `money`,
  `percent`, `date`, `email`, `phone`, `nit`, `bool`, `option`) y las reglas (`required`, `unique`,
  `min`/`max`, `pattern`). Los números en el formato del locale, pero **decidido por columna**: una
  columna «1,234.50» en un archivo es-CO se lee bien; montos con `$`, contables `(1.200)`, `19%` o
  `0,19`. Fechas ISO, dd/mm o mm/dd (por columna: si algún día pasa de 12 en la primera posición es
  dd/mm; si no se sabe, el del locale), «12-sep-2026», seriales de Excel, años de 2 cifras. Arriba,
  «1.204 filas listas · 7 con errores · 3 vacías que se omiten»; abajo, primero las filas con
  error (con su número de fila del archivo) y la celda **editable ahí mismo**; al corregir se
  revisa de nuevo esa fila. O «Omitir las filas con errores». Nunca más de 200 filas pintadas.
- **Importar.** Sin `endpoint`: `nx-import-done` con `{rows, skipped, mapping, fixed, headers}`
  (números como número, fechas ISO, opciones por su `value`). Con `endpoint` (del mismo origen, o
  de uno de `allowOrigins()`): `POST {rows, offset}` en lotes de `batch`, con avance y
  cancelable; la respuesta puede traer `{errors: [{row, field?, message}]}` (`row` = `offset` +
  índice en el lote) y esas filas vuelven a la revisión para corregirlas y reenviar solo esas. Al
  final, «Importamos 1.197 clientes» y un CSV (con BOM, para Excel) con lo que no entró y el motivo.
- 50.000 filas × 15 columnas se revisan por tramos, sin congelar la página.

```html
<nx-import id="clientes" endpoint="/api/clientes/importar" columns='[
  {"key":"nit","label":"NIT","type":"nit","required":true,"unique":true,"aliases":["nit/cc"]},
  {"key":"razon_social","label":"Razón social","required":true},
  {"key":"ciudad","label":"Ciudad","type":"option","options":[{"value":"05001","label":"Medellín"},{"value":"11001","label":"Bogotá D.C."}]},
  {"key":"cupo","label":"Cupo de crédito","type":"money","min":0},
  {"key":"alta","label":"Fecha de alta","type":"date"}
]'></nx-import>
<script>
  clientes.addEventListener("nx-import-done", (e) => console.log(e.detail.rows));
</script>
```

| | |
|---|---|
| Propiedades / atributos | `columns` (`{key, label, type?, required?, unique?, options?, aliases?, min?, max?, pattern?, hint?}`), `endpoint`, `batch` (500), `accept`, `max-size` («20MB»), `memory`, `locale`, `labels` (plural con «uno\|varios»), `disabled` · `state`, `rows`, `mapping` (solo lectura) |
| Métodos | `load(archivo \| texto)`, `reset()` |
| Eventos | `nx-import-parsed` `{name, sheet?, sheets?, headers, headerRow, rows}`, `nx-import-mapped` `{mapping, fixed, remembered}`, `nx-import-done` `{rows, skipped, mapping, fixed, headers}`, `nx-import-error` `{code, message}` (`size`, `read`, `empty`, `network`) |
| Funciones | `parseCsv`, `decodeImportBytes`, `detectHeaderRow`, `autoMapColumns`, `validateImportRows`, `normalizeImportValue`, `parseImportNumber`, `parseImportDate`, `importRowsToCsv`…: la misma lógica sin DOM, para un backend en JavaScript |
````

## A11y (sugerida, sin escribir ni correr)

No escribí specs e2e (la máquina no aguanta un navegador ahora). Una prueba para `e2e/a11y.spec.ts`
cuando se pueda: abrir `#/import`, `audit(page, ["#import-demo"])`; «Probar con un CSV de ejemplo»,
auditar el paso 1; Siguiente (columnas), auditar; Siguiente (revisión, con celdas `aria-invalid`),
auditar; marcar «Omitir las filas con errores», importar y auditar el paso final. También en oscuro.

## Seguridad y robustez

- `endpoint` pasa por `safeEndpoint`: mismo origen o uno de `allowOrigins()`; si no, no se envía nada
  (las filas no salen de la página) y se termina como sin servidor.
- Los datos del archivo se pintan siempre como texto (`h()`), nunca como HTML.
- El CSV de «lo que no entró» neutraliza lo que Excel tomaría como fórmula (`=`, `+`, `-`, `@` sin
  ser un número): va con un apóstrofo delante.
- Los patrones que corren sobre celdas tienen tope de largo (una celda de 2 MB no hace retroceder a
  ninguno) y el parser CSV es una sola pasada: lineal en el tamaño del archivo.
- El .xlsx: tope de 256 MB por archivo descomprimido (contra «bombas zip») además de `max-size`.
- `localStorage` siempre con `try/catch`: bloqueado o lleno, el mapeo simplemente no se recuerda.

## Notas

- **No toqué el núcleo** (`src/core/`) ni otros componentes; `gallery/demo-import.ts` importa
  `addDemoRoute` de `demo-api.ts`, `buildXlsx` de `grid/xlsx.ts` y `nitCheckDigit` de
  `paste-fill/logic.ts` sin modificarlos.
- **windows-1252 en Node:** `TextDecoder("windows-1252")` de Node 22 deja 0x80–0x9F como controles de
  latin1 (el «–» del título salía como U+0096); el navegador los traduce bien. `decodeBytes` los
  corrige a mano (32 caracteres), así la función pura sirve igual en un backend.
- **Filas y números:** el número de fila que se muestra es el registro del archivo (lo que ve Excel),
  no la línea física: una celda con salto de línea no corre la numeración.
- **Protocolo de errores:** `row` se acepta absoluto (`offset` + índice) o relativo al lote (con
  `offset` ≥ tamaño del lote los rangos no se cruzan). Un 4xx con `errors` vale como respuesta; sin
  `errors`, cualquier no-2xx es un fallo del envío (se detiene y deja reintentar el resto). Un
  `field` que no está asociado (o es un valor fijo) marca la fila entera.
- **Valor fijo:** se valida al pasar de columnas a revisión (una ciudad que no está en `options`,
  una fecha inválida). En la revisión no se muestra como columna.
- **Memoria:** guarda índices de columna bajo `nx-import:{memory|id}:{huella de los encabezados}`;
  como la huella es de los encabezados (sin tildes ni mayúsculas), mismo encabezado = mismas
  posiciones. Sin `memory` ni `id`, no recuerda.
- **No verificado en navegador** (solo happy-dom y Node): el arrastre real de archivos, el selector
  de archivos nativo, pegar desde el Excel real (lo que pone en el portapapeles), un .xlsx guardado
  por Excel/LibreOffice/Google Sheets (probé el del generador del grid y uno armado a mano con
  textos enriquecidos, prefijos `x:`, 1904 y celdas saltadas), `DecompressionStream` de Safari, el
  aspecto (CSS, modo oscuro, contraste AA, móvil con la tabla en su propio scroll, `subgrid`), el
  foco y el lector de pantalla reales, la descarga del CSV, y el rendimiento de la interfaz con
  50.000 filas (la lógica sí: ~0,8 s en Node con la máquina cargada, y la revisión va por tramos de
  5.000 filas).
