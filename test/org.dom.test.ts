// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../src/components/org/index";
import type { NxOrg, OrgPerson, OrgUnit } from "../src/components/org/index";

const units: OrgUnit[] = [
  { id: "c1", name: "Agrovid", kind: "Empresa" },
  { id: "c2", name: "Quality", kind: "Empresa" },
  { id: "s1", name: "Finca La Esperanza", parent: "c1", kind: "Subdivisión" },
  { id: "s2", name: "Administración", parent: "c1", kind: "Subdivisión" },
  { id: "s3", name: "Planta", parent: "c2", kind: "Subdivisión" },
];
const people: OrgPerson[] = [
  { id: "1", name: "Marta Ríos", title: "Gerente", unit: "s2" },
  { id: "2", name: "Laura Gómez", title: "Directora", unit: "s2", boss: "1" },
  { id: "3", name: "Pedro Ruiz", title: "Analista", unit: "s1", boss: "2" },
  { id: "4", name: "Sofía León", title: "Analista", unit: "s1", boss: "2" },
  { id: "5", name: "Ana Díaz", title: "Operaria", unit: "s1", boss: "3" },
  { id: "6", name: "Juan Mora", title: "Contador", unit: "s2", boss: "1" },
  { id: "7", name: "Rosa Pinto", title: "Operaria", unit: "s3" },
];

const tick = () => new Promise((r) => setTimeout(r, 0));

async function mount(setup: (el: NxOrg) => void = () => {}): Promise<NxOrg> {
  const el = document.createElement("nx-org");
  setup(el);
  document.body.append(el);
  await tick();
  return el;
}

const text = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, " ").trim() ?? "";

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("<nx-org>: lente «Yo»", () => {
  it("pinta la cadena, el jefe, el centro, los pares y el equipo", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "3";
    });
    expect(el.view).toBe("me");
    expect(text(el.querySelector(".nx-org__crumbs"))).toContain("Marta Ríos");
    expect(text(el.querySelector(".nx-org__level--boss"))).toContain("Laura Gómez");
    expect(text(el.querySelector(".nx-org__person--center"))).toContain("Pedro Ruiz");
    expect(text(el.querySelector(".nx-org__person--center"))).toContain("Agrovid · Finca La Esperanza");
    expect(text(el.querySelector(".nx-org__peers"))).toContain("Sofía León");
    expect(text(el.querySelector(".nx-org__level--team"))).toContain("Ana Díaz");
  });

  it("al pulsar a alguien se centra en esa persona y dice el camino desde ti", async () => {
    const el = await mount((o) => {
      o.people = people;
      o.me = "5";
    });
    el.querySelector<HTMLButtonElement>('.nx-org__crumbs [data-person="1"]')!.click();
    await tick();
    expect(el.center).toBe("1");
    expect(text(el.querySelector(".nx-org__path"))).toContain("Marta Ríos está en tu cadena de mando");
    el.querySelector<HTMLButtonElement>('button[data-person="6"]')!.click();
    await tick();
    expect(text(el.querySelector(".nx-org__path"))).toContain("Tu jefe común con Juan Mora es Marta Ríos");
    el.querySelector<HTMLButtonElement>('[data-act="home"]')!.click();
    await tick();
    expect(el.center).toBe("5");
    expect(el.querySelector(".nx-org__path")).toBeNull();
  });

  it("sin jefe lo dice; una persona locked se ve pero no se abre", async () => {
    const el = await mount((o) => {
      o.people = [
        { id: "1", name: "Marta Ríos" },
        { id: "2", name: "Laura Gómez", boss: "1", locked: true },
        { id: "3", name: "Pedro Ruiz", boss: "1" },
      ];
      o.me = "1";
    });
    expect(text(el.querySelector(".nx-org__level--boss"))).toBe("Sin jefe asignado");
    expect(el.querySelector('button[data-person="2"]')).toBeNull();
    expect(el.querySelector('[data-person="2"]')).not.toBeNull();
    expect(el.querySelector('button[data-person="3"]')).not.toBeNull();
  });

  it("«Para… / Acudes a…» solo en el centro propio", async () => {
    const el = await mount((o) => {
      o.people = people;
      o.me = "3";
      o.contacts = [
        { label: "Aprobar vacaciones", person: "2" },
        { label: "Nómina", text: "Equipo de nómina · Sede Cali" },
      ];
    });
    const dl = el.querySelector(".nx-org__contacts");
    expect(text(dl)).toContain("Aprobar vacaciones");
    expect(text(dl)).toContain("Laura Gómez");
    expect(text(dl)).toContain("Equipo de nómina · Sede Cali");
    el.focusPerson("2");
    await tick();
    expect(el.querySelector(".nx-org__contacts")).toBeNull();
  });

  it("sin unidades no hay selector de vista", async () => {
    const el = await mount((o) => {
      o.people = people;
      o.me = "3";
    });
    expect(el.querySelector("button[data-view]")).toBeNull();
  });

  it("los textos del backend van como texto", async () => {
    const el = await mount((o) => {
      o.people = [{ id: "1", name: '<img src=x onerror="alert(1)">' }];
      o.me = "1";
    });
    expect(el.querySelector("img[src=x]")).toBeNull();
    expect(text(el.querySelector(".nx-org__name"))).toContain("<img");
  });
});

