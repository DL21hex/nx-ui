/**
 * Galería: `<nx-handoff>`. La recepción de la OC-2291 de Aceros del Caribe: adjuntar la factura del
 * proveedor con una foto del celular, y contar lo que llegó escaneando con el celular.
 *
 * El «servidor» de las sesiones vive en esta pestaña (`addDemoRoute("/demo/handoff", …)`), así que
 * un teléfono de verdad no lo alcanza: al lado del formulario hay un celular simulado con el
 * `<nx-handoff side="phone">` real, apuntando a la misma sesión que muestra el QR.
 *
 * `demoFetch` solo pasa cuerpos de texto; las fotos (FormData) y su descarga (binaria) las atiende
 * una capa más de `fetch`, aquí mismo, que guarda los archivos en memoria como lo haría el servidor.
 */
import "../src/components/handoff/index";
import "../src/components/scan/index";
import type { NxHandoff } from "../src/components/handoff/index";
import type { NxScan } from "../src/components/scan/index";
import { addDemoRoute } from "./demo-api";
import { SCAN_PRODUCTS } from "./demo-scan";

type Ev = Record<string, unknown> & { seq: number };
type Session = {
  id: string;
  token: string;
  kind: string;
  accept?: string;
  multiple?: boolean;
  demo: string;
  expiresAt: number;
  events: Ev[];
  seq: number;
  phone: boolean;
  closed: boolean;
};

/** Vigencia de una sesión de la demo (5 min). */
const TTL = 5 * 60_000;
const sessions = new Map<string, Session>();
/** Los archivos que «guardó» el servidor, por clave. */
const blobs = new Map<string, Blob>();
const created = new Set<(s: Session) => void>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rid = () => Math.random().toString(36).slice(2, 10);
const push = (s: Session, ev: Record<string, unknown>) => s.events.push({ ...ev, seq: ++s.seq });
const json = (s: string) => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

const TITLES: Record<string, { title: string; hint: string }> = {
  factura: { title: "Factura del proveedor · OC-2291", hint: "Aceros del Caribe S.A.S. Que se lean el NIT, la fecha y el total." },
  conteo: { title: "Recepción OC-2291", hint: "Escanea cada caja o bulto: el conteo aparece en el computador." },
};

let routed = false;
function route(): void {
  if (routed) return;
  routed = true;
  // Las seis rutas del protocolo (ver INTEGRATION.md), en memoria.
  addDemoRoute("/demo/handoff", async (req, out) => {
    const path = req.url.pathname.slice(req.url.pathname.indexOf("/demo/handoff") + "/demo/handoff".length);
    const [, id, action] = path.split("/");
    const t = req.url.searchParams.get("t");
    const reply = (o: unknown, status = 200) => {
      out.status(status);
      out.type("application/json");
      out.end(JSON.stringify(o));
    };
    // POST /demo/handoff → crea la sesión.
    if (!id) {
      if (req.method !== "POST") return reply({ error: "método" }, 405);
      const body = json(req.body) as { kind?: string; accept?: string; multiple?: boolean; context?: { demo?: string } };
      const s: Session = {
        id: rid(),
        token: rid() + rid(),
        kind: body.kind ?? "photo",
        accept: body.accept,
        multiple: body.multiple,
        demo: body.context?.demo ?? "factura",
        expiresAt: Date.now() + TTL,
        events: [],
        seq: 0,
        phone: false,
        closed: false,
      };
      sessions.set(s.id, s);
      await sleep(250);
      for (const fn of created) fn(s);
      return reply({ id: s.id, url: `${location.origin}${location.pathname}?s=${s.id}&t=${s.token}#/handoff`, expiresIn: TTL / 1000, token: s.token });
    }
    const s = sessions.get(id);
    const alive = !!s && !s.closed && Date.now() < s.expiresAt;
    // DELETE → la sesión queda inválida (200 y no 204: `Response` no acepta cuerpo con 204).
    if (req.method === "DELETE") {
      if (s) s.closed = true;
      return reply({});
    }
    // GET …/events → el stream (NDJSON), desde `after`.
    if (action === "events") {
      if (!s) return reply({ error: "no existe" }, 404);
      out.type("application/x-ndjson");
      out.write("");
      let after = Number(req.url.searchParams.get("after") ?? 0);
      while (!out.closed()) {
        for (const ev of s.events.filter((e) => e.seq > after)) {
          out.write(`${JSON.stringify(ev)}\n`);
          after = ev.seq;
        }
        if (!alive || s.closed || Date.now() >= s.expiresAt) {
          out.write(`${JSON.stringify({ type: "expired" })}\n`);
          return out.end();
        }
        await sleep(120);
      }
      return;
    }
    const phone = t !== null;
    if (phone && (!alive || t !== s!.token)) return reply({ error: "vencida o ya usada" }, 410);
    // GET …?t= → lo que ve el celular (y el escritorio se entera de que se conectó).
    if (req.method === "GET" && !action && phone) {
      await sleep(300);
      if (!s!.phone) {
        s!.phone = true;
        push(s!, { type: "connected", device: "Celular simulado" });
      }
      return reply({ kind: s!.kind, accept: s!.accept, multiple: s!.multiple, ...TITLES[s!.demo] });
    }
    // GET … (sin token) → polling del escritorio.
    if (req.method === "GET" && !action) {
      if (!alive) return reply({ error: "vencida" }, 410);
      const after = Number(req.url.searchParams.get("after") ?? 0);
      return reply({ events: s!.events.filter((e) => e.seq > after) });
    }
    // POST …/items?t= → una foto (ya guardada por la capa de abajo) o un código.
    if (req.method === "POST" && action === "items" && phone) {
      const body = json(req.body) as { kind?: string; name?: string; type?: string; size?: number; key?: string; code?: string; format?: string };
      await sleep(200);
      const n = s!.seq + 1;
      const item =
        body.kind === "file" && body.key
          ? { kind: "file", id: `f${n}`, name: body.name, type: body.type, size: body.size, url: `${req.url.pathname.replace(/\/items$/, "")}/files/${body.key}` }
          : { kind: "code", id: `c${n}`, code: String(body.code ?? ""), ...(body.format ? { format: body.format } : {}) };
      push(s!, { type: "item", item });
      return reply({ item });
    }
    // POST …/done?t= → el celular terminó (la sesión sigue vigente para «Recibir más»).
    if (req.method === "POST" && action === "done" && phone) {
      push(s!, { type: "done" });
      return reply({}, 200);
    }
    return reply({ error: "no existe" }, 404);
  });
}

