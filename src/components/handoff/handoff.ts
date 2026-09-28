/**
 * `<nx-handoff>`: «sigue en el celular». En el escritorio, un botón muestra un QR con el enlace de
 * una sesión; el celular lo abre, toma la foto (o escanea, o firma) y lo que manda aparece solo en el
 * formulario: se entrega al elemento `for` (`extract(file)` de `<nx-doc-capture>`, `add(code)` de
 * `<nx-scan>`, `load(data)` de `<nx-signature>`, un `<input type=file>` o un campo de texto) después
 * de un `nx-handoff-item` cancelable.
 *
 * El mismo tag con `side="phone"` es la página que abre el QR: se carga aparte con `import()` y
 * el escritorio no la paga. El protocolo (seis rutas) está en `INTEGRATION.md`.
 *
 * La escucha es un stream SSE o NDJSON con reconexión de espera creciente y, si el stream no está
 * disponible, polling. Nada queda abierto al cerrar el panel, al vencer la sesión o al salir el
 * elemento de la página (un `AbortController` por escucha y otro por las descargas).
 */
import { Base, boolAttr } from "../../core/define";
import { h, safeEndpoint } from "../../core/dom";
import { mergeLabels } from "../../core/labels";
import { lineData, readLines } from "../../core/stream";
import { cleanKind, countText, countdown, fill, isFinal, parseHandoffEvent, parsePollEvents, parseSession, remaining, retryDelay, sessionUrl } from "./logic";
import { qrMatrix, qrSvgPath } from "./qr";
import type { HandoffEvent, HandoffItem, HandoffKind, HandoffLabels, HandoffPhoneLabels, HandoffSession, HandoffSide, HandoffState } from "./types";

export const HANDOFF_LABELS: HandoffLabels = {
  start: "Usar el celular",
  creating: "Preparando…",
  panel: "Seguir en el celular",
  scan: "Escanéalo con la cámara del celular",
  qr: "Código QR del enlace",
  copy: "Copiar enlace",
  copied: "Enlace copiado",
  expiresIn: "Vence en {t}",
  cancel: "Cancelar",
  waiting: "Esperando el celular…",
  connected: "Celular conectado",
  connectedDevice: "{device} conectado",
  receiving: "Recibiendo {what}…",
  received: "{what} desde el celular",
  again: "Recibir más",
  expired: "El enlace venció",
  restart: "Generar otro",
  error: "No se pudo conectar con el celular",
  retry: "Reintentar",
  photo1: "1 foto",
  photos: "{n} fotos",
  file1: "1 archivo",
  files: "{n} archivos",
  code1: "1 código",
  codes: "{n} códigos",
  signature1: "1 firma",
  signatures: "{n} firmas",
};

const PHONE = '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>';
const CHECK = '<path d="M20 6 9 17l-5-5"/>';
const PROPS = ["side", "endpoint", "for", "kind", "accept", "multiple", "context", "session", "token", "labels", "locale", "disabled"] as const;
/** Cada cuánto se consulta cuando no hay stream. */
const POLL_MS = 2000;
/** Fallos seguidos del stream antes de pasar a polling. */
const STREAM_TRIES = 3;
/** Una sesión que vence en menos de esto no se reusa con «Recibir más». */
const REUSE_MIN = 20_000;

/** Lo que el lado celular (chunk aparte) necesita del elemento. */
export interface PhoneHost {
  el: HTMLElement;
  endpoint: string | null;
  session: string | null;
  token: string | null;
  /** Los textos del escritorio ya mezclados, y lo que vino en `labels` (el celular mezcla los suyos). */
  labels: HandoffLabels;
  raw: unknown;
  emit(type: string, detail: unknown): void;
}

type Target = HTMLElement & { extract?: (f: File) => unknown; add?: (code: string, qty?: number, format?: string) => unknown; load?: (v: unknown) => unknown };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Una espera que termina antes si se aborta la señal (quien espera mira `signal.aborted`). */
const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });

/** Pone los archivos en un `<input type=file>`: con `DataTransfer` o, si no hay, una `FileList` de mentira (la lee el JS de la app; un envío nativo del formulario no la ve). */
export function setInputFiles(input: HTMLInputElement, files: File[]): void {
  try {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    input.files = dt.files;
    if (input.files?.length === files.length) return;
  } catch {
    /* sin DataTransfer: abajo */
  }
  const list = Object.assign([...files], { item: (i: number) => files[i] ?? null });
  Object.defineProperty(input, "files", { configurable: true, get: () => list });
}

