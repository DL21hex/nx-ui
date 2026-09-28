import { describe, expect, it } from "vitest";
import {
  THREAD_MAX_TEXT,
  anchorCounts,
  cleanComment,
  cleanComments,
  cleanDraft,
  cleanPerson,
  cleanRef,
  decodeDraft,
  encodeDraft,
  findTrigger,
  firstUnread,
  groupThreadByDay,
  latestAt,
  mergeComments,
  parseThreadText,
  refPatterns,
  threadDayLabel,
  threadMentions,
  threadNames,
  threadPick,
  threadPlainText,
  threadRoot,
} from "../src/components/thread/logic";
import { threadBackoff } from "../src/components/thread/thread-live";
import type { ThreadComment, ThreadToken } from "../src/components/thread/types";

const LAURA = { id: "u12", name: "Laura Gómez" };
const DIEGO = { id: "u7", name: "Diego Llinás" };
/** Una fecha local (la zona de la máquina) como ISO: así las pruebas valen en cualquier zona. */
const at = (d: number, h = 10, m = 0) => new Date(2026, 8, d, h, m).toISOString();
const c = (id: string, day: number, extra: Partial<ThreadComment> = {}): ThreadComment => ({ id, author: LAURA, text: `comentario ${id}`, at: at(day), ...extra });
const PATTERNS = refPatterns(["OC-\\d{3,6}", "FV-\\d{3,6}"]);
const types = (ts: ThreadToken[]) => ts.map((t) => t.type).join(",");

describe("cleanComment / cleanComments", () => {
  it("toma lo válido y descarta lo demás", () => {
    const ok = cleanComment({ id: 3, author: { id: "u12", name: "Laura Gómez", avatar: "javascript:alert(1)" }, text: "hola", at: at(21), editedAt: "no-fecha", anchor: "descuento", replyTo: 3, resolved: true, resolvedBy: { id: "u1", name: "Andrés" }, clientId: "c1", refs: [{ id: "fv", label: "FV-1873", href: "javascript:x" }, { id: "", label: "x" }], extra: "<b>" });
    expect(ok).toEqual({ id: "3", author: { id: "u12", name: "Laura Gómez" }, text: "hola", at: at(21), anchor: "descuento", resolved: true, resolvedBy: "Andrés", clientId: "c1", refs: [{ id: "fv", label: "FV-1873" }] });
    expect(ok!.replyTo).toBeUndefined(); // no se responde a sí mismo
    for (const bad of [null, 5, "x", {}, { id: "1", author: LAURA, at: at(1) }, { id: "1", author: { name: "sin id" }, text: "", at: at(1) }, { id: "1", author: LAURA, text: "x", at: "ayer" }]) expect(cleanComment(bad)).toBeNull();
  });

  it("resuelto por un nombre en texto; `resolved` que no es `true` no cuenta", () => {
    expect(cleanComment({ ...c("1", 1), resolved: true, resolvedBy: "Laura" })!.resolvedBy).toBe("Laura");
    expect(cleanComment({ ...c("1", 1), resolved: "sí", resolvedBy: "Laura" })!.resolved).toBeUndefined();
  });

  it("corta textos enormes", () => {
    expect(cleanComment({ ...c("1", 1), text: "a".repeat(THREAD_MAX_TEXT * 3) })!.text).toHaveLength(THREAD_MAX_TEXT);
  });

  it("acepta `[...]` o `{comments}`, sin repetidos y en orden (estable)", () => {
    const list = [c("b", 21), c("a", 20), c("b", 1), { ...c("x", 21), at: at(21) }];
    expect(cleanComments(list).map((x) => x.id)).toEqual(["a", "b", "x"]);
    expect(cleanComments({ comments: list })).toHaveLength(3);
    expect(cleanComments({ nada: 1 })).toEqual([]);
    expect(cleanComments("x")).toEqual([]);
  });

  it("personas y registros", () => {
    expect(cleanPerson({ id: 12, name: "Laura", detail: "Compras" })).toEqual({ id: "12", name: "Laura", detail: "Compras" });
    expect(cleanPerson({ name: "sin id" })).toBeNull();
    expect(cleanRef({ id: "fv-1873", label: "FV-1873", detail: "Factura", href: "/facturas/1873" })).toEqual({ id: "fv-1873", label: "FV-1873", detail: "Factura", href: "/facturas/1873" });
    expect(cleanRef({ id: "x", label: "X", href: "data:text/html,<script>" })).toEqual({ id: "x", label: "X" });
    expect(cleanRef({ id: "x" })).toBeNull();
  });
});

