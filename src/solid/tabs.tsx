/** `<Tabs>` para SolidJS: envuelve `<nx-tabs>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/tabs/index";
import type { NxTabs } from "../components/tabs/tabs";
import type { TabChangeDetail, TabItem, TabsLabels } from "../components/tabs/types";

export type { NxTabs, TabChangeDetail, TabItem, TabsLabels };

export interface TabsProps extends Omit<JSX.HTMLAttributes<NxTabs>, "onChange"> {
  /** La pestaña activa (controlada si se actualiza en `onChange`). */
  value?: string;
  /** Las pestañas, si no salen de los hijos con `data-tab`. */
  tabs?: TabItem[];
  /** La lista se queda arriba al desplazarse. */
  sticky?: boolean;
  /** Nombre de la lista para el lector de pantalla. */
  label?: string;
  labels?: Partial<TabsLabels>;
  /** Cancelable: `e.preventDefault()` deja la pestaña donde estaba. */
  onChange?: (e: CustomEvent<TabChangeDetail>) => void;
  children?: JSX.Element;
}

export function Tabs(props: TabsProps): JSX.Element {
  const [local, rest] = splitProps(props, ["value", "tabs", "sticky", "label", "labels", "onChange", "children"]);
  // `onChange` solo con las suyas: el cambio de unas pestañas anidadas también burbujea.
  return (
    <nx-tabs
      {...rest}
      prop:value={local.value}
      prop:tabs={local.tabs}
      prop:labels={local.labels}
      attr:label={local.label}
      bool:sticky={!!local.sticky}
      on:nx-tabs-change={(e) => e.target === e.currentTarget && local.onChange?.(e)}
    >
      {local.children}
      {/* Tope de los hijos: ver «Hijos» en ./index.tsx. */}
      <template />
    </nx-tabs>
  );
}
