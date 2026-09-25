import { describe, expect, it } from "vitest";
import { cleanFields, confidenceTier, extract, formatNit, inferKind, matchFields, mergeFields, nitCheckDigit, parseAmountNumber, parsePasteEvent, titleCase } from "../src/components/paste-fill/logic";
import type { PasteField, PasteKind } from "../src/components/paste-fill/types";
import { PASTE_CITIES, PASTE_SAMPLES } from "../gallery/demo-paste-fill";

/** «Hoy» fijo: viernes 25 de septiembre de 2026. */
const TODAY = new Date(2026, 8, 25);
const of = (text: string, kind: PasteKind) => extract(text, TODAY).filter((f) => f.kind === kind);
const one = (text: string, kind: PasteKind) => {
  const all = of(text, kind);
  expect(all, `${kind} en «${text}»`).toHaveLength(1);
  return all[0];
};
const values = (text: string, kind: PasteKind) => of(text, kind).map((f) => f.value);

const FORM: PasteField[] = [
  { name: "razon_social", label: "Razón social", type: "text" },
  { name: "nit", label: "NIT", type: "text" },
  { name: "ciudad", label: "Ciudad", type: "select", options: PASTE_CITIES.map(([value, label]) => ({ value, label })) },
  { name: "contacto", label: "Contacto", type: "text" },
  { name: "correo", label: "Correo", type: "email" },
  { name: "celular", label: "Celular", type: "tel" },
  { name: "pago", label: "Condiciones de pago", type: "select", options: ["Contado", "Crédito 30 días", "Crédito 60 días", "Crédito 90 días"].map((label, i) => ({ value: ["contado", "c30", "c60", "c90"][i], label })) },
  { name: "monto", label: "Monto del primer pedido", type: "text", kind: "money" },
  { name: "entrega", label: "Fecha de entrega", type: "date" },
];
const fill = (fields: PasteField[], text: string) => Object.fromEntries(matchFields(fields, text, { today: TODAY }).map((f) => [f.name, f]));

describe("nitCheckDigit", () => {
  it("calcula el dígito de verificación de la DIAN (NIT conocidos)", () => {
    expect(nitCheckDigit("890903938")).toBe(8); // Bancolombia
    expect(nitCheckDigit("899999068")).toBe(1); // Ecopetrol
    expect(nitCheckDigit("860034313")).toBe(7); // Davivienda
    expect(nitCheckDigit("890.903.938")).toBe(8);
    expect(nitCheckDigit("800123456")).toBe(5);
  });
  it("formatea con puntos de miles y el DV", () => {
    expect(formatNit("900359742", 3)).toBe("900.359.742-3");
    expect(formatNit("79845123")).toBe("79.845.123");
  });
});

describe("NIT", () => {
  it.each([
    ["NIT: 890.903.938-8", "890.903.938-8"],
    ["Nit. 890903938-8", "890.903.938-8"],
    ["N.I.T. 890 903 938 - 8", "890.903.938-8"],
    ["NIT 890.903.938 – 8", "890.903.938-8"],
    ["RUT 860.034.313-7", "860.034.313-7"],
    ["nit 8909039388", "890.903.938-8"],
  ])("«%s»", (text, nit) => {
    const f = one(text, "nit");
    expect(f.value).toBe(nit);
    expect(f.confidence).toBeGreaterThanOrEqual(0.95);
    expect(f.hint).toBeUndefined();
  });
  it("sin «NIT» pero con guion y DV que cuadra: también, con algo menos de confianza", () => {
    const f = one("Proveedor 899.999.068-1 de Bogotá", "nit");
    expect(f.value).toBe("899.999.068-1");
    expect(f.confidence).toBe(0.9);
  });
  it("sin dígito de verificación: lo calcula y lo dice", () => {
    const f = one("NIT 890.903.938", "nit");
    expect(f.value).toBe("890.903.938-8");
    expect(f.confidence).toBe(0.8);
    expect(f.hint).toBe("Sin dígito de verificación: se calculó (8)");
  });
  it("un DV que no cuadra: confianza baja y el aviso con el correcto", () => {
    const f = one("NIT 800.123.456-1", "nit");
    expect(f.value).toBe("800.123.456-1");
    expect(f.confidence).toBeLessThan(0.5);
    expect(f.hint).toBe("El dígito de verificación no cuadra: con 800.123.456 debería ser 5");
    expect(one("ref 800.123.456-1", "nit").confidence).toBeLessThan(0.5);
  });
  it("el tramo es solo el número (sin la palabra NIT)", () => {
    const text = "Nuestro NIT: 890.903.938-8.";
    const f = one(text, "nit");
    expect(text.slice(f.start, f.end)).toBe("890.903.938-8");
  });
});

