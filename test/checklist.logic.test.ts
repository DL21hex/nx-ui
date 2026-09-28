import { describe, expect, it } from "vitest";
import {
  checklistAgo,
  checklistBlocks,
  checklistDeps,
  checklistDueText,
  checklistDueTime,
  checklistInRange,
  checklistLogFromState,
  checklistMissing,
  checklistNeedsNote,
  checklistNumber,
  checklistOptions,
  checklistOverdue,
  checklistParseNumber,
  checklistProgress,
  cleanChecklistItems,
  cleanChecklistLog,
  cleanChecklistState,
  cleanChecklistSteps,
  sortChecklistItems,
} from "../src/components/checklist/logic";
import { CHECKLIST_LABELS } from "../src/components/checklist/checklist";
import type { ChecklistEvidence, ChecklistState, ChecklistStep } from "../src/components/checklist/types";

const nb = (s: string) => s.replace(/[  ]/g, " ");
/** Una fecha local como la escribe un backend sin zona: «2026-09-28T17:00». */
const local = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();
const isoLocal = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const steps = (...ids: string[]): ChecklistStep[] => ids.map((id) => ({ id, title: id.toUpperCase() }));
const done = (...ids: string[]): ChecklistState => Object.fromEntries(ids.map((id) => [id, { status: "done" as const }]));

describe("limpieza de lo que llega", () => {
  it("pasos: JSON en texto, ids únicos (también numéricos), sin título fuera, agrupados por sección en orden de aparición", () => {
    const s = cleanChecklistSteps(
      JSON.stringify([
        { id: "a", title: "Placa", section: "Llegada" },
        { id: 2, title: "Contar", section: "Conteo", dependsOn: ["a", 7, null] },
        { id: "c", title: "Camión", section: "Llegada", required: false, canSkip: true },
        { id: "a", title: "Duplicado" },
        { id: "d" },
        { title: "sin id" },
        null,
        "x",
        { id: "e", title: "Suelto" },
      ]),
    );
    expect(s.map((x) => x.id)).toEqual(["a", "c", "2", "e"]);
    expect(s[1]).toEqual({ id: "c", title: "Camión", section: "Llegada", required: false, canSkip: true });
    expect(s[2].dependsOn).toEqual(["a", "7"]);
    expect("hint" in s[0]).toBe(false);
    expect(cleanChecklistSteps("{roto")).toEqual([]);
    expect(cleanChecklistSteps({ id: "a" })).toEqual([]);
    expect(cleanChecklistSteps(null)).toEqual([]);
  });

  it("evidencia: solo tipos conocidos, números finitos, `count` entero ≥ 0, opciones normalizadas", () => {
    const [s] = cleanChecklistSteps([
      {
        id: "x",
        title: "X",
        evidence: [
          { type: "photo", count: 2.7, label: "Fotos" },
          { type: "video" },
          { type: "number", min: 2, max: "8", unit: "°C" },
          { type: "choice", options: ["Conforme", { value: "nc", label: "No conforme" }, { label: "Con novedad", note: true }, { value: "" }, 5] },
          { type: "note", required: false },
          "photo",
        ],
      },
    ]);
    expect(s.evidence!.map((e) => e.type)).toEqual(["photo", "number", "choice", "note"]);
    expect(s.evidence![0].count).toBe(2);
    expect(s.evidence![1]).toEqual({ type: "number", min: 2, unit: "°C" });
    expect(s.evidence![2].options).toEqual([
      { value: "Conforme", label: "Conforme", note: false },
      { value: "nc", label: "No conforme", note: true },
      { value: "Con novedad", label: "Con novedad", note: true },
    ]);
    expect(s.evidence![3].required).toBe(false);
  });

  it("«No conforme» exige nota sin decirlo (sin tildes ni mayúsculas); `note: false` lo apaga", () => {
    const o = checklistOptions({ type: "choice", options: ["NO CONFORME", "No conformé", { value: "x", label: "No conforme", note: false }, "Conforme"] });
    expect(o.map((x) => x.note)).toEqual([true, true, false, false]);
  });

  it("estado: por id o como lista; estados desconocidos y basura fuera", () => {
    const st = cleanChecklistState({
      a: { status: "done", by: { id: 7, name: "Laura Gómez" }, at: "2026-09-28T10:00:00Z", evidence: [{ type: "photo", files: [{ name: "a.jpg", size: 10, url: "/f/1" }, { size: 3 }] }, { type: "x" }] },
      b: { status: "hecho" },
      c: "done",
      d: { status: "skipped", reason: "No aplica", by: { name: "" } },
    });
    expect(Object.keys(st)).toEqual(["a", "d"]);
    expect(st.a.by).toEqual({ id: "7", name: "Laura Gómez" });
    expect(st.a.evidence).toEqual([{ type: "photo", files: [{ name: "a.jpg", size: 10, url: "/f/1" }] }]);
    expect(st.d).toEqual({ status: "skipped", reason: "No aplica" });
    expect(cleanChecklistState([{ id: "a", status: "todo" }, { status: "done" }, { id: 3, status: "blocked", reason: "Falta la remisión" }])).toEqual({ a: { status: "todo" }, 3: { status: "blocked", reason: "Falta la remisión" } });
    expect(cleanChecklistState("{roto")).toEqual({});
  });

  it("bitácora e ítems del resumen", () => {
    expect(cleanChecklistLog([{ action: "done", step: "a", at: "2026-09-28T10:00:00Z", by: { name: "Laura" } }, { action: "borró", at: "x" }, { action: "done" }])).toEqual([{ action: "done", step: "a", at: "2026-09-28T10:00:00Z", by: { name: "Laura" } }]);
    expect(cleanChecklistItems([{ id: "c", title: "Cierre", done: 30, total: 24, overdue: -1 }, { title: "" }, { title: "Caja", done: 1 }])).toEqual([
      { id: "c", title: "Cierre", done: 24, total: 24, overdue: 0 },
      { id: "1", title: "Caja", done: 0, total: 0, overdue: 0 },
    ]);
  });

  it("la bitácora que se deduce del estado va en orden de hora", () => {
    const s = steps("a", "b", "c");
    const log = checklistLogFromState(s, { a: { status: "done", at: "2026-09-28T12:00:00Z" }, b: { status: "skipped", at: "2026-09-28T09:00:00Z", reason: "No aplica" }, c: { status: "todo", at: "2026-09-28T13:00:00Z" } });
    expect(log.map((e) => [e.action, e.step])).toEqual([
      ["skipped", "b"],
      ["done", "a"],
    ]);
  });
});

