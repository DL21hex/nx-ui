/** El mayor retraso que acepta `setTimeout` (2³¹−1 ms, ~24,8 días). Uno mayor dispara al instante. */
export const MAX_DELAY = 2_147_483_647;

/** Un retraso utilizable por `setTimeout`: finito, ≥ 0 y ≤ `MAX_DELAY`. */
export function clampDelay(ms: unknown, fallback = 0): number {
  const n = typeof ms === "number" ? ms : Number(ms);
  if (!Number.isFinite(n)) return Math.min(Math.max(0, fallback), MAX_DELAY);
  return Math.min(Math.max(0, n), MAX_DELAY);
}

/** Mínimo y máximo sin `Math.min(...arr)` (que lanza `RangeError` con ~120 000 elementos). Ignora
 *  lo que no es finito; `null` si no queda nada. */
export function extent(values: Iterable<number>): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo <= hi ? [lo, hi] : null;
}
