/** Lógica pura de `<nx-org>`: índices del árbol, cadenas, caminos y cifras. Sin DOM. */
import { foldText } from "../../core/text";
import type { OrgMetric, OrgPerson, OrgUnit } from "./types";

/** Un árbol con ciclo (A jefe de B y B jefe de A) no puede colgar el componente: tope de niveles. */
const MAX_DEPTH = 64;

export interface OrgIndex {
  units: Map<string, OrgUnit>;
  people: Map<string, OrgPerson>;
  /** Hijos de cada unidad (`""` = raíces), en el orden en que llegaron. */
  childUnits: Map<string, OrgUnit[]>;
  /** Personas directamente en cada unidad. */
  members: Map<string, OrgPerson[]>;
  /** Reportes directos de cada persona (de las cargadas). */
  reports: Map<string, OrgPerson[]>;
}

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** Una unidad válida (con `id` y `name`), con los ids como texto. */
export function cleanUnit(u: unknown): OrgUnit | null {
  if (!u || typeof u !== "object") return null;
  const o = u as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  return { ...(o as unknown as OrgUnit), id, name: str(o.name) || id, parent: str(o.parent) || null, leader: str(o.leader) || undefined };
}

/** Una persona válida, con los ids como texto. */
export function cleanPerson(p: unknown): OrgPerson | null {
  if (!p || typeof p !== "object") return null;
  const o = p as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  const boss = str(o.boss);
  return { ...(o as unknown as OrgPerson), id, name: str(o.name) || id, unit: str(o.unit) || null, boss: boss && boss !== id ? boss : null };
}

export function buildIndex(units: readonly OrgUnit[], people: readonly OrgPerson[]): OrgIndex {
  const um = new Map<string, OrgUnit>();
  for (const u of units) um.set(u.id, u);
  const pm = new Map<string, OrgPerson>();
  for (const p of people) pm.set(p.id, p);
  const childUnits = new Map<string, OrgUnit[]>();
  for (const u of um.values()) {
    // Un padre que no existe (o la propia unidad) la vuelve raíz.
    const parent = u.parent && u.parent !== u.id && um.has(u.parent) ? u.parent : "";
    const list = childUnits.get(parent);
    if (list) list.push(u);
    else childUnits.set(parent, [u]);
  }
  const members = new Map<string, OrgPerson[]>();
  const reports = new Map<string, OrgPerson[]>();
  for (const p of pm.values()) {
    if (p.unit) {
      const list = members.get(p.unit);
      if (list) list.push(p);
      else members.set(p.unit, [p]);
    }
    if (p.boss) {
      const list = reports.get(p.boss);
      if (list) list.push(p);
      else reports.set(p.boss, [p]);
    }
  }
  return { units: um, people: pm, childUnits, members, reports };
}

/** Las unidades desde la raíz hasta `id` (incluida). */
export function unitPath(ix: OrgIndex, id: string | null | undefined): OrgUnit[] {
  const out: OrgUnit[] = [];
  const seen = new Set<string>();
  let u = id ? ix.units.get(id) : undefined;
  while (u && !seen.has(u.id) && out.length < MAX_DEPTH) {
    seen.add(u.id);
    out.unshift(u);
    u = u.parent ? ix.units.get(u.parent) : undefined;
  }
  return out;
}

/** Los jefes de `id`, del inmediato hacia arriba (sin la persona). Se corta en un ciclo o en un
 *  jefe que no está cargado. */
export function chainOf(ix: OrgIndex, id: string | null | undefined): OrgPerson[] {
  const out: OrgPerson[] = [];
  const seen = new Set<string>(id ? [id] : []);
  let boss = id ? ix.people.get(id)?.boss : undefined;
  while (boss && !seen.has(boss) && out.length < MAX_DEPTH) {
    const p = ix.people.get(boss);
    if (!p) break;
    seen.add(boss);
    out.push(p);
    boss = p.boss ?? undefined;
  }
  return out;
}

/** Personas con el mismo jefe que `id` (sin ella). */
export function peersOf(ix: OrgIndex, id: string): OrgPerson[] {
  const boss = ix.people.get(id)?.boss;
  if (!boss) return [];
  return (ix.reports.get(boss) ?? []).filter((p) => p.id !== id);
}

/** Por nombre, con tildes y mayúsculas iguales. */
export function byName(a: OrgPerson | OrgUnit, b: OrgPerson | OrgUnit): number {
  return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
}

