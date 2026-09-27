// @vitest-environment happy-dom
//
// happy-dom no tiene la Popover API ni View Transitions: el popover se simula con los mismos eventos
// que emite el navegador (`beforetoggle` y `toggle`) y `startViewTransition` con un doble. La pantalla
// de bloqueo y la franja de «Ver como» (módulos de otro agente) y la cola de nx-sync van simuladas.
// El contenido del panel es un módulo aparte (`import()`): las pruebas esperan a que se pinte.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nxLock: vi.fn((_opts: unknown) => Promise.resolve()),
  unbanner: vi.fn(),
  showViewAsBanner: vi.fn(),
  flush: vi.fn(() => Promise.resolve()),
}));
vi.mock("../src/components/account/lock", () => ({ nxLock: mocks.nxLock, isLocked: () => false }));
vi.mock("../src/components/account/view-as", () => ({ showViewAsBanner: mocks.showViewAsBanner }));
vi.mock("../src/components/sync/logic", () => ({ nxSync: { flush: mocks.flush } }));

import "../src/components/account/index";
import "../src/components/command/index";
import { ACCOUNT_LABELS, type NxAccount } from "../src/components/account/index";
import type { NxCommand } from "../src/components/command/index";

beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    fire(this, "closed");
  };
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  mocks.nxLock.mockClear();
  mocks.showViewAsBanner.mockReset();
  mocks.unbanner.mockClear();
  mocks.flush.mockClear();
  document.body.innerHTML = "";
  const d = document.documentElement;
  d.removeAttribute("data-theme");
  d.removeAttribute("data-nx-palette");
  d.lang = "";
  localStorage.clear();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => unknown, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!check()) {
    if (Date.now() - t0 > ms) throw new Error(`no se cumplió: ${check}`);
    await sleep(5);
  }
}
const flushAll = () => sleep(0);

const USER = { name: "Diego Llinás", email: "diego@crear.co" };
const TENANTS = [
  { id: "cc-med", name: "Crear Colombia S.A.S.", detail: "Sede Medellín", role: "Aprobador", group: "Crear Colombia S.A.S." },
  { id: "cc-bog", name: "Crear Colombia S.A.S.", detail: "Sede Bogotá", role: "Consulta", group: "Crear Colombia S.A.S." },
  { id: "nx-cali", name: "nx32 Quality", detail: "Sede Cali", role: "Administrador", group: "nx32 Quality" },
];

function mount(attrs = "", setup?: (el: NxAccount) => void, wrap = (s: string) => s): NxAccount {
  document.body.innerHTML = wrap(`<nx-account ${attrs}></nx-account>`);
  const el = document.querySelector("nx-account")!;
  el.user = USER;
  el.tenants = TENANTS;
  el.current = "cc-med";
  setup?.(el);
  return el;
}
const pop = (el: NxAccount) => el.querySelector<HTMLElement>(".nx-account__pop")!;
const card = (el: NxAccount) => el.querySelector<HTMLButtonElement>(".nx-account__card")!;
const byK = (el: NxAccount, k: string) => [...el.querySelectorAll<HTMLElement>("[data-k]")].find((x) => x.dataset.k === k)!;
const key = (t: EventTarget, k: string, init: KeyboardEventInit = {}) =>
  t.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
async function open(el: NxAccount): Promise<void> {
  el.show();
  await until(() => pop(el).querySelector(".nx-account__head"));
}
async function sub(el: NxAccount, k: string): Promise<void> {
  byK(el, k).click();
  await until(() => pop(el).querySelector(".nx-account__subview"));
}

describe("<nx-account> tarjeta", () => {
  it("avatar con iniciales, nombre y «Empresa · Sede»; es un botón que abre un diálogo", async () => {
    const el = mount();
    await flushAll();
    const c = card(el);
    expect(c.querySelector(".nx-account__av")!.textContent).toBe("DL");
    expect(c.querySelector(".nx-account__name")!.textContent).toBe("Diego Llinás");
    expect(c.querySelector(".nx-account__org")!.textContent).toBe("Crear Colombia S.A.S. · Sede Medellín");
    expect(c.getAttribute("aria-haspopup")).toBe("dialog");
    expect(c.getAttribute("aria-expanded")).toBe("false");
    expect(pop(el).getAttribute("popover")).toBe("auto");
    expect(pop(el).getAttribute("aria-label")).toBe("Cuenta");
  });

  it("el estado y la sincronización también van en texto (oculto) para el lector de pantalla", async () => {
    const el = mount('status="dnd"');
    await flushAll();
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: false, pending: 2 } }));
    await flushAll();
    expect(el.dataset.sync).toBe("offline");
    expect(card(el).querySelector(".nx-account__vh")!.textContent).toBe(" · No molestar Sin conexión 2 cambios sin sincronizar.");
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: true, pending: 2 } }));
    await flushAll();
    expect(el.dataset.sync).toBe("pending");
  });

  it("toma el estado inicial de un <nx-sync> de la página", async () => {
    const fake = document.createElement("nx-sync");
    Object.defineProperty(fake, "state", { value: { online: true, pending: 4 } });
    document.body.append(fake);
    const el = document.createElement("nx-account") as NxAccount;
    el.user = USER;
    document.body.append(el);
    await flushAll();
    expect(el.dataset.sync).toBe("pending");
  });
});

