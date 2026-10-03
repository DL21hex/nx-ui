/**
 * El menú de `<nx-breadcrumb>`: los hermanos de un nivel (o los niveles escondidos en el «…»), con
 * el actual marcado y buscador si son muchos. Se carga aparte (`import()`) al abrir el primero: una
 * ruta que nadie abre no lo paga.
 *
 * Es un popover `manual` (capa superior: no lo recorta un contenedor con `overflow`), puesto con
 * `position: fixed` junto al botón que lo abrió (debajo, o encima si abajo no cabe). Se cierra con
 * `Esc` (el foco vuelve al botón, también mientras carga), `Tab` (sigue desde el botón), un clic
 * afuera, al irse el foco a otra parte, al desplazar la página o al cambiar el tamaño de la ventana.
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
  /** El nombre de cada entrada sin tildes, calculado al llenar: el buscador solo compara. */
  #folded: string[] = [];
  #token = 0;
  /** Lo que cambia (buscador y lista). El aviso de abajo es una región viva fija: se anuncia al
   *  cambiar su texto («Cargando…» → «No se pudo cargar»), no al insertarla ya llena. */
  #body = h("div");
  #live = h("p", { class: "nx-breadcrumb__status", role: "status" });
  #outside = (e: Event): void => {
    // Dentro del menú (también su lista al desplazarse) o en el botón que lo abrió, nada.
    const t = e.target;
    if (t instanceof Node && (this.#el.contains(t) || (e.type === "pointerdown" && this.#open?.trigger.contains(t)))) return;
    // Escribiendo en el buscador, el teclado virtual (o el navegador al mostrarlo) mueve la ventana:
    // se recoloca en vez de cerrar.
    if (e.type !== "pointerdown" && document.activeElement?.localName === "input" && this.#el.contains(document.activeElement)) return this.#place();
    this.close(false);
  };
  /** El foco se fue a otra parte (Tab desde el botón mientras carga): se cierra sin robárselo. */
  #focusin = (e: FocusEvent): void => {
    const t = e.target as Node;
    if (!this.#el.contains(t) && !this.#open?.trigger.contains(t)) this.close(false);
  };
  /** Mientras carga el foco sigue en el botón: Esc cierra desde ahí, antes que un diálogo que lo contenga. */
  #triggerKey = (e: KeyboardEvent): void => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    e.stopPropagation();
    this.close(true);
  };

  constructor(el: HTMLDivElement, host: MenuHost) {
    this.#el = el;
    this.#host = host;
    el.replaceChildren(this.#body, this.#live);
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
      this.#body.querySelectorAll<HTMLElement>("li").forEach((li, j) => {
        li.hidden = !this.#folded[j].includes(q);
        if (!li.hidden) n++;
      });
      this.#live.textContent = n > 0 ? "" : this.#host.labels().empty;
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
    this.#body.replaceChildren();
    this.#live.textContent = "";
    el.hidden = false;
    try {
      el.showPopover?.();
    } catch {
      /* sin soporte: el menú es `position: fixed` igual */
    }
    document.addEventListener("pointerdown", this.#outside, true);
    document.addEventListener("focusin", this.#focusin);
    spec.trigger.addEventListener("keydown", this.#triggerKey);
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
    document.removeEventListener("focusin", this.#focusin);
    removeEventListener("scroll", this.#outside, true);
    removeEventListener("resize", this.#outside);
    const o = this.#open;
    if (!o) return;
    o.trigger.removeEventListener("keydown", this.#triggerKey);
    this.#open = null;
    try {
      this.#el.hidePopover?.();
    } catch {
      /* ya estaba cerrado */
    }
    this.#el.hidden = true;
    this.#body.replaceChildren();
    this.#live.textContent = "";
    o.trigger.setAttribute("aria-expanded", "false");
    if (refocus && o.trigger.isConnected) o.trigger.focus();
  }

  #status(text: string): void {
    this.#body.replaceChildren();
    this.#live.textContent = text;
    this.#place();
  }

  #fill(items: BreadcrumbItem[], L: BreadcrumbLabels): void {
    const o = this.#open!;
    this.#list = items;
    this.#folded = items.map((it) => foldText(it.label));
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
    // Si la carga tardó y el usuario ya está en otra parte, el foco no se le quita.
    const a = document.activeElement;
    const mine = !a || a === document.body || a === o.trigger || this.#el.contains(a);
    this.#body.replaceChildren(...(input ? [h("div", { class: "nx-breadcrumb__search" }, glyph("search"), input)] : []), ul);
    this.#live.textContent = items.length > 0 ? "" : L.empty;
    this.#place();
    // Con puntero fino, el buscador. En una pantalla táctil, el actual: el buscador abriría el
    // teclado, que tapa la lista (escribir en él sigue a un toque).
    const fine = typeof matchMedia === "function" && matchMedia("(pointer: fine)").matches;
    const target = (fine && input) || ul.querySelector<HTMLElement>('[aria-checked="true"]') || ul.querySelector<HTMLElement>("[data-j]");
    if (mine) target?.focus();
    target?.scrollIntoView?.({ block: "nearest" });
  }

  /** Debajo del botón que lo abrió (encima, si abajo no cabe), alineado con él y dentro de la ventana. */
  #place(): void {
    const el = this.#el;
    const trigger = this.#open!.trigger;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || innerWidth;
    const below = innerHeight - r.bottom - 6;
    // Una ruta en un pie o en una ficha baja: hacia arriba, si ahí hay más lugar.
    const up = below < 180 && r.top - 6 > below;
    el.toggleAttribute("data-up", up);
    el.style.top = up ? "auto" : `${r.bottom + 6}px`;
    el.style.bottom = up ? `${innerHeight - r.top + 6}px` : "auto";
    // Por el borde de inicio del botón: el izquierdo, o el derecho en RTL.
    const rtl = getComputedStyle(trigger).direction === "rtl";
    const left = rtl ? r.right + 8 - el.offsetWidth : r.left - 8;
    el.style.left = `${Math.max(8, Math.min(left, vw - el.offsetWidth - 8))}px`;
    el.style.setProperty("--_max", `${Math.max(120, Math.min(320, (up ? r.top - 6 : below) - 60))}px`);
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
        // El menú vive al final de la ruta: sin volver al botón, Tab saltaría los niveles que siguen.
        // Con el foco de vuelta en el botón, la tecla sigue su camino desde ahí.
        this.close(true);
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
