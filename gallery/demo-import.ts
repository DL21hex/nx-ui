/**
 * Demo de `<nx-import>`: «Importar clientes» de un ERP. Genera en memoria los archivos de ejemplo
 * como llegan de verdad —un CSV exportado de otro sistema (separador `;`, windows-1252, títulos
 * arriba, un NIT con el dígito mal, un correo sin @, un repetido, una fecha 31/02, montos «$
 * 1.500.000»), un .xlsx con otros nombres de columna y uno grande de 20.000 filas— y su «servidor»
 * en el navegador, que rechaza dos clientes porque ya existen. No es parte de la librería.
 */
import type { ImportColumnInput, NxImport } from "../src/components/import/index";
import { buildXlsx } from "../src/components/grid/xlsx";
import { nitCheckDigit } from "../src/components/paste-fill/logic";
import { addDemoRoute } from "./demo-api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Las ciudades del ERP, con su código DANE (lo que se guarda). */
const CITIES: [string, string][] = [
  ["08001", "Barranquilla"],
  ["11001", "Bogotá D.C."],
  ["68001", "Bucaramanga"],
  ["76001", "Cali"],
  ["13001", "Cartagena"],
  ["05360", "Itagüí"],
  ["05001", "Medellín"],
  ["66001", "Pereira"],
];

export const IMPORT_COLUMNS: ImportColumnInput[] = [
  { key: "nit", label: "NIT", type: "nit", required: true, unique: true, aliases: ["nit/cc", "documento", "identificación", "rut"], hint: "Con o sin dígito de verificación" },
  { key: "razon_social", label: "Razón social", required: true, aliases: ["nombre", "cliente", "empresa"] },
  { key: "ciudad", label: "Ciudad", type: "option", options: CITIES.map(([value, label]) => ({ value, label })) },
  { key: "correo", label: "Correo", type: "email", aliases: ["correo electrónico", "email", "e-mail"] },
  { key: "telefono", label: "Teléfono", type: "phone", aliases: ["celular", "móvil", "tel"] },
  { key: "cupo", label: "Cupo de crédito", type: "money", min: 0, aliases: ["cupo"] },
  { key: "alta", label: "Fecha de alta", type: "date", aliases: ["fecha de creación", "creado"] },
  { key: "activo", label: "Activo", type: "bool", aliases: ["estado"] },
];

const NAMES = [
  "Aceros del Caribe S.A.S.",
  "Ferretería El Tornillo Ltda.",
  "Empaques Andinos S.A.S.",
  "Metalmecánica Los Andes S.A.S.",
  "Distribuidora La Montaña S.A.",
  "Transportes Río Magdalena S.A.S.",
  "Pinturas del Valle S.A.S.",
  "Plásticos Antioquia Ltda.",
  "Construcciones Santa Fe S.A.S.",
  "Agroinsumos del Llano S.A.S.",
  "Tecnoandina S.A.S.",
  "Logística Pacífico S.A.S.",
  "Café Alto de Letras S.A.S.",
  "Químicos Industriales del Norte S.A.",
  "Maderas La Ceja S.A.S.",
  "Hierros y Aceros Bucaramanga Ltda.",
  "Soluciones Eléctricas Pereira S.A.S.",
  "Textiles Itagüí S.A.S.",
  "Frigorífico San Martín S.A.",
  "Papelería El Estudiante S.A.S.",
  "Vidrios y Aluminios Cartagena S.A.S.",
  "Laboratorio Farmacéutico Andino S.A.",
  "Muebles Casa Linda S.A.S.",
  "Autopartes La 80 S.A.S.",
];
/** Dos clientes que el «ERP» ya tiene: el servidor los rechaza. */
const EXISTING = new Set([5, 13]);

const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ".");
const nitOf = (i: number) => {
  const base = String(900100000 + i * 37117);
  return { base, dv: nitCheckDigit(base) };
};
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/\s+/)
    .slice(0, 2)
    .join("")
    .replace(/[^a-z0-9]/g, "");
const pad = (n: number) => String(n).padStart(2, "0");

/** Un cliente de ejemplo (el `i` decide todo, así los archivos salen iguales cada vez). */
function client(i: number) {
  const name = i < NAMES.length ? NAMES[i] : `${NAMES[i % NAMES.length].replace(/ S\.A\.S\.| Ltda\.| S\.A\./, "")} ${Math.floor(i / NAMES.length) + 1} S.A.S.`;
  const { base, dv } = nitOf(i);
  const [, city] = CITIES[(i * 5) % CITIES.length];
  return {
    nit: `${thousands(Number(base))}-${dv}`,
    name,
    city,
    email: `compras@${slug(name)}.com.co`,
    phone: `3${pad(10 + (i % 40))} ${String(5550000 + i).slice(0, 3)} ${String(5550000 + i).slice(3)}`,
    cupo: (1 + (i % 12)) * 750_000,
    date: [(i % 27) + 1, (i % 9) + 1, 2026] as const,
    active: i % 7 === 3 ? "No" : i % 5 === 1 ? "X" : "Sí",
  };
}

/** windows-1252 (lo que exporta Excel en español): las letras latinas son un byte; el «–», 0x96. */
function win1252(text: string): Uint8Array {
  const extra: Record<string, number> = { "–": 0x96, "—": 0x97, "“": 0x93, "”": 0x94, "’": 0x92, "€": 0x80, "…": 0x85 };
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[i] = c < 256 ? c : (extra[text[i]] ?? 0x3f);
  }
  return out;
}

