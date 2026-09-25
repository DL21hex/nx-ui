/**
 * `<nx-scan>`: escanear códigos de barras y QR con la cámara, para inventario y recepción. Abre la
 * cámara trasera (`getUserMedia`) y lee con `BarcodeDetector`: un recuadro guía, linterna si la
 * cámara la tiene, cambio de cámara y, al leer, vibración, un «bip» (desactivable) y un destello
 * sobre el código.
 *
 * Sin cámara o sin `BarcodeDetector` (Firefox, Safari de escritorio, permiso negado) lo dice claro y
 * sigue sirviendo: el código se escribe a mano, una pistola lectora USB funciona sola (teclea el
 * código y un Enter: se reconoce la ráfaga aunque el foco no esté en el campo, sin robar lo que se
 * escribe en otros campos) y se puede leer desde una foto.
 *
 * `mode="single"` (por defecto): una lectura dispara `nx-scan` y la cámara se detiene. `mode="count"`:
 * cada lectura suma a una lista agrupada por código, con cantidad editable, lo esperado (de `source`)
 * con faltantes y sobrantes, deshacer y totales. La cámara se apaga sola cuando no se ve.
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeHref } from "../../core/dom";
import { glyph } from "../../core/icons";
import { nxFormat, resolveLocale } from "../../core/locale";
import {
  WEDGE_EMPTY,
  addRead,
  cleanCode,
  cleanFormats,
  cleanItems,
  cleanMode,
  cleanProduct,
  cleanWedge,
  fill,
  formatName,
  guessFormat,
  isBurst,
  isRepeat,
  itemStatus,
  mapBox,
  mergeProduct,
  parseEntry,
  setQty,
  totals,
  wedgeKey,
  type CameraRead,
  type WedgeState,
} from "./logic";
import type { ScanDetail, ScanItem, ScanLabels, ScanMode, ScanProblem, ScanProduct, ScanState, ScanVia, ScanWedge } from "./types";

export const SCAN_LABELS: ScanLabels = {
  region: "Escáner de códigos",
  start: "Activar cámara",
  hint: "Apunta al código de barras o QR. También puedes escribirlo o usar una pistola lectora.",
  starting: "Abriendo la cámara…",
  stop: "Cerrar la cámara",
  torch: "Linterna",
  switchCamera: "Cambiar de cámara",
  sound: "Sonido al leer",
  paused: "La cámara se pausó mientras no se veía.",
  aim: "Apunta al código",
  manual: "Código",
  placeholder: "Escribe o escanea un código",
  add: "Agregar",
  find: "Buscar",
  photo: "Leer desde una foto",
  photoBusy: "Analizando la foto…",
  photoNone: "No encontré un código en la foto.",
  wedge: "¿Pistola lectora? Escanea sin tocar nada: se detecta sola.",
  nodetector: "Este navegador no lee códigos con la cámara. Escribe el código o usa una pistola lectora.",
  nocamera: "No se encontró una cámara. Escribe el código o usa una pistola lectora.",
  insecure: "La cámara solo funciona en una página segura (HTTPS). Escribe el código o usa una pistola lectora.",
  denied: "No hay permiso para usar la cámara. Actívalo en el navegador, o escribe el código.",
  busy: "Otra aplicación está usando la cámara.",
  failed: "No se pudo abrir la cámara.",
  retry: "Reintentar",
  read: "Código leído: {code}",
  counted: "{name}: {qty}",
  countedOf: "{name}: {qty} de {expected}",
  looking: "Buscando…",
  unknown: "Código sin registrar",
  expected: "esperadas {n}",
  qty: "contadas {n}",
  short: "Faltan {n}",
  over: "Sobran {n}",
  complete: "Completo",
  dec: "Restar uno a {name}",
  inc: "Sumar uno a {name}",
  qtyOf: "Cantidad de {name}",
  list: "Conteo",
  empty: "Aún no hay lecturas. Escanea el primer código.",
  codes: "{n} productos",
  units: "{n} unidades",
  missing: "faltan {n}",
  extra: "sobran {n}",
  done: "Todo cuadra",
  clear: "Vaciar",
  cleared: "Conteo vaciado",
  removed: "{name}: se quitó del conteo",
  result: "Código leído",
  again: "Escanear otro",
};

const I_SCAN = '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M8 7v10"/><path d="M12 7v10"/><path d="M17 7v10"/>';
const I_CAM = '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>';
/** La cámara tachada (sin cámara). */
const I_OFF = `${I_CAM}<path d="m2 2 20 20"/>`;
const I_TORCH = '<path d="M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"/><path d="M6 6h12"/><path d="M12 12h.01"/>';
const I_SWITCH = '<path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/><path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5"/><circle cx="12" cy="12" r="3"/><path d="m18 22-3-3 3-3"/><path d="m6 2 3 3-3 3"/>';
const I_SOUND = '<path d="M11 5 6 9H2v6h4l5 4z"/><path class="nx-scan__wave" d="M15.5 8.5a5 5 0 0 1 0 7"/><path class="nx-scan__mute" d="m22 9-6 6m0-6 6 6"/>';
const I_X = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';
const I_IMG = '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>';
const I_CHECK = '<path d="M20 6 9 17l-5-5"/>';
const I_MINUS = '<path d="M5 12h14"/>';
const I_PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';

const PROPS = ["mode", "formats", "source", "muted", "autostart", "wedge", "items", "labels", "locale"] as const;
/** Cada cuánto se le pregunta a `BarcodeDetector` por el cuadro actual. */
const TICK_MS = 90;
/** Lo que dura a la vista el recuadro sobre el código leído. */
const HIT_MS = 700;

/** Lo mínimo de `BarcodeDetector` que se usa (aún no está en los tipos de TypeScript). */
interface Detected {
  rawValue: string;
  format: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
}
interface Detector {
  detect(source: ImageBitmapSource): Promise<Detected[]>;
}
type DetectorClass = { new (o?: { formats?: string[] }): Detector; getSupportedFormats?(): Promise<string[]> };
const detectorClass = (): DetectorClass | undefined => (typeof window === "undefined" ? undefined : (window as unknown as { BarcodeDetector?: DetectorClass }).BarcodeDetector);

