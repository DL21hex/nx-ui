// @vitest-environment happy-dom
//
// happy-dom no tiene canvas 2D, layout ni ElementInternals: los trazos se prueban con PointerEvents
// simulados (el canvas mide 0×0 en la página, así que las coordenadas son las de `clientX/Y`), y el
// <form> con un ElementInternals de mentira que guarda lo que recibe.
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SIGNATURE_LABELS, type NxSignature, type SignatureDoneDetail } from "../src/components/signature/index";
import { signatureSVG } from "../src/components/signature/logic";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => unknown, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`no se cumplió: ${check}`);
    await sleep(5);
  }
}

function mount(attrs = "", extra = ""): NxSignature {
  document.body.innerHTML = `<nx-signature ${attrs}></nx-signature>${extra}`;
  return document.querySelector("nx-signature")!;
}
const $ = <T extends Element = HTMLElement>(el: Element, sel: string) => el.querySelector<T>(sel)!;
const button = (el: Element, a: string) => $<HTMLButtonElement>(el, `[data-a="${a}"]`);
const inputs = (el: Element) => [...el.querySelectorAll("input")];

type Opts = { id?: number; type?: string; pressure?: number; coalesced?: number };
/** Un trazo sobre el canvas: una onda de `n` puntos a lo ancho (una firma de verdad). */
function draw(el: Element, n = 50, o: Opts = {}, x0 = 20) {
  const c = $(el, "canvas");
  const ev = (type: string, i: number) => {
    const init = { pointerId: o.id ?? 1, pointerType: o.type ?? "mouse", pressure: o.pressure ?? 0.5, clientX: x0 + i * 5, clientY: 60 + Math.sin(i / 3) * 20, bubbles: true, cancelable: true };
    const e = new PointerEvent(type, init);
    if (o.coalesced && type === "pointermove") {
      const list = Array.from({ length: o.coalesced }, (_, k) => new PointerEvent(type, { ...init, clientX: init.clientX + k }));
      Object.defineProperty(e, "getCoalescedEvents", { value: () => list });
    }
    c.dispatchEvent(e);
  };
  ev("pointerdown", 0);
  for (let i = 1; i < n; i++) ev("pointermove", i);
  ev("pointerup", n);
}
/** Un toque: un punto. */
function dot(el: Element) {
  draw(el, 1);
}
function track(el: NxSignature) {
  const changes: boolean[] = [];
  const done: SignatureDoneDetail[] = [];
  el.addEventListener("nx-signature-change", (e) => changes.push(e.detail.empty));
  el.addEventListener("nx-signature-done", (e) => done.push(e.detail));
  return { changes, done };
}

/** happy-dom no tiene ElementInternals: uno de mentira que guarda lo que va al <form>. */
function withInternals(attrs = "", extra = "") {
  const sent: unknown[] = [];
  const validity: { flags: ValidityStateFlags; message?: string; anchor?: HTMLElement }[] = [];
  const fake = {
    setFormValue: (v: unknown) => sent.push(v),
    setValidity: (flags: ValidityStateFlags, message?: string, anchor?: HTMLElement) => validity.push({ flags, message, anchor }),
    checkValidity: () => !Object.values(validity.at(-1)?.flags ?? {}).some(Boolean),
    form: null,
  };
  const orig = HTMLElement.prototype.attachInternals;
  HTMLElement.prototype.attachInternals = () => fake as unknown as ElementInternals;
  try {
    return { el: mount(attrs, extra), sent, validity };
  } finally {
    HTMLElement.prototype.attachInternals = orig;
  }
}

