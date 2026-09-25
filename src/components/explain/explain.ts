/**
 * `<nx-explain>`: «¿de dónde sale este número?». Envuelve una cifra; al pulsarla se abre su
 * desglose, que el backend transmite: la fórmula término a término, la comparación con otro
 * período, las fuentes con enlace y una explicación breve. Cada término con `explain` se abre en su
 * propio desglose, y así hasta el documento de origen.
 *
 * Comprueba lo que muestra: si los términos no suman la cifra, lo dice. Una cifra que se puede
 * auditar con un clic es una cifra en la que se confía.
 *
 *   <nx-explain endpoint="/explicar/total?factura=10482">$ 10.829.000</nx-explain>
 *
 * El contenido del autor (la cifra) no se toca: el componente solo le agrega una marca, que el CSS
 * pone al final.
 * La tarjeta es un popover (capa superior) que se crea al abrirse la primera vez.
 */
import { Base } from "../../core/define";
import { h, safeEndpoint, safeHref } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { glyph } from "../../core/icons";
import { nxFormat, resolveLocale } from "../../core/locale";
import { lineData, readLines } from "../../core/stream";
import { isExternal, parseBlocks, type Inline } from "../ai/logic";
import { applyEvent, balance, change, changeTone, emptyState, parseExplainEvent, toEvent } from "./logic";
import type { ExplainEvent, ExplainLabels, ExplainNumber, ExplainState, ExplainTerm } from "./types";

export const EXPLAIN_LABELS: ExplainLabels = {
  trigger: "Ver de dónde sale",
  dialog: "De dónde sale la cifra",
  loading: "Desglosando…",
  error: "No se pudo desglosar la cifra",
  back: "Volver",
  sources: "Fuentes",
  balanced: "Cuadra",
  unbalanced: "Los términos suman {sum}, no {total}",
  versus: "vs. {label}",
  drill: "Ver el desglose de {label}",
  close: "Cerrar",
};

const MARK = '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const WARN = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const BACK = '<path d="m15 18-6-6 6-6"/>';
const X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const OP_SIGN: Record<string, string> = { "+": "+", "-": "−", "×": "×", "÷": "÷", "=": "=" };
const PROPS = ["endpoint", "method", "explanation", "context", "labels"] as const;

type Level = { title: string; url?: string; state: ExplainState; ctrl?: AbortController };

let uid = 0;

export class NxExplain extends Base {
  static observedAttributes = ["endpoint", "labels", "explanation"];

  #uid = `nx-explain${++uid}`;
  #labels: ExplainLabels = EXPLAIN_LABELS;
  #explanation: ExplainEvent[] | null = null;
  #context: unknown = undefined;
  #built = false;
  #open = false;
  #levels: Level[] = [];
  /** Los desgloses ya traídos (por URL), para ir y volver sin pedirlos otra vez. */
  #cache = new Map<string, ExplainState>();
  #queued = false;
  #track?: () => void;
  #card?: HTMLDivElement;
  /** Las secciones pintadas de la tarjeta, con la firma de lo que muestran: solo se rehace la que
   *  cambió (en el streaming, casi siempre el texto). El spinner no se recrea en cada trozo. */
  #slots = new Map<string, { sig: string; el: HTMLElement | null }>();
  #mark?: HTMLSpanElement;

  // ---------------------------------------------------------------- propiedades

