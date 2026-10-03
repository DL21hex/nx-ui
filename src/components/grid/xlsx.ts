/**
 * Un .xlsx de verdad, sin dependencias: una hoja con la cabecera en negrita e inmovilizada,
 * autofiltro, anchos de columna, y números, montos y fechas como valores de Excel (no texto).
 * Se comprime con `CompressionStream("deflate-raw")` cuando el navegador lo tiene; si no, va sin
 * comprimir (Excel lo abre igual). `<nx-grid>` lo carga solo al exportar.
 *
 * La hoja se arma por partes: con cientos de miles de filas, una sola cadena pasaba el largo máximo
 * de un texto en el navegador (unos 536 millones de caracteres en V8) y la exportación fallaba
 * después de haber bajado todo. Cada bloque de filas se codifica y se suelta; el CRC se calcula
 * por partes y la compresión toma los bloques como un flujo.
 */
export type XlsxType = "text" | "number" | "money" | "date";
export type XlsxCell = string | number | null;

const enc = new TextEncoder();

// ---------------------------------------------------------------- zip mínimo

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** `crc`: el de las partes anteriores (para calcularlo por partes). */
export function crc32(data: Uint8Array, crc = 0): number {
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(data: Uint8Array[]): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob(data as BlobPart[]).stream().pipeThrough(new CompressionStream("deflate-raw" as CompressionFormat));
    return await new Response(stream).blob();
  } catch {
    return null;
  }
}

/** Un archivo del zip; `data` puede ir por partes (la hoja), y `crc`, ya calculado (la hoja lo calcula
 *  mientras se arma, cediendo el hilo: aquí, con cientos de MB, congelaba la página al final). */
export async function zip(files: { name: string; data: Uint8Array | Uint8Array[]; crc?: number }[]): Promise<Blob> {
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = Array.isArray(f.data) ? f.data : [f.data];
    const size = data.reduce((n, p) => n + p.length, 0);
    const crc = f.crc ?? data.reduce((c, p) => crc32(p, c), 0);
    const packed = await deflateRaw(data);
    const method = packed && packed.size < size ? 8 : 0;
    const length = method ? packed!.size : size;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, length, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, ...(method ? [packed!] : (data as BlobPart[])));
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, method, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, length, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + length;
  }
  const size = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, size, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

// ---------------------------------------------------------------- hoja

/** Texto seguro para XML: escapa y quita los caracteres de control que Excel rechaza (y U+FFFE y
 *  U+FFFF, que tampoco son caracteres de XML). */
