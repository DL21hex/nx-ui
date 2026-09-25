// @vitest-environment happy-dom
//
// <nx-button> ante lo que salió de la revisión: una pulsación larga que no se completa fuera de la
// página, un stream que se corta en `done` o al desconectarse, y un `stream` de otro origen.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NxButton } from "../src/index";
import "../src/index";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
const inner = (el: NxButton) => el.querySelector<HTMLButtonElement>(".nx-button__btn")!;
function mount(html: string): NxButton {
  document.body.innerHTML = html;
  return document.querySelector("nx-button")!;
}

describe("<nx-button> robusto", () => {
  it("hold: con el botón fuera de la página, la pulsación larga no dispara la acción", () => {
    vi.useFakeTimers();
    const el = mount('<nx-button label="Borrar" hold="1000"></nx-button>');
    const clicked = vi.fn();
    el.addEventListener("click", clicked);
    inner(el).dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
    vi.advanceTimersByTime(500);
    el.remove();
    vi.advanceTimersByTime(1000);
    expect(clicked).not.toHaveBeenCalled();
    expect(inner(el).dataset.holding).toBeUndefined();
  });

  it("hold: completo dentro de la página, sí dispara", () => {
    vi.useFakeTimers();
    const el = mount('<nx-button label="Borrar" hold="1000"></nx-button>');
    const clicked = vi.fn();
    el.addEventListener("click", clicked);
    inner(el).dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
    vi.advanceTimersByTime(1000);
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("stream: el resultado final cierra la tarea aunque el servidor deje la conexión abierta", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"msg":"Subiendo"}\n{"ok":true,"msg":"Publicado"}\n'));
        // Sin `close()`: la conexión sigue abierta.
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    const el = mount('<nx-button label="Publicar" stream="/publicar"></nx-button>');
    const done = new Promise<CustomEvent>((r) => el.addEventListener("nx-done", (e) => r(e as CustomEvent), { once: true }));
    inner(el).click();
    const ev = await done;
    expect(ev.detail.ok).toBe(true);
    expect(cancelled).toBe(true);
    expect(el.busy).toBe(false);
  });

  it("stream: al salir de la página se cancela la petición", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise<Response>((_, reject) => signal!.addEventListener("abort", () => reject(new DOMException("abort", "AbortError"))));
      }),
    );
    const el = mount('<nx-button label="Publicar" stream="/publicar"></nx-button>');
    inner(el).click();
    await Promise.resolve();
    expect(signal!.aborted).toBe(false);
    el.remove();
    expect(signal!.aborted).toBe(true);
  });

  it("stream de otro origen: no se pide", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount('<nx-button label="Publicar" stream="https://otro.example/publicar"></nx-button>');
    inner(el).click();
    expect(fetch).not.toHaveBeenCalled();
    expect(el.busy).toBe(false);
  });

  it("labels: solo las claves conocidas con texto", () => {
    const el = mount('<nx-button label="x"></nx-button>');
    el.labels = { busy: 5, done: "Hecho", raro: "y" } as never;
    expect(el.labels.busy).toBe("Procesando…");
    expect(el.labels.done).toBe("Hecho");
    expect("raro" in el.labels).toBe(false);
  });
});
