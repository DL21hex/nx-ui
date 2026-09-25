# `<nx-scan>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Scan", { tag: "nx-scan", props: ["mode", "formats", "source", "muted", "autostart", "wedge", "items", "labels", "locale"] }],
```

## Peso

Medido con esbuild (min + gzip -9):

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/scan.js`: scan + núcleo, con los `import()` fuera (como mide `scripts/size.mjs`) | **11,68 KB** (11 956 B) | 12,5 KB |
| Con el comando del brief (`esbuild --bundle` sin `--splitting`: mete `nxToast` en el mismo archivo) | 13,10 KB (13 411 B) | — |
| `dist/scan.css` | **3,13 KB** (3 210 B) | 3,5 KB |

`nxToast` (el aviso con deshacer) se carga con `import("../toast/index")` la primera vez que el conteo
lo necesita: el modo único no lo usa. En la build de la librería es la entrada `toast` que ya existe.

Pasa de los 9 KB del brief general: son cinco piezas en un componente (cámara con `BarcodeDetector`,
linterna y cambio de cámara; pistola lectora por tiempos de teclas; foto; conteo con edición,
deshacer, faltantes/sobrantes y totales; modo único con búsqueda). Está en la línea de `survey`
(14 KB) y `date-range` (11 KB). Los textos (`SCAN_LABELS`, ~50) son ~1 KB.

Para `scripts/size.mjs`:

```js
  ["dist/scan.js", 12.5 * 1024, "scan + núcleo (ESM; nxToast con import())"],
  // …
  ["dist/scan.css", 3.5 * 1024, "scan (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los componentes nuevos):

```ts
  { id: "scan", label: "Escanear", href: "#/scan", icon: "package", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES`: `"#/scan": { template: "page-scan", mount: mountScanDemo },` con
`import { mountScanDemo } from "./demo-scan";` e `import "./pages/scan.css";` (el CSS de la demo).
La plantilla está en `gallery/pages/scan.html` para pegarla en `gallery/index.html`. La ruta de mentira
(`GET /demo/scan/producto?code=`) la registra `demo-scan.ts` con `addDemoRoute` al montar la página.

## Solid

En `src/solid/index.tsx`.

Comentario de cabecera: agregar `<Scan>` a la lista de envoltorios. Imports y reexport:

```tsx
import "../components/scan/index";
import type { NxScan } from "../components/scan/scan";
import type { ScanCountDetail, ScanDetail, ScanItem, ScanLabels, ScanMode, ScanProblem, ScanWedge } from "../components/scan/types";

export type { NxScan, ScanCountDetail, ScanDetail, ScanItem, ScanLabels, ScanMode, ScanProblem, ScanWedge };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `items`: agregar `| ScanItem[]` a la unión.
      // `labels`: agregar `| Partial<ScanLabels>` a la unión.
      formats: string[] | undefined;
    }
    interface ExplicitAttributes {
      // `mode`: ampliar a `DialogMode | ScanMode | undefined`.
      wedge: ScanWedge | undefined;
      // `source` y `locale` ya existen.
    }
    interface ExplicitBoolAttributes {
      muted: boolean;
      autostart: boolean;
    }
    interface CustomEvents {
      "nx-scan": CustomEvent<ScanDetail>;
      "nx-scan-count": CustomEvent<ScanCountDetail>;
      "nx-scan-error": CustomEvent<{ problem: ScanProblem }>;
    }
    interface IntrinsicElements {
      "nx-scan": HTMLAttributes<NxScan> & { source?: string };
    }
```

El envoltorio (al final del archivo):

```tsx
export interface ScanProps extends JSX.HTMLAttributes<NxScan> {
  /** `single` (por defecto): una lectura y la cámara se apaga. `count`: cada lectura suma a la lista. */
  mode?: ScanMode;
  /** `["ean_13", "code_128", "qr_code"]`… Por defecto, los de inventario y QR. */
  formats?: string[];
  /** URL que describe un código: se le agrega el código (o reemplaza `{code}`). Responde `{code, name, unit?, expected?}`. */
  source?: string;
  /** Las líneas del conteo (se pueden precargar con `expected` y `qty: 0`). */
  items?: ScanItem[];
  /** Sin el «bip» al leer. */
  muted?: boolean;
  /** Abre la cámara al montarse. */
  autostart?: boolean;
  /** Dónde se escucha la pistola lectora: `page` (por defecto), `field` u `off`. */
  wedge?: ScanWedge;
  locale?: string;
  labels?: Partial<ScanLabels>;
  /** Cada lectura: `{code, format, via}`. Cancelable (en el conteo, no se suma). */
  onScan?: (e: CustomEvent<ScanDetail>) => void;
  /** La lista después de cada cambio: `{items}`. */
  onCount?: (e: CustomEvent<ScanCountDetail>) => void;
  /** Sin cámara: `{problem}`. */
  onError?: (e: CustomEvent<{ problem: ScanProblem }>) => void;
}

