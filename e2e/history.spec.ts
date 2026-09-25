import { expect, test } from "@playwright/test";
import { open } from "./helpers";

test("viaja en el tiempo con el teclado y carga los eventos más viejos al llegar al final", async ({ page }) => {
  await open(page, "#/history");
  const h = page.locator("#history-demo");
  await expect(h.locator(".nx-history__ev")).toHaveCount(15);
  await expect(h.locator(".nx-history__asof")).toHaveText("Así está ahora");
  await expect(h.locator(".nx-history__day h3").first()).toHaveText(/^(Hoy|Ayer)$/);

  const range = h.getByRole("slider", { name: "Viaje en el tiempo" });
  await range.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(range).toHaveAttribute("aria-valuetext", /Julián Ortiz actualizó · 14 de 15$/);
  await expect(h.locator(".nx-history__asof")).toHaveText(/^Así estaba el /);
  // Antes de la nota crédito: el monto era otro, y queda marcado con el de hoy.
  const monto = h.locator(".nx-history__state > div", { hasText: "Monto" });
  await expect(monto).toHaveAttribute("data-changed", "");
  await expect(monto.locator("dd .nx-history__val")).toHaveText("$ 48.750.000");
  await expect(monto.locator("small")).toHaveText("Ahora: $ 47.980.000");
  await expect(h.locator(".nx-history__ev[data-future]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(h.locator(".nx-history__asof")).toHaveText("Así está ahora");

  // Clic en la hora de un evento: el panel va a ese momento.
  const approved = h.locator(".nx-history__ev", { hasText: "Aprobada. Prioridad alta" });
  await approved.locator(".nx-history__when").click();
  await expect(h.locator(".nx-history__state > div", { hasText: "Estado" }).locator("dd .nx-history__val")).toHaveText("Aprobada");
  await h.getByRole("button", { name: "Volver al presente" }).click();
  await expect(range).toBeFocused();

  // Al final de la línea llegan los 10 eventos más viejos (la creación, entre ellos).
  await h.locator(".nx-history__main").evaluate((m) => m.scrollTo({ top: m.scrollHeight, behavior: "instant" }));
  await expect(h.locator(".nx-history__ev")).toHaveCount(25);
  await expect(h.locator(".nx-history__ev").last()).toContainText("Andrés Ruiz creó el registro");
  await expect(range).toHaveAttribute("max", "24");
});

test("filtra, revierte con deshacer y comenta", async ({ page }) => {
  await open(page, "#/history");
  const h = page.locator("#history-demo");
  await expect(h.locator(".nx-history__ev")).toHaveCount(15);

  await h.getByRole("button", { name: /^Laura Gómez/ }).click();
  await expect(h.locator(".nx-history__ev")).toHaveCount(2);
  await expect(h.getByRole("button", { name: /Laura Gómez/ })).toHaveAttribute("aria-pressed", "true");
  await h.getByRole("button", { name: /Laura Gómez/ }).click();
  await h.getByRole("searchbox", { name: "Buscar en el historial" }).fill("portería");
  // La lista se acorta, el final queda a la vista y llega la página anterior: tres ediciones de la nota.
  await expect(h.locator(".nx-history__ev")).toHaveCount(3);
  await expect(h.locator(".nx-history__diff ins").first()).toHaveText("Se aceptan entregas parciales. ");
  await h.getByRole("searchbox").fill("");

  // Revertir la nota crédito: el monto vuelve, y se deshace desde el aviso.
  await h.getByRole("button", { name: "Revertir Monto a $ 48.750.000" }).click();
  await expect(h.locator(".nx-history__state > div", { hasText: "Monto" }).locator("dd")).toHaveText("$ 48.750.000");
  await expect(h.locator(".nx-history__ev").first()).toContainText("Sofía Herrera revirtió un cambio");
  await expect(page.locator("#history-log")).toContainText("nx-history-revert → monto");
  await page.locator(".nx-toast", { hasText: "Monto vuelve a $ 48.750.000" }).getByRole("button", { name: "Deshacer" }).click();
  await expect(h.locator(".nx-history__state > div", { hasText: "Monto" }).locator("dd")).toHaveText("$ 47.980.000");
  await expect(h.locator(".nx-history__ev").first()).not.toContainText("revirtió");

  const note = h.getByRole("textbox", { name: "Agregar una nota…" });
  await note.fill("Confirmado con el proveedor por teléfono.");
  await note.press("Enter");
  await expect(h.locator(".nx-history__ev").first()).toContainText("Sofía Herrera comentó");
  await expect(h.locator(".nx-history__ev").first().locator(".nx-history__note")).toHaveText("Confirmado con el proveedor por teléfono.");
  await expect(page.locator("#history-log")).toContainText("nx-history-comment → «Confirmado con el proveedor por teléfono.»");
});
