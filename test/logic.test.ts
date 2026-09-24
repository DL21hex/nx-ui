import { describe, expect, it } from "vitest";
import { filterItems, flyoutKeyStep, foldText, formatBadge, groupBySection, panelHasSearch, resolveActive, splitUtility } from "../src/components/sidemenu/logic";
import type { MenuItem } from "../src/components/sidemenu/types";
import { safeHref } from "../src/core/dom";
import { initials } from "../src/core/icons";

const MENU: MenuItem[] = [
  { id: "home", label: "Inicio", href: "/" },
  {
    id: "watchmen",
    label: "Seguridad Física",
    children: [
      { id: "porteria", label: "Portería — Adentro", href: "/watchmen/porteria/index__for_employees", description: "Quién está en planta" },
      { id: "visits", label: "Visitas", href: "/watchmen/visits/index" },
      { id: "reports", label: "Reportes de acceso", href: "/watchmen/access_control/reports", utility: true },
    ],
  },
  { id: "sales", label: "Pedidos", href: "/ventas/pedidos", section: "Ventas" },
  { id: "old", label: "Pedidos viejos", href: "/ventas/pedidos-viejos", section: "Ventas" },
];

describe("foldText / filterItems", () => {
  it("ignora tildes y mayúsculas", () => {
    expect(foldText("  Portería ")).toBe("porteria");
  });

  it("consulta vacía devuelve todos", () => {
    expect(filterItems(MENU[1].children!, "  ")).toHaveLength(3);
  });

  it("busca en la etiqueta y en la descripción", () => {
    expect(filterItems(MENU[1].children!, "porteria").map((c) => c.id)).toEqual(["porteria"]);
    expect(filterItems(MENU[1].children!, "PLANTA").map((c) => c.id)).toEqual(["porteria"]);
    expect(filterItems(MENU[1].children!, "zzz")).toEqual([]);
  });
});

describe("groupBySection / splitUtility", () => {
  it("sin secciones, un único grupo sin título", () => {
    const groups = groupBySection(MENU[1].children!);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBeNull();
  });

  it("un grupo por sección, en orden de aparición", () => {
    expect(groupBySection(MENU).map((g) => [g.label, g.items.length])).toEqual([
      [null, 2],
      ["Ventas", 2],
    ]);
  });

  it("reparte los utilitarios conservando el orden", () => {
    const { work, utilities } = splitUtility(MENU[1].children!);
    expect(work.map((c) => c.id)).toEqual(["porteria", "visits"]);
    expect(utilities.map((c) => c.id)).toEqual(["reports"]);
  });
});

describe("resolveActive", () => {
  const id = (active: string) => resolveActive(MENU, active).item?.id ?? null;

  it("un href idéntico gana", () => {
    expect(id("/ventas/pedidos")).toBe("sales");
    expect(id("/")).toBe("home");
  });

  it("también acepta el id", () => {
    expect(id("visits")).toBe("visits");
  });

  it("una subruta enciende su pantalla, por segmentos y no por texto", () => {
    expect(id("/ventas/pedidos/42")).toBe("sales");
    expect(id("/ventas/pedidos-viejos/3")).toBe("old");
  });

  it("un último segmento index… cuenta como su carpeta", () => {
    expect(id("/watchmen/porteria/view__for_employees/7")).toBe("porteria");
    expect(id("/watchmen/visits")).toBe("visits");
  });

  it("devuelve el rastro de padres", () => {
    expect(resolveActive(MENU, "/watchmen/visits/index").trail.map((p) => p.id)).toEqual(["watchmen"]);
  });

  it("el id de un padre lo enciende sin hoja activa (una ficha que no está en el menú)", () => {
    const m = resolveActive(MENU, "watchmen");
    expect(m.item).toBeNull();
    expect(m.trail.map((p) => p.id)).toEqual(["watchmen"]);
  });

  it("una ruta sin coincidencia cae al id de padre solo si es exactamente ese id", () => {
    expect(resolveActive(MENU, "/watchmen/rondas/9").trail).toEqual([]);
  });

  it("la raíz no enciende todo lo que no encuentra", () => {
    expect(id("/nada/que/ver")).toBeNull();
    expect(id("")).toBeNull();
  });
});

describe("flyoutKeyStep", () => {
  it("las flechas recorren la lista con envoltura", () => {
    expect(flyoutKeyStep("ArrowDown", -1, 3)).toBe(0);
    expect(flyoutKeyStep("ArrowDown", 2, 3)).toBe(0);
    expect(flyoutKeyStep("ArrowUp", 0, 3)).toBe(2);
    expect(flyoutKeyStep("ArrowUp", -1, 3)).toBe(2);
  });

  it("Home y End saltan a los extremos", () => {
    expect(flyoutKeyStep("Home", 2, 3)).toBe(0);
    expect(flyoutKeyStep("End", 0, 3)).toBe(2);
  });

  it("Enter selecciona el resaltado, y nada sin resaltado", () => {
    expect(flyoutKeyStep("Enter", 1, 3)).toBe("select");
    expect(flyoutKeyStep("Enter", -1, 3)).toBeNull();
  });

  it("Escape y Tab cierran, incluso con la lista vacía", () => {
    expect(flyoutKeyStep("Escape", 1, 3)).toBe("close");
    expect(flyoutKeyStep("Tab", 1, 3)).toBe("close");
    expect(flyoutKeyStep("Escape", -1, 0)).toBe("close");
    expect(flyoutKeyStep("ArrowDown", -1, 0)).toBeNull();
  });

  it("una tecla de escritura no es del panel", () => {
    expect(flyoutKeyStep("a", 0, 3)).toBeNull();
  });
});

describe("safeHref", () => {
  it("deja pasar rutas relativas y http(s), mailto, tel", () => {
    for (const ok of ["/ventas", "ventas/1", "#/x", "?q=1", "https://a.co", "HTTP://a.co", "mailto:a@b.co", "tel:+57"]) {
      expect(safeHref(ok)).toBe(ok);
    }
  });

  it("descarta javascript:, data: y variantes ofuscadas", () => {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "java\tscript:alert(1)", "java\nscript:x", "data:text/html,x", "vbscript:x"]) {
      expect(safeHref(bad)).toBeUndefined();
    }
  });

  it("descarta lo que no es texto", () => {
    expect(safeHref(undefined)).toBeUndefined();
    expect(safeHref({})).toBeUndefined();
    expect(safeHref("   ")).toBeUndefined();
  });
});

describe("panelHasSearch", () => {
  it("solo con más de 3 hijos", () => {
    expect(panelHasSearch([1, 2, 3])).toBe(false);
    expect(panelHasSearch([1, 2, 3, 4])).toBe(true);
    expect(panelHasSearch([])).toBe(false);
  });
});

describe("formatBadge", () => {
  it("números positivos, con tope 99+", () => {
    expect(formatBadge(3)).toBe("3");
    expect(formatBadge(99)).toBe("99");
    expect(formatBadge(100)).toBe("99+");
    expect(formatBadge(2.7)).toBe("2");
  });

  it("cero, negativos, vacío y lo que no es texto no se pintan", () => {
    for (const v of [0, -1, Number.NaN, "", "  ", null, undefined, {}]) expect(formatBadge(v)).toBeNull();
  });

  it("un texto se pinta tal cual", () => {
    expect(formatBadge(" Nuevo ")).toBe("Nuevo");
  });
});

describe("initials", () => {
  it("dos palabras → sus iniciales; una → sus dos primeras letras", () => {
    expect(initials("Seguridad Física")).toBe("SF");
    expect(initials("ventas")).toBe("Ve");
    expect(initials("")).toBe("");
  });
});
