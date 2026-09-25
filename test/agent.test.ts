// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPatch, parseAguiEvent, type AguiEvent, type NxAgent, type NxGrid, type RunAgentInput } from "../src/index";
import { parseArgs } from "../src/components/agent/logic";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (fn: () => unknown, ms = 2000) => {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error("timeout");
    await sleep(5);
  }
};

/** Un backend AG-UI de prueba: cada corrida responde con los eventos que devuelva `script`. */
function backend(script: (input: RunAgentInput, n: number) => AguiEvent[]) {
  const inputs: RunAgentInput[] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const input = JSON.parse(init.body as string) as RunAgentInput;
    inputs.push(input);
    const evs = script(input, inputs.length);
    return new Response(evs.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(""));
  });
  vi.stubGlobal("fetch", fetch);
  return inputs;
}
const text = (t: string): AguiEvent[] => [
  { type: "TEXT_MESSAGE_START", messageId: "m", role: "assistant" },
  { type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: t },
  { type: "TEXT_MESSAGE_END", messageId: "m" },
];
const call = (id: string, name: string, args: unknown): AguiEvent[] => [
  { type: "TOOL_CALL_START", toolCallId: id, toolCallName: name },
  { type: "TOOL_CALL_ARGS", toolCallId: id, delta: JSON.stringify(args) },
  { type: "TOOL_CALL_END", toolCallId: id },
];
const run = (...evs: AguiEvent[][]): AguiEvent[] => [{ type: "RUN_STARTED", threadId: "t1", runId: "r" }, ...evs.flat(), { type: "RUN_FINISHED" }];

function mount(extra = ""): NxAgent {
  document.body.innerHTML = `${extra}<nx-agent endpoint="/agente"></nx-agent>`;
  return document.querySelector("nx-agent")!;
}

