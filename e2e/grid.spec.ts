import { expect, test, type Page } from "@playwright/test";
import { mod, open } from "./helpers";

const grid = (page: Page) => page.locator("#grid-demo");
const cell = (page: Page, r: number, c: number) => grid(page).locator(`.nx-grid__row[data-r="${r}"] > [data-c="${c}"]`);

test("teclado: mover, seleccionar un rango y ver la suma en el pie", async ({ page }) => {
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft"); // Monto
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press("Shift+ArrowDown");
  const foot = grid(page).locator(".nx-grid__foot");
  await expect(foot).toContainText("3 celdas");
  await expect(foot).toContainText("Suma");
});

test("teclado: la tabla es una sola parada de Tab; ↑ sube a las cabeceras y ↓ vuelve", async ({ page }) => {
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  const sorts = grid(page).locator(".nx-grid__sort");
  await expect(sorts.nth(1)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(sorts.nth(2)).toBeFocused();
  await page.keyboard.press("ArrowDown");
  const scroller = grid(page).locator(".nx-grid__scroll");
  await expect(scroller).toBeFocused();
  await expect(grid(page).locator('.nx-grid__row[data-r="0"] > [data-c="2"]')).toHaveClass(/is-active/);
  // Tab sale de la tabla: no recorre las cabeceras.
  await page.keyboard.press("Tab");
  expect(await scroller.evaluate((s) => s.contains(document.activeElement))).toBe(false);
});

test("editar escribiendo, deshacer y rehacer (también con los botones)", async ({ page }) => {
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  const monto = cell(page, 0, 7);
  const before = await monto.textContent();
  await page.keyboard.type("123");
  await page.keyboard.press("Enter");
  await expect(monto).toHaveText("$ 123");
  await expect(monto).toHaveClass(/is-edited/);
  await page.keyboard.press(`${mod(page)}+z`);
  await expect(monto).toHaveText(before!);
  await expect(monto).not.toHaveClass(/is-edited/);
  await page.getByRole("button", { name: /Rehacer/ }).click();
  await expect(monto).toHaveText("$ 123");
});

test("copiar y pegar con el portapapeles del sistema (TSV, como Excel)", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "los permisos de portapapeles solo se conceden en Chromium");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "#/grid");
  await cell(page, 0, 0).click();
  await page.keyboard.press("Shift+ArrowDown");
  await page.keyboard.press(`${mod(page)}+c`);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied.split("\n")).toHaveLength(2);
  // Pegar dos montos desde «Excel».
  await page.evaluate(() => navigator.clipboard.writeText("111\n222"));
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Escape");
  await page.keyboard.press(`${mod(page)}+v`);
  await expect(cell(page, 1, 7)).toHaveText("$ 111");
  await expect(cell(page, 2, 7)).toHaveText("$ 222");
});

test("filtrar con el filtro de una columna", async ({ page }) => {
  await open(page, "#/grid");
  const chips = grid(page).locator(".nx-grid__chip");
  await expect(chips).toHaveCount(0);
  const estado = grid(page).locator(".nx-grid__th", { hasText: "Estado" });
  await estado.hover();
  await estado.locator(".nx-grid__funnel").click();
  const panel = grid(page).locator(".nx-grid__filter");
  await expect(panel).toBeVisible();
  await panel.locator(".nx-grid__f-opts input[data-v]").first().uncheck();
  await expect(chips).toHaveCount(1);
  await expect(panel.locator(".nx-grid__f-left")).toContainText("de 600");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(estado.locator(".nx-grid__funnel")).toBeFocused();
  await expect(grid(page).locator(".nx-grid__foot")).toContainText("de 600 filas");
});

test("el desplazamiento virtual pinta pocas filas aunque haya 600", async ({ page }) => {
  await open(page, "#/grid");
  const rows = grid(page).locator(".nx-grid__row");
  const n = await rows.count();
  expect(n).toBeLessThan(60);
  await grid(page).locator(".nx-grid__scroll").evaluate((s) => (s.scrollTop = 32 * 400));
  await expect(grid(page).locator('.nx-grid__row[data-r="405"]')).toBeVisible();
});

