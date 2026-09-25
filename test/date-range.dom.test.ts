// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador
// (`beforetoggle` síncrono, `toggle` después). El posicionamiento y el <form> se verifican en el navegador.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { registerComponent, render } from "../src/bdui";
import { DATE_RANGE_LABELS, type DateRangeValue, type NxDateRange } from "../src/components/date-range/index";

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
  document.body.innerHTML = "";
});

function mount(attrs = ""): NxDateRange {
  document.body.innerHTML = `<button id="before">antes</button><nx-date-range today="2026-09-25" week-start="1" locale="es-CO" ${attrs}></nx-date-range>`;
  return document.querySelector("nx-date-range")!;
}
const field = (el: NxDateRange) => el.querySelector<HTMLButtonElement>(".nx-date-range__field")!;
const input = (el: NxDateRange) => el.querySelector<HTMLInputElement>(".nx-date-range__input")!;
const said = (el: NxDateRange) => el.querySelector(".nx-date-range__said")!.textContent;
const cell = (el: NxDateRange, iso: string) => el.querySelector<HTMLElement>(`[data-day="${Date.parse(`${iso}T00:00:00Z`) / 864e5}"]`)!;
const titles = (el: NxDateRange) => [...el.querySelectorAll(".nx-date-range__title")].map((t) => t.textContent);
const type = (el: NxDateRange, q: string) => {
  input(el).value = q;
  input(el).dispatchEvent(new Event("input"));
};
const key = (target: Element, k: string, o: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o }));
/** Los `nx-change` que emite (el `detail.value`). */
const changes = (el: NxDateRange) => {
  const out: (DateRangeValue | null)[] = [];
  el.addEventListener("nx-change", (e: Event) => out.push((e as CustomEvent<{ value: DateRangeValue | null }>).detail.value));
  return out;
};