/** Los escáneres conectados, en el orden en que llegaron, y el último que la persona tocó. */
const scanners: NxScan[] = [];
let touched: NxScan | null = null;
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
let uid = 0;

type Read = { code: string; qty: number; created: boolean };

export class NxScan extends Base {
  static observedAttributes = ["mode", "formats", "source", "muted", "wedge", "items", "labels", "locale"];

  #uid = `nx-scan${++uid}`;
  #labels: ScanLabels = SCAN_LABELS;
  #items: ScanItem[] = [];
  #state: ScanState = "idle";
  #problem: ScanProblem | null = null;
  /** La persona quiere la cámara prendida: al volver a verse, se reanuda. */
  #want = false;
  #gen = 0;
  #inView = true;
  #stream: MediaStream | null = null;
  #detector: Detector | null = null;
  #deviceId = "";
  #torch = false;
  #timer = 0;
  #hitTimer = 0;
  #busy = false;
  #lastCam: CameraRead | null = null;
  #wedge: WedgeState = WEDGE_EMPTY;
  #field: WedgeState = WEDGE_EMPTY;
  #fieldBurst = false;
  #audio: AudioContext | null = null;
  #io: IntersectionObserver | null = null;
  /** Lo que respondió `source` por código (`null`: no existe). */
  #cache = new Map<string, ScanProduct | null>();
  #pending = new Set<string>();
  #lastRead: Read | null = null;
  #lastCode = "";
  #toastEl: Element | null = null;
  #toastGen = 0;
  /** Modo único: la última lectura. */
  #result: ScanDetail | null = null;
  #flip = false;
  #built = false;
  #viewer?: HTMLDivElement;
  #video?: HTMLVideoElement;
  #box?: HTMLSpanElement;
  #cover?: HTMLDivElement;
  #coverIcon?: HTMLSpanElement;
  #msg?: HTMLParagraphElement;
  #startBtn?: HTMLButtonElement;
  #tools?: HTMLDivElement;
  #torchBtn?: HTMLButtonElement;
  #switchBtn?: HTMLButtonElement;
  #soundBtn?: HTMLButtonElement;
  #input?: HTMLInputElement;
  #submit?: HTMLButtonElement;
  #photoBtn?: HTMLButtonElement;
  #file?: HTMLInputElement;
  #note?: HTMLParagraphElement;
  #resultEl?: HTMLDivElement;
  #count?: HTMLElement;
  #list?: HTMLUListElement;
  #empty?: HTMLParagraphElement;
  #sums?: HTMLParagraphElement;
  #clearBtn?: HTMLButtonElement;
  #live?: HTMLParagraphElement;

  // ---------------------------------------------------------------- propiedades

  /** `single` (por defecto): una lectura y se detiene. `count`: cada lectura suma a la lista. */
  get mode(): ScanMode {
    return cleanMode(this.getAttribute("mode"));
  }
  set mode(v: ScanMode) {
    this.setAttribute("mode", v);
  }
  /** Formatos que se leen con la cámara (`ean_13`, `code_128`, `qr_code`…). Atributo: lista con comas o JSON. */
  get formats(): string[] {
    return cleanFormats(this.getAttribute("formats"));
  }
  set formats(v: string[] | string | null | undefined) {
    if (v === null || v === undefined) this.removeAttribute("formats");
    else this.setAttribute("formats", Array.isArray(v) ? v.join(",") : String(v));
  }
  /** URL que describe un producto: se le agrega el código («/productos?code=») o reemplaza `{code}`.
   *  Responde `{code, name, unit?, expected?}` (404: no existe). */
  get source(): string | null {
    return safeHref(this.getAttribute("source")) ?? null;
  }
  set source(v: string | null) {
    if (v) this.setAttribute("source", v);
    else this.removeAttribute("source");
  }
  /** Sin el «bip» al leer (la vibración sigue). */
  get muted(): boolean {
    return boolAttr(this, "muted");
  }
  set muted(v: boolean) {
    this.toggleAttribute("muted", !!v);
  }
  /** Abre la cámara al conectarse, sin esperar el botón (el navegador pide permiso igual). */
  get autostart(): boolean {
    return boolAttr(this, "autostart");
  }
  set autostart(v: boolean) {
    this.toggleAttribute("autostart", !!v);
  }
  /** Dónde se escucha la pistola lectora: `page` (por defecto), `field` u `off`. */
  get wedge(): ScanWedge {
    return cleanWedge(this.getAttribute("wedge"));
  }
  set wedge(v: ScanWedge) {
    this.setAttribute("wedge", v);
  }
  /** Las líneas del conteo. Se pueden precargar (las de una orden, con `expected` y `qty: 0`). */
  get items(): ScanItem[] {
    return this.#items.map((it) => ({ ...it }));
  }
  set items(v: ScanItem[] | null | undefined) {
    this.#items = cleanItems(v);
    this.#paintList();
  }
  get labels(): ScanLabels {
    return this.#labels;
  }
  set labels(v: Partial<ScanLabels> | null | undefined) {
    const out = { ...SCAN_LABELS };
    if (v && typeof v === "object") for (const [k, s] of Object.entries(v)) if (k in out && typeof s === "string") (out as Record<string, string>)[k] = s;
    this.#labels = out;
    this.#paint();
  }
  /** Formato de números («es-CO», «en-US»). Sin él, el `lang` más cercano. */
  get locale(): string {
    return resolveLocale(this);
  }
  set locale(v: string | null) {
    if (v) this.setAttribute("locale", v);
    else this.removeAttribute("locale");
  }
  /** En qué está la cámara: `idle`, `starting`, `live`, `paused`, `done` o `unavailable`. */
  get state(): ScanState {
    return this.#state;
  }
  /** Por qué no hay cámara (con `state="unavailable"`), o `null`. */
  get problem(): ScanProblem | null {
    return this.#problem;
  }

