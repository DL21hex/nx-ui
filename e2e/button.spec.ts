import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/** Un <nx-button> propio arriba de la página de la galería, sin la lógica de sus demos. */
const add = (page: Page, html: string) => page.evaluate((h) => document.body.insertAdjacentHTML("afterbegin", h), html);

test.describe("táctil", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });

  test("hold: un toque largo de 1000 ms completa la acción una sola vez, sin menú del sistema", async ({ page, browserName }) => {
    // Un toque mantenido solo se puede emular con el protocolo de Chromium (Playwright solo da `tap`).
    test.skip(browserName !== "chromium", "toque mantenido con CDP");
    await open(page, "#/button");
    await add(page, '<nx-button id="hb" hold label="Borrar" style="position:fixed;top:100px;left:20px;z-index:99999"></nx-button>');
    await page.evaluate(() => {
      const b = document.getElementById("hb")!;
      const w = window as unknown as { clicks: number; cancels: number };
      w.clicks = 0;
      w.cancels = 0;
      b.addEventListener("click", () => w.clicks++);
      b.addEventListener("pointercancel", () => w.cancels++, true);
    });
    const btn = page.locator("#hb .nx-button__btn");
    const css = await btn.evaluate((el) => ({ touch: getComputedStyle(el).touchAction, select: getComputedStyle(el).userSelect }));
    expect(css).toEqual({ touch: "manipulation", select: "none" });
    const box = (await btn.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await expect(btn).toHaveAttribute("data-holding", "");
    // El menú del sistema llega hacia los 500 ms de un toque largo: mientras se mantiene, se cancela.
    const menu = await btn.evaluate((el) => !el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
    expect(menu).toBe(true);
    const clicks = () => page.evaluate(() => (window as unknown as { clicks: number }).clicks);
    // Sin soltar: el clic llega al completar la pulsación (1000 ms).
    await expect.poll(clicks, { timeout: 3000 }).toBe(1);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    // El clic de la pulsación completa llega a la app; el del toque al soltar, no.
    expect(await clicks()).toBe(1);
    expect(await page.evaluate(() => (window as unknown as { cancels: number }).cancels)).toBe(0);
  });
});

test("log-mode=inline: un cambio de progress no toca el registro; cada línea entra una vez y anima una vez", async ({ page }) => {
  await open(page, "#/button");
  await add(page, '<nx-button id="lb" label="Sincronizar" log-mode="inline"></nx-button>');
  const r = await page.evaluate(async () => {
    const b = document.getElementById("lb") as unknown as HTMLElement & { log(m: string): void; progress: number | null; done(ok?: boolean): void };
    const frame = () => new Promise((res) => requestAnimationFrame(() => res(null)));
    const panel = b.querySelector<HTMLElement>(".nx-button__log")!;
    // Que la última fila termine de entrar: su `animationend` llega después de todos los `animationstart`
    // (el tope es por si nunca anima; la prueba fallaría más abajo).
    const rowEnd = () =>
      new Promise((res) => {
        panel.addEventListener("animationend", (e) => (e.target as Element).parentElement === panel && res(null));
        setTimeout(res, 3000);
      });
    let ended = rowEnd();
    for (let i = 1; i <= 12; i++) b.log(`Paso ${i}`);
    await ended;
    await frame();
    const last = panel.lastElementChild as HTMLElement;
    // Cada fila que (re)empieza su animación de entrada (no el cursor que parpadea adentro).
    let starts = 0;
    panel.addEventListener("animationstart", (e) => (e.target as Element).parentElement === panel && starts++);
    const muts: MutationRecord[] = [];
    const mo = new MutationObserver((m) => muts.push(...m));
    mo.observe(panel, { childList: true, subtree: true, characterData: true, attributes: true });
    for (let p = 0.1; p < 1; p += 0.1) {
      b.progress = p;
      await frame();
    }
    await frame();
    const duringProgress = muts.length;
    const sameNode = panel.lastElementChild === last;
    const animsDuringProgress = starts;
    muts.length = 0;
    ended = rowEnd();
    b.log("Paso 13");
    await ended;
    await frame();
    const animsOnLog = starts;
    mo.disconnect();
    const added = muts.flatMap((m) => [...m.addedNodes]).filter((n) => n.parentNode === panel).length;
    const removed = muts.filter((m) => m.target === panel).flatMap((m) => [...m.removedNodes]).length;
    const status = b.querySelector('[role="status"]')!.textContent;
    b.done(true);
    return { role: panel.getAttribute("role"), rows: panel.children.length, duringProgress, sameNode, animsDuringProgress, animsOnLog, added, removed, status };
  });
  expect(r.role).toBe("log");
  expect(r.rows).toBe(13);
  expect(r.duringProgress).toBe(0);
  expect(r.sameNode).toBe(true);
  expect(r.animsDuringProgress).toBe(0);
  expect(r.animsOnLog).toBe(1);
  // La región `role="log"` solo recibe la fila nueva; el `role="status"` del botón calla (el registro ya la anuncia).
  expect(r.added).toBe(1);
  expect(r.removed).toBe(0);
  expect(r.status).toBe("");
});

test("alto contraste: el spinner tiene un borde de otro color y el relleno de hold se ve", async ({ page }) => {
  await page.emulateMedia({ forcedColors: "active" });
  await open(page, "#/button");
  await add(page, '<nx-button id="fb" label="Generar" busy></nx-button><nx-button id="fh" hold="10000" label="Borrar"></nx-button>');
  const spin = await page.locator("#fb .nx-spinner").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: cs.borderTopColor, right: cs.borderRightColor };
  });
  expect(spin.top).not.toBe(spin.right);
  const btn = page.locator("#fh .nx-button__btn");
  await btn.dispatchEvent("pointerdown", { button: 0, pointerType: "mouse" });
  await expect(btn).toHaveAttribute("data-holding", "");
  // El relleno crece durante la pulsación (aquí 10 s, para que la máquina cargada no la complete): que haya avanzado algo.
  await expect.poll(() => page.locator("#fh .nx-button__hold").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(4);
  const fill = await page.locator("#fh .nx-button__hold").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, w: el.getBoundingClientRect().width, opacity: cs.opacity };
  });
  expect(fill.bg).not.toMatch(/rgba\(.*, 0\)|transparent/);
  expect(fill.w).toBeGreaterThan(0);
  expect(Number(fill.opacity)).toBeGreaterThan(0.3);
  await btn.dispatchEvent("pointerup");
});
