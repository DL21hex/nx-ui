/** `<Agent>` para SolidJS: envuelve `<nx-agent>`. Por qué `prop:` y `bool:`, en `./index.tsx`. */
import { splitProps, type JSX } from "solid-js";
import "./jsx";
import "../components/agent/index";
import type { NxAgent } from "../components/agent/agent";
import type { AgentLabels, AgentToolDetail, AguiContext, AguiEvent, AguiTool } from "../components/agent/types";

export type { NxAgent, AgentLabels, AgentToolDetail, AguiContext, AguiEvent, AguiTool };

export interface AgentProps extends Omit<JSX.HTMLAttributes<NxAgent>, "children"> {
  /** URL del agente AG-UI (POST de un `RunAgentInput`, eventos en streaming). */
  endpoint: string;
  /** Id de un `<nx-grid>` que el agente puede filtrar y seleccionar. */
  for?: string;
  heading?: string;
  placeholder?: string;
  suggestions?: string[];
  /** Herramientas propias de la app; se atienden en `onTool` llamando a `e.detail.respond(...)`. */
  tools?: AguiTool[];
  context?: AguiContext[];
  /** Componentes BDUI que puede mostrar con `nx_show` (`["Trend", "Grid"]` o `"Trend, Grid"`). Sin él, todos. */
  show?: string[] | string;
  /** Estado compartido con el agente (`STATE_SNAPSHOT` / `STATE_DELTA`). */
  state?: unknown;
  labels?: Partial<AgentLabels>;
  onTool?: (e: CustomEvent<AgentToolDetail>) => void;
  onState?: (e: CustomEvent<{ state: unknown }>) => void;
  onEvent?: (e: CustomEvent<AguiEvent>) => void;
  /** Sin hijos: el componente pinta todo su contenido. */
  children?: never;
}

export function Agent(props: AgentProps): JSX.Element {
  const [local, rest] = splitProps(props, ["endpoint", "for", "heading", "placeholder", "suggestions", "tools", "context", "show", "state", "labels", "onTool", "onState", "onEvent", "children"]);
  return (
    <nx-agent
      {...rest}
      attr:endpoint={local.endpoint}
      attr:for={local.for}
      attr:heading={local.heading}
      attr:placeholder={local.placeholder}
      attr:show={Array.isArray(local.show) ? local.show.join(",") : local.show}
      prop:suggestions={local.suggestions}
      prop:tools={local.tools}
      prop:context={local.context}
      prop:state={local.state}
      prop:labels={local.labels}
      on:nx-agent-tool={(e) => {
        // Quien pasa `onTool` atiende la herramienta: se marca para que no responda «no disponible».
        if (e.target === e.currentTarget && local.onTool) {
          e.preventDefault();
          local.onTool(e);
        }
      }}
      on:nx-agent-state={(e) => e.target === e.currentTarget && local.onState?.(e)}
      on:nx-agent-event={(e) => e.target === e.currentTarget && local.onEvent?.(e)}
    />
  );
}
