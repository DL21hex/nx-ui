import { describe, expect, it } from "vitest";
import { buildXlsx, zip } from "../src/components/grid/xlsx";
import {
  IMPORT_MESSAGES,
  autoMap,
  buildTable,
  cleanColumns,
  columnContext,
  columnLetter,
  decodeBytes,
  detectDelimiter,
  detectHeaderRow,
  excelSerialDate,
  fmtLabel,
  headerSignature,
  importValidator,
  markDuplicates,
  nameScore,
  normalizeValue,
  parseCsv,
  parseDate,
  parseNumber,
  parseServerErrors,
  parseSize,
  recallMapping,
  rememberMapping,
  rowIssues,
  toCsv,
  validateRows,
} from "../src/components/import/logic";
import type { ImportColumn } from "../src/components/import/types";
import { readXlsx } from "../src/components/import/read-xlsx";

const COLS: ImportColumn[] = cleanColumns([
  { key: "nit", label: "NIT", type: "nit", required: true, unique: true, aliases: ["nit/cc", "documento"] },
  { key: "razon", label: "Razón social", required: true },
  { key: "ciudad", label: "Ciudad", type: "option", options: [{ value: "05001", label: "Medellín" }, { value: "11001", label: "Bogotá D.C." }, { value: "76001", label: "Cali" }] },
  { key: "correo", label: "Correo", type: "email" },
  { key: "celular", label: "Teléfono móvil", type: "phone", aliases: ["celular", "cel"] },
  { key: "cupo", label: "Cupo de crédito", type: "money", min: 0 },
  { key: "alta", label: "Fecha de alta", type: "date" },
  { key: "activo", label: "Activo", type: "bool" },
]);
const ctx = (over: Partial<ReturnType<typeof columnContext>> = {}) => ({ dec: "," as const, dmy: true, points: false, ...over });
const col = (key: string) => COLS.find((c) => c.key === key)!;

