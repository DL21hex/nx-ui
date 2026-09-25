# `<nx-what-if>`: integración

## BDUI

En `src/bdui.ts`, dentro de `registry`:

```ts
  ["WhatIf", { tag: "nx-what-if", props: ["inputs", "outputs", "series", "scenarios", "values", "endpoint", "debounce", "heading", "locale", "labels"] }],
```

## Peso

Medido con los comandos del brief (gzip -9):

- JS `src/components/what-if/index.ts` (ESM, minificado, con núcleo): **10.026 B (9,8 KB)**, dentro del límite de 10 KB de este componente.
- CSS `src/components/what-if/what-if.css`: **2.521 B (2,5 KB)**.

Límites propuestos para `scripts/size.mjs` (en `BUDGET`):

```js
  ["dist/what-if.js", 10 * 1024, "what-if + núcleo (ESM)"],
  // …
  ["dist/what-if.css", 3 * 1024, "what-if (CSS)"],
```

## Nav

En `gallery/main.ts`, dentro de `NAV` (con los demás «Nuevo»):

```ts
  { id: "what-if", label: "Simulador", href: "#/what-if", icon: "trending-up", section: "Componentes", badge: "Nuevo" },
```

Y en `PAGES`: `"#/what-if": { template: "page-what-if", mount: mountWhatIfDemo },` con
`import { mountWhatIfDemo } from "./demo-what-if";`. La plantilla está en `gallery/pages/what-if.html`
para pegarla en `gallery/index.html` (la demo no necesita CSS propio). Importar `demo-what-if.ts`
registra la ruta `POST /demo/what-if` con `addDemoRoute` (no hay que tocar `demo-api.ts`).

## Solid

En `src/solid/index.tsx`.

Comentario de cabecera: agregar `<WhatIf>` a la lista de envoltorios. Imports y reexport:

```tsx
import "../components/what-if/index";
import type { NxWhatIf } from "../components/what-if/what-if";
import type { WhatIfChangeDetail, WhatIfComputeDetail, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfValues } from "../components/what-if/types";

export type { NxWhatIf, WhatIfChangeDetail, WhatIfComputeDetail, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfValues };
```

En `declare module "solid-js" { namespace JSX { … } }`:

```tsx
    interface ExplicitProperties {
      // `labels`: agregar `| Partial<WhatIfLabels>` a la unión.
      inputs: WhatIfInput[] | undefined;
      outputs: WhatIfMetric[] | undefined;
      series: WhatIfSeries[] | undefined;
      scenarios: WhatIfScenario[] | undefined;
      values: WhatIfValues | undefined;
    }
    interface ExplicitAttributes {
      debounce: string | undefined;
      // `endpoint`, `heading` y `locale` ya existen.
    }
    interface ExplicitBoolAttributes {
      // nada nuevo
    }
    interface CustomEvents {
      "nx-what-if-compute": CustomEvent<WhatIfComputeDetail>;
      "nx-what-if-save": CustomEvent<WhatIfSaveDetail>;
      "nx-what-if-change": CustomEvent<WhatIfChangeDetail>;
    }
    interface IntrinsicElements {
      "nx-what-if": HTMLAttributes<NxWhatIf> & { heading?: string; endpoint?: string };
    }
```

El envoltorio (al final del archivo):

```tsx
export interface WhatIfProps extends JSX.HTMLAttributes<NxWhatIf> {
  /** Los supuestos: `value` es la base; en `percent`, la fracción. */
  inputs: WhatIfInput[];
  /** Las métricas (`better: "up" | "down"` colorea la diferencia). */
  outputs?: WhatIfMetric[];
  /** Series del gráfico de líneas (base punteada vs. escenario). */
  series?: WhatIfSeries[];
  /** Los escenarios guardados; la app los persiste con `onSave`. */
  scenarios?: WhatIfScenario[];
  /** Los supuestos de ahora (para cargar un escenario desde fuera). */
  values?: WhatIfValues;
  /** `POST {inputs}` → NDJSON. Sin él, `onCompute`. */
  endpoint?: string;
  /** Espera en ms entre el último cambio y el cálculo (250). */
  debounce?: number;
  heading?: string;
  locale?: string;
  labels?: Partial<WhatIfLabels>;
  /** Sin `endpoint`: calcula `e.detail.inputs` y llama `e.detail.respond(events)` (o `preventDefault()` y responde después). */
  onCompute?: (e: CustomEvent<WhatIfComputeDetail>) => void;
  /** Cancelable: guardar, renombrar o borrar; `e.detail.scenarios` es la lista nueva. */
  onSave?: (e: CustomEvent<WhatIfSaveDetail>) => void;
  onChange?: (e: CustomEvent<WhatIfChangeDetail>) => void;
}

export function WhatIf(props: WhatIfProps): JSX.Element {
  const [local, rest] = splitProps(props, ["inputs", "outputs", "series", "scenarios", "values", "endpoint", "debounce", "heading", "locale", "labels", "onCompute", "onSave", "onChange"]);
  return (
    <nx-what-if
      {...rest}
      prop:inputs={local.inputs}
      prop:outputs={local.outputs}
      prop:series={local.series}
      prop:scenarios={local.scenarios}
      prop:values={local.values}
      prop:labels={local.labels}
      attr:endpoint={local.endpoint}
      attr:debounce={local.debounce === undefined ? undefined : String(local.debounce)}
      attr:heading={local.heading}
      attr:locale={local.locale}
      on:nx-what-if-compute={(e) => local.onCompute?.(e)}
      on:nx-what-if-save={(e) => local.onSave?.(e)}
      on:nx-what-if-change={(e) => local.onChange?.(e)}
    />
  );
}
```

