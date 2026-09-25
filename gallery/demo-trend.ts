/**
 * Galería: `<nx-trend>`. El costo de producción de 2026 por mes (materia prima, mano de obra e
 * indirectos) con agosto fuera de lo normal, y las ventas por mes contra el año anterior. Al hacer
 * clic en un punto, `/demo/trend/why` contesta «¿por qué?» con el protocolo de IA (pasos, texto en
 * trozos, fuentes y acciones), con guiones según la serie y el mes.
 */
import type { NxTrend, TrendContext, TrendSeries } from "../src/components/trend/index";
import "../src/components/trend/index";
import { addDemoRoute } from "./demo-api";

const M = 1_000_000;
const months = (ys: number[], unit = M) => ys.map((y, i) => ({ x: `2026-${String(i + 1).padStart(2, "0")}`, y: Math.round(y * unit) }));

export const COST_SERIES: TrendSeries[] = [
  { id: "mp", label: "Materia prima", points: months([388.4, 392.1, 401.7, 396.2, 405.9, 409.3, 412.8, 486.5, 431.2]) },
  { id: "mo", label: "Mano de obra", points: months([214.0, 214.6, 216.1, 215.8, 217.2, 221.4, 222.0, 247.9, 224.3]) },
  { id: "cif", label: "Costos indirectos", points: months([96.3, 98.1, 97.4, 101.2, 99.8, 102.5, 104.1, 106.0, 103.7]) },
];
export const COST_ANOMALIES = [{ series: "mp", x: "2026-08", label: "Acero +18 %" }];

export const SALES_SERIES: TrendSeries[] = [
  { id: "v2025", label: "Ventas 2025", muted: true, points: months([1.42, 1.38, 1.55, 1.49, 1.61, 1.58, 1.52, 1.66, 1.71], 1000 * M) },
  { id: "v2026", label: "Ventas 2026", points: months([1.51, 1.47, 1.68, 1.62, 1.74, 1.7, 1.66, 1.93, 1.79], 1000 * M) },
];

// ---------------------------------------------------------------- «¿por qué?» (el backend de la demo)

