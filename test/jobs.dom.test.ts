// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador.
// El servidor es un `fetch` falso (puesto antes de montar); el stream, un `ReadableStream` NDJSON o
// SSE que la prueba alimenta, y que se corta cuando el componente aborta. `BroadcastChannel` se
// quita (cada elemento es la única pestaña) salvo en las pruebas de varias pestañas, con uno falso.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/jobs/index";
import type { Job, JobsErrorDetail, NxJobs } from "../src/components/jobs/index";

beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    fire(this, "closed");
  };
});

// ---------------------------------------------------------------- servidor falso

type Call = { method: string; path: string; url: URL; headers: Record<string, string>; body: unknown; signal?: AbortSignal };
type Handler = (c: Call) => Response | Promise<Response>;
let calls: Call[] = [];
let routes: Record<string, Handler> = {};
const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const of = (key: string) => calls.filter((c) => `${c.method} ${c.path}` === key);

/** Un stream abierto: la prueba empuja líneas; se corta si el componente aborta. */
type Live = { push(o: unknown): void; raw(s: string): void; end(): void; closed: boolean; call: Call };
let streams: Live[] = [];
function live(c: Call, type = "application/x-ndjson"): Response {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const s: Live = {
    push: (o) => s.raw(`${JSON.stringify(o)}\n`),
    raw: (t) => !s.closed && ctrl.enqueue(enc.encode(t)),
    end: () => {
      if (s.closed) return;
      s.closed = true;
      ctrl.close();
    },
    closed: false,
    call: c,
  };
  const body = new ReadableStream<Uint8Array>({ start: (x) => void (ctrl = x), cancel: () => void (s.closed = true) });
  c.signal?.addEventListener("abort", () => {
    if (s.closed) return;
    s.closed = true;
    try {
      ctrl.error(new DOMException("Aborted", "AbortError"));
    } catch {
      /* ya cerrado */
    }
  });
  streams.push(s);
  return new Response(body, { headers: { "Content-Type": type } });
}

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const CIERRE: Job = { id: "j1", type: "cierre-mes", title: "Cierre de septiembre", status: "running", stage: "Guardando", done: 4200, total: 10000, startedAt: ago(3), by: "Diego Llinás" };
const IMPORT: Job = { id: "j2", type: "importar", title: "Importar 10.000 clientes", status: "done", startedAt: ago(30), finishedAt: ago(20), result: { errors: 12, errorsHref: "/errores/j2", download: { url: "/archivos/j2.csv", name: "errores.csv" }, href: "javascript:alert(1)" } };

beforeEach(() => {
  calls = [];
  streams = [];
  routes = { "GET /api/trabajos": () => reply([]) };
  localStorage.clear();
  vi.stubGlobal("BroadcastChannel", undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const url = new URL(String(input), location.href);
      const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>));
      const c: Call = { method: (init.method ?? "GET").toUpperCase(), path: url.pathname, url, headers, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined, signal: init.signal ?? undefined };
      calls.push(c);
      if (c.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const h = routes[`${c.method} ${c.path}`];
      return h ? h(c) : reply({ message: "no existe" }, 404);
    }),
  );
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mount(attrs = 'endpoint="/api/trabajos"'): NxJobs {
  document.body.insertAdjacentHTML("beforeend", `<nx-jobs ${attrs.includes("locale=") ? "" : 'locale="es-CO"'} ${attrs}></nx-jobs>`);
  return document.body.lastElementChild as NxJobs;
}
const pill = (el: NxJobs) => el.querySelector<HTMLButtonElement>(".nx-jobs__pill")!;
const pop = (el: NxJobs) => el.querySelector<HTMLElement>(".nx-jobs__pop")!;
const live$ = (el: NxJobs) => el.querySelector(".nx-jobs__vh")!.textContent!.trim();
const btn = (el: NxJobs, name: RegExp) => [...el.querySelectorAll<HTMLElement>("button, a")].find((b) => name.test(b.getAttribute("aria-label") ?? b.textContent ?? ""));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
/** Vacía las promesas pendientes con los relojes falsos. */
const settle = async (n = 20) => {
  for (let i = 0; i < n; i++) await vi.advanceTimersByTimeAsync(0);
};
const events = (el: NxJobs) => {
  const t = { change: [] as Job[][], done: [] as Job[], errors: [] as JobsErrorDetail[], open: [] as boolean[] };
  el.addEventListener("nx-jobs-change", (e) => t.change.push(e.detail.jobs));
  el.addEventListener("nx-jobs-done", (e) => t.done.push(e.detail.job));
  el.addEventListener("nx-jobs-error", (e) => t.errors.push(e.detail));
  el.addEventListener("nx-open-change", (e) => t.open.push((e as CustomEvent<{ open: boolean }>).detail.open));
  return t;
};

