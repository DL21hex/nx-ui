// @vitest-environment happy-dom
//
// happy-dom no calcula cajas ni implementa la Popover API (la usan los avisos): se simulan el tamaño y
// el rectángulo del área desplazable, y el popover con sus eventos. La columna de recursos mide 208 px
// (el valor por defecto cuando no hay diseño) y el encabezado 44 px, así que un punto de la línea de
// tiempo (x, y) está en clientX = 208 + x − scrollLeft, clientY = 44 + y − scrollTop.
process.env.TZ = "America/Bogota";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/planner/index";
import type { NxPlanner, PlannerBooking, PlannerChangeDetail, PlannerCreateDetail, PlannerResource } from "../src/components/planner/index";

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
beforeEach(async () => {
  // El clic que se traga tras soltar un arrastre se retira en el siguiente turno: que no llegue a otra prueba.
  await new Promise((r) => setTimeout(r, 0));
  // «Ahora» fuera de la semana de las pruebas (los temporizadores siguen siendo reales).
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 28, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

const RES: PlannerResource[] = [
  { id: "c1", name: "Camión TKR-512", detail: "Jorge Pérez", group: "Camiones" },
  { id: "c2", name: "Camión WNP-208", detail: "Luis Ortega", group: "Camiones" },
  { id: "m1", name: "Montacargas 01", group: "Montacargas", capacity: 2 },
];
const BK: PlannerBooking[] = [
  { id: "e1", resource: "c1", start: "2026-10-06T07:30", end: "2026-10-06T09:00", title: "Entrega Ferretería El Tornillo", detail: "Barranquilla" },
  { id: "e2", resource: "c1", start: "2026-10-06T08:30", end: "2026-10-06T10:00", title: "Entrega Metalmecánica Los Andes" },
  { id: "e3", resource: "c2", start: "2026-10-06T11:00", end: "2026-10-06T12:00", title: "Entrega Aceros Norte", status: "tentative" },
  { id: "b1", resource: "c2", start: "2026-10-07T07:00", end: "2026-10-07T18:00", title: "Mantenimiento", status: "block", readonly: true },
  { id: "m1a", resource: "m1", start: "2026-10-06T08:00", end: "2026-10-06T10:00", title: "Cargue 1" },
  { id: "m1b", resource: "m1", start: "2026-10-06T09:00", end: "2026-10-06T11:00", title: "Cargue 2" },
];

function mount(attrs = 'view="day" date="2026-10-06" hours="07:00-18:00"', res = RES, bk = BK): NxPlanner {
  document.body.innerHTML = `<button id="antes">antes</button><nx-planner ${attrs}></nx-planner>`;
  const el = document.querySelector("nx-planner")!;
  const s = scroller(el);
  s.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
  el.resources = res;
  el.bookings = bk.map((b) => ({ ...b }));
  return el;
}
const scroller = (el: NxPlanner) => el.querySelector<HTMLElement>(".nx-planner__scroll")!;
const bars = (el: NxPlanner) => [...el.querySelectorAll<HTMLElement>(".nx-planner__bk")];
const bk = (el: NxPlanner, id: string) => bars(el).find((e) => e.dataset.id === id)!;
const rowName = (e: HTMLElement) => e.closest(".nx-planner__row")!.querySelector("b")?.textContent;
const live = (el: NxPlanner) => el.querySelector('.nx-planner__sr[aria-live="polite"]')!.textContent;
const at = (el: NxPlanner, x: number, y: number) => ({ clientX: 208 + x - scroller(el).scrollLeft, clientY: 44 + y - scroller(el).scrollTop });
/** En la vista de día (zoom 1) una hora mide 64 px. */
const X = (h: number, m = 0) => (h + m / 60) * 64;
/** Filas: Camiones (0–30), c1 (30–112, dos carriles), c2 (112–156), Montacargas (156–186), m1 (186–268). */
const Y = { c1: 50, c2: 130, m1: 200 };
const ptr = (type: string, p: { clientX: number; clientY: number }, extra: PointerEventInit = {}) => new PointerEvent(type, { ...p, pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, bubbles: true, cancelable: true, ...extra });
function drag(el: NxPlanner, target: Element, from: [number, number], to: [number, number], drop = true): void {
  target.dispatchEvent(ptr("pointerdown", at(el, ...from)));
  window.dispatchEvent(ptr("pointermove", at(el, ...to)));
  if (drop) window.dispatchEvent(ptr("pointerup", at(el, ...to), { buttons: 0 }));
}
const key = (t: Element, k: string, init: KeyboardEventInit = {}) => t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
const changes = (el: NxPlanner) => {
  const log: PlannerChangeDetail[] = [];
  el.addEventListener("nx-planner-change", (e) => log.push(e.detail));
  return log;
};
const place = (el: NxPlanner, id: string) => {
  const b = el.bookings.find((x) => x.id === id)!;
  return `${b.resource} ${b.start.slice(11, 16)}–${b.end.slice(11, 16)}`;
};
const toastText = () => document.querySelector("nx-toaster")?.textContent ?? "";

describe("<nx-planner>: pintado", () => {
  it("recursos agrupados, reservas con su nombre completo, estados y el choque marcado", () => {
    const el = mount('view="week" date="2026-10-06" hours="07:00-18:00"');
    const s = scroller(el);
    expect(s.getAttribute("role")).toBe("grid");
    expect(s.getAttribute("aria-rowcount")).toBe("6");
    const rows = [...el.querySelectorAll<HTMLElement>(".nx-planner__row")];
    expect(rows.map((r) => r.textContent)).toEqual([expect.stringContaining("Camiones2"), expect.stringContaining("Camión TKR-512Jorge Pérez"), expect.stringContaining("Camión WNP-208"), expect.stringContaining("Montacargas1"), expect.stringContaining("Montacargas 01")]);
    expect(bk(el, "e1").getAttribute("aria-label")).toMatch(/^Camión TKR-512 · Entrega Ferretería El Tornillo · mar.*6.*oct.*7:30.*9:00.* · Choque: 2 a la vez, capacidad 1$/);
    expect(bk(el, "e1").getAttribute("aria-roledescription")).toBe("reserva");
    // Choque en el camión (capacidad 1), no en el montacargas (capacidad 2).
    expect(bars(el).filter((b) => b.hasAttribute("data-clash")).map((b) => b.dataset.id)).toEqual(["e1", "e2"]);
    expect(rows[1].hasAttribute("data-clash")).toBe(true);
    expect(rows[1].querySelector(".nx-planner__warn")!.textContent).toContain("Choque");
    expect(rows[0].hasAttribute("data-clash")).toBe(true); // el grupo lo avisa plegado o no
    expect(rows[4].hasAttribute("data-clash")).toBe(false);
    const clashBtn = el.querySelector<HTMLButtonElement>(".nx-planner__clashes")!;
    expect(clashBtn.hidden).toBe(false);
    expect(clashBtn.textContent).toBe("1 con choque");
    // Dos carriles en la fila del camión con choque; la barra del segundo, en el segundo carril.
    expect(rows[1].style.blockSize).toBe("82px");
    expect(bk(el, "e2").style.insetBlockStart).toBe("41px");
    expect(bk(el, "e3").dataset.status).toBe("tentative");
    expect(bk(el, "b1").dataset.status).toBe("block");
    expect(bk(el, "b1").querySelector(".nx-planner__grip")).toBeNull();
    expect(bk(el, "e3").querySelectorAll(".nx-planner__grip")).toHaveLength(2);
    expect(el.querySelector(".nx-planner__title")!.textContent).toBe("5 a 11 oct 2026");
    expect(el.querySelectorAll(".nx-planner__hc")).toHaveLength(7);
    // Sábado y domingo sombreados.
    expect(el.querySelectorAll(".nx-planner__off")).toHaveLength(2);
    expect(el.dataset.view).toBe("week");
  });

  it("festivos, días laborables y horario del día sombreados", () => {
    const el = mount(`view="week" date="2026-10-06" hours="07:00-18:00" holidays='["2026-10-07"]' workdays='[1,2,3,4,5,6]'`);
    // Miércoles festivo y domingo no laborable.
    expect([...el.querySelectorAll(".nx-planner__hc")].map((c) => c.hasAttribute("data-off"))).toEqual([false, false, true, false, false, false, true]);
    el.view = "day";
    // Día (martes) con horario de 7 a 18. Arranca en las 7:00 y pinta desde las 2:00 (el margen):
    // fuera del horario, 2–6 y 18–23.
    const cells = [...el.querySelectorAll<HTMLElement>(".nx-planner__hc")];
    expect(cells[0].style.insetInlineStart).toBe("128px");
    expect(cells.filter((c) => c.hasAttribute("data-off"))).toHaveLength(11);
    expect(cells.find((c) => c.style.insetInlineStart === "448px")!.textContent).toMatch(/^7/);
    expect(scroller(el).scrollLeft).toBe(440);
  });

  it("la fila de ocupación cuenta recursos por columna («3/3» lleno)", () => {
    const el = mount('view="week" date="2026-10-06" summary="camiones"');
    const sums = [...el.querySelectorAll<HTMLElement>(".nx-planner__sum")];
    expect(sums.map((x) => x.textContent)).toEqual(["0/3", "3/3", "1/3", "0/3", "0/3", "0/3", "0/3"]);
    expect(sums[1].hasAttribute("data-full")).toBe(true);
    expect(sums[1].title).toBe("3/3 camiones");
    expect(el.querySelector<HTMLElement>(".nx-planner__head")!.style.blockSize).toBe("66px");
  });

  it("virtualiza: con 300 recursos y 2.000 reservas solo existen las filas y columnas visibles", async () => {
    const res: PlannerResource[] = Array.from({ length: 300 }, (_, i) => ({ id: `r${i}`, name: `Camión ${i}`, group: i < 150 ? "Norte" : "Sur" }));
    const bks: PlannerBooking[] = Array.from({ length: 2000 }, (_, i) => {
      const d = 1 + (i % 31);
      const hh = 6 + (i % 10);
      return { id: `b${i}`, resource: `r${(i * 7) % 300}`, start: `2026-10-${String(d).padStart(2, "0")}T${String(hh).padStart(2, "0")}:00`, end: `2026-10-${String(d).padStart(2, "0")}T${String(hh + 2).padStart(2, "0")}:00`, title: `Entrega ${i}` };
    });
    const t0 = performance.now();
    const el = mount('view="month" date="2026-10-06"', res, bks);
    const s = scroller(el);
    expect(performance.now() - t0).toBeLessThan(1500);
    Object.defineProperty(s, "clientHeight", { value: 400, configurable: true });
    Object.defineProperty(s, "clientWidth", { value: 600, configurable: true });
    s.dispatchEvent(new Event("scroll"));
    await frame();
    expect(s.getAttribute("aria-rowcount")).toBe("303");
    const n = el.querySelectorAll(".nx-planner__row").length;
    expect(n).toBeGreaterThan(5);
    expect(n).toBeLessThan(30);
    // Columnas: 600 px de ancho a 44 px por día, más el margen: menos que los 31 días.
    expect(el.querySelectorAll(".nx-planner__hc").length).toBeLessThan(20);
    expect(bars(el).length).toBeLessThan(200);
    s.scrollTop = 6000;
    s.dispatchEvent(new Event("scroll"));
    await frame();
    const first = Number(el.querySelector<HTMLElement>(".nx-planner__row")!.dataset.i);
    expect(first).toBeGreaterThan(100);
    expect(el.querySelectorAll(".nx-planner__row").length).toBeLessThan(30);
    // Plegar un grupo recalcula alturas sin pintar lo oculto.
    s.scrollTop = 0;
    s.dispatchEvent(new Event("scroll"));
    await frame();
    el.querySelector<HTMLButtonElement>('[data-group="Norte"]')!.click();
    expect(el.querySelector('[data-group="Norte"]')!.getAttribute("aria-expanded")).toBe("false");
    expect([...el.querySelectorAll(".nx-planner__row b")][0].textContent).toBe("Camión 150");
  });
});

describe("<nx-planner>: arrastre", () => {
  it("mover en el tiempo y a otro recurso, ajustado a la rejilla, con la sombra en vivo", async () => {
    const el = mount();
    const log = changes(el);
    const e3 = bk(el, "e3");
    drag(el, e3, [X(11, 15), Y.c2], [X(12, 50), Y.c1], false);
    const ghost = el.querySelector<HTMLElement>(".nx-planner__ghost")!;
    expect(ghost).not.toBeNull();
    expect(el.dataset.dragging).toBe("move");
    // 11:15 → 12:50 = +1:35 → empieza 12:35, se ajusta a 12:30.
    expect(ghost.textContent).toMatch(/^Mar.*6.*oct.*12:30.*1:30/);
    expect(ghost.textContent).toContain("Camión TKR-512");
    expect(ghost.style.transform).toBe(`translate(${208 + X(12, 30)}px,${30 + 3}px)`);
    expect(ghost.hasAttribute("data-clash")).toBe(false);
    // Sobre las entregas de la mañana del mismo camión: chocaría.
    window.dispatchEvent(ptr("pointermove", at(el, X(8, 15), Y.c1)));
    expect(ghost.hasAttribute("data-clash")).toBe(true);
    expect(ghost.textContent).toContain("Choque");
    window.dispatchEvent(ptr("pointermove", at(el, X(12, 50), Y.c1)));
    window.dispatchEvent(ptr("pointerup", at(el, X(12, 50), Y.c1), { buttons: 0 }));
    expect(el.querySelector(".nx-planner__ghost")).toBeNull();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ from: { resource: "c2", start: "2026-10-06T11:00:00-05:00", end: "2026-10-06T12:00:00-05:00" }, to: { resource: "c1", start: "2026-10-06T12:30:00-05:00", end: "2026-10-06T13:30:00-05:00" }, via: "pointer" });
    expect(log[0].booking.resource).toBe("c2");
    // Optimista: ya está en su nuevo lugar.
    expect(place(el, "e3")).toBe("c1 12:30–13:30");
    expect(rowName(bk(el, "e3"))).toBe("Camión TKR-512");
    await sleep(30);
    expect(toastText()).toContain("Entrega Aceros Norte → Camión TKR-512");
  });

  it("cambiar la duración por los bordes y no menos de una franja", () => {
    const el = mount();
    const log = changes(el);
    drag(el, bk(el, "e3").querySelector('[data-edge="end"]')!, [X(12), Y.c2], [X(12, 40), Y.c2]);
    expect(log[0].to).toMatchObject({ start: "2026-10-06T11:00:00-05:00", end: "2026-10-06T12:45:00-05:00" });
    drag(el, bk(el, "e3").querySelector('[data-edge="start"]')!, [X(11), Y.c2], [X(14), Y.c2]);
    expect(log[1].to).toMatchObject({ start: "2026-10-06T12:30:00-05:00", end: "2026-10-06T12:45:00-05:00" });
  });

  it("crear arrastrando sobre un hueco (y la app puede quedarse con el rango)", () => {
    const el = mount();
    const created: PlannerCreateDetail[] = [];
    el.addEventListener("nx-planner-create", (e) => created.push(e.detail));
    const lane = () => el.querySelectorAll<HTMLElement>(".nx-planner__lane")[1];
    drag(el, lane(), [X(14, 5), Y.c2], [X(15, 40), Y.c2]);
    expect(created[0]).toMatchObject({ resource: "c2", start: "2026-10-06T14:00:00-05:00", end: "2026-10-06T15:45:00-05:00", via: "pointer", booking: { title: "Nueva reserva", status: "tentative" } });
    expect(el.bookings.some((b) => b.id === created[0].booking.id)).toBe(true);
    // Cancelado: la app abre su formulario; la reserva provisional se va sin aviso de error.
    el.addEventListener("nx-planner-create", (e) => e.preventDefault(), { once: true });
    drag(el, lane(), [X(16), Y.c2], [X(17), Y.c2]);
    expect(created[1].start).toBe("2026-10-06T16:00:00-05:00");
    expect(el.bookings.some((b) => b.id === created[1].booking.id)).toBe(false);
    expect(live(el)).not.toContain("volvió");
  });

  it("un clic no es un arrastre: selecciona; lo de solo lectura no se arrastra", () => {
    const el = mount('view="week" date="2026-10-06" hours="07:00-18:00"');
    const sel: string[] = [];
    el.addEventListener("nx-planner-select", (e) => sel.push(e.detail.booking.id));
    const log = changes(el);
    const b1 = bk(el, "b1");
    drag(el, b1, [300, Y.c2], [420, Y.c2]);
    expect(el.querySelector(".nx-planner__ghost")).toBeNull();
    b1.click();
    expect(sel).toEqual(["b1"]);
    expect(bk(el, "b1").hasAttribute("data-selected")).toBe(true);
    expect(log).toEqual([]);
  });

  it("Escape a mitad del arrastre lo cancela", () => {
    const el = mount();
    const log = changes(el);
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(13), Y.c2], false);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    window.dispatchEvent(ptr("pointerup", at(el, X(13), Y.c2), { buttons: 0 }));
    expect(log).toEqual([]);
    expect(el.querySelector(".nx-planner__ghost")).toBeNull();
    expect(el.hasAttribute("data-dragging")).toBe(false);
  });

  it("con el dedo hay que mantener pulsado; deslizar antes es desplazarse", async () => {
    const el = mount();
    const log = changes(el);
    const e3 = bk(el, "e3");
    e3.dispatchEvent(ptr("pointerdown", at(el, X(11, 15), Y.c2), { pointerType: "touch" }));
    window.dispatchEvent(ptr("pointermove", at(el, X(12), Y.c2), { pointerType: "touch" }));
    expect(el.querySelector(".nx-planner__ghost")).toBeNull();
    window.dispatchEvent(ptr("pointerup", at(el, X(12), Y.c2), { pointerType: "touch", buttons: 0 }));
    expect(log).toEqual([]);
    bk(el, "e3").dispatchEvent(ptr("pointerdown", at(el, X(11, 15), Y.c2), { pointerType: "touch" }));
    await sleep(340);
    expect(el.querySelector(".nx-planner__ghost")).not.toBeNull();
    window.dispatchEvent(ptr("pointermove", at(el, X(12, 15), Y.c2), { pointerType: "touch" }));
    window.dispatchEvent(ptr("pointerup", at(el, X(12, 15), Y.c2), { pointerType: "touch", buttons: 0 }));
    expect(log[0].to.start).toBe("2026-10-06T12:00:00-05:00");
  });
});

