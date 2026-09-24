/**
 * Constructor mínimo de DOM. Los textos van SIEMPRE como nodos de texto: los datos de un
 * componente BDUI vienen del backend y nunca se interpretan como HTML.
 */
type Child = Node | string | null | undefined | false;
type AttrValue = string | number | boolean | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, AttrValue> | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/**
 * El `href` si es seguro de pintar, o `undefined`. Pasan las rutas relativas y los esquemas
 * http(s), mailto y tel; se descarta todo lo demás (`javascript:`, `data:`, `vbscript:`…).
 * El esquema se evalúa como lo hace el navegador: ignorando espacios y caracteres de control
 * intercalados («java\tscript:»).
 */
export function safeHref(href: unknown): string | undefined {
  if (typeof href !== "string") return undefined;
  const trimmed = href.trim();
  if (!trimmed) return undefined;
  // eslint-disable-next-line no-control-regex
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed.replace(/[\u0000-\u0020\u007f]/g, ""));
  if (scheme && !ALLOWED_SCHEMES.has(scheme[1].toLowerCase())) return undefined;
  return trimmed;
}
