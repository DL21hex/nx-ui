/**
 * Demo de `<nx-guard>`: «Registrar factura de proveedor» de Aceros del Caribe contra la OC-2291, con
 * la historia de precios y cantidades del proveedor, una fila de «Prueba esto» y el «servidor» que
 * sabe qué facturas ya se registraron. No es parte de la librería.
 */
import type { GuardFields, GuardFinding, NxGuard } from "../src/components/guard/index";
import { addDemoRoute } from "./demo-api";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* El «servidor»: conoce las facturas ya registradas del proveedor (la FC-8812 entró por otra sede)
   y lo dice con su fecha y su asiento. Lo demás, sin novedad. */
const REGISTERED: Record<string, string> = {
  "FC-8812": "Esta factura del proveedor ya se registró el 12 sept 2026 (asiento CP-004512, sede Malambo)",
  "FC-8811": "Ya registrada el 5 sept 2026 (asiento CP-004377)",
};
addDemoRoute("/demo/guard", async (req, out) => {
  let body: { field?: unknown; value?: unknown };
  try {
    body = JSON.parse(req.body || "{}");
  } catch {
    out.status(400);
    return out.end();
  }
  await sleep(350);
  const key = String(body.value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^FC\s*-?\s*/, "FC-");
  const message = body.field === "factura" ? REGISTERED[key] : undefined;
  out.type("application/json");
  out.end(JSON.stringify({ findings: message ? [{ field: "factura", kind: "duplicate", message }] : [] }));
});

/** La configuración: lo que el ERP sabe de este proveedor (historia reciente) y de la OC. */
export const GUARD_FIELDS: GuardFields = {
  factura: { repeat: true, history: ["FC-8797", "FC-8805", "FC-8809", "FC-8811"] },
  fecha: { typical: ["-60d", "today"] },
  cantidad: { history: [10, 12, 8, 12, 14, 10, 12] },
  precio: { history: [1180000, 1210000, 1195000, 1240000, 1225000, 1260000] },
  total: { expected: "#gd-oc-total" },
};

/** «Prueba esto»: el campo, lo que se teclea y qué debería pasar. */
export const GUARD_TRIES: { field: string; text: string; label: string }[] = [
  { field: "precio", text: "12.000.000", label: "12.000.000 en el precio" },
  { field: "cantidad", text: "1.5", label: "1.5 en la cantidad" },
  { field: "cantidad", text: "120", label: "120 láminas" },
  { field: "total", text: "13.500.000", label: "13.500.000 en el total" },
  { field: "fecha", text: "2062-09-24", label: "2062 en la fecha" },
  { field: "factura", text: "FC-8812", label: "FC-8812" },
];

export function mountGuardDemo(root: HTMLElement): void {
  const guard = root.querySelector<NxGuard>("#gd-demo")!;
  const form = root.querySelector<HTMLFormElement>("#gd-form")!;
  const log = root.querySelector<HTMLOListElement>("#guard-log")!;
  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };
  guard.fields = GUARD_FIELDS;

  const short = (f: GuardFinding) => `${f.kind}: «${f.message}»`;
  guard.addEventListener("nx-guard-warn", (e) => add(`nx-guard-warn → ${e.detail.field} · ${short(e.detail.finding)}`));
  guard.addEventListener("nx-guard-fix", (e) => add(`nx-guard-fix → ${e.detail.field}: ${JSON.stringify(e.detail.from)} → ${JSON.stringify(e.detail.to)}`));
  guard.addEventListener("nx-guard-ack", (e) => add(`nx-guard-ack → ${e.detail.field} = ${JSON.stringify(e.detail.value)}`));
  guard.addEventListener("nx-guard-block", (e) => add(`nx-guard-block → ${e.detail.findings.length} avisos sin reconocer`));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    add(`submit → factura registrada (${guard.findings.length ? `${guard.findings.length} avisos reconocidos o ignorados` : "sin avisos"})`);
  });
  form.addEventListener("reset", () => {
    guard.reset();
    add("reset → formulario limpio");
  });

  for (const r of root.querySelectorAll<HTMLInputElement>("input[name=gd-mode]"))
    r.addEventListener("change", () => {
      if (r.checked) guard.mode = r.value as "warn" | "confirm";
    });

  // «Prueba esto»: escribe como una persona (en <nx-number>, en su campo de texto) y sale del campo.
  const tries = root.querySelector<HTMLElement>("#gd-try")!;
  for (const t of GUARD_TRIES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gd-chip";
    b.textContent = t.label;
    b.addEventListener("click", () => {
      const el = form.querySelector<HTMLElement>(`[name="${t.field}"]`)!;
      const input = el.localName === "nx-number" ? el.querySelector("input")! : (el as HTMLInputElement);
      input.focus();
      input.value = t.text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      if (el.localName === "nx-number") input.blur();
      else input.dispatchEvent(new Event("change", { bubbles: true }));
      // El foco vuelve al botón: quien usa el teclado sigue probando desde ahí.
      b.focus();
    });
    tries.append(b);
  }
}
