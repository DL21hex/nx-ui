import { expect, test, type Locator, type Page } from "@playwright/test";
import { open } from "./helpers";

// La demo «Ruta navegable»: Personas › Empleados › Laura Gómez Restrepo › Contratos › Contrato
// indefinido 2024. Los hijos llegan al abrir cada separador (respondiendo a nx-breadcrumb-children,
// con 250 ms de espera).

/** Espera a que el menú termine de entrar (anima escala y desplazamiento) antes de medirlo. */
const settled = (menu: Locator) => menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

/** El ancho de la demo, con su control deslizante. */
const setWidth = (page: Page, px: number) =>
  page.locator("#bc-width").evaluate((el, v) => {
    const input = el as HTMLInputElement;
    input.value = String(v);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, px);

test("el separador abre los hermanos justo debajo de él; Esc cierra y devuelve el foco", async ({ page }) => {
  await open(page, "#/breadcrumb");
  const bc = page.locator("#bc-demo");
  const sep = bc.getByRole("button", { name: "Otros en Empleados" });
  await sep.click();
  await expect(sep).toHaveAttribute("aria-expanded", "true");
  const menu = bc.locator(".nx-breadcrumb__menu");
  await expect(menu.getByRole("menuitemradio", { name: "Andrés Pardo Villa" })).toBeVisible();
  // 14 personas: trae buscador, con el foco (puntero fino).
  await expect(menu.getByRole("textbox")).toBeFocused();
  await expect(menu.getByRole("menuitemradio", { name: "Laura Gómez Restrepo" })).toHaveAttribute("aria-checked", "true");

  await settled(menu);
  const s = (await sep.boundingBox())!;
  const m = (await menu.boundingBox())!;
  expect(Math.abs(m.y - (s.y + s.height + 6))).toBeLessThanOrEqual(2);
  expect(Math.abs(m.x - Math.max(8, s.x - 8))).toBeLessThanOrEqual(2);

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(sep).toBeFocused();
  await expect(sep).toHaveAttribute("aria-expanded", "false");
});

test("si no cabe, los niveles del medio pasan a «…»; por debajo de 480 px queda «‹ Padre»", async ({ page }) => {
  await open(page, "#/breadcrumb");
  const bc = page.locator("#bc-demo");
  const more = bc.locator(".nx-breadcrumb__more");
  await expect(more).toBeHidden();

  await setWidth(page, 520);
  await expect(more).toBeVisible();
  await expect(bc.getByRole("link", { name: "Personas" })).toBeVisible();
  await expect(bc.locator('[aria-current="page"]')).toContainText("Contrato indefinido 2024");
  await more.click();
  const menu = bc.locator(".nx-breadcrumb__menu");
  await expect(menu.getByRole("menuitem").first()).toHaveText("Empleados");
  await settled(menu);
  const b = (await more.boundingBox())!;
  const m = (await menu.boundingBox())!;
  expect(m.y).toBeGreaterThanOrEqual(b.y + b.height);
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();

  await setWidth(page, 400);
  const back = bc.locator(".nx-breadcrumb__back");
  await expect(back).toBeVisible();
  await expect(back).toHaveText("Contratos");
  await expect(bc.locator(".nx-breadcrumb__list")).toBeHidden();
});
