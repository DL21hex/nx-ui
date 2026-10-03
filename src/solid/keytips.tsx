/** `<Keytips>` para SolidJS: envuelve `<nx-keytips>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/keytips/index";
import type { NxKeytips } from "../components/keytips/keytips";
import type { KeytipAssignment, KeytipDetail, KeytipsLabels } from "../components/keytips/types";
import type { OpenChangeDetail } from "../components/sidemenu/types";

export type { NxKeytips, KeytipAssignment, KeytipDetail, KeytipsLabels };

export interface KeytipsProps extends JSX.HTMLAttributes<NxKeytips> {
  /** Selector de la región con atajos (por defecto, toda la página). */
  scope?: string;
  /** La tecla que los muestra: `Alt` (por defecto), `Control`, `Shift` o `Meta`; `none`: solo con `show()`. */
  trigger?: string;
  /** Lo mismo que `trigger`, con el nombre del setter de la clase. */
  key?: string;
  disabled?: boolean;
  labels?: Partial<KeytipsLabels>;
  /** Antes de ejecutar una acción: `{key, target, name}`. Cancelable. */
  onActivate?: (e: CustomEvent<KeytipDetail>) => void;
  onOpenChange?: (e: CustomEvent<OpenChangeDetail>) => void;
}

/** `<nx-keytips>`: la tecla va como `trigger` (en JSX, `key` es de otros). */
export function Keytips(props: KeytipsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["scope", "trigger", "key", "disabled", "labels", "onActivate", "onOpenChange"]);
  return (
    <nx-keytips
      {...rest}
      prop:labels={local.labels}
      attr:scope={local.scope}
      attr:key={local.key ?? local.trigger}
      bool:disabled={!!local.disabled}
      on:nx-keytips-activate={(e) => local.onActivate?.(e)}
      on:nx-open-change={(e) => local.onOpenChange?.(e)}
    />
  );
}
