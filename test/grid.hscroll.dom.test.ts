// @vitest-environment happy-dom
// La barra horizontal de arriba de <nx-grid> (`top-scrollbar`): un espejo del scroller de la tabla.
// Viene encendida; `top-scrollbar="false"` la quita. Cuándo se ve lo decide el CSS (la barra del
// espejo aparece si su relleno, del ancho de las columnas, no cabe): eso lo prueba e2e/grid.spec.ts. Aquí, el DOM, el ancho del relleno y la
// sincronización. happy-dom no maqueta: los recorridos se fijan a mano.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/grid/index";
import { render } from "../src/bdui";
import type { GridColumn, NxGrid } from "../src/components/grid/index";

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido", width: 100 },
  { key: "prov", label: "Proveedor", width: 200 },
  { key: "monto", label: "Monto", type: "money", width: 150 },
];
const ROWS = [
  { id: "1", oc: "OC-1", prov: "Aceros", monto: 1 },
  { id: "2", oc: "OC-2", prov: "Empaques", monto: 2 },
];

afterEach(() => vi.unstubAllGlobals());

function mount(attrs = ""): NxGrid {
  document.body.innerHTML = `<nx-grid ${attrs}></nx-grid>`;
  const el = document.querySelector("nx-grid")!;
  el.columns = COLS;
  el.rows = ROWS;
  return el;
}
const scroll = (el: NxGrid) => el.querySelector<HTMLElement>(".nx-grid__scroll")!;
const bar = (el: NxGrid) => el.querySelector<HTMLElement>(".nx-grid__hscroll")!;
const frame = () => new Promise((r) => requestAnimationFrame(r));

/** Fija el recorrido (`scrollWidth - clientWidth`) de un scroller; devuelve el espía de las lecturas. */
function range(el: HTMLElement, scrollWidth: number, clientWidth: number) {
  const read = vi.fn();
  Object.defineProperty(el, "scrollWidth", { configurable: true, get: () => (read(), scrollWidth) });
  Object.defineProperty(el, "clientWidth", { configurable: true, get: () => (read(), clientWidth) });
  return read;
}
/** Un `scroll` como el del navegador: la posición ya cambió cuando llega el evento. */
function scrollTo(el: HTMLElement, x: number): void {
  el.scrollLeft = x;
  el.dispatchEvent(new Event("scroll"));
}

