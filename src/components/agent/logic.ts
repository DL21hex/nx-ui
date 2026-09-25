/** Lógica pura de `<nx-agent>`: eventos AG-UI, JSON Patch y las herramientas del navegador. */
import type { AguiEvent, AguiTool, PatchOp } from "./types";

const TYPES = new Set([
  "RUN_STARTED",
  "RUN_FINISHED",
  "RUN_ERROR",
  "STEP_STARTED",
  "STEP_FINISHED",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_CHUNK",
  "TEXT_MESSAGE_END",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "TOOL_CALL_RESULT",
  "STATE_SNAPSHOT",
  "STATE_DELTA",
  "REASONING_START",
  "REASONING_END",
  "CUSTOM",
]);

/** Una línea del stream (ya sin `data:`) → evento AG-UI, o `null`. Valida lo que el componente lee. */
export function parseAguiEvent(raw: string | null): AguiEvent | null {
  if (!raw || raw === "[DONE]") return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object" || !TYPES.has(o.type as string)) return null;
  const s = (k: string) => typeof o[k] === "string";
  switch (o.type) {
    case "RUN_ERROR":
      return s("message") ? (o as AguiEvent) : null;
    case "STEP_STARTED":
    case "STEP_FINISHED":
      return s("stepName") ? (o as AguiEvent) : null;
    case "TEXT_MESSAGE_CONTENT":
    case "TOOL_CALL_ARGS":
      return s("delta") ? (o as AguiEvent) : null;
    case "TOOL_CALL_START":
      return s("toolCallId") && s("toolCallName") ? (o as AguiEvent) : null;
    case "TOOL_CALL_END":
    case "TOOL_CALL_RESULT":
      return s("toolCallId") ? (o as AguiEvent) : null;
    case "STATE_DELTA":
      return Array.isArray(o.delta) ? (o as AguiEvent) : null;
    case "CUSTOM":
      return s("name") ? (o as AguiEvent) : null;
    default:
      return o as AguiEvent;
  }
}

const unescape = (seg: string) => seg.replace(/~1/g, "/").replace(/~0/g, "~");
const BLOCKED = new Set(["__proto__", "prototype", "constructor"]);

/** Aplica JSON Patch (RFC 6902) sobre una copia; una operación inválida se salta. */
export function applyPatch<T>(doc: T, ops: readonly PatchOp[]): T {
  let root: unknown = structuredClone(doc ?? {});
  const walk = (path: string, fn: (parent: Record<string, unknown> | unknown[], key: string) => void) => {
    if (path === "") return;
    const segs = path.split("/").slice(1).map(unescape);
    if (segs.some((k) => BLOCKED.has(k))) return;
    let cur = root as Record<string, unknown>;
    for (const k of segs.slice(0, -1)) {
      if (cur === null || typeof cur !== "object") return;
      cur = cur[k] as Record<string, unknown>;
    }
    if (cur !== null && typeof cur === "object") fn(cur, segs[segs.length - 1]);
  };
  const get = (path: string): unknown => {
    let cur: unknown = root;
    for (const k of path.split("/").slice(1).map(unescape)) cur = cur && typeof cur === "object" && !BLOCKED.has(k) ? (cur as Record<string, unknown>)[k] : undefined;
    return cur;
  };
  const put = (path: string, value: unknown, insert: boolean) => {
    if (path === "") return void (root = value);
    walk(path, (p, k) => {
      if (Array.isArray(p)) {
        const i = k === "-" ? p.length : Number(k);
        if (insert) p.splice(i, 0, value);
        else p[i] = value;
      } else p[k] = value;
    });
  };
  const del = (path: string) =>
    walk(path, (p, k) => {
      if (Array.isArray(p)) p.splice(Number(k), 1);
      else delete p[k];
    });
  for (const op of ops) {
    if (!op || typeof op !== "object" || typeof op.path !== "string") continue;
    // `copy` y `move` sin `from` (o con uno que no es texto) se saltan: antes lanzaban y cortaban
    // toda la corrida del agente.
    if ((op.op === "copy" || op.op === "move") && typeof (op as { from?: unknown }).from !== "string") continue;
    try {
      if (op.op === "add") put(op.path, structuredClone(op.value), true);
      else if (op.op === "replace") put(op.path, structuredClone(op.value), false);
      else if (op.op === "remove") del(op.path);
      else if (op.op === "copy") put(op.path, structuredClone(get(op.from)), true);
      else if (op.op === "move") {
        const v = get(op.from);
        del(op.from);
        put(op.path, v, true);
      }
    } catch {
      /* un valor que no se puede clonar: la operación se salta */
    }
  }
  return root as T;
}