let wrapped = false;
/** Las fotos: `demoFetch` no pasa FormData ni responde binario, así que se atienden aquí. */
function files(): void {
  if (wrapped) return;
  wrapped = true;
  const next = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const file = /\/demo\/handoff\/[^/]+\/files\/([^/]+)$/.exec(url.pathname);
    if (file) {
      await sleep(200);
      const b = blobs.get(file[1]);
      return b ? new Response(b, { headers: { "Content-Type": b.type || "application/octet-stream" } }) : new Response("no existe", { status: 404 });
    }
    if (init.body instanceof FormData && url.pathname.includes("/demo/handoff/")) {
      const f = init.body.get("file");
      if (f instanceof File) {
        const key = rid();
        blobs.set(key, f);
        // Una subida por 4G: unos cientos de milisegundos por foto.
        await sleep(400 + Math.min(1200, f.size / 2000));
        const body = JSON.stringify({ kind: "file", name: f.name, type: f.type, size: f.size, key });
        return next(input, { ...init, body, headers: { "Content-Type": "application/json" } });
      }
    }
    return next(input, init);
  }) as typeof fetch;
}

/** Una foto de ejemplo: la factura sobre el escritorio, un poco torcida, como la tomaría alguien. */
async function sampleInvoice(): Promise<File> {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 1600;
  const g = c.getContext("2d")!;
  g.fillStyle = "#8a8f98";
  g.fillRect(0, 0, c.width, c.height);
  g.translate(600, 800);
  g.rotate(-0.035);
  g.fillStyle = "#fbfbf8";
  g.fillRect(-470, -660, 940, 1320);
  g.fillStyle = "#1c2230";
  const text = (s: string, x: number, y: number, size = 26, weight = 400) => {
    g.font = `${weight} ${size}px system-ui, sans-serif`;
    g.fillText(s, x, y);
  };
  text("ACEROS DEL CARIBE S.A.S.", -420, -580, 38, 700);
  text("NIT 900.123.456-7 · Barranquilla", -420, -535);
  text("FACTURA ELECTRÓNICA DE VENTA", -420, -450, 30, 700);
  text("FE-10482", 250, -450, 30, 700);
  text("Fecha: 24/09/2026 · Vence: 24/10/2026", -420, -405);
  text("Cliente: Metalmecánica Andina · OC-2291", -420, -365);
  g.fillRect(-420, -330, 840, 3);
  const rows = [
    ["Lámina HR 3 mm 4×8", "40", "7.350.000"],
    ['Tubo estructural 2" × 6 m', "24", "2.184.000"],
    ['Ángulo 1½" × ⅛" × 6 m', "30", "1.290.000"],
  ];
  rows.forEach(([d, q, v], i) => {
    const y = -280 + i * 50;
    text(d, -420, y);
    text(q, 160, y);
    text(v, 260, y);
  });
  g.fillRect(-420, -110, 840, 2);
  text("Subtotal", 60, -60);
  text("10.824.000", 260, -60);
  text("IVA 19 %", 60, -15);
  text("2.056.560", 260, -15);
  text("TOTAL", 60, 45, 32, 700);
  text("$ 12.880.560", 200, 45, 32, 700);
  text("CUFE 3f9a…c21e", -420, 560, 20);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
  return new File([blob ?? new Blob()], "factura-FE-10482.jpg", { type: "image/jpeg" });
}

