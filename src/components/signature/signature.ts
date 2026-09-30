/**
 * `<nx-signature>`: firma a mano para recibidos, entregas, actas y autorizaciones. Con mouse, lápiz
 * o dedo (Pointer Events, eventos coalescidos, `touch-action: none`), un trazo que se ve como tinta
 * (más fino cuanto más rápido, más grueso con más presión del lápiz, curvas suavizadas, nítido con
 * cualquier `devicePixelRatio`) y una zona de firma siempre clara: una firma se archiva sobre papel.
 *
 * El SVG es la fuente de verdad (un `<path>` por trazo, recortado a lo firmado): `toSVG()`, `toPNG()`
 * y el valor del <form> salen de él. «Deshacer» (también Ctrl/⌘+Z), «Borrar», «Escribir mi nombre»
 * (la firma tipográfica, el camino por teclado), nombre y cédula de quien firma (`ask-name`,
 * `ask-id`), la huella SHA-256 de lo firmado (`document`) y, con `handoff`, «Firmar en el celular»
 * con `<nx-handoff kind="signature">` (se carga aparte, al pedirlo).
 */
import { Base, boolAttr, upgrade } from "../../core/define";
import { mergeLabels } from "../../core/labels";
import { resolveLocale } from "../../core/locale";
import {
  cleanInk,
  cleanSignatureMeta,
  parseSignatureValue,
  signatureCheck,
  signatureDate,
  signatureHash,
  signaturePath,
  signatureSVG,
  smoothSignaturePoints,
  strokeWidths,
  typedSignatureSVG,
} from "./logic";
import type { SignatureDevice, SignatureFormat, SignatureGeo, SignatureLabels, SignatureMeta, SignatureStroke, SignatureValue } from "./types";

export const SIGNATURE_LABELS: SignatureLabels = {
  here: "Firme aquí",
  pad: "Zona de firma, vacía",
  padSigned: "Zona de firma, con firma",
  undo: "Deshacer",
  clear: "Borrar",
  type: "Escribir mi nombre",
  draw: "Firmar a mano",
  typed: "Nombre como firma",
  name: "Nombre de quien firma",
  id: "Cédula",
  confirm: "Firmar",
  again: "Volver a firmar",
  signedAt: "Firmado el {date}",
  phone: "Firmar en el celular",
  required: "Falta la firma",
  short: "La firma es muy corta: firme como en un documento",
  nameRequired: "Falta el nombre",
  idRequired: "Falta la cédula",
};

/** Tope de espera de la ubicación (`geo`). */
const GEO_MS = 6000;
/** Con `auto`, cuánto se espera sin trazos para dar la firma por hecha. */
const AUTO_MS = 900;
/** Lo que se usa de un `<nx-handoff>` de la página. */
type Handoff = HTMLElement & { start(): void };
type Action = "undo" | "clear" | "type" | "phone" | "confirm" | "again";

/** Atributos de texto y booleanos: la propiedad en camelCase refleja el atributo (`askName` ↔ `ask-name`). */
const STR = ["name", "document", "valueFormat", "handoff", "penColor", "locale"];
const BOOL = ["required", "readonly", "disabled", "askName", "askId", "geo", "auto"];
const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const btn = (a: Action) => `<button type="button" class="nx-sig__btn" data-a="${a}" data-l="${a}"></button>`;
const field = (l: string, attrs: string) => `<label class="nx-sig__field"><span data-l="${l}"></span><input ${attrs}></label>`;
// El marcado es SIEMPRE esta constante: los textos (que pueden venir de `labels`) van con `textContent`.
const TPL =
  `<div class="nx-sig__fields">${field("name", 'autocomplete="name"')}${field("id", 'autocomplete="off" inputmode="numeric"')}</div>` +
  `<div class="nx-sig__pad"><div class="nx-sig__line" aria-hidden="true"><span class="nx-sig__x">×</span><span data-l="here"></span></div>` +
  `<img class="nx-sig__img" alt="" hidden><canvas class="nx-sig__canvas" role="img"></canvas></div>` +
  `${field("typed", 'autocomplete="off" spellcheck="false"')}` +
  `<div class="nx-sig__bar">${btn("undo")}${btn("clear")}${btn("type")}${btn("phone")}<span class="nx-sig__gap"></span>${btn("confirm")}</div>` +
  `<p class="nx-sig__stamp" hidden><span></span>${btn("again")}</p><p class="nx-sig__msg" role="status"></p><div class="nx-sig__ho"></div>`;

