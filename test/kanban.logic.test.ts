import { describe, expect, it } from "vitest";
import { boardStep, cleanCards, cleanColumns, columnCards, columnTotals, fill, isLate, matchesCard, moveCard, positionOf, wipState } from "../src/components/kanban/logic";

const CARDS = cleanCards([
  { id: "a", column: "draft", title: "OC-2291", amount: 100, currency: "COP" },
  { id: "b", column: "review", title: "OC-2310", amount: 50, currency: "COP" },
  { id: "c", column: "draft", title: "OC-2318", amount: 20, currency: "USD" },
  { id: "d", column: "review", title: "OC-2322" },
  { id: "e", column: "draft", title: "OC-2325", amount: 5, currency: "COP" },
]);
const order = (cards: typeof CARDS, col: string) => columnCards(cards, col).map((c) => c.id);

describe("cleanColumns y cleanCards", () => {
  it("validan, descartan lo que no es suyo y los id repetidos", () => {
    const cols = cleanColumns([
      { id: "draft", label: "Borrador", tone: "neutral", wip: 0, onclick: "x" },
      { id: "review", label: "Por aprobar", wip: 5.7, tone: "rojo" },
      { id: "void", label: "Anulado", confirm: { heading: "¿Anular {title}?", impact: "/impacto", hold: true, extra: 1 }, collapsed: true },
      { id: "void", label: "Repetida" },
      { id: 7, label: "Numérica", confirm: { impact: "/sin-titulo" } },
      { label: "Sin id" },
      null,
    ]);
    expect(cols.map((c) => c.id)).toEqual(["draft", "review", "void", "7"]);
    expect(cols[0]).toEqual({ id: "draft", label: "Borrador", tone: "neutral", wip: undefined, confirm: undefined, collapsed: undefined });
    expect(cols[1].wip).toBe(5);
    expect(cols[1].tone).toBeUndefined();
    expect(cols[2].confirm).toEqual({ heading: "¿Anular {title}?", message: undefined, impact: "/impacto", hold: true, tone: undefined, confirmLabel: undefined });
    expect(cols[2].collapsed).toBe(true);
    // Una confirmación sin título no es una confirmación.
    expect(cols[3].confirm).toBeUndefined();
  });

  it("las tarjetas necesitan id, columna y título; los montos, números; las etiquetas, texto", () => {
    const cards = cleanCards([
      { id: 1, column: "draft", title: "Ok", amount: "100", tags: ["Urgente", { label: "Nuevo", tone: "warning" }, { tone: "danger" }, 3], innerHTML: "<b>x</b>" },
      { id: "x", column: "draft" },
      { id: "1", column: "draft", title: "Repetida" },
      { id: "y", title: "Sin columna" },
    ]);
    expect(cards).toHaveLength(1);
    expect(cards[0].id).toBe("1");
    expect(cards[0].amount).toBeUndefined();
    expect(cards[0].tags).toEqual(["Urgente", { label: "Nuevo", tone: "warning" }]);
    expect("innerHTML" in cards[0]).toBe(false);
    expect(cleanCards("nada")).toEqual([]);
  });
});

describe("mover y reordenar", () => {
  it("dentro de la columna: sube, baja y va al final", () => {
    expect(order(moveCard(CARDS, "e", "draft", 0), "draft")).toEqual(["e", "a", "c"]);
    expect(order(moveCard(CARDS, "a", "draft", 1), "draft")).toEqual(["c", "a", "e"]);
    expect(order(moveCard(CARDS, "a", "draft", 99), "draft")).toEqual(["c", "e", "a"]);
  });

  it("a otra columna: en la posición pedida, y la tarjeta cambia de columna sin tocar el original", () => {
    const next = moveCard(CARDS, "c", "review", 1);
    expect(order(next, "review")).toEqual(["b", "c", "d"]);
    expect(order(next, "draft")).toEqual(["a", "e"]);
    expect(next.find((c) => c.id === "c")!.column).toBe("review");
    expect(CARDS.find((c) => c.id === "c")!.column).toBe("draft");
    expect(next).toHaveLength(CARDS.length);
  });

  it("a una columna vacía, y con índices fuera de rango", () => {
    expect(order(moveCard(CARDS, "b", "done", 3), "done")).toEqual(["b"]);
    expect(order(moveCard(CARDS, "b", "draft", -4), "draft")).toEqual(["b", "a", "c", "e"]);
    expect(moveCard(CARDS, "zzz", "draft", 0).map((c) => c.id)).toEqual(CARDS.map((c) => c.id));
  });

  it("deshacer es mover de vuelta a donde estaba", () => {
    const from = positionOf(CARDS, "c")!;
    expect(from).toEqual({ column: "draft", index: 1 });
    const back = moveCard(moveCard(CARDS, "c", "review", 0), "c", from.column, from.index);
    // Lo que importa es el orden de cada columna (el orden entre columnas no significa nada).
    for (const col of ["draft", "review"]) expect(order(back, col)).toEqual(order(CARDS, col));
    expect(positionOf(CARDS, "nada")).toBeNull();
  });
});

