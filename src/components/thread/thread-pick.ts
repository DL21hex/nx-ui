/**
 * `<nx-thread>`: la lista de sugerencias de `@` (personas) y `#` (registros), y la tarjeta de un
 * registro al pasar o enfocar su ficha. Se carga con `import()` la primera vez que alguien entra a
 * una caja de texto o señala una ficha: quien solo lee no la baja.
 *
 * La caja sigue siendo un `textbox` (ARIA no admite `combobox` en un `<textarea>`), con el patrón
 * del combobox: `aria-autocomplete="list"`, `aria-controls` y `aria-activedescendant` a la opción
 * resaltada; ↑/↓ recorren, Enter o Tab eligen, Esc cierra. El foco nunca sale de la caja.
 */
import { h, safeEndpoint } from "../../core/dom";
import { cleanPerson, cleanRef, findTrigger, threadPick, type ThreadPick, type ThreadTrigger } from "./logic";
import type { ThreadLabels, ThreadPerson, ThreadRef, ThreadUser } from "./types";

/** Lo que el hilo le presta a la lista (sus campos privados no se ven desde aquí). */
export interface ThreadPickHost {
  readonly el: HTMLElement;
  readonly uid: string;
  /** Registros conocidos: la lista los suma al elegir y la tarjeta al consultarlos. */
  readonly refs: Map<string, ThreadRef>;
  labels(): ThreadLabels;
  patterns(): readonly RegExp[];
  /** `people-source` y `refs-source`, tal como vienen (se validan aquí). */
  source(kind: "mention" | "ref"): string | null;
  avatar(u: ThreadUser): HTMLElement;
  /** Se eligió una sugerencia: el hilo guarda la mención (o referencia) del borrador. */
  picked(ta: HTMLTextAreaElement, p: ThreadPick): void;
  /** Se supo a dónde lleva un registro: su ficha puede pasar a ser enlace. */
  learned(): void;
}

/** Espera entre teclas antes de preguntarle al servidor. */
const DEBOUNCE = 150;
type Item = ThreadPerson | ThreadRef;
type Open = ThreadTrigger & { ta: HTMLTextAreaElement; items: Item[]; i: number };

