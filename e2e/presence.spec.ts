import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/** Abre la página y espera a que la pestaña tenga su nombre definitivo (cambia si ya estaba tomado). */
async function tab(page: Page): Promise<void> {
  await open(page, "#/presence");
  await expect(page.locator("#presence-me")).not.toBeEmpty();
}
const first = (name: string) => name.split(" ")[0];

test("dos pestañas se ven: entran, se mueven, escriben, bloqueo suave y salen", async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  await tab(a);
  await tab(b);
  const pa = a.locator("#presence-demo");
  const pb = b.locator("#presence-demo");
  // BroadcastChannel entre las dos páginas: cada una ve a la otra.
  await expect(pa.locator(".nx-presence__stack > li")).toHaveCount(1);
  await expect(pb.locator(".nx-presence__stack > li")).toHaveCount(1);
  // Pasado el ajuste de nombres (1,2 s), cada una ve a la otra con su nombre.
  await a.waitForTimeout(1500);
  const nameA = (await a.locator("#presence-me").textContent())!;
  const nameB = (await b.locator("#presence-me").textContent())!;
  expect(nameA).not.toBe(nameB);
  await expect(pa.locator(".nx-presence__stack > li")).toHaveAttribute("title", `${nameB} · viendo`);
  await expect(pb.locator(".nx-presence__stack > li")).toHaveAttribute("title", `${nameA} · viendo`);
  await expect(pa.locator(".nx-presence__stack")).toHaveAccessibleName("Personas aquí");
  await expect(pa.getByRole("listitem").filter({ hasText: `${nameB}, viendo` })).toHaveCount(1);

  // B entra a «Monto»: A ve el contorno con su nombre.
  const montoB = b.locator("#presence-form [name=monto]");
  await montoB.click();
  const mark = a.locator(".nx-presence__layer .nx-presence__mark");
  await expect(mark).toHaveText(first(nameB));
  await expect(mark).toBeVisible();
  await expect(pa.locator(".nx-presence__stack > li")).toHaveAttribute("title", `${nameB} · en Monto (COP)`);

  // B escribe: «está escribiendo…» en A (y el valor viaja, por el canal de la demo).
  await montoB.press("End");
  await montoB.pressSequentially("99", { delay: 60 });
  await expect(mark).toHaveText(`${first(nameB)} está escribiendo…`);
  await expect(pa.locator(".nx-presence__stack > li")).toHaveAttribute("data-typing", "");
  await expect(a.locator("#presence-form [name=monto]")).toHaveValue("47.980.00099");

  // A enfoca el mismo campo: el aviso de bloqueo suave, que no bloquea.
  const montoA = a.locator("#presence-form [name=monto]");
  await montoA.click();
  const notice = a.getByRole("alert").filter({ hasText: "está editando este campo" });
  await expect(notice).toHaveText(new RegExp(`^${nameB} está editando este campo; tus cambios podrían pisar los suyos\\.`));
  await montoA.press("End");
  await montoA.pressSequentially("1");
  await expect(montoA).toHaveValue("47.980.000991");
  await notice.getByRole("button", { name: "Seguir de todas formas" }).click();
  await expect(notice).toHaveCount(0);
  await expect(montoA).toBeFocused();
  // Y B ve que A también lo está editando.
  await expect(b.getByRole("alert")).toContainText(`${nameA} está editando este campo`);

  // B sale del campo y cierra la pestaña: A la ve irse al instante.
  await b.locator("#presence-open").focus();
  await expect(mark).toHaveCount(0);
  // Como al cerrar una pestaña de verdad: corren `pagehide` y la despedida.
  await b.close({ runBeforeUnload: true });
  await expect(pa.locator(".nx-presence__stack > li")).toHaveCount(0);
  await expect(pa.locator(".nx-presence__alone")).toHaveText("Solo tú");
  await expect(pa.locator(".nx-presence__sr")).toContainText("salió");
});

test("simular compañeros: dos personas de mentira recorren el formulario", async ({ page }) => {
  await open(page, "#/presence");
  const p = page.locator("#presence-demo");
  const sim = page.locator("#presence-sim");
  await expect(p.locator(".nx-presence__alone")).toHaveText("Solo tú");
  await sim.click();
  await expect(sim).toHaveAttribute("aria-pressed", "true");
  await expect(p.locator(".nx-presence__stack > li")).toHaveCount(2);
  await expect(p.locator(".nx-presence__sr")).toContainText("entraron");
  // La primera escribe en «Monto»: su etiqueta lo dice y el aviso sale al enfocarlo.
  const typing = page.locator(".nx-presence__mark", { hasText: "está escribiendo…" });
  await expect(typing).toBeVisible({ timeout: 5000 });
  const monto = page.locator("#presence-form [name=monto]");
  await monto.focus();
  await expect(page.getByRole("alert")).toContainText("está editando este campo");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(monto).toBeFocused();

  // La lista completa: la persona actual primero, y qué hace cada quien.
  const more = p.getByRole("button", { name: "Ver quién está aquí" });
  await more.click();
  await expect(more).toHaveAttribute("aria-expanded", "true");
  const rows = p.locator(".nx-presence__pop .nx-presence__row");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("(tú)");
  await expect(rows.first()).toContainText("viendo");
  await page.keyboard.press("Escape");
  await expect(more).toHaveAttribute("aria-expanded", "false");

  await sim.click();
  await expect(p.locator(".nx-presence__stack > li")).toHaveCount(0);
  await expect(page.locator(".nx-presence__mark")).toHaveCount(0);
  await expect(page.locator("#presence-log")).toContainText("nx-presence-change → solo tú");
});
