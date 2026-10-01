import { expect, test, type Page } from "@playwright/test";
import { mod, open } from "./helpers";

const grid = (page: Page) => page.locator("#grid-demo");
const cell = (page: Page, r: number, c: number) => grid(page).locator(`.nx-grid__row[data-r="${r}"] > [data-c="${c}"]`);

test("teclado: mover, seleccionar un rango y ver la suma en el pie", async ({ page }) => {
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft"); // Monto
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const foot = grid(page).locator(".nx-grid__foot");
  await expect(foot).toContainText("3 celdas");
  await expect(foot).toContainText("Suma");
});

test("editar escribiendo, deshacer y rehacer (también con los botones)", async ({ page }) => {
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  const monto = cell(page, 0, 7);
  const before = await monto.textContent();
  await page.keyboard.type("123");
  await page.keyboard.press("Enter");
  await expect(monto).toHaveText("$ 123");
  await expect(monto).toHaveClass(/is-edited/);
  await page.keyboard.press(`${mod(page)}+z`);
  await expect(monto).toHaveText(before!);
  await expect(monto).not.toHaveClass(/is-edited/);
  await page.getByRole("button", { name: /Rehacer/ }).click();
  await expect(monto).toHaveText("$ 123");
});

test("copiar y pegar con el portapapeles del sistema (TSV, como Excel)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "los permisos de portapapeles solo se conceden en Chromium");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`${mod(page)}+c`);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("\n")).toHaveLength(2);
  // Pegar dos montos desde «Excel».
  await page.evaluate(() => navigator.clipboard.writeText("111\n222"));
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod(page)}+v`);
  await expect(cell(page, 1, 7)).toHaveText("$ 111");
  await expect(cell(page, 2, 7)).toHaveText("$ 222");
});

test("filtrar con el filtro de una columna", async ({ page }) => {
  await open(page, "#/grid");
  const chips = grid(page).locator(".nx-grid__chip");
  await expect(chips).toHaveCount(0);
  const estado = grid(page).locator(".nx-grid__th", { hasText: "Estado" });
  await estado.hover();
  await estado.locator(".nx-grid__funnel").click();
  const panel = grid(page).locator(".nx-grid__filter");
  await expect(panel).toBeVisible();
  await panel.locator(".nx-grid__f-opts input[data-v]").first().uncheck();
  await expect(chips).toHaveCount(1);
  await expect(panel.locator(".nx-grid__f-left")).toContainText("de 600");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(estado.locator(".nx-grid__funnel")).toBeFocused();
  await expect(grid(page).locator(".nx-grid__foot")).toContainText("de 600 filas");
});

test("el desplazamiento virtual pinta pocas filas aunque haya 600", async ({ page }) => {
  await open(page, "#/grid");
  const rows = grid(page).locator(".nx-grid__row");
  const n = await rows.count();
  expect(n).toBeLessThan(60);
  await grid(page).locator(".nx-grid__scroll").evaluate((s) => (s.scrollTop = 32 * 400));
  await expect(grid(page).locator('.nx-grid__row[data-r="405"]')).toBeVisible();
});

/** Cajas de la barra de arriba, la tabla y el panel «Filtros», y el recorrido horizontal de cada scroller. */
const boxes = (page: Page) =>
  grid(page).evaluate((g) => {
    const box = (sel: string) => {
      const el = g.querySelector<HTMLElement>(sel)!;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, range: el.scrollWidth - el.clientWidth, x: el.scrollLeft };
    };
    return { bar: box(".nx-grid__hscroll"), table: box(".nx-grid__scroll"), facets: box(".nx-grid__facets") };
  });
type Topbar = { topScrollbar: boolean; columns: unknown[] };

test("barra de arriba: aparece si no cabe, va sobre la tabla, la lleva hasta el final y no cambia su caja", async ({ page }) => {
  // Un «ResizeObserver loop…» no sale en la consola: llega como `error` a window.
  await page.addInitScript(() => addEventListener("error", (e) => ((window as unknown as { errs: string[] }).errs ??= []).push(e.message)));
  await open(page, "#/grid");
  const bar = grid(page).locator(".nx-grid__hscroll");
  const table = grid(page).locator(".nx-grid__scroll");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await expect(bar).toHaveAttribute("tabindex", "-1");

  // Las nueve columnas no caben junto al panel: las dos tienen recorrido. La barra va encima de la
  // tabla, entre sus bordes, y el panel queda al lado de la tabla.
  const on = await boxes(page);
  expect(on.table.range).toBeGreaterThan(0);
  expect(on.bar.range).toBeGreaterThan(0);
  expect(on.bar.bottom).toBeLessThanOrEqual(on.table.top);
  expect(on.table.top - on.bar.bottom).toBeLessThanOrEqual(8);
  expect(Math.abs(on.bar.left - on.table.left - 1)).toBeLessThan(1);
  expect(Math.abs(on.table.right - on.bar.right - 1)).toBeLessThan(1);
  expect(Math.abs(on.facets.top - on.table.top)).toBeLessThan(1);

  // Desde arriba se llega a la última columna, y la barra sigue a la tabla.
  await bar.evaluate((b) => (b.scrollLeft = b.scrollWidth));
  await expect.poll(() => table.evaluate((s) => s.scrollWidth - s.clientWidth - s.scrollLeft)).toBeLessThanOrEqual(1);
  await table.evaluate((s) => (s.scrollLeft = 0));
  await expect.poll(() => bar.evaluate((b) => b.scrollLeft)).toBe(0);

  // Apagada (`top-scrollbar="false"`), la tabla se maqueta como antes: la misma caja para la tabla y el panel.
  await grid(page).evaluate((g) => ((g as unknown as Topbar).topScrollbar = false));
  await expect(bar).toBeHidden();
  const off = await boxes(page);
  for (const k of ["width", "height", "left"] as const) {
    expect(off.table[k]).toBeCloseTo(on.table[k], 1);
    expect(off.facets[k]).toBeCloseTo(on.facets[k], 1);
  }

  // Con columnas que caben, la barra no tiene recorrido: no hay barra que mostrar.
  await grid(page).evaluate((g) => {
    const el = g as unknown as Topbar;
    el.topScrollbar = true;
    el.columns = el.columns.slice(0, 2);
  });
  const fits = await boxes(page);
  expect(fits.table.range).toBe(0);
  expect(fits.bar.range).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { errs?: string[] }).errs ?? [])).toEqual([]);
});

test("barra de arriba: en una pantalla angosta va entre el panel y la tabla; en RTL llega al final", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 900 });
  await open(page, "#/grid");
  const on = await boxes(page);
  expect(on.facets.bottom).toBeLessThanOrEqual(on.bar.top);
  expect(on.bar.bottom).toBeLessThanOrEqual(on.table.top);
  await grid(page).evaluate((g) => ((g as unknown as Topbar).topScrollbar = false));
  const off = await boxes(page);
  for (const k of ["width", "height"] as const) {
    expect(off.table[k]).toBeCloseTo(on.table[k], 1);
    expect(off.facets[k]).toBeCloseTo(on.facets[k], 1);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await grid(page).evaluate((g) => {
    g.setAttribute("dir", "rtl");
    (g as unknown as Topbar).topScrollbar = true;
  });
  const bar = grid(page).locator(".nx-grid__hscroll");
  const table = grid(page).locator(".nx-grid__scroll");
  await bar.evaluate((b) => (b.scrollLeft = -b.scrollWidth));
  await expect.poll(() => table.evaluate((s) => s.scrollWidth - s.clientWidth + s.scrollLeft)).toBeLessThanOrEqual(1);
  await table.evaluate((s) => (s.scrollLeft = 0));
  await expect.poll(() => bar.evaluate((b) => b.scrollLeft)).toBe(0);
});
