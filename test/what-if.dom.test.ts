// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WHAT_IF_LABELS, type NxWhatIf, type WhatIfComputeDetail, type WhatIfSaveDetail, type WhatIfValues } from "../src/components/what-if/index";

const INPUTS = [
  { id: "acero", label: "Precio del acero", value: 780, min: 546, max: 1014, step: 5, format: "money", currency: "US$", hint: "Por tonelada" },
  { id: "volumen", label: "Volumen", value: 100, min: 80, max: 120, step: 1, unit: "u." },
];
const OUTPUTS = [
  { id: "margen", label: "Margen bruto", format: "percent", better: "up" },
  { id: "costo", label: "Costo", format: "number", better: "down" },
];
/** Un modelo de juguete: el margen baja con el acero, el costo sube con acero y volumen. */
const model = (v: WhatIfValues) => ({ margen: 0.3 - (v.acero - 780) / 2000, costo: v.acero * v.volumen });
const events = (v: WhatIfValues, notes: unknown[] = []) => [
  { type: "metric", id: "margen", value: model(v).margen },
  { type: "metric", id: "costo", value: model(v).costo },
  { type: "series", id: "caja", label: "Caja", points: [{ x: "ene", value: 1 }, { x: "feb", value: model(v).margen * 10 }] },
  ...notes,
  { type: "done" },
];

const nb = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

