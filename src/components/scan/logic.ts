/**
 * Lógica pura de `<nx-scan>`: validar datos, agrupar y contar lecturas, faltantes y sobrantes,
 * reconocer la ráfaga de una pistola lectora por los tiempos entre teclas, y ubicar en pantalla el
 * código que vio la cámara. Sin DOM.
 */
import type { ScanItem, ScanItemStatus, ScanMode, ScanProduct, ScanTotals, ScanWedge } from "./types";

/** Los formatos que se piden a `BarcodeDetector` si no se dice otra cosa (los de inventario y el QR). */
export const DEFAULT_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code", "data_matrix"];

/** Los formatos de `BarcodeDetector`, con el nombre con que se leen. */
const FORMAT_NAMES: Record<string, string> = {
  aztec: "Aztec",
  code_128: "Code 128",
  code_39: "Code 39",
  code_93: "Code 93",
  codabar: "Codabar",
  data_matrix: "Data Matrix",
  ean_13: "EAN-13",
  ean_8: "EAN-8",
  itf: "ITF",
  pdf417: "PDF417",
  qr_code: "QR",
  upc_a: "UPC-A",
  upc_e: "UPC-E",
};

/** Un código no pasa de esto (un QR puede traer una URL larga; más que esto es basura). */
const MAX_CODE = 512;
/** Las cantidades se guardan con hasta 3 decimales (kg, m). */
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** «{name}: {qty}» con los valores. Lo que no está en `vars` queda como estaba. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function cleanMode(v: unknown): ScanMode {
  return v === "count" ? "count" : "single";
}

export function cleanWedge(v: unknown): ScanWedge {
  return v === "field" || v === "off" ? v : "page";
}

/**
 * Los formatos pedidos: un arreglo, un JSON («["ean_13","qr_code"]») o una lista separada por comas
 * o espacios («ean_13, code_128»). Se quedan los que existen, sin repetir; si no queda ninguno, los
 * de siempre (`DEFAULT_FORMATS`).
 */
export function cleanFormats(v: unknown): string[] {
  let list: unknown = v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("[")) {
      try {
        list = JSON.parse(t);
      } catch {
        list = [];
      }
    } else list = t.split(/[\s,;]+/);
  }
  if (!Array.isArray(list)) return [...DEFAULT_FORMATS];
  const out = [...new Set(list.map((f) => (typeof f === "string" ? f.trim().toLowerCase().replace(/-/g, "_") : "")).filter((f) => f in FORMAT_NAMES))];
  return out.length ? out : [...DEFAULT_FORMATS];
}

/** «EAN-13», «QR», «Code 128»; un formato desconocido tal cual, y `""` si no hay. */
export function formatName(format: string | undefined): string {
  return format ? (FORMAT_NAMES[format] ?? format) : "";
}

/**
 * El código limpio: sin espacios ni saltos alrededor (las pistolas mandan `\r`, `\n` o `\t` al final)
 * y sin caracteres de control, salvo el separador de GS1 (`\x1d`) que es parte del dato. `""` si no
 * queda nada o si es demasiado largo.
 */
export function cleanCode(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  // eslint-disable-next-line no-control-regex
  const t = String(v).replace(/[\u0000-\u001c\u001e\u001f\u007f]/g, "").trim();
  return t.length > MAX_CODE ? "" : t;
}

/** Dígito de control GTIN (EAN-8, UPC-A, EAN-13, GTIN-14): módulo 10 con pesos 3 y 1 desde la derecha. */
export function gtinValid(code: string): boolean {
  if (!/^\d{8}$|^\d{12,14}$/.test(code)) return false;
  let sum = 0;
  for (let i = code.length - 2, w = 3; i >= 0; i--, w = 4 - w) sum += Number(code[i]) * w;
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

/** El formato que se deduce de un código escrito o de la pistola: EAN-13, EAN-8 o UPC-A si el dígito
 *  de control cuadra; si no, `""` (no se adivina). */
export function guessFormat(code: string): string {
  if (!gtinValid(code)) return "";
  return code.length === 13 ? "ean_13" : code.length === 8 ? "ean_8" : code.length === 12 ? "upc_a" : "";
}

/**
 * Lo que se escribe en el campo: un código, o un código con cantidad («12*7701234567890»,
 * «7701234567890*12», con `*` o `×`). La cantidad entiende coma o punto decimal. `null` si no hay código.
 */
export function parseEntry(text: string): { code: string; qty: number } | null {
  const t = text.trim();
  const qty = (s: string) => Number(s.replace(",", "."));
  // La cantidad es corta (hasta 5 cifras): así «7702001043382×12» no se lee al revés.
  let m = /^(\d{1,5}(?:[.,]\d{1,3})?)\s*[*×]\s*(\S.*)$/.exec(t);
  if (m && qty(m[1]) > 0) return { code: cleanCode(m[2]), qty: round3(qty(m[1])) };
  m = /^(\S.*?)\s*[*×]\s*(\d{1,5}(?:[.,]\d{1,3})?)$/.exec(t);
  if (m && qty(m[2]) > 0) return { code: cleanCode(m[1]), qty: round3(qty(m[2])) };
  const code = cleanCode(t);
  return code ? { code, qty: 1 } : null;
}

/** Una cantidad válida (≥ 0, hasta 3 decimales), o `null`. */
export function cleanQty(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? round3(n) : null;
}

/** Lo que respondió `source`: `{code, name, unit?, expected?}` validado, o `null`. Si no trae `code`, es el pedido. */
export function cleanProduct(v: unknown, code?: string): ScanProduct | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const c = cleanCode(o.code) || code || "";
  const name = str(o.name);
  if (!c || !name) return null;
  const expected = num(o.expected);
  return { code: c, name, unit: str(o.unit), expected: expected !== undefined && expected >= 0 ? round3(expected) : undefined };
}

