/**
 * Adaptador BDUI (opcional): convierte nodos `{component, props}` —la forma que usa nx32— en
 * elementos de la librería. Cada componente declara qué props acepta: una clave que no está en
 * la lista se ignora, así un payload nunca asigna `innerHTML`, `__proto__` ni nada parecido.
 */
export interface BduiNode {
  component: string;
  props?: Record<string, unknown>;
}

interface Entry {
  tag: string;
  props: readonly string[];
}

const registry = new Map<string, Entry>([
  ["SideMenu", { tag: "nx-sidemenu", props: ["items", "active", "collapsed", "collapsible", "autoCollapse", "labels"] }],
  ["Select", { tag: "nx-select", props: ["options", "fields", "value", "selection", "multiple", "placeholder", "source", "name", "required", "disabled", "clearable", "avatar", "labels", "limit"] }],
  ["DocCapture", { tag: "nx-doc-capture", props: ["schema", "endpoint", "action", "reviewBelow", "labels", "accept"] }],
  ["Grid", { tag: "nx-grid", props: ["columns", "rows", "filters", "sort", "source", "aiEndpoint", "nlEndpoint", "groupBy", "rowKey", "facetsOpen", "filename", "locale", "selectable", "selected", "labels"] }],
  ["Agent", { tag: "nx-agent", props: ["endpoint", "tools", "context", "suggestions", "labels"] }],
  ["AIAnswer", { tag: "nx-ai-answer", props: ["endpoint", "method", "question", "placeholder", "suggestions", "context", "labels", "feedback"] }],
  ["Command", { tag: "nx-command", props: ["items", "menu", "source", "agent", "hotkey", "placeholder", "storage", "limit", "labels"] }],
  ["Explain", { tag: "nx-explain", props: ["endpoint", "method", "explanation", "context", "labels"] }],
  ["Inbox", { tag: "nx-inbox", props: ["items", "labels", "undo", "requireReason", "heading"] }],
  ["Survey", { tag: "nx-survey", props: ["questions", "answers", "results", "labels", "heading", "description", "action", "storage"] }],
  ["Number", { tag: "nx-number", props: ["value", "min", "max", "step", "format", "currency", "decimals", "words", "name", "required", "disabled", "readonly", "placeholder", "align", "label", "locale", "labels"] }],
  ["Kanban", { tag: "nx-kanban", props: ["columns", "cards", "labels", "heading", "undo", "busy"] }],
  ["History", { tag: "nx-history", props: ["record", "fields", "events", "source", "user", "undo", "heading", "labels"] }],
  ["DateRange", { tag: "nx-date-range", props: ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "label", "placeholder", "labels"] }],
  ["PasteFill", { tag: "nx-paste-fill", props: ["fields", "endpoint", "reviewBelow", "for", "labels"] }],
  ["Presence", { tag: "nx-presence", props: ["me", "channel", "source", "for", "idle", "max", "labels"] }],
  ["WhatIf", { tag: "nx-what-if", props: ["inputs", "outputs", "series", "scenarios", "values", "endpoint", "debounce", "heading", "locale", "labels"] }],
  ["Trend", { tag: "nx-trend", props: ["series", "anomalies", "heading", "kind", "format", "currency", "height", "detect", "explainEndpoint", "busy", "locale", "labels"] }],
  ["Scan", { tag: "nx-scan", props: ["mode", "formats", "source", "muted", "autostart", "wedge", "items", "labels", "locale"] }],
  ["Sync", { tag: "nx-sync", props: ["ping", "fields", "labels"] }],
  ["Button", { tag: "nx-button", props: ["label", "icon", "variant", "type", "disabled", "logMode", "stream", "method", "labels"] }],
]);

/** Props que nunca se aceptan, ni en un componente propio: HTML crudo, manejadores y prototipos. */
const FORBIDDEN = /^(innerHTML|outerHTML|srcdoc|__proto__|constructor|prototype)$/i;
/** Un manejador de evento de verdad (`onclick`), no una prop que empieza igual (`online`). */
const isHandler = (k: string) => /^on/i.test(k) && (typeof HTMLElement === "undefined" || k.toLowerCase() in HTMLElement.prototype);
const forbidden = (k: string) => FORBIDDEN.test(k) || isHandler(k);

/** Props que llevan una URL a la que el componente pide datos o envía algo. El agente las quita de
 *  lo que muestra el modelo (`nx_show`): una respuesta del modelo no elige a dónde van los datos. */
export const URL_PROPS: ReadonlySet<string> = new Set(["endpoint", "action", "source", "aiEndpoint", "nlEndpoint", "explainEndpoint", "channel", "stream", "ping", "href", "url"]);

/** Registra un componente propio (o un alias) para `render`. Solo elementos personalizados (con
 *  guion): un `<a>` o un `<iframe>` con props de un payload se saltarían el saneo de URLs. */
export function registerComponent(name: string, tag: string, props: readonly string[]): void {
  if (!/^[a-z][a-z0-9._]*-[a-z0-9._-]*$/.test(tag)) throw new Error(`[nx-ui] BDUI: "${tag}" no es un elemento personalizado`);
  const bad = props.filter(forbidden);
  if (bad.length) throw new Error(`[nx-ui] BDUI: props no permitidas: ${bad.join(", ")}`);
  registry.set(name, { tag, props });
}

/** El componente BDUI está registrado (`render` lo sabe pintar). */
export function hasComponent(name: string): boolean {
  return registry.has(name);
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
    if (typeof customElements !== "undefined" && !customElements.get(entry.tag)) {
      console.warn(`[nx-ui] <${entry.tag}> no está definido: importa su módulo (nx-ui/…) antes de pintar ${n.component}`);
    }
    const el = document.createElement(entry.tag) as unknown as Record<string, unknown> & Element;
    for (const [k, v] of Object.entries(n.props ?? {})) {
      if (entry.props.includes(k) && !forbidden(k)) el[k] = v;
      else console.warn(`[nx-ui] ${n.component}: prop ignorada "${k}"`);
    }
    out.push(el);
  }
  target.replaceChildren(...out);
  return out;
}
