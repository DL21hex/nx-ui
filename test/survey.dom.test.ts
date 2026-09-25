// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import "../src/index";
import type { NxSurvey, SurveyQuestionInput } from "../src/index";
import { aggregate, cleanQuestions } from "../src/components/survey/logic";

beforeAll(() => {
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const QS: SurveyQuestionInput[] = [
  { id: "area", type: "choice", title: "¿En qué área trabajas?", required: true, options: [{ value: "prod", label: "Producción", emoji: "🏭" }, { value: "adm", label: "Administración" }] },
  { id: "nps", type: "scale", nps: true, title: "¿Recomendarías {{area}}?", minLabel: "Nada", maxLabel: "Mucho" },
  { id: "why", type: "text", title: "¿Qué mejorarías?", when: { question: "nps", lt: 7 }, max: 140 },
  { id: "tools", type: "multi", title: "Herramientas", max: 2, options: ["ERP", "Excel", "Correo"], other: true },
  { id: "stars", type: "rating", title: "Califica el casino" },
];

function mount(attrs = 'heading="Clima laboral" description="Anónima"', qs = QS): NxSurvey {
  document.body.innerHTML = `<nx-survey ${attrs} locale="es-CO"></nx-survey>`;
  const el = document.querySelector("nx-survey")!;
  el.questions = qs;
  return el;
}
const key = (el: NxSurvey, k: string, target: Element = el) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
const title = (el: NxSurvey) => el.querySelector(".nx-survey__q .nx-survey__title > span[id]")?.textContent;

describe("<nx-survey>", () => {
  it("empieza con una portada: título, descripción, cuántas preguntas y cuánto toma", () => {
    const el = mount();
    expect(el.screen).toBe("intro");
    expect(el.querySelector(".nx-survey__title")!.textContent).toBe("Clima laboral");
    expect(el.querySelector(".nx-survey__meta")!.textContent).toBe("4 preguntas · 1 min");
    key(el, "Enter");
    expect(el.screen).toBe("question");
    expect(el.querySelector("fieldset legend")).not.toBeNull();
    expect(title(el)).toBe("¿En qué área trabajas? *");
  });

  it("sin heading va directo a la primera pregunta", () => {
    const el = mount("");
    expect(el.screen).toBe("question");
  });

  it("obligatoria: no deja seguir y lo dice", () => {
    const el = mount("");
    expect(el.next()).toBe(false);
    expect(el.querySelector(".nx-survey__err")!.textContent).toBe("Esta pregunta es obligatoria");
    expect(el.current!.id).toBe("area");
  });

  it("una letra elige la opción y pasa sola a la siguiente, con la respuesta insertada en el título", async () => {
    const el = mount("");
    key(el, "a");
    expect(el.answers.area).toBe("prod");
    expect(el.querySelector(".nx-survey__opt[data-on]")!.textContent).toContain("Producción");
    await sleep(500);
    expect(el.current!.id).toBe("nps");
    expect(title(el)).toBe("¿Recomendarías Producción?");
    expect(el.querySelectorAll(".nx-survey__scale label")).toHaveLength(11);
    expect(el.querySelector('.nx-survey__scale label[data-band="p"]')!.textContent).toBe("9");
  });

  it("lógica condicional: un NPS bajo abre «¿Qué mejorarías?»; uno alto la salta", async () => {
    vi.useFakeTimers();
    const el = mount("");
    el.answers = { area: "prod" };
    el.next();
    key(el, "3");
    vi.advanceTimersByTime(500);
    expect(el.current!.id).toBe("why");
    el.back();
    key(el, "9");
    vi.advanceTimersByTime(500);
    expect(el.current!.id).toBe("tools");
  });

  it("NPS: «1» y luego «0» es un 10", () => {
    vi.useFakeTimers();
    const el = mount("");
    el.answers = { area: "prod" };
    el.next();
    key(el, "1");
    key(el, "0");
    expect(el.answers.nps).toBe(10);
  });

  it("multi: letras que marcan y desmarcan, con tope; «Otra» con texto propio", () => {
    const el = mount("");
    el.answers = { area: "prod", nps: 10 };
    el.next();
    el.next();
    expect(el.current!.id).toBe("tools");
    key(el, "a");
    key(el, "b");
    expect(el.answers.tools).toEqual(["ERP", "Excel"]);
    expect(el.querySelector(".nx-survey__limit")!.textContent).toBe("2 / 2");
    key(el, "c");
    expect(el.next()).toBe(false);
    expect(el.querySelector(".nx-survey__err")!.textContent).toBe("Elige hasta 2");
    key(el, "a");
    const other = el.querySelector<HTMLInputElement>(".nx-survey__other-text")!;
    other.value = "SAP";
    other.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.answers.tools).toEqual(["Excel", "Correo", "SAP"]);
  });

  it("texto: Enter sigue; el contador cuenta", () => {
    const el = mount("");
    el.answers = { area: "prod", nps: 2 };
    el.next();
    el.next();
    const input = el.querySelector<HTMLInputElement>(".nx-survey__text")!;
    expect(document.activeElement).toBe(input);
    input.value = "Más capacitación";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.querySelector(".nx-survey__counter")!.textContent).toBe("16 / 140");
    // Las letras que se escriben no eligen opciones ni nada.
    key(el, "a", input);
    key(el, "Enter", input);
    expect(el.current!.id).toBe("tools");
  });

  it("al enviar: nx-survey-submit con solo lo que se ve, el POST a action, y los resultados con «Tú»", async () => {
    const results = aggregate(cleanQuestions(QS), [{ area: "prod", nps: 9, tools: ["ERP"], stars: 4 }, { area: "adm", nps: 3, tools: ["Excel"], stars: 5 }, { area: "prod", nps: 10, tools: ["ERP"], stars: 4 }]);
    const fetchMock = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ results })));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('action="/encuesta"');
    let sent: unknown;
    el.addEventListener("nx-survey-submit", (e) => (sent = e.detail.answers));
    el.answers = { area: "prod", nps: 10, why: "rama abandonada", tools: ["ERP"], stars: 4 };
    el.start();
    for (let i = 0; i < 3; i++) el.next();
    expect(el.current!.id).toBe("stars");
    el.next();
    expect(sent).toEqual({ area: "prod", nps: 10, tools: ["ERP"], stars: 4 });
    expect(el.screen).toBe("sending");
    await sleep(10);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body)).answers).toEqual(sent);
    expect(el.screen).toBe("done");
    expect(el.querySelector(".nx-survey__done .nx-survey__title")!.textContent).toBe("¡Gracias!");
    expect(el.querySelector(".nx-survey__results h3")!.textContent).toContain("3 respuestas");
    const areaBars = [...el.querySelectorAll(".nx-survey__result")[0].querySelectorAll(".nx-survey__rbar")];
    expect(areaBars[0].textContent).toContain("Producción");
    expect(areaBars[0].hasAttribute("data-on")).toBe(true);
    expect(areaBars[0].textContent).toContain("67 %");
    expect(el.querySelector(".nx-survey__nps strong")!.textContent).toBe("+33");
    expect(el.querySelector(".nx-survey__bar")!.getAttribute("aria-valuenow")).toBe("100");
  });

  it("un error al enviar se muestra y deja reintentar", async () => {
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));
    const el = mount('action="/encuesta"', [QS[0]]);
    el.start();
    el.answers = { area: "adm" };
    el.next();
    await sleep(10);
    expect(el.screen).toBe("question");
    expect(el.querySelector(".nx-survey__err")!.textContent).toBe("No se pudo enviar. Inténtalo de nuevo.");
  });

  it("storage: guarda el borrador y ofrece continuar donde se quedó", () => {
    let el = mount('heading="Clima" storage="enc-1"');
    el.start();
    el.answers = { area: "adm" };
    el.next();
    el = mount('heading="Clima" storage="enc-1"');
    const resume = el.querySelector<HTMLButtonElement>('[data-act="resume"]')!;
    expect(resume.textContent).toContain("Continuar donde quedaste");
    resume.click();
    expect(el.current!.id).toBe("nps");
    expect(el.answers.area).toBe("adm");
    el.querySelector<HTMLButtonElement>('[data-act="back"]')!.click();
    expect(el.current!.id).toBe("area");
  });

  it("una respuesta JSON que no es un objeto («ok», true, 1) no es un error: el envío se guardó", async () => {
    for (const body of ['"ok"', "true", "1"]) {
      const fetchMock = vi.fn(async () => new Response(body));
      vi.stubGlobal("fetch", fetchMock);
      const el = mount('action="/encuesta"', [QS[0]]);
      el.start();
      el.answers = { area: "adm" };
      el.next();
      el.next(); // un segundo envío mientras el primero viaja no hace otro POST
      await sleep(10);
      expect(el.screen).toBe("done");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("action de otro origen: no se envía nada y se muestra el error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('action="https://evil.example/encuesta"', [QS[0]]);
    el.start();
    el.answers = { area: "adm" };
    el.next();
    await sleep(10);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.screen).toBe("question");
    expect(el.querySelector(".nx-survey__err")!.textContent).toBe("No se pudo enviar. Inténtalo de nuevo.");
    warn.mockRestore();
  });

  it("un borrador de otra versión del cuestionario (o respuestas con otra forma) no rompe el pintado", () => {
    const qs: SurveyQuestionInput[] = [QS[0], { id: "orden", type: "rank", title: "Ordena", options: ["A", "B", "C"] }, QS[4]];
    localStorage.setItem("enc-2", JSON.stringify({ answers: { area: { raro: 1 }, orden: "texto de otra versión", stars: 99, extra: "se queda" }, step: 2 }));
    const el = mount('heading="Clima" storage="enc-2"', qs);
    // Nada utilizable salvo «extra» (una pregunta que no está): se ofrece continuar.
    el.querySelector<HTMLButtonElement>('[data-act="resume"]')!.click();
    expect(el.screen).toBe("question");
    expect(el.answers).toEqual({ extra: "se queda" });
    el.answers = { area: "prod", orden: ["C", "X", "C"], stars: 3 } as never;
    expect(el.answers).toEqual({ area: "prod", orden: ["C", "A", "B"], stars: 3 });
    el.answers = { area: ["no", "es", "texto"], stars: "4" } as never;
    expect(el.answers).toEqual({});
  });

  it("estrellas: se encienden hasta la elegida", () => {
    const el = mount("", [QS[4]]);
    key(el, "4");
    expect([...el.querySelectorAll(".nx-survey__rate label")].map((l) => l.hasAttribute("data-lit"))).toEqual([true, true, true, true, false]);
  });

  it("ordenar con el teclado y deslizador con formato", () => {
    const el = mount("", [
      { id: "r", type: "rank", title: "Prioriza", options: ["Salario", "Horario", "Ambiente"] },
      { id: "s", type: "slider", title: "Presupuesto", min: 0, max: 10000000, step: 100000, format: "money", currency: "COP" },
    ]);
    const first = el.querySelector<HTMLElement>(".nx-survey__rank li")!;
    key(el, "ArrowDown", first);
    expect(el.answers.r).toEqual(["Horario", "Salario", "Ambiente"]);
    expect([...el.querySelectorAll(".nx-survey__pos")].map((p) => p.textContent)).toEqual(["1", "2", "3"]);
    el.next();
    expect(el.querySelector(".nx-survey__out")!.textContent).toBe("$ 5.000.000");
    const range = el.querySelector<HTMLInputElement>(".nx-survey__range")!;
    range.value = "7500000";
    range.dispatchEvent(new Event("input", { bubbles: true }));
    expect(el.answers.s).toBe(7500000);
    expect(el.querySelector(".nx-survey__out")!.textContent).toBe("$ 7.500.000");
  });

  it("BDUI y seguridad: nada del backend se interpreta como HTML", () => {
    const [el] = render({ component: "Survey", props: { questions: [{ id: "x", type: "choice", title: '<img src=x onerror="alert(1)">', options: [{ value: "a", label: "<b>a</b>" }] }] } }, document.body) as NxSurvey[];
    expect(el.tagName).toBe("NX-SURVEY");
    expect(el.querySelector("img, b")).toBeNull();
  });
});