describe("import: columnas", () => {
  it("limpia columns: key obligatorio y único, tipo válido, opciones como texto u objeto", () => {
    const cols = cleanColumns('[{"key":"a"},{"key":"a"},{"label":"sin key"},{"key":"b","type":"raro","options":["x",{"value":2,"label":"Dos"}]},{"key":"c","type":"number","min":"x","max":5,"required":"true"},null,3]');
    expect(cols).toEqual([
      { key: "a", label: "a", type: "text" },
      { key: "b", label: "b", type: "option", options: [{ value: "x", label: "x" }, { value: "2", label: "Dos" }] },
      { key: "c", label: "c", type: "number", min: "x", max: 5 },
    ]);
    expect(cleanColumns("no es json")).toEqual([]);
    expect(cleanColumns({ key: "a" })).toEqual([]);
    expect(cleanColumns(null)).toEqual([]);
  });

  it("columnLetter como Excel", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("fmtLabel con plural «uno|varios»", () => {
    expect(fmtLabel("1 fila|{n} filas", { n: 1 })).toBe("1 fila");
    expect(fmtLabel("1 fila|{n} filas", { n: "1.204" })).toBe("1.204 filas");
    expect(fmtLabel("Hola {x}", { x: "tú" })).toBe("Hola tú");
  });
});

describe("import: texto y CSV", () => {
  it("decodifica UTF-8 (con y sin BOM), windows-1252 y UTF-16", () => {
    const utf8 = new TextEncoder().encode("Ciudad\nBogotá");
    expect(decodeBytes(utf8)).toBe("Ciudad\nBogotá");
    expect(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe("Ciudad\nBogotá");
    // «Bogotá;Medellín» en windows-1252: á = 0xE1, í = 0xED (bytes inválidos en UTF-8).
    const cp = new Uint8Array([...new TextEncoder().encode("Bogot"), 0xe1, 0x3b, ...new TextEncoder().encode("Medell"), 0xed, 0x6e]);
    expect(decodeBytes(cp)).toBe("Bogotá;Medellín");
    // 0x80–0x9F de windows-1252: «€», «–», comillas curvas.
    expect(decodeBytes(new Uint8Array([0x80, 0x20, 0x96, 0x20, 0x93, 0x61, 0x94, 0xe9, 0x81]))).toBe("€ – “a”é\x81");
    const u16 = new Uint8Array([0xff, 0xfe, 0x41, 0, 0x09, 0, 0xe9, 0]);
    expect(decodeBytes(u16)).toBe("A\té");
  });

  it("detecta el separador por consistencia de columnas", () => {
    expect(detectDelimiter("nit;razon;cupo\n900;Acme;1.500,50\n800;Beta;2.000,00")).toBe(";");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(detectDelimiter("a|b|c\n1|2,5|3")).toBe("|");
    expect(detectDelimiter('a,b,c\n"x;y",2,3\n4,5,6')).toBe(",");
    // Un título arriba no despista.
    expect(detectDelimiter("Reporte de clientes, septiembre\n\nnit;razon;ciudad\n1;a;b\n2;c;d")).toBe(";");
    expect(detectDelimiter("solo una columna\nvalor")).toBe(",");
  });

  it("parsea comillas, comillas escapadas, saltos de línea y separadores dentro de comillas", () => {
    const text = '﻿nombre;nota;valor\r\n"Pérez; Juan";"dijo ""hola""\r\nen dos líneas";1.500\r\nAna;;\n\n"x"y;z';
    expect(parseCsv(text)).toEqual([["nombre", "nota", "valor"], ["Pérez; Juan", 'dijo "hola"\r\nen dos líneas', "1.500"], ["Ana", "", ""], [""], ["xy", "z"]]);
  });

  it("parsea bordes: vacío, una columna, sin salto final, comilla sin cerrar, \\r solo", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("a\nb\nc\n")).toEqual([["a"], ["b"], ["c"]]);
    expect(parseCsv("a,b\r1,2")).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv('a,"sin cerrar\n1,2', ",")).toEqual([["a", "sin cerrar\n1,2"]]);
    expect(parseCsv("a;b;", ";")).toEqual([["a", "b", ""]]);
  });

  it("una celda enorme no traba el parser ni los detectores", () => {
    const big = "9".repeat(2_000_000);
    const t0 = performance.now();
    const rows = parseCsv(`a;b\n${big}x;${"@".repeat(100_000)}.\n`);
    expect(rows[1][0].length).toBe(2_000_001);
    expect(parseNumber(rows[1][0])).toBeNull();
    expect(parseDate(rows[1][0])).toBeNull();
    expect(normalizeValue(rows[1][1], col("correo"), ctx())[1]).toBeTruthy();
    expect(normalizeValue(`${" ".repeat(50_000)}1`, col("celular"), ctx())[1]).toBeTruthy();
    expect(detectHeaderRow(rows)).toBe(0);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe("import: encabezados", () => {
  it("encuentra la fila de encabezados bajo títulos y filas vacías", () => {
    const rows = parseCsv("Reporte de clientes – septiembre\nGenerado el 2026-09-30\n\nNIT;Razón social;Ciudad;Cupo\n900359742-3;Acme;Medellín;1.500.000\n800123456-1;Beta;Cali;2.000.000");
    expect(detectHeaderRow(rows)).toBe(3);
    const t = buildTable(rows, 3);
    expect(t.headers).toEqual(["NIT", "Razón social", "Ciudad", "Cupo"]);
    expect(t.rows.length).toBe(2);
    expect(t.lines).toEqual([5, 6]);
  });

  it("sin encabezados (la primera fila ancha ya son datos) → −1 y columnas sin nombre", () => {
    const rows = parseCsv("900359742-3;1.500.000;2026-01-02\n800123456-1;2.000.000;2026-02-03");
    expect(detectHeaderRow(rows)).toBe(-1);
    const t = buildTable(rows, -1);
    expect(t.headers).toEqual(["", "", ""]);
    expect(t.rows.length).toBe(2);
    expect(t.lines).toEqual([1, 2]);
  });

  it("una sola columna, y columnas vacías al final que no cuentan", () => {
    expect(detectHeaderRow([["Correo"], ["a@b.co"]])).toBe(0);
    const t = buildTable(parseCsv("a;b;;;\n1;2;;;\n3;4;;;"), 0);
    expect(t.headers).toEqual(["a", "b"]);
    expect(detectHeaderRow([])).toBe(-1);
  });
});

describe("import: mapeo", () => {
  it("por nombre: label, key, alias, tildes y mayúsculas, palabras contenidas", () => {
    expect(nameScore("RAZON SOCIAL", col("razon"))).toBe(1);
    expect(nameScore("Nit/CC", col("nit"))).toBe(1);
    expect(nameScore("Celular", col("celular"))).toBe(1);
    expect(nameScore("Cupo", col("cupo"))).toBe(1);
    expect(nameScore("Cupo crédito aprobado", col("cupo"))).toBe(0.85);
    expect(nameScore("Telefono movl", col("celular"))).toBeGreaterThan(0.6);
    expect(nameScore("Observaciones", col("correo"))).toBeLessThan(0.5);
    expect(nameScore("E-mail", col("correo"))).toBeGreaterThanOrEqual(0.6);
  });

  it("asocia por nombre y por contenido (encabezados que no dicen nada), uno a uno", () => {
    const rows = parseCsv(
      [
        "Nit/CC;RAZON SOCIAL;Columna 3;;Cel;Cupo;F. alta;Columna 8;Notas",
        "900.359.742-3;Acme SAS;Medellín;ventas@acme.co;300 123 4567;$ 1.500.000;12/09/2026;sí;hola",
        "800.123.456-5;Beta Ltda;Cali;info@beta.com;311 555 0000;$ 800.000;13/09/2026;no;",
        "901.458.223-0;Gamma;Bogotá D.C.;g@gamma.co;315 000 1111;$ 0;14/09/2026;x;",
      ].join("\n"),
    );
    const t = buildTable(rows, 0);
    const m = autoMap(COLS, t);
    expect(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.index]))).toEqual({ nit: 0, razon: 1, ciudad: 2, correo: 3, celular: 4, cupo: 5, alta: 6, activo: 7 });
    expect(m.razon.by).toBe("name");
    expect(m.correo.by).toBe("content");
    expect(m.ciudad.by).toBe("content");
    expect(m.activo.by).toBe("content");
    // Uno a uno: «Notas» no se asocia a nada.
    expect(Object.values(m).map((x) => x.index)).not.toContain(8);
  });

  it("NIT por contenido solo con dígito de verificación válido", () => {
    const t = buildTable(parseCsv("A;B\n900359742-3;1\n800123456-5;2\n901458223-0;3"), 0);
    expect(autoMap([col("nit")], t).nit).toMatchObject({ index: 0, by: "content" });
    const bad = buildTable(parseCsv("A;B\n900359742-9;1\n800123456-1;2\n901458223-4;3"), 0);
    expect(autoMap([col("nit")], bad).nit.index).toBeNull();
  });

  it("recuerda el mapeo por encabezados; si el almacenamiento falla, no pasa nada", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const headers = ["Documento", "Nombre", "Municipio"];
    rememberMapping(store, "clientes", headers, { nit: 0, razon: 1, ciudad: null }, { ciudad: "05001" });
    expect(recallMapping(store, "clientes", ["documento", "NOMBRE", "Municipio"], COLS.slice(0, 3))).toEqual({ mapping: { nit: 0, razon: 1, ciudad: null }, fixed: { ciudad: "05001" } });
    expect(recallMapping(store, "clientes", ["Otro", "Nombre", "Municipio"], COLS)).toBeNull();
    expect(recallMapping(store, "otra-pantalla", headers, COLS)).toBeNull();
    expect(recallMapping(store, "", headers, COLS)).toBeNull();
    // Índices fuera de rango o repetidos se descartan.
    mem.set([...mem.keys()][0], JSON.stringify({ m: { nit: 7, razon: 1, ciudad: 1 } }));
    expect(recallMapping(store, "clientes", headers, COLS.slice(0, 3))?.mapping).toEqual({ nit: null, razon: 1, ciudad: null });
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(() => rememberMapping(broken, "x", headers, {})).not.toThrow();
    expect(recallMapping(broken, "x", headers, COLS)).toBeNull();
    expect(headerSignature(["Á", "b"])).toBe(headerSignature(["a", "B "]));
  });
});

