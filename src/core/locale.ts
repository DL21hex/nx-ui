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

const canonical = new Map<string, string | null>();

/** Un locale BCP 47 válido y canónico («es_CO» → «es-CO»), o `null` si `Intl` no lo entiende. */
export function canonicalLocale(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  let c = canonical.get(t);
  if (c === undefined) {
    try {
      c = Intl.getCanonicalLocales(t.replace(/_/g, "-"))[0] ?? null;
    } catch {
      c = null;
    }
    if (canonical.size > 200) canonical.clear();
    canonical.set(t, c);
  }
  return c;
}

/** El locale de un elemento: `locale`, o el `lang` más cercano, o «es-CO». Uno inválido
 *  (`lang="es_CO"` se corrige; `locale="xx!"` no) cae al siguiente: `Intl` nunca lanza por esto. */
export function resolveLocale(el: Element): string {
  return canonicalLocale(el.getAttribute("locale")) || canonicalLocale(el.closest("[lang]")?.getAttribute("lang")) || "es-CO";
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
  /** Lo que alguien escribe («1.234,5» en es, «1,234.5» en en) → número, o `null` si no se
   *  entiende sin adivinar. Las reglas, en `parseNumber`. */
  parse(text: string): number | null;
  /** Orden alfabético del locale, sin distinguir tildes ni mayúsculas, con números naturales. */
  compare(a: string, b: string): number;
}

const cache = new Map<string, NxFormat>();
const space = (s: string) => s.replace(/[  ]/g, " ");

/** El formateador de un locale (inválido o ausente → «es-CO»). */
export function nxFormat(locale?: string | null): NxFormat {
  const key = canonicalLocale(locale) || "es-CO";
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
      const [y, mo, dd] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 1)];
      // Date.UTC desborda («2026-02-31» → 3 mar, «2026-13» → ene 2027): una fecha que no existe
      // se muestra tal como vino, no como otra plausible pero falsa.
      if (mo < 1 || mo > 12 || dd < 1 || dd > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return iso;
      const d = new Date(Date.UTC(y, mo - 1, dd));
      if (Number.isNaN(d.getTime())) return iso;
      // En una tabla, la forma corta: «12 mar 2026» y no «12 de mar de 2026» (es, pt).
      const parts = (m[3] ? day : month).formatToParts(d);
      return space(parts.map((p) => (p.type === "literal" && /^\s*de\s*$/.test(p.value) ? " " : p.value)).join(""));
    },
    parse: (text) => parseNumber(text, decimal),
    compare: collator.compare,
  };
}

/** Agrupa de verdad: grupos de tres, o de dos antes del último en la India («12,34,567»). */
const grouped = (int: string, sep: string) => new RegExp(`^\\d{1,3}(?:\\${sep}\\d{2,3})*\\${sep}\\d{3}$`).test(int);

/**
 * Un número escrito por una persona (o pegado de Excel, de un PDF, de otro idioma) con el separador
 * decimal del locale (`decimal`). Mejor `null` que un número equivocado. Las reglas:
 *
 * - Se ignora lo que no es cifra, separador o signo: moneda, unidades, espacios (también los finos
 *   U+2009/U+202F y el no separable, que agrupan miles en fr, sv o pt), el apóstrofo de de-CH.
 *   Entre cifras, un espacio o apóstrofo solo agrupa de a tres: «12 34» no se entiende.
 * - Signo: un «-» (o el menos tipográfico «−» U+2212, el que escribe Intl en sv, fi o nb) al
 *   comienzo o al final («1.234-»), o el texto entre paréntesis como en contabilidad («(1.234)»,
 *   «($ 1.234,50)»). Dos signos, o uno en medio, no se entienden.
 * - Con «.» y «,» a la vez, el último que aparece es el decimal y debe aparecer una sola vez; el
 *   otro tiene que agrupar de verdad. «1,234.56» es 1234,56 también en es-CO, y «1.234,56» lo es en
 *   en-US; «12.34,5» o «1,5.3» no se entienden.
 * - Con un solo tipo de separador repetido, es de miles y tiene que agrupar («1.234.567»).
 * - Una sola vez: el decimal del locale es decimal («1,5» en es); el otro es de miles si agrupa
 *   («1.234» en es es 1234) y, si no puede serlo, se lee como decimal («1.5» en es, «0,5» en en).
 */
export function parseNumber(text: string, decimal = ","): number | null {
  let t = String(text ?? "").trim();
  let neg = false;
  const paren = /^\((.*)\)$/.exec(t);
  if (paren) {
    neg = true;
    t = paren[1];
  }
  // Un espacio (o apóstrofo) entre cifras solo agrupa miles: «1 234 567» sí, «12 34» no.
  if (/\d[\s'\u2019]+(?!\d{3}(?!\d))\d/.test(t)) return null;
  t = t.replace(/[\u2212\u2012\u2013\uFE63\uFF0D]/g, "-").replace(/[^\d.,-]/g, "");
  const signs = t.split("-").length - 1;
  if (signs > 1 || (signs === 1 && !t.startsWith("-") && !t.endsWith("-"))) return null;
  if (signs) {
    if (neg) return null;
    neg = true;
    t = t.replace("-", "");
  }
  if (!/\d/.test(t)) return null;
  const dots = t.split(".").length - 1;
  const commas = t.split(",").length - 1;
  let int = t;
  let frac = "";
  if (dots && commas) {
    const dec = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ",";
    if ((dec === "." ? dots : commas) > 1) return null;
    [int, frac] = t.split(dec);
    if (!grouped(int, dec === "." ? "," : ".")) return null;
    int = int.replace(/[.,]/g, "");
  } else if (dots + commas > 1) {
    if (!grouped(t, dots ? "." : ",")) return null;
    int = t.replace(/[.,]/g, "");
  } else if (dots + commas === 1) {
    const sep = dots ? "." : ",";
    if (sep !== decimal && grouped(t, sep)) int = t.replace(sep, "");
    else [int, frac] = t.split(sep);
  }
  const n = Number(`${int || "0"}.${frac || "0"}`);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}
