import { defineConfig, type Plugin } from "vite";
import { EMPLOYEE_FIELDS, EMPLOYEES } from "./gallery/demo-data";
import { aiCell, purchasePage } from "./gallery/demo-grid";
import { invoiceEvents, invoiceSvg } from "./gallery/demo-invoice";
import { searchOptions } from "./src/components/select/logic";

/**
 * Solo en la galería: un "modelo" de mentira que habla el protocolo de IA de nx-ui, con pausas
 * reales. Tres guiones según la pregunta (proveedores, costos, genérico); «error» falla a mitad.
 */
function demoAi(): Plugin {
  type Line = Record<string, unknown>;
  const script = (q: string): { steps: [string, string, string?][]; sources: Line[]; text: string; notes: Line[]; actions: Line[] } => {
    const t = q.toLowerCase();
    if (/proveedor|retras|entreg/.test(t))
      return {
        steps: [["s1", "Consultando órdenes de compra de septiembre", "212 órdenes"], ["s2", "Cruzando fechas de entrega con recepciones"], ["s3", "Agrupando retrasos por proveedor", "3 proveedores"]],
        sources: [
          { id: "oc2291", title: "OC-2291 · Aceros del Caribe", detail: "recibida el 12 sep, vencía el 5 sep", href: "#/ai" },
          { id: "oc2310", title: "OC-2310 · Empaques Andinos", detail: "recibida el 18 sep, vencía el 14 sep", href: "#/ai" },
          { id: "ctg04", title: "Ruta CTG-04 · Transportes Rivera", detail: "3 de 5 viajes con novedad" },
        ],
        text: "Este mes se retrasaron **3 proveedores**:\n\n- **Aceros del Caribe**: 4 entregas tarde, 6,2 días en promedio[^oc2291].\n- **Empaques Andinos**: 2 entregas tarde[^oc2310].\n- **Transportes Rivera**: solo en la ruta a Cartagena[^ctg04].\n\nAceros del Caribe es el más crítico: sus retrasos detuvieron la línea 2 dos veces.",
        notes: [{ label: "datos de hoy", tone: "neutral" }],
        actions: [{ label: "Ver las 7 órdenes", href: "#/ai" }, { label: "Redactar reclamo a Aceros del Caribe", id: "reclamo", data: { proveedor: "Aceros del Caribe" } }],
      };
    if (/cost|produc|gast/.test(t))
      return {
        steps: [["s1", "Consultando costos de producción · jul–ago", "14 centros de costo"], ["s2", "Comparando contra el presupuesto"], ["s3", "Buscando causas en órdenes y novedades"], ["s4", "Verificando cifras contra el libro mayor"]],
        sources: [
          { id: "mayor", title: "Libro mayor · agosto", detail: "cuentas 7105–7120" },
          { id: "acero", title: "Lista de precios · Aceros del Caribe", detail: "vigente desde el 3 ago" },
          { id: "paro", title: "Novedad N-8812 · paro de la empacadora", detail: "línea 2, 31 h" },
        ],
        text: "El costo de producción de agosto subió **11,4 %**[^mayor] por dos causas:\n\n- El acero laminado aumentó **18 %** desde el 3 de agosto[^acero].\n- La línea 2 perdió **31 horas** por el paro de la empacadora, que se cubrieron con horas extra[^paro].\n\nSin el paro, el alza habría sido de **6,8 %**.",
        notes: [{ label: "cifras verificadas", tone: "success" }],
        actions: [{ label: "Abrir el análisis de costos", href: "#/ai" }],
      };
    return {
      steps: [["s1", "Entendiendo la pregunta"], ["s2", "Buscando en el sistema"]],
      sources: [],
      text: "Esto es una demo con respuestas de ejemplo. Prueba con **«¿Qué proveedores se retrasaron este mes?»** o **«¿Por qué subió el costo de producción en agosto?»**, o incluye la palabra `error` para ver cómo se muestra un fallo.",
      notes: [],
      actions: [],
    };
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    name: "nx-demo-ai",
    configureServer(server) {
      server.middlewares.use("/demo/ai", async (req, res) => {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        const question = String((JSON.parse(raw || "{}") as { question?: string }).question ?? "");
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Cache-Control", "no-store");
        let closed = false;
        req.on("close", () => (closed = true));
        const send = (o: Line) => !closed && res.write(`${JSON.stringify(o)}\n`);
        const s = script(question);
        for (const [id, label, detail] of s.steps) {
          send({ type: "step", id, label, status: "run" });
          await sleep(500 + Math.random() * 500);
          send({ type: "step", id, status: "done", ...(detail ? { detail } : {}) });
        }
        if (/error/i.test(question)) {
          send({ type: "text", delta: "Empecé a revisar las órdenes, pero " });
          await sleep(400);
          send({ type: "error", message: "el servicio de compras no respondió (timeout)" });
          return res.end();
        }
        for (const src of s.sources) send({ type: "source", ...src });
        // El texto sale en trozos de 1–3 palabras, como un modelo.
        const words = s.text.split(/(?<=\s)/);
        for (let i = 0; i < words.length && !closed; ) {
          const n = 1 + Math.floor(Math.random() * 3);
          send({ type: "text", delta: words.slice(i, i + n).join("") });
          i += n;
          await sleep(35 + Math.random() * 45);
        }
        for (const n of s.notes) send({ type: "note", ...n });
        for (const a of s.actions) send({ type: "action", ...a });
        send({ type: "done" });
        res.end();
      });
    },
  };
}

/**
 * Solo en la galería: un «lector de documentos» de mentira para <nx-doc-capture>. Sirve la
 * factura como imagen y transmite sus campos, recuadros y validaciones con pausas reales.
 */
