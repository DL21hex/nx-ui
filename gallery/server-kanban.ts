/**
 * Solo en la galería: el impacto de anular una orden del tablero de `<nx-kanban>`, transmitido en
 * NDJSON con pausas reales (el protocolo de `nxConfirm`). Recibe `POST {card, from, to, index, data}`.
 */
import { kanbanImpact } from "./demo-kanban";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function configureKanban(server: import("vite").ViteDevServer): void {
  server.middlewares.use("/demo/kanban/impacto", async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    let body: Parameters<typeof kanbanImpact>[0] = {};
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      res.statusCode = 400;
      return res.end();
    }
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Cache-Control", "no-store");
    let closed = false;
    // Quien pidió cerró el diálogo: no se sigue escribiendo.
    res.on("close", () => (closed = true));
    await sleep(350);
    for (const ev of kanbanImpact(body)) {
      if (closed) return;
      res.write(`${JSON.stringify(ev)}\n`);
      await sleep(240 + Math.random() * 200);
    }
    res.end(`${JSON.stringify({ type: "done" })}\n`);
  });
}
