/**
 * Lógica pura de `<nx-paste-fill>`: sacar datos de un texto libre (un correo, un WhatsApp, una
 * firma) y repartirlos entre los campos de un formulario. Sin DOM y sin servidor.
 *
 * Dos pasos: `extract()` encuentra todo lo que reconoce (con su confianza, su tramo en el texto y
 * lo que lo precede en la frase), y `matchFields()` le da a cada campo lo más probable según su
 * `kind` (o lo que se deduce de su `type`, su `name` y su etiqueta) y el contexto. Formatos de
 * Colombia: NIT con dígito de verificación, celulares y fijos (también los de 7 cifras de antes),
 * montos en pesos («$ 1.450.000», «1,45 millones», «2 palos»), fechas en español relativas a hoy.
 */
import { nxFormat, type NxFormat } from "../../core/locale";
import { foldText } from "../../core/text";
import type { PasteEvent, PasteField, PasteFieldInput, PasteFinding, PasteHints, PasteKind, PasteOption } from "./types";

export const PASTE_HINTS: PasteHints = {
  nitBad: "El dígito de verificación no cuadra: con {base} debería ser {dv}",
  nitCalc: "Sin dígito de verificación: se calculó ({dv})",
  several: "También aparece «{other}»",
  oldPhone: "Se agregó el indicativo {code}",
  shortPhone: "Sin indicativo de ciudad",
  relative: "Calculada desde hoy: «{text}»",
  noYear: "Sin año: se asumió {year}",
  issued: "Es donde se expidió la cédula",
};

const KINDS = new Set<PasteKind>(["email", "phone", "nit", "id", "money", "date", "url", "name", "company", "role", "address", "city", "number", "text"]);
const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** «{n} campos» con sus variables. */
export const fmtText = (t: string, vars: Record<string, string | number>): string => t.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// ---------------------------------------------------------------- campos

/** «razonSocial», «razon_social» → «razon social». */
export const humanize = (name: string): string => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_\-.[\]]+/g, " ");

/** Qué palabras de un campo dicen qué espera. El orden importa: «Dirección de entrega» es una
 *  dirección y no una fecha; «Correo del contacto», un correo; «Nombre de la empresa», una empresa. */
const KIND_WORDS: [RegExp, PasteKind][] = [
  [/\b(nit|rut)\b/, "nit"],
  [/\b(correo|e-?mail|mail)\b/, "email"],
  [/\b(cel|celular|movil|telefono|tel|whatsapp|pbx|fijo|phone)\b/, "phone"],
  [/\b(cedula|cc|documento|identificacion)\b/, "id"],
  [/\b(direccion|address)\b/, "address"],
  [/\b(monto|valor|precio|total|importe|presupuesto|cupo|costo|amount)\b/, "money"],
  // «Plazo de entrega» es una duración, no una fecha.
  [/\b(plazo|dias|tiempo|duracion|cantidad)\b/, "text"],
  [/\b(fecha|entrega|vence|vencimiento|date)\b/, "date"],
  [/\b(web|sitio|url|pagina)\b/, "url"],
  [/\b(ciudad|municipio|city)\b/, "city"],
  [/\b(cargo|puesto|rol)\b/, "role"],
  [/\b(razon social|empresa|proveedor|compania|company|cliente|tercero)\b/, "company"],
  [/\b(contacto|nombre|representante|responsable|name|persona|atiende|asesora?)\b/, "name"],
];

/** El `kind` de un campo: el explícito, o el que se deduce de su `type`, `name` y etiqueta. */
export function inferKind(f: { name?: string; label?: string; type?: string; kind?: PasteKind }): PasteKind {
  if (f.kind) return f.kind;
  const t = f.type ?? "";
  if (t === "email" || t === "url" || t === "date") return t;
  if (t === "tel") return "phone";
  const words = foldText(`${f.label ?? ""} ${humanize(f.name ?? "")}`);
  const k = KIND_WORDS.find(([re]) => re.test(words))?.[1] ?? "text";
  return t === "number" && k !== "money" ? "number" : k;
}

/** Los campos explícitos (JSON) válidos: `name` obligatorio; lo demás, si sirve. */
export function cleanFields(v: unknown): PasteFieldInput[] {
  if (!Array.isArray(v)) return [];
  const out: PasteFieldInput[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const name = str(o.name);
    if (!name || out.some((f) => f.name === name)) continue;
    const f: PasteFieldInput = { name };
    if (str(o.label)) f.label = str(o.label);
    if (str(o.type)) f.type = str(o.type);
    if (KINDS.has(o.kind as PasteKind)) f.kind = o.kind as PasteKind;
    if (Array.isArray(o.options)) f.options = o.options.map(cleanOption).filter((x): x is PasteOption => !!x);
    out.push(f);
  }
  return out;
}
function cleanOption(x: unknown): PasteOption | null {
  if (typeof x === "string") return x.trim() ? { value: x, label: x } : null;
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const value = typeof o.value === "number" ? String(o.value) : str(o.value);
  return value ? { value, label: str(o.label) ?? value } : null;
}

/** Los campos leídos del formulario, enriquecidos con los explícitos del mismo `name`. */
export function mergeFields(auto: readonly PasteField[], explicit: readonly PasteFieldInput[]): PasteField[] {
  return auto.map((f) => {
    const x = explicit.find((e) => e.name === f.name);
    return x ? { ...f, ...Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)) } : f;
  });
}

// ---------------------------------------------------------------- piezas sueltas

