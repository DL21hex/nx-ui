/** `<nx-tabs>`: tipos. */

/** Una pestaña. Si no se pasa `tabs`, salen de los hijos con `data-tab`. */
export interface TabItem {
  /** La clave (`value` del componente). */
  value: string;
  label: string;
  /** Un contador al lado («Documentos 12»). */
  count?: number;
  /** Errores de un formulario en esa pestaña: un contador en rojo (gana sobre `count`). */
  errors?: number;
  disabled?: boolean;
}

export interface TabChangeDetail {
  value: string;
  previous: string | null;
}

export interface TabsLabels {
  /** Para el lector de pantalla, en lugar del contador de errores: «{n} por corregir». */
  errors: string;
}
