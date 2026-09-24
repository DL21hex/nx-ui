// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador
// (`beforetoggle` síncrono, `toggle` después). El posicionamiento se verifica en el navegador.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import { SELECT_LABELS, type NxSelect, type SelectField, type SelectOption } from "../src/index";

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
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FIELDS: SelectField[] = [
  { key: "nombre", label: "Nombre" },
  { key: "cedula", label: "Cédula", kind: "digits" },
  { key: "cargo", label: "Cargo" },
];
const E: SelectOption[] = [
  { value: "1", nombre: "Walber Pumarejo", cedula: "1098765432", cargo: "Técnico electricista" },
  { value: "2", nombre: "Ana María Rincón", cedula: "52341987", cargo: "Soldadora" },
  { value: "3", nombre: "Héctor Galeano", cedula: "98543210", cargo: "Soldador" },
];
const flush = () => new Promise((r) => setTimeout(r, 0));

function mount(attrs = "", setup?: (el: NxSelect) => void): NxSelect {
  document.body.innerHTML = `<nx-select ${attrs}></nx-select>`;
  const el = document.querySelector("nx-select")!;
  el.fields = FIELDS;
  el.options = E;
  setup?.(el);
  return el;
}
const field = (el: NxSelect) => el.querySelector<HTMLElement>(".nx-select__field")!;
const input = (el: NxSelect) => el.querySelector<HTMLInputElement>(".nx-select__input")!;
const opts = (el: NxSelect) => [...el.querySelectorAll<HTMLElement>('[role="option"]')];
const type = (el: NxSelect, q: string) => {
  input(el).value = q;
  input(el).dispatchEvent(new Event("input"));
};
const key = (target: HTMLElement, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("<nx-select> cerrado", () => {
  it("es un combobox compacto con el placeholder; no abre nada hasta el clic", () => {
    const el = mount('placeholder="Elige un empleado"');
    expect(field(el).getAttribute("role")).toBe("combobox");
    expect(field(el).getAttribute("aria-expanded")).toBe("false");
    expect(field(el).textContent).toContain("Elige un empleado");
    expect(el.open).toBe(false);
  });

  it("con un valor pinta el nombre y la línea secundaria, cédula con puntos", () => {
    const el = mount("", (s) => (s.value = "2"));
    expect(field(el).querySelector(".nx-select__primary")!.textContent).toBe("Ana María Rincón");
    expect(field(el).querySelector(".nx-select__secondary")!.textContent).toBe("52.341.987 · Soldadora");
  });

  it("un value que llega antes que las options se resuelve después", () => {
    document.body.innerHTML = "<nx-select></nx-select>";
    const el = document.querySelector("nx-select")!;
    el.fields = FIELDS;
    el.value = "3";
    el.options = E;
    expect(el.value).toBe("3");
    expect(field(el).textContent).toContain("Héctor Galeano");
  });
});

describe("<nx-select> abierto", () => {
  it("clic abre; buscar resalta y explica por qué coincidió", () => {
    const el = mount("avatar");
    field(el).click();
    expect(el.open).toBe(true);
    expect(opts(el)).toHaveLength(3);
    type(el, "ana soldad");
    expect(opts(el)).toHaveLength(1);
    expect(opts(el)[0].querySelectorAll("mark")).toHaveLength(2);
    expect(opts(el)[0].querySelector(".nx-select__why")!.textContent).toBe("Cargo");
    expect(opts(el)[0].querySelector(".nx-select__avatar")!.textContent).toBe("AM");
  });

  it("una consulta numérica busca solo en cédula y lo avisa", () => {
    const el = mount();
    field(el).click();
    type(el, "5234 1987");
    const hint = el.querySelector<HTMLElement>(".nx-select__hint")!;
    expect(hint.hidden).toBe(false);
    expect(hint.textContent).toBe(SELECT_LABELS.onlyField.replace("{field}", "Cédula"));
    expect(opts(el).map((o) => o.querySelector(".nx-select__primary")!.textContent)).toEqual(["Ana María Rincón"]);
  });

  it("escribir sobre el campo cerrado abre el buscador con esa letra", () => {
    const el = mount();
    key(field(el), "h");
    expect(el.open).toBe(true);
    expect(input(el).value).toBe("h");
  });

  it("flechas + Enter eligen, cierra y queda compacto; nx-change con el registro", () => {
    const el = mount();
    const seen: unknown[] = [];
    el.addEventListener("nx-change", (e) => seen.push(e.detail.value));
    field(el).click();
    key(input(el), "ArrowDown");
    key(input(el), "ArrowDown");
    key(input(el), "Enter");
    expect(el.open).toBe(false);
    expect(el.value).toBe("2");
    expect(seen).toEqual(["2"]);
    expect(field(el).textContent).toContain("Ana María Rincón");
  });

  it("Escape cierra sin elegir", () => {
    const el = mount();
    field(el).click();
    key(input(el), "Escape");
    expect(el.open).toBe(false);
    expect(el.value).toBe("");
  });

  it("sin resultados lo dice", () => {
    const el = mount();
    field(el).click();
    type(el, "zzz");
    expect(el.querySelector(".nx-select__empty")!.textContent).toBe(SELECT_LABELS.empty);
  });

  it("los datos son texto, nunca HTML", () => {
    const el = mount("", (s) => (s.options = [{ value: "x", nombre: "<img src=x onerror=alert(1)>", cedula: "1", cargo: "" }]));
    field(el).click();
    expect(el.querySelector("img")).toBeNull();
  });
});

describe("<nx-select multiple>", () => {
  it("elegir no cierra; lo elegido queda como chips; Backspace quita el último", () => {
    const el = mount("multiple");
    field(el).click();
    opts(el)[0].click();
    opts(el)[2].click();
    expect(el.open).toBe(true);
    expect(el.value).toEqual(["1", "3"]);
    expect([...field(el).querySelectorAll(".nx-select__chip")].map((c) => c.textContent)).toEqual(["Walber Pumarejo", "Héctor Galeano"]);
    expect(opts(el)[0].getAttribute("aria-selected")).toBe("true");
    key(input(el), "Backspace");
    expect(el.value).toEqual(["1"]);
    opts(el)[0].click();
    expect(el.value).toEqual([]);
  });

  it("la × de un chip lo quita sin abrir el panel", () => {
    const el = mount("multiple", (s) => (s.value = ["1", "2"]));
    field(el).querySelector<HTMLElement>('[data-remove="1"]')!.click();
    expect(el.value).toEqual(["2"]);
    expect(el.open).toBe(false);
  });
});

describe("<nx-select source> (servidor)", () => {
  it("pide ?q= con espera entre teclas, respeta el orden del servidor y conserva lo elegido", async () => {
    const fetchMock = vi.fn(async (url: URL) => new Response(JSON.stringify({ options: E.filter((o) => String(o.nombre).toLowerCase().includes(url.searchParams.get("q") ?? "")).reverse() })));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('source="/empleados/buscar"', (s) => (s.options = []));
    field(el).click();
    await sleep(20);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(opts(el).map((o) => o.dataset.i)).toHaveLength(3);
    // El servidor devolvió al revés: se respeta su orden.
    expect(opts(el)[0].querySelector(".nx-select__primary")!.textContent).toBe("Héctor Galeano");
    type(el, "g");
    type(el, "ga");
    type(el, "gal");
    await sleep(320);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get("q")).toBe("gal");
    opts(el)[0].click();
    expect(el.selection[0].nombre).toBe("Héctor Galeano");
    expect(el.value).toBe("3");
  });

  it("un error del servidor se muestra en la lista", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const el = mount('source="/x"');
    field(el).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(el.querySelector(".nx-select__empty")!.textContent).toBe(SELECT_LABELS.error);
  });
});

describe("BDUI", () => {
  it("render crea el select con fields, options y value", async () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const [el] = render({ component: "Select", props: { fields: FIELDS, options: E, value: "1", avatar: true } }, host) as NxSelect[];
    await flush();
    expect(el.value).toBe("1");
    expect(el.querySelector(".nx-select__field .nx-select__avatar")!.textContent).toBe("WP");
  });
});
