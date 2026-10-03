import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("buscar por nombre o cédula, elegir, y queda compacto como un select", async ({ page }) => {
  await open(page, "#/select");
  const sel = page.locator("#sel-single");
  await sel.locator(".nx-select__field").click();
  const input = sel.locator(".nx-select__input");
  await expect(input).toBeFocused();
  // Sin tilde encuentra «Rincón».
  await input.pressSequentially("rincon");
  const first = page.getByRole("option").first();
  await expect(first).toContainText(/Rincón/);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  const value = await sel.evaluate((el) => (el as unknown as { value: string }).value);
  expect(value).not.toBe("");
  await expect(sel.locator(".nx-select__field")).toContainText("Rincón");
});

test("en un <form>: required vacío no se envía y queda marcado; Enter en el buscador no envía", async ({ page }) => {
  await open(page, "#/select");
  const form = page.locator("#sel-form");
  const sel = page.locator("#sel-form-field");
  const out = page.locator("#sel-form-out");
  await form.getByRole("button", { name: "Enviar" }).click();
  await expect(out).toHaveText("FormData: —");
  expect(await sel.evaluate((el) => (el as unknown as { checkValidity(): boolean }).checkValidity())).toBe(false);
  await expect(sel.locator(".nx-select__field")).toHaveAttribute("aria-invalid", "true");
  // Enter sin nada resaltado (sin resultados) no envía el formulario.
  await sel.locator(".nx-select__field").click();
  const input = sel.locator(".nx-select__input");
  await expect(input).toBeFocused();
  await input.pressSequentially("zzz");
  await page.keyboard.press("Enter");
  await expect(out).toHaveText("FormData: —");
  // Eligiendo, sí.
  await input.fill("rincon");
  await page.keyboard.press("Enter");
  await expect(sel.locator(".nx-select__field")).not.toHaveAttribute("aria-invalid", "true");
  await form.getByRole("button", { name: "Enviar" }).click();
  await expect(out).toContainText('"responsable"');
  // «Restablecer» (un <nx-button type="reset">) vuelve al valor inicial: vacío.
  await form.getByRole("button", { name: "Restablecer" }).click();
  expect(await sel.evaluate((el) => (el as unknown as { value: string }).value)).toBe("");
});
