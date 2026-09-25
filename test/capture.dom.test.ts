// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import { CAPTURE_LABELS, type CaptureSchemaItem, type NxDocCapture } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

const SCHEMA: CaptureSchemaItem[] = [
  { key: "nit", label: "NIT", section: "Encabezado" },
  { key: "vence", label: "Vence", type: "date", section: "Encabezado" },
  { key: "items", label: "Ítems", type: "table", section: "Detalle", columns: [{ key: "desc", label: "Descripción" }, { key: "cant", label: "Cant.", type: "number" }] },
  { key: "total", label: "Total", type: "money", section: "Totales" },
];
const box = { page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.02 };

function mount(attrs = ""): NxDocCapture {
  document.body.innerHTML = `<nx-doc-capture ${attrs}></nx-doc-capture>`;
  const el = document.querySelector("nx-doc-capture")!;
  el.schema = SCHEMA;
  return el;
}

function read(el: NxDocCapture) {
  el.begin("factura.pdf");
  el.push({ type: "page", n: 1, src: "/p1.png", width: 800, height: 1000 });
  el.push({ type: "field", key: "nit", value: "900.123.456-7", confidence: 0.99, box, detail: "DV correcto" });
  el.push({ type: "field", key: "vence", value: "12/1O/2026", confidence: 0.61, box, hint: "¿O o 0?", suggest: "12/10/2026" });
  el.push({ type: "field", key: "items.0.desc", value: "Lámina", confidence: 0.95, box });
  el.push({ type: "field", key: "items.0.cant", value: "40", confidence: 0.5, box });
  el.push({ type: "check", id: "iva", status: "ok", message: "IVA correcto", fields: ["total"] });
  el.end();
}

const submitDisabled = (el: NxDocCapture) => (el.querySelector("nx-button") as unknown as { disabled: boolean }).disabled;

