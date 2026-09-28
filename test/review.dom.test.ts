// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/review/index";
import "../src/components/number/index";
import "../src/components/guard/index";
import "../src/components/select/index";
import { NxReview } from "../src/components/review/index";
import type { ReviewChange } from "../src/components/review/index";
import type { NxNumber } from "../src/components/number/index";
import type { NxGuard } from "../src/components/guard/index";
import type { NxSelect } from "../src/components/select/select";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});
/** Como `innerHTML` en un navegador: el árbol se arma aparte y entra entero (el elemento se conecta con sus hijos). */
function put(html: string) {
  const t = document.createElement("template");
  t.innerHTML = html;
  document.body.replaceChildren(t.content);
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nb = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");

const FORM = `
  <form id="f">
    <fieldset>
      <legend>Encabezado</legend>
      <label for="proveedor">Proveedor</label><input id="proveedor" name="proveedor" value="Aceros del Caribe">
      <label for="entrega">Fecha de entrega</label><input id="entrega" name="entrega" type="date" value="2026-10-12">
      <label for="estado">Estado</label>
      <select id="estado" name="estado"><option value="por" selected>Por aprobar</option><option value="ok">Aprobada</option></select>
      <label><input type="checkbox" name="iva" checked> Facturar con IVA</label>
    </fieldset>
    <fieldset>
      <legend>Condiciones</legend>
      <label for="precio">Precio unitario</label><input id="precio" name="precio" type="number" value="10000" data-format="money" data-currency="COP">
      <label for="obs">Observaciones</label><textarea id="obs" name="obs"></textarea>
      <input name="clave" type="password" value="x">
      <input name="interno" value="a" data-review="off">
      <input name="token" type="hidden" value="t1">
    </fieldset>
    <div class="acts"><button type="button" id="otro">Otro</button><button type="submit" id="send" name="accion" value="guardar">Guardar orden</button></div>
  </form>`;

function mount(attrs = "", body = FORM): { el: NxReview; form: HTMLFormElement; sent: SubmitEvent[] } {
  put(`<nx-review ${attrs}>${body}</nx-review>`);
  const el = document.querySelector("nx-review")!;
  const form = document.querySelector("form")!;
  const sent: SubmitEvent[] = [];
  // La app: guarda por su cuenta (sin navegar).
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sent.push(e as SubmitEvent);
  });
  return { el, form, sent };
}
const $ = <T extends Element = HTMLInputElement>(sel: string) => document.querySelector<T>(sel)!;
/** Escribe como una persona. */
function type(sel: string, value: string) {
  const el = $<HTMLInputElement>(sel);
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
const panel = () => document.querySelector<HTMLElement>(".nx-review");
const lines = () => [...document.querySelectorAll<HTMLElement>(".nx-review__list > li > .nx-review__line")].map((b) => nb(b.textContent));
const act = (a: "save" | "keep") => panel()!.querySelector<HTMLButtonElement>(`[data-act="${a}"]`)!.click();
const submit = (form = $<HTMLFormElement>("form"), by: HTMLElement | null = $("#send")) => form.requestSubmit(by ?? undefined);

describe("<nx-review>: la base y los cambios", () => {
  it("captura los valores al conectar; `changes` dice qué cambió, como se lee", () => {
    const { el } = mount();
    expect(el.changes).toEqual([]);
    expect(el.dirty).toBe(false);
    type("#precio", "12000");
    $<HTMLSelectElement>("#estado").value = "ok";
    $("[name=iva]").checked = false;
    type("#obs", "Entregar en portería");
    const ch = el.changes;
    expect(ch.map((c) => [c.field, c.label, c.section, nb(c.fromText), nb(c.toText)])).toEqual([
      ["estado", "Estado", "Encabezado", "Por aprobar", "Aprobada"],
      ["iva", "Facturar con IVA", "Encabezado", "Sí", "No"],
      ["precio", "Precio unitario", "Condiciones", "$ 10.000", "$ 12.000"],
      ["obs", "Observaciones", "Condiciones", "(vacío)", "“Entregar en portería”"],
    ]);
    expect(ch[2].delta?.text && nb(ch[2].delta.text)).toBe("+$ 2.000 · +20%");
    expect(ch.filter((c) => c.significant).map((c) => c.reason)).toEqual(["status", "amount"]);
    expect(el.dirty).toBe(true);
  });

  it("`data-review=\"off\"`, contraseñas y ocultos (salvo la clave de una fila) nunca aparecen", () => {
    const { el } = mount();
    $("[name=clave]").value = "otra";
    $("[name=interno]").value = "b";
    $("[name=token]").value = "t2";
    expect(el.changes).toEqual([]);
  });

  it("`snapshot()`: lo que hay ahora es la base (la app cargó el registro después)", () => {
    const { el } = mount();
    $("#proveedor").value = "Ferretería Central";
    expect(el.changes).toHaveLength(1);
    el.snapshot();
    expect(el.changes).toEqual([]);
    $("#proveedor").value = "Otro";
    expect(el.changes[0].fromText).toBe("“Ferretería Central”");
  });

  it("`initial` (JSON) es la base encima de lo que hay; filas anidadas incluidas", () => {
    const { el } = mount(`initial='{"proveedor": "Aceros S.A.", "precio": "9000"}'`);
    expect(el.changes.map((c) => [c.field, nb(c.fromText), nb(c.toText)])).toEqual([
      ["proveedor", "“Aceros S.A.”", "“Aceros del Caribe”"],
      ["precio", "$ 9.000", "$ 10.000"],
    ]);
    el.initial = { proveedor: "Aceros del Caribe", precio: 10000 };
    expect(el.changes).toEqual([]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    el.setAttribute("initial", "{no es json");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("initial"));
    expect(el.changes).toEqual([]);
  });

  it("`reset()` vuelve cada campo a la base (con eventos) y cierra el resumen", () => {
    const { el } = mount(`mode="always"`);
    type("#precio", "15000");
    $<HTMLSelectElement>("#estado").value = "ok";
    $("[name=iva]").checked = false;
    const changes = vi.fn();
    $("#precio").addEventListener("change", changes);
    submit();
    expect(panel()).not.toBeNull();
    el.reset();
    expect(panel()).toBeNull();
    expect([$("#precio").value, $<HTMLSelectElement>("#estado").value, $("[name=iva]").checked]).toEqual(["10000", "por", true]);
    expect(changes).toHaveBeenCalledTimes(1);
    expect(el.changes).toEqual([]);
  });
});

describe("<nx-review>: el envío", () => {
  it("intercepta el envío, muestra el resumen encima de la fila del botón y reenvía con el mismo botón", async () => {
    const { el, form, sent } = mount(`mode="always"`);
    const open = vi.fn((e: CustomEvent) => e.detail.changes.length);
    const confirm = vi.fn();
    el.addEventListener("nx-review-open", open as never);
    el.addEventListener("nx-review-confirm", confirm);
    type("#precio", "12000");
    type("#proveedor", "Aceros del Caribe S.A.S.");
    submit();
    expect(sent).toHaveLength(0);
    expect(open).toHaveReturnedWith(2);
    const p = panel()!;
    expect(p.nextElementSibling).toBe($(".acts"));
    expect(p.getAttribute("role")).toBe("region");
    const title = p.querySelector(".nx-review__title")!;
    expect(title.textContent).toBe("Vas a guardar 2 cambios");
    expect(title.getAttribute("aria-live")).toBe("polite");
    expect(document.activeElement).toBe(title);
    expect(p.getAttribute("aria-labelledby")).toBe(title.id);
    // Por sección y lo importante (el +20 %) primero, marcado con texto.
    expect(lines()).toEqual(["Precio unitarioimportante$ 10.000→ cambia a $ 12.000(+$ 2.000 · +20%)", "Proveedor“Aceros del Caribe”→ cambia a “Aceros del Caribe S.A.S.”"]);
    expect([...p.querySelectorAll(".nx-review__sec-title")].map((s) => s.textContent)).toEqual(["Condiciones", "Encabezado"]);
    act("save");
    expect(panel()).toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0].submitter).toBe($("#send"));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].detail.silent).toBe(false);
    expect((confirm.mock.calls[0][0].detail.changes as ReviewChange[]).map((c) => c.field)).toEqual(["proveedor", "precio"]);
    // La app, en su `submit`, todavía lee los cambios; después, la base es lo guardado.
    expect(el.changes).toHaveLength(2);
    await wait(5);
    expect(el.changes).toEqual([]);
    expect(el.dirty).toBe(false);
    void form;
  });

  it("dentro del <form> envolviendo solo un grupo: igual intercepta (el panel va en el formulario)", async () => {
    put(`<form><nx-review mode="always"><label>Cantidad <input name="qty" value="1"></label></nx-review>
      <input name="fuera" value="x"><p class="acts"><button id="send">Enviar</button></p></form>`);
    const form = $<HTMLFormElement>("form");
    const sent: SubmitEvent[] = [];
    form.addEventListener("submit", (e) => (e.preventDefault(), sent.push(e as SubmitEvent)));
    $("[name=fuera]").value = "y";
    submit(form);
    // Lo de afuera del review no cuenta: sin cambios, pasa.
    expect(sent).toHaveLength(1);
    type("[name=qty]", "3");
    submit(form);
    expect(sent).toHaveLength(1);
    expect(panel()!.parentElement).toBe(form);
    expect(panel()!.nextElementSibling).toBe($(".acts"));
    expect(lines()).toEqual(["Cantidad“1”→ cambia a “3”"]);
    act("save");
    expect(sent).toHaveLength(2);
    expect(sent[1].submitter).toBe($("#send"));
    // Al quitarlo, deja de oír el formulario.
    $("nx-review").remove();
    submit(form);
    expect(sent).toHaveLength(3);
  });

  it("`significant`: un cambio pequeño pasa (y avisa `confirm` silencioso); uno importante o muchos, se muestra", async () => {
    const { el, sent } = mount();
    const confirm = vi.fn();
    el.addEventListener("nx-review-confirm", confirm);
    type("#proveedor", "Otro proveedor");
    submit();
    expect(panel()).toBeNull();
    expect(sent).toHaveLength(1);
    expect(confirm.mock.calls[0][0].detail).toMatchObject({ silent: true });
    await wait(5);
    expect(el.changes).toEqual([]);
    // La fecha se movió 3 días: nada importante todavía.
    type("#entrega", "2026-10-15");
    submit();
    expect(sent).toHaveLength(2);
    await wait(5);
    type("#entrega", "2026-10-30");
    submit();
    expect(sent).toHaveLength(2);
    expect(lines()[0]).toContain("(+15 días)");
    act("keep");
    // Más de `max-silent` cambios.
    el.maxSilent = 1;
    type("#entrega", "2026-10-16");
    type("#proveedor", "Tercero");
    submit();
    expect(panel()).not.toBeNull();
  });

  it("`never`: el envío pasa siempre; `nx-review-open` cancelado envía directo", () => {
    const { el, sent } = mount(`mode="never"`);
    type("#precio", "50000");
    submit();
    expect([panel(), sent.length]).toEqual([null, 1]);
    el.mode = "always";
    el.addEventListener("nx-review-open", (e) => e.preventDefault(), { once: true });
    submit();
    expect([panel(), sent.length]).toEqual([null, 2]);
  });

  it("sin cambios: no interrumpe; con `empty=\"notice\"`, dice «No hay cambios que guardar» y no envía", async () => {
    const { el, sent } = mount(`mode="always"`);
    submit();
    expect(sent).toHaveLength(1);
    el.empty = "notice";
    submit();
    expect(sent).toHaveLength(1);
    const note = document.querySelector(".nx-review__none")!;
    expect([note.textContent, note.getAttribute("role"), note.nextElementSibling]).toEqual(["No hay cambios que guardar", "status", $(".acts")]);
    type("#proveedor", "x");
    expect(document.querySelector(".nx-review__none")).toBeNull();
  });

  it("Esc y «Seguir editando»: cierra, avisa `nx-review-cancel` y el foco va al primer campo cambiado", () => {
    const { el, sent } = mount(`mode="always"`);
    const cancel = vi.fn();
    el.addEventListener("nx-review-cancel", cancel);
    type("#obs", "Texto");
    type("#precio", "30000");
    submit();
    panel()!.querySelector(".nx-review__title")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(panel()).toBeNull();
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe($("#precio"));
    submit();
    act("keep");
    expect(cancel).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe($("#precio"));
    expect(sent).toHaveLength(0);
  });

  it("cada línea es un botón que lleva a su campo; un cambio mientras está abierto lo pone al día", async () => {
    mount(`mode="always"`);
    type("#obs", "Texto");
    type("#precio", "30000");
    submit();
    const b = [...panel()!.querySelectorAll<HTMLButtonElement>("button.nx-review__line")].find((x) => x.dataset.field === "obs")!;
    expect(b.type).toBe("button");
    b.click();
    expect(document.activeElement).toBe($("#obs"));
    type("#obs", "");
    await wait(250);
    expect(panel()!.querySelector(".nx-review__title")!.textContent).toBe("Vas a guardar 1 cambio");
    type("#precio", "10000");
    await wait(250);
    expect(panel()).toBeNull();
  });

  it("una validación que detiene el reenvío no cambia la base", async () => {
    const { el, sent } = mount(`mode="always"`);
    type("#precio", "30000");
    submit();
    $("#proveedor").required = true;
    $("#proveedor").value = "";
    act("save");
    expect(sent).toHaveLength(0);
    await wait(5);
    expect(el.changes.map((c) => c.field)).toEqual(["proveedor", "precio"]);
    // El siguiente envío vuelve a pasar por el resumen.
    $("#proveedor").value = "Aceros del Caribe";
    submit();
    expect(panel()).not.toBeNull();
  });

  it("`rebase=\"false\"`: después de guardar, la base no cambia", async () => {
    const { el } = mount(`mode="always" rebase="false"`);
    type("#precio", "30000");
    submit();
    act("save");
    await wait(5);
    expect(el.changes).toHaveLength(1);
  });
});

