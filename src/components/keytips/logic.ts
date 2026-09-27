/**
 * `<nx-keytips>`: qué letra le toca a cada acción. Todo puro (sin DOM), para probarlo a fondo.
 *
 * Las reglas, en orden de fuerza:
 * 1. **El autor manda** (`data-keytip="G"`).
 * 2. **Lo que ya tenía** el elemento en la apertura anterior, si sigue libre: la gente memoriza la letra.
 * 3. **Su nombre**: la inicial de la primera palabra significativa (G de «Guardar»), las iniciales
 *    de las demás palabras, el resto de sus letras.
 * 4. Cualquier letra o dígito libre.
 *
 * Con más de `max` acciones (30) los códigos son de dos letras, como en Vimium. El conjunto nunca
 * tiene un código que sea el comienzo de otro («G» y «GU» no conviven): al pulsar una letra se
 * sabe si ya es la acción o si falta la segunda.
 */
import { foldText } from "../../core/text";
import type { KeytipInput } from "./types";

const ABC = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CHARS = ABC + "0123456789";
/** Palabras que no dan su inicial: «Enviar al cliente» es E y C, nunca la A de «al». */
const STOP = new Set("a al con de del e el en la las lo los o para por se su sus u un una y".split(" "));
/** Hasta cuántas acciones alcanzan los códigos de una letra. */
export const KEYTIPS_SINGLE_MAX = 30;

/** Un código de autor limpio: «g» → «G», «ñ» → «N»; de 1 a 3 letras o dígitos, o `null`. */
export function cleanKeytip(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = foldText(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
  return s && s.length <= 3 ? s : null;
}

/** Las letras que prefiere un nombre, en orden y sin repetir: «Enviar al cliente» → E, C, N, V, I, A, R, L, T. */
export function keytipLetters(name: string): string[] {
  const words = foldText(name).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const main = words.filter((w) => !STOP.has(w.toLowerCase()));
  const ws = main.length ? main : words;
  const out = new Set<string>();
  for (const w of ws) out.add(w[0]);
  for (const w of [...ws, ...words]) for (const c of w) out.add(c);
  return [...out];
}

/**
 * Los códigos de una lista de acciones (en el orden del documento): uno por acción, o `null` si ya no
 * hay (más de 1.296 acciones). Misma entrada, misma salida: la asignación es estable entre aperturas.
 */
export function assignKeytips(items: readonly KeytipInput[], max = KEYTIPS_SINGLE_MAX): (string | null)[] {
  const out: (string | null)[] = items.map(() => null);
  const taken = new Set<string>();
  /** Los comienzos de lo tomado: «GU» ocupa «G». */
  const heads = new Set<string>();
  const free = (c: string) => {
    if (taken.has(c) || heads.has(c)) return false;
    for (let i = 1; i < c.length; i++) if (taken.has(c.slice(0, i))) return false;
    return true;
  };
  const take = (i: number, c: string) => {
    out[i] = c;
    taken.add(c);
    for (let k = 1; k < c.length; k++) heads.add(c.slice(0, k));
  };
  // 1. El autor (el primero con un código se lo queda; un repetido pasa a automático).
  items.forEach((it, i) => {
    const c = cleanKeytip(it.forced);
    if (c && free(c)) take(i, c);
  });
  const rest = out.flatMap((c, i) => (c === null ? [i] : []));
  const singles = [...CHARS].filter(free).length;
  const len = rest.length > max || rest.length > singles ? 2 : 1;
  // 2. Lo de la vez anterior, si es del mismo largo y sigue libre.
  for (const i of rest) {
    const p = cleanKeytip(items[i].prev);
    if (p && p.length === len && free(p)) take(i, p);
  }
  // 3 y 4. Por el nombre, y si no, lo que quede.
  for (const i of rest) {
    if (out[i] !== null) continue;
    const pref = keytipLetters(items[i].name ?? "");
    const firsts = [...pref, ...CHARS];
    if (len === 1) {
      const c = firsts.find(free);
      if (c) take(i, c);
      continue;
    }
    search: for (const a of firsts) {
      if (taken.has(a)) continue;
      for (const b of [...pref.filter((x) => x !== a), a, ...CHARS]) {
        if (free(a + b)) {
          take(i, a + b);
          break search;
        }
      }
    }
  }
  return out;
}

/**
 * La letra o el dígito de una tecla («G», «7»), o `""`. Manda `key`, que respeta la distribución
 * (AZERTY, Dvorak). Solo con Alt, si `key` no es una letra simple (en Mac, Opción+G escribe «©»), se
 * usa la tecla física `code`. Un símbolo sin Alt («@» con AltGr en Linux, «ñ», «-») no es nada.
 */
export function keytipChar(e: { key?: string; code?: string; altKey?: boolean }): string {
  const k = (e.key ?? "").toUpperCase();
  if (/^[A-Z0-9]$/.test(k)) return k;
  const m = e.altKey ? /^(?:Key([A-Z])|Digit(\d))$/.exec(e.code ?? "") : null;
  return m ? m[1] || m[2] : "";
}