describe("cédula", () => {
  it.each([
    ["C.C. 1.020.345.678", "1020345678"],
    ["CC 52.123.456", "52123456"],
    ["cédula 79845123", "79845123"],
    ["Cédula de ciudadanía No. 1.036.789.012", "1036789012"],
    ["documento: 43.567.890", "43567890"],
  ])("«%s»", (text, id) => expect(one(text, "id").value).toBe(id));
  it("el lugar de expedición casi no cuenta como la ciudad (y lo dice)", () => {
    const [issued] = of("C.C. 1.020.345.678 de Bogotá", "city");
    expect(issued).toMatchObject({ value: "Bogotá", confidence: 0.3, hint: "Es donde se expidió la cédula" });
    const text = "C.C. 1.020.345.678 de Bogotá. Vivo en Medellín";
    expect(fill([{ name: "ciudad", label: "Ciudad", type: "text" }], text).ciudad.value).toBe("Medellín");
    expect(fill([FORM[2]], text).ciudad.value).toBe("05001");
    // Si es lo único, se propone, pero para revisar.
    expect(fill([FORM[2]], "C.C. 1.020.345.678 de Bogotá").ciudad).toMatchObject({ value: "11001", confidence: 0.3, hint: "Es donde se expidió la cédula" });
  });
  it("una cédula no es un teléfono", () => {
    expect(of("C.C. 1.020.345.678", "phone")).toHaveLength(0);
  });
});

describe("teléfonos", () => {
  it.each([
    ["+57 310 456 7890", "310 456 7890"],
    ["310-456-7890", "310 456 7890"],
    ["(310) 456 7890", "310 456 7890"],
    ["3104567890", "310 456 7890"],
    ["573104567890", "310 456 7890"],
    ["+57 (310) 456-7890", "310 456 7890"],
    ["0057 310 456 7890", "310 456 7890"],
    ["310 456 78 90", "310 456 7890"],
    ["310.456.7890", "310 456 7890"],
    ["Cel: +573104567890", "310 456 7890"],
  ])("celular «%s»", (text, value) => {
    const f = one(text, "phone");
    expect(f.value).toBe(value);
    expect(f.mobile).toBe(true);
    expect(f.confidence).toBeGreaterThanOrEqual(0.95);
  });
  it.each([
    ["601 234 5678", "601 234 5678"],
    ["(601) 234 5678", "601 234 5678"],
    ["+57 604 444 5566", "604 444 5566"],
    ["6012345678", "601 234 5678"],
  ])("fijo de 10 cifras «%s»", (text, value) => {
    const f = one(text, "phone");
    expect(f.value).toBe(value);
    expect(f.mobile).toBe(false);
  });
  it.each([
    ["(1) 234 5678", "601 234 5678", "601"],
    ["(4) 444 55 66", "604 444 5566", "604"],
    ["57 2 555 1234", "602 555 1234", "602"],
    ["(05) 385 44 00", "605 385 4400", "605"],
  ])("fijo de antes de 2021 «%s»: con el indicativo nuevo", (text, value, code) => {
    const f = one(text, "phone");
    expect(f.value).toBe(value);
    expect(f.hint).toBe(`Se agregó el indicativo ${code}`);
    expect(f.confidence).toBe(0.8);
  });
  it("siete cifras sueltas solo si dice que es un teléfono, y con aviso", () => {
    const f = one("PBX: 234 5678", "phone");
    expect(f.value).toBe("234 5678");
    expect(f.hint).toBe("Sin indicativo de ciudad");
    expect(f.confidence).toBeLessThan(0.8);
    expect(of("Pedido 2345678 aprobado", "phone")).toHaveLength(0);
  });
  it("la extensión va con el número", () => {
    expect(one("PBX (605) 385 4400 ext. 112", "phone").value).toBe("605 385 4400 ext. 112");
    expect(one("601 234 5678 Ext 45", "phone").value).toBe("601 234 5678 ext. 45");
  });
  it("no confunde montos, NIT ni fechas con teléfonos", () => {
    expect(of("$ 3.104.567.890 · NIT 890.903.938-8 · 15/03/2026", "phone")).toHaveLength(0);
  });
});

