/** `<Command>` para SolidJS: envuelve `<nx-command>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/command/index";
import type { NxCommand } from "../components/command/command";
import type { CommandItem, CommandLabels, CommandSelectDetail } from "../components/command/types";

export type { NxCommand, CommandItem, CommandLabels, CommandSelectDetail };

export interface CommandProps extends Omit<JSX.HTMLAttributes<NxCommand>, "onSelect"> {
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
  storage?: string;
  /** Máximo de filas a la vista (50). */
  limit?: number;
  labels?: Partial<CommandLabels>;
  /** Cancelable: la paleta se queda abierta y no navega. */
  onSelect?: (e: CustomEvent<CommandSelectDetail>) => void;
  onAsk?: (e: CustomEvent<{ query: string }>) => void;
}

export function Command(props: CommandProps): JSX.Element {
  const [local, rest] = splitProps(props, ["items", "menu", "source", "agent", "account", "hotkey", "placeholder", "storage", "limit", "labels", "onSelect", "onAsk"]);
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
      on:nx-command-select={(e) => local.onSelect?.(e)}
      on:nx-command-ask={(e) => local.onAsk?.(e)}
    />
  );
}
