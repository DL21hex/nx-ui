// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import { BUTTON_LABELS, type NxButton } from "../src/index";

const flush = () => new Promise((r) => setTimeout(r, 0));
const inner = (el: NxButton) => el.querySelector<HTMLButtonElement>(".nx-button__btn")!;
const text = (el: NxButton) => el.querySelector(".nx-button__text")!.textContent;

function mount(html: string): NxButton {
  document.body.innerHTML = html;
  return document.querySelector("nx-button")!;
}

afterEach(() => vi.useRealTimers());

describe("<nx-button> render", () => {
  it("pinta un <button> nativo con la etiqueta; sin hijos del autor que mover", () => {
    const el = mount('<nx-button label="Publicar" variant="primary"></nx-button>');
    expect(inner(el).tagName).toBe("BUTTON");
    expect(inner(el).type).toBe("button");
    expect(inner(el).className).toContain("nx-button--primary");
    expect(text(el)).toBe("Publicar");
  });

  it("en HTML plano adopta el texto como etiqueta, aunque llegue después de conectar", async () => {
    const el = mount("<nx-button>Guardar</nx-button>");
    await flush();
    expect(el.label).toBe("Guardar");
    expect(el.querySelectorAll("button")).toHaveLength(2); // el botón y el conmutador del registro
  });

  it("la etiqueta es texto, nunca HTML", () => {
    const el = mount("<nx-button></nx-button>");
    el.label = "<img src=x onerror=alert(1)>";
    expect(el.querySelector("img")).toBeNull();
    expect(text(el)).toContain("<img");
  });
});

describe("<nx-button> ocupado", () => {
  it("busy: aria-busy, aria-disabled (sin soltar el foco), spinner y reloj", () => {
    const el = mount('<nx-button label="Publicar"></nx-button>');
    el.busy = true;
    const b = inner(el);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.getAttribute("aria-disabled")).toBe("true");
    expect(b.disabled).toBe(false);
    expect(el.querySelector(".nx-spinner")).not.toBeNull();
    expect(el.querySelector<HTMLElement>(".nx-button__time")!.hidden).toBe(false);
    expect(text(el)).toBe(BUTTON_LABELS.busy);
  });

  it("mientras está ocupado el clic no llega a la app", () => {
    const el = mount('<nx-button label="Publicar"></nx-button>');
    const spy = vi.fn();
    el.addEventListener("click", spy);
    el.busy = true;
    inner(el).click();
    expect(spy).not.toHaveBeenCalled();
    el.busy = false;
    inner(el).click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it("el ticker muestra el último mensaje y el registro lo acumula", () => {
    const el = mount('<nx-button label="Publicar"></nx-button>');
    el.log("Validando");
    el.log("Subiendo");
    expect(el.busy).toBe(true);
    expect(text(el)).toBe("Subiendo");
    expect(el.lines.map((l) => l.msg)).toEqual(["Validando", "Subiendo"]);
    expect(el.querySelector(".nx-button__toggle")!.textContent).toBe(`${BUTTON_LABELS.log} (2)`);
    expect(el.querySelector('[role="status"]')!.textContent).toBe("Subiendo");
  });

  it("progress: la barra toma el ancho; sin progreso es indeterminada", () => {
    const el = mount('<nx-button label="Publicar"></nx-button>');
    el.busy = true;
    const bar = el.querySelector<HTMLElement>(".nx-button__bar")!;
    expect(bar.classList.contains("nx-button__bar--indeterminate")).toBe(true);
    el.progress = 40;
    expect(bar.style.inlineSize).toBe("40%");
    expect(bar.classList.contains("nx-button__bar--indeterminate")).toBe(false);
  });

  it("log-mode inline despliega el registro mientras corre; ticker solo a pedido", () => {
    const el = mount('<nx-button label="A" log-mode="inline"></nx-button>');
    el.log("Paso 1");
    const panel = el.querySelector<HTMLElement>(".nx-button__log")!;
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector(".nx-button__line--run")!.textContent).toContain("Paso 1");

    const t = mount('<nx-button label="B"></nx-button>');
    t.log("Paso 1");
    expect(t.querySelector<HTMLElement>(".nx-button__log")!.hidden).toBe(true);
    t.querySelector<HTMLButtonElement>(".nx-button__toggle")!.click();
    expect(t.querySelector<HTMLElement>(".nx-button__log")!.hidden).toBe(false);
  });
});

