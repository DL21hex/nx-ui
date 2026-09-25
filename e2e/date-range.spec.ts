import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("se escribe el período, se ve cómo se entendió y Enter lo aplica al resumen", async ({ page }) => {
  await open(page, "#/date-range");
  const dr = page.locator("#dr-sales");
  const field = dr.locator(".nx-date-range__field");
  await expect(field).toContainText(/1 jul – 30 sept? 2026 · 92 días/);
  await expect(page.locator("#dr-tiles")).toContainText("vs 1 abr – 30 jun 2026");
  await field.click();
  const input = dr.getByRole("textbox", { name: "Escribe un período" });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("este trimestre");
  await input.fill("de marzo a junio");
  await expect(dr.locator(".nx-date-range__said")).toContainText("1 mar – 30 jun 2026 · 122 días");
  await page.keyboard.press("Enter");
  await expect(dr.getByRole("dialog")).toBeHidden();
  await expect(field).toBeFocused();
  await expect(field).toContainText("1 mar – 30 jun 2026 · 122 días");
  await expect(page.locator("#dr-tiles")).toContainText("vs 1 nov 2025 – 28 feb 2026");
  await expect(page.locator("#dr-caption")).toContainText("Ventas por semana · 1 mar – 30 jun 2026");
  await expect(page.locator("#date-range-log")).toContainText("nx-change → 2026-03-01/2026-06-30 vs 2025-11-01/2026-02-28 «de marzo a junio»");
});

test("el calendario se maneja con el teclado y Escape suelta y luego cierra", async ({ page }) => {
  await open(page, "#/date-range");
  const dr = page.locator("#dr-sales");
  await dr.locator(".nx-date-range__field").click();
  // Hoy (25 sept) es el día enfocable del calendario; el valor termina el 30.
  const day = dr.getByRole("gridcell", { name: /30 de septiembre de 2026/ });
  await day.focus();
  await page.keyboard.press("Home");
  await expect(dr.getByRole("gridcell", { name: /27 de septiembre de 2026/ })).toBeFocused();
  await page.keyboard.press("PageUp");
  await expect(dr.getByRole("gridcell", { name: /27 de agosto de 2026/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expect(dr.locator(".nx-date-range__said")).toContainText("27 ago – 3 sept 2026 · 8 días");
  await page.keyboard.press("Escape");
  await expect(dr.getByRole("dialog")).toBeVisible();
  await expect(dr.locator(".nx-date-range__pop")).not.toHaveAttribute("data-picking", "");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(dr.getByRole("dialog")).toBeHidden();
  await expect(dr.locator(".nx-date-range__field")).toContainText("3 – 4 sept 2026 · 2 días");
  await dr.locator(".nx-date-range__field").click();
  await page.keyboard.press("Escape");
  await expect(dr.getByRole("dialog")).toBeHidden();
  await expect(dr.locator(".nx-date-range__field")).toBeFocused();
});

test("atajos, comparación y una frase de ejemplo", async ({ page }) => {
  await open(page, "#/date-range");
  const dr = page.locator("#dr-sales");
  await dr.locator(".nx-date-range__field").click();
  await dr.getByRole("button", { name: "El mes pasado" }).click();
  await expect(dr.locator(".nx-date-range__field")).toContainText("1 – 31 ago 2026 · 31 días");
  await dr.locator(".nx-date-range__field").click();
  await dr.getByRole("radio", { name: "Año anterior" }).check();
  await expect(dr.locator(".nx-date-range__vs")).toHaveText("1 – 31 ago 2025");
  await page.keyboard.press("Escape");
  await expect(page.locator("#dr-tiles")).toContainText("vs 1 – 31 ago 2025");
  await page.getByRole("button", { name: "semana 1 de 2026" }).click();
  await expect(dr.getByRole("textbox")).toHaveValue("semana 1 de 2026");
  await expect(dr.locator(".nx-date-range__said")).toContainText("29 dic 2025 – 4 ene 2026 · 7 días");
});

test("en un <form>: envía periodo[start], periodo[end] y la comparación", async ({ page }) => {
  await open(page, "#/date-range");
  // Abrir y cerrar el panel no agrega nada al <form> (los radios de comparar no son suyos).
  await page.locator("#dr-fiscal .nx-date-range__field").click();
  await page.keyboard.press("Escape");
  await page.locator("#dr-form").getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator("#dr-form-out")).toHaveText("FormData: periodo[start]=2026-04-01 · periodo[end]=2027-03-31 · periodo[compare][start]=2025-04-01 · periodo[compare][end]=2026-03-31");
  const valid = await page.locator("#dr-fiscal").evaluate((el) => {
    const f = el as HTMLElement & { value: unknown; checkValidity?: () => boolean };
    f.value = null;
    return (el.closest("form") as HTMLFormElement).checkValidity();
  });
  expect(valid).toBe(false);
});
