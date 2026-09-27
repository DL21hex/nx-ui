// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../src/components/guard/index";
import "../src/components/number/index";
import type { GuardFinding, NxGuard } from "../src/components/guard/index";
import type { NxNumber } from "../src/components/number/index";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 8, 26, 10, 0));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nb = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");

const FIELDS = {
  precio: { history: [1180000, 1210000, 1195000, 1240000], format: "money", currency: "COP" },
  cantidad: { typical: [1, 50] },
  factura: { repeat: true, history: ["FC-8810", "FC-8811"] },
  total: { expected: "#total-oc", format: "money", currency: "COP" },
};

const FORM = `
  <form id="f">
    <div class="row"><label for="precio">Precio unitario</label><input id="precio" name="precio" aria-describedby="ayuda"><small id="ayuda">Sin IVA</small></div>
    <label>Cantidad <input name="cantidad"></label>
    <div class="row"><label for="factura">Factura</label><input id="factura" name="factura"></div>
    <div class="row"><label for="total">Total</label><input id="total" name="total"></div>
    <div class="row"><label for="fecha">Fecha</label><input id="fecha" name="fecha" type="date"></div>
    <div class="row"><label for="peso">Peso (t)</label><nx-number id="peso" name="peso"></nx-number></div>
    <div class="row"><label for="monto">Monto</label><nx-number id="monto" name="monto" format="money" currency="COP"></nx-number></div>
    <input name="libre">
    <div class="acts"><button type="submit">Registrar</button></div>
  </form>
  <span id="total-oc">$ 1.530.000</span>`;

function mount(attrs = "", body = FORM): NxGuard {
  document.body.innerHTML = `<nx-guard ${attrs}>${body}</nx-guard>`;
  const el = document.querySelector("nx-guard")!;
  el.fields = { ...FIELDS, peso: { history: [1.5, 2, 1.8, 2.2, 1.6] }, monto: { history: [1180000, 1210000, 1195000, 1240000] } } as never;
  return el;
}
const field = (name: string) => document.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
/** Escribe como una persona: `input` por el camino y `change` al final. */
function type(name: string, value: string) {
  const el = field(name);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return el;
}
/** En un <nx-number>: se teclea en su <input> y se sale (confirma y emite `change`). */
function typeNumber(id: string, text: string): NxNumber {
  const host = document.getElementById(id) as NxNumber;
  const i = host.querySelector("input")!;
  i.focus();
  i.dispatchEvent(new FocusEvent("focus"));
  i.value = text;
  i.dispatchEvent(new Event("input", { bubbles: true }));
  i.dispatchEvent(new FocusEvent("blur"));
  return host;
}
const noteOf = (name: string) => document.querySelector<HTMLElement>(`.nx-guard__note[data-field="${name}"]`);
const btn = (name: string, act: "fix" | "ack") => noteOf(name)!.querySelector<HTMLButtonElement>(`[data-act="${act}"]`)!;
const live = () => document.querySelector(".nx-guard__sr[role=status]")?.textContent ?? "";
function submit(form = document.querySelector("form")!) {
  const ev = new Event("submit", { bubbles: true, cancelable: true });
  form.dispatchEvent(ev);
  return ev;
}