/**
 * Las líneas del conteo, validadas: con `code`, cantidad ≥ 0 (sin ella, 0: una línea esperada que
 * aún no se cuenta) y lo demás si es del tipo correcto. Un código repetido se suma a la primera.
 */
export function cleanItems(v: unknown): ScanItem[] {
  if (!Array.isArray(v)) return [];
  const out: ScanItem[] = [];
  const at = new Map<string, number>();
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const code = cleanCode(o.code);
    if (!code) continue;
    const qty = cleanQty(o.qty) ?? 0;
    const i = at.get(code);
    if (i !== undefined) {
      out[i] = { ...out[i], qty: round3(out[i].qty + qty) };
      continue;
    }
    const expected = cleanQty(o.expected);
    const item: ScanItem = { code, qty };
    if (str(o.name)) item.name = str(o.name);
    if (str(o.unit)) item.unit = str(o.unit);
    if (expected !== null) item.expected = expected;
    if (str(o.format)) item.format = str(o.format);
    if (o.unknown === true) item.unknown = true;
    at.set(code, out.length);
    out.push(item);
  }
  return out;
}

/**
 * Suma una lectura. Un código nuevo entra ARRIBA (lo último leído se ve primero); uno que ya estaba
 * se queda en su lugar y suma. Devuelve la lista nueva (no toca la anterior) y la línea que cambió.
 */
export function addRead(items: readonly ScanItem[], code: string, qty = 1, format = ""): { items: ScanItem[]; item: ScanItem; created: boolean } {
  const i = items.findIndex((it) => it.code === code);
  if (i >= 0) {
    const item: ScanItem = { ...items[i], qty: round3(items[i].qty + qty) };
    if (format) item.format = format;
    const next = items.slice();
    next[i] = item;
    return { items: next, item, created: false };
  }
  const item: ScanItem = { code, qty: round3(qty) };
  if (format) item.format = format;
  return { items: [item, ...items], item, created: true };
}

/**
 * Cambia la cantidad de una línea. En 0, la línea se va, salvo que tenga `expected` (entonces se
 * queda en 0 y se ve como faltante). Un código que no está no cambia nada.
 */
export function setQty(items: readonly ScanItem[], code: string, qty: number): ScanItem[] {
  const q = cleanQty(qty) ?? 0;
  const i = items.findIndex((it) => it.code === code);
  if (i < 0) return items.slice();
  if (q === 0 && items[i].expected === undefined) return items.filter((_, j) => j !== i);
  const next = items.slice();
  next[i] = { ...items[i], qty: q };
  return next;
}

/** Completa una línea con lo que dijo `source` (sin pisar lo que ya traía) o la marca sin registrar (`null`). */
export function mergeProduct(items: readonly ScanItem[], code: string, product: ScanProduct | null): ScanItem[] {
  return items.map((it) => {
    if (it.code !== code) return it;
    if (!product) return it.name ? it : { ...it, unknown: true };
    const out: ScanItem = { ...it, name: it.name ?? product.name };
    delete out.unknown;
    if (out.unit === undefined && product.unit) out.unit = product.unit;
    if (out.expected === undefined && product.expected !== undefined) out.expected = product.expected;
    return out;
  });
}

/** Cómo va una línea: sin esperado (`none`), faltan, completa o sobran; `diff` es contado − esperado. */
export function itemStatus(item: ScanItem): { status: ScanItemStatus; diff: number } {
  if (item.expected === undefined) return { status: "none", diff: 0 };
  const diff = round3(item.qty - item.expected);
  return { status: diff < 0 ? "short" : diff > 0 ? "over" : "ok", diff };
}

