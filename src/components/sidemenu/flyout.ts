/**
 * El panel con los hijos de un padre: cabecera, buscador, lista y chips utilitarios al pie.
 * Lo usan el panel flotante del escritorio y el drill-down del drawer móvil, así que las dos
 * vistas no pueden divergir. Portado de nx32 (`components/MenuFlyout.tsx`).
 *
 * El estado (consulta, resaltado) vive en este cierre y el host lo desecha al cerrar: cada
 * apertura empieza limpia sin sincronizar nada.
 */
import { h, safeHref } from "../../core/dom";
import { glyph, icon } from "../../core/icons";
import { filterItems, flyoutKeyStep, formatBadge, groupBySection, panelHasSearch, splitUtility } from "./logic";
import type { MenuItem, SidemenuLabels } from "./types";

/** El badge de una fila (riel, opción o chip). En compacto el CSS lo reduce a un punto. */
export function badgeEl(text: string | null): HTMLSpanElement | null {
  return text ? h("span", { class: "nx-badge" }, text) : null;
}

export interface ChildPanelOptions {
  item: MenuItem;
  /** La hoja activa, que lleva `aria-current="page"`. */
  active: MenuItem | null;
  labels: SidemenuLabels;
  /** Prefijo único para los ids que usa `aria-activedescendant`. */
  idPrefix: string;
  /** Clave interna del ítem (`data-nx-key`): con ella el host resuelve el clic. */
  keyOf: (item: MenuItem) => string | undefined;
  /** El buscador (o la lista, si no hay buscador) recibe el foco al mostrarse. Solo con puntero
   *  fino: en una tablet el buscador abriría el teclado. */
  autofocus: boolean;
  /** Tab o Escape dentro del panel. */
  onClose?: (key: string) => void;
}

export interface ChildPanel {
  el: HTMLElement;
  /** El buscador, o `null` cuando el padre tiene pocos hijos (`panelHasSearch`). */
  input: HTMLInputElement | null;
  /** Quien lleva el teclado: el buscador o, sin él, la propia lista. */
  focusEl: HTMLElement;
  /** Deja a la vista la opción activa. Se llama cuando el panel ya es visible. */
  revealActive(): void;
}

