/**
 * Galería: «Pedidos en ruta», la demo de `<nx-sync>` y `nxSync`. Un vendedor de una distribuidora
 * de Barranquilla toma pedidos en las tiendas de su ruta; la señal va y viene, y nada se pierde.
 *
 * El «servidor» (`/demo/sync/*`) corre en el navegador (`addDemoRoute`):
 * - `GET /demo/sync/ping` → 200: hay conexión.
 * - `POST /demo/sync/pedidos` → 201 `{numero, total}` después de una pausa real. Con «Red
 *   inestable», a veces 503 con `Retry-After`, y a veces guarda el pedido pero la respuesta se
 *   pierde en el camino: el reintento trae la misma `Idempotency-Key` y no se duplica.
 * - Minimercado El Progreso (o todos, con el interruptor de conflicto): 409 con la versión del
 *   servidor, porque televentas ya había cambiado la cantidad. La versión resuelta llega con
 *   `If-Match` y se acepta.
 * - Tienda Doña Carmen tiene cupo de $ 250.000: un pedido mayor es un 422 que se corrige a mano.
 *
 * La API de demostración solo modela estado y tipo de contenido; las cabeceras (`Idempotency-Key`,
 * `If-Match`, `Retry-After`) y la red «caída» las pone un envoltorio de `fetch` de esta página.
 */
import { addDemoRoute, type DemoOut } from "./demo-api";
import "../src/components/sync/index";
import { nxSync, type NxSync, type SyncField, type SyncJson } from "../src/components/sync/index";

export interface Tienda {
  nit: string;
  nombre: string;
  barrio: string;
}
export interface Producto {
  sku: string;
  nombre: string;
  precio: number;
}
export interface Pedido {
  cliente: Tienda;
  productos: { sku: string; nombre: string; cantidad: number; precio: number }[];
  observaciones: string;
  vendedor: string;
  tomadoEn: string;
}

export const VENDEDOR = "Camilo Ríos · Ruta BAQ-07";
export const TIENDAS: Tienda[] = [
  { nit: "900.412.118-3", nombre: "Tienda La Esquina de Rosa", barrio: "El Prado" },
  { nit: "901.087.554-1", nombre: "Minimercado El Progreso", barrio: "Rebolo" },
  { nit: "900.763.209-8", nombre: "Autoservicio San José", barrio: "Boston" },
  { nit: "1.045.678.332", nombre: "Tienda Doña Carmen", barrio: "La Victoria" },
  { nit: "901.334.870-6", nombre: "Surtitodo La 72", barrio: "Alto Prado" },
];
export const PRODUCTOS: Producto[] = [
  { sku: "ARZ-500", nombre: "Arroz blanco 500 g", precio: 2_900 },
  { sku: "ACE-1000", nombre: "Aceite de girasol 1 L", precio: 11_400 },
  { sku: "PAN-500", nombre: "Panela 500 g", precio: 3_200 },
  { sku: "CAF-250", nombre: "Café molido 250 g", precio: 9_800 },
  { sku: "HAR-1000", nombre: "Harina de maíz 1 kg", precio: 4_600 },
  { sku: "LEC-1100", nombre: "Leche entera 1,1 L", precio: 4_300 },
  { sku: "ATU-170", nombre: "Atún en aceite 170 g", precio: 6_900 },
  { sku: "JAB-300", nombre: "Jabón de barra 300 g", precio: 2_700 },
];
/** Los nombres de los campos del pedido para el comparador. */
export const PEDIDO_FIELDS: SyncField[] = [
  { key: "productos.*.cantidad", label: "Cantidad · {nombre}" },
  { key: "productos.*.nombre", label: "Producto" },
  { key: "productos.*.sku", label: "Código" },
  { key: "productos.*.precio", label: "Precio · {nombre}" },
  { key: "observaciones", label: "Observaciones" },
  { key: "cliente.nombre", label: "Cliente" },
  { key: "vendedor", label: "Tomado por" },
];
const CONFLICTO = "901.087.554-1";
const CUPO = { nit: "1.045.678.332", monto: 250_000 };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (n: number) => `$ ${n.toLocaleString("es-CO")}`;
export const totalDe = (p: Pick<Pedido, "productos">) => p.productos.reduce((s, x) => s + x.cantidad * x.precio, 0);