describe("<nx-signature>: la zona y los trazos", () => {
  it("en reposo: zona de firma con role=img y la etiqueta de vacía, «×» y «Firme aquí», botones", () => {
    const el = mount();
    const c = $(el, "canvas");
    expect(c.getAttribute("role")).toBe("img");
    expect(c.getAttribute("aria-label")).toBe(SIGNATURE_LABELS.pad);
    expect($(el, ".nx-sig__line").textContent).toBe(`×${SIGNATURE_LABELS.here}`);
    expect($(el, ".nx-sig__line").getAttribute("aria-hidden")).toBe("true");
    expect(button(el, "undo").textContent).toBe("Deshacer");
    expect(button(el, "confirm").textContent).toBe("Firmar");
    expect(button(el, "type").textContent).toBe("Escribir mi nombre");
    expect([button(el, "undo").disabled, button(el, "clear").disabled, button(el, "confirm").disabled]).toEqual([true, true, true]);
    // Sin `handoff` ni un <nx-handoff> que apunte aquí, no hay «Firmar en el celular».
    expect(button(el, "phone").hidden).toBe(true);
    // Sin ask-name ni ask-id, no hay campos.
    expect($(el, ".nx-sig__fields").hidden).toBe(true);
    expect($(el, ".nx-sig__pad").style.height).toBe("180px");
    expect(el.isEmpty()).toBe(true);
    expect(el.value).toBeNull();
    expect(el.toSVG()).toBe("");
  });

  it("un trazo con PointerEvents: puntos (x, y, t, presión), el SVG con un <path>, `nx-signature-change`", () => {
    const el = mount();
    const t = track(el);
    draw(el, 30, { type: "pen", pressure: 0.8 });
    expect(el.strokes).toHaveLength(1);
    const s = el.strokes[0];
    expect(s.type).toBe("pen");
    expect(s.points).toHaveLength(30);
    expect(s.points[0]).toMatchObject({ x: 20, y: 60, p: 0.8 });
    expect(typeof s.points[0].t).toBe("number");
    expect(t.changes).toEqual([false]);
    expect($(el, "canvas").getAttribute("aria-label")).toBe(SIGNATURE_LABELS.padSigned);
    expect(el.toSVG()).toBe(signatureSVG(el.strokes as never));
    expect(el.toSVG().match(/<path /g)).toHaveLength(1);
    expect(el.value!.meta).toMatchObject({ strokes: 1, points: 30, device: "pen", typed: false });
    expect(button(el, "undo").disabled).toBe(false);
  });

  it("toma los eventos coalescidos (todos los puntos que el navegador juntó en un frame)", () => {
    const el = mount();
    draw(el, 5, { coalesced: 3 });
    // pointerdown (1) + 4 pointermove × 3 coalescidos.
    expect(el.strokes[0].points).toHaveLength(13);
  });

  it("otro dedo mientras se firma y el botón derecho no dibujan; el mouse guarda presión 0,5", () => {
    const el = mount();
    const c = $(el, "canvas");
    c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, clientX: 5, clientY: 5, bubbles: true }));
    expect(el.strokes).toHaveLength(0);
    c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, pointerType: "touch", clientX: 5, clientY: 5, bubbles: true }));
    c.dispatchEvent(new PointerEvent("pointermove", { pointerId: 2, pointerType: "touch", clientX: 50, clientY: 50, bubbles: true }));
    c.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, pointerType: "touch", clientX: 9, clientY: 9, bubbles: true }));
    c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, pointerType: "touch", bubbles: true }));
    expect(el.strokes).toHaveLength(0);
    c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "touch", bubbles: true }));
    expect(el.strokes).toHaveLength(1);
    expect(el.strokes[0].points).toHaveLength(1);
    draw(el, 3, { type: "mouse", pressure: 0 });
    expect(el.strokes[1].points[0].p).toBe(0.5);
  });

  it("deshacer (botón y Ctrl/⌘+Z) quita el último trazo; borrar quita todo", () => {
    const el = mount();
    const t = track(el);
    draw(el, 20);
    draw(el, 20, {}, 200);
    draw(el, 20, {}, 400);
    expect(el.strokes).toHaveLength(3);
    button(el, "undo").click();
    expect(el.strokes).toHaveLength(2);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(el.strokes).toHaveLength(1);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Z", metaKey: true, bubbles: true }));
    expect(el.strokes).toHaveLength(0);
    // Ctrl+Z dentro de un campo de texto es del campo.
    el.askName = true;
    draw(el, 20);
    inputs(el)[0].dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(el.strokes).toHaveLength(1);
    draw(el, 20, {}, 200);
    button(el, "clear").click();
    expect(el.isEmpty()).toBe(true);
    expect(t.changes.at(-1)).toBe(true);
    el.undo(); // sin trazos no hace nada
    expect(el.strokes).toHaveLength(0);
  });
});

