import type { MenuItem } from "../src/index";

/** Un menú de ERP de ejemplo: secciones, padres con hijos, utilitarios y un ítem sin ícono. */
export const DEMO_ITEMS: MenuItem[] = [
  { id: "inicio", label: "Inicio", href: "/inicio", icon: "house" },
  { id: "tablero", label: "Tablero", href: "/tablero", icon: "layout-dashboard" },
  { id: "pendientes", label: "Pendientes", href: "/pendientes", icon: "inbox", badge: 12 },
  {
    id: "ventas",
    label: "Ventas",
    icon: "shopping-cart",
    section: "Operación",
    description: "Pedidos, clientes y facturación",
    children: [
      { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos", icon: "receipt", description: "Crear y seguir pedidos" },
      { id: "clientes", label: "Clientes", href: "/ventas/clientes", icon: "users" },
      { id: "facturas", label: "Facturación", href: "/ventas/facturas", icon: "file-text", description: "Facturas y notas crédito", badge: "Nuevo" },
      { id: "ventas-rep", label: "Reportes", href: "/ventas/reportes", icon: "chart-column", utility: true },
      { id: "ventas-conf", label: "Configuración", href: "/ventas/configuracion", icon: "settings", utility: true },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: "package",
    section: "Operación",
    description: "Existencias y movimientos",
    children: [
      { id: "productos", label: "Productos", href: "/inventario/productos", icon: "package" },
      { id: "bodegas", label: "Bodegas", href: "/inventario/bodegas", icon: "warehouse" },
      { id: "movimientos", label: "Movimientos", href: "/inventario/movimientos", icon: "truck", description: "Entradas, salidas y traslados" },
    ],
  },
  {
    id: "seguridad",
    label: "Seguridad Física",
    icon: "shield-user",
    section: "Operación",
    description: "Portería, visitas y rondas",
    children: [
      { id: "porteria-adentro", label: "Portería — Adentro", href: "/seguridad/porteria/adentro", icon: "users", section: "Portería", description: "Quién está en planta ahora" },
      { id: "porteria-registro", label: "Registro de entradas", href: "/seguridad/porteria/registro", icon: "clipboard-list", section: "Portería" },
      { id: "porteria-vehiculos", label: "Vehículos", href: "/seguridad/porteria/vehiculos", icon: "truck", section: "Portería" },
      { id: "visitas-agenda", label: "Agenda de visitas", href: "/seguridad/visitas/agenda", icon: "calendar", section: "Visitas" },
      { id: "visitas-pendientes", label: "Por aprobar", href: "/seguridad/visitas/pendientes", icon: "inbox", section: "Visitas", badge: 3 },
      { id: "visitas-historial", label: "Historial", href: "/seguridad/visitas/historial", icon: "file-text", section: "Visitas" },
      { id: "rondas-plan", label: "Plan de rondas", href: "/seguridad/rondas/plan", icon: "map-pin", section: "Rondas" },
      { id: "rondas-novedades", label: "Novedades", href: "/seguridad/rondas/novedades", icon: "bell", section: "Rondas", description: "Hallazgos reportados en ronda" },
      { id: "rondas-puntos", label: "Puntos de control", href: "/seguridad/rondas/puntos", icon: "shield", section: "Rondas" },
      { id: "contratistas", label: "Contratistas", href: "/seguridad/contratistas", icon: "hard-hat", section: "Terceros" },
      { id: "seg-rep", label: "Reportes de acceso", href: "/seguridad/reportes", icon: "chart-column", utility: true },
      { id: "seg-conf", label: "Configuración", href: "/seguridad/configuracion", icon: "settings", utility: true },
    ],
  },
  { id: "personas", label: "Personas", href: "/personas", icon: "users", section: "Administración" },
  {
    id: "finanzas",
    label: "Finanzas",
    icon: "wallet",
    section: "Administración",
    children: [
      { id: "cartera", label: "Cartera", href: "/finanzas/cartera", icon: "wallet" },
      { id: "pagos", label: "Pagos", href: "/finanzas/pagos", icon: "receipt" },
      { id: "fin-rep", label: "Reportes", href: "/finanzas/reportes", icon: "trending-up", utility: true },
    ],
  },
  { id: "soporte", label: "Mesa de ayuda", href: "/soporte", section: "Administración" },
];

// ---------------------------------------------------------------- empleados ficticios (select)

const FIRST = ["Ana María", "Walber", "David", "Lucía", "José Ángel", "Carolina", "Andrés", "Mariana", "Héctor", "Paula", "Sebastián", "Natalia", "Camilo", "Valentina", "Jhon Fredy", "Luz Dary", "Óscar", "Yesenia", "Julián", "Daniela"];
const LAST = ["Rincón", "Pumarejo", "Ruiz", "Fernández", "Múnera", "Suárez", "Peña", "Ospina", "Galeano", "Quintero", "Toro", "Ríos", "Cárdenas", "Zapata", "Restrepo"];
const ROLES = [
  ["Técnico electricista", "Mantenimiento"],
  ["Soldador", "Producción"],
  ["Operario de montacargas", "Logística"],
  ["Analista de nómina", "Gestión humana"],
  ["Coordinador de planta", "Producción"],
  ["Auxiliar SST", "Seguridad y salud"],
  ["Jefe de bodega", "Logística"],
  ["Analista de compras", "Compras"],
  ["Conductor", "Logística"],
  ["Coordinadora de calidad", "Calidad"],
];

export type Employee = {
  value: string;
  nombre: string;
  cedula: string;
  cargo: string;
  area: string;
};

/** 180 empleados deterministas (siempre los mismos): nombre, cédula, cargo y área. */
export const EMPLOYEES: Employee[] = Array.from({ length: 180 }, (_, i) => {
  const [cargo, area] = ROLES[(i * 7 + Math.floor(i / FIRST.length) * 3) % ROLES.length];
  const cedula = String(i % 3 === 0 ? 1_000_000_000 + ((i * 7_919_113) % 150_000_000) : 10_000_000 + ((i * 3_571_921) % 89_000_000));
  return { value: String(i + 1), nombre: `${FIRST[i % FIRST.length]} ${LAST[(i * 3) % LAST.length]}`, cedula, cargo, area };
});

export const EMPLOYEE_FIELDS = [
  { key: "nombre", label: "Nombre" },
  { key: "cedula", label: "Cédula", kind: "digits" as const },
  { key: "cargo", label: "Cargo" },
];
