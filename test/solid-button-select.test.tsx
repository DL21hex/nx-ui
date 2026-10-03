// Los envoltorios de Solid de <nx-button> y <nx-select>: el orden en que asignan las props
// (`multiple` y `value`), los eventos que toman como propios y que no aceptan hijos.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { Button, type NxButton } from "../src/solid/button";
import { Select, type NxSelect } from "../src/solid/select";

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
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});
function mount<T extends Element>(tag: string, view: () => ReturnType<typeof Button>): T {
  const root = document.body.appendChild(document.createElement("div"));
  dispose = render(view, root);
  return root.querySelector<T>(tag)!;
}

const FIELDS = [{ key: "nombre", label: "Nombre" }];
const OPTIONS = [
  { value: "1", nombre: "Uno" },
  { value: "2", nombre: "Dos" },
];

describe("<Select>", () => {
  it("multiple con value de varios: no se recorta a uno", () => {
    const el = mount<NxSelect>("nx-select", () => <Select multiple fields={FIELDS} options={OPTIONS} value={["1", "2"]} />);
    expect(el.value).toEqual(["1", "2"]);
  });

  it("multiple con selection de varios, tampoco", () => {
    const el = mount<NxSelect>("nx-select", () => <Select multiple fields={FIELDS} source="/x" selection={OPTIONS} />);
    expect(el.value).toEqual(["1", "2"]);
  });

  it("onChange: el de este select (nx-select-change), no uno que burbujea desde adentro", () => {
    const onChange = vi.fn();
    const el = mount<NxSelect>("nx-select", () => <Select fields={FIELDS} options={OPTIONS} onChange={onChange} />);
    el.querySelector(".nx-select__field")!.dispatchEvent(new CustomEvent("nx-select-change", { bubbles: true, detail: { value: "x", options: [] } }));
    expect(onChange).not.toHaveBeenCalled();
    el.querySelector<HTMLElement>(".nx-select__field")!.click();
    el.querySelector<HTMLElement>('[role="option"]')!.click();
    expect(onChange).toHaveBeenCalledOnce();
    expect(onChange.mock.calls[0][0].detail.value).toBe("1");
  });

  it("no pasa hijos al elemento", () => {
    const kids = { children: "Hola" } as object;
    const el = mount<NxSelect>("nx-select", () => <Select fields={FIELDS} {...kids} />);
    expect(el.textContent).not.toContain("Hola");
  });
});

describe("<Button>", () => {
  it("onClick: solo el del botón; «Registro» no lo dispara", () => {
    const onClick = vi.fn();
    const el = mount<NxButton>("nx-button", () => <Button label="Borrar" onClick={onClick} />);
    el.log("Paso 1");
    el.done(true);
    el.querySelector<HTMLButtonElement>(".nx-button__toggle")!.click();
    expect(onClick).not.toHaveBeenCalled();
    el.querySelector<HTMLButtonElement>(".nx-button__btn")!.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("onDone con nx-button-done, solo el propio", () => {
    const onDone = vi.fn();
    const el = mount<NxButton>("nx-button", () => <Button label="A" onDone={onDone} />);
    el.querySelector(".nx-button__btn")!.dispatchEvent(new CustomEvent("nx-button-done", { bubbles: true, detail: { ok: true, ms: 0, lines: [] } }));
    expect(onDone).not.toHaveBeenCalled();
    el.busy = true;
    el.done(true);
    expect(onDone).toHaveBeenCalledOnce();
    expect(onDone.mock.calls[0][0].detail.ok).toBe(true);
  });

  it("type reset, name, value e iconOnly llegan al elemento; sin hijos", () => {
    const kids = { children: "Hola" } as object;
    const el = mount<NxButton>("nx-button", () => <Button label="Limpiar" type="reset" name="a" value="b" iconOnly {...kids} />);
    const btn = el.querySelector<HTMLButtonElement>(".nx-button__btn")!;
    expect(btn.type).toBe("reset");
    expect(btn.name).toBe("a");
    expect(btn.value).toBe("b");
    expect(btn.hasAttribute("data-icon-only")).toBe(true);
    expect(el.label).toBe("Limpiar");
    expect(el.textContent).not.toContain("Hola");
  });
});
