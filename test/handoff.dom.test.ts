// @vitest-environment happy-dom
//
// El servidor es un `fetch` de mentira (se pone ANTES de montar): crea la sesión, abre el stream
// de eventos (un ReadableStream que la prueba alimenta línea por línea), sirve los archivos y
// recibe lo que sube el celular. Nada sale a la red.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../src/components/handoff/index";
import { HANDOFF_LABELS, type HandoffItemDetail, type NxHandoff } from "../src/components/handoff/index";
import { HANDOFF_PHONE_LABELS } from "../src/components/handoff/handoff-phone";

beforeAll(() => {
  // <nx-scan> (lado celular) abre avisos con la Popover API, que happy-dom no tiene.
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    fire(this, "closed");
  };
  if (!URL.createObjectURL) URL.createObjectURL = () => "blob:nx-test";
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {};
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => unknown, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`no se cumplió: ${check}`);
    await sleep(5);
  }
}

/** Un stream NDJSON que la prueba alimenta. Se corta con la señal de la petición, como uno real. */
function live(signal?: AbortSignal | null) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c) });
  signal?.addEventListener("abort", () => {
    try {
      ctrl.error(new DOMException("Aborted", "AbortError"));
    } catch {
      /* ya cerrado */
    }
  });
  return {
    response: new Response(body, { headers: { "Content-Type": "application/x-ndjson" } }),
    push: (o: unknown) => ctrl.enqueue(enc.encode(`${typeof o === "string" ? o : JSON.stringify(o)}\n`)),
    close: () => ctrl.close(),
  };
}

type Call = { method: string; url: URL; init: RequestInit };
type Handler = (c: Call) => Response | Promise<Response>;

/** El servidor de mentira: rutas por «MÉTODO /ruta» (sin la consulta). */
function server(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const streams: ReturnType<typeof live>[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input), location.href);
    const method = (init.method ?? "GET").toUpperCase();
    const call = { method, url, init };
    calls.push(call);
    const key = `${method} ${url.pathname}`;
    if (key.endsWith("/events") && !routes[key]) {
      const s = live(init.signal);
      streams.push(s);
      return s.response;
    }
    const h = routes[key];
    return h ? h(call) : new Response("no", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, streams, fetchMock, last: () => streams[streams.length - 1] };
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
const SESSION = { id: "s1", url: "/m/handoff?s=s1&t=tok", expiresIn: 300, token: "tok" };
const PHOTO = { kind: "file", name: "factura.jpg", type: "image/jpeg", size: 4, url: "/api/handoff/s1/files/1", id: "f1" };

function mount(attrs = 'endpoint="/api/handoff"', extra = ""): NxHandoff {
  document.body.innerHTML = `<nx-handoff ${attrs}></nx-handoff>${extra}`;
  return document.querySelector("nx-handoff")!;
}
function track(el: NxHandoff) {
  const states: string[] = [];
  const items: HandoffItemDetail[] = [];
  const errors: string[] = [];
  const done: unknown[] = [];
  el.addEventListener("nx-handoff-state", (e) => states.push(e.detail.state));
  el.addEventListener("nx-handoff-item", (e) => items.push(e.detail));
  el.addEventListener("nx-handoff-error", (e) => errors.push(e.detail.message));
  el.addEventListener("nx-handoff-done", (e) => done.push(e.detail));
  return { states, items, errors, done };
}
const $ = <T extends Element = HTMLElement>(el: Element, sel: string) => el.querySelector<T>(sel)!;
const status = (el: Element) => $(el, ".nx-ho__status").textContent;

/** Abre el panel y espera a que el stream esté escuchando. */
async function open(el: NxHandoff, srv: ReturnType<typeof server>) {
  $<HTMLButtonElement>(el, ".nx-ho__start").click();
  await until(() => srv.streams.length > 0);
}

