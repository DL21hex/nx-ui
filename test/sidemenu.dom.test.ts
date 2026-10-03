// @vitest-environment happy-dom
//
// Render, ARIA y eventos. Lo que depende de la capa superior del navegador (abrir un popover,
// el drawer, el foco al cerrar) no existe en happy-dom: va con un remedo de la Popover API en
// sidemenu.popover.dom.test.ts, y en el navegador en e2e/sidemenu.spec.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "../src/bdui";
import { renderChildPanel } from "../src/components/sidemenu/flyout";
import { DEFAULT_LABELS, type MenuItem, type NxSidemenu } from "../src/index";

const MENU: MenuItem[] = [
  { id: "home", label: "Inicio", href: "/" },
  {
    id: "seg",
    label: "Seguridad Física",
    icon: "shield",
    children: [
      { id: "porteria", label: "Portería", href: "/seg/porteria", description: "Quién está en planta" },
      { id: "visitas", label: "Visitas", href: "/seg/visitas", section: "Registro" },
      { id: "reportes", label: "Reportes", href: "/seg/reportes", utility: true },
    ],
  },
  { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos", section: "Ventas" },
];

const flush = () => new Promise((r) => setTimeout(r, 0));
/** El texto visible de una fila (sin las iniciales del ícono, que son aria-hidden). */
const label = (row: Element | null) => row?.querySelector(".nx-sidemenu__label, .nx-panel__label")?.textContent;

async function mount(inner = "", setup?: (el: NxSidemenu) => void): Promise<NxSidemenu> {
  document.body.innerHTML = `<nx-sidemenu>${inner}</nx-sidemenu>`;
  const el = document.querySelector("nx-sidemenu")!;
  setup?.(el);
  await flush();
  return el;
}

// Un clic sobre un <a> en happy-dom intentaría navegar: el body lo frena después de que el
// host haya hecho lo suyo (el host está más abajo en la propagación).
let bodyClicks: boolean[] = [];
const stopNav = (e: Event) => {
  bodyClicks.push(e.defaultPrevented);
  e.preventDefault();
};
beforeEach(() => {
  bodyClicks = [];
  document.body.addEventListener("click", stopNav);
});
afterEach(() => document.body.removeEventListener("click", stopNav));

describe("<nx-sidemenu> render", () => {
  it("pinta secciones, hojas como enlaces y padres como disparadores de su flotante", async () => {
    const el = await mount("", (m) => {
      m.items = MENU;
      m.active = "/ventas/pedidos/42";
    });
    expect(el.querySelector(".nx-sidemenu__section")?.textContent).toBe("Ventas");
    const current = el.querySelector('a[aria-current="page"]')!;
    expect(label(current)).toBe("Pedidos");
    expect(current.getAttribute("href")).toBe("/ventas/pedidos");

    const parent = el.querySelector<HTMLButtonElement>("button[popovertarget]")!;
    expect(parent.getAttribute("aria-haspopup")).toBe("dialog");
    expect(parent.getAttribute("aria-expanded")).toBe("false");
    const fly = el.querySelector(`#${parent.getAttribute("popovertarget")}`)!;
    expect(fly.getAttribute("popover")).toBe("auto");
    expect(fly.getAttribute("role")).toBe("dialog");
  });

  it("marca al padre que contiene la pantalla activa, sin aria-current", async () => {
    const el = await mount("", (m) => {
      m.items = MENU;
      m.active = "/seg/visitas";
    });
    const parent = el.querySelector("button[popovertarget]")!;
    expect(parent.hasAttribute("data-active")).toBe(true);
    expect(parent.hasAttribute("aria-current")).toBe(false);
  });

  it("las etiquetas son texto, nunca HTML", async () => {
    const el = await mount("", (m) => {
      m.items = [{ id: "x", label: '<img src=x onerror="alert(1)">', href: "/x" }];
    });
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("a")?.textContent).toContain("<img");
  });

  it("descarta un href javascript: (queda como botón sin destino)", async () => {
    const el = await mount("", (m) => {
      m.items = [{ id: "x", label: "Malo", href: "javascript:alert(1)" }];
    });
    expect(el.querySelector("a")).toBeNull();
    expect(label(el.querySelector("button.nx-sidemenu__item"))).toBe("Malo");
  });

  it("acepta los ítems como JSON en el atributo, y un JSON roto solo avisa", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = await mount("", (m) => m.setAttribute("items", JSON.stringify(MENU)));
    expect(el.querySelectorAll(".nx-sidemenu__item")).toHaveLength(3);
    el.setAttribute("items", "{roto");
    await flush();
    expect(warn).toHaveBeenCalled();
    expect(el.querySelectorAll(".nx-sidemenu__item")).toHaveLength(3);
    warn.mockRestore();
  });

  it("quitar el atributo items o labels vuelve al valor por defecto", async () => {
    const el = await mount("", (m) => {
      m.setAttribute("items", JSON.stringify(MENU));
      m.setAttribute("labels", JSON.stringify({ nav: "Navegación" }));
    });
    expect(el.labels.nav).toBe("Navegación");
    el.removeAttribute("items");
    el.removeAttribute("labels");
    await flush();
    expect(el.querySelectorAll(".nx-sidemenu__item")).toHaveLength(0);
    expect(el.labels).toEqual(DEFAULT_LABELS);
  });

  it("no mueve los hijos del autor: solo añade su contenedor al final", async () => {
    const el = await mount('<div slot="header">Marca</div><div slot="footer">Perfil</div>', (m) => (m.items = MENU));
    const kids = [...el.children].map((c) => c.getAttribute("slot") ?? c.className);
    expect(kids).toEqual(["header", "footer", "nx-sidemenu__body", "nx-sidemenu__tools"]);
    // Reconectar no duplica nada.
    document.body.append(el);
    await flush();
    expect(el.children).toHaveLength(4);
  });

  it("sin ícono registrado pinta las iniciales", async () => {
    const el = await mount("", (m) => (m.items = MENU));
    const initials = [...el.querySelectorAll(".nx-icon--initials")].map((s) => s.textContent);
    expect(initials).toEqual(["In", "SF", "Pe"]);
  });
});

