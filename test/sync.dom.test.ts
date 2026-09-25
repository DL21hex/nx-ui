// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador
// (`beforetoggle` síncrono, `toggle` después). La cola es la de la página (`nxSync`), con un
// `fetch` falso y sin `ping`.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/sync/index";
import { nxSync, type NxSync, type SyncChangeDetail } from "../src/components/sync/index";

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

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];
let replies: (() => Response)[] = [];
const res = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
let onLine = true;

beforeEach(() => {
  calls = [];
  replies = [];
  onLine = true;
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => onLine });
  nxSync.configure({ ping: null, fetch: (async (url: string, init: RequestInit) => (calls.push({ url, init }), (replies.shift() ?? (() => res(201, { numero: "PED-1" })))())) as typeof fetch });
});
afterEach(async () => {
  document.body.innerHTML = "";
  await nxSync.clear();
});

const PEDIDO = { cliente: "Tienda La Esquina", productos: [{ nombre: "Arroz 500 g", cantidad: 24 }, { nombre: "Aceite 1 L", cantidad: 6 }], notas: "" };
const enqueue = (label = "Pedido · Tienda La Esquina", body: object = PEDIDO) => nxSync.enqueue({ method: "POST", url: "/pedidos", body: body as never, label });

function mount(attrs = ""): NxSync {
  document.body.innerHTML = `<button id="antes">antes</button><nx-sync locale="es-CO" ${attrs}></nx-sync>`;
  return document.querySelector("nx-sync")!;
}
const pill = (el: NxSync) => el.querySelector<HTMLButtonElement>(".nx-sync__pill")!;
const pop = (el: NxSync) => el.querySelector<HTMLElement>(".nx-sync__pop")!;
const live = (el: NxSync) => el.querySelector(".nx-sync__vh")!.textContent!.trim();
const btn = (el: NxSync, name: RegExp) => [...el.querySelectorAll<HTMLButtonElement>("button")].find((b) => name.test(b.getAttribute("aria-label") ?? b.textContent ?? ""))!;
const net = (up: boolean) => {
  onLine = up;
  window.dispatchEvent(new Event(up ? "online" : "offline"));
};

