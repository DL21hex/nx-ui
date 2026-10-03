// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { formatElapsed } from "../src/core/format";
import { nxFormat, resolveLocale } from "../src/core/locale";
import { parseInput } from "../src/components/grid/logic";
import type { NxButton } from "../src/index";

describe("locale de la librería", () => {
  it("resolveLocale: atributo `locale`, luego el `lang` más cercano, luego es-CO", () => {
    document.body.innerHTML = `<div lang="en-US"><span id="a"></span><span id="b" locale="pt-BR"></span></div><span id="c"></span>`;
    document.documentElement.removeAttribute("lang");
    expect(resolveLocale(document.getElementById("a")!)).toBe("en-US");
    expect(resolveLocale(document.getElementById("b")!)).toBe("pt-BR");
    expect(resolveLocale(document.getElementById("c")!)).toBe("es-CO");
  });

  it("formatElapsed con el separador del locale", () => {
    expect(formatElapsed(800)).toBe("0,8 s");
    expect(formatElapsed(800, "en-US")).toBe("0.8 s");
    expect(formatElapsed(125_000, "en-US")).toBe("2:05");
  });

  it("el botón muestra el tiempo con el locale de la página", async () => {
    document.body.innerHTML = `<div lang="en-US"><nx-button label="Go"></nx-button></div>`;
    const b = document.querySelector<NxButton>("nx-button")!;
    await import("../src/index");
    b.busy = true;
    b.done(true);
    expect(b.querySelector('[role="status"]')!.textContent).toMatch(/· \d\.\d s$/);
  });

  it("parse en inglés: la coma solo es de miles si agrupa de verdad", () => {
    const en = nxFormat("en-US");
    expect(en.parse("1,234")).toBe(1234);
    expect(en.parse("1,234,567.5")).toBe(1234567.5);
    expect(en.parse("12,34,567.5")).toBe(1234567.5); // agrupación de la India
    // Una sola coma que no agrupa es el decimal de quien escribe a la europea, no ×10.
    expect(en.parse("0,5")).toBe(0.5);
    expect(en.parse("1,50")).toBe(1.5);
    expect(en.parse("12,5")).toBe(12.5);
    // Comas que no agrupan con un punto, o varias sueltas: no se entiende.
    expect(en.parse("1,5.3")).toBeNull();
    expect(en.parse("1,2,3")).toBeNull();
    expect(nxFormat("es-CO").parse("1.234,5")).toBe(1234.5);
  });

  it("parse con separadores mezclados: el último es el decimal si el otro agrupa; si no, null", () => {
    const es = nxFormat("es-CO");
    const en = nxFormat("en-US");
    // El caso que corrompía datos: un Excel en inglés pegado en es-CO daba 1,23456.
    expect(es.parse("1,234.56")).toBe(1234.56);
    expect(es.parse("1,234,567.5")).toBe(1234567.5);
    expect(en.parse("1.234,56")).toBe(1234.56);
    expect(es.parse("1.234,56")).toBe(1234.56);
    // El decimal repetido, o los miles que no agrupan: no se adivina.
    expect(es.parse("12.34,5")).toBeNull();
    expect(es.parse("1.234,5,6")).toBeNull();
    expect(es.parse("1,23.4")).toBeNull();
    expect(es.parse("1.234.5")).toBeNull();
    // Un solo tipo repetido es de miles, en cualquier locale.
    expect(es.parse("1.234.567")).toBe(1234567);
    expect(en.parse("1.234.567")).toBe(1234567);
    expect(es.parse("1,234,567")).toBe(1234567);
    // Una sola vez: el del locale es decimal; el otro, de miles si agrupa.
    expect(es.parse("1,5")).toBe(1.5);
    expect(es.parse("1.234")).toBe(1234);
    expect(es.parse("1.5")).toBe(1.5);
    expect(en.parse("1.234")).toBe(1.234);
    expect(es.parse(",5")).toBe(0.5);
  });

  it("parse: negativos con «-» al comienzo o al final, «−» (U+2212) y paréntesis contables", () => {
    const es = nxFormat("es-CO");
    expect(es.parse("-1.234,5")).toBe(-1234.5);
    expect(es.parse("1.234,5-")).toBe(-1234.5);
    expect(es.parse("$ -1.234")).toBe(-1234);
    expect(es.parse("\u22121.234")).toBe(-1234);
    expect(es.parse("(1.234)")).toBe(-1234);
    expect(es.parse("($ 1.234,50)")).toBe(-1234.5);
    expect(nxFormat("en-US").parse("(1,234.00)")).toBe(-1234);
    // Con la moneda o la unidad fuera de los paréntesis (el formato Contabilidad de Excel).
    expect(es.parse("$ (1,234.00)")).toBe(-1234);
    expect(nxFormat("en-US").parse("$ (1,234.00)")).toBe(-1234);
    expect(es.parse("COP (1.234)")).toBe(-1234);
    expect(es.parse("(1.234) €")).toBe(-1234);
    expect(es.parse("1.234 (IVA")).toBeNull();
    expect(es.parse("1.234)")).toBeNull();
    expect(es.parse("1-2")).toBeNull();
    expect(es.parse("--5")).toBeNull();
    expect(es.parse("(-5)")).toBeNull();
    expect(es.parse("-")).toBeNull();
    expect(es.parse("()")).toBeNull();
    expect(es.parse("")).toBeNull();
    // Ida y vuelta con el formato del propio locale, también donde Intl usa «−» y espacios finos.
    for (const loc of ["es-CO", "en-US", "sv-SE", "fi-FI", "nb-NO", "fr-FR", "de-CH", "pt-BR", "en-IN"]) {
      const f = nxFormat(loc);
      for (const n of [-1234.5, 1234567.25, -0.5, 12]) expect(f.parse(f.number(n)), `${loc} ${f.number(n)}`).toBe(n);
    }
  });

  it("parse: un espacio entre cifras solo agrupa de a tres", () => {
    const es = nxFormat("es-CO");
    expect(es.parse("1 234 567,5")).toBe(1234567.5);
    expect(es.parse("1\u202F234,5")).toBe(1234.5);
    expect(nxFormat("de-CH").parse("1'234.5")).toBe(1234.5);
    expect(es.parse("12 34")).toBeNull();
    expect(es.parse("1 2345")).toBeNull();
  });

  it("parse: entre la primera y la última cifra solo caben separadores; si no, null", () => {
    for (const f of [nxFormat("es-CO"), nxFormat("en-US")]) {
      for (const t of ["03/10/2026", "2026-10-03", "10:30", "1.23E+05", "12 m2", "1.234 € 50"]) expect(f.parse(t), `${f.locale} ${t}`).toBeNull();
      expect(f.parse("12 m²")).toBe(12);
      expect(f.parse("50 %")).toBe(50);
    }
    expect(nxFormat("es-CO").parse("1.234,5 Bs.")).toBe(1234.5);
  });

  it("parse: un primer grupo que empieza por 0 no es de miles", () => {
    expect(nxFormat("es-CO").parse("0.123")).toBe(0.123);
    expect(nxFormat("en-US").parse("0,500")).toBe(0.5);
    expect(nxFormat("es-CO").parse("0,123.5")).toBeNull();
  });

  it("el pegado y la edición del grid usan esas reglas (no guardan un número equivocado)", () => {
    const es = nxFormat("es-CO");
    const money = { key: "m", label: "Monto", type: "money" } as const;
    expect(parseInput("1,234.56", money, es)).toBe(1234.56);
    expect(parseInput("(1.234)", money, es)).toBe(-1234);
    expect(parseInput("12.34,5", money, es)).toBeNull();
    expect(parseInput("$ (1,234.00)", money, es)).toBe(-1234);
    expect(parseInput("03/10/2026", money, es)).toBeNull();
  });

  it("date: una fecha que no existe se devuelve tal cual, no desbordada", () => {
    const es = nxFormat("es-CO");
    expect(es.date("2026-02-31")).toBe("2026-02-31");
    expect(es.date("2026-13")).toBe("2026-13");
    expect(es.date("2026-00-10")).toBe("2026-00-10");
    expect(es.date("2026-04-31")).toBe("2026-04-31");
    expect(es.date("2024-02-29")).toMatch(/29/);
    expect(es.date("2026-03-12")).toMatch(/12.*2026/);
  });

  it("nxFormat se cachea por locale", () => {
    expect(nxFormat("en-US")).toBe(nxFormat("en-US"));
    expect(nxFormat().locale).toBe("es-CO");
  });
});