// ---------------------------------------------------------------- pruebas

describe("<nx-jobs>: carga y píldora", () => {
  it("al conectar pide los activos y recientes, y la píldora dice cuántos y cuánto van", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE, IMPORT]);
    const el = mount();
    const t = events(el);
    await vi.waitFor(() => expect(el.dataset.state).toBe("running"));
    expect(of("GET /api/trabajos")[0].url.searchParams.get("active")).toBe("1");
    expect(pill(el).textContent).toBe("1 trabajo en curso");
    expect(pill(el).getAttribute("aria-label")).toBe("1 trabajo en curso, 42%");
    expect(pill(el).hidden).toBe(false);
    expect(pill(el).getAttribute("aria-haspopup")).toBe("dialog");
    expect(el.querySelector<HTMLElement>(".nx-jobs__ring")!.style.getPropertyValue("--p")).toBe("42%");
    expect(el.jobs.map((j) => j.id)).toEqual(["j1", "j2"]);
    expect(el.active.map((j) => j.id)).toEqual(["j1"]);
    await vi.waitFor(() => expect(t.change.at(-1)?.map((j) => j.id)).toEqual(["j1", "j2"]));
    expect(JSON.parse(localStorage.getItem("nx-jobs:/api/trabajos")!)).toEqual({ a: ["j1"], d: [] });
    // Sin total: el anillo gira.
    routes["GET /api/trabajos"] = () => reply([{ ...CIERRE, total: undefined }]);
    const el2 = mount();
    await vi.waitFor(() => expect(el2.hasAttribute("data-ind")).toBe(true));
    expect(pill(el2).getAttribute("aria-label")).toBe("1 trabajo en curso");
  });

  it("sin trabajos no se ve; con `always`, un ícono tenue con nombre", async () => {
    const el = mount();
    await vi.waitFor(() => expect(of("GET /api/trabajos")).toHaveLength(1));
    await frame();
    expect(el.dataset.state).toBe("idle");
    expect(pill(el).hidden).toBe(true);
    el.always = true;
    await frame();
    expect(pill(el).hidden).toBe(false);
    expect(pill(el).getAttribute("aria-label")).toBe("Trabajos");
  });

  it("si la carga falla, avisa `nx-jobs-error` con el mensaje del servidor", async () => {
    routes["GET /api/trabajos"] = () => reply({ message: "Sesión vencida" }, 401);
    const el = mount();
    const t = events(el);
    await vi.waitFor(() => expect(t.errors).toHaveLength(1));
    expect(t.errors[0]).toMatchObject({ action: "load", message: "Sesión vencida", status: 401 });
  });

  it("propiedades puestas antes de registrar se respetan; atributos JSON inválidos no rompen", async () => {
    routes["GET /api/otro"] = () => reply([CIERRE]);
    const el = document.createElement("nx-jobs") as NxJobs;
    Object.defineProperty(el, "endpoint", { value: "/api/otro", writable: true, configurable: true, enumerable: true });
    Object.defineProperty(el, "labels", { value: { runningOne: "{n} job running" }, writable: true, configurable: true, enumerable: true });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    el.setAttribute("labels", "{roto");
    document.body.append(el);
    expect(el.getAttribute("endpoint")).toBe("/api/otro");
    await vi.waitFor(() => expect(pill(el).textContent).toBe("1 job running"));
    expect(warn).toHaveBeenCalled();
  });

  it("un endpoint de otro origen no se pide", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mount('endpoint="https://otro.example/api"');
    await frame();
    expect(calls).toHaveLength(0);
  });
});

