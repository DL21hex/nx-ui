/** Lógica pura de `<nx-account>`: validar datos, sesión, recientes, búsqueda, paletas y comandos. Sin DOM. */
import { initials } from "../../core/icons";
import { foldText } from "../../core/text";
import type { AccountCommand, AccountItem, AccountLabels, AccountLocale, AccountPalette, AccountPerson, AccountPrefs, AccountTenant, AccountTheme, AccountUser } from "./types";

const str = (x: unknown): string | undefined => (typeof x === "string" && x.trim() ? x : undefined);
const id = (x: unknown): string | undefined => str(x) ?? (typeof x === "number" && Number.isFinite(x) ? String(x) : undefined);
const obj = (x: unknown): Record<string, unknown> | null => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const list = <T>(v: unknown, f: (o: Record<string, unknown>) => T | null): T[] =>
  Array.isArray(v) ? v.map((x) => (obj(x) ? f(obj(x)!) : null)).filter((x): x is T => x !== null) : [];

/** Un JSON de atributo, o el valor tal cual. Uno inválido es `null`. */
export function parseJsonAttr(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export function cleanUser(v: unknown): AccountUser | null {
  const o = obj(v);
  const name = str(o?.name);
  return name ? { name, email: str(o!.email), avatar: str(o!.avatar), initials: str(o!.initials) } : null;
}

export const cleanTenants = (v: unknown): AccountTenant[] =>
  list(v, (o) => (id(o.id) && str(o.name) ? { id: id(o.id)!, name: str(o.name)!, detail: str(o.detail), role: str(o.role), group: str(o.group) } : null));

export const cleanAccountItems = (v: unknown): AccountItem[] =>
  list(v, (o) => (id(o.id) && str(o.label) ? { id: id(o.id)!, label: str(o.label)!, icon: str(o.icon), href: str(o.href), hint: str(o.hint) } : null));

export const cleanLocales = (v: unknown): AccountLocale[] => list(v, (o) => (str(o.value) && str(o.label) ? { value: str(o.value)!, label: str(o.label)! } : null));

export const cleanPerson = (v: unknown): AccountPerson | null => {
  const o = obj(v);
  return o && id(o.id) && str(o.name) ? { id: id(o.id)!, name: str(o.name)!, role: str(o.role), avatar: str(o.avatar) } : null;
};

/** Las iniciales del avatar: las propias, o las del nombre («Diego Llinás» → «DL»). */
export function accountInitials(user: Pick<AccountUser, "name" | "initials"> | null | undefined): string {
  return (user?.initials?.trim().slice(0, 3) || initials(user?.name ?? "")).toUpperCase();
}

/** «Sede Medellín · Aprobador» */
export const tenantLine = (t: AccountTenant): string => [t.detail, t.role].filter(Boolean).join(" · ");

// ---------------------------------------------------------------- sesión

/** Cuándo vence: ISO, milisegundos (número o texto) o `null` si no se entiende. */
export function parseExpiry(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || !v.trim()) return null;
  const t = /^\d+$/.test(v.trim()) ? Number(v) : Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/** Lo que falta para que venza (≥ 0), o `null` sin vencimiento. */
export function sessionRemaining(expiresAt: number | null, now: number): number | null {
  return expiresAt === null ? null : Math.max(0, expiresAt - now);
}

/** `none` (sin vencimiento), `ok`, `warn` (dentro del aviso) o `expired`. */
export function sessionPhase(expiresAt: number | null, now: number, warnMs: number): "none" | "ok" | "warn" | "expired" {
  const left = sessionRemaining(expiresAt, now);
  return left === null ? "none" : left <= 0 ? "expired" : left <= warnMs ? "warn" : "ok";
}

/** «4:59», «0:05», «1:02:03». Redondea hacia arriba: con 300 ms queda «0:01», no «0:00». */
export function formatRemaining(ms: number): string {
  const s = Math.ceil(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** Hasta cuándo dura un estado: `hour` (una hora), `today` (fin del día local) o sin fin (`null`). */
export function statusUntil(choice: string | null | undefined, now: number): number | null {
  if (choice === "hour") return now + 3_600_000;
  if (choice !== "today") return null;
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

// ---------------------------------------------------------------- recientes y búsqueda

/** `id` al frente, sin repetir, hasta `max`. */
export function pushRecent(recent: readonly string[], value: string, max = 5): string[] {
  return [value, ...recent.filter((r) => r !== value)].slice(0, max);
}

/** El texto sin tildes de cada empresa, calculado una vez por dato (no una vez por tecla). */
const folded = new WeakMap<AccountTenant, string>();
const hayOf = (t: AccountTenant): string => {
  let hay = folded.get(t);
  if (hay === undefined) folded.set(t, (hay = foldText([t.name, t.detail, t.role, t.group].filter(Boolean).join(" "))));
  return hay;
};
const wordsOf = (query: string): string[] => foldText(query).split(/\s+/).filter(Boolean);

/** Si una empresa coincide con la consulta: cada palabra (sin tildes) en su nombre, sede, rol o grupo. */
export function tenantMatches(t: AccountTenant, query: string | readonly string[]): boolean {
  const hay = hayOf(t);
  return (typeof query === "string" ? wordsOf(query) : query).every((w) => hay.includes(w));
}

export interface TenantSection {
  /** Encabezado («Recientes», la empresa); vacío si no hay grupos. */
  group: string;
  items: AccountTenant[];
}

/**
 * Las secciones del selector. Sin consulta, «Recientes» arriba (solo si hay más de `minForRecent`
 * empresas: con tres no hace falta) y luego el resto por grupo, sin repetir. Con consulta, lo que
 * coincide, por grupo y en su orden.
 */
export function tenantSections(tenants: readonly AccountTenant[], opts: { query?: string; recent?: readonly string[]; recentLabel?: string; current?: string | null; minForRecent?: number }): TenantSection[] {
  const q = opts.query?.trim() ?? "";
  const out: TenantSection[] = [];
  const words = wordsOf(q);
  let rest = q ? tenants.filter((t) => tenantMatches(t, words)) : [...tenants];
  if (!q && tenants.length > (opts.minForRecent ?? 5)) {
    const byId = new Map(tenants.map((t) => [t.id, t]));
    const recent = (opts.recent ?? []).filter((r) => r !== opts.current && byId.has(r)).slice(0, 3).map((r) => byId.get(r)!);
    if (recent.length) {
      out.push({ group: opts.recentLabel ?? "", items: recent });
      rest = rest.filter((t) => !recent.includes(t));
    }
  }
  const groups = new Map<string, AccountTenant[]>();
  for (const t of rest) {
    const g = t.group ?? "";
    groups.get(g)?.push(t) ?? groups.set(g, [t]);
  }
  for (const [group, items] of groups) out.push({ group, items });
  return out;
}

// ---------------------------------------------------------------- tema y paletas

/** Las 9 paletas de `palettes.css`, en su orden. */
export const BUILTIN_PALETTES: readonly AccountPalette[] = [
  ["indigo", "Índigo"],
  ["oceano", "Océano"],
  ["esmeralda", "Esmeralda"],
  ["bosque", "Bosque"],
  ["terracota", "Terracota"],
  ["frambuesa", "Frambuesa"],
  ["violeta", "Violeta"],
  ["medianoche", "Medianoche"],
  ["grafito", "Grafito"],
].map(([id, label]) => ({ id, label }));

/** Un color de CSS inofensivo (sin `;`, `url()` ni otra declaración): hex, un nombre, una función de
 *  color o `var(--x)`. Va al atributo `style` de la muestra y puede venir del servidor (BDUI). */
export const safePaletteColor = (v: unknown): string | undefined =>
  typeof v === "string" && /^(#[\da-f]{3,8}|[a-z]{3,20}|(?:rgba?|hsla?|hwb|oklch|oklab|lab|lch)\([\d\s.,%/a-z+-]+\)|var\(--[\w-]+\))$/i.test(v.trim()) ? v.trim() : undefined;

/**
 * Las paletas a ofrecer, en el orden que se pidieron: ids de `palettes.css` (`["indigo","oceano"]`,
 * con su nombre en español) u objetos `{id, label, color}`. Sin ids repetidos. Vacío o inválido:
 * las 9 de la librería. Un `color` que no es un color se descarta (la muestra usa la paleta).
 */
export function normalizePalettes(v: unknown): AccountPalette[] {
  const seen = new Set<string>();
  const out: AccountPalette[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const o = obj(x);
    const pid = typeof x === "string" ? str(x) : id(o?.id);
    if (!pid || seen.has(pid) || !/^[\w-]+$/.test(pid)) continue;
    seen.add(pid);
    const known = BUILTIN_PALETTES.find((p) => p.id === pid);
    out.push({ id: pid, label: str(o?.label) ?? known?.label ?? pid, color: safePaletteColor(o?.color) });
  }
  return out.length ? out : [...BUILTIN_PALETTES];
}

/** El tema de un valor cualquiera: `light`, `dark` o `system` (lo demás). */
export const pickTheme = (v: unknown): AccountTheme => (v === "light" || v === "dark" ? v : "system");

/** Lo guardado, validado: un `theme` o `palette` extraño se descarta, no rompe la carga. */
export function parsePrefs(raw: unknown): AccountPrefs {
  const o = obj(parseJsonAttr(raw));
  if (!o) return {};
  const out: AccountPrefs = {};
  if (o.theme === "light" || o.theme === "dark" || o.theme === "system") out.theme = o.theme;
  if (typeof o.palette === "string" && /^[\w-]{1,40}$/.test(o.palette)) out.palette = o.palette;
  if (Array.isArray(o.recent)) out.recent = o.recent.filter((r): r is string => typeof r === "string").slice(0, 10);
  return out;
}

/** El radio del círculo que cubre la ventana desde `(x, y)`: la distancia a la esquina más lejana. */
export function revealRadius(x: number, y: number, width: number, height: number): number {
  return Math.ceil(Math.hypot(Math.max(x, width - x), Math.max(y, height - y)));
}

/** «1 cambio sin sincronizar» / «3 cambios…», con el número del locale. */
export function pendingText(n: number, L: Pick<AccountLabels, "pendingOne" | "pendingMany">, format: (n: number) => string = String): string {
  return (n === 1 ? L.pendingOne : L.pendingMany).replace("{n}", format(n));
}

// ---------------------------------------------------------------- paleta de comandos

export interface CommandSource {
  /** Identidad de la `<nx-account>` (viaja en `data.account`). */
  account: string;
  labels: AccountLabels;
  palettes: readonly AccountPalette[];
  tenants: readonly AccountTenant[];
  locales: readonly AccountLocale[];
  viewAs: boolean;
}

/**
 * Las acciones de la cuenta como entradas de `<nx-command>`: tema, cada paleta, cada empresa, cada
 * idioma, «Ver como…» y cerrar sesión. Planas (no submenús): «oscuro», «océano» o
 * «bogotá» las encuentran desde la raíz.
 */
export function accountCommands(s: CommandSource): AccountCommand[] {
  const L = s.labels;
  const cmd = (action: string, label: string, group: string, extra: Partial<AccountCommand> = {}, value?: string): AccountCommand => ({
    id: `account:${action}${value === undefined ? "" : `:${value}`}`,
    label,
    group,
    ...extra,
    data: { account: s.account, action, value },
  });
  return [
    ...(["light", "dark", "system"] as const).map((t) => cmd("theme", `${L.theme}: ${L[t]}`, L.theme, {}, t)),
    ...s.palettes.map((p) => cmd("palette", `${L.color}: ${p.label}`, L.theme, {}, p.id)),
    ...s.tenants.map((t) => cmd("tenant", t.detail ? `${t.name} · ${t.detail}` : t.name, L.tenant, { hint: t.role, keywords: t.group ? [t.group] : undefined }, t.id)),
    ...s.locales.map((l) => cmd("locale", l.label, L.language, { hint: l.value }, l.value)),
    ...(s.viewAs ? [cmd("view-as", L.viewAs, L.account)] : []),
    cmd("logout", L.logout, L.account),
  ];
}
