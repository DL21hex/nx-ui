/**
 * Treemap «squarified» (Bruls, Huizing y van Wijk): reparte un rectángulo entre valores de modo
 * que cada bloque quede lo más cercano posible a un cuadrado. Los valores llegan ordenados de mayor
 * a menor; las cajas salen en el mismo orden, en unidades del rectángulo que se pasa. Sin DOM.
 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La peor proporción (lado largo / lado corto) de una fila de áreas sobre un lado de largo `side`. */
function worst(row: number[], side: number): number {
  let sum = 0;
  let max = 0;
  let min = Infinity;
  for (const a of row) {
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  if (!sum || !side) return Infinity;
  const s2 = sum * sum;
  const w2 = side * side;
  return Math.max((w2 * max) / s2, s2 / (w2 * min));
}

/**
 * Las cajas de `values` (≥ 0, de mayor a menor) dentro de `box`. Un valor 0 o negativo recibe una
 * caja vacía en la esquina, para que los índices sigan correspondiendo.
 */
export function squarify(values: readonly number[], box: Rect): Rect[] {
  const out: Rect[] = values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  const idx = values.map((_, i) => i).filter((i) => values[i] > 0);
  const total = idx.reduce((s, i) => s + values[i], 0);
  if (!total || box.w <= 0 || box.h <= 0) return out;
  const scale = (box.w * box.h) / total;
  let { x, y, w, h } = box;
  let i = 0;
  while (i < idx.length) {
    const side = Math.min(w, h);
    const row: number[] = [];
    let j = i;
    // Se agregan bloques a la fila mientras la peor proporción no empeore.
    while (j < idx.length) {
      const a = values[idx[j]] * scale;
      if (row.length && worst([...row, a], side) > worst(row, side)) break;
      row.push(a);
      j++;
    }
    const sum = row.reduce((s, a) => s + a, 0);
    // La fila ocupa una franja a lo largo del lado corto.
    if (w >= h) {
      const cw = h ? sum / h : 0;
      let cy = y;
      row.forEach((a, k) => {
        const ch = cw ? a / cw : 0;
        out[idx[i + k]] = { x, y: cy, w: cw, h: ch };
        cy += ch;
      });
      x += cw;
      w -= cw;
    } else {
      const ch = w ? sum / w : 0;
      let cx = x;
      row.forEach((a, k) => {
        const cw = ch ? a / ch : 0;
        out[idx[i + k]] = { x: cx, y, w: cw, h: ch };
        cx += cw;
      });
      y += ch;
      h -= ch;
    }
    i = j;
  }
  return out;
}
