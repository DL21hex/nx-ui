import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("entiende cuentas, relativas y flechas; el total va en vivo y en letras", async ({ page }) => {
  await open(page, "#/number");
  const inv = page.locator("#num-invoice");
  // Un <label> que envuelve al elemento nombra el campo.
  const price = inv.getByRole("spinbutton", { name: "Precio unitario" });
  await price.click();
  await price.press("ControlOrMeta+a");
  await price.pressSequentially("=1.200.000/2");
  await expect(inv.locator("#num-price .nx-number__hint")).toHaveText("= $ 600.000");
  await price.press("Enter");
  await expect(price).toHaveValue("600.000");
  await expect(page.locator("#number-log li").first()).toHaveText("nx-change → #num-price = 600000 («$ 600.000»)");

  // «+15%» sobre lo confirmado.
  await price.press("ControlOrMeta+a");
  await price.pressSequentially("+15%");
  await expect(inv.locator("#num-price .nx-number__hint")).toHaveText("= $ 690.000");
  await price.press("Tab");
  await expect(price).toHaveValue("690.000");

  // ↑/↓ en la cantidad (Mayús ×10), y Escape deshace desde el foco.
  const qty = inv.getByRole("spinbutton", { name: "Cantidad" });
  await qty.focus();
  await qty.press("ArrowUp");
  await expect(qty).toHaveValue("13");
  await qty.press("Shift+ArrowUp");
  await expect(qty).toHaveValue("23");
  await qty.press("Escape");
  await expect(qty).toHaveValue("12");
  await qty.press("ArrowDown");
  await qty.press("Enter");
  await expect(qty).toHaveValue("11");

  // Total: 11 × 690.000 − 5 % + 19 % IVA (redondeado al peso), en vivo y en letras.
  const total = page.getByRole("spinbutton", { name: "Total a pagar" });
  await expect(total).toHaveValue("8.580.495");
  await expect(inv.locator("#num-total .nx-number__words")).toHaveText("Ocho millones quinientos ochenta mil cuatrocientos noventa y cinco pesos m/cte");

  // La rueda del mouse no cambia el valor.
  await qty.hover();
  await page.mouse.wheel(0, -300);
  await expect(qty).toHaveValue("11");

  // Un descuento de 150 % se recorta y se avisa.
  const disc = inv.getByRole("spinbutton", { name: "Descuento" });
  await disc.click();
  await disc.press("ControlOrMeta+a");
  await disc.pressSequentially("150");
  await disc.press("Tab");
  await expect(disc).toHaveValue("100");
  await expect(inv.locator("#num-disc .nx-number__note")).toHaveText(/El máximo es 100\s?%/);
  await expect(total).toHaveValue("0");
});

test("un error se dice y no deja enviar; required, reset y FormData", async ({ page }) => {
  await open(page, "#/number");
  const form = page.locator("#num-form");
  const field = form.getByRole("spinbutton", { name: "Anticipo de viáticos" });
  await form.getByRole("button", { name: "Solicitar" }).click();
  expect(await page.locator("#num-advance").evaluate((el) => (el as HTMLElement & { validationMessage: string }).validationMessage)).toBe("Escribe un valor");
  await expect(page.locator("#num-form-out")).toHaveText("FormData: —");

  await field.fill("");
  await field.pressSequentially("=2+x");
  await expect(form.locator(".nx-number__hint")).toHaveText('no entiendo "x"');
  await field.press("Enter");
  await expect(field).toHaveAttribute("aria-invalid", "");
  await expect(page.locator("#num-form-out")).toHaveText("FormData: —");

  await field.press("ControlOrMeta+a");
  await field.pressSequentially("1,5M");
  await expect(form.locator(".nx-number__hint")).toHaveText("= $ 1.500.000");
  await field.press("Enter");
  await expect(page.locator("#num-form-out")).toHaveText('FormData: {"anticipo":"1500000"}');

  await form.getByRole("button", { name: "Limpiar" }).click();
  await expect(field).toHaveValue("");
});

test("pegar desde Excel queda limpio; en inglés «2.5k»", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "#/number");
  const field = page.locator("#num-try input");
  await field.click();
  await field.press("ControlOrMeta+a");
  await page.evaluate(() => navigator.clipboard.writeText("$ (1.450.000,00)\t"));
  await field.press("ControlOrMeta+v");
  await expect(field).toHaveValue("-1.450.000");
  await field.press("Tab");
  await expect(page.locator("#num-try .nx-number__words")).toHaveText("Menos un millón cuatrocientos cincuenta mil pesos m/cte");

  const usd = page.getByRole("spinbutton", { name: "Import invoice (USD)" });
  await usd.click();
  await usd.press("ControlOrMeta+a");
  await usd.pressSequentially("2.5k");
  await usd.press("Enter");
  await expect(usd).toHaveValue("2,500");
  await expect(page.locator("#num-usd .nx-number__words")).toHaveText("Dos mil quinientos dólares");
});

test("la tabla de ejemplos prueba en el campo", async ({ page }) => {
  await open(page, "#/number");
  await page.getByRole("button", { name: "Probar «*12»" }).click();
  await expect(page.locator("#num-try .nx-number__hint")).toHaveText("= $ 12.000.000");
  await expect(page.locator("#num-try input")).toBeFocused();
});