export function Scan(props: ScanProps): JSX.Element {
  const [local, rest] = splitProps(props, ["mode", "formats", "source", "items", "muted", "autostart", "wedge", "locale", "labels", "onScan", "onCount", "onError"]);
  return (
    <nx-scan
      {...rest}
      prop:formats={local.formats}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:source={local.source}
      attr:wedge={local.wedge}
      attr:locale={local.locale}
      bool:muted={!!local.muted}
      bool:autostart={!!local.autostart}
      on:nx-scan={(e) => local.onScan?.(e)}
      on:nx-scan-count={(e) => local.onCount?.(e)}
      on:nx-scan-error={(e) => local.onError?.(e)}
    />
  );
}
```

(`prop:items` solo se asigna si viene: con `items={undefined}` el setter deja la lista vacía, como
`items = null`.)

## README

````md
## `<nx-scan>`

Escanear códigos de barras y QR con la cámara, para inventario y recepción. Abre la cámara trasera
(`getUserMedia`) y lee con `BarcodeDetector` los `formats` pedidos: un recuadro guía con una línea que
barre, linterna si la cámara la tiene (`torch`), cambio de cámara, y al leer vibra, suena un «bip»
(desactivable) y el visor destella con un recuadro sobre el código. El mismo código no vuelve a
contar antes de 1,5 s, ni mientras siga quieto frente a la cámara.

- **Sin cámara también sirve.** Sin `BarcodeDetector` (Firefox, Safari de escritorio, Chrome en
  Windows/Linux), sin permiso, sin HTTPS o sin cámara, lo dice en el visor y quedan: el campo para
  escribir el código (`12*7707123450011` suma 12), la **pistola lectora USB** y **leer desde una foto**
  (si hay detector).
- **Pistola lectora.** Las pistolas «teclean» el código y un Enter. Una ráfaga así (menos de 60 ms
  entre teclas, 40 en promedio) se toma como lectura en cualquier parte de la página, aunque el foco
  no esté en el campo, y su Enter no activa el botón enfocado. Con el foco en otro campo, escribe en
  ese campo como siempre: nunca se roba lo que la persona teclea.
- **Conteo** (`mode="count"`): cada lectura suma a una lista agrupada por código, con la cantidad
  editable (−/+ o escribiéndola), la última lectura resaltada, deshacer (el aviso o `Ctrl`+`Z`) y
  totales. Con `source`, cada código nuevo trae su descripción: «Lámina HR 3 mm · esperadas 40 ·
  contadas 38», con faltantes (rojo), completas (verde) y sobrantes (ámbar).
- **Modo único** (por defecto): una lectura dispara `nx-scan` y la cámara se apaga.
- **Sin cámara prendida de más:** se apaga al salir de la página, al ocultarse la pestaña o si el
  componente queda fuera de la pantalla, y vuelve sola.
- Todo se usa sin cámara y con teclado; cada lectura se anuncia (`aria-live`).

```html
<nx-scan id="recepcion" mode="count" source="/inventario/producto?code=" formats="ean_13,code_128,qr_code"></nx-scan>
<script>
  // Las líneas de la orden: lo que falta se ve desde el comienzo.
  recepcion.items = [{ code: "7707123450011", name: "Lámina HR 3 mm", unit: "und", expected: 40, qty: 0 }];
  recepcion.addEventListener("nx-scan-count", (e) => guardarBorrador(e.detail.items));
</script>

<nx-scan id="buscar"></nx-scan>
<script>
  buscar.addEventListener("nx-scan", (e) => abrirProducto(e.detail.code)); // {code, format, via}