describe("<nx-planner>: optimista, reversión y deshacer", () => {
  it("la app cancela: vuelve a su lugar con el motivo en el aviso", async () => {
    const el = mount();
    el.addEventListener("nx-planner-change", (e) => {
      e.detail.message = "El TKR-512 no entra a zona franca";
      e.preventDefault();
    });
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(11, 15), Y.c1]);
    expect(place(el, "e3")).toBe("c2 11:00–12:00");
    expect(live(el)).toBe("El TKR-512 no entra a zona franca. Entrega Aceros Norte volvió a su lugar.");
    await sleep(30);
    expect(toastText()).toContain("volvió a su lugar");
  });

  it("deshacer con el método, con Ctrl+Z y con el botón del aviso", async () => {
    const el = mount();
    const log = changes(el);
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(13, 15), Y.c2]);
    expect(place(el, "e3")).toBe("c2 13:00–14:00");
    expect(await el.undo()).toBe(true);
    expect(place(el, "e3")).toBe("c2 11:00–12:00");
    expect(log[1]).toMatchObject({ via: "undo", from: { start: "2026-10-06T13:00:00-05:00" }, to: { start: "2026-10-06T11:00:00-05:00" } });
    expect(await el.undo()).toBe(false);

    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(14, 15), Y.c2]);
    key(scroller(el), "z", { ctrlKey: true });
    await sleep(0);
    expect(place(el, "e3")).toBe("c2 11:00–12:00");

    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(15, 15), Y.c2]);
    await sleep(40);
    const btn = [...document.querySelectorAll<HTMLButtonElement>("nx-toaster button")].filter((b) => b.textContent?.includes("Deshacer")).pop()!;
    btn.click();
    await sleep(20);
    expect(place(el, "e3")).toBe("c2 11:00–12:00");
  });

  it("borrar con Supr (cancelable) y deshacer lo devuelve", async () => {
    const el = mount();
    const del: string[] = [];
    el.addEventListener("nx-planner-delete", (e) => del.push(e.detail.booking.id));
    const e3 = bk(el, "e3");
    e3.focus();
    key(e3, "Delete");
    expect(del).toEqual(["e3"]);
    expect(el.bookings.some((b) => b.id === "e3")).toBe(false);
    expect(document.activeElement).toBe(scroller(el));
    await el.undo();
    expect(place(el, "e3")).toBe("c2 11:00–12:00");
    el.addEventListener("nx-planner-delete", (e) => e.preventDefault());
    bk(el, "e3").focus();
    key(bk(el, "e3"), "Delete");
    expect(el.bookings.some((b) => b.id === "e3")).toBe(true);
    expect(live(el)).toContain("Cambio no permitido");
  });
});

