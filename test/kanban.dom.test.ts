// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API (la usan los avisos) ni calcula cajas: se simula el
// popover con sus eventos y todo cuenta como visible para el foco. El arrastre con el puntero se
// prueba en el navegador (e2e/kanban.spec.ts); aquí, el teclado, los datos y el flujo del movimiento.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../src/components/kanban/index";
import type { KanbanCard, KanbanColumn, KanbanMoveDetail, NxKanban } from "../src/components/kanban/index";
import type { NxDialog } from "../src/components/dialog/dialog";

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
  Element.prototype.scrollIntoView = function () {};
  Element.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelectorAll("nx-dialog").forEach((d) => (d as NxDialog).open && (d as NxDialog).close());
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const COLUMNS: KanbanColumn[] = [
  { id: "draft", label: "Borrador", tone: "neutral" },
  { id: "review", label: "Por aprobar", tone: "warning", wip: 2 },
  { id: "ok", label: "Aprobado", tone: "success" },
  { id: "void", label: "Anulado", tone: "danger", confirm: { heading: "¿Anular {title}?", impact: "/impacto", hold: false } },
];
const CARDS: KanbanCard[] = [
  { id: "2291", column: "draft", title: "OC-2291", subtitle: "Aceros del Caribe", amount: 10829000, currency: "COP", assignee: "Ana María Rincón", due: "2020-01-01", tags: [{ label: "Urgente", tone: "danger" }], href: "/oc/2291" },
  { id: "2310", column: "draft", title: "OC-2310", subtitle: "Empaques Andinos", amount: 1450000, currency: "COP" },
  { id: "2318", column: "review", title: "OC-2318", amount: 3912000, currency: "COP" },
  { id: "2322", column: "review", title: "OC-2322", amount: 820000, currency: "COP" },
  { id: "2325", column: "ok", title: "OC-2325", amount: 648000, currency: "COP" },
];

