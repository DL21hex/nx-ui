import { describe, expect, it } from "vitest";
import { cleanJob, cleanJobs, isJobActive, jobFraction, jobLeft, jobPace, jobsBackoff, jobsDuration, jobsFraction, jobsPollDelay, jobsRetryAfter, jobUrl, mergeJob, readJobsMemo, splitJobs, withQuery, type JobPace } from "../src/components/jobs/logic";
import type { Job } from "../src/components/jobs/types";

const T0 = Date.parse("2026-09-28T10:00:00Z");
const job = (o: Partial<Job> = {}): Job => ({ id: "j1", title: "Cierre de septiembre", status: "running", ...o });

describe("cleanJob / cleanJobs", () => {
  it("toma lo que sirve y descarta campo por campo", () => {
    const j = cleanJob({ id: 42, title: "  Importar clientes ", status: "running", done: 4200, total: 10000, stage: "Guardando", startedAt: "2026-09-28T10:00:00Z", by: { name: "Diego Llinás" }, result: { href: "/x", errors: 12.7, download: { url: "/f.csv", name: "errores.csv" }, bogus: 1 }, extra: "nada" });
    expect(j).toEqual({ id: "42", title: "Importar clientes", status: "running", done: 4200, total: 10000, stage: "Guardando", startedAt: "2026-09-28T10:00:00.000Z", by: "Diego Llinás", result: { href: "/x", errors: 12, download: { url: "/f.csv", name: "errores.csv" } } });
  });

  it("sin id o con un estado desconocido no sirve; sin título queda vacío", () => {
    expect(cleanJob({ title: "x", status: "done" })).toBeNull();
    expect(cleanJob({ id: "a", status: "pausado" })).toBeNull();
    expect(cleanJob({ id: "a" })).toBeNull();
    expect(cleanJob(null)).toBeNull();
    expect(cleanJob("a")).toBeNull();
    expect(cleanJob({ id: "a", status: "queued" })!.title).toBe("");
  });

  it("parcial: solo el id es obligatorio, y un estado inválido tampoco pasa", () => {
    expect(cleanJob({ id: "a", done: 5 }, true)).toEqual({ id: "a", done: 5 });
    expect(cleanJob({ id: "a", status: "x" }, true)).toBeNull();
    expect(cleanJob({ id: "a", done: -1, total: 0, seq: Number.NaN, startedAt: "ayer" }, true)).toEqual({ id: "a" });
  });

  it("listas: arreglo u objeto {jobs}, sin repetidos (queda el último) y con tope", () => {
    expect(cleanJobs([{ id: "a", status: "queued" }, { id: "a", status: "running" }, { id: "b" }]).map((j) => [j.id, j.status])).toEqual([["a", "running"]]);
    expect(cleanJobs({ jobs: [{ id: "a", status: "done" }] })).toHaveLength(1);
    expect(cleanJobs("nada")).toEqual([]);
    expect(cleanJobs(Array.from({ length: 900 }, (_, i) => ({ id: i, status: "done" })))).toHaveLength(500);
  });

  it("isJobActive", () => {
    expect(["queued", "running", "done", "failed", "canceled"].map((s) => isJobActive({ status: s as Job["status"] }))).toEqual([true, true, false, false, false]);
  });
});

