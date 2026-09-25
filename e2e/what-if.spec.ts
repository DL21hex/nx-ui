import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const demo = (page: Page) => page.locator("#what-if-demo");
const card = (page: Page, label: string) => demo(page).locator(".nx-what-if__card", { hasText: label });

test("el teclado mueve los supuestos y los resultados llegan del backend, con la base y la diferencia", async ({ page }) => {
  await open(page, "#/what-if");
  const steel = demo(page).getByRole("slider", { name: "Precio del acero" });
  await expect(steel).toHaveAttribute("aria-valuetext", "US$ 780");
  await expect(card(page, "Margen bruto").locator(".nx-what-if__num")).toHaveText(/22,1\s?%/);

  await steel.focus();
  await page.keyboard.press("PageUp"); // +10 pasos de US$ 5
  await expect(steel).toHaveAttribute("aria-valuetext", /^US\$ 830, \+6,4\s?% vs\. base$/);
  await page.keyboard.press("Shift+ArrowRight");
  await expect(demo(page).locator(".nx-what-if__row").first().locator(".nx-what-if__delta")).toHaveText(/\+12,8\s?% vs\. base/);
  // El margen empeora: rojo, en puntos porcentuales, con la base al lado.
  const margin = card(page, "Margen bruto");
  await expect(margin).toHaveAttribute("data-tone", "bad");
  await expect(margin.locator(".nx-what-if__chip")).toHaveText(/^-\d+(,\d)? p\. p\.$/);
  await expect(margin.locator(".nx-what-if__base")).toHaveText(/Base 22,1\s?%/);
  await expect(demo(page).locator(".nx-what-if__results")).not.toHaveAttribute("data-busy", "");

  // Acero al máximo: la advertencia del margen, en la región de estado.
  await page.keyboard.press("End");
  await expect(steel).toHaveAttribute("aria-valuetext", /^US\$ 1\.014/);
  await expect(demo(page).locator(".nx-what-if__notes")).toContainText("El margen bruto cae a 12,8 %");
  await expect(demo(page).locator('.nx-what-if__note[data-tone="warning"]')).toBeVisible();

  // Restablecer ese supuesto: todo vuelve a la base y la nota se va.
  await demo(page).getByRole("button", { name: "Restablecer Precio del acero" }).click();
  await expect(steel).toBeFocused();
  await expect(steel).toHaveAttribute("aria-valuetext", "US$ 780");
  await expect(demo(page).locator(".nx-what-if__note")).toHaveCount(0);
  await expect(margin).toHaveAttribute("data-tone", "flat");
});

test("con espera entre cambios: diez teclas seguidas no son diez cálculos, y el anterior se cancela", async ({ page }) => {
  await open(page, "#/what-if");
  await expect(card(page, "Margen bruto")).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { calls: number; aborted: number };
    w.calls = 0;
    w.aborted = 0;
    const real = window.fetch;
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("/demo/what-if")) {
        w.calls++;
        init?.signal?.addEventListener("abort", () => w.aborted++);
      }
      return real(input, init);
    }) as typeof fetch;
  });
  const volume = demo(page).getByRole("slider", { name: "Volumen de ventas" });
  await volume.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  await expect(volume).toHaveAttribute("aria-valuetext", /^129\.600 u\., -10\s?% vs\. base$/);
  await expect(card(page, "Utilidad operativa")).toHaveAttribute("data-tone", "bad");
  const calls = await page.evaluate(() => (window as unknown as { calls: number }).calls);
  expect(calls).toBeGreaterThanOrEqual(1);
  expect(calls).toBeLessThan(5);

  // Un cambio mientras el cálculo anterior sigue llegando: ese se cancela.
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(350); // 250 ms de espera + el comienzo de la respuesta
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => page.evaluate(() => (window as unknown as { aborted: number }).aborted)).toBeGreaterThanOrEqual(1);
  await expect(volume).toHaveAttribute("aria-valuetext", /^129\.600 u\./);
  await expect(demo(page).locator(".nx-what-if__results")).not.toHaveAttribute("data-busy", "");
});

test("escribir el valor, guardar como…, comparar, cargar, renombrar y borrar", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "#/what-if");
  const trm = demo(page).locator(".nx-what-if__row", { hasText: "Tasa de cambio" });
  await trm.locator(".nx-what-if__big").click();
  const typed = trm.getByRole("textbox", { name: "Escribir Tasa de cambio USD/COP" });
  await expect(typed).toBeFocused();
  await typed.fill("4.600");
  await typed.press("Enter");
  await expect(trm.locator(".nx-what-if__big")).toBeFocused();
  await expect(trm.locator(".nx-what-if__big")).toHaveText("$ 4.600");
  await expect(trm.locator(".nx-what-if__delta")).toHaveText(/\+10,8\s?% vs\. base/);
  // Con movimiento reducido el número llega directo.
  await expect(card(page, "Costo de materia prima")).toHaveAttribute("data-tone", "bad");

  // La columna «Actual» aparece mientras no esté guardado.
  const table = demo(page).locator(".nx-what-if__table");
  await expect(table.locator("thead th.is-current")).toHaveText("Actual");

  await demo(page).getByRole("button", { name: "Guardar como…" }).click();
  const name = demo(page).getByRole("textbox", { name: "Nombre del escenario" });
  await expect(name).toBeFocused();
  await expect(name).toHaveValue("Escenario 3");
  await name.fill("TRM a 4.600");
  await name.press("Enter");
  await expect(page.locator("#what-if-log li").first()).toContainText("nx-what-if-save → save «TRM a 4.600»");
  await expect(table.locator('thead th[aria-current="true"] .nx-what-if__sname')).toHaveText("TRM a 4.600");
  await expect(table.locator("thead th.is-current")).toHaveCount(0);
  // La mejor utilidad es la del plan agresivo; el menor costo de materia prima, la base.
  await expect(table.locator("tr", { hasText: "Utilidad operativa" }).locator(".is-best")).toContainText("(mejor)");

  // Cargar un escenario guardado mueve los deslizadores.
  await demo(page).getByRole("button", { name: "Cargar Plan agresivo de ventas" }).click();
  await expect(demo(page).getByRole("slider", { name: "Horas extra" })).toHaveAttribute("aria-valuetext", /^2\.400 h\/mes/);
  await expect(table.locator('thead th[aria-current="true"] .nx-what-if__sname')).toHaveText("Plan agresivo de ventas");
  await expect(demo(page).getByRole("button", { name: "Cargar Plan agresivo de ventas" })).toBeFocused();

  // Renombrar y borrar.
  await demo(page).getByRole("button", { name: "Renombrar TRM a 4.600" }).click();
  const rename = demo(page).getByRole("textbox", { name: "Renombrar TRM a 4.600" });
  await expect(rename).toBeFocused();
  await rename.fill("Dólar caro");
  await rename.press("Enter");
  await expect(demo(page).getByRole("button", { name: "Renombrar Dólar caro" })).toBeFocused();
  await demo(page).getByRole("button", { name: "Borrar Dólar caro" }).click();
  await expect(table.getByText("Dólar caro")).toHaveCount(0);
  await expect(page.locator("#what-if-log li").first()).toContainText("delete «Dólar caro»");
  await expect(demo(page).getByRole("button", { name: "Borrar Plan agresivo de ventas" })).toBeFocused();
});

test("en el móvil no hay scroll horizontal de la página; la tabla se desplaza sola", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, "#/what-if");
  await expect(card(page, "Margen bruto")).toBeVisible();
  const overflow = await demo(page).evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const scroll = demo(page).getByRole("region", { name: "Escenarios" });
  expect(await scroll.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
});