/** Cajas de la barra de arriba, la tabla y el panel «Filtros», y el recorrido horizontal de cada scroller. */
const boxes = (page: Page) =>
  grid(page).evaluate((g) => {
    const box = (sel: string) => {
      const el = g.querySelector<HTMLElement>(sel)!;
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height, range: el.scrollWidth - el.clientWidth, x: el.scrollLeft };
    };
    return { bar: box(".nx-grid__hscroll"), table: box(".nx-grid__scroll"), facets: box(".nx-grid__facets") };
  });
type Topbar = { topScrollbar: boolean; columns: unknown[] };

test("barra de arriba: aparece si no cabe, va sobre la tabla, la lleva hasta el final y no cambia su caja", async ({ page }) => {
  // Un «ResizeObserver loop…» no sale en la consola: llega como `error` a window.
  await page.addInitScript(() => addEventListener("error", (e) => ((window as unknown as { errs: string[] }).errs ??= []).push(e.message)));
  await open(page, "#/grid");
  const bar = grid(page).locator(".nx-grid__hscroll");
  const table = grid(page).locator(".nx-grid__scroll");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await expect(bar).toHaveAttribute("tabindex", "-1");

  // Las nueve columnas no caben junto al panel: las dos tienen recorrido. La barra va encima de la
  // tabla, entre sus bordes, y el panel queda al lado de la tabla.
  const on = await boxes(page);
  expect(on.table.range).toBeGreaterThan(0);
  expect(on.bar.range).toBeGreaterThan(0);
  expect(on.bar.bottom).toBeLessThanOrEqual(on.table.top);
  expect(on.table.top - on.bar.bottom).toBeLessThanOrEqual(8);
  expect(Math.abs(on.bar.left - on.table.left - 1)).toBeLessThan(1);
  expect(Math.abs(on.table.right - on.bar.right - 1)).toBeLessThan(1);
  expect(Math.abs(on.facets.top - on.table.top)).toBeLessThan(1);

  // Desde arriba se llega a la última columna, y la barra sigue a la tabla.
  await bar.evaluate((b) => (b.scrollLeft = b.scrollWidth));
  await expect.poll(() => table.evaluate((s) => s.scrollWidth - s.clientWidth - s.scrollLeft)).toBeLessThanOrEqual(1);
  await table.evaluate((s) => (s.scrollLeft = 0));
  await expect.poll(() => bar.evaluate((b) => b.scrollLeft)).toBe(0);

  // Apagada (`top-scrollbar="false"`), la tabla se maqueta como antes: la misma caja para la tabla y el panel.
  await grid(page).evaluate((g) => ((g as unknown as Topbar).topScrollbar = false));
  await expect(bar).toBeHidden();
  const off = await boxes(page);
  for (const k of ["width", "height", "left"] as const) {
    expect(off.table[k]).toBeCloseTo(on.table[k], 1);
    expect(off.facets[k]).toBeCloseTo(on.facets[k], 1);
  }

  // Con columnas que caben, la barra no tiene recorrido: no hay barra que mostrar.
  await grid(page).evaluate((g) => {
    const el = g as unknown as Topbar;
    el.topScrollbar = true;
    el.columns = el.columns.slice(0, 2);
  });
  const fits = await boxes(page);
  expect(fits.table.range).toBe(0);
  expect(fits.bar.range).toBe(0);
  expect(await page.evaluate(() => (window as unknown as { errs?: string[] }).errs ?? [])).toEqual([]);
});

test("barra de arriba: en una pantalla angosta va entre el panel y la tabla; en RTL llega al final", async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 900 });
  await open(page, "#/grid");
  // Angosta, `facets-open` no abre el panel de arranque (iría encima y empujaría la tabla): lo abre
  // el botón «Filtros», y lo que abre quien mira se queda abierto.
  const toggle = grid(page).locator(".nx-grid__bar .nx-grid__btn[aria-controls]");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(grid(page).locator(".nx-grid__facets")).toBeHidden();
  await toggle.click();
  await expect(grid(page).locator(".nx-grid__facets")).toBeVisible();
  const on = await boxes(page);
  expect(on.facets.bottom).toBeLessThanOrEqual(on.bar.top);
  expect(on.bar.bottom).toBeLessThanOrEqual(on.table.top);
  await grid(page).evaluate((g) => ((g as unknown as Topbar).topScrollbar = false));
  const off = await boxes(page);
  for (const k of ["width", "height"] as const) {
    expect(off.table[k]).toBeCloseTo(on.table[k], 1);
    expect(off.facets[k]).toBeCloseTo(on.facets[k], 1);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await grid(page).evaluate((g) => {
    g.setAttribute("dir", "rtl");
    (g as unknown as Topbar).topScrollbar = true;
  });
  const bar = grid(page).locator(".nx-grid__hscroll");
  const table = grid(page).locator(".nx-grid__scroll");
  await bar.evaluate((b) => (b.scrollLeft = -b.scrollWidth));
  await expect.poll(() => table.evaluate((s) => s.scrollWidth - s.clientWidth + s.scrollLeft)).toBeLessThanOrEqual(1);
  await table.evaluate((s) => (s.scrollLeft = 0));
  await expect.poll(() => bar.evaluate((b) => b.scrollLeft)).toBe(0);
});

