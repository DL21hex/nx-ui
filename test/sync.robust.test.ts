// La cola en los casos difíciles: varias pestañas, disco lleno, cerrar sesión a mitad de un envío,
// editar lo que va en camino, `Retry-After` absurdos, sesión vencida, servidores que no terminan
// de contestar y registros corruptos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanLoaded, createSync, idbStore, memoryStore } from "../src/components/sync/logic";
import type { SyncChannel, SyncEvent, SyncLocks, SyncOp, SyncOptions, SyncStore } from "../src/components/sync/types";

type Step = (url: string, init: RequestInit) => Response | Promise<Response> | "offline" | "hang";
type Call = { url: string; method: string; key: string; body: unknown };
const res = (status: number, body?: unknown, headers?: Record<string, string>) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers });
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function setup(script: Step[] = [], opts: SyncOptions = {}) {
  const calls: Call[] = [];
  let up = true;
  const fetch = vi.fn((url: string, init: RequestInit = {}) => {
    const step = script.shift() ?? (() => res(201, { ok: true }));
    const r = step(url, init);
    const h = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: String(init.method ?? "GET"), key: h["Idempotency-Key"], body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (r === "offline") return Promise.reject(new TypeError("Failed to fetch"));
    if (r === "hang") return new Promise<Response>((_, ko) => init.signal?.addEventListener("abort", () => ko(new DOMException("Aborted", "AbortError"))));
    return Promise.resolve(r);
  });
  const events = new EventTarget();
  const store = opts.store ?? memoryStore();
  const q = createSync({ fetch: fetch as unknown as typeof globalThis.fetch, store, random: () => 0.5, network: () => up, events, ...opts });
  const log: SyncEvent[] = [];
  let notifies = 0;
  q.subscribe((_, e) => (notifies++, e && log.push(e)));
  const net = (v: boolean) => {
    up = v;
    events.dispatchEvent(new Event(v ? "online" : "offline"));
  };
  const types = () => log.map((e) => e.type);
  return { q, calls, store, net, log, types, notifies: () => notifies };
}
const pedido = (n: number, extra: object = {}) => ({ method: "POST" as const, url: "/pedidos", body: { cantidad: n }, label: `Pedido ${n}`, ...extra });

/** `navigator.locks` de mentira: el candado es de uno a la vez; `kill()` cierra la pestaña que lo tiene. */
function fakeLocks() {
  const waiting: (() => void)[] = [];
  let busy = false;
  const grant = () => {
    const next = waiting.shift();
    busy = !!next;
    next?.();
  };
  const locks: SyncLocks = {
    request: (_name, fn) =>
      new Promise((ok) => {
        waiting.push(() => void fn().then(ok, ok));
        if (!busy) grant();
      }),
  };
  return { locks, kill: grant };
}
/** Un `BroadcastChannel` de mentira: lo que manda uno les llega a los demás (no a sí mismo). */
function fakeHub() {
  const peers = new Set<SyncChannel>();
  return (): SyncChannel => {
    const c: SyncChannel = {
      onmessage: null,
      postMessage(msg) {
        for (const p of peers) if (p !== c) queueMicrotask(() => p.onmessage?.({ data: structuredClone(msg) }));
      },
    };
    peers.add(c);
    return c;
  };
}

