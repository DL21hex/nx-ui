// @vitest-environment happy-dom
//
// <nx-select> como control de formulario y su accesibilidad: lo que salió de la revisión (validez
// con su ancla, reset al valor inicial, `name` y `multiple` que llegan tarde, `<fieldset disabled>`,
// `<label for>`, Enter dentro de un <form>…). happy-dom no implementa ElementInternals: se simula
// lo justo para ver qué le pasa el componente (valor, validez, ancla) y para disparar `invalid`.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SELECT_LABELS, type NxSelect, type SelectField, type SelectOption } from "../src/index";
import "../src/index";

class FakeInternals {
  value: unknown = null;
  state: unknown = null;
  flags: ValidityStateFlags = {};
  message = "";
  anchor: HTMLElement | undefined;
  constructor(readonly host: HTMLElement) {}
  setFormValue(v: unknown, state?: unknown): void {
    this.value = v;
    this.state = state;
  }
  setValidity(flags: ValidityStateFlags, message = "", anchor?: HTMLElement): void {
    this.flags = flags;
    this.message = message;
    this.anchor = anchor;
  }
  get validity(): ValidityState {
    return { valid: !Object.values(this.flags).some(Boolean), ...this.flags } as ValidityState;
  }
  get validationMessage(): string {
    return this.message;
  }
  get willValidate(): boolean {
    return true;
  }
  get form(): HTMLFormElement | null {
    return this.host.closest("form");
  }
  get labels(): HTMLLabelElement[] {
    const byFor = this.host.id ? [...document.querySelectorAll<HTMLLabelElement>(`label[for="${this.host.id}"]`)] : [];
    const wrap = this.host.closest("label");
    return wrap && !byFor.includes(wrap) ? [...byFor, wrap] : byFor;
  }
  checkValidity(): boolean {
    const ok = this.validity.valid;
    if (!ok) this.host.dispatchEvent(new Event("invalid", { cancelable: true }));
    return ok;
  }
  reportValidity(): boolean {
    return this.checkValidity();
  }
}
const internals = new WeakMap<HTMLElement, FakeInternals>();
const fake = (el: NxSelect) => internals.get(el)!;

beforeAll(() => {
  HTMLElement.prototype.attachInternals = function (this: HTMLElement) {
    const i = new FakeInternals(this);
    internals.set(this, i);
    return i as unknown as ElementInternals;
  };
  // happy-dom no tiene Popover API: se simulan sus eventos. Como en el navegador, `showPopover`
  // fuera del documento lanza.
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    if (!this.isConnected) throw new DOMException("not connected", "InvalidStateError");
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    fire(this, "closed");
  };
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

const FIELDS: SelectField[] = [{ key: "nombre", label: "Nombre" }];
const E: SelectOption[] = [
  { value: "1", nombre: "Uno" },
  { value: "2", nombre: "Dos" },
  { value: "3", nombre: "Tres" },
];
function mount(html: string, setup?: (el: NxSelect) => void): NxSelect {
  document.body.innerHTML = html;
  const el = document.querySelector("nx-select")!;
  el.fields = FIELDS;
  el.options = E;
  setup?.(el);
  return el;
}
const field = (el: NxSelect) => el.querySelector<HTMLElement>(".nx-select__field")!;
const input = (el: NxSelect) => el.querySelector<HTMLInputElement>(".nx-select__input")!;
const opts = (el: NxSelect) => [...el.querySelectorAll<HTMLElement>('[role="option"]')];
const key = (target: HTMLElement, k: string) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
};
const entries = (v: unknown) => (v instanceof FormData ? [...v.entries()] : v);

