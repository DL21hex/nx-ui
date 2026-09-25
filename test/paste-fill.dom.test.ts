// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../src/components/paste-fill/index";
import type { NxPasteFill, PasteFillDoneDetail } from "../src/components/paste-fill/index";

beforeAll(() => {
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
const tick = () => new Promise((r) => setTimeout(r, 0));

const FORM = `
  <form id="prov">
    <label>Razón social <input name="razon_social"></label>
    <label for="f-nit">NIT *</label><input id="f-nit" name="nit">
    <label>Ciudad
      <select name="ciudad">
        <option value="">Selecciona…</option>
        <option value="08001">Barranquilla</option>
        <option value="11001">Bogotá D.C.</option>
        <option value="05001">Medellín</option>
      </select>
    </label>
    <input name="contacto" aria-label="Contacto">
    <input name="correo" type="email" placeholder="Correo">
    <input name="celular" type="tel" aria-labelledby="lbl-cel"><span id="lbl-cel">Celular</span>
    <label>Monto del primer pedido <input name="monto"></label>
    <label>Fecha de entrega <input name="entrega" type="date"></label>
    <input type="hidden" name="token" value="x">
    <input type="password" name="clave">
    <label><input type="checkbox" name="activo"> Activo</label>
    <input name="bloqueado" disabled>
    <input name="solo" readonly>
  </form>`;

const EMAIL = `Buenas tardes:

Les compartimos los datos de Aceros del Caribe S.A.S. para el registro.
NIT: 900.359.742-3
El primer pedido sería de $ 18.450.000, con entrega el 15/10/2026.

Atentamente,
Carolina Gómez Restrepo
Cel. 315 678 2341
cgomez@acerosdelcaribe.com.co · Barranquilla`;

function mount(attrs = "", body = FORM): NxPasteFill {
  document.body.innerHTML = `<nx-paste-fill ${attrs}>${body}</nx-paste-fill>`;
  const el = document.querySelector("nx-paste-fill")!;
  el.fields = [{ name: "monto", kind: "money" }];
  return el;
}
const input = (el: Element, name: string) => el.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const status = (el: Element) => el.querySelector(".nx-pf__msg")!.textContent;
const type = (field: HTMLInputElement, value: string) => {
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
};
function paste(target: Element, text: string): Event {
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: { getData: (t: string) => (t === "text/plain" ? text : "") } });
  target.dispatchEvent(ev);
  return ev;
}
const key = (target: Element, k: string, opts: KeyboardEventInit = {}) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...opts }));

describe("<nx-paste-fill>: campos", () => {
  it("lee los campos del formulario: etiqueta, tipo y opciones (sin los que no se llenan)", () => {
    const el = mount();
    const fields = el.fields;
    expect(fields.map((f) => f.name)).toEqual(["razon_social", "nit", "ciudad", "contacto", "correo", "celular", "monto", "entrega"]);
    expect(fields.map((f) => f.label)).toEqual(["Razón social", "NIT", "Ciudad", "Contacto", "Correo", "Celular", "Monto del primer pedido", "Fecha de entrega"]);
    expect(fields.find((f) => f.name === "ciudad")).toEqual({ name: "ciudad", label: "Ciudad", type: "select", options: [{ value: "08001", label: "Barranquilla" }, { value: "11001", label: "Bogotá D.C." }, { value: "05001", label: "Medellín" }] });
    expect(fields.find((f) => f.name === "correo")!.type).toBe("email");
    // `fields` asignado enriquece por name.
    expect(fields.find((f) => f.name === "monto")!.kind).toBe("money");
  });

  it("la zona para pegar va antes del formulario, sin moverlo; el atributo fields es JSON", () => {
    const el = mount(`fields='[{"name":"nit","label":"NIT del proveedor"}]'`);
    expect(el.firstElementChild!.classList.contains("nx-pf__bar")).toBe(true);
    expect(el.querySelector("form")!.parentElement).toBe(el);
    const zone = el.querySelector<HTMLTextAreaElement>(".nx-pf__input")!;
    expect(zone.getAttribute("aria-label")).toBe("Pega aquí un correo, un WhatsApp o un texto…");
    expect(el.querySelector(".nx-pf__hint")!.textContent).toMatch(/presiona (Ctrl|⌘)\+V sobre el formulario/);
    el.setAttribute("fields", '[{"name":"nit","label":"NIT del proveedor"}]');
    expect(el.fields.find((f) => f.name === "nit")!.label).toBe("NIT del proveedor");
  });
});