(Ojo con el orden: `prop:inputs` antes que `prop:values`, porque asignar `inputs` vuelve todo a la
base. Solid asigna en el orden del JSX.)

## README

````md
## `<nx-what-if>`

Un simulador de escenarios para decisiones de negocio: «¿qué pasa con el margen si el acero sube 8 %
y vendemos 5 % menos?». El componente no lleva fórmulas: el cálculo lo hace el backend (en
streaming) o la app. Todo lo demás —deslizadores, animación, diferencias contra la base, gráfico y
comparación de escenarios— es suyo.

- **Supuestos:** deslizadores con la base marcada en la pista y el tramo desde ella resaltado. El
  valor grande se escribe con un clic («4.600», «4,5 M», «150 mil»; en porcentaje, puntos) y debajo
  va «+8 % vs. base». «Restablecer» por supuesto y para todos. La grilla de `step` parte de la base,
  así que arrastrando se vuelve exacto a ella.
- **Teclado:** ←/→ ± `step` (Mayús ×10), RePág/AvPág ± 10 pasos, Inicio/Fin. `aria-valuetext` dice el
  valor con su formato y la diferencia («US$ 842, +8 % vs. base»).
- **Resultados:** tarjetas con el valor del escenario (el número corre hacia el nuevo; directo con
  `prefers-reduced-motion`), la base y la diferencia, en verde si mejora según `better` y en rojo si
  empeora (en porcentajes, en puntos: «-2,8 p. p.»). Un gráfico de líneas propio, sin librerías:
  base punteada, escenario continuo, el área entre los dos y el cero si el rango lo cruza (y una
  tabla oculta con los datos para el lector de pantalla).
- **Cálculo:** con espera entre cambios (`debounce`, 250 ms); la petición anterior se cancela
  (`AbortController`) y una respuesta vieja nunca pisa a una nueva. Mientras llega, los resultados se
  atenúan. Sin `endpoint`, el evento `nx-what-if-compute` le pide el cálculo a la app.
- **Escenarios:** «Guardar como…» guarda supuestos y resultados con un nombre. Una tabla compara la
  base, el escenario actual y los guardados lado a lado, con la mejor celda de cada métrica resaltada;
  desde el encabezado de cada columna se cargan, renombran y borran. La app los persiste
  (`nx-what-if-save`).

```html
<nx-what-if id="plan" heading="Plan de compras 2027" endpoint="/finanzas/plan-2027/simular"></nx-what-if>
<script>
  plan.inputs = [
    { id: "acero", label: "Precio del acero", value: 780, min: 546, max: 1014, step: 5, format: "money", currency: "US$" },
    { id: "volumen", label: "Volumen de ventas", value: 144000, min: 115200, max: 172800, step: 1440, unit: "u." },
  ];
  plan.outputs = [
    { id: "margen", label: "Margen bruto", format: "percent", better: "up" },
    { id: "equilibrio", label: "Punto de equilibrio", unit: "u.", better: "down" },
  ];
  plan.addEventListener("nx-what-if-save", (e) => guardar(e.detail.scenarios));
</script>
```

El backend recibe `POST {inputs: {acero: 842, volumen: 136800}}` y responde una línea por evento:

```
{"type":"metric","id":"margen","value":0.193,"base":0.221}
{"type":"series","id":"caja","label":"Saldo de caja","format":"money","currency":"COP","points":[{"x":"ene","base":7640e6,"value":7329e6}, …]}
{"type":"note","message":"El margen cae bajo el 15 %","tone":"warning"}
{"type":"done"}
```