describe("<nx-select> en un <form>", () => {
  it("required vacío: inválido con su aviso y el campo como ancla (desde HTML)", () => {
    const el = mount('<form><nx-select name="e" required></nx-select></form>');
    const i = fake(el);
    expect(i.flags.valueMissing).toBe(true);
    expect(i.message).toBe(SELECT_LABELS.required);
    expect(i.anchor).toBe(field(el));
    expect(el.checkValidity()).toBe(false);
    expect(el.validity?.valid).toBe(false);
    expect(el.validationMessage).toBe(SELECT_LABELS.required);
    expect(el.form).toBe(document.querySelector("form"));
  });

  it("required vacío creado por JS (como Solid: props antes de insertarlo) también tiene ancla", () => {
    const el = document.createElement("nx-select");
    el.required = true;
    el.name = "e";
    el.fields = FIELDS;
    el.options = E;
    document.body.append(el);
    expect(fake(el).anchor).toBe(field(el));
    el.value = "2";
    expect(fake(el).validity.valid).toBe(true);
  });

  it("un envío inválido marca aria-invalid hasta que se elige; aria-required siempre", () => {
    const el = mount('<nx-select name="e" required label="Empleado"></nx-select>');
    expect(field(el).getAttribute("aria-required")).toBe("true");
    expect(field(el).hasAttribute("aria-invalid")).toBe(false);
    el.reportValidity();
    expect(field(el).getAttribute("aria-invalid")).toBe("true");
    field(el).click();
    opts(el)[1].click();
    expect(field(el).hasAttribute("aria-invalid")).toBe(false);
  });

  it("setCustomValidity: un error propio, y '' lo quita", () => {
    const el = mount('<nx-select name="e"></nx-select>');
    el.setCustomValidity("Ya está asignado");
    expect(fake(el).flags.customError).toBe(true);
    expect(el.validationMessage).toBe("Ya está asignado");
    el.setCustomValidity("");
    expect(fake(el).validity.valid).toBe(true);
  });

  it("reset vuelve al atributo value, sin avisar cambios", () => {
    const el = mount('<nx-select name="cargo" value="2"></nx-select>');
    field(el).click();
    opts(el)[2].click();
    expect(el.value).toBe("3");
    const seen = vi.fn();
    el.addEventListener("nx-select-change", seen);
    el.formResetCallback();
    expect(el.value).toBe("2");
    expect(fake(el).value).toBe("2");
    expect(seen).not.toHaveBeenCalled();
  });

  it("reset vuelve a lo que llegó de afuera antes de que la persona lo tocara", () => {
    const el = mount('<nx-select name="cargo"></nx-select>', (s) => (s.value = "1"));
    field(el).click();
    opts(el)[1].click();
    el.value = "3"; // un framework que refleja lo elegido: ya no es el inicial
    el.formResetCallback();
    expect(el.value).toBe("1");
  });

  it("reset con `selection` (con `source`): vuelve a esos registros", () => {
    document.body.innerHTML = '<nx-select name="e" source="/x" clearable></nx-select>';
    const el = document.querySelector("nx-select")!;
    el.fields = FIELDS;
    el.selection = [{ value: "17", nombre: "Ana" }];
    el.querySelector<HTMLElement>("[data-clear]")!.click(); // la persona lo limpia
    expect(el.value).toBe("");
    el.formResetCallback();
    expect(el.value).toBe("17");
    expect(field(el).textContent).toContain("Ana");
  });

  it("multiple: el FormData usa el name aunque llegue después del valor", () => {
    const el = mount("<nx-select multiple></nx-select>", (s) => (s.value = ["1", "2"]));
    el.name = "tags";
    expect(entries(fake(el).value)).toEqual([
      ["tags", "1"],
      ["tags", "2"],
    ]);
    expect(fake(el).state).toBe('["1","2"]');
  });

  it("<fieldset disabled>: no se abre, sin × en los chips, y cierra el panel", () => {
    const el = mount('<nx-select multiple clearable name="t"></nx-select>', (s) => (s.value = ["1", "2"]));
    el.show();
    expect(el.open).toBe(true);
    el.formDisabledCallback(true);
    expect(el.open).toBe(false);
    expect(field(el).getAttribute("aria-disabled")).toBe("true");
    expect(field(el).tabIndex).toBe(-1);
    expect(el.querySelector("[data-remove], [data-clear]")).toBeNull();
    field(el).click();
    expect(el.open).toBe(false);
    el.formDisabledCallback(false);
    expect(el.querySelectorAll("[data-remove]")).toHaveLength(2);
  });

  it("disabled con el panel abierto lo cierra: no se puede elegir", () => {
    const el = mount("<nx-select></nx-select>");
    field(el).click();
    el.disabled = true;
    expect(el.open).toBe(false);
  });

  it("al volver a la página, restaura lo que guardó", () => {
    const el = mount('<nx-select multiple name="t"></nx-select>');
    el.formStateRestoreCallback('["3","1"]');
    expect(el.value).toEqual(["3", "1"]);
  });

  it("Enter en el buscador nunca envía el <form>, haya o no algo resaltado", () => {
    const el = mount('<form><nx-select name="e"></nx-select><button>Enviar</button></form>');
    field(el).click();
    expect(key(input(el), "Enter").defaultPrevented).toBe(true);
    input(el).value = "zzz";
    input(el).dispatchEvent(new Event("input"));
    expect(key(input(el), "Enter").defaultPrevented).toBe(true);
  });

  it("emite nx-select-change y un change nativo que burbujea; el buscador no deja salir los suyos", () => {
    document.body.innerHTML = '<form><nx-select name="e"></nx-select></form>';
    const el = document.querySelector("nx-select")!;
    el.fields = FIELDS;
    el.options = E;
    const form = document.querySelector("form")!;
    const got: string[] = [];
    form.addEventListener("change", (e) => got.push(`change:${(e.target as Element).localName}`));
    form.addEventListener("input", () => got.push("input"));
    form.addEventListener("nx-select-change", () => got.push("nx-select-change"));
    field(el).click();
    input(el).value = "d";
    input(el).dispatchEvent(new Event("input", { bubbles: true }));
    input(el).dispatchEvent(new Event("change", { bubbles: true }));
    expect(got).toEqual([]);
    opts(el)[0].click();
    expect(got).toEqual(["nx-select-change", "change:nx-select"]);
  });
});

