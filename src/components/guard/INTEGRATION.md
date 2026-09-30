# `<nx-guard>` — integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Guard", { tag: "nx-guard", props: ["fields", "mode", "endpoint", "locale", "labels", "disabled"] }],
```

`render()` crea el elemento sin hijos: el guard vigila lo que tiene adentro, así que el renderizador
BDUI de la app tiene que poner el formulario como hijo (o el autor mete el formulario después; los
campos que entran después se vigilan igual, por delegación). No tiene `for` como `<nx-paste-fill>`:
ver «Notas».

## Peso

Medido con los comandos del brief (esbuild, minificado + gzip -9):

| Pieza | gzip |
|---|---|
| `src/components/guard/index.ts` (elemento + lógica + núcleo) | **8 940 B (8,7 KB)** |
| solo `logic.ts` (con `nxFormat` y `foldText`) | 4 830 B |
| `guard.css` | **950 B (0,93 KB)** |

**El JS pasa la meta de 6 KB.** El núcleo que arrastra (`nxFormat`, `h`, `safeEndpoint`,
`mergeLabels`, `Base`) son ~1,2 KB; los textos por defecto ~0,6 KB; la lógica (estadística robusta,
lectura de montos, potencias de 10, separador, dígitos, fechas relativas y años) ~3,6 KB; el
elemento (delegación, avisos, corregir/reconocer, `confirm`, servidor) ~3,4 KB. Ya se quitó lo
que sobraba: el ícono va en CSS (`mask`), sin cargar `glyph`, y las piezas repetidas se juntaron
(eso bajó de 9,7 KB). Para llegar a 6 KB habría que dejar fuera funciones del brief (el chequeo
remoto o las fechas, por ejemplo). Límites propuestos para `scripts/size.mjs` (en `BUDGET`):

```js
  ["dist/guard.js", 9.25 * 1024, "guard + núcleo (ESM)"],
  // …
  ["dist/guard.css", 1 * 1024, "guard (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los demás «Nuevo» de Componentes):

```ts
  { id: "guard", label: "Detector de dedazos", href: "#/guard", icon: "shield", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES`: `"#/guard": { template: "page-guard", mount: mountGuardDemo },` con
`import { mountGuardDemo } from "./demo-guard";` e `import "./pages/guard.css";`. La plantilla está en
`gallery/pages/guard.html` para pegarla en `gallery/index.html`. La demo registra su propia ruta
(`addDemoRoute("/demo/guard", …)`): no hay que tocar `gallery/demo-api.ts`.

## Otros archivos compartidos

- `src/index.ts` → `export * from "./components/guard/index";` (los nombres no chocan: `NxGuard`,
  `GUARD_LABELS`, `guardCheck`, `robustRange`, `guardDate`, `readGuardAmount`, `guardReadings` y
  los tipos `Guard*`, `RobustRange`).
- `src/styles/nx32-elements.css` → `@import "../components/guard/guard.css";`
- `vite.config.ts` (entradas de la librería) → `guard: "src/components/guard/index.ts",`
- `scripts/build-css.mjs` → `"guard": "src/components/guard/guard.css",`
- `package.json` → en `exports`:
  `"./guard": { "types": "./dist/types/components/guard/index.d.ts", "import": "./dist/guard.js" },`
  y `"./guard.css": "./dist/guard.css",`. `sideEffects` ya cubre `./src/components/*/index.ts`.
- `src/styles/tokens.css` (opcional): el ámbar sale de `--nx-warning` / `--nx-warning-ink` si
  existen; hoy no existen y `guard.css` trae el suyo (el mismo tono que `--nx-paste-warn`). Si se
  agregan como tokens de resultado (junto a `--nx-success`/`--nx-danger`), el guard los toma solo:

  ```css
  --nx-warning: light-dark(oklch(0.7 0.15 70), oklch(0.8 0.14 75));
  --nx-warning-ink: light-dark(oklch(0.5 0.12 65), oklch(0.83 0.13 80));
  ```

## Solid

En `src/solid/index.tsx`. Comentario de cabecera: agregar `<Guard>` a la lista. Imports y reexport:

```tsx
import "../components/guard/index";
import type { NxGuard } from "../components/guard/guard";
import type { GuardFields, GuardFinding, GuardLabels, GuardMode } from "../components/guard/types";

export type { NxGuard, GuardFields, GuardFinding, GuardLabels, GuardMode };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `fields`: agregar `| GuardFields` a la unión (hoy SelectField[] | HistoryField[] | PasteFieldInput[] | SyncField[]).
      // `labels`: agregar `| Partial<GuardLabels>`.
    }
    interface ExplicitAttributes {
      // `mode`: ampliar a `DialogMode | ScanMode | GuardMode | undefined`.
      // `endpoint` y `locale` ya existen.
    }
    interface ExplicitBoolAttributes {
      // `disabled` ya existe.
    }
    interface CustomEvents {
      "nx-guard-warn": CustomEvent<{ field: string; finding: GuardFinding }>;
      "nx-guard-fix": CustomEvent<{ field: string; from: number | string | null; to: number | string }>;
      "nx-guard-ack": CustomEvent<{ field: string; value: number | string | null }>;
      "nx-guard-block": CustomEvent<{ findings: GuardFinding[] }>;
    }
    interface IntrinsicElements {
      "nx-guard": HTMLAttributes<NxGuard> & { endpoint?: string };
    }
```

El envoltorio (al final del archivo):

```tsx
export interface GuardProps extends JSX.HTMLAttributes<NxGuard> {
  /** La configuración por `name`: `{precio: {history: [...], format: "money", currency: "COP"}}`. */
  fields?: GuardFields;
  /** `warn` (por defecto: nunca bloquea) o `confirm` (el primer envío con avisos se detiene). */
  mode?: GuardMode;
  /** Recibe `POST {field, value, values}` y responde `{findings: [...]}` (opcional). */
  endpoint?: string;
  locale?: string;
  labels?: Partial<GuardLabels>;
  disabled?: boolean;
  onWarn?: (e: CustomEvent<{ field: string; finding: GuardFinding }>) => void;
  onFix?: (e: CustomEvent<{ field: string; from: number | string | null; to: number | string }>) => void;
  onAck?: (e: CustomEvent<{ field: string; value: number | string | null }>) => void;
  /** Cancelable: cancelarlo deja pasar el envío. */
  onBlock?: (e: CustomEvent<{ findings: GuardFinding[] }>) => void;
  children?: JSX.Element;
}

export function Guard(props: GuardProps): JSX.Element {
  const [local, rest] = splitProps(props, ["fields", "mode", "endpoint", "locale", "labels", "disabled", "onWarn", "onFix", "onAck", "onBlock", "children"]);
  return (
    <nx-guard
      {...rest}
      prop:fields={local.fields}
      prop:labels={local.labels}
      attr:mode={local.mode}
      attr:endpoint={local.endpoint}
      attr:locale={local.locale}
      bool:disabled={!!local.disabled}
      on:nx-guard-warn={(e) => local.onWarn?.(e)}
      on:nx-guard-fix={(e) => local.onFix?.(e)}
      on:nx-guard-ack={(e) => local.onAck?.(e)}
      on:nx-guard-block={(e) => local.onBlock?.(e)}
    >
      {local.children}
    </nx-guard>
  );
}
```

## README

````md
## `<nx-guard>`

El detector de dedazos. Los errores más caros de un ERP no son los que la validación rechaza, sino
los valores válidos pero absurdos: un precio con un cero de más, una cantidad de 1000 donde siempre
van 10, una fecha en 2062, dos dígitos invertidos en un total. `<nx-guard>` envuelve tu formulario
(sin mover sus campos) y, al salir de un campo, compara lo escrito con lo habitual; si algo no
cuadra, lo dice **junto al campo, sin bloquear**, con la corrección a un clic.

- **Un cero de más o de menos:** con `history` (valores recientes del campo) calcula lo habitual
  con mediana y MAD (un atípico en la historia no mueve nada; tiempo lineal, sin ordenar). Si el
  valor está lejos y ÷ o × 10, 100 o 1.000 cae en lo habitual: «$ 12.000.000 es 10 veces lo
  habitual ($ 1.200.000). ¿Sobra un cero?» con «Corregir a $ 1.200.000». Si solo está muy lejos:
  «Muy por encima de lo habitual ($1,1 M – $1,3 M)». Con menos de 4 datos, solo lo obvio. Sin
  historia, `typical: [lo, hi]` o `min`/`max` blandos.
- **Separador confundido:** «1.500» queriendo 1,5, o «1,500» de un sistema en inglés: si la otra
  lectura de lo tecleado cae en lo habitual, «Se leyó 1.500. ¿Querías 1,5?». Lee como
  `<nx-number>` y `nxFormat().parse`.
- **Dígitos invertidos:** con `expected` (un número, `"#id"` de un elemento con el valor o
  `"@name"` de otro campo): «¿Invertiste dos dígitos? Esperado $ 1.530.000» o «Difiere en un
  dígito de …».
- **Fechas:** año con dígitos invertidos o de otro siglo (2062, 2206, 0226 → 2026), fuera de
  `typical: ["-30d", "+90d"]` (ISO o relativas a hoy: `d`, `w`, `m`, `y`, `today`), fin de semana
  o festivo con `workdays` y `holidays`.
- **Además:** `repeat` (igual al último de `history`), decimales donde siempre van enteros
  (`integer`, o deducido de la historia) y negativos donde nunca los hay (`negative`, o deducido).
- **El servidor:** con `endpoint`, `POST {field, value, values}` tras 300 ms (un cambio nuevo
  cancela el anterior); responde `{findings: [{field, kind, message, suggestion?}]}` («Esta factura
  ya se registró el 12 sep»). Si falla o tarda más de 4 s, silencio.
- **Cómo avisa:** una línea sobria debajo del campo (después de su `<label>` si lo envuelve), con
  «Corregir a …» (en `<nx-number>` por su `value`; en un input, con `input` y `change`) y «Está
  bien» (no vuelve a avisar por ese valor). El campo la suma a su `aria-describedby` (nunca
  `aria-invalid`) y se anuncia en una región `role="status"`. Con `mode="confirm"`, el primer envío
  con avisos se detiene y dice cuántos arriba del botón; el segundo pasa.
- **Sin trabajo de más:** delegación de eventos en el guard (los campos que entran después también
  cuentan); nada corre mientras nadie toca el formulario.

```html
<nx-guard mode="confirm" fields='{
  "precio": {"history": [1180000, 1210000, 1195000, 1240000], "format": "money", "currency": "COP"},
  "cantidad": {"typical": [1, 50]},
  "total": {"expected": "#total-oc", "format": "money", "currency": "COP"},
  "fecha": {"typical": ["-60d", "today"]}
}'>
  <form>
    <label for="precio">Precio unitario</label>
    <nx-number id="precio" name="precio" format="money" currency="COP"></nx-number>
    <label>Cantidad <input name="cantidad" data-guard='{"integer": true}'></label>
    <label>Fecha <input name="fecha" type="date"></label>
  </form>
</nx-guard>
```

| | |
|---|---|
| Propiedades / atributos | `fields` (por `name`; o `data-guard` en el campo), `mode` (`warn`, `confirm`), `endpoint`, `locale`, `labels`, `disabled` · `findings` |
| Por campo | `history`, `typical`, `min`, `max`, `expected`, `format`, `currency`, `integer`, `negative`, `repeat`, `type`, `workdays`, `holidays`, `remote: false` |
| Métodos | `check(name?)` (revisa ya y devuelve los hallazgos), `reset()` |
| Eventos | `nx-guard-warn` `{field, finding}`, `nx-guard-fix` `{field, from, to}`, `nx-guard-ack` `{field, value}`, `nx-guard-block` `{findings}` (cancelable) |
| Funciones | `guardCheck(valor, regla, {locale, raw})`, `robustRange(historia)`, `guardDate("-30d")`: la misma lógica en un backend en JavaScript |
````

## A11y

Para `e2e/a11y.spec.ts` (no lo corrí: en esta máquina no se usan navegadores):

```ts
test("detector de dedazos: avisos, confirmación y corrección", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "#/guard");
  await audit(page, ["#gd-demo", ".gd-tools"]);
  await page.getByRole("button", { name: "12.000.000 en el precio" }).click();
  await page.getByRole("button", { name: "2062 en la fecha" }).click();
  await expect(page.locator("#gd-demo .nx-guard__note")).toHaveCount(2);
  await page.locator("input[name=gd-mode][value=confirm]").check();
  await page.getByRole("button", { name: "Registrar factura" }).click();
  await expect(page.locator("#gd-demo .nx-guard__confirm")).toHaveText("Revisa 2 valores inusuales o envía de todos modos");
  await expect(page.locator("#gd-demo .nx-guard__note").first()).toBeFocused();
  await audit(page, ["#gd-demo", ".gd-tools"]);
  await page.getByRole("button", { name: /Corregir a \$ 1\.200\.000/ }).click();
  await expect(page.locator("#gd-precio input")).toBeFocused();
});
```

## Notas

- **No toqué el núcleo** (`src/core/`) ni archivos compartidos.
- **Qué toca del formulario del autor:** nunca mueve sus nodos (hidratación de Solid). Inserta su
  aviso (`.nx-guard__note`) justo después del campo —o de su `<label>`, si lo envuelve, para no
  meter botones dentro de una etiqueta— y lo quita; en `confirm`, la línea `.nx-guard__confirm` va
  antes de la fila del botón de enviar (el hijo del `<form>` que lo contiene). Al campo le suma el id
  del aviso en `aria-describedby` (en `<nx-number>`, en su `<input>` interno, junto a los suyos) y
  `data-nx-guard="warn|info"`; los quita al corregir o reconocer. La región `role="status"` se crea
  la primera vez que el foco entra al guard (ya hidratado), al final del guard. En una grilla, cada
  campo con su etiqueta debería ir en su propio contenedor: el aviso es un hermano del campo.
- **Campos sin configuración:** no se vigilan, salvo `<input type="date">` con un año absurdo
  (< 1900 o más de 20 años adelante) que tenga un vecino a un dedazo de hoy (2062 → 2026). Un año
  raro sin corrección cercana (5555) no se dice: no es seguro.
- **Tipo del campo:** `type` en la regla, o se deduce: `date` si es `<input type="date">` o la
  regla usa fechas (ISO o relativas) o `workdays`; `number` si es `<nx-number>`, `type="number"`, hay
  `format`, `expected`, `integer` o `negative`, o números en `history`/`typical`/`min`/`max`; si no, `text` (solo `repeat` y
  el servidor).
- **`<nx-date-range>`:** no se lee (tiene dos fechas y una comparación; no era trivial). Solo
  `<input type="date">` y texto ISO.
- **Separador:** «1.5» en es-CO es 1,5 para `<nx-number>` y `nxFormat().parse`, así que no se
  contradice: el aviso sale cuando la otra lectura cae en lo habitual (en un campo de decenas, «1.5»
  → «¿Querías 15?»; en uno de unidades, «1.500» → «¿Querías 1,5?»). En `<nx-number>` se usa lo
  que se tecleó (se escucha su `input` interno en captura), solo si todavía corresponde al valor
  (una cuenta como «=1.500*1» no cuenta como separador). En `<input type="number">` no hay texto
  crudo: no se detecta.
- **Umbrales** (en `logic.ts`, a revisar con datos reales): dispersión = máx(1,4826 × MAD, 2 % de la
  mediana); lo habitual para mostrar = mediana ± 3 dispersiones; «muy lejos» = más de máx(5
  dispersiones, 50 % de la mediana); una corrección vale si cae a máx(3 dispersiones, 25 %) de la
  mediana; la potencia de 10 se busca solo si la razón con la mediana es ≥ 3 (o ≤ 1/3). Con menos
  de 4 datos: razón ≥ 8 y corrección a ±15 %. Con `typical`/`min`/`max`, salir ya avisa y la
  potencia se busca desde 3 veces afuera.
- **Remoto:** todos los campos configurados se mandan (salvo `remote: false`); el mismo valor no
  se vuelve a preguntar. Lo del servidor va primero en el aviso (es más específico). Solo con
  `endpoint` del mismo origen (o de `allowOrigins()`).
- **«Corregir» en `<nx-number>`** pone `value` y emite `input`, `change` y `nx-change` `{value,
  text}` (lo mismo que emite él al confirmar), para que un framework que escucha cualquiera se
  entere. En un input nativo escribe con el setter nativo (React) y emite `input` y `change`; el
  número va formateado en el locale («1.200.000»), salvo `type="number"`.
- **`fields` en Solid** choca de nombre con el de `<nx-select>`, `<nx-history>`, `<nx-paste-fill>`
  y `<nx-sync>` (ver `## Solid`).
- **Sin verificar en navegador:** por las reglas de esta máquina no corrí Playwright, la galería ni
  `npm run check`. Verificado: `vitest` (lógica en node y DOM en happy-dom), `tsc --noEmit` y el
  peso con esbuild. Falta ver en un navegador: el aspecto del aviso y del ícono (`mask`), el foco y
  el anuncio real en un lector de pantalla, `requestSubmit()`/`submitter` reales, el `blur` de
  `<nx-number>` y la galería en móvil.