test("las líneas de las columnas llegan al fondo con pocas filas: alineadas, sin scroll de más y sin filas, ninguna", async ({ page }) => {
  await open(page, "#/grid");
  const measure = () =>
    grid(page).evaluate((g) => {
      const s = g.querySelector<HTMLElement>(".nx-grid__scroll")!;
      const fill = g.querySelector<HTMLElement>(".nx-grid__fill")!;
      const head = g.querySelector<HTMLElement>(".nx-grid__head")!;
      const rights = (el: Element) => [...el.children].map((c) => c.getBoundingClientRect().right);
      const fr = fill.getBoundingClientRect();
      return { shown: getComputedStyle(fill).display !== "none", lines: rights(fill), ths: rights(head), fillH: fr.height, fillW: fr.width, headW: head.getBoundingClientRect().width, top: fr.top - s.getBoundingClientRect().top - s.clientTop, clientH: s.clientHeight, scrollH: s.scrollHeight, headH: head.offsetHeight };
    });
  type Grid = { rows: unknown[] };

  // Con 600 filas el relleno queda detrás y lo que se desplaza mide lo mismo que antes.
  const many = await measure();
  expect(Math.abs(many.scrollH - (many.headH + 600 * 32))).toBeLessThanOrEqual(1);

  // Con pocas filas llega al fondo de lo visible, cada línea en el borde de su cabecera, sin scroll.
  await grid(page).evaluate((g) => ((g as unknown as Grid).rows = (g as unknown as Grid).rows.slice(0, 5)));
  for (const dir of ["ltr", "rtl"]) {
    await grid(page).evaluate((g, d) => g.setAttribute("dir", d), dir);
    const few = await measure();
    expect(few.shown).toBe(true);
    expect(few.lines).toHaveLength(few.ths.length);
    few.lines.forEach((x, i) => expect(Math.abs(x - few.ths[i]), `${dir}: línea ${i}`).toBeLessThan(1));
    expect(Math.abs(few.top)).toBeLessThan(1);
    expect(few.fillH).toBeCloseTo(few.clientH, 0);
    expect(few.fillW).toBeCloseTo(few.headW, 0);
    expect(few.scrollH).toBe(few.clientH);
  }

  // Sin filas, el aviso queda limpio.
  await grid(page).evaluate((g) => ((g as unknown as Grid).rows = []));
  expect((await measure()).shown).toBe(false);
});

// ---------------------------------------------------------------- repaso de la revisión (2026-10-03)

type Live = { rows: Record<string, unknown>[]; columns: { key: string }[]; filters: unknown[]; views: unknown[] };

/** Una tabla con `source` contra un servidor simulado (`page.route`) de `total` filas; `fail`: el
 *  servidor responde 500. Va arriba de la tabla de la galería. */
async function serverGrid(page: Page, total: number, fail = false) {
  await page.route("**/e2e-grid", async (route) => {
    if (fail) return route.fulfill({ status: 500, body: "caído" });
    const q = JSON.parse(route.request().postData() ?? "{}") as { offset: number; limit: number };
    const n = Math.max(0, Math.min(q.limit, total - q.offset));
    const rows = Array.from({ length: n }, (_, i) => ({ id: String(q.offset + i), t: `Fila ${q.offset + i}`, n: q.offset + i }));
    await route.fulfill({ json: { rows, total } });
  });
  await open(page, "#/grid");
  await page.evaluate(() => {
    const g = document.createElement("nx-grid") as unknown as HTMLElement & Live;
    g.id = "e2e-server";
    g.setAttribute("height", "400");
    g.columns = [
      { key: "t", label: "Fila" },
      { key: "n", label: "Número", type: "number" },
    ] as never;
    g.setAttribute("source", "/e2e-grid");
    document.querySelector("#grid-demo")!.before(g);
  });
  return page.locator("#e2e-server");
}

