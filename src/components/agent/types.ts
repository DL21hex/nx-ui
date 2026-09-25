/**
 * `<nx-agent>`: tipos. El transporte es AG-UI (https://docs.ag-ui.com): el componente envía un
 * `RunAgentInput` por POST y lee los eventos en streaming (SSE `data:` o NDJSON).
 */

// ---------------------------------------------------------------- AG-UI (lo que usa el componente)

export interface AguiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type AguiMessage =
  | { id: string; role: "user"; content: string }
  | { id: string; role: "assistant"; content?: string; toolCalls?: AguiToolCall[] }
  | { id: string; role: "tool"; content: string; toolCallId: string; error?: string }
  | { id: string; role: "system" | "developer"; content: string };

/** Una herramienta que ofrece el navegador (JSON Schema en `parameters`). */
export interface AguiTool {
  name: string;
  description: string;
  parameters: unknown;
}

export interface AguiContext {
  description: string;
  value: string;
}

export interface RunAgentInput {
  threadId: string;
  runId: string;
  state?: unknown;
  messages: AguiMessage[];
  tools: AguiTool[];
  context: AguiContext[];
  forwardedProps: unknown;
  resume?: { interruptId: string; status: "resolved" | "cancelled"; payload?: unknown }[];
}

/** Los eventos que el componente entiende; el resto se ignora (o sale como `nx-agent-event`). */
export type AguiEvent =
  | { type: "RUN_STARTED"; threadId: string; runId: string }
  | { type: "RUN_FINISHED"; runId?: string; outcome?: { type?: string; interrupts?: { id: string; message?: string; [k: string]: unknown }[] } }
  | { type: "RUN_ERROR"; message: string }
  | { type: "STEP_STARTED" | "STEP_FINISHED"; stepName: string }
  | { type: "TEXT_MESSAGE_START"; messageId: string; role?: string }
  | { type: "TEXT_MESSAGE_CONTENT" | "TEXT_MESSAGE_CHUNK"; messageId?: string; delta?: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | { type: "TOOL_CALL_START"; toolCallId: string; toolCallName: string; parentMessageId?: string; metadata?: Record<string, unknown> }
  | { type: "TOOL_CALL_ARGS"; toolCallId: string; delta: string }
  | { type: "TOOL_CALL_END"; toolCallId: string }
  | { type: "TOOL_CALL_RESULT"; toolCallId: string; content: string }
  | { type: "STATE_SNAPSHOT"; snapshot: unknown }
  | { type: "STATE_DELTA"; delta: PatchOp[] }
  | { type: "REASONING_START" | "REASONING_END"; messageId?: string }
  | { type: "CUSTOM"; name: string; value: unknown };

/** JSON Patch (RFC 6902), las operaciones que usa `STATE_DELTA`. */
export type PatchOp =
  | { op: "add" | "replace" | "test"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "move" | "copy"; from: string; path: string };

// ---------------------------------------------------------------- el componente

export interface AgentLabels {
  heading: string;
  placeholder: string;
  send: string;
  stop: string;
  newThread: string;
  working: string;
  approve: string;
  reject: string;
  approved: string;
  rejected: string;
  answer: string;
  undo: string;
  undone: string;
  error: string;
  unavailable: string;
  context: string;
  empty: string;
  /** «Te muestro en la pantalla» (al empezar un recorrido). */
  touring: string;
  /** Textos del recorrido guiado (`nx_tour`). */
  tour: Partial<import("../tour/types").TourLabels>;
}

/** `nx-agent-tool`: una herramienta de la app. Responder con `respond(contenido, error?)`. */
export interface AgentToolDetail {
  id: string;
  name: string;
  args: Record<string, unknown>;
  respond(content: unknown, error?: string): void;
}
