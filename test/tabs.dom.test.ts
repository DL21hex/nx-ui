// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/tabs/index";
import type { NxTabs } from "../src/components/tabs/index";

afterEach(() => {
  document.body.innerHTML = "";
});

const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount(html = "", attrs = ""): Promise<NxTabs> {
  document.body.innerHTML = `<nx-tabs ${attrs}>${
    html ||
    `<section data-tab="Resumen">R</section>
     <section data-tab="Datos" data-errors="2">D</section>
     <section data-tab="Documentos" data-value="docs" data-count="12">Doc</section>
     <section data-tab="Historial" data-disabled>H</section>`
  }</nx-tabs>`;
  await tick();
  return document.querySelector("nx-tabs")!;
}
const tabs = (t: NxTabs) => [...t.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const panels = (t: NxTabs) => [...t.querySelectorAll<HTMLElement>(":scope > section")];
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("<nx-tabs>", () => {
  it("arma la lista desde los hijos sin mover los paneles", async () => {
    const t = await mount();
    expect(t.querySelectorAll(':scope > [role="tablist"]')).toHaveLength(1);
    expect(tabs(t).map((b) => b.textContent)).toEqual(["Resumen", "Datos22 por corregir", "Documentos12", "Historial"]);
    expect(panels(t).map((p) => p.textContent)).toEqual(["R", "D", "Doc", "H"]);
    expect(tabs(t)[3].disabled).toBe(true);
  });

  it("enlaza pestañas y paneles con ARIA y muestra solo el activo", async () => {
    const t = await mount();
    const [b0, b1] = tabs(t);
    const [p0, p1] = panels(t);
    expect(b0.getAttribute("aria-selected")).toBe("true");
    expect(b0.getAttribute("aria-controls")).toBe(p0.id);
    expect(p0.getAttribute("role")).toBe("tabpanel");
    expect(p0.getAttribute("aria-labelledby")).toBe(b0.id);
    expect(p0.hidden).toBe(false);
    expect(p1.hidden).toBe(true);
    expect(b1.tabIndex).toBe(-1);
  });

  it("un clic cambia de pestaña y avisa con nx-tab-change; value dice cuál", async () => {
    const t = await mount();
    const spy = vi.fn();
    t.addEventListener("nx-tab-change", (e) => spy((e as CustomEvent).detail));
    tabs(t)[2].click();
    expect(spy).toHaveBeenCalledWith({ value: "docs", previous: "Resumen" });
    expect(t.value).toBe("docs");
    expect(panels(t)[2].hidden).toBe(false);
    expect(panels(t)[0].hidden).toBe(true);
  });

  it("cancelar nx-tab-change deja la pestaña donde estaba", async () => {
    const t = await mount();
    t.addEventListener("nx-tab-change", (e) => e.preventDefault());
    tabs(t)[1].click();
    expect(t.value).toBe("Resumen");
    expect(panels(t)[1].hidden).toBe(true);
  });

  it("flechas, Inicio y Fin mueven y activan, saltando las deshabilitadas", async () => {
    const t = await mount();
    tabs(t)[0].focus();
    key(document.activeElement!, "ArrowRight");
    expect(t.value).toBe("Datos");
    expect(document.activeElement).toBe(tabs(t)[1]);
    key(document.activeElement!, "End");
    expect(t.value).toBe("docs");
    key(document.activeElement!, "ArrowRight");
    expect(t.value).toBe("Resumen");
    key(document.activeElement!, "ArrowLeft");
    expect(t.value).toBe("docs");
    key(document.activeElement!, "Home");
    expect(t.value).toBe("Resumen");
  });

  it("el atributo value elige la pestaña inicial; uno que no existe cae a la primera", async () => {
    const t = await mount("", 'value="docs"');
    expect(panels(t)[2].hidden).toBe(false);
    t.value = "nada";
    await tick();
    expect(t.value).toBe("Resumen");
  });

  it("un panel que llega después (Solid, un <Show>) entra a la lista", async () => {
    const t = await mount('<section data-tab="Uno">1</section>');
    const dos = t.appendChild(Object.assign(document.createElement("section"), { textContent: "2" }));
    await tick();
    expect(tabs(t)).toHaveLength(1);
    dos.dataset.tab = "Dos";
    await tick();
    expect(tabs(t).map((b) => b.textContent)).toEqual(["Uno", "Dos"]);
    expect(dos.hidden).toBe(true);
    t.querySelector<HTMLElement>('[data-tab="Uno"]')!.dataset.count = "3";
    await tick();
    expect(tabs(t)[0].textContent).toBe("Uno3");
  });

  it("con tabs (BDUI) la lista sale de ahí y los paneles se buscan por data-value", async () => {
    const t = await mount('<div data-value="a">A</div>');
    t.tabs = [{ value: "a", label: "Alfa" }, { value: "b", label: "Beta", count: 4 }];
    await tick();
    expect(tabs(t).map((b) => b.textContent)).toEqual(["Alfa", "Beta4"]);
    expect(t.querySelector<HTMLElement>('[data-value="a"]')!.getAttribute("role")).toBe("tabpanel");
    expect(tabs(t)[1].hasAttribute("aria-controls")).toBe(false);
  });

  it("label nombra la lista", async () => {
    const t = await mount("", 'label="Secciones del empleado"');
    expect(t.querySelector('[role="tablist"]')!.getAttribute("aria-label")).toBe("Secciones del empleado");
  });
});
