import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

// `BarcodeDetector` no existe en Chromium para Linux ni en Firefox/WebKit, y en CI no hay cámara:
// se simulan con `addInitScript`. El detector «ve» lo que se encola con `__scan(code, delay, hold)`;
// la cámara es un <canvas> animado (`captureStream`), así la prueba corre en cualquier navegador.
// La última prueba usa la cámara falsa de Chromium (`--use-fake-device-for-media-stream`).
const FAKE_DETECTOR = () => {
  const q: { code: string; format?: string; at: number; until: number }[] = [];
  class BarcodeDetector {
    static async getSupportedFormats() {
      return ["ean_13", "code_128", "qr_code"];
    }
    async detect() {
      const c = q[0];
      const now = performance.now();
      if (!c || now < c.at) return [];
      if (!c.until) q.shift();
      else if (now > c.until) return q.shift(), [];
      return [{ rawValue: c.code, format: c.format ?? "ean_13", boundingBox: { x: 100, y: 80, width: 120, height: 60 }, cornerPoints: [] }];
    }
  }
  const w = window as unknown as Record<string, unknown>;
  w.BarcodeDetector = BarcodeDetector;
  w.__scan = (code: string, delay = 0, hold = 0) => q.push({ code, at: performance.now() + delay, until: hold ? performance.now() + delay + hold : 0 });
  w.__tracks = [] as MediaStreamTrack[];
  if (navigator.mediaDevices) {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 240;
      const g = c.getContext("2d")!;
      let t = 0;
      setInterval(() => {
        g.fillStyle = "#234";
        g.fillRect(0, 0, 320, 240);
        g.fillStyle = "#fff";
        g.fillRect((t += 4) % 320, 100, 40, 40);
      }, 50);
      const stream = c.captureStream(20);
      (w.__tracks as MediaStreamTrack[]).push(...stream.getTracks());
      return stream;
    };
  }
};

const count = (page: Page) => page.locator("#scan-count");
const row = (page: Page, code: string) => count(page).locator(`.nx-scan__item[data-code="${code}"]`);
const log = (page: Page) => page.locator("#scan-log li");
/** Solo las líneas de `nx-scan` (las de `nx-scan-count` llegan también cuando responde `source`). */
const scanLog = (page: Page) => log(page).filter({ hasText: "nx-scan →" });
/**
 * Una pistola lectora: las teclas del código y un Enter, a velocidad de máquina, sobre el foco. Se
 * despachan en la página porque `keyboard.type` de Playwright va y vuelve por el protocolo en cada
 * tecla y, con varias pruebas en paralelo, puede dejar más de 60 ms entre teclas (ya no sería una
 * pistola). Devuelve si el Enter se consumió.
 */
const gun = (page: Page, code: string) =>
  page.evaluate((code) => {
    let enter!: KeyboardEvent;
    for (const key of [...code, "Enter"]) {
      enter = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(enter);
    }
    return enter.defaultPrevented;
  }, code);

