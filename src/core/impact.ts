/**
 * El protocolo de impacto: lo que pasa si se hace una acción, transmitido por el backend (NDJSON o
 * SSE). Lo leen `nxConfirm()` y `<nx-inbox>`.
 *
 *   {"type":"impact","icon":"truck","label":"2 recepciones","detail":"se revierten","tone":"warning"}
 *   {"type":"block","message":"Ya tiene un pago"} · {"type":"note","message":"…"} · {"type":"done"}
 */
import type { ImpactEvent, ImpactTone } from "../components/dialog/types";

const TONES = new Set<ImpactTone>(["neutral", "success", "warning", "danger"]);

/** Una línea del stream de impacto, validada (lo que no se entiende se ignora). */
export function parseImpactEvent(raw: string | null): ImpactEvent | null {
  if (!raw || raw === "[DONE]") return raw === "[DONE]" ? { type: "done" } : null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
  switch (o.type) {
    case "impact": {
      const label = str(o.label);
      if (!label) return null;
      return { type: "impact", label, detail: str(o.detail), icon: str(o.icon), tone: TONES.has(o.tone as ImpactTone) ? (o.tone as ImpactTone) : undefined };
    }
    case "block":
    case "note":
    case "error": {
      const message = str(o.message);
      return message ? { type: o.type, message } : null;
    }
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}
