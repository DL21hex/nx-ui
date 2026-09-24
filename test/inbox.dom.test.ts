// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API (la usan los avisos): se simula con sus eventos.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import "../src/index";
import type { InboxDecisionDetail, InboxItem, NxInbox } from "../src/index";

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
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ITEMS: InboxItem[] = [
  { id: "2291", title: "OC-2291 · Aceros del Caribe", subtitle: "Lámina HR 3 mm × 40", requester: "Ana María Rincón", amount: 10829000, currency: "COP", date: "2026-09-22", tags: [{ label: "Sobre presupuesto", tone: "danger" }], facts: [{ label: "Centro de costo", value: "Producción" }], impact: [{ label: "Presupuesto de Producción", detail: "− $ 10.829.000", tone: "warning" }], href: "/oc/2291" },
  { id: "2310", title: "OC-2310 · Empaques Andinos", requester: "Héctor Galeano", amount: 1450000, currency: "COP", impact: "/impacto/2310" },
  { id: "2318", title: "OC-2318 · Químicos del Norte", amount: 3912000, currency: "COP" },
  { id: "2322", title: "OC-2322 · Transportes Rivera", amount: 820000, currency: "COP" },
];

function mount(attrs = 'undo="40"'): NxInbox {
  document.body.innerHTML = `<nx-inbox ${attrs} locale="es-CO"></nx-inbox>`;
  const el = document.querySelector("nx-inbox")!;
  el.items = ITEMS.map((i) => ({ ...i }));
  return el;
}
const list = (el: NxInbox) => el.querySelector<HTMLElement>(".nx-inbox__list")!;
const rows = (el: NxInbox) => [...el.querySelectorAll<HTMLElement>(".nx-inbox__item")];
const ids = (el: NxInbox) => rows(el).map((r) => r.dataset.id);
const key = (el: NxInbox, k: string, o: KeyboardEventInit = {}, target: HTMLElement = list(el)) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...o }));
const title = (el: NxInbox) => el.querySelector(".nx-inbox__d-title")?.textContent;

