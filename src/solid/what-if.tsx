/** `<WhatIf>` para SolidJS: envuelve `<nx-what-if>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/what-if/index";
import type { NxWhatIf } from "../components/what-if/what-if";
import type { WhatIfChangeDetail, WhatIfComputeDetail, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfValues } from "../components/what-if/types";

export type { NxWhatIf, WhatIfChangeDetail, WhatIfComputeDetail, WhatIfInput, WhatIfLabels, WhatIfMetric, WhatIfSaveDetail, WhatIfScenario, WhatIfSeries, WhatIfValues };

export interface WhatIfProps extends Omit<JSX.HTMLAttributes<NxWhatIf>, "onChange"> {
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
