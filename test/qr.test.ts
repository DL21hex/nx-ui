// El codificador QR contra valores publicados de ISO/IEC 18004 (generadores de Reed-Solomon,
// codewords de los ejemplos conocidos, formato, versión, capacidades, alineación) y un
// decodificador mínimo escrito aquí aparte: lee el formato y la versión, desenmascara, saca los
// bytes en zigzag, desintercala, comprueba que el síndrome RS de cada bloque sea cero y recupera el
// texto. No reemplaza a un lector real (se probó aparte con OpenCV y contra libqrencode), pero pilla
// los errores de ubicación y de orden.
import { describe, expect, it } from "vitest";
import { qrAlignment, qrBlocks, qrCapacity, qrEcCodewords, qrFormatBits, qrGenerator, qrMatrix, qrPenalty, qrSvgPath, qrVersionBits, type QrEcc } from "../src/components/handoff/qr";

// GF(256) con tablas, independiente del codificador (que multiplica bit a bit).
const EXP = new Array<number>(512);
const LOG = new Array<number>(256).fill(0);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

describe("Reed-Solomon", () => {
  it("los polinomios generadores coinciden con la tabla del estándar (exponentes de α)", () => {
    expect(qrGenerator(7)).toEqual([87, 229, 146, 149, 238, 102, 21].map((e) => EXP[e]));
    expect(qrGenerator(10)).toEqual([251, 67, 46, 61, 118, 70, 64, 94, 32, 45].map((e) => EXP[e]));
  });

  it("«01234567» 1-M (anexo I de la norma) y «HELLO WORLD» 1-M: los codewords de corrección conocidos", () => {
    expect(qrEcCodewords([16, 32, 12, 86, 97, 128, 236, 17, 236, 17, 236, 17, 236, 17, 236, 17], 10)).toEqual([165, 36, 212, 193, 237, 54, 199, 135, 44, 85]);
    expect(qrEcCodewords([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], 10)).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
  });
});

