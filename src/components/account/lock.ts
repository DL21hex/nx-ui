/**
 * STUB: lo implementa otro agente en paralelo (`nxLock`, pantalla de bloqueo). Solo existe para que
 * `<nx-account>` compile; al unir se reemplaza por el módulo real con estas mismas firmas.
 */
export interface LockLabels { title: string; password: string; unlock: string; wrong: string; logout: string; locked: string }
export interface LockOptions {
  user: { name: string; email?: string; avatar?: string; initials?: string };
  /** POST {password} → 200 desbloquea, 401 clave mala. Mismo origen (safeEndpoint). */
  endpoint?: string;
  /** Alternativa a `endpoint`: la app verifica. */
  verify?: (password: string) => Promise<boolean>;
  labels?: Partial<LockLabels>;
  locale?: string;
  /** «Cerrar sesión» desde la pantalla de bloqueo. */
  onLogout?: () => void;
}
/** Bloquea la pantalla; la promesa se resuelve al desbloquear. Si ya está bloqueada, devuelve la misma promesa. */
export function nxLock(opts: LockOptions): Promise<void> {
  void opts;
  throw new Error("stub");
}
export function isLocked(): boolean {
  throw new Error("stub");
}
