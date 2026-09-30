/**
 * Adaptador BDUI (opcional): convierte nodos `{component, props}` —la forma que usa nx32— en
 * elementos de la librería. Las props que acepta cada componente salen de su propia clase: las que
 * tienen setter. No hay una segunda lista que mantener, y una clave sin setter (`innerHTML`,
 * `__proto__`, un error de tipeo) se ignora y se avisa por consola.
 */
import { setterOf } from "./core/define";

export interface BduiNode {
  component: string;
  props?: Record<string, unknown>;
}

interface Entry {
  tag: string;
  /** Lista explícita (`registerComponent` con props); sin ella, los setters de la clase. */
  props?: readonly string[];
}

/** Nombre BDUI → etiqueta (`nx-…`). */
const registry = new Map<string, Entry>(
  Object.entries({
    SideMenu: "sidemenu",
    Select: "select",
    DocCapture: "doc-capture",
    Grid: "grid",
    Agent: "agent",
    AIAnswer: "ai-answer",
    Command: "command",
    Explain: "explain",
    Inbox: "inbox",
    Survey: "survey",
    Number: "number",
    Kanban: "kanban",
    History: "history",
    DateRange: "date-range",
    PasteFill: "paste-fill",
    Presence: "presence",
    WhatIf: "what-if",
    Trend: "trend",
    Scan: "scan",
    Sync: "sync",
    Keytips: "keytips",
    Import: "import",
    Guard: "guard",
    Handoff: "handoff",
    Award: "award",
    Account: "account",
    Launcher: "launcher",
    Cards: "cards",
    Print: "print",
    Signature: "signature",
    Planner: "planner",
    Review: "review",
    Voice: "voice",
    Thread: "thread",
    Checklist: "checklist",
    Recurrence: "recurrence",
    Jobs: "jobs",
    Button: "button",
  }).map(([name, tag]) => [name, { tag: `nx-${tag}` }]),
);

/** Props que nunca se aceptan, ni en un componente propio: HTML crudo, manejadores y prototipos. */
const FORBIDDEN = /^(innerHTML|outerHTML|srcdoc|__proto__|constructor|prototype)$/i;
/** Un manejador de evento de verdad (`onclick`), no una prop que empieza igual (`online`). */
const isHandler = (k: string) => /^on/i.test(k) && (typeof HTMLElement === "undefined" || k.toLowerCase() in HTMLElement.prototype);
const forbidden = (k: string) => FORBIDDEN.test(k) || isHandler(k);

/** Props que llevan una URL a la que el componente pide datos o envía algo. El agente las quita de
 *  lo que muestra el modelo (`nx_show`): una respuesta del modelo no elige a dónde van los datos. */
export const URL_PROPS: ReadonlySet<string> = new Set(["endpoint", "action", "source", "aiEndpoint", "nlEndpoint", "explainEndpoint", "channel", "stream", "ping", "href", "url", "handoff", "peopleSource", "refsSource"]);

/** Registra un componente propio (o un alias) para `render`. Solo elementos personalizados (con
 *  guion): un `<a>` o un `<iframe>` con props de un payload se saltarían el saneo de URLs. Sin
 *  `props`, acepta los setters de la clase, igual que los de la librería. */
export function registerComponent(name: string, tag: string, props?: readonly string[]): void {
  if (!/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(tag)) throw new Error(`[nx-ui] BDUI: "${tag}" no es un elemento personalizado`);
  const bad = props?.filter(forbidden) ?? [];
  if (bad.length) throw new Error(`[nx-ui] BDUI: props no permitidas: ${bad.join(", ")}`);
  registry.set(name, { tag, props });
}

/** El componente BDUI está registrado (`render` lo sabe pintar). */
export function hasComponent(name: string): boolean {
  return registry.has(name);
}

/** Acepta `key`: está en la lista explícita o la clase tiene un setter propio (no uno de
 *  `HTMLElement`: `textContent` o `id` no vienen de un payload). */
function accepts(entry: Entry, ctor: CustomElementConstructor | undefined, key: string): boolean {
  if (forbidden(key)) return false;
  if (entry.props) return entry.props.includes(key);
  return !!ctor && !!setterOf(ctor.prototype, key, HTMLElement.prototype);
}

/** Las props que acepta un componente registrado (vacío si su elemento aún no está definido). */
export function propsOf(name: string): string[] {
  const entry = registry.get(name);
  if (!entry) return [];
  if (entry.props) return entry.props.filter((k) => !forbidden(k));
  const out = new Set<string>();
  const ctor = typeof customElements !== "undefined" ? customElements.get(entry.tag) : undefined;
  for (let p = ctor?.prototype; p && p !== HTMLElement.prototype; p = Object.getPrototypeOf(p)) {
    for (const k of Object.getOwnPropertyNames(p)) if (accepts(entry, ctor, k)) out.add(k);
  }
  return [...out];
}

/** Pinta los nodos dentro de `target`, reemplazando lo que tuviera. Devuelve los elementos creados. */
export function render(node: BduiNode | BduiNode[], target: Element): Element[] {
  const out: Element[] = [];
  for (const n of Array.isArray(node) ? node : [node]) {
    const entry = n && registry.get(n.component);
    if (!entry) {
      console.warn(`[nx-ui] componente BDUI desconocido: ${n?.component}`);
      continue;
    }
    const el = document.createElement(entry.tag) as unknown as Record<string, unknown> & HTMLElement;
    const assign = () => {
      const ctor = customElements.get(entry.tag);
      for (const [k, v] of Object.entries(n.props ?? {})) {
        if (accepts(entry, ctor, k)) el[k] = v;
        else console.warn(`[nx-ui] ${n.component}: prop ignorada "${k}"`);
      }
    };
    const defined = !!customElements.get(entry.tag);
    if (!defined) console.warn(`[nx-ui] <${entry.tag}> no está definido: importa su módulo (nx-ui/…) antes de pintar ${n.component}`);
    if (defined || entry.props) assign();
    else {
      // Sin la clase no se sabe qué acepta: las props esperan a que el módulo se cargue.
      void customElements.whenDefined(entry.tag).then(() => {
        customElements.upgrade(el);
        assign();
      });
    }
    out.push(el);
  }
  target.replaceChildren(...out);
  return out;
}