describe("<nx-org>: lente «Organización»", () => {
  const ids = (el: Element) => [...el.querySelectorAll<HTMLElement>(".nx-org__ucard")].map((c) => c.dataset.unit);

  it("las raíces en fila, sus subunidades colgando y el camino hasta ti abierto y marcado", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "5";
      o.view = "map";
    });
    expect(ids(el)).toEqual(["c1", "s2", "s1", "c2", "s3"]);
    const card = (id: string) => el.querySelector<HTMLElement>(`.nx-org__ucard[data-unit="${id}"]`)!;
    expect(text(card("c1").querySelector(".nx-org__big"))).toBe("6");
    expect(card("c1").classList.contains("is-on")).toBe(true);
    expect(card("s1").classList.contains("is-on")).toBe(true);
    expect(card("s2").classList.contains("is-on")).toBe(false);
    expect(card("s1").querySelector(".nx-org__you")).not.toBeNull();
    expect(card("c1").querySelector(".nx-org__you")).toBeNull();
    expect([...card("c1").parentElement!.querySelectorAll(".nx-org__stack > li")].map((li) => li.className)).toEqual(["is-rail", "is-on"]);
    expect(card("c1").querySelector("[data-toggle]")!.getAttribute("aria-expanded")).toBe("true");
    expect(card("s1").querySelector("[data-toggle]")).toBeNull();
    // Sin una sola raíz no hay barra: las raíces van en fila sin ramas.
    expect(el.querySelector(".nx-org__tree > .is-top")).toBeNull();
    expect(el.querySelector(".nx-org__crumbs")!.children).toHaveLength(0);
  });

  it("pliega y despliega con el botón y con las flechas", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.view = "map";
    });
    const toggle = () => el.querySelector<HTMLButtonElement>('[data-toggle="c1"]')!;
    toggle().focus();
    toggle().click();
    await tick();
    expect(ids(el)).toEqual(["c1", "c2", "s3"]);
    expect(text(toggle())).toBe("2 subunidades");
    expect(document.activeElement).toBe(toggle());
    el.querySelector<HTMLButtonElement>('[data-open="c1"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    await tick();
    expect(ids(el)).toEqual(["c1", "s2", "s1", "c2", "s3"]);
    expect(text(toggle())).toBe("Plegar");
  });

  it("al abrir una unidad: su gente en ramas, las migas, y Escape vuelve al árbol con el foco en ella", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "5";
      o.view = "map";
    });
    const focus = vi.fn();
    el.addEventListener("nx-org-focus", (e) => focus(e.detail));
    el.querySelector<HTMLButtonElement>('[data-open="s1"]')!.click();
    await tick();
    expect(focus).toHaveBeenLastCalledWith({ view: "map", id: "s1" });
    expect(text(el.querySelector(".nx-org__uhead"))).toContain("Finca La Esperanza");
    expect(text(el.querySelector(".nx-org__crumbs"))).toBe("OrganizaciónAgrovidFinca La Esperanza");
    const tree = el.querySelector(".nx-org__level--root")!;
    expect(text(tree.querySelector(".nx-org__lead"))).toContain("Pedro Ruiz");
    expect(text(tree.querySelector(".nx-org__colhead"))).toBe("Directos con Pedro · 1");
    expect(tree.querySelector(".nx-org__peer.is-me")!.getAttribute("data-person")).toBe("5");
    // Quien no cuelga de nadie dentro de la unidad va aparte, en tarjetas.
    expect(text(el.querySelector(".nx-org__members"))).toContain("Sofía León");
    // Dentro de la unidad, las tarjetas no repiten la unidad.
    expect(text(tree.querySelector(".nx-org__lead"))).not.toContain("Agrovid");
    el.querySelector<HTMLElement>(".nx-org__uhead")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect(el.querySelector(".nx-org__uhead")).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('[data-open="s1"]'));
    expect(focus).toHaveBeenLastCalledWith({ view: "map", id: null });
  });

  it("una unidad con subunidades: sus subunidades debajo, sin avisos de vacío; las migas suben", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
    });
    el.focusUnit("c1");
    await tick();
    expect(el.view).toBe("map");
    expect(el.querySelector(".nx-org__empty")).toBeNull();
    expect(ids(el.querySelector(".nx-org__subunits")!)).toEqual(["s2", "s1"]);
    el.querySelector<HTMLButtonElement>('.nx-org__subunits [data-open="s2"]')!.click();
    await tick();
    expect(text(el.querySelector(".nx-org__lead"))).toContain("Marta Ríos");
    expect(text(el.querySelector(".nx-org__level--root .nx-org__tree"))).toContain("Laura Gómez");
    el.querySelector<HTMLButtonElement>('.nx-org__crumbs [data-go="c1"]')!.click();
    await tick();
    expect(text(el.querySelector(".nx-org__uhead"))).toContain("Agrovid");
    el.querySelector<HTMLButtonElement>('.nx-org__crumbs [data-go=""]')!.click();
    await tick();
    expect(el.querySelector(".nx-org__uhead")).toBeNull();
  });

  it("con una sola raíz, ella arriba y sus hijas en fila con ramas", async () => {
    const el = await mount((o) => {
      o.units = [{ id: "g", name: "Grupo" }, ...units.map((u) => (u.parent ? u : { ...u, parent: "g" }))];
      o.people = people;
      o.me = "5";
      o.view = "map";
    });
    const root = el.querySelector<HTMLElement>(".nx-org__ucard.is-root")!;
    expect(root.dataset.unit).toBe("g");
    expect(root.querySelector("[data-toggle]")).toBeNull();
    expect(el.querySelector(".nx-org__trunk")!.classList.contains("is-on")).toBe(true);
    expect([...el.querySelectorAll(".nx-org__map > .nx-org__tree > li")].map((li) => li.className)).toEqual(["is-top is-on", "is-top is-end"]);
  });

  it("«+n» abre la lista completa de subunidades", async () => {
    const kids = Array.from({ length: 15 }, (_, i) => ({ id: `k${i}`, name: `Área ${i}`, parent: "r", count: 20 - i }));
    const el = await mount((o) => {
      o.units = [{ id: "r", name: "Raíz" }, { id: "a", name: "A", parent: "r", count: 200 }, ...kids.map((k) => ({ ...k, parent: "a" }))];
      o.view = "map";
    });
    expect(el.querySelectorAll(".nx-org__stack > li")).toHaveLength(12);
    const more = el.querySelector<HTMLButtonElement>('[data-act="full"]')!;
    expect(text(more)).toBe("+3");
    more.click();
    await tick();
    expect(el.querySelectorAll(".nx-org__stack > li")).toHaveLength(15);
  });

  it("la cifra elegida aparece en cada unidad, con su intensidad entre hermanas, sin rehacer la barra", async () => {
    const el = await mount((o) => {
      o.units = [
        { id: "a", name: "A", count: 10, metrics: { vac: 4 } },
        { id: "b", name: "B", count: 30, metrics: { vac: 1 } },
      ];
      o.metrics = [{ key: "vac", label: "Vacantes", tone: "warning" }];
      o.view = "map";
    });
    expect(el.querySelector(".nx-org__metric-chip")).toBeNull();
    const sel = el.querySelector<HTMLSelectElement>(".nx-org__select")!;
    sel.value = "vac";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(el.metric).toBe("vac");
    expect(el.querySelector(".nx-org__select")).toBe(sel);
    const chip = el.querySelector<HTMLElement>('[data-unit="a"] .nx-org__metric-chip')!;
    expect(text(chip)).toBe("Vacantes: 4");
    expect(chip.dataset.tone).toBe("warning");
    expect(chip.style.getPropertyValue("--i")).toBe("1.000");
    expect(el.querySelector<HTMLElement>('[data-unit="b"] .nx-org__metric-chip')!.style.getPropertyValue("--i")).toBe("0.250");
  });

  it("cambia de lente con el selector", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "5";
    });
    el.querySelector<HTMLButtonElement>('[data-view="map"]')!.click();
    await tick();
    expect(el.view).toBe("map");
    expect(el.querySelector('button[data-view="map"]')!.getAttribute("aria-pressed")).toBe("true");
    el.querySelector<HTMLButtonElement>('button[data-view="me"]')!.click();
    await tick();
    expect(el.view).toBe("me");
  });
});