describe("correos y enlaces", () => {
  it("correos, en minúscula y sin los signos que los rodean", () => {
    expect(values("Escríbanos a <Ventas@AcerosDelCaribe.com.co>.", "email")).toEqual(["ventas@acerosdelcaribe.com.co"]);
    expect(values("ana.rincon+compras@empresa.co, pedro_p@x-y.com", "email")).toEqual(["ana.rincon+compras@empresa.co", "pedro_p@x-y.com"]);
  });
  it("en un correo reenviado, los destinatarios (Para, CC) no son del proveedor", () => {
    const text = "De: Ana Rincón <ana@proveedor.co>\nPara: compras@miempresa.co\nCC: jefe@miempresa.co\nAsunto: datos";
    expect(values(text, "email")).toEqual(["ana@proveedor.co"]);
  });
  it("enlaces: con esquema y sin el punto final; www. recibe https://", () => {
    expect(values("Visítenos en www.eltornillo.com.co.", "url")).toEqual(["https://www.eltornillo.com.co"]);
    expect(values("Catálogo: https://acme.co/catalogo?p=2, gracias", "url")).toEqual(["https://acme.co/catalogo?p=2"]);
  });
});

describe("montos", () => {
  it.each([
    ["$ 1.450.000", 1450000, "COP"],
    ["$1.450.000", 1450000, "COP"],
    ["$ 1.450.000,50", 1450000.5, "COP"],
    ["$1,450,000", 1450000, "COP"],
    ["COP 3.200.000", 3200000, "COP"],
    ["1.450.000 pesos", 1450000, "COP"],
    ["1,45 millones", 1450000, "COP"],
    ["1.5 millones", 1500000, "COP"],
    ["1.450 millones", 1450000000, "COP"],
    ["2 mil millones", 2000000000, "COP"],
    ["450 mil pesos", 450000, "COP"],
    ["un millón", 1000000, "COP"],
    ["dos millones y medio", 2500000, "COP"],
    ["2 palos", 2000000, "COP"],
    ["50 lucas", 50000, "COP"],
    ["$ 2MM", 2000000, "COP"],
    ["$1,4M", 1400000, "COP"],
    ["$ 800k", 800000, "COP"],
    ["USD 300", 300, "USD"],
    ["US$ 1.200", 1200, "USD"],
    ["300 dólares", 300, "USD"],
    ["€ 50", 50, "EUR"],
    ["120 euros", 120, "EUR"],
  ])("«%s»", (text, num, currency) => {
    const f = one(text, "money");
    expect(f.num).toBe(num);
    expect(f.currency).toBe(currency);
  });
  it("un número sin moneda ni «millones» no es un monto", () => {
    for (const t of ["19 %", "40 unidades", "calibre 12", "30 m de cable", "5 k", "el 2026", "12 de marzo"]) expect(of(t, "money"), t).toHaveLength(0);
  });
  it("con «$» la confianza es más alta que con «mil» a secas", () => {
    expect(one("$ 450.000", "money").confidence).toBeGreaterThan(one("serían 450 mil", "money").confidence);
  });
  it("el tramo cubre el monto completo", () => {
    const t = "el valor es $ 18.450.000 antes de IVA";
    const f = one(t, "money");
    expect(t.slice(f.start, f.end)).toBe("$ 18.450.000");
  });
});

describe("parseAmountNumber", () => {
  it.each([
    ["1.450.000", 1450000],
    ["1,450,000", 1450000],
    ["1.450", 1450],
    ["1,45", 1.45],
    ["1.5", 1.5],
    ["1.450.000,50", 1450000.5],
    ["1,450,000.50", 1450000.5],
    ["300", 300],
  ])("%s → %d", (s, n) => expect(parseAmountNumber(s)).toBe(n));
});

