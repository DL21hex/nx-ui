/**
 * `<nx-inbox>`: la bandeja de aprobaciones que se trabaja con el teclado. J/K (o las flechas) para
 * moverse, A para aprobar, R para rechazar con un motivo, X para seleccionar varios y decidirlos
 * de una vez. Al decidir, el ítem sale y el siguiente queda listo: cuarenta aprobaciones son
 * cuarenta teclas, no cuarenta diálogos.
 *
 * Cada ítem muestra su impacto antes de aprobarlo (el mismo protocolo de `nxConfirm`), y el backend
 * puede bloquearlo con un motivo. Nada pregunta «¿está seguro?»: la decisión se aplica al instante
 * y se puede deshacer mientras corre el tiempo (con el botón del aviso o Ctrl+Z). La app registra
 * en el backend cuando llega `nx-inbox-commit`.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { formatElapsed } from "../../core/format";
import { glyph, hasIcon, icon, initials } from "../../core/icons";
import { parseImpactEvent } from "../../core/impact";
import { nxFormat, resolveLocale } from "../../core/locale";
import { lineData, readLines } from "../../core/stream";
import { nxToast } from "../toast/toast";
import "../toast/index";
import type { ImpactItem } from "../dialog/types";
import { applyImpact, cleanInboxItems, decisionMessage, emptyImpact, nextActive, rangeIds } from "./logic";
import type { InboxDecision, InboxImpact, InboxItem, InboxLabels, InboxOutcome } from "./types";

export const INBOX_LABELS: InboxLabels = {
  heading: "Pendientes",
  approve: "Aprobar",
  reject: "Rechazar",
  reason: "Motivo del rechazo",
  sendReject: "Rechazar",
  cancel: "Cancelar",
  approvedOne: "Aprobado: {title}",
  approvedMany: "{n} aprobados",
  rejectedOne: "Rechazado: {title}",
  rejectedMany: "{n} rechazados",
  skippedOne: "· 1 bloqueado no se aprobó",
  skipped: "· {n} bloqueados no se aprobaron",
  blocked: "Bloqueado",
  impact: "Si se aprueba:",
  loading: "Calculando el impacto…",
  error: "No se pudo calcular el impacto",
  open: "Abrir el documento",
  requester: "Solicita",
  date: "Fecha",
  selectedOne: "1 seleccionado",
  selected: "{n} seleccionados",
  empty: "Todo al día",
  stats: "Decidiste {n} en {time}",
  reasonRequired: "Escribe el motivo",
  keyMove: "moverse",
  keySelect: "seleccionar",
  keyApprove: "aprobar",
  keyReject: "rechazar",
  keyUndo: "deshacer",
};

const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const DONE = '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>';
const LOCK = '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const PROPS = ["items", "labels", "undo", "requireReason", "heading"] as const;
/** Espera antes de pedir el impacto del ítem activo: moverse rápido no dispara una petición por tecla. */
const IMPACT_DELAY = 150;

