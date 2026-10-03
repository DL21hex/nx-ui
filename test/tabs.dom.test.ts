// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOCUSABLE, shown } from "../src/core/order";
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

  it("un clic cambia de pestaña y avisa con nx-tabs-change; value dice cuál", async () => {
    const t = await mount();
    const spy = vi.fn();
    t.addEventListener("nx-tabs-change", (e) => spy((e as CustomEvent).detail));
    tabs(t)[2].click();
    expect(spy).toHaveBeenCalledWith({ value: "docs", previous: "Resumen" });
    expect(t.value).toBe("docs");
    expect(panels(t)[2].hidden).toBe(false);
    expect(panels(t)[0].hidden).toBe(true);
  });

  it("cancelar nx-tabs-change deja la pestaña donde estaba", async () => {
    const t = await mount();
    t.addEventListener("nx-tabs-change", (e) => e.preventDefault());
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

  it("el lector de pantalla lee la lista primero: aria-owns con la lista y luego los paneles", async () => {
    const t = await mount();
    const list = t.querySelector('[role="tablist"]')!;
    // Con la lista primero en el DOM no hace falta.
    expect(t.firstElementChild).toBe(list);
    expect(t.hasAttribute("aria-owns")).toBe(false);
    // Como con el módulo diferido (o Solid): la lista, después de los paneles (y algo que repinte).
    t.append(list);
    panels(t)[0].dataset.count = "1";
    await tick();
    expect(t.getAttribute("aria-owns")!.split(" ")).toEqual([list.id, ...panels(t).map((p) => p.id)]);
    // Un hijo sin id quedaría antes de la lista: entonces no se ordena.
    t.insertBefore(document.createElement("p"), list);
    await tick();
    expect(t.hasAttribute("aria-owns")).toBe(false);
  });

  it("al repintar, los botones se actualizan en su lugar (no se recrean)", async () => {
    const t = await mount();
    const [b0, , b2] = tabs(t);
    panels(t)[2].dataset.count = "13";
    await tick();
    expect(tabs(t)[0]).toBe(b0);
    expect(tabs(t)[2]).toBe(b2);
    expect(b2.textContent).toBe("Documentos13");
    b2.click();
    expect(tabs(t)[2]).toBe(b2);
    expect(b2.getAttribute("aria-selected")).toBe("true");
  });

  it("lo que cambia dentro de un panel no repinta la lista", async () => {
    const t = await mount();
    const list = t.querySelector('[role="tablist"]')!;
    let changes = 0;
    new MutationObserver((r) => (changes += r.length)).observe(list, { subtree: true, childList: true, attributes: true, characterData: true });
    panels(t)[0].innerHTML = "<div data-count='9'><span>otra cosa</span></div>";
    panels(t)[0].firstElementChild!.setAttribute("data-tab", "x");
    await tick();
    expect(changes).toBe(0);
  });

  it("el contador sale con el formato del locale", async () => {
    document.documentElement.lang = "es-CO";
    const t = await mount(`<section data-tab="Documentos" data-count="1234">D</section><section data-tab="Datos" data-errors="1500">E</section>`);
    expect(tabs(t)[0].textContent).toBe("Documentos1.234");
    expect(tabs(t)[1].querySelector(".nx-sr-only")!.textContent).toBe("1.500 por corregir");
    document.documentElement.removeAttribute("lang");
  });

  it("quitar el atributo labels vuelve a los textos por defecto", async () => {
    const t = await mount("", `labels='{"errors":"{n} con error"}'`);
    expect(tabs(t)[1].textContent).toContain("2 con error");
    t.removeAttribute("labels");
    await tick();
    expect(tabs(t)[1].textContent).toContain("2 por corregir");
  });
});

