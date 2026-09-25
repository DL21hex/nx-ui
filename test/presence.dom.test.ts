// @vitest-environment happy-dom
//
// happy-dom no implementa la Popover API: se simula con los mismos eventos que emite el navegador
// (`beforetoggle` síncrono, `toggle` después).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PRESENCE_LABELS, type NxPresence, type PresenceEvent, type PresenceState } from "../src/components/presence/index";

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
});
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

const ANA = { id: "u-ana", name: "Ana Restrepo" };
const HECTOR = { id: "u-hector", name: "Héctor Pérez" };
const MARIANA = { id: "u-mariana", name: "Mariana Ríos" };
const CAMILO = { id: "u-camilo", name: "Camilo Suárez" };
const ME = { id: "u-yo", name: "Sofía Herrera" };

const FORM = `
  <form id="oc">
    <label for="f-prov">Proveedor</label><input id="f-prov" name="proveedor">
    <label for="f-monto">Monto</label><input id="f-monto" name="monto">
    <div data-presence="notas" data-presence-label="Notas internas"><textarea name="texto"></textarea></div>
    <button type="button" id="fuera">Fuera</button>
  </form>`;

function mount(attrs = "", withForm = false): NxPresence {
  document.body.innerHTML = `${withForm ? FORM : ""}<nx-presence ${attrs}></nx-presence>`;
  return document.querySelector("nx-presence")!;
}
function locals(el: NxPresence) {
  const out: PresenceEvent[] = [];
  el.addEventListener("nx-presence-local", (e) => out.push(e.detail));
  return out;
}
const stack = (el: NxPresence) => [...el.querySelectorAll<HTMLElement>(".nx-presence__stack > li")];
const layer = () => document.querySelector<HTMLElement>(".nx-presence__layer");
const notice = () => document.querySelector<HTMLElement>(".nx-presence__notice");
const focus = (sel: string) => {
  const t = document.querySelector<HTMLElement>(sel)!;
  const prev = document.activeElement as HTMLElement | null;
  t.focus();
  // happy-dom no siempre manda focusin/focusout con relatedTarget: se mandan a mano.
  if (prev && prev !== document.body) prev.dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: t }));
  t.dispatchEvent(new FocusEvent("focusin", { bubbles: true, relatedTarget: prev }));
  return t;
};
const type = (sel: string, text: string) => {
  const t = document.querySelector<HTMLInputElement>(sel)!;
  t.value += text;
  t.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("<nx-presence>: la pila", () => {
  it("sola, dice «Solo tú»; la lista tiene nombre", () => {
    const el = mount();
    expect(el.querySelector(".nx-presence__alone")!.textContent).toBe("Solo tú");
    expect(el.querySelector<HTMLElement>(".nx-presence__stack")!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>(".nx-presence__more")!.hidden).toBe(true);
    expect(el.querySelector(".nx-presence__stack")!.getAttribute("aria-label")).toBe("Personas aquí");
    expect(el.querySelector(".nx-presence__sr")!.getAttribute("role")).toBe("status");
    expect(el.users).toEqual([]);
  });

  it("push hace entrar a alguien: avatar con iniciales, color, nombre y qué hace", () => {
    const el = mount();
    const changes: PresenceState[][] = [];
    el.addEventListener("nx-presence-change", (e) => changes.push(e.detail.users));
    expect(el.push({ type: "join", user: ANA })).toBe(true);
    const [li] = stack(el);
    expect(li.querySelector(".nx-presence__face")!.textContent).toBe("AR");
    expect(li.querySelector<HTMLElement>(".nx-presence__face")!.style.getPropertyValue("--h")).toMatch(/^\d+$/);
    expect(li.querySelector(".nx-presence__vh")!.textContent).toBe("Ana Restrepo, viendo");
    expect(li.title).toBe("Ana Restrepo · viendo");
    expect(el.querySelector<HTMLElement>(".nx-presence__alone")!.hidden).toBe(true);
    expect(el.users).toMatchObject([{ id: "u-ana", name: "Ana Restrepo", field: null, idle: false }]);
    expect(changes).toHaveLength(1);
    // Lo que no se entiende no entra.
    expect(el.push('{"type":"join","user":{"name":"sin id"}}')).toBe(false);
    expect(el.push("{roto")).toBe(false);
    expect(stack(el)).toHaveLength(1);
  });

  it("la foto solo si es una URL segura; si no, las iniciales", () => {
    const el = mount();
    el.push({ type: "join", user: { id: "a", name: "Ana", avatar: "javascript:alert(1)" } });
    el.push({ type: "join", user: { id: "b", name: "Beto", avatar: "/fotos/beto.jpg" } });
    const [a, b] = stack(el);
    expect(a.querySelector("img")).toBeNull();
    expect(a.textContent).toContain("An");
    expect(b.querySelector("img")!.getAttribute("src")).toBe("/fotos/beto.jpg");
    expect(b.querySelector("img")!.getAttribute("alt")).toBe("");
  });

  it("«+N» con los que no caben, y la lista completa con la persona actual primero", () => {
    const el = mount('max="3"');
    el.me = ME;
    for (const u of [ANA, HECTOR, MARIANA, CAMILO]) el.push({ type: "join", user: u });
    expect(stack(el)).toHaveLength(2);
    const more = el.querySelector<HTMLButtonElement>(".nx-presence__more")!;
    expect(more.textContent).toBe("+2");
    expect(more.getAttribute("aria-label")).toBe("Ver a las 4 personas");
    expect(more.getAttribute("popovertarget")).toBe(el.querySelector(".nx-presence__pop")!.id);
    el.push({ type: "lock", user: HECTOR, field: "monto" });
    el.querySelector<HTMLElement>(".nx-presence__pop")!.showPopover();
    expect(more.getAttribute("aria-expanded")).toBe("true");
    const rows = [...el.querySelectorAll(".nx-presence__row .nx-presence__who")].map((r) => r.textContent);
    expect(rows).toEqual(["Sofía Herrera (tú)viendo", "Ana Restrepoviendo", "Héctor Pérezeditando monto", "Mariana Ríosviendo", "Camilo Suárezviendo"]);
    expect(el.querySelector(".nx-presence__title")!.textContent).toBe("En este registro5");
    // Sin desborde, el botón abre la lista igual (con otro nombre).
    el.max = 8;
    expect(more.getAttribute("aria-label")).toBe("Ver quién está aquí");
    expect(more.querySelector(".nx-glyph")).not.toBeNull();
  });

  it("inactivo: punto gris y «inactivo hace N min»", () => {
    const el = mount();
    el.push({ type: "heartbeat", user: ANA, idle: true });
    let [li] = stack(el);
    expect(li.hasAttribute("data-idle")).toBe(true);
    expect(li.title).toBe("Ana Restrepo · inactivo");
    // Sigue mandando latidos (no se va), y el texto se actualiza solo.
    for (let i = 0; i < 16; i++) {
      vi.advanceTimersByTime(15_000);
      el.push({ type: "heartbeat", user: ANA });
    }
    [li] = stack(el);
    expect(li.title).toBe("Ana Restrepo · inactivo hace 4 min");
    el.push({ type: "focus", user: ANA, field: "monto" });
    expect(stack(el)[0].hasAttribute("data-idle")).toBe(false);
  });

  it("los atributos JSON: me y labels", () => {
    const el = mount(`me='${JSON.stringify(ME)}' labels='{"alone":"Nadie más"}'`);
    expect(el.me).toEqual(ME);
    expect(el.querySelector(".nx-presence__alone")!.textContent).toBe("Nadie más");
    expect(el.labels.people).toBe(PRESENCE_LABELS.people);
  });
});

describe("<nx-presence>: lo que hace la persona actual", () => {
  it("entra al conectarse, enfoca, bloquea, escribe y suelta: nx-presence-local", () => {
    document.body.innerHTML = FORM;
    const el = document.createElement("nx-presence");
    el.setAttribute("for", "oc");
    el.me = ME;
    const got = locals(el);
    document.body.append(el);
    expect(got[0]).toEqual({ type: "join", user: ME, field: null, editing: false, idle: false });
    focus("#f-monto");
    expect(got.at(-1)).toEqual({ type: "focus", user: ME, field: "monto" });
    type("#f-monto", "1");
    expect(got.slice(-2).map((e) => e.type)).toEqual(["lock", "typing"]);
    type("#f-monto", "2");
    // «escribiendo» se avisa como mucho cada 1,2 s.
    expect(got.at(-1)!.type).toBe("typing");
    const n = got.length;
    type("#f-monto", "3");
    expect(got).toHaveLength(n);
    vi.advanceTimersByTime(1300);
    type("#f-monto", "4");
    expect(got.at(-1)).toEqual({ type: "typing", user: ME, field: "monto" });
    // De un campo a otro: solo `focus` del nuevo (sin `blur` en medio).
    focus("textarea");
    expect(got.at(-1)).toEqual({ type: "focus", user: ME, field: "notas" });
    expect(got.filter((e) => e.type === "blur")).toHaveLength(0);
    focus("#fuera");
    expect(got.at(-1)).toEqual({ type: "blur", user: ME, field: "notas" });
    el.remove();
    expect(got.at(-1)!.type).toBe("leave");
  });

  it("sin `me` solo escucha", () => {
    const el = mount('for="oc"', true);
    const got = locals(el);
    focus("#f-monto");
    type("#f-monto", "1");
    expect(got).toEqual([]);
  });

  it("latido cada 15 s; inactivo tras `idle` ms sin actividad, y al ocultar la pestaña", () => {
    const el = mount('idle="60000"');
    const got = locals(el);
    el.me = ME;
    vi.advanceTimersByTime(15_000);
    expect(got.filter((e) => e.type === "heartbeat")).toHaveLength(1);
    vi.advanceTimersByTime(46_000);
    const idle = got.find((e) => e.idle);
    expect(idle).toMatchObject({ type: "heartbeat", idle: true });
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(got.at(-1)).toMatchObject({ type: "heartbeat", idle: false });
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(got.at(-1)).toMatchObject({ type: "heartbeat", idle: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(got.at(-1)).toMatchObject({ type: "heartbeat", idle: false });
  });

  it("a quien entra se le responde con un latido (así nos ve de una vez)", () => {
    const el = mount();
    el.me = ME;
    const got = locals(el);
    el.push({ type: "join", user: ANA });
    expect(got).toEqual([{ type: "heartbeat", user: ME, field: null, editing: false, idle: false }]);
    // Y los eventos propios que devuelve el servidor se ignoran.
    el.push({ type: "join", user: ME });
    expect(el.users.map((u) => u.id)).toEqual(["u-ana"]);
  });
});

describe("<nx-presence>: campos compartidos", () => {
  it("contorno y etiqueta del color de quien enfoca; «está escribiendo…» mientras escribe", () => {
    const el = mount('for="oc"', true);
    el.push({ type: "focus", user: ANA, field: "monto" });
    const mark = layer()!.querySelector<HTMLElement>(".nx-presence__mark")!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.style.getPropertyValue("--h")).toMatch(/^\d+$/);
    expect(mark.textContent).toBe("Ana");
    expect(stack(el)[0].title).toBe("Ana Restrepo · en Monto");
    el.push({ type: "typing", user: ANA, field: "monto" });
    expect(mark.textContent).toBe("Ana está escribiendo…");
    expect(mark.hasAttribute("data-typing")).toBe(true);
    expect(stack(el)[0].title).toBe("Ana Restrepo · escribiendo en Monto…");
    vi.advanceTimersByTime(3100);
    expect(mark.textContent).toBe("Ana");
    expect(stack(el)[0].title).toBe("Ana Restrepo · editando Monto");
    // Al campo de al lado: la misma marca (se desliza); `data-presence` con su etiqueta propia.
    el.push({ type: "focus", user: ANA, field: "notas" });
    expect(layer()!.querySelectorAll(".nx-presence__mark")).toHaveLength(1);
    expect(stack(el)[0].title).toBe("Ana Restrepo · en Notas internas");
    el.push({ type: "blur", user: ANA, field: "notas" });
    expect(layer()!.querySelectorAll(".nx-presence__mark")).toHaveLength(0);
  });

  it("dos personas en el mismo campo: dos marcas en lugares distintos", () => {
    mount('for="oc"', true);
    document.querySelector("nx-presence")!.push({ type: "focus", user: ANA, field: "monto" });
    document.querySelector("nx-presence")!.push({ type: "focus", user: HECTOR, field: "monto" });
    expect([...layer()!.querySelectorAll<HTMLElement>(".nx-presence__mark")].map((m) => m.dataset.slot)).toEqual(["0", "1"]);
  });

  it("bloqueo suave: aviso al enfocar lo que otra persona edita; «Seguir» lo quita y el foco vuelve", () => {
    const el = mount('for="oc"', true);
    el.me = ME;
    el.push({ type: "lock", user: ANA, field: "monto" });
    expect(notice()).toBeNull();
    const input = focus("#f-monto");
    const n = notice()!;
    expect(n.getAttribute("role")).toBe("alert");
    expect(n.querySelector("p")!.textContent).toBe("Ana Restrepo está editando este campo; tus cambios podrían pisar los suyos.");
    const go = n.querySelector("button")!;
    expect(go.textContent).toBe("Seguir de todas formas");
    go.focus();
    go.click();
    expect(notice()).toBeNull();
    expect(document.activeElement).toBe(input);
    // No vuelve por la misma persona en el mismo campo…
    focus("#f-prov");
    focus("#f-monto");
    expect(notice()).toBeNull();
    // …hasta que lo suelta y lo retoma.
    el.push({ type: "unlock", user: ANA, field: "monto" });
    el.push({ type: "lock", user: ANA, field: "monto" });
    expect(notice()).not.toBeNull();
    // Esc también lo quita; salir del campo, también.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(notice()).toBeNull();
    el.push({ type: "unlock", user: ANA, field: "monto" });
    el.push({ type: "typing", user: ANA, field: "monto" });
    expect(notice()).not.toBeNull();
    focus("#fuera");
    expect(notice()).toBeNull();
  });
});

describe("<nx-presence>: latidos, salidas y anuncios", () => {
  it("sin latido en 45 s se va sola, y se anuncia agrupado", () => {
    const el = mount('for="oc"', true);
    const sr = el.querySelector(".nx-presence__sr")!;
    el.push({ type: "join", user: ANA });
    el.push({ type: "join", user: HECTOR });
    el.push({ type: "lock", user: HECTOR, field: "monto" });
    vi.advanceTimersByTime(700);
    expect(sr.textContent).toBe("Ana Restrepo y Héctor Pérez entraron. Héctor Pérez está editando Monto");
    vi.advanceTimersByTime(20_000);
    el.push({ type: "heartbeat", user: HECTOR });
    vi.advanceTimersByTime(30_000);
    expect(el.users.map((u) => u.id)).toEqual(["u-hector"]);
    vi.advanceTimersByTime(3_000);
    expect(sr.textContent).toBe("Ana Restrepo salió");
    el.push({ type: "leave", user: HECTOR });
    expect(el.users).toEqual([]);
    expect(el.querySelector(".nx-presence__alone")!.hasAttribute("hidden")).toBe(false);
  });

  it("al desconectarse: leave, y la capa de los campos se va", () => {
    const el = mount('for="oc"', true);
    el.me = ME;
    el.push({ type: "focus", user: ANA, field: "monto" });
    expect(layer()).not.toBeNull();
    const got = locals(el);
    el.remove();
    expect(got.map((e) => e.type)).toEqual(["leave"]);
    expect(layer()).toBeNull();
    expect(el.users).toEqual([]);
  });

  it("cambiar de `me` sale con el anterior y entra con el nuevo", () => {
    const el = mount();
    el.me = ME;
    const got = locals(el);
    el.me = ANA;
    expect(got.map((e) => [e.type, e.user.id])).toEqual([
      ["leave", "u-yo"],
      ["join", "u-ana"],
    ]);
  });
});

describe("<nx-presence channel>: entre pestañas", () => {
  it("dos elementos en el mismo canal se ven (BroadcastChannel)", async () => {
    vi.useRealTimers();
    if (typeof BroadcastChannel === "undefined") return;
    document.body.innerHTML = `<nx-presence id="a" channel="t-oc"></nx-presence><nx-presence id="b" channel="t-oc"></nx-presence><nx-presence id="c" channel="otro"></nx-presence>`;
    const [a, b, c] = [...document.querySelectorAll("nx-presence")];
    a.me = ANA;
    b.me = HECTOR;
    c.me = MARIANA;
    await vi.waitFor(() => {
      expect(a.users.map((u) => u.name)).toEqual(["Héctor Pérez"]);
      expect(b.users.map((u) => u.name)).toEqual(["Ana Restrepo"]);
    });
    expect(c.users).toEqual([]);
    b.remove();
    await vi.waitFor(() => expect(a.users).toEqual([]));
    a.remove();
    c.remove();
  });
});
