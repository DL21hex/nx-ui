/**
 * `<nx-voice>`: el español hablado a texto escrito, al dictar en un campo (chunk aparte: solo baja
 * cuando `for` apunta a un `<input>` o `<textarea>`). Puntuación dictada, mayúscula al inicio de
 * frase, «borrar eso» y la inserción en el cursor. Todo puro.
 */
import { foldText } from "../../core/text";
import type { DictationEdit } from "./types";

// ---------------------------------------------------------------- puntuación dictada y órdenes

/** Un pedazo de lo dictado: texto, un signo (`"."`, `",\n"`, `"¿"`…) o una orden. */
export type DictationToken = { t: "text"; v: string } | { t: "mark"; v: string } | { t: "order"; v: "that" | "word" };

const MARKS: Record<string, string> = {
  "punto y aparte": ".\n",
  "punto y seguido": ".",
  "punto y coma": ";",
  "punto final": ".",
  "dos puntos": ":",
  "puntos suspensivos": "…",
  "nuevo parrafo": "\n\n",
  "nueva linea": "\n",
  "nuevo renglon": "\n",
  "salto de linea": "\n",
  coma: ",",
  punto: ".",
};
// Sobre el texto sin tildes ni mayúsculas (`foldText` conserva las posiciones). Lo largo va primero:
// «punto y coma» antes que «punto». Sin lookbehind (Safari < 16.4 no lo entiende).
const SPOKEN =
  /(^|[^\p{L}\p{N}])(punto y aparte|punto y seguido|punto y coma|punto final|dos puntos|puntos suspensivos|nuevo parrafo|nueva linea|nuevo renglon|salto de linea|(?:signo de|abre|abrir|cierra|cerrar)(?: signo de)? (?:interrogacion|exclamacion|admiracion)|(?:abre|abrir|cierra|cerrar) parentesis|borrar? (?:eso|la ultima palabra)|coma|punto)(?=$|[^\p{L}\p{N}])/gu;
/** «el punto», «un punto de venta», «la coma decimal», «estado de coma»: sustantivos, no signos. */
const NOUN_BEFORE = /(?:^|\s)(?:el|la|un|una|al|a|de|del|en|este|esta|ese|esa|cada|mi|su|tu|buen|estado)\s*$/;
const NOUN_AFTER = /^\s*(?:de|del|decimal)(?![\p{L}\p{N}])/u;

/**
 * Lo dictado en pedazos: el texto, los signos dichos con palabras («coma», «punto y aparte», «nueva
 * línea», «signo de interrogación», «abre paréntesis»…) y, con `orders`, «borrar eso» y «borra la
 * última palabra». «Punto» y «coma» después de un artículo o antes de «de» son palabras («el punto
 * de venta»).
 */
export function parseDictation(spoken: string, orders = true): DictationToken[] {
  const text = String(spoken ?? "").normalize("NFC");
  const low = foldText(text);
  const out: DictationToken[] = [];
  let from = 0;
  SPOKEN.lastIndex = 0;
  for (let m = SPOKEN.exec(low); m; m = SPOKEN.exec(low)) {
    const phrase = m[2];
    const at = m.index + m[1].length;
    const end = at + phrase.length;
    const order = phrase.startsWith("borra");
    if ((order && !orders) || ((phrase === "punto" || phrase === "coma") && (NOUN_BEFORE.test(low.slice(0, at)) || NOUN_AFTER.test(low.slice(end))))) continue;
    const before = text.slice(from, at).trim();
    if (before) out.push({ t: "text", v: before });
    const open = /^abr/.test(phrase);
    out.push(
      order
        ? { t: "order", v: phrase.endsWith("eso") ? "that" : "word" }
        : { t: "mark", v: MARKS[phrase] ?? (phrase.endsWith("parentesis") ? (open ? "(" : ")") : phrase.endsWith("interrogacion") ? (open ? "¿" : "?") : open ? "¡" : "!") },
    );
    from = end;
  }
  const rest = text.slice(from).trim();
  if (rest) out.push({ t: "text", v: rest });
  return out;
}