describe("<nx-account> panel", () => {
  it("abre con el foco en el primer ítem, avisa nx-open-change y al cerrar devuelve el foco", async () => {
    const el = mount();
    const seen: boolean[] = [];
    el.addEventListener("nx-open-change", (e) => seen.push(e.detail.open));
    card(el).focus();
    await open(el);
    expect(el.open).toBe(true);
    expect(card(el).getAttribute("aria-expanded")).toBe("true");
    await until(() => document.activeElement === byK(el, "tenant"));
    expect(pop(el).querySelector(".nx-account__big")!.textContent).toBe("Diego Llinás");
    expect(pop(el).querySelector(".nx-account__mail")!.textContent).toBe("diego@crear.co");
    expect(byK(el, "tenant").getAttribute("aria-label")).toBe("Empresa y sede: Crear Colombia S.A.S., Sede Medellín · Aprobador");
    key(document.activeElement!, "Escape");
    expect(el.open).toBe(false);
    expect(document.activeElement).toBe(card(el));
    expect(seen).toEqual([true, false]);
  });

  it("el orden acordado: empresa, estado, tema, color, enlaces, idioma, atajos y cerrar sesión", async () => {
    const el = mount("", (a) => (a.items = [{ id: "perfil", label: "Mi perfil", href: "/perfil" }, { id: "config", label: "Configuración", hint: "Ctrl ," }]));
    await open(el);
    const keys = [...pop(el).querySelectorAll<HTMLElement>("[data-k]")].map((b) => b.dataset.k!.split(":")[0]);
    expect([...new Set(keys)]).toEqual(["tenant", "status", "theme", "palette", "item", "locale", "shortcuts", "logout"]);
    expect(pop(el).querySelector<HTMLAnchorElement>('a[data-k="item:perfil"]')!.getAttribute("href")).toBe("/perfil");
    expect(byK(el, "item:config").textContent).toContain("Ctrl ,");
    expect(byK(el, "locale").textContent).toContain("es-CO");
  });

  it("↑/↓ recorren las filas (un grupo es una parada) y ←/→ se mueven dentro del grupo", async () => {
    const el = mount();
    await open(el);
    await until(() => document.activeElement === byK(el, "tenant"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(byK(el, "status:online"));
    key(document.activeElement!, "ArrowRight");
    expect(document.activeElement).toBe(byK(el, "status:away"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(byK(el, "theme:system"));
    key(document.activeElement!, "End");
    expect(document.activeElement).toBe(byK(el, "logout"));
    key(document.activeElement!, "ArrowDown");
    expect(document.activeElement).toBe(byK(el, "tenant"));
  });

  it("un clic en un enlace sin href avisa nx-account-select y cierra", async () => {
    const el = mount("", (a) => (a.items = [{ id: "config", label: "Configuración" }]));
    const ids: string[] = [];
    el.addEventListener("nx-account-select", (e) => ids.push(e.detail.id));
    await open(el);
    byK(el, "item:config").click();
    expect(ids).toEqual(["config"]);
    expect(el.open).toBe(false);
  });

  it("«Atajos de teclado» muestra <nx-keytips> si hay uno; si no, avisa", async () => {
    const el = mount();
    const ids: string[] = [];
    el.addEventListener("nx-account-select", (e) => ids.push(e.detail.id));
    await open(el);
    byK(el, "shortcuts").click();
    expect(ids).toEqual(["shortcuts"]);
    const kt = document.createElement("nx-keytips") as HTMLElement & { show?: () => void };
    kt.show = vi.fn();
    document.body.append(kt);
    await open(el);
    byK(el, "shortcuts").click();
    expect(kt.show).toHaveBeenCalledOnce();
    expect(el.open).toBe(false);
  });

  it("disabled no abre", async () => {
    const el = mount("disabled");
    await flushAll();
    el.show();
    expect(el.open).toBe(false);
    expect(card(el).disabled).toBe(true);
  });

  it("sacado del DOM con el panel abierto, al volver abre de nuevo (el navegador no avisa el cierre)", async () => {
    const el = mount();
    await open(el);
    el.remove();
    expect(el.open).toBe(false);
    document.body.append(el);
    await open(el);
    expect(el.open).toBe(true);
  });
});

describe("<nx-account> empresa y sede", () => {
  it("sub-vista con encabezado, «Volver», buscador sin tildes y números 1–9; Esc vuelve a la fila", async () => {
    const el = mount();
    await open(el);
    await sub(el, "tenant");
    const view = pop(el);
    expect(view.querySelector("h2")!.textContent).toBe("Empresa y sede");
    expect(document.activeElement).toBe(view.querySelector("input"));
    const rows = () => [...view.querySelectorAll<HTMLElement>(".nx-account__opt")].map((b) => b.querySelector(".nx-account__name")!.textContent);
    expect([...view.querySelectorAll(".nx-account__group")].map((g) => g.textContent)).toEqual(["Crear Colombia S.A.S.", "nx32 Quality"]);
    // Dentro del grupo de su empresa, la sede es el nombre de la fila.
    expect(rows()).toEqual(["Sede Medellín", "Sede Bogotá", "Sede Cali"]);
    expect(view.querySelector('[aria-current="true"] .nx-account__check')).not.toBeNull();
    const input = view.querySelector("input")!;
    input.value = "BOGOTA";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(rows()).toEqual(["Sede Bogotá"]);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    key(input, "Escape");
    await until(() => pop(el).querySelector(".nx-account__head"));
    expect(document.activeElement).toBe(byK(el, "tenant"));
    expect(el.open).toBe(true);
  });

  it("elegir emite nx-account-switch cancelable; sin cancelar pasa a ser la actual y se recuerda", async () => {
    const el = mount();
    const got: string[] = [];
    let cancel = true;
    el.addEventListener("nx-account-switch", (e) => {
      got.push(e.detail.tenant.id);
      if (cancel) e.preventDefault();
    });
    await open(el);
    await sub(el, "tenant");
    key(pop(el).querySelector("input")!, "2");
    expect(got).toEqual(["cc-bog"]);
    expect(el.current).toBe("cc-med");
    expect(el.open).toBe(true);
    cancel = false;
    key(pop(el).querySelector("input")!, "3");
    expect(el.current).toBe("nx-cali");
    expect(el.open).toBe(false);
    expect(JSON.parse(localStorage.getItem("nx-account")!).recent).toEqual(["nx-cali"]);
    expect(el.querySelector('[role="status"]')!.textContent).toBe("Ahora en nx32 Quality · Sede Cali.");
    await flushAll();
    expect(card(el).querySelector(".nx-account__org")!.textContent).toBe("nx32 Quality · Sede Cali");
  });

  it("con texto en el buscador, los números se escriben (no eligen)", async () => {
    const el = mount();
    const got: string[] = [];
    el.addEventListener("nx-account-switch", (e) => got.push(e.detail.tenant.id));
    await open(el);
    await sub(el, "tenant");
    const input = pop(el).querySelector("input")!;
    input.value = "32";
    expect(key(input, "1")).toBe(true);
    expect(got).toEqual([]);
  });
});

describe("<nx-account> estado", () => {
  it("elegir cambia el punto y avisa nx-account-status; «hasta 1 h» vuelve a En línea al cumplirse", async () => {
    const el = mount();
    await open(el);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const got: { status: string; until: number | null }[] = [];
    el.addEventListener("nx-account-status", (e) => got.push(e.detail));
    byK(el, "status:dnd").click();
    expect(el.getAttribute("status")).toBe("dnd");
    expect(got[0]).toEqual({ status: "dnd", until: null });
    await vi.advanceTimersByTimeAsync(0);
    expect(byK(el, "until:").getAttribute("aria-pressed")).toBe("true");
    byK(el, "until:hour").click();
    expect(got[1].until).toBe(Date.now() + 3_600_000);
    vi.advanceTimersByTime(3_600_001);
    expect(el.status).toBe("online");
    expect(got[2]).toEqual({ status: "online", until: null });
  });
});

describe("<nx-account> tema y color", () => {
  it("el tema va a html[data-theme] (Sistema lo quita), se guarda y avisa", async () => {
    const el = mount();
    const got: unknown[] = [];
    el.addEventListener("nx-account-theme", (e) => got.push(e.detail));
    await open(el);
    byK(el, "theme:dark").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(got).toEqual([{ theme: "dark", palette: "indigo" }]);
    expect(JSON.parse(localStorage.getItem("nx-account")!)).toMatchObject({ theme: "dark" });
    expect(byK(el, "theme:dark").getAttribute("aria-pressed")).toBe("true");
    byK(el, "theme:system").click();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("vista previa en vivo al pasar el mouse por una muestra; al salir sin elegir, vuelve", async () => {
    document.documentElement.dataset.nxPalette = "bosque";
    const el = mount();
    await open(el);
    const sw = byK(el, "palette:oceano");
    expect(sw.getAttribute("data-nx-palette")).toBe("oceano");
    expect(byK(el, "palette:bosque").getAttribute("aria-pressed")).toBe("true");
    sw.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(document.documentElement.dataset.nxPalette).toBe("oceano");
    byK(el, "palette:violeta").dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    expect(document.documentElement.dataset.nxPalette).toBe("violeta");
    byK(el, "palette:violeta").dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: byK(el, "logout") }));
    expect(document.documentElement.dataset.nxPalette).toBe("bosque");
    // Con el tacto no hay vista previa (no hay «pasar por encima»).
    sw.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "touch" }));
    expect(document.documentElement.dataset.nxPalette).toBe("bosque");
  });

  it("el foco también muestra la vista previa; cerrar el panel la deshace", async () => {
    const el = mount();
    await open(el);
    byK(el, "palette:terracota").focus();
    expect(document.documentElement.dataset.nxPalette).toBe("terracota");
    el.hide();
    expect(document.documentElement.hasAttribute("data-nx-palette")).toBe(false);
  });

  it("elegir una paleta la fija, la guarda y usa la transición circular desde el clic", async () => {
    const startViewTransition = vi.fn((cb: () => void) => {
      cb();
      const done = Promise.resolve();
      return { ready: done, finished: done, updateCallbackDone: done };
    });
    const animate = vi.fn();
    Object.assign(document, { startViewTransition });
    document.documentElement.animate = animate as never;
    const el = mount();
    const got: unknown[] = [];
    el.addEventListener("nx-account-theme", (e) => got.push(e.detail));
    await open(el);
    const sw = byK(el, "palette:frambuesa");
    sw.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    sw.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1, clientX: 40, clientY: 300 }));
    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.nxPalette).toBe("frambuesa");
    expect(got).toEqual([{ theme: "system", palette: "frambuesa" }]);
    expect(JSON.parse(localStorage.getItem("nx-account")!).palette).toBe("frambuesa");
    await flushAll();
    const [frames, opts] = animate.mock.calls[0] as [{ clipPath: string[] }, { pseudoElement: string }];
    expect(frames.clipPath[0]).toBe("circle(0 at 40px 300px)");
    expect(opts.pseudoElement).toBe("::view-transition-new(root)");
    expect(document.documentElement.hasAttribute("data-nx-reveal")).toBe(false);
    // Al salir ya no hay vista previa que deshacer: queda la elegida.
    sw.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, relatedTarget: byK(el, "logout") }));
    expect(document.documentElement.dataset.nxPalette).toBe("frambuesa");
    delete (document as { startViewTransition?: unknown }).startViewTransition;
  });

  it("con movimiento reducido el cambio es directo, sin View Transitions", async () => {
    const startViewTransition = vi.fn();
    Object.assign(document, { startViewTransition });
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    const el = mount();
    await open(el);
    byK(el, "theme:light").click();
    expect(startViewTransition).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("light");
    delete (document as { startViewTransition?: unknown }).startViewTransition;
  });

  it("lo guardado se aplica al conectar; `palettes` limita y ordena las muestras", async () => {
    localStorage.setItem("mi-app", JSON.stringify({ theme: "dark", palette: "grafito" }));
    const el = mount('storage="mi-app"', (a) => (a.palettes = ["grafito", { id: "marca", label: "Marca", color: "#e30613" }] as never));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.nxPalette).toBe("grafito");
    await open(el);
    const sws = [...pop(el).querySelectorAll<HTMLElement>(".nx-account__sw")];
    expect(sws.map((s) => s.getAttribute("aria-label"))).toEqual(["Grafito", "Marca"]);
    expect(sws[1].getAttribute("style")).toBe("--_sw:#e30613");
    expect(sws[1].hasAttribute("data-nx-palette")).toBe(false);
  });

  it("con localStorage roto (bloqueado o lleno) todo sigue funcionando", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const el = mount();
    await open(el);
    byK(el, "theme:dark").click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await sub(el, "tenant");
    key(pop(el).querySelector("input")!, "2");
    expect(el.current).toBe("cc-bog");
  });

  it('storage="none" no guarda nada', async () => {
    const el = mount('storage="none"');
    await open(el);
    byK(el, "theme:dark").click();
    expect(localStorage.length).toBe(0);
  });
});

