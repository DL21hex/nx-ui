import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("el agente filtra y selecciona en la tabla, pide aprobación y deja deshacer", async ({ page }) => {
  await open(page, "#/th");
  const agent = page.locator("#th-agent");
  await agent.getByRole("button", { name: /Pide los documentos faltantes/ }).click();
  const card = agent.locator(".nx-agent__card").first();
  await expect(card).toContainText("correos pidiendo documentos", { timeout: 15_000 });
  const grid = page.locator("#th-grid");
  await expect(grid.locator(".nx-grid__chip")).toHaveCount(2);
  await expect(grid.locator(".nx-grid__selbar")).toContainText("seleccionadas");
  await card.getByRole("button", { name: "Enviar correos" }).click();
  await expect(agent.locator(".nx-agent__undo")).toBeVisible({ timeout: 10_000 });
  await agent.locator(".nx-agent__undo").click();
  await expect(agent).toContainText("Deshecho: no hice nada.", { timeout: 10_000 });
});
