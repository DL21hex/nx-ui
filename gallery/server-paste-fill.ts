/**
 * Solo en la galería: el «servidor» de `<nx-paste-fill>`. Lee el texto con el mismo extractor que
 * el navegador y transmite los campos uno a uno, con pausas reales, más una nota como la que daría
 * un ERP. `?fail=1` responde 503 después de pensarlo un momento (para ver el aviso).
 */
import type { ViteDevServer } from "vite";
import { matchFields } from "../src/components/paste-fill/logic";
import type { PasteField } from "../src/components/paste-fill/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function configurePasteFill(server: ViteDevServer): void {
  server.middlewares.use("/demo/paste-fill", async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body: { text?: unknown; fields?: unknown };
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      res.statusCode = 400;
      return res.end();
    }
    if (new URL(req.url ?? "", "http://x").searchParams.has("fail")) {
      await sleep(900);
      res.statusCode = 503;
      return res.end("El lector no está disponible");
    }
    const text = typeof body.text === "string" ? body.text : "";
    const fields = (Array.isArray(body.fields) ? body.fields : []) as PasteField[];
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-store");
    let closed = false;
    req.on("close", () => (closed = true));
    const send = (o: object) => !closed && res.write(`${JSON.stringify(o)}\n`);
    await sleep(500);
    for (const f of matchFields(fields, text)) {
      if (closed) return;
      // El servidor «conoce» a los terceros: lo que sale de la firma o del remitente lo confirma.
      send({ type: "field", ...f, confidence: Math.min(0.99, f.confidence + (f.confidence >= 0.8 ? 0.02 : 0)) });
      await sleep(160 + Math.random() * 180);
    }
    send({ type: "note", message: /nit/i.test(text) ? "El proveedor no existe todavía en el maestro de terceros: se creará al guardar." : "Sin NIT en el texto: habrá que pedirlo antes de crear el tercero." });
    await sleep(200);
    send({ type: "done" });
    res.end();
  });
}
