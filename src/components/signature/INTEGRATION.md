# `<nx-signature>`: integración

Firma a mano para recibidos, entregas de mercancía, actas y autorizaciones: en la pantalla (mouse,
lápiz o dedo) o en el celular con `<nx-handoff kind="signature">`. Guarda los trazos como puntos,
exporta SVG (la fuente de verdad) y PNG, pide nombre y cédula, calcula la huella SHA-256 de lo que se
firma y participa en formularios.

Archivos: `signature.ts` (el elemento), `logic.ts` (puro: ancho, suavizado, contorno, recorte,
validez, SVG, huella, fecha), `signature-extras.ts` (chunk aparte: PNG, ubicación y el `<nx-handoff>`
propio), `types.ts`, `signature.css`. Y cambios mínimos en `src/components/handoff/*` (ver abajo).

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Signature", { tag: "nx-signature", props: ["value", "name", "required", "readonly", "disabled", "askName", "askId", "document", "geo", "valueFormat", "auto", "handoff", "penColor", "height", "locale", "labels"] }],
```

Todas son propiedades (en camelCase reflejan el atributo con guion: `askName` ↔ `ask-name`). `value`
acepta `{svg, meta}`, su JSON o el SVG; `labels`, el objeto o su JSON. **`handoff` es una URL** a la que
el componente (vía `<nx-handoff>`) pide una sesión: conviene agregarla a `URL_PROPS` en `src/bdui.ts`
para que el agente no la muestre al modelo:

```ts
export const URL_PROPS: ReadonlySet<string> = new Set([..., "handoff"]);
```

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo con lo que importa
estáticamente, `import()` fuera).

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/signature.js`: elemento + lógica (todas las funciones puras exportadas) + núcleo (`Base`, `boolAttr`, `mergeLabels`, `resolveLocale`) | **6,88 KB** (7 046 B) | 7,25 KB |
| Chunk `signature-extras-*.js` (PNG, ubicación, el `<nx-handoff>` propio; handoff mismo va con otro `import()`) | **0,57 KB** (583 B) | 0,75 KB |
| `dist/signature.css` | **1,09 KB** (1 113 B) | 1,25 KB |

**El encargo pedía ≤ 6 KB de JS y queda en 6,88 KB.** Lo que se hizo para bajar de 7,6 KB: el marcado
como una plantilla constante (textos con `textContent`), los clics delegados por `data-a`, los
atributos reflejados con un solo `defineProperty` por propiedad, y el PNG, la ubicación y el celular en
un chunk aparte (los tres son asíncronos de todos modos). Lo que queda es lo que se usa al firmar: la
lógica exportada (~2,6 KB gzip sola: ancho, suavizado, contorno, recorte, validez, SVG, firma escrita,
lectura segura de una firma guardada, huella y fecha) y el elemento (trazos, deshacer, formulario,
validez, firma escrita, huella, sello, carga). Bajar a 6 KB pediría sacar funciones del índice (dejar
de exportarlas) o quitar la firma escrita; no lo hice sin preguntar.

Para `scripts/size.mjs`:

```js
  ["dist/signature.js", 7.25 * 1024, "signature + núcleo (ESM; PNG, ubicación y handoff con import())"],
  [lazy("signature-extras"), 0.75 * 1024, "PNG, ubicación y handoff propio de nx-signature (se carga al usarlos)"],
  // …
  ["dist/signature.css", 1.25 * 1024, "signature (CSS)"],
```

Y los de handoff cambian así (siguen dentro de sus límites, no se tocó `scripts/size.mjs`):

| Pieza | Antes | Ahora | Límite actual |
|---|---|---|---|
| `dist/handoff.js` (escritorio) | 8,95 KB (9 166 B) | **8,99 KB** (9 209 B, +43 B) | 9,25 KB |
| Celular + escritorio (`lazy("handoff-phone")`), medido como un solo bundle de los dos | 12,04 KB (12 324 B) | **12,43 KB** (12 725 B, +401 B) | 12,5 KB |
| `dist/handoff.css` | 1,41 KB (1 447 B) | **1,48 KB** (1 515 B) | 1,75 KB |