export class NxSignature extends Base {
  static formAssociated = true;
  static observedAttributes = ["labels", "value", "height", ...STR.concat(BOOL).map(kebab)];

  #internals: ElementInternals | null = null;
  #labels = SIGNATURE_LABELS;
  #strokes: SignatureStroke[] = [];
  #cur: SignatureStroke | null = null;
  #pid = -1;
  #rect: DOMRect | null = null;
  #typed = false;
  #loaded: SignatureValue | null = null;
  /** Los metadatos de la firma confirmada (o cargada): con fecha, huella y ubicación. */
  #meta: SignatureMeta | null = null;
  #frozen = false;
  #device: SignatureDevice = "pointer";
  /** Cuándo cambió la firma por última vez (la fecha de una firma sin confirmar). */
  #at = "";
  #formOff = false;
  #geo: Promise<SignatureGeo | undefined> | null = null;
  #paths = new WeakMap<SignatureStroke, Path2D>();
  #raf = 0;
  #auto = 0;
  #png = 0;
  #ro?: ResizeObserver;
  #built = false;
  // Nodos: la zona, el canvas, la imagen (firma escrita o cargada), nombre/cédula/firma escrita y los botones.
  #pad!: HTMLDivElement;
  #canvas!: HTMLCanvasElement;
  #img!: HTMLImageElement;
  #in!: HTMLInputElement[];
  #b = {} as Record<Action, HTMLButtonElement>;

  constructor() {
    super();
    // Sin DOM (SSR) o sin form-associated: funciona igual, sin el <form>.
    try {
      this.#internals = (this as HTMLElement).attachInternals?.() ?? null;
    } catch {
      this.#internals = null;
    }
  }

  // ---------------------------------------------------------------- propiedades

  declare name: string | null;
  /** El texto que se firma, o el `id` de un elemento cuyo `textContent` se firma: con él sale la huella (`meta.hash`). */
  declare document: string | null;
  /** Lo que recibe el <form>: `json` (por defecto, `{svg, meta}`), `svg` o `png` (un archivo). */
  declare valueFormat: SignatureFormat | null;
  /** La base de las rutas de `<nx-handoff>` (`/api/handoff`): muestra «Firmar en el celular». */
  declare handoff: string | null;
  declare penColor: string | null;
  declare locale: string | null;
  declare required: boolean;
  declare readonly: boolean;
  declare disabled: boolean;
  declare askName: boolean;
  declare askId: boolean;
  declare geo: boolean;
  declare auto: boolean;

