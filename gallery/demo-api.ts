/**
 * El «backend» de la galería, en el navegador. Atiende las rutas `/demo/*` que usan los ejemplos
 * (IA, captura, tabla, agente, impacto, paleta, desgloses, tablero, historial…) con las mismas
 * respuestas y pausas que tendría un servidor real, en NDJSON, SSE o JSON.
 *
 * Así la galería funciona igual en `npm run dev` y publicada como archivos estáticos (GitHub
 * Pages): `installDemoApi()` envuelve `fetch` y lo que va a `/demo/` se responde aquí. No es parte
 * de la librería.
 */
import { searchOptions } from "../src/components/select/logic";
import type { RunAgentInput } from "../src/components/agent/types";
import { agentRun } from "./demo-agent";
import { EMPLOYEE_FIELDS, EMPLOYEES } from "./demo-data";
import { aiCell, purchasePage } from "./demo-grid";
import { ocHistoryPage } from "./demo-history";
import { hrEmployees, hrExitImpact } from "./demo-hr";
import { invoiceEvents, invoiceSvg } from "./demo-invoice";
import { kanbanImpact } from "./demo-kanban";
import { EXPLAIN, INBOX_IMPACT, commandSearch } from "./demo-next";

type Line = Record<string, unknown>;
type Req = { url: URL; method: string; body: string };
/** Lo que un manejador escribe: cabeceras, trozos y el final. `closed()` dice si quien pidió ya se fue. */
type Out = { type(t: string): void; status(n: number): void; write(s: string): void; end(s?: string): void; closed(): boolean };
type Handler = (req: Req, out: Out) => Promise<void>;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const json = (s: string) => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};
const ndjson = (out: Out) => {
  out.type("application/x-ndjson");
  return (o: unknown) => !out.closed() && out.write(`${JSON.stringify(o)}
`);
};

// ---------------------------------------------------------------- IA (<nx-ai-answer>)

const aiScript = (q: string): { steps: [string, string, string?][]; sources: Line[]; text: string; notes: Line[]; actions: Line[] } => {
  const t = q.toLowerCase();
  if (/proveedor|retras|entreg/.test(t))
    return {
      steps: [["s1", "Consultando órdenes de compra de septiembre", "212 órdenes"], ["s2", "Cruzando fechas de entrega con recepciones"], ["s3", "Agrupando retrasos por proveedor", "3 proveedores"]],
      sources: [
        { id: "oc2291", title: "OC-2291 · Aceros del Caribe", detail: "recibida el 12 sep, vencía el 5 sep", href: "#/ai" },
        { id: "oc2310", title: "OC-2310 · Empaques Andinos", detail: "recibida el 18 sep, vencía el 14 sep", href: "#/ai" },
        { id: "ctg04", title: "Ruta CTG-04 · Transportes Rivera", detail: "3 de 5 viajes con novedad" },
      ],
      text: "Este mes se retrasaron **3 proveedores**:\n\n- **Aceros del Caribe**: 4 entregas tarde, 6,2 días en promedio[^oc2291].\n- **Empaques Andinos**: 2 entregas tarde[^oc2310].\n- **Transportes Rivera**: solo en la ruta a Cartagena[^ctg04].\n\nAceros del Caribe es el más crítico: sus retrasos detuvieron la línea 2 dos veces.",
      notes: [{ label: "datos de hoy", tone: "neutral" }],
      actions: [{ label: "Ver las 7 órdenes", href: "#/ai" }, { label: "Redactar reclamo a Aceros del Caribe", id: "reclamo", data: { proveedor: "Aceros del Caribe" } }],
    };
  if (/cost|produc|gast/.test(t))
    return {
      steps: [["s1", "Consultando costos de producción · jul–ago", "14 centros de costo"], ["s2", "Comparando contra el presupuesto"], ["s3", "Buscando causas en órdenes y novedades"], ["s4", "Verificando cifras contra el libro mayor"]],
      sources: [
        { id: "mayor", title: "Libro mayor · agosto", detail: "cuentas 7105–7120" },
        { id: "acero", title: "Lista de precios · Aceros del Caribe", detail: "vigente desde el 3 ago" },
        { id: "paro", title: "Novedad N-8812 · paro de la empacadora", detail: "línea 2, 31 h" },
      ],
      text: "El costo de producción de agosto subió **11,4 %**[^mayor] por dos causas:\n\n- El acero laminado aumentó **18 %** desde el 3 de agosto[^acero].\n- La línea 2 perdió **31 horas** por el paro de la empacadora, que se cubrieron con horas extra[^paro].\n\nSin el paro, el alza habría sido de **6,8 %**.",
      notes: [{ label: "cifras verificadas", tone: "success" }],
      actions: [{ label: "Abrir el análisis de costos", href: "#/ai" }],
    };
  return {
    steps: [["s1", "Entendiendo la pregunta"], ["s2", "Buscando en el sistema"]],
    sources: [],
    text: "Esto es una demo con respuestas de ejemplo. Prueba con **«¿Qué proveedores se retrasaron este mes?»** o **«¿Por qué subió el costo de producción en agosto?»**, o incluye la palabra `error` para ver cómo se muestra un fallo.",
    notes: [],
    actions: [],
  };
};

