/**
 * Lógica pura de `<nx-thread>`: validar lo que llega, reconocer los tokens del texto (menciones,
 * referencias, URLs), agrupar por día, lo no leído, las anclas y el borrador. Sin DOM.
 *
 * El texto de un comentario es SIEMPRE texto: el parser solo reconoce `@[Nombre](id)`,
 * `#[Etiqueta](id)`, `https://…`, saltos de línea y (con `ref-patterns`) códigos como `FV-1873`.
 * Lo demás —`<img onerror>`, `javascript:`, entidades— sale tal cual, como texto.
 */
import { safeHref } from "../../core/dom";
import { atTime } from "../history/logic";
import { cleanUser } from "../presence/logic";
import type { ThreadComment, ThreadPerson, ThreadRef, ThreadToken, ThreadUser } from "./types";

/** Largo máximo de un comentario (lo que pase se corta). */
export const THREAD_MAX_TEXT = 10_000;
/** Largo máximo de un patrón de `ref-patterns` y de la palabra que se le prueba. */
const MAX_PATTERN = 60;
const MAX_WORD = 32;

const str = (v: unknown, max = 128): string | undefined => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const idOf = (v: unknown): string | undefined => (typeof v === "number" && Number.isFinite(v) ? String(v) : str(v));
const time = (at: string | undefined): number => (at ? atTime(at) : NaN);

// ---------------------------------------------------------------- validar

/** Un registro referenciable válido (`id` y `label`), o `null`. */
export function cleanRef(v: unknown): ThreadRef | null {
  const o = v as Record<string, unknown> | null;
  const id = idOf(o?.id);
  const label = str(o?.label, 80);
  if (!id || !label) return null;
  const r: ThreadRef = { id, label };
  const detail = str(o!.detail, 200);
  const href = safeHref(o!.href);
  if (detail) r.detail = detail;
  if (href) r.href = href;
  return r;
}

/** Una persona de `people-source` (la de presence, más su `detail`), o `null`. */
export function cleanPerson(v: unknown): ThreadPerson | null {
  const u: ThreadPerson | null = cleanUser(v);
  const detail = u && str((v as Record<string, unknown>).detail, 120);
  if (detail) u!.detail = detail;
  return u;
}

/** Un comentario válido (necesita `id`, `author` con id y nombre, `text` y una fecha que se entienda), o `null`. */
export function cleanComment(v: unknown): ThreadComment | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const id = idOf(o.id);
  const author = cleanUser(o.author);
  const at = str(o.at, 40);
  if (!id || !author || typeof o.text !== "string" || Number.isNaN(time(at))) return null;
  const c: ThreadComment = { id, author, text: o.text.slice(0, THREAD_MAX_TEXT), at: at! };
  const edited = str(o.editedAt, 40);
  if (!Number.isNaN(time(edited))) c.editedAt = edited;
  const anchor = idOf(o.anchor);
  const reply = idOf(o.replyTo);
  const client = idOf(o.clientId);
  if (anchor) c.anchor = anchor;
  if (reply && reply !== id) c.replyTo = reply;
  if (client) c.clientId = client;
  if (o.resolved === true) {
    c.resolved = true;
    const by = typeof o.resolvedBy === "string" ? str(o.resolvedBy, 80) : cleanUser(o.resolvedBy)?.name;
    if (by) c.resolvedBy = by;
  }
  if (Array.isArray(o.refs)) {
    const refs = o.refs.slice(0, 50).map(cleanRef).filter((r): r is ThreadRef => !!r);
    if (refs.length) c.refs = refs;
  }
  return c;
}

