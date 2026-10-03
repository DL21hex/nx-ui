/**
 * Galería: «Ruta navegable», la demo de `<nx-breadcrumb>`. Recursos humanos de una empresa de
 * Medellín: Personas › Empleados › una persona › sus secciones › contratos › otrosíes.
 *
 * Funciona como una SPA: cancela `nx-breadcrumb-navigate` y repinta la ruta y la página. Los hijos
 * de cada nivel los da la app al abrir el separador, respondiendo a `nx-breadcrumb-expand` (con
 * una espera corta, para ver «Cargando…»). Al elegir otra persona desde el separador se conserva la
 * sección: de Laura › Contratos a Andrés › Contratos.
 */
import "../src/components/breadcrumb/index";
import type { BreadcrumbExpandDetail, BreadcrumbItem, BreadcrumbNavigateDetail, NxBreadcrumb } from "../src/components/breadcrumb/index";

interface Node {
  id: string;
  label: string;
  /** La sección (Contratos, Ausencias…): con ella se sigue la ruta al cambiar de persona. */
  key?: string;
  icon?: string;
  person?: boolean;
  fields?: [string, string][];
  children?: Node[];
}

let seq = 0;
const node = (label: string, extra: Partial<Node> = {}): Node => ({ id: `n${++seq}`, label, ...extra });

const PEOPLE = ["Laura Gómez Restrepo", "Andrés Pardo Villa", "Marcela Ruiz Ospina", "Camilo Arango Mejía", "Daniela Henao Toro", "Felipe Zapata Ríos",
  "Juliana Cardona Gil", "Santiago Montoya Uribe", "Valentina Correa Mesa", "Sebastián Londoño Vélez", "Natalia Escobar Duque", "Mateo Jaramillo Soto",
  "Isabela Ochoa Patiño", "Óscar Bedoya Lara"];
const CONTRACTS = [
  ["Contrato indefinido 2024", "Prórroga 2023", "Contrato a término fijo 2022"],
  ["Contrato indefinido 2021", "Contrato a término fijo 2020"],
  ["Contrato a término fijo 2025"],
];
const contract = (label: string, j: number): Node => {
  const year = label.match(/\d{4}/)![0];
  const kind = label.startsWith("Prórroga") ? "Prórroga" : label.includes("indefinido") ? "Indefinido" : "Término fijo";
  return node(label, {
    fields: [["Tipo", kind], ["Inicio", `13 oct ${year}`], ["Jornada", "Completa · 47 h"], ["Sede", "Medellín · El Poblado"]],
    children: j === 0 ? [node("Otrosí n.º 3 · prórroga"), node("Otrosí n.º 2 · cambio de salario"), node("Otrosí n.º 1 · cambio de sede")] : undefined,
  });
};
const person = (name: string, i: number): Node =>
  node(name, {
    person: true,
    children: [
      node("Contratos", { key: "contratos", children: CONTRACTS[i % CONTRACTS.length].map(contract) }),
      node("Ausencias", { key: "ausencias", children: [node("Vacaciones · agosto 2026"), node("Incapacidad · marzo 2026"), node("Permiso · enero 2026")] }),
      node("Documentos", { key: "documentos", children: [node("Cédula de ciudadanía"), node("Título profesional"), node("Certificación bancaria"), node("Afiliación a EPS")] }),
      node("Evaluaciones", { key: "evaluaciones", children: [node("Evaluación 2025"), node("Evaluación 2024")] }),
    ],
  });
const ROOT = node("Personas", {
  icon: "users",
  children: [
    node("Empleados", { children: PEOPLE.map(person) }),
    node("Vacantes", { children: [node("Analista de datos"), node("Auxiliar de nómina"), node("Diseñadora de producto")] }),
    node("Ausencias", { children: [node("Solicitudes pendientes"), node("Calendario del equipo")] }),
    node("Organigrama"),
  ],
});
const DEFAULT_FIELDS: [string, string][] = [["Estado", "Vigente"], ["Actualizado", "29 sep 2026"], ["Responsable", "Marcela Ruiz"]];

const byId = new Map<string, Node>();
(function index(n: Node) {
  byId.set(n.id, n);
  n.children?.forEach(index);
})(ROOT);

/** Lo que la ruta necesita de un nodo. El `href` es el de la galería: la demo cancela la navegación.
 *  Con alternativas, `expandable: true`: su separador se abre y los hijos se piden al abrirlo. */
const toItem = (n: Node): BreadcrumbItem => ({ id: n.id, label: n.label, href: "#/breadcrumb", icon: n.icon, expandable: !!n.children && n.children.length > 1 });

