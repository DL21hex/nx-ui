# `<nx-paste-fill>` — integración

## BDUI

```ts
["PasteFill", { tag: "nx-paste-fill", props: ["fields", "endpoint", "reviewBelow", "for", "labels"] }],
```

`render()` crea el elemento sin hijos: desde BDUI se usa con `for` (el `id` del formulario que ya
está en la página). Envolviendo el formulario (hijos) es el uso normal en HTML y Solid.

## Peso

Medido con los comandos del brief (esbuild, minificado + gzip -9):

| Pieza | gzip |
|---|---|
| `src/components/paste-fill/index.ts` (elemento + extractor + núcleo) | **17 126 B (16,7 KB)** |
| solo `logic.ts` (extractor, con `nxFormat` y `foldText`) | 9 511 B |
| `paste-fill.css` | **2 863 B (2,8 KB)** |

El JS pasa la meta de 9 KB: el extractor local es la mitad (decenas de expresiones regulares de
formatos colombianos, la lista de ciudades, fechas relativas, montos en palabras) y el elemento
trae evidencia, capa de anillos, sugerencias, deshacer y streaming. Límites propuestos para
`scripts/size.mjs`:

```js
["dist/paste-fill.js", 17.5 * 1024, "paste-fill + extractor + núcleo (ESM)"],
["dist/paste-fill.css", 3 * 1024, "paste-fill (CSS)"],
```

Además: `src/index.ts` → `export * from "./components/paste-fill/index";`;
`src/styles/nx-ui.css` → `@import "../components/paste-fill/paste-fill.css";`;
`scripts/build-css.mjs` → `"paste-fill": "src/components/paste-fill/paste-fill.css"`;
`vite.config.ts` → entrada `"paste-fill": "src/components/paste-fill/index.ts"` y el plugin del
servidor de la demo (ver Notas); `package.json` → la subruta `./paste-fill` como las demás.

## Nav

```ts
{ id: "paste-fill", label: "Pegar y llenar", href: "#/paste-fill", icon: "file-text", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES`: `"#/paste-fill": { template: "page-paste-fill", mount: mountPasteFillDemo }` (con
`import { mountPasteFillDemo } from "./demo-paste-fill";` e `import "./pages/paste-fill.css";`).
La plantilla está en `gallery/pages/paste-fill.html`.

## Solid

```tsx
import "../components/paste-fill/index";
import type { NxPasteFill } from "../components/paste-fill/paste-fill";
import type { PasteFieldInput, PasteFillDoneDetail, PasteFillLabels } from "../components/paste-fill/types";

export type { NxPasteFill, PasteFieldInput, PasteFillDoneDetail, PasteFillLabels };

export interface PasteFillProps extends JSX.HTMLAttributes<NxPasteFill> {
  /** Enriquece los campos leídos del formulario, por `name` (p. ej. `{ name: "monto", kind: "money" }`). */
  fields?: PasteFieldInput[];
  /** Recibe `POST {text, fields}` y responde con el protocolo en streaming (opcional). */
  endpoint?: string;
  /** Confianza bajo la cual un campo queda «Revisar» (0,8). */
  reviewBelow?: number;
  /** El `id` de un formulario que está en otra parte (sin él, el que envuelve). */
  for?: string;
  locale?: string;
  labels?: Partial<PasteFillLabels>;
  /** Cancelable: no se llena nada. */
  onStart?: (e: CustomEvent<{ text: string }>) => void;
  onDone?: (e: CustomEvent<PasteFillDoneDetail>) => void;
  onUndo?: (e: CustomEvent<{ values: Record<string, string> }>) => void;
  children?: JSX.Element;
}

export function PasteFill(props: PasteFillProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "endpoint", "reviewBelow", "for", "locale", "labels", "onStart", "onDone", "onUndo", "children"]);
  return (
    <nx-paste-fill
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:review-below={local.reviewBelow === undefined ? undefined : String(local.reviewBelow)}
      attr:for={local.for}
      attr:locale={local.locale}
      on:nx-paste-fill-start={(e) => local.onStart?.(e)}
      on:nx-paste-fill-done={(e) => local.onDone?.(e)}
      on:nx-paste-fill-undo={(e) => local.onUndo?.(e)}
    >
      {local.children}
    </nx-paste-fill>
  );
}
```

En `declare module "solid-js"`:

- `ExplicitProperties`: `fields` ya existe (`SelectField[]`, de `<nx-select>`): ampliarlo a
  `fields: SelectField[] | PasteFieldInput[] | undefined;`. Y en `labels`, agregar
  `| Partial<PasteFillLabels>` a la unión.
