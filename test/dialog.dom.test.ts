// @vitest-environment happy-dom
//
// happy-dom no tiene Popover API ni View Transitions: se simula el popover con sus eventos, y sin
// View Transitions el diálogo abre y cierra directo (como con movimiento reducido).
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { nxConfirm, nxToast, parseImpactEvent, type NxButton, type NxDialog } from "../src/index";

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
  // happy-dom no calcula cajas: todo cuenta como visible para el foco.
  Element.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.querySelectorAll("nx-dialog").forEach((d) => (d as NxDialog).open && (d as NxDialog).close());
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const esc = () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

function mount(html = '<nx-dialog id="d" heading="Nuevo pedido" description="Se envía a aprobación"><form><input name="a"></form><div slot="footer"><button data-nx-close="cancel">Cancelar</button></div></nx-dialog>'): NxDialog {
  document.body.innerHTML = `<button id="open">Abrir</button>${html}`;
  return document.querySelector<NxDialog>("nx-dialog")!;
}

describe("<nx-dialog>", () => {
  it("es un diálogo modal accesible, con título y descripción; no mueve el contenido del autor", () => {
    const d = mount();
    const form = d.querySelector("form")!;
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("popover")).toBe("manual");
    expect(document.getElementById(d.getAttribute("aria-labelledby")!)!.textContent).toBe("Nuevo pedido");
    expect(document.getElementById(d.getAttribute("aria-describedby")!)!.textContent).toBe("Se envía a aprobación");
    // Su cabecera se ubica con CSS (`order`); el formulario sigue siendo hijo directo del autor.
    expect(form.parentElement).toBe(d);
    expect(d.querySelector(":scope > .nx-dialog__head")).not.toBeNull();
  });

  it("show() abre, enfoca el primer campo y resuelve con el valor de cierre; el foco vuelve", async () => {
    const d = mount();
    const opener = document.getElementById("open")!;
    opener.focus();
    const p = d.show();
    expect(d.open).toBe(true);
    expect(d.hasAttribute("open")).toBe(true);
    expect(document.activeElement).toBe(d.querySelector("input"));
    d.querySelector<HTMLButtonElement>("[data-nx-close]")!.click();
    await expect(p).resolves.toBe("cancel");
    expect(d.open).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it("si el origen es un envoltorio (<nx-button>), el foco vuelve a su botón de adentro", async () => {
    const d = mount();
    document.body.insertAdjacentHTML("afterbegin", '<nx-button id="nb" label="Nuevo"></nx-button>');
    const nb = document.getElementById("nb")!;
    const p = d.show(nb);
    d.close("x");
    await p;
    expect(document.activeElement).toBe(nb.querySelector("button"));
  });

  it("Escape y el clic fuera cierran; `persistent` no", async () => {
    const d = mount();
    void d.show();
    esc();
    expect(d.open).toBe(false);
    d.persistent = true;
    void d.show();
    esc();
    expect(d.open).toBe(true);
    expect(d.classList.contains("is-nudge")).toBe(true);
  });

  it("<form method='dialog'> cierra con el valor del botón que lo envió", async () => {
    const d = mount('<nx-dialog heading="x"><form method="dialog"><input name="a"><button value="guardar">Guardar</button></form></nx-dialog>');
    const p = d.show();
    const form = d.querySelector("form")!;
    const ev = new Event("submit", { bubbles: true, cancelable: true });
    Object.assign(ev, { submitter: form.querySelector("button") });
    form.dispatchEvent(ev);
    await expect(p).resolves.toBe("guardar");
  });

  it("con cambios sin guardar, cerrar muestra el aviso dentro del diálogo; descartar cierra", () => {
    const d = mount();
    const reasons: string[] = [];
    d.addEventListener("nx-dialog-close", (e) => reasons.push(e.detail.reason));
    void d.show();
    const input = d.querySelector("input")!;
    input.value = "algo";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(d.dirty).toBe(true);
    esc();
    const guard = d.querySelector<HTMLElement>(".nx-dialog__guard")!;
    expect(d.open).toBe(true);
    expect(guard.hidden).toBe(false);
    expect(guard.textContent).toContain("Tienes cambios sin guardar");
    // Escape con el aviso a la vista lo oculta (seguir editando).
    esc();
    expect(guard.hidden).toBe(true);
    d.querySelector<HTMLButtonElement>(".nx-dialog__x")!.click();
    d.querySelector<HTMLButtonElement>("[data-guard='discard']")!.click();
    expect(d.open).toBe(false);
    expect(reasons).toEqual(["button"]);
  });

  it("close() desde código no pasa por el aviso (la app ya guardó)", () => {
    const d = mount();
    void d.show();
    d.dirty = true;
    expect(d.close("ok")).toBe(true);
    expect(d.open).toBe(false);
  });

  it("nx-dialog-close es cancelable", () => {
    const d = mount();
    d.addEventListener("nx-dialog-close", (e) => e.preventDefault());
    void d.show();
    esc();
    expect(d.open).toBe(true);
  });

  it("paneles apilados: profundidad, migas, Escape cierra solo el de arriba y las migas vuelven", () => {
    document.body.innerHTML = ["a", "b", "c"].map((id) => `<nx-dialog id="${id}" mode="panel" heading="Panel ${id}"><p>${id}</p></nx-dialog>`).join("");
    const [a, b, c] = ["a", "b", "c"].map((id) => document.getElementById(id) as NxDialog);
    void a.show();
    void b.show();
    void c.show();
    expect([a, b, c].map((d) => d.dataset.depth)).toEqual(["2", "1", "0"]);
    expect([...c.querySelectorAll(".nx-dialog__crumb")].map((x) => x.textContent)).toEqual(["Panel a", "Panel b"]);
    expect(b.hasAttribute("data-stacked")).toBe(true);
    esc();
    expect([a.open, b.open, c.open]).toEqual([true, true, false]);
    void c.show();
    c.querySelector<HTMLButtonElement>(".nx-dialog__crumb")!.click();
    expect([a.open, b.open, c.open]).toEqual([true, false, false]);
    expect(a.dataset.depth).toBe("0");
  });

  it("cerrar uno de abajo cierra primero los de encima (y uno con cambios lo detiene)", () => {
    document.body.innerHTML = `<nx-dialog id="a" mode="panel"></nx-dialog><nx-dialog id="b" mode="panel"><input></nx-dialog>`;
    const a = document.getElementById("a") as NxDialog;
    const b = document.getElementById("b") as NxDialog;
    void a.show();
    void b.show();
    b.dirty = true;
    expect(a.close(undefined, "button")).toBe(false);
    expect([a.open, b.open]).toEqual([true, true]);
    b.dirty = false;
    expect(a.close()).toBe(true);
    expect([a.open, b.open]).toEqual([false, false]);
  });

  it("si la app reemplaza el contenido, la cabecera vuelve", async () => {
    const d = mount();
    d.replaceChildren(document.createElement("p"));
    await sleep(0);
    expect(d.querySelector(".nx-dialog__head")).not.toBeNull();
  });

  it("el foco no se escapa: Tab da la vuelta dentro del diálogo", () => {
    const d = mount();
    void d.show();
    const cancel = d.querySelector<HTMLButtonElement>("[data-nx-close]")!;
    cancel.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(d.contains(document.activeElement)).toBe(true);
  });
});

describe("<nx-button hold>", () => {
  it("un clic no basta; mantener pulsado lo activa", () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<nx-button label="Anular" hold="800"></nx-button>';
    const b = document.querySelector<NxButton>("nx-button")!;
    const clicks = vi.fn();
    b.addEventListener("click", clicks);
    const inner = b.querySelector("button")!;
    inner.click();
    expect(clicks).not.toHaveBeenCalled();
    inner.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    vi.advanceTimersByTime(400);
    inner.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    vi.advanceTimersByTime(800);
    expect(clicks).not.toHaveBeenCalled();
    inner.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
    expect(inner.hasAttribute("data-holding")).toBe(true);
    vi.advanceTimersByTime(800);
    expect(clicks).toHaveBeenCalledOnce();
    expect(inner.getAttribute("aria-description")).toBe("Mantén pulsado para confirmar");
  });
});

