import { describe, expect, it } from "vitest";
import {
  accountCommands,
  accountInitials,
  cleanPerson,
  cleanTenants,
  cleanUser,
  formatRemaining,
  normalizePalettes,
  parseExpiry,
  parsePrefs,
  pendingText,
  pickTheme,
  pushRecent,
  revealRadius,
  sessionPhase,
  sessionRemaining,
  statusUntil,
  tenantMatches,
  tenantSections,
} from "../src/components/account/logic";
import { localeSample } from "../src/components/account/account-panel";
import { ACCOUNT_LABELS } from "../src/components/account/account";
import type { AccountTenant } from "../src/components/account/types";

const T: AccountTenant[] = [
  { id: "cc-med", name: "Crear Colombia S.A.S.", detail: "Sede Medellín", role: "Aprobador", group: "Crear Colombia S.A.S." },
  { id: "cc-bog", name: "Crear Colombia S.A.S.", detail: "Sede Bogotá", role: "Consulta", group: "Crear Colombia S.A.S." },
  { id: "nx-cali", name: "nx32 Quality", detail: "Sede Cali", role: "Administrador", group: "nx32 Quality" },
];

describe("iniciales y datos", () => {
  it("salen del nombre, o las propias", () => {
    expect(accountInitials({ name: "Diego Llinás" })).toBe("DL");
    expect(accountInitials({ name: "diego" })).toBe("DI");
    expect(accountInitials({ name: "Diego Llinás", initials: "dll" })).toBe("DLL");
    expect(accountInitials(null)).toBe("");
  });

  it("limpia lo que llega: sin nombre no hay usuario; empresas sin id o nombre se descartan", () => {
    expect(cleanUser({ email: "x@y.co" })).toBeNull();
    expect(cleanUser({ name: "Ana", email: 5 })).toEqual({ name: "Ana", email: undefined, avatar: undefined, initials: undefined });
    expect(cleanTenants([{ id: 1, name: "A" }, { id: "b" }, null, "x", { name: "C" }])).toEqual([{ id: "1", name: "A", detail: undefined, role: undefined, group: undefined }]);
    expect(cleanTenants("no")).toEqual([]);
    expect(cleanPerson({ id: "u1", name: "Ana", role: "Cajera" })).toMatchObject({ id: "u1", name: "Ana", role: "Cajera" });
    expect(cleanPerson({ id: "u1" })).toBeNull();
  });
});

describe("sesión", () => {
  it("entiende ISO, milisegundos y texto numérico", () => {
    expect(parseExpiry("2026-09-26T10:00:00Z")).toBe(Date.UTC(2026, 8, 26, 10));
    expect(parseExpiry(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(parseExpiry("1700000000000")).toBe(1_700_000_000_000);
    expect(parseExpiry("mañana")).toBeNull();
    expect(parseExpiry(Number.NaN)).toBeNull();
    expect(parseExpiry(undefined)).toBeNull();
  });

  it("tiempo restante, fase y formato m:ss", () => {
    expect(sessionRemaining(null, 0)).toBeNull();
    expect(sessionRemaining(1000, 5000)).toBe(0);
    expect(sessionPhase(null, 0, 300_000)).toBe("none");
    expect(sessionPhase(1_000_000, 0, 300_000)).toBe("ok");
    expect(sessionPhase(299_000, 0, 300_000)).toBe("warn");
    expect(sessionPhase(0, 0, 300_000)).toBe("expired");
    expect(formatRemaining(299_000)).toBe("4:59");
    expect(formatRemaining(300_000)).toBe("5:00");
    expect(formatRemaining(300)).toBe("0:01");
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(3_723_000)).toBe("1:02:03");
    expect(formatRemaining(Number.NaN)).toBe("0:00");
  });

  it("«hasta»: una hora, fin del día local o sin fin", () => {
    const now = new Date(2026, 8, 26, 15, 30).getTime();
    expect(statusUntil("hour", now)).toBe(now + 3_600_000);
    expect(statusUntil("today", now)).toBe(new Date(2026, 8, 26, 23, 59, 59, 999).getTime());
    expect(statusUntil("", now)).toBeNull();
    expect(statusUntil(null, now)).toBeNull();
  });

  it("pendientes en singular y plural, con el número del locale", () => {
    expect(pendingText(1, ACCOUNT_LABELS)).toBe("1 cambio sin sincronizar.");
    expect(pendingText(1250, ACCOUNT_LABELS, (n) => n.toLocaleString("es-CO"))).toBe("1.250 cambios sin sincronizar.");
  });
});

describe("recientes y búsqueda de empresas", () => {
  it("lo último al frente, sin repetir y con tope", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

  it("busca sin tildes ni mayúsculas en nombre, sede, rol y grupo; cada palabra tiene que estar", () => {
    expect(tenantMatches(T[1], "bogota")).toBe(true);
    expect(tenantMatches(T[0], "CREAR medellin")).toBe(true);
    expect(tenantMatches(T[0], "crear cali")).toBe(false);
    expect(tenantMatches(T[2], "admin")).toBe(true);
  });

  it("agrupa por empresa en su orden; con consulta, solo lo que coincide", () => {
    const s = tenantSections(T, {});
    expect(s.map((x) => [x.group, x.items.map((t) => t.id)])).toEqual([
      ["Crear Colombia S.A.S.", ["cc-med", "cc-bog"]],
      ["nx32 Quality", ["nx-cali"]],
    ]);
    expect(tenantSections(T, { query: "sede" }).flatMap((x) => x.items).length).toBe(3);
    expect(tenantSections(T, { query: "cali" })).toEqual([{ group: "nx32 Quality", items: [T[2]] }]);
    expect(tenantSections(T, { query: "zzz" })).toEqual([]);
  });

  it("«Recientes» arriba solo con muchas empresas, sin la actual y sin repetirlas abajo", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, name: `Empresa ${i}` }));
    const s = tenantSections(many, { recent: ["t5", "t0", "zz", "t2"], recentLabel: "Recientes", current: "t0" });
    expect(s[0]).toEqual({ group: "Recientes", items: [many[5], many[2]] });
    expect(s[1].items.map((t) => t.id)).toEqual(["t0", "t1", "t3", "t4", "t6", "t7"]);
    // Con tres empresas no hace falta.
    expect(tenantSections(T, { recent: ["cc-bog"], recentLabel: "Recientes" })[0].group).toBe("Crear Colombia S.A.S.");
    // Con consulta, tampoco.
    expect(tenantSections(many, { query: "empresa", recent: ["t5"], recentLabel: "Recientes" })[0].group).toBe("");
  });
});

