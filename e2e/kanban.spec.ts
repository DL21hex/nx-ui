import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

const card = (page: Page, id: string) => page.locator(`#kanban-demo .nx-kanban__card[data-id="${id}"]`);
const col = (page: Page, id: string) => page.locator(`#kanban-demo .nx-kanban__col[data-col="${id}"]`);
const ids = (page: Page, id: string) => col(page, id).locator(".nx-kanban__card").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.id));

/** Arrastra con el mouse de verdad, en pasos, hasta el centro de `to` (o un punto). */
async function drag(page: Page, from: string, to: { x: number; y: number }) {
  const b = (await card(page, from).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + 18);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 8, b.y + 24, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 14 });
}

test("arrastrar con el mouse: el hueco se abre, se suelta al instante y se deshace", async ({ page }) => {
  await open(page, "#/kanban");
  await expect(col(page, "por-aprobar").locator(".nx-kanban__count")).toHaveText("6/5");
  await expect(col(page, "por-aprobar")).toHaveAttribute("data-over", "");
  const target = (await card(page, "2283").boundingBox())!;
  await drag(page, "2341", { x: target.x + target.width / 2, y: target.y + 8 });
  // Mientras se arrastra: la sombra sigue al puntero y el hueco está donde va a caer.
  await expect(page.locator("#kanban-demo .nx-kanban__ghost")).toBeVisible();
  await expect(card(page, "2341")).toHaveAttribute("data-placeholder", "");
  await expect.poll(() => ids(page, "aprobado")).toEqual(["2276", "2341", "2283", "2285", "2288", "2289"]);
  await page.mouse.up();
  await expect(page.locator("#kanban-demo .nx-kanban__ghost")).toHaveCount(0);
  await expect(card(page, "2341")).not.toHaveAttribute("data-placeholder", "");
  expect(await ids(page, "borrador")).toEqual(["2339", "2337", "2336", "2334"]);
  await expect(col(page, "aprobado").locator(".nx-kanban__count")).toHaveText("6");
  await expect(page.locator("#kanban-log li").first()).toContainText("nx-kanban-move → OC-2341: Borrador → Aprobado, posición 2 (pointer)");
  const toast = page.locator(".nx-toast").filter({ hasText: "OC-2341 → Aprobado" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Deshacer" }).click();
  await expect.poll(() => ids(page, "borrador")).toEqual(["2341", "2339", "2337", "2336", "2334"]);
  await expect(page.locator("#kanban-log li").first()).toContainText("nx-kanban-undo → OC-2341");
});

test("arrastrar hasta el borde desplaza el tablero y avisa el límite de la columna", async ({ page }) => {
  await open(page, "#/kanban");
  const board = page.locator("#kanban-demo .nx-kanban__board");
  const box = (await board.boundingBox())!;
  const sl0 = await board.evaluate((b) => b.scrollLeft);
  // Hasta el borde derecho: el tablero se desplaza solo.
  await drag(page, "2339", { x: box.x + box.width - 12, y: box.y + 200 });
  await expect.poll(() => board.evaluate((b) => b.scrollLeft), { timeout: 5000 }).toBeGreaterThan(sl0 + 150);
  // De vuelta sobre «Por aprobar» (6/5): se marca y lo dice.
  const pa = (await col(page, "por-aprobar").boundingBox())!;
  await page.mouse.move(pa.x + pa.width / 2, pa.y + 140, { steps: 10 });
  await expect(col(page, "por-aprobar")).toHaveAttribute("data-warn", "");
  await expect(col(page, "por-aprobar").locator(".nx-kanban__warn")).toHaveText("Por aprobar supera su límite de 5.");
  // Escape cancela: vuelve a su lugar.
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(() => ids(page, "borrador")).toEqual(["2341", "2339", "2337", "2336", "2334"]);
  await expect(col(page, "por-aprobar")).not.toHaveAttribute("data-warn", "");
  await expect(page.locator("#kanban-log li")).toHaveCount(0);
});

test("con el teclado: Espacio levanta, flechas mueven, Espacio suelta, con anuncios", async ({ page }) => {
  await open(page, "#/kanban");
  const live = page.locator('#kanban-demo [aria-live="assertive"]');
  await card(page, "2276").focus();
  await page.keyboard.press("Space");
  await expect(live).toHaveText("Tarjeta OC-2276 levantada. Columna Aprobado, posición 1 de 5.");
  await page.keyboard.press("ArrowLeft");
  await expect(live).toHaveText("Columna Por aprobar, posición 1 de 7. Por aprobar supera su límite de 5.");
  await page.keyboard.press("ArrowDown");
  await expect(live).toHaveText("Columna Por aprobar, posición 2 de 7. Por aprobar supera su límite de 5.");
  await expect(card(page, "2276")).toBeFocused();
  await page.keyboard.press("Space");
  await expect(live).toHaveText("Tarjeta OC-2276 soltada en Por aprobar, posición 2 de 7.");
  expect(await ids(page, "por-aprobar")).toEqual(["2291", "2276", "2310", "2318", "2322", "2327", "2331"]);
  await expect(col(page, "por-aprobar").locator(".nx-kanban__count")).toHaveText("7/5");
  await expect(page.locator(".nx-toast").filter({ hasText: "OC-2276 → Por aprobar · supera el límite (7/5)" })).toBeVisible();
  // Otra: levantar y cancelar con Escape.
  await page.keyboard.press("ArrowDown");
  await expect(card(page, "2310")).toBeFocused();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(live).toHaveText("Movimiento cancelado. OC-2310 volvió a Por aprobar.");
  expect(await ids(page, "por-aprobar")).toEqual(["2291", "2276", "2310", "2318", "2322", "2327", "2331"]);
});

test("«Anulado» pide confirmación con el impacto del servidor; si se cancela, la orden vuelve", async ({ page }) => {
  await open(page, "#/kanban");
  // Sin desplazar el tablero: con el teclado se llega a cualquier columna.
  await card(page, "2240").focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  const dlg = page.locator("nx-dialog.nx-confirm");
  await expect(dlg.getByRole("heading", { name: "¿Anular la OC-2240?" })).toBeVisible();
  await expect(dlg.locator(".nx-confirm__item").first()).toContainText("Entrada de almacén EA-5521");
  await expect(dlg.locator(".nx-confirm__block")).toContainText("ya tiene un pago (EG-3321)");
  await dlg.getByRole("button", { name: "Cancelar" }).click();
  await expect.poll(() => ids(page, "recibido")).toEqual(["2240", "2252", "2261", "2270"]);
  expect(await ids(page, "anulado")).toEqual([]);
  await expect(card(page, "2240")).toBeFocused();
});

test("filtro sin tildes, columnas plegables y «Agregar»", async ({ page }) => {
  await open(page, "#/kanban");
  const filter = page.getByRole("searchbox", { name: "Filtrar tarjetas" });
  await filter.fill("logistica");
  await expect(page.locator("#kanban-demo .nx-kanban__hits")).toHaveText("5 de 20");
  await expect(card(page, "2310")).not.toHaveAttribute("data-dim", "");
  await expect(card(page, "2291")).toHaveAttribute("data-dim", "");
  await filter.press("Escape");
  await expect(page.locator("#kanban-demo .nx-kanban__card[data-dim]")).toHaveCount(0);
  const fold = col(page, "borrador").getByRole("button", { name: "Borrador" });
  await fold.click();
  await expect(fold).toHaveAttribute("aria-expanded", "false");
  await expect(card(page, "2341")).toBeHidden();
  await fold.click();
  await col(page, "borrador").getByRole("button", { name: "Agregar" }).click();
  await expect(page.locator("#kanban-log li").first()).toHaveText("nx-kanban-add → Borrador");
  await expect(card(page, "2342")).toBeFocused();
  await expect(col(page, "borrador").locator(".nx-kanban__count")).toHaveText("6");
});