// ---------------------------------------------------------------- el servidor de mentira

/** Los interruptores de la página. */
export const sim = { offline: false, conflict: false, flaky: true };
/** Lo que el servidor ya confirmó: `Idempotency-Key` → respuesta (un reintento recibe la misma). */
const seen = new Map<string, { numero: string; total: number; cliente: string; items: number; at: string }>();
/** La versión de cada pedido del día en conflicto: la etiqueta y lo que cambió televentas. */
const versions = new Map<string, string>();
let numero = 2040;
let onConfirm: ((p: { numero: string; total: number; cliente: string; items: number; at: string; replay: boolean }) => void) | null = null;

/** Lo que el envoltorio de `fetch` le pasa al manejador (se lee al entrar, antes de cualquier espera). */
type Ctx = { headers: Headers; out: Record<string, string>; lost?: boolean };
let current: Ctx | null = null;

const reply = (out: DemoOut, status: number, body: unknown) => {
  out.status(status);
  out.type("application/json");
  out.end(JSON.stringify(body));
};

addDemoRoute("/demo/sync", async (req, out) => {
  const ctx = current ?? { headers: new Headers(), out: {} };
  if (req.url.pathname.endsWith("/ping")) return reply(out, 200, { ok: true });
  if (req.method !== "POST") return reply(out, 405, { message: "Método no permitido" });
  await sleep(350 + Math.random() * 550);
  const key = ctx.headers.get("Idempotency-Key") ?? "";
  const done = seen.get(key);
  if (done) {
    // Ya estaba: la misma respuesta, sin crear otro pedido.
    onConfirm?.({ ...done, replay: true });
    return reply(out, 201, { ...done, replay: true });
  }
  if (sim.flaky && Math.random() < 0.18) {
    ctx.out["Retry-After"] = String(2 + Math.floor(Math.random() * 3));
    return reply(out, 503, { message: "El servidor de pedidos está ocupado" });
  }
  let p: Pedido;
  try {
    p = JSON.parse(req.body);
  } catch {
    return reply(out, 400, { message: "El pedido no es JSON" });
  }
  if (!p?.cliente?.nit || !Array.isArray(p.productos) || !p.productos.length) return reply(out, 422, { message: "El pedido no tiene productos" });
  if (p.productos.some((x) => !(x.cantidad > 0))) return reply(out, 422, { message: "Hay cantidades en cero o negativas" });
  const total = totalDe(p);
  if (p.cliente.nit === CUPO.nit && total > CUPO.monto) return reply(out, 422, { message: `${p.cliente.nombre} superó su cupo de crédito (${money(CUPO.monto)}): el pedido suma ${money(total)}` });

  const nit = p.cliente.nit;
  const etag = versions.get(nit);
  const conflicted = sim.conflict || (nit === CONFLICTO && !versions.has(`${nit}:ok`));
  if (conflicted && (!etag || ctx.headers.get("If-Match") !== etag)) {
    // Televentas ya tomó el pedido de hoy por teléfono y subió la cantidad del primer producto.
    const tag = `W/"${nit}-${Date.now().toString(36)}"`;
    versions.set(nit, tag);
    const server: Pedido = JSON.parse(JSON.stringify(p));
    server.productos[0].cantidad += 6;
    server.observaciones = "Doña Marta llamó: 6 más del primero. Entregar antes de las 10 a. m.";
    server.vendedor = "Luis Pérez · Televentas";
    return reply(out, 409, {
      message: `Luis Pérez (televentas) cambió el pedido de hoy de ${p.cliente.nombre} hace 5 min`,
      server,
      fields: [{ key: "productos.0.cantidad", label: `Cantidad · ${p.productos[0].nombre}` }],
      etag: tag,
    });
  }
  if (conflicted) versions.set(`${nit}:ok`, "1");
  const ok = { numero: `PED-${++numero}`, total, cliente: p.cliente.nombre, items: p.productos.length, at: new Date().toISOString() };
  seen.set(key, ok);
  onConfirm?.({ ...ok, replay: false });
  // A veces el pedido se guarda y la respuesta no llega: el reintento no lo duplica.
  if (sim.flaky && Math.random() < 0.12) ctx.lost = true;
  reply(out, 201, ok);
});

