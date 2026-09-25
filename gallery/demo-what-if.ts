/**
 * Demo de `<nx-what-if>`: el plan de compras 2027 de la planta Malambo (estanterías y estructuras
 * metálicas). Cinco supuestos —precio del acero, volumen de ventas, TRM, horas extra y días de
 * inventario— mueven el margen, la utilidad, el costo de materia prima, el capital de trabajo, el
 * punto de equilibrio y el saldo de caja mes a mes. El modelo calcula de verdad (fórmulas de
 * costeo plausibles) y el «backend» lo transmite en NDJSON con pausas cortas, como un servidor.
 */
import { nxFormat } from "../src/core/locale";
import "../src/components/what-if/index";
import type { NxWhatIf, WhatIfInput, WhatIfMetric, WhatIfPoint, WhatIfScenario, WhatIfValues } from "../src/components/what-if/index";
import { addDemoRoute } from "./demo-api";

export const PLAN_INPUTS: WhatIfInput[] = [
  { id: "acero", label: "Precio del acero", value: 780, min: 546, max: 1014, step: 5, format: "money", currency: "US$", hint: "Lámina HR, US$ por tonelada CIF Barranquilla (±30 %)." },
  { id: "volumen", label: "Volumen de ventas", value: 144_000, min: 115_200, max: 172_800, step: 1_440, unit: "u.", hint: "Estanterías y estructuras al año (±20 %)." },
  { id: "trm", label: "Tasa de cambio USD/COP", value: 4_150, min: 3_600, max: 4_800, step: 10, format: "money", currency: "COP", hint: "TRM promedio del año." },
  { id: "horas", label: "Horas extra", value: 1_200, min: 0, max: 3_000, step: 50, unit: "h/mes", hint: "Cada hora extra suma 0,75 unidades de capacidad." },
  { id: "inventario", label: "Días de inventario", value: 45, min: 15, max: 90, step: 1, unit: "días", hint: "Materia prima en bodega." },
];

export const PLAN_METRICS: WhatIfMetric[] = [
  { id: "margen", label: "Margen bruto", format: "percent", better: "up" },
  { id: "utilidad", label: "Utilidad operativa", format: "money", currency: "COP", better: "up" },
  { id: "materia", label: "Costo de materia prima", format: "money", currency: "COP", better: "down" },
  { id: "capital", label: "Capital de trabajo", format: "money", currency: "COP", better: "down" },
  { id: "equilibrio", label: "Punto de equilibrio", format: "number", unit: "u.", better: "down" },
];

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** Estacionalidad de las ventas (suma 12): arranque lento, pico en el último trimestre. */
const SEASON = [0.78, 0.86, 0.97, 1.02, 1.05, 1.0, 0.94, 1.0, 1.06, 1.1, 1.14, 1.08];
const PRICE = 1_250_000; // precio de venta por unidad
const STEEL_T = 0.12; // toneladas de acero por unidad
const OTHER = 250_000; // pintura, tornillería, empaque
const LABOR = 190_000; // mano de obra directa por unidad
const OVERHEAD = 80_000; // energía y gastos variables de planta
const FIXED_MFG = 9_000e6; // costos fijos de planta (incluye depreciación)
const DEPRECIATION = 8_400e6;
const OPEX = 18_000e6; // administración y ventas
const CAPACITY = 140_000; // unidades al año en jornada ordinaria
const OT_RATE = 31_500; // hora extra con recargo
const OT_UNITS = 0.75; // unidades por hora extra
const CARRY = 0.14; // costo de capital del inventario
const DSO = 60; // días de cartera
const DPO = 30; // días de proveedores (el acero se paga a 30 días)
const CASH0 = 6_000e6;
const WC_PREV = 31_000e6; // capital de trabajo al cierre de 2026
const TAX = 3_200e6; // cuotas de renta (abril y junio)
const PRIMA = 1_100e6; // prima de servicios (junio y diciembre)

export const baseValues = (): WhatIfValues => Object.fromEntries(PLAN_INPUTS.map((i) => [i.id, i.value]));

/** El modelo: los supuestos → métricas, saldo de caja mensual y lo que vale la pena avisar. */
export function planModel(v: WhatIfValues) {
  const steelUnit = STEEL_T * v.acero * v.trm;
  const capacity = CAPACITY + v.horas * 12 * OT_UNITS;
  const units = Math.min(v.volumen, capacity);
  const matUnit = steelUnit + OTHER;
  const varUnit = matUnit + LABOR + OVERHEAD;
  const revenue = units * PRICE;
  const overtime = v.horas * 12 * OT_RATE;
  const materials = units * matUnit;
  const cogs = units * varUnit + FIXED_MFG + overtime;
  const inventory = (materials / 365) * v.inventario;
  const carry = inventory * CARRY;
  const op = revenue - cogs - OPEX - carry;
  const capital = inventory + (revenue / 365) * DSO - (materials / 365) * DPO;
  let cash = CASH0;
  const monthly = (op + DEPRECIATION) / 12;
  const cashflow = MONTHS.map((x, i) => {
    cash += SEASON[i] * monthly - (capital - WC_PREV) / 12 - (i === 3 || i === 5 ? TAX : 0) - (i === 5 || i === 11 ? PRIMA : 0);
    return { x, value: Math.round(cash) };
  });
  return {
    metrics: {
      margen: (revenue - cogs) / revenue,
      utilidad: Math.round(op),
      materia: Math.round(materials),
      capital: Math.round(capital),
      equilibrio: Math.round((FIXED_MFG + overtime + OPEX + carry) / (PRICE - varUnit)),
    } as Record<string, number>,
    cashflow,
    lost: Math.max(0, v.volumen - units),
  };
}

