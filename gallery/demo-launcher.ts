/**
 * Demo de `<nx-launcher>`: el autoservicio de Talento humano (cuatro tarjetas, tres con pestañas) y
 * el área de Compras (secciones, una tarjeta destacada, buscador y una señal que se actualiza sola).
 * Al elegir una tarjeta, la demo cancela la navegación y muestra la página del módulo dentro de una
 * View Transition: la tarjeta se convierte en el encabezado. «Volver» hace el camino inverso con
 * `reveal()`.
 */
import "../src/components/launcher/index";
import type { LauncherItem, LauncherSelectDetail, NxLauncher } from "../src/components/launcher/index";
import { icon } from "../src/core/icons";

const TALENTO: LauncherItem[] = [
  {
    id: "certificados",
    label: "Certificados laborales",
    icon: "file-text",
    description: "Genera tu certificado para bancos, arriendos o trámites. Sale firmado al instante.",
    href: "/talento/certificados",
    views: [
      { label: "Con salario", href: "/talento/certificados?salario=1" },
      { label: "Sin salario", href: "/talento/certificados?salario=0" },
    ],
    signal: { value: "12 sep", label: "tu último certificado" },
  },
  {
    id: "permisos",
    label: "Permisos",
    icon: "calendar",
    description: "Pide tus permisos y aprueba los de las personas a tu cargo.",
    href: "/talento/permisos",
    views: [
      { label: "Propias", href: "/talento/permisos/propias" },
      { label: "De mis colaboradores", href: "/talento/permisos/equipo", badge: 3 },
    ],
    signal: { value: 3, label: "de tu equipo por aprobar", note: "el más antiguo, hace 2 días", tone: "warning" },
  },
  {
    id: "desprendibles",
    label: "Desprendibles de pago",
    icon: "receipt",
    description: "Lo que te pagaron cada quincena, con devengos y deducciones.",
    href: "/talento/desprendibles",
    views: [
      { label: "Última", hint: "15 sep 2026", href: "/talento/desprendibles/ultima" },
      { label: "Todas", href: "/talento/desprendibles" },
    ],
    signal: { value: "$ 1.974.000", label: "neto pagado el 15 sep" },
  },
  {
    id: "cesantias",
    label: "Cesantías",
    icon: "wallet",
    description: "Tu saldo en el fondo, lo causado este año y los retiros parciales.",
    href: "/talento/cesantias",
    signal: { value: "$ 11.482.300", label: "en el fondo", note: "+ $ 3.150.000 causadas en 2026", tone: "success" },
  },
];