type Line = Record<string, unknown>;
type Script = { steps: [string, string, string?][]; sources: Line[]; text: string; notes: Line[]; actions: Line[] };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cop = (n: number) => `$ ${(n / M).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M`;
const pct = (a: number, b: number) => `${((b - a) / Math.abs(a)) * 100 > 0 ? "+" : "−"}${Math.abs(((b - a) / Math.abs(a)) * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;

const monthName = (x: string) => new Date(`${x}-01T12:00:00Z`).toLocaleString("es-CO", { month: "long", timeZone: "UTC" });

/** Una repregunta: si nombra un mes de la ventana, se contesta con ese punto; si no, se orienta. */
function followUp(ctx: TrendContext, question: string): Script {
  const q = question.toLowerCase();
  const i = ctx.window.findIndex((p) => q.includes(monthName(p.x)));
  const p = ctx.window[i];
  const prev = ctx.window[i - 1];
  const steps: Script["steps"] = [["s1", `Releyendo ${ctx.series.label.toLowerCase()} alrededor de ${ctx.point.label}`, `${ctx.window.length} meses`]];
  if (!p || p.y === null)
    return { steps, sources: [], notes: [], actions: [], text: `No tengo ese dato en la ventana de este punto. Puedo contarte de **${ctx.window.map((w) => monthName(w.x)).join(", ")}**.` };
  const d = prev?.y ? ` (**${pct(prev.y, p.y)}** frente a ${monthName(prev.x)})` : "";
  return { steps, sources: [{ id: "mayor", title: `Libro mayor · ${monthName(p.x)} 2026` }], notes: [], actions: [], text: `En ${monthName(p.x)}, ${ctx.series.label.toLowerCase()} fue **${cop(p.y)}**${d}[^mayor]. ${p.x > ctx.point.x ? "Después del pico volvió a su nivel normal: lo de agosto fue puntual." : "Hasta ahí la serie venía estable."}` };
}

/** El guion según la serie y el mes; lo demás, una respuesta calculada con el contexto. Si la
 *  pregunta no es la de por defecto (una repregunta), se contesta con la ventana. */
export function trendScript(ctx: TrendContext, question = ""): Script {
  const { series, point, previous } = ctx;
  const month = point.label.split(" ")[0];
  if (question && !question.includes(series.label)) return followUp(ctx, question);
  if (series.id === "mp" && point.x === "2026-08")
    return {
      steps: [["s1", "Consultando consumos de materia prima · jul–ago", "1.248 movimientos"], ["s2", "Comparando precios de compra contra julio"], ["s3", "Cruzando con órdenes de compra de agosto", "OC-2291 y 6 más"], ["s4", "Verificando contra el libro mayor"]],
      sources: [
        { id: "precios", title: "Lista de precios · Aceros del Caribe", detail: "vigente desde el 3 ago" },
        { id: "oc2291", title: "OC-2291 · Lámina HR 3 mm × 40", detail: "$ 10.829.000", href: "#/trend" },
        { id: "mayor", title: "Libro mayor · agosto", detail: "cuenta 7105 · materia prima" },
      ],
      text: `La materia prima de agosto subió a **${cop(point.y)}**, **${pct(previous!.y, point.y)}** frente a julio[^mayor]. Casi todo es acero:\n\n- **Aceros del Caribe** subió la lámina HR **18 %** desde el 3 de agosto[^precios].\n- Se compró por adelantado para septiembre: la OC-2291 sola suma $ 10,8 M[^oc2291].\n\nSin el alza del acero, el mes habría quedado en **$ 421 M** (+2 %), dentro de lo normal.`,
      notes: [{ label: "cifras verificadas", tone: "success" }],
      actions: [{ label: "Ver las órdenes de agosto", href: "#/trend" }, { label: "Pedir cotización a otro proveedor", id: "cotizar", data: { insumo: "Lámina HR 3 mm" } }],
    };
  if (series.id === "mo" && point.x === "2026-08")
    return {
      steps: [["s1", "Consultando la nómina de agosto", "312 empleados"], ["s2", "Buscando novedades de horas extra"], ["s3", "Relacionando con paradas de planta", "1 parada"]],
      sources: [
        { id: "paro", title: "Novedad N-8812 · paro de la empacadora", detail: "línea 2 · 31 h" },
        { id: "nomina", title: "Nómina · agosto 2026", detail: "horas extra y recargos" },
      ],
      text: `La mano de obra de agosto fue **${cop(point.y)}**, **${pct(previous!.y, point.y)}** frente a julio[^nomina].\n\nLa línea 2 perdió **31 horas** por el paro de la empacadora[^paro], y para cumplir los despachos se pagaron **1.140 horas extra** y recargos nocturnos. En septiembre, sin paro, volvió a lo normal.`,
      notes: [{ label: "datos de nómina", tone: "neutral" }],
      actions: [{ label: "Abrir la novedad N-8812", href: "#/trend" }],
    };
  if (series.id === "v2026") {
    const before = SALES_SERIES[0].points.find((p) => p.x === point.x)?.y ?? 0;
    const peak = point.x === "2026-08";
    return {
      steps: [["s1", `Consultando facturación de ${month}`, peak ? "1.906 facturas" : "1.7xx facturas"], ["s2", `Comparando con ${month} de 2025`], ["s3", "Agrupando por cliente y línea"]],
      sources: [
        { id: "fact", title: `Facturación · ${point.label}`, detail: "ventas netas, sin IVA" },
        ...(peak ? [{ id: "andes", title: "Pedido PV-7731 · Metalmecánica Los Andes", detail: "$ 142 M · entrega única", href: "#/trend" }] : []),
      ],
      text: peak
        ? `Agosto cerró en **${cop(point.y)}**[^fact], **${pct(before, point.y)}** frente a agosto de 2025 y el mejor mes del año.\n\n- **Metalmecánica Los Andes** hizo un pedido único de $ 142 M para su planta nueva[^andes].\n- Sin ese pedido, el crecimiento habría sido de **8 %**, en línea con el resto del año.`
        : `En ${month} se facturaron **${cop(point.y)}**[^fact]: **${pct(before, point.y)}** frente al mismo mes de 2025${previous ? ` y **${pct(previous.y, point.y)}** frente al mes anterior` : ""}. El crecimiento viene parejo de todas las líneas; no hay un cliente que explique la diferencia por sí solo.`,
      notes: [],
      actions: peak ? [{ label: "Ver el pedido PV-7731", href: "#/trend" }] : [],
    };
  }
  const d = previous ? pct(previous.y, point.y) : null;
  return {
    steps: [["s1", `Consultando ${series.label.toLowerCase()} de ${month}`], ["s2", "Buscando novedades del periodo", "sin novedades"]],
    sources: [{ id: "mayor", title: `Libro mayor · ${point.label}` }],
    text: `${series.label} en ${month}: **${cop(point.y)}**[^mayor]${d ? `, **${d}** frente al mes anterior` : ""}. No encontré novedades que expliquen un cambio: la variación está dentro de lo normal para esta serie.\n\nPrueba con **agosto** en materia prima o mano de obra, o escribe una pregunta con la palabra \`error\` para ver cómo se muestra un fallo.`,
    notes: [],
    actions: [],
  };
}