describe("import: normalizar", () => {
  it("números en es y en, ambiguos según la columna, montos, contables y porcentajes", () => {
    expect(parseNumber("1.234,50")).toBe(1234.5);
    expect(parseNumber("1,234.50")).toBe(1234.5);
    expect(parseNumber("1.500", ",")).toBe(1500);
    expect(parseNumber("1.500", ".")).toBe(1.5);
    expect(parseNumber("1,500", ",")).toBe(1.5);
    expect(parseNumber("12.345.678")).toBe(12345678);
    expect(parseNumber("0.500", ",")).toBe(0.5);
    expect(parseNumber("$ 1.500.000")).toBe(1500000);
    expect(parseNumber("US$ 300,25")).toBe(300.25);
    expect(parseNumber("(1.200)")).toBe(-1200);
    expect(parseNumber("1.200-")).toBe(-1200);
    expect(parseNumber("-$ 50")).toBe(-50);
    expect(parseNumber("19 %")).toBe(19);
    expect(parseNumber("1.2.3,4.5")).toBeNull();
    expect(parseNumber("abc")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseNumber(42.5)).toBe(42.5);
  });

  it("el contexto de columna detecta el formato del archivo aunque el locale sea otro", () => {
    expect(columnContext(["1,234.50", "12.00", "1,000"], "es-CO").dec).toBe(".");
    expect(columnContext(["1.234,50", "12,00"], "en-US").dec).toBe(",");
    expect(columnContext(["1.500", "2.000"], "es-CO").dec).toBe(",");
    expect(columnContext(["1.500", "2.000"], "en-US").dec).toBe(".");
    expect(columnContext(["03/04/2026", "25/12/2026"], "en-US").dmy).toBe(true);
    expect(columnContext(["03/04/2026", "12/25/2026"], "es-CO").dmy).toBe(false);
    expect(columnContext(["03/04/2026"], "es-CO").dmy).toBe(true);
    expect(columnContext(["03/04/2026"], "en-US").dmy).toBe(false);
    expect(columnContext(["19", "0,5"]).points).toBe(true);
    expect(columnContext(["0,19", "0,5"]).points).toBe(false);
  });

  it("fechas: ISO, dd/mm y mm/dd, abreviadas, en palabras, años de 2 dígitos, seriales; 31/02 no existe", () => {
    expect(parseDate("2026-09-12")).toBe("2026-09-12");
    expect(parseDate("2026/9/1 10:30")).toBe("2026-09-01");
    expect(parseDate("12/09/2026", true)).toBe("2026-09-12");
    expect(parseDate("09/12/2026", false)).toBe("2026-09-12");
    expect(parseDate("12-sep-2026")).toBe("2026-09-12");
    expect(parseDate("12 de septiembre de 2026")).toBe("2026-09-12");
    expect(parseDate("3-Ago-26")).toBe("2026-08-03");
    expect(parseDate("Sep 12, 2026")).toBe("2026-09-12");
    expect(parseDate("12.09.26")).toBe("2026-09-12");
    expect(parseDate("01/02/85")).toBe("1985-02-01");
    expect(parseDate("46277")).toBe("2026-09-12");
    expect(parseDate(46277)).toBe("2026-09-12");
    expect(parseDate("31/02/2026")).toBeNull();
    expect(parseDate("29/02/2024")).toBe("2024-02-29");
    expect(parseDate("mañana")).toBeNull();
    expect(parseDate("12-foo-2026")).toBeNull();
  });

  it("seriales de Excel: 1900 con su 29 de febrero, y 1904", () => {
    expect(excelSerialDate(1)).toBe("1900-01-01");
    expect(excelSerialDate(59)).toBe("1900-02-28");
    expect(excelSerialDate(61)).toBe("1900-03-01");
    expect(excelSerialDate(45000)).toBe("2023-03-15");
    expect(excelSerialDate(45000.75)).toBe("2023-03-15");
    expect(excelSerialDate(0, true)).toBeNull();
    expect(excelSerialDate(1, true)).toBe("1904-01-02");
    expect(excelSerialDate(-1)).toBeNull();
  });

  it("cada tipo: correo, teléfono, NIT, bool, opción, porcentaje, texto", () => {
    expect(normalizeValue(" Ventas@Acme.CO ", col("correo"), ctx())).toEqual(["ventas@acme.co"]);
    expect(normalizeValue("ventasacme.co", col("correo"), ctx())[1]).toBe("No es un correo válido");
    expect(normalizeValue("+57 (300) 123-4567", col("celular"), ctx())).toEqual(["+573001234567"]);
    expect(normalizeValue("604 444 5555 ext. 12", col("celular"), ctx())).toEqual(["6044445555"]);
    expect(normalizeValue("123", col("celular"), ctx())[1]).toBeTruthy();
    expect(normalizeValue("900.359.742-3", col("nit"), ctx())).toEqual(["900359742-3"]);
    expect(normalizeValue("900.359.742-9", col("nit"), ctx())[1]).toBe("El dígito de verificación no cuadra: debería ser 3");
    expect(normalizeValue("1020345678", col("nit"), ctx())).toEqual(["1020345678"]);
    expect(normalizeValue("NIT", col("nit"), ctx())[1]).toBe("No es un NIT válido");
    for (const [v, b] of [["Sí", true], ["si", true], ["X", true], ["1", true], ["verdadero", true], ["TRUE", true], ["no", false], ["0", false], ["Falso", false]] as const) expect(normalizeValue(v, col("activo"), ctx())).toEqual([b]);
    expect(normalizeValue("quizás", col("activo"), ctx())[1]).toBe("Escribe sí o no");
    expect(normalizeValue("medellin", col("ciudad"), ctx())).toEqual(["05001"]);
    expect(normalizeValue("BOGOTÁ D.C.", col("ciudad"), ctx())).toEqual(["11001"]);
    expect(normalizeValue("76001", col("ciudad"), ctx())).toEqual(["76001"]);
    expect(normalizeValue("Pasto", col("ciudad"), ctx())[1]).toBe("No está en la lista");
    const pct = cleanColumns([{ key: "iva", type: "percent" }])[0];
    expect(normalizeValue("19%", pct, ctx())).toEqual([0.19]);
    expect(normalizeValue("0,19", pct, ctx())).toEqual([0.19]);
    expect(normalizeValue("19", pct, ctx({ points: true }))).toEqual([0.19]);
    expect(normalizeValue(0.19, pct, ctx({ points: true }))).toEqual([0.19]);
    expect(normalizeValue("  hola  ", col("razon"), ctx())).toEqual(["hola"]);
    expect(normalizeValue("", col("razon"), ctx())).toEqual([null]);
    expect(normalizeValue(undefined, col("razon"), ctx())).toEqual([null]);
  });

  it("min, max (números y fechas) y pattern", () => {
    const [n, d, p] = cleanColumns([
      { key: "n", type: "number", min: 1, max: 10 },
      { key: "d", type: "date", min: "2026-01-01", max: "2026-12-31" },
      { key: "p", pattern: "[A-Z]{3}-\\d{3}" },
    ]);
    expect(normalizeValue("0", n, ctx())[1]).toBe("Debe ser al menos 1");
    expect(normalizeValue("11", n, ctx())[1]).toBe("Debe ser como mucho 10");
    expect(normalizeValue("5", n, ctx())).toEqual([5]);
    expect(normalizeValue("31/12/2025", d, ctx())[1]).toBe("Debe ser al menos 1 ene 2026");
    expect(normalizeValue("15/06/2026", d, ctx())).toEqual(["2026-06-15"]);
    expect(normalizeValue("ABC-123", p, ctx())).toEqual(["ABC-123"]);
    expect(normalizeValue("ABC-1234", p, ctx())[1]).toBe("No tiene el formato esperado");
    // Un patrón inválido no rompe nada.
    expect(normalizeValue("x", cleanColumns([{ key: "q", pattern: "(" }])[0], ctx())).toEqual(["x"]);
  });
});