describe("nxToast()", () => {
  it("con deshacer: el botón resuelve 'undo' y muestra «Deshecho»", async () => {
    const p = nxToast({ message: "OC-2291 anulada", undo: true });
    const t = document.querySelector(".nx-toast")!;
    expect(t.textContent).toContain("OC-2291 anulada");
    t.querySelector<HTMLButtonElement>("[data-r='undo']")!.click();
    await expect(p).resolves.toBe("undo");
    expect(t.textContent).toContain("Deshecho");
  });

  it("se acaba el tiempo → 'timeout'; pasar el mouse lo pausa", async () => {
    vi.useFakeTimers();
    const p = nxToast({ message: "Guardado", duration: 1000 });
    const toaster = document.querySelector("nx-toaster")!;
    vi.advanceTimersByTime(500);
    toaster.dispatchEvent(new Event("pointerenter"));
    vi.advanceTimersByTime(5000);
    let done = false;
    void p.then(() => (done = true));
    await Promise.resolve();
    expect(done).toBe(false);
    toaster.dispatchEvent(new Event("pointerleave"));
    vi.advanceTimersByTime(600);
    await expect(p).resolves.toBe("timeout");
  });

  it("Ctrl+Z deshace el último aviso con deshacer, salvo escribiendo en un campo", async () => {
    document.body.innerHTML = "<input id='i'>";
    const first = nxToast({ message: "a", undo: true });
    const second = nxToast({ message: "b", undo: true });
    document.getElementById("i")!.focus();
    document.getElementById("i")!.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    (document.activeElement as HTMLElement).blur();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    await expect(second).resolves.toBe("undo");
    document.querySelectorAll<HTMLButtonElement>("[data-r='dismiss']").forEach((b) => b.click());
    await expect(first).resolves.toBe("dismiss");
  });

  it("el texto va como texto", () => {
    void nxToast("<img src=x onerror=alert(1)>");
    expect(document.querySelector("nx-toaster img")).toBeNull();
  });
});