test("servidor con un millón de filas: la barra al fondo llega a la última, la cabecera sigue fija y teclas y rueda no saltan", async ({ page }) => {
  const g = await serverGrid(page, 1_000_000);
  const s = g.locator(".nx-grid__scroll");
  await expect(g.locator('.nx-grid__row[data-r="0"]')).toContainText("Fila 0");
  // El alto tiene tope (el navegador no pinta más) y el recorrido se escala.
  expect(await s.evaluate((el) => el.scrollHeight)).toBeLessThan(8_100_000);
  // La barra al fondo (Playwright abre los navegadores sin barras nativas: el pulgar no se puede
  // agarrar, así que se deja donde lo deja el arrastre, en el máximo).
  await s.evaluate((el) => (el.scrollTop = el.scrollHeight));
  const last = g.locator('.nx-grid__row[data-r="999999"]');
  await expect(last).toContainText("Fila 999999");
  /** Qué fila se ve primero bajo la cabecera, y dónde queda la activa respecto de lo visible. */
  const where = () =>
    g.evaluate((el) => {
      const sc = el.querySelector<HTMLElement>(".nx-grid__scroll")!;
      const top = el.querySelector<HTMLElement>(".nx-grid__head")!.getBoundingClientRect().bottom;
      const bottom = sc.getBoundingClientRect().top + sc.clientHeight;
      const rows = [...el.querySelectorAll<HTMLElement>(".nx-grid__row")].filter((r) => r.getBoundingClientRect().bottom > top + 1);
      const act = el.querySelector<HTMLElement>(".nx-grid__cell.is-active")?.getBoundingClientRect();
      return { first: Math.min(...rows.map((r) => Number(r.dataset.r))), act: act ? { top: act.top - top, bottom: bottom - act.bottom } : null };
    });
  // La última fila queda entera a la vista, sin un hueco debajo.
  const lastBox = (await last.boundingBox())!;
  const sBox = (await s.boundingBox())!;
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(sBox.y + sBox.height + 1);
  expect(sBox.y + sBox.height - (lastBox.y + lastBox.height)).toBeLessThan(40);
  // La cabecera sigue fija arriba (en Firefox, con 15 M de alto, se iba con el scroll).
  const headBox = (await g.locator(".nx-grid__head").boundingBox())!;
  expect(Math.abs(headBox.y - sBox.y)).toBeLessThan(3);

  // Teclado en la zona escalada: cada flecha mueve una fila y la activa sigue a la vista, pegada al
  // borde por donde salía (sin desplazar de más).
  await last.locator('[data-c="0"]').click();
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowUp");
  await expect(g.locator(".nx-grid__cell.is-active")).toHaveAttribute("id", /-999979-0$/);
  // Con la escala, un píxel de scroll son varios de la tabla: se tolera un par de píxeles.
  const near = (x: number) => {
    expect(x).toBeGreaterThanOrEqual(-4);
    expect(x).toBeLessThan(8);
  };
  near((await where()).act!.top);
  await page.keyboard.press("PageUp");
  near((await where()).act!.top);
  for (let i = 0; i < 3; i++) await page.keyboard.press("PageDown");
  near((await where()).act!.bottom);
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowDown");
  near((await where()).act!.bottom);

  // La rueda: unas filas por paso, siempre hacia el mismo lado, sin saltos de miles.
  await s.evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
  await expect.poll(async () => (await where()).first).toBeGreaterThan(400_000);
  const box = (await s.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let prev = (await where()).first;
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120);
    await expect.poll(async () => (await where()).first).toBeGreaterThan(prev);
    const now = (await where()).first;
    expect(now - prev).toBeLessThan(40);
    prev = now;
  }
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await where()).first).toBeLessThan(prev);
  expect(prev - (await where()).first).toBeLessThan(40);
});

