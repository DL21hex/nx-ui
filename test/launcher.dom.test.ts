// @vitest-environment happy-dom
//
// happy-dom no calcula cajas: las columnas se quedan con el CSS por defecto y las flechas avanzan en
// orden (la geometría se prueba en launcher.logic.test.ts). La View Transition entre páginas y el
// cambio de descripción por vistas al pasar el puntero (CSS) se ven en el navegador.
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/launcher/index";
import type { LauncherItem, LauncherSelectDetail, NxLauncher } from "../src/components/launcher/index";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
  sessionStorage.clear();
});
const tick = () => new Promise((r) => setTimeout(r, 0));

const ITEMS: LauncherItem[] = [
  {
    id: "cert",
    label: "Certificados laborales",
    icon: "file-text",
    description: "Genera tu certificado para bancos o arriendos.",
    section: "Trámites",
    views: [
      { label: "Con salario", href: "/cert?con=1" },
      { label: "Sin salario", href: "/cert?con=0" },
    ],
    signal: { value: "12 sep", label: "tu último certificado" },
  },
  {
    id: "perm",
    label: "Permisos",
    description: "Pide tus permisos y aprueba los de tu equipo.",
    section: "Trámites",
    href: "/permisos",
    views: [{ label: "Propias", href: "/permisos/propias" }, { label: "De mis colaboradores", href: "/permisos/equipo", badge: 3 }],
    signal: { value: 3, label: "por aprobar", note: "el más antiguo, hace 2 días", tone: "warning" },
  },
  {
    id: "pay",
    label: "Desprendibles de pago",
    section: "Trámites",
    views: [{ label: "Última", hint: "15 sep 2026", href: "/pagos/ultima" }, { label: "Todas", href: "/pagos" }],
    signal: { value: 1284, label: "artículos", trend: [3, 5, 4, 8] },
  },
  { id: "ces", label: "Cesantías", section: "Ahorro", href: "/cesantias", signal: { label: "Torres del Parque", meter: 71 } },
];

