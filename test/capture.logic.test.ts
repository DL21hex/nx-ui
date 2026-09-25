import { describe, expect, it } from "vitest";
import { acceptsFile, buildValues, confidenceTier, formatBytes, normalizeBox, normalizeConfidence, parseCaptureEvent, tableRowCount } from "../src/components/capture/logic";
import type { CaptureSchemaItem } from "../src/components/capture/types";
import { lineData } from "../src/core/stream";

const ev = (line: string) => parseCaptureEvent(lineData(line));

describe("protocolo de captura", () => {
  it("page, field, check, error y done", () => {
    expect(ev('{"type":"page","n":1,"src":"/p1.png","width":1240,"height":1754}')).toEqual({ type: "page", n: 1, src: "/p1.png", width: 1240, height: 1754 });
    expect(ev('data: {"type":"field","key":"nit","value":"900","confidence":0.99,"box":{"page":1,"x":0.1,"y":0.2,"w":0.3,"h":0.02},"detail":"ok"}')).toMatchObject({
      type: "field",
      key: "nit",
      value: "900",
      confidence: 0.99,
      box: { page: 1, x: 0.1, y: 0.2, w: 0.3, h: 0.02 },
      detail: "ok",
    });
    expect(ev('{"type":"check","id":"iva","status":"error","message":"IVA mal","fields":["iva",3]}')).toEqual({ type: "check", id: "iva", status: "error", message: "IVA mal", fields: ["iva"] });
    expect(ev('{"type":"error","message":"x"}')).toEqual({ type: "error", message: "x" });
    expect(ev("data: [DONE]")).toEqual({ type: "done" });
  });

  it("un valor numérico se vuelve texto; una sugerencia también", () => {
    expect(ev('{"type":"field","key":"cant","value":40,"suggest":41}')).toMatchObject({ value: "40", suggest: "41", confidence: 1 });
  });

  it("descarta lo incompleto sin romper el stream", () => {
    for (const l of ['{"type":"field","value":"x"}', '{"type":"field","key":"a"}', '{"type":"page"}', '{"type":"check","status":"ok"}', '{"type":"otro"}', "{roto"]) expect(ev(l)).toBeNull();
  });

  it("un estado de validación desconocido cuenta como aviso", () => {
    expect(ev('{"type":"check","message":"m","status":"raro"}')).toMatchObject({ status: "warn", id: "m", fields: [] });
  });
});

describe("recuadros y confianza", () => {
  it("normalizeBox: 0–1, o 0–100 escalado; recorta y rechaza lo inválido", () => {
    expect(normalizeBox({ x: 10, y: 20, w: 30, h: 5, page: 2 })).toEqual({ page: 2, x: 0.1, y: 0.2, w: 0.3, h: 0.05 });
    expect(normalizeBox({ x: 0.9, y: 0.1, w: 0.2, h: 0.01 })).toMatchObject({ x: 0.9, w: 0.2 });
    for (const b of [null, "x", { x: 0, y: 0, w: 0, h: 1 }, { x: 0, y: 0, w: 1 }]) expect(normalizeBox(b)).toBeUndefined();
  });

  it("normalizeConfidence: 0–1, 0–100, y 1 sin dato", () => {
    expect(normalizeConfidence(0.61)).toBe(0.61);
    expect(normalizeConfidence(87)).toBe(0.87);
    expect(normalizeConfidence(undefined)).toBe(1);
  });

  it("confidenceTier según el umbral", () => {
    expect(confidenceTier(0.61, 0.8)).toBe("low");
    expect(confidenceTier(0.83, 0.8)).toBe("mid");
    expect(confidenceTier(0.95, 0.8)).toBe("high");
  });
});

describe("buildValues", () => {
  const schema: CaptureSchemaItem[] = [
    { key: "nit", label: "NIT" },
    { key: "items", label: "Ítems", type: "table", columns: [{ key: "desc", label: "D" }, { key: "cant", label: "C" }] },
    { key: "vacio", label: "Vacío" },
  ];

  it("campos como texto y tablas como filas en orden", () => {
    const flat = new Map([
      ["nit", "900"],
      ["items.1.desc", "B"],
      ["items.0.desc", "A"],
      ["items.0.cant", "2"],
      ["otra", "no está en el schema"],
    ]);
    expect(buildValues(schema, flat)).toEqual({ nit: "900", items: [{ desc: "A", cant: "2" }, { desc: "B" }] });
  });

  it("tableRowCount", () => {
    expect(tableRowCount("items", ["items.0.a", "items.3.b", "itemsx.9.a"])).toBe(4);
    expect(tableRowCount("items", [])).toBe(0);
  });
});

describe("archivos", () => {
  it("acceptsFile: extensiones, comodines y tipos exactos; sin tipo, por la extensión", () => {
    const a = "application/pdf,image/*";
    expect(acceptsFile(a, "f.pdf", "application/pdf")).toBe(true);
    expect(acceptsFile(a, "foto.JPG", "")).toBe(true);
    expect(acceptsFile(a, "f.pdf", "")).toBe(true);
    expect(acceptsFile(a, "x.exe", "application/x-msdownload")).toBe(false);
    expect(acceptsFile(a, "sin-extension", "")).toBe(false);
    expect(acceptsFile(".xml, .pdf", "Factura.XML", "")).toBe(true);
    expect(acceptsFile("", "lo-que-sea.bin", "")).toBe(true);
  });

  it("formatBytes", () => {
    expect(formatBytes(20 * 1024 * 1024)).toBe("20 MB");
    expect(formatBytes(1536, "en-US")).toBe("1.5 KB");
    expect(formatBytes(512)).toBe("512 B");
  });
});
