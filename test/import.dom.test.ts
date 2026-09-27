// @vitest-environment happy-dom
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import "../src/components/import/index";
import { IMPORT_LABELS, type ImportColumnInput, type ImportDoneDetail, type NxImport } from "../src/components/import/index";
import { buildXlsx } from "../src/components/grid/xlsx";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  localStorage.clear();
});
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const COLUMNS: ImportColumnInput[] = [
  { key: "nit", label: "NIT", type: "nit", required: true, unique: true, aliases: ["nit/cc"] },
  { key: "razon", label: "Razón social", required: true },
  { key: "ciudad", label: "Ciudad", type: "option", options: [{ value: "05001", label: "Medellín" }, { value: "11001", label: "Bogotá D.C." }, { value: "76001", label: "Cali" }] },
  { key: "correo", label: "Correo", type: "email" },
  { key: "cupo", label: "Cupo de crédito", type: "money" },
  { key: "alta", label: "Fecha de alta", type: "date" },
  { key: "activo", label: "Activo", type: "bool" },
];

/** Un CSV como sale de un ERP: título arriba, `;`, montos con $, un DV malo, un correo sin @, un repetido y una fecha 31/02. */
const CSV = [
  "Reporte de clientes – septiembre",
  "",
  "Nit/CC;Razón social;Ciudad;Correo;Cupo;Fecha de alta;Activo",
  "900.359.742-3;Aceros del Caribe S.A.S.;Medellín;ventas@acerosdelcaribe.co;$ 1.500.000;12/09/2026;sí",
  "800.123.456-1;Ferretería El Tornillo;Cali;compras.eltornillo.co;$ 800.000;31/02/2026;no",
  "901.458.223-0;Empaques Andinos;Bogotá D.C.;info@empaques.co;$ 2.300.000;01/08/2026;x",
  ";;;;;;",
  "900.359.742-3;Aceros (repetido);Cali;otro@acero.co;$ 100;02/08/2026;sí",
].join("\n");

function mount(attrs = "", columns: ImportColumnInput[] | null = COLUMNS): NxImport {
  document.body.innerHTML = `<nx-import ${attrs}></nx-import>`;
  const el = document.querySelector("nx-import")!;
  if (columns) el.columns = columns;
  return el;
}
const title = (el: Element) => el.querySelector(".nx-imp__title")!.textContent;
const btn = (el: Element, act: string) => el.querySelector<HTMLButtonElement>(`.nx-imp__foot [data-act=${act}]`)!;
const status = (el: Element) => el.querySelector(".nx-imp__status")!.textContent;
const summary = (el: Element) => el.querySelector(".nx-imp__summary")?.textContent;
const nb = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ");
const sel = (el: Element, key: string) => el.querySelector<HTMLSelectElement>(`select[data-map="${key}"]`)!;
function change(t: HTMLInputElement | HTMLSelectElement, value: string | boolean) {
  if (typeof value === "boolean") (t as HTMLInputElement).checked = value;
  else t.value = value;
  t.dispatchEvent(new Event("input", { bubbles: true }));
  t.dispatchEvent(new Event("change", { bubbles: true }));
}
/** Del archivo a la revisión, con el mapeo automático. */
async function toReview(el: NxImport, csv = CSV) {
  await el.load(csv);
  btn(el, "next").click();
  btn(el, "next").click();
  await tick();
}
const fileOf = (parts: BlobPart[], name: string) => new File(parts, name);