describe("<nx-sidemenu> compacto", () => {
  it("cada fila lleva aria-label (sin title, que no sale con el teclado); collapsed=\"false\" no cuenta", async () => {
    const el = await mount("", (m) => {
      m.items = MENU;
      m.setAttribute("collapsed", "false");
    });
    expect(el.collapsed).toBe(false);
    expect(el.querySelector(".nx-sidemenu__item")?.hasAttribute("aria-label")).toBe(false);
    el.collapsed = true;
    await flush();
    const first = el.querySelector(".nx-sidemenu__item")!;
    expect(first.getAttribute("aria-label")).toBe("Inicio");
    expect(first.hasAttribute("title")).toBe(false);
  });

  it("con el foco del teclado, una etiqueta flotante muestra el nombre; con un toque, no", async () => {
    const el = await mount("", (m) => {
      m.items = MENU;
      m.collapsed = true;
      m.collapsible = true;
    });
    const tip = () => el.querySelector<HTMLElement>(".nx-sidemenu__tip");
    const rows = el.querySelectorAll<HTMLElement>(".nx-sidemenu__item");
    rows[2].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(tip()?.textContent).toBe("Pedidos");
    expect(tip()?.getAttribute("aria-hidden")).toBe("true");
    el.querySelector<HTMLElement>("[data-nx-collapse]")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(tip()?.textContent).toBe(DEFAULT_LABELS.expand);
    // Un toque enfoca, pero la etiqueta se quedaría pegada: no sale.
    tip()!.textContent = "";
    rows[0].dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "touch" }));
    rows[0].dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(tip()!.textContent).toBe("");
    // Expandido, no hace falta.
    el.collapsed = false;
    await flush();
    rows[0].dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Tab" }));
    el.querySelector<HTMLElement>(".nx-sidemenu__item")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(tip()?.textContent ?? "").toBe("");
  });

  it("el botón de contraer emite nx-sidemenu-toggle, y cancelarlo deja el estado a la app", async () => {
    const el = await mount("", (m) => {
      m.items = MENU;
      m.collapsible = true;
    });
    const btn = () => el.querySelector<HTMLButtonElement>("[data-nx-collapse]")!;
    expect(btn().getAttribute("aria-label")).toBe(DEFAULT_LABELS.collapse);

    const seen: boolean[] = [];
    el.addEventListener("nx-sidemenu-toggle", (e) => seen.push(e.detail.collapsed));
    btn().click();
    expect(el.collapsed).toBe(true);
    await flush();
    expect(btn().getAttribute("aria-label")).toBe(DEFAULT_LABELS.expand);

    el.addEventListener("nx-sidemenu-toggle", (e) => e.preventDefault(), { once: true });
    btn().click();
    expect(seen).toEqual([true, false]);
    expect(el.collapsed).toBe(true);
  });
});

