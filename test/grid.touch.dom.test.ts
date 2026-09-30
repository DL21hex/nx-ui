// @vitest-environment happy-dom
// <nx-grid> con el dedo y con el doble clic: lo que en un celular (o en una tableta) no puede fallar.
import { describe, expect, it } from "vitest";
import "../src/components/grid/index";
import type { GridColumn, GridRow, NxGrid } from "../src/components/grid/index";

const COLS: GridColumn[] = [
  { key: "oc", label: "Pedido" },
  { key: "monto", label: "Monto", type: "money", editable: true },
];
const ROWS: GridRow[] = [
  { id: "1", oc: "OC-1", monto: 8_000_000 },
  { id: "2", oc: "OC-2", monto: 1_000_000 },
  { id: "3", oc: "OC-3", monto: 500_000 },
];

function mount(): NxGrid {
  document.body.innerHTML = "<nx-grid></nx-grid>";
  const el = document.querySelector("nx-grid")!;
  el.columns = COLS;
  el.rows = ROWS;
  return el;
}

const cell = (el: NxGrid, r: number, c: number) => el.querySelector<HTMLElement>(`[data-r="${r}"] > [data-c="${c}"]`)!;
const active = (el: NxGrid) => {
  const a = el.querySelector<HTMLElement>(".nx-grid__cell.is-active");
  return a ? [Number(a.parentElement!.dataset.r), Number(a.dataset.c)] : null;
};
/** Un toque (o un clic) completo sobre una celda, como lo manda el navegador. */
function tap(target: HTMLElement, pointerType = "touch"): void {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType }));
  target.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, pointerType }));
  target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}
const opened = (el: NxGrid) => {
  const ids: string[] = [];
  el.addEventListener("nx-grid-open", (e) => ids.push(e.detail.id));
  return ids;
};

describe("<nx-grid> con el dedo", () => {
  it("el primer toque marca la celda; el segundo sobre la misma abre la fila (una sola vez)", () => {
    const el = mount();
    const ids = opened(el);
    tap(cell(el, 1, 0));
    expect(active(el)).toEqual([1, 0]);
    expect(ids).toEqual([]);
    tap(cell(el, 1, 0));
    // Android manda además `dblclick` tras dos toques: no abre otra vez.
    cell(el, 1, 0).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(ids).toEqual(["2"]);
  });

  it("el segundo toque sobre una celda editable la edita", () => {
    const el = mount();
    tap(cell(el, 0, 1));
    expect(el.querySelector(".nx-grid__input")).toBeNull();
    tap(cell(el, 0, 1));
    expect(el.querySelector<HTMLInputElement>(".nx-grid__input")?.value).toBe("8000000");
  });

  it("en una tabla recién abierta, el primer toque sobre la primera celda solo la marca", () => {
    const el = mount();
    const ids = opened(el);
    tap(cell(el, 0, 0));
    expect(ids).toEqual([]);
    tap(cell(el, 0, 0));
    expect(ids).toEqual(["1"]);
  });

  it("tocar otra celda no abre nada, y arrastrar el dedo no marca un rango", () => {
    const el = mount();
    const ids = opened(el);
    tap(cell(el, 1, 0));
    tap(cell(el, 2, 0));
    tap(cell(el, 0, 0));
    expect(ids).toEqual([]);
    // Desplazar con el dedo: el navegador cancela el puntero y pasa por encima de otras celdas.
    cell(el, 0, 0).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "touch" }));
    cell(el, 0, 0).dispatchEvent(new PointerEvent("pointercancel", { bubbles: true, pointerType: "touch" }));
    cell(el, 2, 1).dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    expect(active(el)).toEqual([0, 0]);
    expect(el.querySelectorAll(".nx-grid__cell.is-sel").length).toBe(0);
  });

  it("con el mouse, pointercancel también termina el arrastre", () => {
    const el = mount();
    cell(el, 0, 0).dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, pointerType: "mouse" }));
    document.dispatchEvent(new PointerEvent("pointercancel", { pointerType: "mouse" }));
    cell(el, 2, 1).dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(active(el)).toEqual([0, 0]);
  });

  it("con el mouse, un clic sobre la celda activa no la abre (eso es el doble clic)", () => {
    const el = mount();
    const ids = opened(el);
    tap(cell(el, 1, 0), "mouse");
    tap(cell(el, 1, 0), "mouse");
    expect(ids).toEqual([]);
    cell(el, 1, 0).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(ids).toEqual(["2"]);
  });
});

describe("<nx-grid> editando", () => {
  it("un doble clic dentro del campo (para marcar una palabra) no borra lo escrito", () => {
    const el = mount();
    tap(cell(el, 0, 1), "mouse");
    cell(el, 0, 1).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    const input = el.querySelector<HTMLInputElement>(".nx-grid__input")!;
    input.value = "9.500.000";
    input.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(el.querySelector(".nx-grid__input")).toBe(input);
    expect(input.value).toBe("9.500.000");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(el.rows[0].monto).toBe(9_500_000);
  });
});

describe("<nx-grid> menú de una celda", () => {
  const open = async (el: NxGrid, x: number, y: number) => {
    el.querySelector<HTMLElement>(".nx-grid__menu")?.style.removeProperty("--_top");
    cell(el, 0, 0).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
    const menu = () => el.querySelector<HTMLElement>(".nx-grid__menu");
    for (let i = 0; i < 200 && !menu()?.style.getPropertyValue("--_top"); i++) await new Promise((r) => setTimeout(r, 10));
    return { left: parseFloat(menu()!.style.getPropertyValue("--_left")), top: parseFloat(menu()!.style.getPropertyValue("--_top")) };
  };

  it("el punto de la pulsación queda dentro del menú, también cerca del borde de abajo y de la derecha", async () => {
    const el = mount();
    const a = await open(el, 100, 100);
    expect(a.left).toBeLessThanOrEqual(100);
    expect(a.top).toBeLessThanOrEqual(100);
    const b = await open(el, innerWidth - 10, innerHeight - 10);
    // Abre hacia arriba y hacia la izquierda: el punto sigue adentro (a menos del ancho y alto del menú).
    expect(b.top).toBeLessThanOrEqual(innerHeight - 10);
    expect(b.top).toBeGreaterThan(innerHeight - 10 - 120);
    expect(b.left).toBeLessThanOrEqual(innerWidth - 10);
    expect(b.left).toBeGreaterThan(innerWidth - 10 - 220);
  });
});