addDemoRoute("/demo/trend/why", async (req, out) => {
  let body: { question?: string; context?: TrendContext } = {};
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    /* cuerpo inválido: respuesta genérica */
  }
  out.type("application/x-ndjson");
  const send = (o: unknown) => !out.closed() && out.write(`${JSON.stringify(o)}\n`);
  const ctx = body.context;
  if (!ctx?.series || !ctx.point) {
    send({ type: "error", message: "Falta el contexto del punto" });
    return out.end();
  }
  const s = trendScript(ctx, body.question);
  for (const [id, label, detail] of s.steps) {
    send({ type: "step", id, label, status: "run" });
    await sleep(450 + Math.random() * 450);
    send({ type: "step", id, status: "done", ...(detail ? { detail } : {}) });
  }
  if (/error/i.test(body.question ?? "")) {
    send({ type: "text", delta: "Empecé a revisar el periodo, pero " });
    await sleep(400);
    send({ type: "error", message: "el servicio de contabilidad no respondió (timeout)" });
    return out.end();
  }
  for (const src of s.sources) send({ type: "source", ...src });
  const words = s.text.split(/(?<=\s)/);
  for (let i = 0; i < words.length && !out.closed(); ) {
    const n = 1 + Math.floor(Math.random() * 3);
    send({ type: "text", delta: words.slice(i, i + n).join("") });
    i += n;
    await sleep(30 + Math.random() * 40);
  }
  for (const n of s.notes) send({ type: "note", ...n });
  for (const a of s.actions) send({ type: "action", ...a });
  send({ type: "done" });
  out.end();
});

/** Monta la demo de la galería: los dos gráficos, la detección automática y el registro de eventos. */
export function mountTrendDemo(root: HTMLElement): void {
  const cost = root.querySelector<NxTrend>("#trend-cost")!;
  const sales = root.querySelector<NxTrend>("#trend-sales")!;
  cost.series = COST_SERIES;
  cost.anomalies = COST_ANOMALIES;
  sales.series = SALES_SERIES;
  const detect = root.querySelector<HTMLInputElement>("#trend-detect")!;
  detect.addEventListener("change", () => (cost.detect = detect.checked));
  const log = root.querySelector<HTMLOListElement>("#trend-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  root.addEventListener("nx-trend-why", (e) => add(`nx-trend-why → «${e.detail.question}» · POST /demo/trend/why {series: "${e.detail.series.id}", point: {x: "${e.detail.point.x}"}}`));
  root.addEventListener("nx-trend-toggle", (e) => add(`nx-trend-toggle → ${e.detail.id}: ${e.detail.visible ? "visible" : "oculta"}`));
}
