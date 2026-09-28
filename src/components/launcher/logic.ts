/** Lógica pura de `<nx-launcher>`: sin DOM, para probarse en node. */
import { foldText } from "../../core/text";
import type { LauncherItem, LauncherProgress, LauncherView } from "./types";

export { formatBadge, groupBySection } from "../sidemenu/logic";

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

/** Los trazos de la minigráfica en una caja de 100 × 22: la línea y el área bajo ella. `null` con menos de dos puntos. */
export function sparkPaths(values: readonly unknown[] | undefined): { line: string; area: string } | null {
  const v = (Array.isArray(values) ? values : []).filter((n): n is number => typeof n === "number" && Number.isFinite(n)).slice(-60);
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const span = Math.max(...v) - min || 1;
  const pts = v.map((n, i) => `${+((i / (v.length - 1)) * 100).toFixed(2)},${+(20.5 - ((n - min) / span) * 19).toFixed(2)}`);
  const line = `M${pts.join("L")}`;
  return { line, area: `${line}L100,22L0,22Z` };
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

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A qué tarjeta lleva una flecha, por geometría: las secciones y una destacada que ocupa dos
 * columnas no rompen la cuadrícula. `←`/`→` van a la vecina de la misma fila (o a la anterior o
 * siguiente en orden, al llegar al borde); `↑`/`↓`, a la fila de arriba o de abajo, la más cercana
 * en horizontal. Sin cajas (todas en cero) cada flecha avanza o retrocede una. `null`: la tecla no
 * es de la cuadrícula.
 */
export function moveIndex(boxes: readonly Box[], from: number, key: string): number | null {
  const n = boxes.length;
  if (n === 0 || from < 0 || from >= n) return null;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  const step = key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;
  if (!step) return null;
  const clampTo = (i: number) => Math.max(0, Math.min(n - 1, i));
  const cur = boxes[from];
  if (boxes.every((b) => !b.w && !b.h)) return clampTo(from + step);
  const cx = (b: Box) => b.x + b.w / 2;
  const cy = (b: Box) => b.y + b.h / 2;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    let best = -1;
    let bestD = Infinity;
    boxes.forEach((b, i) => {
      if (i === from) return;
      const sameRow = b.y < cur.y + cur.h - 1 && b.y + b.h > cur.y + 1;
      const d = (cx(b) - cx(cur)) * step;
      if (sameRow && d > 0 && d < bestD) {
        best = i;
        bestD = d;
      }
    });
    return best >= 0 ? best : clampTo(from + step);
  }

  // Arriba / abajo: la fila más próxima en esa dirección y, en ella, la tarjeta más cercana en x.
  let rowY = step > 0 ? Infinity : -Infinity;
  boxes.forEach((b, i) => {
    if (i === from) return;
    const ahead = step > 0 ? b.y >= cur.y + cur.h - 1 : b.y + b.h <= cur.y + 1;
    if (ahead && (step > 0 ? b.y < rowY : b.y > rowY)) rowY = b.y;
  });
  if (!Number.isFinite(rowY)) return from;
  let best = from;
  let bestD = Infinity;
  boxes.forEach((b, i) => {
    if (Math.abs(b.y - rowY) > 1) return;
    const d = Math.abs(cx(b) - cx(cur)) + Math.abs(cy(b) - cy(cur)) * 1e-3;
    if (d < bestD) {
      best = i;
      bestD = d;
    }
  });
  return best;
}