(Mi medida del celular junta los dos archivos en un bundle; `scripts/size.mjs` mide el chunk de `dist/`
con el de escritorio que importa, y según `handoff/INTEGRATION.md` daba 11,95 KB antes: con +0,4 KB
queda en ~12,35 KB. Cerca del límite de 12,5 KB: el siguiente cambio en el celular probablemente lo
pase.) `<nx-signature>` en el celular llega con `import()` (su propio chunk, ya medido arriba): la
entrada de handoff no lo carga.

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los componentes nuevos):

```ts
  { id: "signature", label: "Firma", href: "#/signature", icon: "pen-line", section: "Componentes", badge: "Nuevo" },
```

(Si `pen-line` no está entre los íconos registrados de la galería, `pencil`, `pen` o `file-text` sirven.)

En `PAGES`: `"#/signature": { template: "page-signature", mount: mountSignatureDemo },` con
`import { mountSignatureDemo } from "./demo-signature";` e `import "./pages/signature.css";`. La
plantilla está en `gallery/pages/signature.html` para pegarla en `gallery/index.html`.

La demo **reutiliza las sesiones de mentira de `gallery/demo-handoff.ts`** (las rutas
`/demo/handoff`) y su celular simulado (las clases `.ho-sim`/`.ho-phone` de `gallery/pages/handoff.css`,
que `main.ts` ya importa). Para eso se tocó `demo-handoff.ts` lo mínimo: `export` en `route()`,
`created` y el tipo `Session`; el ítem `{kind: "data", data}` en la ruta de ítems; `askName`/`askId`
(del `context`) en lo que ve el celular; un título para la firma; y el enlace del QR apunta a
`#/signature` cuando la sesión es de firma. La página de handoff funciona igual.

## Solid

En `src/solid/index.tsx`: agregar `<Signature>` al comentario de cabecera, y

```tsx
import "../components/signature/index";
import type { NxSignature } from "../components/signature/signature";
import type { SignatureDoneDetail, SignatureFormat, SignatureLabels, SignatureMeta, SignatureValue } from "../components/signature/types";

export type { NxSignature, SignatureDoneDetail, SignatureFormat, SignatureLabels, SignatureMeta, SignatureValue };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `labels`: agregar `| Partial<SignatureLabels>` a la unión.
      // `value`: agregar `| SignatureValue` a la unión (ya acepta `string` y `null`).
    }
    interface ExplicitAttributes {
      // `name`, `height`, `locale` ya existen.
      document: string | undefined;
      handoff: string | undefined;
      "value-format": SignatureFormat | undefined;
      "pen-color": string | undefined;
    }
    interface ExplicitBoolAttributes {
      // `required`, `readonly`, `disabled` ya existen.
      "ask-name": boolean;
      "ask-id": boolean;
      geo: boolean;
      auto: boolean;
    }
    interface CustomEvents {
      "nx-signature-change": CustomEvent<{ empty: boolean }>;
      "nx-signature-done": CustomEvent<SignatureDoneDetail>;
    }
    interface IntrinsicElements {
      "nx-signature": HTMLAttributes<NxSignature>;
    }
```

El envoltorio (al final del archivo):