describe("<nx-account> idioma y formatos", () => {
  it("cada locale con su vista previa; elegir pone <html lang> y avisa", async () => {
    document.documentElement.lang = "es-CO";
    const el = mount();
    const got: string[] = [];
    el.addEventListener("nx-account-locale", (e) => got.push(e.detail.locale));
    await open(el);
    await sub(el, "locale");
    const opts = [...pop(el).querySelectorAll<HTMLElement>(".nx-account__opt")];
    expect(opts.map((o) => o.querySelector(".nx-account__name")!.textContent)).toEqual(["Español (Colombia)", "Español (México)", "English (United States)", "Português (Brasil)"]);
    expect(opts[0].querySelector(".nx-account__org")!.textContent).toMatch(/^1\.234\.567,50 · /);
    expect(opts[2].querySelector(".nx-account__org")!.textContent).toMatch(/^1,234,567\.50 · [A-Z][a-z]{2} \d+, \d{4}$/);
    expect(opts[0].getAttribute("aria-current")).toBe("true");
    expect(document.activeElement).toBe(opts[0]);
    opts[2].click();
    expect(document.documentElement.lang).toBe("en-US");
    expect(got).toEqual(["en-US"]);
    await until(() => pop(el).querySelector(".nx-account__head"));
    expect(byK(el, "locale").textContent).toContain("en-US");
    expect(document.activeElement).toBe(byK(el, "locale"));
  });

  it('apply-locale="false": solo el evento, la app decide', async () => {
    document.documentElement.lang = "es-CO";
    const el = mount('apply-locale="false"', (a) => (a.locales = [{ value: "pt-BR", label: "Português" }]));
    const got: string[] = [];
    el.addEventListener("nx-account-locale", (e) => got.push(e.detail.locale));
    await open(el);
    await sub(el, "locale");
    key(pop(el).querySelector(".nx-account__opt")!, "1");
    expect(got).toEqual(["pt-BR"]);
    expect(document.documentElement.lang).toBe("es-CO");
  });
});

