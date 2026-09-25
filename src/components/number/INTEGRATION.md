# `<nx-number>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Number", { tag: "nx-number", props: ["value", "min", "max", "step", "format", "currency", "decimals", "words", "name", "required", "disabled", "readonly", "placeholder", "align", "label", "locale", "labels"] }],
```

## Peso

Medido con los comandos del brief (gzip -9):

- JS `src/components/number/index.ts` (ESM, minificado, con núcleo): **7.829 B (7,6 KB)**.
- CSS `src/components/number/number.css`: **1.172 B (1,1 KB)**.

Límites propuestos para `scripts/size.mjs` (en `BUDGET`):

```js
  ["dist/number.js", 9 * 1024, "number + núcleo (ESM)"],
  // …
  ["dist/number.css", 1.5 * 1024, "number (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV` (después de «Bandeja»/«Encuesta»):

```ts
  { id: "number", label: "Número", href: "#/number", icon: "receipt", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES`: `"#/number": { template: "page-number", mount: mountNumberDemo },` con
`import { mountNumberDemo } from "./demo-number";` e `import "./pages/number.css";` (el CSS de la
demo). La plantilla está en `gallery/pages/number.html` para pegarla en `gallery/index.html`.

## Solid

En `src/solid/index.tsx`.

Comentario de cabecera: agregar `<NumberInput>` a la lista de envoltorios. Imports y reexport:

```tsx
import "../components/number/index";
import type { NxNumber } from "../components/number/number";
import type { NumberAlign, NumberChangeDetail, NumberFormat, NumberLabels } from "../components/number/types";

export type { NxNumber, NumberAlign, NumberChangeDetail, NumberFormat, NumberLabels };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `labels`: agregar `| Partial<NumberLabels>` a la unión.
      // `value`: ampliar a `string | string[] | number | null | undefined` (<nx-number> usa `number | null`).
    }
    interface ExplicitAttributes {
      format: NumberFormat | undefined;
      currency: string | undefined;
      decimals: string | undefined;
      min: string | undefined;
      max: string | undefined;
      step: string | undefined;
      align: NumberAlign | undefined;
      // `name`, `placeholder`, `label` y `locale` ya existen.
    }
    interface ExplicitBoolAttributes {
      words: boolean;
      readonly: boolean;
      // `required` y `disabled` ya existen.
    }
    interface CustomEvents {
      // `nx-change` ya está declarado con `SelectChangeDetail`; ver «Notas». No hace falta tocarlo:
      // el envoltorio convierte el tipo.
    }
    interface IntrinsicElements {
      "nx-number": HTMLAttributes<NxNumber> & { label?: string; placeholder?: string };
    }
```

El envoltorio (al final del archivo). Se llama `NumberInput` para no tapar el `Number` global:

```tsx
export interface NumberInputProps extends Omit<JSX.HTMLAttributes<NxNumber>, "onChange" | "onInput"> {
  /** `number | null`. En `percent`, la fracción (0,19 es 19 %). */
  value?: number | null;
  format?: NumberFormat;
  /** Con `money`: ISO («COP», «USD») o un símbolo («$»). */
  currency?: string;
  decimals?: number;
  min?: number;
  max?: number;
  /** Lo que suman ↑/↓, en las unidades que se ven (puntos en `percent`). */
  step?: number;
  /** El monto en letras debajo, para cheques y documentos. */
  words?: boolean;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  placeholder?: string;
  align?: NumberAlign;
  /** Nombre accesible (si no hay un `<label>`). */
  label?: string;
  locale?: string;
  labels?: Partial<NumberLabels>;
  /** Mientras se escribe, cada vez que cambia el número (`e.currentTarget.value`). */
  onInput?: (e: Event & { currentTarget: NxNumber }) => void;
  /** Al confirmar (salir o Enter): `{value, text}`. */
  onChange?: (e: CustomEvent<NumberChangeDetail>) => void;
}

export function NumberInput(props: NumberInputProps): JSX.Element {
  const [local, rest] = splitProps(props, [
    "value",
    "format",
    "currency",
    "decimals",
    "min",
    "max",
    "step",
    "words",
    "name",
    "required",
    "disabled",
    "readonly",
    "placeholder",
    "align",
    "label",
    "locale",
    "labels",
    "onInput",
    "onChange",
  ]);
  const str = (n: number | undefined) => (n === undefined ? undefined : String(n));
  return (
    <nx-number
      {...rest}
      prop:value={local.value}
      prop:labels={local.labels}
      attr:format={local.format}
      attr:currency={local.currency}
      attr:decimals={str(local.decimals)}
      attr:min={str(local.min)}
      attr:max={str(local.max)}
      attr:step={str(local.step)}
      attr:name={local.name}
      attr:placeholder={local.placeholder}
      attr:align={local.align}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:words={!!local.words}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:readonly={!!local.readonly}
      on:input={(e) => local.onInput?.(e as unknown as Event & { currentTarget: NxNumber })}
      on:nx-change={(e) => local.onChange?.(e as unknown as CustomEvent<NumberChangeDetail>)}
    />
  );
}
```

## README

````md
## `<nx-number>`

El campo numérico que se usa todos los días, bien hecho. Es un `<input>` propio (con
`inputmode="decimal"` en el móvil) que entiende lo que se escribe en el formato del locale y lo deja
formateado al salir.

- **Entiende:** «1.234,5» (es) o «1,234.5» (en); sufijos «2,5k», «3 mil», «1,5M», «2 millones»,
  «4 mm» (miles de millones en Colombia; en inglés «MM» es un millón, y así se lee con
  `locale="en-US"`) y «15%».
- **Cuentas:** con `=` («=450*3», «=1.200.000/12», «=(3+2)*1,5k») o relativas al valor anterior si
  empiezan por un operador («+15%», «-10%», «*2», «/12»). Mientras se escribe, el resultado se ve a
  la derecha («= 1.350») o lo que no se entendió («no entiendo "x"»). El intérprete es propio: nada
  de `eval`.
- **Pegar desde Excel:** «$ 1.450.000,00», «USD 1,200.50», «(1.200)» contable, «1.200-» o con
  espacios duros quedan limpios al pegar.
- **Teclado:** ↑/↓ suman `step` (Mayús ×10, Alt ÷10); `min`/`max` recortan al confirmar y lo
  avisan; Esc deshace lo escrito desde el foco. La rueda del mouse **no** cambia el valor.
- **En letras:** con `words`, debajo va el monto como en un cheque: «un millón cuatrocientos
  cincuenta mil pesos m/cte», «veintiún dólares», «mil doscientos pesos con 50/100 m/cte».
  `numberToWords(n, {currency})` hace lo mismo en el backend.
- **Formulario:** `name`, `required`, validez nativa con mensaje (`valueMissing`, `badInput`,
  `rangeUnderflow`/`rangeOverflow`), `reset` y `<fieldset disabled>`. El valor va en formato de
  máquina («1450000.5»).

```html
<label for="precio">Precio unitario</label>
<nx-number id="precio" name="precio" format="money" currency="COP" step="1000" min="0" required></nx-number>
<nx-number id="total" format="money" currency="COP" readonly words></nx-number>
<script>
  precio.addEventListener("input", () => (total.value = cantidad.value * precio.value));
  precio.addEventListener("nx-change", (e) => guardar(e.detail.value)); // {value, text}
</script>
```

| | |
|---|---|
| Propiedades / atributos | `value` (`number \| null`; en `percent`, la fracción), `format` (`number`, `money`, `percent`), `currency` (ISO o símbolo), `decimals`, `min`, `max`, `step`, `words`, `name`, `required`, `disabled`, `readonly`, `placeholder`, `align` (`end` en montos y porcentajes), `label`, `locale`, `labels` · `text` (el valor formateado) |
| Métodos | `focus()`, `select()`, `checkValidity()`, `reportValidity()` |
| Eventos | `input` (cada vez que cambia el número), `nx-change` `{value, text}` y `change` al confirmar |
| Funciones | `evaluateNumber(texto, {locale, format, base})`, `numberToWords(n, {currency})`, `formatNumberText(n, {locale, format, currency, decimals})` |
````

## A11y

Para `e2e/a11y.spec.ts`:

```ts
test("número: factura con vista previa, error y aviso de recorte", async ({ page }) => {
  await open(page, "#/number");
  await audit(page, ["#num-invoice", ".sel-demos", ".num-try"]);
  await page.locator("#num-price input").fill("=450*3");
  await expect(page.locator("#num-price .nx-number__hint")).toBeVisible();
  await page.locator("#num-qty input").fill("=2+x");
  await page.locator("#num-qty input").press("Enter");
  await page.locator("#num-disc input").fill("150");
  await page.locator("#num-disc input").press("Enter");
  await expect(page.locator("#num-disc .nx-number__note")).not.toBeEmpty();
  await audit(page, ["#num-invoice", ".sel-demos", ".num-try"]);
});
```

## Notas

- **No toqué el núcleo** (`src/core/`). La lectura de literales se apoya en
  `nxFormat(locale).parse` y le suma, en `logic.ts`, la tolerancia para lo que se pega (si aparecen
  «.» y «,», el último es el decimal; un signo repetido es de miles).
- **`nx-change` en `HTMLElementEventMap`:** `src/components/select/index.ts` ya lo declara como
  `CustomEvent<SelectChangeDetail>`, y TypeScript no deja declararlo otra vez con otro tipo. Por eso
  `number/index.ts` no lo declara (hay un comentario). Si se quiere tipado en
  `addEventListener("nx-change", …)` para los dos, cambiar la declaración de select a
  `CustomEvent<SelectChangeDetail | import("../number/types").NumberChangeDetail>` y agregar la
  misma línea en number; mientras tanto, se convierte (`e as Event as CustomEvent<NumberChangeDetail>`).
  En Solid pasa igual con `CustomEvents["nx-change"]`: el envoltorio convierte el tipo.
- **Otros archivos a tocar** (como con survey): `src/index.ts` → `export * from "./components/number/index";`;
  `src/styles/nx-ui.css` → `@import "../components/number/number.css";`; `vite.config.ts` (entradas
  de la librería) → `number: "src/components/number/index.ts"`; `scripts/build-css.mjs` →
  `number: "src/components/number/number.css"`; `package.json` → `"./number": { "types":
  "./dist/types/components/number/index.d.ts", "import": "./dist/number.js" }` y
  `"./number.css": "./dist/number.css"`. Los nombres que exporta no chocan con los que ya hay.
- **Galería:** la página usa `lang="es-CO"` en sus bloques porque el documento es `lang="es"`: con
  «es» a secas, `Intl` escribe «1.450.000 COP» en vez de «$ 1.450.000». El icono de la navegación
  es `receipt` (no hay uno de calculadora en `src/icons/lucide.ts`).
- **Decisiones a revisar:** en `percent` el valor es la fracción (0,19), como `Intl`, y se escribe en
  puntos («19»); ahí no hay relativas («+5» es 5 %). Un «-» al comienzo es un negativo, salvo que
  termine en «%» («-10%» es un descuento sobre el valor anterior). Sin «=», «450*3» no se calcula:
  se pide el «=» (como en Excel). «m» es millón (el «mil» se escribe entero).
- **Móvil:** `inputmode="decimal"` saca el teclado numérico, que no trae «=» ni «*»; en el móvil
  las cuentas se escriben con el teclado completo (cambiando de teclado). Es lo que pide el brief.
- **Verificado solo en Chromium** (Playwright con el Chromium instalado). No corrí Firefox ni WebKit.