describe("tema y paletas", () => {
  it("sin nada, las 9 de palettes.css en su orden y con nombre", () => {
    const p = normalizePalettes(null);
    expect(p.map((x) => x.id)).toEqual(["indigo", "oceano", "esmeralda", "bosque", "terracota", "frambuesa", "violeta", "medianoche", "grafito"]);
    expect(p[1].label).toBe("Océano");
  });

  it("respeta el orden pedido, acepta objetos con color y descarta repetidos e ids raros", () => {
    const p = normalizePalettes(["grafito", "oceano", "grafito", { id: "marca", label: "Marca", color: "#e30613" }, "no válido", { label: "sin id" }]);
    expect(p).toEqual([
      { id: "grafito", label: "Grafito", color: undefined },
      { id: "oceano", label: "Océano", color: undefined },
      { id: "marca", label: "Marca", color: "#e30613" },
    ]);
    expect(normalizePalettes([])).toHaveLength(9);
  });

  it("el tema y lo guardado se validan", () => {
    expect(pickTheme("dark")).toBe("dark");
    expect(pickTheme("auto")).toBe("system");
    expect(parsePrefs('{"theme":"dark","palette":"oceano","recent":["a",3]}')).toEqual({ theme: "dark", palette: "oceano", recent: ["a"] });
    expect(parsePrefs('{"theme":"rosa","palette":"<x>"}')).toEqual({});
    expect(parsePrefs("{roto")).toEqual({});
    expect(parsePrefs(null)).toEqual({});
  });

  it("el círculo llega a la esquina más lejana", () => {
    expect(revealRadius(0, 0, 300, 400)).toBe(500);
    expect(revealRadius(150, 200, 300, 400)).toBe(250);
  });
});

describe("idioma y formatos", () => {
  it("la vista previa muestra números y fechas de cada locale, sin «de»", () => {
    const d = new Date(2026, 8, 26);
    expect(localeSample("es-CO", d)).toMatch(/^1\.234\.567,50 · 26 sept?\.? 2026$/);
    expect(localeSample("en-US", d)).toBe("1,234,567.50 · Sep 26, 2026");
    expect(localeSample("pt-BR", d)).not.toContain(" de ");
    expect(localeSample("xx!!", d)).toBe("");
  });
});

describe("paleta de comandos", () => {
  const base = { account: "acc1", labels: ACCOUNT_LABELS, palettes: normalizePalettes(["indigo", "oceano"]), tenants: T, locales: [{ value: "en-US", label: "English" }] };

  it("tema, cada paleta, cada empresa, cada idioma y cerrar sesión, con la forma de <nx-command>", () => {
    const c = accountCommands({ ...base, viewAs: false, lock: false });
    expect(c.map((x) => x.id)).toEqual([
      "account:theme:light",
      "account:theme:dark",
      "account:theme:system",
      "account:palette:indigo",
      "account:palette:oceano",
      "account:tenant:cc-med",
      "account:tenant:cc-bog",
      "account:tenant:nx-cali",
      "account:locale:en-US",
      "account:logout",
    ]);
    expect(c[1]).toMatchObject({ label: "Tema: Oscuro", group: "Tema", data: { account: "acc1", action: "theme", value: "dark" } });
    expect(c[4].label).toBe("Color: Océano");
    expect(c[6]).toMatchObject({ label: "Crear Colombia S.A.S. · Sede Bogotá", hint: "Consulta", keywords: ["Crear Colombia S.A.S."] });
  });

  it("«Ver como» y «Bloquear» solo si están activos", () => {
    const ids = accountCommands({ ...base, viewAs: true, lock: true }).map((x) => x.id);
    expect(ids).toContain("account:view-as");
    expect(ids).toContain("account:lock");
  });
});
