/**
 * Textos de la interfaz que llegan de afuera (atributo `labels` o payload BDUI): solo se toman las
 * claves conocidas con un texto. Un `{"moved": null}` o `{"count": 5}` no rompe el pintado.
 */
export function mergeLabels<T extends object>(defaults: T, v: unknown): T {
  let o = v;
  if (typeof o === "string") {
    try {
      o = JSON.parse(o);
    } catch {
      return { ...defaults };
    }
  }
  const out = { ...defaults } as Record<string, unknown>;
  if (!o || typeof o !== "object" || Array.isArray(o)) return out as T;
  for (const [k, val] of Object.entries(o)) {
    if (Object.hasOwn(defaults, k) && typeof val === "string" && typeof out[k] === "string") out[k] = val;
  }
  return out as T;
}
