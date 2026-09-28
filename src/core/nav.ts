/** Movimiento con flechas entre tarjetas de una cuadrícula (`<nx-launcher>`, `<nx-cards>`). */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A qué tarjeta lleva una flecha, por geometría: las secciones y una destacada que ocupa dos
 * columnas no rompen la cuadrícula. `←`/`→` van a la vecina de la misma fila (o a la anterior o
 * siguiente en orden, al llegar al borde); `↑`/`↓`, a la fila de arriba o de abajo, la más cercana
 * en horizontal. Sin cajas (todas en cero) cada flecha avanza o retrocede una. `null`: la tecla no
 * es de la cuadrícula.
 */
export function moveIndex(boxes: readonly Box[], from: number, key: string): number | null {
  const n = boxes.length;
  if (n === 0 || from < 0 || from >= n) return null;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (!step) return null;
  const clampTo = (i: number) => Math.max(0, Math.min(n - 1, i));
  const cur = boxes[from];
  if (boxes.every((b) => !b.w && !b.h)) return clampTo(from + step);
  const cx = (b: Box) => b.x + b.w / 2;
  const cy = (b: Box) => b.y + b.h / 2;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    let best = -1;
    let bestD = Infinity;
    boxes.forEach((b, i) => {
      if (i === from) return;
      const sameRow = b.y < cur.y + cur.h - 1 && b.y + b.h > cur.y + 1;
      const d = (cx(b) - cx(cur)) * step;
      if (sameRow && d > 0 && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best >= 0 ? best : clampTo(from + step);
  }

  // Arriba / abajo: la fila más próxima en esa dirección y, en ella, la tarjeta más cercana en x.
  let rowY = step > 0 ? Infinity : -Infinity;
  boxes.forEach((b, i) => {
    if (i === from) return;
    const ahead = step > 0 ? b.y >= cur.y + cur.h - 1 : b.y + b.h <= cur.y + 1;
    if (ahead && (step > 0 ? b.y < rowY : b.y > rowY)) rowY = b.y;
  });
  if (!Number.isFinite(rowY)) return from;
  let best = from;
  let bestD = Infinity;
  boxes.forEach((b, i) => {
    if (Math.abs(b.y - rowY) > 1) return;
    const d = Math.abs(cx(b) - cx(cur)) + Math.abs(cy(b) - cy(cur)) * 1e-3;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
