import { afterEach, describe, expect, it, vi } from "vitest";
import { safeEndpoint } from "../src/core/dom";
import {
  DEFAULT_TTL,
  cleanKind,
  countText,
  countdown,
  fill,
  fitSize,
  isFinal,
  jpegName,
  parseExpiry,
  parseHandoffEvent,
  parseHandoffItem,
  parsePhoneInfo,
  parsePollEvents,
  parseSession,
  phoneParams,
  remaining,
  retryDelay,
  sessionUrl,
  uploadVerdict,
} from "../src/components/handoff/logic";
import { HANDOFF_LABELS } from "../src/components/handoff/handoff";

afterEach(() => vi.unstubAllGlobals());

describe("parseHandoffEvent: tolerante", () => {
  it("entiende los seis tipos", () => {
    expect(parseHandoffEvent('{"type":"connected","device":"iPhone de Diego"}')).toEqual({ type: "connected", device: "iPhone de Diego" });
    expect(parseHandoffEvent('{"type":"progress","received":1,"total":3}')).toEqual({ type: "progress", received: 1, total: 3 });
    expect(parseHandoffEvent('{"type":"item","item":{"kind":"code","code":"7707123450011","format":"ean_13"}}')).toEqual({ type: "item", item: { kind: "code", code: "7707123450011", format: "ean_13" } });
    expect(parseHandoffEvent('{"type":"done"}')).toEqual({ type: "done" });
    expect(parseHandoffEvent('{"type":"expired"}')).toEqual({ type: "expired" });
    expect(parseHandoffEvent('{"type":"error","message":"Sesión cancelada"}')).toEqual({ type: "error", message: "Sesión cancelada" });
    expect(parseHandoffEvent("[DONE]")).toEqual({ type: "done" });
  });

  it("basura, tipos desconocidos e ítems incompletos no rompen: `null`", () => {
    for (const bad of [null, "", "no es json", "42", "[]", '{"type":"otro"}', '{"type":"item"}', '{"type":"item","item":{"kind":"file","name":"x.jpg"}}', '{"type":"item","item":{"kind":"code","code":"  "}}'])
      expect(parseHandoffEvent(bad), String(bad)).toBeNull();
  });

  it("normaliza: progreso sin total válido, dispositivo largo, error sin mensaje, `seq`", () => {
    expect(parseHandoffEvent({ type: "progress", received: 2.7, total: "tres" })).toEqual({ type: "progress", received: 2 });
    expect(parseHandoffEvent({ type: "progress", received: -1, total: 0 })).toEqual({ type: "progress", received: 0 });
    expect((parseHandoffEvent({ type: "connected", device: "x".repeat(200) }) as { device: string }).device).toHaveLength(60);
    expect(parseHandoffEvent({ type: "error" })).toEqual({ type: "error", message: "" });
    expect(parseHandoffEvent({ type: "done", seq: 7 })).toEqual({ type: "done", seq: 7 });
  });

  it("ítems: archivo con valores por defecto, código numérico, dato y `id`", () => {
    expect(parseHandoffItem({ kind: "file", url: "/f/1" })).toEqual({ kind: "file", name: "archivo", type: "application/octet-stream", size: 0, url: "/f/1" });
    expect(parseHandoffItem({ kind: "code", code: 7707123450011, id: 3 })).toEqual({ kind: "code", code: "7707123450011", id: "3" });
    expect(parseHandoffItem({ kind: "data", data: { lote: "A-1" } })).toEqual({ kind: "data", data: { lote: "A-1" } });
    expect(parseHandoffItem({ kind: "data" })).toBeNull();
  });

  it("polling: `{events}` o la lista sola, sin lo que no se entiende", () => {
    expect(parsePollEvents({ events: [{ type: "connected" }, { type: "nada" }, { type: "done" }] })).toEqual([{ type: "connected" }, { type: "done" }]);
    expect(parsePollEvents([{ type: "expired" }])).toEqual([{ type: "expired" }]);
    expect(parsePollEvents({ status: "waiting" })).toEqual([]);
    expect(parsePollEvents(null)).toEqual([]);
  });

  it("solo `done`, `expired` y `error` cierran la escucha", () => {
    expect(["connected", "progress", "done", "expired", "error"].map((type) => isFinal({ type, received: 0, message: "" } as never))).toEqual([false, false, true, true, true]);
  });
});

