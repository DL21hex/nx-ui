// @vitest-environment happy-dom
//
// happy-dom no tiene layout: `getBoundingClientRect` se simula (todo mide 80×24 en la pantalla,
// salvo lo que diga `data-rect="x,y,ancho,alto"`) y `elementFromPoint` devuelve null (no se puede
// saber si algo está tapado), salvo en la prueba que lo simula.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/keytips/index";
import "../src/components/button/index";
import "../src/components/dialog/index";
import type { NxDialog } from "../src/index";
import { KEYTIPS_LABELS, type KeytipDetail, type NxKeytips } from "../src/components/keytips/index";

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const [x, y, w, h] = ((this as HTMLElement).dataset?.rect ?? "10,10,80,24").split(",").map(Number);
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON() {} } as DOMRect;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const d of document.querySelectorAll<NxDialog>("nx-dialog")) d.close();
  document.body.innerHTML = "";
});

const ORDER = `
  <div id="bar">
    <button id="save">Guardar</button>
    <button id="approve">Aprobar</button>
    <button id="print">Imprimir</button>
    <button id="send">Enviar al cliente</button>
    <button id="void">Anular</button>
  </div>
  <div role="tablist">
    <button role="tab" id="t1" aria-selected="true">Detalle</button>
    <button role="tab" id="t2" tabindex="-1">Pagos</button>
    <button role="tab" id="t3" tabindex="-1">Historial</button>
  </div>
  <label for="client">Cliente</label><input id="client" value="Ferretería El Tornillo" />
  <label>Observaciones <textarea id="notes">Entregar en bodega</textarea></label>
  <nx-keytips></nx-keytips>`;

function mount(html = ORDER, attrs = ""): NxKeytips {
  document.body.innerHTML = html.replace("<nx-keytips>", `<nx-keytips ${attrs}>`);
  return document.querySelector("nx-keytips")!;
}
const on = (): Element => document.activeElement ?? document.body;
const down = (key: string, o: KeyboardEventInit = {}, target: Element = on()) => {
  const e = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...o });
  target.dispatchEvent(e);
  return e;
};
const up = (key: string, o: KeyboardEventInit = {}, target: Element = on()) => {
  const e = new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...o });
  target.dispatchEvent(e);
  return e;
};
/** Presionar y soltar Alt sola. */
const tap = (key = "Alt", mod: KeyboardEventInit = { altKey: true }) => {
  down(key, mod);
  return up(key);
};
/** Una letra (con su `code`, como el navegador). */
const letter = (c: string, o: KeyboardEventInit = {}) => down(c.toLowerCase(), { code: /\d/.test(c) ? `Digit${c}` : `Key${c.toUpperCase()}`, ...o });
const layer = (el: NxKeytips) => el.querySelector<HTMLElement>(".nx-keytips__layer")!;
const tips = (el: NxKeytips) => [...layer(el).querySelectorAll<HTMLElement>(".nx-keytips__tip")];
const map = (el: NxKeytips) => Object.fromEntries(el.assignments.map((a) => [a.name, a.key]));
const frame = () => new Promise((r) => setTimeout(r, 40));

