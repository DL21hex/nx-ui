import { expect, test } from "@playwright/test";
import { mod, open } from "./helpers";
import { distinct, interceptedAt, mount, nativeReadingFlow, walk, withoutReadingFlow } from "./tab-walk";

type Dlg = HTMLElement & { show(origin?: Element | null): Promise<string | undefined>; close(v?: string): boolean; open: boolean };

test("A · el modal: foco en el primer campo, Tab no se escapa, Escape con cambios avisa, el foco vuelve", async ({ page }) => {
  await open(page, "#/dialog");
  const btn = page.locator("#dlg-new-btn .nx-button__btn");
  await btn.click();
  const dlg = page.locator("#dlg-new");
  await expect(dlg).toBeVisible();
  const first = dlg.locator("input[name=prov]");
  await expect(first).toBeFocused();
  for (let i = 0; i < 8; i++) await page.keyboard.press("Tab");
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await first.fill("Aceros");
  await page.keyboard.press("Escape");
  const guard = dlg.locator(".nx-dialog__guard");
  await expect(guard).toBeVisible();
  await guard.getByRole("button", { name: "Descartar" }).click();
  await expect(dlg).toBeHidden();
  await expect(btn).toBeFocused();
});

test("A · sin JS: <button popovertarget> lo abre", async ({ page }) => {
  await open(page, "#/dialog");
  await page.getByRole("button", { name: /Abrir sin JS/ }).click();
  await expect(page.locator("#dlg-new")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#dlg-new")).toBeHidden();
});

test("B · paneles apilados: migas, y «atrás» del navegador cierra el de arriba", async ({ page }) => {
  await open(page, "#/dialog");
  await page.locator("#dlg-orders .dlg-item").first().click();
  await page.locator("#dlg-order").getByRole("button", { name: /Ver proveedor/ }).click();
  await page.locator("#dlg-prov").getByRole("button", { name: /Ver última factura/ }).click();
  const inv = page.locator("#dlg-inv");
  await expect(inv).toBeVisible();
  await expect(inv.locator(".nx-dialog__crumb")).toHaveCount(2);
  await page.goBack();
  await expect(inv).toBeHidden();
  await expect(page.locator("#dlg-prov")).toBeVisible();
  await page.locator("#dlg-prov .nx-dialog__crumb").first().click();
  await expect(page.locator("#dlg-prov")).toBeHidden();
  await expect(page.locator("#dlg-order")).toBeVisible();
});

test("C · anular sin preguntar y deshacer con Ctrl+Z", async ({ page }) => {
  await open(page, "#/dialog");
  const row = page.locator("#dlg-undo .dlg-undo-row").first();
  await row.getByRole("button", { name: "Anular" }).click();
  await expect(row).toBeHidden();
  await expect(page.locator(".nx-toast")).toContainText("anulada");
  await page.locator("body").press(`${mod(page)}+z`);
  await expect(row).toBeVisible();
  await expect(page.locator(".nx-toast").last()).toContainText("Deshecho");
});

test("D · confirmación con impacto: un clic no basta, mantener pulsado sí; un bloqueo deshabilita", async ({ page }) => {
  await open(page, "#/dialog");
  await page.locator("#dlg-c1 .nx-button__btn").click();
  const dlg = page.locator("nx-dialog.nx-confirm");
  await expect(dlg.locator(".nx-confirm__item")).toHaveCount(3);
  const ok = dlg.locator("nx-button").nth(1).locator(".nx-button__btn");
  await ok.click();
  await expect(dlg).toBeVisible();
  await ok.hover();
  await page.mouse.down();
  await page.waitForTimeout(1200);
  await page.mouse.up();
  await expect(dlg).toHaveCount(0);
  await expect(page.locator(".nx-toast").last()).toContainText("OC-2291 anulada");

  await page.locator("#dlg-c2 .nx-button__btn").click();
  const blocked = page.locator("nx-dialog.nx-confirm");
  await expect(blocked.locator(".nx-confirm__block")).toContainText("ya tiene un pago");
  await expect(blocked.locator("nx-button").nth(1)).toHaveAttribute("disabled", "");
});

test("móvil: el panel es una hoja desde abajo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await open(page, "#/dialog");
  await page.locator("#dlg-orders .dlg-item").first().click();
  const order = page.locator("#dlg-order");
  await expect(order).toBeVisible();
  await expect(order.locator(".nx-dialog__handle")).toBeVisible();
  const box = await order.boundingBox();
  expect(Math.round(box!.width)).toBe(390);
  expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(799);
});