async function mount(attrs = "", items: LauncherItem[] = ITEMS): Promise<NxLauncher> {
  document.body.innerHTML = `<nx-launcher locale="es-CO" ${attrs}></nx-launcher>`;
  const el = document.querySelector("nx-launcher")!;
  el.items = structuredClone(items);
  await tick();
  return el;
}
const card = (el: NxLauncher, key: string) => el.querySelector<HTMLElement>(`.nx-launcher__card[data-key="${key}"]`)!;
const link = (el: NxLauncher, key: string) => card(el, key).querySelector<HTMLElement>(".nx-launcher__link")!;
const views = (el: NxLauncher, key: string) => [...card(el, key).querySelectorAll<HTMLElement>(".nx-launcher__view")];
const selects = (el: NxLauncher) => {
  const log: LauncherSelectDetail[] = [];
  el.addEventListener("nx-launcher-select", (e) => log.push(e.detail));
  return log;
};
const click = (target: HTMLElement, init: MouseEventInit = {}) => target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
const key = (target: Element, k: string) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("pintado", () => {
  it("agrupa por sección con títulos y una lista por sección", async () => {
    const el = await mount();
    const nav = el.querySelector("nav.nx-launcher__nav")!;
    expect(nav.getAttribute("aria-label")).toBe("Módulos");
    const heads = [...el.querySelectorAll("h2.nx-launcher__heading")].map((h) => h.textContent);
    expect(heads).toEqual(["Trámites", "Ahorro"]);
    const grids = el.querySelectorAll("ul.nx-launcher__grid");
    expect(grids.length).toBe(2);
    expect(grids[0].getAttribute("aria-labelledby")).toBe(el.querySelector("h2")!.id);
    expect(grids[0].querySelectorAll(":scope > li").length).toBe(3);
    // Sin buscador, no hay campo.
    expect(el.querySelector("input")).toBeNull();
  });

  it("heading-level cambia el nivel de los títulos", async () => {
    const el = await mount('heading-level="3"');
    expect(el.querySelectorAll("h3.nx-launcher__heading").length).toBe(2);
    el.headingLevel = 4;
    await tick();
    expect(el.querySelectorAll("h4.nx-launcher__heading").length).toBe(2);
  });

  it("la tarjeta es un enlace (el suyo o el de su primera vista) descrito por la descripción y la señal", async () => {
    const el = await mount();
    expect(link(el, "perm").getAttribute("href")).toBe("/permisos");
    expect(link(el, "cert").getAttribute("href")).toBe("/cert?con=1");
    expect(link(el, "cert").textContent).toBe("Certificados laborales");
    const ids = link(el, "perm").getAttribute("aria-describedby")!.split(" ");
    expect(ids.map((id) => document.getElementById(id)?.className)).toEqual(["nx-launcher__desc", "nx-launcher__signal"]);
    // Sin descripción: solo la señal.
    expect(link(el, "pay").getAttribute("aria-describedby")!.split(" ")).toHaveLength(1);
  });

  it("vistas con pista y contador; la tarjeta sin vistas no las anuncia", async () => {
    const el = await mount();
    const v = views(el, "perm");
    expect(v.map((a) => a.getAttribute("href"))).toEqual(["/permisos/propias", "/permisos/equipo"]);
    expect(v[1].querySelector(".nx-launcher__badge")!.textContent).toBe("3");
    expect(views(el, "pay")[0].querySelector(".nx-launcher__hint-text")!.textContent).toBe("15 sep 2026");
    expect(card(el, "perm").querySelector("ul.nx-launcher__views")!.getAttribute("aria-label")).toBe("Vistas de Permisos");
    expect(card(el, "perm").classList.contains("has-views")).toBe(true);
    expect(card(el, "ces").classList.contains("has-views")).toBe(false);
    expect(card(el, "ces").querySelector(".nx-launcher__views")).toBeNull();
  });

  it("señal: número con el locale, nota con tono, medidor y minigráfica", async () => {
    const el = await mount();
    expect(card(el, "pay").querySelector(".nx-launcher__value")!.textContent).toBe("1.284");
    expect(card(el, "cert").querySelector(".nx-launcher__value")!.textContent).toBe("12 sep");
    const note = card(el, "perm").querySelector(".nx-launcher__note")!;
    expect(note.textContent).toBe("el más antiguo, hace 2 días");
    expect(note.getAttribute("data-tone")).toBe("warning");
    expect(card(el, "ces").querySelector<HTMLElement>(".nx-launcher__meter i")!.getAttribute("style")).toBe("inline-size:71%");
    expect(card(el, "ces").querySelector(".nx-launcher__value")).toBeNull();
    const svg = card(el, "pay").querySelector("svg.nx-launcher__trend")!;
    expect(svg.querySelectorAll("path").length).toBe(2);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
  });

  it("el medidor se oye: su porcentaje va en texto para el lector y describe la tarjeta", async () => {
    const el = await mount();
    const sig = card(el, "ces").querySelector<HTMLElement>(".nx-launcher__signal")!;
    const sr = sig.querySelector(".nx-sr-only")!;
    expect(sr.textContent).toMatch(/^71\s?%$/); // con el locale (es-CO)
    expect(sr.closest("[aria-hidden]")).toBeNull();
    expect(link(el, "ces").getAttribute("aria-describedby")).toContain(sig.id);
  });

  it("las vistas ocultas con puntero siguen en el árbol de accesibilidad (sin visibility: hidden)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/components/launcher/launcher.css", "utf8");
    expect(css).not.toMatch(/visibility\s*:\s*hidden/);
  });

  it("destacada: dos columnas, línea superior y barra por partes con su leyenda", async () => {
    const el = await mount("", [
      {
        id: "resume",
        label: "Adjudicación de la RFQ-0412",
        featured: true,
        eyebrow: "Continuar donde ibas · hace 2 horas",
        href: "/adjudicacion/412",
        progress: [
          { label: "adjudicados", value: 38 },
          { label: "con sugerencia de la IA", value: 7 },
          { label: "sin decidir", value: 15 },
        ],
      },
      ...ITEMS,
    ]);
    const c = card(el, "resume");
    expect(c.classList.contains("is-featured")).toBe(true);
    expect(c.querySelector(".nx-launcher__eyebrow")!.textContent).toBe("Continuar donde ibas · hace 2 horas");
    expect([...c.querySelectorAll(".nx-launcher__bar i")].map((i) => i.getAttribute("data-part"))).toEqual(["0", "1", "2"]);
    expect(c.querySelector(".nx-launcher__bar i")!.getAttribute("style")).toBe("inline-size:63.33%");
    expect([...c.querySelectorAll(".nx-launcher__legend li")].map((li) => li.textContent)).toEqual(["38 adjudicados", "7 con sugerencia de la IA", "15 sin decidir"]);
  });

  it("un href inseguro no se pinta: la tarjeta queda como botón", async () => {
    const el = await mount("", [{ id: "x", label: "Malo", href: "javascript:alert(1)" }]);
    expect(link(el, "x").tagName).toBe("BUTTON");
    expect(el.querySelector("[href^='javascript']")).toBeNull();
  });

  it("si la primera vista tiene un href inseguro, la tarjeta va a la primera segura", async () => {
    const el = await mount("", [{ id: "x", label: "Mixta", views: [{ label: "Mala", href: "javascript:x" }, { label: "Buena", href: "/ok" }] }]);
    expect(link(el, "x").tagName).toBe("A");
    expect(link(el, "x").getAttribute("href")).toBe("/ok");
  });

  it("un nombre con «$'» o «$&» se escribe tal cual en los textos", async () => {
    const el = await mount("", [{ id: "x", label: "Pagos $' extra", views: [{ label: "Una", href: "/u" }] }]);
    expect(card(el, "x").querySelector("ul.nx-launcher__views")!.getAttribute("aria-label")).toBe("Vistas de Pagos $' extra");
  });

  it("el texto del backend nunca se interpreta como HTML", async () => {
    const el = await mount("", [{ id: "x", label: "<img src=x onerror=alert(1)>", description: "<b>hola</b>", signal: { value: "<i>1</i>" } }]);
    expect(el.querySelector("img, b:not(.nx-launcher__value), i")).toBeNull();
    expect(link(el, "x").textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("acepta items y labels como atributos JSON", async () => {
    document.body.innerHTML = `<nx-launcher items='[{"id":"a","label":"Uno","href":"/a"}]' labels='{"nav":"Trámites","views":"Pestañas de {name}","nope":1}'></nx-launcher>`;
    await tick();
    const el = document.querySelector("nx-launcher")!;
    expect(link(el, "a").getAttribute("href")).toBe("/a");
    expect(el.querySelector("nav")!.getAttribute("aria-label")).toBe("Trámites");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    el.setAttribute("items", "{no es json");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("cambiar los textos rehace también los de dentro de las tarjetas", async () => {
    const el = await mount();
    el.labels = { views: "Pestañas de {name}" };
    await tick();
    expect(card(el, "perm").querySelector("ul.nx-launcher__views")!.getAttribute("aria-label")).toBe("Pestañas de Permisos");
  });

  it("ids repetidos no se pisan", async () => {
    const el = await mount("", [
      { id: "a", label: "Uno" },
      { id: "a", label: "Dos" },
    ]);
    expect([...el.querySelectorAll<HTMLElement>(".nx-launcher__card")].map((c) => c.dataset.key)).toEqual(["a", "a#1"]);
  });
});

describe("actualizaciones", () => {
  it("si solo cambia la señal, la tarjeta es la misma y el dato se cambia en su sitio", async () => {
    const el = await mount();
    const before = card(el, "perm");
    el.items = el.items.map((it) => (it.id === "perm" ? { ...it, signal: { ...it.signal, value: 4 } } : it));
    await tick();
    expect(card(el, "perm")).toBe(before);
    expect(before.querySelector(".nx-launcher__value")!.textContent).toBe("4");
    // Sigue descrita por la señal nueva.
    const ids = link(el, "perm").getAttribute("aria-describedby")!.split(" ");
    expect(document.getElementById(ids[1])!.textContent).toContain("4");
  });

  it("si cambia la tarjeta se rehace, y el foco vuelve a ella", async () => {
    const el = await mount();
    const before = card(el, "perm");
    link(el, "perm").focus();
    el.items = el.items.map((it) => (it.id === "perm" ? { ...it, description: "Otra descripción" } : it));
    await tick();
    expect(card(el, "perm")).not.toBe(before);
    expect(card(el, "perm").querySelector(".nx-launcher__desc")!.textContent).toBe("Otra descripción");
    expect(document.activeElement).toBe(link(el, "perm"));
  });

  it("`data` de la app no decide el pintado (aunque sea circular)", async () => {
    const data: Record<string, unknown> = { ruta: "permisos" };
    data.self = data;
    const el = await mount();
    el.items = [{ ...ITEMS[1], data }];
    await tick();
    const log = selects(el);
    click(link(el, "perm"));
    expect(log[0].item.data).toBe(data);
  });

  it("reordenar mueve las tarjetas sin rehacerlas", async () => {
    const el = await mount();
    const ces = card(el, "ces");
    el.items = [...el.items].reverse();
    await tick();
    expect(card(el, "ces")).toBe(ces);
    expect(el.querySelector("h2")!.textContent).toBe("Ahorro");
  });
});

describe("abrir", () => {
  it("clic en la tarjeta o en una vista: nx-launcher-select con el ítem, la vista y el destino", async () => {
    const el = await mount();
    const log = selects(el);
    click(link(el, "perm"));
    click(views(el, "perm")[1]);
    expect(log.map((d) => [d.item.id, d.view?.label ?? null, d.href])).toEqual([
      ["perm", null, "/permisos"],
      ["perm", "De mis colaboradores", "/permisos/equipo"],
    ]);
  });

  it("cancelable: la app decide y el enlace no navega", async () => {
    const el = await mount();
    el.addEventListener("nx-launcher-select", (e) => e.preventDefault());
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link(el, "perm").dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("un clic con modificador es del navegador: no se anuncia", async () => {
    const el = await mount();
    const log = selects(el);
    click(link(el, "perm"), { ctrlKey: true });
    click(link(el, "perm"), { button: 1 });
    expect(log).toHaveLength(0);
  });

  it("la tarjeta abierta lleva los nombres de View Transitions un momento, y se recuerda para volver", async () => {
    vi.useFakeTimers();
    const el = await mountFake();
    click(link(el, "perm"));
    const c = card(el, "perm");
    expect(c.style.viewTransitionName).toBe("nx-launcher-card");
    expect(c.querySelector<HTMLElement>(".nx-launcher__icon")!.style.viewTransitionName).toBe("nx-launcher-icon");
    expect(c.querySelector<HTMLElement>(".nx-launcher__label")!.style.viewTransitionName).toBe("nx-launcher-label");
    expect(JSON.parse(sessionStorage.getItem("nx-launcher:from")!)).toEqual({ path: location.pathname, id: "perm" });
    // Abrir otra le quita los nombres a la anterior (dos elementos con el mismo nombre anulan la transición).
    click(link(el, "ces"));
    expect(c.style.viewTransitionName).toBe("");
    vi.advanceTimersByTime(2000);
    expect(card(el, "ces").style.viewTransitionName).toBe("");
  });

  it("reveal(): la tarjeta de la que se salió (o la pedida) recupera los nombres", async () => {
    vi.useFakeTimers();
    const el = await mountFake();
    click(link(el, "cert"));
    vi.advanceTimersByTime(2000);
    el.reveal();
    expect(card(el, "cert").style.viewTransitionName).toBe("nx-launcher-card");
    el.reveal("ces");
    expect(card(el, "cert").style.viewTransitionName).toBe("");
    expect(card(el, "ces").style.viewTransitionName).toBe("nx-launcher-card");
  });
});

/** Con relojes falsos, `setTimeout(0)` no avanza solo. */
async function mountFake(): Promise<NxLauncher> {
  document.body.innerHTML = `<nx-launcher locale="es-CO"></nx-launcher>`;
  const el = document.querySelector("nx-launcher")!;
  el.items = structuredClone(ITEMS);
  await Promise.resolve();
  return el;
}

describe("buscador", () => {
  it("apaga lo que no coincide sin moverlo, enciende las vistas y dice qué abre Enter", async () => {
    const el = await mount("search");
    const input = el.querySelector<HTMLInputElement>("input.nx-launcher__input")!;
    expect(el.querySelector(`label[for="${input.id}"]`)!.textContent).toBe("Ir a");
    const order = () => [...el.querySelectorAll<HTMLElement>(".nx-launcher__card")].map((c) => c.dataset.key);
    const before = order();
    input.value = "colab";
    input.dispatchEvent(new Event("input"));
    expect(order()).toEqual(before);
    expect(card(el, "cert").classList.contains("is-dim")).toBe(true);
    expect(card(el, "perm").classList.contains("is-dim")).toBe(false);
    expect(card(el, "perm").classList.contains("is-found")).toBe(true);
    expect(views(el, "perm").map((v) => v.classList.contains("is-hit"))).toEqual([false, true]);
    expect(el.querySelector(".nx-launcher__hint")!.textContent).toBe("Enter abre Permisos › De mis colaboradores");

    input.value = "xyz";
    input.dispatchEvent(new Event("input"));
    expect(el.querySelector(".nx-launcher__hint")!.textContent).toBe("Ningún módulo coincide.");
    expect(el.querySelectorAll(".nx-launcher__card.is-dim").length).toBe(4);
  });

  it("Enter abre la primera coincidencia; Escape limpia", async () => {
    const el = await mount("search");
    const log = selects(el);
    el.addEventListener("nx-launcher-select", (e) => e.preventDefault());
    const input = el.querySelector<HTMLInputElement>("input")!;
    input.value = "sin sal";
    input.dispatchEvent(new Event("input"));
    key(input, "Enter");
    expect(log.map((d) => [d.item.id, d.view?.label])).toEqual([["cert", "Sin salario"]]);
    key(input, "Escape");
    expect(input.value).toBe("");
    expect(el.query).toBe("");
    expect(el.querySelectorAll(".is-dim").length).toBe(0);
  });

  it("escribir con el foco en la página lleva al buscador; en otro campo, no", async () => {
    const el = await mount("search");
    document.body.insertAdjacentHTML("beforeend", '<input id="otro">');
    const input = el.querySelector<HTMLInputElement>(".nx-launcher__input")!;
    (document.activeElement as HTMLElement | null)?.blur();
    key(document.body, "p");
    expect(document.activeElement).toBe(input);
    const otro = document.getElementById("otro") as HTMLInputElement;
    otro.focus();
    key(otro, "p");
    expect(document.activeElement).toBe(otro);
  });

  it("el Enter que confirma una composición (IME) no abre nada", async () => {
    const el = await mount("search");
    const log = selects(el);
    const input = el.querySelector<HTMLInputElement>("input")!;
    input.value = "perm";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));
    expect(log).toEqual([]);
  });

  it("la propiedad query filtra también sin el campo", async () => {
    const el = await mount();
    el.query = "cesant";
    expect([...el.querySelectorAll<HTMLElement>(".nx-launcher__card:not(.is-dim)")].map((c) => c.dataset.key)).toEqual(["ces"]);
  });
});

describe("teclado", () => {
  it("las flechas pasan de una tarjeta a otra (entre secciones también); Inicio y Fin", async () => {
    const el = await mount();
    link(el, "cert").focus();
    key(link(el, "cert"), "ArrowRight");
    expect(document.activeElement).toBe(link(el, "perm"));
    key(link(el, "perm"), "End");
    expect(document.activeElement).toBe(link(el, "ces"));
    key(link(el, "ces"), "ArrowLeft");
    expect(document.activeElement).toBe(link(el, "pay"));
    key(link(el, "pay"), "Home");
    expect(document.activeElement).toBe(link(el, "cert"));
  });

  it("focusItem enfoca una tarjeta por id", async () => {
    const el = await mount();
    el.focusItem("pay");
    expect(document.activeElement).toBe(link(el, "pay"));
    el.focusItem();
    expect(document.activeElement).toBe(link(el, "cert"));
  });
});
