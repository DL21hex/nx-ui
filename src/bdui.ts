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
