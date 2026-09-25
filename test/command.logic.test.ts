import { describe, expect, it } from "vitest";
import { cleanItems, flattenItems, flattenMenu, frecency, groupItems, hotkeyHasModifier, matchesHotkey, parseUsage, recentItems, recordUse, scoreItem, searchCommands } from "../src/components/command/logic";
import type { CommandItem } from "../src/components/command/types";
import type { MenuItem } from "../src/components/sidemenu/types";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 24);
const ITEMS: CommandItem[] = [
  { id: "nuevo", label: "Nuevo pedido", group: "Acciones", keywords: ["crear", "orden de compra"] },
  { id: "anular", label: "Anular pedido", group: "Acciones", keywords: ["cancelar"] },
  { id: "pedidos", label: "Pedidos", href: "/ventas/pedidos", group: "Ir a", hint: "Ventas" },
  { id: "portería", label: "Portería", href: "/seguridad/porteria", group: "Ir a", hint: "Seguridad física" },
];
const labels = (q: string, usage = {}) => searchCommands(ITEMS, q, usage, NOW).map((r) => r.item.label);

describe("searchCommands", () => {
  it("sin consulta no devuelve nada (la paleta muestra «Recientes» y todo)", () => {
    expect(labels("  ")).toEqual([]);
  });

  it("sin tildes ni mayúsculas; cada palabra tiene que aparecer en algún lado", () => {
    expect(labels("porteria")).toEqual(["Portería"]);
    expect(labels("PEDIDO anular")).toEqual(["Anular pedido"]);
    expect(labels("pedido xyz")).toEqual([]);
  });

  it("el nombre pesa más que la pista, y el inicio más que el medio", () => {
    expect(labels("pedido")).toEqual(["Pedidos", "Nuevo pedido", "Anular pedido"]);
    // «ventas» solo está en la pista de Pedidos.
    expect(labels("ventas")).toEqual(["Pedidos"]);
  });

  it("encuentra por palabras clave (sinónimos)", () => {
    expect(labels("cancelar")).toEqual(["Anular pedido"]);
    expect(labels("orden compra")).toEqual(["Nuevo pedido"]);
  });

  it("una palabra también vale como iniciales: «np» → Nuevo pedido", () => {
    expect(labels("np")).toEqual(["Nuevo pedido"]);
    expect(scoreItem(ITEMS[1], "ap")).toBeGreaterThan(0);
  });

  it("lo usado seguido sube, con un tope: no tapa una coincidencia claramente mejor", () => {
    const usage = recordUse(recordUse({}, ITEMS[1], NOW - DAY), ITEMS[1], NOW);
    expect(labels("pedido", usage)[0]).toBe("Anular pedido");
    let heavy = {};
    for (let i = 0; i < 500; i++) heavy = recordUse(heavy, ITEMS[1], NOW);
    const [top, used] = [searchCommands(ITEMS, "pedido", {}, NOW)[0], searchCommands(ITEMS, "pedido", heavy, NOW).find((r) => r.item.id === "anular")!];
    expect(used.score - scoreItem(ITEMS[1], "pedido")!).toBeLessThanOrEqual(4);
    // Un nombre exacto (6 + 4) sigue por encima de una coincidencia en medio (2 + tope de 4).
    expect(searchCommands([{ label: "Pedido" }, { label: "Repedido" }], "pedido", recordUse({}, { label: "Repedido" }, NOW), NOW)[0].item.label).toBe("Pedido");
    expect(top.item.label).toBe("Pedidos");
  });
});

