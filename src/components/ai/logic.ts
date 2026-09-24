/** Lógica pura del componente de IA: validar eventos y el Markdown mínimo. Sin DOM. */
import type { AiEvent, AiTone } from "./types";

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const TONES = new Set<AiTone>(["neutral", "success", "warning", "danger"]);

/**
 * Un evento del protocolo validado, o `null`. Lo que no cumple la forma se descarta sin romper el
 * stream: un backend nuevo puede mandar tipos que esta versión no conoce.
 */
export function parseAiEvent(data: string | null): AiEvent | null {
  if (!data) return null;
  if (data === "[DONE]") return { type: "done" };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(data);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  switch (o.type) {
    case "text":
      return typeof o.delta === "string" && o.delta ? { type: "text", delta: o.delta } : null;
    case "step": {
      const id = str(o.id);
      const status = o.status === "done" || o.status === "error" ? o.status : "run";
      return id ? { type: "step", id, label: str(o.label), status, detail: str(o.detail) } : null;
    }
    case "source": {
      const id = str(o.id) ?? (typeof o.id === "number" ? String(o.id) : undefined);
      const title = str(o.title);
      return id && title ? { type: "source", id, title, detail: str(o.detail), href: str(o.href) } : null;
    }
    case "action": {
      const label = str(o.label);
      return label ? { type: "action", label, href: str(o.href), id: str(o.id), data: o.data, icon: str(o.icon) } : null;
    }
    case "note": {
      const label = str(o.label);
      return label ? { type: "note", label, tone: TONES.has(o.tone as AiTone) ? (o.tone as AiTone) : "neutral" } : null;
    }
    case "error":
      return { type: "error", message: str(o.message) ?? "" };
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

export type Inline = { t: "text" | "b" | "code" | "cite"; v: string };
export type Block = { kind: "p"; inl: Inline[] } | { kind: "ul"; items: Inline[][] };

const INLINE = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[\^[\w-]+\])/;

/** **negrita**, `código` y citas `[^id]`. Lo demás es texto (incluido un `**` sin cerrar a
 *  mitad del streaming: se ve un instante y se corrige solo cuando llega el cierre). */
export function parseInline(s: string): Inline[] {
  return s
    .split(INLINE)
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) return { t: "b", v: part.slice(2, -2) };
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) return { t: "code", v: part.slice(1, -1) };
      if (part.startsWith("[^") && part.endsWith("]")) return { t: "cite", v: part.slice(2, -1) };
      return { t: "text", v: part };
    });
}

/** Párrafos (separados por una línea en blanco) y listas («- » o «* » al inicio de línea). */
export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", inl: parseInline(para.join(" ")) });
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.kind === "ul") last.items.push(parseInline(item[1]));
      else blocks.push({ kind: "ul", items: [parseInline(item[1])] });
    } else if (!line) flush();
    else para.push(line);
  }
  flush();
  return blocks;
}

/** El texto sin marcas, para `nx-ai-done` y el portapapeles. */
export function plainText(text: string): string {
  return text.replace(/\[\^[\w-]+\]/g, "").replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/`([^`\n]+)`/g, "$1");
}
