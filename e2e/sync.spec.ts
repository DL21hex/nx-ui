import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/** La demo sin azar (sin 503 ni respuestas perdidas), para que las pruebas no dependan de la suerte. */
async function openSync(page: Page) {
  await open(page, "#/sync");
  const flaky = page.getByRole("switch", { name: /Red inestable/ });
  await flaky.click();
  await expect(flaky).toHaveAttribute("aria-checked", "false");
  await expect(page.locator("#sync-demo .nx-sync__pill")).toHaveText("En línea");
}
const pill = (page: Page) => page.locator("#sync-demo .nx-sync__pill");
const confirmed = (page: Page) => page.locator("#sync-confirmed .sync-conf");
const take = (page: Page) => page.getByRole("button", { name: "Tomar pedido" }).click();

test("sin conexión de verdad (setOffline): guarda, avisa y al volver envía en orden", async ({ page, context }) => {
  await openSync(page);
  await context.setOffline(true);
  await expect(pill(page)).toHaveText("Sin conexión");
  await expect(page.locator("#sync-demo [aria-live]")).toHaveText(/^Sin conexión\. Tus cambios se guardan/);
  await take(page);
  await take(page);
  await expect(pill(page)).toHaveText("Sin conexión · 2 pendientes");
  await expect(page.locator("#sync-demo")).toHaveAttribute("data-state", "offline");

  await pill(page).click();
  const dialog = page.getByRole("dialog", { name: "Sincronización" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".nx-sync__label")).toHaveText(["Pedido · Tienda La Esquina de Rosa", "Pedido · Minimercado El Progreso"]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(pill(page)).toBeFocused();

  await context.setOffline(false);
  // La primera sale; la segunda (Minimercado El Progreso) choca con televentas.
  await expect(confirmed(page)).toHaveCount(1);
  await expect(confirmed(page).first()).toContainText("Tienda La Esquina de Rosa");
  await expect(pill(page)).toHaveText("1 conflicto");
  await expect(page.locator("#sync-demo")).toHaveAttribute("data-state", "alert");
});

test("un conflicto se resuelve campo por campo y la versión elegida se confirma", async ({ page }) => {
  await openSync(page);
  await page.locator('[name="cliente"]').selectOption({ label: "Minimercado El Progreso · Rebolo" });
  await take(page);
  await expect(pill(page)).toHaveText("1 conflicto");
  await pill(page).click();
  await page.getByRole("button", { name: "Resolver · Pedido · Minimercado El Progreso" }).click();
  const dialog = page.getByRole("dialog", { name: "Resolver conflicto" });
  await expect(page.getByRole("heading", { name: "Resolver conflicto" })).toBeFocused();
  const cantidad = dialog.getByRole("group", { name: "Cantidad · Arroz blanco 500 g" });
  await expect(cantidad.locator(".nx-sync__val")).toHaveText(["24", "30"]);
  await expect(cantidad.getByRole("radio", { name: /Lo mío/ })).toBeChecked();
  // La cantidad del servidor; las observaciones y quién lo tomó, las mías.
  await cantidad.getByRole("radio", { name: /Del servidor/ }).check();
  await dialog.getByRole("button", { name: "Enviar versión resuelta" }).click();
  await expect(page.getByRole("dialog", { name: "Sincronización" })).toBeVisible();
  await expect(confirmed(page)).toHaveCount(1);
  // 30 × $ 2.900 + 6 × $ 11.400
  await expect(confirmed(page).first()).toContainText("Minimercado El Progreso");
  await expect(confirmed(page).first()).toContainText("$ 155.400");
  await expect(pill(page)).toHaveText("En línea");
});

test("un rechazo (cupo de crédito) se corrige en el JSON y se reintenta", async ({ page }) => {
  await openSync(page);
  await page.locator('[name="cliente"]').selectOption({ label: "Tienda Doña Carmen · La Victoria" });
  await page.getByRole("spinbutton", { name: "Cantidad de Arroz blanco 500 g" }).fill("90");
  await take(page);
  await expect(pill(page)).toHaveText("1 no se pudo enviar");
  await pill(page).click();
  await expect(page.locator(".nx-sync__why")).toHaveText(/superó su cupo de crédito/);
  await page.getByRole("button", { name: "Corregir · Pedido · Tienda Doña Carmen" }).click();
  const json = page.getByRole("textbox", { name: "Datos (JSON)" });
  const body = JSON.parse(await json.inputValue());
  await json.fill("{ roto");
  await expect(json).toHaveAttribute("aria-invalid", "true");
  body.productos[0].cantidad = 20;
  await json.fill(JSON.stringify(body, null, 2));
  await page.getByRole("button", { name: "Reintentar con estos datos" }).click();
  await expect(confirmed(page)).toHaveCount(1);
  await expect(confirmed(page).first()).toContainText("Tienda Doña Carmen");
  await expect(pill(page)).toHaveText("En línea");
});

test("lo pendiente sobrevive a recargar la página (IndexedDB)", async ({ page }) => {
  await openSync(page);
  await page.getByRole("switch", { name: /Simular sin conexión/ }).click();
  await expect(pill(page)).toHaveText("Sin conexión");
  await take(page);
  await expect(pill(page)).toHaveText("Sin conexión · 1 pendiente");
  await page.reload();
  // La demo vuelve con «Red inestable» encendida: se apaga ya. Si el primer envío alcanzó a salir
  // con un 503, su Retry-After (hasta 4 s) no cabe en los 5 s por defecto.
  const flaky = page.getByRole("switch", { name: /Red inestable/ });
  await flaky.click();
  await expect(flaky).toHaveAttribute("aria-checked", "false");
  // Con la señal de vuelta (la simulación empieza apagada), el pedido guardado sale solo.
  await expect(confirmed(page)).toHaveCount(1, { timeout: 15_000 });
  await expect(confirmed(page).first()).toContainText("Tienda La Esquina de Rosa");
  await expect(pill(page)).toHaveText("En línea");
});

test("teclado: la píldora abre el panel y Esc devuelve el foco", async ({ page }) => {
  await openSync(page);
  await pill(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Sincronización" })).toBeFocused();
  await expect(page.getByText("Todo está al día")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(pill(page)).toBeFocused();
  await expect(pill(page)).toHaveAttribute("aria-expanded", "false");
});