describe("<nx-account> cerrar sesión", () => {
  it("sin pendientes sale directo, sin preguntar; logout-url del mismo origen navega", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const el = mount('logout-url="/salir"');
    const got: unknown[] = [];
    el.addEventListener("nx-account-logout", (e) => got.push(e.detail));
    await open(el);
    byK(el, "logout").click();
    expect(got).toEqual([{ pending: 0 }]);
    expect(el.open).toBe(false);
    expect(assign).toHaveBeenCalledWith(`${location.origin}/salir`);
  });

  it("cancelable: con preventDefault no navega; un logout-url de otro origen se ignora", async () => {
    const assign = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('logout-url="https://evil.example/salir"');
    el.logout();
    expect(assign).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    el.setAttribute("logout-url", "/salir");
    el.addEventListener("nx-account-logout", (e) => e.preventDefault());
    el.logout();
    expect(assign).not.toHaveBeenCalled();
    el.setAttribute("logout-url", "javascript:alert(1)");
    el.logout();
    expect(assign).not.toHaveBeenCalled();
  });

  it("con cambios en cola: franja ámbar, se envían y sale cuando la cola se vacía", async () => {
    const el = mount();
    const got: unknown[] = [];
    el.addEventListener("nx-account-logout", (e) => got.push(e.detail));
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: true, pending: 3 } }));
    await open(el);
    byK(el, "logout").click();
    expect(got).toEqual([]);
    expect(pop(el).querySelector(".nx-account__leaving p")!.textContent).toBe("3 cambios sin sincronizar. Se envían antes de salir.");
    expect(el.querySelector('[role="status"]')!.textContent).toBe("3 cambios sin sincronizar. Se envían antes de salir.");
    await until(() => mocks.flush.mock.calls.length);
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: true, pending: 1 } }));
    expect(got).toEqual([]);
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: true, pending: 0 } }));
    expect(got).toEqual([{ pending: 0 }]);
    expect(el.open).toBe(false);
  });

  it("con tope: a los 10 s lo dice, y «Salir de todos modos» sale con lo pendiente", async () => {
    const el = mount();
    await open(el);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const got: unknown[] = [];
    el.addEventListener("nx-account-logout", (e) => got.push(e.detail));
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: false, pending: 3 } }));
    el.logout();
    vi.advanceTimersByTime(10_000);
    const strip = pop(el).querySelector(".nx-account__leaving")!;
    expect(strip.hasAttribute("data-stuck")).toBe(true);
    expect(strip.textContent).toContain("quedan guardados en este equipo");
    expect(got).toEqual([]);
    byK(el, "anyway").click();
    expect(got).toEqual([{ pending: 3 }]);
  });

  it("usa la cola que se le pasa en `sync` (subscribe y flush)", async () => {
    let listener: (s: { online: boolean; pending: number }) => void = () => {};
    const queue = { subscribe: vi.fn((fn: typeof listener) => ((listener = fn), fn({ online: true, pending: 2 }), () => {})), flush: vi.fn(() => Promise.resolve()) };
    const el = mount("", (a) => (a.sync = queue));
    const got: unknown[] = [];
    el.addEventListener("nx-account-logout", (e) => got.push(e.detail));
    await flushAll();
    expect(el.dataset.sync).toBe("pending");
    el.logout();
    expect(queue.flush).toHaveBeenCalledOnce();
    expect(mocks.flush).not.toHaveBeenCalled();
    listener({ online: true, pending: 0 });
    expect(got).toEqual([{ pending: 0 }]);
  });
});

