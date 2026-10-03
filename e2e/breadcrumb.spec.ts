import { expect, test, type Locator, type Page } from "@playwright/test";
import { open } from "./helpers";

// La demo «Ruta navegable»: Personas › Empleados › Laura Gómez Restrepo › Contratos › Contrato
// indefinido 2024. Los hijos llegan al abrir cada separador (respondiendo a nx-breadcrumb-expand,
// con 250 ms de espera).

/** Espera a que el menú termine de entrar (anima escala y desplazamiento) antes de medirlo. */
const settled = (menu: Locator) => menu.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

/** El origen de la animación del menú, en px desde su esquina de arriba a la izquierda. */
const origin = (menu: Locator) => menu.evaluate((el) => getComputedStyle(el).transformOrigin.split(" ").map(parseFloat));
const expectOrigin = ([x, y]: number[], [ex, ey]: number[]) => {
  expect(Math.abs(x - ex)).toBeLessThanOrEqual(1);
  expect(Math.abs(y - ey)).toBeLessThanOrEqual(1);
};

/** Dos frames: lo que tarda en repintarse lo que cambió (para comprobar que algo no pasó). */
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

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

test("Tab dentro del menú lo cierra y sigue desde el separador al nivel siguiente; tabindex itinerante", async ({ page }) => {
  await open(page, "#/breadcrumb");
  const bc = page.locator("#bc-demo");
  const sep = bc.getByRole("button", { name: "Otros en Empleados" });
  await sep.click();
  const menu = bc.locator(".nx-breadcrumb__menu");
  await expect(menu.getByRole("textbox")).toBeFocused();
  // Una sola entrada con tabindex 0 (la actual), aunque el foco esté en el buscador.
  await expect(menu.locator('[data-j][tabindex="0"]')).toHaveCount(1);
  await expect(menu.locator('[data-j][tabindex="0"]')).toHaveText(/Laura Gómez Restrepo/);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const focused = menu.locator('[data-j]:focus');
  await expect(focused).toHaveAttribute("tabindex", "0");
  await expect(menu.locator('[data-j][tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  await expect(bc.getByRole("link", { name: "Laura Gómez Restrepo" })).toBeFocused();
});

test("cerca del borde de abajo abre hacia arriba; en RTL se alinea por la derecha del separador", async ({ page }) => {
  await open(page, "#/breadcrumb");
  const bc = page.locator("#bc-demo");
  const sep = bc.getByRole("button", { name: "Otros en Empleados" });
  // La ventana termina justo debajo de la ruta.
  const s0 = (await sep.boundingBox())!;
  await page.setViewportSize({ width: 1440, height: Math.round(s0.y + s0.height + 40) });
  await sep.click();
  const menu = bc.locator(".nx-breadcrumb__menu");
  await expect(menu.getByRole("menuitemradio").first()).toBeVisible();
  await expect(menu).toHaveAttribute("data-up", "");
  await settled(menu);
  let s = (await sep.boundingBox())!;
  let m = (await menu.boundingBox())!;
  expect(Math.abs(m.y + m.height - (s.y - 6))).toBeLessThanOrEqual(2);
  // Crece desde la esquina que toca el separador: abajo a la izquierda.
  expectOrigin(await origin(menu), [0, m.height]);
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator("#bc-app").evaluate((el) => el.setAttribute("dir", "rtl"));
  await sep.click();
  await expect(menu.getByRole("menuitemradio").first()).toBeVisible();
  await expect(menu).not.toHaveAttribute("data-up");
  await settled(menu);
  s = (await sep.boundingBox())!;
  m = (await menu.boundingBox())!;
  expect(Math.abs(m.x + m.width - (s.x + s.width + 8))).toBeLessThanOrEqual(2);
  // En RTL, arriba a la derecha (antes quedaba `top left`, «0px 0px»).
  expectOrigin(await origin(menu), [m.width, 0]);
  await page.keyboard.press("Escape");

  // RTL y hacia arriba: abajo a la derecha.
  await page.setViewportSize({ width: 1440, height: Math.round(s0.y + s0.height + 40) });
  await sep.click();
  await expect(menu.getByRole("menuitemradio").first()).toBeVisible();
  await expect(menu).toHaveAttribute("data-up", "");
  await settled(menu);
  m = (await menu.boundingBox())!;
  expectOrigin(await origin(menu), [m.width, m.height]);
});

test("alto contraste: el separador abierto y la entrada con foco se ven", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "#/breadcrumb");
  const bc = page.locator("#bc-demo");
  const sep = bc.getByRole("button", { name: "Otros en Empleados" });
  await sep.focus();
  await page.keyboard.press("Enter");
  const menu = bc.locator(".nx-breadcrumb__menu");
  await expect(menu.getByRole("textbox")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const ring = (el: Element) => {
    const cs = getComputedStyle(el);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  };
  expect(await sep.evaluate(ring)).toEqual({ style: "solid", width: 2 });
  expect(await menu.locator("[data-j]:focus").evaluate(ring)).toEqual({ style: "solid", width: 2 });
});

test.describe("táctil", () => {
  // Una tableta: con 390 px la ruta queda en «‹ Padre» y no hay separadores.
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1024, height: 768 } });

  test("con más de 7 hermanos el foco va al actual (sin teclado); escribir en el buscador no cierra el menú", async ({ page, browserName }) => {
    // Firefox no emula un puntero grueso (`isMobile`): ahí `(pointer: fine)` sigue valiendo.
    test.skip(browserName !== "chromium", "puntero grueso solo emulado en Chromium");
    await open(page, "#/breadcrumb");
    expect(await page.evaluate(() => matchMedia("(pointer: fine)").matches)).toBe(false);
    const bc = page.locator("#bc-demo");
    const menu = bc.locator(".nx-breadcrumb__menu");
    const sep = bc.getByRole("button", { name: "Otros en Empleados" });
    await sep.tap();
    await expect(menu.getByRole("menuitemradio", { name: "Laura Gómez Restrepo" })).toBeFocused();
    const input = menu.getByRole("textbox");
    await input.tap();
    await expect(input).toBeFocused();
    await input.pressSequentially("and");
    // El teclado virtual desplaza o encoge la ventana: el menú se recoloca en vez de cerrarse.
    await page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("scroll"));
    });
    await frames(page);
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitemradio", { name: /Andrés/ })).toBeVisible();
  });
});
