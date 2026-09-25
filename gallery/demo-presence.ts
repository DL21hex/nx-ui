/**
 * Demo de `<nx-presence>`: el pedido OC-2291 abierto por varias personas a la vez. Cada pestaña
 * es alguien distinto (un nombre al azar del equipo de compras); con «Abrir otra pestaña» se ven
 * entrar, moverse entre campos y escribir, por `BroadcastChannel`, sin servidor. Para quien no
 * abra otra pestaña (y para las pruebas), «Simular compañeros» hace entrar a dos personas de
 * mentira que recorren el formulario.
 *
 * La demo, además, comparte los valores del formulario entre pestañas (otro canal, suyo): así se
 * ve por qué importa el aviso de «tus cambios podrían pisar los suyos».
 */
import { presenceHue, type NxPresence, type PresenceEvent, type PresenceUser } from "../src/components/presence/index";
import "./pages/presence.css";

/** El equipo que abre la orden: cada pestaña toma uno al azar. */
export const PRESENCE_TEAM: PresenceUser[] = [
  { id: "ana-restrepo", name: "Ana Restrepo" },
  { id: "hector-pineda", name: "Héctor Pineda" },
  { id: "mariana-rios", name: "Mariana Ríos" },
  { id: "julian-ortiz", name: "Julián Ortiz" },
  { id: "laura-gomez", name: "Laura Gómez" },
  { id: "camilo-suarez", name: "Camilo Suárez" },
  { id: "valentina-cardenas", name: "Valentina Cárdenas" },
  { id: "santiago-mejia", name: "Santiago Mejía" },
];

/** La orden como está hoy. */
export const PRESENCE_ORDER = {
  proveedor: "Aceros del Caribe S.A.S.",
  monto: "47.980.000",
  entrega: "2026-10-06",
  notas: "Lámina HR de 3 mm (40 unidades) y perfilería en C de 4 pulgadas para la línea 2. Entregar en la portería 2 de la planta Malambo, con cita previa.",
};

const FIELDS = ["proveedor", "monto", "entrega", "notas"] as const;
const rand = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
const tabId = () => Math.random().toString(36).slice(2, 8);

/**
 * Dos compañeros de mentira: entran, enfocan campos, escriben, se quedan quietos y salen, todo por
 * `push()`. Los primeros pasos son fijos (las pruebas los esperan); después, al azar.
 * Devuelve la función que los hace salir.
 */
export function simulatePeers(el: NxPresence, people: PresenceUser[]): () => void {
  const timers = new Set<number>();
  const at = (ms: number, fn: () => void) => {
    const t = window.setTimeout(() => (timers.delete(t), fn()), ms);
    timers.add(t);
  };
  const send = (type: PresenceEvent["type"], user: PresenceUser, extra: Partial<PresenceEvent> = {}) => el.push({ type, user, ...extra });
  /** Escribir un rato en un campo: `lock` y varios `typing`. */
  const write = (user: PresenceUser, field: string, from: number, beats = 3) => {
    at(from, () => send("focus", user, { field }));
    at(from + 500, () => send("lock", user, { field }));
    for (let i = 0; i < beats; i++) at(from + 600 + i * 1000, () => send("typing", user, { field }));
  };
  const [a, b] = people;
  at(300, () => send("join", a));
  at(800, () => send("join", b));
  write(a, "monto", 1400);
  at(2200, () => send("focus", b, { field: "notas" }));
  at(5200, () => send("blur", a, { field: "monto" }));
  write(b, "notas", 5600, 4);
  at(7000, () => send("focus", a, { field: "entrega" }));
  // Después, al azar: cada 2,5 s alguien hace algo.
  let busy = false;
  const loop = () => {
    const who = rand(people);
    const r = Math.random();
    if (r < 0.45) write(who, rand(FIELDS), 0, 2 + Math.floor(Math.random() * 3));
    else if (r < 0.75) send("focus", who, { field: rand(FIELDS) });
    else if (r < 0.9) send("blur", who);
    else send("heartbeat", who, { field: null, idle: true });
    at(2200 + Math.random() * 1600, loop);
  };
  at(11_000, loop);
  // Latidos, para que no se vayan solos.
  const beat = window.setInterval(() => !busy && people.forEach((p) => send("heartbeat", p)), 10_000);
  return () => {
    busy = true;
    clearInterval(beat);
    timers.forEach(clearTimeout);
    timers.clear();
    people.forEach((p) => send("leave", p));
  };
}

