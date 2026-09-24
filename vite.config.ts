import { defineConfig, type Plugin } from "vite";
import { EMPLOYEE_FIELDS, EMPLOYEES } from "./gallery/demo-data";
import { searchOptions } from "./src/components/select/logic";

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
  if (command === "serve") return { root: "gallery", server: { port: 5173 }, plugins: [demoStream()] };

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
          icons: "src/icons/index.ts",
          bdui: "src/bdui.ts",
        },
        formats: ["es"],
      },
    },
  };
});