describe("<nx-import>: paso 1, archivo", () => {
  it("empieza con la zona para soltar (un botón) y Siguiente deshabilitado", () => {
    const el = mount();
    expect(title(el)).toBe("Paso 1 de 3 · Archivo");
    const drop = el.querySelector<HTMLButtonElement>(".nx-imp__drop")!;
    expect(drop.tagName).toBe("BUTTON");
    expect(drop.textContent).toContain("Arrastra aquí el archivo o elige uno");
    expect(drop.textContent).toContain("hasta 20 MB");
    expect(btn(el, "next").disabled).toBe(true);
    expect(btn(el, "back").hidden).toBe(true);
    expect(el.state).toBe("file");
    expect(el.querySelector(".nx-imp__status")!.getAttribute("role")).toBe("status");
  });

  it("lee un texto: encuentra los encabezados bajo el título y muestra la vista previa", async () => {
    const el = mount();
    const parsed = vi.fn();
    el.addEventListener("nx-import-parsed", (e) => parsed(e.detail));
    await el.load(CSV);
    expect(el.querySelector(".nx-imp__meta")!.textContent).toBe("Texto pegado · 5 filas · 7 columnas");
    expect(el.querySelector<HTMLSelectElement>("[data-act=header]")!.value).toBe("2");
    expect(el.querySelector(".nx-imp__table--preview .is-head")!.textContent).toContain("Razón social");
    expect(parsed).toHaveBeenCalledWith(expect.objectContaining({ name: "Texto pegado", headerRow: 2, rows: 5, headers: ["Nit/CC", "Razón social", "Ciudad", "Correo", "Cupo", "Fecha de alta", "Activo"] }));
    expect(btn(el, "next").disabled).toBe(false);
    expect(el.querySelector(".nx-imp__drop strong")!.textContent).toBe("Cambiar el archivo");
  });

  it("la fila de encabezados se cambia a mano (o «Sin encabezados»)", async () => {
    const el = mount();
    await el.load(CSV);
    change(el.querySelector<HTMLSelectElement>("[data-act=header]")!, "-1");
    expect(el.querySelector(".nx-imp__meta")!.textContent).toBe("Texto pegado · 8 filas · 7 columnas");
    expect(document.activeElement).toBe(el.querySelector("[data-act=header]"));
    btn(el, "next").click();
    expect(sel(el, "nit").options[1].textContent).toBe("A · Columna 1");
    // Una fila sin datos debajo: aviso, pero el archivo se queda para elegir otra.
    btn(el, "back").click();
    change(el.querySelector<HTMLSelectElement>("[data-act=header]")!, "7");
    expect(el.querySelector(".nx-imp__error")!.textContent).toBe("El archivo solo tiene los encabezados, sin filas de datos.");
    expect(btn(el, "next").disabled).toBe(true);
    change(el.querySelector<HTMLSelectElement>("[data-act=header]")!, "2");
    expect(el.querySelector(".nx-imp__error")).toBeNull();
    expect(btn(el, "next").disabled).toBe(false);
  });

  it("un archivo en windows-1252 (el CSV de Excel) se lee con tildes", async () => {
    const el = mount();
    const bytes = new Uint8Array([...new TextEncoder().encode("Ciudad;Raz"), 0xf3, ...new TextEncoder().encode("n\nBogot"), 0xe1, 0x3b, 0x41]);
    await el.load(fileOf([bytes], "clientes.csv"));
    expect(el.querySelector(".nx-imp__meta")!.textContent).toBe("clientes.csv · 1 fila · 2 columnas");
    expect(el.querySelector(".nx-imp__table--preview")!.textContent).toContain("Bogotá");
    expect(el.querySelector(".nx-imp__table--preview")!.textContent).toContain("Razón");
  });

  it("un .xlsx se lee con el lector propio (cargado aparte)", async () => {
    const el = mount();
    const blob = await buildXlsx("Clientes", ["NIT", "Razón social", "Cupo", "Fecha de alta"], [["900359742-3", "Acme", 1500000, "2026-09-12"]], ["text", "text", "money", "date"], [10, 10, 10, 10]);
    const parsed = vi.fn();
    el.addEventListener("nx-import-parsed", (e) => parsed(e.detail));
    await el.load(fileOf([await blob.arrayBuffer()], "clientes.xlsx"));
    expect(parsed).toHaveBeenCalledWith(expect.objectContaining({ name: "clientes.xlsx", sheet: "Clientes", sheets: ["Clientes"], rows: 1 }));
    await toReviewFromLoaded(el);
    expect(el.rows).toEqual([{ nit: "900359742-3", razon: "Acme", cupo: 1500000, alta: "2026-09-12" }]);
  });

  it("pegar (Ctrl+V) lo copiado de Excel lee el texto con tabuladores", async () => {
    const el = mount();
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", { value: { getData: (t: string) => (t === "text/plain" ? "NIT\tRazón social\n900359742-3\tAcme" : "") } });
    el.querySelector(".nx-imp__drop")!.dispatchEvent(ev);
    await tick();
    expect(ev.defaultPrevented).toBe(true);
    expect(el.querySelector(".nx-imp__meta")!.textContent).toBe("Texto pegado · 1 fila · 2 columnas");
  });

  it("soltar un archivo lo lee; arrastrar texto no", async () => {
    const el = mount();
    const drag = (type: string, types: string[], files: File[] = []) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperty(ev, "dataTransfer", { value: { types, files } });
      el.dispatchEvent(ev);
      return ev;
    };
    expect(drag("dragover", ["text/plain"]).defaultPrevented).toBe(false);
    expect(drag("dragover", ["Files"]).defaultPrevented).toBe(true);
    expect(el.hasAttribute("data-drag")).toBe(true);
    drag("drop", ["Files"], [fileOf(["NIT;Razón social\n900359742-3;Acme"], "a.csv")]);
    await tick();
    expect(el.hasAttribute("data-drag")).toBe(false);
    expect(el.querySelector(".nx-imp__meta")!.textContent).toBe("a.csv · 1 fila · 2 columnas");
  });

  it("errores: vacío, solo encabezados, demasiado grande, .xls antiguo, zip roto", async () => {
    const el = mount('max-size="1KB"');
    const errors: { code: string; message: string }[] = [];
    el.addEventListener("nx-import-error", (e) => errors.push(e.detail));
    await el.load("");
    expect(el.querySelector(".nx-imp__error")!.textContent).toBe("El archivo no tiene datos.");
    expect(el.querySelector(".nx-imp__error")!.getAttribute("role")).toBe("alert");
    await el.load("NIT;Razón social\n;;\n");
    expect(el.querySelector(".nx-imp__error")!.textContent).toBe("El archivo solo tiene los encabezados, sin filas de datos.");
    await el.load(fileOf(["x".repeat(5000)], "grande.csv"));
    expect(el.querySelector(".nx-imp__error")!.textContent).toBe("El archivo pesa 5 KB; el máximo es 1 KB.");
    await el.load(fileOf([new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])], "viejo.xls"));
    expect(el.querySelector(".nx-imp__error")!.textContent).toContain(".xls antiguos");
    await el.load(fileOf([new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3])], "roto.xlsx"));
    expect(el.querySelector(".nx-imp__error")!.textContent).toContain("No se pudo leer el archivo");
    expect(errors.map((e) => e.code)).toEqual(["empty", "empty", "size", "read", "read"]);
    expect(btn(el, "next").disabled).toBe(true);
    // Un archivo bueno quita el error.
    await el.load("NIT\n900359742-3");
    expect(el.querySelector(".nx-imp__error")).toBeNull();
  });
});

