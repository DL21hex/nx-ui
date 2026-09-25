import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ago, backoff, classify, cleanConflict, cleanFields, cleanInput, countdown, createSync, diffFields, errorText, fieldLabel, flatten, memoryStore, midDiff, plural, resolveBody, retryAfter } from "../src/components/sync/logic";
import type { SyncEvent, SyncOp, SyncOptions } from "../src/components/sync/types";

describe("SSR", () => {
  it("importar el componente sin DOM no lanza ni toca nada", async () => {
    expect(typeof globalThis.HTMLElement).toBe("undefined");
    const mod = await import("../src/components/sync/index");
    expect(typeof mod.NxSync).toBe("function");
    expect(mod.nxSync.state).toMatchObject({ ready: false, ops: [] });
  });
});

describe("esperas y respuestas", () => {
  it("backoff: 1 s, 2 s, 4 s… con tope de 60 s y ±20 % al azar", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((n) => backoff(n, 1000, 60_000, () => 0.5))).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(backoff(1, 1000, 60_000, () => 0)).toBe(800);
    expect(backoff(1, 1000, 60_000, () => 1)).toBe(1200);
    expect(backoff(3, 1000, 60_000, () => 0.999)).toBeLessThanOrEqual(4800);
    // El azar nunca pasa el tope.
    expect(backoff(12, 1000, 60_000, () => 1)).toBe(60_000);
  });

  it("Retry-After en segundos o como fecha HTTP", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    expect(retryAfter("3", now)).toBe(3000);
    expect(retryAfter(" 1.5 ", now)).toBe(1500);
    expect(retryAfter("Fri, 25 Sep 2026 12:00:10 GMT", now)).toBe(10_000);
    expect(retryAfter("Fri, 25 Sep 2026 11:00:00 GMT", now)).toBe(0);
    expect(retryAfter("pronto", now)).toBeNull();
    expect(retryAfter(null, now)).toBeNull();
  });

  it("clasifica: 2xx listo, 408/425/429/5xx reintento, 409/412 conflicto, otro 4xx fallo", () => {
    const at = (codes: number[]) => codes.map(classify);
    expect(at([200, 201, 204])).toEqual(["ok", "ok", "ok"]);
    expect(at([408, 425, 429, 500, 502, 503, 504])).toEqual(Array(7).fill("retry"));
    expect(at([409, 412])).toEqual(["conflict", "conflict"]);
    expect(at([400, 401, 403, 404, 410, 422])).toEqual(Array(6).fill("failed"));
  });

  it("el mensaje de error del cuerpo", () => {
    expect(errorText({ message: "Cupo de crédito agotado" })).toBe("Cupo de crédito agotado");
    expect(errorText({ error: "", detail: "NIT inválido" })).toBe("NIT inválido");
    expect(errorText(" Sin permiso ")).toBe("Sin permiso");
    expect(errorText("<html>".padEnd(300, "x"))).toBeUndefined();
    expect(errorText(null)).toBeUndefined();
  });
});

