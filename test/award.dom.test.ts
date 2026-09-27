// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { nxFormat } from "../src/core/locale";
import { AWARD_LABELS, type AwardAdviseDetail, type AwardChangeDetail, type AwardSubmitDetail, type NxAward } from "../src/components/award/index";

const SUPPLIERS = [
  { id: "p1", name: "Ferrex", detail: "★ 4,6 · 5 d" },
  { id: "p2", name: "Induma" },
  { id: "p3", name: "Sumatec", alert: "Póliza vencida" },
];
const ITEMS = [
  { id: "a", name: "Tubo PVC", qty: 240, unit: "und", code: "TB-12", group: "Hidráulico" },
  { id: "b", name: "Codo 90°", qty: 100, unit: "und", group: "Hidráulico" },
  { id: "c", name: "Cable 12 AWG", qty: 1500, unit: "m", group: "Eléctricos" },
];
const QUOTES = [
  { item: "a", supplier: "p1", price: 18500, leadTime: 5, original: "US$ 4,46 · TRM 4.150" },
  { item: "a", supplier: "p2", price: 17900, leadTime: 8 },
  { item: "a", supplier: "p3", price: 19000, leadTime: 3 },
  { item: "b", supplier: "p1", price: 2500 },
  { item: "b", supplier: "p3", price: 2400, note: "Marca Gerfor" },
  { item: "c", supplier: "p2", price: 3200 },
];
const CRITERIA = [
  { id: "precio", label: "Precio", weight: 0.55 },
  { id: "plazo", label: "Plazo", weight: 0.3 },
  { id: "calidad", label: "Calidad", weight: 0.15 },
];
const ADVICE = [
  { type: "recommend", item: "a", supplier: "p2", reason: "El más barato", ranking: [{ supplier: "p2", score: 86, scores: { precio: 100, plazo: 40, calidad: 90 } }, { supplier: "p1", score: 80, scores: { precio: 96, plazo: 60, calidad: 70 } }, { supplier: "p3", score: 70 }] },
  { type: "recommend", item: "b", supplier: "p3", ranking: [{ supplier: "p3", score: 90 }, { supplier: "p1", score: 88 }] },
  { type: "recommend", item: "c", supplier: "p2", ranking: [{ supplier: "p2", score: 75 }] },
  { type: "flag", item: "b", message: "Decisión cerrada: el segundo queda a 2 puntos." },
  { type: "flag", item: "c", supplier: "p2", message: "Única cotización." },
  { type: "scenario", id: "uno", label: "Menos órdenes", picks: { b: "p1", c: "p9" } },
  { type: "done" },
];

const f = nxFormat("es-CO");
const money = (n: number, short = false) => {
  const big = short && Math.abs(n) >= 1e6;
  return f.money(big ? Number(n.toPrecision(3)) : n, { currency: "COP" }, big);
};
const nb = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const pc = (n: number) => nb(new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 0 }).format(n));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function mount(attrs = "", advice: unknown[] | null = ADVICE): NxAward {
  document.body.innerHTML = `<nx-award locale="es-CO" currency="COP" ${attrs}></nx-award>`;
  const el = document.querySelector("nx-award")!;
  el.suppliers = SUPPLIERS;
  el.items = ITEMS;
  el.quotes = QUOTES;
  el.criteria = CRITERIA;
  if (advice) el.advice = advice;
  return el;
}
const row = (el: NxAward, id: string) => el.querySelector<HTMLTableRowElement>(`tr[data-item="${id}"]`)!;
const head = (el: NxAward, id: string) => row(el, id).querySelector<HTMLElement>("th")!;
const cell = (el: NxAward, id: string, j: number) => row(el, id).querySelectorAll<HTMLElement>("td")[j];
const value = (el: NxAward, id: string, j: number) => nb(cell(el, id, j).querySelector(".nx-award__v")!.textContent);
const detail = (el: NxAward) => el.querySelector<HTMLElement>(".nx-award__detail");
const sum = (el: NxAward, i: number) => el.querySelectorAll<HTMLElement>(".nx-award__sum dd")[i];
const key = (t: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  t.dispatchEvent(e);
  return e;
};
const click = (t: Element) => t.dispatchEvent(new MouseEvent("click", { bubbles: true }));

