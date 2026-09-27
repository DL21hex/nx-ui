/**
 * Lector de .xlsx sin dependencias, para `<nx-import>` (se carga con `import()` solo cuando llega un
 * libro de Excel). Descomprime el ZIP con `DecompressionStream("deflate-raw")` leyendo su directorio
 * central, y lee el XML con expresiones simples (sin DOMParser: sirve igual en un worker o en Node):
 * el libro y sus relaciones, los textos compartidos (también los enriquecidos), los estilos (para
 * saber qué números son fechas) y la hoja. Las fechas salen en ISO; los demás números, como número.
 */
import type { ImportCell } from "./types";

export interface XlsxBook {
  /** Los nombres de las hojas, en el orden del libro. */
  names: string[];
  /** Las celdas de una hoja (filas × columnas; las saltadas quedan en «»). */
  sheet(i: number): Promise<ImportCell[][]>;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (u16(b, o) | (u16(b, o + 2) << 16)) >>> 0;
const utf8 = new TextDecoder();
/** Tope de lo que puede ocupar un archivo del ZIP ya descomprimido (contra las «bombas zip»). */
const MAX_ENTRY = 256 * 1024 * 1024;
/** Los límites de una hoja de Excel (XFD y 1.048.576): una referencia más allá es basura o un
 *  archivo armado, y rellenar hasta ella reservaría miles de millones de celdas. */
const MAX_COLS = 16384;
const MAX_ROWS = 1048576;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const reader = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(data);
      c.close();
    },
  })
    .pipeThrough(new DecompressionStream("deflate-raw" as CompressionFormat) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>)
    .getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_ENTRY) {
      void reader.cancel();
      throw new Error("xlsx: entry too large");
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
}

/** Los archivos del ZIP por nombre (en minúsculas), leídos del directorio central. */
function unzip(b: Uint8Array): Map<string, () => Promise<Uint8Array>> {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("xlsx: not a zip");
  const files = new Map<string, () => Promise<Uint8Array>>();
  let p = u32(b, eocd + 16);
  for (let k = u16(b, eocd + 10); k > 0 && u32(b, p) === 0x02014b50; k--) {
    const method = u16(b, p + 10);
    const size = u32(b, p + 20);
    const nlen = u16(b, p + 28);
    const name = utf8.decode(b.subarray(p + 46, p + 46 + nlen)).toLowerCase();
    const local = u32(b, p + 42);
    p += 46 + nlen + u16(b, p + 30) + u16(b, p + 32);
    files.set(name, async () => {
      const start = local + 30 + u16(b, local + 26) + u16(b, local + 28);
      const data = b.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflate(data);
      throw new Error("xlsx: unsupported compression");
    });
  }
  return files;
}