export function mountPresenceDemo(root: HTMLElement): void {
  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const el = $<NxPresence>("#presence-demo");
  const form = $<HTMLFormElement>("#presence-form");
  const log = $<HTMLOListElement>("#presence-log");
  const add = (text: string, replace?: string) => {
    // Escribir no llena el registro: el último «typing» reemplaza al anterior.
    if (replace && log.firstElementChild?.textContent?.startsWith(replace)) log.firstElementChild.remove();
    const li = document.createElement("li");
    li.textContent = text;
    log.prepend(li);
    while (log.children.length > 6) log.lastElementChild!.remove();
  };

  // ---------------------------------------------------------------- quién es esta pestaña
  let me: PresenceUser = PRESENCE_TEAM[0];
  const be = (who: PresenceUser) => {
    me = { id: `${who.id}-${tabId()}`, name: who.name };
    el.me = me;
    $<HTMLElement>("#presence-me").textContent = me.name;
    const face = $<HTMLElement>("#presence-me-face");
    face.textContent = me.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
    face.style.setProperty("--h", String(presenceHue(me.id)));
  };
  be(rand(PRESENCE_TEAM));
  // Si al llegar ya hay alguien con el mismo nombre (en otra pestaña), esta toma otro.
  setTimeout(() => {
    const taken = new Set(el.users.map((u) => u.name));
    const free = PRESENCE_TEAM.filter((p) => !taken.has(p.name));
    if (el.isConnected && taken.has(me.name) && free.length) be(rand(free));
  }, 1200);

  for (const [k, v] of Object.entries(PRESENCE_ORDER)) (form.elements.namedItem(k) as HTMLInputElement).value = v;

  el.addEventListener("nx-presence-local", (e) => {
    const d = e.detail;
    add(`nx-presence-local → ${d.type}${d.field ? ` · ${d.field}` : ""}${d.idle ? " · inactivo" : ""}`, d.type === "typing" || d.type === "heartbeat" ? `nx-presence-local → ${d.type}` : undefined);
  });
  el.addEventListener("nx-presence-change", (e) => {
    const names = e.detail.users.map((u) => u.name.split(" ")[0]);
    add(`nx-presence-change → ${names.length ? names.join(", ") : "solo tú"}`, "nx-presence-change");
  });

  let sim: (() => void) | null = null;

  // ---------------------------------------------------------------- otra pestaña
  $<HTMLButtonElement>("#presence-open").addEventListener("click", () => window.open(location.href, "_blank"));

  // Los valores viajan entre pestañas por un canal de la demo (no del componente).
  if (typeof BroadcastChannel !== "undefined") {
    const values = new BroadcastChannel("nx-presence-demo:oc-2291");
    form.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name) values.postMessage({ name: t.name, value: t.value });
    });
    values.onmessage = (e) => {
      const { name, value } = (e.data ?? {}) as { name?: string; value?: string };
      const f = name ? (form.elements.namedItem(name) as HTMLInputElement | null) : null;
      if (f && typeof value === "string") f.value = value;
    };
    // Al salir de la página (a otra de la galería), el canal se cierra.
    const stop = new MutationObserver(() => !el.isConnected && (values.close(), stop.disconnect(), sim?.()));
    stop.observe(root, { childList: true });
  }

  // ---------------------------------------------------------------- compañeros de mentira
  const toggle = $<HTMLButtonElement>("#presence-sim");
  toggle.addEventListener("click", () => {
    if (sim) {
      sim();
      sim = null;
    } else {
      const others = PRESENCE_TEAM.filter((p) => p.name !== me.name);
      const a = others.splice(Math.floor(Math.random() * others.length), 1)[0];
      const b = rand(others);
      sim = simulatePeers(el, [
        { id: `sim-${a.id}`, name: a.name },
        { id: `sim-${b.id}`, name: b.name },
      ]);
    }
    toggle.setAttribute("aria-pressed", String(!!sim));
    toggle.lastElementChild!.textContent = sim ? "Detener la simulación" : "Simular compañeros";
  });
}
