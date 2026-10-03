// @vitest-environment happy-dom
// Cambiar el `lang` de la página (el selector de idioma de nx-account pone `<html lang>`) repinta y
// reparsea los componentes conectados: un solo observador compartido, perezoso.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/index";
import { unwatchLang, watchLang } from "../src/core/locale";
import type { GridColumn, NxFields, NxGrid, NxTabs } from "../src/index";

const tick = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.lang = "es-CO";
  vi.restoreAllMocks();
});

describe("el `lang` de la página", () => {
  it("watchLang: un solo MutationObserver, creado con el primero y desconectado con el último", async () => {
    const Real = globalThis.MutationObserver;
    let made = 0;
    let live = 0;
    class Counting extends Real {
      constructor(cb: MutationCallback) {
        super(cb);
        made++;
      }
      observe(t: Node, o?: MutationObserverInit) {
        if (o?.attributeFilter?.includes("lang")) live++;
        super.observe(t, o);
      }
      disconnect() {
        live = Math.max(0, live - 1);
        super.disconnect();
      }
    }
    vi.stubGlobal("MutationObserver", Counting);
    try {
      document.documentElement.lang = "es-CO";
      const a = document.createElement("div");
      const b = document.createElement("div");
      const own = document.createElement("div");
      own.setAttribute("locale", "pt-BR");
      document.body.append(a, b, own);
      const calls: string[] = [];
      watchLang(a, (old, now) => calls.push(`a:${old}>${now}`));
      watchLang(b, (old, now) => calls.push(`b:${old}>${now}`));
      watchLang(own, () => calls.push("own"));
      expect(made).toBe(1);
      expect(live).toBe(1);
      document.documentElement.lang = "en-US";
      await tick();
      // Con `locale` propio no cambia nada: no se le avisa.
      expect(calls).toEqual(["a:es-CO>en-US", "b:es-CO>en-US"]);
      // Otro cambio de atributo que no mueve el locale resuelto tampoco avisa.
      document.documentElement.lang = "en-us";
      await tick();
      expect(calls).toHaveLength(2);
      unwatchLang(a);
      unwatchLang(b);
      expect(live).toBe(1);
      unwatchLang(own);
      expect(live).toBe(0);
      document.documentElement.lang = "fr-FR";
      await tick();
      expect(calls).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("nx-grid repinta los montos y lee lo que se escribe con el nuevo locale", async () => {
    document.documentElement.lang = "es-CO";
    document.body.innerHTML = `<nx-grid></nx-grid>`;
    const el = document.querySelector<NxGrid>("nx-grid")!;
    el.columns = [{ key: "m", label: "Monto", type: "number", editable: true }] as GridColumn[];
    el.rows = [{ id: "1", m: 1234.5 }];
    await tick();
    const cell = () => el.querySelector('[data-r="0"] > [data-c="0"]')?.textContent;
    expect(cell()).toBe("1.234,5");
    document.documentElement.lang = "en-US";
    await tick();
    await tick();
    expect(cell()).toBe("1,234.5");
  });

  it("nx-fields repinta sus valores; uno con `locale` propio no cambia", async () => {
    document.documentElement.lang = "es-CO";
    document.body.innerHTML = `<nx-fields id="a"></nx-fields><nx-fields id="b" locale="es-CO"></nx-fields>`;
    const [a, b] = [...document.querySelectorAll<NxFields>("nx-fields")];
    for (const f of [a, b]) f.items = [{ key: "n", label: "N", value: 4850000.5, format: "number" }];
    await tick();
    const dd = (f: NxFields) => f.querySelector("dd")!.textContent;
    expect(dd(a)).toBe("4.850.000,5");
    document.documentElement.lang = "en-US";
    await tick();
    await tick();
    expect(dd(a)).toBe("4,850,000.5");
    expect(dd(b)).toBe("4.850.000,5");
  });

  it("nx-tabs repinta los contadores (no observa `locale`: se suscribe solo)", async () => {
    document.documentElement.lang = "es-CO";
    document.body.innerHTML = `<nx-tabs></nx-tabs>`;
    const t = document.querySelector<NxTabs>("nx-tabs")!;
    t.tabs = [{ value: "a", label: "Alfa", count: 12345 }];
    await tick();
    expect(t.querySelector('[role="tab"]')!.textContent).toContain("12.345");
    document.documentElement.lang = "en-US";
    await tick();
    await tick();
    expect(t.querySelector('[role="tab"]')!.textContent).toContain("12,345");
  });

  it("desconectado, un componente deja de seguir el `lang`", async () => {
    document.documentElement.lang = "es-CO";
    document.body.innerHTML = `<nx-fields></nx-fields>`;
    const f = document.querySelector<NxFields>("nx-fields")!;
    f.items = [{ key: "n", label: "N", value: 1234.5, format: "number" }];
    const spy = vi.spyOn(f, "attributeChangedCallback");
    f.remove();
    document.documentElement.lang = "en-US";
    await tick();
    expect(spy).not.toHaveBeenCalled();
  });
});
