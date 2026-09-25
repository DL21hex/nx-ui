import { describe, expect, it } from "vitest";
import { nxFormat } from "../src/core/locale";
import { canRevert, changedKeys, cleanEvents, cleanFields, cleanRecord, dayLabel, filterEvents, groupByDay, isLongText, mergeEvents, relTime, revertChange, revertedKeys, stampText, stateAt, tally, valueText, wordDiff } from "../src/components/history/logic";
import type { DiffPart } from "../src/components/history/logic";

const fmt = nxFormat("es-CO");
const FIELDS = cleanFields([
  { key: "estado", label: "Estado", type: "status", options: [{ value: "pendiente", label: "Pendiente" }, { value: "aprobada", label: "Aprobada", tone: "success" }] },
  { key: "monto", label: "Monto", type: "money", currency: "COP" },
  { key: "proveedor", label: "Proveedor" },
  { key: "entrega", label: "Entrega", type: "date" },
]);
const EVENTS = cleanEvents([
  { id: "e3", at: "2026-09-20T10:00:00", actor: { name: "Laura Gómez" }, action: "status", changes: [{ field: "estado", from: "pendiente", to: "aprobada" }] },
  { id: "e1", at: "2026-09-01T09:00:00", actor: "Andrés Ruiz", action: "create", changes: [{ field: "monto", from: null, to: 1000 }, { field: "estado", from: null, to: "pendiente" }] },
  { id: "e2", at: "2026-09-05T15:30:00", actor: { name: "Andrés Ruiz" }, action: "update", changes: [{ field: "monto", from: 1000, to: 1500 }, { field: "proveedor", from: "Aceros SAS", to: "Aceros del Caribe" }] },
]);
const RECORD = { estado: "aprobada", monto: 1500, proveedor: "Aceros del Caribe", entrega: "2026-10-01" };

/** El texto de una diferencia, marcado: [-quitado-] {+agregado+}. */
const show = (parts: DiffPart[]) => parts.map((p) => (p.op === "=" ? p.text : p.op === "-" ? `[-${p.text}-]` : `{+${p.text}+}`)).join("");