test.describe("sin cámara", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => delete (window as unknown as Record<string, unknown>).BarcodeDetector);
  });

  test("lo dice claro, y a mano se cuenta con la descripción, faltantes, sobrantes y deshacer", async ({ page }) => {
    await open(page, "#/scan");
    await expect(count(page).locator(".nx-scan__msg")).toHaveText(/no lee códigos con la cámara/);
    await expect(count(page).locator(".nx-scan__photo")).toBeHidden();
    const field = count(page).getByRole("textbox", { name: "Código" });
    await field.fill("7707123450011");
    await field.press("Enter");
    await expect(field).toBeFocused();
    await expect(field).toHaveValue("");
    await expect(row(page, "7707123450011").locator(".nx-scan__name")).toHaveText("Lámina HR 3 mm 4×8");
    await expect(row(page, "7707123450011").locator(".nx-scan__meta")).toHaveText("7707123450011 · esperadas 40 · contadas 1");
    await expect(row(page, "7707123450011").locator(".nx-scan__badge")).toHaveText("Faltan 39");
    await expect(count(page).locator(".nx-scan__sr")).toHaveText(/7707123450011: 1|Lámina HR 3 mm 4×8: 1 de 40 und/);
    // 38 más de una vez, y la cantidad escrita a mano.
    await field.fill("38*7707123450011");
    await field.press("Enter");
    await expect(row(page, "7707123450011").locator(".nx-scan__badge")).toHaveText("Faltan 1");
    const qty = row(page, "7707123450011").getByRole("textbox", { name: "Cantidad de Lámina HR 3 mm 4×8" });
    await qty.fill("40");
    await qty.press("Enter");
    await expect(row(page, "7707123450011")).toHaveAttribute("data-status", "ok");
    await expect(row(page, "7707123450011").locator(".nx-scan__badge")).toHaveText("Completo");
    // El disco no venía en la orden: sobra. La etiqueta de lote no existe.
    await page.getByRole("button", { name: 'Simular la lectura de Disco de corte 7"' }).click();
    await page.getByRole("button", { name: "Simular la lectura de Etiqueta de lote" }).click();
    await expect(row(page, "7707123450073").locator(".nx-scan__badge")).toHaveText("Sobran 1");
    await expect(row(page, "LOTE-AC-0873").locator(".nx-scan__meta")).toHaveText("Código sin registrar");
    await expect(count(page).locator(".nx-scan__sums")).toContainText("sobran 1");
    // Deshacer la última (la etiqueta) con el aviso.
    await page.locator(".nx-toast").filter({ hasText: "LOTE-AC-0873" }).getByRole("button", { name: "Deshacer" }).click();
    await expect(row(page, "LOTE-AC-0873")).toHaveCount(0);
    await expect(log(page).first()).toContainText("nx-scan-count → 2 líneas");
    // −: el disco vuelve a 0. Como la orden espera 0 (`expected: 0`), la línea se queda, completa.
    await row(page, "7707123450073").getByRole("button", { name: 'Restar uno a Disco de corte 7"' }).click();
    await expect(row(page, "7707123450073")).toHaveAttribute("data-status", "ok");
    await expect(count(page).locator(".nx-scan__sums")).toContainText("Todo cuadra");
  });

  test("pistola lectora: una ráfaga en la página es una lectura; una persona tecleando no", async ({ page }) => {
    await open(page, "#/scan");
    // Sin foco en ningún campo: la ráfaga + Enter, a la velocidad de una pistola.
    // La pistola es del último escáner que se tocó: el de la recepción.
    await count(page).locator(".nx-scan__title").click();
    expect(await gun(page, "7707123450028")).toBe(true);
    await expect(scanLog(page).first()).toContainText('nx-scan → #scan-count {"code":"7707123450028","format":"ean_13","via":"wedge"}');
    await expect(row(page, "7707123450028").locator(".nx-scan__name")).toHaveText('Tubo estructural 2" × 6 m');
    // Una persona escribiendo (teclas de verdad, 120 ms entre una y otra) no dispara nada.
    await page.keyboard.type("7707123450035", { delay: 120 });
    await page.keyboard.press("Enter");
    await page.waitForTimeout(300);
    await expect(row(page, "7707123450035")).toHaveCount(0);
    // Con el foco en un botón, el Enter de la ráfaga se consume: no activa el botón (vaciaría la lista).
    await page.locator("#scan-reset").focus();
    expect(await gun(page, "7707123450028")).toBe(true);
    await expect(row(page, "7707123450028").getByRole("textbox")).toHaveValue("2");
    // En otro campo, lo que se teclea es de ese campo: no se roba.
    const other = page.locator("#scan-single .nx-scan__input");
    await other.focus();
    await page.keyboard.type("7707123450042", { delay: 0 });
    await expect(other).toHaveValue("7707123450042");
    await expect(row(page, "7707123450042")).toHaveCount(0);
    // …y Enter ahí busca en el modo único.
    await page.keyboard.press("Enter");
    await expect(page.locator("#scan-single .nx-scan__product")).toHaveText('Soldadura E6013 ⅛" · caja 20 kg · caja');
    await expect(scanLog(page).first()).toContainText('#scan-single {"code":"7707123450042","format":"ean_13"');
    await expect(row(page, "7707123450042")).toHaveCount(0);
  });

  test("el botón de la demo que simula una pistola lectora", async ({ page }) => {
    await open(page, "#/scan");
    await page.locator("#scan-wedge").click();
    await expect(count(page).locator(".nx-scan__item")).toHaveCount(1);
    await expect(scanLog(page).first()).toContainText('"via":"wedge"');
  });
});

