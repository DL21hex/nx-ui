/**
 * Demo de `<nx-cards>`: 142 proveedores de ejemplo (los 10 de la RFQ-0412 de `<nx-award>` y el resto
 * generados con semilla fija) en los tres niveles del zoom. Las acciones de la tarjeta abierta y los
 * cambios de nivel quedan en el registro.
 */
import "../src/components/cards/index";
import type { CardsActionDetail, CardsField, CardsLayout, CardsOpenDetail, CardsRow, NxCards } from "../src/components/cards/index";
import { nxFormat } from "../src/core/locale";

const f = nxFormat("es-CO");

// Números pseudoaleatorios con semilla: siempre salen los mismos proveedores.
let seed = 412;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const between = (a: number, b: number) => a + rnd() * (b - a);

const CATS = { el: "Eléctricos", hi: "Hidráulicos", og: "Obra gris", fe: "Ferretería", pi: "Pinturas y acabados" } as const;
type Cat = keyof typeof CATS;
const CITIES = ["Barranquilla", "Soledad", "Malambo", "Cartagena", "Santa Marta", "Bogotá", "Medellín", "Bucaramanga", "Cali", "Valledupar", "Montería", "Sincelejo"];
const SEED: [string, Cat, number, number, string][] = [
  ["Ferrecaribe", "fe", 4.6, 5, "Barranquilla"],
  ["Suministros Andes", "og", 4.2, 8, "Bogotá"],
  ["Eléctricos del Norte", "el", 4.4, 3, "Barranquilla"],
  ["Distri Sabana", "og", 3.9, 12, "Bogotá"],
  ["Aceros Malambo", "og", 4.0, 6, "Malambo"],
  ["Hidráulicos 3R", "hi", 4.7, 4, "Soledad"],
  ["Tornillos Rivera", "fe", 3.6, 10, "Barranquilla"],
  ["Metales Unión", "og", 4.3, 7, "Cartagena"],
  ["Pinturas Costa", "pi", 3.8, 5, "Santa Marta"],
  ["Grupo Covial", "og", 4.1, 15, "Medellín"],
];
const PRE: [string, Cat | null][] = [
  ["Ferretería", "fe"], ["Distribuidora", null], ["Suministros", null], ["Aceros", "og"], ["Eléctricos", "el"], ["Hidráulicos", "hi"],
  ["Pinturas", "pi"], ["Tornillos", "fe"], ["Metales", "og"], ["Grupo", null], ["Comercial", null], ["Depósito", "og"],
  ["Materiales", "og"], ["Cables", "el"], ["Tubos y Accesorios", "hi"], ["Acabados", "pi"], ["Iluminación", "el"], ["Maderas", "og"],
];
const SUF = ["del Norte", "Caribe", "Andina", "La Sabana", "Costa Azul", "El Prado", "Atlántico", "del Valle", "Magdalena", "La 30", "Central", "Puerto Colombia", "San José", "Santa Fe", "La Esperanza", "Oriente", "Pacífico", "Los Llanos", "El Rodadero", "Bocagrande", "La Castellana", "Alameda", "Galerías", "Villa Country"];
const FIRST = ["Carolina", "Andrés", "Luisa", "Jorge", "Paola", "Camilo", "Natalia", "Hernán", "Daniela", "Óscar", "Mónica", "Felipe", "Yesenia", "Rafael", "Adriana", "Iván"];
const LAST = ["Pérez", "Rodríguez", "Gómez", "Martínez", "Barrios", "Charris", "De la Hoz", "Ospina", "Mejía", "Cantillo", "Pineda", "Rojas", "Orozco", "Villa"];
const NOTES: Record<string, string[]> = {
  revision: ["RUT actualizado pendiente", "Certificación bancaria en revisión", "Proveedor nuevo: faltan referencias"],
  bloqueado: ["Facturas con glosa sin resolver", "Incumplió dos entregas seguidas", "Póliza de cumplimiento vencida"],
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.UTC(2026, 8, 28 - n));
const money = (v: number) => (v < 1e8 ? `$ ${f.number(Math.round(v / 1e5) / 10)} M` : `$ ${f.number(Math.round(v / 1e6))} M`);