describe("mergeComments", () => {
  it("lo nuevo gana, y el comentario del servidor reemplaza al local por su clientId", () => {
    const local: ThreadComment = { ...c("c-1", 21), clientId: "c-1", state: "sending" };
    const server: ThreadComment = { ...c("99", 21), clientId: "c-1" };
    const merged = mergeComments([c("1", 20), local], [server]);
    expect(merged.map((x) => x.id)).toEqual(["1", "99"]);
    // El eco del stream y la respuesta del POST: el mismo comentario una sola vez.
    expect(mergeComments(merged, [server]).map((x) => x.id)).toEqual(["1", "99"]);
    expect(mergeComments([c("1", 20)], [{ ...c("1", 20), text: "editado" }])[0].text).toBe("editado");
  });
});

describe("conversaciones y anclas", () => {
  const cs = cleanComments([
    { ...c("r", 20), anchor: "descuento" },
    { ...c("r1", 20, { replyTo: "r" }) },
    { ...c("r2", 21, { replyTo: "r1" }) },
    { ...c("s", 21), anchor: "descuento", resolved: true },
    { ...c("s1", 21, { replyTo: "s" }) },
    { ...c("f", 21), anchor: "entrega" },
    c("libre", 22),
  ]);
  const byId = new Map(cs.map((x) => [x.id, x]));

  it("la raíz de una respuesta (y de una respuesta a una respuesta)", () => {
    expect(threadRoot(byId, byId.get("r2")!).id).toBe("r");
    expect(threadRoot(byId, byId.get("libre")!).id).toBe("libre");
    // Un padre que no está: la respuesta es su propia raíz.
    expect(threadRoot(byId, c("h", 1, { replyTo: "nadie" })).id).toBe("h");
  });

  it("un ciclo no cuelga", () => {
    const a = c("a", 1, { replyTo: "b" });
    const b = c("b", 1, { replyTo: "a" });
    const m = new Map([
      ["a", a],
      ["b", b],
    ]);
    expect(["a", "b"]).toContain(threadRoot(m, a).id);
  });

  it("cuenta lo abierto por campo (las respuestas heredan el ancla; lo resuelto no cuenta)", () => {
    expect(Object.fromEntries(anchorCounts(cs))).toEqual({ descuento: 3, entrega: 1 });
  });
});

describe("días y no leídos", () => {
  it("agrupa por día local, del más viejo al más nuevo", () => {
    const cs = cleanComments([c("a", 20, { at: at(20, 23, 59) }), c("b", 21, { at: at(21, 0, 1) }), c("c", 21, { at: at(21, 18) })]);
    const g = groupThreadByDay(cs);
    expect(g.map((d) => d.items.map((x) => x.id))).toEqual([["a"], ["b", "c"]]);
    expect(new Date(g[1].day).getDate()).toBe(21);
    expect(new Date(g[1].day).getHours()).toBe(0);
  });

  it("«Hoy», «Ayer» y la fecha corta (con el año si no es este)", () => {
    const now = new Date(2026, 8, 28, 9);
    expect(threadDayLabel(new Date(2026, 8, 28, 0, 5), now, "es-CO", "Hoy", "Ayer")).toBe("Hoy");
    expect(threadDayLabel(new Date(2026, 8, 27, 23, 59), now, "es-CO", "Hoy", "Ayer")).toBe("Ayer");
    expect(threadDayLabel(new Date(2026, 8, 21, 15), now, "es-CO", "Hoy", "Ayer")).toBe("lun 21 sept");
    expect(threadDayLabel(new Date(2025, 11, 31, 15), now, "es-CO", "Hoy", "Ayer")).toMatch(/^mi[eé] 31 dic 2025$/);
    expect(threadDayLabel(new Date(2026, 8, 21, 15), now, "en-US", "Today", "Yesterday")).toBe("Mon Sep 21");
  });

  it("el primer comentario de otra persona desde la última visita", () => {
    const cs = cleanComments([c("1", 20), { ...c("2", 21), author: DIEGO }, c("3", 22), c("4", 23)]);
    expect(firstUnread(cs, null, "u7")).toBe(-1); // primera visita: sin marca
    expect(firstUnread(cs, new Date(at(20, 12)).getTime(), "u7")).toBe(2); // el 2 es propio
    expect(firstUnread(cs, new Date(at(24)).getTime(), "u7")).toBe(-1);
    expect(firstUnread(cs, Number.NaN, "u7")).toBe(-1);
    expect(firstUnread([{ ...c("x", 25), state: "sending" }], 0, "u7")).toBe(-1);
    expect(latestAt(cs)).toBe(new Date(at(23)).getTime());
    expect(latestAt([])).toBeNull();
  });
});