describe("datos de entrada", () => {
  it("cleanInput valida método, URL y cuerpo JSON", () => {
    const op = cleanInput({ method: "post", url: "/pedidos", body: { a: 1, f: () => 1 }, label: "Pedido", group: "t-1", onclick: "x" }, "id-1", 4, 100)!;
    expect(op).toMatchObject({ id: "id-1", key: "id-1", method: "POST", url: "/pedidos", body: { a: 1 }, label: "Pedido", group: "t-1", status: "pending", seq: 4, createdAt: 100, attempts: 0 });
    expect("onclick" in op).toBe(false);
    expect(cleanInput({ id: "mio", method: "DELETE", url: "https://api.example.com/x/1" }, "otro", 1, 0)).toMatchObject({ id: "mio", label: "DELETE https://api.example.com/x/1" });
    expect(cleanInput({ method: "GET", url: "/x" }, "i", 1, 0)).toBeNull();
    expect(cleanInput({ method: "POST", url: "javascript:alert(1)" }, "i", 1, 0)).toBeNull();
    expect(cleanInput({ method: "POST", url: "  " }, "i", 1, 0)).toBeNull();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(cleanInput({ method: "POST", url: "/x", body: cyclic }, "i", 1, 0)).toBeNull();
    expect(cleanInput(null, "i", 1, 0)).toBeNull();
  });

  it("cleanFields y cleanConflict", () => {
    expect(cleanFields(["cantidad", { key: "precio", label: "Precio" }, { label: "sin clave" }, 7])).toEqual([
      { key: "cantidad", label: "" },
      { key: "precio", label: "Precio" },
    ]);
    expect(cleanConflict({ server: { a: 2 }, fields: ["a"], etag: 'W/"7"' }, { a: 1 })).toEqual({ server: { a: 2 }, local: { a: 1 }, fields: [{ key: "a", label: "" }], etag: 'W/"7"' });
    expect(cleanConflict({ server: { a: 2 } }, { a: 1 }, '"v3"')!.etag).toBe('"v3"');
    expect(cleanConflict({ message: "sin versión" }, { a: 1 })).toBeNull();
  });
});

describe("comparar y resolver", () => {
  const LOCAL = { cliente: { nit: "900123", nombre: "Tienda La Esquina" }, productos: [{ sku: "ARZ", nombre: "Arroz Diana 500 g", cantidad: 24 }, { sku: "ACE", nombre: "Aceite Premier 1 L", cantidad: 12 }], notas: "" };
  const SERVER = { cliente: { nit: "900123", nombre: "Tienda La Esquina" }, productos: [{ sku: "ARZ", nombre: "Arroz Diana 500 g", cantidad: 24 }, { sku: "ACE", nombre: "Aceite Premier 1 L", cantidad: 8 }, { sku: "PAN", nombre: "Panela 500 g", cantidad: 6 }], notas: "Pedido telefónico" };

  it("flatten: las hojas por ruta con puntos", () => {
    expect([...flatten({ a: { b: [1, { c: null }] }, d: [], e: {} })]).toEqual([
      ["a.b.0", 1],
      ["a.b.1.c", null],
      ["d", []],
      ["e", {}],
    ]);
    expect([...flatten(5)]).toEqual([["", 5]]);
  });

  it("diffFields: lo distinto (los señalados primero) y cuántos son iguales", () => {
    const { rows, same } = diffFields(LOCAL, SERVER, ["productos.1.cantidad"]);
    expect(rows.map((r) => r.key)).toEqual(["productos.1.cantidad", "notas", "productos.2.sku", "productos.2.nombre", "productos.2.cantidad"]);
    expect(rows[0]).toEqual({ key: "productos.1.cantidad", mine: 12, theirs: 8, hot: true });
    expect(rows[2]).toMatchObject({ mine: undefined, theirs: "PAN" });
    expect(same).toBe(7);
  });

  it("resolveBody: lo mío, con lo del servidor donde se eligió", () => {
    expect(resolveBody(LOCAL, SERVER, [])).toEqual(LOCAL);
    const r = resolveBody(LOCAL, SERVER, ["productos.1.cantidad", "productos.2.sku", "productos.2.nombre", "productos.2.cantidad"]) as typeof SERVER;
    expect(r.productos.map((p) => p.cantidad)).toEqual([24, 8, 6]);
    expect(r.notas).toBe("");
    // Elegir el servidor donde el campo no existe lo quita (y no deja objetos vacíos en la lista).
    const back = resolveBody(SERVER, LOCAL, ["productos.1.cantidad", "productos.2.sku", "productos.2.nombre", "productos.2.cantidad", "notas"]);
    expect(back).toEqual(LOCAL);
    expect(resolveBody(LOCAL, SERVER, ["notas"])).toMatchObject({ notas: "Pedido telefónico" });
    // No toca el original.
    expect(LOCAL.productos[1].cantidad).toBe(12);
  });

  it("fieldLabel: comodines, hermanos entre llaves y la ruta legible", () => {
    const fields = [
      { key: "productos.*.cantidad", label: "Cantidad · {nombre}" },
      { key: "notas", label: "Observaciones" },
      { key: "sin", label: "" },
    ];
    expect(fieldLabel("productos.1.cantidad", fields, LOCAL)).toBe("Cantidad · Aceite Premier 1 L");
    expect(fieldLabel("notas", fields, LOCAL)).toBe("Observaciones");
    expect(fieldLabel("productos.2.sku", fields, LOCAL)).toBe("productos › #3 › sku");
    expect(fieldLabel("sin", fields)).toBe("sin");
  });

  it("midDiff: lo común afuera y lo distinto en medio", () => {
    expect(midDiff("12 cajas", "18 cajas")).toEqual(["1", "2", "8", " cajas"]);
    expect(midDiff("abc", "abc")).toEqual(["abc", "", "", ""]);
    expect(midDiff("aa", "aaa")).toEqual(["aa", "", "a", ""]);
    expect(midDiff("12", "8")).toEqual(["", "12", "8", ""]);
  });

  it("textos: cuenta regresiva, hace cuánto y plurales", () => {
    expect(countdown(1)).toBe("1 s");
    expect(countdown(12_000)).toBe("12 s");
    expect(countdown(65_000)).toBe("1:05");
    expect(countdown(-5)).toBe("0 s");
    expect(ago(10_000)).toBe("ahora");
    expect(ago(3 * 60_000)).toBe("hace 3 min");
    expect(ago(2 * 3600_000)).toBe("hace 2 h");
    expect(ago(3 * 3600_000, "en-US")).toBe("3 hr. ago");
    expect(plural(1, "{n} pendiente", "{n} pendientes")).toBe("1 pendiente");
    expect(plural(3, "{n} pendiente", "{n} pendientes")).toBe("3 pendientes");
  });
});

