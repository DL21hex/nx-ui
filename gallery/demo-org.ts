/**
 * Demo de `<nx-org>`: un grupo de tres empresas con unas 300 personas, generado con semilla fija
 * (siempre sale el mismo). Quien mira es una analista de rutas de Logística Caribe; el registro
 * muestra cada cambio de foco.
 */
import "../src/components/org/index";
import type { NxOrg, OrgFocusDetail, OrgMetric, OrgPerson, OrgUnit } from "../src/components/org/index";

let seed = 77;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => Math.floor(a + rnd() * (b - a + 1));

const FIRST = ["Ana", "Luis", "María", "Carlos", "Laura", "Andrés", "Sofía", "Jorge", "Valentina", "Felipe", "Camila", "Julián", "Paula", "Diego", "Natalia", "Sebastián", "Daniela", "Mateo", "Isabel", "Tomás", "Lucía", "Samuel", "Mariana", "Esteban", "Juana", "Óscar", "Rosa", "Héctor", "Gloria", "Iván"];
const LAST = ["Gómez", "Rodríguez", "Martínez", "López", "Ríos", "Pérez", "Díaz", "Moreno", "Rojas", "Vargas", "Castro", "Ortiz", "Suárez", "Mendoza", "Peña", "Cárdenas", "Herrera", "Salazar", "Navarro", "Acosta", "Mejía", "Pardo", "Restrepo", "Ospina", "Quintero"];
const name = () => `${pick(FIRST)} ${pick(LAST)} ${pick(LAST)}`;

/** Empresa → subdivisiones con su líder, sus supervisores y los cargos de su gente. */
const PLAN: { id: string; name: string; subs: { id: string; name: string; lead: string; sup: string; roles: [string, number][] }[] }[] = [
  {
    id: "agro",
    name: "Agrovid",
    subs: [
      { id: "agro-esp", name: "Finca La Esperanza", lead: "Jefe de finca", sup: "Supervisor de campo", roles: [["Operario agrícola", 48], ["Tractorista", 6], ["Auxiliar de bodega", 4]] },
      { id: "agro-pal", name: "Finca Las Palmas", lead: "Jefe de finca", sup: "Supervisor de campo", roles: [["Operario agrícola", 34], ["Tractorista", 4], ["Fumigador", 5]] },
      { id: "agro-emp", name: "Empacadora", lead: "Jefe de planta", sup: "Supervisor de turno", roles: [["Operario de empaque", 30], ["Montacarguista", 3], ["Inspector de calidad", 4]] },
      { id: "agro-adm", name: "Administración", lead: "Directora administrativa", sup: "Coordinador", roles: [["Analista contable", 5], ["Auxiliar de nómina", 3], ["Asistente", 2]] },
    ],
  },
  {
    id: "qual",
    name: "Quality",
    subs: [
      { id: "qual-lab", name: "Laboratorio", lead: "Jefa de laboratorio", sup: "Coordinadora de análisis", roles: [["Analista de laboratorio", 12], ["Auxiliar de muestras", 6]] },
      { id: "qual-cert", name: "Certificaciones", lead: "Jefe de certificaciones", sup: "Auditor líder", roles: [["Auditor", 8], ["Asistente", 2]] },
      { id: "qual-com", name: "Comercial", lead: "Gerente comercial", sup: "Ejecutivo senior", roles: [["Ejecutivo de cuenta", 7]] },
    ],
  },
  {
    id: "log",
    name: "Logística Caribe",
    subs: [
      { id: "log-baq", name: "Centro Barranquilla", lead: "Jefe de centro", sup: "Supervisor de operación", roles: [["Conductor", 22], ["Auxiliar de despacho", 10], ["Analista de rutas", 4]] },
      { id: "log-ctg", name: "Centro Cartagena", lead: "Jefe de centro", sup: "Supervisor de operación", roles: [["Conductor", 14], ["Auxiliar de despacho", 6]] },
      { id: "log-tal", name: "Taller", lead: "Jefe de taller", sup: "Mecánico líder", roles: [["Mecánico", 8], ["Electricista automotriz", 2]] },
    ],
  },
];

