import { expect, test, type Page } from "@playwright/test";
import { mod, open } from "./helpers";

const field = (page: Page, name: string) => page.locator(`#pf-demo [name="${name}"]`);

test("un ejemplo llena el formulario: valores, confianza, evidencia y deshacer", async ({ page }) => {
  await open(page, "#/paste-fill");
  const pf = page.locator("#pf-demo");
  await page.getByRole("button", { name: "Correo formal" }).click();
  await expect(pf.locator(".nx-pf__msg")).toHaveText("9 campos llenados");
  await expect(field(page, "razon_social")).toHaveValue("Aceros del Caribe S.A.S.");
  await expect(field(page, "nit")).toHaveValue("900.359.742-3");
  await expect(field(page, "ciudad")).toHaveValue("08001");
  await expect(field(page, "celular")).toHaveValue("315 678 2341");
  await expect(field(page, "pago")).toHaveValue("c30");
  await expect(field(page, "monto")).toHaveValue("$ 18.450.000");
  await expect(field(page, "entrega")).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
  await expect(field(page, "nit")).toHaveAccessibleDescription("Llenado desde el texto pegado · Confianza 98 %");
  // El anillo del NIT queda encima del campo.
  const ring = await pf.locator('.nx-pf__ring[data-name="nit"]').boundingBox();
  const box = await field(page, "nit").boundingBox();
  expect(Math.abs(ring!.x - box!.x)).toBeLessThan(2);
  expect(Math.abs(ring!.y - box!.y)).toBeLessThan(2);
  // Evidencia: pasar por el campo ilumina su tramo; clic en un tramo enfoca su campo.
  await field(page, "correo").hover();
  await expect(pf.locator('.nx-pf__text mark[data-name="correo"]')).toHaveClass(/is-lit/);
  await pf.locator('.nx-pf__text mark[data-name="monto"]').click();
  await expect(field(page, "monto")).toBeFocused();
  // Ctrl+Z fuera de un campo lo deshace todo.
  await page.locator("#pf-demo .pf-form__title").click();
  await page.keyboard.press(`${mod(page)}+z`);
  await expect(field(page, "nit")).toHaveValue("");
  await expect(field(page, "ciudad")).toHaveValue("");
  await expect(pf.locator(".nx-pf__zone")).toBeVisible();
});

test("pegar sobre el formulario llena; pegar en un campo, no", async ({ page, browserName }) => {
  await open(page, "#/paste-fill");
  const text = "Empaques Andinos SAS · NIT 901458223-0 · cel 3007894512";
  const paste = (selector: string) =>
    page.locator(selector).evaluate((el, t) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", t);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, text);
  await paste("#pf-demo [name=contacto]");
  await expect(field(page, "nit")).toHaveValue("");
  await paste("#pf-demo .pf-form");
  await expect(field(page, "nit")).toHaveValue("901.458.223-0");
  await expect(field(page, "celular")).toHaveValue("300 789 4512");
  await expect(field(page, "razon_social")).toHaveValue("Empaques Andinos S.A.S.");
  // Con el portapapeles de verdad (solo Chromium deja concederlo en pruebas).
  test.skip(browserName !== "chromium", "portapapeles real solo en Chromium");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator("#pf-demo [data-act=close]").click();
  await page.evaluate(() => navigator.clipboard.writeText("NIT 890.903.938-8\nCel. 315 678 2341"));
  await page.locator("#pf-demo .pf-form__title").click();
  await page.keyboard.press("Control+v");
  await expect(field(page, "nit")).toHaveValue("890.903.938-8");
});

test("no pisa lo escrito: sugiere, y lo dudoso queda para revisar", async ({ page }) => {
  await open(page, "#/paste-fill");
  const pf = page.locator("#pf-demo");
  await field(page, "correo").fill("compras@proveedor.co");
  await page.getByRole("button", { name: "Firma con NIT mal escrito" }).click();
  await expect(field(page, "correo")).toHaveValue("compras@proveedor.co");
  await expect(pf.locator(".nx-pf__pill")).toHaveText("2 por revisar");
  const row = pf.locator('.nx-pf__list li[data-name="correo"]');
  await expect(row).toContainText("Tienes «compras@proveedor.co»");
  // El panel puede estar plegado en pantallas angostas: se abre para decidir.
  if (!(await row.isVisible())) await pf.getByRole("button", { name: "Evidencia" }).click();
  await row.getByRole("button", { name: "Usar" }).click();
  await expect(field(page, "correo")).toHaveValue("lrojas@eltornillo.com.co");
  // «1 por revisar» lleva al NIT, cuyo dígito de verificación no cuadra.
  await pf.locator(".nx-pf__pill").click();
  await expect(field(page, "nit")).toBeFocused();
  await expect(field(page, "nit")).toHaveAttribute("data-nx-fill", "low");
  await expect(pf.locator('.nx-pf__list li[data-name="nit"]')).toContainText("debería ser 5");
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await page.keyboard.type("5");
  await expect(field(page, "nit")).toHaveAttribute("data-nx-fill", "you");
  await expect(pf.locator(".nx-pf__pill")).toBeHidden();
});

test("con servidor: primero lo local, luego lo del servidor y su nota; si falla, avisa", async ({ page }) => {
  await open(page, "#/paste-fill");
  const pf = page.locator("#pf-demo");
  await page.locator("input[name=pf-mode][value=server]").check();
  await page.getByRole("button", { name: "WhatsApp informal" }).click();
  await expect(field(page, "nit")).toHaveValue("901.458.223-0");
  await expect(pf.locator(".nx-pf__msg")).toContainText("Consultando al servidor");
  await expect(pf.locator(".nx-pf__notes")).toContainText("maestro de terceros", { timeout: 10_000 });
  await expect(pf.locator(".nx-pf__msg")).toHaveText("9 campos llenados");
  await page.locator("input[name=pf-mode][value=fail]").check();
  await page.getByRole("button", { name: "Correo formal" }).click();
  await expect(pf.locator(".nx-pf__err")).toHaveText("No se pudo consultar el servidor; quedó lo que se leyó aquí.", { timeout: 10_000 });
  await expect(field(page, "nit")).toHaveValue("900.359.742-3");
});