```tsx
export interface SignatureProps extends Omit<JSX.HTMLAttributes<NxSignature>, "onChange"> {
  /** Nombre en el <form>. Lo que se envía depende de `valueFormat`. */
  name?: string;
  /** Exige una firma de verdad (ni un punto ni una raya) y el nombre y la cédula que se pidan. */
  required?: boolean;
  readonly?: boolean;
  disabled?: boolean;
  askName?: boolean;
  askId?: boolean;
  /** El texto que se firma, o el `id` de un elemento cuyo texto se firma: con él sale `meta.hash`. */
  document?: string;
  geo?: boolean;
  /** `json` (por defecto: `{svg, meta}`), `svg` o `png` (un archivo). */
  valueFormat?: SignatureFormat;
  /** Sin botón «Firmar»: la firma se da por hecha un momento después del último trazo. */
  auto?: boolean;
  /** Base de las rutas de `<nx-handoff>` (`/api/handoff`): muestra «Firmar en el celular». */
  handoff?: string;
  penColor?: string;
  height?: number;
  locale?: string;
  /** Una firma guardada: `{svg, meta}`, su JSON o el SVG. */
  value?: SignatureValue | string | null;
  labels?: Partial<SignatureLabels>;
  onChange?: (e: CustomEvent<{ empty: boolean }>) => void;
  onDone?: (e: CustomEvent<SignatureDoneDetail>) => void;
}

export function Signature(props: SignatureProps): JSX.Element {
  const [local, rest] = splitProps(props, ["name", "required", "readonly", "disabled", "askName", "askId", "document", "geo", "valueFormat", "auto", "handoff", "penColor", "height", "locale", "value", "labels", "onChange", "onDone"]);
  return (
    <nx-signature
      {...rest}
      prop:value={local.value}
      prop:labels={local.labels}
      attr:name={local.name}
      attr:document={local.document}
      attr:value-format={local.valueFormat}
      attr:handoff={local.handoff}
      attr:pen-color={local.penColor}
      attr:height={local.height === undefined ? undefined : String(local.height)}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:readonly={!!local.readonly}
      bool:disabled={!!local.disabled}
      bool:ask-name={!!local.askName}
      bool:ask-id={!!local.askId}
      bool:geo={!!local.geo}
      bool:auto={!!local.auto}
      on:nx-signature-change={(e) => local.onChange?.(e)}
      on:nx-signature-done={(e) => local.onDone?.(e)}
    />
  );
}
```

(`prop:value` antes de los atributos no importa: el componente guarda lo asignado antes de
registrarse y lo aplica al conectar. Si la app cambia `value` a `undefined`, la firma se borra.)

## README

````md
## `<nx-signature>`

**Firma a mano** para el recibido a satisfacción de una entrega, un acta o una autorización: en la
pantalla con mouse, lápiz o dedo, o en el celular de quien recibe.

- **Trazo que se ve como tinta:** Pointer Events con captura y eventos coalescidos, `touch-action:
  none`, más fino cuanto más rápido y más grueso con más presión del lápiz, curvas suavizadas y nítido
  a cualquier densidad de pantalla. La zona de firma es clara también en modo oscuro (una firma se
  archiva sobre papel), con la línea, la «×» y «Firme aquí».
- **Vector:** cada trazo es un `<path>` (su contorno relleno), recortado a lo firmado. El SVG es la
  fuente de verdad: `toPNG(escala)` y el valor del formulario salen de él.
- **Quién y qué:** nombre y cédula (`ask-name`, `ask-id`); con `document`, la huella SHA-256 del texto
  firmado más la fecha (prueba qué se firmó; no es una firma electrónica certificada); con `geo`, la
  ubicación si la persona la permite.
- **Sin trazo:** «Escribir mi nombre» genera la firma con la cursiva del sistema, marcada
  `typed: true`: el camino por teclado y para quien no puede firmar con el dedo.
- **Formulario:** `name`, `required` (ni un punto ni una raya valen), `value-format` (`json` con
  `{svg, meta}`, `svg` o `png`), `reset` la borra, `readonly` muestra una guardada.
- **En el celular:** con `handoff`, «Firmar en el celular» muestra el QR de
  `<nx-handoff kind="signature">`; el teléfono firma (a pantalla completa y en horizontal si se puede) y
  la firma aparece aquí.

```html
<form method="post">
  <article id="remision">…</article>
  <nx-signature name="recibido" ask-name ask-id required document="remision" handoff="/api/handoff"></nx-signature>
  <button>Registrar el recibido</button>
</form>

<!-- Una firma guardada -->
<nx-signature readonly value='{"svg":"<svg …>","meta":{…}}'></nx-signature>
```

