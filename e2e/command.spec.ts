import { expect, test } from "@playwright/test";
import { mod, open } from "./helpers";

test("⌘/Ctrl+K abre la paleta; lo del menú, las acciones y el servidor se encuentran", async ({ page }) => {
  await open(page, "#/command");
  const cmd = page.locator("#cmd");
  await page.keyboard.press(`${mod(page)}+k`);
  await expect(cmd).toBeVisible();
  await expect(cmd.getByRole("combobox")).toBeFocused();
  await page.keyboard.type("np");
  await expect(cmd.getByRole("option").first()).toContainText("Nuevo pedido");
  await page.keyboard.press(`${mod(page)}+a`);
  await page.keyboard.type("bandeja");
  await expect(cmd.getByRole("option").first()).toContainText("Bandeja");
  await page.keyboard.press("Enter");
  await expect(cmd).toBeHidden();
  await expect(page).toHaveURL(/#\/inbox$/);
  // Lo elegido vuelve como reciente.
  await page.keyboard.press(`${mod(page)}+k`);
  await expect(cmd.locator(".nx-command__group-h").first()).toHaveText("Recientes");
  await page.keyboard.type("aceros");
  await expect(cmd.locator(".nx-command__group-h", { hasText: "Órdenes de compra" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cmd).toBeHidden();
});

test("un submenú cambia la paleta de colores; Escape vuelve un nivel", async ({ page }) => {
  await open(page, "#/command");
  const cmd = page.locator("#cmd");
  await page.locator(".cmd-open").click();
  await page.keyboard.type("cambiar pa");
  await page.keyboard.press("Enter");
  await expect(cmd.locator(".nx-command__crumb")).toHaveText("Cambiar paleta");
  await page.keyboard.press("Escape");
  await expect(cmd.locator(".nx-command__crumb")).toHaveCount(0);
  await expect(cmd).toBeVisible();
  await page.keyboard.type("cambiar pa");
  await page.keyboard.press("Enter");
  await page.keyboard.type("bosque");
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-nx-palette", "bosque");
  await expect(page.locator(".cmd-open")).toBeFocused();
});
