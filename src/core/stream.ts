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

/** Lee el cuerpo línea por línea, aunque las líneas lleguen partidas entre fragmentos. */
export async function readLines(res: Response, onLine: (line: string) => void): Promise<void> {
  if (!res.body) {
    (await res.text()).split(/\r?\n/).forEach(onLine);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let rest = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const split = splitLines(rest + decoder.decode(value, { stream: true }));
    rest = split.rest;
    split.lines.forEach(onLine);
  }
  rest += decoder.decode();
  if (rest) onLine(rest);
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
