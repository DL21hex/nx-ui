import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("«¿Cómo…?» al asistente: un recorrido sobre la pantalla, paso a paso", async ({ page }) => {
  await open(page, "#/th");
  await page.locator("#th-agent").getByRole("button", { name: /Cómo pido/ }).click();
  const card = page.locator(".nx-tour__card");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toBeFocused();
  await expect(card.locator(".nx-tour__count")).toHaveText("1 de 5");
  await page.keyboard.press("ArrowRight");
  await expect(card.locator(".nx-tour__title")).toContainText("dilo con tus palabras");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Enter");
  await expect(card).toHaveCount(0);
  await expect(page.locator("#th-agent")).toContainText("¡Eso es todo!");
});
