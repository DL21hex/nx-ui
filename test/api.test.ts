// @vitest-environment happy-dom
// La API de cada componente tiene una sola fuente: su clase. BDUI y el rescate de props asignadas
// antes de definir el elemento ya salen de los setters; esto vigila lo que todavía se escribe a
// mano (los atributos observados, el registro BDUI y el adaptador de Solid) para que no se aparte.
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import "../src/index";
import { propsOf, registerComponent, render } from "../src/bdui";
import { setterOf } from "../src/core/define";

const tags = readdirSync("src/components").flatMap((d) => {
  try {
    return [...readFileSync(`src/components/${d}/index.ts`, "utf8").matchAll(/define\("(nx-[\w-]+)"/g)].map((m) => m[1]);
  } catch {
    return [];
  }
});
const bdui = new Map([...readFileSync("src/bdui.ts", "utf8").matchAll(/^ {4}(\w+): "([\w-]+)",$/gm)].map((m) => [`nx-${m[2]}`, m[1]]));
const solid = readdirSync("src/solid").map((f) => readFileSync(`src/solid/${f}`, "utf8")).join("\n");
const camel = (a: string) => a.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

function setters(tag: string): string[] {
  const out = new Set<string>();
  for (let p = customElements.get(tag)!.prototype; p && p !== HTMLElement.prototype; p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) if (Object.getOwnPropertyDescriptor(p, k)!.set) out.add(k);
  }
  return [...out];
}

/** Atributos que no son prop a propósito, con el motivo. */
const ATTR_ONLY: Record<string, string[]> = {};
/** Elementos que no se pintan desde un payload. */
const NOT_BDUI = ["nx-dialog", "nx-toaster"];
/** Elementos sin componente de Solid (se usan con su función: `nxToast`). */
const NOT_SOLID = ["nx-toaster"];

describe("API de los componentes", () => {
  it("hay componentes que revisar", () => {
    expect(tags.length).toBeGreaterThan(35);
    for (const t of tags) expect(customElements.get(t), t).toBeTruthy();
  });

  it.each(tags)("%s: cada atributo observado tiene su prop con setter", (tag) => {
    const observed: string[] = (customElements.get(tag) as unknown as { observedAttributes?: string[] }).observedAttributes ?? [];
    const missing = observed.filter((a) => !ATTR_ONLY[tag]?.includes(a) && !setterOf(customElements.get(tag)!.prototype, camel(a), HTMLElement.prototype));
    expect(missing).toEqual([]);
  });

  it.each(tags.filter((t) => !NOT_BDUI.includes(t)))("%s: está en el registro BDUI y acepta todos sus setters", (tag) => {
    const name = bdui.get(tag);
    expect(name, "falta en el registro de src/bdui.ts").toBeTruthy();
    expect(propsOf(name!).sort()).toEqual(setters(tag).sort());
  });

  it.each(tags.filter((t) => !NOT_SOLID.includes(t)))("%s: el componente de Solid pasa todos los setters", (tag) => {
    const at = solid.search(new RegExp(`<${tag}\\s+\\{\\.\\.\\.rest\\}`));
    expect(at, "sin componente en src/solid/").toBeGreaterThan(-1);
    const from = solid.lastIndexOf("splitProps(props, [", at);
    const listed = [...solid.slice(from, solid.indexOf("]", from)).matchAll(/"(\w+)"/g)].map((m) => m[1]);
    expect(setters(tag).filter((k) => !listed.includes(k))).toEqual([]);
  });
});

describe("BDUI derivado de la clase", () => {
  it("no acepta setters de HTMLElement ni claves sin setter", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [el] = render({ component: "Button", props: { label: "Ok", hold: 800, textContent: "x", innerHTML: "<b>", nada: 1 } }, document.createElement("div"));
    expect(el.getAttribute("label")).toBe("Ok");
    expect(el.getAttribute("hold")).toBe("800");
    expect(el.querySelector("b")).toBeNull();
    expect((el as unknown as Record<string, unknown>).nada).toBeUndefined();
    expect(warn.mock.calls.map((c) => String(c[0])).filter((m) => m.includes("prop ignorada"))).toHaveLength(3);
    warn.mockRestore();
  });

  it("un payload no pisa un método (logout() de nx-account)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const [el] = render({ component: "Account", props: { logout: true, logoutUrl: "/salir" } }, document.createElement("div"));
    expect(typeof (el as unknown as { logout: unknown }).logout).toBe("function");
    expect(el.getAttribute("logout-url")).toBe("/salir");
    warn.mockRestore();
  });

  it("si el elemento aún no está definido, las props esperan a su clase", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    registerComponent("Tardio", "x-tardio");
    const host = document.createElement("div");
    document.body.append(host);
    const [el] = render({ component: "Tardio", props: { titulo: "Hola", otra: 1 } }, host);
    customElements.define(
      "x-tardio",
      class extends HTMLElement {
        set titulo(v: string) {
          this.setAttribute("titulo", v);
        }
      },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(el.getAttribute("titulo")).toBe("Hola");
    expect((el as unknown as Record<string, unknown>).otra).toBeUndefined();
    host.remove();
    warn.mockRestore();
  });
});

