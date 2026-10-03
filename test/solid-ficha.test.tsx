// Los envoltorios de la ficha (Dialog, Tabs, Fields, Notice) solo avisan de sus propios eventos: los
// de un componente de adentro también burbujean (un <nx-date-range> que cierra su calendario manda
// `nx-open-change {open: false}`), y un <Dialog> controlado no debe cerrarse por eso.
import { describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { Dialog } from "../src/solid/dialog";
import { Tabs } from "../src/solid/tabs";
import { Fields } from "../src/solid/fields";
import { Notice } from "../src/solid/notice";

const bubble = (from: Element, type: string, detail: unknown) => from.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable: true }));

describe("envoltorios de la ficha: eventos que burbujean desde adentro", () => {
  it("Dialog no toma como suyos los eventos de un hijo; los suyos sí", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onOpenChange = vi.fn();
    const onClose = vi.fn();
    const onNav = vi.fn();
    const onAction = vi.fn();
    const dispose = render(
      () => (
        <Dialog heading="Pedido" onOpenChange={onOpenChange} onClose={onClose} onNav={onNav} onAction={onAction}>
          <div class="hijo" />
        </Dialog>
      ),
      root,
    );
    const d = root.querySelector("nx-dialog")!;
    const kid = d.querySelector(".hijo")!;
    bubble(kid, "nx-open-change", { open: false });
    bubble(kid, "nx-dialog-close", { reason: "api" });
    bubble(kid, "nx-dialog-nav", { dir: "next" });
    bubble(kid, "nx-dialog-action", { id: "x" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(onNav).not.toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
    bubble(d, "nx-dialog-nav", { dir: "next" });
    expect(onNav).toHaveBeenCalledTimes(1);
    dispose();
    root.remove();
  });

  it("Tabs no avisa del cambio de unas pestañas anidadas (ni las bloquea)", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onChange = vi.fn((e: Event) => e.preventDefault());
    const dispose = render(
      () => (
        <Tabs onChange={onChange}>
          <section data-tab="Uno">
            <nx-tabs class="adentro" />
          </section>
        </Tabs>
      ),
      root,
    );
    const inner = root.querySelector(".adentro")!;
    expect(bubble(inner, "nx-tabs-change", { value: "y", previous: "x" })).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    dispose();
    root.remove();
  });

  it("Fields y Notice solo avisan de su propia acción", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const onFields = vi.fn();
    const onNotice = vi.fn();
    const dispose = render(
      () => (
        <div>
          <Fields heading="Contrato" action="Editar" onAction={onFields} />
          <Notice action="Renovar" onAction={onNotice}>
            <nx-notice class="adentro" />
          </Notice>
        </div>
      ),
      root,
    );
    bubble(root.querySelector("nx-notice.adentro")!, "nx-notice-action", { action: "x" });
    expect(onNotice).not.toHaveBeenCalled();
    root.querySelector<HTMLButtonElement>(".nx-fields__action")!.click();
    expect(onFields).toHaveBeenCalledTimes(1);
    dispose();
    root.remove();
  });

  it("Fields no acepta hijos (todo lo pinta el componente)", () => {
    // @ts-expect-error: `children` es `never` en FieldsProps.
    const bad = () => <Fields heading="X">texto</Fields>;
    expect(typeof bad).toBe("function");
  });
});
