/**
 * `<nx-doc-capture>`: captura inteligente de documentos. El documento a la izquierda, un
 * formulario que se llena solo a la derecha. Cada dato trae su confianza y su evidencia: al pasar
 * sobre un campo se ilumina el recuadro del documento de donde salió (y al revés). Lo dudoso
 * (bajo `review-below`) se revisa con un clic; las validaciones cruzadas del backend avisan o
 * bloquean; nada se registra sin que una persona confirme.
 *
 * No sabe de OCR ni de modelos: pinta el protocolo de `types.ts`. Entradas: el usuario suelta un
 * archivo y se envía a `endpoint` (POST multipart, campo `file`); o la app llama a `extract()`, o
 * entrega los eventos con `begin()` / `push()` / `end()`.
 *
 * Las filas, las celdas y los recuadros son nodos persistentes que se actualizan en su lugar:
 * repintar por evento reiniciaría sus animaciones y robaría el foco a quien está corrigiendo.
 */
import { Base } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { formatElapsed } from "../../core/format";
import { resolveLocale } from "../../core/locale";
import { glyph } from "../../core/icons";
import { lineData, readLines } from "../../core/stream";
import "../button/index";
import type { NxButton } from "../button/button";
import { buildValues, confidenceTier, parseCaptureEvent } from "./logic";
import type { CaptureBox, CaptureEvent, CaptureField, CaptureLabels, CaptureSchemaItem, CaptureTable, CaptureValues, CheckStatus } from "./types";

export const CAPTURE_LABELS: CaptureLabels = {
  dropTitle: "Arrastra un documento",
  dropHint: "Factura, remisión o soporte · PDF o imagen",
  choose: "Elegir archivo",
  reading: "Leyendo el documento…",
  read: "{n} campos leídos en {t}",
  pending: "{n} por revisar",
  warnings: "{n} con aviso",
  ready: "Listo para registrar",
  submit: "Registrar",
  confirm: "Confirmar",
  confirmedByYou: "Confirmado por ti",
  use: "Usar {value}",
  checks: "Validaciones",
  error: "No se pudo leer el documento",
  again: "Leer otro",
  zoomIn: "Acercar",
  zoomOut: "Alejar",
};

const UPLOAD = '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>';
const OK = '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>';
const WARN = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
const ERR = '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const MINUS = '<path d="M5 12h14"/>';
const PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';
const ZOOMS = [1, 1.5, 2, 3];
const PROPS = ["schema", "endpoint", "action", "reviewBelow", "labels", "accept"] as const;

type State = "idle" | "reading" | "review" | "error";
type FieldState = { value: string; confidence: number; box?: CaptureBox; detail?: string; hint?: string; suggest?: string; confirmed: boolean };
type Check = { id: string; status: CheckStatus; message: string; fields: string[] };

let uid = 0;

/** Una imagen: rutas http(s) o relativas, y `blob:` / `data:image/…` para lo que genera el cliente. */
function safeSrc(src: string): string | undefined {
  return /^(blob:|data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,])/i.test(src) ? src : safeHref(src);
}

export class NxDocCapture extends Base {
  static observedAttributes = ["endpoint", "action", "review-below", "labels", "accept", "schema"];

  #schema: CaptureSchemaItem[] = [];
  #labels: CaptureLabels = CAPTURE_LABELS;
  #uid = `nx-cap${++uid}`;
  #state: State = "idle";
  #fileName = "";
  #pages = new Map<number, { src: string; width: number; height: number }>();
  #fields = new Map<string, FieldState>();
  #checks = new Map<string, Check>();
  #errorMsg = "";
  #start = 0;
  #elapsed = 0;
  #zoom = 0;
  #abort?: AbortController;
  #built = false;
  // Nodos persistentes.
  #drop?: HTMLDivElement;
  #main?: HTMLDivElement;
  #fileLabel?: HTMLSpanElement;
  #pagesEl?: HTMLDivElement;
  #pageEls = new Map<number, HTMLDivElement>();
  #boxEls = new Map<string, HTMLDivElement>();
  #statusEl?: HTMLDivElement;
  #formEl?: HTMLDivElement;
  #rowEls = new Map<string, HTMLDivElement>();
  #tableRows = new Map<string, HTMLDivElement>();
  #checksEl?: HTMLUListElement;
  #footMsg?: HTMLSpanElement;
  #submit?: NxButton;
  #live?: HTMLSpanElement;

