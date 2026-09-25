# `<nx-date-range>`: integración

## BDUI

En `src/bdui.ts`, en `registry`:

```ts
  ["DateRange", { tag: "nx-date-range", props: ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "label", "placeholder", "labels"] }],
```

Todas son propiedades del elemento (`start`, `end`, `phrase`, `compare`, `min`, `max`, `today`,
`fiscalStart`, `weekStart`, `label` y `placeholder` reflejan su atributo). Lo útil para un backend
es `phrase`: manda `"últimos 30 días"` o `"este trimestre"` y no calcula fechas. La prueba
«BDUI: el backend manda una frase…» de `test/date-range.dom.test.ts` registra esta misma línea con
`registerComponent` y verifica que una clave ajena (`innerHTML`) se ignora.

## Peso

Medido con los comandos del brief (minificado + gzip -9):

| Pieza | Medido | Límite propuesto |
|---|---|---|
| `dist/date-range.js` (componente + núcleo que arrastra: define, dom, icons, locale, text) | 10 724 B (≈ 10,5 KB) | `11 * 1024` |
| `dist/date-range.css` | 2 429 B (≈ 2,4 KB) | `2.5 * 1024` |

Se pasa del objetivo general de 9 KB: el intérprete de frases (`logic.ts`) pesa por sí solo
≈ 4,6 KB gzip (patrones de días, meses, trimestres, semestres, semanas ISO, año fiscal, rangos con
año y mes prestados, números en palabras). El resto (calendario con teclado, atajos, comparación,
formulario, posicionamiento) ≈ 6 KB, del orden de `<nx-select>`.

Entradas para `scripts/size.mjs`:

```js
  ["dist/date-range.js", 11 * 1024, "date-range + núcleo (ESM)"],
  ["dist/date-range.css", 2.5 * 1024, "date-range (CSS)"],
```

Y, para que existan esos archivos: `date-range: "src/components/date-range/index.ts"` en las
entradas de `vite.config.ts` (build de la librería), `"date-range": "src/components/date-range/date-range.css"`
en `scripts/build-css.mjs`, `@import "../components/date-range/date-range.css";` en
`src/styles/nx-ui.css`, y la entrada `"./date-range"` en `exports` de `package.json` (como `./select`).

## Nav

```ts
  { id: "date-range", label: "Rango de fechas", href: "#/date-range", icon: "calendar", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES` de `gallery/main.ts`:

```ts
import { mountDateRangeDemo } from "./demo-date-range";
  "#/date-range": { template: "page-date-range", mount: mountDateRangeDemo },
```

La plantilla está en `gallery/pages/date-range.html` (va dentro de `gallery/index.html`). El CSS de
la demo (`gallery/pages/date-range.css`) lo importa `gallery/demo-date-range.ts`, así que no hay que
agregarlo en otro lado. El CSS del componente llega con `src/styles/nx-ui.css` (ver «Peso»).

## Solid

En `src/solid/index.tsx`:

```tsx
import type { NxDateRange } from "../components/date-range/date-range";
import type { DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePresetInput, DateRangeValue } from "../components/date-range/types";

export type { NxDateRange, DateRangeChangeDetail, DateRangeCompare, DateRangeLabels, DateRangePresetInput, DateRangeValue };

export interface DateRangeProps extends Omit<JSX.HTMLAttributes<NxDateRange>, "onChange"> {
  /** `{start, end}` (ISO) o «2026-07-01/2026-09-30». Sin él, `start`/`end` o `phrase` dan el inicial. */
  value?: DateRangeValue | string | null;
  start?: string;
  end?: string;
  /** Valor inicial como frase: «este trimestre», «últimos 30 días». */
  phrase?: string;
  /** Atajos: frases o `{label, phrase | start + end}`. */
  presets?: DateRangePresetInput[];
  /** `previous`, `year` o `none` (la opción visible sin comparar). Sin él no se ofrece comparar. */
  compare?: DateRangeCompare | "none";
  min?: string;
  max?: string;
  today?: string;
  /** Mes en que empieza el año fiscal (1–12). */
  fiscalStart?: number;
  /** Primer día de la semana, 1 (lunes) … 7 (domingo). */
  weekStart?: number;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Nombre accesible del campo. */
  label?: string;
  locale?: string;
  labels?: Partial<DateRangeLabels>;
  onChange?: (e: CustomEvent<DateRangeChangeDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

export function DateRange(props: DateRangeProps): JSX.Element {
  const [local, rest] = splitProps(props, ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "placeholder", "label", "locale", "labels", "onChange", "onOpenChange"]);
  return (
    <nx-date-range
      {...rest}
      prop:value={local.value}
      prop:presets={local.presets}
      prop:labels={local.labels}
      attr:start={local.start}
      attr:end={local.end}
      attr:phrase={local.phrase}
      attr:compare={local.compare}
      attr:min={local.min}
      attr:max={local.max}
      attr:today={local.today}
      attr:fiscal-start={local.fiscalStart === undefined ? undefined : String(local.fiscalStart)}
      attr:week-start={local.weekStart === undefined ? undefined : String(local.weekStart)}
      attr:name={local.name}
      attr:placeholder={local.placeholder}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      on:nx-change={(e) => local.onChange?.(e as unknown as CustomEvent<DateRangeChangeDetail>)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    />
  );
}
```

