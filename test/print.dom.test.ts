// @vitest-environment happy-dom
//
// happy-dom no calcula cajas: `getBoundingClientRect` se simula con `data-h` (o la suma de los
// hijos; una fila sin `data-h` mide 20). Así el reparto es predecible. El resultado impreso de verdad
// (tamaño de página, cortes, hoja de impresión) solo se ve en un navegador.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/print/index";
import { NxPrint, type PrintPaginateDetail } from "../src/components/print/index";

const heightOf = (el: Element): number => {
  const h = el.getAttribute("data-h");
  if (h !== null) return Number(h);
  if (el.tagName === "TR") return 20;
  if (el.tagName === "TD" || el.tagName === "TH") return 0;
  let s = 0;
  for (const c of Array.from(el.children)) s += heightOf(c);
  return s;
};

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const height = heightOf(this);
    return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: height, width: 100, height, toJSON() {} } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.innerHTML = "";
  document.head.querySelectorAll("style").forEach((s) => s.remove());
});
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));

const rows = (n: number, value = 100_000) => Array.from({ length: n }, (_, i) => `<tr><td>Ítem ${i + 1}</td><td>${i + 1}</td><td>$ ${value.toLocaleString("es-CO")}</td></tr>`).join("");

/** Carta con 12 mm: ~964 px útiles; con encabezado de 100 y pie de 40 quedan ~824. */
function mount(body: string, attrs = 'heading="FV-2026-01873" locale="es-CO" currency="COP"') {
  document.body.innerHTML = `<main><p id="antes">antes</p><nx-print ${attrs}>
    <header slot="header" data-h="100"><strong id="empresa">Metalmecánica Los Andes S.A.S.</strong> <span data-print-page>{page}/{pages}</span></header>
    <footer slot="footer" data-h="40">Página {page} de {pages}</footer>
    ${body}
  </nx-print></main>`;
  const el = document.querySelector("nx-print")!;
  el.paginate();
  return el;
}
const sheets = (el: NxPrint) => Array.from(el.querySelectorAll(".nx-print__stack .nx-print__sheet"));

describe("vista previa", () => {
  it("arma las hojas con copias; el original queda en su sitio, intacto y accesible", () => {
    const el = mount(`<h1 id="titulo" data-h="60">Factura de venta</h1><p data-h="200">Cliente: Constructora Bolívar</p>`);
    const h1 = document.getElementById("titulo")!;
    expect(h1.parentElement).toBe(el);
    expect(h1.previousElementSibling!.tagName).toBe("FOOTER"); // mismo lugar entre los hijos del autor
    expect(h1.textContent).toBe("Factura de venta");
    const s = sheets(el);
    expect(s).toHaveLength(1);
    expect(s[0].querySelector("h1")!.textContent).toBe("Factura de venta");
    // Las copias no llevan id (no duplican los del original) y la vista previa es aria-hidden + inert.
    expect(document.querySelectorAll("#titulo, #empresa")).toHaveLength(2);
    const stack = el.querySelector(".nx-print__stack")!;
    expect(stack.getAttribute("aria-hidden")).toBe("true");
    expect(stack.hasAttribute("inert")).toBe(true);
    expect(el.pages).toBe(1);
  });

  it("encabezado y pie en cada hoja, con {page} y {pages}", () => {
    const el = mount(Array.from({ length: 10 }, (_, i) => `<p data-h="200">Párrafo ${i}</p>`).join(""));
    // 824 útiles / 200 → 4 por página → 3 hojas.
    const s = sheets(el);
    expect(el.pages).toBe(3);
    expect(s.map((x) => x.querySelector(".nx-print__foot")!.textContent!.trim())).toEqual(["Página 1 de 3", "Página 2 de 3", "Página 3 de 3"]);
    expect(s[1].querySelector(".nx-print__head [data-print-page]")!.textContent).toBe("2/3");
    expect(Array.from(el.querySelectorAll(".nx-print__num")).map((n) => n.textContent)).toEqual(["Página 1 de 3", "Página 2 de 3", "Página 3 de 3"]);
    // El original del pie sigue con sus marcas.
    expect(el.querySelector(":scope > footer")!.textContent).toBe("Página {page} de {pages}");
    expect(el.querySelector(".nx-print__count")!.textContent).toBe("3 páginas");
  });

  it("data-print-page en el cuerpo, keep-with-next y saltos forzados", () => {
    const el = mount(`
      <p data-h="700">Condiciones</p>
      <h2 data-h="60" data-print-keep-with-next>Observaciones</h2>
      <p data-h="100">Hoja <span data-print-page>{page}</span></p>
      <p data-h="20" data-print-break="before">Anexo</p>`);
    const s = sheets(el);
    expect(s).toHaveLength(3);
    expect(s[0].querySelector(".nx-print__body")!.textContent).not.toContain("Observaciones");
    expect(s[1].querySelector("h2")!.textContent).toBe("Observaciones");
    expect(s[1].querySelector(".nx-print__body [data-print-page]")!.textContent).toBe("2");
    expect(s[2].textContent).toContain("Anexo");
  });

  it("un bloque más alto que la hoja se parte en tajadas", () => {
    const el = mount(`<div data-h="2000">Plano</div>`);
    expect(el.pages).toBe(3);
    const slices = el.querySelectorAll(".nx-print__slice");
    expect(slices).toHaveLength(3);
    expect((slices[1].firstElementChild as HTMLElement).style.marginBlockStart).toMatch(/^-\d/);
  });
});