describe("<nx-tabs>: Tab en el orden en que se ve (sin reading-flow)", () => {
  // Lo que importa de tabs.css: la lista, que va al final del DOM, se ve arriba.
  beforeEach(() => {
    document.head.innerHTML = `<style>nx-tabs{display:flex;flex-direction:column} .nx-tabs__list{order:-1}</style>`;
    vi.stubGlobal("CSS", { supports: () => false });
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  });
  afterEach(() => {
    document.head.innerHTML = "";
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mountAround(): Promise<NxTabs> {
    document.body.innerHTML = `<button id="antes">Antes</button><nx-tabs><section data-tab="Uno"><input id="i"></section><section data-tab="Dos">2</section></nx-tabs><button id="despues">Después</button>`;
    await tick();
    const t = document.querySelector("nx-tabs")!;
    // Como con el módulo diferido: la lista, después de los paneles.
    t.append(t.querySelector('[role="tablist"]')!);
    await tick();
    return t;
  }
  const tab = (el: Element, shiftKey = false) => {
    const e = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };
  /** Tab como en el navegador: si nadie lo evitó, el foco pasa al siguiente enfocable del documento
   *  que lo acepte (lo `inert` no), o sale de la página. */
  const press = (shiftKey = false) => {
    const from = document.activeElement ?? document.body;
    const e = tab(from, shiftKey);
    if (e.defaultPrevented) return e;
    const bit = shiftKey ? Node.DOCUMENT_POSITION_PRECEDING : Node.DOCUMENT_POSITION_FOLLOWING;
    const all = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => shown(el) && !el.matches(":disabled") && from.compareDocumentPosition(el) & bit);
    for (const el of shiftKey ? all.reverse() : all) {
      el.focus();
      if (document.activeElement === el) return e;
    }
    (document.activeElement as HTMLElement | null)?.blur();
    return e;
  };

  it("de la pestaña al panel, del panel a lo que sigue, y Mayús+Tab de vuelta a lo de antes", async () => {
    const t = await mountAround();
    const [b0] = tabs(t);
    const p0 = panels(t)[0];
    b0.focus();
    expect(press().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(p0);
    // Dentro del panel, al de al lado en el documento: lo hace el navegador.
    expect(press().defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.getElementById("i"));
    // Al salir, el navegador sigue con lo de afuera sin pasar por la lista (que va después en el DOM).
    expect(press().defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.getElementById("despues"));
    await tick();
    b0.focus();
    press(true);
    expect(document.activeElement).toBe(document.getElementById("antes"));
    // Lo que se escondió para ese Tab vuelve enseguida.
    await tick();
    expect(t.querySelector("[inert]")).toBeNull();
  });

  it("si son lo último (o lo primero) de la página, Tab sale de ella en vez de volver a la lista", async () => {
    const t = await mountAround();
    document.getElementById("antes")!.remove();
    document.getElementById("despues")!.remove();
    const [b0] = tabs(t);
    document.getElementById("i")!.focus();
    press();
    expect(document.activeElement).not.toBe(b0);
    expect(t.contains(document.activeElement)).toBe(false);
    await tick();
    b0.focus();
    press(true);
    expect(t.contains(document.activeElement)).toBe(false);
  });

  it("lo que no acepta el foco (dentro de un <fieldset disabled>) no atasca a Tab", async () => {
    document.body.innerHTML = `<nx-tabs><section data-tab="Uno" tabindex="-1"><fieldset disabled><button id="dis">No</button></fieldset><input id="i"></section></nx-tabs>`;
    await tick();
    const t = document.querySelector("nx-tabs")!;
    t.append(t.querySelector('[role="tablist"]')!);
    await tick();
    const dis = document.getElementById("dis")!;
    // Como en un navegador (happy-dom no hereda `:disabled` del fieldset).
    vi.spyOn(dis, "focus").mockImplementation(() => {});
    const [b0] = tabs(t);
    b0.focus();
    expect(press().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(document.getElementById("i"));
  });

  it("al entrar con Tab desde antes, el foco cae en la pestaña activa, no en el panel", async () => {
    const t = await mountAround();
    const p0 = panels(t)[0];
    tab(document.getElementById("antes")!);
    p0.focus();
    expect(document.activeElement).toBe(tabs(t)[0]);
    // Un foco que no viene de Tab (un clic, la app) se respeta.
    await tick();
    p0.focus();
    expect(document.activeElement).toBe(p0);
  });

  it("con reading-flow, el navegador ya lo hace: no se intercepta", async () => {
    vi.stubGlobal("CSS", { supports: () => true });
    const t = await mountAround();
    const [b0] = tabs(t);
    b0.focus();
    expect(tab(b0).defaultPrevented).toBe(false);
  });
});