`value = undefined` no toca el valor (el elemento lo ignora), así que `prop:value` sin valor no
pisa `phrase` ni `start`/`end`.

Declaraciones:

- `ExplicitProperties`: `value` pasa a `string | string[] | DateRangeValue | null | undefined`;
  agregar `presets: DateRangePresetInput[] | undefined`; en `labels`, agregar `| Partial<DateRangeLabels>`.
- `ExplicitAttributes`: agregar `start`, `end`, `phrase`, `compare`, `min`, `max`, `today`,
  `"fiscal-start"`, `"week-start"` (todos `string | undefined`; `placeholder`, `label`, `name` y
  `locale` ya están).
- `ExplicitBoolAttributes`: nada nuevo (`required` y `disabled` ya están).
- `CustomEvents`: `"nx-change"` pasa a `CustomEvent<SelectChangeDetail | DateRangeChangeDetail>`
  (y en `Select`, `on:nx-change={(e) => local.onChange?.(e as CustomEvent<SelectChangeDetail>)}`);
  `"nx-open-change"` ya sirve (`OpenChangeDetail` es `{open}`).
- `IntrinsicElements`: `"nx-date-range": HTMLAttributes<NxDateRange> & { label?: string; placeholder?: string };`
- Agregar `<DateRange>` a la lista del comentario de cabecera.

## README

````md
## `<nx-date-range>`

Un rango de fechas que se escribe como se dice. Cerrado es un campo compacto
(«1 jul – 30 sept 2026 · 92 días»); abierto, una caja donde se escribe en español, que muestra en
vivo cómo lo entendió («1 jul – 30 sept 2026 · 92 días» o «No entendí…») y `Enter` lo aplica;
debajo, atajos y un calendario de dos meses.

- **Frases** (sin tildes ni mayúsculas): «hoy», «ayer», «esta semana», «la semana pasada», «este
  mes», «el mes pasado», «últimos 7/30/90 días», «este trimestre», «último trimestre», «Q3», «Q3
  2025», «este año», «2025», «marzo», «marzo 2025», «de marzo a junio», «desde el 15 de marzo»,
  «hasta el 10 de abril», «15/03/2026 - 20/04/2026», «primer semestre», «semana 12», «en lo que va
  del año», «año fiscal» (con `fiscal-start`). Sin año, la más reciente que ya empezó (en
  septiembre, «Q4» es el del año pasado); en un rango, el extremo que no dice su año o su mes lo
  toma del otro («15 al 20 de abril», «de noviembre a febrero»); un día suelto que así quedaría
  del lado equivocado es del mes de al lado («25 al 5»: del 25 del mes pasado al 5). «Último
  trimestre» es el anterior completo; «últimos N días» cuenta hoy.
- **Calendario** de dos meses (uno en móvil): clic en el inicio y en el fin con vista previa al
  pasar; teclado completo (flechas, `PageUp`/`PageDown`, con `Shift` un año, `Home`/`End`, `Enter`,
  `Escape` suelta un inicio a medias y luego cierra); `min`/`max` deshabilitan días; hoy marcado.
  La semana empieza según `Intl.Locale` (weekInfo), o lunes; `week-start` la fija.
- **Comparar:** `compare="previous"` (el mismo largo justo antes; meses completos → los meses
  anteriores: Q3 → Q2) o `"year"` (las mismas fechas un año antes; 29 feb → 28 feb). Se pinta en el
  calendario y va en el valor.
- **Formulario:** con `name="periodo"` envía `periodo[start]` y `periodo[end]` (y
  `periodo[compare][start|end]`): dos fechas ISO que el servidor lee sin partir nada. `required` y
  `reset` nativos.