describe("<nx-paste-fill>: llenar", () => {
  it("fill() llena, avisa a los frameworks (input y change) y devuelve el detalle", async () => {
    const el = mount();
    const seen: string[] = [];
    el.addEventListener("input", (e) => seen.push(`input:${(e.target as HTMLInputElement).name}`));
    el.addEventListener("change", (e) => seen.push(`change:${(e.target as HTMLInputElement).name}`));
    const start = vi.fn();
    const done = vi.fn();
    el.addEventListener("nx-paste-fill-start", start);
    el.addEventListener("nx-paste-fill-done", done);
    const detail = (await el.fill(EMAIL))!;
    expect(input(el, "razon_social").value).toBe("Aceros del Caribe S.A.S.");
    expect(input(el, "nit").value).toBe("900.359.742-3");
    expect(el.querySelector<HTMLSelectElement>("[name=ciudad]")!.value).toBe("08001");
    expect(input(el, "contacto").value).toBe("Carolina Gómez Restrepo");
    expect(input(el, "correo").value).toBe("cgomez@acerosdelcaribe.com.co");
    expect(input(el, "celular").value).toBe("315 678 2341");
    expect(input(el, "monto").value).toBe("$ 18.450.000");
    expect(input(el, "entrega").value).toBe("2026-10-15");
    expect(seen).toContain("input:nit");
    expect(seen).toContain("change:ciudad");
    expect(start.mock.calls[0][0].detail.text).toBe(EMAIL);
    expect(done).toHaveBeenCalledOnce();
    expect(done.mock.calls[0][0].detail).toEqual(detail);
    expect(detail.values.nit).toBe("900.359.742-3");
    expect(detail.fields.find((f: { name: string }) => f.name === "nit")!.confidence).toBeGreaterThan(0.9);
    expect(el.state).toBe("filled");
    expect(status(el)).toBe("8 campos llenados");
    expect(el.querySelector<HTMLElement>(".nx-pf__zone")!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>(".nx-pf__status")!.hidden).toBe(false);
    expect(el.querySelector("[role=status]")!.textContent).toBe("8 campos llenados");
  });

  it("nx-paste-fill-start es cancelable: no toca nada", async () => {
    const el = mount();
    el.addEventListener("nx-paste-fill-start", (e) => e.preventDefault());
    expect(await el.fill(EMAIL)).toBeNull();
    expect(input(el, "nit").value).toBe("");
    expect(el.state).toBe("idle");
  });

  it("cada campo llenado lleva su marca, su color, su confianza y su descripción accesible", async () => {
    const el = mount();
    await el.fill(EMAIL);
    const nit = input(el, "nit");
    expect(nit.dataset.nxFill).toBe("high");
    const desc = document.getElementById(nit.getAttribute("aria-describedby")!)!;
    expect(desc.textContent).toBe("Llenado desde el texto pegado · Confianza 98 %");
    const ring = el.querySelector<HTMLElement>('.nx-pf__ring[data-name="nit"]')!;
    expect(ring.dataset.tier).toBe("high");
    expect(ring.textContent).toBe("98 %");
    expect(ring.style.getPropertyValue("--_h")).not.toBe("");
    expect(el.querySelector(".nx-pf__layer")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("un campo con aria-describedby propio lo conserva, y lo recupera al cerrar", async () => {
    const el = mount("", `<form><label>NIT <input name="nit" aria-describedby="ayuda"></label><p id="ayuda">Con DV</p></form>`);
    await el.fill("NIT 900.359.742-3");
    const nit = input(el, "nit");
    expect(nit.getAttribute("aria-describedby")).toMatch(/^ayuda nx-pf\d+-d-nit$/);
    el.clear();
    expect(nit.getAttribute("aria-describedby")).toBe("ayuda");
    expect(nit.hasAttribute("data-nx-fill")).toBe(false);
    expect(nit.value).toBe("900.359.742-3");
    expect(el.state).toBe("idle");
  });

  it("confianza baja: «Revisar» hasta que la persona confirma o corrige", async () => {
    const el = mount();
    await el.fill("Ferretería El Tornillo Ltda.\nNIT 800.123.456-1\nlrojas@eltornillo.com.co");
    const nit = input(el, "nit");
    expect(nit.dataset.nxFill).toBe("low");
    expect(el.pending).toEqual(["nit"]);
    const pill = el.querySelector<HTMLButtonElement>(".nx-pf__pill")!;
    expect(pill.hidden).toBe(false);
    expect(pill.textContent).toBe("1 por revisar");
    expect(document.getElementById(nit.getAttribute("aria-describedby")!)!.textContent).toContain("Revisar · El dígito de verificación no cuadra");
    // «1 por revisar» lleva al campo.
    pill.click();
    expect(document.activeElement).toBe(nit);
    // La fila de la evidencia tiene el aviso y «Confirmar».
    const row = el.querySelector<HTMLElement>('.nx-pf__list li[data-name="nit"]')!;
    expect(row.textContent).toContain("debería ser 5");
    row.querySelector<HTMLButtonElement>("[data-act=confirm]")!.click();
    expect(nit.dataset.nxFill).toBe("you");
    expect(el.pending).toEqual([]);
    expect(pill.hidden).toBe(true);
  });

  it("corregir un campo a mano también lo confirma", async () => {
    const el = mount();
    await el.fill("NIT 800.123.456-1");
    type(input(el, "nit"), "800.123.456-5");
    expect(input(el, "nit").dataset.nxFill).toBe("you");
    expect(el.pending).toEqual([]);
  });

  it("nunca pisa lo que la persona escribió: sugiere, con «Usar» / «Dejar el mío»", async () => {
    const el = mount();
    const correo = input(el, "correo");
    type(correo, "compras@otro.co");
    type(input(el, "contacto"), "Carolina Gómez Restrepo");
    const changes = vi.fn();
    correo.addEventListener("change", changes);
    await el.fill(EMAIL);
    expect(correo.value).toBe("compras@otro.co");
    expect(changes).not.toHaveBeenCalled();
    expect(correo.dataset.nxFill).toBe("suggest");
    // El mismo valor que ya tenía: se marca, no se toca.
    expect(input(el, "contacto").dataset.nxFill).toBe("same");
    expect(el.pending).toEqual(["correo"]);
    expect(el.querySelector('.nx-pf__ring[data-name="correo"]')!.textContent).toContain("Sugerencia: cgomez@acerosdelcaribe.com.co");
    const row = el.querySelector<HTMLElement>('.nx-pf__list li[data-name="correo"]')!;
    expect(row.textContent).toContain("Tienes «compras@otro.co»");
    row.querySelector<HTMLButtonElement>("[data-act=use]")!.click();
    expect(correo.value).toBe("cgomez@acerosdelcaribe.com.co");
    expect(changes).toHaveBeenCalledOnce();
    expect(correo.dataset.nxFill).toBe("you");
  });

  it("«Dejar el mío» quita la sugerencia y deja el valor", async () => {
    const el = mount();
    const correo = input(el, "correo");
    type(correo, "compras@otro.co");
    await el.fill(EMAIL);
    el.querySelector<HTMLButtonElement>('.nx-pf__ring[data-name="correo"] [data-act=keep]')!.click();
    expect(correo.value).toBe("compras@otro.co");
    expect(correo.hasAttribute("data-nx-fill")).toBe(false);
    expect(el.querySelector('.nx-pf__ring[data-name="correo"]')).toBeNull();
    expect(el.pending).toEqual([]);
  });

  it("un select que la persona cambió es suyo; uno que no tocó, no", async () => {
    const el = mount();
    const ciudad = el.querySelector<HTMLSelectElement>("[name=ciudad]")!;
    await el.fill("Estamos en Barranquilla");
    expect(ciudad.value).toBe("08001");
    el.clear();
    ciudad.value = "05001";
    ciudad.dispatchEvent(new Event("change", { bubbles: true }));
    await el.fill("Estamos en Bogotá D.C.");
    expect(ciudad.value).toBe("05001");
    expect(ciudad.dataset.nxFill).toBe("suggest");
  });

  it("texto sin nada que sirva: lo dice", async () => {
    const el = mount();
    const d = (await el.fill("hola, ¿cómo va todo?"))!;
    expect(d).toEqual({ values: {}, fields: [] });
    expect(status(el)).toBe("No encontré datos para este formulario");
  });
});

describe("<nx-paste-fill>: pegar, arrastrar y deshacer", () => {
  it("Ctrl+V fuera de un campo llena; dentro de un campo, pega en el campo", async () => {
    const el = mount();
    const inField = paste(input(el, "contacto"), EMAIL);
    expect(inField.defaultPrevented).toBe(false);
    expect(el.state).toBe("idle");
    const onForm = paste(el.querySelector("form")!, EMAIL);
    expect(onForm.defaultPrevented).toBe(true);
    await tick();
    expect(input(el, "nit").value).toBe("900.359.742-3");
  });

  it("pegar en la zona llena y la deja vacía; escribir muestra «Llenar» (y Ctrl+Enter también llena)", async () => {
    const el = mount();
    const zone = el.querySelector<HTMLTextAreaElement>(".nx-pf__input")!;
    const fillBtn = el.querySelector<HTMLButtonElement>("[data-act=fill]")!;
    expect(fillBtn.hidden).toBe(true);
    zone.value = "NIT 900.359.742-3";
    zone.dispatchEvent(new Event("input", { bubbles: true }));
    expect(fillBtn.hidden).toBe(false);
    key(zone, "Enter", { ctrlKey: true });
    await tick();
    expect(input(el, "nit").value).toBe("900.359.742-3");
    expect(zone.value).toBe("");
    el.clear();
    paste(zone, "Cel. 315 678 2341");
    await tick();
    expect(input(el, "celular").value).toBe("315 678 2341");
  });

  it("soltar texto encima del formulario llena", async () => {
    const el = mount();
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { types: ["text/plain"], getData: () => "NIT 900.359.742-3" } });
    el.querySelector("form")!.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    await tick();
    expect(input(el, "nit").value).toBe("900.359.742-3");
  });

  it("undo() devuelve los valores de antes (y avisa con input/change); lo que la persona cambió después se queda", async () => {
    const el = mount();
    type(input(el, "correo"), "");
    input(el, "razon_social").value = "";
    await el.fill(EMAIL);
    type(input(el, "contacto"), "Otra persona");
    const undo = vi.fn();
    el.addEventListener("nx-paste-fill-undo", undo);
    const changed: string[] = [];
    el.addEventListener("change", (e) => changed.push((e.target as HTMLInputElement).name));
    expect(el.undo()).toBe(true);
    expect(input(el, "nit").value).toBe("");
    expect(input(el, "razon_social").value).toBe("");
    expect(el.querySelector<HTMLSelectElement>("[name=ciudad]")!.value).toBe("");
    expect(input(el, "contacto").value).toBe("Otra persona");
    expect(changed).toContain("nit");
    expect(undo.mock.calls[0][0].detail.values).toMatchObject({ nit: "", razon_social: "" });
    expect(undo.mock.calls[0][0].detail.values).not.toHaveProperty("contacto");
    expect(el.state).toBe("idle");
    expect(input(el, "nit").hasAttribute("data-nx-fill")).toBe(false);
    expect(el.querySelector("[role=status]")!.textContent).toBe("Se devolvieron los valores anteriores");
    expect(el.undo()).toBe(false);
  });

  it("dos llenados se deshacen de a uno, y el anterior vuelve con sus marcas", async () => {
    const el = mount();
    await el.fill("NIT 900.359.742-3");
    await el.fill("NIT 890.903.938-8\nCel. 315 678 2341");
    expect(input(el, "nit").value).toBe("890.903.938-8");
    el.undo();
    expect(input(el, "nit").value).toBe("900.359.742-3");
    expect(input(el, "celular").value).toBe("");
    expect(el.state).toBe("filled");
    expect(el.text).toBe("NIT 900.359.742-3");
    expect(input(el, "nit").dataset.nxFill).toBe("high");
  });

  it("Ctrl+Z fuera de un campo deshace; dentro de un campo es del campo", async () => {
    const el = mount();
    await el.fill(EMAIL);
    key(input(el, "nit"), "z", { ctrlKey: true });
    expect(input(el, "nit").value).toBe("900.359.742-3");
    key(el.querySelector("form")!, "z", { ctrlKey: true });
    expect(input(el, "nit").value).toBe("");
  });

  it("el botón «Deshacer» y el de cerrar", async () => {
    const el = mount();
    await el.fill(EMAIL);
    el.querySelector<HTMLButtonElement>("[data-act=undo]")!.click();
    expect(input(el, "nit").value).toBe("");
    await el.fill(EMAIL);
    el.querySelector<HTMLButtonElement>("[data-act=close]")!.click();
    expect(input(el, "nit").value).toBe("900.359.742-3");
    expect(el.state).toBe("idle");
    expect(document.activeElement).toBe(el.querySelector(".nx-pf__input"));
  });
});

describe("<nx-paste-fill>: evidencia", () => {
  it("el texto con los tramos usados, cada uno del color de su campo; clic en un tramo enfoca el campo", async () => {
    const el = mount();
    await el.fill(EMAIL);
    const marks = [...el.querySelectorAll<HTMLElement>(".nx-pf__text mark")];
    expect(el.querySelector(".nx-pf__text")!.textContent).toBe(EMAIL);
    const nit = marks.find((m) => m.dataset.name === "nit")!;
    expect(nit.textContent).toBe("900.359.742-3");
    expect(nit.getAttribute("title")).toBe("NIT");
    expect(nit.style.getPropertyValue("--_h")).toBe(el.querySelector<HTMLElement>('.nx-pf__ring[data-name="nit"]')!.style.getPropertyValue("--_h"));
    nit.click();
    expect(document.activeElement).toBe(input(el, "nit"));
  });

  it("pasar por un campo ilumina su tramo y su fila (y al revés)", async () => {
    const el = mount();
    await el.fill(EMAIL);
    input(el, "correo").dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(el.querySelector('.nx-pf__text mark[data-name="correo"]')!.classList.contains("is-lit")).toBe(true);
    expect(el.querySelector('.nx-pf__list li[data-name="correo"]')!.classList.contains("is-lit")).toBe(true);
    input(el, "correo").dispatchEvent(new Event("pointerout", { bubbles: true }));
    expect(el.querySelector('.nx-pf__text mark[data-name="correo"]')!.classList.contains("is-lit")).toBe(false);
    el.querySelector('.nx-pf__text mark[data-name="nit"]')!.dispatchEvent(new Event("pointerover", { bubbles: true }));
    expect(el.querySelector('.nx-pf__ring[data-name="nit"]')!.classList.contains("is-lit")).toBe(true);
  });

  it("el panel se pliega y se despliega con «Evidencia» (aria-expanded)", async () => {
    const el = mount();
    await el.fill(EMAIL);
    const btn = el.querySelector<HTMLButtonElement>("[data-act=evidence]")!;
    const panel = el.querySelector<HTMLElement>(".nx-pf__panel")!;
    const open = panel.hidden;
    btn.click();
    expect(panel.hidden).toBe(!open);
    expect(btn.getAttribute("aria-expanded")).toBe(String(!panel.hidden));
    expect(btn.getAttribute("aria-controls")).toBe(panel.id);
    btn.click();
    expect(panel.hidden).toBe(open);
  });
});

describe("<nx-paste-fill>: servidor", () => {
  const stream = (lines: object[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        const text = lines.map((l) => JSON.stringify(l)).join("\n");
        // En dos trozos, partiendo una línea por la mitad.
        c.enqueue(new TextEncoder().encode(text.slice(0, 40)));
        c.enqueue(new TextEncoder().encode(`${text.slice(40)}\n`));
        c.close();
      },
    });

  it("POST {text, fields}; lo que manda el servidor gana; la nota va sobre la evidencia", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        stream([
          { type: "field", name: "contacto", value: "Carolina Gómez R.", confidence: 0.99, source: { start: 0, end: 5 } },
          { type: "field", name: "ciudad", value: "Bogotá D.C.", confidence: 0.7, hint: "Según el RUT" },
          { type: "field", name: "no_existe", value: "x" },
          { type: "note", message: "El proveedor ya existe en el maestro." },
          { type: "done" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/leer"');
    const done = new Promise<PasteFillDoneDetail>((r) => el.addEventListener("nx-paste-fill-done", (e) => r(e.detail), { once: true }));
    const p = el.fill(EMAIL);
    // Lo local ya está mientras el servidor responde.
    expect(input(el, "nit").value).toBe("900.359.742-3");
    expect(el.state).toBe("busy");
    expect(status(el)).toContain("Consultando al servidor…");
    await p;
    const detail = await done;
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/leer");
    const body = JSON.parse(String(init.body));
    expect(body.text).toBe(EMAIL);
    expect(body.fields.find((f: { name: string }) => f.name === "monto").kind).toBe("money");
    expect(input(el, "contacto").value).toBe("Carolina Gómez R.");
    // El servidor manda la etiqueta de la opción: se elige su valor.
    expect(el.querySelector<HTMLSelectElement>("[name=ciudad]")!.value).toBe("11001");
    expect(el.querySelector<HTMLSelectElement>("[name=ciudad]")!.dataset.nxFill).toBe("low");
    expect(detail.values.ciudad).toBe("11001");
    expect(el.querySelector(".nx-pf__notes")!.textContent).toBe("El proveedor ya existe en el maestro.");
    expect(el.state).toBe("filled");
    expect(status(el)).toBe("8 campos llenados");
    // Deshacer devuelve también lo del servidor.
    el.undo();
    expect(input(el, "contacto").value).toBe("");
    expect(el.querySelector<HTMLSelectElement>("[name=ciudad]")!.value).toBe("");
  });

  it("si el servidor falla, queda lo local y se avisa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 503 })));
    const el = mount('endpoint="/leer"');
    const done = vi.fn();
    el.addEventListener("nx-paste-fill-done", done);
    await el.fill(EMAIL);
    expect(input(el, "nit").value).toBe("900.359.742-3");
    expect(el.querySelector<HTMLElement>(".nx-pf__err")!.hidden).toBe(false);
    expect(el.querySelector(".nx-pf__err")!.textContent).toBe("No se pudo consultar el servidor; quedó lo que se leyó aquí.");
    expect(el.querySelector(".nx-pf__msg")!.getAttribute("data-tone")).toBe("warn");
    expect(done).toHaveBeenCalledOnce();
    expect(el.querySelector("[role=status]")!.textContent).toContain("No se pudo consultar el servidor");
  });

  it("un endpoint inseguro no se consulta", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="javascript:alert(1)"');
    await el.fill(EMAIL);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.state).toBe("filled");
  });
});