function makeRows(): CardsRow[] {
  const used = new Set(SEED.map((s) => s[0]));
  const base = SEED.map(([name, cat, rating, lead, city]) => ({ name, cat, rating, lead, city }));
  while (base.length < 142) {
    const [p, pc] = pick(PRE);
    const name = `${p} ${pick(SUF)}`;
    if (used.has(name)) continue;
    used.add(name);
    base.push({ name, cat: pc ?? pick(Object.keys(CATS) as Cat[]), rating: +between(3.3, 4.9).toFixed(1), lead: 2 + Math.floor(rnd() * 15), city: pick(CITIES) });
  }
  return base.map((r, i) => {
    const compras = Math.round(30e6 * Math.pow(10, rnd() * 1.7 + (rnd() > 0.88 ? 0.45 : 0)));
    const trend = (rnd() - 0.4) * 0.9;
    const raw = Array.from({ length: 12 }, (_, m) => Math.max(0.06, (1 + trend * (m / 11 - 0.5)) * (1 + 0.12 * Math.sin((m * Math.PI) / 3 + i)) * (1 + (rnd() - 0.5) * 0.5)));
    const sum = raw.reduce((a, b) => a + b, 0);
    const months = raw.map((v) => Math.round((v / sum) * compras));
    const last3 = months.slice(9).reduce((a, b) => a + b, 0);
    const prev3 = months.slice(6, 9).reduce((a, b) => a + b, 0);
    const s = rnd();
    let state = s < 0.045 ? "bloqueado" : s < 0.11 ? "vence" : s < 0.19 ? "revision" : "ok";
    if (r.name === "Metales Unión") state = "vence";
    if (r.name === "Hidráulicos 3R" || r.name === "Ferrecaribe") state = "ok";
    const cumpl = Math.round(state === "bloqueado" ? between(58, 78) : state === "revision" ? between(76, 95) : between(84, 99.4));
    const ago = state === "bloqueado" ? 60 + Math.floor(rnd() * 90) : 1 + Math.floor(rnd() * 40);
    const note = state === "vence" ? `Póliza de cumplimiento vence el ${f.date(iso(new Date(Date.UTC(2026, 8, 30 + Math.floor(rnd() * 14))))).replace(/ \d{4}$/, "")}` : NOTES[state] ? pick(NOTES[state]) : "";
    const oc = 800 + Math.floor(rnd() * 400);
    const orders = [0, 1, 2].map((k) => ({
      title: `OC-2026-${String(oc - k * (7 + Math.floor(rnd() * 30))).padStart(4, "0")}`,
      meta: f.date(iso(daysAgo(ago + k * (12 + Math.floor(rnd() * 25))))),
      value: money((compras / 12) * between(0.25, 1.3)),
      status: k === 0 ? (state === "bloqueado" ? "Retenida" : ago < 9 ? "En tránsito" : "Entregada") : "Entregada",
      tone: k === 0 && state === "bloqueado" ? "danger" : k === 0 && ago < 9 ? "info" : "success",
    }));
    return {
      id: `p${i}`,
      name: r.name,
      cat: CATS[r.cat],
      city: r.city,
      state,
      note,
      compras,
      delta: prev3 ? (last3 / prev3 - 1) * 100 : 0,
      months,
      rating: r.rating,
      lead: r.lead,
      cumpl,
      last: iso(daysAgo(ago)),
      nit: `${f.number(800000000 + Math.floor(rnd() * 101000000))}-${Math.floor(rnd() * 10)}`,
      contact: `${pick(FIRST)} ${pick(LAST)}`,
      orders,
    };
  });
}

const FIELDS: CardsField[] = [
  { key: "name", label: "Nombre", sort: "asc" },
  { key: "cat", label: "Categoría", group: true },
  { key: "city", label: "Ciudad", group: true },
  {
    key: "state",
    label: "Estado",
    type: "status",
    group: true,
    options: [
      { value: "ok", label: "Al día", tone: "success", quiet: true },
      { value: "vence", label: "Póliza por vencer", tone: "warning" },
      { value: "revision", label: "En revisión", tone: "info" },
      { value: "bloqueado", label: "Bloqueado", tone: "danger" },
    ],
  },
  { key: "note", label: "Nota" },
  { key: "compras", label: "Compras en 12 meses", type: "money", currency: "COP", sort: "desc" },
  { key: "delta", label: "Último trimestre" },
  { key: "cumpl", label: "Entregas a tiempo", type: "percent", sort: "asc", good: 90, bad: 80 },
  { key: "rating", label: "Calificación", type: "rating", sort: "desc" },
  { key: "lead", label: "Plazo de entrega", type: "number", unit: "días", sort: "asc" },
  { key: "last", label: "Última orden", type: "date" },
  { key: "nit", label: "NIT", search: true },
  { key: "contact", label: "Contacto", search: true },
  { key: "orders", label: "Últimas órdenes de compra" },
];

const LAYOUT: CardsLayout = {
  title: "name",
  subtitle: ["cat", "city"],
  status: "state",
  note: "note",
  value: "compras",
  delta: "delta",
  trend: "months",
  brief: ["rating", "lead", "cumpl"],
  facts: ["rating", "lead", "cumpl", "last", "nit", "contact"],
  related: "orders",
};

export function mountCardsDemo(root: HTMLElement): void {
  const el = root.querySelector<NxCards>("#cards-demo")!;
  el.fields = FIELDS;
  el.layout = LAYOUT;
  el.actions = [
    { id: "orden", label: "Nueva orden de compra", primary: true, disabledFor: ["bloqueado"] },
    { id: "cotizaciones", label: "Ver cotizaciones" },
  ];
  el.rows = makeRows();

  const log = root.querySelector<HTMLOListElement>("#cards-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  el.addEventListener("nx-cards-level", (e) => add(`nx-cards-level → ${e.detail.level}`));
  el.addEventListener("nx-cards-open", (e) => {
    const d = (e as CustomEvent<CardsOpenDetail>).detail;
    add(`nx-cards-open → ${d.row.name} (${d.open ? "abierta" : "cerrada"})`);
  });
  el.addEventListener("nx-cards-action", (e) => {
    const d = (e as CustomEvent<CardsActionDetail>).detail;
    add(`nx-cards-action → ${d.action} · ${d.row.name}`);
  });
}
