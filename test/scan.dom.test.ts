// @vitest-environment happy-dom
//
// happy-dom no tiene cámara, `BarcodeDetector` ni Popover API (la usan los avisos): se simulan. La
// cámara de verdad (con el dispositivo falso de Chromium) se prueba en e2e/scan.spec.ts.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "../src/components/scan/index";
import type { NxScan, ScanCountDetail, ScanDetail, ScanItem } from "../src/components/scan/index";

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
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as Record<string, unknown>).BarcodeDetector;
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mount(attrs = ""): NxScan {
  document.body.innerHTML = `<button id="outside">fuera</button><input id="other" /><nx-scan locale="es-CO" ${attrs}></nx-scan>`;
  return document.querySelector("nx-scan")!;
}
const $ = <T extends Element = HTMLElement>(el: Element, sel: string) => el.querySelector<T>(sel)!;
const input = (el: NxScan) => $<HTMLInputElement>(el, ".nx-scan__input");
function typeCode(el: NxScan, text: string) {
  input(el).value = text;
  $<HTMLFormElement>(el, ".nx-scan__manual").dispatchEvent(new Event("submit", { cancelable: true }));
}
function events(el: NxScan) {
  const scans: ScanDetail[] = [];
  const counts: ScanItem[][] = [];
  el.addEventListener("nx-scan", (e) => scans.push(e.detail));
  el.addEventListener("nx-scan-count", (e) => counts.push((e as CustomEvent<ScanCountDetail>).detail.items));
  return { scans, counts };
}
const rows = (el: NxScan) => [...el.querySelectorAll<HTMLElement>(".nx-scan__item")];
const row = (el: NxScan, code: string) => el.querySelector<HTMLElement>(`.nx-scan__item[data-code="${code}"]`)!;
const live = (el: NxScan) => $(el, ".nx-scan__sr").textContent!.replace(/​/g, "");
/** Teclas en la página, con el momento de cada una (como las manda una pistola o una persona). */
function keys(target: EventTarget, text: string, gap: number, t0 = 1000): KeyboardEvent {
  let t = t0;
  let last!: KeyboardEvent;
  for (const key of [...text, "Enter"]) {
    last = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    Object.defineProperty(last, "timeStamp", { value: t });
    target.dispatchEvent(last);
    t += gap;
  }
  return last;
}
/** `fetch` de mentira para `source`. */
function catalog(products: Record<string, object>) {
  const fetchMock = vi.fn(async (url: string) => {
    const code = decodeURIComponent(String(url).split("code=")[1] ?? "");
    const p = products[code];
    return new Response(p ? JSON.stringify(p) : "{}", { status: p ? 200 : 404, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("<nx-scan> sin cámara", () => {
  it("región con nombre, campo con etiqueta, y un aviso claro si no hay BarcodeDetector (sin botón de foto)", () => {
    const el = mount();
    expect(el.getAttribute("role")).toBe("region");
    expect(el.getAttribute("aria-label")).toBe("Escáner de códigos");
    const label = $(el, ".nx-scan__label");
    expect(label.getAttribute("for")).toBe(input(el).id);
    expect(label.textContent).toBe("Código");
    expect(el.state).toBe("unavailable");
    expect(el.problem).toBe("nodetector");
    expect($(el, ".nx-scan__msg").textContent).toContain("no lee códigos con la cámara");
    expect($(el, ".nx-scan__start").hidden).toBe(true);
    expect($(el, ".nx-scan__photo").hidden).toBe(true);
    expect($(el, ".nx-scan__wedge").textContent).toContain("Pistola lectora");
    expect($(el, ".nx-scan__count").hidden).toBe(true);
  });

  it("modo único, a mano: nx-scan con el formato deducido y el resultado a la vista", () => {
    const el = mount();
    const { scans } = events(el);
    typeCode(el, " 7707123450011 ");
    expect(scans).toEqual([{ code: "7707123450011", format: "ean_13", via: "manual" }]);
    expect($(el, ".nx-scan__code").textContent).toBe("7707123450011");
    expect($(el, ".nx-scan__fmt").textContent).toBe("EAN-13");
    expect(live(el)).toBe("Código leído: 7707123450011");
    expect(input(el).value).toBe("");
    typeCode(el, "   ");
    expect(scans).toHaveLength(1);
  });

  it("modo único con source: busca la descripción (y 404 es «sin registrar»)", async () => {
    const fetchMock = catalog({ "7707123450042": { code: "7707123450042", name: "Soldadura E6013", unit: "caja" } });
    const el = mount('source="/api/producto?code="');
    typeCode(el, "7707123450042");
    expect($(el, ".nx-scan__product").textContent).toBe("Buscando…");
    await vi.waitFor(() => expect($(el, ".nx-scan__product").textContent).toBe("Soldadura E6013 · caja"));
    expect(fetchMock).toHaveBeenCalledWith("/api/producto?code=7707123450042", expect.objectContaining({ credentials: "same-origin" }));
    typeCode(el, "NO-EXISTE");
    await vi.waitFor(() => expect($(el, ".nx-scan__product").textContent).toBe("Código sin registrar"));
    // Una segunda vez no se vuelve a pedir.
    typeCode(el, "7707123450042");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("<nx-scan mode=count>", () => {
  it("agrupa por código: lo nuevo arriba, lo repetido suma y se resalta, con anuncio y nx-scan-count", () => {
    const el = mount('mode="count"');
    const { counts } = events(el);
    expect($(el, ".nx-scan__empty").hidden).toBe(false);
    expect($(el, ".nx-scan__submit").textContent).toBe("Agregar");
    typeCode(el, "A-1");
    typeCode(el, "B-2");
    typeCode(el, "A-1");
    expect(rows(el).map((r) => r.dataset.code)).toEqual(["B-2", "A-1"]);
    expect($<HTMLInputElement>(row(el, "A-1"), ".nx-scan__n").value).toBe("2");
    expect(row(el, "A-1").classList.contains("is-last")).toBe(true);
    expect(row(el, "B-2").classList.contains("is-last")).toBe(false);
    expect(live(el)).toBe("A-1: 2");
    expect(counts.at(-1)).toEqual([
      { code: "B-2", qty: 1 },
      { code: "A-1", qty: 2 },
    ]);
    expect(el.items).toEqual(counts.at(-1));
    expect($(el, ".nx-scan__sums").textContent).toBe("2 productos3 unidades");
    expect($(el, ".nx-scan__empty").hidden).toBe(true);
  });

  it("«12*código» suma 12 de una vez; add() hace lo mismo desde código", () => {
    const el = mount('mode="count"');
    const { scans } = events(el);
    typeCode(el, "12*7707123450011");
    el.add("7707123450011", 3);
    expect(el.items).toEqual([{ code: "7707123450011", qty: 15, format: "ean_13" }]);
    expect(scans.map((s) => s.via)).toEqual(["manual", "api"]);
  });

  it("nx-scan cancelado no cuenta", () => {
    const el = mount('mode="count"');
    el.addEventListener("nx-scan", (e) => e.detail.code.startsWith("X") && e.preventDefault());
    typeCode(el, "X-1");
    typeCode(el, "OK-1");
    expect(el.items.map((i) => i.code)).toEqual(["OK-1"]);
    // El campo se queda con lo rechazado (para corregirlo).
    typeCode(el, "X-2");
    expect(input(el).value).toBe("X-2");
  });

  it("con source: «esperadas 40 · contadas 38», faltantes, completas, sobrantes y totales", async () => {
    catalog({
      L: { code: "L", name: "Lámina HR 3 mm", unit: "und", expected: 3 },
      T: { code: "T", name: "Tubo 2 in", expected: 1 },
      D: { code: "D", name: "Disco de corte", expected: 0 },
    });
    const el = mount('mode="count" source="/p?code="');
    const { counts } = events(el);
    typeCode(el, "L");
    expect($(row(el, "L"), ".nx-scan__meta").textContent).toBe("Buscando…");
    await vi.waitFor(() => expect($(row(el, "L"), ".nx-scan__name").textContent).toBe("Lámina HR 3 mm"));
    const L = row(el, "L");
    expect($(L, ".nx-scan__meta").textContent).toBe("L · esperadas 3 · contadas 1");
    expect(L.dataset.status).toBe("short");
    expect($(L, ".nx-scan__badge").textContent).toBe("Faltan 2");
    expect($(L, ".nx-scan__unit").textContent).toBe("und");
    expect(counts.at(-1)![0]).toEqual({ code: "L", qty: 1, name: "Lámina HR 3 mm", unit: "und", expected: 3 });
    typeCode(el, "2*L");
    expect(L.dataset.status).toBe("ok");
    expect($(L, ".nx-scan__badge").textContent).toBe("Completo");
    expect(live(el)).toBe("Lámina HR 3 mm: 3 de 3 und");
    typeCode(el, "T");
    typeCode(el, "D");
    await vi.waitFor(() => expect(row(el, "D").dataset.status).toBe("over"));
    expect($(row(el, "D"), ".nx-scan__badge").textContent).toBe("Sobran 1");
    const sums = () => [...$(el, ".nx-scan__sums").children].map((s) => `${s.textContent}${(s as HTMLElement).dataset.status ? `(${(s as HTMLElement).dataset.status})` : ""}`);
    await vi.waitFor(() => expect(row(el, "T").dataset.status).toBe("ok"));
    expect(sums()).toEqual(["3 productos", "5 unidades", "sobran 1(over)"]);
    // Quitando el disco: todo cuadra.
    $<HTMLButtonElement>(row(el, "D"), '[data-act="dec"]').click();
    expect(row(el, "D").dataset.status).toBe("ok");
    expect(sums()).toEqual(["3 productos", "4 unidades", "Todo cuadra(ok)"]);
  });

  it("−/+ y escribir la cantidad (con coma decimal); Escape vuelve; en 0 se quita y se puede deshacer", async () => {
    const el = mount('mode="count"');
    typeCode(el, "K-1");
    typeCode(el, "M-1");
    const r = row(el, "K-1");
    const [dec, inc] = r.querySelectorAll<HTMLButtonElement>(".nx-scan__step");
    expect(dec.getAttribute("aria-label")).toBe("Restar uno a K-1");
    expect(inc.getAttribute("aria-label")).toBe("Sumar uno a K-1");
    inc.click();
    inc.click();
    expect(el.items.find((i) => i.code === "K-1")!.qty).toBe(3);
    const n = $<HTMLInputElement>(r, ".nx-scan__n");
    expect(n.getAttribute("aria-label")).toBe("Cantidad de K-1");
    n.focus();
    n.value = "2,5";
    n.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(el.items.find((i) => i.code === "K-1")!.qty).toBe(2.5);
    expect(n.value).toBe("2,5");
    n.value = "abc";
    n.dispatchEvent(new Event("change", { bubbles: true }));
    expect(n.value).toBe("2,5");
    n.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    expect(n.value).toBe("3,5");
    // A 0: la línea se va (el foco pasa a la siguiente) y el aviso ofrece deshacer.
    n.value = "0";
    n.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    expect(el.items.map((i) => i.code)).toEqual(["M-1"]);
    expect(document.activeElement).toBe($(row(el, "M-1"), '[data-act="dec"]'));
    const toast = await vi.waitFor(() => {
      const t = [...document.querySelectorAll(".nx-toast")].find((x) => x.textContent!.includes("K-1: se quitó del conteo"));
      expect(t).toBeTruthy();
      return t!;
    });
    toast.querySelector<HTMLButtonElement>('[data-r="undo"]')!.click();
    await vi.waitFor(() => expect(el.items.map((i) => i.code)).toEqual(["M-1", "K-1"]));
  });

  it("deshacer la última lectura: con el aviso (solo el último sigue vivo) y con undo()", async () => {
    const el = mount('mode="count"');
    typeCode(el, "A");
    typeCode(el, "B");
    await vi.waitFor(() => expect(document.querySelectorAll(".nx-toast:not(.is-out)").length).toBe(1));
    const t = document.querySelector(".nx-toast:not(.is-out)")!;
    expect(t.textContent).toContain("B: 1");
    t.querySelector<HTMLButtonElement>('[data-r="undo"]')!.click();
    await vi.waitFor(() => expect(el.items.map((i) => i.code)).toEqual(["A"]));
    typeCode(el, "A");
    expect(el.items).toEqual([{ code: "A", qty: 2 }]);
    expect(el.undo()).toBe(true);
    expect(el.items).toEqual([{ code: "A", qty: 1 }]);
    expect(el.undo()).toBe(false);
  });

  it("«Vaciar» con deshacer; clear() sin aviso", async () => {
    const el = mount('mode="count"');
    typeCode(el, "A");
    typeCode(el, "B");
    $<HTMLButtonElement>(el, ".nx-scan__clear").click();
    expect(el.items).toEqual([]);
    expect($(el, ".nx-scan__clear").hidden).toBe(true);
    const t = await vi.waitFor(() => {
      const x = [...document.querySelectorAll(".nx-toast")].find((n) => n.textContent!.includes("Conteo vaciado"));
      expect(x).toBeTruthy();
      return x!;
    });
    t.querySelector<HTMLButtonElement>('[data-r="undo"]')!.click();
    await vi.waitFor(() => expect(el.items.map((i) => i.code)).toEqual(["B", "A"]));
    el.clear();
    expect(el.items).toEqual([]);
  });

  it("items precargados (atributo JSON): lo esperado se ve desde el comienzo como faltante", () => {
    const el = mount(`mode="count" items='[{"code":"L","name":"Lámina","expected":40},{"code":"T","qty":2,"expected":2}]'`);
    expect(rows(el).map((r) => r.dataset.status)).toEqual(["short", "ok"]);
    expect($(row(el, "L"), ".nx-scan__badge").textContent).toBe("Faltan 40");
    expect($<HTMLButtonElement>(row(el, "L"), '[data-act="dec"]').disabled).toBe(true);
    // Una línea esperada en 0 no se quita: sigue como faltante.
    $<HTMLButtonElement>(row(el, "T"), '[data-act="dec"]').click();
    $<HTMLButtonElement>(row(el, "T"), '[data-act="dec"]').click();
    expect(el.items.map((i) => `${i.code}:${i.qty}`)).toEqual(["L:0", "T:0"]);
  });

  it("labels y locale", () => {
    const el = mount('mode="count"');
    el.locale = "en-US";
    el.labels = { add: "Add", codes: "{n} items", clear: 3 as unknown as string };
    typeCode(el, "1500*A");
    expect($(el, ".nx-scan__submit").textContent).toBe("Add");
    expect($(el, ".nx-scan__clear").textContent).toBe("Vaciar");
    expect($<HTMLInputElement>(row(el, "A"), ".nx-scan__n").value).toBe("1,500");
    expect($(el, ".nx-scan__sums").firstElementChild!.textContent).toBe("1 items");
  });
});

describe("pistola lectora", () => {
  it("una ráfaga en la página (foco en un botón) es una lectura; el Enter no activa el botón", () => {
    const el = mount('mode="count"');
    const { scans } = events(el);
    const btn = document.querySelector<HTMLButtonElement>("#outside")!;
    btn.focus();
    const enter = keys(btn, "7707123450011", 8);
    expect(scans).toEqual([{ code: "7707123450011", format: "ean_13", via: "wedge" }]);
    expect(enter.defaultPrevented).toBe(true);
    expect(el.items).toEqual([{ code: "7707123450011", qty: 1, format: "ean_13" }]);
  });

  it("una persona escribiendo no es una lectura, y el Enter sigue su camino", () => {
    const el = mount('mode="count"');
    const { scans } = events(el);
    const enter = keys(document.body, "7707123450011", 110);
    expect(scans).toEqual([]);
    expect(enter.defaultPrevented).toBe(false);
  });

  it("no roba lo que se escribe en otro campo, aunque sea una ráfaga", () => {
    const el = mount('mode="count"');
    const { scans } = events(el);
    const other = document.querySelector<HTMLInputElement>("#other")!;
    other.focus();
    const enter = keys(other, "7707123450011", 8);
    expect(scans).toEqual([]);
    expect(enter.defaultPrevented).toBe(false);
  });

  it("en el campo del código: la ráfaga se marca como wedge, lo escrito a mano como manual", () => {
    const el = mount('mode="count"');
    const { scans } = events(el);
    const i = input(el);
    i.focus();
    i.value = "7707123450011";
    keys(i, "7707123450011", 6);
    $<HTMLFormElement>(el, ".nx-scan__manual").dispatchEvent(new Event("submit", { cancelable: true }));
    i.value = "ABC-9";
    keys(i, "ABC-9", 140, 5000);
    $<HTMLFormElement>(el, ".nx-scan__manual").dispatchEvent(new Event("submit", { cancelable: true }));
    expect(scans.map((s) => `${s.code}:${s.via}`)).toEqual(["7707123450011:wedge", "ABC-9:manual"]);
  });

  it("wedge=off o field: la página no escucha", () => {
    for (const w of ["off", "field"]) {
      const el = mount(`mode="count" wedge="${w}"`);
      const { scans } = events(el);
      keys(document.body, "7707123450011", 8);
      expect(scans).toEqual([]);
      expect($(el, ".nx-scan__wedge").hidden).toBe(w === "off");
    }
  });

  it("con dos escáneres, la pistola es del primero de la página, o del último que se tocó", () => {
    document.body.innerHTML = '<nx-scan id="a" mode="count"></nx-scan><nx-scan id="b" mode="count"></nx-scan>';
    const a = document.querySelector<NxScan>("#a")!;
    const b = document.querySelector<NxScan>("#b")!;
    keys(document.body, "11112222", 5);
    expect([a.items.length, b.items.length]).toEqual([1, 0]);
    b.dispatchEvent(new Event("pointerdown"));
    keys(document.body, "33334444", 5, 9000);
    expect([a.items.length, b.items.length]).toEqual([1, 1]);
    b.remove();
    keys(document.body, "55556666", 5, 19000);
    expect(a.items.length).toBe(2);
  });
});

// ---------------------------------------------------------------- cámara simulada

type Found = { rawValue: string; format: string; boundingBox?: { x: number; y: number; width: number; height: number } };
function fakeCamera(opts: { fail?: string; torch?: boolean; cams?: number } = {}) {
  const seen: Found[][] = [];
  const track = { stop: vi.fn(), getCapabilities: () => (opts.torch ? { torch: true } : {}), getSettings: () => ({ deviceId: "cam0" }), applyConstraints: vi.fn(async () => {}) };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const getUserMedia = vi.fn(async () => {
    if (opts.fail) throw Object.assign(new Error("x"), { name: opts.fail });
    return stream;
  });
  const devices = Array.from({ length: opts.cams ?? 1 }, (_, i) => ({ kind: "videoinput", deviceId: `cam${i}` }));
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia, enumerateDevices: async () => devices }, vibrate: vi.fn() }));
  class BarcodeDetector {
    static getSupportedFormats = async () => ["ean_13", "qr_code"];
    formats: string[];
    constructor(o: { formats: string[] }) {
      this.formats = o.formats;
      detectors.push(this);
    }
    async detect() {
      return seen.shift() ?? [];
    }
  }
  const detectors: BarcodeDetector[] = [];
  (window as unknown as Record<string, unknown>).BarcodeDetector = BarcodeDetector;
  Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get: () => 4 });
  HTMLMediaElement.prototype.play = async function () {};
  // happy-dom solo acepta un MediaStream de verdad.
  Object.defineProperty(HTMLMediaElement.prototype, "srcObject", { configurable: true, get: () => null, set: () => {} });
  return { track, getUserMedia, seen, detectors };
}

describe("cámara (simulada)", () => {
  it("activar: pide la cámara trasera, lee, vibra, destella y no cuenta dos veces lo mismo", async () => {
    const cam = fakeCamera();
    const el = mount('mode="count" formats="ean_13,code_128,qr_code" muted');
    const { scans } = events(el);
    expect(el.state).toBe("idle");
    expect($(el, ".nx-scan__photo").hidden).toBe(false);
    $<HTMLButtonElement>(el, ".nx-scan__start").click();
    await vi.waitFor(() => expect(el.state).toBe("live"));
    expect(cam.getUserMedia).toHaveBeenCalledWith({ audio: false, video: expect.objectContaining({ facingMode: { ideal: "environment" } }) });
    // Pidió solo los formatos que el detector sabe leer.
    expect(cam.detectors[0].formats).toEqual(["ean_13", "qr_code"]);
    expect($(el, ".nx-scan__tools").hidden).toBe(false);
    const hit = { rawValue: "7707123450011", format: "ean_13" };
    cam.seen.push([hit], [hit], [hit]);
    await vi.waitFor(() => expect(scans).toHaveLength(1));
    await sleep(350);
    expect(scans).toEqual([{ code: "7707123450011", format: "ean_13", via: "camera" }]);
    expect(el.items[0].qty).toBe(1);
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
    expect($(el, ".nx-scan__viewer").classList.contains("is-flash")).toBe(true);
    // Otro código sí.
    cam.seen.push([{ rawValue: "QR-OC-2291", format: "qr_code" }]);
    await vi.waitFor(() => expect(scans).toHaveLength(2));
    expect(el.items.map((i) => i.code)).toEqual(["QR-OC-2291", "7707123450011"]);
    // Cerrar: se apagan las pistas.
    $<HTMLButtonElement>(el, ".nx-scan__stop").click();
    expect(cam.track.stop).toHaveBeenCalled();
    expect(el.state).toBe("idle");
    expect(document.activeElement).toBe($(el, ".nx-scan__start"));
  });

  it("modo único: una lectura y la cámara se apaga («Escanear otro» vuelve a empezar)", async () => {
    const cam = fakeCamera();
    const el = mount("muted");
    await el.start();
    expect(el.state).toBe("live");
    cam.seen.push([{ rawValue: "7707123450042", format: "ean_13" }]);
    await vi.waitFor(() => expect(el.state).toBe("done"));
    expect(cam.track.stop).toHaveBeenCalled();
    expect($(el, ".nx-scan__code").textContent).toBe("7707123450042");
    const again = $<HTMLButtonElement>(el, ".nx-scan__start");
    expect(again.textContent).toBe("Escanear otro");
    again.click();
    await vi.waitFor(() => expect(el.state).toBe("live"));
    expect($(el, ".nx-scan__result").hidden).toBe(true);
    el.stop();
  });

  it("linterna y cambio de cámara solo si existen", async () => {
    const cam = fakeCamera({ torch: true, cams: 2 });
    const el = mount("muted");
    await el.start();
    const torch = $<HTMLButtonElement>(el, ".nx-scan__torch");
    await vi.waitFor(() => expect($(el, ".nx-scan__switch").hidden).toBe(false));
    expect(torch.hidden).toBe(false);
    expect(torch.getAttribute("aria-label")).toBe("Linterna");
    torch.click();
    await vi.waitFor(() => expect(torch.getAttribute("aria-pressed")).toBe("true"));
    expect(cam.track.applyConstraints).toHaveBeenCalledWith({ advanced: [{ torch: true }] });
    $<HTMLButtonElement>(el, ".nx-scan__switch").click();
    await vi.waitFor(() => expect(cam.getUserMedia).toHaveBeenCalledTimes(2));
    expect(cam.getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: { deviceId: { exact: "cam1" } } });
    el.stop();

    fakeCamera();
    const plain = mount("muted");
    await plain.start();
    await sleep(10);
    expect($(plain, ".nx-scan__torch").hidden).toBe(true);
    expect($(plain, ".nx-scan__switch").hidden).toBe(true);
    // El sonido es un interruptor.
    const sound = $<HTMLButtonElement>(plain, ".nx-scan__sound");
    expect(sound.getAttribute("aria-pressed")).toBe("false");
    sound.click();
    expect(plain.muted).toBe(false);
    expect(sound.getAttribute("aria-pressed")).toBe("true");
    plain.stop();
  });

  it("permiso negado: lo dice, ofrece reintentar y avisa con nx-scan-error", async () => {
    fakeCamera({ fail: "NotAllowedError" });
    const el = mount();
    const errors: string[] = [];
    el.addEventListener("nx-scan-error", (e) => errors.push(e.detail.problem));
    await el.start();
    expect(el.state).toBe("unavailable");
    expect(el.problem).toBe("denied");
    expect(errors).toEqual(["denied"]);
    expect($(el, ".nx-scan__msg").textContent).toContain("No hay permiso");
    expect($(el, ".nx-scan__start").hidden).toBe(false);
    expect($(el, ".nx-scan__start").textContent).toBe("Reintentar");
    // Y la entrada manual sigue.
    typeCode(el, "A-1");
    expect($(el, ".nx-scan__code").textContent).toBe("A-1");
  });

  it("sin cámara prendida cuando no se ve: pestaña oculta pausa y reanuda; desconectar apaga", async () => {
    const cam = fakeCamera();
    const el = mount("muted");
    await el.start();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(el.state).toBe("paused");
    expect(cam.track.stop).toHaveBeenCalledTimes(1);
    expect($(el, ".nx-scan__msg").textContent).toContain("pausó");
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(el.state).toBe("live"));
    expect(cam.getUserMedia).toHaveBeenCalledTimes(2);
    el.remove();
    expect(cam.track.stop).toHaveBeenCalledTimes(2);
    expect(el.state).toBe("paused");
  });

  it("detenerse mientras se pide permiso no deja la cámara prendida", async () => {
    const cam = fakeCamera();
    const el = mount();
    const p = el.start();
    el.stop();
    await p;
    expect(el.state).toBe("idle");
    expect(cam.track.stop).toHaveBeenCalled();
  });
});
