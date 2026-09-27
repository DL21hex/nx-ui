/**
 * `nxLock()`: bloquea la pantalla en un PC compartido (bodega, caja) sin perder lo que está a medio
 * llenar. Un `<dialog>` modal nativo tapa y desenfoca la app (el resto queda inerte: ni clic, ni
 * Tab, ni lector de pantalla) y pide la clave; los formularios de la app no se tocan.
 *
 *   await nxLock({ user: { name: "Laura Gómez", email: "laura@bodega.co" }, endpoint: "/api/unlock", onLogout });
 *
 * Es un bloqueo de INTERFAZ: la sesión real la protege el servidor (el endpoint puede exigir la
 * cookie de sesión y limitar intentos). La clave nunca va a atributos, `dataset` ni logs; el campo se
 * vacía al verificar y el diálogo se quita del DOM al desbloquear. Sin `verify` ni `endpoint` (o con
 * un endpoint de otro origen) no hay cómo desbloquear: solo queda «Cerrar sesión».
 */
import { h, safeEndpoint, safeImageSrc } from "../../core/dom";
import { initials } from "../../core/icons";
import { mergeLabels } from "../../core/labels";

export interface LockLabels {
  title: string;
  password: string;
  unlock: string;
  wrong: string;
  logout: string;
  locked: string;
  /** Error de red o del servidor (no cuenta como intento fallido). */
  error?: string;
  /** Tras 5 intentos fallidos; `{s}` son los segundos de espera. */
  wait?: string;
  /** Sin `verify` ni `endpoint` válido. */
  unavailable?: string;
}
export interface LockOptions {
  user: { name: string; email?: string; avatar?: string; initials?: string };
  /** POST {password} → 200 desbloquea, 401 clave mala. Mismo origen (safeEndpoint). */
  endpoint?: string;
  /** Alternativa a `endpoint`: la app verifica. */
  verify?: (password: string) => Promise<boolean>;
  labels?: Partial<LockLabels>;
  locale?: string;
  /** «Cerrar sesión» desde la pantalla de bloqueo. */
  onLogout?: () => void;
}

export const LOCK_LABELS: Required<LockLabels> = {
  title: "Pantalla bloqueada",
  password: "Contraseña",
  unlock: "Desbloquear",
  wrong: "Contraseña incorrecta.",
  logout: "Cerrar sesión",
  locked: "Pantalla bloqueada · desde las {time}",
  error: "No se pudo verificar. Intenta de nuevo.",
  wait: "Demasiados intentos. Espera {s} s para intentar de nuevo.",
  unavailable: "Esta pantalla no se puede desbloquear aquí. Cierra sesión para continuar.",
};

/** Marcador en `sessionStorage`: `«fallos»:«espera hasta (ms)»`. Sobrevive a una recarga. */
export const LOCK_KEY = "nx-locked";
/** Intentos fallidos antes de la primera espera (30 s, y se duplica hasta 15 min). */
export const LOCK_TRIES = 5;

/** El candado del avatar (constante, no un dato). `glyph()` del núcleo arrastraría su registro. */
const LOCK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect width="16" height="11" x="4" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

let current: Promise<void> | null = null;
let seq = 0;

function store(v: string | null): void {
  try {
    if (v === null) sessionStorage.removeItem(LOCK_KEY);
    else sessionStorage.setItem(LOCK_KEY, v);
  } catch {
    /* sin almacenamiento (modo privado, bloqueado): el bloqueo no sobrevive a una recarga */
  }
}

function stored(): string | null {
  try {
    return sessionStorage.getItem(LOCK_KEY);
  } catch {
    return null;
  }
}

/** La página se recargó estando bloqueada: `<nx-account>` debe volver a bloquear al conectarse. */
export function lockedOnLoad(): boolean {
  return stored() !== null;
}

export function isLocked(): boolean {
  return current !== null;
}

/** La espera tras `fails` intentos fallidos, en ms (0 si todavía no toca). */
export function lockWait(fails: number): number {
  return fails < LOCK_TRIES ? 0 : Math.min(30_000 * 2 ** (fails - LOCK_TRIES), 900_000);
}