| | |
|---|---|
| Propiedades / atributos | `name`, `required`, `readonly`, `disabled`, `ask-name`, `ask-id`, `document`, `geo`, `value-format` (`json`, `svg`, `png`), `auto`, `handoff`, `pen-color`, `height` (px, 180), `locale`, `labels` · `value` (`{svg, meta}`, su JSON o el SVG) · `strokes` (solo lectura) |
| Métodos | `clear()`, `undo()` (también Ctrl/⌘+Z), `toSVG()`, `toPNG(escala?)` → `Promise<Blob \| null>`, `load(valor)` → `boolean`, `isEmpty()`, `checkValidity()` |
| Eventos | `nx-signature-change` `{empty}`, `nx-signature-done` `{svg, meta}` |
| `meta` | `{signedAt, name?, id?, typed, strokes, points, width, height, device, hash?, geo?}` |
| Funciones | `signatureSVG(trazos, tinta?)`, `signaturePath(puntos, anchos)`, `signatureWidth(velocidad, presión, lápiz)`, `signatureStrokeWidths(trazo)`, `smoothSignaturePoints(puntos)`, `signatureBounds(trazos, margen)`, `signatureCheck(trazos, mínimo?)`, `signatureHash(texto, fecha)`, `typedSignatureSVG(nombre)`, `parseSignatureValue(valor)`, `cleanSignatureMeta(meta)`, `signatureDate(iso, locale)`, `normalizeSignedText(texto)`, `SIGNATURE_LABELS`, `SIGNATURE_MIN`, `SIGNATURE_PEN`, `SIGNATURE_INK`, `SIGNATURE_FONT` |
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/signature/index";`. Nombres revisados contra lo
  exportado hoy: `NxSignature`, `SIGNATURE_*`, `signature*`, `smoothSignaturePoints`,
  `typedSignatureSVG`, `parseSignatureValue`, `cleanSignatureMeta`, `normalizeSignedText` y los tipos
  `Signature*` son nuevos. `strokeWidths` se exporta como `signatureStrokeWidths` (el nombre corto
  es genérico); `escapeXml`, `cleanInk` y `safeSignatureSvg` no se exportan desde el índice.
- `src/styles/nx-ui.css` → `@import "../components/signature/signature.css";`
- `vite.config.ts` → `signature: "src/components/signature/index.ts",`
- `scripts/build-css.mjs` → `"signature": "src/components/signature/signature.css",`
- `package.json` → `"./signature": { "types": "./dist/types/components/signature/index.d.ts", "import": "./dist/signature.js" }`
  y `"./signature.css": "./dist/signature.css"`. `sideEffects` ya cubre los chunks con hash.
- `README.md` → la sección de arriba. En la de `<nx-handoff>`, `kind` pasa a ser `photo`, `file`,
  `scan` o `signature`, y la entrega al destino suma «un dato (`{kind: "data"}`) va a `load(data)` de
  `<nx-signature>`» (ver `src/components/handoff/INTEGRATION.md`, que ya lo dice).
- `test/ssr-import.test.ts` importa `src/index.ts`: con la línea de arriba cubre también este
  componente (`test/signature.logic.test.ts` ya prueba que su índice importa sin DOM).

### Cambios en `src/components/handoff/*` (permitidos por el encargo)

- `types.ts`: `HandoffKind` suma `"signature"`; `HandoffPhoneInfo` suma `askName?`/`askId?`;
  `HandoffLabels` suma `signature1`/`signatures` («1 firma», «{n} firmas»); `HandoffPhoneLabels` suma
  `fullscreen` y `signSending`.
- `logic.ts`: `cleanKind` acepta `signature`; `countText` cuenta firmas; `parsePhoneInfo` lee
  `askName`/`askId` (solo `true`).
- `handoff.ts` (escritorio): un ítem `{kind: "data", data}` con destino `for` llama `load(data)` del
  destino (así `<nx-handoff kind="signature" for="firma">` entrega a `<nx-signature id="firma">`).
  +43 B en la entrada.