const ai: Handler = async (req, out) => {
  const question = String((json(req.body) as { question?: string }).question ?? "");
  const send = ndjson(out);
  const s = aiScript(question);
  for (const [id, label, detail] of s.steps) {
    send({ type: "step", id, label, status: "run" });
    await sleep(500 + Math.random() * 500);
    send({ type: "step", id, status: "done", ...(detail ? { detail } : {}) });
  }
  if (/error/i.test(question)) {
    send({ type: "text", delta: "Empecé a revisar las órdenes, pero " });
    await sleep(400);
    send({ type: "error", message: "el servicio de compras no respondió (timeout)" });
    return out.end();
  }
  for (const src of s.sources) send({ type: "source", ...src });
  // El texto sale en trozos de 1–3 palabras, como un modelo.
  const words = s.text.split(/(?<=\s)/);
  for (let i = 0; i < words.length && !out.closed(); ) {
    const n = 1 + Math.floor(Math.random() * 3);
    send({ type: "text", delta: words.slice(i, i + n).join("") });
    i += n;
    await sleep(35 + Math.random() * 45);
  }
  for (const n of s.notes) send({ type: "note", ...n });
  for (const a of s.actions) send({ type: "action", ...a });
  send({ type: "done" });
  out.end();
};

// ---------------------------------------------------------------- captura (<nx-doc-capture>)

const captureSvg: Handler = async (_req, out) => {
  out.type("image/svg+xml");
  out.end(invoiceSvg());
};
const captureRegister: Handler = async (_req, out) => {
  await sleep(700);
  out.type("application/json");
  out.end(JSON.stringify({ ok: true }));
};
const capture: Handler = async (req, out) => {
  if (req.method !== "POST") return out.status(405), out.end();
  const send = ndjson(out);
  await sleep(350);
  for (const ev of invoiceEvents()) {
    if (out.closed()) return;
    send(ev);
    const type = (ev as { type: string }).type;
    await sleep(type === "page" ? 500 : type === "check" ? 260 : 90 + Math.random() * 140);
  }
  send({ type: "done" });
  out.end();
};

// ---------------------------------------------------------------- tabla (<nx-grid>)

const gridRows: Handler = async (req, out) => {
  const q = json(req.body);
  await sleep(120 + Math.random() * 180);
  out.type("application/json");
  out.end(JSON.stringify(purchasePage(q)));
};
const gridAi: Handler = async (req, out) => {
  const q = json(req.body) as { rows?: Line[]; prompt?: string };
  const send = ndjson(out);
  const rows = Array.isArray(q.rows) ? [...q.rows] : [];
  rows.sort(() => Math.random() - 0.5);
  await sleep(300);
  for (const row of rows) {
    if (out.closed()) return;
    send({ type: "cell", id: row.id, ...aiCell(String(q.prompt ?? ""), row) });
    await sleep(25 + Math.random() * 70);
  }
  send({ type: "done" });
  out.end();
};

// ---------------------------------------------------------------- impacto, TH y agente