/** Una lista JSON (`[...]` o `{items: [...]}`) de una fuente de sugerencias (`?q=`). */
async function fetchList(src: string, q: string, signal: AbortSignal): Promise<unknown[]> {
  const res = await fetch(`${src}${src.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}`, { headers: { Accept: "application/json" }, credentials: "same-origin", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as unknown;
  const list = Array.isArray(data) ? data : (data as { items?: unknown })?.items;
  return Array.isArray(list) ? list.slice(0, 50) : [];
}

export class ThreadPicker {
  readonly list: HTMLUListElement;
  readonly card: HTMLElement;
  #open: Open | null = null;
  #timer = 0;
  #ask?: AbortController;
  #look?: AbortController;
  #for: HTMLElement | null = null;

  constructor(readonly host: ThreadPickHost) {
    const id = host.uid;
    this.list = h("ul", { class: "nx-thread__pick", role: "listbox", id: `${id}-l`, hidden: true });
    this.card = h("div", { class: "nx-thread__card", role: "tooltip", id: `${id}-c`, hidden: true });
    host.el.append(this.card);
    // La lista no se lleva el foco de la caja.
    this.list.addEventListener("pointerdown", (e) => e.preventDefault());
    this.list.addEventListener("click", (e) => {
      const o = (e.target as Element).closest<HTMLElement>("[role=option]");
      if (o) this.#choose(Number(o.dataset.i));
    });
  }

  /** Lo que se escribe: si justo antes del cursor hay `@algo`, `#algo` o un código, se busca. */
  input(ta: HTMLTextAreaElement): void {
    const t = findTrigger(ta.value, ta.selectionStart ?? ta.value.length, this.host.patterns());
    const src = t && safeEndpoint(this.host.source(t.kind));
    if (!t || !src) return this.close();
    const old = this.#open;
    const same = old?.ta === ta && old.kind === t.kind;
    this.#open = { ...t, ta, items: same ? old.items : [], i: same ? old.i : -1 };
    clearTimeout(this.#timer);
    this.#timer = window.setTimeout(() => void this.#search(src, t), DEBOUNCE);
  }

  /** Las teclas de la lista. `true` si la tecla era suya. */
  key(e: KeyboardEvent, ta: HTMLTextAreaElement): boolean {
    const o = this.#open;
    const n = o?.ta === ta ? o.items.length : 0;
    if (!n || e.isComposing) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      o!.i = (o!.i + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      this.#paint();
    } else if ((e.key === "Enter" || e.key === "Tab") && o!.i >= 0) this.#choose(o!.i);
    else if (e.key === "Escape") {
      e.stopPropagation();
      this.close();
    } else return false;
    e.preventDefault();
    return true;
  }

  /** La caja perdió el foco (y no hacia la lista). */
  blur(ta: EventTarget | null): void {
    if (ta === this.#open?.ta) this.close();
  }

  close(): void {
    const ta = this.#open?.ta;
    clearTimeout(this.#timer);
    this.#ask?.abort();
    this.#open = null;
    this.list.hidden = true;
    ta?.removeAttribute("aria-activedescendant");
    ta?.removeAttribute("aria-controls");
  }

  async #search(src: string, t: ThreadTrigger): Promise<void> {
    this.#ask?.abort();
    const ac = (this.#ask = new AbortController());
    try {
      const raw = await fetchList(src, t.query, ac.signal);
      const o = this.#open;
      if (!o || ac !== this.#ask || o.kind !== t.kind) return;
      const clean: (v: unknown) => Item | null = t.kind === "mention" ? cleanPerson : cleanRef;
      o.items = raw
        .map(clean)
        .filter((x): x is Item => !!x)
        .slice(0, 8);
      o.i = o.items.length ? 0 : -1;
      this.#paint();
    } catch {
      if (!ac.signal.aborted) this.close();
    }
  }

  #paint(): void {
    const o = this.#open;
    const list = this.list;
    // Sin resultados, sin lista (un listbox vacío no dice nada).
    if (!o?.items.length) {
      list.hidden = true;
      o?.ta.removeAttribute("aria-activedescendant");
      return;
    }
    const L = this.host.labels();
    const oid = (i: number) => `${this.host.uid}-o${i}`;
    if (list.previousElementSibling !== o.ta) o.ta.after(list);
    list.setAttribute("aria-label", o.kind === "mention" ? L.people : L.refs);
    list.replaceChildren(
      ...o.items.map((it, i) =>
        h(
          "li",
          { role: "option", id: oid(i), "data-i": i, "aria-selected": String(i === o.i) },
          "name" in it ? this.host.avatar(it) : null,
          h("span", null, h("strong", null, "name" in it ? it.name : it.label), it.detail ? h("small", null, it.detail) : null),
        ),
      ),
    );
    list.hidden = false;
    o.ta.setAttribute("aria-controls", list.id);
    o.ta.setAttribute("aria-activedescendant", oid(o.i));
    list.children[o.i]?.scrollIntoView?.({ block: "nearest" });
  }

  #choose(i: number): void {
    const o = this.#open;
    const it = o?.items[i];
    const p = it && threadPick(o.kind, it);
    if (!o || !p) return;
    if (o.kind === "ref") this.host.refs.set(it.id, it as ThreadRef);
    const ta = o.ta;
    const caret = ta.selectionStart ?? ta.value.length;
    const head = `${ta.value.slice(0, o.start)}${p.text} `;
    ta.value = head + ta.value.slice(caret).replace(/^ /, "");
    ta.setSelectionRange(head.length, head.length);
    this.close();
    this.host.picked(ta, p);
    ta.focus();
  }

  /** La tarjeta de un registro: `label` y `detail`, sin navegar. Si no se conoce, se pregunta a `refs-source`. */
  show(a: HTMLElement): void {
    if (a === this.#for) return;
    const { refs } = this.host;
    const id = a.dataset.id!;
    const card = this.card;
    const label = a.textContent ?? "";
    const paint = () => {
      const r = refs.get(id);
      card.replaceChildren(h("strong", null, r?.label ?? label), r?.detail ? h("span", null, r.detail) : "");
    };
    this.hide();
    paint();
    const b = a.getBoundingClientRect();
    const m = this.host.el.getBoundingClientRect();
    card.style.left = `${Math.max(0, b.left - m.left)}px`;
    card.style.top = `${b.bottom - m.top + 4}px`;
    card.hidden = false;
    a.setAttribute("aria-describedby", card.id);
    this.#for = a;
    const src = !refs.has(id) && safeEndpoint(this.host.source("ref"));
    if (!src) return;
    const ac = (this.#look = new AbortController());
    fetchList(src, label, ac.signal)
      .then((list) => {
        const found = list.map(cleanRef).filter((r): r is ThreadRef => !!r);
        const r = found.find((x) => x.id === id) ?? found.find((x) => x.label === label);
        if (!r) return;
        refs.set(id, r);
        if (this.#for === a) paint();
        if (r.href && a.localName !== "a") this.host.learned();
      })
      .catch(() => {});
  }

  /** Esconde la tarjeta (de `a`, o la que esté). */
  hide(a?: EventTarget | null): void {
    if (a && a !== this.#for) return;
    this.#look?.abort();
    this.#for?.removeAttribute("aria-describedby");
    this.#for = null;
    this.card.hidden = true;
  }

  stop(): void {
    this.close();
    this.hide();
  }
}