describe("formato, versión, capacidad y alineación", () => {
  it("los 32 formatos (nivel × máscara) de la tabla C.1", () => {
    const table: Record<QrEcc, number[]> = {
      L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
      M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
      Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
      H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
    };
    for (const ecc of ["L", "M", "Q", "H"] as QrEcc[]) for (let m = 0; m < 8; m++) expect(qrFormatBits(ecc, m)).toBe(table[ecc][m]);
  });

  it("los bits de versión de la tabla D.1", () => {
    expect([7, 8, 9, 10, 20, 40].map(qrVersionBits)).toEqual([0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x149a6, 0x28c69]);
  });

  it("capacidad en modo byte de las 160 combinaciones (tabla 7; la misma que da libqrencode)", () => {
    const cap: Record<QrEcc, number[]> = {
      L: [17, 32, 53, 78, 106, 134, 154, 192, 230, 271, 321, 367, 425, 458, 520, 586, 644, 718, 792, 858, 929, 1003, 1091, 1171, 1273, 1367, 1465, 1528, 1628, 1732, 1840, 1952, 2068, 2188, 2303, 2431, 2563, 2699, 2809, 2953],
      M: [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 287, 331, 362, 412, 450, 504, 560, 624, 666, 711, 779, 857, 911, 997, 1059, 1125, 1190, 1264, 1370, 1452, 1538, 1628, 1722, 1809, 1911, 1989, 2099, 2213, 2331],
      Q: [11, 20, 32, 46, 60, 74, 86, 108, 130, 151, 177, 203, 241, 258, 292, 322, 364, 394, 442, 482, 509, 565, 611, 661, 715, 751, 805, 868, 908, 982, 1030, 1112, 1168, 1228, 1283, 1351, 1423, 1499, 1579, 1663],
      H: [7, 14, 24, 34, 44, 58, 64, 84, 98, 119, 137, 155, 177, 194, 220, 250, 280, 310, 338, 382, 403, 439, 461, 511, 535, 593, 625, 658, 698, 742, 790, 842, 898, 958, 983, 1051, 1093, 1139, 1219, 1273],
    };
    for (const ecc of ["L", "M", "Q", "H"] as QrEcc[]) expect(cap[ecc].map((_, i) => qrCapacity(i + 1, ecc)), ecc).toEqual(cap[ecc]);
  });

  it("centros de alineación (anexo E)", () => {
    expect(qrAlignment(1)).toEqual([]);
    expect(qrAlignment(2)).toEqual([6, 18]);
    expect(qrAlignment(7)).toEqual([6, 22, 38]);
    expect(qrAlignment(15)).toEqual([6, 26, 48, 70]);
    expect(qrAlignment(32)).toEqual([6, 34, 60, 86, 112, 138]);
    expect(qrAlignment(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
  });

  it("elige la versión mínima: 14 bytes caben en la 1-M, 15 ya no", () => {
    expect(qrMatrix("a".repeat(14)).length).toBe(21);
    expect(qrMatrix("a".repeat(15)).length).toBe(25);
    expect(qrMatrix("a".repeat(14), { ecc: "H" }).length).toBe(25);
    expect(qrMatrix("a".repeat(15), { ecc: "H" }).length).toBe(29);
    expect(() => qrMatrix("a".repeat(2332), { ecc: "M" })).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------- decodificador mínimo

// Posiciones de alineación de la norma para las versiones que se prueban (independiente de qrAlignment).
const ALIGN: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
  11: [6, 30, 54], 12: [6, 32, 58], 13: [6, 34, 62], 14: [6, 26, 46, 66], 15: [6, 26, 48, 70], 16: [6, 26, 50, 74], 17: [6, 30, 54, 78],
};
const MASK: ((i: number, j: number) => boolean)[] = [
  (i, j) => (i + j) % 2 === 0,
  (i) => i % 2 === 0,
  (_i, j) => j % 3 === 0,
  (i, j) => (i + j) % 3 === 0,
  (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
  (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0,
  (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
  (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0,
];

function decode(m: boolean[][]): { text: string; ecc: QrEcc; mask: number; version: number } {
  const size = m.length;
  const version = (size - 17) / 4;
  expect(Number.isInteger(version)).toBe(true);
  // Formato: primera copia (alrededor del patrón de arriba a la izquierda) y segunda (partida).
  const bit = (r: number, c: number) => (m[r][c] ? 1 : 0);
  let f1 = 0;
  let f2 = 0;
  const first: [number, number][] = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  first.forEach(([r, c], i) => (f1 |= bit(r, c) << (14 - i)));
  for (let i = 0; i < 7; i++) f2 |= bit(size - 1 - i, 8) << (14 - i);
  for (let i = 0; i < 8; i++) f2 |= bit(8, size - 8 + i) << (7 - i);
  expect(f2).toBe(f1);
  let ecc: QrEcc = "M";
  let mask = -1;
  for (const e of ["L", "M", "Q", "H"] as QrEcc[]) for (let k = 0; k < 8; k++) if (qrFormatBits(e, k) === f1) [ecc, mask] = [e, k];
  expect(mask).toBeGreaterThanOrEqual(0);
  expect(bit(size - 8, 8)).toBe(1); // el módulo oscuro
  if (version >= 7) {
    let v = 0;
    for (let i = 0; i < 18; i++) v |= bit(Math.floor(i / 3), size - 11 + (i % 3)) << i;
    expect(v >> 12).toBe(version);
  }
  // Qué es función (no datos), según la norma.
  const fn = (r: number, c: number): boolean => {
    if ((r < 9 && c < 9) || (r < 9 && c >= size - 8) || (r >= size - 8 && c < 9)) return true;
    if (r === 6 || c === 6) return true;
    if (version >= 7 && ((r < 6 && c >= size - 11) || (c < 6 && r >= size - 11))) return true;
    const a = ALIGN[version];
    for (const ar of a)
      for (const ac of a) {
        if ((ar === 6 && ac === 6) || (ar === 6 && ac === a[a.length - 1]) || (ar === a[a.length - 1] && ac === 6)) continue;
        if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true;
      }
    return false;
  };
  // Zigzag: de a dos columnas desde la derecha, subiendo y bajando, sin la columna 6.
  const bits: number[] = [];
  let up = true;
  for (let c = size - 1; c > 0; c -= 2) {
    if (c === 6) c = 5;
    for (let k = 0; k < size; k++) {
      const r = up ? size - 1 - k : k;
      for (const cc of [c, c - 1]) if (!fn(r, cc)) bits.push(bit(r, cc) ^ (MASK[mask](r, cc) ? 1 : 0));
    }
    up = !up;
  }
  const { total, ec, data } = qrBlocks(version, ecc);
  const cw: number[] = [];
  for (let i = 0; i + 8 <= bits.length && cw.length < total; i += 8) cw.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  expect(cw.length).toBe(total);
  // Desintercalar: primero los datos (los bloques largos tienen uno más), después la corrección.
  const blocks = data.map(() => [] as number[]);
  let k = 0;
  for (let i = 0; i < Math.max(...data); i++) for (let b = 0; b < data.length; b++) if (i < data[b]) blocks[b].push(cw[k++]);
  const ecs = data.map(() => [] as number[]);
  for (let i = 0; i < ec; i++) for (let b = 0; b < data.length; b++) ecs[b].push(cw[k++]);
  // Síndrome: el bloque completo evaluado en α⁰…α^(ec-1) da cero.
  blocks.forEach((b, i) => {
    const poly = [...b, ...ecs[i]];
    for (let s = 0; s < ec; s++) expect(poly.reduce((acc, c) => mul(acc, EXP[s]) ^ c, 0), `bloque ${i}, síndrome ${s}`).toBe(0);
  });
  // Los datos: modo byte, largo, bytes, terminador y relleno.
  const stream = blocks.flat().flatMap((b) => [7, 6, 5, 4, 3, 2, 1, 0].map((s) => (b >> s) & 1));
  let p = 0;
  const read = (n: number) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | stream[p++];
    return v;
  };
  expect(read(4)).toBe(0b0100);
  const len = read(version < 10 ? 8 : 16);
  const bytes = Array.from({ length: len }, () => read(8));
  const rest = blocks.flat().slice(Math.ceil(p / 8) + (p % 8 === 0 && stream.length - p >= 4 ? 1 : 0));
  rest.forEach((b, i) => expect(b).toBe(i % 2 ? 0x11 : 0xec));
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), ecc, mask, version };
}

describe("ida y vuelta con el decodificador mínimo", () => {
  const url = "https://erp.ejemplo.co/m/handoff?s=7f3a9c2e&t=Xk29fLq0pZ-_aa81Hh3";
  const texts = ["a", "hola", "Señal ñandú — acción", "😀 emoji 🚀 listo", url];
  for (const n of [14, 26, 42, 62, 84, 106, 122, 152, 180, 213, 251, 300]) texts.push(`${url}&x=${"áéíóú0123456789abcdefghij".repeat(20)}`.slice(0, n));

  it("todos los textos, en los cuatro niveles, con la máscara elegida", () => {
    for (const text of texts)
      for (const ecc of ["L", "M", "Q", "H"] as QrEcc[]) {
        let m: boolean[][];
        try {
          m = qrMatrix(text, { ecc });
        } catch {
          continue;
        }
        if ((m.length - 17) / 4 > 17) continue;
        const d = decode(m);
        expect(d.text).toBe(text);
        expect(d.ecc).toBe(ecc);
      }
  });

  it("las 8 máscaras forzadas se leen igual", () => {
    for (const text of [texts[1], texts[4], texts[12]])
      for (let mask = 0; mask < 8; mask++) {
        const d = decode(qrMatrix(text, { mask }));
        expect([d.text, d.mask]).toEqual([text, mask]);
      }
  });

  it("la máscara automática es la de menor penalización", () => {
    for (const text of texts.slice(0, 8)) {
      const scores = Array.from({ length: 8 }, (_, k) => qrPenalty(qrMatrix(text, { mask: k })));
      expect(decode(qrMatrix(text)).mask).toBe(scores.indexOf(Math.min(...scores)));
    }
  });
});

describe("penalización y SVG", () => {
  it("una matriz toda clara: N1 + N2 + N4 del estándar", () => {
    const m = Array.from({ length: 21 }, () => new Array<boolean>(21).fill(false));
    // N1: 42 corridas de 21 → 42 × (3 + 16); N2: 20 × 20 bloques × 3; N4: 0 % oscuro → 9 × 10.
    expect(qrPenalty(m)).toBe(42 * 19 + 400 * 3 + 90);
  });

  it("coincide con una implementación de referencia escrita con cadenas (N1–N4)", () => {
    // Referencia: filas y columnas como texto; N3 busca 0000 1011101 y 1011101 0000 con el
    // exterior claro (se rellena con ceros), contando los solapados.
    const ref = (m: boolean[][]): number => {
      const n = m.length;
      const lines = [...m.map((r) => r.map(Number).join("")), ...m.map((_, c) => m.map((r) => Number(r[c])).join(""))];
      let score = 0;
      for (const l of lines) {
        for (const run of l.match(/0{5,}|1{5,}/g) ?? []) score += run.length - 2;
        const p = `0000${l}0000`;
        for (const pat of ["00001011101", "10111010000"]) for (let i = p.indexOf(pat); i >= 0; i = p.indexOf(pat, i + 1)) score += 40;
      }
      for (let r = 0; r + 1 < n; r++) for (let c = 0; c + 1 < n; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) score += 3;
      const dark = m.flat().filter(Boolean).length;
      return score + Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    };
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let t = 0; t < 30; t++) {
      const m = Array.from({ length: 21 }, () => Array.from({ length: 21 }, () => rnd() < 0.3 + (t % 5) * 0.1));
      expect(qrPenalty(m)).toBe(ref(m));
    }
    for (let mask = 0; mask < 8; mask++) {
      const m = qrMatrix("https://erp.ejemplo.co/m/handoff?s=1", { mask });
      expect(qrPenalty(m)).toBe(ref(m));
    }
  });

  it("un solo path con las corridas horizontales fusionadas y la zona tranquila", () => {
    expect(qrSvgPath([[true, true, false], [false, true, true]], 4)).toBe("M4 4h2v1h-2zM5 5h2v1h-2z");
    expect(qrSvgPath([[false]])).toBe("");
  });
});