describe("avance y vencidos", () => {
  const S: ChecklistStep[] = [
    { id: "a", title: "A" },
    { id: "b", title: "B", required: false },
    { id: "c", title: "C", canSkip: true },
    { id: "d", title: "D" },
  ];
  it("hechos y omitidos cuentan; los opcionales no son necesarios para completar", () => {
    expect(checklistProgress(S, {})).toMatchObject({ done: 0, total: 4, required: 3, requiredDone: 0, complete: false });
    const st: ChecklistState = { a: { status: "done" }, c: { status: "skipped" }, d: { status: "blocked" } };
    expect(checklistProgress(S, st)).toMatchObject({ done: 2, skipped: 1, requiredDone: 2, complete: false });
    st.d = { status: "done" };
    expect(checklistProgress(S, st)).toMatchObject({ done: 3, requiredDone: 3, complete: true });
    expect(checklistProgress([], {}).complete).toBe(false);
    expect(checklistProgress([{ id: "x", title: "X", required: false }], {}).complete).toBe(false);
  });

  it("vencidos: con hora local, con zona, o solo el día (vence al terminar el día local)", () => {
    const now = local(2026, 9, 28, 15, 0);
    const mk = (due: string): ChecklistStep => ({ id: due, title: due, due });
    expect(checklistOverdue(mk("2026-09-28"), undefined, now)).toBe(false);
    expect(checklistOverdue(mk("2026-09-27"), undefined, now)).toBe(true);
    expect(checklistOverdue(mk(isoLocal(local(2026, 9, 28, 14, 59))), undefined, now)).toBe(true);
    expect(checklistOverdue(mk(isoLocal(local(2026, 9, 28, 17, 0))), undefined, now)).toBe(false);
    expect(checklistOverdue(mk(new Date(now - 60_000).toISOString()), undefined, now)).toBe(true);
    // Hecho u omitido ya no vence; sin fecha o con basura, tampoco.
    expect(checklistOverdue(mk("2026-09-27"), { status: "done" }, now)).toBe(false);
    expect(checklistOverdue(mk("2026-09-27"), { status: "skipped" }, now)).toBe(false);
    expect(checklistOverdue({ id: "x", title: "x" }, undefined, now)).toBe(false);
    expect(checklistOverdue(mk("mañana"), undefined, now)).toBe(false);
    expect(checklistDueTime("2026-09-28")).toBe(local(2026, 9, 28, 23, 59) + 59_999);
    expect(checklistDueTime(" ")).toBe(null);
    const p = checklistProgress([mk("2026-09-27"), mk("2026-09-28"), mk(isoLocal(local(2026, 9, 28, 8)))], {}, now);
    expect(p.overdue).toBe(2);
  });

  it("texto del vencimiento: hoy, mañana, ayer (con hora), o el día", () => {
    const now = local(2026, 9, 28, 15, 0);
    const t = (due: string) => {
      const r = checklistDueText(due, now, "es-CO", CHECKLIST_LABELS)!;
      return [nb(r.text), r.late];
    };
    expect(t(isoLocal(local(2026, 9, 28, 17, 0)))).toEqual(["vence hoy 5:00 p. m.", false]);
    expect(t(isoLocal(local(2026, 9, 28, 8, 30)))).toEqual(["venció hoy 8:30 a. m.", true]);
    expect(t(isoLocal(local(2026, 9, 29, 9, 0)))).toEqual(["vence mañana 9:00 a. m.", false]);
    expect(t(isoLocal(local(2026, 9, 27, 9, 0)))).toEqual(["venció ayer 9:00 a. m.", true]);
    expect(t("2026-09-28")).toEqual(["vence hoy", false]);
    expect(t("2026-10-03")).toEqual(["vence 3 oct", false]);
    expect(t("2027-01-15")).toEqual(["vence 15 ene 2027", false]);
    expect(checklistDueText(undefined, now, "es-CO", CHECKLIST_LABELS)).toBe(null);
    const en = checklistDueText(isoLocal(local(2026, 9, 28, 17, 0)), now, "en-US", { ...CHECKLIST_LABELS, due: "due {when}", today: "today" })!;
    expect(nb(en.text)).toBe("due today 5:00 PM");
  });

  it("hace cuánto", () => {
    const now = local(2026, 9, 28, 15, 0);
    const ago = (ms: number) => nb(checklistAgo(new Date(now - ms).toISOString(), now, "es-CO"));
    expect(ago(10_000)).toBe("ahora");
    expect(ago(5 * 60_000)).toBe("hace 5 min");
    expect(ago(2 * 3600_000)).toBe("hace 2 h");
    expect(ago(20 * 3600_000)).toBe("ayer");
    expect(ago(3 * 86400_000)).toBe("hace 3 días");
    expect(ago(20 * 86400_000)).toBe("8 sept");
    expect(checklistAgo(undefined, now, "es-CO")).toBe("");
    expect(checklistAgo("basura", now, "es-CO")).toBe("");
  });
});