describe("<nx-paste-fill>: otras formas", () => {
  it("for: un formulario que está en otra parte de la página", async () => {
    document.body.innerHTML = `<nx-paste-fill for="lejos"></nx-paste-fill><form id="lejos"><label>NIT <input name="nit"></label></form>`;
    const el = document.querySelector("nx-paste-fill")!;
    expect(el.fields.map((f) => f.name)).toEqual(["nit"]);
    await el.fill("NIT 900.359.742-3");
    expect(document.querySelector<HTMLInputElement>("#lejos [name=nit]")!.value).toBe("900.359.742-3");
  });

  it("propiedades asignadas antes de registrar el elemento", async () => {
    const el = document.createElement("nx-paste-fill") as NxPasteFill;
    el.labels = { filled: "{n} listos" };
    el.innerHTML = `<label>NIT <input name="nit"></label><label>Cel <input name="cel" type="tel"></label>`;
    document.body.append(el);
    await el.fill("NIT 900.359.742-3, cel 315 678 2341");
    expect(status(el)).toBe("2 listos");
    expect(el.reviewBelow).toBe(0.8);
    el.reviewBelow = 0.99;
    expect(el.getAttribute("review-below")).toBe("0.99");
  });

  it("un texto de datos nunca se interpreta como HTML", async () => {
    const el = mount();
    await el.fill('Razón social: <img src=x onerror="alert(1)"> S.A.S.\nNIT 900.359.742-3');
    expect(el.querySelector(".nx-pf__panel img")).toBeNull();
    expect(el.querySelector(".nx-pf__text")!.textContent).toContain("<img");
  });
});