// ---------------------------------------------------------------- la cola, con fetch y reloj falsos

type Step = (url: string, init: RequestInit) => Response | Promise<Response> | "offline" | "hang";
type Call = { url: string; method: string; headers: Record<string, string>; body: unknown };
const res = (status: number, body?: unknown, headers?: Record<string, string>) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function setup(script: Step[] = [], opts: SyncOptions = {}) {
  const calls: Call[] = [];
  let up = true;
  const fetch = vi.fn((url: string, init: RequestInit = {}) => {
    const step = script.shift() ?? (() => res(201, { ok: true }));
    const r = step(url, init);
    if (url.includes("ping")) calls.push({ url, method: "PING", headers: {}, body: null });
    else calls.push({ url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (r === "offline") return Promise.reject(new TypeError("Failed to fetch"));
    if (r === "hang") return new Promise<Response>((_, ko) => init.signal?.addEventListener("abort", () => ko(new DOMException("Aborted", "AbortError"))));
    return Promise.resolve(r);
  });
  const events = new EventTarget();
  const store = opts.store ?? memoryStore();
  const q = createSync({ fetch: fetch as unknown as typeof globalThis.fetch, store, random: () => 0.5, network: () => up, events, ...opts });
  const log: SyncEvent[] = [];
  q.subscribe((_, e) => e && log.push(e));
  const net = (v: boolean) => {
    up = v;
    events.dispatchEvent(new Event(v ? "online" : "offline"));
  };
  const types = () => log.map((e) => e.type);
  return { q, calls, fetch, store, net, log, types };
}
const pedido = (n: number, extra: object = {}) => ({ method: "POST" as const, url: "/pedidos", body: { tienda: `T-${n}`, cantidad: n }, label: `Pedido ${n}`, ...extra });

describe("createSync: la cola", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-25T12:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("envía en orden, una a la vez, con Idempotency-Key y JSON; avisa cada envío y el final", async () => {
    const { q, calls, log, types } = setup();
    const a = await q.enqueue(pedido(1, { id: "ped-1" }));
    const b = await q.enqueue(pedido(2));
    await q.enqueue({ method: "DELETE", url: "/pedidos/9", label: "Anular 9" });
    await tick();
    expect(calls.map((c) => c.body ?? c.method)).toEqual([{ tienda: "T-1", cantidad: 1 }, { tienda: "T-2", cantidad: 2 }, "DELETE"]);
    expect(calls[0].headers).toMatchObject({ "Idempotency-Key": "ped-1", "Content-Type": "application/json", Accept: "application/json" });
    expect(calls[1].headers["Idempotency-Key"]).toBe(b.id);
    expect(calls[2].headers["Content-Type"]).toBeUndefined();
    expect(a.id).toBe("ped-1");
    expect(types().filter((t) => t === "done" || t === "idle")).toEqual(["done", "done", "done", "idle"]);
    expect(log.find((e) => e.type === "done")).toMatchObject({ data: { ok: true }, status: 201 });
    expect(q.state).toMatchObject({ pending: 0, progress: null, online: true, ops: [] });
  });

  it("el avance cuenta la tanda: «2 de 3»", async () => {
    const seen: string[] = [];
    const { q, net } = setup();
    q.subscribe((s) => s.progress && seen.push(`${s.progress.done}/${s.progress.total}`));
    net(false);
    await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    await q.enqueue(pedido(3));
    net(true);
    await tick();
    expect(seen[0]).toBe("0/3");
    expect(seen).toContain("1/3");
    expect(seen).toContain("2/3");
    expect(seen.at(-1)).toBe("2/3");
  });

  it("503 con Retry-After: toda la cola espera lo que dice el servidor y reintenta con la misma llave", async () => {
    const { q, calls } = setup([() => res(503, { message: "Mantenimiento" }, { "Retry-After": "3" })]);
    const a = await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    await tick();
    expect(calls).toHaveLength(1);
    const op = q.state.ops[0];
    expect(op).toMatchObject({ status: "waiting", attempts: 1, httpStatus: 503, error: "Mantenimiento", nextAt: Date.now() + 3000 });
    await tick(2999);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls.map((c) => c.headers["Idempotency-Key"])).toEqual([a.id, a.id, expect.any(String)]);
    expect(q.state.ops).toEqual([]);
  });

  it("sin respuesta: queda sin conexión y espera 1 s, 2 s, 4 s…; al volver, «online»", async () => {
    const { q, calls, types } = setup([() => "offline", () => "offline", () => "offline"]);
    await q.enqueue(pedido(1));
    await tick();
    expect(q.state.online).toBe(false);
    expect(q.state.ops[0]).toMatchObject({ status: "waiting", attempts: 1, nextAt: Date.now() + 1000 });
    expect(types()).toContain("offline");
    await tick(1000);
    expect(calls).toHaveLength(2);
    expect(q.state.ops[0].nextAt).toBe(Date.now() + 2000);
    await tick(2000);
    expect(q.state.ops[0].nextAt).toBe(Date.now() + 4000);
    await tick(4000);
    expect(calls).toHaveLength(4);
    expect(q.state).toMatchObject({ online: true, pending: 0 });
    expect(types()).toContain("online");
  });

  it("se agota el tiempo: cuenta como falta de red", async () => {
    const { q } = setup([() => "hang"], { timeout: 5000 });
    await q.enqueue(pedido(1));
    await tick(4999);
    expect(q.state.ops[0].status).toBe("sending");
    await tick(1);
    expect(q.state.ops[0]).toMatchObject({ status: "waiting", attempts: 1 });
    expect(q.state.online).toBe(false);
  });

  it("sin red (navigator.onLine) no intenta; el evento «online» la despierta", async () => {
    const { q, calls, net } = setup();
    net(false);
    await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    await tick(60_000);
    expect(calls).toHaveLength(0);
    expect(q.state).toMatchObject({ online: false, pending: 2 });
    net(true);
    await tick();
    expect(calls).toHaveLength(2);
    expect(q.state.pending).toBe(0);
  });

  it("con ping: comprueba la conexión antes de reintentar", async () => {
    const { q, calls } = setup([() => "offline", () => "offline", () => res(204)], { ping: "/ping" });
    await q.enqueue(pedido(1));
    await tick();
    expect(calls.map((c) => c.method)).toEqual(["POST"]);
    await tick(1000);
    // El ping falla: la operación no se tocó (sigue con 1 intento) y la espera crece.
    expect(calls.map((c) => c.method)).toEqual(["POST", "PING"]);
    expect(q.state.ops[0]).toMatchObject({ status: "waiting", attempts: 1, nextAt: Date.now() + 1000 });
    await tick(1000);
    expect(calls.map((c) => c.method)).toEqual(["POST", "PING", "PING", "POST"]);
    expect(q.state.ops).toEqual([]);
  });

  it("check(): con ping y la cola vacía dice si hay conexión, y sigue probando mientras no", async () => {
    const { q, calls, types } = setup([() => "offline", () => "offline", () => res(200)], { ping: "/ping" });
    expect(await q.check()).toBe(false);
    expect(q.state.online).toBe(false);
    expect(types()).toContain("offline");
    await tick(1000);
    expect(calls.map((c) => c.method)).toEqual(["PING", "PING"]);
    await tick(2000);
    expect(calls).toHaveLength(3);
    expect(q.state.online).toBe(true);
    expect(types().at(-1)).toBe("online");
  });

  it("check() mientras otra comprobación va en camino: vuelve a comprobar al terminar y envía lo que esperaba", async () => {
    const slowFail = () => new Promise<Response>((_, ko) => setTimeout(() => ko(new TypeError("Failed to fetch")), 500));
    const { q, calls } = setup([() => "offline", slowFail], { ping: "/ping" });
    await q.enqueue(pedido(1));
    await tick(1000);
    expect(calls.map((c) => c.method)).toEqual(["POST", "PING"]);
    await tick(200);
    void q.check();
    await tick(300);
    // La comprobación vieja falló, pero la nueva contesta: la operación sale sin esperar su turno.
    expect(calls.map((c) => c.method)).toEqual(["POST", "PING", "PING", "POST"]);
    expect(q.state).toMatchObject({ online: true, ops: [] });
  });

  it("409: queda en conflicto sin frenar la cola; solo espera su grupo; resolver reenvía con If-Match y otra llave", async () => {
    const server = { tienda: "T-1", cantidad: 8 };
    const { q, calls, types } = setup([() => res(409, { server, fields: [{ key: "cantidad", label: "Cantidad" }], etag: 'W/"v7"', message: "Otro vendedor lo cambió" })]);
    const a = await q.enqueue(pedido(1, { group: "T-1" }));
    await q.enqueue(pedido(2, { group: "T-1" }));
    await q.enqueue(pedido(3, { group: "T-3" }));
    await tick();
    expect(calls.map((c) => (c.body as { cantidad: number }).cantidad)).toEqual([1, 3]);
    expect(q.state).toMatchObject({ conflicts: 1, pending: 1 });
    const op = q.state.ops[0];
    expect(op).toMatchObject({ status: "conflict", error: "Otro vendedor lo cambió", conflict: { server, local: { tienda: "T-1", cantidad: 1 }, fields: [{ key: "cantidad", label: "Cantidad" }], etag: 'W/"v7"' } });
    expect(types()).toContain("conflict");
    expect(await q.resolve("nope", {})).toBe(false);
    expect(await q.resolve(a.id, { tienda: "T-1", cantidad: 9 })).toBe(true);
    await tick();
    expect(calls[2].headers).toMatchObject({ "If-Match": 'W/"v7"', "Idempotency-Key": `${a.id}.1` });
    expect(calls[2].body).toEqual({ tienda: "T-1", cantidad: 9 });
    // Y la que esperaba en su grupo sale detrás.
    expect((calls[3].body as { cantidad: number }).cantidad).toBe(2);
    expect(q.state.ops).toEqual([]);
  });

  it("409 sin versión del servidor y otros 4xx: «fallida» con el mensaje; se corrige y se reintenta", async () => {
    const { q, calls } = setup([() => res(422, { message: "El NIT no existe" }), () => res(409, "duplicado")]);
    const a = await q.enqueue(pedido(1));
    const b = await q.enqueue(pedido(2));
    await tick();
    expect(q.state.ops.map((o) => [o.status, o.error, o.httpStatus])).toEqual([
      ["failed", "El NIT no existe", 422],
      ["failed", "duplicado", 409],
    ]);
    expect(q.state).toMatchObject({ failed: 2, pending: 0 });
    expect(await q.retry(a.id, { tienda: "T-1", nit: "900123" })).toBe(true);
    await tick();
    expect(calls[2]).toMatchObject({ body: { tienda: "T-1", nit: "900123" }, headers: { "Idempotency-Key": `${a.id}.1` } });
    expect(await q.discard(b.id)).toBe(true);
    expect(q.state.ops).toEqual([]);
    expect(await q.discard(b.id)).toBe(false);
  });

  it("reintentar ya y flush no esperan el tiempo", async () => {
    const { q, calls } = setup([() => res(500), () => res(500)]);
    const a = await q.enqueue(pedido(1));
    await tick();
    expect(q.state.ops[0].status).toBe("waiting");
    await q.retry(a.id);
    await tick();
    expect(calls).toHaveLength(2);
    expect(calls[1].headers["Idempotency-Key"]).toBe(a.id);
    await q.flush();
    expect(calls).toHaveLength(3);
    expect(q.state.ops).toEqual([]);
  });

  it("encolar el mismo id reemplaza el cuerpo de la que aún no sale", async () => {
    const { q, calls, net } = setup();
    net(false);
    await q.enqueue(pedido(1, { id: "p" }));
    await q.enqueue(pedido(5, { id: "p", label: "Pedido 1 (corregido)" }));
    expect(q.state.ops).toHaveLength(1);
    expect(q.state.ops[0]).toMatchObject({ label: "Pedido 1 (corregido)", body: { cantidad: 5 } });
    net(true);
    await tick();
    expect(calls.map((c) => c.body)).toEqual([{ tienda: "T-5", cantidad: 5 }]);
  });

  it("persiste: otra cola sobre el mismo almacén retoma lo pendiente, en orden; lo que iba en camino vuelve a la fila", async () => {
    const first = setup();
    first.net(false);
    await first.q.enqueue(pedido(1));
    await first.q.enqueue(pedido(2));
    const saved = await first.store.load();
    expect(saved.map((o) => o.label).sort()).toEqual(["Pedido 1", "Pedido 2"]);

    const sending: SyncOp = { ...saved[0], id: "viejo", key: "viejo", seq: 0, status: "sending", attempts: 1, label: "Pedido 0" };
    const store = memoryStore([...saved.reverse(), sending]);
    const second = setup([], { store });
    await tick();
    expect(second.calls.map((c) => c.headers["Idempotency-Key"])).toEqual(["viejo", saved[1].id, saved[0].id]);
    expect(await store.load()).toEqual([]);
  });

  it("pending(), clear() y dejar de escuchar", async () => {
    const { q, net } = setup();
    net(false);
    await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    expect((await q.pending()).map((o) => o.label)).toEqual(["Pedido 1", "Pedido 2"]);
    const fn = vi.fn();
    const off = q.subscribe(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    off();
    await q.clear();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(q.state.ops).toEqual([]);
  });

  it("rechaza lo que no es una operación", async () => {
    const { q } = setup();
    await expect(q.enqueue({ method: "GET", url: "/x", label: "x" } as never)).rejects.toThrow(TypeError);
  });

  it("un almacén que falla al leer cae a memoria sin perder la cola", async () => {
    const broken = { load: () => Promise.reject(new Error("IndexedDB bloqueado")), put: () => Promise.reject(new Error("x")), del: () => Promise.reject(new Error("x")) };
    const { q, calls } = setup([], { store: broken });
    await q.enqueue(pedido(1));
    await tick();
    expect(calls).toHaveLength(1);
  });
});