describe("<nx-award>", () => {
  it("pinta la matriz: artículos agrupados, proveedores, precios del locale y «—» donde no cotizó", async () => {
    const el = mount();
    await tick();
    const table = el.querySelector("table")!;
    expect(table.getAttribute("role")).toBe("grid");
    expect(table.getAttribute("aria-label")).toBe(AWARD_LABELS.table);
    const heads = [...el.querySelectorAll("thead th")].map((t) => nb(t.textContent));
    expect(heads[0]).toBe("Artículo");
    expect(heads[1]).toContain("Ferrex");
    expect(heads[1]).toContain("★ 4,6 · 5 d");
    // La alerta del proveedor, con ícono y para el lector de pantalla.
    expect(heads[3]).toContain("Póliza vencida");
    expect(el.querySelectorAll("tbody").length).toBe(2);
    expect([...el.querySelectorAll(".nx-award__group th")].map((t) => nb(t.textContent).split(" · ")[0])).toEqual(["Hidráulico", "Eléctricos"]);
    expect(value(el, "a", 0)).toBe("18.500");
    expect(cell(el, "b", 1).hasAttribute("data-none")).toBe(true);
    expect(cell(el, "b", 1).getAttribute("aria-disabled")).toBe("true");
    expect(nb(cell(el, "b", 1).textContent)).toContain(AWARD_LABELS.noQuote);
    // Una sola celda en el orden de tabulación.
    expect(el.querySelectorAll('table [tabindex="0"]').length).toBe(1);
  });

  it("la sugerencia de la IA es también la elección inicial; resumen con total, órdenes y alertas", async () => {
    const el = mount();
    await tick();
    const a = cell(el, "a", 1);
    expect(a.hasAttribute("data-rec")).toBe(true);
    expect(a.hasAttribute("data-chosen")).toBe(true);
    expect(a.getAttribute("aria-selected")).toBe("true");
    expect(nb(a.textContent)).toContain(AWARD_LABELS.suggested);
    expect(a.querySelector(".nx-award__spark")).not.toBeNull();
    expect(cell(el, "a", 0).getAttribute("aria-selected")).toBe("false");
    const total = 17900 * 240 + 2400 * 100 + 3200 * 1500;
    expect(nb(sum(el, 0).textContent)).toBe(money(total, true));
    expect(nb(sum(el, 1).textContent)).toBe(AWARD_LABELS.same);
    expect(nb(sum(el, 2).textContent)).toBe("2 proveedores");
    expect(nb(sum(el, 3).textContent)).toContain("2de 2 alertas");
    // Alerta de fila (sin proveedor) y de celda (con proveedor).
    expect(head(el, "b").querySelector(".nx-award__warn:not(.is-seen)")).not.toBeNull();
    expect(cell(el, "c", 1).dataset.tone).toBe("warning");
    expect(cell(el, "c", 1).title).toBe("Única cotización.");
    // Pie: lo adjudicado a cada proveedor.
    const foot = [...el.querySelectorAll("tfoot td")].map((t) => nb(t.textContent));
    expect(foot).toEqual(["—", `2 art.${money(17900 * 240 + 3200 * 1500, true)}`, `1 art.${money(240000, true)}`]);
  });

  it("elegir otro proveedor: la sugerencia queda a la vista, se abre el detalle con el costo y el motivo", async () => {
    const el = mount();
    const changes: AwardChangeDetail[] = [];
    el.addEventListener("nx-award-change", (e) => changes.push(e.detail));
    await tick();
    click(cell(el, "a", 0));
    await tick();
    expect(cell(el, "a", 0).hasAttribute("data-chosen")).toBe(true);
    expect(cell(el, "a", 1).hasAttribute("data-chosen")).toBe(false);
    expect(cell(el, "a", 1).hasAttribute("data-rec")).toBe(true);
    expect(row(el, "a").hasAttribute("data-changed")).toBe(true);
    expect(nb(head(el, "a").textContent)).toContain(AWARD_LABELS.changed);
    expect(changes).toEqual([{ item: "a", supplier: "p1", recommended: "p2", reason: undefined, value: { a: "p1", b: "p3", c: "p2" } }]);
    const d = detail(el)!;
    expect(head(el, "a").getAttribute("aria-expanded")).toBe("true");
    expect(nb(d.querySelector(".nx-award__change p")!.textContent)).toBe(`Elegiste Ferrex: +${money(600 * 240)} frente a la sugerencia.`);
    expect(nb(sum(el, 1).textContent)).toBe(`+${money(144000, true)}1 cambio`);
    expect(sum(el, 1).querySelector("span")!.dataset.tone).toBe("up");
    // El ranking: la sugerencia primero, con el aporte de cada criterio y el precio original.
    const lis = [...d.querySelectorAll(".nx-award__rank li")];
    expect(lis.map((li) => nb(li.querySelector(".nx-award__pick")!.textContent))).toEqual(["Induma", "Ferrex", "Sumatec"]);
    expect(lis[1].hasAttribute("data-chosen")).toBe(true);
    expect(lis[0].querySelectorAll(".nx-award__bar > span").length).toBe(3);
    expect(lis[0].querySelector<HTMLElement>(".nx-award__bar > span")!.style.inlineSize).toBe("55%");
    expect(lis[2].querySelectorAll(".nx-award__bar > span").length).toBe(1);
    expect(nb(lis[1].textContent)).toContain("Cotizó: US$ 4,46 · TRM 4.150");
    expect(nb(d.querySelector(".nx-award__ai")!.textContent)).toBe("El más barato");
    expect(nb(d.querySelector(".nx-award__legend")!.textContent)).toBe(`Precio ${pc(0.55)}Plazo ${pc(0.3)}Calidad ${pc(0.15)}`);

    // Motivo: se escribe (con sugerencias) y se avisa al confirmarlo.
    const input = d.querySelector<HTMLInputElement>(".nx-award__reason")!;
    expect(input.getAttribute("list")).toBe(el.querySelector("datalist")!.id);
    expect(el.querySelectorAll("datalist option").length).toBe(5);
    input.value = "Calidad comprobada";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("change"));
    expect(changes.at(-1)).toMatchObject({ item: "a", supplier: "p1", reason: "Calidad comprobada" });
    expect(el.choices).toEqual([{ item: "a", supplier: "p1", reason: "Calidad comprobada" }]);

    // Volver a la sugerencia.
    const undo = d.querySelector<HTMLButtonElement>("[data-f=undo]")!;
    undo.focus();
    click(undo);
    await tick();
    expect(cell(el, "a", 1).hasAttribute("data-chosen")).toBe(true);
    expect(row(el, "a").hasAttribute("data-changed")).toBe(false);
    expect(el.choices).toEqual([]);
    expect(changes.at(-1)).toMatchObject({ item: "a", supplier: "p2", recommended: "p2" });
    // El foco no se pierde: vuelve a la fila.
    expect(document.activeElement).toBe(head(el, "a"));
  });

  it("elegir desde el ranking del detalle, y una celda sin cotización no se elige", async () => {
    const el = mount();
    await tick();
    click(cell(el, "b", 1));
    await tick();
    expect(el.value.b).toBe("p3");
    click(head(el, "b"));
    await tick();
    const pick = [...detail(el)!.querySelectorAll<HTMLButtonElement>(".nx-award__pick")].find((b) => b.textContent === "Ferrex")!;
    pick.focus();
    click(pick);
    await tick();
    expect(el.value.b).toBe("p1");
    // El detalle se repintó y el foco sigue en el mismo botón.
    expect((document.activeElement as HTMLElement).dataset.f).toBe("pick:p1");
    expect(detail(el)!.querySelector('[data-f="pick:p1"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("teclado: flechas con foco móvil, Espacio elige, Supr vuelve a la sugerencia, Intro abre y Esc cierra", async () => {
    const el = mount();
    await tick();
    const start = head(el, "a");
    expect(start.tabIndex).toBe(0);
    start.focus();
    key(start, "ArrowRight");
    expect(document.activeElement).toBe(cell(el, "a", 0));
    expect(cell(el, "a", 0).tabIndex).toBe(0);
    expect(start.tabIndex).toBe(-1);
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(cell(el, "b", 0));
    key(document.activeElement!, "ArrowUp");
    key(document.activeElement!, "ArrowUp");
    // La fila de encabezados también es parte de la grilla.
    expect((document.activeElement as HTMLElement).dataset.supplier).toBe("p1");
    key(document.activeElement!, "End", { ctrlKey: true });
    expect(document.activeElement).toBe(cell(el, "c", 2));
    key(document.activeElement!, "Home");
    expect(document.activeElement).toBe(head(el, "c"));

    cell(el, "a", 2).focus();
    expect(key(cell(el, "a", 2), " ").defaultPrevented).toBe(true);
    await tick();
    expect(el.value.a).toBe("p3");
    key(cell(el, "a", 2), "Delete");
    await tick();
    expect(el.value.a).toBe("p2");

    head(el, "c").focus();
    key(head(el, "c"), "Enter");
    await tick();
    expect(detail(el)).not.toBeNull();
    expect(head(el, "c").getAttribute("aria-expanded")).toBe("true");
    key(head(el, "c"), "Escape");
    expect(detail(el)).toBeNull();
    expect(document.activeElement).toBe(head(el, "c"));
  });

  it("alertas: J lleva a la siguiente por revisar, la abre y el contador baja", async () => {
    const el = mount();
    await tick();
    head(el, "a").focus();
    key(head(el, "a"), "j");
    expect(document.activeElement).toBe(head(el, "b"));
    expect(nb(detail(el)!.querySelector(".nx-award__flags")!.textContent)).toContain("Decisión cerrada");
    await tick();
    expect(nb(sum(el, 3).querySelector("span")!.textContent)).toBe("1");
    expect(head(el, "b").querySelector(".nx-award__warn.is-seen")).not.toBeNull();
    // «Siguiente alerta» del resumen hace lo mismo.
    click(sum(el, 3).querySelector("button")!);
    expect(document.activeElement).toBe(head(el, "c"));
    await tick();
    expect(nb(sum(el, 3).textContent)).toContain(AWARD_LABELS.reviewed);
    // La misma alerta en otra recomendación sigue abierta; una distinta vuelve a estar por revisar
    // (si el artículo no está abierto: quien lo tiene abierto la está viendo).
    el.open(null);
    el.advice = ADVICE.map((e) => (e.type === "flag" && e.item === "c" ? { ...e, message: "Otra cosa." } : e));
    await tick();
    expect(nb(sum(el, 3).querySelector("span")!.textContent)).toBe("1");
  });

  it("filtros y lentes", async () => {
    const el = mount();
    await tick();
    const [all, alerts, changed] = el.querySelectorAll<HTMLButtonElement>(".nx-award__segbtn");
    expect(nb(alerts.textContent)).toBe("Con alertas2");
    click(alerts);
    await tick();
    expect(alerts.getAttribute("aria-pressed")).toBe("true");
    expect(row(el, "a").hidden).toBe(true);
    expect(row(el, "b").hidden).toBe(false);
    click(changed);
    await tick();
    // Nada cambiado: todas ocultas, y también los grupos.
    expect([...el.querySelectorAll<HTMLElement>("tbody tr")].every((tr) => tr.hidden)).toBe(true);
    click(all);
    el.lens = "total";
    await tick();
    expect(value(el, "a", 1)).toBe(money(17900 * 240, true));
    el.lens = "lead";
    await tick();
    expect(value(el, "a", 2)).toBe("3 d");
    expect(value(el, "b", 0)).toBe("—");
    el.lens = "score";
    await tick();
    expect(value(el, "a", 0)).toBe("80");
    const lens = el.querySelectorAll<HTMLSelectElement>(".nx-award__select")[1];
    expect(lens.value).toBe("score");
  });

  it("escenarios: cambian la sugerencia de los artículos que tocan", async () => {
    const el = mount();
    const changes: AwardChangeDetail[] = [];
    el.addEventListener("nx-award-change", (e) => changes.push(e.detail));
    await tick();
    const sel = el.querySelectorAll<HTMLSelectElement>(".nx-award__select")[0];
    expect(sel.closest("label")!.hidden).toBe(false);
    const opts = [...sel.options].map((o) => nb(o.textContent));
    expect(opts[0]).toBe("Mejor por artículo · 2 proveedores");
    expect(opts[1]).toMatch(/^Menos órdenes · 2 proveedores · \+0,1\s?%$/);
    sel.value = "uno";
    sel.dispatchEvent(new Event("change"));
    await tick();
    expect(el.scenario).toBe("uno");
    expect(cell(el, "b", 0).hasAttribute("data-rec")).toBe(true);
    expect(cell(el, "b", 0).hasAttribute("data-chosen")).toBe(true);
    // Un pick de alguien que no cotizó se ignora.
    expect(cell(el, "c", 1).hasAttribute("data-rec")).toBe(true);
    expect(changes.at(-1)).toMatchObject({ item: null, value: { a: "p2", b: "p1", c: "p2" } });
    // Lo que el comprador eligió a mano se respeta; si coincide con la sugerencia nueva, ya no es un cambio.
    el.scenario = "";
    el.choices = [{ item: "b", supplier: "p1", reason: "Habitual" }];
    await tick();
    expect(row(el, "b").hasAttribute("data-changed")).toBe(true);
    el.scenario = "uno";
    await tick();
    expect(row(el, "b").hasAttribute("data-changed")).toBe(false);
  });

  it("sin endpoint pide la recomendación con nx-award-advise; los pesos y las exclusiones la vuelven a pedir", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<nx-award locale="es-CO"></nx-award>`;
    const el = document.querySelector("nx-award")!;
    const asks: AwardAdviseDetail[] = [];
    el.addEventListener("nx-award-advise", (e) => {
      asks.push(e.detail);
      e.preventDefault();
    });
    el.suppliers = SUPPLIERS;
    el.items = ITEMS;
    el.quotes = QUOTES;
    el.criteria = CRITERIA;
    await vi.advanceTimersByTimeAsync(0);
    expect(asks.length).toBe(1);
    expect(asks[0].weights).toEqual({ precio: 55, plazo: 30, calidad: 15 });
    expect(asks[0].excluded).toEqual([]);
    expect(el.hasAttribute("data-busy")).toBe(true);
    expect(nb(el.querySelector(".nx-award__notes")!.textContent)).toBe(AWARD_LABELS.advising);
    asks[0].respond(ADVICE);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.hasAttribute("data-busy")).toBe(false);
    expect(cell(el, "a", 1).hasAttribute("data-rec")).toBe(true);

    // Mover un peso: espera y pide con los pesos nuevos.
    el.querySelector<HTMLButtonElement>(".nx-award__tools .nx-award__btn")!.click();
    const range = el.querySelector<HTMLInputElement>(".nx-award__range")!;
    range.value = "80";
    range.dispatchEvent(new Event("input"));
    expect(nb(el.querySelector(".nx-award__share")!.textContent)).toBe(pc(0.64));
    await vi.advanceTimersByTimeAsync(100);
    expect(asks.length).toBe(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(asks.length).toBe(2);
    expect(asks[1].weights.precio).toBe(80);
    // La recomendación nueva no trae «b»: al terminar, su sugerencia desaparece.
    asks[1].respond([ADVICE[0], ADVICE[2], { type: "done" }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(cell(el, "b", 2).hasAttribute("data-rec")).toBe(false);
    expect(el.value.b).toBeUndefined();

    // Excluir a un proveedor desde su columna.
    click(el.querySelector('[data-supplier="p2"]')!);
    await vi.advanceTimersByTimeAsync(0);
    const bar = el.querySelector<HTMLElement>(".nx-award__sup")!;
    expect(bar.hidden).toBe(false);
    expect(nb(bar.textContent)).toContain("2 cotizados · 2 adjudicados");
    click(bar.querySelector('[data-f="sup:ex"]')!);
    await vi.advanceTimersByTimeAsync(0);
    expect(asks.at(-1)!.excluded).toEqual(["p2"]);
    expect(cell(el, "a", 1).hasAttribute("data-excluded")).toBe(true);
    expect(nb(el.querySelector('[data-supplier="p2"]')!.textContent)).toContain(AWARD_LABELS.excluded);
  });

  it("con endpoint: POST {weights, excluded} y la respuesta en NDJSON, fila por fila; un error deja reintentar", async () => {
    const bodies: unknown[] = [];
    let fail = false;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (fail) return new Response("no", { status: 500 });
      const text = ADVICE.map((e) => JSON.stringify(e)).join("\n");
      return new Response(text, { headers: { "Content-Type": "application/x-ndjson" } });
    }));
    const el = mount('endpoint="/compras/rfq/88/recomendar"', null);
    await tick(10);
    expect(bodies).toEqual([{ weights: { precio: 55, plazo: 30, calidad: 15 }, excluded: [] }]);
    expect(cell(el, "b", 2).hasAttribute("data-rec")).toBe(true);
    expect(el.advice.filter((e) => e.type === "recommend").length).toBe(3);
    fail = true;
    el.refresh();
    await tick(10);
    const note = el.querySelector<HTMLElement>('.nx-award__note[data-tone="danger"]')!;
    expect(nb(note.textContent)).toContain(AWARD_LABELS.error);
    // Lo anterior se conserva si la recomendación falla.
    expect(cell(el, "b", 2).hasAttribute("data-rec")).toBe(true);
    fail = false;
    click(note.querySelector("button")!);
    await tick(10);
    expect(el.querySelector('.nx-award__note[data-tone="danger"]')).toBeNull();
    expect(bodies.length).toBe(3);
  });

  it("un endpoint de otro origen no se usa: se pide a la app", async () => {
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);
    document.body.innerHTML = `<nx-award endpoint="https://otro.example/recomendar"></nx-award>`;
    const el = document.querySelector("nx-award")!;
    const asked = vi.fn();
    el.addEventListener("nx-award-advise", asked);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await tick(5);
    expect(spy).not.toHaveBeenCalled();
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it("darle todo a un proveedor y deshacerlo", async () => {
    const el = mount();
    const changes: AwardChangeDetail[] = [];
    el.addEventListener("nx-award-change", (e) => changes.push(e.detail));
    await tick();
    click(el.querySelector('[data-supplier="p1"]')!);
    await tick();
    click(el.querySelector('[data-f="sup:all"]')!);
    await tick();
    expect(el.value).toEqual({ a: "p1", b: "p1", c: "p2" });
    expect(el.choices).toEqual([
      { item: "a", supplier: "p1", reason: "Consolidar en Ferrex" },
      { item: "b", supplier: "p1", reason: "Consolidar en Ferrex" },
    ]);
    expect(changes.at(-1)).toMatchObject({ item: null, supplier: "p1" });
    const bulk = el.querySelector<HTMLElement>(".nx-award__bulk")!;
    expect(nb(bulk.textContent)).toContain("2 artículos pasaron a Ferrex.");
    click(bulk.querySelector("button")!);
    await tick();
    expect(el.choices).toEqual([]);
    expect(el.querySelector(".nx-award__bulk")).toBeNull();
  });

  it("generar las órdenes: agrupadas por proveedor, con los cambios y su motivo", async () => {
    const el = mount();
    const sent: AwardSubmitDetail[] = [];
    el.addEventListener("nx-award-submit", (e) => sent.push(e.detail));
    el.choices = [{ item: "a", supplier: "p1", reason: "Calidad" }];
    await tick();
    expect(el.submit()).toBe(true);
    const d = sent[0];
    expect(d.orders.map((o) => [o.supplier, o.lines.map((l) => l.item), o.total])).toEqual([
      ["p1", ["a"], 18500 * 240],
      ["p2", ["c"], 3200 * 1500],
      ["p3", ["b"], 240000],
    ]);
    expect(d.changes).toEqual([{ item: "a", supplier: "p1", recommended: "p2", reason: "Calidad", delta: 144000 }]);
    expect(d.total).toBe(18500 * 240 + 3200 * 1500 + 240000);
    expect(d.unassigned).toEqual([]);
    expect(d.pending).toBe(2);
    expect(d.weights).toEqual({ precio: 55, plazo: 30, calidad: 15 });
  });

  it("require-reason y require-review llevan a lo que falta antes de generar", async () => {
    const el = mount("require-reason require-review");
    const sent = vi.fn();
    el.addEventListener("nx-award-submit", sent);
    await tick();
    click(cell(el, "a", 0));
    await tick();
    head(el, "c").focus();
    el.querySelector<HTMLButtonElement>(".nx-award__btn--primary")!.click();
    expect(sent).not.toHaveBeenCalled();
    expect(nb(el.querySelector(".nx-award__msg")!.textContent)).toBe("Falta el motivo del cambio en Tubo PVC.");
    expect((document.activeElement as HTMLElement).dataset.f).toBe("reason");
    const input = document.activeElement as HTMLInputElement;
    input.value = "Plazo de entrega";
    input.dispatchEvent(new Event("input"));
    expect(el.submit()).toBe(false);
    expect(nb(el.querySelector(".nx-award__msg")!.textContent)).toBe(AWARD_LABELS.needReview);
    expect(document.activeElement).toBe(head(el, "b"));
    el.next();
    expect(el.submit()).toBe(true);
    expect(sent).toHaveBeenCalledTimes(1);
    expect(el.querySelector(".nx-award__msg")!.textContent).toBe("");
  });

  it("readonly: se consulta, no se cambia", async () => {
    const el = mount("readonly");
    await tick();
    click(cell(el, "a", 0));
    await tick();
    expect(el.value.a).toBe("p2");
    expect(el.querySelector("table")!.getAttribute("aria-readonly")).toBe("true");
    expect(el.querySelector<HTMLElement>(".nx-award__btn--primary")!.hidden).toBe(true);
    click(head(el, "a"));
    await tick();
    expect([...detail(el)!.querySelectorAll<HTMLButtonElement>(".nx-award__pick")].every((b) => b.disabled)).toBe(true);
    click(el.querySelector('[data-supplier="p1"]')!);
    await tick();
    expect(el.querySelector('[data-f="sup:ex"]')).toBeNull();
    expect(el.querySelector('[data-f="sup:all"]')).toBeNull();
  });

  it("revisión: no genera órdenes mientras llega una recomendación", async () => {
    const el = mount();
    const sent = vi.fn();
    el.addEventListener("nx-award-submit", sent);
    el.addEventListener("nx-award-advise", (e) => e.preventDefault());
    await tick();
    el.refresh();
    await tick();
    expect(el.hasAttribute("data-busy")).toBe(true);
    expect(el.submit()).toBe(false);
    expect(sent).not.toHaveBeenCalled();
    expect(el.querySelector(".nx-award__msg")!.textContent).toBe(AWARD_LABELS.busy);
  });

  it("revisión: el escenario que ya no llega vuelve a lo mejor por artículo, y avisa", async () => {
    const el = mount();
    await tick();
    el.scenario = "uno";
    await tick();
    const changes: AwardChangeDetail[] = [];
    el.addEventListener("nx-award-change", (e) => changes.push(e.detail));
    el.advice = ADVICE.filter((e) => e.type !== "scenario");
    await tick();
    expect(el.scenario).toBe("");
    expect(el.value.b).toBe("p3");
    expect(changes.at(-1)).toMatchObject({ item: null });
  });

  it("revisión: pesos antes que criterios; mover el elemento no pierde el pedido pendiente", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="a"></div><div id="b"></div>`;
    const el = document.createElement("nx-award");
    const asks: AwardAdviseDetail[] = [];
    el.addEventListener("nx-award-advise", (e) => {
      asks.push(e.detail);
      e.detail.respond(ADVICE);
    });
    el.weights = { precio: 80, plazo: 20, calidad: 0 };
    el.criteria = CRITERIA;
    expect(el.weights).toEqual({ precio: 80, plazo: 20, calidad: 0 });
    el.suppliers = SUPPLIERS;
    el.items = ITEMS;
    el.quotes = QUOTES;
    document.getElementById("a")!.append(el);
    await vi.advanceTimersByTimeAsync(0);
    expect(asks.length).toBe(1);
    el.weights = { precio: 10 };
    document.getElementById("b")!.append(el);
    await vi.advanceTimersByTimeAsync(400);
    expect(asks.length).toBe(2);
    expect(asks[1].weights.precio).toBe(10);
    // Asignar `excluded` también vuelve a pedir.
    el.excluded = ["p2"];
    await vi.advanceTimersByTimeAsync(0);
    expect(asks.at(-1)!.excluded).toEqual(["p2"]);
  });

  it("revisión: lo escrito en el motivo sobrevive a una recomendación que llega", async () => {
    const el = mount();
    await tick();
    click(cell(el, "a", 0));
    await tick();
    const input = detail(el)!.querySelector<HTMLInputElement>(".nx-award__reason")!;
    input.focus();
    input.value = "Plazo ";
    input.dispatchEvent(new Event("input"));
    el.advice = ADVICE;
    await tick();
    expect(detail(el)!.querySelector(".nx-award__reason")).toBe(input);
    expect(input.value).toBe("Plazo ");
    expect(document.activeElement).toBe(input);
    expect(el.choices).toEqual([{ item: "a", supplier: "p1", reason: "Plazo" }]);
  });

  it("revisión: K sin nada abierto va a la última alerta; con «Cambiados», Supr no deja el foco perdido", async () => {
    const el = mount();
    await tick();
    el.next(-1);
    expect(document.activeElement).toBe(head(el, "c"));
    el.open(null);
    el.choices = [{ item: "a", supplier: "p1" }];
    el.filter = "changed";
    await tick();
    cell(el, "a", 0).focus();
    key(cell(el, "a", 0), "Delete");
    await tick();
    expect(row(el, "a").hidden).toBe(true);
    // No queda ninguna fila: el foco va al encabezado de la grilla, no a una celda oculta.
    expect((document.activeElement as HTMLElement).closest("tr")?.hidden).not.toBe(true);
    expect(el.contains(document.activeElement)).toBe(true);
  });

  it("atributos JSON (BDUI) y textos propios", async () => {
    document.body.innerHTML = `<nx-award locale="es-CO" heading="RFQ-88" labels='{"submit":"Adjudicar","total":7}'
      suppliers='${JSON.stringify(SUPPLIERS)}' items='${JSON.stringify(ITEMS)}' quotes='${JSON.stringify(QUOTES)}'
      advice='${JSON.stringify(ADVICE)}' choices='[{"item":"c","supplier":"p2"}]' excluded='["p3"]'></nx-award>`;
    const el = document.querySelector("nx-award")!;
    await tick();
    expect(el.querySelector(".nx-award__btn--primary")!.textContent).toBe("Adjudicar");
    expect(el.labels.total).toBe(AWARD_LABELS.total);
    expect(el.querySelector("h2")!.textContent).toBe("RFQ-88");
    expect(el.querySelector("table")!.getAttribute("aria-labelledby")).toBe(el.querySelector("h2")!.id);
    expect(cell(el, "b", 2).hasAttribute("data-rec")).toBe(true);
    expect(el.excluded).toEqual(["p3"]);
    // Sin criterios no hay botón de criterios.
    expect(el.querySelector<HTMLElement>(".nx-award__tools .nx-award__btn")!.hidden).toBe(true);
  });
});