/** Bloquea la pantalla; la promesa se resuelve al desbloquear. Si ya está bloqueada, devuelve la misma promesa. */
export function nxLock(opts: LockOptions): Promise<void> {
  if (current) return current;
  if (typeof document === "undefined") return Promise.resolve();
  const L = mergeLabels(LOCK_LABELS, opts.labels);
  const user = opts.user ?? { name: "" };
  const name = String(user.name ?? "");
  const url = opts.endpoint ? safeEndpoint(opts.endpoint) : undefined;
  const can = typeof opts.verify === "function" || !!url;
  const root = document.documentElement;
  const prev = document.activeElement as HTMLElement | null;
  const id = `nx-lock${++seq}`;
  // Lo que quedó de antes de recargar: la espera sigue corriendo.
  const [f0, u0] = (stored() ?? "").split(":").map(Number);
  let fails = f0 || 0;
  let until = u0 || 0;
  let busy = false;
  let leaving = false;
  let timer = 0;
  let native = false;
  let resolve!: () => void;
  const inerted: Element[] = [];

  // La hora en el locale pedido, o el `lang` de la página, o «es-CO» (uno inválido lanza: «es-CO»).
  const at = (l: string) => new Date().toLocaleTimeString(l, { hour: "numeric", minute: "2-digit" });
  let time: string;
  try {
    time = at(opts.locale || root.lang || "es-CO");
  } catch {
    time = at("es-CO");
  }

  const src = safeImageSrc(user.avatar);
  const ini = String(user.initials || initials(name)).slice(0, 3);
  const img = src ? h("img", { src, alt: "", referrerpolicy: "no-referrer", decoding: "async" }) : null;
  img?.addEventListener("error", () => img.replaceWith(ini));
  const input = h("input", {
    class: "nx-lock__input",
    id: `${id}-p`,
    type: "password",
    name: "password",
    autocomplete: "current-password",
    autocapitalize: "off",
    spellcheck: "false",
    "aria-describedby": `${id}-m`,
    disabled: !can,
  });
  const msg = h("p", { class: "nx-lock__msg", id: `${id}-m`, role: "alert" });
  const unlock = h("button", { type: "submit", class: "nx-lock__unlock" }, L.unlock);
  const logout = opts.onLogout ? h("button", { type: "button", class: "nx-lock__logout" }, L.logout) : null;
  // `method="post"` sin `action`: si el JS fallara, la clave nunca sale en la URL.
  const avatar = h("span", { class: "nx-lock__avatar", "aria-hidden": "true" }, img ?? ini);
  avatar.insertAdjacentHTML("beforeend", LOCK);
  const form = h(
    "form",
    { class: "nx-lock__card", method: "post", novalidate: true },
    avatar,
    h("h2", { class: "nx-lock__name", id: `${id}-n` }, name),
    user.email ? h("p", { class: "nx-lock__email" }, String(user.email)) : null,
    h("p", { class: "nx-lock__since", id: `${id}-s` }, L.locked.replace("{time}", time)),
    // Para el gestor de contraseñas: a qué cuenta pertenece la clave.
    h("input", { type: "text", name: "username", autocomplete: "username", value: String(user.email || name), hidden: true, tabindex: -1, "aria-hidden": "true" }),
    h("label", { class: "nx-lock__label", for: input.id }, L.password),
    input,
    msg,
    can && unlock,
    logout,
  );
  const dlg = h("dialog", { class: "nx-lock", "aria-label": L.title, "aria-describedby": `${id}-n ${id}-s` }, form);

  const promise = new Promise<void>((r) => (resolve = r));
  current = promise;
  const active = () => current === promise;
  const say = (text: string) => (msg.textContent = text);
  const emit = (locked: boolean) => document.dispatchEvent(new CustomEvent("nx-lock-change", { detail: { locked }, bubbles: true }));
  const persist = () => store(`${fails}:${until}`);
  const focus = () => (can ? input : (logout ?? dlg)).focus({ preventScroll: true });

  /** Botón e input ocupados (nunca `disabled`: el foco se perdería en `body`). */
  const paint = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    clearTimeout(timer);
    input.readOnly = busy || left > 0;
    unlock.setAttribute("aria-disabled", String(busy || left > 0));
    unlock.toggleAttribute("aria-busy", busy);
    unlock.textContent = left > 0 ? `${L.unlock} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : L.unlock;
    if (left > 0) timer = window.setTimeout(paint, 1000);
    else if (msg.dataset.wait) {
      delete msg.dataset.wait;
      say("");
    }
  };
  const waitMsg = () => {
    msg.dataset.wait = "1";
    say(L.wait.replace("{s}", String(Math.ceil((until - Date.now()) / 1000))));
  };

  async function check(pw: string): Promise<0 | 1 | 2> {
    try {
      if (opts.verify) return (await opts.verify(pw)) === true ? 0 : 1;
      // `redirect: "error"`: una sesión vencida que redirige al login (200) no desbloquea.
      const res = await fetch(url!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        body: JSON.stringify({ password: pw }),
      });
      return res.ok ? 0 : res.status === 401 || res.status === 403 ? 1 : 2;
    } catch {
      return 2;
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy || leaving || !can || until > Date.now()) return;
    const pw = input.value;
    input.value = "";
    if (!pw) return;
    busy = true;
    input.removeAttribute("aria-invalid");
    say("");
    paint();
    const r = await check(pw);
    busy = false;
    if (!active()) return;
    if (r === 0) return release();
    if (r === 1) {
      fails++;
      until = Date.now() + lockWait(fails);
      persist();
      input.setAttribute("aria-invalid", "true");
      input.classList.remove("is-wrong");
      void input.offsetWidth;
      input.classList.add("is-wrong");
      if (until > Date.now()) waitMsg();
      else say(L.wrong);
    } else say(L.error);
    paint();
    input.focus({ preventScroll: true });
  });

  logout?.addEventListener("click", () => {
    if (leaving) return;
    leaving = true;
    input.value = "";
    logout.setAttribute("aria-disabled", "true");
    // La próxima sesión en esta pestaña no arranca bloqueada.
    store(null);
    // Si falla, o la página sigue aquí 10 s después, se puede volver a intentar (y sigue bloqueada).
    const again = () => {
      if (!active() || !leaving) return;
      leaving = false;
      logout.removeAttribute("aria-disabled");
      persist();
    };
    let r: unknown;
    try {
      r = opts.onLogout!();
    } catch (err) {
      console.error("[nx-lock] onLogout falló", err);
      return again();
    }
    // Una app de una sola página devuelve una promesa: al cumplirse ya cambió su vista, y la pantalla
    // se quita. Si `onLogout` navega (lo normal), la pantalla sigue tapando hasta que la página se va.
    if (r && typeof (r as Promise<void>).then === "function") (r as Promise<void>).then(() => active() && release(), again);
    else setTimeout(again, 10_000);
  });

  // Escape no cierra; lo que se teclea no llega a los atajos de la app (Ctrl+Z de los avisos, la
  // paleta de comandos, el Escape de un <nx-dialog> abierto debajo), ni el foco a su trampa.
  dlg.addEventListener("cancel", (e) => e.preventDefault());
  dlg.addEventListener("keydown", (e) => e.stopPropagation());
  dlg.addEventListener("focusin", (e) => e.stopPropagation());
  // Chrome cierra igual con un segundo Escape seguido (CloseWatcher) o alguien llama `close()`: vuelve.
  dlg.addEventListener("close", () => active() && show());
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") e.preventDefault();
    if (!dlg.contains(e.target as Node)) e.stopPropagation();
  };
  // Si la app vacía `body` (o un framework lo repinta), el bloqueo vuelve; lo que se agregue mientras
  // tanto también queda inerte si no hay modal nativo.
  const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(() => (dlg.isConnected ? inertAll() : show())) : null;

  function inertAll(): void {
    if (native) return;
    for (const el of document.body.children) {
      if (el !== dlg && !el.hasAttribute("inert")) {
        el.setAttribute("inert", "");
        inerted.push(el);
      }
    }
  }

  function show(): void {
    if (!dlg.isConnected) {
      // Sacado del DOM, un modal sale de la capa superior pero conserva `open`.
      dlg.removeAttribute("open");
      document.body.append(dlg);
    }
    try {
      if (!dlg.open) dlg.showModal();
      native = dlg.open;
    } catch {
      /* sin `showModal`: `inert` en el resto de `body` */
    }
    if (!dlg.open) dlg.setAttribute("open", "");
    inertAll();
    focus();
  }

  function release(): void {
    current = null;
    clearTimeout(timer);
    mo?.disconnect();
    removeEventListener("keydown", onKey, true);
    store(null);
    const done = () => {
      dlg.remove();
      for (const el of inerted.splice(0)) el.removeAttribute("inert");
      root.removeAttribute("data-nx-locked");
      if (prev?.isConnected) prev.focus?.({ preventScroll: true });
      emit(false);
      resolve();
    };
    // Con View Transitions, la pantalla se funde con la app (el diálogo ya no está en el DOM nuevo).
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void>; ready: Promise<void> } };
    if (doc.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      try {
        const t = doc.startViewTransition(done);
        t.ready.catch(() => {});
        t.finished.catch(() => {});
        return;
      } catch {
        /* abajo */
      }
    }
    done();
  }

  root.setAttribute("data-nx-locked", "");
  addEventListener("keydown", onKey, true);
  show();
  mo?.observe(document.body, { childList: true });
  if (!can) {
    say(L.unavailable);
    console.warn("[nx-lock] sin `verify` ni `endpoint` del mismo origen: la pantalla no se puede desbloquear");
  }
  persist();
  if (until > Date.now()) waitMsg();
  paint();
  emit(true);
  return promise;
}