export function renderChildPanel(o: ChildPanelOptions): ChildPanel {
  const children = Array.isArray(o.item.children) ? o.item.children : [];
  const searchable = panelHasSearch(children);
  const listId = `${o.idPrefix}-list`;
  let query = "";
  let highlighted = -1;
  let flat: HTMLElement[] = [];
  let lastPointer: { x: number; y: number } | null = null;

  const input = searchable ? h("input", {
    type: "text",
    class: "nx-panel__input",
    role: "combobox",
    "aria-expanded": "true",
    "aria-controls": listId,
    "aria-autocomplete": "list",
    "aria-label": o.labels.filter,
    placeholder: o.labels.filter,
    autocomplete: "off",
    spellcheck: "false",
    autofocus: o.autofocus,
  }) : null;
  const scroller = h("div", { class: "nx-panel__scroll" });
  const utils = h("div", { class: "nx-panel__utils", role: "group" });
  // Sin buscador, la lista misma toma el foco y lleva el `aria-activedescendant`.
  const listbox = h(
    "div",
    { id: listId, class: "nx-panel__list", role: "listbox", "aria-label": o.item.label, tabindex: input ? null : "-1", autofocus: !input && o.autofocus },
    scroller,
    utils,
  );
  const focusEl: HTMLElement = input ?? listbox;
  const empty = h("p", { class: "nx-panel__empty", hidden: true }, o.labels.empty);

  const option = (child: MenuItem, chip: boolean): HTMLElement => {
    const label = String(child.label ?? "");
    const badge = formatBadge(child.badge);
    const el = h(
      "a",
      {
        class: chip ? "nx-panel__chip" : "nx-panel__option",
        role: "option",
        id: `${o.idPrefix}-o${flat.length}`,
        "aria-selected": "false",
        "aria-current": child === o.active ? "page" : null,
        "data-nx-key": o.keyOf(child),
        href: safeHref(child.href),
        tabindex: "-1",
        title: chip ? child.description : null,
      },
      icon(child.icon, label),
      chip
        ? h("span", { class: "nx-panel__label" }, label)
        : h(
            "span",
            { class: "nx-panel__text" },
            h("span", { class: "nx-panel__label" }, label),
            child.description ? h("span", { class: "nx-panel__desc" }, child.description) : null,
          ),
      badgeEl(badge),
    );
    flat.push(el);
    return el;
  };

  const highlight = (i: number, scroll = true) => {
    flat[highlighted]?.setAttribute("aria-selected", "false");
    highlighted = i;
    const el = flat[i];
    if (el) {
      el.setAttribute("aria-selected", "true");
      focusEl.setAttribute("aria-activedescendant", el.id);
      if (scroll) el.scrollIntoView({ block: "nearest" });
    } else focusEl.removeAttribute("aria-activedescendant");
  };

  const renderList = () => {
    flat = [];
    highlighted = -1;
    focusEl.removeAttribute("aria-activedescendant");
    const { work, utilities } = splitUtility(filterItems(children, query));
    scroller.replaceChildren(
      ...groupBySection(work).map((g, gi) => {
        const opts = g.items.map((c) => option(c, false));
        if (!g.label) return h("div", { role: "group" }, ...opts);
        const hid = `${o.idPrefix}-g${gi}`;
        return h("div", { role: "group", "aria-labelledby": hid }, h("div", { id: hid, class: "nx-panel__section" }, g.label), ...opts);
      }),
    );
    utils.replaceChildren(...utilities.map((c) => option(c, true)));
    utils.hidden = utilities.length === 0;
    empty.hidden = flat.length > 0;
  };

  const el = h(
    "div",
    { class: "nx-panel" },
    // Sin buscador, una línea separa la cabecera del padre de sus hijos (si no, parece uno más).
    h(
      "div",
      { class: input ? "nx-panel__head" : "nx-panel__head nx-panel__head--rule" },
      h("span", { class: "nx-panel__glyph" }, icon(o.item.icon, o.item.label)),
      h(
        "div",
        { class: "nx-panel__titles" },
        h("p", { class: "nx-panel__title" }, String(o.item.label ?? "")),
        o.item.description ? h("p", { class: "nx-panel__desc" }, o.item.description) : null,
      ),
    ),
    input ? h("div", { class: "nx-panel__search" }, glyph("search", "nx-panel__search-icon"), input) : null,
    listbox,
    empty,
  );

  input?.addEventListener("input", () => {
    query = input.value;
    renderList();
  });

  el.addEventListener("keydown", (e) => {
    const step = flyoutKeyStep(e.key, highlighted, flat.length);
    if (step === null) return;
    if (step === "close") {
      o.onClose?.(e.key);
      return;
    }
    e.preventDefault();
    if (step === "select") flat[highlighted]?.click();
    else highlight(step);
  });

  // El ratón resalta al MOVERSE, no al entrar: si el panel se abre bajo un puntero quieto, o el
  // navegador emite un `mousemove` sintético tras un cambio de layout, no se resalta nada al azar.
  listbox.addEventListener("mousemove", (e) => {
    const moved = lastPointer !== null && (lastPointer.x !== e.clientX || lastPointer.y !== e.clientY);
    lastPointer = { x: e.clientX, y: e.clientY };
    if (!moved) return;
    const i = flat.indexOf((e.target as Element).closest?.('[role="option"]') as HTMLElement);
    if (i >= 0 && i !== highlighted) highlight(i, false);
  });

  renderList();

  return {
    el,
    input,
    focusEl,
    revealActive: () => flat.find((f) => f.hasAttribute("aria-current"))?.scrollIntoView({ block: "nearest" }),
  };
}