  // ---------------------------------------------------------------- API

  /** Abre la cámara (pide permiso la primera vez). */
  async start(): Promise<void> {
    const problem = this.#precheck();
    if (problem) return this.#fail(problem);
    if (this.#state === "live" || this.#state === "starting") return;
    this.#want = true;
    const gen = ++this.#gen;
    this.#set("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: this.#deviceId ? { deviceId: { exact: this.#deviceId } } : { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      if (gen !== this.#gen || !this.isConnected) return stopTracks(stream);
      this.#detector ??= await this.#makeDetector();
      if (gen !== this.#gen) return stopTracks(stream);
      this.#stream = stream;
      const video = this.#video!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      if (gen !== this.#gen) return;
      this.#torch = false;
      this.#set("live");
      void this.#paintTools();
      this.#tick();
    } catch (e) {
      if (gen !== this.#gen) return;
      this.#want = false;
      this.#fail(problemOf(e));
    }
  }

  /** Cierra la cámara. */
  stop(): void {
    this.#want = false;
    this.#halt();
    if (this.#state !== "unavailable") this.#set(this.#result && this.mode === "single" ? "done" : "idle");
  }

  /** Una lectura desde código (la usa la demo para «simular»): igual que si llegara de la cámara. */
  add(code: string, qty = 1, format = ""): boolean {
    const c = cleanCode(code);
    return !!c && this.#accept(c, format || guessFormat(c), "api", qty > 0 ? qty : 1);
  }

  /** Deshace la última lectura del conteo (lo mismo que «Deshacer» en el aviso o Ctrl+Z). */
  undo(): boolean {
    const r = this.#lastRead;
    if (!r) return false;
    this.#dropToast();
    this.#undoRead(r);
    return true;
  }

  /** Vacía el conteo (sin aviso; el botón «Vaciar» sí ofrece deshacer). */
  clear(): void {
    this.#items = [];
    this.#lastRead = null;
    this.#lastCode = "";
    this.#paintList();
    this.#emitCount();
  }

  /** Enfoca el campo del código. */
  focus(options?: FocusOptions): void {
    this.#input?.focus(options);
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
    scanners.push(this);
    document.addEventListener("keydown", this.#onDocKey, true);
    document.addEventListener("visibilitychange", this.#onVisibility);
    if (typeof IntersectionObserver !== "undefined") {
      this.#io = new IntersectionObserver((entries) => {
        this.#inView = entries[entries.length - 1].isIntersecting;
        this.#onVisibility();
      });
      this.#io.observe(this);
    }
    const problem = this.#precheck();
    if (problem) this.#fail(problem, false);
    else if (this.#state === "unavailable") this.#set("idle");
    this.#paint();
    if (!problem && (this.autostart || (this.#want && this.#state === "paused"))) void this.start();
  }

  disconnectedCallback(): void {
    const i = scanners.indexOf(this);
    if (i >= 0) scanners.splice(i, 1);
    if (touched === this) touched = null;
    document.removeEventListener("keydown", this.#onDocKey, true);
    document.removeEventListener("visibilitychange", this.#onVisibility);
    this.#io?.disconnect();
    this.#io = null;
    this.#inView = true;
    clearTimeout(this.#hitTimer);
    // Sin cámara prendida cuando el componente no está: si vuelve a la página, se reanuda.
    if (this.#state === "live" || this.#state === "starting") {
      this.#halt();
      this.#state = "paused";
    }
    void this.#audio?.close().catch(() => {});
    this.#audio = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "items" || name === "labels") {
      if (value === null) (this as unknown as Record<string, unknown>)[name] = null;
      else
        try {
          (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
        } catch {
          console.warn(`[nx-scan] el atributo "${name}" no es JSON válido`);
        }
      return;
    }
    if (name === "formats") {
      this.#detector = null;
      if (this.#state === "live") void this.#makeDetector().then((d) => (this.#detector = d), () => {});
    }
    this.#paint();
  }

  // ---------------------------------------------------------------- cámara

  /** Lo que se sabe antes de pedir la cámara. */
  #precheck(): ScanProblem | null {
    if (!detectorClass()) return "nodetector";
    if (typeof isSecureContext !== "undefined" && !isSecureContext) return "insecure";
    if (!navigator.mediaDevices?.getUserMedia) return "nocamera";
    return null;
  }

  async #makeDetector(): Promise<Detector> {
    const C = detectorClass()!;
    let formats = this.formats;
    try {
      const supported = await C.getSupportedFormats?.();
      const ok = supported?.length ? formats.filter((f) => supported.includes(f)) : formats;
      if (ok.length) formats = ok;
    } catch {
      /* sin la lista: se piden todos */
    }
    return new C({ formats });
  }

  #fail(problem: ScanProblem, emit = true): void {
    this.#halt();
    this.#problem = problem;
    this.#set("unavailable");
    if (emit) this.dispatchEvent(new CustomEvent("nx-scan-error", { detail: { problem }, bubbles: true, composed: true }));
  }

  /** Apaga el stream y el ciclo de lectura (sin cambiar lo que quiere la persona). */
  #halt(): void {
    this.#gen++;
    clearTimeout(this.#timer);
    this.#busy = false;
    if (this.#stream) stopTracks(this.#stream);
    this.#stream = null;
    if (this.#video) this.#video.srcObject = null;
  }

  /** Se pausa cuando no se ve (otra pestaña, fuera de la pantalla) y se reanuda al volver. */
  #onVisibility = (): void => {
    const visible = this.#inView && !document.hidden;
    if (!visible && (this.#state === "live" || this.#state === "starting")) {
      this.#halt();
      this.#set("paused");
    } else if (visible && this.#state === "paused" && this.#want) void this.start();
  };

  #tick(): void {
    clearTimeout(this.#timer);
    this.#timer = window.setTimeout(async () => {
      const video = this.#video!;
      if (this.#state !== "live") return;
      if (!this.#busy && this.#detector && video.readyState >= 2) {
        this.#busy = true;
        const gen = this.#gen;
        try {
          const found = await this.#detector.detect(video);
          if (gen === this.#gen && this.#state === "live") for (const b of found) if (this.#seen(b)) break;
        } catch {
          /* un cuadro que no se pudo leer: el siguiente */
        }
        this.#busy = false;
      }
      if (this.#state === "live") this.#tick();
    }, TICK_MS);
  }

  /** La cámara vio un código. `true` si se aceptó. */
  #seen(b: Detected): boolean {
    const code = cleanCode(b.rawValue);
    if (!code) return false;
    const now = performance.now();
    if (isRepeat(this.#lastCam, code, now)) {
      this.#lastCam!.seen = now;
      return false;
    }
    this.#lastCam = { code, at: now, seen: now };
    if (b.boundingBox) this.#hit(b.boundingBox);
    return this.#accept(code, b.format ?? "", "camera");
  }

  /** El recuadro sobre el código leído, y el destello del visor. */
  #hit(bb: { x: number; y: number; width: number; height: number }): void {
    const video = this.#video!;
    const r = mapBox(bb, { width: video.videoWidth, height: video.videoHeight }, { width: video.clientWidth, height: video.clientHeight });
    const box = this.#box!;
    if (r) {
      Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
      box.hidden = false;
      clearTimeout(this.#hitTimer);
      this.#hitTimer = window.setTimeout(() => (box.hidden = true), HIT_MS);
    }
  }

  async #paintTools(): Promise<void> {
    const track = this.#stream?.getVideoTracks()[0];
    const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
    this.#torchBtn!.hidden = !caps.torch;
    this.#torchBtn!.setAttribute("aria-pressed", String(this.#torch));
    this.#switchBtn!.hidden = (await cameras()).length < 2;
  }

  async #toggleTorch(): Promise<void> {
    const track = this.#stream?.getVideoTracks()[0];
    if (!track) return;
    const on = !this.#torch;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.#torch = on;
    } catch {
      /* la cámara dijo que sí la tenía, pero no: se queda como estaba */
    }
    this.#torchBtn!.setAttribute("aria-pressed", String(this.#torch));
  }

  async #switchCamera(): Promise<void> {
    const cams = await cameras();
    if (cams.length < 2) return;
    const current = this.#stream?.getVideoTracks()[0]?.getSettings().deviceId ?? this.#deviceId;
    const i = cams.findIndex((c) => c.deviceId === current);
    this.#deviceId = cams[(i + 1) % cams.length].deviceId;
    this.#halt();
    this.#state = "idle";
    await this.start();
    this.#switchBtn?.focus();
  }

  // ---------------------------------------------------------------- lecturas

  /** Una lectura, venga de donde venga. `nx-scan` es cancelable: cancelado, no cuenta. */
  #accept(code: string, format: string, via: ScanVia, qty = 1): boolean {
    const detail: ScanDetail = { code, format, via };
    if (!this.dispatchEvent(new CustomEvent("nx-scan", { detail, bubbles: true, composed: true, cancelable: true }))) return false;
    const L = this.#labels;
    const sensed = via === "camera" || via === "photo";
    if (this.mode === "single") {
      this.#result = detail;
      if (this.#state === "live" || this.#state === "starting") {
        this.#halt();
        this.#set("done");
      }
      if (sensed) this.#feedback(false);
      this.#paintResult();
      this.#say(fill(L.read, { code }));
      this.#lookup(code);
      return true;
    }
    const r = addRead(this.#items, code, qty, format);
    this.#items = r.items;
    const read: Read = { code, qty, created: r.created };
    this.#lastRead = read;
    this.#lastCode = code;
    this.#paintList(true);
    const over = itemStatus(r.item).status === "over";
    if (sensed) this.#feedback(over);
    const text = this.#countText(r.item);
    this.#say(text);
    this.#emitCount();
    this.#lookup(code);
    this.#toast(text, over, () => this.#lastRead === read && this.#undoRead(read));
    return true;
  }

  #undoRead(r: Read): void {
    this.#lastRead = null;
    const it = this.#items.find((x) => x.code === r.code);
    if (!it) return;
    const left = Math.max(0, it.qty - r.qty);
    this.#items = r.created && left === 0 ? this.#items.filter((x) => x !== it) : setQty(this.#items, r.code, left);
    this.#paintList();
    const now = this.#items.find((x) => x.code === r.code);
    this.#say(now ? this.#countText(now) : fill(this.#labels.removed, { name: it.name ?? it.code }));
    this.#emitCount();
  }

  /**
   * Un aviso con deshacer (`nxToast`, que se carga con `import()` la primera vez: el modo único no lo
   * necesita). Reemplaza al anterior de este escáner.
   */
  #toast(message: string, warn: boolean, onUndo: () => unknown): void {
    this.#dropToast();
    const mine = this.#toastGen;
    void import("../toast/index")
      .then(({ nxToast }) => {
        if (mine !== this.#toastGen) return; // llegó otra lectura mientras cargaba
        const p = nxToast({ message, undo: true, tone: warn ? "warning" : "neutral" });
        this.#toastEl = document.querySelector("nx-toaster .nx-toast:last-child");
        return p;
      })
      .then((res) => res === "undo" && onUndo());
  }

  /** El aviso anterior se va cuando llega otra lectura: solo se deshace la última. */
  #dropToast(): void {
    this.#toastGen++;
    const el = this.#toastEl;
    this.#toastEl = null;
    if (el?.isConnected) el.querySelector<HTMLElement>('[data-r="dismiss"]')?.click();
  }

  /** Vibración, «bip» y destello. Un sobrante suena distinto (más grave, dos veces). */
  #feedback(warn: boolean): void {
    try {
      navigator.vibrate?.(warn ? [40, 60, 40] : 50);
    } catch {
      /* sin vibración */
    }
    const v = this.#viewer!;
    v.classList.remove("is-flash");
    void v.offsetWidth;
    v.classList.add("is-flash");
    if (this.muted) return;
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = (this.#audio ??= new Ctx());
      void ctx.resume?.();
      const t = ctx.currentTime;
      for (let i = 0; i < (warn ? 2 : 1); i++) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const at = t + i * 0.14;
        o.type = "square";
        o.frequency.value = warn ? 740 : 1760;
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.08, at + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.1);
        o.connect(g).connect(ctx.destination);
        o.start(at);
        o.stop(at + 0.11);
      }
    } catch {
      /* sin audio */
    }
  }

  /** Pide la descripción a `source` (una vez por código). */
  #lookup(code: string): void {
    const src = this.source;
    if (!src) return;
    if (this.mode === "count" && this.#items.find((x) => x.code === code)?.name) return;
    if (this.#cache.has(code)) return this.#product(code, this.#cache.get(code)!);
    if (this.#pending.has(code)) return;
    this.#pending.add(code);
    this.#paintAll();
    const enc = encodeURIComponent(code);
    fetch(src.includes("{code}") ? src.replace("{code}", enc) : src + enc, { headers: { Accept: "application/json" }, credentials: "same-origin" })
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(String(res.status));
        return cleanProduct(await res.json(), code);
      })
      .then(
        (p) => {
          this.#cache.set(code, p);
          this.#pending.delete(code);
          this.#product(code, p);
        },
        () => {
          // Sin red o el servidor falló: se queda el código, y se vuelve a intentar en la próxima lectura.
          this.#pending.delete(code);
          this.#paintAll();
        },
      );
  }

  #product(code: string, p: ScanProduct | null): void {
    if (this.mode === "count") {
      const before = this.#items;
      this.#items = mergeProduct(before, code, p);
      this.#paintList();
      if (this.#items.some((it, i) => it !== before[i])) this.#emitCount();
    } else this.#paintResult();
  }

  #emitCount(): void {
    this.dispatchEvent(new CustomEvent("nx-scan-count", { detail: { items: this.items }, bubbles: true, composed: true }));
  }

  /** Cambia la cantidad de una línea (los −/+ o escribiéndola). En 0 sin esperado, se quita (con deshacer). */
  #edit(code: string, qty: number): void {
    const before = this.#items;
    const it = before.find((x) => x.code === code);
    if (!it || qty === it.qty) return;
    const L = this.#labels;
    const next = setQty(before, code, qty);
    const gone = next.length < before.length;
    let focusTo: HTMLElement | null = null;
    if (gone) {
      // El foco estaba en la línea que se va: pasa a la siguiente (o al campo del código).
      const li = this.#row(code);
      const sib = (li?.nextElementSibling ?? li?.previousElementSibling) as HTMLElement | null;
      if (li?.contains(document.activeElement)) focusTo = sib?.querySelector<HTMLElement>('[data-act="dec"]') ?? this.#input!;
    }
    this.#items = next;
    if (this.#lastRead?.code === code) this.#lastRead = null;
    this.#paintList();
    focusTo?.focus();
    this.#emitCount();
    const now = next.find((x) => x.code === code);
    if (now) return this.#say(this.#countText(now));
    const name = it.name ?? it.code;
    this.#toast(fill(L.removed, { name }), false, () => {
      if (this.#items.some((x) => x.code === code)) return;
      const i = before.indexOf(it);
      this.#restore([...this.#items.slice(0, i), it, ...this.#items.slice(i)]);
    });
  }

  /** «Vaciar»: al instante, con deshacer. */
  #clearWithUndo(): void {
    const before = this.#items;
    if (!before.length) return;
    this.clear();
    this.#input?.focus();
    this.#toast(this.#labels.cleared, false, () => !this.#items.length && this.#restore(before));
  }