- `ExplicitAttributes`: nada nuevo (`endpoint`, `review-below`, `for` y `locale` ya están).
- `ExplicitBoolAttributes`: nada.
- `CustomEvents`:
  ```ts
  "nx-paste-fill-start": CustomEvent<{ text: string }>;
  "nx-paste-fill-done": CustomEvent<PasteFillDoneDetail>;
  "nx-paste-fill-undo": CustomEvent<{ values: Record<string, string> }>;
  ```
- `IntrinsicElements`: `"nx-paste-fill": HTMLAttributes<NxPasteFill> & { endpoint?: string; for?: string };`

Y en el comentario de cabecera del módulo, `<PasteFill>` en la lista de componentes.

## README

````md
## `<nx-paste-fill>`

Pegas un texto y el formulario se llena solo. Envuelve un formulario tuyo (sus `<input>`,
`<select>` y `<textarea>` con `name`, sin moverlos): la persona pega un correo de un proveedor, un
WhatsApp o una firma —con Ctrl/⌘+V sobre el formulario, en la zona «Pega aquí…», con el botón
«Pegar» o arrastrando el texto— y cada campo recibe lo suyo con su **confianza** y su
**evidencia**, como `<nx-doc-capture>` pero para texto.

- **Esquema automático:** lee cada campo (`name`, su `<label>` o `aria-label` o `placeholder`,
  `type`, opciones de un select). `fields` lo enriquece por `name`:
  `{ name: "monto", kind: "money" }` (`kind`: `email`, `phone`, `nit`, `id`, `money`, `date`,
  `url`, `name`, `company`, `role`, `address`, `city`, `number`, `text`). Sin `kind`, se deduce del
  `type`, el `name` y la etiqueta, sin tildes.
- **Extractor local, sin servidor:** correo; celular y fijo colombianos (`+57`, `60X`, y los de 7
  cifras de antes con su indicativo nuevo); NIT con su dígito de verificación (si no cuadra,
  confianza baja y el dígito correcto en el aviso); cédula; montos (`$ 1.450.000`, `1,45 millones`,
  `450 mil`, `USD 300`, «2 palos»); fechas (`15/03/2026`, `15 de marzo`, `el próximo viernes`,
  `en 15 días hábiles`, relativas a hoy); direcciones (`Cra. 15 # 93-47 Of. 301`); ciudades; razón
  social (S.A.S., S.A., Ltda.); el nombre tras «Atentamente,» o «--» y su cargo; «Etiqueta: valor».
  Cada campo recibe lo más probable según lo que dice el texto justo antes («con entrega el…» →
  «Fecha de entrega»); si hay dos candidatos casi empatados, baja la confianza y lo dice.
- **Al llenar:** cada campo brilla un instante; queda con un chip de confianza, y lo que está bajo
  `review-below` (0,8) queda «Revisar» hasta que la persona lo corrige o lo confirma. Lo que la
  persona ya había escrito **no se pisa**: se muestra la sugerencia con «Usar» / «Dejar el mío».
  Cada campo que cambia recibe `input` y `change` (con el setter nativo: React también se entera).
- **Evidencia:** el texto pegado con cada tramo del color de su campo; pasar por un campo ilumina
  su tramo y al revés; clic en un tramo enfoca el campo.
- **Deshacer:** el botón o Ctrl/⌘+Z fuera de un campo devuelven los valores de antes (lo que la
  persona cambió después se respeta).
- **Servidor opcional:** con `endpoint`, se llena primero lo local y a la vez se hace
  `POST {text, fields}`; la respuesta (NDJSON o SSE) gana:
  `{"type":"field","name","value","confidence","source":{"start","end"},"hint"?}`,
  `{"type":"note","message"}`, `{"type":"done"}` / `{"type":"error"}`. Si falla, queda lo local y
  se avisa.

```html
<nx-paste-fill endpoint="/proveedores/leer" fields='[{"name":"monto","kind":"money"}]'>
  <form>
    <label>Razón social <input name="razon_social"></label>
    <label>NIT <input name="nit"></label>
    <label>Correo <input name="correo" type="email"></label>
    <label>Fecha de entrega <input name="entrega" type="date"></label>
  </form>
</nx-paste-fill>
```

