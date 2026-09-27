/** NIT colombiano: el dígito de verificación y el formato de siempre. Lo usan paste-fill e import. */

const NIT_W = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** El dígito de verificación de un NIT colombiano (DIAN, módulo 11). */
export function nitCheckDigit(base: string): number {
  const d = base.replace(/\D/g, "");
  let s = 0;
  for (let i = 0; i < d.length && i < NIT_W.length; i++) s += Number(d[d.length - 1 - i]) * NIT_W[i];
  const r = s % 11;
  return r > 1 ? 11 - r : r;
}

/** «900123456», 7 → «900.123.456-7». */
export const formatNit = (base: string, dv?: number | string): string => base.replace(/\B(?=(\d{3})+$)/g, ".") + (dv === undefined ? "" : `-${dv}`);