describe("<nx-jobs>: panel", () => {
  it("cada trabajo con etapa, barra real, tiempo restante, quién y cuándo; recientes plegados", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE, IMPORT]);
    const el = mount();
    const t = events(el);
    await vi.waitFor(() => expect(el.active).toHaveLength(1));
    await el.show();
    expect(el.open).toBe(true);
    expect(t.open).toEqual([true]);
    expect(pill(el).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.tagName).toBe("H2");
    const p = pop(el);
    expect(p.getAttribute("role")).toBe("dialog");
    expect(p.querySelector("h2")!.textContent).toBe("Trabajos");
    const bar = p.querySelector<HTMLElement>("[role=progressbar]")!;
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
    expect(bar.getAttribute("aria-label")).toBe("Cierre de septiembre");
    // Desde que empezó (hace 3 min) van 4.200: faltan unos 4 minutos.
    expect(bar.getAttribute("aria-valuetext")).toBe("4.200 de 10.000, faltan unos 4 minutos");
    const row = p.querySelector(".nx-jobs__job")!;
    expect(row.querySelector(".nx-jobs__stage")!.textContent).toBe("Guardando · 4.200 de 10.000 · faltan ~4 min");
    expect(row.querySelector(".nx-jobs__pct")!.textContent).toBe("42%");
    expect(row.querySelector(".nx-jobs__meta")!.textContent).toMatch(/^Inició .+ · por Diego Llinás$/);
    const rec = p.querySelector("details")!;
    expect(rec.open).toBe(false);
    expect(rec.querySelector("summary")!.textContent).toBe("Recientes (1)");
    const done = rec.querySelector(".nx-jobs__job")!;
    expect(done.querySelector(".nx-jobs__stage")!.textContent).toBe("Terminado · 12 filas con error");
    const dl = btn(el, /^Descargar/) as HTMLAnchorElement;
    expect(dl.getAttribute("href")).toBe("/archivos/j2.csv");
    expect(dl.getAttribute("download")).toBe("errores.csv");
    expect(btn(el, /^Ver filas con error/)!.getAttribute("href")).toBe("/errores/j2");
    expect(btn(el, /^Reintentar lo que falló/)).toBeTruthy();
    // El `javascript:` no se pinta.
    expect(btn(el, /^Ir al registro/)).toBeUndefined();
    el.hide();
    expect(el.open).toBe(false);
    expect(t.open).toEqual([true, false]);
    expect(document.activeElement).toBe(pill(el));
  });

  it("cancelar pide confirmación en línea (el foco en «No»); Escape la deshace y después cierra", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["POST /api/trabajos/j1/cancel"] = () => reply({ id: "j1", status: "canceled" });
    const el = mount();
    const t = events(el);
    await vi.waitFor(() => expect(el.active).toHaveLength(1));
    await el.show();
    btn(el, /^Cancelar · /)!.click();
    expect(pop(el).querySelector(".nx-jobs__ask")!.textContent).toBe("¿Cancelar «Cierre de septiembre»? Lo ya guardado queda.");
    expect(document.activeElement).toBe(btn(el, /^No · /));
    pop(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(pop(el).querySelector(".nx-jobs__ask")).toBeNull();
    expect(document.activeElement).toBe(btn(el, /^Cancelar · /));
    expect(el.open).toBe(true);
    btn(el, /^Cancelar · /)!.click();
    btn(el, /^Sí, cancelar/)!.click();
    await vi.waitFor(() => expect(el.jobs[0].status).toBe("canceled"));
    expect(of("POST /api/trabajos/j1/cancel")).toHaveLength(1);
    expect(t.done.map((j) => j.status)).toEqual(["canceled"]);
    expect(live$(el)).toBe("Se canceló: Cierre de septiembre");
    await frame();
    pop(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el.open).toBe(false);
  });

  it("la fila no se rehace con cada evento: solo cambia su avance", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/eventos"] = (c) => live(c);
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    await vi.waitFor(() => expect(streams).toHaveLength(1));
    await el.show();
    const row = pop(el).querySelector(".nx-jobs__job");
    for (let i = 1; i <= 50; i++) streams[0].push({ id: "j1", done: 4200 + i * 10 });
    await vi.waitFor(() => expect(el.jobs[0].done).toBe(4700));
    await frame();
    expect(pop(el).querySelector(".nx-jobs__job")).toBe(row);
    expect(row!.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow")).toBe("47");
    // Los porcentajes no se anuncian.
    expect(live$(el)).toBe("");
    el.remove();
  });
});

