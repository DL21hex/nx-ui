import { describe, expect, it } from "vitest";
import { formatElapsed, normalizeProgress, parseStreamLine, splitLines } from "../src/components/button/logic";

describe("parseStreamLine", () => {
  it("NDJSON con mensaje, nivel y progreso", () => {
    expect(parseStreamLine('{"msg":"Subiendo","level":"warn","progress":0.4}')).toEqual({ msg: "Subiendo", level: "warn", progress: 0.4 });
  });

  it("SSE: data: se desenvuelve; event, id, retry y comentarios se ignoran", () => {
    expect(parseStreamLine('data: {"msg":"Hola"}')).toEqual({ msg: "Hola" });
    for (const l of ["event: progress", "id: 7", "retry: 1000", ": ping", "", "data:"]) expect(parseStreamLine(l)).toBeNull();
  });

  it("ok cierra la tarea; [DONE] también", () => {
    expect(parseStreamLine('{"ok":false,"msg":"SMTP 421"}')).toEqual({ ok: false, done: true, msg: "SMTP 421" });
    expect(parseStreamLine("data: [DONE]")).toEqual({ done: true });
  });

  it("texto plano o JSON roto se pintan como mensaje", () => {
    expect(parseStreamLine("Generando PDF")).toEqual({ msg: "Generando PDF" });
    expect(parseStreamLine("{roto")).toEqual({ msg: "{roto" });
  });

  it("descarta niveles desconocidos y un JSON sin nada útil", () => {
    expect(parseStreamLine('{"msg":"x","level":"<script>"}')).toEqual({ msg: "x" });
    expect(parseStreamLine('{"foo":1}')).toBeNull();
  });
});

describe("normalizeProgress", () => {
  it("0–1 tal cual, 0–100 se escala, lo inválido es null", () => {
    expect(normalizeProgress(0.25)).toBe(0.25);
    expect(normalizeProgress(40)).toBe(0.4);
    expect(normalizeProgress(250)).toBe(1);
    for (const v of [-1, Number.NaN, "5", null]) expect(normalizeProgress(v)).toBeNull();
  });
});

describe("splitLines", () => {
  it("devuelve las líneas completas y guarda el resto", () => {
    expect(splitLines("a\nb\r\nc")).toEqual({ lines: ["a", "b"], rest: "c" });
    expect(splitLines("sin fin")).toEqual({ lines: [], rest: "sin fin" });
  });
});

describe("formatElapsed", () => {
  it("décimas bajo 10 s, segundos bajo el minuto, m:ss después", () => {
    expect(formatElapsed(820)).toBe("0,8 s");
    expect(formatElapsed(12_400)).toBe("12 s");
    expect(formatElapsed(125_000)).toBe("2:05");
  });
});