describe("<nx-org>: datos por partes", () => {
  it("pide el entorno de una persona y las personas de una unidad", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        calls.push(body);
        if (body.person === "3")
          return new Response(JSON.stringify({ people: [{ id: "3", name: "Pedro Ruiz", unit: "s1", boss: "2" }, { id: "2", name: "Laura Gómez", unit: "s2" }, { id: "5", name: "Ana Díaz", boss: "3", unit: "s1" }] }));
        if (body.unit === "s1") return new Response(JSON.stringify({ people: [{ id: "8", name: "Luis Paz", title: "Tractorista", unit: "s1" }, { id: "9", name: "Eva Sol", title: "Tractorista", unit: "s1" }] }));
        return new Response("{}", { status: 500 });
      }),
    );
    const el = await mount((o) => {
      o.units = units.map((u) => ({ ...u, count: 10 }));
      o.me = "3";
      o.source = "/org";
    });
    await tick();
    await tick();
    expect(calls).toContainEqual({ person: "3" });
    expect(text(el.querySelector(".nx-org__level--boss"))).toContain("Laura Gómez");
    el.focusUnit("s1");
    await tick();
    await tick();
    await tick();
    expect(calls).toContainEqual({ unit: "s1" });
    expect(text(el.querySelector(".nx-org__members"))).toContain("Luis Paz");
    expect(calls.filter((c) => JSON.stringify(c) === '{"unit":"s1"}')).toHaveLength(1);
  });

  it("si falla, ofrece reintentar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const el = await mount((o) => {
      o.me = "3";
      o.source = "/org";
    });
    await tick();
    await tick();
    expect(el.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("no vuelve a pedir lo que ya llegó completo de arranque", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    await mount((o) => {
      o.people = [
        { id: "1", name: "Marta", reports: 1 },
        { id: "2", name: "Laura", boss: "1", reports: 0 },
      ];
      o.me = "2";
      o.source = "/org";
    });
    await tick();
    expect(f).not.toHaveBeenCalled();
  });
});