| | |
|---|---|
| Propiedades / atributos | `inputs` (`[{id, label, value, min, max, step?, format?, currency?, unit?, hint?}]`), `outputs` (`[{id, label, value?, base?, format?, currency?, unit?, better?}]`), `series` (`[{id, label, format?, currency?, points: [{x, base?, value}]}]`), `scenarios` (`[{id, name, inputs, outputs}]`), `values`, `endpoint`, `debounce`, `heading`, `locale`, `labels` |
| Métodos | `reset(id?)`, `recompute()`, `save(name?)` |
| Eventos | `nx-what-if-compute` `{inputs, respond(events)}`, `nx-what-if-save` `{action, scenario, scenarios}` (cancelable), `nx-what-if-change` `{id, inputs}` |
| Protocolo | NDJSON o SSE: `metric`, `series`, `note` (`tone`), `error`, `done` |
````

## A11y

Para `e2e/a11y.spec.ts`:

```ts
test("simulador: en la base, con notas de advertencia y peligro, escribiendo y renombrando", async ({ page }) => {
  await open(page, "#/what-if");
  const demo = page.locator("#what-if-demo");
  await expect(demo.locator(".nx-what-if__card").first()).toBeVisible();
  await audit(page, ["#what-if-demo"]);
  await demo.getByRole("slider", { name: "Precio del acero" }).focus();
  await page.keyboard.press("End");
  await demo.getByRole("slider", { name: "Tasa de cambio USD/COP" }).focus();
  await page.keyboard.press("End");
  await demo.getByRole("slider", { name: "Volumen de ventas" }).focus();
  await page.keyboard.press("Home");
  await expect(demo.locator('.nx-what-if__note[data-tone="danger"]')).toBeVisible();
  await expect(demo.locator(".nx-what-if__results")).not.toHaveAttribute("data-busy", "");
  await audit(page, ["#what-if-demo"]);
  await demo.locator(".nx-what-if__big").first().click();
  await demo.getByRole("button", { name: "Guardar como…" }).click();
  await demo.getByRole("button", { name: "Renombrar Plan agresivo de ventas" }).click();
  await audit(page, ["#what-if-demo"]);
});
```

(Probado en claro y en oscuro: cero violaciones, ni siquiera menores.)

## Notas

- **No toqué el núcleo** (`src/core/`) ni otros componentes.
- **Otros archivos a tocar** (como con los demás): `src/index.ts` → `export * from "./components/what-if/index";`;
  `src/styles/nx-ui.css` → `@import "../components/what-if/what-if.css";`; `vite.config.ts` (entradas
  de la librería) → `"what-if": "src/components/what-if/index.ts"`; `scripts/build-css.mjs` →
  `"what-if": "src/components/what-if/what-if.css"`; `package.json` → `"./what-if": { "types":
  "./dist/types/components/what-if/index.d.ts", "import": "./dist/what-if.js" }` y
  `"./what-if.css": "./dist/what-if.css"`. Los nombres que exporta (`NxWhatIf`, `WHAT_IF_LABELS`,
  `whatIf*`, `parseWhatIfEvent`, tipos `WhatIf*`) no chocan con los que ya hay.
- `gallery/demo-what-if.ts` importa `../src/components/what-if/index` para registrar el elemento
  (sobra cuando `src/index.ts` lo exporte, pero no molesta). Para probar importé temporalmente el CSS
  del componente en `main.ts`; con la línea de `nx-ui.css` ya no hace falta.
- **Base de las métricas:** si un evento `metric` no trae `base`, la base es el valor que dio el
  cálculo con todos los supuestos en la base (el primero, al conectar). Lo mismo con los puntos de
  una serie. El backend de la demo manda `base` siempre, que es lo más robusto.
- **Deslizador nativo** (`<input type="range" step="any">`): el arrastre, el táctil y el rol de
  slider son del navegador; el teclado lo maneja el componente (la grilla de `step` parte de la
  base, no de `min`, para que la base siempre sea alcanzable).
- **Compacto:** los montos grandes se muestran con tres cifras significativas («$20,1 MRD» en
  Chromium, «$20,1 mil M» en Node: es lo que da `Intl` en cada motor para `es-CO`).
- **Peso:** queda justo bajo los 10 KB del brief (10.026 B). Si se necesita margen, lo más caro es la
  tabla comparativa con renombrar en su lugar.
- **Verificado solo en Chromium** (Playwright con el Chromium instalado). No corrí Firefox ni
  WebKit; el estilo del pulgar tiene reglas para `::-moz-range-thumb`, pero no lo vi en Firefox. La
  transición de la línea del gráfico (`transition: d`) solo anima en Chromium; en los demás salta.
