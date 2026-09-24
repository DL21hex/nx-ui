export type KeyStep = number | "select" | "close" | null;

/**
 * Qué hace una tecla en una lista con resaltado (panel del sidemenu, opciones del select). Patrón
 * «menu button» de WAI-ARIA: Tab no se atrapa, cierra y sigue su camino.
 * @returns el índice a resaltar, `"select"`, `"close"`, o `null` si la tecla no es de la lista.
 */
export function listKeyStep(key: string, index: number, count: number): KeyStep {
  switch (key) {
    case "ArrowDown":
      return count === 0 ? null : (index + 1) % count;
    case "ArrowUp":
      // Sin resaltado, «arriba» empieza por el final.
      return count === 0 ? null : index < 0 ? count - 1 : (index - 1 + count) % count;
    case "Home":
      return count === 0 ? null : 0;
    case "End":
      return count === 0 ? null : count - 1;
    case "Enter":
      return count === 0 || index < 0 ? null : "select";
    case "Escape":
    case "Tab":
      return "close";
    default:
      return null;
  }
}
