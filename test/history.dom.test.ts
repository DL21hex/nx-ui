// @vitest-environment happy-dom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerComponent, render } from "../src/bdui";
import "../src/components/history/index";
import type { HistoryEvent, HistoryField, NxHistory } from "../src/components/history/index";

beforeAll(() => {
  Element.prototype.scrollIntoView = function () {};
});
// Un «ahora» fijo (solo el reloj; los temporizadores son reales): «Hoy», «Ayer» y «hace 3 h» no
// dependen de la hora a la que corren las pruebas.
const NOW = new Date(2026, 8, 25, 12, 0).getTime();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const H = 3600_000;
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const FIELDS: HistoryField[] = [
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pendiente", label: "Pendiente", tone: "warning" }, { value: "aprobada", label: "Aprobada", tone: "success" }] },
  { key: "monto", label: "Monto", type: "money", currency: "COP" },
  { key: "proveedor", label: "Proveedor" },
  { key: "notas", label: "Observaciones" },
];
const LONG_A = "Entregar en la bodega principal de lunes a viernes, de 7 a. m. a 3 p. m.";
const LONG_B = "Entregar en la portería 2 de lunes a sábado, de 6 a. m. a 2 p. m., con cita previa.";
const EVENTS: HistoryEvent[] = [
  { id: "1", at: ago(72 * H), actor: { name: "Andrés Ruiz" }, action: "create", changes: [{ field: "estado", from: null, to: "pendiente" }, { field: "monto", from: null, to: 1_000_000 }, { field: "proveedor", from: null, to: "Aceros SAS" }, { field: "notas", from: null, to: LONG_A }] },
  { id: "2", at: ago(48 * H), actor: { name: "Andrés Ruiz" }, action: "update", changes: [{ field: "notas", from: LONG_A, to: LONG_B }] },
  { id: "3", at: ago(26 * H), actor: { name: "Diana Castro" }, action: "comment", note: "Queda poco presupuesto." },
  { id: "4", at: ago(3 * H), actor: { name: "Laura Gómez" }, action: "status", changes: [{ field: "estado", from: "pendiente", to: "aprobada" }] },
  { id: "5", at: ago(0.5 * H), actor: { name: "Andrés Ruiz" }, action: "update", changes: [{ field: "monto", from: 1_000_000, to: 1_250_000 }, { field: "proveedor", from: "Aceros SAS", to: "Aceros del Caribe" }] },
];
const RECORD = { estado: "aprobada", monto: 1_250_000, proveedor: "Aceros del Caribe", notas: LONG_B };

function mount(attrs = 'undo="40"'): NxHistory {
  document.body.innerHTML = `<nx-history heading="OC-2291" locale="es-CO" ${attrs}></nx-history>`;
  const el = document.querySelector("nx-history")!;
  el.fields = FIELDS;
  el.record = RECORD;
  el.events = EVENTS;
  el.user = { name: "Sofía Herrera" };
  return el;
}
const evs = (el: NxHistory) => [...el.querySelectorAll<HTMLElement>(".nx-history__ev")];
const range = (el: NxHistory) => el.querySelector<HTMLInputElement>(".nx-history__range")!;
const slide = (el: NxHistory, v: number) => {
  range(el).value = String(v);
  range(el).dispatchEvent(new Event("input", { bubbles: true }));
};
const state = (el: NxHistory) => Object.fromEntries([...el.querySelectorAll(".nx-history__state > div")].map((d) => [d.querySelector("dt")!.textContent, d.querySelector("dd .nx-history__val")!.textContent]));