beforeEach(() => {
  // Movimiento reducido: los números llegan directo (sin rAF) y las pruebas leen el valor final.
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

/** Un simulador que calcula con `nx-what-if-compute` (sin espera entre cambios). */
function mount(opts: { respond?: boolean; attrs?: string } = {}): { el: NxWhatIf; calls: WhatIfValues[] } {
  document.body.innerHTML = `<nx-what-if debounce="0" locale="es-CO" ${opts.attrs ?? ""}></nx-what-if>`;
  const el = document.querySelector("nx-what-if")!;
  const calls: WhatIfValues[] = [];
  if (opts.respond !== false)
    el.addEventListener("nx-what-if-compute", (e) => {
      calls.push(e.detail.inputs);
      e.detail.respond(events(e.detail.inputs));
    });
  el.inputs = INPUTS;
  el.outputs = OUTPUTS;
  return { el, calls };
}
const range = (el: NxWhatIf, i = 0) => el.querySelectorAll<HTMLInputElement>(".nx-what-if__range")[i];
const row = (el: NxWhatIf, i = 0) => el.querySelectorAll<HTMLElement>(".nx-what-if__row")[i];
const key = (t: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  t.dispatchEvent(e);
  return e;
};
const card = (el: NxWhatIf, i: number) => el.querySelectorAll<HTMLElement>(".nx-what-if__card")[i];

describe("<nx-what-if>", () => {
  it("los supuestos son deslizadores con nombre, ayuda, valor grande y la base marcada", async () => {
    const { el } = mount();
    await tick();
    const r = range(el);
    expect(r.type).toBe("range");
    expect(el.querySelector(`label[for="${r.id}"]`)!.textContent).toBe("Precio del acero");
    expect(document.getElementById(r.getAttribute("aria-describedby")!)!.textContent).toBe("Por tonelada");
    expect(nb(r.getAttribute("aria-valuetext"))).toBe("US$ 780");
    expect(nb(row(el).querySelector(".nx-what-if__big")!.textContent)).toBe("US$ 780");
    expect(row(el).querySelector(".nx-what-if__delta")!.textContent).toBe(WHAT_IF_LABELS.atBase);
    expect(row(el).style.getPropertyValue("--b")).toBe(String((780 - 546) / (1014 - 546)));
    expect(row(el).querySelector<HTMLButtonElement>(".nx-what-if__reset")!.hidden).toBe(true);
    // En la base no hay nada que restablecer.
    expect(el.querySelector<HTMLButtonElement>(".nx-what-if__btn")!.hidden).toBe(true);
  });

  it("teclado: flechas, Mayús, páginas, Inicio/Fin; «vs. base» y aria-valuetext con el formato", async () => {
    const { el } = mount();
    const changes: (string | null)[] = [];
    el.addEventListener("nx-what-if-change", (e) => changes.push(e.detail.id));
    const r = range(el);
    expect(key(r, "ArrowRight").defaultPrevented).toBe(true);
    expect(el.values.acero).toBe(785);
    key(r, "PageUp");
    expect(el.values.acero).toBe(835);
    key(r, "ArrowLeft", { shiftKey: true });
    expect(el.values.acero).toBe(785);
    key(r, "End");
    expect(el.values.acero).toBe(1014);
    expect(nb(row(el).querySelector(".nx-what-if__delta")!.textContent)).toMatch(/^\+30\s?% vs\. base$/);
    expect(nb(r.getAttribute("aria-valuetext"))).toMatch(/^US\$ 1\.014, \+30\s?% vs\. base$/);
    expect(row(el).hasAttribute("data-moved")).toBe(true);
    key(r, "Home");
    expect(el.values.acero).toBe(546);
    expect(key(r, "a").defaultPrevented).toBe(false);
    expect(changes).toEqual(["acero", "acero", "acero", "acero", "acero"]);
  });

  it("arrastrar ajusta a la grilla que parte de la base; restablecer uno y todos", async () => {
    const { el } = mount();
    const r = range(el);
    r.value = "781.3";
    r.dispatchEvent(new Event("input"));
    expect(el.values.acero).toBe(780);
    r.value = "842";
    r.dispatchEvent(new Event("input"));
    expect(el.values.acero).toBe(840);
    key(range(el, 1), "ArrowUp");
    const reset = row(el).querySelector<HTMLButtonElement>(".nx-what-if__reset")!;
    expect(reset.hidden).toBe(false);
    expect(reset.getAttribute("aria-label")).toBe("Restablecer Precio del acero");
    reset.click();
    expect(el.values).toEqual({ acero: 780, volumen: 101 });
    expect(document.activeElement).toBe(r);
    const all = el.querySelector<HTMLButtonElement>(".nx-what-if__btn")!;
    expect(all.hidden).toBe(false);
    all.click();
    expect(el.values).toEqual({ acero: 780, volumen: 100 });
    expect(all.hidden).toBe(true);
  });

  it("el valor grande se escribe: Enter aplica (recortado), Escape deshace, el foco vuelve", () => {
    const { el } = mount();
    const big = row(el).querySelector<HTMLButtonElement>(".nx-what-if__big")!;
    const type = row(el).querySelector<HTMLInputElement>(".nx-what-if__type")!;
    expect(nb(big.getAttribute("aria-label"))).toBe("US$ 780, Escribir Precio del acero");
    big.click();
    expect(type.hidden).toBe(false);
    expect(big.hidden).toBe(true);
    expect(type.value).toBe("780");
    expect(document.activeElement).toBe(type);
    type.value = "900";
    key(type, "Enter");
    expect(el.values.acero).toBe(900);
    expect(type.hidden).toBe(true);
    expect(document.activeElement).toBe(big);
    big.click();
    type.value = "5 mil";
    key(type, "Enter");
    expect(el.values.acero).toBe(1014);
    big.click();
    type.value = "600";
    const esc = key(type, "Escape");
    expect(esc.defaultPrevented).toBe(true);
    expect(el.values.acero).toBe(1014);
    big.click();
    type.value = "basura";
    key(type, "Enter");
    expect(el.values.acero).toBe(1014);
  });

  it("calcula con nx-what-if-compute: tarjetas con valor, base y diferencia coloreada; gráfico y notas", async () => {
    const { el, calls } = mount();
    await tick();
    expect(calls).toEqual([{ acero: 780, volumen: 100 }]);
    expect(nb(card(el, 0).querySelector(".nx-what-if__num")!.textContent)).toMatch(/^30\s?%$/);
    // El primer cálculo, con todo en la base, da la base.
    expect(nb(card(el, 0).querySelector(".nx-what-if__base")!.textContent)).toMatch(/^Base 30\s?%$/);
    expect(card(el, 0).dataset.tone).toBe("flat");
    expect(card(el, 0).querySelector<HTMLElement>(".nx-what-if__chip")!.hidden).toBe(true);

    key(range(el), "PageUp"); // acero 830: el margen baja 2,5 p. p., el costo sube
    await tick();
    expect(calls.length).toBe(2);
    expect(nb(card(el, 0).querySelector(".nx-what-if__num")!.textContent)).toMatch(/^27,5\s?%$/);
    expect(card(el, 0).dataset.tone).toBe("bad");
    expect(card(el, 0).querySelector(".nx-what-if__chip")!.textContent).toBe("-2,5 p. p.");
    expect(card(el, 1).dataset.tone).toBe("bad");
    expect(nb(card(el, 1).querySelector(".nx-what-if__chip")!.textContent)).toMatch(/^\+5\.?000 · \+6,4\s?%$/);
    key(range(el), "Home");
    await tick();
    expect(card(el, 1).dataset.tone).toBe("good");

    // Gráfico: base (del cálculo en la base) punteada, escenario, área y tabla para lectores de pantalla.
    const chart = el.querySelector(".nx-what-if__chart")!;
    expect(chart.querySelector(".nx-what-if__lvalue")!.getAttribute("d")).toMatch(/^M0 /);
    expect(chart.querySelector(".nx-what-if__lbase")!.getAttribute("d")).toMatch(/^M0 /);
    expect(chart.querySelector("svg")!.getAttribute("aria-hidden")).toBe("true");
    expect(chart.querySelector("table caption")!.textContent).toBe("Caja");
    expect(chart.querySelectorAll("table tr").length).toBe(3);
  });

  it("las notas de un cálculo reemplazan a las anteriores; un error ofrece reintentar", async () => {
    document.body.innerHTML = `<nx-what-if debounce="0"></nx-what-if>`;
    const el = document.querySelector("nx-what-if")!;
    let reply: unknown[] = [{ type: "note", message: "Margen bajo el 15 %", tone: "warning" }, { type: "done" }];
    let n = 0;
    el.addEventListener("nx-what-if-compute", (e) => (n++, e.detail.respond(reply)));
    el.inputs = INPUTS;
    await tick();
    const notes = el.querySelector(".nx-what-if__notes")!;
    expect(notes.getAttribute("role")).toBe("status");
    expect(notes.querySelector<HTMLElement>(".nx-what-if__note")!.dataset.tone).toBe("warning");
    expect(notes.textContent).toBe("Margen bajo el 15 %");
    reply = [{ type: "error", message: "El modelo no respondió" }];
    el.recompute();
    await tick();
    expect(notes.textContent).toContain("El modelo no respondió");
    const retry = notes.querySelector<HTMLButtonElement>(".nx-what-if__retry")!;
    reply = [{ type: "done" }];
    retry.click();
    await tick();
    expect(n).toBe(3);
    expect(notes.textContent).toBe("");
  });

  it("respuesta asíncrona con preventDefault; una respuesta vieja no pisa a la nueva", async () => {
    document.body.innerHTML = `<nx-what-if debounce="0"></nx-what-if>`;
    const el = document.querySelector("nx-what-if")!;
    const pending: WhatIfComputeDetail[] = [];
    el.addEventListener("nx-what-if-compute", (e) => {
      e.preventDefault();
      pending.push(e.detail);
    });
    el.inputs = INPUTS;
    el.outputs = OUTPUTS;
    await tick();
    const results = el.querySelector(".nx-what-if__results")!;
    expect(results.hasAttribute("data-busy")).toBe(true);
    expect(results.getAttribute("aria-busy")).toBe("true");
    pending[0].respond(events(pending[0].inputs));
    expect(results.hasAttribute("data-busy")).toBe(false);
    key(range(el), "End");
    await tick();
    key(range(el), "Home");
    await tick();
    expect(pending.length).toBe(3);
    pending[2].respond(events(pending[2].inputs));
    await tick();
    pending[1].respond(events(pending[1].inputs)); // vieja: se ignora
    await tick();
    expect(el.outputs[0].value).toBeCloseTo(model({ acero: 546, volumen: 100 }).margen);
    expect(results.hasAttribute("data-busy")).toBe(false);
  });

  it("sin endpoint ni quien calcule, no se queda cargando", async () => {
    const { el } = mount({ respond: false });
    await tick();
    expect(el.querySelector(".nx-what-if__results")!.hasAttribute("data-busy")).toBe(false);
  });

  it("con endpoint: POST {inputs}, NDJSON en streaming; la petición anterior se cancela", async () => {
    const bodies: string[] = [];
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(init.body as string);
      signals.push(init.signal!);
      const v = JSON.parse(init.body as string).inputs as WhatIfValues;
      const text = events(v, [{ type: "note", message: "Ojo", tone: "warning" }])
        .map((e) => JSON.stringify(e))
        .join("\n");
      return new Response(`${text}\nbasura\n`, { headers: { "Content-Type": "application/x-ndjson" } });
    });
    const { el } = mount({ respond: false, attrs: 'endpoint="/calc"' });
    await tick(20);
    expect(JSON.parse(bodies[0])).toEqual({ inputs: { acero: 780, volumen: 100 } });
    expect(nb(card(el, 1).querySelector(".nx-what-if__num")!.textContent)).toBe("78.000");
    expect(el.querySelector(".nx-what-if__notes")!.textContent).toBe("Ojo");
    // Dos cambios seguidos: el primero se cancela al empezar el segundo.
    el.debounce = 0;
    key(range(el), "ArrowRight");
    await tick(0);
    key(range(el), "ArrowRight");
    await tick(20);
    expect(signals.length).toBeGreaterThanOrEqual(3);
    expect(JSON.parse(bodies.at(-1)!).inputs.acero).toBe(790);
    expect(el.outputs[1].value).toBe(79_000);
  });

  it("endpoint de otro origen: los supuestos no salen; calcula quien escuche nx-what-if-compute", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { calls } = mount({ attrs: 'endpoint="https://otro.example/calc"' });
    await tick(20);
    expect(fetch).not.toHaveBeenCalled();
    expect(calls.length).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it("deja de leer el stream después de done (y suelta la conexión)", async () => {
    let cancelled = false;
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const v = JSON.parse(init.body as string).inputs as WhatIfValues;
      const head = events(v).map((e) => JSON.stringify(e)).join("\n") + "\n";
      return new Response(
        new ReadableStream({
          start: (c) => c.enqueue(new TextEncoder().encode(head)),
          cancel: () => void (cancelled = true),
        }),
      );
    });
    const { el } = mount({ respond: false, attrs: 'endpoint="/calc"' });
    await tick(20);
    expect(el.querySelector(".nx-what-if__results")!.hasAttribute("data-busy")).toBe(false);
    expect(cancelled).toBe(true);
  });

  it("locale: propiedad que refleja el atributo", async () => {
    const { el } = mount();
    await tick();
    el.locale = "en-US";
    expect(el.getAttribute("locale")).toBe("en-US");
    await tick();
    expect(nb(card(el, 1).querySelector(".nx-what-if__num")!.textContent)).toBe("78,000");
  });

  it("un endpoint que falla dice el error, con reintentar", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 500 }));
    const { el } = mount({ respond: false, attrs: 'endpoint="/calc"' });
    await tick(20);
    expect(el.querySelector(".nx-what-if__notes")!.textContent).toContain(WHAT_IF_LABELS.error);
    expect(el.querySelector(".nx-what-if__retry")).not.toBeNull();
  });

  it("guardar como…: nombre por defecto, evento cancelable y la tabla comparativa", async () => {
    const { el } = mount();
    await tick();
    const saves: WhatIfSaveDetail[] = [];
    el.addEventListener("nx-what-if-save", (e) => saves.push(e.detail));
    key(range(el), "PageDown"); // acero 730: mejor margen, menor costo
    await tick();
    const save = el.querySelector<HTMLButtonElement>(".nx-what-if__btn--primary")!;
    save.click();
    const form = el.querySelector<HTMLFormElement>(".nx-what-if__form")!;
    const name = form.querySelector<HTMLInputElement>(".nx-what-if__name")!;
    expect(form.hidden).toBe(false);
    expect(save.hidden).toBe(true);
    expect(name.value).toBe("Escenario 1");
    expect(document.activeElement).toBe(name);
    name.value = "Acero barato";
    form.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(form.hidden).toBe(true);
    expect(document.activeElement).toBe(save);
    expect(saves[0].action).toBe("save");
    expect(saves[0].scenario).toMatchObject({ name: "Acero barato", inputs: { acero: 730, volumen: 100 }, outputs: { costo: 73_000 } });
    expect(el.scenarios.map((s) => s.name)).toEqual(["Acero barato"]);
    await tick();
    // Base | Acero barato (el actual es el guardado: sin columna «Actual»).
    const heads = [...el.querySelectorAll(".nx-what-if__table thead th")];
    expect(heads.map((th) => th.querySelector(".nx-what-if__sname")?.textContent ?? th.textContent)).toEqual(["Base", "Acero barato"]);
    expect(heads[1].getAttribute("aria-current")).toBe("true");
    const best = [...el.querySelectorAll(".nx-what-if__table .is-best")].map((td) => nb(td.textContent));
    expect(best).toEqual([expect.stringMatching(/^32,5\s?% \(mejor\)$/), "73.000 (mejor)"]);
    expect(el.querySelector<HTMLElement>(".nx-what-if__empty")!.hidden).toBe(true);

    // Cancelado: no se agrega.
    el.addEventListener("nx-what-if-save", (e) => e.preventDefault(), { once: true });
    el.save("Otro");
    expect(el.scenarios.length).toBe(1);
  });

  it("la tabla: columna «Actual», cargar, renombrar y borrar con el foco en su lugar", async () => {
    const { el } = mount();
    el.scenarios = [
      { id: "a", name: "Acero caro", inputs: { acero: 900, volumen: 100 }, outputs: model({ acero: 900, volumen: 100 }) },
      { id: "b", name: "Más volumen", inputs: { acero: 780, volumen: 120 }, outputs: model({ acero: 780, volumen: 120 }) },
    ];
    await tick();
    const th = () => [...el.querySelectorAll(".nx-what-if__table thead th")];
    expect(th().length).toBe(3);
    key(range(el, 1), "ArrowUp");
    await tick();
    expect(th().map((x) => x.classList.contains("is-current"))).toEqual([false, true, false, false]);
    expect(th()[1].textContent).toBe("Actual");

    // Cargar: los supuestos del escenario, ya.
    const load = el.querySelector<HTMLButtonElement>('[aria-label="Cargar Acero caro"]')!;
    load.focus();
    load.click();
    expect(el.values).toEqual({ acero: 900, volumen: 100 });
    await tick();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Cargar Acero caro");
    expect(th().length).toBe(3);

    // Renombrar: Enter aplica y emite; el foco vuelve al botón.
    const renames: WhatIfSaveDetail[] = [];
    el.addEventListener("nx-what-if-save", (e) => renames.push(e.detail));
    el.querySelector<HTMLButtonElement>('[aria-label="Renombrar Acero caro"]')!.click();
    await tick();
    const input = el.querySelector<HTMLInputElement>(".nx-what-if__table .nx-what-if__name")!;
    expect(document.activeElement).toBe(input);
    input.value = "Acero +15 %";
    input.dispatchEvent(new Event("input"));
    key(input, "Enter");
    expect(renames[0]).toMatchObject({ action: "rename", scenario: { id: "a", name: "Acero +15 %" } });
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Renombrar Acero +15 %");
    // Escape no renombra.
    el.querySelector<HTMLButtonElement>('[aria-label="Renombrar Más volumen"]')!.click();
    await tick();
    const again = el.querySelector<HTMLInputElement>(".nx-what-if__table .nx-what-if__name")!;
    again.value = "X";
    key(again, "Escape");
    expect(el.scenarios[1].name).toBe("Más volumen");

    // Borrar: el foco pasa al borrar del vecino, y sin escenarios, a la región.
    el.querySelector<HTMLButtonElement>('[aria-label="Borrar Acero +15 %"]')!.click();
    expect(el.scenarios.map((s) => s.id)).toEqual(["b"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Borrar Más volumen");
    (document.activeElement as HTMLButtonElement).click();
    expect(el.scenarios).toEqual([]);
    expect(document.activeElement).toBe(el.querySelector(".nx-what-if__scroll"));
    expect(el.querySelector<HTMLElement>(".nx-what-if__empty")!.hidden).toBe(false);
  });

  it("props antes de registrar, atributos JSON, labels y values", async () => {
    document.body.innerHTML = `<nx-what-if debounce="0" labels='{"inputs":"Assumptions"}' inputs='${JSON.stringify(INPUTS)}' outputs="no es json"></nx-what-if>`;
    const el = document.querySelector("nx-what-if")!;
    expect(el.querySelector(".nx-what-if__h")!.textContent).toBe("Assumptions");
    expect(el.inputs.length).toBe(2);
    el.values = { acero: 2000, volumen: "90" as unknown as number, otro: 1 };
    expect(el.values).toEqual({ acero: 1014, volumen: 90 });
    el.reset("acero");
    expect(el.values).toEqual({ acero: 780, volumen: 90 });
    el.heading = "Plan 2027";
    expect(el.querySelector(".nx-what-if__title")!.textContent).toBe("Plan 2027");
  });
});