/** Pone archivos en un `<input type=file>` como si la persona los eligiera. */
function choose(input: HTMLInputElement, list: File[]): void {
  const dt = new DataTransfer();
  for (const f of list) dt.items.add(f);
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

const kb = (n: number) => `${new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n / 1024)} KB`;

export function mountHandoffDemo(root: HTMLElement): void {
  route();
  files();
  const photo = root.querySelector<NxHandoff>("#ho-photo")!;
  const scan = root.querySelector<NxHandoff>("#ho-scan")!;
  const count = root.querySelector<NxScan>("#ho-count")!;
  const input = root.querySelector<HTMLInputElement>("#ho-factura")!;
  const preview = root.querySelector<HTMLElement>("#ho-preview")!;
  const log = root.querySelector<HTMLOListElement>("#ho-log")!;
  const screen = root.querySelector<HTMLElement>("#ho-screen")!;
  const openBtn = root.querySelector<HTMLButtonElement>("#ho-open")!;
  const sampleBtn = root.querySelector<HTMLButtonElement>("#ho-sample")!;
  const codes = root.querySelector<HTMLElement>("#ho-codes")!;

  const add = (text: string) => {
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 8) log.lastElementChild!.remove();
  };
  for (const el of [photo, scan]) {
    el.addEventListener("nx-handoff-state", (e) => add(`nx-handoff-state → #${el.id} ${e.detail.state}`));
    el.addEventListener("nx-handoff-item", (e) => {
      const it = e.detail.item;
      add(`nx-handoff-item → #${el.id} ${it.kind === "file" ? `${it.name} (${kb(it.size)})` : it.kind === "code" ? it.code : "dato"}`);
    });
    el.addEventListener("nx-handoff-done", (e) => add(`nx-handoff-done → #${el.id} ${e.detail.items.length} recibidos`));
    el.addEventListener("nx-handoff-error", (e) => add(`nx-handoff-error → #${el.id} ${e.detail.message}`));
  }

  // Las líneas de la orden, para que el conteo muestre lo que falta desde el comienzo.
  count.items = SCAN_PRODUCTS.slice(0, 4).map((p) => ({ code: p.code, name: p.name, unit: p.unit, expected: p.expected, qty: 0 }));

  // El formulario ve la factura como si la hubieran elegido a mano: su `change` de siempre.
  let shown = "";
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (shown) URL.revokeObjectURL(shown);
    shown = "";
    preview.replaceChildren();
    if (!f) return;
    if (f.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = shown = URL.createObjectURL(f);
      img.alt = "";
      preview.append(img);
    }
    const p = document.createElement("p");
    p.textContent = `${f.name} · ${kb(f.size)}`;
    preview.append(p);
  });

  // El celular simulado: abre la sesión más reciente, como si hubiera escaneado ese QR.
  let current: Session | null = null;
  const idle = (text: string) => {
    const p = document.createElement("p");
    p.className = "ho-phone__idle";
    p.textContent = text;
    screen.replaceChildren(p);
    sampleBtn.hidden = true;
    codes.hidden = true;
  };
  idle("Toca «Usar el celular» en el formulario: aparece un QR. Luego «Abrir el enlace del QR».");
  const onCreated = (s: Session) => {
    if (!root.isConnected) return void created.delete(onCreated);
    current = s;
    openBtn.disabled = false;
    idle(s.kind === "scan" ? "Hay un QR para escanear códigos en el computador." : "Hay un QR para la foto de la factura en el computador.");
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
    el.addEventListener("nx-handoff-done", (e) => add(`celular: nx-handoff-done → ${e.detail.items.length} enviados`));
    el.addEventListener("nx-handoff-error", (e) => add(`celular: nx-handoff-error → ${e.detail.message}`));
    screen.replaceChildren(el);
    sampleBtn.hidden = current.kind === "scan";
    codes.hidden = current.kind !== "scan";
  });
  sampleBtn.addEventListener("click", async () => {
    // El selector de la galería del celular (el que no abre la cámara).
    const gallery = [...screen.querySelectorAll<HTMLInputElement>('input[type="file"]')].find((i) => !i.hasAttribute("capture"));
    if (gallery) choose(gallery, [await sampleInvoice()]);
  });
  for (const p of SCAN_PRODUCTS.slice(0, 4)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "dlg-plain";
    b.textContent = p.name.split(" ").slice(0, 3).join(" ");
    b.setAttribute("aria-label", `Leer con el celular: ${p.name}`);
    b.addEventListener("click", () => screen.querySelector<NxScan>("nx-scan")?.add(p.code, 1, "ean_13"));
    codes.append(b);
  }
}
