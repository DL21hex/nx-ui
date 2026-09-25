// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { registerComponent, render } from "../src/bdui";
import { allowOrigins, safeEndpoint, safeImageSrc } from "../src/core/dom";
import { formatElapsed } from "../src/core/format";
import { glyph } from "../src/core/icons";
import { mergeLabels } from "../src/core/labels";
import { canonicalLocale, nxFormat, resolveLocale } from "../src/core/locale";
import { readLines, StreamLimitError } from "../src/core/stream";
import { clampDelay, extent, MAX_DELAY } from "../src/core/time";

/** Una respuesta cuyo cuerpo llega en los fragmentos dados; `cancelled` dice si se soltó. */
function chunked(chunks: string[], type = "application/x-ndjson", keepOpen = false) {
  const enc = new TextEncoder();
  const state = { cancelled: false };
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else if (!keepOpen) c.close();
    },
    cancel() {
      state.cancelled = true;
    },
  });
  return { res: new Response(body, { headers: { "content-type": type } }), state };
}

describe("readLines", () => {
  it("junta líneas partidas entre fragmentos, con \\r\\n y sin \\n final", async () => {
    const { res } = chunked(['{"a"', ':1}\r\n{"b":2}\n', '{"c":3}']);
    const lines: string[] = [];
    await readLines(res, (l) => void lines.push(l));
    expect(lines).toEqual(['{"a":1}', '{"b":2}', '{"c":3}']);
  });

  it("onLine → false corta la lectura y cancela el cuerpo aunque el servidor no cierre", async () => {
    const { res, state } = chunked(['{"type":"done"}\n'], "application/x-ndjson", true);
    await readLines(res, () => false);
    expect(state.cancelled).toBe(true);
  });

  it("si onLine lanza, cancela el cuerpo y propaga el error", async () => {
    const { res, state } = chunked(["x\n", "y\n"], "application/x-ndjson", true);
    await expect(
      readLines(res, () => {
        throw new Error("mal");
      }),
    ).rejects.toThrow("mal");
    expect(state.cancelled).toBe(true);
  });

  it("una línea sin fin más larga que el tope lanza StreamLimitError y cancela", async () => {
    const { res, state } = chunked(["a".repeat(600), "a".repeat(600)], "application/x-ndjson", true);
    await expect(readLines(res, () => {}, { maxLine: 1000 })).rejects.toBeInstanceOf(StreamLimitError);
    expect(state.cancelled).toBe(true);
  });

  it("es lineal: una línea de 4 MB en trozos de 16 KB no tarda segundos", async () => {
    const piece = "a".repeat(16 * 1024);
    const chunks = Array.from({ length: 256 }, () => piece);
    chunks.push("\n");
    const { res } = chunked(chunks);
    const t0 = performance.now();
    let len = 0;
    await readLines(res, (l) => void (len = l.length), { maxLine: 8 << 20 });
    expect(len).toBe(4 << 20);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it("SSE: un evento con varias líneas data: llega como uno solo", async () => {
    const { res } = chunked(['data: {"a":\n', "data: 1}\n\n", 'data: {"b":2}\n\n'], "text/event-stream");
    const lines: string[] = [];
    await readLines(res, (l) => void lines.push(l));
    expect(lines).toEqual(['data: {"a":\n1}', 'data: {"b":2}']);
  });

  it("SSE sin líneas vacías entre eventos: cada data: con JSON completo sale ya (y [DONE] corta)", async () => {
    const { res, state } = chunked(['data: {"a":1}\ndata: {"b":2}\ndata: [DONE]\n'], "text/event-stream", true);
    const lines: string[] = [];
    await readLines(res, (l) => (lines.push(l), l !== "data: [DONE]"));
    expect(lines).toEqual(['data: {"a":1}', 'data: {"b":2}', "data: [DONE]"]);
    expect(state.cancelled).toBe(true);
  });

  it("SSE: un comentario a mitad de evento no lo corta; U+2028 no parte la línea", async () => {
    const { res } = chunked(['data: {"a":\n: ping\ndata: "x\u2028y"}\n\n'], "text/event-stream");
    const lines: string[] = [];
    await readLines(res, (l) => void lines.push(l));
    expect(lines).toEqual(['data: {"a":\n"x\u2028y"}']);
  });

  it("SSE: un evento de miles de líneas no es cuadrático", async () => {
    const body = ["data: [", ...Array.from({ length: 5000 }, (_, i) => `data: ${i},`), "data: 0]", "", ""].join("\n");
    const { res } = chunked([body], "text/event-stream");
    const t0 = performance.now();
    let n = 0;
    await readLines(res, (l) => void (n = JSON.parse(l.slice(6)).length));
    expect(n).toBe(5001);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});

describe("safeEndpoint", () => {
  it("rutas relativas y el mismo origen pasan, resueltas", () => {
    expect(safeEndpoint(" /api/x?q=1 ")).toBe("/api/x?q=1");
    expect(safeEndpoint(`${location.origin}/y`)).toBe(`${location.origin}/y`);
    // Las plantillas no se codifican.
    expect(safeEndpoint("/items/{code}")).toBe("/items/{code}");
  });

  it("otro origen, //otro y esquemas raros no pasan", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(safeEndpoint("https://evil.example/x")).toBeUndefined();
    expect(safeEndpoint("//evil.example/x")).toBeUndefined();
    expect(safeEndpoint("javascript:alert(1)")).toBeUndefined();
    expect(safeEndpoint(42)).toBeUndefined();
    warn.mockRestore();
  });

  it("allowOrigins agrega orígenes", () => {
    allowOrigins("https://api.permitida.example");
    expect(safeEndpoint("https://api.permitida.example/v1")).toBe("https://api.permitida.example/v1");
  });

  it("safeImageSrc: https o mismo origen; nunca http de otro origen", () => {
    expect(safeImageSrc("https://cdn.example/a.png")).toBe("https://cdn.example/a.png");
    expect(safeImageSrc("http://cdn.example/a.png")).toBeUndefined();
    expect(safeImageSrc("data:image/png;base64,xx")).toBeUndefined();
  });
});

describe("locale inválido", () => {
  it("es_CO se corrige; uno que Intl no entiende cae al siguiente", () => {
    expect(canonicalLocale("es_CO")).toBe("es-CO");
    expect(canonicalLocale("xx!")).toBeNull();
    document.body.innerHTML = `<div lang="es_CO"><span id="a"></span><span id="b" locale="xx!"></span></div>`;
    expect(resolveLocale(document.getElementById("a")!)).toBe("es-CO");
    expect(resolveLocale(document.getElementById("b")!)).toBe("es-CO");
  });

  it("formatElapsed y nxFormat no lanzan", () => {
    expect(formatElapsed(800, "xx!")).toBe("0,8 s");
    expect(nxFormat("es_CO").locale).toBe("es-CO");
  });
});

describe("mergeLabels", () => {
  it("solo toma claves conocidas con texto", () => {
    const d = { a: "A", b: "B" };
    expect(mergeLabels(d, { a: null, b: "bb", c: "x" })).toEqual({ a: "A", b: "bb" });
    expect(mergeLabels(d, '{"a":5}')).toEqual(d);
    expect(mergeLabels(d, "no json")).toEqual(d);
    expect(mergeLabels(d, { __proto__: { a: "x" } })).toEqual(d);
  });
});

describe("tiempos y extremos", () => {
  it("clampDelay acota a [0, 2³¹−1]", () => {
    expect(clampDelay(3e12)).toBe(MAX_DELAY);
    expect(clampDelay(-5)).toBe(0);
    expect(clampDelay(Number.NaN, 7000)).toBe(7000);
  });

  it("extent sin spread (no lanza con 200 000 valores)", () => {
    const v = Array.from({ length: 200_000 }, (_, i) => i);
    expect(extent(v)).toEqual([0, 199_999]);
    expect(extent([Number.NaN])).toBeNull();
  });
});

describe("glyph y BDUI", () => {
  it("glyph con un nombre heredado de Object no lanza", () => {
    expect(() => glyph("constructor")).not.toThrow();
    expect(() => glyph(undefined as unknown as string)).not.toThrow();
  });

  it("registerComponent rechaza elementos nativos y props peligrosas", () => {
    expect(() => registerComponent("Link", "a", ["href"])).toThrow();
    expect(() => registerComponent("X", "x-foo", ["innerHTML"])).toThrow();
    expect(() => registerComponent("Y", "x-foo", ["onclick"])).toThrow();
    expect(() => registerComponent("Z", "x-foo", ["value", "online", "once"])).not.toThrow();
  });

  it("render avisa si el elemento no está definido", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerComponent("Nadie", "x-nadie-definido", []);
    render({ component: "Nadie" }, document.createElement("div"));
    expect(warn.mock.calls.some((c) => String(c[0]).includes("no está definido"))).toBe(true);
    warn.mockRestore();
  });
});
