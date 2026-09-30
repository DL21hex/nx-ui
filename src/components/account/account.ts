/**
 * `<nx-account>`: la tarjeta de cuenta al pie del menú lateral. Un clic abre un panel con todo lo de
 * la persona: empresa/sede/rol, estado, tema y color (con vista previa en vivo y una transición
 * circular desde el clic), enlaces de la app, idioma y formatos, atajos, «Ver como…», bloquear y
 * cerrar sesión. Además avisa antes de que venza la sesión y deja extenderla.
 *
 * - **Light DOM, un solo popover** (`popover="auto"`): capa superior, clic fuera y «uno a la vez» son
 *   nativos, y `<nx-keytips>` limita sus letras al panel. Las sub-vistas (empresa, idioma, ver como)
 *   reemplazan el contenido del mismo panel; Esc vuelve.
 * - **Cerrado no hace nada** salvo un `setTimeout` de la sesión (un intervalo de 1 s solo en el tramo
 *   del aviso), el de inactividad (`lock-after`) y el de «No molestar hasta…».
 * - **Lo pesado va aparte:** la pantalla de bloqueo (`./lock`), la franja de «Ver como» (`./view-as`)
 *   y la cola de `nx-sync` se cargan con `import()` solo cuando se usan.
 */
import { Base, boolAttr, upgrade, attrProps } from "../../core/define";
import { h, safeEndpoint, safeHref, safeImageSrc } from "../../core/dom";
import { glyph } from "../../core/icons";
import { mergeLabels } from "../../core/labels";
import { canonicalLocale, resolveLocale } from "../../core/locale";
import { clampDelay } from "../../core/time";
import {
  accountCommands,
  accountInitials,
  cleanAccountItems,
  cleanLocales,
  cleanPerson,
  cleanTenants,
  cleanUser,
  formatRemaining,
  normalizePalettes,
  parseExpiry,
  parseJsonAttr,
  parsePrefs,
  pendingText,
  pickTheme,
  pushRecent,
  revealRadius,
  sessionPhase,
  sessionRemaining,
  statusUntil,
} from "./logic";
import type { AccountView } from "./account-panel";

type Panel = typeof import("./account-panel");
let panel: Panel | undefined;
let loading: Promise<Panel> | undefined;
/** El contenido del panel (módulo aparte): una sola vez por página. Si falla (sin red), se reintenta
 *  en el próximo pedido. */
function loadPanel(): Promise<Panel> {
  return (loading ??= import("./account-panel").then(
    (m) => (panel = m),
    (err) => {
      loading = undefined;
      throw err;
    },
  ));
}
import type {
  AccountCommand,
  AccountItem,
  AccountLabels,
  AccountLocale,
  AccountPalette,
  AccountPerson,
  AccountPrefs,
  AccountSession,
  AccountStatus,
  AccountSyncQueue,
  AccountTenant,
  AccountTheme,
  AccountUser,
} from "./types";

export const ACCOUNT_LABELS: AccountLabels = {
  account: "Cuenta",
  tenant: "Empresa y sede",
  search: "Buscar",
  empty: "Sin resultados",
  loading: "Buscando…",
  error: "No se pudo buscar",
  recent: "Recientes",
  status: "Estado",
  online: "En línea",
  away: "Ausente",
  dnd: "No molestar",
  until: "Hasta",
  hour: "1 h",
  today: "Hoy",
  forever: "Sin fin",
  theme: "Tema",
  light: "Claro",
  system: "Sistema",
  dark: "Oscuro",
  color: "Color",
  language: "Idioma y formatos",
  shortcuts: "Atajos de teclado",
  viewAs: "Ver como…",
  stopViewAs: "Dejar de ver como {name}",
  lock: "Bloquear pantalla",
  logout: "Cerrar sesión",
  back: "Volver",
  offline: "Sin conexión",
  pendingOne: "1 cambio sin sincronizar.",
  pendingMany: "{n} cambios sin sincronizar.",
  pendingWait: "Se envían antes de salir.",
  pendingStuck: "No se pudieron enviar; quedan guardados en este equipo.",
  logoutAnyway: "Salir de todos modos",
  sessionWarn: "Tu sesión vence en {time}",
  sessionAnnounce: "Tu sesión vence en {min} min. Puedes extenderla.",
  extend: "Extender",
  extending: "Extendiendo…",
  extendError: "No se pudo extender la sesión.",
  expired: "Tu sesión venció.",
  switched: "Ahora en {name}.",
};

const DEFAULT_LOCALES: AccountLocale[] = [
  { value: "es-CO", label: "Español (Colombia)" },
  { value: "es-MX", label: "Español (México)" },
  { value: "en-US", label: "English (United States)" },
  { value: "pt-BR", label: "Português (Brasil)" },
];

const UPDOWN = '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>';
const CLOCK = '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>';

/** Los datos que llegan como JSON (atributo o propiedad): cada uno con su limpieza. */
type Data = { user: AccountUser | null; tenants: AccountTenant[]; items: AccountItem[]; palettes: AccountPalette[]; locales: AccountLocale[]; viewAs: AccountPerson | null };
const CLEAN: { [K in keyof Data]: (v: unknown) => Data[K] } = {
  user: cleanUser,
  tenants: cleanTenants,
  items: cleanAccountItems,
  palettes: normalizePalettes,
  locales: (v) => {
    const l = cleanLocales(v);
    return l.length ? l : DEFAULT_LOCALES;
  },
  viewAs: cleanPerson,
};
const JSON_ATTRS = ["user", "tenants", "items", "palettes", "locales", "view-as", "session", "labels"];
const LOGOUT_WAIT = 10_000;

