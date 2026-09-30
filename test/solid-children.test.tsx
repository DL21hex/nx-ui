// Los envoltorios de Solid con hijos que cambian. Si `{children}` fuera lo único dentro del
// elemento, Solid tomaría como suyos también los nodos del componente (la tabla, la cabecera del
// diálogo…) y los borraría al apagarse un `<Show>`. Ver «Hijos» en src/solid/index.tsx.
import { describe, expect, it } from "vitest";
import { render } from "solid-js/web";
import { createSignal, Show, type JSX } from "solid-js";
import { Grid } from "../src/solid/grid";
import { Dialog } from "../src/solid/dialog";
import { Print } from "../src/solid/print";
import { Review } from "../src/solid/review";
import { Guard } from "../src/solid/guard";
import { PasteFill } from "../src/solid/paste-fill";
import { Explain } from "../src/solid/explain";
import { SideMenu } from "../src/solid/sidemenu";

const CASES: [string, (kids: () => JSX.Element) => JSX.Element][] = [
  ["grid", (k) => <Grid columns={[{ key: "a", label: "A" }]} rows={[{ id: 1, a: "x" }]} selectable>{k()}</Grid>],
  ["dialog", (k) => <Dialog heading="H" open>{k()}</Dialog>],
  ["print", (k) => <Print heading="H">{k()}</Print>],
  ["review", (k) => <Review>{k()}</Review>],
  ["guard", (k) => <Guard fields={{}}>{k()}</Guard>],
  ["paste-fill", (k) => <PasteFill fields={[]}>{k()}</PasteFill>],
  ["explain", (k) => <Explain>{k()}</Explain>],
  ["sidemenu", (k) => <SideMenu items={[{ id: "a", label: "A", href: "/" }]}>{k()}</SideMenu>],
];

const own = (el: Element) => [...el.children].filter((x) => !x.classList.contains("autor") && x.localName !== "template");

describe("envoltorios de Solid con hijos que cambian", () => {
  for (const [name, make] of CASES) {
    it(`${name}: un <Show> que se apaga y se prende no toca los nodos del componente`, () => {
      const root = document.body.appendChild(document.createElement("div"));
      const [on, setOn] = createSignal(true);
      const dispose = render(() => make(() => <Show when={on()}><button class="autor" slot="bulk">A</button></Show>), root);
      const el = root.querySelector(`nx-${name}`)!;
      const before = own(el);
      setOn(false);
      expect(el.querySelector(".autor")).toBeNull();
      expect(own(el)).toEqual(before);
      setOn(true);
      expect(el.querySelector(".autor")).not.toBeNull();
      expect(own(el)).toEqual(before);
      dispose();
      root.remove();
    });
  }

  it("grid: las acciones en lote que aparecen después (sin hijos al principio)", () => {
    const root = document.body.appendChild(document.createElement("div"));
    const [on, setOn] = createSignal(false);
    render(() => <Grid columns={[{ key: "a", label: "A" }]} rows={[{ id: 1, a: "x" }]}>{on() ? <button slot="bulk">B</button> : null}</Grid>, root);
    const el = root.querySelector("nx-grid")!;
    setOn(true);
    setOn(false);
    setOn(true);
    expect(el.querySelector(".nx-grid__scroll")).not.toBeNull();
    expect(el.querySelectorAll("[slot=bulk]").length).toBe(1);
  });
});