describe("<nx-sidemenu> badges", () => {
  const WITH_BADGES: MenuItem[] = [
    { id: "pend", label: "Pendientes", href: "/pendientes", badge: 120 },
    { id: "cero", label: "Sin nada", href: "/cero", badge: 0 },
    { id: "p", label: "Padre", badge: "Nuevo", children: [{ id: "h", label: "Hijo", href: "/h", badge: 4 }] },
  ];

  it("pinta el badge (con tope) y omite los vacíos", async () => {
    const el = await mount("", (m) => (m.items = WITH_BADGES));
    expect([...el.querySelectorAll(".nx-sidemenu__body .nx-badge")].map((b) => b.textContent)).toEqual(["99+", "Nuevo"]);
  });

  it("en compacto el badge entra en el nombre accesible", async () => {
    const el = await mount("", (m) => {
      m.items = WITH_BADGES;
      m.collapsed = true;
    });
    expect(el.querySelector('[data-nx-key="0"]')?.getAttribute("aria-label")).toBe("Pendientes (99+)");
    expect(el.querySelector('[data-nx-key="1"]')?.getAttribute("aria-label")).toBe("Sin nada");
  });

  it("el panel de hijos también lo pinta", () => {
    const { el } = renderChildPanel({ item: WITH_BADGES[2], active: null, labels: DEFAULT_LABELS, idPrefix: "b", keyOf: (c) => c.id, autofocus: false });
    expect(el.querySelector('[role="option"] .nx-badge')?.textContent).toBe("4");
  });
});

describe("<nx-sidemenu> auto-collapse", () => {
  const setWidth = async (width: number) => {
    (window as unknown as { happyDOM: { setViewport(v: { width: number; height: number }): void } }).happyDOM.setViewport({ width, height: 800 });
    await flush();
  };
  afterEach(() => setWidth(1024));

  it("contrae en tablet, expande al volver a escritorio y avisa con auto: true", async () => {
    await setWidth(1280);
    const seen: string[] = [];
    const el = await mount("", (m) => {
      m.items = MENU;
      m.autoCollapse = true;
      m.addEventListener("nx-sidemenu-toggle", (e) => seen.push(`${e.detail.collapsed}/${e.detail.auto}`));
    });
    expect(el.collapsed).toBe(false);
    await setWidth(900);
    expect(el.collapsed).toBe(true);
    await setWidth(1280);
    expect(el.collapsed).toBe(false);
    expect(seen).toEqual(["true/true", "false/true"]);
  });

  it("si el usuario lo expande en tablet, no se vuelve a contraer solo al salir", async () => {
    await setWidth(900);
    const el = await mount("", (m) => {
      m.items = MENU;
      m.autoCollapse = true;
      m.collapsible = true;
    });
    expect(el.collapsed).toBe(true);
    el.querySelector<HTMLButtonElement>("[data-nx-collapse]")!.click();
    expect(el.collapsed).toBe(false);
    await setWidth(1280);
    expect(el.collapsed).toBe(false);
  });

  it("reconectar el nodo (o reasignar auto-collapse) en tablet no le hace olvidar que lo contrajo él", async () => {
    await setWidth(1280);
    const el = await mount("", (m) => {
      m.items = MENU;
      m.autoCollapse = true;
    });
    await setWidth(900);
    expect(el.collapsed).toBe(true);
    document.body.prepend(el);
    el.autoCollapse = true;
    await flush();
    await setWidth(1280);
    expect(el.collapsed).toBe(false);
  });

  it("lo que el usuario expandió en tablet no se vuelve a contraer al reconectar", async () => {
    await setWidth(900);
    const el = await mount("", (m) => {
      m.items = MENU;
      m.autoCollapse = true;
      m.collapsible = true;
    });
    el.querySelector<HTMLButtonElement>("[data-nx-collapse]")!.click();
    expect(el.collapsed).toBe(false);
    document.body.prepend(el);
    await flush();
    expect(el.collapsed).toBe(false);
  });

  it("sin auto-collapse, el tamaño no toca el estado", async () => {
    await setWidth(900);
    const el = await mount("", (m) => (m.items = MENU));
    expect(el.collapsed).toBe(false);
  });
});

