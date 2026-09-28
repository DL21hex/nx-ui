/**
 * `<nx-checklist mode="summary">`: varios procedimientos en una lista compacta, cada uno con su barra
 * de avance, sus vencidos y su fecha límite («Cierre de septiembre · 18/24 · 3 vencidos»), ordenable
 * por vencimiento, avance o nombre. Se carga con `import()` solo en este modo: una página con un
 * procedimiento no lo paga.
 */
import { h, safeHref } from "../../core/dom";
import { checklistDueText, sortChecklistItems, type ChecklistSort } from "./logic";
import type { ChecklistLabels, ChecklistPerson, ChecklistSummaryItem } from "./types";

/** Lo que el resumen necesita del elemento. */
export interface ChecklistSummaryHost {
  items: ChecklistSummaryItem[];
  labels: ChecklistLabels;
  locale: string;
  sort: ChecklistSort;
  uid: string;
  who(p: ChecklistPerson): HTMLElement;
  /** `nx-checklist-open` (cancelable): `false` si se canceló. */
  open(item: ChecklistSummaryItem): boolean;
  resort(by: ChecklistSort): void;
}

const fill = (t: string, o: Record<string, string | number>) => t.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));

export function renderChecklistSummary(root: HTMLElement, host: ChecklistSummaryHost): void {
  const L = host.labels;
  const now = Date.now();
  const sel = h("select", { class: "nx-cl__in", id: `${host.uid}sort` });
  for (const [v, t] of [["due", L.sortDue], ["progress", L.sortProgress], ["title", L.sortTitle]]) sel.append(h("option", { value: v, selected: v === host.sort }, t));
  sel.value = host.sort;
  sel.addEventListener("change", () => host.resort(sel.value as ChecklistSort));
  const list = h("ul", { class: "nx-cl__items" });
  let compare: (a: string, b: string) => number;
  try {
    compare = new Intl.Collator(host.locale, { numeric: true, sensitivity: "base" }).compare;
  } catch {
    compare = (a, b) => a.localeCompare(b);
  }
  for (const it of sortChecklistItems(host.items, host.sort, compare)) {
    const due = it.done < it.total ? checklistDueText(it.due, now, host.locale, L) : null;
    const href = safeHref(it.href);
    const chip = (cls: string, t: string) => h("span", { class: `nx-cl__chip${cls && ` nx-cl__chip--${cls}`}` }, t);
    // Un espacio entre las piezas: en la cuadrícula no se ve, y el nombre del enlace no sale pegado.
    const meta = [chip("", fill(L.count, { done: it.done, total: it.total })), " "];
    if (it.overdue) meta.push(chip("late", L.overdue.split("|")[it.overdue === 1 ? 0 : 1].replace("{n}", String(it.overdue))), " ");
    if (due) meta.push(chip(due.late ? "late" : "due", due.text));
    const inner = [
      h("span", { class: "nx-cl__t" }, it.title),
      " ",
      h("span", { class: "nx-cl__m" }, ...meta),
      h("span", { class: "nx-cl__bar", "aria-hidden": "true", style: `--p:${it.total ? (it.done / it.total) * 100 : 0}%` }, h("span")),
      " ",
      it.assignee ? host.who(it.assignee) : "",
    ];
    const el = href ? h("a", { class: "nx-cl__item", href }, ...inner) : h("button", { type: "button", class: "nx-cl__item" }, ...inner);
    if (it.total && it.done >= it.total) el.dataset.s = "done";
    el.addEventListener("click", (e) => {
      if (!host.open(it)) e.preventDefault();
    });
    list.append(h("li", null, el));
  }
  root.replaceChildren(h("div", { class: "nx-cl__sort" }, h("label", { for: sel.id }, L.sort), sel), list);
  root.removeAttribute("aria-busy");
}
