/** Lógica pura de `<nx-print>`: sin DOM, para probarse en node. */
import type { PrintBlock, PrintOrientation, PrintPaginateOptions, PrintPiece, PrintSizeName, PrintZoom } from "./types";

/** Tamaños con nombre, en mm, verticales. */
export const PRINT_SIZES: Record<PrintSizeName, [number, number]> = {
  letter: [215.9, 279.4],
  a4: [210, 297],
  a5: [148, 210],
  legal: [215.9, 355.6],
  oficio: [216, 330],
  "half-letter": [139.7, 215.9],
};

/** px por mm (96 px por pulgada, como el navegador al imprimir). */
export const PX_PER_MM = 96 / 25.4;

const UNITS: Record<string, number> = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 96, "": 1 };

/** «12mm», «1.5cm», «0.5in», «36pt», «40px» → mm. Sin unidad, mm. Inválido → `null`. */
export function toMm(v: string): number | null {
  const m = /^(\d*\.?\d+)\s*(mm|cm|in|pt|pc|px)?$/i.exec(v.trim());
  return m ? Number(m[1]) * UNITS[(m[2] ?? "").toLowerCase()] : null;
}

/**
 * El tamaño de la hoja en mm `[ancho, alto]`: un nombre (`letter` por defecto) o dos medidas
 * («216mm 140mm»). La orientación manda si se da; si no, un nombre va vertical y unas medidas van
 * como se escribieron.
 */
export function parsePrintSize(size: unknown, orientation?: unknown): [number, number] {
  const s = typeof size === "string" ? size.trim().toLowerCase() : "";
  let wh: [number, number] | null = Object.hasOwn(PRINT_SIZES, s) ? [...PRINT_SIZES[s as PrintSizeName]] : null;
  if (!wh) {
    const parts = s.split(/\s+/).map(toMm);
    if (parts.length === 2 && parts.every((n) => n !== null && n >= 20 && n <= 2000)) wh = [parts[0]!, parts[1]!];
  }
  const out = wh ?? [...PRINT_SIZES.letter];
  const o = orientation as PrintOrientation;
  if ((o === "landscape" && out[0] < out[1]) || (o === "portrait" && out[0] > out[1])) out.reverse();
  return out;
}

/**
 * Márgenes en mm `[arriba, derecha, abajo, izquierda]`, como en CSS: uno, dos, tres o cuatro
 * valores («12mm», «10mm 15mm»). Inválido → 12 mm. Cada uno queda entre 0 y 60 mm.
 */
export function parsePrintMargin(margin: unknown): [number, number, number, number] {
  const parts = (typeof margin === "number" ? String(margin) : typeof margin === "string" ? margin : "").trim().split(/\s+/).map(toMm);
  if (!parts.length || parts.length > 4 || parts.some((n) => n === null)) return [12, 12, 12, 12];
  const [t, r = t, b = t, l = r] = parts.map((n) => Math.min(60, n!));
  return [t, r, b, l];
}

export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 2];

/** `"fit"` (por defecto) o un factor entre 0,25 y 4 (también «125 %»). */
export function parseZoom(v: unknown): PrintZoom {
  const s = String(v ?? "").trim();
  const pct = s.endsWith("%");
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n <= 0) return "fit";
  return Math.min(4, Math.max(0.25, pct ? n / 100 : n));
}

/** El siguiente paso de zoom desde `current` hacia `dir` (+1 / −1). */
export function stepZoom(current: number, dir: number): number {
  if (dir > 0) return ZOOM_STEPS.find((z) => z > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  return [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001) ?? ZOOM_STEPS[0];
}

/** `{page}` y `{pages}` en un texto. */
export function fillPageText(text: string, page: number, pages: number): string {
  return text.replace(/\{pages\}/g, String(pages)).replace(/\{page\}/g, String(page));
}

const EPS = 0.5;
const len = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
/** Las sumas van en centavos enteros: 0,1 + 0,2 da 0,3 y 5.000 filas no acumulan error. */
const cents = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) : 0);

/**
 * Reparte los bloques en páginas. Reglas, en orden:
 *
 * - `breakBefore` / `breakAfter` fuerzan salto (nunca dejan una página en blanco).
 * - Un bloque entra entero si cabe; si no, pasa a la página siguiente. Si es más alto que una
 *   página, se parte en tajadas (`offset`, `clip`).
 * - `keepWithNext`: el bloque va en la misma página que el comienzo del siguiente (un título no
 *   queda solo al pie). Si los dos no caben ni en una página vacía, la regla se ignora.
 * - Una tabla se parte por filas (nunca una fila a la mitad), con su encabezado en cada pedazo, y
 *   al menos `minRows` filas a cada lado del corte (viudas y huérfanas). Con `keep`, solo se parte
 *   si no cabe en una página. Una fila más alta que la página va sola (se recorta).
 * - Con `sums`, cada página que parte la tabla termina en «Van» y la siguiente empieza en «Vienen»
 *   con lo sumado hasta ahí (en centavos exactos).
 *
 * Lineal en bloques + filas. Siempre devuelve al menos una página.
 */
