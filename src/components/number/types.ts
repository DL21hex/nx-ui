/**
 * `<nx-number>`: tipos. El valor es un `number` (o `null`, vacío); todo lo demás —formato, moneda,
 * límites, textos— es JSON o atributos, como el resto de la librería (BDUI).
 */

/** Cómo se muestra el valor al salir del campo. */
export type NumberFormat = "number" | "money" | "percent";

/** Dónde se alinea el texto. Por defecto `end` para montos y porcentajes, `start` para números. */
export type NumberAlign = "start" | "center" | "end";

/**
 * Por qué no se entiende lo que se escribió. `evaluate()` devuelve el código y el elemento lo
 * convierte en texto con `labels`.
 */
export type NumberErrorCode =
  /** Una palabra o un signo que no es de un número («no entiendo "x"»). */
  | "unknown"
  /** Falta un número: «=450*», «=(» o un operador suelto. */
  | "incomplete"
  /** Un paréntesis sin cerrar o uno que sobra. */
  | "paren"
  /** «=10/0». */
  | "divZero"
  /** «+15%» o «*2» sin un valor anterior sobre el cual calcular. */
  | "noBase"
  /** «450*3» sin «=»: hay que decir que es una cuenta. */
  | "needEquals"
  /** Más de mil billones (se pierde precisión). */
  | "tooBig";

/** Lo que entendió `evaluate()`. */
export type NumberReading =
  | {
      ok: true;
      /** `null` si no se escribió nada. */
      value: number | null;
      /** `true` si hubo una cuenta, un sufijo («2,5M»), un «%» o un negativo contable: vale la pena mostrar el resultado. */
      calc: boolean;
    }
  | { ok: false; error: NumberErrorCode; token?: string };

/** `{value, text}` de `nx-change`: el número y cómo quedó escrito («$ 1.450.000»). */
export interface NumberChangeDetail {
  value: number | null;
  text: string;
}

/** Monedas que `numberToWords()` sabe nombrar. */
export interface WordsCurrency {
  /** «peso», «dólar». */
  one: string;
  /** «pesos», «dólares». */
  many: string;
  /** Lo que va al final: «m/cte» (moneda corriente) en los cheques colombianos. */
  tail?: string;
}

export interface NumberLabels {
  /** «no entiendo "{token}"» */
  unknown: string;
  incomplete: string;
  paren: string;
  divZero: string;
  noBase: string;
  needEquals: string;
  tooBig: string;
  /** «El mínimo es {min}» (al recortar). */
  min: string;
  /** «El máximo es {max}» (al recortar). */
  max: string;
  /** Mensaje de validez con `required` y el campo vacío. */
  required: string;
  /** Prefijo de la vista previa («=»). */
  equals: string;
  /** Lo que antecede al monto en letras (lectores de pantalla): «En letras». */
  words: string;
}
