import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("el puntero mueve la línea vertical y el tooltip; clic en agosto → la IA explica en el popover", async ({ page }) => {
  await open(page, "#/trend");
  const cost = page.locator("#trend-cost");
  await expect(cost.locator(".nx-trend__pt")).toHaveCount(27);
  const box = (await cost.locator(".nx-trend__plot").boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.4);
  const tip = cost.locator(".nx-trend__tip");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("2026");
  await expect(tip.locator(".nx-trend__row")).toHaveCount(3);
  await expect(cost.locator(".nx-trend__cross")).toHaveAttribute("visibility", "visible");

  const aug = cost.getByRole("button", { name: /^Materia prima, agosto 2026/ });
  await aug.click();
  const card = page.locator(".nx-trend-why");
  await expect(card).toBeVisible();
  await expect(card.getByRole("textbox")).toHaveValue("¿Por qué sube Materia prima en agosto?");
  await expect(card.locator(".nx-ai__answer")).toContainText("Aceros del Caribe", { timeout: 10_000 });
  await expect(card.locator(".nx-ai__source")).toHaveCount(3, { timeout: 10_000 });
  await expect(aug).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(aug).toBeFocused();
});

test("con el teclado: un Tab, flechas por meses y series, Enter pregunta y se puede repreguntar", async ({ page }) => {
  await open(page, "#/trend");
  const cost = page.locator("#trend-cost");
  await cost.getByRole("button", { name: "Ver como tabla" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Materia prima, enero 2026/);
  for (let i = 0; i < 7; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Mano de obra, agosto 2026/);
  await expect(cost.locator(".nx-trend__tip")).toContainText("agosto 2026");
  await page.keyboard.press("Enter");
  const card = page.locator(".nx-trend-why");
  await expect(card).toBeVisible();
  await expect(card.locator(".nx-ai__answer")).toContainText("paro de la empacadora", { timeout: 10_000 });
  await expect(card.locator("nx-ai-answer")).toHaveAttribute("data-state", "done", { timeout: 10_000 });
  const input = card.getByRole("textbox");
  await input.fill("¿Y en septiembre?");
  await input.press("Enter");
  await expect(card.locator(".nx-ai__answer")).toContainText("En septiembre, mano de obra fue $ 224,3 M", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Mano de obra, agosto 2026/);
});

test("leyenda, detección automática y «Ver como tabla»", async ({ page }) => {
  await open(page, "#/trend");
  const cost = page.locator("#trend-cost");
  await cost.getByRole("button", { name: "Mano de obra", exact: true }).click();
  await expect(cost.getByRole("button", { name: "Mano de obra", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(cost.locator(".nx-trend__pt")).toHaveCount(18);
  await cost.getByRole("button", { name: "Mano de obra", exact: true }).click();
  await expect(cost.locator(".nx-trend__flag")).toHaveCount(1);
  await page.locator("#trend-detect").check();
  await expect(cost.locator(".nx-trend__flag")).toHaveCount(2);
  await cost.getByRole("button", { name: "Ver como tabla" }).click();
  await expect(cost.locator(".nx-trend__plot")).toBeHidden();
  const table = cost.getByRole("table");
  await expect(table).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(10);
  await expect(table.getByRole("row", { name: /agosto 2026/ })).toContainText("Acero +18 %");
  await cost.getByRole("button", { name: "Ver como gráfico" }).click();
  await expect(cost.locator(".nx-trend__plot")).toBeVisible();
});

test("barras contra el año anterior: clic en la barra de agosto de 2026", async ({ page }) => {
  await open(page, "#/trend");
  const sales = page.locator("#trend-sales");
  await expect(sales.locator("path.nx-trend__bar")).toHaveCount(18);
  const bar = sales.locator('path.nx-trend__bar[data-i="7"]').nth(1);
  await bar.click({ position: { x: 5, y: 30 } });
  const card = page.locator(".nx-trend-why");
  await expect(card.getByRole("textbox")).toHaveValue("¿Por qué sube Ventas 2026 en agosto?");
  await expect(card.locator(".nx-ai__answer")).toContainText("Metalmecánica Los Andes", { timeout: 10_000 });
});

test.describe("en el móvil", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("un toque en la columna del mes pregunta por la serie más cercana, y el popover cabe", async ({ page }) => {
    await open(page, "#/trend");
    const aug = page.locator("#trend-cost").getByRole("button", { name: /^Materia prima, agosto 2026/ });
    await aug.scrollIntoViewIfNeeded();
    const b = (await aug.boundingBox())!;
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2 + 22);
    const card = page.locator(".nx-trend-why");
    await expect(card.getByRole("textbox")).toHaveValue("¿Por qué sube Materia prima en agosto?");
    const c = (await card.boundingBox())!;
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x + c.width).toBeLessThanOrEqual(390);
  });
});
