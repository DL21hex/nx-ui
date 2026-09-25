/**
 * `<nx-survey>`: una encuesta que da gusto contestar. Una pregunta a la vez y, arriba, lo que ya se
 * respondió (un clic vuelve a esa pregunta para cambiarla). Con el teclado (letras para elegir,
 * números para calificar, Enter para seguir), lógica condicional (una pregunta aparece según otra
 * respuesta) y respuestas que se insertan en las preguntas siguientes («¿Qué mejorarías de
 * {{area}}?»). Guarda el borrador para retomar donde se quedó, y al terminar muestra cómo
 * respondieron los demás, con la respuesta propia resaltada.
 *
 * Siete tipos: `choice`, `multi`, `scale` (con NPS), `rating` (estrellas o caras), `text`, `rank`
 * (ordenar arrastrando o con el teclado) y `slider`. Todo es JSON: el backend manda las preguntas,
 * recibe las respuestas en `action` y puede devolver los resultados (`aggregate()` los arma).
 */
import { Base } from "../../core/define";
import { h } from "../../core/dom";
import { glyph } from "../../core/icons";
import { nxFormat, resolveLocale } from "../../core/locale";
import { foldText } from "../../core/text";
import { answerText, answersToSend, cleanQuestions, estimateMinutes, interpolate, isAnswered, letterOf, rangeOf, validate, visibleQuestions } from "./logic";
import type { SurveyAnswer, SurveyAnswers, SurveyLabels, SurveyQuestion, SurveyQuestionInput, SurveyQuestionResult, SurveyResults } from "./types";

export const SURVEY_LABELS: SurveyLabels = {
  start: "Empezar",
  next: "Siguiente",
  back: "Anterior",
  submit: "Enviar",
  sending: "Enviando…",
  required: "Esta pregunta es obligatoria",
  minChoices: "Elige al menos {n}",
  maxChoices: "Elige hasta {n}",
  minLength: "Escribe al menos {n} caracteres",
  other: "Otra",
  otherPlaceholder: "Escribe tu respuesta…",
  meta: "{n} preguntas · {min} min",
  progress: "Pregunta {i} de {n}",
  rankHint: "Arrastra, o enfoca una opción y muévela con ↑ ↓",
  thanks: "¡Gracias!",
  thanksDetail: "Tu respuesta quedó registrada.",
  results: "Así respondieron",
  responses: "{n} respuestas",
  you: "Tú",
  average: "Promedio {avg}",
  error: "No se pudo enviar. Inténtalo de nuevo.",
  resume: "Continuar donde quedaste",
  restart: "Empezar de nuevo",
  faces: ["😡", "🙁", "😐", "🙂", "😍"],
  words: "Lo que más se repite",
  edit: "Cambiar",
  skipped: "Sin respuesta",
  given: "Tus respuestas",
  earlier: "Ver {n} respuestas anteriores",
};

const ARROW = '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>';
const LEFT = '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const STAR = '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>';
const GRIP = '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>';
const PROPS = ["questions", "answers", "results", "labels", "heading", "description", "action", "storage"] as const;
/** Con más respuestas que estas, las más viejas se pliegan (se ven las dos últimas). */
const TRAIL_MAX = 3;
/** Una elección simple pasa sola a la siguiente, tras este respiro (para ver lo que se eligió). */
const AUTO_NEXT_MS = 420;

type Screen = "intro" | "question" | "sending" | "done";
let uid = 0;
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(TEXTAREA|SELECT)$/.test(t.tagName) || (t.tagName === "INPUT" && !/^(radio|checkbox|range)$/.test((t as HTMLInputElement).type)));

export class NxSurvey extends Base {
  static observedAttributes = ["questions", "labels", "heading", "description", "locale"];

  #uid = `nx-survey${++uid}`;
  #questions: SurveyQuestion[] = [];
  #answers: SurveyAnswers = {};
  #results: SurveyResults | null = null;
  #labels: SurveyLabels = SURVEY_LABELS;
  #screen: Screen = "intro";
  #step = 0;
  #dir: "next" | "back" = "next";
  #error = "";
  #since = 0;
  #auto = 0;
  #digits = "";
  #digitsAt = 0;
  #failed = false;
  #built = false;
  /** Se abrieron las respuestas plegadas (siguen abiertas hasta empezar de nuevo). */
  #trailOpen = false;
  #head?: HTMLElement;
  #bar?: HTMLElement;
  #stage?: HTMLElement;
  #nav?: HTMLElement;

  // ---------------------------------------------------------------- propiedades