  /** URL del desglose: `GET` (o `POST` con `{context}`), responde con eventos en streaming. */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    this.#attr("endpoint", v);
  }
  get method(): "GET" | "POST" {
    return this.getAttribute("method")?.toUpperCase() === "POST" ? "POST" : "GET";
  }
  set method(v: "GET" | "POST") {
    this.#attr("method", v);
  }
  /** El desglose ya armado (los mismos eventos, sin pedir nada al servidor). */
  get explanation(): ExplainEvent[] | null {
    return this.#explanation;
  }
  set explanation(v: ExplainEvent[] | null | undefined) {
    this.#explanation = Array.isArray(v) ? v.map((o) => (o && typeof o === "object" ? toEvent(o as unknown as Record<string, unknown>) : null)).filter((e): e is ExplainEvent => !!e) : null;
    this.#cache.clear();
    if (this.#open) this.#start();
  }
  /** Contexto que viaja en el `POST`. */
  get context(): unknown {
    return this.#context;
  }
  set context(v: unknown) {
    this.#context = v;
  }
  get labels(): ExplainLabels {
    return this.#labels;
  }
  set labels(v: Partial<ExplainLabels> | null | undefined) {
    this.#labels = mergeLabels(EXPLAIN_LABELS, v);
    this.#slots.clear();
    this.#paint();
  }
  get open(): boolean {
    return this.#open;
  }
  /** El desglose que se ve (para pruebas y para la app). */
  get state(): ExplainState | null {
    return this.#levels[this.#levels.length - 1]?.state ?? null;
  }

  show(): void {
    if (this.#open) return;
    const card = this.#ensureCard();
    card.showPopover?.();
    // En el acto (no al llegar `toggle`, que es asíncrono), para que Escape y Tab ya sean suyos.
    if (this.#open) card.focus({ preventScroll: true });
  }
  hide(): void {
    if (this.#open) this.#card?.hidePopover?.();
  }
  /** Olvida lo traído: la próxima vez se vuelve a pedir. */
  refresh(): void {
    this.#cache.clear();
    if (this.#open) this.#start();
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
    this.#track?.();
    for (const l of this.#levels) l.ctrl?.abort();
    this.#card?.remove();
    this.#card = undefined;
    this.#slots.clear();
    this.#open = false;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "labels" || name === "explanation") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-explain] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "endpoint") this.#cache.clear();
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #build(): void {
    this.#built = true;
    this.setAttribute("role", "button");
    this.setAttribute("aria-haspopup", "dialog");
    this.setAttribute("aria-expanded", "false");
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    this.#mark = glyph(MARK, "nx-explain__mark");
    this.append(this.#mark);
    // Con la tarjeta abierta, presionar la cifra ya la cierra (clic fuera): ese clic no la reabre.
    let wasOpen = false;
    this.addEventListener("pointerdown", () => (wasOpen = this.#open));
    this.addEventListener("click", () => {
      if (this.#open) this.hide();
      else if (!wasOpen) this.show();
      wasOpen = false;
    });
    this.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      if (this.#open) this.hide();
      else this.show();
    });
  }

  #ensureCard(): HTMLDivElement {
    if (this.#card) return this.#card;
    // Vive en <body>: lleva el idioma de la cifra, no el de la página.
    const card = h("div", { id: `${this.#uid}-card`, class: "nx-explain-card", popover: "auto", role: "dialog", tabindex: "-1", "aria-label": this.#labels.dialog, lang: resolveLocale(this), autofocus: true });
    this.#card = card;
    this.setAttribute("aria-controls", card.id);
    document.body.append(card);
    card.addEventListener("beforetoggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      if (open === this.#open) return;
      this.#open = open;
      this.setAttribute("aria-expanded", String(open));
      if (open) {
        this.#start();
        this.#startTracking();
      } else {
        this.#track?.();
        for (const l of this.#levels) l.ctrl?.abort();
      }
      this.dispatchEvent(new CustomEvent("nx-open-change", { detail: { open }, bubbles: true, composed: true }));
    });
    card.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState === "open") {
        this.#place();
        card.focus({ preventScroll: true });
      } else if (!this.#open) {
        const a = document.activeElement;
        if (!a || a === document.body || card.contains(a)) this.focus({ preventScroll: true });
      }
    });
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      // Escape primero vuelve al nivel anterior; en el primero, cierra.
      e.preventDefault();
      e.stopPropagation();
      if (this.#levels.length > 1) this.#back();
      else this.hide();
    });
    card.addEventListener("click", (e) => {
      const t = e.target as Element;
      if (t.closest(".nx-explain__close")) return this.hide();
      if (t.closest(".nx-explain__back")) return this.#back();
      const drill = t.closest<HTMLElement>("[data-drill]");
      if (drill) {
        const term = this.state?.terms[Number(drill.dataset.drill)];
        if (term?.explain) this.#drill(term);
      }
    });
    // Pasar por un término o una cita ilumina su fuente.
    const light = (e: Event, on: boolean) => {
      const id = (e.target as Element).closest<HTMLElement>("[data-cite]")?.dataset.cite;
      for (const el of card.querySelectorAll<HTMLElement>(".nx-explain__source")) el.classList.toggle("is-lit", on && el.dataset.cite === id);
    };
    card.addEventListener("pointerover", (e) => light(e, true));
    card.addEventListener("pointerout", (e) => light(e, false));
    card.addEventListener("focusin", (e) => light(e, true));
    card.addEventListener("focusout", (e) => light(e, false));
    return card;
  }

  /** El primer nivel: el desglose en línea (`explanation`) o el del `endpoint`. */
  #start(): void {
    for (const l of this.#levels) l.ctrl?.abort();
    const title = this.textContent?.trim() ?? "";
    if (this.#explanation) {
      const state = emptyState();
      for (const ev of this.#explanation) applyEvent(state, ev);
      state.done = true;
      this.#levels = [{ title, state }];
      this.#render();
      return;
    }
    this.#levels = [];
    this.#push(title, this.endpoint ?? undefined);
  }

  #drill(term: ExplainTerm): void {
    this.#levels[this.#levels.length - 1].ctrl?.abort();
    this.#push(term.label, term.explain);
    this.#card?.focus({ preventScroll: true });
  }

  #back(): void {
    const gone = this.#levels.pop();
    gone?.ctrl?.abort();
    if (!this.#levels.length) return this.hide();
    const top = this.#levels[this.#levels.length - 1];
    // Si el nivel al que se vuelve no alcanzó a terminar, se pide otra vez.
    if (!top.state.done && top.url) {
      this.#levels.pop();
      this.#push(top.title, top.url);
    } else this.#render();
    this.#card?.focus({ preventScroll: true });
  }

  /** Agrega un nivel y lo llena: de la caché, o transmitido desde `url`. */
  #push(title: string, url: string | undefined): void {
    const cached = url ? this.#cache.get(url) : undefined;
    const level: Level = { title, url, state: cached ?? emptyState() };
    this.#levels.push(level);
    this.#render();
    if (cached) return;
    // El desglose de un término (`explain`) viene en la respuesta: solo del mismo origen (o de uno
    // permitido con `allowOrigins`), para que el contexto de la app no viaje a otro sitio.
    const safe = safeEndpoint(url);
    if (!safe) {
      level.state.error = this.#labels.error;
      level.state.done = true;
      return this.#render();
    }
    const ctrl = (level.ctrl = new AbortController());
    void (async () => {
      try {
        const post = this.method === "POST";
        const res = await fetch(safe, {
          method: post ? "POST" : "GET",
          headers: { Accept: "application/x-ndjson, text/event-stream", ...(post ? { "Content-Type": "application/json" } : {}) },
          credentials: "same-origin",
          body: post ? JSON.stringify({ context: this.#context ?? null }) : undefined,
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await readLines(res, (line) => {
          if (ctrl.signal.aborted) return false;
          const ev = parseExplainEvent(lineData(line));
          if (!ev) return;
          applyEvent(level.state, ev);
          this.#schedule();
          // `done` o `error`: el desglose terminó; se suelta la conexión aunque siga abierta.
          return !level.state.done;
        });
        if (ctrl.signal.aborted) return;
        level.state.done = true;
        if (!level.state.error) this.#cache.set(url!, level.state);
      } catch {
        if (ctrl.signal.aborted) return;
        level.state.error = level.state.error || this.#labels.error;
        level.state.done = true;
      }
      this.#render();
    })();
  }

  /** Varios eventos seguidos (un mismo trozo de la respuesta) se pintan una sola vez. */
  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      this.#render();
    });
  }

  // ---------------------------------------------------------------- pintado

  #fmt(n: ExplainNumber, base?: ExplainNumber | null): string {
    if (typeof n.value === "string") return n.value;
    const f = nxFormat(resolveLocale(this));
    const currency = n.currency ?? base?.currency;
    const format = n.format ?? base?.format ?? (currency ? "money" : "number");
    if (format === "percent") return `${f.number(Math.round(n.value * 10000) / 100)} %`;
    if (format === "money") return f.money(n.value, { currency });
    return f.number(n.value);
  }

  #render(): void {
    const card = this.#card;
    const level = this.#levels[this.#levels.length - 1];
    if (!card || !level) return;
    const L = this.#labels;
    const s = level.state;
    const head = s.head;
    const f = nxFormat(resolveLocale(this));
    const cites = s.sources.map((x) => x.id);
    const cite = (id: string | undefined) => {
      const n = id ? cites.indexOf(id) : -1;
      return n >= 0 ? h("sup", { class: "nx-explain__cite", "data-cite": id }, String(n + 1)) : null;
    };
    const parent = this.#levels[this.#levels.length - 2];
    const depth = this.#levels.length;
    const j = (v: unknown) => JSON.stringify(v);
    const rel = (href: string) => (isExternal(href) ? "noopener noreferrer" : null);

    // Cada sección: su firma (lo que muestra) y cómo pintarla. Solo se rehace si la firma cambió.
    const sections: [string, string, () => HTMLElement | null][] = [
      [
        "nav",
        j([depth, parent ? (parent.state.head?.label ?? parent.title) : null, head?.label ?? level.title, L.close]),
        () =>
          h(
            "div",
            { class: "nx-explain__nav" },
            parent ? h("button", { type: "button", class: "nx-explain__back", "data-fk": "back" }, glyph(BACK), parent.state.head?.label ?? parent.title) : h("span", { class: "nx-explain__label" }, head?.label ?? level.title),
            h("button", { type: "button", class: "nx-explain__close", "aria-label": L.close, "data-fk": "close" }, glyph(X)),
          ),
      ],
      [
        "header",
        j([depth, !!parent, head, s.compare, level.title, f.locale, L.versus]),
        () => {
          const numeric = typeof head?.value === "number" ? head.value : null;
          const changes = s.compare.map((c) => {
            const d = numeric === null ? null : change(numeric, c.value);
            const vs = L.versus.replace("{label}", c.label);
            if (d === null) return h("span", { class: "nx-explain__delta" }, `${vs} · ${this.#fmt({ value: c.value }, head)}`);
            const pct = f.number(Math.round(Math.abs(d) * 1000) / 10);
            return h("span", { class: "nx-explain__delta", "data-tone": changeTone(d, c.better), title: this.#fmt({ value: c.value }, head) }, `${d > 0 ? "▲" : d < 0 ? "▼" : "="} ${pct} % ${vs}`);
          });
          return h(
            "header",
            { class: "nx-explain__head" },
            parent ? h("span", { class: "nx-explain__label" }, head?.label ?? level.title) : null,
            head ? h("p", { class: "nx-explain__value" }, this.#fmt(head)) : null,
            head?.detail ? h("p", { class: "nx-explain__detail" }, head.detail) : null,
            changes.length ? h("p", { class: "nx-explain__deltas" }, ...changes) : null,
          );
        },
      ],
      [
        "terms",
        j([depth, s.terms, s.done, s.total, head?.value, head?.format, head?.currency, cites, f.locale, L.balanced, L.unbalanced, L.drill]),
        () => {
          if (!s.terms.length) return null;
          // La fórmula, término a término, y si cuadra.
          const bal = s.done ? balance(s) : null;
          return h(
            "ol",
            { class: "nx-explain__terms" },
            ...s.terms.map((t, i) => {
              const body = [
                h("span", { class: "nx-explain__op", "aria-hidden": "true" }, i === 0 && (t.op ?? "+") === "+" ? "" : OP_SIGN[t.op ?? "+"]),
                h("span", { class: "nx-explain__term-text" }, h("span", null, t.label, cite(t.source)), t.detail ? h("small", null, t.detail) : null),
                h("span", { class: "nx-explain__num" }, this.#fmt(t.op === "-" && typeof t.value === "number" ? { ...t, value: Math.abs(t.value) } : t, head)),
              ];
              const href = safeHref(t.href);
              const attrs = { class: "nx-explain__term", "data-op": t.op ?? "+", "data-cite": t.source ?? null };
              if (t.explain) return h("li", attrs, h("button", { type: "button", class: "nx-explain__row", "data-drill": i, "data-fk": `drill:${i}`, "aria-label": `${L.drill.replace("{label}", t.label)}: ${this.#fmt(t, head)}` }, ...body, glyph("chevron", "nx-explain__more")));
              if (href) return h("li", attrs, h("a", { class: "nx-explain__row", href, rel: rel(href), "data-fk": `term:${i}` }, ...body, glyph("chevron", "nx-explain__more")));
              return h("li", attrs, h("div", { class: "nx-explain__row" }, ...body));
            }),
            bal
              ? h(
                  "li",
                  { class: "nx-explain__term nx-explain__term--total", "data-ok": String(bal.ok) },
                  h(
                    "div",
                    { class: "nx-explain__row" },
                    h("span", { class: "nx-explain__op", "aria-hidden": "true" }, "="),
                    h("span", { class: "nx-explain__term-text" }, bal.ok ? h("span", { class: "nx-explain__ok" }, glyph(CHECK), L.balanced) : h("span", { class: "nx-explain__bad", role: "alert" }, glyph(WARN), L.unbalanced.replace("{sum}", this.#fmt({ value: bal.sum }, head)).replace("{total}", this.#fmt({ value: bal.total }, head)))),
                    h("span", { class: "nx-explain__num" }, this.#fmt({ value: bal.sum }, head)),
                  ),
                )
              : null,
          );
        },
      ],
      [
        "text",
        j([depth, s.text, cites]),
        () => {
          // La explicación (Markdown mínimo, citas a las fuentes).
          if (!s.text) return null;
          const inline = (parts: Inline[]) => parts.map((p) => (p.t === "b" ? h("strong", null, p.v) : p.t === "code" ? h("code", null, p.v) : p.t === "cite" ? cite(p.v) : p.v));
          return h("div", { class: "nx-explain__text" }, ...parseBlocks(s.text).map((b) => (b.kind === "p" ? h("p", null, ...inline(b.inl)) : h("ul", null, ...b.items.map((it) => h("li", null, ...inline(it)))))));
        },
      ],
      [
        "sources",
        j([depth, s.sources, L.sources]),
        () =>
          s.sources.length
            ? h(
                "section",
                { class: "nx-explain__sources" },
                h("h3", null, L.sources),
                h(
                  "ol",
                  null,
                  ...s.sources.map((x) => {
                    const href = safeHref(x.href);
                    const inner = [h("span", null, x.title), x.detail ? h("small", null, x.detail) : null];
                    return h("li", { class: "nx-explain__source", "data-cite": x.id }, href ? h("a", { href, rel: rel(href), "data-fk": `src:${x.id}` }, ...inner) : h("span", null, ...inner));
                  }),
                ),
              )
            : null,
      ],
      ["notes", j([depth, s.notes]), () => (s.notes.length ? h("p", { class: "nx-explain__notes" }, ...s.notes.map((n) => h("span", { class: "nx-explain__note", "data-tone": n.tone }, n.label))) : null)],
      [
        "status",
        // Mientras carga la firma no cambia: el mismo spinner gira de principio a fin.
        j(!s.done ? ["loading", L.loading] : [depth, s.error, L.error]),
        () =>
          !s.done
            ? h("p", { class: "nx-explain__status" }, h("span", { class: "nx-explain__spin", "aria-hidden": "true" }), L.loading)
            : s.error !== null
              ? h("p", { class: "nx-explain__error", role: "alert" }, s.error || L.error)
              : null,
      ],
    ];

    card.setAttribute("aria-busy", String(!s.done));
    // Volver a pintar no le quita el foco a quien navega con teclado mientras llega el desglose.
    const active = card.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
    let refocus: string | null = null;
    const els: HTMLElement[] = [];
    for (const [name, sig, build] of sections) {
      let slot = this.#slots.get(name);
      if (!slot || slot.sig !== sig) {
        if (active && slot?.el?.contains(active)) refocus = active.dataset.fk ?? "";
        const el = build();
        if (slot?.el && el) slot.el.replaceWith(el);
        else slot?.el?.remove();
        slot = { sig, el };
        this.#slots.set(name, slot);
      }
      if (slot.el) els.push(slot.el);
    }
    // En orden, sin mover lo que ya está en su lugar (moverlo reiniciaría su animación).
    els.forEach((el, i) => {
      if (card.children[i] !== el) card.insertBefore(el, card.children[i] ?? null);
    });
    for (const extra of [...card.children].slice(els.length)) extra.remove();
    if (refocus !== null) (card.querySelector<HTMLElement>(`[data-fk="${CSS.escape(refocus)}"]`) ?? card).focus({ preventScroll: true });
    if (this.#open) this.#place();
  }

  #paint(): void {
    if (!this.#built) return;
    this.title = this.#labels.trigger;
    this.#card?.setAttribute("aria-label", this.#labels.dialog);
  }

  /** Debajo de la cifra (arriba si no cabe), sin salirse de la pantalla. */
  #place(): void {
    const card = this.#card;
    if (!card) return;
    const r = this.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const w = card.offsetWidth;
    const ch = card.offsetHeight;
    const left = Math.min(Math.max(8, r.left), Math.max(8, vw - w - 8));
    const below = vh - r.bottom - 8;
    const top = ch > below && r.top > below ? Math.max(8, r.top - 6 - ch) : r.bottom + 6;
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
  }

  #startTracking(): void {
    this.#track?.();
    let raf = 0;
    const onMove = (e: Event) => {
      if (e.target instanceof Node && this.#card?.contains(e.target)) return;
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), this.#place()));
    };
    addEventListener("scroll", onMove, { capture: true, passive: true });
    addEventListener("resize", onMove, { passive: true });
    this.#track = () => {
      cancelAnimationFrame(raf);
      removeEventListener("scroll", onMove, { capture: true });
      removeEventListener("resize", onMove);
      this.#track = undefined;
    };
  }
}