async function toReviewFromLoaded(el: NxImport) {
  btn(el, "next").click();
  btn(el, "next").click();
  await tick();
}

describe("<nx-import>: paso 2, columnas", () => {
  it("asocia solo, muestra muestra y confianza, y el foco va al título del paso", async () => {
    const el = mount();
    await el.load(CSV);
    btn(el, "next").click();
    expect(title(el)).toBe("Paso 2 de 3 · Columnas");
    expect(document.activeElement).toBe(el.querySelector(".nx-imp__title"));
    expect(el.mapping).toEqual({ nit: 0, razon: 1, ciudad: 2, correo: 3, cupo: 4, alta: 5, activo: 6 });
    expect(sel(el, "correo").value).toBe("3");
    expect(sel(el, "correo").options[4].textContent).toBe("D · Correo");
    const row = el.querySelector('.nx-imp__row[data-key="nit"]')!;
    expect(row.querySelector("label")!.getAttribute("for")).toBe(sel(el, "nit").id);
    expect(row.querySelector(".nx-imp__info")!.textContent).toBe("Ej.: 900.359.742-3, 800.123.456-1, 901.458.223-0 · Por el nombre · 100 %");
    expect(sel(el, "nit").getAttribute("aria-describedby")).toContain(row.querySelector(".nx-imp__info")!.id);
    expect(sel(el, "nit").getAttribute("aria-required")).toBe("true");
    expect(btn(el, "back").hidden).toBe(false);
  });

  it("uno a uno: elegir una columna ya usada se la quita al otro campo", async () => {
    const el = mount();
    await el.load(CSV);
    btn(el, "next").click();
    change(sel(el, "razon"), "3");
    expect(el.mapping.razon).toBe(3);
    expect(el.mapping.correo).toBeNull();
    expect(sel(el, "correo").value).toBe("");
    expect(el.querySelector('.nx-imp__row[data-key="razon"] .nx-imp__info')!.textContent).toBe("Ej.: ventas@acerosdelcaribe.co, compras.eltornillo.co, info@empaques.co");
    expect(el.querySelector("[data-unused]")!.textContent).toBe("No se importan: Razón social");
  });

  it("un obligatorio sin columna no deja seguir: aviso asociado y foco", async () => {
    const el = mount();
    await el.load(CSV);
    btn(el, "next").click();
    change(sel(el, "nit"), "");
    btn(el, "next").click();
    expect(title(el)).toBe("Paso 2 de 3 · Columnas");
    const s = sel(el, "nit");
    expect(s.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(s);
    const err = document.getElementById(s.getAttribute("aria-describedby")!.split(" ")[1])!;
    expect(err.textContent).toBe("Elige la columna del archivo o un valor para todas las filas");
    change(s, "0");
    expect(s.getAttribute("aria-invalid")).toBe("false");
    btn(el, "next").click();
    await tick();
    expect(title(el)).toBe("Paso 3 de 3 · Revisión");
  });

  it("un mismo valor para todas las filas («Ciudad: Medellín para todas»), validado", async () => {
    const el = mount();
    await el.load(CSV);
    btn(el, "next").click();
    change(sel(el, "ciudad"), "fixed");
    let fixed = el.querySelector<HTMLSelectElement>('[data-fixed="ciudad"]')!;
    expect(fixed.hidden).toBe(false);
    expect(fixed.tagName).toBe("SELECT");
    btn(el, "next").click();
    fixed = el.querySelector<HTMLSelectElement>('[data-fixed="ciudad"]')!;
    expect(fixed.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(fixed);
    change(fixed, "05001");
    const mapped = vi.fn();
    el.addEventListener("nx-import-mapped", (e) => mapped(e.detail));
    btn(el, "next").click();
    await tick();
    expect(mapped).toHaveBeenCalledWith({ mapping: expect.objectContaining({ ciudad: null }), fixed: { ciudad: "05001" }, remembered: false });
    expect(el.rows.every((r) => r.ciudad === "05001")).toBe(true);
  });

  it("recuerda el mapeo para los mismos encabezados (clave `memory` o `id`)", async () => {
    let el = mount('id="clientes"');
    await el.load(CSV);
    btn(el, "next").click();
    change(sel(el, "razon"), "3");
    change(sel(el, "correo"), "1");
    btn(el, "next").click();
    await tick();
    el = mount('id="clientes"');
    await el.load(CSV);
    btn(el, "next").click();
    expect(el.querySelector(".nx-imp__note")!.textContent).toBe("Usamos el mismo orden de la última vez.");
    expect(el.mapping.razon).toBe(3);
    expect(el.mapping.correo).toBe(1);
    // Otra pantalla (otra clave) no lo hereda.
    el = mount('memory="proveedores"');
    await el.load(CSV);
    btn(el, "next").click();
    expect(el.mapping.razon).toBe(1);
    expect(el.querySelector(".nx-imp__note")?.textContent).not.toBe("Usamos el mismo orden de la última vez.");
  });

  it("sin localStorage (bloqueado) funciona igual", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const el = mount('id="x"');
    await toReview(el);
    expect(title(el)).toBe("Paso 3 de 3 · Revisión");
  });

  it("columns inválido: aviso en la consola y un mensaje en el paso de columnas", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount(`columns="no es json"`, null);
    expect(warn).toHaveBeenCalled();
    await el.load(CSV);
    btn(el, "next").click();
    expect(el.querySelector(".nx-imp__error")!.textContent).toBe("No hay campos de destino configurados (columns).");
    expect(btn(el, "next").disabled).toBe(true);
    // Con columns válido en el atributo, sale bien.
    el.setAttribute("columns", JSON.stringify([{ key: "nit", type: "nit" }]));
    expect(el.columns).toEqual([{ key: "nit", label: "nit", type: "nit" }]);
    expect(sel(el, "nit")).toBeTruthy();
  });
});

