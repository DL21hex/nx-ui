/**
 * Galería: el tablero de compras de `<nx-kanban>`. Veinte órdenes de un ERP colombiano que van de
 * Borrador a Recibido; «Por aprobar» tiene un límite de 5 (y arranca pasada), y «Anulado» pide
 * confirmación con el impacto que transmite `/demo/kanban/impacto` (ver `server-kanban.ts`).
 */
import type { KanbanCard, KanbanColumn, NxKanban } from "../src/components/kanban/index";
import "../src/components/kanban/index";

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: "borrador", label: "Borrador", tone: "neutral" },
  { id: "por-aprobar", label: "Por aprobar", tone: "warning", wip: 5 },
  { id: "aprobado", label: "Aprobado", tone: "primary" },
  { id: "recibido", label: "Recibido", tone: "success" },
  {
    id: "anulado",
    label: "Anulado",
    tone: "danger",
    confirm: { heading: "¿Anular la {title}?", message: "La orden se anula en el ERP y se le avisa al proveedor.", impact: "/demo/kanban/impacto", hold: true, confirmLabel: "Anular" },
  },
];

type Extra = { cc: string; solicitud: string; entrada?: string; factura?: string; pago?: string };
const oc = (id: string, column: string, proveedor: string, detalle: string, amount: number, assignee: string, due: string, data: Extra, more: Partial<KanbanCard> = {}): KanbanCard => ({
  id,
  column,
  title: `OC-${id}`,
  subtitle: `${proveedor} · ${detalle}`,
  amount,
  currency: "COP",
  assignee,
  due,
  tags: [data.cc],
  data,
  ...more,
});

const ANA = "Ana María Rincón";
const HECTOR = "Héctor Galeano";
const MARIANA = "Mariana Ospina";
const WALBER = "Walber Pumarejo";

export const KANBAN_CARDS: KanbanCard[] = [
  oc("2341", "borrador", "Maderas del Pacífico", "Estiba 120×100 × 200", 9_400_000, WALBER, "2026-10-06", { cc: "Logística", solicitud: "SC-1204" }),
  oc("2339", "borrador", "Pinturas Tropical", "Pintura epóxica gris × 30 gal", 5_130_000, HECTOR, "2026-10-09", { cc: "Mantenimiento", solicitud: "SC-1201" }),
  oc("2337", "borrador", "Computadores y Redes", "Portátil 14″ × 4", 16_760_000, MARIANA, "2026-10-15", { cc: "Administración", solicitud: "SC-1199" }),
  oc("2336", "borrador", "Seguridad Industrial Andina", "Botas dieléctricas × 45", 6_975_000, ANA, "2026-10-02", { cc: "Producción", solicitud: "SC-1197" }, { tags: ["Producción", { label: "Dotación", tone: "primary" }] }),
  oc("2334", "borrador", "Tornillería El Perno", "Tornillo hex 3/8″ × 5.000", 1_875_000, HECTOR, "2026-10-01", { cc: "Producción", solicitud: "SC-1195" }),

  oc("2291", "por-aprobar", "Aceros del Caribe", "Lámina HR 3 mm × 40", 10_829_000, ANA, "2026-09-30", { cc: "Producción", solicitud: "SC-1161" }, { tags: ["Producción", { label: "Sobre presupuesto", tone: "danger" }] }),
  oc("2310", "por-aprobar", "Empaques Andinos", "Caja corrugada 40×30 × 2.000", 1_450_000, HECTOR, "2026-09-23", { cc: "Logística", solicitud: "SC-1170" }),
  oc("2318", "por-aprobar", "Químicos del Norte", "Desengrasante industrial × 12", 3_912_000, MARIANA, "2026-09-29", { cc: "Mantenimiento", solicitud: "SC-1174" }, { tags: ["Mantenimiento", { label: "Urgente", tone: "danger" }] }),
  oc("2322", "por-aprobar", "Transportes Rivera", "Flete a Cartagena", 820_000, WALBER, "2026-09-26", { cc: "Logística", solicitud: "SC-1178" }),
  oc("2327", "por-aprobar", "Eléctricos del Valle", "Variador 5 HP × 2", 7_340_000, ANA, "2026-10-03", { cc: "Mantenimiento", solicitud: "SC-1181" }, { tags: ["Mantenimiento", { label: "Proveedor nuevo", tone: "warning" }] }),
  oc("2331", "por-aprobar", "Lubricantes Costa", "Aceite hidráulico 68 × 8", 2_104_000, WALBER, "2026-10-04", { cc: "Mantenimiento", solicitud: "SC-1186" }),

  oc("2276", "aprobado", "Plásticos Medellín", "Película stretch × 60 rollos", 4_380_000, WALBER, "2026-09-24", { cc: "Logística", solicitud: "SC-1142" }),
  oc("2283", "aprobado", "Soldaduras Antioquia", "Soldadura E6013 × 20 cajas", 3_260_000, HECTOR, "2026-09-28", { cc: "Producción", solicitud: "SC-1150" }),
  oc("2285", "aprobado", "Hidráulica Andina", "Bomba de engranajes importada", 4_250, ANA, "2026-10-12", { cc: "Mantenimiento", solicitud: "SC-1153" }, { currency: "US$", tags: ["Mantenimiento", { label: "Importación", tone: "primary" }] }),
  oc("2288", "aprobado", "Gases Industriales", "Oxígeno industrial × 24 cilindros", 2_016_000, HECTOR, "2026-09-27", { cc: "Producción", solicitud: "SC-1158" }),
  oc("2289", "aprobado", "Papelería Central", "Tóner HP 26A × 6", 1_290_000, MARIANA, "2026-10-01", { cc: "Administración", solicitud: "SC-1159" }),

  oc("2240", "recibido", "Cartón y Empaques del Sur", "Separador de cartón × 8.000", 5_840_000, WALBER, "2026-09-12", { cc: "Logística", solicitud: "SC-1102", entrada: "EA-5521", factura: "FE-10482", pago: "EG-3321" }),
  oc("2252", "recibido", "Ferretería Industrial", "Rodamiento 6205 × 24", 648_000, HECTOR, "2026-09-15", { cc: "Mantenimiento", solicitud: "SC-1117", entrada: "EA-5540", factura: "FE-10511" }),
  oc("2261", "recibido", "Textiles Santander", "Overol en dril × 60", 8_940_000, ANA, "2026-09-18", { cc: "Producción", solicitud: "SC-1126", entrada: "EA-5563" }, { tags: ["Producción", { label: "Dotación", tone: "primary" }] }),
  oc("2270", "recibido", "Alimentos La Sabana", "Casino · semana 38", 12_600_000, MARIANA, "2026-09-19", { cc: "Talento humano", solicitud: "SC-1135", entrada: "EA-5570", factura: "FE-10530" }),
];

