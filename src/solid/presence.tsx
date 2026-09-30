/** `<Presence>` para SolidJS: envuelve `<nx-presence>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/presence/index";
import type { NxPresence } from "../components/presence/presence";
import type { PresenceEvent, PresenceLabels, PresenceState, PresenceUser } from "../components/presence/types";

export type { NxPresence, PresenceEvent, PresenceLabels, PresenceState, PresenceUser };

export interface PresenceProps extends Omit<JSX.HTMLAttributes<NxPresence>, "onChange"> {
  /** La persona actual `{id, name, avatar?}`. Sin ella, solo escucha. */
  me?: PresenceUser | null;
  /** Canal entre pestañas del mismo navegador (`BroadcastChannel`). */
  channel?: string;
  /** URL de un `EventSource` (SSE) con los eventos de los demás. */
  source?: string;
  /** `id` del formulario cuyos campos se comparten. */
  for?: string;
  /** Milisegundos sin actividad para «inactivo» (120000). */
  idle?: number;
  /** Círculos en la pila, contando «+N» (4). */
  max?: number;
  locale?: string;
  labels?: Partial<PresenceLabels>;
  /** Quiénes están, cada vez que algo cambia. */
  onChange?: (e: CustomEvent<{ users: PresenceState[] }>) => void;
  /** Lo que hace la persona actual: aquí se manda al servidor. */
  onLocal?: (e: CustomEvent<PresenceEvent>) => void;
}

export function Presence(props: PresenceProps): JSX.Element {
  const [local, rest] = splitProps(props, ["me", "channel", "source", "for", "idle", "max", "locale", "labels", "onChange", "onLocal"]);
  return (
    <nx-presence
      {...rest}
      prop:me={local.me}
      prop:labels={local.labels}
      attr:channel={local.channel}
      attr:source={local.source}
      attr:for={local.for}
      attr:idle={local.idle === undefined ? undefined : String(local.idle)}
      attr:max={local.max === undefined ? undefined : String(local.max)}
      attr:locale={local.locale}
      on:nx-presence-change={(e) => local.onChange?.(e)}
      on:nx-presence-local={(e) => local.onLocal?.(e)}
    />
  );
}
