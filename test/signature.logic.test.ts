import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SIGNATURE_INK,
  SIGNATURE_PEN,
  cleanInk,
  cleanSignatureMeta,
  escapeXml,
  normalizeSignedText,
  parseSignatureValue,
  safeSignatureSvg,
  signatureBounds,
  signatureCheck,
  signatureDate,
  signatureHash,
  signaturePath,
  signatureSVG,
  signatureWidth,
  smoothSignaturePoints,
  strokeWidths,
  typedSignatureSVG,
} from "../src/components/signature/logic";
import type { SignaturePoint, SignatureStroke } from "../src/components/signature/types";

/** Un trazo con los puntos dados (x, y), 10 ms entre uno y otro. */
const stroke = (pts: [number, number][], type: SignatureStroke["type"] = "mouse", dt = 10, p = 0.5): SignatureStroke => ({
  type,
  points: pts.map(([x, y], i) => ({ x, y, t: i * dt, p })),
});
/** Una firma de verdad: una onda que sube y baja a lo ancho (lo que hace una mano al firmar). */
const WAVE = stroke(Array.from({ length: 60 }, (_, i) => [20 + i * 4, 60 + Math.sin(i / 3) * 18] as [number, number]));

describe("signatureWidth / strokeWidths", () => {
  it("despacio es grueso, rápido es fino, con topes", () => {
    expect(signatureWidth(0)).toBe(SIGNATURE_PEN.max);
    expect(signatureWidth(SIGNATURE_PEN.speed)).toBe(SIGNATURE_PEN.min);
    expect(signatureWidth(50)).toBe(SIGNATURE_PEN.min);
    expect(signatureWidth(1.1)).toBeGreaterThan(SIGNATURE_PEN.min);
    expect(signatureWidth(1.1)).toBeLessThan(SIGNATURE_PEN.max);
    // Basura no rompe: velocidad negativa, NaN o infinita.
    expect(signatureWidth(-3)).toBe(SIGNATURE_PEN.max);
    expect(signatureWidth(Number.NaN)).toBe(SIGNATURE_PEN.max);
    expect(signatureWidth(Infinity)).toBe(SIGNATURE_PEN.max);
  });
  it("la presión solo cuenta con lápiz: más presión, más grueso", () => {
    expect(signatureWidth(0, 1, false)).toBe(signatureWidth(0, 0, false));
    const light = signatureWidth(0, 0.1, true);
    const mid = signatureWidth(0, 0.5, true);
    const hard = signatureWidth(0, 1, true);
    expect(light).toBeLessThan(mid);
    expect(mid).toBeLessThan(hard);
    expect(mid).toBe(SIGNATURE_PEN.max);
    expect(signatureWidth(0, 0, true)).toBeGreaterThanOrEqual(0.4);
    expect(signatureWidth(0, 7, true)).toBe(hard);
  });
  it("el ancho a lo largo del trazo cambia suave (filtro) y responde a la velocidad", () => {
    // 20 puntos despacio y luego 20 rápido.
    const pts: SignaturePoint[] = [];
    let t = 0;
    for (let i = 0; i < 40; i++) {
      t += 10;
      pts.push({ x: i < 20 ? i : 20 + (i - 20) * 40, y: 0, t, p: 0.5 });
    }
    const w = strokeWidths({ type: "touch", points: pts });
    expect(w).toHaveLength(40);
    expect(w[0]).toBe(SIGNATURE_PEN.max);
    expect(w[19]).toBeGreaterThan(3);
    expect(w[39]).toBeLessThan(1.3);
    for (let i = 1; i < w.length; i++) expect(Math.abs(w[i] - w[i - 1])).toBeLessThan(1);
  });
  it("con lápiz, la presión de cada punto cuenta", () => {
    const soft = strokeWidths(stroke([[0, 0], [1, 0], [2, 0]], "pen", 10, 0.1));
    const hard = strokeWidths(stroke([[0, 0], [1, 0], [2, 0]], "pen", 10, 0.9));
    expect(hard[2]).toBeGreaterThan(soft[2] * 2);
  });
  it("dos puntos con el mismo tiempo no dividen entre cero", () => {
    const w = strokeWidths(stroke([[0, 0], [30, 0]], "mouse", 0));
    expect(w.every(Number.isFinite)).toBe(true);
  });
});