export function paginatePrint(blocks: readonly PrintBlock[], opts: PrintPaginateOptions): PrintPiece[][] {
  const P = Math.max(1, len(opts.pageHeight));
  const minRows = Math.max(1, Math.floor(len(opts.minRows) || 2));
  const maxPages = Math.max(1, Math.floor(len(opts.maxPages) || 5000));
  const pages: PrintPiece[][] = [[]];
  let used = 0;
  const cur = () => pages[pages.length - 1];
  /** Página nueva (si la actual tiene algo). `false` si ya no se puede: tope alcanzado. */
  const next = (): boolean => {
    if (!cur().length) return (used = 0), true;
    if (pages.length >= maxPages) return false;
    pages.push([]);
    used = 0;
    return true;
  };
  const room = () => P - used;

  const full = (b: PrintBlock): number => {
    const t = b.table;
    if (!t) return len(b.height);
    return len(t.extra) + len(t.caption) + len(t.head) + t.rows.reduce((s, r) => s + len(r), 0) + len(t.foot);
  };
  const splittable = (b: PrintBlock) => !!b.table?.rows.length && (!b.keep || full(b) > P + EPS);
  const carryH = (b: PrintBlock) => (b.table?.sums?.length ? len(b.table.carry) : 0);
  /** Lo mínimo del bloque `i` que tiene que quedar con el anterior (`keepWithNext`), en cadena. */
  const lead = (i: number, depth = 0): number => {
    const b = blocks[i];
    if (!b || b.breakBefore) return 0;
    if (splittable(b)) {
      const t = b.table!;
      const n = Math.min(minRows, t.rows.length);
      let s = len(t.extra) + len(t.caption) + len(t.head) + (t.rows.length > n ? carryH(b) : len(t.foot));
      for (let r = 0; r < n; r++) s += len(t.rows[r]);
      return s;
    }
    const h = full(b);
    return b.keepWithNext && depth < 8 ? h + len(b.gap) + lead(i + 1, depth + 1) : h;
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b || typeof b !== "object") continue;
    if (b.breakBefore) next();
    const H = full(b);
    const gap = len(b.gap);
    const t = b.table;

    if (splittable(b) && H > room() + EPS) {
      splitTable(i, b);
    } else if (H <= P + EPS) {
      const need = b.keepWithNext && !b.breakAfter ? H + gap + lead(i + 1) : H;
      if (H > room() + EPS || (need > room() + EPS && need <= P + EPS)) next();
      cur().push(t ? { block: i, from: 0, to: t.rows.length, first: true, last: true } : { block: i });
      used += H + gap;
    } else {
      // Más alto que una página y no se puede partir por filas: tajadas del alto de la página.
      next();
      let off = 0;
      for (let k = 0; off < H - EPS && k < maxPages; k++) {
        if (k && !next()) break;
        const clip = Math.min(P, H - off);
        cur().push({ block: i, offset: off, clip });
        used = clip + gap;
        off += P;
      }
    }
    if (b.breakAfter) next();
  }
  if (pages.length > 1 && !cur().length) pages.pop();
  return pages;

  function splitTable(i: number, b: PrintBlock): void {
    const t = b.table!;
    const rows = t.rows.map(len);
    const n = rows.length;
    const sums = t.sums?.length ? t.sums : null;
    const carry = carryH(b);
    let cols = 0;
    if (sums) for (const s of sums) if (Array.isArray(s) && s.length > cols) cols = s.length;
    const acc: number[] = new Array(cols).fill(0);
    const fixed = len(t.extra) + len(t.head);
    let r = 0;
    for (let guard = 0; r < n && guard < 2 * n + 4; guard++) {
      const base = fixed + (r === 0 ? len(t.caption) : 0) + (r > 0 ? carry : 0);
      const space = room();
      let j = r;
      let s = 0;
      while (j < n && base + s + rows[j] + (j + 1 < n ? carry : len(t.foot)) <= space + EPS) s += rows[j++];
      // Huérfanas: si en lo que queda de esta página no caben las filas mínimas, a la siguiente.
      if (cur().length && j - r < Math.min(minRows, n - r) && next()) continue;
      if (j === r) s = rows[j++]; // ni una fila en una página vacía: va sola (se recorta)
      // Viudas: que la página siguiente no empiece con menos de `minRows` filas.
      if (j < n && n - j < minRows) {
        const back = n - minRows;
        if (back - r >= minRows) {
          for (let k = back; k < j; k++) s -= rows[k];
          j = back;
        }
      }
      const piece: PrintPiece = { block: i, from: r, to: j, first: r === 0, last: j === n };
      if (sums) {
        if (r > 0) piece.carryIn = acc.map((c) => c / 100);
        for (let k = r; k < j; k++) {
          const row = sums[k];
          if (Array.isArray(row)) for (let c = 0; c < cols; c++) acc[c] += cents(row[c]);
        }
        if (j < n) piece.carryOut = acc.map((c) => c / 100);
      }
      cur().push(piece);
      r = j;
      if (r < n) {
        if (!next()) {
          // Tope de páginas: lo que falta va en la última (recortado) y se termina.
          cur().push({ block: i, from: r, to: n, first: false, last: true });
          return;
        }
      } else used += base + s + len(t.foot) + len(b.gap);
    }
  }
}
