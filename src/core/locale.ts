/**
 * Locale de toda la librería: números, montos, fechas, lo que alguien escribe y el orden
 * alfabético. Todo sale de `Intl`, así que un `locale` («es-CO», «en-US», «pt-BR»…) basta para que
 * un componente hable el formato de quien lo usa. Se cachea un formateador por locale.
 *
 * Cada componente lo resuelve igual (`resolveLocale`): su atributo `locale`, o el `lang` más
 * cercano (el de la página, normalmente), o «es-CO». Los textos de la interfaz van aparte (`labels`).
 */

/** Lo que el formato necesita saber de un monto: su moneda ISO («COP») o un símbolo («$»). */
export interface MoneyLike {
  currency?: string;
}

/** El locale de un elemento: `locale`, o el `lang` más cercano, o «es-CO». */
export function resolveLocale(el: Element): string {
  return el.getAttribute("locale") || el.closest("[lang]")?.getAttribute("lang") || "es-CO";
}

export interface NxFormat {
  locale: string;
  /** 1234567.5 → «1.234.567,5» (es) · «1,234,567.5» (en). */
  number(n: number): string;
  /** 8200000 → «8,2 M» (es) · «8.2M» (en). */
  compact(n: number): string;
  /** Un monto de la columna: `currency` ISO («COP», «USD») o un símbolo («$», el de siempre). */
  money(n: number, c: MoneyLike, compact?: boolean): string;
  /** «2026-03-12» → «12 mar 2026»; «2026-03» → «mar 2026» (según el locale). */
  date(iso: string): string;
  /** Lo que alguien escribe («1.234,5» en es, «1,234.5» en en) → número. */
  parse(text: string): number | null;
  /** Orden alfabético del locale, sin distinguir tildes ni mayúsculas, con números naturales. */
  compare(a: string, b: string): number;
}

const cache = new Map<string, NxFormat>();
const space = (s: string) => s.replace(/[  ]/g, " ");

/** El formateador de un locale (inválido o ausente → «es-CO»). */
export function nxFormat(locale?: string | null): NxFormat {
  const key = locale || "es-CO";
  let f = cache.get(key);
  if (!f) {
    try {
      f = build(key);
    } catch {
      f = nxFormat("es-CO");
    }
    cache.set(key, f);
  }
  return f;
}

function build(locale: string): NxFormat {
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const cf = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const day = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" });
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const decimal = nf.formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ",";
  const currencies = new Map<string, [Intl.NumberFormat, Intl.NumberFormat]>();
  const currency = (code: string) => {
    let pair = currencies.get(code);
    if (!pair) {
      const base = { style: "currency", currency: code, currencyDisplay: "narrowSymbol" } as const;
      pair = [new Intl.NumberFormat(locale, { ...base, minimumFractionDigits: 0, maximumFractionDigits: 2 }), new Intl.NumberFormat(locale, { ...base, notation: "compact", maximumFractionDigits: 1 })];
      currencies.set(code, pair);
    }
    return pair;
  };
  return {
    locale,
    number: (n) => space(nf.format(n)),
    compact: (n) => space(cf.format(n)),
    money(n, c, short = false) {
      const code = c.currency ?? "";
      if (/^[A-Z]{3}$/.test(code)) {
        try {
          return space(currency(code)[short ? 1 : 0].format(n));
        } catch {
          /* código desconocido: como símbolo */
        }
      }
      const sym = code || "$";
      return short ? `${sym}${space(cf.format(n))}` : `${sym} ${space(nf.format(n))}`;
    },
    date(iso) {
      const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(iso);
      if (!m) return iso;
      const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1)));
      if (Number.isNaN(d.getTime())) return iso;
      // En una tabla, la forma corta: «12 mar 2026» y no «12 de mar de 2026» (es, pt).
      const parts = (m[3] ? day : month).formatToParts(d);
      return space(parts.map((p) => (p.type === "literal" && /^\s*de\s*$/.test(p.value) ? " " : p.value)).join(""));
    },
    parse(text) {
      let t = text.replace(/[^\d.,-]/g, "");
      if (!t || t === "-") return null;
      if (decimal === ",") {
        if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
        else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, "");
      } else {
        t = t.replace(/,/g, "");
      }
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    },
    compare: collator.compare,
  };
}
