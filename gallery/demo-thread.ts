/**
 * Galería: `<nx-thread>`. La conversación de la OC-2291 al lado de su formulario: 8 comentarios de
 * 3 personas en 3 días, con una mención, una referencia a la FV-1873 y una conversación resuelta
 * sobre el descuento. «Descuento» y «Fecha de entrega» llevan su globito.
 *
 * La API es de mentira y vive en esta pestaña (`addDemoRoute("/demo/thread", …)`): la lista, el
 * POST/PATCH/DELETE, las personas, los registros y un stream NDJSON que, con «En vivo» encendido,
 * trae cada tanto un comentario de Laura Gómez precedido de su «escribiendo…». Laura también
 * «entra» al registro por el `<nx-presence>` de la cabecera, del que el hilo lee quién está viendo.
 */
import "../src/components/thread/index";
import "../src/components/presence/index";
// Mientras `nx-ui.css` no lo importe (se agrega al unir; ver INTEGRATION.md).
import type { NxPresence } from "../src/components/presence/index";
import type { NxThread, ThreadComment } from "../src/components/thread/index";
import { addDemoRoute, type DemoOut } from "./demo-api";

const ME = { id: "u7", name: "Diego Llinás" };
const LAURA = { id: "u12", name: "Laura Gómez" };
const ANDRES = { id: "u3", name: "Andrés Ruiz" };
const PEOPLE = [
  { ...LAURA, detail: "Analista de compras" },
  { ...ANDRES, detail: "Comprador · Planta Malambo" },
  { ...ME, detail: "Jefe de compras" },
  { id: "u14", name: "Laura Restrepo", detail: "Tesorería" },
  { id: "u21", name: "Sofía Castaño", detail: "Contabilidad" },
  { id: "u22", name: "Julián Ospina", detail: "Calidad · Planta Malambo" },
];
const REFS = [
  { id: "fv-1873", label: "FV-1873", detail: "Factura de Aceros del Caribe · $ 48.730.000", href: "#/thread" },
  { id: "oc-2291", label: "OC-2291", detail: "Orden de compra · Por aprobar", href: "#/thread" },
  { id: "oc-2310", label: "OC-2310", detail: "Orden de compra · Empaques Andinos", href: "#/thread" },
  { id: "rm-4471", label: "REM-4471", detail: "Remisión · Recibida el 12 sep", href: "#/thread" },
];
/** Lo que dice Laura cuando el stream está encendido (en orden, y vuelve a empezar). */
const LAURA_SAYS = [
  "Calidad pide el certificado de las varillas antes de recibir. ¿@[Andrés Ruiz](u3) lo tiene?",
  "Ya cargué el certificado en la OC-2291. Quedo atenta.",
  "La FV-1873 pasa a pago el viernes si nadie tiene objeciones.",
];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una fecha local de hace `d` días a las `h:m` (la de hoy nunca queda en el futuro). */
function at(d: number, h: number, m = 0): string {
  const now = new Date();
  const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - d, h, m);
  return (d === 0 && t > now ? new Date(now.getTime() - 20 * 60e3) : t).toISOString();
}

function seed(): ThreadComment[] {
  return [
    { id: "t1", author: ANDRES, text: "Creé la OC-2291 con la cotización de Aceros del Caribe. Queda pendiente la aprobación.", at: at(2, 9, 12) },
    { id: "t2", author: LAURA, text: "¿Por qué este descuento del 12 %? En la cotización venía el 8 %.", at: at(2, 10, 40), anchor: "descuento", resolved: true, resolvedBy: LAURA.name },
    { id: "t3", author: ANDRES, text: "Lo negociamos por volumen: son 120 varillas más que en la orden anterior.", at: at(2, 11, 5), replyTo: "t2" },
    { id: "t4", author: LAURA, text: "Perfecto, así cuadra. Lo dejo resuelto.", at: at(2, 11, 20), replyTo: "t3" },
    { id: "t5", author: ME, text: "@[Andrés Ruiz](u3) ¿el proveedor confirma la entrega para el 5 de octubre?", at: at(1, 15, 30), anchor: "entrega" },
    { id: "t6", author: ANDRES, text: "Sí, confirmado por correo. Te dejo la factura anticipada: #[FV-1873](fv-1873)", at: at(1, 16, 2), replyTo: "t5", refs: [REFS[0]] },
    { id: "t7", author: LAURA, text: "Revisé la #[FV-1873](fv-1873): el valor coincide con la orden.\nEl soporte está en https://erp.crear.co/compras/oc-2291", at: at(0, 8, 15), refs: [REFS[0]] },
    { id: "t8", author: ANDRES, text: "Ya la subí a aprobación. Faltan las observaciones de calidad.", at: at(0, 9, 5), editedAt: at(0, 9, 20) },
  ];
}