describe("<nx-jobs>: stream", () => {
  it("abre una sola conexión, aplica los eventos y al terminar avisa y la cierra", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/eventos"] = (c) => live(c);
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    const t = events(el);
    await vi.waitFor(() => expect(streams).toHaveLength(1));
    expect(streams[0].call.headers.Accept).toMatch(/text\/event-stream/);
    streams[0].push({ id: "j1", status: "running", stage: "Validando", done: 5000, seq: 11 });
    await vi.waitFor(() => expect(el.jobs[0].done).toBe(5000));
    // Repetido y atrasado: no cambia nada.
    streams[0].push({ id: "j1", done: 4800, seq: 10 });
    streams[0].push({ id: "j1", status: "done", done: 10000, seq: 12, result: { href: "/cierres/2026-09" } });
    await vi.waitFor(() => expect(t.done).toHaveLength(1));
    expect(t.done[0]).toMatchObject({ id: "j1", status: "done", result: { href: "/cierres/2026-09" } });
    await vi.waitFor(() => expect(streams[0].closed).toBe(true));
    await frame();
    expect(el.dataset.state).toBe("done");
    expect(pill(el).textContent).toBe("Listo: Cierre de septiembre");
    expect(live$(el)).toBe("Terminó: Cierre de septiembre");
    expect(JSON.parse(localStorage.getItem("nx-jobs:/api/trabajos")!).a).toEqual([]);
    // Un trabajo de otro dispositivo llega por el stream: se piden sus datos.
    routes["GET /api/trabajos/j7"] = () => reply({ id: "j7", title: "Exportar informe", status: "running" });
    el.track({ id: "j5", title: "Otro", status: "running" });
    await vi.waitFor(() => expect(streams).toHaveLength(2));
    streams[1].push({ id: "j7", status: "running", done: 1 });
    await vi.waitFor(() => expect(el.jobs.find((j) => j.id === "j7")?.title).toBe("Exportar informe"));
    el.remove();
  });

  it("se reconecta con espera creciente, respeta Retry-After y retoma con Last-Event-ID / ?after=", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    let busy = false;
    routes["GET /api/trabajos/eventos"] = (c) => (busy ? reply(null, 503, { "Retry-After": "5" }) : live(c, "text/event-stream"));
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    const t = events(el);
    await settle();
    const n = () => of("GET /api/trabajos/eventos").length;
    expect(n()).toBe(1);
    expect(streams[0].call.url.searchParams.has("after")).toBe(false);
    // SSE con `id:`: ese número es el punto desde donde retomar.
    streams[0].raw('id: 41\ndata: {"id":"j1","done":6000}\n\n');
    await settle();
    expect(el.jobs[0].done).toBe(6000);
    streams[0].end();
    await settle();
    await vi.advanceTimersByTimeAsync(999);
    expect(n()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(n()).toBe(2);
    const second = of("GET /api/trabajos/eventos")[1];
    expect(second.headers["Last-Event-ID"]).toBe("41");
    expect(second.url.searchParams.get("after")).toBe("41");
    // Se cae otra vez y el servidor pide 5 s.
    busy = true;
    streams[1].end();
    await settle();
    await vi.advanceTimersByTimeAsync(2000);
    expect(n()).toBe(3);
    expect(t.errors.at(-1)).toMatchObject({ action: "stream", status: 503 });
    await vi.advanceTimersByTimeAsync(4999);
    expect(n()).toBe(3);
    await vi.advanceTimersByTimeAsync(1);
    expect(n()).toBe(4);
    el.remove();
  });

  it("un 4xx del stream no se reintenta: se sigue con el sondeo", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/eventos"] = () => reply(null, 404);
    routes["GET /api/trabajos/j1"] = () => reply({ ...CIERRE, done: 4300 });
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    await settle();
    await vi.advanceTimersByTimeAsync(3000);
    expect(of("GET /api/trabajos/j1")).toHaveLength(1);
    expect(of("GET /api/trabajos/eventos")).toHaveLength(1);
    expect(el.jobs[0].done).toBe(4300);
    el.remove();
  });

  it("nada abierto sin trabajos en curso, ni después de desconectar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    routes["GET /api/trabajos"] = () => reply([IMPORT]);
    routes["GET /api/trabajos/eventos"] = (c) => live(c);
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    await settle();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.map((c) => c.path)).toEqual(["/api/trabajos"]);
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    const el2 = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    await settle();
    expect(streams).toHaveLength(1);
    el2.remove();
    await settle();
    expect(streams[0].closed).toBe(true);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(of("GET /api/trabajos/eventos")).toHaveLength(1);
    el.remove();
  });
});

