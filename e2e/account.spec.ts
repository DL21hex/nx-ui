import { expect, test, type Page } from "@playwright/test";
import { open } from "./helpers";

/** La cuenta de la galería (`#/account`), con su panel ya cargado. */
async function account(page: Page) {
  await open(page, "#/account");
  const acc = page.locator("#acc");
  await expect(acc.locator(".nx-account__card")).toBeVisible();
  return acc;
}
const card = (page: Page) => page.locator("#acc .nx-account__card");
const pop = (page: Page) => page.locator("#acc .nx-account__pop");
const row = (page: Page, k: string) => page.locator(`#acc [data-k="${k}"]`);

async function openPanel(page: Page) {
  await card(page).click();
  await expect(pop(page).locator(".nx-account__head")).toBeVisible();
}

/** Entra a «Ver como» con la primera persona que responde la API de la demo. */
async function viewAsFirst(page: Page) {
  await openPanel(page);
  await row(page, "viewas").click();
  const first = pop(page).locator(".nx-account__opt").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.locator(".nx-viewas")).toBeVisible();
}

test("sin rastro del bloqueo; «Ver como» entra y sale, y cancelar la salida deja la franja", async ({ page }) => {
  await account(page);
  await openPanel(page);
  await expect(pop(page)).not.toContainText(/Bloquear/i);
  await expect(page.locator('[data-k="lock"], .nx-lock, nx-lock')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await viewAsFirst(page);
  await expect(page.locator("html")).toHaveAttribute("data-nx-view-as", /.+/);
  await expect(page).toHaveTitle(/^\[Ver como\] /);
  // La app cancela la salida (todavía no la confirmó su servidor): la franja sigue.
  await page.evaluate(() =>
    document.querySelector("#acc")!.addEventListener("nx-account-view-as", (e) => (e as CustomEvent).detail.user || e.preventDefault(), { once: true }),
  );
  await openPanel(page);
  await row(page, "viewas").click();
  await expect(page.locator(".nx-viewas")).toBeVisible();
  await expect(page.locator("#acc")).toHaveAttribute("data-view-as", /.+/);
  // Sin cancelar, desde la franja.
  await page.locator(".nx-viewas__exit").click();
  await expect(page.locator(".nx-viewas")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-nx-view-as", /.*/);
  await expect(page).not.toHaveTitle(/\[Ver como\]/);
});

test("con «Ver como» en una ventana baja, el panel no queda debajo de la franja", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 });
  await account(page);
  await viewAsFirst(page);
  await openPanel(page);
  const bar = (await page.locator(".nx-viewas").boundingBox())!;
  const box = (await pop(page).boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1);
  expect(box.y + box.height).toBeLessThanOrEqual(700 + 1);
});

test("la franja sale sin pedir nada a la red; el contorno de reserva tiene contraste en claro y oscuro", async ({ page }) => {
  await account(page);
  // Sin red para todo lo que se pida desde aquí (un despliegue nuevo, o sin conexión): la franja va
  // en la entrada de la cuenta, no en un chunk que Chromium recordaría como fallido.
  await page.route("**/*", (route) => route.abort());
  await page.evaluate(() => ((document.querySelector("#acc") as HTMLElement & { viewAs: unknown }).viewAs = { id: "u7", name: "Laura Restrepo" }));
  await expect(page.locator(".nx-viewas")).toBeVisible();
  await expect(page.locator("#acc")).toHaveAttribute("data-view-as", "u7");
  // Si no hubiera franja, la tarjeta se marca: se simula quitando la marca de <html>.
  await page.evaluate(() => document.documentElement.removeAttribute("data-nx-view-as"));
  const c = card(page);
  // El contorno ámbar, con contraste suficiente (3:1, un indicador) contra el fondo, en claro y oscuro.
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const ratio = await c.evaluate((el) => {
      const s = getComputedStyle(el);
      const parse = (css: string) => {
        const k = document.createElement("canvas").getContext("2d")!;
        k.fillStyle = css;
        k.fillRect(0, 0, 1, 1);
        return [...k.getImageData(0, 0, 1, 1).data].slice(0, 3);
      };
      const lum = ([r, g, b]: number[]) => {
        const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      // El fondo real: el primer ancestro con color de fondo opaco.
      let bg = "rgb(255,255,255)";
      for (let n: Element | null = el; n; n = n.parentElement) {
        const b = getComputedStyle(n).backgroundColor;
        if (b && !/rgba\(.*,\s*0\)$|transparent/.test(b)) {
          bg = b;
          break;
        }
      }
      if (s.outlineStyle !== "solid") return 0;
      const [a, b] = [lum(parse(s.outlineColor)), lum(parse(bg))];
      return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(ratio, `contraste del contorno en ${theme}`).toBeGreaterThanOrEqual(3);
  }
  // La franja sí salió: la tarjeta no lo repite en su texto oculto.
  await expect(c).not.toContainText("Viendo como");
});

test("salir con logout-url: POST con la cookie (SameSite=Lax) y _csrf, aunque la página tenga <base target>", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "sid", value: "abc123", url: baseURL!, sameSite: "Lax" }]);
  const sent: { method: string; body: string | null; cookie: string }[] = [];
  await page.route("**/e2e/salir", async (route) => {
    const r = route.request();
    sent.push({ method: r.method(), body: r.postData(), cookie: (await r.allHeaders()).cookie ?? "" });
    await route.fulfill({ status: 200, contentType: "text/html", body: "<title>Fuera</title><p>Sesión cerrada</p>" });
  });
  await account(page);
  await page.evaluate(() => {
    const acc = document.querySelector("#acc")!;
    acc.setAttribute("logout-url", "/e2e/salir");
    acc.setAttribute("logout-csrf", "t0k");
    document.head.append(Object.assign(document.createElement("base"), { target: "_blank" }));
  });
  let popups = 0;
  page.on("popup", () => popups++);
  await openPanel(page);
  await row(page, "logout").click();
  await page.waitForURL("**/e2e/salir");
  expect(sent).toHaveLength(1);
  expect(sent[0].method).toBe("POST");
  expect(sent[0].body).toBe("_csrf=t0k");
  expect(sent[0].cookie).toContain("sid=abc123");
  expect(popups).toBe(0);
});

