// @vitest-environment happy-dom
//
// `nxLock()`: tapa la app sin tocarla, pide la clave y solo se quita con una verificación buena. La
// clave no queda en el DOM, Escape no cierra, la espera crece tras 5 fallos y el bloqueo sobrevive a
// una recarga (`lockedOnLoad`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOCK_KEY, type LockOptions, isLocked, lockWait, lockedOnLoad, nxLock } from "../src/components/account/lock";

const flush = async (n = 4) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};
const tick = () => new Promise((r) => setTimeout(r, 0));
const dlg = () => document.querySelector<HTMLDialogElement>("dialog.nx-lock");
const input = () => dlg()!.querySelector<HTMLInputElement>("input[type=password]")!;
const msg = () => dlg()!.querySelector(".nx-lock__msg")!.textContent;
const unlockBtn = () => dlg()!.querySelector<HTMLButtonElement>(".nx-lock__unlock")!;
const logoutBtn = () => dlg()!.querySelector<HTMLButtonElement>(".nx-lock__logout")!;
/** Escribe la clave y la envía como lo hace Enter en el campo. */
const enter = (pw: string) => {
  input().value = pw;
  dlg()!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
};
/** Todas las pruebas pueden salir con «Cerrar sesión» (una promesa: la app ya cambió su vista). */
const lock = (o: Partial<LockOptions> = {}) => nxLock({ user: { name: "Laura Gómez", email: "laura@bodega.co" }, onLogout: () => Promise.resolve(), ...o });