function mount(attrs = 'undo="40"'): NxKanban {
  document.body.innerHTML = `<button id="before">antes</button><nx-kanban heading="Compras" locale="es-CO" ${attrs}></nx-kanban>`;
  const el = document.querySelector("nx-kanban")!;
  el.columns = COLUMNS;
  el.cards = CARDS.map((c) => ({ ...c }));
  return el;
}
const col = (el: NxKanban, id: string) => el.querySelector<HTMLElement>(`.nx-kanban__col[data-col="${id}"]`)!;
const ids = (el: NxKanban, id: string) => [...col(el, id).querySelectorAll<HTMLElement>(".nx-kanban__card")].map((c) => c.dataset.id);
const card = (el: NxKanban, id: string) => el.querySelector<HTMLElement>(`.nx-kanban__card[data-id="${id}"]`)!;
const live = (el: NxKanban) => el.querySelector('[aria-live="assertive"]')!.textContent;
const key = (target: HTMLElement, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
/** El diálogo de confirmación (se carga con `import()`: tarda un poco la primera vez). */
async function dialog(): Promise<NxDialog> {
  for (let i = 0; i < 100; i++) {
    const d = document.querySelector<NxDialog>("nx-dialog.nx-confirm");
    if (d?.querySelector(".nx-confirm__item, .nx-confirm__status:not(.is-loading)")) return d;
    await sleep(20);
  }
  throw new Error("sin diálogo");
}
const events = (el: NxKanban) => {
  const log: string[] = [];
  for (const t of ["move", "commit", "undo"]) el.addEventListener(`nx-kanban-${t}`, (e) => log.push(`${t}:${(e as CustomEvent<KanbanMoveDetail>).detail.card.id}→${(e as CustomEvent<KanbanMoveDetail>).detail.to}@${(e as CustomEvent<KanbanMoveDetail>).detail.index}`));
  return log;
};

describe("<nx-kanban>", () => {
  it("pinta columnas y tarjetas como texto, con contador, suma y límite", () => {
    const el = mount();
    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("aria-labelledby")).toBe(el.querySelector(".nx-kanban__heading")!.id);
    expect([...el.querySelectorAll(".nx-kanban__label")].map((l) => l.textContent)).toEqual(["Borrador", "Por aprobar", "Aprobado", "Anulado"]);
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
    expect(col(el, "draft").querySelector(".nx-kanban__count")!.textContent).toBe("2");
    expect(col(el, "draft").querySelector(".nx-kanban__sum")!.textContent).toBe("$12,3 M");
    expect(col(el, "draft").getAttribute("aria-label")).toBe("Borrador, 2 tarjetas, $ 12.279.000");
    expect(col(el, "review").querySelector(".nx-kanban__count")!.textContent).toBe("2/2");
    expect(col(el, "review").hasAttribute("data-full")).toBe(true);
    expect(col(el, "review").hasAttribute("data-over")).toBe(false);
    expect(col(el, "void").querySelector(".nx-kanban__list")!.children).toHaveLength(0);
    const c = card(el, "2291");
    expect(c.querySelector("a")!.getAttribute("href")).toBe("/oc/2291");
    expect(c.querySelector(".nx-kanban__amount")!.textContent).toBe("$ 10.829.000");
    expect(c.querySelector(".nx-kanban__due")!.hasAttribute("data-late")).toBe(true);
    expect(c.querySelector(".nx-kanban__who")!.textContent).toBe("AMAna María Rincón");
    expect(c.getAttribute("aria-describedby")).toBe(el.querySelector("p.nx-kanban__sr")!.id);
    // Una tarjeta por columna en el orden de Tab (Tab va de columna en columna).
    expect([...el.querySelectorAll<HTMLElement>(".nx-kanban__card")].map((x) => x.tabIndex)).toEqual([0, -1, 0, -1, 0]);
  });

  it("los datos no son HTML y los enlaces peligrosos no se pintan", () => {
    const el = mount();
    el.cards = [{ id: "x", column: "draft", title: "<img src=x onerror=alert(1)>", href: "javascript:alert(1)" }];
    expect(card(el, "x").querySelector("img")).toBeNull();
    expect(card(el, "x").querySelector("a")).toBeNull();
    expect(card(el, "x").textContent).toContain("<img");
  });

  it("columnas y tarjetas también como atributos JSON", () => {
    document.body.innerHTML = `<nx-kanban columns='[{"id":"a","label":"Uno","wip":1}]' cards='[{"id":"1","column":"a","title":"T1"},{"id":"2","column":"a","title":"T2"}]'></nx-kanban>`;
    const el = document.querySelector("nx-kanban")!;
    expect(el.cards.map((c) => c.id)).toEqual(["1", "2"]);
    expect(col(el, "a").hasAttribute("data-over")).toBe(true);
    expect(col(el, "a").querySelector(".nx-kanban__count")!.textContent).toBe("2/1");
    expect(el.getAttribute("aria-label")).toBe("Tablero");
  });

  it("flechas mueven el foco entre tarjetas y columnas (tabindex itinerante)", () => {
    const el = mount();
    card(el, "2291").focus();
    key(card(el, "2291"), "ArrowDown");
    expect(document.activeElement).toBe(card(el, "2310"));
    expect(card(el, "2310").tabIndex).toBe(0);
    expect(card(el, "2291").tabIndex).toBe(-1);
    key(card(el, "2310"), "ArrowRight");
    expect(document.activeElement).toBe(card(el, "2322"));
    // Cada columna recuerda la suya: la de «Por aprobar» ahora es la 2322.
    expect([card(el, "2318").tabIndex, card(el, "2322").tabIndex, card(el, "2310").tabIndex]).toEqual([-1, 0, 0]);
    key(card(el, "2322"), "ArrowRight");
    expect(document.activeElement).toBe(card(el, "2325"));
    // «Anulado» está vacía: sin levantar no hay a dónde ir.
    key(card(el, "2325"), "ArrowRight");
    expect(document.activeElement).toBe(card(el, "2325"));
  });

  it("con el teclado: Espacio levanta, flechas mueven (anunciando), Espacio suelta, y se registra al terminar el aviso", async () => {
    const el = mount();
    const log = events(el);
    const c = card(el, "2291");
    c.focus();
    key(c, " ");
    expect(c.hasAttribute("data-lifted")).toBe(true);
    expect(live(el)).toBe("Tarjeta OC-2291 levantada. Columna Borrador, posición 1 de 2.");
    key(c, "ArrowDown");
    expect(ids(el, "draft")).toEqual(["2310", "2291"]);
    expect(live(el)).toBe("Columna Borrador, posición 2 de 2.");
    // A la columna de al lado, en la misma altura.
    key(c, "ArrowRight");
    expect(ids(el, "review")).toEqual(["2318", "2291", "2322"]);
    expect(live(el)).toBe("Columna Por aprobar, posición 2 de 3. Por aprobar supera su límite de 2.");
    expect(col(el, "review").hasAttribute("data-warn")).toBe(true);
    key(c, "ArrowDown");
    key(c, "ArrowDown");
    key(c, "ArrowUp");
    expect(live(el)).toBe("Columna Por aprobar, posición 2 de 3. Por aprobar supera su límite de 2.");
    expect(document.activeElement).toBe(c);
    // Nada cambió todavía en el estado.
    expect(el.cards.find((x) => x.id === "2291")!.column).toBe("draft");
    key(c, " ");
    expect(live(el)).toBe("Tarjeta OC-2291 soltada en Por aprobar, posición 2 de 3.");
    expect(c.hasAttribute("data-lifted")).toBe(false);
    expect(col(el, "review").hasAttribute("data-warn")).toBe(false);
    // Optimista: el estado y los totales cambian al instante, con el aviso para deshacer.
    expect(el.cards.find((x) => x.id === "2291")!.column).toBe("review");
    expect(ids(el, "review")).toEqual(["2318", "2291", "2322"]);
    expect(col(el, "review").querySelector(".nx-kanban__count")!.textContent).toBe("3/2");
    expect(col(el, "review").hasAttribute("data-over")).toBe(true);
    await sleep(0);
    expect(document.querySelector(".nx-toast__msg")!.textContent).toBe("OC-2291 → Por aprobar · supera el límite (3/2)");
    expect(document.querySelector(".nx-toast")!.getAttribute("data-tone")).toBe("warning");
    expect(log).toEqual(["move:2291→review@1"]);
    await sleep(80);
    expect(log).toEqual(["move:2291→review@1", "commit:2291→review@1"]);
    expect(document.activeElement).toBe(c);
  });

  it("Escape cancela: la tarjeta vuelve a su lugar y no hay eventos", () => {
    const el = mount();
    const log = events(el);
    const c = card(el, "2310");
    c.focus();
    key(c, " ");
    key(c, "ArrowRight");
    key(c, "ArrowRight");
    expect(ids(el, "ok")).toEqual(["2325", "2310"]);
    key(c, "Escape");
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
    expect(ids(el, "ok")).toEqual(["2325"]);
    expect(live(el)).toBe("Movimiento cancelado. OC-2310 volvió a Borrador.");
    expect(log).toEqual([]);
    expect(document.activeElement).toBe(c);
  });

  it("deshacer desde el aviso: vuelve a su lugar y avisa nx-kanban-undo, sin commit", async () => {
    const el = mount('undo="5000"');
    const log = events(el);
    const p = el.move("2325", "draft", 0);
    expect(ids(el, "draft")).toEqual(["2325", "2291", "2310"]);
    await sleep(0);
    document.querySelector<HTMLButtonElement>('.nx-toast__btn[data-r="undo"]')!.click();
    await expect(p).resolves.toBe("undo");
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
    expect(ids(el, "ok")).toEqual(["2325"]);
    expect(el.cards.find((x) => x.id === "2325")!.column).toBe("ok");
    expect(log).toEqual(["move:2325→draft@0", "undo:2325→draft@0"]);
    expect(live(el)).toBe("OC-2325 volvió a Aprobado");
  });

  it("nx-kanban-move cancelable; mover al mismo lugar no hace nada", async () => {
    const el = mount();
    el.addEventListener("nx-kanban-move", (e) => e.preventDefault());
    await expect(el.move("2291", "ok")).resolves.toBe("cancel");
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
    await expect(el.move("2310", "draft", 1)).resolves.toBe("cancel");
    await expect(el.move("nada", "draft")).resolves.toBe("cancel");
  });

  it("undo=0: se registra de una vez, sin aviso", async () => {
    const el = mount('undo="0"');
    const log = events(el);
    await expect(el.move("2291", "ok")).resolves.toBe("commit");
    expect(document.querySelector(".nx-toast")).toBeNull();
    expect(log).toEqual(["move:2291→ok@1", "commit:2291→ok@1"]);
  });

  it("una columna con confirm pide confirmación con impacto; si se niega, la tarjeta vuelve", async () => {
    const fetch = vi.fn(async () => new Response('{"type":"impact","label":"Factura FE-10482","detail":"queda sin pedido"}\n{"type":"done"}\n'));
    vi.stubGlobal("fetch", fetch);
    const el = mount();
    const log = events(el);
    const p = el.move("2318", "void");
    expect(ids(el, "void")).toEqual(["2318"]);
    expect(card(el, "2318").hasAttribute("data-pending")).toBe(true);
    const dlg = await dialog();
    expect(dlg.getAttribute("heading")).toBe("¿Anular OC-2318?");
    expect(dlg.querySelector(".nx-confirm__item")!.textContent).toContain("Factura FE-10482");
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ card: "2318", from: "review", to: "void", index: 0, data: null });
    dlg.close("cancel");
    await expect(p).resolves.toBe("cancel");
    expect(ids(el, "review")).toEqual(["2318", "2322"]);
    expect(ids(el, "void")).toEqual([]);
    expect(card(el, "2318").hasAttribute("data-pending")).toBe(false);
    expect(log).toEqual(["move:2318→void@0"]);
  });

  it("confirmada, sigue el aviso y el commit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"type":"done"}\n')));
    const el = mount();
    const log = events(el);
    const p = el.move("2318", "void");
    const dlg = await dialog();
    dlg.querySelectorAll("nx-button")[1].querySelector("button")!.click();
    await expect(p).resolves.toBe("commit");
    expect(log).toEqual(["move:2318→void@0", "commit:2318→void@0"]);
    expect(el.cards.find((x) => x.id === "2318")!.column).toBe("void");
  });

  it("el filtro atenúa lo que no coincide (sin tildes) sin mover nada", () => {
    const el = mount();
    const input = el.querySelector<HTMLInputElement>(".nx-kanban__filter")!;
    expect(input.getAttribute("aria-label")).toBe("Filtrar tarjetas");
    input.value = "ANDINOS";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect([...el.querySelectorAll(".nx-kanban__card:not([data-dim])")].map((c) => (c as HTMLElement).dataset.id)).toEqual(["2310"]);
    expect(el.querySelector(".nx-kanban__hits")!.textContent).toBe("1 de 5");
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
    key(input, "Escape");
    expect(input.value).toBe("");
    expect(el.querySelectorAll(".nx-kanban__card[data-dim]")).toHaveLength(0);
  });

  it("columnas plegables: el botón dice su estado y el teclado las salta", () => {
    const el = mount();
    const fold = col(el, "review").querySelector<HTMLButtonElement>(".nx-kanban__fold")!;
    expect(fold.getAttribute("aria-expanded")).toBe("true");
    fold.click();
    expect(fold.getAttribute("aria-expanded")).toBe("false");
    expect(col(el, "review").hasAttribute("data-folded")).toBe(true);
    expect(fold.title).toBe("Desplegar Por aprobar");
    const c = card(el, "2291");
    c.focus();
    key(c, "ArrowRight");
    expect(document.activeElement).toBe(card(el, "2325"));
    // Una columna que llega plegada.
    el.columns = COLUMNS.map((x) => (x.id === "ok" ? { ...x, collapsed: true } : x));
    expect(col(el, "ok").hasAttribute("data-folded")).toBe(true);
    expect(col(el, "ok").querySelector(".nx-kanban__fold")!.getAttribute("aria-expanded")).toBe("false");
  });

  it("«Agregar» y abrir una tarjeta disparan sus eventos", () => {
    const el = mount();
    const got: string[] = [];
    el.addEventListener("nx-kanban-add", (e) => got.push(`add:${e.detail.column}`));
    el.addEventListener("nx-kanban-open", (e) => {
      got.push(`open:${e.detail.card.id}`);
      e.preventDefault();
    });
    col(el, "ok").querySelector<HTMLButtonElement>(".nx-kanban__add")!.click();
    expect(col(el, "ok").querySelector(".nx-kanban__add")!.textContent).toBe("Agregar");
    const c = card(el, "2310");
    c.focus();
    key(c, "Enter");
    c.click();
    expect(got).toEqual(["add:ok", "open:2310", "open:2310"]);
  });

  it("busy: tarjetas de relleno mientras carga", () => {
    const el = mount("busy");
    expect(col(el, "void").querySelectorAll(".nx-kanban__skel")).toHaveLength(3);
    expect(col(el, "draft").querySelectorAll(".nx-kanban__skel")).toHaveLength(0);
    el.busy = false;
    expect(el.querySelectorAll(".nx-kanban__skel")).toHaveLength(0);
  });

  it("labels en otro idioma", () => {
    const el = mount();
    el.labels = { add: "Add", lifted: "Picked up {title}. {column}, {i} of {n}." };
    const c = card(el, "2291");
    c.focus();
    key(c, " ");
    expect(live(el)).toBe("Picked up OC-2291. Borrador, 1 of 2.");
    expect(el.querySelector(".nx-kanban__add")!.textContent).toBe("Add");
  });
});