describe("<nx-import>: paso 3, revisión", () => {
  it("resume, muestra primero las filas con error (con su número de fila) y la celda editable", async () => {
    const el = mount();
    await toReview(el);
    expect(title(el)).toBe("Paso 3 de 3 · Revisión");
    expect(document.activeElement).toBe(el.querySelector(".nx-imp__title"));
    expect(summary(el)).toBe("2 filas listas · 2 con errores · 1 vacía que se omite");
    const rows = [...el.querySelectorAll(".nx-imp__table tbody tr")];
    expect(rows.map((r) => r.querySelector("th")!.textContent)).toEqual(["5", "8", "4", "6"]);
    const bad = rows[0].querySelectorAll<HTMLInputElement>("input[data-i]");
    expect([...bad].map((i) => i.dataset.key)).toEqual(["nit", "correo", "alta"]);
    const nit = bad[0];
    expect(nit.value).toBe("800.123.456-1");
    expect(nit.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(nit.getAttribute("aria-describedby")!)!.textContent).toBe("El dígito de verificación no cuadra: debería ser 5");
    expect(rows[1].querySelector("input")!.value).toBe("900.359.742-3");
    expect(rows[1].textContent).toContain("Repetido: ya está en la fila 4");
    // Las listas, normalizadas y formateadas.
    expect(nb(rows[2].textContent)).toContain("$ 1.500.000");
    expect(nb(rows[2].textContent)).toContain("12 sep");
    expect(rows[2].textContent).toContain("Sí");
    expect(btn(el, "next").textContent).toBe("Importar 2 filas");
  });

  it("corregir una celda revisa de nuevo esa fila y el foco sigue a la siguiente con error", async () => {
    const el = mount();
    await toReview(el);
    let input = el.querySelector<HTMLInputElement>('input[data-key="nit"]')!;
    input.focus();
    change(input, "800.123.456-5");
    await tick();
    // La fila sigue con otros errores (correo, fecha): el foco pasa al siguiente input que ocupó su lugar.
    expect(summary(el)).toBe("2 filas listas · 2 con errores · 1 vacía que se omite");
    expect((document.activeElement as HTMLInputElement).dataset.key).toBe("correo");
    input = document.activeElement as HTMLInputElement;
    change(input, "compras@eltornillo.co");
    await tick();
    input = document.activeElement as HTMLInputElement;
    expect(input.dataset.key).toBe("alta");
    change(input, "28/02/2026");
    await tick();
    expect(summary(el)).toBe("3 filas listas · 1 con errores · 1 vacía que se omite");
    // El repetido (fila 8) es el siguiente.
    expect((document.activeElement as HTMLInputElement).value).toBe("900.359.742-3");
    change(document.activeElement as HTMLInputElement, "890.900.608-9");
    await tick();
    expect(summary(el)).toBe("4 filas listas · 1 vacía que se omite");
    expect(el.querySelector(".nx-imp__check")).toBeNull();
    expect(btn(el, "next").textContent).toBe("Importar 4 filas");
  });

  it("con errores sin corregir no importa; «Omitir las filas con errores» sí", async () => {
    const el = mount();
    await toReview(el);
    btn(el, "next").click();
    expect(status(el)).toBe("Corrige las filas con errores o marca «Omitir las filas con errores».");
    expect(document.activeElement).toBe(el.querySelector("input[data-i]"));
    expect(el.state).toBe("review");
    const done = vi.fn();
    el.addEventListener("nx-import-done", (e) => done(e.detail));
    change(el.querySelector<HTMLInputElement>("[data-act=skip]")!, true);
    btn(el, "next").click();
    expect(el.state).toBe("done");
    const d: ImportDoneDetail = done.mock.calls[0][0];
    expect(d.rows).toEqual([
      { nit: "900359742-3", razon: "Aceros del Caribe S.A.S.", ciudad: "05001", correo: "ventas@acerosdelcaribe.co", cupo: 1500000, alta: "2026-09-12", activo: true },
      { nit: "901458223-0", razon: "Empaques Andinos", ciudad: "11001", correo: "info@empaques.co", cupo: 2300000, alta: "2026-08-01", activo: true },
    ]);
    expect(d.skipped).toEqual([
      { line: 5, reason: "El dígito de verificación no cuadra: debería ser 5; No es un correo válido; No es una fecha válida" },
      { line: 8, reason: "Repetido: ya está en la fila 4" },
    ]);
    expect(d.mapping).toEqual({ nit: 0, razon: 1, ciudad: 2, correo: 3, cupo: 4, alta: 5, activo: 6 });
    expect(title(el)).toBe("Importamos 2 filas");
    expect(document.activeElement).toBe(el.querySelector(".nx-imp__title"));
    expect(el.querySelector(".nx-imp__body")!.textContent).toContain("2 filas no entraron");
    expect(el.rows.length).toBe(2);
  });

  it("descarga un CSV (con BOM) con las filas que no entraron, lo corregido y el motivo", async () => {
    const blobs: Blob[] = [];
    const { createObjectURL, revokeObjectURL } = URL;
    URL.createObjectURL = (b: Blob) => (blobs.push(b), "blob:x");
    URL.revokeObjectURL = () => {};
    onTestFinished(() => void Object.assign(URL, { createObjectURL, revokeObjectURL }));
    // happy-dom navegaría al «blob:»; el navegador, con `download`, solo descarga.
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
    const el = mount();
    await toReview(el);
    change(el.querySelector<HTMLInputElement>('input[data-key="nit"]')!, "=1+1");
    await tick();
    change(el.querySelector<HTMLInputElement>("[data-act=skip]")!, true);
    btn(el, "next").click();
    el.querySelector<HTMLButtonElement>("[data-act=download]")!.click();
    expect(blobs.length).toBe(1);
    expect(clicked[0].download).toBe("filas-sin-importar.csv");
    expect(blobs[0].type).toBe("text/csv;charset=utf-8");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blobs[0].arrayBuffer());
    expect(text.startsWith("﻿Fila;Nit/CC;Razón social;")).toBe(true);
    expect(text).toContain("5;'=1+1;Ferretería El Tornillo;Cali;compras.eltornillo.co;$ 800.000;31/02/2026;no;\"No es un NIT válido; No es un correo válido; No es una fecha válida\"");
    expect(text).toContain("8;900.359.742-3;Aceros (repetido)");
  });

  it("con muchas filas con error pinta como mucho 200 y dice cuántas más", async () => {
    const el = mount();
    const lines = ["NIT;Razón social"];
    for (let i = 0; i < 350; i++) lines.push(`123;Empresa ${i}`);
    await toReview(el, lines.join("\n"));
    expect(el.querySelectorAll(".nx-imp__table tbody tr").length).toBe(200);
    expect(el.querySelector(".nx-imp__scroll + .nx-imp__note")!.textContent).toBe("y 150 filas más");
    expect(summary(el)).toBe("0 filas listas · 350 con errores");
  });

  it("Anterior vuelve a las columnas; reset() al paso 1", async () => {
    const el = mount();
    await toReview(el);
    btn(el, "back").click();
    expect(title(el)).toBe("Paso 2 de 3 · Columnas");
    btn(el, "back").click();
    expect(title(el)).toBe("Paso 1 de 3 · Archivo");
    expect(el.querySelector(".nx-imp__meta")).toBeTruthy();
    el.reset();
    expect(el.querySelector(".nx-imp__meta")).toBeNull();
    expect(el.state).toBe("file");
  });

  it("volver a las columnas mientras se revisa un archivo grande: la revisión vieja no repinta encima", async () => {
    const el = mount();
    const lines = ["NIT;Razón social"];
    for (let i = 0; i < 12000; i++) lines.push(`900359742-3;Empresa ${i}`);
    await el.load(lines.join("\n"));
    btn(el, "next").click();
    btn(el, "next").click();
    // Revisando por tramos: la persona vuelve y está eligiendo una columna.
    btn(el, "back").click();
    expect(title(el)).toBe("Paso 2 de 3 · Columnas");
    const s = sel(el, "correo");
    s.focus();
    for (let k = 0; k < 6; k++) await tick();
    expect(el.contains(s)).toBe(true);
    expect(document.activeElement).toBe(s);
    expect(status(el)).toBe("");
    expect(el.querySelector(".nx-imp__bar")!.hasAttribute("hidden")).toBe(true);
  });
});