describe("empaquetado: lo que se construye se puede importar", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { exports: Record<string, unknown>; sideEffects: string[] };
  /** Resuelve una subruta como Node: la clave exacta o un patrón con «*». */
  const resolve = (sub: string): unknown => {
    if (sub in pkg.exports) return pkg.exports[sub];
    for (const [k, v] of Object.entries(pkg.exports)) {
      const [pre, post] = k.split("*");
      if (post !== undefined && sub.startsWith(pre) && sub.endsWith(post) && typeof v === "string") return v.replace("*", sub.slice(pre.length, sub.length - post.length));
    }
    return undefined;
  };

  it("cada hoja de scripts/build-css.mjs tiene su export (nx32-elements/<pieza>.css)", () => {
    const css = [...readFileSync("scripts/build-css.mjs", "utf8").matchAll(/^ {2}"?([\w-]+)"?: "src\/[^"]+\.css",$/gm)].map((m) => m[1]);
    expect(css.length).toBeGreaterThan(40);
    expect(css.filter((k) => resolve(`./${k}.css`) !== `./dist/${k}.css`)).toEqual([]);
  });

  it("cada entrada de vite.config.ts tiene su subruta, con tipos", () => {
    const js = [...readFileSync("vite.config.ts", "utf8").matchAll(/^ {10}"?([\w/-]+)"?: "src\/[^"]+\.ts",$/gm)].map((m) => m[1]);
    expect(js.length).toBeGreaterThan(40);
    const targets = Object.values(pkg.exports).map((v) => JSON.stringify(v));
    expect(js.filter((k) => !targets.some((t) => t.includes(`"./dist/${k}.js"`)))).toEqual([]);
    expect(resolve("./package.json")).toBe("./package.json");
  });

  it("nx32-elements/core queda fuera de sideEffects (no registra componentes)", () => {
    // Los patrones de sideEffects con «*» no cruzan carpetas: dist/core/index.js no es «./dist/*.js».
    const glob = (p: string) => new RegExp(`^${p.replace(/[.]/g, "\\.").replace(/\*/g, "[^/]*")}$`);
    expect(pkg.sideEffects.some((p) => glob(p).test("./dist/core/index.js"))).toBe(false);
    expect(readFileSync("src/core/index.ts", "utf8")).not.toMatch(/components\//);
  });
});

describe("convención de eventos: nx-<componente>-<acción>", () => {
  /** Eventos nativos que los componentes reemiten (el `change` de un control, el `input` de un campo). */
  const NATIVE = ["change", "input"];
  /** Excepciones justificadas: `[directorio, evento, motivo]`. */
  const EXCEPTIONS: [string, string, string][] = [["guard", "nx-number-change", "«Corregir» en un <nx-number> emite sus eventos, como si se hubiera escrito"]];
  const found: string[] = [];
  const bad: string[] = [];
  for (const d of readdirSync("src/components")) {
    let index = "";
    try {
      index = readFileSync(`src/components/${d}/index.ts`, "utf8");
    } catch {
      continue;
    }
    const prefixes = [...index.matchAll(/define\("nx-([\w-]+)"/g)].map((m) => `nx-${m[1]}-`);
    const ok = (name: string) => name === "nx-open-change" || NATIVE.includes(name) || prefixes.some((p) => name.startsWith(p)) || EXCEPTIONS.some(([x, n]) => x === d && n === name);
    for (const f of readdirSync(`src/components/${d}`).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(`src/components/${d}/${f}`, "utf8");
      const where = `${d}/${f}`;
      // Un prefijo con plantilla (`nx-kanban-${type}`): lo que se pasa al ayudante es la acción.
      const templates = [...src.matchAll(/new (?:Custom)?Event(?:<[^>]*>)?\(\s*`([^`$]*)\$\{/g)].map((m) => m[1]);
      for (const t of templates) {
        found.push(`${t}*`);
        if (!prefixes.includes(t)) bad.push(`${where}: \`${t}\${…}\``);
      }
      const names = [
        ...[...src.matchAll(/new (?:Custom)?Event(?:<[^>]*>)?\(\s*["'`]([\w-]+)["'`]/g)].map((m) => m[1]),
        ...[...src.matchAll(/(?:#emit|#fire|(?<![\w.])emit|(?<![\w.])fire)(?:<[^>]*>)?\(\s*["']([\w-]+)["']/g)].map((m) => m[1]).filter((n) => n.startsWith("nx-") || !templates.length),
      ];
      for (const n of names) {
        found.push(n);
        if (!ok(n)) bad.push(`${where}: ${n}`);
      }
    }
  }

  it("se encontraron los eventos de la librería", () => {
    expect(found.length).toBeGreaterThan(120);
    expect(found).toContain("nx-kanban-*");
    expect(found).toContain("nx-scan-read");
  });

  it("cada evento empieza por nx-<etiqueta sin nx>- (salvo nx-open-change y los nativos)", () => {
    expect(bad).toEqual([]);
  });
});