describe("<nx-survey> · lo ya respondido", () => {
  const LONG: SurveyQuestionInput[] = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id, type: "text", title: `Pregunta ${id}` }));

  it("arriba quedan las respuestas dadas, en dos líneas; un clic vuelve a esa pregunta", async () => {
    const el = mount("");
    expect(el.querySelector(".nx-survey__trail")).toBeNull();
    key(el, "a");
    await sleep(500);
    const rows = el.querySelectorAll(".nx-survey__trail li");
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelector(".nx-survey__trail-q")!.textContent).toBe("¿En qué área trabajas?");
    expect(rows[0].querySelector(".nx-survey__trail-a")!.textContent).toBe("🏭 Producción");
    expect(rows[0].hasAttribute("data-new")).toBe(true);
    rows[0].querySelector<HTMLButtonElement>("button")!.click();
    expect(el.current!.id).toBe("area");
    expect(el.querySelector(".nx-survey__trail")).toBeNull();
    expect(el.querySelector<HTMLInputElement>('.nx-survey__opt input[value="prod"]')!.checked).toBe(true);
  });

  it("una pregunta opcional que se salta dice «Sin respuesta»", () => {
    const el = mount("", LONG.slice(0, 2));
    el.next();
    expect(el.querySelector(".nx-survey__trail-a")!.textContent).toBe("Sin respuesta");
    expect(el.querySelector(".nx-survey__trail-a")!.hasAttribute("data-empty")).toBe(true);
  });

  it("con más de tres, las viejas se pliegan tras un botón que las muestra", () => {
    const el = mount("", LONG);
    for (let i = 0; i < 5; i++) el.next();
    const trail = el.querySelector(".nx-survey__trail")!;
    expect(trail.querySelectorAll("li:not([hidden]) .nx-survey__trail-btn")).toHaveLength(2);
    const more = trail.querySelector<HTMLButtonElement>('[data-act="earlier"]')!;
    expect(more.textContent).toBe("Ver 3 respuestas anteriores");
    more.click();
    expect(trail.querySelectorAll("li:not([hidden]) .nx-survey__trail-btn")).toHaveLength(5);
    expect(trail.querySelector('[data-act="earlier"]')).toBeNull();
    // Abiertas siguen abiertas al volver.
    el.back();
    expect(el.querySelectorAll(".nx-survey__trail li:not([hidden])")).toHaveLength(4);
  });

  it("el pie: Anterior (salvo en la primera) y Siguiente, que en la última dice Enviar", () => {
    const el = mount("", LONG.slice(0, 2));
    const [back, next] = el.querySelectorAll<HTMLButtonElement>(".nx-survey__nav button");
    expect(back.hidden).toBe(true);
    expect(next.textContent).toBe("Siguiente");
    next.click();
    expect(el.current!.id).toBe("b");
    expect(back.hidden).toBe(false);
    expect(next.textContent).toBe("Enviar");
    expect(el.querySelector(".nx-survey__count")!.textContent).toBe("Pregunta 2 de 2");
  });

  it("al terminar, los resultados van plegados por pregunta, con la respuesta propia en el resumen", () => {
    const el = mount("");
    el.answers = { area: "prod", nps: 10, tools: ["ERP"], stars: 4 };
    el.addEventListener("nx-survey-submit", () => (el.results = aggregate(cleanQuestions(QS), [el.answers, { area: "adm", nps: 3, tools: ["Excel"], stars: 2 }])));
    el.start();
    for (let i = 0; i < 4; i++) el.next();
    const blocks = [...el.querySelectorAll<HTMLDetailsElement>("details.nx-survey__result")];
    expect(blocks.length).toBeGreaterThan(1);
    expect(blocks.map((d) => d.open)).toEqual([true, ...blocks.slice(1).map(() => false)]);
    expect(blocks[0].querySelector(".nx-survey__result-a")!.textContent).toBe("🏭 Producción");
  });
});
