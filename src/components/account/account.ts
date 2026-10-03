/**
 * `<nx-account>`: la tarjeta de cuenta al pie del menú lateral. Un clic abre un panel con todo lo de
 * la persona: empresa/sede/rol, estado, tema y color (con vista previa en vivo y una transición
 * circular desde el clic), enlaces de la app, idioma y formatos, atajos, «Ver como…» y cerrar
 * sesión. Además avisa antes de que venza la sesión y deja extenderla.
 *
 * - **Light DOM, un solo popover** (`popover="auto"`): capa superior, clic fuera y «uno a la vez» son
 *   nativos, y `<nx-keytips>` limita sus letras al panel. Las sub-vistas (empresa, idioma, ver como)
 *   reemplazan el contenido del mismo panel; Esc vuelve.
 * - **Cerrado no hace nada** salvo un `setTimeout` de la sesión (un intervalo de 1 s solo en el tramo
 *   del aviso) y el de «No molestar hasta…».
 * - **Lo pesado va aparte:** el panel (`./account-panel`) y la cola de `nx-sync` se cargan con
 *   `import()`; el panel, en reposo, antes de usarlo. La franja de «Ver como» (`./view-as`) va en la
 *   entrada: un aviso de suplantación no puede depender de la red.
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
import type { SyncQueue } from "../sync/logic";
import { showViewAsBanner } from "./view-as";

/** Un módulo aparte, una sola vez por página. Si falla (sin red), se reintenta en el próximo pedido. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined;
  return () =>
    (loading ??= load().catch((err) => {
      loading = undefined;
      throw err;
    }));
}
let panel: typeof import("./account-panel") | undefined;
/** El contenido del panel. */
const loadPanel = once(() => import("./account-panel").then((m) => (panel = m)));
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
  viewingAs: "Viendo como {name}.",
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
/** El avatar: la foto o, sin ella o si no carga (una URL vencida), las iniciales. */
function avatarContent(u: AccountUser | null): Node | string {
  const src = safeImageSrc(u?.avatar);
  if (!src) return accountInitials(u);
  const img = h("img", { src, alt: "", referrerpolicy: "no-referrer" });
  img.addEventListener("error", () => img.replaceWith(accountInitials(u)), { once: true });
  return img;
}
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
  const p = readAccountPrefs(storage);
  if (typeof document !== "undefined") applyLook(p.theme, p.palette);
  return p;
}