describe("<nx-signature>: confirmar", () => {
  it("un punto no es una firma: «Firmar» lo dice y no confirma", async () => {
    const el = mount();
    const t = track(el);
    dot(el);
    button(el, "confirm").click();
    await sleep(0);
    expect($(el, ".nx-sig__msg").textContent).toBe(SIGNATURE_LABELS.short);
    expect(t.done).toEqual([]);
    // Seguir firmando borra el aviso.
    draw(el, 50, {}, 100);
    expect($(el, ".nx-sig__msg").textContent).toBe("");
  });

  it("«Firmar» congela, pone la fecha en el locale y emite `nx-signature-done`; «Volver a firmar» la reabre", async () => {
    const el = mount('locale="es-CO"');
    const t = track(el);
    draw(el);
    button(el, "confirm").focus();
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    const { svg, meta } = t.done[0];
    expect(svg).toBe(el.toSVG());
    expect(meta).toMatchObject({ typed: false, strokes: 1, points: 50, device: "mouse" });
    expect(new Date(meta.signedAt).toISOString()).toBe(meta.signedAt);
    expect(meta.width).toBeGreaterThan(200);
    expect(meta.hash).toBeUndefined();
    // Congelada: sin barra, con el sello, y el foco en «Volver a firmar».
    expect($(el, ".nx-sig__bar").hidden).toBe(true);
    const stamp = $(el, ".nx-sig__stamp");
    expect(stamp.hidden).toBe(false);
    expect(stamp.firstElementChild!.textContent).toMatch(/^Firmado el \d{1,2} \S+ 2026, \d{1,2}:\d{2}\s[ap]\. m\.$/);
    expect(document.activeElement).toBe(button(el, "again"));
    // Ya no se dibuja encima.
    draw(el, 20, {}, 300);
    expect(el.strokes).toHaveLength(1);
    expect(el.value!.meta).toEqual(meta);
    button(el, "again").click();
    expect(el.isEmpty()).toBe(true);
    expect($(el, ".nx-sig__bar").hidden).toBe(false);
    expect(stamp.hidden).toBe(true);
    expect(document.activeElement).toBe(button(el, "type"));
  });

  it("`auto`: sin botón; la firma se da por hecha un momento después del último trazo (sin congelar)", async () => {
    vi.useFakeTimers();
    const el = mount("auto");
    const t = track(el);
    expect(button(el, "confirm").hidden).toBe(true);
    draw(el);
    await vi.advanceTimersByTimeAsync(500);
    draw(el, 20, {}, 300);
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.done).toHaveLength(1);
    expect(t.done[0].meta.strokes).toBe(2);
    expect($(el, ".nx-sig__bar").hidden).toBe(false);
    // Un punto solo no se da por firma.
    el.clear();
    dot(el);
    await vi.advanceTimersByTimeAsync(2000);
    expect(t.done).toHaveLength(1);
  });

  it("con `document` (id de un elemento), la huella SHA-256 del texto normalizado + la fecha", async () => {
    const el = mount('document="remision"', '<article id="remision">  Remisión REM-3391\n\n  6 ítems  </article>');
    const t = track(el);
    draw(el);
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    const { meta } = t.done[0];
    const want = createHash("sha256").update(`Remisión REM-3391 6 ítems\n${meta.signedAt}`, "utf8").digest("hex");
    expect(meta.hash).toBe(want);
    // `document` también puede ser el texto mismo.
    el.document = "Acta 12";
    button(el, "again").click();
    draw(el);
    button(el, "confirm").click();
    await until(() => t.done.length === 2);
    expect(t.done[1].meta.hash).toBe(createHash("sha256").update(`Acta 12\n${t.done[1].meta.signedAt}`).digest("hex"));
  });

  it("`geo`: pide la ubicación una vez al empezar; si la niegan, firma igual sin ella", async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail?: PositionErrorCallback | null, _opts?: PositionOptions) => fail?.({ code: 1 } as GeolocationPositionError));
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    const el = mount("geo");
    const t = track(el);
    draw(el);
    draw(el, 20, {}, 300);
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ timeout: 6000 });
    expect(t.done[0].meta.geo).toBeUndefined();
  });

  it("`geo` permitida: la ubicación queda en los metadatos", async () => {
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { latitude: 10.97, longitude: -74.8, accuracy: 12.4 } } as GeolocationPosition));
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
    const el = mount("geo");
    const t = track(el);
    draw(el);
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    expect(t.done[0].meta.geo).toEqual({ lat: 10.97, lng: -74.8, accuracy: 12 });
  });

  it("sin navigator.geolocation (o un navegador que lanza): sigue sin ubicación", async () => {
    vi.stubGlobal("navigator", { ...navigator, geolocation: undefined });
    const el = mount("geo");
    const t = track(el);
    draw(el);
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    expect(t.done[0].meta.geo).toBeUndefined();
  });
});