test.describe("con cámara (simulada)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(FAKE_DETECTOR);
  });

  test("activar, leer (una vez aunque siga en cuadro), destello, y apagar al ocultarse", async ({ page }) => {
    await open(page, "#/scan");
    const viewer = count(page).locator(".nx-scan__viewer");
    await expect(count(page).locator(".nx-scan__photo")).toBeVisible();
    await count(page).getByRole("button", { name: "Activar cámara" }).click();
    await expect(viewer).toHaveAttribute("data-state", "live");
    await expect(count(page).getByRole("button", { name: "Cerrar la cámara" })).toBeVisible();
    await expect(count(page).getByRole("button", { name: "Sonido al leer" })).toHaveAttribute("aria-pressed", "true");
    // La caja queda 2,5 s frente a la cámara: cuenta una sola vez.
    await page.evaluate(() => (window as unknown as { __scan: (c: string, d: number, h: number) => void }).__scan("7707123450011", 100, 2500));
    await expect(count(page).locator(".nx-scan__box")).toBeVisible();
    await expect(row(page, "7707123450011")).toBeVisible();
    await page.waitForTimeout(2800);
    await expect(row(page, "7707123450011").getByRole("textbox")).toHaveValue("1");
    // Sale y vuelve a entrar: otra.
    await page.evaluate(() => (window as unknown as { __scan: (c: string, d: number) => void }).__scan("7707123450011", 0));
    await expect(row(page, "7707123450011").getByRole("textbox")).toHaveValue("2");
    await expect(scanLog(page).first()).toContainText('"via":"camera"');
    // La pestaña se oculta: la cámara se apaga, y vuelve al mostrarse.
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(viewer).toHaveAttribute("data-state", "paused");
    expect(await page.evaluate(() => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.every((t) => t.readyState === "ended"))).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(viewer).toHaveAttribute("data-state", "live");
    // Salir de la página apaga todo.
    await page.evaluate(() => (location.hash = "#/number"));
    await expect(page.locator("#scan-count")).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __tracks: MediaStreamTrack[] }).__tracks.every((t) => t.readyState === "ended"))).toBe(true);
  });

  test("modo único: lee, se detiene y muestra el producto", async ({ page }) => {
    await open(page, "#/scan");
    const single = page.locator("#scan-single");
    await single.getByRole("button", { name: "Activar cámara" }).click();
    await expect(single.locator(".nx-scan__viewer")).toHaveAttribute("data-state", "live");
    await page.evaluate(() => (window as unknown as { __scan: (c: string) => void }).__scan("7707123450066"));
    await expect(single.locator(".nx-scan__viewer")).toHaveAttribute("data-state", "done");
    await expect(single.locator(".nx-scan__code")).toHaveText("7707123450066");
    await expect(single.locator(".nx-scan__product")).toHaveText("Anticorrosivo gris · galón · gal");
    await expect(single.getByRole("button", { name: "Escanear otro" })).toBeVisible();
    await expect(single.locator(".nx-scan__sr")).toHaveText(/Código leído: 7707123450066/);
  });
});

test("la cámara falsa de Chromium: getUserMedia de verdad, video en vivo y apagado al cerrar", async ({ browserName, playwright, launchOptions, baseURL }) => {
  test.skip(browserName !== "chromium", "solo Chromium tiene la cámara falsa por línea de comandos");
  const browser = await playwright.chromium.launch({ ...launchOptions, args: [...(launchOptions.args ?? []), "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  try {
    const page = await browser.newPage({ baseURL });
    await page.addInitScript(() => {
      // Solo el detector: la cámara es la de Chromium.
      (window as unknown as Record<string, unknown>).BarcodeDetector = class {
        static async getSupportedFormats() {
          return ["ean_13"];
        }
        async detect() {
          return [];
        }
      };
    });
    await open(page, "#/scan");
    await count(page).getByRole("button", { name: "Activar cámara" }).click();
    await expect(count(page).locator(".nx-scan__viewer")).toHaveAttribute("data-state", "live");
    await expect.poll(() => count(page).locator("video").evaluate((v: HTMLVideoElement) => v.videoWidth)).toBeGreaterThan(0);
    await count(page).getByRole("button", { name: "Cerrar la cámara" }).click();
    await expect(count(page).locator(".nx-scan__viewer")).toHaveAttribute("data-state", "idle");
    expect(await count(page).locator("video").evaluate((v: HTMLVideoElement) => v.srcObject)).toBeNull();
    await expect(count(page).getByRole("button", { name: "Activar cámara" })).toBeFocused();
  } finally {
    await browser.close();
  }
});
