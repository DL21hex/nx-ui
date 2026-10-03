// @vitest-environment happy-dom
// La convención de eventos (nx-<componente>-<acción>) y el `change` nativo de los controles de
// formulario: el código genérico (marcar «sin guardar» en un diálogo o en nx-review) no tiene que
// conocer el evento propio de cada uno.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import "../src/index";
import type { NxDateRange, NxDialog, NxNumber, NxSignature } from "../src/index";

// happy-dom no implementa la Popover API: se simula como en date-range.dom.test.ts.
beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover ??= function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover ??= function (this: HTMLElement) {
    fire(this, "closed");
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

const log = (el: Element, types: string[]) => {
  const out: string[] = [];
  for (const t of types) el.addEventListener(t, (e) => out.push(`${t}${e.target === el ? "" : "(hijo)"}`));
  return out;
};

describe("controles de formulario: nx-<c>-change y el `change` nativo que burbujea", () => {
  it("nx-date-range al aplicar una frase", () => {
    document.body.innerHTML = `<div id="host"><nx-date-range today="2026-09-25" locale="es-CO"></nx-date-range></div>`;
    const el = document.querySelector<NxDateRange>("nx-date-range")!;
    const got = log(document.getElementById("host")!, ["nx-date-range-change", "change", "nx-change"]);
    el.show();
    const input = el.querySelector<HTMLInputElement>(".nx-date-range__input")!;
    input.value = "Q3 2025";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(got).toContain("nx-date-range-change(hijo)");
    expect(got).toContain("change(hijo)");
    expect(got).not.toContain("nx-change(hijo)");
  });

  it("nx-number al confirmar", () => {
    document.body.innerHTML = `<div id="host"><nx-number locale="es-CO"></nx-number></div>`;
    const el = document.querySelector<NxNumber>("nx-number")!;
    const got = log(document.getElementById("host")!, ["nx-number-change", "change", "nx-change"]);
    const input = el.querySelector("input")!;
    input.focus();
    input.value = "1.500";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur"));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(el.value).toBe(1500);
    expect(got.filter((x) => x.startsWith("nx-number-change"))).toHaveLength(1);
    expect(got).toContain("change(hijo)");
    expect(got).not.toContain("nx-change(hijo)");
  });

  it("nx-signature al cargar una firma (emite `nx-signature-done` y `change`)", async () => {
    document.body.innerHTML = `<div id="host"><nx-signature></nx-signature></div>`;
    const el = document.querySelector<NxSignature>("nx-signature")!;
    const got = log(document.getElementById("host")!, ["nx-signature-done", "change"]);
    expect(el.load('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 9"/></svg>')).toBe(true);
    for (let i = 0; i < 5 && !got.length; i++) await new Promise((r) => setTimeout(r, 0));
    expect(got).toEqual(["nx-signature-done(hijo)", "change(hijo)"]);
  });

  it("un diálogo queda «sin guardar» con el cambio de un nx-date-range (sin escuchar nx-change)", () => {
    document.body.innerHTML = `<nx-dialog heading="Ficha"><nx-date-range today="2026-09-25" locale="es-CO"></nx-date-range></nx-dialog>`;
    const d = document.querySelector<NxDialog>("nx-dialog")!;
    const dr = d.querySelector<NxDateRange>("nx-date-range")!;
    expect(d.dirty).toBe(false);
    dr.show();
    const input = dr.querySelector<HTMLInputElement>(".nx-date-range__input")!;
    input.value = "Q3 2025";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(dr.value?.start).toBe("2025-07-01");
    expect(d.dirty).toBe(true);
  });
});
