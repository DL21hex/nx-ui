import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("el flotante de un padre: buscador con foco, filtra sin tildes, Escape lo cierra y devuelve el foco", async ({ page }) => {
  await open(page, "#/sidemenu");
  const menu = page.locator("#stage-menu nx-sidemenu");
  const parent = menu.getByRole("button", { name: "Seguridad Física" });
  await parent.click();
  const search = page.getByRole("combobox");
  await expect(search).toBeFocused();
  await search.fill("porteria");
  const options = page.getByRole("option");
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText("Portería");
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
  await expect(parent).toBeFocused();
});

test("abrir otro padre cierra el anterior", async ({ page }) => {
  await open(page, "#/sidemenu");
  const menu = page.locator("#stage-menu nx-sidemenu");
  await menu.getByRole("button", { name: "Seguridad Física" }).click();
  await expect(page.getByRole("combobox")).toBeVisible();
  await menu.getByRole("button", { name: "Ventas" }).click();
  await expect(menu.locator(":popover-open")).toHaveCount(1);
});

test("móvil: la hamburguesa abre el drawer y un enlace lo cierra", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, "#/");
  const nav = page.locator("#nav");
  await expect(nav).toBeHidden();
  await page.getByRole("button", { name: "Abrir menú" }).first().click();
  await expect(nav).toBeVisible();
  await nav.getByRole("link", { name: "Tabla" }).click();
  await expect(nav).toBeHidden();
  await expect(page).toHaveURL(/#\/grid$/);
});
