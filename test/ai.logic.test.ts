import { describe, expect, it } from "vitest";
import { parseAiEvent, parseBlocks, parseInline, plainText } from "../src/components/ai/logic";
import { lineData } from "../src/core/stream";

const ev = (line: string) => parseAiEvent(lineData(line));

describe("protocolo: parseAiEvent", () => {
  it("texto, pasos, fuentes, acciones, notas, error y fin", () => {
    expect(ev('{"type":"text","delta":"Hola"}')).toEqual({ type: "text", delta: "Hola" });
    expect(ev('data: {"type":"step","id":"s1","label":"Consultando","status":"run"}')).toMatchObject({ type: "step", id: "s1", status: "run" });
    expect(ev('{"type":"source","id":1,"title":"OC-2291"}')).toMatchObject({ type: "source", id: "1", title: "OC-2291" });
    expect(ev('{"type":"action","label":"Ver","href":"/x"}')).toMatchObject({ type: "action", label: "Ver", href: "/x" });
    expect(ev('{"type":"note","label":"verificado","tone":"success"}')).toEqual({ type: "note", label: "verificado", tone: "success" });
    expect(ev('{"type":"error","message":"sin cupo"}')).toEqual({ type: "error", message: "sin cupo" });
    expect(ev('{"type":"done"}')).toEqual({ type: "done" });
    expect(ev("data: [DONE]")).toEqual({ type: "done" });
  });

  it("un estado de paso desconocido es run; un tono desconocido es neutral", () => {
    expect(ev('{"type":"step","id":"a","status":"raro"}')).toMatchObject({ status: "run" });
    expect(ev('{"type":"note","label":"x","tone":"<b>"}')).toMatchObject({ tone: "neutral" });
  });

  it("descarta tipos desconocidos, formas incompletas y JSON roto sin romper el stream", () => {
    for (const l of ['{"type":"imagen","url":"x"}', '{"type":"text"}', '{"type":"source","id":"1"}', '{"type":"action"}', "{roto", ": ping", "event: x", ""]) {
      expect(ev(l)).toBeNull();
    }
  });
});

describe("markdown mínimo", () => {
  it("negrita, código y citas", () => {
    expect(parseInline("Subió **11,4 %**[^1] en `7105`")).toEqual([
      { t: "text", v: "Subió " },
      { t: "b", v: "11,4 %" },
      { t: "cite", v: "1" },
      { t: "text", v: " en " },
      { t: "code", v: "7105" },
    ]);
  });

  it("un ** sin cerrar (a mitad del streaming) queda como texto", () => {
    expect(parseInline("Subió **11,")).toEqual([{ t: "text", v: "Subió **11," }]);
  });

  it("párrafos por línea en blanco y listas con - o *", () => {
    const b = parseBlocks("Dos causas:\n\n- El acero\n* La línea 2\n\nFin.");
    expect(b.map((x) => x.kind)).toEqual(["p", "ul", "p"]);
    expect(b[1].kind === "ul" && b[1].items.length).toBe(2);
  });

  it("nunca produce HTML: < y > son texto", () => {
    expect(parseInline("<img src=x onerror=alert(1)>")).toEqual([{ t: "text", v: "<img src=x onerror=alert(1)>" }]);
  });

  it("plainText quita las marcas", () => {
    expect(plainText("Subió **11 %**[^1] en `x`")).toBe("Subió 11 % en x");
  });
});