describe("<nx-import>: envío al servidor", () => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  const ALL_OK = ["NIT;Razón social", "900.359.742-3;Uno", "800.123.456-5;Dos", "901.458.223-0;Tres", "890.900.608-9;Cuatro", "860.002.964-4;Cinco"].join("\n");

  it("POST en lotes {rows, offset}; lo que el servidor rechaza vuelve a la revisión y se reenvía solo eso", async () => {
    const bodies: { rows: Record<string, unknown>[]; offset: number }[] = [];
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      bodies.push(body);
      if (bodies.length === 1) return json({ errors: [{ row: 1, field: "nit", message: "NIT ya existe en el sistema" }] }, 422);
      if (bodies.length === 2) return json({ errors: [{ row: 3, message: "Cliente bloqueado" }] });
      return json({});
    });
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/api/clientes" batch="2"');
    await toReview(el, ALL_OK);
    btn(el, "next").click();
    expect(el.state).toBe("sending");
    expect(btn(el, "cancel").textContent).toBe("Cancelar");
    await tick(10);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/clientes");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(bodies.map((b) => [b.offset, b.rows.length])).toEqual([[0, 2], [2, 2], [4, 1]]);
    expect(bodies[0].rows[0]).toEqual({ nit: "900359742-3", razon: "Uno" });
    expect(el.state).toBe("review");
    expect(status(el)).toBe("El servidor rechazó 2 filas: corrígelas y vuelve a enviarlas.");
    const rows = [...el.querySelectorAll(".nx-imp__table tbody tr")];
    expect(rows.map((r) => r.querySelector("th")!.childNodes[0].textContent)).toEqual(["3", "5"]);
    expect(rows[0].textContent).toContain("NIT ya existe en el sistema");
    // Sin campo: toda la fila editable, con el mensaje en la celda del número.
    expect(rows[1].querySelectorAll("input").length).toBe(2);
    expect(document.getElementById(rows[1].querySelector("input")!.getAttribute("aria-describedby")!)!.textContent).toBe("Cliente bloqueado");
    expect(summary(el)).toBe("0 filas listas · 2 con errores");
    // Corrige una y reenvía solo esa; la otra se omite.
    change(rows[0].querySelector("input")!, "811.002.345-7");
    await tick();
    change(el.querySelector<HTMLInputElement>("[data-act=skip]")!, true);
    const done = vi.fn();
    el.addEventListener("nx-import-done", (e) => done(e.detail));
    btn(el, "next").click();
    await tick(10);
    expect(bodies[3]).toEqual({ rows: [{ nit: "811002345-7", razon: "Dos" }], offset: 0 });
    expect(el.state).toBe("done");
    expect(title(el)).toBe("Importamos 4 filas");
    expect(done.mock.calls[0][0].skipped).toEqual([{ line: 5, reason: "Cliente bloqueado" }]);
    expect(done.mock.calls[0][0].rows.map((r: Record<string, unknown>) => r.razon)).toEqual(["Uno", "Dos", "Tres", "Cinco"]);
  });

  it("cancelar aborta el envío; lo que entró queda y se puede seguir", async () => {
    let n = 0;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      if (n++ === 0) return Promise.resolve(json({}));
      return new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    });
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/api/clientes" batch="2"');
    await toReview(el, ALL_OK);
    btn(el, "next").click();
    await tick(5);
    expect(el.state).toBe("sending");
    expect(status(el)).toBe("Enviando 2 de 5…");
    expect(el.querySelector<HTMLProgressElement>(".nx-imp__bar")!.hidden).toBe(false);
    btn(el, "cancel").click();
    await tick();
    expect(el.state).toBe("review");
    expect(status(el)).toBe("Envío cancelado. Se importaron 2; puedes seguir con el resto.");
    expect(summary(el)).toBe("3 filas listas");
    expect(btn(el, "next").textContent).toBe("Importar 3 filas");
  });

  it("tras cancelar, volver a las columnas y seguir no reenvía lo que ya entró (ni lo pierde del resultado)", async () => {
    const bodies: { rows: Record<string, unknown>[] }[] = [];
    let n = 0;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      if (n++ === 0) return Promise.resolve(json({}));
      return new Promise<Response>((resolve, reject) => {
        if (n > 2) return resolve(json({}));
        init.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('endpoint="/api/clientes" batch="2"');
    await toReview(el, ALL_OK);
    btn(el, "next").click();
    await tick(5);
    btn(el, "cancel").click();
    await tick();
    expect(status(el)).toBe("Envío cancelado. Se importaron 2; puedes seguir con el resto.");
    // Anterior → Siguiente: la revisión se hace de nuevo, pero lo enviado sigue enviado.
    btn(el, "back").click();
    btn(el, "next").click();
    await tick();
    expect(summary(el)).toBe("3 filas listas");
    const done = vi.fn();
    el.addEventListener("nx-import-done", (e) => done(e.detail));
    btn(el, "next").click();
    await tick(10);
    expect(el.state).toBe("done");
    const sent = bodies.slice(0, 1).concat(bodies.slice(2)).flatMap((b) => b.rows.map((r) => r.razon));
    expect(sent).toEqual(["Uno", "Dos", "Tres", "Cuatro", "Cinco"]);
    expect(done.mock.calls[0][0].rows.map((r: Record<string, unknown>) => r.razon)).toEqual(["Uno", "Dos", "Tres", "Cuatro", "Cinco"]);
  });

  it("si el servidor falla: aviso, nx-import-error y se puede reintentar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("caído", { status: 503 })));
    const el = mount('endpoint="/api/clientes"');
    const errors = vi.fn();
    el.addEventListener("nx-import-error", (e) => errors(e.detail));
    await toReview(el, ALL_OK);
    btn(el, "next").click();
    await tick(5);
    expect(el.state).toBe("review");
    expect(status(el)).toBe("No se pudo enviar (HTTP 503). Se importaron 0; puedes reintentar el resto.");
    expect(errors).toHaveBeenCalledWith({ code: "network", message: status(el) });
    vi.stubGlobal("fetch", vi.fn(async () => json({})));
    btn(el, "next").click();
    await tick(5);
    expect(el.state).toBe("done");
  });

  it("un endpoint de otro origen no se usa (las filas no salen de la página)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('endpoint="https://otro.example/api"');
    await toReview(el, ALL_OK);
    btn(el, "next").click();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.state).toBe("done");
  });
});