describe("nxConfirm()", () => {
  it("parseImpactEvent valida cada línea", () => {
    expect(parseImpactEvent('{"type":"impact","label":"2 recepciones","detail":"se revierten","tone":"raro"}')).toEqual({ type: "impact", label: "2 recepciones", detail: "se revierten", icon: undefined, tone: undefined });
    expect(parseImpactEvent('{"type":"block","message":"Tiene un pago"}')).toEqual({ type: "block", message: "Tiene un pago" });
    expect(parseImpactEvent('{"type":"impact"}')).toBeNull();
    expect(parseImpactEvent("no json")).toBeNull();
    expect(parseImpactEvent("[DONE]")).toEqual({ type: "done" });
  });

  it("con una lista: muestra el impacto, el foco empieza en Cancelar y confirmar da true", async () => {
    const p = nxConfirm({ heading: "Anular OC-2291", impact: [{ label: "Factura FE-10482", detail: "queda sin pedido", tone: "warning" }], hold: 0 });
    const d = document.querySelector<NxDialog>("nx-dialog.nx-confirm")!;
    expect(d.querySelector(".nx-confirm__item")!.textContent).toBe("Factura FE-10482queda sin pedido");
    expect(document.activeElement?.closest("nx-button")?.getAttribute("label")).toBe("Cancelar");
    d.querySelectorAll("nx-button")[1].querySelector("button")!.click();
    await expect(p).resolves.toBe(true);
  });

  it("con una URL: pinta lo que llega y un «block» deja el botón bloqueado", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"type":"impact","label":"Pago EG-3321","tone":"danger"}\n{"type":"block","message":"Ya tiene un pago"}\n{"type":"done"}\n')),
    );
    const p = nxConfirm({ heading: "Anular OC-2310", impact: "/impacto" });
    const d = document.querySelector<NxDialog>("nx-dialog.nx-confirm")!;
    const ok = d.querySelectorAll<NxButton>("nx-button")[1];
    expect(ok.disabled).toBe(true);
    await sleep(20);
    expect(d.querySelector(".nx-confirm__item")!.textContent).toContain("Pago EG-3321");
    expect(d.querySelector(".nx-confirm__block")!.textContent).toBe("Ya tiene un pago");
    expect(ok.disabled).toBe(true);
    esc();
    await expect(p).resolves.toBe(false);
  });
});
