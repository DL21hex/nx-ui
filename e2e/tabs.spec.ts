import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";
import { distinct, focused, mount, walk, withoutReadingFlow } from "./tab-walk";

/** Pestañas sueltas en la página (fuera de un diálogo): la lista va al final del DOM y `order` la sube. */
const FX = `
<button id="t-before" type="button">antes</button>
<nx-tabs id="tx" label="Secciones">
  <section data-tab="Uno" id="p1"><button id="p1a" type="button">a</button> <input id="p1b" aria-label="b"></section>
  <section data-tab="Dos" id="p2"><button id="p2a" type="button">c</button></section>
</nx-tabs>
<button id="t-after" type="button">después</button>`;

const inertInside = (page: Page) => page.evaluate(() => document.querySelectorAll("#tx [inert]").length);

for (const rf of ["navegador", "sin reading-flow"] as const) {
  test(`fuera de un diálogo (${rf}): Tab y Mayús+Tab desde lo de antes y lo de después`, async ({ page }) => {
    const simulated = rf === "sin reading-flow";
    if (simulated) await withoutReadingFlow(page);
    await open(page, "#/dialog");
    await mount(page, FX, simulated);
    await page.waitForSelector("#tx [role=tab]");
    await page.locator("#t-before").focus();
    const fwd = await walk(page, 5);
    expect(fwd.stops).toEqual(["tab:Uno", "p1", "p1a", "p1b", "t-after"]);
    await page.waitForTimeout(50);
    expect(await inertInside(page)).toBe(0);
    const back = await walk(page, 5, true);
    expect(back.stops).toEqual(["p1b", "p1a", "p1", "tab:Uno", "t-before"]);
    await page.waitForTimeout(50);
    expect(await inertInside(page)).toBe(0);
    // Las flechas cambian de pestaña; Tab sigue entrando al panel que se ve.
    await page.keyboard.press("Tab");
    await page.keyboard.press("ArrowRight");
    expect(await focused(page)).toBe("tab:Dos");
    expect((await walk(page, 3)).stops).toEqual(["p2", "p2a", "t-after"]);
  });

  test(`una fecha al principio del panel (${rf}): Mayús+Tab recorre sus segmentos antes de volver a la pestaña`, async ({ page }) => {
    const simulated = rf === "sin reading-flow";
    if (simulated) await withoutReadingFlow(page);
    await open(page, "#/dialog");
    // Con `tabindex="-1"` el panel no es una parada: lo de antes de la fecha en el documento queda fuera de las pestañas.
    await mount(page, FX.replace('<section data-tab="Uno" id="p1">', '<section data-tab="Uno" id="p1" tabindex="-1"><input id="pd" type="date" aria-label="Fecha">'), simulated);
    await page.waitForSelector("#tx [role=tab]");
    await page.locator("#t-before").focus();
    const fwd = await walk(page, 8);
    expect(distinct(fwd.stops), fwd.stops.join(" ")).toEqual(["tab:Uno", "pd", "p1a", "p1b", "t-after"]);
    await page.locator("#t-after").focus();
    const back = await walk(page, 8, true);
    expect(distinct(back.stops), back.stops.join(" ")).toEqual(["p1b", "p1a", "pd", "tab:Uno", "t-before"]);
    expect(back.stops.filter((s) => s === "pd").length).toBeGreaterThanOrEqual(3);
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => document.querySelector("#tx")!.getAttribute("tabindex"))).toBeNull();
  });

  test(`siendo lo último de la página (${rf}): Tab sale al navegador y no vuelve a la pestaña`, async ({ page, browserName }) => {
    const simulated = rf === "sin reading-flow";
    if (simulated) await withoutReadingFlow(page);
    await open(page, "#/dialog");
    await mount(page, FX.replace(/<button id="t-after"[^]*$/, ""), simulated);
    await page.waitForSelector("#tx [role=tab]");
    // Solo las pestañas en la página: nada después de ellas.
    await page.evaluate(() => {
      const box = document.querySelector("#fxbox")!;
      for (const el of [...document.body.children]) if (el !== box && !el.matches("script, style")) el.remove();
    });
    await page.locator("#p1b").focus();
    await page.keyboard.press("Tab");
    const out = await focused(page);
    // Fuera del documento (la barra del navegador): ni la lista ni el panel. Chromium deja el foco en
    // <body>; Firefox de Playwright, sin barra a la que ir, lo deja donde estaba (igual que con dos
    // botones sueltos al final de la página).
    expect(out).toBe(browserName === "firefox" ? "p1b" : "body");
    await page.waitForTimeout(50);
    expect(await inertInside(page)).toBe(0);
    // Y al volver a entrar desde arriba, la lista va primero.
    await page.locator("#t-before").focus();
    expect((await walk(page, 1)).stops).toEqual(["tab:Uno"]);
  });
}