describe("mergeJob: eventos fuera de orden y repetidos", () => {
  it("un trabajo nuevo se crea (en cola si el evento no trae estado)", () => {
    expect(mergeJob(undefined, { id: "x", done: 3 })).toMatchObject({ id: "x", status: "queued", title: "", done: 3 });
    const d = mergeJob(undefined, { id: "x", status: "done" }, false, T0)!;
    expect(d.finishedAt).toBe(new Date(T0).toISOString());
  });

  it("avanza y marca la hora de fin al terminar", () => {
    let j = mergeJob(job({ status: "queued" }), { id: "j1", status: "running", done: 10, total: 100 })!;
    expect(j).toMatchObject({ status: "running", done: 10 });
    j = mergeJob(j, { id: "j1", status: "done", done: 100, result: { href: "/cierre/9" } }, false, T0)!;
    expect(j).toMatchObject({ status: "done", done: 100, finishedAt: new Date(T0).toISOString(), result: { href: "/cierre/9" } });
  });

  it("repetido: nada cambia → null", () => {
    const j = job({ done: 10, total: 100 });
    expect(mergeJob(j, { id: "j1", status: "running", done: 10 })).toBeNull();
    expect(mergeJob(j, { id: "j1" })).toBeNull();
    const done = job({ status: "done", finishedAt: "2026-09-28T10:00:00.000Z" });
    expect(mergeJob(done, { id: "j1", status: "done" })).toBeNull();
  });

  it("sin seq: un «running» atrasado no revive un terminado y la cuenta no retrocede", () => {
    const done = job({ status: "done", done: 100, total: 100, finishedAt: "2026-09-28T10:00:00.000Z" });
    expect(mergeJob(done, { id: "j1", status: "running", done: 90 })).toBeNull();
    expect(mergeJob(done, { id: "j1", status: "failed" })).toBeNull();
    expect(mergeJob(job({ status: "running" }), { id: "j1", status: "queued" })).toBeNull();
    const back = mergeJob(job({ done: 50, total: 100 }), { id: "j1", done: 40, stage: "Guardando" })!;
    expect(back).toMatchObject({ done: 50, stage: "Guardando" });
  });

  it("con seq manda el número: uno igual o menor se ignora, uno mayor puede volver atrás", () => {
    const j = job({ done: 50, seq: 7 });
    expect(mergeJob(j, { id: "j1", done: 60, seq: 7 })).toBeNull();
    expect(mergeJob(j, { id: "j1", done: 60, seq: 3 })).toBeNull();
    expect(mergeJob(j, { id: "j1", done: 40, seq: 8 })).toMatchObject({ done: 40, seq: 8 });
    const failed = job({ status: "failed", seq: 9, finishedAt: "2026-09-28T10:00:00.000Z" });
    const again = mergeJob(failed, { id: "j1", status: "queued", seq: 10 })!;
    expect(again.status).toBe("queued");
    expect(again.finishedAt).toBeUndefined();
  });

  it("una tanda desordenada termina en el estado correcto (por seq)", () => {
    const evs = Array.from({ length: 50 }, (_, i) => ({ id: "j1", status: (i === 49 ? "done" : "running") as Job["status"], done: (i + 1) * 2, total: 100, seq: i + 1 }));
    const shuffled = [...evs].sort((a, b) => ((a.seq * 7919) % 50) - ((b.seq * 7919) % 50));
    let j: Job | undefined;
    for (const e of [...shuffled, ...evs]) j = mergeJob(j, e) ?? j;
    expect(j).toMatchObject({ status: "done", done: 100, seq: 50 });
  });

  it("force: la respuesta de un reintento vuelve a la cola", () => {
    const failed = job({ status: "failed", done: 316, total: 500, finishedAt: "2026-09-28T10:00:00.000Z", result: { message: "certificado" } });
    const j = mergeJob(failed, { id: "j1", status: "queued", result: undefined }, true)!;
    expect(j).toMatchObject({ status: "queued", done: 316 });
    expect(j.result).toBeUndefined();
    expect(j.finishedAt).toBeUndefined();
  });
});

