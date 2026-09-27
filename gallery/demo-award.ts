/**
 * Demo de `<nx-award>`: la RFQ-0412 de la obra Torres del Parque, 60 artículos en cinco grupos
 * cotizados por diez proveedores. El «backend» hace de IA: puntúa con los pesos que llegan (precio,
 * plazo, calificación del proveedor), descarta lo atípico, marca las decisiones cerradas, la única
 * cotización y al proveedor con la póliza por vencer, arma dos escenarios y lo transmite en NDJSON
 * artículo por artículo, como un servidor.
 */
import "../src/components/award/index";
import type { AwardCriterion, AwardItem, AwardQuote, AwardSupplier, NxAward } from "../src/components/award/index";
import { nxFormat } from "../src/core/locale";
import { addDemoRoute } from "./demo-api";

type S = AwardSupplier & { rating: number; lead: number; bias: number; groups: Record<string, number> };

const G = { el: "Eléctricos", hi: "Hidráulicos", og: "Obra gris", fe: "Ferretería", pi: "Pinturas y acabados" };

const SUPPLIERS: S[] = [
  { id: "ferrecaribe", name: "Ferrecaribe", rating: 4.6, lead: 5, bias: 1.0, groups: { el: 0.5, hi: 0.7, og: 0.4, fe: 0.95, pi: 0.6 } },
  { id: "andes", name: "Suministros Andes", rating: 4.2, lead: 8, bias: 0.96, groups: { el: 0.6, hi: 0.6, og: 0.8, fe: 0.7, pi: 0.5 } },
  { id: "norte", name: "Eléctricos del Norte", rating: 4.4, lead: 3, bias: 0.98, groups: { el: 0.97, hi: 0.1, og: 0, fe: 0.3, pi: 0 } },
  { id: "sabana", name: "Distri Sabana", rating: 3.9, lead: 12, bias: 0.93, groups: { el: 0.4, hi: 0.5, og: 0.9, fe: 0.6, pi: 0.7 } },
  { id: "malambo", name: "Aceros Malambo", rating: 4.0, lead: 6, bias: 0.97, groups: { el: 0, hi: 0.2, og: 0.95, fe: 0.4, pi: 0 } },
  { id: "tresr", name: "Hidráulicos 3R", rating: 4.7, lead: 4, bias: 1.03, groups: { el: 0.1, hi: 0.98, og: 0.2, fe: 0.3, pi: 0.1 } },
  { id: "rivera", name: "Tornillos Rivera", rating: 3.6, lead: 10, bias: 0.95, groups: { el: 0.2, hi: 0.3, og: 0.5, fe: 0.95, pi: 0.3 } },
  { id: "union", name: "Metales Unión", rating: 4.3, lead: 7, bias: 0.99, groups: { el: 0.5, hi: 0.4, og: 0.7, fe: 0.6, pi: 0.2 }, alert: "Póliza de cumplimiento vence el 30 sep" },
  { id: "costa", name: "Pinturas Costa", rating: 3.8, lead: 5, bias: 0.97, groups: { el: 0, hi: 0, og: 0.3, fe: 0.4, pi: 0.97 } },
  { id: "covial", name: "Grupo Covial", rating: 4.1, lead: 15, bias: 0.9, groups: { el: 0.5, hi: 0.5, og: 0.6, fe: 0.5, pi: 0.5 } },
];
for (const s of SUPPLIERS) s.detail = `★ ${String(s.rating).replace(".", ",")} · ${s.lead} d`;

