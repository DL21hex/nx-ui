/**
 * La cabecera de ficha de `<nx-dialog>`: quién es (`avatar`), su estado (`badge`), pasar al
 * registro anterior o siguiente sin cerrar (`nav`, también con J / K) y el menú «Más» (`actions`,
 * las acciones poco usadas y las destructivas, separadas al final).
 *
 * Se carga aparte (`import()`) cuando el diálogo usa alguno de esos atributos: un modal de
 * confirmación no la paga. Pone sus nodos en los contenedores que la cabecera ya tiene (`__id`,
 * `__trow`, `__tools`) y escucha en el diálogo: Escape cierra primero el menú.
 */
import { h, safeImageSrc } from "../../core/dom";
import { glyph, hasIcon, icon, initials } from "../../core/icons";
import type { NxDialog } from "./dialog";
import type { DialogAction, DialogActionDetail, DialogLabels, DialogNavDetail } from "./types";

const UP = '<path d="m18 15-6-6-6 6"/>';
const DOWN = '<path d="m6 9 6 6 6-6"/>';
const MORE = '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>';
const EDITABLE = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";
const URLISH = /^(https?:|\/|\.)/i;

export class DialogHead {
  #d: NxDialog;
  #avatar = h("span", { class: "nx-dialog__avatar", "aria-hidden": "true", hidden: true });
  #badge = document.createElement("nx-badge");
  #prev: HTMLButtonElement;
  #next: HTMLButtonElement;
  #sep = h("span", { class: "nx-dialog__sep", "aria-hidden": "true", hidden: true });
  #more: HTMLButtonElement;
  #menu: HTMLDivElement;

  constructor(d: NxDialog, head: HTMLElement, uid: string) {
    this.#d = d;
    const tool = (svg: string, data: string) => h("button", { type: "button", class: "nx-dialog__tool", "data-tool": data, hidden: true }, glyph(svg));
    this.#prev = tool(UP, "prev");
    this.#next = tool(DOWN, "next");
    this.#more = tool(MORE, "more");
    this.#more.setAttribute("aria-haspopup", "menu");
    this.#more.setAttribute("aria-expanded", "false");
    this.#more.setAttribute("aria-controls", `${uid}-m`);
    this.#menu = h("div", { class: "nx-dialog__menu", role: "menu", id: `${uid}-m`, hidden: true });
    this.#badge.hidden = true;

    head.querySelector(".nx-dialog__id")!.prepend(this.#avatar);
    head.querySelector(".nx-dialog__trow")!.append(this.#badge);
    head.querySelector(".nx-dialog__tools")!.prepend(this.#prev, this.#next, this.#sep, this.#more, this.#menu);

    for (const b of [this.#prev, this.#next])
      b.addEventListener("click", () => {
        const detail: DialogNavDetail = { dir: b === this.#prev ? "prev" : "next" };
        d.dispatchEvent(new CustomEvent("nx-dialog-nav", { detail, bubbles: true, composed: true }));
      });
    this.#more.addEventListener("click", () => (this.#menu.hidden ? this.#open() : this.#close(true)));
    this.#menu.addEventListener("click", (e) => {
      const item = (e.target as Element).closest<HTMLButtonElement>("[data-action]");
      if (!item || item.disabled) return;
      this.#close(true);
      const detail: DialogActionDetail = { id: item.dataset.action! };
      d.dispatchEvent(new CustomEvent("nx-dialog-action", { detail, bubbles: true, composed: true }));
    });
    this.#menu.addEventListener("keydown", (e) => {
      const items = [...this.#menu.querySelectorAll<HTMLButtonElement>("[data-action]:not(:disabled)")];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: items.length - 1 }[e.key];
      if (to === undefined || !items.length) return;
      e.preventDefault();
      items[(to + items.length) % items.length].focus();
    });
    // En el diálogo, antes que su manejador de documento (que respeta `defaultPrevented`).
    d.addEventListener("keydown", (e) => this.#key(e));
    d.addEventListener("pointerdown", (e) => {
      if (!this.#menu.hidden && !(e.target as Element).closest?.(".nx-dialog__menu, [data-tool='more']")) this.#close(false);
    });
    d.addEventListener("nx-open-change", (e) => {
      if (!(e as CustomEvent<{ open: boolean }>).detail.open) this.#close(false);
    });
  }

  paint(L: DialogLabels): void {
    const d = this.#d;
    const av = d.avatar?.trim() ?? "";
    const img = URLISH.test(av) ? safeImageSrc(av) : undefined;
    this.#avatar.hidden = !av || (URLISH.test(av) && !img);
    if (img) this.#avatar.replaceChildren(h("img", { src: img, alt: "", referrerpolicy: "no-referrer" }));
    else this.#avatar.textContent = initials(av);

    const badge = d.badge;
    this.#badge.hidden = !badge;
    this.#badge.textContent = badge ?? "";
    const tone = d.badgeTone;
    if (tone) this.#badge.setAttribute("tone", tone);
    else this.#badge.removeAttribute("tone");

    const nav = d.nav;
    const dirs = (nav ?? "").split(/[\s,]+/);
    for (const [b, dir, label] of [[this.#prev, "prev", L.prev], [this.#next, "next", L.next]] as const) {
      b.hidden = nav === null;
      b.disabled = !dirs.includes(dir);
      b.setAttribute("aria-label", label);
      b.title = label;
    }
    this.#sep.hidden = nav === null;
    this.#more.hidden = !d.actions.length;
    this.#more.setAttribute("aria-label", L.more);
    this.#more.title = L.more;
    if (!d.actions.length) this.#close(false);
  }

  #key(e: KeyboardEvent): void {
    const open = !this.#menu.hidden;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      this.#close(true);
    } else if (e.key === "Tab" && open) this.#close(false);
    else if ((e.key === "j" || e.key === "k") && !open && !e.defaultPrevented && !e.metaKey && !e.ctrlKey && !e.altKey && this.#d.nav !== null) {
      // Pasar de registro con J / K, como en una bandeja de correo (sin anunciarlo), si no se escribe.
      if ((e.target as Element).closest?.(EDITABLE)) return;
      const b = e.key === "j" ? this.#next : this.#prev;
      if (!b.disabled) {
        e.preventDefault();
        b.click();
      }
    }
  }

  #open(): void {
    const actions = this.#d.actions;
    if (!actions.length) return;
    const item = (a: DialogAction) => h("button", { type: "button", role: "menuitem", class: `nx-dialog__item${a.danger ? " is-danger" : ""}`, "data-action": a.id, tabindex: "-1", disabled: !!a.disabled }, hasIcon(a.icon) ? icon(a.icon) : null, a.label);
    const safe = actions.filter((a) => !a.danger);
    const danger = actions.filter((a) => a.danger);
    const sep = safe.length && danger.length ? [h("div", { role: "separator", class: "nx-dialog__msep" })] : [];
    this.#menu.replaceChildren(...safe.map(item), ...sep, ...danger.map(item));
    this.#menu.hidden = false;
    this.#more.setAttribute("aria-expanded", "true");
    this.#menu.querySelector<HTMLElement>("[data-action]:not(:disabled)")?.focus();
  }

  #close(refocus: boolean): void {
    if (this.#menu.hidden) return;
    this.#menu.hidden = true;
    this.#more.setAttribute("aria-expanded", "false");
    if (refocus) this.#more.focus();
  }
}
