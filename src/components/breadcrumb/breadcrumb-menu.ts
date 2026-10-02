/**
 * El menú de `<nx-breadcrumb>`: los hermanos de un nivel (o los niveles escondidos en el «…»), con
 * el actual marcado y buscador si son muchos. Se carga aparte (`import()`) al abrir el primero: una
 * ruta que nadie abre no lo paga.
 *
 * Es un popover `manual` (capa superior: no lo recorta un contenedor con `overflow`), puesto con
 * `position: fixed` debajo del botón que lo abrió. Se cierra con `Esc` (el foco vuelve al botón),
 * `Tab`, un clic afuera, al desplazar la página o al cambiar el tamaño de la ventana.
 */
import { h, safeHref } from "../../core/dom";
import { glyph, hasIcon, icon } from "../../core/icons";
import { foldText } from "../../core/text";
import { itemKey, SEARCH_AT } from "./logic";
import type { BreadcrumbItem, BreadcrumbLabels, BreadcrumbVia } from "./types";

const CHECK = '<path d="M20 6 9 17l-5-5"/>';

export interface MenuSpec {
  trigger: HTMLElement;
  /** Nombre del menú (y del buscador: «Buscar en {name}…»). */
  name: string;
  /** Nivel en que queda lo elegido. Con `indent`, el de la primera entrada (las demás, uno más cada una). */
  level: number;
  /** El menú del «…»: los niveles escondidos, sangrados y sin marca. */
  indent: boolean;
  /** La clave del nivel que ya está (se marca y elegirlo solo cierra). */
  current: string | null;
  items: BreadcrumbItem[] | (() => Promise<BreadcrumbItem[]>);
}

export interface MenuHost {
  labels(): BreadcrumbLabels;
  /** Avisa con `nx-breadcrumb-navigate`; `false` si alguien lo canceló. */
  go(item: BreadcrumbItem, level: number, via: BreadcrumbVia): boolean;
}