describe("<nx-history>", () => {
  it("una línea de tiempo por día, del más nuevo al más viejo, con quién y qué cambió", () => {
    const el = mount();
    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("aria-label")).toBe("OC-2291");
    const days = [...el.querySelectorAll(".nx-history__day > h3")].map((h) => h.textContent);
    expect(days).toEqual(["Hoy", "Ayer", "miércoles 23 de septiembre", "martes 22 de septiembre"]);
    expect(evs(el).map((li) => li.dataset.i)).toEqual(["4", "3", "2", "1", "0"]);
    const last = evs(el)[0];
    expect(last.querySelector(".nx-history__line")!.textContent).toMatch(/^Andrés Ruiz actualizó hace 30 min$/);
    expect(last.querySelector(".nx-history__avatar")!.textContent).toBe("AR");
    expect(last.querySelector(".nx-history__changes li")!.textContent).toContain("Monto$ 1.000.000→$ 1.250.000");
    const status = evs(el)[1].querySelector(".nx-history__changes li")!;
    expect(status.querySelector(".nx-history__field")!.textContent).toBe("Estado");
    expect([...status.querySelectorAll(".nx-history__val")].map((v) => [v.textContent, v.getAttribute("data-tone")])).toEqual([
      ["Pendiente", "warning"],
      ["Aprobada", "success"],
    ]);
    expect(evs(el)[1].querySelector("time")!.textContent).toBe("hace 3 h");
    // La creación muestra solo el valor (no «— → …»).
    expect(evs(el)[4].querySelector(".nx-history__fromto")!.textContent).toBe("Pendiente");
  });

  it("un texto largo se muestra como diferencia por palabras", () => {
    const el = mount();
    const diff = evs(el)[3].querySelector(".nx-history__diff")!;
    expect([...diff.querySelectorAll("del")].map((d) => d.textContent)).toContain("viernes,");
    expect([...diff.querySelectorAll("ins")].map((d) => d.textContent)).toContain("sábado,");
    expect(diff.textContent!.startsWith("Entregar en la ")).toBe(true);
  });

  it("el deslizador recorre los eventos y el panel muestra el registro de ese momento", () => {
    const el = mount();
    const travel: (string | null)[] = [];
    el.addEventListener("nx-history-travel", (e) => travel.push(e.detail.id));
    expect(range(el).max).toBe("4");
    expect(range(el).value).toBe("4");
    expect(el.querySelector(".nx-history__asof")!.textContent).toBe("Así está ahora");
    expect(el.querySelector(".nx-history__present")!.hasAttribute("hidden")).toBe(true);

    slide(el, 2);
    expect(el.at).toBe("3");
    expect(travel).toEqual(["3"]);
    expect(el.hasAttribute("data-past")).toBe(true);
    expect(el.querySelector(".nx-history__asof")!.textContent).toMatch(/^Así estaba el \d+ \w+ \d{4}, /);
    expect(range(el).getAttribute("aria-valuetext")).toMatch(/Diana Castro comentó · 3 de 5$/);
    expect(state(el)).toEqual({ Estado: "Pendiente", Monto: "$ 1.000.000", Proveedor: "Aceros SAS", Observaciones: LONG_B });
    expect(el.snapshot).toEqual({ ...RECORD, estado: "pendiente", monto: 1_000_000, proveedor: "Aceros SAS" });
    // Lo que cambió desde entonces, marcado y con su valor de hoy.
    const changed = [...el.querySelectorAll(".nx-history__state [data-changed]")];
    expect(changed.map((d) => d.querySelector("dt")!.textContent)).toEqual(["Estado", "Monto", "Proveedor"]);
    expect(changed[1].querySelector("small")!.textContent).toBe("Ahora: $ 1.250.000");
    // En la línea: los eventos posteriores, atenuados; el de ese momento, resaltado.
    expect(evs(el).filter((li) => li.hasAttribute("data-future")).map((li) => li.dataset.i)).toEqual(["4", "3"]);
    expect(el.querySelector(".nx-history__ev[data-on]")!.getAttribute("data-i")).toBe("2");

    slide(el, 0);
    expect(state(el).Observaciones).toBe(LONG_A);
    expect(el.querySelector('.nx-history__state [data-hit] dt')!.textContent).toBe("Estado");

    // Esc sobre el deslizador vuelve al presente; «Volver al presente» también.
    range(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(el.at).toBeNull();
    expect(el.hasAttribute("data-past")).toBe(false);
    slide(el, 1);
    el.querySelector<HTMLButtonElement>(".nx-history__present")!.click();
    expect(el.at).toBeNull();
    expect(document.activeElement).toBe(range(el));
  });

  it("la hora de un evento viaja a ese momento", () => {
    const el = mount();
    evs(el)[3].querySelector<HTMLButtonElement>(".nx-history__when")!.click();
    expect(el.at).toBe("2");
    expect(range(el).value).toBe("1");
    expect(evs(el)[3].querySelector(".nx-history__when")!.getAttribute("aria-label")).toMatch(/^Ver cómo estaba · /);
  });

  it("filtros por persona y por campo (con conteo), y un buscador", async () => {
    const el = mount();
    const chips = [...el.querySelectorAll<HTMLButtonElement>(".nx-history__chip")];
    expect(chips.map((c) => c.textContent)).toEqual(["ARAndrés Ruiz3", "DCDiana Castro1", "LGLaura Gómez1", "Estado2", "Monto2", "Proveedor2", "Observaciones2"]);
    expect(el.querySelector(".nx-history__group")!.getAttribute("role")).toBe("group");
    chips[0].focus();
    chips[0].click();
    expect(evs(el).map((li) => li.dataset.i)).toEqual(["4", "1", "0"]);
    // El foco sigue en el chip después de volver a pintar.
    const pressed = el.querySelector<HTMLButtonElement>('.nx-history__chip[aria-pressed="true"]')!;
    expect(pressed.dataset.v).toBe("Andrés Ruiz");
    expect(document.activeElement).toBe(pressed);
    el.querySelector<HTMLButtonElement>('.nx-history__chip[data-v="notas"]')!.click();
    expect(evs(el).map((li) => li.dataset.i)).toEqual(["1", "0"]);
    // Otra vez el mismo chip: se quita.
    el.querySelector<HTMLButtonElement>('.nx-history__chip[data-v="Andrés Ruiz"]')!.click();
    el.querySelector<HTMLButtonElement>('.nx-history__chip[data-v="notas"]')!.click();
    expect(evs(el)).toHaveLength(5);

    const q = el.querySelector<HTMLInputElement>(".nx-history__q")!;
    expect(q.getAttribute("aria-label")).toBe("Buscar en el historial");
    q.value = "presupuesto";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    // La búsqueda espera un instante (no repinta por cada tecla).
    expect(evs(el)).toHaveLength(5);
    await sleep(150);
    expect(evs(el).map((li) => li.dataset.i)).toEqual(["2"]);
    q.value = "nada de esto";
    q.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(150);
    expect(el.querySelector(".nx-history__feed")!.hasAttribute("hidden")).toBe(true);
    expect(el.querySelector(".nx-history__msg")!.textContent).toBe("Nada coincide con los filtros. Quitar filtros");
    el.querySelector<HTMLButtonElement>('[data-act="clear"]')!.click();
    expect(q.value).toBe("");
    expect(evs(el)).toHaveLength(5);
  });

  it("revertir: solo lo vigente, cancelable, se deshace desde el aviso", async () => {
    const el = mount('undo="5000"');
    const buttons = [...el.querySelectorAll<HTMLButtonElement>(".nx-history__revert")];
    // Vigentes: monto y proveedor (evento 5), estado (4) y las notas (2). La creación no se revierte.
    expect(buttons.map((b) => `${b.dataset.revert}:${b.dataset.field}`)).toEqual(["5:monto", "5:proveedor", "4:estado", "2:notas"]);
    expect(buttons[0].getAttribute("aria-label")).toBe("Revertir Monto a $ 1.000.000");

    el.addEventListener("nx-history-revert", (e) => e.preventDefault(), { once: true });
    expect(await el.revert("5", "monto")).toBe("cancel");
    expect(el.record.monto).toBe(1_250_000);

    const log: string[] = [];
    el.addEventListener("nx-history-commit", () => log.push("commit"));
    buttons[0].focus();
    const p = el.revert("5", "monto");
    await sleep(0);
    expect(el.record.monto).toBe(1_000_000);
    const rev = evs(el)[0];
    expect(rev.dataset.action).toBe("revert");
    expect(rev.hasAttribute("data-pending")).toBe(true);
    expect(rev.querySelector(".nx-history__line")!.textContent).toMatch(/^Sofía Herrera revirtió un cambio /);
    expect(el.querySelector('.nx-history__ev[data-i="4"] [data-reverted] .nx-history__tag')!.textContent).toBe("Revertido");
    expect(document.querySelector(".nx-toast:last-child .nx-toast__msg")!.textContent).toBe("Monto vuelve a $ 1.000.000");
    document.querySelector<HTMLButtonElement>('.nx-toast:last-child .nx-toast__btn[data-r="undo"]')!.click();
    await expect(p).resolves.toBe("undo");
    expect(el.record.monto).toBe(1_250_000);
    expect(evs(el)).toHaveLength(5);
    expect(log).toEqual([]);
  });

  it("revertir: al acabar el tiempo, nx-history-commit con el registro nuevo; el pasado sigue cuadrando", async () => {
    const el = mount();
    const got: unknown[] = [];
    el.addEventListener("nx-history-commit", (e) => got.push({ field: e.detail.change.field, from: e.detail.change.from, revertOf: e.detail.revert.revertOf, proveedor: e.detail.record.proveedor }));
    await expect(el.revert("5", "proveedor")).resolves.toBe("commit");
    expect(got).toEqual([{ field: "proveedor", from: "Aceros SAS", revertOf: "5", proveedor: "Aceros SAS" }]);
    expect(el.events).toHaveLength(6);
    expect(el.querySelector('.nx-history__revert[data-revert="5"][data-field="proveedor"]')).toBeNull();
    el.travel("5");
    expect(state(el).Proveedor).toBe("Aceros del Caribe");
    // Un cambio que ya no es el vigente no se revierte.
    expect(await el.revert("1", "proveedor")).toBe("cancel");
  });

  it("una nota aparece al instante (Enter la envía; se puede cancelar)", () => {
    const el = mount();
    const texts: string[] = [];
    el.addEventListener("nx-history-comment", (e) => texts.push(e.detail.text));
    const box = el.querySelector<HTMLTextAreaElement>(".nx-history__note-in")!;
    expect(box.getAttribute("aria-label")).toBe("Agregar una nota…");
    box.value = "  Llamé al proveedor.  ";
    box.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(texts).toEqual(["Llamé al proveedor."]);
    expect(box.value).toBe("");
    const first = evs(el)[0];
    expect(first.dataset.action).toBe("comment");
    expect(first.querySelector(".nx-history__note")!.textContent).toBe("Llamé al proveedor.");
    expect(first.querySelector(".nx-history__line strong")!.textContent).toBe("Sofía Herrera");
    el.addEventListener("nx-history-comment", (e) => e.preventDefault());
    expect(el.comment("otra")).toBe(false);
    expect(el.comment("   ")).toBe(false);
    expect(evs(el)).toHaveLength(6);
  });

  it("source: pide la primera página, luego la anterior con ?before, y reintenta si falla", async () => {
    const calls: string[] = [];
    let fail = false;
    const page = (evs: HistoryEvent[], extra: object = {}) => new Response(JSON.stringify({ events: evs, ...extra }), { status: 200 });
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      if (fail) return new Response("", { status: 500 });
      return url.includes("before=3") ? page(EVENTS.slice(0, 2), { more: false }) : page(EVENTS.slice(2), { record: RECORD, more: true });
    });
    document.body.innerHTML = `<nx-history source="/h/oc?x=1" locale="es-CO"></nx-history>`;
    const el = document.querySelector("nx-history")!;
    el.fields = FIELDS;
    expect(el.querySelector(".nx-history__skel")!.getAttribute("role")).toBe("status");
    expect(el.querySelector(".nx-history__feed")!.getAttribute("aria-busy")).toBe("true");
    await sleep(0);
    await sleep(0);
    expect(calls).toEqual(["/h/oc?x=1"]);
    expect(el.record.monto).toBe(1_250_000);
    expect(evs(el)).toHaveLength(3);
    // Mirando el pasado mientras llega la página anterior: el momento no cambia.
    el.travel("4");
    fail = true;
    el.querySelector<HTMLButtonElement>('[data-act="more"]')!.click();
    await sleep(0);
    await sleep(0);
    expect(el.querySelector(".nx-history__msg")!.textContent).toBe("No se pudo cargar el historial. Reintentar");
    fail = false;
    el.querySelector<HTMLButtonElement>('[data-act="retry"]')!.click();
    await sleep(0);
    await sleep(0);
    expect(calls[2]).toBe("/h/oc?x=1&before=3");
    expect(evs(el)).toHaveLength(5);
    expect(el.at).toBe("4");
    expect(el.querySelector('[data-act="more"]')).toBeNull();
  });

  it("BDUI: textos como texto, avatares seguros y atributos JSON", () => {
    document.body.innerHTML = `<nx-history></nx-history>`;
    const el = document.querySelector("nx-history")!;
    el.setAttribute("record", JSON.stringify({ x: "<b>b</b>" }));
    el.setAttribute("events", JSON.stringify([{ id: "a", at: ago(H), actor: { name: '<img src=x onerror="alert(1)">', avatar: "javascript:alert(1)" }, action: "comment", note: "<script>alert(1)</script>", changes: [{ field: "x", from: "a", to: "<b>b</b>" }] }]));
    el.setAttribute("labels", JSON.stringify({ comment: "dejó una nota", heading: "Bitácora" }));
    expect(el.querySelector("img, script, b")).toBeNull();
    expect(el.querySelector(".nx-history__note")!.textContent).toBe("<script>alert(1)</script>");
    expect(el.querySelector(".nx-history__line")!.textContent).toContain("dejó una nota");
    expect(el.querySelector(".nx-history__title")!.textContent).toBe("Bitácora");
    // Sin `fields`, las claves del registro.
    expect(state(el)).toEqual({ x: "<b>b</b>" });
    // Con una foto segura, sí hay <img>.
    el.events = [{ id: "b", at: ago(H), actor: { name: "Ana", avatar: "/fotos/ana.jpg" }, action: "comment", note: "hola" }];
    expect(el.querySelector(".nx-history__ev img")!.getAttribute("src")).toBe("/fotos/ana.jpg");
    expect(el.querySelector(".nx-history__ev img")!.getAttribute("alt")).toBe("");
  });

  it("BDUI: se pinta desde un nodo {component, props}", () => {
    registerComponent("History", "nx-history", ["record", "fields", "events", "source", "user", "undo", "heading", "labels"]);
    const [el] = render({ component: "History", props: { record: RECORD, fields: FIELDS, events: EVENTS, heading: "OC-2291", undo: 0, onclick: "alert(1)" } }, document.body) as NxHistory[];
    expect(el.tagName).toBe("NX-HISTORY");
    expect(el.undo).toBe(0);
    expect(evs(el)).toHaveLength(5);
    expect(el.getAttribute("onclick")).toBeNull();
  });

  it("propiedades puestas antes de registrarse y el estado vacío", () => {
    const el = document.createElement("nx-history") as NxHistory;
    Object.assign(el, { events: [], fields: FIELDS });
    document.body.append(el);
    expect(el.fields).toHaveLength(4);
    expect(el.querySelector(".nx-history__msg")!.textContent).toBe("Todavía no hay cambios. ");
    expect(range(el).disabled).toBe(true);
  });
});