/** Del más viejo al más nuevo (estable: dos del mismo instante conservan su orden). */
export function sortComments(cs: readonly ThreadComment[]): ThreadComment[] {
  return cs
    .map((c, i) => [atTime(c.at), i, c] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map((x) => x[2]);
}

/** Los comentarios válidos de una respuesta (`[...]` o `{comments: [...]}`), sin `id` repetidos, en orden. */
export function cleanComments(v: unknown): ThreadComment[] {
  const list = Array.isArray(v) ? v : Array.isArray((v as { comments?: unknown })?.comments) ? (v as { comments: unknown[] }).comments : [];
  const seen = new Set<string>();
  const out: ThreadComment[] = [];
  for (const x of list) {
    const c = cleanComment(x);
    if (c && !seen.has(c.id)) seen.add(c.id), out.push(c);
  }
  return sortComments(out);
}

/**
 * Junta dos listas: lo de `b` gana. Un comentario que llega con el `clientId` de uno local (el que
 * se estaba enviando) lo reemplaza: el eco del stream y la respuesta del POST no duplican.
 */
export function mergeComments(a: readonly ThreadComment[], b: readonly ThreadComment[]): ThreadComment[] {
  const drop = new Set<string>();
  for (const c of b) {
    drop.add(c.id);
    if (c.clientId) drop.add(c.clientId);
  }
  return sortComments([...a.filter((c) => !drop.has(c.id) && !(c.clientId && drop.has(c.clientId))), ...b]);
}

// ---------------------------------------------------------------- conversaciones y anclas

/** El primer comentario de la conversación (sigue `replyTo`, con tope: un ciclo no cuelga). */
export function threadRoot(byId: ReadonlyMap<string, ThreadComment>, c: ThreadComment): ThreadComment {
  let r = c;
  for (let i = 0; i < 50 && r.replyTo; i++) {
    const p = byId.get(r.replyTo);
    if (!p || p === c) break;
    r = p;
  }
  return r;
}

/** Cuántos comentarios abiertos (conversación sin resolver) hay anclados a cada campo. */
export function anchorCounts(cs: readonly ThreadComment[]): Map<string, number> {
  const byId = new Map(cs.map((c) => [c.id, c]));
  const out = new Map<string, number>();
  for (const c of cs) {
    const r = threadRoot(byId, c);
    if (r.anchor && !r.resolved) out.set(r.anchor, (out.get(r.anchor) ?? 0) + 1);
  }
  return out;
}

// ---------------------------------------------------------------- días, horas y no leídos

const dayStart = (t: number): number => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export interface ThreadDay {
  /** Medianoche local del día (ms). */
  day: number;
  items: ThreadComment[];
}

/** Los comentarios (ya en orden) agrupados por día local, del más viejo al más nuevo. */
export function groupThreadByDay(cs: readonly ThreadComment[]): ThreadDay[] {
  const out: ThreadDay[] = [];
  for (const c of cs) {
    const day = dayStart(atTime(c.at));
    if (out[out.length - 1]?.day !== day) out.push({ day, items: [] });
    out[out.length - 1].items.push(c);
  }
  return out;
}

const dtfs = new Map<string, Intl.DateTimeFormat>();

/** El encabezado de un día: «Hoy», «Ayer», «lun 21 sept» (con el año si no es este). */
export function threadDayLabel(day: number | Date, now: Date, locale: string, today: string, yesterday: string): string {
  const t = dayStart(+day);
  const n = Math.round((dayStart(+now) - t) / 864e5);
  if (n === 0) return today;
  if (n === 1) return yesterday;
  const year = new Date(t).getFullYear() !== now.getFullYear();
  const k = `${locale}|${year}`;
  let f = dtfs.get(k);
  if (!f) dtfs.set(k, (f = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: year ? "numeric" : undefined })));
  return f
    .formatToParts(t)
    .map((p) => (p.type === "literal" && /^[\s,]*(de)?[\s,]*$/.test(p.value) ? " " : p.value))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * El primer comentario sin leer desde la última visita (`seenAt`, ms): uno más nuevo, de otra
 * persona. Sin visita anterior no hay marca (todo sería «nuevo»). `-1` si no hay.
 */
export function firstUnread(cs: readonly ThreadComment[], seenAt: number | null, me?: string | null): number {
  if (seenAt === null || !Number.isFinite(seenAt)) return -1;
  return cs.findIndex((c) => !c.state && c.author.id !== me && atTime(c.at) > seenAt);
}

/** El instante del comentario más nuevo (ms), o `null`. */
export function latestAt(cs: readonly ThreadComment[]): number | null {
  let max: number | null = null;
  for (const c of cs) {
    const t = atTime(c.at);
    if (!c.state && Number.isFinite(t) && (max === null || t > max)) max = t;
  }
  return max;
}

// ---------------------------------------------------------------- patrones de referencias

/** Un patrón que podría tardar sin fin: retroreferencias, lookaround, grupos repetidos, cuantificadores seguidos. */
const UNSAFE = /\\[1-9k]|\(\?[=!<]|\)[*+{]|[*+}][*+{]/;

/**
 * `ref-patterns` → expresiones seguras (JSON: `["OC-\\d{3,6}", "FV-\\d{3,6}"]`). Se descartan las de
 * más de 60 caracteres, las inválidas y las que pueden explotar (grupos con `+`/`*`, `(a+)+`,
 * retroreferencias, lookaround). Se prueban contra una palabra entera de hasta 32 caracteres. Máx. 8.
 */
export function refPatterns(v: unknown): RegExp[] {
  let a = v;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      return [];
    }
  }
  const out: RegExp[] = [];
  if (!Array.isArray(a)) return out;
  for (const p of a.slice(0, 8)) {
    if (typeof p !== "string" || !p || p.length > MAX_PATTERN || UNSAFE.test(p)) continue;
    try {
      out.push(new RegExp(`^(?:${p})$`, "u"));
    } catch {
      /* inválida */
    }
  }
  return out;
}

