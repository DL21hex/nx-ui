// @vitest-environment happy-dom
//
// `nxToast()` con opciones que llegan de un payload: tonos desconocidos y tiempos inválidos.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { nxToast } from "../src/index";

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
});
afterEach(() => {
  vi.useRealTimers();
  document.querySelector("nx-toaster")?.remove();
});
const toast = () => [...document.querySelectorAll<HTMLElement>(".nx-toast")].at(-1)!;

describe("nxToast() robusto", () => {
  it("un tono desconocido (o una clave heredada) es neutro y no rompe", () => {
    for (const tone of ["constructor", "toString", "__proto__", "<img>"]) {
      expect(() => void nxToast({ message: "x", tone: tone as never })).not.toThrow();
      expect(toast().dataset.tone).toBe("neutral");
      expect(toast().getAttribute("role")).toBe("status");
    }
  });

  it("un tiempo enorme no vence al instante (setTimeout lo tomaría como 0)", () => {
    vi.useFakeTimers();
    let result: string | undefined;
    void nxToast({ message: "x", duration: 1e12 }).then((r) => (result = r));
    vi.advanceTimersByTime(10_000);
    expect(result).toBeUndefined();
    expect(toast().isConnected).toBe(true);
  });

  it("un tiempo inválido usa el de siempre", async () => {
    vi.useFakeTimers();
    let result: string | undefined;
    void nxToast({ message: "x", duration: Number.NaN }).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(5000);
    expect(result).toBe("timeout");
  });
});

describe("nxToast con signal", () => {
  it("abortar la señal cierra el aviso con «dismiss»; una señal ya abortada ni lo muestra", async () => {
    const ctrl = new AbortController();
    const p = nxToast({ message: "Movida", undo: true, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).resolves.toBe("dismiss");
    const dead = new AbortController();
    dead.abort();
    await expect(nxToast({ message: "x", signal: dead.signal })).resolves.toBe("dismiss");
  });
});
