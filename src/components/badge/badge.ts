/**
 * `<nx-badge>`: el estado de un registro en una píldora («Activa», «De vacaciones», «Retirado»).
 *
 * El texto es el contenido del autor, o `label` (lo que usa BDUI, que no pasa hijos). El tono pone
 * el fondo y un punto; el texto siempre dice el estado, el color solo lo refuerza. Casi todo es CSS
 * (`badge.css`): la clase solo pinta `label` y da los setters que usan BDUI y Solid.
 */
import { attrProps, Base, upgrade } from "../../core/define";
import type { BadgeTone } from "./types";

export class NxBadge extends Base {
  static {
    attrProps(this, ["label", "tone"]);
  }
  declare label: string | null;
  declare tone: BadgeTone | null;
  static observedAttributes = ["label", "tone"];

  #text?: HTMLSpanElement;

  connectedCallback(): void {
    upgrade(this);
    this.#paint();
  }

  attributeChangedCallback(name: string): void {
    if (name === "label") this.#paint();
  }

  #paint(): void {
    const label = this.getAttribute("label");
    if (label === null) return void this.#text?.remove();
    this.#text ??= Object.assign(document.createElement("span"), { className: "nx-badge__text" });
    this.#text.textContent = label;
    // Al final: los nodos del autor (y los marcadores de Solid) no se tocan.
    if (this.#text.parentNode !== this) this.append(this.#text);
  }
}