describe("<nx-date-range> cerrado", () => {
  it("sin valor: un botón compacto con el placeholder que abre un diálogo", () => {
    const el = mount('label="Período"');
    const f = field(el);
    expect(f.tagName).toBe("BUTTON");
    expect(f.getAttribute("type")).toBe("button");
    expect(f.getAttribute("aria-haspopup")).toBe("dialog");
    expect(f.getAttribute("aria-expanded")).toBe("false");
    expect(f.textContent).toContain(DATE_RANGE_LABELS.placeholder);
    expect(f.getAttribute("aria-label")).toBe(`Período: ${DATE_RANGE_LABELS.placeholder}`);
    expect(el.value).toBeNull();
    expect(el.open).toBe(false);
  });

  it("start/end: el rango corto y los días", () => {
    const el = mount('start="2026-07-01" end="2026-09-30"');
    expect(el.value).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(field(el).querySelector(".nx-date-range__range")!.textContent).toMatch(/^1 jul – 30 sept? 2026$/);
    expect(field(el).querySelector(".nx-date-range__days")!.textContent).toBe(" · 92 días");
    expect(el.start).toBe("2026-07-01");
    expect(el.end).toBe("2026-09-30");
  });

  it("un día: «1 día» en singular", () => {
    const el = mount('start="2026-09-25"');
    expect(el.value).toEqual({ start: "2026-09-25", end: "2026-09-25" });
    expect(field(el).querySelector(".nx-date-range__days")!.textContent).toBe(" · 1 día");
  });

  it("phrase: el backend manda una frase y el valor lleva su etiqueta", () => {
    const el = mount('phrase="este trimestre"');
    expect(el.value).toEqual({ start: "2026-07-01", end: "2026-09-30", label: "este trimestre" });
  });

  it("compare: la comparación va en el valor y en una segunda línea", () => {
    const el = mount('phrase="Q3" compare="previous"');
    expect(el.value!.compare).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(field(el).querySelector(".nx-date-range__cmpline")!.textContent).toMatch(/^vs 1 abr – 30 jun 2026$/);
    el.compare = "year";
    expect(el.value!.compare).toEqual({ start: "2025-07-01", end: "2025-09-30" });
    el.compare = "none";
    expect(el.value!.compare).toBeUndefined();
    expect(field(el).querySelector(".nx-date-range__cmpline")).toBeNull();
  });

  it("value acepta objeto o intervalo ISO, se recorta a min/max, y no emite", () => {
    const el = mount('min="2026-01-01" max="2026-12-31"');
    const got = changes(el);
    el.value = "2025-12-01/2026-01-31";
    expect(el.value).toEqual({ start: "2026-01-01", end: "2026-01-31" });
    el.value = { start: "2026-03-01", end: "2026-03-31", label: "Marzo" };
    expect(el.value).toEqual({ start: "2026-03-01", end: "2026-03-31", label: "Marzo" });
    el.value = { start: "2027-01-01", end: "2027-02-01" };
    expect(el.value).toBeNull();
    el.value = null;
    expect(el.value).toBeNull();
    expect(got).toEqual([]);
  });

  it("propiedades puestas antes de registrar se respetan", async () => {
    document.body.innerHTML = "";
    const el = document.createElement("nx-date-range") as NxDateRange;
    Object.defineProperty(el, "value", { value: "2026-02-01/2026-02-28", writable: true, configurable: true, enumerable: true });
    el.setAttribute("today", "2026-09-25");
    document.body.append(el);
    expect(el.value).toEqual({ start: "2026-02-01", end: "2026-02-28" });
  });

  it("labels y presets por atributo (JSON)", () => {
    const el = mount(`labels='{"placeholder":"Pick a range"}' presets='["Hoy", {"label":"Cierre", "start":"2026-12-01", "end":"2026-12-31"}]'`);
    expect(field(el).textContent).toContain("Pick a range");
    expect(el.presets).toEqual([{ label: "Hoy" }, { label: "Cierre", start: "2026-12-01", end: "2026-12-31" }]);
  });

  it("BDUI: el backend manda una frase, sin fechas calculadas", () => {
    registerComponent("DateRange", "nx-date-range", ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "label", "placeholder", "labels"]);
    const [el] = render({ component: "DateRange", props: { phrase: "últimos 30 días", today: "2026-09-25", compare: "previous", label: "Período", fiscalStart: 4, innerHTML: "<img src=x onerror=alert(1)>" } }, document.body) as NxDateRange[];
    expect(el.value).toEqual({ start: "2026-08-27", end: "2026-09-25", compare: { start: "2026-07-28", end: "2026-08-26" }, label: "últimos 30 días" });
    expect(el.fiscalStart).toBe(4);
    expect(field(el).getAttribute("aria-label")).toMatch(/^Período: 27 ago – 25 sept? 2026/);
    expect(el.querySelector("img")).toBeNull();
  });

  it("value = undefined no toca nada (un framework que no lo pasa)", () => {
    const el = mount('phrase="Q3"');
    el.value = undefined;
    expect(el.value).toEqual({ start: "2026-07-01", end: "2026-09-30", label: "Q3" });
  });

  it("disabled no abre", () => {
    const el = mount("disabled");
    expect(field(el).disabled).toBe(true);
    el.show();
    expect(el.open).toBe(false);
  });
});