describe("lógica AG-UI", () => {
  it("parseAguiEvent valida lo que el componente lee", () => {
    expect(parseAguiEvent('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m","delta":"Hola"}')).toEqual({ type: "TEXT_MESSAGE_CONTENT", messageId: "m", delta: "Hola" });
    expect(parseAguiEvent('{"type":"TEXT_MESSAGE_CONTENT","messageId":"m"}')).toBeNull();
    expect(parseAguiEvent('{"type":"NO_EXISTE"}')).toBeNull();
    expect(parseAguiEvent("no json")).toBeNull();
    expect(parseAguiEvent('{"type":"STATE_DELTA","delta":"x"}')).toBeNull();
  });

  it("applyPatch aplica JSON Patch sin tocar el original ni el prototipo", () => {
    const doc = { a: 1, list: [1, 2], o: { x: 1 } };
    const out = applyPatch(doc, [
      { op: "replace", path: "/a", value: 2 },
      { op: "add", path: "/list/-", value: 3 },
      { op: "add", path: "/list/0", value: 0 },
      { op: "remove", path: "/o/x" },
      { op: "add", path: "/n~1m", value: true },
      { op: "copy", from: "/a", path: "/b" },
      { op: "move", from: "/b", path: "/c" },
      { op: "add", path: "/__proto__/polluted", value: 1 },
    ]);
    expect(out).toEqual({ a: 2, list: [0, 1, 2, 3], o: {}, "n/m": true, c: 2 });
    expect(doc.a).toBe(1);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("parseArgs: JSON de argumentos o {}", () => {
    expect(parseArgs('{"a":1}')).toEqual({ a: 1 });
    expect(parseArgs("[1]")).toEqual({});
    expect(parseArgs('{"a":')).toEqual({});
  });
});

describe("<nx-agent>", () => {
  it("envía un RunAgentInput y pinta el texto; el hilo lo asigna el backend", async () => {
    const inputs = backend(() => run(text("Hola, ¿en qué te ayudo?")));
    const a = mount();
    a.send("Hola");
    await until(() => !a.running);
    expect(inputs[0]).toMatchObject({ messages: [{ role: "user", content: "Hola" }], forwardedProps: {} });
    expect(inputs[0].tools.map((t) => t.name)).toEqual(["nx_confirm", "nx_ask", "nx_notify", "nx_tour", "nx_show"]);
    expect(a.threadId).toBe("t1");
    expect(a.querySelector(".nx-agent__user")!.textContent).toBe("Hola");
    expect(a.querySelector("nx-ai-answer")!.textContent).toContain("Hola, ¿en qué te ayudo?");
    expect(a.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("con `for`, ofrece herramientas de tabla, manda su contexto y la mueve", async () => {
    const inputs = backend((_i, n) => (n === 1 ? run(call("c1", "nx_grid_filter", { filters: [{ key: "estado", op: "in", values: ["pend"] }] }), call("c2", "nx_grid_select", { ids: ["1"] })) : run(text("Listo"))));
    const a = mount('<nx-grid id="g"></nx-grid>');
    const g = document.querySelector<NxGrid>("#g")!;
    g.columns = [{ key: "oc", label: "Pedido" }, { key: "estado", label: "Estado", type: "status", options: [{ value: "pend" }, { value: "apr" }] }];
    g.rows = [{ id: "1", oc: "OC-1", estado: "pend" }, { id: "2", oc: "OC-2", estado: "apr" }];
    a.setAttribute("for", "g");
    a.send("Solo los pendientes");
    await until(() => inputs.length === 2 && !a.running);
    expect(inputs[0].tools.map((t) => t.name)).toContain("nx_grid_filter");
    expect(JSON.parse(inputs[0].context[0].value)).toMatchObject({ rows: 2, filters: [] });
    expect(g.count).toBe(1);
    expect(g.selected).toEqual(["1"]);
    expect([...a.querySelectorAll(".nx-agent__did")].map((d) => d.textContent)).toEqual(["Filtré la tabla · 1 fila", "Seleccioné 1 fila"]);
    expect(a.querySelector(".nx-agent__ctx")!.textContent).toBe("Viendo: 1 fila · 1 filtro · 1 seleccionada");
    // La segunda corrida lleva el mensaje del asistente y después las respuestas de las herramientas.
    expect(inputs[1].messages.map((m) => m.role)).toEqual(["user", "assistant", "tool", "tool"]);
    expect(inputs[1].messages[2]).toMatchObject({ role: "tool", toolCallId: "c1", content: JSON.stringify({ rows: 1, filters: [{ key: "estado", op: "in", values: ["pend"] }] }) });
  });

  it("nx_confirm: la conversación espera la decisión y sigue con ella", async () => {
    const inputs = backend((i, n) => (n === 1 ? run(text("Voy a enviar 3 correos."), call("c1", "nx_confirm", { title: "Enviar 3 correos", impact: [{ label: "Destinatarios", detail: "3" }] })) : run(text(JSON.parse((i.messages.at(-1) as { content: string }).content).approved ? "Enviados" : "Nada"))));
    const a = mount();
    a.send("Pide documentos");
    await until(() => a.querySelector(".nx-agent__card"));
    await sleep(20);
    expect(inputs).toHaveLength(1);
    expect(a.running).toBe(true);
    const card = a.querySelector(".nx-agent__card")!;
    expect(card.textContent).toContain("Enviar 3 correos");
    expect(card.querySelector(".nx-agent__impact")!.textContent).toBe("Destinatarios3");
    card.querySelectorAll("nx-button")[1].querySelector("button")!.click();
    await until(() => inputs.length === 2 && !a.running);
    expect(card.querySelector(".nx-agent__verdict")!.textContent).toBe("Aprobado");
    expect(inputs[1].messages.at(-1)).toMatchObject({ role: "tool", toolCallId: "c1", content: '{"approved":true}' });
    expect([...a.querySelectorAll("nx-ai-answer")].map((x) => (x as unknown as { text: string }).text)).toEqual(["Voy a enviar 3 correos.", "Enviados"]);
  });

  it("nx_ask con opciones; nx_notify con deshacer responde {undone}", async () => {
    const inputs = backend((_i, n) => (n === 1 ? run(call("c1", "nx_ask", { question: "¿Cuáles?", options: ["Todos", "Ninguno"] })) : n === 2 ? run(call("c2", "nx_notify", { message: "Se enviarán", undo: true })) : run(text("ok"))));
    const a = mount();
    a.send("x");
    await until(() => a.querySelector(".nx-agent__option"));
    a.querySelectorAll<HTMLButtonElement>(".nx-agent__card .nx-agent__option")[0].click();
    await until(() => a.querySelector(".nx-agent__undo"));
    expect(inputs[1].messages.at(-1)).toMatchObject({ content: '{"answer":"Todos"}' });
    a.querySelector<HTMLButtonElement>(".nx-agent__undo")!.click();
    await until(() => inputs.length === 3 && !a.running);
    expect(inputs[2].messages.at(-1)).toMatchObject({ content: '{"undone":true}' });
    expect(a.querySelector(".nx-agent__notice")!.textContent).toBe("Deshecho");
  });

  it("herramientas de la app: se ofrecen y se atienden con nx-agent-tool; sin quien las atienda, error", async () => {
    const inputs = backend((_i, n) => (n === 1 ? run(call("c1", "crear_tarea", { titulo: "Llamar" }), call("c2", "otra", {})) : run(text("ok"))));
    const a = mount();
    a.tools = [
      { name: "crear_tarea", description: "Crea una tarea", parameters: { type: "object" } },
      { name: "otra", description: "Nadie la atiende", parameters: { type: "object" } },
    ];
    a.addEventListener("nx-agent-tool", (e) => {
      if (e.detail.name !== "crear_tarea") return;
      e.preventDefault();
      setTimeout(() => e.detail.respond({ id: 7, titulo: e.detail.args.titulo }), 5);
    });
    a.send("Crea una tarea");
    await until(() => inputs.length === 2 && !a.running);
    const tools = inputs[1].messages.filter((m) => m.role === "tool");
    expect(tools[0]).toMatchObject({ toolCallId: "c2", error: "Esa herramienta no está disponible aquí" });
    expect(tools[1]).toMatchObject({ toolCallId: "c1", content: '{"id":7,"titulo":"Llamar"}' });
  });

  it("estado compartido: STATE_SNAPSHOT y STATE_DELTA, y viaja en la siguiente corrida", async () => {
    const inputs = backend((_i, n) =>
      n === 1
        ? run([{ type: "STATE_SNAPSHOT", snapshot: { paso: 1, ids: ["a"] } }, { type: "STATE_DELTA", delta: [{ op: "add", path: "/ids/-", value: "b" }] }], text("ok"))
        : run(text("ok")),
    );
    const a = mount();
    const states: unknown[] = [];
    a.addEventListener("nx-agent-state", (e) => states.push(e.detail.state));
    a.send("uno");
    await until(() => !a.running);
    expect(a.state).toEqual({ paso: 1, ids: ["a", "b"] });
    expect(states).toHaveLength(2);
    a.send("dos");
    await until(() => inputs.length === 2 && !a.running);
    expect(inputs[1].state).toEqual({ paso: 1, ids: ["a", "b"] });
  });

  it("herramientas del backend se ven como pasos y su resultado va al historial", async () => {
    const inputs = backend((_i, n) =>
      n === 1
        ? run([{ type: "TOOL_CALL_START", toolCallId: "b1", toolCallName: "buscar", metadata: { label: "Buscando en el directorio" } }, { type: "TOOL_CALL_END", toolCallId: "b1" }, { type: "TOOL_CALL_RESULT", toolCallId: "b1", content: '{"n":3}' } as AguiEvent], call("c1", "nx_notify", { message: "Hecho" }))
        : run(text("ok")),
    );
    const a = mount();
    a.send("x");
    await until(() => inputs.length === 2 && !a.running);
    expect(a.querySelector(".nx-ai__trace")!.textContent).toContain("Buscando en el directorio");
    expect(inputs[1].messages.map((m) => `${m.role}:${"toolCallId" in m ? m.toolCallId : ""}`)).toEqual(["user:", "assistant:", "tool:b1", "tool:c1"]);
  });

  it("RUN_ERROR se muestra; el texto del backend va como texto", async () => {
    backend(() => run(text("<img src=x onerror=alert(1)>"), [{ type: "RUN_ERROR", message: "El modelo no respondió" }]));
    const a = mount();
    a.send("x");
    await until(() => !a.running);
    expect(a.querySelector("img")).toBeNull();
    expect(a.textContent).toContain("El modelo no respondió");
  });

  it("detener y conversación nueva", async () => {
    backend(() => run(call("c1", "nx_confirm", { title: "¿Seguro?" })));
    const a = mount();
    a.suggestions = ["Sugerencia"];
    expect(a.querySelector(".nx-agent__empty")!.textContent).toContain("Sugerencia");
    a.send("x");
    await until(() => a.querySelector(".nx-agent__card"));
    const before = a.threadId;
    a.stop();
    expect(a.running).toBe(false);
    a.reset();
    expect(a.threadId).not.toBe(before);
    expect(a.messages).toEqual([]);
    expect(a.querySelector(".nx-agent__thread")!.children).toHaveLength(0);
  });
});
