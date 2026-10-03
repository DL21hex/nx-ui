/** `<Command>` para SolidJS: envuelve `<nx-command>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/command/index";
import type { NxCommand } from "../components/command/command";
import type { CommandItem, CommandLabels, CommandSelectDetail } from "../components/command/types";

export type { NxCommand, CommandItem, CommandLabels, CommandSelectDetail };

/** Sin `children`: el contenido de `<nx-command>` lo pinta el componente. */
export interface CommandProps extends Omit<JSX.HTMLAttributes<NxCommand>, "onSelect" | "children"> {
  /** Entradas propias: acciones, enlaces y submenús. */
  items?: CommandItem[];
  /** Id de un `<nx-sidemenu>`: sus pantallas entran en la paleta. */
  menu?: string;
  /** Búsqueda en el servidor: `GET source?q=…` → entradas. */
  source?: string;
  /** Id de un `<nx-agent>` al que se le pregunta lo que no se encuentra. */
  agent?: string;
  /** Id de un `<nx-account>`: sus acciones entran en la paleta. */
  account?: string;
  /** Atajo global (`"mod+k"`); `"none"` lo quita. */
  hotkey?: string;
  placeholder?: string;
  /** Clave de `localStorage` para lo reciente; en un equipo compartido, con el usuario (`"nx-command:ana"`). */
  storage?: string;
  /** Máximo de filas a la vista (50). */
  limit?: number;
  labels?: Partial<CommandLabels>;
  /** Cancelable: la paleta se queda abierta y no navega. */
  onSelect?: (e: CustomEvent<CommandSelectDetail>) => void;
  onAsk?: (e: CustomEvent<{ query: string }>) => void;
  /** La paleta se abrió o se cerró (`e.detail.open`). */
  onOpenChange?: (e: CustomEvent<{ open: boolean }>) => void;
  children?: never;
}

export function Command(props: CommandProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "menu", "source", "agent", "account", "hotkey", "placeholder", "storage", "limit", "labels", "onSelect", "onAsk", "onOpenChange", "children"]);
  return (
    <nx-command
      {...rest}
      prop:items={local.items}
      prop:labels={local.labels}
      attr:menu={local.menu}
      attr:source={local.source}
      attr:agent={local.agent}
      attr:account={local.account}
      attr:hotkey={local.hotkey}
      attr:placeholder={local.placeholder}
      attr:storage={local.storage}
      attr:limit={local.limit === undefined ? undefined : String(local.limit)}
      on:nx-command-select={(e) => e.target === e.currentTarget && local.onSelect?.(e)}
      on:nx-command-ask={(e) => e.target === e.currentTarget && local.onAsk?.(e)}
      on:nx-open-change={(e) => e.target === e.currentTarget && local.onOpenChange?.(e)}
    />
  );
}
