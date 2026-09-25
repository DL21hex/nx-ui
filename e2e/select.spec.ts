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