  /** Alto de la zona de firma en px (100–600; 180 por defecto). */
  get height(): number {
    const n = Number(this.getAttribute("height"));
    return n > 0 ? Math.min(600, Math.max(100, n)) : 180;
  }
  set height(v: number | string | null) {
    this.#attr("height", v);
  }
  get labels(): SignatureLabels {
    return this.#labels;
  }
  set labels(v: Partial<SignatureLabels> | null | undefined) {
    this.#labels = mergeLabels(SIGNATURE_LABELS, v);
    this.#paint();
  }
  /** La firma (`{svg, meta}`) o `null`. Asignar un JSON o un SVG la muestra (como `load()`, pero sin `nx-signature-done`: mostrar una firma guardada no es firmar). */
  get value(): SignatureValue | null {
    return this.isEmpty() ? null : { svg: this.toSVG(), meta: this.#meta ?? this.#metaNow(this.#at) };
  }
  set value(v: SignatureValue | string | null | undefined) {
    // Vacío borra (si había algo: un framework que pasa `undefined` al montar no emite nada).
    if (v === null || v === undefined || v === "") {
      if (!this.isEmpty()) this.clear();
    } else this.#load(v, false);
  }
  /** Los trazos dibujados aquí (puntos x, y, t, presión; no se modifican). Vacío en una firma escrita o cargada. */
  get strokes(): readonly SignatureStroke[] {
    return this.#typed || this.#loaded ? [] : this.#strokes.slice();
  }
  /** Si vale para el <form> (`required`: firma de verdad, y nombre y cédula si se piden). */
  checkValidity(): boolean {
    return this.#internals?.checkValidity() ?? !this.#problem();
  }

  // ---------------------------------------------------------------- API

  isEmpty(): boolean {
    return !this.#loaded && (this.#typed ? !this.#in[2].value.trim() : !this.#strokes.length);
  }

  /** El SVG de la firma (`""` si no hay): los trazos recortados, el nombre escrito o el que se cargó. */
  toSVG(): string {
    const ink = cleanInk(this.penColor);
    return this.#loaded ? this.#loaded.svg : this.#typed ? typedSignatureSVG(this.#in[2].value, ink) : signatureSVG(this.#strokes, ink);
  }

  /** El PNG (fondo transparente) a `scale` veces el tamaño del SVG, pintado desde el SVG. `null` si no hay firma o el navegador no puede. */
  async toPNG(scale = 2): Promise<Blob | null> {
    const svg = this.toSVG();
    const m = parseSignatureValue(svg)?.meta;
    const k = Math.min(8, Math.max(0.1, Number(scale) || 2));
    return m?.width ? (await import("./signature-extras")).svgToPng(svg, Math.round(m.width * k), Math.round(m.height * k)) : null;
  }

  /** Borra todo: trazos, nombre escrito y firma cargada. */
  clear(): void {
    this.#strokes = [];
    this.#loaded = null;
    if (this.#built) this.#in[2].value = "";
    this.#changed();
  }

  /** Quita el último trazo. */
  undo(): void {
    if (this.#strokes.length && this.#canDraw()) {
      this.#strokes.pop();
      this.#changed();
    }
  }

  /**
   * Pone una firma hecha en otra parte: `{svg, meta}` (objeto o JSON) o el SVG. Queda confirmada
   * («Volver a firmar» la reabre) y, si no es `readonly`, emite `nx-signature-done` (así llega la del
   * celular). Devuelve `false` si el valor no sirve (un SVG con scripts, por ejemplo).
   */
  load(value: unknown): boolean {
    return this.#load(value, !this.readonly);
  }

  #load(value: unknown, emit: boolean): boolean {
    const v = parseSignatureValue(value);
    if (!v) return false;
    this.#build();
    this.#strokes = [];
    this.#typed = false;
    this.#loaded = v;
    if (v.meta.name) this.#in[0].value = v.meta.name;
    if (v.meta.id) this.#in[1].value = v.meta.id;
    this.#changed(true);
    void this.#done({ ...v.meta }, emit);
    return true;
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    this.#build();
    if (typeof ResizeObserver === "function") (this.#ro ??= new ResizeObserver(() => this.#resize())).observe(this.#pad);
    this.#resize();
    this.#paint();
    // Un <nx-handoff for="…"> que viene después en el documento ya existe en el siguiente turno.
    queueMicrotask(() => this.#paint());
  }

  disconnectedCallback(): void {
    this.#ro?.disconnect();
    cancelAnimationFrame(this.#raf);
    clearTimeout(this.#auto);
    this.#raf = this.#auto = 0;
    this.#cur = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "value") {
      this.value = value;
    } else if (name === "labels") {
      try {
        this.labels = value === null ? null : JSON.parse(value);
      } catch {
        console.warn('[nx-signature] el atributo "labels" no es JSON válido');
      }
    } else {
      if (name === "pen-color") this.#paths = new WeakMap();
      this.#paint();
      this.#draw();
    }
  }

  formResetCallback(): void {
    this.#build();
    this.#in[0].value = this.#in[1].value = "";
    this.clear();
  }
  formDisabledCallback(disabled: boolean): void {
    this.#formOff = disabled;
    this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: unknown): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, String(v));
  }

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  /** Algo cambió en la firma: los metadatos confirmados ya no valen, se repinta, se avisa. */
  #changed(keep = false): void {
    if (!keep) {
      this.#at = new Date().toISOString();
      this.#meta = null;
      this.#frozen = false;
    }
    this.#say("");
    this.#paint();
    this.#draw();
    this.#emit("nx-signature-change", { empty: this.isEmpty() });
    clearTimeout(this.#auto);
    if (this.auto && !keep && !this.#problem(true)) this.#auto = window.setTimeout(() => void this.#confirm(), AUTO_MS);
  }

  /** Lo que falta para que valga. `strict`: al confirmar (sin `required`, igual se exige una firma de verdad). */
  #problem(strict = this.required): string {
    const L = this.#labels;
    const [name, id, typed] = this.#in ?? [];
    return !strict
      ? ""
      : this.isEmpty()
        ? L.required
        : (this.#typed ? typed.value.trim().length < 2 : !this.#loaded && signatureCheck(this.#strokes))
          ? L.short
          : this.askName && !name.value.trim()
            ? L.nameRequired
            : this.askId && !id.value.trim()
              ? L.idRequired
              : "";
  }

  /** Los metadatos de lo que hay ahora (sin huella ni ubicación). */
  #metaNow(signedAt: string): SignatureMeta {
    const svg = this.toSVG();
    const typed = this.#typed;
    const m = this.#loaded
      ? { ...this.#loaded.meta }
      : {
          ...parseSignatureValue(svg)?.meta,
          signedAt,
          typed,
          strokes: typed ? 0 : this.#strokes.length,
          points: typed ? 0 : this.#strokes.reduce((n, s) => n + s.points.length, 0),
          device: typed ? "pointer" : this.#device,
        };
    const [name, id] = this.#in.map((i) => i.value.trim());
    return cleanSignatureMeta({ ...m, name: name || m.name, id: id || m.id });
  }

  /** «Firmar»: valida, pone fecha, huella y ubicación, congela y emite `nx-signature-done`. */
  async #confirm(): Promise<void> {
    const bad = this.#problem(true);
    if (bad) return this.#say(bad);
    const meta = this.#metaNow(new Date().toISOString());
    const geo = await this.#geo;
    if (geo) meta.geo = geo;
    this.#frozen = !this.auto;
    const inside = this.contains(document.activeElement);
    await this.#done(meta);
    if (inside && this.#frozen) this.#b.again.focus();
  }

  /** Cierra una firma: la huella (si hay `document` y no la trae), el <form>, el sello y el evento. */
  async #done(meta: SignatureMeta, emit = true): Promise<void> {
    const d = this.document;
    if (d && !meta.hash && meta.signedAt) {
      // El texto firmado: el `textContent` del elemento con ese id, o el atributo tal cual.
      const el = (this.getRootNode() as Document).getElementById?.(d) ?? document.getElementById(d);
      meta.hash = await signatureHash(el ? (el.textContent ?? "") : d, meta.signedAt).catch(() => undefined);
    }
    this.#meta = cleanSignatureMeta(meta);
    this.#paint();
    if (emit) this.#emit("nx-signature-done", { svg: this.toSVG(), meta: this.#meta });
  }

  #say(text: string): void {
    if (this.#built) this.querySelector(".nx-sig__msg")!.textContent = text;
  }

  #off(): boolean {
    return this.disabled || this.#formOff;
  }

  #canDraw(): boolean {
    return !this.#frozen && !this.#typed && !this.#loaded && !this.readonly && !this.#off();
  }