describe("<nx-signature>: nombre, cédula y firma escrita", () => {
  it("`ask-name` y `ask-id` muestran los campos; con `required` hacen falta para firmar", async () => {
    const el = mount("ask-name ask-id required");
    const t = track(el);
    expect($(el, ".nx-sig__fields").hidden).toBe(false);
    expect([...el.querySelectorAll(".nx-sig__fields span")].map((s) => s.textContent)).toEqual([SIGNATURE_LABELS.name, SIGNATURE_LABELS.id]);
    const [name, id] = inputs(el);
    expect([name.required, id.required, name.autocomplete]).toEqual([true, true, "name"]);
    draw(el);
    button(el, "confirm").click();
    await sleep(0);
    expect($(el, ".nx-sig__msg").textContent).toBe(SIGNATURE_LABELS.nameRequired);
    name.value = "  Luz Mery Ortiz ";
    name.dispatchEvent(new Event("input"));
    expect($(el, ".nx-sig__msg").textContent).toBe("");
    button(el, "confirm").click();
    await sleep(0);
    expect($(el, ".nx-sig__msg").textContent).toBe(SIGNATURE_LABELS.idRequired);
    id.value = "32.456.789";
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    expect(t.done[0].meta).toMatchObject({ name: "Luz Mery Ortiz", id: "32.456.789" });
    // Congelada, los campos quedan de solo lectura.
    expect(name.readOnly).toBe(true);
  });

  it("«Escribir mi nombre»: la firma tipográfica (el camino por teclado), marcada `typed`", async () => {
    const el = mount("ask-name");
    const t = track(el);
    inputs(el)[0].value = "Diego Llinás";
    button(el, "type").click();
    const typed = $(el, ".nx-sig__typed");
    expect(typed.hidden).toBe(false);
    const input = typed.querySelector("input")!;
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe("Diego Llinás");
    expect(typed.querySelector("span")!.textContent).toBe(SIGNATURE_LABELS.typed);
    expect(button(el, "type").textContent).toBe(SIGNATURE_LABELS.draw);
    expect(el.toSVG()).toContain(">Diego Llinás</text>");
    // La vista previa es una imagen del SVG (nunca marcado insertado).
    const img = $<HTMLImageElement>(el, ".nx-sig__img");
    expect(img.hidden).toBe(false);
    expect(img.getAttribute("src")).toMatch(/^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
    input.value = "<b>Diego</b>";
    input.dispatchEvent(new Event("input"));
    expect(el.toSVG()).toContain("&#60;b&#62;Diego");
    expect(t.changes.at(-1)).toBe(false);
    // Un nombre de una letra no es firma.
    input.value = "D";
    input.dispatchEvent(new Event("input"));
    button(el, "confirm").click();
    await sleep(0);
    expect($(el, ".nx-sig__msg").textContent).toBe(SIGNATURE_LABELS.short);
    input.value = "Diego Llinás";
    input.dispatchEvent(new Event("input"));
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    expect(t.done[0].meta).toMatchObject({ typed: true, strokes: 0, points: 0, device: "pointer", name: "Diego Llinás" });
    expect(t.done[0].svg).toContain("<text");
    // «Firmar a mano» vuelve al trazo.
    button(el, "again").click();
    button(el, "type").click();
    expect($(el, ".nx-sig__typed").hidden).toBe(true);
    expect(el.isEmpty()).toBe(true);
  });
});

describe("<nx-signature>: formulario", () => {
  it("participa en el <form>: JSON {svg, meta} por defecto, validez con `required`", () => {
    const { el, sent, validity } = withInternals('name="recibido" required');
    expect(sent.at(-1)).toBeNull();
    expect(validity.at(-1)).toMatchObject({ flags: { valueMissing: true }, message: SIGNATURE_LABELS.required });
    expect(el.checkValidity()).toBe(false);
    dot(el);
    expect(validity.at(-1)).toMatchObject({ flags: { customError: true }, message: SIGNATURE_LABELS.short });
    el.clear();
    draw(el);
    const v = JSON.parse(sent.at(-1) as string);
    expect(v.svg).toBe(el.toSVG());
    expect(v.meta).toMatchObject({ strokes: 1, typed: false });
    expect(validity.at(-1)!.flags).toEqual({});
    expect(el.checkValidity()).toBe(true);
    // Sin `required`, vacía es válida.
    el.required = false;
    el.clear();
    expect(validity.at(-1)!.flags).toEqual({});
  });

  it("`value-format=\"svg\"` manda el SVG; el ancla de la validez es el campo que falta", () => {
    const { el, sent, validity } = withInternals('value-format="svg" required ask-name');
    draw(el);
    expect(sent.at(-1)).toBe(el.toSVG());
    expect(validity.at(-1)).toMatchObject({ message: SIGNATURE_LABELS.nameRequired, anchor: inputs(el)[0] });
  });

  it("`value-format=\"png\"`: el PNG va como archivo cuando está listo (sin él, nada)", async () => {
    const { el, sent } = withInternals('value-format="png"');
    const png = new Blob(["PNG"], { type: "image/png" });
    vi.spyOn(el, "toPNG").mockResolvedValue(png);
    draw(el);
    await until(() => sent.at(-1) instanceof File);
    const f = sent.at(-1) as File;
    expect([f.name, f.type]).toEqual(["firma.png", "image/png"]);
  });

  it("el `reset` del formulario la borra (con nombre y cédula)", () => {
    const { el, sent } = withInternals("ask-name ask-id");
    inputs(el)[0].value = "Ana";
    draw(el);
    el.formResetCallback();
    expect(el.isEmpty()).toBe(true);
    expect(inputs(el)[0].value).toBe("");
    expect(sent.at(-1)).toBeNull();
  });

  it("deshabilitada (atributo o <fieldset disabled>): no se dibuja y los botones se apagan", () => {
    const el = mount("disabled");
    draw(el);
    expect(el.strokes).toHaveLength(0);
    expect(button(el, "type").disabled).toBe(true);
    el.disabled = false;
    el.formDisabledCallback(true);
    draw(el);
    expect(el.strokes).toHaveLength(0);
    el.formDisabledCallback(false);
    draw(el);
    expect(el.strokes).toHaveLength(1);
  });
});

describe("<nx-signature>: una firma guardada", () => {
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 90" width="240" height="90"><g fill="#1a2238"><path d="M0 0L10 10Z"/></g></svg>';
  const META = { signedAt: "2026-09-28T20:42:00.000Z", name: "Luz Mery Ortiz", id: "32.456.789", typed: false, strokes: 3, points: 212, width: 240, height: 90, device: "touch" };

  it("`readonly` + `value`: se ve la firma con su fecha, sin acciones y sin emitir `done`", () => {
    const el = document.createElement("nx-signature");
    el.setAttribute("readonly", "");
    el.setAttribute("ask-name", "");
    el.setAttribute("locale", "es-CO");
    const t = track(el);
    el.value = { svg: SVG, meta: META } as never;
    document.body.append(el);
    const img = $<HTMLImageElement>(el, ".nx-sig__img");
    expect(img.hidden).toBe(false);
    expect(decodeURIComponent(img.getAttribute("src")!.split(",")[1])).toBe(SVG);
    expect($(el, ".nx-sig__bar").hidden).toBe(true);
    expect($(el, ".nx-sig__stamp").hidden).toBe(false);
    expect(button(el, "again").hidden).toBe(true);
    expect($(el, ".nx-sig__stamp span").textContent).toMatch(/^Firmado el 28 sept 2026, \d{1,2}:42\s[ap]\. m\.$/);
    expect(inputs(el)[0].value).toBe("Luz Mery Ortiz");
    expect(inputs(el)[0].readOnly).toBe(true);
    expect(el.value).toEqual({ svg: SVG, meta: META });
    expect(el.toSVG()).toBe(SVG);
    expect(t.done).toEqual([]);
    expect($(el, "canvas").getAttribute("aria-label")).toBe(SIGNATURE_LABELS.padSigned);
  });

  it("`load()` con el SVG solo o con JSON; sin `readonly` emite `done` y «Volver a firmar» la reabre", async () => {
    const el = mount();
    const t = track(el);
    expect(el.load(SVG)).toBe(true);
    await until(() => t.done.length === 1);
    expect(t.done[0].meta).toMatchObject({ width: 240, height: 90, signedAt: "" });
    // Sin fecha no hay sello, pero sí «Volver a firmar».
    expect($(el, ".nx-sig__bar").hidden).toBe(true);
    expect($(el, ".nx-sig__stamp").hidden).toBe(false);
    expect($(el, ".nx-sig__stamp span").textContent).toBe("");
    expect(button(el, "again").hidden).toBe(false);
    expect(el.load(JSON.stringify({ svg: SVG, meta: META }))).toBe(true);
    await until(() => t.done.length === 2);
    expect(t.done[1].meta).toEqual(META);
    expect($(el, ".nx-sig__stamp").hidden).toBe(false);
    button(el, "again").click();
    expect(el.isEmpty()).toBe(true);
  });

  it("no carga lo que no es un SVG seguro", () => {
    const el = mount();
    expect(el.load('<svg onload="alert(1)"></svg>')).toBe(false);
    expect(el.load("<script>alert(1)</script>")).toBe(false);
    expect(el.load({ svg: 5 })).toBe(false);
    expect(el.load("{no es json")).toBe(false);
    expect(el.isEmpty()).toBe(true);
  });

  it("con `document`, una firma cargada sin huella la recibe (lo que llega del celular)", async () => {
    const el = mount('document="Remisión REM-3391"');
    const t = track(el);
    el.load({ svg: SVG, meta: { ...META, hash: undefined } });
    await until(() => t.done.length === 1);
    expect(t.done[0].meta.hash).toBe(createHash("sha256").update(`Remisión REM-3391\n${META.signedAt}`).digest("hex"));
    // La que ya trae huella la conserva (prueba lo que se firmó entonces).
    el.load({ svg: SVG, meta: { ...META, hash: "a".repeat(64) } });
    await until(() => t.done.length === 2);
    expect(t.done[1].meta.hash).toBe("a".repeat(64));
  });

  it("el atributo `value` (o la propiedad) la muestra sin emitir `done`, aunque no sea `readonly`", async () => {
    const el = mount(`value='${JSON.stringify({ svg: SVG, meta: META })}'`);
    const t = track(el);
    expect(el.value?.svg).toBe(SVG);
    el.value = SVG;
    await sleep(0);
    expect(t.done).toEqual([]);
    expect(el.value?.meta.width).toBe(240);
    el.removeAttribute("value");
    expect(el.isEmpty()).toBe(true);
  });
});

describe("<nx-signature>: en el celular", () => {
  /** El servidor de handoff de mentira: crea la sesión y abre un stream que la prueba alimenta. */
  function server() {
    const calls: { method: string; url: URL; init: RequestInit }[] = [];
    let push!: (o: unknown) => void;
    const enc = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(String(input), location.href);
        const method = (init.method ?? "GET").toUpperCase();
        calls.push({ method, url, init });
        if (method === "POST") return new Response(JSON.stringify({ id: "s1", url: "/m/firma?s=s1&t=tok", expiresIn: 300 }), { headers: { "Content-Type": "application/json" } });
        if (url.pathname.endsWith("/events")) {
          const body = new ReadableStream<Uint8Array>({ start: (c) => void (push = (o) => c.enqueue(enc.encode(`${JSON.stringify(o)}\n`))) });
          return new Response(body, { headers: { "Content-Type": "application/x-ndjson" } });
        }
        return new Response(null, { status: 204 });
      }),
    );
    return { calls, push: (o: unknown) => push(o) };
  }

  it("con `handoff`: «Firmar en el celular» abre el QR de <nx-handoff kind=signature> y la firma que llega se pinta aquí", async () => {
    const srv = server();
    const el = mount('handoff="/api/handoff" ask-name document="Remisión REM-3391"');
    const t = track(el);
    const phone = button(el, "phone");
    expect(phone.hidden).toBe(false);
    expect(phone.textContent).toBe(SIGNATURE_LABELS.phone);
    phone.click();
    await until(() => srv.calls.some((c) => c.url.pathname.endsWith("/events")), 5000);
    const ho = $(el, ".nx-sig__ho nx-handoff");
    expect(ho.getAttribute("kind")).toBe("signature");
    expect(ho.getAttribute("endpoint")).toBe("/api/handoff");
    expect(JSON.parse(String(srv.calls[0].init.body))).toEqual({ kind: "signature", context: { askName: true, askId: false } });
    expect($(ho, ".nx-ho__qr svg")).toBeTruthy();
    const svg = signatureSVG([{ type: "touch", points: Array.from({ length: 40 }, (_, i) => ({ x: i * 6, y: 40 + Math.sin(i) * 20, t: i * 16, p: 0.5 })) }]);
    const meta = { signedAt: "2026-09-28T20:42:00.000Z", name: "Luz Mery Ortiz", typed: false, strokes: 1, points: 40, width: 250, height: 70, device: "touch" };
    srv.push({ seq: 1, type: "connected", device: "Android" });
    srv.push({ seq: 2, type: "item", item: { kind: "data", id: "d1", data: { svg, meta } } });
    srv.push({ seq: 3, type: "done" });
    await until(() => t.done.length === 1, 3000);
    expect(t.done[0].svg).toBe(svg);
    expect(t.done[0].meta).toMatchObject({ name: "Luz Mery Ortiz", device: "touch" });
    // La huella se calcula aquí, donde está el documento.
    expect(t.done[0].meta.hash).toBe(createHash("sha256").update(`Remisión REM-3391\n${meta.signedAt}`).digest("hex"));
    expect(inputs(el)[0].value).toBe("Luz Mery Ortiz");
    expect($(el, ".nx-sig__img").hidden).toBe(false);
    // El resumen de handoff no se muestra: el sello de la firma lo dice.
    await until(() => (ho as HTMLElement & { state: string }).state === "done");
    expect($(el, ".nx-sig__stamp").hidden).toBe(false);
  });

  it("un <nx-handoff for=…> de la página que apunta aquí: el botón usa ese (y su `load` recibe la firma)", async () => {
    const el = mount('id="firma"', '<nx-handoff id="ho" endpoint="/api/handoff" kind="signature" for="firma"></nx-handoff>');
    await sleep(0);
    const ho = document.getElementById("ho") as HTMLElement & { start(): void };
    const start = vi.spyOn(ho, "start").mockImplementation(() => {});
    expect(button(el, "phone").hidden).toBe(false);
    button(el, "phone").click();
    expect(start).toHaveBeenCalledTimes(1);
  });
});