type View = "main" | "tenant" | "locale" | "viewas";
type ViewTransition = { ready: Promise<void>; finished: Promise<void>; updateCallbackDone: Promise<void> };

let uid = 0;
const quiet = () => {};
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const toggleAttr = (el: Element, name: string, v: string | null) => (v === null ? el.removeAttribute(name) : el.setAttribute(name, v));
/** Tema y paleta en `<html>`: `system` quita `data-theme` (manda el sistema). */
function applyLook(theme: AccountTheme | undefined, palette: string | undefined): void {
  const d = document.documentElement;
  if (theme) toggleAttr(d, "data-theme", theme === "system" ? null : theme);
  if (palette) d.setAttribute("data-nx-palette", palette);
}

/**
 * Aplica el tema y la paleta guardados por `<nx-account>` (clave `storage`). Llamarla en el `<head>`
 * (o importar la librería allí) evita el destello del tema por defecto antes del primer pintado.
 */
export function applyAccountPrefs(storage = "nx-account"): AccountPrefs {
  let p: AccountPrefs = {};
  try {
    if (storage !== "none") p = parsePrefs(localStorage.getItem(storage));
  } catch {
    /* sin almacenamiento */
  }
  if (typeof document !== "undefined") applyLook(p.theme, p.palette);
  return p;
}

/**
 * Un cambio de tema o de paleta con una transición circular desde `(x, y)`: la vista nueva crece
 * como un círculo sobre la vieja. Sin View Transitions o con movimiento reducido, directo.
 */
function reveal(x: number, y: number, update: () => void): void {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => ViewTransition };
  if (!doc.startViewTransition || reduced()) return update();
  const root = document.documentElement;
  root.setAttribute("data-nx-reveal", "");
  const r = revealRadius(x, y, innerWidth, innerHeight);
  const t = doc.startViewTransition(update);
  t.ready.then(() => {
    root.animate(
      { clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)", pseudoElement: "::view-transition-new(root)" },
    );
  }, quiet);
  t.updateCallbackDone.catch(quiet);
  t.finished.catch(quiet).finally(() => root.removeAttribute("data-nx-reveal"));
}

export class NxAccount extends Base {
  static {
    // `lock` queda solo como atributo: `lock()` es el método que bloquea la pantalla.
    attrProps(this, ["applyLocale", "expiresAt", "viewAsSource", "lockEndpoint", "lockAfter", "logoutUrl", "locale"]);
  }
  declare applyLocale: string | null;
  declare expiresAt: string | null;
  declare viewAsSource: string | null;
  declare lockEndpoint: string | null;
  declare lockAfter: string | null;
  declare logoutUrl: string | null;
  declare locale: string | null;
  static observedAttributes = [
    ...JSON_ATTRS,
    "current",
    "status",
    "storage",
    "expires-at",
    "warn-before",
    "view-as-source",
    "lock",
    "lock-endpoint",
    "lock-after",
    "logout-url",
    "locale",
    "disabled",
  ];

  #uid = `nx-acc${++uid}`;
  #d: Data = { user: null, tenants: [], items: [], palettes: normalizePalettes(null), locales: DEFAULT_LOCALES, viewAs: null };
  #labels: AccountLabels = ACCOUNT_LABELS;
  /** Los `labels` tal como llegaron: también llevan los de la pantalla de bloqueo y la franja. */
  #rawLabels: Record<string, string> = {};
  #session: { expiresAt: number | null; extendEndpoint?: string } = { expiresAt: null };
  #phase: ReturnType<typeof sessionPhase> = "none";
  #extending = false;
  #unbanner?: () => void;
  #until: number | null = null;
  #untilChoice = "";
  #prefs: AccountPrefs = {};
  #net = { online: true, pending: 0 };
  #queue: AccountSyncQueue | null = null;
  #unsub?: () => void;
  /** Cerrando sesión con cambios en cola: `stuck` si pasó el tope. */
  #leaving: { stuck: boolean } | null = null;
  #lockVerify?: (password: string) => Promise<boolean>;
  #locking = false;
  #activity = Date.now();
  // Panel.
  #open = false;
  #view: View = "main";
  /** La sub-vista abierta (módulo aparte). */
  #sub?: AccountView;
  #previewing = false;
  /** La paleta que había antes de la vista previa (a donde se vuelve). */
  #was: string | null = null;
  #hovering = false;
  #queued = false;
  // Temporizadores y listeners.
  #timers: Record<"session" | "tick" | "idle" | "until" | "leave", ReturnType<typeof setTimeout> | undefined> = { session: undefined, tick: undefined, idle: undefined, until: undefined, leave: undefined };
  #ac?: AbortController;
  #openAc?: AbortController;
  // Nodos.
  #card?: HTMLButtonElement;
  #strip?: HTMLDivElement;
  #pop?: HTMLDivElement;
  #live?: HTMLParagraphElement;

  // ---------------------------------------------------------------- propiedades

