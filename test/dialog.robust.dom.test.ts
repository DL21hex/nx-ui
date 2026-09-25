// @vitest-environment happy-dom
//
// <nx-dialog> ante lo que salió de la revisión: el historial (`url`) cuando la app navega o la URL
// es de otro origen, el aviso de apertura con View Transitions, y qué cuenta como «cambios sin
// guardar».
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NxDialog, NxSelect } from "../src/index";
import "../src/index";

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
  Element.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.querySelectorAll("nx-dialog").forEach((d) => (d as NxDialog).open && (d as NxDialog).close());
  document.body.innerHTML = "";
  delete (document as { startViewTransition?: unknown }).startViewTransition;
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(attrs = "", inner = "<input name='a'>"): NxDialog {
  document.body.innerHTML = `<button id="open">Abrir</button><nx-dialog heading="Pedido" ${attrs}>${inner}</nx-dialog>`;
  return document.querySelector<NxDialog>("nx-dialog")!;
}

describe("historial (`url`)", () => {
  it("cerrar quita su entrada con un salto atrás", async () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    const d = mount('url="/pedidos/1"');
    void d.show();
    expect(history.state?.nxDialog).toBe(d.pushedState);
    d.close();
    await sleep(10);
    expect(go).toHaveBeenCalledWith(-1);
  });

  it("si la app navegó (un enlace dentro del diálogo) y luego lo desmonta, no deshace esa navegación", async () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    const d = mount('url="/pedidos/1"');
    void d.show();
    // El router navega a otra ruta y desmonta el diálogo.
    history.pushState({ ruta: "/facturas" }, "", "/facturas");
    d.remove();
    await sleep(10);
    expect(go).not.toHaveBeenCalled();
  });

  it("cerrar con un enlace [data-nx-close] que además navega: tampoco retrocede", async () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    const d = mount('url="/pedidos/1"', "<a href='/facturas' data-nx-close>Ver facturas</a>");
    void d.show();
    d.querySelector<HTMLAnchorElement>("a")!.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({ ruta: "/facturas" }, "", "/facturas"); // el router, después del cierre
    });
    d.querySelector<HTMLAnchorElement>("a")!.click();
    expect(d.open).toBe(false);
    await sleep(10);
    expect(go).not.toHaveBeenCalled();
  });

  it("dos niveles cerrados seguidos: un solo salto de dos", async () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    document.body.innerHTML = `<nx-dialog id="a" url="/a" mode="panel"></nx-dialog><nx-dialog id="b" url="/b" mode="panel"></nx-dialog>`;
    const [a, b] = document.querySelectorAll<NxDialog>("nx-dialog");
    void a.show();
    void b.show();
    a.close();
    expect(b.open).toBe(false);
    await sleep(10);
    expect(go).toHaveBeenCalledOnce();
    expect(go).toHaveBeenCalledWith(-2);
  });

  it("una url de otro origen se ignora: abre igual, no toca el historial y cerrar no retrocede", async () => {
    const go = vi.spyOn(history, "go").mockImplementation(() => {});
    const push = vi.spyOn(history, "pushState");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = mount('url="https://otro.example/x"');
    expect(() => d.show()).not.toThrow();
    expect(d.open).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(d.pushedState).toBeNull();
    expect(warn).toHaveBeenCalled();
    d.close();
    await sleep(10);
    expect(go).not.toHaveBeenCalled();
  });
});

describe("nx-open-change con View Transitions", () => {
  it("se avisa cuando el diálogo ya está en la capa superior (los avisos suben encima)", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    (document as unknown as { startViewTransition: (cb: () => void) => object }).startViewTransition = (cb) => {
      const done = new Promise<void>((r) => setTimeout(() => (cb(), r())));
      return { finished: done, ready: done, updateCallbackDone: done };
    };
    const d = mount();
    const opener = document.getElementById("open")!;
    let shownAtEvent: boolean | undefined;
    d.addEventListener("nx-open-change", (e) => {
      if ((e as CustomEvent).detail.open) shownAtEvent = d.hasAttribute("open");
    });
    void d.show(opener);
    expect(shownAtEvent).toBeUndefined();
    await sleep(10);
    expect(shownAtEvent).toBe(true);
  });
});

describe("cambios sin guardar", () => {
  it("buscar en un <nx-select> no cuenta; elegir sí", async () => {
    const d = mount("", "<nx-select></nx-select>");
    const sel = d.querySelector<NxSelect>("nx-select")!;
    sel.options = [{ value: "1", label: "Uno" }];
    void d.show();
    const input = sel.querySelector<HTMLInputElement>(".nx-select__input")!;
    input.value = "un";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(d.dirty).toBe(false);
    sel.querySelector<HTMLElement>(".nx-select__field")!.click();
    sel.querySelector<HTMLElement>('[role="option"]')!.click();
    expect(sel.value).toBe("1");
    expect(d.dirty).toBe(true);
  });

  it("un campo del autor sigue contando", () => {
    const d = mount();
    void d.show();
    d.querySelector("input")!.dispatchEvent(new Event("input", { bubbles: true }));
    expect(d.dirty).toBe(true);
  });
});