| | |
|---|---|
| Propiedades / atributos | `fields`, `endpoint`, `review-below`, `for` (el `id` de un formulario en otra parte), `locale`, `labels` · `state`, `text`, `pending` |
| Métodos | `fill(text)`, `undo()`, `clear()` |
| Eventos | `nx-paste-fill-start` `{text}` (cancelable), `nx-paste-fill-done` `{values, fields}`, `nx-paste-fill-undo` `{values}` |
| Funciones | `extractPasteData(text)`, `matchPasteFields(fields, text)`, `nitCheckDigit(base)`: el mismo extractor, en el navegador o en un backend en JavaScript |
````

## A11y

```ts
test("pegar y llenar: en reposo, con revisar y sugerencia, y con el servidor que falla", async ({ page }) => {
  // Sin animaciones: axe no mide un chip a medio aparecer.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "#/paste-fill");
  await audit(page, ["#pf-demo"]);
  await page.locator("#pf-demo [name=correo]").fill("compras@proveedor.co");
  await page.getByRole("button", { name: "Firma con NIT mal escrito" }).click();
  await expect(page.locator("#pf-demo .nx-pf__pill")).toHaveText("2 por revisar");
  await audit(page, ["#pf-demo"]);
  await page.locator("input[name=pf-mode][value=fail]").check();
  await page.getByRole("button", { name: "WhatsApp informal" }).click();
  await expect(page.locator("#pf-demo .nx-pf__err")).toBeVisible({ timeout: 10_000 });
  await audit(page, ["#pf-demo"]);
});
```

## Seguridad y robustez

- **Pegar en un control es de ese control:** cualquier `input` (también contraseña, casilla,
  archivo, deshabilitado o de solo lectura), `textarea`, `select` o `contenteditable` que no sea la
  zona propia recibe su pegado y su texto soltado sin que el componente lo lea. Antes, una contraseña
  pegada en su campo se interceptaba, se mandaba al `endpoint` y quedaba a la vista como evidencia.
  Ctrl+Z en esos controles también es suyo.
- **Tope de 50 000 caracteres** (`MAX_TEXT`): más, y no se lee ni se envía; la zona lo dice
  (`labels.tooLong`, también al lector de pantalla).
- `endpoint` solo del mismo origen (o de uno de `allowOrigins()`): el texto pegado no viaja a un
  tercero. El stream del servidor se deja de leer (y se suelta la conexión) si otro texto o
  deshacer toman su lugar.
- `extract()` ya no es cuadrático: los tramos tomados son una lista ordenada con búsqueda binaria y
  la deduplicación usa índices por tipo y valor (400 KB: de 16 s a ~0,1 s).

## Notas

- **No toqué el núcleo** (`src/core/`).
- **Servidor de la demo:** `gallery/server-paste-fill.ts` exporta `configurePasteFill(server)`
  (registra `/demo/paste-fill`; `?fail=1` responde 503). En `vite.config.ts`:
  `import { configurePasteFill } from "./gallery/server-paste-fill";` y en `plugins` del modo
  `serve`: `{ name: "nx-demo-paste-fill", configureServer: configurePasteFill }`.
- **Base del worktree:** el worktree nació en `515955d` (sin `<nx-survey>`), así que antes de
  empezar lo avancé (fast-forward, sin cambios propios) a `2b8395a`
  (`feat(survey)…`, de `claude/trusting-bohr-zhfzl1`) para tener las referencias del brief. El
  commit de este componente va encima de ese.
- **Qué toca del formulario del autor:** nada de su estructura. Solo pone `data-nx-fill`
  (`high|mid|low|suggest|same|you`, útil para el CSS del autor) y agrega su descripción a
  `aria-describedby` (y devuelve el original al cerrar o deshacer). Los anillos y chips van en una
  capa propia (`position: absolute`) encima del formulario. El elemento tiene `tabindex="-1"` para
  que un clic en un hueco del formulario deje listo Ctrl+V (no entra en el orden de Tab).
- **Peso:** si el presupuesto importa más que tenerlo todo en una entrada, el extractor
  (`extract`/`matchFields`, ~9 KB) se puede cargar con `import()` en el primer `fill()` desde un
  archivo aparte; no lo hice porque el brief fija los archivos del componente.
- **`fields` en Solid** choca de nombre con el de `<nx-select>` (ver `## Solid`).
- **Prueba intermitente ajena:** corriendo todo e2e en paralelo, `a11y.spec.ts › encuesta…` falló
  una vez y pasó sola al repetirla (no es de este componente).
- `tsc --noEmit -p .` solo reporta los errores que ya estaban en `examples/solid/main.tsx`
  (en este entorno no encuentra el paquete `nx-ui` sin compilar).