describe("import: validar", () => {
  const CSV = [
    "NIT;Razón social;Ciudad;Correo;Celular;Cupo;Fecha de alta;Activo",
    "900.359.742-3;Acme SAS;Medellín;ventas@acme.co;300 123 4567;$ 1.500.000;31/01/2026;sí",
    "800.123.456-9;Beta;Cali;beta.com;311 555 0000;$ 800.000;31/02/2026;no",
    ";;;;;;;",
    "900359742-3;Acme otra vez;Cali;a@acme.co;;$ 1.000;01/02/2026;x",
    ";Sin NIT;Cali;;;;;",
  ].join("\n");
  const t = buildTable(parseCsv(CSV), 0);
  const mapping = Object.fromEntries(COLS.map((c, i) => [c.key, i]));

  it("normaliza, marca errores por campo, repetidos y obligatorios; las vacías se omiten", () => {
    const r = validateRows(t, COLS, mapping, { locale: "es-CO" });
    expect(r).toMatchObject({ ready: 1, invalid: 3, empty: 1 });
    expect(r.checks[0].values).toEqual({ nit: "900359742-3", razon: "Acme SAS", ciudad: "05001", correo: "ventas@acme.co", celular: "3001234567", cupo: 1500000, alta: "2026-01-31", activo: true });
    expect(r.checks[1].errors).toEqual({ nit: "El dígito de verificación no cuadra: debería ser 5", correo: "No es un correo válido", alta: "No es una fecha válida" });
    expect(r.checks[1].line).toBe(3);
    expect(r.checks[2].empty).toBe(true);
    expect(r.checks[3].dup).toEqual({ nit: "Repetido: ya está en la fila 2" });
    expect(rowIssues(r.checks[4])).toEqual({ nit: "Falta este dato" });
  });

  it("revisa de nuevo una fila con lo corregido, y los repetidos siguen al archivo", () => {
    const check = importValidator(t, COLS, mapping);
    const checks = t.rows.map((_, i) => check(i));
    markDuplicates(checks, COLS);
    expect(checks[3].dup).toBeTruthy();
    checks[3] = check(3, { nit: "800.123.456-5" });
    markDuplicates(checks, COLS);
    expect(checks[3].dup).toBeUndefined();
    expect(checks[3].values.nit).toBe("800123456-5");
    checks[1] = check(1, { nit: "800123456-5", correo: "b@beta.com", alta: "28/02/2026" });
    markDuplicates(checks, COLS);
    expect(checks[1].errors).toEqual({});
    expect(checks[3].dup).toEqual({ nit: "Repetido: ya está en la fila 3" });
  });

  it("valores fijos para todas las filas, sin columna", () => {
    const m = { ...mapping, ciudad: null };
    const r = validateRows(t, COLS, m, { fixed: { ciudad: "Bogotá D.C." } });
    expect(r.checks[0].values.ciudad).toBe("11001");
    // La fila vacía sigue vacía aunque tenga un valor fijo.
    expect(r.checks[2].empty).toBe(true);
    expect(r.checks[2].errors).toEqual({});
  });

  it("mensajes traducidos", () => {
    const r = validateRows(t, COLS, mapping, { messages: { ...IMPORT_MESSAGES, required: "Required", duplicate: "Duplicate of row {line}" } });
    expect(r.checks[4].errors.nit).toBe("Required");
    expect(r.checks[3].dup?.nit).toBe("Duplicate of row 2");
  });
});
describe("import: servidor y salida", () => {
  it("errores del servidor: fila absoluta (offset + i) o relativa al lote", () => {
    expect(parseServerErrors({ errors: [{ row: 503, field: "nit", message: "NIT ya existe" }, { row: 2, message: "otra" }, { row: 9999 }, "x", { row: "1" }] }, 500, 10)).toEqual([
      { index: 3, field: "nit", message: "NIT ya existe" },
      { index: 2, field: undefined, message: "otra" },
    ]);
    expect(parseServerErrors({ errors: [{ row: 0, message: "a" }] }, 0, 5)).toEqual([{ index: 0, field: undefined, message: "a" }]);
    expect(parseServerErrors(null, 0, 5)).toEqual([]);
    expect(parseServerErrors({ ok: true }, 0, 5)).toEqual([]);
  });

  it("CSV para Excel: BOM, separador, comillas y fórmulas neutralizadas", () => {
    const csv = toCsv([["Fila", "Nombre", "Motivo"], [3, 'Pérez; "Juan"', "=HYPERLINK()"], [4, "-1200", "@x"], [5, "+57 300", " a "]], ";");
    expect(csv).toBe('﻿Fila;Nombre;Motivo\r\n3;"Pérez; ""Juan""";\'=HYPERLINK()\r\n4;-1200;\'@x\r\n5;+57 300;" a "\r\n');
    expect(toCsv([["a,b", "c"]], ",")).toBe('﻿"a,b",c\r\n');
  });

  it("tamaños: bytes, KB, MB", () => {
    expect(parseSize("20MB")).toBe(20 * 1024 * 1024);
    expect(parseSize("500 kb")).toBe(500 * 1024);
    expect(parseSize("1,5 MB")).toBe(1.5 * 1024 * 1024);
    expect(parseSize("1048576")).toBe(1048576);
    expect(parseSize(null)).toBe(20 * 1024 * 1024);
    expect(parseSize("mucho")).toBe(20 * 1024 * 1024);
    expect(parseSize("0")).toBe(20 * 1024 * 1024);
  });
});