describe("<nx-signature>: robustez", () => {
  it("propiedades puestas antes de registrarse no se pierden", () => {
    const tpl = document.createElement("template");
    tpl.innerHTML = "<nx-signature></nx-signature>";
    const el = tpl.content.firstElementChild as NxSignature;
    Object.assign(el, { askName: true, height: 240, labels: { here: "Firme sobre la línea" }, penColor: "#000" });
    document.body.append(document.adoptNode(el));
    const up = document.querySelector("nx-signature")!;
    expect(up.askName).toBe(true);
    expect(up.hasAttribute("ask-name")).toBe(true);
    expect(up.getAttribute("pen-color")).toBe("#000");
    expect($(up, ".nx-sig__pad").style.height).toBe("240px");
    expect($(up, ".nx-sig__line").textContent).toBe("×Firme sobre la línea");
  });

  it("`labels` por atributo JSON (o propiedad); un JSON inválido avisa y no rompe", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount(`labels='{"confirm":"Recibí a satisfacción","undo":5}'`);
    expect(button(el, "confirm").textContent).toBe("Recibí a satisfacción");
    expect(button(el, "undo").textContent).toBe(SIGNATURE_LABELS.undo);
    el.setAttribute("labels", "{malo");
    expect(warn).toHaveBeenCalled();
    expect(button(el, "confirm").textContent).toBe("Recibí a satisfacción");
    el.labels = { phone: "Con el teléfono" };
    expect(button(el, "phone").textContent).toBe("Con el teléfono");
    expect(button(el, "confirm").textContent).toBe(SIGNATURE_LABELS.confirm);
  });

  it("`locale`: el sello en inglés con locale en-US (o el lang de la página)", async () => {
    const el = mount('locale="en-US"');
    const t = track(el);
    draw(el);
    button(el, "confirm").click();
    await until(() => t.done.length === 1);
    expect($(el, ".nx-sig__stamp span").textContent).toMatch(/^Firmado el [A-Z][a-z]{2} \d{1,2}, 2026, \d{1,2}:\d{2}\s[AP]M$/);
  });

  it("`height` con límites y `pen-color` en el SVG (una tinta rara vuelve a la de siempre)", () => {
    const el = mount('height="40" pen-color="#0b3d91"');
    expect(el.height).toBe(100);
    el.height = 9999;
    expect($(el, ".nx-sig__pad").style.height).toBe("600px");
    draw(el);
    expect(el.toSVG()).toContain('fill="#0b3d91"');
    el.penColor = '"><script>';
    expect(el.toSVG()).toContain('fill="#1a2238"');
  });

  it("sacarla de la página cancela el frame pendiente y el temporizador de `auto`", () => {
    const cancel = vi.spyOn(globalThis, "cancelAnimationFrame");
    const clear = vi.spyOn(globalThis, "clearTimeout");
    const el = mount("auto");
    draw(el);
    el.remove();
    expect(cancel).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    // Un trazo a medias no queda colgado al volver.
    document.body.append(el);
    draw(el, 20, {}, 300);
    expect(el.strokes).toHaveLength(2);
  });
});