const NIT_W = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

/** El dígito de verificación de un NIT colombiano (DIAN, módulo 11). */
export function nitCheckDigit(base: string): number {
  const d = base.replace(/\D/g, "");
  let s = 0;
  for (let i = 0; i < d.length && i < NIT_W.length; i++) s += Number(d[d.length - 1 - i]) * NIT_W[i];
  const r = s % 11;
  return r > 1 ? 11 - r : r;
}

/** «900123456», 7 → «900.123.456-7». */
export const formatNit = (base: string, dv?: number | string): string => base.replace(/\B(?=(\d{3})+$)/g, ".") + (dv === undefined ? "" : `-${dv}`);

/**
 * Un número como lo escribe una persona: «1.450.000», «1,45», «1,450,000.50», «1.5». Un solo tipo
 * de separador repetido, o seguido de exactamente 3 cifras, son miles; si no, es el decimal.
 */
export function parseAmountNumber(s: string): number {
  const seps = s.match(/[.,]/g) ?? [];
  if (!seps.length) return Number(s);
  const last = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
  if (new Set(seps).size === 1 && (seps.length > 1 || s.length - last - 1 === 3)) return Number(s.replace(/[.,]/g, ""));
  return Number(`${s.slice(0, last).replace(/[.,]/g, "")}.${s.slice(last + 1)}`);
}

const WORD_NUM: Record<string, number> = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, quince: 15, medio: 0.5 };
const MULT: Record<string, number> = { "mil millones": 1e9, millones: 1e6, millon: 1e6, mill: 1e6, mills: 1e6, palos: 1e6, palo: 1e6, mm: 1e6, m: 1e6, mil: 1e3, k: 1e3, lucas: 1e3 };
const MONTHS = "enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre".split(" ");
const WEEKDAYS = "domingo lunes martes miercoles jueves viernes sabado".split(" ");
const monthOf = (w: string) => (w.startsWith("set") ? 9 : MONTHS.findIndex((m) => m.startsWith(w.slice(0, 3))) + 1);
const validDate = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return m >= 1 && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
const DAY = 864e5;
const isoOf = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Ciudades y municipios que más aparecen en un ERP colombiano. */
const CITIES =
  "Bogotá|Medellín|Cali|Barranquilla|Cartagena|Cúcuta|Bucaramanga|Soacha|Soledad|Bello|Villavicencio|Ibagué|Santa Marta|Valledupar|Montería|Pereira|Manizales|Pasto|Neiva|Palmira|Popayán|Buenaventura|Floridablanca|Armenia|Sincelejo|Itagüí|Envigado|Tuluá|Riohacha|Dosquebradas|Barrancabermeja|Tunja|Girardot|Sogamoso|Duitama|Rionegro|Zipaquirá|Chía|Facatativá|Mosquera|Funza|Tocancipá|Sabaneta|Yumbo|Jamundí|Malambo|Apartadó|Quibdó|Florencia|Yopal|Leticia|Arauca|Mocoa|San Andrés|Cartago|Magangué|Ocaña|Galapa|Girón|Piedecuesta|La Estrella|Puerto Colombia".split("|");
/** En minúscula solo cuentan las que no son también una palabra o un nombre corriente. */
const CITY_AMBIG = new Set(["soledad", "bello", "armenia", "florencia", "palmira", "pereira", "cartago", "arauca"]);

const CONNECT = new Set("de del la las los y e el".split(" "));
/** «jhon fredy ospina» → «Jhon Fredy Ospina» (los conectores en minúscula). */
export const titleCase = (s: string): string => s.toLowerCase().replace(/[\p{L}\d]+/gu, (w, i: number) => (i && CONNECT.has(w) ? w : w[0].toUpperCase() + w.slice(1)));
/** Un nombre en minúsculas o todo en mayúsculas se pasa a «Nombre Propio»; si no, se respeta. */
const nameCase = (s: string) => (s === s.toLowerCase() || s === s.toUpperCase() ? titleCase(s) : s);

/** Palabras que cortan un nombre o una razón social hacia atrás. */
const STOPW = new Set(
  "a al con de del el en es la las los le les mi nit para por que se ser si son soy su sus y yo somos hola buenas buenos dias tardes noches quedo pendiente atento atenta datos empresa proveedor parte gracias saludos cordial atentamente cordialmente escribo desde tambien como ya me nos gerente directora director comercial ventas compras area departamento encargado encargada ingeniero ingeniera jefe asesor asesora".split(" "),
);
const ROLE = /^(gerente|director|directora|coordinador|coordinadora|jefe|jefa|asesor|asesora|ejecutivo|ejecutiva|analista|representante|asistente|lider|ingeniero|ingeniera|auxiliar|vendedor|vendedora|presidente|presidenta|administrador|administradora|contador|contadora|supervisor|supervisora)\b/;
const TITLE = /^(?:ing|ingeniera?|dr|dra|doctora?|lic|licenciada?|arq|sr|sra|srta|don|dona)\.?\s+/;

