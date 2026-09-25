import { expect, test } from "@playwright/test";
import { mod, open } from "./helpers";

test("A · el modal: foco en el primer campo, Tab no se escapa, Escape con cambios avisa, el foco vuelve", async ({ page }) => {
  await open(page, "#/dialog");
  const btn = page.locator("#dlg-new-btn .nx-button__btn");
  await btn.click();
  const dlg = page.locator("#dlg-new");
  await expect(dlg).toBeVisible();
  const first = dlg.locator("input[name=prov]");
  await expect(first).toBeFocused();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await first.fill("Aceros");
  await page.keyboard.press("Escape");
  const guard = dlg.locator(".nx-dialog__guard");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Descartar" }).click();
  await expect(dlg).toBeHidden();
  await expect(btn).toBeFocused();
});

test("A · sin JS: <button popovertarget> lo abre", async ({ page }) => {
  await open(page, "#/dialog");
  await page.getByRole("button", { name: /Abrir sin JS/ }).click();
  await expect(page.locator("#dlg-new")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#dlg-new")).toBeHidden();
});

test("B · paneles apilados: migas, y «atrás» del navegador cierra el de arriba", async ({ page }) => {
  await open(page, "#/dialog");
  await page.locator("#dlg-orders .dlg-item").first().click();
  await page.locator("#dlg-order").getByRole("button", { name: /Ver proveedor/ }).click();
  await page.locator("#dlg-prov").getByRole("button", { name: /Ver última factura/ }).click();
  const inv = page.locator("#dlg-inv");
  await expect(inv).toBeVisible();
  await expect(inv.locator(".nx-dialog__crumb")).toHaveCount(2);
  await page.goBack();
  await expect(inv).toBeHidden();
  await expect(page.locator("#dlg-prov")).toBeVisible();
  await page.locator("#dlg-prov .nx-dialog__crumb").first().click();
  await expect(page.locator("#dlg-prov")).toBeHidden();
  await expect(page.locator("#dlg-order")).toBeVisible();
});

test("C · anular sin preguntar y deshacer con Ctrl+Z", async ({ page }) => {
  await open(page, "#/dialog");
  const row = page.locator("#dlg-undo .dlg-undo-row").first();
  await row.getByRole("button", { name: "Anular" }).click();
  await expect(row).toBeHidden();
  await expect(page.locator(".nx-toast")).toContainText("anulada");
  await page.locator("body").press(`${mod(page)}+z`);
  await expect(row).toBeVisible();
  await expect(page.locator(".nx-toast").last()).toContainText("Deshecho");
});

test("D · confirmación con impacto: un clic no basta, mantener pulsado sí; un bloqueo deshabilita", async ({ page }) => {
  await open(page, "#/dialog");
  await page.locator("#dlg-c1 .nx-button__btn").click();
  const dlg = page.locator("nx-dialog.nx-confirm");
  await expect(dlg.locator(".nx-confirm__item")).toHaveCount(3);
  const ok = dlg.locator("nx-button").nth(1).locator(".nx-button__btn");
  await ok.click();
  await expect(dlg).toBeVisible();
  await ok.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator(".nx-toast").last()).toContainText("OC-2291 anulada");

  await page.locator("#dlg-c2 .nx-button__btn").click();
  const blocked = page.locator("nx-dialog.nx-confirm");
  await expect(blocked.locator(".nx-confirm__block")).toContainText("ya tiene un pago");
  await expect(blocked.locator("nx-button").nth(1)).toHaveAttribute("disabled", "");
});

test("móvil: el panel es una hoja desde abajo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, "#/dialog");
  await page.locator("#dlg-orders .dlg-item").first().click();
  const order = page.locator("#dlg-order");
  await expect(order).toBeVisible();
  await expect(order.locator(".nx-dialog__handle")).toBeVisible();
  const box = await order.boundingBox();
  expect(Math.round(box!.width)).toBe(390);
  expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(799);
});