describe("<nx-planner>: endpoint", () => {
  it("PATCH/POST/DELETE a {endpoint}/{id} y lo que responde el servidor queda", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => new Response(init.method === "PATCH" ? JSON.stringify({ detail: "Confirmada por despacho" }) : "{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('view="day" date="2026-10-06" endpoint="/api/reservas/"');
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(13, 15), Y.c2]);
    expect(bk(el, "e3").getAttribute("aria-busy")).toBe("true");
    await sleep(10);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/reservas/e3");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ resource: "c2", start: "2026-10-06T13:00:00-05:00", end: "2026-10-06T14:00:00-05:00" });
    expect(el.bookings.find((b) => b.id === "e3")!.detail).toBe("Confirmada por despacho");
    expect(bk(el, "e3").hasAttribute("aria-busy")).toBe(false);

    const lane = el.querySelectorAll<HTMLElement>(".nx-planner__lane")[0];
    drag(el, lane, [X(15), Y.c1], [X(16), Y.c1]);
    await sleep(10);
    const [url2, init2] = fetchMock.mock.calls[1];
    expect(init2.method).toBe("POST");
    const body = JSON.parse(init2.body as string);
    expect(url2).toBe(`/api/reservas/${encodeURIComponent(body.id)}`);
    expect(body).toMatchObject({ resource: "c1", start: "2026-10-06T15:00:00-05:00", end: "2026-10-06T16:00:00-05:00", title: "Nueva reserva" });

    await el.undo();
    expect(fetchMock.mock.calls[2][1].method).toBe("DELETE");
    expect(fetchMock.mock.calls[2][0]).toBe(url2);
  });

  it("si el servidor falla, revierte y dice por qué", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ message: "El WNP-208 está en mantenimiento" }), { status: 409 })));
    const el = mount('view="day" date="2026-10-06" endpoint="/api/reservas"');
    drag(el, bk(el, "e1"), [X(8), Y.c1], [X(8), Y.c2]);
    expect(place(el, "e1")).toBe("c2 07:30–09:00");
    await sleep(10);
    expect(place(el, "e1")).toBe("c1 07:30–09:00");
    expect(live(el)).toBe("El WNP-208 está en mantenimiento. Entrega Ferretería El Tornillo volvió a su lugar.");
    expect(await el.undo()).toBe(false);
  });

  it("sin red: el motivo por defecto; un endpoint de otro origen no se usa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const el = mount('view="day" date="2026-10-06" endpoint="/api/reservas"');
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(12, 15), Y.c2]);
    await sleep(10);
    expect(place(el, "e3")).toBe("c2 11:00–12:00");
    expect(live(el)).toContain("No se pudo guardar");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    el.endpoint = "https://otro.example/api";
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(12, 15), Y.c2]);
    await sleep(10);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(place(el, "e3")).toBe("c2 12:00–13:00");
    expect(warn).toHaveBeenCalled();
  });
});