/** El CSV «exportado del sistema anterior», con los problemas de siempre. */
export function sampleCsv(rows = NAMES.length): Uint8Array {
  const sep = ";";
  const lines = [`Reporte de clientes – septiembre 2026${sep.repeat(7)}`, sep.repeat(7), ["NIT/CC", "Razón social", "Ciudad", "Correo electrónico", "Celular", "Cupo", "Fecha de creación", "Estado"].join(sep)];
  for (let i = 0; i < rows; i++) {
    const c = client(i);
    let { nit, email } = c;
    let [d, m, y] = c.date;
    if (i === 1) nit = nit.replace(/-\d$/, (x) => `-${(Number(x.slice(1)) + 3) % 10}`); // DV malo
    if (i === 3) email = email.replace("@", ""); // correo sin @
    if (i === 8) nit = client(2).nit; // repetido
    if (i === 10) (d = 31), (m = 2); // 31 de febrero
    lines.push([nit, c.name, i === 6 ? c.city.toUpperCase() : c.city, email, c.phone, `$ ${thousands(c.cupo)}`, `${pad(d)}/${pad(m)}/${y}`, c.active].join(sep));
  }
  return win1252(lines.join("\r\n") + "\r\n");
}

/** El mismo maestro como .xlsx, con otros nombres de columna (se asocian por alias y por contenido). */
export function sampleXlsx(): Promise<Blob> {
  const header = ["Documento", "Cliente", "Municipio", "Email", "Teléfono", "Cupo aprobado", "Fecha de alta", "Activo"];
  const rows = NAMES.slice(0, 12).map((_, i) => {
    const c = client(i);
    const [d, m, y] = c.date;
    return [c.nit.replace(/\./g, ""), c.name, c.city, c.email, c.phone, c.cupo, `${y}-${pad(m)}-${pad(d)}`, c.active === "No" ? "No" : "Sí"];
  });
  return buildXlsx("Clientes", header, rows, ["text", "text", "text", "text", "text", "money", "date", "text"], [14, 34, 14, 30, 14, 14, 14, 8]);
}

/* El «servidor» de la demo: recibe {rows, offset}, piensa un momento y rechaza los NIT que ya
   existen en el ERP (con el `row` absoluto: offset + índice en el lote). */
const TAKEN = new Set([...EXISTING].map((i) => `${nitOf(i).base}-${nitOf(i).dv}`));
addDemoRoute("/demo/import/clientes", async (req, out) => {
  let body: { rows?: { nit?: unknown }[]; offset?: unknown };
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    out.status(400);
    return out.end();
  }
  const rows = Array.isArray(body.rows) ? body.rows : [];
  const offset = typeof body.offset === "number" ? body.offset : 0;
  await sleep(120 + rows.length * 0.4);
  const errors = rows.flatMap((r, i) => (TAKEN.has(String(r?.nit)) ? [{ row: offset + i, field: "nit", message: "NIT ya existe en el sistema" }] : []));
  out.type("application/json");
  out.end(JSON.stringify(errors.length ? { errors } : {}));
});

/** Monta la demo: los archivos de ejemplo, el modo (con o sin servidor) y el registro de eventos. */
export function mountImportDemo(root: HTMLElement): void {
  const el = root.querySelector<NxImport>("#import-demo")!;
  el.columns = IMPORT_COLUMNS;
  el.labels = { done: "Importamos 1 cliente|Importamos {n} clientes", import: "Importar 1 cliente|Importar {n} clientes", ready: "1 cliente listo|{n} clientes listos" };
  const log = root.querySelector<HTMLOListElement>("#import-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  const samples: [string, () => Promise<File>][] = [
    ["Probar con un CSV de ejemplo", async () => new File([sampleCsv() as BlobPart], "clientes-septiembre.csv", { type: "text/csv" })],
    ["Probar con un Excel de ejemplo", async () => new File([await sampleXlsx()], "maestro-clientes.xlsx")],
    ["Archivo grande (20.000 filas)", async () => new File([sampleCsv(20_000) as BlobPart], "clientes-20000.csv", { type: "text/csv" })],
  ];
  const box = root.querySelector<HTMLElement>("#import-samples")!;
  for (const [label, make] of samples) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "imp-sample";
    b.textContent = label;
    b.addEventListener("click", async () => {
      el.reset();
      await el.load(await make());
    });
    box.append(b);
  }
  for (const r of root.querySelectorAll<HTMLInputElement>('input[name="imp-mode"]')) {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      if (r.value === "server") el.setAttribute("endpoint", "/demo/import/clientes");
      else el.removeAttribute("endpoint");
    });
  }
  el.addEventListener("nx-import-parsed", (e) => add(`nx-import-parsed → ${e.detail.name} · ${e.detail.rows} filas · encabezados en la fila ${e.detail.headerRow + 1}`));
  el.addEventListener("nx-import-mapped", (e) => add(`nx-import-mapped → ${Object.entries(e.detail.mapping).map(([k, v]) => `${k}:${v ?? (k in e.detail.fixed ? "fijo" : "—")}`).join(" ")}${e.detail.remembered ? " (recordado)" : ""}`));
  el.addEventListener("nx-import-done", (e) => add(`nx-import-done → ${e.detail.rows.length} filas · ${e.detail.skipped.length} sin importar · ${JSON.stringify(e.detail.rows[0] ?? {})}`));
  el.addEventListener("nx-import-error", (e) => add(`nx-import-error → ${e.detail.code}: ${e.detail.message}`));
}
