/**
 * Demo de `<nx-paste-fill>`: el formulario «Nuevo proveedor» de Compras y tres textos de ejemplo
 * como llegan de verdad (un correo formal reenviado, un WhatsApp informal y una firma con el NIT
 * mal escrito), y su «servidor» en el navegador. No es parte de la librería.
 */
import type { NxPasteFill, PasteFieldInput } from "../src/components/paste-fill/index";
import { matchFields } from "../src/components/paste-fill/logic";
import type { PasteField } from "../src/components/paste-fill/types";
import { addDemoRoute } from "./demo-api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* El «servidor» de la demo: lee el texto con el mismo extractor que el navegador y transmite los
   campos uno a uno, con pausas reales, más una nota como la que daría un ERP. `?fail=1` responde
   503 después de pensarlo un momento (para ver el aviso). */
addDemoRoute("/demo/paste-fill", async (req, out) => {
  let body: { text?: unknown; fields?: unknown };
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    out.status(400);
    return out.end();
  }
  if (req.url.searchParams.has("fail")) {
    await sleep(900);
    out.status(503);
    return out.end("El lector no está disponible");
  }
  const text = typeof body.text === "string" ? body.text : "";
  const fields = (Array.isArray(body.fields) ? body.fields : []) as PasteField[];
  out.type("application/x-ndjson");
  const send = (o: object) => !out.closed() && out.write(`${JSON.stringify(o)}\n`);
  await sleep(500);
  for (const f of matchFields(fields, text)) {
    if (out.closed()) return;
    // El servidor «conoce» a los terceros: lo que sale de la firma o del remitente lo confirma.
    send({ type: "field", ...f, confidence: Math.min(0.99, f.confidence + (f.confidence >= 0.8 ? 0.02 : 0)) });
    await sleep(160 + Math.random() * 180);
  }
  send({ type: "note", message: /nit/i.test(text) ? "El proveedor no existe todavía en el maestro de terceros: se creará al guardar." : "Sin NIT en el texto: habrá que pedirlo antes de crear el tercero." });
  await sleep(200);
  send({ type: "done" });
  out.end();
});

export const PASTE_SAMPLES: { id: string; label: string; text: string }[] = [
  {
    id: "correo",
    label: "Correo formal",
    text: `De: Carolina Gómez Restrepo <cgomez@acerosdelcaribe.com.co>
Enviado: jueves, 24 de septiembre de 2026 4:12 p. m.
Para: compras@metalmecanicaandina.co
Asunto: Datos para creación como proveedor

Buenas tardes, equipo de Compras:

Cordial saludo. Atendiendo su solicitud, les compartimos los datos para el registro de Aceros del Caribe S.A.S. como proveedor:

NIT: 900.359.742-3
Dirección: Vía 40 # 71-197, Bodega 12, Barranquilla
PBX: (605) 385 4400 ext. 112

Nuestras condiciones de pago son a 30 días a partir de la radicación de la factura. Para el primer pedido (lámina HR calibre 12, 40 unidades) el valor sería de $ 18.450.000 antes de IVA, con entrega el próximo viernes en su planta de Malambo.

Quedo atenta a cualquier inquietud.

Atentamente,

Carolina Gómez Restrepo
Ejecutiva Comercial
Cel. 315 678 2341
www.acerosdelcaribe.com.co`,
  },
  {
    id: "whatsapp",
    label: "WhatsApp informal",
    text: `[24/09/26, 9:41 a. m.] Jhon Fredy Ospina: Buenos días inge, le paso los datos pa lo del proveedor
[24/09/26, 9:41 a. m.] Jhon Fredy Ospina: Empaques Andinos SAS nit 901458223-0
[24/09/26, 9:42 a. m.] Jhon Fredy Ospina: el contacto soy yo, jhon fredy ospina, mi cel es 3007894512 y el correo jfospina@empaquesandinos.co
[24/09/26, 9:43 a. m.] Jhon Fredy Ospina: estamos en Medellín, bueno en Itagüí más exactamente
[24/09/26, 9:44 a. m.] Jhon Fredy Ospina: el primer pedido serían como 1,45 millones y se lo entregamos el 15 de octubre
[24/09/26, 9:44 a. m.] Jhon Fredy Ospina: pago de contado porfa 🙏`,
  },
  {
    id: "firma",
    label: "Firma con NIT mal escrito",
    text: `Quedo pendiente de la orden de compra.

--
Ing. Luisa Fernanda Rojas
Directora Comercial · Ferretería Industrial El Tornillo Ltda.
NIT 800.123.456-1
Cra. 15 # 93-47 Of. 301, Bogotá D.C.
Tel. (601) 742 1100 · Cel. +57 311 234 5678
lrojas@eltornillo.com.co`,
  },
];

/** Las ciudades del formulario, con su código DANE (lo que guarda el ERP). */
export const PASTE_CITIES: [string, string][] = [
  ["08001", "Barranquilla"],
  ["11001", "Bogotá D.C."],
  ["68001", "Bucaramanga"],
  ["76001", "Cali"],
  ["13001", "Cartagena"],
  ["05360", "Itagüí"],
  ["05001", "Medellín"],
  ["66001", "Pereira"],
];

/** Lo que el formulario no dice con su marcado: el monto es dinero aunque sea un texto. */
export const PASTE_FIELDS: PasteFieldInput[] = [{ name: "monto", kind: "money" }];

/** Monta la demo: el formulario, los ejemplos de un clic, el modo (local / servidor) y el registro. */
export function mountPasteFillDemo(root: HTMLElement): void {
  const pf = root.querySelector<NxPasteFill>("#pf-demo")!;
  pf.fields = PASTE_FIELDS;
  const log = root.querySelector<HTMLOListElement>("#paste-fill-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  let quiet = false;
  const samples = root.querySelector<HTMLElement>("#pf-samples")!;
  for (const s of PASTE_SAMPLES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pf-sample";
    b.dataset.sample = s.id;
    b.textContent = s.label;
    // Cada ejemplo parte del formulario como lo dejó la persona: se deshace lo que llenaron los
    // anteriores (lo escrito a mano se queda, y así se ve la sugerencia).
    b.addEventListener("click", () => {
      quiet = true;
      while (pf.undo());
      quiet = false;
      void pf.fill(s.text);
    });
    samples.append(b);
  }
  for (const r of root.querySelectorAll<HTMLInputElement>('input[name="pf-mode"]')) {
    r.addEventListener("change", () => {
      if (!r.checked) return;
      if (r.value === "local") pf.removeAttribute("endpoint");
      else pf.setAttribute("endpoint", r.value === "fail" ? "/demo/paste-fill?fail=1" : "/demo/paste-fill");
    });
  }
  pf.addEventListener("nx-paste-fill-start", (e) => add(`nx-paste-fill-start → ${e.detail.text.length} caracteres`));
  pf.addEventListener("nx-paste-fill-done", (e) => add(`nx-paste-fill-done → ${e.detail.fields.map((f) => `${f.name} ${Math.round(f.confidence * 100)} %`).join(" · ") || "nada"}`));
  pf.addEventListener("nx-paste-fill-undo", (e) => quiet || add(`nx-paste-fill-undo → ${Object.keys(e.detail.values).length} campos devueltos`));
  root.querySelector("#pf-form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target as HTMLFormElement));
    add(`submit → ${JSON.stringify(data)}`);
  });
}
