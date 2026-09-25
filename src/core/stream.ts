/**
 * Lectura de respuestas en streaming, compartida por los componentes que pintan avance del
 * backend (`<nx-button stream>`, `<nx-ai-answer>`). Una línea = un evento: NDJSON o `data:` de SSE.
 */

/** Parte un buffer en líneas completas; devuelve el resto (una línea aún incompleta). */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split(/\r?\n/);
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

/** Tope por defecto de una línea (1 MB de texto): un backend que nunca manda `\n` no llena la memoria. */
export const MAX_LINE = 1 << 20;

export class StreamLimitError extends Error {
  constructor(limit: number) {
    super(`[nx-ui] línea de más de ${limit} caracteres en el stream`);
    this.name = "StreamLimitError";
  }
}

export interface ReadLinesOptions {
  /** Largo máximo de una línea; si se supera, se cancela la lectura y se lanza `StreamLimitError`. */
  maxLine?: number;
}

/**
 * Lee el cuerpo línea por línea, aunque las líneas lleguen partidas entre fragmentos. Si `onLine`
 * devuelve `false`, deja de leer y cancela el cuerpo (un `done` con la conexión todavía abierta).
 * Si `onLine` lanza, la lectura también se cancela antes de propagar el error.
 */
export async function readLines(res: Response, onLine: (line: string) => boolean | void, opts: ReadLinesOptions = {}): Promise<void> {
  const max = opts.maxLine ?? MAX_LINE;
  const sse = /text\/event-stream/i.test(res.headers?.get("content-type") ?? "");
  let stopped = false;
  // SSE: un evento puede traer varias líneas `data:` (se juntan con `\n` hasta la línea vacía).
  let data: string[] | null = null;
  const flush = (): void => {
    if (!data) return;
    const joined = data.join("\n");
    data = null;
    if (onLine(`data: ${joined}`) === false) stopped = true;
  };
  const emit = (raw: string): void => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (sse) {
      const m = /^data:\s?(.*)$/.exec(line);
      if (m) {
        // Un servidor que no separa los eventos con línea vacía: cada `data:` completo es un evento.
        if (data && isJson(data.join("\n"))) flush();
        if (stopped) return;
        (data ??= []).push(m[1]);
        return;
      }
      flush();
      if (stopped || !line) return;
    }
    if (onLine(line) === false) stopped = true;
  };
  if (!res.body) {
    for (const line of (await res.text()).split("\n")) {
      emit(line);
      if (stopped) return;
    }
    if (!stopped) flush();
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  // Los trozos de la línea en curso, sin concatenar en cada fragmento (una línea de 20 MB en
  // trozos de 16 KB era cuadrática).
  let parts: string[] = [];
  let size = 0;
  let finished = false;
  const feed = (chunk: string): void => {
    let from = 0;
    for (let nl = chunk.indexOf("\n"); nl !== -1 && !stopped; nl = chunk.indexOf("\n", from)) {
      const piece = chunk.slice(from, nl);
      if (size + piece.length > max) throw new StreamLimitError(max);
      parts.push(piece);
      const line = parts.join("");
      parts = [];
      size = 0;
      from = nl + 1;
      emit(line);
    }
    if (stopped) return;
    const tail = chunk.slice(from);
    if (tail) {
      size += tail.length;
      if (size > max) throw new StreamLimitError(max);
      parts.push(tail);
    }
  };
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
      if (stopped) return;
    }
    feed(decoder.decode());
    if (!stopped && parts.length) emit(parts.join(""));
    if (!stopped) flush();
    finished = true;
  } finally {
    // Se paró antes del final (o hubo un error): se suelta la conexión.
    if (!finished) reader.cancel().catch(() => {});
  }
}

function isJson(s: string): boolean {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * La carga de una línea: se quita el `data:` de SSE y se ignoran `event:`, `id:`, `retry:`, los
 * comentarios (`:`) y las vacías. `[DONE]` (convención de varias APIs de modelos) se devuelve tal
 * cual. `null` si no hay nada.
 */
export function lineData(raw: string): string | null {
  const line = raw.trim();
  if (!line || line.startsWith(":") || /^(event|id|retry):/.test(line)) return null;
  const data = line.startsWith("data:") ? line.slice(5).trim() : line;
  return data || null;
}
