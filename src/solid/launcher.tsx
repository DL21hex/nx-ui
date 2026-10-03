/** `<Launcher>` para SolidJS: envuelve `<nx-launcher>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/launcher/index";
import type { NxLauncher } from "../components/launcher/launcher";
import type { LauncherItem, LauncherLabels, LauncherProgress, LauncherSelectDetail, LauncherSignal, LauncherTone, LauncherView } from "../components/launcher/types";

export type { NxLauncher, LauncherItem, LauncherLabels, LauncherProgress, LauncherSelectDetail, LauncherSignal, LauncherTone, LauncherView };

/** Sin `children`: las tarjetas las pinta el componente desde `items`. */
export interface LauncherProps extends Omit<JSX.HTMLAttributes<NxLauncher>, "onSelect" | "children"> {
  /** Las tarjetas `{id, label, href?, icon?, description?, section?, views?, signal?, featured?, eyebrow?, progress?}`. */
  items: LauncherItem[];
  /** Muestra el buscador «Ir a» (lo que no coincide se apaga en su sitio; `Enter` abre la primera). */
  search?: boolean;
  /** Lo escrito en el buscador (también filtra sin él). */
  query?: string;
  /** Máximo de columnas (4 por defecto). */
  columns?: number;
  /** Nivel de los títulos de sección (2 por defecto). */
  headingLevel?: number;
  locale?: string;
  labels?: Partial<LauncherLabels>;
  /** Una tarjeta o una vista elegida. Cancelable: `preventDefault()` y la app navega (p. ej. dentro de `startViewTransition`). */
  onSelect?: (e: CustomEvent<LauncherSelectDetail>) => void;
  children?: never;
}

export function Launcher(props: LauncherProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "search", "query", "columns", "headingLevel", "locale", "labels", "onSelect", "children"]);
  return (
    <nx-launcher
      {...rest}
      prop:items={local.items}
      prop:query={local.query}
      prop:labels={local.labels}
      attr:columns={local.columns === undefined ? undefined : String(local.columns)}
      attr:heading-level={local.headingLevel === undefined ? undefined : String(local.headingLevel)}
      attr:locale={local.locale}
      bool:search={!!local.search}
      on:nx-launcher-select={(e) => e.target === e.currentTarget && local.onSelect?.(e)}
    />
  );
}
