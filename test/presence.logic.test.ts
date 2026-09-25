import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS, TIMEOUT_MS, TYPING_MS, activityOf, agoText, applyEvent, cleanEvent, cleanUser, firstName, hueOf, nextTypingEnd, prune, statesOf, summarize, type PresenceNote, type PresencePeer } from "../src/components/presence/logic";
import { PRESENCE_LABELS } from "../src/components/presence/presence";
import type { PresenceEvent, PresenceUser } from "../src/components/presence/types";

const ANA = { id: "u-ana", name: "Ana Restrepo" };
const HECTOR = { id: "u-hector", name: "Héctor Pérez" };
const ev = (type: PresenceEvent["type"], user: PresenceUser = ANA, extra: Partial<PresenceEvent> = {}): PresenceEvent => ({ type, user, ...extra });

/** Aplica una serie de eventos, cada uno un segundo después del anterior. */
function run(events: PresenceEvent[], start = 1_000, self?: string) {
  let peers: PresencePeer[] = [];
  const notes: PresenceNote[] = [];
  events.forEach((e, i) => {
    const r = applyEvent(peers, e, start + i * 1000, self);
    peers = r.peers;
    notes.push(...r.notes);
  });
  return { peers, notes };
}

describe("cleanUser / cleanEvent", () => {
  it("necesita id y nombre; el id numérico se vuelve texto; la foto solo si es segura", () => {
    expect(cleanUser({ id: 7, name: " Ana " })).toEqual({ id: "7", name: "Ana" });
    expect(cleanUser({ id: "a", name: "Ana", avatar: "javascript:alert(1)" })).toEqual({ id: "a", name: "Ana" });
    expect(cleanUser({ id: "a", name: "Ana", avatar: "/fotos/ana.jpg" })).toEqual({ id: "a", name: "Ana", avatar: "/fotos/ana.jpg" });
    expect(cleanUser({ id: "a" })).toBeNull();
    expect(cleanUser({ name: "Ana" })).toBeNull();
    expect(cleanUser("Ana")).toBeNull();
    expect(cleanUser({ id: "x".repeat(500), name: "n".repeat(500) })!.name).toHaveLength(80);
  });

  it("acepta objetos o JSON, descarta tipos desconocidos y lo que no es suyo", () => {
    expect(cleanEvent('{"type":"focus","user":{"id":"a","name":"Ana"},"field":"monto"}')).toEqual({ type: "focus", user: { id: "a", name: "Ana" }, field: "monto" });
    expect(cleanEvent({ type: "hack", user: ANA })).toBeNull();
    expect(cleanEvent({ type: "join" })).toBeNull();
    expect(cleanEvent("no es json")).toBeNull();
    expect(cleanEvent(null)).toBeNull();
    const e = cleanEvent({ type: "heartbeat", user: { ...ANA, onclick: "x" }, field: null, idle: true, editing: "sí", innerHTML: "<b>" })!;
    expect(e).toEqual({ type: "heartbeat", user: ANA, field: null, idle: true });
    expect("innerHTML" in e).toBe(false);
    expect(cleanEvent({ type: "focus", user: ANA, field: 42 })).toEqual({ type: "focus", user: ANA });
  });
});