describe("<nx-planner>: teclado", () => {
  it("la rejilla: flechas por recurso y franja, anunciadas; Enter crea en la franja", () => {
    const el = mount();
    const s = scroller(el);
    const created: PlannerCreateDetail[] = [];
    el.addEventListener("nx-planner-create", (e) => created.push(e.detail));
    s.focus();
    const cur = el.querySelector<HTMLElement>(".nx-planner__cur")!;
    expect(s.getAttribute("aria-activedescendant")).toBe(cur.id);
    // Empieza a las 7:00 (el horario) en el primer recurso.
    expect(live(el)).toMatch(/^Camión TKR-512, mar.*7:00.*8:00.*: Entrega Ferretería El Tornillo$/);
    key(s, "ArrowDown");
    expect(live(el)).toMatch(/^Camión WNP-208, .*7:00.*: libre$/);
    key(s, "ArrowDown");
    key(s, "ArrowDown");
    expect(live(el)).toMatch(/^Montacargas 01/);
    key(s, "ArrowUp");
    key(s, "ArrowRight");
    key(s, "ArrowLeft");
    key(s, "ArrowLeft");
    expect(live(el)).toMatch(/^Camión WNP-208, .*6:00.*7:00/);
    key(s, "Enter");
    expect(created[0]).toMatchObject({ resource: "c2", start: "2026-10-06T06:00:00-05:00", end: "2026-10-06T07:00:00-05:00", via: "keyboard" });
    key(s, "Home");
    expect(live(el)).toMatch(/12:00.*1:00|0:00/);
  });

  it("Enter sobre una reserva la enfoca y la selecciona; las flechas la mueven y se registra al soltar", async () => {
    const el = mount();
    const s = scroller(el);
    const log = changes(el);
    const sel: string[] = [];
    el.addEventListener("nx-planner-select", (e) => sel.push(e.detail.booking.id));
    s.focus();
    key(s, "ArrowDown");
    for (let i = 0; i < 4; i++) key(s, "ArrowRight");
    key(s, "Enter");
    expect(sel).toEqual(["e3"]);
    expect(document.activeElement).toBe(bk(el, "e3"));
    key(bk(el, "e3"), "ArrowRight");
    key(bk(el, "e3"), "ArrowRight");
    // Se ve al instante, sin evento todavía.
    expect(place(el, "e3")).toBe("c2 11:30–12:30");
    expect(log).toEqual([]);
    expect(document.activeElement).toBe(bk(el, "e3"));
    expect(live(el)).toMatch(/^Camión WNP-208 · Mar.*11:30.*12:30/);
    key(bk(el, "e3"), "Enter");
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ via: "keyboard", from: { start: "2026-10-06T11:00:00-05:00" }, to: { resource: "c2", start: "2026-10-06T11:30:00-05:00", end: "2026-10-06T12:30:00-05:00" } });
    // Mayús+flecha: la duración; y el registro llega solo tras un momento quieto.
    key(bk(el, "e3"), "ArrowRight", { shiftKey: true });
    expect(place(el, "e3")).toBe("c2 11:30–12:45");
    await sleep(760);
    expect(log[1].to.end).toBe("2026-10-06T12:45:00-05:00");
    // Abajo: al recurso siguiente (saltando el encabezado del grupo).
    key(bk(el, "e3"), "ArrowDown");
    expect(place(el, "e3")).toBe("m1 11:30–12:45");
    // Escape antes de registrarse: vuelve.
    key(bk(el, "e3"), "Escape");
    expect(place(el, "e3")).toBe("c2 11:30–12:45");
    expect(log).toHaveLength(2);
    // Escape otra vez: a la rejilla, con el cursor en la reserva.
    key(bk(el, "e3"), "Escape");
    expect(document.activeElement).toBe(s);
    expect(live(el)).toMatch(/^Camión WNP-208, .*11:00.*Entrega Aceros Norte/);
  });

  it("en la semana con horario, al llegar al borde del día salta al siguiente", () => {
    const el = mount('view="week" date="2026-10-06" hours="07:00-18:00"');
    const e3 = () => bk(el, "e3");
    e3().focus();
    // Rejilla de 30 min: de 11:00 a 18:00 son 14 pasos; el siguiente pasa al miércoles a las 7:00.
    for (let i = 0; i < 14; i++) key(e3(), "ArrowRight");
    expect(el.bookings.find((b) => b.id === "e3")!.start).toBe("2026-10-06T18:00:00-05:00");
    key(e3(), "ArrowRight");
    expect(el.bookings.find((b) => b.id === "e3")).toMatchObject({ start: "2026-10-07T07:00:00-05:00", end: "2026-10-07T08:00:00-05:00" });
    key(e3(), "ArrowLeft");
    expect(el.bookings.find((b) => b.id === "e3")).toMatchObject({ start: "2026-10-06T17:00:00-05:00", end: "2026-10-06T18:00:00-05:00" });
    key(e3(), "Escape");
    expect(place(el, "e3")).toBe("c2 11:00–12:00");
  });

  it("salir de la reserva registra lo pendiente", () => {
    const el = mount();
    const log = changes(el);
    const e3 = bk(el, "e3");
    e3.focus();
    key(e3, "ArrowLeft");
    document.getElementById("antes")!.focus();
    expect(log[0].to.start).toBe("2026-10-06T10:45:00-05:00");
  });
});