describe("smoothSignaturePoints", () => {
  it("quita el temblor (puntos a menos de 1,5 px) y deja las puntas donde estaban", () => {
    const pts = stroke([[0, 0], [0.5, 0], [1, 0.2], [10, 0], [20, 10], [20.4, 10.3]]).points;
    const s = smoothSignaturePoints(pts);
    expect(s[0]).toEqual(pts[0]);
    expect(s[s.length - 1]).toEqual(pts[pts.length - 1]);
    expect(s).toHaveLength(4);
  });
  it("promedia 1-2-1 los puntos interiores y conserva t y p", () => {
    const s = smoothSignaturePoints(stroke([[0, 0], [10, 10], [20, 0]]).points);
    expect(s[1]).toEqual({ x: 10, y: 5, t: 10, p: 0.5 });
  });
  it("vacío y un solo punto", () => {
    expect(smoothSignaturePoints([])).toEqual([]);
    expect(smoothSignaturePoints([{ x: 1, y: 2, t: 0, p: 0.5 }])).toEqual([{ x: 1, y: 2, t: 0, p: 0.5 }]);
  });
  it("10 000 puntos en tiempo lineal", () => {
    const big = Array.from({ length: 10_000 }, (_, i) => ({ x: i, y: Math.sin(i) * 20, t: i, p: 0.5 }));
    const t0 = performance.now();
    expect(smoothSignaturePoints(big).length).toBeGreaterThan(5000);
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("signaturePath", () => {
  it("un contorno cerrado: un lado con cuadráticas por puntos medios, punta redonda, el otro lado y la otra punta", () => {
    const d = signaturePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], [2, 2, 2]);
    // Lado izquierdo (y +1), punta en arco hasta el derecho (y -1), vuelta y arco al comienzo.
    expect(d).toBe("M0 1Q10 1 15 1L20 1A1 1 0 0 0 20 -1Q10 -1 5 -1L0 -1A1 1 0 0 0 0 1Z");
  });
  it("desplazado con dx/dy (el recorte del SVG) y redondeado a un decimal", () => {
    const d = signaturePath([{ x: 10.123, y: 5 }, { x: 20.456, y: 5 }], [3, 3], -10, -5);
    expect(d).toBe("M0.1 1.5L10.5 1.5A1.5 1.5 0 0 0 10.5 -1.5L0.1 -1.5A1.5 1.5 0 0 0 0.1 1.5Z");
  });
  it("un punto (o un toque sin moverse) es un círculo, para el punto de una «i»", () => {
    expect(signaturePath([{ x: 5, y: 5 }], [2])).toBe("M3.7 5a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0 -2.6 0Z");
    expect(signaturePath([{ x: 5, y: 5 }, { x: 5.2, y: 5 }], [2, 2])).toMatch(/^M3\.7 5a1\.3/);
    expect(signaturePath([], [])).toBe("");
  });
  it("el ancho varía por punto", () => {
    const d = signaturePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }], [4, 2, 1]);
    expect(d.startsWith("M0 2Q10 1")).toBe(true);
    expect(d).toContain("A0.5 0.5");
    expect(d).toContain("A2 2");
  });
  it("con anchos que faltan usa el último y no produce NaN", () => {
    const d = signaturePath([{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }], [2]);
    expect(d).not.toContain("NaN");
  });
});