describe("<nx-kanban>: revisión", () => {
  const ptr = (type: string, o: PointerEventInit = {}) => new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", ...o });
  /** Arrastre con el puntero (en happy-dom todo mide 0: con x = 0 cae en la última columna). */
  function drag(el: NxKanban, id: string) {
    card(el, id).dispatchEvent(ptr("pointerdown", { clientX: 0, clientY: 0, buttons: 1 }));
    window.dispatchEvent(ptr("pointermove", { clientX: 0, clientY: 20, buttons: 1 }));
  }
  const copies = (el: NxKanban, id: string) => el.querySelectorAll(`.nx-kanban__card[data-id="${id}"]`).length;

  it("labels con valores que no son texto: el movimiento y su aviso siguen", async () => {
    const el = mount('undo="30"');
    el.setAttribute("labels", JSON.stringify({ moved: null, undone: 5, board: "Compras" }));
    expect(el.labels.moved).toBe("{title} → {column}");
    const log = events(el);
    const p = el.move("2291", "ok");
    expect(document.querySelector(".nx-toast__msg")!.textContent).toBe("OC-2291 → Aprobado");
    await expect(p).resolves.toBe("commit");
    expect(log).toEqual(["move:2291→ok@1", "commit:2291→ok@1"]);
  });

  it("sacado del DOM con un deshacer pendiente: se registra ya (en el elemento) y el aviso se cierra", async () => {
    const el = mount('undo="5000"');
    const log = events(el);
    const p = el.move("2291", "ok");
    expect(document.querySelectorAll(".nx-toast:not(.is-out)")).toHaveLength(1);
    el.remove();
    expect(log).toEqual(["move:2291→ok@1", "commit:2291→ok@1"]);
    expect(document.querySelectorAll(".nx-toast:not(.is-out)")).toHaveLength(0);
    await expect(p).resolves.toBe("commit");
    expect(log).toHaveLength(2);
  });

  it("la misma tarjeta movida otra vez: el primer aviso se cierra (su «Deshacer» ya no podría)", async () => {
    const el = mount('undo="5000"');
    const log = events(el);
    const p1 = el.move("2291", "review");
    const p2 = el.move("2291", "ok");
    expect(log).toEqual(["move:2291→review@2", "move:2291→ok@1", "commit:2291→review@2"]);
    await expect(p1).resolves.toBe("commit");
    const alive = document.querySelectorAll(".nx-toast:not(.is-out)");
    expect(alive).toHaveLength(1);
    expect(alive[0].querySelector(".nx-toast__msg")!.textContent).toBe("OC-2291 → Aprobado");
    alive[0].querySelector<HTMLButtonElement>('[data-r="undo"]')!.click();
    await expect(p2).resolves.toBe("undo");
    expect(ids(el, "review")).toContain("2291");
  });

  it("repintar a mitad de un arrastre lo cancela: la tarjeta no se duplica", () => {
    const el = mount();
    drag(el, "2291");
    expect(el.hasAttribute("data-dragging")).toBe(true);
    expect(el.querySelector(".nx-kanban__ghost")).not.toBeNull();
    el.setAttribute("heading", "Otro");
    expect(el.hasAttribute("data-dragging")).toBe(false);
    expect(el.querySelector(".nx-kanban__ghost")).toBeNull();
    window.dispatchEvent(ptr("pointermove", { clientX: 0, clientY: 40, buttons: 1 }));
    window.dispatchEvent(ptr("pointerup", { clientX: 0, clientY: 40 }));
    expect(copies(el, "2291")).toBe(1);
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
    // Con el teclado, igual: levantada y cambian las columnas o los textos.
    const c = card(el, "2310");
    c.focus();
    key(c, " ");
    key(c, "ArrowRight");
    el.labels = { board: "Tablero de compras" };
    expect(el.hasAttribute("data-moving")).toBe(false);
    expect(copies(el, "2310")).toBe(1);
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
  });

  it("un arrastre sin pointerup (Alt+Tab, soltado fuera) no se queda colgado", () => {
    const el = mount();
    const log = events(el);
    drag(el, "2291");
    // El siguiente movimiento llega sin botones apretados.
    window.dispatchEvent(ptr("pointermove", { clientX: 0, clientY: 60, buttons: 0 }));
    expect(el.hasAttribute("data-dragging")).toBe(false);
    expect(el.querySelector(".nx-kanban__ghost")).toBeNull();
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
    // La ventana pierde el foco.
    drag(el, "2310");
    expect(el.hasAttribute("data-dragging")).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect(el.hasAttribute("data-dragging")).toBe(false);
    window.dispatchEvent(ptr("pointerup", { clientX: 0, clientY: 60 }));
    expect(log).toEqual([]);
    expect(ids(el, "draft")).toEqual(["2291", "2310"]);
  });

  it("undo enorme se recorta al máximo de setTimeout", () => {
    const el = mount('undo="3000000000"');
    expect(el.undo).toBe(2_147_483_647);
  });
});
