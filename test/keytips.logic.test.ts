import { describe, expect, it } from "vitest";
import { assignKeytips, cleanKeytip, keytipChar, keytipLetters, KEYTIPS_SINGLE_MAX } from "../src/components/keytips/logic";
import type { KeytipInput } from "../src/components/keytips/types";

const names = (...n: string[]): KeytipInput[] => n.map((name) => ({ name }));
const codes = (items: KeytipInput[], max?: number) => assignKeytips(items, max);
/** Ningún código es el comienzo de otro, y no hay repetidos. */
const prefixFree = (list: (string | null)[]) => {
  const c = list.filter((x): x is string => !!x);
  expect(new Set(c).size).toBe(c.length);
  const set = new Set(c);
  expect(c.filter((x) => [...x].some((_, i) => i > 0 && set.has(x.slice(0, i))))).toEqual([]);
};

describe("keytipLetters: las letras que prefiere un nombre", () => {
  it("la inicial de la primera palabra, luego el resto de sus letras, sin repetir", () => {
    expect(keytipLetters("Guardar")).toEqual(["G", "U", "A", "R", "D"]);
  });
  it("las iniciales de las otras palabras van antes que las demás letras; las palabras vacías no dan inicial", () => {
    expect(keytipLetters("Enviar al cliente")).toEqual(["E", "C", "N", "V", "I", "A", "R", "L", "T"]);
    expect(keytipLetters("Orden de compra")[1]).toBe("C");
  });
  it("sin tildes ni eñes: «Órdenes» es O, «Añadir línea» es A y L", () => {
    expect(keytipLetters("Órdenes")[0]).toBe("O");
    expect(keytipLetters("Añadir línea").slice(0, 3)).toEqual(["A", "L", "N"]);
    expect(keytipLetters("Ñandú")[0]).toBe("N");
  });
  it("si todo son palabras vacías, se usan igual; los dígitos cuentan; lo que no es latino se ignora", () => {
    expect(keytipLetters("de la")).toEqual(["D", "L", "E", "A"]);
    expect(keytipLetters("Paso 2")).toEqual(["P", "2", "A", "S", "O"]);
    expect(keytipLetters("   ")).toEqual([]);
    expect(keytipLetters("…→ 注文")).toEqual([]);
  });
});

describe("cleanKeytip: el código del autor", () => {
  it.each([
    ["g", "G"],
    [" ñ ", "N"],
    ["gu", "GU"],
    ["A-1", "A1"],
    ["", null],
    ["ABCD", null],
    ["→", null],
  ])("«%s» → %s", (v, out) => expect(cleanKeytip(v)).toBe(out));
  it("lo que no es texto no es un código", () => {
    expect(cleanKeytip(5)).toBeNull();
    expect(cleanKeytip(null)).toBeNull();
    expect(cleanKeytip(undefined)).toBeNull();
  });
});

describe("assignKeytips: una letra", () => {
  it("la barra de un pedido: la inicial de cada acción, y la que choca toma otra letra de su nombre", () => {
    expect(codes(names("Guardar", "Aprobar", "Imprimir", "Enviar al cliente", "Anular"))).toEqual(["G", "A", "I", "E", "N"]);
    expect(codes(names("Detalle", "Pagos", "Historial"))).toEqual(["D", "P", "H"]);
  });
  it("colisiones: G, luego la siguiente inicial o letra libre de cada nombre", () => {
    expect(codes(names("Guardar", "Generar", "Gestionar"))).toEqual(["G", "E", "S"]);
    expect(codes(names("Nuevo pedido", "Nueva factura"))).toEqual(["N", "F"]);
  });
  it("el orden del documento decide: el primero se queda con su inicial", () => {
    expect(codes(names("Generar", "Guardar"))).toEqual(["G", "U"]);
  });
  it("sin tildes: «Órdenes» y «Ordenar» no son letras distintas", () => {
    expect(codes(names("Órdenes", "Ordenar"))).toEqual(["O", "R"]);
  });
  it("nombres vacíos o sin letras: cualquier letra libre, en orden", () => {
    expect(codes(names("", "", "→"))).toEqual(["A", "B", "C"]);
    expect(codes(names("Abrir", ""))).toEqual(["A", "B"]);
  });
  it("cuando se acaban las letras del nombre, cualquier otra libre (y luego dígitos)", () => {
    const many = names(...Array.from({ length: 30 }, () => "Ir"));
    const out = codes(many);
    expect(out.slice(0, 3)).toEqual(["I", "R", "A"]);
    expect(out.every((c) => c?.length === 1)).toBe(true);
    expect(out).toContain("0");
    prefixFree(out);
  });

  describe("el autor manda", () => {
    it("data-keytip gana aunque otro lo quisiera antes; el otro busca otra letra", () => {
      expect(codes([{ name: "Guardar" }, { name: "Grabar", forced: "g" }])).toEqual(["U", "G"]);
    });
    it("un código repetido: el primero se lo queda, el otro pasa a automático", () => {
      expect(codes([{ name: "Uno", forced: "X" }, { name: "Dos", forced: "x" }])).toEqual(["X", "D"]);
    });
    it("un código de dos letras ocupa su primera: nadie más recibe esa letra sola", () => {
      const out = codes([{ name: "Guardar" }, { name: "Grabar", forced: "GR" }]);
      expect(out).toEqual(["U", "GR"]);
      prefixFree(out);
    });
    it("un código inválido se ignora", () => {
      expect(codes([{ name: "Guardar", forced: "→" }])).toEqual(["G"]);
    });
  });

  describe("estable entre aperturas", () => {
    it("la misma pantalla da siempre las mismas letras", () => {
      const items = names("Guardar", "Aprobar", "Imprimir", "Enviar al cliente", "Anular", "", "Detalle");
      expect(codes(items)).toEqual(codes(items));
    });
    it("con la letra anterior: una acción nueva antes en el documento no le quita la letra a nadie", () => {
      const before = codes(names("Guardar", "Generar"));
      expect(before).toEqual(["G", "E"]);
      const after = codes([{ name: "Gastos" }, { name: "Guardar", prev: before[0] }, { name: "Generar", prev: before[1] }]);
      expect(after).toEqual(["A", "G", "E"]);
    });
    it("la anterior no vale si ya la tomó el autor o si cambió el largo (una a dos letras)", () => {
      expect(codes([{ name: "Guardar", prev: "G" }, { name: "Otro", forced: "G" }])).toEqual(["U", "G"]);
      const many = Array.from({ length: 40 }, (_, i) => ({ name: `Acción ${i}`, prev: i === 0 ? "Z" : null }));
      expect(codes(many)[0]).toHaveLength(2);
    });
  });
});

