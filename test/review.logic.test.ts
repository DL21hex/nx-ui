import { describe, expect, it } from "vitest";
import { nxFormat } from "../src/core/locale";
import {
  REVIEW_LABELS,
  countChanges,
  countReview,
  describeChange,
  describeReview,
  diffReview,
  flattenReview,
  groupReview,
  humanizeName,
  reviewName,
  reviewRowName,
  reviewShouldOpen,
  reviewText,
  reviewValueText,
  sameReviewValue,
} from "../src/components/review/logic";
import type { ReviewChange, ReviewMeta, ReviewValues } from "../src/components/review/types";

const fmt = nxFormat("es-CO");
const nb = (s: string | undefined) => (s ?? "").replace(/[  ]/g, " ");
const opts = (meta: Record<string, ReviewMeta> = {}, more = {}) => ({ fmt, meta: (n: string) => meta[n], ...more });
const one = (from: unknown, to: unknown, meta?: ReviewMeta, more = {}) => describeChange("campo", from as never, to as never, meta, { fmt, ...more });

describe("nombres de filas", () => {
  it("reconoce `items[0].qty`, `items[2][precio]`, `lineas.3.cantidad` y grupos con punto", () => {
    expect(reviewRowName("items[0].qty")).toEqual({ group: "items", index: 0, leaf: "qty" });
    expect(reviewRowName("items[2][precio]")).toEqual({ group: "items", index: 2, leaf: "precio" });
    expect(reviewRowName("lineas.3.cantidad")).toEqual({ group: "lineas", index: 3, leaf: "cantidad" });
    expect(reviewRowName("orden.items[12].qty")).toEqual({ group: "orden.items", index: 12, leaf: "qty" });
    expect(reviewRowName("a.b.3.c")).toEqual({ group: "a.b", index: 3, leaf: "c" });
  });
  it("lo que no es una fila queda como está", () => {
    for (const n of ["precio", "cliente.nit", "items[0]", "x.1", "tags[]", "items[a].qty", "items[0][a][b]"]) expect(reviewRowName(n)).toBeNull();
    expect(reviewName("precio")).toBe("precio");
  });
  it("el nombre canónico junta las tres formas", () => {
    expect(new Set(["items[2][qty]", "items.2.qty", "items[2].qty"].map(reviewName))).toEqual(new Set(["items[2].qty"]));
  });
  it("humanizeName: «fecha_entrega» y «precioUnitario»", () => {
    expect(humanizeName("fecha_entrega")).toBe("Fecha entrega");
    expect(humanizeName("precioUnitario")).toBe("Precio unitario");
    expect(humanizeName("items")).toBe("Items");
  });
});

