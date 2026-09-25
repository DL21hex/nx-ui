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

const allowed = new Set<string>();

/**
 * Orígenes extra a los que los componentes pueden pedir datos (`allowOrigins("https://api.miapp.co")`).
 * Por defecto solo el de la página: un `endpoint` que llega en un payload BDUI no puede mandar
 * filas, textos pegados ni el contexto de la app a un tercero.
 */
export function allowOrigins(...origins: string[]): void {
  for (const o of origins) {
    try {
      allowed.add(new URL(o).origin);
    } catch {
      console.warn(`[nx-ui] origen inválido: ${o}`);
    }
  }
}

/**
 * La URL de un `fetch` si es segura, o `undefined`: http(s) del mismo origen que la página (o de
 * uno permitido con `allowOrigins`). Las rutas relativas pasan; `//otro.com` no, porque resuelve a
 * otro origen. Devuelve la URL tal como vino (sin espacios alrededor).
 */
export function safeEndpoint(url: unknown): string | undefined {
  const href = safeHref(url);
  if (!href || typeof location === "undefined") return href;
  let u: URL;
  try {
    u = new URL(href, location.href);
  } catch {
    return undefined;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
  if (u.origin !== location.origin && !allowed.has(u.origin)) {
    console.warn(`[nx-ui] endpoint de otro origen bloqueado: ${u.origin} (ver allowOrigins)`);
    return undefined;
  }
  // Tal como vino (recortada): `URL` codificaría las plantillas (`/items/{code}` → `%7Bcode%7D`).
  return href;
}

/** Una imagen de datos remotos (el avatar de otra persona): `https:` o del mismo origen; nunca
 *  `http:` en claro ni otros esquemas. Quien la pinte debe poner `referrerpolicy="no-referrer"`. */
export function safeImageSrc(src: unknown): string | undefined {
  const href = safeHref(src);
  if (!href || typeof location === "undefined") return href;
  try {
    const u = new URL(href, location.href);
    if (u.origin === location.origin || u.protocol === "https:") return u.href;
  } catch {
    /* inválida */
  }
  return undefined;
}