describe("fechas (hoy: viernes 25 de septiembre de 2026)", () => {
  it.each([
    ["15/03/2027", "2027-03-15"],
    ["15-03-2027", "2027-03-15"],
    ["15.03.2027", "2027-03-15"],
    ["15/03/27", "2027-03-15"],
    ["2026-11-02", "2026-11-02"],
    ["15/10", "2026-10-15"],
    ["15 de octubre", "2026-10-15"],
    ["15 de octubre de 2026", "2026-10-15"],
    ["15 oct 2026", "2026-10-15"],
    ["15-oct-2026", "2026-10-15"],
    ["3 de sept.", "2026-09-03"],
    ["octubre 15, 2026", "2026-10-15"],
    ["viernes 2 de octubre", "2026-10-02"],
    ["1 de setiembre de 2027", "2027-09-01"],
  ])("«%s» → %s", (text, iso) => expect(one(text, "date").value).toBe(iso));
  it("sin año y ya pasó: el año siguiente, y lo dice", () => {
    const f = one("entrega el 15 de marzo", "date");
    expect(f.value).toBe("2027-03-15");
    expect(f.hint).toBe("Sin año: se asumió 2027");
  });
  it.each([
    ["hoy", "2026-09-25"],
    ["mañana", "2026-09-26"],
    ["pasado mañana", "2026-09-27"],
    ["el próximo viernes", "2026-10-02"],
    ["el viernes", "2026-10-02"],
    ["este viernes", "2026-09-25"],
    ["el lunes", "2026-09-28"],
    ["para el miércoles", "2026-09-30"],
    ["el otro viernes", "2026-10-09"],
    ["el martes de la próxima semana", "2026-09-29"],
    ["el viernes de la otra semana", "2026-10-02"],
    ["en 3 días", "2026-09-28"],
    ["en 8 días", "2026-10-02"],
    ["en quince días", "2026-10-09"],
    ["dentro de 2 semanas", "2026-10-09"],
    ["en un mes", "2026-10-25"],
    ["a fin de mes", "2026-09-30"],
  ])("relativa «%s» → %s", (text, iso) => {
    const f = one(text, "date");
    expect(f.value).toBe(iso);
    expect(f.hint).toBe(`Calculada desde hoy: «${text}»`);
  });
  it("«en 15 días hábiles» salta los fines de semana (y queda para revisar: los festivos no se cuentan)", () => {
    const f = one("entrega en 15 días hábiles", "date");
    expect(f.value).toBe("2026-10-16");
    expect(f.confidence).toBeLessThan(0.8);
    // Hoy es viernes: un día hábil es el lunes.
    expect(one("en 1 día hábil", "date").value).toBe("2026-09-28");
  });
  it("mes primero (03/15/2027): se entiende, pero para revisar", () => {
    const f = one("03/15/2027", "date");
    expect(f.value).toBe("2027-03-15");
    expect(f.confidence).toBeLessThan(0.8);
  });
  it("no son fechas: un horario, la hora del día, una fecha imposible", () => {
    for (const t of ["de lunes a viernes", "en la mañana", "por la mañana", "31/02/2027", "10.5", "3-5 unidades"]) expect(of(t, "date"), t).toHaveLength(0);
  });
  it("la fecha de envío de un correo y la hora de un WhatsApp no son datos", () => {
    expect(of("De: Ana <ana@x.co>\nEnviado: jueves, 24 de septiembre de 2026 4:12 p. m.\nPara: yo@y.co", "date")).toHaveLength(0);
    expect(of("[24/09/26, 9:41 a. m.] Ana: hola", "date")).toHaveLength(0);
    expect(of("24/09/2026, 9:41 - Ana: hola", "date")).toHaveLength(0);
  });
});

