/**
 * Los trazos de una minigráfica en una caja de 100 × `height` (con `preserveAspectRatio="none"` y
 * `vector-effect: non-scaling-stroke`): la línea y el área bajo ella, con 1,5 de aire arriba y
 * abajo. Se toman los últimos 60 números válidos; `null` con menos de dos.
 */
export function sparkPaths(values: readonly unknown[] | undefined, height = 22): { line: string; area: string; last: number } | null {
  const v = (Array.isArray(values) ? values : []).filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(-60);
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const span = Math.max(...v) - min || 1;
  const y = (n: number) => +(height - 1.5 - ((n - min) / span) * (height - 3)).toFixed(2);
  const pts = v.map((n, i) => `${+((i / (v.length - 1)) * 100).toFixed(2)},${y(n)}`);
  const line = `M${pts.join("L")}`;
  return { line, area: `${line}L100,${height}L0,${height}Z`, last: y(v[v.length - 1]) };
}