// [grupo, nombre, cantidad, unidad, precio de referencia]
const RAW: [keyof typeof G, string, number, string, number][] = [
  ["el", "Cable THHN 12 AWG", 1500, "m", 3200],
  ["el", "Cable THHN 10 AWG", 800, "m", 4900],
  ["el", "Breaker 1x20 A", 120, "und", 24900],
  ["el", "Breaker 2x40 A", 30, "und", 68000],
  ["el", "Tomacorriente doble con polo a tierra", 300, "und", 7800],
  ["el", "Interruptor sencillo", 260, "und", 6500],
  ["el", "Caja 2x4 metálica", 400, "und", 2100],
  ["el", "Tubo conduit EMT ½\" x 3 m", 350, "und", 14800],
  ["el", "Panel LED 60x60 40 W", 90, "und", 118000],
  ["el", "Reflector LED 100 W", 24, "und", 145000],
  ["el", "Cinta aislante 20 m", 200, "und", 5200],
  ["el", "Tablero de 12 circuitos", 10, "und", 189000],
  ["el", "Bombillo LED 12 W", 500, "und", 6900],
  ["el", "Cable encauchetado 3x12", 300, "m", 8900],
  ["hi", "Tubo PVC presión ½\" x 6 m", 240, "und", 18500],
  ["hi", "Tubo PVC presión ¾\" x 6 m", 180, "und", 26400],
  ["hi", "Tubo PVC sanitario 4\" x 6 m", 90, "und", 98000],
  ["hi", "Codo PVC ½\" x 90°", 600, "und", 900],
  ["hi", "Tee PVC ½\"", 400, "und", 1100],
  ["hi", "Registro de bola ½\"", 80, "und", 24500],
  ["hi", "Llave de paso ½\"", 60, "und", 19800],
  ["hi", "Soldadura PVC ¼ gal", 40, "und", 42000],
  ["hi", "Limpiador PVC ¼ gal", 40, "und", 28000],
  ["hi", "Sifón de lavamanos", 50, "und", 16500],
  ["hi", "Tanque de agua 1.000 L", 6, "und", 489000],
  ["hi", "Cinta teflón", 300, "und", 1200],
  ["og", "Cemento gris 50 kg", 400, "bulto", 32800],
  ["og", "Arena de río", 30, "m³", 95000],
  ["og", "Gravilla ¾\"", 25, "m³", 110000],
  ["og", "Varilla corrugada ⅜\" x 6 m", 800, "und", 27400],
  ["og", "Varilla corrugada ½\" x 6 m", 500, "und", 46800],
  ["og", "Bloque #5", 6000, "und", 1850],
  ["og", "Ladrillo tolete", 4000, "und", 980],
  ["og", "Alambre negro cal. 18", 150, "kg", 8900],
  ["og", "Malla electrosoldada 15x15", 60, "und", 96000],
  ["og", "Impermeabilizante 5 gal", 20, "cuñete", 265000],
  ["og", "Mortero seco 40 kg", 120, "bulto", 21500],
  ["og", "Teja fibrocemento #6", 80, "und", 42500],
  ["fe", "Tornillo drywall 6x1\" (caja x1000)", 60, "caja", 21500],
  ["fe", "Chazo plástico ¼\" (caja x100)", 80, "caja", 6800],
  ["fe", "Clavo 2½\" con cabeza", 100, "kg", 8200],
  ["fe", "Disco de corte 4½\"", 150, "und", 5400],
  ["fe", "Broca para concreto ⅜\"", 60, "und", 9800],
  ["fe", "Guante de nitrilo T9", 300, "par", 6900],
  ["fe", "Casco de seguridad", 40, "und", 32000],
  ["fe", "Gafas de seguridad", 80, "und", 8500],
  ["fe", "Cinta de enmascarar 1\"", 200, "und", 4200],
  ["fe", "Silicona transparente 280 ml", 96, "und", 15800],
  ["fe", "Espuma expansiva 750 ml", 48, "und", 29500],
  ["fe", "Candado 40 mm", 30, "und", 26000],
  ["pi", "Vinilo tipo 1 blanco 5 gal", 45, "cuñete", 289000],
  ["pi", "Esmalte blanco 1 gal", 30, "gal", 78000],
  ["pi", "Estuco plástico 5 gal", 40, "cuñete", 98000],
  ["pi", "Lija de agua #150", 400, "und", 1600],
  ["pi", "Rodillo de felpa 9\"", 60, "und", 14500],
  ["pi", "Brocha 3\"", 80, "und", 7900],
  ["pi", "Thinner 1 gal", 40, "gal", 32000],
  ["pi", "Sellador acrílico 5 gal", 15, "cuñete", 185000],
  ["pi", "Cerámica piso 45x45", 220, "m²", 38900],
  ["pi", "Pegante cerámico 25 kg", 110, "bulto", 24500],
];

export const AWARD_ITEMS: AwardItem[] = RAW.map(([g, name, qty, unit], i) => ({ id: `A${String(i + 1).padStart(2, "0")}`, code: `REF-${1040 + i * 7}`, name, qty, unit, group: G[g] }));

export const AWARD_CRITERIA: AwardCriterion[] = [
  { id: "precio", label: "Precio", weight: 50 },
  { id: "plazo", label: "Plazo", weight: 30 },
  { id: "calidad", label: "Calificación", weight: 20 },
];

