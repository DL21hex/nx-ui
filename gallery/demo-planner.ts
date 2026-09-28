/**
 * Galería: los despachos de Aceros del Caribe en `<nx-planner>`. Nueve camiones y tres montacargas,
 * la semana del festivo del 12 de octubre de 2026 con ~60 entregas a clientes de la región, un
 * mantenimiento (bloqueo) y un choque ya presente. La API de mentira (`/demo/planner/…`) rechaza
 * llevar una entrega a un camión en mantenimiento, para ver la reversión; «Cargar 300 recursos»
 * cambia a una flota generada que llega por `source`, un mes a la vez.
 */
import "../src/components/planner/index";
// Mientras `nx-ui.css` no lo importe (ver INTEGRATION.md); al unir, esta línea sobra.
import type { NxPlanner, PlannerBooking, PlannerResource } from "../src/components/planner/index";
import { plannerParse } from "../src/components/planner/logic";
import { addDemoRoute } from "./demo-api";

// Números pseudoaleatorios con semilla: siempre salen las mismas entregas.
const rng = (s: number) => () => {
  s = (s + 0x6d2b79f5) | 0;
  let t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const p2 = (n: number) => String(n).padStart(2, "0");
/** «2026-10-13T07:30» (hora local, sin zona). */
const at = (y: number, m: number, d: number, min: number) => `${y}-${p2(m)}-${p2(d)}T${p2(Math.floor(min / 60))}:${p2(min % 60)}`;

const TRUCKS: [string, string, number][] = [
  ["TKR-512", "Jorge Pérez", 10],
  ["WNP-208", "Luis Ortega", 10],
  ["SXT-904", "Rafael Charris", 17],
  ["KLM-317", "Andrés De la Hoz", 17],
  ["UYT-645", "Wilmer Cantillo", 8],
  ["GHN-129", "Óscar Barrios", 10],
  ["RTV-783", "Hernán Orozco", 32],
  ["JQD-450", "Camilo Pineda", 17],
  ["PZE-236", "Iván Mejía", 8],
];
export const PLANNER_RESOURCES: PlannerResource[] = [
  ...TRUCKS.map(([plate, driver, t]) => ({ id: plate, name: plate, detail: `${driver} · ${t} t`, icon: "truck", group: "Camiones" })),
  ...[1, 2, 3].map((n) => ({ id: `MC-0${n}`, name: `Montacargas ${n}`, detail: n === 3 ? "Bodega 2 · 5 t" : "Patio de despacho · 3 t", icon: "warehouse", group: "Montacargas" })),
];

/** Clientes: nombre, ciudad y cuánto dura la entrega (ida, descargue y vuelta), en minutos. */
const CLIENTS: [string, string, number][] = [
  ["Ferretería El Tornillo", "Barranquilla", 120],
  ["Metalmecánica Los Andes", "Soledad", 150],
  ["Ferretería La 72", "Barranquilla", 105],
  ["Industrias Metálicas Malambo", "Malambo", 150],
  ["Ferrocentro Galapa", "Galapa", 165],
  ["Obras Civiles Puerto Colombia", "Puerto Colombia", 180],
  ["Construcciones Bocagrande", "Cartagena", 330],
  ["Hierros del Magdalena", "Santa Marta", 300],
  ["Estructuras Metálicas del Cesar", "Valledupar", 480],
  ["Talleres Sinú", "Montería", 510],
  ["Depósito El Progreso", "Sincelejo", 420],
  ["Cerramientos La Guajira", "Riohacha", 450],
  ["Taller Industrial Sabanalarga", "Sabanalarga", 210],
  ["Techos y Estructuras Ciénaga", "Ciénaga", 270],
];
const GOODS = ["Varilla corrugada 1/2″", "Lámina HR 3 mm", "Tubería estructural 2″", "Perfil IPE 200", "Malla electrosoldada", "Ángulo 2″ × 1/4″", "Teja termoacústica", "Alambrón 5,5 mm", "Platina 1 1/2″", "Viga H 150"];

/** La semana del festivo: martes 13 a sábado 17 de octubre de 2026 (el lunes 12 es festivo). */
function makeWeek(): PlannerBooking[] {
  const r = rng(1012);
  const out: PlannerBooking[] = [];
  let n = 100;
  for (const [plate, , tons] of TRUCKS) {
    for (let d = 13; d <= 17; d++) {
      // Mantenimiento del SXT-904 (miércoles y jueves en la mañana) y el jueves del KLM-317, que va aparte.
      if ((plate === "SXT-904" && (d === 14 || d === 15)) || (plate === "KLM-317" && d === 15)) continue;
      const sat = d === 17;
      let t = 360 + Math.floor(r() * 5) * 15; // sale entre 6:00 y 7:00
      const end = sat ? 750 : 1050;
      for (let k = 0; k < 3 && t < end - 90; k++) {
        const [client, city, mins] = CLIENTS[Math.floor(r() * CLIENTS.length)];
        const len = Math.min(mins, end - t);
        if (len < 90 || (k > 0 && r() < 0.5)) break;
        out.push({
          id: `E-${++n}`,
          resource: plate,
          start: at(2026, 10, d, t),
          end: at(2026, 10, d, t + len),
          title: `Entrega ${client}`,
          detail: `${city} · ${GOODS[Math.floor(r() * GOODS.length)]} · ${Math.max(2, Math.round(tons * (0.5 + r() * 0.5)))} t`,
          status: d === 13 && t < 600 ? "active" : d >= 16 && r() < 0.4 ? "tentative" : "confirmed",
        });
        t += len + 30 + Math.floor(r() * 3) * 15;
      }
    }
  }
  out.push({ id: "MT-1", resource: "SXT-904", start: "2026-10-14T06:00", end: "2026-10-15T12:00", title: "Mantenimiento preventivo", detail: "Frenos y suspensión · Taller Diesel Caribe", status: "block", readonly: true });
  // El choque que ya trae la programación: dos entregas del KLM-317 el jueves a la misma hora.
  out.push({ id: "E-89", resource: "KLM-317", start: "2026-10-15T06:30", end: "2026-10-15T12:00", title: "Entrega Construcciones Bocagrande", detail: "Cartagena · Perfil IPE 200 · 14 t", status: "confirmed" });
  out.push({ id: "E-90", resource: "KLM-317", start: "2026-10-15T10:30", end: "2026-10-15T12:30", title: "Entrega Ferretería La 72", detail: "Barranquilla · Malla electrosoldada · 4 t", status: "confirmed" });
  // Montacargas: el cargue de cada salida temprana, 45 min antes, en el primero que esté libre.
  const free = [0, 0, 0];
  let c = 0;
  for (const b of [...out].sort((a, z) => a.start.localeCompare(z.start))) {
    const start = plannerParse(b.start)!;
    if (b.status === "block" || new Date(start).getHours() > 7) continue;
    const from = start - 45 * 6e4;
    const i = free.findIndex((f) => f <= from);
    if (i < 0) continue;
    free[i] = start;
    const d = new Date(from);
    out.push({ id: `C-${++c}`, resource: `MC-0${i + 1}`, start: at(2026, 10, d.getDate(), d.getHours() * 60 + d.getMinutes()), end: b.start, title: `Cargue ${b.resource}`, detail: b.detail?.split(" · ").slice(1).join(" · "), status: "confirmed" });
  }
  // El lunes festivo solo sale una urgencia.
  out.push({ id: "E-1", resource: "RTV-783", start: "2026-10-12T08:00", end: "2026-10-12T11:00", title: "Entrega Construcciones Bocagrande", detail: "Cartagena · Urgente: vaciado de placa · 20 t", status: "active" });
  return out;
}
export const PLANNER_BOOKINGS = makeWeek();

// ---------------------------------------------------------------- flota grande (300 recursos)

const PLATE = "ABCDEFGHJKLMNPRSTUVWXYZ";
const FLEET: PlannerResource[] = (() => {
  const r = rng(300);
  const L = () => PLATE[Math.floor(r() * PLATE.length)];
  const zones = ["Barranquilla", "Cartagena", "Santa Marta", "Valledupar", "Montería", "Sincelejo"];
  return Array.from({ length: 300 }, (_, i) => {
    const plate = `${L()}${L()}${L()}-${p2(Math.floor(r() * 100))}${Math.floor(r() * 10)}`;
    return { id: `F${i}`, name: plate, detail: `Aliado ${1 + (i % 40)} · ${[8, 10, 17, 32][i % 4]} t`, icon: "truck", group: `Sede ${zones[Math.floor(i / 50)]}` };
  });
})();

/** ~2.000 reservas del mes de `from` para la flota (siempre las mismas por mes). */
function fleetMonth(from: number): PlannerBooking[] {
  const d0 = new Date(from);
  const y = d0.getFullYear();
  const m = d0.getMonth() + 1;
  const days = new Date(y, m, 0).getDate();
  const r = rng(y * 100 + m);
  const out: PlannerBooking[] = [];
  for (let i = 0; i < 2000; i++) {
    const res = FLEET[Math.floor(r() * FLEET.length)];
    const d = 1 + Math.floor(r() * days);
    const t = 360 + Math.floor(r() * 36) * 15;
    const [client, city, mins] = CLIENTS[Math.floor(r() * CLIENTS.length)];
    const block = r() < 0.02;
    out.push({ id: `G${m}-${i}`, resource: res.id, start: at(y, m, d, t), end: at(y, m, d, Math.min(1439, t + (block ? 480 : mins))), title: block ? "Mantenimiento" : `Entrega ${client}`, detail: block ? "Taller" : city, status: block ? "block" : r() < 0.2 ? "tentative" : "confirmed", readonly: block || undefined });
  }
  return out;
}

// ---------------------------------------------------------------- API de mentira

/** Los bloqueos que conoce el «servidor» (los de los datos que sirvió por última vez). */
let blocks: PlannerBooking[] = PLANNER_BOOKINGS.filter((b) => b.status === "block");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const when = new Intl.DateTimeFormat("es-CO", { weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

addDemoRoute("/demo/planner", async (req, out) => {
  const path = req.url.pathname.slice(req.url.pathname.indexOf("/demo/planner"));
  out.type("application/json");
  if (path.startsWith("/demo/planner/flota")) {
    await sleep(500);
    if (out.closed()) return;
    const from = plannerParse(req.url.searchParams.get("from")) ?? Date.now();
    const bookings = fleetMonth(from);
    blocks = bookings.filter((b) => b.status === "block");
    return out.end(JSON.stringify({ resources: FLEET, bookings }));
  }
  await sleep(350);
  if (req.method === "DELETE") return out.end("{}");
  let body: Partial<PlannerBooking> = {};
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    /* vacío */
  }
  const a = plannerParse(body.start);
  const b = plannerParse(body.end);
  const hit = blocks.find((x) => x.resource === body.resource && a !== null && b !== null && plannerParse(x.start)! < b && plannerParse(x.end)! > a);
  if (hit) {
    out.status(409);
    return out.end(JSON.stringify({ message: `El ${hit.resource} está en mantenimiento del ${when.format(plannerParse(hit.start)!)} al ${when.format(plannerParse(hit.end)!)}` }));
  }
  // Lo que se crea queda tentativo hasta que despacho lo confirme.
  out.end(JSON.stringify(req.method === "POST" ? { status: "tentative", detail: "Por confirmar con el cliente" } : {}));
});

// ---------------------------------------------------------------- la página

export function mountPlannerDemo(root: HTMLElement): void {
  const planner = root.querySelector<NxPlanner>("#planner-demo")!;
  const log = root.querySelector<HTMLOListElement>("#planner-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 7) log.lastElementChild!.remove();
  };
  const hm = (iso: string) => iso.slice(5, 16).replace("T", " ");
  const small = () => {
    planner.removeAttribute("source");
    blocks = PLANNER_BOOKINGS.filter((b) => b.status === "block");
    planner.resources = PLANNER_RESOURCES;
    planner.bookings = PLANNER_BOOKINGS.map((b) => ({ ...b }));
    planner.view = "week";
    planner.goTo("2026-10-13");
  };
  small();
  planner.addEventListener("nx-planner-change", (e) => {
    const { booking, from, to, via } = e.detail;
    add(`nx-planner-change → ${booking.title}: ${from.resource} ${hm(from.start)} → ${to.resource} ${hm(to.start)}–${to.end.slice(11, 16)} (${via}) · PATCH /demo/planner/reservas/${booking.id}`);
  });
  planner.addEventListener("nx-planner-create", (e) => add(`nx-planner-create → ${e.detail.resource} ${hm(e.detail.start)}–${e.detail.end.slice(11, 16)} (${e.detail.via}) · POST`));
  planner.addEventListener("nx-planner-delete", (e) => add(`nx-planner-delete → ${e.detail.booking.title} (${e.detail.via}) · DELETE`));
  planner.addEventListener("nx-planner-select", (e) => add(`nx-planner-select → ${e.detail.booking.title} · ${e.detail.booking.detail ?? ""}`));
  planner.addEventListener("nx-planner-range", (e) => add(`nx-planner-range → ${e.detail.view}: ${e.detail.from.slice(0, 10)} a ${e.detail.to.slice(0, 10)}`));

  const big = root.querySelector<HTMLButtonElement>("#planner-big")!;
  big.addEventListener("click", () => {
    if (planner.source) return small();
    planner.view = "month";
    planner.goTo("2026-10-01");
    planner.source = "/demo/planner/flota";
  });
  planner.addEventListener("nx-planner-range", () => {
    big.textContent = planner.source ? "Volver a Aceros del Caribe" : "Cargar 300 recursos";
  });
}