describe("<nx-keytips>", () => {
  it("un toque de Alt muestra una letra por acción visible; otro toque los oculta", () => {
    const el = mount();
    const changes: boolean[] = [];
    el.addEventListener("nx-open-change", (e) => changes.push(e.detail.open));
    expect(layer(el).hidden).toBe(true);
    expect(layer(el).getAttribute("aria-hidden")).toBe("true");
    expect(layer(el).getAttribute("popover")).toBe("manual");

    const e = tap();
    expect(e.defaultPrevented).toBe(true); // la barra de menú de Firefox/Windows no se abre
    expect(el.open).toBe(true);
    expect(layer(el).hidden).toBe(false);
    expect(map(el)).toEqual({ Guardar: "G", Aprobar: "A", Imprimir: "I", "Enviar al cliente": "E", Anular: "N", Detalle: "D", Pagos: "P", Historial: "H", Cliente: "C", Observaciones: "O" });
    expect(tips(el).map((t) => t.textContent)).toEqual(["G", "A", "I", "E", "N", "D", "P", "H", "C", "O"]);
    // Anclada a la esquina superior izquierda, sin salirse de la pantalla.
    expect(tips(el)[0].style.left).toBe("4px");
    expect(tips(el)[0].style.top).toBe("2px");
    // Anuncia una vez.
    expect(el.querySelector('[role="status"]')!.textContent).toBe(KEYTIPS_LABELS.open);

    tap();
    expect(el.open).toBe(false);
    expect(layer(el).hidden).toBe(true);
    expect(tips(el)).toHaveLength(0);
    expect(el.querySelector('[role="status"]')!.textContent).toBe("");
    expect(changes).toEqual([true, false]);
  });

  it("Alt con otra tecla en medio no es un toque: Alt+Tab, Alt+Mayús, Ctrl+Alt, AltGr", () => {
    const el = mount();
    down("Alt", { altKey: true });
    down("Tab", { altKey: true });
    up("Alt");
    expect(el.open).toBe(false);

    down("Alt", { altKey: true });
    down("Shift", { altKey: true, shiftKey: true });
    up("Shift", { altKey: true });
    up("Alt");
    expect(el.open).toBe(false);

    // Windows: AltGr llega como Ctrl + Alt.
    down("Control", { ctrlKey: true });
    down("Alt", { ctrlKey: true, altKey: true });
    up("Alt", { ctrlKey: true });
    expect(el.open).toBe(false);

    // Linux y Mac: AltGr es su propia tecla (para escribir @ o #).
    down("AltGraph");
    down("@", { code: "KeyQ" });
    up("AltGraph");
    expect(el.open).toBe(false);
  });

  it("un toque lento no es un toque (de eso se encarga el mantener); abiertos, un toque lento no los cierra", () => {
    const el = mount();
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    down("Alt", { altKey: true });
    now.mockReturnValue(1900);
    // (En el navegador, a los 400 ms ya los habría mostrado el mantener; aquí el temporizador no corrió.)
    expect(up("Alt").defaultPrevented).toBe(false);
    expect(el.open).toBe(false);
    el.show();
    down("Alt", { altKey: true });
    now.mockReturnValue(2900);
    up("Alt");
    expect(el.open).toBe(true);
    now.mockReturnValue(3000);
    tap();
    expect(el.open).toBe(false);
  });

  it("mantener Alt ~400 ms los muestra, soltarla no los oculta, y Alt+letra ejecuta", () => {
    vi.useFakeTimers();
    const el = mount();
    const save = vi.fn();
    document.getElementById("save")!.addEventListener("click", save);
    down("Alt", { altKey: true });
    down("Alt", { altKey: true, repeat: true });
    vi.advanceTimersByTime(399);
    expect(el.open).toBe(false);
    vi.advanceTimersByTime(1);
    expect(el.open).toBe(true);
    // Alt+G sin soltar: en Mac Opción+G escribe «©», la tecla física dice G.
    const e = letter("G", { key: "©", altKey: true });
    expect(e.defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(el.open).toBe(false);
    up("Alt");
    expect(el.open).toBe(false);

    // Mantener y soltar: se quedan a la vista hasta la letra.
    down("Alt", { altKey: true });
    vi.advanceTimersByTime(500);
    expect(up("Alt").defaultPrevented).toBe(true);
    expect(el.open).toBe(true);
  });

  it("la letra hace clic en botones, pestañas y casillas, y cierra", () => {
    const el = mount(`${ORDER}<label><input type="checkbox" id="urgent" /> Urgente</label>`);
    const calls: string[] = [];
    document.addEventListener("click", (e) => calls.push((e.target as HTMLElement).id));
    tap();
    letter("A");
    expect(calls).toEqual(["approve"]);
    expect(el.open).toBe(false);
    tap();
    letter("P");
    expect(calls).toEqual(["approve", "t2"]);
    tap();
    letter("U");
    expect(calls.at(-1)).toBe("urgent");
    expect((document.getElementById("urgent") as HTMLInputElement).checked).toBe(true);
  });

  it("en un campo, la letra enfoca y selecciona el texto; mientras están abiertos, lo que se teclea no se escribe", () => {
    const el = mount();
    const notes = document.getElementById("notes") as HTMLTextAreaElement;
    notes.focus();
    tap(); // se activa aunque el foco esté en un campo de texto (el caso principal)
    expect(el.open).toBe(true);
    const e = letter("C");
    expect(e.defaultPrevented).toBe(true);
    const client = document.getElementById("client") as HTMLInputElement;
    expect(document.activeElement).toBe(client);
    expect([client.selectionStart, client.selectionEnd]).toEqual([0, client.value.length]);
    expect(el.open).toBe(false);
  });

  it("nx-keytip avisa {key, target, name} antes; cancelarlo no ejecuta (y cierra igual)", () => {
    const el = mount();
    const save = vi.fn();
    document.getElementById("save")!.addEventListener("click", save);
    const got: KeytipDetail[] = [];
    el.addEventListener("nx-keytip", (e) => {
      got.push(e.detail);
      e.preventDefault();
    });
    tap();
    letter("G");
    expect(got).toEqual([{ key: "G", target: document.getElementById("save"), name: "Guardar" }]);
    expect(save).not.toHaveBeenCalled();
    expect(el.open).toBe(false);
  });

  it("Esc cierra sin que llegue a nadie más; Tab cierra y sigue su camino; Ctrl+K también pasa", () => {
    const el = mount();
    const seen: string[] = [];
    document.addEventListener("keydown", (e) => e.key !== "Alt" && seen.push(e.key));
    tap();
    const esc = down("Escape");
    expect(el.open).toBe(false);
    expect(esc.defaultPrevented).toBe(true);
    expect(seen).toEqual([]);

    tap();
    const tab = down("Tab");
    expect(el.open).toBe(false);
    expect(tab.defaultPrevented).toBe(false);
    expect(seen).toEqual(["Tab"]);

    tap();
    const k = down("k", { ctrlKey: true, code: "KeyK" });
    expect(el.open).toBe(false);
    expect(k.defaultPrevented).toBe(false);
    expect(seen).toEqual(["Tab", "k"]);
  });

  it("una letra que no es de nadie se ignora (y no se escribe); un clic cierra", () => {
    const el = mount();
    tap();
    expect(letter("Z").defaultPrevented).toBe(true);
    expect(down("F5").defaultPrevented).toBe(true);
    expect(el.open).toBe(true);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(el.open).toBe(false);
  });

  it("excluye lo deshabilitado, inerte, oculto, sin tamaño, fuera de la pantalla y data-keytip='off'", () => {
    const el = mount(`
      <button>Guardar</button>
      <button disabled>Borrar</button>
      <button aria-disabled="true">Cerrar mes</button>
      <fieldset disabled><button>Fieldset</button></fieldset>
      <div inert><button>Inerte</button></div>
      <button hidden>Oculto</button>
      <div style="display:none"><button>Sin display</button></div>
      <button style="visibility:hidden">Invisible</button>
      <button data-rect="10,10,0,0">Cero</button>
      <button data-rect="10,5000,80,24">Abajo</button>
      <button data-rect="-500,10,80,24">Izquierda</button>
      <button data-keytip="off">Apagado</button>
      <div data-keytip="off"><button>En contenedor apagado</button></div>
      <input type="hidden" name="id" value="7" />
      <div tabindex="0">Sin rol pero tabulable</div>
      <div tabindex="-1">No tabulable</div>
      <div tabindex="0"></div>
      <a>Sin href</a>
      <a href="/pedidos">Pedidos</a>
      <nx-keytips></nx-keytips>`);
    expect(el.assignments.map((a) => a.name)).toEqual(["Guardar", "Sin rol pero tabulable", "Pedidos"]);
  });

  it("lo tapado por otra cosa no recibe letra (elementFromPoint en su centro)", () => {
    const el = mount(`<button id="a">Guardar</button><button id="b" data-rect="200,10,80,24">Borrar</button><div id="veil"></div><nx-keytips></nx-keytips>`);
    const veil = document.getElementById("veil")!;
    document.elementFromPoint = (x: number) => (x > 150 ? veil : document.getElementById("a"));
    try {
      expect(el.assignments.map((a) => a.name)).toEqual(["Guardar"]);
    } finally {
      delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });

  it("data-keytip fija la letra; en un <nx-button> actúa su botón de adentro", () => {
    const el = mount(`
      <button>Guardar</button>
      <button data-keytip="g">Generar</button>
      <nx-button id="pdf" label="Imprimir" data-keytip="P"></nx-button>
      <nx-button id="mail" label="Enviar"></nx-button>
      <div data-keytip="">Resumen</div>
      <nx-keytips></nx-keytips>`);
    const pdf = document.querySelector("#pdf .nx-button__btn")!;
    const mail = document.querySelector("#mail .nx-button__btn")!;
    expect(el.assignments.map((a) => [a.key, a.name])).toEqual([
      ["U", "Guardar"],
      ["G", "Generar"],
      ["P", "Imprimir"],
      ["E", "Enviar"],
      ["R", "Resumen"],
    ]);
    // Sin data-keytip, la letra es del <button> interno directamente.
    expect(el.assignments[3].element).toBe(mail);
    const clicks: Element[] = [];
    document.addEventListener("click", (e) => clicks.push(e.target as Element));
    tap();
    letter("P");
    expect(clicks).toEqual([pdf]);
    // Un elemento cualquiera con data-keytip recibe el clic.
    const summary = vi.fn();
    document.querySelector("[data-keytip='']")!.addEventListener("click", summary);
    tap();
    letter("R");
    expect(summary).toHaveBeenCalledOnce();
  });

  it("scope limita la región", () => {
    const el = mount(`<nav><button>Inicio</button></nav><main id="zona"><button>Guardar</button></main><nx-keytips scope="#zona"></nx-keytips>`);
    expect(el.assignments.map((a) => a.name)).toEqual(["Guardar"]);
    el.scope = "#no-existe";
    expect(el.assignments.map((a) => a.name)).toEqual(["Inicio", "Guardar"]);
    el.scope = "[[inválido";
    expect(el.assignments).toHaveLength(2);
  });

  it("con un <nx-dialog> abierto solo cuentan sus acciones; Esc cierra los atajos, no el diálogo", async () => {
    const el = mount(`${ORDER}
      <nx-dialog id="dlg" heading="Anular pedido">
        <label>Motivo <input id="reason" /></label>
        <button id="confirm">Confirmar anulación</button>
      </nx-dialog>`);
    const dlg = document.getElementById("dlg") as NxDialog;
    void dlg.show();
    expect(dlg.open).toBe(true);
    tap();
    expect(el.assignments.map((a) => a.name)).toEqual(["Cerrar", "Motivo", "Confirmar anulación"]);
    down("Escape");
    expect(el.open).toBe(false);
    expect(dlg.open).toBe(true);
    dlg.close();
    expect(el.assignments.map((a) => a.name)).toContain("Guardar");
  });

  it("con más de 30 acciones, dos letras: la primera atenúa las que no empiezan por ella; Retroceso la borra", () => {
    const rows = Array.from({ length: 35 }, (_, i) => `<button id="r${i}">Fila ${i + 1}</button>`).join("");
    const el = mount(`${rows}<button id="save">Guardar</button><nx-keytips></nx-keytips>`);
    tap();
    const list = el.assignments;
    expect(list.every((a) => a.key.length === 2)).toBe(true);
    const save = list.find((a) => a.name === "Guardar")!;
    expect(save.key).toBe("GU");
    letter("G");
    expect(el.open).toBe(true);
    const off = tips(el).filter((t) => t.classList.contains("nx-keytips__tip--off"));
    expect(off.length).toBe(list.filter((a) => !a.key.startsWith("G")).length);
    down("Backspace");
    expect(tips(el).some((t) => t.classList.contains("nx-keytips__tip--off"))).toBe(false);
    const clicked = vi.fn();
    document.getElementById("save")!.addEventListener("click", clicked);
    letter("G");
    letter("U");
    expect(clicked).toHaveBeenCalledOnce();
    expect(el.open).toBe(false);
  });

  it("la misma letra en cada apertura, aunque aparezca otra acción antes", () => {
    const el = mount(`<div id="bar"><button>Guardar</button><button>Generar</button></div><nx-keytips></nx-keytips>`);
    tap();
    expect(map(el)).toEqual({ Guardar: "G", Generar: "E" });
    tap();
    document.getElementById("bar")!.insertAdjacentHTML("afterbegin", "<button>Gastos</button>");
    tap();
    expect(map(el)).toEqual({ Gastos: "A", Guardar: "G", Generar: "E" });
  });

  it("abiertos, un cambio en el DOM se recalcula en el siguiente cuadro; si ya no queda nada, se cierran", async () => {
    const el = mount(`<div id="bar"><button>Guardar</button></div><nx-keytips></nx-keytips>`);
    tap();
    expect(tips(el)).toHaveLength(1);
    const first = tips(el)[0];
    document.getElementById("bar")!.insertAdjacentHTML("beforeend", "<button>Aprobar</button>");
    await frame();
    expect(tips(el).map((t) => t.textContent)).toEqual(["G", "A"]);
    // La etiqueta que ya estaba se actualiza en su lugar, no se recrea.
    expect(tips(el)[0]).toBe(first);
    // Al desplazarse, se reubica.
    document.querySelector<HTMLElement>("#bar button")!.dataset.rect = "300,200,80,24";
    document.dispatchEvent(new Event("scroll"));
    await frame();
    expect([first.style.left, first.style.top]).toEqual(["294px", "192px"]);
    document.getElementById("bar")!.remove();
    await frame();
    expect(el.open).toBe(false);
  });

  it("sin acciones visibles no se abre (y la letra sigue su camino)", () => {
    const el = mount(`<p>Nada que hacer</p><nx-keytips></nx-keytips>`);
    const e = tap();
    expect(el.open).toBe(false);
    expect(e.defaultPrevented).toBe(true);
    expect(letter("A").defaultPrevented).toBe(false);
  });

  it("key cambia la tecla; key='none' solo abre con show()", () => {
    const el = mount(ORDER, 'key="Control"');
    tap();
    expect(el.open).toBe(false);
    tap("Control", { ctrlKey: true });
    expect(el.open).toBe(true);
    tap("Control", { ctrlKey: true });
    el.key = "none";
    tap();
    expect(el.open).toBe(false);
    el.show();
    expect(el.open).toBe(true);
    el.hide();
    expect(el.open).toBe(false);
  });

  it("disabled apaga todo: no abre, y ponerlo con los atajos a la vista los cierra", () => {
    const el = mount(ORDER, "disabled");
    tap();
    expect(el.open).toBe(false);
    el.show();
    expect(el.open).toBe(false);
    el.disabled = false;
    tap();
    expect(el.open).toBe(true);
    el.disabled = true;
    expect(el.open).toBe(false);
    el.setAttribute("disabled", "false");
    expect(el.disabled).toBe(false);
  });

  it("labels (atributo JSON o propiedad) cambia lo que se anuncia", () => {
    const el = mount(ORDER, `labels='{"open":"Atajos: pulsa una letra"}'`);
    tap();
    expect(el.querySelector('[role="status"]')!.textContent).toBe("Atajos: pulsa una letra");
    tap();
    el.labels = { open: 5 as unknown as string };
    expect(el.labels.open).toBe(KEYTIPS_LABELS.open);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    el.setAttribute("labels", "{no es json");
    expect(warn).toHaveBeenCalled();
  });

  it("al sacarlo del DOM deja de escuchar el teclado (y se cierra)", () => {
    const el = mount();
    tap();
    expect(el.open).toBe(true);
    el.remove();
    expect(el.open).toBe(false);
    tap();
    expect(el.open).toBe(false);
    document.body.append(el);
    tap();
    expect(el.open).toBe(true);
  });

  it("cerrado no deja listeners de scroll, clic ni MutationObserver", () => {
    const add = vi.spyOn(document, "addEventListener");
    const el = mount();
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(["keydown", "keyup"]);
    const observe = vi.spyOn(MutationObserver.prototype, "observe");
    tap();
    expect(observe).toHaveBeenCalledOnce();
    const disconnect = vi.spyOn(MutationObserver.prototype, "disconnect");
    tap();
    expect(disconnect).toHaveBeenCalled();
    // Con los atajos cerrados, un pointerdown no hace nada (no hay listener que lo atienda).
    expect(el.open).toBe(false);
  });

  it("show() con los atajos abiertos y ya sin acciones visibles los cierra (no se queda tragando teclas)", () => {
    const el = mount();
    el.show();
    expect(el.open).toBe(true);
    for (const b of document.querySelectorAll("button, input, textarea")) b.setAttribute("hidden", "");
    el.show();
    expect(el.open).toBe(false);
  });

  it("una acción que se ocultó (por clase o estilo) con los atajos abiertos ya no se pulsa", () => {
    const el = mount();
    const save = document.getElementById("save")!;
    const click = vi.fn();
    save.addEventListener("click", click);
    tap();
    save.checkVisibility = () => false;
    down(el.assignments.find((a) => a.element === save)!.key);
    expect(click).not.toHaveBeenCalled();
    expect(el.open).toBe(false);
  });
});