describe("<nx-account> vencimiento de sesión", () => {
  it("antes del aviso, un solo setTimeout; en el aviso, cuenta regresiva con «Extender» y un anuncio", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-26T10:00:00Z"), toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const el = mount('expires-at="2026-09-26T10:10:00Z"');
    await vi.advanceTimersByTimeAsync(0);
    const strip = el.querySelector<HTMLElement>(".nx-account__session")!;
    expect(strip.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1_500);
    expect(strip.hidden).toBe(false);
    expect(el.dataset.session).toBe("warn");
    expect(strip.textContent).toMatch(/^Tu sesión vence en 4:5\dExtender$/);
    const live = el.querySelector('[role="status"]')!;
    expect(live.textContent).toBe("Tu sesión vence en 5 min. Puedes extenderla.");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(strip.querySelector(".nx-account__time")!.textContent).toMatch(/^3:5\d$/);
    // No se anuncia cada segundo.
    expect(live.textContent).toBe("Tu sesión vence en 5 min. Puedes extenderla.");
  });

  it("«Extender» hace POST a extendEndpoint y toma el nuevo vencimiento", async () => {
    const later = Date.now() + 3_600_000;
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ expiresAt: later }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount("", (a) => (a.session = { expiresAt: Date.now() + 60_000, extendEndpoint: "/api/sesion/extender" }));
    await flushAll();
    const got: unknown[] = [];
    el.addEventListener("nx-account-extend", (e) => got.push(e.detail));
    el.querySelector<HTMLElement>('.nx-account__session [data-k="extend"]')!.click();
    await until(() => el.session?.expiresAt === later);
    expect(fetchMock).toHaveBeenCalledWith("/api/sesion/extender", expect.objectContaining({ method: "POST" }));
    expect(got).toHaveLength(1);
    await flushAll();
    expect(el.querySelector<HTMLElement>(".nx-account__session")!.hidden).toBe(true);
    expect(el.hasAttribute("data-session")).toBe(false);
  });

  it("sin endpoint (o cancelando nx-account-extend) la app lo hace y asigna `session`", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const el = mount("", (a) => (a.session = { expiresAt: Date.now() + 60_000, extendEndpoint: "/api/x" }));
    await flushAll();
    el.addEventListener("nx-account-extend", (e) => {
      e.preventDefault();
      el.session = { expiresAt: Date.now() + 3_600_000 };
    });
    el.querySelector<HTMLElement>('[data-k="extend"]')!.click();
    expect(fetchMock).not.toHaveBeenCalled();
    await flushAll();
    expect(el.querySelector<HTMLElement>(".nx-account__session")!.hidden).toBe(true);
  });

  it("al vencer avisa nx-account-expired una sola vez", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const el = mount('warn-before="1"', (a) => (a.session = { expiresAt: Date.now() + 90_000 }));
    let n = 0;
    el.addEventListener("nx-account-expired", () => n++);
    await vi.advanceTimersByTimeAsync(95_000);
    expect(n).toBe(1);
    expect(el.dataset.session).toBe("expired");
    expect(el.querySelector(".nx-account__session")!.textContent).toBe("Tu sesión venció.");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(n).toBe(1);
  });
});