  // ---------------------------------------------------------------- propiedades

  /** Qué se captura: campos (`{key,label,type?,section?}`) y tablas (`{key,label,type:"table",columns}`). */
  get schema(): CaptureSchemaItem[] {
    return this.#schema;
  }
  set schema(v: CaptureSchemaItem[] | null | undefined) {
    this.#schema = Array.isArray(v) ? v.filter((s) => s && typeof s.key === "string" && typeof s.label === "string") : [];
    if (this.#built && this.#state !== "idle") this.#buildForm();
  }
  /** URL que lee el documento: POST multipart (`file`) y responde con el protocolo en streaming. */
  get endpoint(): string | null {
    return this.getAttribute("endpoint");
  }
  set endpoint(v: string | null) {
    this.#attr("endpoint", v);
  }
  /** URL que registra lo capturado: POST JSON `{values, confirmed}`. Sin ella, solo `nx-capture-submit`. */
  get action(): string | null {
    return this.getAttribute("action");
  }
  set action(v: string | null) {
    this.#attr("action", v);
  }
  /** Confianza por debajo de la cual un campo exige revisión (0–1, por defecto 0,8). */
  get reviewBelow(): number {
    const n = Number(this.getAttribute("review-below"));
    return Number.isFinite(n) && n > 0 ? (n > 1 ? n / 100 : n) : 0.8;
  }
  set reviewBelow(v: number) {
    this.#attr("review-below", String(v));
  }
  /** Tipos de archivo del selector (por defecto PDF e imágenes). */
  get accept(): string {
    return this.getAttribute("accept") ?? "application/pdf,image/*";
  }
  set accept(v: string) {
    this.#attr("accept", v);
  }
  get labels(): CaptureLabels {
    return this.#labels;
  }
  set labels(v: Partial<CaptureLabels> | null | undefined) {
    this.#labels = { ...CAPTURE_LABELS, ...(v && typeof v === "object" ? v : {}) };
    if (this.#built) this.#paint();
  }
  get state(): State {
    return this.#state;
  }
  /** Lo capturado (con las correcciones de la persona), armado según el schema. */
  get values(): CaptureValues {
    return buildValues(this.#schema, new Map([...this.#fields].map(([k, f]) => [k, f.value])));
  }
  /** Campos que todavía exigen revisión. */
  get pending(): string[] {
    const t = this.reviewBelow;
    return [...this.#fields].filter(([, f]) => f.confidence < t && !f.confirmed).map(([k]) => k);
  }

  // ---------------------------------------------------------------- API

  /** Lee un archivo con `endpoint`. `nx-capture-file` (cancelable) deja a la app usar su transporte. */
  async extract(file: File): Promise<void> {
    const go = this.dispatchEvent(new CustomEvent("nx-capture-file", { detail: { file }, bubbles: true, composed: true, cancelable: true }));
    if (!go) return;
    const url = safeHref(this.endpoint);
    if (!url) return;
    this.begin(file.name);
    const ctrl = (this.#abort = new AbortController());
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(url, { method: "POST", body, signal: ctrl.signal, credentials: "same-origin", headers: { Accept: "application/x-ndjson, text/event-stream" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await readLines(res, (line) => {
        const ev = parseCaptureEvent(lineData(line));
        if (ev) this.push(ev);
      });
      this.end();
    } catch (err) {
      if (!ctrl.signal.aborted) this.push({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  /** Empieza una lectura nueva (transporte propio: después `push()` y `end()`). */
  begin(fileName = ""): void {
    this.#abort?.abort();
    this.#fileName = fileName;
    this.#pages.clear();
    this.#fields.clear();
    this.#checks.clear();
    this.#errorMsg = "";
    this.#zoom = 0;
    this.#start = performance.now();
    this.#state = "reading";
    this.#pageEls.clear();
    this.#boxEls.clear();
    this.#pagesEl?.replaceChildren(h("span", { class: "nx-cap__scan", "aria-hidden": "true" }));
    this.#buildForm();
    this.#checksEl?.replaceChildren();
    this.#formEl?.scrollTo?.({ top: 0 });
    this.dispatchEvent(new CustomEvent("nx-capture-start", { detail: { fileName }, bubbles: true, composed: true }));
    this.#paint();
  }

  push(ev: CaptureEvent): void {
    if (this.#state === "idle" || this.#state === "error") return;
    switch (ev.type) {
      case "page":
        this.#pages.set(ev.n, { src: ev.src, width: ev.width, height: ev.height });
        this.#paintPage(ev.n);
        break;
      case "field": {
        const prev = this.#fields.get(ev.key);
        this.#fields.set(ev.key, { value: ev.value, confidence: ev.confidence, box: ev.box, detail: ev.detail, hint: ev.hint, suggest: ev.suggest, confirmed: prev?.confirmed ?? false });
        this.#paintField(ev.key);
        break;
      }
      case "check":
        this.setCheck(ev);
        return;
      case "error":
        this.#errorMsg = ev.message;
        this.#state = "error";
        break;
      case "done":
        this.end();
        return;
    }
    this.#paint();
  }

  end(): void {
    if (this.#state !== "reading") return;
    this.#state = "review";
    this.#elapsed = performance.now() - this.#start;
    this.#paint();
    this.dispatchEvent(new CustomEvent("nx-capture-done", { detail: { values: this.values, pending: this.pending }, bubbles: true, composed: true }));
  }

  /** Agrega o reemplaza una validación (p. ej. la app recalcula tras una corrección). */
  setCheck(check: { id: string; status: CheckStatus; message: string; fields?: string[] }): void {
    this.#checks.set(check.id, { ...check, fields: check.fields ?? [] });
    this.#paintChecks();
    this.#paint();
  }

  /** Vuelve a la zona para soltar un documento. */
  reset(): void {
    this.#abort?.abort();
    this.#state = "idle";
    this.#paint();
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
    this.#abort?.abort();
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if ((name === "labels" || name === "schema") && value !== null) {
      try {
        (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
      } catch {
        console.warn(`[nx-doc-capture] el atributo "${name}" no es JSON válido`);
      }
      return;
    }
    if (this.#built) this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }
  #fmt(template: string, vars: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
  }

  #build(): void {
    this.#built = true;
    const input = h("input", { type: "file", class: "nx-sr-only", tabindex: "-1", "aria-label": this.#labels.choose });
    const chooseBtn = h("button", { type: "button", class: "nx-cap__choose" });
    this.#drop = h("div", { class: "nx-cap__drop" }, glyph(UPLOAD, "nx-cap__drop-icon"), h("p", { class: "nx-cap__drop-title" }), h("p", { class: "nx-cap__drop-hint" }), chooseBtn, input);
    chooseBtn.addEventListener("click", () => {
      input.accept = this.accept;
      input.click();
    });
    input.addEventListener("change", () => {
      const f = input.files?.[0];
      input.value = "";
      if (f) void this.extract(f);
    });
    this.addEventListener("dragover", (e) => {
      if (this.#state !== "reading" && e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
        this.#drop!.classList.add("is-over");
      }
    });
    this.addEventListener("dragleave", () => this.#drop!.classList.remove("is-over"));
    this.addEventListener("drop", (e) => {
      this.#drop!.classList.remove("is-over");
      const f = e.dataTransfer?.files?.[0];
      if (!f || this.#state === "reading") return;
      e.preventDefault();
      void this.extract(f);
    });

    // Visor.
    this.#fileLabel = h("span", { class: "nx-cap__file" });
    const zoomOut = h("button", { type: "button", class: "nx-cap__icon", "data-zoom": "-1" }, glyph(MINUS));
    const zoomIn = h("button", { type: "button", class: "nx-cap__icon", "data-zoom": "1" }, glyph(PLUS));
    this.#pagesEl = h("div", { class: "nx-cap__pages" });
    const viewer = h("section", { class: "nx-cap__viewer" }, h("div", { class: "nx-cap__bar" }, this.#fileLabel, h("span", { class: "nx-cap__zoom" }, zoomOut, zoomIn)), h("div", { class: "nx-cap__scroll" }, this.#pagesEl));
    viewer.addEventListener("click", (e) => {
      const z = (e.target as Element).closest<HTMLElement>("[data-zoom]");
      if (!z) return;
      this.#zoom = Math.min(ZOOMS.length - 1, Math.max(0, this.#zoom + Number(z.dataset.zoom)));
      this.#pagesEl!.style.setProperty("--_zoom", String(ZOOMS[this.#zoom]));
    });

    // Formulario.
    this.#statusEl = h("div", { class: "nx-cap__status" });
    this.#formEl = h("div", { class: "nx-cap__form" });
    this.#checksEl = h("ul", { class: "nx-cap__checks" });
    this.#footMsg = h("span", { class: "nx-cap__foot-msg" });
    this.#submit = document.createElement("nx-button") as NxButton;
    this.#submit.variant = "primary";
    this.#submit.logMode = "none";
    const again = h("button", { type: "button", class: "nx-cap__again" });
    again.addEventListener("click", () => this.reset());
    // Las validaciones van dentro del área con scroll, después de los campos (#buildForm).
    const side = h("section", { class: "nx-cap__side" }, this.#statusEl, this.#formEl, h("div", { class: "nx-cap__foot" }, this.#footMsg, again, this.#submit));
    this.#submit.addEventListener("click", () => void this.#onSubmit());

    this.#main = h("div", { class: "nx-cap__main", hidden: true }, viewer, side);
    this.#live = h("span", { class: "nx-sr-only", role: "status" });
    this.append(this.#drop, this.#main, this.#live);

    // Evidencia: campo ⇄ recuadro, con el mouse o con el foco.
    const link = (e: Event, on: boolean) => {
      const el = (e.target as Element).closest<HTMLElement>("[data-key], [data-row], [data-check]");
      if (!el || !this.contains(el)) return;
      const keys = el.dataset.check
        ? (this.#checks.get(el.dataset.check)?.fields ?? [])
        : el.dataset.row
          ? [...this.#fields.keys()].filter((k) => k.startsWith(`${el.dataset.row}.`))
          : [el.dataset.key!];
      this.#light(keys, on);
    };
    this.addEventListener("pointerover", (e) => link(e, true));
    this.addEventListener("pointerout", (e) => link(e, false));
    this.addEventListener("focusin", (e) => link(e, true));
    this.addEventListener("focusout", (e) => link(e, false));
  }

  /**
   * Ilumina campos y recuadros, y lleva a la vista el lado que no se ve (con zoom, el recuadro
   * puede quedar fuera del visor). Solo si no se ve: mover el mouse no hace saltar nada.
   */
  #light(keys: string[], on: boolean): void {
    keys.forEach((k, i) => {
      const box = this.#boxEls.get(k);
      box?.classList.toggle("is-lit", on);
      // En el formulario: los recuadros del visor también llevan `data-key`.
      const row = this.#rowEls.get(k) ?? this.#formEl!.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]`);
      row?.classList.toggle("is-lit", on);
      if (on && i === 0) {
        for (const el of [box, row]) if (el && !this.#visible(el)) el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    });
  }

  /** Si el elemento se ve entero dentro de su área con scroll (visor o formulario). */
  #visible(el: HTMLElement): boolean {
    const area = el.closest<HTMLElement>(".nx-cap__scroll, .nx-cap__form");
    if (!area) return true;
    const a = area.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return r.top >= a.top && r.bottom <= a.bottom && r.left >= a.left && r.right <= a.right;
  }

  /**
   * Las filas del formulario, una por campo del schema, ocultas hasta que llega su dato. Cada
   * sección es un grupo que aparece con su primer campo (sin títulos huérfanos mientras se lee).
   */
  #buildForm(): void {
    if (!this.#formEl) return;
    this.#rowEls.clear();
    this.#tableRows.clear();
    let section: string | undefined;
    let group: HTMLDivElement | null = null;
    const nodes: Node[] = [];
    const add = (n: Node) => (group ? group.append(n) : nodes.push(n));
    for (const item of this.#schema) {
      if (item.section && item.section !== section) {
        group = h("div", { class: "nx-cap__group", hidden: true }, h("p", { class: "nx-cap__section" }, item.section));
        nodes.push(group);
      }
      section = item.section ?? section;
      if (item.type === "table") {
        const t = item as CaptureTable;
        const body = h("div", { class: "nx-cap__tbody" });
        this.#tableRows.set(t.key, body);
        add(
          h(
            "div",
            // La primera columna (la descripción) pesa el doble; al final, el botón de confirmar la fila.
            { class: "nx-cap__table", "data-table": t.key, hidden: true, style: `--_grid: minmax(0, 2fr) repeat(${Math.max(1, t.columns.length - 1)}, minmax(0, 1fr)) 26px` },
            h("p", { class: "nx-cap__table-title" }, t.label),
            h("div", { class: "nx-cap__thead" }, ...t.columns.map((c) => h("span", { class: c.type === "number" || c.type === "money" ? "is-num" : null }, c.label)), h("span", null)),
            body,
          ),
        );
      } else add(this.#fieldRow(item as CaptureField));
    }
    this.#formEl.replaceChildren(...nodes, this.#checksEl!);
  }

  #fieldRow(f: CaptureField): HTMLDivElement {
    const id = `${this.#uid}-${f.key}`;
    const input = h("input", { id, class: "nx-cap__input", type: "text", "data-key": f.key, inputmode: f.type === "number" || f.type === "money" ? "decimal" : null });
    input.addEventListener("change", () => this.#edit(f.key, input.value));
    const row = h(
      "div",
      { class: "nx-cap__field", "data-key": f.key, hidden: true },
      h("label", { for: id }, f.label),
      input,
      h("span", { class: "nx-cap__conf" }),
      h("div", { class: "nx-cap__note" }),
    );
    row.addEventListener("click", (e) => this.#onNoteClick(e, f.key));
    this.#rowEls.set(f.key, row);
    return row;
  }

  #onNoteClick(e: Event, key: string): void {
    const b = (e.target as Element).closest<HTMLElement>("[data-use], [data-ok]");
    if (!b) return;
    const f = this.#fields.get(key);
    if (!f) return;
    if (b.dataset.use !== undefined) this.#edit(key, f.suggest ?? f.value);
    else this.#edit(key, f.value);
  }

  /** Una corrección o confirmación de la persona. */
  #edit(key: string, value: string): void {
    const f = this.#fields.get(key);
    if (!f) return;
    f.value = value;
    f.confirmed = true;
    this.#paintField(key);
    this.#paint();
    this.dispatchEvent(new CustomEvent("nx-capture-change", { detail: { key, value, values: this.values }, bubbles: true, composed: true }));
  }

  #paintPage(n: number): void {
    const p = this.#pages.get(n)!;
    let el = this.#pageEls.get(n);
    if (!el) {
      el = h("div", { class: "nx-cap__page", "data-page": n });
      // En orden de página, aunque lleguen desordenadas.
      const after = [...this.#pageEls.entries()].filter(([k]) => k < n).sort((a, b) => b[0] - a[0])[0]?.[1];
      if (after) after.after(el);
      else this.#pagesEl!.prepend(el);
      this.#pageEls.set(n, el);
    }
    el.style.aspectRatio = `${p.width} / ${p.height}`;
    const src = safeSrc(p.src);
    const img = el.querySelector("img") ?? el.appendChild(h("img", { alt: "", draggable: "false" }));
    if (src && img.getAttribute("src") !== src) img.setAttribute("src", src);
    // Recuadros que llegaron antes que su página.
    for (const [k, f] of this.#fields) if (f.box?.page === n) this.#paintBox(k);
  }

  #paintBox(key: string): void {
    const f = this.#fields.get(key);
    if (!f?.box) return;
    const page = this.#pageEls.get(f.box.page);
    if (!page) return;
    let box = this.#boxEls.get(key);
    if (!box) {
      box = h("div", { class: "nx-cap__box", "data-key": key });
      this.#boxEls.set(key, box);
    }
    if (box.parentNode !== page) page.append(box);
    Object.assign(box.style, { left: `${f.box.x * 100}%`, top: `${f.box.y * 100}%`, width: `${f.box.w * 100}%`, height: `${f.box.h * 100}%` });
    box.dataset.tier = f.confirmed ? "you" : confidenceTier(f.confidence, this.reviewBelow);
  }

  /** Pinta un campo (o una celda) en su lugar. */
  #paintField(key: string): void {
    const f = this.#fields.get(key)!;
    this.#paintBox(key);
    const tier = f.confirmed ? "you" : confidenceTier(f.confidence, this.reviewBelow);
    const pct = `${Math.round(f.confidence * 100)} %`;

    const row = this.#rowEls.get(key);
    if (row) {
      row.hidden = false;
      row.closest<HTMLElement>(".nx-cap__group")?.removeAttribute("hidden");
      row.dataset.tier = tier;
      const input = row.querySelector<HTMLInputElement>("input")!;
      if (document.activeElement !== input) input.value = f.value;
      const conf = row.querySelector<HTMLElement>(".nx-cap__conf")!;
      conf.textContent = f.confirmed ? "✓" : pct;
      conf.title = f.confirmed ? this.#labels.confirmedByYou : pct;
      const note = row.querySelector<HTMLElement>(".nx-cap__note")!;
      if (f.confirmed) note.replaceChildren(glyph(CHECK), this.#labels.confirmedByYou);
      else if (tier === "low")
        note.replaceChildren(
          f.hint ?? "",
          f.suggest ? h("button", { type: "button", class: "nx-cap__use", "data-use": "" }, this.#fmt(this.#labels.use, { value: f.suggest })) : "",
          h("button", { type: "button", class: "nx-cap__ok", "data-ok": "", title: this.#labels.confirm, "aria-label": this.#labels.confirm }, glyph(CHECK)),
        );
      else note.replaceChildren(f.detail ?? "");
      note.hidden = !note.childNodes.length || note.textContent === "";
      if (f.confirmed || tier === "low") note.hidden = false;
      return;
    }

    // Una celda de tabla: `tabla.fila.columna`.
    const m = /^(.*)\.(\d+)\.([^.]+)$/.exec(key);
    const table = m && (this.#schema.find((s) => s.type === "table" && s.key === m[1]) as CaptureTable | undefined);
    if (!m || !table) return;
    const body = this.#tableRows.get(table.key)!;
    body.parentElement!.hidden = false;
    body.closest<HTMLElement>(".nx-cap__group")?.removeAttribute("hidden");
    const rowKey = `${m[1]}.${m[2]}`;
    let tr = body.querySelector<HTMLDivElement>(`[data-row="${CSS.escape(rowKey)}"]`);
    if (!tr) {
      tr = h("div", { class: "nx-cap__tr", "data-row": rowKey });
      for (const c of table.columns) {
        const k = `${rowKey}.${c.key}`;
        const cell = h("input", { class: c.type === "number" || c.type === "money" ? "nx-cap__cell is-num" : "nx-cap__cell", type: "text", "data-key": k, "aria-label": c.label, inputmode: c.type === "number" || c.type === "money" ? "decimal" : null });
        cell.addEventListener("change", () => this.#edit(k, cell.value));
        tr.append(cell);
      }
      const ok = h("button", { type: "button", class: "nx-cap__ok", title: this.#labels.confirm, "aria-label": this.#labels.confirm, hidden: true }, glyph(CHECK));
      ok.addEventListener("click", () => {
        for (const k of [...this.#fields.keys()].filter((x) => x.startsWith(`${rowKey}.`))) if (!this.#fields.get(k)!.confirmed) this.#edit(k, this.#fields.get(k)!.value);
      });
      tr.append(ok);
      // Filas en orden de índice.
      const next = [...body.children].find((r) => Number((r as HTMLElement).dataset.row!.split(".").pop()) > Number(m[2]));
      body.insertBefore(tr, next ?? null);
    }
    const cell = tr.querySelector<HTMLInputElement>(`[data-key="${CSS.escape(key)}"]`);
    if (cell) {
      if (document.activeElement !== cell) cell.value = f.value;
      cell.dataset.tier = tier;
      cell.title = f.hint ?? (f.confirmed ? this.#labels.confirmedByYou : pct);
    }
    const low = [...tr.querySelectorAll<HTMLElement>(".nx-cap__cell")].some((c) => c.dataset.tier === "low");
    tr.querySelector<HTMLElement>(".nx-cap__ok")!.hidden = !low;
  }

  #paintChecks(): void {
    const icons = { ok: OK, warn: WARN, error: ERR };
    this.#checksEl!.replaceChildren(
      ...(this.#checks.size ? [h("li", { class: "nx-cap__checks-title" }, this.#labels.checks)] : []),
      ...[...this.#checks.values()].map((c) => h("li", { class: `nx-cap__check nx-cap__check--${c.status}`, "data-check": c.id, tabindex: c.fields.length ? "0" : null }, glyph(icons[c.status]), h("span", null, c.message))),
    );
  }

  /** Estado general: zona de soltar o lectura, barra de estado y pie. */
  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const st = this.#state;
    this.dataset.state = st;
    this.#drop!.hidden = st !== "idle";
    this.#main!.hidden = st === "idle";
    const [title, hint, choose] = [...this.#drop!.children].slice(1, 4) as HTMLElement[];
    title.textContent = L.dropTitle;
    hint.textContent = L.dropHint;
    choose.textContent = L.choose;
    if (st === "idle") return;

    this.#fileLabel!.textContent = this.#fileName;
    const [zOut, zIn] = this.querySelectorAll<HTMLButtonElement>("[data-zoom]");
    zOut.setAttribute("aria-label", L.zoomOut);
    zIn.setAttribute("aria-label", L.zoomIn);
    this.#pagesEl!.classList.toggle("is-reading", st === "reading");

    const pending = this.pending;
    const errors = [...this.#checks.values()].filter((c) => c.status === "error");
    const warns = [...this.#checks.values()].filter((c) => c.status === "warn").length;
    const n = this.#fields.size;
    this.#statusEl!.replaceChildren(
      st === "reading" ? h("span", { class: "nx-spinner" }) : glyph(st === "error" ? ERR : OK),
      h(
        "span",
        null,
        st === "reading" ? `${L.reading} ${n}` : st === "error" ? (this.#errorMsg ? `${L.error}: ${this.#errorMsg}` : L.error) : this.#fmt(L.read, { n, t: formatElapsed(this.#elapsed, resolveLocale(this)) }),
      ),
    );
    this.#statusEl!.dataset.state = st;

    const blocked = st !== "review" || pending.length > 0 || errors.length > 0;
    this.#footMsg!.dataset.tone = st === "review" && !blocked ? "ok" : "warn";
    const warnText = warns ? ` · ${this.#fmt(L.warnings, { n: warns })}` : "";
    this.#footMsg!.textContent =
      st !== "review" ? "" : errors.length ? errors[0].message : pending.length ? this.#fmt(L.pending, { n: pending.length }) + warnText : L.ready + warnText;
    this.#submit!.label = L.submit;
    this.#submit!.disabled = blocked;
    const again = this.querySelector<HTMLElement>(".nx-cap__again")!;
    again.textContent = L.again;
    again.hidden = st === "reading";
    if (this.#live && st !== "reading") this.#live.textContent = this.#statusEl!.textContent ?? "";
  }

  async #onSubmit(): Promise<void> {
    if (this.#submit!.disabled || this.#submit!.busy) return;
    const detail = {
      values: this.values,
      confirmed: [...this.#fields].filter(([, f]) => f.confirmed).map(([k]) => k),
      checks: [...this.#checks.values()].map(({ id, status, message }) => ({ id, status, message })),
    };
    const go = this.dispatchEvent(new CustomEvent("nx-capture-submit", { detail, bubbles: true, composed: true, cancelable: true }));
    const url = safeHref(this.action);
    if (!go || !url) return;
    await this.#submit!.run(async () => {
      const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values: detail.values, confirmed: detail.confirmed }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    });
  }
}
