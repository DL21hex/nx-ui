// @vitest-environment happy-dom
//
// El menú de `<nx-breadcrumb>` llega con `import()`. Si ese archivo no carga (un despliegue nuevo lo
// borró, o se cayó la red), no deja una promesa rechazada sin atender: avisa por consola y el
// separador lleva a la página de su nivel.
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

  it("el separador lleva a la página de su nivel (nx-breadcrumb-navigate «link», cancelable)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      document.body.innerHTML = `<nx-breadcrumb></nx-breadcrumb>`;
      await tick();
      const b = document.querySelector<NxBreadcrumb>("nx-breadcrumb")!;
      b.items = [{ label: "A", href: "/a", children: [{ label: "B" }, { label: "C" }] }, { label: "B" }];
      await tick();
      const go = vi.fn((e: Event) => e.preventDefault());
      b.addEventListener("nx-breadcrumb-navigate", go);
      b.querySelector<HTMLElement>('[data-sep="0"]')!.click();
      await vi.waitFor(() => expect(go).toHaveBeenCalledOnce());
      expect((go.mock.calls[0][0] as CustomEvent).detail).toMatchObject({ item: { label: "A" }, level: 0, via: "link" });
    } finally {
      warn.mockRestore();
    }
  });

  it("sin cancelar, el separador va al href de su nivel; el «…» no navega", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const assign = vi.spyOn(location, "assign").mockImplementation(() => {});
    try {
      document.body.innerHTML = `<nx-breadcrumb></nx-breadcrumb>`;
      await tick();
      const b = document.querySelector<NxBreadcrumb>("nx-breadcrumb")!;
      b.items = [{ label: "A", href: "/a", children: [{ label: "B" }, { label: "C" }] }, { label: "B", href: "/b" }, { label: "C", href: "/c" }, { label: "D" }];
      await tick();
      const go = vi.fn();
      b.addEventListener("nx-breadcrumb-navigate", go);
      b.querySelector<HTMLElement>(".nx-breadcrumb__more")!.click();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledOnce());
      await tick();
      expect(go).not.toHaveBeenCalled();
      expect(assign).not.toHaveBeenCalled();
      b.querySelector<HTMLElement>('[data-sep="0"]')!.click();
      await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/a"));
      expect(go).toHaveBeenCalledOnce();
      expect(assign).toHaveBeenCalledOnce();
    } finally {
      assign.mockRestore();
      warn.mockRestore();
    }
  });
});
