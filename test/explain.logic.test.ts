import { describe, expect, it } from "vitest";
import { applyEvent, balance, change, changeTone, emptyState, parseExplainEvent } from "../src/components/explain/logic";
import type { ExplainEvent } from "../src/components/explain/types";

const line = (o: object) => parseExplainEvent(JSON.stringify(o));
const build = (events: object[]) => {
  const s = emptyState();
  for (const o of events) {
    const ev = line(o);
    if (ev) applyEvent(s, ev);
  }
  return s;
};

describe("parseExplainEvent", () => {
  it("valida cada tipo; lo que no cumple la forma se ignora", () => {
    expect(line({ type: "value", value: 10829000, format: "money", currency: "COP", label: "Total" })).toEqual({ type: "value", value: 10829000, format: "money", currency: "COP", label: "Total", detail: undefined });
    expect(line({ type: "term", label: "IVA", value: 1729000, op: "+", source: 1 })).toMatchObject({ type: "term", label: "IVA", op: "+", source: "1" });
    expect(line({ type: "term", value: 5 })).toBeNull(); // sin label
    expect(line({ type: "term", label: "x", value: { a: 1 } })).toBeNull(); // valor que no es número ni texto
    expect(line({ type: "compare", label: "agosto", value: 9.5e6, better: "down" })).toEqual({ type: "compare", label: "agosto", value: 9.5e6, better: "down" });
    expect(line({ type: "raro" })).toBeNull();
    expect(parseExplainEvent("no es json")).toBeNull();
    expect(parseExplainEvent("[DONE]")).toEqual({ type: "done" });
  });

  it("normaliza los operadores escritos a mano: − x * /", () => {
    expect((line({ type: "term", label: "a", value: 1, op: "−" }) as ExplainEvent & { op: string }).op).toBe("-");
    expect((line({ type: "term", label: "a", value: 1, op: "x" }) as ExplainEvent & { op: string }).op).toBe("×");
    expect((line({ type: "term", label: "a", value: 1, op: "/" }) as ExplainEvent & { op: string }).op).toBe("÷");
    expect((line({ type: "term", label: "a", value: 1, op: "%" }) as ExplainEvent & { op?: string }).op).toBeUndefined();
  });

  it("un formato desconocido se descarta (se deduce al pintar)", () => {
    expect((line({ type: "value", value: 1, format: "html" }) as { format?: string }).format).toBeUndefined();
  });
});

describe("applyEvent y balance", () => {
  const FACTURA = [
    { type: "value", label: "Total factura", value: 10601500, format: "money", currency: "COP" },
    { type: "term", label: "Subtotal", value: 9100000 },
    { type: "term", label: "IVA 19 %", value: 1729000 },
    { type: "term", label: "Retención", value: 227500, op: "-" },
    { type: "source", id: "mayor", title: "Libro mayor" },
    { type: "source", id: "mayor", title: "Repetida" },
    { type: "text", delta: "Subió por " },
    { type: "text", delta: "el IVA." },
    { type: "done" },
  ];

  it("arma el desglose: cabecera, términos, fuentes sin repetir y el texto acumulado", () => {
    const s = build(FACTURA);
    expect(s.head?.label).toBe("Total factura");
    expect(s.terms).toHaveLength(3);
    expect(s.sources.map((x) => x.title)).toEqual(["Libro mayor"]);
    expect(s.text).toBe("Subió por el IVA.");
    expect(s.done).toBe(true);
  });

  it("cuadra: suma y resta (el `-` resta el valor absoluto)", () => {
    expect(balance(build(FACTURA))).toEqual({ sum: 10601500, total: 10601500, ok: true });
  });

  it("no cuadra: lo dice con la suma y la cifra", () => {
    const s = build([...FACTURA.slice(0, 3), { type: "done" }]);
    expect(balance(s)).toEqual({ sum: 10829000, total: 10601500, ok: false });
  });

  it("`total` manda sobre la cabecera; los `=` son subtotales y no suman", () => {
    const s = build([{ type: "value", value: "N/D" }, { type: "term", label: "a", value: 0.1 }, { type: "term", label: "b", value: 0.2 }, { type: "term", label: "sub", value: 0.3, op: "=" }, { type: "total", value: 0.3 }]);
    expect(balance(s)?.ok).toBe(true); // 0,1 + 0,2 ≠ 0,3 en coma flotante, pero cuadra
  });

  it("con una multiplicación, un texto o sin cifra no se puede saber: null", () => {
    expect(balance(build([{ type: "value", value: 100 }, { type: "term", label: "precio", value: 10 }, { type: "term", label: "cantidad", value: 10, op: "×" }]))).toBeNull();
    expect(balance(build([{ type: "value", value: 100 }, { type: "term", label: "a", value: "cien" }]))).toBeNull();
    expect(balance(build([{ type: "value", value: "cien" }, { type: "term", label: "a", value: 100 }]))).toBeNull();
    expect(balance(build([{ type: "value", value: 100 }]))).toBeNull();
  });

  it("un error termina el desglose", () => {
    const s = build([{ type: "term", label: "a", value: 1 }, { type: "error", message: "timeout" }]);
    expect(s.done).toBe(true);
    expect(s.error).toBe("timeout");
  });
});

describe("change y changeTone", () => {
  it("el cambio relativo, y su tono según si subir es bueno", () => {
    expect(change(114, 100)).toBeCloseTo(0.14);
    expect(change(80, -100)).toBeCloseTo(1.8);
    expect(change(5, 0)).toBeNull();
    expect(changeTone(0.14)).toBe("neutral");
    expect(changeTone(0.14, "up")).toBe("success");
    expect(changeTone(0.14, "down")).toBe("danger");
    expect(changeTone(-0.1, "down")).toBe("success");
  });
});