describe("nx-grid: barra horizontal de arriba", () => {
  it("viene encendida, fuera del árbol de accesibilidad y del teclado", () => {
    const el = mount();
    expect(el.topScrollbar).toBe(true);
    expect(el.hasAttribute("top-scrollbar")).toBe(false);
    expect(bar(el).getAttribute("aria-hidden")).toBe("true");
    expect(bar(el).getAttribute("tabindex")).toBe("-1");
    expect(bar(el).hasAttribute("hidden")).toBe(false);
    expect(scroll(el).getAttribute("role")).toBe("grid");
    // En la fila de la tabla, entre el panel «Filtros» y el scroller.
    expect([...el.querySelector(".nx-grid__main")!.children].map((c) => c.className)).toEqual(["nx-grid__facets", "nx-grid__hscroll", "nx-grid__scroll"]);
  });

  it("el relleno mide lo que las columnas, y lo sigue al cambiar anchos, columnas o casillas", () => {
    const el = mount();
    const w = () => bar(el).style.getPropertyValue("--_w");
    expect(w()).toBe("450px");
    expect(w()).toBe(scroll(el).style.getPropertyValue("--_w"));
    el.view = { widths: { prov: 400 } };
    expect(w()).toBe("650px");
    el.selectable = true;
    expect(w()).toBe("686px");
    el.removeColumn("monto");
    expect(w()).toBe("536px");
    expect(w()).toBe(scroll(el).style.getPropertyValue("--_w"));
  });

  it("sincroniza en proporción a los recorridos: los dos extremos coinciden", () => {
    const el = mount();
    const s = scroll(el);
    const b = bar(el);
    range(s, 900, 600); // la tabla: 300 px de recorrido (le quita ancho su barra vertical)
    range(b, 1200, 600); // la barra: 600
    scrollTo(s, 150);
    expect(b.scrollLeft).toBe(300);
    scrollTo(b, 600);
    expect(s.scrollLeft).toBe(300);
    scrollTo(b, 0);
    expect(s.scrollLeft).toBe(0);
  });

  it("en RTL (`scrollLeft` negativo) también", () => {
    const el = mount("dir='rtl'");
    range(scroll(el), 900, 600);
    range(bar(el), 1200, 600);
    scrollTo(scroll(el), -150);
    expect(bar(el).scrollLeft).toBe(-300);
    scrollTo(bar(el), -600);
    expect(scroll(el).scrollLeft).toBe(-300);
  });

  it("no devuelve el eco: un arrastre de la barra no retrocede", () => {
    const el = mount();
    const s = scroll(el);
    const b = bar(el);
    range(s, 900, 600);
    range(b, 1200, 600);
    scrollTo(b, 100);
    expect(s.scrollLeft).toBe(50);
    // La persona sigue arrastrando antes de que llegue el `scroll` de la tabla (que dice 50).
    b.scrollLeft = 150;
    const set = vi.spyOn(b, "scrollLeft", "set");
    s.dispatchEvent(new Event("scroll"));
    expect(set).not.toHaveBeenCalled();
    expect(b.scrollLeft).toBe(150);
    b.dispatchEvent(new Event("scroll"));
    expect(s.scrollLeft).toBe(75);
  });

  it("un desplazamiento vertical no lee medidas; apagada, no lee ni mueve nada", () => {
    const el = mount();
    const s = scroll(el);
    const read = range(s, 900, 600);
    range(bar(el), 1200, 600);
    scrollTo(s, 30);
    read.mockClear();
    s.scrollTop = 500;
    s.dispatchEvent(new Event("scroll"));
    expect(read).not.toHaveBeenCalled();

    const off = mount('top-scrollbar="false"');
    const offRead = range(scroll(off), 900, 600);
    range(bar(off), 1200, 600);
    scrollTo(scroll(off), 30);
    scrollTo(bar(off), 90);
    expect(offRead).not.toHaveBeenCalled();
    expect(scroll(off).scrollLeft).toBe(30);
  });

  it("si la tabla cabe (sin recorrido), no asigna nada", () => {
    const el = mount();
    range(scroll(el), 600, 600);
    range(bar(el), 600, 600);
    const set = vi.spyOn(bar(el), "scrollLeft", "set");
    scroll(el).dispatchEvent(new Event("scroll"));
    bar(el).dispatchEvent(new Event("scroll"));
    expect(set).not.toHaveBeenCalled();
    expect(scroll(el).scrollLeft).toBe(0);
  });

  it("vuelta a encender con la tabla ya desplazada, la barra toma su posición en el siguiente frame", async () => {
    const el = mount('top-scrollbar="false"');
    range(scroll(el), 900, 600);
    range(bar(el), 1200, 600);
    scrollTo(scroll(el), 120);
    expect(bar(el).scrollLeft).toBe(0);
    el.topScrollbar = true;
    await frame();
    expect(bar(el).scrollLeft).toBe(240);
  });

  it("prop y atributo: solo `\"false\"` la apaga (como `toolbar` de nx-print)", () => {
    const el = mount();
    el.topScrollbar = false;
    expect(el.getAttribute("top-scrollbar")).toBe("false");
    el.topScrollbar = true;
    expect(el.hasAttribute("top-scrollbar")).toBe(false);
    el.setAttribute("top-scrollbar", "");
    expect(el.topScrollbar).toBe(true);
    el.setAttribute("top-scrollbar", "false");
    expect(el.topScrollbar).toBe(false);
    el.topScrollbar = null;
    expect(el.topScrollbar).toBe(true);
  });

  it("BDUI la acepta como prop", () => {
    const [el] = render({ component: "Grid", props: { columns: COLS, rows: ROWS, topScrollbar: false } }, document.body);
    expect(el.getAttribute("top-scrollbar")).toBe("false");
  });
});
