/** `<nx-keytips>`: tipos. */

/** Una acción por asignar (para `assignKeytips`). */
export interface KeytipInput {
  /** Nombre accesible («Guardar», «Enviar al cliente»): de ahí sale la letra. */
  name: string;
  /** El código del autor (`data-keytip="G"`). */
  forced?: string | null;
  /** El código que tuvo en la apertura anterior. */
  prev?: string | null;
}

/** Una acción visible con su código. */
export interface KeytipAssignment {
  /** «G», o «GU» con dos letras. */
  key: string;
  name: string;
  element: HTMLElement;
}

/** `nx-keytip`: se pulsó el código de una acción (cancelable: no se ejecuta). */
export interface KeytipDetail {
  key: string;
  /** El elemento que tenía la letra. */
  target: HTMLElement;
  name: string;
}

export interface KeytipsLabels {
  /** Lo que se anuncia al mostrar los atajos. */
  open: string;
}