describe("tablas", () => {
  const TABLE = (n: number) => `<table class="items">
    <thead><tr><th>Descripción</th><th>Cant.</th><th data-print-sum>Valor</th></tr></thead>
    <tbody>${rows(n)}</tbody>
    <tfoot><tr><td colspan="2">Total</td><td>—</td></tr></tfoot></table>`;

  it("se parte por filas: <thead> en cada hoja, «Van» al pie y «Vienen» arriba, con los montos", () => {
    const el = mount(TABLE(60));
    const s = sheets(el);
    expect(s.length).toBe(2);
    const pieces = s.map((x) => x.querySelector("table")!);
    for (const t of pieces) expect(t.querySelector("thead th")!.textContent).toBe("Descripción");
    const bodyRows = pieces.flatMap((t) => Array.from(t.querySelectorAll("tbody tr:not(.nx-print__carry)")));
    expect(bodyRows).toHaveLength(60);
    const first = pieces[0].querySelectorAll("tbody tr:not(.nx-print__carry)").length;
    const van = pieces[0].querySelector("tr.nx-print__carry:last-of-type")!;
    expect(van.querySelector("th")!.textContent).toBe("Van");
    expect(van.querySelector("th")!.getAttribute("colspan")).toBe("2");
    expect(van.querySelector(".nx-print__sum")!.textContent).toBe(`$ ${(first * 100_000).toLocaleString("es-CO")}`);
    const vienen = pieces[1].querySelector("tr.nx-print__carry")!;
    expect(vienen.querySelector("th")!.textContent).toBe("Vienen");
    expect(vienen.querySelector(".nx-print__sum")!.textContent).toBe(van.querySelector(".nx-print__sum")!.textContent);
    // tfoot solo al final; la fila de muestra no queda en ninguna parte.
    expect(pieces[0].querySelector("tfoot")).toBeNull();
    expect(pieces[1].querySelector("tfoot")).not.toBeNull();
    expect(pieces[1].querySelectorAll("tr.nx-print__carry")).toHaveLength(1);
    // Mismos atributos que la tabla del autor.
    expect(pieces[1].classList.contains("items")).toBe(true);
    // El original: una tabla, 60 filas, sin filas de arrastre.
    const orig = el.querySelector(":scope > table")!;
    expect(orig.querySelectorAll("tbody tr")).toHaveLength(60);
    expect(orig.querySelector(".nx-print__carry")).toBeNull();
  });

  it("data-value manda sobre el texto; data-print-sum=\"number\" suma sin moneda", () => {
    const body = Array.from({ length: 60 }, (_, i) => `<tr><td>x</td><td data-value="${i % 2 ? 1.5 : 1}">texto</td></tr>`).join("");
    const el = mount(`<table><thead><tr><th>Ítem</th><th data-print-sum="number">Kg</th></tr></thead><tbody>${body}</tbody></table>`);
    const piece = sheets(el)[0].querySelector("table")!;
    const n = piece.querySelectorAll("tbody tr:not(.nx-print__carry)").length;
    const expected = Array.from({ length: n }, (_, i) => (i % 2 ? 1.5 : 1)).reduce((a, b) => a + b, 0);
    expect(piece.querySelector("tr.nx-print__carry:last-of-type .nx-print__sum")!.textContent).toBe(expected.toLocaleString("es-CO"));
  });

  it("una tabla que cabe va entera, sin arrastre", () => {
    const el = mount(TABLE(5));
    expect(sheets(el)).toHaveLength(1);
    expect(el.querySelector(".nx-print__stack .nx-print__carry")).toBeNull();
    expect(el.querySelector(".nx-print__stack tfoot")).not.toBeNull();
  });
});