test("aria-owns: el árbol de accesibilidad lee la lista antes que los paneles, sin duplicados", async ({ page, browserName }) => {
  await open(page, "#/dialog");
  await mount(page, FX);
  await page.waitForSelector("#tx [role=tab]");
  await expect(page.locator("#tx")).toHaveAttribute("aria-owns", /-list p1 p2$/);
  if (browserName !== "chromium") return;
  // El árbol real de Chromium (CDP): bajo <nx-tabs>, primero el tablist y después el tabpanel visible.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Accessibility.enable");
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as { nodes: { nodeId: string; role?: { value: string }; name?: { value: string }; childIds?: string[]; ignored?: boolean }[] };
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const order: string[] = [];
  const visit = (id: string) => {
    const n = byId.get(id);
    if (!n) return;
    const role = n.role?.value;
    if (role === "tablist" || role === "tabpanel" || role === "tab") order.push(`${role}:${n.name?.value ?? ""}`);
    for (const c of n.childIds ?? []) visit(c);
  };
  visit(nodes[0].nodeId);
  const mine = order.filter((r) => /:(Secciones|Uno|Dos)$/.test(r));
  expect(mine).toEqual(["tablist:Secciones", "tab:Uno", "tab:Dos", "tabpanel:Uno"]);
});

// ---------------------------------------------------------------- la ficha lateral de la galería

test("ficha lateral: Tab entra a la lista de pestañas antes que al panel", async ({ page }) => {
  await open(page, "#/drawer");
  await page.locator("#dw-open .nx-button__btn").click();
  const panel = page.locator("#dw-panel");
  await expect(panel).toBeVisible();
  await page.waitForSelector("#dw-panel [data-tool=more]:not([hidden])");
  // Desde lo primero del cuerpo, hacia adelante: lo primero de <nx-tabs> que se alcanza es la pestaña activa.
  let first = "";
  for (let i = 0; i < 20 && !first; i++) {
    await page.keyboard.press("Tab");
    first = await page.evaluate(() => {
      const a = document.activeElement!;
      const t = a.closest("nx-tabs#dw-tabs");
      return t ? (a.getAttribute("role") === "tab" ? `tab:${a.getAttribute("aria-selected")}` : "panel") : "";
    });
  }
  expect(first).toBe("tab:true");
  // Y de la pestaña, al panel que se ve.
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !!document.activeElement!.closest("#dw-tabs [role=tabpanel]:not([hidden])"))).toBe(true);
  // Hacia atrás, de vuelta a la pestaña.
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#dw-tabs [role=tab][aria-selected=true]")).toBeFocused();
});

test("ficha lateral: lo escrito sobrevive a cambiar de pestaña; «Registrar novedad» se reabre en blanco", async ({ page }) => {
  await open(page, "#/drawer");
  await page.locator("#dw-open .nx-button__btn").click();
  const panel = page.locator("#dw-panel");
  await expect(panel).toBeVisible();
  const tabs = page.locator("#dw-tabs");
  await tabs.getByRole("tab", { name: "Datos" }).click();
  const personal = panel.locator("nx-fields[data-sec=personal]");
  await personal.locator(".nx-fields__action").click();
  const cel = personal.locator("[name=cel]");
  await expect(cel).toBeVisible();
  await cel.fill("301 000 1111");
  await tabs.getByRole("tab", { name: "Resumen" }).click();
  await expect(cel).toBeHidden();
  await tabs.getByRole("tab", { name: "Datos" }).click();
  await expect(cel).toHaveValue("301 000 1111");
  await panel.locator("#dw-cancel .nx-button__btn").click();

  // Registrar novedad: se escribe, se descarta y al reabrir está en blanco.
  await panel.locator("#dw-nov-open .nx-button__btn").click();
  const nov = page.locator("#dw-nov");
  await expect(nov).toBeVisible();
  const obs = nov.locator("[name=obs]");
  await obs.fill("Una nota");
  await nov.locator("[name=cantidad]").fill("4");
  await page.keyboard.press("Escape");
  await expect(nov.locator(".nx-dialog__guard")).toBeVisible();
  await nov.getByRole("button", { name: "Descartar" }).click();
  await expect(nov).toBeHidden();
  await expect(panel).toBeVisible();
  await panel.locator("#dw-nov-open .nx-button__btn").click();
  await expect(nov).toBeVisible();
  await expect(obs).toHaveValue("");
  await expect(nov.locator("[name=cantidad]")).toHaveValue("");
});

test("ficha lateral: Tab recorre la ficha entera sin quedarse quieto, y vuelve", async ({ page }) => {
  await open(page, "#/drawer");
  await page.locator("#dw-open .nx-button__btn").click();
  await expect(page.locator("#dw-panel")).toBeVisible();
  await page.waitForSelector("#dw-panel [data-tool=more]:not([hidden])");
  const fwd = await walk(page, 40);
  // Nunca dos pulsaciones seguidas en el mismo lugar (aquí no hay fechas), y siempre dentro del panel.
  expect(distinct(fwd.stops)).toEqual(fwd.stops);
  expect(await page.evaluate(() => document.querySelector("#dw-panel")!.contains(document.activeElement))).toBe(true);
  const back = await walk(page, 40, true);
  expect(distinct(back.stops)).toEqual(back.stops);
  // Da la vuelta (el ciclo se repite), y hacia atrás es el mismo ciclo al revés.
  const lap = fwd.stops.indexOf(fwd.stops[0], 1);
  expect(lap).toBeGreaterThan(5);
  const cycle = fwd.stops.slice(0, lap);
  const next = new Map(cycle.map((s, i) => [s, cycle[(i + 1) % cycle.length]]));
  const pairs = back.stops.slice(1).map((s, i) => [s, back.stops[i]]);
  for (const [from, to] of pairs) expect(`${from} → ${next.get(from)}`).toBe(`${from} → ${to}`);
});