describe("<nx-planner>: período, source y API", () => {
  it("navegar: hoy, ← →, vista, fecha; cada cambio avisa su rango", () => {
    const el = mount('view="week" date="2026-10-06"');
    const ranges: string[] = [];
    el.addEventListener("nx-planner-range", (e) => ranges.push(`${e.detail.view} ${e.detail.from.slice(0, 10)} ${e.detail.to.slice(0, 10)}`));
    el.querySelector<HTMLButtonElement>('[data-act="next"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-act="prev"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-view="month"]')!.click();
    expect(el.snap).toBe(1440);
    el.querySelector<HTMLButtonElement>('[data-act="today"]')!.click();
    el.goTo("2026-12-24");
    const pick = el.querySelector<HTMLInputElement>(".nx-planner__pick")!;
    expect(pick.value).toBe("2026-12-24");
    pick.value = "2027-01-15";
    pick.dispatchEvent(new Event("change"));
    expect(ranges).toEqual(["week 2026-10-12 2026-10-19", "week 2026-10-05 2026-10-12", "month 2026-10-01 2026-11-01", "month 2026-09-01 2026-10-01", "month 2026-12-01 2027-01-01", "month 2027-01-01 2027-02-01"]);
    expect(el.date).toBe("2027-01-15");
    expect(el.querySelector('[data-view="month"]')!.getAttribute("aria-pressed")).toBe("true");
  });

  it("hoy muestra la línea de «ahora»", () => {
    vi.setSystemTime(new Date(2026, 9, 6, 9, 30));
    const el = mount('view="week"');
    const now = el.querySelector<HTMLElement>(".nx-planner__now")!;
    expect(now.hidden).toBe(false);
    expect(parseFloat(now.style.insetInlineStart)).toBeGreaterThan(150);
    expect(el.querySelector(".nx-planner__hc[data-today]")!.textContent).toMatch(/6/);
  });

  it("zoom con botones y con Ctrl+rueda", () => {
    const el = mount();
    const w = () => el.querySelector<HTMLElement>(".nx-planner__hc")!.style.inlineSize;
    expect(w()).toBe("64px");
    el.querySelector<HTMLButtonElement>('[data-act="in"]')!.click();
    expect(w()).toBe("48px"); // 1,5×: franjas de 30 min
    el.querySelector<HTMLButtonElement>('[data-act="in"]')!.click();
    expect(w()).toBe("32px"); // 2×: franjas de 15 min
    // El WheelEvent de happy-dom no trae ctrlKey ni clientX.
    scroller(el).dispatchEvent(Object.assign(new WheelEvent("wheel", { deltaY: 100, cancelable: true, bubbles: true }), { ctrlKey: true, clientX: 500 }));
    expect(w()).toBe("48px");
    el.querySelector<HTMLButtonElement>('[data-act="out"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-act="out"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-act="out"]')!.click();
    expect(el.querySelector<HTMLButtonElement>('[data-act="out"]')!.disabled).toBe(true);
  });

  it("scrollToBooking cambia de período, despliega el grupo y la selecciona", () => {
    const el = mount('view="week" date="2026-09-20"');
    el.querySelector<HTMLButtonElement>('[data-group="Camiones"]')!.click();
    expect(el.scrollToBooking("e3")).toBe(true);
    expect(el.date).toBe("2026-10-06");
    expect(bk(el, "e3").hasAttribute("data-selected")).toBe(true);
    expect(el.scrollToBooking("nada")).toBe(false);
    // El botón de choques lleva al primero del período.
    el.goTo("2026-10-05");
    el.querySelector<HTMLButtonElement>(".nx-planner__clashes")!.click();
    expect(el.querySelector("[data-selected]")!.getAttribute("data-id")).toBe("e1");
  });

  it("source: GET del período con from/to, aborta el anterior y reemplaza los datos", async () => {
    const calls: { url: string; signal: AbortSignal }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init: RequestInit) => {
        calls.push({ url, signal: init.signal! });
        return new Promise<Response>((resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          if (calls.length > 1) resolve(new Response(JSON.stringify({ resources: [{ id: "x", name: "Camión SXT-101" }], bookings: [{ id: "n1", resource: "x", start: "2026-10-13T08:00", end: "2026-10-13T09:00", title: "Entrega Hierros del Sinú" }] })));
        });
      }),
    );
    const el = mount('view="week" date="2026-10-06" source="/api/agenda"');
    expect(calls).toHaveLength(0);
    await sleep(240);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/agenda?from=2026-10-05T00%3A00%3A00-05%3A00&to=2026-10-12T00%3A00%3A00-05%3A00");
    expect(el.getAttribute("aria-busy")).toBe("true");
    el.querySelector<HTMLButtonElement>('[data-act="next"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-act="next"]')!.click();
    el.querySelector<HTMLButtonElement>('[data-act="prev"]')!.click();
    await sleep(240);
    expect(calls).toHaveLength(2);
    expect(calls[0].signal.aborted).toBe(true);
    expect(calls[1].url).toContain("from=2026-10-12");
    await sleep(10);
    expect(el.hasAttribute("aria-busy")).toBe(false);
    expect(el.resources.map((r) => r.id)).toEqual(["x"]);
    expect(bars(el).map((b) => b.dataset.id)).toEqual(["n1"]);
  });

  it("solo lectura: sin bordes, sin arrastre, sin crear ni borrar; seleccionar sí", () => {
    const el = mount('view="day" date="2026-10-06" readonly');
    const log: string[] = [];
    for (const t of ["change", "create", "delete", "select"]) el.addEventListener(`nx-planner-${t}`, () => log.push(t));
    expect(el.querySelector(".nx-planner__grip")).toBeNull();
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(13), Y.c2]);
    expect(el.querySelector(".nx-planner__ghost")).toBeNull();
    const s = scroller(el);
    s.focus();
    key(s, "ArrowDown");
    key(s, "ArrowDown");
    key(s, "Enter");
    bk(el, "e3").focus();
    key(bk(el, "e3"), "Delete");
    key(bk(el, "e3"), "ArrowRight");
    key(bk(el, "e3"), "Enter");
    expect(log).toEqual(["select"]);
    expect(s.getAttribute("aria-readonly")).toBe("true");
  });

  it("labels y locale", () => {
    const el = mount(`view="week" date="2026-10-06" locale="en-US" labels='{"today":"Today","resources":"Trucks","clash":"Conflict","clashes":"{n} conflicts","nope":5}'`);
    expect(el.querySelector('[data-act="today"]')!.textContent).toBe("Today");
    expect(el.querySelector(".nx-planner__corner")!.textContent).toBe("Trucks");
    expect(el.querySelector(".nx-planner__clashes")!.textContent).toBe("1 conflicts");
    expect(el.querySelector(".nx-planner__title")!.textContent).toMatch(/^Oct 5.*11, 2026$/);
    expect(bk(el, "e1").getAttribute("aria-label")).toMatch(/Tue, Oct 6.*7:30.*9:00\sAM · Conflict: 2/);
    expect(el.labels.week).toBe("Semana");
  });

  it("atributos JSON inválidos no rompen; props antes de registrar se respetan", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('view="week" date="2026-10-06"');
    el.setAttribute("resources", "{no es json");
    expect(warn).toHaveBeenCalled();
    expect(el.resources).toHaveLength(3);
    el.setAttribute("bookings", JSON.stringify([{ id: "z", resource: "c1", start: "2026-10-06T10:00", end: "2026-10-06T11:00", title: "Por atributo" }]));
    expect(bars(el).map((b) => b.dataset.id)).toEqual(["z"]);

    document.body.innerHTML = "";
    const pre = document.createElement("nx-planner") as NxPlanner;
    for (const [k, v] of Object.entries({ resources: RES, bookings: BK, readonly: true })) Object.defineProperty(pre, k, { value: v, writable: true, configurable: true, enumerable: true });
    pre.setAttribute("date", "2026-10-06");
    document.body.append(pre);
    expect(pre.bookings).toHaveLength(6);
    expect(pre.readonly).toBe(true);
    expect(bars(pre).length).toBe(6);
  });

  it("desconectar limpia arrastre, temporizadores, peticiones y avisos", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => ((signal = init.signal!), new Promise<Response>(() => {}))));
    const clear = vi.spyOn(window, "clearInterval");
    const el = mount('view="day" date="2026-10-06" source="/api/agenda"');
    await sleep(240);
    const log = changes(el);
    drag(el, bk(el, "e3"), [X(11, 15), Y.c2], [X(13), Y.c2], false);
    el.remove();
    expect(signal!.aborted).toBe(true);
    expect(clear).toHaveBeenCalled();
    expect(el.querySelector(".nx-planner__ghost")).toBeNull();
    window.dispatchEvent(ptr("pointerup", at(el, X(13), Y.c2), { buttons: 0 }));
    expect(log).toEqual([]);
    // Al volver, sigue funcionando.
    document.body.append(el);
    expect(bars(el).length).toBeGreaterThan(0);
  });
});
