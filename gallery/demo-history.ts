/**
 * Datos de la demo de `<nx-history>`: la orden de compra OC-2291 de Aceros del Caribe, tres
 * semanas de vida (25 acciones de 5 personas: creación, cambio de proveedor y de montos, fechas
 * de entrega, estados, notas largas editadas y comentarios). Las fechas se cuentan desde hoy, así
 * la demo siempre tiene algo de «Hoy» y de «Ayer».
 */
import type { NxHistory } from "../src/components/history/history";
import type { HistoryEvent, HistoryField } from "../src/components/history/types";

export const OC_FIELDS: HistoryField[] = [
  {
    key: "estado",
    label: "Estado",
    type: "status",
    options: [
      { value: "borrador", label: "Borrador" },
      { value: "por-aprobar", label: "Por aprobar", tone: "warning" },
      { value: "rechazada", label: "Rechazada", tone: "danger" },
      { value: "aprobada", label: "Aprobada", tone: "success" },
      { value: "enviada", label: "Enviada al proveedor" },
      { value: "parcial", label: "Recibida parcial", tone: "warning" },
    ],
  },
  { key: "proveedor", label: "Proveedor" },
  { key: "monto", label: "Monto", type: "money", currency: "COP" },
  { key: "entrega", label: "Entrega", type: "date" },
  { key: "pago", label: "Pago" },
  { key: "centro", label: "Centro de costo" },
  { key: "observaciones", label: "Observaciones" },
];

const BASE = "Lámina HR de 3 mm (40 unidades) y perfilería en C de 4 pulgadas para la línea 2.";
const OBS = [
  `${BASE} Entregar en la bodega principal de lunes a viernes, de 7 a. m. a 3 p. m.`,
  `${BASE} Entregar en la portería 2 de la planta Malambo de lunes a viernes, de 7 a. m. a 3 p. m., con cita previa.`,
  `${BASE} Entregar en la portería 2 de la planta Malambo de lunes a viernes, de 7 a. m. a 3 p. m., con cita previa. El proveedor debe enviar la póliza de cumplimiento antes del despacho.`,
  `${BASE} Se aceptan entregas parciales. Entregar en la portería 2 de la planta Malambo de lunes a sábado, de 6 a. m. a 2 p. m., con cita previa. El proveedor debe enviar la póliza de cumplimiento antes del despacho.`,
];

const ANDRES = { name: "Andrés Ruiz" };
const LAURA = { name: "Laura Gómez" };
const CARLOS = { name: "Carlos Mejía" };
const DIANA = { name: "Diana Castro" };
const JULIAN = { name: "Julián Ortiz" };

/** Quien mira la demo: sus reversiones y notas salen con su nombre. */
export const OC_USER = { name: "Sofía Herrera" };