describe("assignKeytips: dos letras", () => {
  it(`con más de ${KEYTIPS_SINGLE_MAX} acciones todos los códigos automáticos son de dos letras, sin prefijos que choquen`, () => {
    const items = names(...Array.from({ length: KEYTIPS_SINGLE_MAX + 1 }, (_, i) => `Fila ${i + 1}`));
    const out = codes(items);
    expect(out.every((c) => c?.length === 2)).toBe(true);
    prefixFree(out);
    // Hasta el límite, una letra.
    expect(codes(items.slice(0, KEYTIPS_SINGLE_MAX)).every((c) => c?.length === 1)).toBe(true);
  });
  it("la primera letra sale del nombre: «Guardar» es GU, «Generar» es GE", () => {
    const items = names("Guardar", "Generar", ...Array.from({ length: 40 }, (_, i) => `Otro ${i}`));
    const out = codes(items);
    expect(out.slice(0, 2)).toEqual(["GU", "GE"]);
  });
  it("una letra sola del autor: ningún código de dos letras empieza por ella", () => {
    const items: KeytipInput[] = [{ name: "Guardar", forced: "G" }, ...names(...Array.from({ length: 40 }, (_, i) => `Gasto ${i}`))];
    const out = codes(items);
    expect(out[0]).toBe("G");
    expect(out.slice(1).every((c) => c!.length === 2 && !c!.startsWith("G"))).toBe(true);
    prefixFree(out);
  });
  it("pocas acciones pero casi todas las letras tomadas por el autor: pasa a dos letras", () => {
    const forced = [..."ABCDEFGHIJKLMNOPQRSTUVWXY"].map((c) => ({ name: c, forced: c }));
    const out = codes([...forced, ...names(...Array.from({ length: 15 }, (_, i) => `Z ${i}`))]);
    expect(out.slice(25).every((c) => c!.length === 2)).toBe(true);
    prefixFree(out);
  });
  it("200 acciones: todas con código, únicas, sin prefijos que choquen, estable, rápido", () => {
    const items = names(...Array.from({ length: 200 }, (_, i) => (i % 7 ? `Producto ${i} de la bodega` : "")));
    const t = performance.now();
    const out = codes(items);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(out.every((c) => c?.length === 2)).toBe(true);
    prefixFree(out);
    expect(codes(items)).toEqual(out);
  });
  it("más acciones que códigos posibles: las que sobran quedan sin código (null)", () => {
    const out = codes(names(...Array.from({ length: 1300 }, () => "")));
    expect(out.filter((c) => c === null)).toHaveLength(1300 - 36 * 36);
    prefixFree(out);
  });
  it("sin acciones, nada", () => {
    expect(codes([])).toEqual([]);
  });
});

describe("keytipChar: qué letra es una tecla", () => {
  it.each([
    [{ key: "g", code: "KeyG" }, "G"],
    [{ key: "G", code: "KeyG" }, "G"],
    [{ key: "7", code: "Digit7" }, "7"],
    [{ key: "a", code: "KeyQ" }, "A"], // AZERTY: manda lo que dice la tecla
    [{ key: "©", code: "KeyG", altKey: true }, "G"], // Mac: Opción+G
    [{ key: "™", code: "Digit2", altKey: true }, "2"],
    [{ key: "@", code: "KeyQ" }, ""], // AltGr+Q en Linux: un símbolo, no la Q
    [{ key: "ñ", code: "Semicolon" }, ""],
    [{ key: "ñ", code: "Semicolon", altKey: true }, ""],
    [{ key: "Enter", code: "Enter" }, ""],
    [{ key: "Alt", code: "AltLeft" }, ""],
    [{}, ""],
  ])("%j → «%s»", (e, out) => expect(keytipChar(e)).toBe(out));
});