/** ¿Parece un nombre de persona? 2–5 palabras con mayúscula inicial (y conectores), sin cifras. */
function nameLike(s: string): boolean {
  const words = s.trim().split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => CONNECT.has(w.toLowerCase()) || /^\p{Lu}[\p{L}'’.-]*$/u.test(w)) && !words.some((w) => STOPW.has(foldText(w)) && !CONNECT.has(foldText(w)));
}

// ---------------------------------------------------------------- extraer

/** Todo lo que se reconoce en el texto, en orden de aparición (sin repetidos). */
export function extract(text: string, today: Date = new Date(), hints: PasteHints = PASTE_HINTS): PasteFinding[] {
  const raw = text;
  const low = foldText(raw);
  const found: PasteFinding[] = [];
  const taken: [number, number][] = [];
  const free = (s: number, e: number) => !taken.some(([a, b]) => s < b && e > a);
  const take = (s: number, e: number) => void taken.push([s, e]);
  const add = (kind: PasteKind, value: string, s: number, e: number, confidence: number, extra?: Partial<PasteFinding>, mark = true) => {
    found.push({ kind, value, start: s, end: e, confidence, ctx: ctxAt(low, s), ...extra });
    if (mark) take(s, e);
  };
  /** Cada coincidencia (con las posiciones de sus grupos) que no pisa algo ya reconocido. */
  const each = (re: RegExp, on: string, fn: (m: RegExpExecArray & { indices: [number, number][] }) => void) => {
    for (const m of on.matchAll(re) as IterableIterator<RegExpExecArray & { indices: [number, number][] }>) if (free(m.index, m.index + m[0].length)) fn(m);
  };
  const base = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const wd = new Date(base).getUTCDay();
  const lines: { t: string; s: number }[] = [];
  let at = 0;
  for (const t of raw.split("\n")) lines.push({ t: t.replace(/\r$/, ""), s: at }), (at += t.length + 1);

  // 1. Encabezados que no son datos del remitente: los destinatarios y la fecha de envío de un
  //    correo reenviado, y la hora de cada mensaje de WhatsApp. Quien envía sí es un nombre.
  const mailHeaders = /^\s*(?:de|from)\s*:/m.test(low);
  each(/^\s*(?:para|to|cc|cco|bcc|enviado(?: el)?|sent|date|fecha)\s*:.*$/gm, low, (m) => {
    if (!/^\s*fecha\s*:/.test(m[0]) || mailHeaders) take(m.index, m.index + m[0].length);
  });
  each(/^\s*(?:de|from)\s*:\s*"?([^<"\n@]+?)"?\s*</dgm, low, (m) => {
    const [s, e] = m.indices[1];
    if (nameLike(raw.slice(s, e))) add("name", nameCase(raw.slice(s, e)), s, e, 0.8);
  });
  each(/^\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?\s?m\.?)?\]?\s?(?:-\s)?([^:\n]{2,40}?):/dgm, low, (m) => {
    const [s, e] = m.indices[1];
    const who = raw.slice(s, e).trim();
    take(m.index, s);
    // Un contacto sin agendar aparece como su número: ese lo lee el extractor de teléfonos.
    if (!/\d{3}/.test(who)) {
      take(s, e + 1);
      if (nameLike(nameCase(who))) add("name", nameCase(who), s, e, 0.72, undefined, false);
    }
  });

  // 2. Correos y enlaces.
  each(/[\w.%+-]+@[\w-]+(?:\.[\w-]+)+/g, raw, (m) => add("email", m[0].toLowerCase(), m.index, m.index + m[0].length, 0.97));
  each(/\b(?:https?:\/\/|www\.)[^\s<>"'()]+/gi, raw, (m) => {
    const u = m[0].replace(/[.,;:!?]+$/, "");
    add("url", /^www\./i.test(u) ? `https://${u}` : u, m.index, m.index + u.length, 0.92);
  });

  // 3. NIT (con o sin «NIT», con o sin dígito de verificación) y cédula.
  const nit = (s: number, e: number, digits: string, dv: string | undefined, labeled: boolean) => {
    let b = digits;
    let d = dv;
    // «NIT 9001234567»: 10 cifras sin guion cuyo último dígito cuadra como DV.
    if (d === undefined && b.length === 10 && nitCheckDigit(b.slice(0, 9)) === Number(b[9])) (d = b[9]), (b = b.slice(0, 9));
    const good = nitCheckDigit(b);
    if (d === undefined) add("nit", formatNit(b, good), s, e, 0.8, { hint: fmtText(hints.nitCalc, { dv: good }) });
    else if (Number(d) === good) add("nit", formatNit(b, d), s, e, labeled ? 0.98 : 0.9);
    else add("nit", formatNit(b, d), s, e, labeled ? 0.4 : 0.35, { hint: fmtText(hints.nitBad, { base: formatNit(b), dv: good }) });
  };
  each(/\b(?:n\.?\s?i\.?\s?t|rut)\b\.?\s*(?:no\.?|n[°º]\.?|#)?\s*:?\s*(\d{1,3}(?:[.\s]?\d{3}){2,3})(?:\s?[-–]\s?(\d))?(?!\d)/dg, low, (m) => nit(m.indices[1][0], m.index + m[0].length, m[1].replace(/\D/g, ""), m[2], true));
  each(/(?<![\d.])(\d{3}\.?\d{3}\.?\d{3})\s?[-–]\s?(\d)(?!\d)/dg, low, (m) => nit(m.index, m.index + m[0].length, m[1].replace(/\D/g, ""), m[2], false));
  each(/\b(?:c\.?\s?c|c\.?\s?e|cedula(?:\s+de\s+(?:ciudadania|extranjeria))?|documento(?:\s+de\s+identidad)?|identificacion)\b\.?\s*(?:no\.?|n[°º]\.?|#)?\s*:?\s*(\d{1,3}(?:[.\s]?\d{3}){1,3})(?!\d)/dg, low, (m) => {
    const [s, e] = m.indices[1];
    // «C.C. 1.020.345.678 de Bogotá»: el lugar de expedición no es la ciudad del proveedor.
    const from = /\s+de\s+\p{Lu}[\p{L}.]+(?:\s\p{Lu}[\p{L}.]+)?/uy;
    from.lastIndex = e;
    const x = from.exec(raw);
    add("id", m[1].replace(/\D/g, ""), s, e, 0.93);
    if (x) {
      const c = x[0].replace(/^\s+de\s+/, "");
      const at = e + x[0].length - c.length;
      add("city", CITIES.find((k) => foldText(k) === foldText(c)) ?? c, at, at + c.length, 0.3, { hint: hints.issued });
    }
  });

  // 4. Direcciones colombianas: «Cra. 15 # 93-47 Of. 301», «Calle 12 No. 34-56», «Vía 40 # 71-197».
  each(
    /\b(?:calle|cll?|carrera|cra|kra|kr|cr|avenida|av|ak|ac|diagonal|dg|transversal|tv|tr|autopista|circular|via)\.?\s*\d{1,3}\s?[a-z]?(?:\s?bis)?(?:\s(?:sur|norte|este))?\s*(?:#|no\.?|n[°º]\.?|num(?:ero|\.)?)\s*\d{1,3}\s?[a-z]?(?:\s?bis)?\s*[-–]\s*\d{1,3}(?:\s(?:sur|este))?(?:,?\s+(?:of(?:icina)?|local|bodega|piso|apto|apartamento|int(?:erior)?|torre|casa|lote|manzana|mz|bloque|edificio)\.?\s*[\w-]+)*/g,
    low,
    (m) => add("address", raw.slice(m.index, m.index + m[0].length), m.index, m.index + m[0].length, 0.9),
  );

  // 5. Montos: «$ 18.450.000», «USD 300», «1,45 millones», «450 mil pesos», «2 palos y medio».
  each(
    /(?<![\w.,$])(?:(us\$|usd|cop|eur|€|\$)\s?)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|quince|medio)(?:\s?(mil millones|millones|millon|mills?|palos?|lucas|mm|m|mil|k)(?![\w]))?(\s+y\s+medio)?(?:\s?(?:de\s)?(pesos|cop|usd|dolares|euros|eur)\b)?/g,
    low,
    (m) => {
      const [all, pre, n, mult, half, post] = m;
      const word = !/\d/.test(n);
      // Sin moneda ni multiplicador, un número no es un monto; «m» y «k» solo con «$».
      if ((!pre && !mult && !post) || (word && !mult) || (!pre && mult && /^(m|mm|k)$/.test(mult))) return;
      const x = mult ? MULT[mult] : 1;
      const value = (word ? WORD_NUM[n] : parseAmountNumber(n)) * x + (half ? 0.5 * x : 0);
      if (!Number.isFinite(value) || value <= 0) return;
      const cur = `${pre ?? ""}${post ?? ""}`;
      const currency = /us|dolar/.test(cur) ? "USD" : /eur|€/.test(cur) ? "EUR" : "COP";
      const conf = pre ? 0.93 : post ? 0.88 : mult === "mil" || mult === "lucas" ? 0.72 : 0.86;
      add("money", String(Math.round(value * 100) / 100), m.index, m.index + all.trimEnd().length, conf, { num: Math.round(value * 100) / 100, currency });
    },
  );

  // 6. Teléfonos. Con extensión si la trae («ext. 112»).
  const phone = (m: RegExpExecArray, value: string, mobile: boolean, conf: number, hint?: string) => {
    let e = m.index + m[0].length;
    const ext = /\s*(?:ext|extension)\.?\s*:?\s*(\d{1,5})/y;
    ext.lastIndex = e;
    const x = ext.exec(low);
    if (x) (value += ` ext. ${x[1]}`), (e += x[0].length);
    add("phone", value, m.index, e, conf, { mobile, hint });
  };
  each(/(?<![\d$.,])(?:(?:\+|00)?\s?57[\s.-]*|\(\+?57\)\s*)?\(?(3\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})(?!\d)/g, raw, (m) => phone(m, `${m[1]} ${m[2]} ${m[3]}${m[4]}`, true, 0.95));
  each(/(?<![\d$.,])(?:(?:\+|00)?\s?57[\s.-]*)?\(?(60[1-8])\)?[\s.-]?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})(?!\d)/g, raw, (m) => phone(m, `${m[1]} ${m[2]} ${m[3]}${m[4]}`, false, 0.93));
  // Los fijos de antes de 2021: «(1) 234 5678», «57 4 444 5566» → el indicativo nuevo, 60 + la cifra.
  each(/(?<![\d$.,])(?:\(\s?0?([1-8])\s?\)|(?:\+|00)?57[\s.-]+([1-8])[\s.-]+)\s?(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})(?!\d)/g, raw, (m) => {
    const code = `60${m[1] ?? m[2]}`;
    phone(m, `${code} ${m[3]} ${m[4]}${m[5]}`, false, 0.8, fmtText(hints.oldPhone, { code }));
  });
  each(/(?<![\d$.,/-])(\d{3})[\s.-]?(\d{2})[\s.-]?(\d{2})(?![\d/])/g, raw, (m) => {
    if (/\b(tel|telefono|pbx|fijo|conmutador)\b/.test(ctxAt(low, m.index))) phone(m, `${m[1]} ${m[2]}${m[3]}`, false, 0.55, hints.shortPhone);
  });

  // 7. Fechas. Sin año: la próxima vez que llega (una entrega no es en el pasado).
  const date = (m: RegExpExecArray, y: number | undefined, mo: number, d: number, conf: number) => {
    let yy = y ?? today.getFullYear();
    if (yy < 100) yy += 2000;
    let hint: string | undefined;
    if (y === undefined && Date.UTC(yy, mo - 1, d) < base - 30 * DAY) (yy += 1), (hint = fmtText(hints.noYear, { year: yy }));
    if (validDate(yy, mo, d)) add("date", iso(yy, mo, d), m.index, m.index + m[0].length, y === undefined ? conf - 0.1 : conf, { hint });
  };
  const rel = (m: RegExpExecArray, t: number, conf: number) => add("date", isoOf(t), m.index, m.index + m[0].length, conf, { hint: fmtText(hints.relative, { text: raw.slice(m.index, m.index + m[0].length) }) });
  each(/\b(\d{4})-(\d{2})-(\d{2})\b/g, low, (m) => date(m, +m[1], +m[2], +m[3], 0.96));
  each(
    /\b(?:(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo),?\s+)?(\d{1,2})(?:\s+de\s+|\s*[-/ ]\s*)(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic)\b\.?(?:(?:\s+de\s+|\s*[-/,]?\s*)(\d{4})\b)?/g,
    low,
    (m) => date(m, m[3] ? +m[3] : undefined, monthOf(m[2]), +m[1], 0.95),
  );
  each(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\s+(\d{1,2})(?:,?\s+(?:de\s+)?(\d{4}))?\b/g, low, (m) => date(m, m[3] ? +m[3] : undefined, monthOf(m[1]), +m[2], 0.85));
  each(/(?<![\d/.,-])(\d{1,2})([/.-])(\d{1,2})(?:\2(\d{4}|\d{2}))?(?![\d/]|[.,-]\d)/g, low, (m) => {
    let [d, mo] = [+m[1], +m[3]];
    // Sin año, solo «15/03» (con puntos o guiones se confunde con otras cosas).
    if (!m[4] && m[2] !== "/") return;
    let conf = m[4] ? 0.93 : 0.7;
    // «03/15/2026» (mes primero, como en EE. UU.): se entiende, pero se revisa.
    if (mo > 12 && d <= 12) ([d, mo] = [mo, d]), (conf = 0.6);
    date(m, m[4] ? +m[4] : undefined, mo, d, conf);
  });
  each(/\b(?:(el|este|para el)\s+)?(?:(proximo|siguiente|otro)\s+)?(lunes|martes|miercoles|jueves|viernes|sabado|domingo)(\s+(?:de\s+la\s+)?(?:proxima|siguiente|otra)\s+semana)?\b/g, low, (m) => {
    // «de lunes a viernes» es un horario, no una fecha: hace falta «el», «este» o «próximo».
    if (!m[1] && !m[2]) return;
    const w = WEEKDAYS.indexOf(m[3]);
    let delta = (w - wd + 7) % 7;
    if (m[4]) delta = (((1 - wd + 7) % 7) || 7) + ((w + 6) % 7);
    else if (m[1] !== "este" || m[2]) delta ||= 7;
    if (m[2] === "otro") delta += 7;
    rel(m, base + delta * DAY, 0.85);
  });
  each(/\b(pasado manana|manana|hoy)\b/g, low, (m) => {
    // «en la mañana», «de la mañana» es la hora del día.
    if (m[1] === "manana" && /\bla\s$/.test(low.slice(Math.max(0, m.index - 3), m.index))) return;
    rel(m, base + (m[1] === "hoy" ? 0 : m[1] === "manana" ? 1 : 2) * DAY, m[1] === "hoy" ? 0.6 : 0.85);
  });
  each(/\b(?:en|dentro de)\s+(\d{1,2}|un|una|dos|tres|cuatro|cinco|ocho|quince)\s+(dias?|semanas?|mes(?:es)?)(\s+habil(?:es)?)?\b/g, low, (m) => {
    const n = WORD_NUM[m[1]] ?? +m[1];
    if (m[3]) {
      // Días hábiles: de lunes a viernes (los festivos no se cuentan: por eso, para revisar).
      let t = base;
      for (let k = n; k > 0; ) if ((t += DAY) && new Date(t).getUTCDay() % 6) k--;
      return rel(m, t, 0.7);
    }
    if (m[2].startsWith("mes")) {
      const t = new Date(base);
      t.setUTCMonth(t.getUTCMonth() + n);
      return rel(m, t.getTime(), 0.75);
    }
    // En Colombia «en ocho días» es una semana y «en quince días», dos.
    const days = m[2].startsWith("semana") ? n * 7 : n === 8 ? 7 : n === 15 ? 14 : n;
    rel(m, base + days * DAY, 0.75);
  });
  each(/\b(?:a\s+|para\s+)?fin(?:al)?(?:es)?\s+de(?:l)?\s+mes\b/g, low, (m) => {
    const t = new Date(base);
    let end = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0);
    if (end === base) end = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 2, 0);
    rel(m, end, 0.7);
  });

  // 8. «Etiqueta: valor» en su propia línea. Si la etiqueta dice qué es (razón social, contacto,
  //    dirección, ciudad, cargo), es un dato de ese tipo; si no, queda como texto para un campo
  //    con esa etiqueta («Plazo: 30 días» → el campo «Plazo»).
  each(/^[ \t>*•·-]*(\p{L}[\p{L} ./()]{1,38}?)[ \t]*:[ \t]*(\S[^\n]*?)[ \t\r]*$/dgmu, raw, (m) => {
    const key = foldText(m[1]).trim();
    if (/^(de|from|para|to|cc|asunto|subject|enviado|sent|date)$/.test(key)) return;
    const [s] = m.indices[2];
    // El valor, hasta un separador: «Aceros del Caribe S.A.S. - NIT …» → «Aceros del Caribe S.A.S.».
    const v = m[2].split(/\s+[-–·|]\s+|\s{2,}|\t|,\s*(?=(?:nit|cel|tel|cc)\b)/i)[0].trim();
    const kind = inferKind({ label: key });
    if (/^(company|name|address|city|role)$/.test(kind)) {
      const value = kind === "name" ? nameCase(v) : kind === "city" ? (CITIES.find((c) => foldText(c) === foldText(v)) ?? v) : v;
      // Una dirección puede traer la ciudad al final: esa la lee el paso de ciudades.
      if (kind !== "name" || nameLike(value)) add(kind, value, s, s + v.length, 0.93, undefined, kind !== "address");
    } else found.push({ kind: "text", value: v, start: s, end: s + v.length, confidence: 0.85, ctx: key });
  });

  // 9. Razón social por su tipo de sociedad: «Aceros del Caribe S.A.S.», «EMPAQUES ANDINOS SAS».
  each(/(?<=[\p{L}\d.)])\s*,?\s+(s\.?\s?a\.?\s?s\.?|s\.?\s?a\.?|ltda\.?|&\s?c[ií]a\.?|s\.?\s?en\s?c\.?)(?![\p{L}\d])/giu, raw, (m) => {
    const ls = raw.lastIndexOf("\n", m.index - 1) + 1;
    // Hacia atrás, en la misma línea y hasta un signo de puntuación.
    const seg = raw.slice(ls, m.index).split(/[,:;·|()"«»–—]|\s-\s|\.\s/).pop() ?? "";
    const toks = seg.trim().split(/\s+/).filter(Boolean);
    const out: string[] = [];
    const caps = /^[\p{Lu}\d]/u.test(toks[toks.length - 1] ?? "");
    for (let i = toks.length - 1; i >= 0 && out.length < 7; i--) {
      const t = toks[i];
      const f = foldText(t);
      if (CONNECT.has(f) || t === "&") {
        if (!caps) break;
        out.unshift(t);
        continue;
      }
      if (STOPW.has(f) || /^[\p{Lu}\d]/u.test(t) !== caps || (!caps && out.length >= 3)) break;
      out.unshift(t);
    }
    while (out.length && CONNECT.has(foldText(out[0]))) out.shift();
    if (!out.length) return;
    const k = foldText(m[1]).replace(/[^a-z&]/g, "");
    const suffix = k === "sas" ? "S.A.S." : k === "sa" ? "S.A." : k === "ltda" ? "Ltda." : k.startsWith("&") ? "& Cía." : "S. en C.";
    const name = out.join(" ");
    const i = seg.lastIndexOf(name);
    if (i < 0) return;
    const s = i + ls + (m.index - ls - seg.length);
    add("company", `${caps ? name : titleCase(name)} ${suffix}`, s, m.index + m[0].length, caps ? 0.9 : 0.72);
  });

  // 10. Personas: la línea que sigue a la despedida («Atentamente,» / «--»), quien se presenta
  //     («soy Carolina Gómez», «el contacto soy yo, jhon fredy ospina») y su cargo.
  lines.forEach((l, i) => {
    const f = foldText(l.t).trim();
    const same = /^(?:saludos|atentamente|cordialmente|gracias)[,:]?\s+(.+?)[.!]?$/i.exec(l.t.trim());
    if (same && nameLike(same[1])) {
      const s = l.s + l.t.indexOf(same[1]);
      if (free(s, s + same[1].length)) add("name", same[1], s, s + same[1].length, 0.8);
      return;
    }
    const sign = /^(?:atentamente|cordialmente|saludos(?: cordiales)?|un saludo|cordial saludo|muchas gracias|mil gracias|gracias|quedo atent[oa].*|att|atte|--|bendiciones|feliz (?:dia|tarde)|un abrazo|abrazos?)[\s,.!:]*$/.test(f);
    // «Cordial saludo» abre muchos correos en Colombia: solo es despedida en la segunda mitad.
    if (!sign || (f.startsWith("cordial saludo") && i < lines.length / 2)) return;
    const rest = lines.slice(i + 1).filter((x) => x.t.trim());
    const who = rest[0];
    if (!who) return;
    const t = who.t.trim();
    const title = TITLE.exec(foldText(t))?.[0].length ?? 0;
    const n = t.slice(title).split(/\s+[·|–-]\s+|,/)[0].trim();
    const s = who.s + who.t.indexOf(t) + title;
    if (!nameLike(nameCase(n)) || !free(s, s + n.length)) return;
    add("name", nameCase(n), s, s + n.length, 0.9);
    const next = rest[1];
    if (next) {
      const r = next.t.trim().split(/\s+[·|–-]\s+|,/)[0].trim();
      if (ROLE.test(foldText(r))) add("role", r, next.s + next.t.indexOf(r), next.s + next.t.indexOf(r) + r.length, 0.85);
    }
  });
  each(/\b(?:soy|me llamo|mi nombre es|le habla|les habla|con usted habla|el contacto es|el contacto soy yo,?)\s+/g, low, (m) => {
    const s = m.index + m[0].length;
    const words: string[] = [];
    for (const w of raw.slice(s, s + 60).split(/(?=[\s,.;:!?])/)) {
      const t = w.trim();
      if (!/^\p{L}[\p{L}'’-]*$/u.test(t) || STOPW.has(foldText(t)) || ROLE.test(foldText(t)) || words.length === 4) break;
      words.push(t);
    }
    const n = words.join(" ");
    if (words.length >= 2 && free(s, s + n.length) && raw.slice(s, s + n.length) === n) add("name", nameCase(n), s, s + n.length, 0.82);
  });

  // 11. Ciudades (lo que queda: una razón social o un nombre ya se llevaron las suyas).
  for (const c of CITIES) {
    const k = foldText(c);
    for (const m of low.matchAll(new RegExp(`(?<![\\p{L}])${k}(?![\\p{L}])`, "gu"))) {
      const s = m.index;
      const upper = /\p{Lu}/u.test(raw[s]);
      if (free(s, s + k.length) && (upper || (k.length >= 6 && !CITY_AMBIG.has(k)))) add("city", c, s, s + k.length, 0.85);
    }
  }

  return tidy(found);
}

/**
 * Lo que precede a un dato en su frase, sin tildes: «cel.», «nit», «para el primer pedido (…) el
 * valor sería de». Si el dato está solo en su línea, la línea anterior («Correo:» ⏎ «ana@…»).
 */
function ctxAt(low: string, start: number): string {
  const ls = low.lastIndexOf("\n", start - 1) + 1;
  let c = low.slice(ls, start);
  // La frase: se corta en «. » tras una palabra de 4+ letras (no en «Cel. » ni «No. ») y en los
  // separadores de una firma («Tel. … · Cel. …»).
  let cut = 0;
  for (const m of c.matchAll(/[a-z]{4}[.!?]\s|[·|•\t]|\s-\s/g)) cut = m.index + m[0].length;
  c = c.slice(cut);
  if (!/[a-z]/.test(c) && ls > 1) return ctxAt(low, ls - 1);
  return c.slice(-90);
}

/** Sin repetidos: lo mismo dicho dos veces (el remitente y la firma) suma confianza; lo que se
 *  solapa del mismo tipo se queda con lo más seguro. */
function tidy(xs: PasteFinding[]): PasteFinding[] {
  const out: PasteFinding[] = [];
  const over = (a: PasteFinding, b: PasteFinding) => a.start < b.end && a.end > b.start;
  for (const x of xs.sort((a, b) => b.confidence - a.confidence || b.end - b.start - (a.end - a.start))) {
    const same = out.find((o) => o.kind === x.kind && (over(o, x) || (x.kind !== "text" && foldText(o.value) === foldText(x.value))));
    if (!same) out.push(x);
    else if (!over(same, x)) same.confidence = Math.round(Math.min(0.99, same.confidence + 0.04) * 100) / 100;
  }
  return out.sort((a, b) => a.start - b.start);
}

// ---------------------------------------------------------------- repartir

/** Las palabras que dicen algo de un campo, recortadas (así «entrega» encuentra «entregamos»). */
function stems(s: string): string[] {
  return foldText(s)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !/^(del|las|los|para|con|por|que|una|uno|sus|the)$/.test(w))
    .map((w) => w.slice(0, 6));
}

/** Las opciones de un `<select>` que aparecen en el texto. «Crédito 30 días» se reconoce por «30
 *  días»; «Bogotá D.C.» por «bogota». */
function optionFindings(f: PasteField, low: string, found: readonly PasteFinding[]): PasteFinding[] {
  const out: PasteFinding[] = [];
  for (const o of f.options ?? []) {
    const lab = foldText(o.label);
    const n = /(\d+)\s*([a-z]+)/.exec(lab);
    const core = lab
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length >= 3 && !/^(otr[oa]s?|ninguno|ninguna|seleccione|elija)$/.test(w))
      .join("\\s+");
    const re = n ? `${n[1]}\\s*${n[2]}` : core;
    if (!re) continue;
    for (const m of low.matchAll(new RegExp(`(?<![\\p{L}\\d])${re}(?![\\p{L}\\d])`, "gu"))) {
      const [s, e] = [m.index, m.index + m[0].length];
      // Dentro de otro dato (un correo, una razón social) no cuenta; sobre una ciudad, vale lo que vale esa ciudad
      // (la de expedición de una cédula, poco).
      const inside = found.find((x) => x.kind !== "text" && s < x.end && e > x.start);
      if (inside && inside.kind !== "city") continue;
      out.push({ kind: "text", value: o.value, start: s, end: e, confidence: Math.min(n ? 0.86 : 0.9, inside?.confidence ?? 1), hint: inside?.hint, ctx: ctxAt(low, s) });
    }
  }
  // En empate gana lo que se nombra primero en el texto.
  return out.sort((a, b) => a.start - b.start);
}

