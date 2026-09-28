/**
 * Galería: `<nx-signature>`. El recibido a satisfacción de la remisión REM-4471 (Aceros del Caribe →
 * Ferretería El Tornillo, 6 ítems): nombre, cédula, firma y la huella del texto de la remisión.
 *
 * «Firmar en el celular» usa las sesiones de mentira de `demo-handoff.ts` (mismas rutas, en esta
 * pestaña) y, como allá, un celular simulado al lado con el `<nx-handoff side="phone">` real: al
 * abrir el enlace carga `<nx-signature>` y lo que se firma allí aparece en el formulario.
 */
import "../src/components/signature/index";
import "../src/components/handoff/index";
import type { NxSignature, SignatureValue } from "../src/components/signature/index";
import { created, route, type Session } from "./demo-handoff";

const DEVICES: Record<string, string> = { mouse: "Mouse", pen: "Lápiz", touch: "Dedo (pantalla táctil)", pointer: "Teclado o cargada" };
const nf = new Intl.NumberFormat("es-CO");

export function mountSignatureDemo(root: HTMLElement): void {
  route();
  const sig = root.querySelector<NxSignature>("#sg-sign")!;
  const form = root.querySelector<HTMLFormElement>("#sg-form")!;
  const log = root.querySelector<HTMLOListElement>("#sg-log")!;
  const screen = root.querySelector<HTMLElement>("#sg-screen")!;
  const openBtn = root.querySelector<HTMLButtonElement>("#sg-open")!;
  const result = root.querySelector<HTMLElement>("#sg-result")!;

  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 8) log.lastElementChild!.remove();
  };

  /** Lo que queda guardado: la imagen del SVG, los metadatos legibles y el JSON. */
  const show = ({ svg, meta }: SignatureValue) => {
    result.hidden = false;
    const img = root.querySelector<HTMLImageElement>("#sg-svg")!;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    root.querySelector("#sg-size")!.textContent = `${meta.width} × ${meta.height} px · ${nf.format(new Blob([svg]).size)} bytes`;
    const rows: [string, string][] = [
      ["Firmó", meta.name ?? "—"],
      ["Cédula", meta.id ?? "—"],
      ["Fecha", meta.signedAt ? new Date(meta.signedAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) : "—"],
      ["Con", meta.typed ? "Nombre escrito (firma tipográfica)" : `${DEVICES[meta.device] ?? meta.device} · ${meta.strokes} trazos, ${nf.format(meta.points)} puntos`],
      ["Huella (SHA-256)", meta.hash ?? "sin huella"],
    ];
    const dl = root.querySelector("#sg-meta")!;
    dl.replaceChildren(
      ...rows.map(([k, v]) => {
        const div = document.createElement("div");
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.textContent = k;
        dd.textContent = v;
        if (k.startsWith("Huella")) dd.className = "sg-hash";
        div.append(dt, dd);
        return div;
      }),
    );
    root.querySelector("#sg-raw")!.textContent = JSON.stringify({ svg, meta }, null, 2);
  };

  sig.addEventListener("nx-signature-change", (e) => add(`nx-signature-change → empty: ${e.detail.empty}`));
  sig.addEventListener("nx-signature-done", (e) => {
    const m = e.detail.meta;
    add(`nx-signature-done → ${m.name ?? "sin nombre"} · ${m.typed ? "escrita" : `${m.strokes} trazos`} · ${m.hash ? `${m.hash.slice(0, 12)}…` : "sin huella"}`);
    show(e.detail);
  });
  sig.addEventListener("nx-handoff-state", (e) => add(`nx-handoff-state → ${e.detail.state}`));

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return add("submit → falta algo (el navegador lo señala)");
    const v = new FormData(form).get("recibido");
    add(`submit → recibido: ${typeof v === "string" ? `${nf.format(v.length)} caracteres de JSON` : "sin valor"}`);
  });

  // El celular simulado: abre la sesión de firma más reciente, como si hubiera escaneado ese QR.
  let current: Session | null = null;
  const idle = (text: string) => {
    const p = document.createElement("p");
    p.className = "ho-phone__idle";
    p.textContent = text;
    screen.replaceChildren(p);
  };
  idle("Toca «Firmar en el celular» en el formulario: aparece un QR. Luego «Abrir el enlace del QR».");
  const onCreated = (s: Session) => {
    if (!root.isConnected) return void created.delete(onCreated);
    if (s.kind !== "signature") return;
    current = s;
    openBtn.disabled = false;
    idle("Hay un QR para firmar el recibido en el computador.");
  };
  created.add(onCreated);
  openBtn.disabled = true;
  openBtn.addEventListener("click", () => {
    if (!current) return;
    const el = document.createElement("nx-handoff");
    el.setAttribute("side", "phone");
    el.setAttribute("endpoint", "/demo/handoff");
    el.setAttribute("session", current.id);
    el.setAttribute("token", current.token);
    el.setAttribute("locale", "es-CO");
    el.addEventListener("nx-handoff-done", (e) => add(`celular: nx-handoff-done → ${e.detail.items.length} enviado`));
    el.addEventListener("nx-handoff-error", (e) => add(`celular: nx-handoff-error → ${e.detail.message}`));
    screen.replaceChildren(el);
  });
}