describe("<nx-inbox>", () => {
  it("una lista con selección múltiple y el detail del activo (el primero)", () => {
    const el = mount();
    expect(list(el).getAttribute("role")).toBe("listbox");
    expect(list(el).getAttribute("aria-multiselectable")).toBe("true");
    expect(ids(el)).toEqual(["2291", "2310", "2318", "2322"]);
    expect(el.querySelector(".nx-inbox__n")!.textContent).toBe("4");
    expect(el.active).toBe("2291");
    expect(list(el).getAttribute("aria-activedescendant")).toBe(rows(el)[0].id);
    expect(title(el)).toBe("OC-2291 · Aceros del Caribe");
    expect(el.querySelector(".nx-inbox__d-amount")!.textContent).toBe("$ 10.829.000");
    expect(el.querySelector(".nx-inbox__avatar")!.textContent).toBe("AM");
    expect(el.querySelector(".nx-inbox__impact")!.textContent).toContain("Presupuesto de Producción");
    expect([...el.querySelectorAll(".nx-inbox__facts dt")].map((d) => d.textContent)).toEqual(["Solicita", "Fecha", "Centro de costo"]);
    expect(el.querySelector(".nx-inbox__open")!.getAttribute("href")).toBe("/oc/2291");
  });

  it("J/K y las flechas mueven el activo; avisa con nx-inbox-active", () => {
    const el = mount();
    const seen: string[] = [];
    el.addEventListener("nx-inbox-active", (e) => seen.push(e.detail.id));
    key(el, "j");
    key(el, "ArrowDown");
    expect(el.active).toBe("2318");
    key(el, "k");
    expect(el.active).toBe("2310");
    key(el, "End");
    key(el, "j");
    expect(el.active).toBe("2322");
    expect(seen).toEqual(["2310", "2318", "2310", "2322"]);
    expect(rows(el)[3].hasAttribute("data-active")).toBe(true);
  });

  it("A aprueba el activo: sale de la lista, el siguiente queda listo, y se registra al acabar el tiempo", async () => {
    const el = mount();
    const log: string[] = [];
    el.addEventListener("nx-inbox-decide", (e) => log.push(`decide ${e.detail.decision} ${e.detail.ids}`));
    el.addEventListener("nx-inbox-commit", (e) => log.push(`commit ${e.detail.ids}`));
    key(el, "a");
    expect(ids(el)).toEqual(["2310", "2318", "2322"]);
    expect(el.active).toBe("2310");
    expect(document.querySelector(".nx-toast__msg")!.textContent).toBe("Aprobado: OC-2291 · Aceros del Caribe");
    expect(log).toEqual(["decide approve 2291"]);
    await sleep(80);
    expect(log).toEqual(["decide approve 2291", "commit 2291"]);
    expect(el.items.map((i) => i.id)).toEqual(["2310", "2318", "2322"]);
  });

  it("deshacer (el botón del aviso) devuelve el ítem a su lugar y no registra nada", async () => {
    const el = mount('undo="5000"');
    const log: string[] = [];
    el.addEventListener("nx-inbox-commit", () => log.push("commit"));
    el.addEventListener("nx-inbox-undo", (e) => log.push(`undo ${e.detail.ids}`));
    key(el, "j");
    const p = el.decide("approve");
    expect(ids(el)).toEqual(["2291", "2318", "2322"]);
    document.querySelector<HTMLButtonElement>('.nx-toast__btn[data-r="undo"]')!.click();
    await expect(p).resolves.toBe("undo");
    expect(ids(el)).toEqual(["2291", "2310", "2318", "2322"]);
    expect(el.active).toBe("2310");
    expect(log).toEqual(["undo 2310"]);
  });

  it("X selecciona; Mayús + J extiende; A decide todos los seleccionados de una vez", async () => {
    const el = mount();
    let got: InboxDecisionDetail | null = null;
    el.addEventListener("nx-inbox-commit", (e) => (got = e.detail));
    key(el, "x");
    key(el, "j", { shiftKey: true });
    key(el, "j", { shiftKey: true });
    expect(el.selected.sort()).toEqual(["2291", "2310", "2318"]);
    expect(el.querySelector<HTMLElement>(".nx-inbox__bulk")!.hidden).toBe(false);
    expect(el.querySelector(".nx-inbox__nsel")!.textContent).toBe("3 seleccionados");
    key(el, "a");
    expect(ids(el)).toEqual(["2322"]);
    expect(el.active).toBe("2322");
    expect(document.querySelector(".nx-toast:last-child .nx-toast__msg")!.textContent).toBe("3 aprobados");
    await sleep(80);
    expect(got!.ids.sort()).toEqual(["2291", "2310", "2318"]);
  });

  it("R pide el motivo; Enter rechaza con él, Escape vuelve sin rechazar", async () => {
    const el = mount();
    let reason: string | undefined;
    el.addEventListener("nx-inbox-decide", (e) => (reason = e.detail.reason));
    key(el, "r");
    const ta = el.querySelector("textarea")!;
    expect(document.activeElement).toBe(ta);
    key(el, "Escape", {}, ta);
    expect(el.querySelector("textarea")).toBeNull();
    expect(ids(el)).toHaveLength(4);
    key(el, "r");
    const ta2 = el.querySelector("textarea")!;
    ta2.value = "Precio fuera de lo pactado";
    // Las letras que se escriben en el motivo no son atajos.
    key(el, "a", {}, ta2);
    expect(ids(el)).toHaveLength(4);
    key(el, "Enter", {}, ta2);
    expect(reason).toBe("Precio fuera de lo pactado");
    expect(ids(el)).toEqual(["2310", "2318", "2322"]);
  });

  it("require-reason: sin motivo no rechaza", () => {
    const el = mount('undo="40" require-reason');
    key(el, "r");
    const ta = el.querySelector("textarea")!;
    key(el, "Enter", {}, ta);
    expect(ta.getAttribute("aria-invalid")).toBe("true");
    expect(ids(el)).toHaveLength(4);
  });

  it("el impacto por URL llega en streaming; un bloqueo impide aprobar ese ítem", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(['{"type":"impact","label":"1 recepción","detail":"se revierte"}', '{"type":"block","message":"Ya tiene un pago (EG-3321)"}', '{"type":"done"}'].join("\n")));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount();
    key(el, "j");
    expect(el.querySelector(".nx-inbox__impact")!.textContent).toContain("Calculando el impacto…");
    await sleep(250);
    expect(fetchMock.mock.calls[0][0]).toBe("/impacto/2310");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ id: "2310", data: null });
    expect(el.querySelector(".nx-inbox__block")!.textContent).toBe("Ya tiene un pago (EG-3321)");
    expect(el.querySelector<HTMLButtonElement>('.nx-inbox__detail [data-act="approve"]')!.disabled).toBe(true);
    expect(rows(el)[1].querySelector<HTMLElement>(".nx-inbox__lock")!.hidden).toBe(false);
    await expect(el.decide("approve")).resolves.toBe("cancel");
    expect(ids(el)).toHaveLength(4);
    // En lote, lo bloqueado se omite y se dice.
    el.selected = ["2310", "2318"];
    void el.decide("approve");
    expect(ids(el)).toEqual(["2291", "2310", "2322"]);
    expect(document.querySelector(".nx-toast:last-child .nx-toast__msg")!.textContent).toBe("Aprobado: OC-2318 · Químicos del Norte · 1 bloqueado no se aprobó");
  });

  it("nx-inbox-decide cancelable: la app puede negarse", async () => {
    const el = mount();
    el.addEventListener("nx-inbox-decide", (e) => e.preventDefault());
    await expect(el.decide("reject")).resolves.toBe("cancel");
    expect(ids(el)).toHaveLength(4);
  });

  it("al quedar vacía celebra y dice cuánto se decidió", async () => {
    const el = mount('undo="0"');
    for (let i = 0; i < 4; i++) key(el, "a");
    await sleep(0);
    expect(rows(el)).toHaveLength(0);
    expect(el.hasAttribute("data-empty")).toBe(true);
    expect(el.querySelector(".nx-inbox__empty")!.textContent).toMatch(/^Todo al díaDecidiste 4 en \d/);
    expect(el.querySelector(".nx-inbox__detail")!.childElementCount).toBe(0);
  });

  it("clic activa; clic en la casilla, Ctrl + clic y Mayús + clic seleccionan", () => {
    const el = mount();
    rows(el)[2].click();
    expect(el.active).toBe("2318");
    rows(el)[0].querySelector<HTMLElement>(".nx-inbox__check")!.click();
    expect(el.selected).toEqual(["2291"]);
    rows(el)[2].dispatchEvent(new MouseEvent("click", { bubbles: true, shiftKey: true }));
    expect(el.selected.sort()).toEqual(["2291", "2310", "2318"]);
    key(el, "Escape");
    expect(el.selected).toEqual([]);
  });

  it("BDUI y seguridad: {component: 'Inbox'}; nada se interpreta como HTML y un href inseguro no se pinta", () => {
    const [el] = render({ component: "Inbox", props: { items: [{ id: "1", title: '<img src=x onerror="alert(1)">', href: "javascript:alert(1)" }], undo: 0 } }, document.body) as NxInbox[];
    expect(el.tagName).toBe("NX-INBOX");
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector(".nx-inbox__open")).toBeNull();
    expect(el.undo).toBe(0);
  });
});