describe("personas, cargos y empresas", () => {
  it("el nombre tras la despedida, sin el título, y el cargo de la línea siguiente", () => {
    const text = "Quedo atento.\n\nCordialmente,\n\nIng. Pedro Pérez Gil\nGerente Comercial\nCel. 310 456 7890";
    expect(values(text, "name")).toEqual(["Pedro Pérez Gil"]);
    expect(values(text, "role")).toEqual(["Gerente Comercial"]);
  });
  it.each([
    ["Atentamente,\nCarolina Gómez Restrepo", "Carolina Gómez Restrepo"],
    ["Saludos,\nana maría rincón", "Ana María Rincón"],
    ["Gracias!\nJUAN DAVID LÓPEZ", "Juan David López"],
    ["--\nLuisa Fernanda Rojas · Compras", "Luisa Fernanda Rojas"],
    ["Saludos, Pedro Pérez", "Pedro Pérez"],
    ["Atte.\nDra. María del Pilar Ortiz", "María del Pilar Ortiz"],
  ])("despedida «%s»", (text, name) => expect(values(text, "name")).toEqual([name]));
  it("quien se presenta", () => {
    expect(values("Hola, soy Carolina Gómez de Aceros del Caribe", "name")).toEqual(["Carolina Gómez"]);
    expect(values("buenas, me llamo pedro pérez y les escribo", "name")).toEqual(["Pedro Pérez"]);
    expect(values("el contacto soy yo, jhon fredy ospina, mi cel", "name")).toEqual(["Jhon Fredy Ospina"]);
    expect(values("soy la encargada de compras", "name")).toEqual([]);
  });
  it("«Cordial saludo» al principio abre el correo: no es una despedida", () => {
    expect(values("Cordial saludo,\nLes Escribimos Hoy\npara pedir una cotización.\nGracias.\nuno\ndos\ntres", "name")).toEqual([]);
  });
  it("el remitente de un correo y el de un WhatsApp; dicho dos veces, suma confianza", () => {
    const text = "De: Ana Rincón <ana@x.co>\nPara: yo@y.co\n\nHola.\n\nAtentamente,\nAna Rincón";
    const names = of(text, "name");
    expect(names.map((n) => n.value)).toEqual(["Ana Rincón"]);
    expect(names[0].confidence).toBeGreaterThan(0.9);
    expect(values("[24/09/26, 9:41 a. m.] Jhon Fredy Ospina: buenos días", "name")).toEqual(["Jhon Fredy Ospina"]);
    // Un contacto sin agendar aparece como su número: es un teléfono, no un nombre.
    const wa = "[24/09/26, 9:41 a. m.] +57 310 4567890: buenos días";
    expect(values(wa, "name")).toEqual([]);
    expect(values(wa, "phone")).toEqual(["310 456 7890"]);
  });
  it.each([
    ["Le escribo de Aceros del Caribe S.A.S. para cotizar", "Aceros del Caribe S.A.S.", 0.9],
    ["INDUSTRIAS METÁLICAS JR SAS", "INDUSTRIAS METÁLICAS JR S.A.S.", 0.9],
    ["Ferretería El Tornillo Ltda", "Ferretería El Tornillo Ltda.", 0.9],
    ["Directora · Transportes Rivera & Cía.", "Transportes Rivera & Cía.", 0.9],
    ["Distribuidora La Rebaja S. A.", "Distribuidora La Rebaja S.A.", 0.9],
    ["le paso los datos, empaques andinos sas", "Empaques Andinos S.A.S.", 0.72],
  ])("razón social «%s»", (text, value, conf) => {
    const f = one(text, "company");
    expect(f.value).toBe(value);
    expect(f.confidence).toBe(conf);
  });
  it("«Razón social:» sin tipo de sociedad", () => {
    expect(values("Razón social: Químicos del Norte\nNIT: 890.903.938-8", "company")).toEqual(["Químicos del Norte"]);
  });
  it("una ciudad dentro de la razón social no es la ciudad", () => {
    expect(of("Cali Tornillos S.A.S.", "city")).toHaveLength(0);
  });
});

describe("direcciones y ciudades", () => {
  it.each([
    "Cra. 15 # 93-47 Of. 301",
    "Calle 12 No. 34-56",
    "Carrera 7 #71-21 Torre B",
    "Cl 80 Sur # 45-12",
    "Vía 40 # 71-197, Bodega 12",
    "Av. 68 N° 13-40 Local 2",
    "Transversal 23 bis # 5-10",
  ])("«%s»", (text) => expect(one(`Dirección de despacho ${text}, gracias`, "address").value).toBe(text));
  it("ciudades con mayúscula; en minúscula, solo las que no son otra palabra", () => {
    expect(values("Estamos en Medellín y en Itagüí", "city")).toEqual(["Medellín", "Itagüí"]);
    expect(values("despachamos desde barranquilla", "city")).toEqual(["Barranquilla"]);
    expect(values("un paisaje bello", "city")).toEqual([]);
    expect(values("Sede en Bello", "city")).toEqual(["Bello"]);
    expect(values("Bogotá D.C.", "city")).toEqual(["Bogotá"]);
  });
  it("«Ciudad:» con el nombre bien escrito", () => {
    expect(values("Ciudad: bucaramanga", "city")).toEqual(["Bucaramanga"]);
  });
});