/** El equipo directo de `id`, los que tienen gente a cargo primero y luego por nombre. */
export function reportsOf(ix: OrgIndex, id: string): OrgPerson[] {
  const list = [...(ix.reports.get(id) ?? [])];
  const weight = (p: OrgPerson) => teamSize(ix, p);
  return list.sort((a, b) => weight(b) - weight(a) || byName(a, b));
}

/** Cuántas personas tiene a cargo (todos los niveles): `team`, o lo que se ve cargado. */
export function teamSize(ix: OrgIndex, p: OrgPerson): number {
  if (typeof p.team === "number" && p.team >= 0) return p.team;
  let n = 0;
  const stack = [...(ix.reports.get(p.id) ?? [])];
  const seen = new Set<string>([p.id]);
  while (stack.length) {
    const q = stack.pop()!;
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    n++;
    stack.push(...(ix.reports.get(q.id) ?? []));
  }
  return n;
}

/** Reportes directos: los cargados, o `reports` si dice más. */
export function directCount(ix: OrgIndex, p: OrgPerson): number {
  const loaded = ix.reports.get(p.id)?.length ?? 0;
  return Math.max(loaded, typeof p.reports === "number" ? p.reports : 0);
}

/** Personas en la unidad y sus subunidades: `count`, o las cargadas. */
export function unitCount(ix: OrgIndex, u: OrgUnit, seen = new Set<string>()): number {
  if (typeof u.count === "number" && u.count >= 0) return u.count;
  if (seen.has(u.id)) return 0;
  seen.add(u.id);
  let n = ix.members.get(u.id)?.length ?? 0;
  for (const c of ix.childUnits.get(u.id) ?? []) n += unitCount(ix, c, seen);
  return n;
}

/** Personas directamente en la unidad: `direct`, o las cargadas. */
export function directMembers(ix: OrgIndex, u: OrgUnit): number {
  if (typeof u.direct === "number" && u.direct >= 0) return u.direct;
  return ix.members.get(u.id)?.length ?? 0;
}

/**
 * El camino entre `from` y `to` por la línea de mando: el jefe común más cercano y cuántos niveles
 * sube cada uno hasta él. `null` si no se conocen sus cadenas o no comparten jefe.
 */
export function commonBoss(ix: OrgIndex, from: string, to: string): { boss: OrgPerson | null; up: number; down: number } | null {
  if (from === to) return { boss: ix.people.get(from) ?? null, up: 0, down: 0 };
  const a = [ix.people.get(from), ...chainOf(ix, from)].filter(Boolean) as OrgPerson[];
  const b = [ix.people.get(to), ...chainOf(ix, to)].filter(Boolean) as OrgPerson[];
  const posB = new Map(b.map((p, i) => [p.id, i]));
  for (let i = 0; i < a.length; i++) {
    const j = posB.get(a[i].id);
    if (j !== undefined) return { boss: a[i], up: i, down: j };
  }
  return null;
}

/** Si la persona coincide con lo buscado: nombre, cargo y correo, sin tildes; todas las palabras. */
export function matchPerson(p: OrgPerson, q: string): boolean {
  const words = foldText(q).split(/\s+/).filter(Boolean);
  if (!words.length) return false;
  const hay = foldText(`${p.name} ${p.title ?? ""} ${p.email ?? ""}`);
  return words.every((w) => hay.includes(w));
}

/** La intensidad (0–1) de una cifra entre unidades hermanas; con `per: "count"`, por persona. */
export function metricLevels(ix: OrgIndex, units: readonly OrgUnit[], metric: OrgMetric | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (!metric) return out;
  const raw = units.map((u) => {
    const v = u.metrics?.[metric.key];
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    if (metric.per === "count") {
      const n = unitCount(ix, u);
      return n ? v / n : null;
    }
    return v;
  });
  const max = Math.max(0, ...raw.map((v) => v ?? 0));
  units.forEach((u, i) => out.set(u.id, max > 0 && raw[i] !== null ? Math.max(0, raw[i]!) / max : 0));
  return out;
}

/** Hasta dos niveles de la unidad, del más amplio al más fino: «Agrovid · Finca La Esperanza». */
export function unitLine(ix: OrgIndex, unitId: string | null | undefined): string {
  return unitPath(ix, unitId)
    .slice(-2)
    .map((u) => u.name)
    .join(" · ");
}
