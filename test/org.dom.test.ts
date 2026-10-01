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
  it("bloques de las raíces con su conteo y el «Tú» en el camino", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "5";
      o.view = "map";
    });
    const tiles = [...el.querySelectorAll<HTMLElement>(".nx-org__tile")];
    expect(tiles.map((t) => t.dataset.tile)).toEqual(["c1", "c2"]);
    expect(tiles[0].getAttribute("aria-label")).toContain("6 personas");
    expect(tiles[0].classList.contains("is-you")).toBe(true);
    expect(tiles[1].classList.contains("is-you")).toBe(false);
  });

  it("entra a una unidad, luego a sus cargos y a las personas; las migas suben", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.me = "5";
      o.view = "map";
    });
    const focus = vi.fn();
    el.addEventListener("nx-org-focus", (e) => focus(e.detail));
    el.querySelector<HTMLButtonElement>('[data-tile="c1"]')!.click();
    await tick();
    expect([...el.querySelectorAll<HTMLElement>(".nx-org__tile")].map((t) => t.dataset.tile).sort()).toEqual(["s1", "s2"]);
    expect(focus).toHaveBeenLastCalledWith({ view: "map", id: "c1" });
    el.querySelector<HTMLButtonElement>('[data-tile="s1"]')!.click();
    await tick();
    const titles = [...el.querySelectorAll<HTMLElement>(".nx-org__tile")].map((t) => t.dataset.tile);
    expect(titles).toEqual(["t:Analista", "t:Operaria"]);
    expect(el.querySelector('[data-tile="t:Operaria"]')!.classList.contains("is-you")).toBe(true);
    el.querySelector<HTMLButtonElement>('[data-tile="t:Analista"]')!.click();
    await tick();
    expect(text(el.querySelector(".nx-org__members"))).toContain("Pedro Ruiz");
    expect(text(el.querySelector(".nx-org__crumbs"))).toContain("Organización › Agrovid › Finca La Esperanza › Analista".replace(/ › /g, ""));
    el.querySelector<HTMLButtonElement>('.nx-org__crumbs [data-to="1"]')!.click();
    await tick();
    expect(el.querySelector('[data-tile="s1"]')).not.toBeNull();
  });

  it("Escape sube un nivel", async () => {
    const el = await mount((o) => {
      o.units = units;
      o.people = people;
      o.view = "map";
    });
    el.focusUnit("c1");
    await tick();
    const tile = el.querySelector<HTMLButtonElement>(".nx-org__tile")!;
    tile.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await tick();
    expect([...el.querySelectorAll<HTMLElement>(".nx-org__tile")].map((t) => t.dataset.tile)).toEqual(["c1", "c2"]);
  });

  it("con muchas unidades, un bloque «Otras» lleva al resto", async () => {
    const many: OrgUnit[] = Array.from({ length: 25 }, (_, i) => ({ id: `u${i}`, name: `Unidad ${i}`, count: 100 - i }));
    const el = await mount((o) => {
      o.units = many;
      o.view = "map";
    });
    expect(el.querySelectorAll(".nx-org__tile")).toHaveLength(18);
    const rest = el.querySelector<HTMLButtonElement>('[data-tile="#rest"]')!;
    expect(text(rest)).toContain("Otras 8 unidades");
    rest.click();
    await tick();
    const ids = [...el.querySelectorAll<HTMLElement>(".nx-org__tile")].map((t) => t.dataset.tile);
    expect(ids).toHaveLength(8);
    expect(ids[0]).toBe("u17");
  });

  it("la cifra elegida colorea y se anuncia en el bloque", async () => {
    const el = await mount((o) => {
      o.units = [
        { id: "a", name: "A", count: 10, metrics: { vac: 4 } },
        { id: "b", name: "B", count: 30, metrics: { vac: 1 } },
      ];
      o.metrics = [{ key: "vac", label: "Vacantes", tone: "warning" }];
      o.metric = "vac";
      o.view = "map";
    });
    const a = el.querySelector<HTMLElement>('[data-tile="a"]')!;
    expect(a.style.getPropertyValue("--i")).toBe("1.000");
    expect(a.getAttribute("aria-label")).toContain("Vacantes: 4");
    expect(el.querySelector<HTMLElement>(".nx-org__tiles")!.dataset.tone).toBe("warning");
  });

  it("con una sola raíz arranca dentro de ella", async () => {
    const el = await mount((o) => {
      o.units = [{ id: "g", name: "Grupo" }, ...units.map((u) => (u.parent ? u : { ...u, parent: "g" }))];
      o.people = people;
      o.view = "map";
    });
    expect([...el.querySelectorAll<HTMLElement>(".nx-org__tile")].map((t) => t.dataset.tile)).toEqual(["c1", "c2"]);
    expect(text(el.querySelector(".nx-org__crumbs"))).toBe("Grupo");
    el.focusUnit("s1");
    await tick();
    expect(text(el.querySelector(".nx-org__crumbs"))).toContain("Grupo›Agrovid›Finca La Esperanza".replace(/›/g, ""));
  });

  it("el selector «Color» elige la cifra sin rehacer la barra", async () => {
    const el = await mount((o) => {
      o.units = [
        { id: "a", name: "A", count: 10, metrics: { vac: 4 } },
        { id: "b", name: "B", count: 30, metrics: { vac: 1 } },
      ];
      o.metrics = [{ key: "vac", label: "Vacantes" }];
      o.view = "map";
    });
    const sel = el.querySelector<HTMLSelectElement>(".nx-org__select")!;
    sel.value = "vac";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    await tick();
    expect(el.metric).toBe("vac");
    expect(el.querySelector(".nx-org__select")).toBe(sel);
    expect(el.querySelector<HTMLElement>('[data-tile="a"]')!.style.getPropertyValue("--i")).toBe("1.000");
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
    expect(el.querySelector('[data-tile="t:Tractorista"]')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('[data-tile="t:Tractorista"]')!.click();
    await tick();
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