test("teclado en la cabecera: anillo de foco, Inicio y Fin, ancho con Ctrl+→, filtro con Alt+↓ y Tab sale", async ({ page }) => {
  await open(page, "#/grid");
  const g = grid(page);
  const sorts = g.locator(".nx-grid__sort");
  const scroller = g.locator(".nx-grid__scroll");
  await cell(page, 0, 0).click();
  await page.keyboard.press("ArrowUp");
  await expect(sorts.nth(0)).toBeFocused();
  // Llegó con el teclado: se ve el anillo (`:focus-visible`), no solo el foco.
  const ring = await sorts.nth(0).evaluate((b) => ({ fv: b.matches(":focus-visible"), style: getComputedStyle(b).outlineStyle, width: getComputedStyle(b).outlineWidth }));
  expect(ring).toEqual({ fv: true, style: "solid", width: "2px" });
  const n = await sorts.count();
  await page.keyboard.press("End");
  await expect(sorts.nth(n - 1)).toBeFocused();
  await page.keyboard.press("Home");
  await expect(sorts.nth(0)).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(sorts.nth(1)).toBeFocused();
  // Ctrl+→ ensancha la columna 16 px; Supr la devuelve a su ancho.
  const th = g.locator(".nx-grid__th").nth(1);
  const w0 = (await th.boundingBox())!.width;
  await page.keyboard.press("Control+ArrowRight");
  await expect.poll(async () => (await th.boundingBox())!.width).toBeCloseTo(w0 + 16, 0);
  await expect(sorts.nth(1)).toBeFocused();
  await page.keyboard.press("Delete");
  await expect.poll(async () => (await th.boundingBox())!.width).toBeCloseTo(w0, 0);
  // Alt+↓ abre el filtro de la columna; Escape lo cierra.
  await page.keyboard.press("Alt+ArrowDown");
  const panel = g.locator(".nx-grid__filter");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  // ↓ vuelve a las celdas, en la misma columna.
  await page.keyboard.press("ArrowDown");
  await expect(scroller).toBeFocused();
  await expect(cell(page, 0, 1)).toHaveClass(/is-active/);
  // Tab desde la cabecera sale de la tabla (las cabeceras no son paradas de Tab).
  await page.keyboard.press("ArrowUp");
  await expect(sorts.nth(1)).toBeFocused();
  await page.keyboard.press("Tab");
  expect(await scroller.evaluate((s) => s.contains(document.activeElement))).toBe(false);
  await page.keyboard.press("Shift+Tab");
  await expect(scroller).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  expect(await scroller.evaluate((s) => s.contains(document.activeElement))).toBe(false);
});

/** Junta en la página lo que sale en `nx-grid-change`. */
const recordChanges = (page: Page) =>
  grid(page).evaluate((g) => {
    const w = window as unknown as { changes: unknown[] };
    w.changes = [];
    g.addEventListener("nx-grid-change", (e) => w.changes.push(...(e as CustomEvent<{ changes: unknown[] }>).detail.changes));
  });
const changes = (page: Page) => page.evaluate(() => (window as unknown as { changes: { id: string; key: string; value: unknown }[] }).changes);

test("editar con datos en vivo: si la app reasigna las filas, el campo sigue a su fila con lo escrito y el foco", async ({ page }) => {
  await open(page, "#/grid");
  const g = grid(page);
  await recordChanges(page);
  await cell(page, 0, 1).click(); // Descripción, editable
  const oc = (await cell(page, 0, 0).textContent())!;
  await page.keyboard.press("F2");
  await page.keyboard.type("hola");
  const input = g.locator(".nx-grid__input");
  await expect(input).toBeFocused();
  // Un sondeo trae las mismas filas (copias nuevas) en el orden inverso: la fila pasa al final.
  await g.evaluate((el) => {
    const x = el as unknown as Live;
    x.rows = x.rows.map((r) => ({ ...r })).reverse();
  });
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("hola");
  await expect(input).toBeInViewport();
  const at = await input.evaluate((i) => Number(i.closest<HTMLElement>(".nx-grid__row")!.dataset.r));
  expect(at).toBeGreaterThan(500);
  expect(await changes(page)).toEqual([]);
  // Se sigue escribiendo donde iba el cursor, y Enter lo guarda en su registro.
  await page.keyboard.type(" mundo");
  await page.keyboard.press("Enter");
  expect(await changes(page)).toEqual([expect.objectContaining({ id: oc.replace("OC-", ""), key: "desc", value: "hola mundo" })]);
  expect(await g.evaluate((el, o) => (el as unknown as Live).rows.find((r) => r.oc === o)?.desc, oc)).toBe("hola mundo");
  // Filtrada mientras se edita: ya no se ve, así que lo escrito se guarda en ella (no se pierde).
  await g.locator(".nx-grid__scroll").evaluate((s) => (s.scrollTop = 0));
  await cell(page, 0, 1).click();
  const oc2 = (await cell(page, 0, 0).textContent())!;
  await page.keyboard.press("F2");
  await page.keyboard.type("filtrada");
  await g.evaluate((el, o) => ((el as unknown as Live).filters = [{ key: "oc", op: "notIn", values: [o] }]), oc2);
  await expect(input).toHaveCount(0);
  await expect(g.locator(".nx-grid__scroll")).toBeFocused();
  expect(await g.evaluate((el, o) => (el as unknown as Live).rows.find((r) => r.oc === o)?.desc, oc2)).toBe("filtrada");
});