let wrapped = false;
/** Envuelve `fetch` para `/demo/sync/`: la red «caída», y las cabeceras que la API de demo no modela. */
function wrapFetch(): void {
  if (wrapped || typeof window === "undefined") return;
  wrapped = true;
  const inner = window.fetch;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes("/demo/sync")) return inner(input, init);
    if (sim.offline) {
      // Sin señal el teléfono tarda un poco en rendirse.
      await sleep(250 + Math.random() * 350);
      throw new TypeError("Failed to fetch");
    }
    const ctx: Ctx = (current = { headers: new Headers(init?.headers), out: {} });
    // El manejador arranca aquí mismo (síncrono) y lee `current` antes de su primera espera.
    const p = inner(input, init);
    current = null;
    const res = await p;
    if (ctx.lost) {
      await res.text();
      throw new TypeError("Failed to fetch");
    }
    if (!Object.keys(ctx.out).length) return res;
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(ctx.out)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  }) as typeof fetch;
}

// ---------------------------------------------------------------- la página

type Line = { sku: string; cantidad: number };

export function mountSyncDemo(root: HTMLElement): void {
  wrapFetch();
  sim.offline = false;
  sim.conflict = false;
  sim.flaky = true;
  const pill = root.querySelector<NxSync>("#sync-demo")!;
  pill.fields = PEDIDO_FIELDS;
  const form = root.querySelector<HTMLFormElement>("#sync-form")!;
  const cliente = form.querySelector<HTMLSelectElement>("[name=cliente]")!;
  const linesEl = form.querySelector<HTMLOListElement>(".sync-lines")!;
  const totalEl = form.querySelector<HTMLElement>(".sync-total strong")!;
  const notes = form.querySelector<HTMLTextAreaElement>("[name=observaciones]")!;
  const confirmed = root.querySelector<HTMLOListElement>("#sync-confirmed")!;
  const count = root.querySelector<HTMLElement>("#sync-count")!;
  const log = root.querySelector<HTMLOListElement>("#sync-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  cliente.replaceChildren(...TIENDAS.map((t) => new Option(`${t.nombre} · ${t.barrio}`, t.nit)));
  let lines: Line[] = [
    { sku: "ARZ-500", cantidad: 24 },
    { sku: "ACE-1000", cantidad: 6 },
  ];
  const paint = () => {
    linesEl.replaceChildren(
      ...lines.map((l, i) => {
        const li = document.createElement("li");
        li.className = "sync-line";
        const sel = document.createElement("select");
        sel.setAttribute("aria-label", `Producto ${i + 1}`);
        sel.dataset.i = String(i);
        sel.append(...PRODUCTOS.map((p) => new Option(`${p.nombre} · ${money(p.precio)}`, p.sku, false, p.sku === l.sku)));
        const qty = document.createElement("input");
        Object.assign(qty, { type: "number", min: "1", step: "1", inputMode: "numeric", value: String(l.cantidad) });
        qty.setAttribute("aria-label", `Cantidad de ${PRODUCTOS.find((p) => p.sku === l.sku)!.nombre}`);
        qty.dataset.i = String(i);
        const del = document.createElement("button");
        Object.assign(del, { type: "button", className: "sync-line__del", textContent: "×" });
        del.setAttribute("aria-label", `Quitar ${PRODUCTOS.find((p) => p.sku === l.sku)!.nombre}`);
        del.dataset.del = String(i);
        del.disabled = lines.length < 2;
        li.append(sel, qty, del);
        return li;
      }),
    );
    totalEl.textContent = money(totalDe({ productos: lines.map((l) => ({ ...l, nombre: "", precio: PRODUCTOS.find((p) => p.sku === l.sku)!.precio })) }));
  };
  paint();
  linesEl.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement | HTMLSelectElement;
    const i = Number(t.dataset.i);
    if (t.tagName === "SELECT") lines[i].sku = t.value;
    else lines[i].cantidad = Math.max(1, Math.round(Number(t.value)) || 1);
    paint();
    linesEl.querySelectorAll<HTMLElement>(`[data-i="${i}"]`)[t.tagName === "SELECT" ? 0 : 1]?.focus();
  });
  linesEl.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.type !== "number") return;
    lines[Number(t.dataset.i)].cantidad = Math.max(0, Number(t.value) || 0);
    totalEl.textContent = money(totalDe({ productos: lines.map((l) => ({ ...l, nombre: "", precio: PRODUCTOS.find((p) => p.sku === l.sku)!.precio })) }));
  });
  linesEl.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-del]");
    if (!b) return;
    lines.splice(Number(b.dataset.del), 1);
    paint();
    linesEl.querySelector<HTMLElement>("select")?.focus();
  });
  form.querySelector("[data-add]")!.addEventListener("click", () => {
    const next = PRODUCTOS.find((p) => !lines.some((l) => l.sku === p.sku)) ?? PRODUCTOS[0];
    lines.push({ sku: next.sku, cantidad: 12 });
    paint();
    linesEl.querySelectorAll<HTMLInputElement>("input")[lines.length - 1]?.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const t = TIENDAS.find((x) => x.nit === cliente.value)!;
    const pedido: Pedido = {
      cliente: t,
      productos: lines.map((l) => {
        const p = PRODUCTOS.find((x) => x.sku === l.sku)!;
        return { sku: p.sku, nombre: p.nombre, cantidad: l.cantidad, precio: p.precio };
      }),
      observaciones: notes.value.trim(),
      vendedor: VENDEDOR,
      tomadoEn: new Date().toISOString(),
    };
    let op;
    try {
      op = await nxSync.enqueue({ method: "POST", url: "/demo/sync/pedidos", body: pedido as unknown as SyncJson, label: `Pedido · ${t.nombre}`, group: t.nit });
    } catch (e) {
      // No se pudo guardar en el dispositivo (disco lleno): el pedido no entró a la cola.
      return add(`nxSync.enqueue ✗ ${(e as Error).message}`);
    }
    add(`nxSync.enqueue → ${op.label} · ${money(totalDe(pedido))}`);
    // Siguiente tienda de la ruta, como en la calle.
    cliente.selectedIndex = (cliente.selectedIndex + 1) % TIENDAS.length;
    notes.value = "";
    const btn = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    btn.dataset.ok = "";
    setTimeout(() => delete btn.dataset.ok, 1200);
  });

  // Los interruptores.
  for (const sw of root.querySelectorAll<HTMLButtonElement>("[data-sim]")) {
    const k = sw.dataset.sim as keyof typeof sim;
    sw.setAttribute("aria-checked", String(sim[k]));
    sw.addEventListener("click", () => {
      sim[k] = !sim[k];
      sw.setAttribute("aria-checked", String(sim[k]));
      // Sin señal (o de vuelta): la cola lo comprueba con su `ping` en el acto.
      if (k === "offline") void nxSync.check();
    });
  }

  let n = 0;
  onConfirm = (p) => {
    if (!root.isConnected) return void (onConfirm = null);
    if (p.replay && confirmed.querySelector(`[data-n="${p.numero}"]`)) {
      const li = confirmed.querySelector<HTMLElement>(`[data-n="${p.numero}"]`)!;
      if (!li.querySelector(".sync-conf__replay")) li.querySelector(".sync-conf__meta")!.append(Object.assign(document.createElement("span"), { className: "sync-conf__replay", textContent: "reintento sin duplicar" }));
      return;
    }
    count.textContent = String(++n);
    const li = document.createElement("li");
    li.className = "sync-conf";
    li.dataset.n = p.numero;
    const time = new Date(p.at).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
    li.innerHTML = '<span class="sync-conf__n"></span><span class="sync-conf__who"></span><span class="sync-conf__meta"></span><strong class="sync-conf__total"></strong>';
    li.children[0].textContent = p.numero;
    li.children[1].textContent = p.cliente;
    li.children[2].textContent = `${p.items} ${p.items === 1 ? "producto" : "productos"} · ${time}`;
    li.children[3].textContent = money(p.total);
    confirmed.prepend(li);
  };

  pill.addEventListener("nx-sync-change", (e) => add(`nx-sync-change → ${JSON.stringify(e.detail)}`));
  pill.addEventListener("nx-sync-done", (e) => add(`nx-sync-done → ${e.detail.op.label} · ${(e.detail.data as { numero?: string })?.numero ?? ""}`));
}
