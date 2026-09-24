import { describe, expect, it } from "vitest";
import { formatDigits, initialsOf, looksLikeDigits, matchRanges, searchOptions, searchScope } from "../src/components/select/logic";
import type { SelectField, SelectOption } from "../src/components/select/types";

const FIELDS: SelectField[] = [
  { key: "nombre", label: "Nombre" },
  { key: "cedula", label: "Cédula", kind: "digits" },
  { key: "cargo", label: "Cargo" },
];
const E: SelectOption[] = [
  { value: "1", nombre: "Walber Pumarejo", cedula: "1098765432", cargo: "Técnico electricista" },
  { value: "2", nombre: "Ana María Rincón", cedula: "52341987", cargo: "Soldadora" },
  { value: "3", nombre: "Héctor Galeano", cedula: "98543210", cargo: "Soldador" },
  { value: "4", nombre: "Mariana Ospina", cedula: "1035876543", cargo: "Auxiliar SST" },
];
const ids = (q: string) => searchOptions(E, FIELDS, q).map((m) => m.option.value);

describe("searchOptions", () => {
  it("consulta vacía: todos, en su orden", () => {
    expect(ids("  ")).toEqual(["1", "2", "3", "4"]);
  });

  it("sin tildes ni mayúsculas", () => {
    expect(ids("rincon")).toEqual(["2"]);
    expect(ids("TECNICO")).toEqual(["1"]);
  });

  it("cada palabra puede coincidir en una columna distinta", () => {
    expect(ids("ana soldad")).toEqual(["2"]);
    const m = searchOptions(E, FIELDS, "ana soldad")[0];
    expect(m.fields.sort()).toEqual(["cargo", "nombre"]);
  });

  it("la cédula se encuentra con o sin puntos, y solo en columnas de dígitos", () => {
    expect(ids("52.341.987")).toEqual(["2"]);
    expect(ids("5234")).toEqual(["2"]);
    expect(searchOptions(E, FIELDS, "52.341")[0].fields).toEqual(["cedula"]);
  });

  it("ordena por relevancia: inicio de palabra antes que en medio; a igual puntaje, el orden original", () => {
    // «María» y «Mariana» empiezan palabra con «mar» (empatan); «Pumarejo» la tiene en medio.
    expect(ids("mar")).toEqual(["2", "4", "1"]);
  });

  it("una columna idéntica a la consulta gana", () => {
    expect(ids("soldador")[0]).toBe("3");
  });
});

describe("searchScope / looksLikeDigits", () => {
  it("solo números con al menos 4 dígitos parece un documento", () => {
    expect(looksLikeDigits("52.341")).toBe(true);
    expect(looksLikeDigits("123")).toBe(false);
    expect(looksLikeDigits("ana 1234")).toBe(false);
    expect(searchScope(FIELDS, "1098 7654").fields.map((f) => f.key)).toEqual(["cedula"]);
    expect(searchScope([{ key: "n", label: "N" }], "12345").digitsOnly).toBe(false);
  });
});

describe("matchRanges / formatDigits", () => {
  it("marca todas las apariciones, sin tildes", () => {
    expect(matchRanges("Ana María Rincón", "ma")).toEqual([[4, 6]]);
    expect(matchRanges("Ana María", "a")).toEqual([[0, 1], [2, 3], [5, 6], [8, 9]]);
  });

  it("en una columna de dígitos, el tramo se traslada a la forma con puntos", () => {
    const r = matchRanges("52341987", "341.9", "digits");
    expect(r).toEqual([[2, 6]]);
    const f = formatDigits("52341987", r);
    expect(f.text).toBe("52.341.987");
    expect(f.text.slice(f.ranges[0][0], f.ranges[0][1])).toBe("341.9");
  });

  it("lo que no son solo dígitos queda igual", () => {
    expect(formatDigits("CE-123").text).toBe("CE-123");
  });

  it("iniciales", () => {
    expect(initialsOf("Ana María Rincón")).toBe("AM");
    expect(initialsOf("walber")).toBe("WA");
  });
});