test("editar y desplazarse con la rueda: las filas siguen; si la fila editada sale de la vista se guarda y el foco queda en la tabla", async ({ page }) => {
  await open(page, "#/grid");
  const g = grid(page);
  await recordChanges(page);
  await cell(page, 0, 1).click();
  const oc = (await cell(page, 0, 0).textContent())!;
  await page.keyboard.press("F2");
  await page.keyboard.type("rueda");
  const input = g.locator(".nx-grid__input");
  const box = (await g.locator(".nx-grid__scroll").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  // Un poco: el campo sigue, y las demás filas se movieron con el scroll.
  const y0 = (await cell(page, 3, 0).boundingBox())!.y;
  await page.mouse.wheel(0, 64);
  await expect.poll(async () => (await cell(page, 3, 0).boundingBox())?.y).toBeLessThan(y0 - 30);
  await expect(input).toHaveValue("rueda");
  await expect(input).toBeFocused();
  // Mucho: la fila de la edición sale de la vista; se guarda y el foco queda en la tabla.
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 400);
  await expect(input).toHaveCount(0);
  await expect(g.locator(".nx-grid__scroll")).toBeFocused();
  expect(await changes(page)).toEqual([expect.objectContaining({ id: oc.replace("OC-", ""), key: "desc", value: "rueda" })]);
  // Las filas que se ven son las del scroll (no quedó la de la edición pegada arriba).
  await expect(g.locator('.nx-grid__row[data-r="0"]')).toHaveCount(0);
});

test("copiar con Ctrl+C: el destello sale una vez y no se repite al moverse", async ({ page, browserName }) => {
  await open(page, "#/grid");
  const scroller = grid(page).locator(".nx-grid__scroll");
  await cell(page, 0, 0).click();
  // En Firefox, Ctrl+C sintético no dispara `copy`: va el evento, como en `paste`.
  if (browserName === "chromium") await page.keyboard.press(`${mod(page)}+c`);
  else await scroller.evaluate((el) => el.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: new DataTransfer() })));
  await expect(scroller).toHaveClass(/is-copied/);
  await expect(scroller).not.toHaveClass(/is-copied/, { timeout: 2000 });
  for (const k of ["ArrowDown", "ArrowRight", "ArrowDown"]) {
    await page.keyboard.press(k);
    const anims = await grid(page).locator(".nx-grid__cell.is-active").evaluate((c) => c.getAnimations().map((a) => (a as CSSAnimation).animationName));
    expect(anims).not.toContain("nx-grid-copy");
  }
});

/** Abre el filtro de una columna con su embudo. */
async function openFilter(page: Page, label: string) {
  const th = grid(page).locator(".nx-grid__th", { hasText: label });
  await th.hover();
  await th.locator(".nx-grid__funnel").click();
  const panel = grid(page).locator(".nx-grid__filter");
  await expect(panel).toBeVisible();
  return { th, panel };
}

