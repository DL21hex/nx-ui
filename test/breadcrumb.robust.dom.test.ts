// @vitest-environment happy-dom
//
// El menú de `<nx-breadcrumb>` llega con `import()`. Si ese archivo no carga (un despliegue nuevo lo
// borró, o se cayó la red), el separador no abre nada pero tampoco deja una promesa rechazada sin
// atender: avisa por consola y el próximo clic lo reintenta.
import { describe, expect, it, vi } from "vitest";
import "../src/components/breadcrumb/index";
import type { NxBreadcrumb } from "../src/components/breadcrumb/index";

vi.mock("../src/components/breadcrumb/breadcrumb-menu", () => {
  throw new Error("chunk no encontrado");
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("<nx-breadcrumb> sin el módulo del menú", () => {
  it("avisa por consola y no deja la promesa rechazada sin atender", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      document.body.innerHTML = `<nx-breadcrumb><a href="/a">A</a><span>B</span></nx-breadcrumb>`;
      await tick();
      const b = document.querySelector<NxBreadcrumb>("nx-breadcrumb")!;
      b.items = [{ label: "A", href: "/a", children: [{ label: "B" }, { label: "C" }] }, { label: "B" }];
      await tick();
      const sep = b.querySelector<HTMLElement>('[data-sep="0"]')!;
      sep.click();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith("[nx-breadcrumb] no se pudo cargar el menú", expect.anything()));
      await tick();
      expect(sep.getAttribute("aria-expanded")).toBe("false");
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
      warn.mockRestore();
    }
  });
});