describe("<nx-account> ver como", () => {
  it("sub-vista que busca personas en el servidor; elegir es cancelable y muestra la franja", async () => {
    const PEOPLE = [
      { id: "u7", name: "Ana María Rincón", role: "Cajera · Medellín" },
      { id: "u9", name: "Héctor Galeano", role: "Bodega · Bogotá" },
    ];
    const fetchMock = vi.fn(async (url: URL) => new Response(JSON.stringify(url.searchParams.get("q") ? PEOPLE.slice(1) : PEOPLE), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    mocks.showViewAsBanner.mockReturnValue(mocks.unbanner);
    const el = mount('view-as-source="/api/personas"');
    const got: unknown[] = [];
    let cancel = true;
    el.addEventListener("nx-account-view-as", (e) => {
      got.push(e.detail.user?.id ?? null);
      if (cancel) e.preventDefault();
    });
    await open(el);
    await sub(el, "viewas");
    await until(() => pop(el).querySelectorAll(".nx-account__opt").length === 2);
    expect(pop(el).querySelector(".nx-account__opt .nx-account__av")!.textContent).toBe("AM");
    const input = pop(el).querySelector("input")!;
    input.value = "hector";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await until(() => pop(el).querySelectorAll(".nx-account__opt").length === 1);
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain("q=hector");
    pop(el).querySelector<HTMLElement>(".nx-account__opt")!.click();
    expect(got).toEqual(["u9"]);
    expect(el.viewAs).toBeNull();
    cancel = false;
    pop(el).querySelector<HTMLElement>(".nx-account__opt")!.click();
    expect(el.viewAs?.id).toBe("u9");
    await until(() => mocks.showViewAsBanner.mock.calls.length);
    expect(mocks.showViewAsBanner.mock.calls[0][0]).toMatchObject({ id: "u9", name: "Héctor Galeano" });
    // Salir desde la franja.
    (mocks.showViewAsBanner.mock.calls[0][1] as { onExit: () => void }).onExit();
    expect(got.at(-1)).toBeNull();
    expect(el.viewAs).toBeNull();
    expect(mocks.unbanner).toHaveBeenCalled();
  });

  it("view-as-source de otro origen no se pide; el atributo view-as muestra la franja al conectar", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.showViewAsBanner.mockReturnValue(mocks.unbanner);
    const el = mount(`view-as-source="https://otro.example/p" view-as='{"id":"u7","name":"Ana"}'`);
    await until(() => mocks.showViewAsBanner.mock.calls.length);
    await open(el);
    expect(byK(el, "viewas").textContent).toBe("Dejar de ver como Ana");
    byK(el, "viewas").click();
    expect(el.viewAs).toBeNull();
    el.viewAs = null;
    await open(el);
    await sub(el, "viewas");
    await until(() => pop(el).querySelector(".nx-account__empty")?.textContent === "No se pudo buscar");
    expect(fetchMock).not.toHaveBeenCalled();
    el.remove();
  });
});

describe("<nx-account> bloquear", () => {
  it("sin `lock` no hay fila ni atajo", async () => {
    const el = mount();
    await open(el);
    expect(byK(el, "lock")).toBeUndefined();
    expect(key(document.body, "l", { ctrlKey: true })).toBe(true);
    expect(mocks.nxLock).not.toHaveBeenCalled();
  });

  it("la fila y Ctrl+L llaman nxLock (perezoso) con el usuario y el endpoint", async () => {
    const el = mount('lock-endpoint="/api/desbloquear"');
    await open(el);
    expect(byK(el, "lock").textContent).toMatch(/Bloquear pantalla(Ctrl|⌘) L/);
    byK(el, "lock").click();
    await until(() => mocks.nxLock.mock.calls.length === 1);
    expect(mocks.nxLock.mock.calls[0][0]).toMatchObject({ user: USER, endpoint: "/api/desbloquear", locale: "es-CO" });
    await flushAll();
    expect(key(document.body, "l", { ctrlKey: true })).toBe(false);
    await until(() => mocks.nxLock.mock.calls.length === 2);
  });

  it("lock-after bloquea tras la inactividad; la actividad lo aplaza", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    mount('lock lock-after="2"');
    await vi.advanceTimersByTimeAsync(90_000);
    document.dispatchEvent(new PointerEvent("pointermove"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.nxLock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(61_000);
    await vi.waitFor(() => expect(mocks.nxLock).toHaveBeenCalledOnce());
  });
});

describe("<nx-account> en el menú lateral", () => {
  it("en compacto el panel se abre a la derecha del riel; el nombre sigue en el árbol accesible", async () => {
    const el = mount("", undefined, (s) => `<nx-sidemenu collapsed><div slot="footer">${s}</div></nx-sidemenu>`);
    const rail = document.querySelector("nx-sidemenu")!;
    const root = document.documentElement;
    Object.defineProperty(root, "clientWidth", { configurable: true, value: 1280 });
    Object.defineProperty(root, "clientHeight", { configurable: true, value: 800 });
    rail.getBoundingClientRect = () => ({ left: 0, right: 56, top: 0, bottom: 800, width: 56, height: 800 }) as DOMRect;
    card(el).getBoundingClientRect = () => ({ left: 8, right: 48, top: 740, bottom: 780, width: 40, height: 40 }) as DOMRect;
    await open(el);
    await until(() => pop(el).style.left);
    expect(pop(el).style.left).toBe("64px");
    expect(pop(el).style.bottom).not.toBe("");
    expect(card(el).querySelector(".nx-account__name")!.textContent).toBe("Diego Llinás");
    // Un clic dentro de la cuenta no lo toma el menú como una hoja.
    const sel = vi.fn();
    rail.addEventListener("nx-select", sel);
    byK(el, "theme:dark").click();
    expect(sel).not.toHaveBeenCalled();
    delete (root as { clientWidth?: number }).clientWidth;
    delete (root as { clientHeight?: number }).clientHeight;
  });
});

describe("<nx-account> limpieza, textos y locale", () => {
  it("al sacarlo de la página no quedan temporizadores ni oídos", async () => {
    const el = mount('lock lock-after="5"', (a) => (a.session = { expiresAt: Date.now() + 3_600_000 }));
    await open(el);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    el.status = "dnd";
    el.remove();
    // Nuevos temporizadores tras quitarlo: ninguno (y los viejos, cancelados).
    el.session = { expiresAt: Date.now() + 60_000 };
    expect(vi.getTimerCount()).toBe(0);
    expect(key(document.body, "l", { ctrlKey: true })).toBe(true);
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: false, pending: 9 } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.dataset.sync).toBeUndefined();
    expect(mocks.nxLock).not.toHaveBeenCalled();
  });

  it("labels reemplaza textos (y los desconocidos se ignoran); locale formatea los números", async () => {
    const el = mount(`locale="en-US" labels='{"logout":"Salir","pendingMany":"{n} por enviar.","nope":1}'`);
    document.dispatchEvent(new CustomEvent("nx-sync-change", { detail: { online: true, pending: 1250 } }));
    await open(el);
    expect(byK(el, "logout").textContent).toBe("Salir");
    expect(el.labels.account).toBe(ACCOUNT_LABELS.account);
    expect(card(el).querySelector(".nx-account__vh")!.textContent).toBe(" · 1,250 por enviar.");
  });

  it("un atributo JSON inválido no rompe nada", async () => {
    document.body.innerHTML = `<nx-account user='{roto' tenants='[1,2'></nx-account>`;
    const el = document.querySelector("nx-account")!;
    await flushAll();
    expect(el.user).toBeNull();
    expect(el.tenants).toEqual([]);
    expect(card(el).querySelector(".nx-account__name")!.textContent).toBe("Cuenta");
  });
});