describe("signatureBounds / signatureCheck", () => {
  it("el recuadro de lo firmado con margen, y null sin nada", () => {
    expect(signatureBounds([stroke([[10, 20], [50, 40]]), stroke([[5, 30]])], 8)).toEqual({ x: -3, y: 12, width: 61, height: 36 });
    expect(signatureBounds([], 8)).toBeNull();
    expect(signatureBounds([{ type: "mouse", points: [] }])).toBeNull();
  });
  it("una firma de verdad vale; un punto, una raya o algo mínimo no", () => {
    expect(signatureCheck([WAVE])).toBeNull();
    expect(signatureCheck([])).toBe("empty");
    expect(signatureCheck([{ type: "touch", points: [] }])).toBe("empty");
    expect(signatureCheck([stroke([[10, 10]])])).toBe("short");
    // Una raya horizontal larga (no tiene alto) y una diagonal recta (el recorrido es la diagonal).
    expect(signatureCheck([stroke([[10, 50], [300, 52]])])).toBe("short");
    expect(signatureCheck([stroke([[10, 10], [150, 120]])])).toBe("short");
    // Garabato diminuto.
    expect(signatureCheck([stroke([[0, 0], [5, 5], [0, 10], [5, 15]])])).toBe("short");
  });
  it("el mínimo se puede ajustar", () => {
    const tiny = stroke([[0, 0], [5, 5], [0, 10], [5, 15], [0, 20]]);
    expect(signatureCheck([tiny], { length: 10, width: 3, height: 3 })).toBeNull();
  });
  it("50 000 puntos en tiempo lineal", () => {
    const big = stroke(Array.from({ length: 50_000 }, (_, i) => [i % 400, (i * 7) % 90] as [number, number]));
    const t0 = performance.now();
    expect(signatureCheck([big])).toBeNull();
    expect(signatureBounds([big])).not.toBeNull();
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("signatureSVG / typedSignatureSVG", () => {
  it("un <path> por trazo, recortado a lo firmado, con la tinta", () => {
    const svg = signatureSVG([WAVE, stroke([[30, 90], [120, 95], [200, 88]])]);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ')).toBe(true);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain(`<g fill="${SIGNATURE_INK}">`);
    const b = signatureBounds([WAVE, stroke([[30, 90], [120, 95], [200, 88]])])!;
    expect(svg).toContain(`width="${b.width}" height="${b.height}"`);
    // Nada queda fuera del recuadro: las coordenadas van desde el margen.
    const nums = [...svg.matchAll(/d="([^"]+)"/g)].flatMap((m) => m[1].match(/-?\d+(\.\d+)?/g)!.map(Number));
    expect(Math.min(...nums)).toBeGreaterThan(-1);
    expect(signatureSVG([])).toBe("");
  });
  it("una tinta rara no rompe el marcado", () => {
    expect(signatureSVG([WAVE], 'red" onload="x')).toContain(`fill="${SIGNATURE_INK}"`);
    expect(signatureSVG([WAVE], "oklch(0.3 0.1 260)")).toContain('fill="oklch(0.3 0.1 260)"');
    expect(cleanInk("#123")).toBe("#123");
    expect(cleanInk("navy")).toBe("navy");
    expect(cleanInk("<b>")).toBe(SIGNATURE_INK);
    expect(cleanInk(null)).toBe(SIGNATURE_INK);
  });
  it("la firma escrita: el nombre en cursiva del sistema, escapado", () => {
    const svg = typedSignatureSVG('  Ana  <María> "Pérez" ', "#000");
    expect(svg).toContain("font-family=\"'Segoe Script'");
    expect(svg).toContain("cursive");
    expect(svg).toContain("Ana &#60;María&#62; &#34;Pérez&#34;");
    expect(svg).not.toContain("<María>");
    expect(typedSignatureSVG("   ")).toBe("");
    // Nombres larguísimos se recortan.
    expect(typedSignatureSVG("x".repeat(500)).match(/>x+</)![0].length).toBe(82);
    // Un nombre con «on…=» o «javascript:» sigue siendo un SVG que se puede volver a cargar.
    expect(parseSignatureValue(typedSignatureSVG("Leon onda=1 javascript"))).not.toBeNull();
  });
  it("escapeXml escapa lo que abre marcado o atributos", () => {
    expect(escapeXml(`<a href="x" b='y'>&=`)).toBe("&#60;a href&#61;&#34;x&#34; b&#61;&#39;y&#39;&#62;&#38;&#61;");
  });
});

describe("parseSignatureValue / safeSignatureSvg / cleanSignatureMeta", () => {
  const svg = signatureSVG([WAVE]);
  it("{svg, meta} como objeto o JSON, o el SVG solo", () => {
    const meta = { signedAt: "2026-09-28T20:42:00.000Z", name: " Diego Llinás ", id: "1047", typed: false, strokes: 1, points: 60, width: 10, height: 5, device: "touch" };
    const a = parseSignatureValue({ svg, meta })!;
    expect(a.svg).toBe(svg);
    expect(a.meta).toEqual({ ...meta, name: "Diego Llinás" });
    expect(parseSignatureValue(JSON.stringify({ svg, meta }))!.meta.device).toBe("touch");
    const b = parseSignatureValue(svg)!;
    expect(b.meta.width).toBe(signatureBounds([WAVE])!.width);
    expect(b.meta).toMatchObject({ signedAt: "", typed: false, device: "pointer" });
  });
  it("rechaza lo que no es un SVG seguro", () => {
    expect(parseSignatureValue(null)).toBeNull();
    expect(parseSignatureValue("{malo")).toBeNull();
    expect(parseSignatureValue({ meta: {} })).toBeNull();
    expect(parseSignatureValue("<div>hola</div>")).toBeNull();
    expect(safeSignatureSvg('<svg><script>alert(1)</script></svg>')).toBeNull();
    expect(safeSignatureSvg('<svg onload="alert(1)"></svg>')).toBeNull();
    expect(safeSignatureSvg('<svg><a href="javascript:x"/></svg>')).toBeNull();
    expect(safeSignatureSvg("<svg><foreignObject/></svg>")).toBeNull();
    expect(safeSignatureSvg(`  ${svg}  `)).toBe(svg);
  });
  it("metadatos: solo claves conocidas con su tipo; hash de 64 hex; geo con números", () => {
    const m = cleanSignatureMeta({ signedAt: 5, name: "", id: 1047, typed: "sí", strokes: Infinity, device: "robot", hash: "abc", geo: { lat: 10.4, lng: -75.5, accuracy: 12 }, __proto__x: 1, extra: "x" });
    expect(m).toEqual({ signedAt: "", typed: false, strokes: 0, points: 0, width: 0, height: 0, device: "pointer", geo: { lat: 10.4, lng: -75.5, accuracy: 12 } });
    expect(cleanSignatureMeta({ hash: "a".repeat(64), geo: { lat: "10", lng: 3 } })).toMatchObject({ hash: "a".repeat(64) });
    expect(cleanSignatureMeta({ geo: { lat: "10", lng: 3 } }).geo).toBeUndefined();
    expect(cleanSignatureMeta(null).device).toBe("pointer");
    expect(cleanSignatureMeta({ name: "x".repeat(500) }).name).toHaveLength(200);
  });
});

describe("huella y fecha", () => {
  it("normaliza: NFC, espacios seguidos a uno, sin espacios en las puntas", () => {
    expect(normalizeSignedText("  Remisión\n\n  RM-1\t 6 ítems  ")).toBe("Remisión RM-1 6 ítems");
    // «é» compuesta y descompuesta dan lo mismo.
    expect(normalizeSignedText("Café")).toBe(normalizeSignedText("Café"));
  });
  it("SHA-256 en hex del texto normalizado + fecha (crypto.subtle de Node)", async () => {
    const at = "2026-09-28T20:42:00.000Z";
    const want = createHash("sha256").update(`Remisión RM-1 6 ítems\n${at}`, "utf8").digest("hex");
    expect(await signatureHash("  Remisión \n RM-1   6 ítems ", at)).toBe(want);
    expect(await signatureHash("Remisión RM-1 6 ítems", "2026-09-28T20:43:00.000Z")).not.toBe(want);
    expect(want).toMatch(/^[0-9a-f]{64}$/);
  });
  it("sin crypto.subtle (http en una intranet): sin huella", async () => {
    const orig = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      expect(await signatureHash("x", "y")).toBeUndefined();
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: orig, configurable: true });
    }
  });
  it("la fecha del sello en el locale, sin los «de»", () => {
    const at = new Date(2026, 8, 28, 15, 42).toISOString();
    expect(signatureDate(at, "es-CO")).toBe("28 sept 2026, 3:42 p. m.");
    expect(signatureDate(at, "en-US")).toBe("Sep 28, 2026, 3:42 PM");
    expect(signatureDate("", "es-CO")).toBe("");
    expect(signatureDate("no es fecha")).toBe("");
  });
});

describe("SSR", () => {
  it("el módulo del elemento importa sin DOM (no lanza ni registra nada)", async () => {
    expect(typeof globalThis.HTMLElement).toBe("undefined");
    const mod = await import("../src/components/signature/index");
    expect(typeof mod.NxSignature).toBe("function");
    expect(mod.SIGNATURE_LABELS.confirm).toBe("Firmar");
  });
});