describe("<nx-jobs>: sondeo sin stream", () => {
  it("cada `poll` s mientras algo cambie, más espaciado si nada cambia, 30 s en segundo plano", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    let done = 4200;
    routes["GET /api/trabajos/j1"] = () => reply({ ...CIERRE, done });
    const el = mount();
    await settle();
    const n = () => of("GET /api/trabajos/j1").length;
    done = 4500;
    await vi.advanceTimersByTimeAsync(3000);
    expect(n()).toBe(1);
    expect(el.jobs[0].done).toBe(4500);
    // Cambió: otra vez en 3 s. Después nada cambia: 3 s, luego 4,5 s.
    await vi.advanceTimersByTimeAsync(3000);
    expect(n()).toBe(2);
    await vi.advanceTimersByTimeAsync(4499);
    expect(n()).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(n()).toBe(3);
    // En segundo plano: la siguiente, a los 30 s.
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    await vi.advanceTimersByTimeAsync(6750);
    expect(n()).toBe(4);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(n()).toBe(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(n()).toBe(5);
    // Vuelve la pestaña: consulta ya.
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    await settle();
    expect(n()).toBe(6);
    el.remove();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(n()).toBe(6);
  });

  it("con `poll` propio, y un 404 lo saca de la lista", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/j1"] = () => reply({ message: "no" }, 404);
    const el = mount('endpoint="/api/trabajos" poll="10"');
    await settle();
    await vi.advanceTimersByTimeAsync(9999);
    expect(of("GET /api/trabajos/j1")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(el.jobs).toEqual([]);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(of("GET /api/trabajos/j1")).toHaveLength(1);
    el.remove();
  });
});

describe("<nx-jobs>: lanzar, seguir, cancelar, reintentar, quitar", () => {
  it("start(): POST con {type, title, params}, lo sigue y lo guarda para después de recargar", async () => {
    routes["POST /api/trabajos"] = (c) => reply({ id: "n1", status: "queued", title: (c.body as { title: string }).title }, 201);
    const el = mount();
    await vi.waitFor(() => expect(of("GET /api/trabajos")).toHaveLength(1));
    const job = await el.start({ type: "cierre-mes", title: "Cierre de septiembre", params: { mes: "2026-09" } });
    expect(job).toMatchObject({ id: "n1", status: "queued", title: "Cierre de septiembre", type: "cierre-mes" });
    expect(of("POST /api/trabajos")[0].body).toEqual({ type: "cierre-mes", title: "Cierre de septiembre", params: { mes: "2026-09" } });
    expect(of("POST /api/trabajos")[0].headers["Content-Type"]).toBe("application/json");
    expect(el.active.map((j) => j.id)).toEqual(["n1"]);
    expect(JSON.parse(localStorage.getItem("nx-jobs:/api/trabajos")!).a).toEqual(["n1"]);
    // Recargar: el servidor no lo lista, pero el id guardado se pide.
    el.remove();
    routes["GET /api/trabajos/n1"] = () => reply({ id: "n1", title: "Cierre de septiembre", status: "running", done: 3, total: 10 });
    const again = mount();
    await vi.waitFor(() => expect(again.active[0]).toMatchObject({ id: "n1", status: "running", done: 3 }));
    again.remove();
  });

  it("start() que falla: rechaza y avisa", async () => {
    routes["POST /api/trabajos"] = () => reply({ message: "Ya hay un cierre en curso" }, 409);
    const el = mount();
    const t = events(el);
    await expect(el.start({ type: "cierre-mes", title: "Cierre" })).rejects.toThrow("Ya hay un cierre en curso");
    expect(t.errors[0]).toMatchObject({ action: "start", status: 409 });
  });

  it("track(id) pide el trabajo; track(job) lo toma tal cual", async () => {
    routes["GET /api/trabajos/x9"] = () => reply({ id: "x9", title: "Recalcular costos", status: "running" });
    const el = mount();
    el.track("x9");
    await vi.waitFor(() => expect(el.jobs[0]?.title).toBe("Recalcular costos"));
    el.track({ id: "x10", title: "Exportar", status: "queued" });
    expect(el.active.map((j) => j.id)).toContain("x10");
    expect(of("GET /api/trabajos/x10")).toHaveLength(0);
    el.remove();
  });

  it("reintentar un fallido lo devuelve a la cola; quitar lo saca y no vuelve al recargar", async () => {
    const FAIL: Job = { id: "f1", title: "Generar 500 facturas electrónicas", status: "failed", done: 316, total: 500, finishedAt: ago(1), result: { message: "La factura 317 no se pudo firmar" } };
    routes["GET /api/trabajos"] = () => reply([FAIL, IMPORT]);
    routes["POST /api/trabajos/f1/retry"] = () => reply({ id: "f1", status: "queued" });
    const el = mount();
    const t = events(el);
    await vi.waitFor(() => expect(el.jobs).toHaveLength(2));
    await el.show();
    expect(pop(el).querySelector(".nx-jobs__msg")!.textContent).toBe("La factura 317 no se pudo firmar");
    btn(el, /^Reintentar · Generar/)!.click();
    await vi.waitFor(() => expect(el.active.map((j) => j.id)).toEqual(["f1"]));
    expect(el.active[0].result).toBeUndefined();
    expect(of("POST /api/trabajos/f1/retry")).toHaveLength(1);
    btn(el, /^Quitar de la lista · Importar/)!.click();
    expect(el.jobs.map((j) => j.id)).toEqual(["f1"]);
    expect(el.dismiss("f1")).toBe(false);
    expect(JSON.parse(localStorage.getItem("nx-jobs:/api/trabajos")!).d).toEqual(["j2"]);
    expect(t.errors).toEqual([]);
    el.remove();
    const again = mount();
    await vi.waitFor(() => expect(of("GET /api/trabajos")).toHaveLength(2));
    await frame();
    expect(again.jobs.map((j) => j.id)).toEqual(["f1"]);
    again.remove();
  });

  it("un fallido deja la píldora en rojo hasta abrir el panel", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/eventos"] = (c) => live(c);
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    await vi.waitFor(() => expect(streams).toHaveLength(1));
    streams[0].push({ id: "j1", status: "failed", result: { message: "Falta la tasa de cambio" } });
    await vi.waitFor(() => expect(el.dataset.state).toBe("failed"));
    expect(pill(el).textContent).toBe("Error: Cierre de septiembre");
    expect(live$(el)).toBe("Falló: Cierre de septiembre");
    await el.show();
    el.hide();
    await frame();
    expect(el.dataset.state).not.toBe("failed");
  });
});

