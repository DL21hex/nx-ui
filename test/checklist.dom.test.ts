// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ toast: vi.fn(async () => "timeout"), start: vi.fn() }));

// La firma y el celular de verdad no hacen falta: elementos de mentira con lo que el checklist usa.
vi.mock("../src/components/signature/index", () => {
  class FakeSignature extends HTMLElement {
    value: unknown = null;
  }
  if (!customElements.get("nx-signature")) customElements.define("nx-signature", FakeSignature);
  return { NxSignature: FakeSignature };
});
vi.mock("../src/components/handoff/index", () => {
  class FakeHandoff extends HTMLElement {
    start() {
      mocks.start(this);
    }
  }
  if (!customElements.get("nx-handoff")) customElements.define("nx-handoff", FakeHandoff);
  return { NxHandoff: FakeHandoff };
});
vi.mock("../src/components/toast/index", () => ({ nxToast: mocks.toast }));

import "../src/components/checklist/index";
import { CHECKLIST_LABELS, NxChecklist } from "../src/components/checklist/index";
import type { ChecklistChangeDetail, ChecklistState, ChecklistStep } from "../src/components/checklist/index";

// Mediodía local fijo (solo `Date`; los temporizadores son de verdad): «hace 2 h» es de hoy en cualquier zona.
vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 8, 28, 12, 0) });