  /** `{name, email?, avatar?, initials?}` */
  declare user: AccountUser | null;
  /** `[{id, name, detail?, role?, group?}]` */
  declare tenants: AccountTenant[];
  /** Enlaces de la app: `[{id, label, icon?, href?, hint?}]`. */
  declare items: AccountItem[];
  /** `["indigo", "oceano", …]` o `[{id, label, color}]`. Por defecto, las 9 de `palettes.css`. */
  declare palettes: AccountPalette[];
  /** `[{value, label}]`. Por defecto es-CO, es-MX, en-US y pt-BR. */
  declare locales: AccountLocale[];
  /** La persona que se está suplantando (`{id, name, role?, avatar?}`), o `null`: muestra la franja. */
  declare viewAs: AccountPerson | null;
  /** Id de la empresa/sede actual. */
  declare current: string | null;

  static {
    // Una propiedad por dato (acepta el objeto o su JSON); el atributo del mismo nombre pasa por aquí.
    for (const k of Object.keys(CLEAN) as (keyof Data)[])
      Object.defineProperty(this.prototype, k, {
        configurable: true,
        get(this: NxAccount) {
          return this.#d[k];
        },
        set(this: NxAccount, v: unknown) {
          (this.#d as Record<string, unknown>)[k] = CLEAN[k](parseJsonAttr(v));
          if (k === "viewAs") this.#banner();
          if (k === "user") this.#relock();
          this.#schedule();
        },
      });
    Object.defineProperty(this.prototype, "current", {
      configurable: true,
      get(this: NxAccount) {
        return this.getAttribute("current");
      },
      set(this: NxAccount, v: string | null | undefined) {
        this.#attr("current", v);
      },
    });
  }

  get status(): AccountStatus {
    const s = this.getAttribute("status");
    return s === "away" || s === "dnd" ? s : "online";
  }
  set status(v: AccountStatus | null | undefined) {
    this.#attr("status", v);
  }
  get labels(): AccountLabels {
    return this.#labels;
  }
  set labels(v: Partial<AccountLabels> | string | null | undefined) {
    const o = parseJsonAttr(v);
    this.#rawLabels = o && typeof o === "object" ? (o as Record<string, string>) : {};
    this.#labels = mergeLabels(ACCOUNT_LABELS, o);
    this.#schedule();
  }
  /** `{expiresAt: ISO | epoch ms, extendEndpoint?}`; `expires-at` también sirve. */
  get session(): AccountSession | null {
    const s = this.#session;
    return s.expiresAt === null ? null : { expiresAt: s.expiresAt, extendEndpoint: s.extendEndpoint };
  }
  set session(v: AccountSession | string | null | undefined) {
    const o = parseJsonAttr(v) as Partial<AccountSession> | null;
    this.#session = { expiresAt: parseExpiry(o?.expiresAt), extendEndpoint: typeof o?.extendEndpoint === "string" ? o.extendEndpoint : undefined };
    this.#scheduleSession();
  }
  /** Minutos de aviso antes de que venza (5). */
  get warnBefore(): number {
    const n = Number(this.getAttribute("warn-before") ?? 5);
    return Number.isFinite(n) && n >= 0 ? n : 5;
  }
  set warnBefore(v: number | null) {
    this.#attr("warn-before", v == null ? null : String(v));
  }
  /** Una cola de `nx-sync` (`nxSync`) para contar lo pendiente y vaciarla antes de salir. Sin ella,
   *  se escucha `nx-sync-change` de un `<nx-sync>` de la página. */
  get sync(): AccountSyncQueue | null {
    return this.#queue;
  }
  set sync(v: AccountSyncQueue | null | undefined) {
    this.#queue = v && typeof v.subscribe === "function" ? v : null;
    if (this.isConnected) this.#subscribe();
  }
  /** Para la pantalla de bloqueo sin `lock-endpoint`: la app verifica la clave. */
  get lockVerify(): ((password: string) => Promise<boolean>) | undefined {
    return this.#lockVerify;
  }
  set lockVerify(v: ((password: string) => Promise<boolean>) | undefined) {
    this.#lockVerify = typeof v === "function" ? v : undefined;
  }
  get storage(): string {
    return this.getAttribute("storage") || "nx-account";
  }
  set storage(v: string) {
    this.#attr("storage", v);
  }
  get disabled(): boolean {
    return boolAttr(this, "disabled");
  }
  set disabled(v: boolean) {
    this.#attr("disabled", v ? "" : null);
  }
  get open(): boolean {
    return this.#open;
  }
  /** Las acciones de la cuenta con la forma de los `items` de `<nx-command>` (ver `account="id"`). */
  get commands(): AccountCommand[] {
    return accountCommands({ account: this.#uid, labels: this.#labels, palettes: this.#d.palettes, tenants: this.#d.tenants, locales: this.#d.locales, viewAs: !!this.getAttribute("view-as-source"), lock: this.#lockOn() });
  }

  // ---------------------------------------------------------------- API

  show(): void {
    if (this.disabled || this.#open || !this.#pop) return;
    this.#pop.showPopover?.();
    if (this.#open) this.#focusFirst();
  }
  hide(): void {
    if (this.#open) this.#pop!.hidePopover?.();
  }

  /** Bloquea la pantalla (carga `./lock` la primera vez). Se resuelve al desbloquear. */
  lock(): Promise<void> {
    if (!this.#d.user || this.#locking) return Promise.resolve();
    this.#locking = true;
    this.hide();
    return import("./lock")
      .then((m) =>
        m.nxLock({
          user: this.#d.user!,
          endpoint: this.getAttribute("lock-endpoint") ?? undefined,
          verify: this.#lockVerify,
          labels: this.#rawLabels,
          locale: resolveLocale(this),
          onLogout: () => this.logout(),
        }),
      )
      .catch((err) => console.warn("[nx-account] no se pudo bloquear", err))
      .finally(() => {
        this.#locking = false;
        this.#activity = Date.now();
        this.#armIdle();
      });
  }

  /**
   * Cierra sesión. Con cambios sin sincronizar, primero los envía (el panel lo dice) y espera a que
   * la cola se vacíe, con tope; «Salir de todos modos» no espera. Sin pendientes, sale directo.
   */
  logout(): void {
    if (this.#leaving) return;
    if (!this.#net.pending) return this.#leave(0);
    this.#leaving = { stuck: false };
    this.show();
    this.#render();
    this.#say(`${pendingText(this.#net.pending, this.#labels, (n) => this.#num(n))} ${this.#labels.pendingWait}`);
    (this.#queue ? this.#queue.flush() : import("../sync/logic").then((m) => m.nxSync.flush())).catch(quiet);
    this.#timers.leave = setTimeout(() => {
      if (!this.#leaving) return;
      this.#leaving.stuck = true;
      this.#render();
    }, LOGOUT_WAIT);
  }

  // ---------------------------------------------------------------- ciclo de vida

  connectedCallback(): void {
    upgrade(this);
    if (!this.#card) this.#build();
    this.#ac?.abort();
    const signal = (this.#ac = new AbortController()).signal;
    // Lo guardado se aplica al conectar (si no se aplicó ya en el <head> con `applyAccountPrefs`).
    this.#prefs = applyAccountPrefs(this.storage);
    const st = (document.querySelector("nx-sync") as (HTMLElement & { state?: { online: boolean; pending: number } }) | null)?.state;
    if (st) this.#net = { online: st.online !== false, pending: Number(st.pending) || 0 };
    document.addEventListener("nx-sync-change", (e) => this.#onNet((e as CustomEvent).detail), { signal });
    document.addEventListener("nx-command-select", this.#onCommand, { signal });
    document.addEventListener("keydown", this.#onKey, { signal });
    document.addEventListener("visibilitychange", () => (this.#scheduleSession(), this.#armIdle()), { signal });
    const seen = () => (this.#activity = Date.now());
    for (const t of ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"]) document.addEventListener(t, seen, { signal, capture: true, passive: true });
    this.#subscribe();
    this.#scheduleSession();
    this.#armIdle();
    this.#armUntil();
    this.#banner();
    this.#paint();
    this.#relock();
  }

  disconnectedCallback(): void {
    this.#ac?.abort();
    this.#openAc?.abort();
    this.#sub?.stop();
    this.#unsub?.();
    this.#unsub = undefined;
    const t = this.#timers;
    for (const k in t) {
      clearTimeout(t[k as keyof typeof t]);
      clearInterval(t[k as keyof typeof t]);
      t[k as keyof typeof t] = undefined;
    }
    this.#unbanner?.();
    this.#unbanner = undefined;
    // Un popover que se saca del documento se oculta SIN `beforetoggle`: sin esto quedaría «abierto».
    if (this.#previewing) this.#preview(null);
    this.#open = false;
    this.#view = "main";
    this.#leaving = null;
    this.#card?.setAttribute("aria-expanded", "false");
  }

  attributeChangedCallback(name: string, _old: string | null, value: string | null): void {
    if (JSON_ATTRS.includes(name)) {
      if (value !== null) (this as unknown as Record<string, unknown>)[name === "view-as" ? "viewAs" : name] = value;
      return;
    }
    if (name === "expires-at") {
      this.#session = { ...this.#session, expiresAt: parseExpiry(value) };
      this.#scheduleSession();
    } else if (name === "warn-before") this.#scheduleSession();
    else if (name === "lock-after" || name === "lock" || name === "lock-endpoint") this.#armIdle(), this.#relock();
    else if (name === "disabled" && value !== null) this.hide();
    this.#schedule();
  }

  // ---------------------------------------------------------------- interno

  #attr(name: string, v: string | null | undefined): void {
    if (v === null || v === undefined) this.removeAttribute(name);
    else this.setAttribute(name, v);
  }

  #emit<T>(type: string, detail: T, cancelable = false): boolean {
    return this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true, cancelable }));
  }

  #say(text: string): void {
    if (this.#live) this.#live.textContent = text + (this.#live.textContent === text ? " " : "");
  }

  #num(n: number): string {
    return n.toLocaleString(resolveLocale(this));
  }

  /** Se recargó la página estando bloqueada (`./lock` deja `nx-locked` en sessionStorage): vuelve a
   *  bloquear en cuanto hay usuario y bloqueo activo. Se mira aquí, sin cargar `./lock`. */
  #relock(): void {
    let locked = false;
    try {
      locked = sessionStorage.getItem("nx-locked") !== null;
    } catch {
      /* sin almacenamiento: el bloqueo no sobrevivió a la recarga */
    }
    if (locked && this.isConnected && this.#lockOn() && this.#d.user && !this.#locking && !this.disabled) void this.lock();
  }

  #lockOn(): boolean {
    return boolAttr(this, "lock") || this.hasAttribute("lock-endpoint");
  }

  #tenant(): AccountTenant | undefined {
    return this.#d.tenants.find((t) => t.id === this.current);
  }

  #save(patch: AccountPrefs): void {
    this.#prefs = { ...this.#prefs, ...patch };
    if (this.storage === "none") return;
    try {
      localStorage.setItem(this.storage, JSON.stringify(this.#prefs));
    } catch {
      /* lleno o bloqueado: dura lo que la visita */
    }
  }

  #schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected) this.#paint();
    });
  }

  #build(): void {
    const popId = `${this.#uid}-pop`;
    this.#strip = h("div", { class: "nx-account__session", hidden: true });
    this.#card = h("button", { type: "button", class: "nx-account__card", popovertarget: popId, "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": popId });
    this.#pop = h("div", { id: popId, class: "nx-account__pop", popover: "auto", role: "dialog" });
    this.#live = h("p", { class: "nx-account__vh", role: "status" });
    this.append(this.#strip, this.#card, this.#pop, this.#live);
    // El panel se trae en cuanto la página queda libre, o antes si alguien apunta a la tarjeta: así
    // abrirlo es inmediato (también sin red, si ya se había cargado).
    const fetchPanel = () => void loadPanel().catch(quiet);
    for (const t of ["pointerenter", "focus", "touchstart"]) this.#card.addEventListener(t, fetchPanel, { passive: true });
    (globalThis.requestIdleCallback ?? setTimeout)(fetchPanel, { timeout: 4000 } as never);

    const pop = this.#pop;
    pop.addEventListener("beforetoggle", (e) => {
      const open = (e as ToggleEvent).newState === "open";
      if (open === this.#open) return;
      this.#open = open;
      this.#card!.setAttribute("aria-expanded", String(open));
      this.#openAc?.abort();
      if (open) {
        this.#view = "main";
        this.#render();
        requestAnimationFrame(() => this.#open && this.#place());
        addEventListener("resize", () => this.#place(), { passive: true, signal: (this.#openAc = new AbortController()).signal });
      } else {
        this.#sub?.stop();
        this.#preview(null);
      }
      this.#emit("nx-open-change", { open });
    });
    pop.addEventListener("toggle", (e) => {
      if ((e as ToggleEvent).newState === "open") {
        if (this.#open && !pop.contains(document.activeElement)) this.#focusFirst();
      } else if (!this.#open) {
        const a = document.activeElement;
        if (!a || a === document.body || pop.contains(a)) this.#card?.focus({ preventScroll: true });
      }
    });
    this.addEventListener("click", this.#onClick);
    pop.addEventListener("keydown", this.#onPopKey);
    // Vista previa de la paleta: al pasar el mouse o el foco por una muestra; al salir, vuelve.
    const swatch = (t: EventTarget | null) => (t as Element | null)?.closest?.<HTMLElement>(".nx-account__sw");
    pop.addEventListener("pointerover", (e) => {
      const sw = swatch(e.target);
      this.#hovering = !!sw && (e as PointerEvent).pointerType !== "touch";
      if (this.#hovering) this.#preview(sw!.dataset.palette!);
    });
    pop.addEventListener("pointerout", (e) => {
      if (swatch(e.relatedTarget)) return;
      this.#hovering = false;
      if (!swatch(document.activeElement)) this.#preview(null);
    });
    pop.addEventListener("focusin", (e) => {
      const sw = swatch(e.target);
      if (sw) this.#preview(sw.dataset.palette!);
    });
    pop.addEventListener("focusout", (e) => {
      if (swatch(e.target) && !swatch(e.relatedTarget) && !this.#hovering) this.#preview(null);
    });
  }

  // ---------------------------------------------------------------- pintado

  #avatar(big: boolean): HTMLElement {
    const u = this.#d.user;
    const src = safeImageSrc(u?.avatar);
    return h(
      "span",
      { class: big ? "nx-account__av nx-account__av--lg" : "nx-account__av", "aria-hidden": "true" },
      src ? h("img", { src, alt: "", referrerpolicy: "no-referrer" }) : accountInitials(u),
      big ? null : h("span", { class: "nx-account__dot" }),
    );
  }

  #paint(): void {
    if (!this.#card) return;
    const L = this.#labels;
    const t = this.#tenant();
    const net = this.#net;
    const sync = !net.online ? "offline" : net.pending ? "pending" : null;
    toggleAttr(this, "data-sync", sync);
    toggleAttr(this, "data-session", this.#phase === "warn" || this.#phase === "expired" ? this.#phase : null);
    const extra = [this.status !== "online" && L[this.status], sync === "offline" && L.offline, net.pending > 0 && pendingText(net.pending, L, (n) => this.#num(n))].filter(Boolean).join(" ");
    this.#card.disabled = this.disabled;
    this.#pop!.setAttribute("aria-label", L.account);
    this.#card.replaceChildren(
      this.#avatar(false),
      h(
        "span",
        { class: "nx-account__text" },
        h("span", { class: "nx-account__name" }, this.#d.user?.name ?? L.account),
        t ? h("span", { class: "nx-account__org" }, [t.name, t.detail].filter(Boolean).join(" · ")) : null,
        extra ? h("span", { class: "nx-account__vh" }, ` · ${extra}`) : null,
      ),
      glyph(UPDOWN, "nx-account__chev"),
    );
    this.#paintStrip(this.#strip!, false);
    // Una sub-vista no muestra nada de esto: no se rehace (movería el cursor de quien escribe).
    if (this.#open && this.#view === "main") this.#render();
  }

  /** La franja de la sesión (en la tarjeta y arriba del panel): cuenta regresiva y «Extender». */
  #paintStrip(el: HTMLElement, inPanel: boolean): HTMLElement {
    const L = this.#labels;
    const warn = this.#phase === "warn";
    el.hidden = !warn && this.#phase !== "expired";
    el.className = `nx-account__session${inPanel ? " nx-account__session--pop" : ""}`;
    if (el.hidden) return el;
    const [before, after = ""] = L.sessionWarn.split("{time}");
    const left = sessionRemaining(this.#session.expiresAt, Date.now()) ?? 0;
    el.replaceChildren(
      glyph(CLOCK),
      h("span", { class: "nx-account__stext" }, ...(warn ? [before, h("b", { class: "nx-account__time" }, formatRemaining(left)), after] : [L.expired])),
      warn ? h("button", { type: "button", class: "nx-account__extend", "data-k": "extend", disabled: this.#extending }, this.#extending ? L.extending : L.extend) : "",
    );
    return el;
  }

  /**
   * La vista principal, conservando el foco (por `data-k`). Si el módulo del panel aún no llegó
   * (alguien abrió en el primer instante), se pinta cuando llegue y ahí se enfoca.
   */
  #render(): void {
    const pop = this.#pop!;
    if (!panel) {
      void loadPanel().then(() => {
        if (!this.#open || this.#view !== "main") return;
        this.#render();
        if (!pop.contains(document.activeElement)) this.#focusFirst();
      }, (err) => console.warn("[nx-account]", err));
      return;
    }
    const focused = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>("[data-k]");
    const key = focused && pop.contains(focused) ? focused.dataset.k : null;
    const d = document.documentElement;
    const n = this.#net.pending;
    pop.dataset.view = "main";
    pop.replaceChildren(
      ...panel.mainView({
        uid: this.#uid,
        labels: this.#labels,
        avatar: this.#avatar(true),
        user: this.#d.user,
        tenant: this.#tenant(),
        hasTenants: !!this.#d.tenants.length,
        status: this.status,
        until: this.#untilChoice,
        theme: pickTheme(d.getAttribute("data-theme")),
        palette: (this.#previewing ? this.#was : d.getAttribute("data-nx-palette")) || "indigo",
        palettes: this.#d.palettes,
        items: this.#d.items,
        locale: this.#locale(),
        viewAs: this.#d.viewAs,
        viewAsSource: !!this.getAttribute("view-as-source"),
        lock: this.#lockOn(),
        strip: this.#phase === "warn" || this.#phase === "expired" ? this.#paintStrip(h("div"), true) : null,
        leaving: this.#leaving && { stuck: this.#leaving.stuck, text: `${pendingText(n, this.#labels, (x) => this.#num(x))} ${this.#leaving.stuck ? this.#labels.pendingStuck : this.#labels.pendingWait}` },
      }),
    );
    this.#place();
    if (key) this.#byKey(key)?.focus();
  }

  #byKey(k: string | undefined): HTMLElement | undefined {
    return [...this.#pop!.querySelectorAll<HTMLElement>("[data-k]")].find((x) => x.dataset.k === k);
  }

  #locale(): string {
    return canonicalLocale(document.documentElement.lang) || resolveLocale(this);
  }

  #place(): void {
    if (panel && this.#open) panel.placePanel(this.#pop!, this.#card!, this);
  }

  #focusFirst(): void {
    if (this.#sub) this.#sub.focus();
    else this.#pop!.querySelector<HTMLElement>("button:not([disabled]), a[href]")?.focus({ preventScroll: true });
  }

  /** Cambia de vista y enfoca: en una sub-vista el buscador (o el encabezado); al volver, la fila
   *  que la abrió. Las sub-vistas vienen del módulo del panel (ya cargado). */
  #go(v: View, from?: string): void {
    this.#sub?.stop();
    this.#sub = undefined;
    this.#view = v;
    if (v === "main") {
      this.#render();
      this.#byKey(from)?.focus({ preventScroll: true });
      return;
    }
    loadPanel()
      .then((m) => {
        if (this.#view !== v || !this.#open) return;
        const d = this.#d;
        this.#sub = m.accountView({
          kind: v,
          uid: this.#uid,
          labels: this.#labels,
          tenants: d.tenants,
          recent: this.#prefs.recent ?? [],
          current: this.current,
          locales: d.locales,
          locale: this.#locale(),
          source: this.getAttribute("view-as-source"),
          pick: (value, person) => (v === "tenant" ? this.#switchTo(d.tenants.find((t) => t.id === value)!) : v === "locale" ? this.#setLocale(value) : this.#startViewAs(person!)),
        });
        this.#pop!.dataset.view = v;
        this.#pop!.replaceChildren(this.#sub.root);
        this.#sub.focus();
      })
      .catch((err) => console.warn("[nx-account]", err));
  }

  // ---------------------------------------------------------------- acciones

  #onClick = (e: MouseEvent): void => {
    const el = (e.target as Element).closest?.<HTMLElement>("[data-k]");
    if (!el || !this.contains(el)) return;
    const k = el.dataset.k!;
    const [act, ...rest] = k.split(":");
    const value = rest.join(":");
    switch (act) {
      case "tenant":
      case "locale":
        return this.#go(act);
      case "viewas":
        if (this.#d.viewAs) return this.#exitViewAs();
        return this.#go("viewas");
      case "back":
        return this.#go("main", this.#view);
      case "status":
        return this.#setStatus(value as AccountStatus, this.#untilChoice);
      case "until":
        return this.#setStatus(this.status, value);
      case "theme":
      case "palette":
        return this.#setLook(act, value, e, el);
      case "item": {
        const it = this.#d.items.find((i) => i.id === value);
        if (it && !safeHref(it.href)) this.#emit("nx-account-select", { id: it.id });
        return this.hide();
      }
      case "shortcuts": {
        const kt = document.querySelector("nx-keytips") as (HTMLElement & { show?: () => void }) | null;
        this.hide();
        if (kt?.show) kt.show();
        else this.#emit("nx-account-select", { id: "shortcuts" });
        return;
      }
      case "lock":
        return void this.lock();
      case "logout":
        return this.logout();
      case "anyway":
        return this.#leave(this.#net.pending);
      case "extend":
        return void this.#extend();
    }
  };

  /** Esc vuelve de la sub-vista o cierra; las flechas las atiende el módulo del panel. */
  #onPopKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (this.#view !== "main") this.#go("main", this.#view);
      else this.hide();
      return;
    }
    panel?.panelKeys(e, this.#pop!);
  };

  #onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    // Esc con el foco fuera del panel (no todos los webviews cierran el popover solos).
    if (e.key === "Escape" && this.#open) {
      e.preventDefault();
      if (this.#view !== "main") this.#go("main", this.#view);
      else this.hide();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "l" && this.#lockOn() && !this.disabled && this.#d.user) {
      e.preventDefault();
      void this.lock();
    }
  };

  /** Una acción elegida en `<nx-command>` que viene de `commands`. */
  #onCommand = (e: Event): void => {
    const d = (e as CustomEvent<{ item?: { data?: { account?: string; action?: string; value?: string } } }>).detail?.item?.data;
    if (e.defaultPrevented || !d || d.account !== this.#uid) return;
    const v = d.value ?? "";
    if (d.action === "theme" || d.action === "palette") this.#setLook(d.action, v, null, null);
    else if (d.action === "tenant") {
      const t = this.#d.tenants.find((x) => x.id === v);
      if (t) this.#switchTo(t);
    } else if (d.action === "locale") this.#setLocale(v);
    else if (d.action === "view-as") {
      this.show();
      if (this.#open) this.#go("viewas");
    } else if (d.action === "lock") void this.lock();
    else if (d.action === "logout") this.logout();
  };

  #switchTo(t: AccountTenant): void {
    if (t.id !== this.current) {
      if (!this.#emit("nx-account-switch", { tenant: t }, true)) return;
      this.current = t.id;
      this.#save({ recent: pushRecent(this.#prefs.recent ?? [], t.id) });
      this.#say(this.#labels.switched.replace("{name}", [t.name, t.detail].filter(Boolean).join(" · ")));
    }
    this.hide();
  }

  #setStatus(status: AccountStatus, choice: string): void {
    this.#untilChoice = status === "online" ? "" : choice;
    this.#until = status === "online" ? null : statusUntil(choice, Date.now());
    this.status = status;
    this.#armUntil();
    this.#emit("nx-account-status", { status, until: this.#until });
  }

  /** «No molestar hasta…»: un solo `setTimeout`; al cumplirse vuelve a «En línea». */
  #armUntil(): void {
    clearTimeout(this.#timers.until);
    this.#timers.until = undefined;
    if (this.#until === null || !this.isConnected) return;
    this.#timers.until = setTimeout(() => {
      if (this.#until !== null && Date.now() >= this.#until) this.#setStatus("online", "");
      else this.#armUntil();
    }, clampDelay(this.#until - Date.now()));
  }

  /** Tema o paleta: se aplica con la transición circular desde el clic, se guarda y se avisa. */
  #setLook(kind: "theme" | "palette", value: string, e: MouseEvent | null, from: Element | null): void {
    const d = document.documentElement;
    // Con la vista previa puesta, la transición sale desde lo que estaba elegido (no desde la muestra):
    // el círculo que crece desde el clic confirma la elección.
    this.#preview(null);
    const theme = kind === "theme" ? pickTheme(value) : pickTheme(d.getAttribute("data-theme"));
    const palette = kind === "palette" ? value : d.getAttribute("data-nx-palette") || "indigo";
    const r = from?.getBoundingClientRect();
    const x = e?.detail && e.clientX ? e.clientX : r ? r.left + r.width / 2 : innerWidth / 2;
    const y = e?.detail && e.clientY ? e.clientY : r ? r.top + r.height / 2 : innerHeight / 2;
    reveal(x, y, () => {
      applyLook(theme, kind === "palette" ? palette : undefined);
      this.#render();
    });
    this.#save(kind === "theme" ? { theme } : { palette });
    this.#emit("nx-account-theme", { theme, palette });
  }

  /** Repinta toda la app con una paleta mientras se mira; `null` vuelve a la elegida. */
  #preview(id: string | null): void {
    const d = document.documentElement;
    if (id === null) {
      if (!this.#previewing) return;
      this.#previewing = false;
      toggleAttr(d, "data-nx-palette", this.#was);
      return;
    }
    // Lo que había (aunque no lo haya puesto esta cuenta), para volver exactamente ahí.
    if (!this.#previewing) this.#was = d.getAttribute("data-nx-palette");
    this.#previewing = true;
    d.setAttribute("data-nx-palette", id);
  }

  #setLocale(value: string): void {
    const loc = canonicalLocale(value);
    if (!loc) return;
    if (this.getAttribute("apply-locale") !== "false") document.documentElement.lang = loc;
    this.#emit("nx-account-locale", { locale: loc });
    if (this.#open) this.#go("main", "locale");
  }

  // ---------------------------------------------------------------- ver como

  #startViewAs(p: AccountPerson): void {
    if (!this.#emit("nx-account-view-as", { user: p }, true)) return;
    this.viewAs = p;
    this.hide();
  }

  #exitViewAs(): void {
    this.#d.viewAs = null;
    this.#banner();
    this.#emit("nx-account-view-as", { user: null });
    this.#schedule();
    if (this.#open) this.hide();
  }

  /** La franja de «Ver como» (módulo aparte), si hay a quién y el elemento está en la página. */
  #banner(): void {
    this.#unbanner?.();
    this.#unbanner = undefined;
    const p = this.#d.viewAs;
    if (!p || !this.isConnected) return;
    import("./view-as")
      .then((m) => {
        if (this.#d.viewAs !== p || !this.isConnected) return;
        this.#unbanner?.();
        this.#unbanner = m.showViewAsBanner(p, { labels: this.#rawLabels, onExit: () => this.#exitViewAs() });
      })
      .catch((err) => console.warn("[nx-account] no se pudo mostrar la franja", err));
  }

  // ---------------------------------------------------------------- sincronización y salida

  #subscribe(): void {
    this.#unsub?.();
    this.#unsub = this.#queue?.subscribe((s) => this.#onNet(s));
  }

  #onNet(s: { online?: boolean; pending?: number } | undefined): void {
    if (!s) return;
    this.#net = { online: s.online !== false, pending: Math.max(0, Number(s.pending) || 0) };
    if (this.#leaving && !this.#net.pending) return this.#leave(0);
    this.#schedule();
  }

  #leave(pending: number): void {
    clearTimeout(this.#timers.leave);
    this.#timers.leave = undefined;
    this.#leaving = null;
    if (!this.#emit("nx-account-logout", { pending }, true)) return this.#schedule();
    this.hide();
    const href = safeHref(this.getAttribute("logout-url"));
    if (!href) return;
    try {
      const u = new URL(href, location.href);
      if (u.origin === location.origin) location.assign(u.href);
      else console.warn(`[nx-account] logout-url de otro origen ignorado: ${u.origin}`);
    } catch {
      /* inválido */
    }
  }

  // ---------------------------------------------------------------- sesión e inactividad

  /**
   * Un `setTimeout` hasta la entrada al aviso; en el aviso, un intervalo de 1 s que solo cambia el
   * texto de la cuenta regresiva. Se anuncia una vez al entrar (no cada segundo) y al vencer.
   */
  #scheduleSession(): void {
    clearTimeout(this.#timers.session);
    clearInterval(this.#timers.tick);
    this.#timers.session = this.#timers.tick = undefined;
    if (!this.isConnected) return;
    const exp = this.#session.expiresAt;
    const warn = this.warnBefore * 60_000;
    const was = this.#phase;
    const phase = (this.#phase = sessionPhase(exp, Date.now(), warn));
    if (phase === "ok") this.#timers.session = setTimeout(() => this.#scheduleSession(), clampDelay(exp! - warn - Date.now()) + 20);
    else if (phase === "warn") {
      this.#timers.tick = setInterval(() => this.#tick(), 1000);
      if (was !== "warn") this.#say(this.#labels.sessionAnnounce.replace("{min}", String(Math.ceil((exp! - Date.now()) / 60_000))));
    } else if (phase === "expired" && was !== "expired") {
      this.#say(this.#labels.expired);
      this.#emit("nx-account-expired", { expiresAt: exp });
    }
    if (phase !== was) this.#schedule();
  }

  #tick(): void {
    const left = sessionRemaining(this.#session.expiresAt, Date.now()) ?? 0;
    if (left <= 0) return this.#scheduleSession();
    const text = formatRemaining(left);
    for (const b of this.querySelectorAll(".nx-account__time")) b.textContent = text;
  }

  async #extend(): Promise<void> {
    if (this.#extending || !this.#emit("nx-account-extend", { session: this.session }, true)) return;
    const url = safeEndpoint(this.#session.extendEndpoint);
    if (!url) return;
    this.#extending = true;
    this.#schedule();
    try {
      const res = await fetch(url, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const exp = parseExpiry(((await res.json()) as { expiresAt?: unknown } | null)?.expiresAt);
      if (exp === null) throw new Error("expiresAt");
      this.#session = { ...this.#session, expiresAt: exp };
    } catch {
      this.#say(this.#labels.extendError);
    }
    this.#extending = false;
    this.#scheduleSession();
    this.#schedule();
  }

  /** Bloqueo por inactividad: un solo `setTimeout` que, al cumplirse, mira cuándo fue lo último
   *  (los eventos solo anotan la hora) y se reprograma por lo que falte. Nada por frame. */
  #armIdle(): void {
    clearTimeout(this.#timers.idle);
    this.#timers.idle = undefined;
    const mins = Number(this.getAttribute("lock-after"));
    if (!this.isConnected || !(mins > 0) || !this.#lockOn() || this.#locking) return;
    const left = this.#activity + mins * 60_000 - Date.now();
    if (left <= 0) return void this.lock();
    this.#timers.idle = setTimeout(() => this.#armIdle(), clampDelay(left) + 20);
  }
}