const initials = (s: string) => s.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function mountBreadcrumbDemo(root: HTMLElement): void {
  const bc = root.querySelector<NxBreadcrumb>("#bc-demo");
  const app = root.querySelector<HTMLElement>("#bc-app");
  const title = root.querySelector<HTMLElement>("#bc-title");
  const meta = root.querySelector<HTMLElement>("#bc-meta");
  const body = root.querySelector<HTMLElement>("#bc-body");
  const log = root.querySelector<HTMLOListElement>("#bc-log");
  const width = root.querySelector<HTMLInputElement>("#bc-width");
  const out = root.querySelector<HTMLOutputElement>("#bc-width-out");
  if (!bc || !app || !title || !meta || !body || !width || !out) return;

  const laura = ROOT.children![0].children![0];
  let path: Node[] = [ROOT, ROOT.children![0], laura, laura.children![0], laura.children![0].children![0]];

  const paint = (focusTitle: boolean) => {
    bc.items = path.map(toItem);
    const cur = path[path.length - 1];
    title.textContent = cur.label;
    const kids = cur.children ?? [];
    body.replaceChildren();
    if (kids.length) {
      meta.textContent = cur.person ? `Ficha de empleado · ${kids.length} secciones` : `${kids.length} ${kids.length === 1 ? "elemento" : "elementos"}`;
      const ul = document.createElement("ul");
      ul.className = "bc-rows";
      for (const k of kids) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "bc-row";
        b.dataset.id = k.id;
        const lead = document.createElement("span");
        lead.className = k.person ? "bc-row__face" : "bc-row__dot";
        lead.textContent = k.person ? initials(k.label) : "";
        const label = document.createElement("span");
        label.className = "bc-row__label";
        label.textContent = k.label;
        const count = document.createElement("span");
        count.className = "bc-row__count";
        count.textContent = k.children ? String(k.children.length) : "";
        b.append(lead, label, count);
        const li = document.createElement("li");
        li.append(b);
        ul.append(li);
      }
      body.append(ul);
    } else {
      meta.textContent = `En ${path[path.length - 2]?.label ?? ""}`;
      const dl = document.createElement("dl");
      dl.className = "bc-fields";
      for (const [k, v] of cur.fields ?? DEFAULT_FIELDS) {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        dl.append(dt, dd);
      }
      body.append(dl);
    }
    if (focusTitle) title.focus();
  };

  // De Laura › Contratos a Andrés › Contratos: tras cambiar un nivel se sigue la ruta por sección mientras exista.
  const follow = (level: number, next: Node): Node[] => {
    const out = [...path.slice(0, level), next];
    let cur = next;
    for (const t of path.slice(level + 1)) {
      const m = t.key ? cur.children?.find((c) => c.key === t.key) : undefined;
      if (!m) break;
      out.push(m);
      cur = m;
    }
    return out;
  };

  bc.addEventListener("nx-breadcrumb-expand", (e) => {
    const { item, respond } = (e as CustomEvent<BreadcrumbExpandDetail>).detail;
    respond(sleep(250).then(() => (byId.get(item.id!)?.children ?? []).map(toItem)));
  });

  bc.addEventListener("nx-breadcrumb-navigate", (e) => {
    const d = (e as CustomEvent<BreadcrumbNavigateDetail>).detail;
    e.preventDefault();
    const target = byId.get(d.item.id!);
    if (!target) return;
    path = d.via === "menu" && path[d.level] !== target ? follow(d.level, target) : path.slice(0, d.level + 1);
    paint(d.via !== "menu");
    const li = document.createElement("li");
    li.textContent = `nx-breadcrumb-navigate · ${d.via} · nivel ${d.level} · ${d.item.label}`;
    log?.prepend(li);
    while (log && log.children.length > 6) log.lastElementChild?.remove();
  });

  body.addEventListener("click", (e) => {
    const row = (e.target as Element).closest<HTMLElement>("[data-id]");
    const n = row && byId.get(row.dataset.id!);
    if (!n) return;
    path = [...path, n];
    paint(true);
  });

  const stage = app.parentElement!;
  let full = true;
  const apply = () => {
    app.style.inlineSize = full ? "100%" : `${width.value}px`;
    app.classList.toggle("is-narrow", !full);
    out.textContent = `${Math.round(app.getBoundingClientRect().width)} px`;
  };
  width.addEventListener("input", () => {
    full = +width.value >= +width.max;
    apply();
  });
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(() => {
      width.max = String(Math.max(+width.min, Math.floor(stage.clientWidth)));
      if (full) width.value = width.max;
      apply();
    }).observe(stage);

  paint(false);
  apply();
}