describe("<nx-select> multiple y el orden de las props", () => {
  it("value de varios antes que multiple (el orden de Solid o de un payload) no se recorta", () => {
    const el = mount("<nx-select></nx-select>", (s) => {
      s.value = ["1", "2"];
      s.multiple = true;
    });
    expect(el.value).toEqual(["1", "2"]);
  });

  it("selection de varios antes que multiple, tampoco", () => {
    document.body.innerHTML = "<nx-select></nx-select>";
    const el = document.querySelector("nx-select")!;
    el.selection = [
      { value: "1", nombre: "Uno" },
      { value: "2", nombre: "Dos" },
    ];
    el.multiple = true;
    expect(el.value).toEqual(["1", "2"]);
  });

  it('atributos value=\'["1","2"]\' antes que multiple: se lee como JSON', () => {
    const el = mount(`<nx-select value='["1","2"]' multiple></nx-select>`);
    expect(el.value).toEqual(["1", "2"]);
  });

  it("sin multiple cuenta uno solo; quitar multiple deja el primero", () => {
    const el = mount("<nx-select multiple></nx-select>", (s) => (s.value = ["2", "3"]));
    el.multiple = false;
    expect(el.value).toBe("2");
    el.multiple = true;
    expect(el.value).toEqual(["2"]);
  });
});

describe("<nx-select> accesible", () => {
  it("<label for> le da nombre al combobox, al buscador y al panel; su clic enfoca el campo", async () => {
    document.body.innerHTML = '<label for="emp">Empleado</label><nx-select id="emp"></nx-select>';
    const el = document.querySelector("nx-select")!;
    await Promise.resolve();
    const lab = document.querySelector("label")!;
    expect(lab.id).not.toBe("");
    expect(field(el).getAttribute("aria-labelledby")).toBe(lab.id);
    expect(input(el).getAttribute("aria-label")).toBe("Buscar · Empleado");
    expect(el.querySelector(".nx-select__pop")!.getAttribute("aria-label")).toBe("Empleado");
    // El <label> le manda el clic al elemento.
    el.click();
    expect(document.activeElement).toBe(field(el));
  });

  it("aria-labelledby del elemento pasa al campo; quitar `label` no deja un aria-label viejo", () => {
    document.body.innerHTML = '<span id="t">Responsable</span><nx-select aria-labelledby="t" label="Jefe"></nx-select>';
    const el = document.querySelector("nx-select")!;
    expect(field(el).getAttribute("aria-label")).toBe("Jefe");
    el.removeAttribute("label");
    expect(field(el).hasAttribute("aria-label")).toBe(false);
    expect(field(el).getAttribute("aria-labelledby")).toBe("t");
  });

  it("el popup es un diálogo con buscador; el buscador no lleva autofocus y show() lo enfoca", () => {
    const el = mount('<nx-select label="Empleado"></nx-select>');
    expect(field(el).getAttribute("aria-haspopup")).toBe("dialog");
    expect(el.querySelector(".nx-select__pop")!.getAttribute("role")).toBe("dialog");
    expect(input(el).hasAttribute("autofocus")).toBe(false);
    el.show();
    expect(document.activeElement).toBe(input(el));
  });

  it("show() fuera del documento no lanza", () => {
    const el = mount("<nx-select></nx-select>");
    el.remove();
    expect(() => el.show()).not.toThrow();
    expect(el.open).toBe(false);
  });

  it("al borrar la consulta, aria-activedescendant no apunta a una opción sin resaltar", () => {
    const el = mount("<nx-select></nx-select>");
    field(el).click();
    input(el).value = "d";
    input(el).dispatchEvent(new Event("input"));
    expect(input(el).getAttribute("aria-activedescendant")).toBeTruthy();
    input(el).value = "";
    input(el).dispatchEvent(new Event("input"));
    expect(input(el).hasAttribute("aria-activedescendant")).toBe(false);
  });
});

describe("<nx-select> datos", () => {
  it("options nuevas con el panel abierto se ven al momento", () => {
    const el = mount("<nx-select></nx-select>");
    field(el).click();
    el.options = [{ value: "9", nombre: "Nueve" }];
    expect(opts(el).map((o) => o.textContent)).toEqual(["Nueve"]);
  });

  it("value repetido: se avisa y se queda el primero", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount("<nx-select></nx-select>", (s) => {
      s.options = [
        { value: "1", nombre: "A" },
        { value: 1 as unknown as string, nombre: "B" },
      ];
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(el.options.map((o) => o.nombre)).toEqual(["A"]);
  });
});
