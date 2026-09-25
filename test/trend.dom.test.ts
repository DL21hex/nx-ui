// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../src/components/trend/index";
import type { NxTrend, TrendSeries, TrendWhyDetail } from "../src/components/trend/index";

beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    this.dataset.open = "";
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    delete this.dataset.open;
    fire(this, "closed");
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function ndjson(events: object[]): Response {
  return new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

const months = (ys: (number | null)[]) => ys.map((y, i) => ({ x: `2026-${String(i + 1).padStart(2, "0")}`, y }));
const SERIES: TrendSeries[] = [
  { id: "mp", label: "Materia prima", points: months([388, 392, 401, 396, 405, 409, 412, 486, 431]) },
  { id: "mo", label: "Mano de obra", points: months([214, 215, 216, 216, 217, 221, 222, 248, 224]) },
  { id: "cif", label: "Indirectos", points: months([96, 98, 97, 101, 100, null, 104, 106, 104]) },
];

function mount(attrs = 'explain-endpoint="/ia/por-que"', setup?: (el: NxTrend) => void): NxTrend {
  document.body.innerHTML = `<div lang="es-CO"><nx-trend heading="Costo de producción 2026" format="money" currency="COP" ${attrs}></nx-trend></div>`;
  const el = document.querySelector("nx-trend")!;
  el.series = SERIES;
  el.anomalies = [{ series: "mp", x: "2026-08", label: "Acero +18 %" }];
  setup?.(el);
  return el;
}
const pts = (el: NxTrend) => [...el.querySelectorAll<HTMLButtonElement>(".nx-trend__pt")];
const keys = (el: NxTrend) => [...el.querySelectorAll<HTMLButtonElement>(".nx-trend__key")];
const key = (t: Element, k: string) => t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("<nx-trend>", () => {
  it("es una figura con un SVG que se describe solo, una leyenda y un botón por punto (un solo Tab)", () => {
    const el = mount();
    expect(el.getAttribute("role")).toBe("figure");
    expect(el.getAttribute("aria-label")).toBe("Costo de producción 2026");
    const svg = el.querySelector("svg.nx-trend__svg")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toContain("Materia prima: baja 11 % de agosto a septiembre; máximo en agosto");
    expect(svg.getAttribute("aria-label")).toContain("Materia prima fuera de lo normal en agosto");
    expect(el.querySelector(".nx-trend__summary")!.textContent).toBe(el.summary);
    expect(keys(el).map((b) => b.textContent)).toEqual(["Materia prima", "Mano de obra", "Indirectos"]);
    // 9 + 9 + 8 (un nulo): los nulos no son puntos.
    expect(pts(el)).toHaveLength(26);
    expect(pts(el).filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(pts(el)[7].getAttribute("aria-label")).toBe("Materia prima, agosto 2026: $ 486, anomalía Acero +18 %");
    expect(el.querySelectorAll(".nx-trend__line")).toHaveLength(3);
    expect(el.querySelectorAll(".nx-trend__flag")).toHaveLength(1);
    expect(el.querySelector(".nx-trend__flag text")!.textContent).toBe("Acero +18 %");
  });

  it("acepta los datos como atributos JSON y avisa si no lo son", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `<nx-trend kind="bar" series='${JSON.stringify([SERIES[0]])}' labels='{"table":"Tabla"}'></nx-trend>`;
    const el = document.querySelector("nx-trend")!;
    expect(el.series).toHaveLength(1);
    expect(el.querySelectorAll(".nx-trend__bar")).toHaveLength(9);
    expect(el.querySelector(".nx-trend__legend")!.hasAttribute("hidden")).toBe(true);
    expect(el.querySelector(".nx-trend__view")!.textContent).toBe("Tabla");
    el.setAttribute("series", "{nope");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("la leyenda oculta y muestra series sin repintar las demás; la última no se oculta", () => {
    const el = mount();
    const log: unknown[] = [];
    el.addEventListener("nx-trend-toggle", (e) => log.push(e.detail));
    const slotOf = (id: string) => el.querySelector(`.nx-trend__key[data-id="${id}"]`)!.getAttribute("data-slot");
    expect(slotOf("cif")).toBe("3");
    keys(el)[0].click();
    expect(log).toEqual([{ id: "mp", visible: false }]);
    expect(keys(el)[0].getAttribute("aria-pressed")).toBe("false");
    expect(pts(el)).toHaveLength(17);
    expect(slotOf("cif")).toBe("3");
    expect(el.querySelectorAll(".nx-trend__flag")).toHaveLength(0);
    keys(el)[1].click();
    keys(el)[2].click();
    expect(keys(el)[2].getAttribute("aria-pressed")).toBe("true");
    expect(log).toHaveLength(2);
    keys(el)[0].click();
    expect(log[2]).toEqual({ id: "mp", visible: true });
  });

  it("con el teclado: ← → por los periodos, ↑ ↓ entre series, con la línea vertical y el tooltip", () => {
    const el = mount();
    const first = pts(el)[0];
    first.focus();
    expect(el.querySelector(".nx-trend__tip")!.hasAttribute("hidden")).toBe(false);
    expect(el.querySelector(".nx-trend__tip")!.textContent).toContain("enero 2026");
    key(first, "ArrowRight");
    expect(document.activeElement).toBe(pts(el)[1]);
    expect(pts(el)[1].tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    expect(el.querySelector(".nx-trend__tip")!.textContent).toContain("febrero 2026");
    key(document.activeElement!, "End");
    expect(document.activeElement!.getAttribute("aria-label")).toContain("septiembre 2026");
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement!.getAttribute("aria-label")).toMatch(/^Mano de obra, septiembre 2026/);
    key(document.activeElement!, "ArrowUp");
    key(document.activeElement!, "ArrowUp");
    expect(document.activeElement!.getAttribute("aria-label")).toMatch(/^Indirectos, septiembre 2026/);
    // Junio no tiene dato en Indirectos: ← salta de julio a mayo.
    key(document.activeElement!, "ArrowLeft");
    key(document.activeElement!, "ArrowLeft");
    key(document.activeElement!, "ArrowLeft");
    expect(document.activeElement!.getAttribute("aria-label")).toMatch(/^Indirectos, mayo 2026/);
    key(document.activeElement!, "Escape");
    expect(el.querySelector(".nx-trend__tip")!.hasAttribute("hidden")).toBe(true);
  });

  it("clic en un punto: nx-trend-why con la pregunta y el contexto; cancelable", () => {
    const el = mount();
    let got: TrendWhyDetail | undefined;
    el.addEventListener("nx-trend-why", (e) => {
      got = e.detail;
      e.preventDefault();
    });
    pts(el)[7].click();
    expect(got!.question).toBe("¿Por qué sube Materia prima en agosto?");
    expect(got!.series).toEqual({ id: "mp", label: "Materia prima", format: "money", currency: "COP" });
    expect(got!.point).toEqual({ x: "2026-08", y: 486, label: "agosto 2026" });
    expect(got!.previous).toEqual({ x: "2026-07", y: 412 });
    expect(got!.window.map((p) => p.x)).toEqual(["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(got!.anomaly?.label).toBe("Acero +18 %");
    expect(document.querySelector(".nx-trend-why")).toBeNull();
  });

  it("«¿por qué?»: popover anclado con <nx-ai-answer> que pregunta al endpoint; Esc cierra y el foco vuelve al punto", async () => {
    const fetch = vi.fn(async () => ndjson([{ type: "step", id: "s1", label: "Consultando", status: "run" }, { type: "text", delta: "Subió por **el acero**." }, { type: "done" }]));
    vi.stubGlobal("fetch", fetch);
    const el = mount();
    const p = pts(el)[8];
    p.focus();
    p.click();
    const card = document.querySelector<HTMLElement>(".nx-trend-why")!;
    expect(card.getAttribute("role")).toBe("dialog");
    expect(card.getAttribute("aria-label")).toBe("¿Por qué baja Materia prima en septiembre?");
    expect(card.hasAttribute("data-open")).toBe(true);
    expect(p.getAttribute("aria-expanded")).toBe("true");
    expect(card.querySelector(".nx-trend-why__value")!.textContent).toBe("$ 431");
    expect(card.querySelector(".nx-trend-why__delta")!.textContent).toContain("▼ 11 % vs. agosto");
    await vi.waitFor(() => expect(card.querySelector("nx-ai-answer")).not.toBeNull());
    await vi.waitFor(() => expect(card.querySelector(".nx-ai__answer")?.textContent).toContain("Subió por el acero."));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/ia/por-que");
    const body = JSON.parse(String(init.body));
    expect(body.question).toBe("¿Por qué baja Materia prima en septiembre?");
    expect(body.context.point.x).toBe("2026-09");
    expect(body.context.previous).toEqual({ x: "2026-08", y: 486 });
    key(card, "Escape");
    expect(card.hasAttribute("data-open")).toBe(false);
    expect(card.querySelector("nx-ai-answer")).toBeNull();
    expect(p.hasAttribute("aria-expanded")).toBe(false);
    expect(document.activeElement).toBe(p);
  });

  it("explain-endpoint de otro origen: solo el evento, el contexto no sale", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const el = mount('explain-endpoint="https://otro.example/ia"');
    const log: string[] = [];
    el.addEventListener("nx-trend-why", (e) => log.push(e.detail.question));
    el.explain("mo", "2026-08");
    await sleep(0);
    expect(log).toHaveLength(1);
    expect(document.querySelector(".nx-trend-why")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("desconectarse con el «¿por qué?» abierto quita el popover y sus listeners de window", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ndjson([{ type: "done" }])));
    const el = mount();
    const added: string[] = [];
    const removed: string[] = [];
    const add = vi.spyOn(window, "addEventListener").mockImplementation(function (this: Window, t: string) {
      added.push(t);
    } as never);
    const rm = vi.spyOn(window, "removeEventListener").mockImplementation(function (this: Window, t: string) {
      removed.push(t);
    } as never);
    el.explain("mp", "2026-08");
    await sleep(0);
    expect(added).toEqual(expect.arrayContaining(["resize", "scroll"]));
    el.remove();
    expect(document.querySelector(".nx-trend-why")).toBeNull();
    expect(removed).toEqual(expect.arrayContaining(["resize", "scroll"]));
    add.mockRestore();
    rm.mockRestore();
  });

  it("locale: propiedad que refleja el atributo (el BDUI la manda como propiedad)", () => {
    const el = mount();
    el.locale = "en-US";
    expect(el.getAttribute("locale")).toBe("en-US");
    expect(el.querySelector("tbody th")!.textContent).toBe("January 2026");
    el.locale = null;
    expect(el.hasAttribute("locale")).toBe(false);
  });

  it("miles de puntos: dibuja y resalta la columna sin recorrer todo el SVG", () => {
    const many = Array.from({ length: 3000 }, (_, i) => ({ x: `20${String(10 + Math.floor(i / 365)).padStart(2, "0")}-${String((Math.floor(i / 28) % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, y: 100 + Math.sin(i) * 10 }));
    const el = mount("", (t) => (t.series = [{ id: "a", label: "A", points: many }]));
    const t0 = performance.now();
    el.series = [{ id: "a", label: "A", points: many }];
    expect(performance.now() - t0).toBeLessThan(3000);
    const b = pts(el)[10];
    b.focus();
    expect(el.querySelectorAll(".is-on").length).toBe(1);
    key(b, "ArrowRight");
    expect(el.querySelectorAll(".is-on").length).toBe(1);
  });

  it("explain() desde código y sin endpoint solo emite el evento", async () => {
    const el = mount("");
    const log: string[] = [];
    el.addEventListener("nx-trend-why", (e) => log.push(e.detail.question));
    el.explain("mo", "2026-08", "¿Horas extra?");
    el.explain("mo", "2030-01");
    await sleep(0);
    expect(log).toEqual(["¿Horas extra?"]);
    expect(document.querySelector(".nx-trend-why")).toBeNull();
  });

  it("«Ver como tabla»: los mismos datos, con las anomalías dichas", () => {
    const el = mount();
    const view = el.querySelector<HTMLButtonElement>(".nx-trend__view")!;
    expect(view.textContent).toBe("Ver como tabla");
    // La tabla existe siempre (para el lector de pantalla).
    const rows = () => [...el.querySelectorAll("tbody tr")].map((r) => [...r.children].map((c) => c.textContent));
    expect(rows()).toHaveLength(9);
    expect(rows()[5]).toEqual(["junio 2026", "$ 409", "$ 221", "—"]);
    expect(rows()[7][1]).toBe("$ 486 · Acero +18 %");
    view.click();
    expect(el.hasAttribute("data-table")).toBe(true);
    expect(view.getAttribute("aria-pressed")).toBe("true");
    expect(view.textContent).toBe("Ver como gráfico");
    expect([...el.querySelectorAll("thead th")].map((t) => t.textContent)).toEqual(["Periodo", "Materia prima", "Mano de obra", "Indirectos"]);
  });

  it("detect: marca también lo que se aparta de la media móvil", () => {
    const el = mount();
    expect(el.flags.map((f) => f.series)).toEqual(["mp"]);
    el.detect = true;
    expect(el.getAttribute("detect")).toBe("");
    expect(el.flags.map((f) => `${f.series}@${f.x}`)).toEqual(["mp@2026-08", "mo@2026-08"]);
    expect(el.querySelectorAll(".nx-trend__flag")).toHaveLength(2);
    expect(el.querySelectorAll(".nx-trend__flag text")[1].textContent).toBe("+13 %");
    el.detect = 0;
    expect(el.flags).toHaveLength(1);
  });

  it("vacío, cargando y barras con base en cero", () => {
    document.body.innerHTML = `<nx-trend></nx-trend>`;
    const el = document.querySelector("nx-trend")!;
    expect(el.querySelector(".nx-trend__empty")!.textContent).toBe("Sin datos para mostrar");
    expect(el.querySelector<HTMLElement>(".nx-trend__view")!.hidden).toBe(true);
    el.busy = true;
    el.series = SERIES;
    expect(el.querySelector(".nx-trend__plot")!.getAttribute("aria-busy")).toBe("true");
    expect(pts(el)).toHaveLength(0);
    el.busy = false;
    el.kind = "bar";
    expect(el.querySelectorAll(".nx-trend__bar")).toHaveLength(26);
    expect([...el.querySelectorAll(".nx-trend__tick")].some((t) => t.textContent === "0")).toBe(true);
  });
});
