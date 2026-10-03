// @vitest-environment happy-dom
//
// La franja de «Ver como» es un módulo aparte (`import()`). Si su chunk no carga (sin red, un
// despliegue nuevo que borró el viejo), la cuenta reintenta con espera creciente (1 s, 2 s… hasta
// 30 s) y, al desconectarse, no deja ningún temporizador. Aquí el primer `import()` falla.
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loads: 0, unbanner: vi.fn(), showViewAsBanner: vi.fn() }));
vi.mock("../src/components/account/view-as", () => {
  mocks.loads++;
  if (mocks.loads === 1) throw new Error("chunk no disponible");
  return { showViewAsBanner: mocks.showViewAsBanner };
});

import "../src/components/account/index";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("<nx-account> reintento de la franja", () => {
  it("si el import() falla, reintenta a 1 s, pone la franja una vez y no deja temporizadores", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    mocks.showViewAsBanner.mockReturnValue(mocks.unbanner);
    document.body.innerHTML = `<nx-account user='{"name":"Ana"}' view-as='{"id":"u7","name":"Laura"}'></nx-account>`;
    const el = document.querySelector("nx-account")!;
    await vi.advanceTimersByTimeAsync(0);
    // El primero falló (otro pedido, la precarga en reposo, puede haberlo traído ya).
    expect(mocks.loads).toBeGreaterThanOrEqual(1);
    expect(mocks.showViewAsBanner).not.toHaveBeenCalled();
    expect(el.getAttribute("data-view-as")).toBe("u7");
    // Mientras tanto, la tarjeta lo dice en su texto oculto (no solo con el color del contorno).
    expect(el.querySelector(".nx-account__card")!.textContent).toContain("Viendo como Laura.");
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.showViewAsBanner).toHaveBeenCalledOnce();
    expect(el.querySelector(".nx-account__card")!.textContent).not.toContain("Viendo como");
    el.remove();
    expect(mocks.unbanner).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