describe("<nx-jobs>: memoria y avisos", () => {
  it("con localStorage roto sigue funcionando", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    const el = mount();
    await vi.waitFor(() => expect(el.active).toHaveLength(1));
    el.track({ id: "n2", title: "Otro", status: "queued" });
    expect(el.active).toHaveLength(2);
    el.remove();
  });

  it("guardado dañado: como vacío", async () => {
    localStorage.setItem("nx-jobs:/api/trabajos", "{roto");
    const el = mount();
    await vi.waitFor(() => expect(of("GET /api/trabajos")).toHaveLength(1));
    expect(el.jobs).toEqual([]);
  });

  it("al terminar con la pestaña oculta: aviso en la página y notificación del sistema (con `notify`)", async () => {
    const shown: { title: string; opts: NotificationOptions }[] = [];
    const ask = vi.fn(async () => "granted" as NotificationPermission);
    class FakeNotification {
      static permission: NotificationPermission = "default";
      static requestPermission = ask;
      constructor(title: string, opts: NotificationOptions) {
        shown.push({ title, opts });
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/eventos"] = (c) => live(c);
    routes["POST /api/trabajos"] = () => reply({ id: "n1", status: "queued" });
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos" notify');
    await vi.waitFor(() => expect(streams).toHaveLength(1));
    // Al cargar no se pide permiso; al lanzar, sí.
    expect(ask).not.toHaveBeenCalled();
    await el.start({ type: "x", title: "Exportar" });
    expect(ask).toHaveBeenCalledTimes(1);
    FakeNotification.permission = "granted";
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    streams[0].push({ id: "j1", status: "done", result: { message: "Cerrado sin novedades" } });
    await vi.waitFor(() => expect(shown).toHaveLength(1));
    expect(shown[0]).toEqual({ title: "Terminó: Cierre de septiembre", opts: { body: "Cerrado sin novedades", tag: "nx-jobs:j1" } });
    await vi.waitFor(() => expect(document.querySelector("nx-toaster .nx-toast__msg")?.textContent).toBe("Terminó: Cierre de septiembre"));
    expect(document.querySelector("nx-toaster .nx-toast")!.getAttribute("data-tone")).toBe("success");
    el.remove();
  });

  it("sin `notify` no hay notificación, y con el panel abierto no hay aviso", async () => {
    const shown: string[] = [];
    vi.stubGlobal(
      "Notification",
      class {
        static permission = "granted";
        constructor(t: string) {
          shown.push(t);
        }
      },
    );
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/eventos"] = (c) => live(c);
    const el = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    await vi.waitFor(() => expect(streams).toHaveLength(1));
    await el.show();
    streams[0].push({ id: "j1", status: "done" });
    await vi.waitFor(() => expect(el.active).toHaveLength(0));
    await frame();
    expect(shown).toEqual([]);
    expect(document.querySelector("nx-toaster .nx-toast")).toBeNull();
    el.remove();
  });
});

describe("<nx-jobs>: varias pestañas", () => {
  /** Un `BroadcastChannel` en memoria: lo que una instancia manda les llega a las demás del mismo nombre. */
  class FakeChannel {
    static all = new Set<FakeChannel>();
    onmessage: ((e: { data: unknown }) => void) | null = null;
    constructor(public name: string) {
      FakeChannel.all.add(this);
    }
    postMessage(data: unknown) {
      const copy = JSON.parse(JSON.stringify(data));
      for (const c of FakeChannel.all) if (c !== this && c.name === this.name) queueMicrotask(() => c.onmessage?.({ data: copy }));
    }
    close() {
      FakeChannel.all.delete(this);
    }
  }
  beforeEach(() => {
    FakeChannel.all.clear();
    vi.stubGlobal("BroadcastChannel", FakeChannel);
  });

  const two = async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    routes["GET /api/trabajos/eventos"] = (c) => live(c);
    const a = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    const b = mount('endpoint="/api/trabajos" stream="/api/trabajos/eventos"');
    return [a, b] as const;
  };

  it("sin candados: una sola pestaña conecta y reparte los eventos; al cerrarse, otra toma su lugar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const [a, b] = await two();
    await settle();
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(streams).toHaveLength(1);
    streams[0].push({ id: "j1", done: 7000, seq: 3 });
    await settle();
    expect(a.jobs[0].done).toBe(7000);
    expect(b.jobs[0].done).toBe(7000);
    // Se cierra la que conectaba: la otra se proclama y conecta, desde el último evento.
    const leader = streams[0].closed ? b : a;
    const other = leader === a ? b : a;
    leader.remove();
    await settle();
    await vi.advanceTimersByTimeAsync(400);
    await settle();
    expect(streams).toHaveLength(2);
    expect(streams[1].call.headers["Last-Event-ID"]).toBe("3");
    streams[1].push({ id: "j1", status: "done", seq: 4 });
    await settle();
    expect(other.active).toHaveLength(0);
    other.remove();
  });

  it("con `navigator.locks`: la que tiene el candado conecta; un trabajo lanzado en la otra también se sigue", async () => {
    const queue: { fn: () => Promise<void>; signal: AbortSignal; grant: () => void }[] = [];
    let held = false;
    const next = () => {
      const w = queue.find((q) => !q.signal.aborted);
      if (!w || held) return;
      queue.splice(queue.indexOf(w), 1);
      held = true;
      void w.fn().then(() => ((held = false), next()));
    };
    const locks = {
      request: (_n: string, o: { signal: AbortSignal }, fn: () => Promise<void>) =>
        new Promise((res, rej) => {
          o.signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
          queue.push({ fn, signal: o.signal, grant: () => res(undefined) });
          next();
        }),
    };
    Object.defineProperty(navigator, "locks", { configurable: true, value: locks });
    routes["POST /api/trabajos"] = () => reply({ id: "n1", title: "Exportar", status: "queued" });
    try {
      const [a, b] = await two();
      await vi.waitFor(() => expect(streams).toHaveLength(1));
      await b.start({ type: "x", title: "Exportar" });
      await vi.waitFor(() => expect(a.active.map((j) => j.id).sort()).toEqual(["j1", "n1"]));
      streams[0].push({ id: "n1", status: "running", done: 1 });
      await vi.waitFor(() => expect(b.jobs.find((j) => j.id === "n1")?.status).toBe("running"));
      expect(streams).toHaveLength(1);
      a.remove();
      await vi.waitFor(() => expect(streams).toHaveLength(2));
      expect(streams[0].closed).toBe(true);
      b.remove();
    } finally {
      delete (navigator as unknown as { locks?: unknown }).locks;
    }
  });
});

