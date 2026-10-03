// @vitest-environment happy-dom
//
// `showViewAsBanner()`: la franja de «Ver como» pinta nombre y rol como texto, empuja el contenido,
// marca el título y se quita sin dejar rastro (una sola a la vez; quitarla dos veces no hace nada).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { showViewAsBanner } from "../src/components/account/view-as";

const bar = () => document.querySelector<HTMLElement>(".nx-viewas");
const root = document.documentElement;
const laura = { id: "u7", name: "Laura Gómez", role: "Auxiliar contable" };
let remove: (() => void) | null = null;

beforeEach(() => {
  document.title = "Inventario";
});
afterEach(() => {
  remove?.();
  remove = null;
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("showViewAsBanner()", () => {
  it("pinta «Estás viendo como {name} ({role})» con el nombre en negrita, como región", () => {
    remove = showViewAsBanner(laura, { onExit: () => {} });
    const el = bar()!;
    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("popover")).toBe("manual");
    const text = el.querySelector(".nx-viewas__text")!;
    expect(el.getAttribute("aria-labelledby")).toBe(text.id);
    expect(text.textContent).toBe("Estás viendo como Laura Gómez (Auxiliar contable)");
    expect(text.querySelector("strong")!.textContent).toBe("Laura Gómez");
    expect(el.querySelector("button")!.textContent).toBe("Salir de ver como");
  });

  it("sin rol, sin paréntesis vacíos", () => {
    remove = showViewAsBanner({ id: "u8", name: "Pedro" }, { onExit: () => {} });
    expect(bar()!.querySelector(".nx-viewas__text")!.textContent).toBe("Estás viendo como Pedro");
  });

  it("«$&» o «$'» en el rol son texto, no patrones de reemplazo", () => {
    remove = showViewAsBanner({ id: "u1", name: "Ana", role: "Caja $& Bodega $'" }, { onExit: () => {} });
    expect(bar()!.querySelector(".nx-viewas__text")!.textContent).toBe("Estás viendo como Ana (Caja $& Bodega $')");
  });

  it("un nombre con HTML sale como texto", () => {
    remove = showViewAsBanner({ id: "x", name: '<img src=x onerror="alert(1)">', role: "<b>Admin</b>" }, { onExit: () => {} });
    expect(bar()!.querySelector("img, b")).toBeNull();
    expect(bar()!.querySelector("strong")!.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(bar()!.textContent).toContain("(<b>Admin</b>)");
  });

  it("se anuncia una vez por una región role=status", () => {
    vi.useFakeTimers();
    remove = showViewAsBanner(laura, { onExit: () => {} });
    const status = bar()!.querySelector('[role="status"]')!;
    expect(status.textContent).toBe("");
    vi.advanceTimersByTime(100);
    expect(status.textContent).toBe("Estás viendo como Laura Gómez (Auxiliar contable)");
  });

  it("«Salir de ver como» llama onExit", () => {
    const onExit = vi.fn();
    remove = showViewAsBanner(laura, { onExit });
    bar()!.querySelector("button")!.click();
    expect(onExit).toHaveBeenCalledOnce();
  });

  it("empuja el contenido y marca el título; al quitarla restaura todo", () => {
    remove = showViewAsBanner(laura, { onExit: () => {} });
    expect(root.style.getPropertyValue("--nx-view-as-offset")).toBe("36px");
    expect(root.getAttribute("data-nx-view-as")).toBe("u7");
    expect(document.title).toBe("[Ver como] Inventario");
    remove();
    expect(bar()).toBeNull();
    expect(root.style.getPropertyValue("--nx-view-as-offset")).toBe("");
    expect(root.hasAttribute("data-nx-view-as")).toBe(false);
    expect(document.title).toBe("Inventario");
  });

  it("si la app cambia el título mientras tanto, vuelve el prefijo (y se quita al final)", async () => {
    remove = showViewAsBanner(laura, { onExit: () => {} });
    document.title = "Pedidos";
    await new Promise((r) => setTimeout(r, 0));
    expect(document.title).toBe("[Ver como] Pedidos");
    remove();
    expect(document.title).toBe("Pedidos");
  });

  it("una sola franja: llamar de nuevo reemplaza, y la función vieja ya no hace nada", () => {
    const first = showViewAsBanner(laura, { onExit: () => {} });
    remove = showViewAsBanner({ id: "u9", name: "Marta", role: "Cajera" }, { onExit: () => {} });
    expect(document.querySelectorAll(".nx-viewas")).toHaveLength(1);
    expect(bar()!.textContent).toContain("Marta");
    expect(document.title).toBe("[Ver como] Inventario");
    first();
    expect(bar()).not.toBeNull();
    expect(root.getAttribute("data-nx-view-as")).toBe("u9");
  });

  it("quitar es idempotente", () => {
    const r = showViewAsBanner(laura, { onExit: () => {} });
    r();
    document.title = "Otra";
    root.setAttribute("data-nx-view-as", "de la app");
    r();
    expect(document.title).toBe("Otra");
    expect(root.getAttribute("data-nx-view-as")).toBe("de la app");
    root.removeAttribute("data-nx-view-as");
  });

  it("textos propios (banner, salir y prefijo del título)", () => {
    remove = showViewAsBanner(laura, { labels: { banner: "Viewing as {name} · {role}", exit: "Exit", title: "[As] " }, onExit: () => {} });
    expect(bar()!.querySelector(".nx-viewas__text")!.textContent).toBe("Viewing as Laura Gómez · Auxiliar contable");
    expect(bar()!.querySelector("button")!.textContent).toBe("Exit");
    expect(document.title).toBe("[As] Inventario");
  });

  it("vuelve a subir cuando se abre un diálogo después", () => {
    const show = vi.fn();
    const hide = vi.fn();
    HTMLElement.prototype.showPopover = show;
    HTMLElement.prototype.hidePopover = hide;
    try {
      remove = showViewAsBanner(laura, { onExit: () => {} });
      expect(show).toHaveBeenCalledTimes(1);
      document.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open: true } }));
      expect(show).toHaveBeenCalledTimes(2);
      expect(hide).toHaveBeenCalledTimes(1);
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover;
      delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover;
    }
  });
});
