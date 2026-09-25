import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/** axe sobre los componentes (no sobre el texto de la galería): WCAG 2.1 A y AA. */
async function audit(page: Page, include: string[]) {
  const result = await new AxeBuilder({ page }).include(include).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  const report = serious
    .map((v) => `${v.id} (${v.impact}, ${v.nodes.length}): ${v.help}\n${v.nodes
      .slice(0, 4)
      .map((n) => `    ${n.target.join(" ")} → ${(n.failureSummary ?? "").split("\n").slice(1, 2).join("").trim()}`)
      .join("\n")}`)
    .join("\n");
  expect(serious.length, `\n${report}`).toBe(0);
}

test("sidemenu, en reposo y con el flotante abierto", async ({ page }) => {
  await open(page, "#/sidemenu");
  await expect(page.locator("#stage-menu nx-sidemenu")).toBeVisible();
  await audit(page, ["#nav", "#stage-menu"]);
  await page.locator("#stage-menu").getByRole("button", { name: "Seguridad Física" }).click();
  await expect(page.getByRole("combobox")).toBeVisible();
  await audit(page, ["#stage-menu"]);
});

test("select abierto", async ({ page }) => {
  await open(page, "#/select");
  await page.locator("#sel-single").getByRole("combobox").click();
  await page.keyboard.type("an");
  await audit(page, ["#sel-single", "#sel-multi"]);
});

test("tabla con filtros, facetas y selección", async ({ page }) => {
  await open(page, "#/th");
  await page.locator("#th-grid input[data-pick]").first().check();
  await audit(page, ["#th-grid", "#th-inbox"]);
  await page.locator("#grid-demo, #th-grid").first().getByRole("button", { name: /Filtros/ }).click();
  await audit(page, ["#th-grid"]);
});

test("diálogo, panel, aviso y confirmación", async ({ page }) => {
  await open(page, "#/dialog");
  await page.locator("#dlg-new-btn .nx-button__btn").click();
  await audit(page, ["#dlg-new"]);
  await page.keyboard.press("Escape");
  await page.locator("#dlg-c1 .nx-button__btn").click();
  await expect(page.locator("nx-dialog.nx-confirm .nx-confirm__item")).toHaveCount(3);
  await audit(page, ["nx-dialog.nx-confirm"]);
});

test("agente con una tarjeta de aprobación", async ({ page }) => {
  await open(page, "#/th");
  await page.locator("#th-agent").getByRole("button", { name: /Pide los documentos faltantes/ }).click();
  await expect(page.locator("#th-agent .nx-agent__card")).toBeVisible({ timeout: 15_000 });
  await audit(page, ["#th-agent"]);
});

test("IA y captura", async ({ page }) => {
  await open(page, "#/ai");
  await audit(page, ["#ai-demo"]);
  await open(page, "#/capture");
  await audit(page, ["#cap-demo"]);
});