  get questions(): SurveyQuestion[] {
    return this.#questions;
  }
  set questions(v: SurveyQuestionInput[] | null | undefined) {
    this.#questions = cleanQuestions(v);
    this.#render();
  }
  /** Las respuestas hasta ahora (se pueden precargar). */
  get answers(): SurveyAnswers {
    return { ...this.#answers };
  }
  set answers(v: SurveyAnswers | null | undefined) {
    this.#answers = v && typeof v === "object" ? { ...v } : {};
    this.#render();
  }
  /** Los resultados de todos (la forma de `aggregate()`): se muestran al terminar. */
  get results(): SurveyResults | null {
    return this.#results;
  }
  set results(v: SurveyResults | null | undefined) {
    this.#results = v && typeof v === "object" && typeof v.total === "number" && v.questions ? v : null;
    if (this.#screen === "done") this.#render();
  }
  get heading(): string {
    return this.getAttribute("heading") ?? "";
  }
  set heading(v: string) {
    this.setAttribute("heading", v);
  }
  get description(): string {
    return this.getAttribute("description") ?? "";
  }
  set description(v: string) {
    this.setAttribute("description", v);
  }
  /** URL que recibe `POST {answers, ms}` y puede responder con los resultados. */
  get action(): string | null {
    return this.getAttribute("action");
  }
  set action(v: string | null) {
    if (v) this.setAttribute("action", v);
    else this.removeAttribute("action");
  }
  /** Clave de `localStorage` para el borrador (sin ella no se guarda nada). */
  get storage(): string | null {
    return this.getAttribute("storage");
  }
  set storage(v: string | null) {
    if (v) this.setAttribute("storage", v);
    else this.removeAttribute("storage");
  }
  get labels(): SurveyLabels {
    return this.#labels;
  }
  set labels(v: Partial<SurveyLabels> | null | undefined) {
    this.#labels = { ...SURVEY_LABELS, ...(v && typeof v === "object" ? v : {}) };
    this.#render();
  }
  /** `intro`, `question`, `sending` o `done`. */
  get screen(): Screen {
    return this.#screen;
  }
  /** La pregunta que se ve. */
  get current(): SurveyQuestion | null {
    return this.#screen === "question" ? (this.#visible()[this.#step] ?? null) : null;
  }

  // ---------------------------------------------------------------- API

  start(fresh = false): void {
    if (fresh) {
      this.#answers = {};
      this.#step = 0;
      this.#forget();
    }
    this.#since ||= performance.now();
    this.#screen = "question";
    this.#dir = "next";
    this.#render(true);
  }

  /** Valida la pregunta actual y pasa a la siguiente (o envía, si es la última). */
  next(): boolean {
    clearTimeout(this.#auto);
    if (this.#screen === "intro") return this.start(), true;
    const q = this.current;
    if (!q) return false;
    // Ordenar sin tocar nada también es una respuesta: el orden que se ve.
    if (q.type === "rank" && !isAnswered(this.#answers[q.id])) this.#set(q.id, (q.options ?? []).map((o) => o.value), false);
    const bad = validate(q, this.#answers[q.id]);
    if (bad) {
      const L = this.#labels;
      this.#error = bad.key === "required" ? L.required : L[bad.key].replace("{n}", String(bad.n));
      this.#render();
      this.#stage!.querySelector(".nx-survey__q")?.classList.add("is-shake");
      return false;
    }
    this.#error = "";
    const vis = this.#visible();
    if (this.#step >= vis.length - 1) {
      void this.submit();
      return true;
    }
    this.#step++;
    this.#dir = "next";
    this.#save();
    this.#render(true);
    return true;
  }

  back(): void {
    if (this.#step > 0) this.goto(this.#step - 1);
  }

  /** Vuelve a una pregunta ya vista (lo hace un clic en una respuesta de arriba). */
  goto(index: number): void {
    clearTimeout(this.#auto);
    if (this.#screen !== "question" || index === this.#step || index < 0 || index >= this.#visible().length) return;
    this.#dir = index < this.#step ? "back" : "next";
    this.#step = index;
    this.#error = "";
    this.#save();
    this.#render(true);
  }

  /** Envía: `nx-survey-submit` (cancelable) y, si hay `action`, el `POST`. */
  async submit(): Promise<void> {
    const answers = answersToSend(this.#questions, this.#answers);
    const ms = Math.round(performance.now() - (this.#since || performance.now()));
    const go = this.dispatchEvent(new CustomEvent("nx-survey-submit", { detail: { answers, ms }, bubbles: true, composed: true, cancelable: true }));
    if (!go) return;
    const url = this.action;
    if (url) {
      this.#screen = "sending";
      this.#failed = false;
      this.#render();
      try {
        const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, credentials: "same-origin", body: JSON.stringify({ answers, ms }) });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json().catch(() => null)) as { results?: SurveyResults } | SurveyResults | null;
        this.results = data && "total" in data ? data : (data?.results ?? null);
      } catch {
        this.#failed = true;
        this.#screen = "question";
        this.#render();
        return;
      }
    }
    this.#forget();
    this.#screen = "done";
    this.#render(true);
  }

  /** Vuelve al inicio, sin respuestas. */
  reset(): void {
    this.#answers = {};
    this.#results = null;
    this.#trailOpen = false;
    this.#step = 0;
    this.#since = 0;
    this.#error = "";
    this.#forget();
    this.#screen = this.heading ? "intro" : "question";
    this.#render(true);
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
    if (!this.heading && this.#screen === "intro") this.#screen = "question";
    this.#render();
  }

  disconnectedCallback(): void {
    clearTimeout(this.#auto);
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "questions" || name === "labels") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-survey] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (name === "heading" && this.#screen === "question" && !value) return;
    this.#render();
  }

  // ---------------------------------------------------------------- interno

  #visible(): SurveyQuestion[] {
    return visibleQuestions(this.#questions, this.#answers);
  }

  #set(id: string, v: SurveyAnswer | undefined, paint = true): void {
    if (v === undefined || (Array.isArray(v) && !v.length) || v === "") delete this.#answers[id];
    else this.#answers[id] = v;
    this.#error = "";
    this.#save();
    this.dispatchEvent(new CustomEvent("nx-survey-change", { detail: { id, value: v, answers: this.answers }, bubbles: true, composed: true }));
    if (paint) this.#paintProgress();
  }

  #save(): void {
    const key = this.storage;
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify({ answers: this.#answers, step: this.#step }));
    } catch {
      /* sin almacenamiento: el borrador dura lo que la página */
    }
  }
  #draft(): { answers: SurveyAnswers; step: number } | null {
    const key = this.storage;
    if (!key) return null;
    try {
      const d = JSON.parse(localStorage.getItem(key) ?? "null") as { answers?: unknown; step?: unknown } | null;
      return d && d.answers && typeof d.answers === "object" && Object.keys(d.answers).length ? { answers: d.answers as SurveyAnswers, step: Number(d.step) || 0 } : null;
    } catch {
      return null;
    }
  }
  #forget(): void {
    try {
      if (this.storage) localStorage.removeItem(this.storage);
    } catch {
      /* nada */
    }
  }

  #build(): void {
    this.#built = true;
    this.setAttribute("role", "region");
    this.#bar = h("div", { class: "nx-survey__bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100" }, h("span"));
    this.#head = h("header", { class: "nx-survey__head" }, h("strong", { class: "nx-survey__name" }), h("span", { class: "nx-survey__count" }), this.#bar);
    this.#stage = h("div", { class: "nx-survey__stage" });
    this.#nav = h(
      "footer",
      { class: "nx-survey__nav" },
      h("button", { type: "button", class: "nx-survey__btn nx-survey__btn--ghost", "data-act": "back" }, glyph(LEFT), h("span")),
      h("button", { type: "button", class: "nx-survey__btn", "data-act": "next" }, h("span"), h("span", { class: "nx-survey__next-icon" })),
    );
    this.append(this.#head, this.#stage, this.#nav);

    this.addEventListener("click", (e) => {
      const act = (e.target as Element).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "next") this.next();
      else if (act === "back") this.back();
      else if (act === "goto") this.goto(Number((e.target as Element).closest<HTMLElement>("[data-i]")?.dataset.i));
      else if (act === "start") this.start();
      else if (act === "earlier") {
        this.#trailOpen = true;
        const trail = (e.target as Element).closest(".nx-survey__trail")!;
        for (const li of trail.querySelectorAll<HTMLElement>("li[hidden]")) li.hidden = false;
        (e.target as Element).closest("li")?.remove();
        trail.querySelector<HTMLElement>(".nx-survey__trail-btn")?.focus();
      }
      else if (act === "resume") {
        const d = this.#draft();
        if (d) {
          this.#answers = d.answers;
          this.#step = Math.min(d.step, this.#visible().length - 1);
        }
        this.start();
      } else if (act === "restart") this.start(true);
    });
    this.addEventListener("change", (e) => this.#onChange(e));
    this.addEventListener("input", (e) => this.#onInput(e));
    this.addEventListener("keydown", (e) => this.#key(e));
    // Pasar sobre una estrella enciende las anteriores; al salir, vuelve lo elegido.
    this.addEventListener("pointerover", (e) => {
      const star = (e.target as Element).closest<HTMLElement>(".nx-survey__rate [data-v]");
      if (star) this.#paintStars(Number(star.dataset.v));
    });
    this.addEventListener("pointerout", (e) => {
      if (!(e.target as Element).closest(".nx-survey__rate")) return;
      const a = this.current ? this.#answers[this.current.id] : undefined;
      this.#paintStars(typeof a === "number" ? a : 0);
    });
  }

  /** Radios y casillas: la respuesta, y en una elección simple, pasar sola a la siguiente. */
  #onChange(e: Event): void {
    const t = e.target as HTMLInputElement;
    const q = this.current;
    if (!q || !t.name?.startsWith(this.#uid)) return;
    if (q.type === "multi") {
      this.#set(q.id, this.#checked());
      if (t.value === "__other" && t.checked) this.#stage!.querySelector<HTMLInputElement>(".nx-survey__other-text")?.focus();
      this.#paintChoices();
      return;
    }
    if (t.type === "radio") {
      if (t.value === "__other") {
        this.#set(q.id, this.#otherText());
        this.#paintChoices();
        this.#stage!.querySelector<HTMLInputElement>(".nx-survey__other-text")?.focus();
        return;
      }
      const v = q.type === "choice" ? t.value : Number(t.value);
      this.#set(q.id, v);
      this.#paintChoices();
      if (q.type !== "choice" || !q.other) {
        clearTimeout(this.#auto);
        this.#auto = window.setTimeout(() => this.current?.id === q.id && this.next(), AUTO_NEXT_MS);
      }
    }
  }

  #otherText(): string {
    return this.#stage!.querySelector<HTMLInputElement>(".nx-survey__other-text")?.value.trim() ?? "";
  }

  /** Lo marcado en una pregunta `multi` («Otra» vale lo que se escribió). */
  #checked(): string[] {
    return [...this.#stage!.querySelectorAll<HTMLInputElement>(".nx-survey__opt > input:checked")].map((i) => (i.value === "__other" ? this.#otherText() : i.value)).filter(Boolean);
  }

  #onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    const q = this.current;
    if (!q) return;
    if (t.classList.contains("nx-survey__other-text")) {
      // Escribir en «Otra» la elige.
      const box = this.#stage!.querySelector<HTMLInputElement>('input[value="__other"]');
      if (box && !box.checked) box.checked = true;
      this.#set(q.id, q.type === "multi" ? this.#checked() : t.value.trim());
      this.#paintChoices();
      return;
    }
    if (q.type === "text" && (t.tagName === "TEXTAREA" || t.type === "text")) {
      this.#set(q.id, t.value);
      const c = this.#stage!.querySelector(".nx-survey__counter");
      if (c && q.max) c.textContent = `${t.value.length} / ${q.max}`;
    } else if (q.type === "slider" && t.type === "range") {
      this.#set(q.id, Number(t.value));
      this.#paintSlider(q, t);
    }
  }

  #key(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (this.#screen === "intro" && k === "Enter") return void (e.preventDefault(), this.start());
    const q = this.current;
    if (!q) return;
    const inText = typing(e.target);
    if (k === "Enter") {
      // En un texto largo, Mayús + Enter es otra línea; Enter sigue. Sobre un botón, el botón.
      if ((e.target as Element).closest("button") || (inText && (e.target as Element).tagName === "TEXTAREA" && e.shiftKey)) return;
      e.preventDefault();
      this.next();
      return;
    }
    if (inText) return;
    if (q.type === "rank" && (k === "ArrowUp" || k === "ArrowDown")) {
      const li = (e.target as Element).closest<HTMLElement>(".nx-survey__rank li");
      if (li) {
        e.preventDefault();
        this.#moveRank(q, li.dataset.v!, k === "ArrowUp" ? -1 : 1);
      }
      return;
    }
    // Letras: la opción con esa letra.
    if ((q.type === "choice" || q.type === "multi") && /^[a-z]$/i.test(k)) {
      const i = k.toUpperCase().charCodeAt(0) - 65;
      const inputs = [...this.#stage!.querySelectorAll<HTMLInputElement>(".nx-survey__opt input")];
      const input = inputs[i];
      if (!input) return;
      e.preventDefault();
      if (input.type === "checkbox") input.checked = !input.checked;
      else input.checked = true;
      input.focus({ preventScroll: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    // Números: el valor en una escala o calificación (dos cifras seguidas, para el 10).
    if ((q.type === "scale" || q.type === "rating") && /^\d$/.test(k)) {
      const now = performance.now();
      this.#digits = now - this.#digitsAt < 700 ? this.#digits + k : k;
      this.#digitsAt = now;
      const { min, max } = rangeOf(q);
      let v = Number(this.#digits);
      if (v > max) v = Number((this.#digits = k));
      if (v < min || v > max) return;
      e.preventDefault();
      const input = this.#stage!.querySelector<HTMLInputElement>(`input[value="${v}"]`);
      if (!input) return;
      input.checked = true;
      input.focus({ preventScroll: true });
      // Con «1» en una escala hasta 10, se espera un instante por si viene el «0».
      if (q.nps && this.#digits === "1") {
        this.#set(q.id, 1);
        this.#paintChoices();
        clearTimeout(this.#auto);
        this.#auto = window.setTimeout(() => this.current?.id === q.id && this.next(), 900);
      } else input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  // ---------------------------------------------------------------- ordenar

  #moveRank(q: SurveyQuestion, v: string, by: number): void {
    const order = (this.#answers[q.id] as string[] | undefined) ?? (q.options ?? []).map((o) => o.value);
    const i = order.indexOf(v);
    const j = i + by;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    this.#set(q.id, next);
    this.#paintRank(q);
    this.#stage!.querySelector<HTMLElement>(`.nx-survey__rank li[data-v="${CSS.escape(v)}"]`)?.focus();
  }

  #paintRank(q: SurveyQuestion): void {
    const ol = this.#stage!.querySelector<HTMLOListElement>(".nx-survey__rank");
    if (!ol) return;
    const order = (this.#answers[q.id] as string[] | undefined) ?? (q.options ?? []).map((o) => o.value);
    const items = new Map([...ol.children].map((li) => [(li as HTMLElement).dataset.v!, li as HTMLElement]));
    // Animación FLIP: cada opción se desliza desde donde estaba.
    const before = new Map([...items].map(([v, li]) => [v, li.getBoundingClientRect().top]));
    order.forEach((v, i) => {
      const li = items.get(v);
      if (!li) return;
      ol.append(li);
      li.querySelector(".nx-survey__pos")!.textContent = String(i + 1);
    });
    for (const [v, li] of items) {
      const dy = (before.get(v) ?? 0) - li.getBoundingClientRect().top;
      if (dy && li.animate) li.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration: 180, easing: "cubic-bezier(0.2,0.8,0.2,1)" });
    }
  }

  #wireDrag(q: SurveyQuestion, ol: HTMLOListElement): void {
    let drag: { v: string; y: number; id: number } | null = null;
    ol.addEventListener("pointerdown", (e) => {
      const li = (e.target as Element).closest<HTMLElement>("li");
      if (!li || e.button !== 0) return;
      drag = { v: li.dataset.v!, y: e.clientY, id: e.pointerId };
      li.setPointerCapture?.(e.pointerId);
      li.classList.add("is-drag");
    });
    ol.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const li = ol.querySelector<HTMLElement>(`li[data-v="${CSS.escape(drag.v)}"]`)!;
      const r = li.getBoundingClientRect();
      // Pasa al lugar del vecino cuando el puntero cruza la mitad de su caja.
      if (e.clientY < r.top - 4 && li.previousElementSibling) this.#moveRank(q, drag.v, -1);
      else if (e.clientY > r.bottom + 4 && li.nextElementSibling) this.#moveRank(q, drag.v, 1);
    });
    const end = () => {
      ol.querySelector(".is-drag")?.classList.remove("is-drag");
      drag = null;
    };
    ol.addEventListener("pointerup", end);
    ol.addEventListener("pointercancel", end);
  }

  // ---------------------------------------------------------------- pintado

  #fmt(q: SurveyQuestion, v: number): string {
    const f = nxFormat(resolveLocale(this));
    if (q.format === "money") return f.money(v, { currency: q.currency });
    if (q.format === "percent") return `${f.number(v)} %`;
    return `${f.number(v)}${q.unit ? ` ${q.unit}` : ""}`;
  }

  #paintProgress(): void {
    const vis = this.#visible();
    const done = this.#screen === "done" ? vis.length : vis.filter((q) => isAnswered(this.#answers[q.id])).length;
    const pct = vis.length ? Math.round((done / vis.length) * 100) : 0;
    this.#bar!.setAttribute("aria-valuenow", String(pct));
    this.#bar!.style.setProperty("--p", `${pct}%`);
    const L = this.#labels;
    const q = this.#screen === "question";
    const count = q ? L.progress.replace("{i}", String(this.#step + 1)).replace("{n}", String(vis.length)) : "";
    this.#head!.hidden = !q && this.#screen !== "sending";
    this.#head!.firstElementChild!.textContent = this.heading;
    this.#head!.children[1].textContent = count;
    this.#bar!.setAttribute("aria-label", count || L.results);
    this.#nav!.hidden = !q;
    const [back, next] = this.#nav!.children as unknown as HTMLButtonElement[];
    back.hidden = this.#step === 0;
    back.lastElementChild!.textContent = L.back;
    const last = this.#step >= vis.length - 1;
    next.firstElementChild!.textContent = last ? L.submit : L.next;
    next.lastElementChild!.replaceChildren(glyph(last ? CHECK : ARROW));
  }

  /** Marca lo elegido sin volver a pintar (así el foco y la animación siguen). */
  #paintChoices(): void {
    const q = this.current;
    if (!q) return;
    const a = this.#answers[q.id];
    const vals = Array.isArray(a) ? a.map(String) : isAnswered(a) ? [String(a)] : [];
    const known = new Set((q.options ?? []).map((o) => o.value));
    for (const input of this.#stage!.querySelectorAll<HTMLInputElement>(".nx-survey__opt input, .nx-survey__scale input, .nx-survey__rate input")) {
      const on = input.value === "__other" ? vals.some((v) => !known.has(v)) || input.checked : vals.includes(input.value);
      input.checked = on;
      input.closest("label")?.toggleAttribute("data-on", on);
    }
    this.#paintStars(typeof a === "number" ? a : 0);
    const hint = this.#stage!.querySelector(".nx-survey__limit");
    if (hint && q.type === "multi" && q.max) hint.textContent = `${vals.length} / ${q.max}`;
    this.#paintErr();
  }

  #paintStars(n: number): void {
    for (const l of this.#stage!.querySelectorAll<HTMLElement>(".nx-survey__rate [data-v]")) l.toggleAttribute("data-lit", Number(l.dataset.v) <= n);
  }

  #paintErr(): void {
    const err = this.#stage!.querySelector<HTMLElement>(".nx-survey__err");
    if (!err) return;
    err.textContent = this.#failed ? this.#labels.error : this.#error;
    err.hidden = !err.textContent;
  }

  #paintSlider(q: SurveyQuestion, input: HTMLInputElement): void {
    const { min, max } = rangeOf(q);
    const v = Number(input.value);
    input.style.setProperty("--fill", `${((v - min) / (max - min || 1)) * 100}%`);
    const out = this.#stage!.querySelector("output");
    if (out) out.textContent = this.#fmt(q, v);
  }

  #render(focus = false): void {
    if (!this.#built) return;
    const L = this.#labels;
    const stage = this.#stage!;
    this.setAttribute("aria-label", this.heading || L.results);
    stage.dataset.dir = this.#dir;
    const vis = this.#visible();
    if (this.#step >= vis.length) this.#step = Math.max(0, vis.length - 1);
    const sc = this.#screen;
    let screen: HTMLElement;
    let trail: HTMLElement | null = null;
    if (sc === "sending") screen = h("div", { class: "nx-survey__screen nx-survey__sending", role: "status" }, h("span", { class: "nx-survey__spin", "aria-hidden": "true" }), L.sending);
    else if (sc === "intro") screen = this.#intro();
    else if (sc === "done") screen = this.#done();
    else {
      screen = vis[this.#step] ? this.#question(vis[this.#step]) : h("div");
      trail = this.#trail(vis, focus && this.#dir === "next");
    }
    stage.replaceChildren(...[trail, screen].filter((x): x is HTMLElement => !!x));
    this.#paintProgress();
    this.#paintChoices();
    if (!focus) return;
    // El foco va a lo que se contesta, o al grupo (el lector de pantalla anuncia la pregunta). No al
    // <legend>: Firefox no lo enfoca recién insertado y el teclado quedaba sin destino.
    const target = screen.querySelector<HTMLElement>("[data-autofocus]") ?? screen.querySelector<HTMLElement>("input:checked") ?? (screen.matches("fieldset") ? screen : screen.querySelector<HTMLElement>("h2"));
    if (target && !target.matches("input, textarea, button, li")) target.tabIndex = -1;
    target?.focus({ preventScroll: true });
  }

  #intro(): HTMLElement {
    const L = this.#labels;
    const vis = this.#visible();
    const draft = this.#draft();
    return h(
      "div",
      { class: "nx-survey__screen nx-survey__intro" },
      h("h2", { class: "nx-survey__title" }, this.heading),
      this.description ? h("p", { class: "nx-survey__desc" }, this.description) : null,
      h("p", { class: "nx-survey__meta" }, L.meta.replace("{n}", String(vis.length)).replace("{min}", String(estimateMinutes(vis)))),
      h(
        "div",
        { class: "nx-survey__ok" },
        draft
          ? h("button", { type: "button", class: "nx-survey__btn", "data-act": "resume", "data-autofocus": "" }, L.resume, glyph(ARROW))
          : h("button", { type: "button", class: "nx-survey__btn", "data-act": "start", "data-autofocus": "" }, L.start, glyph(ARROW)),
        draft ? h("button", { type: "button", class: "nx-survey__link", "data-act": "restart" }, L.restart) : null,
      ),
    );
  }

  /** El control de una pregunta (opciones, escala, texto…). `group`: si va en un `<fieldset>`. */
  #control(q: SurveyQuestion, tid: string): { control: HTMLElement; group: boolean } {
    const L = this.#labels;
    const name = `${this.#uid}-${q.id}`;
    const a = this.#answers[q.id];
    let control: HTMLElement;
    let group = true;
    if (q.type === "choice" || q.type === "multi") {
      const multi = q.type === "multi";
      const opts = [...(q.options ?? [])];
      const known = new Set(opts.map((o) => o.value));
      const otherVal = (Array.isArray(a) ? a : [a]).find((v) => typeof v === "string" && v && !known.has(v)) as string | undefined;
      control = h(
        "div",
        { class: "nx-survey__opts", role: multi ? "group" : "radiogroup", "aria-labelledby": tid },
        ...opts.map((o, i) =>
          h(
            "label",
            { class: "nx-survey__opt" },
            h("input", { type: multi ? "checkbox" : "radio", name, value: o.value, "aria-keyshortcuts": letterOf(i) }),
            glyph(CHECK, "nx-survey__mark"),
            o.emoji ? h("span", { class: "nx-survey__emoji", "aria-hidden": "true" }, o.emoji) : null,
            h("span", { class: "nx-survey__opt-text" }, o.label, o.hint ? h("small", null, o.hint) : null),
          ),
        ),
        q.other
          ? h(
              "label",
              { class: "nx-survey__opt nx-survey__opt--other" },
              h("input", { type: multi ? "checkbox" : "radio", name, value: "__other", "aria-label": L.other, "aria-keyshortcuts": letterOf(opts.length) }),
              glyph(CHECK, "nx-survey__mark"),
              h("input", { type: "text", class: "nx-survey__other-text", placeholder: `${L.other}: ${L.otherPlaceholder}`, value: otherVal ?? null, "aria-label": L.other }),
            )
          : null,
      );
    } else if (q.type === "scale") {
      const { min, max } = rangeOf(q);
      const vals = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      control = h(
        "div",
        { class: "nx-survey__scale-wrap" },
        h(
          "div",
          { class: "nx-survey__scale", role: "radiogroup", "aria-labelledby": tid, "data-nps": q.nps ? "" : null, style: `--n:${vals.length}` },
          ...vals.map((v) => h("label", { "data-band": q.nps ? (v >= 9 ? "p" : v >= 7 ? "n" : "d") : null }, h("input", { type: "radio", name, value: v, "aria-label": String(v) }), h("span", { "aria-hidden": "true" }, String(v)))),
        ),
        q.minLabel || q.maxLabel ? h("div", { class: "nx-survey__ends", "aria-hidden": "true" }, h("span", null, q.minLabel ?? ""), h("span", null, q.maxLabel ?? "")) : null,
      );
    } else if (q.type === "rating") {
      const { max } = rangeOf(q);
      const faces = q.icon === "face";
      control = h(
        "div",
        { class: `nx-survey__rate${faces ? " nx-survey__rate--faces" : ""}`, role: "radiogroup", "aria-labelledby": tid },
        ...Array.from({ length: max }, (_, i) => {
          const v = i + 1;
          const face = L.faces[Math.round((i / Math.max(1, max - 1)) * (L.faces.length - 1))];
          return h("label", { "data-v": v, style: `--i:${v}` }, h("input", { type: "radio", name, value: v, "aria-label": `${v} / ${max}` }), faces ? h("span", { class: "nx-survey__face", "aria-hidden": "true" }, face) : glyph(STAR, "nx-survey__star"));
        }),
      );
    } else if (q.type === "text") {
      group = false;
      const attrs = { id: `${name}-in`, class: "nx-survey__text", placeholder: q.placeholder ?? L.otherPlaceholder, maxlength: q.max ?? null, "aria-labelledby": tid, "data-autofocus": "" };
      const field = q.long ? h("textarea", { ...attrs, rows: "4" }) : h("input", { ...attrs, type: "text", autocomplete: "off" });
      field.value = typeof a === "string" ? a : "";
      control = h("div", { class: "nx-survey__text-wrap" }, field, q.max ? h("span", { class: "nx-survey__counter", "aria-hidden": "true" }, `${field.value.length} / ${q.max}`) : null);
    } else if (q.type === "rank") {
      const order = Array.isArray(a) ? a : (q.options ?? []).map((o) => o.value);
      const byVal = new Map((q.options ?? []).map((o) => [o.value, o]));
      const ol = h(
        "ol",
        { class: "nx-survey__rank", "aria-labelledby": tid, "aria-describedby": `${name}-rh` },
        ...order
          .map((v) => byVal.get(v))
          .filter((o): o is NonNullable<typeof o> => !!o)
          .map((o, i) => h("li", { "data-v": o.value, tabindex: "0", "data-autofocus": i === 0 ? "" : null }, h("span", { class: "nx-survey__pos" }, String(i + 1)), o.emoji ? h("span", { class: "nx-survey__emoji", "aria-hidden": "true" }, o.emoji) : null, h("span", { class: "nx-survey__opt-text" }, o.label), glyph(GRIP, "nx-survey__grip"))),
      );
      this.#wireDrag(q, ol);
      control = h("div", null, ol, h("p", { class: "nx-survey__hint", id: `${name}-rh` }, L.rankHint));
    } else {
      group = false;
      const { min, max, step } = rangeOf(q);
      const v = typeof a === "number" ? a : Math.round((min + max) / 2 / step) * step;
      const input = h("input", { type: "range", min, max, step, value: v, class: "nx-survey__range", "aria-labelledby": tid, "data-autofocus": "" });
      control = h("div", { class: "nx-survey__slider" }, h("output", { class: "nx-survey__out", "aria-hidden": "true" }, this.#fmt(q, v)), input, h("div", { class: "nx-survey__ends", "aria-hidden": "true" }, h("span", null, q.minLabel ?? this.#fmt(q, min)), h("span", null, q.maxLabel ?? this.#fmt(q, max))));
      queueMicrotask(() => this.#paintSlider(q, input));
      // El valor del medio ya es una respuesta: se puede seguir sin mover nada.
      if (typeof a !== "number") this.#answers[q.id] = v;
    }
    return { control, group };
  }

  #question(q: SurveyQuestion): HTMLElement {
    const tid = `${this.#uid}-${q.id}-t`;
    const title = interpolate(q.title, this.#answers, this.#questions);
    const { control, group } = this.#control(q, tid);
    const legend = h("span", { id: tid }, title, q.required ? h("span", { class: "nx-survey__req", "aria-hidden": "true" }, " *") : null);
    return h(
      group ? "fieldset" : "div",
      { class: "nx-survey__screen nx-survey__q", "data-type": q.type, "data-q": q.id },
      h(group ? "legend" : "h2", { class: "nx-survey__title" }, legend),
      q.description ? h("p", { class: "nx-survey__desc" }, q.description) : null,
      q.type === "multi" && q.max ? h("p", { class: "nx-survey__limit", "aria-hidden": "true" }) : null,
      control,
      h("p", { class: "nx-survey__err", role: "alert", hidden: true }),
    );
  }

  // ---------------------------------------------------------------- lo ya respondido

  /** La respuesta en una línea: «🏭 Producción», «8 / 10», «★★★★☆», «Salario, Horario…». */
  #summary(q: SurveyQuestion): string {
    const a = this.#answers[q.id];
    if (!isAnswered(a)) return this.#labels.skipped;
    if (q.type === "choice") {
      const o = q.options?.find((x) => x.value === a);
      return o ? `${o.emoji ? `${o.emoji} ` : ""}${o.label}` : String(a);
    }
    if (q.type === "scale") return `${a} / ${rangeOf(q).max}`;
    if (q.type === "rating") {
      const max = rangeOf(q).max;
      const v = Number(a);
      return q.icon === "face" ? this.#labels.faces[Math.round(((v - 1) / Math.max(1, max - 1)) * (this.#labels.faces.length - 1))] : `${"★".repeat(v)}${"☆".repeat(Math.max(0, max - v))}`;
    }
    if (q.type === "slider") return this.#fmt(q, Number(a));
    if (q.type === "text") return `«${String(a).length > 90 ? `${String(a).slice(0, 88)}…` : a}»`;
    if (q.type === "rank") return (a as string[]).slice(0, 3).map((v, i) => `${i + 1}. ${q.options?.find((o) => o.value === v)?.label ?? v}`).join(" · ");
    return answerText(q, a);
  }

  /** Lo respondido antes de la pregunta actual, una línea por pregunta (un clic vuelve a ella). Con
   *  muchas, las viejas se pliegan tras un botón. `grew`: la última acaba de llegar y entra animada. */
  #trail(vis: SurveyQuestion[], grew: boolean): HTMLElement | null {
    const L = this.#labels;
    const prior = vis.slice(0, this.#step);
    if (!prior.length) return null;
    const fold = !this.#trailOpen && prior.length > TRAIL_MAX ? prior.length - 2 : 0;
    const rows = prior.map((q, i) =>
      h(
        "li",
        { hidden: i < fold || null, "data-new": grew && i === prior.length - 1 ? "" : null },
        h(
          "button",
          { type: "button", class: "nx-survey__trail-btn", "data-act": "goto", "data-i": i },
          h("span", { class: "nx-survey__trail-q" }, interpolate(q.title, this.#answers, this.#questions)),
          h("span", { class: "nx-survey__trail-a", "data-empty": isAnswered(this.#answers[q.id]) ? null : "" }, this.#summary(q)),
          h("span", { class: "nx-survey__trail-edit" }, L.edit),
        ),
      ),
    );
    return h(
      "ol",
      { class: "nx-survey__trail", "aria-label": L.given },
      fold ? h("li", null, h("button", { type: "button", class: "nx-survey__more", "data-act": "earlier" }, L.earlier.replace("{n}", String(fold)))) : null,
      ...rows,
    );
  }

  // ---------------------------------------------------------------- al terminar

  #done(): HTMLElement {
    const L = this.#labels;
    const f = nxFormat(resolveLocale(this));
    const confetti = h("div", { class: "nx-survey__confetti", "aria-hidden": "true" }, ...Array.from({ length: 22 }, (_, i) => h("i", { style: `--i:${i};--x:${((i * 37) % 100) - 50};--r:${(i * 53) % 360}deg;--d:${(i % 5) * 60}ms` })));
    const res = this.#results;
    const mine = answersToSend(this.#questions, this.#answers);
    const blocks = res
      ? this.#questions
          .filter((q) => res.questions[q.id] && isAnswered(mine[q.id]))
          .map((q, i) => this.#result(q, res.questions[q.id], mine[q.id], f.number, i === 0))
      : [];
    return h(
      "div",
      { class: "nx-survey__screen nx-survey__done" },
      h(
        "header",
        { class: "nx-survey__done-head" },
        confetti,
        h("span", { class: "nx-survey__check", "aria-hidden": "true" }, glyph(CHECK)),
        h("div", null, h("h2", { class: "nx-survey__title", "data-autofocus": "" }, L.thanks), h("p", { class: "nx-survey__desc" }, L.thanksDetail)),
      ),
      res ? h("section", { class: "nx-survey__results" }, h("h3", null, L.results, h("small", null, L.responses.replace("{n}", f.number(res.total)))), ...blocks) : null,
    );
  }

  /** Los resultados de una pregunta, plegados bajo su enunciado y la respuesta propia. */
  #result(q: SurveyQuestion, r: SurveyQuestionResult, a: SurveyAnswer, n: (x: number) => string, open: boolean): HTMLElement {
    const L = this.#labels;
    const you = h("span", { class: "nx-survey__you" }, L.you);
    const bar = (label: string, count: number, total: number, on: boolean, extra?: string) => {
      const pct = total ? Math.round((count / total) * 100) : 0;
      return h(
        "li",
        { class: "nx-survey__rbar", "data-on": on ? "" : null, style: `--w:${pct}%` },
        h("span", { class: "nx-survey__rlabel" }, label, on ? you.cloneNode(true) : null),
        h("span", { class: "nx-survey__rpct" }, `${pct} %`, extra ? h("small", null, extra) : null),
      );
    };
    const body: (Node | null)[] = [];
    const title = interpolate(q.title, this.#answers, this.#questions);
    if (q.type === "choice" || q.type === "multi") {
      const counts = r.counts ?? {};
      const known = new Set((q.options ?? []).map((o) => o.value));
      const otherCount = Object.entries(counts).filter(([k]) => !known.has(k)).reduce((s, [, c]) => s + c, 0);
      const mineList = (Array.isArray(a) ? a : [a]).map(String);
      const rows = (q.options ?? []).map((o) => ({ label: `${o.emoji ? `${o.emoji} ` : ""}${o.label}`, c: counts[o.value] ?? 0, on: mineList.includes(o.value) }));
      if (q.other && otherCount) rows.push({ label: L.other, c: otherCount, on: mineList.some((v) => !known.has(v)) });
      rows.sort((x, y) => y.c - x.c);
      body.push(h("ol", { class: "nx-survey__rbars" }, ...rows.map((x) => bar(x.label, x.c, r.n, x.on, n(x.c)))));
    } else if (q.type === "scale" && q.nps && r.nps) {
      const s = r.nps;
      const tot = s.promoters + s.passives + s.detractors || 1;
      body.push(
        h(
          "div",
          { class: "nx-survey__nps" },
          h("strong", { "data-tone": s.score >= 30 ? "good" : s.score >= 0 ? "ok" : "bad" }, `${s.score > 0 ? "+" : ""}${s.score}`),
          h("span", null, "NPS"),
          h(
            "div",
            { class: "nx-survey__npsbar", "aria-hidden": "true" },
            h("i", { "data-band": "d", style: `flex:${s.detractors / tot}` }),
            h("i", { "data-band": "n", style: `flex:${s.passives / tot}` }),
            h("i", { "data-band": "p", style: `flex:${s.promoters / tot}` }),
          ),
          h("small", null, `${L.you}: ${a}`),
        ),
      );
    } else if (q.type === "scale" || q.type === "rating") {
      const { min, max } = rangeOf(q);
      const counts = r.counts ?? {};
      const peak = Math.max(1, ...Object.values(counts));
      body.push(
        h("p", { class: "nx-survey__avg" }, L.average.replace("{avg}", r.avg !== undefined ? n(r.avg) : "—"), h("small", null, ` · ${L.you}: ${a}`)),
        h(
          "div",
          { class: "nx-survey__hist", "aria-hidden": "true" },
          ...Array.from({ length: max - min + 1 }, (_, i) => {
            const v = min + i;
            return h("span", { style: `--h:${(counts[v] ?? 0) / peak}`, "data-on": String(v) === String(a) ? "" : null, title: `${v}: ${counts[v] ?? 0}` }, h("b", { "data-face": q.icon === "face" ? "" : null }, q.type === "rating" && q.icon === "face" ? L.faces[Math.round((i / Math.max(1, max - min)) * (L.faces.length - 1))] : String(v)));
          }),
        ),
      );
    } else if (q.type === "slider") {
      const { min, max } = rangeOf(q);
      const pos = (v: number) => `${((v - min) / (max - min || 1)) * 100}%`;
      body.push(
        h(
          "div",
          { class: "nx-survey__line" },
          r.avg !== undefined ? h("span", { class: "nx-survey__pin", style: `--at:${pos(r.avg)}` }, L.average.replace("{avg}", this.#fmt(q, r.avg))) : null,
          h("span", { class: "nx-survey__pin nx-survey__pin--you", style: `--at:${pos(Number(a))}` }, `${L.you}: ${this.#fmt(q, Number(a))}`),
        ),
      );
    } else if (q.type === "rank" && r.ranks) {
      const mineOrder = Array.isArray(a) ? a : [];
      const rows = (q.options ?? []).filter((o) => r.ranks![o.value] !== undefined).sort((x, y) => r.ranks![x.value] - r.ranks![y.value]);
      body.push(
        h(
          "ol",
          { class: "nx-survey__rrank" },
          ...rows.map((o) => h("li", null, h("span", null, `${o.emoji ? `${o.emoji} ` : ""}${o.label}`), h("small", null, `${L.you}: ${mineOrder.indexOf(o.value) + 1}º`))),
        ),
      );
    } else if (q.type === "text" && r.words?.length) {
      const top = r.words[0][1];
      const said = new Set(((typeof a === "string" ? a.match(/[\p{L}\p{N}]{3,}/gu) : null) ?? []).map((w) => foldText(w)));
      body.push(h("p", { class: "nx-survey__words", "aria-label": L.words }, ...r.words.map(([w, c]) => h("span", { style: `--s:${0.8 + (c / top) * 0.9}`, "data-on": said.has(foldText(w)) ? "" : null, title: String(c) }, w))));
    }
    if (!body.length) return h("span");
    return h(
      "details",
      { class: "nx-survey__result", open },
      h("summary", null, h("span", { class: "nx-survey__result-q" }, title), h("span", { class: "nx-survey__result-a" }, this.#summary(q))),
      h("div", { class: "nx-survey__result-body" }, ...body),
    );
  }
}

