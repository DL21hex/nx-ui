import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("se contesta con el teclado, cambia según las respuestas y muestra los resultados", async ({ page }) => {
  await open(page, "#/survey");
  await page.evaluate(() => localStorage.removeItem("nx-ui-demo-encuesta"));
  await page.reload();
  const s = page.locator("#survey-demo");
  await page.getByRole("button", { name: "Una a la vez" }).click();
  await s.getByRole("button", { name: "Empezar" }).click();
  await expect(s.locator("legend")).toContainText("¿en qué área trabajas?");
  await page.keyboard.press("b");
  await expect(s.locator("legend")).toContainText("trabajar en Logística");
  await page.keyboard.press("1");
  await page.keyboard.press("0");
  await expect(s.locator(".nx-survey__title")).toContainText("¿Qué es lo que más te gusta de Logística?");
  await page.keyboard.type("El equipo");
  await page.keyboard.press("Enter");
  await expect(s.locator("legend")).toContainText("¿Cómo te has sentido");
  await page.keyboard.press("5");
  await expect(s.locator("legend")).toContainText("beneficios");
  await page.keyboard.press("a");
  await page.keyboard.press("Enter");
  await expect(s.locator("legend")).toContainText("Ordena");
  await page.keyboard.press("Enter");
  await expect(s.locator(".nx-survey__title")).toContainText("¿Cuánto tardas");
  await page.keyboard.press("Enter");
  await page.keyboard.press("a");
  await expect(s.locator(".nx-survey__done h2")).toHaveText("¡Gracias!");
  await expect(s.locator(".nx-survey__results h3")).toContainText("241 respuestas");
  await expect(s.locator(".nx-survey__rbar[data-on]").first()).toContainText("Logística");
});

test("guarda el borrador y ofrece continuar", async ({ page }) => {
  await open(page, "#/survey");
  const s = page.locator("#survey-demo");
  await s.getByRole("button", { name: /Empezar|Continuar/ }).click();
  await page.keyboard.press("c");
  await expect(s.locator("legend")).toContainText("Mantenimiento");
  await page.reload();
  await s.getByRole("button", { name: "Continuar donde quedaste" }).click();
  await expect(s.locator("legend")).toContainText("trabajar en Mantenimiento");
});

test("ficha: lo contestado queda como líneas con su eco, y se vuelve con un clic", async ({ page }) => {
  await open(page, "#/survey");
  await page.evaluate(() => localStorage.removeItem("nx-ui-demo-encuesta"));
  await page.reload();
  const s = page.locator("#survey-demo");
  await s.getByRole("button", { name: "Empezar" }).click();
  await page.keyboard.press("b");
  const row = s.locator('.nx-survey__row[data-state="done"]').first();
  await expect(row.locator(".nx-survey__row-answer")).toHaveText("🚚 Logística");
  await expect(row.locator(".nx-survey__echo")).toContainText("respondió lo mismo");
  await expect(s.locator('.nx-survey__row[data-state="current"] legend')).toContainText("trabajar en Logística");
  await page.keyboard.press("3");
  await expect(s.locator('.nx-survey__row[data-q="mejorar"]')).toHaveAttribute("data-state", "current");
  await row.locator(".nx-survey__row-btn").click();
  await expect(s.locator('.nx-survey__row[data-state="current"] legend')).toContainText("¿en qué área trabajas?");
});

test("conversación: pregunta en burbujas y la respuesta queda como burbuja propia", async ({ page }) => {
  await open(page, "#/survey");
  await page.evaluate(() => localStorage.removeItem("nx-ui-demo-encuesta"));
  await page.reload();
  const s = page.locator("#survey-demo");
  await page.getByRole("button", { name: "Conversación" }).click();
  await s.getByRole("button", { name: "Empezar" }).click();
  await expect(s.locator(".nx-survey__composer .nx-survey__opt")).toHaveCount(4);
  await page.keyboard.press("c");
  await expect(s.locator(".nx-survey__me .nx-survey__bubble")).toHaveText("🔧 Mantenimiento");
  await expect(s.locator(".nx-survey__say").last()).toContainText("trabajar en Mantenimiento");
});

test("tarjetas: la tarjeta contestada sale y el eco flota", async ({ page }) => {
  await open(page, "#/survey");
  await page.evaluate(() => localStorage.removeItem("nx-ui-demo-encuesta"));
  await page.reload();
  const s = page.locator("#survey-demo");
  await page.getByRole("button", { name: "Tarjetas" }).click();
  await s.getByRole("button", { name: "Empezar" }).click();
  await page.keyboard.press("a");
  await expect(s.locator(".nx-survey__echo--float")).toContainText("respondió lo mismo");
  await expect(s.locator(".nx-survey__card.is-top legend")).toContainText("trabajar en Producción");
});