- La misma lógica, sin DOM, para el backend: `parseDateRange("Q3 2025", {today, fiscalStart})`,
  `compareRange()`, `formatDateRange()`.

```html
<nx-date-range id="periodo" name="periodo" phrase="últimos 30 días" compare="previous" min="2024-01-01" label="Período"></nx-date-range>
<script>
  periodo.addEventListener("nx-change", (e) => {
    const { start, end, compare, label } = e.detail.value; // "2026-08-27", "2026-09-25", {start, end}, "Últimos 30 días"
  });
</script>
```

| | |
|---|---|
| Propiedades / atributos | `value` (`{start, end, compare?, label?}` o «start/end»), `start`, `end`, `phrase`, `presets`, `compare` (`previous` \| `year` \| `none`), `min`, `max`, `today`, `fiscal-start`, `week-start`, `name`, `required`, `disabled`, `placeholder`, `label`, `locale`, `labels` |
| Métodos | `show(frase?)`, `hide()`, `open` |
| Eventos | `nx-change` `{value}`, `nx-open-change` `{open}` |
````

## A11y

Para `e2e/a11y.spec.ts` (se corrió así, en claro y en oscuro: cero violaciones de axe, ni siquiera
leves):

```ts
test("rango de fechas cerrado, abierto, eligiendo y con una frase que no entiende", async ({ page }) => {
  await open(page, "#/date-range");
  await audit(page, ["#dr-sales", "#dr-fiscal"]);
  await page.locator("#dr-sales .nx-date-range__field").click();
  await expect(page.locator("#dr-sales").getByRole("dialog")).toBeVisible();
  await audit(page, ["#dr-sales"]);
  await page.locator("#dr-sales [data-day]").nth(12).click();
  await page.locator("#dr-sales [data-day]").nth(20).hover();
  await audit(page, ["#dr-sales"]);
  await page.keyboard.press("Escape");
  await page.locator("#dr-sales").getByRole("textbox").fill("cuando pueda");
  await audit(page, ["#dr-sales"]);
});
```

## Notas

- **No toqué el núcleo** (`src/core/`).
- **`HTMLElementEventMap`:** `nx-change` ya lo declara `<nx-select>` (`CustomEvent<SelectChangeDetail>`)
  y `nx-open-change` `<nx-sidemenu>` (`CustomEvent<OpenChangeDetail>`); una segunda declaración con
  otro tipo no compila, así que `src/components/date-range/index.ts` solo declara el tag. Opciones
  para quien integra: ampliar `nx-change` en `src/components/select/index.ts` a
  `CustomEvent<SelectChangeDetail | DateRangeChangeDetail>` (obliga a estrechar en los listeners de
  select que lean `detail.options`), o dejarlo y leer el de date-range como `Event` (así lo hacen la
  demo y las pruebas). `nx-open-change` ya encaja: el `detail` es `{open}`.
- **`src/index.ts`:** `export * from "./components/date-range/index";` (o la lista explícita:
  `NxDateRange`, `DATE_RANGE_LABELS`, `parseDateRange`, `compareRange`, `clampRange`,
  `formatDateRange`, `rangeDays`, `DATE_RANGE_PRESETS` y los tipos `DateRange*`). Los nombres no
  chocan con los existentes.
- **Semana de es-CO:** CLDR dice que en Colombia la semana empieza el domingo, y el brief pedía
  respetar `Intl.Locale` weekInfo cuando exista; por eso la demo muestra Do–Sá. Un ERP que quiera
  lunes pone `week-start="1"` (afecta el calendario y «esta semana»). «Semana N» es siempre ISO (lunes).
- **Año fiscal:** «año fiscal 2025» es el que **empieza** en 2025 (abr 2025 – mar 2026 con
  `fiscal-start="4"`). Documentado en la galería y en `logic.ts`.
- **Fechas numéricas** se leen día/mes/año (español); `en-US` escribiría mes/día. Si hace falta,
  es un parámetro más de `parsePhrase`.
- **Formulario:** probado en el navegador (Playwright): el <form> recibe
  `periodo[start]=2026-04-01 · periodo[end]=2027-03-31 · periodo[compare][start]=… · periodo[compare][end]=…`
  y `checkValidity()` es `false` sin valor con `required`. happy-dom no implementa
  `attachInternals`, así que en las pruebas DOM no se verifica (el elemento funciona igual, sin form).
- `npx tsc --noEmit -p .` reporta 4 errores en `examples/solid/main.tsx` (no encuentra `nx-ui`,
  porque este worktree no tiene `dist/`); son previos y ajenos a este componente.