- `handoff-phone.ts` (celular): con `kind: "signature"`, `import("../signature/index")` (chunk aparte),
  un `<nx-signature required>` (más `ask-name`/`ask-id` si la sesión los pide) alto según la pantalla,
  «Firmar en pantalla completa» (solo con puntero táctil y Fullscreen API; pide `landscape` con
  `screen.orientation.lock`, y si no se puede, sigue), y al confirmar manda
  `POST …/items?t=` con JSON `{kind: "data", data: {svg, meta}}` y luego `…/done`. Sin red, «Reintentar»
  manda la misma firma (no hay que volver a firmar).
- `handoff.css`: `.nx-ho__phone:fullscreen` a todo el ancho, con la zona de firma al alto que quede.
- `INTEGRATION.md` de handoff: el protocolo con el ítem `data`, lo que ve el celular con `askName`/`askId`,
  y el servidor Hono de ejemplo aceptando datos.
- Pruebas nuevas en `test/handoff.dom.test.ts` (entrega a `load()`, el celular firmando y el
  reintento) y `test/handoff.logic.test.ts`; todas las de handoff siguen pasando.

## Decisiones

- **El trazo es un contorno relleno, no una línea con grosor:** un `<path>` por trazo con los dos
  bordes a media anchura del centro, cuadráticas por los puntos medios y puntas redondas. Así el ancho
  variable queda en el SVG (un `stroke-width` sería uno solo por trazo) y el mismo `d` pinta el canvas
  (`Path2D`), de modo que lo que se ve al firmar es lo que se guarda. Un toque sin moverse es un
  círculo (el punto de una «i»).
- **Ancho:** 3,4 px despacio a 1,1 px desde 2,2 px/ms, con un filtro (0,65/0,35) para que no salte de
  un punto al siguiente. La presión solo cuenta con lápiz (`pointerType: "pen"`): el mouse reporta 0,5
  fijo y muchos dedos 0 o 1. Se guarda la presión real del lápiz y 0,5 en lo demás.
- **Firma «de verdad» (`signatureCheck`):** recorrido ≥ 80 px, recuadro ≥ 40 × 12 px, y un recorrido al
  menos 1,2 veces la diagonal (una diagonal recta no pasa). «Firmar» la exige siempre (un punto no se
  firma); `required` además la exige para enviar el formulario. Una firma escrita pide al menos 2
  letras.
- **Cuándo cuenta el valor:** lo dibujado ya es el valor del formulario (no hay que pulsar «Firmar»
  para enviar); «Firmar» congela, pone fecha, huella y ubicación y emite `nx-signature-done`. Una firma
  sin confirmar lleva en `meta.signedAt` la hora del último trazo y no tiene huella.
- **`auto`:** sin botón, la firma se da por hecha 0,9 s después del último trazo si vale, y **no se
  congela** (congelarla impediría una firma de dos trazos con pausa); tampoco muestra el sello. Cada
  pausa vuelve a emitir `nx-signature-done`.
- **La huella** es SHA-256 de `normalizar(texto) + "\n" + signedAt` en hexadecimal; normalizar es NFC,
  espacios seguidos a uno y sin espacios en las puntas (el mismo documento renderizado con otra
  sangría da la misma huella). `document` es primero un `id` (se toma su `textContent`) y, si no hay
  elemento con ese id, el texto mismo. Sin `crypto.subtle` (una página `http://` que no es localhost)
  no hay huella. Una firma que llega del celular (o se carga) sin huella la recibe aquí, donde está el
  documento; la que ya trae una la conserva.
- **Una firma cargada** (`value`, `load()`, lo que llega del celular) se muestra como `<img>` de un
  `data:` URL del SVG: aunque el SVG venga de afuera, en un `<img>` no ejecuta nada. Además
  `parseSignatureValue` rechaza SVG con `<script>`, `<foreignObject>`, manejadores `on…=` o
  `javascript:`. La firma escrita también se muestra así.