describe("sesión y vencimiento", () => {
  const now = Date.UTC(2026, 8, 26, 15, 0, 0);

  it("la sesión exige `id` y `url`; el token es opcional", () => {
    expect(parseSession({ id: "s1", url: " /m/h?s=s1&t=x ", expiresIn: 300, token: "x" }, now)).toEqual({ id: "s1", url: "/m/h?s=s1&t=x", expiresAt: now + 300_000, token: "x" });
    expect(parseSession({ id: 42, url: "/m" }, now)).toEqual({ id: "42", url: "/m", expiresAt: now + DEFAULT_TTL });
    expect(parseSession({ url: "/m" })).toBeNull();
    expect(parseSession({ id: "s1" })).toBeNull();
    expect(parseSession("{roto")).toBeNull();
  });

  it("`expiresIn` (segundos, sin desfase de reloj) gana; `expiresAt` en ISO, segundos o milisegundos", () => {
    expect(parseExpiry({ expiresIn: 60, expiresAt: "2000-01-01T00:00:00Z" }, now)).toBe(now + 60_000);
    expect(parseExpiry({ expiresAt: "2026-09-26T15:05:00Z" }, now)).toBe(now + 300_000);
    expect(parseExpiry({ expiresAt: now / 1000 + 90 }, now)).toBe(now + 90_000);
    expect(parseExpiry({ expiresAt: now + 5000 }, now)).toBe(now + 5000);
    expect(parseExpiry({ expiresAt: "mañana" }, now)).toBe(now + DEFAULT_TTL);
    expect(parseExpiry({ expiresIn: -5 }, now)).toBe(now);
  });

  it("la cuenta regresiva: m:ss, hacia arriba, nunca negativa", () => {
    expect(countdown(272_000)).toBe("4:32");
    expect(countdown(600_000)).toBe("10:00");
    expect(countdown(1)).toBe("0:01");
    expect(countdown(0)).toBe("0:00");
    expect(countdown(-3000)).toBe("0:00");
    expect(countdown(Number.NaN)).toBe("0:00");
    expect(remaining(now + 1500, now)).toBe(1500);
    expect(remaining(now - 1, now)).toBe(0);
  });

  it("lo que ve el celular: tipo válido (o foto), y solo lo que viene bien", () => {
    expect(parsePhoneInfo({ kind: "scan", title: "OC-2291", multiple: "sí", accept: "" }, now)).toEqual({ kind: "scan", title: "OC-2291" });
    expect(parsePhoneInfo({ kind: "video", multiple: true, expiresIn: 30 }, now)).toEqual({ kind: "photo", multiple: true, expiresAt: now + 30_000 });
    expect(cleanKind("file")).toBe("file");
    expect(cleanKind("signature")).toBe("signature");
    // Firmar: nombre y cédula solo si vienen en `true`.
    expect(parsePhoneInfo({ kind: "signature", askName: true, askId: "sí" }, now)).toEqual({ kind: "signature", askName: true });
    expect(cleanKind(undefined)).toBe("photo");
  });
});

