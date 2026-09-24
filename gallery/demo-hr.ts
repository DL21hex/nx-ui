/**
 * Datos de ejemplo para el «Directorio de TH»: 420 personas, siempre las mismas, con lo que un
 * equipo de talento humano revisa a diario (contratos, períodos de prueba, documentos, vacaciones).
 * Los usa la galería y el servidor de desarrollo (el impacto de un retiro). No es parte de la librería.
 */
import type { GridColumn, GridFilter, GridRow } from "../src/components/grid/types";
import { foldText } from "../src/core/text";

/** «Hoy» fijo para que la demo no cambie con el calendario. */
export const TODAY = "2026-09-24";

const FIRST = ["Ana", "Carlos", "Luisa", "Andrés", "María", "Jorge", "Camila", "Julián", "Paola", "Felipe", "Daniela", "Santiago", "Valentina", "Diego", "Laura", "Sebastián", "Natalia", "Mauricio", "Carolina", "Esteban", "Juliana", "Ricardo", "Tatiana", "Óscar"];
const LAST = ["Gómez", "Rodríguez", "Martínez", "Pérez", "Castro", "Rincón", "Herrera", "Díaz", "Moreno", "Vargas", "Ortiz", "Rojas", "Jiménez", "Suárez", "Mejía", "Álvarez", "Cárdenas", "Palacio", "Barrios", "Zapata"];
const ROLES: [string, string, number][] = [
  ["Operario de producción", "Producción", 1_600_000],
  ["Operaria de empaque", "Producción", 1_550_000],
  ["Supervisor de línea", "Producción", 3_200_000],
  ["Técnico de mantenimiento", "Mantenimiento", 2_600_000],
  ["Electricista industrial", "Mantenimiento", 2_900_000],
  ["Auxiliar de bodega", "Logística", 1_700_000],
  ["Conductor", "Logística", 2_100_000],
  ["Coordinadora de despachos", "Logística", 3_600_000],
  ["Analista de calidad", "Calidad", 3_100_000],
  ["Auxiliar contable", "Administración", 2_300_000],
  ["Analista de nómina", "Talento humano", 3_300_000],
  ["Asistente administrativa", "Administración", 2_200_000],
  ["Aprendiz SENA", "Producción", 1_300_000],
];
const SEDES = ["Barranquilla", "Barranquilla", "Barranquilla", "Cartagena", "Bogotá"];

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => iso(new Date(Date.parse(s) + n * 86_400_000));

export function hrEmployees(n = 420): GridRow[] {
  const r = rng(24);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const out: GridRow[] = [];
  for (let i = 0; i < n; i++) {
    const [cargo, area, base] = ROLES[Math.floor(r() ** 1.3 * ROLES.length)];
    const nombre = `${pick(FIRST)} ${pick(LAST)} ${pick(LAST)}`;
    const aprendiz = cargo.startsWith("Aprendiz");
    const contrato = aprendiz ? "aprendiz" : r() < 0.55 ? "indefinido" : r() < 0.75 ? "fijo" : "obra";
    // Antigüedad: muchos recientes, algunos de hace años.
    const ingreso = addDays(TODAY, -Math.floor(20 + r() ** 2 * 4200));
    const antiguedad = (Date.parse(TODAY) - Date.parse(ingreso)) / 86_400_000;
    const prueba = antiguedad < 60 && contrato !== "aprendiz";
    // Término fijo y obra: fin dentro de los próximos meses (algunos, este mes).
    const fin = contrato === "indefinido" ? null : addDays(TODAY, Math.floor(-5 + r() ** 1.6 * 300));
    const roll = r();
    const estado = prueba ? "prueba" : roll < 0.06 ? "incapacidad" : roll < 0.14 ? "vacaciones" : "activo";
    out.push({
      id: String(1001 + i),
      nombre,
      cedula: String(Math.floor(1_000_000_000 + r() * 150_000_000)),
      cargo,
      area,
      sede: pick(SEDES),
      contrato,
      estado,
      turno: area === "Administración" || area === "Talento humano" || area === "Calidad" ? "oficina" : pick(["A", "B", "C"]),
      ingreso,
      fin,
      salario: Math.round((base * (0.95 + r() * 0.25)) / 1000) * 1000,
      vacaciones: Math.min(40, Math.floor(Math.min(antiguedad / 365, 2.5) * 15 * r() ** 2)),
      docs: r() < 0.82 ? 0 : 1 + Math.floor(r() * 3),
      correo: `${foldText(nombre.split(" ")[0])}.${foldText(nombre.split(" ")[1])}@industriasnx.co`,
    });
  }
  return out;
}