describe("cleanEvents / cleanFields / cleanRecord", () => {
  it("ordena del más viejo al más nuevo, acepta el actor como texto y descarta lo inválido", () => {
    expect(EVENTS.map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
    expect(EVENTS[0].actor).toEqual({ name: "Andrés Ruiz" });
    const out = cleanEvents([
      { id: "a", at: "no es fecha", actor: "X" },
      { id: "b", at: "2026-01-01T00:00:00", actor: {} },
      { id: 7, at: "2026-01-02T00:00:00", actor: "Y", action: "hack", changes: [{ field: "x", from: { o: 1 }, to: "ok" }, { nope: 1 }], onclick: "x" },
      { id: 7, at: "2026-01-03T00:00:00", actor: "Z" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "7", action: "update", changes: [{ field: "x", from: null, to: "ok" }] });
    expect("onclick" in out[0]).toBe(false);
  });

  it("los campos necesitan clave y etiqueta; el tipo desconocido es texto", () => {
    const f = cleanFields([{ key: "a", label: "A", type: "html" }, { key: "b" }, { key: "a", label: "Otra" }, { key: "s", label: "S", options: [{ value: 1 }, { label: "sin valor" }] }]);
    expect(f.map((x) => x.key)).toEqual(["a", "s"]);
    expect(f[0].type).toBe("text");
    expect(f[1].options).toEqual([{ value: "1", label: "1", tone: undefined }]);
  });

  it("el registro solo guarda valores simples", () => {
    expect(cleanRecord({ a: 1, b: "x", c: { d: 1 }, e: [1], f: true, g: NaN })).toEqual({ a: 1, b: "x", c: null, e: null, f: true, g: null });
    expect(cleanRecord("x")).toEqual({});
  });

  it("mergeEvents junta sin repetir y en orden", () => {
    const m = mergeEvents(EVENTS, cleanEvents([{ id: "e0", at: "2026-08-30T08:00:00", actor: "Ana" }, { id: "e2", at: "2026-09-05T15:30:00", actor: "Otro" }]));
    expect(m.map((e) => e.id)).toEqual(["e0", "e1", "e2", "e3"]);
    expect(m[2].actor.name).toBe("Otro");
  });
});

describe("stateAt: el registro como estaba", () => {
  it("deshace los cambios posteriores, del más nuevo hacia atrás", () => {
    expect(stateAt(RECORD, EVENTS, 2)).toEqual(RECORD);
    expect(stateAt(RECORD, EVENTS, 1)).toEqual({ ...RECORD, estado: "pendiente" });
    expect(stateAt(RECORD, EVENTS, 0)).toEqual({ ...RECORD, estado: "pendiente", monto: 1000, proveedor: "Aceros SAS" });
    // No toca el original.
    expect(RECORD.monto).toBe(1500);
  });

  it("un campo que cambió dos veces vuelve al valor de ese momento", () => {
    const evs = cleanEvents([
      { id: "1", at: "2026-01-01T00:00:00", actor: "A", changes: [{ field: "x", from: "a", to: "b" }] },
      { id: "2", at: "2026-01-02T00:00:00", actor: "A", changes: [{ field: "x", from: "b", to: "c" }] },
    ]);
    expect(stateAt({ x: "c" }, evs, 0).x).toBe("b");
    expect(stateAt({ x: "c" }, evs, -1).x).toBe("a");
  });

  it("changedKeys: lo que cambió desde entonces (1 y «1» son lo mismo)", () => {
    expect(changedKeys(stateAt(RECORD, EVENTS, 0), RECORD, ["estado", "monto", "proveedor", "entrega"])).toEqual(["estado", "monto", "proveedor"]);
    expect(changedKeys({ a: 1, b: null }, { a: "1", b: "" }, ["a", "b"])).toEqual([]);
  });
});

describe("revertir", () => {
  it("solo un cambio vigente, y no la creación ni un comentario", () => {
    const [create, upd, status] = EVENTS;
    expect(canRevert(RECORD, status, status.changes![0])).toBe(true);
    expect(canRevert(RECORD, upd, upd.changes![0])).toBe(true);
    expect(canRevert({ ...RECORD, monto: 2000 }, upd, upd.changes![0])).toBe(false);
    expect(canRevert(RECORD, create, create.changes![0])).toBe(false);
  });

  it("revertChange aplica el inverso y agrega el evento que lo cuenta", () => {
    const upd = EVENTS[1];
    const now = new Date("2026-09-25T12:00:00Z");
    const r = revertChange(RECORD, upd, upd.changes![1], { name: "Tú" }, now);
    expect(r.record.proveedor).toBe("Aceros SAS");
    expect(RECORD.proveedor).toBe("Aceros del Caribe");
    expect(r.event).toMatchObject({ at: now.toISOString(), action: "update", revertOf: "e2", changes: [{ field: "proveedor", from: "Aceros del Caribe", to: "Aceros SAS" }] });
    // Con la reversión en la lista, el pasado se sigue reconstruyendo bien.
    const evs = mergeEvents(EVENTS, [r.event]);
    expect(stateAt(r.record, evs, 2).proveedor).toBe("Aceros del Caribe");
    expect(stateAt(r.record, evs, 0).proveedor).toBe("Aceros SAS");
    expect(revertedKeys(evs).has("e2|proveedor")).toBe(true);
  });
});

describe("wordDiff: diferencias por palabras", () => {
  it("marca lo quitado y lo agregado, con el resto igual", () => {
    expect(show(wordDiff("Entregar en la bodega norte", "Entregar en la bodega sur"))).toBe("Entregar en la bodega [-norte-]{+sur+}");
    expect(show(wordDiff("uno dos tres", "uno tres"))).toBe("uno [-dos -]tres");
    expect(show(wordDiff("uno tres", "uno dos tres"))).toBe("uno {+dos +}tres");
  });

  it("junta un tramo cambiado en un solo «quitado → agregado» (sin palabras intercaladas)", () => {
    expect(show(wordDiff("pagar a 30 días con anticipo", "pagar a 60 días hábiles sin anticipo"))).toBe("pagar a [-30-]{+60+} días [-con-]{+hábiles sin+} anticipo");
    const parts = wordDiff("a b c d", "a x y d");
    expect(parts).toEqual([
      { op: "=", text: "a " },
      { op: "-", text: "b c" },
      { op: "+", text: "x y" },
      { op: "=", text: " d" },
    ]);
  });

  it("iguales, vacíos y textos enteros nuevos", () => {
    expect(wordDiff("igual", "igual")).toEqual([{ op: "=", text: "igual" }]);
    expect(wordDiff("", "nuevo texto")).toEqual([{ op: "+", text: "nuevo texto" }]);
    expect(wordDiff("viejo", "")).toEqual([{ op: "-", text: "viejo" }]);
  });

  it("rearmar cada lado da el texto original", () => {
    const a = "La mercancía se recibe de lunes a viernes, de 7 a 3, en la portería 2.";
    const b = "La mercancía se recibe de lunes a sábado, de 6 a 2, en la portería 4 con cita previa.";
    const d = wordDiff(a, b);
    expect(d.filter((p) => p.op !== "+").map((p) => p.text).join("")).toBe(a);
    expect(d.filter((p) => p.op !== "-").map((p) => p.text).join("")).toBe(b);
  });

  it("isLongText: solo textos largos sin opciones", () => {
    const long = { field: "nota", from: "a".repeat(60), to: "b" };
    expect(isLongText(undefined, long)).toBe(true);
    expect(isLongText(FIELDS[0], long)).toBe(false);
    expect(isLongText(undefined, { field: "x", from: "corto", to: "corto también" })).toBe(false);
  });
});

describe("valores y fechas", () => {
  it("valueText: opción, monto, fecha, número, vacío", () => {
    const [estado, monto, , entrega] = FIELDS;
    expect(valueText(estado, "aprobada", fmt)).toBe("Aprobada");
    expect(valueText(monto, 12500000, fmt)).toBe("$ 12.500.000");
    expect(valueText(entrega, "2026-10-01", fmt)).toBe("1 oct 2026");
    expect(valueText(undefined, 1234.5, fmt)).toBe("1.234,5");
    expect(valueText(undefined, null, fmt)).toBe("—");
    expect(valueText(undefined, "", fmt, "")).toBe("");
  });

  it("dayLabel: Hoy, Ayer, el día de la semana y el año si no es este", () => {
    const now = new Date(2026, 8, 25, 10, 0);
    expect(dayLabel(new Date(2026, 8, 25, 0, 5), now, "es-CO", "Hoy", "Ayer")).toBe("Hoy");
    expect(dayLabel(new Date(2026, 8, 24, 23, 59), now, "es-CO", "Hoy", "Ayer")).toBe("Ayer");
    expect(dayLabel(new Date(2026, 8, 21, 9, 0), now, "es-CO", "Hoy", "Ayer")).toBe("lunes 21 de septiembre");
    expect(dayLabel(new Date(2025, 11, 31, 9, 0), now, "es-CO", "Hoy", "Ayer")).toBe("miércoles 31 de diciembre de 2025");
  });

  it("relTime: ahora, minutos y horas; de un día para atrás, la hora", () => {
    const now = new Date(2026, 8, 25, 18, 0);
    expect(relTime(new Date(2026, 8, 25, 17, 59, 40), now, "es-CO")).toBe("ahora");
    expect(relTime(new Date(2026, 8, 25, 17, 55), now, "es-CO")).toBe("hace 5 min");
    expect(relTime(new Date(2026, 8, 25, 15, 0), now, "es-CO")).toBe("hace 3 h");
    expect(relTime(new Date(2026, 8, 23, 15, 40), now, "es-CO")).toMatch(/^3:40\sp\.\sm\.$/);
    expect(relTime(new Date(2026, 8, 23, 15, 40), now, "en-US")).toMatch(/^3:40\sPM$/);
  });

  it("stampText: día y hora sin «de»", () => {
    expect(stampText(new Date(2026, 8, 12, 15, 40), "es-CO")).toMatch(/^12 sept? 2026, 3:40\sp\.\sm\.$/);
  });

  it("groupByDay: del día más nuevo al más viejo", () => {
    const g = groupByDay(
      cleanEvents([
        { id: "1", at: new Date(2026, 8, 1, 9).toISOString(), actor: "A" },
        { id: "2", at: new Date(2026, 8, 1, 17).toISOString(), actor: "A" },
        { id: "3", at: new Date(2026, 8, 3, 8).toISOString(), actor: "A" },
      ]),
    );
    expect(g.map((d) => d.map((e) => e.id))).toEqual([["3"], ["2", "1"]]);
  });
});

describe("filtros", () => {
  it("tally: eventos por persona y por campo", () => {
    const t = tally(EVENTS);
    expect([...t.actors]).toEqual([["Andrés Ruiz", 2], ["Laura Gómez", 1]]);
    expect(t.fields.get("monto")).toBe(2);
    expect(t.fields.get("estado")).toBe(2);
  });

  it("por persona, por campo y buscando (sin tildes, en etiquetas y valores formateados)", () => {
    const ids = (f: Parameters<typeof filterEvents>[1]) => filterEvents(EVENTS, f, FIELDS, fmt).map((e) => e.id);
    expect(ids({ actor: "Andrés Ruiz" })).toEqual(["e1", "e2"]);
    expect(ids({ field: "proveedor" })).toEqual(["e2"]);
    expect(ids({ actor: "Laura Gómez", field: "monto" })).toEqual([]);
    expect(ids({ query: "laura" })).toEqual(["e3"]);
    expect(ids({ query: "aprobada" })).toEqual(["e3"]);
    expect(ids({ query: "1.500" })).toEqual(["e2"]);
    expect(ids({ query: "aceros caribe" })).toEqual(["e2"]);
    expect(ids({ query: "andres" })).toEqual(["e1", "e2"]);
  });
});