const COMPRAS: LauncherItem[] = [
  {
    id: "continuar",
    label: "Adjudicación de la RFQ-0412",
    icon: "scale",
    featured: true,
    eyebrow: "Continuar donde ibas · hace 2 horas",
    description: "Torres del Parque · 60 artículos cotizados por 10 proveedores. Guardaste el escenario B.",
    href: "/compras/adjudicacion/412",
    section: "Día a día",
    progress: [
      { label: "adjudicados", value: 38 },
      { label: "con sugerencia de la IA", value: 7 },
      { label: "sin decidir", value: 15 },
    ],
  },
  {
    id: "solicitudes",
    label: "Solicitudes",
    icon: "clipboard-list",
    description: "Lo que piden las obras: aprobarlo y convertirlo en cotización.",
    href: "/compras/solicitudes",
    section: "Día a día",
    views: [{ label: "Por aprobar", badge: 7, href: "/compras/solicitudes?estado=pendiente" }, { label: "Aprobadas", href: "/compras/solicitudes?estado=aprobada" }, { label: "Nueva solicitud", href: "/compras/solicitudes/nueva" }],
    signal: { value: 7, label: "por aprobar", note: "la más antigua, hace 3 días", tone: "warning" },
  },
  {
    id: "cotizaciones",
    label: "Cotizaciones",
    icon: "shopping-cart",
    description: "Pide precios a varios proveedores y compáralos lado a lado.",
    href: "/compras/cotizaciones",
    section: "Día a día",
    views: [{ label: "Abiertas", badge: 4, href: "/compras/cotizaciones" }, { label: "Por cerrar", badge: 2, href: "/compras/cotizaciones?cierra=hoy" }, { label: "Cerradas", href: "/compras/cotizaciones?estado=cerrada" }],
    signal: { value: 4, label: "abiertas", note: "2 cierran hoy", tone: "danger" },
  },
  {
    id: "ordenes",
    label: "Órdenes de compra",
    icon: "file-text",
    description: "Emite, envía y sigue cada orden hasta que llega a la obra.",
    href: "/compras/ordenes",
    section: "Día a día",
    views: [{ label: "Borradores", badge: 3, href: "/compras/ordenes?estado=borrador" }, { label: "En tránsito", badge: 12, href: "/compras/ordenes?estado=transito" }, { label: "Cerradas", href: "/compras/ordenes?estado=cerrada" }],
    signal: { value: 12, label: "en tránsito", note: "todas a tiempo", tone: "success" },
  },
  {
    id: "recepcion",
    label: "Recepción en obra",
    icon: "truck",
    description: "Registra lo que llega, lo que falta y lo que vino dañado.",
    href: "/compras/recepcion",
    section: "Día a día",
    views: [{ label: "Hoy", badge: 3, href: "/compras/recepcion?dia=hoy" }, { label: "Con novedad", badge: 1, href: "/compras/recepcion?novedad=1" }, { label: "Historial", href: "/compras/recepcion" }],
    signal: { value: 3, label: "entregas hoy", note: "1 con novedad", tone: "warning" },
  },
  {
    id: "facturas",
    label: "Facturas",
    icon: "receipt",
    description: "Cruza factura, orden y recepción antes de aprobar el pago.",
    href: "/compras/facturas",
    section: "Día a día",
    views: [{ label: "Por revisar", badge: 8, href: "/compras/facturas?estado=revisar" }, { label: "Con diferencia", badge: 5, href: "/compras/facturas?estado=diferencia" }, { label: "Aprobadas para pago", href: "/compras/facturas?estado=aprobada" }],
    signal: { value: 5, label: "con diferencia", note: "$ 14,6 M en juego", tone: "danger" },
  },
  {
    id: "proveedores",
    label: "Proveedores",
    icon: "building-2",
    description: "Directorio, pólizas, documentos y desempeño de cada proveedor.",
    href: "/compras/proveedores",
    section: "Datos y análisis",
    views: [{ label: "Directorio", href: "/compras/proveedores" }, { label: "Pólizas", badge: 9, href: "/compras/proveedores/polizas" }, { label: "Evaluaciones", href: "/compras/proveedores/evaluaciones" }],
    signal: { value: 9, label: "pólizas por vencer", note: "la primera, el 30 sep", tone: "warning" },
  },
  {
    id: "articulos",
    label: "Artículos",
    icon: "package",
    description: "Catálogo, unidades de medida y precios de referencia.",
    href: "/compras/articulos",
    section: "Datos y análisis",
    views: [{ label: "Catálogo", href: "/compras/articulos" }, { label: "Precios de referencia", href: "/compras/articulos/precios" }],
    signal: { value: 1284, label: "artículos", note: "32 sin precio de referencia" },
  },
  {
    id: "obras",
    label: "Obras y presupuesto",
    icon: "hard-hat",
    description: "Cuánto lleva comprado cada obra frente a su presupuesto.",
    href: "/compras/obras",
    section: "Datos y análisis",
    views: [{ label: "Obras", href: "/compras/obras" }, { label: "Presupuesto", href: "/compras/obras/presupuesto" }],
    signal: { label: "Torres del Parque", note: "71 % del presupuesto", meter: 71 },
  },
  {
    id: "reportes",
    label: "Reportes",
    icon: "chart-column",
    description: "Ahorro frente a la referencia, plazos y gasto por obra.",
    href: "/compras/reportes",
    section: "Datos y análisis",
    views: [{ label: "Ahorro", href: "/compras/reportes/ahorro" }, { label: "Cumplimiento", href: "/compras/reportes/cumplimiento" }, { label: "Gasto por obra", href: "/compras/reportes/gasto" }],
    signal: { value: "$ 312 M", label: "ahorrados en 2026", trend: [18, 22, 19, 27, 31, 29, 35, 33, 41] },
  },
];