describe('<nx-command account="id">', () => {
  it("las acciones de la cuenta entran en la paleta y elegir una la ejecuta la cuenta", async () => {
    document.body.innerHTML = `<nx-account id="yo"></nx-account><nx-command account="yo" storage="none"></nx-command>`;
    const acc = document.querySelector<NxAccount>("#yo")!;
    acc.user = USER;
    acc.tenants = TENANTS;
    acc.current = "cc-med";
    const cmd = document.querySelector<NxCommand>("nx-command")!;
    cmd.show("oscuro");
    const opt = [...cmd.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes("Tema: Oscuro"))!;
    expect(opt).toBeDefined();
    opt.click();
    expect(document.documentElement.dataset.theme).toBe("dark");
    cmd.show("bogota");
    const tenant = [...cmd.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent?.includes("Sede Bogotá"))!;
    tenant.click();
    expect(acc.current).toBe("cc-bog");
  });

  it("si la app cancela nx-command-select, la cuenta no hace nada", async () => {
    document.body.innerHTML = `<nx-account id="yo"></nx-account><nx-command account="yo" storage="none"></nx-command>`;
    const cmd = document.querySelector<NxCommand>("nx-command")!;
    cmd.addEventListener("nx-command-select", (e) => e.preventDefault());
    cmd.show("oscuro");
    cmd.querySelector<HTMLElement>('[role="option"]')!.click();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
