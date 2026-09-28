/**
 * Galería: «Procedimientos», la demo de `<nx-checklist>`. La recepción de la OC-2291 de Aceros del
 * Caribe en la bodega de Itagüí: 12 pasos en tres secciones (Llegada, Conteo en orden, Cierre con
 * firmas), dos ya hechos por Laura Gómez y uno vencido. Debajo, `mode="summary"` con cuatro
 * procedimientos más.
 *
 * El «servidor» (`/demo/checklist/*`) corre en esta pestaña (`addDemoRoute`):
 * - `GET /demo/checklist/recepcion-oc-2291` → `{title, steps, state, log}`.
 * - `PATCH …/steps/{id}` → lo guarda después de una pausa; con «El servidor rechaza el próximo
 *   cambio», un 422 con el mensaje.
 * - `POST …/steps/{id}/files` y `POST …/close`.
 * `demoFetch` solo pasa cuerpos de texto: las fotos (`FormData`) y la red «caída» las atiende un
 * envoltorio de `fetch` de esta página. No es parte de la librería.
 */
import "../src/components/checklist/index";
import "../src/components/checklist/checklist.css";
import type { ChecklistChangeDetail, ChecklistLogEntry, ChecklistState, ChecklistStep, ChecklistSummaryItem, NxChecklist } from "../src/components/checklist/index";
import { addDemoRoute, type DemoOut } from "./demo-api";