describe("splitJobs: orden y recientes", () => {
  const now = T0;
  const iso = (min: number) => new Date(now - min * 60_000).toISOString();
  const list: Job[] = [
    job({ id: "q", status: "queued", startedAt: iso(1) }),
    job({ id: "r-old", status: "running", startedAt: iso(30) }),
    job({ id: "r-new", status: "running", startedAt: iso(5) }),
    job({ id: "d1", status: "done", finishedAt: iso(10) }),
    job({ id: "d2", status: "failed", finishedAt: iso(2) }),
    job({ id: "viejo", status: "done", finishedAt: iso(60 * 25) }),
    job({ id: "c", status: "canceled", finishedAt: iso(20) }),
  ];

  it("en curso: corriendo primero, lo más nuevo arriba; recientes: el último arriba, sin los de hace más de un día", () => {
    const s = splitJobs(list, 10, now);
    expect(s.active.map((j) => j.id)).toEqual(["r-new", "r-old", "q"]);
    expect(s.recent.map((j) => j.id)).toEqual(["d2", "d1", "c"]);
  });

  it("recientes con tope", () => {
    expect(splitJobs(list, 2, now).recent.map((j) => j.id)).toEqual(["d2", "d1"]);
    expect(splitJobs(list, 0, now).recent).toEqual([]);
  });

  it("10 000 trabajos en tiempo razonable", () => {
    const many = Array.from({ length: 10_000 }, (_, i) => job({ id: String(i), status: i % 3 ? "done" : "running", startedAt: iso(i % 500), finishedAt: iso(i % 700) }));
    const t = performance.now();
    const s = splitJobs(many, 10, now);
    expect(performance.now() - t).toBeLessThan(200);
    expect(s.recent).toHaveLength(10);
    expect(s.active).toHaveLength(3334);
  });
});

describe("avance", () => {
  it("jobFraction y jobsFraction (solo los que tienen total)", () => {
    expect(jobFraction({ done: 4200, total: 10000 })).toBeCloseTo(0.42);
    expect(jobFraction({ done: 20, total: 10 })).toBe(1);
    expect(jobFraction({ done: 5 })).toBeNull();
    expect(jobsFraction([job({ done: 50, total: 100 }), job({ done: 0, total: 300 }), job({ done: 7 })])).toBeCloseTo(0.125);
    expect(jobsFraction([job({ done: 7 })])).toBeNull();
  });
});

describe("jobPace: tiempo restante", () => {
  const run = (samples: [number, number][], total?: number): JobPace | undefined => {
    let p: JobPace | undefined;
    for (const [t, d] of samples) p = jobPace(p, d, total, t);
    return p;
  };

  it("con velocidad constante, estima bien", () => {
    // 10 por segundo, 1 000 en total: a los 30 s van 300 y faltan 70 s.
    const p = run(Array.from({ length: 31 }, (_, i) => [T0 + i * 1000, i * 10]), 1000)!;
    expect(jobLeft(p, T0 + 30_000)! / 1000).toBeCloseTo(70, 0);
    expect(jobLeft(p, T0 + 40_000)! / 1000).toBeCloseTo(60, 0);
  });

  it("con velocidad irregular no salta a lo loco", () => {
    // Promedio 10/s, pero a ráfagas: 30 en un segundo, 0 en los dos siguientes.
    const s: [number, number][] = [];
    let d = 0;
    for (let i = 0; i <= 60; i++) {
      if (i && i % 3 === 1) d += 30;
      s.push([T0 + i * 1000, d]);
    }
    let p: JobPace | undefined;
    let prev: number | null = null;
    let maxJump = 0;
    for (const [t, done] of s) {
      p = jobPace(p, done, 2000, t);
      const left = jobLeft(p, t);
      if (left !== null && prev !== null && t > T0 + 20_000) maxJump = Math.max(maxJump, Math.abs(left - (prev - 1000)));
      prev = left;
    }
    // Lo que falta real: (2000 − 600) / 10 = 140 s. La estimación queda cerca y cada segundo se
    // mueve poco más de lo que corre el reloj.
    expect(jobLeft(p, T0 + 60_000)! / 1000).toBeGreaterThan(100);
    expect(jobLeft(p, T0 + 60_000)! / 1000).toBeLessThan(200);
    expect(maxJump).toBeLessThan(40_000);
  });

  it("sin total no hay estimación, pero sí velocidad", () => {
    const p = run([[T0, 0], [T0 + 1000, 10], [T0 + 2000, 20]])!;
    expect(p.rate).toBeCloseTo(0.01);
    expect(jobLeft(p)).toBeNull();
  });

  it("muestras muy seguidas se juntan; una cuenta que retrocede empieza de nuevo", () => {
    const a = jobPace(undefined, 0, 100, T0);
    expect(jobPace(a, 5, 100, T0 + 100)).toBe(a);
    const b = jobPace(jobPace(a, 50, 100, T0 + 1000), 10, 100, T0 + 2000);
    expect(b).toEqual({ at: T0 + 2000, done: 10, rate: null, eta: null });
  });

  it("detenido: sin velocidad, sin estimación", () => {
    const p = run([[T0, 10], [T0 + 1000, 10], [T0 + 2000, 10]], 100)!;
    expect(p.eta).toBeNull();
  });

  it("jobsDuration: minutos, horas y «menos de un minuto»", () => {
    expect(jobsDuration(30_000)).toBeNull();
    expect(jobsDuration(170_000)).toBe("3 min");
    expect(jobsDuration(170_000, "es-CO", true)).toBe("3 minutos");
    expect(jobsDuration(60_000, "es-CO", true)).toBe("1 minuto");
    expect(jobsDuration(2 * 3_600_000)).toBe("2 h");
    expect(jobsDuration(5_400_000, "en-US", true)).toBe("1.5 hours");
    expect(jobsDuration(170_000, "xx!")).toBe("3 min");
  });
});