describe("<nx-guard>: el aviso", () => {
  it("al cambiar un campo, avisa debajo con la corrección y «Está bien»; mientras se escribe, nada", () => {
    const el = mount();
    const warn = vi.fn();
    el.addEventListener("nx-guard-warn", (e) => warn(e.detail));
    const input = field("precio");
    input.value = "12000000";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(noteOf("precio")).toBeNull();
    input.dispatchEvent(new Event("change", { bubbles: true }));
    const note = noteOf("precio")!;
    expect(note.previousElementSibling).toBe(input);
    expect(nb(note.querySelector(".nx-guard__msg")!.textContent)).toBe("$ 12.000.000 es 10 veces lo habitual ($ 1.200.000). ¿Sobra un cero?");
    expect(nb(btn("precio", "fix").textContent)).toBe("Corregir a $ 1.200.000");
    expect(btn("precio", "ack").textContent).toBe("Está bien");
    expect(note.querySelectorAll("button[type=button]")).toHaveLength(2);
    expect(input.getAttribute("data-nx-guard")).toBe("warn");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(nb(live())).toBe("Precio unitario: $ 12.000.000 es 10 veces lo habitual ($ 1.200.000). ¿Sobra un cero?");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({ field: "precio", finding: { kind: "magnitude", suggestion: 1_200_000, field: "precio" } });
  });

  it("un campo envuelto en su <label>: el aviso va después del label, no adentro", () => {
    mount();
    type("cantidad", "1000");
    const note = noteOf("cantidad")!;
    expect(note.previousElementSibling).toBe(field("cantidad").closest("label"));
    expect(note.closest("label")).toBeNull();
    expect(note.textContent).toContain("¿Sobran 2 ceros?");
  });

  it("aria-describedby se suma al del autor y se quita después; nunca aria-invalid", () => {
    mount();
    const input = type("precio", "12000000");
    const id = noteOf("precio")!.id;
    expect(input.getAttribute("aria-describedby")).toBe(`ayuda ${id}`);
    type("precio", "1200000");
    expect(noteOf("precio")).toBeNull();
    expect(input.getAttribute("aria-describedby")).toBe("ayuda");
    // Sin uno previo, se pone y se quita del todo.
    const cant = type("cantidad", "1000");
    expect(cant.getAttribute("aria-describedby")).toBe(noteOf("cantidad")!.id);
    btn("cantidad", "ack").click();
    expect(cant.hasAttribute("aria-describedby")).toBe(false);
    expect(cant.hasAttribute("data-nx-guard")).toBe(false);
  });

  it("el mismo aviso no se repite; otro valor raro actualiza el mismo nodo en su lugar", () => {
    const el = mount();
    const warn = vi.fn();
    el.addEventListener("nx-guard-warn", warn);
    type("precio", "12000000");
    const note = noteOf("precio");
    type("precio", "12000000");
    expect(warn).toHaveBeenCalledTimes(1);
    type("precio", "120000");
    expect(noteOf("precio")).toBe(note);
    expect(note!.textContent).toContain("¿Falta un cero?");
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("campos sin configuración no se vigilan; una fecha sí, por años absurdos", () => {
    mount();
    type("libre", "999999999");
    expect(noteOf("libre")).toBeNull();
    type("fecha", "2062-09-12");
    expect(noteOf("fecha")!.textContent).toContain("¿Año 2062? ¿Querías 2026?");
    expect(nb(btn("fecha", "fix").textContent)).toBe("Corregir a 12 sept 2026");
  });

  it("data-guard en el propio campo, también en campos que entran después", () => {
    const el = mount();
    const extra = document.createElement("input");
    extra.name = "lamina";
    extra.dataset.guard = '{"typical":[1,50]}';
    el.querySelector("form")!.append(extra);
    type("lamina", "500");
    expect(noteOf("lamina")!.textContent).toContain("¿Sobra un cero?");
    // Un data-guard mal escrito no rompe nada.
    const bad = document.createElement("input");
    bad.name = "mal";
    bad.dataset.guard = "{nope";
    el.querySelector("form")!.append(bad);
    expect(() => type("mal", "5")).not.toThrow();
    expect(noteOf("mal")).toBeNull();
  });

  it("expected desde otro elemento (#id): dígitos invertidos", () => {
    mount();
    type("total", "1.350.000");
    expect(nb(noteOf("total")!.textContent)).toContain("¿Invertiste dos dígitos? Esperado $ 1.530.000");
    btn("total", "fix").click();
    expect(field("total").value).toBe("1.530.000");
  });

  it("expected por nombre (@campo) en un input sin más configuración: es un número", () => {
    const el = mount();
    el.fields = { pagado: { expected: "@total" } };
    field("total").value = "1530000";
    const extra = document.createElement("input");
    extra.name = "pagado";
    el.querySelector("form")!.append(extra);
    type("pagado", "1580000");
    expect(noteOf("pagado")!.textContent).toContain("Difiere en un dígito de 1.530.000");
  });

  it("repetido: igual al último registrado", () => {
    mount();
    type("factura", "FC-8811");
    expect(noteOf("factura")!.textContent).toContain("Igual al último registrado");
    expect(noteOf("factura")!.querySelector("[data-act=fix]")).toBeNull();
  });

  it("un valor que cambió sin `change` (un script) se revisa al salir; salir sin cambiar, no", () => {
    mount();
    const input = field("cantidad");
    input.focus();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(noteOf("cantidad")).toBeNull();
    input.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    input.value = "900";
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(noteOf("cantidad")).not.toBeNull();
  });
});

describe("<nx-guard>: corregir y reconocer", () => {
  it("«Corregir» en un input nativo: valor, `input` y `change` para el framework, foco de vuelta, sin aviso", () => {
    const el = mount();
    const input = type("precio", "12000000");
    const seen: string[] = [];
    input.addEventListener("input", () => seen.push(`input:${input.value}`));
    input.addEventListener("change", () => seen.push(`change:${input.value}`));
    const fix = vi.fn();
    el.addEventListener("nx-guard-fix", (e) => fix(e.detail));
    btn("precio", "fix").click();
    expect(input.value).toBe("1.200.000");
    expect(seen).toEqual(["input:1.200.000", "change:1.200.000"]);
    expect(noteOf("precio")).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(fix).toHaveBeenCalledWith({ field: "precio", from: "12000000", to: 1_200_000 });
    expect(el.findings).toEqual([]);
  });

  it("«Corregir» en un <nx-number>: por su `value`, con `input`, `change` y `nx-change`", () => {
    const el = mount();
    const host = typeNumber("monto", "12.000.000");
    expect(host.value).toBe(12_000_000);
    expect(noteOf("monto")).not.toBeNull();
    // El aviso va después del <nx-number>, y la descripción en su <input> (además de las suyas).
    expect(noteOf("monto")!.previousElementSibling).toBe(host);
    const inner = host.querySelector("input")!;
    expect(inner.getAttribute("aria-describedby")!.split(" ")).toContain(noteOf("monto")!.id);
    expect(inner.getAttribute("aria-describedby")!.split(" ").length).toBe(4);
    const events: string[] = [];
    for (const t of ["input", "change", "nx-change"]) host.addEventListener(t, () => events.push(t));
    const fix = vi.fn();
    el.addEventListener("nx-guard-fix", (e) => fix(e.detail));
    btn("monto", "fix").click();
    expect(host.value).toBe(1_200_000);
    expect(events).toEqual(["input", "change", "nx-change"]);
    expect(fix).toHaveBeenCalledWith({ field: "monto", from: 12_000_000, to: 1_200_000 });
    expect(noteOf("monto")).toBeNull();
    expect(inner.getAttribute("aria-describedby")!.split(" ")).toHaveLength(3);
    expect(document.activeElement).toBe(inner);
  });

  it("<nx-number>: «1.500» queriendo 1,5 (lo tecleado delata el separador)", () => {
    mount();
    const host = typeNumber("peso", "1.500");
    expect(host.value).toBe(1500);
    expect(noteOf("peso")!.textContent).toContain("Se leyó 1.500. ¿Querías 1,5?");
    btn("peso", "fix").click();
    expect(host.value).toBe(1.5);
    // Una cuenta que da 1500 no es un separador confundido: es un 1.000 de más.
    typeNumber("peso", "=1.500*1");
    expect(host.value).toBe(1500);
    expect(noteOf("peso")!.textContent).toContain("1.000 veces lo habitual");
  });

  it("«Está bien» no vuelve a avisar por ese valor en ese campo (otro valor, sí)", () => {
    const el = mount();
    const ack = vi.fn();
    el.addEventListener("nx-guard-ack", (e) => ack(e.detail));
    const input = type("cantidad", "1000");
    btn("cantidad", "ack").click();
    expect(noteOf("cantidad")).toBeNull();
    expect(ack).toHaveBeenCalledWith({ field: "cantidad", value: "1000" });
    expect(document.activeElement).toBe(input);
    type("cantidad", "1000");
    expect(noteOf("cantidad")).toBeNull();
    expect(el.check("cantidad")).toEqual([]);
    type("cantidad", "5000");
    expect(noteOf("cantidad")).not.toBeNull();
    // El reconocido de antes sigue valiendo.
    type("cantidad", "1000");
    expect(noteOf("cantidad")).toBeNull();
  });

  it("los nodos del autor no se mueven: solo se insertan y se quitan los propios", () => {
    mount();
    const all = () => [...document.querySelector("form")!.querySelectorAll("*")].filter((n) => !n.closest(".nx-guard__note, .nx-guard__confirm") && !n.closest("nx-number"));
    const before = all().map((n) => [n, n.parentNode, n.previousSibling && !(n.previousSibling as Element).classList?.contains("nx-guard__note") ? n.previousSibling : "note"]);
    type("precio", "12000000");
    type("cantidad", "1000");
    typeNumber("monto", "12.000.000");
    expect(document.querySelectorAll(".nx-guard__note")).toHaveLength(3);
    const after = all();
    expect(after).toEqual(before.map((b) => b[0]));
    for (const [n, parent] of before) expect((n as Node).parentNode).toBe(parent);
    btn("precio", "fix").click();
    btn("cantidad", "ack").click();
    btn("monto", "fix").click();
    expect(document.querySelectorAll(".nx-guard__note")).toHaveLength(0);
    expect(all()).toEqual(before.map((b) => b[0]));
  });
});

describe("<nx-guard>: al enviar", () => {
  it("`warn` (por defecto) nunca bloquea", () => {
    mount();
    const sent = vi.fn((e: Event) => e.preventDefault());
    document.querySelector("form")!.addEventListener("submit", sent);
    type("precio", "12000000");
    submit();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".nx-guard__confirm")).toBeNull();
  });

  it("`confirm`: el primer envío con avisos se detiene, enfoca el primer aviso y dice cuántos; el segundo pasa", () => {
    const el = mount('mode="confirm"');
    const form = document.querySelector("form")!;
    const sent = vi.fn((e: Event) => e.preventDefault());
    form.addEventListener("submit", sent);
    const block = vi.fn();
    el.addEventListener("nx-guard-block", (e) => block(e.detail));
    // Un valor que nunca tuvo `change` (autollenado): se revisa al enviar.
    field("precio").value = "12000000";
    type("cantidad", "1000");
    const ev = submit();
    expect(ev.defaultPrevented).toBe(true);
    expect(sent).not.toHaveBeenCalled();
    expect(block).toHaveBeenCalledTimes(1);
    expect((block.mock.calls[0][0] as { findings: GuardFinding[] }).findings.map((f) => f.field)).toEqual(["precio", "cantidad"]);
    const line = document.querySelector(".nx-guard__confirm")!;
    expect(line.textContent).toBe("Revisa 2 valores inusuales o envía de todos modos");
    expect(line.nextElementSibling).toBe(form.querySelector(".acts"));
    expect(document.activeElement).toBe(noteOf("precio"));
    expect(live()).toBe("Revisa 2 valores inusuales o envía de todos modos");
    // Reconocer uno actualiza la cuenta.
    btn("cantidad", "ack").click();
    expect(line.textContent).toBe("Revisa 1 valor inusual o envía de todos modos");
    // Segundo envío: pasa, y la línea se va.
    submit();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".nx-guard__confirm")).toBeNull();
  });

  it("`confirm`: un aviso nuevo después de detenerlo vuelve a detener; sin avisos, pasa de una", () => {
    mount('mode="confirm"');
    const sent = vi.fn((e: Event) => e.preventDefault());
    document.querySelector("form")!.addEventListener("submit", sent);
    type("precio", "12000000");
    submit();
    type("cantidad", "1000");
    submit();
    expect(sent).not.toHaveBeenCalled();
    submit();
    expect(sent).toHaveBeenCalledTimes(1);
    btn("precio", "fix").click();
    btn("cantidad", "fix").click();
    submit();
    expect(sent).toHaveBeenCalledTimes(2);
  });

  it("`nx-guard-block` cancelado deja pasar el envío", () => {
    const el = mount('mode="confirm"');
    const sent = vi.fn((e: Event) => e.preventDefault());
    document.querySelector("form")!.addEventListener("submit", sent);
    el.addEventListener("nx-guard-block", (e) => e.preventDefault());
    type("precio", "12000000");
    submit();
    expect(sent).toHaveBeenCalledTimes(1);
  });
});