describe("refPatterns", () => {
  it("compila los patrones seguros, anclados a la palabra entera", () => {
    const [oc] = refPatterns('["OC-\\\\d{3,6}"]');
    expect(oc.test("OC-2291")).toBe(true);
    expect(oc.test("XOC-2291")).toBe(false);
    expect(oc.test("OC-22")).toBe(false);
  });

  it("descarta los que pueden explotar, los inválidos, los largos y lo que no es texto", () => {
    const bad = ["(a+)+$", "(a*)*", "(a|aa)+", "(\\w+){2,}", "a**", "a{2}{3}", "(a)\\1", "(?=a)a", "(?<!b)a", "\\k<x>", "[", "a".repeat(61), "", 5, null];
    expect(refPatterns(bad)).toEqual([]);
    expect(refPatterns("no es json")).toEqual([]);
    expect(refPatterns({ a: 1 })).toEqual([]);
    expect(refPatterns(Array(20).fill("X-\\d+"))).toHaveLength(8);
  });

  it("un patrón catastrófico no llega a probarse (y la palabra tiene tope)", () => {
    const t0 = performance.now();
    parseThreadText(`${"a".repeat(5000)}!`, refPatterns(["(a+)+b", "a+b"]));
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe("parseThreadText", () => {
  it("menciones, referencias, URL y saltos de línea", () => {
    const ts = parseThreadText("Hola @[Laura Gómez](u12), mira #[FV-1873](fv-1873)\nen https://erp.co/a?b=1.");
    expect(ts).toEqual([
      { type: "text", text: "Hola " },
      { type: "mention", id: "u12", name: "Laura Gómez" },
      { type: "text", text: ", mira " },
      { type: "ref", id: "fv-1873", label: "FV-1873" },
      { type: "br" },
      { type: "text", text: "en " },
      { type: "url", href: "https://erp.co/a?b=1", text: "https://erp.co/a?b=1" },
      { type: "text", text: "." },
    ]);
  });

  it("los códigos conocidos (ref-patterns) son referencias", () => {
    const ts = parseThreadText("La OC-2291 y FV-1873. Pero no OC-12 ni XOC-2291", PATTERNS);
    expect(ts.filter((t) => t.type === "ref")).toEqual([
      { type: "ref", id: "OC-2291", label: "OC-2291" },
      { type: "ref", id: "FV-1873", label: "FV-1873" },
    ]);
    expect(threadPlainText(ts)).toBe("La OC-2291 y FV-1873. Pero no OC-12 ni XOC-2291");
  });

  it("el HTML es texto: nada se interpreta", () => {
    for (const evil of ['<img src=x onerror="alert(1)">', "<script>alert(1)</script>", "&lt;b&gt;", '<a href="javascript:alert(1)">x</a>']) {
      const ts = parseThreadText(evil);
      expect(ts).toEqual([{ type: "text", text: evil }]);
    }
  });

  it("javascript:, data: y URL raras no son enlaces", () => {
    for (const t of ["javascript:alert(1)", "data:text/html,<script>", "JaVaScRiPt:alert(1)", "https://", "https:///x", "http:/x.co", "ftp://x.co"]) expect(parseThreadText(t).some((x) => x.type === "url")).toBe(false);
    // Una mención o referencia no puede traer un id con paréntesis ni espacios.
    expect(types(parseThreadText("#[x](javascript:alert(1))"))).toBe("text");
    expect(types(parseThreadText("@[x](a b)"))).toBe("text");
  });

  it("la puntuación del final no es de la URL; los paréntesis balanceados sí", () => {
    const url = (s: string) => (parseThreadText(s).find((t) => t.type === "url") as { href: string } | undefined)?.href;
    expect(url("(ver https://x.co/a)")).toBe("https://x.co/a");
    expect(url("https://es.wikipedia.org/wiki/Nit_(Colombia)")).toBe("https://es.wikipedia.org/wiki/Nit_(Colombia)");
    expect(url("¿https://x.co/?q=1?")).toBe("https://x.co/?q=1");
    expect(url("«https://x.co/b»")).toBe("https://x.co/b");
    expect(url("HTTPS://X.CO/A")).toBe("HTTPS://X.CO/A");
  });

  it("una URL larga se muestra corta (el enlace va completo)", () => {
    const long = `https://erp.co/${"x".repeat(200)}`;
    const t = parseThreadText(long)[0] as { href: string; text: string };
    expect(t.href).toBe(long);
    expect(t.text).toHaveLength(61);
  });

  it("menciones rotas quedan como texto", () => {
    for (const s of ["@[Laura", "@[Laura](", "@[Laura](u12", "@[](u12)", "@[ ](u12)", "@[a\nb](u1)", `@[${"a".repeat(81)}](u1)`, `@[a](${"b".repeat(129)})`, "@Laura", "[Laura](u12)"]) {
      expect(parseThreadText(s).every((t) => t.type === "text" || t.type === "br")).toBe(true);
    }
  });

  it("quita los caracteres de control y normaliza \\r\\n", () => {
    expect(parseThreadText("a\u0000b\r\nc\u0007")).toEqual([{ type: "text", text: "ab" }, { type: "br" }, { type: "text", text: "c" }]);
  });

  it("textos enormes en tiempo lineal", () => {
    const big = "@[Laura](u1) https://x.co/a FV-1873 ".repeat(20_000);
    const t0 = performance.now();
    const ts = parseThreadText(big, PATTERNS);
    expect(performance.now() - t0).toBeLessThan(500);
    expect(threadPlainText(ts).length).toBeLessThanOrEqual(THREAD_MAX_TEXT);
    const broken = "@[".repeat(50_000);
    const t1 = performance.now();
    parseThreadText(broken, PATTERNS);
    expect(performance.now() - t1).toBeLessThan(500);
  });

  it("las menciones de un texto, sin repetir", () => {
    expect(threadMentions("@[Laura](u12) y @[Laura](u12) con @[Ana](u3)")).toEqual([
      { id: "u12", name: "Laura" },
      { id: "u3", name: "Ana" },
    ]);
  });
});

describe("borrador", () => {
  const laura = threadPick("mention", LAURA)!;
  const fv = threadPick("ref", { id: "fv-1873", label: "FV-1873" })!;

  it("threadPick limpia lo que rompería el token", () => {
    expect(laura).toEqual({ text: "@Laura Gómez", token: "@[Laura Gómez](u12)" });
    expect(threadPick("mention", { id: "a (b)", name: "Ana [admin] (x)" })).toEqual({ text: "@Ana admin x", token: "@[Ana admin x](ab)" });
    expect(threadPick("ref", { id: "", label: "x" })).toBeNull();
  });

  it("encodeDraft: solo lo elegido, como palabra entera, el más largo primero", () => {
    const ana = threadPick("mention", { id: "u3", name: "Ana" })!;
    const anaMaria = threadPick("mention", { id: "u4", name: "Ana María" })!;
    expect(encodeDraft("Hola @Laura Gómez, revisa #FV-1873", [laura, fv])).toBe("Hola @[Laura Gómez](u12), revisa #[FV-1873](fv-1873)");
    expect(encodeDraft("@Ana María y @Ana", [ana, anaMaria])).toBe("@[Ana María](u4) y @[Ana](u3)");
    expect(encodeDraft("@Anabel y x@Ana", [ana])).toBe("@Anabel y x@Ana");
    expect(encodeDraft("@Laura Gómez escrito a mano", [])).toBe("@Laura Gómez escrito a mano");
  });

  it("decodeDraft vuelve a lo que se ve, y la ida y vuelta conserva el texto", () => {
    const text = "Hola @[Laura Gómez](u12)\nmira #[FV-1873](fv-1873) en https://x.co";
    const d = decodeDraft(text);
    expect(d.text).toBe("Hola @Laura Gómez\nmira #FV-1873 en https://x.co");
    expect(d.picks).toEqual([laura, fv]);
    expect(encodeDraft(d.text, d.picks)).toBe(text);
  });

  it("cleanDraft: lo guardado roto o manipulado se descarta", () => {
    expect(cleanDraft('{"text":"hola","picks":[{"text":"@L","token":"@[L](u1)"},{"text":"x","token":"<img>"}],"anchor":"descuento"}')).toEqual({ text: "hola", picks: [{ text: "@L", token: "@[L](u1)" }], anchor: "descuento" });
    for (const bad of ["{", "null", "5", '{"text":5}', null]) expect(cleanDraft(bad)).toBeNull();
  });

  it("findTrigger: @ y # al comienzo de una palabra, y los códigos conocidos", () => {
    expect(findTrigger("Hola @lau", 9)).toEqual({ kind: "mention", start: 5, query: "lau" });
    expect(findTrigger("@", 1)).toEqual({ kind: "mention", start: 0, query: "" });
    expect(findTrigger("ver #fv-18", 10)).toEqual({ kind: "ref", start: 4, query: "fv-18" });
    expect(findTrigger("(#oc", 4)).toEqual({ kind: "ref", start: 1, query: "oc" });
    expect(findTrigger("la FV-1873", 10, PATTERNS)).toEqual({ kind: "ref", start: 3, query: "FV-1873" });
    expect(findTrigger("la FV-18", 8, PATTERNS)).toBeNull();
    expect(findTrigger("ana@x.co", 8)).toBeNull(); // un correo no
    expect(findTrigger("Hola @lau más", 13)).toBeNull(); // el cursor ya pasó
    expect(findTrigger(`@${"a".repeat(40)}`, 41)).toBeNull(); // palabra demasiado larga
  });

  it("nombres: «Laura», «Laura y Héctor», «Laura, Héctor y Ana», «… y 2 más»", () => {
    expect(threadNames(["Laura"], " y ", "{n} más")).toBe("Laura");
    expect(threadNames(["Laura", "Héctor"], " y ", "{n} más")).toBe("Laura y Héctor");
    expect(threadNames(["Laura", "Héctor", "Ana"], " y ", "{n} más")).toBe("Laura, Héctor y Ana");
    expect(threadNames(["Laura", "Héctor", "Ana", "Juan"], " y ", "{n} más")).toBe("Laura, Héctor y 2 más");
  });
});

describe("datos grandes", () => {
  it("20.000 comentarios con respuestas: limpiar, juntar, contar y agrupar en tiempo lineal", () => {
    const raw = Array.from({ length: 20_000 }, (_, i) => ({ id: `c${i}`, author: i % 3 ? LAURA : DIEGO, text: `@[Laura](u12) mira OC-${1000 + i}`, at: new Date(2026, 0, 1 + Math.floor(i / 50), i % 24).toISOString(), replyTo: i % 5 ? `c${i - 1}` : undefined, anchor: i % 5 ? undefined : "descuento" }));
    const t0 = performance.now();
    const cs = cleanComments(raw);
    const counts = anchorCounts(cs);
    const days = groupThreadByDay(cs);
    mergeComments(cs, cs.slice(-10));
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(cs).toHaveLength(20_000);
    expect(counts.get("descuento")).toBe(20_000);
    expect(days.length).toBe(400);
  });
});

describe("SSR", () => {
  it("el módulo (y sus chunks) importan sin DOM", async () => {
    expect(typeof globalThis.HTMLElement).toBe("undefined");
    const mod = await import("../src/components/thread/index");
    expect(typeof mod.NxThread).toBe("function");
    expect(typeof mod.parseThreadText).toBe("function");
    await import("../src/components/thread/thread-pick");
    await import("../src/components/thread/thread-anchors");
  });
});

describe("thread-live", () => {
  it("espera creciente con tope", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 50, -1].map(threadBackoff)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 1000]);
  });
});