/** Números pseudoaleatorios con semilla: la misma RFQ en cada visita. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = nxFormat("es-CO");
const round = (n: number) => (n >= 1000 ? Math.round(n / 10) * 10 : Math.round(n));

function makeQuotes(): AwardQuote[] {
  const r = rng(412);
  const out: AwardQuote[] = [];
  RAW.forEach(([g, , , unit, base], i) => {
    const item = AWARD_ITEMS[i];
    if (item.name.startsWith("Tablero")) return; // nadie lo cotizó
    for (const s of SUPPLIERS) {
      const only = item.name.startsWith("Tanque");
      if (only ? s.id !== "tresr" : r() > s.groups[g]) continue;
      const price = round(base * s.bias * (0.88 + r() * 0.26));
      const q: AwardQuote = { item: item.id, supplier: s.id, price, leadTime: Math.max(1, s.lead + Math.round(r() * 4 - 2)) };
      if (s.id === "norte" && (item.name.includes("LED") || item.name.startsWith("Breaker"))) q.original = `US$ ${f.number(Math.round((price / 4150) * 100) / 100)} · TRM 4.150 · IVA incluido`;
      if (unit === "caja" && s.id === "rivera") q.original = `$ ${f.number(Math.round(price / 10))} el paquete x100 (se compara la caja x1000)`;
      if (r() < 0.04) q.note = `Entrega parcial: ${f.number(Math.round(item.qty * 0.7))} de ${f.number(item.qty)} ${unit}`;
      out.push(q);
    }
  });
  // El dedazo: Tornillos Rivera cotizó el cemento por bulto de 25 kg y el normalizador no lo vio.
  const cem = AWARD_ITEMS.find((i) => i.name.startsWith("Cemento"))!.id;
  const bad = out.find((q) => q.item === cem && q.supplier === "rivera") ?? (out.push({ item: cem, supplier: "rivera", price: 0, leadTime: 9 }), out.at(-1)!);
  bad.price = 17060;
  bad.original = "$ 17.060 el bulto (25 kg)";
  return out;
}
export const AWARD_QUOTES = makeQuotes();

// ---------------------------------------------------------------- la «IA»

type Rank = { supplier: string; score: number; scores: Record<string, number> };
const byId = new Map(SUPPLIERS.map((s) => [s.id, s]));

export function recommend(weights: Record<string, number>, excluded: Set<string>) {
  const w = AWARD_CRITERIA.map((c) => Math.max(0, weights[c.id] ?? c.weight));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const lines: Record<string, unknown>[] = [];
  const recs = new Map<string, Rank[]>();
  for (const it of AWARD_ITEMS) {
    const qs = AWARD_QUOTES.filter((q) => q.item === it.id);
    const prices = qs.map((q) => q.price).sort((a, b) => a - b);
    const med = prices[Math.floor(prices.length / 2)];
    const odd = qs.filter((q) => qs.length > 2 && q.price < med * 0.65);
    const ok = qs.filter((q) => !odd.includes(q) && !excluded.has(q.supplier));
    const flags: Record<string, unknown>[] = odd.map((q) => ({ type: "flag", item: it.id, supplier: q.supplier, message: `${byId.get(q.supplier)!.name} cotiza ${Math.round((1 - q.price / med) * 100)} % bajo la mediana: ¿otra unidad o empaque? No se tuvo en cuenta.` }));
    if (!qs.length) {
      lines.push({ type: "recommend", item: it.id, supplier: null, ranking: [] });
      lines.push({ type: "flag", item: it.id, message: "Nadie cotizó: hay que invitar a otros proveedores o comprarlo por fuera.", tone: "danger" });
      continue;
    }
    const minP = Math.min(...ok.map((q) => q.price));
    const minL = Math.min(...ok.map((q) => q.leadTime ?? 99));
    const ranking: Rank[] = ok
      .map((q) => {
        const s = byId.get(q.supplier)!;
        const scores = { precio: Math.round((minP / q.price) * 1000) / 10, plazo: Math.round((minL / (q.leadTime ?? 99)) * 1000) / 10, calidad: Math.round((s.rating / 5) * 1000) / 10 };
        return { supplier: q.supplier, scores, score: Math.round(((w[0] * scores.precio + w[1] * scores.plazo + w[2] * scores.calidad) / sum) * 10) / 10 };
      })
      .sort((a, b) => b.score - a.score);
    recs.set(it.id, ranking);
    const top = ranking[0];
    const q = top && ok.find((x) => x.supplier === top.supplier)!;
    let reason: string | undefined;
    if (q) {
      const over = q.price / minP - 1;
      reason =
        q.price === minP
          ? `El precio más bajo, con entrega en ${q.leadTime} días.`
          : q.leadTime === minL
            ? `No es el más barato (+${f.number(Math.round(over * 1000) / 10)} %), pero entrega en ${q.leadTime} días.`
            : `Buen equilibrio: +${f.number(Math.round(over * 1000) / 10)} % sobre el más barato, ${q.leadTime} días y calificación ${String(byId.get(q.supplier)!.rating).replace(".", ",")}.`;
    }
    lines.push({ type: "recommend", item: it.id, supplier: top?.supplier ?? null, reason, ranking });
    if (ok.length === 1) flags.push({ type: "flag", item: it.id, message: "Única cotización: no hay con qué comparar. Conviene pedir al menos otra." });
    else if (ranking.length > 1 && ranking[0].score - ranking[1].score < 2)
      flags.push({ type: "flag", item: it.id, message: `Decisión cerrada: ${byId.get(ranking[1].supplier)!.name} queda a ${f.number(Math.round((ranking[0].score - ranking[1].score) * 10) / 10)} puntos.`, tone: "neutral" });
    if (top && byId.get(top.supplier)!.alert) flags.push({ type: "flag", item: it.id, supplier: top.supplier, message: `${byId.get(top.supplier)!.name}: ${byId.get(top.supplier)!.alert!.toLowerCase()}.` });
    lines.push(...flags);
  }
  // Escenarios: consolidar en tres proveedores, o todo en cinco días o menos.
  const spend = new Map<string, number>();
  for (const it of AWARD_ITEMS) {
    const top = recs.get(it.id)?.[0];
    if (top) spend.set(top.supplier, (spend.get(top.supplier) ?? 0) + AWARD_QUOTES.find((q) => q.item === it.id && q.supplier === top.supplier)!.price * it.qty);
  }
  const three = [...spend].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([s]) => s);
  const lead = (item: string, s: string) => AWARD_QUOTES.find((q) => q.item === item && q.supplier === s)?.leadTime ?? 99;
  const pick = (ok: (r: Rank, item: string) => boolean) =>
    Object.fromEntries(
      AWARD_ITEMS.flatMap((it) => {
        const r = recs.get(it.id)?.find((x) => ok(x, it.id));
        return r ? [[it.id, r.supplier]] : [];
      }),
    );
  lines.push({ type: "scenario", id: "tres", label: "Máximo 3 proveedores", detail: three.map((s) => byId.get(s)!.name).join(", "), picks: pick((r) => three.includes(r.supplier)) });
  lines.push({ type: "scenario", id: "rapido", label: "Entrega en 5 días o menos", picks: pick((r, item) => lead(item, r.supplier) <= 5) });
  if (excluded.size) lines.push({ type: "note", message: `Sin ${[...excluded].map((s) => byId.get(s)?.name ?? s).join(", ")} en la sugerencia.` });
  return lines;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

addDemoRoute("/demo/award", async (req, out) => {
  let body: { weights?: Record<string, number>; excluded?: string[] } = {};
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    /* cuerpo inválido: los pesos de base */
  }
  const lines = recommend(body.weights ?? {}, new Set(body.excluded ?? []));
  out.type("application/x-ndjson");
  await sleep(350);
  for (const l of lines) {
    if (out.closed()) return;
    out.write(`${JSON.stringify(l)}\n`);
    // Artículo por artículo, como un modelo que va revisando.
    if (l.type === "recommend") await sleep(22);
  }
  out.write(`${JSON.stringify({ type: "done" })}\n`);
  out.end();
});