describe("inferKind", () => {
  it.each([
    [{ name: "nit" }, "nit"],
    [{ name: "x", label: "NIT del proveedor" }, "nit"],
    [{ name: "email", type: "email" }, "email"],
    [{ name: "correoContacto" }, "email"],
    [{ name: "x", label: "Correo del contacto" }, "email"],
    [{ name: "tel", type: "tel" }, "phone"],
    [{ name: "x", label: "Teléfono de la empresa" }, "phone"],
    [{ name: "x", label: "WhatsApp" }, "phone"],
    [{ name: "x", label: "Cédula" }, "id"],
    [{ name: "x", label: "Dirección de entrega" }, "address"],
    [{ name: "monto_pedido" }, "money"],
    [{ name: "x", label: "Valor", type: "number" }, "money"],
    [{ name: "x", label: "Fecha de entrega" }, "date"],
    [{ name: "x", type: "date" }, "date"],
    [{ name: "sitio_web" }, "url"],
    [{ name: "x", label: "Ciudad" }, "city"],
    [{ name: "x", label: "Cargo" }, "role"],
    [{ name: "razon_social" }, "company"],
    [{ name: "x", label: "Nombre de la empresa" }, "company"],
    [{ name: "x", label: "Contacto" }, "name"],
    [{ name: "x", label: "Plazo (días)", type: "number" }, "number"],
    [{ name: "x", label: "Observaciones", type: "textarea" }, "text"],
    [{ name: "x", label: "Lo que sea", kind: "money" as const }, "money"],
  ])("%j → %s", (f, kind) => expect(inferKind(f)).toBe(kind));
});

describe("matchFields: los tres ejemplos de la galería", () => {
  const [correo, whatsapp, firma] = PASTE_SAMPLES.map((s) => s.text);

  it("correo formal: los nueve campos, cada uno con su tramo", () => {
    const r = fill(FORM, correo);
    expect(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]))).toEqual({
      razon_social: "Aceros del Caribe S.A.S.",
      nit: "900.359.742-3",
      ciudad: "08001",
      contacto: "Carolina Gómez Restrepo",
      correo: "cgomez@acerosdelcaribe.com.co",
      celular: "315 678 2341",
      pago: "c30",
      monto: "$ 18.450.000",
      entrega: "2026-10-02",
    });
    expect(correo.slice(r.monto.source.start, r.monto.source.end)).toBe("$ 18.450.000");
    expect(correo.slice(r.entrega.source.start, r.entrega.source.end)).toBe("el próximo viernes");
    expect(r.entrega.hint).toBe("Calculada desde hoy: «el próximo viernes»");
    // El celular es el de la firma, no el PBX.
    expect(correo.slice(r.celular.source.start, r.celular.source.end)).toBe("315 678 2341");
    for (const f of Object.values(r)) expect(f.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("WhatsApp informal: todo, y la ciudad para revisar (dice dos)", () => {
    const r = fill(FORM, whatsapp);
    expect(r.razon_social.value).toBe("Empaques Andinos S.A.S.");
    expect(r.nit.value).toBe("901.458.223-0");
    expect(r.contacto.value).toBe("Jhon Fredy Ospina");
    expect(r.celular.value).toBe("300 789 4512");
    expect(r.correo.value).toBe("jfospina@empaquesandinos.co");
    expect(r.pago.value).toBe("contado");
    expect(r.monto.value).toBe("$ 1.450.000");
    expect(r.entrega.value).toBe("2026-10-15");
    expect(r.ciudad.value).toBe("05001");
    expect(r.ciudad.confidence).toBeLessThan(0.8);
    expect(r.ciudad.hint).toBe("También aparece «Itagüí»");
  });

  it("firma con el NIT mal escrito: el NIT para revisar, con el dígito correcto en el aviso", () => {
    const r = fill(FORM, firma);
    expect(r.nit.value).toBe("800.123.456-1");
    expect(r.nit.confidence).toBeLessThan(0.8);
    expect(r.nit.hint).toContain("debería ser 5");
    expect(r.razon_social.value).toBe("Ferretería Industrial El Tornillo Ltda.");
    expect(r.contacto.value).toBe("Luisa Fernanda Rojas");
    expect(r.celular.value).toBe("311 234 5678");
    expect(r.ciudad.value).toBe("11001");
    expect(r.correo.value).toBe("lrojas@eltornillo.com.co");
    // Lo que el texto no dice queda sin tocar.
    expect(r.pago).toBeUndefined();
    expect(r.monto).toBeUndefined();
    expect(r.entrega).toBeUndefined();
  });
});

