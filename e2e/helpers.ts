import type { Locator, Page } from "@playwright/test";

/** Abre una página de la galería y espera a que sus componentes estén registrados. */
export async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => !!customElements.get("nx-grid") && !!customElements.get("nx-dialog"));
  // Tema fijo: las capturas y los contrastes no dependen del sistema.
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
}

/** El modificador de los atajos (Cmd en macOS/WebKit de escritorio, Ctrl en el resto). */
export const mod = (page: Page) => (page.context().browser()?.browserType().name() === "webkit" ? "Meta" : "Control");

/**
 * Pega `text` en el elemento con un `paste` sintético, sin tocar el portapapeles del sistema (solo
 * Chromium deja conceder ese permiso en pruebas). Firefox ignora el `clipboardData` del constructor
 * de `ClipboardEvent` (el evento llega con un DataTransfer vacío): por eso va como propiedad propia.
 */
export const paste = (target: Locator, text: string) =>
  target.evaluate((el, t) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", t);
    const e = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clipboardData", { value: dt });
    el.dispatchEvent(e);
  }, text);
