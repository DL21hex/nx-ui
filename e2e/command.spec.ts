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

test("movida a otro contenedor estando abierta, Ctrl+K la vuelve a abrir", async ({ page }) => {
  await open(page, "#/command");
  const cmd = page.locator("#cmd");
  await page.keyboard.press(`${mod(page)}+k`);
  await expect(cmd).toBeVisible();
  // Un layout que la mueve (un portal): el navegador la oculta sin `beforetoggle`.
  await page.evaluate(() => document.querySelector("main")!.append(document.querySelector("#cmd")!));
  await expect(cmd).toBeHidden();
  await page.keyboard.press(`${mod(page)}+k`);
  await expect(cmd).toBeVisible();
  await expect(cmd.getByRole("combobox")).toBeFocused();
});

test('hotkey="/" con teclado español (Shift+7) abre; escribir «15/09» en la caja no la cierra', async ({ page }) => {
  await open(page, "#/command");
  const cmd = page.locator("#cmd");
  await page.evaluate(() => {
    document.querySelector("#cmd")!.setAttribute("hotkey", "/");
    (document.activeElement as HTMLElement | null)?.blur?.();
  });
  // En el teclado español la barra es Shift+7: llega `key: "/"` con `shiftKey`.
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", code: "Digit7", shiftKey: true, bubbles: true, cancelable: true })));
  await expect(cmd).toBeVisible();
  const box = cmd.getByRole("combobox");
  await expect(box).toBeFocused();
  await page.keyboard.type("15/09");
  await box.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "/", code: "Digit7", shiftKey: true, bubbles: true, cancelable: true })));
  await expect(cmd).toBeVisible();
  await expect(box).toHaveValue("15/09");
});

test("con source lento: bajar con ↓ antes de la respuesta no hace saltar el resaltado; escribir vuelve arriba", async ({ page }) => {
  await page.route("**/e2e/buscar*", async (route) => {
    await new Promise((r) => setTimeout(r, 1200));
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "r1", label: "Tarifa de acero", group: "Registros" }, { id: "r2", label: "Tabla de fletes", group: "Registros" }]) });
  });
  await open(page, "#/command");
  const cmd = page.locator("#cmd");
  await page.evaluate(() => document.querySelector("#cmd")!.setAttribute("source", "/e2e/buscar"));
  await page.keyboard.press(`${mod(page)}+k`);
  await page.keyboard.type("ta");
  await expect(cmd.locator(".nx-command__spin")).toBeVisible();
  const selected = cmd.locator('[role="option"][aria-selected="true"]');
  await expect(selected).toHaveCount(1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const before = await selected.locator(".nx-command__label").textContent();
  await expect(cmd.getByRole("option", { name: /Tarifa de acero/ })).toBeVisible({ timeout: 5000 });
  await expect(selected.locator(".nx-command__label")).toHaveText(before!);
  // Una consulta nueva: el resaltado vuelve a la primera fila y la lista arriba.
  await page.keyboard.type("r");
  await expect(cmd.locator('[role="option"]').first()).toHaveAttribute("aria-selected", "true");
  expect(await cmd.locator(".nx-command__list").evaluate((el) => el.scrollTop)).toBe(0);
});

test("las acciones de la cuenta que cambian con la paleta abierta aparecen sin cerrarla", async ({ page }) => {
  await open(page, "#/account");
  const cmd = page.locator("#cmd");
  await expect(page.locator("#acc .nx-account__card")).toBeVisible();
  await page.keyboard.press(`${mod(page)}+k`);
  await page.keyboard.type("oscuro");
  await expect(cmd.getByRole("option", { name: /Tema: Oscuro/ })).toBeVisible();
  await page.keyboard.press(`${mod(page)}+a`);
  await page.keyboard.type("barranquilla");
  await expect(cmd.getByRole("option", { name: /Sede Barranquilla/ })).toHaveCount(0);
  // La cuenta recibe otra sede con la paleta abierta (la respuesta del servidor llegó tarde).
  await page.evaluate(() => {
    const acc = document.querySelector("#acc") as HTMLElement & { tenants: object[] };
    acc.tenants = [...acc.tenants, { id: "baq", name: "Crear Colombia S.A.S.", detail: "Sede Barranquilla" }];
  });
  await page.keyboard.type(" ");
  await expect(cmd.getByRole("option", { name: /Sede Barranquilla/ })).toBeVisible();
});

test("el lector oye cuántos resultados hay o «Sin resultados»; en un submenú la caja dice «En: …»", async ({ page }) => {
  await open(page, "#/command");
  const cmd = page.locator("#cmd");
  await page.keyboard.press(`${mod(page)}+k`);
  const status = cmd.locator('[role="status"]');
  await page.keyboard.type("tabla");
  await expect(status).toHaveText(/^\d+ resultados?$/);
  await page.keyboard.press(`${mod(page)}+a`);
  await page.keyboard.type("zzzz");
  await expect(status).toHaveText("Sin resultados");
  await page.keyboard.press(`${mod(page)}+a`);
  await page.keyboard.type("cambiar pa");
  await page.keyboard.press("Enter");
  await expect(cmd.getByRole("combobox")).toHaveAccessibleDescription("En: Cambiar paleta");
});