export class BreadcrumbMenu {
  #el: HTMLDivElement;
  #host: MenuHost;
  #open: MenuSpec | null = null;
  #list: BreadcrumbItem[] = [];
  #token = 0;
  #outside = (e: Event): void => {
    // Dentro del menú (también su lista al desplazarse) o en el botón que lo abrió, nada.
    const t = e.target;
    if (t instanceof Node && (this.#el.contains(t) || (e.type === "pointerdown" && this.#open?.trigger.contains(t)))) return;
    this.close(false);
  };

  constructor(el: HTMLDivElement, host: MenuHost) {
    this.#el = el;
    this.#host = host;
    el.addEventListener("click", (e) => {
      const item = (e.target as Element).closest<HTMLElement>("[data-j]");
      const o = this.#open;
      if (!item || !o || ((e.ctrlKey || e.metaKey || e.shiftKey) && item.tagName === "A")) return;
      const j = +item.dataset.j!;
      const it = this.#list[j];
      // El foco vuelve al botón que abrió el menú: si la app repinta, la ruta lo recupera por su clave.
      if (itemKey(it) === o.current || !host.go(it, o.indent ? o.level + j : o.level, "menu")) e.preventDefault();
      this.close(true);
    });
    el.addEventListener("input", (e) => {
      const q = foldText((e.target as HTMLInputElement).value.trim());
      let n = 0;
      for (const li of el.querySelectorAll<HTMLElement>("li")) {
        li.hidden = !foldText(li.textContent ?? "").includes(q);
        if (!li.hidden) n++;
      }
      el.querySelector<HTMLElement>(".nx-breadcrumb__status")!.hidden = n > 0;
    });
    el.addEventListener("keydown", (e) => this.#key(e));
  }

  async toggle(spec: MenuSpec): Promise<void> {
    if (this.#open?.trigger === spec.trigger) return this.close(true);
    this.close(false);
    const token = this.#token;
    const L = this.#host.labels();
    const el = this.#el;
    this.#open = spec;
    spec.trigger.setAttribute("aria-expanded", "true");
    el.replaceChildren();
    el.hidden = false;
    try {
      el.showPopover?.();
    } catch {
      /* sin soporte: el menú es `position: fixed` igual */
    }
    document.addEventListener("pointerdown", this.#outside, true);
    addEventListener("scroll", this.#outside, { capture: true, passive: true });
    addEventListener("resize", this.#outside);
    let items = spec.items;
    if (typeof items === "function") {
      this.#status(L.loading);
      try {
        items = await items();
      } catch {
        if (this.#token === token) this.#status(L.error);
        return;
      }
      if (this.#token !== token) return;
    }
    this.#fill(items, L);
  }

  close(refocus: boolean): void {
    this.#token++;
    document.removeEventListener("pointerdown", this.#outside, true);
    removeEventListener("scroll", this.#outside, true);
    removeEventListener("resize", this.#outside);
    const o = this.#open;
    if (!o) return;
    this.#open = null;
    try {
      this.#el.hidePopover?.();
    } catch {
      /* ya estaba cerrado */
    }
    this.#el.hidden = true;
    this.#el.replaceChildren();
    o.trigger.setAttribute("aria-expanded", "false");
    if (refocus && o.trigger.isConnected) o.trigger.focus();
  }

  #status(text: string): void {
    this.#el.replaceChildren(h("p", { class: "nx-breadcrumb__status", role: "status" }, text));
    this.#place();
  }

  #fill(items: BreadcrumbItem[], L: BreadcrumbLabels): void {
    const o = this.#open!;
    this.#list = items;
    const ul = h("ul", { role: "menu", "aria-label": o.name });
    items.forEach((it, j) => {
      const on = itemKey(it) === o.current;
      const href = safeHref(it.href);
      const attrs = { class: "nx-breadcrumb__mitem", role: o.indent ? "menuitem" : "menuitemradio", tabindex: "-1", "data-j": j, "aria-checked": o.indent ? null : String(on) };
      const content = [it.icon && hasIcon(it.icon) ? icon(it.icon) : null, h("span", { class: "nx-breadcrumb__text" }, it.label), on ? glyph(CHECK, "nx-breadcrumb__check") : null];
      const el = href ? h("a", { ...attrs, href }, ...content) : h("button", { ...attrs, type: "button" }, ...content);
      if (o.indent) el.style.setProperty("--_lvl", String(j));
      ul.append(h("li", { role: "none" }, el));
    });
    const ph = L.search.replace("{label}", o.name);
    const input = !o.indent && items.length > SEARCH_AT ? h("input", { type: "text", "aria-label": ph, placeholder: ph, autocomplete: "off", spellcheck: "false" }) : null;
    this.#el.replaceChildren(
      ...(input ? [h("div", { class: "nx-breadcrumb__search" }, glyph("search"), input)] : []),
      ul,
      h("p", { class: "nx-breadcrumb__status", role: "status", hidden: items.length > 0 }, L.empty),
    );
    this.#place();
    const target = input ?? ul.querySelector<HTMLElement>('[aria-checked="true"]') ?? ul.querySelector<HTMLElement>("[data-j]");
    target?.focus();
    target?.scrollIntoView?.({ block: "nearest" });
  }

  /** Debajo del botón que lo abrió, sin salirse de la ventana. */
  #place(): void {
    const el = this.#el;
    const r = this.#open!.trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || innerWidth;
    const top = r.bottom + 6;
    el.style.top = `${top}px`;
    el.style.left = `${Math.max(8, Math.min(r.left - 8, vw - el.offsetWidth - 8))}px`;
    el.style.setProperty("--_max", `${Math.max(120, Math.min(320, innerHeight - top - 60))}px`);
  }

  #key(e: KeyboardEvent): void {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const input = this.#el.querySelector("input");
    const items = [...this.#el.querySelectorAll<HTMLElement>("li:not([hidden]) > [data-j]")];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const at = (k: number) => items.length && items[(k + items.length) % items.length].focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        at(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (i <= 0 && input) input.focus();
        else at(i < 0 ? items.length - 1 : i - 1);
        break;
      case "Home":
      case "End":
        if (e.target === input) break;
        e.preventDefault();
        at(e.key === "Home" ? 0 : items.length - 1);
        break;
      case "Enter":
        if (e.target === input) {
          e.preventDefault();
          items[0]?.click();
        }
        break;
      case "Escape":
        // Antes que un diálogo que lo contenga: Esc cierra primero el menú.
        e.preventDefault();
        e.stopPropagation();
        this.close(true);
        break;
      case "Tab":
        this.close(false);
        break;
      default:
        if (e.target === input || e.key.length !== 1 || e.key === " ") break;
        // Escribir: al buscador si lo hay (la letra cae ahí); si no, salta a la siguiente con esa inicial.
        if (input) input.focus();
        else {
          const k = foldText(e.key);
          for (let j = 1; j <= items.length; j++) {
            const b = items[(i + j + items.length) % items.length];
            if (foldText(b.textContent ?? "").startsWith(k)) {
              b.focus();
              break;
            }
          }
        }
    }
  }
}