describe("<nx-doc-capture>", () => {
  it("en reposo: la zona para soltar, sin nada más", () => {
    const el = mount();
    expect(el.querySelector(".nx-cap__drop-title")!.textContent).toBe(CAPTURE_LABELS.dropTitle);
    expect(el.querySelector<HTMLElement>(".nx-cap__main")!.hidden).toBe(true);
    expect(el.state).toBe("idle");
  });

  it("pinta la página y los campos a medida que llegan; las secciones aparecen con su primer campo", () => {
    const el = mount();
    el.begin("factura.pdf");
    el.push({ type: "page", n: 1, src: "/p1.png", width: 800, height: 1000 });
    expect(el.querySelector<HTMLImageElement>(".nx-cap__page img")!.getAttribute("src")).toBe("/p1.png");
    const groups = () => [...el.querySelectorAll<HTMLElement>(".nx-cap__group")].map((g) => g.hidden);
    expect(groups()).toEqual([true, true, true]);
    el.push({ type: "field", key: "nit", value: "900", confidence: 0.99, box });
    expect(groups()).toEqual([false, true, true]);
    expect(el.querySelector<HTMLInputElement>('.nx-cap__field[data-key="nit"] input')!.value).toBe("900");
    expect(el.querySelector('.nx-cap__field[data-key="nit"] .nx-cap__conf')!.textContent).toBe("99 %");
    const b = el.querySelector<HTMLElement>('.nx-cap__box[data-key="nit"]')!;
    expect(b.style.left).toBe("10%");
    expect(b.style.width).toBe("20%");
  });

  it("lo dudoso queda por revisar y bloquea el registro; la sugerencia lo resuelve", () => {
    const el = mount();
    read(el);
    expect(el.pending.sort()).toEqual(["items.0.cant", "vence"]);
    expect(submitDisabled(el)).toBe(true);
    expect(el.querySelector(".nx-cap__foot-msg")!.textContent).toBe("2 por revisar");
    el.querySelector<HTMLButtonElement>('.nx-cap__field[data-key="vence"] [data-use]')!.click();
    expect(el.values.vence).toBe("12/10/2026");
    expect(el.querySelector('.nx-cap__field[data-key="vence"] .nx-cap__note')!.textContent).toBe(CAPTURE_LABELS.confirmedByYou);
    // La celda dudosa se confirma con el ✓ de su fila.
    el.querySelector<HTMLButtonElement>('.nx-cap__tr[data-row="items.0"] .nx-cap__ok')!.click();
    expect(el.pending).toEqual([]);
    expect(submitDisabled(el)).toBe(false);
  });

  it("corregir a mano confirma y emite nx-capture-change", () => {
    const el = mount();
    read(el);
    const seen: string[] = [];
    el.addEventListener("nx-capture-change", (e) => seen.push(`${e.detail.key}=${e.detail.value}`));
    const input = el.querySelector<HTMLInputElement>('.nx-cap__field[data-key="vence"] input')!;
    input.value = "11/10/2026";
    input.dispatchEvent(new Event("change"));
    expect(seen).toEqual(["vence=11/10/2026"]);
    expect(el.pending).toEqual(["items.0.cant"]);
  });

  it("una validación error bloquea aunque no quede nada por revisar; warn solo avisa", () => {
    const el = mount('review-below="0.4"');
    read(el);
    expect(el.pending).toEqual([]);
    expect(submitDisabled(el)).toBe(false);
    el.setCheck({ id: "precio", status: "warn", message: "Precio distinto" });
    expect(submitDisabled(el)).toBe(false);
    expect(el.querySelector(".nx-cap__foot-msg")!.textContent).toBe(`${CAPTURE_LABELS.ready} · 1 con aviso`);
    el.setCheck({ id: "nit", status: "error", message: "El NIT no existe" });
    expect(submitDisabled(el)).toBe(true);
    expect(el.querySelector(".nx-cap__foot-msg")!.textContent).toBe("El NIT no existe");
  });

  it("evidencia: pasar por un campo ilumina su recuadro, y al revés", () => {
    const el = mount();
    read(el);
    el.querySelector('.nx-cap__field[data-key="nit"]')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(el.querySelector('.nx-cap__box[data-key="nit"]')!.classList.contains("is-lit")).toBe(true);
    el.querySelector('.nx-cap__field[data-key="nit"]')!.dispatchEvent(new PointerEvent("pointerout", { bubbles: true }));
    el.querySelector('.nx-cap__box[data-key="items.0.desc"]')!.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    expect(el.querySelector('.nx-cap__cell[data-key="items.0.desc"]')!.classList.contains("is-lit")).toBe(true);
  });

  it("los valores salen armados: tablas como filas", () => {
    const el = mount();
    read(el);
    expect(el.values).toEqual({ nit: "900.123.456-7", vence: "12/1O/2026", items: [{ desc: "Lámina", cant: "40" }] });
  });

  it("los datos nunca son HTML y una imagen javascript: no se pinta", () => {
    const el = mount();
    el.begin("x");
    el.push({ type: "page", n: 1, src: "javascript:alert(1)", width: 1, height: 1 });
    el.push({ type: "field", key: "nit", value: "<img src=x onerror=alert(1)>", confidence: 1 });
    expect(el.querySelector(".nx-cap__page img")!.hasAttribute("src")).toBe(false);
    expect(el.querySelector(".nx-cap__form img")).toBeNull();
  });

  it("extract(): POST multipart al endpoint y lee el stream; registrar hace POST a action", async () => {
    const lines = [
      { type: "page", n: 1, src: "/p1.png", width: 800, height: 1000 },
      { type: "field", key: "nit", value: "900", confidence: 0.99, box },
      { type: "check", id: "a", status: "ok", message: "bien" },
      { type: "done" },
    ].map((l) => JSON.stringify(l)).join("\n");
    const fetchMock = vi.fn(async (url: string) => (url === "/leer" ? new Response(lines) : new Response("{}")));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/leer" action="/registrar"');
    const done = new Promise((r) => el.addEventListener("nx-capture-done", r, { once: true }));
    await el.extract(new File(["x"], "f.pdf", { type: "application/pdf" }));
    await done;
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(el.state).toBe("review");
    expect(el.querySelectorAll(".nx-cap__check")).toHaveLength(1);

    const submitted = new Promise<CustomEvent>((r) => el.addEventListener("nx-capture-submit", (e) => r(e), { once: true }));
    el.querySelector<HTMLButtonElement>("nx-button .nx-button__btn")!.click();
    // Una tabla del schema sin filas viaja como arreglo vacío: el backend recibe siempre la misma forma.
    expect((await submitted).detail.values).toEqual({ nit: "900", items: [] });
    await new Promise((r) => setTimeout(r, 10));
    const [url, init2] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/registrar");
    expect(JSON.parse(init2.body as string)).toEqual({ values: { nit: "900", items: [] }, confirmed: [] });
  });

  it("nx-capture-file cancelado: la app usa su propio transporte y no se pide nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/leer"');
    el.addEventListener("nx-capture-file", (e) => e.preventDefault());
    await el.extract(new File(["x"], "f.pdf"));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.state).toBe("idle");
  });

  it("una corrección de la persona no la pisa un evento que llega después", () => {
    const el = mount();
    el.begin("f.pdf");
    el.push({ type: "field", key: "nit", value: "900.123.456-7", confidence: 0.6, box });
    const input = el.querySelector<HTMLInputElement>('.nx-cap__field[data-key="nit"] input')!;
    input.value = "900.123.456-8";
    input.dispatchEvent(new Event("change"));
    el.push({ type: "field", key: "nit", value: "900.123.456-7", confidence: 0.9, box });
    el.end();
    expect(el.values.nit).toBe("900.123.456-8");
    expect(input.value).toBe("900.123.456-8");
  });

  it("una clave que el schema no tiene no queda «por revisar» (no hay dónde confirmarla)", () => {
    const el = mount();
    read(el);
    for (const k of ["vence", "items.0.cant"]) {
      el.querySelector<HTMLInputElement>(`input[data-key="${k}"]`)!.dispatchEvent(new Event("change"));
    }
    expect(el.pending).toEqual([]);
    el.push({ type: "field", key: "oculto", value: "x", confidence: 0.1 });
    el.push({ type: "field", key: "otra.0.x", value: "x", confidence: 0.1 });
    el.push({ type: "field", key: "items.1.nada", value: "x", confidence: 0.1 });
    expect(el.pending).toEqual([]);
    expect(submitDisabled(el)).toBe(false);
  });

  it("valida el archivo: tipo según `accept` y tamaño según `max-size` (20 MB por defecto)", async () => {
    const fetchMock = vi.fn(async () => new Response('{"type":"done"}\n'));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/leer"');
    const error = () => el.querySelector<HTMLElement>(".nx-cap__drop-error")!;
    await el.extract(new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
    expect(error().hidden).toBe(false);
    expect(error().textContent).toBe(CAPTURE_LABELS.badType);
    expect(error().getAttribute("role")).toBe("alert");
    const big = new File(["x"], "grande.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 });
    await el.extract(big);
    expect(error().textContent).toBe("El archivo pasa de 20 MB");
    expect(fetchMock).not.toHaveBeenCalled();
    el.setAttribute("max-size", "10");
    await el.extract(new File(["0123456789ab"], "f.png", { type: "image/png" }));
    expect(fetchMock).not.toHaveBeenCalled();
    el.maxSize = 1000;
    await el.extract(new File(["x"], "f.png", { type: "image/png" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Al soltar: el mismo control (el navegador no mira `accept` en un drop).
    el.reset();
    const drop = new Event("drop", { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(drop, "dataTransfer", { value: { files: [new File(["x"], "nota.txt", { type: "text/plain" })] } });
    el.dispatchEvent(drop);
    await new Promise((r) => setTimeout(r, 5));
    expect(error().textContent).toBe(CAPTURE_LABELS.badType);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("el spinner del estado es el mismo nodo durante toda la lectura; `done` suelta la conexión", async () => {
    const enc = new TextEncoder();
    let push!: (o: object) => void;
    let cancelled = false;
    vi.stubGlobal("fetch", async () =>
      new Response(
        new ReadableStream({
          start(c) {
            push = (o) => c.enqueue(enc.encode(`${JSON.stringify(o)}\n`));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
    );
    const el = mount('endpoint="/leer"');
    const reading = el.extract(new File(["x"], "f.pdf", { type: "application/pdf" }));
    await new Promise((r) => setTimeout(r, 5));
    const spin = el.querySelector(".nx-cap__status .nx-spinner");
    expect(spin).not.toBeNull();
    push({ type: "field", key: "nit", value: "900", confidence: 0.99 });
    push({ type: "field", key: "total", value: "1", confidence: 0.99 });
    await new Promise((r) => setTimeout(r, 5));
    expect(el.querySelector(".nx-cap__status .nx-spinner")).toBe(spin);
    expect(el.querySelector(".nx-cap__status")!.textContent).toContain("2");
    push({ type: "done" });
    await reading;
    expect(el.state).toBe("review");
    expect(cancelled).toBe(true);
  });

  it("endpoint y action de otro origen no se llaman", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async () => new Response('{"type":"done"}\n'));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="https://evil.example/leer"');
    await el.extract(new File(["x"], "f.pdf", { type: "application/pdf" }));
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("render BDUI crea el componente con su schema", () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const [el] = render({ component: "DocCapture", props: { schema: SCHEMA, endpoint: "/leer", reviewBelow: 0.9 } }, host) as NxDocCapture[];
    expect(el.tagName).toBe("NX-DOC-CAPTURE");
    expect(el.reviewBelow).toBe(0.9);
    expect(el.schema).toHaveLength(4);
  });
});
