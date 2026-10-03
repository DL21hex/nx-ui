/**
 * El panel con los hijos de un padre: cabecera, buscador, lista y chips utilitarios al pie.
 * Lo usan el panel flotante del escritorio y el drill-down del drawer móvil, así que las dos
 * vistas no pueden divergir. Portado de nx32 (`components/MenuFlyout.tsx`).
 *
 * El estado (consulta, resaltado) vive en este cierre y el host lo desecha al cerrar: cada
 * apertura empieza limpia sin sincronizar nada. Las opciones se crean una vez; el buscador solo
 * las muestra u oculta, con el texto sin tildes calculado una vez por hijo.
 */
import { h, safeHref } from "../../core/dom";
import { glyph, icon } from "../../core/icons";
import { flyoutKeyStep, foldText, formatBadge, groupBySection, panelHasSearch, splitUtility } from "./logic";
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
  // Los hijos vienen del backend: lo que no es un objeto se ignora (un `null` rompía el panel). Un
  // hijo que a su vez tiene hijos (un tercer nivel) no se pierde: sus hojas entran como una sección
  // con su nombre («Reportes»: Mensual, Anual). La copia lleva la sección; `real` vuelve al original.
  const real = new Map<MenuItem, MenuItem>();
  const leaves = (list: unknown, section?: string): MenuItem[] =>
    (Array.isArray(list) ? list : []).flatMap((c: MenuItem | null): MenuItem[] => {
      if (!c || typeof c !== "object") return [];
      if (Array.isArray(c.children) && c.children.length > 0) return leaves(c.children, String(c.label ?? ""));
      if (section === undefined) return [c];
      const copy = { ...c, section };
      real.set(copy, c);
      return [copy];
    });
  const children = leaves(o.item.children);
  const title = String(o.item.label ?? "");
  const searchable = panelHasSearch(children);
  const listId = `${o.idPrefix}-list`;
  let highlighted = -1;
  /** Las opciones visibles, en orden (las del teclado). */
  let flat: HTMLElement[] = [];
  const all: HTMLElement[] = [];
  const folded = new Map<HTMLElement, string>();
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
    "data-nx-ephemeral": "",
  }) : null;
  const scroller = h("div", { class: "nx-panel__scroll" });
  const utils = h("div", { class: "nx-panel__utils", role: "group" });
  // Sin buscador, la lista misma toma el foco y lleva el `aria-activedescendant`.
  const listbox = h(
    "div",
    { id: listId, class: "nx-panel__list", role: "listbox", "aria-label": title, tabindex: input ? null : "-1", autofocus: !input && o.autofocus },
    scroller,
    utils,
  );
  const focusEl: HTMLElement = input ?? listbox;
  const empty = h("p", { class: "nx-panel__empty", hidden: true }, o.labels.empty);

  const option = (child: MenuItem, chip: boolean): HTMLElement => {
    const src = real.get(child) ?? child;
    const label = String(child.label ?? "");
    const badge = formatBadge(child.badge);
    const el = h(
      "a",
      {
        class: chip ? "nx-panel__chip" : "nx-panel__option",
        role: "option",
        id: `${o.idPrefix}-o${all.length}`,
        "aria-selected": "false",
        "aria-current": src === o.active ? "page" : null,
        "data-nx-key": o.keyOf(src),
        href: safeHref(child.href),
        tabindex: "-1",
        title: chip && child.description ? String(child.description) : null,
      },
      icon(child.icon, label),
      chip
        ? h("span", { class: "nx-panel__label" }, label)
        : h(
            "span",
            { class: "nx-panel__text" },
            h("span", { class: "nx-panel__label" }, label),
            child.description ? h("span", { class: "nx-panel__desc" }, String(child.description)) : null,
          ),
      badgeEl(badge),
    );
    // Nombre y descripción separados por un salto: una consulta (una línea) no cruza de uno al otro.
    folded.set(el, `${foldText(label)}\n${foldText(String(child.description ?? ""))}`);
    all.push(el);
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

  const { work, utilities } = splitUtility(children);
  const groups = groupBySection(work).map((g, gi) => {
    const opts = g.items.map((c) => option(c, false));
    if (!g.label) return h("div", { role: "group" }, ...opts);
    const hid = `${o.idPrefix}-g${gi}`;
    return h("div", { role: "group", "aria-labelledby": hid }, h("div", { id: hid, class: "nx-panel__section" }, g.label), ...opts);
  });
  scroller.append(...groups);
  utils.append(...utilities.map((c) => option(c, true)));

  /** Muestra lo que coincide con la consulta y oculta el resto (no lo recrea). Con algo escrito,
   *  la primera queda resaltada: Enter la elige sin pasar por ↓. */
  const filter = (query: string) => {
    flat[highlighted]?.setAttribute("aria-selected", "false");
    highlighted = -1;
    focusEl.removeAttribute("aria-activedescendant");
    const q = foldText(query);
    flat = all.filter((el) => {
      el.hidden = !!q && !folded.get(el)!.includes(q);
      return !el.hidden;
    });
    const shown = (box: Element) => !!box.querySelector('[role="option"]:not([hidden])');
    for (const g of groups) g.hidden = !shown(g);
    utils.hidden = !shown(utils);
    empty.hidden = flat.length > 0;
    if (q && flat.length) highlight(0, false);
  };

  const el = h(
    "div",
    { class: "nx-panel" },
    // Sin buscador, una línea separa la cabecera del padre de sus hijos (si no, parece uno más).
    h(
      "div",
      { class: input ? "nx-panel__head" : "nx-panel__head nx-panel__head--rule" },
      h("span", { class: "nx-panel__glyph" }, icon(o.item.icon, title)),
      h(
        "div",
        { class: "nx-panel__titles" },
        h("p", { class: "nx-panel__title" }, title),
        o.item.description ? h("p", { class: "nx-panel__desc" }, String(o.item.description)) : null,
      ),
    ),
    input ? h("div", { class: "nx-panel__search" }, glyph("search", "nx-panel__search-icon"), input) : null,
    listbox,
    empty,
  );

  input?.addEventListener("input", () => filter(input.value));

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

  filter("");

  return {
    el,
    input,
    focusEl,
    revealActive: () => flat.find((f) => f.hasAttribute("aria-current"))?.scrollIntoView({ block: "nearest" }),
  };
}