describe("<nx-review>: filas de detalle", () => {
  const ROWS = `
    <form>
      <table data-review-rows="lineas" data-label="Líneas de la orden">
        <thead><tr><th>Descripción</th><th>Cantidad</th><th>Precio</th></tr></thead>
        <tbody>
          <tr><td><input type="hidden" name="lineas[0].id" value="L1"><input name="lineas[0].desc" value="Lámina HR"></td><td><input name="lineas[0].qty" type="number" value="12"></td><td><input name="lineas[0].precio" type="number" value="1275000"></td></tr>
          <tr><td><input type="hidden" name="lineas[1].id" value="L2"><input name="lineas[1].desc" value="Ángulo"></td><td><input name="lineas[1].qty" type="number" value="40"></td><td><input name="lineas[1].precio" type="number" value="58000"></td></tr>
          <tr><td><input type="hidden" name="lineas[2].id" value="L3"><input name="lineas[2].desc" value="Tubo"></td><td><input name="lineas[2].qty" type="number" value="10"></td><td><input name="lineas[2].precio" type="number" value="85000"></td></tr>
        </tbody>
      </table>
      <p class="acts"><button id="send">Guardar</button></p>
    </form>`;
  const addRow = (i: number, desc: string, qty: number) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><input type="hidden" name="lineas[${i}].id" value=""><input name="lineas[${i}].desc" value="${desc}"></td><td><input name="lineas[${i}].qty" type="number" value="${qty}"></td><td><input name="lineas[${i}].precio" type="number" value="1000"></td>`;
    $("tbody").append(tr);
  };

  it("nuevas, quitadas y cambiadas, reconocidas por su `id`, con la etiqueta de la columna", () => {
    const { el } = mount(`mode="always"`, ROWS);
    document.querySelectorAll("tbody tr")[1].remove();
    type("[name='lineas[2].qty']", "15");
    addRow(3, "Platina", 20);
    addRow(4, "Varilla", 100);
    const [g] = el.changes;
    expect([g.kind, g.label, g.rows?.summary]).toEqual(["rows", "Líneas de la orden", "2 líneas nuevas · 1 quitada · 1 cambiada"]);
    expect(g.rows?.changed[0].changes?.map((c) => [c.label, c.fromText, c.toText])).toEqual([["Cantidad", "10", "15"]]);
    expect(nb(g.rows?.added[0].text)).toBe("Cantidad 20 · Precio 1.000");
    expect(g.rows?.removed[0].title).toBe("Línea 2 · Ángulo");
    submit();
    const rows = [...panel()!.querySelectorAll(".nx-review__row")].map((r) => [r.getAttribute("data-kind"), nb(r.querySelector(".nx-review__line")!.textContent)]);
    expect(rows).toEqual([
      ["added", "NuevaLínea 3 · PlatinaCantidad 20 · Precio 1.000"],
      ["added", "NuevaLínea 4 · VarillaCantidad 100 · Precio 1.000"],
      ["removed", "QuitadaLínea 2 · ÁnguloCantidad 40 · Precio 58.000"],
      ["changed", "CambiadaLínea 2 · Tuboimportante"],
    ]);
    // Una fila nueva lleva a su primer campo; la quitada no es un botón.
    panel()!.querySelector<HTMLButtonElement>(".nx-review__row[data-kind=added] button")!.click();
    expect(document.activeElement).toBe($("[name='lineas[3].desc']"));
    expect(panel()!.querySelector(".nx-review__row[data-kind=removed] button")).toBeNull();
    panel()!.querySelector<HTMLButtonElement>(".nx-review__cells button")!.click();
    expect(document.activeElement).toBe($("[name='lineas[2].qty']"));
  });

  it("`data-review-row` por fila (con su clave) y nombres repetidos", () => {
    put(`<nx-review><form><div data-review-rows="pagos" aria-label="Pagos">
      <div data-review-row="P1"><input name="monto[]" aria-label="Monto" value="100"></div>
      <div data-review-row="P2"><input name="monto[]" aria-label="Monto" value="200"></div>
    </div></form></nx-review>`);
    const el = $<NxReview>("nx-review");
    document.querySelector("[data-review-row=P1]")!.remove();
    $("[name='monto[]']").value = "250";
    const [g] = el.changes;
    expect([g.label, g.rows?.summary]).toEqual(["Pagos", "1 quitada · 1 cambiada"]);
    expect(g.rows?.changed[0].changes?.[0].label).toBe("Monto");
  });

  it("filas agregadas avisan `dirty` sin que nadie escriba (MutationObserver)", async () => {
    const { el } = mount("", ROWS);
    const dirty = vi.fn();
    el.addEventListener("nx-review-dirty", dirty);
    // Lo que entra en el mismo turno en que se conectó es parte de la base; después, es una fila nueva.
    addRow(3, "Platina", 20);
    await wait(0);
    expect(el.changes).toEqual([]);
    addRow(4, "Varilla", 100);
    await wait(250);
    expect(dirty).toHaveBeenCalledTimes(1);
    expect(dirty.mock.calls[0][0].detail).toEqual({ dirty: true, count: 1 });
  });
});

describe("<nx-review>: componentes reales", () => {
  it("<nx-number>: el monto con su formato y moneda; la línea enfoca su campo de texto", () => {
    const { el } = mount(
      `mode="always"`,
      `<form><label for="p">Precio unitario</label><nx-number id="p" name="precio" format="money" currency="COP" value="10000"></nx-number><p class="acts"><button id="send">Guardar</button></p></form>`,
    );
    ($("#p") as unknown as NxNumber).value = 12500;
    const [c] = el.changes;
    expect([c.label, c.kind, nb(c.fromText), nb(c.toText), nb(c.delta?.text)]).toEqual(["Precio unitario", "money", "$ 10.000", "$ 12.500", "+$ 2.500 · +25%"]);
    submit();
    panel()!.querySelector<HTMLButtonElement>("[data-field=precio]")!.click();
    expect(document.activeElement).toBe($("#p input"));
  });

  it("<nx-guard> adentro: sus avisos aparecen en el resumen y lo abren en `significant`", () => {
    const { el, sent } = mount(
      "",
      `<nx-guard><form><label for="precio">Precio unitario</label><nx-number id="precio" name="precio" format="money" currency="COP" value="1200000"></nx-number>
        <p class="acts"><button id="send">Guardar</button></p></form></nx-guard>`,
    );
    const guard = $<NxGuard>("nx-guard");
    guard.fields = { precio: { history: [11800, 12100, 11950, 12400, 12250] } };
    ($("#precio") as unknown as NxNumber).value = 1250000;
    expect(guard.check().length).toBeGreaterThan(0);
    // +4 %: no es importante por el monto, pero guard avisa.
    submit();
    expect(sent).toHaveLength(0);
    const warn = panel()!.querySelector<HTMLButtonElement>(".nx-review__warn")!;
    expect(nb(warn.textContent)).toMatch(/^Aviso: Precio unitario: .*veces lo habitual/);
    expect(el.changes[0]).toMatchObject({ significant: true, reason: "guard" });
    warn.click();
    expect(document.activeElement).toBe($("#precio input"));
  });

  it("<nx-select>: por la etiqueta de la opción (su primera columna)", () => {
    const { el } = mount(
      "",
      `<form><label for="e">Estado</label><nx-select id="e" name="estado" value="por"></nx-select><button id="send">Ok</button></form>`,
    );
    const sel = $<NxSelect>("#e");
    sel.options = [
      { value: "por", label: "Por aprobar" },
      { value: "ok", label: "Aprobada" },
    ];
    el.snapshot();
    sel.value = "ok";
    expect(el.changes.map((c) => [c.label, c.kind, c.fromText, c.toText, c.reason])).toEqual([["Estado", "choice", "Por aprobar", "Aprobada", "status"]]);
  });

  it("<nx-guard> alrededor también cuenta", () => {
    put(`<nx-guard><nx-review><form><input name="qty" value="10"><button id="send">Ok</button></form></nx-review></nx-guard>`);
    const guard = $<NxGuard>("nx-guard");
    guard.fields = { qty: { history: [10, 12, 8, 12, 14, 10, 12] } };
    $("[name=qty]").value = "1200";
    guard.check();
    $("form").addEventListener("submit", (e) => e.preventDefault());
    submit();
    expect(panel()!.querySelector(".nx-review__warn")).not.toBeNull();
  });
});

describe("<nx-review>: sin formulario, `dirty` y lo demás", () => {
  it("`review()` sin formulario: `true` al guardar, `false` al seguir editando; sin cambios, `true`", async () => {
    put(`<nx-review mode="never"><label>Nombre <input name="nombre" value="Ana"></label><div class="acts"><button id="guardar" type="button">Guardar</button></div></nx-review>`);
    const el = $<NxReview>("nx-review");
    expect(await el.review()).toBe(true);
    $("[name=nombre]").value = "Ana María";
    $("#guardar").focus();
    const confirm = vi.fn();
    el.addEventListener("nx-review-confirm", confirm);
    const p = el.review();
    expect(panel()!.nextElementSibling).toBe($(".acts"));
    act("save");
    expect(await p).toBe(true);
    expect(confirm.mock.calls[0][0].detail.silent).toBe(false);
    await wait(5);
    expect(el.changes).toEqual([]);
    $("[name=nombre]").value = "Ana Lucía";
    const q = el.review();
    act("keep");
    expect(await q).toBe(false);
    expect(document.activeElement).toBe($("[name=nombre]"));
    el.snapshot();
    el.empty = "notice";
    expect(await el.review()).toBe(false);
    expect(document.querySelector(".nx-review__none")?.textContent).toBe("No hay cambios que guardar");
  });

  it("`dirty` y `nx-review-dirty` {dirty, count} con pausa; volver al valor original lo apaga", async () => {
    const { el } = mount();
    const dirty = vi.fn();
    el.addEventListener("nx-review-dirty", dirty);
    type("#proveedor", "A");
    type("#proveedor", "AB");
    expect(dirty).not.toHaveBeenCalled();
    await wait(250);
    expect(dirty.mock.calls.map((c) => c[0].detail)).toEqual([{ dirty: true, count: 1 }]);
    type("#precio", "11000");
    await wait(250);
    type("#proveedor", "Aceros del Caribe");
    type("#precio", "10000");
    await wait(250);
    expect(dirty.mock.calls.map((c) => c[0].detail)).toEqual([
      { dirty: true, count: 1 },
      { dirty: true, count: 2 },
      { dirty: false, count: 0 },
    ]);
    // Buscar dentro de un componente (`data-nx-ephemeral`) no cuenta como escribir.
    const spy = vi.spyOn(el, "dirty", "get");
    const q = document.createElement("input");
    q.dataset.nxEphemeral = "";
    el.querySelector("form")!.append(q);
    q.dispatchEvent(new Event("input", { bubbles: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("radios y casillas del mismo nombre, selects múltiples y un componente con `value`", () => {
    const { el } = mount(
      `mode="always"`,
      `<form>
        <fieldset><legend>Condición de pago</legend>
          <label><input type="radio" name="pago" value="contado" checked> Contado</label>
          <label><input type="radio" name="pago" value="30"> Crédito 30 días</label>
        </fieldset>
        <fieldset><legend>Entregas</legend>
          <label><input type="checkbox" name="dias" value="lu" checked> Lunes</label>
          <label><input type="checkbox" name="dias" value="mi"> Miércoles</label>
        </fieldset>
        <label for="cc">Centros de costo</label><select id="cc" name="cc" multiple><option value="a" selected>Planta</option><option value="b">Bodega</option></select>
        <x-rating name="nota" value="3" data-label="Calificación"></x-rating>
        <button id="send">Ok</button>
      </form>`,
    );
    $<HTMLInputElement>("[value='30']").checked = true;
    $<HTMLInputElement>("[value='mi']").checked = true;
    $<HTMLSelectElement>("#cc").options[1].selected = true;
    $("x-rating").setAttribute("value", "5");
    expect(el.changes.map((c) => [c.label, c.section, c.fromText, c.toText])).toEqual([
      ["Condición de pago", undefined, "Contado", "Crédito 30 días"],
      ["Entregas", undefined, "Lunes", "Lunes, Miércoles"],
      ["Centros de costo", undefined, "Planta", "Planta, Bodega"],
      ["Calificación", undefined, "“3”", "“5”"],
    ]);
  });

  it("`locale` como propiedad (BDUI) cambia el formato", () => {
    const { el } = mount();
    type("#precio", "12500");
    el.locale = "en-US";
    expect([el.locale, el.getAttribute("locale"), nb(el.changes[0].toText)]).toEqual(["en-US", "en-US", "$12,500"]);
    el.locale = null;
    expect(el.locale).toBe("es-CO");
  });

  it("labels (propiedad y atributo), locale en-US y atributos JSON inválidos", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { el } = mount(`mode="always" lang="en-US" labels='{"title": "You are saving 1 change|You are saving {n} changes", "save": "Save", "keep": 5}'`);
    type("#precio", "12500");
    submit();
    expect(panel()!.querySelector(".nx-review__title")!.textContent).toBe("You are saving 1 change");
    expect(panel()!.querySelector("[data-act=save]")!.textContent).toBe("Save");
    expect(panel()!.querySelector("[data-act=keep]")!.textContent).toBe("Seguir editando");
    expect(nb(el.changes[0].toText)).toBe("$12,500");
    el.setAttribute("labels", "{roto");
    expect(warn).toHaveBeenCalled();
    expect(el.labels.save).toBe("Save");
  });

  it("props puestas antes de registrar el elemento", () => {
    const el = document.createElement("nx-review-tarde") as NxReview;
    (el as unknown as Record<string, unknown>).labels = { save: "Registrar" };
    (el as unknown as Record<string, unknown>).initial = { nombre: "Ana" };
    (el as unknown as Record<string, unknown>).mode = "always";
    el.innerHTML = `<form><input name="nombre" value="Ana María"><button id="send">Ok</button></form>`;
    document.body.append(el);
    customElements.define("nx-review-tarde", class extends NxReview {});
    expect(el.getAttribute("mode")).toBe("always");
    expect(el.labels.save).toBe("Registrar");
    expect(el.changes.map((c) => c.toText)).toEqual(["“Ana María”"]);
  });

  it("valores por defecto y normalización", () => {
    const el = document.createElement("nx-review");
    expect([el.mode, el.threshold, el.maxSilent, el.empty, el.rebase, el.disabled]).toEqual(["significant", 20, 5, "", true, false]);
    el.setAttribute("mode", "a veces");
    el.setAttribute("threshold", "35%");
    el.setAttribute("max-silent", "-2");
    expect([el.mode, el.threshold, el.maxSilent]).toEqual(["significant", 35, 5]);
  });

  it("`disabled`: no intercepta ni muestra nada", async () => {
    const { el, sent } = mount(`mode="always" disabled`);
    type("#precio", "90000");
    submit();
    expect([panel(), sent.length]).toEqual([null, 1]);
    expect(await el.review()).toBe(true);
  });

  it("desconectar: cierra el resumen, resuelve `review()` en `false` y limpia pausas y oyentes", async () => {
    const { el } = mount(`mode="always"`);
    type("#precio", "90000");
    const dirty = vi.fn();
    el.addEventListener("nx-review-dirty", dirty);
    const p = el.review();
    el.remove();
    expect(await p).toBe(false);
    expect(panel()).toBeNull();
    await wait(250);
    expect(dirty).not.toHaveBeenCalled();
  });

  it("con el <script> en el <head>: la base se toma al terminar de cargar", () => {
    const el = document.createElement("nx-review") as NxReview;
    const state = vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    document.body.append(el);
    el.innerHTML = `<input name="a" value="1">`;
    state.mockRestore();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(el.changes).toEqual([]);
    ($("[name=a]") as HTMLInputElement).value = "2";
    expect(el.changes[0].fromText).toBe("“1”");
  });
});