describe("<nx-import>: labels, locale y disabled", () => {
  it("labels traduce la interfaz y los mensajes; locale formatea los números", async () => {
    const el = mount(`locale="en-US" labels='{"step":"Step {n} of {total} · ","stepFile":"File","stepReview":"Review","ready":"1 row ready|{n} rows ready","invalid":"1 with errors|{n} with errors","emptyRows":"1 empty row skipped|{n} empty rows skipped","required":"Required","next":"Next","count":5}'`);
    expect(title(el)).toBe("Step 1 of 3 · File");
    await toReview(el, "NIT;Razón social;Cupo;Fecha de alta\n900359742-3;Acme;1,500,000.50;09/12/2026\n;Sin NIT;2.5;");
    expect(title(el)).toBe("Step 3 of 3 · Review");
    expect(summary(el)).toBe("1 row ready · 1 with errors");
    expect(el.querySelector(".nx-imp__msg")!.textContent).toBe("Required");
    const text = nb(el.querySelector(".nx-imp__table tbody")!.textContent);
    expect(text).toContain("$ 1,500,000.5");
    expect(text).toContain("Sep 12, 2026");
    expect(el.labels.next).toBe("Next");
    expect(el.labels.back).toBe(IMPORT_LABELS.back);
  });

  it("disabled: no lee lo que se pega ni se suelta, y el cuerpo queda deshabilitado", async () => {
    const el = mount("disabled");
    expect(el.querySelector<HTMLFieldSetElement>(".nx-imp__body")!.disabled).toBe(true);
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "clipboardData", { value: { getData: () => "a;b\n1;2" } });
    el.dispatchEvent(ev);
    await tick();
    expect(ev.defaultPrevented).toBe(false);
    expect(el.querySelector(".nx-imp__meta")).toBeNull();
    el.disabled = false;
    expect(el.querySelector<HTMLFieldSetElement>(".nx-imp__body")!.disabled).toBe(false);
  });

  it("propiedades asignadas antes de definirse el elemento (framework) se aplican", async () => {
    const el = document.createElement("nx-import") as NxImport;
    el.columns = [{ key: "a" }];
    el.batch = 10;
    document.body.append(el);
    expect(el.columns).toEqual([{ key: "a", label: "a", type: "text" }]);
    expect(el.batch).toBe(10);
    expect(el.maxSize).toBe(20 * 1024 * 1024);
    el.maxSize = "5MB";
    expect(el.getAttribute("max-size")).toBe("5MB");
    expect(el.maxSize).toBe(5 * 1024 * 1024);
  });
});