describe("<nx-sync>", () => {
  it("la píldora: «En línea», discreta, que abre un diálogo", async () => {
    const el = mount();
    await vi.waitFor(() => expect(el.state.ready).toBe(true));
    expect(el.dataset.state).toBe("online");
    expect(pill(el).textContent).toBe("En línea");
    expect(pill(el).getAttribute("aria-haspopup")).toBe("dialog");
    expect(pill(el).getAttribute("aria-expanded")).toBe("false");
    expect(pop(el).getAttribute("role")).toBe("dialog");
    expect(pop(el).getAttribute("popover")).toBe("auto");
    expect(el.online).toBe(true);
  });

  it("sin conexión guarda, lo dice (píldora, aria-live y nx-sync-change) y al volver envía todo", async () => {
    const el = mount();
    const changes: SyncChangeDetail[] = [];
    const done: string[] = [];
    el.addEventListener("nx-sync-change", (e) => changes.push(e.detail));
    el.addEventListener("nx-sync-done", (e) => done.push(e.detail.op.label));
    await vi.waitFor(() => expect(el.state.ready).toBe(true));
    net(false);
    expect(el.dataset.state).toBe("offline");
    expect(pill(el).textContent).toBe("Sin conexión");
    expect(live(el)).toMatch(/^Sin conexión\. Tus cambios se guardan/);
    await enqueue("Pedido 1");
    await enqueue("Pedido 2");
    expect(pill(el).textContent).toBe("Sin conexión · 2 pendientes");
    expect(changes.at(-1)).toEqual({ online: false, pending: 2, conflicts: 0 });
    expect(calls).toHaveLength(0);
    net(true);
    await vi.waitFor(() => expect(done).toEqual(["Pedido 1", "Pedido 2"]));
    expect((calls[0].init.headers as Record<string, string>)["Idempotency-Key"]).toBeTruthy();
    expect(pill(el).textContent).toBe("En línea");
    expect(live(el)).toBe("Todo sincronizado.");
    expect(changes.at(-1)).toEqual({ online: true, pending: 0, conflicts: 0 });
  });

  it("el panel lista cada operación con su estado y acciones; Esc lo cierra y el foco vuelve a la píldora", async () => {
    const el = mount();
    net(false);
    await enqueue("Pedido · Tienda La Esquina");
    pill(el).focus();
    pill(el).click();
    expect(el.open).toBe(true);
    expect(pill(el).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement?.tagName).toBe("H2");
    const rows = el.querySelectorAll(".nx-sync__op");
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-status")).toBe("pending");
    expect(rows[0].querySelector(".nx-sync__label")!.textContent).toBe("Pedido · Tienda La Esquina");
    expect(rows[0].querySelector(".nx-sync__meta")!.textContent).toMatch(/^En cola\s*ahora$/);
    // En cola, en orden: no hay «Reintentar ya» (saldría en su turno de todos modos).
    expect(btn(el, /^Reintentar ya/)).toBeUndefined();
    expect(btn(el, /^Descartar · Pedido/)).toBeTruthy();
    pop(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el.open).toBe(false);
    expect(document.activeElement).toBe(pill(el));
    net(true);
  });

  it("vacío: «Todo está al día»", async () => {
    const el = mount();
    el.show();
    expect(el.querySelector(".nx-sync__empty")!.textContent).toMatch(/Todo está al día/);
  });

  it("descartar pide confirmación (Esc la cancela) y saca la operación", async () => {
    const el = mount();
    net(false);
    await enqueue("Pedido X");
    el.show();
    btn(el, /^Descartar · Pedido X/).click();
    expect(el.querySelector(".nx-sync__ask")!.textContent).toBe("¿Descartar? No se enviará.");
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cancelar · Pedido X");
    pop(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(el.querySelector(".nx-sync__ask")).toBeNull();
    expect(el.open).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Descartar · Pedido X");
    btn(el, /^Descartar · Pedido X/).click();
    btn(el, /^Descartar · Pedido X/).click();
    await vi.waitFor(() => expect(el.pending).toBe(0));
    expect(el.querySelector(".nx-sync__op")).toBeNull();
    net(true);
  });

  it("409: «1 conflicto» en rojo; el comparador muestra lo distinto campo por campo y reenvía lo elegido con If-Match", async () => {
    const el = mount();
    el.fields = [{ key: "productos.*.cantidad", label: "Cantidad · {nombre}" }, { key: "notas", label: "Observaciones" }];
    const server = { ...PEDIDO, productos: [{ nombre: "Arroz 500 g", cantidad: 30 }, PEDIDO.productos[1]], notas: "Llamó la dueña" };
    replies.push(() => res(409, { server, fields: ["productos.0.cantidad"], etag: 'W/"v7"', message: "Televentas cambió el pedido" }));
    const op = await enqueue();
    await vi.waitFor(() => expect(el.conflicts).toBe(1));
    expect(el.dataset.state).toBe("alert");
    expect(pill(el).textContent).toBe("1 conflicto");
    expect(live(el)).toBe("Conflicto en «Pedido · Tienda La Esquina»: hay que resolverlo.");
    el.show();
    const row = el.querySelector(".nx-sync__op")!;
    expect(row.querySelector(".nx-sync__why")!.textContent).toBe("Televentas cambió el pedido");
    btn(el, /^Resolver · /).click();
    expect(document.activeElement?.textContent).toBe("Resolver conflicto");
    const sets = [...el.querySelectorAll("fieldset")];
    expect(sets.map((f) => f.querySelector("legend")!.textContent)).toEqual(["Cantidad · Arroz 500 g", "Observaciones"]);
    expect(sets[0].hasAttribute("data-hot")).toBe(true);
    expect([...sets[0].querySelectorAll(".nx-sync__val")].map((v) => v.textContent)).toEqual(["24", "30"]);
    expect(sets[0].querySelector("mark")!.textContent).toBe("24");
    expect(sets[1].querySelector("[data-blank]")!.textContent).toBe("(vacío)");
    expect(el.querySelector(".nx-sync__same")!.textContent).toBe("4 campos iguales no se muestran.");
    // Por defecto, lo mío; «todo lo del servidor» y luego una observación mía.
    expect([...el.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value)).toEqual(["mine", "mine"]);
    btn(el, /^Todo lo del servidor$/).click();
    expect([...el.querySelectorAll<HTMLInputElement>("input:checked")].map((i) => i.value)).toEqual(["theirs", "theirs"]);
    const mineNotes = sets[1].querySelector<HTMLInputElement>('input[value="mine"]')!;
    mineNotes.checked = true;
    mineNotes.dispatchEvent(new Event("change", { bubbles: true }));
    btn(el, /^Enviar versión resuelta$/).click();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    const h = calls[1].init.headers as Record<string, string>;
    expect(h["If-Match"]).toBe('W/"v7"');
    expect(h["Idempotency-Key"]).toBe(`${op.id}.1`);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ ...PEDIDO, productos: [{ nombre: "Arroz 500 g", cantidad: 30 }, PEDIDO.productos[1]] });
    await vi.waitFor(() => expect(el.conflicts).toBe(0));
    expect(el.querySelector("h2")!.textContent).toBe("Sincronización");
  });

  it("4xx: «rechazado» con el mensaje; se corrige el JSON (validado) y se reintenta", async () => {
    const el = mount();
    replies.push(() => res(422, { message: "Superó el cupo de crédito" }));
    await enqueue("Pedido · Doña Carmen");
    await vi.waitFor(() => expect(el.state.failed).toBe(1));
    expect(pill(el).textContent).toBe("1 no se pudo enviar");
    expect(live(el)).toBe("No se pudo enviar «Pedido · Doña Carmen».");
    el.show();
    expect(el.querySelector(".nx-sync__tag")!.textContent).toBe("Rechazado");
    expect(el.querySelector(".nx-sync__why")!.textContent).toBe("Superó el cupo de crédito");
    btn(el, /^Corregir · /).click();
    const ta = el.querySelector("textarea")!;
    expect(JSON.parse(ta.value)).toEqual(PEDIDO);
    expect(el.querySelector(`label[for="${ta.id}"]`)!.textContent).toBe("Datos (JSON)");
    ta.value = "{ roto";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ta.getAttribute("aria-invalid")).toBe("true");
    expect(el.querySelector(".nx-sync__bad")!.textContent).toMatch(/^No es JSON válido/);
    btn(el, /^Reintentar con estos datos$/).click();
    expect(calls).toHaveLength(1);
    ta.value = JSON.stringify({ ...PEDIDO, productos: [PEDIDO.productos[0]] });
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ta.hasAttribute("aria-invalid")).toBe(false);
    btn(el, /^Reintentar con estos datos$/).click();
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    expect(JSON.parse(String(calls[1].init.body)).productos).toHaveLength(1);
    await vi.waitFor(() => expect(el.state.failed).toBe(0));
  });

  it("503: en espera con cuenta regresiva; «Reintentar ya» no espera", async () => {
    const el = mount();
    replies.push(() => new Response('{"message":"Ocupado"}', { status: 503, headers: { "Retry-After": "30" } }));
    await enqueue("Pedido lento");
    await vi.waitFor(() => expect(el.dataset.state).toBe("waiting"));
    expect(pill(el).textContent).toMatch(/^Reintento en (30|29) s · 1 pendiente$/);
    el.show();
    expect(el.querySelector("[data-next]")!.textContent).toMatch(/^reintento en (30|29) s$/);
    expect(el.querySelector(".nx-sync__why")!.textContent).toBe("El servidor no responde (503)");
    btn(el, /^Reintentar ya · Pedido lento$/).click();
    await vi.waitFor(() => expect(el.pending).toBe(0));
    expect(calls).toHaveLength(2);
    // Lo enviado se ve un momento con su ✓.
    expect(el.querySelector('.nx-sync__op[data-status="sent"] .nx-sync__tag')!.textContent).toBe("Enviado");
  });

  it("401: la píldora pide iniciar sesión, lo anuncia y emite nx-sync-auth; sigue con cabeceras nuevas", async () => {
    const el = mount();
    const auth: string[] = [];
    el.addEventListener("nx-sync-auth", (e) => auth.push(e.detail.op.label));
    replies.push(() => res(401));
    await enqueue("Pedido con sesión vencida");
    await vi.waitFor(() => expect(el.state.auth).toBe(true));
    expect(pill(el).textContent).toBe("Inicia sesión para enviar");
    expect(el.dataset.state).toBe("alert");
    expect(live(el)).toMatch(/^La sesión venció/);
    expect(auth).toEqual(["Pedido con sesión vencida"]);
    nxSync.configure({ headers: { Authorization: "Bearer nuevo" } });
    await vi.waitFor(() => expect(el.pending).toBe(0));
    expect(calls).toHaveLength(2);
    nxSync.configure({ headers: {} });
  });

  it("sin label: «Cambio sin nombre» (nunca la URL); en memoria, el panel avisa que no es durable", async () => {
    const el = mount();
    net(false);
    await nxSync.enqueue({ method: "PUT", url: "/clientes/9?token=s3cr3t", body: {} } as never);
    el.show();
    expect(el.querySelector(".nx-sync__label")!.textContent).toBe("Cambio sin nombre");
    expect(el.textContent).not.toContain("s3cr3t");
    expect(el.querySelector(".nx-sync__warn")!.textContent).toMatch(/no deja guardar en el dispositivo/);
    net(true);
  });

  it("ping: solo del mismo origen; también asignado como propiedad antes de definir el elemento", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const conf = vi.spyOn(nxSync, "configure");
    mount(`ping="https://otro.example/ping"`);
    expect(conf).toHaveBeenCalledWith({ ping: null });
    conf.mockClear();
    document.body.innerHTML = "";
    const pre = document.createElement("nx-sync") as NxSync & { ping: string };
    // Una propiedad asignada a un elemento que aún no se actualizó: se recupera al conectarse.
    Object.defineProperty(pre, "ping", { value: "/api/ping", configurable: true, writable: true });
    document.body.append(pre);
    expect(pre.getAttribute("ping")).toBe("/api/ping");
    expect(conf).toHaveBeenCalledWith({ ping: expect.stringMatching(/^(https?:\/\/[^/]+)?\/api\/ping$/) });
    conf.mockRestore();
    warn.mockRestore();
    nxSync.configure({ ping: null });
  });

  it("labels y fields por atributo JSON", async () => {
    const el = mount(`labels='{"online":"Conectado"}' fields='[{"key":"a","label":"A"}]'`);
    await vi.waitFor(() => expect(pill(el).textContent).toBe("Conectado"));
    expect(el.fields).toEqual([{ key: "a", label: "A" }]);
    expect(el.labels.offline).toBe("Sin conexión");
  });
});