const units: OrgUnit[] = [{ id: "grupo", name: "Grupo Andino", kind: "Grupo" }];
const people: OrgPerson[] = [];
let n = 0;
const add = (p: Omit<OrgPerson, "id" | "name">): OrgPerson => {
  const person = { id: `e${++n}`, name: name(), ...p };
  people.push(person);
  return person;
};

const ceo = add({ title: "Presidente", unit: "grupo" });
add({ title: "Asistente de presidencia", unit: "grupo", boss: ceo.id });
let me: OrgPerson | undefined;
for (const co of PLAN) {
  units.push({ id: co.id, name: co.name, parent: "grupo", kind: "Empresa" });
  const gm = add({ title: "Gerente general", unit: co.id, boss: ceo.id });
  add({ title: "Analista de talento humano", unit: co.id, boss: gm.id });
  for (const sub of co.subs) {
    const headcount = sub.roles.reduce((s, [, k]) => s + k, 0);
    units.push({
      id: sub.id,
      name: sub.name,
      parent: co.id,
      kind: "Subdivisión",
      metrics: { vacantes: int(0, Math.ceil(headcount / 12)), ingresos: int(0, Math.ceil(headcount / 8)), retiros: int(0, Math.ceil(headcount / 10)) },
    });
    const lead = add({ title: sub.lead, unit: sub.id, boss: gm.id });
    const sups = Array.from({ length: Math.max(1, Math.round(headcount / 18)) }, () => add({ title: sub.sup, unit: sub.id, boss: lead.id }));
    for (const [role, k] of sub.roles)
      for (let i = 0; i < k; i++) {
        const p = add({ title: role, unit: sub.id, boss: role.startsWith("Analista") || role === "Asistente" ? lead.id : pick(sups).id });
        if (!me && role === "Analista de rutas") me = p;
      }
  }
}
// Las cifras de las empresas y del grupo: la suma de sus subunidades.
for (const u of [...units].reverse()) {
  const kids = units.filter((k) => k.parent === u.id);
  if (kids.length) u.metrics = Object.fromEntries(["vacantes", "ingresos", "retiros"].map((k) => [k, kids.reduce((s, c) => s + (c.metrics?.[k] ?? 0), 0)]));
}

const METRICS: OrgMetric[] = [
  { key: "vacantes", label: "Vacantes", tone: "warning" },
  { key: "ingresos", label: "Ingresos en 90 días" },
  { key: "retiros", label: "Rotación (retiros por persona)", tone: "danger", per: "count" },
];

export function mountOrgDemo(root: HTMLElement): void {
  const el = root.querySelector<NxOrg>("#org-demo");
  const log = root.querySelector<HTMLOListElement>("#org-log");
  if (!el || !me) return;
  const boss = people.find((p) => p.id === me!.boss);
  const th = people.find((p) => p.title === "Analista de talento humano" && p.unit === "log");
  el.units = units;
  el.people = people;
  el.metrics = METRICS;
  el.contacts = [
    { label: "Aprobar permisos y vacaciones", person: boss?.id },
    { label: "Certificados y nómina", person: th?.id },
    { label: "Soporte de sistemas", text: "Mesa de ayuda · extensión 4040" },
  ];
  el.me = me.id;
  el.addEventListener("nx-org-focus", (e) => {
    const d = (e as CustomEvent<OrgFocusDetail>).detail;
    const who = d.view === "me" ? people.find((p) => p.id === d.id)?.name : units.find((u) => u.id === d.id)?.name;
    const li = document.createElement("li");
    li.textContent = `nx-org-focus · ${d.view === "me" ? "Yo" : "Organización"} · ${who ?? "todo"}`;
    log?.prepend(li);
    while (log && log.children.length > 6) log.lastElementChild?.remove();
  });
}