test("colores forzados: la celda activa, el foco de la tabla y del buscador, los menús, el asa y el deslizador se ven", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "#/grid");
  const g = grid(page);
  /** El color del sistema, resuelto por el navegador (para comparar con lo calculado). */
  const system = (name: string) =>
    page.evaluate((n) => {
      const p = document.body.appendChild(document.createElement("i"));
      p.style.cssText = `forced-color-adjust: none; color: ${n}`;
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    }, name);
  const highlight = await system("Highlight");
  const outline = (sel: string) => g.locator(sel).first().evaluate((el) => ({ style: getComputedStyle(el).outlineStyle, width: getComputedStyle(el).outlineWidth, color: getComputedStyle(el).outlineColor }));
  await cell(page, 0, 0).click();
  await page.keyboard.press("ArrowDown");
  expect(await outline(".nx-grid__cell.is-active")).toEqual({ style: "solid", width: "2px", color: highlight });
  // El scroller, enfocado con el teclado (Tab de vuelta desde fuera).
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(g.locator(".nx-grid__scroll")).toBeFocused();
  expect(await outline(".nx-grid__scroll")).toEqual({ style: "solid", width: "2px", color: highlight });
  // El menú de una celda, con el foco en su primer ítem.
  await page.keyboard.press("Shift+F10");
  const item = page.locator(".nx-grid__menu:popover-open .nx-grid__menu-item").first();
  await expect(item).toBeFocused();
  expect(await item.evaluate((el) => [getComputedStyle(el).outlineStyle, getComputedStyle(el).outlineWidth, getComputedStyle(el).outlineColor])).toEqual(["solid", "2px", highlight]);
  await page.keyboard.press("Escape");
  // El buscador de la barra.
  await g.locator(".nx-grid__search input").click();
  expect(await outline(".nx-grid__search")).toEqual({ style: "solid", width: "2px", color: highlight });
  // El asa del ancho, con el puntero encima.
  const handle = g.locator(".nx-grid__resize").nth(1);
  await handle.hover();
  expect(await handle.evaluate((el) => getComputedStyle(el, "::after").backgroundColor)).toBe(highlight);
  // El deslizador de un monto: el riel en GrayText, el tramo en Highlight y el campo sin ajustar.
  const { panel } = await openFilter(page, "Monto");
  expect(await panel.locator(".nx-grid__track").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await system("GrayText"));
  expect(await panel.locator(".nx-grid__track i").first().evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(highlight);
  const range = panel.locator('input[type="range"]').first();
  expect(await range.evaluate((el) => getComputedStyle(el).forcedColorAdjust)).toBe("none");
  // Con el teclado, como llega quien lo usa (el panel abre con el foco en «Desde»).
  await panel.getByRole("textbox", { name: "Desde" }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(range).toBeFocused();
  await page.keyboard.press("ArrowRight");
  expect(await range.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  // Los pulgares (pseudoelementos que `getComputedStyle` no lee) se miran en la captura.
  await panel.screenshot({ path: test.info().outputPath("deslizador-forzado.png") });
});

test("RTL: el filtro, el menú de la celda y el de vistas abren junto a su embudo o su botón", async ({ page }) => {
  await open(page, "#/grid");
  const g = grid(page);
  await g.evaluate((el) => el.setAttribute("dir", "rtl"));
  /** Que `b` (el flotante) quede pegado a `a` (lo que lo abrió): debajo y solapado en lo horizontal. */
  const beside = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) => {
    expect(b.x).toBeLessThan(a.x + a.width);
    expect(b.x + b.width).toBeGreaterThan(a.x);
    expect(Math.abs(b.y - (a.y + a.height))).toBeLessThan(40);
  };
  for (const label of ["Proveedor", "Monto"]) {
    const { th, panel } = await openFilter(page, label);
    beside((await th.locator(".nx-grid__funnel").boundingBox())!, (await panel.boundingBox())!);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
  }
  // El menú de la celda, donde se hizo clic derecho.
  const c = cell(page, 1, 2);
  // Medido ya a la vista (el clic la desplazaría y la caja medida antes no serviría).
  await c.scrollIntoViewIfNeeded();
  const cb = (await c.boundingBox())!;
  await c.click({ button: "right", position: { x: cb.width / 2, y: cb.height / 2 } });
  const menu = page.locator(".nx-grid__menu:popover-open");
  await expect(menu).toBeVisible();
  const mb = (await menu.boundingBox())!;
  const x = cb.x + cb.width / 2;
  expect(Math.min(Math.abs(mb.x - x), Math.abs(mb.x + mb.width - x))).toBeLessThan(12);
  expect(Math.abs(mb.y - (cb.y + cb.height / 2))).toBeLessThan(40);
  await page.keyboard.press("Escape");
  // El menú de vistas, bajo su botón.
  const btn = g.getByRole("button", { name: /^Vistas/ });
  await btn.click();
  const views = page.locator(".nx-grid__vpop:popover-open");
  await expect(views).toBeVisible();
  beside((await btn.boundingBox())!, (await views.boundingBox())!);
});

