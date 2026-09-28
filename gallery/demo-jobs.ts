/**
 * Galería: «Trabajos largos», la demo de `<nx-jobs>`. La contabilidad de una distribuidora lanza tres
 * procesos pesados y sigue trabajando mientras corren.
 *
 * El «servidor» (`/demo/jobs/*`) corre en el navegador (`addDemoRoute`) y vive en este módulo, así
 * que «Simular recarga» (desmontar y volver a montar el elemento) encuentra los trabajos donde iban:
 * - `GET /demo/jobs?active=1` → en curso y recientes.
 * - `POST /demo/jobs` `{type, title, params}` → el trabajo, en cola.
 * - `GET /demo/jobs/{id}`, `POST /demo/jobs/{id}/cancel`, `POST /demo/jobs/{id}/retry`.
 * - `GET /demo/jobs/eventos?after=` → NDJSON abierto con `{id, status, stage, done, total, result, seq}`
 *   de todos los trabajos; con `after`, primero repite lo que se perdió.
 *
 * Los tres: «Importar 10.000 clientes» (por etapas, termina con 12 filas con error y su descarga),
 * «Cierre de septiembre» (lento, cancelable) y «Generar 500 facturas electrónicas» (falla en la 317;
 * «Reintentar» sigue desde ahí y termina).
 */
import { addDemoRoute, type DemoOut } from "./demo-api";
import "../src/components/jobs/index";
import "../src/components/jobs/jobs.css";
import type { Job, JobsErrorDetail, NxJobs } from "../src/components/jobs/index";

type Kind = "importar-clientes" | "cierre-mes" | "facturas";
type Sim = Job & { kind: Kind; speed: number; tries: number };

const WHO = "Ana Restrepo";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jobs = new Map<string, Sim>();
const log: { seq: number; ev: Record<string, unknown> }[] = [];
const subs = new Set<(line: string) => void>();
let seq = 0;
let n = 0;
let tick: ReturnType<typeof setInterval> | undefined;

/** Lo que el servidor cuenta de un trabajo (sin lo interno de la simulación). */
const pub = ({ kind: _k, speed: _s, tries: _t, ...j }: Sim): Job => j;

function emit(j: Sim, extra: Partial<Job> = {}): void {
  const ev = { id: j.id, status: j.status, stage: j.stage, done: j.done, total: j.total, ...extra, seq: ++seq };
  log.push({ seq, ev });
  if (log.length > 500) log.shift();
  const line = `${JSON.stringify(ev)}\n`;
  for (const s of subs) s(line);
}

const STAGES: Record<Kind, [number, string][]> = {
  "importar-clientes": [
    [0, "Leyendo el archivo"],
    [0.12, "Validando NIT y direcciones"],
    [0.45, "Guardando"],
    [0.96, "Actualizando cupos de crédito"],
  ],
  "cierre-mes": [
    [0, "Validando comprobantes"],
    [0.2, "Calculando depreciaciones"],
    [0.45, "Ajuste por diferencia en cambio"],
    [0.7, "Cerrando cuentas de resultado"],
    [0.9, "Generando saldos iniciales de octubre"],
  ],
  facturas: [
    [0, "Armando los XML"],
    [0.08, "Firmando y enviando a la DIAN"],
  ],
};