describe("orden: dependencias y secuencia", () => {
  it("dependencias en cadena: cada uno espera al anterior; hecho u omitido libera", () => {
    const s: ChecklistStep[] = [
      { id: "a", title: "A" },
      { id: "b", title: "B", dependsOn: ["a"] },
      { id: "c", title: "C", dependsOn: ["b", "a"] },
    ];
    expect([...checklistBlocks(s, {})]).toEqual([
      ["b", "a"],
      ["c", "b"],
    ]);
    expect([...checklistBlocks(s, { a: { status: "skipped" } })]).toEqual([["c", "b"]]);
    expect([...checklistBlocks(s, done("a", "b"))]).toEqual([]);
    // Un paso hecho no se bloquea aunque su dependencia se reabra.
    expect(checklistBlocks(s, { b: { status: "done" } }).has("b")).toBe(false);
  });

  it("ciclos: se rompen (quedan libres) y nada se cuelga; dependencias desconocidas o propias se ignoran", () => {
    const s: ChecklistStep[] = [
      { id: "a", title: "A", dependsOn: ["b"] },
      { id: "b", title: "B", dependsOn: ["a"] },
      { id: "c", title: "C", dependsOn: ["d"] },
      { id: "d", title: "D", dependsOn: ["e"] },
      { id: "e", title: "E", dependsOn: ["c"] },
      { id: "f", title: "F", dependsOn: ["f", "zz", "a"] },
    ];
    const { deps, cycles } = checklistDeps(s);
    expect(cycles.sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(deps.get("a")).toEqual([]);
    expect(deps.get("f")).toEqual(["a"]);
    expect([...checklistBlocks(s, {})]).toEqual([["f", "a"]]);
    // Un paso entre dos ciclos no está en ninguno: conserva su dependencia (y el de abajo, la suya).
    const between: ChecklistStep[] = [
      { id: "a", title: "A", dependsOn: ["b"] },
      { id: "b", title: "B", dependsOn: ["a"] },
      { id: "x", title: "X", dependsOn: ["b"] },
      { id: "c", title: "C", dependsOn: ["x", "d"] },
      { id: "d", title: "D", dependsOn: ["c"] },
    ];
    const r = checklistDeps(between);
    expect(r.cycles).toEqual(["a", "b", "c", "d"]);
    expect([r.deps.get("x"), r.deps.get("c"), r.deps.get("d")]).toEqual([["b"], ["x"], []]);
  });

  it("`sequential`: todo el procedimiento, o solo algunas secciones; los opcionales no detienen a nadie", () => {
    const s: ChecklistStep[] = [
      { id: "l1", title: "Placa", section: "Llegada" },
      { id: "l2", title: "Foto", section: "Llegada" },
      { id: "c1", title: "Descargar", section: "Conteo" },
      { id: "c2", title: "Novedades", section: "Conteo", required: false },
      { id: "c3", title: "Contar", section: "Conteo" },
      { id: "k1", title: "Firma", section: "Cierre" },
    ];
    expect([...checklistBlocks(s, {}, true)]).toEqual([
      ["l2", "l1"],
      ["c1", "l1"],
      ["c2", "l1"],
      ["c3", "l1"],
      ["k1", "l1"],
    ]);
    expect([...checklistBlocks(s, {}, ["Conteo"])]).toEqual([
      ["c2", "c1"],
      ["c3", "c1"],
    ]);
    // c2 (opcional) sin hacer no bloquea a c3.
    expect([...checklistBlocks(s, done("c1"), ["Conteo"])]).toEqual([]);
    expect([...checklistBlocks(s, { c1: { status: "skipped" } }, ["Conteo"])]).toEqual([]);
    expect([...checklistBlocks(s, {}, false)]).toEqual([]);
  });

  it("bloqueado por el servidor: `\"\"` (sin paso que lo detenga)", () => {
    expect([...checklistBlocks(steps("a"), { a: { status: "blocked", reason: "Falta la remisión" } })]).toEqual([["a", ""]]);
  });

  it("300 pasos (y 30 000) en cadena y en secuencia: lineal", () => {
    const chain = (n: number): ChecklistStep[] => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: `Paso ${i}`, section: `Sección ${Math.floor(i / 25)}`, due: "2020-01-01", dependsOn: i ? [`s${i - 1}`] : [] }));
    const state = (n: number): ChecklistState => Object.fromEntries(Array.from({ length: n / 2 }, (_, i) => [`s${i}`, { status: "done" as const }]));
    const run = (n: number) => {
      const s = chain(n);
      const st = state(n);
      const t0 = performance.now();
      const b = checklistBlocks(s, st, true);
      const p = checklistProgress(s, st);
      return { ms: performance.now() - t0, blocked: b.size, p };
    };
    const small = run(300);
    expect(small.blocked).toBe(149);
    expect(small.p).toMatchObject({ done: 150, total: 300, overdue: 150 });
    const big = run(30_000);
    expect(big.blocked).toBe(14_999);
    expect(big.ms).toBeLessThan(1500);
    // Un ciclo de 30 000 tampoco cuelga.
    const ring = chain(30_000);
    ring[0].dependsOn = ["s29999"];
    expect(checklistDeps(ring).cycles.length).toBe(30_000);
  });
});