/** La OC-2291 hoy, y su historia. `now` fija el «hoy» (las pruebas lo pasan). */
export function ocHistory(now = new Date()): { record: Record<string, unknown>; events: HistoryEvent[] } {
  /** Hace `days` días, a esa hora (o hace `min` minutos, si `days` es 0 y se pasa `min`). */
  const at = (days: number, hm: string, min?: number) => {
    if (min !== undefined) return new Date(now.getTime() - min * 60000).toISOString();
    const [hh, mm] = hm.split(":").map(Number);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hh, mm);
    return d.toISOString();
  };
  /** Una fecha de entrega, a `days` días de hoy («2026-10-06»). */
  const day = (days: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const E = (id: number, when: string, actor: { name: string }, action: HistoryEvent["action"], changes?: [string, unknown, unknown][], note?: string): HistoryEvent => ({
    id: `oc2291-${id}`,
    at: when,
    actor,
    action,
    ...(changes ? { changes: changes.map(([field, from, to]) => ({ field, from: from as never, to: to as never })) } : {}),
    ...(note ? { note } : {}),
  });
  const events: HistoryEvent[] = [
    E(1, at(21, "08:12"), ANDRES, "create", [["estado", null, "borrador"], ["proveedor", null, "Aceros del Norte S.A."], ["monto", null, 42_300_000], ["entrega", null, day(7)], ["pago", null, "30 días"], ["centro", null, "Producción · Planta Malambo"], ["observaciones", null, OBS[0]]]),
    E(2, at(21, "08:40"), ANDRES, "comment", undefined, "Adjunto las tres cotizaciones. Aceros del Norte es la más barata, pero entrega en cuatro semanas."),
    E(3, at(20, "10:05"), CARLOS, "comment", undefined, "Necesitamos la lámina antes de fin de mes o paramos la línea 2."),
    E(4, at(20, "11:30"), ANDRES, "update", [["proveedor", "Aceros del Norte S.A.", "Aceros del Caribe S.A.S."], ["monto", 42_300_000, 46_900_000]], "Cambio a Aceros del Caribe: cuesta 10,9 % más, pero entrega en 10 días."),
    E(5, at(20, "11:32"), ANDRES, "update", [["entrega", day(7), day(-10)]]),
    E(6, at(19, "09:15"), ANDRES, "update", [["observaciones", OBS[0], OBS[1]]]),
    E(7, at(19, "09:20"), ANDRES, "status", [["estado", "borrador", "por-aprobar"]]),
    E(8, at(18, "16:45"), DIANA, "comment", undefined, "El centro de costo de Malambo va en el 87 % del presupuesto del trimestre. Se puede aprobar, pero queda poco margen."),
    E(9, at(18, "17:02"), DIANA, "update", [["pago", "30 días", "45 días"]], "Con Aceros del Caribe tenemos 45 días pactados en el contrato marco."),
    E(10, at(17, "08:30"), LAURA, "status", [["estado", "por-aprobar", "rechazada"]], "Falta la póliza de cumplimiento del proveedor."),
    E(11, at(17, "10:10"), ANDRES, "comment", undefined, "Ya le pedí la póliza a Aceros del Caribe. Dicen que la mandan mañana."),
    E(12, at(16, "14:22"), ANDRES, "update", [["observaciones", OBS[1], OBS[2]]]),
    E(13, at(16, "14:25"), ANDRES, "status", [["estado", "rechazada", "por-aprobar"]], "Llegó la póliza: queda adjunta."),
    E(14, at(14, "09:05"), ANDRES, "update", [["monto", 46_900_000, 48_750_000]], "El proveedor actualizó el precio del acero (+3,9 %)."),
    E(15, at(13, "11:00"), LAURA, "status", [["estado", "por-aprobar", "aprobada"]], "Aprobada. Prioridad alta para producción."),
    E(16, at(12, "15:40"), JULIAN, "update", [["entrega", day(-10), day(-5)]], "El proveedor reprogramó el despacho por el paro de transportadores."),
    E(17, at(11, "09:00"), CARLOS, "comment", undefined, "¿Se puede adelantar al menos la mitad de la lámina? Con 20 unidades arrancamos."),
    E(18, at(10, "16:10"), ANDRES, "update", [["observaciones", OBS[2], OBS[3]]]),
    E(19, at(10, "16:12"), ANDRES, "status", [["estado", "aprobada", "enviada"]]),
    E(20, at(7, "10:30"), DIANA, "update", [["pago", "45 días", "60 días"]], "Negociado con el proveedor: 60 días sin intereses por el retraso."),
    E(21, at(5, "08:20"), JULIAN, "comment", undefined, "Llegó el primer despacho: 22 láminas. Falta la perfilería y el resto de la lámina."),
    E(22, at(5, "08:25"), JULIAN, "status", [["estado", "enviada", "parcial"]]),
    E(23, at(1, "17:30"), LAURA, "comment", undefined, "Ojo: el remanente tiene que llegar antes del cierre de mes."),
    E(24, at(0, "", 190), JULIAN, "update", [["entrega", day(-5), day(4)]], "El proveedor confirma el remanente en cuatro días."),
    E(25, at(0, "", 38), ANDRES, "update", [["monto", 48_750_000, 47_980_000]], "Nota crédito por dos láminas con defecto de laminación."),
  ];
  const record = { estado: "parcial", proveedor: "Aceros del Caribe S.A.S.", monto: 47_980_000, entrega: day(4), pago: "60 días", centro: "Producción · Planta Malambo", observaciones: OBS[3] };
  return { record, events };
}

/** Una página del historial, como la devolvería el backend: los `size` eventos anteriores a `before`. */
export function ocHistoryPage(before: string | null, size = 15, now = new Date()): { events: HistoryEvent[]; record?: Record<string, unknown>; more: boolean } {
  const { record, events } = ocHistory(now);
  const end = before ? events.findIndex((e) => e.id === before) : events.length;
  const from = Math.max(0, end - size);
  return { events: events.slice(from, Math.max(0, end)), ...(before ? {} : { record }), more: from > 0 };
}

/** La página de la galería: el historial de la OC-2291 desde el backend de mentira, y el registro de eventos. */
export function mountHistoryDemo(root: HTMLElement): void {
  const el = root.querySelector<NxHistory>("#history-demo")!;
  el.fields = OC_FIELDS;
  el.user = OC_USER;
  const log = root.querySelector<HTMLOListElement>("#history-log")!;
  const add = (text: string, replace = false) => {
    // Arrastrar el deslizador no llena el registro: el último viaje reemplaza al anterior.
    if (replace && log.firstElementChild?.textContent?.startsWith("nx-history-travel")) log.firstElementChild.remove();
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  el.addEventListener("nx-history-travel", (e) => add(`nx-history-travel → ${e.detail.id ?? "presente"}`, true));
  el.addEventListener("nx-history-revert", (e) => add(`nx-history-revert → ${e.detail.change.field} de ${e.detail.event.id} (cancelable)`));
  el.addEventListener("nx-history-commit", (e) => add(`nx-history-commit → PATCH /compras/oc-2291 · ${e.detail.change.field} = ${JSON.stringify(e.detail.change.from)}`));
  el.addEventListener("nx-history-comment", (e) => add(`nx-history-comment → «${e.detail.text}»`));
}
