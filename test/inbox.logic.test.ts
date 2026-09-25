import { describe, expect, it } from "vitest";
import { applyImpact, cleanInboxItems, decisionMessage, emptyImpact, nextActive, rangeIds } from "../src/components/inbox/logic";
import { INBOX_LABELS } from "../src/components/inbox/inbox";

const IDS = ["a", "b", "c", "d", "e"];

describe("nextActive", () => {
  it("el activo sigue si no se fue", () => {
    expect(nextActive(IDS, new Set(["d"]), "b")).toBe("b");
  });
  it("si se fue, el siguiente que queda después del último que se fue", () => {
    expect(nextActive(IDS, new Set(["b"]), "b")).toBe("c");
    expect(nextActive(IDS, new Set(["b", "c"]), "b")).toBe("d");
    expect(nextActive(IDS, new Set(["b", "d"]), "b")).toBe("e");
  });
  it("al final, el anterior; sin nada, null", () => {
    expect(nextActive(IDS, new Set(["e"]), "e")).toBe("d");
    expect(nextActive(IDS, new Set(IDS), "a")).toBeNull();
    expect(nextActive([], new Set(), null)).toBeNull();
  });
});

describe("rangeIds", () => {
  it("de un id a otro, en cualquier orden", () => {
    expect(rangeIds(IDS, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeIds(IDS, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeIds(IDS, "zz", "c")).toEqual(["c"]);
  });
});

describe("cleanInboxItems", () => {
  it("exige id y título, descarta repetidos y lo que no es suyo; normaliza etiquetas y datos", () => {
    const out = cleanInboxItems([
      { id: 7, title: "OC-7", amount: 100, tags: ["Urgente", { label: "Sobre presupuesto", tone: "danger" }, { tone: "x" }, 3], facts: [{ label: "Centro", value: 12 }, { value: "sin label" }], onclick: "x" },
      { id: "7", title: "repetido" },
      { title: "sin id" },
      null,
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "7", title: "OC-7", amount: 100, tags: ["Urgente", { label: "Sobre presupuesto", tone: "danger" }], facts: [{ label: "Centro", value: "12" }] });
    expect("onclick" in out[0]).toBe(false);
  });
});

describe("decisionMessage", () => {
  const it1 = { id: "1", title: "OC-2291" };
  it("uno o varios, y los bloqueados que no se aprobaron", () => {
    expect(decisionMessage(INBOX_LABELS, "approve", [it1])).toBe("Aprobado: OC-2291");
    expect(decisionMessage(INBOX_LABELS, "reject", [it1, it1, it1])).toBe("3 rechazados");
    expect(decisionMessage(INBOX_LABELS, "approve", [it1, it1], 1)).toBe("2 aprobados · 1 bloqueado no se aprobó");
    expect(decisionMessage(INBOX_LABELS, "approve", [it1], 3)).toBe("Aprobado: OC-2291 · 3 bloqueados no se aprobaron");
    expect(decisionMessage(INBOX_LABELS, "approve", [it1], 1, 2)).toBe("Aprobado: OC-2291 · 1 bloqueado no se aprobó · 2 sin verificar no se aprobaron");
  });
});

describe("applyImpact", () => {
  it("acumula el impacto, el bloqueo y las notas", () => {
    const s = emptyImpact();
    applyImpact(s, { type: "impact", label: "2 recepciones", detail: "se revierten" });
    applyImpact(s, { type: "block", message: "Ya tiene un pago" });
    applyImpact(s, { type: "note", message: "Se notifica a 2" });
    expect(s.done).toBe(false);
    applyImpact(s, { type: "done" });
    expect(s).toEqual({ items: [{ type: "impact", label: "2 recepciones", detail: "se revierten" }], notes: ["Se notifica a 2"], block: "Ya tiene un pago", error: null, done: true });
  });
});