export const HR_COLUMNS: GridColumn[] = [
  { key: "nombre", label: "Nombre", width: 250, link: true, avatar: true },
  { key: "cargo", label: "Cargo", width: 200 },
  { key: "area", label: "Área", width: 130 },
  { key: "sede", label: "Sede", width: 120, editable: true },
  {
    key: "estado",
    label: "Estado",
    type: "status",
    width: 150,
    options: [
      { value: "activo", label: "Activo", tone: "success" },
      { value: "prueba", label: "Período de prueba", tone: "warning" },
      { value: "vacaciones", label: "Vacaciones", tone: "info" },
      { value: "incapacidad", label: "Incapacidad", tone: "danger" },
      { value: "retirado", label: "Retirado", tone: "neutral" },
    ],
  },
  {
    key: "contrato",
    label: "Contrato",
    type: "status",
    width: 120,
    options: [
      { value: "indefinido", label: "Indefinido" },
      { value: "fijo", label: "Término fijo" },
      { value: "obra", label: "Obra o labor" },
      { value: "aprendiz", label: "Aprendizaje" },
    ],
  },
  {
    key: "turno",
    label: "Turno",
    type: "status",
    width: 100,
    editable: true,
    options: [
      { value: "A", label: "Turno A" },
      { value: "B", label: "Turno B" },
      { value: "C", label: "Turno C" },
      { value: "oficina", label: "Oficina" },
    ],
  },
  { key: "fin", label: "Fin de contrato", type: "date", width: 130 },
  { key: "ingreso", label: "Ingreso", type: "date", facet: false },
  { key: "vacaciones", label: "Vacaciones (días)", type: "number", width: 130 },
  { key: "docs", label: "Docs. faltantes", type: "number", width: 120 },
  { key: "salario", label: "Salario", type: "money", currency: "COP", width: 130 },
  { key: "cedula", label: "Cédula", width: 120, histogram: false },
];

/** La bandeja de pendientes: cada uno es un filtro normal de la tabla. */
export const HR_INBOX: { id: string; label: string; hint: string; filters: GridFilter[] }[] = [
  { id: "fin", label: "Contratos que vencen", hint: "en los próximos 30 días", filters: [{ key: "fin", op: "range", min: TODAY, max: addDays(TODAY, 30) }] },
  { id: "prueba", label: "Períodos de prueba", hint: "hay que decidir si continúan", filters: [{ key: "estado", op: "in", values: ["prueba"] }] },
  { id: "docs", label: "Documentos faltantes", hint: "hoja de vida incompleta", filters: [{ key: "docs", op: "range", min: 1 }] },
  { id: "vac", label: "Vacaciones acumuladas", hint: "15 días o más sin tomar", filters: [{ key: "vacaciones", op: "range", min: 15 }] },
];

const money = (n: number) => `$ ${new Intl.NumberFormat("es-CO").format(Math.round(n / 1000) * 1000)}`;

/** Lo que haría el backend al pedir el impacto de un retiro (eventos de nxConfirm). */
export function hrExitImpact(e: GridRow | undefined): object[] {
  if (!e) return [{ type: "error", message: "No se encontró a la persona." }];
  const years = (Date.parse(TODAY) - Date.parse(String(e.ingreso))) / (365 * 86_400_000);
  const salario = Number(e.salario);
  // Aproximación de la liquidación: cesantías e intereses, prima proporcional y vacaciones pendientes.
  const liquidacion = salario * Math.min(years, 1) * 1.12 + salario * 0.5 * ((new Date(TODAY).getMonth() % 6) / 6) + (salario / 30) * Number(e.vacaciones);
  const out: object[] = [
    { type: "impact", icon: "wallet", label: "Liquidación estimada", detail: money(liquidacion), tone: "warning" },
    { type: "impact", icon: "calendar", label: `${e.vacaciones} días de vacaciones`, detail: "se pagan en la liquidación" },
    { type: "impact", icon: "shield", label: "Accesos: ERP nx32, correo, VPN", detail: "se revocan el último día" },
  ];
  if (e.turno !== "oficina") out.push({ type: "impact", icon: "hard-hat", label: "Dotación y carné", detail: "por devolver" });
  else out.push({ type: "impact", icon: "package", label: "Portátil y celular", detail: "por devolver" });
  if (String(e.cargo).startsWith("Supervisor") || String(e.cargo).startsWith("Coordinadora")) out.push({ type: "impact", icon: "users", label: "8 personas a cargo", detail: "se reasignan a su jefe", tone: "warning" });
  if (e.estado === "incapacidad") out.push({ type: "block", message: "Tiene una incapacidad activa (estabilidad laboral reforzada). El retiro requiere autorización del Ministerio de Trabajo." });
  else if (e.estado === "vacaciones") out.push({ type: "note", message: "Está de vacaciones: el retiro se hace efectivo cuando regrese." });
  out.push({ type: "note", message: "Se generan la carta de terminación y el paz y salvo para firma." });
  return out;
}