describe("matchFields: reparto", () => {
  it("celular y teléfono fijo se reparten según la etiqueta", () => {
    const r = fill(
      [
        { name: "tel", label: "Teléfono", type: "tel" },
        { name: "cel", label: "Celular", type: "tel" },
      ],
      "Cel. 310 456 7890 · PBX (601) 742 1100",
    );
    expect(r.cel.value).toBe("310 456 7890");
    expect(r.tel.value).toBe("601 742 1100");
  });
  it("el correo que nombra el campo («Correo de facturación»)", () => {
    const r = fill([{ name: "correo_fact", label: "Correo de facturación", type: "email" }], "Ventas: ana@x.co\nFacturas: facturacion@x.co");
    expect(r.correo_fact.value).toBe("facturacion@x.co");
  });
  it("con varios montos, gana el que el texto asocia al campo", () => {
    const r = fill([{ name: "total", label: "Valor total", type: "text" }], "Subtotal $ 1.000.000, IVA $ 190.000, valor total $ 1.190.000");
    expect(r.total.value).toBe("$ 1.190.000");
  });
  it("varios montos sin pista: el primero, para revisar, nombrando el otro", () => {
    const r = fill([{ name: "monto", label: "Monto", type: "text" }], "Van $ 500.000 y luego $ 700.000");
    expect(r.monto.value).toBe("$ 500.000");
    expect(r.monto.confidence).toBeLessThan(0.8);
    expect(r.monto.hint).toBe("También aparece «$ 700.000»");
  });
  it("type=number recibe el número; type=date la fecha ISO; un texto, los formatos de es-CO", () => {
    const text = "Pedido por 1,45 millones con entrega el 15/10/2026";
    const r = fill(
      [
        { name: "n", label: "Monto", type: "number" },
        { name: "t", label: "Valor", type: "text" },
        { name: "d", label: "Fecha de entrega", type: "date" },
        { name: "s", label: "Entrega", type: "text" },
      ],
      text,
    );
    expect(r.n.value).toBe("1450000");
    expect(r.d.value).toBe("2026-10-15");
    // Un mismo dato no llena dos campos: el segundo monto y la segunda fecha quedan vacíos.
    expect(r.t).toBeUndefined();
    expect(r.s).toBeUndefined();
    expect(fill([{ name: "s", label: "Entrega", type: "text" }], text).s.value).toBe("15/10/2026");
    expect(fill([{ name: "m", label: "Monto", type: "text" }], "USD 1.250,50").m.value).toBe("USD 1.250,5");
  });
  it("un campo sin tipo conocido se llena con «Etiqueta: valor»", () => {
    const r = fill(
      [
        { name: "plazo", label: "Plazo de entrega", type: "text" },
        { name: "dias", label: "Días de crédito", type: "number" },
        { name: "obs", label: "Observaciones", type: "textarea" },
      ],
      "Plazo: 8 días hábiles\nCrédito: 45 días",
    );
    expect(r.plazo.value).toBe("8 días hábiles");
    expect(r.dias.value).toBe("45");
    expect(r.obs).toBeUndefined();
  });
  it("select: por la etiqueta de la opción (sin tildes) o por «N días»", () => {
    const pago = FORM.find((f) => f.name === "pago")!;
    expect(fill([pago], "Condiciones: pago a 60 días").pago.value).toBe("c60");
    expect(fill([pago], "le pagamos de contado").pago.value).toBe("contado");
    expect(fill([pago], "Entrega en 15 días")).toEqual({});
  });
  it("una opción dentro de otro dato (un correo, una razón social) no cuenta", () => {
    const ciudad: PasteField = { name: "ciudad", label: "Ciudad", type: "select", options: [{ value: "76001", label: "Cali" }] };
    expect(fill([ciudad], "Escríbanos a ventas@cali.com")).toEqual({});
    expect(fill([ciudad], "Cali Tornillos S.A.S.")).toEqual({});
    expect(fill([ciudad], "Despachamos desde Cali").ciudad.value).toBe("76001");
  });
  it("una cotización real: firma con cargo y empresa, «+ IVA», plazo en días hábiles", () => {
    const text = `Buenas tardes Andrés, la cotización es por $4.500.000 + IVA, pago a 60 días, entrega en 15 días hábiles en nuestra bodega de Bogotá. Cualquier cosa me escribe al 320 4567890 o a ventas@quimicosdelnorte.com.

Saludos,

Mónica Arango
Asesora comercial | QUÍMICOS DEL NORTE S.A.
Tel: 604 7421100 Ext. 205`;
    const r = fill([...FORM, { name: "tel", label: "Teléfono fijo", type: "tel" }, { name: "cargo", label: "Cargo", type: "text" }], text);
    expect(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.value]))).toEqual({
      razon_social: "QUÍMICOS DEL NORTE S.A.",
      ciudad: "11001",
      contacto: "Mónica Arango",
      correo: "ventas@quimicosdelnorte.com",
      celular: "320 456 7890",
      pago: "c60",
      monto: "$ 4.500.000",
      entrega: "2026-10-16",
      tel: "604 742 1100 ext. 205",
      cargo: "Asesora comercial",
    });
  });
  it("texto vacío o sin nada reconocible: nada", () => {
    expect(matchFields(FORM, "", { today: TODAY })).toEqual([]);
    expect(matchFields(FORM, "hola, ¿cómo va todo?", { today: TODAY })).toEqual([]);
  });
});