export function xmlText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** A1, B1… Z1, AA1. */
export function colName(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/** Fecha ISO → número de serie de Excel (días desde 1899-12-30). */
export function excelDate(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** El formato de Excel de un monto: el símbolo de la moneda de la columna («$», «US$», «€») y sus
 *  decimales (0 si todos los montos son enteros). */
export function moneyFormat(symbol: string, decimals: number): string {
  // Dentro de las comillas de Excel no puede ir una comilla; el resto del símbolo va literal.
  const sym = symbol.replace(/"/g, "").trim() || "$";
  const d = Math.max(0, Math.min(4, Math.floor(decimals) || 0));
  return `"${sym}"\\ #,##0${d ? `.${"0".repeat(d)}` : ""}`;
}

const DEFAULT_MONEY = moneyFormat("$", 0);

// Estilos: 0 normal · 1 cabecera en negrita · 2 fecha · 3 moneda · 4 número con miles · 5… los
// formatos propios de cada columna (montos en otra moneda o con decimales).
function stylesXml(formats: string[]): string {
  const custom = formats.map((f, i) => `<numFmt numFmtId="${166 + i}" formatCode="${xmlText(f)}"/>`).join("");
  const xfs = formats.map((_, i) => `<xf numFmtId="${166 + i}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${2 + formats.length}"><numFmt numFmtId="164" formatCode="${xmlText(DEFAULT_MONEY)}"/><numFmt numFmtId="165" formatCode="d\\ mmm\\ yyyy"/>${custom}</numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${5 + formats.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>${xfs}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

/** Los formatos distintos de las columnas y el estilo (`s`) que le toca a cada una. */
function columnStyles(types: XlsxType[], formats: (string | undefined)[] = []): { list: string[]; style: (number | undefined)[] } {
  const list: string[] = [];
  const style = types.map((t, i) => {
    const f = formats[i];
    if (!f || (t !== "number" && t !== "money")) return undefined;
    let at = list.indexOf(f);
    if (at < 0) at = list.push(f) - 1;
    return 5 + at;
  });
  return { list, style };
}

/** Excel no admite más caracteres en una celda: un texto más largo hace que pida «reparar» el libro. */
export const CELL_MAX = 32767;

/** Un texto recortado al tope de una celda de Excel, con «…» al final (sin partir un emoji). */
export function cellText(s: string): string {
  return s.length > CELL_MAX ? `${s.slice(0, CELL_MAX - 1).replace(/[\ud800-\udbff]$/, "")}…` : s;
}

/** Filas por parte de la hoja. */
const SHEET_PART = 2000;

/** La hoja por partes: el principio, cada bloque de filas y el final. */
export function* sheetParts(header: string[], rows: XlsxCell[][], types: XlsxType[], widths: number[], styles: (number | undefined)[] = []): Generator<string> {
  const style = { text: 0, date: 2, money: 3, number: 4 } as const;
  const last = colName(header.length - 1);
  const names = header.map((_, i) => colName(i));
  yield `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${rows.length + 1}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols><sheetData>` +
    `<row r="1">${header.map((h, i) => `<c r="${names[i]}1" t="inlineStr" s="1"><is><t>${xmlText(cellText(h))}</t></is></c>`).join("")}</row>`;
  for (let start = 0; start < rows.length; start += SHEET_PART) {
    let out = "";
    for (let ri = start; ri < rows.length && ri < start + SHEET_PART; ri++) {
      const r = ri + 2;
      out += `<row r="${r}">`;
      rows[ri].forEach((v, ci) => {
        if (v === null || v === "") return;
        const ref = `${names[ci] ?? colName(ci)}${r}`;
        const t = types[ci];
        if (t === "date" && typeof v === "string") {
          const d = excelDate(v);
          if (d !== null) return void (out += `<c r="${ref}" s="2"><v>${d}</v></c>`);
        }
        if ((t === "number" || t === "money") && typeof v === "number" && Number.isFinite(v)) return void (out += `<c r="${ref}" s="${styles[ci] ?? style[t]}"><v>${v}</v></c>`);
        out += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlText(cellText(String(v)))}</t></is></c>`;
      });
      out += "</row>";
    }
    yield out;
  }
  yield `</sheetData><autoFilter ref="A1:${last}${rows.length + 1}"/></worksheet>`;
}

/** La hoja en una sola cadena (para hojas chicas y pruebas; el libro usa `sheetParts`). */
export function sheetXml(header: string[], rows: XlsxCell[][], types: XlsxType[], widths: number[], styles: (number | undefined)[] = []): string {
  return [...sheetParts(header, rows, types, widths, styles)].join("");
}

/** El nombre de la hoja como lo acepta Excel: sin `\ / ? * [ ] :`, sin apóstrofo al principio ni al
 *  final, 31 caracteres como mucho. */
export function sheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31).replace(/^['\s]+|['\s]+$/g, "") || "Hoja1";
}

/** El libro completo, listo para descargar. */
export async function buildXlsx(title: string, header: string[], rows: XlsxCell[][], types: XlsxType[], widths: number[], formats?: (string | undefined)[]): Promise<Blob> {
  const name = xmlText(sheetName(title));
  // En la referencia del autofiltro el nombre va entre apóstrofos: uno propio se duplica («O''Brien»).
  const ref = name.replace(/'/g, "''");
  const { list, style } = columnStyles(types, formats);
  const files: [string, string][] = [
    [
      "[Content_Types].xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    ],
    [
      "_rels/.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${ref}'!$A$1:$${colName(header.length - 1)}$${rows.length + 1}</definedName></definedNames></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ],
    ["xl/styles.xml", stylesXml(list)],
  ];
  // La hoja, codificada por partes y con su CRC; entre una y otra se cede el hilo (la página sigue
  // respondiendo).
  const sheet: Uint8Array[] = [];
  let crc = 0;
  let t = performance.now();
  for (const part of sheetParts(header, rows, types, widths, style)) {
    const bytes = enc.encode(part);
    sheet.push(bytes);
    crc = crc32(bytes, crc);
    if (performance.now() - t > 50) {
      await new Promise((r) => setTimeout(r));
      t = performance.now();
    }
  }
  return zip([...files.map(([n, s]) => ({ name: n, data: enc.encode(s) })), { name: "xl/worksheets/sheet1.xml", data: sheet, crc }]);
}
