// @vitest-environment happy-dom
//
// `nxConfirm()` falla cerrado: si no se sabe qué va a pasar, no se puede confirmar (salvo
// `failOpen`). Y solo confirma el clic del botón de adentro, que respeta la pulsación larga.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { nxConfirm, type NxButton, type NxDialog } from "../src/index";

beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover = function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
    fire(this, "closed");
  };
  Element.prototype.getClientRects = function () {
    return [{}] as unknown as DOMRectList;
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.querySelectorAll("nx-dialog").forEach((d) => (d as NxDialog).open && (d as NxDialog).close());
  document.body.innerHTML = "";
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const okButton = () => document.querySelector<NxDialog>("nx-dialog.nx-confirm")!.querySelectorAll<NxButton>("nx-button")[1];
const status = () => document.querySelector(".nx-confirm__status")!.textContent;

describe("nxConfirm() con impacto por URL", () => {
  it("un error del servidor deja el botón bloqueado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    void nxConfirm({ heading: "Anular", impact: "/impacto", hold: 0 });
    await sleep(20);
    expect(status()).toBe("No se pudo calcular el impacto");
    expect(okButton().disabled).toBe(true);
  });

  it("un evento `error` también bloquea", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"type":"error","message":"Sin conexión con contabilidad"}\n{"type":"done"}\n')));
    void nxConfirm({ heading: "Anular", impact: "/impacto", hold: 0 });
    await sleep(20);
    expect(status()).toBe("Sin conexión con contabilidad");
    expect(okButton().disabled).toBe(true);
  });

  it("un stream cortado antes de `done` es un impacto incompleto: bloquea", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response('{"type":"impact","label":"2 recepciones"}\n')));
    void nxConfirm({ heading: "Anular", impact: "/impacto", hold: 0 });
    await sleep(20);
    expect(document.querySelector(".nx-confirm__item")!.textContent).toContain("2 recepciones");
    expect(okButton().disabled).toBe(true);
  });

  it("con failOpen, un error deja confirmar (con el aviso a la vista)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x", { status: 500 })));
    const p = nxConfirm({ heading: "Anular", impact: "/impacto", hold: 0, failOpen: true });
    await sleep(20);
    expect(status()).toBe("No se pudo calcular el impacto");
    expect(okButton().disabled).toBe(false);
    okButton().querySelector("button")!.click();
    await expect(p).resolves.toBe(true);
  });

  it("un impacto completo habilita; `done` corta la lectura aunque la conexión siga abierta", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"type":"impact","label":"Factura"}\n{"type":"done"}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body)));
    void nxConfirm({ heading: "Anular", impact: "/impacto", hold: 0 });
    await sleep(20);
    expect(okButton().disabled).toBe(false);
    expect(cancelled).toBe(true);
  });

  it("una URL de otro origen no se pide y no deja confirmar", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    void nxConfirm({ heading: "Anular", impact: "https://otro.example/impacto", body: { secreto: 1 }, hold: 0 });
    await sleep(20);
    expect(fetch).not.toHaveBeenCalled();
    expect(okButton().disabled).toBe(true);
  });
});

describe("nxConfirm(): solo confirma el botón de adentro", () => {
  it("un click() sobre el envoltorio no se salta la pulsación larga", async () => {
    const p = nxConfirm({ heading: "Anular", impact: [{ label: "x" }] });
    okButton().click();
    expect(document.querySelector<NxDialog>("nx-dialog.nx-confirm")!.open).toBe(true);
    document.querySelector<NxDialog>("nx-dialog.nx-confirm")!.close();
    await expect(p).resolves.toBe(false);
  });
});

describe("nxConfirm() con View Transitions", () => {
  it("el aviso de apertura (que llega después) no cancela el pedido del impacto", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }));
    (document as unknown as { startViewTransition?: (cb: () => void) => object }).startViewTransition = (cb) => {
      const done = new Promise<void>((r) => setTimeout(() => (cb(), r())));
      return { finished: done, ready: done, updateCallbackDone: done };
    };
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        await sleep(15);
        return new Response('{"type":"impact","label":"2 recepciones"}\n{"type":"done"}\n');
      }),
    );
    document.body.innerHTML = `<button id="origen">Anular</button>`;
    void nxConfirm({ heading: "Anular", impact: "/impacto", hold: 0, origin: document.getElementById("origen")! });
    await sleep(40);
    delete (document as { startViewTransition?: unknown }).startViewTransition;
    expect(signal?.aborted).toBe(false);
    expect(document.querySelectorAll(".nx-confirm__item")).toHaveLength(1);
    expect(okButton().disabled).toBe(false);
  });
});