describe("<nx-jobs>: textos y formato", () => {
  it("labels (atributo JSON) y locale", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    const el = mount(`endpoint="/api/trabajos" locale="en-US" labels='{"runningOne":"{n} job running","of":"{done} of {total}","leftLong":"about {t} left","heading":"Jobs","nope":"x","cancel":5}'`);
    await vi.waitFor(() => expect(pill(el).textContent).toBe("1 job running"));
    expect(pill(el).getAttribute("aria-label")).toBe("1 job running, 42%");
    await el.show();
    expect(pop(el).querySelector("h2")!.textContent).toBe("Jobs");
    expect(pop(el).querySelector("[role=progressbar]")!.getAttribute("aria-valuetext")).toBe("4,200 of 10,000, about 4 minutes left");
    expect(btn(el, /^Cancelar · /)).toBeTruthy();
    el.labels = { cancel: "Cancel" };
    await frame();
    expect(btn(el, /^Cancel · /)).toBeTruthy();
    expect(el.labels.heading).toBe("Trabajos");
  });

  it("disabled: la píldora no abre", async () => {
    routes["GET /api/trabajos"] = () => reply([CIERRE]);
    const el = mount('endpoint="/api/trabajos" disabled');
    await vi.waitFor(() => expect(pill(el).disabled).toBe(true));
    await el.show();
    expect(el.open).toBe(false);
  });
});