function step(): void {
  let any = false;
  for (const j of jobs.values()) {
    if (j.status === "queued") {
      j.status = "running";
      j.stage = STAGES[j.kind][0][1];
      emit(j);
      any = true;
      continue;
    }
    if (j.status !== "running") continue;
    any = true;
    const total = j.total!;
    // Velocidad irregular: tramos rápidos y lentos, como un servidor de verdad.
    const burst = 0.4 + Math.random() * 1.2;
    let done = Math.min(total, (j.done ?? 0) + Math.max(1, Math.round(j.speed * burst)));
    if (j.kind === "facturas" && j.tries === 1 && done >= 317) {
      j.done = 316;
      j.status = "failed";
      j.finishedAt = new Date().toISOString();
      j.result = { message: "La factura FE-10317 no se pudo firmar: el certificado de firma venció. Se renovó; reintenta desde la 317.", errors: 184 };
      emit(j, { result: j.result, finishedAt: j.finishedAt });
      continue;
    }
    j.done = done;
    const f = done / total;
    j.stage = [...STAGES[j.kind]].reverse().find(([at]) => f >= at)![1];
    if (done >= total) {
      done = total;
      j.status = "done";
      j.finishedAt = new Date().toISOString();
      j.result =
        j.kind === "importar-clientes"
          ? j.tries > 1
            ? { href: "#/jobs", message: "Las 12 filas corregidas quedaron importadas." }
            : { errors: 12, errorsHref: "#/jobs", download: { url: "demo/jobs/archivos/errores-clientes.csv", name: "clientes-con-error.csv" }, href: "#/jobs" }
          : j.kind === "cierre-mes"
            ? { href: "#/jobs", message: "Septiembre quedó cerrado. Los saldos iniciales de octubre ya están disponibles." }
            : { href: "#/jobs", download: { url: "demo/jobs/archivos/facturas-septiembre.zip", name: "facturas-septiembre.zip" } };
      emit(j, { result: j.result, finishedAt: j.finishedAt });
    } else emit(j);
  }
  if (!any) {
    clearInterval(tick);
    tick = undefined;
  }
}
const run = () => (tick ??= setInterval(step, 100));

const TITLES: Record<Kind, [string, number, number]> = {
  // título, total, unidades por décima de segundo (en promedio)
  "importar-clientes": ["Importar 10.000 clientes", 10_000, 45],
  "cierre-mes": ["Cierre de septiembre", 1_840, 2.2],
  facturas: ["Generar 500 facturas electrónicas", 500, 2.4],
};

const json = (out: DemoOut, status: number, body: unknown) => {
  out.type("application/json");
  out.status(status);
  out.end(JSON.stringify(body));
};

addDemoRoute("/demo/jobs", async (req, out) => {
  const parts = req.url.pathname.slice(req.url.pathname.indexOf("/demo/jobs") + 10).split("/").filter(Boolean);
  if (parts[0] === "eventos") {
    // Un solo stream para todos los trabajos; con `after`, primero lo que se perdió.
    out.type("application/x-ndjson");
    const after = Number(req.url.searchParams.get("after") ?? Number.NaN);
    if (Number.isFinite(after)) for (const e of log) if (e.seq > after) out.write(`${JSON.stringify(e.ev)}\n`);
    const send = (line: string) => !out.closed() && out.write(line);
    subs.add(send);
    while (!out.closed()) await sleep(300);
    subs.delete(send);
    return;
  }
  await sleep(120 + Math.random() * 180);
  if (!parts.length && req.method === "GET") {
    const day = Date.now() - 86_400_000;
    return json(out, 200, [...jobs.values()].filter((j) => !j.finishedAt || Date.parse(j.finishedAt) > day).map(pub));
  }
  if (!parts.length && req.method === "POST") {
    let body: { type?: Kind; title?: string } = {};
    try {
      body = JSON.parse(req.body || "{}");
    } catch {
      /* vacío */
    }
    const kind = body.type && body.type in TITLES ? body.type : "importar-clientes";
    const [title, total, speed] = TITLES[kind];
    const j: Sim = { id: `t${++n}-${Date.now().toString(36)}`, type: kind, kind, title: body.title || title, status: "queued", done: 0, total, startedAt: new Date().toISOString(), by: WHO, speed, tries: 1 };
    jobs.set(j.id, j);
    run();
    return json(out, 201, pub(j));
  }
  const j = jobs.get(parts[0] ?? "");
  if (!j) return json(out, 404, { message: "No existe ese trabajo" });
  if (req.method === "GET") return json(out, 200, pub(j));
  if (parts[1] === "cancel" && (j.status === "running" || j.status === "queued")) {
    j.status = "canceled";
    j.finishedAt = new Date().toISOString();
    j.result = { message: `Se canceló en «${j.stage}». Lo ya guardado queda.` };
    emit(j, { result: j.result, finishedAt: j.finishedAt });
    return json(out, 200, pub(j));
  }
  if (parts[1] === "retry" && (j.status === "failed" || j.result?.errors)) {
    // Sigue desde donde falló: el mismo trabajo vuelve a la cola.
    j.tries++;
    j.status = "queued";
    delete j.finishedAt;
    delete j.result;
    j.startedAt = new Date().toISOString();
    if (j.kind === "importar-clientes") j.done = j.total! - 12;
    emit(j, { result: undefined });
    run();
    return json(out, 200, pub(j));
  }
  return json(out, 409, { message: "Ese trabajo ya no admite esa acción" });
});

