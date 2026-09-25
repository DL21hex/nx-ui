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

test("paleta de comandos abierta, con resultados del servidor", async ({ page }) => {
  await open(page, "#/command");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("aceros");
  await expect(page.locator("#cmd .nx-command__group-h", { hasText: "Órdenes de compra" })).toBeVisible();
  await audit(page, ["#cmd"]);
});

test("desglose de una cifra", async ({ page }) => {
  await open(page, "#/explain");
  await page.locator("nx-explain[endpoint*=factura]").click();
  await expect(page.locator(".nx-explain-card .nx-explain__ok")).toBeVisible({ timeout: 10_000 });
  await audit(page, [".nx-explain__mark", ".nx-explain-card"]);
});

test("bandeja con un ítem bloqueado y el motivo del rechazo", async ({ page }) => {
  await open(page, "#/inbox");
  await page.keyboard.press("j");
  await expect(page.locator("#inbox-demo .nx-inbox__block")).toBeVisible();
  await audit(page, ["#inbox-demo"]);
  await page.keyboard.press("r");
  await audit(page, ["#inbox-demo"]);
});

test("encuesta: una pregunta, la escala NPS y los resultados", async ({ page }) => {
  await open(page, "#/survey");
  const s = page.locator("#survey-demo");
  await s.getByRole("button", { name: /Empezar|Continuar/ }).click();
  await audit(page, ["#survey-demo"]);
  await page.keyboard.press("a");
  await expect(s.locator(".nx-survey__scale")).toBeVisible();
  await audit(page, ["#survey-demo"]);
});

test("encuesta en ficha, tarjetas y conversación", async ({ page }) => {
  await open(page, "#/survey");
  await page.evaluate(() => localStorage.removeItem("nx-ui-demo-encuesta"));
  const s = page.locator("#survey-demo");
  for (const name of ["Ficha", "Tarjetas", "Conversación"]) {
    await page.reload();
    await page.getByRole("button", { name }).click();
    await s.getByRole("button", { name: "Empezar" }).click();
    await page.keyboard.press("a");
    await expect(s.locator(".nx-survey__scale")).toBeVisible();
    // La conversación hace aparecer la respuesta con un fundido: axe mediría colores a medias.
    await page.waitForTimeout(900);
    await audit(page, ["#survey-demo"]);
  }
});

test("número: factura con vista previa, error y aviso de recorte", async ({ page }) => {
  await open(page, "#/number");
  await audit(page, ["#num-invoice", ".sel-demos", ".num-try"]);
  await page.locator("#num-price input").fill("=450*3");
  await expect(page.locator("#num-price .nx-number__hint")).toBeVisible();
  await page.locator("#num-qty input").fill("=2+x");
  await page.locator("#num-qty input").press("Enter");
  await page.locator("#num-disc input").fill("150");
  await page.locator("#num-disc input").press("Enter");
  await expect(page.locator("#num-disc .nx-number__note")).not.toBeEmpty();
  await audit(page, ["#num-invoice", ".sel-demos", ".num-try"]);
});

test("tablero en reposo, filtrado, con una columna plegada y con una tarjeta levantada", async ({ page }) => {
  await open(page, "#/kanban");
  await audit(page, ["#kanban-demo"]);
  await page.locator("#kanban-demo .nx-kanban__filter").fill("logistica");
  await page.locator('#kanban-demo .nx-kanban__col[data-col="recibido"] .nx-kanban__fold').click();
  await audit(page, ["#kanban-demo"]);
  await page.locator("#kanban-demo .nx-kanban__filter").fill("");
  await page.locator('#kanban-demo .nx-kanban__card[data-id="2276"]').focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator('#kanban-demo .nx-kanban__col[data-col="por-aprobar"] .nx-kanban__warn')).toBeVisible();
  await audit(page, ["#kanban-demo"]);
});

test("historial: la línea, viajando en el tiempo y con un filtro", async ({ page }) => {
  await open(page, "#/history");
  const h = page.locator("#history-demo");
  await expect(h.locator(".nx-history__ev")).toHaveCount(15);
  await audit(page, ["#history-demo"]);
  await h.getByRole("slider", { name: "Viaje en el tiempo" }).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowLeft");
  await expect(h.getByRole("button", { name: "Volver al presente" })).toBeVisible();
  await audit(page, ["#history-demo"]);
  await h.getByRole("button", { name: /^Andrés Ruiz/ }).click();
  await h.locator(".nx-history__revert").first().focus();
  await audit(page, ["#history-demo"]);
});

test("rango de fechas cerrado, abierto, eligiendo y con una frase que no entiende", async ({ page }) => {
  await open(page, "#/date-range");
  await audit(page, ["#dr-sales", "#dr-fiscal"]);
  await page.locator("#dr-sales .nx-date-range__field").click();
  await expect(page.locator("#dr-sales").getByRole("dialog")).toBeVisible();
  await audit(page, ["#dr-sales"]);
  await page.locator("#dr-sales [data-day]").nth(12).click();
  await page.locator("#dr-sales [data-day]").nth(20).hover();
  await audit(page, ["#dr-sales"]);
  await page.keyboard.press("Escape");
  await page.locator("#dr-sales").getByRole("textbox").fill("cuando pueda");
  await audit(page, ["#dr-sales"]);
});

test("pegar y llenar: en reposo, con revisar y sugerencia, y con el servidor que falla", async ({ page }) => {
  // Sin animaciones: axe no mide un chip a medio aparecer.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, "#/paste-fill");
  await audit(page, ["#pf-demo"]);
  await page.locator("#pf-demo [name=correo]").fill("compras@proveedor.co");
  await page.getByRole("button", { name: "Firma con NIT mal escrito" }).click();
  await expect(page.locator("#pf-demo .nx-pf__pill")).toHaveText("2 por revisar");
  await audit(page, ["#pf-demo"]);
  await page.locator("input[name=pf-mode][value=fail]").check();
  await page.getByRole("button", { name: "WhatsApp informal" }).click();
  await expect(page.locator("#pf-demo .nx-pf__err")).toBeVisible({ timeout: 10_000 });
  await audit(page, ["#pf-demo"]);
});

test("presencia: la pila, los campos marcados, el aviso de bloqueo y la lista", async ({ page }) => {
  await open(page, "#/presence");
  const p = page.locator("#presence-demo");
  await audit(page, ["#presence-demo", ".prs"]);
  await page.locator("#presence-sim").click();
  await expect(page.locator(".nx-presence__mark", { hasText: "está escribiendo…" })).toBeVisible({ timeout: 5000 });
  await page.locator("#presence-form [name=monto]").focus();
  await expect(page.getByRole("alert")).toContainText("está editando este campo");
  await audit(page, ["#presence-demo", ".prs", ".nx-presence__layer"]);
  await p.getByRole("button", { name: "Ver quién está aquí" }).click();
  await expect(p.locator(".nx-presence__pop .nx-presence__row")).toHaveCount(3);
  await page.waitForTimeout(250);
  await audit(page, ["#presence-demo"]);
});