describe("<nx-jobs>: la demo de la galería", () => {
  it("los tres trabajos de mentira: importar con errores, facturas que fallan y se reintentan, recargar y cancelar el cierre", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    const { readFileSync } = await import("node:fs");
    const { demoFetch } = await import("../gallery/demo-api");
    const { mountJobsDemo } = await import("../gallery/demo-jobs");
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => demoFetch(input, init) ?? Promise.reject(new Error(`fuera de la demo: ${String(input)}`)));
    document.body.innerHTML = readFileSync("gallery/pages/jobs.html", "utf8");
    const root = document.createElement("main");
    root.append(document.querySelector<HTMLTemplateElement>("#page-jobs")!.content.cloneNode(true));
    document.body.replaceChildren(root);
    mountJobsDemo(root);
    const el = () => root.querySelector<NxJobs>("nx-jobs")!;
    const click = (sel: string) => root.querySelector<HTMLButtonElement>(sel)!.click();
    const until = async (fn: () => boolean, ms = 60_000) => {
      for (let t = 0; t < ms && !fn(); t += 250) await vi.advanceTimersByTimeAsync(250);
      expect(fn()).toBe(true);
    };
    await settle();
    click('[data-job="importar-clientes"]');
    click('[data-job="cierre-mes"]');
    click('[data-job="facturas"]');
    await until(() => el().active.length === 3);
    // El importe termina con 12 filas con error; las facturas fallan en la 317.
    await until(() => el().jobs.some((j) => j.type === "importar-clientes" && j.status === "done"));
    expect(el().jobs.find((j) => j.type === "importar-clientes")!.result).toMatchObject({ errors: 12, download: { name: "clientes-con-error.csv" } });
    await until(() => el().jobs.some((j) => j.type === "facturas" && j.status === "failed"), 120_000);
    const fact = el().jobs.find((j) => j.type === "facturas")!;
    expect(fact.done).toBe(316);
    // Recargar: el elemento nuevo retoma el cierre (sigue en curso) y los terminados.
    click("#jobs-reload");
    await vi.advanceTimersByTimeAsync(700);
    await until(() => el().jobs.length === 3);
    expect(el().active.map((j) => j.type)).toEqual(["cierre-mes"]);
    // Reintentar las facturas: siguen desde la 317 y terminan.
    void el().retry(fact.id);
    await until(() => el().jobs.find((j) => j.id === fact.id)!.status === "done", 120_000);
    // Cancelar el cierre.
    const cierre = el().jobs.find((j) => j.type === "cierre-mes")!;
    expect(cierre.status).toBe("running");
    void el().cancel(cierre.id);
    await until(() => el().active.length === 0);
    expect(el().jobs.find((j) => j.type === "cierre-mes")!.status).toBe("canceled");
    expect(root.querySelector("#jobs-log")!.children.length).toBeGreaterThan(3);
    el().remove();
  }, 60_000);
});
