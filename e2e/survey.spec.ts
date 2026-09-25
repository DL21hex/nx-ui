import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("se contesta con el teclado, cambia según las respuestas y muestra los resultados", async ({ page }) => {
  await open(page, "#/survey");
  await page.evaluate(() => localStorage.removeItem("nx-ui-demo-encuesta"));
  await page.reload();
  const s = page.locator("#survey-demo");
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

test("lo respondido queda arriba y se vuelve con un clic", async ({ page }) => {
  await open(page, "#/survey");
  await page.evaluate(() => localStorage.removeItem("nx-ui-demo-encuesta"));
  await page.reload();
  const s = page.locator("#survey-demo");
  await s.getByRole("button", { name: "Empezar" }).click();
  await page.keyboard.press("b");
  const row = s.locator(".nx-survey__trail li").first();
  await expect(row.locator(".nx-survey__trail-a")).toHaveText("🚚 Logística");
  await expect(s.locator("legend")).toContainText("trabajar en Logística");
  await expect(s.locator(".nx-survey__count")).toHaveText("Pregunta 2 de 7");
  await page.keyboard.press("3");
  await expect(s.locator(".nx-survey__q")).toHaveAttribute("data-q", "mejorar");
  await row.getByRole("button").click();
  await expect(s.locator("legend")).toContainText("¿en qué área trabajas?");
  await expect(s.locator(".nx-survey__trail")).toHaveCount(0);
  await s.getByRole("button", { name: "Siguiente" }).click();
  await expect(s.locator("legend")).toContainText("trabajar en Logística");
});