const IMPACT: Record<string, object[]> = {
  "2291": [
    { type: "impact", icon: "truck", label: "2 recepciones en bodega", detail: "se revierten" },
    { type: "impact", icon: "file-text", label: "Factura FE-10482", detail: "queda sin pedido", tone: "warning" },
    { type: "impact", icon: "wallet", label: "Presupuesto de Producción", detail: "+ $ 10.829.000", tone: "success" },
    { type: "note", message: "Se notificará a los 2 aprobadores del pedido." },
  ],
  "2310": [
    { type: "impact", icon: "truck", label: "1 recepción en bodega", detail: "se revierte" },
    { type: "impact", icon: "wallet", label: "Pago EG-3321", detail: "$ 1.450.000", tone: "danger" },
    { type: "block", message: "No se puede anular: el pedido ya tiene un pago (EG-3321). Primero hay que reversar el pago." },
  ],
};
const people = hrEmployees();
const impact: Handler = async (req, out) => {
  const send = ndjson(out);
  await sleep(350);
  for (const ev of IMPACT[req.url.searchParams.get("oc") ?? "2291"] ?? IMPACT["2291"]) {
    if (out.closed()) return;
    send(ev);
    await sleep(260 + Math.random() * 200);
  }
  send({ type: "done" });
  out.end();
};
const retiro: Handler = async (req, out) => {
  const send = ndjson(out);
  const id = req.url.searchParams.get("id");
  await sleep(300);
  for (const ev of hrExitImpact(people.find((p) => p.id === id))) {
    send(ev);
    await sleep(220 + Math.random() * 180);
  }
  send({ type: "done" });
  out.end();
};
/** Un agente AG-UI de guion sobre el directorio (SSE, un evento por `data:`). */
const agent: Handler = async (req, out) => {
  const input = json(req.body) as RunAgentInput;
  if (!input || !Array.isArray(input.messages)) return out.status(400), out.end();
  out.type("text/event-stream");
  for (const ev of agentRun(input, people)) {
    if (out.closed()) return;
    if (ev.type === "PAUSE") {
      await sleep(Number(ev.ms));
      continue;
    }
    out.write(`data: ${JSON.stringify(ev)}

`);
    await sleep(ev.type === "TEXT_MESSAGE_CONTENT" ? 25 + Math.random() * 45 : ev.type === "TOOL_CALL_ARGS" ? 10 : 160);
  }
  out.end();
};

// ---------------------------------------------------------------- botón y select

const STEPS = ["Validando campos obligatorios", "Generando PDF · 3 páginas", "Subiendo a R2 · 412 KB", "Notificando a 4 aprobadores", "Registrando auditoría"];
const stream: Handler = async (req, out) => {
  const fail = req.url.searchParams.has("fail");
  const send = ndjson(out);
  for (let i = 0; i < STEPS.length; i++) {
    send({ msg: STEPS[i], progress: i / STEPS.length });
    await sleep(600 + Math.random() * 500);
    if (fail && i === 3) {
      send({ ok: false, msg: "SMTP 421 · reintenta en 30 s" });
      return out.end();
    }
  }
  send({ ok: true, progress: 1 });
  out.end();
};
/** Búsqueda en servidor para <nx-select source>: 25 por página, con espera de red. */
const empleados: Handler = async (req, out) => {
  const q = req.url.searchParams.get("q") ?? "";
  await sleep(250 + Math.random() * 250);
  out.type("application/json");
  out.end(JSON.stringify({ options: searchOptions(EMPLOYEES, EMPLOYEE_FIELDS, q).slice(0, 25).map((m) => m.option) }));
};

// ---------------------------------------------------------------- paleta, desgloses y bandeja

const command: Handler = async (req, out) => {
  await sleep(180 + Math.random() * 220);
  out.type("application/json");
  out.end(JSON.stringify({ items: commandSearch(req.url.searchParams.get("q") ?? "") }));
};
const explain: Handler = async (req, out) => {
  const id = req.url.searchParams.get("id") ?? "";
  const send = ndjson(out);
  await sleep(250);
  for (const ev of EXPLAIN[id] ?? [{ type: "error", message: `No hay desglose para «${id}»` }]) {
    if (out.closed()) return;
    if (ev.type === "text") {
      // La explicación sale en trozos, como la de un modelo.
      const words = ev.delta.split(/(?<=\s)/);
      for (let i = 0; i < words.length && !out.closed(); i += 3) {
        send({ type: "text", delta: words.slice(i, i + 3).join("") });
        await sleep(30 + Math.random() * 40);
      }
      continue;
    }
    send(ev);
    await sleep(ev.type === "term" ? 140 + Math.random() * 120 : 60);
  }
  send({ type: "done" });
  out.end();
};
const inboxImpact: Handler = async (req, out) => {
  const send = ndjson(out);
  await sleep(300);
  for (const ev of INBOX_IMPACT[req.url.searchParams.get("id") ?? ""] ?? []) {
    send(ev);
    await sleep(200 + Math.random() * 200);
  }
  send({ type: "done" });
  out.end();
};