test("lista del filtro: la casilla se llama como su valor (sin «Solo»), y Tab lleva a «Solo», de al menos 24 px", async ({ page }) => {
  await open(page, "#/grid");
  const { panel } = await openFilter(page, "Proveedor");
  await expect(panel.getByRole("checkbox", { name: /^Aceros del Caribe [\d.]+$/ })).toHaveCount(1);
  // Con el foco en la fila, «Solo» ocupa el lugar del conteo (y el nombre queda sin él).
  const box = panel.locator('input[data-v="Aceros del Caribe"]');
  await box.focus();
  await page.keyboard.press("Tab");
  const only = panel.getByRole("button", { name: "Solo «Aceros del Caribe»" });
  await expect(only).toBeFocused();
  await expect(only).toBeVisible();
  expect((await only.boundingBox())!.height).toBeGreaterThanOrEqual(24);
  // Toda la fila menos el botón marca: también el borde (el relleno es del label).
  const rb = await box.evaluate((b) => {
    const r = b.closest(".nx-grid__opt")!.getBoundingClientRect();
    return { x: r.x, y: r.y };
  });
  const before = await box.isChecked();
  await page.mouse.click(rb.x + 2, rb.y + 2);
  await expect(box).toBeChecked({ checked: !before });
});

test("Escape o un clic afuera aplican lo escrito en «contiene» y en «Desde», sin errores en la consola", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "#/grid");
  const g = grid(page);
  const chips = g.locator(".nx-grid__chip");
  await g.evaluate((el) => {
    const x = el as unknown as Live & { columns: { key: string; filter?: string }[] };
    x.columns = x.columns.map((c) => (c.key === "oc" ? { ...c, filter: "text" } : c));
  });
  const n0 = await chips.count();
  let { panel } = await openFilter(page, "Pedido");
  await panel.getByRole("searchbox").fill("OC-22");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(chips).toHaveCount(n0 + 1);
  await expect(chips.last()).toContainText("OC-22");
  ({ panel } = await openFilter(page, "Monto"));
  await panel.getByRole("textbox", { name: "Desde" }).fill("5 M");
  // Un clic afuera, en el título de la página.
  await page.locator("h1").first().click();
  await expect(panel).toBeHidden();
  await expect(chips).toHaveCount(n0 + 2);
  expect(errors).toEqual([]);
});

test("menú de vistas cerca del borde de abajo: abre hacia arriba, sigue al botón y su alto queda acotado", async ({ page }) => {
  await open(page, "#/grid");
  const g = grid(page);
  await g.evaluate((el) => ((el as unknown as Live).views = Array.from({ length: 40 }, (_, i) => ({ id: `v${i}`, name: `Vista ${i + 1}`, filters: [] }))));
  const btn = g.getByRole("button", { name: /^Vistas/ });
  // El botón, a 80 px del borde de abajo de la ventana: una ventana baja.
  const bottom = (await btn.boundingBox())!;
  await page.setViewportSize({ width: 1440, height: Math.round(bottom.y + bottom.height + 80) });
  await btn.click();
  const menu = page.locator(".nx-grid__vpop:popover-open");
  await expect(menu).toBeVisible();
  let b = (await btn.boundingBox())!;
  let m = (await menu.boundingBox())!;
  expect(m.y + m.height).toBeLessThanOrEqual(b.y + 1);
  expect(m.y).toBeGreaterThanOrEqual(0);
  expect(await menu.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  // Al desplazar la página, sigue al botón.
  const gap = b.y - (m.y + m.height);
  // La página baja 60 px (el botón sube): el menú va con él.
  await page.locator("h1").first().hover();
  await page.mouse.wheel(0, 60);
  await expect.poll(async () => (await btn.boundingBox())!.y).toBeLessThan(b.y - 30);
  await expect.poll(async () => {
    b = (await btn.boundingBox())!;
    m = (await menu.boundingBox())!;
    return Math.round(b.y - (m.y + m.height) - gap);
  }).toBe(0);
});