export interface MatchOptions {
  /** «Hoy», para las fechas relativas (por defecto, la fecha del sistema). */
  today?: Date;
  /** El formato de los montos en un campo de texto (por defecto, es-CO). */
  fmt?: NxFormat;
  hints?: Partial<PasteHints>;
}

/** El valor que va en el control: ISO en un `type=date`, «15/10/2026» en un texto; el número en un
 *  `type=number`, «$ 1.450.000» en un texto. */
function valueFor(f: PasteField, x: PasteFinding, fmt: NxFormat): string | null {
  if (x.kind === "money") return f.type === "number" ? String(x.num) : `${x.currency === "COP" ? "$" : x.currency} ${fmt.number(x.num!)}`;
  if (x.kind === "date") return f.type === "date" ? x.value : x.value.split("-").reverse().join("/");
  if (f.type === "number" && !f.options) {
    const n = fmt.parse(x.value);
    return n === null ? null : String(n);
  }
  return x.value;
}

/**
 * A cada campo, lo más probable del texto. Puntúa cada candidato por su confianza, por si lo que
 * lo precede nombra al campo («con entrega el…» → «Fecha de entrega») y, en teléfonos, por si es
 * celular o fijo; luego reparte de mayor a menor sin usar un dato dos veces. Si otro candidato
 * quedó casi empatado, baja la confianza y lo dice («También aparece «Itagüí»»).
 */
