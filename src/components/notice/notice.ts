/**
 * `<nx-notice>`: el aviso de una ficha o un formulario, con su acción al lado («El contrato vence
 * en 11 días · Renovar»). Uno solo por pantalla, y solo cuando hay algo que hacer: si no, no va.
 *
 * El texto es el contenido del autor, que no se mueve (la hidratación de Solid sigue intacta), o
 * `text` (BDUI). El componente agrega al final el ícono y la acción, y la rejilla los pone en su
 * lugar. La acción es un botón (`nx-notice-action`) o, con `action-href`, un enlace.
 *
 * Es una región `status`; con `tone="danger"`, `alert` (se anuncia al aparecer). Un `role` propio
 * del autor se respeta.
 */
import { attrProps, Base, upgrade } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph } from "../../core/icons";
import type { NoticeActionDetail, NoticeTone } from "./types";

const ICONS: Record<NoticeTone, string> = {
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  success: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  danger: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
};

export class NxNotice extends Base {
  static {
    attrProps(this, ["text", "action", "actionHref"]);
  }
  /** El texto, si no viene como contenido (BDUI). */
  declare text: string | null;
  /** El texto del botón de la acción. Sin él, no hay botón. */
  declare action: string | null;
  /** La acción como enlace (rutas relativas, http(s), mailto, tel). */
  declare actionHref: string | null;
  static observedAttributes = ["tone", "text", "action", "action-href"];

  #icon?: HTMLSpanElement;
  #iconTone = "";
  #text?: HTMLSpanElement;
  #act?: HTMLElement;
  #ownRole = false;

  get tone(): NoticeTone {
    const t = this.getAttribute("tone");
    return t === "success" || t === "warning" || t === "danger" ? t : "info";
  }
  set tone(v: NoticeTone | null | undefined) {
    if (v == null) this.removeAttribute("tone");
    else this.setAttribute("tone", v);
  }

  connectedCallback(): void {
    upgrade(this);
    this.#paint();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.#paint();
  }

  #paint(): void {
    const tone = this.tone;
    if (!this.hasAttribute("role") || this.#ownRole) {
      this.setAttribute("role", tone === "danger" ? "alert" : "status");
      this.#ownRole = true;
    }
    if (this.#iconTone !== tone) {
      this.#icon?.remove();
      this.#icon = glyph(ICONS[tone], "nx-notice__icon");
      this.#iconTone = tone;
    }

    const text = this.getAttribute("text");
    if (text !== null) {
      this.#text ??= h("span", { class: "nx-notice__text" });
      // Solo si cambió: reemplazar el texto de una región `status` puede hacer que se vuelva a anunciar.
      if (this.#text.textContent !== text) this.#text.textContent = text;
    } else this.#text?.remove();

    const label = this.getAttribute("action");
    const href = safeHref(this.getAttribute("action-href"));
    const kind = !label ? "" : href ? "A" : "BUTTON";
    if (this.#act?.tagName !== kind) {
      this.#act?.remove();
      this.#act = kind ? (kind === "A" ? h("a", { class: "nx-notice__act" }) : h("button", { type: "button", class: "nx-notice__act" })) : undefined;
      this.#act?.addEventListener("click", () => {
        const detail: NoticeActionDetail = { action: this.getAttribute("action") ?? "" };
        this.dispatchEvent(new CustomEvent("nx-notice-action", { detail, bubbles: true, composed: true }));
      });
    }
    if (this.#act) {
      if (this.#act.textContent !== label) this.#act.textContent = label;
      if (href) this.#act.setAttribute("href", href);
    }

    // Lo propio va al final, en este orden; la rejilla lo acomoda (ver notice.css).
    for (const el of [this.#icon, text !== null ? this.#text : null, this.#act]) if (el && el.parentNode !== this) this.append(el);
  }
}