// ---------------------------------------------------------------- Tab, capas y Escape en navegador real

/** Un diálogo de prueba: la cabecera de ficha (`nav`, módulo diferido) va al final del DOM, después
 *  del pie; en medio, una fecha (con segmentos) y un `<fieldset disabled>`. */
const FX = `
<button id="before" type="button">antes</button>
<nx-dialog id="fx" heading="Prueba" nav="prev next">
  <label>Uno <input id="f1"></label>
  <label>Fecha <input id="f2" type="date"></label>
  <fieldset disabled><input id="f3"><button id="f4" type="button">x</button></fieldset>
  <label>Tres <input id="f5"></label>
  <div slot="footer"><button id="b1" type="button">Cancelar</button><button id="b2" type="button">Guardar</button></div>
</nx-dialog>
<button id="after" type="button">después</button>`;

for (const rf of ["reading-flow", "sin reading-flow"] as const) {
  test(`Tab y Mayús+Tab (${rf}): en el orden en que se ve, la fecha por segmentos, sin el fieldset disabled y sin trampas`, async ({ page }) => {
    const simulated = rf === "sin reading-flow";
    if (simulated) await withoutReadingFlow(page);
    await open(page, "#/dialog");
    await mount(page, FX, simulated);
    await page.waitForSelector("#fx [data-tool=prev]", { state: "attached" });
    await page.evaluate(() => void document.querySelector<Dlg>("#fx")!.show(document.querySelector("#before")));
    await expect(page.locator("#f1")).toBeFocused();
    // Chrome 137+ ordena Tab solo; Firefox (y el Chrome simulado) dependen del componente.
    const native = !simulated && (await nativeReadingFlow(page));

    const fwd = await walk(page, 14);
    // La fecha se recorre por sus segmentos (el Tab del navegador), y el foco nunca se queda quieto.
    expect(fwd.stops.filter((s) => s === "f2").length).toBeGreaterThanOrEqual(3);
    expect(distinct(fwd.stops)).toEqual(["f2", "f5", "b1", "b2", "prev", "next", "x", "f1", "f2"]);
    expect(fwd.stops).not.toContain("f3");
    expect(fwd.stops).not.toContain("f4");
    // El componente solo evita el Tab del navegador en la vuelta (pie → cabecera) y, si el navegador
    // no ordena solo, al bajar de la cabecera (al final del DOM) al primer campo.
    expect(interceptedAt(fwd)).toEqual(native ? ["prev"] : ["prev", "f1"]);

    const back = await walk(page, 14, true);
    const order = distinct(back.stops);
    expect(order.slice(order.indexOf("f1"))).toEqual(["f1", "x", "next", "prev", "b2", "b1", "f5", "f2", "f1"]);
    expect(back.stops.filter((s) => s === "f2").length).toBeGreaterThanOrEqual(3);
    expect(interceptedAt(back)).toEqual(native ? ["b2"] : ["x", "b2"]);

    // Cerrado, Tab vuelve a ser de la página: el foco no queda atrapado (WCAG 2.1.2).
    await page.keyboard.press("Escape");
    await expect(page.locator("#fx")).toBeHidden();
    await expect(page.locator("#before")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.locator("#after")).toBeFocused();
  });
}

for (const rf of ["reading-flow", "sin reading-flow"] as const) {
  test(`una fecha en los extremos (${rf}): sus segmentos se recorren también al dar la vuelta`, async ({ page }) => {
    const simulated = rf === "sin reading-flow";
    if (simulated) await withoutReadingFlow(page);
    await open(page, "#/dialog");
    // Sin pie: la primera fecha es lo primero del cuerpo y la segunda, lo último (la × va al final del DOM).
    await mount(page, `<nx-dialog id="fx" heading="Fechas"><label>Desde <input id="d1" type="date"></label><label>Nota <input id="m"></label><label>Hasta <input id="d2" type="date"></label></nx-dialog>`, simulated);
    await page.evaluate(() => void document.querySelector<Dlg>("#fx")!.show());
    await expect(page.locator("#d1")).toBeFocused();
    await page.locator("#m").focus();
    const fwd = await walk(page, 8);
    expect(distinct(fwd.stops).slice(0, 3), fwd.stops.join(" ")).toEqual(["d2", "x", "d1"]);
    expect(fwd.stops.filter((s) => s === "d2").length).toBeGreaterThanOrEqual(3);
    await page.locator("#m").focus();
    const back = await walk(page, 8, true);
    expect(distinct(back.stops).slice(0, 3), back.stops.join(" ")).toEqual(["d1", "x", "d2"]);
    expect(back.stops.filter((s) => s === "d1").length).toBeGreaterThanOrEqual(3);
  });
}