- **`load()` emite `nx-signature-done`** (así llega la del celular) salvo con `readonly`; **asignar
  `value`** (propiedad o atributo) muestra la firma sin emitirlo: mostrar una firma archivada no es
  firmar, y así no importa el orden de los atributos. En los dos casos queda congelada, con el sello si
  trae fecha y «Volver a firmar» si se puede.
- **Ubicación:** se pide al primer trazo (así está lista al confirmar) y con tope de 6 s; negada,
  vencida o sin `navigator.geolocation`, se firma sin ella.
- **El `<nx-handoff>` propio** (con `handoff`) vive dentro del componente y se carga con `import()` al
  pulsar «Firmar en el celular»; su botón y su resumen se ocultan por CSS (el botón es el de la firma y
  el resumen, el sello). Lo que llega se toma en `nx-handoff-item` (cancelándolo) y va a `load()`.
  Con un `<nx-handoff for="{id}">` en la página, el botón llama su `start()` y la entrega la hace
  handoff (`load()` del destino). El `context` que viaja al servidor es `{askName, askId}`: el servidor
  lo devuelve al celular en lo que ve (`askName`/`askId`, ver el protocolo de handoff).
- **Formulario:** `formResetCallback` borra la firma y los campos; `formDisabledCallback` apaga sin
  tocar el atributo `disabled` de quien lo puso. El ancla de la validez es el campo que falta (nombre o
  cédula) o «Escribir mi nombre» (el camino por teclado a una firma).
- **El PNG** (`toPNG`, `value-format="png"`) se pinta desde el SVG (fondo transparente, escala 2 por
  defecto, entre 0,1 y 8). Con `png`, el formulario queda sin valor hasta que el PNG está listo.
- **Pantalla completa en el celular**: con un botón (la API exige un gesto) y solo con puntero táctil;
  en la pantalla completa el CSS de handoff da a la zona el alto que queda. No se fuerza la rotación: se
  pide `landscape` y, si el sistema no deja, se firma en vertical.
- **Tinta y papel:** `pen-color` por defecto `#1a2238` (casi negro azulado); un color con comillas o
  `<>` vuelve al de siempre. El papel y la guía son variables propias
  (`--nx-signature-paper`, `--nx-signature-guide`), no tokens: los tokens se invierten en modo oscuro.

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el trazo real con mouse, lápiz o dedo, ni cómo se ve
  (grosor, suavizado, nitidez con `devicePixelRatio`, la línea y la leyenda, el papel en modo oscuro),
  ni axe/contraste, ni Playwright.
- happy-dom no tiene canvas 2D ni `Path2D`: el pintado del canvas no se ejecutó. Las pruebas cubren
  los puntos, el SVG y el `d` (el mismo que usa `Path2D`); que el arco de las puntas (`A … 0 0 0`)
  quede hacia afuera está razonado y probado como cadena, no visto.
- `toPNG()` (Image + canvas + `toBlob`) no corre en happy-dom: la prueba del formulario con `png` usa
  un `toPNG` simulado. Falta ver en Safari que pintar un SVG `data:` no «ensucie» el canvas (si lo
  hiciera, `toBlob` lanza y `toPNG` devuelve `null`).
- `ElementInternals` no existe en happy-dom: el formulario se probó con uno de mentira (valor, validez,
  ancla); el envío nativo, `reportValidity` y el globo del navegador no se vieron.
- La Fullscreen API y `screen.orientation.lock("landscape")` en un teléfono real; la cursiva del
  sistema en Windows, macOS, Android e iOS (la lista es `Segoe Script`, `Bradley Hand`,
  `Snell Roundhand`, `Brush Script MT`, `cursive`).
- `navigator.geolocation` real (el aviso de permiso a mitad del primer trazo) y `crypto.subtle` en una
  intranet `http://`.
- La página de la galería no está enlazada (falta `gallery/main.ts`/`index.html`, ver «Nav»).