/** Los totales del pie. */
export function totals(items: readonly ScanItem[]): ScanTotals {
  const t: ScanTotals = { codes: items.length, units: 0, expected: 0, missing: 0, extra: 0, shortLines: 0, overLines: 0 };
  for (const it of items) {
    t.units += it.qty;
    if (it.expected === undefined) continue;
    t.expected += it.expected;
    const { status, diff } = itemStatus(it);
    if (status === "short") (t.missing -= diff), t.shortLines++;
    if (status === "over") (t.extra += diff), t.overLines++;
  }
  t.units = round3(t.units);
  t.expected = round3(t.expected);
  t.missing = round3(t.missing);
  t.extra = round3(t.extra);
  return t;
}

/** Lo que se tarda en aceptar otra vez el MISMO código de la cámara. */
export const REPEAT_MS = 1500;
/** Y además tiene que haber salido del cuadro este tiempo: sostenerlo frente a la cámara no lo cuenta dos veces. */
export const GONE_MS = 400;

/** La última lectura aceptada de la cámara: el código, cuándo se aceptó y cuándo se vio por última vez. */
export interface CameraRead {
  code: string;
  at: number;
  seen: number;
}

/**
 * ¿Es la misma lectura de hace un momento? La cámara ve el código muchas veces por segundo: el mismo
 * código vuelve a contar después de `REPEAT_MS` desde que se aceptó, y solo si dejó de verse al menos
 * `GONE_MS` (pasar la caja siguiente sí cuenta; dejar la misma quieta, no).
 */
export function isRepeat(last: CameraRead | null, code: string, at: number, windowMs = REPEAT_MS, goneMs = GONE_MS): boolean {
  return !!last && last.code === code && (at - last.at < windowMs || at - last.seen < goneMs);
}

// ---------------------------------------------------------------- pistola lectora (teclado)

/**
 * Tiempos de una pistola lectora: «teclea» cada carácter a menos de `maxGap` ms del anterior (las USB
 * van a 5–20 ms, las Bluetooth hasta ~40) y cierra con Enter. Una persona que escribe rapidísimo
 * deja 80–150 ms entre teclas: aunque dos teclas salgan casi juntas (al solapar dedos), el promedio
 * de toda la ráfaga no baja de `avgGap`.
 */
export const WEDGE = { maxGap: 60, avgGap: 40, minLength: 4 };

export interface WedgeState {
  buf: string;
  first: number;
  last: number;
}
export const WEDGE_EMPTY: WedgeState = { buf: "", first: 0, last: 0 };

/**
 * Una tecla más (su `key` y el momento en ms). Devuelve el estado nuevo y, si la tecla es el Enter
 * que cierra una ráfaga de pistola, el código. Un carácter que llega tarde empieza otra ráfaga; una
 * tecla que no escribe (flechas, Backspace) la corta; Mayús y compañía no cuentan.
 */
export function wedgeKey(s: WedgeState, key: string, at: number, t = WEDGE): { state: WedgeState; code: string | null } {
  if (key.length === 1) {
    if (s.buf && at - s.last <= t.maxGap) return { state: { buf: s.buf + key, first: s.first, last: at }, code: null };
    return { state: { buf: key, first: at, last: at }, code: null };
  }
  if (key === "Enter") return { state: WEDGE_EMPTY, code: isBurst(s, at, t) ? cleanCode(s.buf) || null : null };
  if (/^(Shift|Control|Alt|Meta|AltGraph|CapsLock|Unidentified|Dead)$/.test(key)) return { state: s, code: null };
  return { state: WEDGE_EMPTY, code: null };
}

/** ¿Lo que hay en el búfer (cerrado con un Enter en `at`) es de una pistola? */
export function isBurst(s: WedgeState, at: number, t = WEDGE): boolean {
  const n = s.buf.length;
  if (n < t.minLength || at - s.last > t.maxGap * 2) return false;
  return (s.last - s.first) / (n - 1) <= t.avgGap;
}

// ---------------------------------------------------------------- dónde está el código en pantalla

/**
 * El recuadro de `BarcodeDetector` (en píxeles del video) en píxeles del visor, que muestra el
 * video con `object-fit: cover` (escalado para llenar y centrado, lo que sobra se recorta).
 */
export function mapBox(box: { x: number; y: number; width: number; height: number }, video: { width: number; height: number }, view: { width: number; height: number }): { x: number; y: number; width: number; height: number } | null {
  if (!video.width || !video.height || !view.width || !view.height) return null;
  const k = Math.max(view.width / video.width, view.height / video.height);
  const dx = (view.width - video.width * k) / 2;
  const dy = (view.height - video.height * k) / 2;
  return { x: box.x * k + dx, y: box.y * k + dy, width: box.width * k, height: box.height * k };
}