/** Las métricas con su base y su valor (para arrancar sin esperar al primer cálculo). */
export function planOutputs(v: WhatIfValues = baseValues()): WhatIfMetric[] {
  const base = planModel(baseValues()).metrics;
  const now = planModel(v).metrics;
  return PLAN_METRICS.map((m) => ({ ...m, base: base[m.id], value: now[m.id] }));
}

export function planSeries(v: WhatIfValues = baseValues()) {
  const base = planModel(baseValues()).cashflow;
  const now = planModel(v).cashflow;
  return { id: "caja", label: "Saldo de caja 2027", format: "money" as const, currency: "COP", points: now.map((p, i): WhatIfPoint => ({ x: p.x, base: base[i].value, value: p.value })) };
}

/** Lo que el modelo quiere decir de este escenario. */
export function planNotes(v: WhatIfValues): { message: string; tone: "warning" | "danger" | "success" }[] {
  const f = nxFormat("es-CO");
  const r = planModel(v);
  const base = planModel(baseValues());
  const out: { message: string; tone: "warning" | "danger" | "success" }[] = [];
  const pct = (n: number) => `${f.number(Math.round(n * 1000) / 10)} %`;
  if (r.metrics.margen < 0.15) out.push({ tone: "warning", message: `El margen bruto cae a ${pct(r.metrics.margen)}: queda bajo el 15 % que pide la junta directiva.` });
  if (r.lost > 0) out.push({ tone: "warning", message: `La planta no alcanza: se dejan de vender ${f.number(Math.round(r.lost))} unidades. Sube las horas extra.` });
  const red = r.cashflow.find((p) => p.value < 0);
  if (red) out.push({ tone: "danger", message: `La caja queda en rojo en ${red.x}: habría que pedir un crédito de tesorería.` });
  if (v.inventario < 20) out.push({ tone: "warning", message: "Con menos de 20 días de inventario, cualquier retraso del proveedor para la línea." });
  if (!out.length && r.metrics.utilidad > base.metrics.utilidad * 1.1) out.push({ tone: "success", message: `La utilidad operativa sube ${pct(r.metrics.utilidad / base.metrics.utilidad - 1)} frente al plan base.` });
  return out;
}

const scenario = (id: string, name: string, change: WhatIfValues): WhatIfScenario => {
  const inputs = { ...baseValues(), ...change };
  return { id, name, inputs, outputs: planModel(inputs).metrics };
};

/** Dos escenarios que el equipo de compras ya guardó. */
export const PLAN_SCENARIOS: WhatIfScenario[] = [
  scenario("acero-caro", "Acero +15 % y TRM 4.400", { acero: 897, trm: 4_400 }),
  scenario("agresivo", "Plan agresivo de ventas", { volumen: 161_280, horas: 2_400, inventario: 60 }),
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// El «servidor» del cálculo: POST {inputs} → NDJSON con las métricas, la caja y las notas.
addDemoRoute("/demo/what-if", async (req, out) => {
  let body: { inputs?: WhatIfValues } = {};
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    /* cuerpo inválido: la base */
  }
  const v = { ...baseValues(), ...(body.inputs ?? {}) };
  const send = (o: unknown) => !out.closed() && out.write(`${JSON.stringify(o)}\n`);
  out.type("application/x-ndjson");
  const base = planModel(baseValues()).metrics;
  const now = planModel(v).metrics;
  await sleep(220);
  for (const m of PLAN_METRICS) {
    if (out.closed()) return;
    send({ type: "metric", ...m, base: base[m.id], value: now[m.id] });
    await sleep(60);
  }
  send({ type: "series", ...planSeries(v) });
  for (const n of planNotes(v)) send({ type: "note", ...n });
  await sleep(40);
  send({ type: "done" });
  out.end();
});

/** La página de la galería: el simulador contra el backend de mentira, y el registro de eventos. */
export function mountWhatIfDemo(root: HTMLElement): void {
  const el = root.querySelector<NxWhatIf>("#what-if-demo")!;
  el.inputs = PLAN_INPUTS;
  el.outputs = planOutputs();
  el.series = [planSeries()];
  el.scenarios = PLAN_SCENARIOS;
  const log = root.querySelector<HTMLOListElement>("#what-if-log")!;
  const add = (text: string, replace = false) => {
    // Mover un deslizador no llena el registro: el último cambio reemplaza al anterior.
    if (replace && log.firstElementChild?.textContent?.startsWith("nx-what-if-change")) log.firstElementChild.remove();
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  el.addEventListener("nx-what-if-change", (e) => add(`nx-what-if-change → ${e.detail.id ? `${e.detail.id} = ${e.detail.inputs[e.detail.id]}` : "varios supuestos"}`, true));
  el.addEventListener("nx-what-if-save", (e) => add(`nx-what-if-save → ${e.detail.action} «${e.detail.scenario.name}» · PUT /compras/plan-2027/escenarios (${e.detail.scenarios.length})`));
}
