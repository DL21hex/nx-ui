import { canonicalLocale } from "./locale";

const fmts = new Map<string, Intl.NumberFormat>();

/** «0,8 s», «12 s», «2:05», con el separador decimal del locale (los componentes pasan el suyo,
 *  `resolveLocale(this)`). Un locale inválido cae a «es-CO». */
export function formatElapsed(ms: number, locale = "es-CO"): string {
  const s = Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000;
  if (s < 10) {
    const key = canonicalLocale(locale) || "es-CO";
    let f = fmts.get(key);
    if (!f) fmts.set(key, (f = new Intl.NumberFormat(key, { minimumFractionDigits: 1, maximumFractionDigits: 1 })));
    return `${f.format(s)} s`;
  }
  if (s < 60) return `${Math.floor(s)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