const nb = (s: string | null | undefined) => (s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(n = 4) {
  for (let i = 0; i < n; i++) await tick();
}
const H = 3600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
/** Una fecha local sin zona, como la manda un backend: «2026-09-28T17:00». */
const localIso = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const LAURA = { id: "u3", name: "Laura Gómez" };
const ME = { id: "u7", name: "Diego Llinás" };

const STEPS: ChecklistStep[] = [
  { id: "placa", title: "Verificar la placa", section: "Llegada", evidence: [{ type: "choice", label: "¿Coincide?", options: ["Coincide", "No coincide"] }] },
  { id: "camion", title: "Foto del camión", section: "Llegada", assignee: ME, due: localIso(Date.now() - 2 * H), evidence: [{ type: "photo", label: "Foto del camión", count: 2 }] },
  { id: "remision", title: "Remisión", section: "Llegada", evidence: [{ type: "file", label: "Remisión escaneada" }] },
  { id: "contar", title: "Contar las láminas", section: "Conteo", assignee: LAURA, evidence: [{ type: "number", label: "Láminas contadas", min: 118, max: 122, unit: "und" }] },
  { id: "empaque", title: "Estado del empaque", section: "Conteo", evidence: [{ type: "choice", label: "Empaque", options: ["Conforme", "Con novedad", "No conforme"] }] },
  { id: "novedades", title: "Foto de novedades", section: "Conteo", required: false, canSkip: true },
  { id: "firma", title: "Firma del transportador", section: "Cierre", dependsOn: ["contar"], evidence: [{ type: "signature", label: "Firma de quien entrega" }] },
  { id: "nota", title: "Nota final", section: "Cierre", evidence: [{ type: "note", label: "Observaciones" }] },
];
const STATE: ChecklistState = { placa: { status: "done", by: LAURA, at: ago(2 * H), evidence: [{ type: "choice", value: "Coincide" }] } };

let urls = 0;
beforeEach(() => {
  urls = 0;
  URL.createObjectURL = vi.fn(() => `blob:local/${++urls}`);
  URL.revokeObjectURL = vi.fn();
  mocks.toast.mockClear();
  mocks.start.mockClear();
});
afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount(attrs = "", props: Partial<Pick<NxChecklist, "steps" | "state">> & Record<string, unknown> = {}): NxChecklist {
  const el = document.createElement("nx-checklist") as NxChecklist;
  el.setAttribute("me", JSON.stringify(ME));
  el.setAttribute("heading", "Recepción OC-2291");
  for (const m of attrs.matchAll(/([\w-]+)(?:='([^']*)')?/g)) el.setAttribute(m[1], m[2] ?? "");
  Object.assign(el, { steps: STEPS, state: STATE, ...props });
  document.body.append(el);
  return el;
}
const $ = <T extends Element = HTMLElement>(el: Element, sel: string) => el.querySelector<T>(sel)!;
const row = (el: Element, id: string) => $(el, `.nx-cl__open[data-step="${id}"]`).closest("li")!;
/** Los campos de evidencia llegan en un chunk aparte: se espera a que estén. */
const fieldsReady = () =>
  vi.waitFor(() => {
    const f = document.querySelector(".nx-cl__fields");
    if (f && !f.childElementCount) throw new Error("cargando los campos");
  });
const open = async (el: NxChecklist, id: string) => {
  $<HTMLButtonElement>(el, `.nx-cl__open[data-step="${id}"]`).click();
  await fieldsReady();
};
const panel = (el: Element) => el.querySelector<HTMLElement>(".nx-cl__panel");
const act = (el: Element, a: string) => $<HTMLButtonElement>(el, `.nx-cl__panel [data-a="${a}"]`);
const typeIn = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
};
function pickFiles(input: HTMLInputElement, ...names: (string | File)[]) {
  const files = names.map((n) => (typeof n === "string" ? new File(["x"], n, { type: n.endsWith(".pdf") ? "application/pdf" : "image/jpeg" }) : n));
  Object.defineProperty(input, "files", { configurable: true, get: () => files });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return files;
}
const changes = (el: Element) => {
  const out: ChecklistChangeDetail[] = [];
  el.addEventListener("nx-checklist-change", (e) => out.push((e as CustomEvent<ChecklistChangeDetail>).detail));
  return out;
};

/** Un servidor de mentira: responde según método y ruta; guarda cada pedido. */
function server(handler: (method: string, url: string, body: unknown) => Response | Promise<Response> = () => json({ ok: true })) {
  const calls: { method: string; url: string; body: unknown; signal?: AbortSignal }[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = (init.method ?? "GET").toUpperCase();
    const url = String(input);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({ method, url, body, signal: init.signal ?? undefined });
    return handler(method, url, body);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

describe("<nx-checklist>: la vista", () => {
  it("encabezado con un solo indicador de avance, secciones y filas con estado, responsable y vencimiento", () => {
    const el = mount();
    expect($(el, ".nx-cl__title").textContent).toBe("Recepción OC-2291");
    const bar = $(el, "[role=progressbar]");
    expect([bar.getAttribute("aria-valuenow"), bar.getAttribute("aria-valuemax"), bar.getAttribute("aria-label")]).toEqual(["1", "8", "Recepción OC-2291"]);
    expect(bar.getAttribute("aria-valuetext")).toBe("1 de 8 · 1 vencido");
    expect($(el, ".nx-cl__sum").textContent).toBe("1 de 8 · 1 vencido");
    expect([...el.querySelectorAll(".nx-cl__sect")].map((h) => h.textContent)).toEqual(["Llegada", "Conteo", "Cierre"]);
    expect(el.querySelectorAll(".nx-cl__step").length).toBe(8);
    // Cada paso es un grupo con nombre y estado.
    const g = $(row(el, "placa"), "[role=group]");
    expect(nb(g.getAttribute("aria-label"))).toBe("Verificar la placa, hecho por Laura Gómez hace 2 h");
    expect(row(el, "placa").dataset.s).toBe("done");
    // Vencido: ícono + texto (clase `late`), no solo color.
    const late = $(row(el, "camion"), ".nx-cl__chip--late");
    expect(nb(late.textContent)).toMatch(/^venció (hoy|ayer) \d/);
    expect(row(el, "camion").hasAttribute("data-late")).toBe(true);
    expect($(row(el, "camion"), ".nx-cl__who").getAttribute("aria-label")).toBe("Responsable: Diego Llinás");
    expect($(row(el, "camion"), ".nx-cl__who").textContent).toBe("DL");
    expect(nb($(row(el, "novedades"), ".nx-cl__m").textContent)).toBe("opcional");
    expect(el.progress).toMatchObject({ done: 1, total: 8, required: 7, overdue: 1, complete: false });
  });

  it("abrir un paso lo despliega en su lugar; uno a la vez; Escape lo cierra y devuelve el foco", async () => {
    const el = mount();
    await open(el, "nota");
    const btn = $<HTMLButtonElement>(el, '.nx-cl__open[data-step="nota"]');
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(btn.getAttribute("aria-controls")).toBe(panel(el)!.id);
    expect(row(el, "nota").contains(panel(el))).toBe(true);
    await open(el, "remision");
    expect(el.querySelectorAll(".nx-cl__panel").length).toBe(1);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(btn.hasAttribute("aria-controls")).toBe(false);
    const ta = $(el, ".nx-cl__panel input, .nx-cl__panel button") as HTMLElement;
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(panel(el)).toBe(null);
    expect(document.activeElement).toBe($(el, '.nx-cl__open[data-step="remision"]'));
    // `open()` desde la app.
    el.open("contar");
    await fieldsReady();
    expect(panel(el)!.dataset.step).toBe("contar");
    expect(document.activeElement).toBe($(el, '.nx-cl__open[data-step="contar"]'));
  });

  it("flechas entre filas (Inicio y Fin también)", () => {
    const el = mount();
    const btns = [...el.querySelectorAll<HTMLButtonElement>(".nx-cl__open")];
    btns[0].focus();
    btns[0].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(btns[1]);
    btns[1].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    expect(document.activeElement).toBe(btns[7]);
    btns[7].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(btns[7]);
    btns[7].dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    expect(document.activeElement).toBe(btns[0]);
  });
});

describe("<nx-checklist>: evidencia", () => {
  it("nota: «Marcar como hecho» se habilita al estar completa y dice qué falta", async () => {
    const el = mount();
    const got = changes(el);
    await open(el, "nota");
    const done = act(el, "done");
    expect(done.disabled).toBe(true);
    expect($(el, ".nx-cl__miss").textContent).toBe("Falta: Observaciones");
    expect(done.getAttribute("aria-describedby")).toBe($(el, ".nx-cl__miss").id);
    typeIn($(el, ".nx-cl__panel textarea"), "Todo en orden");
    expect(done.disabled).toBe(false);
    expect($(el, ".nx-cl__miss").textContent).toBe("");
    done.click();
    expect(el.state.nota).toMatchObject({ status: "done", by: ME, evidence: [{ type: "note", value: "Todo en orden" }] });
    expect(got).toEqual([{ step: "nota", status: "done", evidence: [{ type: "note", value: "Todo en orden" }], reason: undefined, note: undefined }]);
    expect(panel(el)).toBe(null);
    expect(nb($(row(el, "nota"), "[role=group]").getAttribute("aria-label"))).toBe("Nota final, hecho por Diego Llinás ahora");
    expect($(el, ".nx-cl__sum").textContent).toBe("2 de 8 · 1 vencido");
  });

  it("número fuera de rango: aviso claro, exige nota y queda marcado «fuera de rango»", async () => {
    const el = mount(`locale='es-CO'`);
    await open(el, "contar");
    const input = $<HTMLInputElement>(el, ".nx-cl__num");
    expect(nb($(el, ".nx-cl__range").textContent)).toBe("Entre 118 y 122 und");
    expect(input.getAttribute("aria-describedby")).toBe($(el, ".nx-cl__range").id);
    typeIn(input, "120");
    expect(act(el, "done").disabled).toBe(false);
    expect($(el, ".nx-cl__warn").hidden).toBe(true);
    typeIn(input, "110");
    expect($(el, ".nx-cl__warn").hidden).toBe(false);
    expect(input.closest(".nx-cl__ev")!.hasAttribute("data-out")).toBe(true);
    expect(act(el, "done").disabled).toBe(true);
    expect($(el, ".nx-cl__miss").textContent).toBe("Falta: Nota: explica la novedad");
    const extra = [...el.querySelectorAll<HTMLTextAreaElement>(".nx-cl__panel textarea")].find((t) => !t.closest("[hidden]"))!;
    typeIn(extra, "Llegaron 10 láminas menos");
    act(el, "done").click();
    expect(el.state.contar).toMatchObject({ status: "done", note: "Llegaron 10 láminas menos", evidence: [{ type: "number", value: 110, outOfRange: true }] });
    expect(nb($(row(el, "contar"), ".nx-cl__chip--range").textContent)).toBe("fuera de rango");
    // Al verlo hecho: el valor con su unidad y la marca.
    await open(el, "contar");
    expect(nb($(el, ".nx-cl__panel [data-out] .nx-cl__val").textContent)).toBe("110 und · fuera de rango");
  });

  it("opciones: «No conforme» exige nota; «Conforme» no", async () => {
    const el = mount();
    await open(el, "empaque");
    const radios = [...el.querySelectorAll<HTMLInputElement>(".nx-cl__choice input")];
    expect(radios.map((r) => r.value)).toEqual(["Conforme", "Con novedad", "No conforme"]);
    expect($(el, ".nx-cl__choice legend").textContent).toBe("Empaque");
    radios[2].click();
    expect(act(el, "done").disabled).toBe(true);
    radios[0].click();
    expect(act(el, "done").disabled).toBe(false);
    act(el, "done").click();
    expect(el.state.empaque.evidence).toEqual([{ type: "choice", value: "Conforme" }]);
  });

  it("fotos: tomar, miniaturas, quitar una; `count` mínimo; con `handoff`, «Tomar con el celular»", async () => {
    const el = mount(`handoff='/api/handoff'`);
    await open(el, "camion");
    const input = $<HTMLInputElement>(el, ".nx-cl__file");
    expect([input.accept, input.getAttribute("capture"), input.multiple]).toEqual(["image/*", "environment", true]);
    expect($(el, ".nx-cl__miss").textContent).toBe("Falta: Foto del camión (2 fotos más)");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    [...el.querySelectorAll<HTMLButtonElement>(".nx-cl__panel .nx-cl__btn")].find((b) => b.textContent === "Tomar foto")!.click();
    expect(click).toHaveBeenCalled();
    const [frente] = pickFiles(input, "frente.jpg");
    expect(el.querySelectorAll(".nx-cl__files img").length).toBe(1);
    expect($(el, ".nx-cl__miss").textContent).toBe("Falta: Foto del camión");
    // `<nx-handoff>` agrega al FileList lo que llega: solo se toma lo nuevo.
    pickFiles(input, frente, "placa.jpg");
    expect([...el.querySelectorAll<HTMLImageElement>(".nx-cl__files img")].map((i) => i.alt)).toEqual(["frente.jpg", "placa.jpg"]);
    expect(act(el, "done").disabled).toBe(false);
    $<HTMLButtonElement>(el, '.nx-cl__rm[aria-label="Quitar frente.jpg"]').click();
    expect([...el.querySelectorAll<HTMLImageElement>(".nx-cl__files img")].map((i) => i.alt)).toEqual(["placa.jpg"]);
    expect(act(el, "done").disabled).toBe(true);
    // El celular: un <nx-handoff kind="photo"> que entrega en el mismo <input>.
    const phone = [...el.querySelectorAll<HTMLButtonElement>(".nx-cl__panel .nx-cl__btn")].find((b) => b.textContent === "Tomar con el celular")!;
    phone.click();
    await settle();
    const ho = $(el, ".nx-cl__panel nx-handoff");
    expect([ho.getAttribute("kind"), ho.getAttribute("endpoint"), ho.getAttribute("for"), ho.hasAttribute("multiple")]).toEqual(["photo", "/api/handoff", input.id, true]);
    expect(mocks.start).toHaveBeenCalledWith(ho);
    // Al cerrar el panel se liberan las miniaturas.
    el.open("nota");
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it("sin `handoff` no hay botón del celular (a menos que el autor ponga un <nx-handoff endpoint>)", async () => {
    const el = mount();
    await open(el, "camion");
    expect([...el.querySelectorAll(".nx-cl__panel .nx-cl__btn")].some((b) => b.textContent === "Tomar con el celular")).toBe(false);
    const ho = document.createElement("nx-handoff");
    ho.setAttribute("endpoint", "/api/ho");
    el.prepend(ho);
    el.open("nota");
    el.open("camion");
    await fieldsReady();
    expect([...el.querySelectorAll(".nx-cl__panel .nx-cl__btn")].some((b) => b.textContent === "Tomar con el celular")).toBe(true);
    // El nodo del autor no se mueve.
    expect(el.firstElementChild).toBe(ho);
  });

  it("archivos: adjuntar y ver el nombre", async () => {
    const el = mount();
    await open(el, "remision");
    const input = $<HTMLInputElement>(el, ".nx-cl__file");
    expect(input.hasAttribute("capture")).toBe(false);
    pickFiles(input, "remision-4471.pdf");
    expect($(el, ".nx-cl__fname").textContent).toBe("remision-4471.pdf");
    act(el, "done").click();
    expect(el.state.remision.evidence).toEqual([{ type: "file", files: [{ name: "remision-4471.pdf", type: "application/pdf", size: 1 }] }]);
  });

  it("firma: <nx-signature ask-name> cargado con import(); la firma hecha completa la evidencia", async () => {
    const el = mount();
    el.state = { ...STATE, contar: { status: "done", evidence: [{ type: "number", value: 120 }] } };
    await open(el, "firma");
    const sig = $<HTMLElement & { value: unknown }>(el, ".nx-cl__panel nx-signature");
    expect(sig.hasAttribute("ask-name")).toBe(true);
    expect(act(el, "done").disabled).toBe(true);
    sig.dispatchEvent(new CustomEvent("nx-signature-done", { detail: { svg: "<svg/>", meta: { name: "Pedro Ruiz" } } }));
    expect(act(el, "done").disabled).toBe(false);
    sig.dispatchEvent(new CustomEvent("nx-signature-change", { detail: { empty: true } }));
    expect(act(el, "done").disabled).toBe(true);
    sig.dispatchEvent(new CustomEvent("nx-signature-done", { detail: { svg: "<svg/>", meta: { name: "Pedro Ruiz" } } }));
    act(el, "done").click();
    expect(el.state.firma.evidence).toEqual([{ type: "signature", signature: { svg: "<svg/>", meta: { name: "Pedro Ruiz" } } }]);
    await open(el, "firma");
    expect($<HTMLImageElement>(el, ".nx-cl__sig").src).toMatch(/^data:image\/svg\+xml/);
  });
});

describe("<nx-checklist>: omitir, reabrir, bloqueos", () => {
  it("omitir pide motivo (y avisa si falta); queda en la bitácora", async () => {
    const el = mount();
    await open(el, "novedades");
    act(el, "skip").click();
    await settle(1);
    const input = $<HTMLInputElement>(el, ".nx-cl__acts--reason input");
    expect(document.activeElement).toBe(input);
    act(el, "confirm").click();
    expect($(el, ".nx-cl__acts--reason [role=alert]").textContent).toBe("Escribe el motivo");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    input.value = "No hubo novedades";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(el.state.novedades).toMatchObject({ status: "skipped", reason: "No hubo novedades", by: ME });
    expect(row(el, "novedades").dataset.s).toBe("skipped");
    const log = $<HTMLDetailsElement>(el, ".nx-cl__log");
    log.open = true;
    log.dispatchEvent(new Event("toggle"));
    const first = log.querySelector("li")!;
    expect(nb(first.textContent)).toMatch(/^Diego Llinás omitió «Foto de novedades» · ahora/);
    expect(first.querySelector("small")!.textContent).toBe("Motivo: No hubo novedades");
    expect(nb(log.querySelector("summary")!.textContent)).toBe("Actividad (2)");
  });

  it("reabrir pide motivo; la evidencia queda como borrador y la bitácora conserva el «hecho» anterior", async () => {
    const el = mount();
    const got = changes(el);
    await open(el, "placa");
    expect(nb($(el, ".nx-cl__by").textContent)).toMatch(/^hecho por Laura Gómez /);
    expect(nb($(el, ".nx-cl__panel .nx-cl__val").textContent)).toBe("Coincide");
    act(el, "reopen").click();
    await settle(1);
    $<HTMLInputElement>(el, ".nx-cl__acts--reason input").value = "La placa no era";
    act(el, "confirm").click();
    await settle();
    expect(el.state.placa).toMatchObject({ status: "todo", reason: "La placa no era" });
    expect(got.at(-1)).toMatchObject({ step: "placa", status: "todo", reason: "La placa no era" });
    // Sigue abierto, para corregir, con lo que tenía.
    expect(panel(el)!.dataset.step).toBe("placa");
    expect($<HTMLInputElement>(el, '.nx-cl__choice input[value="Coincide"]').checked).toBe(true);
    const log = $<HTMLDetailsElement>(el, ".nx-cl__log");
    log.open = true;
    log.dispatchEvent(new Event("toggle"));
    expect([...log.querySelectorAll("li")].map((li) => nb(li.textContent).replace(/ · .*/, ""))).toEqual(["Diego Llinás reabrió «Verificar la placa»", "Laura Gómez marcó «Verificar la placa» como hecho"]);
  });

  it("dependencias: el paso se ve, dice qué va primero y no se abre para editar; al hacerse, se libera", async () => {
    const el = mount();
    expect(row(el, "firma").dataset.s).toBe("blocked");
    expect(nb($(row(el, "firma"), ".nx-cl__chip--blocked").textContent)).toBe("Primero: Contar las láminas");
    expect(nb($(row(el, "firma"), "[role=group]").getAttribute("aria-label"))).toBe("Firma del transportador, Primero: Contar las láminas");
    await open(el, "firma");
    expect(nb($(el, ".nx-cl__lock").textContent)).toBe("Primero: Contar las láminas");
    expect(el.querySelector('.nx-cl__panel [data-a="done"]')).toBe(null);
    expect(el.querySelector(".nx-cl__panel nx-signature")).toBe(null);
    el.state = { ...STATE, contar: { status: "done" } };
    expect(row(el, "firma").dataset.s).toBe("todo");
  });

  it("`sequential` por sección: en Conteo, un paso espera al anterior", () => {
    const el = mount(`sequential='["Conteo"]'`);
    expect(el.sequential).toEqual(["Conteo"]);
    expect(row(el, "empaque").dataset.s).toBe("blocked");
    expect(nb($(row(el, "empaque"), ".nx-cl__chip--blocked").textContent)).toBe("Primero: Contar las láminas");
    expect(row(el, "remision").dataset.s).toBe("todo");
    el.sequential = true;
    expect(el.getAttribute("sequential")).toBe("");
    expect(row(el, "remision").dataset.s).toBe("blocked");
    el.sequential = false;
    expect(el.hasAttribute("sequential")).toBe(false);
  });

  it("bloqueado por el servidor, con su motivo", () => {
    const el = mount("", { state: { ...STATE, nota: { status: "blocked", reason: "Falta la remisión firmada" } } });
    expect(nb($(row(el, "nota"), ".nx-cl__chip--blocked").textContent)).toBe("bloqueado: Falta la remisión firmada");
  });

  it("la casilla de un paso sin evidencia obligatoria lo marca de una vez; la de otro, lo abre", async () => {
    const el = mount();
    $<HTMLElement>(row(el, "novedades"), ".nx-cl__box").click();
    expect(el.state.novedades?.status).toBe("done");
    $<HTMLElement>(row(el, "nota"), ".nx-cl__box").click();
    await settle();
    expect(el.state.nota).toBe(undefined);
    expect(panel(el)!.dataset.step).toBe("nota");
  });
});

describe("<nx-checklist>: guardado optimista y sin conexión", () => {
  const DATA = { title: "Recepción OC-2291 · Aceros del Caribe", steps: STEPS, state: STATE };

  it("carga con GET; cada cambio se ve al instante y va por PATCH con metadatos y clientId; las fotos antes, por POST", async () => {
    const { calls } = server((method, url) => {
      if (method === "GET") return json(DATA);
      if (url.endsWith("/files")) return json({ files: [{ url: "/f/frente.jpg", id: "f1" }, { url: "/f/placa.jpg", id: "f2" }] });
      return json({ ok: true });
    });
    const el = mount(`endpoint='/api/procedimientos/oc-2291'`, { steps: undefined, state: undefined });
    delete (el as unknown as Record<string, unknown>).state;
    await settle();
    expect(calls[0]).toMatchObject({ method: "GET", url: "/api/procedimientos/oc-2291" });
    expect($(el, ".nx-cl__title").textContent).toBe("Recepción OC-2291 · Aceros del Caribe");
    expect(el.querySelectorAll(".nx-cl__step").length).toBe(8);
    await open(el, "camion");
    pickFiles($<HTMLInputElement>(el, ".nx-cl__file"), "frente.jpg", "placa.jpg");
    act(el, "done").click();
    // Al instante, antes de que responda el servidor.
    expect(el.state.camion.status).toBe("done");
    expect(el.pending).toMatchObject([{ step: "camion", status: "done" }]);
    expect(nb($(row(el, "camion"), ".nx-cl__chip--pending").textContent)).toBe("pendiente de enviar");
    await settle(6);
    const up = calls.find((c) => c.url.endsWith("/files"))!;
    expect(up).toMatchObject({ method: "POST", url: "/api/procedimientos/oc-2291/steps/camion/files" });
    expect((up.body as FormData).getAll("files").map((f) => (f as File).name)).toEqual(["frente.jpg", "placa.jpg"]);
    const patch = calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe("/api/procedimientos/oc-2291/steps/camion");
    const body = patch.body as Record<string, unknown>;
    expect(body.status).toBe("done");
    expect(typeof body.clientId).toBe("string");
    expect(body.evidence).toEqual([
      {
        type: "photo",
        files: [
          { name: "frente.jpg", type: "image/jpeg", size: 1, url: "/f/frente.jpg", id: "f1" },
          { name: "placa.jpg", type: "image/jpeg", size: 1, url: "/f/placa.jpg", id: "f2" },
        ],
      },
    ]);
    expect(el.pending).toEqual([]);
    expect(row(el, "camion").querySelector(".nx-cl__chip--pending")).toBe(null);
    expect(calls.indexOf(up)).toBeLessThan(calls.indexOf(patch));
  });

  it("un error del servidor revierte ese paso con un aviso (y `nx-checklist-error`)", async () => {
    server((method) => (method === "PATCH" ? json({ message: "La recepción ya se cerró en el ERP" }, 422) : json({})));
    const el = mount(`endpoint='/api/p'`);
    const errors: unknown[] = [];
    el.addEventListener("nx-checklist-error", (e) => errors.push((e as CustomEvent).detail));
    await open(el, "nota");
    typeIn($(el, ".nx-cl__panel textarea"), "Listo");
    act(el, "done").click();
    expect(el.state.nota.status).toBe("done");
    await settle(6);
    expect(el.state.nota).toBe(undefined);
    expect(errors).toEqual([{ message: "La recepción ya se cerró en el ERP", step: "nota", status: 422 }]);
    expect(mocks.toast).toHaveBeenCalledWith({ message: "No se guardó «Nota final»: La recepción ya se cerró en el ERP", tone: "danger" });
    expect(row(el, "nota").dataset.s).toBe("todo");
    expect($(el, ".nx-cl__sum").textContent).toBe("1 de 8 · 1 vencido");
  });

  it("sin red: los cambios se encolan («sin enviar») sin bloquear, y al volver la red se envían en orden", async () => {
    let online = false;
    const { calls } = server(async (method) => {
      if (!online) throw new TypeError("Failed to fetch");
      return method === "GET" ? json({}) : json({ ok: true });
    });
    const el = mount(`endpoint='/api/p'`);
    const timer = vi.spyOn(globalThis, "setTimeout");
    $<HTMLElement>(row(el, "novedades"), ".nx-cl__box").click();
    await settle();
    await open(el, "nota");
    typeIn($(el, ".nx-cl__panel textarea"), "Sin señal en la bodega");
    act(el, "done").click();
    await settle();
    expect(el.pending.map((p) => p.step)).toEqual(["novedades", "nota"]);
    expect($(el, ".nx-cl__sum").textContent).toBe("3 de 8 · 1 vencido · 2 sin enviar (sin conexión)");
    expect(el.querySelector(".nx-cl")!.hasAttribute("data-offline")).toBe(true);
    // Se reintenta con espera creciente.
    expect(timer.mock.calls.some(([, ms]) => ms === 1000 || ms === 2000)).toBe(true);
    const before = calls.length;
    online = true;
    window.dispatchEvent(new Event("online"));
    await settle(10);
    const sent = calls.slice(before).filter((c) => c.method === "PATCH").map((c) => c.url);
    expect(sent).toEqual(["/api/p/steps/novedades", "/api/p/steps/nota"]);
    expect(el.pending).toEqual([]);
    expect($(el, ".nx-cl__sum").textContent).toBe("3 de 8 · 1 vencido");
  });

  it("`reload()` deja lo que falta por enviar encima de lo que llega", async () => {
    let online = true;
    server(async (method) => {
      if (method === "GET") return json({ state: {} });
      if (!online) throw new TypeError("Failed to fetch");
      return json({});
    });
    const el = mount(`endpoint='/api/p'`);
    online = false;
    $<HTMLElement>(row(el, "novedades"), ".nx-cl__box").click();
    await settle();
    online = true;
    const p = el.reload();
    online = false;
    await p;
    expect(el.state.novedades?.status).toBe("done");
    expect(el.state.placa).toBe(undefined);
  });

  it("error al cargar: aviso con «Reintentar»", async () => {
    let ok = false;
    server(() => (ok ? json({ title: "Ya cargó", steps: [{ id: "a", title: "A" }] }) : json({}, 500)));
    const el = mount(`endpoint='/api/p'`, { steps: undefined, state: undefined });
    delete (el as unknown as Record<string, unknown>).state;
    const errs: unknown[] = [];
    el.addEventListener("nx-checklist-error", (e) => errs.push((e as CustomEvent).detail));
    await settle();
    expect(nb($(el, "[role=alert]").textContent)).toBe("No se pudo cargar el procedimiento Reintentar");
    expect(errs).toEqual([{ message: "HTTP 500" }]);
    ok = true;
    $<HTMLButtonElement>(el, '[data-a="reload"]').click();
    await settle();
    expect($(el, ".nx-cl__title").textContent).toBe("Ya cargó");
    expect(el.querySelector("[role=alert]")).toBe(null);
  });
});

describe("<nx-checklist>: completar y cerrar", () => {
  const TWO: ChecklistStep[] = [
    { id: "a", title: "A" },
    { id: "b", title: "B" },
    { id: "c", title: "C", required: false },
  ];
  it("con todos los requeridos hechos: «Procedimiento completo», quién y cuándo, y «Cerrar procedimiento» (cancelable) → solo lectura", async () => {
    const { calls } = server();
    const el = mount(`endpoint='/api/p'`, { steps: TWO, state: { a: { status: "done", by: LAURA, at: ago(3 * H) } } });
    expect(el.querySelector(".nx-cl__end")!.childElementCount).toBe(0);
    $<HTMLElement>(row(el, "b"), ".nx-cl__box").click();
    const end = $(el, ".nx-cl__end");
    const texts = () => [...$(el, ".nx-cl__end").children].map((c) => nb(c.textContent));
    expect(texts()).toEqual(["Procedimiento completo", "Lo completó Diego Llinás ahora", "Cerrar procedimiento"]);
    expect(el.progress.complete).toBe(true);
    let cancel = true;
    const seen: unknown[] = [];
    el.addEventListener("nx-checklist-complete", (e) => {
      seen.push((e as CustomEvent).detail);
      if (cancel) e.preventDefault();
    });
    $<HTMLButtonElement>(end, '[data-a="close"]').click();
    expect(el.closed).toBe(null);
    cancel = false;
    $<HTMLButtonElement>(end, '[data-a="close"]').click();
    expect(seen.length).toBe(2);
    expect(seen[1]).toMatchObject({ by: ME, progress: { complete: true } });
    expect(el.closed).toMatchObject({ by: ME });
    expect(texts()).toEqual(["Procedimiento cerrado", "Lo cerró Diego Llinás ahora"]);
    expect(document.activeElement).toBe($(el, ".nx-cl__end"));
    await settle(6);
    expect(calls.find((c) => c.url === "/api/p/close")).toMatchObject({ method: "POST" });
    // Solo lectura: se abre para ver, sin «Reabrir», y la casilla no marca nada.
    await open(el, "a");
    expect(el.querySelector('.nx-cl__panel [data-a="reopen"]')).toBe(null);
    $<HTMLElement>(row(el, "c"), ".nx-cl__box").click();
    expect(el.state.c).toBe(undefined);
  });

  it("`readonly` y `disabled`: se ve, no se edita", async () => {
    const el = mount("readonly");
    await open(el, "nota");
    expect(el.querySelector(".nx-cl__panel textarea")).toBe(null);
    expect(el.querySelector('.nx-cl__panel [data-a="done"]')).toBe(null);
    el.readonly = false;
    el.disabled = true;
    await open(el, "placa");
    expect(el.querySelector('.nx-cl__panel [data-a="reopen"]')).toBe(null);
  });
});

describe("<nx-checklist mode=summary>", () => {
  const ITEMS = [
    { id: "caja", title: "Apertura de caja", done: 0, total: 6, due: "2099-01-02" },
    { id: "cierre", title: "Cierre de septiembre", done: 18, total: 24, overdue: 3, due: "2099-01-05" },
    { id: "tkr", title: "Alistamiento del camión TKR-512", done: 10, total: 10, href: "/procedimientos/tkr" },
    { id: "q3", title: "Auditoría de inventario Q3", done: 40, total: 120, overdue: 1, href: "javascript:alert(1)" },
  ];
  it("lista compacta con avance y vencidos, ordenable; clic abre (`href` seguro) o emite `nx-checklist-open`", async () => {
    const el = document.createElement("nx-checklist") as NxChecklist;
    el.setAttribute("mode", "summary");
    el.items = ITEMS;
    document.body.append(el);
    expect(el.querySelector(".nx-cl")!.getAttribute("aria-busy")).toBe("true");
    await vi.waitFor(() => expect(el.querySelector(".nx-cl__item")).not.toBe(null));
    const titles = () => [...el.querySelectorAll(".nx-cl__item .nx-cl__t")].map((t) => t.textContent);
    // Primero los que tienen vencidos (por fecha límite; sin fecha, después), luego por fecha.
    expect(titles()).toEqual(["Cierre de septiembre", "Auditoría de inventario Q3", "Apertura de caja", "Alistamiento del camión TKR-512"]);
    const cierre = [...el.querySelectorAll<HTMLElement>(".nx-cl__item")][0];
    expect(nb(cierre.querySelector(".nx-cl__m")!.textContent)).toMatch(/^18\/24 3 vencidos vence 5 ene 2099$/);
    expect(cierre.querySelector<HTMLElement>(".nx-cl__bar")!.style.getPropertyValue("--p")).toBe("75%");
    // `href` seguro: enlace; `javascript:` no.
    const items = [...el.querySelectorAll<HTMLElement>(".nx-cl__item")];
    expect(items[1].localName).toBe("button");
    expect(items[3].localName).toBe("a");
    expect(items[3].getAttribute("href")).toBe("/procedimientos/tkr");
    expect(items[3].dataset.s).toBe("done");
    const opened: string[] = [];
    el.addEventListener("nx-checklist-open", (e) => opened.push((e as CustomEvent).detail.item.id));
    items[0].click();
    expect(opened).toEqual(["cierre"]);
    const sel = $<HTMLSelectElement>(el, "select");
    sel.value = "title";
    sel.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(el.querySelector(".nx-cl__item")).not.toBe(null));
    expect(titles()).toEqual(["Alistamiento del camión TKR-512", "Apertura de caja", "Auditoría de inventario Q3", "Cierre de septiembre"]);
    expect($<HTMLSelectElement>(el, "select").value).toBe("title");
  });
});

describe("<nx-checklist>: robustez", () => {
  it("props puestas antes de registrar el elemento", () => {
    const el = document.createElement("nx-checklist-tarde") as NxChecklist;
    const self = el as unknown as Record<string, unknown>;
    self.steps = [{ id: "a", title: "Abrir la caja" }];
    self.state = { a: { status: "done", by: LAURA, at: ago(60_000) } };
    self.labels = { progress: "{done}/{total} pasos" };
    self.heading = "Apertura de caja";
    document.body.append(el);
    customElements.define("nx-checklist-tarde", class extends NxChecklist {});
    expect($(el, ".nx-cl__title").textContent).toBe("Apertura de caja");
    expect($(el, ".nx-cl__sum").textContent).toBe("1/1 pasos");
    expect(el.steps).toEqual([{ id: "a", title: "Abrir la caja" }]);
  });

  it("atributos JSON: se leen; uno inválido avisa y deja lo que había", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount();
    el.setAttribute("labels", '{"markDone":"Listo","skip":5}');
    expect(el.labels.markDone).toBe("Listo");
    expect(el.labels.skip).toBe(CHECKLIST_LABELS.skip);
    el.setAttribute("labels", "{roto");
    el.setAttribute("steps", "[roto");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(el.labels.markDone).toBe("Listo");
    expect(el.steps.length).toBe(8);
    el.setAttribute("steps", '[{"id":"x","title":"Solo uno"}]');
    expect(el.querySelectorAll(".nx-cl__step").length).toBe(1);
  });

  it("dependencias en ciclo: aviso en consola y no se bloquean para siempre", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount("", {
      steps: [
        { id: "a", title: "A", dependsOn: ["b"] },
        { id: "b", title: "B", dependsOn: ["a"] },
      ],
      state: {},
    });
    expect(warn.mock.calls[0][0]).toMatch(/ciclo.*a, b/);
    expect([row(el, "a").dataset.s, row(el, "b").dataset.s]).toEqual(["todo", "todo"]);
  });

  it("labels y locale: textos propios y formato del locale", async () => {
    const el = mount(`locale='en-US'`, {
      labels: { markDone: "Mark as done", missing: "Missing: {list}", range: "Between {min} and {max}", progress: "{done} of {total}", overdue: "1 overdue|{n} overdue" },
      steps: [{ id: "n", title: "Count", evidence: [{ type: "number", label: "Sheets", min: 1000, max: 2000 }] }],
      state: {},
    });
    expect(el.locale).toBe("en-US");
    await open(el, "n");
    expect(nb($(el, ".nx-cl__range").textContent)).toBe("Between 1,000 and 2,000");
    expect(act(el, "done").textContent).toBe("Mark as done");
    expect($(el, ".nx-cl__miss").textContent).toBe("Missing: Sheets");
    typeIn($<HTMLInputElement>(el, ".nx-cl__num"), "1,500.5");
    act(el, "done").click();
    expect(el.state.n.evidence).toEqual([{ type: "number", value: 1500.5 }]);
    el.locale = "es-CO";
    await open(el, "n");
    expect(nb($(el, ".nx-cl__val").textContent)).toBe("1.500,5");
    expect($(el, ".nx-cl__sum").textContent).toBe("1 of 1");
  });

  it("300 pasos: filas livianas y solo el abierto con detalle", async () => {
    const many: ChecklistStep[] = Array.from({ length: 300 }, (_, i) => ({ id: `p${i}`, title: `Paso ${i + 1}`, section: `Sección ${Math.floor(i / 30) + 1}`, evidence: [{ type: "note" }], dependsOn: i ? [`p${i - 1}`] : [] }));
    const t0 = performance.now();
    const el = mount("", { steps: many, state: {} });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(el.querySelectorAll(".nx-cl__step").length).toBe(300);
    expect(el.querySelectorAll("textarea, input").length).toBe(0);
    await open(el, "p0");
    expect(el.querySelectorAll(".nx-cl__panel .nx-cl__fields textarea").length).toBe(1);
    typeIn($(el, ".nx-cl__panel textarea"), "ok");
    // Marcar uno solo toca las filas que cambian.
    const untouched = $(row(el, "p200"), ".nx-cl__t");
    act(el, "done").click();
    expect($(row(el, "p200"), ".nx-cl__t")).toBe(untouched);
    expect(row(el, "p1").dataset.s).toBe("todo");
    expect(row(el, "p2").dataset.s).toBe("blocked");
    // Con `sequential`, todos dicen cuál va primero (el primero sin hacer).
    el.sequential = true;
    expect(nb($(row(el, "p250"), ".nx-cl__chip--blocked").textContent)).toBe("Primero: Paso 2");
  });

  it("desconectar limpia el reloj, el oyente de `online` y el GET en curso", async () => {
    let seen: AbortSignal | undefined;
    server((_m, _u) => new Promise<Response>(() => {}));
    vi.mocked(fetch).mockImplementation((_i, init) => {
      seen = init?.signal ?? undefined;
      return new Promise(() => {});
    });
    const clear = vi.spyOn(globalThis, "clearInterval");
    const off = vi.spyOn(window, "removeEventListener");
    const el = mount(`endpoint='/api/p'`, { state: undefined });
    delete (el as unknown as Record<string, unknown>).state;
    await tick();
    expect(seen?.aborted).toBe(false);
    el.remove();
    expect(seen?.aborted).toBe(true);
    expect(clear).toHaveBeenCalled();
    expect(off.mock.calls.some(([type]) => type === "online")).toBe(true);
  });
});
