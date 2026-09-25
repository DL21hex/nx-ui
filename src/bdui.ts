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
  ["Survey", { tag: "nx-survey", props: ["questions", "answers", "results", "labels", "heading", "description", "action", "storage", "layout", "echo"] }],
  ["Number", { tag: "nx-number", props: ["value", "min", "max", "step", "format", "currency", "decimals", "words", "name", "required", "disabled", "readonly", "placeholder", "align", "label", "locale", "labels"] }],
  ["Kanban", { tag: "nx-kanban", props: ["columns", "cards", "labels", "heading", "undo", "busy"] }],
  ["History", { tag: "nx-history", props: ["record", "fields", "events", "source", "user", "undo", "heading", "labels"] }],
  ["DateRange", { tag: "nx-date-range", props: ["value", "start", "end", "phrase", "presets", "compare", "min", "max", "today", "fiscalStart", "weekStart", "name", "required", "disabled", "label", "placeholder", "labels"] }],
  ["PasteFill", { tag: "nx-paste-fill", props: ["fields", "endpoint", "reviewBelow", "for", "labels"] }],
  ["Presence", { tag: "nx-presence", props: ["me", "channel", "source", "for", "idle", "max", "labels"] }],
  ["WhatIf", { tag: "nx-what-if", props: ["inputs", "outputs", "series", "scenarios", "values", "endpoint", "debounce", "heading", "locale", "labels"] }],
  ["Button", { tag: "nx-button", props: ["label", "icon", "variant", "type", "disabled", "logMode", "stream", "method", "labels"] }],
]);

/** Registra un componente propio (o un alias) para `render`. */
export function registerComponent(name: string, tag: string, props: readonly string[]): void {
  registry.set(name, { tag, props });
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
    const el = document.createElement(entry.tag) as unknown as Record<string, unknown> & Element;
    for (const [k, v] of Object.entries(n.props ?? {})) {
      if (entry.props.includes(k)) el[k] = v;
      else console.warn(`[nx-ui] ${n.component}: prop ignorada "${k}"`);
    }
    out.push(el);
  }
  target.replaceChildren(...out);
  return out;
}
