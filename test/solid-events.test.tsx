// Todos los envoltorios de Solid: un `onX` es el evento de ESTE elemento, no uno igual que burbujea
// desde un hijo (un <nx-cards> dentro de otro, un control dentro de una ficha). Y los que no tienen
// hijos no los aceptan: el componente pinta todo su contenido y los borraría al adoptarlos.
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import type { Component } from "solid-js";
import { AIAnswer } from "../src/solid/ai";
import { Sync } from "../src/solid/sync";

beforeAll(() => {
  const fire = (el: HTMLElement, newState: string) => {
    for (const type of ["beforetoggle", "toggle"]) el.dispatchEvent(Object.assign(new Event(type), { newState }));
  };
  HTMLElement.prototype.showPopover ??= function (this: HTMLElement) {
    fire(this, "open");
  };
  HTMLElement.prototype.hidePopover ??= function (this: HTMLElement) {
    fire(this, "closed");
  };
});
let dispose = () => {};
afterEach(() => {
  dispose();
  document.body.innerHTML = "";
});

/** `[archivo, evento, prop]` de cada `on:evento={(e) => … local.prop?.(e)}` de src/solid/. */
const files = readdirSync("src/solid").filter((f) => f.endsWith(".tsx") && f !== "index.tsx");
const handlers = files.flatMap((f) => {
  const src = readFileSync(`src/solid/${f}`, "utf8");
  return [...src.matchAll(/on:([\w-]+)=\{\(e\) => (e\.target === e\.currentTarget && )?local\.(\w+)\?\.\(/g)].map((m) => ({ f, event: m[1], filtered: !!m[2], prop: m[3] }));
});

describe("envoltorios de Solid: los eventos propios", () => {
  it("hay manejadores que revisar", () => {
    expect(handlers.length).toBeGreaterThan(90);
  });

  it("todos ignoran el mismo evento si burbujea desde un hijo (salvo el clic de <Button>)", () => {
    const loose = handlers.filter((h) => !h.filtered && !(h.f === "button.tsx" && h.event === "click"));
    expect(loose.map((h) => `${h.f}: on:${h.event}`)).toEqual([]);
  });

  it.each(files.filter((f) => !["button.tsx", "jsx.ts"].includes(f)))("%s: un evento de un hijo no llega a onX; el del elemento, sí", async (f) => {
    const mine = handlers.filter((h) => h.f === f);
    if (!mine.length) return;
    const mod = (await import(`../src/solid/${f.replace(".tsx", "")}.tsx`)) as Record<string, unknown>;
    const Comp = Object.values(mod).find((v) => typeof v === "function") as Component<Record<string, unknown>>;
    const spies = Object.fromEntries(mine.map((h) => [h.prop, vi.fn()]));
    const root = document.body.appendChild(document.createElement("div"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    dispose = render(() => <Comp {...spies} />, root);
    const host = root.firstElementChild as HTMLElement;
    // El componente puede emitir los suyos al montarse (planner, sync, voice): solo cuentan las
    // llamadas con el evento de prueba.
    const probed = (spy: ReturnType<typeof vi.fn>, from: EventTarget) => spy.mock.calls.some((c) => (c[0] as CustomEvent).detail?.probe && (c[0] as Event).target === from);
    for (const h of mine) {
      const child = host.appendChild(document.createElement("span"));
      child.dispatchEvent(new CustomEvent(h.event, { bubbles: true, detail: { probe: true } }));
      expect(probed(spies[h.prop], child), `${h.event} desde un hijo`).toBe(false);
      child.remove();
      host.dispatchEvent(new CustomEvent(h.event, { bubbles: true, detail: { probe: true } }));
      expect(probed(spies[h.prop], host), `${h.event} del elemento`).toBe(true);
    }
    warn.mockRestore();
  });

  it("los que no tienen hijos no los pasan al elemento", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const kid = () => <b class="autor">x</b>;
    // @ts-expect-error: `children?: never`
    dispose = render(() => <Sync>{kid()}</Sync>, root);
    expect(root.querySelector("nx-sync .autor")).toBeNull();
    dispose();
    // @ts-expect-error: `children?: never`
    dispose = render(() => <AIAnswer>{kid()}</AIAnswer>, root);
    expect(root.querySelector("nx-ai-answer .autor")).toBeNull();
  });
});