describe("<nx-handoff> escritorio", () => {
  it("en reposo: solo el botón «Usar el celular»", () => {
    const el = mount();
    expect($(el, ".nx-ho__start").textContent).toBe(HANDOFF_LABELS.start);
    expect($(el, ".nx-ho__panel").hidden).toBe(true);
    expect(el.state).toBe("idle");
  });

  it("crea la sesión (kind, accept, multiple, context) y pinta el QR como un solo path", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount('endpoint="/api/handoff" kind="photo" accept="image/*" multiple context=\'{"doc":"OC-2291"}\'');
    const t = track(el);
    await open(el, srv);
    const post = srv.calls[0];
    expect(post.method).toBe("POST");
    expect(JSON.parse(String(post.init.body))).toEqual({ kind: "photo", accept: "image/*", multiple: true, context: { doc: "OC-2291" } });
    expect(post.init.credentials).toBe("same-origin");
    expect(t.states).toEqual(["creating", "waiting"]);
    const svg = $(el, ".nx-ho__qr svg");
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe(HANDOFF_LABELS.qr);
    expect(svg.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(svg.querySelectorAll("path")).toHaveLength(1);
    expect(svg.querySelector("path")!.getAttribute("d")).toMatch(/^M4 4h7v1h-7z/);
    // El QR lleva el enlace absoluto (el teléfono no conoce la página).
    expect($(el, ".nx-ho__qr").dataset.url).toBe(new URL("/m/handoff?s=s1&t=tok", location.href).href);
    expect($(el, ".nx-ho__panel").hidden).toBe(false);
    expect($(el, ".nx-ho__start").hidden).toBe(true);
    expect(status(el)).toBe(HANDOFF_LABELS.waiting);
    expect($(el, ".nx-ho__expires").textContent).toBe("Vence en 5:00");
    expect(srv.calls[1].url.pathname).toBe("/api/handoff/s1/events");
  });

  it("los estados avanzan: esperando → conectado (con el dispositivo) → recibiendo → listo; el resumen queda", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION), "GET /api/handoff/s1/files/1": () => new Response(new Blob(["JPEG"], { type: "image/jpeg" })) });
    const el = mount();
    const t = track(el);
    await open(el, srv);
    srv.last().push({ type: "connected", device: "iPhone de Diego" });
    await until(() => el.state === "connected");
    expect(status(el)).toBe("iPhone de Diego conectado");
    srv.last().push({ type: "progress", received: 0, total: 2 });
    await until(() => el.state === "receiving");
    expect(status(el)).toBe("Recibiendo 2 fotos…");
    srv.last().push({ type: "item", item: PHOTO });
    srv.last().push({ type: "item", item: { ...PHOTO, id: "f2", name: "factura-2.jpg" } });
    srv.last().push({ type: "done" });
    await until(() => el.state === "done");
    expect(t.states).toEqual(["creating", "waiting", "connected", "receiving", "done"]);
    expect(t.items.map((i) => i.file?.name)).toEqual(["factura.jpg", "factura-2.jpg"]);
    expect(t.done).toEqual([{ items: [PHOTO, { ...PHOTO, id: "f2", name: "factura-2.jpg" }] }]);
    expect($(el, ".nx-ho__panel").hidden).toBe(true);
    expect($(el, ".nx-ho__summary").hidden).toBe(false);
    expect($(el, ".nx-ho__summary").textContent).toContain("2 fotos desde el celular");
    expect($(el, ".nx-ho__again").textContent).toBe(HANDOFF_LABELS.again);
    // La escucha se cerró con el `done`.
    expect(srv.calls.filter((c) => c.url.pathname.endsWith("/events")).at(-1)!.init.signal!.aborted).toBe(true);
  });

  it("un archivo va a `extract(file)` del destino (como <nx-doc-capture>), ya descargado", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION), "GET /api/handoff/s1/files/1": () => new Response(new Blob(["JPEG"], { type: "image/jpeg" })) });
    const el = mount('endpoint="/api/handoff" for="factura"', '<div id="factura"></div>');
    const target = document.getElementById("factura") as HTMLElement & { extract: ReturnType<typeof vi.fn> };
    target.extract = vi.fn();
    await open(el, srv);
    srv.last().push({ type: "item", item: PHOTO });
    await until(() => target.extract.mock.calls.length === 1);
    const file = target.extract.mock.calls[0][0] as File;
    expect(file).toBeInstanceOf(File);
    expect([file.name, file.type, await file.text()]).toEqual(["factura.jpg", "image/jpeg", "JPEG"]);
    const dl = srv.calls.find((c) => c.url.pathname.endsWith("/files/1"))!;
    expect(dl.init.credentials).toBe("same-origin");
  });

  it("un archivo va a un <input type=file> (con DataTransfer), con `input` y `change`", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION), "GET /api/handoff/s1/files/1": () => new Response(new Blob(["JPEG"])) });
    const el = mount('endpoint="/api/handoff" for="adjunto"', '<input type="file" id="adjunto" multiple>');
    const input = document.getElementById("adjunto") as HTMLInputElement;
    const seen: string[] = [];
    input.addEventListener("input", () => seen.push("input"));
    input.addEventListener("change", () => seen.push("change"));
    await open(el, srv);
    srv.last().push({ type: "item", item: PHOTO });
    srv.last().push({ type: "item", item: { ...PHOTO, id: "f2", name: "b.jpg" } });
    await until(() => input.files?.length === 2);
    expect([...input.files!].map((f) => f.name)).toEqual(["factura.jpg", "b.jpg"]);
    expect(seen).toEqual(["input", "change", "input", "change"]);
  });

  it("sin DataTransfer (navegadores viejos): una FileList de mentira que el JS de la app puede leer", async () => {
    vi.stubGlobal("DataTransfer", undefined);
    const srv = server({ "POST /api/handoff": () => json(SESSION), "GET /api/handoff/s1/files/1": () => new Response(new Blob(["JPEG"])) });
    const el = mount('endpoint="/api/handoff" for="adjunto"', '<input type="file" id="adjunto">');
    const input = document.getElementById("adjunto") as HTMLInputElement;
    const change = vi.fn();
    input.addEventListener("change", change);
    await open(el, srv);
    srv.last().push({ type: "item", item: PHOTO });
    await until(() => change.mock.calls.length === 1);
    expect(input.files).toHaveLength(1);
    expect(input.files![0].name).toBe("factura.jpg");
    expect(input.files!.item(0)!.name).toBe("factura.jpg");
  });

  it("un código va a `add(code, 1, format)` (como <nx-scan>); a un campo de texto, como valor con eventos", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount('endpoint="/api/handoff" kind="scan" for="conteo"', '<div id="conteo"></div><input id="codigo">');
    const target = document.getElementById("conteo") as HTMLElement & { add: ReturnType<typeof vi.fn> };
    target.add = vi.fn();
    await open(el, srv);
    srv.last().push({ type: "item", item: { kind: "code", code: "7707123450011", format: "ean_13" } });
    srv.last().push({ type: "item", item: { kind: "code", code: "7707123450028" } });
    await until(() => target.add.mock.calls.length === 2);
    expect(target.add.mock.calls).toEqual([
      ["7707123450011", 1, "ean_13"],
      ["7707123450028", 1, ""],
    ]);
    expect(status(el)).toBe("Recibiendo 2 códigos…");

    el.for = "codigo";
    const input = document.getElementById("codigo") as HTMLInputElement;
    const change = vi.fn();
    input.addEventListener("change", change);
    srv.last().push({ type: "item", item: { kind: "code", code: "LOTE-AC-0873" } });
    await until(() => input.value === "LOTE-AC-0873");
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("una firma (`kind: data`) va a `load(data)` del destino (como <nx-signature>); el resumen dice «1 firma»", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount('endpoint="/api/handoff" kind="signature" for="firma"', '<div id="firma"></div>');
    const target = document.getElementById("firma") as HTMLElement & { load: ReturnType<typeof vi.fn> };
    target.load = vi.fn();
    await open(el, srv);
    expect(el.kind).toBe("signature");
    expect(JSON.parse(String(srv.calls[0].init.body))).toEqual({ kind: "signature" });
    const data = { svg: "<svg/>", meta: { signedAt: "2026-09-28T20:42:00.000Z" } };
    srv.last().push({ type: "item", item: { kind: "data", id: "d1", data } });
    await until(() => target.load.mock.calls.length === 1);
    expect(target.load.mock.calls[0][0]).toEqual(data);
    expect(status(el)).toBe("Recibiendo 1 firma…");
    srv.last().push({ type: "done" });
    await until(() => el.state === "done");
    expect($(el, ".nx-ho__summary").textContent).toContain("1 firma desde el celular");
  });

  it("`nx-handoff-item` cancelado: la app se encarga y no se entrega", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION), "GET /api/handoff/s1/files/1": () => new Response(new Blob(["JPEG"])) });
    const el = mount('endpoint="/api/handoff" for="factura"', '<div id="factura"></div>');
    const target = document.getElementById("factura") as HTMLElement & { extract: ReturnType<typeof vi.fn> };
    target.extract = vi.fn();
    const mine: File[] = [];
    el.addEventListener("nx-handoff-item", (e) => {
      e.preventDefault();
      if (e.detail.file) mine.push(e.detail.file);
    });
    await open(el, srv);
    srv.last().push({ type: "item", item: PHOTO });
    srv.last().push({ type: "done" });
    await until(() => el.state === "done");
    expect(mine.map((f) => f.name)).toEqual(["factura.jpg"]);
    expect(target.extract).not.toHaveBeenCalled();
  });

  it("no entrega dos veces lo mismo: `seq` repetido o `id` ya visto (un stream que se repite al reconectar)", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount('endpoint="/api/handoff" for="conteo"', '<div id="conteo"></div>');
    const target = document.getElementById("conteo") as HTMLElement & { add: ReturnType<typeof vi.fn> };
    target.add = vi.fn();
    await open(el, srv);
    const a = { type: "item", seq: 1, item: { kind: "code", code: "A" } };
    srv.last().push(a);
    srv.last().push(a);
    srv.last().push({ type: "item", item: { kind: "code", code: "B", id: "b" } });
    srv.last().push({ type: "item", item: { kind: "code", code: "B", id: "b" } });
    srv.last().push({ type: "item", seq: 2, item: { kind: "code", code: "C" } });
    await until(() => target.add.mock.calls.length >= 3);
    await sleep(20);
    expect(target.add.mock.calls.map((c) => c[0])).toEqual(["A", "B", "C"]);
  });

  it("basura en el stream no lo rompe; SSE también sirve", async () => {
    const srv = server({
      "POST /api/handoff": () => json(SESSION),
      "GET /api/handoff/s1/events": () =>
        new Response('data: no es json\n\n: ping\n\nevent: x\ndata: {"type":"connected"}\n\ndata: {"type":"item","item":{"kind":"code","code":"Z"}}\n\ndata: {"type":"done"}\n\n', { headers: { "Content-Type": "text/event-stream" } }),
    });
    const el = mount('endpoint="/api/handoff" for="c"', '<input id="c">');
    const t = track(el);
    $<HTMLButtonElement>(el, ".nx-ho__start").click();
    await until(() => el.state === "done");
    expect(t.states).toEqual(["creating", "waiting", "connected", "receiving", "done"]);
    expect((document.getElementById("c") as HTMLInputElement).value).toBe("Z");
  });

  it("sin stream (404): polling de respaldo con `after`", async () => {
    let polls = 0;
    const srv = server({
      "POST /api/handoff": () => json(SESSION),
      "GET /api/handoff/s1/events": () => new Response("no", { status: 404 }),
      "GET /api/handoff/s1": () => {
        polls++;
        return json({ events: [{ type: "connected", seq: 1 }, { type: "item", seq: 2, item: { kind: "code", code: "P" } }, { type: "done", seq: 3 }] });
      },
    });
    const el = mount('endpoint="/api/handoff" for="c"', '<input id="c">');
    $<HTMLButtonElement>(el, ".nx-ho__start").click();
    await until(() => el.state === "done");
    expect(polls).toBe(1);
    expect((document.getElementById("c") as HTMLInputElement).value).toBe("P");
    const poll = srv.calls.find((c) => c.method === "GET" && c.url.pathname === "/api/handoff/s1")!;
    expect(poll.url.search).toBe("");
  });

  it("si el stream se corta sin terminar, reconecta con espera y pide desde el último `seq`", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount();
    await open(el, srv);
    srv.last().push({ type: "connected", seq: 4 });
    await until(() => el.state === "connected");
    srv.last().close();
    await until(() => srv.streams.length === 2, 3000);
    const again = srv.calls.filter((c) => c.url.pathname.endsWith("/events"))[1];
    expect(again.url.searchParams.get("after")).toBe("4");
    expect(el.state).toBe("connected");
  });

  it("vence: la cuenta regresiva llega a cero, se corta la escucha y se ofrece «Generar otro»", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const srv = server({ "POST /api/handoff": () => json({ ...SESSION, expiresIn: 3 }) });
    const el = mount();
    await open(el, srv);
    expect($(el, ".nx-ho__expires").textContent).toBe("Vence en 0:03");
    vi.advanceTimersByTime(1000);
    expect($(el, ".nx-ho__expires").textContent).toBe("Vence en 0:02");
    vi.advanceTimersByTime(2000);
    expect(el.state).toBe("expired");
    expect(status(el)).toBe(HANDOFF_LABELS.expired);
    expect($(el, ".nx-ho__qr").hidden).toBe(true);
    expect(srv.calls[1].init.signal!.aborted).toBe(true);
    const redo = $<HTMLButtonElement>(el, ".nx-ho__actions .nx-ho__btn:not([hidden])");
    expect(redo.textContent).toBe(HANDOFF_LABELS.restart);
  });

  it("el servidor avisa `expired`: mismo final", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount();
    await open(el, srv);
    srv.last().push({ type: "expired" });
    await until(() => el.state === "expired");
  });

  it("«Cancelar» hace DELETE sin esperar, corta el stream y vuelve al botón", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION), "DELETE /api/handoff/s1": () => new Response(null, { status: 204 }) });
    const el = mount();
    await open(el, srv);
    const stream = srv.calls[1];
    $<HTMLButtonElement>(el, ".nx-ho__btn--quiet").click();
    expect(el.state).toBe("idle");
    expect(stream.init.signal!.aborted).toBe(true);
    const del = srv.calls.find((c) => c.method === "DELETE")!;
    expect(del.url.pathname).toBe("/api/handoff/s1");
    expect(del.init.keepalive).toBe(true);
    expect($(el, ".nx-ho__panel").hidden).toBe(true);
    expect($(el, ".nx-ho__start").hidden).toBe(false);
  });

  it("Escape dentro del panel cancela", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount();
    await open(el, srv);
    $(el, ".nx-ho__panel").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(el.state).toBe("idle");
    expect(srv.calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("sacar el elemento de la página corta todo: stream, reloj y descargas", async () => {
    let release!: () => void;
    const srv = server({
      "POST /api/handoff": () => json(SESSION),
      "GET /api/handoff/s1/files/1": (c) =>
        new Promise<Response>((resolve, reject) => {
          release = () => resolve(new Response(new Blob(["x"])));
          c.init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    });
    const el = mount('endpoint="/api/handoff" for="factura"', '<div id="factura"></div>');
    const extract = vi.fn();
    Object.assign(document.getElementById("factura")!, { extract });
    await open(el, srv);
    srv.last().push({ type: "item", item: PHOTO });
    await until(() => srv.calls.some((c) => c.url.pathname.endsWith("/files/1")));
    const setInt = vi.spyOn(globalThis, "setInterval");
    el.remove();
    for (const c of srv.calls.slice(1)) expect(c.init.signal!.aborted, c.url.pathname).toBe(true);
    release();
    const n = srv.calls.length;
    await sleep(50);
    expect(srv.calls.length).toBe(n);
    expect(extract).not.toHaveBeenCalled();
    expect(setInt).not.toHaveBeenCalled();
  });

  it("si vuelve a la página con la sesión viva (se movió en el DOM), retoma la escucha", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount();
    await open(el, srv);
    srv.last().push({ type: "connected", seq: 1 });
    await until(() => el.state === "connected");
    el.remove();
    document.body.append(el);
    await until(() => srv.streams.length === 2);
    expect(srv.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(srv.calls.at(-1)!.url.searchParams.get("after")).toBe("1");
    expect(el.state).toBe("connected");
    expect($(el, ".nx-ho__panel").hidden).toBe(false);
  });

  it("un enlace del celular de otro origen se rechaza: sin QR y con `nx-handoff-error`", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server({ "POST /api/handoff": () => json({ ...SESSION, url: "https://evil.example/m?s=s1&t=tok" }) });
    const el = mount();
    const t = track(el);
    $<HTMLButtonElement>(el, ".nx-ho__start").click();
    await until(() => el.state === "error");
    expect($(el, ".nx-ho__qr svg")).toBeNull();
    expect($(el, ".nx-ho__qr").hidden).toBe(true);
    expect(t.errors[0]).toMatch(/otro origen/);
    expect(status(el)).toBe(HANDOFF_LABELS.error);
  });

  it("un archivo de otro origen no se descarga", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount('endpoint="/api/handoff" for="factura"', '<div id="factura"></div>');
    const extract = vi.fn();
    Object.assign(document.getElementById("factura")!, { extract });
    const t = track(el);
    await open(el, srv);
    srv.last().push({ type: "item", item: { ...PHOTO, url: "https://evil.example/x.jpg" } });
    await until(() => t.errors.length === 1);
    expect(srv.calls.some((c) => c.url.hostname === "evil.example")).toBe(false);
    expect(extract).not.toHaveBeenCalled();
  });

  it("un `error` del servidor se muestra tal cual y se emite", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount();
    const t = track(el);
    await open(el, srv);
    srv.last().push({ type: "error", message: "La OC-2291 ya se cerró" });
    await until(() => el.state === "error");
    expect(status(el)).toBe("La OC-2291 ya se cerró");
    expect(t.errors).toEqual(["La OC-2291 ya se cerró"]);
  });

  it("«Recibir más» reusa la sesión vigente (sin otro POST)", async () => {
    const srv = server({ "POST /api/handoff": () => json(SESSION) });
    const el = mount();
    await open(el, srv);
    srv.last().push({ type: "done", seq: 1 });
    await until(() => el.state === "done");
    $<HTMLButtonElement>(el, ".nx-ho__again").click();
    await until(() => srv.streams.length === 2);
    expect(el.state).toBe("waiting");
    expect(srv.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(srv.calls.at(-1)!.url.searchParams.get("after")).toBe("1");
  });

  it("`disabled` y un endpoint que no es http(s) no hacen nada peligroso", async () => {
    const srv = server({});
    const el = mount('endpoint="javascript:alert(1)"');
    await el.start();
    expect(el.state).toBe("error");
    expect(srv.calls).toHaveLength(0);
    const off = mount('endpoint="/api/handoff" disabled');
    expect($<HTMLButtonElement>(off, ".nx-ho__start").disabled).toBe(true);
    await off.start();
    expect(off.state).toBe("idle");
  });

  it("los textos se cambian con `labels` (JSON o propiedad)", () => {
    const el = mount(`endpoint="/api/handoff" labels='{"start":"Tomar con el teléfono","nada":1}'`);
    expect($(el, ".nx-ho__start").textContent).toBe("Tomar con el teléfono");
    el.labels = { cancel: "Cerrar" };
    expect($(el, ".nx-ho__btn--quiet").textContent).toBe("Cerrar");
  });
});

