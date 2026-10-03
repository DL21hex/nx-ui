// Los envoltorios de `<SideMenu>` y `<Breadcrumb>` atienden solo sus propios eventos. Todos
// burbujean: el `nx-open-change` del panel de `<nx-account>` en el pie del menú no es el drawer, y
// cerrarlo no debe cerrar un drawer controlado.
import { describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { SideMenu } from "../src/solid/sidemenu";
import { Breadcrumb } from "../src/solid/breadcrumb";

const fire = (el: Element, type: string, detail: unknown) => el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

describe("envoltorios de Solid: eventos propios", () => {
  it("SideMenu: un nx-open-change (o un select) que burbujea desde un hijo no llega a sus manejadores", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onOpenChange = vi.fn();
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const dispose = render(
      () => (
        <SideMenu items={[{ id: "a", label: "A", href: "/" }]} onOpenChange={onOpenChange} onSelect={onSelect} onToggle={onToggle}>
          <div slot="footer" class="cuenta" />
        </SideMenu>
      ),
      root,
    );
    const host = root.querySelector("nx-sidemenu")!;
    const kid = root.querySelector(".cuenta")!;
    fire(kid, "nx-open-change", { open: false });
    fire(kid, "nx-sidemenu-select", { item: { id: "x" } });
    fire(kid, "nx-sidemenu-toggle", { collapsed: true, auto: false });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onToggle).not.toHaveBeenCalled();
    fire(host, "nx-open-change", { open: true });
    fire(host, "nx-sidemenu-select", { item: { id: "a" } });
    fire(host, "nx-sidemenu-toggle", { collapsed: true, auto: false });
    expect(onOpenChange).toHaveBeenCalledOnce();
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onToggle).toHaveBeenCalledOnce();
    dispose();
    root.remove();
  });

  it("Breadcrumb: solo los de su propia ruta; childrenEndpoint va como atributo", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onNavigate = vi.fn();
    const onChildren = vi.fn();
    const dispose = render(
      () => (
        <Breadcrumb items={[{ label: "Inicio", href: "/" }, { label: "Aquí" }]} childrenEndpoint="/api/hijos/{id}" onNavigate={onNavigate} onChildren={onChildren}>
          <span class="otra" />
        </Breadcrumb>
      ),
      root,
    );
    const host = root.querySelector("nx-breadcrumb")!;
    expect(host.getAttribute("children-endpoint")).toBe("/api/hijos/{id}");
    const kid = root.querySelector(".otra")!;
    fire(kid, "nx-breadcrumb-navigate", { item: { label: "X" }, level: 0, via: "link" });
    fire(kid, "nx-breadcrumb-children", { item: { label: "X" }, level: 0, respond() {} });
    expect(onNavigate).not.toHaveBeenCalled();
    expect(onChildren).not.toHaveBeenCalled();
    fire(host, "nx-breadcrumb-navigate", { item: { label: "Inicio" }, level: 0, via: "link" });
    fire(host, "nx-breadcrumb-children", { item: { label: "Inicio" }, level: 0, respond() {} });
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onChildren).toHaveBeenCalledOnce();
    dispose();
    root.remove();
  });
});
