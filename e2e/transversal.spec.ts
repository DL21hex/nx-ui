import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { open } from "./helpers";

// Lo que cruza todos los componentes: el `lang` de la página, el CSS por pieza y el alto contraste.

test("cambiar <html lang> repinta y reparsea los componentes conectados", async ({ page }) => {
  await open(page, "#/grid");
  const text = () => page.locator("#tr-lang nx-grid [data-r='0'] > [data-c='0']").textContent();
  await page.evaluate(() => {
    document.documentElement.lang = "es-CO";
    const box = Object.assign(document.createElement("div"), { id: "tr-lang" });
    const grid = document.createElement("nx-grid") as HTMLElement & { columns: unknown; rows: unknown };
    box.append(grid);
    document.body.append(box);
    grid.columns = [{ key: "m", label: "Monto", type: "number" }];
    grid.rows = [{ id: "1", m: 1234.5 }];
  });
  await expect.poll(text).toBe("1.234,5");
  await page.evaluate(() => (document.documentElement.lang = "en-US"));
  await expect.poll(text).toBe("1,234.5");
});

test("tokens.css + la hoja de una pieza bastan: spinner, iniciales y glifos", async ({ page }) => {
  const css = readFileSync("src/styles/tokens.css", "utf8") + readFileSync("src/components/select/select.css", "utf8");
  await page.setContent(`<style>${css}</style><span class="nx-spinner"></span><span class="nx-spinner" hidden></span><span class="nx-icon nx-icon--initials">AB</span>`);
  const got = await page.evaluate(() => {
    const [s, hidden] = document.querySelectorAll(".nx-spinner");
    const i = getComputedStyle(document.querySelector(".nx-icon--initials")!);
    return { anim: getComputedStyle(s).animationName, w: getComputedStyle(s).width, hidden: getComputedStyle(hidden).display, iw: i.width };
  });
  expect(got).toEqual({ anim: "nx-spin", w: "14px", hidden: "none", iw: "20px" });
});

test("los tokens no le ganan a la app: :root de la app gana aunque cargue antes", async ({ page }) => {
  const css = readFileSync("src/styles/tokens.css", "utf8");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setContent(`<style>:root { color-scheme: light; --nx-primary: rgb(255, 0, 0); }</style><style>${css}</style><body></body>`);
  const got = await page.evaluate(() => [getComputedStyle(document.documentElement).colorScheme, getComputedStyle(document.documentElement).getPropertyValue("--nx-primary").trim()]);
  expect(got).toEqual(["light", "rgb(255, 0, 0)"]);
});

test("alto contraste (forced-colors): el spinner sigue girando visible y axe no encuentra problemas graves", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "#/select");
  await page.locator("#sel-single").getByRole("combobox").click();
  await page.keyboard.type("an");
  const spin = await page.evaluate(() => {
    const s = document.body.appendChild(Object.assign(document.createElement("span"), { className: "nx-spinner" }));
    const cs = getComputedStyle(s);
    return [cs.borderTopColor !== cs.borderLeftColor, cs.animationName];
  });
  expect(spin).toEqual([true, "nx-spin"]);
  const result = await new AxeBuilder({ page }).include(["#sel-single", "#nav"]).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(result.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id)).toEqual([]);
});
