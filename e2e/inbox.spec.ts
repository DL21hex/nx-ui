import { expect, test } from "@playwright/test";
import { mod, open } from "./helpers";

test("se aprueba con A, el siguiente queda listo, y Ctrl+Z lo devuelve", async ({ page }) => {
  await open(page, "#/inbox");
  const inbox = page.locator("#inbox-demo");
  await inbox.locator(".nx-inbox__list").focus();
  await expect(inbox.locator(".nx-inbox__d-title")).toHaveText("OC-2291 · Aceros del Caribe");
  await page.keyboard.press("a");
  await expect(inbox.locator(".nx-inbox__n")).toHaveText("7");
  await expect(inbox.locator(".nx-inbox__d-title")).toHaveText("OC-2310 · Empaques Andinos");
  await expect(page.locator(".nx-toast__msg").last()).toHaveText("Aprobado: OC-2291 · Aceros del Caribe");
  await page.keyboard.press(`${mod(page)}+z`);
  await expect(inbox.locator(".nx-inbox__n")).toHaveText("8");
  await expect(inbox.locator(".nx-inbox__d-title")).toHaveText("OC-2291 · Aceros del Caribe");
  await expect(page.locator("#inbox-log")).toContainText("nx-inbox-undo → 2291");
});

test("un ítem bloqueado no se aprueba; el rechazo lleva su motivo", async ({ page }) => {
  await open(page, "#/inbox");
  const inbox = page.locator("#inbox-demo");
  await inbox.locator(".nx-inbox__list").focus();
  await page.keyboard.press("j");
  await expect(inbox.locator(".nx-inbox__block")).toContainText("cámara de comercio");
  await expect(inbox.locator('.nx-inbox__detail [data-act="approve"]')).toBeDisabled();
  await page.keyboard.press("a");
  await expect(inbox.locator(".nx-inbox__n")).toHaveText("8");
  await page.keyboard.press("r");
  await expect(inbox.locator("textarea")).toBeFocused();
  await page.keyboard.type("Proveedor sin papeles al día");
  await page.keyboard.press("Enter");
  await expect(inbox.locator(".nx-inbox__n")).toHaveText("7");
  await expect(page.locator("#inbox-log")).toContainText("nx-inbox-decide → reject 2310 · «Proveedor sin papeles al día»");
});
