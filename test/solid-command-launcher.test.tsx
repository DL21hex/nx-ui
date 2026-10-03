// `<Command>` y `<Launcher>` de Solid: sus manejadores solo atienden los eventos del propio elemento,
// no uno con el mismo nombre que burbujea desde un nodo de adentro.
import { describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { Command } from "../src/solid/command";
import { Launcher } from "../src/solid/launcher";

describe("<Command> y <Launcher> de Solid", () => {
  it("onSelect, onAsk y onOpenChange de <Command> ignoran lo que sube desde adentro", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onSelect = vi.fn();
    const onAsk = vi.fn();
    const onOpenChange = vi.fn();
    const dispose = render(() => <Command items={[{ id: "a", label: "Uno" }]} onSelect={onSelect} onAsk={onAsk} onOpenChange={onOpenChange} />, root);
    const el = root.querySelector("nx-command")!;
    const inner = el.querySelector(".nx-command__list")!;
    for (const type of ["nx-command-select", "nx-command-ask", "nx-open-change"]) inner.dispatchEvent(new CustomEvent(type, { detail: {}, bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onAsk).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
    el.dispatchEvent(new CustomEvent("nx-command-select", { detail: { item: { label: "Uno" } }, bubbles: true }));
    el.dispatchEvent(new CustomEvent("nx-command-ask", { detail: { query: "x" }, bubbles: true }));
    el.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open: true }, bubbles: true }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onAsk).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledOnce();
    dispose();
    root.remove();
  });

  it("onSelect de <Launcher> ignora lo que sube desde adentro", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onSelect = vi.fn();
    const dispose = render(() => <Launcher items={[{ id: "a", label: "Permisos", href: "/permisos" }]} onSelect={onSelect} />, root);
    const el = root.querySelector("nx-launcher")!;
    const inner = el.firstElementChild!;
    expect(inner).toBeTruthy();
    inner.dispatchEvent(new CustomEvent("nx-launcher-select", { detail: {}, bubbles: true }));
    expect(onSelect).not.toHaveBeenCalled();
    el.dispatchEvent(new CustomEvent("nx-launcher-select", { detail: { item: { id: "a" } }, bubbles: true }));
    expect(onSelect).toHaveBeenCalledOnce();
    dispose();
    root.remove();
  });
});