describe("<nx-date-range> abierto: escribir", () => {
  it("abre con clic, enfoca la caja y avisa con nx-open-change", () => {
    const el = mount();
    const opens: boolean[] = [];
    el.addEventListener("nx-open-change", (e: Event) => opens.push((e as CustomEvent<{ open: boolean }>).detail.open));
    field(el).click();
    expect(el.open).toBe(true);
    expect(field(el).getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(input(el));
    expect(input(el).getAttribute("aria-label")).toBe(DATE_RANGE_LABELS.ask);
    const pop = el.querySelector(".nx-date-range__pop")!;
    expect(pop.getAttribute("role")).toBe("dialog");
    expect(pop.getAttribute("popover")).toBe("auto");
    expect(said(el)).toBe(DATE_RANGE_LABELS.askHint);
    el.hide();
    expect(opens).toEqual([true, false]);
    expect(document.activeElement).toBe(field(el));
  });

  it("muestra en vivo cómo entendió la frase y Enter la aplica (con su etiqueta)", () => {
    const el = mount();
    const got = changes(el);
    el.show();
    type(el, "Q3 2025");
    expect(said(el)).toMatch(/1 jul – 30 sept? 2025 · 92 días/);
    expect(el.querySelector(".nx-date-range__pop")!.hasAttribute("data-ready")).toBe(true);
    // El calendario va a donde está lo escrito.
    expect(titles(el)).toEqual(["Agosto 2025", "Septiembre 2025"]);
    expect(cell(el, "2025-08-15").hasAttribute("data-in")).toBe(true);
    key(input(el), "Enter");
    expect(got).toEqual([{ start: "2025-07-01", end: "2025-09-30", label: "Q3 2025" }]);
    expect(el.open).toBe(false);
    expect(document.activeElement).toBe(field(el));
  });

  it("lo que no entiende lo dice, y Enter no hace nada", () => {
    const el = mount('start="2026-01-01" end="2026-01-31"');
    const got = changes(el);
    el.show();
    type(el, "cuando pueda");
    expect(said(el)).toBe("No entendí «cuando pueda». Prueba «Q3 2025» o «de marzo a junio».");
    expect(el.querySelector(".nx-date-range__said")!.getAttribute("data-state")).toBe("bad");
    key(input(el), "Enter");
    expect(got).toEqual([]);
    expect(el.open).toBe(true);
    expect(el.value).toEqual({ start: "2026-01-01", end: "2026-01-31" });
  });

  it("con min/max: recorta lo escrito (y lo dice) o avisa que queda por fuera", () => {
    const el = mount('min="2026-03-10" max="2026-09-25"');
    el.show();
    type(el, "marzo");
    expect(said(el)).toContain(DATE_RANGE_LABELS.clamped);
    expect(said(el)).toMatch(/10 – 31 mar 2026 · 22 días/);
    type(el, "2024");
    expect(said(el)).toBe(DATE_RANGE_LABELS.outOfRange);
  });

  it("show(texto) abre con la frase ya escrita; escribir sobre el campo cerrado también", () => {
    const el = mount();
    el.show("últimos 30 días");
    expect(input(el).value).toBe("últimos 30 días");
    expect(said(el)).toMatch(/27 ago – 25 sept? 2026 · 30 días/);
    el.hide();
    key(field(el), "q");
    expect(el.open).toBe(true);
    expect(input(el).value).toBe("q");
  });

  it("al reabrir, la frase aplicada está en la caja", () => {
    const el = mount('phrase="el mes pasado"');
    el.show();
    expect(input(el).value).toBe("el mes pasado");
    expect(said(el)).toMatch(/1 – 31 ago 2026 · 31 días/);
  });

  it("usa fiscal-start para «año fiscal» y agrega sus atajos", () => {
    const el = mount('fiscal-start="4"');
    el.show("año fiscal");
    expect(said(el)).toMatch(/1 abr 2026 – 31 mar 2027 · 365 días/);
    const labels = [...el.querySelectorAll(".nx-date-range__preset")].map((b) => b.textContent);
    expect(labels).toContain("Año fiscal");
    expect(labels).toContain("Año fiscal pasado");
  });
});

describe("<nx-date-range> abierto: atajos", () => {
  it("un clic aplica el atajo con su etiqueta; el activo queda marcado", () => {
    const el = mount();
    const got = changes(el);
    el.show();
    const b = [...el.querySelectorAll<HTMLButtonElement>(".nx-date-range__preset")];
    expect(b.map((x) => x.textContent)).toEqual(["Hoy", "Ayer", "Últimos 7 días", "Últimos 30 días", "Este mes", "El mes pasado", "Este trimestre", "Último trimestre", "Este año", "El año pasado"]);
    expect(el.querySelector(".nx-date-range__presets")!.getAttribute("aria-label")).toBe(DATE_RANGE_LABELS.presets);
    b[2].click();
    expect(got).toEqual([{ start: "2026-09-19", end: "2026-09-25", label: "Últimos 7 días" }]);
    expect(el.open).toBe(false);
    el.show();
    expect(el.querySelector('.nx-date-range__preset[aria-pressed="true"]')!.textContent).toBe("Últimos 7 días");
  });

  it("pasar sobre un atajo muestra su rango; los que quedan fuera de min/max se deshabilitan", () => {
    const el = mount('min="2026-09-01" presets=\'["Hoy", "El año pasado", {"label":"Temporada", "start":"2026-09-10", "end":"2026-09-20"}]\'');
    el.show();
    const [hoy, pasado, temp] = [...el.querySelectorAll<HTMLButtonElement>(".nx-date-range__preset")];
    expect(pasado.disabled).toBe(true);
    expect(hoy.disabled).toBe(false);
    temp.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(said(el)).toMatch(/10 – 20 sept? 2026 · 11 días/);
    expect(cell(el, "2026-09-15").hasAttribute("data-in")).toBe(true);
    el.querySelector(".nx-date-range__presets")!.dispatchEvent(new Event("pointerleave"));
    expect(cell(el, "2026-09-15").hasAttribute("data-in")).toBe(false);
  });
});

describe("<nx-date-range> abierto: calendario", () => {
  it("dos meses, un grid por mes con encabezados, hoy marcado y la semana desde week-start", () => {
    const el = mount();
    el.show();
    expect(titles(el)).toEqual(["Agosto 2026", "Septiembre 2026"]);
    const grids = el.querySelectorAll('[role="grid"]');
    expect(grids).toHaveLength(2);
    expect(grids[1].getAttribute("aria-labelledby")).toBe(el.querySelectorAll(".nx-date-range__title")[1].id);
    expect([...grids[0].querySelectorAll('[role="columnheader"]')].map((c) => c.textContent)).toEqual(["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]);
    const today = cell(el, "2026-09-25");
    expect(today.getAttribute("aria-current")).toBe("date");
    expect(today.getAttribute("aria-label")).toBe("viernes, 25 de septiembre de 2026, hoy");
    // Sin valor, el foco itinerante está en hoy.
    expect(today.tabIndex).toBe(0);
    expect(el.querySelectorAll('[data-day][tabindex="0"]')).toHaveLength(1);
  });

  it("clic en inicio y fin: vista previa al pasar, luego aplica y cierra", () => {
    const el = mount();
    const got = changes(el);
    el.show();
    cell(el, "2026-09-10").click();
    expect(el.open).toBe(true);
    expect(el.querySelector(".nx-date-range__pop")!.hasAttribute("data-picking")).toBe(true);
    expect(said(el)).toContain(DATE_RANGE_LABELS.pickEnd);
    cell(el, "2026-09-14").dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(cell(el, "2026-09-12").getAttribute("aria-selected")).toBe("true");
    expect(cell(el, "2026-09-14").hasAttribute("data-e")).toBe(true);
    expect(said(el)).toMatch(/10 – 14 sept? 2026 · 5 días/);
    // El fin puede ir antes que el inicio: se ordena.
    cell(el, "2026-08-28").click();
    expect(got).toEqual([{ start: "2026-08-28", end: "2026-09-10" }]);
    expect(el.open).toBe(false);
  });

  it("Escape suelta un inicio a medio elegir; otro Escape cierra y el foco vuelve al campo", () => {
    const el = mount();
    el.show();
    cell(el, "2026-09-10").click();
    key(cell(el, "2026-09-10"), "Escape");
    expect(el.open).toBe(true);
    expect(el.querySelector(".nx-date-range__pop")!.hasAttribute("data-picking")).toBe(false);
    key(input(el), "Escape");
    expect(el.open).toBe(false);
    expect(document.activeElement).toBe(field(el));
  });

  it("teclado: flechas, PageUp/PageDown, Home/End y Enter", () => {
    const el = mount('start="2026-09-15" end="2026-09-15"');
    const got = changes(el);
    el.show();
    const grid = el.querySelector(".nx-date-range__months")!;
    const focused = () => (document.activeElement as HTMLElement).getAttribute("aria-label");
    key(grid, "ArrowRight");
    expect(focused()).toBe("miércoles, 16 de septiembre de 2026");
    key(grid, "ArrowDown");
    expect(focused()).toBe("miércoles, 23 de septiembre de 2026");
    key(grid, "Home");
    expect(focused()).toBe("lunes, 21 de septiembre de 2026");
    key(grid, "End");
    expect(focused()).toBe("domingo, 27 de septiembre de 2026");
    key(grid, "ArrowUp");
    key(grid, "ArrowLeft");
    expect(focused()).toBe("sábado, 19 de septiembre de 2026");
    // PageDown: un mes después; la vista lo sigue.
    key(grid, "PageDown");
    expect(focused()).toBe("lunes, 19 de octubre de 2026");
    expect(titles(el)).toEqual(["Septiembre 2026", "Octubre 2026"]);
    // Shift+PageUp: un año antes.
    key(grid, "PageUp", { shiftKey: true });
    expect(focused()).toBe("domingo, 19 de octubre de 2025");
    expect(titles(el)).toEqual(["Octubre 2025", "Noviembre 2025"]);
    key(grid, "PageUp");
    expect(titles(el)).toEqual(["Septiembre 2025", "Octubre 2025"]);
    key(grid, "Enter");
    key(grid, "ArrowRight");
    key(grid, "ArrowRight");
    key(grid, " ");
    expect(got).toEqual([{ start: "2025-09-19", end: "2025-09-21" }]);
  });

  it("navegar meses con los botones; min/max deshabilitan días y botones", () => {
    const el = mount('min="2026-08-10" max="2026-10-20"');
    el.show();
    const [prev, next] = [...el.querySelectorAll<HTMLButtonElement>("[data-nav]")];
    expect(prev.getAttribute("aria-label")).toBe(DATE_RANGE_LABELS.prevMonth);
    expect(prev.disabled).toBe(true);
    expect(cell(el, "2026-08-09").getAttribute("aria-disabled")).toBe("true");
    expect(cell(el, "2026-08-10").hasAttribute("aria-disabled")).toBe(false);
    next.click();
    expect(titles(el)).toEqual(["Septiembre 2026", "Octubre 2026"]);
    expect(next.disabled).toBe(true);
    // Un día deshabilitado no se elige; el teclado no sale del rango permitido.
    cell(el, "2026-10-21").click();
    expect(el.querySelector(".nx-date-range__pop")!.hasAttribute("data-picking")).toBe(false);
    cell(el, "2026-10-20").focus();
    const grid = el.querySelector(".nx-date-range__months")!;
    key(grid, "PageDown");
    expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("martes, 20 de octubre de 2026");
  });

  it("pinta la comparación en el calendario y la cambia desde el pie", () => {
    const el = mount('start="2026-09-14" end="2026-09-20" compare="previous"');
    const got = changes(el);
    el.show();
    expect(cell(el, "2026-09-10").hasAttribute("data-c")).toBe(true);
    expect(cell(el, "2026-09-14").hasAttribute("data-c")).toBe(false);
    const foot = el.querySelector<HTMLElement>(".nx-date-range__foot")!;
    expect(foot.hidden).toBe(false);
    expect(el.querySelector(".nx-date-range__vs")!.textContent).toMatch(/7 – 13 sept? 2026/);
    const radios = [...foot.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.checked)).toEqual([false, true, false]);
    expect(foot.querySelector('[role="radiogroup"]')!.getAttribute("aria-labelledby")).toBe(foot.firstElementChild!.id);
    radios[2].checked = true;
    radios[2].dispatchEvent(new Event("change", { bubbles: true }));
    expect(el.compare).toBe("year");
    expect(got).toEqual([{ start: "2026-09-14", end: "2026-09-20", compare: { start: "2025-09-14", end: "2025-09-20" } }]);
  });

  it("sin compare no se ofrece comparar", () => {
    const el = mount();
    el.show();
    expect(el.querySelector<HTMLElement>(".nx-date-range__foot")!.hidden).toBe(true);
  });
});

describe("<nx-date-range> y el formulario", () => {
  it("formResetCallback vuelve al valor de los atributos", () => {
    const el = mount('phrase="Q3"');
    el.value = "2026-01-01/2026-01-02";
    el.formResetCallback();
    expect(el.value).toEqual({ start: "2026-07-01", end: "2026-09-30", label: "Q3" });
  });

  it("cambiar start/end o today recalcula el valor inicial mientras nadie elija", () => {
    const el = mount('phrase="este mes"');
    el.today = "2026-02-10";
    expect(el.value).toEqual({ start: "2026-02-01", end: "2026-02-28", label: "este mes" });
    el.start = "2026-05-01";
    el.end = "2026-05-02";
    expect(el.value).toEqual({ start: "2026-05-01", end: "2026-05-02" });
  });
});
