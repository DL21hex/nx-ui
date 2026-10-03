// @vitest-environment happy-dom
//
// <nx-button> ante lo que salió de la revisión de 2026-10: solo el clic del botón llega a la app
// (no el de «Registro», el panel o el hueco), el registro se agrega en vez de rehacerse, el botón
// de solo ícono, `busy` controlado, `type="reset"`, moverlo en el DOM y el toque largo.
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
const toggle = (el: NxButton) => el.querySelector<HTMLButtonElement>(".nx-button__toggle")!;
const panel = (el: NxButton) => el.querySelector<HTMLElement>(".nx-button__log")!;
function mount(html: string): NxButton {
  document.body.innerHTML = html;
  return document.querySelector("nx-button")!;
}

describe("<nx-button>: solo el clic del botón llega a la app", () => {
  it("«Registro», el panel y el hueco del envoltorio no disparan el clic de la app (con hold, ocupado o después)", () => {
    vi.useFakeTimers();
    const el = mount('<nx-button label="Borrar" hold="800" log-mode="inline"></nx-button>');
    const app = vi.fn();
    el.addEventListener("click", app);
    el.log("Paso 1");
    toggle(el).click(); // ocupado
    panel(el).click();
    el.click(); // el hueco: el objetivo es el propio envoltorio
    el.done(true);
    toggle(el).click(); // después de done(): no vuelve a lanzar la tarea ni se salta `hold`
    expect(app).not.toHaveBeenCalled();
    // El conmutador sigue funcionando.
    expect(toggle(el).getAttribute("aria-expanded")).toBe("true");
  });

  it("disabled: el clic del conmutador tampoco llega", () => {
    const el = mount('<nx-button label="A"></nx-button>');
    el.log("x");
    el.done(true);
    el.disabled = true;
    const app = vi.fn();
    el.addEventListener("click", app);
    toggle(el).click();
    expect(app).not.toHaveBeenCalled();
  });

  it("el clic del botón sí llega", () => {
    const el = mount('<nx-button label="A"></nx-button>');
    const app = vi.fn();
    el.addEventListener("click", app);
    inner(el).click();
    expect(app).toHaveBeenCalledOnce();
  });
});

describe("<nx-button> registro", () => {
  it("las filas se agregan y se actualizan en su lugar; progress no las toca", () => {
    const el = mount('<nx-button label="A" log-mode="inline"></nx-button>');
    el.log("Paso 1");
    const first = panel(el).firstElementChild;
    el.progress = 0.5;
    expect(panel(el).firstElementChild).toBe(first);
    el.log("Paso 2");
    const rows = [...panel(el).children];
    expect(rows[0]).toBe(first);
    expect(rows[0].className).toContain("nx-button__line--ok");
    expect(rows[1].className).toContain("nx-button__line--run");
    expect(rows[1].querySelector(".nx-button__cursor")).not.toBeNull();
    expect(rows[0].querySelector(".nx-button__cursor")).toBeNull();
    el.done(false, "Falló el paso 2");
    expect(rows[1].className).toContain("nx-button__line--error");
    expect(rows[1].querySelector(".nx-button__cursor")).toBeNull();
    expect(panel(el).children).toHaveLength(3);
  });

  it("una tarea nueva empieza el registro de cero", () => {
    const el = mount('<nx-button label="A" log-mode="inline"></nx-button>');
    el.log("Vieja");
    el.done(true);
    el.busy = true;
    el.log("Nueva");
    expect([...panel(el).children].map((r) => r.querySelector(".nx-button__m")!.textContent)).toEqual(["Nueva"]);
  });

  it("con el registro a la vista, el role=status no repite cada línea", () => {
    const el = mount('<nx-button label="A" log-mode="inline"></nx-button>');
    const status = el.querySelector('[role="status"]')!;
    el.log("Paso 1");
    expect(status.textContent).toBe("");
    const t = mount('<nx-button label="B"></nx-button>');
    t.log("Paso 1");
    expect(t.querySelector('[role="status"]')!.textContent).toBe("Paso 1");
  });
});

describe("<nx-button> props", () => {
  it("icon-only: el texto sigue siendo el nombre, con title", () => {
    const el = mount('<nx-button icon="trash" label="Borrar" icon-only></nx-button>');
    expect(inner(el).hasAttribute("data-icon-only")).toBe(true);
    expect(inner(el).title).toBe("Borrar");
    expect(el.querySelector(".nx-button__text")!.textContent).toBe("Borrar");
    el.iconOnly = false;
    expect(inner(el).hasAttribute("title")).toBe(false);
  });

  it("busy controlado (sin done) suelta el ancho fijo al terminar", () => {
    const el = mount('<nx-button label="Guardar"></nx-button>');
    Object.defineProperty(inner(el), "offsetWidth", { value: 120 });
    el.busy = true;
    expect(inner(el).style.minInlineSize).toBe("120px");
    el.busy = false;
    expect(inner(el).style.minInlineSize).toBe("");
  });

  it('type="reset" y name/value del botón de adentro', () => {
    const el = mount('<nx-button type="reset" label="Restablecer"></nx-button>');
    expect(inner(el).type).toBe("reset");
    const s = mount('<nx-button type="submit" name="accion" value="aprobar" label="Aprobar"></nx-button>');
    expect(inner(s).name).toBe("accion");
    expect(inner(s).value).toBe("aprobar");
    s.name = "";
    expect(inner(s).hasAttribute("name")).toBe(false);
  });

  it("hold: el toque largo no abre el menú del sistema mientras se mantiene", () => {
    vi.useFakeTimers();
    const el = mount('<nx-button label="Borrar" hold="1000"></nx-button>');
    expect(inner(el).hasAttribute("data-hold")).toBe(true);
    const menu = () => {
      const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      inner(el).dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(menu()).toBe(false);
    inner(el).dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
    expect(menu()).toBe(true);
  });
});

describe("<nx-button> stream y el DOM", () => {
  it("moverlo en el DOM (una lista que se reordena) no corta el stream", async () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => {
        signal = init.signal ?? undefined;
        return new Promise<Response>(() => {});
      }),
    );
    const el = mount('<div id="a"></div><nx-button label="Publicar" stream="/publicar"></nx-button>');
    inner(el).click();
    await Promise.resolve();
    document.getElementById("a")!.append(el);
    await Promise.resolve();
    expect(signal!.aborted).toBe(false);
    expect(el.busy).toBe(true);
  });

  it("cancelado al salir: falla sin el mensaje en inglés del navegador", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("The user aborted a request.", "AbortError"))))),
    );
    const el = mount('<nx-button label="Publicar" stream="/publicar"></nx-button>');
    const done = new Promise<CustomEvent>((r) => el.addEventListener("nx-button-done", (e) => r(e), { once: true }));
    inner(el).click();
    await Promise.resolve();
    el.remove();
    const ev = await done;
    expect(ev.detail.ok).toBe(false);
    expect(el.lines.map((l) => l.msg)).not.toContain("The user aborted a request.");
  });
});
