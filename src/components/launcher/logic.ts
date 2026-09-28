/** Lógica pura de `<nx-launcher>`: sin DOM, para probarse en node. */
import { foldText } from "../../core/text";
import type { LauncherItem, LauncherProgress, LauncherView } from "./types";

export { formatBadge, groupBySection } from "../sidemenu/logic";
export { moveIndex, type Box } from "../../core/nav";
export { sparkPaths } from "../../core/spark";

const fold = (v: unknown) => foldText(typeof v === "string" || typeof v === "number" ? String(v) : "").trim();

export interface LauncherMatch {
  /** Coincide la tarjeta (nombre o descripción). */
  own: boolean;
  /** Las posiciones de las vistas que coinciden. */
  views: number[];
}

/** Qué coincide con la consulta en una tarjeta; `null` si nada. Consulta vacía ⇒ la tarjeta entera. */
export function matchItem(item: LauncherItem, query: string): LauncherMatch | null {
  const q = fold(query);
  if (!q) return { own: true, views: [] };
  const own = fold(item.label).includes(q) || fold(item.description).includes(q) || fold(item.eyebrow).includes(q);
  const views: number[] = [];
  (Array.isArray(item.views) ? item.views : []).forEach((v, i) => {
    if (v && fold(v.label).includes(q)) views.push(i);
  });
  return own || views.length ? { own, views } : null;
}

export interface LauncherTarget {
  item: LauncherItem;
  /** La vista a abrir, o `null` para la tarjeta. */
  view: LauncherView | null;
  viewIndex: number;
}

/**
 * Lo que abre `Enter` en el buscador: la primera tarjeta que coincide, en su orden. Si coincide
 * por una vista y no por su nombre, esa vista («pendientes de pago» → Facturas › Por revisar).
 */
export function firstTarget(items: readonly LauncherItem[], query: string): LauncherTarget | null {
  if (!fold(query)) return null;
  for (const item of items) {
    const m = matchItem(item, query);
    if (!m) continue;
    if (!m.own && m.views.length) {
      const i = m.views[0];
      return { item, view: item.views![i], viewIndex: i };
    }
    return { item, view: null, viewIndex: -1 };
  }
  return null;
}

/** Cuántas columnas caben: tarjetas de al menos `min` px con `gap` entre ellas, sin pasar de `max`. */
export function fitColumns(width: number, min: number, gap: number, max: number): number {
  if (!(width > 0) || !(min > 0)) return 1;
  const n = Math.floor((width + gap) / (min + gap));
  return Math.max(1, Math.min(Math.max(1, Math.floor(max) || 1), n));
}

/** Celdas que ocupa una sección con `cols` columnas: una destacada ocupa dos. */
export function sectionCells(items: readonly Pick<LauncherItem, "featured">[], cols: number): number {
  return items.reduce((n, it) => n + (it.featured && cols >= 2 ? 2 : 1), 0);
}

/** Huecos al final de una sección de varias filas (una sola fila incompleta no cuenta: no hay huérfanas). */
function gaps(cells: number, cols: number): number {
  if (cells <= cols) return 0;
  const rest = cells % cols;
  return rest ? cols - rest : 0;
}

/**
 * Las columnas de todas las secciones (una sola cuenta para que las tarjetas midan lo mismo). Entre
 * las que caben y una menos, la que deja menos tarjetas huérfanas: 4 módulos donde caben 3 van en
 * 2 × 2 y no en 3 + 1. Empate ⇒ las que caben.
 */
export function balanceColumns(sections: readonly (readonly Pick<LauncherItem, "featured">[])[], fit: number): number {
  const c = Math.max(1, Math.floor(fit) || 1);
  if (c < 3) return c;
  const waste = (cols: number) => sections.reduce((n, s) => n + gaps(sectionCells(s, cols), cols), 0);
  return waste(c - 1) < waste(c) ? c - 1 : c;
}

/** Las partes de la barra con su porcentaje; se descartan las que no son números ≥ 0. */
export function progressParts(parts: readonly LauncherProgress[] | undefined): (LauncherProgress & { pct: number })[] {
  const ok = (Array.isArray(parts) ? parts : []).filter((p) => p && typeof p.value === "number" && Number.isFinite(p.value) && p.value >= 0);
  const total = ok.reduce((n, p) => n + p.value, 0);
  return ok.map((p) => ({ label: String(p.label ?? ""), value: p.value, pct: total ? (p.value / total) * 100 : 0 }));
}

/** 0–100 o `null`. */
export function clampMeter(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : null;
}

/** «Enter abre {name}» con el nombre puesto. */
export function fill(template: string, name: string): string {
  return template.replace("{name}", name);
}

/** El destino de la tarjeta: el suyo, o el de su primera vista. */
export function itemHref(item: LauncherItem): string | undefined {
  return item.href ?? (Array.isArray(item.views) ? item.views.find((v) => v?.href)?.href : undefined);
}