  #build(): void {
    if (this.#built) return;
    this.#built = true;
    this.innerHTML = TPL;
    this.#pad = this.querySelector(".nx-sig__pad")!;
    this.#canvas = this.querySelector("canvas")!;
    this.#img = this.querySelector("img")!;
    this.#in = [...this.querySelectorAll("input")];
    this.#in[2].parentElement!.classList.add("nx-sig__typed");
    for (const b of this.querySelectorAll("button")) this.#b[b.dataset.a as Action] = b;
    const [name, id, typed] = this.#in;

    this.addEventListener("click", (e) => {
      const a = (e.target as Element).closest?.("[data-a]") as HTMLElement | null;
      switch (a?.dataset.a) {
        case "undo":
          return this.undo();
        case "clear":
          return this.clear();
        case "confirm":
          return void this.#confirm();
        case "phone":
          return this.#phone();
        case "again":
          this.clear();
          return (this.#typed ? typed : this.#b.type).focus();
        case "type":
          this.#typed = !this.#typed;
          this.#loaded = null;
          if (this.#typed && !typed.value) typed.value = name.value;
          this.#changed();
          if (this.#typed) typed.focus();
      }
    });
    typed.oninput = () => this.#changed();
    name.oninput = id.oninput = () => {
      this.#say("");
      this.#sync();
    };
    this.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !(e.target instanceof HTMLInputElement) && this.#strokes.length && this.#canDraw()) {
        e.preventDefault();
        this.undo();
      }
    });

    const c = this.#canvas;
    const point = (e: PointerEvent) => {
      const r = this.#rect!;
      this.#cur!.points.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp, p: e.pointerType === "pen" ? e.pressure : 0.5 });
    };
    c.addEventListener("pointerdown", (e) => {
      if (!this.#canDraw() || e.button > 0 || this.#cur) return;
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* happy-dom, o el puntero ya se soltó */
      }
      this.#pid = e.pointerId;
      this.#rect = c.getBoundingClientRect();
      this.#device = (/^(touch|pen|mouse)$/.test(e.pointerType) ? e.pointerType : "pointer") as SignatureDevice;
      this.#cur = { type: this.#device, points: [] };
      point(e);
      if (this.geo) this.#geo ??= import("./signature-extras").then((m) => m.locate(GEO_MS));
      this.#draw();
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.#cur || e.pointerId !== this.#pid) return;
      const list = e.getCoalescedEvents?.() ?? [];
      for (const ev of list.length ? list : [e]) point(ev);
      this.#draw();
    });
    const end = (e: PointerEvent) => {
      const s = this.#cur;
      if (s && e.pointerId === this.#pid) {
        this.#cur = null;
        this.#strokes.push(s);
        this.#changed();
      }
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  /** Un `<nx-handoff for="{id}">` de la página que apunta aquí. */
  #external(): Handoff | null {
    return this.id ? document.querySelector<Handoff>(`nx-handoff[for="${CSS.escape(this.id)}"]`) : null;
  }

  /** «Firmar en el celular»: el `<nx-handoff>` de la página, o uno propio (se carga aparte) con `handoff`. */
  #phone(): void {
    const ext = this.#external();
    const url = this.handoff;
    if (ext) ext.start();
    else if (url)
      void import("./signature-extras").then((m) =>
        m.signatureHandoff(this.querySelector(".nx-sig__ho")!, url, resolveLocale(this), { askName: this.askName, askId: this.askId }, (v) => this.load(v)),
      );
  }

