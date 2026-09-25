/** Lógica pura de `<nx-inbox>`: validar ítems, moverse, qué queda activo y los mensajes. Sin DOM. */
import type { ImpactEvent, ImpactTone } from "../dialog/types";
import type { InboxDecision, InboxImpact, InboxItem, InboxLabels } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const TONES = new Set<ImpactTone>(["neutral", "success", "warning", "danger"]);

/** Los ítems válidos (con `id` y `title`), copiados sin lo que no es suyo. Un `id` repetido se descarta. */
export function cleanInboxItems(v: unknown): InboxItem[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: InboxItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = str(o.id) ?? (typeof o.id === "number" ? String(o.id) : undefined);
    const title = str(o.title);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title,
      subtitle: str(o.subtitle),
      requester: str(o.requester),
      amount: typeof o.amount === "number" && Number.isFinite(o.amount) ? o.amount : undefined,
      currency: str(o.currency),
      date: str(o.date),
      tags: Array.isArray(o.tags)
        ? o.tags
            .map((t) => (typeof t === "string" ? t : t && typeof t === "object" && str((t as { label?: unknown }).label) ? { label: String((t as { label: string }).label), tone: TONES.has((t as { tone?: ImpactTone }).tone!) ? (t as { tone: ImpactTone }).tone : undefined } : null))
            .filter((t): t is NonNullable<typeof t> => !!t)
        : undefined,
      facts: Array.isArray(o.facts) ? o.facts.filter((f) => f && typeof f === "object" && str(f.label) && (typeof f.value === "string" || typeof f.value === "number")).map((f) => ({ label: String(f.label), value: String(f.value) })) : undefined,
      impact: typeof o.impact === "string" ? o.impact : Array.isArray(o.impact) ? o.impact.filter((i) => i && typeof i === "object" && str(i.label)) : undefined,
      href: str(o.href),
      data: o.data,
    });
  }
  return out;
}

/**
 * Qué ítem queda activo cuando se van `gone`: el siguiente que queda después del último que se
 * fue (como pasar a la siguiente carta), o el anterior si ya no hay más. `null` si no queda nada.
 */
export function nextActive(ids: readonly string[], gone: ReadonlySet<string>, active: string | null): string | null {
  const left = ids.filter((id) => !gone.has(id));
  if (!left.length) return null;
  if (active && !gone.has(active) && left.includes(active)) return active;
  let last = -1;
  ids.forEach((id, i) => {
    if (gone.has(id) || id === active) last = Math.max(last, i);
  });
  for (let i = last + 1; i < ids.length; i++) if (!gone.has(ids[i])) return ids[i];
  for (let i = last - 1; i >= 0; i--) if (!gone.has(ids[i])) return ids[i];
  return left[0];
}

/** Los ids de `from` a `to` (en cualquier orden), para Mayús + clic. */
export function rangeIds(ids: readonly string[], from: string, to: string): string[] {
  const a = ids.indexOf(from);
  const b = ids.indexOf(to);
  if (a < 0 || b < 0) return b >= 0 ? [to] : [];
  return ids.slice(Math.min(a, b), Math.max(a, b) + 1);
}

/** El texto del aviso: «Aprobado: OC-2291» o «5 aprobados», y los que no se aprobaron por bloqueo. */
export function decisionMessage(L: InboxLabels, decision: InboxDecision, items: readonly InboxItem[], skipped = 0, unverified = 0): string {
  const one = decision === "approve" ? L.approvedOne : L.rejectedOne;
  const many = decision === "approve" ? L.approvedMany : L.rejectedMany;
  let out = items.length === 1 ? one.replace("{title}", items[0].title) : many.replace("{n}", String(items.length));
  if (skipped) out += ` ${skipped === 1 ? L.skippedOne : L.skipped.replace("{n}", String(skipped))}`;
  if (unverified) out += ` ${unverified === 1 ? L.unverifiedOne : L.unverified.replace("{n}", String(unverified))}`;
  return out;
}

export const emptyImpact = (): InboxImpact => ({ items: [], notes: [], block: null, error: null, done: false });

/** Aplica un evento del protocolo de impacto (lo muta y lo devuelve). */
export function applyImpact(s: InboxImpact, ev: ImpactEvent): InboxImpact {
  if (ev.type === "impact") s.items.push(ev);
  else if (ev.type === "block") s.block = ev.message;
  else if (ev.type === "note") s.notes.push(ev.message);
  else if (ev.type === "error") s.error = ev.message;
  if (ev.type === "done" || ev.type === "error") s.done = true;
  return s;
}