  #restore(items: ScanItem[]): void {
    this.#items = items;
    this.#paintList();
    this.#emitCount();
  }

  #fmt(n: number): string {
    return nxFormat(resolveLocale(this)).number(n);
  }
  #qtyText(it: ScanItem): string {
    return it.unit ? `${this.#fmt(it.qty)} ${it.unit}` : this.#fmt(it.qty);
  }
  /** «Lámina HR 3 mm: 39 de 40». */
  #countText(it: ScanItem): string {
    const L = this.#labels;
    const name = it.name ?? it.code;
    return it.expected === undefined ? fill(L.counted, { name, qty: this.#qtyText(it) }) : fill(L.countedOf, { name, qty: this.#fmt(it.qty), expected: this.#qtyText({ ...it, qty: it.expected }) });
  }

  /** Anuncio para lectores de pantalla (un carácter invisible alterno hace que se repita lo mismo). */
  #say(text: string): void {
    if (!this.#live) return;
    this.#flip = !this.#flip;
    this.#live.textContent = text + (this.#flip ? "​" : "");
  }
  #note$(text: string): void {
    this.#note!.textContent = text;
    this.#note!.hidden = !text;
  }

  // ---------------------------------------------------------------- teclado: la pistola lectora

  /** En toda la página: una ráfaga de pistola cerrada con Enter, si el foco NO está en un campo. */
  #onDocKey = (e: KeyboardEvent): void => {
    if (this.wedge !== "page" || e.isComposing || editable(e.target)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) {
      this.#wedge = WEDGE_EMPTY;
      return;
    }
    if (!this.#owns()) return;
    const r = wedgeKey(this.#wedge, e.key, e.timeStamp || performance.now());
    this.#wedge = r.state;
    if (!r.code) return;
    // El Enter era de la pistola: no activa el botón enfocado ni lo toma nadie más.
    e.preventDefault();
    e.stopImmediatePropagation();
    this.#accept(r.code, guessFormat(r.code), "wedge");
  };

  /** La pistola es del escáner visible más reciente (o del último que se tocó). */
  /** La pistola es del último escáner que se tocó; si no, del primero que se ve (o del primero de la página). */
  #owns(): boolean {
    const ok = (s: NxScan | null) => !!s && s.isConnected && s.wedge === "page";
    return (ok(touched) ? touched : (scanners.find((s) => ok(s) && s.#inView) ?? scanners.find(ok))) === this;
  }
  #claim = (): void => {
    touched = this;
  };

  // ---------------------------------------------------------------- foto

  async #readPhoto(file: File): Promise<void> {
    const L = this.#labels;
    this.#note$(L.photoBusy);
    let found: Detected[] = [];
    try {
      const d = (this.#detector ??= await this.#makeDetector());
      const bmp = await createImageBitmap(file);
      found = await d.detect(bmp);
      bmp.close?.();
    } catch {
      found = [];
    }
    const b = found.find((x) => cleanCode(x.rawValue));
    if (!b) {
      this.#note$(L.photoNone);
      this.#say(L.photoNone);
      return;
    }
    this.#note$("");
    this.#accept(cleanCode(b.rawValue), b.format ?? "", "photo");
  }

  // ---------------------------------------------------------------- pintar

  #build(): void {
    this.#built = true;
    const id = this.#uid;
    const tool = (icon: string, cls: string) => h("button", { type: "button", class: `nx-scan__tool ${cls}` }, glyph(icon));

    this.#video = h("video", { class: "nx-scan__video", muted: true, playsinline: true, autoplay: true, "aria-hidden": "true" });
    this.#video.muted = true;
    this.#box = h("span", { class: "nx-scan__box", hidden: true, "aria-hidden": "true" });
    this.#coverIcon = h("span", { class: "nx-scan__icon" });
    this.#msg = h("p", { class: "nx-scan__msg", id: `${id}-msg` });
    this.#startBtn = h("button", { type: "button", class: "nx-scan__start", "aria-describedby": `${id}-msg` });
    this.#cover = h("div", { class: "nx-scan__cover" }, this.#coverIcon, this.#msg, this.#startBtn);
    this.#torchBtn = tool(I_TORCH, "nx-scan__torch");
    this.#switchBtn = tool(I_SWITCH, "nx-scan__switch");
    this.#soundBtn = tool(I_SOUND, "nx-scan__sound");
    const stopBtn = tool(I_X, "nx-scan__stop");
    this.#tools = h("div", { class: "nx-scan__tools" }, this.#torchBtn, this.#switchBtn, this.#soundBtn, stopBtn);
    this.#viewer = h(
      "div",
      { class: "nx-scan__viewer" },
      this.#video,
      h("span", { class: "nx-scan__frame", "aria-hidden": "true" }, h("span", { class: "nx-scan__laser" })),
      this.#box,
      h("p", { class: "nx-scan__aim", "aria-hidden": "true" }),
      this.#cover,
      this.#tools,
    );

    this.#input = h("input", { type: "text", class: "nx-scan__input", id: `${id}-code`, autocomplete: "off", autocapitalize: "off", spellcheck: "false", enterkeyhint: "done" });
    this.#submit = h("button", { type: "submit", class: "nx-scan__submit" });
    const form = h("form", { class: "nx-scan__manual" }, h("label", { class: "nx-scan__label", for: `${id}-code` }), h("div", { class: "nx-scan__field" }, this.#input, this.#submit));
    this.#file = h("input", { type: "file", accept: "image/*", hidden: true, tabindex: "-1", "aria-hidden": "true" });
    this.#photoBtn = h("button", { type: "button", class: "nx-scan__photo" }, glyph(I_IMG), h("span"));
    this.#note = h("p", { class: "nx-scan__note", role: "status", hidden: true });
    const extra = h("div", { class: "nx-scan__extra" }, this.#photoBtn, this.#file, h("p", { class: "nx-scan__wedge" }));
    this.#resultEl = h("div", { class: "nx-scan__result", hidden: true });
    const main = h("div", { class: "nx-scan__main" }, this.#viewer, form, extra, this.#note, this.#resultEl);

    this.#list = h("ul", { class: "nx-scan__list", "aria-labelledby": `${id}-list` });
    this.#empty = h("p", { class: "nx-scan__empty" });
    this.#sums = h("p", { class: "nx-scan__sums" });
    this.#clearBtn = h("button", { type: "button", class: "nx-scan__clear" });
    this.#count = h(
      "section",
      { class: "nx-scan__count", "aria-labelledby": `${id}-list` },
      h("div", { class: "nx-scan__head" }, h("p", { class: "nx-scan__title", id: `${id}-list` }), this.#clearBtn),
      this.#list,
      this.#empty,
      this.#sums,
    );
    this.#live = h("p", { class: "nx-scan__sr", "aria-live": "polite", "aria-atomic": "true" });
    this.setAttribute("role", "region");
    this.replaceChildren(h("div", { class: "nx-scan__grid" }, main, this.#count), this.#live);

    this.#startBtn.addEventListener("click", () => {
      if (this.#state === "done") {
        this.#result = null;
        this.#paintResult();
      }
      void this.start();
    });
    stopBtn.addEventListener("click", () => {
      this.stop();
      this.#startBtn!.focus();
    });
    this.#torchBtn.addEventListener("click", () => void this.#toggleTorch());
    this.#switchBtn.addEventListener("click", () => void this.#switchCamera());
    this.#soundBtn.addEventListener("click", () => (this.muted = !this.muted));
    this.#photoBtn.addEventListener("click", () => this.#file!.click());
    this.#file.addEventListener("change", () => {
      const f = this.#file!.files?.[0];
      this.#file!.value = "";
      if (f) void this.#readPhoto(f);
    });
    this.#input.addEventListener("keydown", (e) => {
      const r = wedgeKey(this.#field, e.key, e.timeStamp || performance.now());
      this.#fieldBurst = e.key === "Enter" && isBurst(this.#field, e.timeStamp || performance.now());
      this.#field = r.state;
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const entry = parseEntry(this.#input!.value);
      const via: ScanVia = this.#fieldBurst ? "wedge" : "manual";
      this.#fieldBurst = false;
      if (!entry) return;
      if (this.#accept(entry.code, guessFormat(entry.code), via, this.mode === "count" ? entry.qty : 1)) this.#input!.value = "";
      this.#input!.focus();
    });
    this.#list.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("button[data-act]");
      const it = b && this.#itemOf(b);
      if (!it) return;
      this.#edit(it.code, Math.max(0, it.qty + (b.dataset.act === "inc" ? 1 : -1)));
    });
    this.#list.addEventListener("keydown", (e) => {
      const input = e.target as HTMLInputElement;
      if (!input.matches?.(".nx-scan__n")) return;
      if (e.key === "Enter") {
        e.preventDefault();
        this.#commitQty(input);
      } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const it = this.#itemOf(input);
        if (it) this.#edit(it.code, Math.max(0, it.qty + (e.key === "ArrowUp" ? 1 : -1)));
        input.value = this.#fmt(this.#itemOf(input)?.qty ?? 0);
      } else if (e.key === "Escape") {
        const it = this.#itemOf(input);
        if (it) input.value = this.#fmt(it.qty);
      }
    });
    this.#list.addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      if (input.matches?.(".nx-scan__n")) this.#commitQty(input);
    });
    this.#clearBtn.addEventListener("click", () => this.#clearWithUndo());
    this.#viewer.addEventListener("animationend", (e) => {
      if (e.target === this.#viewer) this.#viewer!.classList.remove("is-flash");
    });
    this.addEventListener("focusin", this.#claim);
    this.addEventListener("pointerdown", this.#claim);
  }

  /** La línea de un control de la lista. */
  #itemOf(el: Element): ScanItem | undefined {
    const code = el.closest<HTMLElement>("[data-code]")?.dataset.code;
    return this.#items.find((x) => x.code === code);
  }

  #commitQty(input: HTMLInputElement): void {
    const it = this.#itemOf(input);
    if (!it) return;
    const n = nxFormat(resolveLocale(this)).parse(input.value);
    if (n !== null && n >= 0) this.#edit(it.code, n);
    input.value = this.#fmt(this.#itemOf(input)?.qty ?? 0);
  }

  #set(state: ScanState): void {
    if (state !== "unavailable") this.#problem = null;
    this.#state = state;
    this.#paint();
  }

  #paintAll(): void {
    this.#paintList();
    this.#paintResult();
  }

  #paint(): void {
    if (!this.#built) return;
    const L = this.#labels;
    const st = this.#state;
    const count = this.mode === "count";
    this.dataset.mode = this.mode;
    this.setAttribute("aria-label", L.region);
    const v = this.#viewer!;
    v.dataset.state = st;
    if (this.#problem) v.dataset.problem = this.#problem;
    else delete v.dataset.problem;
    const covered = st !== "live";
    this.#cover!.hidden = !covered;
    this.#tools!.hidden = st !== "live";
    v.querySelector(".nx-scan__aim")!.textContent = L.aim;
    const retry = this.#problem === "denied" || this.#problem === "busy" || this.#problem === "failed";
    this.#coverIcon!.replaceChildren(glyph(st === "unavailable" ? I_OFF : st === "done" ? I_CHECK : st === "starting" ? I_CAM : I_SCAN));
    this.#msg!.textContent = st === "unavailable" ? L[this.#problem ?? "failed"] : st === "starting" ? L.starting : st === "paused" ? L.paused : st === "done" ? L.result : L.hint;
    const btn = this.#startBtn!;
    btn.hidden = st === "starting" || (st === "unavailable" && !retry);
    btn.replaceChildren(glyph(st === "done" ? I_SCAN : I_CAM), h("span", null, st === "unavailable" ? L.retry : st === "done" ? L.again : L.start));
    for (const [b, label] of [
      [this.#torchBtn!, L.torch],
      [this.#switchBtn!, L.switchCamera],
      [this.#soundBtn!, L.sound],
      [this.#tools!.lastElementChild as HTMLButtonElement, L.stop],
    ] as const) {
      b.setAttribute("aria-label", label);
      b.title = label;
    }
    this.#soundBtn!.setAttribute("aria-pressed", String(!this.muted));
    this.querySelector(".nx-scan__label")!.textContent = L.manual;
    this.#input!.placeholder = L.placeholder;
    this.#submit!.textContent = count ? L.add : L.find;
    const hasDetector = !!detectorClass();
    this.#photoBtn!.hidden = !hasDetector;
    this.#photoBtn!.lastElementChild!.textContent = L.photo;
    const wedge = this.querySelector<HTMLElement>(".nx-scan__wedge")!;
    wedge.textContent = L.wedge;
    wedge.hidden = this.wedge === "off";
    this.#count!.hidden = !count;
    this.#resultEl!.hidden = count || !this.#result;
    this.#paintList();
    this.#paintResult();
  }

  #paintResult(): void {
    const el = this.#resultEl;
    if (!el || this.mode === "count") return;
    const r = this.#result;
    el.hidden = !r;
    if (!r) return el.replaceChildren();
    const L = this.#labels;
    const p = this.#cache.get(r.code);
    const name = p ? `${p.name}${p.unit ? ` · ${p.unit}` : ""}` : this.#pending.has(r.code) ? L.looking : this.source && p === null ? L.unknown : "";
    el.replaceChildren(
      h("p", { class: "nx-scan__kicker" }, glyph(I_CHECK), L.result, r.format ? h("span", { class: "nx-scan__fmt" }, formatName(r.format)) : null),
      h("p", { class: "nx-scan__code" }, r.code),
      h("p", { class: "nx-scan__product", "data-pending": this.#pending.has(r.code) || null, hidden: !name }, name),
    );
  }

  #row(code: string): HTMLLIElement | null {
    for (const li of this.#list?.children ?? []) if ((li as HTMLElement).dataset.code === code) return li as HTMLLIElement;
    return null;
  }

  /** La lista, reconciliada por código: las líneas no se recrean (el foco y el scroll se quedan). */
  #paintList(hit = false): void {
    const list = this.#list;
    if (!list) return;
    const L = this.#labels;
    const rows = new Map<string, HTMLLIElement>();
    for (const li of [...list.children] as HTMLLIElement[]) rows.set(li.dataset.code!, li);
    this.#items.forEach((it, i) => {
      let li = rows.get(it.code);
      rows.delete(it.code);
      if (!li) li = this.#newRow(it.code);
      this.#fillRow(li, it);
      if (list.children[i] !== li) list.insertBefore(li, list.children[i] ?? null);
    });
    for (const li of rows.values()) li.remove();
    for (const li of list.children) li.classList.toggle("is-last", (li as HTMLElement).dataset.code === this.#lastCode);
    if (hit) {
      const li = this.#row(this.#lastCode);
      if (li) {
        li.classList.remove("is-hit");
        void li.offsetWidth;
        li.classList.add("is-hit");
        // Dentro de la lista (no la página: en el teléfono, la cámara queda arriba a la vista).
        if (li.offsetTop < list.scrollTop) list.scrollTop = li.offsetTop;
        else if (li.offsetTop + li.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = li.offsetTop + li.offsetHeight - list.clientHeight;
      }
    }
    this.#empty!.textContent = L.empty;
    this.#empty!.hidden = this.#items.length > 0;
    list.hidden = !this.#items.length;
    this.querySelector(`#${this.#uid}-list`)!.textContent = L.list;
    this.#clearBtn!.textContent = L.clear;
    this.#clearBtn!.hidden = !this.#items.length;
    const t = totals(this.#items);
    const f = (n: number) => this.#fmt(n);
    const parts: (Node | string)[] = [h("span", null, fill(L.codes, { n: f(t.codes) })), h("span", null, fill(L.units, { n: f(t.units) }))];
    if (t.missing) parts.push(h("span", { "data-status": "short" }, fill(L.missing, { n: f(t.missing) })));
    if (t.extra) parts.push(h("span", { "data-status": "over" }, fill(L.extra, { n: f(t.extra) })));
    if (t.expected && !t.missing && !t.extra && this.#items.every((it) => it.expected !== undefined)) parts.push(h("span", { "data-status": "ok" }, L.done));
    this.#sums!.replaceChildren(...parts);
    this.#sums!.hidden = !this.#items.length;
  }

  #newRow(code: string): HTMLLIElement {
    const btn = (act: string, icon: string) => h("button", { type: "button", class: "nx-scan__step", "data-act": act }, glyph(icon));
    return h(
      "li",
      { class: "nx-scan__item", "data-code": code },
      h("div", { class: "nx-scan__top" }, h("span", { class: "nx-scan__name" }), h("span", { class: "nx-scan__badge" })),
      h("span", { class: "nx-scan__meta" }),
      h(
        "div",
        { class: "nx-scan__qty", role: "group" },
        btn("dec", I_MINUS),
        h("input", { type: "text", class: "nx-scan__n", inputmode: "decimal", autocomplete: "off" }),
        btn("inc", I_PLUS),
        h("span", { class: "nx-scan__unit" }),
      ),
      h("span", { class: "nx-scan__bar", "aria-hidden": "true" }),
    );
  }

  #fillRow(li: HTMLLIElement, it: ScanItem): void {
    const L = this.#labels;
    const f = (n: number) => this.#fmt(n);
    const name = it.name ?? it.code;
    const { status, diff } = itemStatus(it);
    li.dataset.status = status;
    li.toggleAttribute("data-unknown", !!it.unknown);
    const nameEl = li.querySelector(".nx-scan__name")!;
    nameEl.textContent = name;
    nameEl.classList.toggle("is-code", !it.name);
    const meta: string[] = [];
    if (it.name) meta.push(it.code);
    if (this.#pending.has(it.code)) meta.push(L.looking);
    else if (it.unknown) meta.push(L.unknown);
    if (it.expected !== undefined) meta.push(fill(L.expected, { n: f(it.expected) }));
    // «contadas N» repite lo del campo de la cantidad: en angosto se oculta (CSS) para dejar sitio.
    li.querySelector(".nx-scan__meta")!.replaceChildren(meta.join(" · "), it.expected !== undefined ? h("span", { class: "nx-scan__counted" }, ` · ${fill(L.qty, { n: f(it.qty) })}`) : "");
    const badge = li.querySelector<HTMLElement>(".nx-scan__badge")!;
    badge.textContent = status === "short" ? fill(L.short, { n: f(-diff) }) : status === "over" ? fill(L.over, { n: f(diff) }) : status === "ok" ? L.complete : "";
    badge.hidden = status === "none";
    const [dec, inc] = li.querySelectorAll<HTMLButtonElement>(".nx-scan__step");
    dec.setAttribute("aria-label", fill(L.dec, { name }));
    inc.setAttribute("aria-label", fill(L.inc, { name }));
    dec.disabled = it.qty <= 0;
    li.querySelector(".nx-scan__qty")!.setAttribute("aria-label", name);
    const input = li.querySelector<HTMLInputElement>(".nx-scan__n")!;
    input.setAttribute("aria-label", fill(L.qtyOf, { name }));
    if (document.activeElement !== input) input.value = f(it.qty);
    input.size = Math.max(2, input.value.length);
    li.querySelector(".nx-scan__unit")!.textContent = it.unit ?? "";
    const bar = li.querySelector<HTMLElement>(".nx-scan__bar")!;
    bar.hidden = !it.expected;
    if (it.expected) bar.style.setProperty("--_p", String(Math.min(1, it.qty / it.expected)));
  }
}

/** Las cámaras del equipo (sin la lista, ninguna: no hay botón para cambiar). */
async function cameras(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
  } catch {
    return [];
  }
}

function stopTracks(stream: MediaStream): void {
  for (const t of stream.getTracks()) t.stop();
}

/** El error de `getUserMedia`, en lo que se le puede decir a la persona. */
function problemOf(e: unknown): ScanProblem {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "nocamera";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "failed";
}