describe("applyEvent", () => {
  it("quien manda algo sin haber entrado, entra; leave lo saca", () => {
    const { peers, notes } = run([ev("focus", ANA, { field: "monto" })]);
    expect(peers).toHaveLength(1);
    expect(peers[0]).toMatchObject({ id: "u-ana", field: "monto", editing: false, idle: false, joinedAt: 1000 });
    expect(notes).toEqual([{ kind: "join", id: "u-ana", name: "Ana Restrepo" }]);
    const r = applyEvent(peers, ev("leave"), 5000);
    expect(r.peers).toEqual([]);
    expect(r.notes).toEqual([{ kind: "leave", id: "u-ana", name: "Ana Restrepo" }]);
    // Un leave de quien no estaba no anuncia nada.
    expect(applyEvent([], ev("leave"), 1).notes).toEqual([]);
  });

  it("ignora los eventos propios (el servidor puede devolverlos)", () => {
    expect(run([ev("join"), ev("typing", ANA, { field: "monto" })], 0, "u-ana").peers).toEqual([]);
  });

  it("focus, lock, typing, unlock y blur mueven el estado", () => {
    let { peers, notes } = run([ev("join"), ev("focus", ANA, { field: "monto" }), ev("lock", ANA, { field: "monto" })]);
    expect(peers[0]).toMatchObject({ field: "monto", editing: true });
    expect(notes.at(-1)).toEqual({ kind: "edit", id: "u-ana", name: "Ana Restrepo", field: "monto" });
    let r = applyEvent(peers, ev("typing", ANA, { field: "monto" }), 10_000);
    expect(r.peers[0].typingUntil).toBe(10_000 + TYPING_MS);
    // Seguir escribiendo en el mismo campo no vuelve a anunciar la edición.
    expect(r.notes).toEqual([]);
    r = applyEvent(r.peers, ev("unlock", ANA, { field: "otro" }), 11_000);
    expect(r.peers[0].editing).toBe(true);
    r = applyEvent(r.peers, ev("unlock", ANA, { field: "monto" }), 11_000);
    expect(r.peers[0]).toMatchObject({ editing: false, typingUntil: 0, field: "monto" });
    r = applyEvent(r.peers, ev("blur", ANA, { field: "monto" }), 12_000);
    expect(r.peers[0]).toMatchObject({ field: null, editing: false });
    ({ peers, notes } = run([ev("typing", ANA, { field: "notas" })]));
    // Escribir implica estar en el campo y editarlo.
    expect(peers[0]).toMatchObject({ field: "notas", editing: true });
    expect(notes.map((n) => n.kind)).toEqual(["join", "edit"]);
  });

  it("focus en otro campo suelta el anterior", () => {
    const { peers } = run([ev("lock", ANA, { field: "monto" }), ev("focus", ANA, { field: "fecha" })]);
    expect(peers[0]).toMatchObject({ field: "fecha", editing: false });
  });

  it("el latido trae el estado completo y la inactividad", () => {
    let { peers } = run([ev("heartbeat", ANA, { field: "notas", editing: true, idle: false })]);
    expect(peers[0]).toMatchObject({ field: "notas", editing: true, idle: false, idleSince: null });
    let r = applyEvent(peers, ev("heartbeat", ANA, { field: "notas", editing: true, idle: true }), 50_000);
    expect(r.peers[0]).toMatchObject({ idle: true, idleSince: 50_000, seenAt: 50_000 });
    // Un latido sin `idle` no cambia el estado; cualquier otra acción lo despierta.
    r = applyEvent(r.peers, ev("heartbeat"), 60_000);
    expect(r.peers[0]).toMatchObject({ idle: true, idleSince: 50_000 });
    r = applyEvent(r.peers, ev("focus", ANA, { field: "monto" }), 61_000);
    expect(r.peers[0]).toMatchObject({ idle: false, idleSince: null });
    // Sin campo no hay edición.
    ({ peers } = run([ev("heartbeat", ANA, { field: null, editing: true })]));
    expect(peers[0].editing).toBe(false);
  });

  it("actualiza nombre y foto, y no muta la lista original", () => {
    const { peers } = run([ev("join")]);
    const before = JSON.stringify(peers);
    const r = applyEvent(peers, ev("heartbeat", { ...ANA, name: "Ana R.", avatar: "/a.png" }), 9_000);
    expect(r.peers[0]).toMatchObject({ name: "Ana R.", avatar: "/a.png", joinedAt: 1000 });
    expect(JSON.stringify(peers)).toBe(before);
  });
});

describe("prune / statesOf / nextTypingEnd", () => {
  it("sin señales en 45 s se va; si estaba inactivo, tiene más margen", () => {
    const { peers } = run([ev("join"), ev("heartbeat", HECTOR, { idle: true })], 0);
    let r = prune(peers, TIMEOUT_MS + 500);
    expect(r.peers.map((p) => p.id)).toEqual(["u-hector"]);
    expect(r.notes).toEqual([{ kind: "leave", id: "u-ana", name: "Ana Restrepo" }]);
    r = prune(r.peers, IDLE_TIMEOUT_MS + 1500);
    expect(r.peers).toEqual([]);
  });

  it("activos primero, en orden de llegada; «typing» vence solo", () => {
    const { peers } = run([ev("heartbeat", ANA, { idle: true }), ev("typing", HECTOR, { field: "monto" })], 0);
    const s = statesOf(peers, 1000);
    expect(s.map((x) => x.id)).toEqual(["u-hector", "u-ana"]);
    expect(s[0].typing).toBe(true);
    expect("typingUntil" in s[0]).toBe(false);
    expect(statesOf(peers, 1000 + TYPING_MS + 1)[0].typing).toBe(false);
    expect(nextTypingEnd(peers, 1000)).toBe(1000 + TYPING_MS);
    expect(nextTypingEnd(peers, 10_000)).toBe(0);
  });
});