/** La página de la galería: el cuadro contra la IA de mentira, y el registro de eventos. */
export function mountAwardDemo(root: HTMLElement): void {
  const el = root.querySelector<NxAward>("#award-demo")!;
  el.suppliers = SUPPLIERS.map(({ id, name, detail, alert }) => ({ id, name, detail, alert }));
  el.items = AWARD_ITEMS;
  el.quotes = AWARD_QUOTES;
  el.criteria = AWARD_CRITERIA;
  const log = root.querySelector<HTMLOListElement>("#award-log")!;
  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? id) : "—");
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  el.addEventListener("nx-award-change", (e) => {
    const d = e.detail;
    const it = AWARD_ITEMS.find((i) => i.id === d.item);
    add(it ? `nx-award-change → ${it.name}: ${name(d.supplier)}${d.supplier !== d.recommended ? ` (la IA sugiere ${name(d.recommended)})` : ""}${d.reason ? ` · «${d.reason}»` : ""}` : "nx-award-change → varios artículos");
  });
  el.addEventListener("nx-award-submit", (e) => {
    const d = e.detail;
    add(`nx-award-submit → ${d.orders.length} órdenes por ${f.money(d.total, { currency: "COP" })} · ${d.changes.length} cambios frente a la IA${d.unassigned.length ? ` · ${d.unassigned.length} sin adjudicar` : ""}`);
  });
}
