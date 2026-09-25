import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("la cifra se desglosa, se abre un término y se vuelve con Escape", async ({ page }) => {
  await open(page, "#/explain");
  const fig = page.locator("nx-explain[endpoint*=factura]");
  const card = page.locator(".nx-explain-card:popover-open");
  await fig.focus();
  await page.keyboard.press("Enter");
  await expect(card).toBeFocused();
  await expect(card.locator(".nx-explain__value")).toHaveText("$ 10.601.500");
  await expect(card.locator(".nx-explain__ok")).toHaveText("Cuadra", { timeout: 10_000 });
  await expect(card.locator(".nx-explain__delta")).toHaveText("▲ 14,2 % vs. la factura anterior");
  await card.getByRole("button", { name: /Ver el desglose de Subtotal/ }).click();
  await expect(card.locator(".nx-explain__value")).toHaveText("$ 9.100.000");
  await page.keyboard.press("Escape");
  await expect(card.locator(".nx-explain__value")).toHaveText("$ 10.601.500");
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(fig).toBeFocused();
});

test("si los términos no dan la cifra, lo dice", async ({ page }) => {
  await open(page, "#/explain");
  await page.locator("nx-explain[endpoint*=bancos]").click();
  await expect(page.locator(".nx-explain-card .nx-explain__bad")).toHaveText("Los términos suman $ 1.278.300.000, no $ 1.284.500.000", { timeout: 10_000 });
});