/** Lo guardado por `<nx-account>` (clave `storage`), sin aplicarlo. */
function readAccountPrefs(storage: string): AccountPrefs {
  try {
    if (storage !== "none") return parsePrefs(localStorage.getItem(storage));
  } catch {
    /* sin almacenamiento */
  }
  return {};
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
    attrProps(this, ["applyLocale", "expiresAt", "viewAsSource", "logoutUrl", "logoutMethod", "logoutCsrf", "logoutCsrfField", "sync", "locale"]);
  }
  declare applyLocale: string | null;
  declare expiresAt: string | null;
  declare viewAsSource: string | null;
  /** A dónde ir al salir (mismo origen). Por defecto con `POST` (un formulario); `logout-method="get"` navega. */
  declare logoutUrl: string | null;
  declare logoutMethod: string | null;
  /** El token CSRF que lleva el `POST` de salida, en el campo `logout-csrf-field` (`_csrf`). */
  declare logoutCsrf: string | null;
  declare logoutCsrfField: string | null;
  /** El nombre de la cola de `nx-sync` de esta persona (`createSync({name})`): cuenta lo pendiente y
   *  la vacía antes de salir. Sin él, se escucha `nx-sync-change` de un `<nx-sync>` de la página y se
   *  vacía `nxSync`. */
  declare sync: string | null;
  declare locale: string | null;
  static observedAttributes = [
    ...JSON_ATTRS,
    "current",
    "status",
    "storage",
    "appearance",
    "expires-at",
    "warn-before",
    "view-as-source",
    "logout-url",
    "sync",
    "locale",
    "disabled",
  ];

  #uid = `nx-acc${++uid}`;
  #d: Data = { user: null, tenants: [], items: [], palettes: normalizePalettes(null), locales: DEFAULT_LOCALES, viewAs: null };
  #labels: AccountLabels = ACCOUNT_LABELS;
  /** Los `labels` tal como llegaron: también llevan los de la franja de «Ver como». */
  #rawLabels: Record<string, string> = {};
  #session: { expiresAt: number | null; extendEndpoint?: string } = { expiresAt: null };
  #phase: ReturnType<typeof sessionPhase> = "none";
  #extending = false;
  #unbanner?: () => void;
  #until: number | null = null;
  #untilChoice = "";
  #prefs: AccountPrefs = {};
  #net = { online: true, pending: 0 };
  /** La cola de `sync`, cuando ya existe. */
  #queue: SyncQueue | null = null;
  #unsub?: () => void;
  /** Cada cambio de `sync` (o desconexión) descarta lo que llegue de antes. */
  #syncGen = 0;
  /** Las acciones para `<nx-command>`, mientras no cambie lo que las arma (mismos objetos). */
  #cmds?: { deps: unknown[]; list: AccountCommand[] };
  /** Cerrando sesión con cambios en cola: `stuck` si pasó el tope. */
  #leaving: { stuck: boolean } | null = null;
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
  #timers: Record<"session" | "tick" | "until" | "leave", ReturnType<typeof setTimeout> | undefined> = { session: undefined, tick: undefined, until: undefined, leave: undefined };
  #ac?: AbortController;
  #openAc?: AbortController;
  // Nodos.
  #card?: HTMLButtonElement;
  /** Las partes de la tarjeta: se actualizan en su lugar. */
  #cardAv?: HTMLSpanElement;
  #cardAvKey?: string;
  #cardName?: HTMLSpanElement;
  #cardOrg?: HTMLSpanElement;
  #cardExtra?: HTMLSpanElement;
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
          // La sub-vista de empresas abierta muestra la lista nueva (y no elige una que ya no está).
          if (k === "tenants" && this.#view === "tenant") this.#sub?.refresh(this.#d.tenants);
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
  get storage(): string {
    return this.getAttribute("storage") || "nx-account";
  }
  set storage(v: string) {
    this.#attr("storage", v);
  }
  /**
   * `false` (`appearance="false"`) quita Tema y Color del panel y de `commands`, y la cuenta deja de
   * tocar `<html>`: no aplica el tema ni la paleta guardados ni los cambia. Es para una app que maneja
   * su propia apariencia. Se decide antes de conectar: lo que ya se aplicó no se deshace.
   */
  get appearance(): boolean {
    return this.getAttribute("appearance") !== "false";
  }
  set appearance(v: boolean | string | null | undefined) {
    this.#attr("appearance", v === false || v === "false" ? "false" : null);
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
  /** Las acciones de la cuenta con la forma de los `items` de `<nx-command>` (ver `account="id"`). Es
   *  el mismo arreglo mientras no cambien los textos, las paletas, las empresas, los idiomas ni
   *  `view-as-source`: la paleta lo compara para saber si debe leerlo de nuevo. */
  get commands(): AccountCommand[] {
    const deps = [this.#labels, this.#d.palettes, this.#d.tenants, this.#d.locales, !!this.getAttribute("view-as-source"), this.appearance];
    const c = this.#cmds;
    if (!c || deps.some((d, i) => d !== c.deps[i]))
      this.#cmds = { deps, list: accountCommands({ account: this.#uid, labels: this.#labels, palettes: this.#d.palettes, tenants: this.#d.tenants, locales: this.#d.locales, viewAs: !!deps[4], appearance: !!deps[5] }) };
    return this.#cmds!.list;
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
    // Con `sync` se vacía esa cola (si todavía no existe, no hay nada suyo que contar ni enviar);
    // sin `sync`, la de la página.
    const flush = this.#queue ? this.#queue.flush() : this.sync ? Promise.resolve() : import("../sync/logic").then((m) => m.nxSync.flush());
    flush.catch(quiet);
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
    // Sin apariencia solo se lee: los recientes de empresa siguen sirviendo, `<html>` no se toca.
    this.#prefs = this.appearance ? applyAccountPrefs(this.storage) : readAccountPrefs(this.storage);
    this.#pageNet();
    document.addEventListener("nx-sync-change", (e) => this.sync || this.#onNet((e as CustomEvent).detail), { signal });
    document.addEventListener("nx-command-select", this.#onCommand, { signal });
    document.addEventListener("keydown", this.#onKey, { signal });
    document.addEventListener("visibilitychange", () => this.#scheduleSession(), { signal });
    this.#subscribe();
    this.#scheduleSession();
    this.#armUntil();
    this.#banner();
    this.#paint();
  }

  disconnectedCallback(): void {
    this.#ac?.abort();
    this.#openAc?.abort();
    this.#sub?.stop();
    this.#sub = undefined;
    this.#unsub?.();
    this.#unsub = undefined;
    this.#syncGen++;
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
    // Quitar el atributo es `null`: cada setter vuelve a lo de por defecto (sin usuario, sin franja…).
    if (JSON_ATTRS.includes(name)) {
      (this as unknown as Record<string, unknown>)[name === "view-as" ? "viewAs" : name] = value;
      return;
    }
    if (name === "expires-at") {
      this.#session = { ...this.#session, expiresAt: parseExpiry(value) };
      this.#scheduleSession();
    } else if (name === "warn-before") this.#scheduleSession();
    else if (name === "sync") {
      // Otra cola: lo contado de la anterior ya no vale.
      this.#net = { online: true, pending: 0 };
      if (!this.isConnected) return;
      this.#pageNet();
      this.#subscribe();
      return this.#paintNet();
    } else if (name === "disabled" && value !== null) this.hide();
    else if (name === "appearance" && value === "false") this.#preview(null);
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
    // La tarjeta se arma una vez; `#paint` cambia sus textos y el avatar en su lugar.
    this.#cardAv = h("span", { class: "nx-account__av", "aria-hidden": "true" }, new Text(), h("span", { class: "nx-account__dot" }));
    this.#cardName = h("span", { class: "nx-account__name" });
    this.#cardOrg = h("span", { class: "nx-account__org" });
    this.#cardExtra = h("span", { class: "nx-account__vh" });
    this.#card.append(this.#cardAv, h("span", { class: "nx-account__text" }, this.#cardName, this.#cardOrg, this.#cardExtra), glyph(UPDOWN, "nx-account__chev"));
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
        // La sub-vista se va con el panel: al reabrir se enfoca la vista principal, no un nodo viejo.
        this.#sub?.stop();
        this.#sub = undefined;
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

  /** La tarjeta, en su lugar: el avatar solo se rehace si cambió la foto o las iniciales. */
  #paint(): void {
    if (!this.#card) return;
    const L = this.#labels;
    const t = this.#tenant();
    const u = this.#d.user;
    toggleAttr(this, "data-session", this.#phase === "warn" || this.#phase === "expired" ? this.#phase : null);
    this.#card.disabled = this.disabled;
    this.#pop!.setAttribute("aria-label", L.account);
    const avKey = `${safeImageSrc(u?.avatar) ?? ""}|${accountInitials(u)}`;
    if (avKey !== this.#cardAvKey) {
      this.#cardAvKey = avKey;
      this.#cardAv!.firstChild!.replaceWith(avatarContent(u));
    }
    this.#cardName!.textContent = u?.name ?? L.account;
    const org = t ? [t.name, t.detail].filter(Boolean).join(" · ") : "";
    this.#cardOrg!.textContent = org;
    this.#cardOrg!.hidden = !org;
    this.#paintNet();
    this.#paintStrip(this.#strip!, false);
    // Una sub-vista no muestra nada de esto: no se rehace (movería el cursor de quien escribe).
    if (this.#open && this.#view === "main") this.#render();
  }

  /** Lo que depende de la conexión y la cola, en su lugar: `data-sync`, el texto oculto de la tarjeta
   *  y, cerrando sesión, la franja del panel. Un `nx-sync-change` no rehace nada más. */
  #paintNet(): void {
    if (!this.#card) return;
    const L = this.#labels;
    const net = this.#net;
    const sync = !net.online ? "offline" : net.pending ? "pending" : null;
    toggleAttr(this, "data-sync", sync);
    // Sin la franja (su módulo no cargó), la suplantación no puede quedar solo en el color del contorno.
    const p = this.#d.viewAs;
    const viewing = p && !this.#unbanner && L.viewingAs.replace("{name}", () => p.name);
    const extra = [viewing, this.status !== "online" && L[this.status], sync === "offline" && L.offline, net.pending > 0 && pendingText(net.pending, L, (n) => this.#num(n))].filter(Boolean).join(" ");
    this.#cardExtra!.textContent = extra ? ` · ${extra}` : "";
    this.#cardExtra!.hidden = !extra;
    const leaving = this.#leaving && this.#pop!.querySelector(".nx-account__leaving p");
    if (leaving) leaving.textContent = this.#leavingText();
  }

  #leavingText(): string {
    return `${pendingText(this.#net.pending, this.#labels, (x) => this.#num(x))} ${this.#leaving?.stuck ? this.#labels.pendingStuck : this.#labels.pendingWait}`;
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
    const u = this.#d.user;
    pop.dataset.view = "main";
    pop.replaceChildren(
      ...panel.mainView({
        uid: this.#uid,
        labels: this.#labels,
        avatar: h("span", { class: "nx-account__av nx-account__av--lg", "aria-hidden": "true" }, avatarContent(u)),
        user: u,
        tenant: this.#tenant(),
        hasTenants: !!this.#d.tenants.length,
        status: this.status,
        until: this.#untilChoice,
        appearance: this.appearance,
        theme: pickTheme(d.getAttribute("data-theme")),
        palette: (this.#previewing ? this.#was : d.getAttribute("data-nx-palette")) || "indigo",
        palettes: this.#d.palettes,
        items: this.#d.items,
        locale: this.#locale(),
        viewAs: this.#d.viewAs,
        viewAsSource: !!this.getAttribute("view-as-source"),
        strip: this.#phase === "warn" || this.#phase === "expired" ? this.#paintStrip(h("div"), true) : null,
        leaving: this.#leaving && { stuck: this.#leaving.stuck, text: this.#leavingText() },
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
    if (this.#sub && this.#pop!.contains(this.#sub.root)) this.#sub.focus();
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
          pick: (value, person) => {
            if (v === "locale") return this.#setLocale(value);
            if (v === "viewas") return void (person && this.#startViewAs(person));
            // `tenants` pudo cambiar con la sub-vista abierta: la que ya no está no se elige.
            const t = d.tenants.find((x) => x.id === value);
            if (t) this.#switchTo(t);
          },
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
    } else if (d.action === "logout") this.logout();
  };

  #switchTo(t: AccountTenant): void {
    if (t.id !== this.current) {
      if (!this.#emit("nx-account-switch", { tenant: t }, true)) return;
      this.current = t.id;
      this.#save({ recent: pushRecent(this.#prefs.recent ?? [], t.id) });
      const name = [t.name, t.detail].filter(Boolean).join(" · ");
      this.#say(this.#labels.switched.replace("{name}", () => name));
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
    if (!this.appearance) return;
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
    if (!this.appearance) return;
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

  /** Salir es cancelable, como entrar: la app puede cancelar, terminar la suplantación en el servidor
   *  y, cuando lo confirme, asignar `viewAs = null`. Hasta entonces la franja sigue. */
  #exitViewAs(): void {
    if (!this.#d.viewAs || !this.#emit("nx-account-view-as", { user: null }, true)) return;
    this.viewAs = null;
    this.hide();
  }

  /** La franja de «Ver como», si hay a quién y el elemento está en la página. Va en la entrada y no
   *  en un `import()`: Chromium recuerda un `import()` fallido hasta recargar, y suplantar sin aviso no
   *  puede depender de la red. La tarjeta lleva `data-view-as` siempre: sin franja, el CSS la marca y
   *  su texto oculto lo dice. */
  #banner(): void {
    this.#unbanner?.();
    this.#unbanner = undefined;
    const p = this.#d.viewAs;
    toggleAttr(this, "data-view-as", p ? p.id : null);
    if (!p || !this.isConnected) return;
    try {
      this.#unbanner = showViewAsBanner(p, { labels: this.#rawLabels, onExit: () => this.#exitViewAs() });
    } catch (err) {
      console.warn("[nx-account] no se pudo mostrar la franja", err);
    }
    this.#paintNet();
  }

  // ---------------------------------------------------------------- sincronización y salida

  /** Un `<nx-sync>` de la página muestra `nxSync`: cuenta solo si no hay una cola propia en `sync`. */
  #pageNet(): void {
    const st = this.sync ? null : (document.querySelector("nx-sync") as (HTMLElement & { state?: { online: boolean; pending: number } }) | null)?.state;
    if (st) this.#net = { online: st.online !== false, pending: Number(st.pending) || 0 };
  }

  /** La cola de `sync`, por su nombre: se busca en el registro de `nx-sync` (un `import()`) y, si la
   *  app todavía no la creó, se espera a que la cree. */
  #subscribe(): void {
    this.#unsub?.();
    this.#unsub = undefined;
    this.#queue = null;
    const gen = ++this.#syncGen;
    const name = this.sync;
    if (!name || !this.isConnected) return;
    import("../sync/logic").then((m) => {
      if (gen !== this.#syncGen) return;
      let off: (() => void) | undefined;
      const cancel = m.onSyncQueue(name, (q) => {
        this.#queue = q;
        off = q.subscribe((st) => this.#onNet(st));
      });
      this.#unsub = () => {
        cancel();
        off?.();
      };
    }, quiet);
  }

  #onNet(s: { online?: boolean; pending?: number } | undefined): void {
    if (!s) return;
    const net = { online: s.online !== false, pending: Math.max(0, Number(s.pending) || 0) };
    if (net.online === this.#net.online && net.pending === this.#net.pending) return;
    this.#net = net;
    if (this.#leaving && !net.pending) return this.#leave(0);
    this.#paintNet();
  }

  #leave(pending: number): void {
    clearTimeout(this.#timers.leave);
    this.#timers.leave = undefined;
    this.#leaving = null;
    if (!this.#emit("nx-account-logout", { pending }, true)) return this.#schedule();
    this.hide();
    const href = safeHref(this.getAttribute("logout-url"));
    if (!href) return;
    let u: URL;
    try {
      u = new URL(href, location.href);
    } catch {
      return; /* inválido */
    }
    if (u.origin !== location.origin) return console.warn(`[nx-account] logout-url de otro origen ignorado: ${u.origin}`);
    if (this.getAttribute("logout-method")?.toLowerCase() === "get") return location.assign(u.href);
    // Por defecto, `POST`: un `GET` que cierra sesión lo dispara cualquier <img> de otro sitio o un
    // precargador de enlaces. El formulario lleva las cookies (SameSite=Lax) y el token CSRF.
    const csrf = this.getAttribute("logout-csrf");
    // `target="_self"`: un `<base target>` de la página no lo manda a otra pestaña. El formulario no se
    // queda en el `body` (si la navegación no ocurre, otro intento no acumula uno más).
    const form = h("form", { method: "post", action: u.href, target: "_self", hidden: true }, csrf ? h("input", { type: "hidden", name: this.getAttribute("logout-csrf-field") || "_csrf", value: csrf }) : null);
    document.body.append(form);
    form.submit();
    setTimeout(() => form.remove(), 1000);
  }

  // ---------------------------------------------------------------- sesión

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
}
