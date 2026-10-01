// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/fields/index";
import type { FieldItem, NxFields } from "../src/components/fields/index";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const ITEMS: FieldItem[] = [
  { key: "doc", label: "Documento", value: "CC 1.020.456.789", readonly: true, copy: true },
  { key: "correo", label: "Correo", value: "laura.gomez@acme.co", wide: true, input: { type: "email", required: true } },
  { key: "fijo", label: "Teléfono fijo", value: "" },
  { key: "tipo", label: "Tipo de contrato", value: "Término fijo", input: { type: "select", options: ["Término fijo", "Indefinido"] } },
  { key: "hasta", label: "Hasta", value: "2026-10-12", format: "date" },
  { key: "salario", label: "Salario", value: 4850000, format: "money", currency: "COP" },
  { key: "jefe", label: "Jefe directo", value: "Andrés Pardo", href: "/hcm/empleados/517" },
];

function mount(attrs = ""): NxFields {
  document.body.innerHTML = `<nx-fields locale="es-CO" ${attrs}></nx-fields>`;
  const f = document.querySelector("nx-fields")!;
  f.items = ITEMS;
  return f;
}
const rows = (f: NxFields) => [...f.querySelectorAll<HTMLElement>(".nx-fields__f")];
const input = (f: NxFields, k: string) => f.querySelector<HTMLInputElement>(`[name="${k}"]`)!;
const type = (el: HTMLInputElement, v: string) => {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("<nx-fields> al leer", () => {
  it("pinta etiqueta y valor en una lista de definición, con formato del locale", () => {
    const f = mount();
    expect(f.querySelector("dl.nx-fields__list")).not.toBeNull();
    const text = rows(f).map((r) => [r.querySelector("dt")!.textContent, r.querySelector("dd")!.textContent]);
    expect(text[0]).toEqual(["Documento", "CC 1.020.456.789"]);
    expect(text[4][1]).toMatch(/12 oct\.? 2026/);
    expect(text[5][1]).toMatch(/\$\s?4\.850\.000/);
  });

  it("un dato vacío se ve como «—» y se lee «Sin dato»", () => {
    const f = mount();
    const dd = rows(f)[2].querySelector("dd")!;
    expect(dd.querySelector('[aria-hidden="true"]')!.textContent).toBe("—");
    expect(dd.querySelector(".nx-sr-only")!.textContent).toBe("Sin dato");
  });

  it("wide ocupa la fila; href es un enlace seguro; copy trae su botón", () => {
    const f = mount();
    expect(rows(f)[1].classList.contains("is-wide")).toBe(true);
    expect(rows(f)[6].querySelector("a")!.getAttribute("href")).toBe("/hcm/empleados/517");
    f.items = [{ label: "X", value: "y", href: "javascript:alert(1)" }];
    expect(f.querySelector("a")).toBeNull();
    f.items = ITEMS;
    expect(rows(f)[0].querySelector(".nx-fields__copy")!.getAttribute("aria-label")).toBe("Copiar Documento");
  });

  it("copiar escribe el valor en el portapapeles y lo avisa", async () => {
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    const f = mount();
    rows(f)[0].querySelector<HTMLButtonElement>(".nx-fields__copy")!.click();
    await Promise.resolve();
    expect(write).toHaveBeenCalledWith("CC 1.020.456.789");
    await Promise.resolve();
    expect(f.querySelector('[aria-live="polite"]')!.textContent).toBe("Copiado");
  });

  it("heading y action arman la cabecera; la acción avisa con nx-fields-action", () => {
    const f = mount('heading="Contrato" action="Editar"');
    expect(f.querySelector("h3")!.textContent).toBe("Contrato");
    const spy = vi.fn();
    f.addEventListener("nx-fields-action", (e) => spy((e as CustomEvent).detail));
    f.querySelector<HTMLButtonElement>(".nx-fields__action")!.click();
    expect(spy).toHaveBeenCalledWith({ action: "Editar" });
  });

  it("summary: franja de datos clave, sin edición", () => {
    const f = mount('variant="summary" editing');
    expect(f.querySelector("input")).toBeNull();
    expect(f.style.getPropertyValue("--_n")).toBe("4");
    expect(rows(f)[0].querySelector("dd")!.title).toBe("CC 1.020.456.789");
  });

  it("acepta items como JSON en el atributo", () => {
    document.body.innerHTML = `<nx-fields items='[{"label":"Área","value":"Nómina"}]'></nx-fields>`;
    expect(document.querySelector("dd")!.textContent).toBe("Nómina");
  });
});

describe("<nx-fields> al editar", () => {
  it("cada valor se vuelve un campo en su sitio, con name, etiqueta y el valor actual", () => {
    const f = mount("editing");
    expect(f.querySelector("dl")).toBeNull();
    const correo = input(f, "correo");
    expect(correo.type).toBe("email");
    expect(correo.value).toBe("laura.gomez@acme.co");
    expect(correo.required).toBe(true);
    expect(f.querySelector(`label[for="${correo.id}"]`)!.textContent).toContain("Correo");
    expect(f.querySelector<HTMLSelectElement>('[name="tipo"]')!.value).toBe("Término fijo");
    expect(input(f, "hasta").type).toBe("date");
    expect(input(f, "hasta").value).toBe("2026-10-12");
    expect(input(f, "salario").value).toBe("4.850.000");
  });

  it("lo que no se edita sigue como texto, con candado", () => {
    const f = mount("editing");
    expect(input(f, "doc")).toBeNull();
    expect(rows(f)[0].querySelector('[role="img"]')!.getAttribute("aria-label")).toBe("No se edita aquí");
  });

  it("values devuelve lo escrito, con montos convertidos y vacío como null", () => {
    const f = mount("editing");
    type(input(f, "salario"), "5.100.000");
    type(input(f, "fijo"), "");
    const v = f.values;
    expect(v.salario).toBe(5100000);
    expect(v.fijo).toBeNull();
    expect(v.doc).toBe("CC 1.020.456.789");
    expect(v.correo).toBe("laura.gomez@acme.co");
  });

  it("validate() marca lo obligatorio y el formato, y enfoca el primero", () => {
    const f = mount("editing");
    type(input(f, "correo"), "laura");
    type(input(f, "salario"), "mucho");
    expect(f.validate()).toBe(false);
    const correo = input(f, "correo");
    expect(correo.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(correo.getAttribute("aria-describedby")!)!.textContent).toMatch(/correo/);
    expect(f.errors.salario).toBe("Escribe solo el número.");
    expect(document.activeElement).toBe(correo);
    type(correo, "");
    expect(f.validate()).toBe(false);
    expect(f.errors.correo).toBe("Este dato es obligatorio.");
  });

  it("errors del servidor se muestran y se borran al escribir en el campo", () => {
    const f = mount("editing");
    f.errors = { correo: "Ya existe otra persona con ese correo." };
    const correo = input(f, "correo");
    expect(rows(f)[1].classList.contains("is-invalid")).toBe(true);
    type(correo, "otra@acme.co");
    expect(rows(f)[1].classList.contains("is-invalid")).toBe(false);
    expect(correo.hasAttribute("aria-invalid")).toBe(false);
  });

  it("al entrar desde el botón de la sección, el foco va al primer campo; al salir, vuelve al botón", () => {
    const f = mount('heading="Personal" action="Editar"');
    f.addEventListener("nx-fields-action", () => (f.editing = true));
    const btn = f.querySelector<HTMLButtonElement>(".nx-fields__action")!;
    btn.focus();
    btn.click();
    expect(document.activeElement).toBe(input(f, "correo"));
    expect(btn.hidden).toBe(true);
    f.editing = false;
    expect(document.activeElement).toBe(f.querySelector(".nx-fields__action"));
  });

  it("los campos sirven dentro de un <form> (FormData)", () => {
    document.body.innerHTML = '<form><nx-fields editing></nx-fields></form>';
    const f = document.querySelector("nx-fields")!;
    f.items = ITEMS;
    const data = new FormData(document.querySelector("form")!);
    expect(data.get("correo")).toBe("laura.gomez@acme.co");
    expect(data.get("doc")).toBeNull();
  });
});