describe("reintentos", () => {
  it("espera creciente 1 s, 2 s, 4 s… con tope y ±20 %", () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 10].map((n) => retryDelay(n, 1000, 15_000, mid))).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000]);
    expect(retryDelay(1, 1000, 15_000, () => 0)).toBe(800);
    expect(retryDelay(1, 1000, 15_000, () => 0.999999)).toBe(1200);
    expect(retryDelay(20, 1000, 15_000, () => 0.999999)).toBe(15000);
    expect(retryDelay(0, 1000, 15_000, mid)).toBe(1000);
  });

  it("qué hacer con la respuesta de una subida", () => {
    expect([200, 201, 204, 401, 403, 404, 410, 408, 429, 500, 503, 400, 413, 415].map(uploadVerdict)).toEqual(["ok", "ok", "ok", "gone", "gone", "gone", "gone", "retry", "retry", "retry", "retry", "fail", "fail", "fail"]);
  });
});

describe("URLs", () => {
  it("las rutas de la sesión: id codificado, barra final, consulta propia del endpoint", () => {
    expect(sessionUrl("/api/handoff", "s1")).toBe("/api/handoff/s1");
    expect(sessionUrl("/api/handoff/", "a b/c", "/events", { after: 3 })).toBe("/api/handoff/a%20b%2Fc/events?after=3");
    expect(sessionUrl("/api/handoff?tenant=7", "s1", "/items", { t: "tok+=", after: undefined })).toBe("/api/handoff/s1/items?tenant=7&t=tok%2B%3D");
  });

  it("el celular lee `?s=` y `?t=` (o `session`/`token`)", () => {
    expect(phoneParams("?s=s1&t=abc")).toEqual({ session: "s1", token: "abc" });
    expect(phoneParams("?session=s2&token=x")).toEqual({ session: "s2", token: "x" });
    expect(phoneParams("")).toEqual({ session: undefined, token: undefined });
  });

  it("el enlace del QR y los archivos: del mismo origen o de uno permitido; nunca otro esquema", () => {
    vi.stubGlobal("location", new URL("https://erp.ejemplo.co/compras/oc/2291"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(safeEndpoint("/m/handoff?s=1&t=x")).toBe("/m/handoff?s=1&t=x");
    expect(safeEndpoint("https://erp.ejemplo.co/m?s=1")).toBe("https://erp.ejemplo.co/m?s=1");
    expect(safeEndpoint("https://otro.co/m?s=1")).toBeUndefined();
    expect(safeEndpoint("//otro.co/m")).toBeUndefined();
    expect(safeEndpoint("javascript:alert(1)")).toBeUndefined();
    expect(safeEndpoint("data:text/html,x")).toBeUndefined();
    warn.mockRestore();
  });
});

describe("textos", () => {
  it("cuenta según lo pedido y rellena las plantillas", () => {
    expect(countText("photo", 1, HANDOFF_LABELS)).toBe("1 foto");
    expect(countText("photo", 2, HANDOFF_LABELS)).toBe("2 fotos");
    expect(countText("scan", 30, HANDOFF_LABELS)).toBe("30 códigos");
    expect(countText("file", 0, HANDOFF_LABELS)).toBe("0 archivos");
    expect(countText("signature", 1, HANDOFF_LABELS)).toBe("1 firma");
    expect(countText("signature", 2, HANDOFF_LABELS)).toBe("2 firmas");
    expect(fill(HANDOFF_LABELS.received, { what: "2 fotos" })).toBe("2 fotos desde el celular");
    expect(fill("{a} y {b}", { a: 1 })).toBe("1 y {b}");
  });
});

describe("fotos", () => {
  it("se reducen a 2000 px de lado mayor, sin agrandar", () => {
    expect(fitSize(4032, 3024)).toEqual({ width: 2000, height: 1500, scaled: true });
    expect(fitSize(3024, 4032)).toEqual({ width: 1500, height: 2000, scaled: true });
    expect(fitSize(1600, 1200)).toEqual({ width: 1600, height: 1200, scaled: false });
    expect(fitSize(0, 0)).toEqual({ width: 0, height: 0, scaled: false });
    expect(jpegName("IMG_2041.HEIC")).toBe("IMG_2041.jpg");
    expect(jpegName("factura.proveedor.png")).toBe("factura.proveedor.jpg");
    expect(jpegName(".png")).toBe("foto.jpg");
  });
});
