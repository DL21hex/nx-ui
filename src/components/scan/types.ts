/**
 * `<nx-scan>`: tipos. Lo que entra es JSON (BDUI): el modo, los formatos, la URL que describe un
 * producto y, en el conteo, las líneas que ya se esperan. Lo que sale son eventos con el código y
 * la lista contada.
 */

/** `single`: una lectura y se detiene (buscar un producto). `count`: cada lectura suma a una lista. */
export type ScanMode = "single" | "count";

/** De dónde salió una lectura. */
export type ScanVia = "camera" | "photo" | "manual" | "wedge" | "api";

/** Dónde escucha la pistola lectora USB (que «teclea» el código y un Enter). */
export type ScanWedge =
  /** En toda la página, aunque el foco no esté en el campo (por defecto). Nunca en otros campos. */
  | "page"
  /** Solo cuando el foco está en el campo del código. */
  | "field"
  /** No se detecta (el campo sigue funcionando como entrada manual). */
  | "off";

/** En qué está la cámara. */
export type ScanState =
  /** Apagada, lista para empezar. */
  | "idle"
  /** Pidiendo permiso o abriendo el stream. */
  | "starting"
  /** Mirando. */
  | "live"
  /** Apagada porque el componente no se ve (otra pestaña, fuera de la pantalla); vuelve sola. */
  | "paused"
  /** Modo único: ya leyó y se detuvo. */
  | "done"
  /** No se puede usar (ver `ScanProblem`): queda la entrada manual, la pistola y la foto. */
  | "unavailable";

/** Por qué no hay cámara. */
export type ScanProblem =
  /** El navegador no tiene `BarcodeDetector` (Firefox, Safari de escritorio, Chrome en Linux/Windows). */
  | "nodetector"
  /** No hay `getUserMedia` o ninguna cámara. */
  | "nocamera"
  /** La página no es segura (la cámara exige HTTPS). */
  | "insecure"
  /** La persona (o la política del sitio) negó el permiso. */
  | "denied"
  /** Otra aplicación tiene la cámara. */
  | "busy"
  /** Cualquier otro fallo al abrir la cámara. */
  | "failed";

/** Lo que devuelve `source` para un código: `{code, name, unit?, expected?}`. */
export interface ScanProduct {
  code: string;
  /** «Lámina HR 3 mm». */
  name: string;
  /** «und», «kg», «m»: va junto a la cantidad. */
  unit?: string;
  /** Cuántas se esperan (la línea de la orden): con ella se marcan faltantes y sobrantes. */
  expected?: number;
}

/** Una línea del conteo, agrupada por código. */
export interface ScanItem {
  code: string;
  /** Cantidad contada (editable; puede tener decimales si la unidad es kg, m…). */
  qty: number;
  name?: string;
  unit?: string;
  expected?: number;
  /** Formato de la última lectura (`ean_13`, `qr_code`…), si se sabe. */
  format?: string;
  /** `true` si `source` dijo que el código no existe. */
  unknown?: boolean;
}

/** Cómo va una línea contra lo esperado. */
export type ScanItemStatus = "none" | "short" | "ok" | "over";

/** Los totales del pie. `expected` es la suma de lo esperado de las líneas que lo traen. */
export interface ScanTotals {
  /** Líneas (códigos distintos). */
  codes: number;
  /** Unidades contadas. */
  units: number;
  expected: number;
  /** Unidades que faltan y que sobran, sumando línea a línea. */
  missing: number;
  extra: number;
  /** Líneas con faltantes y con sobrantes. */
  shortLines: number;
  overLines: number;
}

/** `nx-scan`: una lectura (cancelable: en el conteo, no se suma). */
export interface ScanDetail {
  code: string;
  /** `ean_13`, `code_128`, `qr_code`… (el de `BarcodeDetector`), o el que se deduce del texto; `""` si no se sabe. */
  format: string;
  via: ScanVia;
}

/** `nx-scan-count`: la lista después de cada cambio (lectura, edición, deshacer, vaciar). */
export interface ScanCountDetail {
  items: ScanItem[];
}

export interface ScanLabels {
  /** Nombre de la región. */
  region: string;
  start: string;
  hint: string;
  starting: string;
  stop: string;
  torch: string;
  switchCamera: string;
  sound: string;
  paused: string;
  aim: string;
  /** Etiqueta del campo manual. */
  manual: string;
  placeholder: string;
  /** El botón del campo en el conteo («Agregar») y en el modo único («Buscar»). */
  add: string;
  find: string;
  photo: string;
  photoBusy: string;
  photoNone: string;
  wedge: string;
  nodetector: string;
  nocamera: string;
  insecure: string;
  denied: string;
  busy: string;
  failed: string;
  retry: string;
  /** Anuncio del modo único: «Código leído: {code}». */
  read: string;
  /** Anuncio del conteo: «{name}: {qty}» y «{name}: {qty} de {expected}». */
  counted: string;
  countedOf: string;
  looking: string;
  unknown: string;
  /** «esperadas {n}» · «contadas {n}» */
  expected: string;
  qty: string;
  /** «Faltan {n}» · «Sobran {n}» · «Completo» */
  short: string;
  over: string;
  complete: string;
  /** Botones de cada línea: «Restar uno a {name}», «Sumar uno a {name}», «Cantidad de {name}». */
  dec: string;
  inc: string;
  qtyOf: string;
  list: string;
  empty: string;
  /** Pie: «{n} productos» · «{n} unidades» · «faltan {n}» · «sobran {n}». */
  codes: string;
  units: string;
  missing: string;
  extra: string;
  /** Pie, cuando todo lo esperado está contado y no sobra nada: «Todo cuadra». */
  done: string;
  clear: string;
  cleared: string;
  /** «{name}: se quitó del conteo». */
  removed: string;
  result: string;
  again: string;
}