let uid = 0;
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export class NxInbox extends Base {
  static observedAttributes = ["items", "labels", "heading", "locale"];

  #uid = `nx-inbox${++uid}`;
  #items: InboxItem[] = [];
  #labels: InboxLabels = INBOX_LABELS;
  /** Decididos que esperan su tiempo de deshacer: no se ven, pero aún no se registraron. */
  #hidden = new Set<string>();
  #selected = new Set<string>();
  #active: string | null = null;
  #anchor: string | null = null;
  #impacts = new Map<string, InboxImpact>();
  #impactTimer = 0;
  #aborts = new Set<AbortController>();
  #rejecting = false;
  #decided = 0;
  #since = 0;
  #built = false;
  // Nodos.
  #count?: HTMLElement;
  #bulk?: HTMLElement;
  #list?: HTMLDivElement;
  #detail?: HTMLElement;
  #keys?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  get items(): InboxItem[] {
    return this.#items;
  }
  set items(v: InboxItem[] | null | undefined) {
    this.#items = cleanInboxItems(v);
    const ids = new Set(this.#items.map((i) => i.id));
    for (const id of this.#selected) if (!ids.has(id)) this.#selected.delete(id);
    const vis = this.#visible().map((i) => i.id);
    if (!this.#active || !vis.includes(this.#active)) this.#active = vis[0] ?? null;
    this.#renderList();
    this.#renderDetail();
  }
  /** Lo que se ve: los ítems menos los decididos que esperan su tiempo de deshacer. */
  get pending(): InboxItem[] {
    return this.#visible();
  }
  get selected(): string[] {
    return [...this.#selected];
  }
  set selected(v: string[] | null | undefined) {
    this.#selected = new Set((Array.isArray(v) ? v : []).map(String).filter((id) => this.#visible().some((i) => i.id === id)));
    this.#paintState();
  }
  get active(): string | null {
    return this.#active;
  }
  set active(v: string | null) {
    if (v !== null && !this.#visible().some((i) => i.id === v)) return;
    this.#setActive(v, false);
  }
  /** Milisegundos para deshacer una decisión (7000). `0`: se registra al instante, sin aviso. */
  get undo(): number {
    const n = Number(this.getAttribute("undo"));
    return this.hasAttribute("undo") && Number.isFinite(n) && n >= 0 ? n : 7000;
  }
  set undo(v: number) {
    this.setAttribute("undo", String(v));
  }
  /** Rechazar exige un motivo. */
  get requireReason(): boolean {
    return boolAttr(this, "require-reason");
  }
  set requireReason(v: boolean) {
    this.toggleAttribute("require-reason", !!v);
  }
  get heading(): string {
    return this.getAttribute("heading") ?? this.#labels.heading;
  }
  set heading(v: string) {
    this.setAttribute("heading", v);
  }
  get labels(): InboxLabels {
    return this.#labels;
  }
  set labels(v: Partial<InboxLabels> | null | undefined) {
    this.#labels = { ...INBOX_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#paint();
  }

  /**
   * Decide `ids` (por defecto, los seleccionados o el activo). Aprobar se salta lo que el backend
   * bloqueó. La promesa dice cómo terminó: `commit` (se registró), `undo` o `cancel`.
   */
  async decide(decision: InboxDecision, ids?: string[], reason?: string): Promise<InboxOutcome> {
    const vis = this.#visible();
    const want = ids ?? (this.#selected.size ? [...this.#selected] : this.#active ? [this.#active] : []);
    let items = vis.filter((i) => want.includes(i.id));
    const skipped = decision === "approve" ? items.filter((i) => this.#impacts.get(i.id)?.block).length : 0;
    if (decision === "approve") items = items.filter((i) => !this.#impacts.get(i.id)?.block);
    if (!items.length) {
      if (skipped) this.#nudge();
      return "cancel";
    }
    const detail = { decision, ids: items.map((i) => i.id), items, ...(reason ? { reason } : {}) };
    if (!this.dispatchEvent(new CustomEvent("nx-inbox-decide", { detail, bubbles: true, composed: true, cancelable: true }))) return "cancel";

    const gone = new Set(detail.ids);
    const next = nextActive(vis.map((i) => i.id), gone, this.#active);
    for (const id of gone) {
      this.#hidden.add(id);
      this.#selected.delete(id);
    }
    this.#active = next;
    this.#rejecting = false;
    if (!this.#since) this.#since = performance.now();
    this.#decided += items.length;
    this.#renderList();
    this.#renderDetail();
    this.#focusList();

    const result = this.undo ? await nxToast({ message: decisionMessage(this.#labels, decision, items, skipped), undo: true, duration: this.undo, tone: decision === "approve" ? "success" : "neutral" }) : "timeout";
    for (const id of gone) this.#hidden.delete(id);
    if (result === "undo") {
      this.#decided -= items.length;
      this.#active = detail.ids[0];
      this.#renderList();
      this.#renderDetail();
      this.dispatchEvent(new CustomEvent("nx-inbox-undo", { detail, bubbles: true, composed: true }));
      return "undo";
    }
    this.#items = this.#items.filter((i) => !gone.has(i.id));
    for (const id of gone) this.#impacts.delete(id);
    this.#renderList();
    this.dispatchEvent(new CustomEvent("nx-inbox-commit", { detail, bubbles: true, composed: true }));
    return "commit";
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    for (const p of PROPS) {
      if (Object.prototype.hasOwnProperty.call(this, p)) {
        const self = this as unknown as Record<string, unknown>;
        const v = self[p];
        delete self[p];
        self[p] = v;
      }
    }
    if (!this.#built) this.#build();
    this.#paint();
  }

  disconnectedCallback(): void {
    clearTimeout(this.#impactTimer);
    for (const c of this.#aborts) c.abort();
    this.#aborts.clear();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "items" || name === "labels") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-inbox] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #visible(): InboxItem[] {
    return this.#items.filter((i) => !this.#hidden.has(i.id));
  }
  #item(id: string | null): InboxItem | undefined {
    return id ? this.#items.find((i) => i.id === id) : undefined;
  }

  #build(): void {
    this.#built = true;
    this.#count = h("h2", { class: "nx-inbox__title", id: `${this.#uid}-h` });
    this.#bulk = h(
      "div",
      { class: "nx-inbox__bulk", hidden: true },
      h("span", { class: "nx-inbox__nsel" }),
      h("button", { type: "button", class: "nx-inbox__btn", "data-act": "reject" }),
      h("button", { type: "button", class: "nx-inbox__btn nx-inbox__btn--primary", "data-act": "approve" }),
      h("button", { type: "button", class: "nx-inbox__x", "data-act": "clear" }, glyph(X)),
    );
    this.#list = h("div", { class: "nx-inbox__list", role: "listbox", tabindex: "0", "aria-multiselectable": "true", "aria-labelledby": `${this.#uid}-h` });
    this.#detail = h("section", { class: "nx-inbox__detail", "aria-live": "polite" });
    this.#keys = h("footer", { class: "nx-inbox__keys", "aria-hidden": "true" });
    this.append(h("div", { class: "nx-inbox__main" }, h("header", { class: "nx-inbox__bar" }, this.#count, this.#bulk), this.#list), this.#detail, this.#keys);

    this.addEventListener("keydown", (e) => this.#key(e));
    this.#list.addEventListener("click", (e) => {
      const row = (e.target as Element).closest<HTMLElement>("[data-id]");
      if (!row) return;
      const id = row.dataset.id!;
      if ((e as MouseEvent).shiftKey && this.#anchor) this.#selectRange(id);
      else if ((e.target as Element).closest(".nx-inbox__check") || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) this.#toggle(id);
      this.#setActive(id, false);
    });
    this.addEventListener("click", (e) => {
      const act = (e.target as Element).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "approve") void this.decide("approve");
      else if (act === "reject") this.#startReject();
      else if (act === "clear") this.selected = [];
      else if (act === "cancel") this.#cancelReject();
    });
    this.addEventListener("submit", (e) => {
      if (!(e.target as Element).closest(".nx-inbox__reason")) return;
      e.preventDefault();
      this.#sendReject();
    });
  }

  #key(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey) return;
    const k = e.key;
    if (typing(e.target)) {
      // En el motivo: Enter rechaza (Mayús + Enter, otra línea) y Escape vuelve.
      if (!(e.target as Element).closest(".nx-inbox__reason")) return;
      if (k === "Escape") {
        e.preventDefault();
        this.#cancelReject();
      } else if (k === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.#sendReject();
      }
      return;
    }
    // Enter y Espacio sobre un botón o un enlace hacen lo suyo.
    if ((k === "Enter" || k === " ") && (e.target as Element).closest("button, a")) return;
    const mod = e.ctrlKey || e.metaKey;
    const ids = this.#visible().map((i) => i.id);
    const at = this.#active ? ids.indexOf(this.#active) : -1;
    const move = (to: number) => {
      if (!ids.length) return;
      const id = ids[Math.max(0, Math.min(ids.length - 1, to))];
      if (e.shiftKey) {
        // Mayús + mover: extiende la selección desde donde se estaba.
        if (this.#active) this.#selected.add(this.#active);
        this.#selected.add(id);
      }
      this.#setActive(id, true);
    };
    let handled = true;
    if (mod) {
      if (k.toLowerCase() === "a") this.selected = ids;
      else handled = false;
    } else if (k === "j" || k === "J" || k === "ArrowDown") move(at + 1);
    else if (k === "k" || k === "K" || k === "ArrowUp") move(at < 0 ? 0 : at - 1);
    else if (k === "Home") move(0);
    else if (k === "End") move(ids.length - 1);
    else if ((k === "x" || k === " ") && this.#active) this.#toggle(this.#active);
    else if (k === "a" || k === "A") void this.decide("approve");
    else if (k === "r" || k === "R") this.#startReject();
    else if (k === "Enter") this.#openDoc();
    else if (k === "Escape" && this.#selected.size) this.selected = [];
    else handled = false;
    if (handled) e.preventDefault();
  }

  #toggle(id: string): void {
    if (this.#selected.has(id)) this.#selected.delete(id);
    else this.#selected.add(id);
    this.#anchor = id;
    this.#paintState();
  }

  #selectRange(to: string): void {
    for (const id of rangeIds(this.#visible().map((i) => i.id), this.#anchor!, to)) this.#selected.add(id);
    this.#paintState();
  }

  #setActive(id: string | null, scroll: boolean): void {
    const changed = id !== this.#active;
    this.#active = id;
    if (!id) this.#anchor = null;
    else if (!this.#selected.size) this.#anchor = id;
    if (changed) this.#rejecting = false;
    this.#paintState();
    if (scroll && id) this.#list!.querySelector(`[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    if (changed) {
      this.#renderDetail();
      const item = this.#item(id);
      if (item) this.dispatchEvent(new CustomEvent("nx-inbox-active", { detail: { id, item }, bubbles: true, composed: true }));
    }
  }

  #focusList(): void {
    if (this.contains(document.activeElement) || document.activeElement === document.body) this.#list!.focus({ preventScroll: true });
  }

  /** «No se puede»: un pequeño rebote del detalle (un ítem bloqueado). */
  #nudge(): void {
    const d = this.#detail!;
    d.classList.remove("is-nudge");
    void d.offsetWidth;
    d.classList.add("is-nudge");
  }

  #openDoc(): void {
    const item = this.#item(this.#active);
    if (!item) return;
    if (!this.dispatchEvent(new CustomEvent("nx-inbox-open", { detail: { id: item.id, item }, bubbles: true, composed: true, cancelable: true }))) return;
    this.#detail!.querySelector<HTMLAnchorElement>(".nx-inbox__open")?.click();
  }

  // ---------------------------------------------------------------- rechazar con motivo

  #startReject(): void {
    if (!this.#active && !this.#selected.size) return;
    this.#rejecting = true;
    this.#renderDetail();
    this.#detail!.querySelector("textarea")?.focus();
  }
  #cancelReject(): void {
    this.#rejecting = false;
    this.#renderDetail();
    this.#list!.focus({ preventScroll: true });
  }
  #sendReject(): void {
    const ta = this.#detail!.querySelector("textarea");
    const reason = ta?.value.trim() ?? "";
    if (this.requireReason && !reason) {
      ta?.setAttribute("aria-invalid", "true");
      ta?.focus();
      this.#nudge();
      return;
    }
    this.#list!.focus({ preventScroll: true });
    void this.decide("reject", undefined, reason || undefined);
  }

  // ---------------------------------------------------------------- impacto

  /** El impacto del ítem: el de la lista, el ya traído, o se pide (con una pequeña espera). */
  #impact(item: InboxItem): InboxImpact | null {
    if (!item.impact) return null;
    let s = this.#impacts.get(item.id);
    if (s) return s;
    if (Array.isArray(item.impact)) {
      s = { ...emptyImpact(), items: item.impact as ImpactItem[], done: true };
      this.#impacts.set(item.id, s);
      return s;
    }
    clearTimeout(this.#impactTimer);
    const url = safeHref(item.impact);
    this.#impactTimer = window.setTimeout(() => url && this.#active === item.id && void this.#fetchImpact(item, url), IMPACT_DELAY);
    return emptyImpact();
  }

  async #fetchImpact(item: InboxItem, url: string): Promise<void> {
    if (this.#impacts.has(item.id)) return;
    const s = emptyImpact();
    this.#impacts.set(item.id, s);
    const ctrl = new AbortController();
    this.#aborts.add(ctrl);
    const repaint = () => {
      if (this.#active === item.id) this.#renderDetail();
      this.#paintState();
    };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson, text/event-stream" },
        credentials: "same-origin",
        body: JSON.stringify({ id: item.id, data: item.data ?? null }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readLines(res, (line) => {
        const ev = parseImpactEvent(lineData(line));
        if (!ev) return;
        applyImpact(s, ev);
        repaint();
      });
      s.done = true;
    } catch {
      if (ctrl.signal.aborted) return void this.#impacts.delete(item.id);
      s.error = this.#labels.error;
      s.done = true;
    } finally {
      this.#aborts.delete(ctrl);
    }
    repaint();
  }

  // ---------------------------------------------------------------- pintado

  #renderList(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const f = nxFormat(resolveLocale(this));
    const vis = this.#visible();
    this.#count!.replaceChildren(this.heading, " ", h("span", { class: "nx-inbox__n" }, String(vis.length)));
    this.#list!.replaceChildren(
      ...vis.map((it) =>
        h(
          "div",
          { id: `${this.#uid}-${it.id}`, class: "nx-inbox__item", role: "option", "data-id": it.id, "aria-selected": "false" },
          h("span", { class: "nx-inbox__check", "aria-hidden": "true" }, glyph(CHECK)),
          it.requester ? h("span", { class: "nx-inbox__avatar", "aria-hidden": "true", title: it.requester }, initials(it.requester)) : null,
          h(
            "span",
            { class: "nx-inbox__text" },
            h("span", { class: "nx-inbox__item-title" }, it.title),
            it.subtitle || it.requester ? h("span", { class: "nx-inbox__sub" }, [it.subtitle, it.requester].filter(Boolean).join(" · ")) : null,
            it.tags?.length ? h("span", { class: "nx-inbox__tags" }, ...it.tags.map((t) => (typeof t === "string" ? h("span", { class: "nx-inbox__tag" }, t) : h("span", { class: "nx-inbox__tag", "data-tone": t.tone ?? "neutral" }, t.label)))) : null,
          ),
          h(
            "span",
            { class: "nx-inbox__meta" },
            it.amount !== undefined ? h("span", { class: "nx-inbox__amount" }, f.money(it.amount, { currency: it.currency })) : null,
            it.date ? h("span", { class: "nx-inbox__date" }, f.date(it.date)) : null,
            h("span", { class: "nx-inbox__lock", title: L.blocked, hidden: true }, glyph(LOCK)),
          ),
        ),
      ),
    );
    if (!vis.length) {
      const stats = this.#decided ? L.stats.replace("{n}", String(this.#decided)).replace("{time}", formatElapsed(performance.now() - this.#since, f.locale)) : "";
      this.#list!.append(h("div", { class: "nx-inbox__empty" }, glyph(DONE), h("strong", null, L.empty), stats ? h("span", null, stats) : null));
    }
    this.toggleAttribute("data-empty", !vis.length);
    this.#paintState();
  }

  /** Activo, seleccionados, bloqueados y la barra de selección, sin volver a crear las filas. */
  #paintState(): void {
    if (!this.#built) return;
    const L = this.#labels;
    for (const row of this.#list!.querySelectorAll<HTMLElement>("[data-id]")) {
      const id = row.dataset.id!;
      row.setAttribute("aria-selected", String(this.#selected.has(id)));
      row.toggleAttribute("data-active", id === this.#active);
      row.querySelector<HTMLElement>(".nx-inbox__lock")!.hidden = !this.#impacts.get(id)?.block;
    }
    const active = this.#active ? this.#list!.querySelector(`[data-id="${CSS.escape(this.#active)}"]`) : null;
    if (active) this.#list!.setAttribute("aria-activedescendant", active.id);
    else this.#list!.removeAttribute("aria-activedescendant");
    const n = this.#selected.size;
    this.#bulk!.hidden = !n;
    const [count, rej, app] = this.#bulk!.children;
    count.textContent = n === 1 ? L.selectedOne : L.selected.replace("{n}", String(n));
    rej.textContent = `${L.reject} (${n})`;
    app.textContent = `${L.approve} (${n})`;
  }

  #renderDetail(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const it = this.#item(this.#active);
    const d = this.#detail!;
    d.classList.remove("is-nudge");
    if (!it || this.#hidden.has(it.id)) return void d.replaceChildren();
    const f = nxFormat(resolveLocale(this));
    const imp = this.#impact(it);
    const many = this.#selected.size > 1;
    const href = safeHref(it.href);
    const item = (x: ImpactItem) =>
      h(
        "li",
        { class: "nx-inbox__impact-item", "data-tone": x.tone ?? "neutral" },
        x.icon && hasIcon(x.icon) ? icon(x.icon) : h("span", { class: "nx-inbox__dot", "aria-hidden": "true" }),
        h("span", null, x.label),
        x.detail ? h("span", { class: "nx-inbox__impact-detail" }, x.detail) : null,
      );
    const impact = imp
      ? h(
          "div",
          { class: "nx-inbox__impact", "aria-busy": String(!imp.done) },
          h("p", { class: "nx-inbox__h" }, L.impact),
          h("ul", null, ...imp.items.map(item)),
          !imp.done ? h("p", { class: "nx-inbox__muted is-loading" }, L.loading) : null,
          imp.block ? h("p", { class: "nx-inbox__block", role: "alert" }, glyph(LOCK), imp.block) : null,
          ...imp.notes.map((n) => h("p", { class: "nx-inbox__muted" }, n)),
          imp.error ? h("p", { class: "nx-inbox__muted" }, imp.error) : null,
        )
      : null;
    const kbd = (k: string) => h("kbd", null, k);
    const reject = this.#rejecting
      ? h(
          "form",
          { class: "nx-inbox__reason" },
          h("label", null, L.reason, h("textarea", { rows: "2", required: this.requireReason || null, placeholder: this.requireReason ? L.reasonRequired : null })),
          h("div", { class: "nx-inbox__actions" }, h("button", { type: "button", class: "nx-inbox__btn", "data-act": "cancel" }, L.cancel, kbd("Esc")), h("button", { type: "submit", class: "nx-inbox__btn nx-inbox__btn--danger" }, many ? `${L.sendReject} (${this.#selected.size})` : L.sendReject, kbd("↵"))),
        )
      : h(
          "div",
          { class: "nx-inbox__actions" },
          h("button", { type: "button", class: "nx-inbox__btn", "data-act": "reject" }, L.reject, kbd("R")),
          h("button", { type: "button", class: "nx-inbox__btn nx-inbox__btn--primary", "data-act": "approve", disabled: (!many && !!imp?.block) || null }, L.approve, kbd("A")),
        );
    const parts: (HTMLElement | null)[] = [
      h("h3", { class: "nx-inbox__d-title" }, it.title),
      it.subtitle ? h("p", { class: "nx-inbox__muted" }, it.subtitle) : null,
      it.amount !== undefined ? h("p", { class: "nx-inbox__d-amount" }, f.money(it.amount, { currency: it.currency })) : null,
      it.requester || it.date || it.facts?.length
        ? h(
            "dl",
            { class: "nx-inbox__facts" },
            ...[...(it.requester ? [{ label: L.requester, value: it.requester }] : []), ...(it.date ? [{ label: L.date, value: f.date(it.date) }] : []), ...(it.facts ?? [])].flatMap((x) => [h("dt", null, x.label), h("dd", null, x.value)]),
          )
        : null,
      impact,
      href ? h("a", { class: "nx-inbox__open", href }, L.open, " →") : null,
      reject,
    ];
    d.replaceChildren(...parts.filter((n): n is HTMLElement => n !== null));
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const k = (key: string, text: string) => h("span", null, h("kbd", null, key), ` ${text}`);
    this.#keys!.replaceChildren(k("J K", L.keyMove), k("X", L.keySelect), k("A", L.keyApprove), k("R", L.keyReject), k("Ctrl Z", L.keyUndo));
    this.#bulk!.querySelector(".nx-inbox__x")!.setAttribute("aria-label", L.cancel);
    this.#renderList();
    this.#renderDetail();
  }
}
