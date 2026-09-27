/**
 * STUB: lo implementa otro agente en paralelo (la franja «Estás viendo como…»). Solo existe para que
 * `<nx-account>` compile; al unir se reemplaza por el módulo real con estas mismas firmas.
 */
export interface ViewAsUser { id: string; name: string; role?: string; avatar?: string }
export interface ViewAsLabels { banner: string; exit: string }
/** Muestra la franja «Estás viendo como {name} ({role}) · Salir». Devuelve la función que la quita. Una sola franja a la vez. */
export function showViewAsBanner(user: ViewAsUser, opts: { labels?: Partial<ViewAsLabels>; onExit: () => void }): () => void {
  void user;
  void opts;
  throw new Error("stub");
}