test('logout-method="get" navega', async ({ page }) => {
  const methods: string[] = [];
  await page.route("**/e2e/salir", (route) => (methods.push(route.request().method()), route.fulfill({ status: 200, contentType: "text/html", body: "<p>Fuera</p>" })));
  await account(page);
  await page.evaluate(() => {
    const acc = document.querySelector("#acc")!;
    acc.setAttribute("logout-url", "/e2e/salir");
    acc.setAttribute("logout-method", "get");
  });
  await page.evaluate(() => (document.querySelector("#acc") as HTMLElement & { logout(): void }).logout());
  await page.waitForURL("**/e2e/salir");
  expect(methods).toEqual(["GET"]);
});

test("con el panel abierto, la cola que se vacía no rehace el panel (el puntero sigue encima)", async ({ page }) => {
  await account(page);
  await openPanel(page);
  const item = row(page, "item:perfil");
  await item.hover();
  await item.evaluate((el) => (el.dataset.e2e = "mismo"));
  // Dos cambios en la cola de la demo (el «servidor» tarda 4 s por cada uno).
  await page.evaluate(async () => {
    // El mismo módulo que cargó la galería (Vite lo sirve por /@fs/…), no otra copia.
    const url = performance.getEntriesByType("resource").find((e) => /\/sync\/logic\.ts/.test(e.name))!.name;
    const m = await import(url);
    const q = m.syncQueue("nx-sync:demo-cuenta");
    for (const n of [1, 2]) await q.enqueue({ method: "POST", url: "/demo/account/cambios", body: { n }, label: `Cambio ${n}` });
  });
  await expect(page.locator("#acc")).toHaveAttribute("data-sync", "pending");
  await expect(card(page)).toContainText("2 cambios sin sincronizar");
  await expect(page.locator("#acc")).not.toHaveAttribute("data-sync", /.*/, { timeout: 15_000 });
  await expect(pop(page)).toBeVisible();
  expect(await item.evaluate((el) => el.dataset.e2e === "mismo" && el.isConnected && el.matches(":hover"))).toBe(true);
});

test("avatar con una URL rota: iniciales en la tarjeta, el panel y la lista de «Ver como»", async ({ page }) => {
  await page.route("**/e2e/sin-foto*.png", (route) => route.fulfill({ status: 404, body: "" }));
  await page.route("**/e2e/personas*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "u1", name: "Ana Rincón", role: "Cajera", avatar: "/e2e/sin-foto-2.png" }]) }));
  await account(page);
  await page.evaluate(() => {
    const acc = document.querySelector("#acc") as HTMLElement & { user: unknown };
    acc.setAttribute("view-as-source", "/e2e/personas");
    acc.user = { name: "Diego Llinás", email: "diego@crear.co", avatar: "/e2e/sin-foto.png" };
  });
  const av = card(page).locator(".nx-account__av");
  await expect(av).toHaveText("DL");
  await expect(av.locator("img")).toHaveCount(0);
  await openPanel(page);
  await expect(pop(page).locator(".nx-account__av--lg")).toHaveText("DL");
  await row(page, "viewas").click();
  const opt = pop(page).locator(".nx-account__opt").first();
  await expect(opt).toContainText("Ana Rincón");
  await expect(opt.locator(".nx-account__av")).toHaveText("AR");
});
