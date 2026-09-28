/**
 * Lógica pura de `<nx-signature>`: del trazo al SVG. Sin DOM.
 *
 * Cada trazo se dibuja como un contorno relleno (un solo `<path>`): el borde izquierdo y el derecho
 * del trazo, a media anchura del centro, unidos con curvas cuadráticas por los puntos medios y con
 * puntas redondas. Así el ancho varía a lo largo del trazo (más fino cuanto más rápido, más grueso
 * con más presión del lápiz) y el mismo `d` sirve para el canvas (`Path2D`) y para el SVG.
 */
import type { SignatureDevice, SignatureGeo, SignatureMeta, SignatureMinimum, SignaturePoint, SignatureStroke, SignatureValue } from "./types";

/** Anchos del trazo en px: `max` despacio, `min` a `speed` px/ms o más rápido. */
export const SIGNATURE_PEN = { min: 1.1, max: 3.4, speed: 2.2 };
/** Lo mínimo para que cuente como firma (`required`): no vale un punto ni una raya. */
export const SIGNATURE_MIN: SignatureMinimum = { length: 80, width: 40, height: 12 };
/** Tinta por defecto: casi negro azulado, como un bolígrafo. */
export const SIGNATURE_INK = "#1a2238";
/** La fuente de la firma escrita: cursivas que traen los sistemas (nada se descarga). */
export const SIGNATURE_FONT = "'Segoe Script','Bradley Hand','Snell Roundhand','Brush Script MT',cursive";

const r1 = (v: number) => Math.round(v * 10) / 10;
const DEVICES = new Set<SignatureDevice>(["pointer", "touch", "pen", "mouse"]);

/**
 * El ancho del trazo a una velocidad (px/ms) y una presión (0–1). La presión solo cuenta con lápiz
 * (`pen`): el mouse reporta 0,5 fijo y muchos dedos 0 o 1.
 */
export function signatureWidth(speed: number, pressure = 0.5, pen = false, o = SIGNATURE_PEN): number {
  const s = Math.min(1, Math.max(0, Number.isFinite(speed) ? speed : 0) / o.speed);
  let w = o.max - (o.max - o.min) * s;
  if (pen) w *= 0.4 + 1.2 * Math.min(1, Math.max(0, Number.isFinite(pressure) ? pressure : 0.5));
  return Math.round(Math.max(0.4, w) * 100) / 100;
}

/** El ancho en cada punto, con un filtro suave (el ancho no salta de un punto al siguiente). */
export function strokeWidths(stroke: SignatureStroke, o = SIGNATURE_PEN): number[] {
  const pts = stroke.points;
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i ? i - 1 : 0];
    const b = pts[i];
    const v = i ? Math.hypot(b.x - a.x, b.y - a.y) / Math.max(1, b.t - a.t) : 0;
    const w = signatureWidth(v, b.p, stroke.type === "pen", o);
    prev = i ? prev * 0.65 + w * 0.35 : w;
    out.push(prev);
  }
  return out;
}

/**
 * Suaviza un trazo: descarta los puntos a menos de `min` px del anterior (el temblor de la mano y
 * los eventos repetidos) y promedia cada punto interior con sus vecinos (1-2-1). Las puntas quedan
 * donde estaban.
 */
export function smoothSignaturePoints(points: SignaturePoint[], min = 1.5): SignaturePoint[] {
  const kept: SignaturePoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const last = kept[kept.length - 1];
    if (last && i < points.length - 1 && Math.hypot(p.x - last.x, p.y - last.y) < min) continue;
    kept.push(p);
  }
  return kept.map((p, i) => {
    if (i === 0 || i === kept.length - 1) return p;
    const a = kept[i - 1];
    const b = kept[i + 1];
    return { ...p, x: (a.x + 2 * p.x + b.x) / 4, y: (a.y + 2 * p.y + b.y) / 4 };
  });
}

/**
 * El contorno de un trazo como `d` de SVG, desplazado `dx`/`dy`. Un solo punto (o un toque sin
 * moverse) es un círculo: el punto de una «i» también se ve.
 */