/** El impacto de anular una orden, según dónde está y qué documentos tiene (lo transmite el servidor). */
export function kanbanImpact(body: { card?: string; from?: string; data?: Partial<Extra> | null }): object[] {
  const card = KANBAN_CARDS.find((c) => c.id === body.card);
  const d = (body.data ?? card?.data ?? {}) as Partial<Extra>;
  const out: object[] = [];
  if (body.from === "recibido") {
    if (d.entrada) out.push({ type: "impact", icon: "truck", label: `Entrada de almacén ${d.entrada}`, detail: "se reversa y el inventario baja", tone: "warning" });
    if (d.factura) out.push({ type: "impact", icon: "receipt", label: `Factura ${d.factura}`, detail: "queda sin orden de compra", tone: "warning" });
    if (d.pago) out.push({ type: "block", message: `No se puede anular: la orden ya tiene un pago (${d.pago}). Primero hay que reversar el pago en Tesorería.` });
  } else if (body.from === "aprobado") {
    out.push({ type: "impact", icon: "wallet", label: `Presupuesto de ${d.cc ?? "su centro de costo"}`, detail: `se liberan ${card ? money(card) : "los recursos"}` });
    out.push({ type: "impact", icon: "bell", label: "El proveedor", detail: "recibe la anulación por correo" });
  } else {
    out.push({ type: "impact", icon: "file-text", label: `Solicitud ${d.solicitud ?? ""}`.trim(), detail: "vuelve a quedar abierta" });
  }
  if (!out.some((e) => (e as { type: string }).type === "block")) out.push({ type: "note", message: "Queda registrado en la auditoría de compras." });
  return out;
}
const money = (c: KanbanCard) => `${c.currency === "COP" ? "$" : c.currency} ${c.amount!.toLocaleString("es-CO")}`;

/** Monta la demo de la galería: el tablero, el registro de eventos y «Volver a empezar». */
export function mountKanbanDemo(root: HTMLElement): void {
  const board = root.querySelector<NxKanban>("#kanban-demo")!;
  const fill = () => {
    board.columns = KANBAN_COLUMNS;
    board.cards = KANBAN_CARDS.map((c) => ({ ...c }));
  };
  fill();
  root.querySelector("#kanban-reset")!.addEventListener("click", fill);
  const log = root.querySelector<HTMLOListElement>("#kanban-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  const label = (id: string) => KANBAN_COLUMNS.find((c) => c.id === id)?.label ?? id;
  board.addEventListener("nx-kanban-move", (e) => add(`nx-kanban-move → ${e.detail.card.title}: ${label(e.detail.from)} → ${label(e.detail.to)}, posición ${e.detail.index + 1} (${e.detail.via})`));
  board.addEventListener("nx-kanban-undo", (e) => add(`nx-kanban-undo → ${e.detail.card.title}: no se envía nada`));
  board.addEventListener("nx-kanban-commit", (e) => add(`nx-kanban-commit → PATCH /compras/oc/${e.detail.card.id} {estado: "${e.detail.to}", orden: ${e.detail.index}}`));
  board.addEventListener("nx-kanban-open", (e) => add(`nx-kanban-open → ${e.detail.card.title}`));
  let next = 2342;
  board.addEventListener("nx-kanban-add", (e) => {
    add(`nx-kanban-add → ${label(e.detail.column)}`);
    const id = String(next++);
    board.cards = [{ id, column: e.detail.column, title: `OC-${id}`, subtitle: "Nueva orden · sin proveedor", assignee: ANA, tags: ["Sin clasificar"] }, ...board.cards];
    const card = board.querySelector<HTMLElement>(`.nx-kanban__card[data-id="${id}"]`);
    card?.focus();
    card?.animate?.([{ opacity: 0, translate: "0 -6px" }, { opacity: 1, translate: "0 0" }], { duration: 220, easing: "ease-out" });
  });
}