export function matchFields(fields: readonly PasteField[], text: string, opts: MatchOptions = {}): { name: string; value: string; confidence: number; source: { start: number; end: number }; hint?: string }[] {
  const hints = { ...PASTE_HINTS, ...opts.hints };
  const fmt = opts.fmt ?? nxFormat("es-CO");
  const found = extract(text, opts.today, hints);
  const low = foldText(text);
  type Cand = { f: number; x: PasteFinding; s: number };
  const cands: Cand[] = [];
  fields.forEach((f, fi) => {
    const kind = inferKind(f);
    const words = stems(`${f.label} ${humanize(f.name)}`);
    // La palabra entera o su comienzo: «total» no está en «subtotal».
    const hit = (ctx: string) => words.some((w) => new RegExp(`(?:^|[^a-z0-9ñ])${w}`).test(ctx));
    const list = f.options?.length
      ? optionFindings(f, low, found)
      : found.filter((x) => (kind === "text" || kind === "number" ? x.kind === "text" && hit(x.ctx) : x.kind === kind));
    const cel = words.some((w) => /^(cel|movil|whatsa)/.test(w));
    const fixed = !cel && words.some((w) => /^(fijo|pbx|tel|conmut|oficin)/.test(w));
    for (const x of list) {
      let s = x.confidence + (hit(x.ctx) ? 0.2 : 0);
      if (kind === "phone") s += cel ? (x.mobile ? 0.05 : -0.3) : fixed ? (x.mobile ? -0.05 : 0.05) : 0;
      if (kind === "email" && words.some((w) => x.value.split("@")[0].includes(w))) s += 0.1;
      cands.push({ f: fi, x, s });
    }
  });
  cands.sort((a, b) => b.s - a.s);
  const got = new Map<number, Cand>();
  const used = new Set<PasteFinding>();
  for (const c of cands) if (!got.has(c.f) && !used.has(c.x)) got.set(c.f, c), used.add(c.x);
  const out: ReturnType<typeof matchFields> = [];
  fields.forEach((f, fi) => {
    const c = got.get(fi);
    const value = c && valueFor(f, c.x, fmt);
    if (!c || value === null || value === undefined) return;
    let confidence = c.x.confidence;
    let hint = c.x.hint;
    const rival = cands.find((o) => o.f === fi && o !== c && !used.has(o.x) && foldText(o.x.value) !== foldText(c.x.value) && o.s >= c.s - 0.15);
    if (rival) (confidence -= 0.25), (hint = fmtText(hints.several, { other: text.slice(rival.x.start, rival.x.end) }));
    out.push({ name: f.name, value, confidence: Math.round(Math.max(0.05, Math.min(0.99, confidence)) * 100) / 100, source: { start: c.x.start, end: c.x.end }, hint });
  });
  return out;
}

