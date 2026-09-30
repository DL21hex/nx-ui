/**
 * Codificador QR propio (ISO/IEC 18004), sin dependencias: modo byte (UTF-8), niveles L/M/Q/H,
 * versiones 1 a 40 con la mínima que alcance, Reed-Solomon sobre GF(256), intercalado de bloques,
 * patrones de posición, alineación y temporización, formato y versión (≥ 7) y las 8 máscaras con
 * la penalización del estándar. La salida es una matriz booleana (`true` = módulo oscuro) y
 * `qrSvgPath()` la vuelve un solo `<path>` con las corridas horizontales fusionadas.
 *
 * Solo lo que necesita un enlace: sin modos numérico/alfanumérico/kanji ni ECI (los lectores
 * asumen UTF-8 en modo byte, y una URL casi no gana nada con los otros modos).
 */

export type QrEcc = "L" | "M" | "Q" | "H";

export interface QrOptions {
  /** Nivel de corrección de errores (por defecto «M»: 15 % del símbolo se puede perder). */
  ecc?: QrEcc;
  /** Forzar una máscara (0–7); por defecto, la de menor penalización. */
  mask?: number;
  /** Versión mínima (1–40). */
  minVersion?: number;
}

/** Índices de nivel: L, M, Q, H (orden de las tablas) y sus bits de formato. */
const LEVELS: QrEcc[] = ["L", "M", "Q", "H"];
const FORMAT_BITS = [1, 0, 3, 2];

// Por nivel (L, M, Q, H) y versión (1–40): codewords de corrección por bloque y número de bloques
// (tabla 9 de ISO/IEC 18004), cada valor como un carácter con código `valor + 40` (40 por nivel).
// Así pesan un tercio; `test/qr.test.ts` las compara con las capacidades del estándar.
const EC_PER_BLOCK = "/27<B:<@F:<@BF>@DFDDDDFFBDFFFFFFFFFFFFFF28B:@8:>>BF>>@@DDBBBBDDDDDDDDDDDDDDDDDDD5>:B:@:><@DB@<F@DDBFDFFFFDFFFFFFFFFFFFFF9D>8>DBB@D@D>@@FDDBDF@FFFFFFFFFFFFFFFFFF";
const BLOCKS = ")))))****,,,,,..../0011244456789:;;<=>@A)))**,,,---01122356899:<=?ABDEGIKMNPSUWY))**,,..000248498:=<??ACEJJKNPSUX[]`cfil))*,,,-.003388:8;=AAAJFHKMPRUX[^adgjnruy";
const table = (t: string, level: number, version: number) => t.charCodeAt(level * 40 + version - 1) - 40;