describe("uso y recientes", () => {
  it("frecency: cada semana pesa la mitad", () => {
    expect(frecency({ n: 4, t: NOW }, NOW)).toBe(4);
    expect(frecency({ n: 4, t: NOW - 7 * DAY }, NOW)).toBeCloseTo(2);
    expect(frecency(undefined, NOW)).toBe(0);
  });

  it("recordUse acumula y guarda la entrada sin su submenú; conserva las que más pesan", () => {
    let u = recordUse({}, { label: "Paleta", children: [{ label: "Océano" }] }, NOW);
    u = recordUse(u, { label: "Paleta" }, NOW);
    expect(u.Paleta.n).toBe(2);
    expect(u.Paleta.item.children).toBeUndefined();
    let many = {};
    for (let i = 0; i < 5; i++) many = recordUse(many, { label: `x${i}` }, NOW - i * DAY, 3);
    expect(Object.keys(many).sort()).toEqual(["x0", "x1", "x2"]);
  });

  it("recentItems: de lo que más a lo que menos pesa, con la versión actual; lo que ya no está no aparece", () => {
    let u = recordUse({}, ITEMS[2], NOW - 20 * DAY);
    u = recordUse(u, { id: "oc-2291", label: "OC-2291 · Aceros del Caribe", href: "/oc/2291" }, NOW);
    const renamed = { ...ITEMS[2], label: "Pedidos de venta" };
    expect(recentItems(u, [renamed], NOW).map((i) => i.label)).toEqual(["Pedidos de venta"]);
  });

  it("recordUse guarda solo {id, label, href, icon, group}: nunca `data` ni `hint`", () => {
    const u = recordUse({}, { id: "c", label: "Ana Pérez", href: "/c/1", hint: "CC 1.234.567", group: "Clientes", icon: "user", keywords: ["ana"], data: { cedula: "1234567" } }, NOW);
    expect(u.c.item).toEqual({ id: "c", label: "Ana Pérez", href: "/c/1", icon: "user", group: "Clientes" });
    expect(JSON.stringify(u)).not.toContain("1234567");
  });

  it("parseUsage valida y reduce lo guardado por versiones viejas", () => {
    const u = parseUsage({ a: { n: 2, t: NOW, item: { label: "A", data: { secreto: 1 }, hint: "x" } }, b: { n: "2", t: NOW, item: { label: "B" } }, c: null, __proto__: { n: 1, t: 1, item: { label: "P" } } });
    expect(Object.keys(u)).toEqual(["a"]);
    expect(u.a.item).toEqual({ label: "A" });
    expect(parseUsage("basura")).toEqual({});
  });

  it("flattenItems: también los submenús, con su camino como pista", () => {
    expect(flattenItems([{ label: "Paleta", children: [{ label: "Océano" }, { label: "Bosque", hint: "verde" }] }]).map((i) => `${i.label}|${i.hint ?? ""}`)).toEqual(["Paleta|", "Océano|Paleta", "Bosque|verde"]);
  });

  it("hotkeyHasModifier: «mod+k» sí, «/» no", () => {
    expect(hotkeyHasModifier("mod+k")).toBe(true);
    expect(hotkeyHasModifier("alt+p")).toBe(true);
    expect(hotkeyHasModifier("shift+/")).toBe(false);
    expect(hotkeyHasModifier("/")).toBe(false);
  });
});

describe("menú, grupos y datos", () => {
  it("flattenMenu: cada destino con su ruta como pista; los padres sin href no se listan", () => {
    const menu: MenuItem[] = [
      { id: "inicio", label: "Inicio", href: "/", section: "General" },
      { id: "ventas", label: "Ventas", section: "Operación", children: [{ id: "pedidos", label: "Pedidos", href: "/ventas/pedidos" }] },
    ];
    expect(flattenMenu(menu, "Ir a")).toEqual([
      { id: "menu:inicio", label: "Inicio", href: "/", icon: undefined, group: "Ir a", hint: undefined, keywords: ["General"] },
      { id: "menu:pedidos", label: "Pedidos", href: "/ventas/pedidos", icon: undefined, group: "Ir a", hint: "Ventas", keywords: [] },
    ]);
  });

  it("groupItems conserva el orden: cada grupo aparece donde está su mejor entrada", () => {
    const g = groupItems([ITEMS[2], ITEMS[0], ITEMS[3], { label: "Suelto" }], "Comandos");
    expect(g.map((x) => [x.group, x.items.length])).toEqual([["Ir a", 2], ["Acciones", 1], ["Comandos", 1]]);
  });

  it("cleanItems descarta lo que no tiene label y lo que no es suyo", () => {
    const out = cleanItems([{ label: "Ok", href: "/x", innerHTML: "<b>", id: 7 }, { href: "/sin-label" }, null, "texto"]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ label: "Ok", href: "/x", id: "7" });
    expect("innerHTML" in out[0]).toBe(false);
  });

  it("matchesHotkey: mod es ⌘ o Ctrl; los demás modificadores cuentan", () => {
    const k = (key: string, o: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });
    expect(matchesHotkey(k("k", { ctrlKey: true }), "mod+k")).toBe(true);
    expect(matchesHotkey(k("K", { metaKey: true }), "mod+k")).toBe(true);
    expect(matchesHotkey(k("k"), "mod+k")).toBe(false);
    expect(matchesHotkey(k("k", { ctrlKey: true, shiftKey: true }), "mod+k")).toBe(false);
    expect(matchesHotkey(k("p", { ctrlKey: true, shiftKey: true }), "mod+shift+p")).toBe(true);
    expect(matchesHotkey(k("k", { ctrlKey: true }), "none")).toBe(false);
  });
});

describe("recientes empatados", () => {
  it("dos usos en el mismo milisegundo: primero el último que se anotó", () => {
    const both = [{ label: "Primero" }, { label: "Segundo" }];
    let u = recordUse({}, { label: "Primero" }, NOW);
    u = recordUse(u, { label: "Segundo" }, NOW);
    expect(recentItems(u, both, NOW).map((i) => i.label)).toEqual(["Segundo", "Primero"]);
    u = recordUse(u, { label: "Primero" }, NOW);
    u = recordUse(u, { label: "Segundo" }, NOW);
    expect(recentItems(u, both, NOW).map((i) => i.label)).toEqual(["Segundo", "Primero"]);
  });
});