/** Un ícono de trazo (24×24; el trazo lo pone el CSS). El marcado es SIEMPRE una constante de aquí, nunca un dato. */
function icon(inner: string, cls: string): HTMLSpanElement {
  const span = h("span", { class: cls, "aria-hidden": "true" });
  span.innerHTML = `<svg viewBox="0 0 24 24">${inner}</svg>`;
  return span;
}

/** Escribe en un campo como lo haría una persona (con el setter nativo, para React y compañía). */
function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const set = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (set) set.call(el, value);
  else el.value = value;
}

export class NxHandoff extends Base {
  // `side` se lee al conectarse (cambiarlo con el elemento en la página no lo rehace).
  static observedAttributes = ["labels", "context", "disabled", "kind"];

  #labels: HandoffLabels = HANDOFF_LABELS;
  #raw: unknown = undefined;
  #context: unknown = undefined;
  #state: HandoffState = "idle";
  #session: HandoffSession | null = null;
  /** La escucha en curso (stream o polling) y las descargas. */
  #listen?: AbortController;
  #dl?: AbortController;
  #timer?: ReturnType<typeof setInterval>;
  #seq = -Infinity;
  #seen = new Set<string>();
  #items: HandoffItem[] = [];
  #count = 0;
  #total = 0;
  #device = "";
  #error = "";
  #queue: Promise<void> = Promise.resolve();
  #built: HandoffSide | null = null;
  #phone?: { destroy(): void };
  // Nodos del escritorio.
  #startBtn?: HTMLButtonElement;
  #panel?: HTMLDivElement;
  #qr?: HTMLDivElement;
  #status?: HTMLParagraphElement;
  #expires?: HTMLParagraphElement;
  #copyBtn?: HTMLButtonElement;
  #cancelBtn?: HTMLButtonElement;
  #redo?: HTMLButtonElement;
  #summary?: HTMLParagraphElement;
  #summaryText?: HTMLSpanElement;
  #againBtn?: HTMLButtonElement;

  // ---------------------------------------------------------------- propiedades