describe("<nx-button> resultado", () => {
  beforeEach(() => vi.useFakeTimers());

  it("done(true): check, resumen con la duración, nx-done y vuelta a la etiqueta", () => {
    const el = mount('<nx-button label="Publicar"></nx-button>');
    const seen: boolean[] = [];
    el.addEventListener("nx-done", (e) => seen.push(e.detail.ok));
    el.log("Paso 1");
    el.done(true);
    expect(el.busy).toBe(false);
    expect(inner(el).dataset.result).toBe("ok");
    expect(text(el)).toMatch(/^Listo · \d/);
    expect(seen).toEqual([true]);
    vi.advanceTimersByTime(2300);
    expect(text(el)).toBe("Publicar");
    expect(inner(el).dataset.result).toBe("");
  });

  it("done(false, msg): el paso en curso y el mensaje quedan como error", () => {
    const el = mount('<nx-button label="Publicar"></nx-button>');
    el.log("Notificando");
    el.done(false, "SMTP 421");
    expect(inner(el).dataset.result).toBe("error");
    expect(text(el)).toBe("SMTP 421");
    expect(el.lines.map((l) => l.level)).toEqual(["error", "error"]);
  });

  it("run(): ocupa el botón, pasa log y progress, y un throw es un fallo", async () => {
    vi.useRealTimers();
    const el = mount('<nx-button label="Publicar"></nx-button>');
    const out = await el.run(async ({ log, progress }) => {
      expect(el.busy).toBe(true);
      log("Paso 1");
      progress(0.5);
      return 42;
    });
    expect(out).toBe(42);
    expect(inner(el).dataset.result).toBe("ok");

    await new Promise((r) => setTimeout(r, 2300));
    const bad = await el.run(() => {
      throw new Error("Sin conexión");
    });
    expect(bad).toBeUndefined();
    expect(text(el)).toBe("Sin conexión");
  });
});

describe("<nx-button> stream (BDUI)", () => {
  const chunks = (parts: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const p of parts) c.enqueue(new TextEncoder().encode(p));
        c.close();
      },
    });

  it("pinta cada línea NDJSON, aunque llegue partida en trozos", async () => {
    const fetchMock = vi.fn(async () => new Response(chunks(['{"msg":"Valid', 'ando"}\n{"msg":"Subiendo","progress":50}\n', '{"ok":true,"msg":"Publicado"}'])));
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('<nx-button label="Publicar" stream="/docs/publicar" log-mode="inline"></nx-button>');
    const done = new Promise<CustomEvent>((r) => el.addEventListener("nx-done", (e) => r(e), { once: true }));
    inner(el).click();
    const ev = await done;
    expect(fetchMock).toHaveBeenCalledWith("/docs/publicar", expect.objectContaining({ method: "POST", credentials: "same-origin" }));
    expect(ev.detail.ok).toBe(true);
    expect(el.lines.map((l) => l.msg)).toEqual(["Validando", "Subiendo", "Publicado"]);
    vi.unstubAllGlobals();
  });

  it('{"ok":false} o un HTTP de error terminan en fallo', async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(chunks(['{"msg":"Notificando"}\n{"ok":false,"msg":"SMTP 421"}\n']))));
    const el = mount('<nx-button label="Publicar" stream="/x"></nx-button>');
    let done = new Promise<CustomEvent>((r) => el.addEventListener("nx-done", (e) => r(e), { once: true }));
    inner(el).click();
    expect((await done).detail.ok).toBe(false);
    expect(el.lines.at(-1)!.msg).toBe("SMTP 421");

    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const el2 = mount('<nx-button label="Publicar" stream="/x"></nx-button>');
    done = new Promise<CustomEvent>((r) => el2.addEventListener("nx-done", (e) => r(e), { once: true }));
    inner(el2).click();
    expect((await done).detail.ok).toBe(false);
    expect(el2.lines.at(-1)!.msg).toBe("HTTP 500");
    vi.unstubAllGlobals();
  });

  it("un stream javascript: no se pide", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const el = mount('<nx-button label="X" stream="javascript:alert(1)"></nx-button>');
    inner(el).click();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(el.busy).toBe(false);
    vi.unstubAllGlobals();
  });

  it("render BDUI crea el botón con sus props", () => {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const [el] = render({ component: "Button", props: { label: "Publicar", stream: "/x", logMode: "inline" } }, host) as NxButton[];
    expect(el.tagName).toBe("NX-BUTTON");
    expect(el.stream).toBe("/x");
    expect(el.logMode).toBe("inline");
  });
});
