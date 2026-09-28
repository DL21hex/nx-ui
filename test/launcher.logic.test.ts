import { describe, expect, it } from "vitest";
import { balanceColumns, clampMeter, firstTarget, fitColumns, itemHref, matchItem, moveIndex, progressParts, sectionCells, sparkPaths } from "../src/components/launcher/logic";
import type { LauncherItem } from "../src/components/launcher/types";

const ITEMS: LauncherItem[] = [
  { id: "cert", label: "Certificados laborales", description: "Para bancos y arriendos", views: [{ label: "Con salario", href: "/cert/con" }, { label: "Sin salario", href: "/cert/sin" }] },
  { id: "perm", label: "Permisos", description: "Pide y aprueba permisos", views: [{ label: "Propias" }, { label: "De mis colaboradores", badge: 3 }] },
  { id: "pay", label: "Desprendibles de pago", views: [{ label: "Última", hint: "15 sep 2026" }, { label: "Todas" }] },
  { id: "ces", label: "Cesantías", href: "/cesantias" },
];
const n = (count: number, featured = false) => Array.from({ length: count }, () => ({ featured }));

describe("matchItem / firstTarget", () => {
  it("encuentra sin tildes ni mayúsculas, por nombre, descripción o vista", () => {
    expect(matchItem(ITEMS[3], "cesantias")).toEqual({ own: true, views: [] });
    expect(matchItem(ITEMS[0], "BANCOS")).toEqual({ own: true, views: [] });
    expect(matchItem(ITEMS[1], "colab")).toEqual({ own: false, views: [1] });
    expect(matchItem(ITEMS[2], "zzz")).toBeNull();
    expect(matchItem(ITEMS[2], "  ")).toEqual({ own: true, views: [] });
  });
  it("Enter abre la primera tarjeta; si coincide solo una vista, esa vista", () => {
    expect(firstTarget(ITEMS, "")).toBeNull();
    expect(firstTarget(ITEMS, "permis")).toMatchObject({ item: ITEMS[1], view: null, viewIndex: -1 });
    expect(firstTarget(ITEMS, "sin sal")).toMatchObject({ item: ITEMS[0], view: ITEMS[0].views![1], viewIndex: 1 });
    // Coincide el nombre de la tarjeta y una vista: gana la tarjeta.
    expect(firstTarget(ITEMS, "salario")?.view).not.toBeNull();
    expect(firstTarget([{ id: "x", label: "Salarios", views: [{ label: "Salario base" }] }], "salario")?.view).toBeNull();
    expect(firstTarget(ITEMS, "nada que ver")).toBeNull();
  });
  it("aguanta datos raros del backend", () => {
    const odd = { id: "o", label: 5, description: null, views: [null, { label: undefined }] } as unknown as LauncherItem;
    expect(matchItem(odd, "5")).toEqual({ own: true, views: [] });
    expect(matchItem(odd, "x")).toBeNull();
  });
});

describe("columnas", () => {
  it("cuenta las que caben sin pasar del máximo", () => {
    expect(fitColumns(1100, 240, 12, 4)).toBe(4);
    expect(fitColumns(800, 240, 12, 4)).toBe(3);
    expect(fitColumns(500, 240, 12, 4)).toBe(2);
    expect(fitColumns(300, 240, 12, 4)).toBe(1);
    expect(fitColumns(2000, 240, 12, 4)).toBe(4);
    expect(fitColumns(0, 240, 12, 4)).toBe(1);
    expect(fitColumns(2000, 240, 12, 0)).toBe(1);
  });
  it("una destacada ocupa dos celdas si hay al menos dos columnas", () => {
    expect(sectionCells([{ featured: true }, {}, {}], 4)).toBe(4);
    expect(sectionCells([{ featured: true }, {}, {}], 1)).toBe(3);
  });
  it("4 módulos donde caben 3 van en 2 × 2, no en 3 + 1", () => {
    expect(balanceColumns([n(4)], 3)).toBe(2);
    expect(balanceColumns([n(4)], 4)).toBe(4);
    // Una sola fila incompleta no deja huérfanas: 2 módulos se quedan con sus 4 columnas.
    expect(balanceColumns([n(2)], 4)).toBe(4);
    // Con 2 o menos no se toca.
    expect(balanceColumns([n(3)], 2)).toBe(2);
  });
  it("cuenta todas las secciones y la destacada", () => {
    // «Día a día»: destacada + 6 (8 celdas) y «Datos»: 4 → a 4 columnas no sobra nada.
    const compras = [[{ featured: true }, ...n(6)], n(4)];
    expect(balanceColumns(compras, 4)).toBe(4);
    // A 3 columnas: 8 % 3 → 1 hueco, 4 % 3 → 2 huecos; a 2: ninguno.
    expect(balanceColumns(compras, 3)).toBe(2);
    // 5 → 3 + 2 mejor que 4 + 1; 7 → 4 + 3 mejor que 3 + 3 + 1.
    expect(balanceColumns([n(5)], 4)).toBe(3);
    expect(balanceColumns([n(7)], 4)).toBe(4);
    // Empate (10 → 4 + 4 + 2 o 3 + 3 + 3 + 1): se queda con las que caben.
    expect(balanceColumns([n(10)], 4)).toBe(4);
  });
});