describe("colores, actividad y textos", () => {
  it("el tono es estable por id y sale de una paleta fija", () => {
    expect(hueOf("u-ana")).toBe(hueOf("u-ana"));
    const hues = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(hueOf));
    expect(hues.size).toBeGreaterThan(3);
    for (const h of hues) expect(h).toBeGreaterThanOrEqual(0);
  });

  it("inactivo le gana a todo; sin campo, viendo", () => {
    expect(activityOf({ idle: true, field: "monto", editing: true, typing: true })).toBe("idle");
    expect(activityOf({ idle: false, field: null, editing: false, typing: false })).toBe("viewing");
    expect(activityOf({ idle: false, field: "monto", editing: false, typing: false })).toBe("focus");
    expect(activityOf({ idle: false, field: "monto", editing: true, typing: false })).toBe("editing");
    expect(activityOf({ idle: false, field: "monto", editing: true, typing: true })).toBe("typing");
  });

  it("hace cuánto, con el locale", () => {
    expect(agoText(30_000)).toBe("");
    expect(agoText(4 * 60_000 + 10_000, "es-CO")).toBe("hace 4 min");
    expect(agoText(3 * 3_600_000, "es-CO")).toBe("hace 3 h");
    expect(agoText(2 * 60_000, "en-US")).toMatch(/^2 min\.? ago$/);
    expect(firstName("  Ana María Restrepo ")).toBe("Ana");
  });
});

describe("summarize", () => {
  const list = (n: string[]) => new Intl.ListFormat("es", { type: "conjunction" }).format(n);
  const label = (k: string) => ({ monto: "Monto", notas: "Notas" })[k] ?? k;
  const S = (notes: PresenceNote[], max?: number) => summarize(notes, PRESENCE_LABELS, list, label, max);
  const j = (id: string, name: string): PresenceNote => ({ kind: "join", id, name });
  const l = (id: string, name: string): PresenceNote => ({ kind: "leave", id, name });
  const e = (id: string, name: string, field: string): PresenceNote => ({ kind: "edit", id, name, field });

  it("agrupa entradas y salidas, y dice quién edita qué", () => {
    expect(S([j("a", "Ana")])).toBe("Ana entró");
    expect(S([j("a", "Ana"), j("h", "Héctor")])).toBe("Ana y Héctor entraron");
    expect(S([j("a", "Ana"), e("a", "Ana", "monto"), l("m", "Mariana")])).toBe("Ana entró. Ana está editando Monto. Mariana salió");
  });

  it("entrar y salir en el mismo lote se anula; de cada persona, su última edición", () => {
    expect(S([j("a", "Ana"), e("a", "Ana", "monto"), l("a", "Ana")])).toBe("");
    expect(S([l("a", "Ana"), j("a", "Ana")])).toBe("");
    expect(S([e("a", "Ana", "monto"), e("a", "Ana", "notas")])).toBe("Ana está editando Notas");
  });

  it("limita: pasadas `max` frases, «Y N cambios más»", () => {
    const notes = [j("a", "Ana"), e("a", "Ana", "monto"), e("h", "Héctor", "notas"), e("m", "Mariana", "fecha"), l("c", "Camilo")];
    expect(S(notes, 3)).toBe("Ana entró. Ana está editando Monto. Y 3 cambios más");
  });
});

describe("SSR", () => {
  it("el módulo importa sin DOM", async () => {
    expect(typeof globalThis.HTMLElement).toBe("undefined");
    const mod = await import("../src/components/presence/index");
    expect(typeof mod.NxPresence).toBe("function");
  });
});
