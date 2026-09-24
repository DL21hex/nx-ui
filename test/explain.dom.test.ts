// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import "../src/index";
import type { NxExplain } from "../src/index";

beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    fire(this, "closed");
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Una respuesta NDJSON que llega en trozos (las líneas pueden quedar partidas). */
function ndjson(events: object[], split = 7): Response {
  const text = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (let i = 0; i < text.length; i += split) c.enqueue(enc.encode(text.slice(i, i + split)));
        c.close();
      },
    }),
  );
}

const TOTAL = [
  { type: "value", label: "Total factura FE-10482", value: 10601500, format: "money", currency: "COP" },
  { type: "term", label: "Subtotal", value: 9100000, source: "mayor", explain: "/explicar/subtotal" },
  { type: "term", label: "IVA 19 %", value: 1729000, detail: "19 % de $ 9.100.000" },
  { type: "term", label: "Retención en la fuente", value: 227500, op: "-", href: "/retenciones/88" },
  { type: "compare", label: "agosto", value: 9300000, better: "down" },
  { type: "source", id: "mayor", title: "Libro mayor · septiembre", href: "/mayor" },
  { type: "text", delta: "Subió por **el IVA** de la lámina[^mayor]." },
  { type: "note", label: "cifras del cierre", tone: "success" },
  { type: "done" },
];
const SUBTOTAL = [
  { type: "value", label: "Subtotal", value: 9100000, currency: "COP" },
  { type: "term", label: "Lámina HR 3 mm × 40", value: 8000000 },
  { type: "term", label: "Transporte", value: 1100000 },
  { type: "done" },
];

function mount(attrs = 'endpoint="/explicar/total"'): NxExplain {
  document.body.innerHTML = `<p lang="es-CO">Total: <nx-explain ${attrs}>$ 10.601.500</nx-explain></p>`;
  return document.querySelector("nx-explain")!;
}
const card = () => document.querySelector<HTMLElement>(".nx-explain-card")!;
const terms = () => [...card().querySelectorAll(".nx-explain__term:not(.nx-explain__term--total)")].map((t) => t.querySelector(".nx-explain__term-text > span")!.textContent);