describe("<nx-sidemenu> nx-sidemenu-select", () => {
  it("se emite con el ítem; si no se cancela, el enlace sigue su curso", async () => {
    const el = await mount("", (m) => (m.items = MENU));
    const got: string[] = [];
    el.addEventListener("nx-sidemenu-select", (e) => got.push(`${e.detail.item.id} ${e.detail.href}`));
    el.querySelector<HTMLAnchorElement>('a[href="/ventas/pedidos"]')!.click();
    expect(got).toEqual(["pedidos /ventas/pedidos"]);
    expect(bodyClicks).toEqual([false]);
  });

  it("cancelarlo cancela el clic (un router propio decide)", async () => {
    const el = await mount("", (m) => (m.items = MENU));
    el.addEventListener("nx-sidemenu-select", (e) => e.preventDefault());
    el.querySelector<HTMLAnchorElement>('a[href="/"]')!.click();
    expect(bodyClicks).toEqual([true]);
  });

  it("un clic con modificador (abrir en otra pestaña) no se anuncia", async () => {
    const el = await mount("", (m) => (m.items = MENU));
    const spy = vi.fn();
    el.addEventListener("nx-sidemenu-select", spy);
    el.querySelector('a[href="/"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("panel de hijos", () => {
  /** El padre de MENU (3 hijos) más uno: con 4 ya lleva buscador. */
  const BIG: MenuItem = { ...MENU[1], children: [...MENU[1].children!, { id: "rondas", label: "Rondas", href: "/seg/rondas" }] };
  const panel = (item = BIG) =>
    renderChildPanel({
      item,
      active: MENU[1].children![1],
      labels: DEFAULT_LABELS,
      idPrefix: "t",
      keyOf: (c) => c.id,
      autofocus: false,
    });
  const keyOn = (target: HTMLElement) => (k: string) =>
    target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

  it("agrupa por sección, marca el activo y manda los utilitarios al pie", () => {
    const { el } = panel();
    expect(el.querySelector(".nx-panel__title")?.textContent).toBe("Seguridad Física");
    expect(el.querySelector(".nx-panel__section")?.textContent).toBe("Registro");
    expect(el.querySelector('[aria-current="page"]')?.textContent).toContain("Visitas");
    expect(label(el.querySelector(".nx-panel__utils .nx-panel__chip"))).toBe("Reportes");
  });

  it("con 3 hijos o menos no hay buscador: la lista toma el foco y el teclado", () => {
    const { el, input, focusEl } = panel(MENU[1]);
    expect(input).toBeNull();
    expect(el.querySelector(".nx-panel__search")).toBeNull();
    expect(el.querySelector(".nx-panel__head")!.classList.contains("nx-panel__head--rule")).toBe(true);
    expect(focusEl.getAttribute("role")).toBe("listbox");
    expect(focusEl.getAttribute("tabindex")).toBe("-1");
    document.body.append(el);
    keyOn(focusEl)("ArrowDown");
    expect(focusEl.getAttribute("aria-activedescendant")).toBe(el.querySelector('[aria-selected="true"]')!.id);
  });

  it("con más de 3 hijos sí hay buscador, y la lista no es enfocable", () => {
    const { input, focusEl, el } = panel();
    expect(input).not.toBeNull();
    expect(focusEl).toBe(input);
    expect(el.querySelector('[role="listbox"]')!.hasAttribute("tabindex")).toBe(false);
    expect(el.querySelector(".nx-panel__head")!.classList.contains("nx-panel__head--rule")).toBe(false);
  });

  it("filtra sin tildes ocultando (no recreando) y avisa cuando no hay resultados", () => {
    const { el, input } = panel();
    const before = [...el.querySelectorAll('[role="option"]')];
    input!.value = "porteria";
    input!.dispatchEvent(new Event("input"));
    expect(el.querySelectorAll('[role="option"]:not([hidden])')).toHaveLength(1);
    expect([...el.querySelectorAll('[role="option"]')]).toEqual(before);
    // El grupo «Registro» y los chips, sin nada que mostrar, se ocultan con su título.
    expect(el.querySelector<HTMLElement>(".nx-panel__section")!.parentElement!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>(".nx-panel__utils")!.hidden).toBe(true);
    expect(el.querySelector<HTMLElement>(".nx-panel__empty")!.hidden).toBe(true);
    input!.value = "zzz";
    input!.dispatchEvent(new Event("input"));
    expect(el.querySelectorAll('[role="option"]:not([hidden])')).toHaveLength(0);
    expect(el.querySelector<HTMLElement>(".nx-panel__empty")!.hidden).toBe(false);
    input!.value = "";
    input!.dispatchEvent(new Event("input"));
    expect(el.querySelectorAll('[role="option"]:not([hidden])')).toHaveLength(4);
  });

  it("al escribir queda resaltada la primera que coincide: Enter la elige sin pasar por ↓", () => {
    const { el, input } = panel();
    document.body.append(el);
    input!.value = "rond";
    input!.dispatchEvent(new Event("input"));
    const first = el.querySelector('[aria-selected="true"]')!;
    expect(label(first)).toBe("Rondas");
    expect(input!.getAttribute("aria-activedescendant")).toBe(first.id);
    const clicked = vi.fn();
    first.addEventListener("click", clicked);
    keyOn(input!)("Enter");
    expect(clicked).toHaveBeenCalledOnce();
    // Sin consulta no se resalta nada (Enter no elige al azar).
    input!.value = "";
    input!.dispatchEvent(new Event("input"));
    expect(el.querySelector('[aria-selected="true"]')).toBeNull();
  });

  it("un tercer nivel entra como sección con el nombre de su padre, y su hoja activa se marca", () => {
    const anual: MenuItem = { id: "anual", label: "Anual", href: "/ventas/reportes/anual" };
    const ventas: MenuItem = {
      id: "ventas",
      label: "Ventas",
      children: [
        { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos" },
        { id: "reportes", label: "Reportes", children: [{ id: "mensual", label: "Mensual", href: "/ventas/reportes/mensual" }, anual] },
      ],
    };
    const { el } = renderChildPanel({ item: ventas, active: anual, labels: DEFAULT_LABELS, idPrefix: "n", keyOf: (c) => c.id, autofocus: false });
    expect([...el.querySelectorAll('[role="option"]')].map(label)).toEqual(["Pedidos", "Mensual", "Anual"]);
    expect(el.querySelector(".nx-panel__section")?.textContent).toBe("Reportes");
    const current = el.querySelector('[aria-current="page"]')!;
    expect(label(current)).toBe("Anual");
    expect(current.getAttribute("data-nx-key")).toBe("anual");
    expect(current.getAttribute("href")).toBe("/ventas/reportes/anual");
  });

  it("las flechas mueven el resaltado (aria-activedescendant) y Enter hace clic", () => {
    const { el, input } = panel();
    document.body.append(el);
    const key = keyOn(input!);
    key("ArrowDown");
    const first = el.querySelector('[aria-selected="true"]')!;
    expect(input!.getAttribute("aria-activedescendant")).toBe(first.id);
    key("End");
    expect(label(el.querySelector('[aria-selected="true"]'))).toBe("Reportes");
    const clicked = vi.fn();
    el.addEventListener("click", clicked);
    key("Enter");
    expect(clicked).toHaveBeenCalledOnce();
  });
});

describe("BDUI", () => {
  it("render crea el elemento con sus props y descarta las que no declara", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const [el] = render({ component: "SideMenu", props: { items: MENU, active: "/", innerHTML: "<b>x</b>" } }, host) as NxSidemenu[];
    await flush();
    expect(el.tagName).toBe("NX-SIDEMENU");
    expect(label(el.querySelector('a[aria-current="page"]'))).toBe("Inicio");
    expect(el.querySelector("b")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("innerHTML"));
    render({ component: "NoExiste" }, host);
    expect(host.children).toHaveLength(0);
    warn.mockRestore();
  });
});