// ---------------------------------------------------------------- tablero e historial

const kanban: Handler = async (req, out) => {
  const body = json(req.body) as Parameters<typeof kanbanImpact>[0];
  const send = ndjson(out);
  await sleep(350);
  for (const ev of kanbanImpact(body)) {
    if (out.closed()) return;
    send(ev);
    await sleep(240 + Math.random() * 200);
  }
  send({ type: "done" });
  out.end();
};
const history: Handler = async (req, out) => {
  const before = req.url.searchParams.get("before");
  await sleep(before ? 700 : 450);
  if (out.closed()) return;
  out.type("application/json");
  out.end(JSON.stringify(ocHistoryPage(before)));
};

/** Las rutas, de la más específica a la más general (se elige la primera cuyo prefijo coincide). */
const ROUTES: [string, Handler][] = [
  ["/demo/ai", ai],
  ["/demo/capture/factura.svg", captureSvg],
  ["/demo/capture/registrar", captureRegister],
  ["/demo/capture", capture],
  ["/demo/grid/rows", gridRows],
  ["/demo/grid/ai", gridAi],
  ["/demo/th/retiro", retiro],
  ["/demo/agent", agent],
  ["/demo/impact", impact],
  ["/demo/empleados", empleados],
  ["/demo/stream", stream],
  ["/demo/command", command],
  ["/demo/explain", explain],
  ["/demo/inbox/impacto", inboxImpact],
  ["/demo/kanban/impacto", kanban],
  ["/demo/history/oc-2291", history],
];

/** Registra una ruta más (para los ejemplos que se agreguen). */
export function addDemoRoute(prefix: string, handler: Handler): void {
  ROUTES.unshift([prefix, handler]);
}
export type { Handler as DemoHandler, Req as DemoRequest, Out as DemoOut };

/** La parte de la ruta desde `/demo/`, esté la galería en la raíz o en una subcarpeta (`/nx-ui/demo/…`). */
function demoPath(url: URL): string | null {
  const i = url.pathname.indexOf("/demo/");
  return i >= 0 ? url.pathname.slice(i) : null;
}

/** La respuesta de la API de demostración para una petición, o `null` si no es de `/demo/`. Se
 *  resuelve con el primer trozo (como un servidor que manda las cabeceras) y se rechaza si se aborta. */
export function demoFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> | null {
  const raw = input instanceof Request ? input.url : String(input);
  const url = new URL(raw, typeof location === "undefined" ? "http://localhost/" : location.href);
  const path = demoPath(url);
  const route = path ? ROUTES.find(([p]) => path === p || path.startsWith(`${p}/`)) : undefined;
  if (!route) return null;
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  const aborted = () => new DOMException("Aborted", "AbortError");
  if (init.signal?.aborted) return Promise.reject(aborted());
  let status = 200;
  let type = "text/plain";
  let closed = false;
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({ start: (c) => void (ctrl = c), cancel: () => void (closed = true) });
  const enc = new TextEncoder();
  return new Promise<Response>((resolve, reject) => {
    let sent = false;
    const head = () => {
      if (sent) return;
      sent = true;
      resolve(new Response(stream, { status, headers: { "Content-Type": type, "Cache-Control": "no-store" } }));
    };
    init.signal?.addEventListener("abort", () => {
      closed = true;
      if (!sent) return reject(aborted());
      try {
        ctrl.error(aborted());
      } catch {
        /* ya cerrado */
      }
    });
    const out: Out = {
      type: (t) => void (type = t),
      status: (n) => void (status = n),
      write: (str) => {
        head();
        if (!closed) ctrl.enqueue(enc.encode(str));
      },
      end: (str) => {
        if (str) out.write(str);
        head();
        if (!closed) ctrl.close();
        closed = true;
      },
      closed: () => closed,
    };
    route[1]({ url, method, body }, out).catch(() => out.end());
  });
}

let installed = false;

/** Envuelve `fetch` para que `/demo/*` se responda en el navegador. */
export function installDemoApi(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const real = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    return demoFetch(input, init) ?? real(input, init);
  }) as typeof fetch;
}