export function signaturePath(points: { x: number; y: number }[], widths: number[], dx = 0, dy = 0): string {
  const n = points.length;
  if (!n) return "";
  const P = (x: number, y: number) => `${r1(x + dx)} ${r1(y + dy)}`;
  const moved = points.some((p) => Math.hypot(p.x - points[0].x, p.y - points[0].y) > 0.5);
  if (n === 1 || !moved) {
    const { x, y } = points[0];
    const r = r1(Math.max(...widths.slice(0, 50), 0.4) / 2 + 0.3);
    return `M${P(x - r, y)}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  }
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = points[Math.max(0, i - 1)];
    const b = points[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const h = (widths[i] ?? widths[widths.length - 1] ?? 1) / 2;
    const nx = (-(b.y - a.y) / len) * h;
    const ny = ((b.x - a.x) / len) * h;
    L.push([points[i].x + nx, points[i].y + ny]);
    R.push([points[i].x - nx, points[i].y - ny]);
  }
  // Un lado con cuadráticas por los puntos medios: cada punto es control y la curva pasa por el medio.
  const side = (s: [number, number][]) => {
    let d = "";
    for (let i = 1; i < s.length - 1; i++) d += `Q${P(s[i][0], s[i][1])} ${P((s[i][0] + s[i + 1][0]) / 2, (s[i][1] + s[i + 1][1]) / 2)}`;
    const e = s[s.length - 1];
    return `${d}L${P(e[0], e[1])}`;
  };
  const cap = (i: number) => r1(Math.max(0.2, (widths[i] ?? 1) / 2));
  R.reverse();
  return `M${P(L[0][0], L[0][1])}${side(L)}A${cap(n - 1)} ${cap(n - 1)} 0 0 0 ${P(R[0][0], R[0][1])}${side(R)}A${cap(0)} ${cap(0)} 0 0 0 ${P(L[0][0], L[0][1])}Z`;
}

/** El recuadro de lo firmado, con `margin` px alrededor, o `null` si no hay trazos. */
export function signatureBounds(strokes: SignatureStroke[], margin = 8): { x: number; y: number; width: number; height: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const s of strokes)
    for (const p of s.points) {
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
  if (x0 > x1) return null;
  return { x: x0 - margin, y: y0 - margin, width: Math.ceil(x1 - x0 + 2 * margin), height: Math.ceil(y1 - y0 + 2 * margin) };
}

/**
 * Si los trazos son una firma «de verdad»: `empty` sin nada, `short` si es un punto, una raya o
 * algo muy pequeño (longitud o tamaño bajo `min`, o casi recto: el recorrido apenas pasa de la
 * diagonal), o `null` si vale.
 */
export function signatureCheck(strokes: SignatureStroke[], min: SignatureMinimum = SIGNATURE_MIN): "empty" | "short" | null {
  let len = 0;
  let count = 0;
  for (const s of strokes) {
    count += s.points.length;
    for (let i = 1; i < s.points.length; i++) len += Math.hypot(s.points[i].x - s.points[i - 1].x, s.points[i].y - s.points[i - 1].y);
  }
  if (!count) return "empty";
  const b = signatureBounds(strokes, 0)!;
  return len < min.length || b.width < min.width || b.height < min.height || len < 1.2 * Math.hypot(b.width, b.height) ? "short" : null;
}

/** Texto seguro dentro de un atributo o de un nodo de texto SVG. */
export function escapeXml(s: string): string {
  return s.replace(/[&<>"'=]/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Un color de tinta aceptable (`#1a2238`, `navy`, `rgb(…)`, `oklch(…)`: sin comillas ni `<>`), o la tinta por defecto. */
export function cleanInk(v: unknown): string {
  return typeof v === "string" && /^[#\w(),.%\s/+-]{3,60}$/.test(v.trim()) ? v.trim() : SIGNATURE_INK;
}

const svgOpen = (w: number, h: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`;

/** El SVG de los trazos, recortado a lo firmado con `margin` px: un `<path>` por trazo. `""` sin trazos. */
export function signatureSVG(strokes: SignatureStroke[], ink = SIGNATURE_INK, margin = 8): string {
  const b = signatureBounds(strokes, margin);
  if (!b) return "";
  let paths = "";
  for (const s of strokes) {
    const pts = smoothSignaturePoints(s.points);
    paths += `<path d="${signaturePath(pts, strokeWidths({ type: s.type, points: pts }), -b.x, -b.y)}"/>`;
  }
  return `${svgOpen(b.width, b.height)}<g fill="${escapeXml(cleanInk(ink))}">${paths}</g></svg>`;
}

/** La firma escrita: el nombre en cursiva (del sistema), en un SVG del tamaño aproximado del texto. */
export function typedSignatureSVG(name: string, ink = SIGNATURE_INK, size = 44): string {
  const text = name.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!text) return "";
  const w = Math.ceil(text.length * size * 0.52 + size);
  const h = Math.ceil(size * 1.6);
  return `${svgOpen(w, h)}<text x="${size / 2}" y="${Math.round(size * 1.12)}" font-family="${SIGNATURE_FONT}" font-size="${size}" fill="${escapeXml(cleanInk(ink))}">${escapeXml(text)}</text></svg>`;
}

/** Un SVG que se puede guardar y volver a pintar: empieza por `<svg` y no trae scripts, manejadores ni `javascript:`. */
export function safeSignatureSvg(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length < 2e6 && /^<svg[\s>]/i.test(t) && !/<script|<foreignobject|\son[a-z]+\s*=|javascript:/i.test(t) ? t : null;
}

/** Los metadatos y el tipo de cada uno: lo demás que venga se descarta. */
const META: Record<string, string> = { signedAt: "string", name: "string", id: "string", typed: "boolean", strokes: "number", points: "number", width: "number", height: "number", device: "string", hash: "string" };

/** Metadatos limpios a partir de lo que venga (JSON de un servidor o de un celular). */
export function cleanSignatureMeta(v: unknown): SignatureMeta {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const m = { signedAt: "", typed: false, strokes: 0, points: 0, width: 0, height: 0, device: "pointer" } as SignatureMeta & Record<string, unknown>;
  for (const k in META) {
    const x = o[k];
    if (typeof x === META[k] && (typeof x !== "string" || x.trim()) && (typeof x !== "number" || Number.isFinite(x))) m[k] = typeof x === "string" ? x.trim().slice(0, 200) : x;
  }
  if (!DEVICES.has(m.device)) m.device = "pointer";
  if (m.hash && !/^[0-9a-f]{64}$/.test(m.hash)) delete m.hash;
  const g = o.geo as SignatureGeo | undefined;
  if (g && Number.isFinite(g.lat) && Number.isFinite(g.lng)) m.geo = Number.isFinite(g.accuracy) ? { lat: g.lat, lng: g.lng, accuracy: g.accuracy } : { lat: g.lat, lng: g.lng };
  return m;
}

/**
 * Una firma guardada: `{svg, meta}` (objeto o JSON) o el SVG solo. `null` si no se entiende o si
 * el SVG no es seguro. Sin metadatos, el tamaño sale del `width`/`height` del SVG.
 */
export function parseSignatureValue(v: unknown): SignatureValue | null {
  let o = v;
  if (typeof o === "string" && o.trim().startsWith("{"))
    try {
      o = JSON.parse(o);
    } catch {
      return null;
    }
  const raw = o && typeof o === "object" ? (o as Record<string, unknown>) : { svg: o };
  const svg = safeSignatureSvg(raw.svg);
  if (!svg) return null;
  const meta = cleanSignatureMeta(raw.meta);
  if (!meta.width) {
    const size = (k: string) => Number(new RegExp(`^<svg[^>]*\\s${k}="([\\d.]+)`).exec(svg)?.[1]) || 0;
    meta.width = size("width");
    meta.height = size("height");
  }
  return { svg, meta };
}

/** El texto firmado, normalizado: NFC, espacios seguidos a uno y sin espacios en las puntas. */
export function normalizeSignedText(text: string): string {
  return text.normalize("NFC").replace(/\s+/g, " ").trim();
}

/**
 * La huella de lo firmado: SHA-256 (hex) del texto normalizado, un salto de línea y la fecha ISO.
 * `undefined` sin `crypto.subtle` (una página en `http://` que no es localhost).
 */
export async function signatureHash(text: string, signedAt: string): Promise<string | undefined> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(`${normalizeSignedText(text)}\n${signedAt}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** «28 sept 2026, 3:42 p. m.» en el locale (canónico: `resolveLocale`), sin los «de» del español. `""` si la fecha no sirve. */
export function signatureDate(iso: string, locale = "es-CO"): string {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return "";
  const f = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  return f
    .formatToParts(d)
    .map((p) => (p.type === "literal" && /^\s*de\s*$/.test(p.value) ? " " : p.value))
    .join("")
    .replace(/[\u00a0\u202f]/g, " ");
}