const BASE = "/demo/checklist/recepcion-oc-2291";
const H = 3600_000;
const LAURA = { id: "u3", name: "Laura Gómez" };
const DIEGO = { id: "u7", name: "Diego Llinás" };
const CARLOS = { id: "u9", name: "Carlos Mejía" };
const MARTA = { id: "u4", name: "Marta Ríos" };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Una hora local sin zona («2026-09-28T17:00»), como la guarda un ERP: relativa a ahora para que la demo siempre tenga un vencido. */
function local(offsetMs: number, hour?: number): string {
  const d = new Date(Date.now() + offsetMs);
  if (hour !== undefined) d.setHours(hour, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const day = (offsetDays: number) => local(offsetDays * 24 * H).slice(0, 10);

function steps(): ChecklistStep[] {
  return [
    {
      id: "placa",
      section: "Llegada",
      title: "Verificar placa y conductor",
      hint: "El vehículo debe ser el TKR-512 de Transportes Rivera; el conductor presenta cédula y licencia.",
      assignee: LAURA,
      evidence: [{ type: "choice", label: "¿Coincide con la remisión?", options: ["Coincide", "No coincide"] }],
    },
    {
      id: "documentos",
      section: "Llegada",
      title: "Revisar remisión y factura",
      hint: "Remisión REM-4471 y factura FE-88213 contra la OC-2291: cantidades, referencias y precios.",
      assignee: LAURA,
      evidence: [{ type: "file", label: "Remisión y factura escaneadas", accept: "application/pdf,image/*" }],
    },
    {
      id: "camion",
      section: "Llegada",
      title: "Foto del camión en el muelle",
      hint: "Con la placa visible y las puertas abiertas, antes de descargar.",
      assignee: DIEGO,
      due: local(-90 * 60_000),
      evidence: [{ type: "photo", label: "Foto del camión" }],
    },
    {
      id: "sellos",
      section: "Llegada",
      title: "Verificar sellos de seguridad",
      hint: "Sellos 004512 y 004513 de la furgoneta.",
      assignee: DIEGO,
      due: local(1.5 * H),
      evidence: [{ type: "choice", label: "Sellos", options: ["Intactos", { value: "rotos", label: "Rotos o cambiados", note: true }] }],
    },
    { id: "descargue", section: "Conteo", title: "Descargar y ubicar en la zona de recepción", hint: "Muelle 3, zona R-2. Montacargas de 2,5 t.", assignee: CARLOS, due: local(2 * H) },
    {
      id: "laminas",
      section: "Conteo",
      title: "Contar láminas HR 4×8 cal. 14",
      hint: "La OC-2291 pide 120 láminas; se aceptan ±2.",
      assignee: CARLOS,
      due: local(3 * H),
      evidence: [{ type: "number", label: "Láminas contadas", min: 118, max: 122, unit: "und" }],
    },
    {
      id: "angulos",
      section: "Conteo",
      title: "Contar ángulos 2″ × 1/4″ × 6 m",
      hint: "40 unidades en 4 atados de 10.",
      assignee: CARLOS,
      due: local(3 * H),
      evidence: [{ type: "number", label: "Ángulos contados", min: 40, max: 40, unit: "und" }],
    },
    {
      id: "empaque",
      section: "Conteo",
      title: "Estado del empaque",
      hint: "Zunchos, esquineros y plástico. Óxido o golpes: «Con novedad».",
      assignee: DIEGO,
      evidence: [
        { type: "choice", label: "Empaque", options: ["Conforme", "Con novedad", "No conforme"] },
        { type: "note", label: "Observación", required: false },
      ],
    },
    {
      id: "novedades",
      section: "Conteo",
      title: "Foto de novedades",
      hint: "Solo si hay golpes, óxido o empaque roto: dos fotos, de cerca y de lejos.",
      required: false,
      canSkip: true,
      evidence: [{ type: "photo", label: "Fotos de la novedad", count: 2 }],
    },
    {
      id: "transportador",
      section: "Cierre",
      title: "Firma del transportador",
      hint: "Quien entrega firma que la mercancía llegó como se contó.",
      dependsOn: ["laminas", "angulos"],
      due: local(0, 17),
      evidence: [{ type: "signature", label: "Firma de quien entrega" }],
    },
    {
      id: "jefe",
      section: "Cierre",
      title: "Firma del jefe de bodega",
      assignee: MARTA,
      dependsOn: ["transportador"],
      due: local(0, 17),
      evidence: [{ type: "signature", label: "Firma de quien recibe" }],
    },
    {
      id: "nota",
      section: "Cierre",
      title: "Nota final de recepción",
      hint: "Lo que deba saber compras: faltantes, novedades, devoluciones.",
      assignee: MARTA,
      due: day(1),
      evidence: [{ type: "note", label: "Nota para compras" }],
    },
  ];
}

// ---------------------------------------------------------------- el servidor de mentira

/** Los interruptores de la página. */
const sim = { offline: false, reject: false };
let server: { state: ChecklistState; log: ChecklistLogEntry[]; closed: unknown } = { state: {}, log: [], closed: null };

function reset(): void {
  const t1 = new Date(Date.now() - 2.5 * H).toISOString();
  const t2 = new Date(Date.now() - 2 * H).toISOString();
  server = {
    state: {
      placa: { status: "done", by: LAURA, at: t1, evidence: [{ type: "choice", value: "Coincide" }] },
      documentos: { status: "done", by: LAURA, at: t2, evidence: [{ type: "file", files: [{ name: "REM-4471.pdf", type: "application/pdf", size: 182_311 }, { name: "FE-88213.pdf", type: "application/pdf", size: 96_204 }] }] },
    },
    log: [
      { action: "done", step: "placa", by: LAURA, at: t1 },
      { action: "done", step: "documentos", by: LAURA, at: t2 },
    ],
    closed: null,
  };
}

const reply = (out: DemoOut, status: number, body: unknown) => {
  out.status(status);
  out.type("application/json");
  out.end(JSON.stringify(body));
};

addDemoRoute("/demo/checklist", async (req, out) => {
  const path = req.url.pathname.slice(req.url.pathname.indexOf(BASE) + BASE.length);
  if (req.method === "GET") {
    await sleep(350);
    return reply(out, 200, { title: "Recepción OC-2291 · Aceros del Caribe · Bodega Itagüí", steps: steps(), state: server.state, log: server.log, closed: server.closed });
  }
  await sleep(300 + Math.random() * 500);
  if (sim.reject) {
    sim.reject = false;
    onReject?.();
    return reply(out, 422, { message: "La OC-2291 ya se recibió en el ERP desde otra terminal" });
  }
  const body = JSON.parse(req.body || "{}");
  if (path === "/close") {
    server.closed = { by: DIEGO, at: new Date().toISOString() };
    return reply(out, 200, { ok: true });
  }
  const m = /^\/steps\/([^/]+)$/.exec(path);
  if (!m || req.method !== "PATCH") return reply(out, 404, { message: "No existe" });
  const id = decodeURIComponent(m[1]);
  server.state[id] = { status: body.status, by: DIEGO, at: new Date().toISOString(), evidence: body.evidence, reason: body.reason, note: body.note };
  server.log.push({ action: body.status === "todo" ? "reopened" : body.status, step: id, by: DIEGO, at: new Date().toISOString(), reason: body.reason });
  reply(out, 200, { ok: true, clientId: body.clientId });
});

let onReject: (() => void) | null = null;
let wrapped = false;
/** Envuelve `fetch` para `/demo/checklist/`: la red «caída» y las fotos (FormData), que la API de demo no pasa. */
function wrapFetch(): void {
  if (wrapped || typeof window === "undefined") return;
  wrapped = true;
  const inner = window.fetch;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.includes("/demo/checklist")) return inner(input, init);
    if (sim.offline) {
      // Sin señal el teléfono tarda un poco en rendirse.
      await sleep(250 + Math.random() * 300);
      throw new TypeError("Failed to fetch");
    }
    if (init?.body instanceof FormData) {
      await sleep(600);
      // Las fotos quedan en esta pestaña: la URL es local (`blob:`), del mismo origen.
      const files = init.body.getAll("files").map((f) => ({ url: URL.createObjectURL(f as File), id: Math.random().toString(36).slice(2) }));
      return new Response(JSON.stringify({ files }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return inner(input, init);
  }) as typeof fetch;
}

// ---------------------------------------------------------------- la página

const SUMMARY: () => ChecklistSummaryItem[] = () => [
  { id: "cierre-sep", title: "Cierre de septiembre", done: 18, total: 24, overdue: 3, due: day(2), assignee: { name: "Andrea Salazar" } },
  { id: "auditoria-q3", title: "Auditoría de inventario Q3", done: 212, total: 340, overdue: 1, due: day(9), assignee: LAURA },
  { id: "tkr-512", title: "Alistamiento del camión TKR-512", done: 11, total: 14, due: local(4 * H), assignee: CARLOS },
  { id: "caja-itagui", title: "Apertura de caja · Punto de venta Itagüí", done: 6, total: 6, assignee: { name: "Juliana Ortiz" } },
];

export function mountChecklistDemo(root: HTMLElement): void {
  wrapFetch();
  reset();
  sim.offline = false;
  sim.reject = false;
  const cl = root.querySelector<NxChecklist>("#cl-demo")!;
  const summary = root.querySelector<NxChecklist>("#cl-summary")!;
  const log = root.querySelector<HTMLOListElement>("#checklist-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 8) log.lastElementChild!.remove();
  };
  const title = (id: string) => cl.steps.find((s) => s.id === id)?.title ?? id;

  const switches = [...root.querySelectorAll<HTMLButtonElement>("[data-sim]")];
  const paint = () => switches.forEach((b) => b.setAttribute("aria-checked", String(sim[b.dataset.sim as keyof typeof sim])));
  onReject = () => queueMicrotask(paint);
  for (const b of switches)
    b.addEventListener("click", () => {
      const k = b.dataset.sim as keyof typeof sim;
      sim[k] = !sim[k];
      paint();
      add(k === "offline" ? (sim.offline ? "red · sin conexión" : "red · de vuelta") : sim.reject ? "servidor · rechazará el próximo cambio" : "servidor · acepta");
      // Al volver la señal el navegador avisa con `online`; aquí se simula.
      if (k === "offline" && !sim.offline) window.dispatchEvent(new Event("online"));
    });
  paint();

  cl.addEventListener("nx-checklist-change", (e) => {
    const d = (e as CustomEvent<ChecklistChangeDetail>).detail;
    const files = d.evidence.reduce((n, ev) => n + (ev.files?.length ?? 0), 0);
    const extra = [files ? `${files} ${files === 1 ? "archivo" : "archivos"}` : "", d.reason ? `motivo: ${d.reason}` : "", d.evidence.some((ev) => ev.outOfRange) ? "fuera de rango" : ""].filter(Boolean).join(", ");
    add(`nx-checklist-change · ${title(d.step)} → ${d.status}${extra ? ` (${extra})` : ""}`);
  });
  cl.addEventListener("nx-checklist-complete", () => add("nx-checklist-complete · procedimiento cerrado"));
  cl.addEventListener("nx-checklist-error", (e) => add(`nx-checklist-error · ${(e as CustomEvent<{ message: string }>).detail.message}`));

  summary.items = SUMMARY();
  summary.addEventListener("nx-checklist-open", (e) => add(`nx-checklist-open · ${(e as CustomEvent<{ item: ChecklistSummaryItem }>).detail.item.title}`));
}