const isCode = (w: string, patterns: readonly RegExp[]) => w.length <= MAX_WORD && patterns.some((p) => p.test(w));

// ---------------------------------------------------------------- tokens

/** Mención, referencia, URL o salto de línea. Todo acotado: el recorrido es lineal. */
const TOKEN = /([@#])\[([^[\]\n]{1,80})\]\(([^()\s]{1,128})\)|https?:\/\/[^\s<>"'`]{1,2000}|\n/giu;
/** Lo que se quita del final de una URL: la puntuación de la frase («…ver https://x.co/a.»). */
const TRAIL = /[.,;:!?'"»”’\]]+$/;
const WORD = /[\p{L}\p{N}][\p{L}\p{N}_./-]*/gu;
const CTRL = /[\u0000-\u0008\u000b-\u001f\u007f]/g; // eslint-disable-line no-control-regex

/** Parte el texto de un comentario en tokens. Nada se interpreta como HTML. */
export function parseThreadText(text: string, patterns: readonly RegExp[] = []): ThreadToken[] {
  const s = String(text ?? "")
    .slice(0, THREAD_MAX_TEXT)
    .replace(/\r\n?/g, "\n")
    .replace(CTRL, "");
  const out: ThreadToken[] = [];
  const plain = (t: string) => {
    if (!t) return;
    if (patterns.length) {
      let last = 0;
      for (const m of t.matchAll(WORD)) {
        const w = m[0].replace(/[./-]+$/, "");
        if (!isCode(w, patterns)) continue;
        push({ type: "text", text: t.slice(last, m.index) });
        out.push({ type: "ref", id: w, label: w });
        last = m.index! + w.length;
      }
      t = t.slice(last);
    }
    push({ type: "text", text: t });
  };
  const push = (tk: ThreadToken) => {
    if (tk.type !== "text") return void out.push(tk);
    if (!tk.text) return;
    const prev = out[out.length - 1];
    if (prev?.type === "text") prev.text += tk.text;
    else out.push(tk);
  };
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    let raw = m[0];
    let end = m.index! + raw.length;
    let tk: ThreadToken | null = null;
    if (raw === "\n") tk = { type: "br" };
    else if (m[1]) {
      const label = m[2].trim();
      if (label) tk = m[1] === "@" ? { type: "mention", id: m[3], name: label } : { type: "ref", id: m[3], label };
    } else {
      // La puntuación del final no es de la URL; un «)» solo si la URL no abrió uno.
      let cut = raw.replace(TRAIL, "");
      if (cut.endsWith(")") && !cut.includes("(")) cut = cut.replace(/\)+$/, "").replace(TRAIL, "");
      const href = /^https?:\/\/[^/?#]/i.test(cut) ? safeHref(cut) : undefined;
      if (href) {
        end = m.index! + cut.length;
        raw = cut;
        tk = { type: "url", href, text: cut.length > 70 ? `${cut.slice(0, 60)}…` : cut };
      }
    }
    if (!tk) continue;
    plain(s.slice(last, m.index));
    push(tk);
    last = end;
  }
  plain(s.slice(last));
  return out;
}

/** El texto sin tokens (para citar una respuesta): «@Laura Gómez revisa FV-1873». */
export function threadPlainText(tokens: readonly ThreadToken[]): string {
  return tokens.map((t) => (t.type === "br" ? " " : t.type === "mention" ? `@${t.name}` : t.type === "ref" ? t.label : t.text)).join("");
}

/** Las personas mencionadas en un texto, sin repetir. */
export function threadMentions(text: string): ThreadUser[] {
  const out = new Map<string, ThreadUser>();
  for (const t of parseThreadText(text)) if (t.type === "mention" && !out.has(t.id)) out.set(t.id, { id: t.id, name: t.name });
  return [...out.values()];
}

// ---------------------------------------------------------------- borrador

/** Lo que se ve en la caja («@Laura Gómez») y el token que se guarda (`@[Laura Gómez](u12)`). */
export interface ThreadPick {
  text: string;
  token: string;
}

const clean = (s: string, max: number) => s.replace(/[[\]()\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** La mención de una persona o la referencia a un registro, lista para el borrador. */
export function threadPick(kind: "mention" | "ref", item: { id: string; name?: string; label?: string }): ThreadPick | null {
  const label = clean(item.name ?? item.label ?? "", 80);
  const id = String(item.id ?? "").replace(/[()\s]/g, "").slice(0, 128);
  if (!label || !id) return null;
  const mark = kind === "mention" ? "@" : "#";
  return { text: mark + label, token: `${mark}[${label}](${id})` };
}

const WORDCH = /[\p{L}\p{N}_]/u;

/**
 * El borrador → el texto que se guarda: cada `@Laura Gómez` elegido de la lista pasa a su token
 * (el más largo primero; solo si es una palabra entera). Lo escrito a mano queda como texto.
 */
export function encodeDraft(text: string, picks: readonly ThreadPick[]): string {
  const ps = picks.filter((p) => p.text).sort((a, b) => b.text.length - a.text.length);
  if (!ps.length) return text;
  let out = "";
  for (let i = 0; i < text.length; ) {
    const p = (i === 0 || !WORDCH.test(text[i - 1])) && ps.find((x) => text.startsWith(x.text, i) && !WORDCH.test(text[i + x.text.length] ?? ""));
    if (p) (out += p.token), (i += p.text.length);
    else out += text[i++];
  }
  return out;
}

/** El texto guardado → el borrador (para editar): los tokens vuelven a verse como `@Nombre`. */
export function decodeDraft(text: string): { text: string; picks: ThreadPick[] } {
  const picks: ThreadPick[] = [];
  const out = parseThreadText(text).map((t) => {
    if (t.type === "br") return "\n";
    if (t.type === "text") return t.text;
    if (t.type === "url") return t.href;
    const p = threadPick(t.type, { id: t.id, name: t.type === "mention" ? t.name : t.label });
    if (p && !picks.some((x) => x.token === p.token)) picks.push(p);
    return p?.text ?? "";
  });
  return { text: out.join(""), picks };
}

/** Un borrador guardado (sessionStorage), validado: lo que no se entienda se descarta. */
export function cleanDraft(v: unknown): { text: string; picks: ThreadPick[]; anchor?: string; replyTo?: string } | null {
  let o = v as Record<string, unknown> | null;
  if (typeof v === "string") {
    try {
      o = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== "object" || typeof o.text !== "string") return null;
  const tok = /^[@#]\[[^[\]\n]{1,80}\]\([^()\s]{1,128}\)$/;
  const picks = (Array.isArray(o.picks) ? o.picks : []).filter((p): p is ThreadPick => typeof p?.text === "string" && typeof p.token === "string" && tok.test(p.token)).slice(0, 50);
  const d: ReturnType<typeof cleanDraft> = { text: o.text.slice(0, THREAD_MAX_TEXT), picks };
  const anchor = idOf(o.anchor);
  const reply = idOf(o.replyTo);
  if (anchor) d!.anchor = anchor;
  if (reply) d!.replyTo = reply;
  return d;
}

/** ¿Se está escribiendo una mención o una referencia justo antes del cursor? */
export interface ThreadTrigger {
  kind: "mention" | "ref";
  /** Dónde empieza lo que se reemplaza (la `@`, la `#` o el código). */
  start: number;
  query: string;
}

const QCH = /[\p{L}\p{N}_.-]/u;

/**
 * `@lau` → buscar personas; `#fv` o un código conocido (`FV-1873`, por `ref-patterns`) → buscar
 * registros. Solo al principio de una palabra (un correo `ana@x.co` no dispara nada).
 */
export function findTrigger(text: string, caret: number, patterns: readonly RegExp[] = []): ThreadTrigger | null {
  let i = Math.min(Math.max(0, caret), text.length);
  const end = i;
  while (i > 0 && end - i < MAX_WORD && QCH.test(text[i - 1])) i--;
  const lead = (k: number) => k <= 0 || /[\s(]/.test(text[k - 1]);
  const ch = text[i - 1];
  if ((ch === "@" || ch === "#") && lead(i - 1)) return { kind: ch === "@" ? "mention" : "ref", start: i - 1, query: text.slice(i, end) };
  const word = text.slice(i, end);
  return word && lead(i) && isCode(word, patterns) ? { kind: "ref", start: i, query: word } : null;
}

/** «Laura», «Laura y Héctor», «Laura, Héctor y 2 más». */
export function threadNames(names: readonly string[], and: string, more: string): string {
  if (names.length <= 2) return names.join(and);
  if (names.length === 3) return `${names[0]}, ${names[1]}${and}${names[2]}`;
  return `${names[0]}, ${names[1]}${and}${more.replace("{n}", String(names.length - 2))}`;
}