// ---------------------------------------------------------------- el servidor de mentira

let db = seed();
let seq = 100;
let live = false;
let failNext = false;
let said = 0;
/** Quienes escuchan el stream ahora mismo (una pestaña puede tener varios hilos). */
const listeners = new Set<(o: unknown) => void>();
const broadcast = (o: unknown) => listeners.forEach((f) => f(o));

// Al importar el módulo, como las demás demos con API: el hilo pide sus comentarios apenas se
// conecta, antes de que corra `mountThreadDemo`.
addDemoRoute("/demo/thread", async (req, out) => {
  const path = req.url.pathname.slice(req.url.pathname.indexOf("/demo/thread") + "/demo/thread".length);
  const body = (() => {
    try {
      return JSON.parse(req.body || "{}");
    } catch {
      return {};
    }
  })();
  // (Sin 204: `new Response(cuerpo, {status: 204})` lanza; un servidor real sí puede usarlo.)
  const reply = (o: unknown, status = 200) => {
    out.status(status);
    out.type("application/json");
    out.end(JSON.stringify(o));
  };
  if (path === "/stream") return stream(out);
  await sleep(req.method === "GET" ? 250 : 450);
  const q = fold(req.url.searchParams.get("q") ?? "");
  if (path === "/personas") return reply(PEOPLE.filter((p) => fold(`${p.name} ${p.detail}`).includes(q)).slice(0, 6));
  if (path === "/referencias") return reply(REFS.filter((r) => fold(`${r.label} ${r.detail}`).includes(q.replace(/^#/, ""))));
  if (path === "/comentarios/typing") return reply({ ok: true });
  if (path === "/comentarios" && req.method === "GET") return reply(db);
  if (path === "/comentarios" && req.method === "POST") {
    if (failNext) {
      failNext = false;
      return reply({ error: "Servicio no disponible" }, 503);
    }
    // Un reintento con el mismo clientId no duplica.
    const again = db.find((c) => c.clientId && c.clientId === body.clientId);
    if (again) return reply(again);
    const c: ThreadComment = { id: `t${++seq}`, author: ME, text: String(body.text ?? ""), at: new Date().toISOString(), clientId: body.clientId };
    if (body.anchor) c.anchor = body.anchor;
    if (body.replyTo) c.replyTo = body.replyTo;
    db = [...db, c];
    return reply(c);
  }
  const id = decodeURIComponent(path.replace(/^\/comentarios\//, ""));
  const i = db.findIndex((c) => c.id === id);
  if (i < 0) return reply({ error: "No existe" }, 404);
  if (req.method === "DELETE") {
    db = db.filter((c) => c.id !== id);
    return reply({ ok: true });
  }
  if (req.method === "PATCH") {
    const c = { ...db[i] };
    if (typeof body.text === "string") (c.text = body.text), (c.editedAt = new Date().toISOString());
    if (body.resolved === true) (c.resolved = true), (c.resolvedBy = ME.name);
    if (body.resolved === false) delete c.resolved, delete c.resolvedBy;
    db = db.map((x) => (x.id === id ? c : x));
    return reply(c);
  }
  reply({ error: "Método no permitido" }, 405);
});

/** El stream NDJSON: queda abierto; lo que manda lo decide el guion de Laura. */
async function stream(out: DemoOut): Promise<void> {
  out.type("application/x-ndjson");
  const send = (o: unknown) => !out.closed() && out.write(`${JSON.stringify(o)}\n`);
  listeners.add(send);
  send({ type: "hello" });
  while (!out.closed()) await sleep(1000);
  listeners.delete(send);
}

/** El guion de Laura: «escribiendo…» unos segundos y luego su comentario. Mientras «En vivo» siga encendido. */
async function lauraLoop(isOn: () => boolean, onSay: (text: string) => void): Promise<void> {
  await sleep(2500);
  while (isOn()) {
    for (let i = 0; i < 3 && isOn(); i++) {
      broadcast({ type: "typing", user: LAURA });
      await sleep(1800);
    }
    if (!isOn()) return;
    const text = LAURA_SAYS[said++ % LAURA_SAYS.length];
    const c: ThreadComment = { id: `t${++seq}`, author: LAURA, text, at: new Date().toISOString() };
    db = [...db, c];
    broadcast({ type: "comment", comment: c });
    onSay(text);
    for (let t = 0; t < 14 && isOn(); t++) await sleep(1000);
  }
}

// ---------------------------------------------------------------- la página

export function mountThreadDemo(root: HTMLElement): void {
  const thread = root.querySelector<NxThread>("#hilo-thread")!;
  const presence = root.querySelector<NxPresence>("#hilo-presence")!;
  const log = root.querySelector<HTMLOListElement>("#hilo-log")!;
  const liveBtn = root.querySelector<HTMLButtonElement>("#hilo-live")!;
  const failBtn = root.querySelector<HTMLButtonElement>("#hilo-fail")!;
  const resetBtn = root.querySelector<HTMLButtonElement>("#hilo-reset")!;

  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 8) log.lastElementChild!.remove();
  };

  // La primera visita a la demo ya «vio» hasta ayer: así se ve la marca «Nuevos».
  try {
    const key = `nx-thread-seen:OC-2291:${ME.id}`;
    if (!localStorage.getItem(key)) localStorage.setItem(key, String(new Date(at(1, 18)).getTime()));
  } catch {
    /* sin almacenamiento: sin marca */
  }

  presence.me = ME;
  thread.addEventListener("nx-thread-post", (e) => add(`nx-thread-post → «${e.detail.text.slice(0, 48)}»${e.detail.anchor ? ` · sobre ${e.detail.anchor}` : ""}${e.detail.replyTo ? ` · responde a ${e.detail.replyTo}` : ""}`));
  thread.addEventListener("nx-thread-change", (e) => add(`nx-thread-change → ${e.detail.comments.length} comentarios`));
  thread.addEventListener("nx-thread-mention", (e) => add(`nx-thread-mention → ${e.detail.people.map((p) => p.name).join(", ")} (la app avisaría por correo o en <nx-inbox>)`));
  thread.addEventListener("nx-thread-error", (e) => add(`nx-thread-error → ${e.detail.action}: ${e.detail.message}`));

  let on = false;
  let beat = 0;
  const setLive = (v: boolean) => {
    on = live = v;
    liveBtn.setAttribute("aria-pressed", String(v));
    liveBtn.querySelector("span")!.textContent = v ? "En vivo: encendido" : "En vivo: apagado";
    clearInterval(beat);
    if (v) {
      // Laura abre el registro: la ve <nx-presence> y el hilo lo cuenta («Laura está viendo»).
      const hi = () => presence.push({ type: "heartbeat", user: LAURA, field: null, editing: false, idle: false });
      presence.push({ type: "join", user: LAURA });
      beat = window.setInterval(() => (root.isConnected ? hi() : clearInterval(beat)), 15_000);
      void lauraLoop(
        () => on && live && root.isConnected,
        (text) => add(`stream → Laura Gómez: «${text.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1").slice(0, 48)}»`),
      );
    } else presence.push({ type: "leave", user: LAURA });
  };
  liveBtn.addEventListener("click", () => setLive(!on));
  failBtn.addEventListener("click", () => {
    failNext = !failNext;
    failBtn.setAttribute("aria-pressed", String(failNext));
    add(failNext ? "El próximo envío va a fallar (503): prueba «Reintentar»" : "Red normal");
  });
  resetBtn.addEventListener("click", () => {
    db = seed();
    void thread.reload();
    add("Conversación restaurada");
  });
  setLive(false);
}
