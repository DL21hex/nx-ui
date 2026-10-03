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
  // `checkValidity()` del elemento solo pregunta: no lo marca.
  expect(await sel.evaluate((el) => (el as unknown as { checkValidity(): boolean }).checkValidity())).toBe(false);
  await expect(sel.locator(".nx-select__field")).not.toHaveAttribute("aria-invalid", "true");
  await sel.evaluate((el) => el.addEventListener("invalid", () => ((el as HTMLElement).dataset.gotInvalid = "1")));
  await form.getByRole("button", { name: "Enviar" }).click();
  await expect(out).toHaveText("FormData: —");
  // El host (FACE) recibe `invalid` y el navegador enfoca su ancla, el campo (donde sale el globo).
  await expect(sel).toHaveAttribute("data-got-invalid", "1");
  await expect(sel.locator(".nx-select__field")).toBeFocused();
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

test("<label for> nombra el combobox y su clic lo enfoca", async ({ page }) => {
  await open(page, "#/select");
  await page.locator("#sel-form").evaluate((form) =>
    form.insertAdjacentHTML("afterend", '<div id="lf-wrap"><label for="lf-sel">Jefe directo</label><nx-select id="lf-sel"></nx-select></div>'),
  );
  const combo = page.locator("#lf-wrap").getByRole("combobox", { name: "Jefe directo" });
  await expect(combo).toBeVisible();
  await page.locator("#lf-wrap label").click();
  await expect(combo).toBeFocused();
});

test("dentro de un <nx-dialog> sin autofocus, el foco entra al diálogo (no se queda en el buscador oculto)", async ({ page }) => {
  await open(page, "#/select");
  await page.evaluate(() => {
    document.body.insertAdjacentHTML(
      "beforeend",
      '<nx-dialog id="sel-dlg" heading="Asignar"><label for="sel-dlg-f">Responsable</label><nx-select id="sel-dlg-f"></nx-select></nx-dialog>',
    );
    void (document.getElementById("sel-dlg") as unknown as { show(): Promise<unknown> }).show();
  });
  await expect(page.locator("#sel-dlg")).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!document.activeElement && document.getElementById("sel-dlg")!.contains(document.activeElement))).toBe(true);
  await expect(page.locator("#sel-dlg-f .nx-select__field")).toBeFocused();
});

test("alto contraste: el foco del campo y del buscador se ve (contorno, no sombra)", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "#/select");
  const sel = page.locator("#sel-single");
  const field = sel.locator(".nx-select__field");
  await field.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(field).toBeFocused();
  const ring = (el: Element) => {
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth), color: cs.outlineColor };
  };
  const f = await field.evaluate(ring);
  expect(f.style).toBe("solid");
  expect(f.width).toBeGreaterThanOrEqual(2);
  expect(f.color).not.toMatch(/rgba\(.*, 0\)|transparent/);
  await page.keyboard.press("Enter");
  const input = sel.locator(".nx-select__input");
  await expect(input).toBeFocused();
  const i = await input.evaluate(ring);
  expect(i.style).toBe("solid");
  expect(i.color).not.toMatch(/rgba\(.*, 0\)|transparent/);
});