/** Argumentos de una llamada a herramienta (JSON acumulado por deltas); `{}` si no es un objeto. */
export function parseArgs(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

const str = { type: "string" };
const impact = {
  type: "array",
  description: "Consecuencias de la acción, una por línea",
  items: { type: "object", properties: { label: str, detail: str, tone: { type: "string", enum: ["neutral", "success", "warning", "danger"] } }, required: ["label"] },
};

/**
 * Las herramientas que ofrece el navegador. Son la «cabina» del agente: pedir aprobación, preguntar,
 * avisar con deshacer, mostrar un componente y mover la tabla que la persona está viendo. Ninguna
 * cambia datos por sí sola: eso lo hace el backend, después de que la persona aprueba.
 */
export const UI_TOOLS: AguiTool[] = [
  {
    name: "nx_confirm",
    description: "Pide aprobación a la persona antes de una acción que cambia datos, mostrando su impacto. Devuelve {approved: boolean}.",
    parameters: { type: "object", properties: { title: str, detail: str, impact, confirmLabel: str, tone: { type: "string", enum: ["primary", "danger"] } }, required: ["title"] },
  },
  {
    name: "nx_ask",
    description: "Le pregunta algo a la persona, con opciones o texto libre. Devuelve {answer: string}.",
    parameters: { type: "object", properties: { question: str, options: { type: "array", items: str }, placeholder: str }, required: ["question"] },
  },
  {
    name: "nx_notify",
    description: "Informa un resultado. Con undo=true espera unos segundos por si la persona lo deshace: haz la acción solo si devuelve {undone: false}.",
    parameters: { type: "object", properties: { message: str, tone: { type: "string", enum: ["neutral", "success", "warning", "danger"] }, undo: { type: "boolean" } }, required: ["message"] },
  },
  {
    name: "nx_tour",
    description:
      "Muestra un recorrido guiado sobre la pantalla: cada paso señala un elemento (target: selector CSS, idealmente uno de los [data-tour] del contexto) con un título y un texto. Úsalo para «muéstrame cómo…». Solo señala: no hace clic. Devuelve {completed, step}.",
    parameters: { type: "object", properties: { steps: { type: "array", items: { type: "object", properties: { target: str, title: str, text: str }, required: ["title"] } } }, required: ["steps"] },
  },
  {
    name: "nx_show",
    description: "Muestra un componente de nx-ui en la conversación: {component, props} (BDUI).",
    parameters: { type: "object", properties: { component: str, props: { type: "object" } }, required: ["component"] },
  },
];

/** Herramientas para la tabla que acompaña al agente (`for`). */
export const GRID_TOOLS: AguiTool[] = [
  {
    name: "nx_grid_filter",
    description: 'Filtra la tabla que la persona está viendo. filters: [{key, op: "in"|"notIn", values}] | [{key, op: "range", min?, max?}] | [{key, op: "contains", value}]. Devuelve {rows}.',
    parameters: { type: "object", properties: { filters: { type: "array", items: { type: "object" } } }, required: ["filters"] },
  },
  {
    name: "nx_grid_select",
    description: "Selecciona filas de la tabla por id (reemplaza la selección). Devuelve {selected}.",
    parameters: { type: "object", properties: { ids: { type: "array", items: str } }, required: ["ids"] },
  },
];

/**
 * Las props que el modelo manda a `nx_show`, sin ninguna URL: un payload del modelo (quizá guiado
 * por un texto inyectado en los datos) no puede hacer que un componente pida o envíe datos a otro
 * lado (`endpoint`, `action`, `source`, `*Endpoint`…).
 */
export function showProps(props: unknown, urlProps: ReadonlySet<string>): Record<string, unknown> {
  if (!props || typeof props !== "object" || Array.isArray(props)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props as Record<string, unknown>)) {
    if (urlProps.has(k) || /endpoint$/i.test(k)) continue;
    out[k] = v;
  }
  return out;
}

/** La lista de `show` («Trend, Grid») → nombres; `null` si no hay (todos los registrados). */
export function parseShow(v: unknown): string[] | null {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : null;
  if (!list) return null;
  return list.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
}

/** `confirm` de una herramienta, validado: `null` si no pide aprobación. */
export function toolConfirm(v: unknown): { title?: string; detail?: string; tone: "primary" | "danger" } | null {
  if (v === true) return { tone: "primary" };
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x : undefined);
  return { title: str(o.title), detail: str(o.detail), tone: o.tone === "danger" ? "danger" : "primary" };
}