  #resize(): void {
    const c = this.#canvas;
    const r = c.getBoundingClientRect();
    const dpr = devicePixelRatio || 1;
    const w = Math.round(r.width * dpr);
    const hh = Math.round(r.height * dpr);
    if (w && (c.width !== w || c.height !== hh)) {
      c.width = w;
      c.height = hh;
      this.#draw();
    }
  }

  /** Pinta los trazos en el canvas en el siguiente frame (uno por frame, aunque lleguen 200 eventos). */
  #draw(): void {
    if (this.#raf || !this.#built) return;
    this.#raf = requestAnimationFrame(() => {
      this.#raf = 0;
      const c = this.#canvas;
      const ctx = c.getContext("2d");
      if (!ctx || typeof Path2D !== "function") return;
      const dpr = devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      if (this.#typed || this.#loaded) return;
      ctx.fillStyle = cleanInk(this.penColor);
      for (const s of this.#cur ? [...this.#strokes, this.#cur] : this.#strokes) {
        let p = this.#paths.get(s);
        if (!p) {
          const pts = smoothSignaturePoints(s.points);
          p = new Path2D(signaturePath(pts, strokeWidths({ type: s.type, points: pts })));
          // El trazo en curso cambia con cada punto: solo se guarda el de los terminados.
          if (s !== this.#cur) this.#paths.set(s, p);
        }
        ctx.fill(p);
      }
    });
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const B = this.#b;
    const [name, id, typed] = this.#in;
    const ro = this.readonly;
    const off = this.#off();
    const empty = this.isEmpty();
    const frozen = this.#frozen || !!this.#loaded;
    const date = this.#meta && !this.auto ? signatureDate(this.#meta.signedAt, resolveLocale(this)) : "";
    const svg = this.#typed || this.#loaded ? this.toSVG() : "";
    B.type.dataset.l = this.#typed ? "draw" : "type";
    for (const l of this.querySelectorAll<HTMLElement>("[data-l]")) l.textContent = L[l.dataset.l as keyof SignatureLabels];
    this.#pad.style.height = `${this.height}px`;
    name.parentElement!.parentElement!.hidden = !this.askName && !this.askId;
    name.parentElement!.hidden = !this.askName;
    id.parentElement!.hidden = !this.askId;
    typed.parentElement!.hidden = !this.#typed || frozen;
    for (const i of this.#in) {
      i.readOnly = ro || frozen;
      i.disabled = off;
    }
    name.required = this.askName && this.required;
    id.required = this.askId && this.required;
    this.#img.hidden = !svg;
    if (svg && this.#img.dataset.svg !== svg) {
      this.#img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      this.#img.dataset.svg = svg;
    }
    this.#canvas.setAttribute("aria-label", empty ? L.pad : L.padSigned);
    this.#pad.toggleAttribute("data-off", off);
    this.#pad.toggleAttribute("data-live", this.#canDraw());
    B.undo.parentElement!.hidden = ro || frozen;
    B.undo.disabled = off || this.#typed || !this.#strokes.length;
    B.clear.disabled = B.confirm.disabled = off || empty;
    B.type.disabled = B.phone.disabled = off;
    B.phone.hidden = !this.handoff && !this.#external();
    B.confirm.hidden = this.auto;
    // Congelada: la fecha (si la hay) y «Volver a firmar» (si se puede).
    B.again.parentElement!.hidden = !frozen || (!date && (ro || off));
    B.again.previousElementSibling!.textContent = date && L.signedAt.replace("{date}", date);
    B.again.hidden = ro || off;
    this.#sync();
  }

  /** El valor para el <form> (JSON, SVG o PNG) y la validez. */
  #sync(): void {
    const i = this.#internals;
    if (!i) return;
    try {
      const v = this.value;
      const f = this.valueFormat;
      const seq = ++this.#png;
      i.setFormValue(v && f !== "png" ? (f === "svg" ? v.svg : JSON.stringify(v)) : null);
      if (v && f === "png") void this.toPNG().then((b) => b && seq === this.#png && i.setFormValue(new File([b], "firma.png", { type: "image/png" })));
      const bad = this.#problem();
      const L = this.#labels;
      if (bad) i.setValidity(this.isEmpty() ? { valueMissing: true } : { customError: true }, bad, bad === L.nameRequired ? this.#in[0] : bad === L.idRequired ? this.#in[1] : this.#b.type);
      else i.setValidity({});
    } catch {
      /* navegadores sin form-associated */
    }
  }
}

for (const prop of STR.concat(BOOL)) {
  const attr = kebab(prop);
  const bool = BOOL.includes(prop);
  Object.defineProperty(NxSignature.prototype, prop, {
    configurable: true,
    get(this: HTMLElement) {
      return bool ? boolAttr(this, attr) : this.getAttribute(attr);
    },
    set(this: HTMLElement, v: unknown) {
      if (bool ? !v : v === null || v === undefined || v === "") this.removeAttribute(attr);
      else this.setAttribute(attr, bool ? "" : String(v));
    },
  });
}