describe("valores", () => {
  it("sameReviewValue: 12 y «12», vacíos, casillas, listas sin orden y saltos de línea", () => {
    expect(sameReviewValue(12, "12")).toBe(true);
    expect(sameReviewValue(12, "12.5")).toBe(false);
    expect(sameReviewValue(null, "")).toBe(true);
    expect(sameReviewValue(undefined, false)).toBe(true);
    expect(sameReviewValue([], null)).toBe(true);
    expect(sameReviewValue(true, false)).toBe(false);
    expect(sameReviewValue(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameReviewValue(["a"], "a")).toBe(true);
    expect(sameReviewValue("a\r\nb", "a\nb")).toBe(true);
    expect(sameReviewValue(0, null)).toBe(false);
    expect(sameReviewValue("abc", 3)).toBe(false);
  });
  it("flattenReview: filas anidadas, objetos, nombres planos, JSON en texto y basura", () => {
    expect(flattenReview({ estado: "aprobada", items: [{ id: 7, qty: 2 }, { id: 8, qty: 5 }], cliente: { nit: "900" }, "lineas.3.cantidad": 4, tags: ["a", 1] })).toEqual({
      estado: "aprobada",
      "items[0].id": 7,
      "items[0].qty": 2,
      "items[1].id": 8,
      "items[1].qty": 5,
      "cliente.nit": "900",
      "lineas[3].cantidad": 4,
      tags: ["a", "1"],
    });
    expect(flattenReview('{"a": 1, "b": {"x": NaN}}')).toEqual({});
    expect(flattenReview('{"a": 1, "b": null, "c": {"d": [1, {"e": 2}]}}')).toEqual({ a: 1, b: null, "c.d[1].e": 2 });
    expect(flattenReview([1, 2])).toEqual({});
    expect(flattenReview(null)).toEqual({});
    expect(flattenReview({ n: Infinity, o: () => 1 })).toEqual({ n: null, o: null });
  });
  it("reviewText: singular|plural y variables", () => {
    expect(reviewText(REVIEW_LABELS.title, { n: 1 }, 1)).toBe("Vas a guardar 1 cambio");
    expect(reviewText(REVIEW_LABELS.title, { n: 3 }, 3)).toBe("Vas a guardar 3 cambios");
    expect(reviewText("Sin plural {x}", { x: "y" }, 4)).toBe("Sin plural y");
  });
});

describe("diffReview", () => {
  it("campos sueltos: los que cambiaron, incluidos los que ya no están o son nuevos", () => {
    const d = diffReview({ a: 1, b: "x", c: true, gone: "algo" }, { a: "1", b: "y", c: false, nuevo: "", otro: "z" });
    expect(d.fields).toEqual(["b", "c", "otro", "gone"]);
    expect(d.rows).toEqual([]);
    expect(countReview(d)).toBe(4);
  });

  it("filas por clave (`id`): nuevas, quitadas y cambiadas; reordenar no es cambiar", () => {
    const base = { "l[0].id": "A", "l[0].qty": 1, "l[1].id": "B", "l[1].qty": 2, "l[2].id": "C", "l[2].qty": 3 };
    const now = { "l[0].id": "C", "l[0].qty": 3, "l[1].id": "A", "l[1].qty": 10, "l[2].id": "", "l[2].qty": 4, "l[3].id": "D", "l[3].qty": 1 };
    const d = diffReview(base, now);
    expect(d.fields).toEqual([]);
    const g = d.rows[0];
    expect(g.group).toBe("l");
    expect([g.from, g.to]).toEqual([3, 4]);
    expect(g.added.map((r) => r.index)).toEqual([2, 3]);
    expect(g.removed.map((r) => r.key)).toEqual(["B"]);
    expect(g.changed.map((c) => [c.from.key, c.to.index, c.cells])).toEqual([["A", 1, ["qty"]]]);
    expect(countReview(d)).toBe(4);
  });

  it("filas por posición si ninguna tiene `id` (y los índices no tienen que ser seguidos)", () => {
    const base = { "l[0].qty": 1, "l[1].qty": 2, "l[5].qty": 3 };
    const now = { "l[0].qty": 1, "l[1].qty": 9, "l[2].qty": 3, "l[3].qty": 7 };
    const g = diffReview(base, now).rows[0];
    expect(g.changed.map((c) => [c.from.index, c.to.index])).toEqual([[1, 1]]);
    expect(g.added.map((r) => [r.index, r.pos])).toEqual([[3, 3]]);
    expect(g.removed).toEqual([]);
  });

  it("quitar todas las filas y los `id` repetidos no se pierden", () => {
    const g = diffReview({ "l[0].id": "A", "l[0].x": 1, "l[1].id": "A", "l[1].x": 2 }, {}).rows[0];
    expect(g.removed).toHaveLength(2);
    expect(diffReview({ "l[0].x": "" }, { "l[0].x": null }).rows).toEqual([]);
  });

  it("300 campos y 200 filas (y diez veces más) en tiempo lineal", () => {
    const make = (n: number, rows: number, bump: number) => {
      const v: ReviewValues = {};
      for (let i = 0; i < n; i++) v[`campo${i}`] = i % 7 === 0 ? i + bump : i;
      for (let r = 0; r < rows; r++) Object.assign(v, { [`items[${r}].id`]: `R${r}`, [`items[${r}].qty`]: r % 5 ? r : r + bump, [`items[${r}].precio`]: 1000 * r, [`items[${r}].desc`]: `Línea ${r}` });
      return v;
    };
    const run = (n: number, rows: number) => {
      const base = make(n, rows, 0);
      const now = make(n, rows, 1);
      const t = performance.now();
      const d = diffReview(base, now);
      const out = describeReview(d, base, now, { fmt });
      return { ms: performance.now() - t, d, out };
    };
    run(300, 200);
    const small = run(300, 200);
    expect(small.d.fields).toHaveLength(43);
    expect(small.d.rows[0].changed).toHaveLength(40);
    expect(countChanges(small.out)).toBe(83);
    const big = run(3000, 2000);
    expect(big.d.rows[0].changed).toHaveLength(400);
    expect(big.ms).toBeLessThan(600);
  });
});

describe("describeChange: cómo se lee cada cambio", () => {
  it("montos con su moneda, la diferencia y el porcentaje; ≥ 20 % es importante (sin errores de coma flotante)", () => {
    const c = one(10000, 12000, { label: "Precio unitario", kind: "money", currency: "COP" });
    expect(c.label).toBe("Precio unitario");
    expect([nb(c.fromText), nb(c.toText)]).toEqual(["$ 10.000", "$ 12.000"]);
    expect(nb(c.delta?.text)).toBe("+$ 2.000 · +20%");
    expect(c.delta?.pct).toBeCloseTo(0.2);
    expect(c.significant).toBe(true);
    expect(c.reason).toBe("amount");
    const small = one(10000, 11900, { kind: "money", currency: "COP" });
    expect(small.significant).toBe(false);
    expect(nb(small.delta?.text)).toBe("+$ 1.900 · +19%");
    expect(one(10000, 8000, { kind: "money" }).delta?.text).toBe("−$ 2.000 · −20%");
  });
  it("`threshold` cambia el umbral; desde 0 no hay porcentaje", () => {
    expect(one(100, 110, { kind: "number" }, { threshold: 0.05 }).significant).toBe(true);
    expect(one(100, 110, { kind: "number" }, { threshold: 0.5 }).significant).toBe(false);
    const z = one(0, 5, { kind: "number" });
    expect(z.delta).toEqual({ by: 5, pct: null, text: "+5" });
    expect(z.significant).toBe(false);
    const e = one(null, 5, { kind: "number" });
    expect([e.fromText, e.toText, e.delta]).toEqual(["(vacío)", "5", undefined]);
  });
  it("números desde texto (un `initial` con «12000») y porcentajes", () => {
    expect(nb(one("12000", 15000, { kind: "money", currency: "COP" }).delta?.text)).toBe("+$ 3.000 · +25%");
    const p = one(0.19, 0.05, { kind: "percent" });
    expect([nb(p.fromText), nb(p.toText)]).toEqual(["19%", "5%"]);
    expect(p.delta?.text).toBeUndefined();
    expect(p.significant).toBe(true);
  });
  it("fechas: «12 oct 2026 → 15 oct 2026 (+3 días)»; más de 7 días es importante", () => {
    const c = one("2026-10-12", "2026-10-15", { label: "Fecha de entrega", kind: "date" });
    expect([nb(c.fromText), nb(c.toText), c.delta?.text]).toEqual(["12 oct 2026", "15 oct 2026", "+3 días"]);
    expect(c.significant).toBe(false);
    expect(one("2026-10-12", "2026-10-13", { kind: "date" }).delta?.text).toBe("+1 día");
    const far = one("2026-10-12", "2026-10-01", { kind: "date" });
    expect([far.delta?.by, far.delta?.text, far.significant, far.reason]).toEqual([-11, "−11 días", true, "date"]);
    expect(one("2026-10-12", "2026-10-20", { kind: "date" }, { days: 10 }).significant).toBe(false);
    // Sin meta, una fecha ISO se reconoce sola.
    expect(one("2026-10-12", "2026-10-15").kind).toBe("date");
  });
  it("selects por la etiqueta de la opción; cambiar un estado es importante", () => {
    const options = { por: "Por aprobar", ok: "Aprobada" };
    const c = one("por", "ok", { label: "Estado", kind: "choice", options, status: true });
    expect([c.fromText, c.toText, c.significant, c.reason]).toEqual(["Por aprobar", "Aprobada", true, "status"]);
    expect(one("x", "ok", { kind: "choice", options }).fromText).toBe("x");
    expect(one(["por"], ["por", "ok"], { kind: "choice", options }).toText).toBe("Por aprobar, Aprobada");
  });
  it("casillas: «Sí → No»; vacíos y textos citados", () => {
    expect([one(true, false, { kind: "bool" }).fromText, one(true, false, { kind: "bool" }).toText]).toEqual(["Sí", "No"]);
    expect(one(false, true).kind).toBe("bool");
    const o = one("", "Entregar en portería", { label: "Observaciones", long: true });
    expect([o.fromText, o.toText, o.diff]).toEqual(["(vacío)", "“Entregar en portería”", undefined]);
  });
  it("textos largos: diferencia por palabras (quitado y agregado)", () => {
    const a = "Entregar en la bodega principal de Malambo antes de las 10 de la mañana, con remisión firmada.";
    const b = "Entregar en la portería de Malambo antes de las 8 de la mañana, con remisión firmada.";
    const c = one(a, b, { kind: "text" });
    expect(c.diff?.filter((p) => p.op !== "=").map((p) => p.op + p.text)).toEqual(["-bodega principal", "+portería", "-10", "+8"]);
    expect(one("corto", "otro corto", { kind: "text" }).diff).toBeUndefined();
    expect(one("uno", "dos", { kind: "text", long: true }).diff).toHaveLength(2);
  });
  it("`important` y los avisos de guard ganan; la etiqueta sale del nombre si no hay", () => {
    expect(one("a", "b", { important: true }).reason).toBe("important");
    const w = describeChange("precio", 1, 2, { kind: "number" }, { fmt, warnings: new Map([["precio", ["12.000.000 es 10 veces lo habitual"]]]) });
    expect([w.significant, w.reason, w.warnings]).toEqual([true, "guard", ["12.000.000 es 10 veces lo habitual"]]);
    expect(describeChange("fecha_entrega", "a", "b", undefined, { fmt }).label).toBe("Fecha entrega");
    expect(describeChange("items[2].precio_unit", 1, 2, undefined, { fmt }).label).toBe("Precio unit");
  });
  it("en-US: montos, porcentajes y fechas del locale (los textos siguen los `labels`)", () => {
    const en = nxFormat("en-US");
    const c = describeChange("p", 10000, 12000, { kind: "money", currency: "USD" }, { fmt: en });
    expect([nb(c.fromText), nb(c.toText), nb(c.delta?.text)]).toEqual(["$10,000", "$12,000", "+$2,000 · +20%"]);
    expect(nb(describeChange("f", "2026-10-12", "2026-10-15", { kind: "date" }, { fmt: en }).toText)).toBe("Oct 15, 2026");
    const L = { ...REVIEW_LABELS, yes: "Yes", no: "No", days: "{n} day|{n} days" };
    expect(describeChange("f", "2026-10-12", "2026-10-15", { kind: "date" }, { fmt: en, labels: L }).delta?.text).toBe("+3 days");
    expect(reviewValueText(true, { kind: "bool" }, en, L)).toBe("Yes");
  });
});

describe("describeReview: las filas de detalle", () => {
  const meta: Record<string, ReviewMeta> = {
    lineas: { label: "Líneas de la orden", section: "Detalle" },
    "lineas[].desc": { label: "Descripción", kind: "text" },
    "lineas[].qty": { label: "Cantidad", kind: "number" },
    "lineas[].precio": { label: "Precio", kind: "money", currency: "COP" },
    estado: { label: "Estado", kind: "choice", options: { por: "Por aprobar", ok: "Aprobada" }, status: true, section: "Encabezado" },
    obs: { label: "Observaciones", section: "Encabezado" },
  };
  const row = (i: number, id: string, desc: string, qty: number, precio: number) => ({ [`lineas[${i}].id`]: id, [`lineas[${i}].desc`]: desc, [`lineas[${i}].qty`]: qty, [`lineas[${i}].precio`]: precio });
  const base = { estado: "por", obs: "", ...row(0, "1", "Lámina HR", 12, 1275000), ...row(1, "2", "Ángulo", 40, 58000), ...row(2, "3", "Tubo", 10, 85000) };
  const now = { estado: "ok", obs: "", ...row(0, "1", "Lámina HR", 12, 1275000), ...row(1, "3", "Tubo", 15, 85000), ...row(2, "", "Platina", 20, 32000), ...row(3, "", "Varilla", 100, 4500) };

  it("«2 líneas nuevas · 1 quitada · 1 cambiada» con el detalle de cada una", () => {
    const out = describeReview(diffReview(base, now), base, now, opts(meta));
    expect(out.map((c) => c.field)).toEqual(["estado", "lineas"]);
    const g = out[1];
    expect([g.kind, g.label, g.section, g.from, g.to]).toEqual(["rows", "Líneas de la orden", "Detalle", 3, 4]);
    expect(g.rows?.summary).toBe("2 líneas nuevas · 1 quitada · 1 cambiada");
    expect(g.rows?.added.map((r) => r.title)).toEqual(["Línea 3 · Platina", "Línea 4 · Varilla"]);
    expect(nb(g.rows?.added[0].text)).toBe("Cantidad 20 · Precio $ 32.000");
    expect(g.rows?.removed.map((r) => [r.title, r.key])).toEqual([["Línea 2 · Ángulo", "2"]]);
    const ch = g.rows!.changed[0];
    expect([ch.title, ch.index]).toEqual(["Línea 2 · Tubo", 1]);
    expect(ch.changes?.map((c) => [c.field, c.label, c.fromText, c.toText, c.delta?.text, c.significant])).toEqual([["lineas[1].qty", "Cantidad", "10", "15", "+5 · +50%", true]]);
    expect([g.significant, g.reason]).toEqual([true, "amount"]);
    expect(countChanges(out)).toBe(5);
  });

  it("un solo cambio en singular; filas sin `id` por posición", () => {
    const a = { "l[0].qty": 1, "l[1].qty": 2 };
    const b = { "l[0].qty": 1 };
    const g = describeReview(diffReview(a, b), a, b, { fmt })[0];
    expect(g.rows?.summary).toBe("1 quitada");
    expect(g.rows?.removed[0].title).toBe("Línea 2");
    expect(g.label).toBe("L");
  });

  it("avisos de guard en una fila la marcan", () => {
    const w = new Map([["lineas[2].precio", ["Muy por encima"]]]);
    const g = describeReview(diffReview(base, now), base, now, opts(meta, { warnings: w }))[1];
    expect(g.rows?.added[0].significant).toBe(true);
    expect([g.warnings, g.reason]).toEqual([["Muy por encima"], "guard"]);
  });

  it("groupReview: por sección, lo importante primero (y las secciones con algo importante primero)", () => {
    const c = (field: string, section: string | undefined, significant: boolean) => ({ field, section, significant }) as ReviewChange;
    const g = groupReview([c("a", "Encabezado", false), c("b", "Encabezado", true), c("x", undefined, false), c("d", "Pago", false), c("e", "Detalle", true)]);
    expect(g.map((s) => [s.section, s.changes.map((x) => x.field)])).toEqual([
      ["Encabezado", ["b", "a"]],
      ["Detalle", ["e"]],
      ["", ["x"]],
      ["Pago", ["d"]],
    ]);
  });
});

describe("reviewShouldOpen", () => {
  const c = (significant: boolean) => ({ field: "x", significant }) as ReviewChange;
  it("always, significant (importante, avisos o más de max-silent) y never", () => {
    expect(reviewShouldOpen([], "always")).toBe(false);
    expect(reviewShouldOpen([c(false)], "always")).toBe(true);
    expect(reviewShouldOpen([c(false)], "significant")).toBe(false);
    expect(reviewShouldOpen([c(false), c(true)], "significant")).toBe(true);
    expect(reviewShouldOpen([c(false)], "significant", 5, 1)).toBe(true);
    expect(reviewShouldOpen(Array.from({ length: 6 }, () => c(false)), "significant")).toBe(true);
    expect(reviewShouldOpen(Array.from({ length: 5 }, () => c(false)), "significant")).toBe(false);
    expect(reviewShouldOpen(Array.from({ length: 3 }, () => c(false)), "significant", 2)).toBe(true);
    expect(reviewShouldOpen([c(true)], "never")).toBe(false);
  });
});