  /** `desktop` (por defecto) o `phone`. */
  get side(): HandoffSide {
    return this.getAttribute("side") === "phone" ? "phone" : "desktop";
  }
  set side(v: HandoffSide) {
    this.#attr("side", v);
  }
  // Los atributos de texto (`endpoint`, `for`, `accept`, `session`, `token`, `locale`) se reflejan
  // tal cual: sus accesores se definen abajo, una sola vez, en el prototipo.
  /** La base de las rutas de la sesión (`/api/handoff`). Mismo origen o uno de `allowOrigins()`. */
  declare endpoint: string | null;
  /** El `id` del elemento que recibe: `<nx-doc-capture>`, `<nx-scan>`, `<nx-signature>`, `<input type=file>` o un campo de texto. */
  declare for: string | null;
  /** Tipos de archivo que acepta el celular (por defecto `image/*` para fotos). */
  declare accept: string | null;
  /** Lado celular: el id de la sesión (si no viene, `?s=` de la página). */
  declare session: string | null;
  /** Lado celular: el token (si no viene, `?t=` de la página). */
  declare token: string | null;
  declare locale: string | null;
  /** Qué se le pide al celular: `photo` (por defecto), `file`, `scan` o `signature`. */
  get kind(): HandoffKind {
    return cleanKind(this.getAttribute("kind"));
  }
  set kind(v: HandoffKind) {
    this.#attr("kind", v);
  }
  /** Si el celular puede mandar varias cosas. */
  get multiple(): boolean {
    return boolAttr(this, "multiple");
  }
  set multiple(v: boolean) {
    this.toggleAttribute("multiple", !!v);
  }
  /** JSON que viaja al servidor al crear la sesión (`{"doc":"OC-2291"}`). */
  get context(): unknown {
    return this.#context;
  }
  set context(v: unknown) {
    this.#context = v ?? undefined;
  }
  get labels(): HandoffLabels {
    return this.#labels;
  }
  /** Los textos de los dos lados (`HANDOFF_LABELS` y los del celular, `HANDOFF_PHONE_LABELS`). */
  set labels(v: Partial<HandoffLabels & HandoffPhoneLabels> | null | undefined) {
    this.#raw = v;
    this.#labels = mergeLabels(HANDOFF_LABELS, v);
    if (this.#built === "desktop") this.#paintLabels();
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    this.toggleAttribute("disabled", !!v);
  }
  /** En qué va el lado escritorio. */
  get state(): HandoffState {
    return this.#state;
  }

  // ---------------------------------------------------------------- API

  /** Crea la sesión y muestra el QR. Si la anterior terminó y sigue vigente, la reusa («Recibir más»). */
  async start(): Promise<void> {
    if (this.side === "phone" || this.disabled || this.#state === "creating") return;
    if (!this.#built) this.#build();
    const prev = this.#session;
    this.#stop();
    this.#round();
    if (prev && this.#state === "done" && remaining(prev.expiresAt) > REUSE_MIN) {
      this.#set("waiting");
      this.#open(prev);
      return;
    }
    this.#session = null;
    this.#seq = -Infinity;
    this.#seen.clear();
    this.#device = "";
    const url = safeEndpoint(this.endpoint);
    if (!url) return this.#fail("endpoint inválido");
    this.#set("creating");
    const ctrl = (this.#listen = new AbortController());
    try {
      const body: Record<string, unknown> = { kind: this.kind };
      if (this.accept) body.accept = this.accept;
      if (this.multiple) body.multiple = true;
      if (this.#context !== undefined) body.context = this.#context;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), credentials: "same-origin", signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = parseSession(await res.json());
      if (!s) throw new Error("respuesta sin id o url");
      // El enlace va a un teléfono: solo del mismo origen (o permitido) y siempre absoluto.
      const link = safeEndpoint(s.url);
      if (!link) throw new Error("el enlace del celular es de otro origen");
      s.url = new URL(link, location.href).href;
      if (ctrl.signal.aborted) return;
      this.#session = s;
      this.#set("waiting");
      this.#open(s);
    } catch (e) {
      if (!ctrl.signal.aborted) this.#fail(errText(e));
    }
  }

  /** Cierra el panel e invalida la sesión en el servidor (`DELETE`, sin esperar respuesta). */
  cancel(): void {
    const s = this.#session;
    const inside = this.#panel?.contains(document.activeElement);
    this.#stop();
    this.#dl?.abort();
    this.#session = null;
    const url = s && safeEndpoint(this.endpoint);
    if (url && s) fetch(sessionUrl(url, s.id), { method: "DELETE", credentials: "same-origin", keepalive: true }).catch(() => {});
    this.#set("idle");
    if (inside) this.#startBtn?.focus();
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
    if (this.#built !== this.side) this.#build();
    // Vuelve a la página (se movió en el DOM): la sesión sigue si no venció.
    else if (this.side === "desktop" && this.#session && (this.#state === "waiting" || this.#state === "connected" || this.#state === "receiving")) {
      if (!this.#dl || this.#dl.signal.aborted) this.#dl = new AbortController();
      this.#open(this.#session, false);
    }
  }

  disconnectedCallback(): void {
    // Nada abierto sin el elemento: ni stream, ni polling, ni descargas, ni el reloj.
    this.#stop();
    this.#dl?.abort();
    this.#dl = undefined;
    this.#phone?.destroy();
    this.#phone = undefined;
    if (this.side === "phone") this.#built = null;
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (name === "labels" || name === "context") {
      if (value === null) (this as unknown as Record<string, unknown>)[name] = null;
      else
        try {
          (this as unknown as Record<string, unknown>)[name] = JSON.parse(value);
        } catch {
          console.warn(`[nx-handoff] el atributo "${name}" no es JSON válido`);
        }
      return;
    }
    if (this.#built === "desktop") this.#paint();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined || v === "") this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #emit(type: string, detail: unknown, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  #set(state: HandoffState): void {
    if (this.#state === state) return this.#paint();
    this.#state = state;
    this.#paint();
    this.#emit("nx-handoff-state", { state });
  }

  /** Corta la escucha y el reloj (no las descargas: lo que ya llegó se entrega). */
  #stop(): void {
    this.#listen?.abort();
    this.#listen = undefined;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }

  /** Una ronda nueva: los contadores del panel y del resumen empiezan de cero. */
  #round(): void {
    this.#items = [];
    this.#count = 0;
    this.#total = 0;
    this.#error = "";
    this.#queue = Promise.resolve();
    this.#dl = new AbortController();
  }

  /** Falla la sesión. `show`: el mensaje es del servidor (un evento `error`) y se muestra tal cual. */
  #fail(message: string, show = false): void {
    this.#stop();
    this.#error = show ? message : "";
    this.#set("error");
    this.#emit("nx-handoff-error", { message });
  }

  #expire(): void {
    this.#stop();
    this.#set("expired");
  }

  /** El QR a la vista, el reloj andando y la escucha abierta. */
  #open(s: HandoffSession, focus = true): void {
    this.#paintQr(s.url);
    this.#tick();
    this.#timer = setInterval(() => this.#tick(), 1000);
    const ctrl = (this.#listen = new AbortController());
    void this.#run(s, ctrl.signal);
    if (focus) this.#panel?.focus({ preventScroll: true });
  }

  #tick(): void {
    const s = this.#session;
    if (!s) return;
    const left = remaining(s.expiresAt);
    if (this.#expires) this.#expires.textContent = fill(this.#labels.expiresIn, { t: countdown(left) });
    if (left <= 0) this.#expire();
  }

  /** La escucha: stream (SSE o NDJSON) con reconexión; polling si el stream no está o falla seguido. */
  async #run(s: HandoffSession, signal: AbortSignal): Promise<void> {
    const base = safeEndpoint(this.endpoint);
    if (!base) return;
    let poll = false;
    let fails = 0;
    const cred = { credentials: "same-origin" as const, signal };
    while (!signal.aborted) {
      const after = Number.isFinite(this.#seq) ? this.#seq : undefined;
      try {
        if (!poll) {
          const res = await fetch(sessionUrl(base, s.id, "/events", { after }), { ...cred, headers: { Accept: "text/event-stream, application/x-ndjson" } });
          if (res.status === 404 || res.status === 405 || res.status === 501) {
            poll = true;
            continue;
          }
          if (res.status === 410) return this.#expire();
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          let final = false;
          await readLines(res, (line) => {
            if (signal.aborted) return false;
            const ev = parseHandoffEvent(lineData(line));
            if (!ev) return;
            fails = 0;
            final = this.#handle(ev);
            return !final;
          });
          if (final || signal.aborted) return;
          // El servidor cerró sin terminar (un proxy, un despliegue): se reconecta enseguida.
          fails++;
        } else {
          const res = await fetch(sessionUrl(base, s.id, "", { after }), { ...cred, headers: { Accept: "application/json" } });
          if (res.status === 404 || res.status === 410) return this.#expire();
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          fails = 0;
          for (const ev of parsePollEvents(await res.json())) if (this.#handle(ev)) return;
          await wait(POLL_MS, signal);
          continue;
        }
      } catch (e) {
        // Las peticiones solo se abortan con nuestra señal: un AbortError es `signal.aborted`.
        if (signal.aborted) return;
        if (++fails >= STREAM_TRIES) poll = true;
      }
      await wait(retryDelay(fails), signal);
    }
  }

  /** Un evento de la sesión. Devuelve `true` si cierra la escucha. */
  #handle(ev: HandoffEvent): boolean {
    if (ev.seq !== undefined) {
      if (ev.seq <= this.#seq) return false;
      this.#seq = ev.seq;
    }
    switch (ev.type) {
      case "connected":
        this.#device = ev.device ?? "";
        if (this.#state === "waiting" || this.#state === "connected") this.#set("connected");
        break;
      case "progress":
        this.#total = Math.max(ev.total ?? 0, ev.received);
        this.#set("receiving");
        break;
      case "item": {
        const id = ev.item.id;
        if (id) {
          if (this.#seen.has(id)) return false;
          this.#seen.add(id);
        }
        this.#count++;
        this.#set("receiving");
        this.#deliver(ev.item);
        break;
      }
      case "done":
        this.#finish();
        break;
      case "expired":
        this.#expire();
        break;
      case "error":
        this.#fail(ev.message || this.#labels.error, !!ev.message);
        break;
    }
    return isFinal(ev);
  }

  /** El celular terminó: se espera a que se entregue lo que llegó, se cierra el panel y queda el resumen. */
  #finish(): void {
    this.#stop();
    const s = this.#session;
    void this.#queue.then(() => {
      if (this.#session !== s || !this.isConnected) return;
      const inside = this.#panel?.contains(document.activeElement);
      this.#set("done");
      this.#emit("nx-handoff-done", { items: [...this.#items] });
      if (inside) this.#againBtn?.focus();
    });
  }

  /** Entrega en orden: descarga (si es archivo), `nx-handoff-item` cancelable y, si nadie lo tomó, al destino. */
  #deliver(item: HandoffItem): void {
    const s = this.#session;
    const signal = this.#dl?.signal;
    this.#queue = this.#queue.then(async () => {
      if (this.#session !== s || signal?.aborted) return;
      let file: File | undefined;
      if (item.kind === "file") {
        file = await this.#download(item, signal);
        if (!file) return;
      }
      this.#items.push(item);
      this.#paint();
      if (!this.#emit("nx-handoff-item", file ? { item, file } : { item }, true)) return;
      const id = this.for;
      const root = this.getRootNode() as Document | ShadowRoot;
      const target = (id && ((root.getElementById?.(id) ?? document.getElementById(id)) as Target | null)) || null;
      if (target) this.#put(target, item, file);
    });
  }

  async #download(item: Extract<HandoffItem, { kind: "file" }>, signal?: AbortSignal): Promise<File | undefined> {
    const url = safeEndpoint(item.url);
    if (!url) {
      this.#emit("nx-handoff-error", { message: `archivo de otro origen: ${item.name}` });
      return undefined;
    }
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, { credentials: "same-origin", signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        return new File([blob], item.name, { type: item.type || blob.type });
      } catch (e) {
        if (signal?.aborted) return undefined;
        if (attempt >= 3) {
          this.#emit("nx-handoff-error", { message: `${item.name}: ${errText(e)}` });
          return undefined;
        }
        await new Promise((r) => setTimeout(r, retryDelay(attempt, 500, 4000)));
      }
    }
  }

  #put(target: Target, item: HandoffItem, file?: File): void {
    if (file) {
      if (typeof target.extract === "function") void target.extract(file);
      else if (target instanceof HTMLInputElement && target.type === "file") {
        setInputFiles(target, target.multiple ? [...(target.files ?? []), file] : [file]);
        this.#changed(target);
      }
    } else if (item.kind === "code") {
      if (typeof target.add === "function") target.add(item.code, 1, item.format ?? "");
      else if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type !== "file")) {
        setValue(target, item.code);
        this.#changed(target);
      }
    } else if (item.kind === "data") target.load?.(item.data); // `<nx-signature>`: la firma que llegó se pinta allí
  }

  #changed(el: HTMLElement): void {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // ---------------------------------------------------------------- pintado

  #build(): void {
    this.replaceChildren();
    this.#built = this.side;
    if (this.side === "phone") {
      // El lado celular pesa y el escritorio no lo usa: va en un chunk aparte.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      const host: PhoneHost = {
        el: this,
        endpoint: this.endpoint,
        session: this.session,
        token: this.token,
        get labels() {
          return self.#labels;
        },
        get raw() {
          return self.#raw;
        },
        emit: (type, detail) => this.#emit(type, detail),
      };
      void import("./handoff-phone").then((m) => {
        if (this.isConnected && this.#built === "phone" && !this.#phone) this.#phone = m.mountPhone(host);
      });
      return;
    }
    const L = this.#labels;
    this.#startBtn = h("button", { type: "button", class: "nx-ho__btn nx-ho__start" }, icon(PHONE, "nx-ho__icon"), h("span"));
    this.#startBtn.addEventListener("click", () => void this.start());
    this.#qr = h("div", { class: "nx-ho__qr" });
    this.#status = h("p", { class: "nx-ho__status", role: "status" });
    this.#expires = h("p", { class: "nx-ho__expires" });
    this.#copyBtn = h("button", { type: "button", class: "nx-ho__btn" });
    this.#copyBtn.addEventListener("click", () => this.#copy());
    this.#cancelBtn = h("button", { type: "button", class: "nx-ho__btn nx-ho__btn--quiet" });
    this.#cancelBtn.addEventListener("click", () => this.cancel());
    this.#redo = h("button", { type: "button", class: "nx-ho__btn" });
    this.#redo.addEventListener("click", () => {
      this.#session = null;
      void this.start();
    });
    this.#panel = h(
      "div",
      { class: "nx-ho__panel", role: "group", tabindex: "-1", hidden: true },
      this.#qr,
      h("div", { class: "nx-ho__body" }, h("p", { class: "nx-ho__steps" }), this.#status, this.#expires, h("div", { class: "nx-ho__actions" }, this.#copyBtn, this.#redo, this.#cancelBtn)),
    );
    this.#panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        this.cancel();
      }
    });
    this.#summaryText = h("span");
    this.#againBtn = h("button", { type: "button", class: "nx-ho__again" });
    this.#againBtn.addEventListener("click", () => void this.start());
    this.#summary = h("p", { class: "nx-ho__summary", hidden: true }, icon(CHECK, "nx-ho__ok"), this.#summaryText, this.#againBtn);
    this.append(this.#startBtn, this.#panel, this.#summary);
    this.#paintLabels();
  }

  #paintLabels(): void {
    const L = this.#labels;
    if (!this.#startBtn) return;
    this.#panel!.setAttribute("aria-label", L.panel);
    this.#panel!.querySelector(".nx-ho__steps")!.textContent = L.scan;
    this.#copyBtn!.textContent = L.copy;
    this.#cancelBtn!.textContent = L.cancel;
    this.#againBtn!.textContent = L.again;
    this.#qr!.querySelector("svg")?.setAttribute("aria-label", L.qr);
    this.#paint();
  }

  #paint(): void {
    if (this.#built !== "desktop" || !this.#startBtn) return;
    const L = this.#labels;
    const st = this.#state;
    this.dataset.state = st;
    const open = st !== "idle" && st !== "creating" && st !== "done";
    this.#startBtn.hidden = open || st === "done";
    this.#startBtn.disabled = this.disabled || st === "creating";
    this.#startBtn.lastChild!.textContent = st === "creating" ? L.creating : L.start;
    this.#panel!.hidden = !open;
    const live = st === "waiting" || st === "connected" || st === "receiving";
    this.#qr!.hidden = this.#expires!.hidden = this.#copyBtn!.hidden = !live;
    this.#redo!.hidden = live;
    this.#redo!.textContent = st === "expired" ? L.restart : L.retry;
    const what = countText(this.kind, Math.max(this.#count, this.#total), L);
    const text =
      st === "connected"
        ? this.#device
          ? fill(L.connectedDevice, { device: this.#device })
          : L.connected
        : st === "receiving"
          ? fill(L.receiving, { what })
          : st === "expired"
            ? L.expired
            : st === "error"
              ? this.#error || L.error
              : L.waiting;
    if (this.#status!.textContent !== text) this.#status!.textContent = text;
    this.#status!.dataset.tone = st;
    this.#summary!.hidden = st !== "done";
    this.#summaryText!.textContent = fill(L.received, { what: countText(this.kind, this.#items.length, L) });
    this.#againBtn!.disabled = this.disabled;
  }

  /** El QR del enlace: un solo `<path>` con las corridas fusionadas, zona tranquila de 4 módulos. */
  #paintQr(url: string): void {
    const m = qrMatrix(url, { ecc: "M" });
    const n = m.length + 8;
    // En el marcado solo van números (el tamaño y el `d`, que sale de la matriz); la etiqueta, que
    // puede venir de afuera (`labels`), va como atributo.
    this.#qr!.innerHTML = `<svg viewBox="0 0 ${n} ${n}" role="img" shape-rendering="crispEdges"><rect width="${n}" height="${n}"/><path d="${qrSvgPath(m)}"/></svg>`;
    this.#qr!.firstElementChild!.setAttribute("aria-label", this.#labels.qr);
    this.#qr!.dataset.url = url;
  }

  /** Copia el enlace. Sin `navigator.clipboard` (una intranet en `http://` no lo tiene), con `execCommand`. */
  #copy(): void {
    const url = this.#session?.url;
    if (!url) return;
    const b = this.#copyBtn!;
    const ok = () => {
      b.textContent = this.#labels.copied;
      setTimeout(() => (b.textContent = this.#labels.copy), 2000);
    };
    const legacy = () => {
      const t = h("textarea", { readonly: true, style: "position:fixed;opacity:0" });
      t.value = url;
      this.append(t);
      t.select();
      const done = document.execCommand?.("copy");
      t.remove();
      b.focus();
      if (done) ok();
    };
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (clip?.writeText) clip.writeText(url).then(ok, legacy);
    else legacy();
  }

}

for (const name of ["endpoint", "for", "accept", "session", "token", "locale"])
  Object.defineProperty(NxHandoff.prototype, name, {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute(name);
    },
    set(this: HTMLElement, v: string | null | undefined) {
      if (v === null || v === undefined || v === "") this.removeAttribute(name);
      else this.setAttribute(name, v);
    },
  });
