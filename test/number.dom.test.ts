// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { NUMBER_LABELS, type NumberChangeDetail, type NxNumber } from "../src/components/number/index";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function mount(attrs = ""): NxNumber {
  document.body.innerHTML = `<nx-number ${attrs}></nx-number>`;
  return document.querySelector("nx-number")!;
}
const inputOf = (el: NxNumber) => el.querySelector<HTMLInputElement>(".nx-number__input")!;
const hintOf = (el: NxNumber) => el.querySelector<HTMLElement>(".nx-number__hint")!;
const nb = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
function type(el: NxNumber, text: string) {
  const i = inputOf(el);
  i.focus();
  i.dispatchEvent(new FocusEvent("focus"));
  i.value = text;
  i.dispatchEvent(new Event("input", { bubbles: true }));
}
const blur = (el: NxNumber) => inputOf(el).dispatchEvent(new FocusEvent("blur"));
const key = (el: NxNumber, k: string, mods: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...mods });
  inputOf(el).dispatchEvent(e);
  return e;
};
function changes(el: NxNumber) {
  const out: NumberChangeDetail[] = [];
  el.addEventListener("nx-change", (e) => out.push((e as Event as CustomEvent<NumberChangeDetail>).detail));
  return out;
}

describe("<nx-number>", () => {
  it("un <input> de texto con teclado decimal, como spinbutton, con su nombre", () => {
    const el = mount('label="Cantidad" placeholder="0"');
    const i = inputOf(el);
    expect(i.type).toBe("text");
    expect(i.getAttribute("inputmode")).toBe("decimal");
    expect(i.getAttribute("role")).toBe("spinbutton");
    expect(i.getAttribute("aria-label")).toBe("Cantidad");
    expect(i.placeholder).toBe("0");
    expect(el.value).toBeNull();
  });

  it("value → el texto formateado; el símbolo va aparte", () => {
    const el = mount('format="money" currency="COP" locale="es-CO"');
    el.value = 1450000;
    expect(inputOf(el).value).toBe("1.450.000");
    expect(el.querySelector(".nx-number__affix:not([hidden])")!.textContent).toBe("$");
    expect(nb(el.text)).toBe("$ 1.450.000");
    expect(nb(inputOf(el).getAttribute("aria-valuetext"))).toBe("$ 1.450.000");
    expect(inputOf(el).getAttribute("aria-valuenow")).toBe("1450000");
    // Un monto se alinea a la derecha por defecto.
    expect(el.querySelector<HTMLElement>(".nx-number__field")!.dataset.align).toBe("end");
  });

  it("el atributo value acepta formato de máquina o del locale", () => {
    expect(mount('value="1450000.5"').value).toBe(1450000.5);
    expect(mount('value="1.450.000,5"').value).toBe(1450000.5);
    expect(mount('value="basura"').value).toBeNull();
  });

  it("mientras se escribe una cuenta muestra el resultado; al salir formatea y emite nx-change", () => {
    const el = mount('locale="es-CO"');
    const got = changes(el);
    const inputs: (number | null)[] = [];
    el.addEventListener("input", (e) => {
      expect(e.target).toBe(el); // el `input` es del elemento, no del campo interno
      inputs.push(el.value);
    });
    type(el, "=450*3");
    expect(hintOf(el).hidden).toBe(false);
    expect(hintOf(el).textContent).toBe("= 1.350");
    expect(el.value).toBe(1350);
    expect(inputs).toEqual([1350]);
    expect(got).toEqual([]);
    blur(el);
    expect(inputOf(el).value).toBe("1.350");
    expect(hintOf(el).hidden).toBe(true);
    expect(got).toEqual([{ value: 1350, text: "1.350" }]);
  });

  it("un número simple no muestra vista previa; un sufijo sí", () => {
    const el = mount();
    type(el, "1450000");
    expect(hintOf(el).hidden).toBe(true);
    type(el, "2,5M");
    expect(hintOf(el).textContent).toBe("= 2.500.000");
  });

  it("un error se dice a la derecha y, al salir, deja el campo inválido sin tocar el valor", () => {
    const el = mount('value="10"');
    const got = changes(el);
    type(el, "=2+x");
    expect(hintOf(el).textContent).toBe('no entiendo "x"');
    expect(hintOf(el).hasAttribute("data-error")).toBe(true);
    expect(el.value).toBe(10);
    blur(el);
    expect(inputOf(el).value).toBe("=2+x");
    expect(inputOf(el).getAttribute("aria-invalid")).not.toBeNull();
    expect(got).toEqual([]);
    // Al corregirlo se quita el error.
    type(el, "=2+3");
    blur(el);
    expect(inputOf(el).hasAttribute("aria-invalid")).toBe(false);
    expect(el.value).toBe(5);
  });

  it("«+15%» calcula sobre el valor anterior", () => {
    const el = mount('format="money" currency="COP"');
    el.value = 1000000;
    type(el, "+15%");
    expect(nb(hintOf(el).textContent)).toBe("= $ 1.150.000");
    blur(el);
    expect(el.value).toBe(1150000);
    // Y la base es lo confirmado: otro «+15%» vuelve a sumar.
    type(el, "+15%");
    blur(el);
    expect(el.value).toBe(1322500);
  });

  it("Enter confirma", () => {
    const el = mount();
    const got = changes(el);
    type(el, "=1.200.000/12");
    key(el, "Enter");
    expect(inputOf(el).value).toBe("100.000");
    expect(got).toEqual([{ value: 100000, text: "100.000" }]);
    // Salir sin cambiar nada no vuelve a emitir.
    blur(el);
    expect(got).toHaveLength(1);
  });

  it("↑/↓ suman step; Mayús ×10, Alt ÷10", () => {
    const el = mount('step="5" value="100"');
    inputOf(el).focus();
    expect(key(el, "ArrowUp").defaultPrevented).toBe(true);
    expect(el.value).toBe(105);
    key(el, "ArrowDown", { shiftKey: true });
    expect(el.value).toBe(55);
    key(el, "ArrowUp", { altKey: true });
    expect(el.value).toBe(55.5);
    expect(inputOf(el).value).toBe("55,5");
  });

  it("↑/↓ en porcentaje van de a un punto", () => {
    const el = mount('format="percent" value="0.19"');
    expect(inputOf(el).value).toBe("19");
    key(el, "ArrowUp");
    expect(el.value).toBe(0.2);
    expect(inputOf(el).value).toBe("20");
  });

  it("min/max: recorta al confirmar y lo avisa", () => {
    vi.useFakeTimers();
    const el = mount('min="0" max="100"');
    const got = changes(el);
    type(el, "250");
    blur(el);
    expect(el.value).toBe(100);
    expect(got).toEqual([{ value: 100, text: "100" }]);
    const note = el.querySelector<HTMLElement>(".nx-number__note")!;
    expect(note.getAttribute("role")).toBe("status");
    expect(note.textContent).toBe("El máximo es 100");
    vi.advanceTimersByTime(3000);
    expect(note.textContent).toBe("");
    type(el, "-3");
    blur(el);
    expect(el.value).toBe(0);
    expect(note.textContent).toBe("El mínimo es 0");
  });

  it("↑ no pasa del máximo", () => {
    const el = mount('max="10" value="10"');
    key(el, "ArrowUp");
    expect(el.value).toBe(10);
    expect(el.querySelector(".nx-number__note")!.textContent).toBe("El máximo es 10");
  });

  it("Escape deshace lo escrito desde el foco; sin nada que deshacer, sigue su camino", () => {
    const el = mount('value="42"');
    type(el, "=1+1");
    expect(el.value).toBe(2);
    const e = key(el, "Escape");
    expect(e.defaultPrevented).toBe(true);
    expect(inputOf(el).value).toBe("42");
    expect(el.value).toBe(42);
    expect(hintOf(el).hidden).toBe(true);
    expect(key(el, "Escape").defaultPrevented).toBe(false);
  });

  it("la rueda del mouse no cambia el valor", () => {
    const el = mount('value="7"');
    inputOf(el).focus();
    inputOf(el).dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));
    expect(el.value).toBe(7);
  });

  it("con words, el monto en letras debajo (y se actualiza mientras se escribe)", () => {
    const el = mount('format="money" currency="COP" words');
    el.value = 1450000;
    const words = el.querySelector<HTMLElement>(".nx-number__words")!;
    expect(words.textContent).toBe("Un millón cuatrocientos cincuenta mil pesos m/cte");
    expect(inputOf(el).getAttribute("aria-describedby")).toContain(words.id);
    type(el, "=1000000");
    expect(words.textContent).toBe("Un millón de pesos m/cte");
    el.value = null;
    expect(words.hidden).toBe(true);
  });

  it("words en porcentaje y en dólares", () => {
    const pct = mount('format="percent" words value="0.19"');
    expect(pct.querySelector(".nx-number__words")!.textContent).toBe("Diecinueve por ciento");
    const usd = mount('format="money" currency="USD" words value="21"');
    expect(usd.querySelector(".nx-number__words")!.textContent).toBe("Veintiún dólares");
  });

  it("pegar un monto de Excel lo limpia de una vez", () => {
    const el = mount('format="money"');
    const i = inputOf(el);
    i.focus();
    const paste = (text: string) => {
      i.setSelectionRange(0, i.value.length);
      const e = new Event("paste", { bubbles: true, cancelable: true }) as ClipboardEvent;
      Object.defineProperty(e, "clipboardData", { value: { getData: () => text } });
      i.dispatchEvent(e);
      return e;
    };
    expect(paste("$ 1.450.000,00\t").defaultPrevented).toBe(true);
    expect(i.value).toBe("1.450.000");
    expect(el.value).toBe(1450000);
    paste("(1.200)");
    expect(i.value).toBe("-1.200");
    expect(el.value).toBe(-1200);
    // Lo que no se entiende se pega tal cual (y luego se dice qué falla).
    expect(paste("hola").defaultPrevented).toBe(false);
  });

  it("en inglés: «1,234.5»", () => {
    const el = mount('locale="en-US"');
    type(el, "1,234.5");
    blur(el);
    expect(el.value).toBe(1234.5);
    expect(inputOf(el).value).toBe("1,234.5");
  });

  it("el locale se hereda del lang más cercano", () => {
    document.body.innerHTML = `<div lang="en-US"><nx-number value="1234.5"></nx-number></div>`;
    expect(inputOf(document.querySelector("nx-number")!).value).toBe("1,234.5");
  });

  it("readonly no cambia con ↑/↓; disabled deshabilita el campo", () => {
    const ro = mount('readonly value="3"');
    key(ro, "ArrowUp");
    expect(ro.value).toBe(3);
    expect(inputOf(ro).readOnly).toBe(true);
    const off = mount("disabled");
    expect(inputOf(off).disabled).toBe(true);
    off.disabled = false;
    expect(inputOf(off).disabled).toBe(false);
  });

  it("decimals redondea lo que se guarda y lo que se ve", () => {
    const el = mount('decimals="0"');
    type(el, "2,6");
    blur(el);
    expect(el.value).toBe(3);
    expect(inputOf(el).value).toBe("3");
  });

  it("labels (JSON) cambia los textos", () => {
    const el = mount(`labels='{"unknown":"¿«{token}»?"}'`);
    type(el, "=1+y");
    expect(hintOf(el).textContent).toBe("¿«y»?");
    expect(el.labels.min).toBe(NUMBER_LABELS.min);
  });

  it("propiedades puestas antes de registrarse no se pierden", () => {
    const tpl = document.createElement("template");
    tpl.innerHTML = "<nx-number></nx-number>";
    const el = tpl.content.firstElementChild as NxNumber;
    (el as unknown as { value: number }).value = 9;
    document.body.append(document.adoptNode(el));
    expect((document.body.querySelector("nx-number") as NxNumber).value).toBe(9);
    expect(inputOf(document.body.querySelector("nx-number")!).value).toBe("9");
  });

  it("focus() y un clic en el símbolo enfocan el campo", () => {
    const el = mount('format="money"');
    el.focus();
    expect(document.activeElement).toBe(inputOf(el));
    inputOf(el).blur();
    el.querySelector(".nx-number__affix")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(inputOf(el));
  });

  it("vaciar el campo deja null", () => {
    const el = mount('value="5"');
    const got = changes(el);
    type(el, "");
    blur(el);
    expect(el.value).toBeNull();
    expect(got).toEqual([{ value: null, text: "" }]);
  });
});