const upperFirst = (w: string) => w.replace(/^\p{Ll}/u, (c) => c.toUpperCase());
/** Donde termina una frase (lo que sigue va en mayúscula y una pregunta empieza después). */
const END = /[.?!…\n]/;
/** Lo que no cuenta al mirar hacia atrás para la mayúscula: espacios (no saltos de línea), «¿», «¡», «(». */
const SOFT = /[^\S\n]|[¿¡(]/;
/** Tras esto no va espacio. */
const OPEN = /[\s(¿¡]/;

/**
 * Dicta `spoken` en un campo cuyo valor es `value`, con la selección `[start, end)` (el cursor si son
 * iguales; lo seleccionado se reemplaza). Pone los signos dictados pegados a la palabra anterior, los
 * espacios, la mayúscula al inicio de frase y el «¿»/«¡» de apertura cuando se dicta el de cierre y la
 * frase no lo tiene. «Borrar eso» quita lo dictado antes en este mismo dictado o, si no hubo nada, el
 * dictado anterior (`last`) si el cursor sigue justo después de él. «Borra la última palabra» quita
 * la palabra antes del cursor.
 */
export function applyDictation(value: string, start: number, end: number, spoken: string, opts: { orders?: boolean; last?: [number, number] | null } = {}): DictationEdit {
  value = String(value ?? "");
  const a = Math.max(0, Math.min(value.length, Number.isFinite(start) ? start : value.length));
  const b = Math.max(a, Math.min(value.length, Number.isFinite(end) ? end : a));
  // Lo de antes del cursor y lo dictado en pedazos: se mira hacia atrás sin volver a recorrer (ni a
  // copiar) todo lo escrito, así un dictado largo sigue siendo lineal.
  let pre = value.slice(0, a);
  let out: string[] = [];
  const after = value.slice(b);
  // Desde dónde cambió lo de antes (un «¿» o una orden lo tocan) y dónde empieza el pedazo actual.
  let ins = a;
  let seg = 0;
  let touched = a !== b;
  const last = opts.last;
  /** El último carácter que no sea de `skip`, en lo dictado y luego en lo de antes. */
  const back = (skip?: RegExp): string => {
    for (let i = out.length - 1; i >= 0; i--) for (let j = out[i].length - 1; j >= 0; j--) if (!skip?.test(out[i][j])) return out[i][j];
    for (let j = pre.length - 1; j >= 0; j--) if (!skip?.test(pre[j])) return pre[j];
    return "";
  };
  const space = () => {
    const c = back();
    if (c && !OPEN.test(c)) out.push(" ");
  };
  const trim = () => {
    while (out[out.length - 1] === " ") out.pop();
    if (!out.length && /[ \t]$/.test(pre)) ins = Math.min(ins, (pre = pre.replace(/[ \t]+$/, "")).length);
    seg = Math.min(seg, out.length);
  };
  const flat = () => {
    pre += out.join("");
    out = [];
    seg = 0;
  };
  for (const tok of parseDictation(spoken, opts.orders !== false)) {
    if (tok.t === "order") {
      if (tok.v === "word") {
        flat();
        pre = pre.replace(/\s*\S+\s*$/, (m) => (/^\s*\n/.test(m) ? "\n" : ""));
        ins = Math.min(ins, pre.length);
      } else if (out.length > seg) out.length = seg;
      else if (!touched && !out.length && last && last[1] === pre.length && last[0] >= 0 && last[0] <= pre.length) ins = Math.min(ins, (pre = pre.slice(0, last[0])).length);
      seg = out.length;
      touched = true;
      continue;
    }
    touched = true;
    if (tok.t === "text") {
      for (const w of tok.v.split(/\s+/)) {
        if (!w) continue;
        const c = back(SOFT);
        space();
        out.push(!c || END.test(c) ? upperFirst(w) : w);
      }
      continue;
    }
    const m = tok.v;
    if (m === "¿" || m === "¡" || m === "(") {
      space();
      out.push(m);
      continue;
    }
    trim();
    if (m === "?" || m === "!") openQuestion(m === "?" ? "¿" : "¡");
    out.push(m);
  }
  /** El «¿»/«¡» al comienzo de la frase, si no lo tiene ya (en español van los dos). */
  function openQuestion(open: string): void {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i].includes(open)) return;
      if (END.test(out[i])) {
        let k = i + 1;
        while (out[k] === " ") k++;
        if (k < out.length) out.splice(k, 0, open);
        return;
      }
    }
    const from = Math.max(pre.lastIndexOf("."), pre.lastIndexOf("?"), pre.lastIndexOf("!"), pre.lastIndexOf("…"), pre.lastIndexOf("\n")) + 1;
    if (pre.includes(open, from)) return;
    const lead = from + (/^\s*/.exec(pre.slice(from))?.[0].length ?? 0);
    if (lead < pre.length) {
      pre = pre.slice(0, lead) + open + pre.slice(lead);
      ins = Math.min(ins, lead);
    } else {
      let k = 0;
      while (out[k] === " ") k++;
      if (k < out.length) out.splice(k, 0, open);
    }
  }
  const s = pre + out.join("");
  const caret = s.length;
  // La juntura con lo que sigue: un espacio si quedarían dos palabras pegadas (solo si algo cambió).
  const join = s !== value.slice(0, a) && s && !OPEN.test(s[caret - 1]) && /^[\p{L}\p{N}¿¡(]/u.test(after) ? " " : "";
  return { value: s + join + after, caret, range: caret > ins ? [ins, caret] : null };
}