describe("esperas", () => {
  it("jobsBackoff crece con tope y ±20 %", () => {
    const mid = () => 0.5;
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => jobsBackoff(n, 1000, 30_000, mid))).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(jobsBackoff(1000, 1000, 30_000, mid)).toBe(30_000);
    expect(jobsBackoff(1, 1000, 30_000, () => 0)).toBe(800);
    expect(jobsBackoff(10, 1000, 30_000, () => 0.999)).toBeLessThanOrEqual(30_000);
  });

  it("jobsRetryAfter: segundos, fecha, basura y tope", () => {
    expect(jobsRetryAfter("3")).toBe(3000);
    expect(jobsRetryAfter(new Date(T0 + 5000).toUTCString(), T0)).toBe(5000);
    expect(jobsRetryAfter("mañana")).toBeNull();
    expect(jobsRetryAfter(null)).toBeNull();
    expect(jobsRetryAfter("999999")).toBe(3_600_000);
  });

  it("jobsPollDelay: base, ×1,5 sin cambios hasta 30 s, 30 s en segundo plano", () => {
    expect(jobsPollDelay(3000, 0, false)).toBe(3000);
    expect(jobsPollDelay(3000, 1, false)).toBe(4500);
    expect(jobsPollDelay(3000, 50, false)).toBe(30_000);
    expect(jobsPollDelay(3000, 0, true)).toBe(30_000);
    expect(jobsPollDelay(60_000, 5, false)).toBe(60_000);
  });
});

describe("URL y memoria", () => {
  it("jobUrl y withQuery", () => {
    expect(jobUrl("/api/trabajos/", "a b", "/cancel")).toBe("/api/trabajos/a%20b/cancel");
    expect(jobUrl("/api/trabajos?t=1", "7")).toBe("/api/trabajos/7?t=1");
    expect(jobUrl("/api/trabajos")).toBe("/api/trabajos");
    expect(withQuery("/s", "after", "12")).toBe("/s?after=12");
    expect(withQuery("/s?x=1", "active", "1")).toBe("/s?x=1&active=1");
  });

  it("readJobsMemo aguanta lo dañado", () => {
    expect(readJobsMemo('{"a":["j1",3],"d":["x"]}')).toEqual({ a: ["j1"], d: ["x"] });
    expect(readJobsMemo("{roto")).toEqual({ a: [], d: [] });
    expect(readJobsMemo(null)).toEqual({ a: [], d: [] });
    expect(readJobsMemo('{"a":"j1"}')).toEqual({ a: [], d: [] });
    expect(readJobsMemo(JSON.stringify({ a: Array.from({ length: 300 }, (_, i) => `j${i}`) })).a).toHaveLength(100);
  });
});

describe("SSR", () => {
  it("importar el módulo (y el panel) en Node no lanza", async () => {
    const m = await import("../src/components/jobs/index");
    expect(m.JOBS_LABELS.heading).toBe("Trabajos");
    expect(typeof (await import("../src/components/jobs/jobs-panel")).jobsPanel).toBe("function");
  });
});