describe("evidencia", () => {
  const step = (evidence: ChecklistStep["evidence"]): ChecklistStep => ({ id: "x", title: "X", evidence });
  const miss = (s: ChecklistStep, ev: (ChecklistEvidence | undefined)[], note = "") => checklistMissing(s, ev, note);

  it("rango inclusive; sin número → null", () => {
    expect(checklistInRange(2, { min: 2, max: 8 })).toBe(true);
    expect(checklistInRange(8.01, { min: 2, max: 8 })).toBe(false);
    expect(checklistInRange(-1, { min: 0 })).toBe(false);
    expect(checklistInRange(1e9, { min: 0 })).toBe(true);
    expect(checklistInRange(null, { min: 0 })).toBe(null);
    expect(checklistInRange(NaN, {})).toBe(null);
  });

  it("fotos: `count` como mínimo (y cuántas faltan); archivos, firma, nota, número y opción", () => {
    const s = step([{ type: "photo", count: 2, label: "Novedades" }, { type: "file" }, { type: "signature" }, { type: "note" }, { type: "number" }, { type: "choice", options: ["Sí", "No"] }]);
    const r = miss(s, []);
    expect(r.missing.map((m) => [m.index, m.type, m.need])).toEqual([
      [0, "photo", 2],
      [1, "file", undefined],
      [2, "signature", undefined],
      [3, "note", undefined],
      [4, "number", undefined],
      [5, "choice", undefined],
    ]);
    const full: ChecklistEvidence[] = [
      { type: "photo", files: [{ name: "1.jpg" }] },
      { type: "file", files: [{ name: "remision.pdf" }] },
      { type: "signature", signature: { svg: "<svg/>" } },
      { type: "note", value: "  " },
      { type: "number", value: 0 },
      { type: "choice", value: "Sí" },
    ];
    expect(miss(s, full).missing.map((m) => [m.type, m.need])).toEqual([
      ["photo", 1],
      ["note", undefined],
    ]);
    full[0].files!.push({ name: "2.jpg" });
    full[3].value = "Todo bien";
    expect(miss(s, full).missing).toEqual([]);
  });

  it("opcionales: se pueden dejar vacías", () => {
    expect(miss(step([{ type: "photo", required: false }, { type: "note", required: false }]), []).missing).toEqual([]);
  });

  it("número fuera de rango: se puede cerrar, pero exige nota (la del paso, o la nota aparte)", () => {
    const withNote = step([{ type: "number", min: 2, max: 8, unit: "°C" }, { type: "note", required: false }]);
    expect(miss(withNote, [{ type: "number", value: 5 }]).missing).toEqual([]);
    const out = miss(withNote, [{ type: "number", value: 11 }]);
    expect([out.outOfRange, out.needsNote, out.missing.map((m) => m.index)]).toEqual([true, true, [1]]);
    expect(miss(withNote, [{ type: "number", value: 11 }, { type: "note", value: "Se dañó el compresor" }]).missing).toEqual([]);
    const alone = step([{ type: "number", min: 118, max: 122 }]);
    expect(miss(alone, [{ type: "number", value: 110 }]).missing).toEqual([{ index: -1, type: "note" }]);
    expect(miss(alone, [{ type: "number", value: 110 }], "Faltaron 10 láminas").missing).toEqual([]);
  });

  it("«No conforme» exige nota; otra opción no", () => {
    const s = step([{ type: "choice", options: ["Conforme", "Con novedad", "No conforme"] }]);
    expect(checklistNeedsNote(s, [{ type: "choice", value: "Conforme" }])).toBe(false);
    expect(checklistNeedsNote(s, [{ type: "choice", value: "No conforme" }])).toBe(true);
    expect(miss(s, [{ type: "choice", value: "No conforme" }]).missing).toEqual([{ index: -1, type: "note" }]);
    expect(miss(s, [{ type: "choice", value: "No conforme" }], "Empaque roto").missing).toEqual([]);
  });

  it("sin evidencia: nada falta", () => {
    expect(miss({ id: "x", title: "X" }, []).missing).toEqual([]);
  });
});