describe("<nx-guard>: chequeo remoto", () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  it("POST {field, value, values} tras una pausa; lo que dice el servidor va primero", async () => {
    const fetchMock = vi.fn(async () => ok({ findings: [{ field: "factura", kind: "duplicate", message: "Esta factura ya se registró el 12 sep (FC-8812)" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/api/guard"');
    type("factura", "FC-8812");
    expect(fetchMock).not.toHaveBeenCalled();
    await wait(350);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/guard");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ field: "factura", value: "FC-8812", values: { factura: "FC-8812", precio: "", peso: null } });
    await wait(0);
    expect(noteOf("factura")!.textContent).toContain("Esta factura ya se registró el 12 sep (FC-8812)");
    expect(live()).toBe("Factura: Esta factura ya se registró el 12 sep (FC-8812)");
    expect(el.findings).toEqual([{ field: "factura", kind: "duplicate", message: "Esta factura ya se registró el 12 sep (FC-8812)", severity: "warn" }]);
    // El mismo valor otra vez no vuelve a preguntar.
    type("factura", "FC-8812");
    await wait(350);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cambiar el valor cancela la pregunta anterior (pausa y AbortController)", async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((resolve, reject) => {
          signals.push(init.signal!);
          init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          if (signals.length > 1) resolve(ok({ findings: [] }));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount('endpoint="/api/guard"');
    type("factura", "FC-1");
    type("factura", "FC-2");
    await wait(350);
    // La pausa se llevó el primero: una sola pregunta.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    type("factura", "FC-3");
    expect(signals[0].aborted).toBe(true);
    await wait(350);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string).value).toBe("FC-3");
  });

  it("si el servidor falla, silencio (quedan los avisos locales)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    mount('endpoint="/api/guard"');
    type("factura", "FC-8811");
    await wait(360);
    expect(noteOf("factura")!.textContent).toContain("Igual al último registrado");
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    type("factura", "FC-9000");
    await wait(360);
    expect(noteOf("factura")).toBeNull();
  });

  it("un endpoint de otro origen no recibe nada; `remote: false` tampoco pregunta", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('endpoint="https://otro.example/guard"');
    type("factura", "FC-1");
    await wait(350);
    expect(fetchMock).not.toHaveBeenCalled();
    el.endpoint = "/api/guard";
    el.fields = { factura: { remote: false, repeat: true, history: [] } };
    type("factura", "FC-2");
    await wait(350);
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("<nx-guard>: API, textos y locale", () => {
  it("check(), findings y reset()", () => {
    const el = mount();
    field("precio").value = "12000000";
    field("cantidad").value = "1000";
    expect(el.check("precio").map((f) => f.kind)).toEqual(["magnitude"]);
    expect(noteOf("precio")).not.toBeNull();
    expect(noteOf("cantidad")).toBeNull();
    expect(el.check().map((f) => f.field)).toEqual(["precio", "cantidad"]);
    expect(el.findings).toHaveLength(2);
    el.reset();
    expect(el.findings).toEqual([]);
    expect(document.querySelectorAll(".nx-guard__note")).toHaveLength(0);
    expect(field("precio").getAttribute("aria-describedby")).toBe("ayuda");
  });

  it("labels (JSON) con sus plantillas", () => {
    mount(`labels='{"fix":"Usar {value}","ack":"Lo dejo así","extraZero":"¿Un 0 de más?"}'`);
    type("precio", "12000000");
    expect(nb(btn("precio", "fix").textContent)).toBe("Usar $ 1.200.000");
    expect(btn("precio", "ack").textContent).toBe("Lo dejo así");
    expect(noteOf("precio")!.textContent).toContain("¿Un 0 de más?");
  });

  it("fields como atributo JSON", () => {
    document.body.innerHTML = `<nx-guard fields='{"cantidad":{"typical":[1,50]}}'><input name="cantidad"></nx-guard>`;
    type("cantidad", "1000");
    expect(noteOf("cantidad")).not.toBeNull();
  });

  it("locale en-US: montos, lectura y corrección en inglés", () => {
    mount('locale="en-US"');
    type("precio", "12,000,000");
    expect(noteOf("precio")!.textContent).toContain("$12,000,000 es 10 veces lo habitual ($1,200,000)");
    expect(btn("precio", "fix").textContent).toBe("Corregir a $1,200,000");
    btn("precio", "fix").click();
    expect(field("precio").value).toBe("1,200,000");
  });

  it("disabled: no revisa, y al activarlo quita los avisos", () => {
    const el = mount();
    type("precio", "12000000");
    el.disabled = true;
    expect(noteOf("precio")).toBeNull();
    type("precio", "12000000");
    expect(noteOf("precio")).toBeNull();
    el.disabled = false;
    type("precio", "120000");
    expect(noteOf("precio")).not.toBeNull();
  });

  it("propiedades asignadas antes de definir el elemento (frameworks) se respetan", () => {
    document.body.innerHTML = "";
    const g = document.createElement("div");
    g.innerHTML = `<nx-guard><input name="cantidad"></nx-guard>`;
    const el = g.firstElementChild as NxGuard;
    el.fields = { cantidad: { typical: [1, 50] } };
    document.body.append(g);
    type("cantidad", "1000");
    expect(noteOf("cantidad")).not.toBeNull();
  });
});