describe("renombrar mientras llega un cálculo", () => {
  it("un cálculo que llega no recrea los botones de la cabecera (un clic a medias no se pierde)", async () => {
    const { el } = mount();
    await tick();
    el.scenarios = [{ id: "a", name: "Acero caro", inputs: { acero: 900, volumen: 100 }, outputs: {} }];
    await tick();
    const load = el.querySelector('[aria-label="Cargar Acero caro"]');
    el.series = [];
    await tick();
    expect(el.querySelector('[aria-label="Cargar Acero caro"]')).toBe(load);
    // Un nombre nuevo sí la recrea.
    el.scenarios = [{ id: "a", name: "Acero +", inputs: { acero: 900, volumen: 100 }, outputs: {} }];
    await tick();
    expect(el.querySelector('[aria-label="Cargar Acero +"]')).not.toBeNull();
  });

  it("el repintado no confirma el nombre a medias ni selecciona todo lo escrito", async () => {
    const { el } = mount();
    await tick();
    el.scenarios = [{ id: "a", name: "Acero caro", inputs: { acero: 900, volumen: 100 }, outputs: {} }];
    await tick();
    const saves: WhatIfSaveDetail[] = [];
    el.addEventListener("nx-what-if-save", (e) => saves.push(e.detail));
    el.querySelector<HTMLButtonElement>('[aria-label="Renombrar Acero caro"]')!.click();
    await tick();
    const first = el.querySelector<HTMLInputElement>(".nx-what-if__table .nx-what-if__name")!;
    first.value = "Acero +";
    first.setSelectionRange(7, 7);
    first.dispatchEvent(new Event("input"));
    // Llega un cálculo: la tabla se repinta.
    el.series = [];
    await tick();
    expect(saves).toHaveLength(0);
    // El mismo input sigue ahí (solo se repintó el cuerpo), con lo escrito y el cursor donde estaba.
    const now = el.querySelector<HTMLInputElement>(".nx-what-if__table .nx-what-if__name")!;
    expect(now).toBe(first);
    expect(now.value).toBe("Acero +");
    expect(document.activeElement).toBe(now);
    expect([now.selectionStart, now.selectionEnd]).toEqual([7, 7]);
    key(now, "Enter");
    expect(saves[0]).toMatchObject({ action: "rename", scenario: { name: "Acero +" } });
  });
});