describe("números como los escribe la gente", () => {
  it("es-CO: coma decimal, punto de miles solo si agrupa; en-US al revés", () => {
    const p = (t: string, l = "es-CO") => checklistParseNumber(t, l);
    expect([p("2,5"), p("1.200"), p("1.234.567,5"), p("2.5"), p("-3"), p(" 120 "), p(""), p("abc"), p("-")]).toEqual([2.5, 1200, 1234567.5, 2.5, -3, 120, null, null, null]);
    expect([p("2.5", "en-US"), p("1,200", "en-US"), p("1,234.5", "en-US"), p("2,5", "en-US")]).toEqual([2.5, 1200, 1234.5, 2.5]);
    expect(nb(checklistNumber(1234.5, "es-CO"))).toBe("1.234,5");
    expect(checklistNumber(1234.5, "en-US")).toBe("1,234.5");
  });
});

describe("resumen: orden", () => {
  const items = cleanChecklistItems([
    { id: "caja", title: "Apertura de caja", done: 0, total: 6, due: "2026-09-29" },
    { id: "cierre", title: "Cierre de septiembre", done: 18, total: 24, overdue: 3, due: "2026-09-30" },
    { id: "tkr", title: "Alistamiento del camión TKR-512", done: 9, total: 10 },
    { id: "q3", title: "Auditoría de inventario Q3", done: 40, total: 120, overdue: 1, due: "2026-10-05" },
  ]);
  it("por vencimiento: primero los que tienen vencidos, luego por fecha; sin fecha al final", () => {
    expect(sortChecklistItems(items, "due").map((i) => i.id)).toEqual(["cierre", "q3", "caja", "tkr"]);
  });
  it("por avance y por nombre", () => {
    expect(sortChecklistItems(items, "progress").map((i) => i.id)).toEqual(["caja", "q3", "cierre", "tkr"]);
    expect(sortChecklistItems(items, "title").map((i) => i.id)).toEqual(["tkr", "caja", "q3", "cierre"]);
  });
});