describe("la cola: robustez", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-25T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("dos pestañas: una sola envía; lo que encola la otra le llega por el canal y sale una vez", async () => {
    const store = memoryStore();
    const { locks, kill } = fakeLocks();
    const channel = fakeHub();
    const a = setup([], { store, locks, channel: channel() });
    await tick();
    const b = setup([], { store, locks, channel: channel() });
    await tick();
    await b.q.enqueue(pedido(1));
    await a.q.enqueue(pedido(2));
    await tick();
    expect(b.calls).toEqual([]);
    expect(a.calls.map((c) => (c.body as { cantidad: number }).cantidad).sort()).toEqual([1, 2]);
    expect(await store.load()).toEqual([]);
    // Y la otra se entera: su vista queda vacía.
    expect(b.q.state.ops).toEqual([]);

    // Se cierra la que enviaba: la otra toma la cola y retoma lo pendiente.
    a.net(false);
    await b.q.enqueue(pedido(3));
    await tick();
    expect(a.calls).toHaveLength(2);
    kill();
    await tick();
    expect(b.calls.map((c) => c.body)).toEqual([{ cantidad: 3 }]);
  });

  it("sin candado: antes de enviar relee el registro; si otra pestaña ya lo envió, no lo repite", async () => {
    const store = memoryStore();
    const b = setup([], { store });
    b.net(false);
    await b.q.enqueue(pedido(1));
    const a = setup([], { store });
    await tick();
    expect(a.calls).toHaveLength(1);
    b.net(true);
    await tick();
    expect(b.calls).toEqual([]);
    expect(b.q.state.ops).toEqual([]);
  });

  it("disco lleno: enqueue rechaza, no queda en la fila y la cola deja de ser durable", async () => {
    const full: SyncStore = { durable: true, load: async () => [], put: () => Promise.reject(new DOMException("lleno", "QuotaExceededError")), del: async () => true };
    const { q, calls } = setup([], { store: full });
    await expect(q.enqueue(pedido(1))).rejects.toThrow(/no se pudo guardar/);
    await tick();
    expect(calls).toEqual([]);
    expect(q.state).toMatchObject({ ops: [], durable: false });
    // En memoria (pruebas, sin IndexedDB) tampoco es durable; un almacén propio sí.
    const mem = setup();
    await tick();
    expect(mem.q.state.durable).toBe(false);
    const own: SyncStore = { load: async () => [], put: async () => true, del: async () => true };
    const c = setup([], { store: own });
    await tick();
    expect(c.q.state.durable).toBe(true);
  });

  it("idbStore resuelve al completar la transacción y rechaza si se aborta (cuota)", async () => {
    const data = new Map<string, unknown>();
    let quota = false;
    const request = <T>(t: Record<string, unknown>, run: () => T, write: boolean) => {
      const r: Record<string, unknown> = { onsuccess: null, onerror: null, result: undefined };
      queueMicrotask(() => {
        const out = run();
        r.result = out;
        (r.onsuccess as (() => void) | null)?.();
        // El `success` de la petición llega antes que el resultado de la transacción.
        queueMicrotask(() => {
          if (write && quota) {
            t.error = new DOMException("lleno", "QuotaExceededError");
            (t.onabort as (() => void) | null)?.();
          } else (t.oncomplete as (() => void) | null)?.();
        });
      });
      return r;
    };
    const db = {
      createObjectStore: () => ({}),
      transaction: () => {
        const t: Record<string, unknown> = { oncomplete: null, onabort: null, onerror: null, error: null };
        t.objectStore = () => ({
          getAll: () => request(t, () => [...data.values()], false),
          get: (id: string) => request(t, () => data.get(id), false),
          put: (op: SyncOp) => request(t, () => (quota ? undefined : data.set(op.id, structuredClone(op))), true),
          delete: (id: string) => request(t, () => data.delete(id), true),
        });
        return t;
      },
    };
    vi.stubGlobal("indexedDB", {
      open: () => {
        const r: Record<string, unknown> = { result: db };
        queueMicrotask(() => ((r.onupgradeneeded as () => void)?.(), (r.onsuccess as () => void)?.()));
        return r;
      },
    });
    const s = idbStore("prueba");
    const op = { id: "a", key: "a", method: "POST", url: "/x", label: "", status: "pending", seq: 1, createdAt: 0, attempts: 0 } as SyncOp;
    await s.put(op);
    expect(data.has("a")).toBe(true);
    expect(await s.get!("a")).toMatchObject({ id: "a" });
    quota = true;
    await expect(s.put({ ...op, id: "b" })).rejects.toMatchObject({ name: "QuotaExceededError" });
    const { q } = setup([], { store: s });
    await expect(q.enqueue(pedido(1))).rejects.toThrow();
    expect(q.state.durable).toBe(false);
  });

  it("clear() a mitad de un envío: aborta, y lo que vuelve no resucita ni sale con la sesión siguiente", async () => {
    const { q, calls, store } = setup([() => "hang"]);
    await q.enqueue(pedido(1));
    await tick();
    expect(q.state.ops[0].status).toBe("sending");
    await q.clear();
    await tick(120_000);
    expect(calls).toHaveLength(1);
    expect(q.state.ops).toEqual([]);
    expect(await store.load()).toEqual([]);
  });

  it("el mismo id mientras va en camino: la versión nueva sale después, con otra llave", async () => {
    let answer!: (r: Response) => void;
    const { q, calls, store } = setup([() => new Promise<Response>((ok) => (answer = ok))]);
    await q.enqueue(pedido(1, { id: "p" }));
    await tick();
    const same = await q.enqueue(pedido(5, { id: "p" }));
    expect(same.status).toBe("sending");
    answer(res(201));
    await tick();
    expect(calls.map((c) => [c.key, c.body])).toEqual([
      ["p", { cantidad: 1 }],
      ["p.1", { cantidad: 5 }],
    ]);
    expect(await store.load()).toEqual([]);
  });

  it("el mismo id después de un intento sin respuesta: otro cuerpo, otra llave (la anterior pudo llegar)", async () => {
    const { q, calls } = setup([() => "offline"]);
    await q.enqueue(pedido(1, { id: "p" }));
    await tick();
    expect(q.state.ops[0]).toMatchObject({ status: "waiting", attempts: 1 });
    await q.enqueue(pedido(5, { id: "p" }));
    await tick(1000);
    expect(calls.map((c) => c.key)).toEqual(["p", "p.1"]);
  });

  it("Retry-After enorme: tope de 1 h y sin desbordar setTimeout (no gira en vacío)", async () => {
    const { q, calls, notifies } = setup([() => res(503, null, { "Retry-After": "99999999" })]);
    await q.enqueue(pedido(1));
    await tick();
    expect(q.state.ops[0].nextAt).toBe(Date.now() + 3_600_000);
    const before = notifies();
    await tick(10_000);
    expect(calls).toHaveLength(1);
    expect(notifies() - before).toBeLessThan(5);
    await tick(3_600_000);
    expect(calls).toHaveLength(2);
  });

  it("un nextAt guardado a meses no hace girar la cola", async () => {
    const far: SyncOp = { id: "x", key: "x", method: "POST", url: "/x", label: "", status: "waiting", seq: 1, createdAt: 0, attempts: 1, nextAt: Date.now() + 90 * 86_400_000, httpStatus: 503 };
    const { calls, notifies } = setup([], { store: memoryStore([far]) });
    await tick();
    const before = notifies();
    await tick(5000);
    expect(calls).toEqual([]);
    expect(notifies() - before).toBeLessThan(3);
  });

  it("Retry-After: 0 o una fecha pasada no martillan: al menos la espera que toca", async () => {
    const { q, calls } = setup([() => res(503, null, { "Retry-After": "0" }), () => res(503, null, { "Retry-After": "Fri, 25 Sep 2026 11:00:00 GMT" })]);
    await q.enqueue(pedido(1));
    await tick();
    expect(q.state.ops[0].nextAt).toBe(Date.now() + 1000);
    await tick(1000);
    expect(calls).toHaveLength(2);
    expect(q.state.ops[0].nextAt).toBe(Date.now() + 2000);
  });

  it("un servidor que manda las cabeceras y se calla: el tiempo también corre para el cuerpo", async () => {
    const stalled: Step = (_u, init) =>
      new Response(new ReadableStream({ start: (c) => init.signal?.addEventListener("abort", () => c.error(new DOMException("Aborted", "AbortError"))) }), { status: 201 });
    const { q, calls } = setup([stalled], { timeout: 5000 });
    await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    await tick(4999);
    expect(calls).toHaveLength(1);
    await tick(1);
    expect(calls).toHaveLength(2);
    expect(q.state.ops).toEqual([]);
  });

  it("401: la cola se detiene (estado auth, evento) sin gastar la operación; sigue con cabeceras nuevas", async () => {
    const { q, calls, types } = setup([() => res(401, { message: "Sesión vencida" })]);
    const a = await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    await tick(120_000);
    expect(calls).toHaveLength(1);
    expect(q.state).toMatchObject({ auth: true, pending: 2, failed: 0 });
    expect(q.state.ops[0]).toMatchObject({ status: "pending", httpStatus: 401 });
    expect(types()).toContain("auth");
    q.configure({ headers: { Authorization: "Bearer nuevo" } });
    await tick();
    expect(calls.map((c) => c.key)).toEqual([a.id, a.id, expect.any(String)]);
    expect(q.state).toMatchObject({ auth: false, ops: [] });
  });

  it("maxAttempts: tras N respuestas 5xx queda fallida y deja pasar a las demás", async () => {
    const { q, calls, types } = setup([() => res(500), () => res(500), () => res(500)], { maxAttempts: 3 });
    await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    await tick();
    await tick(1000);
    await tick(2000);
    expect(calls.map((c) => (c.body as { cantidad: number }).cantidad)).toEqual([1, 1, 1, 2]);
    expect(q.state.ops).toHaveLength(1);
    expect(q.state.ops[0]).toMatchObject({ status: "failed", httpStatus: 500, fails: 3 });
    expect(types()).toContain("failed");
  });

  it("la falta de red no gasta intentos: sin conexión se espera lo que haga falta", async () => {
    const { q } = setup(Array(50).fill(() => "offline"), { maxAttempts: 3 });
    await q.enqueue(pedido(1));
    for (let i = 0; i < 12; i++) await tick(60_000);
    expect(q.state.ops[0]).toMatchObject({ status: "waiting" });
    expect(q.state.ops[0].attempts).toBeGreaterThan(3);
  });

  it("el evento online no se salta un Retry-After del servidor (sí lo que esperaba por la red)", async () => {
    const { q, calls, net } = setup([() => res(503, null, { "Retry-After": "30" })]);
    await q.enqueue(pedido(1));
    await tick();
    net(false);
    net(true);
    await tick(1000);
    expect(calls).toHaveLength(1);
    await tick(29_000);
    expect(calls).toHaveLength(2);
  });

  it("maxOps: la cola llena rechaza lo nuevo sin tocar lo que había", async () => {
    const { q, net } = setup([], { maxOps: 2 });
    net(false);
    await q.enqueue(pedido(1));
    await q.enqueue(pedido(2));
    await expect(q.enqueue(pedido(3))).rejects.toThrow(RangeError);
    expect(q.state.ops).toHaveLength(2);
  });

  it("ttl: lo que venció sin enviarse se descarta con el evento expired", async () => {
    const { q, calls, net, store, log } = setup([], { ttl: 60_000 });
    net(false);
    await q.enqueue(pedido(1));
    await tick(61_000);
    net(true);
    await tick();
    expect(calls).toEqual([]);
    expect(log.find((e) => e.type === "expired")).toMatchObject({ op: { label: "Pedido 1" } });
    expect(await store.load()).toEqual([]);
  });

  it("cleanLoaded: registros corruptos o de otra versión no rompen la cola", () => {
    const ops = cleanLoaded(
      [
        null,
        { id: "c", method: "POST", url: "javascript:alert(1)" },
        { id: "b", method: "post", url: "/b", seq: 5, status: "raro", attempts: -1, nextAt: "x", label: 7 },
        { id: "a", method: "PUT", url: "/a" },
        { id: "d", method: "DELETE", url: "/d", seq: 2, status: "waiting", attempts: 2, key: "d.1", nextAt: 10 },
        { id: "e", method: "POST", url: "/e", seq: 3, status: "conflict" },
        { id: "f", method: "POST", url: "/f", seq: 4, status: "sending" },
      ],
      1000,
    );
    expect(ops.map((o) => [o.id, o.seq, o.status, o.key, o.attempts])).toEqual([
      ["d", 2, "waiting", "d.1", 2],
      ["e", 3, "failed", "e", 0],
      ["f", 4, "pending", "f", 0],
      ["b", 5, "pending", "b", 0],
      ["a", 6, "pending", "a", 0],
    ]);
    expect(ops.find((o) => o.id === "a")).toMatchObject({ createdAt: 1000, label: "" });
  });
});
