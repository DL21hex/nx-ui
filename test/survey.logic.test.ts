import { describe, expect, it } from "vitest";
import { aggregate, answerText, answersToSend, cleanQuestions, estimateMinutes, interpolate, isVisible, npsOf, rangeOf, topWords, validate, visibleQuestions } from "../src/components/survey/logic";
import type { SurveyQuestion } from "../src/components/survey/types";

const QS = cleanQuestions([
  { id: "area", type: "choice", title: "¿En qué área trabajas?", required: true, options: [{ value: "prod", label: "Producción" }, { value: "adm", label: "Administración" }] },
  { id: "nps", type: "scale", nps: true, title: "¿Recomendarías trabajar aquí?" },
  { id: "why", type: "text", title: "¿Qué mejorarías de {{area}}?", when: { question: "nps", lt: 7 } },
  { id: "tools", type: "multi", title: "Herramientas", min: 1, max: 2, options: ["ERP", "Excel", "Correo"] },
  { id: "hours", type: "slider", title: "Horas extra", min: 0, max: 20 },
  { id: "rank", type: "rank", title: "Prioridades", options: ["a", "b", "c"] },
]) as SurveyQuestion[];

describe("cleanQuestions", () => {
  it("valida tipos, exige opciones donde hacen falta y normaliza las opciones de texto", () => {
    const out = cleanQuestions([
      { id: "x", type: "choice", title: "Sin opciones" },
      { id: "y", type: "html", title: "Tipo raro" },
      { id: "z", type: "multi", title: "Ok", options: ["uno", { value: 2, label: "Dos" }, { label: "sin valor" }], onclick: "x" },
      { id: "z", type: "text", title: "Repetida" },
    ]);
    expect(out.map((q) => q.id)).toEqual(["z"]);
    expect(out[0].options).toEqual([{ value: "uno", label: "uno" }, { value: "2", label: "Dos", emoji: undefined, hint: undefined }]);
    expect("onclick" in out[0]).toBe(false);
  });
});

describe("lógica condicional", () => {
  it("una pregunta aparece según otra respuesta (y se envía solo lo que se ve)", () => {
    const why = QS.find((q) => q.id === "why")!;
    expect(isVisible(why, {}, QS)).toBe(false);
    expect(isVisible(why, { nps: 9 }, QS)).toBe(false);
    expect(isVisible(why, { nps: 4 }, QS)).toBe(true);
    expect(visibleQuestions(QS, { nps: 4 }).map((q) => q.id)).toContain("why");
    // Si la persona cambia de opinión, lo que escribió en la rama abandonada no se envía.
    expect(answersToSend(QS, { area: "prod", nps: 10, why: "nada" })).toEqual({ area: "prod", nps: 10 });
  });

  it("equals, in, gt y answered", () => {
    const q = (when: object) => ({ id: "q", type: "text", title: "t", when }) as SurveyQuestion;
    expect(isVisible(q({ question: "area", equals: "prod" }), { area: "prod" }, QS)).toBe(true);
    expect(isVisible(q({ question: "tools", in: ["Excel"] }), { tools: ["ERP", "Excel"] }, QS)).toBe(true);
    expect(isVisible(q({ question: "nps", gt: 8 }), { nps: 8 }, QS)).toBe(false);
    expect(isVisible(q({ question: "area", answered: false }), {}, QS)).toBe(true);
  });
});

describe("respuestas en el texto", () => {
  it("{{id}} inserta la etiqueta de la opción; listas con «y»; sin respuesta se quita", () => {
    expect(interpolate("¿Qué mejorarías de {{area}}?", { area: "prod" }, QS)).toBe("¿Qué mejorarías de Producción?");
    expect(answerText(QS[3], ["ERP", "Excel", "Correo"])).toBe("ERP, Excel y Correo");
    expect(interpolate("Hola {{nombre}} ¿cómo vas?", {}, QS)).toBe("Hola ¿cómo vas?");
  });
});

describe("validate y rangos", () => {
  it("obligatoria, mínimo y máximo de opciones, mínimo de caracteres", () => {
    expect(validate(QS[0], undefined)).toEqual({ key: "required" });
    expect(validate(QS[1], undefined)).toBeNull();
    expect(validate(QS[3], [])).toBeNull(); // sin responder y no obligatoria
    expect(validate(QS[3], ["ERP", "Excel", "Correo"])).toEqual({ key: "maxChoices", n: 2 });
    expect(validate({ id: "t", type: "text", title: "t", min: 10 }, "corto")).toEqual({ key: "minLength", n: 10 });
  });
  it("NPS 0–10, escala 1–5, estrellas 1–5, deslizador según min/max", () => {
    expect(rangeOf(QS[1])).toEqual({ min: 0, max: 10, step: 1 });
    expect(rangeOf({ id: "r", type: "rating", title: "r" })).toEqual({ min: 1, max: 5, step: 1 });
    expect(rangeOf(QS[4])).toEqual({ min: 0, max: 20, step: 1 });
    expect(estimateMinutes(QS)).toBe(2);
  });
});

describe("resultados", () => {
  it("npsOf: % promotores − % detractores", () => {
    expect(npsOf([10, 9, 8, 7, 3])).toEqual({ score: 20, promoters: 2, passives: 2, detractors: 1 });
    expect(npsOf([])).toEqual({ score: 0, promoters: 0, passives: 0, detractors: 0 });
  });

  it("topWords: sin tildes para contar, sin palabras vacías, con la forma más común", () => {
    expect(topWords(["Más capacitación y más herramientas", "capacitación en el ERP", "la CAPACITACION", "el ERP"], 2)).toEqual([["capacitación", 3], ["ERP", 2]]);
  });

  it("aggregate: conteos, promedios, NPS, posición promedio al ordenar y palabras", () => {
    const r = aggregate(QS, [
      { area: "prod", nps: 10, tools: ["ERP"], hours: 4, rank: ["a", "b", "c"] },
      { area: "prod", nps: 3, why: "más turnos", tools: ["ERP", "Excel"], hours: 8, rank: ["b", "a", "c"] },
      { area: "adm", nps: 9, tools: ["Correo"], rank: ["a", "c", "b"] },
    ]);
    expect(r.total).toBe(3);
    expect(r.questions.area).toEqual({ n: 3, counts: { prod: 2, adm: 1 } });
    expect(r.questions.nps.nps).toEqual({ score: 33, promoters: 2, passives: 0, detractors: 1 });
    expect(r.questions.nps.avg).toBe(7.3);
    expect(r.questions.tools.counts).toEqual({ ERP: 2, Excel: 1, Correo: 1 });
    expect(r.questions.hours).toEqual({ n: 2, avg: 6 });
    expect(r.questions.rank.ranks).toEqual({ a: 1.3, b: 2, c: 2.7 });
    expect(r.questions.why.words).toEqual([["turnos", 1]]);
  });
});

describe("topWords (mayúsculas)", () => {
  it("la mayúscula de inicio de frase no cuenta; las siglas se quedan", () => {
    expect(topWords(["Mejor comunicación", "Mejor ERP"])).toEqual([["mejor", 2], ["comunicación", 1], ["ERP", 1]]);
  });
});