describe("señal y barra", () => {
  it("minigráfica en 100 × 22, o nada con menos de dos puntos", () => {
    expect(sparkPaths([1])).toBeNull();
    expect(sparkPaths(undefined)).toBeNull();
    const p = sparkPaths([10, 20, 15])!;
    expect(p.line).toBe("M0,20.5L50,1.5L100,11");
    expect(p.area).toBe(`${p.line}L100,22L0,22Z`);
    expect(sparkPaths([5, 5])!.line).toBe("M0,20.5L100,20.5");
    expect(sparkPaths([1, "x", NaN, 3] as unknown[])!.line).toBe("M0,20.5L100,1.5");
  });
  it("partes de la barra en porcentaje; descarta lo que no es un número ≥ 0", () => {
    const parts = progressParts([
      { label: "adjudicados", value: 38 },
      { label: "con sugerencia", value: 7 },
      { label: "sin decidir", value: 15 },
      { label: "malo", value: -1 },
      { label: "texto", value: "4" as unknown as number },
    ]);
    expect(parts.map((p) => p.label)).toEqual(["adjudicados", "con sugerencia", "sin decidir"]);
    expect(parts.reduce((s, p) => s + p.pct, 0)).toBeCloseTo(100);
    expect(progressParts([{ label: "cero", value: 0 }])[0].pct).toBe(0);
  });
  it("medidor entre 0 y 100", () => {
    expect(clampMeter(71)).toBe(71);
    expect(clampMeter(140)).toBe(100);
    expect(clampMeter(-3)).toBe(0);
    expect(clampMeter("71")).toBeNull();
  });
  it("el destino es el propio o el de la primera vista con href", () => {
    expect(itemHref(ITEMS[3])).toBe("/cesantias");
    expect(itemHref(ITEMS[0])).toBe("/cert/con");
    expect(itemHref(ITEMS[1])).toBeUndefined();
  });
});

describe("moveIndex", () => {
  // Dos filas de 3 (la segunda con una destacada que ocupa dos) y una sección aparte debajo.
  const B = [
    { x: 0, y: 0, w: 100, h: 80 },
    { x: 110, y: 0, w: 100, h: 80 },
    { x: 220, y: 0, w: 100, h: 80 },
    { x: 0, y: 90, w: 210, h: 80 },
    { x: 220, y: 90, w: 100, h: 80 },
    { x: 0, y: 220, w: 100, h: 80 },
  ];
  it("izquierda y derecha dentro de la fila; en el borde, la siguiente en orden", () => {
    expect(moveIndex(B, 0, "ArrowRight")).toBe(1);
    expect(moveIndex(B, 2, "ArrowRight")).toBe(3);
    expect(moveIndex(B, 3, "ArrowLeft")).toBe(2);
    expect(moveIndex(B, 0, "ArrowLeft")).toBe(0);
    expect(moveIndex(B, 5, "ArrowRight")).toBe(5);
  });
  it("arriba y abajo, a la más cercana en horizontal, cruzando secciones", () => {
    expect(moveIndex(B, 1, "ArrowDown")).toBe(3);
    expect(moveIndex(B, 2, "ArrowDown")).toBe(4);
    expect(moveIndex(B, 4, "ArrowUp")).toBe(2);
    expect(moveIndex(B, 3, "ArrowUp")).toBe(0);
    expect(moveIndex(B, 4, "ArrowDown")).toBe(5);
    expect(moveIndex(B, 5, "ArrowDown")).toBe(5);
    expect(moveIndex(B, 0, "ArrowUp")).toBe(0);
  });
  it("Inicio / Fin, teclas ajenas y sin cajas", () => {
    expect(moveIndex(B, 3, "Home")).toBe(0);
    expect(moveIndex(B, 3, "End")).toBe(5);
    expect(moveIndex(B, 3, "a")).toBeNull();
    expect(moveIndex([], 0, "ArrowDown")).toBeNull();
    const zero = [0, 0, 0].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
    expect(moveIndex(zero, 1, "ArrowDown")).toBe(2);
    expect(moveIndex(zero, 0, "ArrowUp")).toBe(0);
  });
});