describe("<nx-explain>", () => {
  it("es un botón que abre un diálogo; no toca el contenido del autor (solo agrega una marca)", () => {
    const el = mount();
    expect(el.getAttribute("role")).toBe("button");
    expect(el.getAttribute("aria-haspopup")).toBe("dialog");
    expect(el.getAttribute("aria-expanded")).toBe("false");
    expect(el.tabIndex).toBe(0);
    expect(el.textContent!.trim()).toBe("$ 10.601.500");
    expect(el.querySelector(".nx-explain__mark")!.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelector(".nx-explain-card")).toBeNull(); // se crea al abrir
  });

  it("al pulsarla transmite el desglose: cifra, términos con su operación, cuadre, cambio y fuentes", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => ndjson(TOTAL));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount();
    el.click();
    expect(el.open).toBe(true);
    expect(el.getAttribute("aria-expanded")).toBe("true");
    expect(card().getAttribute("role")).toBe("dialog");
    expect(card().textContent).toContain("Desglosando…");
    await sleep(20);
    expect(fetchMock.mock.calls[0][0]).toBe("/explicar/total");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("GET");
    expect(card().getAttribute("aria-busy")).toBe("false");
    expect(card().querySelector(".nx-explain__value")!.textContent).toBe("$ 10.601.500");
    expect(terms()).toEqual(["Subtotal1", "IVA 19 %", "Retención en la fuente"]);
    const ops = [...card().querySelectorAll(".nx-explain__op")].map((o) => o.textContent);
    expect(ops).toEqual(["", "+", "−", "="]);
    // La resta se muestra en valor absoluto, con su signo en la columna de operación.
    expect(card().querySelectorAll(".nx-explain__num")[2].textContent).toBe("$ 227.500");
    expect(card().querySelector(".nx-explain__ok")!.textContent).toBe("Cuadra");
    // Subió frente a agosto, y subir es malo (better: down).
    const delta = card().querySelector(".nx-explain__delta")!;
    expect(delta.textContent).toBe("▲ 14 % vs. agosto");
    expect(delta.getAttribute("data-tone")).toBe("danger");
    expect(card().querySelector(".nx-explain__text strong")!.textContent).toBe("el IVA");
    expect(card().querySelector(".nx-explain__source a")!.getAttribute("href")).toBe("/mayor");
    expect(card().querySelector(".nx-explain__note")!.textContent).toBe("cifras del cierre");
    expect(card().querySelector<HTMLAnchorElement>("a.nx-explain__row")!.getAttribute("href")).toBe("/retenciones/88");
  });

  it("si los términos no suman la cifra, lo dice", async () => {
    vi.stubGlobal("fetch", async () => ndjson([TOTAL[0], TOTAL[1], TOTAL[2], { type: "done" }]));
    const el = mount();
    el.show();
    await sleep(20);
    const bad = card().querySelector(".nx-explain__bad")!;
    expect(bad.getAttribute("role")).toBe("alert");
    expect(bad.textContent).toBe("Los términos suman $ 10.829.000, no $ 10.601.500");
  });

  it("un término con `explain` abre su propio desglose; «volver» regresa sin pedirlo otra vez", async () => {
    const fetchMock = vi.fn(async (url: string) => ndjson(url.includes("subtotal") ? SUBTOTAL : TOTAL));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount();
    el.show();
    await sleep(20);
    card().querySelector<HTMLButtonElement>("[data-drill]")!.click();
    await sleep(20);
    expect(card().querySelector(".nx-explain__value")!.textContent).toBe("$ 9.100.000");
    expect(terms()).toEqual(["Lámina HR 3 mm × 40", "Transporte"]);
    expect(card().querySelector(".nx-explain__back")!.textContent).toBe("Total factura FE-10482");
    // Escape vuelve un nivel; en el primero, cierra.
    card().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(card().querySelector(".nx-explain__value")!.textContent).toBe("$ 10.601.500");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    card().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(el.open).toBe(false);
    // Abrirla de nuevo usa lo que ya trajo.
    el.show();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    el.refresh();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("explanation: el desglose en línea, sin servidor (BDUI)", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const [el] = render({ component: "Explain", props: { explanation: [{ type: "value", value: 0.19, format: "percent" }, { type: "term", label: "Tarifa general", value: 0.19, format: "percent" }], innerHTML: "<b>" } }, document.body) as NxExplain[];
    el.show();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(card().querySelector(".nx-explain__value")!.textContent).toBe("19 %");
    expect(card().querySelector(".nx-explain__ok")).not.toBeNull();
  });

  it("method=POST manda el contexto; un error del servidor se muestra", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response("", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/explicar" method="post"');
    el.context = { factura: 10482 };
    el.show();
    await sleep(20);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ context: { factura: 10482 } });
    expect(card().querySelector(".nx-explain__error")!.textContent).toBe("No se pudo desglosar la cifra");
  });

  it("teclado: Enter abre y enfoca la tarjeta; al cerrar, el foco vuelve a la cifra", async () => {
    vi.stubGlobal("fetch", async () => ndjson(TOTAL));
    const el = mount();
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(el.open).toBe(true);
    expect(document.activeElement).toBe(card());
    await sleep(20);
    card().querySelector<HTMLButtonElement>(".nx-explain__close")!.click();
    expect(el.open).toBe(false);
    expect(document.activeElement).toBe(el);
  });

  it("nada del backend se interpreta como HTML, y un href inseguro no se pinta como enlace", () => {
    const el = mount("");
    el.explanation = [{ type: "value", label: '<img src=x onerror="alert(1)">', value: 1 }, { type: "term", label: "x", value: 1, href: "javascript:alert(1)" }] as never;
    el.show();
    expect(card().querySelector("img")).toBeNull();
    expect(card().querySelector("a.nx-explain__row")).toBeNull();
  });

  it("al quitarse de la página, se lleva su tarjeta", () => {
    const el = mount("");
    el.explanation = [{ type: "value", value: 1 }];
    el.show();
    expect(card()).not.toBeNull();
    el.remove();
    expect(document.querySelector(".nx-explain-card")).toBeNull();
  });
});
