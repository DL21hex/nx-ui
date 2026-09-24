/** «0,8 s», «12 s», «2:05». Con coma decimal (es); `locale` para otros idiomas. */
export function formatElapsed(ms: number, locale = "es"): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `${s.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
  if (s < 60) return `${Math.floor(s)} s`;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