describe("rendimiento", () => {
  it("500 líneas: un solo pase de lectura (todas las medidas antes de escribir las hojas)", () => {
    const log: string[] = [];
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      log.push("R");
      const height = heightOf(this);
      return { x: 0, y: 0, top: 0, left: 0, right: 100, bottom: height, width: 100, height, toJSON() {} } as DOMRect;
    });
    const rc = Element.prototype.replaceChildren;
    vi.spyOn(Element.prototype, "replaceChildren").mockImplementation(function (this: Element, ...n: (Node | string)[]) {
      if (this.classList.contains("nx-print__stack")) log.push("W");
      return rc.apply(this, n);
    });
    const el = mount(`<table><thead><tr><th>Ítem</th><th data-print-sum>Valor</th></tr></thead><tbody>${rows(500)}</tbody></table>`);
    log.length = 0;
    el.paginate();
    const w = log.indexOf("W");
    expect(w).toBeGreaterThan(500);
    expect(log.slice(w + 1)).not.toContain("R");
    // Una lectura por fila más unas pocas (encabezado, pie, tabla, partes): lineal.
    expect(w).toBeLessThan(520);
    expect(el.pages).toBeGreaterThan(10);
  });
});

describe("re-paginar", () => {
  it("cuando cambia el contenido del autor (con espera) y avisa", async () => {
    const el = mount(`<p data-h="500">Uno</p>`);
    const seen: number[] = [];
    el.addEventListener("nx-print-paginate", (e) => seen.push((e as CustomEvent<PrintPaginateDetail>).detail.pages));
    const p = document.createElement("p");
    p.setAttribute("data-h", "500");
    p.textContent = "Dos";
    el.append(p);
    await wait();
    expect(seen).toEqual([2]);
    expect(el.pages).toBe(2);
    // Cambiar un texto también.
    p.firstChild!.nodeValue = "Dos (corregido)";
    await wait();
    expect(sheets(el)[1].textContent).toContain("Dos (corregido)");
    // Sin cambios, nada más.
    const n = seen.length;
    await wait();
    expect(seen.length).toBe(n);
  });

  it("un innerHTML nuevo (que se lleva la vista previa) también: la vista previa vuelve", async () => {
    const el = mount(`<p data-h="50">x</p>`);
    el.innerHTML = `<p data-h="600">uno</p><p data-h="600">dos</p>`;
    await wait();
    expect(el.querySelector(":scope > .nx-print__ui")).not.toBeNull();
    expect(el.pages).toBe(2);
    expect(sheets(el)[1].textContent).toContain("dos");
  });

  it("cuando cambian tamaño u orientación", async () => {
    const el = mount(Array.from({ length: 6 }, () => `<p data-h="200">x</p>`).join(""));
    expect(el.pages).toBe(2);
    el.setAttribute("size", "half-letter");
    el.setAttribute("orientation", "landscape");
    await wait();
    // Media carta horizontal: 139,7 mm − 24 = ~437 px − 140 = ~296: una por hoja.
    expect(el.pages).toBe(6);
    expect((el.querySelector(".nx-print__ui") as HTMLElement).style.getPropertyValue("--nx-print-w")).toBe("215.9mm");
  });

  it("cuando carga una imagen del autor (no una de las copias)", async () => {
    const el = mount(`<figure data-h="100"><img src="logo.png" alt="Logo"></figure>`);
    const spy = vi.fn();
    el.addEventListener("nx-print-paginate", spy);
    el.querySelector(".nx-print__stack img")!.dispatchEvent(new Event("load"));
    await wait();
    expect(spy).not.toHaveBeenCalled();
    el.querySelector(":scope > figure img")!.dispatchEvent(new Event("load"));
    await wait();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("lo que pasa en las hojas (propio) no dispara otra paginación", async () => {
    const el = mount(`<p data-h="50">x</p>`);
    const spy = vi.fn();
    el.addEventListener("nx-print-paginate", spy);
    el.zoom = 1.5;
    el.querySelector(".nx-print__stack")!.append(document.createElement("div"));
    await wait();
    expect(spy).not.toHaveBeenCalled();
  });

  it("desconectar limpia el observador y la espera", async () => {
    const el = mount(`<p data-h="50">x</p>`);
    const spy = vi.fn();
    el.addEventListener("nx-print-paginate", spy);
    el.append(document.createElement("p")); // queda una paginación pendiente
    el.remove();
    el.querySelector("p")!.textContent = "cambio desconectado";
    await wait();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("imprimir", () => {
  it("print() pone la hoja de impresión y el título, llama a window.print y quita todo después", () => {
    const el = mount(`<p data-h="50">x</p>`);
    document.title = "Mi app";
    const events: string[] = [];
    el.addEventListener("nx-print-before", () => events.push("before"));
    el.addEventListener("nx-print-after", () => events.push("after"));
    let during: { css: string; attr: boolean; title: string } | null = null;
    const print = vi.fn(() => {
      const st = Array.from(document.head.querySelectorAll("style")).find((s) => s.textContent!.includes("@page"));
      during = { css: st?.textContent ?? "", attr: el.hasAttribute("data-nx-printing"), title: document.title };
      // Como el navegador: beforeprint y afterprint mientras el diálogo está abierto.
      dispatchEvent(new Event("beforeprint"));
      dispatchEvent(new Event("afterprint"));
    });
    window.print = print;
    el.print();
    expect(print).toHaveBeenCalledTimes(1);
    expect(during!.css).toContain("size:215.9mm 279.4mm");
    expect(during!.css).toContain("nx-print[data-nx-printing]");
    expect(during!.attr).toBe(true);
    expect(during!.title).toBe("FV-2026-01873");
    expect(events).toEqual(["before", "after"]);
    expect(Array.from(document.head.querySelectorAll("style")).some((s) => s.textContent!.includes("@page"))).toBe(false);
    expect(el.hasAttribute("data-nx-printing")).toBe(false);
    expect(document.title).toBe("Mi app");
  });

  it("nx-print-before es cancelable", () => {
    const el = mount(`<p data-h="50">x</p>`);
    const print = vi.fn();
    window.print = print;
    el.addEventListener("nx-print-before", (e) => e.preventDefault());
    el.print();
    expect(print).not.toHaveBeenCalled();
    expect(document.head.querySelector("style")).toBeNull();
  });

  it("con varios, imprime el que se pidió; Ctrl+P toma el primero", () => {
    document.body.innerHTML = `<nx-print id="a"><p data-h="10">A</p></nx-print><nx-print id="b" size="a4"><p data-h="10">B</p></nx-print>`;
    const [a, b] = Array.from(document.querySelectorAll("nx-print"));
    let css = "";
    window.print = vi.fn(() => {
      css = document.head.querySelector("style")!.textContent!;
      expect(b.hasAttribute("data-nx-printing")).toBe(true);
      expect(a.hasAttribute("data-nx-printing")).toBe(false);
      dispatchEvent(new Event("afterprint"));
    });
    b.print();
    expect(css).toContain("size:210mm 297mm");
    // Ctrl+P (sin print()): el primero de la página.
    dispatchEvent(new Event("beforeprint"));
    expect(a.hasAttribute("data-nx-printing")).toBe(true);
    dispatchEvent(new Event("afterprint"));
    expect(a.hasAttribute("data-nx-printing")).toBe(false);
  });

  it("los botones de la barra: Imprimir, PDF (con la pista) y zoom", async () => {
    const el = mount(`<p data-h="50">x</p>`);
    let hint = "";
    window.print = vi.fn(() => {
      hint = el.querySelector(".nx-print__hint")!.textContent!;
      dispatchEvent(new Event("afterprint"));
    });
    const btn = (k: string) => el.querySelector<HTMLButtonElement>(`[data-k="${k}"]`)!;
    btn("print").click();
    expect(window.print).toHaveBeenCalledTimes(1);
    btn("pdf").click();
    await wait(50);
    expect(window.print).toHaveBeenCalledTimes(2);
    expect(hint).toContain("Guardar como PDF");
    expect(el.querySelector(".nx-print__hint")!.textContent).toBe("");
    btn("actual").click();
    expect(el.getAttribute("zoom")).toBe("1");
    expect(btn("actual").getAttribute("aria-pressed")).toBe("true");
    btn("in").click();
    expect(el.zoom).toBe(1.1);
    expect(el.querySelector(".nx-print__zoom")!.textContent).toBe("110 %");
    btn("fit").click();
    expect(el.zoom).toBe("fit");
    expect(btn("fit").getAttribute("aria-pressed")).toBe("true");
  });
});

describe("API", () => {
  it("barra: toolbar con nombre, una sola parada de tabulación y flechas", () => {
    const el = mount(`<p data-h="50">x</p>`);
    const bar = el.querySelector(".nx-print__bar")!;
    expect(bar.getAttribute("role")).toBe("toolbar");
    expect(bar.getAttribute("aria-label")).toBe("Vista previa de impresión");
    const btns = Array.from(bar.querySelectorAll("button"));
    expect(btns.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(el.querySelector('[data-k="out"]')!.getAttribute("aria-label")).toBe("Alejar");
    btns[0].focus();
    btns[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(document.activeElement).toBe(btns[1]);
    expect(btns[1].tabIndex).toBe(0);
    btns[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(btns[btns.length - 1]);
    el.toolbar = false;
    expect(bar.hasAttribute("hidden")).toBe(true);
  });

  it("labels (propiedad y atributo JSON, inválido se ignora) y locale", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount(`<p data-h="500">x</p><p data-h="500">y</p>`, 'locale="en-US" labels=\'{"print":"Print","pages":"{n} pages","page":"Page {page} of {pages}"}\'');
    expect(el.querySelector('[data-k="print"]')!.textContent).toBe("Print");
    expect(el.querySelector(".nx-print__num")!.textContent).toBe("Page 1 of 2");
    expect(el.querySelector(".nx-print__count")!.textContent).toBe("2 pages");
    el.setAttribute("labels", "{no es json");
    expect(warn).toHaveBeenCalled();
    expect(el.labels.print).toBe("Print");
    el.labels = { print: 5 } as never;
    expect(el.labels.print).toBe("Imprimir");
  });

  it("props puestas antes de registrar el elemento", () => {
    const el = document.createElement("nx-print-tarde") as NxPrint;
    (el as unknown as Record<string, unknown>).labels = { print: "Imprimir factura" };
    (el as unknown as Record<string, unknown>).size = "a4";
    el.innerHTML = `<p data-h="10">x</p>`;
    document.body.append(el);
    customElements.define("nx-print-tarde", class extends NxPrint {});
    expect(el.getAttribute("size")).toBe("a4");
    expect(el.labels.print).toBe("Imprimir factura");
    el.paginate();
    expect(el.pages).toBe(1);
  });

  it("valores por defecto y normalización", () => {
    const el = document.createElement("nx-print");
    expect(el.size).toBe("letter");
    expect(el.margin).toBe("12mm");
    expect(el.zoom).toBe("fit");
    expect(el.toolbar).toBe(true);
    el.zoom = "150%";
    expect(el.zoom).toBe(1.5);
    el.orientation = "landscape";
    expect(el.orientation).toBe("landscape");
    el.setAttribute("orientation", "de lado");
    expect(el.orientation).toBeNull();
    expect(el.pages).toBe(0);
    expect(el.paginate()).toBe(0); // sin conectar no hace nada
  });
});
