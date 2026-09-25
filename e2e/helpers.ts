import type { Page } from "@playwright/test";

/** Abre una página de la galería y espera a que sus componentes estén registrados. */
export async function open(page: Page, hash: string): Promise<void> {
  await page.goto(`/${hash}`);
  await page.waitForFunction(() => !!customElements.get("nx-grid") && !!customElements.get("nx-dialog"));
  // Tema fijo: las capturas y los contrastes no dependen del sistema.
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
}

/** El modificador de los atajos (Cmd en macOS/WebKit de escritorio, Ctrl en el resto). */
export const mod = (page: Page) => (page.context().browser()?.browserType().name() === "webkit" ? "Meta" : "Control");