// ---------------------------------------------------------------- la página

export function mountJobsDemo(root: HTMLElement): void {
  const bar = root.querySelector<HTMLElement>("#jobs-bar")!;
  const logEl = root.querySelector<HTMLOListElement>("#jobs-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    logEl.prepend(li);
    while (logEl.children.length > 12) logEl.lastElementChild!.remove();
  };
  const el = () => bar.querySelector<NxJobs>("nx-jobs")!;
  let lastCount = -1;
  const wire = (j: NxJobs) => {
    j.addEventListener("nx-jobs-change", (e) => {
      const count = e.detail.jobs.filter((x) => x.status === "running" || x.status === "queued").length;
      if (count !== lastCount) add(`nx-jobs-change · ${count} en curso`);
      lastCount = count;
    });
    j.addEventListener("nx-jobs-done", (e) => add(`nx-jobs-done · ${e.detail.job.title}: ${e.detail.job.status}`));
    j.addEventListener("nx-jobs-error", (e) => add(`nx-jobs-error · ${(e as CustomEvent<JobsErrorDetail>).detail.action}: ${(e as CustomEvent<JobsErrorDetail>).detail.message}`));
    j.addEventListener("nx-open-change", (e) => add(`nx-open-change · ${(e as CustomEvent<{ open: boolean }>).detail.open ? "abierto" : "cerrado"}`));
    // Las descargas de la demo no existen como archivos: se arman aquí.
    j.addEventListener("click", (e) => {
      const a = (e.target as Element).closest<HTMLAnchorElement>("a[download]");
      if (!a) return;
      e.preventDefault();
      const csv = "fila,nit,error\n" + Array.from({ length: 12 }, (_, i) => `${812 + i * 731},90012${i}45,${i % 3 ? "Dirección vacía" : "NIT con dígito de verificación errado"}`).join("\n");
      const url = URL.createObjectURL(new Blob([a.download.endsWith(".csv") ? csv : "(demo)"], { type: "text/plain" }));
      const tmp = Object.assign(document.createElement("a"), { href: url, download: a.download });
      tmp.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      add(`descarga · ${a.download}`);
    });
  };
  wire(el());

  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-job]")) {
    b.addEventListener("click", async () => {
      const type = b.dataset.job as Kind;
      b.disabled = true;
      try {
        const job = await el().start({ type, title: TITLES[type][0], params: type === "cierre-mes" ? { mes: "2026-09" } : {} });
        add(`start() · ${job.title} (${job.id})`);
      } catch (err) {
        add(`start() falló · ${(err as Error).message}`);
      } finally {
        b.disabled = false;
      }
    });
  }

  root.querySelector("#jobs-reload")!.addEventListener("click", async () => {
    // Como recargar la página: el elemento se va (y cierra su conexión) y vuelve uno nuevo.
    const old = el();
    const attrs = [...old.attributes].map((a) => [a.name, a.value]);
    old.remove();
    add("recarga · el elemento salió del DOM");
    await sleep(600);
    const fresh = document.createElement("nx-jobs") as NxJobs;
    for (const [k, v] of attrs) fresh.setAttribute(k, v);
    lastCount = -1;
    wire(fresh);
    bar.append(fresh);
    add("recarga · montado otra vez: retoma lo que iba");
  });
}