test("un hijo con tabindex=-1 (un envoltorio enfocable por la app, un <nx-import>): Tab sí entra a lo de adentro", async ({ page }) => {
  await open(page, "#/dialog");
  // Con `reading-flow`, cada hijo del diálogo es un ámbito de foco y el navegador se salta el de tabindex negativo.
  await mount(page, `<nx-dialog id="fx" heading="Envoltorio"><div tabindex="-1" id="wrap"><input id="w1" aria-label="uno"><input id="w2" aria-label="dos"></div><div slot="footer"><button id="b1" type="button">Listo</button></div></nx-dialog>`);
  await page.evaluate(() => void document.querySelector<Dlg>("#fx")!.show());
  await expect(page.locator("#w1")).toBeFocused();
  expect((await walk(page, 4)).stops).toEqual(["w2", "b1", "x", "w1"]);
  expect((await walk(page, 4, true)).stops).toEqual(["x", "b1", "w2", "w1"]);
});

for (const rf of ["reading-flow", "sin reading-flow"] as const) {
  test(`radios, select, contenteditable y el aviso de cambios (${rf}): Tab nunca se queda quieto ni sale`, async ({ page }) => {
    const simulated = rf === "sin reading-flow";
    if (simulated) await withoutReadingFlow(page);
    await open(page, "#/dialog");
    await mount(
      page,
      `<nx-dialog id="fx" heading="Varios"><form>
        <fieldset><legend>Envío</legend><label><input type="radio" name="e" id="r1">A</label><label><input type="radio" name="e" id="r2" checked>B</label><label><input type="radio" name="e" id="r3">C</label></fieldset>
        <select id="s" aria-label="Sede"><option>Uno</option><option>Dos</option></select>
        <div contenteditable id="ce" aria-label="Nota">texto</div>
      </form><div slot="footer"><button id="b1" type="button">Listo</button></div></nx-dialog>`,
      simulated,
    );
    await page.evaluate(() => void document.querySelector<Dlg>("#fx")!.show());
    // Del grupo de radios queda una parada: la marcada.
    await expect(page.locator("#r2")).toBeFocused();
    expect((await walk(page, 6)).stops).toEqual(["s", "ce", "b1", "x", "r2", "s"]);
    expect((await walk(page, 6, true)).stops).toEqual(["r2", "x", "b1", "ce", "s", "r2"]);
    // Con cambios, Escape muestra el aviso: sus botones entran al recorrido y el foco no sale del diálogo.
    await page.locator("#ce").click();
    await page.keyboard.type("x");
    await page.keyboard.press("Escape");
    const guard = page.locator("#fx .nx-dialog__guard");
    await expect(guard).toBeVisible();
    await expect(guard.getByRole("button", { name: "Seguir editando" })).toBeFocused();
    const w = await walk(page, 8);
    expect(new Set(w.stops).size).toBeGreaterThan(4);
    expect(distinct(w.stops)).toEqual(w.stops);
    expect(await page.evaluate(() => document.querySelector("#fx")!.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(guard).toBeHidden();
    await expect(page.locator("#fx")).toBeVisible();
  });
}

test("el menú «Más» de la ficha: Escape lo cierra a él, Tab lo cierra y sigue, y el diálogo sigue abierto", async ({ page }) => {
  await open(page, "#/drawer");
  await page.locator("#dw-open .nx-button__btn").click();
  const panel = page.locator("#dw-panel");
  const more = panel.locator("[data-tool=more]");
  await expect(more).toBeVisible();
  await more.focus();
  await page.keyboard.press("Enter");
  const menu = panel.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem").nth(1)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(more).toBeFocused();
  await expect(panel).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(menu).toBeHidden();
  // Sigue después de «Más» (la ×), dentro del diálogo.
  await expect(panel.locator(".nx-dialog__x")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(more).toBeFocused();
});

test("solo la ×: del último botón del pie a la × y al primer campo, y al revés", async ({ page }) => {
  await open(page, "#/dialog");
  await mount(page, `<nx-dialog id="fx" heading="Solo cerrar"><label>Uno <input id="f1"></label><div slot="footer"><button id="b1" type="button">Listo</button></div></nx-dialog>`);
  await page.evaluate(() => void document.querySelector<Dlg>("#fx")!.show());
  await expect(page.locator("#f1")).toBeFocused();
  expect((await walk(page, 4)).stops).toEqual(["b1", "x", "f1", "b1"]);
  expect((await walk(page, 4, true)).stops).toEqual(["f1", "x", "b1", "f1"]);
});

test("View Transitions reales: close(); show() seguidos queda abierto, y show(); close() queda cerrado", async ({ page }) => {
  await open(page, "#/dialog");
  const supported = await page.evaluate(() => "startViewTransition" in document);
  const btn = page.locator("#dlg-new-btn .nx-button__btn");
  // 1) Abierto: close() y show() en el mismo turno. La primera promesa se resuelve con el valor del
  //    cierre; la segunda queda pendiente, y el diálogo termina a la vista con el foco adentro.
  const r1 = await page.evaluate(async () => {
    const d = document.querySelector<Dlg>("#dlg-new")!;
    const b = document.querySelector<HTMLElement>("#dlg-new-btn .nx-button__btn")!;
    const first = d.show(b);
    await new Promise((r) => setTimeout(r, 500));
    let settled: string | undefined = "pendiente";
    d.close("uno");
    const second = d.show(b);
    second.then((v) => (settled = `segunda: ${v}`));
    const v1 = await first;
    await new Promise((r) => setTimeout(r, 800));
    return { v1, settled, open: d.open, popover: d.matches(":popover-open"), attr: d.hasAttribute("open"), inside: d.contains(document.activeElement) };
  });
  expect(r1).toEqual({ v1: "uno", settled: "pendiente", open: true, popover: true, attr: true, inside: true });
  await expect(page.locator("#dlg-new")).toBeVisible();
  // 2) show(); close() antes del siguiente cuadro: queda cerrado, la promesa resuelta y Tab libre.
  const r2 = await page.evaluate(async () => {
    const d = document.querySelector<Dlg>("#dlg-new")!;
    d.close("dos");
    await new Promise((r) => setTimeout(r, 800));
    const b = document.querySelector<HTMLElement>("#dlg-new-btn .nx-button__btn")!;
    const p = d.show(b);
    d.close("tres");
    const v = await Promise.race([p, new Promise((r) => setTimeout(() => r("sin resolver"), 2000))]);
    await new Promise((r) => setTimeout(r, 800));
    return { v, open: d.open, popover: d.matches(":popover-open"), attr: d.hasAttribute("open"), morph: d.hasAttribute("data-morph") };
  });
  expect(r2).toEqual({ v: "tres", open: false, popover: false, attr: false, morph: false });
  await expect(page.locator("#dlg-new")).toBeHidden();
  await btn.focus();
  await page.keyboard.press("Tab");
  expect(await page.evaluate(() => !document.querySelector("#dlg-new")!.contains(document.activeElement))).toBe(true);
  test.info().annotations.push({ type: "view-transitions", description: supported ? "con startViewTransition" : "sin la API (cambio directo)" });
});

test("apilados: Escape en «Proveedor» cierra solo ese y el foco vuelve a «Ver proveedor»", async ({ page }) => {
  await open(page, "#/dialog");
  await page.locator("#dlg-orders .dlg-item").first().click();
  const order = page.locator("#dlg-order");
  await expect(order).toBeVisible();
  const toProv = order.getByRole("button", { name: /Ver proveedor/ });
  // Con el teclado (sin clic: Safari no enfoca el botón al pulsarlo).
  await toProv.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#dlg-prov")).toBeVisible();
  await expect(page.locator("#dlg-prov")).toHaveAttribute("data-depth", "0");
  await page.keyboard.press("Escape");
  await expect(page.locator("#dlg-prov")).toBeHidden();
  await expect(order).toBeVisible();
  await expect(toProv).toBeFocused();
  // Y otra vez con el ratón.
  await toProv.click();
  await expect(page.locator("#dlg-prov")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#dlg-prov")).toBeHidden();
  await expect(toProv).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(order).toBeHidden();
  await expect(page.locator("#dlg-orders .dlg-item").first()).toBeFocused();
});

test("un popover del autor adentro: Escape lo cierra a él y el diálogo sigue abierto", async ({ page }) => {
  await open(page, "#/dialog");
  await page.evaluate(() => {
    const d = document.querySelector("#dlg-new")!;
    d.querySelector("form")!.insertAdjacentHTML("beforeend", `<button type="button" id="pp-btn" popovertarget="pp">Opciones</button><div popover id="pp"><button type="button" id="pp-a">Una opción</button></div>`);
  });
  await page.locator("#dlg-new-btn .nx-button__btn").click();
  const dlg = page.locator("#dlg-new");
  await expect(dlg).toBeVisible();
  await page.locator("#pp-btn").click();
  const pp = page.locator("#pp");
  await expect(pp).toBeVisible();
  await page.locator("#pp-a").focus();
  await page.keyboard.press("Escape");
  await expect(pp).toBeHidden();
  await expect(dlg).toBeVisible();
  // El foco sigue dentro del diálogo, y el siguiente Escape sí lo cierra.
  expect(await dlg.evaluate((d) => d.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
});

test("la tarjeta de nx-explain dentro de un diálogo recibe el foco y su Escape, sin cerrar el diálogo", async ({ page }) => {
  await open(page, "#/explain");
  await page.evaluate(() => {
    const fig = document.querySelector("nx-explain[endpoint*=factura]")!;
    const d = document.createElement("nx-dialog") as Dlg;
    d.id = "xp-dlg";
    d.lang = "es-CO";
    d.setAttribute("heading", "Factura");
    const p = document.createElement("p");
    p.append(fig);
    d.append(p);
    document.body.append(d);
    void d.show();
  });
  const dlg = page.locator("#xp-dlg");
  await expect(dlg).toBeVisible();
  const fig = dlg.locator("nx-explain");
  await fig.focus();
  await page.keyboard.press("Enter");
  const card = page.locator(".nx-explain-card:popover-open");
  await expect(card).toBeFocused();
  await expect(card.locator(".nx-explain__value")).toHaveText("$ 10.601.500");
  // Tab es de la tarjeta (no lo devuelve el diálogo).
  await page.keyboard.press("Tab");
  expect(await card.evaluate((c) => c.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(card).toHaveCount(0);
  await expect(dlg).toBeVisible();
  await expect(fig).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
});

test("la tarjeta «¿por qué?» de nx-trend dentro de un diálogo recibe el foco y su Escape, sin cerrar el diálogo", async ({ page }) => {
  await open(page, "#/trend");
  await page.evaluate(() => {
    const t = document.querySelector("#trend-cost")!;
    const d = document.createElement("nx-dialog") as Dlg;
    d.id = "tr-dlg";
    d.setAttribute("heading", "Costos");
    d.setAttribute("size", "full");
    d.append(t);
    document.body.append(d);
    void d.show();
  });
  const dlg = page.locator("#tr-dlg");
  await expect(dlg).toBeVisible();
  const cost = dlg.locator("#trend-cost");
  await expect(cost.locator(".nx-trend__pt")).toHaveCount(27);
  await cost.getByRole("button", { name: "Ver como tabla" }).focus();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Materia prima, enero 2026/);
  await page.keyboard.press("Enter");
  const card = page.locator(".nx-trend-why");
  await expect(card).toBeVisible();
  expect(await card.evaluate((c) => c.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(card).toBeHidden();
  await expect(dlg).toBeVisible();
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /^Materia prima, enero 2026/);
});

test("un popover manual de la página, abierto antes del diálogo, queda debajo: el foco no va a él", async ({ page }) => {
  await open(page, "#/dialog");
  await page.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", `<div popover="manual" id="pm"><button type="button" id="pm-b">De la página</button></div>`);
    document.querySelector<HTMLElement>("#pm")!.showPopover();
  });
  await page.locator("#dlg-new-btn .nx-button__btn").click();
  const dlg = page.locator("#dlg-new");
  await expect(dlg.locator("input[name=prov]")).toBeFocused();
  // Ni moviéndolo la app, ni con Tab.
  await page.evaluate(() => document.querySelector<HTMLElement>("#pm-b")!.focus());
  expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  const { stops } = await walk(page, 12);
  expect(stops).not.toContain("pm-b");
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await expect(page.locator("#pm")).toBeVisible();
});
