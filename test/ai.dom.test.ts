// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import { AI_LABELS, type NxAiAnswer } from "../src/index";

const frame = () => new Promise((r) => setTimeout(r, 30));
afterEach(() => vi.unstubAllGlobals());

function mount(attrs = ""): NxAiAnswer {
  document.body.innerHTML = `<nx-ai-answer ${attrs}></nx-ai-answer>`;
  return document.querySelector("nx-ai-answer")!;
}

describe("<nx-ai-answer>", () => {
  it("en reposo: barra de pregunta y sugerencias; nada más", () => {
    const el = mount();
    el.suggestions = ["¿Qué proveedores se retrasaron?"];
    expect(el.querySelector<HTMLInputElement>(".nx-ai__input")!.placeholder).toBe(AI_LABELS.placeholder);
    expect(el.querySelector(".nx-ai__chip")!.textContent).toBe("¿Qué proveedores se retrasaron?");
    expect(el.querySelector<HTMLElement>(".nx-ai__body")!.hidden).toBe(true);
    expect(el.dataset.state).toBe("idle");
  });

  it("un paso es el mismo nodo durante todo el streaming (su animación de entrada no se reinicia)", async () => {
    const el = mount();
    el.begin("q");
    el.push({ type: "step", id: "s1", label: "Consultando", status: "run" });
    await frame();
    const li = el.querySelector(".nx-ai__step");
    for (let i = 0; i < 5; i++) {
      el.push({ type: "text", delta: `palabra${i} ` });
      await frame();
    }
    expect(el.querySelector(".nx-ai__step")).toBe(li);
  });

  it("pasos en vivo, esqueleto hasta el primer texto, y streaming con cursor", async () => {
    const el = mount();
    el.begin("¿Por qué subió el costo?");
    el.push({ type: "step", id: "s1", label: "Consultando costos", status: "run" });
    await frame();
    expect(el.querySelector(".nx-ai__step--run")!.textContent).toContain("Consultando costos");
    expect(el.querySelector<HTMLElement>(".nx-ai__skeleton")!.hidden).toBe(false);
    el.push({ type: "step", id: "s1", status: "done", detail: "1.248 filas" });
    el.push({ type: "text", delta: "El costo subió **11,4 %**" });
    await frame();
    expect(el.state).toBe("streaming");
    expect(el.querySelector<HTMLElement>(".nx-ai__skeleton")!.hidden).toBe(true);
    expect(el.querySelector(".nx-ai__answer strong")!.textContent).toBe("11,4 %");
    expect(el.querySelector(".nx-ai__cursor")).not.toBeNull();
    expect(el.querySelector(".nx-ai__answer")!.getAttribute("aria-busy")).toBe("true");
  });

  it("al terminar: los pasos se pliegan en un resumen, citas numeradas y fuentes enlazadas", async () => {
    const el = mount("feedback");
    const done: string[] = [];
    el.addEventListener("nx-ai-done", (e) => done.push(`${e.detail.status}|${e.detail.text}`));
    el.begin("q");
    el.push({ type: "step", id: "s1", label: "Consultando", status: "run" });
    el.push({ type: "source", id: "oc", title: "OC-2291", href: "/compras/oc/2291" });
    el.push({ type: "text", delta: "Aceros del Caribe[^oc] se retrasó." });
    el.push({ type: "note", label: "cifras verificadas", tone: "success" });
    el.end();
    expect(el.querySelector<HTMLElement>(".nx-ai__trace")!.hidden).toBe(true);
    const summary = el.querySelector(".nx-ai__summary")!;
    expect(summary.textContent).toContain(`${AI_LABELS.thought} 1 ${AI_LABELS.steps}`);
    expect(summary.textContent).toContain(`1 ${AI_LABELS.sources}`);
    expect(summary.querySelector(".nx-ai__note--success")!.textContent).toBe("cifras verificadas");
    (summary as HTMLElement).click();
    expect(el.querySelector<HTMLElement>(".nx-ai__trace")!.hidden).toBe(false);
    expect(el.querySelector(".nx-ai__step--done")).not.toBeNull();
    expect(el.querySelector(".nx-ai__cite")!.textContent).toBe("1");
    expect(el.querySelector<HTMLAnchorElement>("a.nx-ai__source")!.getAttribute("href")).toBe("/compras/oc/2291");
    expect(el.querySelector(".nx-ai__cursor")).toBeNull();
    expect(done).toEqual(["done|Aceros del Caribe se retrasó."]);
    expect(el.querySelectorAll(".nx-ai__vote button")).toHaveLength(2);
  });

  it("acciones: href es un enlace; id emite nx-ai-action con sus datos", () => {
    const el = mount();
    const seen: unknown[] = [];
    el.addEventListener("nx-ai-action", (e) => seen.push(e.detail));
    el.begin("q");
    el.push({ type: "action", label: "Ver órdenes", href: "/compras/oc" });
    el.push({ type: "action", label: "Redactar reclamo", id: "reclamo", data: { proveedor: 12 } });
    el.push({ type: "action", label: "Malo", href: "javascript:alert(1)", id: "x" });
    el.end();
    expect(el.querySelector<HTMLAnchorElement>("a.nx-ai__action")!.getAttribute("href")).toBe("/compras/oc");
    el.querySelector<HTMLButtonElement>('button[data-action="1"]')!.click();
    expect(seen).toEqual([{ id: "reclamo", label: "Redactar reclamo", data: { proveedor: 12 } }]);
    // El href javascript: se descarta: queda como botón de acción, nunca como enlace.
    expect([...el.querySelectorAll("a.nx-ai__action")]).toHaveLength(1);
  });

  it("feedback emite el voto y lo marca", () => {
    const el = mount("feedback");
    const votes: string[] = [];
    el.addEventListener("nx-ai-feedback", (e) => votes.push(e.detail.value));
    el.begin("q");
    el.push({ type: "text", delta: "ok" });
    el.end();
    el.querySelector<HTMLButtonElement>('[data-vote="down"]')!.click();
    expect(votes).toEqual(["down"]);
    expect(el.querySelector('[data-vote="down"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("un error del protocolo termina con el mensaje; los datos nunca son HTML", async () => {
    const el = mount();
    el.begin("q");
    el.push({ type: "text", delta: "<img src=x onerror=alert(1)>" });
    el.push({ type: "error", message: "sin cupo" });
    expect(el.state).toBe("error");
    expect(el.querySelector(".nx-ai__error")!.textContent).toBe(`${AI_LABELS.error}: sin cupo`);
    expect(el.querySelector("img")).toBeNull();
  });

  it("ask(): POST con {question, context}, lee NDJSON partido en trozos, y stop() detiene", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('{"type":"step","id":"a","label":"Pensando","status":"run"}\n{"type":"te'));
        c.enqueue(enc.encode('xt","delta":"Hola"}\n{"type":"done"}\n'));
        c.close();
      },
    });
    const fetchMock = vi.fn(async () => new Response(body));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/ai/preguntar"');
    el.context = { registro: 7 };
    const done = new Promise<CustomEvent>((r) => el.addEventListener("nx-ai-done", (e) => r(e), { once: true }));
    await el.ask("¿Qué pasó?");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/ai/preguntar");
    expect(JSON.parse(init.body as string)).toEqual({ question: "¿Qué pasó?", context: { registro: 7 } });
    expect((await done).detail).toMatchObject({ status: "done", text: "Hola" });

    // stop(): lo recibido se queda y el estado es "stopped".
    vi.stubGlobal("fetch", vi.fn(async (_u: string, i: RequestInit) => new Promise<Response>((_, rej) => i.signal?.addEventListener("abort", () => rej(new Error("abort"))))));
    void el.ask("otra");
    el.push({ type: "text", delta: "parcial" });
    el.stop();
    expect(el.state).toBe("stopped");
    expect(el.text).toBe("parcial");
  });

  it("render BDUI crea el componente con endpoint y sugerencias", () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const [el] = render({ component: "AIAnswer", props: { endpoint: "/ai", suggestions: ["a", "b"], feedback: true } }, host) as NxAiAnswer[];
    expect(el.tagName).toBe("NX-AI-ANSWER");
    expect(el.endpoint).toBe("/ai");
    expect(el.querySelectorAll(".nx-ai__chip")).toHaveLength(2);
  });
});