const ENT: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const unxml = (s: string): string =>
  s
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e] ?? m)))
    .replace(/_x([\da-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
const attr = (tag: string, name: string): string | undefined => {
  const m = new RegExp(`[\\s:]${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? unxml(m[1] ?? m[2]) : undefined;
};
/** El texto de un `<si>` o `<is>`: sus `<t>` (también los de cada `<r>` enriquecido), sin la fonética `<rPh>`. */
const texts = (xml: string): string => {
  let out = "";
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([^<]*)<\/t>/g)) out += m[1];
  return unxml(out);
};

/** Número de serie → ISO (1900 con su 29-feb-1900 inexistente, o 1904); menos de un día → «hh:mm». */
function serialIso(n: number, d1904: boolean): ImportCell {
  if (n < 0 || n > 2958465) return n;
  if (n < 1 && !d1904) {
    const min = Math.round(n * 1440);
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const base = d1904 ? Date.UTC(1904, 0, 1) : n < 61 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30);
  return new Date(base + Math.floor(n) * 864e5).toISOString().slice(0, 10);
}

/** ¿El formato de número es de fecha? Los incorporados 14–22 (y 27–36, 50–58 de Asia) o uno propio con d o y. */
function dateFormat(id: number, code: string | undefined): boolean {
  if ((id >= 14 && id <= 22) || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return true;
  return !!code && /[dy]/i.test(code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, ""));
}

/** «C7» → 2 (la columna, desde 0). */
function colOf(ref: string): number {
  let c = 0;
  for (let i = 0; i < ref.length; i++) {
    const k = ref.charCodeAt(i);
    if (k < 65 || k > 90) break;
    c = c * 26 + k - 64;
  }
  return c - 1;
}

/** Abre un .xlsx: los nombres de sus hojas y un lector por hoja. */
export async function readXlsx(bytes: Uint8Array): Promise<XlsxBook> {
  const files = unzip(bytes);
  // Sin prefijos de espacio de nombres (`<x:row>` del SDK de .NET): los patrones quedan simples.
  const xml = async (name: string): Promise<string> => {
    const f = files.get(name.toLowerCase());
    return f ? utf8.decode(await f()).replace(/<(\/?)[\w.-]+:/g, "<$1") : "";
  };
  const book = await xml("xl/workbook.xml");
  if (!book) throw new Error("xlsx: no workbook");
  const rels = new Map<string, string>();
  for (const m of (await xml("xl/_rels/workbook.xml.rels")).matchAll(/<Relationship\b[^>]*>/g)) {
    const target = attr(m[0], "Target") ?? "";
    rels.set(attr(m[0], "Id") ?? "", target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const sheets = [...book.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({ name: attr(m[0], "name") ?? "", path: rels.get(attr(m[0], "id") ?? "") ?? "" }));
  const d1904 = /<workbookPr\b[^>]*\sdate1904\s*=\s*["'](?:1|true)["']/.test(book);
  let shared: string[] | null = null;
  let dates: boolean[] | null = null;
  return {
    names: sheets.map((s) => s.name),
    async sheet(i) {
      shared ??= [...(await xml("xl/sharedStrings.xml")).matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)].map((m) => texts(m[1] ?? ""));
      if (!dates) {
        const styles = await xml("xl/styles.xml");
        const codes = new Map<number, string>();
        for (const m of styles.matchAll(/<numFmt\b[^>]*>/g)) codes.set(Number(attr(m[0], "numFmtId")), attr(m[0], "formatCode") ?? "");
        const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(styles)?.[1] ?? "";
        dates = [...xfs.matchAll(/<xf\b[^>]*>/g)].map((m) => {
          const id = Number(attr(m[0], "numFmtId") ?? 0);
          return dateFormat(id, codes.get(id));
        });
      }
      const s = sheets[i];
      const src = s ? await xml(s.path) : "";
      const rows: ImportCell[][] = [];
      let next = 0;
      for (const rm of src.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
        const r = Number(/\sr="(\d+)"/.exec(rm[1])?.[1] ?? next + 1) - 1;
        next = r + 1;
        if (!rm[2] || r < 0 || r >= MAX_ROWS) continue;
        const row: ImportCell[] = [];
        let col = 0;
        for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
          const a = cm[1];
          const ref = /\sr="([A-Z]+)/.exec(a)?.[1];
          const c = ref ? colOf(ref) : col;
          col = c + 1;
          if (c < 0 || c >= MAX_COLS) continue;
          const body = cm[2] ?? "";
          const t = /\st="(\w+)"/.exec(a)?.[1];
          const v = /<v>([^<]*)<\/v>/.exec(body)?.[1];
          let value: ImportCell = "";
          if (t === "s") value = shared[Number(v)] ?? "";
          else if (t === "inlineStr") value = texts(body);
          else if (t === "b") value = v === "1" ? "true" : "false";
          else if (t === "str" || t === "e") value = unxml(v ?? "");
          else if (v !== undefined && v !== "") {
            const n = Number(v);
            value = Number.isNaN(n) ? unxml(v) : dates[Number(/\ss="(\d+)"/.exec(a)?.[1] ?? 0)] ? serialIso(n, d1904) : n;
          }
          if (value !== "") row[c] = value;
        }
        if (!row.length) continue;
        for (let k = 0; k < row.length; k++) row[k] ??= "";
        while (rows.length < r) rows.push([]);
        rows[r] = row;
      }
      return rows;
    },
  };
}