export function mountLauncherDemo(root: HTMLElement): void {
  const log = root.querySelector<HTMLOListElement>("#la-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  for (const demo of root.querySelectorAll<HTMLElement>("[data-la-demo]")) {
    const el = demo.querySelector<NxLauncher>("nx-launcher")!;
    const page = demo.querySelector<HTMLElement>(".la-page")!;
    const area = demo.dataset.laDemo === "compras" ? "Compras" : "Talento humano";
    el.items = demo.dataset.laDemo === "compras" ? COMPRAS : TALENTO;

    el.addEventListener("nx-launcher-select", (e) => {
      const d = (e as CustomEvent<LauncherSelectDetail>).detail;
      add(`nx-launcher-select → ${d.item.label}${d.view ? ` › ${d.view.label}` : ""} (${d.href ?? "sin href"})`);
      // En la app, el router navega; aquí, la página del módulo aparece en su lugar.
      e.preventDefault();
      // Una sola página abierta a la vez: dos encabezados con los mismos nombres anularían la transición.
      for (const other of root.querySelectorAll<HTMLElement>("[data-la-demo]")) {
        if (other === demo) continue;
        other.querySelector<HTMLElement>(".la-page")!.hidden = true;
        other.querySelector<NxLauncher>("nx-launcher")!.hidden = false;
      }
      const i = d.view ? (d.item.views ?? []).indexOf(d.view) : 0;
      morph(() => {
        showPage(page, area, d.item, Math.max(0, i), () => back());
        el.hidden = true;
        page.hidden = false;
        page.querySelector<HTMLElement>("h3")!.focus({ preventScroll: true });
      });
    });

    const back = () =>
      morph(() => {
        page.hidden = true;
        el.hidden = false;
        el.reveal();
        el.focusItem(page.dataset.item);
      });
    page.addEventListener("keydown", (e) => {
      if (e.key === "Escape") back();
    });
  }

  // La señal de Solicitudes se actualiza sola: el número cambia con un pulso breve.
  const compras = root.querySelector<NxLauncher>('[data-la-demo="compras"] nx-launcher')!;
  let pending = 7;
  const timer = setInterval(() => {
    if (!root.isConnected) return clearInterval(timer);
    if (compras.hidden || document.hidden || pending >= 12) return;
    pending += 1;
    compras.items = compras.items.map((it) =>
      it.id === "solicitudes"
        ? { ...it, signal: { ...it.signal, value: pending }, views: it.views!.map((v, i) => (i === 0 ? { ...v, badge: pending } : v)) }
        : it,
    );
  }, 6500);
}

/** Con View Transitions si el navegador las tiene (y no se pidió menos movimiento). */
function morph(update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) update();
  else doc.startViewTransition(update);
}

/** La «página» del módulo: su encabezado lleva los nombres de la transición (`.nx-launcher-hero…`). */
function showPage(page: HTMLElement, area: string, item: LauncherItem, tab: number, back: () => void): void {
  page.dataset.item = item.id;
  const views = item.views ?? [];
  const btn = (tag: string, cls: string, text: string) => Object.assign(document.createElement(tag), { className: cls, textContent: text });

  const backBtn = btn("button", "la-back", `← ${area}`) as HTMLButtonElement;
  backBtn.type = "button";
  backBtn.addEventListener("click", back);

  const head = btn("header", "la-head nx-launcher-hero", "");
  const ic = btn("span", "la-head__icon nx-launcher-hero-icon", "");
  ic.append(icon(item.icon, item.label));
  const title = btn("h3", "la-head__title", "");
  title.tabIndex = -1;
  title.append(btn("span", "nx-launcher-hero-label", item.label));
  const text = btn("div", "la-head__text", "");
  text.append(title, btn("p", "", item.description ?? ""));
  head.append(ic, text);

  const body = btn("p", "la-body", "");
  const paint = (i: number) => {
    body.textContent = views.length ? `Vista «${views[i].label}». En la app, aquí va la pantalla real del módulo (${views[i].href}).` : `En la app, aquí va la pantalla real del módulo (${item.href}).`;
  };
  const tabs = btn("div", "la-tabs", "");
  tabs.setAttribute("role", "tablist");
  views.forEach((v, i) => {
    const t = btn("button", "la-tab", v.label) as HTMLButtonElement;
    t.type = "button";
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", String(i === tab));
    t.addEventListener("click", () => {
      tabs.querySelectorAll("[role=tab]").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
      paint(i);
    });
    tabs.append(t);
  });
  paint(tab);
  page.replaceChildren(backBtn, head, ...(views.length ? [tabs] : []), body);
}