describe("import: rendimiento", () => {
  it("50.000 filas × 15 columnas: parsear, encontrar encabezados, mapear y validar en poco tiempo", () => {
    const cols = cleanColumns([
      { key: "nit", type: "nit", unique: true },
      { key: "razon", label: "Razón social", required: true },
      { key: "correo", type: "email" },
      { key: "tel", label: "Teléfono", type: "phone" },
      { key: "cupo", type: "money" },
      { key: "alta", label: "Fecha", type: "date" },
      { key: "activo", type: "bool" },
      { key: "ciudad", type: "option", options: ["Medellín", "Cali", "Bogotá"] },
      { key: "iva", type: "percent" },
      { key: "n1", type: "number" },
      { key: "n2", type: "number" },
      { key: "t1" },
      { key: "t2" },
      { key: "t3" },
      { key: "t4" },
    ]);
    const lines = ["nit;razon;correo;tel;cupo;alta;activo;ciudad;iva;n1;n2;t1;t2;t3;t4"];
    for (let i = 0; i < 50_000; i++) lines.push(`${100000000 + i};Empresa ${i} S.A.S.;c${i}@x.co;300 ${String(i).padStart(7, "0")};$ ${String(i * 1000).replace(/\B(?=(\d{3})+$)/g, ".")};${(i % 28) + 1}/0${(i % 9) + 1}/2026;sí;Cali;19%;${i},5;${i};a;b;c;"d; ${i}"`);
    const text = lines.join("\r\n");
    const t0 = performance.now();
    const rows = parseCsv(text);
    const t = buildTable(rows, detectHeaderRow(rows));
    const m = autoMap(cols, t);
    const r = validateRows(
      t,
      cols,
      Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.index])),
      { locale: "es-CO" },
    );
    const ms = performance.now() - t0;
    expect(t.rows.length).toBe(50_000);
    expect(Object.values(m).every((x) => x.index !== null)).toBe(true);
    expect(r.ready).toBe(50_000);
    expect(r.checks[49_999].values).toMatchObject({ cupo: 49999000, iva: 0.19, n1: 49999.5, t4: "d; 49999" });
    // Holgado para una máquina cargada; en una normal tarda bastante menos (se imprime).
    console.info(`[import] 50.000 × 15 en ${Math.round(ms)} ms`);
    expect(ms).toBeLessThan(6000);
  });
});

