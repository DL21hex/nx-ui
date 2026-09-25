/**
 * Solo en la galería: el backend de `<nx-history>`. `/demo/history/oc-2291` devuelve los 15 eventos
 * más nuevos de la OC-2291 con el registro de hoy; `?before=<id>`, los 15 anteriores a ese evento.
 * Con una pausa real, para que se vea la carga al llegar al final.
 */
import type { ViteDevServer } from "vite";
import { ocHistoryPage } from "./demo-history";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function configureHistory(server: ViteDevServer): void {
  server.middlewares.use("/demo/history/oc-2291", async (req, res) => {
    let closed = false;
    req.on("close", () => (closed = true));
    const before = new URL(req.url ?? "", "http://x").searchParams.get("before");
    await sleep(before ? 700 : 450);
    if (closed) return;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(ocHistoryPage(before)));
  });
}