/** Centros de los patrones de alineación de una versión (fila y columna usan los mismos). */
export function qrAlignment(version: number): number[] {
  if (version < 2) return [];
  const n = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const out = [6];
  for (let pos = version * 4 + 10; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

/** Módulos disponibles para datos + corrección (todo lo que no es patrón, formato ni versión). */
function rawModules(version: number): number {
  let r = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const n = Math.floor(version / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (version >= 7) r -= 36;
  }
  return r;
}

/** La estructura de bloques: codewords totales, de corrección por bloque, y el largo de datos de cada bloque. */
export function qrBlocks(version: number, ecc: QrEcc = "M"): { total: number; ec: number; data: number[] } {
  const l = LEVELS.indexOf(ecc);
  const total = rawModules(version) >> 3;
  const ec = table(EC_PER_BLOCK, l, version);
  const count = table(BLOCKS, l, version);
  const short = count - (total % count);
  const shortLen = Math.floor(total / count);
  const data: number[] = [];
  for (let i = 0; i < count; i++) data.push(shortLen - ec + (i < short ? 0 : 1));
  return { total, ec, data };
}

/** Cuántos bytes caben en modo byte con una versión y un nivel. */
export function qrCapacity(version: number, ecc: QrEcc = "M"): number {
  const bits = qrBlocks(version, ecc).data.reduce((a, b) => a + b, 0) * 8 - 4 - (version < 10 ? 8 : 16);
  return bits >> 3;
}

// ---------------------------------------------------------------- Reed-Solomon sobre GF(2⁸), polinomio 0x11D

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

/** Los coeficientes del polinomio generador de grado `degree` (del mayor al menor, sin el 1 inicial). */
export function qrGenerator(degree: number): number[] {
  const g = new Array<number>(degree).fill(0);
  g[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      g[j] = gfMul(g[j], root);
      if (j + 1 < degree) g[j] ^= g[j + 1];
    }
    root = gfMul(root, 2);
  }
  return g;
}

/** Los codewords de corrección de un bloque de datos. */
export function qrEcCodewords(data: number[], degree: number): number[] {
  const g = qrGenerator(degree);
  const r = new Array<number>(degree).fill(0);
  for (const b of data) {
    const f = b ^ (r.shift() as number);
    r.push(0);
    for (let i = 0; i < degree; i++) r[i] ^= gfMul(g[i], f);
  }
  return r;
}

// ---------------------------------------------------------------- formato y versión (BCH)

/** Los 15 bits de formato (nivel + máscara), ya con la máscara 0x5412. */
export function qrFormatBits(ecc: QrEcc, mask: number): number {
  const d = (FORMAT_BITS[LEVELS.indexOf(ecc)] << 3) | mask;
  let r = d;
  for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
  return ((d << 10) | r) ^ 0x5412;
}

/** Los 18 bits de versión (solo desde la 7). */
export function qrVersionBits(version: number): number {
  let r = version;
  for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
  return (version << 12) | r;
}

// ---------------------------------------------------------------- máscaras y penalización

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/**
 * Penalización del estándar: N1 (corridas de 5 o más del mismo color, 3 + exceso), N2 (bloques de
 * 2×2 del mismo color, 3), N3 (1:1:3:1:1 con 4 claros a un lado, 40; fuera del símbolo es claro) y
 * N4 (proporción de oscuros, 10 por cada 5 % de desvío del 50 %).
 */
export function qrPenalty(m: boolean[][]): number {
  const size = m.length;
  let score = 0;
  let dark = 0;
  const at = (line: (i: number) => boolean, i: number) => i >= 0 && i < size && line(i);
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      const line = pass ? (i: number) => m[i][a] : (i: number) => m[a][i];
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line(i) === line(i - 1)) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      for (let i = 0; i + 7 <= size; i++) {
        // 1011101 en i…i+6, con 0000 antes o después.
        if (!(line(i) && !line(i + 1) && line(i + 2) && line(i + 3) && line(i + 4) && !line(i + 5) && line(i + 6))) continue;
        if (!at(line, i - 1) && !at(line, i - 2) && !at(line, i - 3) && !at(line, i - 4)) score += 40;
        if (!at(line, i + 7) && !at(line, i + 8) && !at(line, i + 9) && !at(line, i + 10)) score += 40;
      }
    }
  }
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const c = m[y][x];
      if (c) dark++;
      if (x + 1 < size && y + 1 < size && c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
  const total = size * size;
  return score + (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
}

// ---------------------------------------------------------------- el símbolo

/** Los codewords de datos: modo byte, largo, bytes, terminador y relleno 0xEC/0x11. */
function dataCodewords(bytes: Uint8Array, version: number, capacity: number): number[] {
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, capacity * 8 - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < capacity; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/**
 * La matriz de un texto (filas de módulos; `true` = oscuro), sin zona tranquila. Lanza
 * `RangeError` si el texto no cabe ni en la versión 40.
 */
export function qrMatrix(text: string, opts: QrOptions = {}): boolean[][] {
  const ecc: QrEcc = LEVELS.includes(opts.ecc as QrEcc) ? (opts.ecc as QrEcc) : "M";
  const bytes = new TextEncoder().encode(text);
  let version = Math.max(1, Math.min(40, Math.floor(opts.minVersion ?? 1)));
  while (qrCapacity(version, ecc) < bytes.length) if (++version > 40) throw new RangeError("[nx32-elements] el texto no cabe en un código QR");

  // Datos → bloques → corrección → intercalado.
  const { ec, data: lens } = qrBlocks(version, ecc);
  const data = dataCodewords(bytes, version, lens.reduce((a, b) => a + b, 0));
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < lens.length; k += lens[i++]) blocks.push(data.slice(k, k + lens[i]));
  const ecs = blocks.map((b) => qrEcCodewords(b, ec));
  const stream: number[] = [];
  for (let i = 0; i < lens[lens.length - 1]; i++) for (const b of blocks) if (i < b.length) stream.push(b[i]);
  for (let i = 0; i < ec; i++) for (const e of ecs) stream.push(e[i]);

  // Patrones fijos.
  const size = version * 4 + 17;
  const m: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fixed: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    m[y][x] = dark;
    fixed[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]])
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
  const align = qrAlignment(version);
  const last = align.length - 1;
  for (let i = 0; i <= last; i++)
    for (let j = 0; j <= last; j++) {
      // Las tres esquinas las ocupan los patrones de posición.
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  const drawFormat = (mask: number) => {
    const f = qrFormatBits(ecc, mask);
    const bit = (i: number) => ((f >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    const v = qrVersionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((v >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }

  // Los datos en zigzag: columnas de a dos desde la derecha, subiendo y bajando, saltando la 6.
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const up = ((right + 1) & 2) === 0;
    for (let v = 0; v < size; v++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const y = up ? size - 1 - v : v;
        if (fixed[y][x] || k >= stream.length * 8) continue;
        m[y][x] = ((stream[k >>> 3] >>> (7 - (k & 7))) & 1) === 1;
        k++;
      }
  }

  const apply = (mask: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[mask](x, y)) m[y][x] = !m[y][x];
    drawFormat(mask);
  };
  let mask = opts.mask !== undefined && opts.mask >= 0 && opts.mask < 8 ? Math.floor(opts.mask) : -1;
  if (mask < 0) {
    let best = Infinity;
    for (let i = 0; i < 8; i++) {
      apply(i);
      const p = qrPenalty(m);
      if (p < best) {
        best = p;
        mask = i;
      }
      apply(i); // Enmascarar dos veces es no enmascarar.
    }
  }
  apply(mask);
  return m;
}

/**
 * La matriz como el `d` de un solo `<path>` (una celda = 1 unidad), con `margin` módulos de zona
 * tranquila (4 por defecto). Las corridas horizontales van fusionadas: `M4 4h7v1h-7z`.
 */
export function qrSvgPath(matrix: boolean[][], margin = 4): string {
  let d = "";
  matrix.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let n = 1;
      while (row[x + n]) n++;
      d += `M${x + margin} ${y + margin}h${n}v1h-${n}z`;
      x += n;
    }
  });
  return d;
}