describe("import: xlsx", () => {
  const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
  const enc = new TextEncoder();

  it("lee el .xlsx del generador de la tabla: textos, números, montos y fechas", async () => {
    const blob = await buildXlsx("Clientes", ["NIT", "Nombre", "Cupo", "Alta"], [["900359742-3", "Acme & Cía <S.A.S.>", 1500000, "2026-09-12"], [null, "Sin NIT", 0.5, null]], ["text", "text", "money", "date"], [10, 10, 10, 10]);
    const book = await readXlsx(await bytes(blob));
    expect(book.names).toEqual(["Clientes"]);
    expect(await book.sheet(0)).toEqual([
      ["NIT", "Nombre", "Cupo", "Alta"],
      ["900359742-3", "Acme & Cía <S.A.S.>", 1500000, "2026-09-12"],
      ["", "Sin NIT", 0.5],
    ]);
  });

  it("lee textos compartidos (también enriquecidos), booleanos, fórmulas, celdas saltadas, 1904, varias hojas y prefijos", async () => {
    const files: [string, string][] = [
      ["[Content_Types].xml", "<Types/>"],
      [
        "xl/workbook.xml",
        `<?xml version="1.0"?><x:workbook xmlns:x="main" xmlns:r="rel"><x:workbookPr date1904="1"/><x:sheets><x:sheet name="Vacía" sheetId="1" r:id="rId2"/><x:sheet name="Datos &amp; más" sheetId="2" r:id="rId1"/></x:sheets></x:workbook>`,
      ],
      ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="/xl/worksheets/sheet2.xml"/></Relationships>`],
      ["xl/sharedStrings.xml", `<sst><x:si><x:t>Nombre</x:t></x:si><si><r><rPr><b/></rPr><t>Bogo</t></r><r><t xml:space="preserve">tá D.C.</t></r><rPh><t>ボ</t></rPh></si><si><t>Fecha</t></si><si/><si><t>L1_x000D_\nL2</t></si></sst>`],
      ["xl/styles.xml", `<styleSheet><numFmts count="1"><numFmt numFmtId="170" formatCode="&quot;Día&quot; dd/mm/yyyy"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="170"/><xf numFmtId="4"/></cellXfs></styleSheet>`],
      [
        "xl/worksheets/sheet1.xml",
        `<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>2</v></c></row><row r="3"><c r="A3" t="s"><v>1</v></c><c r="B3" t="b"><v>1</v></c><c r="C3" s="1"><v>0</v></c><c r="D3" s="3"><v>1234.5</v></c></row><row r="4" spans="1:4"><c r="A4" t="inlineStr"><is><t>Inline &lt;ok&gt;</t></is></c><c r="B4" t="str"><f>A1&amp;"x"</f><v>Nombrex</v></c><c r="C4" s="2"><v>1</v></c><c r="G4" t="s"><v>4</v></c></row><row r="5"/></sheetData></worksheet>`,
      ],
      ["xl/worksheets/sheet2.xml", `<worksheet><sheetData/></worksheet>`],
    ];
    const blob = await zip(files.map(([name, s]) => ({ name, data: enc.encode(s) })));
    const book = await readXlsx(await bytes(blob));
    expect(book.names).toEqual(["Vacía", "Datos & más"]);
    expect(await book.sheet(0)).toEqual([]);
    expect(await book.sheet(1)).toEqual([["Nombre", "", "Fecha"], [], ["Bogotá D.C.", "true", "1904-01-01", 1234.5], ["Inline <ok>", "Nombrex", "1904-01-02", "", "", "", "L1\r\nL2"]]);
  });

  it("celdas y filas fuera de los límites de Excel (XFD, 1.048.576) se ignoran: un r=«ZZZZZZZ1» no reserva miles de millones de celdas", async () => {
    const files: [string, string][] = [
      ["xl/workbook.xml", `<workbook><sheets><sheet name="H" sheetId="1" r:id="rId1"/></sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`],
      [
        "xl/worksheets/sheet1.xml",
        `<worksheet><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="ZZZZ1"><v>2</v></c></row><row r="2000000"><c r="A2000000"><v>3</v></c></row><row r="2"><c r="XFD2"><v>4</v></c></row></sheetData></worksheet>`,
      ],
    ];
    const blob = await zip(files.map(([name, s]) => ({ name, data: enc.encode(s) })));
    const rows = await (await readXlsx(await bytes(blob))).sheet(0);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual([1]);
    expect(rows[1].length).toBe(16384);
    expect(rows[1][16383]).toBe(4);
  });

  it("un archivo que no es zip, o un zip sin libro, lanza", async () => {
    await expect(readXlsx(enc.encode("hola"))).rejects.toThrow();
    const blob = await zip([{ name: "otra.txt", data: enc.encode("x") }]);
    await expect(readXlsx(await bytes(blob))).rejects.toThrow();
  });
});
