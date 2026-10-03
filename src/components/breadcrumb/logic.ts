/** `<nx-breadcrumb>`: lo que no toca el DOM (se prueba sin navegador). */
import { safeHref } from "../../core/dom";
import type { BreadcrumbItem } from "./types";

/** Con más hijos que esto, el menú de un separador trae buscador. */
export const SEARCH_AT = 7;

/** La clave de un nivel: `id`, o `href`, o `label`. */
export const itemKey = (it: BreadcrumbItem): string => it.id ?? it.href ?? it.label;

/**
 * Niveles válidos de un payload: con `label` de texto (un número, como un año, pasa a texto);
 * `href` solo si es seguro (`safeHref`). Los `children` se limpian un nivel: el menú no usa los de
 * más abajo.
 */
export function cleanItems(v: unknown, deep = true): BreadcrumbItem[] {
  if (!Array.isArray(v)) return [];
  const out: BreadcrumbItem[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const label = typeof raw.label === "number" && Number.isFinite(raw.label) ? String(raw.label) : raw.label;
    if (typeof label !== "string") continue;
    const it: BreadcrumbItem = { label };
    if (raw.id != null) it.id = String(raw.id);
    const href = safeHref(raw.href);
    if (href) it.href = href;
    if (typeof raw.icon === "string") it.icon = raw.icon;
    if (typeof raw.expandable === "boolean") it.expandable = raw.expandable;
    if (deep && Array.isArray(raw.children)) it.children = cleanItems(raw.children, false);
    out.push(it);
  }
  return out;
}

/**
 * Cuántos niveles del medio esconder para que la ruta quepa en `avail`. Con `k`, los niveles
 * `1…k` pasan al «…»: los `1…k-1` enteros y del `k` solo el nombre (su separador queda después del
 * «…», porque abre los hermanos del nivel que sigue). El primero y los dos últimos no se esconden.
 *
 * @param item ancho de cada nivel (nombre + separador)
 * @param name ancho del nombre de cada nivel
 * @param more ancho del «…»
 * @returns el `k` más chico que alcanza, o el máximo si ninguno alcanza (el último se corta).
 */
export function collapseCount(item: readonly number[], name: readonly number[], more: number, avail: number): number {
  const total = item.reduce((a, b) => a + b, 0);
  if (total <= avail + 0.5) return 0;
  const max = Math.max(0, item.length - 3);
  let gone = 0; // los niveles 1…k-1, enteros
  for (let k = 1; k <= max; k++) {
    if (total - gone - name[k] + more <= avail + 0.5) return k;
    gone += item[k];
  }
  return max;
}
