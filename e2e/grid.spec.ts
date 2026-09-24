import { expect, test, type Page } from "@playwright/test";
import { mod, open } from "./helpers";

const grid = (page: Page) => page.locator("#grid-demo");
const cell = (page: Page, r: number, c: number) => grid(page).locator(`.nx-grid__row[data-r="${r}"] > [data-c="${c}"]`);

test("teclado: mover, seleccionar un rango y ver la suma en el pie", async ({ page }) => {
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft"); // Monto
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const foot = grid(page).locator(".nx-grid__foot");
  await expect(foot).toContainText("3 celdas");
  await expect(foot).toContainText("Suma");
});

test("editar escribiendo, deshacer y rehacer (también con los botones)", async ({ page }) => {
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  const monto = cell(page, 0, 7);
  const before = await monto.textContent();
  await page.keyboard.type("123");
  await page.keyboard.press("Enter");
  await expect(monto).toHaveText("$ 123");
  await expect(monto).toHaveClass(/is-edited/);
  await page.keyboard.press(`${mod(page)}+z`);
  await expect(monto).toHaveText(before!);
  await expect(monto).not.toHaveClass(/is-edited/);
  await page.getByRole("button", { name: /Rehacer/ }).click();
  await expect(monto).toHaveText("$ 123");
});

test("copiar y pegar con el portapapeles del sistema (TSV, como Excel)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "los permisos de portapapeles solo se conceden en Chromium");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`${mod(page)}+c`);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("\n")).toHaveLength(2);
  // Pegar dos montos desde «Excel».
  await page.evaluate(() => navigator.clipboard.writeText("111\n222"));
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod(page)}+v`);
  await expect(cell(page, 1, 7)).toHaveText("$ 111");
  await expect(cell(page, 2, 7)).toHaveText("$ 222");
});

test("filtrar con una frase y con una barra del histograma", async ({ page }) => {
  await open(page, "#/grid");
  const ask = grid(page).getByRole("textbox", { name: /Filtra con tus palabras/ });
  await ask.fill("pendientes de más de 5 millones");
  await ask.press("Enter");
  const chips = grid(page).locator(".nx-grid__chip");
  await expect(chips).toHaveCount(2);
  await grid(page).locator(".nx-grid__chips .nx-grid__clear").click();
  await expect(chips).toHaveCount(0);
  const estado = grid(page).locator(".nx-grid__th", { hasText: "Estado" });
  await estado.locator(".nx-grid__hbar").first().click();
  await expect(chips).toHaveCount(1);
  await expect(grid(page).locator(".nx-grid__foot")).toContainText("de 600 filas");
});

test("el desplazamiento virtual pinta pocas filas aunque haya 600", async ({ page }) => {
  await open(page, "#/grid");
  const rows = grid(page).locator(".nx-grid__row");
  const n = await rows.count();
  expect(n).toBeLessThan(60);
  await grid(page).locator(".nx-grid__scroll").evaluate((s) => (s.scrollTop = 32 * 400));
  await expect(grid(page).locator('.nx-grid__row[data-r="405"]')).toBeVisible();
});