</script>
```

| | |
|---|---|
| Propiedades / atributos | `mode` (`single`, `count`), `formats` (lista con comas o JSON; `ean_13`, `ean_8`, `upc_a`, `upc_e`, `code_128`, `code_39`, `code_93`, `codabar`, `itf`, `qr_code`, `data_matrix`, `pdf417`, `aztec`), `source` (URL + código, o con `{code}`), `items` (`{code, qty, name?, unit?, expected?, format?}`), `muted`, `autostart`, `wedge` (`page`, `field`, `off`), `locale`, `labels` · `state`, `problem` (solo lectura) |
| Métodos | `start()`, `stop()`, `add(código, cantidad?)`, `undo()`, `clear()`, `focus()` |
| Eventos | `nx-scan` `{code, format, via}` (cancelable; `via`: `camera`, `photo`, `manual`, `wedge`, `api`), `nx-scan-count` `{items}`, `nx-scan-error` `{problem}` (`nodetector`, `nocamera`, `insecure`, `denied`, `busy`, `failed`) |
| `source` | `GET` → `{code, name, unit?, expected?}`; 404 si no existe («Código sin registrar»). Una vez por código |
| Funciones | `wedgeKey(estado, tecla, ms)` (la detección de la pistola, sin DOM), `gtinValid(código)`, `scanTotals(items)`, `scanItemStatus(item)`, `parseScanEntry(texto)` |
````

## A11y

Para `e2e/a11y.spec.ts`:

```ts
test("escáner: sin cámara, contando con faltantes y sobrantes, y con la cámara activa", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).BarcodeDetector = class {
      async detect() {
        return [];
      }
    };
    if (navigator.mediaDevices)
      navigator.mediaDevices.getUserMedia = async () => {
        const c = document.createElement("canvas");
        c.getContext("2d")!.fillRect(0, 0, 10, 10);
        return c.captureStream(5);
      };
  });
  await open(page, "#/scan");
  await audit(page, ["#scan-count", "#scan-single"]);
  for (const name of ["Lámina HR 3 mm 4×8", 'Disco de corte 7"', "Etiqueta de lote"]) await page.getByRole("button", { name: `Simular la lectura de ${name}` }).click();
  await expect(page.locator('#scan-count .nx-scan__item[data-status="over"]')).toBeVisible();
  await page.locator("#scan-single .nx-scan__input").fill("7707123450042");
  await page.locator("#scan-single .nx-scan__input").press("Enter");
  await expect(page.locator("#scan-single .nx-scan__product")).toHaveText(/Soldadura/);
  await audit(page, ["#scan-count", "#scan-single", ".scan-sim"]);
  await page.locator("#scan-count").getByRole("button", { name: "Activar cámara" }).click();
  await expect(page.locator("#scan-count .nx-scan__viewer")).toHaveAttribute("data-state", "live");
  await audit(page, ["#scan-count"]);
});
```

(Probado en claro y en oscuro, sin detector, con cámara activa y en modo único: cero violaciones,
ni siquiera menores.)

## Notas

- **No toqué el núcleo** (`src/core/`) ni otros componentes.
- **Otros archivos a tocar** (como con number/kanban): `src/index.ts` →
  `export * from "./components/scan/index";`; `src/styles/nx-ui.css` →
  `@import "../components/scan/scan.css";` (la galería no ve el CSS del componente hasta esto; para
  probar lo importé en `gallery/main.ts` y lo revertí); `vite.config.ts` (entradas de la librería) →
  `scan: "src/components/scan/index.ts"`; `scripts/build-css.mjs` → `scan: "src/components/scan/scan.css"`;
  `package.json` → `"./scan": { "types": "./dist/types/components/scan/index.d.ts", "import": "./dist/scan.js" }`
  y `"./scan.css": "./dist/scan.css"`. Los nombres que exporta no chocan (las funciones de `logic`
  salen con prefijo: `scanTotals`, `parseScanEntry`…; `gtinValid` y `wedgeKey` son nuevos).
- **Base del worktree:** el worktree arrancó en `a639491` (sin kanban/history/number ni
  `demo-api.ts`); lo moví a `claude/trusting-bohr-zhfzl1` (`70d2a38`) antes de empezar, así que el
  commit va encima de esa rama.
- **La pistola, con varios escáneres en la página:** la ráfaga es del último escáner que la persona
  tocó (clic o foco adentro); si no tocó ninguno, del primero visible (o el primero de la página).
  Solo se escucha el `keydown` (en captura, en `document`); si el foco está en un
  `input`/`textarea`/`select`/`contenteditable`, no se hace nada. El Enter de una ráfaga se consume
  (`preventDefault` + `stopImmediatePropagation`); los caracteres anteriores no (no se sabe que es una
  pistola hasta el Enter), así que un atajo de una letra de otra parte de la página podría verlos.
- **Repetidos de la cámara:** el brief pide ~1,5 s; además exijo que el código haya salido del
  cuadro 400 ms (`GONE_MS`), para que una caja quieta frente a la cámara no sume cada 1,5 s. Las
  lecturas de la pistola, a mano y `add()` no se filtran (son deliberadas).
- **Un solo aviso vivo:** cada lectura cierra el aviso anterior de este escáner (pulsando su «×»,
  que resuelve la promesa con `"dismiss"`) antes de abrir el suyo; así el conteo rápido no apila
  avisos y «Deshacer» siempre es la última lectura.
- **Pruebas e2e de cámara:** `BarcodeDetector` no existe en Chromium para Linux: se simula con
  `addInitScript`, y la cámara con un `<canvas>` (`captureStream`), así la prueba corre también en
  Firefox/WebKit. Una prueba extra (solo Chromium) abre otro navegador con
  `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` (lanzado desde la prueba con
  `playwright.chromium.launch({...launchOptions, args})`, no hace falta tocar la configuración). Las
  ráfagas de pistola en e2e se despachan dentro de la página: `keyboard.type` de Playwright va por el
  protocolo tecla a tecla y, con varias pruebas en paralelo, a veces deja más de 60 ms entre teclas.
- **No verificado:** una cámara y un `BarcodeDetector` reales (Chrome en Android), la linterna real
  y el cambio de cámara real (probados con dobles en happy-dom), la vibración y el «bip» audibles, ni
  Firefox/WebKit (solo corrí Chromium).
