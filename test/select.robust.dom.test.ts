// @vitest-environment happy-dom
//
// <nx-select> ante lo que salió de la revisión: moverlo con el panel abierto, un `source` de otro
// origen y el buscador marcado como consulta (no cuenta como cambio en un <nx-dialog>).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NxSelect } from "../src/index";
import "../src/index";

beforeAll(() => {
  // happy-dom no tiene Popover API: se simulan sus eventos. Quitar un popover del documento lo
  // oculta SIN eventos, como en el navegador.
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
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(attrs = ""): NxSelect {
  document.body.innerHTML = `<nx-select ${attrs}></nx-select>`;
  const el = document.querySelector("nx-select")!;
  el.options = [
    { value: "1", label: "Uno" },
    { value: "2", label: "Dos" },
  ];
  return el;
}
const field = (el: NxSelect) => el.querySelector<HTMLElement>(".nx-select__field")!;

describe("<nx-select> robusto", () => {
  it("movido en el DOM con el panel abierto, se puede volver a abrir", () => {
    const el = mount();
    field(el).click();
    expect(el.open).toBe(true);
    const box = document.createElement("div");
    document.body.append(box);
    box.append(el); // desconectar (el navegador oculta el popover sin eventos) y conectar
    expect(el.open).toBe(false);
    expect(field(el).getAttribute("aria-expanded")).toBe("false");
    field(el).click();
    expect(el.open).toBe(true);
  });

  it("un source de otro origen no se pide: se muestra el error", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('source="https://otro.example/buscar"');
    field(el).click();
    await sleep(20);
    expect(fetch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(el.querySelector(".nx-select__empty")!.textContent).toBe("No se pudo buscar");
  });

  it("un source relativo se pide contra la página", async () => {
    const fetch = vi.fn(async (_url: URL) => new Response("[]"));
    vi.stubGlobal("fetch", fetch);
    const el = mount('source="/buscar"');
    field(el).click();
    await sleep(20);
    expect(String(fetch.mock.calls[0][0])).toBe(`${location.origin}/buscar?q=`);
  });

  it("el buscador es una consulta (data-nx-ephemeral)", () => {
    const el = mount();
    expect(el.querySelector(".nx-select__input")!.hasAttribute("data-nx-ephemeral")).toBe(true);
  });
});
