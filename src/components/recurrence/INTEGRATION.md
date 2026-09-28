# `<nx-recurrence>`: integración

Repeticiones escritas como se dicen («el último viernes de cada mes a las 5 pm»): debajo del campo,
la frase canónica y las próximas fechas reales (con las corridas por festivo); plegados, los
controles clásicos sincronizados en los dos sentidos. Guarda una RRULE de iCalendar con la extensión
`X-NX-HOLIDAYS` y participa en formularios.

Archivos: `recurrence.ts` (el elemento), `logic.ts` (puro: RRULE de ida y vuelta, generador,
festivos de Colombia, frase canónica), `parse.ts` (puro: el intérprete de frases),
`recurrence-edit.ts` (**chunk aparte**: re-exporta el intérprete y arma los controles de «Ajustar a
mano»), `types.ts`, `recurrence.css`.

### Cambio en `src/components/date-range/*` y `src/core/*` (permitido por el encargo)

Importar de `date-range/logic.ts` arrastraba sus regex de trimestres y semestres (llamadas a `RX()`
en el nivel del módulo, que esbuild no puede quitar): unos 300 B de más. La aritmética de días
(`dayOf`, `ymd`, `isoOf`, `dayOfISO`, `addMonths`, `startOfWeek`, `todayOf`, `monthLen`, `validDay`,
`jsDay`) y la tabla de meses (`MONTH_RX`, `monthNum`) pasaron a **`src/core/days.ts`**;
`date-range/logic.ts` los importa y re-exporta los que ya exportaba (sus pruebas siguen verdes, 79/79).
`dist/date-range.js`: 11 195 B → 11 196 B.

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["Recurrence", { tag: "nx-recurrence", props: ["value", "name", "required", "disabled", "readonly", "start", "holidays", "holidaysMode", "count", "valueFormat", "locale", "label", "labels"] }],
```

Todas son propiedades (`holidaysMode` ↔ `holidays-mode`, `valueFormat` ↔ `value-format`);
`holidays` y `labels` aceptan el valor o su JSON. Ninguna es una URL.

## Peso

Medido con esbuild (min + gzip -9), la entrada como `scripts/size.mjs` (un archivo con lo que
importa estáticamente, `import()` fuera).

| Pieza | Tamaño | Límite propuesto |
|---|---|---|
| `dist/recurrence.js`: elemento + `logic.ts` (RRULE, generador, festivos, frase canónica) + núcleo | **8,93 KB** (9 146 B) | 9,5 KB |
| Chunk `recurrence-edit-*.js` con lo que importa (intérprete + controles + `logic.ts` + núcleo) | **8,24 KB** (8 436 B) | 8,75 KB |
| Lo que agrega ese chunk sobre la entrada (sin `logic.ts` ni núcleo) | 6,67 KB (6 833 B) | — |
| `dist/recurrence.css` | **1,31 KB** (1 340 B, con el target de `build-css.mjs`) | 1,5 KB |

El encargo pedía ≤ 10 KB de JS. Con todo en la entrada eran **15,8 KB**. Para bajar: la frase canónica
formatea fechas con su propio `Intl.DateTimeFormat` (no `nxFormat`, −0,9 KB), y el **intérprete de
frases y los controles van en un chunk con `import()`**. El elemento lo pide al acercarse
(`focusin`/`pointerenter`), al abrir «Ajustar a mano» o si el valor inicial es una frase; una RRULE
que llega del backend se muestra (frase canónica y fechas) sin él. Si el chunk no llega (sin red), se
vuelve a pedir la próxima vez. Por eso **`parseRecurrence` no se exporta desde `nx-ui/recurrence`**
(lo arrastraría a la entrada) sino desde `nx-ui` (ver «Otros archivos»), como el dictado de nx-voice.

Para `scripts/size.mjs`:

```js
  ["dist/recurrence.js", 9.5 * 1024, "recurrence + núcleo (ESM; el intérprete y los controles con import())"],
  // El chunk importa la lógica compartida con la entrada: se mide todo lo que baja al escribir.
  [lazy("recurrence-edit"), 8.75 * 1024, "intérprete de frases y controles de nx-recurrence (se carga al acercarse al campo)"],
  // …
  ["dist/recurrence.css", 1.5 * 1024, "recurrence (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los componentes nuevos):

```ts
  { id: "recurrence", label: "Repeticiones", href: "#/recurrence", icon: "calendar", section: "Componentes", badge: "Nuevo" },
```

(Si `repeat` está entre los íconos generados, queda mejor; si no, `calendar`.)

En `PAGES`: `"#/recurrence": { template: "page-recurrence", mount: mountRecurrenceDemo },` con
`import { mountRecurrenceDemo } from "./demo-recurrence";`. La plantilla está en
`gallery/pages/recurrence.html` para pegarla en `gallery/index.html`; `demo-recurrence.ts` importa
`./pages/recurrence.css` y, mientras `nx-ui.css` no lo haga, `recurrence.css` del componente (esa
línea sobra al unir). La demo no usa backend de mentira.

## Solid

En `src/solid/index.tsx`: agregar `<Recurrence>` al comentario de cabecera, y

```tsx
import "../components/recurrence/index";
import type { NxRecurrence } from "../components/recurrence/recurrence";
import type { RecurrenceChangeDetail, RecurrenceErrorDetail, RecurrenceHolidayMode, RecurrenceLabels, RecurrenceRule, RecurrenceValue, RecurrenceValueFormat } from "../components/recurrence/types";

export type { NxRecurrence, RecurrenceChangeDetail, RecurrenceErrorDetail, RecurrenceHolidayMode, RecurrenceLabels, RecurrenceRule, RecurrenceValue, RecurrenceValueFormat };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `holidays: string[]` ya existe (nx-planner). `value`: agregar `| string` si no está.
      // `labels`: agregar `| Partial<RecurrenceLabels>` a la unión.
    }
    interface ExplicitAttributes {
      // `start`, `name`, `label`, `locale` ya existen. `"value-format"`: ampliar a `SignatureFormat | RecurrenceValueFormat`.
      "holidays-mode": "add" | "replace" | undefined;
      count: string | undefined;
    }
    interface ExplicitBoolAttributes {
      // `required`, `disabled`, `readonly` ya existen.
    }
    interface CustomEvents {
      // `"nx-change"`: ampliar a `CustomEvent<SelectChangeDetail | DateRangeChangeDetail | RecurrenceChangeDetail>`.
      "nx-recurrence-error": CustomEvent<RecurrenceErrorDetail>;
    }
    interface IntrinsicElements {
      "nx-recurrence": HTMLAttributes<NxRecurrence>;
    }
```

El envoltorio (al final del archivo):

```tsx
export interface RecurrenceProps extends Omit<JSX.HTMLAttributes<NxRecurrence>, "onChange" | "onError"> {
  /** Una frase («los lunes a las 8») o una RRULE. */
  value?: string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readonly?: boolean;
  /** Desde cuándo (ISO); por defecto hoy. */
  start?: string;
  /** Festivos propios (ISO), sumados a los de Colombia o en su lugar. */
  holidays?: string[];
  holidaysMode?: "add" | "replace";
  /** Cuántas próximas fechas mostrar (5). */
  count?: number;
  valueFormat?: RecurrenceValueFormat;
  label?: string;
  locale?: string;
  labels?: Partial<RecurrenceLabels>;
  /** Al confirmar lo escrito o cambiar un control: `{value, rrule, text, next}`. */
  onChange?: (e: CustomEvent<RecurrenceChangeDetail>) => void;
  onError?: (e: CustomEvent<RecurrenceErrorDetail>) => void;
}

export function Recurrence(props: RecurrenceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["value", "name", "required", "disabled", "readonly", "start", "holidays", "holidaysMode", "count", "valueFormat", "label", "locale", "labels", "onChange", "onError"]);
  return (
    <nx-recurrence
      {...rest}
      prop:value={local.value}
      prop:holidays={local.holidays}
      prop:labels={local.labels}
      attr:name={local.name}
      attr:start={local.start}
      attr:holidays-mode={local.holidaysMode}
      attr:count={local.count === undefined ? undefined : String(local.count)}
      attr:value-format={local.valueFormat}
      attr:label={local.label}
      attr:locale={local.locale}
      bool:required={!!local.required}
      bool:disabled={!!local.disabled}
      bool:readonly={!!local.readonly}
      on:nx-change={(e) => local.onChange?.(e as unknown as CustomEvent<RecurrenceChangeDetail>)}
      on:nx-recurrence-error={(e) => local.onError?.(e)}
    />
  );
}
```

(`value` es controlable: al leerlo, el elemento da la RRULE. Si la app guarda `e.detail.rrule` y la
vuelve a pasar, el campo muestra la frase canónica de esa RRULE.)

## README

````md
## `<nx-recurrence>`

**Repeticiones en tus palabras**: reportes que se envían solos, el cobro de un arriendo, un
mantenimiento preventivo, un recordatorio de cierre.

```html
<nx-recurrence name="regla" value="el último viernes de cada mes a las 5 pm"></nx-recurrence>
```

- **Se escribe como se dice** (español de Colombia; inglés básico con `locale="en-US"`): «todos los
  días a las 7», «de lunes a viernes a las 7 am», «cada 15 días desde el lunes», «los días 5 y 20 de
  cada mes», «el primer lunes hábil del mes», «el último día hábil del mes», «cada año el 15 de
  enero», «cada 2 horas de 8 a 18», «hasta el 31 de diciembre», «10 veces», «menos en festivos», «si
  cae festivo, el día hábil siguiente». Tildes, mayúsculas, «5 de la tarde», «17:00», «5pm» y números
  en letras dan igual; lo que no entiende lo dice («no entiendo "quincenal los"»).
- **Cómo se entendió**: la frase canónica («El último viernes de cada mes, a las 5:00 p. m.») y las
  próximas fechas reales («vie 30 oct 2026, 5:00 p. m. · vie 27 nov · …»), marcando las corridas por
  festivo («lun 12 oct → mar 13 oct 2026, por festivo»).
- **Ajustar a mano**: frecuencia, cada N, días (L M M J V S D), del mes («el día 5» / «el último
  viernes»), hora u horario, desde, hasta o N veces, festivos. Los controles reescriben la frase; la
  frase mueve los controles.
- **Festivos de Colombia** incluidos (fijos, Ley Emiliani y los de Pascua, por año); `holidays` suma
  los propios o los reemplaza (`holidays-mode="replace"`).
- **Estándar**: una RRULE de iCalendar (RFC 5545) con `X-NX-HOLIDAYS=skip|before|after`.

| | |
|---|---|
| Propiedades / atributos | `value` (frase o RRULE; al leer, la RRULE), `name`, `required`, `disabled`, `readonly`, `start` (ISO, hoy), `holidays` (JSON), `holidays-mode` (`add`, `replace`), `count` (5), `value-format` (`rrule`, `json`), `locale`, `label`, `labels` · solo lectura: `rule`, `text`, `next` (`Date[]`); `toJSON()` → `{rrule, text, holidays, next}` |
| Eventos | `nx-change` `{value, rrule, text, next}` (al confirmar lo escrito o cambiar un control), `nx-recurrence-error` `{message}` |
| Funciones | `parseRecurrence(frase, {start, locale})`, `describeRecurrence(regla)`, `toRRule()`, `parseRRule()`, `nextOccurrences(regla, desde, n, festivos)`, `recurrenceOccurrences()` (con `movedFrom`), `colombiaHolidays(año)`, `fillRecurrenceRule()`, `RECURRENCE_LABELS` |

**`X-NX-HOLIDAYS`** (la RRULE no tiene festivos): `skip` quita los festivos del conjunto de cada
período **antes** de `BYSETPOS` (así «el último día hábil» es `BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;X-NX-HOLIDAYS=skip`)
y `COUNT` no los cuenta; `before`/`after` corren una fecha que cae en festivo al día hábil (lunes a
viernes, no festivo) anterior o siguiente. Un lector estándar la ignora y da las fechas sin saltar
ni correr festivos.
````

## Otros archivos a tocar

- `src/index.ts` → `export * from "./components/recurrence/index";` y
  `export { parseRecurrence } from "./components/recurrence/parse";`. Nombres revisados contra lo
  exportado hoy: `NxRecurrence`, `RECURRENCE_LABELS`, `colombiaHolidays`, `describeRecurrence`,
  `fillRecurrenceRule`, `nextOccurrences`, `recurrenceOccurrences`, `parseRRule`, `toRRule`,
  `parseRecurrence` y los tipos `Recurrence*` son nuevos. Los re-exports nuevos de
  `date-range/logic.ts` no llegan a `src/index.ts` (date-range exporta con nombres propios desde su `index.ts`).
- `src/styles/nx-ui.css` → `@import "../components/recurrence/recurrence.css";`
- `vite.config.ts` → `recurrence: "src/components/recurrence/index.ts",`
- `scripts/build-css.mjs` → `"recurrence": "src/components/recurrence/recurrence.css",`
- `package.json` → `"./recurrence": { "types": "./dist/types/components/recurrence/index.d.ts", "import": "./dist/recurrence.js" }`
  y `"./recurrence.css": "./dist/recurrence.css"`. `sideEffects` ya cubre los chunks con hash.
- `README.md` → la sección de arriba.
- Después, `<nx-planner>` y `<nx-date-range>` podrían usar `colombiaHolidays` (no se tocaron).

## Decisiones

- **La regla por dentro es la RRULE como objeto** (`RecurrenceRule`); `fillRule` escribe lo implícito
  (el día de `WEEKLY`, el día del mes de `MONTHLY`, día y mes de `YEARLY`) para que la RRULE guardada
  se explique sola. `DTSTART` va siempre, como línea aparte (`DTSTART:…\nRRULE:…`), en hora local
  flotante; `UNTIL` es el final de ese día (`T235959`). Sin hora, la regla es de días enteros.
- **«cada 2 horas de 8 a 18»** se guarda como `FREQ=DAILY;BYHOUR=8,10,…,18`, no `FREQ=HOURLY`: con
  `HOURLY` e intervalos que no dividen 24 («cada 5 horas») un lector estándar daría horas que corren de
  un día a otro. `FREQ=HOURLY` queda para «cada hora» sin horario (y se lee de afuera).
- **Horas con minutos distintos** («a las 8 y a las 2:30») y **fechas del año con días distintos**
  («el 1 de enero y el 25 de diciembre») no caben en una RRULE (combina todo con todo): se dice que no
  se entiende, en vez de guardar fechas de más.
- **«si cae festivo»** mueve solo los festivos (no sábados ni domingos), al día hábil lunes–viernes
  que no sea festivo. En la demo, el arriendo del sábado 5 de diciembre se queda en sábado.
- **«el lunes»** en «desde el lunes» es el próximo (sin contar hoy); una fecha sin año es la próxima
  que viene. La frase canónica dice «desde el …» solo si `DTSTART` no es `start`.
- **Las próximas fechas** empiezan ahora (o en `DTSTART`, si es futuro). `COUNT` cuenta desde `DTSTART`.
- **Generador**: período por período desde `DTSTART` (salta cerca de `from` si no hay `COUNT`), con tope
  de 500 000 períodos y un corte si pasan 400 años (10 en `HOURLY`) sin una fecha. Las corridas por
  festivo se insertan en orden y sin repetir.
- **`nx-change`** sale al confirmar (salir del campo o Enter) si la RRULE cambió, y en cada cambio de
  un control. El anuncio para lectores de pantalla es un `role="status"` aparte que se llena 800 ms
  después de dejar de escribir; la frase visible cambia al instante y es la `aria-describedby`.
- **`toJSON().holidays`** es el modo (`skip`, `before`, `after` o `null`), no la lista de festivos.
- **`value-format="json"`** envía `JSON.stringify(toJSON())`.
- Se agregó `label` (como nx-number) y la etiqueta `day` en `labels`, que no estaban en el encargo.

## No verificado (sin navegador)

- Nada se abrió en un navegador: ni la galería, ni el diseño (campo, frase, lista de fechas, panel de
  controles, modo oscuro, paletas, angosto), ni contraste (`npm run contrast` no corrió; el color de las
  fechas corridas es un ámbar propio con `light-dark()`), ni Playwright.
- El `import()` real del chunk (nombre `recurrence-edit-*.js` en el build de Vite/Rolldown) y la espera
  del primer clic en frío; en happy-dom se espera el módulo.
- El <form> real: happy-dom no tiene `ElementInternals`; las pruebas usan uno de mentira (valor,
  validez) y llaman `formResetCallback` a mano.
- `Intl` del navegador: las pruebas corren con el ICU de Node («sept», «p. m.» con espacios finos).
- El anuncio del `role="status"` en lectores de pantalla reales.