describe("<nx-history>: revisión", () => {
  const page = (evs: HistoryEvent[], extra: object = {}) => new Response(JSON.stringify({ events: evs, ...extra }), { status: 200 });
  const flush = async () => {
    await sleep(0);
    await sleep(0);
  };

  it("otro source: ni el registro, ni los filtros, ni «más» del anterior", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      calls.push(url);
      return url.startsWith("/h/a") ? page(EVENTS, { record: RECORD, more: true }) : page([{ id: "b1", at: ago(H), actor: { name: "Ana" }, action: "comment", note: "otra OC" }], { more: false });
    });
    document.body.innerHTML = `<nx-history source="/h/a" locale="es-CO"></nx-history>`;
    const el = document.querySelector("nx-history")!;
    el.fields = FIELDS;
    await flush();
    expect(el.record.monto).toBe(1_250_000);
    el.querySelector<HTMLButtonElement>('.nx-history__chip[data-v="Andrés Ruiz"]')!.click();
    expect(evs(el)).toHaveLength(3);
    el.setAttribute("source", "/h/b");
    await flush();
    expect(calls).toEqual(["/h/a", "/h/b"]);
    expect(el.record).toEqual({});
    expect(evs(el)).toHaveLength(1);
    expect(el.querySelector('[data-act="more"]')).toBeNull();
    // Un registro puesto por la app se queda.
    el.record = { monto: 5 };
    el.setAttribute("source", "/h/a?otra");
    await flush();
    expect(el.record).toEqual({ monto: 5 });
  });

  it("source solo pide a http(s) del mismo origen", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => (calls.push(url), page([])));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    document.body.innerHTML = `<nx-history source="javascript:alert(1)"></nx-history><nx-history source="https://otro.example/h"></nx-history>`;
    await flush();
    expect(calls).toEqual([]);
    vi.mocked(console.warn).mockRestore();
  });

  it("labels con valores que no son texto no rompen el pintado", () => {
    const el = mount();
    el.setAttribute("labels", JSON.stringify({ heading: null, update: 5, comment: "dejó una nota" }));
    expect(el.labels.update).toBe("actualizó");
    expect(evs(el)[0].querySelector(".nx-history__line")!.textContent).toContain("actualizó");
  });

  it("sacado del DOM con una reversión pendiente: se registra ya y el aviso se cierra", async () => {
    const el = mount('undo="5000"');
    const got: string[] = [];
    el.addEventListener("nx-history-commit", (e) => got.push(e.detail.change.field));
    const p = el.revert("5", "monto");
    await sleep(0);
    expect(document.querySelectorAll(".nx-toast:not(.is-out)")).toHaveLength(1);
    el.remove();
    expect(got).toEqual(["monto"]);
    expect(document.querySelectorAll(".nx-toast:not(.is-out)")).toHaveLength(0);
    await expect(p).resolves.toBe("commit");
    expect(got).toEqual(["monto"]);
  });

  it("«Deshacer» no pisa un registro más nuevo", async () => {
    const el = mount('undo="5000"');
    const p = el.revert("5", "monto");
    await sleep(0);
    expect(el.record.monto).toBe(1_000_000);
    // Mientras corre el aviso, llega el registro del servidor con otro monto.
    el.record = { ...RECORD, monto: 1_400_000 };
    document.querySelector<HTMLButtonElement>('.nx-toast:not(.is-out) [data-r="undo"]')!.click();
    await expect(p).resolves.toBe("undo");
    expect(el.record.monto).toBe(1_400_000);
    expect(evs(el)).toHaveLength(5);
  });

  it("dos notas en el mismo milisegundo no se pisan", () => {
    const el = mount();
    expect(el.comment("una")).toBe(true);
    expect(el.comment("otra")).toBe(true);
    expect(el.events.filter((e) => e.action === "comment").map((e) => e.note)).toEqual(["Queda poco presupuesto.", "una", "otra"]);
  });

  it("un evento con solo la fecha cae en su día local", () => {
    const el = mount();
    el.events = [{ id: "d", at: "2026-09-24", actor: { name: "Ana" }, action: "comment", note: "ayer" }];
    expect(el.querySelector(".nx-history__day > h3")!.textContent).toBe("Ayer");
  });

  it("undo enorme se recorta al máximo de setTimeout", () => {
    const el = mount('undo="3000000000"');
    expect(el.undo).toBe(2_147_483_647);
  });
});
