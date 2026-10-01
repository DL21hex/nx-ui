// @vitest-environment happy-dom
// Cabecera de ficha de <nx-dialog>: avatar, estado, pasar de registro y el menú «Más».
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/dialog/index";
import type { NxDialog } from "../src/components/dialog/index";

afterEach(() => {
  for (const d of document.querySelectorAll<NxDialog>("nx-dialog")) d.close();
  document.body.innerHTML = "";
});

function mount(attrs = ""): NxDialog {
  document.body.innerHTML = `<nx-dialog mode="panel" heading="Laura Gómez Restrepo" ${attrs}><p>Contenido</p><input id="campo"></nx-dialog>`;
  return document.querySelector("nx-dialog")!;
}
const $ = <T extends Element = HTMLElement>(d: Element, s: string) => d.querySelector<T>(s)!;
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
/** La cabecera de ficha es un chunk aparte (`import()`): se espera a que llegue. */
const ready = (d: NxDialog) => vi.waitFor(() => expect(d.querySelector(".nx-dialog__avatar")).not.toBeNull());

describe("<nx-dialog> como ficha", () => {
  it("sin los atributos nuevos, la cabecera queda como antes (y no trae el chunk)", async () => {
    const d = mount();
    await new Promise((r) => setTimeout(r, 20));
    expect(d.querySelector(".nx-dialog__avatar")).toBeNull();
    expect(d.querySelector("nx-badge")).toBeNull();
    expect(d.querySelector('[data-tool="prev"]')).toBeNull();
    expect($(d, ".nx-dialog__x").getAttribute("aria-label")).toBe("Cerrar");
  });

  it("avatar: iniciales de un nombre, o una imagen segura", async () => {
    const d = mount('avatar="Laura Gómez"');
    await ready(d);
    expect($(d, ".nx-dialog__avatar").textContent).toBe("LG");
    d.avatar = "https://cdn.acme.co/fotos/482.jpg";
    await vi.waitFor(() => expect(d.querySelector(".nx-dialog__avatar img")).not.toBeNull());
    expect($(d, ".nx-dialog__avatar img").getAttribute("src")).toBe("https://cdn.acme.co/fotos/482.jpg");
    d.avatar = "http://inseguro.co/x.jpg";
    await vi.waitFor(() => expect($(d, ".nx-dialog__avatar").hidden).toBe(true));
  });

  it("badge pinta el estado al lado del título, con su tono", async () => {
    const d = mount('badge="Activa" badge-tone="success"');
    await ready(d);
    const b = $(d, ".nx-dialog__trow nx-badge");
    expect(b.textContent).toBe("Activa");
    expect(b.getAttribute("tone")).toBe("success");
    expect(b.hidden).toBe(false);
  });

  it("nav: anterior y siguiente avisan con nx-dialog-nav; lo que no está, deshabilitado", async () => {
    const d = mount('nav="next"');
    void d.show();
    await ready(d);
    const prev = $<HTMLButtonElement>(d, '[data-tool="prev"]');
    const next = $<HTMLButtonElement>(d, '[data-tool="next"]');
    expect(prev.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    expect(next.getAttribute("aria-label")).toBe("Registro siguiente");
    const spy = vi.fn();
    d.addEventListener("nx-dialog-nav", (e) => spy((e as CustomEvent).detail));
    next.click();
    expect(spy).toHaveBeenCalledWith({ dir: "next" });
  });

  it("J y K pasan de registro, salvo mientras se escribe", async () => {
    const d = mount('nav="prev next"');
    void d.show();
    await ready(d);
    const spy = vi.fn();
    d.addEventListener("nx-dialog-nav", (e) => spy((e as CustomEvent).detail.dir));
    d.focus();
    key(d, "j");
    key(d, "k");
    key($(d, "#campo"), "j");
    expect(spy.mock.calls.flat()).toEqual(["next", "prev"]);
  });

  it("actions: el menú «Más» con las destructivas al final, teclado y nx-dialog-action", async () => {
    const d = mount();
    void d.show();
    d.actions = [
      { id: "retirar", label: "Retirar empleada", danger: true },
      { id: "copiar", label: "Copiar código" },
      { id: "pagina", label: "Abrir en página completa" },
    ];
    await vi.waitFor(() => expect(d.querySelector<HTMLElement>('[data-tool="more"]')?.hidden).toBe(false));
    const more = $<HTMLButtonElement>(d, '[data-tool="more"]');
    more.click();
    const menu = $(d, '[role="menu"]');
    expect(menu.hidden).toBe(false);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(items.map((i) => i.textContent)).toEqual(["Copiar código", "Abrir en página completa", "Retirar empleada"]);
    expect(menu.querySelector('[role="separator"]')).not.toBeNull();
    expect(document.activeElement).toBe(items[0]);
    key(items[0], "ArrowUp");
    expect(document.activeElement).toBe(items[2]);
    const spy = vi.fn();
    d.addEventListener("nx-dialog-action", (e) => spy((e as CustomEvent).detail));
    items[2].click();
    expect(spy).toHaveBeenCalledWith({ id: "retirar" });
    expect(menu.hidden).toBe(true);
    expect(document.activeElement).toBe(more);
  });

  it("Escape cierra primero el menú, no el panel", async () => {
    const d = mount('actions=\'[{"id":"a","label":"Una"}]\'');
    void d.show();
    await ready(d);
    $<HTMLButtonElement>(d, '[data-tool="more"]').click();
    key(document.activeElement!, "Escape");
    expect($(d, '[role="menu"]').hidden).toBe(true);
    expect(d.open).toBe(true);
    key(document.activeElement!, "Escape");
    expect(d.open).toBe(false);
  });
});
