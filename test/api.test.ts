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
