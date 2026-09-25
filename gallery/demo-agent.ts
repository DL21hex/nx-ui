/**
 * Un agente de mentira que habla AG-UI, para la galería. No llama a ningún modelo: sigue un guion
 * según el pedido y según las respuestas de las herramientas del navegador (aprobar, preguntar,
 * deshacer), y guarda en el estado compartido (`STATE_SNAPSHOT`) en qué va. Un backend real
 * haría lo mismo con un modelo y sus herramientas. No es parte de la librería.
 */
import { applyFilters } from "../src/components/grid/logic";
import type { GridFilter, GridRow } from "../src/components/grid/types";
import type { AguiMessage, RunAgentInput } from "../src/components/agent/types";
import { TODAY } from "./demo-hr";

type Ev = Record<string, unknown>;
type Stage = { scenario?: "docs" | "renew"; ids?: string[]; count?: number; choice?: string };

const addDays = (s: string, n: number) => new Date(Date.parse(s) + n * 86_400_000).toISOString().slice(0, 10);
let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}-${++seq}`;

/** Texto en trozos de una a tres palabras, como un modelo. */
function* text(t: string): Generator<Ev> {
  const messageId = nid("msg");
  yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" };
  const words = t.split(/(?<=\s)/);
  for (let i = 0; i < words.length; ) {
    const n = 1 + Math.floor(Math.random() * 3);
    yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: words.slice(i, i + n).join("") };
    i += n;
  }
  yield { type: "TEXT_MESSAGE_END", messageId };
}

function* tool(name: string, args: unknown, label?: string): Generator<Ev> {
  const toolCallId = nid("call");
  yield { type: "TOOL_CALL_START", toolCallId, toolCallName: name, ...(label ? { metadata: { label } } : {}) };
  const json = JSON.stringify(args);
  for (let i = 0; i < json.length; i += 40) yield { type: "TOOL_CALL_ARGS", toolCallId, delta: json.slice(i, i + 40) };
  yield { type: "TOOL_CALL_END", toolCallId };
}

/** Una herramienta del backend (se ve como un paso): llamada, espera y resultado. */
function* backendTool(name: string, label: string, result: unknown): Generator<Ev> {
  const toolCallId = nid("call");
  yield { type: "TOOL_CALL_START", toolCallId, toolCallName: name, metadata: { label } };
  yield { type: "TOOL_CALL_END", toolCallId };
  yield { type: "PAUSE", ms: 700 };
  yield { type: "TOOL_CALL_RESULT", messageId: nid("msg"), toolCallId, content: JSON.stringify(result) };
}

/** Las respuestas de las herramientas del navegador a la última llamada del agente. */
function toolResults(messages: AguiMessage[]): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  const lastAsst = [...messages].reverse().find((m) => m.role === "assistant" && m.toolCalls?.length) as Extract<AguiMessage, { role: "assistant" }> | undefined;
  for (const m of messages) {
    if (m.role !== "tool") continue;
    const call = lastAsst?.toolCalls?.find((c) => c.id === m.toolCallId);
    if (!call) continue;
    try {
      out[call.function.name] = JSON.parse(m.content);
    } catch {
      out[call.function.name] = {};
    }
  }
  return out;
}

export function* agentRun(input: RunAgentInput, people: GridRow[]): Generator<Ev> {
  const threadId = input.threadId;
  const runId = input.runId;
  const stage = (input.state && typeof input.state === "object" ? input.state : {}) as Stage;
  const last = input.messages[input.messages.length - 1];
  yield { type: "RUN_STARTED", threadId, runId };

  // ---------------------------------------------------------------- un pedido nuevo
  if (last?.role === "user") {
    const q = last.content.toLowerCase();
    if (/c[oó]mo|mu[eé]strame|ens[eé][nñ]ame/.test(q)) {
      // «¿Cómo…?»: un recorrido sobre la pantalla (nx_tour). Un backend real elegiría los pasos
      // con el modelo, a partir de los [data-tour] que el agente manda en el contexto.
      yield* text("Te lo muestro en la pantalla, paso a paso:");
      yield* tool("nx_tour", {
        steps: [
          { target: '[data-tour="pendientes"]', title: "1 · Empieza por lo pendiente", text: "Cada tarjeta es un filtro listo: «Documentos faltantes» te deja solo a quienes les falta algo." },
          { target: "#th-grid .nx-grid__ask", title: "2 · O dilo con tus palabras", text: "Escribe «en período de prueba con documentos faltantes» y la tabla se filtra sola." },
          { target: "#th-grid .nx-grid__head", title: "3 · Selecciona a las personas", text: "La casilla de la cabecera selecciona todo lo filtrado; también puedes elegir una por una." },
          { target: '[data-tour="lote"]', title: "4 · Pide los documentos", text: "Con personas seleccionadas aparece esta barra: «Pedir documentos» les escribe a todas." },
          { target: '[data-tour="asistente"]', title: "5 · O pídemelo a mí", text: "Escribe «pide los documentos faltantes» y lo hago yo, con tu aprobación antes de enviar." },
        ],
      });
      yield { type: "RUN_FINISHED", threadId, runId };
      return;
    }
    if (/document/.test(q)) {
      yield { type: "STEP_STARTED", stepName: "Entendiendo el pedido" };
      yield { type: "PAUSE", ms: 500 };
      yield { type: "STEP_FINISHED", stepName: "Entendiendo el pedido" };
      const filters: GridFilter[] = [{ key: "docs", op: "range", min: 1 }];
      if (/prueba/.test(q)) filters.unshift({ key: "estado", op: "in", values: ["prueba"] });
      const sede = ["Barranquilla", "Cartagena", "Bogotá"].find((s) => q.includes(s.toLowerCase()));
      if (sede) filters.unshift({ key: "sede", op: "in", values: [sede] });
      const found = applyFilters(people, filters);
      yield* backendTool("buscar_empleados", "Buscando en el directorio", { count: found.length });
      if (!found.length) {
        yield* text("No encontré personas con documentos faltantes con ese criterio.");
        yield { type: "RUN_FINISHED", threadId, runId };
        return;
      }
      const ids = found.map((p) => String(p.id));
      const faltan = found.reduce((a, p) => a + Number(p.docs), 0);
      yield { type: "STATE_SNAPSHOT", snapshot: { scenario: "docs", ids, count: found.length } };
      yield* text(`Encontré **${found.length} personas**${/prueba/.test(q) ? " en período de prueba" : ""}${sede ? ` en ${sede}` : ""} con documentos pendientes (${faltan} en total). Te las dejo filtradas y seleccionadas en la tabla.`);
      yield* tool("nx_grid_filter", { filters });
      yield* tool("nx_grid_select", { ids });
      yield* tool("nx_confirm", {
        title: `Enviar ${found.length} correos pidiendo documentos`,
        detail: "Cada persona recibe la lista de lo que le falta y un enlace para subirlo.",
        impact: [
          { label: "Destinatarios", detail: `${found.length} personas` },
          { label: "Documentos pedidos", detail: `${faltan}` },
          { label: "Plazo para entregarlos", detail: "5 días hábiles", tone: "warning" },
        ],
        confirmLabel: "Enviar correos",
      });
      yield { type: "RUN_FINISHED", threadId, runId };
      return;
    }
    if (/venc|renov|contrato/.test(q)) {
      const filters: GridFilter[] = [{ key: "fin", op: "range", min: TODAY, max: addDays(TODAY, 30) }];
      const found = applyFilters(people, filters);
      yield* backendTool("consultar_contratos", "Consultando contratos", { count: found.length });
      const fijo = found.filter((p) => p.contrato === "fijo").length;
      yield { type: "STATE_SNAPSHOT", snapshot: { scenario: "renew", ids: found.map((p) => String(p.id)), count: found.length } };
      yield* text(`En los próximos 30 días vencen **${found.length} contratos**: ${fijo} a término fijo y ${found.length - fijo} de obra o labor y aprendizaje. Los dejé filtrados en la tabla.`);
      yield* tool("nx_grid_filter", { filters });
      yield* tool("nx_ask", { question: "¿Qué hago con ellos?", options: [`Preparar los ${found.length} otrosíes de renovación`, `Solo los ${fijo} de término fijo`, "Nada por ahora"] });
      yield { type: "RUN_FINISHED", threadId, runId };
      return;
    }
    yield* text("Puedo trabajar sobre el directorio que tienes abierto. Prueba con «Pide los documentos faltantes a las personas en período de prueba», «¿Qué contratos vencen este mes?» o «¿Cómo pido documentos a varias personas?».");
    yield { type: "RUN_FINISHED", threadId, runId };
    return;
  }

  // ---------------------------------------------------------------- las respuestas de la persona
  const r = toolResults(input.messages);
  const n = stage.count ?? 0;

  if ("nx_ask" in r) {
    const answer = String(r.nx_ask.answer ?? "");
    if (/nada/i.test(answer)) {
      yield* text("De acuerdo, no preparo nada. Si cambias de opinión, pídemelo de nuevo.");
    } else {
      const k = /término fijo/i.test(answer) ? Number(/\d+/.exec(answer)?.[0] ?? n) : n;
      yield { type: "STATE_DELTA", delta: [{ op: "replace", path: "/count", value: k }, { op: "add", path: "/choice", value: answer }] };
      yield* tool("nx_confirm", {
        title: `Preparar ${k} otrosíes de renovación por un año`,
        impact: [
          { label: "Otrosíes para firma", detail: `${k}` },
          { label: "Nuevo fin de contrato", detail: "un año después del actual" },
          { label: "Salarios", detail: "sin cambio" },
        ],
        confirmLabel: "Preparar otrosíes",
      });
    }
  } else if ("nx_confirm" in r) {
    if (r.nx_confirm.approved === true) {
      const what = stage.scenario === "renew" ? `Se prepararán ${n} otrosíes` : `Se enviarán ${n} correos`;
      yield* text("Listo. Lo hago en unos segundos; puedes deshacerlo mientras tanto.");
      yield* tool("nx_notify", { message: what, undo: true });
    } else {
      yield* text("Entendido, no hago nada.");
    }
  } else if ("nx_tour" in r) {
    yield* text(r.nx_tour.completed === true ? "¡Eso es todo! Si quieres, pídeme que lo haga por ti." : "Cuando quieras retomamos el recorrido.");
  } else if ("nx_notify" in r) {
    if (r.nx_notify.undone === true) {
      yield* text("Deshecho: no hice nada.");
    } else if (stage.scenario === "renew") {
      yield* backendTool("generar_otrosies", `Generando ${n} otrosíes`, { ok: true });
      yield* text(`Listo: **${n} otrosíes** quedaron en la bandeja de firma de Talento humano.`);
    } else {
      yield* backendTool("enviar_correos", `Enviando ${n} correos`, { ok: true });
      yield* text(`Enviados **${n} correos**. Te aviso cuando alguien suba sus documentos.`);
    }
  }
  yield { type: "RUN_FINISHED", threadId, runId };
}