describe("<nx-org>: búsqueda", () => {
  it("encuentra personas sin tildes y al elegir se centra en ella", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "5";
      o.searchable = true;
    });
    const input = el.querySelector<HTMLInputElement>(".nx-org__input")!;
    input.value = "sofia";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const option = el.querySelector<HTMLElement>('[role="option"]')!;
    expect(text(option)).toContain("Sofía León");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await tick();
    expect(el.center).toBe("4");
    expect(text(el.querySelector(".nx-org__path"))).toContain("Tu jefe común con Sofía León es Laura Gómez");
  });

  it("una unidad lleva al mapa", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "5";
      o.searchable = true;
    });
    const input = el.querySelector<HTMLInputElement>(".nx-org__input")!;
    input.value = "planta";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    el.querySelector<HTMLElement>('[data-result="0"]')!.click();
    await tick();
    expect(el.view).toBe("map");
    expect(text(el.querySelector(".nx-org__members"))).toContain("Rosa Pinto");
  });
});

describe("<nx-org>: aspecto", () => {
  it("el equipo cuelga de ramas: columnas por ancho y la primera fila marcada", async () => {
    const el = await mount((o) => {
      o.people = people;
      o.me = "2";
    });
    const tree = el.querySelector<HTMLElement>(".nx-org__tree")!;
    expect(tree.style.getPropertyValue("--cols")).toBe("2");
    const lis = [...tree.children] as HTMLElement[];
    expect(lis.map((li) => li.className)).toEqual(["is-top", "is-top is-end"]);
    expect(el.querySelector(".nx-org__axis")!.classList.contains("has-team")).toBe(true);
    // Los compañeros, a los dos lados del centro.
    expect(text(el.querySelector(".nx-org__peers.is-l"))).toContain("Juan Mora");
    expect(el.querySelector(".nx-org__peers.is-r")!.children).toHaveLength(0);
  });

  it("cada persona tiene su tono, el mismo en todas partes", async () => {
    const el = await mount((o) => {
      o.people = people;
      o.me = "3";
    });
    const hues = (id: string) => [...el.querySelectorAll<HTMLElement>(`[data-person="${id}"] .nx-org__avatar--initials, [data-person="${id}"] .nx-org__mini--initials`)].map((a) => a.style.getPropertyValue("--h"));
    const laura = hues("2");
    expect(laura.length).toBeGreaterThan(1);
    expect(new Set(laura).size).toBe(1);
    expect(laura[0]).not.toBe(hues("4")[0]);
  });

  it("dibuja el camino en caras: tú, el jefe común y la otra persona", async () => {
    const el = await mount((o) => {
      o.people = people;
      o.me = "5";
      o.focusPerson("6");
    });
    const nodes = [...el.querySelectorAll<HTMLElement>(".nx-org__route .nx-org__node")];
    expect(nodes.map((n) => text(n.querySelector(".nx-org__node-name")))).toEqual(["Tú", "Marta Ríos", "Juan Mora"]);
    expect(nodes[1].dataset.person).toBe("1");
    expect([...el.querySelectorAll(".nx-org__edge")].map((e) => e.textContent)).toEqual(["↑ 3", "↓ 1"]);
  });

  it("en el árbol, cada rama con su tono: sus subunidades lo heredan", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.view = "map";
    });
    const hue = (id: string) => el.querySelector<HTMLElement>(`.nx-org__ucard[data-unit="${id}"]`)!.style.getPropertyValue("--h");
    expect(hue("c1")).not.toBe(hue("c2"));
    expect(hue("s1")).toBe(hue("c1"));
    expect(hue("s2")).toBe(hue("c1"));
  });

  it("con View Transitions, las tarjetas llevan nombre durante el cambio y lo sueltan al final", async () => {
    const el = await mount((o) => {
      o.people = people;
      o.me = "3";
    });
    let finish!: () => void;
    let during = "";
    const doc = document as unknown as { startViewTransition?: unknown };
    doc.startViewTransition = (cb: () => void) => {
      cb();
      during = el.querySelector<HTMLElement>(".nx-org__person--center")!.style.getPropertyValue("view-transition-name");
      return { ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), finished: new Promise<void>((r) => (finish = r)) };
    };
    vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
    try {
      el.querySelector<HTMLButtonElement>('.nx-org__level--team button[data-person="5"]')!.click();
      expect(el.center).toBe("5");
      expect(text(el.querySelector(".nx-org__person--center"))).toContain("Ana Díaz");
      expect(during).toMatch(/^nx-org\d+-\d+$/);
      finish();
      await tick();
      expect(el.querySelector<HTMLElement>(".nx-org__person--center")!.style.getPropertyValue("view-transition-name")).toBe("");
    } finally {
      delete doc.startViewTransition;
    }
  });
});
