/**
 * `<nx-thread>` en vivo: lee `stream` (SSE o NDJSON, una línea = un evento) y reparte lo que llega
 * (`comment`/`update`, `delete`, `typing`). Si la conexión se corta, vuelve con espera creciente
 * (1 s, 2 s, 4 s… hasta 30 s; se reinicia en cuanto llega algo) y, al volver, el hilo se pone al día.
 *
 * También lleva el «escribiendo…»: el de los demás (una línea sobre el redactor, que no se anuncia)
 * y el propio (un `POST {endpoint}/typing` como mucho cada 3 s). Se carga con `import()` solo si hay
 * `stream`: sin él nadie recibiría el aviso.
 */
import { lineData, readLines } from "../../core/stream";
import { cleanUser, firstName } from "../presence/logic";
import { cleanComment, threadNames } from "./logic";
import type { ThreadComment, ThreadLabels, ThreadUser } from "./types";

export interface ThreadLiveHost {
  /** La URL del stream ya validada (con `?record=`), o `null` para no seguir. */
  url(): string | null;
  /** A dónde avisar que se escribe (`{endpoint}/typing`, validada), o `null`. */
  typingUrl(): string | null;
  record(): string | null;
  me(): ThreadUser | null;
  labels(): ThreadLabels;
  /** La línea «Laura está escribiendo…». */
  line(): HTMLElement;
  /** Se volvió a conectar: lo que pasó mientras tanto. */
  caughtUp(): void;
  comment(c: ThreadComment): void;
  remove(id: string): void;
  error(e: unknown): void;
}

export interface ThreadLive {
  /** La persona actual escribió en el redactor. */
  typed(): void;
}

export const THREAD_MAX_BACKOFF = 30_000;
const TYPING_EVERY = 3_000;
const TYPING_SHOW = 6_000;

/** La espera antes del intento `n` (desde 0): 1 s, 2 s, 4 s… con tope. */
export const threadBackoff = (n: number): number => Math.min(THREAD_MAX_BACKOFF, 1000 * 2 ** Math.min(Math.max(0, n), 5));

/** Escucha hasta que `signal` se aborte (el hilo se desconectó, o cambió el registro o el stream). */
export function threadListen(host: ThreadLiveHost, signal: AbortSignal): ThreadLive {
  let timer = 0;
  let typT = 0;
  let typedAt = 0;
  const typers = new Map<string, { name: string; until: number }>();
  const paintTyping = (): void => {
    const now = Date.now();
    let next = Infinity;
    for (const [id, t] of typers) if (t.until <= now) typers.delete(id);
    else next = Math.min(next, t.until);
    const names = [...typers.values()].map((t) => firstName(t.name));
    const L = host.labels();
    const line = host.line();
    line.hidden = !names.length;
    line.textContent = names.length ? (names.length > 1 ? L.typingMany : L.typing).replace("{names}", threadNames(names, L.and, L.more)) : "";
    clearTimeout(typT);
    if (names.length && !signal.aborted) typT = window.setTimeout(paintTyping, next - now + 50);
  };
  signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timer);
      typers.clear();
      paintTyping();
    },
    { once: true },
  );
  const take = (data: string): void => {
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(data);
    } catch {
      return;
    }
    if (!o || typeof o !== "object" || (o.record != null && String(o.record) !== host.record())) return;
    if (o.type === "typing") {
      const u = cleanUser(o.user);
      if (u && u.id !== host.me()?.id) typers.set(u.id, { name: u.name, until: Date.now() + TYPING_SHOW }), paintTyping();
    } else if (o.type === "delete") {
      if (o.id != null) host.remove(String(o.id));
    } else if (o.type === "comment" || o.type === "update") {
      const c = cleanComment(o.comment);
      if (!c) return;
      // Quien comenta ya no está escribiendo.
      if (typers.delete(c.author.id)) paintTyping();
      host.comment(c);
    }
  };
  const run = async (attempt: number): Promise<void> => {
    const url = host.url();
    if (!url || signal.aborted) return;
    let got = false;
    try {
      const res = await fetch(url, { headers: { Accept: "text/event-stream, application/x-ndjson" }, credentials: "same-origin", signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (attempt) host.caughtUp();
      await readLines(res, (line) => {
        const d = lineData(line);
        if (d && d !== "[DONE]") (got = true), take(d);
      });
    } catch (e) {
      if (signal.aborted) return;
      host.error(e);
    }
    if (signal.aborted) return;
    const n = got ? 0 : attempt;
    timer = window.setTimeout(() => void run(n + 1), threadBackoff(n));
  };
  void run(0);
  return {
    typed() {
      const url = host.typingUrl();
      const now = Date.now();
      if (!url || signal.aborted || now - typedAt < TYPING_EVERY) return;
      typedAt = now;
      fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ record: host.record(), user: host.me() }), signal }).catch(() => {});
    },
  };
}