// ---------------------------------------------------------------- protocolo

/** Confianza en 0–1 (acepta 0–100). Sin dato, 1: el backend no dijo que dudara. */
export function normalizeConfidence(v: unknown): number {
  const n = num(v);
  if (n === undefined || n < 0) return 1;
  return Math.min(1, n > 1 ? n / 100 : n);
}

/** Una línea del stream del servidor, validada (lo que no se entiende se ignora). */
export function parsePasteEvent(data: string | null): PasteEvent | null {
  if (!data) return null;
  if (data === "[DONE]") return { type: "done" };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(data);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  switch (o.type) {
    case "field": {
      const name = str(o.name);
      if (!name || (typeof o.value !== "string" && typeof o.value !== "number")) return null;
      const src = o.source as Record<string, unknown> | undefined;
      const [s, e] = [num(src?.start), num(src?.end)];
      return {
        type: "field",
        name,
        value: String(o.value),
        confidence: normalizeConfidence(o.confidence),
        source: s !== undefined && e !== undefined && s >= 0 && e > s ? { start: Math.floor(s), end: Math.floor(e) } : undefined,
        hint: str(o.hint),
      };
    }
    case "note":
    case "error":
      return { type: o.type, message: str(o.message) ?? "" };
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

/** «alta» (≥ umbral + 0,1), «media» (≥ umbral) o «baja» (bajo el umbral: hay que revisarlo). */
export function confidenceTier(confidence: number, threshold: number): "high" | "mid" | "low" {
  if (confidence < threshold) return "low";
  return confidence >= Math.min(1, threshold + 0.1) ? "high" : "mid";
}