beforeEach(() => {
  document.body.innerHTML = '<main><form id="app"><input id="qty" value="123 cajas"><button id="save" type="button">Guardar</button></form></main>';
});
afterEach(async () => {
  vi.useRealTimers();
  if (isLocked()) {
    dlg()?.querySelector<HTMLButtonElement>(".nx-lock__logout")?.click();
    await flush();
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("nxLock(): pantalla", () => {
  it("abre un modal nativo al final de body, con el foco en la clave", async () => {
    const spy = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    void lock({ verify: async () => true });
    expect(spy).toHaveBeenCalledOnce();
    expect(dlg()!.open).toBe(true);
    expect(document.body.lastElementChild).toBe(dlg());
    expect(document.activeElement).toBe(input());
    expect(input().getAttribute("autocomplete")).toBe("current-password");
    expect(input().name).toBe("password");
    expect(dlg()!.getAttribute("aria-label")).toBe("Pantalla bloqueada");
    expect(dlg()!.textContent).toContain("Laura Gómez");
    expect(dlg()!.textContent).toContain("laura@bodega.co");
    expect(dlg()!.querySelector(".nx-lock__since")!.textContent).toMatch(/^Pantalla bloqueada · desde las \d{1,2}:\d{2}/);
    expect(dlg()!.querySelector(".nx-lock__avatar")!.textContent).toBe("LG");
    expect(document.documentElement.hasAttribute("data-nx-locked")).toBe(true);
    expect(isLocked()).toBe(true);
  });

  it("sin showModal: `inert` en el resto de body, y al salir restaura exactamente lo que había", async () => {
    vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(() => {
      throw new TypeError("sin showModal");
    });
    const own = document.createElement("aside");
    own.setAttribute("inert", "");
    document.body.append(own);
    const main = document.querySelector("main")!;
    void lock({ verify: async (pw) => pw === "bien" });
    expect(dlg()!.hasAttribute("open")).toBe(true);
    expect(main.hasAttribute("inert")).toBe(true);
    expect(dlg()!.hasAttribute("inert")).toBe(false);
    // Lo que la app agrega mientras tanto también queda inerte.
    const late = document.createElement("div");
    document.body.append(late);
    await tick();
    expect(late.hasAttribute("inert")).toBe(true);
    enter("bien");
    await flush();
    expect(dlg()).toBeNull();
    expect(main.hasAttribute("inert")).toBe(false);
    expect(late.hasAttribute("inert")).toBe(false);
    expect(own.hasAttribute("inert")).toBe(true);
  });

  it("Escape no cierra: `cancel` cancelado, la tecla no sigue, y un close() lo vuelve a abrir", async () => {
    void lock({ verify: async () => true });
    const cancel = new Event("cancel", { cancelable: true });
    dlg()!.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input().dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    dlg()!.close();
    await flush();
    expect(dlg()!.open).toBe(true);
    expect(isLocked()).toBe(true);
  });

  it("las teclas no llegan a los atajos de la app (ni desde el diálogo ni desde fuera)", async () => {
    const onDoc = vi.fn();
    document.addEventListener("keydown", onDoc);
    void lock({ verify: async () => true });
    input().dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
    expect(onDoc).not.toHaveBeenCalled();
    document.removeEventListener("keydown", onDoc);
  });

  it("si la app vacía body, el bloqueo vuelve", async () => {
    void lock({ verify: async () => true });
    document.body.replaceChildren();
    await tick();
    expect(dlg()?.open).toBe(true);
  });

  it("un solo bloqueo a la vez: la misma promesa", () => {
    const a = lock({ verify: async () => true });
    const b = lock({ verify: async () => false });
    expect(b).toBe(a);
    expect(document.querySelectorAll("dialog.nx-lock")).toHaveLength(1);
  });

  it("textos, locale y avatar: imagen segura, o iniciales si el esquema no lo es", () => {
    void lock({ verify: async () => true, locale: "en-US", labels: { unlock: "Unlock", password: "Password", locked: "Locked since {time}" }, user: { name: "Ana", avatar: "https://cdn.example/a.png" } });
    expect(unlockBtn().textContent).toBe("Unlock");
    expect(dlg()!.querySelector("label")!.textContent).toBe("Password");
    expect(dlg()!.querySelector(".nx-lock__since")!.textContent).toMatch(/^Locked since \d{1,2}:\d{2}\s?[AP]M$/);
    const img = dlg()!.querySelector("img")!;
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("un avatar `javascript:` no se pinta: iniciales (o las que manda la app)", () => {
    void lock({ verify: async () => true, user: { name: "Laura Gómez", avatar: "javascript:alert(1)", initials: "LA" } });
    expect(dlg()!.querySelector("img")).toBeNull();
    expect(dlg()!.querySelector(".nx-lock__avatar")!.textContent).toBe("LA");
  });
});

describe("nxLock(): verificar", () => {
  it("verify bien: desbloquea, quita el diálogo y resuelve", async () => {
    const verify = vi.fn(async (pw: string) => pw === "s3creta");
    const p = lock({ verify });
    enter("s3creta");
    await p;
    expect(verify).toHaveBeenCalledWith("s3creta");
    expect(dlg()).toBeNull();
    expect(isLocked()).toBe(false);
    expect(document.documentElement.hasAttribute("data-nx-locked")).toBe(false);
  });

  it("verify mal: aviso, campo vacío y marcado, sigue bloqueada", async () => {
    void lock({ verify: async () => false });
    enter("mala");
    await flush();
    expect(msg()).toBe("Contraseña incorrecta.");
    expect(dlg()!.querySelector(".nx-lock__msg")!.getAttribute("role")).toBe("alert");
    expect(input().value).toBe("");
    expect(input().getAttribute("aria-invalid")).toBe("true");
    expect(input().classList.contains("is-wrong")).toBe(true);
    expect(document.activeElement).toBe(input());
    expect(isLocked()).toBe(true);
  });

  it("verify que no devuelve exactamente `true` no desbloquea", async () => {
    void lock({ verify: async () => "sí" as unknown as boolean });
    enter("x");
    await flush();
    expect(isLocked()).toBe(true);
  });

  it("endpoint 200: POST {password} del mismo origen, con cookie y sin seguir redirecciones", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const p = lock({ endpoint: "/api/unlock" });
    enter("s3creta");
    await p;
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/unlock");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.redirect).toBe("error");
    expect(JSON.parse(init.body as string)).toEqual({ password: "s3creta" });
    expect(isLocked()).toBe(false);
  });

  it("endpoint 401 y 403: clave incorrecta", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    void lock({ endpoint: "/api/unlock" });
    enter("mala");
    await tick();
    expect(msg()).toBe("Contraseña incorrecta.");
    fetch.mockImplementation(async () => new Response(null, { status: 403 }));
    enter("otra");
    await tick();
    expect(msg()).toBe("Contraseña incorrecta.");
    expect(isLocked()).toBe(true);
  });

  it("endpoint 500 o red caída: «No se pudo verificar», y no cuenta como intento", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    void lock({ endpoint: "/api/unlock" });
    for (let i = 0; i < 6; i++) {
      enter(`x${i}`);
      await tick();
    }
    expect(msg()).toBe("No se pudo verificar. Intenta de nuevo.");
    expect(sessionStorage.getItem(LOCK_KEY)!.split(":")[0]).toBe("0");
    fetch.mockImplementation(async () => {
      throw new TypeError("Failed to fetch");
    });
    enter("y");
    await tick();
    expect(msg()).toBe("No se pudo verificar. Intenta de nuevo.");
    expect(unlockBtn().getAttribute("aria-disabled")).toBe("false");
    expect(isLocked()).toBe(true);
  });

  it("sin endpoint ni verify (o con uno de otro origen): no se puede desbloquear, solo cerrar sesión", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    void lock({ endpoint: "https://otro.example/unlock" });
    expect(warn).toHaveBeenCalled();
    expect(input().disabled).toBe(true);
    expect(dlg()!.querySelector(".nx-lock__unlock")).toBeNull();
    expect(msg()).toContain("Cierra sesión");
    expect(document.activeElement).toBe(logoutBtn());
    enter("x");
    await tick();
    expect(fetch).not.toHaveBeenCalled();
    expect(isLocked()).toBe(true);
  });

  it("doble Enter: una sola petición, con el botón ocupado mientras tanto", async () => {
    let answer!: (r: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((r) => (answer = r)));
    vi.stubGlobal("fetch", fetch);
    const p = lock({ endpoint: "/api/unlock" });
    enter("s3creta");
    enter("s3creta");
    expect(fetch).toHaveBeenCalledOnce();
    expect(unlockBtn().getAttribute("aria-disabled")).toBe("true");
    expect(unlockBtn().hasAttribute("aria-busy")).toBe(true);
    expect(input().readOnly).toBe(true);
    answer(new Response(null, { status: 200 }));
    await p;
    expect(isLocked()).toBe(false);
  });

  it("tras 5 fallos, espera creciente con cuenta visible (30 s, luego 60 s)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const verify = vi.fn(async () => false);
    void lock({ verify });
    for (let i = 0; i < 5; i++) {
      enter(`mala${i}`);
      await flush();
    }
    expect(msg()).toContain("Espera 30 s");
    expect(unlockBtn().textContent).toBe("Desbloquear · 0:30");
    expect(unlockBtn().getAttribute("aria-disabled")).toBe("true");
    expect(input().readOnly).toBe(true);
    enter("otra");
    await flush();
    expect(verify).toHaveBeenCalledTimes(5);
    vi.advanceTimersByTime(10_000);
    expect(unlockBtn().textContent).toBe("Desbloquear · 0:20");
    vi.advanceTimersByTime(20_000);
    expect(unlockBtn().textContent).toBe("Desbloquear");
    expect(msg()).toBe("");
    expect(input().readOnly).toBe(false);
    enter("sexta");
    await flush();
    expect(verify).toHaveBeenCalledTimes(6);
    expect(unlockBtn().textContent).toBe("Desbloquear · 1:00");
    expect(lockWait(4)).toBe(0);
    expect(lockWait(7)).toBe(120_000);
    expect(lockWait(20)).toBe(900_000);
  });

  it("la clave nunca queda en el DOM ni en sessionStorage", async () => {
    let answer!: (ok: boolean) => void;
    const p = lock({ verify: () => new Promise<boolean>((r) => (answer = r)) });
    enter("Sup3r-secreta");
    // En vuelo: el campo ya se vació.
    expect(input().value).toBe("");
    expect(document.documentElement.outerHTML).not.toContain("Sup3r-secreta");
    for (const el of dlg()!.querySelectorAll("*")) for (const a of el.attributes) expect(a.value).not.toContain("Sup3r-secreta");
    expect(JSON.stringify({ ...sessionStorage })).not.toContain("Sup3r-secreta");
    answer(true);
    await p;
    expect(document.documentElement.outerHTML).not.toContain("Sup3r-secreta");
    expect(document.querySelector(".nx-lock")).toBeNull();
  });
});