describe("protocolo y utilidades", () => {
  it("parsePasteEvent: campos, notas, fin y basura", () => {
    expect(parsePasteEvent('{"type":"field","name":"nit","value":"900.359.742-3","confidence":98,"source":{"start":3,"end":16},"hint":"ok"}')).toEqual({ type: "field", name: "nit", value: "900.359.742-3", confidence: 0.98, source: { start: 3, end: 16 }, hint: "ok" });
    expect(parsePasteEvent('{"type":"field","name":"monto","value":1450000}')).toEqual({ type: "field", name: "monto", value: "1450000", confidence: 1, source: undefined, hint: undefined });
    expect(parsePasteEvent('{"type":"field","name":"x","value":"a","source":{"start":9,"end":2}}')!).toMatchObject({ source: undefined });
    expect(parsePasteEvent('{"type":"field","value":"a"}')).toBeNull();
    expect(parsePasteEvent('{"type":"note","message":"hola"}')).toEqual({ type: "note", message: "hola" });
    expect(parsePasteEvent('{"type":"error","message":"falló"}')).toEqual({ type: "error", message: "falló" });
    expect(parsePasteEvent('{"type":"done"}')).toEqual({ type: "done" });
    expect(parsePasteEvent("[DONE]")).toEqual({ type: "done" });
    expect(parsePasteEvent("no es json")).toBeNull();
    expect(parsePasteEvent('{"type":"otro"}')).toBeNull();
    expect(parsePasteEvent(null)).toBeNull();
  });
  it("cleanFields descarta lo que no es suyo; mergeFields enriquece por name", () => {
    const clean = cleanFields([{ name: "monto", kind: "money", evil: "<b>" }, { name: "monto" }, { kind: "email" }, "x", { name: "pago", options: ["Contado", { value: 30, label: "30 días" }, null] }, { name: "k", kind: "nope" }]);
    expect(clean).toEqual([{ name: "monto", kind: "money" }, { name: "pago", options: [{ value: "Contado", label: "Contado" }, { value: "30", label: "30 días" }] }, { name: "k" }]);
    expect(cleanFields("nope")).toEqual([]);
    expect(mergeFields([{ name: "monto", label: "Monto", type: "text" }, { name: "x", label: "X", type: "text" }], clean)).toEqual([
      { name: "monto", label: "Monto", type: "text", kind: "money" },
      { name: "x", label: "X", type: "text" },
    ]);
  });
  it("importar el componente sin DOM (SSR) no lanza", async () => {
    expect(typeof document).toBe("undefined");
    const mod = await import("../src/components/paste-fill/index");
    expect(typeof mod.NxPasteFill).toBe("function");
    expect(mod.PASTE_FILL_LABELS.zone).toBe("Pega aquí un correo, un WhatsApp o un texto…");
  });
  it("confidenceTier y titleCase", () => {
    expect(confidenceTier(0.95, 0.8)).toBe("high");
    expect(confidenceTier(0.85, 0.8)).toBe("mid");
    expect(confidenceTier(0.4, 0.8)).toBe("low");
    expect(titleCase("MARÍA DEL PILAR ORTIZ")).toBe("María del Pilar Ortiz");
  });
});
