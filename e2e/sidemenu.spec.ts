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
  await nav.getByRole("button", { name: "Datos y tablas" }).click();
  // Dentro del drill-down los hijos son opciones de un listbox (`<a role="option" href>`), no enlaces.
  await nav.getByRole("option", { name: "Tabla", exact: true }).click();
  await expect(nav).toBeHidden();
  await expect(page).toHaveURL(/#\/grid$/);
});

test("compacto: la etiqueta flotante sale junto al riel con el teclado (también en RTL), se va al abrir un flotante", async ({ page }) => {
  await open(page, "#/sidemenu");
  await page.getByLabel("Compacto", { exact: true }).check();
  const menu = page.locator("#stage-menu nx-sidemenu");
  await expect(menu).toHaveAttribute("collapsed", "");
  // El riel se angosta con una transición: se mide cuando termina.
  await menu.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  const tip = menu.locator(".nx-sidemenu__tip");
  const row = menu.getByRole("link", { name: "Tablero" });
  const check = async (rtl: boolean) => {
    // Con el teclado (no con un clic): Tab desde la fila de arriba.
    await menu.getByRole("link", { name: "Inicio" }).focus();
    await page.keyboard.press("Tab");
    await expect(row).toBeFocused();
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText("Tablero");
    const t = (await tip.boundingBox())!;
    const r = (await row.boundingBox())!;
    const rail = (await menu.boundingBox())!;
    expect(Math.abs(t.y + t.height / 2 - (r.y + r.height / 2))).toBeLessThanOrEqual(2);
    if (rtl) expect(Math.abs(t.x + t.width - (rail.x - 6))).toBeLessThanOrEqual(2);
    else expect(Math.abs(t.x - (rail.x + rail.width + 6))).toBeLessThanOrEqual(2);
  };
  await check(false);
  // Abrir un flotante la esconde.
  const parent = menu.getByRole("button", { name: "Ventas" });
  await parent.focus();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Ventas" })).toBeVisible();
  await expect(tip).toBeHidden();
  await page.keyboard.press("Escape");
  await page.getByLabel("RTL").check();
  await menu.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
  await check(true);
});

test.describe("táctil", () => {
  test.use({ hasTouch: true, viewport: { width: 1280, height: 800 } });
  test("compacto: un toque no deja la etiqueta flotante pegada", async ({ page }) => {
    await open(page, "#/sidemenu");
    // Todo con toques: el ratón virtual de Playwright, quieto sobre el riel, la mostraría al repintar.
    await page.getByLabel("Compacto", { exact: true }).tap();
    const menu = page.locator("#stage-menu nx-sidemenu");
    await expect(menu).toHaveAttribute("collapsed", "");
    await menu.getByRole("link", { name: "Tablero" }).tap();
    await page.waitForTimeout(200);
    await expect(menu.locator(".nx-sidemenu__tip")).toBeHidden();
  });
});

test("con el flotante abierto y una consulta, un cambio de items no lo cierra; Esc repinta y deja el foco en el padre", async ({ page }) => {
  await open(page, "#/sidemenu");
  const menu = page.locator("#stage-menu nx-sidemenu");
  await menu.getByRole("button", { name: "Seguridad Física" }).click();
  const search = page.getByRole("combobox");
  await search.fill("ron");
  await menu.evaluate((el) => {
    const m = el as unknown as { items: { id: string; badge?: number }[] };
    m.items = m.items.map((it) => (it.id === "tablero" ? { ...it, badge: 7 } : it));
  });
  await page.waitForTimeout(100);
  await expect(search).toBeVisible();
  await expect(search).toHaveValue("ron");
  await expect(search).toBeFocused();
  await expect(menu.getByRole("link", { name: /Tablero/ }).locator(".nx-badge")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
  await expect(menu.getByRole("link", { name: /Tablero/ }).locator(".nx-badge")).toHaveText("7");
  await expect(menu.getByRole("button", { name: "Seguridad Física" })).toBeFocused();
});

test("si otro oyente cancela la apertura, el menú no queda esperando; contraer con uno abierto nombra las filas", async ({ page }) => {
  await open(page, "#/sidemenu");
  const menu = page.locator("#stage-menu nx-sidemenu");
  await menu.evaluate((el) => el.querySelector(".nx-flyout")!.addEventListener("beforetoggle", (e) => e.preventDefault(), { once: true }));
  const parent = menu.getByRole("button", { name: "Ventas" });
  await parent.click();
  await page.waitForTimeout(100);
  await expect(page.getByRole("dialog", { name: "Ventas" })).toBeHidden();
  // Un cambio de items se pinta en el acto (no queda pendiente de un flotante que nunca abrió).
  await menu.evaluate((el) => {
    const m = el as unknown as { items: { id: string; badge?: number }[] };
    m.items = m.items.map((it) => (it.id === "tablero" ? { ...it, badge: 7 } : it));
  });
  await expect(menu.getByRole("link", { name: /Tablero/ }).locator(".nx-badge")).toHaveText("7");
  await menu.getByRole("button", { name: "Ventas" }).click();
  await expect(page.getByRole("dialog", { name: "Ventas" })).toBeVisible();
  await menu.evaluate((el) => ((el as unknown as { collapsed: boolean }).collapsed = true));
  await expect(menu.getByRole("link", { name: "Tablero (7)" })).toHaveAttribute("aria-label", "Tablero (7)");
  await expect(page.getByRole("dialog", { name: "Ventas" })).toBeVisible();
});

test("Tab desde el buscador del flotante lo cierra y sigue desde su padre", async ({ page }) => {
  await open(page, "#/sidemenu");
  const menu = page.locator("#stage-menu nx-sidemenu");
  await menu.getByRole("button", { name: "Ventas" }).click();
  const search = page.getByRole("combobox");
  await expect(search).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(search).toBeHidden();
  await expect(menu.getByRole("button", { name: "Inventario" })).toBeFocused();
});