describe("nxLock(): alrededor", () => {
  it("«Cerrar sesión» llama onLogout una vez; con una promesa, la pantalla se quita al cumplirse", async () => {
    let done!: () => void;
    const onLogout = vi.fn(() => new Promise<void>((r) => (done = r)));
    const p = lock({ verify: async () => false, onLogout });
    logoutBtn().click();
    logoutBtn().click();
    expect(onLogout).toHaveBeenCalledOnce();
    expect(lockedOnLoad()).toBe(false);
    expect(isLocked()).toBe(true);
    done();
    await p;
    expect(dlg()).toBeNull();
  });

  it("onLogout que navega (sin promesa): la pantalla sigue tapando; si la página sigue ahí, se puede reintentar", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const onLogout = vi.fn();
    const p = lock({ verify: async () => true, onLogout });
    logoutBtn().click();
    await flush();
    expect(onLogout).toHaveBeenCalledOnce();
    expect(isLocked()).toBe(true);
    expect(logoutBtn().getAttribute("aria-disabled")).toBe("true");
    // Saliendo, la clave no se acepta.
    enter("x");
    await flush();
    expect(isLocked()).toBe(true);
    vi.advanceTimersByTime(10_000);
    expect(logoutBtn().hasAttribute("aria-disabled")).toBe(false);
    expect(lockedOnLoad()).toBe(true);
    enter("x");
    await p;
    expect(isLocked()).toBe(false);
  });

  it("onLogout que lanza: sigue bloqueada y se puede reintentar", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onLogout = vi.fn(() => {
      throw new Error("sin red");
    });
    void lock({ verify: async () => true, onLogout });
    logoutBtn().click();
    logoutBtn().click();
    expect(onLogout).toHaveBeenCalledTimes(2);
    expect(isLocked()).toBe(true);
    expect(lockedOnLoad()).toBe(true);
    enter("x");
    await flush();
    expect(isLocked()).toBe(false);
  });

  it("isLocked, nx-lock-change y lockedOnLoad siguen el estado", async () => {
    const seen: boolean[] = [];
    const on = (e: Event) => seen.push((e as CustomEvent<{ locked: boolean }>).detail.locked);
    document.addEventListener("nx-lock-change", on);
    expect(isLocked()).toBe(false);
    expect(lockedOnLoad()).toBe(false);
    const p = lock({ verify: async () => true });
    expect(isLocked()).toBe(true);
    expect(lockedOnLoad()).toBe(true);
    enter("x");
    await p;
    expect(isLocked()).toBe(false);
    expect(lockedOnLoad()).toBe(false);
    expect(seen).toEqual([true, false]);
    document.removeEventListener("nx-lock-change", on);
  });

  it("tras recargar sigue la espera guardada", () => {
    sessionStorage.setItem(LOCK_KEY, `5:${Date.now() + 30_000}`);
    expect(lockedOnLoad()).toBe(true);
    void lock({ verify: async () => true });
    expect(msg()).toContain("Espera");
    expect(input().readOnly).toBe(true);
  });

  it("con sessionStorage roto no lanza: lockedOnLoad es false y el bloqueo funciona", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("bloqueado", "SecurityError");
    });
    expect(lockedOnLoad()).toBe(false);
    const p = lock({ verify: async () => true });
    expect(isLocked()).toBe(true);
    enter("x");
    await p;
    expect(isLocked()).toBe(false);
  });

  it("el foco vuelve a donde estaba y el formulario de la app queda intacto", async () => {
    const qty = document.querySelector<HTMLInputElement>("#qty")!;
    qty.value = "124 cajas";
    const save = document.querySelector<HTMLButtonElement>("#save")!;
    save.focus();
    const p = lock({ verify: async () => true });
    expect(document.activeElement).toBe(input());
    enter("x");
    await p;
    expect(document.activeElement).toBe(save);
    expect(qty.value).toBe("124 cajas");
    expect(qty.disabled).toBe(false);
    expect(document.querySelector("main")!.hasAttribute("inert")).toBe(false);
  });
});