describe("totales y límites", () => {
  it("cuenta y suma por moneda", () => {
    expect(columnTotals(CARDS, "draft")).toEqual({ count: 3, sums: [{ currency: "COP", amount: 105 }, { currency: "USD", amount: 20 }] });
    expect(columnTotals(CARDS, "review")).toEqual({ count: 2, sums: [{ currency: "COP", amount: 50 }] });
    expect(columnTotals(CARDS, "done")).toEqual({ count: 0, sums: [] });
  });

  it("WIP: lleno al llegar, pasado al superarlo, nada sin límite", () => {
    expect(wipState(4, 5)).toBeNull();
    expect(wipState(5, 5)).toBe("full");
    expect(wipState(6, 5)).toBe("over");
    expect(wipState(60, undefined)).toBeNull();
  });
});

describe("filtro", () => {
  it("sin tildes ni mayúsculas, todas las palabras, en cualquier campo", () => {
    const card = cleanCards([{ id: "2291", column: "x", title: "OC-2291", subtitle: "Aceros del Caribe", assignee: "Ana María Rincón", tags: [{ label: "Producción" }] }])[0];
    expect(matchesCard(card, "")).toBe(true);
    expect(matchesCard(card, "maria")).toBe(true);
    expect(matchesCard(card, "PRODUCCION caribe")).toBe(true);
    expect(matchesCard(card, "caribe logistica")).toBe(false);
  });
});

describe("teclado", () => {
  const sizes = [3, 0, -1, 2];
  it("sin levantar: solo entre tarjetas que existen, saltando vacías y plegadas", () => {
    expect(boardStep(sizes, { col: 0, index: 0 }, "ArrowDown", false)).toEqual({ col: 0, index: 1 });
    expect(boardStep(sizes, { col: 0, index: 2 }, "ArrowDown", false)).toBeNull();
    expect(boardStep(sizes, { col: 0, index: 0 }, "ArrowUp", false)).toBeNull();
    expect(boardStep(sizes, { col: 0, index: 2 }, "ArrowRight", false)).toEqual({ col: 3, index: 1 });
    expect(boardStep(sizes, { col: 3, index: 0 }, "ArrowLeft", false)).toEqual({ col: 0, index: 0 });
    expect(boardStep(sizes, { col: 0, index: 1 }, "End", false)).toEqual({ col: 0, index: 2 });
    expect(boardStep(sizes, { col: 0, index: 1 }, "x", false)).toBeNull();
  });

  it("levantada: una posición más (el final) y se puede llegar a una columna vacía", () => {
    expect(boardStep(sizes, { col: 0, index: 2 }, "ArrowDown", true)).toEqual({ col: 0, index: 3 });
    expect(boardStep(sizes, { col: 0, index: 2 }, "ArrowRight", true)).toEqual({ col: 1, index: 0 });
    expect(boardStep(sizes, { col: 1, index: 0 }, "ArrowRight", true)).toEqual({ col: 3, index: 0 });
    expect(boardStep(sizes, { col: 3, index: 0 }, "End", true)).toEqual({ col: 3, index: 2 });
    expect(boardStep(sizes, { col: 3, index: 0 }, "ArrowRight", true)).toBeNull();
  });
});

describe("utilidades", () => {
  it("vencida y textos", () => {
    expect(isLate("2026-09-20", "2026-09-25")).toBe(true);
    expect(isLate("2026-09-25", "2026-09-25")).toBe(false);
    expect(isLate("pronto", "2026-09-25")).toBe(false);
    expect(fill("Columna {column}, posición {i} de {n}", { column: "Aprobado", i: 2, n: 5 })).toBe("Columna Aprobado, posición 2 de 5");
    expect(fill("{nada}", {})).toBe("{nada}");
  });
});