function demoCapture(): Plugin {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  return {
    name: "nx-demo-capture",
    configureServer(server) {
      server.middlewares.use("/demo/capture/factura.svg", (_req, res) => {
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(invoiceSvg());
      });
      server.middlewares.use("/demo/capture/registrar", async (req, res) => {
        for await (const _ of req) void _;
        await sleep(700);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      });
      server.middlewares.use("/demo/capture", async (req, res, next) => {
        if (req.method !== "POST") return next();
        for await (const _ of req) void _; // el archivo: la demo siempre «lee» la misma factura
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Cache-Control", "no-store");
        let closed = false;
        req.on("close", () => (closed = true));
        await sleep(350);
        for (const ev of invoiceEvents()) {
          if (closed) return;
          res.write(`${JSON.stringify(ev)}\n`);
          const type = (ev as { type: string }).type;
          await sleep(type === "page" ? 500 : type === "check" ? 260 : 90 + Math.random() * 140);
        }
        res.write(`${JSON.stringify({ type: "done" })}\n`);
        res.end();
      });
    },
  };
}

/**
 * Solo en la galería: el backend de <nx-grid>. `/demo/grid/rows` pagina 20.000 filas con filtros,
 * orden, histogramas y facetas; `/demo/grid/ai` «calcula» una columna de IA fila por fila, en
 * streaming y en desorden, como lo haría un modelo con varias peticiones en paralelo.
 */
function demoGrid(): Plugin {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const body = async (req: AsyncIterable<Buffer>) => {
    let s = "";
    for await (const c of req) s += c;
    try {
      return JSON.parse(s);
    } catch {
      return {};
    }
  };
  return {
    name: "nx-demo-grid",
    configureServer(server) {
      server.middlewares.use("/demo/grid/rows", async (req, res) => {
        const q = await body(req);
        await sleep(120 + Math.random() * 180);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(purchasePage(q)));
      });
      server.middlewares.use("/demo/grid/ai", async (req, res) => {
        const q = await body(req);
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Cache-Control", "no-store");
        let closed = false;
        req.on("close", () => (closed = true));
        const rows: Record<string, unknown>[] = Array.isArray(q.rows) ? [...q.rows] : [];
        rows.sort(() => Math.random() - 0.5);
        await sleep(300);
        for (const row of rows) {
          if (closed) return;
          res.write(`${JSON.stringify({ type: "cell", id: row.id, ...aiCell(String(q.prompt ?? ""), row) })}\n`);
          await sleep(25 + Math.random() * 70);
        }
        res.end(`${JSON.stringify({ type: "done" })}\n`);
      });
    },
  };
}

/** Solo en la galería: un endpoint que transmite NDJSON con pausas reales, para probar
 *  `<nx-button stream>` contra un servidor de verdad. `?fail=1` falla en el paso 4. */
function demoStream(): Plugin {
  const steps = ["Validando campos obligatorios", "Generando PDF · 3 páginas", "Subiendo a R2 · 412 KB", "Notificando a 4 aprobadores", "Registrando auditoría"];
  return {
    name: "nx-demo-stream",
    configureServer(server) {
      // Búsqueda en servidor para <nx-select source>: filtra con la misma lógica, 25 por página y
      // una espera de red simulada para que se vea el estado «Buscando…».
      server.middlewares.use("/demo/empleados", async (req, res) => {
        const q = new URL(req.url ?? "", "http://x").searchParams.get("q") ?? "";
        await new Promise((r) => setTimeout(r, 250 + Math.random() * 250));
        const options = searchOptions(EMPLOYEES, EMPLOYEE_FIELDS, q).slice(0, 25).map((m) => m.option);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ options }));
      });
      server.middlewares.use("/demo/stream", async (req, res) => {
        const fail = new URL(req.url ?? "", "http://x").searchParams.has("fail");
        res.setHeader("Content-Type", "application/x-ndjson");
        res.setHeader("Cache-Control", "no-store");
        const send = (o: object) => res.write(`${JSON.stringify(o)}\n`);
        for (let i = 0; i < steps.length; i++) {
          send({ msg: steps[i], progress: i / steps.length });
          await new Promise((r) => setTimeout(r, 600 + Math.random() * 500));
          if (fail && i === 3) {
            send({ ok: false, msg: "SMTP 421 · reintenta en 30 s" });
            return res.end();
          }
        }
        send({ ok: true, progress: 1 });
        res.end();
      });
    },
  };
}

// `vite`            → galería (gallery/)
// `vite build`      → librería ESM, una entrada por subruta del package
// `vite build --mode iife` → dist/nx-ui.iife.js, todo-en-uno para <script>
export default defineConfig(({ command, mode }) => {
  if (command === "serve") return { root: "gallery", server: { port: 5173 }, plugins: [demoStream(), demoAi(), demoCapture(), demoGrid()] };

  if (mode === "iife") {
    return {
      build: {
        target: "es2022",
        emptyOutDir: false,
        lib: { entry: "src/iife.ts", name: "NxUI", formats: ["iife"], fileName: () => "nx-ui.iife.js" },
      },
    };
  }

  return {
    build: {
      target: "es2022",
      emptyOutDir: false,
      lib: {
        entry: {
          index: "src/index.ts",
          sidemenu: "src/components/sidemenu/index.ts",
          button: "src/components/button/index.ts",
          select: "src/components/select/index.ts",
          ai: "src/components/ai/index.ts",
          capture: "src/components/capture/index.ts",
          grid: "src/components/grid/index.ts",
          icons: "src/icons/index.ts",
          bdui: "src/bdui.ts",
        },
        formats: ["es"],
      },
    },
  };
});