describe("<nx-import>: bordes y la demo de la galería", () => {
  it("una sola columna, con saltos de línea dentro de la celda", async () => {
    const el = mount("", [{ key: "nota", label: "Nota", required: true }]);
    await toReview(el, 'Nota\n"Primera línea\nsegunda línea"\n"Otra, con coma"');
    expect(summary(el)).toBe("2 filas listas");
    expect(el.rows).toEqual([{ nota: "Primera línea\nsegunda línea" }, { nota: "Otra, con coma" }]);
  });

  it("los archivos de ejemplo y el servidor de mentira de la galería", async () => {
    const { IMPORT_COLUMNS, sampleCsv, sampleXlsx } = await import("../gallery/demo-import");
    const { demoFetch } = await import("../gallery/demo-api");
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => demoFetch(input, init) ?? Promise.reject(new Error("sin ruta")));
    const el = mount('endpoint="/demo/import/clientes"', IMPORT_COLUMNS);
    await el.load(new File([sampleCsv() as BlobPart], "clientes-septiembre.csv"));
    expect(el.querySelector(".nx-imp__meta")!.textContent).toBe("clientes-septiembre.csv · 24 filas · 8 columnas");
    expect(el.querySelector<HTMLSelectElement>("[data-act=header]")!.value).toBe("2");
    expect(el.querySelector(".nx-imp__table--preview")!.textContent).toContain("Reporte de clientes – septiembre 2026");
    btn(el, "next").click();
    expect(Object.values(el.mapping).every((v) => v !== null)).toBe(true);
    btn(el, "next").click();
    await tick();
    expect(summary(el)).toBe("20 filas listas · 4 con errores");
    const bad = [...el.querySelectorAll(".nx-imp__table tbody tr[data-bad]")].map((r) => r.querySelector(".nx-imp__msg")!.textContent);
    expect(bad).toEqual([expect.stringContaining("dígito de verificación"), "No es un correo válido", expect.stringContaining("Repetido"), "No es una fecha válida"]);
    change(el.querySelector<HTMLInputElement>("[data-act=skip]")!, true);
    btn(el, "next").click();
    await tick(600);
    expect(el.state).toBe("review");
    expect(status(el)).toBe("El servidor rechazó 2 filas: corrígelas y vuelve a enviarlas.");
    expect(el.querySelectorAll(".nx-imp__table tbody tr").length).toBe(6);
    expect(el.querySelector(".nx-imp__table")!.textContent).toContain("NIT ya existe en el sistema");

    // El .xlsx, con otros nombres de columna: alias y contenido.
    el.reset();
    await el.load(new File([await sampleXlsx()], "maestro-clientes.xlsx"));
    btn(el, "next").click();
    expect(el.mapping).toEqual({ nit: 0, razon_social: 1, ciudad: 2, correo: 3, telefono: 4, cupo: 5, alta: 6, activo: 7 });
    expect(el.querySelector('.nx-imp__row[data-key="ciudad"] .nx-imp__info')!.textContent).toContain("Por el contenido");
  });
});
