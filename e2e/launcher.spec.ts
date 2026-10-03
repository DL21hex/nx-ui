import { expect, test } from "@playwright/test";
import { open } from "./helpers";

/** Con puntero (`hover: hover`), las vistas de una tarjeta están ocultas a la vista (opacity 0, sin
 *  clics) hasta pasar el puntero o enfocarlas; siguen en el árbol de accesibilidad. */
test("vistas con puntero: ocultas no reciben clics; al pasar el puntero se ven y se usan", async ({ page }) => {
  await open(page, "#/launcher");
  const card = page.locator('[data-la-demo="talento"] .nx-launcher__card.has-views').first();
  await expect(card).toBeVisible();
  const views = card.locator(".nx-launcher__views");
  const first = views.locator(".nx-launcher__view").first();
  await page.evaluate(() => {
    const w = window as unknown as { picks: string[] };
    w.picks = [];
    document.addEventListener("nx-launcher-select", (e) => w.picks.push(`${(e as CustomEvent).detail.item.label} › ${(e as CustomEvent).detail.view?.label ?? "-"}`), true);
  });
  await page.mouse.move(0, 0);
  await expect(views).toHaveCSS("opacity", "0");
  // Oculta solo a la vista: sin `visibility` (ni en la transición de salida), y el punto donde está la
  // vista no es de la vista.
  expect(await views.evaluate((el) => [getComputedStyle(el).visibility, getComputedStyle(el).transitionProperty])).toEqual(["visible", expect.not.stringContaining("visibility")]);
  const hit = await first.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !!at && (at === el || el.contains(at));
  });
  expect(hit).toBe(false);
  // Con el puntero encima, se ven y el clic llega a la vista.
  await card.hover();
  await expect(views).toHaveCSS("opacity", "1");
  await first.click();
  expect(await page.evaluate(() => (window as unknown as { picks: string[] }).picks)).toEqual(["Certificados laborales › Con salario"]);
});

test("vistas con Tab: el foco las muestra (:focus-within) sin el puntero", async ({ page }) => {
  await open(page, "#/launcher");
  const card = page.locator('[data-la-demo="talento"] .nx-launcher__card.has-views').first();
  await expect(card).toBeVisible();
  await page.mouse.move(0, 0);
  const views = card.locator(".nx-launcher__views");
  await card.locator(".nx-launcher__link").focus();
  await page.keyboard.press("Tab");
  await expect(views.locator(".nx-launcher__view").first()).toBeFocused();
  await expect(views).toHaveCSS("opacity", "1");
  await expect(views).toHaveCSS("pointer-events", "auto");
});