// ---------------------------------------------------------------- celular

function phone(extra = 'session="s1" token="tok"'): NxHandoff {
  document.body.innerHTML = `<nx-handoff side="phone" endpoint="/api/handoff" ${extra}></nx-handoff>`;
  return document.querySelector("nx-handoff")!;
}
function pickFiles(el: Element, files: File[]) {
  const input = [...el.querySelectorAll<HTMLInputElement>('input[type="file"]')].at(-1)!;
  Object.defineProperty(input, "files", { configurable: true, get: () => files });
  input.dispatchEvent(new Event("change"));
}

/** Una firma con el dedo sobre el canvas de un <nx-signature>: una onda a lo ancho. */
function sign(pad: Element) {
  const c = pad.querySelector("canvas")!;
  const ev = (type: string, i: number) =>
    c.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", clientX: 20 + i * 5, clientY: 60 + Math.sin(i / 3) * 20, bubbles: true, cancelable: true }));
  ev("pointerdown", 0);
  for (let i = 1; i < 50; i++) ev("pointermove", i);
  ev("pointerup", 50);
}

describe("<nx-handoff side=phone>", () => {
  it("sesión vencida o ya usada: un mensaje claro y nada más", async () => {
    const srv = server({ "GET /api/handoff/s1": () => new Response("", { status: 410 }) });
    const el = phone();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.invalid));
    expect(srv.calls[0].url.searchParams.get("t")).toBe("tok");
    expect(el.querySelectorAll("button")).toHaveLength(0);
  });

  it("lee la sesión y el token de la página (`?s=…&t=…`) si no vienen como atributos", async () => {
    history.replaceState(null, "", "/m/handoff?s=s9&t=xyz");
    const srv = server({ "GET /api/handoff/s9": () => json({ kind: "file", title: "Soporte de pago" }) });
    const el = phone("");
    await until(() => el.querySelector(".nx-ho__title"));
    expect(srv.calls[0].url.pathname + srv.calls[0].url.search).toBe("/api/handoff/s9?t=xyz");
    expect($(el, ".nx-ho__title").textContent).toBe("Soporte de pago");
    expect($(el, ".nx-ho__pick").textContent).toBe(HANDOFF_PHONE_LABELS.chooseFile);
    history.replaceState(null, "", "/");
  });

  it("fotos: «Tomar foto» con cámara trasera, miniaturas, quitar una, y subida una por una con avance y reintento", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const progress: string[] = [];
    let tries = 0;
    let el!: NxHandoff;
    const srv = server({
      "GET /api/handoff/s1": () => json({ kind: "photo", multiple: true, title: "Factura OC-2291", hint: "Que se lean el NIT y el total" }),
      "POST /api/handoff/s1/items": (c) => {
        progress.push(el.querySelector(".nx-ho__msg")!.textContent!);
        const f = (c.init.body as FormData).get("file") as File;
        // El primer intento de la primera foto falla (el 4G se cayó): se reintenta solo.
        if (f.name === "a.jpg" && tries++ === 0) return new Response("", { status: 503 });
        return json({ item: { kind: "file", name: f.name, type: f.type, size: f.size, url: `/f/${f.name}` } });
      },
      "POST /api/handoff/s1/done": () => new Response(null, { status: 204 }),
    });
    el = phone();
    const done: unknown[] = [];
    el.addEventListener("nx-handoff-done", (e) => done.push(e.detail));
    await until(() => el.querySelector(".nx-ho__pick"));
    expect($(el, ".nx-ho__title").textContent).toBe("Factura OC-2291");
    expect($(el, ".nx-ho__hint").textContent).toBe("Que se lean el NIT y el total");
    const [cam, gal] = el.querySelectorAll<HTMLInputElement>('input[type="file"]');
    expect([cam.getAttribute("capture"), cam.accept, gal.hasAttribute("capture"), gal.multiple]).toEqual(["environment", "image/*", false, true]);
    expect([...el.querySelectorAll(".nx-ho__pick button")].map((b) => b.textContent)).toEqual([HANDOFF_PHONE_LABELS.takePhoto, HANDOFF_PHONE_LABELS.gallery]);

    const send = [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === HANDOFF_PHONE_LABELS.send)!;
    expect(send.disabled).toBe(true);
    pickFiles(el, [new File(["a"], "a.jpg", { type: "image/jpeg" }), new File(["x"], "x.jpg", { type: "image/jpeg" }), new File(["b"], "b.jpg", { type: "image/jpeg" })]);
    expect(el.querySelectorAll(".nx-ho__shot")).toHaveLength(3);
    // Quitar la de en medio.
    $<HTMLButtonElement>(el.querySelectorAll(".nx-ho__shot")[1], ".nx-ho__x").click();
    expect([...el.querySelectorAll(".nx-ho__shot-name")].map((n) => n.firstChild!.textContent)).toEqual(["a.jpg", "b.jpg"]);
    expect(send.disabled).toBe(false);
    send.click();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.sent), 3000);
    expect(progress).toEqual(["Enviando 1 de 2…", "Enviando 1 de 2…", "Enviando 2 de 2…"]);
    const posts = srv.calls.filter((c) => c.method === "POST").map((c) => c.url.pathname + c.url.search);
    expect(posts).toEqual(["/api/handoff/s1/items?t=tok", "/api/handoff/s1/items?t=tok", "/api/handoff/s1/items?t=tok", "/api/handoff/s1/done?t=tok"]);
    expect(done).toEqual([{ items: [expect.objectContaining({ name: "a.jpg", url: "/f/a.jpg" }), expect.objectContaining({ name: "b.jpg", url: "/f/b.jpg" })] }]);
  });

  it("si una foto no sube tras los reintentos: queda marcada, se avisa y se puede reintentar", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let ok = false;
    server({
      "GET /api/handoff/s1": () => json({ kind: "photo" }),
      "POST /api/handoff/s1/items": () => (ok ? json({}) : new Response("", { status: 413 })),
      "POST /api/handoff/s1/done": () => json({}),
    });
    const el = phone();
    const errors: string[] = [];
    el.addEventListener("nx-handoff-error", (e) => errors.push(e.detail.message));
    await until(() => el.querySelector(".nx-ho__pick"));
    pickFiles(el, [new File(["a"], "grande.jpg", { type: "image/jpeg" })]);
    const send = [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === HANDOFF_PHONE_LABELS.send)!;
    send.click();
    await until(() => errors.length === 1);
    expect(errors[0]).toBe("No se pudo enviar grande.jpg");
    expect($(el, ".nx-ho__shot").dataset.status).toBe("failed");
    expect(send.disabled).toBe(false);
    ok = true;
    send.click();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.sent));
  });

  it("escanear: carga <nx-scan> aparte, manda cada código al leerlo y «Terminar» cierra", async () => {
    const bodies: unknown[] = [];
    const srv = server({
      "GET /api/handoff/s1": () => json({ kind: "scan", title: "Recepción OC-2291" }),
      "POST /api/handoff/s1/items": (c) => {
        bodies.push(JSON.parse(String(c.init.body)));
        return json({});
      },
      "POST /api/handoff/s1/done": () => json({}),
    });
    const el = phone();
    await until(() => el.querySelector("nx-scan"), 5000);
    const reader = el.querySelector("nx-scan")!;
    expect(reader.getAttribute("mode")).toBe("count");
    reader.add("7707123450011", 1, "ean_13");
    reader.add("7707123450028", 1, "ean_13");
    await until(() => bodies.length === 2);
    expect(bodies).toEqual([
      { kind: "code", code: "7707123450011", format: "ean_13" },
      { kind: "code", code: "7707123450028", format: "ean_13" },
    ]);
    await until(() => el.textContent!.includes("Enviados: 2 códigos"));
    const items = srv.calls.find((c) => c.url.pathname.endsWith("/items"))!;
    expect((items.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === HANDOFF_PHONE_LABELS.finish)!.click();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.sent));
    expect(srv.calls.at(-1)!.url.pathname).toBe("/api/handoff/s1/done");
  });

  it("firmar: carga <nx-signature> aparte (nombre y cédula si se piden), manda {kind: data, data: {svg, meta}} y cierra la tanda", async () => {
    const bodies: { kind: string; data: { svg: string; meta: Record<string, unknown> } }[] = [];
    const srv = server({
      "GET /api/handoff/s1": () => json({ kind: "signature", title: "Recibido REM-3391", askName: true, askId: true }),
      "POST /api/handoff/s1/items": (c) => {
        bodies.push(JSON.parse(String(c.init.body)));
        return json({ item: { kind: "data", id: "d1", data: bodies[0].data } });
      },
      "POST /api/handoff/s1/done": () => json({}),
    });
    const el = phone();
    const done: unknown[] = [];
    el.addEventListener("nx-handoff-done", (e) => done.push(e.detail));
    await until(() => el.querySelector("nx-signature"), 5000);
    const pad = el.querySelector("nx-signature")!;
    expect($(el, ".nx-ho__title").textContent).toBe("Recibido REM-3391");
    expect([pad.required, pad.askName, pad.askId]).toEqual([true, true, true]);
    expect(Number(pad.getAttribute("height"))).toBeGreaterThanOrEqual(140);
    // Sin Fullscreen API (o en un computador) no se ofrece la pantalla completa.
    const full = [...el.querySelectorAll<HTMLButtonElement>(".nx-ho__btn")].find((b) => b.textContent === HANDOFF_PHONE_LABELS.fullscreen)!;
    expect(full.hidden).toBe(true);
    const [name, id] = pad.querySelectorAll("input");
    name.value = "Luz Mery Ortiz";
    id.value = "32.456.789";
    sign(pad);
    $<HTMLButtonElement>(pad, '[data-a="confirm"]').click();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.sent));
    expect(bodies).toHaveLength(1);
    expect(bodies[0].kind).toBe("data");
    expect(bodies[0].data.svg).toMatch(/^<svg[^>]*><g fill="#1a2238"><path d="M/);
    expect(bodies[0].data.meta).toMatchObject({ name: "Luz Mery Ortiz", id: "32.456.789", typed: false, strokes: 1, device: "touch" });
    const items = srv.calls.find((c) => c.url.pathname.endsWith("/items"))!;
    expect((items.init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(srv.calls.at(-1)!.url.pathname).toBe("/api/handoff/s1/done");
    expect(done).toEqual([{ items: [{ kind: "data", id: "d1", data: bodies[0].data }] }]);
  });

  it("firmar sin red: lo dice y «Reintentar» manda la misma firma (sin volver a firmar)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    let ok = false;
    let posts = 0;
    server({
      "GET /api/handoff/s1": () => json({ kind: "signature" }),
      "POST /api/handoff/s1/items": () => (posts++, ok ? json({}) : new Response("", { status: 400 })),
      "POST /api/handoff/s1/done": () => json({}),
    });
    const el = phone();
    await until(() => el.querySelector("nx-signature"), 5000);
    const pad = el.querySelector("nx-signature")!;
    sign(pad);
    $<HTMLButtonElement>(pad, '[data-a="confirm"]').click();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.offline));
    ok = true;
    // La firma no se pierde: «Reintentar» la manda de nuevo sin volver a firmar.
    [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === HANDOFF_LABELS.retry)!.click();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.sent));
    expect(posts).toBe(2);
  });

  it("sin red al abrir: lo dice y deja reintentar", async () => {
    let fail = true;
    server({ "GET /api/handoff/s1": () => (fail ? Promise.reject(new TypeError("Failed to fetch")) : json({ kind: "photo" })) });
    const el = phone();
    await until(() => el.textContent!.includes(HANDOFF_PHONE_LABELS.offline));
    fail = false;
    [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === HANDOFF_LABELS.retry)!.click();
    await until(() => el.querySelector(".nx-ho__pick"));
  });
});
